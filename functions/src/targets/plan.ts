import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asArr, asNum, Doc } from "../shared/coerce";
import { todayIST } from "../shared/istDate";
import { MonthPlan, profitTarget } from "../calc/targets";
import { MonthPlanWithMode, replanWithManual } from "../calc/ops";
import { autoFields, manualFields } from "../shared/override";
import { CallerContext } from "../auth/authContext";
import { readStats } from "../stats/aggregate";

import { finishedMonths, monthKey, readManualMonths } from "./months";

export { finishedMonths, monthKey, readManualMonths };

export async function monthIncomes(year: number): Promise<number[]> {
  const db = getFirestore();
  const refs = Array.from({ length: 12 }, (_, i) => db.collection(FirestoreCollections.MONTHLY_STATS).doc(monthKey(year, i)));
  const snaps = await db.getAll(...refs);
  return snaps.map((s) => readStats(s.data() as Doc | undefined).income);
}

export const ALL_AUTO: (number | null)[] = Array.from({ length: 12 }, () => null);

/**
 * Plan §4 / §4b with the finished months' actual income and save targets/{year}.
 * manualMonths: number = typed month, null = automatic month (all null = fully automatic).
 * `override` (setYearTarget) records who typed it; without it (target planner) the typed months and their
 * override details are kept and only the automatic months are re-planned.
 */
export async function saveYearPlan(
  year: number,
  yearTarget: number,
  marginPct: number,
  weights: number[],
  now: Date = new Date(),
  manualMonths: (number | null)[] = ALL_AUTO,
  override?: { caller: CallerContext; reason: string },
): Promise<{ months: MonthPlanWithMode[]; aheadOrBehind: number; profitTarget: number; calcMode: "auto" | "manual" }> {
  const incomes = await monthIncomes(year);
  const m = finishedMonths(year, todayIST(now));
  const plan = replanWithManual(yearTarget, weights, incomes.slice(0, m), manualMonths);
  const pt = profitTarget(yearTarget, marginPct);
  const calcMode = manualMonths.some((v) => v !== null) ? "manual" : "auto";
  const autoMonths = plan.months.map((x) => x.autoValue);
  const modeFields = override ? (calcMode === "manual" ? manualFields(override.caller, autoMonths, override.reason) : autoFields(autoMonths)) : { calcMode, autoValue: autoMonths };
  await getFirestore()
    .collection(FirestoreCollections.TARGETS)
    .doc(String(year))
    .set(
      {
        year,
        yearTarget,
        profitMarginPct: marginPct,
        weights,
        months: plan.months,
        manualMonths,
        aheadOrBehind: plan.aheadOrBehind,
        profitTarget: pt,
        ...modeFields,
        updatedBy: override ? override.caller.uid : "system",
        replannedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return { months: plan.months, aheadOrBehind: plan.aheadOrBehind, profitTarget: pt, calcMode };
}

export function readTargetDoc(d: Doc | undefined): { yearTarget: number; profitMarginPct: number; weights: number[] | null; months: MonthPlan[]; manualMonths: (number | null)[]; calcMode: "auto" | "manual" } | null {
  if (!d || !(asNum(d.yearTarget) > 0)) return null;
  const w = asArr(d.weights);
  const manualMonths = readManualMonths(d.manualMonths);
  return {
    yearTarget: asNum(d.yearTarget),
    manualMonths,
    calcMode: manualMonths.some((x) => x !== null) ? "manual" : "auto",
    profitMarginPct: asNum(d.profitMarginPct, 25),
    weights: w.length === 12 && w.every((x) => typeof x === "number") ? (w as number[]) : null,
    months: asArr(d.months).map((x) => {
      const o = x as Doc;
      return { original: asNum(o?.original), revised: asNum(o?.revised), isActual: o?.isActual === true };
    }),
  };
}
