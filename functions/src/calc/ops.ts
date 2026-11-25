/**
 * Extra pure calculations needed by the backend that docs/calc-spec.md does not yet cover.
 * Proposed spec text for each is in docs/backend-notes.md (§7b monthly pay, rate rise, percent of target).
 * Kept in a separate file so the existing tested modules are unchanged.
 */
import { CalcError, requireFinite, requireNonNeg, requirePositive, round2, roundHalfAway } from "./util";
import { dayPay } from "./wages";
import { allocate, replan } from "./targets";

export type AttendanceStatus = "present" | "half" | "absent" | "leave";

export interface MonthlyPayRulesInput {
  deductAbsences: boolean;
  freeLeaves: number;
  overtime: boolean;
}

export interface PayrollRow {
  gross: number;
  cut: number;
  ot: number;
  advances: number;
  net: number;
}

/**
 * §7b (proposed) — month salary of a monthly-paid staff member.
 *   perDay  = monthlySalary / daysInMonth
 *   missed  = absent + leave + 0.5 × half            (days)
 *   unpaid  = max(0, missed − freeLeaves)
 *   cut     = deductAbsences ? round2(min(monthlySalary, unpaid × perDay)) : 0
 *   ot      = overtime ? round2(Σ max(0, hours − 8) × (perDay / 8) × 1.5) : 0     (present/half days)
 *   net     = round2(monthlySalary − cut + ot − advances)                           (may be negative)
 * Owner's current rule (default): no cut for leave, no OT, advances deducted.
 */
export function monthlyStaffPay(
  monthlySalary: number,
  daysInMonth: number,
  days: { status: AttendanceStatus; hours: number }[],
  advances: number,
  rules: MonthlyPayRulesInput,
): PayrollRow {
  requireNonNeg("monthlySalary", monthlySalary);
  if (!Number.isInteger(daysInMonth) || daysInMonth < 28 || daysInMonth > 31) throw new CalcError("daysInMonth must be 28–31");
  requireNonNeg("advances", advances);
  requireNonNeg("freeLeaves", rules.freeLeaves);
  const perDay = monthlySalary / daysInMonth;
  let missed = 0;
  let otHours = 0;
  days.forEach((d, i) => {
    requireFinite(`days[${i}].hours`, d.hours);
    if (d.hours < 0 || d.hours > 24) throw new CalcError(`days[${i}].hours must be between 0 and 24`);
    if (d.status === "absent" || d.status === "leave") missed += 1;
    else if (d.status === "half") missed += 0.5;
    else if (d.status !== "present") throw new CalcError(`days[${i}].status is not valid`);
    if (d.status === "present" || d.status === "half") otHours += Math.max(0, d.hours - 8);
  });
  const unpaid = Math.max(0, missed - rules.freeLeaves);
  const cut = rules.deductAbsences ? round2(Math.min(monthlySalary, unpaid * perDay)) : 0;
  const ot = rules.overtime ? round2(otHours * (perDay / 8) * 1.5) : 0;
  const gross = round2(monthlySalary);
  return { gross, cut, ot, advances: round2(advances), net: round2(gross - cut + ot - advances) };
}

/**
 * Month salary of a daily-paid staff member split into the payroll columns, using §7 dayPay:
 * gross = Σ pay of the first 8 hours, ot = Σ pay beyond 8 hours, net = gross + ot − advances.
 * (gross + ot equals §7 monthSalary gross.)
 */
export function dailyStaffPay(dailyWage: number, days: { hours: number; manualPay?: number | null }[], advances: number): PayrollRow {
  requireNonNeg("advances", advances);
  // A day with a manual pay (typed by the owner) counts as that amount, all in gross (no OT split).
  days.forEach((d, i) => {
    if (d.manualPay !== undefined && d.manualPay !== null) requireNonNeg(`days[${i}].manualPay`, d.manualPay);
  });
  const isManual = (d: { manualPay?: number | null }) => d.manualPay !== undefined && d.manualPay !== null;
  const full = round2(days.reduce((a, d) => a + (isManual(d) ? (d.manualPay as number) : dayPay(dailyWage, d.hours)), 0));
  const base = round2(days.reduce((a, d) => a + (isManual(d) ? (d.manualPay as number) : dayPay(dailyWage, Math.min(d.hours, 8))), 0));
  const ot = round2(full - base);
  return { gross: base, cut: 0, ot, advances: round2(advances), net: round2(full - advances) };
}

/** Rate change in percent, rounded to 2 decimals: (new − old) / old × 100. */
export function rateChangePct(oldRate: number, newRate: number): number {
  requirePositive("oldRate", oldRate);
  requireNonNeg("newRate", newRate);
  return round2(((newRate - oldRate) / oldRate) * 100);
}

