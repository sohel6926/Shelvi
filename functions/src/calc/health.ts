import { Band, requireNonNeg, requirePositive, round2, roundHalfAway } from "./util";

/** Spec §8. */
export function breakEven(fixedCosts: number, revenue: number, variableCosts: number): number | null {
  requireNonNeg("fixedCosts", fixedCosts);
  requirePositive("revenue", revenue);
  requireNonNeg("variableCosts", variableCosts);
  const ratio = (revenue - variableCosts) / revenue;
  if (ratio <= 0) return null;
  return roundHalfAway(fixedCosts / ratio);
}

export function primeCostPct(food: number, labour: number, revenue: number): { pct: number; band: Band } {
  requireNonNeg("food", food);
  requireNonNeg("labour", labour);
  requirePositive("revenue", revenue);
  const pct = round2(((food + labour) / revenue) * 100);
  return { pct, band: pct <= 60 ? "good" : pct <= 65 ? "warn" : "bad" };
}

export function adsResult(spend: number, revenue: number, bookings: number): { roas: number | null; costPerBooking: number | null; band: Band | "none" } {
  requireNonNeg("spend", spend);
  requireNonNeg("revenue", revenue);
  requireNonNeg("bookings", bookings);
  if (spend === 0) return { roas: null, costPerBooking: null, band: "none" };
  const roas = round2(revenue / spend);
  return { roas, costPerBooking: bookings === 0 ? null : round2(spend / bookings), band: roas >= 3 ? "good" : roas >= 1 ? "warn" : "bad" };
}

export function profit(income: number, food: number, labour: number, other: number, ads: number): { profit: number; marginPct: number | null } {
  [["income", income], ["food", food], ["labour", labour], ["other", other], ["ads", ads]].forEach(([n, v]) => requireNonNeg(n as string, v as number));
  const p = round2(income - food - labour - other - ads);
  return { profit: p, marginPct: income > 0 ? round2((p / income) * 100) : null };
}
