import {
  addDoc,
  collection,
  doc,
  type DocumentData,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  type Query,
} from "firebase/firestore";
import { db } from "../firebase";
import { toCalcMeta, type CalcMeta } from "./calcMode";
import { createStamp, updateStamp } from "./audit";
import { toServiceStyle, type ServiceStyle } from "./dishRepository";

/**
 * Mirrors data/model/BookingStatus.kt labels exactly — Firestore stores the label string.
 * "Closed" (R7-9) follows "Completed" and is set only by the closeEvent callable.
 */
export type BookingStatus = "Inquiry" | "Confirmed" | "InProgress" | "Completed" | "Cancelled" | "Closed";
/** Statuses a person may pick in the booking form (Cancelled goes through cancelBooking, Closed through closeEvent). */
export const BOOKING_STATUSES: BookingStatus[] = ["Inquiry", "Confirmed", "InProgress", "Completed"];

/** Event type for cooking factors (calc §5) — chosen in the booking form, default wedding. */
export const EVENT_TYPE_CODES = ["wedding", "annadanam", "housewarming", "office", "other"] as const;
export type EventTypeCode = (typeof EVENT_TYPE_CODES)[number];

export function toEventTypeCode(v: unknown): EventTypeCode {
  return (EVENT_TYPE_CODES as readonly string[]).includes(v as string) ? (v as EventTypeCode) : "wedding";
}

export const MEAL_TYPES = ["tiffin", "lunch", "dinner", "lunch-dinner", "other"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export function toMealType(v: unknown): MealType {
  return (MEAL_TYPES as readonly string[]).includes(v as string) ? (v as MealType) : "other";
}

/** One stock line taken out for an event (🔒 server-written, contract Round 6 A). */
export interface StockLine {
  groceryItemId: string;
  inventoryItemId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  quantity: number;
  autoValue: number | null;
  shortBy: number;
}

export interface StockDeduction {
  at: Date | null;
  /** "auto" or the person who ran it. */
  by: "auto" | { uid: string; name: string };
  calcMode: "auto" | "manual";
  items: StockLine[];
  skipped: { groceryItemId: string; nameTe: string; nameEn: string }[];
  reversed: boolean;
}

function toStockDeduction(v: unknown): StockDeduction | null {
  if (!v || typeof v !== "object") return null;
  const d = v as DocumentData;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const by = d.by && typeof d.by === "object" ? { uid: s(d.by.uid), name: s(d.by.name) } : ("auto" as const);
  return {
    at: d.at?.toDate ? d.at.toDate() : null,
    by,
    calcMode: d.calcMode === "manual" ? "manual" : "auto",
    items: Array.isArray(d.items)
      ? d.items.map((i: DocumentData) => ({
          groceryItemId: s(i.groceryItemId),
          inventoryItemId: s(i.inventoryItemId),
          nameTe: s(i.nameTe),
          nameEn: s(i.nameEn),
          unit: s(i.unit),
          quantity: n(i.quantity),
          autoValue: typeof i.autoValue === "number" ? i.autoValue : null,
          shortBy: n(i.shortBy),
        }))
      : [],
    skipped: Array.isArray(d.skipped)
      ? d.skipped.map((i: unknown) =>
          typeof i === "string"
            ? { groceryItemId: i, nameTe: "", nameEn: "" }
            : { groceryItemId: s((i as DocumentData).groceryItemId), nameTe: s((i as DocumentData).nameTe), nameEn: s((i as DocumentData).nameEn) },
        )
      : [],
    reversed: d.reversed === true,
  };
}

/** R7-5 meal session inside a booking (`bookings.sessions[]`). */
/** R10-11 special meals (same codes as Android SpecialMeal.TYPES). */
export const SPECIAL_MEAL_TYPES = ["no-onion-garlic", "jain", "allergy", "diabetic", "other"] as const;
export type SpecialMealType = (typeof SPECIAL_MEAL_TYPES)[number];
export interface SpecialMeal {
  type: SpecialMealType;
  count: number;
  note: string;
}

/** Telugu first (same labels as Android SpecialMeal.typeLabel). */
export const SPECIAL_MEAL_LABEL: Record<SpecialMealType, { te: string; en: string }> = {
  "no-onion-garlic": { te: "ఉల్లి-వెల్లుల్లి లేకుండా", en: "No onion-garlic" },
  jain: { te: "జైన్", en: "Jain" },
  allergy: { te: "అలర్జీ", en: "Allergy" },
  diabetic: { te: "షుగర్ (డయాబెటిక్)", en: "Diabetic" },
  other: { te: "ఇతర", en: "Other" },
};

export function toSpecialMeals(v: unknown): SpecialMeal[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const o = (x ?? {}) as DocumentData;
    const type = (SPECIAL_MEAL_TYPES as readonly string[]).includes(o.type) ? (o.type as SpecialMealType) : "other";
    return { type, count: typeof o.count === "number" && o.count > 0 ? Math.round(o.count) : 0, note: typeof o.note === "string" ? o.note : "" };
  });
}

