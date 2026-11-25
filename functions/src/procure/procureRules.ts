/**
 * Module 3a (18 Nov 2026) — purchase request (PR) and purchase order (PO): pure rules, tested in test/module3a.test.ts.
 * Direct market bills (the purchases collection) stay as they are; this flow is for orders placed with a vendor in advance.
 */
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { isValidDay } from "../shared/istDate";

export type Res<T> = { ok: true; value: T } | { ok: false; te: string; en: string };
const bad = (te: string, en: string) => ({ ok: false as const, te, en });
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- settings: who may approve a PO ---------------------------------------------------------------------------------

export interface PoApprovalConfig {
  /** off = every PO is approved as soon as it is written */
  on: boolean;
  /** a manager's PO up to this amount (₹) needs no owner approval; above it waits for the owner */
  managerLimit: number;
}
export const DEFAULT_PO_APPROVAL: PoApprovalConfig = { on: true, managerLimit: 10000 };
export const PO_LIMIT_MAX = 10000000;
const validLimit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= PO_LIMIT_MAX;

export function normalizePoApproval(raw: unknown): PoApprovalConfig {
  const o = asObj(raw);
  return {
    on: o.on === undefined ? DEFAULT_PO_APPROVAL.on : o.on === true,
    managerLimit: validLimit(o.managerLimit) ? round2(o.managerLimit) : DEFAULT_PO_APPROVAL.managerLimit,
  };
}

export function parsePoApprovalPatch(v: unknown): { ok: true; value: PoApprovalConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "poApproval must be an object." };
  const o = v as Doc;
  if (typeof o.on !== "boolean") return { ok: false, error: "poApproval.on must be true or false." };
  if (!validLimit(o.managerLimit)) return { ok: false, error: `poApproval.managerLimit must be a number from 0 to ${PO_LIMIT_MAX}.` };
  return { ok: true, value: { on: o.on, managerLimit: round2(o.managerLimit) } };
}

// ---- lines ----------------------------------------------------------------------------------------------------------

export interface ProcureLine {
  description: string;
  /** optional links to the masters, so the receipt can add stock without typing again */
  inventoryItemId: string;
  groceryItemId: string;
  qty: number;
  unit: string;
  /** ₹ per unit; 0 on a request (the price is agreed on the order) */
  rate: number;
}

export const MAX_LINES = 100;
const isQty = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1000000 && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

export function parseLines(raw: unknown, withRate: boolean): Res<ProcureLine[]> {
  const rows = asArr(raw);
  if (!Array.isArray(raw) || rows.length === 0) return bad("కనీసం ఒక వస్తువు రాయండి.", "Add at least one item.");
  if (rows.length > MAX_LINES) return bad(`ఒకేసారి ${MAX_LINES} వస్తువుల వరకే.`, `At most ${MAX_LINES} items at a time.`);
  const out: ProcureLine[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = asObj(rows[i]);
    const n = i + 1;
    const description = asStr(r.description).trim();
    if (!description || description.length > 120) return bad(`వస్తువు ${n}: పేరు రాయండి (120 అక్షరాల లోపు).`, `Item ${n}: give a name (up to 120 letters).`);
    if (!isQty(r.qty)) return bad(`వస్తువు ${n}: పరిమాణం 0 కంటే ఎక్కువ ఉండాలి (3 దశాంశాల వరకు).`, `Item ${n}: quantity must be above 0 (up to 3 decimals).`);
    const unit = asStr(r.unit).trim();
    if (!unit || unit.length > 20) return bad(`వస్తువు ${n}: కొలత (unit) రాయండి.`, `Item ${n}: give the unit.`);
    let rate = 0;
    if (withRate) {
      if (typeof r.rate !== "number" || !Number.isFinite(r.rate) || r.rate <= 0 || r.rate > 10000000) return bad(`వస్తువు ${n}: ధర 0 కంటే ఎక్కువ రాయండి.`, `Item ${n}: the rate must be above 0.`);
      rate = round2(r.rate);
    }
    out.push({ description, inventoryItemId: asStr(r.inventoryItemId).slice(0, 80), groceryItemId: asStr(r.groceryItemId).slice(0, 80), qty: r.qty, unit, rate });
  }
  return { ok: true, value: out };
}

export const lineAmount = (l: Pick<ProcureLine, "qty" | "rate">) => round2(l.qty * l.rate);
export const linesTotal = (lines: Pick<ProcureLine, "qty" | "rate">[]) => round2(lines.reduce((s, l) => s + lineAmount(l), 0));

