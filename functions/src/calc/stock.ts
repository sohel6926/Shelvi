/**
 * Event stock deduction lines (api-contract Round 6 A). Quantities = §6 grocery suggestion (or a manual quantity);
 * stock never goes below 0 — the missing part is `shortBy`. Pure.
 */
import { CalcError, requireNonNeg, round2 } from "./util";
import { EventType, suggest, Unit } from "./cooking";

export interface GroceryForStock {
  groceryItemId: string;
  inventoryItemId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  per100: number;
  category?: string;
  group?: string;
}

export interface StockLine {
  groceryItemId: string;
  inventoryItemId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  category: string;
  group: string;
  quantity: number;
  autoValue: number;
  /** quantity that could not be taken because stock ran out */
  shortBy: number;
  /** quantity actually taken out of stock (quantity − shortBy) */
  deducted: number;
}

export interface SkippedLine {
  groceryItemId: string;
  nameTe: string;
  nameEn: string;
  reason: "not-linked" | "no-stock-item" | "bad-unit";
}

const UNITS: Unit[] = ["kg", "L", "pcs"];

/**
 * stock: current quantityInStock per inventoryItemId (missing = item does not exist).
 * manual: groceryItemId → typed quantity (≥ 0). Several grocery items on one stock item share its stock in order.
 * guests: one number, or one per meal session (quantities are summed per session).
 */
export function eventStockLines(
  groceries: GroceryForStock[],
  eventType: EventType,
  guests: number | number[],
  stock: Record<string, number>,
  manual: Record<string, number> = {},
): { items: StockLine[]; skipped: SkippedLine[] } {
  for (const [k, v] of Object.entries(manual)) {
    requireNonNeg(`manual quantity for ${k}`, v);
    if (!groceries.some((g) => g.groceryItemId === k)) throw new CalcError(`unknown grocery item ${k}`);
  }
  const left: Record<string, number> = { ...stock };
  const items: StockLine[] = [];
  const skipped: SkippedLine[] = [];
  for (const g of groceries) {
    const base = { groceryItemId: g.groceryItemId, nameTe: g.nameTe, nameEn: g.nameEn };
    if (!g.inventoryItemId) {
      skipped.push({ ...base, reason: "not-linked" });
      continue;
    }
    if (!(g.inventoryItemId in left)) {
      skipped.push({ ...base, reason: "no-stock-item" });
      continue;
    }
    if (!UNITS.includes(g.unit as Unit) || !(g.per100 > 0)) {
      skipped.push({ ...base, reason: "bad-unit" });
      continue;
    }
    // R7-5: a booking with sessions takes the Σ of each session's §6 quantity
    const parts = Array.isArray(guests) ? guests : [guests];
    const autoValue = round2(parts.reduce((a, n) => a + suggest(g.per100, g.unit as Unit, eventType, n), 0));
    const quantity = g.groceryItemId in manual ? round2(manual[g.groceryItemId]) : autoValue;
    const available = Math.max(0, left[g.inventoryItemId]);
    const deducted = round2(Math.min(quantity, available));
    left[g.inventoryItemId] = round2(available - deducted);
    items.push({ ...base, inventoryItemId: g.inventoryItemId, unit: g.unit, category: g.category ?? "", group: g.group ?? "", quantity, autoValue, shortBy: round2(quantity - deducted), deducted });
  }
  return { items, skipped };
}
