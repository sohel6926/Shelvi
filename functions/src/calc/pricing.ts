import { Band, CalcError, ceilTol, requireFinite, requireNonNeg, round2 } from "./util";

/** Spec §3. */
export function plateCost(foodPerPlate: number, otherPerPlate: number): number {
  requireNonNeg("foodPerPlate", foodPerPlate);
  requireNonNeg("otherPerPlate", otherPerPlate);
  return round2(foodPerPlate + otherPerPlate);
}

export function suggestedPrice(cost: number, targetMargin = 0.3): number {
  requireNonNeg("cost", cost);
  requireFinite("targetMargin", targetMargin);
  if (targetMargin < 0 || targetMargin >= 1) throw new CalcError("targetMargin must be in [0, 1)");
  const raw = cost / (1 - targetMargin);
  return ceilTol(raw / 5) * 5;
}

export function margin(price: number, cost: number): { pct: number | null; band: Band } {
  requireFinite("price", price);
  requireNonNeg("cost", cost);
  if (price <= 0) return { pct: null, band: "bad" };
  const pct = round2(((price - cost) / price) * 100);
  return { pct, band: pct >= 25 ? "good" : pct >= 10 ? "warn" : "bad" };
}
