/** Round 10 calculations (docs/calc-spec.md §20–§25). Pure. */
import { CalcError, requireFinite, requireNonNeg, round2 } from "./util";
import { suggestedPrice } from "./pricing";

// ---------------------------------------------------------------- §20 staff advances --------------------------------

export interface AdvanceIn {
  id: string;
  amount: number;
  /** YYYY-MM the recovery starts (default: the month after the advance) */
  recoverMonth: string;
  /** YYYY-MM-DD the advance was given */
  date: string;
  status: "Open" | "Recovered" | "Cancelled" | "legacy";
  /** recoveries already booked on payslips */
  recoveries: { month: string; amount: number }[];
}

export interface AdvanceTake {
  id: string;
  balanceBefore: number;
  take: number;
  balanceAfter: number;
}

/**
 * §20 — advances recovered from one month's pay.
 *   due      = not Cancelled; recoverMonth ≤ month; balanceBefore = amount − Σ recoveries of earlier months > 0
 *              (legacy advances without a status: only in the month of their date, never carried)
 *   order    = recoverMonth, date, id (oldest first)
 *   cut      = min(Σ balanceBefore, max(0, payBeforeAdvances))   — the pay never goes below 0
 *   carry    = Σ balanceAfter of non-legacy advances (recovered from next month's pay)
 */
export function advanceRecovery(payBeforeAdvances: number, advances: AdvanceIn[], month: string): { cut: number; takes: AdvanceTake[]; carry: number; legacyUnrecovered: number } {
  requireFinite("pay", payBeforeAdvances);
  let left = round2(Math.max(0, payBeforeAdvances));
  const due = advances
    .filter((a) => a.status !== "Cancelled")
    .filter((a) => (a.status === "legacy" ? a.date.slice(0, 7) === month : a.recoverMonth <= month))
    .map((a) => {
      requireNonNeg(`advance ${a.id} amount`, a.amount);
      const earlier = a.status === "legacy" ? 0 : a.recoveries.filter((r) => r.month < month).reduce((s, r) => s + Math.max(0, r.amount), 0);
      return { a, balanceBefore: round2(Math.max(0, a.amount - earlier)) };
    })
    .filter((x) => x.balanceBefore > 0.005)
    .sort((x, y) => x.a.recoverMonth.localeCompare(y.a.recoverMonth) || x.a.date.localeCompare(y.a.date) || x.a.id.localeCompare(y.a.id));
  const takes: AdvanceTake[] = [];
  let carry = 0;
  let legacyUnrecovered = 0;
  for (const { a, balanceBefore } of due) {
    const take = round2(Math.min(balanceBefore, left));
    left = round2(left - take);
    const balanceAfter = round2(balanceBefore - take);
    takes.push({ id: a.id, balanceBefore, take, balanceAfter });
    if (a.status === "legacy") legacyUnrecovered = round2(legacyUnrecovered + balanceAfter);
    else carry = round2(carry + balanceAfter);
  }
  return { cut: round2(takes.reduce((s, t) => s + t.take, 0)), takes, carry, legacyUnrecovered };
}

