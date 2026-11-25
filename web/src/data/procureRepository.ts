import { collection, type DocumentData, onSnapshot, query, where, type Query } from "firebase/firestore";
import { db } from "../firebase";

/** Module 3a — purchase requests and purchase orders. Both are written only by the server (data/functions.ts). */
export interface ProcureLine {
  description: string;
  inventoryItemId: string;
  groceryItemId: string;
  qty: number;
  unit: string;
  rate: number;
}

export type PrStatus = "submitted" | "approved" | "rejected" | "ordered" | "cancelled";
export type PoStatus = "pendingApproval" | "approved" | "rejected" | "partReceived" | "received" | "cancelled";

export interface PurchaseRequest {
  id: string;
  number: string;
  status: PrStatus;
  neededBy: string;
  note: string;
  lines: ProcureLine[];
  branchId: string;
  requestedBy: string;
  requestedByName: string;
  requestDay: string;
  poId: string;
  poNumber: string;
  decidedByName: string;
  decideReason: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  status: PoStatus;
  vendorId: string;
  vendorName: string;
  expectedDay: string;
  terms: string;
  lines: ProcureLine[];
  total: number;
  prId: string;
  branchId: string;
  orderDay: string;
  createdBy: string;
  createdByName: string;
  approvedByName: string;
  decideReason: string;
  /** Module 3b: accepted so far, one number per line */
  receivedQty: number[];
  closedShort: boolean;
  /** Module 3c (kept by the server from the order's live bills) */
  billedQty: number[];
  billedAmount: number;
  heldCount: number;
}

/** Module 3b — one receipt of goods against an order (goodsReceipts, written by the server). */
export interface GoodsReceiptLine {
  line: number;
  description: string;
  unit: string;
  ordered: number;
  delivered: number;
  accepted: number;
  rejected: number;
  rejectReason: string;
  short: number;
  /** "" = went into stock (or nothing accepted); else why stock was not changed */
  stockNote: string;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  poId: string;
  poNumber: string;
  vendorName: string;
  receiveDay: string;
  vendorBillNo: string;
  note: string;
  lines: GoodsReceiptLine[];
  acceptedValue: number;
  hasRejects: boolean;
  stockSkipped: boolean;
  billStatus: string;
  receivedByName: string;
  cancelled: boolean;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const lines = (v: unknown): ProcureLine[] =>
  Array.isArray(v)
    ? v.map((r) => {
        const x = (r ?? {}) as DocumentData;
        return { description: s(x.description), inventoryItemId: s(x.inventoryItemId), groceryItemId: s(x.groceryItemId), qty: n(x.qty), unit: s(x.unit), rate: n(x.rate) };
      })
    : [];

export const PR_STATUS_LABEL: Record<PrStatus, { te: string; en: string; color: "default" | "info" | "success" | "warning" | "error" }> = {
  submitted: { te: "ఆమోదం కోసం", en: "Waiting for approval", color: "warning" },
  approved: { te: "ఆమోదించారు", en: "Approved", color: "success" },
  rejected: { te: "తిరస్కరించారు", en: "Rejected", color: "error" },
  ordered: { te: "ఆర్డర్ రాశారు", en: "Order written", color: "info" },
  cancelled: { te: "రద్దు", en: "Cancelled", color: "default" },
};

export const PO_STATUS_LABEL: Record<PoStatus, { te: string; en: string; color: "default" | "info" | "success" | "warning" | "error" }> = {
  pendingApproval: { te: "యజమాని ఆమోదం కోసం", en: "Waiting for the owner", color: "warning" },
  approved: { te: "ఆమోదించారు", en: "Approved", color: "success" },
  rejected: { te: "తిరస్కరించారు", en: "Rejected", color: "error" },
  partReceived: { te: "కొంత సరుకు అందింది", en: "Partly received", color: "info" },
  received: { te: "సరుకు అందింది", en: "Received", color: "success" },
  cancelled: { te: "రద్దు", en: "Cancelled", color: "default" },
};

/** Who is looking: the owner sees everything (or one branch), a manager the branch, staff only their own requests. */
export interface ProcureViewer {
  role: "admin" | "manager" | "staff";
  uid: string;
  branchId: string | null;
}

function scoped(name: string, v: ProcureViewer, ownField: string): Query<DocumentData> | null {
  const col = collection(db, name);
  if (v.role === "staff") return query(col, where(ownField, "==", v.uid));
  if (v.branchId) return query(col, where("branchId", "==", v.branchId));
  return v.role === "admin" ? query(col) : null;
}

/** Live purchase requests, newest first. */
export function subscribePurchaseRequests(viewer: ProcureViewer, onData: (rows: PurchaseRequest[]) => void, onError?: (e: Error) => void): () => void {
  const q = scoped("purchaseRequests", viewer, "requestedBy");
  if (!q) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            const st = s(x.status) as PrStatus;
            return {
              id: d.id, number: s(x.number), status: st in PR_STATUS_LABEL ? st : "submitted", neededBy: s(x.neededBy), note: s(x.note), lines: lines(x.lines), branchId: s(x.branchId),
              requestedBy: s(x.requestedBy), requestedByName: s(x.requestedByName), requestDay: s(x.requestDay), poId: s(x.poId), poNumber: s(x.poNumber), decidedByName: s(x.decidedByName), decideReason: s(x.decideReason),
            };
          })
          .sort((a, b) => b.number.localeCompare(a.number)),
      ),
    (e) => onError?.(e),
  );
}

