import { CalcError, requireFinite, requireNonNeg, round2 } from "./util";
import { invoiceTotals, InvoiceTotals } from "./gst";

/** Pricing fields of a menu package (from `menuPackages/{id}`). Spec §11. */
export interface MenuPricing {
  pricePerPlate: number;
  minOrder: number;
  servingBoy: { chargePerPerson: number; freeRule: "none" | "per50" };
  freePlates: { perPlates: number; extraPlates: number } | null;
  extras: { key: string; price: number | null }[];
  replacements: { key: string; extraPerPlate: number }[];
}

export interface QuoteInput {
  plates: number;
  servingBoys: number;
  transport: number;
  replacements: string[]; // keys chosen
  extras: { key: string; qty: number; price?: number }[]; // price required when the menu price is null
  discount?: number;
  gstRate: number; // 0 while the business is not GST-registered
  isInterState?: boolean;
}

export interface Quote {
  belowMinimum: boolean;
  freePlates: number;
  platesToCook: number;
  freeServingBoys: number;
  chargedServingBoys: number;
  lines: { item: string; qty: number; rate: number; amount: number }[];
  subtotal: number;
  totals: InvoiceTotals;
}

function wholeAtLeast(name: string, v: number, min: number): void {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw new CalcError(`${name} must be a whole number ≥ ${min}`);
}

/** Spec §11: the whole menu is checked, not only the chosen items. */
function checkMenu(menu: MenuPricing): void {
  requireNonNeg("pricePerPlate", menu.pricePerPlate);
  requireNonNeg("servingBoy.chargePerPerson", menu.servingBoy.chargePerPerson);
  if (menu.servingBoy.freeRule !== "none" && menu.servingBoy.freeRule !== "per50") throw new CalcError("servingBoy.freeRule must be none or per50");
  wholeAtLeast("minOrder", menu.minOrder, 0);
  if (menu.freePlates) {
    wholeAtLeast("freePlates.perPlates", menu.freePlates.perPlates, 1);
    wholeAtLeast("freePlates.extraPlates", menu.freePlates.extraPlates, 0);
  }
  menu.extras.forEach((e) => {
    if (e.price !== null) requireNonNeg(`extra ${e.key} price`, e.price);
  });
  menu.replacements.forEach((r) => requireNonNeg(`replacement ${r.key} extraPerPlate`, r.extraPerPlate));
}

export function quoteForMenu(menu: MenuPricing, q: QuoteInput): Quote {
  checkMenu(menu);
  const replacements = q.replacements ?? [];
  const extras = q.extras ?? [];
  if (!Number.isInteger(q.plates) || q.plates < 1) throw new CalcError("plates must be a whole number ≥ 1");
  if (!Number.isInteger(q.servingBoys) || q.servingBoys < 0) throw new CalcError("servingBoys must be a whole number ≥ 0");
  requireNonNeg("transport", q.transport);
  if (new Set(replacements).size !== replacements.length) throw new CalcError("the same replacement is chosen twice");
  if (new Set(extras.map((e) => e.key)).size !== extras.length) throw new CalcError("the same extra is listed twice (use qty)");
  const lines: Quote["lines"] = [];
  const add = (item: string, qty: number, rate: number) => lines.push({ item, qty, rate, amount: round2(qty * rate) });

  add("plates", q.plates, menu.pricePerPlate);
  for (const key of replacements) {
    const r = menu.replacements.find((x) => x.key === key);
    if (!r) throw new CalcError(`unknown replacement ${key}`);
    add(`replacement:${key}`, q.plates, r.extraPerPlate);
  }
  for (const e of extras) {
    const m = menu.extras.find((x) => x.key === e.key);
    if (!m) throw new CalcError(`unknown extra ${e.key}`);
    if (!Number.isInteger(e.qty) || e.qty < 1) throw new CalcError(`extra ${e.key}: qty must be a whole number ≥ 1`);
    const rate = m.price ?? e.price;
    if (rate === undefined || rate === null) throw new CalcError(`extra ${e.key} needs a price`);
    requireFinite(`extra ${e.key} price`, rate);
    requireNonNeg(`extra ${e.key} price`, rate);
    add(`extra:${e.key}`, e.qty, rate);
  }
  const blocks = menu.freePlates ? Math.floor(q.plates / menu.freePlates.perPlates) : 0;
  const freePlates = menu.freePlates ? blocks * menu.freePlates.extraPlates : 0;
  const freeServingBoys = menu.servingBoy.freeRule === "per50" ? Math.floor(q.plates / 50) : 0;
  const chargedServingBoys = Math.max(0, q.servingBoys - freeServingBoys);
  if (chargedServingBoys > 0) add("servingBoys", chargedServingBoys, menu.servingBoy.chargePerPerson);
  if (q.transport > 0) add("transport", 1, q.transport);

  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  return {
    belowMinimum: q.plates < menu.minOrder,
    freePlates,
    platesToCook: q.plates + freePlates,
    freeServingBoys,
    chargedServingBoys,
    lines,
    subtotal,
    totals: invoiceTotals(subtotal, q.gstRate, q.isInterState ?? false, q.discount ?? 0),
  };
}

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return m >= 1 && m <= 12 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * True when 12 months or more have passed since the menu's price date (owner revises the price himself).
 * Both dates must be real calendar dates; a 29 Feb menu date is due from 1 March in a non-leap year.
 */
export function priceReviewDue(menuDate: string, today: string): boolean {
  if (!isRealDate(menuDate) || !isRealDate(today)) throw new CalcError("dates must be real dates YYYY-MM-DD");
  const [y, m, d] = menuDate.split("-").map(Number);
  const leapNext = new Date(Date.UTC(y + 1, 1, 29)).getUTCMonth() === 1;
  const [dm, dd] = m === 2 && d === 29 && !leapNext ? [3, 1] : [m, d];
  const due = `${String(y + 1).padStart(4, "0")}-${String(dm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return today >= due;
}
