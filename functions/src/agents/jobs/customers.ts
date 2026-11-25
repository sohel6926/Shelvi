import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { FirestoreCollections } from "../../shared/firestorePaths";
import { asArr, asNum, asStr } from "../../shared/coerce";
import { addDays, dayOfValue, formatDayTe, isoWeekday } from "../../shared/istDate";
import { alertOwner, enqueueMessage, EnqueueResult } from "../../shared/outbox";
import { formatRupees } from "../../shared/templates";
import { AgentJob } from "../agentRun";
import { timelineInputFor, timelineText } from "../helpers";
import { serviceTimeline } from "../../calc/timeline";
import { dayPlanFor, notifyKitchen } from "../../kitchen/eventPlan";
import { tomorrowText } from "../../kitchen/planRules";
import { bookingsOnDay, docsOf, getDoc, openInvoices } from "./common";
import { OPEN_LEAD_STATUSES } from "./summary";

function count(results: EnqueueResult[], s: EnqueueResult): number {
  return results.filter((r) => r === s).length;
}

/** Mondays: every unpaid invoice. Other days: invoices whose due date (event day) is today. Money → needs approval. */
export const duesCollector: AgentJob = async (ctx) => {
  const monday = isoWeekday(ctx.today) === 1;
  const invoices = (await openInvoices()).filter((i) => monday || dayOfValue(i.data.dueDate) === ctx.today);
  const results: EnqueueResult[] = [];
  const lines: string[] = [];
  for (const inv of invoices) {
    const customer = await getDoc(FirestoreCollections.CUSTOMERS, asStr(inv.data.customerId));
    const balance = asNum(inv.data.balanceDue);
    lines.push(`• ${asStr(inv.data.invoiceNumber)} ${asStr(inv.data.customerNameSnapshot) || asStr(customer?.name)}: ${formatRupees(balance)}`);
    results.push(
      await enqueueMessage({
        audience: "customer",
        to: customer?.phone,
        optIn: customer?.whatsappOptIn === true,
        lastInboundAt: customer?.whatsappLastInboundAt,
        moneyRelated: true,
        template: "customer.duesReminder",
        params: { name: asStr(customer?.name) || asStr(inv.data.customerNameSnapshot), invoiceNumber: asStr(inv.data.invoiceNumber), balance: formatRupees(balance), upiId: ctx.settings.upiId, phone: ctx.settings.phone },
        agentId: ctx.agentId,
        relatedType: "invoice",
        relatedId: inv.id,
        dedupeKey: `dues_${inv.id}_${ctx.today}`,
      }),
    );
  }
  if (lines.length) {
    await alertOwner(ctx.settings.ownerPhone, ctx.agentId, `బాకీలు (${lines.length}) — reminders మీ approval కోసం ఉన్నాయి`, lines.slice(0, 25).join("\n"), `duesOwner_${ctx.today}`);
  }
  return { summary: `${invoices.length} dues, ${count(results, "needs-approval")} reminders waiting for approval, ${count(results, "skipped-no-optin")} without WhatsApp consent`, itemsHandled: invoices.length, alerts: [] };
};

export const enquiryFollowup: AgentJob = async (ctx) => {
  const db = getFirestore();
  const leads = await docsOf(db.collection(FirestoreCollections.LEADS).where("status", "in", OPEN_LEAD_STATUSES));
  const due = leads.filter((l) => {
    const f = dayOfValue(l.data.followUpDate);
    return (f !== null && f <= ctx.today) || (l.data.status === "new" && !l.data.lastContactAt);
  });
  const results: EnqueueResult[] = [];
  const lines: string[] = [];
  for (const l of due) {
    const first = !l.data.lastContactAt;
    const eventDay = dayOfValue(l.data.eventDate);
    const r = await enqueueMessage({
      audience: "customer",
      to: l.data.phone,
      optIn: l.data.whatsappOptIn === true,
      lastInboundAt: l.data.whatsappLastInboundAt,
      firstContact: first,
      template: first ? "lead.firstContact" : "lead.followup",
      params: { name: asStr(l.data.name), eventDate: eventDay ? formatDayTe(eventDay) : "", phone: ctx.settings.phone },
      agentId: ctx.agentId,
      relatedType: "lead",
      relatedId: l.id,
      dedupeKey: first ? `leadFirst_${l.id}` : `leadFollowup_${l.id}_${dayOfValue(l.data.followUpDate) ?? ctx.today}`,
    });
    results.push(r);
    if (r === "queued") await db.collection(FirestoreCollections.LEADS).doc(l.id).update({ lastContactAt: FieldValue.serverTimestamp(), updatedBy: "system" });
    lines.push(`• ${asStr(l.data.name)} (${asStr(l.data.phone)}) — ${asStr(l.data.status)}${eventDay ? ", event " + formatDayTe(eventDay) : ""}`);
  }
  if (lines.length) await alertOwner(ctx.settings.ownerPhone, ctx.agentId, `ఈ రోజు follow-up చేయాల్సిన enquiries: ${lines.length}`, lines.slice(0, 25).join("\n"), `enquiryOwner_${ctx.today}`);
  return { summary: `${due.length} leads due; ${count(results, "queued")} follow-ups queued, ${count(results, "needs-approval")} first contacts waiting for approval`, itemsHandled: due.length, alerts: [] };
};

