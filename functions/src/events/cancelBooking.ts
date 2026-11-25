/**
 * Round 9 — order cancellation done properly (api-contract Round 9):
 *   cancelBooking { bookingId, reasonCode, reason, advance?, refundAmount?, refundMethod?, notifyCustomer? } (A; M own branch)
 *   restoreBooking { bookingId, reason } (A)
 *   postponeBooking { bookingId, newDate, reason? } (A; M own branch)
 *   getCancellationReport { month, branchId? } (A; M own branch)
 * Money maths: calc/cancellation (§19). Pure rules: events/cancelBookingRules.
 */
import { getFirestore, FieldValue, Timestamp, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { callable, ADMIN, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, optString, reqDay, reqId, reqMonth, reqOneOf, reqString } from "../shared/validate";
import { asArr, asNum, asObj, asStr, Doc, nonNeg } from "../shared/coerce";
import { assertAdminOrOwnBranch, CallerContext } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { MIN_REASON_LENGTH } from "../shared/overridePolicy";
import { dayOfValue, istAt, istNoon, istTime, monthRange, toDateValue, todayIST } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { formatRupees } from "../shared/templates";
import { applyPayment } from "../calc/payments";
import { round2 } from "../calc/util";
import { ADVANCE_CHOICES, AdvanceChoice, allocateRefund, CANCEL_REASON_TE, CANCEL_REASONS, CancelReasonCode, cancellationMoney } from "../calc/cancellation";
import { storedPaymentStatus } from "../billing/invoiceLines";
import { PAYMENT_METHODS } from "../billing/recordPayment";
import { buildUpiPayload } from "../integrations/upi";
import { reverseStockForBooking } from "../stock/eventStock";
import { notifyKitchen } from "../kitchen/eventPlan";
import { recomputeBookingCost } from "../stats/bookingCost";
import { cancelMoney } from "../stats/aggregate";
import {
  cancelPlanText,
  cancelRefusal,
  cancelSummaryText,
  cancelledInvoiceFields,
  customerCancelMessage,
  equipmentBlocker,
  isPlannedTrip,
  isUnissuedMove,
  issuedOutstanding,
  restoreRefusal,
  restoreStatus,
  restoredInvoiceMoney,
  shiftSessions,
} from "./cancelBookingRules";

const VOID = ["Cancelled", "Void"];
const by = (caller: CallerContext) => ({ uid: caller.uid, name: caller.name });

export interface CancelInput {
  bookingId: string;
  reasonCode: CancelReasonCode;
  reason: string;
  advance?: AdvanceChoice;
  refundAmount?: number;
  refundMethod?: (typeof PAYMENT_METHODS)[number];
  notifyCustomer: boolean;
}

export function readCancelInput(data: Doc): CancelInput {
  const reason = reqString(data, "reason", 500).trim();
  if (reason.length < MIN_REASON_LENGTH) fail("invalid-argument", "రద్దు కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required.");
  const advance = data.advance === undefined || data.advance === null || data.advance === "" ? undefined : reqOneOf(data, "advance", ADVANCE_CHOICES);
  const refundAmount = data.refundAmount === undefined || data.refundAmount === null ? undefined : asNum(data.refundAmount, NaN);
  if (refundAmount !== undefined && !Number.isFinite(refundAmount)) fail("invalid-argument", "తిరిగి ఇచ్చే మొత్తం సంఖ్య అయి ఉండాలి.", "refundAmount must be a number.");
  const refundMethod = data.refundMethod === undefined || data.refundMethod === null || data.refundMethod === "" ? undefined : reqOneOf(data, "refundMethod", PAYMENT_METHODS);
  return {
    bookingId: reqId(data, "bookingId"),
    reasonCode: reqOneOf(data, "reasonCode", CANCEL_REASONS),
    reason,
    advance,
    refundAmount,
    refundMethod,
    notifyCustomer: data.notifyCustomer === true,
  };
}

/** Checks the advance choice against what was paid, with Telugu messages (the calc throws English only). */
function moneyStep(paid: number, inp: CancelInput): { refund: number; charge: number } {
  if (paid < 0.01) return { refund: 0, charge: 0 };
  if (!inp.advance) fail("invalid-argument", `కస్టమర్ ${formatRupees(paid)} కట్టారు — తిరిగి ఇవ్వాలా, ఉంచుకోవాలా ఎంచుకోండి.`, `The customer has paid ${formatRupees(paid)}; choose refund-all, refund-part or keep.`);
  if (inp.advance === "refund-part") {
    const r = round2(inp.refundAmount ?? 0);
    if (inp.refundAmount === undefined || r < 0.01) fail("invalid-argument", "తిరిగి ఇచ్చే మొత్తం రాయండి (కనీసం ₹0.01).", "Enter the refund amount (at least ₹0.01).");
    if (r > paid + 0.005) fail("invalid-argument", `తిరిగి ఇచ్చే మొత్తం, కట్టిన మొత్తం (${formatRupees(paid)}) కంటే ఎక్కువ ఉండకూడదు.`, `Refund cannot be more than the amount paid (${formatRupees(paid)}).`);
  }
  const m = cancellationMoney(paid, inp.advance, inp.refundAmount);
  if (m.refund > 0 && !inp.refundMethod) fail("invalid-argument", "డబ్బు ఎలా తిరిగి ఇస్తున్నారో ఎంచుకోండి (నగదు / UPI / …).", "Choose the refund method.");
  return m;
}

/** Everything cancelBooking does; cancelRecord("bookings") calls it too. */
export async function cancelBookingCore(inp: CancelInput, caller: CallerContext) {
  const db = getFirestore();
  const c = FirestoreCollections;
  const ref = db.collection(c.BOOKINGS).doc(inp.bookingId);
  const today = todayIST();
  const settings = await loadSettings();
  const reasonTe = CANCEL_REASON_TE[inp.reasonCode];
  const who = by(caller);

  const res = await db.runTransaction(async (tx) => {
    // ---- reads (all before any write) ----
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    const b = snap.data() as Doc;
    if (caller.role !== "admin") assertAdminOrOwnBranch(caller, asStr(b.branchId));
    const refusal = cancelRefusal(b);
    if (refusal) fail("failed-precondition", refusal.te, refusal.en);
    const q = (col: string) => tx.get(db.collection(col).where("bookingId", "==", inp.bookingId));
    const [invSnap, quoteSnap, moveSnap, tripSnap] = await Promise.all([q(c.INVOICES), q(c.QUOTATIONS), q(c.EQUIPMENT_MOVES), q(c.VEHICLE_TRIPS)]);
    const moves = moveSnap.docs.map((d) => d.data() as Doc);
    const outstanding = issuedOutstanding(moves, today);
    if (Object.keys(outstanding).length) {
      const eq = await tx.getAll(...Object.keys(outstanding).map((id) => db.collection(c.EQUIPMENT).doc(id)));
      const names = Object.fromEntries(eq.filter((s) => s.exists).map((s) => [s.id, asStr((s.data() as Doc).nameTe) || asStr((s.data() as Doc).nameEn) || asStr((s.data() as Doc).name)]));
      const blk = equipmentBlocker(outstanding, names)!;
      throw new HttpsError("failed-precondition", blk.en, { ...blk, blockers: [{ code: "equipment-out", ...blk }], outstanding });
    }
    const invoices = invSnap.docs.filter((d) => !VOID.includes(asStr(d.data().status)));
    const paidOf = (d: QueryDocumentSnapshot) => round2(Math.max(0, asNum(d.data().amountPaid)));
    const paid = round2(invoices.reduce((a, d) => a + paidOf(d), 0));
    const money = moneyStep(paid, inp);
    const alloc = allocateRefund(money.refund, invoices.map((d) => ({ id: d.id, paid: paidOf(d) })));

    // ---- writes ----
    const stamp = { updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() };
    const refunds: { invoiceId: string; paymentId: string; amount: number }[] = [];
    const invoiceChanges: { id: string; number: string; before: Doc; refund: number; charge: number }[] = [];
    for (const d of invoices) {
      const inv = d.data() as Doc;
      const r = alloc[d.id] ?? 0;
      const kept = round2(paidOf(d) - r);
      if (r > 0) {
        const pRef = d.ref.collection(c.PAYMENTS).doc();
        tx.set(pRef, {
          createdBy: caller.uid,
          invoiceId: d.id,
          invoiceNumberSnapshot: asStr(inv.invoiceNumber),
          customerNameSnapshot: asStr(inv.customerNameSnapshot),
          amount: -r,
          type: "refund",
          reason: `రద్దు: ${reasonTe} — ${inp.reason}`,
          cancellation: true,
          bookingId: inp.bookingId,
          date: Timestamp.fromDate(istNoon(today)),
          day: today,
          method: inp.refundMethod ?? "Other",
          note: `ఆర్డర్ రద్దు — ${reasonTe}`,
          recordedBy: caller.uid,
          recordedByName: caller.name,
          branchId: asStr(inv.branchId),
          createdAt: FieldValue.serverTimestamp(),
        });
        refunds.push({ invoiceId: d.id, paymentId: pRef.id, amount: r });
      }
      invoiceChanges.push({ id: d.id, number: asStr(inv.invoiceNumber), before: { status: asStr(inv.status), totalAmount: asNum(inv.totalAmount), amountPaid: paidOf(d), lines: asArr(inv.lineItems).length }, refund: r, charge: kept });
      tx.update(d.ref, {
        ...cancelledInvoiceFields(inv, kept),
        terms: settings.invoiceTerms,
        upiQrPayload: "",
        cancelReason: inp.reason,
        cancelledBy: who,
        cancelledAt: FieldValue.serverTimestamp(),
        ...stamp,
      });
    }
    for (const d of quoteSnap.docs) {
      const qd = d.data() as Doc;
      if (["Cancelled", "Rejected"].includes(asStr(qd.status))) continue;
      tx.update(d.ref, { status: "Cancelled", previousStatus: asStr(qd.status), cancelReason: inp.reason, cancelledBy: who, cancelledAt: FieldValue.serverTimestamp(), ...stamp });
    }
    let movesReleased = 0;
    for (const d of moveSnap.docs) {
      if (!isUnissuedMove(d.data() as Doc, today)) continue;
      tx.update(d.ref, { status: "Cancelled", previousStatus: asStr(d.data().status), cancelReason: "ఆర్డర్ రద్దు", cancelledBy: who, cancelledAt: FieldValue.serverTimestamp(), ...stamp });
      movesReleased++;
    }
    let tripsReleased = 0;
    for (const d of tripSnap.docs) {
      if (!isPlannedTrip(d.data() as Doc)) continue;
      tx.update(d.ref, { status: "Cancelled", previousStatus: asStr(d.data().status), cancelReason: "ఆర్డర్ రద్దు", cancelledBy: who, cancelledAt: FieldValue.serverTimestamp(), ...stamp });
      tripsReleased++;
    }
    const staff = asArr(b.assignedStaffIds).map(String);
    const cancel = {
      reasonCode: inp.reasonCode,
      reasonTe,
      reason: inp.reason,
      by: who,
      at: FieldValue.serverTimestamp(),
      day: today,
      paid,
      refund: money.refund,
      charge: money.charge,
      refundMethod: money.refund > 0 ? inp.refundMethod ?? "Other" : "",
      refunds,
      previousStatus: asStr(b.status),
      releasedStaffIds: staff,
      releasedTrips: tripsReleased,
      releasedMoves: movesReleased,
      invoiceIds: invoices.map((d) => d.id),
    };
    tx.update(ref, {
      status: "Cancelled",
      previousStatus: asStr(b.status),
      cancel,
      cancelReason: inp.reason,
      cancelledBy: who,
      cancelledAt: FieldValue.serverTimestamp(),
      assignedStaffIds: [],
      planSnapshot: FieldValue.delete(),
      ...stamp,
    });
    return {
      booking: b,
      paid,
      money,
      refunds,
      staffReleased: staff.length,
      tripsReleased,
      movesReleased,
      invoiceIds: invoices.map((d) => d.id),
      invoiceChanges,
      stockDone: asObj(b.stockDeduction),
    };
  });

  // ---- after the transaction: things that read other collections or may be retried safely ----
  const b = res.booking;
  const day = dayOfValue(b.eventDate);
  const customer = asStr(b.customerNameSnapshot);
  let stockReturned: Record<string, number> | null = null;
  if (Object.keys(res.stockDone).length && res.stockDone.reversed !== true) {
    try {
      stockReturned = (await reverseStockForBooking(inp.bookingId, who, `ఆర్డర్ రద్దు: ${inp.reason}`, false))?.returned ?? null;
    } catch (e) {
      logger.error("cancelBooking: stock reverse failed (use reverseEventStock)", inp.bookingId, e);
    }
  }
  const sideEffects = await Promise.allSettled([
    day && day >= today ? notifyKitchen(`planCancelled_${inp.bookingId}`, "plan-changed", cancelPlanText(customer, day, nonNeg(b.guestCount)), `/day-plan?date=${day}`, { bookingId: inp.bookingId, day }) : Promise.resolve(),
    cancelPendingMessages([inp.bookingId, ...res.invoiceIds]),
    recomputeBookingCost(inp.bookingId),
  ]);
  for (const s of sideEffects) if (s.status === "rejected") logger.error("cancelBooking side effect failed", inp.bookingId, s.reason);

  // Each rewritten invoice gets its own history entry (the bill now shows only "రద్దు చార్జీ").
  for (const ch of res.invoiceChanges) {
    await writeAuditEntry({
      uid: caller.uid,
      role: caller.role,
      action: "cancelBooking:invoice",
      collection: FirestoreCollections.INVOICES,
      docId: ch.id,
      before: ch.before,
      after: { status: "Cancelled", totalAmount: ch.charge, amountPaid: ch.charge, refund: ch.refund, bookingId: inp.bookingId, reasonCode: inp.reasonCode },
      summary: {
        te: `బిల్ ${ch.number} రద్దు (ఆర్డర్ రద్దు)${ch.refund > 0 ? ` — ${formatRupees(ch.refund)} తిరిగి ఇచ్చాం` : ""}${ch.charge > 0 ? `, రద్దు చార్జీ ${formatRupees(ch.charge)}` : ""}`,
        en: `Invoice ${ch.number} cancelled with the order${ch.refund > 0 ? ` — ${formatRupees(ch.refund)} refunded` : ""}${ch.charge > 0 ? `, cancellation charge ${formatRupees(ch.charge)}` : ""}`,
      },
    });
  }
  const summary = cancelSummaryText({ refund: res.money.refund, charge: res.money.charge, staff: res.staffReleased, trips: res.tripsReleased, moves: res.movesReleased });
  await writeAuditEntry({
    uid: caller.uid,
    role: caller.role,
    action: "cancelBooking",
    collection: FirestoreCollections.BOOKINGS,
    docId: inp.bookingId,
    before: { status: asStr(b.status), paid: res.paid },
    after: { reasonCode: inp.reasonCode, reason: inp.reason, refund: res.money.refund, charge: res.money.charge, refunds: res.refunds, stockReturned, summary: summary.en },
  });
  return {
    ok: true,
    status: "Cancelled",
    paid: res.paid,
    refund: res.money.refund,
    charge: res.money.charge,
    refunds: res.refunds,
    released: { staff: res.staffReleased, trips: res.tripsReleased, equipmentMoves: res.movesReleased },
    stockReturned,
    summary,
    customerMessage: inp.notifyCustomer ? customerCancelMessage({ customer, day, refund: res.money.refund, charge: res.money.charge, method: inp.refundMethod, business: settings.name }) : null,
  };
}

/** Unsent WhatsApp reminders about this order / its invoices are not sent any more. */
async function cancelPendingMessages(relatedIds: string[]): Promise<void> {
  const db = getFirestore();
  const ids = [...new Set(relatedIds.filter(Boolean))].slice(0, 30);
  if (!ids.length) return;
  const snap = await db.collection(FirestoreCollections.MESSAGES_OUTBOX).where("relatedId", "in", ids).get();
  const batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    if (!["queued", "needs-approval"].includes(asStr(d.data().status))) continue;
    batch.update(d.ref, { status: "cancelled", error: "order cancelled", updatedAt: FieldValue.serverTimestamp() });
    n++;
  }
  if (n) await batch.commit();
}

