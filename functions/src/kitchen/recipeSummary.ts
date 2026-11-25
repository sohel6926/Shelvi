/** Pure: summarise a dish's logged events into dishes.learned / dishes.recipe (§13). */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { bandPer100, eatenPer100, ingredientRatios, learnStatus, LoggedEvent, SIZE_BANDS, SizeBand } from "../calc/recipes";
import { roundHalfAway } from "../calc/util";

export interface HistoryLine {
  variantId: string;
  guests: number;
  cooked: number;
  leftover: number;
  band: SizeBand;
  serviceStyle: string;
  comboKey: string;
  ingredients: Record<string, number>;
  eventAtMs: number;
}

export function readHistoryLine(d: Doc, eventAtMs: number): HistoryLine | null {
  const guests = asNum(d.guests);
  const cooked = asNum(d.cooked);
  const leftover = asNum(d.leftover);
  if (!Number.isInteger(guests) || guests < 1 || !(cooked > 0) || leftover < 0 || leftover > cooked) return null;
  const band = (SIZE_BANDS as string[]).includes(asStr(d.band)) ? (asStr(d.band) as SizeBand) : guests <= 150 ? "S" : guests <= 400 ? "M" : guests <= 800 ? "L" : "XL";
  const ing: Record<string, number> = {};
  for (const [k, v] of Object.entries(asObj(d.ingredients))) if (typeof v === "number" && v >= 0) ing[k] = v;
  return { variantId: asStr(d.variantId), guests, cooked, leftover, band, serviceStyle: asStr(d.serviceStyle, "other"), comboKey: asStr(d.comboKey), ingredients: ing, eventAtMs };
}

export const cellKey = (band: string, style: string, combo: string) => `${band}|${style}|${combo}`;

/** Newest 10 lines as §13.5 logged events. */
export function loggedEvents(lines: HistoryLine[]): LoggedEvent[] {
  return newest10(lines).map((l) => ({ eaten: eatenPer100(l), band: l.band, style: l.serviceStyle, comboKey: l.comboKey }));
}

export function newest10(lines: HistoryLine[]): HistoryLine[] {
  return [...lines].sort((a, b) => b.eventAtMs - a.eventAtMs).slice(0, 10);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clampF = (f: number) => Math.min(1.5, Math.max(0.5, f));

/** dishes.learned for one dish (+variant): status, per100, byBand, byCell, factors (groups with ≥ 2 events). */
export function learnedSummary(lines: HistoryLine[], basePer100: number | null): Doc {
  const ev = loggedEvents(lines);
  const st = learnStatus(lines.length);
  const overall = ev.length ? mean(ev.map((e) => e.eaten)) : null;
  const per100 = overall ?? (basePer100 && basePer100 > 0 ? basePer100 : null);
  const recent = newest10(lines);
  const byBand: Doc = {};
  for (const b of SIZE_BANDS) {
    const n = ev.filter((e) => e.band === b).length;
    byBand[b] = { per100: bandPer100(ev, b), events: n };
  }
  const byCell: Doc = {};
  for (const e of ev) {
    const k = cellKey(e.band, e.style, e.comboKey);
    const cur = asObj(byCell[k]);
    const n = asNum(cur.events) + 1;
    byCell[k] = { per100: (asNum(cur.per100) * (n - 1) + e.eaten) / n, events: n };
  }
  const factors: Doc = { band: {}, style: {}, combo: {} };
  if (overall && overall > 0) {
    for (const [dim, key] of [["band", "band"], ["style", "style"], ["combo", "comboKey"]] as const) {
      const groups = new Map<string, number[]>();
      for (const e of ev) groups.set(e[key], [...(groups.get(e[key]) ?? []), e.eaten]);
      for (const [g, xs] of groups) if (xs.length >= 2) (factors[dim] as Doc)[g] = clampF(mean(xs) / overall);
    }
  }
  const out: Doc = {
    per100,
    leftoverPct: recent.length ? (recent.reduce((a, l) => a + l.leftover / l.cooked, 0) / recent.length) * 100 : null,
    eventsUsed: lines.length,
    status: st.status,
    byBand,
    byCell,
    factors,
  };
  if (basePer100 && basePer100 > 0 && overall !== null) {
    const change = roundHalfAway(((overall - basePer100) / basePer100) * 100);
    out.changePct = change;
    out.advice = change < -5 ? "cut" : change > 5 ? "add" : "ok";
  } else {
    out.changePct = 0;
    out.advice = "ok";
  }
  return out;
}

/** typedRecipe as stored by the owner: [{ groceryItemId, perUnit }] or { groceryItemId: perUnit }. */
export function readTypedRecipe(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(v)) for (const x of v.map(asObj)) {
    if (asStr(x.groceryItemId) && typeof x.perUnit === "number" && x.perUnit >= 0) out[asStr(x.groceryItemId)] = x.perUnit;
  }
  else for (const [k, val] of Object.entries(asObj(v))) if (typeof val === "number" && val >= 0) out[k] = val;
  return out;
}

/** dishes.recipe for one dish (+variant): §13.2 ratios over the newest 10 events, blended with the typed recipe. */
export function recipeSummary(lines: HistoryLine[], typed: Record<string, number>): Doc {
  const r = ingredientRatios(newest10(lines).map((l) => ({ cooked: l.cooked, ingredients: l.ingredients })), typed);
  return { ingredients: Object.entries(r).map(([groceryItemId, x]) => ({ groceryItemId, perUnit: x.perUnit, eventsUsed: x.eventsUsed })), typed: Object.entries(typed).map(([groceryItemId, perUnit]) => ({ groceryItemId, perUnit })) };
}

/** Group lines by variant ("" = no variant). */
export function byVariant(lines: HistoryLine[]): Map<string, HistoryLine[]> {
  const m = new Map<string, HistoryLine[]>();
  for (const l of lines) m.set(l.variantId, [...(m.get(l.variantId) ?? []), l]);
  return m;
}

export function variantTypedRecipe(dish: Doc, variantId: string): Record<string, number> {
  if (!variantId) return readTypedRecipe(dish.typedRecipe);
  const v = asArr(dish.variants).map(asObj).find((x) => asStr(x.id) === variantId);
  const own = readTypedRecipe(v?.typedRecipe);
  return Object.keys(own).length ? own : readTypedRecipe(dish.typedRecipe);
}
