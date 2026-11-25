import { getFirestore } from "firebase-admin/firestore";
import { callable, ADMIN, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optArray, optNum, reqMonth, reqNum, reqOneOf } from "../shared/validate";
import { asObj, Doc } from "../shared/coerce";
import { auditOverride, readManual } from "../shared/override";
import { daysBetween, daysInMonth, monthsBetween, todayIST } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { Period, periodRange } from "../calc/periods";
import { replanWithManual } from "../calc/ops";
import { primeCostPct } from "../calc/health";
import { readStats, sumStats, PeriodStats } from "../stats/aggregate";
import { finishedMonths, monthIncomes, monthKey, readTargetDoc, saveYearPlan } from "./plan";
import { resolveYearTargetInputs } from "./months";
import { findLeaks } from "./leaks";
import { buildFullBoard, filterBoard } from "./boardView";

export const setYearTarget = callable("setYearTarget", ADMIN, async (data, caller) => {
  const year = reqNum(data, "year", { int: true, min: 2020, max: 2100 });
  const yearTarget = reqNum(data, "yearTarget", { int: true, min: 0, gt: true });
  const settings = await loadSettings();
  const profitMarginPct = optNum(data, "profitMarginPct", { min: 0, max: 100 });
  const w = optArray(data, "weights", 12);
  if (w && (w.length !== 12 || !w.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0))) {
    fail("invalid-argument", "12 నెలలకి season weights (0 లేదా ఎక్కువ) ఇవ్వాలి.", "weights must be 12 numbers ≥ 0.");
  }
  const manualObj = asObj(data.manual);
  const manualMonthsRaw = data.manualMonths ?? manualObj.months;
  const reason = data.reason ?? manualObj.reason;
  // manualMonths: (number | null)[12] — number = typed month, null = automatic month; 12 nulls = fully automatic.
  if (manualMonthsRaw !== undefined && manualMonthsRaw !== null) {
    if (!Array.isArray(manualMonthsRaw) || manualMonthsRaw.length !== 12 || !manualMonthsRaw.every((x) => x === null || (typeof x === "number" && Number.isInteger(x) && x >= 0))) {
      fail("invalid-argument", "12 నెలలకి target ఇవ్వాలి — ప్రతి నెల పూర్ణ రూపాయలు (0 లేదా ఎక్కువ) లేదా ఖాళీ (ఆటోమేటిక్).", "manualMonths must be 12 entries, each a whole number ≥ 0 or null.");
    }
  }
  const stored = readTargetDoc((await getFirestore().collection(FirestoreCollections.TARGETS).doc(String(year)).get()).data() as Doc | undefined);
  const inp = resolveYearTargetInputs(
    { profitMarginPct, weights: w as number[] | undefined, manualMonths: manualMonthsRaw === undefined || manualMonthsRaw === null ? undefined : (manualMonthsRaw as (number | null)[]) },
    stored,
    settings,
  );
  const anyTyped = inp.manualMonths.some((x) => x !== null);
  // New typed months need a reason and override permission; kept (not sent) months keep who typed them.
  const m = inp.manualMonthsSent && anyTyped ? readManual({ reason }, [], caller, settings, "targets") : null;
  const override = inp.manualMonthsSent ? { caller, reason: m?.reason ?? "" } : undefined;
  const plan = await saveYearPlan(year, yearTarget, inp.profitMarginPct, inp.weights, new Date(), inp.manualMonths, override);
  if (m) await auditOverride(caller, "setYearTarget:manualMonths", FirestoreCollections.TARGETS, String(year), plan.months.map((x) => x.autoValue), inp.manualMonths, m.reason);
  return { months: plan.months, calcMode: plan.calcMode };
});

/**
 * Round 11: the Target Board is the first screen for everyone (admin, manager, staff). The role filter is done
 * here (boardView.filterBoard): profit only for admin; ₹ sales only for admin unless the owner switched
 * settings.targetBoardShowRupeesToAll on; otherwise percentages and progress only.
 */