/** Firestore shape: only rows with a count (Android filters the same way). */
export function specialMealsToFirestore(rows: SpecialMeal[]): DocumentData[] {
  return rows.filter((m) => m.count > 0).map((m) => ({ type: m.type, count: Math.round(m.count), note: m.note.trim() }));
}

export const SESSION_STATUSES = ["planned", "done", "cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface MealSession {
  id: string;
  nameTe: string;
  nameEn: string;
  date: Date | null;
  serveTime: string;
  mealType: MealType;
  packageId: string;
  guests: number;
  guestCountConfirmed: number | null;
  guestCountActual: number | null;
  travelMinutes: number;
  status: SessionStatus;
  /** Round 8 §13.5: banthi | buffet | other ("" = not chosen yet; required on save). */
  serviceStyle: ServiceStyle | "";
  /** R10-11: kids plates (priced at the package kidsPrice by the server) and special meals. */
  kidsCount: number;
  specialMeals: SpecialMeal[];
}

function toSession(v: DocumentData, i: number): MealSession {
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  const nOrNull = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    id: s(v.id) || `s${i + 1}`,
    nameTe: s(v.nameTe),
    nameEn: s(v.nameEn),
    date: v.date?.toDate ? v.date.toDate() : v.date instanceof Date ? v.date : null,
    serveTime: typeof v.serveTime === "string" && /^\d{2}:\d{2}$/.test(v.serveTime) ? v.serveTime : "",
    mealType: toMealType(v.mealType),
    packageId: s(v.packageId),
    guests: typeof v.guests === "number" ? v.guests : 0,
    guestCountConfirmed: nOrNull(v.guestCountConfirmed),
    guestCountActual: nOrNull(v.guestCountActual),
    travelMinutes: typeof v.travelMinutes === "number" ? v.travelMinutes : 45,
    status: (SESSION_STATUSES as readonly string[]).includes(v.status) ? (v.status as SessionStatus) : "planned",
    serviceStyle: toServiceStyle(v.serviceStyle),
    kidsCount: typeof v.kidsCount === "number" && v.kidsCount > 0 ? Math.round(v.kidsCount) : 0,
    specialMeals: toSpecialMeals(v.specialMeals),
  };
}

/** R7-9 closed event (🔒 written by closeEvent). Profit fields are shown to the owner only. */
export interface ClosedInfo {
  at: Date | null;
  by: string;
  income: number | null;
  costs: Record<string, number>;
  profit: number | null;
  marginPct: number | null;
}

function toClosed(v: unknown): ClosedInfo | null {
  if (!v || typeof v !== "object") return null;
  const d = v as DocumentData;
  const snap = (d.profit && typeof d.profit === "object" ? d.profit : d.snapshot && typeof d.snapshot === "object" ? d.snapshot : d) as DocumentData;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const costs: Record<string, number> = {};
  const rawCosts = (snap.costs ?? snap.costsByType ?? {}) as DocumentData;
  for (const [k, x] of Object.entries(rawCosts)) if (typeof x === "number") costs[k] = x;
  const by = d.by && typeof d.by === "object" ? String((d.by as DocumentData).name ?? (d.by as DocumentData).uid ?? "") : typeof d.by === "string" ? d.by : "";
  return {
    at: d.at?.toDate ? d.at.toDate() : null,
    by,
    income: n(snap.income),
    costs,
    profit: n(typeof snap.profit === "number" ? snap.profit : null),
    marginPct: n(snap.marginPct),
  };
}

