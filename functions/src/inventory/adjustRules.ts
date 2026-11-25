/**
 * Module 4d step 6 (19 Nov 2026) — B5 "Stock adjustment: Counter / Store submits; configured supervisor approves
 * material variance". Pure rules; tested in test/module4h.test.ts.
 *
 * A hand change of stock (count / damage / correction) that moves the stock by `percent` % or more of what the
 * system shows is "material": unless the person may approve stock themselves, it is kept as a request and the stock
 * does not change until a supervisor approves it. A "return" (goods coming back) is never held.
 */
import { allowed, canHoldRole, RoleCode } from "../roles/permRules";

export interface StockAdjustConfig {
  on: boolean;
  /** a change of this share (%) of the stock on hand, or more, needs approval. 0 = every hand change. */
  percent: number;
}
export const DEFAULT_STOCK_ADJUST: StockAdjustConfig = { on: true, percent: 30 };
const validPct = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

export function normalizeStockAdjust(raw: unknown): StockAdjustConfig {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return { on: o.on === undefined ? DEFAULT_STOCK_ADJUST.on : o.on === true, percent: validPct(o.percent) ? Math.round(o.percent * 10) / 10 : DEFAULT_STOCK_ADJUST.percent };
}
export function parseStockAdjustPatch(v: unknown): { ok: true; value: StockAdjustConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "stockAdjust must be an object." };
  const o = v as Record<string, unknown>;
  if (typeof o.on !== "boolean") return { ok: false, error: "stockAdjust.on must be true or false." };
  if (!validPct(o.percent)) return { ok: false, error: "stockAdjust.percent must be a number from 0 to 100." };
  return { ok: true, value: normalizeStockAdjust(o) };
}

/** Is this hand change big enough to need a second person? */
export function isMaterial(cfg: StockAdjustConfig, change: { quantity: number; currentQty: number; reason: string }): boolean {
  if (!cfg.on || change.reason === "return") return false;
  if (!(change.quantity > 0)) return false;
  if (change.currentQty <= 0) return true; // nothing on the books: any counted quantity is a full variance
  return (change.quantity / change.currentQty) * 100 >= cfg.percent;
}

/**
 * May this login approve a stock adjustment (and so apply their own without waiting)? The owner; a manager with no
 * business role (the old behaviour); a manager whose role has Approve on inventory (COO). Staff never.
 */
export function canApproveAdjust(level: string, jobRole: unknown): boolean {
  if (level === "admin") return true;
  if (level !== "manager") return false;
  return canHoldRole(level, jobRole) ? allowed(jobRole as RoleCode, "inventory", "A") : true;
}

/** Approving one's own request is not a second pair of eyes — only the owner may. */
export function decideProblem(req: { status: string; requestedBy: string }, decider: { uid: string; level: string }): "" | "not-pending" | "own-request" {
  if (req.status !== "pending") return "not-pending";
  if (req.requestedBy === decider.uid && decider.level !== "admin") return "own-request";
  return "";
}
