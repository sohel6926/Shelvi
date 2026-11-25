import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { FirestoreCollections } from "../../shared/firestorePaths";
import { asNum, asStr, Doc } from "../../shared/coerce";
import { addDays, dayOfValue, formatDayTe, istTime, toDateValue } from "../../shared/istDate";
import { enqueueMessage } from "../../shared/outbox";
import { formatRupees } from "../../shared/templates";
import { readStats } from "../../stats/aggregate";
import { recomputeDays } from "../../stats/recompute";
import { checkInvoice } from "../../calc/checks";
import { round2 } from "../../calc/util";
import { AgentJob } from "../agentRun";
import { isLowStock, vehicleExpiries } from "../helpers";
import { bookingsOnDay, docsOf, openInvoices } from "./common";

export const OPEN_LEAD_STATUSES = ["new", "contacted", "tasting", "quoted"];

export const morningSummary: AgentJob = async (ctx) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const yesterday = addDays(ctx.today, -1);
  const [events, ySnap, dues, leads, inventory, pending, report, lastBackup] = await Promise.all([
    bookingsOnDay(ctx.today),
    db.collection(c.DAILY_STATS).doc(yesterday).get(),
    openInvoices(),
    docsOf(db.collection(c.LEADS).where("status", "in", OPEN_LEAD_STATUSES)),
    docsOf(db.collection(c.INVENTORY)),
    db.collection(c.MESSAGES_OUTBOX).where("status", "==", "needs-approval").get(),
    db.collection(c.INTEGRITY_REPORTS).doc(ctx.today).get(),
    db.collection(c.AGENT_SETTINGS).doc("backup").get(),
  ]);
  const vehicleSoon = vehicleExpiries(await docsOf(db.collection(c.VEHICLES)), ctx.today).soon;
  const y = readStats(ySnap.data() as Doc | undefined);
  const eventLines = events
    .map((b) => {
      const at = toDateValue(b.data.eventDate);
      return `• ${at ? istTime(at) : ""} ${asStr(b.data.customerNameSnapshot)} — ${asNum(b.data.guestCountConfirmed) || asNum(b.data.guestCount)} మంది, ${asStr(b.data.venue)}`;
    })
    .join("\n");
  const duesTotal = round2(dues.reduce((a, i) => a + asNum(i.data.balanceDue), 0));
  const followups = leads.filter((l) => {
    const day = dayOfValue(l.data.followUpDate);
    return day !== null && day <= ctx.today;
  }).length;
  const lowStock = inventory.filter((i) => isLowStock(i.data)).map((i) => asStr(i.data.name));
  const problems = report.exists ? (Array.isArray(report.data()?.problems) ? (report.data()?.problems as unknown[]).length : 0) : null;
  let integrity = problems === null ? "ఇంకా జరగలేదు" : problems === 0 ? "అన్నీ సరిగా ఉన్నాయి" : `${problems} తేడాలు — Reports లో చూడండి`;
  const backupStatus = (lastBackup.data()?.lastRun as { status?: string } | undefined)?.status;
  if (backupStatus === "failed") integrity += " | Backup విఫలమైంది!";
  const r = await enqueueMessage({
    audience: "owner",
    to: ctx.settings.ownerPhone,
    template: "owner.morningSummary",
    params: {
      date: formatDayTe(ctx.today),
      eventsToday: events.length,
      eventLines: eventLines || "-",
      yIncome: formatRupees(y.income),
      yCosts: formatRupees(round2(y.food + y.labour + y.other + y.ads)),
      yProfit: formatRupees(y.profit),
      duesTotal: formatRupees(duesTotal),
      duesCount: dues.length,
      followups,
      lowStock: lowStock.length ? lowStock.slice(0, 8).join(", ") : "లేదు",
      vehicleDocs: vehicleSoon.length ? vehicleSoon.slice(0, 5).map((v) => `${v.number} ${v.te}`).join(", ") : "లేదు",
      pendingApprovals: pending.size,
      integrity,
    },
    agentId: ctx.agentId,
    dedupeKey: `morningSummary_${ctx.today}`,
  });
  return { summary: `events ${events.length}, dues ${duesTotal}, integrity ${problems ?? "n/a"} → ${r}`, itemsHandled: 1, alerts: problems ? [`${problems} integrity problems`] : [] };
};

/** §10 for every invoice; writes integrityReports/{today}; also re-derives yesterday's and today's stats (self-heal). */
export const integrityCheck: AgentJob = async (ctx) => {
  const db = getFirestore();
  const invoices = await db.collection(FirestoreCollections.INVOICES).get();
  const problems: { type: string; docPath: string }[] = [];
  const docs = invoices.docs;
  for (let i = 0; i < docs.length; i += 20) {
    const chunk = docs.slice(i, i + 20);
    const pays = await Promise.all(chunk.map((d) => d.ref.collection(FirestoreCollections.PAYMENTS).get()));
    chunk.forEach((d, k) => {
      const inv = d.data() as Doc;
      const amounts = pays[k].docs.map((p) => asNum((p.data() as Doc).amount));
      // Refunds are negative payments by design; check the net so a refund is not reported as "negative".
      const list = amounts.some((a) => a < 0) ? [round2(amounts.reduce((a, b) => a + b, 0))] : amounts;
      for (const t of checkInvoice({ total: asNum(inv.totalAmount), amountPaid: asNum(inv.amountPaid), balanceDue: asNum(inv.balanceDue) }, list)) {
        problems.push({ type: t, docPath: d.ref.path });
      }
    });
  }
  await db.collection(FirestoreCollections.INTEGRITY_REPORTS).doc(ctx.today).set({ date: ctx.today, checked: docs.length, problems, runId: ctx.runId, createdAt: FieldValue.serverTimestamp() });
  await recomputeDays([addDays(ctx.today, -1), ctx.today]);
  return { summary: `${docs.length} invoices checked, ${problems.length} problems`, itemsHandled: docs.length, alerts: problems.slice(0, 20).map((p) => `${p.type} ${p.docPath}`) };
};
