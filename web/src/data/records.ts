import {
  addDoc,
  collection,
  doc,
  type DocumentData,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  type Query,
} from "firebase/firestore";
import { db } from "../firebase";
import { parseRole, type Role } from "../auth/roles";
import { toCalcMeta, type CalcMeta } from "./calcMode";
import { createStamp, updateStamp } from "./audit";
import { cancelInfo, type CancelInfo } from "./cancel";
import { costTargetFields, toCostTarget, type CostTarget } from "./costTarget";
import type { DueBill } from "./functions";

/**
 * Read models for the modules the Android app writes (quotations, invoices, payments, expenses,
 * purchases, staff, vendors, users). Field names mirror the Kotlin data classes in data/model/.
 *
 * Money is intentionally READ-ONLY on the web: totals, GST and payments are computed and written
 * only by Cloud Functions (data/functions.ts, docs/calc-spec.md); the web never writes those fields.
 * Readers accept both the older Android field names and the server's calc-spec names.
 */

// ---------- helpers ----------

function toDate(value: unknown): Date | null {
  const v = value as { toDate?: () => Date } | null | undefined;
  return v && typeof v.toDate === "function" ? v.toDate() : null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** branchId === null means unfiltered (admin "All Branches"). Sorting is done client-side so no composite index is needed. */
function byBranch(name: string, branchId: string | null): Query<DocumentData> {
  const col = collection(db, name);
  return branchId ? query(col, where("branchId", "==", branchId)) : query(col);
}

/**
 * Purchases / expenses query by role (firestore.rules costDocReadOk): staff may read only the
 * entries they created, so their list must ask for `createdBy == uid` (a branch-wide query is denied);
 * manager = own branch; admin = unfiltered or the selected branch.
 */
export function costDocQuery(name: "purchases" | "expenses", branchId: string | null, ownerUid?: string | null): Query<DocumentData> {
  return ownerUid ? query(collection(db, name), where("createdBy", "==", ownerUid)) : byBranch(name, branchId);
}

type Unsubscribe = () => void;

function subscribe<T>(
  q: Query<DocumentData>,
  map: (id: string, data: DocumentData) => T,
  onData: (rows: T[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => map(d.id, d.data()))),
    (e) => onError?.(e),
  );
}

// ---------- line items (quotations + invoices) ----------