export interface MenuSnapshotItem {
  itemId: string;
  name: string;
  pricePerPlate: number;
}

/** Mirrors data/model/Booking.kt */
export interface Booking {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  eventDate: Date | null;
  eventType: string;
  eventTypeCode: EventTypeCode;
  venue: string;
  guestCount: number;
  menuItemIds: string[];
  menuSnapshot: MenuSnapshotItem[];
  status: BookingStatus;
  assignedStaffIds: string[];
  totalAmount: number;
  advancePaid: number;
  notes: string;
  branchId: string;
  /** Menu package chosen for the event (optional). */
  packageId: string;
  mealType: MealType;
  /** "HH:MM" 24h — when serving starts (contract Round 6 C). Empty = not set. */
  serveTime: string;
  travelMinutes: number;
  guestCountConfirmed: number | null;
  guestCountActual: number | null;
  stockDeduction: StockDeduction | null;
  /** R7-5: empty = a plain one-meal booking (works as before). */
  sessions: MealSession[];
  /** R7-9: set when the event is closed (then the booking and its costs are read-only). */
  closed: ClosedInfo | null;
  /** R7-3 */
  cancelled: boolean;
  cancelReason: string;
  /** Round 8 §13.5 ("" = not chosen yet). */
  serviceStyle: ServiceStyle | "";
  /** R10-11 (plain one-meal booking; sessions carry their own). */
  kidsCount: number;
  specialMeals: SpecialMeal[];
  /** Round 9 (server-only): how the order was cancelled; `lastCancel` after an undo; last date change. */
  cancelDetail: CancelDetail | null;
  lastCancel: CancelDetail | null;
  lastPostponed: Postponement | null;
  /** Round 9: "రద్దైన event ఖర్చు" (costs − kept charge) on a cancelled order, from the server. */
  cancelLoss: number;
}

/** Round 9 `bookings.cancel` / `lastCancel` (written only by cancelBooking / restoreBooking). */
export interface CancelDetail {
  reasonCode: string;
  reasonTe: string;
  reason: string;
  byName: string;
  at: Date | null;
  paid: number;
  refund: number;
  charge: number;
  refundMethod: string;
  previousStatus: string;
  releasedStaff: number;
  releasedTrips: number;
  releasedMoves: number;
  /** Only on lastCancel. */
  restoredAt: Date | null;
  restoredByName: string;
  restoreReason: string;
}

/** Round 9 `bookings.lastPostponed` (postponeBooking). */
export interface Postponement {
  from: string;
  to: string;
  reason: string;
  byName: string;
  at: Date | null;
}

const numOr0 = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strOr = (v: unknown): string => (typeof v === "string" ? v : "");
const dateOrNull = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
};
const nameOf = (v: unknown): string => strOr((v as { name?: unknown } | null | undefined)?.name);

function toCancelDetail(v: unknown, fallback?: DocumentData): CancelDetail | null {
  const c = v && typeof v === "object" ? (v as DocumentData) : null;
  if (!c && !fallback) return null;
  const o = c ?? {};
  return {
    reasonCode: strOr(o.reasonCode),
    reasonTe: strOr(o.reasonTe),
    reason: strOr(o.reason) || strOr(fallback?.cancelReason),
    byName: nameOf(o.by) || nameOf(fallback?.cancelledBy),
    at: dateOrNull(o.at) ?? dateOrNull(fallback?.cancelledAt),
    paid: numOr0(o.paid),
    refund: numOr0(o.refund),
    charge: numOr0(o.charge),
    refundMethod: strOr(o.refundMethod),
    previousStatus: strOr(o.previousStatus),
    releasedStaff: Array.isArray(o.releasedStaffIds) ? o.releasedStaffIds.length : 0,
    releasedTrips: numOr0(o.releasedTrips),
    releasedMoves: numOr0(o.releasedMoves),
    restoredAt: dateOrNull(o.restoredAt),
    restoredByName: nameOf(o.restoredBy),
    restoreReason: strOr(o.restoreReason),
  };
}

