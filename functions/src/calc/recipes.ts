/**
 * Spec §13 — learning recipes from the owner's own events (Round 8). Pure.
 * §13.1 dish quantity per 100 guests, §13.2 ingredient ratios, §13.5 menu combination and service style.
 */
import { CalcError, ceilTol, requireFinite, requireNonNeg, round2 } from "./util";

export type SizeBand = "S" | "M" | "L" | "XL";
export const SIZE_BANDS: SizeBand[] = ["S", "M", "L", "XL"];
export type ServiceStyle = "banthi" | "buffet" | "other";
export const SERVICE_STYLES: ServiceStyle[] = ["banthi", "buffet", "other"];
export type DishRole = "rice" | "flavoured-rice" | "bread" | "tiffin-main" | "side" | "sweet" | "starter" | "drink" | "other";
export const DISH_ROLES: DishRole[] = ["rice", "flavoured-rice", "bread", "tiffin-main", "side", "sweet", "starter", "drink", "other"];
export const DISH_CATEGORIES = ["rice", "curry", "dal", "liquid", "fry", "sweet", "chutney-pickle", "roti-bread", "snack", "drink", "tiffin", "other"] as const;
export type DishCategory = (typeof DISH_CATEGORIES)[number];

/** S ≤ 150, M 151–400, L 401–800, XL > 800 guests. */
export function sizeBand(guests: number): SizeBand {
  if (!Number.isInteger(guests) || guests < 1) throw new CalcError("guests must be a whole number ≥ 1");
  return guests <= 150 ? "S" : guests <= 400 ? "M" : guests <= 800 ? "L" : "XL";
}

/** eaten per 100 guests for one event: (cooked − leftover) / guests × 100. */
export function eatenPer100(e: { guests: number; cooked: number; leftover: number }): number {
  if (!Number.isInteger(e.guests) || e.guests < 1) throw new CalcError("guests must be a whole number ≥ 1");
  requireFinite("cooked", e.cooked);
  if (e.cooked <= 0) throw new CalcError("cooked must be greater than 0");
  requireNonNeg("leftover", e.leftover);
  if (e.leftover > e.cooked) throw new CalcError("leftover cannot be more than cooked");
  return ((e.cooked - e.leftover) / e.guests) * 100;
}

/** Piece dishes: piecesPerPlate × 100 per 100 guests (no learning needed). */
export function piecePer100(piecesPerPlate: number): number {
  if (!(piecesPerPlate > 0) || !Number.isFinite(piecesPerPlate)) throw new CalcError("piecesPerPlate must be greater than 0");
  return piecesPerPlate * 100;
}

/** learning (1–4 events) / learned (≥ 5) — "నేర్చుకుంటోంది n/5" / "నేర్చుకున్నది ✓". */
export function learnStatus(events: number): { status: "none" | "learning" | "learned"; te: string; en: string } {
  if (events <= 0) return { status: "none", te: "ఇంకా నేర్చుకోలేదు", en: "Not learned yet" };
  if (events < 5) return { status: "learning", te: `నేర్చుకుంటోంది ${events}/5`, en: `Learning ${events}/5` };
  return { status: "learned", te: "నేర్చుకున్నది ✓", en: "Learned ✓" };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * §13.1 size bands (shown as learned.byBand): band with ≥ 2 events → its mean; else overall × the ratio of the nearest
 * band that has ≥ 2 events (ties → the smaller band); else overall. null when there are no events.
 */
export function bandPer100(events: { eaten: number; band: SizeBand }[], target: SizeBand): number | null {
  if (!events.length) return null;
  const overall = mean(events.map((e) => e.eaten));
  const byBand = (b: SizeBand) => events.filter((e) => e.band === b).map((e) => e.eaten);
  if (byBand(target).length >= 2) return mean(byBand(target));
  const ti = SIZE_BANDS.indexOf(target);
  const candidates = SIZE_BANDS.filter((b) => b !== target && byBand(b).length >= 2).sort((a, b) => Math.abs(SIZE_BANDS.indexOf(a) - ti) - Math.abs(SIZE_BANDS.indexOf(b) - ti) || SIZE_BANDS.indexOf(a) - SIZE_BANDS.indexOf(b));
  if (!candidates.length || overall === 0) return overall;
  return overall * (mean(byBand(candidates[0])) / overall);
}

/** Default dish role from its category (owner can change; biryani / pulao need role flavoured-rice). */
export function roleOfCategory(category: string): DishRole {
  switch (category) {
    case "rice": return "rice";
    case "roti-bread": return "bread";
    case "tiffin": return "tiffin-main";
    case "curry": case "dal": case "liquid": case "fry": case "chutney-pickle": return "side";
    case "sweet": return "sweet";
    case "snack": return "starter";
    case "drink": return "drink";
    default: return "other";
  }
}

const MAIN_ROLES: DishRole[] = ["bread", "flavoured-rice", "rice", "tiffin-main"];

/** §13.5 comboKey: sorted main roles on the menu, "×n" when a role appears more than once. "" when none. */
export function comboKey(roles: string[]): string {
  const counts = new Map<string, number>();
  for (const r of roles) if ((MAIN_ROLES as string[]).includes(r)) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.keys()].sort().map((r) => (counts.get(r) as number) > 1 ? `${r}×${counts.get(r)}` : r).join("+");
}