export const cancelBooking = callable("cancelBooking", ADMIN_MANAGER, async (data, caller) => cancelBookingCore(readCancelInput(data), caller));

/** restoreBooking { bookingId, reason } (A): back to the previous status; refunds stay; stock is taken again on completion. */
export const restoreBooking = callable("restoreBooking", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const reason = reqString(data, "reason", 500).trim();
  if (reason.length < MIN_REASON_LENGTH) fail("invalid-argument", "కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required.");
  const ref = db.collection(c.BOOKINGS).doc(bookingId);
  const today = todayIST();
  const settings = await loadSettings();
  const who = by(caller);

  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    const b = snap.data() as Doc;
    const refusal = restoreRefusal(b, today);
    if (refusal) fail("failed-precondition", refusal.te, refusal.en);
    const cancel = asObj(b.cancel);
    const invIds = asArr(cancel.invoiceIds).map(String).filter(Boolean);
    const invSnaps = invIds.length ? await tx.getAll(...invIds.map((id) => db.collection(c.INVOICES).doc(id))) : [];
    const quoteSnap = await tx.get(db.collection(c.QUOTATIONS).where("bookingId", "==", bookingId));
    const status = restoreStatus(b);
    const stamp = { updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() };

    // Invoices come back with their old totals; what was refunded stays refunded, so the balance goes up.
    const invoices: { id: string; status: string; balanceDue: number }[] = [];
    for (const s of invSnaps) {
      if (!s.exists) continue;
      const inv = s.data() as Doc;
      const money = restoredInvoiceMoney(inv);
      if (!money) continue;
      const before = asObj(inv.beforeCancel);
      const total = asNum(money.totalAmount);
      const paid = round2(Math.max(0, asNum(inv.amountPaid)));
      let newPaid = 0;
      let balance = round2(Math.max(0, total));
      let st = asStr(before.status) === "Draft" && paid < 0.01 ? "Draft" : total > 0 ? "Sent" : "Paid";
      if (paid >= 0.01) {
        const r = applyPayment(total, 0, Math.min(paid, total));
        newPaid = r.newPaid;
        balance = r.newBalance;
        st = storedPaymentStatus(r.status);
      }
      tx.update(s.ref, {
        status: st,
        previousStatus: "Cancelled",
        ...money,
        amountPaid: newPaid,
        balanceDue: balance,
        cancellationCharge: FieldValue.delete(),
        beforeCancel: FieldValue.delete(),
        upiQrPayload: buildUpiPayload({ upiId: settings.upiId, payeeName: settings.name, amount: balance, note: asStr(inv.invoiceNumber) }),
        restoredAt: FieldValue.serverTimestamp(),
        restoredBy: who,
        ...stamp,
      });
      invoices.push({ id: s.id, status: st, balanceDue: balance });
    }
    for (const d of quoteSnap.docs) {
      const qd = d.data() as Doc;
      if (asStr(qd.status) !== "Cancelled" || !asStr(qd.previousStatus)) continue;
      tx.update(d.ref, { status: asStr(qd.previousStatus), previousStatus: "Cancelled", restoredAt: FieldValue.serverTimestamp(), restoredBy: who, ...stamp });
    }
    const atValue = cancel.at instanceof Timestamp ? cancel.at : null;
    tx.update(ref, {
      status,
      previousStatus: "Cancelled",
      assignedStaffIds: asArr(cancel.releasedStaffIds).map(String),
      cancel: FieldValue.delete(),
      cancelReason: FieldValue.delete(),
      cancelledBy: FieldValue.delete(),
      cancelledAt: FieldValue.delete(),
      lastCancel: { ...cancel, at: atValue, restoredAt: Timestamp.now(), restoredBy: who, restoreReason: reason },
      ...stamp,
    });
    return { status, invoices, refund: nonNeg(cancel.refund), charge: nonNeg(cancel.charge) };
  });

  try {
    await recomputeBookingCost(bookingId);
  } catch (e) {
    logger.error("restoreBooking: booking cost refresh failed", bookingId, e);
  }
  for (const inv of res.invoices) {
    await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "restoreBooking:invoice", collection: c.INVOICES, docId: inv.id, before: { status: "Cancelled" }, after: { status: inv.status, balanceDue: inv.balanceDue, bookingId }, summary: { te: `బిల్ మళ్ళీ తెరిచారు (ఆర్డర్ తిరిగి) — బాకీ ${formatRupees(inv.balanceDue)}`, en: `Invoice reopened with the order — balance ${formatRupees(inv.balanceDue)}` } });
  }
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "restoreBooking", collection: c.BOOKINGS, docId: bookingId, before: { status: "Cancelled" }, after: { status: res.status, reason, invoices: res.invoices } });
  return {
    ok: true,
    status: res.status,
    invoices: res.invoices,
    note: {
      te: res.refund > 0 ? `${formatRupees(res.refund)} ఇప్పటికే తిరిగి ఇచ్చాం — మళ్ళీ డబ్బు వస్తే కొత్త payment నమోదు చేయండి. సరుకులు event Completed అయినప్పుడు మళ్ళీ తీసుకుంటాం.` : "సరుకులు event Completed అయినప్పుడు మళ్ళీ తీసుకుంటాం.",
      en: res.refund > 0 ? `${formatRupees(res.refund)} was refunded and stays refunded; record a new payment if the customer pays again. Stock is taken again when the event is Completed.` : "Stock is taken again when the event is Completed.",
    },
  };
});