// ---- purchase request -----------------------------------------------------------------------------------------------

export type PrStatus = "submitted" | "approved" | "rejected" | "ordered" | "cancelled";

export interface PurchaseRequestInput {
  neededBy: string;
  note: string;
  bookingId: string;
  lines: ProcureLine[];
}

export function parsePurchaseRequest(d: Doc, today: string): Res<PurchaseRequestInput> {
  const neededBy = asStr(d.neededBy);
  if (!isValidDay(neededBy)) return bad("ఎప్పటికి కావాలో తేదీ ఇవ్వండి.", "Give the date it is needed by.");
  if (neededBy < today) return bad("కావలసిన తేదీ గడిచిపోయింది.", "The needed-by date is in the past.");
  const note = asStr(d.note).trim();
  if (note.length > 500) return bad("గమనిక 500 అక్షరాల లోపు ఉండాలి.", "The note must be up to 500 letters.");
  const lines = parseLines(d.lines, false);
  if (!lines.ok) return lines;
  return { ok: true, value: { neededBy, note, bookingId: asStr(d.bookingId).slice(0, 80), lines: lines.value } };
}

export const canDecidePr = (status: string) => status === "submitted";
/** A request can be taken back until an order is written from it. */
export const canCancelPr = (status: string) => status === "submitted" || status === "approved";
/** An order can be written only from an approved request. */
export const canOrderFromPr = (status: string) => status === "approved";

// ---- purchase order -------------------------------------------------------------------------------------------------

export type PoStatus = "pendingApproval" | "approved" | "rejected" | "partReceived" | "received" | "cancelled";

export interface PurchaseOrderInput {
  vendorId: string;
  expectedDay: string;
  terms: string;
  prId: string;
  lines: ProcureLine[];
  total: number;
}

export function parsePurchaseOrder(d: Doc, today: string): Res<PurchaseOrderInput> {
  const vendorId = asStr(d.vendorId).trim();
  if (!vendorId || vendorId.length > 80 || vendorId.includes("/")) return bad("సరఫరాదారుని ఎంచుకోండి.", "Choose the vendor.");
  const expectedDay = asStr(d.expectedDay);
  if (!isValidDay(expectedDay)) return bad("సరుకు ఎప్పుడు రావాలో తేదీ ఇవ్వండి.", "Give the expected delivery date.");
  if (expectedDay < today) return bad("సరుకు రావలసిన తేదీ గడిచిపోయింది.", "The expected delivery date is in the past.");
  const terms = asStr(d.terms).trim();
  if (terms.length > 1000) return bad("షరతులు 1000 అక్షరాల లోపు ఉండాలి.", "Terms must be up to 1000 letters.");
  const lines = parseLines(d.lines, true);
  if (!lines.ok) return lines;
  const total = linesTotal(lines.value);
  if (total <= 0) return bad("ఆర్డర్ మొత్తం 0 కంటే ఎక్కువ ఉండాలి.", "The order total must be above 0.");
  return { ok: true, value: { vendorId, expectedDay, terms, prId: asStr(d.prId).slice(0, 80), lines: lines.value, total } };
}

/** Status of an order the moment it is written (or written again after a rejection). */
export function poStatusOnSave(role: string, total: number, cfg: PoApprovalConfig): "approved" | "pendingApproval" {
  if (!cfg.on || role === "admin") return "approved";
  return total <= cfg.managerLimit ? "approved" : "pendingApproval";
}

export const canDecidePo = (status: string) => status === "pendingApproval";
/** Lines can be changed only before approval (or after a rejection, to send it again). */
export const canEditPo = (status: string) => status === "pendingApproval" || status === "rejected";
/** An order can be cancelled until goods are received against it. */
export const canCancelPo = (status: string) => status === "pendingApproval" || status === "approved" || status === "rejected";
/** Goods can be received only against an approved order that is not complete. */
export const canReceivePo = (status: string) => status === "approved" || status === "partReceived";

/** PR-YYMMDD-NNN / PO-YYMMDD-NNN (N counts that day's documents). */
export function docNumber(prefix: "PR" | "PO" | "GRN", day: string, n: number): string {
  return `${prefix}-${day.slice(2).replace(/-/g, "")}-${String(Math.max(1, Math.floor(n))).padStart(3, "0")}`;
}
