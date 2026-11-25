/** R7-6: outside orders (Pulka, Rumali Roti, Bobbatlu, Ice Cream, Paan, …) as real orders. */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertOpenDay, moneyDayOf } from "../ledger/lockGuard";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { checkNum, optId, optString, reqId, reqNum, reqString } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { parseCostTarget } from "../shared/costTarget";
import { dayOfValue, isValidDay } from "../shared/istDate";
import { checkOutsideDelivery } from "../calc/round7";
import { billFields } from "../vendors/billRules";
import { MIN_REASON_LENGTH } from "../shared/overridePolicy";

/** saveOutsideOrder { id?, bookingId, sessionId?, vendorId?, vendorName, item, unit, rate, orderedQty, advancePaid?, date?, costTarget? } (A, M) */
export const saveOutsideOrder = callable("saveOutsideOrder", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const id = optId(data, "id");
  const bookingId = reqId(data, "bookingId");
  const sessionId = optString(data, "sessionId", 100) || undefined;
  const vendorId = optId(data, "vendorId") ?? "";
  const vendorName = reqString(data, "vendorName", 200);
  const item = reqString(data, "item", 200);
  const unit = reqString(data, "unit", 30);
  const rate = reqNum(data, "rate", { min: 0 });
  const orderedQty = reqNum(data, "orderedQty", { min: 0, gt: true });
  const advancePaid = data.advancePaid === undefined ? undefined : checkNum("advancePaid", data.advancePaid, { min: 0 });
  const dateSent = optString(data, "date", 10);
  if (dateSent && !isValidDay(dateSent)) fail("invalid-argument", "తేదీ YYYY-MM-DD రూపంలో ఉండాలి.", "date must be YYYY-MM-DD.");
  const ctRaw = data.costTarget === undefined ? { type: "booking", bookingId, sessionId } : data.costTarget;
  const costTarget = parseCostTarget(ctRaw);
  if (!costTarget) fail("invalid-argument", "ఖర్చు ఏ event కో / overhead కో చెప్పాలి.", "costTarget must be { type: booking, bookingId } or { type: overhead, centre }.");

  const bSnap = await db.collection(c.BOOKINGS).doc(bookingId).get();
  if (!bSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const booking = bSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(booking.branchId));
  if (booking.closed) fail("failed-precondition", "ఈ event close అయింది — ముందు reopen చేయండి.", "This event is closed; reopen it first.");
  const date = dateSent || dayOfValue(booking.eventDate) || "";
  await assertOpenDay(date); // Module 4c: period lock

  const col = db.collection(c.OUTSIDE_ORDERS);
  const res = await db.runTransaction(async (tx) => {
    const ref = id ? col.doc(id) : col.doc();
    const prev = id ? (await tx.get(ref)).data() as Doc | undefined : undefined;
    if (id && !prev) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Outside order not found.");
    if (prev && ["settled", "cancelled"].includes(asStr(prev.status))) fail("failed-precondition", "Settle / రద్దు అయిన ఆర్డర్ మార్చలేము.", "A settled or cancelled order cannot be changed.");
    const base: Doc = {
      ...(prev ?? { deliveredQty: 0, acceptedQty: 0, returnedQty: 0, rejectReason: "", paid: 0, status: "ordered" }),
      bookingId,
      sessionId: sessionId ?? "",
      vendorId,
      vendorName,
      item,
      unit,
      rate,
      orderedQty,
      advancePaid: advancePaid ?? asNum(prev?.advancePaid),
      date,
      costTarget,
    };
    const fields: Doc = { ...base, ...billFields("outsideOrders", base), updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() };
    if (prev) tx.update(ref, fields);
    else tx.set(ref, { ...fields, branchId: asStr(booking.branchId), createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id, amountDue: fields.amountDue, status: fields.status };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "saveOutsideOrder", collection: c.OUTSIDE_ORDERS, docId: res.id, after: { item, orderedQty, rate } });
  return res;
});

/** recordOutsideDelivery { id, deliveredQty, acceptedQty, returnedQty, rejectReason } (A, M) */
export const recordOutsideDelivery = callable("recordOutsideDelivery", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const id = reqId(data, "id");
  const deliveredQty = reqNum(data, "deliveredQty", { min: 0 });
  const acceptedQty = reqNum(data, "acceptedQty", { min: 0 });
  const returnedQty = reqNum(data, "returnedQty", { min: 0 });
  const rejectReason = (optString(data, "rejectReason", 500) ?? "").trim();
  checkOutsideDelivery({ deliveredQty, acceptedQty, returnedQty });
  if (returnedQty > 0 && rejectReason.length < MIN_REASON_LENGTH) fail("invalid-argument", "తిరిగి ఇచ్చిన వాటికి కారణం రాయండి.", "rejectReason (≥ 3 chars) is required when items are returned.");
  const ref = db.collection(c.OUTSIDE_ORDERS).doc(id);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Outside order not found.");
    const prev = snap.data() as Doc;
    if (asStr(prev.status) === "cancelled") fail("failed-precondition", "రద్దు అయిన ఆర్డర్.", "This order is cancelled.");
    assertAdminOrOwnBranch(caller, asStr(prev.branchId));
    const b = (await tx.get(db.collection(c.BOOKINGS).doc(asStr(prev.bookingId)))).data() as Doc | undefined;
    if (b?.closed) fail("failed-precondition", "ఈ event close అయింది — ముందు reopen చేయండి.", "This event is closed; reopen it first.");
    const next: Doc = { ...prev, deliveredQty, acceptedQty, returnedQty, rejectReason };
    const bill = billFields("outsideOrders", next);
    const status = asNum(bill.amountDue) <= 0.005 ? "settled" : "delivered";
    tx.update(ref, { deliveredQty, acceptedQty, returnedQty, rejectReason, ...bill, status, deliveredAt: FieldValue.serverTimestamp(), updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
    return { amountDue: bill.amountDue, status };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "recordOutsideDelivery", collection: c.OUTSIDE_ORDERS, docId: id, after: { deliveredQty, acceptedQty, returnedQty } });
  return res;
});
