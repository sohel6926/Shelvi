import { CalcError, ceilTol, requireFinite, requireNonNeg, requirePositive, roundHalfAway } from "./util";

export type Unit = "kg" | "L" | "pcs";
export type EventType = "wedding" | "annadanam" | "housewarming" | "office" | "other";

export const EVENT_FACTORS: Record<EventType, number> = {
  wedding: 1.0,
  annadanam: 1.2,
  housewarming: 0.95,
  office: 0.9,
  other: 1.0,
};

export interface PastEvent {
  guests: number;
  cooked: number;
  leftover: number;
}

export interface Learned {
  learnedPer100: number;
  leftoverPct: number | null;
  changePct: number;
  advice: "cut" | "add" | "ok";
  eventsUsed: number;
}

const HISTORY_WINDOW = 5;
const TRUST_FROM = 3;

/** Spec §5. history oldest → newest. */
export function learn(basePer100: number, history: PastEvent[]): Learned {
  requirePositive("basePer100", basePer100);
  history.forEach((h, i) => {
    requirePositive(`history[${i}].guests`, h.guests);
    requirePositive(`history[${i}].cooked`, h.cooked);
    requireFinite(`history[${i}].leftover`, h.leftover);
    if (h.leftover < 0 || h.leftover > h.cooked) throw new CalcError(`history[${i}]: leftover must be between 0 and cooked`);
  });
  const recent = history.slice(-HISTORY_WINDOW);
  const n = recent.length;
  const eaten = recent.map((h) => ((h.cooked - h.leftover) / h.guests) * 100);
  const pad = Math.max(0, TRUST_FROM - n);
  const learnedPer100 = (eaten.reduce((a, b) => a + b, 0) + pad * basePer100) / (n + pad);
  const leftoverPct = n === 0 ? null : (recent.reduce((a, h) => a + h.leftover / h.cooked, 0) / n) * 100;
  const changePct = roundHalfAway(((learnedPer100 - basePer100) / basePer100) * 100);
  const advice = changePct < -5 ? "cut" : changePct > 5 ? "add" : "ok";
  return { learnedPer100, leftoverPct, changePct, advice, eventsUsed: n };
}

export function factorFor(eventType: EventType): number {
  const f = EVENT_FACTORS[eventType];
  if (f === undefined) throw new CalcError(`unknown event type ${eventType}`);
  return f;
}

/** Quantity to cook, rounded up (kg/L to 0.5, pcs to whole). */
export function suggest(per100: number, unit: Unit, eventType: EventType, guests: number, buffer = 0.05): number {
  requireNonNeg("per100", per100);
  requirePositive("guests", guests);
  requireFinite("buffer", buffer);
  if (buffer < 0) throw new CalcError("buffer must not be negative");
  const raw = (per100 * factorFor(eventType) * guests * (1 + buffer)) / 100;
  if (raw === 0) return 0;
  if (unit === "pcs") return ceilTol(raw);
  if (unit === "kg" || unit === "L") return ceilTol(raw * 2) / 2;
  throw new CalcError(`unknown unit ${unit}`);
}

export interface GroceryItem {
  name: string;
  per100: number;
  unit: Unit;
}

/** Spec §6. */
export function groceryFor(items: GroceryItem[], eventType: EventType, guests: number): { name: string; unit: Unit; quantity: number }[] {
  return items.map((it) => ({ name: it.name, unit: it.unit, quantity: suggest(it.per100, it.unit, eventType, guests) }));
}