export interface LineItem {
  description: string;
  /** Telugu description (server-made line items). */
  descriptionTe: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** First numeric value among the given candidates (0 if none). */
function firstNum(...values: unknown[]): number {
  for (const v of values) if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

function toLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((li: DocumentData) => ({
    // Android: description/quantity/unitPrice; server (calc §11): item/qty/rate.
    description: str(li.description) || str(li.item) || str(li.name),
    descriptionTe: str(li.descriptionTe),
    quantity: firstNum(li.quantity, li.qty),
    unitPrice: firstNum(li.unitPrice, li.rate),
    amount: num(li.amount),
  }));
}

interface TaxFields {
  subtotal: number;
  gstRate: number;
  isInterState: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  discount: number;
  totalAmount: number;
  /** calc §1 `taxable` (subtotal − discount) when the server stored it; null on older docs. */
  taxable: number | null;
}

function toTax(data: DocumentData): TaxFields {
  const t = (data.totals ?? {}) as DocumentData; // calc §1 output, if stored nested
  return {
    subtotal: num(data.subtotal),
    gstRate: num(data.gstRate),
    isInterState: data.isInterState === true,
    cgstAmount: firstNum(data.cgstAmount, data.cgst, t.cgst),
    sgstAmount: firstNum(data.sgstAmount, data.sgst, t.sgst),
    igstAmount: firstNum(data.igstAmount, data.igst, t.igst),
    taxAmount: firstNum(data.taxAmount, data.tax, t.tax),
    discount: num(data.discount),
    totalAmount: firstNum(data.totalAmount, data.total, t.total),
    taxable: typeof data.taxable === "number" ? data.taxable : typeof t.taxable === "number" ? t.taxable : null,
  };
}

// ---------- quotations ----------

export const QUOTATION_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"] as const;

export interface Quotation extends TaxFields {
  id: string;
  quotationNumber: string;
  bookingId: string;
  customerId: string;
  issueDate: Date | null;
  validUntil: Date | null;
  lineItems: LineItem[];
  status: string;
  branchId: string;
  notes: string;
  /** Server-written title (contract decision 4); empty on older docs. */
  docTitle: string;
  /** Manual / automatic total. */
  calc: CalcMeta;
  /** What saveQuotation needs to re-save it (server-stored `quoteInput`, `menuPackageId`, `selections`). */
  resave: { menuPackageId: string; selections: number[]; quoteInput: Record<string, unknown> } | null;
  /** R7-10 🔒 current version number (1 when never re-saved after Sent) and the one the customer accepted. */
  version: number;
  acceptedVersion: number | null;
  /** 🔒 X9: estimated cost of what the quotation offers, and the margin on the amount before tax (null = cost not fully known). */
  costEstimate: { total: number; perPlate: number; complete: boolean; coveragePct: number | null; marginPct: number | null } | null;
  /** R7-5 per-session inputs when the quotation covers a booking with meal sessions. */
  sessions: { sessionId: string; menuPackageId: string; selections: number[]; quote: Record<string, unknown> }[];
  cancelled: boolean;
  cancelReason: string;
}

/**
 * Per-session inputs of a multi-session quotation. saveQuotation stores them as `sessionQuotes[]`
 * (each with `quoteInput`); older docs used `sessions[]` with `quote` — both are read (QA fix 3).
 */
function toQuoteSessions(data: DocumentData): Quotation["sessions"] {
  const raw: unknown[] =
    Array.isArray(data.sessionQuotes) && data.sessionQuotes.length
      ? data.sessionQuotes
      : Array.isArray(data.sessions)
        ? data.sessions
        : [];
  return raw
    .filter((s): s is DocumentData => !!s && typeof s === "object")
    .map((s) => ({
      sessionId: str(s.sessionId),
      menuPackageId: str(s.menuPackageId),
      selections: Array.isArray(s.selections) ? s.selections.map(num) : [],
      quote: (s.quoteInput && typeof s.quoteInput === "object"
        ? s.quoteInput
        : s.quote && typeof s.quote === "object"
          ? s.quote
          : {}) as Record<string, unknown>,
    }))
    .filter((s) => s.sessionId && s.menuPackageId);
}

function toQuotation(id: string, data: DocumentData): Quotation {
  return {
    id,
    quotationNumber: str(data.quotationNumber),
    bookingId: str(data.bookingId),
    customerId: str(data.customerId),
    issueDate: toDate(data.issueDate),
    validUntil: toDate(data.validUntil),
    lineItems: toLineItems(data.lineItems),
    status: str(data.status) || "Draft",
    branchId: str(data.branchId),
    notes: str(data.notes),
    docTitle: str(data.docTitle),
    calc: toCalcMeta(data),
    resave:
      data.quoteInput && typeof data.quoteInput === "object" && str(data.menuPackageId)
        ? {
            menuPackageId: str(data.menuPackageId),
            selections: Array.isArray(data.selections) ? data.selections.map(num) : [],
            quoteInput: data.quoteInput as Record<string, unknown>,
          }
        : null,
    version: typeof data.version === "number" ? data.version : 1,
    acceptedVersion: typeof data.acceptedVersion === "number" ? data.acceptedVersion : null,
    costEstimate:
      data.costEstimate && typeof data.costEstimate.total === "number"
        ? {
            total: data.costEstimate.total,
            perPlate: num(data.costEstimate.perPlate),
            complete: data.costEstimate.complete === true,
            coveragePct: typeof data.costEstimate.coveragePct === "number" ? data.costEstimate.coveragePct : null,
            marginPct: typeof data.costEstimate.marginPct === "number" ? data.costEstimate.marginPct : null,
          }
        : null,
    sessions: toQuoteSessions(data),
    ...cancelInfo(data),
    ...toTax(data),
  };
}

export function subscribeQuotations(branchId: string | null, onData: (rows: Quotation[]) => void): Unsubscribe {
  return subscribe(byBranch("quotations", branchId), toQuotation, (rows) =>
    onData(rows.sort((a, b) => (b.issueDate?.getTime() ?? 0) - (a.issueDate?.getTime() ?? 0))),
  );
}

/** R7-10 one saved version (🔒 `quotations/{id}/versions/{n}` — the snapshot before a re-save). */
export interface QuotationVersion {
  n: number;
  savedAt: Date | null;
  doc: Quotation;
}

export function subscribeQuotationVersions(
  quotationId: string,
  onData: (rows: QuotationVersion[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "quotations", quotationId, "versions"),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const data = d.data();
            const n = typeof data.version === "number" ? data.version : Number(d.id);
            return {
              n: Number.isFinite(n) ? n : 0,
              savedAt: toDate(data.versionedAt) ?? toDate(data.savedAt) ?? toDate(data.updatedAt) ?? toDate(data.issueDate),
              doc: toQuotation(quotationId, data),
            };
          })
          .sort((a, b) => b.n - a.n),
      ),
    (e) => onError?.(e),
  );
}

/**
 * QA fix 2: Draft → Sent → Accepted / Rejected. firestore.rules lets admin / the branch manager change
 * only status (+ updatedAt / updatedBy) on a quotation that is not cancelled.
 */
export const QUOTATION_STATUS_FLOW: Record<string, string[]> = {
  Draft: ["Sent"],
  Sent: ["Accepted", "Rejected"],
  Rejected: ["Sent"],
  Expired: ["Sent"],
  Accepted: [],
};

export async function setQuotationStatus(id: string, status: (typeof QUOTATION_STATUSES)[number]): Promise<void> {
  await updateDoc(doc(db, "quotations", id), { status, ...updateStamp() });
}

export async function getQuotation(id: string): Promise<Quotation | null> {
  const snap = await getDoc(doc(db, "quotations", id));
  return snap.exists() ? toQuotation(snap.id, snap.data()) : null;
}

// ---------- invoices + payments (admin only per firestore.rules) ----------