/** Default service style from the event type (owner can change on the booking / session). */
export function defaultServiceStyle(eventType: string): ServiceStyle {
  return eventType === "office" || eventType === "other" ? "buffet" : "banthi";
}

export interface LoggedEvent {
  eaten: number;
  band: SizeBand;
  style: string;
  comboKey: string;
}

export interface StartRule {
  style?: string;
  comboKey?: string;
  band?: string;
  per100?: number;
  factorPct?: number;
}

export interface Why {
  te: string;
  en: string;
}

export interface Per100Result {
  per100: number | null;
  source: "piece" | "cell" | "factors" | "typed" | "none";
  matchedEvents: number;
  factors: { band: number; style: number; combo: number };
  why: Why[];
}

const clampF = (f: number) => Math.min(1.5, Math.max(0.5, f));
const pct = (f: number) => `${f >= 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}%`;
const STYLE_TE: Record<string, string> = { banthi: "బంతి భోజనం", buffet: "బఫే", other: "ఇతర" };
const BAND_TE: Record<string, string> = { S: "చిన్న event (≤150)", M: "మధ్య event (151–400)", L: "పెద్ద event (401–800)", XL: "చాలా పెద్ద event (800+)" };

/**
 * §13.5 per-100 for a planned dish. `events` = newest 10 events of the dish (+variant), already filtered.
 * 1 exact cell (band + style + comboKey ≥ 2 events) → mean; 2 factor model overall × f_band × f_style × f_combo
 * (group ≥ 2 events → group mean / overall; else the owner's typed starting factor; else 1; each clamped 0.5–1.5);
 * 3 no events → typed per100 (style+combo, combo, style), else basePer100, else none. Piece dishes: piecesPerPlate × 100.
 */
