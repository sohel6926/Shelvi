import { REGION } from "../setup";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { getFirestore, DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asStr, Doc } from "../shared/coerce";
import { changeSummary } from "../shared/historyDiff";

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/** One auditLog entry { kind: "change", … } per create / update / delete (api-contract Round 6 B). */
function historyTrigger(document: string, collection: string, onlyDocId?: string) {
  return onDocumentWritten({ document, region: REGION }, async (event: WriteEvent) => {
    const afterSnap = event.data?.after;
    const beforeSnap = event.data?.before;
    const ref = afterSnap?.ref ?? beforeSnap?.ref;
    if (!ref || (onlyDocId && ref.id !== onlyDocId)) return;
    const before = beforeSnap?.exists ? (beforeSnap.data() as Doc) : undefined;
    const after = afterSnap?.exists ? (afterSnap.data() as Doc) : undefined;
    const s = changeSummary(before, after);
    if (!s) return;
    const when = new Date(event.time);
    await getFirestore()
      .collection(FirestoreCollections.AUDIT_LOG)
      .add({
        kind: "change",
        collection,
        docId: ref.id,
        path: ref.path,
        action: s.action,
        changed: s.changed.slice(0, 100),
        diff: s.diff,
        by: s.by,
        at: Timestamp.fromDate(Number.isNaN(when.getTime()) ? new Date() : when),
        branchId: asStr(after?.branchId) || asStr(before?.branchId),
      });
  });
}

export const historyBookings = historyTrigger("bookings/{id}", "bookings");
export const historyQuotations = historyTrigger("quotations/{id}", "quotations");
export const historyInvoices = historyTrigger("invoices/{id}", "invoices");
export const historyPayments = historyTrigger("invoices/{invoiceId}/payments/{id}", "payments");
export const historyCustomers = historyTrigger("customers/{id}", "customers");
export const historyLeads = historyTrigger("leads/{id}", "leads");
export const historyExpenses = historyTrigger("expenses/{id}", "expenses");
export const historyPurchases = historyTrigger("purchases/{id}", "purchases");
export const historyMenuPackages = historyTrigger("menuPackages/{id}", "menuPackages");
export const historyStaff = historyTrigger("staff/{id}", "staff");
export const historyInventory = historyTrigger("inventory/{id}", "inventory");
export const historySettings = historyTrigger("settings/{id}", "settings", "business");
export const historyTargets = historyTrigger("targets/{id}", "targets");
export const historyAttendance = historyTrigger("attendance/{id}", "attendance");
