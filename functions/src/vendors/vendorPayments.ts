/** R7-8: vendor payments with allocations; derived paid / balance / paymentStatus on every bill. */
import { REGION } from "../setup";
import { assertOpenDay } from "../ledger/lockGuard";
import { getFirestore, FieldValue, Timestamp, DocumentSnapshot, DocumentReference } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { checkNum, optId, optString, reqArray, reqDay, reqNum, reqOneOf, reqString } from "../shared/validate";
import { asNum, asObj, asStr, Doc } from "../shared/coerce";
import { istNoon } from "../shared/istDate";
import { writeAuditEntry } from "../shared/auditLog";
import { round2 } from "../calc/util";
import { BILL_COLLECTIONS, BillCollection, billFields, billOf, groupVendorDues } from "./billRules";
import { loadSettings } from "../shared/settings";
import { asArr } from "../shared/coerce";
import { effectiveRole, purchaseSodClash, sodMessage } from "../roles/permRules";

export const VENDOR_PAY_METHODS = ["Cash", "UPI", "BankTransfer", "Card", "Other"] as const;

/**
 * recordVendorPayment { vendorId?, vendorName, amount, date, method, allocations: [{ collection, id, amount }], note? } (A).
 * Σ allocations ≤ amount (the rest stays as unallocated credit); each allocation ≤ that bill's balance.
 */