export const getTargetBoard = callable("getTargetBoard", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const month = reqMonth(data, "month");
  const year = Number(month.slice(0, 4));
  const mi = Number(month.slice(5, 7)) - 1;
  const today = todayIST();
  const isCurrent = month === today.slice(0, 7);
  const [tSnap, incomes, mSnap, dSnap, settings] = await Promise.all([
    db.collection(FirestoreCollections.TARGETS).doc(String(year)).get(),
    monthIncomes(year),
    db.collection(FirestoreCollections.MONTHLY_STATS).doc(month).get(),
    isCurrent ? db.collection(FirestoreCollections.DAILY_STATS).doc(today).get() : Promise.resolve(null),
    loadSettings(),
  ]);
  const t = readTargetDoc(tSnap.data() as Doc | undefined);
  if (!t) fail("failed-precondition", `${year} సంవత్సర target ఇంకా పెట్టలేదు.`, `No year target set for ${year}.`);
  // Recompute from current actuals so the board never shows a stale target; typed months stay as typed (§4b).
  const plan = replanWithManual(t.yearTarget, t.weights ?? settings.seasonWeights, incomes.slice(0, finishedMonths(year, today)), t.manualMonths);
  const stats = readStats(mSnap.data() as Doc | undefined);
  // Optional count targets on targets/{year}: eventTargets[12], bookingTargets[12].
  const countTarget = (field: string): number | null => {
    const arr = (tSnap.data() as Doc | undefined)?.[field];
    const v = Array.isArray(arr) ? arr[mi] : undefined;
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const full = buildFullBoard({
    month,
    today,
    yearTarget: t.yearTarget,
    profitMarginPct: t.profitMarginPct,
    monthTarget: plan.months[mi].revised,
    monthAutoValue: plan.months[mi].autoValue,
    monthCalcMode: plan.months[mi].calcMode,
    monthActual: stats.income,
    todayActual: dSnap ? readStats(dSnap.data() as Doc | undefined).income : 0,
    yearActual: incomes.reduce((x, y) => x + y, 0),
    aheadOrBehind: plan.aheadOrBehind,
    monthProfit: stats.profit,
    events: { actual: stats.events, target: countTarget("eventTargets") },
    bookings: { actual: stats.bookings, target: countTarget("bookingTargets") },
    daysInMonth: daysInMonth(month),
  });
  return { ...filterBoard(full, caller.role, settings.targetBoardShowRupeesToAll), generatedAt: new Date().toISOString() };
});

export const PNL_PERIODS: Period[] = ["day", "week", "month", "3m", "6m", "12m"];

export const getPnl = callable("getPnl", ADMIN, async (data) => {
  const db = getFirestore();
  const period = reqOneOf(data, "period", PNL_PERIODS);
  const settings = await loadSettings();
  const { start, end } = periodRange(new Date(), period);
  const daily = period === "day" || period === "week" || period === "month";
  let series: { label: string; income: number; profit: number }[];
  let totals: PeriodStats;
  if (daily) {
    const days = daysBetween(start, end);
    const snaps = await db.getAll(...days.map((d) => db.collection(FirestoreCollections.DAILY_STATS).doc(d)));
    const parts = snaps.map((s) => readStats(s.data() as Doc | undefined));
    series = parts.map((p, i) => ({ label: days[i], income: p.income, profit: p.profit }));
    if (period === "month") {
      // the month document includes the full monthly salaries and the month's fixed costs
      const m = await db.collection(FirestoreCollections.MONTHLY_STATS).doc(days[0].slice(0, 7)).get();
      totals = readStats(m.data() as Doc | undefined);
    } else {
      const share = settings.fixedMonthlyCosts > 0 ? (settings.fixedMonthlyCosts * days.length) / daysInMonth(days[0].slice(0, 7)) : null;
      totals = sumStats(parts, share);
    }
  } else {
    const months = monthsBetween(start, end);
    const snaps = await db.getAll(...months.map((m) => db.collection(FirestoreCollections.MONTHLY_STATS).doc(m)));
    const parts = snaps.map((s) => readStats(s.data() as Doc | undefined));
    series = parts.map((p, i) => ({ label: months[i], income: p.income, profit: p.profit }));
    totals = sumStats(parts, settings.fixedMonthlyCosts > 0 ? settings.fixedMonthlyCosts * months.length : null);
  }
  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    income: totals.income,
    // Round 9: income = eventRevenue + cancellationCharges ("రద్దు చార్జీ"); cancellations for the dashboard card
    eventRevenue: totals.eventRevenue,
    cancellationCharges: totals.cancellationCharges,
    cancelLoss: totals.cancelLoss,
    cancellations: { count: totals.cancellations, refunded: totals.cancelRefunded, kept: totals.cancellationCharges, loss: totals.cancelLoss },
    food: totals.food,
    labour: totals.labour,
    other: totals.other,
    ads: totals.ads,
    profit: totals.profit,
    marginPct: totals.marginPct,
    primeCost: totals.income > 0 ? primeCostPct(totals.food, totals.labour, totals.income) : null,
    breakEven: totals.breakEven,
    collected: totals.collected,
    overheadByCentre: totals.overheadByCentre,
    leaks: findLeaks(totals),
    series,
  };
});

export { monthKey };