export interface Invoice extends TaxFields {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  customerId: string;
  issueDate: Date | null;
  lineItems: LineItem[];
  amountPaid: number;
  balanceDue: number;
  status: string;
  branchId: string;
  /** 🔒 "Invoice" until GST registered, then "Tax Invoice" (server-set; may be absent on old docs). */
  docTitle: string;
  /** 🔒 upi://pay?... link for the balance due (server-set). */
  upiQrPayload: string;
  /** 🔒 Bill terms copied from settings.invoiceTerms when the invoice was made ("" on older invoices). */
  terms: string;
  /** Manual / automatic total. */
  calc: CalcMeta;
  cancelled: boolean;
  cancelReason: string;
}

function toInvoice(id: string, data: DocumentData): Invoice {
  return {
    id,
    invoiceNumber: str(data.invoiceNumber),
    bookingId: str(data.bookingId),
    customerId: str(data.customerId),
    issueDate: toDate(data.issueDate),
    lineItems: toLineItems(data.lineItems),
    amountPaid: num(data.amountPaid),
    balanceDue: num(data.balanceDue),
    status: str(data.status) || "Draft",
    branchId: str(data.branchId),
    docTitle: str(data.docTitle),
    upiQrPayload: str(data.upiQrPayload),
    terms: str(data.terms),
    calc: toCalcMeta(data),
    ...cancelInfo(data),
    ...toTax(data),
  };
}

export function subscribeInvoices(
  branchId: string | null,
  onData: (rows: Invoice[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return subscribe(
    byBranch("invoices", branchId),
    toInvoice,
    (rows) => onData(rows.sort((a, b) => (b.issueDate?.getTime() ?? 0) - (a.issueDate?.getTime() ?? 0))),
    onError,
  );
}

/**
 * QA fix 4: the quotations and invoices of one booking (booking detail "బిల్ తయారు చేయి").
 * branchId set (manager) = also filtered by branch, as firestore.rules canReadMoneyDoc needs.
 */
export function subscribeBookingMoneyDocs(
  bookingId: string,
  branchId: string | null,
  onData: (d: { quotations: Quotation[]; invoices: Invoice[]; loaded: boolean }) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const state = { quotations: [] as Quotation[], invoices: [] as Invoice[], q: false, i: false };
  const q = (name: string) =>
    branchId
      ? query(collection(db, name), where("branchId", "==", branchId), where("bookingId", "==", bookingId))
      : query(collection(db, name), where("bookingId", "==", bookingId));
  const emit = () => onData({ quotations: state.quotations, invoices: state.invoices, loaded: state.q && state.i });
  const u1 = onSnapshot(
    q("quotations"),
    (s) => {
      state.quotations = s.docs.map((d) => toQuotation(d.id, d.data()));
      state.q = true;
      emit();
    },
    (e) => onError?.(e),
  );
  const u2 = onSnapshot(
    q("invoices"),
    (s) => {
      state.invoices = s.docs.map((d) => toInvoice(d.id, d.data()));
      state.i = true;
      emit();
    },
    (e) => onError?.(e),
  );
  return () => {
    u1();
    u2();
  };
}

/** Live invoice (so totals/balance refresh right after recordPayment / refundOrAdjust). */
export function subscribeInvoice(
  id: string,
  onData: (invoice: Invoice | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "invoices", id),
    (snap) => onData(snap.exists() ? toInvoice(snap.id, snap.data()) : null),
    (e) => onError?.(e),
  );
}

export interface Payment {
  id: string;
  amount: number;
  date: Date | null;
  method: string;
  note: string;
  recordedByName: string;
  /** "payment" or "refund" (refunds are stored as negative amounts). */
  type: string;
  cancelled: boolean;
  cancelReason: string;
}

/** Payment/refund date: a Firestore timestamp, or a YYYY-MM-DD string from the callables. */
function paymentDate(v: unknown): Date | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(`${v.slice(0, 10)}T00:00:00+05:30`);
  return toDate(v);
}

export function subscribePayments(invoiceId: string, onData: (rows: Payment[]) => void): Unsubscribe {
  const q = query(collection(db, "invoices", invoiceId, "payments"));
  return subscribe(
    q,
    (id, d) => ({
      id,
      amount: num(d.amount),
      date: paymentDate(d.day) ?? paymentDate(d.date) ?? toDate(d.createdAt),
      method: str(d.method),
      note: str(d.note) || str(d.reason),
      recordedByName: str(d.recordedByName),
      type: str(d.type) || (num(d.amount) < 0 ? "refund" : "payment"),
      ...cancelInfo(d),
    }),
    (rows) => onData(rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))),
  );
}

// ---------- payment status (R7-8: one vocabulary, server-derived) ----------

export type PayStatus = "Unpaid" | "PartiallyPaid" | "Paid";

/** Old free-text statuses (Android "Pending", "Partial", "Fully Paid", …) mapped once to Unpaid / PartiallyPaid / Paid. */
export function toPayStatus(v: unknown): PayStatus | "" {
  const s = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
  if (!s) return "";
  if (s === "paid" || s === "fullypaid" || s === "settled") return "Paid";
  if (s === "partiallypaid" || s === "partial" || s === "advancepaid") return "PartiallyPaid";
  if (s === "unpaid" || s === "pending" || s === "credit") return "Unpaid";
  return "";
}

// ---------- expenses ----------