/**
 * postponeBooking { bookingId, newDate, reason? } (A; M own branch): "తేదీ మార్చు" — keeps everything, moves the event
 * (and its sessions) to the new day at the same time of day. The history trigger logs old → new; planOnBookingChange
 * re-plans and sends the "తేదీ మారింది" notification; the timeline is computed from the booking, so it follows.
 */
export const postponeBooking = callable("postponeBooking", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const bookingId = reqId(data, "bookingId");
  const newDate = reqDay(data, "newDate");
  const reason = (optString(data, "reason", 500) ?? "").trim();
  const today = todayIST();
  if (newDate < today) fail("invalid-argument", "కొత్త తేదీ ఈ రోజు లేదా తర్వాత ఉండాలి.", "The new date must be today or later.");
  const ref = db.collection(FirestoreCollections.BOOKINGS).doc(bookingId);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    const b = snap.data() as Doc;
    if (caller.role !== "admin") assertAdminOrOwnBranch(caller, asStr(b.branchId));
    const refusal = cancelRefusal(b);
    if (refusal) fail("failed-precondition", refusal.te, refusal.en);
    if (asStr(b.status) === "Completed") fail("failed-precondition", "పూర్తైన event తేదీ మార్చలేము.", "A completed event cannot be moved.");
    const at = toDateValue(b.eventDate);
    const from = dayOfValue(b.eventDate);
    if (!at || !from) fail("failed-precondition", "ఈ booking కి తేదీ లేదు.", "This booking has no event date.");
    if (from === newDate) fail("invalid-argument", "కొత్త తేదీ పాత తేదీ ఒకటే.", "The new date is the same as the current one.");
    const eventDate = istAt(newDate, istTime(at));
    const entry = { from, to: newDate, reason, by: by(caller), at: Timestamp.now() };
    tx.update(ref, {
      eventDate: Timestamp.fromDate(eventDate),
      ...(Array.isArray(b.sessions) ? { sessions: shiftSessions(b.sessions, from, newDate) } : {}),
      postponements: FieldValue.arrayUnion(entry),
      lastPostponed: entry,
      updatedBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { from };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "postponeBooking", collection: FirestoreCollections.BOOKINGS, docId: bookingId, before: { day: res.from }, after: { day: newDate, reason } });
  return { ok: true, from: res.from, to: newDate };
});

