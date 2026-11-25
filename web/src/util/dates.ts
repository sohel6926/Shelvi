import { dateLocale } from "../i18n/LanguageContext";
/**
 * Business-day helpers in India time (Asia/Kolkata), as the contract requires:
 * dates are `YYYY-MM-DD`, months `YYYY-MM`, independent of the browser's timezone.
 */
const istDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-11-05" for the given moment in India time. */
export function istDay(moment: Date = new Date()): string {
  return istDate.format(moment);
}

/** "2026-11" for the given moment in India time. */
export function istMonth(moment: Date = new Date()): string {
  return istDay(moment).slice(0, 7);
}

export function istYear(moment: Date = new Date()): number {
  return Number(istDay(moment).slice(0, 4));
}

/** Adds whole calendar years to a YYYY-MM-DD string (29 Feb → 1 Mar in a non-leap year). */
export function addYears(day: string, years: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  return target.toISOString().slice(0, 10);
}

/** Readable form of a YYYY-MM-DD string, without timezone shifts. */
export function formatDay(day: string | null | undefined, lang: "te" | "en" = "en"): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return day || "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dateLocale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
