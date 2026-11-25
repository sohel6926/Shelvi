import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { checkNum, reqArray, reqId } from "../shared/validate";
import { asNum, asObj, asStr, Doc } from "../shared/coerce";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { assertCanOverride, auditOverride, autoFields, manualFields } from "../shared/override";
import { MIN_REASON_LENGTH } from "../shared/overridePolicy";
import { EVENT_FACTORS, EventType, suggest, Unit } from "../calc/cooking";
import { bookingGuests } from "./cookLearning";

const UNITS: Unit[] = ["kg", "L", "pcs"];

/**
 * saveCookingPlan { bookingId, items: [{ dishId, quantity, manual }], reason? } → bookings/{id}/cookingPlan/{dishId}.
 * Automatic items get the §5 suggestion for the booking's guests and event type (client quantity ignored);
 * manual items keep the typed quantity (≥ 0) with autoValue for comparison. reason (≥ 3 chars) needed for manual items.
 */
export const saveCookingPlan = callable("saveCookingPlan", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingId = reqId(data, "bookingId");
  const raw = reqArray(data, "items", 300);
  const items = raw.map((x, i) => {
    const o = asObj(x);
    const dishId = reqId(o, "dishId");
    const manual = o.manual === true;
    const quantity = manual ? checkNum(`items[${i}].quantity`, o.quantity, { min: 0 }) : null;
    return { dishId, manual, quantity };
  });
  if (new Set(items.map((i) => i.dishId)).size !== items.length) fail("invalid-argument", "ఒకే వంటకం రెండుసార్లు ఉంది.", "The same dish is listed twice.");
  const anyManual = items.some((i) => i.manual);
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";
  const settings = await loadSettings();
  if (anyManual) {
    assertCanOverride(caller, settings);
    if (reason.length < MIN_REASON_LENGTH) fail("invalid-argument", "మార్పుకి కారణం రాయండి (కనీసం 3 అక్షరాలు).", "A reason of at least 3 characters is required for manual quantities.");
  }

  const bookingRef = db.collection(c.BOOKINGS).doc(bookingId);
  const bSnap = await bookingRef.get();
  if (!bSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const booking = bSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(booking.branchId));
  const guests = bookingGuests(booking);
  if (!(guests >= 1)) fail("failed-precondition", "Booking లో అతిథుల సంఖ్య లేదు.", "Booking has no guest count.");
  const evt = asStr(booking.eventTypeCode, "other");
  const eventType: EventType = evt in EVENT_FACTORS ? (evt as EventType) : "other";

  const dishSnaps = await db.getAll(...items.map((i) => db.collection(c.DISHES).doc(i.dishId)));
  const batch = db.batch();
  const out = items.map((it, k) => {
    const s = dishSnaps[k];
    if (!s.exists) fail("not-found", `వంటకం ${it.dishId} దొరకలేదు.`, `Dish ${it.dishId} not found.`);
    const d = s.data() as Doc;
    const unit = UNITS.includes(d.unit as Unit) ? (d.unit as Unit) : null;
    if (!unit) fail("failed-precondition", `వంటకం ${asStr(d.nameTe) || it.dishId} కి unit సరిగా లేదు.`, `Dish ${it.dishId} has no valid unit.`);
    const learned = asObj(d.learned);
    const per100 = typeof learned.per100 === "number" ? learned.per100 : asNum(d.basePer100);
    const autoQty = suggest(per100, unit, eventType, guests);
    const quantity = it.manual ? (it.quantity as number) : autoQty;
    batch.set(bookingRef.collection(c.COOKING_PLAN).doc(it.dishId), {
      dishId: it.dishId,
      nameTe: asStr(d.nameTe),
      nameEn: asStr(d.nameEn),
      unit,
      quantity,
      guests,
      eventTypeCode: eventType,
      branchId: asStr(booking.branchId),
      ...(it.manual ? manualFields(caller, autoQty, reason) : autoFields(autoQty)),
      savedBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { dishId: it.dishId, unit, quantity, autoValue: autoQty, calcMode: it.manual ? "manual" : "auto" };
  });
  await batch.commit();
  const manualItems = out.filter((o) => o.calcMode === "manual");
  if (manualItems.length) {
    await auditOverride(caller, "saveCookingPlan", c.BOOKINGS, bookingId, manualItems.map((o) => ({ dishId: o.dishId, auto: o.autoValue })), manualItems.map((o) => ({ dishId: o.dishId, quantity: o.quantity })), reason);
  }
  return { items: out };
});
