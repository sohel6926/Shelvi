/**
 * Service timeline helpers. The timeline itself (calc §12) is computed only on the server —
 * `getServiceTimeline` in data/functions.ts. This file keeps the shared types and the booking-form
 * default for the serving time (contract Round 6 C).
 */
export type TimelineMeal = "tiffin" | "lunch" | "dinner" | "lunch-dinner" | "other";
export type TimelineRole = "manager" | "cook" | "helper" | "driver" | "all";

export interface TimelineStep {
  key: string;
  /** YYYY-MM-DD */
  day: string;
  /** HH:MM */
  time: string;
  te: string;
  en: string;
  role: TimelineRole;
}

/** Default serve time: start of the package delivery window ("12:00-12:30" → "12:00"), else by meal. */
export function defaultServeTime(deliveryWindow: string | undefined, meal: TimelineMeal): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(deliveryWindow ?? "");
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return meal === "tiffin" ? "08:00" : meal === "dinner" ? "19:30" : "12:00";
}
