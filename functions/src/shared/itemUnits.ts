/**
 * Module 2a (18 Nov 2026) — item-specific unit conversions ("1 Bag of this rice = 25 kg", "1 Tin of this oil = 15 L").
 * Spec: CMF 06 UOM & Conversion Master (UOM-02 item-specific conversions; global ones only when universally valid).
 * Pure. Global conversions (g ↔ kg, ml ↔ L, dozen ↔ pcs) stay in shared/units; a pack is always per item.
 */
import { asArr, asObj } from "./coerce";
import { round2 } from "../calc/util";
import { normUnit, unitFactor } from "./units";

/** 1 `unit` of this item = `qty` of the item's own unit (kg / L / pcs). */
export interface Pack {
  unit: string;
  qty: number;
}

export const MAX_PACKS = 20;
/** Units with a universal meaning can never be redefined as a pack. */
const GLOBAL_UNITS = ["kg", "g", "L", "ml", "pcs", "dozen"];

const validQty = (q: unknown): q is number => typeof q === "number" && Number.isFinite(q) && q > 0 && q <= 1000000;
const validName = (u: unknown): u is string => typeof u === "string" && u.trim().length > 0 && u.trim().length <= 30;
export const isGlobalUnit = (u: string) => GLOBAL_UNITS.includes(normUnit(u));

/** Reads stored packs defensively: bad rows, global units and repeats are dropped. */
export function normalizePacks(raw: unknown): Pack[] {
  const seen = new Set<string>();
  const out: Pack[] = [];
  for (const r of asArr(raw).map(asObj)) {
    if (!validName(r.unit) || !validQty(r.qty) || isGlobalUnit(r.unit)) continue;
    const key = normUnit(r.unit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ unit: r.unit.trim(), qty: r.qty });
    if (out.length === MAX_PACKS) break;
  }
  return out;
}

/** Strict check of packs typed by a person. */
export function parsePacks(v: unknown): { ok: true; value: Pack[] } | { ok: false; error: string } {
  if (!Array.isArray(v) || v.length > MAX_PACKS) return { ok: false, error: `packs must be a list of up to ${MAX_PACKS} rows.` };
  const seen = new Set<string>();
  const out: Pack[] = [];
  for (const row of v) {
    const r = asObj(row);
    if (!validName(r.unit)) return { ok: false, error: "Each pack needs a unit name (up to 30 characters)." };
    if (!validQty(r.qty)) return { ok: false, error: `Pack "${String(r.unit)}" needs a quantity above 0.` };
    if (isGlobalUnit(r.unit)) return { ok: false, error: `"${r.unit}" already has a fixed meaning and cannot be a pack.` };
    const key = normUnit(r.unit);
    if (seen.has(key)) return { ok: false, error: `Pack "${r.unit}" is listed twice.` };
    seen.add(key);
    out.push({ unit: r.unit.trim(), qty: r.qty });
  }
  return { ok: true, value: out };
}

/** How many of the item's own unit one `u` is; null when `u` is neither convertible nor one of the item's packs. */
function inItemUnit(u: string, packs: readonly Pack[], itemUnit: string): number | null {
  const direct = unitFactor(u, itemUnit);
  if (direct !== null) return direct;
  const key = normUnit(u);
  const pack = packs.find((p) => normUnit(p.unit) === key);
  return pack ? pack.qty : null;
}

/** How many `to` units one `from` unit is for THIS item (Bag → kg = 25); null when not convertible. */
export function itemUnitFactor(from: string, to: string, packs: readonly Pack[], itemUnit: string): number | null {
  const global = unitFactor(from, to);
  if (global !== null) return global;
  if (!itemUnit) return null;
  const a = inItemUnit(from, packs, itemUnit);
  const b = inItemUnit(to, packs, itemUnit);
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

/** Quantity in `from` units → `to` units for this item (3 decimals); null when not convertible. */
export function itemQty(qty: number, from: string, to: string, packs: readonly Pack[], itemUnit: string): number | null {
  const k = itemUnitFactor(from, to, packs, itemUnit);
  return k === null ? null : Math.round(qty * k * 1000) / 1000;
}

/** Rate per `from` unit → rate per `to` unit for this item (paise); null when not convertible. */
export function itemRate(rate: number, from: string, to: string, packs: readonly Pack[], itemUnit: string): number | null {
  const k = itemUnitFactor(from, to, packs, itemUnit);
  return k === null ? null : round2(rate / k);
}

/**
 * The same packs expressed in another unit of the same kind (packs kept on a grocery item in kg → the linked stock
 * item counted in g). null when the two units measure different things.
 */
export function packsInUnit(packs: readonly Pack[], fromItemUnit: string, toItemUnit: string): Pack[] | null {
  const k = unitFactor(fromItemUnit, toItemUnit);
  if (k === null) return null;
  return packs.map((p) => ({ unit: p.unit, qty: Math.round(p.qty * k * 1000) / 1000 }));
}

/** Lower-case, letters and digits only — for comparing item names and aliases. */
export function nameKey(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "") : "";
}

/** Reads stored aliases: trimmed, unique by nameKey, up to 20, each up to 100 characters. */
export function normalizeAliases(raw: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of asArr(raw)) {
    if (typeof a !== "string") continue;
    const t = a.trim().slice(0, 100);
    const k = nameKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length === 20) break;
  }
  return out;
}

/**
 * Items whose name or alias is the same as one of `names` (CMF 04 rule 2: duplicate spellings must not create a
 * parallel item). `selfId` is left out. Returns the ids of the clashing items.
 */
export function duplicateItems(names: readonly string[], items: readonly { id: string; names: readonly string[] }[], selfId = ""): string[] {
  const mine = new Set(names.map(nameKey).filter(Boolean));
  if (mine.size === 0) return [];
  return items.filter((i) => i.id !== selfId && i.names.some((n) => mine.has(nameKey(n)))).map((i) => i.id);
}
