/**
 * Module 2c (18 Nov 2026) — yield (cleaning loss). Spec CMF 04 "Yield: cleaning loss %, edible yield %" and CMF 08.
 * A grocery item may carry yieldPct: the share of what is bought that can actually be used (onion 85 = 15% is peel).
 * The recipe says how much USABLE item a dish needs; what must be BOUGHT (and taken from stock) is needed ÷ yield.
 * Blank / 100 = no loss: nothing changes. No percentage is assumed — the owner types it per item.
 */
import { ceilTol, round2 } from "../calc/util";

export const YIELD_MIN_PCT = 10;
export const YIELD_MAX_PCT = 100;

/** Stored value → a safe percentage. Missing, not a number or outside 10–100 → 100 (no loss). */
export function normalizeYieldPct(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= YIELD_MIN_PCT && raw <= YIELD_MAX_PCT ? raw : 100;
}

/** Is this something a person may save as a yield? (blank is stored as null) */
export function isValidYieldPct(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= YIELD_MIN_PCT && v <= YIELD_MAX_PCT);
}

/**
 * Quantity to buy for `usable` quantity needed. kg / L are rounded up to 0.1, pcs up to a whole piece, other units
 * to 2 decimals. With yield 100 the result is exactly `usable` (no rounding drift for items without a loss).
 */
export function grossQty(usable: number, yieldPct: number, unit: string): number {
  const y = normalizeYieldPct(yieldPct);
  if (!(usable > 0)) return 0;
  if (y === 100) return usable;
  const gross = usable / (y / 100);
  if (unit === "pcs") return ceilTol(gross);
  if (unit === "kg" || unit === "L") return ceilTol(gross * 10) / 10;
  return round2(gross);
}

/** Loss in the item's unit for a bought quantity (shown to the owner): bought × (1 − yield). */
export function lossQty(bought: number, yieldPct: number): number {
  const y = normalizeYieldPct(yieldPct);
  return bought > 0 ? round2(bought * (1 - y / 100)) : 0;
}
