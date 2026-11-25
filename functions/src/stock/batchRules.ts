/**
 * Module 2d (18 Nov 2026) — batches with an expiry date and FEFO (first expiry, first out). Pure, no Firestore.
 * Spec: CMF 04 "batch/lot required, expiry required, FEFO policy"; Blueprint "batch / lot / expiry, FEFO".
 *
 * Model: only items marked trackExpiry keep batches. Stock that came in without an expiry date is "untracked" and is
 * always used before any batch (it is the older stock). So the one rule after EVERY stock movement is:
 *   the batches together may never hold more than the item has in stock —
 *   when they do, the excess is taken out of the batches, earliest expiry first.
 * That rule does not depend on the order in which movements are processed, and running it twice changes nothing.
 */
export interface Batch {
  id: string;
  qty: number;
  /** YYYY-MM-DD, or "" when the batch has no expiry date */
  expiryDay: string;
  receivedAtMs: number;
  /** Module 5d (food safety): the batch is on hold — it must not be planned with, issued or sold until someone authorized releases or discards it */
  hold?: boolean;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A real calendar day YYYY-MM-DD (2000–2100). */
export function isExpiryDay(v: unknown): v is string {
  if (typeof v !== "string" || !DAY_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** FEFO order: dated batches by expiry (earliest first), then undated ones; ties by arrival, then id. */
export function fefoOrder(batches: readonly Batch[]): Batch[] {
  return [...batches].sort((a, b) => {
    // a held batch is used last: stock that leaves is taken from batches that may be used
    if (!!a.hold !== !!b.hold) return a.hold ? 1 : -1;
    if (!!a.expiryDay !== !!b.expiryDay) return a.expiryDay ? -1 : 1;
    return a.expiryDay.localeCompare(b.expiryDay) || a.receivedAtMs - b.receivedAtMs || a.id.localeCompare(b.id);
  });
}

export interface BatchChange {
  id: string;
  /** quantity left in the batch after the change */
  qty: number;
  taken: number;
}

/**
 * Keep the batches within the stock: returns the batches that must be reduced (FEFO) so that their total is at most
 * `stockNow`. Empty list when nothing needs to change.
 */
export function reconcileBatches(stockNow: number, batches: readonly Batch[]): BatchChange[] {
  const live = batches.filter((b) => b.qty > 0);
  let excess = r3(live.reduce((s, b) => s + b.qty, 0) - Math.max(0, stockNow));
  const out: BatchChange[] = [];
  for (const b of fefoOrder(live)) {
    if (excess <= 0) break;
    const take = Math.min(b.qty, excess);
    out.push({ id: b.id, qty: r3(b.qty - take), taken: r3(take) });
    excess = r3(excess - take);
  }
  return out;
}

/** Earliest expiry among batches that still hold stock ("" when none has a date). */
export function nearestExpiry(batches: readonly Batch[]): string {
  return fefoOrder(batches.filter((b) => b.qty > 0 && b.expiryDay))[0]?.expiryDay ?? "";
}

export type ExpiryStatus = "none" | "ok" | "soon" | "expired";

/** Whole days from `today` to `day` (negative = already past); null when either is not a day. */
export function daysTo(day: string, today: string): number | null {
  if (!isExpiryDay(day) || !isExpiryDay(today)) return null;
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** expired = the day has passed; soon = within `alertDays` (today counts); ok = later; none = no date. */
export function expiryStatus(expiryDay: string, today: string, alertDays: number): ExpiryStatus {
  const d = daysTo(expiryDay, today);
  if (d === null) return "none";
  if (d < 0) return "expired";
  return d <= alertDays ? "soon" : "ok";
}

/** settings/business.expiryAlert */
export interface ExpiryAlertConfig {
  on: boolean;
  /** tell the owner this many days before the date (1–90, default 7) */
  days: number;
}

export const DEFAULT_EXPIRY_ALERT: ExpiryAlertConfig = { on: true, days: 7 };
const validDays = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 90;

export function normalizeExpiryAlert(raw: unknown): ExpiryAlertConfig {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { on: o.on === undefined ? DEFAULT_EXPIRY_ALERT.on : o.on === true, days: validDays(o.days) ? o.days : DEFAULT_EXPIRY_ALERT.days };
}

export function parseExpiryAlertPatch(v: unknown): { ok: true; value: ExpiryAlertConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "expiryAlert must be an object." };
  const o = v as Record<string, unknown>;
  if (typeof o.on !== "boolean") return { ok: false, error: "expiryAlert.on must be true or false." };
  if (!validDays(o.days)) return { ok: false, error: "expiryAlert.days must be a whole number from 1 to 90." };
  return { ok: true, value: { on: o.on, days: o.days } };
}

/**
 * The expiry date a purchase gives each stock item: the earliest valid `expiryDay` among its lines for that item
 * (and that line's batchNo). Items whose lines carry no date are left out.
 */
export function purchaseExpiryByItem(items: unknown): Record<string, { expiryDay: string; batchNo: string }> {
  const out: Record<string, { expiryDay: string; batchNo: string }> = {};
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    const it = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const id = typeof it.inventoryItemId === "string" ? it.inventoryItemId : "";
    if (!id || !isExpiryDay(it.expiryDay)) continue;
    if (!out[id] || it.expiryDay < out[id].expiryDay) out[id] = { expiryDay: it.expiryDay, batchNo: typeof it.batchNo === "string" ? it.batchNo.trim().slice(0, 60) : "" };
  }
  return out;
}

export interface ExpiryRow {
  name: string;
  expiryDay: string;
  status: ExpiryStatus;
}

/** Text of the daily notice: expired items first, then the ones close to their date. null when there is nothing. */
export function expiryNoticeText(rows: ExpiryRow[], days: number): { te: string; en: string } | null {
  const expired = rows.filter((r) => r.status === "expired").sort((a, b) => a.expiryDay.localeCompare(b.expiryDay));
  const soon = rows.filter((r) => r.status === "soon").sort((a, b) => a.expiryDay.localeCompare(b.expiryDay));
  if (!expired.length && !soon.length) return null;
  const list = (rs: ExpiryRow[]) => rs.slice(0, 8).map((r) => `${r.name} (${r.expiryDay})`).join(", ") + (rs.length > 8 ? ` +${rs.length - 8}` : "");
  const te = [expired.length ? `గడువు దాటినవి ${expired.length}: ${list(expired)}` : "", soon.length ? `${days} రోజుల్లో గడువు ముగిసేవి ${soon.length}: ${list(soon)}` : ""].filter(Boolean).join(" · ");
  const en = [expired.length ? `Expired ${expired.length}: ${list(expired)}` : "", soon.length ? `Expiring within ${days} days ${soon.length}: ${list(soon)}` : ""].filter(Boolean).join(" · ");
  return { te, en };
}

/**
 * X7 + Module 5d: stock that is on the shelf but must not be planned with — batches whose date has passed (before
 * `today`) and batches on a food-safety hold. Kept in inventory.expiredQty, which every reader already subtracts.
 */
export function expiredQty(batches: readonly Batch[], today: string): number {
  return r3(batches.filter((b) => b.qty > 0 && (b.hold === true || (!!b.expiryDay && isExpiryDay(b.expiryDay) && b.expiryDay < today))).reduce((s, b) => s + b.qty, 0));
}

/** Module 5d: quantity on a food-safety hold (kept in inventory.heldQty). */
export function heldQty(batches: readonly Batch[]): number {
  return r3(batches.filter((b) => b.qty > 0 && b.hold === true).reduce((s, b) => s + b.qty, 0));
}

/** Module 5d: may a hold be decided (released / discarded) by this person? Not by the one who placed it, except the owner. */
export function holdDecisionProblem(batch: { exists: boolean; hold: boolean; heldBy: string; qty: number }, decider: { uid: string; isOwner: boolean; mayApprove: boolean }): "" | "no-batch" | "not-held" | "not-allowed" | "own-hold" {
  if (!batch.exists) return "no-batch";
  if (!batch.hold) return "not-held";
  if (!decider.mayApprove) return "not-allowed";
  if (batch.heldBy === decider.uid && !decider.isOwner) return "own-hold";
  return "";
}

export interface BatchUse {
  movementId: string;
  day: string;
  type: string;
  reason: string;
  taken: number;
  bookingId: string;
}
/** Module 5d: where a batch went — every movement that took quantity from it (movement.batchesUsed), newest first. */
export function traceBatchUses(batchId: string, movements: { id: string; data: Record<string, unknown>; day: string }[]): { uses: BatchUse[]; bookingIds: string[]; totalTaken: number } {
  const uses: BatchUse[] = [];
  for (const m of movements) {
    const used = Array.isArray(m.data.batchesUsed) ? (m.data.batchesUsed as Record<string, unknown>[]) : [];
    const taken = r3(used.filter((u) => u && u.batchId === batchId).reduce((s, u) => s + (typeof u.taken === "number" ? u.taken : 0), 0));
    if (taken <= 0) continue;
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    uses.push({ movementId: m.id, day: m.day, type: s(m.data.type), reason: s(m.data.reason), taken, bookingId: s(m.data.relatedBookingId) || s(m.data.bookingId) });
  }
  uses.sort((a, b) => b.day.localeCompare(a.day));
  return { uses, bookingIds: [...new Set(uses.map((u) => u.bookingId).filter(Boolean))], totalTaken: r3(uses.reduce((s, u) => s + u.taken, 0)) };
}

/** X7: stock that may be planned with or reserved: on hand minus expired (never below 0). */
export function usableStock(quantityInStock: number, expired: number): number {
  return r3(Math.max(0, quantityInStock - Math.max(0, expired)));
}
