/** Spec §12 — service timeline for an event day. Pure; every step carries its own day and time. */
import { CalcError } from "./util";

export type MealType = "tiffin" | "lunch" | "dinner" | "lunch-dinner" | "other";
export const MEAL_TYPES: MealType[] = ["tiffin", "lunch", "dinner", "lunch-dinner", "other"];
export type TimelineRole = "manager" | "cook" | "helper" | "driver" | "all";

export interface TimelineMinutes {
  cookBase: Record<MealType, number>;
  serveSpan: Record<MealType, number>;
  setup: number;
  load: number;
  prep: number;
  cleanup: number;
  /** cookExtra = min(cookExtraMax, cookExtraStep × ceil(max(0, guests − 250) / 250)) */
  cookExtraStep: number;
  cookExtraMax: number;
}

export const TIMELINE_DEFAULTS: TimelineMinutes = {
  cookBase: { tiffin: 90, lunch: 150, dinner: 150, "lunch-dinner": 150, other: 150 },
  serveSpan: { tiffin: 60, lunch: 90, dinner: 90, "lunch-dinner": 90, other: 90 },
  setup: 45,
  load: 20,
  prep: 60,
  cleanup: 60,
  cookExtraStep: 30,
  cookExtraMax: 120,
};

const SCALAR_KEYS = ["setup", "load", "prep", "cleanup", "cookExtraStep", "cookExtraMax"] as const;
const MEAL_KEYS = ["cookBase", "serveSpan"] as const;

function minutesOk(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 600;
}

/**
 * settings.timelineDefaults → full minutes. Keys as in §12; cookBase / serveSpan may be one number (all meals)
 * or { <mealType>: minutes }. Whole minutes 0–600. Throws CalcError for anything else.
 */
export function timelineMinutes(overrides?: unknown): TimelineMinutes {
  const out: TimelineMinutes = { ...TIMELINE_DEFAULTS, cookBase: { ...TIMELINE_DEFAULTS.cookBase }, serveSpan: { ...TIMELINE_DEFAULTS.serveSpan } };
  if (overrides === undefined || overrides === null) return out;
  if (typeof overrides !== "object" || Array.isArray(overrides)) throw new CalcError("timelineDefaults must be an object");
  for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
    if ((SCALAR_KEYS as readonly string[]).includes(k)) {
      if (!minutesOk(v)) throw new CalcError(`timelineDefaults.${k} must be whole minutes 0–600`);
      out[k as (typeof SCALAR_KEYS)[number]] = v;
    } else if ((MEAL_KEYS as readonly string[]).includes(k)) {
      const target = out[k as (typeof MEAL_KEYS)[number]];
      if (minutesOk(v)) MEAL_TYPES.forEach((m) => (target[m] = v));
      else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
          if (!MEAL_TYPES.includes(mk as MealType) || !minutesOk(mv)) throw new CalcError(`timelineDefaults.${k}.${mk} must be a meal type with whole minutes 0–600`);
          target[mk as MealType] = mv;
        }
      } else throw new CalcError(`timelineDefaults.${k} must be minutes or { mealType: minutes }`);
    } else throw new CalcError(`timelineDefaults.${k} is not a known key`);
  }
  return out;
}

export interface TimelineInput {
  eventDay: string;
  serveTime: string;
  guests: number;
  mealType: MealType;
  travelMinutes: number;
}

export interface TimelineStep {
  key: string;
  day: string;
  time: string;
  te: string;
  en: string;
  role: TimelineRole;
}

