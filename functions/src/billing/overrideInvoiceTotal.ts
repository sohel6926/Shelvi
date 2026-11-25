import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { assertOpenDay, moneyDayOf } from "../ledger/lockGuard";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { auditOverride, autoFields, manualFields, readManual } from "../shared/override";
import { buildUpiPayload } from "../integrations/upi";
import { invoiceAfterTotalChange, splitGrossTotal } from "../calc/ops";
import { round2 } from "../calc/util";

/**
 * overrideInvoiceTotal { invoiceId, total, reason } — manual total at any time (even in auto mode).
 * { invoiceId, auto: true } switches back to the stored automatic value. The total can never go below
 * the amount already paid; balance and Paid/PartiallyPaid status stay automatic.
 */
export const overrideInvoiceTotal = callable("overrideInvoiceTotal", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const invoiceId = reqId(data, "invoiceId");
  const backToAuto = data.auto === true;
  const settings = await loadSettings();
  const manual = backToAuto ? null : readManual({ total: data.total, reason: data.reason }, ["total"], caller, settings, "invoice");
  if (!backToAuto && !manual) fail("invalid-argument", "కొత్త మొత్తం, కారణం ఇవ్వండి.", "total and reason are required.");
  const ref = db.collection(FirestoreCollections.INVOICES).doc(invoiceId);

  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "Invoice దొరకలేదు.", "Invoice not found.");
    const inv = snap.data() as Doc;
    assertAdminOrOwnBranch(caller, asStr(inv.branchId));
    if (["Cancelled", "Void"].includes(asStr(inv.status))) fail("failed-precondition", "Cancel అయిన invoice మార్చలేము.", "Invoice is cancelled.");
    await assertOpenDay(moneyDayOf("invoices", inv)); // Module 4c: period lock
    const autoTotal = typeof inv.autoValue === "number" ? inv.autoValue : asNum(inv.totalAmount);
    const target = backToAuto ? autoTotal : (manual as { values: Record<string, number> }).values.total;
    const paid = asNum(inv.amountPaid);
    const after = invoiceAfterTotalChange(target, paid);
    const split = splitGrossTotal(after.total, asNum(inv.gstRate), inv.isInterState === true);
    const status = after.status === "Unpaid" ? (["Paid", "PartiallyPaid"].includes(asStr(inv.status)) ? "Sent" : asStr(inv.status, "Draft")) : after.status;
    tx.update(ref, {
      updatedBy: caller.uid,
      taxable: split.taxable,
      cgstAmount: split.cgst,
      sgstAmount: split.sgst,
      igstAmount: split.igst,
      taxAmount: split.tax,
      totalAmount: after.total,
      balanceDue: after.balanceDue,
      status,
      adjustment: round2(after.total - autoTotal),
      upiQrPayload: buildUpiPayload({ upiId: settings.upiId, payeeName: settings.name, amount: after.balanceDue, note: asStr(inv.invoiceNumber) }),
      ...(manual ? manualFields(caller, autoTotal, manual.reason) : autoFields(autoTotal)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { totalAmount: after.total, balanceDue: after.balanceDue, status, autoValue: autoTotal, before: asNum(inv.totalAmount) };
  });

  await auditOverride(caller, backToAuto ? "overrideInvoiceTotal:auto" : "overrideInvoiceTotal", FirestoreCollections.INVOICES, invoiceId, res.autoValue, res.totalAmount, manual?.reason ?? "switch to automatic");
  return { totalAmount: res.totalAmount, balanceDue: res.balanceDue, status: res.status, calcMode: manual ? "manual" : "auto", autoValue: res.autoValue };
});
