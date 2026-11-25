/**
 * Pure: R7-2 / F4 — the stock a purchase should have added. Lines with an inventoryItemId count; the quantity is
 * converted from the line unit to the stock item's unit (Gram → kg, ML → L, Dozen → pcs; shared/units). A line whose
 * unit cannot be converted (Packet for a kg item) adds nothing and is listed in `skipped` — the owner fixes it by hand.
 * Cancelled / deleted purchases want nothing (so their stock is reversed).
 */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { isLiveRecord } from "../shared/costTarget";
import { round2 } from "../calc/util";
import { isBaseUnit, normUnit } from "../shared/units";
import { Pack } from "../shared/itemUnits";
import { Conversion, lineFactor } from "../shared/uomRules";

export interface SkippedStockLine {
  line: number;
  description: string;
  inventoryItemId: string;
  quantity: number;
  unit: string;
  stockUnit: string;
  reason: "unit-mismatch" | "stock-unit-unknown";
  te: string;
  en: string;
}

/**
 * `stockPacks` (Module 2a): the stock item's own pack sizes ("1 Bag = 25 kg"), so a line bought in Bags goes into stock in kg.
 */
export function purchaseStockLines(
  doc: Doc | undefined,
  stockUnits: Record<string, string> = {},
  stockPacks: Record<string, Pack[]> = {},
  /** Module 2h: conversions this purchase already used (purchases.stockConversions) — they win over today's packs */
  frozen: Record<string, { factor: number; stockUnit: string }> = {},
): { wanted: Record<string, number>; skipped: SkippedStockLine[]; conversions: Conversion[] } {
  const wanted: Record<string, number> = {};
  const skipped: SkippedStockLine[] = [];
  const conversions: Conversion[] = [];
  if (!doc || !isLiveRecord(doc)) return { wanted, skipped, conversions };
  asArr(doc.items)
    .map(asObj)
    .forEach((it, i) => {
      const id = asStr(it.inventoryItemId);
      const q = asNum(it.quantity);
      if (!id || !(q > 0)) return;
      const unit = asStr(it.unit);
      const stockUnit = asStr(stockUnits[id]);
      let qty: number | null;
      if (!stockUnit) qty = isBaseUnit(unit) ? q : null; // no unit on the stock item: only kg / L / pcs / blank lines go in as they are
      else if (!unit) qty = q; // old lines without a unit: as before
      else {
        const k = lineFactor(id, unit, stockUnit, stockPacks[id] ?? [], frozen);
        qty = k === null ? null : Math.round(q * k * 1000) / 1000;
        if (k !== null && !conversions.some((c) => c.inventoryItemId === id && normUnit(c.unit) === normUnit(unit))) conversions.push({ inventoryItemId: id, unit, stockUnit, factor: k });
      }
      if (qty === null) {
        const name = asStr(it.description) || id;
        skipped.push({
          line: i,
          description: asStr(it.description),
          inventoryItemId: id,
          quantity: q,
          unit,
          stockUnit,
          reason: stockUnit ? "unit-mismatch" : "stock-unit-unknown",
          te: stockUnit ? `${name}: ${q} ${unit} — stock యూనిట్ ${stockUnit} కి మార్చలేము` : `${name}: ${q} ${unit} — stock వస్తువుకి యూనిట్ లేదు`,
          en: stockUnit ? `${name}: ${q} ${unit} cannot be converted to the stock unit ${stockUnit}` : `${name}: ${q} ${unit} — the stock item has no unit`,
        });
        return;
      }
      wanted[id] = round2((wanted[id] ?? 0) + qty);
    });
  return { wanted, skipped, conversions };
}

/** Stock wanted per inventory item (converted); see purchaseStockLines. */
export function wantedStockFromPurchase(doc: Doc | undefined, stockUnits: Record<string, string> = {}, stockPacks: Record<string, Pack[]> = {}): Record<string, number> {
  return purchaseStockLines(doc, stockUnits, stockPacks).wanted;
}

/** Raw line quantities — what clients added before the R7-2 trigger existed (no stockApplied on the purchase). */
function legacyStock(doc: Doc | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!doc || !isLiveRecord(doc)) return out;
  for (const it of asArr(doc.items).map(asObj)) {
    const id = asStr(it.inventoryItemId);
    const q = asNum(it.quantity);
    if (id && q > 0) out[id] = round2((out[id] ?? 0) + q);
  }
  return out;
}

/**
 * What is already in stock for this purchase: the stored stockApplied (exactly what the trigger moved, in stock units);
 * for an old purchase without stockApplied, its previous lines as they were typed.
 */
export function appliedStock(current: Doc | undefined, previous: Doc | undefined): Record<string, number> {
  const stored = current?.stockApplied ?? previous?.stockApplied;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(stored as Doc)) if (typeof v === "number" && Number.isFinite(v) && v !== 0) out[k] = v;
    return out;
  }
  return previous ? legacyStock(previous) : {};
}

/** In-app notice text for skipped lines. */
export function stockSkippedText(purchaseNo: string, skipped: SkippedStockLine[]): { te: string; en: string } {
  return {
    te: `యూనిట్ వేరు — stock మార్చలేదు, చేతితో సరిచేయండి (${purchaseNo}): ${skipped.map((s) => s.te).join("; ")}`,
    en: `Unit differs — stock not changed, adjust it by hand (${purchaseNo}): ${skipped.map((s) => s.en).join("; ")}`,
  };
}

export { normUnit };