export const EXPENSE_SECTIONS = [
  "Outside Purchase",
  "Staff Advance",
  "Temporary Staff",
  "Cleaning Department",
  "Transport",
  "Utility Bill",
  "Rent / Fixed Expense",
  "Live Counter",
  "Other Expense",
] as const;

/** Sub-category pickers per section (mirrors Expense.kt subCategoryOptionsFor). */
export const EXPENSE_SUBCATEGORIES: Record<string, string[]> = {
  "Utility Bill": ["Current Bill", "WiFi Bill", "Water Bill", "Phone Bill", "Gas Bill", "Other Utility Bill"],
  "Rent / Fixed Expense": ["Shop Rent", "Kitchen Rent", "Godown Rent", "Office Rent", "Equipment Rent", "Vehicle Rent", "Other Rent"],
  "Live Counter": [
    "Dosa Counter", "Pulka Counter", "Rumali Roti Counter", "Chat Counter", "Pan Counter", "Ice Cream Counter",
    "Juice Counter", "Tea Counter", "Coffee Counter", "Sweet Counter", "Chinese Counter", "Tandoori Counter", "Other Live Counter",
  ],
  "Temporary Staff": [
    "Server", "Cook", "Helper", "Cleaner", "Driver", "Supervisor", "Dish Washing Staff", "Counter Staff", "Live Counter Staff", "Temporary Worker",
  ],
};

/** Mirrors Expense.kt EXPENSE_PAYMENT_METHODS. */
export const ENTRY_PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Credit"] as const;

export interface Expense extends CancelInfo {
  id: string;
  expenseNumber: string;
  section: string;
  subCategory: string;
  personName: string;
  mobileNumber: string;
  quantity: number;
  unit: string;
  rate: number;
  transportCharges: number;
  setupCharges: number;
  otherCharges: number;
  subtotal: number;
  totalAmount: number;
  advancePaid: number;
  /** Server-derived (R7-8); falls back to the old Android balanceAmount. */
  balanceAmount: number;
  paid: number;
  paymentStatus: PayStatus | "";
  paymentMethod: string;
  billNumber: string;
  serviceDate: Date | null;
  createdAt: Date | null;
  staffName: string;
  bookingLabel: string;
  costTarget: CostTarget;
  notes: string;
  branchId: string;
  createdBy: string;
  /** Bill photo (Storage `expenses/{branchId}/…`). */
  photoUrl: string;
}

function toExpense(id: string, d: DocumentData): Expense {
  const total = num(d.totalAmount);
  const paid = typeof d.paid === "number" ? d.paid : num(d.advancePaid);
  return {
    id,
    expenseNumber: str(d.expenseNumber),
    section: str(d.section),
    subCategory: str(d.subCategory),
    personName: str(d.personName),
    mobileNumber: str(d.mobileNumber),
    quantity: num(d.quantity),
    unit: str(d.unit),
    rate: num(d.rate),
    transportCharges: num(d.transportCharges),
    setupCharges: num(d.setupCharges),
    otherCharges: num(d.otherCharges),
    subtotal: num(d.subtotal),
    totalAmount: total,
    advancePaid: num(d.advancePaid),
    balanceAmount: typeof d.balance === "number" ? d.balance : typeof d.balanceAmount === "number" ? d.balanceAmount : Math.max(0, total - paid),
    paid,
    paymentStatus: toPayStatus(d.paymentStatus),
    paymentMethod: str(d.paymentMethod),
    billNumber: str(d.billNumber),
    serviceDate: toDate(d.serviceDate),
    createdAt: toDate(d.createdAt),
    staffName: str(d.staffName),
    bookingLabel: str(d.bookingLabel),
    costTarget: toCostTarget(d),
    notes: str(d.notes),
    branchId: str(d.branchId),
    createdBy: str(d.createdBy),
    photoUrl: str(d.photoUrl) || str(d.receiptPhotoUrl),
    ...cancelInfo(d),
  };
}

/** The date an expense "belongs to": its service date, else when it was entered. */
export function expenseDate(e: Expense): Date | null {
  return e.serviceDate ?? e.createdAt;
}

/** All expenses of the branch, cancelled ones included (pages hide them unless "show cancelled" is on). */
export function subscribeExpenses(
  branchId: string | null,
  onData: (rows: Expense[]) => void,
  /** Staff: their own entries only (createdBy == uid). */
  ownerUid?: string | null,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    costDocQuery("expenses", branchId, ownerUid),
    (snap) => {
      const rows = snap.docs
        .map((d) => toExpense(d.id, d.data()))
        .sort((a, b) => (expenseDate(b)?.getTime() ?? 0) - (expenseDate(a)?.getTime() ?? 0));
      onData(rows);
    },
    (e) => onError?.(e),
  );
}

export interface ExpenseInput {
  id?: string;
  section: string;
  subCategory: string;
  personName: string;
  mobileNumber: string;
  quantity: number;
  unit: string;
  rate: number;
  transportCharges: number;
  setupCharges: number;
  otherCharges: number;
  /** quantity × rate (entered bill data, same as the Android form). */
  subtotal: number;
  totalAmount: number;
  paymentMethod: string;
  billNumber: string;
  serviceDate: Date;
  bookingLabel: string;
  costTarget: CostTarget;
  notes: string;
}

