/**
 * Pure aggregation of source documents into a dailyStats / monthlyStats document.
 * Formulas (profit, margin, break-even, prime cost) come from calc/health (spec §8).
 *
 * Definitions (see docs/backend-notes.md):
 *   income   = eventRevenue + cancellationCharges
 *   eventRevenue = Σ invoice (totalAmount − taxAmount) by issue date (GST collected is not income; Cancelled/Void = 0)
 *   cancellationCharges = Σ bookings.cancel.charge of bookings cancelled in the period (Round 9 "రద్దు చార్జీ")
 *   collected= Σ payments (refunds are negative)     by payment date
 *   food     = Σ purchases.totalAmount (not deleted) by purchase date
 *   labour   = Σ attendance.pay + Σ "Temporary Staff" expenses + monthly salaries (share for the period)
 *   other    = Σ other expenses (not deleted; "Staff Advance" excluded — it is part of salary)
 *   ads      = Σ adSpend.amount
 *   breakEven: fixed = settings.fixedMonthlyCosts × months (or the period's rent expenses when 0);
 *              variable = everything else
 */
import { breakEven, primeCostPct, profit } from "../calc/health";
import { round2 } from "../calc/util";
import { asNum, asObj, asStr, Doc, nonNeg } from "../shared/coerce";
import { cancellationSummary } from "../calc/cancellation";
import { costTargetOf, isLiveRecord } from "../shared/costTarget";

export const EXPENSE_SECTION_TEMP_STAFF = "Temporary Staff";
export const EXPENSE_SECTION_STAFF_ADVANCE = "Staff Advance";
export const EXPENSE_SECTION_RENT = "Rent / Fixed Expense";
const VOID_INVOICE_STATUSES = new Set(["Cancelled", "Void"]);

export interface StatsSources {
  invoices: Doc[];
  payments: Doc[];
  purchases: Doc[];
  expenses: Doc[];
  adSpend: Doc[];
  attendance: Doc[];
  /** bookings whose event falls in the period (cancelled ones are ignored) */
  eventBookings: Doc[];
  /** bookings created in the period (cancelled ones are ignored) */
  newBookings: Doc[];
  /** monthly-salary staff cost for this period (already pro-rated for a day) */
  monthlySalaries: number;
  /** fixed costs for this period; null = do not compute break-even */
  fixedCosts: number | null;
  /** R7-6 outside orders dated in the period (cost = acceptedQty × rate, counted as food) */
  outsideOrders?: Doc[];
  /** Round 9: bookings cancelled in the period (by cancelledAt); only status Cancelled counts */
  cancelledBookings?: Doc[];
}

export interface PeriodStats {
  income: number;
  /** Round 9: income from events only (invoices); income = eventRevenue + cancellationCharges */
  eventRevenue: number;
  /** Round 9 "రద్దు చార్జీ": advance kept on cancelled orders */
  cancellationCharges: number;
  /** Round 9 dashboard: orders cancelled in the period and money refunded on them */
  cancellations: number;
  cancelRefunded: number;
  /** Round 9: Σ bookings.cancelLoss of those orders ("రద్దైన event ఖర్చు" after the charge kept) */
  cancelLoss: number;
  collected: number;
  food: number;
  labour: number;
  other: number;
  ads: number;
  adsRevenue: number;
  adsLeads: number;
  adsBookings: number;
  profit: number;
  marginPct: number | null;
  events: number;
  bookings: number;
  breakEven: number | null;
  primeCostPct: number | null;
  invoiceCount: number;
  /** R7-1 purchases + expenses + outside orders tagged to overhead, by centre (untagged = general) */
  overheadByCentre: Record<string, number>;
}

// R7-3: cancelled / archived / deleted records never count.
const live = (d: Doc) => isLiveRecord(d);
const notCancelled = (d: Doc) => asStr(d.status) !== "Cancelled";

export function invoiceIncome(inv: Doc): number {
  if (VOID_INVOICE_STATUSES.has(asStr(inv.status))) return 0;
  return Math.max(0, nonNeg(inv.totalAmount) - nonNeg(inv.taxAmount));
}

