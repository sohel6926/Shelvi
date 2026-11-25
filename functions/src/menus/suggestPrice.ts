/**
 * R10-4 suggestPackagePrice { packageId, guests? } (admin + manager — owner decision 18 Nov 2026: a manager may see plate cost and margin % here): plate cost from recipes × latest purchase rates
 * + labour / overhead per plate (settings), suggested price at settings.targetMarginPct (§24 / §3).
 */
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { asNum } from "../shared/coerce";
import { loadSettings } from "../shared/settings";
import { formatRupees } from "../shared/templates";
import { packagePriceSuggestion } from "../calc/round10";
import { ingredientsForPackage } from "../kitchen/eventPlan";
import { loadGroceryRefs, purchaseRateRows, recentPurchases } from "../vendors/purchaseRates";
import { groceryRate } from "../vendors/rateRules";
import { loadMenuPackage } from "./quoteMenu";

const BAND_TE = { red: "నష్టం దగ్గర (15% లోపు)", amber: "తక్కువ లాభం (15–25%)", green: "బాగుంది (25% పైన)", unknown: "తెలియదు — కొన్ని సరుకుల ధరలు లేవు" };

export const suggestPackagePrice = callable("suggestPackagePrice", ADMIN_MANAGER, async (data) => {
  // Owner decision 18 Nov 2026: managers may see plate cost and margin % here (the P&L itself stays admin-only).
  const packageId = reqId(data, "packageId");
  const guestsRaw = data.guests === undefined || data.guests === null ? 100 : asNum(data.guests, NaN);
  if (!Number.isInteger(guestsRaw) || guestsRaw < 1 || guestsRaw > 20000) fail("invalid-argument", "అతిథుల సంఖ్య 1–20000 పూర్ణ సంఖ్య.", "guests must be a whole number 1–20000.");
  const guests = guestsRaw;
  const [menu, settings, plan, purchases, refs] = await Promise.all([loadMenuPackage(packageId), loadSettings(), ingredientsForPackage(packageId, guests), recentPurchases(), loadGroceryRefs()]);
  if (!plan) fail("not-found", "ఆ menu దొరకలేదు.", "Menu package not found.");
  // rates already converted to the grocery item's unit (rateRules); a unit that cannot be converted is never used
  const rows = purchaseRateRows(purchases, refs);
  const lines = plan.ingredients.map((i) => {
    const { rate: r, unitMismatch } = groceryRate(rows, i.groceryItemId);
    return { groceryItemId: i.groceryItemId, nameTe: i.nameTe, nameEn: i.nameEn, unit: i.unit, qty: i.gross, usableQty: i.needed, yieldPct: i.yieldPct, rate: r ? r.rate : null, rateDay: r?.day ?? null, vendor: r?.vendorName ?? null, unitMismatch, cost: r ? Math.round(i.gross * r.rate * 100) / 100 : null };
  });
  const s = packagePriceSuggestion({
    guests,
    ingredients: lines.map((l) => ({ id: l.groceryItemId, qty: l.qty, rate: l.rate })),
    labourPerPlate: settings.labourPerPlate,
    overheadPerPlate: settings.overheadPerPlate,
    currentPrice: menu.pricing.pricePerPlate,
    targetMarginPct: settings.targetMarginPct,
  });
  const warnings: { te: string; en: string }[] = [];
  const missing = lines.filter((l) => l.rate === null && l.qty > 0);
  if (!s.costedLines) warnings.push({ te: "ఈ menu వంటకాలకి recipe / సరుకుల లెక్క లేదు — ఖర్చు చెప్పలేము.", en: "No recipe quantities for this menu's dishes — the cost cannot be worked out." });
  if (missing.length) warnings.push({ te: `ధర తెలియని సరుకులు (కొనుగోలు లేదు / unit తేడా): ${missing.map((l) => l.nameTe || l.nameEn).join(", ")}`, en: `No purchase rate (or a different unit) for: ${missing.map((l) => l.nameEn || l.nameTe).join(", ")}` });
  if (plan.dishesWithoutQty.length) warnings.push({ te: `ఎంత వండాలో తెలియని వంటకాలు: ${plan.dishesWithoutQty.join(", ")}`, en: `Dishes without a quantity rule: ${plan.dishesWithoutQty.join(", ")}` });
  if (plan.groupsWithoutDish.length) warnings.push({ te: `dish లింక్ లేని menu అంశాలు (లెక్కలో లేవు): ${plan.groupsWithoutDish.join("; ")}`, en: `Menu items without a dish link (not costed): ${plan.groupsWithoutDish.join("; ")}` });
  if (plan.choiceGroups.length) warnings.push({ te: `ఎంపిక ఉన్న చోట మొదటి వంటకం లెక్కించాం: ${plan.choiceGroups.join("; ")}`, en: `Choice groups costed with their first option: ${plan.choiceGroups.join("; ")}` });
  if (!settings.labourPerPlate && !settings.overheadPerPlate) warnings.push({ te: "Settings లో ప్లేటుకి కూలీ / ఇతర ఖర్చు పెట్టలేదు — సరుకుల ఖర్చు మాత్రమే.", en: "Labour / overhead per plate are not set in settings — food cost only." });
  return {
    packageId,
    nameTe: menu.meta.nameTe,
    nameEn: menu.meta.nameEn,
    guests,
    currentPrice: menu.pricing.pricePerPlate,
    foodPerPlate: s.foodPerPlate,
    labourPerPlate: settings.labourPerPlate,
    overheadPerPlate: settings.overheadPerPlate,
    plateCost: s.plateCost,
    knownPlateCost: s.knownPlateCost,
    coveragePct: s.coveragePct,
    costedLines: s.costedLines,
    pricedLines: s.pricedLines,
    targetMarginPct: settings.targetMarginPct,
    suggestedPrice: s.suggestedPrice,
    marginPct: s.marginPct,
    band: s.band,
    bandTe: BAND_TE[s.band],
    summary:
      s.band === "unknown"
        ? {
            te: `ఖర్చు పూర్తిగా తెలియదు: ${s.pricedLines}/${s.costedLines} సరుకులకే ధర ఉంది (${s.coveragePct ?? 0}%). తెలిసిన భాగం ప్లేటుకి ${formatRupees(s.knownPlateCost)} — మిగతా సరుకుల కొనుగోలు నమోదు చేయండి.`,
            en: `Cost not fully known: ${s.pricedLines}/${s.costedLines} ingredients priced (${s.coveragePct ?? 0}%). Known part ${formatRupees(s.knownPlateCost)} per plate — enter purchases for the rest.`,
          }
        : {
            te: `ప్లేటు ఖర్చు ${formatRupees(s.knownPlateCost)}, ఇప్పటి ధర ${formatRupees(menu.pricing.pricePerPlate)} (లాభం ${s.marginPct ?? "-"}%), సూచించిన ధర ${formatRupees(s.suggestedPrice ?? 0)}`,
            en: `Plate cost ${formatRupees(s.knownPlateCost)}, current price ${formatRupees(menu.pricing.pricePerPlate)} (margin ${s.marginPct ?? "-"}%), suggested ${formatRupees(s.suggestedPrice ?? 0)}`,
          },
    ingredients: lines,
    missingRates: missing.map((l) => l.groceryItemId),
    warnings,
  };
});
