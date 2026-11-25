/**
 * Module 2i (18 Nov 2026) — three costs kept apart. Spec BP p9 / IMP p15: "standard, estimated and actual cost are
 * separate and never overwrite each other". Pure, no Firestore.
 *
 *  - standard  — what a plate of a menu SHOULD cost. The owner fixes it on the menu package; it stays until the owner
 *                fixes it again (each fixing is kept in history).
 *  - estimated — what THIS event is expected to cost, worked out once when the booking is confirmed (its guests, its
 *                menu, the purchase rates of that day) and then frozen. A re-estimate makes a new version.
 *  - actual    — what the event really cost: purchases, expenses, wages, transport tagged to it (bookings.costActual,
 *                kept by the cost trigger). It moves as bills come in.
 */
import { asNum, asObj, asStr, Doc } from "../shared/coerce";
import { round2 } from "../calc/util";

export interface CostLine {
  qty: number;
  rate: number | null;
}

export interface CostFigure {
  guests: number;
  food: number;
  labour: number;
  overhead: number;
  total: number;
  perPlate: number;
  /** share of ingredient lines that had a purchase rate (100 = fully known); null when there were no lines */
  coveragePct: number | null;
  /** true when every ingredient line had a rate and there was at least one line */
  complete: boolean;
}

/** Cost of an event or of a menu at `guests`: ingredients × rates + labour and overhead per plate. */
export function costFigure(p: { guests: number; lines: CostLine[]; labourPerPlate: number; overheadPerPlate: number }): CostFigure {
  const guests = Number.isInteger(p.guests) && p.guests > 0 ? p.guests : 0;
  let food = 0;
  let costed = 0;
  let priced = 0;
  for (const l of p.lines) {
    if (!(l.qty > 0)) continue;
    costed++;
    if (l.rate === null || !(l.rate > 0)) continue;
    priced++;
    food += l.qty * l.rate;
  }
  const labour = round2(Math.max(0, p.labourPerPlate) * guests);
  const overhead = round2(Math.max(0, p.overheadPerPlate) * guests);
  const total = round2(round2(food) + labour + overhead);
  return {
    guests,
    food: round2(food),
    labour,
    overhead,
    total,
    perPlate: guests ? round2(total / guests) : 0,
    coveragePct: costed ? Math.round((priced / costed) * 1000) / 10 : null,
    complete: costed > 0 && priced === costed,
  };
}

const HELD = ["Confirmed", "InProgress", "Completed", "Closed"];

/** Estimate now? The booking has just become Confirmed (from an enquiry or new) and has no estimate yet. */
export function needsEstimate(before: Doc | undefined, after: Doc | undefined): boolean {
  if (!after || after.archived === true || asStr(after.status) !== "Confirmed") return false;
  if (after.costEstimate) return false;
  return !before || !HELD.includes(asStr(before.status));
}

/** bookings.costActual → one total (food + labour + transport + rentals + other). */
export function actualTotal(costActual: unknown): number | null {
  if (!costActual || typeof costActual !== "object") return null;
  const k = asObj(costActual);
  return round2(asNum(k.food) + asNum(k.labour) + asNum(k.transport) + asNum(k.rentals) + asNum(k.other));
}

export interface CostRow {
  total: number | null;
  perPlate: number | null;
}

export interface CostCompare {
  guests: number;
  standard: CostRow;
  estimated: CostRow;
  actual: CostRow;
  /** estimated − standard, and actual − estimated (₹ and % of the first); null when either side is missing */
  estVsStd: { amount: number; pct: number | null } | null;
  actVsEst: { amount: number; pct: number | null } | null;
  /** over = costs more than the earlier figure by more than 5 %; under = less by more than 5 %; ok = within 5 % */
  estVsStdFlag: "over" | "under" | "ok" | null;
  actVsEstFlag: "over" | "under" | "ok" | null;
}

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : { amount: round2(a - b), pct: b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null });
const flag = (d: { amount: number; pct: number | null } | null) => (d === null || d.pct === null ? null : d.pct > 5 ? "over" : d.pct < -5 ? "under" : "ok");

/** The three costs of one event side by side. `standardPerPlate` is the menu's standard at the time of the estimate. */
export function costCompare(p: { guests: number; standardPerPlate: number | null; estimatedTotal: number | null; actualTotal: number | null }): CostCompare {
  const g = p.guests > 0 ? p.guests : 0;
  const per = (t: number | null) => (t === null || !g ? null : round2(t / g));
  const stdTotal = p.standardPerPlate !== null && p.standardPerPlate > 0 && g ? round2(p.standardPerPlate * g) : null;
  const standard = { total: stdTotal, perPlate: stdTotal === null ? null : round2(p.standardPerPlate as number) };
  const estimated = { total: p.estimatedTotal, perPlate: per(p.estimatedTotal) };
  const actual = { total: p.actualTotal, perPlate: per(p.actualTotal) };
  const estVsStd = diff(estimated.total, standard.total);
  const actVsEst = diff(actual.total, estimated.total);
  return { guests: g, standard, estimated, actual, estVsStd, actVsEst, estVsStdFlag: flag(estVsStd), actVsEstFlag: flag(actVsEst) };
}

/** Version id of the next estimate: 0001, 0002 … */
export function nextEstimateId(currentVersion: unknown): { version: number; id: string } {
  const v = (typeof currentVersion === "number" && Number.isInteger(currentVersion) && currentVersion > 0 ? currentVersion : 0) + 1;
  return { version: v, id: String(v).padStart(4, "0") };
}

/** X9: the menus of a quotation to cost: one per session, or the single menu. Plates to cook, not plates billed. */
export function quotationParts(q: Doc | undefined): { packageId: string; plates: number }[] {
  if (!q) return [];
  const out: { packageId: string; plates: number }[] = [];
  const sessions = Array.isArray(q.sessionQuotes) ? q.sessionQuotes : [];
  for (const s of sessions) {
    const o = asObj(s);
    const plates = Math.round(asNum(o.platesToCook) || asNum(o.plates));
    if (asStr(o.menuPackageId) && plates >= 1) out.push({ packageId: asStr(o.menuPackageId), plates });
  }
  if (!out.length) {
    const plates = Math.round(asNum(q.platesToCook) || asNum(q.plates));
    if (asStr(q.menuPackageId) && plates >= 1) out.push({ packageId: asStr(q.menuPackageId), plates });
  }
  return out;
}

/** X9: text that changes exactly when the estimate of a quotation must be worked out again. */
export function quotationCostKey(q: Doc | undefined): string {
  return JSON.stringify(quotationParts(q).map((p) => [p.packageId, p.plates]));
}

/** X9: several part figures → one (totals add up; complete only when every part is). */
export function sumFigures(parts: CostFigure[]): CostFigure {
  const guests = parts.reduce((s, p) => s + p.guests, 0);
  const food = round2(parts.reduce((s, p) => s + p.food, 0));
  const labour = round2(parts.reduce((s, p) => s + p.labour, 0));
  const overhead = round2(parts.reduce((s, p) => s + p.overhead, 0));
  const total = round2(food + labour + overhead);
  const known = parts.filter((p) => p.coveragePct !== null);
  return { guests, food, labour, overhead, total, perPlate: guests ? round2(total / guests) : 0, coveragePct: known.length ? Math.round((known.reduce((s, p) => s + (p.coveragePct as number) * p.guests, 0) / Math.max(1, known.reduce((s, p) => s + p.guests, 0))) * 10) / 10 : null, complete: parts.length > 0 && parts.every((p) => p.complete) };
}