export function aggregateStats(s: StatsSources): PeriodStats {
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const invoices = s.invoices.filter((i) => !VOID_INVOICE_STATUSES.has(asStr(i.status)));
  const eventRevenue = sum(invoices.map(invoiceIncome));
  const cancels = cancelMoney(s.cancelledBookings ?? []);
  const income = round2(eventRevenue + cancels.kept);
  const collected = sum(s.payments.filter(live).map((p) => asNum(p.amount)));
  const outside = (s.outsideOrders ?? []).filter(live);
  const outsideCost = (o: Doc) => round2(nonNeg(o.acceptedQty) * nonNeg(o.rate));
  const food = sum([...s.purchases.filter(live).map((p) => nonNeg(p.totalAmount)), ...outside.map(outsideCost)]);
  const exp = s.expenses.filter(live);
  const tempStaff = sum(exp.filter((e) => asStr(e.section) === EXPENSE_SECTION_TEMP_STAFF).map((e) => nonNeg(e.totalAmount)));
  const otherExp = exp.filter((e) => {
    const sec = asStr(e.section);
    return sec !== EXPENSE_SECTION_TEMP_STAFF && sec !== EXPENSE_SECTION_STAFF_ADVANCE;
  });
  const other = sum(otherExp.map((e) => nonNeg(e.totalAmount)));
  const rent = sum(otherExp.filter((e) => asStr(e.section) === EXPENSE_SECTION_RENT).map((e) => nonNeg(e.totalAmount)));
  const labour = sum([...s.attendance.filter(live).map((a) => nonNeg(a.pay)), tempStaff, Math.max(0, s.monthlySalaries)]);
  const adSpend = s.adSpend.filter(live);
  const ads = sum(adSpend.map((a) => nonNeg(a.amount)));
  const adsRevenue = sum(adSpend.map((a) => nonNeg(a.revenue)));
  const adsLeads = adSpend.reduce((a, d) => a + nonNeg(d.leads), 0);
  const adsBookings = adSpend.reduce((a, d) => a + nonNeg(d.bookings), 0);
  const overheadByCentre: Record<string, number> = {};
  const addOverhead = (d: Doc, amount: number) => {
    const t = costTargetOf(d);
    if (t.type === "overhead" && amount > 0) overheadByCentre[t.centre] = round2((overheadByCentre[t.centre] ?? 0) + amount);
  };
  s.purchases.filter(live).forEach((d) => addOverhead(d, nonNeg(d.totalAmount)));
  exp.filter((e) => asStr(e.section) !== EXPENSE_SECTION_STAFF_ADVANCE).forEach((d) => addOverhead(d, nonNeg(d.totalAmount)));
  outside.forEach((d) => addOverhead(d, outsideCost(d)));
  const p = profit(income, food, labour, other, ads);
  let be: number | null = null;
  if (s.fixedCosts !== null && income > 0) {
    const fixed = s.fixedCosts > 0 ? s.fixedCosts : rent;
    const variable = round2(food + labour + ads + Math.max(0, other - rent));
    be = breakEven(fixed, income, variable);
  }
  return {
    income,
    eventRevenue,
    cancellationCharges: cancels.kept,
    cancellations: cancels.count,
    cancelRefunded: cancels.refunded,
    cancelLoss: cancels.loss,
    collected,
    food,
    labour,
    other,
    ads,
    adsRevenue,
    adsLeads,
    adsBookings,
    profit: p.profit,
    marginPct: p.marginPct,
    events: s.eventBookings.filter(notCancelled).length,
    bookings: s.newBookings.filter(notCancelled).length,
    breakEven: be,
    primeCostPct: income > 0 ? primeCostPct(food, labour, income).pct : null,
    invoiceCount: invoices.length,
    overheadByCentre,
  };
}

/** Round 9: count / refunded / kept of cancelled bookings (status Cancelled with a `cancel` record). */
export function cancelMoney(bookings: Doc[]): { count: number; refunded: number; kept: number; loss: number; byReason: Record<string, { count: number; refunded: number; kept: number }> } {
  const cancelled = bookings.filter((b) => asStr(b.status) === "Cancelled" && b.isDeleted !== true);
  const rows = cancelled.map((b) => {
    const c = asObj(b.cancel);
    return { reasonCode: asStr(c.reasonCode) || "other", refund: nonNeg(c.refund), charge: nonNeg(c.charge) };
  });
  const loss = round2(cancelled.reduce((a, b) => a + nonNeg(b.cancelLoss), 0));
  return { ...cancellationSummary(rows), loss };
}

/** Adds stats of several periods (e.g. days of a week) and recomputes the derived fields. */
export function sumStats(parts: PeriodStats[], fixedCosts: number | null): PeriodStats {
  const add = (k: keyof PeriodStats) => round2(parts.reduce((a, p) => a + (typeof p[k] === "number" ? (p[k] as number) : 0), 0));
  const income = add("income");
  const food = add("food");
  const labour = add("labour");
  const other = add("other");
  const ads = add("ads");
  const p = profit(Math.max(0, income), Math.max(0, food), Math.max(0, labour), Math.max(0, other), Math.max(0, ads));
  return {
    income,
    eventRevenue: add("eventRevenue"),
    cancellationCharges: add("cancellationCharges"),
    cancellations: add("cancellations"),
    cancelRefunded: add("cancelRefunded"),
    cancelLoss: add("cancelLoss"),
    collected: add("collected"),
    food,
    labour,
    other,
    ads,
    adsRevenue: add("adsRevenue"),
    adsLeads: add("adsLeads"),
    adsBookings: add("adsBookings"),
    profit: p.profit,
    marginPct: p.marginPct,
    events: add("events"),
    bookings: add("bookings"),
    breakEven: fixedCosts !== null && income > 0 ? breakEven(fixedCosts, income, round2(food + labour + ads + other)) : null,
    primeCostPct: income > 0 ? primeCostPct(food, labour, income).pct : null,
    invoiceCount: add("invoiceCount"),
    overheadByCentre: mergeCentres(parts.map((x) => x.overheadByCentre)),
  };
}

export function emptyStats(): PeriodStats {
  return aggregateStats({ invoices: [], payments: [], purchases: [], expenses: [], adSpend: [], attendance: [], eventBookings: [], newBookings: [], monthlySalaries: 0, fixedCosts: null });
}

export function mergeCentres(maps: (Record<string, number> | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) for (const [k, v] of Object.entries(m ?? {})) if (typeof v === "number" && Number.isFinite(v)) out[k] = round2((out[k] ?? 0) + v);
  return out;
}

/** Reads a stored stats document (missing fields → 0 / null). */
export function readStats(d: Doc | undefined): PeriodStats {
  const e = emptyStats();
  if (!d) return e;
  const out = { ...e } as unknown as Record<string, unknown>;
  for (const k of Object.keys(e)) {
    if (k === "overheadByCentre") continue;
    const v = d[k];
    out[k] = typeof v === "number" && Number.isFinite(v) ? v : (e as unknown as Record<string, unknown>)[k];
  }
  out.overheadByCentre = mergeCentres([asObj(d.overheadByCentre) as Record<string, number>]);
  return out as unknown as PeriodStats;
}