/**
 * Same write shape as ExpenseRepository.kt minus the server-derived keys (R7-8 rules: no
 * paymentStatus / paid / balance from clients). costTarget is required on create (R7-1).
 */
export async function saveExpense(input: ExpenseInput, who: { uid: string; name: string }, branchId: string | null): Promise<string> {
  const data = {
    section: input.section,
    subCategory: input.subCategory,
    personName: input.personName,
    mobileNumber: input.mobileNumber,
    quantity: input.quantity,
    unit: input.unit,
    rate: input.rate,
    transportCharges: input.transportCharges,
    setupCharges: input.setupCharges,
    otherCharges: input.otherCharges,
    subtotal: input.subtotal,
    totalAmount: input.totalAmount,
    // advancePaid is not written any more: the server reads it only for old records; payments go through
    // recordVendorPayment ("ఇప్పుడే చెల్లించాం").
    paymentMethod: input.paymentMethod,
    billNumber: input.billNumber,
    serviceDate: input.serviceDate,
    bookingLabel: input.costTarget.type === "booking" ? input.bookingLabel : "",
    notes: input.notes,
    ...costTargetFields(input.costTarget),
  };
  if (!input.id) {
    if (!branchId) throw new Error("Select a branch first");
    const ref = await addDoc(collection(db, "expenses"), {
      ...data,
      expenseNumber: `EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      staffUid: who.uid,
      staffName: who.name,
      isDeleted: false,
      branchId,
      ...createStamp(),
    });
    return ref.id;
  }
  await updateDoc(doc(db, "expenses", input.id), { ...data, ...updateStamp() });
  return input.id;
}

// ---------- purchases ----------

/** One bill line (mirrors PurchaseItem in Purchase.kt, plus groceryItemId from the grocery master). */
export interface PurchaseLine {
  description: string;
  category: string;
  module: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  /** Linked stock item — the server's purchases trigger adds/removes stock for these lines (R7-2). */
  inventoryItemId: string;
  groceryItemId: string;
  /** Module 2d: date printed on the pack (YYYY-MM-DD) and its batch number — opens a batch when the stock item tracks expiry. */
  expiryDay?: string;
  batchNo?: string;
}

export interface Purchase extends CancelInfo {
  id: string;
  purchaseNumber: string;
  vendorId: string;
  vendorNameSnapshot: string;
  billNumber: string;
  purchaseDate: Date | null;
  items: PurchaseLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  otherCharges: number;
  totalAmount: number;
  /** Server-derived (R7-8). Old docs without `paid` show their old status mapped to the new words. */
  paid: number;
  balance: number;
  paymentStatus: PayStatus | "";
  paymentMethod: string;
  staffName: string;
  billPhotoUrl: string;
  notes: string;
  costTarget: CostTarget;
  branchId: string;
  createdBy: string;
}

/**
 * Attach a bill photo to an existing expense / purchase (admin or the branch's manager; rules check
 * the branch). Only the photo field and updatedAt change — money fields are never touched.
 */
export async function setBillPhoto(kind: "expenses" | "purchases", id: string, url: string): Promise<void> {
  await updateDoc(doc(db, kind, id), {
    [kind === "expenses" ? "photoUrl" : "billPhotoUrl"]: url,
    ...updateStamp(),
  });
}

function toPurchaseLine(v: DocumentData): PurchaseLine {
  return {
    description: str(v.description),
    category: str(v.category),
    module: str(v.module),
    quantity: num(v.quantity),
    unit: str(v.unit),
    unitPrice: num(v.unitPrice),
    amount: num(v.amount),
    inventoryItemId: str(v.inventoryItemId),
    groceryItemId: str(v.groceryItemId),
    ...(typeof v.expiryDay === "string" && v.expiryDay ? { expiryDay: v.expiryDay, batchNo: str(v.batchNo) } : {}),
  };
}

function toPurchase(id: string, p: DocumentData): Purchase {
  const items = Array.isArray(p.items) ? p.items.map((x: DocumentData) => toPurchaseLine(x ?? {})) : [];
  const total = num(p.totalAmount);
  const status = toPayStatus(p.paymentStatus);
  const paid = typeof p.paid === "number" ? p.paid : status === "Paid" ? total : 0;
  return {
    id,
    purchaseNumber: str(p.purchaseNumber),
    vendorId: str(p.vendorId),
    vendorNameSnapshot: str(p.vendorNameSnapshot),
    billNumber: str(p.billNumber),
    purchaseDate: toDate(p.purchaseDate) ?? toDate(p.createdAt),
    items,
    itemCount: items.length,
    subtotal: num(p.subtotal),
    discount: num(p.discount),
    otherCharges: num(p.otherCharges),
    totalAmount: total,
    paid,
    balance: typeof p.balance === "number" ? p.balance : Math.max(0, total - paid),
    paymentStatus: status,
    paymentMethod: str(p.paymentMethod),
    staffName: str(p.staffName),
    billPhotoUrl: str(p.billPhotoUrl),
    notes: str(p.notes),
    costTarget: toCostTarget(p),
    branchId: str(p.branchId),
    createdBy: str(p.createdBy),
    ...cancelInfo(p),
  };
}

/** All purchases of the branch, cancelled ones included (pages hide them unless "show cancelled" is on). */
export function subscribePurchases(
  branchId: string | null,
  onData: (rows: Purchase[]) => void,
  /** Staff: their own entries only (createdBy == uid). */
  ownerUid?: string | null,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    costDocQuery("purchases", branchId, ownerUid),
    (snap) => {
      const rows: Purchase[] = snap.docs
        .map((d) => toPurchase(d.id, d.data()))
        .sort((a, b) => (b.purchaseDate?.getTime() ?? 0) - (a.purchaseDate?.getTime() ?? 0));
      onData(rows);
    },
    (e) => onError?.(e),
  );
}

export async function getPurchase(id: string): Promise<Purchase | null> {
  const snap = await getDoc(doc(db, "purchases", id));
  return snap.exists() ? toPurchase(snap.id, snap.data()) : null;
}

export async function getExpense(id: string): Promise<Expense | null> {
  const snap = await getDoc(doc(db, "expenses", id));
  return snap.exists() ? toExpense(snap.id, snap.data()) : null;
}

export interface PurchaseInput {
  id?: string;
  vendorId: string;
  vendorNameSnapshot: string;
  billNumber: string;
  purchaseDate: Date;
  items: PurchaseLine[];
  subtotal: number;
  discount: number;
  otherCharges: number;
  totalAmount: number;
  paymentMethod: string;
  notes: string;
  costTarget: CostTarget;
}

/**
 * Same write shape as PurchaseRepository.kt, without paymentStatus / paid / balance (server-derived,
 * R7-8) and without any stock call: the server's purchases trigger moves stock for lines with an
 * inventoryItemId (R7-2), and reverses it when the bill is edited or cancelled.
 */
export async function savePurchase(input: PurchaseInput, who: { uid: string; name: string }, branchId: string | null): Promise<string> {
  const data = {
    vendorId: input.vendorId,
    vendorNameSnapshot: input.vendorNameSnapshot,
    billNumber: input.billNumber,
    purchaseDate: input.purchaseDate,
    items: input.items.map((i) => ({ ...i })),
    subtotal: input.subtotal,
    discount: input.discount,
    otherCharges: input.otherCharges,
    totalAmount: input.totalAmount,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    ...costTargetFields(input.costTarget),
  };
  if (!input.id) {
    if (!branchId) throw new Error("Select a branch first");
    const ref = await addDoc(collection(db, "purchases"), {
      ...data,
      purchaseNumber: `PUR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      billPhotoUrl: "",
      staffUid: who.uid,
      staffName: who.name,
      isDeleted: false,
      branchId,
      ...createStamp(),
    });
    return ref.id;
  }
  await updateDoc(doc(db, "purchases", input.id), { ...data, ...updateStamp() });
  return input.id;
}