function toPostponement(v: unknown): Postponement | null {
  if (!v || typeof v !== "object") return null;
  const o = v as DocumentData;
  return { from: strOr(o.from), to: strOr(o.to), reason: strOr(o.reason), byName: nameOf(o.by), at: dateOrNull(o.at) };
}

export interface BookingInput {
  id?: string;
  customerId: string;
  customerNameSnapshot: string;
  eventDate: Date;
  eventType: string;
  eventTypeCode: EventTypeCode;
  venue: string;
  guestCount: number;
  menuItemIds: string[];
  menuSnapshot: MenuSnapshotItem[];
  status: BookingStatus;
  /** Preserved unchanged from the loaded record on edit — no staff-assignment UI on the web yet. */
  assignedStaffIds: string[];
  /** Planning estimate for the event. Quotation / invoice totals come from the server. */
  totalAmount: number;
  notes: string;
  packageId: string;
  mealType: MealType;
  serveTime: string;
  travelMinutes: number;
  /** R7-5 sessions; when non-empty, guestCount = Σ session guests and eventDate = earliest session date. */
  sessions: MealSession[];
  serviceStyle: ServiceStyle;
  kidsCount: number;
  specialMeals: SpecialMeal[];
}

const bookingsCol = collection(db, "bookings");

function toBooking(id: string, data: DocumentData): Booking {
  return {
    id,
    customerId: data.customerId ?? "",
    customerNameSnapshot: data.customerNameSnapshot ?? "",
    eventDate: data.eventDate?.toDate ? data.eventDate.toDate() : null,
    eventType: data.eventType ?? "",
    eventTypeCode: toEventTypeCode(data.eventTypeCode),
    venue: data.venue ?? "",
    guestCount: data.guestCount ?? 0,
    menuItemIds: data.menuItemIds ?? [],
    menuSnapshot: data.menuSnapshot ?? [],
    status: (data.status as BookingStatus) ?? "Inquiry",
    assignedStaffIds: data.assignedStaffIds ?? [],
    totalAmount: data.totalAmount ?? 0,
    advancePaid: data.advancePaid ?? 0,
    notes: data.notes ?? "",
    branchId: data.branchId ?? "",
    packageId: typeof data.packageId === "string" ? data.packageId : "",
    mealType: toMealType(data.mealType),
    serveTime: typeof data.serveTime === "string" && /^\d{2}:\d{2}$/.test(data.serveTime) ? data.serveTime : "",
    travelMinutes: typeof data.travelMinutes === "number" ? data.travelMinutes : 45,
    guestCountConfirmed: typeof data.guestCountConfirmed === "number" ? data.guestCountConfirmed : null,
    guestCountActual: typeof data.guestCountActual === "number" ? data.guestCountActual : null,
    stockDeduction: toStockDeduction(data.stockDeduction),
    sessions: Array.isArray(data.sessions) ? data.sessions.map((s: DocumentData, i: number) => toSession(s ?? {}, i)) : [],
    closed: toClosed(data.closed),
    cancelled: data.status === "Cancelled" || data.archived === true,
    cancelReason: typeof data.cancelReason === "string" ? data.cancelReason : "",
    serviceStyle: toServiceStyle(data.serviceStyle),
    kidsCount: typeof data.kidsCount === "number" && data.kidsCount > 0 ? Math.round(data.kidsCount) : 0,
    specialMeals: toSpecialMeals(data.specialMeals),
    cancelDetail: data.status === "Cancelled" ? toCancelDetail(data.cancel, data) : null,
    lastCancel: toCancelDetail(data.lastCancel),
    lastPostponed: toPostponement(data.lastPostponed),
    cancelLoss: numOr0(data.cancelLoss),
  };
}

/** Is this booking closed (R7-9)? Closed bookings and their costs can't be edited. */
export function isClosed(b: Pick<Booking, "status" | "closed">): boolean {
  return b.status === "Closed" || b.closed !== null;
}