/** Next month YYYY-MM (default recoverMonth of a new advance). */
export function nextMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new CalcError("month must be YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Outstanding balance of each advance and in total (staff page list). */
export function advanceBalances(advances: AdvanceIn[]): { id: string; recovered: number; balance: number }[] {
  return advances.map((a) => {
    const recovered = round2(a.recoveries.reduce((s, r) => s + Math.max(0, r.amount), 0));
    const balance = a.status === "Cancelled" || a.status === "legacy" ? 0 : round2(Math.max(0, a.amount - recovered));
    return { id: a.id, recovered, balance };
  });
}

// ---------------------------------------------------------------- §21 kids plates & special meals -------------------

export const SPECIAL_MEAL_TYPES = ["no-onion-garlic", "jain", "allergy", "diabetic", "other"] as const;
export type SpecialMealType = (typeof SPECIAL_MEAL_TYPES)[number];
export interface SpecialMeal {
  type: SpecialMealType;
  count: number;
  note?: string;
  /** owner-set extra per special plate (0 / missing = no extra; the plate is already in `plates`) */
  extraPerPlate?: number;
}

/**
 * §21 — quote lines for kids and special meals.
 *   kids   : kidsCount plates on top of `plates`, at the package kidsPrice (no kidsPrice = not offered → error)
 *   special: counted inside `plates` (already charged at the package price); Σ counts ≤ plates;
 *            one line per type: qty = count, rate = extraPerPlate (0 = included, shown for the kitchen / customer)
 */
export function kidsSpecialLines(p: { plates: number; kidsPrice: number | null }, q: { kidsCount?: number; specialMeals?: SpecialMeal[] }): { item: string; qty: number; rate: number; amount: number }[] {
  const lines: { item: string; qty: number; rate: number; amount: number }[] = [];
  const kids = q.kidsCount ?? 0;
  if (!Number.isInteger(kids) || kids < 0) throw new CalcError("kidsCount must be a whole number ≥ 0");
  if (kids > 0) {
    if (p.kidsPrice === null) throw new CalcError("this menu has no kids price — kids plates are not offered");
    requireNonNeg("kidsPrice", p.kidsPrice);
    lines.push({ item: "kids", qty: kids, rate: p.kidsPrice, amount: round2(kids * p.kidsPrice) });
  }
  const specials = q.specialMeals ?? [];
  const seen = new Set<string>();
  let total = 0;
  for (const s of specials) {
    if (!(SPECIAL_MEAL_TYPES as readonly string[]).includes(s.type)) throw new CalcError(`special meal type ${s.type} is not valid`);
    if (s.type !== "other" && seen.has(s.type)) throw new CalcError(`special meal ${s.type} is listed twice`);
    seen.add(s.type);
    if (!Number.isInteger(s.count) || s.count < 1) throw new CalcError(`special meal ${s.type}: count must be a whole number ≥ 1`);
    const rate = s.extraPerPlate ?? 0;
    requireNonNeg(`special meal ${s.type} extraPerPlate`, rate);
    total += s.count;
    lines.push({ item: `special:${s.type}`, qty: s.count, rate, amount: round2(s.count * rate) });
  }
  if (total > p.plates) throw new CalcError("special meals cannot be more than the plates");
  return lines;
}

// ---------------------------------------------------------------- §22 lunch boxes -----------------------------------

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** ISO weekday 1 (Mon) … 7 (Sun) of a YYYY-MM-DD day. */
function isoDay(day: string): number {
  const d = new Date(`${day}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export interface LunchBoxOrderIn {
  id: string;
  /** one-off order day */
  date?: string;
  /** recurring: weekdays (mon…sat) between startDate and endDate (endDate optional) */
  days?: string[];
  startDate?: string;
  endDate?: string;
  count: number;
  pricePerBox: number;
  status: string;
}

/** §22 — does the order deliver on this day, and how many boxes are planned. */
export function lunchBoxesOn(o: LunchBoxOrderIn, day: string): number {
  if (["cancelled", "paused", "Cancelled"].includes(o.status)) return 0;
  if (o.date) return o.date === day ? Math.max(0, o.count) : 0;
  if (!o.days?.length) return 0;
  if (o.startDate && day < o.startDate) return 0;
  if (o.endDate && day > o.endDate) return 0;
  const wd = WEEKDAYS[isoDay(day) - 1];
  return o.days.includes(wd) ? Math.max(0, o.count) : 0;
}

/**
 * §22 — month invoice lines of one customer: boxes actually delivered (delivery ticks) × pricePerBox, one line per
 * order and price. Days without a tick are not billed.
 */
export function lunchBoxMonthLines(orders: LunchBoxOrderIn[], deliveries: Record<string, Record<string, number>>, month: string): { orderId: string; boxes: number; days: number; rate: number; amount: number }[] {
  const out: { orderId: string; boxes: number; days: number; rate: number; amount: number }[] = [];
  for (const o of orders) {
    requireNonNeg(`order ${o.id} pricePerBox`, o.pricePerBox);
    const d = deliveries[o.id] ?? {};
    let boxes = 0;
    let days = 0;
    for (const [day, n] of Object.entries(d)) {
      if (day.slice(0, 7) !== month) continue;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new CalcError(`order ${o.id} delivery ${day} must be a whole number ≥ 0`);
      if (n > 0) {
        boxes += n;
        days += 1;
      }
    }
    if (boxes > 0) out.push({ orderId: o.id, boxes, days, rate: o.pricePerBox, amount: round2(boxes * o.pricePerBox) });
  }
  return out;
}

// ---------------------------------------------------------------- §23 customer statement ----------------------------

export interface StatementEntry {
  day: string;
  kind: "booking" | "invoice" | "payment" | "refund" | "cancellation-charge";
  ref: string;
  /** + raises what the customer owes (invoice), − lowers it (payment); refunds are negative payments → + */
  amount: number;
  te: string;
  en: string;
}

/**
 * §23 — opening balance (everything before `from`), then each entry in date order with the running balance;
 * balance = Σ invoices (cancelled ones count only their cancellation charge) − Σ payments (refunds negative).
 */
export function statement(entries: StatementEntry[], from: string | null, to: string | null): { opening: number; lines: (StatementEntry & { balance: number })[]; closing: number; invoiced: number; paid: number } {
  const order: Record<string, number> = { booking: 0, invoice: 1, "cancellation-charge": 2, payment: 3, refund: 4 };
  const sorted = [...entries].sort((a, b) => a.day.localeCompare(b.day) || order[a.kind] - order[b.kind] || a.ref.localeCompare(b.ref));
  let opening = 0;
  let bal = 0;
  let invoiced = 0;
  let paid = 0;
  const lines: (StatementEntry & { balance: number })[] = [];
  for (const e of sorted) {
    requireFinite(`statement ${e.ref} amount`, e.amount);
    if (from && e.day < from) {
      opening = round2(opening + e.amount);
      bal = opening;
      continue;
    }
    if (to && e.day > to) continue;
    bal = round2(bal + e.amount);
    if (e.kind === "invoice" || e.kind === "cancellation-charge") invoiced = round2(invoiced + e.amount);
    if (e.kind === "payment" || e.kind === "refund") paid = round2(paid - e.amount);
    lines.push({ ...e, balance: bal });
  }
  return { opening, lines, closing: bal, invoiced, paid };
}

// ---------------------------------------------------------------- §24 suggested package price ----------------------

export type PriceBand = "red" | "amber" | "green" | "unknown";

/** §24 colour band of a margin %: red < 15, amber 15–25, green ≥ 25. */
export function priceBand(marginPct: number | null): PriceBand {
  if (marginPct === null || marginPct < 15) return "red";
  return marginPct < 25 ? "amber" : "green";
}

/**
 * §24 — plate cost and suggested price of a menu package.
 *   food/plate   = Σ ingredient qty × latest rate ÷ guests (items without a rate are listed, not guessed)
 *   plateCost    = round2(food/plate + labourPerPlate + overheadPerPlate)
 *   suggested    = suggestedPrice(plateCost, targetMarginPct / 100)   (§3, rounded up to ₹5)
 *   marginPct    = round2((price − cost) / price × 100); band per priceBand
 *   coveragePct  = round1(priced lines ÷ costed lines (qty > 0) × 100)
 *   Any costed line without a rate (or no costed lines at all) → band "unknown" (grey), marginPct and suggested
 *   price null — a partly priced cost would look cheap and show a false green. knownPlateCost = the priced part.
 */
export function packagePriceSuggestion(p: { guests: number; ingredients: { id: string; qty: number; rate: number | null }[]; labourPerPlate: number; overheadPerPlate: number; currentPrice: number; targetMarginPct: number }): { foodPerPlate: number; plateCost: number | null; knownPlateCost: number; suggestedPrice: number | null; marginPct: number | null; band: PriceBand; missingRates: string[]; costedLines: number; pricedLines: number; coveragePct: number | null } {
  if (!Number.isInteger(p.guests) || p.guests < 1) throw new CalcError("guests must be a whole number ≥ 1");
  requireNonNeg("labourPerPlate", p.labourPerPlate);
  requireNonNeg("overheadPerPlate", p.overheadPerPlate);
  requireNonNeg("currentPrice", p.currentPrice);
  requireFinite("targetMarginPct", p.targetMarginPct);
  if (p.targetMarginPct < 0 || p.targetMarginPct >= 100) throw new CalcError("targetMarginPct must be 0–99");
  let food = 0;
  let costedLines = 0;
  let pricedLines = 0;
  const missingRates: string[] = [];
  for (const i of p.ingredients) {
    requireNonNeg(`ingredient ${i.id} qty`, i.qty);
    if (!(i.qty > 0)) continue;
    costedLines++;
    if (i.rate === null || !(i.rate > 0)) {
      missingRates.push(i.id);
      continue;
    }
    pricedLines++;
    food += i.qty * i.rate;
  }
  const foodPerPlate = round2(food / p.guests);
  const knownPlateCost = round2(foodPerPlate + p.labourPerPlate + p.overheadPerPlate);
  const coveragePct = costedLines ? Math.round((pricedLines / costedLines) * 1000) / 10 : null;
  if (!costedLines || missingRates.length) {
    return { foodPerPlate, plateCost: null, knownPlateCost, suggestedPrice: null, marginPct: null, band: "unknown", missingRates, costedLines, pricedLines, coveragePct };
  }
  const marginPct = p.currentPrice > 0 ? round2(((p.currentPrice - knownPlateCost) / p.currentPrice) * 100) : null;
  return { foodPerPlate, plateCost: knownPlateCost, knownPlateCost, suggestedPrice: suggestedPrice(knownPlateCost, p.targetMarginPct / 100), marginPct, band: priceBand(marginPct), missingRates, costedLines, pricedLines, coveragePct };
}

// ---------------------------------------------------------------- §25 vendor rates, ratings, shifts -----------------

export interface RateRow {
  itemKey: string;
  vendorId: string;
  vendorName: string;
  rate: number;
  day: string;
}

/** §25 — per item: last rate per vendor, the previous rate of that vendor, change %, cheapest last rate marked. */
export function vendorRateTable(rows: RateRow[]): Record<string, { vendorId: string; vendorName: string; lastRate: number; lastDay: string; previousRate: number | null; changePct: number | null; cheapest: boolean }[]> {
  const byItem = new Map<string, Map<string, RateRow[]>>();
  for (const r of rows) {
    if (!(r.rate > 0)) continue;
    const v = byItem.get(r.itemKey) ?? new Map<string, RateRow[]>();
    const key = r.vendorId || r.vendorName;
    v.set(key, [...(v.get(key) ?? []), r]);
    byItem.set(r.itemKey, v);
  }
  const out: Record<string, { vendorId: string; vendorName: string; lastRate: number; lastDay: string; previousRate: number | null; changePct: number | null; cheapest: boolean }[]> = {};
  for (const [item, vendors] of byItem) {
    const list = [...vendors.values()].map((rs) => {
      const s = [...rs].sort((a, b) => b.day.localeCompare(a.day));
      const last = s[0];
      const prev = s[1] ?? null;
      return {
        vendorId: last.vendorId,
        vendorName: last.vendorName,
        lastRate: round2(last.rate),
        lastDay: last.day,
        previousRate: prev ? round2(prev.rate) : null,
        changePct: prev ? round2(((last.rate - prev.rate) / prev.rate) * 100) : null,
        cheapest: false,
      };
    });
    const min = Math.min(...list.map((x) => x.lastRate));
    list.forEach((x) => (x.cheapest = x.lastRate === min));
    list.sort((a, b) => a.lastRate - b.lastRate || a.vendorName.localeCompare(b.vendorName));
    out[item] = list;
  }
  return out;
}

/** §25 — month average of 1–5 star ratings (1 decimal), count. */
export function ratingAverage(stars: number[]): { avg: number | null; count: number } {
  for (const s of stars) if (!Number.isInteger(s) || s < 1 || s > 5) throw new CalcError("stars must be a whole number 1–5");
  if (!stars.length) return { avg: null, count: 0 };
  return { avg: Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10, count: stars.length };
}

export const SHIFT_ROLES = ["cook", "helper", "server", "driver", "supervisor"] as const;

/** §25 — a shift's hours (end after start; overnight not allowed) and overlap with the staff member's other shifts. */
export function shiftHours(startMs: number, endMs: number): number {
  requireFinite("start", startMs);
  requireFinite("end", endMs);
  if (endMs <= startMs) throw new CalcError("shift end must be after start");
  const h = (endMs - startMs) / 3600000;
  if (h > 16) throw new CalcError("a shift cannot be longer than 16 hours");
  return round2(h);
}

export function overlaps(a: { start: number; end: number }, others: { id: string; start: number; end: number }[]): string[] {
  return others.filter((o) => o.start < a.end && a.start < o.end).map((o) => o.id);
}