// ---------- outside orders (R7-6, server-written) ----------

export const OUTSIDE_ORDER_ITEMS = [
  "Small Pulka", "Big Pulka", "Rumali Roti", "Small Rumali Roti", "Big Rumali Roti",
  "Regular Bobbatlu", "Small Bobbatlu", "Big Bobbatlu", "Special Bobbatlu",
  "Ice Cream Cup", "Ice Cream Tub", "Kulfi", "Ice Cream Cone", "Chocobar", "Bulk Ice Cream",
  "Sweet Pan", "Normal Pan", "Meetha Pan", "Special Pan", "Chocolate Pan", "Fire Pan", "Other Pan",
] as const;

export type OutsideOrderStatus = "ordered" | "delivered" | "settled" | "cancelled";

export interface OutsideOrder extends CancelInfo {
  id: string;
  bookingId: string;
  sessionId: string;
  vendorId: string;
  vendorName: string;
  item: string;
  unit: string;
  rate: number;
  orderedQty: number;
  deliveredQty: number;
  acceptedQty: number;
  returnedQty: number;
  rejectReason: string;
  advancePaid: number;
  paid: number;
  /** 🔒 server: round2(acceptedQty × rate − advancePaid − paid). */
  amountDue: number | null;
  paymentStatus: PayStatus | "";
  status: OutsideOrderStatus;
  costTarget: CostTarget;
  notes: string;
  branchId: string;
  createdAt: Date | null;
}

function toOutsideOrder(id: string, d: DocumentData): OutsideOrder {
  const st = str(d.status);
  return {
    id,
    bookingId: str(d.bookingId) || (d.costTarget?.type === "booking" ? str(d.costTarget.bookingId) : ""),
    sessionId: str(d.sessionId) || (d.costTarget?.type === "booking" ? str(d.costTarget.sessionId) : ""),
    vendorId: str(d.vendorId),
    vendorName: str(d.vendorName),
    item: str(d.item),
    unit: str(d.unit),
    rate: num(d.rate),
    orderedQty: num(d.orderedQty),
    deliveredQty: num(d.deliveredQty),
    acceptedQty: num(d.acceptedQty),
    returnedQty: num(d.returnedQty),
    rejectReason: str(d.rejectReason),
    advancePaid: num(d.advancePaid),
    paid: num(d.paid),
    amountDue: typeof d.amountDue === "number" ? d.amountDue : null,
    paymentStatus: toPayStatus(d.paymentStatus),
    status: (["ordered", "delivered", "settled", "cancelled"].includes(st) ? st : "ordered") as OutsideOrderStatus,
    costTarget: toCostTarget(d),
    notes: str(d.notes),
    branchId: str(d.branchId),
    createdAt: toDate(d.createdAt),
    ...cancelInfo(d),
  };
}