/** Display name of a session in the UI language. */
export function sessionName(s: Pick<MealSession, "nameTe" | "nameEn" | "id">, lang: "te" | "en"): string {
  return (lang === "te" ? s.nameTe || s.nameEn : s.nameEn || s.nameTe) || s.id;
}

/** Firestore shape of a session (no undefined values). */
export function sessionToFirestore(s: MealSession): DocumentData {
  return {
    id: s.id,
    nameTe: s.nameTe,
    nameEn: s.nameEn,
    date: s.date,
    serveTime: s.serveTime,
    mealType: s.mealType,
    packageId: s.packageId,
    guests: s.guests,
    guestCountConfirmed: s.guestCountConfirmed,
    guestCountActual: s.guestCountActual,
    travelMinutes: s.travelMinutes,
    status: s.status,
    ...(s.serviceStyle ? { serviceStyle: s.serviceStyle } : {}),
    kidsCount: Math.max(0, Math.round(s.kidsCount || 0)),
    specialMeals: specialMealsToFirestore(s.specialMeals ?? []),
  };
}

/** Live single booking (detail view: stock card and timeline refresh after server changes). */
export function subscribeBooking(id: string, onData: (b: Booking | null) => void): () => void {
  return onSnapshot(doc(db, "bookings", id), (snap) => onData(snap.exists() ? toBooking(snap.id, snap.data()) : null));
}

/**
 * Staff scope (QA fix): firestore.rules canReadBooking lets staff read only bookings whose
 * `assignedStaffIds` contains their staffId (users/{uid}.staffId), so every staff booking list must
 * ask for exactly that. Set by AuthProvider: staff → their staffId ("" = login not linked yet);
 * admin / manager → null. Mirrors BookingRepository.kt's `staffScope`.
 */
let staffScope: string | null = null;

export function setBookingStaffScope(staffId: string | null): void {
  staffScope = staffId;
}

/** The query the booking lists use (also for Refresh): staff → own assigned events; else branch / all. */
export function bookingsQuery(branchId: string | null): Query<DocumentData> {
  if (staffScope !== null) return query(bookingsCol, where("assignedStaffIds", "array-contains", staffScope || "__none__"));
  return branchId ? query(bookingsCol, where("branchId", "==", branchId)) : query(bookingsCol);
}

/** branchId === null means unfiltered (admin's "All Branches" combined view) — mirrors BookingRepository.kt's bookingsFlow(branchId). */
export function subscribeBookings(
  branchId: string | null,
  onData: (bookings: Booking[]) => void,
  onError?: (e: Error) => void,
): () => void {
  // A staff login not linked to a staff record yet has no assigned events (the query would be denied).
  if (staffScope === "") {
    onData([]);
    return () => {};
  }
  const q = bookingsQuery(branchId);
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => toBooking(d.id, d.data()));
      list.sort((a, b) => (b.eventDate?.getTime() ?? 0) - (a.eventDate?.getTime() ?? 0));
      onData(list);
    },
    (e) => onError?.(e),
  );
}

/** Saved cooking plan line (🔒 bookings/{id}/cookingPlan/{dishId}, written by saveCookingPlan). */
export interface SavedCookingLine {
  dishId: string;
  unit: string;
  quantity: number;
  guests: number;
  calc: CalcMeta;
}

export function subscribeSavedCookingPlan(
  bookingId: string,
  onData: (byDish: Record<string, SavedCookingLine>) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, "bookings", bookingId, "cookingPlan"),
    (snap) => {
      const map: Record<string, SavedCookingLine> = {};
      for (const d of snap.docs) {
        const x = d.data();
        map[d.id] = {
          dishId: d.id,
          unit: typeof x.unit === "string" ? x.unit : "",
          quantity: typeof x.quantity === "number" ? x.quantity : 0,
          guests: typeof x.guests === "number" ? x.guests : 0,
          calc: toCalcMeta(x),
        };
      }
      onData(map);
    },
    (e) => onError?.(e),
  );
}

export async function getBooking(id: string): Promise<Booking | null> {
  const snap = await getDoc(doc(db, "bookings", id));
  return snap.exists() ? toBooking(snap.id, snap.data()) : null;
}