/** Live purchase orders, newest first (owner / manager only — staff get an empty list). */
export function subscribePurchaseOrders(viewer: ProcureViewer, onData: (rows: PurchaseOrder[]) => void, onError?: (e: Error) => void): () => void {
  const q = viewer.role === "staff" ? null : scoped("purchaseOrders", viewer, "createdBy");
  if (!q) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            const st = s(x.status) as PoStatus;
            return {
              id: d.id, number: s(x.number), status: st in PO_STATUS_LABEL ? st : "pendingApproval", vendorId: s(x.vendorId), vendorName: s(x.vendorName), expectedDay: s(x.expectedDay), terms: s(x.terms),
              lines: lines(x.lines), total: n(x.total), prId: s(x.prId), branchId: s(x.branchId), orderDay: s(x.orderDay), createdBy: s(x.createdBy), createdByName: s(x.createdByName), approvedByName: s(x.approvedByName), decideReason: s(x.decideReason),
              receivedQty: Array.isArray(x.receivedQty) ? x.receivedQty.map(n) : [], closedShort: x.closedShort === true,
              billedQty: Array.isArray(x.billedQty) ? x.billedQty.map(n) : [], billedAmount: n(x.billedAmount), heldCount: n(x.heldCount),
            };
          })
          .sort((a, b) => b.number.localeCompare(a.number)),
      ),
    (e) => onError?.(e),
  );
}

export const lineAmount = (l: Pick<ProcureLine, "qty" | "rate">) => Math.round((l.qty * l.rate + Number.EPSILON) * 100) / 100;
/** Shown while typing; the server works the total out again when the order is saved. */
export const linesTotal = (rows: Pick<ProcureLine, "qty" | "rate">[]) => Math.round((rows.reduce((a, l) => a + lineAmount(l), 0) + Number.EPSILON) * 100) / 100;

/** Live goods receipts, newest first (owner / manager only — staff get an empty list). */
export function subscribeGoodsReceipts(viewer: ProcureViewer, onData: (rows: GoodsReceipt[]) => void, onError?: (e: Error) => void): () => void {
  const q = viewer.role === "staff" ? null : scoped("goodsReceipts", viewer, "receivedBy");
  if (!q) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id, number: s(x.number), poId: s(x.poId), poNumber: s(x.poNumber), vendorName: s(x.vendorName), receiveDay: s(x.receiveDay), vendorBillNo: s(x.vendorBillNo), note: s(x.note),
              lines: Array.isArray(x.lines)
                ? x.lines.map((r: unknown) => {
                    const l = (r ?? {}) as DocumentData;
                    return { line: n(l.line), description: s(l.description), unit: s(l.unit), ordered: n(l.ordered), delivered: n(l.delivered), accepted: n(l.accepted), rejected: n(l.rejected), rejectReason: s(l.rejectReason), short: n(l.short), stockNote: s(l.stockNote) };
                  })
                : [],
              acceptedValue: n(x.acceptedValue), hasRejects: x.hasRejects === true, stockSkipped: x.stockSkipped === true, billStatus: s(x.billStatus), receivedByName: s(x.receivedByName), cancelled: x.cancelled === true,
            };
          })
          .sort((a, b) => b.number.localeCompare(a.number)),
      ),
    (e) => onError?.(e),
  );
}

/** Module 3c — a bill that did not match its order / receipts and is held from payment. */
export interface HeldBill {
  id: string;
  billNumber: string;
  vendorName: string;
  poNumber: string;
  total: number;
  issues: { te: string; en: string }[];
}

/** Live bills on hold (owner only: releasing a hold is the owner's decision). */
export function subscribeHeldBills(branchId: string | null, onData: (rows: HeldBill[]) => void, onError?: (e: Error) => void): () => void {
  const col = collection(db, "purchases");
  const q = branchId ? query(col, where("paymentHold", "==", true), where("branchId", "==", branchId)) : query(col, where("paymentHold", "==", true));
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs
          .map((d) => ({ id: d.id, x: d.data() }))
          .filter(({ x }) => x.isDeleted !== true && x.status !== "Cancelled" && x.status !== "cancelled")
          .map(({ id, x }) => ({
            id,
            billNumber: s(x.billNumber),
            vendorName: s(x.vendorNameSnapshot),
            poNumber: s(x.purchaseOrderNumber),
            total: n(x.totalAmount),
            issues: Array.isArray((x.match as DocumentData | undefined)?.issues) ? ((x.match as DocumentData).issues as DocumentData[]).map((i) => ({ te: s(i.te), en: s(i.en) })) : [],
          })),
      ),
    (e) => onError?.(e),
  );
}

