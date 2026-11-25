/** R7-7: live guest count and during-event extras. */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqBool, reqId, reqNum, reqString } from "../shared/validate";
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { assertCanLogBooking } from "../kitchen/saveCookLog";
import { writeAuditEntry } from "../shared/auditLog";
import { round2 } from "../calc/util";

function liveBooking(b: Doc): void {
  if (b.closed) fail("failed-precondition", "ఈ event close అయింది.", "This event is closed.");
  if (asStr(b.status) === "Cancelled") fail("failed-precondition", "ఈ booking రద్దు అయింది.", "This booking is cancelled.");
}

/** logGuestCount { bookingId, sessionId?, count, note? } (A, M, assigned S) — latest count becomes guestCountActual. */
export const logGuestCount = callable("logGuestCount", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const sessionId = (optString(data, "sessionId", 100) ?? "").trim();
  const count = reqNum(data, "count", { int: true, min: 0, max: 100000 });
  const note = optString(data, "note", 500) ?? "";
  const ref = db.collection(c.BOOKINGS).doc(bookingId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    const b = snap.data() as Doc;
    assertCanLogBooking(caller, b);
    liveBooking(b);
    tx.set(ref.collection(c.GUEST_LOG).doc(), { sessionId, count, note, by: { uid: caller.uid, name: caller.name }, at: FieldValue.serverTimestamp(), branchId: asStr(b.branchId) });
    if (sessionId) {
      const sessions = asArr(b.sessions).map(asObj);
      const i = sessions.findIndex((s) => asStr(s.id) === sessionId);
      if (i < 0) fail("not-found", "ఆ session దొరకలేదు.", "Session not found.");
      sessions[i] = { ...sessions[i], guestCountActual: count };
      tx.update(ref, { sessions, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() }); // syncBookingSessions sums them
    } else {
      tx.update(ref, { guestCountActual: count, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return { ok: true, count };
});

/** addEventExtra { bookingId, sessionId?, item, qty, rate, customerApprovedBy: { name, phone? }, note? } (A, M, assigned S) → pending. */
export const addEventExtra = callable("addEventExtra", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const sessionId = (optString(data, "sessionId", 100) ?? "").trim();
  const item = reqString(data, "item", 200);
  const qty = reqNum(data, "qty", { min: 0, gt: true });
  const rate = reqNum(data, "rate", { min: 0 });
  const approver = asObj(data.customerApprovedBy);
  const approverName = asStr(approver.name).trim();
  if (approverName.length < 2) fail("invalid-argument", "ఏ customer ఒప్పుకున్నారో పేరు రాయండి.", "customerApprovedBy.name is required.");
  const note = optString(data, "note", 500) ?? "";
  const ref = db.collection(c.BOOKINGS).doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const b = snap.data() as Doc;
  assertCanLogBooking(caller, b);
  liveBooking(b);
  if (sessionId && !asArr(b.sessions).map(asObj).some((s) => asStr(s.id) === sessionId)) fail("not-found", "ఆ session దొరకలేదు.", "Session not found.");
  const extraRef = ref.collection(c.EVENT_EXTRAS).doc();
  await extraRef.set({
    sessionId,
    item,
    qty,
    rate,
    amount: round2(qty * rate),
    customerApprovedBy: { name: approverName, phone: asStr(approver.phone).slice(0, 30) },
    note,
    addedBy: { uid: caller.uid, name: caller.name },
    at: FieldValue.serverTimestamp(),
    status: "pending",
    branchId: asStr(b.branchId),
  });
  return { extraId: extraRef.id, amount: round2(qty * rate), status: "pending" };
});

/** approveEventExtra { bookingId, extraId, approve, reason? } (A, M) — approved extras go on the final invoice. */
export const approveEventExtra = callable("approveEventExtra", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const extraId = reqId(data, "extraId");
  const approve = reqBool(data, "approve");
  const reason = optString(data, "reason", 500) ?? "";
  const ref = db.collection(c.BOOKINGS).doc(bookingId);
  const extraRef = ref.collection(c.EVENT_EXTRAS).doc(extraId);
  const status = await db.runTransaction(async (tx) => {
    const [bSnap, eSnap] = await Promise.all([tx.get(ref), tx.get(extraRef)]);
    if (!bSnap.exists || !eSnap.exists) fail("not-found", "అదనపు ఐటమ్ దొరకలేదు.", "Event extra not found.");
    const b = bSnap.data() as Doc;
    assertAdminOrOwnBranch(caller, asStr(b.branchId));
    liveBooking(b);
    if (asStr((eSnap.data() as Doc).status) !== "pending") fail("failed-precondition", "ఇది ఇప్పటికే నిర్ణయించారు.", "This extra was already decided.");
    const st = approve ? "approved" : "rejected";
    tx.update(extraRef, { status: st, decidedBy: { uid: caller.uid, name: caller.name }, decidedAt: FieldValue.serverTimestamp(), decisionReason: reason });
    return st;
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "approveEventExtra", collection: `bookings/${bookingId}/eventExtras`, docId: extraId, after: { status, reason } });
  return { status };
});
