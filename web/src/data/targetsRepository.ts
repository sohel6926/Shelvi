import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import type { MonthPlan } from "./functions";
import { toCalcMeta, type CalcMeta } from "./calcMode";

/** `targets/{year}` — yearTarget, profitMarginPct, weights set by the admin; 🔒 months / aheadOrBehind by the server. */
export interface YearTargetDoc {
  yearTarget: number;
  profitMarginPct: number;
  weights: number[];
  months: MonthPlan[];
  aheadOrBehind: number | null;
  /** Owner-typed month targets (null = automatic); any number puts targets in manual mode. */
  manualMonths: (number | null)[];
  /** Per month: what the planner would have set (when the month is manual), if the server stores it. */
  autoMonths: (number | null)[];
  calc: CalcMeta;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function toTarget(d: DocumentData): YearTargetDoc {
  return {
    yearTarget: num(d.yearTarget),
    profitMarginPct: typeof d.profitMarginPct === "number" ? d.profitMarginPct : 25,
    weights: Array.isArray(d.weights) ? d.weights.map(num) : [],
    months: Array.isArray(d.months)
      ? d.months.map((m: DocumentData) => ({ original: num(m?.original), revised: num(m?.revised), isActual: m?.isActual === true }))
      : [],
    aheadOrBehind: typeof d.aheadOrBehind === "number" ? d.aheadOrBehind : null,
    manualMonths: Array.from({ length: 12 }, (_, i) => {
      const v = Array.isArray(d.manualMonths) ? d.manualMonths[i] : null;
      return typeof v === "number" ? v : null;
    }),
    autoMonths: Array.from({ length: 12 }, (_, i) => {
      const m = Array.isArray(d.months) ? (d.months[i] as DocumentData | undefined) : undefined;
      return typeof m?.autoValue === "number" ? m.autoValue : null;
    }),
    calc: toCalcMeta(d),
  };
}

export function subscribeYearTarget(
  year: number,
  onData: (t: YearTargetDoc | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, "targets", String(year)),
    (snap) => onData(snap.exists() ? toTarget(snap.data()) : null),
    (e) => onError?.(e),
  );
}