export function per100ForPlan(input: {
  events: LoggedEvent[];
  target: { band: SizeBand; style: string; comboKey: string };
  startRules?: StartRule[];
  basePer100?: number | null;
  piecesPerPlate?: number | null;
}): Per100Result {
  const ones = { band: 1, style: 1, combo: 1 };
  const { events, target } = input;
  const rules = input.startRules ?? [];
  const exactCell = events.filter((e) => e.band === target.band && e.style === target.style && e.comboKey === target.comboKey);
  if (input.piecesPerPlate && input.piecesPerPlate > 0) {
    return { per100: piecePer100(input.piecesPerPlate), source: "piece", matchedEvents: exactCell.length, factors: ones, why: [{ te: `ఒక్కొక్కరికి ${input.piecesPerPlate} చొప్పున`, en: `${input.piecesPerPlate} per plate` }] };
  }
  if (events.length) {
    if (exactCell.length >= 2) {
      return { per100: mean(exactCell.map((e) => e.eaten)), source: "cell", matchedEvents: exactCell.length, factors: ones, why: [{ te: `ఇదే రకం events: ${exactCell.length}`, en: `Same kind of event: ${exactCell.length}` }] };
    }
    const overall = mean(events.map((e) => e.eaten));
    const why: Why[] = [{ te: `సగటు (${events.length} events)`, en: `Average of ${events.length} events` }];
    const factor = (dim: "band" | "style" | "comboKey", value: string, label: Why): number => {
      const group = events.filter((e) => e[dim] === value);
      if (group.length >= 2 && overall > 0) {
        const f = clampF(mean(group.map((e) => e.eaten)) / overall);
        if (f !== 1) why.push({ te: `${label.te}: ${pct(f)} (${group.length} events)`, en: `${label.en}: ${pct(f)} (${group.length} events)` });
        return f;
      }
      const ruleKey = dim === "comboKey" ? "comboKey" : dim;
      const typed = rules.find((r) => typeof r.factorPct === "number" && r[ruleKey] === value && Object.keys(r).filter((k) => ["style", "comboKey", "band"].includes(k) && r[k as keyof StartRule] !== undefined).length === 1);
      if (typed) {
        const f = clampF(1 + (typed.factorPct as number) / 100);
        if (f !== 1) why.push({ te: `${label.te}: ${pct(f)} (మీరు ఇచ్చిన నియమం)`, en: `${label.en}: ${pct(f)} (your starting rule)` });
        return f;
      }
      return 1;
    };
    const fb = factor("band", target.band, { te: BAND_TE[target.band] ?? target.band, en: `Size ${target.band}` });
    const fs = factor("style", target.style, { te: STYLE_TE[target.style] ?? target.style, en: target.style });
    const fc = factor("comboKey", target.comboKey, { te: `మెనూ కలయిక ${target.comboKey || "-"}`, en: `Menu combination ${target.comboKey || "-"}` });
    return { per100: overall * fb * fs * fc, source: "factors", matchedEvents: exactCell.length, factors: { band: fb, style: fs, combo: fc }, why };
  }
  const bandOk = (r: StartRule) => r.band === undefined || r.band === target.band;
  const withPer100 = rules.filter((r) => typeof r.per100 === "number" && (r.per100 as number) > 0 && bandOk(r));
  const pick =
    withPer100.find((r) => r.style === target.style && r.comboKey === target.comboKey) ??
    withPer100.find((r) => r.style === undefined && r.comboKey === target.comboKey) ??
    withPer100.find((r) => r.style === target.style && r.comboKey === undefined);
  if (pick) return { per100: pick.per100 as number, source: "typed", matchedEvents: 0, factors: ones, why: [{ te: "మీరు ఇచ్చిన మొదటి నియమం", en: "Your starting rule" }] };
  if (typeof input.basePer100 === "number" && input.basePer100 > 0) return { per100: input.basePer100, source: "typed", matchedEvents: 0, factors: ones, why: [{ te: "మీరు ఇచ్చిన మొదటి అంచనా", en: "Your starting guess" }] };
  return { per100: null, source: "none", matchedEvents: 0, factors: ones, why: [{ te: "ఇంకా నేర్చుకోలేదు", en: "Not learned yet" }] };
}

/**
 * §13.2 ingredients per unit of dish: Σ used / Σ cooked over the newest 10 events (weighted by quantity). With n < 3
 * events and a typed recipe: (Σ used + (3 − n)·typed·avgCooked) / (Σ cooked + (3 − n)·avgCooked); n = 0 → typed.
 */