function isRealDay(s: string): boolean {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseHHMM(s: string): number | null {
  const m = typeof s === "string" ? /^(\d{2}):(\d{2})$/.exec(s) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
}

/** minutes from eventDay 00:00 (may be negative or ≥ 1440) → { day, time } */
function at(eventDay: string, minutes: number): { day: string; time: string } {
  const [y, m, d] = eventDay.split("-").map(Number);
  const dayOffset = Math.floor(minutes / 1440);
  const rest = minutes - dayOffset * 1440;
  const dt = new Date(Date.UTC(y, m - 1, d + dayOffset));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return { day: `${p(dt.getUTCFullYear(), 4)}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`, time: `${p(Math.floor(rest / 60))}:${p(rest % 60)}` };
}

export function cookExtraMinutes(guests: number, mins: TimelineMinutes = TIMELINE_DEFAULTS): number {
  return Math.min(mins.cookExtraMax, mins.cookExtraStep * Math.ceil(Math.max(0, guests - 250) / 250));
}

/** Spec §12. */
export function serviceTimeline(input: TimelineInput, overrides?: unknown): TimelineStep[] {
  const { eventDay, serveTime, guests, mealType, travelMinutes } = input;
  if (!isRealDay(eventDay)) throw new CalcError("eventDay must be a real date YYYY-MM-DD");
  const serve = parseHHMM(serveTime);
  if (serve === null) throw new CalcError("serveTime must be HH:MM between 00:00 and 23:59");
  if (!Number.isInteger(guests) || guests < 1) throw new CalcError("guests must be a whole number ≥ 1");
  if (!MEAL_TYPES.includes(mealType)) throw new CalcError(`mealType must be one of ${MEAL_TYPES.join(", ")}`);
  if (!Number.isInteger(travelMinutes) || travelMinutes < 0 || travelMinutes > 300) throw new CalcError("travelMinutes must be a whole number 0–300");
  const mins = timelineMinutes(overrides);
  const cook = mins.cookBase[mealType] + cookExtraMinutes(guests, mins);
  const setupAt = serve - mins.setup;
  const leaveAt = setupAt - travelMinutes;
  const loadAt = leaveAt - mins.load;
  const cookAt = loadAt - cook;
  const prepAt = cookAt - mins.prep;
  const serveEnd = serve + mins.serveSpan[mealType];
  const raw: [string, number, string, string, TimelineRole][] = [
    ["groceryCheck", -6 * 60, "సరుకులు, కూరగాయలు సరిచూసుకోవడం; తక్కువ ఉన్నవి కొనడం", "Check groceries and vegetables; buy what is short", "manager"],
    ["vesselsReady", -5 * 60, "పాత్రలు, gas, బండి సిద్ధం", "Vessels, gas and vehicle ready", "manager"],
    ["prep", prepAt, "కూరగాయలు కోయడం, నానబెట్టడం", "Cutting and soaking (prep)", "cook"],
    ["cookStart", cookAt, "వంట మొదలు", "Start cooking", "cook"],
    ["load", loadAt, "packing, బండిలో ఎక్కించడం", "Pack and load the vehicle", "helper"],
    ["leave", leaveAt, "Venue కి బయలుదేరడం", "Leave for the venue", "driver"],
    ["setup", setupAt, "Counter, plates set-up", "Counter and plates set-up", "helper"],
    ["serveStart", serve, "వడ్డన మొదలు", "Serving starts", "all"],
    ["serveEnd", serveEnd, "వడ్డన ముగింపు", "Serving ends", "all"],
    ["cleanup", serveEnd, "శుభ్రం, పాత్రలు తిరిగి లెక్కపెట్టడం", "Clean up; count the vessels back", "helper"],
    ["leftoverEntry", serveEnd + mins.cleanup, "మిగిలిన భోజనం CRM లో నమోదు", "Enter leftovers in the CRM", "manager"],
  ];
  return raw
    .map(([key, minutes, te, en, role], i) => ({ i, minutes, step: { key, ...at(eventDay, minutes), te, en, role } }))
    .sort((a, b) => a.minutes - b.minutes || a.i - b.i)
    .map((x) => x.step);
}

/** Default serve time (contract C): start of the package deliveryWindow, else by meal. */
export function defaultServeTime(deliveryWindow: unknown, mealType: unknown): string {
  if (typeof deliveryWindow === "string") {
    const m = /^(\d{2}:\d{2})/.exec(deliveryWindow.trim());
    if (m && parseHHMM(m[1]) !== null) return m[1];
  }
  return mealType === "tiffin" ? "08:00" : mealType === "dinner" ? "19:30" : "12:00";
}
