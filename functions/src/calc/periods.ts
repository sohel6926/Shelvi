import { CalcError } from "./util";

export type Period = "day" | "week" | "month" | "3m" | "6m" | "12m";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** UTC instant of 00:00 IST on the given IST calendar date (month may overflow; Date.UTC normalises). */
function istMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);
}

/** Spec §9. Returns [start, end) for India-time boundaries. */
export function periodRange(now: Date, period: Period): { start: Date; end: Date } {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new CalcError("invalid date");
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  switch (period) {
    case "day":
      return { start: istMidnight(y, m, d), end: istMidnight(y, m, d + 1) };
    case "week": {
      const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
      return { start: istMidnight(y, m, d - dow), end: istMidnight(y, m, d - dow + 7) };
    }
    case "month":
      return { start: istMidnight(y, m, 1), end: istMidnight(y, m + 1, 1) };
    case "3m":
    case "6m":
    case "12m": {
      const back = { "3m": 2, "6m": 5, "12m": 11 }[period];
      return { start: istMidnight(y, m - back, 1), end: istMidnight(y, m + 1, 1) };
    }
    default:
      throw new CalcError(`unknown period ${period as string}`);
  }
}
