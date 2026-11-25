import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { hiIfOn, type Bilingual, type Lang } from "../i18n/LanguageContext";
import type { CalcMode, CalcModes } from "./calcMode";
import type { TimelineMeal, TimelineStep } from "../util/timeline";
import type { CostTarget } from "./costTarget";

/**
 * Typed wrappers for the Cloud Functions in docs/api-contract.md (v2 onCall, region asia-south1).
 *
 * Money is computed ONLY by these functions. The web never writes totals, GST, payments, profit,
 * targets or wages to Firestore itself — it sends the inputs and shows what comes back.
 *
 * Errors: the server throws HttpsError(code, message, details = { te, en }). `callable()` turns that
 * into a CallableError so screens can show `errorText(e, lang)` in the owner's language.
 */
export const regionalFunctions = functions;

export class CallableError extends Error {
  code: string;
  te: string;
  en: string;
  /** The server's raw `details` object (e.g. closeEvent's `blockers`). */
  details: Record<string, unknown> | null;
  constructor(code: string, te: string, en: string, details: Record<string, unknown> | null = null) {
    super(en || te || code);
    this.name = "CallableError";
    this.code = code;
    this.te = te;
    this.en = en;
    this.details = details;
  }
}

const FALLBACK: Record<string, Bilingual> = {
  "permission-denied": { te: "ఈ పని చేయడానికి మీకు అనుమతి లేదు.", en: "You are not allowed to do this." },
  unauthenticated: { te: "దయచేసి మళ్ళీ sign in చేయండి.", en: "Please sign in again." },
  "not-found": { te: "ఈ record దొరకలేదు.", en: "Not found." },
  "failed-precondition": { te: "ఇప్పుడు ఈ పని చేయలేము.", en: "This can't be done right now." },
  "invalid-argument": { te: "నమోదు చేసిన వివరాలు సరిగా లేవు.", en: "Some details are not valid." },
  unavailable: { te: "Internet లేదు లేదా server అందుబాటులో లేదు. మళ్ళీ ప్రయత్నించండి.", en: "No connection or server unavailable. Try again." },
  internal: { te: "Server లో సమస్య వచ్చింది. మళ్ళీ ప్రయత్నించండి.", en: "Server error. Please try again." },
};