/** getCancellationReport { month, branchId? }: dashboard numbers + reasons breakdown + the list. */
export const getCancellationReport = callable("getCancellationReport", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const month = reqMonth(data, "month");
  let branchId = optId(data, "branchId") ?? null;
  if (caller.role !== "admin") {
    branchId = branchId ?? caller.branchId;
    assertAdminOrOwnBranch(caller, branchId ?? "");
  }
  const { start, end } = monthRange(month);
  const snap = await db.collection(FirestoreCollections.BOOKINGS).where("cancelledAt", ">=", Timestamp.fromDate(start)).where("cancelledAt", "<", Timestamp.fromDate(end)).get();
  const rows = snap.docs.map((d) => ({ id: d.id, b: d.data() as Doc })).filter((r) => asStr(r.b.status) === "Cancelled" && (!branchId || asStr(r.b.branchId) === branchId));
  const s = cancelMoney(rows.map((r) => r.b));
  const reasons = Object.entries(s.byReason)
    .map(([code, v]) => ({ code, te: CANCEL_REASON_TE[code as CancelReasonCode] ?? code, ...v }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return {
    month,
    count: s.count,
    refunded: s.refunded,
    kept: s.kept,
    card: {
      te: `ఈ నెల రద్దులు: ${s.count}, తిరిగి ఇచ్చింది ${formatRupees(s.refunded)}, ఉంచుకున్నది ${formatRupees(s.kept)}`,
      en: `Cancelled this month: ${s.count}, refunded ${formatRupees(s.refunded)}, kept ${formatRupees(s.kept)}`,
    },
    reasons,
    lossOnCancelled: s.loss,
    bookings: rows.map((r) => {
      const cc = asObj(r.b.cancel);
      return {
        id: r.id,
        customer: asStr(r.b.customerNameSnapshot),
        eventDay: dayOfValue(r.b.eventDate),
        cancelledDay: asStr(cc.day) || dayOfValue(r.b.cancelledAt),
        reasonCode: asStr(cc.reasonCode) || "other",
        reason: asStr(cc.reason) || asStr(r.b.cancelReason),
        by: asStr(asObj(cc.by).name) || asStr(asObj(r.b.cancelledBy).name),
        refund: nonNeg(cc.refund),
        charge: nonNeg(cc.charge),
        loss: nonNeg(r.b.cancelLoss),
      };
    }),
  };
});