/** Managers must query with branchId (rules: canReadMoneyDoc). */
export function subscribeOutsideOrders(
  branchId: string | null,
  onData: (rows: OutsideOrder[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return subscribe(
    byBranch("outsideOrders", branchId),
    toOutsideOrder,
    (rows) => onData(rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))),
    onError,
  );
}

/** Cost docs tagged to one booking (booking detail costs card). */
export function subscribeBookingCosts(
  bookingId: string,
  branchId: string | null,
  onData: (c: { purchases: Purchase[]; expenses: Expense[]; outsideOrders: OutsideOrder[] }) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const state = { purchases: [] as Purchase[], expenses: [] as Expense[], outsideOrders: [] as OutsideOrder[] };
  const q = (name: string) =>
    branchId
      ? query(collection(db, name), where("branchId", "==", branchId), where("bookingId", "==", bookingId))
      : query(collection(db, name), where("bookingId", "==", bookingId));
  const emit = () => onData({ ...state });
  const u1 = onSnapshot(q("purchases"), (s) => { state.purchases = s.docs.map((d) => toPurchase(d.id, d.data())); emit(); }, (e) => onError?.(e));
  const u2 = onSnapshot(q("expenses"), (s) => { state.expenses = s.docs.map((d) => toExpense(d.id, d.data())); emit(); }, (e) => onError?.(e));
  const u3 = onSnapshot(q("outsideOrders"), (s) => { state.outsideOrders = s.docs.map((d) => toOutsideOrder(d.id, d.data())); emit(); }, (e) => onError?.(e));
  return () => { u1(); u2(); u3(); };
}

// ---------- payroll (admin) ----------

/**
 * QA fix 9: when finalizePayroll already ran for the month (payslips payroll/{month}_{staffId} carry
 * finalized / finalizedAt), the latest finalizedAt; null = not finalized. Admin-only read (firestore.rules).
 */