/**
 * Mirrors BookingRepository.kt's saveBooking — branchId is stamped only on create, from the
 * caller's currently-selected branch, and is never included in the update write.
 */
export async function saveBooking(input: BookingInput, createdBy: string, branchId: string | null): Promise<string> {
  const data = {
    customerId: input.customerId,
    customerNameSnapshot: input.customerNameSnapshot,
    eventDate: input.eventDate,
    eventType: input.eventType,
    eventTypeCode: input.eventTypeCode,
    venue: input.venue,
    guestCount: input.guestCount,
    menuItemIds: input.menuItemIds,
    menuSnapshot: input.menuSnapshot,
    status: input.status,
    assignedStaffIds: input.assignedStaffIds,
    totalAmount: input.totalAmount,
    notes: input.notes,
    packageId: input.packageId,
    mealType: input.mealType,
    serveTime: input.serveTime,
    travelMinutes: input.travelMinutes,
    sessions: input.sessions.map(sessionToFirestore),
    serviceStyle: input.serviceStyle,
    kidsCount: Math.max(0, Math.round(input.kidsCount || 0)),
    specialMeals: specialMealsToFirestore(input.specialMeals),
  };
  // advancePaid is no longer written from the web: advances are payments, recorded through the
  // recordPayment callable on the event's invoice. A new booking starts at 0; edits leave it as is.
  if (!input.id) {
    if (!branchId) throw new Error("Select a branch before creating a booking");
    const ref = await addDoc(bookingsCol, {
      ...data,
      advancePaid: 0,
      branchId,
      ...createStamp(),
      createdBy,
    });
    return ref.id;
  }
  await updateDoc(doc(db, "bookings", input.id), { ...data, ...updateStamp() });
  return input.id;
}

// ---------- R7-7 live guest count and during-event extras (🔒 server-written subcollections) ----------

export interface GuestLogEntry {
  id: string;
  sessionId: string;
  count: number;
  note: string;
  at: Date | null;
  byName: string;
}

export function subscribeGuestLog(bookingId: string, onData: (rows: GuestLogEntry[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, "bookings", bookingId, "guestLog"),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            const by = (x.by ?? {}) as DocumentData;
            return {
              id: d.id,
              sessionId: typeof x.sessionId === "string" ? x.sessionId : "",
              count: typeof x.count === "number" ? x.count : 0,
              note: typeof x.note === "string" ? x.note : "",
              at: x.at?.toDate ? x.at.toDate() : null,
              byName: typeof by.name === "string" ? by.name : typeof x.by === "string" ? x.by : "",
            };
          })
          .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)),
      ),
    (e) => onError?.(e),
  );
}

export type ExtraStatus = "pending" | "approved" | "rejected";

export interface EventExtra {
  id: string;
  sessionId: string;
  item: string;
  qty: number;
  rate: number;
  /** 🔒 server: qty × rate */
  amount: number;
  customerName: string;
  customerPhone: string;
  note: string;
  addedByName: string;
  at: Date | null;
  status: ExtraStatus;
  decisionReason: string;
}

export function subscribeEventExtras(bookingId: string, onData: (rows: EventExtra[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, "bookings", bookingId, "eventExtras"),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            const ap = (x.customerApprovedBy ?? {}) as DocumentData;
            const by = (x.addedBy ?? {}) as DocumentData;
            const s = (v: unknown) => (typeof v === "string" ? v : "");
            const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
            return {
              id: d.id,
              sessionId: s(x.sessionId),
              item: s(x.item),
              qty: n(x.qty),
              rate: n(x.rate),
              amount: n(x.amount),
              customerName: typeof x.customerApprovedBy === "string" ? x.customerApprovedBy : s(ap.name),
              customerPhone: s(ap.phone),
              note: s(x.note),
              addedByName: s(by.name),
              at: x.at?.toDate ? x.at.toDate() : null,
              status: (["pending", "approved", "rejected"].includes(x.status) ? x.status : "pending") as ExtraStatus,
              decisionReason: s(x.decisionReason),
            };
          })
          .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)),
      ),
    (e) => onError?.(e),
  );
}
