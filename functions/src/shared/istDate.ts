/**
 * India-time (IST, UTC+05:30, no DST) date helpers. A business day is the string YYYY-MM-DD.
 * Day/month boundaries reuse calc/periods (spec §9) so reports and stats agree on "which day".
 */
import { periodRange } from "../calc/periods";

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** IST calendar day of an instant. */
export function istDay(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  return `${pad(ist.getUTCFullYear(), 4)}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

export function todayIST(now: Date = new Date()): string {
  return istDay(now);
}

/** "HH:MM" in IST. */
export function istTime(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

export function isValidDay(s: string): boolean {
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidMonth(s: string): boolean {
  const m = MONTH_RE.exec(s);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** 12:00 IST on that day — a safe instant that is inside the day whatever the reader's timezone rounding. */
export function istNoon(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12) - IST_OFFSET_MS);
}

/** [start, end) instants of an IST day. */
export function dayRange(day: string): { start: Date; end: Date } {
  return periodRange(istNoon(day), "day");
}

/** [start, end) instants of an IST month "YYYY-MM". */
export function monthRange(month: string): { start: Date; end: Date } {
  return periodRange(istNoon(`${month}-01`), "month");
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** IST days d with start ≤ d < end (start/end being IST-midnight instants, e.g. from periodRange). */
export function daysBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  let day = istDay(start);
  const last = istDay(new Date(end.getTime() - 1));
  while (day <= last) {
    out.push(day);
    day = addDays(day, 1);
  }
  return out;
}

export function monthsBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  let month = istDay(start).slice(0, 7);
  const last = istDay(new Date(end.getTime() - 1)).slice(0, 7);
  while (month <= last) {
    out.push(month);
    month = addMonths(month, 1);
  }
  return out;
}

/** DD-MM-YYYY, the way dates are written on Telugu bills and messages. */
export function formatDayTe(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Reads a stored date of any shape: Firestore Timestamp (has toDate), Date, millis, ISO string,
 * or a business-day string YYYY-MM-DD (taken as noon IST). Returns null if unreadable.
 */
export function toDateValue(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  if (typeof v === "string") {
    if (isValidDay(v)) return istNoon(v);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** IST business day of a stored date value, or null. */
export function dayOfValue(v: unknown): string | null {
  if (typeof v === "string" && isValidDay(v)) return v;
  const d = toDateValue(v);
  return d ? istDay(d) : null;
}

/** The instant of an IST day at "HH:MM" (noon when the time is missing or invalid). */
export function istAt(day: string, hhmm?: string): Date {
  const m = typeof hhmm === "string" ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm) : null;
  if (!m) return istNoon(day);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, Number(m[1]), Number(m[2])) - IST_OFFSET_MS);
}
