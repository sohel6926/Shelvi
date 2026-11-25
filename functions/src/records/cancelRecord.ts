import { getFirestore, FieldValue, DocumentReference } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { assertOpenDay, moneyDayOf } from "../ledger/lockGuard";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, reqId, reqString } from "../shared/validate";
import { asNum, asObj, asStr, Doc } from "../shared/coerce";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { costTargetOf } from "../shared/costTarget";
import { MIN_REASON_LENGTH } from "../shared/overridePolicy";
import { applyPayment } from "../calc/payments";
import { round2 } from "../calc/util";
import { storedPaymentStatus } from "../billing/invoiceLines";
import { reverseStockForBooking } from "../stock/eventStock";
import { cancelKind, canCancel, cancelledStatus, isAlreadyCancelled } from "./cancelRules";
import { cancelBookingCore } from "../events/cancelBooking";

/**
 * cancelRecord { collection, id, reason, invoiceId? } — R7-3. Transactional docs: status Cancelled + cancelReason /
 * cancelledBy / cancelledAt; master data: archived: true + the same fields. Side effects: a cancelled booking's event
 * stock is put back; a cancelled purchase's stock is reversed by its trigger; a cancelled payment re-derives its
 * invoice. Invoices with money received must be refunded first. Records of a closed event cannot be cancelled.
 * Payments: pass `invoiceId` (or id "invoiceId/paymentId").
 * Round 9: bookings go through cancelBookingCore (reasonCode "other"); a booking with money paid needs the
 * cancelBooking dialog (refund / keep choice).
 */
export const cancelRecord = callable("cancelRecord", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const collection = reqString(data, "collection", 50);
  const rawId = reqString(data, "id", 300);
  const reason = reqString(data, "reason", 500);
  if (reason.length < MIN_REASON_LENGTH) fail("invalid-argument", "రద్దు చేయడానికి కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required.");
  const kind = cancelKind(collection);
  if (!kind) fail("invalid-argument", "ఈ రకం record ని రద్దు చేయలేము.", `Collection ${collection} cannot be cancelled.`);
  if (!canCancel(caller.role, collection)) fail("permission-denied", "దీన్ని రద్దు చేయడానికి మీకు అనుమతి లేదు.", "You are not allowed to cancel this record.");

  if (collection === "bookings") {
    const r = await cancelBookingCore({ bookingId: reqId({ id: rawId }, "id"), reasonCode: "other", reason, notifyCustomer: false }, caller);
    return { ok: true, kind: "transactional" as const, stockReturned: r.stockReturned, refund: r.refund, charge: r.charge, released: r.released };
  }

  let ref: DocumentReference;
  let invoiceRef: DocumentReference | null = null;
  if (collection === "payments") {
    const [a, b] = rawId.includes("/") ? rawId.split("/") : [optId(data, "invoiceId") ?? "", rawId];
    if (!a || !b) fail("invalid-argument", "Payment కి invoiceId కూడా ఇవ్వాలి.", "Payments need invoiceId.");
    invoiceRef = db.collection(c.INVOICES).doc(a);
    ref = invoiceRef.collection(c.PAYMENTS).doc(b);
  } else {
    ref = db.collection(collection).doc(reqId({ id: rawId }, "id"));
  }

  const stamp = { cancelReason: reason, cancelledBy: { uid: caller.uid, name: caller.name }, cancelledAt: FieldValue.serverTimestamp(), updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() };

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ record దొరకలేదు.", "Record not found.");
    const doc = snap.data() as Doc;
    if (isAlreadyCancelled(doc)) fail("failed-precondition", "ఇది ఇప్పటికే రద్దు అయింది.", "This record is already cancelled.");
    if (caller.role !== "admin" && asStr(doc.branchId)) assertAdminOrOwnBranch(caller, asStr(doc.branchId));
    if (caller.role !== "admin" && !asStr(doc.branchId) && collection !== "leads") assertAdminOrOwnBranch(caller, "");

    // A closed event is frozen (R7-9): the booking itself and costs tagged to it.
    const bookingIdOf = collection === "bookings" ? ref.id : (() => {
      const t = costTargetOf(doc);
      return t.type === "booking" ? t.bookingId : asStr(doc.bookingId);
    })();
    await assertOpenDay(moneyDayOf(collection, doc)); // Module 4c: a document of a locked month cannot be cancelled
    let invoiceSnapDoc: Doc | undefined;
    let paidLeft = 0;
    if (invoiceRef) {
      const inv = await tx.get(invoiceRef);
      if (!inv.exists) fail("not-found", "Invoice దొరకలేదు.", "Invoice not found.");
      invoiceSnapDoc = inv.data() as Doc;
      // all reads before any write: the payments that stay after this one is cancelled (refunds are negative)
      const pays = await tx.get(invoiceRef.collection(c.PAYMENTS));
      paidLeft = round2(pays.docs.filter((p) => p.id !== ref.id && !isAlreadyCancelled(p.data() as Doc)).reduce((a, p) => a + asNum((p.data() as Doc).amount), 0));
    }
    if (bookingIdOf && ["bookings", "purchases", "expenses", "outsideOrders"].includes(collection)) {
      const b = collection === "bookings" ? doc : ((await tx.get(db.collection(c.BOOKINGS).doc(bookingIdOf))).data() as Doc | undefined);
      if (b?.closed) fail("failed-precondition", "ఈ event close అయింది — ముందు reopen చేయండి.", "This event is closed; reopen it first.");
    }
    if (collection === "staffAdvances" && asNum(doc.recovered) > 0) {
      fail("failed-precondition", "ఈ అడ్వాన్స్‌లో కొంత జీతంలో కోత అయింది — రద్దు చేయలేము.", "Part of this advance was already recovered from pay; it cannot be cancelled.");
    }
    if (collection === "invoices" && asNum(doc.amountPaid) > 0) {
      fail("failed-precondition", "ఈ invoice కి డబ్బు వచ్చింది — ముందు refund చేయండి.", "This invoice has payments; refund them first.");
    }

    if (kind === "master") tx.update(ref, { archived: true, ...stamp });
    else tx.update(ref, { status: cancelledStatus(collection), previousStatus: asStr(doc.status), ...stamp });

    if (invoiceRef && invoiceSnapDoc) {
      // Re-derive the invoice from the payments that stay.
      const paid = paidLeft;
      const total = asNum(invoiceSnapDoc.totalAmount);
      let newPaid = 0;
      let newBalance = round2(Math.max(0, total));
      let status = total > 0 ? "Sent" : "Paid";
      if (paid >= 0.01) {
        const r = applyPayment(total, 0, paid);
        newPaid = r.newPaid;
        newBalance = r.newBalance;
        status = storedPaymentStatus(r.status);
      }
      tx.update(invoiceRef, { amountPaid: newPaid, balanceDue: newBalance, status, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
    }
    return { bookingId: collection === "bookings" ? ref.id : "", stock: asObj(doc.stockDeduction) };
  });

  // A cancelled event gives its stock back.
  let stockReturned: Record<string, number> | null = null;
  if (result.bookingId && Object.keys(result.stock).length && result.stock.reversed !== true) {
    stockReturned = (await reverseStockForBooking(result.bookingId, { uid: caller.uid, name: caller.name }, `cancelled: ${reason}`, false))?.returned ?? null;
  }
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "cancelRecord", collection, docId: ref.id, after: { reason, kind, stockReturned } });
  return { ok: true, kind, stockReturned };
});
