/**
 * Round 8 — eventPlan / dayPlan (calc-spec §13.3–13.5): dish quantities from the owner's own events (exact cell →
 * factors → typed rule), ingredients from learned recipes, and §6 per-100 grocery lines only for items no planned
 * dish's recipe covers (nothing counted twice). Plan notifications for admin + kitchen manager.
 */
import { REGION } from "../setup";
import { dateChangedText, eventDayChange } from "../events/cancelBookingRules";
import { getFirestore, FieldValue, Timestamp, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { callable, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, optString, reqDay, reqId } from "../shared/validate";
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { addDays, dayOfValue, dayRange, toDateValue } from "../shared/istDate";
import { assertAdminOrOwnBranch, CallerContext } from "../auth/authContext";
import { EVENT_FACTORS, EventType, suggest, Unit } from "../calc/cooking";
import { comboKey, defaultServiceStyle, learnStatus, per100ForPlan, roleOfCategory, roundUpQty, SERVICE_STYLES, sizeBand, StartRule, Why } from "../calc/recipes";
import { round2 } from "../calc/util";
import { parseMenuPackage, SPECIAL_MEAL_TE } from "../menus/menuPackage";
import { lunchBoxesOn } from "../calc/round10";
import { readLunchBoxOrder } from "../lunchBoxes/lunchBoxRules";
import { assertCanLogBooking } from "./saveCookLog";
import { bookingGuests } from "./cookLearning";
import { HistoryLine, loggedEvents, readHistoryLine } from "./recipeSummary";
import { splitGroceryMaster } from "./groceryMaster";
import { grossQty, normalizeYieldPct } from "./yieldRules";
import { liveSessions, Session } from "../events/sessions";
import { PlanDishLine, planChanges, planChangedText, planInputsChanged, planLineKey, planReadyText, quotationMenuOptions, snapshotOf } from "./planRules";
import { expandSubRecipes, MAX_SUB_DEPTH, readSubRecipes, subRecipeExtra } from "./subRecipeRules";
import { freeFor } from "../stock/reservationRules";
import { usableStock } from "../stock/batchRules";

const UNITS: Unit[] = ["kg", "L", "pcs"];

export interface EventPart {
  bookingId: string;
  sessionId: string;
  labelTe: string;
  labelEn: string;
  day: string;
  guests: number;
  eventType: EventType;
  serviceStyle: string;
  packageId: string;
  branchId: string;
  customer: string;
  booking: Doc;
  /** R10-11 kids plates (cooked on top of guests) and special meals (inside guests) with the kitchen note */
  kidsCount: number;
  specialMeals: { type: string; typeTe: string; count: number; note: string }[];
  /** R10-12 lunch boxes: "lunchBox"; events: "event" */
  kind: "event" | "lunchBox";
  /** R10-12: dishes given directly (lunch box menuOptionIds) instead of a quotation / package */
  optionsOverride?: Doc[];
  lunchBoxOrderId?: string;
}

/** R10-11: kids and special meals of a booking / session for the plan (tagged counts + kitchen note). */
export function kidsAndSpecials(src: Doc): { kidsCount: number; specialMeals: EventPart["specialMeals"] } {
  const k = asNum(src.kidsCount);
  const specialMeals = asArr(src.specialMeals)
    .map(asObj)
    .filter((m) => asNum(m.count) > 0)
    .map((m) => ({ type: asStr(m.type, "other"), typeTe: SPECIAL_MEAL_TE[asStr(m.type)]?.te ?? asStr(m.type), count: Math.floor(asNum(m.count)), note: asStr(m.note) }));
  return { kidsCount: Number.isInteger(k) && k > 0 ? k : 0, specialMeals };
}

function partsOf(bookingId: string, booking: Doc, onlySession?: string, onlyDay?: string): EventPart[] {
  const evt = asStr(booking.eventTypeCode, "other");
  const eventType: EventType = evt in EVENT_FACTORS ? (evt as EventType) : "other";
  const style = (s?: string) => (SERVICE_STYLES as string[]).includes(s ?? "") ? (s as string) : (SERVICE_STYLES as string[]).includes(asStr(booking.serviceStyle)) ? asStr(booking.serviceStyle) : defaultServiceStyle(eventType);
  const base = { bookingId, eventType, branchId: asStr(booking.branchId), customer: asStr(booking.customerNameSnapshot), booking, kind: "event" as const };
  const rawSession = (id: string) => asObj(asArr(booking.sessions).map(asObj).find((x) => asStr(x.id) === id));
  const sessions = liveSessions(booking);
  if (sessions.length) {
    return sessions
      .filter((s: Session) => (!onlySession || s.id === onlySession) && (!onlyDay || s.date === onlyDay))
      .map((s: Session) => {
        const ks = kidsAndSpecials(rawSession(s.id));
        return { ...base, ...ks, sessionId: s.id, labelTe: s.nameTe || s.nameEn, labelEn: s.nameEn || s.nameTe, day: s.date, guests: (s.guestCountActual ?? s.guestCountConfirmed ?? s.guests) + ks.kidsCount, serviceStyle: style(asStr(rawSession(s.id).serviceStyle)), packageId: s.packageId || asStr(booking.packageId) || asStr(booking.menuPackageId) };
      });
  }
  if (onlySession) return [];
  const day = dayOfValue(booking.eventDate) ?? "";
  if (onlyDay && day !== onlyDay) return [];
  const ks = kidsAndSpecials(booking);
  return [{ ...base, ...ks, sessionId: "", labelTe: "", labelEn: "", day, guests: bookingGuests(booking) + ks.kidsCount, serviceStyle: style(), packageId: asStr(booking.packageId) || asStr(booking.menuPackageId) }];
}

/** Caches across the parts of one plan call. */
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export class PlanContext {
  db = getFirestore();
  private dishes = new Map<string, Doc | null>();
  private history = new Map<string, HistoryLine[]>();
  private quotations = new Map<string, Doc | undefined>();
  private packages = new Map<string, Doc | undefined>();
  groceries: Doc[] | null = null;

  async dish(id: string): Promise<Doc | null> {
    if (!this.dishes.has(id)) {
      const s = await this.db.collection(FirestoreCollections.DISHES).doc(id).get();
      this.dishes.set(id, s.exists && (s.data() as Doc).archived !== true ? (s.data() as Doc) : null);
    }
    return this.dishes.get(id) ?? null;
  }
  /** Module 2e: the dish and every base it reaches, loaded (and cached) for expandSubRecipes. */
  async subTree(dishId: string): Promise<Map<string, Doc | null>> {
    const out = new Map<string, Doc | null>();
    let todo = [dishId];
    for (let depth = 0; depth <= MAX_SUB_DEPTH && todo.length; depth++) {
      const docs = await Promise.all(todo.map((id) => this.dish(id)));
      const next: string[] = [];
      todo.forEach((id, i) => {
        out.set(id, docs[i]);
        for (const l of readSubRecipes(docs[i]?.subRecipes)) if (!out.has(l.dishId) && !next.includes(l.dishId)) next.push(l.dishId);
      });
      todo = next;
    }
    return out;
  }
  async lines(dishId: string): Promise<HistoryLine[]> {
    if (!this.history.has(dishId)) {
      const h = await this.db.collection(FirestoreCollections.DISHES).doc(dishId).collection(FirestoreCollections.DISH_HISTORY).get();
      this.history.set(dishId, h.docs.map((d) => readHistoryLine(d.data() as Doc, toDateValue((d.data() as Doc).eventAt)?.getTime() ?? 0)).filter((l): l is HistoryLine => l !== null));
    }
    return this.history.get(dishId) ?? [];
  }
  async quotation(bookingId: string, booking: Doc): Promise<Doc | undefined> {
    if (!this.quotations.has(bookingId)) {
      let q: Doc | undefined;
      const qid = asStr(booking.quotationId);
      if (qid) {
        const s = await this.db.collection(FirestoreCollections.QUOTATIONS).doc(qid).get();
        if (s.exists) q = s.data() as Doc;
      }
      if (!q) {
        const snap = await this.db.collection(FirestoreCollections.QUOTATIONS).where("bookingId", "==", bookingId).get();
        const list = snap.docs.map((d) => d.data() as Doc).filter((x) => asStr(x.status) !== "Cancelled" && asStr(x.status) !== "Rejected");
        list.sort((a, b) => Number(asStr(b.status) === "Accepted") - Number(asStr(a.status) === "Accepted") || (toDateValue(b.updatedAt)?.getTime() ?? 0) - (toDateValue(a.updatedAt)?.getTime() ?? 0));
        q = list[0];
      }
      this.quotations.set(bookingId, q);
    }
    return this.quotations.get(bookingId);
  }
  async menuPackage(id: string): Promise<Doc | undefined> {
    if (!id) return undefined;
    if (!this.packages.has(id)) {
      const s = await this.db.collection(FirestoreCollections.MENU_PACKAGES).doc(id).get();
      this.packages.set(id, s.exists ? (s.data() as Doc) : undefined);
    }
    return this.packages.get(id);
  }
  async groceryMaster(): Promise<Doc[]> {
    if (!this.groceries) this.groceries = (await this.db.collection(FirestoreCollections.GROCERY_ITEMS).get()).docs.map((d) => ({ ...(d.data() as Doc), id: d.id } as Doc));
    return this.groceries;
  }
}

/** Menu options with a dish: the quotation's choices for the booking / session, else single-option groups of the package. */
async function menuOptionsFor(ctx: PlanContext, part: EventPart): Promise<Doc[]> {
  if (part.optionsOverride) return part.optionsOverride;
  const fromQuote = quotationMenuOptions(await ctx.quotation(part.bookingId, part.booking), part.sessionId);
  if (fromQuote.length) return fromQuote;
  const pkg = await ctx.menuPackage(part.packageId);
  if (!pkg) return [];
  try {
    return parseMenuPackage(pkg).meta.groups.filter((g) => g.length === 1 && g[0].dishId).map((g) => g[0] as unknown as Doc);
  } catch {
    return [];
  }
}

export interface PlanDish extends PlanDishLine {
  sessionId: string;
  per100: number | null;
  source: string;
  matchedEvents: number;
  status: string;
  statusTe: string;
  eventsUsed: number;
  advice: string;
  why: Why[];
  ingredients: { groceryItemId: string; perUnit: number; qty: number }[];
  /** Module 2e: how much of each base (gravy, masala …) must be prepared for this dish */
  bases: { dishId: string; nameTe: string; nameEn: string; unit: string; qty: number }[];
}

export interface PartPlan {
  part: Omit<EventPart, "booking">;
  band: string;
  comboKey: string;
  dishes: PlanDish[];
  /** grocery → raw quantity needed by planned dishes */
  dishNeeds: Map<string, number>;
}

async function planPart(ctx: PlanContext, part: EventPart): Promise<PartPlan> {
  const options = await menuOptionsFor(ctx, part);
  const dishDocs = await Promise.all(options.map((o) => ctx.dish(asStr(o.dishId))));
  const roles = dishDocs.filter((d): d is Doc => !!d).map((d) => asStr(d.role) || roleOfCategory(asStr(d.category)));
  const combo = comboKey(roles);
  const band = part.guests >= 1 ? sizeBand(part.guests) : "S";
  const dishes: PlanDish[] = [];
  const dishNeeds = new Map<string, number>();
  for (const [i, o] of options.entries()) {
    const d = dishDocs[i];
    if (!d) continue;
    const dishId = asStr(o.dishId);
    const variantId = asStr(o.variantId);
    const variant = asArr(d.variants).map(asObj).find((v) => asStr(v.id) === variantId);
    const pieces = asNum(o.piecesPerPlate) || asNum(variant?.piecesPerPlate) || null;
    const unit = (UNITS as string[]).includes(asStr(d.unit)) ? (asStr(d.unit) as Unit) : pieces ? "pcs" : "kg";
    const lines = (await ctx.lines(dishId)).filter((l) => l.variantId === variantId);
    const r = per100ForPlan({ events: loggedEvents(lines), target: { band: band as "S", style: part.serviceStyle, comboKey: combo }, startRules: asArr(d.startRules).map(asObj) as StartRule[], basePer100: asNum(d.basePer100) || null, piecesPerPlate: pieces });
    const qty = r.per100 !== null && part.guests >= 1 ? suggest(r.per100, unit, part.eventType, part.guests) : null;
    const st = learnStatus(lines.length);
    const learned = asObj(variantId ? asObj(asObj(d.learned).variants)[variantId] : d.learned);
    const recipe = asObj(variantId ? asObj(asObj(d.recipe).variants)[variantId] ?? d.recipe : d.recipe);
    const ingredients: PlanDish["ingredients"] = [];
    const bases: PlanDish["bases"] = [];
    const loggedIds = new Set<string>(); // grocery items whose ratio comes from real cook logs
    if (qty !== null) {
      for (const ing of asArr(recipe.ingredients).map(asObj)) {
        const id = asStr(ing.groceryItemId);
        const perUnit = asNum(ing.perUnit);
        if (!id || !(perUnit > 0)) continue;
        const raw = qty * perUnit;
        dishNeeds.set(id, (dishNeeds.get(id) ?? 0) + raw);
        ingredients.push({ groceryItemId: id, perUnit, qty: round2(raw) });
        if (asNum(ing.eventsUsed) > 0) loggedIds.add(id);
      }
      // Module 2e: bases (gravy, masala …) used by this dish are opened into their grocery items.
      const tree = await ctx.subTree(dishId);
      const sub = expandSubRecipes(dishId, (x) => tree.get(x) ?? null);
      for (const [id, perUnit] of Object.entries(sub.perUnit)) {
        if (!(perUnit > 0)) continue;
        const have = ingredients.find((x) => x.groceryItemId === id);
        // A ratio learned from cook logs already counts what went in through the base, so the two are not added:
        // the larger one is used (never counted twice, never less than either). Typed lines and bases do add up.
        const extra = have ? subRecipeExtra(have.perUnit, perUnit, loggedIds.has(id)) : perUnit;
        if (!(extra > 0)) continue;
        const raw = qty * extra;
        dishNeeds.set(id, (dishNeeds.get(id) ?? 0) + raw);
        if (have) {
          have.perUnit = round4(have.perUnit + extra);
          have.qty = round2(have.qty + raw);
        } else ingredients.push({ groceryItemId: id, perUnit: round4(extra), qty: round2(raw) });
      }
      for (const [baseId, per] of Object.entries(sub.bases)) {
        const b = tree.get(baseId);
        bases.push({ dishId: baseId, nameTe: asStr(b?.nameTe), nameEn: asStr(b?.nameEn), unit: asStr(b?.unit), qty: round2(qty * per) });
      }
    }
    dishes.push({
      key: planLineKey(part.sessionId, dishId, variantId),
      sessionId: part.sessionId,
      dishId,
      variantId,
      nameTe: asStr(o.te) || asStr(d.nameTe),
      nameEn: asStr(o.en) || asStr(d.nameEn),
      unit,
      qty,
      per100: r.per100 === null ? null : round2(r.per100),
      source: r.source,
      matchedEvents: r.matchedEvents,
      status: st.status,
      statusTe: st.te,
      eventsUsed: lines.length,
      advice: asStr(learned.advice, "ok"),
      why: r.why,
      ingredients,
      bases,
    });
  }
  const { booking: _b, optionsOverride: _o, ...partOut } = part;
  return { part: partOut, band, comboKey: combo, dishes, dishNeeds };
}

/** Totals per grocery item: dish recipes (rounded up per §13.2) + §6 per-100 lines for items no dish covers. */
async function ingredientTotals(ctx: PlanContext, plans: PartPlan[], forBookingId = "") {
  const master = await ctx.groceryMaster();
  const byId = new Map(master.map((g) => [asStr(g.id), g]));
  const fromDishes = new Map<string, number>();
  for (const p of plans) for (const [k, v] of p.dishNeeds) fromDishes.set(k, (fromDishes.get(k) ?? 0) + v);
  const fromPer100 = new Map<string, number>();
  const { usable } = splitGroceryMaster(master.map((g) => ({ id: asStr(g.id), data: g })));
  for (const g of usable) {
    if (fromDishes.has(g.groceryItemId)) continue; // covered by a learned recipe → not counted twice
    let q = 0;
    for (const p of plans) if (p.part.guests >= 1) q += suggest(g.per100, g.unit, p.part.eventType as EventType, p.part.guests);
    if (q > 0) fromPer100.set(g.groceryItemId, round2(q));
  }
  const ids = [...new Set([...fromDishes.keys(), ...fromPer100.keys()])];
  const invIds = [...new Set(ids.map((id) => asStr(byId.get(id)?.inventoryItemId)).filter(Boolean))];
  const inv = invIds.length ? await ctx.db.getAll(...invIds.map((id) => ctx.db.collection(FirestoreCollections.INVENTORY).doc(id))) : [];
  const stock = new Map(inv.filter((s) => s.exists).map((s) => [s.id, asNum((s.data() as Doc).quantityInStock)]));
  // Module 2g: stock promised to OTHER confirmed events is not counted as available for this one.
  const reservedAll = new Map(inv.filter((s) => s.exists).map((s) => [s.id, asNum((s.data() as Doc).reservedQty)]));
  const expiredAll = new Map(inv.filter((s) => s.exists).map((s) => [s.id, Math.max(0, asNum((s.data() as Doc).expiredQty))]));
  const own = new Map<string, number>();
  if (forBookingId && [...reservedAll.values()].some((v) => v > 0)) {
    const r = await ctx.db.collection(FirestoreCollections.STOCK_RESERVATIONS).doc(forBookingId).get();
    for (const l of asArr((r.data() as Doc | undefined)?.lines).map(asObj)) own.set(asStr(l.inventoryItemId), asNum(l.reserved));
  }
  return ids.map((id) => {
    const g = byId.get(id) ?? {};
    const unit = asStr(g.unit);
    const dishRaw = fromDishes.get(id) ?? 0;
    const dishQty = dishRaw > 0 ? ((UNITS as string[]).includes(unit) ? roundUpQty(dishRaw, unit) : round2(dishRaw)) : 0;
    const per100 = fromPer100.get(id) ?? 0;
    const needed = round2(dishQty + per100);
    const invId = asStr(g.inventoryItemId);
    const inStock = stock.get(invId) ?? 0;
    // X7: stock past its expiry date is still counted in `inStock` (it is on the shelf) but never as available.
    const expired = Math.min(inStock, expiredAll.get(invId) ?? 0);
    const usable = usableStock(inStock, expired);
    const reservedOthers = forBookingId ? round2(Math.min(inStock, Math.max(0, (reservedAll.get(invId) ?? 0) - (own.get(invId) ?? 0)))) : 0;
    const free = forBookingId ? freeFor(usable, reservedAll.get(invId) ?? 0, own.get(invId) ?? 0) : usable;
    // Module 2c: `needed` is the usable quantity; `gross` is what must be on hand before cleaning (needed ÷ yield).
    // Without a yield on the item, gross = needed and nothing changes.
    const yieldPct = normalizeYieldPct(g.yieldPct);
    const gross = round2(grossQty(needed, yieldPct, unit));
    return { groceryItemId: id, nameTe: asStr(g.nameTe), nameEn: asStr(g.nameEn) || asStr(g.nameRoman), unit, needed, fromDishes: dishQty, fromPer100: per100, yieldPct, gross, inStock, inventoryItemId: invId, reservedOthers, expired: round2(expired), toBuy: round2(Math.max(0, gross - free)) };
  }).sort((a, b) => (a.nameEn || a.nameTe).localeCompare(b.nameEn || b.nameTe));
}

/** For saveCookLog: band, service style and comboKey of a booking / session (stored on each cook-log line). */
export async function eventContext(bookingId: string, booking: Doc, sessionId: string): Promise<{ guests: number; band: string; serviceStyle: string; comboKey: string; day: string } | null> {
  const part = partsOf(bookingId, booking, sessionId || undefined)[0];
  if (!part) return null;
  const p = await planPart(new PlanContext(), part);
  return { guests: part.guests, band: p.band, serviceStyle: part.serviceStyle, comboKey: p.comboKey, day: part.day };
}

export async function planForBooking(bookingId: string, booking: Doc, sessionId?: string, ctx = new PlanContext()) {
  const parts = partsOf(bookingId, booking, sessionId);
  const plans = [];
  for (const p of parts) plans.push(await planPart(ctx, p));
  // a single-session view shares the booking's stock, so reservations of other events apply the same way
  return { plans, ingredients: await ingredientTotals(ctx, plans, bookingId) };
}

/**
 * R10-4: groceries for one menu package at `guests` plates — every group costed with its first option (choice groups
 * are listed), learned / typed recipes per §13, per-100 master lines for items no dish covers.
 */
export async function ingredientsForPackage(packageId: string, guests: number) {
  const ctx = new PlanContext();
  const pkg = await ctx.menuPackage(packageId);
  if (!pkg) return null;
  const { meta } = parseMenuPackage(pkg);
  const options = meta.groups.filter((g) => g.length && g[0].dishId).map((g) => g[0] as unknown as Doc);
  const part: EventPart = { bookingId: "", sessionId: "", labelTe: "", labelEn: "", day: "", guests, eventType: "other", serviceStyle: "buffet", packageId, branchId: "", customer: "", booking: {}, kidsCount: 0, specialMeals: [], kind: "event", optionsOverride: options };
  const plan = await planPart(ctx, part);
  return {
    meta,
    ingredients: await ingredientTotals(ctx, [plan]),
    dishesWithoutQty: plan.dishes.filter((d) => d.qty === null).map((d) => d.nameTe || d.nameEn),
    groupsWithoutDish: meta.groups.filter((g) => !g.length || !g[0].dishId).map((g) => g.map((o) => o.te || o.en).join(" / ")),
    choiceGroups: meta.groups.filter((g) => g.length > 1 && g[0].dishId).map((g) => g.map((o) => o.te || o.en).join(" / ")),
  };
}

function present(p: PartPlan) {
  return { ...p.part, band: p.band, comboKey: p.comboKey, dishes: p.dishes };
}

/** eventPlan { bookingId, sessionId? } (A, M own branch, S assigned). */
export const eventPlan = callable("eventPlan", ALL_ROLES, async (data, caller) => {
  const bookingId = reqId(data, "bookingId");
  const sessionId = optString(data, "sessionId", 100) || undefined;
  const snap = await getFirestore().collection(FirestoreCollections.BOOKINGS).doc(bookingId).get();
  if (!snap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const booking = snap.data() as Doc;
  assertCanLogBooking(caller, booking);
  const r = await planForBooking(bookingId, booking, sessionId);
  if (sessionId && !r.plans.length) fail("not-found", "ఆ session దొరకలేదు.", "Session not found.");
  return { parts: r.plans.map(present), dishes: r.plans.flatMap((p) => p.dishes), ingredients: r.ingredients };
});

/** All event parts (bookings / sessions) on an IST day, same branch. */
async function partsOnDay(day: string, branchId: string | null): Promise<EventPart[]> {
  const db = getFirestore();
  const from = dayRange(addDays(day, -14)).start;
  const to = dayRange(day).end;
  const snap = await db.collection(FirestoreCollections.BOOKINGS).where("eventDate", ">=", Timestamp.fromDate(from)).where("eventDate", "<", Timestamp.fromDate(to)).get();
  const parts: EventPart[] = [];
  for (const d of snap.docs) {
    const b = d.data() as Doc;
    if (["Cancelled"].includes(asStr(b.status)) || b.archived === true) continue;
    if (branchId && asStr(b.branchId) !== branchId) continue;
    parts.push(...partsOf(d.id, b, undefined, day));
  }
  // R10-12: lunch boxes delivered that day are planned like a small event (dishes = the order's menuOptionIds).
  const orders = await db.collection(FirestoreCollections.LUNCH_BOX_ORDERS).where("status", "==", "active").get();
  for (const d of orders.docs) {
    const o = d.data() as Doc;
    if (branchId && asStr(o.branchId) !== branchId) continue;
    const boxes = lunchBoxesOn(readLunchBoxOrder(d.id, o, 0), day);
    if (boxes <= 0) continue;
    parts.push({
      bookingId: "",
      lunchBoxOrderId: d.id,
      sessionId: "",
      labelTe: `లంచ్ బాక్స్ ${asStr(o.deliveryTime)}`.trim(),
      labelEn: `Lunch boxes ${asStr(o.deliveryTime)}`.trim(),
      day,
      guests: boxes,
      eventType: "other",
      serviceStyle: "other",
      packageId: "",
      branchId: asStr(o.branchId),
      customer: asStr(o.customerNameSnapshot),
      booking: {},
      kidsCount: 0,
      specialMeals: [],
      kind: "lunchBox",
      optionsOverride: asArr(o.menuOptionIds).map(String).filter(Boolean).map((dishId) => ({ dishId })),
    });
  }
  return parts;
}

export async function dayPlanFor(day: string, branchId: string | null) {
  const ctx = new PlanContext();
  const parts = await partsOnDay(day, branchId);
  const plans = [];
  for (const p of parts) plans.push(await planPart(ctx, p));
  const dishes = new Map<string, { dishId: string; variantId: string; nameTe: string; nameEn: string; unit: string; total: number; perEvent: { bookingId: string; sessionId: string; customer: string; qty: number | null; kind: string; lunchBoxOrderId?: string }[] }>();
  for (const p of plans) {
    for (const d of p.dishes) {
      const k = `${d.dishId}|${d.variantId}`;
      const cur = dishes.get(k) ?? { dishId: d.dishId, variantId: d.variantId, nameTe: d.nameTe, nameEn: d.nameEn, unit: d.unit, total: 0, perEvent: [] };
      cur.total = round2(cur.total + (d.qty ?? 0));
      cur.perEvent.push({ bookingId: p.part.bookingId, sessionId: p.part.sessionId, customer: p.part.customer, qty: d.qty, kind: p.part.kind, ...(p.part.lunchBoxOrderId ? { lunchBoxOrderId: p.part.lunchBoxOrderId } : {}) });
      dishes.set(k, cur);
    }
  }
  return { date: day, events: plans.map(present), dishes: [...dishes.values()], ingredients: await ingredientTotals(ctx, plans) };
}

/** dayPlan { date, branchId? } (A, M — managers see their own branch). */
export const dayPlan = callable("dayPlan", ADMIN_MANAGER, async (data, caller: CallerContext) => {
  const day = reqDay(data, "date");
  let branchId = optId(data, "branchId") ?? null;
  if (caller.role !== "admin") {
    branchId = branchId ?? caller.branchId;
    assertAdminOrOwnBranch(caller, branchId ?? "");
  }
  return dayPlanFor(day, branchId);
});

// ---- notifications --------------------------------------------------------------------------------------------

export async function notifyKitchen(id: string, kind: string, text: { te: string; en: string }, link: string, extra: Doc = {}): Promise<void> {
  const ref = getFirestore().collection(FirestoreCollections.NOTIFICATIONS).doc(id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300));
  await ref.set({ kind, audienceRoles: ["admin", "manager"], title: text, link, readBy: [], createdAt: FieldValue.serverTimestamp(), ...extra });
}

/** Re-plans a booking; first plan → "plan ready" notification; later changes → "old → new" notification. */
export async function refreshPlanSnapshot(bookingId: string): Promise<void> {
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.BOOKINGS).doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const booking = snap.data() as Doc;
  if (["Cancelled", "Closed"].includes(asStr(booking.status))) return;
  const { plans } = await planForBooking(bookingId, booking);
  const lines = plans.flatMap((p) => p.dishes);
  const now = snapshotOf(lines);
  if (!Object.keys(now).length) return;
  const old = asObj(asObj(booking.planSnapshot).items) as Record<string, number>;
  const day = plans[0]?.part.day ?? "";
  const customer = asStr(booking.customerNameSnapshot);
  const link = `/day-plan?date=${day}`;
  if (!Object.keys(old).length) {
    await notifyKitchen(`planReady_${bookingId}`, "plan-ready", planReadyText(customer, day, lines), link, { bookingId, day });
  } else {
    const changes = planChanges(old, lines);
    if (!changes.length) return;
    await db.collection(FirestoreCollections.NOTIFICATIONS).add({ kind: "plan-changed", audienceRoles: ["admin", "manager"], title: planChangedText(customer, changes), changes, link, bookingId, day, readBy: [], createdAt: FieldValue.serverTimestamp() });
  }
  await ref.update({ planSnapshot: { items: now, at: FieldValue.serverTimestamp() } });
}

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