export async function getPayrollFinalizedAt(month: string): Promise<Date | null> {
  const snap = await getDocs(query(collection(db, "payroll"), where("month", "==", month)));
  let latest: Date | null = null;
  for (const d of snap.docs) {
    const x = d.data();
    if (x.finalized !== true) continue;
    const at = toDate(x.finalizedAt) ?? toDate(x.updatedAt) ?? new Date(0);
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

// ---------- staff ----------

export interface Staff extends CancelInfo {
  id: string;
  name: string;
  phone: string;
  jobRole: string;
  dailyWage: number;
  active: boolean;
  joinedDate: Date | null;
  branchId: string;
  /** R10-2 (🔒 ratingOnWrite): month "YYYY-MM" → { avg, count }. */
  ratings: Record<string, { avg: number | null; count: number }>;
}

function toRatings(v: unknown): Record<string, { avg: number | null; count: number }> {
  const out: Record<string, { avg: number | null; count: number }> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const o = (x ?? {}) as { avg?: unknown; count?: unknown };
    out[k] = { avg: typeof o.avg === "number" ? o.avg : null, count: typeof o.count === "number" ? o.count : 0 };
  }
  return out;
}

/**
 * Module 4d: daily wage of each person, read from staff/{id}/private/pay (owner only). A person whose figure has
 * not been moved yet is simply missing from the map — the caller falls back to the staff document.
 */
export async function fetchStaffWages(ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(
    ids.map(async (id) => {
      const snap = await getDoc(doc(db, "staff", id, "private", "pay")).catch(() => null);
      const v = snap?.exists() ? snap.data().dailyWage : undefined;
      if (typeof v === "number") out[id] = v;
    }),
  );
  return out;
}

export function subscribeStaff(branchId: string | null, onData: (rows: Staff[]) => void): Unsubscribe {
  return subscribe(
    byBranch("staff", branchId),
    (id, d) => ({
      id,
      name: str(d.name),
      phone: str(d.phone),
      jobRole: str(d.jobRole),
      dailyWage: num(d.dailyWage),
      active: d.active !== false,
      joinedDate: toDate(d.joinedDate),
      branchId: str(d.branchId),
      ratings: toRatings(d.ratings),
      ...cancelInfo(d),
    }),
    (rows) => onData(rows.sort((a, b) => a.name.localeCompare(b.name))),
  );
}

// ---------- vendors (admin may add / edit) ----------

export interface Vendor extends CancelInfo {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

export function subscribeVendors(onData: (rows: Vendor[]) => void): Unsubscribe {
  return subscribe(
    query(collection(db, "vendors")),
    (id, d) => ({ id, name: str(d.name), phone: str(d.phone), address: str(d.address), notes: str(d.notes), ...cancelInfo(d) }),
    (rows) => onData(rows.sort((a, b) => a.name.localeCompare(b.name))),
  );
}

/** Same write shape as VendorRepository.kt. */
export async function saveVendor(input: Omit<Vendor, "id" | "cancelled" | "cancelReason"> & { id?: string }): Promise<void> {
  const data = { name: input.name, phone: input.phone, address: input.address, notes: input.notes };
  if (!input.id) {
    await addDoc(collection(db, "vendors"), { ...data, ...createStamp() });
  } else {
    await updateDoc(doc(db, "vendors", input.id), { ...data, ...updateStamp() });
  }
}

// ---------- users (admin: approve sign-ups, set role and branch) ----------

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  active: boolean;
  branchId: string;
  /** Module 4d: business role ("" = none) */
  jobRole: string;
  createdAt: Date | null;
}

export function subscribeUsers(onData: (rows: AppUser[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return subscribe(
    query(collection(db, "users")),
    (uid, d) => ({
      uid,
      name: str(d.name),
      email: str(d.email),
      phone: str(d.phone),
      role: parseRole(d.role),
      active: d.active === true,
      branchId: str(d.branchId),
      jobRole: str(d.jobRole),
      createdAt: toDate(d.createdAt),
    }),
    // Waiting-for-approval users first, then by name.
    (rows) => onData(rows.sort((a, b) => Number(a.active) - Number(b.active) || a.name.localeCompare(b.name))),
    onError,
  );
}

export async function updateUser(
  uid: string,
  changes: Partial<Pick<AppUser, "active" | "role" | "branchId" | "jobRole">>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid), { ...changes, ...updateStamp() });
}

// ---------- vendor bills (R7-8 pay dialog; getVendorDues returns only totals per vendor) ----------

function isoDay(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/**
 * Open bills of one vendor (admin): by vendorId when known, else by the name the server groups on
 * (purchases vendorNameSnapshot, expenses personName, outside orders vendorName). Oldest first.
 */
export async function loadOpenBills(vendorId: string, vendorName: string): Promise<DueBill[]> {
  // Same vendor key as the server (vendors/billRules.ts vendorKeyOf): vendorId, else the name trimmed + lower-cased
  // (purchases: vendorNameSnapshot || vendorName; expenses: vendorName || personName; outside orders: vendorName).
  const key = vendorName.trim().toLowerCase();
  const nameOf = (col: string, d: DocumentData) =>
    (col === "purchases" ? str(d.vendorNameSnapshot) || str(d.vendorName) : col === "expenses" ? str(d.vendorName) || str(d.personName) : str(d.vendorName))
      .trim()
      .toLowerCase();
  const fetch = async (col: string, nameFields: string[]) => {
    if (vendorId) return (await getDocs(query(collection(db, col), where("vendorId", "==", vendorId)))).docs;
    const names = [...new Set([vendorName, vendorName.trim()])];
    const snaps = await Promise.all(nameFields.flatMap((f) => names.map((n) => getDocs(query(collection(db, col), where(f, "==", n))))));
    const seen = new Map<string, (typeof snaps)[number]["docs"][number]>();
    for (const sn of snaps) for (const d of sn.docs) if (!str(d.data().vendorId) && nameOf(col, d.data()) === key) seen.set(d.id, d);
    return [...seen.values()];
  };
  const [pDocs, eDocs, oDocs] = await Promise.all([
    fetch("purchases", ["vendorNameSnapshot", "vendorName"]),
    fetch("expenses", ["vendorName", "personName"]),
    fetch("outsideOrders", ["vendorName"]),
  ]);
  const p = { docs: pDocs };
  const e = { docs: eDocs };
  const o = { docs: oDocs };
  const bills: DueBill[] = [
    ...p.docs.map((d) => ({ ...toPurchase(d.id, d.data()), held: d.data().paymentHold === true })).filter((x) => !x.cancelled && x.balance > 0.005).map((x) => ({
      collection: "purchases" as const,
      held: x.held,
      id: x.id,
      label: x.billNumber || x.purchaseNumber,
      date: isoDay(x.purchaseDate),
      amount: x.totalAmount,
      paid: x.paid,
      balance: x.balance,
      paymentStatus: x.paymentStatus,
    })),
    ...e.docs.map((d) => toExpense(d.id, d.data())).filter((x) => !x.cancelled && x.balanceAmount > 0.005).map((x) => ({
      collection: "expenses" as const,
      id: x.id,
      label: x.billNumber || x.subCategory || x.section,
      date: isoDay(expenseDate(x)),
      amount: x.totalAmount,
      paid: x.paid,
      balance: x.balanceAmount,
      paymentStatus: x.paymentStatus,
    })),
    ...o.docs.map((d) => toOutsideOrder(d.id, d.data())).filter((x) => !x.cancelled && x.status === "delivered" && (x.amountDue ?? 0) > 0.005).map((x) => ({
      collection: "outsideOrders" as const,
      id: x.id,
      label: x.item,
      date: isoDay(x.createdAt),
      amount: Math.round(((x.amountDue ?? 0) + x.advancePaid + x.paid) * 100) / 100,
      paid: x.advancePaid + x.paid,
      balance: x.amountDue ?? 0,
      paymentStatus: x.paymentStatus,
    })),
  ];
  return bills.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}
