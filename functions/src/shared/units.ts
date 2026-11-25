/**
 * Pure: purchase / stock / grocery unit table (vendor rates R10-6, purchase stock F4).
 * "Kg", "kgs", "Kilo" → kg; "Gram", "gm" → g; "Litre", "ltr" → L; "ML" → ml; "Piece", "pcs", "Nos" → pcs; "Dozen" → dozen.
 * Convertible: g ↔ kg, ml ↔ L, dozen ↔ pcs. Packet, Bag, Box, Tin, Tray… only match themselves.
 */
import { round2 } from "../calc/util";

export function normUnit(u: string): string {
  const x = (u ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(x)) return "kg";
  if (["g", "gm", "gms", "gram", "grams"].includes(x)) return "g";
  if (["l", "lt", "ltr", "ltrs", "litre", "litres", "liter", "liters"].includes(x)) return "L";
  if (["ml", "mls", "millilitre", "milliliter"].includes(x)) return "ml";
  if (["pc", "pcs", "piece", "pieces", "no", "nos", "number"].includes(x)) return "pcs";
  if (["dozen", "dz"].includes(x)) return "dozen";
  return x;
}

const PER: Record<string, { base: string; factor: number }> = { kg: { base: "kg", factor: 1 }, g: { base: "kg", factor: 0.001 }, L: { base: "L", factor: 1 }, ml: { base: "L", factor: 0.001 }, pcs: { base: "pcs", factor: 1 }, dozen: { base: "pcs", factor: 12 } };

/** How many `to` units one `from` unit is (Gram → kg = 0.001); null when they measure different things. */
export function unitFactor(from: string, to: string): number | null {
  const a = normUnit(from);
  const b = normUnit(to);
  if (a === b) return 1;
  const f = PER[a];
  const t = PER[b];
  if (!f || !t || f.base !== t.base) return null;
  return f.factor / t.factor;
}

/** Quantity in `from` units → `to` units (3 decimals); null when not convertible. */
export function qtyInUnit(qty: number, from: string, to: string): number | null {
  const k = unitFactor(from, to);
  return k === null ? null : Math.round(qty * k * 1000) / 1000;
}

/** Rate per `from` unit → rate per `to` unit (paise); null when not convertible. */
export function rateInUnit(rate: number, from: string, to: string): number | null {
  const k = unitFactor(from, to);
  return k === null ? null : round2(rate / k);
}

/** The base units a quantity can be applied in as-is when the other side has no unit recorded. */
export function isBaseUnit(u: string): boolean {
  const n = normUnit(u);
  return n === "" || n === "kg" || n === "L" || n === "pcs";
}
