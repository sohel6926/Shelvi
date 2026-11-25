import { getFirestore } from "firebase-admin/firestore";
import { callable, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optArray, optId, optString, reqNum, reqOneOf } from "../shared/validate";
import { asNum, asObj, asStr, Doc } from "../shared/coerce";
import { EventType, EVENT_FACTORS, suggest, groceryFor, Unit } from "../calc/cooking";
import { round2 } from "../calc/util";
import { parseMenuPackage } from "../menus/menuPackage";
import { dishIdsForMenu } from "./menuDishes";
import { CallerContext } from "../auth/authContext";
import { assertCanLogBooking } from "./saveCookLog";
import { bookingGuests } from "./cookLearning";
import { readSessions, sessionAsBooking } from "../events/sessions";
import { splitGroceryMaster } from "./groceryMaster";

export { dishIdsForMenu };

const EVENT_TYPES = Object.keys(EVENT_FACTORS) as EventType[];
const UNITS: Unit[] = ["kg", "L", "pcs"];

function unitOf(v: unknown): Unit | null {
  return UNITS.includes(v as Unit) ? (v as Unit) : null;
}

/** R7-5: guests / event type / package from a booking (or one of its sessions) when bookingId is given. */
async function eventInputs(data: Doc, caller: CallerContext): Promise<{ guests: number; eventType: EventType; menuPackageId?: string }> {
  const bookingId = optId(data, "bookingId");
  if (!bookingId) {
    return { guests: reqNum(data, "guests", { int: true, min: 1, max: 100000 }), eventType: reqOneOf(data, "eventTypeCode", EVENT_TYPES), menuPackageId: optId(data, "menuPackageId") };
  }
  const snap = await getFirestore().collection(FirestoreCollections.BOOKINGS).doc(bookingId).get();
  if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  let booking = snap.data() as Doc;
  assertCanLogBooking(caller, booking);
  const sessionId = optString(data, "sessionId", 100);
  if (sessionId) {
    const s = readSessions(booking).find((x) => x.id === sessionId);
    if (!s) fail("not-found", "ఆ session దొరకలేదు.", "Session not found.");
    booking = sessionAsBooking(s, booking);
  }
  const guests = typeof data.guests === "number" ? reqNum(data, "guests", { int: true, min: 1, max: 100000 }) : bookingGuests(booking);
  if (!(guests >= 1)) fail("failed-precondition", "అతిథుల సంఖ్య లేదు.", "No guest count.");
  const evt = typeof data.eventTypeCode === "string" ? data.eventTypeCode : asStr(booking.eventTypeCode, "other");
  const eventType = (EVENT_TYPES as string[]).includes(evt) ? (evt as EventType) : "other";
  return { guests, eventType, menuPackageId: optId(data, "menuPackageId") ?? (asStr(booking.packageId) || asStr(booking.menuPackageId) || undefined) };
}

export const cookingPlan = callable("cookingPlan", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const { guests, eventType, menuPackageId } = await eventInputs(data, caller);
  const dishIdsReq = optArray(data, "dishIds", 300)?.map(String);

  const all: (Doc & { id: string })[] = (await db.collection(FirestoreCollections.DISHES).get()).docs.map((d) => ({ ...(d.data() as Doc), id: d.id }));
  let ids: string[];
  if (dishIdsReq) ids = dishIdsReq;
  else if (menuPackageId) {
    const m = await db.collection(FirestoreCollections.MENU_PACKAGES).doc(menuPackageId).get();
    if (!m.exists) fail("not-found", "ఆ menu దొరకలేదు.", "Menu package not found.");
    const raw = m.data() as Doc;
    const groupsWithIds = (Array.isArray(raw.groups) ? raw.groups : []).map((g: unknown) => (Array.isArray(g) ? g : (asObj(g).options as unknown[]) ?? []).map((o) => ({ te: asStr(asObj(o).te), en: asStr(asObj(o).en), dishId: asStr(asObj(o).dishId) || undefined })));
    parseMenuPackage(raw); // validates the package
    ids = dishIdsForMenu(groupsWithIds, all.map((d) => ({ id: d.id, nameEn: asStr(d.nameEn), nameTe: asStr(d.nameTe) })));
  } else ids = all.map((d) => d.id);

  const byId = new Map(all.map((d) => [d.id, d]));
  const items = ids.map((id) => {
    const d = byId.get(id);
    if (!d) fail("not-found", `వంటకం ${id} దొరకలేదు.`, `Dish ${id} not found.`);
    const unit = unitOf(d.unit);
    if (!unit) fail("failed-precondition", `వంటకం ${asStr(d.nameTe) || id} కి unit సరిగా లేదు.`, `Dish ${id} has no valid unit.`);
    const learned = asObj(d.learned);
    const basePer100 = asNum(d.basePer100);
    const per100 = typeof learned.per100 === "number" ? learned.per100 : basePer100;
    return {
      dishId: id,
      nameTe: asStr(d.nameTe),
      nameEn: asStr(d.nameEn),
      unit,
      quantity: suggest(per100, unit, eventType, guests),
      learnedPer100: per100,
      changePct: asNum(learned.changePct),
      advice: asStr(learned.advice, "ok"),
      eventsUsed: asNum(learned.eventsUsed),
    };
  });
  return { items };
});

export const groceryList = callable("groceryList", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const { guests, eventType } = await eventInputs(data, caller);
  const docs = (await db.collection(FirestoreCollections.GROCERY_ITEMS).get()).docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
  // Only items with per100 > 0 (most of the master has per100 = null until the owner fills it in).
  const { usable, skippedNoPer100, skippedBadUnit } = splitGroceryMaster(docs);
  const quantities = groceryFor(usable.map((g) => ({ name: g.groceryItemId, per100: g.per100, unit: g.unit })), eventType, guests);
  const invIds = [...new Set(usable.map((g) => g.inventoryItemId).filter(Boolean))];
  const invSnaps = invIds.length ? await db.getAll(...invIds.map((id) => db.collection(FirestoreCollections.INVENTORY).doc(id))) : [];
  const stock = new Map(invSnaps.filter((s) => s.exists).map((s) => [s.id, asNum((s.data() as Doc).quantityInStock)]));
  const items = usable.map((g, i) => {
    const quantity = quantities[i].quantity;
    const inStock = stock.get(g.inventoryItemId) ?? 0;
    return { groceryItemId: g.groceryItemId, nameTe: g.nameTe, nameEn: g.nameEn, category: g.category, group: g.group, unit: g.unit, quantity, inStock, toBuy: round2(Math.max(0, quantity - inStock)) };
  });
  return { items, skippedNoPer100, skippedBadUnit };
});
