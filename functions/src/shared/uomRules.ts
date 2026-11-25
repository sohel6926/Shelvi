/**
 * Module 2h (18 Nov 2026) — units of measure master. Spec CMF 06: UOM-01 one list of units, UOM-02 conversions that
 * are global only when universally true, UOM-03 the conversion used on a document is kept with the document.
 * Pure.
 *
 * Two kinds of unit:
 *  - fixed units — Kg, Gram, Litre, ML, Piece, Dozen. Their conversion is always the same (shared/units) and they
 *    cannot be removed or renamed.
 *  - pack units — Bag, Tin, Box … names only. How much one Bag holds is set per item (shared/itemUnits packs),
 *    never globally. The owner keeps this list in Settings (settings/business.uomPacks).
 */
import { asArr, Doc } from "./coerce";
import { normUnit, unitFactor } from "./units";
import { isGlobalUnit, itemUnitFactor, normalizePacks, Pack } from "./itemUnits";

export const FIXED_UOMS = ["Kg", "Gram", "Litre", "ML", "Piece", "Dozen"] as const;
export const DEFAULT_PACK_UOMS = ["Packet", "Box", "Bag", "Tin", "Bottle", "Bundle", "Crate", "Tray", "Can", "Cylinder", "Block"];
export const MAX_PACK_UOMS = 60;

const cleanName = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length >= 1 && t.length <= 30 && /^[\p{L}\p{M}\p{N} ./-]+$/u.test(t) ? t : null;
};

/** Stored pack unit names: cleaned, unique, never a fixed unit; the default list when nothing is stored. */
export function normalizeUomPacks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PACK_UOMS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of asArr(raw)) {
    const n = cleanName(v);
    if (!n || isGlobalUnit(n) || seen.has(normUnit(n))) continue;
    seen.add(normUnit(n));
    out.push(n);
    if (out.length === MAX_PACK_UOMS) break;
  }
  return out;
}

/** Strict check of the list the owner saves. */
export function parseUomPacksPatch(v: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(v) || v.length > MAX_PACK_UOMS) return { ok: false, error: `uomPacks must be a list of up to ${MAX_PACK_UOMS} names.` };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    const n = cleanName(raw);
    if (!n) return { ok: false, error: "Each unit name needs 1–30 letters or digits." };
    if (isGlobalUnit(n)) return { ok: false, error: `"${n}" is a fixed unit and is always in the list.` };
    if (seen.has(normUnit(n))) return { ok: false, error: `"${n}" is listed twice.` };
    seen.add(normUnit(n));
    out.push(n);
  }
  return { ok: true, value: out };
}

/** Every unit a purchase line may use: the fixed ones first, then the owner's pack names. */
export function purchaseUnitNames(packs: readonly string[]): string[] {
  return [...FIXED_UOMS, ...packs];
}

// ---- conversion snapshot on a purchase (UOM-03) ----

/** One conversion a purchase used: 1 `unit` of this stock item = `factor` `stockUnit`. */
export interface Conversion {
  inventoryItemId: string;
  unit: string;
  stockUnit: string;
  factor: number;
}

export const conversionKey = (inventoryItemId: string, unit: string) => `${inventoryItemId}|${normUnit(unit)}`;

/** purchases.stockConversions as stored → factors by key (bad rows dropped). */
export function frozenFactors(stored: unknown): Record<string, { factor: number; stockUnit: string }> {
  const out: Record<string, { factor: number; stockUnit: string }> = {};
  for (const r of asArr(stored)) {
    const c = (r && typeof r === "object" ? r : {}) as Doc;
    if (typeof c.inventoryItemId !== "string" || typeof c.unit !== "string" || typeof c.stockUnit !== "string") continue;
    if (typeof c.factor !== "number" || !Number.isFinite(c.factor) || !(c.factor > 0)) continue;
    out[conversionKey(c.inventoryItemId, c.unit)] = { factor: c.factor, stockUnit: c.stockUnit };
  }
  return out;
}

/**
 * The factor for a line: the one already kept on the purchase when it was made for the same stock unit (so a later
 * change of "1 Bag = 25 kg" to 26 kg never moves old stock), otherwise today's conversion. null = not convertible.
 */
export function lineFactor(inventoryItemId: string, unit: string, stockUnit: string, packs: readonly Pack[], frozen: Record<string, { factor: number; stockUnit: string }>): number | null {
  const kept = frozen[conversionKey(inventoryItemId, unit)];
  if (kept && normUnit(kept.stockUnit) === normUnit(stockUnit)) return kept.factor;
  return unitFactor(unit, stockUnit) ?? itemUnitFactor(unit, stockUnit, packs, stockUnit);
}

// ---- pack size history (conversions "with dates") ----

/** What to record when a grocery item's packs or unit changed; null when nothing changed (or nothing to record). */
export function packChange(before: Doc | undefined, after: Doc | undefined): { unit: string; packs: Pack[] } | null {
  if (!after) return null;
  const unit = typeof after.unit === "string" ? after.unit : "";
  const now = normalizePacks(after.packs);
  const was = normalizePacks(before?.packs);
  const wasUnit = typeof before?.unit === "string" ? before.unit : "";
  const same = unit === wasUnit && now.length === was.length && now.every((p, i) => p.unit === was[i].unit && p.qty === was[i].qty);
  if (same) return null;
  if (!before && now.length === 0) return null; // a new item without packs: nothing to remember
  if (now.length === 0 && was.length === 0) return null; // only the unit of an item without packs changed
  return { unit, packs: now };
}
