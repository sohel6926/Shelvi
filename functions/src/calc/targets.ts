import { CalcError, requireFinite, requireNonNeg, round2, roundHalfAway } from "./util";

/** Split a whole-rupee amount over weights (largest remainder). Parts sum to amount exactly. */
export function allocate(amount: number, weights: number[]): number[] {
  requireNonNeg("amount", amount);
  if (!Number.isInteger(amount)) throw new CalcError("amount must be whole rupees");
  if (weights.length === 0) {
    if (amount !== 0) throw new CalcError("cannot allocate to zero months");
    return [];
  }
  weights.forEach((w, i) => requireNonNeg(`weight[${i}]`, w));
  let total = weights.reduce((a, b) => a + b, 0);
  const w = total > 0 ? weights : weights.map(() => 1);
  total = w.reduce((a, b) => a + b, 0);
  // Work with numerators (amount * w_i) so equal remainders compare equal; exact for whole-number weights.
  const num = w.map((x) => amount * x);
  const base = num.map((x) => Math.floor(x / total + 1e-9));
  let left = amount - base.reduce((a, b) => a + b, 0);
  const tol = 1e-7 * Math.max(1, total);
  const order = num
    .map((x, i) => ({ i, r: x - base[i] * total }))
    .sort((a, b) => (b.r - a.r > tol ? 1 : a.r - b.r > tol ? -1 : a.i - b.i));
  for (let k = 0; k < order.length && left > 0; k++, left--) base[order[k].i] += 1;
  return base;
}

export interface MonthPlan {
  original: number;
  revised: number;
  isActual: boolean;
}

function checkInputs(yearTarget: number, weights: number[]): void {
  requireFinite("yearTarget", yearTarget);
  if (!Number.isInteger(yearTarget) || yearTarget <= 0) throw new CalcError("yearTarget must be a positive whole number");
  if (weights.length !== 12) throw new CalcError("need 12 season weights");
  if (weights.reduce((a, b) => a + b, 0) <= 0) throw new CalcError("season weights must not all be 0");
}

export function originalPlan(yearTarget: number, weights: number[]): number[] {
  checkInputs(yearTarget, weights);
  return allocate(yearTarget, weights);
}

/** Spec §4. actuals = income of finished months, Jan first. */
export function replan(yearTarget: number, weights: number[], actuals: number[]): { months: MonthPlan[]; aheadOrBehind: number } {
  checkInputs(yearTarget, weights);
  if (actuals.length > 12) throw new CalcError("at most 12 actual months");
  actuals.forEach((a, i) => requireNonNeg(`actual[${i}]`, a));
  const original = allocate(yearTarget, weights);
  const m = actuals.length;
  const done = actuals.map((a) => Math.floor(a + 0.5));
  const remaining = yearTarget - done.reduce((a, b) => a + b, 0);
  // All 12 months finished: nothing left to plan; any shortfall shows in aheadOrBehind.
  const future = m === 12 ? [] : allocate(Math.max(0, remaining), weights.slice(m));
  const months = original.map((o, i) => ({ original: o, revised: i < m ? done[i] : future[i - m], isActual: i < m }));
  const aheadOrBehind = round2(actuals.reduce((a, b) => a + b, 0) - original.slice(0, m).reduce((a, b) => a + b, 0));
  return { months, aheadOrBehind };
}

export function profitTarget(yearTarget: number, marginPct = 25): number {
  requireFinite("yearTarget", yearTarget);
  if (!Number.isInteger(yearTarget) || yearTarget <= 0) throw new CalcError("yearTarget must be a positive whole number");
  requireFinite("marginPct", marginPct);
  if (marginPct < 0 || marginPct > 100) throw new CalcError("marginPct must be between 0 and 100");
  return roundHalfAway((yearTarget * marginPct) / 100);
}

export function dailyNeeded(monthTarget: number, monthActualSoFar: number, daysLeftIncludingToday: number): number {
  requireNonNeg("monthTarget", monthTarget);
  requireNonNeg("monthActualSoFar", monthActualSoFar);
  if (!Number.isInteger(daysLeftIncludingToday) || daysLeftIncludingToday < 1) throw new CalcError("daysLeft must be a whole number ≥ 1");
  const need = Math.max(0, monthTarget - monthActualSoFar);
  return need === 0 ? 0 : Math.ceil(need / daysLeftIncludingToday - 1e-9);
}