function toCallableError(e: unknown): CallableError {
  const err = e as { code?: unknown; message?: unknown; details?: unknown } | null;
  const rawCode = typeof err?.code === "string" ? err.code : "internal";
  const code = rawCode.replace(/^functions\//, "");
  const details = err?.details as Partial<Bilingual> | null | undefined;
  const message = typeof err?.message === "string" ? err.message : "";
  const fb = FALLBACK[code] ?? FALLBACK.internal;
  const te = typeof details?.te === "string" && details.te ? details.te : fb.te;
  const en = typeof details?.en === "string" && details.en ? details.en : message || fb.en;
  const raw = details && typeof details === "object" ? (details as Record<string, unknown>) : null;
  return new CallableError(code, te, en, raw);
}

/** Error text for the UI language. Works for CallableError and plain errors. */
export function errorText(e: unknown, lang: Lang): string {
  // Hindi sees lang "en": the English server message is looked up in the Hindi dictionary (unknown text stays English).
  if (e instanceof CallableError) return lang === "te" ? e.te || e.en : hiIfOn(e.en || e.te);
  if (e instanceof Error && e.message) return e.message;
  return lang === "te" ? "ఏదో తప్పు జరిగింది." : "Something went wrong.";
}

function callable<Req, Res>(name: string, options?: { timeout?: number }) {
  const fn = httpsCallable<Req, Res>(regionalFunctions, name, options);
  return async (request: Req): Promise<Res> => {
    try {
      const result = await fn(request);
      return result.data;
    } catch (e) {
      throw toCallableError(e);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Settings & setup
// ---------------------------------------------------------------------------------------------

export interface BankDetails {
  name: string;
  account: string;
  ifsc: string;
}

/** `settings/business.monthlyPayRules` (contract decision 3, calc §7b). Advances are always deducted. */
export interface MonthlyPayRules {
  deductAbsences: boolean;
  freeLeaves: number;
  overtime: boolean;
}

export interface BusinessSettingsInput {
  name?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  fssaiNumber?: string;
  bank?: BankDetails;
  upiId?: string;
  signatureUrl?: string;
  terms?: string;
  /** Bill terms printed on invoices (settings.invoiceTerms, ≤ 5,000 chars; server default when blank). */
  invoiceTerms?: string;
  profitMarginPct?: number;
  seasonWeights?: number[];
  gstin?: string;
  gstRate?: number;
  monthlyPayRules?: MonthlyPayRules;
  /** Manual / automatic mode per area, and whether managers may override values. */
  calcModes?: CalcModes;
  managerCanOverride?: boolean;
  /** Round 6 A: take stock out automatically when an event is Completed (default true). */
  autoStockDeduct?: boolean;
  /** Module 1a: who gets a new lead (auto on/off, turn by turn or by source). */
  leadAssign?: LeadAssignConfig;
  /** Module 1b: first response within N minutes (on/off, minutes, tell the owner at 2 × N). */
  leadTat?: LeadTatConfig;
  /** Module 2d: daily notice about stock close to / past its expiry date. */
  expiryAlert?: { on: boolean; days: number };
  /** Module 2g: reserve stock for confirmed events of the next N days. */
  stockReserve?: { on: boolean; days: number };
  /** Module 2h: pack unit names offered on purchases (the fixed units are always offered). */
  uomPacks?: string[];
  /** Module 3a: a manager's purchase order above managerLimit (₹) waits for the owner. */
  poApproval?: { on: boolean; managerLimit: number };
  /** Module 4d: when a hand change of stock waits for a supervisor. */
  stockAdjust?: { on: boolean; percent: number };
  /** Module 5e: the owner's food-safety checklists. */
  foodSafety?: { checklists: { id: string; kind: string; te: string; en: string; active: boolean; items: { key: string; te: string; en: string; type: "yesno" | "number"; min: number | null; max: number | null; unit: string }[] }[] };
  /** Module 5h: the owner's allergen list. */
  allergens?: { id: string; te: string; en: string }[];
  /** Module 4d: separation of duties in the purchase flow. */
  sod?: { on: boolean; minAmount: number; ownerExempt: boolean };
  /** Round 7: legal entity, brand, and whether documents show "brand (a brand of legal name)". */
  legalName?: string;
  brandName?: string;
  legalNameOnDocs?: boolean;
  /** Round 11: Target Board shows ₹ sales to managers and staff too (default false). Profit stays owner-only. */
  targetBoardShowRupeesToAll?: boolean;
  /** R10-5 */
  fixedMonthlyCosts?: { kitchenRent: number; other: number };
  googleReviewUrl?: string;
  vendorPriceAlertPct?: number;
  targetMarginPct?: number;
  labourPerPlate?: number;
  overheadPerPlate?: number;
  lunchBoxPrice?: number;
  /** R10-8: message type → Meta template name ("" removes it). */
  whatsappTemplates?: Record<string, string>;
}

/** Contract decision 7. */
export interface SetupProgress {
  business: boolean;
  bank: boolean;
  signature: boolean;
  staff: boolean;
  photos: boolean;
  pct: number;
}

export const saveBusinessSettings = callable<BusinessSettingsInput, { ok: boolean; setupProgress: SetupProgress }>(
  "saveBusinessSettings",
);

export type ImportKind = "customers" | "staff" | "menuItems" | "vendors" | "leads";

export interface ImportRowsResult {
  created: number;
  skipped: { row: number; reason: Bilingual }[];
}

/** `skipped[].row` is the 1-based data row within the call's `rows` (header not counted). */
export const importRows = callable<
  { kind: ImportKind; rows: Record<string, string>[]; branchId?: string },
  ImportRowsResult
>("importRows");

// ---------------------------------------------------------------------------------------------
// Menus, quotations, invoices, payments
// ---------------------------------------------------------------------------------------------

export interface QuoteRequest {
  menuPackageId: string;
  plates: number;
  servingBoys: number;
  transport: number;
  replacements: string[];
  extras: { key: string; qty: number; price?: number }[];
  discount?: number;
  /** R10-11: kids plates on top of `plates` (package kidsPrice); special meals inside `plates` (extraPerPlate optional). */
  kidsCount?: number;
  specialMeals?: { type: string; count: number; note?: string; extraPerPlate?: number }[];
}

export interface InvoiceTotals {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
}

/** calc-spec §11 `Quote` + `priceReviewDue`. Line names: plates, replacement:<key>, extra:<key>, servingBoys, transport. */
export interface Quote {
  belowMinimum: boolean;
  freePlates: number;
  platesToCook: number;
  freeServingBoys: number;
  chargedServingBoys: number;
  lines: { item: string; qty: number; rate: number; amount: number }[];
  subtotal: number;
  totals: InvoiceTotals;
  priceReviewDue: boolean;
}

export const quoteMenu = callable<QuoteRequest, Quote>("quoteMenu");

/** Contract "Manual and automatic mode": `manual: { <value fields>, reason (≥ 3 chars) }`. */
export type Manual<T> = T & { reason: string };

export interface SaveQuotationRequest {
  quotationId?: string;
  customerId: string;
  bookingId?: string;
  menuPackageId: string;
  /** Chosen option index per "/" group. */
  selections: number[];
  quote: QuoteRequest;
  validDays?: number;
  notes?: string;
  /** Manual total for this quotation; omitted = automatic. */
  manual?: Manual<{ total: number }>;
  /** Selected branch, sent for quotations without a booking (contract audit fix 9). */
  branchId?: string;
  /** R7-5: one quotation for a booking with meal sessions — line items labelled by session. */
  sessions?: { sessionId: string; menuPackageId: string; selections: number[]; quote: QuoteRequest }[];
}

export const saveQuotation = callable<SaveQuotationRequest, { quotationId: string; quotationNumber: string }>(
  "saveQuotation",
);

export const generateInvoiceFromBooking = callable<{ bookingId: string }, { invoiceId: string; invoiceNumber: string }>(
  "generateInvoiceFromBooking",
);

export type PaymentMethod = "Cash" | "UPI" | "BankTransfer" | "Card" | "Other";
export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "UPI", "BankTransfer", "Card", "Other"];

export interface PaymentResult {
  newPaid: number;
  newBalance: number;
  status: string;
}

export const recordPayment = callable<
  { invoiceId: string; amount: number; method: PaymentMethod; date: string; note?: string },
  PaymentResult
>("recordPayment");

/**
 * Manual invoice total: `{ invoiceId, total, reason }` (contract). "Switch to automatic" is sent as
 * `{ invoiceId, auto: true }` — the contract does not name that request yet (see docs/web-notes.md).
 */
export const overrideInvoiceTotal = callable<
  { invoiceId: string; total: number; reason: string } | { invoiceId: string; auto: true },
  { ok: boolean; calcMode?: CalcMode }
>("overrideInvoiceTotal");

export const refundOrAdjust = callable<{ invoiceId: string; amount: number; reason: string }, PaymentResult>(
  "refundOrAdjust",
);

// ---------------------------------------------------------------------------------------------
// Kitchen & event stock (Round 6 A)
// ---------------------------------------------------------------------------------------------

export interface GroceryLine {
  groceryItemId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  quantity: number;
  inStock: number;
  toBuy: number;
}

/** calc §6 grocery quantities for an event (used to pre-fill manual stock quantities). */
export const groceryList = callable<
  { guests: number; eventTypeCode: string; bookingId?: string; sessionId?: string },
  { items: GroceryLine[] }
>("groceryList");

/** Take this event's groceries out of stock now. `items` = manual quantities (then `reason` ≥ 3 chars is required). */
export const applyEventStock = callable<
  { bookingId: string; items?: { groceryItemId: string; quantity: number }[]; reason?: string },
  { ok: boolean }
>("applyEventStock");

/** Put an event's stock deduction back (admin). */
export const reverseEventStock = callable<{ bookingId: string; reason: string }, { ok: boolean }>("reverseEventStock");

// ---------------------------------------------------------------------------------------------
// Service timeline (Round 6 C) — calc §12 runs only on the server
// ---------------------------------------------------------------------------------------------

export type ServiceTimelineRequest =
  | { bookingId: string; sessionId?: string }
  | { eventDay: string; serveTime: string; guests: number; mealType: TimelineMeal; travelMinutes: number };

export interface ServiceTimeline {
  steps: TimelineStep[];
  serveTime: string;
  travelMinutes: number;
  mealType: TimelineMeal;
  /** True when the server filled in a default (serve time / travel / meal) the booking didn't have. */
  defaultsUsed: boolean | string[];
}

export const getServiceTimeline = callable<ServiceTimelineRequest, ServiceTimeline>("getServiceTimeline");

// ---------------------------------------------------------------------------------------------
// Change history (Round 6 B)
// ---------------------------------------------------------------------------------------------

export interface HistoryEntry {
  id: string;
  kind: "change" | "override";
  collection: string;
  docId: string;
  path: string;
  /** create / update / delete, or a callable's own action (e.g. "saveQuotation", "cancelBooking:invoice"). */
  action: "create" | "update" | "delete" | (string & {});
  /** Server-written one-line description { te, en } (audit entries since the final QA fixes); null on older entries. */
  summary?: { te?: string; en?: string } | null;
  changed: string[];
  diff: Record<string, { before: unknown; after: unknown }>;
  by: string;
  byName?: string;
  /** Timestamp as the callable returns it (ISO string, millis, or {_seconds}). */
  at: unknown;
  branchId?: string;
  reason?: string;
}

export interface HistoryQuery {
  collection?: string;
  docId?: string;
  by?: string;
  fromDay?: string;
  toDay?: string;
  limit?: number;
  startAfter?: string;
}

export const getHistory = callable<HistoryQuery, { entries: HistoryEntry[]; nextCursor: string | null }>("getHistory");

// ---------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------

export interface PayrollRow {
  staffId: string;
  name: string;
  payType: "daily" | "monthly";
  gross: number;
  cut: number;
  ot: number;
  advances: number;
  net: number;
  /** R10-1: "అడ్వాన్స్ కోత" per advance; what is left carries to next month. */
  advanceTakes?: { id: string; balanceBefore: number; take: number; balanceAfter: number }[];
  advanceCarry?: number;
  /** Manual-mode fields (present when the row was overridden). */
  calcMode?: CalcMode;
  autoValue?: number | null;
  overriddenBy?: { uid: string; name: string } | null;
  overrideReason?: string;
  /** Module 4e: from the stored payslip — is the month finalized for this person, the fixed net pay, and what has been handed over. */
  finalized?: boolean;
  finalNet?: number;
  paid?: number;
}

/** Module 4e: salary money handed over (owner). Part payments are allowed. */
export const recordSalaryPayment = callable<{ month: string; staffId: string; amount: number; date: string; method: string; note?: string }, { ok: boolean; id: string; paidTotal: number; balance: number; status: string }>("recordSalaryPayment");
export const cancelSalaryPayment = callable<{ id: string; reason: string }, { ok: boolean; paidTotal: number }>("cancelSalaryPayment");

export const monthPayroll = callable<{ month: string }, { rows: PayrollRow[] }>("monthPayroll");

/** Manual net pay for one staff row. "Switch to automatic" = `{ month, staffId, auto: true }` (assumed). */
export const overridePayrollRow = callable<
  { month: string; staffId: string; net: number; reason: string } | { month: string; staffId: string; auto: true },
  { ok: boolean }
>("overridePayrollRow");

/**
 * Saved cooking plan per event → bookings/{id}/cookingPlan/{dishId}. Automatic items get the server's
 * suggestion (client quantity ignored); manual items keep the typed quantity; `reason` required when any is manual.
 */
export const saveCookingPlan = callable<
  { bookingId: string; items: { dishId: string; quantity?: number; manual: boolean }[]; reason?: string },
  { items: { dishId: string; unit: string; quantity: number; autoValue: number; calcMode: CalcMode }[] }
>("saveCookingPlan");

export interface CookingLine {
  dishId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  quantity: number;
  learnedPer100: number;
  changePct: number;
  advice: "cut" | "add" | "ok" | string;
  eventsUsed: number;
}

/** calc §5 suggested quantities (all dishes, or the dishes of a menu package). */
export const cookingPlan = callable<
  { guests: number; eventTypeCode: string; dishIds?: string[]; menuPackageId?: string; bookingId?: string; sessionId?: string },
  { items: CookingLine[] }
>("cookingPlan");

/** R7-2 reasons for a manual stock change (the only way stock changes from a screen). */
export const STOCK_REASONS = ["count", "damage", "return", "correction"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** Stock in / out (inventory). Errors come back as CallableError like every other callable. */
export const adjustStock = callable<
  { itemId: string; type: "IN" | "OUT"; quantity: number; reason: StockReason | string; note?: string; relatedBookingId?: string; expiryDay?: string; batchNo?: string },
  { ok: boolean; newQuantity: number; /** Module 4d: true = kept as a request, stock unchanged until approved */ pending?: boolean; requestId?: string }
>("adjustStock");

/** Module 4d (B5): approve / reject a waiting stock adjustment. */
export const decideStockAdjust = callable<{ id: string; approve: boolean; note?: string }, { ok: boolean; status: string; newQuantity: number | null }>("decideStockAdjust");

// ---------------------------------------------------------------------------------------------
// Targets & reports
// ---------------------------------------------------------------------------------------------

export interface MonthPlan {
  original: number;
  revised: number;
  isActual: boolean;
}

export const setYearTarget = callable<
  {
    year: number;
    yearTarget: number;
    profitMarginPct?: number;
    weights?: number[];
    /** Owner-typed month targets (null = automatic). Any number → targets mode manual (planner won't re-plan). */
    manualMonths?: (number | null)[];
    manual?: Manual<object>;
  },
  { months: MonthPlan[]; aheadOrBehind?: number }
>("setYearTarget");

/** Contract decision 5. */
export interface CountProgress {
  actual: number;
  target: number | null;
}

/**
 * Round 11: the server filters by role. `percentOnly` → every ₹ field is null (percentages and progress only);
 * `showProfit` false (manager / staff) → profit fields are null. Clients show what they get, nothing more.
 */
export interface TargetBoard {
  yearTarget: number | null;
  yearActual: number | null;
  monthTarget: number | null;
  monthActual: number | null;
  profitTarget: number | null;
  profitActual: number | null;
  events: CountProgress;
  bookings: CountProgress;
  daysLeft: number;
  dailyNeeded: number | null;
  hitTarget: boolean;
  percentOnly: boolean;
  /** Manual / automatic stamp of this month's target (contract audit fix 5). */
  monthCalcMode?: CalcMode;
  monthAutoValue?: number | null;
  /** This month's income as % of its target (0–100+, 1 decimal). */
  incomePct: number | null;
  /** This month's profit as % of its target. */
  profitPct: number | null;
  /** Not in the contract table; the backend also sends it (docs/backend-notes.md). Used when present. */
  yearPct?: number | null;
  /** Round 11 */
  year?: number;
  todayTarget?: number | null;
  todayActual?: number | null;
  todayPct?: number | null;
  todayHit?: boolean;
  aheadOrBehind?: number | null;
  aheadStatus?: "ahead" | "behind" | "onTrack";
  showProfit?: boolean;
  generatedAt?: string;
}

export const getTargetBoard = callable<{ month: string }, TargetBoard>("getTargetBoard");

export type PnlPeriod = "day" | "week" | "month" | "3m" | "6m" | "12m";

export interface Pnl {
  /** ISO instants; `end` is exclusive (calc §9). */
  range: { start: string; end: string };
  income: number;
  food: number;
  labour: number;
  other: number;
  ads: number;
  profit: number;
  marginPct: number | null;
  primeCost: { pct: number; band: "good" | "warn" | "bad" } | null;
  breakEven: number | null;
  leaks: { te: string; en: string; amount: number }[];
  series: { label: string; income: number; profit: number }[];
  /** Round 9 (present on newer servers): income = eventRevenue + cancellationCharges ("రద్దు చార్జీ"). */
  eventRevenue?: number;
  cancellationCharges?: number;
  cancellations?: { count: number; refunded: number; kept: number };
  /** Round 9: costs of cancelled orders not covered by the kept charge ("రద్దైన event ఖర్చు"), if the server sends it. */
  cancelLoss?: number;
}

export const getPnl = callable<{ period: PnlPeriod }, Pnl>("getPnl");

// ---------------------------------------------------------------------------------------------
// Agents & messages
// ---------------------------------------------------------------------------------------------

export const setAgentEnabled = callable<{ agentId: string; enabled: boolean }, { ok: boolean }>("setAgentEnabled");
export const approveMessage = callable<{ messageId: string }, { status: string }>("approveMessage");
/** Agents can run for minutes — client timeout 540 s (contract audit fix 10). */
export const runAgentNow = callable<{ agentId: string }, { runId: string }>("runAgentNow", { timeout: 540_000 });

// ---------------------------------------------------------------------------------------------
// Round 7 (docs/api-contract.md → "Round 7")
// ---------------------------------------------------------------------------------------------

/**
 * R7-3: collections that are cancelled (transactions) or archived (master data) instead of deleted.
 * Bookings are not in this list any more: Round 9 cancels an order only through `cancelBooking`
 * (cancelRecord refuses a booking when money was paid).
 */
export type CancelCollection =
  | "customers"
  | "leads"
  | "quotations"
  | "invoices"
  | "payments"
  | "purchases"
  | "expenses"
  | "outsideOrders"
  | "staff"
  | "attendance"
  | "inventory"
  | "vendors"
  | "menuPackages"
  | "menuItems"
  | "dishes"
  | "groceryItems"
  | "equipment"
  | "vehicles"
  | "staffAdvances"
  | "lunchBoxOrders"
  | "tasks"
  | "shifts"
  | "staffRatings";

/** Cancel (status "Cancelled") or archive (archived: true) with a reason ≥ 3 characters; the server reverses stock where needed. */
export const cancelRecord = callable<
  { collection: CancelCollection; id: string; reason: string; invoiceId?: string },
  { ok: boolean; kind?: string; stockReturned?: boolean }
>("cancelRecord");

/** R7-6 outside orders. Money (amountDue) is server-owned; the client sends quantities and the agreed rate. */
export interface OutsideOrderInput {
  id?: string;
  bookingId: string;
  sessionId?: string;
  vendorId?: string;
  vendorName: string;
  item: string;
  unit: string;
  rate: number;
  orderedQty: number;
  advancePaid: number;
  costTarget: CostTarget;
  notes?: string;
  branchId?: string;
}
export const saveOutsideOrder = callable<OutsideOrderInput, { id: string }>("saveOutsideOrder");
export const recordOutsideDelivery = callable<
  { id: string; deliveredQty: number; acceptedQty: number; returnedQty: number; rejectReason?: string },
  { ok: boolean; amountDue?: number }
>("recordOutsideDelivery");

/** R7-7 live guest count and during-event extras. */
export const logGuestCount = callable<{ bookingId: string; sessionId?: string; count: number; note?: string }, { ok: boolean }>(
  "logGuestCount",
);
export const addEventExtra = callable<
  {
    bookingId: string;
    sessionId?: string;
    item: string;
    qty: number;
    rate: number;
    customerApprovedBy: { name: string; phone?: string };
    note?: string;
  },
  { extraId: string; amount: number; status: string }
>("addEventExtra");
export const approveEventExtra = callable<
  { bookingId: string; extraId: string; approve: boolean; reason?: string },
  { status: string }
>("approveEventExtra");

/** R7-8 vendor payments and dues (admin). */
export type DueCollection = "purchases" | "expenses" | "outsideOrders";
export interface VendorPaymentInput {
  vendorId: string;
  vendorName: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  method: PaymentMethod;
  allocations: { collection: DueCollection; id: string; amount: number }[];
  note?: string;
}
export const recordVendorPayment = callable<VendorPaymentInput, { vendorPaymentId: string; unallocated: number }>("recordVendorPayment");

/** Admin, once: map old free-text purchase / expense statuses to Unpaid / PartiallyPaid / Paid. */
export const migratePaymentStatuses = callable<Record<string, never>, Record<string, number>>("migratePaymentStatuses");

export interface DueBill {
  collection: DueCollection;
  id: string;
  label: string;
  date: string | null;
  amount: number;
  paid: number;
  balance: number;
  paymentStatus: string;
  /** payment held (bill does not match its order) — the server refuses a payment to it */
  held?: boolean;
}
export interface VendorDue {
  vendorId: string;
  vendorName: string;
  billed: number;
  billCount: number;
  paid: number;
  outstanding: number;
  oldestDueDate: string | null;
  bills: DueBill[];
  /** part of outstanding that is held */
  heldAmount: number;
  heldBills: number;
}

const n0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const s0 = (v: unknown) => (typeof v === "string" ? v : "");
const isoOrNull = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v;
  const t = v as { toDate?: () => Date; _seconds?: number; seconds?: number } | null;
  if (t && typeof t.toDate === "function") return t.toDate().toISOString();
  const secs = t?._seconds ?? t?.seconds;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : null;
};

/** Tolerant reader: `bills` may be a list (preferred) or just a number. */
function toVendorDue(v: Record<string, unknown>): VendorDue {
  const rawBills = Array.isArray(v.bills) ? (v.bills as Record<string, unknown>[]) : [];
  const bills: DueBill[] = rawBills.map((b) => ({
    collection: (["purchases", "expenses", "outsideOrders"].includes(s0(b.collection)) ? s0(b.collection) : "purchases") as DueCollection,
    id: s0(b.id),
    label: s0(b.label) || s0(b.number) || s0(b.billNumber),
    date: isoOrNull(b.date ?? b.dueDate),
    amount: n0(b.amount ?? b.total),
    paid: n0(b.paid),
    balance: n0(b.balance),
    paymentStatus: s0(b.paymentStatus),
    held: b.held === true || b.paymentHold === true,
  }));
  return {
    vendorId: s0(v.vendorId),
    vendorName: s0(v.vendorName),
    billed: typeof v.total === "number" ? v.total : typeof v.billed === "number" ? v.billed : bills.reduce((a, b) => a + b.amount, 0),
    billCount: typeof v.bills === "number" ? v.bills : bills.length,
    paid: n0(v.paid),
    outstanding: n0(v.outstanding),
    oldestDueDate: isoOrNull(v.oldestDueDate),
    bills,
    heldAmount: n0(v.heldAmount),
    heldBills: n0(v.heldBills),
  };
}

const getVendorDuesRaw = callable<{ vendorId?: string }, { vendors?: Record<string, unknown>[] } | Record<string, unknown>[]>("getVendorDues");
export async function getVendorDues(req: { vendorId?: string } = {}): Promise<VendorDue[]> {
  const res = await getVendorDuesRaw(req);
  const list = Array.isArray(res) ? res : Array.isArray(res?.vendors) ? res.vendors : [];
  return list.map(toVendorDue);
}

/** R7-9 event close. Each blocker comes with Telugu and English text from the server. */
export interface CloseBlocker {
  code: string;
  te: string;
  en: string;
  /** True when the owner may still close by giving overrideReason (customer balance). */
  overridable: boolean;
}
export interface CloseEventResult {
  ok: boolean;
  blockers: CloseBlocker[];
}

export function toBlockers(v: unknown): CloseBlocker[] {
  if (!Array.isArray(v)) return [];
  return v.map((b) => {
    if (typeof b === "string") return { code: b, te: b, en: b, overridable: b === "customerBalance" };
    const o = (b ?? {}) as Record<string, unknown>;
    const code = s0(o.code);
    return {
      code,
      te: s0(o.te) || s0(o.en) || code,
      en: s0(o.en) || s0(o.te) || code,
      overridable: o.overridable === true || o.canOverride === true || code === "customerBalance",
    };
  });
}

const closeEventRaw = callable<
  { bookingId: string; confirm: { vendorBillsEntered: boolean }; overrideReason?: string },
  { ok?: boolean; blockers?: unknown }
>("closeEvent");

/**
 * Close the event. Blockers may come back either in the result (`{ ok: false, blockers }`) or as a
 * failed-precondition error with `details.blockers`; both become `{ ok: false, blockers }` here.
 */
export async function closeEvent(req: {
  bookingId: string;
  confirm: { vendorBillsEntered: boolean };
  overrideReason?: string;
}): Promise<CloseEventResult> {
  try {
    const res = await closeEventRaw(req);
    const blockers = toBlockers(res?.blockers);
    return { ok: res?.ok !== false && blockers.length === 0, blockers };
  } catch (e) {
    if (e instanceof CallableError && e.details && Array.isArray(e.details.blockers)) {
      return { ok: false, blockers: toBlockers(e.details.blockers) };
    }
    throw e;
  }
}

export const reopenEvent = callable<{ bookingId: string; reason: string }, { ok: boolean }>("reopenEvent");

// ---------------------------------------------------------------------------------------------
// Round 8 — learning recipes, event / day plans (calc-spec §13, §13.5)
// ---------------------------------------------------------------------------------------------

export interface PlanDish {
  key: string;
  sessionId: string;
  dishId: string;
  variantId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  /** null = not learned and no starting rule. */
  qty: number | null;
  per100: number | null;
  source: "piece" | "cell" | "factors" | "typed" | "none" | string;
  matchedEvents: number;
  status: "none" | "learning" | "learned" | string;
  statusTe: string;
  eventsUsed: number;
  advice: string;
  why: Bilingual[];
  /** qty × perUnit per grocery item. */
  ingredients: { groceryItemId: string; perUnit: number; qty: number }[];
  /** Module 2e: bases (gravy, masala …) to prepare for this dish. */
  bases?: { dishId: string; nameTe: string; nameEn: string; unit: string; qty: number }[];
}

export interface PlanPart {
  bookingId: string;
  sessionId: string;
  labelTe: string;
  labelEn: string;
  day: string;
  guests: number;
  eventType: string;
  serviceStyle: string;
  packageId: string;
  branchId: string;
  customer: string;
  band: string;
  comboKey: string;
  dishes: PlanDish[];
  /** R10-11 (guests already include kids) */
  kidsCount?: number;
  specialMeals?: { type: string; typeTe: string; count: number; note: string }[];
  /** R10-12: "lunchBox" parts come from lunchBoxOrders (no booking). */
  kind?: "event" | "lunchBox";
  lunchBoxOrderId?: string;
}

export interface PlanIngredient {
  groceryItemId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  needed: number;
  fromDishes: number;
  fromPer100: number;
  /** Module 2c: usable share of what is bought (100 = no loss) and the quantity needed before cleaning (needed ÷ yield). */
  yieldPct?: number;
  gross?: number;
  inStock: number;
  /** Module 2g: part of the stock already promised to other confirmed events (not counted in toBuy). */
  reservedOthers?: number;
  /** X7: part of the stock that is past its expiry date (not counted as available). */
  expired?: number;
  toBuy: number;
}

export const eventPlan = callable<{ bookingId: string; sessionId?: string }, { parts: PlanPart[]; dishes: PlanDish[]; ingredients: PlanIngredient[] }>(
  "eventPlan",
);

export interface DayPlanDish {
  dishId: string;
  variantId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  total: number;
  perEvent: { bookingId: string; sessionId: string; customer: string; qty: number | null; kind?: string; lunchBoxOrderId?: string }[];
}

export const dayPlan = callable<
  { date: string; branchId?: string },
  { date: string; events: PlanPart[]; dishes: DayPlanDish[]; ingredients: PlanIngredient[] }
>("dayPlan");

export interface CookLogEntry {
  dishId: string;
  variantId?: string;
  cooked: number;
  leftover: number;
  ingredients?: { groceryItemId: string; used: number }[];
  sharedWith?: { bookingId: string; sessionId?: string; guests: number }[];
}

/** saveCookLog v2: one entry per dish cooked for this event (or session); shared batches are split by the server. */
export const saveCookLog = callable<
  { bookingId: string; sessionId?: string; guestCountActual?: number; entries: CookLogEntry[] },
  { updatedDishes: { dishId: string; logId: string }[] }
>("saveCookLog");

// ---------------------------------------------------------------------------------------------
// Round 9 — order cancellation done properly (api-contract "Round 9", backend-notes "Round 9")
// ---------------------------------------------------------------------------------------------

export const CANCEL_REASON_CODES = [
  "customer-cancelled",
  "postponed-no-date",
  "price",
  "went-elsewhere",
  "event-called-off",
  "our-side",
  "other",
] as const;
export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];

/** Telugu labels exactly as the contract (calc/cancellation CANCEL_REASON_TE); English for the language switch. */
export const CANCEL_REASON_LABEL: Record<CancelReasonCode, Bilingual> = {
  "customer-cancelled": { te: "కస్టమర్ రద్దు చేశారు", en: "Customer cancelled" },
  "postponed-no-date": { te: "వాయిదా — తేదీ లేదు", en: "Postponed, no date" },
  price: { te: "ధర ఎక్కువ", en: "Price too high" },
  "went-elsewhere": { te: "వేరే వాళ్ళకి ఇచ్చారు", en: "Went to someone else" },
  "event-called-off": { te: "శుభకార్యం జరగట్లేదు", en: "Event called off" },
  "our-side": { te: "మా వైపు సమస్య", en: "Problem on our side" },
  other: { te: "ఇతర", en: "Other" },
};

export type AdvanceChoice = "refund-all" | "refund-part" | "keep";

export interface CancelBookingInput {
  bookingId: string;
  reasonCode: CancelReasonCode;
  /** ≥ 3 letters. */
  reason: string;
  /** Only when the customer has paid. */
  advance?: AdvanceChoice;
  /** refund-part only: ₹0.01 … paid. */
  refundAmount?: number;
  /** Required when anything is refunded. */
  refundMethod?: PaymentMethod;
  notifyCustomer: boolean;
}

export interface CancelBookingResult {
  ok: boolean;
  status: string;
  paid: number;
  refund: number;
  charge: number;
  refunds: { invoiceId: string; paymentId: string; amount: number }[];
  released: { staff: number; trips: number; equipmentMoves: number };
  stockReturned: Record<string, number> | null;
  summary: Bilingual;
  /** Telugu WhatsApp text (copy / share — never auto-sent); null unless notifyCustomer. */
  customerMessage: string | null;
}

/** Errors: failed-precondition with Telugu `te` (e.g. equipment still out → details.blockers[0].code "equipment-out"). */
export const cancelBooking = callable<CancelBookingInput, CancelBookingResult>("cancelBooking");

export interface RestoreBookingResult {
  ok: boolean;
  status: string;
  invoices: { id: string; status: string; balanceDue: number }[];
  note: Bilingual;
}
/** Admin only; event day today or later. Refunds stay refunded. */
export const restoreBooking = callable<{ bookingId: string; reason: string }, RestoreBookingResult>("restoreBooking");

/** "తేదీ మార్చు" (A; M own branch): newDate YYYY-MM-DD, today or later. */
export const postponeBooking = callable<{ bookingId: string; newDate: string; reason?: string }, { ok: boolean; from: string; to: string }>(
  "postponeBooking",
);

export interface CancellationReportRow {
  id: string;
  customer: string;
  eventDay: string | null;
  cancelledDay: string | null;
  reasonCode: string;
  reason: string;
  by: string;
  refund: number;
  charge: number;
  loss: number;
}

export interface CancellationReport {
  month: string;
  count: number;
  refunded: number;
  kept: number;
  card: Bilingual;
  reasons: { code: string; te: string; count: number; refunded: number; kept: number }[];
  lossOnCancelled: number;
  bookings: CancellationReportRow[];
}

/** month "YYYY-MM"; managers get their own branch. */
export const getCancellationReport = callable<{ month: string; branchId?: string }, CancellationReport>("getCancellationReport");

// ---------------------------------------------------------------------------------------------
// Round 10 (docs/api-contract.md "Round 10") — names match functions/src exactly
// ---------------------------------------------------------------------------------------------

/** R10-1 addStaffAdvance (A/M own branch). recoverMonth defaults to the month after `date`. */
export const addStaffAdvance = callable<
  { staffId: string; amount: number; date?: string; recoverMonth?: string; note?: string },
  { id: string; status: string; recoverMonth: string; text: Bilingual }
>("addStaffAdvance");

export interface StaffAdvanceRow {
  id: string;
  amount: number;
  date: string;
  note: string;
  recoverMonth: string;
  /** Open | Recovered | Cancelled | Old (legacy expense-era record) */
  status: string;
  recovered: number;
  balance: number;
  recoveries: { month?: string; amount?: number; payslipId?: string }[];
}
export const listStaffAdvances = callable<{ staffId: string }, { advances: StaffAdvanceRow[]; balance: number }>("listStaffAdvances");
/** Owner: book the month's advance recoveries on the payslips (safe to run again). */
export const finalizePayroll = callable<{ month: string }, { month: string; payslips: number; advancesTouched: number }>("finalizePayroll");

/** R10-2 */
export const SHIFT_ROLES = ["cook", "helper", "server", "driver", "supervisor"] as const;
export type ShiftRole = (typeof SHIFT_ROLES)[number];
export const saveShift = callable<
  { id?: string; bookingId: string; sessionId?: string; staffId: string; role: ShiftRole; date: string; startTime: string; endTime: string; note?: string },
  { id: string; hours: number }
>("saveShift");
export const completeTask = callable<{ taskId: string; done?: boolean; note?: string }, { ok: boolean; status: string }>("completeTask");
export const rateStaff = callable<{ staffId: string; bookingId: string; stars: number; note?: string }, { id: string; stars: number }>("rateStaff");

/** R10-4 */
export interface PackagePriceSuggestion {
  packageId: string;
  nameTe: string;
  nameEn: string;
  guests: number;
  currentPrice: number;
  foodPerPlate: number;
  labourPerPlate: number;
  overheadPerPlate: number;
  /** null when some ingredient has no purchase rate (band "unknown") */
  plateCost: number | null;
  /** priced part only — always filled */
  knownPlateCost: number;
  coveragePct: number | null;
  costedLines: number;
  pricedLines: number;
  targetMarginPct: number;
  suggestedPrice: number | null;
  marginPct: number | null;
  band: "red" | "amber" | "green" | "unknown";
  bandTe: string;
  summary: Bilingual;
  ingredients: {
    groceryItemId: string;
    nameTe: string;
    nameEn: string;
    unit: string;
    qty: number;
    rate: number | null;
    rateDay: string | null;
    vendor: string | null;
    unitMismatch: boolean;
    cost: number | null;
  }[];
  missingRates: string[];
  warnings: Bilingual[];
}
export const suggestPackagePrice = callable<{ packageId: string; guests?: number }, PackagePriceSuggestion>("suggestPackagePrice");

/** Module 1a — lead assignment (server: functions/src/leads). */
export interface LeadAssignConfig {
  auto: boolean;
  mode: "roundRobin" | "rules";
  /** user ids that take turns, in order */
  pool: string[];
  rules: { source: string; uid: string }[];
}
/** Module 1b — settings.leadTat (5–1440 minutes; server default on / 15 / escalate). */
export interface LeadTatConfig {
  on: boolean;
  minutes: number;
  escalate: boolean;
}
export interface LeadAssignee {
  uid: string;
  name: string;
  role: "admin" | "manager";
  branchId: string;
}
/** uid "" takes the lead back (nobody). */
export const assignLead = callable<{ leadId: string; uid: string }, { ok: boolean; assignedTo: string; assignedName: string }>("assignLead");
export const leadAssignees = callable<Record<string, never>, { people: LeadAssignee[] }>("leadAssignees");
/** Module 1f — leads report for a period (IST days, both included; server: functions/src/leads/reportRules.ts). */
export interface LeadCounts {
  total: number;
  open: number;
  won: number;
  lost: number;
  /** duplicate + invalid */
  dropped: number;
  conversionPct: number | null;
}
export interface LeadResponseStats {
  measured: number;
  answered: number;
  inTime: number;
  unanswered: number;
  avgMinutes: number | null;
  inTimePct: number | null;
}
export interface LeadReportResult {
  from: string;
  to: string;
  branchId: string;
  limitMinutes: number;
  totals: LeadCounts;
  bySource: ({ source: string } & LeadCounts)[];
  byPerson: ({ uid: string; name: string; response: LeadResponseStats } & LeadCounts)[];
  response: LeadResponseStats;
}
export const leadReport = callable<{ from: string; to: string; branchId?: string }, LeadReportResult>("leadReport");
/** Module 1e: a team note on a lead (server writes leads/{id}/comments and notifies the mentioned people + the assignee). */
export const addLeadComment = callable<{ leadId: string; text: string; mentions?: string[] }, { ok: boolean; id: string; notified: number }>("addLeadComment");

/** R10-6 */
export interface VendorRate {
  vendorId: string;
  vendorName: string;
  lastRate: number;
  lastDay: string;
  previousRate: number | null;
  changePct: number | null;
  cheapest: boolean;
}
export const vendorPriceComparison = callable<
  { groceryItemId?: string },
  {
    items: {
      itemKey: string;
      /** Grocery master id ("" when the line matched by name only). */
      groceryItemId?: string;
      name: string;
      /** Telugu name when the server sends it (else the page looks it up in groceryItems). */
      nameTe?: string;
      unit: string;
      vendors: VendorRate[];
      vendorCount: number;
    }[];
  }
>("vendorPriceComparison");

/** R10-7 */
export interface StatementLine {
  day: string;
  kind: "booking" | "invoice" | "payment" | "refund" | "cancellation-charge";
  ref: string;
  amount: number;
  te: string;
  en: string;
  balance: number;
}
export interface CustomerStatement {
  customerId: string;
  customerName: string;
  phone: string;
  from: string | null;
  to: string | null;
  opening: number;
  lines: StatementLine[];
  closing: number;
  invoiced: number;
  paid: number;
  whatsappText: string;
}
export const customerStatement = callable<{ customerId: string; from?: string; to?: string }, CustomerStatement>("customerStatement");

/** R10-12 lunch boxes */
export const LUNCH_BOX_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type LunchBoxDay = (typeof LUNCH_BOX_DAYS)[number];
export interface LunchBoxOrderInput {
  id?: string;
  customerId: string;
  /** one-off day, or recurring days + startDate (+ endDate) */
  date?: string;
  days?: LunchBoxDay[];
  startDate?: string;
  endDate?: string;
  count: number;
  menuOptionIds: string[];
  deliveryAddress?: string;
  deliveryTime?: string;
  pricePerBox?: number;
  status?: "active" | "paused" | "cancelled";
  branchId?: string;
}
export const saveLunchBoxOrder = callable<LunchBoxOrderInput, { id: string; pricePerBox: number }>("saveLunchBoxOrder");
export const markLunchBoxDelivered = callable<{ orderId: string; date: string; count?: number }, { ok: boolean; planned: number; count: number }>("markLunchBoxDelivered");
export const invoiceLunchBoxes = callable<
  { customerId: string; month: string },
  { invoiceId: string; invoiceNumber: string; lines: { orderId: string; boxes: number; days: number; rate: number; amount: number }[]; totalAmount: number; text: Bilingual }
>("invoiceLunchBoxes");

// ---------------------------------------------------------------------------------------------
// Module 2f — packed products
// ---------------------------------------------------------------------------------------------

export interface PackedProductInput {
  id?: string;
  branchId?: string;
  nameTe: string;
  nameEn: string;
  netQty: number;
  netUnit: string;
  mrp: number;
  shelfLifeDays: number;
  vegType: "veg" | "nonveg";
  dateKind: "bestBefore" | "useBy";
  ingredientsText: string;
  allergensText: string;
  storageText: string;
  nutritionText: string;
  dishId: string;
  active: boolean;
  hsn: string;
  gstRate: number;
  barcode: string;
}

export interface PackSaleResult {
  ok: boolean;
  saleId: string;
  saleNumber: string;
  amount: number;
  taxable: number;
  tax: number;
  gstRate: number;
  discountFromMrp: number;
  newQuantity: number;
}

/** X5: sells packs (never above MRP, never expired packs); stock goes out earliest expiry first. */
export const sellPacked = callable<{ productId: string; packs: number; pricePerPack?: number; method?: string; customerName?: string; phone?: string; saleDay?: string }, PackSaleResult>("sellPacked");

/** X5: owner only — the packs go back into stock and the sale is marked cancelled. */
export const cancelPackedSale = callable<{ saleId: string; reason: string }, { ok: boolean; returned: number }>("cancelPackedSale");

export const savePackedProduct = callable<PackedProductInput, { ok: boolean; id: string }>("savePackedProduct");

export interface PackingResult {
  ok: boolean;
  runId: string;
  batchNo: string;
  expiryDay: string;
  packedDay: string;
  packs: number;
  newQuantity: number;
}

/** Adds packs to stock with one batch number; expiry = packed day + shelf life. */
export const recordPacking = callable<{ productId: string; packs: number; packedDay?: string; batchNo?: string }, PackingResult>("recordPacking");

/** Module 2g: work out the reservations again now (owner / manager), e.g. right after a purchase. */
export const refreshStockReservations = callable<Record<string, never>, { ok: boolean; events: number; items: number; short: number }>("refreshStockReservations");

// ---------------------------------------------------------------------------------------------
// Module 2i — standard / estimated / actual cost (owner only)
// ---------------------------------------------------------------------------------------------

export interface StandardCost {
  perPlate: number;
  foodPerPlate: number;
  labourPerPlate: number;
  overheadPerPlate: number;
  guests: number;
}

/** Fixes the menu's standard plate cost from recipes × today's purchase rates. */
export const setStandardCost = callable<{ packageId: string; guests?: number }, StandardCost & { ok: boolean; packageId: string }>("setStandardCost");

export interface CostRow {
  total: number | null;
  perPlate: number | null;
}

export interface CostComparison {
  bookingId: string;
  guests: number;
  standard: CostRow;
  estimated: CostRow;
  actual: CostRow;
  estVsStd: { amount: number; pct: number | null } | null;
  actVsEst: { amount: number; pct: number | null } | null;
  estVsStdFlag: "over" | "under" | "ok" | null;
  actVsEstFlag: "over" | "under" | "ok" | null;
  estimate: { version: number; food: number; labour: number; overhead: number; coveragePct: number | null; complete: boolean; reason: string } | null;
  actualParts: { food: number; labour: number; transport: number; rentals: number; other: number } | null;
}

export const costComparison = callable<{ bookingId: string }, CostComparison>("costComparison");

/** A new frozen estimate for the booking (older versions are kept). */
export const refreshCostEstimate = callable<{ bookingId: string; reason: string }, { ok: boolean }>("refreshCostEstimate");

// ---------------------------------------------------------------------------------------------
// Module 3a — purchase request → purchase order, with approval
// ---------------------------------------------------------------------------------------------

export interface ProcureLineInput {
  description: string;
  qty: number;
  unit: string;
  /** ₹ per unit — only on an order */
  rate?: number;
  inventoryItemId?: string;
  groceryItemId?: string;
}

/** Anyone on the team asks for goods; owner / managers are told. */
export const savePurchaseRequest = callable<{ neededBy: string; note?: string; bookingId?: string; branchId?: string; lines: ProcureLineInput[] }, { ok: boolean; id: string; number: string }>("savePurchaseRequest");
/** Owner / manager: approve, or reject with a reason. */
export const decidePurchaseRequest = callable<{ id: string; approve: boolean; reason?: string }, { ok: boolean; status: string }>("decidePurchaseRequest");
export const cancelPurchaseRequest = callable<{ id: string; reason: string }, { ok: boolean }>("cancelPurchaseRequest");
/** Owner / manager. The server works out the total and whether the owner must approve. */
export const savePurchaseOrder = callable<
  { id?: string; vendorId: string; expectedDay: string; terms?: string; prId?: string; branchId?: string; lines: ProcureLineInput[] },
  { ok: boolean; id: string; number: string; status: "approved" | "pendingApproval"; total: number }
>("savePurchaseOrder");
/** Owner only. */
export const decidePurchaseOrder = callable<{ id: string; approve: boolean; reason?: string }, { ok: boolean; status: string }>("decidePurchaseOrder");
export const cancelPurchaseOrder = callable<{ id: string; reason: string }, { ok: boolean }>("cancelPurchaseOrder");

// Module 3b — goods receipt against an order
export interface ReceiveLineInput {
  /** index of the line on the order */
  line: number;
  delivered: number;
  accepted: number;
  rejectReason?: string;
  expiryDay?: string;
  batchNo?: string;
}
/** Owner / manager. Accepted goods go into stock; the order becomes partReceived / received. */
export const receiveGoods = callable<
  { poId: string; receiveDay?: string; vendorBillNo?: string; note?: string; storeId?: string; lines: ReceiveLineInput[] },
  { ok: boolean; id: string; number: string; status: string; acceptedValue: number; stockSkipped: { te: string; en: string }[] }
>("receiveGoods");
/** The rest of a part-received order will not come. */
export const closePurchaseOrder = callable<{ id: string; reason: string }, { ok: boolean }>("closePurchaseOrder");

// Module 3c — vendor bill matched against the order and the receipts
/** Owner / manager. The server works out the total and the match; a mismatch puts the bill on payment hold. */
export const saveVendorBill = callable<
  { poId: string; billNo: string; billDay?: string; otherCharges?: number; discount?: number; note?: string; lines: { line: number; qty: number; rate: number }[] },
  { ok: boolean; id: string; total: number; matchStatus: "matched" | "mismatch"; issues: { te: string; en: string }[]; paymentHold: boolean }
>("saveVendorBill");
/** Owner only: pay a mismatched bill anyway (the reason is kept). */
export const releaseBillHold = callable<{ purchaseId: string; reason: string }, { ok: boolean }>("releaseBillHold");
/** Takes a wrong receipt back (stock out again) while its goods are not billed. */
export const cancelGoodsReceipt = callable<{ id: string; reason: string }, { ok: boolean }>("cancelGoodsReceipt");

// ---------------------------------------------------------------------------------------------
// Module 4b — the books (owner only): derived ledger, hand-written entries, period lock
// ---------------------------------------------------------------------------------------------

export type LedgerAccountType = "asset" | "liability" | "equity" | "income" | "expense";
export interface LedgerReport {
  from: string;
  to: string;
  accounts: { code: string; type: LedgerAccountType; te: string; en: string }[];
  /** as on `to` */
  trialBalance: { account: string; type: LedgerAccountType; debit: number; credit: number; balance: number }[];
  totals: { debit: number; credit: number; balanced: boolean };
  balanceSheet: { assets: number; liabilities: number; equity: number; profit: number; balanced: boolean };
  /** from → to */
  profitAndLoss: { income: number; expenses: number; profit: number; byAccount: { account: string; type: "income" | "expense"; amount: number }[] };
  entryCount: number;
  skipped: number;
  lockedThrough: string;
  lines: { day: string; memo: string; kind: string; collection: string; id: string; debit: number; credit: number }[];
}
export const ledgerReport = callable<{ from: string; to: string; account?: string }, LedgerReport>("ledgerReport");
// ---------------------------------------------------------------------------------------------
// 20 Nov 2026 — online payment link and customer portal
// ---------------------------------------------------------------------------------------------
/** Razorpay link for an invoice's balance (or part). Needs the owner's Razorpay keys on the server; otherwise a clear message. */
export const createPaymentLink = callable<{ invoiceId: string; amount?: number }, { id: string; url: string; amount: number; reused: boolean }>("createPaymentLink");
export const createPortalLink = callable<{ kind: "quotation" | "invoice"; id: string }, { token: string; expiresAt: number }>("createPortalLink");
export const revokePortalLinks = callable<{ kind: "quotation" | "invoice"; id: string }, { revoked: number }>("revokePortalLinks");
export interface PortalDoc {
  kind: "quotation" | "invoice";
  number: string;
  status: string;
  issueDate: string;
  validUntil: string;
  customerName: string;
  lines: { name: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  discount: number;
  gstRate: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes: string;
  terms: string;
  acceptedAt: string;
  acceptedBy: string;
}
export interface PortalView {
  doc: PortalDoc;
  business: { name: string; logoUrl: string; phone: string };
  pay: { upiPayload: string; onlineUrl: string } | null;
  token: string;
}
/** Public (no sign-in): the token in the link is the key. */
export const portalView = callable<{ token: string }, PortalView>("portalView");
export const portalAccept = callable<{ token: string; name: string }, { ok: boolean }>("portalAccept");
export const portalPay = callable<{ token: string; amount?: number }, { url: string; amount: number }>("portalPay");

export interface LedgerExportRow { day: string; voucher: string; kind: string; account: string; accountEn: string; accountTe: string; debit: number; credit: number; narration: string }
/** 20 Nov 2026: every journal line of a period, for the accountant's CSV (owner). */
export const ledgerExport = callable<{ from: string; to: string }, { from: string; to: string; rows: LedgerExportRow[]; entryCount: number; truncated: boolean }>("ledgerExport");
export const saveJournalEntry = callable<{ day: string; memo: string; lines: { account: string; debit?: number; credit?: number }[] }, { ok: boolean; id: string }>("saveJournalEntry");
export const cancelJournalEntry = callable<{ id: string; reason: string }, { ok: boolean }>("cancelJournalEntry");
export const lockPeriod = callable<{ month: string }, { ok: boolean; lockedThrough: string }>("lockPeriod");
export const unlockPeriod = callable<{ reason: string }, { ok: boolean; lockedThrough: string; reopened: string }>("unlockPeriod");

// ---------------------------------------------------------------------------------------------
// Module 4f — bank statement check
// ---------------------------------------------------------------------------------------------

export interface ReconResult {
  account: string;
  from: string;
  to: string;
  toleranceDays: number;
  statementRows: number;
  skipped: number;
  matchedCount: number;
  onlyStatement: { line: number; day: string; text: string; ref: string; moneyIn: number; moneyOut: number }[];
  onlyBooks: { day: string; memo: string; kind: string; collection: string; id: string; moneyIn: number; moneyOut: number }[];
  totals: { statementIn: number; statementOut: number; booksIn: number; booksOut: number; unmatchedStatementIn: number; unmatchedStatementOut: number; unmatchedBooksIn: number; unmatchedBooksOut: number };
}
/** `grid` = the uploaded statement as rows of cells. Nothing is stored. */
export const reconcileStatement = callable<{ grid: unknown[][]; account?: string; toleranceDays?: number }, ReconResult>("reconcileStatement");

// ---------------------------------------------------------------------------------------------
// Module 4g — month-close checklist
// ---------------------------------------------------------------------------------------------

export interface MonthCloseResult {
  month: string;
  lockedThrough: string;
  /** the month is over (only then it can be locked) */
  ended: boolean;
  items: { key: string; state: "ok" | "todo" | "block" | "info"; count: number; amount: number; te: string; en: string; link: string }[];
  ready: boolean;
  todo: number;
  alreadyLocked: boolean;
}
export const monthCloseCheck = callable<{ month: string }, MonthCloseResult>("monthCloseCheck");

// ---------------------------------------------------------------------------------------------
// Module 4h — overheads shared among the month's events
// ---------------------------------------------------------------------------------------------

export interface OverheadShareResult {
  month: string;
  basis: string;
  /** "equal" when the chosen basis had no figures */
  basisUsed: string;
  pool: { total: number; byCentre: { centre: string; amount: number }[] };
  lines: { id: string; day: string; name: string; income: number; directCost: number; guests: number; directProfit: number; share: number; netProfit: number; marginPct: number | null }[];
  totals: { income: number; directCost: number; directProfit: number; share: number; netProfit: number };
  eventCount: number;
}
export const overheadShare = callable<{ month: string; basis?: string }, OverheadShareResult>("overheadShare");

// ---------------------------------------------------------------------------------------------
// Module 5a — Company -> Brand -> Branch -> Kitchen -> Store masters (owner)
// ---------------------------------------------------------------------------------------------

export type MasterKind = "company" | "brand" | "branch" | "kitchen" | "store";
export const saveMaster = callable<{ kind: MasterKind; id?: string; data: Record<string, unknown> }, { ok: boolean; id: string; code: string }>("saveMaster");
export const setMasterStatus = callable<{ kind: MasterKind; id: string; status: "draft" | "active" | "inactive" | "archived"; reason: string }, { ok: boolean; status: string }>("setMasterStatus");
export const setupMasters = callable<Record<string, never>, { ok: boolean; made: { company: number; brand: number; branches: number; kitchens: number; stores: number }; companyId: string; brandId: string }>("setupMasters");

// Module 5b — company / brand on transactions
export const setBookingBrand = callable<{ bookingId: string; brandId: string }, { ok: boolean; brandId: string }>("setBookingBrand");
export interface BrandReportResult {
  from: string;
  to: string;
  lines: { brandId: string; name: string; events: number; invoiced: number; received: number; due: number; directCost: number; margin: number; marginPct: number | null }[];
  totals: { events: number; invoiced: number; received: number; due: number; directCost: number; margin: number };
}
export const brandReport = callable<{ from: string; to: string }, BrandReportResult>("brandReport");

// Module 5c — stock by store
export const transferStock = callable<{ itemId: string; fromStoreId: string; toStoreId: string; quantity: number; note?: string }, { ok: boolean; transferId: string; storeQty: Record<string, number>; homeStoreId: string }>("transferStock");
/** Owner / manager. Moves stock to the same item (name + unit) of another branch. */
export const transferToBranch = callable<{ itemId: string; toBranchId: string; quantity: number; fromStoreId?: string; note?: string }, { ok: boolean; transferId: string; toItemId: string }>("transferToBranch");
/** Owner / manager. A manager asks for a refund; the owner decides (decideRefund). */
export const requestRefund = callable<{ invoiceId: string; amount: number; reason: string }, { ok: boolean; id: string }>("requestRefund");
export const decideRefund = callable<{ id: string; approve: boolean; note?: string }, { ok: boolean; status: string; newBalance?: number }>("decideRefund");
/** Owner / manager. Where in a store an item is kept (a place from that store's list; "" clears it). */
export const setItemLocation = callable<{ itemId: string; storeId: string; location: string }, { ok: boolean; binLocation: Record<string, string> }>("setItemLocation");
export const setItemHomeStore = callable<{ itemId: string; storeId: string }, { ok: boolean; homeStoreId: string }>("setItemHomeStore");

// Module 5d — food safety: batch hold, decision, trace
export const holdBatch = callable<{ itemId: string; batchId: string; reason: string }, { ok: boolean; heldQty: number }>("holdBatch");
export const decideBatchHold = callable<{ itemId: string; batchId: string; decision: "release" | "discard"; note: string }, { ok: boolean; decision: string; qty: number; newQuantity: number }>("decideBatchHold");
export interface BatchTrace {
  item: { id: string; name: string; unit: string };
  batch: { id: string; receivedQty: number; qty: number; expiryDay: string; batchNo: string; purchaseId: string; receivedDay: string; hold: boolean; holdReason: string };
  uses: { movementId: string; day: string; type: string; reason: string; taken: number; bookingId: string }[];
  events: { bookingId: string; customer: string; day: string; status: string; taken: number }[];
  totalTaken: number;
}
export const traceBatch = callable<{ itemId: string; batchId: string }, BatchTrace>("traceBatch");

// Module 5h — allergen matrix and veg / non-veg separation
export interface AllergenProblem {
  code: "untagged" | "partsUntagged" | "mislabelled" | "vegOnlyBrand" | "unknownType";
  te: string;
  en: string;
}
export interface AllergenMatrix {
  allergens: { id: string; te: string; en: string }[];
  vegOnlyBrand: string;
  rows: { dishId: string; name: string; declaredType: string; foodType: "veg" | "nonveg" | "unknown"; allergens: Record<string, string[]>; untaggedParts: string[]; problems: AllergenProblem[] }[];
  menuOnly: { name: string; foodType: "veg" | "nonveg"; problems: AllergenProblem[] }[];
  specialMeals: { session: string; count: number; note: string }[];
  customer: string;
  /** Module 6a: written on the customer */
  customerAllergyNote: string;
  /** Module 6a: veg and non-veg cooked apart */
  kitchenSplit: { veg: { dishes: string[]; kitchens: string[] }; nonveg: { dishes: string[]; kitchens: string[] }; unknown: string[]; warnings: { te: string; en: string }[] };
}
export const setFoodTags = callable<{ kind: "dish" | "grocery"; id: string; foodType: "veg" | "nonveg" | ""; allergens: string[] }, { ok: boolean }>("setFoodTags");
export const allergenMatrix = callable<{ bookingId: string }, AllergenMatrix>("allergenMatrix");

// Module 5e — food-safety checks and incidents
export const listSafetyChecklists = callable<Record<string, never>, { checklists: { id: string; kind: string; te: string; en: string; active: boolean; dailyBy: string; items: { key: string; te: string; en: string; type: "yesno" | "number"; min: number | null; max: number | null; unit: string }[] }[] }>("listSafetyChecklists");
export const saveSafetyCheck = callable<{ checklistId: string; answers: Record<string, boolean | number>; note?: string; bookingId?: string; branchId?: string }, { ok: boolean; id: string; result: string; failed: number }>("saveSafetyCheck");
export const saveSafetyIncident = callable<{ what: string; severity: string; day?: string; bookingId?: string; itemId?: string; batchId?: string; action?: string; branchId?: string }, { ok: boolean; id: string }>("saveSafetyIncident");
export const resolveSafetyIncident = callable<{ id: string; resolution: string }, { ok: boolean }>("resolveSafetyIncident");

// Module 5f — packing and dispatch
export const saveDispatch = callable<{ id?: string; bookingId: string; sessionId?: string; lines: { kind: string; name: string; qty: number; unit: string; container?: string; seal?: string }[]; note?: string }, { ok: boolean; id: string; number: string }>("saveDispatch");
export const advanceDispatch = callable<
  { id: string; step: "packed" | "loaded" | "dispatched" | "delivered" | "returned" | "reconciled"; note?: string; loaded?: Record<string, number>; delivered?: Record<string, number>; returned?: Record<string, number>; reasons?: Record<string, string>; vehicleName?: string; driverName?: string; receiverName?: string; receiverPhone?: string },
  { ok: boolean; status: string; number: string; shortages: number }
>("advanceDispatch");
export const cancelDispatch = callable<{ id: string; reason: string }, { ok: boolean }>("cancelDispatch");
