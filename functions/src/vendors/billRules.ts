/** Pure: R7-8 — one payment vocabulary for purchases, expenses and outside orders. */
import { asNum, asStr, Doc, nonNeg } from "../shared/coerce";
import { billPaymentStatus, mapLegacyPaymentStatus, outsideOrderAmounts, VendorPaymentStatus } from "../calc/round7";
import { dayOfValue } from "../shared/istDate";
import { isLiveRecord } from "../shared/costTarget";

export const BILL_COLLECTIONS = ["purchases", "expenses", "outsideOrders"] as const;
export type BillCollection = (typeof BILL_COLLECTIONS)[number];

export interface BillState {
  total: number;
  /** everything paid so far (outside orders: advance + payments) */
  paidTotal: number;
  balance: number;
  paymentStatus: VendorPaymentStatus;
  /** the value stored in `paid` (outside orders: payments after the advance) */
  paidField: number;
  /** outside orders only */
  amountDue?: number;
}

/** Current paid amount: the numeric `paid` field, else the one-time mapping of the old free-text status. */
function paidOf(doc: Doc, total: number): number {
  if (typeof doc.paid === "number" && Number.isFinite(doc.paid)) return Math.max(0, doc.paid);
  return mapLegacyPaymentStatus(asStr(doc.legacyPaymentStatus) || asStr(doc.paymentStatus), total, nonNeg(doc.advancePaid)).paid;
}

export function billOf(collection: BillCollection, doc: Doc): BillState {
  if (collection === "outsideOrders") {
    const paidField = typeof doc.paid === "number" ? Math.max(0, doc.paid) : 0;
    const a = outsideOrderAmounts({ acceptedQty: nonNeg(doc.acceptedQty), rate: nonNeg(doc.rate), advancePaid: nonNeg(doc.advancePaid), paid: paidField });
    const paidTotal = nonNeg(doc.advancePaid) + paidField;
    const st = billPaymentStatus(a.cost, paidTotal);
    return { total: a.cost, paidTotal: st.paid, balance: st.balance, paymentStatus: st.paymentStatus, paidField, amountDue: a.amountDue };
  }
  const total = nonNeg(doc.totalAmount);
  const paid = paidOf(doc, total);
  const st = billPaymentStatus(total, paid);
  return { total, paidTotal: st.paid, balance: st.balance, paymentStatus: st.paymentStatus, paidField: st.paid };
}

export function vendorKeyOf(collection: BillCollection, doc: Doc): { key: string; vendorId: string; vendorName: string } {
  const vendorId = asStr(doc.vendorId);
  const vendorName = collection === "purchases" ? asStr(doc.vendorNameSnapshot) || asStr(doc.vendorName) : collection === "expenses" ? asStr(doc.vendorName) || asStr(doc.personName) : asStr(doc.vendorName);
  return { key: vendorId || `name:${vendorName.trim().toLowerCase()}`, vendorId, vendorName };
}

export function billDueDay(collection: BillCollection, doc: Doc): string | null {
  if (collection === "purchases") return dayOfValue(doc.purchaseDate);
  if (collection === "expenses") return dayOfValue(doc.dueDate) ?? dayOfValue(doc.serviceDate);
  return dayOfValue(doc.date);
}

/** Is there something to pay? Outside orders count once delivered (before that the quantity is not known). */
export function billIsOpen(collection: BillCollection, doc: Doc): boolean {
  if (!isLiveRecord(doc)) return false;
  if (collection === "outsideOrders" && asStr(doc.status) === "ordered") return false;
  return billOf(collection, doc).balance > 0.005;
}

export interface VendorDues {
  vendorId: string;
  vendorName: string;
  bills: number;
  total: number;
  paid: number;
  outstanding: number;
  oldestDueDate: string | null;
  /** part of `outstanding` on bills whose payment is held (3-way match mismatch) — cannot be paid until released */
  heldAmount: number;
  heldBills: number;
}

/** getVendorDues grouping (pure). */
export function groupVendorDues(rows: { collection: BillCollection; doc: Doc }[]): VendorDues[] {
  const m = new Map<string, VendorDues>();
  for (const { collection, doc } of rows) {
    if (!billIsOpen(collection, doc)) continue;
    const v = vendorKeyOf(collection, doc);
    const b = billOf(collection, doc);
    const due = billDueDay(collection, doc);
    const cur = m.get(v.key) ?? { vendorId: v.vendorId, vendorName: v.vendorName, bills: 0, total: 0, paid: 0, outstanding: 0, oldestDueDate: null, heldAmount: 0, heldBills: 0 };
    cur.bills += 1;
    cur.total = Math.round((cur.total + b.total) * 100) / 100;
    cur.paid = Math.round((cur.paid + b.paidTotal) * 100) / 100;
    cur.outstanding = Math.round((cur.outstanding + b.balance) * 100) / 100;
    if (doc.paymentHold === true) {
      cur.heldBills += 1;
      cur.heldAmount = Math.round((cur.heldAmount + b.balance) * 100) / 100;
    }
    if (due && (!cur.oldestDueDate || due < cur.oldestDueDate)) cur.oldestDueDate = due;
    if (!cur.vendorName && v.vendorName) cur.vendorName = v.vendorName;
    m.set(v.key, cur);
  }
  return [...m.values()].sort((a, b) => b.outstanding - a.outstanding);
}

/** Fields the server keeps on a bill document. */
export function billFields(collection: BillCollection, doc: Doc): Doc {
  const b = billOf(collection, doc);
  const f: Doc = { paid: b.paidField, balance: b.balance, paymentStatus: b.paymentStatus };
  if (collection === "outsideOrders") f.amountDue = b.amountDue;
  if (typeof doc.paid !== "number" && asStr(doc.paymentStatus) && !["Unpaid", "PartiallyPaid", "Paid"].includes(asStr(doc.paymentStatus))) f.legacyPaymentStatus = asStr(doc.paymentStatus);
  return f;
}