export const planOnBookingChange = onDocumentWritten({ document: "bookings/{bookingId}", region: REGION }, async (event: WriteEvent) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  if (!planInputsChanged(before, after)) return;
  // Round 9 postpone: the kitchen hears about a date change even when the quantities stay the same.
  const moved = eventDayChange(before, after);
  if (moved && after) {
    const id = event.params.bookingId;
    try {
      await notifyKitchen(`dateChanged_${id}_${moved.from}_${moved.to}`, "date-changed", dateChangedText(asStr(after.customerNameSnapshot), moved.from, moved.to), `/day-plan?date=${moved.to}`, { bookingId: id, day: moved.to, fromDay: moved.from });
    } catch (e) {
      logger.error("date-change notification failed", id, e);
    }
  }
  try {
    await refreshPlanSnapshot(event.params.bookingId);
  } catch (e) {
    logger.error("plan refresh failed", event.params.bookingId, e);
  }
});

export const planOnQuotationChange = onDocumentWritten({ document: "quotations/{quotationId}", region: REGION }, async (event: WriteEvent) => {
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
  const bookingId = asStr(after?.bookingId) || asStr(before?.bookingId);
  if (!bookingId) return;
  const relevant = ["status", "menuChoices", "sessionQuotes", "menuPackageId"].some((f) => JSON.stringify(before?.[f] ?? null) !== JSON.stringify(after?.[f] ?? null));
  if (!relevant) return;
  try {
    await refreshPlanSnapshot(bookingId);
  } catch (e) {
    logger.error("plan refresh failed", bookingId, e);
  }
});