/** 3 days before: ask the customer to confirm guests. Day before (18:00): timeline to assigned staff + owner. */
export const eventReadiness: AgentJob = async (ctx) => {
  const in3 = await bookingsOnDay(addDays(ctx.today, 3));
  const tomorrowDay = addDays(ctx.today, 1);
  const tomorrow = await bookingsOnDay(tomorrowDay);
  const unconfirmed: string[] = [];
  for (const b of in3) {
    if (asNum(b.data.guestCountConfirmed) > 0) continue;
    const customer = await getDoc(FirestoreCollections.CUSTOMERS, asStr(b.data.customerId));
    unconfirmed.push(`• ${asStr(b.data.customerNameSnapshot)} — ${asNum(b.data.guestCount)} మంది`);
    await enqueueMessage({
      audience: "customer",
      to: customer?.phone,
      optIn: customer?.whatsappOptIn === true,
        lastInboundAt: customer?.whatsappLastInboundAt,
      template: "customer.guestCountConfirm",
      params: { name: asStr(customer?.name) || asStr(b.data.customerNameSnapshot), eventDate: formatDayTe(addDays(ctx.today, 3)), guests: asNum(b.data.guestCount), phone: ctx.settings.phone },
      agentId: ctx.agentId,
      relatedType: "booking",
      relatedId: b.id,
      dedupeKey: `guestConfirm_${b.id}`,
    });
  }
  if (unconfirmed.length) await alertOwner(ctx.settings.ownerPhone, ctx.agentId, `3 రోజుల్లో events — అతిథుల సంఖ్య ఇంకా ఖరారు కాలేదు (${unconfirmed.length})`, unconfirmed.join("\n"), `guestConfirmOwner_${ctx.today}`);

  let staffMsgs = 0;
  for (const b of tomorrow) {
    // §12 service timeline from serveTime / travelMinutes / mealType (contract Round 6 C).
    const pkgId = asStr(b.data.packageId) || asStr(b.data.menuPackageId);
    const pkg = pkgId ? await getDoc(FirestoreCollections.MENU_PACKAGES, pkgId) : undefined;
    const input = timelineInputFor(b.data, pkg, tomorrowDay);
    if (!input) continue;
    let steps;
    try {
      steps = serviceTimeline(input, ctx.settings.timelineDefaults ?? undefined);
    } catch {
      steps = serviceTimeline(input); // a bad settings override never stops the staff messages
    }
    const text = timelineText(steps, tomorrowDay);
    const params = { customer: asStr(b.data.customerNameSnapshot), venue: asStr(b.data.venue), eventTime: input.serveTime, guests: input.guests, timeline: text };
    for (const sid of asArr(b.data.assignedStaffIds).map(String)) {
      const staff = await getDoc(FirestoreCollections.STAFF, sid);
      const r = await enqueueMessage({ audience: "staff", to: staff?.phone, template: "staff.timeline", params, agentId: ctx.agentId, relatedType: "booking", relatedId: b.id, dedupeKey: `timeline_${b.id}_${sid}` });
      if (r === "queued") staffMsgs++;
    }
    await enqueueMessage({ audience: "owner", to: ctx.settings.ownerPhone, template: "staff.timeline", params, agentId: ctx.agentId, relatedType: "booking", relatedId: b.id, dedupeKey: `timeline_${b.id}_owner` });
  }
  // Round 8: at the day-before 6 PM step, an in-app note for admin + kitchen manager with tomorrow's day plan.
  let planNote = "";
  try {
    const dp = await dayPlanFor(tomorrowDay, null);
    const dishTotals = dp.dishes.filter((d) => d.total > 0);
    if (dp.events.length && dishTotals.length) {
      await notifyKitchen(`planTomorrow_${tomorrowDay}`, "plan-tomorrow", tomorrowText(dp.events.length, dishTotals), `/day-plan?date=${tomorrowDay}`, { day: tomorrowDay });
      planNote = `, day plan ${dishTotals.length} dishes`;
    }
  } catch (e) {
    planNote = `, day plan failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { summary: `${in3.length} events in 3 days (${unconfirmed.length} unconfirmed), ${tomorrow.length} tomorrow, ${staffMsgs} staff timelines${planNote}`, itemsHandled: in3.length + tomorrow.length, alerts: [] };
};

/** Day after the event, 11:00: thank-you + review request (opt-in customers only). */
export const feedbackReviews: AgentJob = async (ctx) => {
  const events = await bookingsOnDay(addDays(ctx.today, -1));
  // R10-5: the review request needs settings.googleReviewUrl — without it nothing goes to customers; the owner is told.
  if (!ctx.settings.googleReviewUrl) {
    if (events.length) await alertOwner(ctx.settings.ownerPhone, ctx.agentId, "Google review link లేదు", "Settings లో Google review link (googleReviewUrl) పెట్టండి — అప్పటి వరకు కస్టమర్లకు review అడిగే message వెళ్ళదు.", `reviewUrlMissing_${ctx.today.slice(0, 7)}`);
    return { summary: `${events.length} events yesterday — googleReviewUrl not set, no review requests`, itemsHandled: 0, alerts: events.length ? ["googleReviewUrl missing"] : [] };
  }
  const results: EnqueueResult[] = [];
  for (const b of events) {
    const customer = await getDoc(FirestoreCollections.CUSTOMERS, asStr(b.data.customerId));
    results.push(
      await enqueueMessage({
        audience: "customer",
        to: customer?.phone,
        optIn: customer?.whatsappOptIn === true,
        lastInboundAt: customer?.whatsappLastInboundAt,
        template: "customer.feedbackRequest",
        params: { name: asStr(customer?.name) || asStr(b.data.customerNameSnapshot), reviewUrl: ctx.settings.googleReviewUrl },
        agentId: ctx.agentId,
        relatedType: "booking",
        relatedId: b.id,
        dedupeKey: `feedback_${b.id}`,
      }),
    );
  }
  return { summary: `${events.length} events yesterday, ${count(results, "queued")} feedback requests queued`, itemsHandled: events.length, alerts: [] };
};

