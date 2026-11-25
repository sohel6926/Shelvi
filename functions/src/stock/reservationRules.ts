/**
 * Module 2g (18 Nov 2026) — stock reserved for confirmed events. Pure, no Firestore.
 * Spec: Blueprint "reserve stock against confirmed events; available = on hand − reserved".
 *
 * Nothing moves in the store: quantityInStock stays what is physically there. A reservation only says "this much of
 * what is on the shelf is already promised to that event", so the buying list of another event does not count the
 * same stock twice. Earlier events are served first; an event that finds too little is "short" by the rest.
 * Stock is really taken out later, when the event is completed (event stock deduction).
 */
import { asObj, Doc } from "../shared/coerce";

/** settings/business.stockReserve */
export interface StockReserveConfig {
  on: boolean;
  /** reserve for events in the next N days (1–90, default 30) */
  days: number;
}

export const DEFAULT_STOCK_RESERVE: StockReserveConfig = { on: true, days: 30 };
const validDays = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 90;

export function normalizeStockReserve(raw: unknown): StockReserveConfig {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { on: o.on === undefined ? DEFAULT_STOCK_RESERVE.on : o.on === true, days: validDays(o.days) ? o.days : DEFAULT_STOCK_RESERVE.days };
}

export function parseStockReservePatch(v: unknown): { ok: true; value: StockReserveConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "stockReserve must be an object." };
  const o = v as Record<string, unknown>;
  if (typeof o.on !== "boolean") return { ok: false, error: "stockReserve.on must be true or false." };
  if (!validDays(o.days)) return { ok: false, error: "stockReserve.days must be a whole number from 1 to 90." };
  return { ok: true, value: { on: o.on, days: o.days } };
}

/** Statuses whose stock is promised: the customer has confirmed, and the stock has not been taken out yet. */
export const RESERVING_STATUSES = ["Confirmed", "InProgress"];

/** Does this booking hold stock? Confirmed / in progress, not archived, and no live stock deduction yet. */
export function holdsStock(booking: Doc | undefined): boolean {
  if (!booking || booking.archived === true || booking.isDeleted === true) return false;
  if (!RESERVING_STATUSES.includes(typeof booking.status === "string" ? booking.status : "")) return false;
  const sd = asObj(booking.stockDeduction);
  return !booking.stockDeduction || sd.reversed === true;
}

/** The booking fields that change what is reserved — the trigger recomputes only when one of them changed. */
export function reservationInputsChanged(before: Doc | undefined, after: Doc | undefined): boolean {
  const key = (b: Doc | undefined) =>
    b
      ? JSON.stringify([holdsStock(b), String(asObj(b.eventDate)._seconds ?? asObj(b.eventDate).seconds ?? b.eventDate ?? ""), b.guestCount ?? null, b.guestCountConfirmed ?? null, b.menuPackageId ?? null, b.quotationId ?? null, b.eventTypeCode ?? null, b.sessions ?? null])
      : "";
  if (!holdsStock(before) && !holdsStock(after)) return false;
  return key(before) !== key(after);
}

export interface EventNeed {
  bookingId: string;
  /** YYYY-MM-DD of the event */
  day: string;
  /** inventory item → quantity the event needs (before cleaning loss) */
  needs: Record<string, number>;
}

export interface ReservedLine {
  inventoryItemId: string;
  needed: number;
  reserved: number;
  short: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Shares the stock out: events in date order (ties by booking id), each takes what it needs from what is left.
 * Returns the lines per event and, per item, how much is reserved in total.
 */
export function allocate(events: EventNeed[], stock: Record<string, number>): { byEvent: Record<string, ReservedLine[]>; reserved: Record<string, number> } {
  const left: Record<string, number> = {};
  const reserved: Record<string, number> = {};
  const byEvent: Record<string, ReservedLine[]> = {};
  const ordered = [...events].sort((a, b) => a.day.localeCompare(b.day) || a.bookingId.localeCompare(b.bookingId));
  for (const e of ordered) {
    const lines: ReservedLine[] = [];
    for (const id of Object.keys(e.needs).sort()) {
      const needed = r3(e.needs[id]);
      if (!(needed > 0)) continue;
      if (!(id in left)) left[id] = Math.max(0, stock[id] ?? 0);
      const take = r3(Math.min(needed, left[id]));
      left[id] = r3(left[id] - take);
      if (take > 0) reserved[id] = r3((reserved[id] ?? 0) + take);
      lines.push({ inventoryItemId: id, needed, reserved: take, short: r3(needed - take) });
    }
    byEvent[e.bookingId] = lines;
  }
  return { byEvent, reserved };
}

/**
 * Stock an event may count on: what is on the shelf, minus what is reserved for OTHER events
 * (its own reservation stays available to it). Never below 0.
 */
export function freeFor(inStock: number, reservedTotal: number, ownReserved: number): number {
  return r3(Math.max(0, inStock - Math.max(0, reservedTotal - ownReserved)));
}

/** X8: did the quantity that can be reserved change? (reservedQty itself changing is our own write — ignored.) */
export function stockChanged(before: Doc | undefined, after: Doc | undefined): boolean {
  const q = (d: Doc | undefined) => (d && typeof d.quantityInStock === "number" ? d.quantityInStock : 0);
  const e = (d: Doc | undefined) => (d && typeof d.expiredQty === "number" ? d.expiredQty : 0);
  if (!before && !after) return false;
  return q(before) !== q(after) || e(before) !== e(after);
}

/** X8: run the recompute now? Stock changed since the last run, or the last run is an hour old. */
export function shouldRecompute(dirty: boolean, lastRunMs: number, nowMs: number): boolean {
  return dirty || nowMs - lastRunMs >= 60 * 60 * 1000;
}
