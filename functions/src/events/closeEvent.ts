/** R7-9: simple event close with blockers and a profit snapshot; reopen is audited. */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqId, reqString } from "../shared/validate";
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { writeAuditEntry } from "../shared/auditLog";
import { isLiveRecord } from "../shared/costTarget";
import { MIN_REASON_LENGTH } from "../shared/overridePolicy";
import { closeBlockers, equipmentOutstanding } from "../calc/round7";
import { profit } from "../calc/health";
import { round2 } from "../calc/util";
import { loadBookingCost } from "../stats/bookingCost";
import { eventDays } from "./sessions";

/** closeEvent { bookingId, confirm: { vendorBillsEntered }, overrideReason? } (A). Status must be Completed. */
export const closeEvent = callable("closeEvent", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const vendorBillsEntered = asObj(data.confirm).vendorBillsEntered === true;
  const overrideReason = (optString(data, "overrideReason", 500) ?? "").trim();
  const ref = db.collection(c.BOOKINGS).doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const booking = snap.data() as Doc;
  if (booking.closed || asStr(booking.status) === "Closed") fail("failed-precondition", "ఈ event ఇప్పటికే close అయింది.", "This event is already closed.");
  if (asStr(booking.status) !== "Completed") fail("failed-precondition", "ముందు event ని Completed గా మార్చండి.", "Mark the event Completed before closing it.");

  const by = (col: string, field: string) => db.collection(col).where(field, "==", bookingId).get();
  const [moves, o1, o2, extras, invoices] = await Promise.all([
    by(c.EQUIPMENT_MOVES, "bookingId"),
    by(c.OUTSIDE_ORDERS, "bookingId"),
    by(c.OUTSIDE_ORDERS, "costTarget.bookingId"),
    ref.collection(c.EVENT_EXTRAS).where("status", "==", "pending").get(),
    by(c.INVOICES, "bookingId"),
  ]);
  const outstanding = equipmentOutstanding(moves.docs.map((d) => d.data() as Doc).filter(isLiveRecord).map((m) => ({ equipmentId: asStr(m.equipmentId), type: asStr(m.type), qty: asNum(m.qty) })));
  const vesselsOutstanding = round2(Object.values(outstanding).reduce((a, b) => a + b, 0));
  const orders = new Map([...o1.docs, ...o2.docs].map((d) => [d.id, d.data() as Doc]));
  const outsideOrdersOpen = [...orders.values()].filter((o) => isLiveRecord(o) && asStr(o.status) !== "settled").length;
  const staff = asArr(booking.assignedStaffIds).map(String);
  const days = eventDays(booking);
  const attIds = staff.flatMap((s) => days.map((d) => `${s}_${d}`));
  const att = attIds.length ? await db.getAll(...attIds.map((id) => db.collection(c.ATTENDANCE).doc(id))) : [];
  const marked = new Set(att.filter((a) => a.exists && isLiveRecord(a.data() as Doc)).map((a) => asStr((a.data() as Doc).staffId)));
  const staffWithoutAttendance = staff.filter((s) => !marked.has(s));
  const customerBalance = round2(invoices.docs.map((d) => d.data() as Doc).filter(isLiveRecord).reduce((a, i) => a + Math.max(0, asNum(i.balanceDue)), 0));

  const blockers = closeBlockers({ vesselsOutstanding, outsideOrdersOpen, pendingExtras: extras.size, staffWithoutAttendance, customerBalance, vendorBillsEntered, overrideReason });
  if (blockers.length) {
    throw new HttpsError("failed-precondition", "The event cannot be closed yet.", {
      te: "Event ఇంకా close చేయలేము:\n" + blockers.map((b) => "• " + b.te).join("\n"),
      en: blockers.map((b) => b.en).join(" "),
      blockers,
      staffWithoutAttendance,
    });
  }

  const r = await loadBookingCost(bookingId);
  const k = r.costActual;
  const p = profit(r.incomeActual, k.food, k.labour, round2(k.transport + k.rentals + k.other), 0);
  const closed = {
    at: FieldValue.serverTimestamp(),
    by: { uid: caller.uid, name: caller.name },
    income: r.incomeActual,
    costs: k,
    profit: p.profit,
    marginPct: p.marginPct,
    vendorBillsEntered: true,
    customerBalance,
    overrideReason: customerBalance > 0.005 ? overrideReason : "",
  };
  await ref.update({ status: "Closed", closed, costActual: k, profitActual: p.profit, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "closeEvent", collection: c.BOOKINGS, docId: bookingId, after: { income: r.incomeActual, profit: p.profit, customerBalance, overrideReason } });
  return { closed: { ...closed, at: new Date().toISOString() } };
});

/** reopenEvent { bookingId, reason } (A) — back to Completed, audited. */
export const reopenEvent = callable("reopenEvent", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const bookingId = reqId(data, "bookingId");
  const reason = reqString(data, "reason", 500);
  if (reason.length < MIN_REASON_LENGTH) fail("invalid-argument", "కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required.");
  const ref = db.collection(FirestoreCollections.BOOKINGS).doc(bookingId);
  const prev = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    const b = snap.data() as Doc;
    if (!b.closed && asStr(b.status) !== "Closed") fail("failed-precondition", "ఈ event close కాలేదు.", "This event is not closed.");
    tx.update(ref, {
      status: "Completed",
      closed: FieldValue.delete(),
      lastReopen: { at: FieldValue.serverTimestamp(), by: { uid: caller.uid, name: caller.name }, reason, previousClose: b.closed ?? null },
      updatedBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return b.closed ?? null;
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "reopenEvent", collection: FirestoreCollections.BOOKINGS, docId: bookingId, before: { closed: prev }, after: { reason } });
  return { ok: true, status: "Completed" };
});
