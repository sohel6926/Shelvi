import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { callable, ADMIN, ADMIN_MANAGER } from "../shared/callable";
import { assertOpenDay } from "../ledger/lockGuard";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqDay, reqId, reqNum, reqOneOf, reqString } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { addDays, istNoon, todayIST } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { applyPayment } from "../calc/payments";
import { round2 } from "../calc/util";
import { buildUpiPayload } from "../integrations/upi";
import { storedPaymentStatus } from "./invoiceLines";

export const PAYMENT_METHODS = ["Cash", "UPI", "BankTransfer", "Card", "Other"] as const;

/** §2 in one Firestore transaction: payment doc + invoice amountPaid / balanceDue / status. */
export const recordPayment = callable("recordPayment", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const invoiceId = reqId(data, "invoiceId");
  const amount = reqNum(data, "amount");
  const method = reqOneOf(data, "method", PAYMENT_METHODS);
  const date = reqDay(data, "date");
  await assertOpenDay(date); // Module 4c: period lock
  if (date > addDays(todayIST(), 1)) fail("invalid-argument", "భవిష్యత్తు తేదీతో payment నమోదు చేయలేము.", "Payment date cannot be in the future.");
  const note = optString(data, "note", 500) ?? "";
  const settings = await loadSettings();
  const invoiceRef = db.collection(FirestoreCollections.INVOICES).doc(invoiceId);
  const paymentRef = invoiceRef.collection(FirestoreCollections.PAYMENTS).doc();

  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists) fail("not-found", "Invoice దొరకలేదు.", "Invoice not found.");
    const inv = snap.data() as Doc;
    assertAdminOrOwnBranch(caller, asStr(inv.branchId));
    if (["Cancelled", "Void"].includes(asStr(inv.status))) fail("failed-precondition", "Cancel అయిన invoice కి payment తీసుకోలేము.", "Invoice is cancelled.");
    const total = asNum(inv.totalAmount);
    const paid = asNum(inv.amountPaid);
    if (round2(total - paid) <= 0) fail("failed-precondition", "ఈ invoice ఇప్పటికే పూర్తిగా చెల్లించబడింది.", "Invoice is already fully paid.");
    const r = applyPayment(total, paid, amount);
    const status = storedPaymentStatus(r.status);
    tx.set(paymentRef, {
      createdBy: caller.uid,
      invoiceId,
      invoiceNumberSnapshot: asStr(inv.invoiceNumber),
      customerNameSnapshot: asStr(inv.customerNameSnapshot),
      amount: round2(amount),
      type: "payment",
      date: Timestamp.fromDate(istNoon(date)),
      day: date,
      method,
      note,
      recordedBy: caller.uid,
      recordedByName: caller.name,
      branchId: asStr(inv.branchId),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(invoiceRef, {
      updatedBy: caller.uid,
      amountPaid: r.newPaid,
      balanceDue: r.newBalance,
      status,
      upiQrPayload: buildUpiPayload({ upiId: settings.upiId, payeeName: settings.name, amount: r.newBalance, note: asStr(inv.invoiceNumber) }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { newPaid: r.newPaid, newBalance: r.newBalance, status, before: paid };
  });

  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "recordPayment", collection: FirestoreCollections.INVOICES, docId: invoiceId, before: { amountPaid: res.before }, after: { amountPaid: res.newPaid, amount, method } });
  return { newPaid: res.newPaid, newBalance: res.newBalance, status: res.status };
});

/**
 * The refund itself (shared by the owner's direct refund and an approved request): a negative payment (type "refund");
 * amountPaid goes down, balance goes up.
 */
export async function applyRefund(caller: { uid: string; name: string; role: string }, invoiceId: string, amount: number, reason: string, extra: Record<string, unknown> = {}): Promise<{ newPaid: number; newBalance: number; status: string }> {
  const db = getFirestore();
  const settings = await loadSettings();
  const invoiceRef = db.collection(FirestoreCollections.INVOICES).doc(invoiceId);
  const paymentRef = invoiceRef.collection(FirestoreCollections.PAYMENTS).doc();
  const today = todayIST();

  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(invoiceRef);
    if (!snap.exists) fail("not-found", "Invoice దొరకలేదు.", "Invoice not found.");
    const inv = snap.data() as Doc;
    const total = asNum(inv.totalAmount);
    const paid = asNum(inv.amountPaid);
    if (amount > paid + 0.005) fail("invalid-argument", `తిరిగి ఇచ్చే మొత్తం, చెల్లించిన మొత్తం (₹${paid}) కంటే ఎక్కువ ఉండకూడదు.`, `Refund cannot exceed the amount paid (₹${paid}).`);
    const newPaidRaw = round2(Math.max(0, paid - amount));
    let newPaid = 0;
    let newBalance = round2(Math.max(0, total));
    let status: string = total > 0 ? "Sent" : "Paid";
    if (newPaidRaw >= 0.01) {
      // Re-apply the remaining paid amount from zero with §2 so balance/status follow the same rule.
      const r = applyPayment(total, 0, newPaidRaw);
      newPaid = r.newPaid;
      newBalance = r.newBalance;
      status = storedPaymentStatus(r.status);
    }
    tx.set(paymentRef, {
      createdBy: caller.uid,
      invoiceId,
      invoiceNumberSnapshot: asStr(inv.invoiceNumber),
      customerNameSnapshot: asStr(inv.customerNameSnapshot),
      amount: -round2(amount),
      type: "refund",
      reason,
      date: Timestamp.fromDate(istNoon(today)),
      day: today,
      method: "Other",
      note: reason,
      recordedBy: caller.uid,
      recordedByName: caller.name,
      branchId: asStr(inv.branchId),
      ...extra,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(invoiceRef, {
      updatedBy: caller.uid,
      amountPaid: newPaid,
      balanceDue: newBalance,
      status,
      upiQrPayload: buildUpiPayload({ upiId: settings.upiId, payeeName: settings.name, amount: newBalance, note: asStr(inv.invoiceNumber) }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { newPaid, newBalance, status, before: paid };
  });

  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "refundOrAdjust", collection: FirestoreCollections.INVOICES, docId: invoiceId, before: { amountPaid: res.before }, after: { amountPaid: res.newPaid, refund: amount, reason } });
  return { newPaid: res.newPaid, newBalance: res.newBalance, status: res.status };
}

/** Refund: a negative payment (type "refund"); amountPaid goes down, balance goes up. Owner only (a manager asks: requestRefund). */
export const refundOrAdjust = callable("refundOrAdjust", ADMIN, async (data, caller) => {
  return applyRefund(caller, reqId(data, "invoiceId"), reqNum(data, "amount", { min: 0.01 }), reqString(data, "reason", 500));
});