export function ingredientRatios(events: { cooked: number; ingredients: Record<string, number> }[], typed: Record<string, number> = {}): Record<string, { perUnit: number; eventsUsed: number }> {
  events.forEach((e, i) => {
    requireFinite(`events[${i}].cooked`, e.cooked);
    if (e.cooked <= 0) throw new CalcError(`events[${i}].cooked must be greater than 0`);
    for (const [k, v] of Object.entries(e.ingredients)) requireNonNeg(`events[${i}].${k}`, v);
  });
  for (const [k, v] of Object.entries(typed)) requireNonNeg(`typed.${k}`, v);
  const n = events.length;
  const sumCooked = events.reduce((a, e) => a + e.cooked, 0);
  const avg = n ? sumCooked / n : 0;
  const ids = new Set([...events.flatMap((e) => Object.keys(e.ingredients)), ...Object.keys(typed)]);
  const out: Record<string, { perUnit: number; eventsUsed: number }> = {};
  for (const id of ids) {
    const used = events.reduce((a, e) => a + (e.ingredients[id] ?? 0), 0);
    let perUnit: number;
    if (n === 0) perUnit = typed[id] ?? 0;
    else if (n < 3 && typed[id] !== undefined) perUnit = (used + (3 - n) * typed[id] * avg) / (sumCooked + (3 - n) * avg);
    else perUnit = used / sumCooked;
    out[id] = { perUnit, eventsUsed: n };
  }
  return out;
}

/** Round a needed quantity up: kg / L to 0.1, pcs to whole. */
export function roundUpQty(q: number, unit: string): number {
  requireNonNeg("quantity", q);
  if (unit === "pcs") return ceilTol(q);
  if (unit === "kg" || unit === "L") return ceilTol(q * 10) / 10;
  throw new CalcError(`unknown unit ${unit}`);
}

/**
 * One batch cooked for several events: cooked, leftover and every ingredient are split in proportion to guests
 * (2 decimals); the rounding remainder goes to the event with the most guests so Σ shares = batch exactly.
 */
export function splitShared<K extends string>(batch: { cooked: number; leftover: number; ingredients: Record<string, number> }, parts: { key: K; guests: number }[]): Record<K, { cooked: number; leftover: number; ingredients: Record<string, number> }> {
  if (!parts.length) throw new CalcError("at least one event is needed");
  parts.forEach((p, i) => {
    if (!Number.isInteger(p.guests) || p.guests < 1) throw new CalcError(`parts[${i}].guests must be a whole number ≥ 1`);
  });
  if (new Set(parts.map((p) => p.key)).size !== parts.length) throw new CalcError("the same event is listed twice");
  requireFinite("cooked", batch.cooked);
  if (batch.cooked <= 0) throw new CalcError("cooked must be greater than 0");
  requireNonNeg("leftover", batch.leftover);
  if (batch.leftover > batch.cooked) throw new CalcError("leftover cannot be more than cooked");
  for (const [k, v] of Object.entries(batch.ingredients)) requireNonNeg(`ingredients.${k}`, v);
  const total = parts.reduce((a, p) => a + p.guests, 0);
  const largest = parts.reduce((best, p, i) => (p.guests > parts[best].guests ? i : best), 0);
  const split = (x: number): number[] => {
    const shares = parts.map((p) => round2((x * p.guests) / total));
    shares[largest] = round2(shares[largest] + round2(x - shares.reduce((a, b) => a + b, 0)));
    return shares;
  };
  const cooked = split(batch.cooked);
  const leftover = split(batch.leftover);
  const ing = Object.fromEntries(Object.entries(batch.ingredients).map(([k, v]) => [k, split(v)]));
  const out = {} as Record<K, { cooked: number; leftover: number; ingredients: Record<string, number> }>;
  parts.forEach((p, i) => {
    out[p.key] = { cooked: cooked[i], leftover: Math.min(leftover[i], cooked[i]), ingredients: Object.fromEntries(Object.entries(ing).map(([k, v]) => [k, v[i]])) };
  });
  return out;
}

/** Pieces per plate from a menu option name such as "ఇడ్లీ – 3" / "Pulka - 2" (null when there is no trailing count). */
export function piecesFromName(name: string): number | null {
  const m = /[–—-]\s*(\d{1,2})\s*$/.exec(name.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}
