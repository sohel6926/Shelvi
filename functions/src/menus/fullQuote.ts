/** §11 quote + R10-11 kids plates / special meals (§21) — the one quote every server path uses. */
import { quoteForMenu, MenuPricing, Quote } from "../calc/menus";
import { invoiceTotals } from "../calc/gst";
import { kidsSpecialLines } from "../calc/round10";
import { round2 } from "../calc/util";
import { MenuMeta, QuoteRequest } from "./menuPackage";

export function fullQuote(pricing: MenuPricing, meta: Pick<MenuMeta, "kidsPrice">, req: QuoteRequest & { gstRate: number }): Quote {
  const { kidsCount, specialMeals, ...base } = req;
  const q = quoteForMenu(pricing, base);
  const extra = kidsSpecialLines({ plates: req.plates, kidsPrice: meta.kidsPrice ?? null }, { kidsCount, specialMeals });
  if (!extra.length) return q;
  const lines = [...q.lines, ...extra];
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  return { ...q, lines, subtotal, platesToCook: q.platesToCook + (kidsCount ?? 0), totals: invoiceTotals(subtotal, req.gstRate, req.isInterState ?? false, req.discount ?? 0) };
}
