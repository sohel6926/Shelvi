/**
 * Module 4e — recordSalaryPayment / cancelSalaryPayment (owner). See salaryPayRules.ts.
 * Books: Dr Salaries payable (2300), Cr Cash / Bank — ledgerSources.salaryPaymentEntries.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqDay, reqId, reqMonth, reqNum, reqOneOf, reqString } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { todayIST } from "../shared/istDate";
import { round2 } from "../calc/util";
import { writeAuditEntry } from "../shared/auditLog";
import { assertOpenDay } from "../ledger/lockGuard";
import { payrollDocId } from "./attendance";
import { SALARY_PAY_METHODS, paidAfter, salaryBalance, salaryPaidStatus, salaryPayProblem } from "./salaryPayRules";

export const recordSalaryPayment = callable("recordSalaryPayment", ADMIN, async (data, caller) => {
  const month = reqMonth(data, "month");
  const staffId = reqId(data, "staffId");
  const amount = round2(reqNum(data, "amount", { min: 0.01 }));
  const date = reqDay(data, "date");
  if (date > todayIST()) fail("invalid-argument", "భవిష్యత్తు తేదీతో చెల్లింపు నమోదు చేయలేము.", "A payment cannot be dated in the future.");
  await assertOpenDay(date); // Module 4c: period lock
  const method = reqOneOf(data, "method", SALARY_PAY_METHODS);
  const note = optString(data, "note", 300) ?? "";
  const db = getFirestore();
  const slipRef = db.collection(FirestoreCollections.PAYROLL).doc(payrollDocId(month, staffId));
  const payRef = db.collection(FirestoreCollections.SALARY_PAYMENTS).doc();
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(slipRef);
    const slip = (snap.data() ?? {}) as Doc;
    const net = asNum(slip.net);
    const paid = asNum(slip.paidTotal);
    const problem = salaryPayProblem({ exists: snap.exists, finalized: slip.finalized === true, net, paid }, amount);
    if (problem === "not-finalized") fail("failed-precondition", "ముందు ఆ నెల జీతాలు ఖరారు చేయండి.", "Finalize that month's payroll first.");
    if (problem === "nothing-due") fail("failed-precondition", "ఈ వ్యక్తికి ఆ నెల జీతం పూర్తిగా ఇచ్చేశారు.", "This person's pay for that month is already fully paid.");
    if (problem === "too-much") fail("invalid-argument", `ఇవ్వవలసింది ₹${salaryBalance(net, paid)} మాత్రమే.`, `Only ₹${salaryBalance(net, paid)} is still due.`);
    if (problem) fail("invalid-argument", "మొత్తం సరిగా లేదు.", "The amount is not valid.");
    const paidTotal = paidAfter(paid, amount);
    tx.set(payRef, { month, staffId, staffName: asStr(slip.staffName), payslipId: slipRef.id, amount, date, method, note, cancelled: false, paidBy: { uid: caller.uid, name: caller.name }, createdAt: FieldValue.serverTimestamp() });
    tx.update(slipRef, { paidTotal, paidStatus: salaryPaidStatus(net, paidTotal), lastPaidDay: date, updatedAt: FieldValue.serverTimestamp() });
    return { paidTotal, balance: salaryBalance(net, paidTotal), status: salaryPaidStatus(net, paidTotal) };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "recordSalaryPayment", collection: FirestoreCollections.SALARY_PAYMENTS, docId: payRef.id, before: {}, after: { month, staffId, amount, date, method } });
  return { ok: true, id: payRef.id, ...out };
});

export const cancelSalaryPayment = callable("cancelSalaryPayment", ADMIN, async (data, caller) => {
  const id = reqId(data, "id");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const payRef = db.collection(FirestoreCollections.SALARY_PAYMENTS).doc(id);
  const pre = await payRef.get();
  if (!pre.exists) fail("not-found", "ఆ జీతం చెల్లింపు దొరకలేదు.", "That salary payment was not found.");
  await assertOpenDay(asStr((pre.data() as Doc).date)); // a payment in a locked month stays
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(payRef);
    const pay = snap.data() as Doc;
    if (pay.cancelled === true) fail("failed-precondition", "ఈ చెల్లింపు ఇప్పటికే రద్దు అయింది.", "This payment is already cancelled.");
    const slipRef = db.collection(FirestoreCollections.PAYROLL).doc(asStr(pay.payslipId));
    const slipSnap = await tx.get(slipRef);
    const slip = (slipSnap.data() ?? {}) as Doc;
    const paidTotal = paidAfter(asNum(slip.paidTotal), -asNum(pay.amount));
    tx.update(payRef, { cancelled: true, cancelReason: reason, cancelledBy: { uid: caller.uid, name: caller.name }, cancelledAt: FieldValue.serverTimestamp() });
    if (slipSnap.exists) tx.update(slipRef, { paidTotal, paidStatus: salaryPaidStatus(asNum(slip.net), paidTotal), updatedAt: FieldValue.serverTimestamp() });
    return { paidTotal, amount: asNum(pay.amount) };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "cancelSalaryPayment", collection: FirestoreCollections.SALARY_PAYMENTS, docId: id, before: { amount: out.amount }, after: { cancelled: true, reason } });
  return { ok: true, paidTotal: out.paidTotal };
});
