/** Pure: R7-5 meal sessions inside a booking. */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { dayOfValue, istAt, isValidDay, toDateValue } from "../shared/istDate";
import { sessionTotals } from "../calc/round7";

export interface Session {
  id: string;
  nameTe: string;
  nameEn: string;
  date: string;
  serveTime: string;
  mealType: string;
  packageId: string;
  guests: number;
  guestCountConfirmed: number | null;
  guestCountActual: number | null;
  travelMinutes: number | null;
  status: "planned" | "done" | "cancelled";
}

const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

export function readSessions(booking: Doc): Session[] {
  return asArr(booking.sessions)
    .map(asObj)
    .filter((s) => asStr(s.id) && isValidDay(asStr(s.date)))
    .map((s) => ({
      id: asStr(s.id),
      nameTe: asStr(s.nameTe),
      nameEn: asStr(s.nameEn),
      date: asStr(s.date),
      serveTime: asStr(s.serveTime),
      mealType: asStr(s.mealType),
      packageId: asStr(s.packageId),
      guests: Math.max(0, Math.floor(asNum(s.guests))),
      guestCountConfirmed: posInt(s.guestCountConfirmed),
      guestCountActual: posInt(s.guestCountActual),
      travelMinutes: typeof s.travelMinutes === "number" ? s.travelMinutes : null,
      status: s.status === "done" || s.status === "cancelled" ? s.status : "planned",
    }));
}

export function liveSessions(booking: Doc): Session[] {
  return readSessions(booking).filter((s) => s.status !== "cancelled");
}

/** Guests that count for a session: actual → confirmed → planned. */
export function sessionGuests(s: Session): number {
  return s.guestCountActual ?? s.guestCountConfirmed ?? s.guests;
}

/** A session as a booking-shaped doc (for timeline / cooking inputs). */
export function sessionAsBooking(s: Session, booking: Doc): Doc {
  return {
    ...booking,
    guestCount: s.guests,
    guestCountConfirmed: s.guestCountConfirmed ?? undefined,
    guestCountActual: s.guestCountActual ?? undefined,
    serveTime: s.serveTime,
    mealType: s.mealType,
    travelMinutes: s.travelMinutes ?? booking.travelMinutes,
    packageId: s.packageId || booking.packageId,
  };
}

/** Guests per part of the event: one entry per live session, or the booking's own count. */
export function bookingGuestList(booking: Doc, fallback: number): number[] {
  const live = liveSessions(booking);
  if (!live.length) return fallback > 0 ? [fallback] : [];
  return live.map(sessionGuests).filter((g) => g > 0);
}

/**
 * Fields the server keeps in sync on a booking with sessions: guestCount = Σ session guests, eventDate = earliest
 * session (date + serveTime), guestCountActual = Σ actual (when any session has one). null = nothing to change.
 */
export function sessionSyncUpdate(booking: Doc): Doc | null {
  const sessions = readSessions(booking);
  if (!sessions.length) return null;
  const t = sessionTotals(sessions);
  const out: Doc = {};
  if (asNum(booking.guestCount, -1) !== t.guestCount) out.guestCount = t.guestCount;
  if (t.date) {
    const want = istAt(t.date, t.serveTime ?? undefined);
    const have = toDateValue(booking.eventDate);
    if (!have || have.getTime() !== want.getTime()) out.eventDate = want;
  }
  if (t.guestCountActual !== null && asNum(booking.guestCountActual, -1) !== t.guestCountActual) out.guestCountActual = t.guestCountActual;
  return Object.keys(out).length ? out : null;
}

export function eventDayOf(booking: Doc): string | null {
  return dayOfValue(booking.eventDate);
}

/** Days of the event (each live session's date, or the booking day). */
export function eventDays(booking: Doc): string[] {
  const live = liveSessions(booking);
  if (live.length) return [...new Set(live.map((s) => s.date))].sort();
  const d = eventDayOf(booking);
  return d ? [d] : [];
}
