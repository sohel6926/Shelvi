/**
 * Pure: R10-4 / R10-6 purchase line rates (latest per item, per vendor).
 * Purchase lines are matched to the grocery master the way the forms save them:
 *   web: { description, unit "Kg", unitPrice, inventoryItemId, groceryItemId }; Android: same without groceryItemId;
 *   "other" items: description only. Match order: groceryItemId → inventoryItemId → name (roman / English / Telugu /
 *   aliases). A matched rate is converted to the grocery item's unit (Gram → kg ×1000, ML → L ×1000, Dozen → pcs ÷12);
 *   a unit that cannot be converted (Packet, Bag…) stays a separate row "<item> | <unit>".
 */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { dayOfValue } from "../shared/istDate";
import { isLiveRecord } from "../shared/costTarget";
import { purchaseItemKey } from "../agents/helpers";
import { RateRow } from "../calc/round10";
import { normUnit, rateInUnit } from "../shared/units";
import { itemRate, normalizePacks, Pack } from "../shared/itemUnits";

export { normUnit, rateInUnit };

export interface GroceryRef {
  id: string;
  inventoryItemId: string;
  unit: string;
  name: string;
  names: string[];
  /** Module 2a: this item's own pack sizes in its unit ("1 Bag = 25 kg") */
  packs: Pack[];
}

export function normName(s: string): string {
  return s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function groceryRefs(docs: { id: string; data: Doc }[]): GroceryRef[] {
  return docs
    .filter((d) => d.data.archived !== true && d.data.isDeleted !== true)
    .map((d) => {
      const raw = [asStr(d.data.nameRoman), asStr(d.data.nameEn), asStr(d.data.nameTe), ...asArr(d.data.aliases).map(String)];
      return { id: d.id, inventoryItemId: asStr(d.data.inventoryItemId), unit: asStr(d.data.unit), name: asStr(d.data.nameRoman) || asStr(d.data.nameEn) || asStr(d.data.nameTe) || d.id, names: [...new Set(raw.map(normName).filter(Boolean))], packs: normalizePacks(d.data.packs) };
    });
}

export function groceryMatcher(refs: GroceryRef[]): (line: Doc) => GroceryRef | null {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const byInv = new Map<string, GroceryRef>();
  for (const r of refs) if (r.inventoryItemId && !byInv.has(r.inventoryItemId)) byInv.set(r.inventoryItemId, r);
  const byName = new Map<string, GroceryRef | null>();
  for (const r of refs) for (const n of r.names) byName.set(n, byName.has(n) && byName.get(n) !== r ? null : r); // ambiguous name → no match
  return (line: Doc) => byId.get(asStr(line.groceryItemId)) ?? byInv.get(asStr(line.inventoryItemId)) ?? byName.get(normName(asStr(line.description))) ?? null;
}

export type PurchaseRateRow = RateRow & { name: string; unit: string; groceryItemId: string; rawRate: number; rawUnit: string };

/** One row per purchase line with a rate (cancelled / deleted purchases skipped). */
export function purchaseRateRows(purchases: { id: string; data: Doc }[], refs: GroceryRef[] = []): PurchaseRateRow[] {
  const match = groceryMatcher(refs);
  const rows: PurchaseRateRow[] = [];
  for (const p of purchases) {
    if (!isLiveRecord(p.data)) continue;
    const day = dayOfValue(p.data.purchaseDate) ?? dayOfValue(p.data.createdAt);
    if (!day) continue;
    for (const it of asArr(p.data.items).map(asObj)) {
      const rawRate = asNum(it.unitPrice);
      if (!(rawRate > 0)) continue;
      const rawUnit = asStr(it.unit);
      const g = match(it);
      // Module 2a: a line bought in the item's own pack ("Bag") is turned into a rate per kg with the item's pack size
      const converted = g ? (rateInUnit(rawRate, rawUnit, g.unit || rawUnit) ?? (g.unit ? itemRate(rawRate, rawUnit, g.unit, g.packs, g.unit) : null)) : null;
      const base = { vendorId: asStr(p.data.vendorId), vendorName: asStr(p.data.vendorNameSnapshot) || asStr(p.data.vendorName) || "-", day, rawRate, rawUnit };
      if (g && converted !== null) rows.push({ ...base, itemKey: `g:${g.id}`, rate: converted, unit: g.unit || rawUnit, name: g.name, groceryItemId: g.id });
      else if (g) rows.push({ ...base, itemKey: `g:${g.id}|${normUnit(rawUnit)}`, rate: rawRate, unit: rawUnit, name: `${g.name} (${rawUnit})`, groceryItemId: g.id });
      else rows.push({ ...base, itemKey: purchaseItemKey(it), rate: rawRate, unit: rawUnit, name: asStr(it.description), groceryItemId: "" });
    }
  }
  return rows;
}

/** Latest rate per item key (any vendor). */
export function latestRates(rows: PurchaseRateRow[]): Map<string, { rate: number; day: string; vendorName: string; unit: string }> {
  const out = new Map<string, { rate: number; day: string; vendorName: string; unit: string }>();
  for (const r of rows) {
    const cur = out.get(r.itemKey);
    if (!cur || r.day > cur.day) out.set(r.itemKey, { rate: r.rate, day: r.day, vendorName: r.vendorName, unit: r.unit });
  }
  return out;
}

/**
 * Rate for one grocery item (R10-4): the latest unit-converted rate, and unitMismatch = the item's most recent purchase
 * line was in a unit that cannot be converted to the grocery unit (e.g. Packet for a kg item).
 */
export function groceryRate(rows: PurchaseRateRow[], groceryItemId: string): { rate: { rate: number; day: string; vendorName: string; unit: string } | null; unitMismatch: boolean } {
  const mine = rows.filter((r) => r.groceryItemId === groceryItemId);
  if (!mine.length) return { rate: null, unitMismatch: false };
  const latest = mine.reduce((a, b) => (b.day > a.day ? b : a));
  const ok = mine.filter((r) => r.itemKey === `g:${groceryItemId}`);
  const best = ok.length ? ok.reduce((a, b) => (b.day > a.day ? b : a)) : null;
  return { rate: best ? { rate: best.rate, day: best.day, vendorName: best.vendorName, unit: best.unit } : null, unitMismatch: latest.itemKey !== `g:${groceryItemId}` };
}
