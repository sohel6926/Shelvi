/**
 * Pending item X10 (18 Nov 2026) — follow-up reminders at the time the person chose. Pure.
 * A lead has followUpDate (YYYY-MM-DD) and an optional followUpTime (HH:MM, IST). When that moment arrives the
 * person who has the lead is told once. Without a time, the reminder goes at 09:00 on that day.
 */
export const DEFAULT_REMINDER_TIME = "09:00";
const OPEN = ["new", "assigned", "contacted", "requirement", "tasting", "qualified", "quoted"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "2026-11-20 16:30" — the moment a lead should be followed up; "" when no date is set. */
export function reminderKey(followUpDate: unknown, followUpTime: unknown): string {
  if (typeof followUpDate !== "string" || !DAY.test(followUpDate)) return "";
  return `${followUpDate} ${typeof followUpTime === "string" && TIME.test(followUpTime) ? followUpTime : DEFAULT_REMINDER_TIME}`;
}

/**
 * Remind now? The lead is open, its moment has come (today only — an old missed date is not announced days later),
 * and this exact moment was not announced before (`sentFor`). Moving the date or time makes a new moment.
 */
export function reminderDue(lead: { status: string; cancelled: boolean; followUpDate: unknown; followUpTime: unknown; sentFor: unknown }, today: string, nowTime: string): boolean {
  if (lead.cancelled || !OPEN.includes(lead.status)) return false;
  const key = reminderKey(lead.followUpDate, lead.followUpTime);
  if (!key || key === lead.sentFor) return false;
  const [day, time] = key.split(" ");
  return day === today && time <= nowTime;
}