/** actual as a percent of target, rounded half away from zero to `decimals` (2 or 1); null when the target is 0. */
export function percentOf(actual: number, target: number, decimals: 1 | 2 = 2): number | null {
  requireFinite("actual", actual);
  requireNonNeg("target", target);
  if (target === 0) return null;
  const pct = (actual / target) * 100;
  return decimals === 2 ? round2(pct) : roundHalfAway(pct * 10) / 10;
}

/**
 * Manual total typed by a person (manual mode): split a GST-inclusive total back into taxable value and tax
 * so the stored fields stay consistent with §1 (cgst + sgst + igst == tax, taxable + tax == total).
 *   taxable = round2(total × 100 / (100 + gstRate));  tax = round2(total − taxable)
 */
export function splitGrossTotal(total: number, gstRate: number, isInterState: boolean): { taxable: number; cgst: number; sgst: number; igst: number; tax: number; total: number } {
  requireNonNeg("total", total);
  requireFinite("gstRate", gstRate);
  if (gstRate < 0 || gstRate > 28) throw new CalcError("gstRate must be between 0 and 28");
  if (typeof isInterState !== "boolean") throw new CalcError("isInterState must be true or false");
  const t = round2(total);
  const taxable = round2((t * 100) / (100 + gstRate));
  const tax = round2(t - taxable);
  if (isInterState) return { taxable, cgst: 0, sgst: 0, igst: tax, tax, total: t };
  const cgst = round2(tax / 2);
  return { taxable, cgst, sgst: round2(tax - cgst), igst: 0, tax, total: t };
}

/**
 * New invoice total (manual override or switch back to automatic) against the amount already paid:
 * total must not go below amountPaid; balance = round2(max(0, total − paid)); status follows §2 —
 * "Paid" when nothing is left, "PartiallyPaid" when something was paid, otherwise "Unpaid" (caller keeps its draft status).
 */
export function invoiceAfterTotalChange(total: number, amountPaid: number): { total: number; balanceDue: number; status: "Paid" | "PartiallyPaid" | "Unpaid" } {
  requireNonNeg("total", total);
  requireNonNeg("amountPaid", amountPaid);
  const t = round2(total);
  if (t + 0.005 < amountPaid) throw new CalcError(`total ₹${t} cannot be less than the amount already paid ₹${amountPaid}`);
  const balanceDue = round2(Math.max(0, t - amountPaid));
  return { total: t, balanceDue, status: balanceDue === 0 ? "Paid" : amountPaid > 0 ? "PartiallyPaid" : "Unpaid" };
}

export interface MonthPlanWithMode {
  original: number;
  revised: number;
  isActual: boolean;
  calcMode: "auto" | "manual";
  /** what the fully automatic plan (§4 replan) gives for this month */
  autoValue: number;
}

/**
 * §4b — year plan with some months typed by hand. manualMonths[i] is a whole-rupee number ≥ 0 (typed) or null
 * (automatic). Automatic finished months (i < m) keep their rounded actual; automatic future months share
 * max(0, Y − Σ typed − Σ automatic finished actuals) by season weight with `allocate`. All null = §4 replan.
 */
export function replanWithManual(
  yearTarget: number,
  weights: number[],
  actuals: number[],
  manualMonths: (number | null)[],
): { months: MonthPlanWithMode[]; aheadOrBehind: number } {
  if (!Array.isArray(manualMonths) || manualMonths.length !== 12) throw new CalcError("manualMonths must have 12 entries (number or null)");
  manualMonths.forEach((v, i) => {
    if (v === null) return;
    requireNonNeg(`manualMonths[${i}]`, v);
    if (!Number.isInteger(v)) throw new CalcError(`manualMonths[${i}] must be whole rupees`);
  });
  const auto = replan(yearTarget, weights, actuals);
  const m = actuals.length;
  const typed = manualMonths.map((v) => v !== null);
  if (!typed.some(Boolean)) {
    return { months: auto.months.map((x) => ({ ...x, calcMode: "auto" as const, autoValue: x.revised })), aheadOrBehind: auto.aheadOrBehind };
  }
  const doneAuto = actuals.map((a, i) => (typed[i] ? 0 : Math.floor(a + 0.5)));
  const fixed = manualMonths.reduce<number>((s2, v) => s2 + (v ?? 0), 0) + doneAuto.reduce((x, y) => x + y, 0);
  const free: number[] = [];
  for (let i = m; i < 12; i++) if (!typed[i]) free.push(i);
  const shares = free.length ? allocate(Math.max(0, yearTarget - fixed), free.map((i) => weights[i])) : [];
  const months = auto.months.map((x, i) => {
    if (typed[i]) return { original: x.original, revised: manualMonths[i] as number, isActual: false, calcMode: "manual" as const, autoValue: x.revised };
    if (i < m) return { original: x.original, revised: doneAuto[i], isActual: true, calcMode: "auto" as const, autoValue: x.revised };
    return { original: x.original, revised: shares[free.indexOf(i)], isActual: false, calcMode: "auto" as const, autoValue: x.revised };
  });
  return { months, aheadOrBehind: auto.aheadOrBehind };
}
