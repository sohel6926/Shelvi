import { getFirestore } from "firebase-admin/firestore";
import { callable, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, optString } from "../shared/validate";
import { readSessions, sessionAsBooking } from "../events/sessions";
import { asStr, Doc } from "../shared/coerce";
import { dayOfValue } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { assertCanLogBooking } from "../kitchen/saveCookLog";
import { serviceTimeline, TimelineInput } from "../calc/timeline";
import { timelineInputInfo } from "../agents/helpers";

/** §12 with settings.timelineDefaults; a bad stored override falls back to the standard minutes. */
function stepsFor(input: TimelineInput, overrides: unknown) {
  try {
    return serviceTimeline(input, overrides ?? undefined);
  } catch (e) {
    if (overrides) return serviceTimeline(input);
    throw e;
  }
}

/**
 * getServiceTimeline { bookingId } (A, M own branch, S assigned) or { eventDay, guests, serveTime?, mealType?,
 * travelMinutes? } (booking-form preview) → { steps, serveTime, travelMinutes, mealType, defaultsUsed }.
 */
export const getServiceTimeline = callable("getServiceTimeline", ALL_ROLES, async (data, caller) => {
  const settings = await loadSettings();
  const bookingId = optId(data, "bookingId");
  let info: ReturnType<typeof timelineInputInfo>;
  if (bookingId) {
    const db = getFirestore();
    const snap = await db.collection(FirestoreCollections.BOOKINGS).doc(bookingId).get();
    if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
    let booking = snap.data() as Doc;
    assertCanLogBooking(caller, booking);
    let eventDay = dayOfValue(booking.eventDate);
    // R7-5: one session of the booking (its date, serve time, meal, guests, package)
    const sessionId = optString(data, "sessionId", 100);
    if (sessionId) {
      const s = readSessions(booking).find((x) => x.id === sessionId);
      if (!s) fail("not-found", "ఆ session దొరకలేదు.", "Session not found.");
      booking = sessionAsBooking(s, booking);
      eventDay = s.date;
    }
    if (!eventDay) fail("failed-precondition", "Booking లో event తేదీ లేదు.", "Booking has no event date.");
    const pkgId = asStr(booking.packageId) || asStr(booking.menuPackageId);
    const pkg = pkgId ? await db.collection(FirestoreCollections.MENU_PACKAGES).doc(pkgId).get() : undefined;
    info = timelineInputInfo(booking, pkg?.exists ? (pkg.data() as Doc) : undefined, eventDay);
    if (!info) fail("failed-precondition", "Booking లో అతిథుల సంఖ్య లేదు.", "Booking has no guest count.");
  } else {
    // Preview: same defaults as a booking; serviceTimeline rejects anything invalid (CalcError → invalid-argument).
    if (typeof data.eventDay !== "string") fail("invalid-argument", "eventDay లేదా bookingId ఇవ్వాలి.", "bookingId or eventDay is required.");
    info = timelineInputInfo({ guestCount: data.guests, serveTime: data.serveTime, mealType: data.mealType, travelMinutes: data.travelMinutes }, undefined, data.eventDay as string);
    if (!info) fail("invalid-argument", "అతిథుల సంఖ్య (1 లేదా ఎక్కువ) ఇవ్వాలి.", "guests must be a whole number ≥ 1.");
    if (data.mealType !== undefined && info.input.mealType !== data.mealType) fail("invalid-argument", "mealType సరిగా లేదు.", "mealType is not valid.");
    if (data.serveTime !== undefined && info.input.serveTime !== data.serveTime) fail("invalid-argument", "serveTime HH:MM రూపంలో ఉండాలి.", "serveTime must be HH:MM.");
    if (data.travelMinutes !== undefined && info.input.travelMinutes !== data.travelMinutes) fail("invalid-argument", "travelMinutes 0–300 మధ్య ఉండాలి.", "travelMinutes must be a whole number 0–300.");
  }
  const { input, defaultsUsed } = info as NonNullable<typeof info>;
  return { steps: stepsFor(input, settings.timelineDefaults), serveTime: input.serveTime, travelMinutes: input.travelMinutes, mealType: input.mealType, defaultsUsed };
});