export const recordVendorPayment = callable("recordVendorPayment", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const vendorId = optId(data, "vendorId") ?? "";
  const vendorName = reqString(data, "vendorName", 200);
  const amount = reqNum(data, "amount", { min: 0.01 });
  const date = reqDay(data, "date");
  await assertOpenDay(date); // Module 4c: period lock
  const method = reqOneOf(data, "method", VENDOR_PAY_METHODS);
  const note = optString(data, "note", 500) ?? "";
  const allocations = reqArray(data, "allocations", 100).map((x, i) => {
    const o = asObj(x);
    const collection = reqOneOf(o, "collection", BILL_COLLECTIONS) as BillCollection;
    const id = reqString(o, "id", 200);
    if (id.includes("/")) fail("invalid-argument", "Bill id సరిగా లేదు.", "Bill id is not valid.");
    return { collection, id, amount: round2(checkNum(`allocations[${i}].amount`, o.amount, { min: 0.01 })) };
  });
  const keys = allocations.map((a) => `${a.collection}/${a.id}`);
  if (new Set(keys).size !== keys.length) fail("invalid-argument", "ఒకే bill రెండుసార్లు ఉంది.", "The same bill is listed twice.");
  const allocated = round2(allocations.reduce((a, b) => a + b.amount, 0));
  if (allocated > amount + 0.005) fail("invalid-argument", `కేటాయించిన మొత్తం ₹${allocated} చెల్లింపు ₹${amount} కంటే ఎక్కువ.`, `Allocations ₹${allocated} exceed the payment ₹${amount}.`);

  const payRef = db.collection(FirestoreCollections.VENDOR_PAYMENTS).doc();
  const settings = await loadSettings();
  const sodOverrides: string[] = [];
  const updated = await db.runTransaction(async (tx) => {
    const refs: DocumentReference[] = allocations.map((a) => db.collection(a.collection).doc(a.id));
    const snaps = refs.length ? await tx.getAll(...refs) : [];
    const out: { collection: string; id: string; paid: number; balance: number; paymentStatus: string }[] = [];
    snaps.forEach((s, i) => {
      const a = allocations[i];
      if (!s.exists) fail("not-found", `Bill ${a.id} దొరకలేదు.`, `Bill ${a.collection}/${a.id} not found.`);
      const doc = s.data() as Doc;
      if (doc.status === "Cancelled" || doc.status === "cancelled" || doc.isDeleted === true) fail("failed-precondition", `Bill ${a.id} రద్దు అయింది.`, `Bill ${a.id} is cancelled.`);
      // Module 3c: a bill that does not match its order and receipts is not paid until the owner releases it
      if (doc.paymentHold === true) fail("failed-precondition", `Bill ${asStr(doc.billNumber) || a.id} ఆర్డర్ / సరుకు రసీదుతో సరిపోలలేదు — చెల్లింపు ఆపబడింది. ముందు బిల్ సరిచేయండి లేదా యజమాని విడుదల చేయాలి.`, `Bill ${asStr(doc.billNumber) || a.id} does not match its order / goods receipt — payment is on hold. Correct the bill or have the owner release it.`);
      // Module 4d: the payer is not the person who asked for, received or entered the bill of a high-value order
      if (doc.sodActors && typeof doc.sodActors === "object") {
        const sa = asObj(doc.sodActors);
        const sod = purchaseSodClash(
          "pay",
          { uid: caller.uid, role: effectiveRole(caller.role, caller.jobRole) },
          { requestedBy: asStr(sa.requestedBy), receivedBy: asArr(sa.receivedBy).map((v) => asStr(v)), billVerifiedBy: asStr(sa.billVerifiedBy) },
          asNum(doc.sodAmount),
          settings.sod,
        );
        if (sod.clash) {
          const m = sodMessage(sod.clash);
          fail("permission-denied", m.te, m.en);
        }
        if (sod.overridden && !sodOverrides.includes(a.id)) sodOverrides.push(a.id);
      }
      const before = billOf(a.collection, doc);
      if (a.amount > before.balance + 0.005) fail("invalid-argument", `Bill ${a.id} బాకీ ₹${before.balance} మాత్రమే.`, `Bill ${a.id} has only ₹${before.balance} outstanding.`);
      const next: Doc = { ...doc, paid: round2(before.paidField + a.amount) };
      const f = billFields(a.collection, next);
      const extra: Doc = {};
      if (a.collection === "outsideOrders" && asStr(doc.status) === "delivered" && asNum(f.amountDue) <= 0.005) extra.status = "settled";
      tx.update(s.ref, { ...f, ...extra, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
      out.push({ collection: a.collection, id: a.id, paid: asNum(f.paid), balance: asNum(f.balance), paymentStatus: asStr(f.paymentStatus) });
    });
    tx.set(payRef, {
      sodOverrides,
      vendorId,
      vendorName,
      amount: round2(amount),
      date,
      paidAt: Timestamp.fromDate(istNoon(date)),
      method,
      allocations,
      unallocated: round2(amount - allocated),
      note,
      createdBy: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return out;
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "recordVendorPayment", collection: FirestoreCollections.VENDOR_PAYMENTS, docId: payRef.id, after: { vendorName, amount, allocations } });
  return { vendorPaymentId: payRef.id, bills: updated, unallocated: round2(amount - allocated) };
});

/** getVendorDues { vendorId? } (A) → per vendor: bills, total, paid, outstanding, oldest due date. */
export const getVendorDues = callable("getVendorDues", ADMIN, async (data) => {
  const db = getFirestore();
  const vendorId = optId(data, "vendorId");
  const open = ["Unpaid", "PartiallyPaid", "Pending", "Partial", "Partially Paid", "Advance Paid", "Credit", ""];
  const [p, e, o] = await Promise.all([
    db.collection(FirestoreCollections.PURCHASES).where("paymentStatus", "in", open).get(),
    db.collection(FirestoreCollections.EXPENSES).where("paymentStatus", "in", [...open, "Unpaid"]).get(),
    db.collection(FirestoreCollections.OUTSIDE_ORDERS).where("status", "in", ["delivered"]).get(),
  ]);
  const rows: { collection: BillCollection; doc: Doc }[] = [
    ...p.docs.map((d) => ({ collection: "purchases" as BillCollection, doc: { ...(d.data() as Doc), id: d.id } as Doc })),
    ...e.docs.map((d) => ({ collection: "expenses" as BillCollection, doc: { ...(d.data() as Doc), id: d.id } as Doc })),
    ...o.docs.map((d) => ({ collection: "outsideOrders" as BillCollection, doc: { ...(d.data() as Doc), id: d.id } as Doc })),
  ].filter((r) => !vendorId || asStr(r.doc.vendorId) === vendorId);
  return { vendors: groupVendorDues(rows) };
});

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/** Keeps paid / balance / paymentStatus right on purchases and expenses written by clients (and maps old statuses). */
function billTrigger(collection: "purchases" | "expenses") {
  return onDocumentWritten({ document: `${collection}/{id}`, region: REGION }, async (event: WriteEvent) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const doc = after.data() as Doc;
    const f = billFields(collection, doc);
    const same = Object.entries(f).every(([k, v]) => doc[k] === v);
    if (!same) await after.ref.update(f);
  });
}
export const billStatusOnPurchase = billTrigger("purchases");
export const billStatusOnExpense = billTrigger("expenses");

/** One-time: derive paid / balance / paymentStatus for every purchase and expense (old free-text statuses mapped). */
export const migratePaymentStatuses = callable("migratePaymentStatuses", ADMIN, async (_data, caller) => {
  const db = getFirestore();
  const counts: Record<string, number> = { purchases: 0, expenses: 0, cancelled: 0 };
  for (const collection of ["purchases", "expenses"] as const) {
    const snap = await db.collection(collection).get();
    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      const doc = d.data() as Doc;
      if (typeof doc.paid === "number") continue;
      const f = billFields(collection, doc);
      const legacy = asStr(doc.paymentStatus).trim().toLowerCase();
      if (legacy === "cancelled" && doc.status !== "Cancelled") {
        Object.assign(f, { status: "Cancelled", cancelReason: "migrated: payment status was Cancelled", cancelledBy: { uid: caller.uid, name: caller.name }, cancelledAt: FieldValue.serverTimestamp() });
        counts.cancelled++;
      }
      batch.update(d.ref, f);
      counts[collection]++;
      if (++n % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    if (n % 400 !== 0) await batch.commit();
  }
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "migratePaymentStatuses", collection: "purchases+expenses", docId: "-", after: counts });
  return counts;
});
