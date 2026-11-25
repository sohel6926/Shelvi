/** Pure: business settings shape, defaults and derived values. */
import { asArr, asBool, asNum, asObj, asStr, Doc } from "./coerce";
import { CalcModes, normalizeCalcModes } from "./overridePolicy";
import { LeadAssignConfig, normalizeLeadAssign } from "../leads/assignRules";
import { LeadTatConfig, normalizeLeadTat } from "../leads/tatRules";
import { ExpiryAlertConfig, normalizeExpiryAlert } from "../stock/batchRules";
import { PoApprovalConfig, normalizePoApproval } from "../procure/procureRules";
import { StockAdjustConfig, normalizeStockAdjust } from "../inventory/adjustRules";
import { FoodSafetyConfig, normalizeFoodSafety } from "../safety/safetyRules";
import { Allergen, normalizeAllergenList } from "../safety/allergenRules";
import { BillMatchConfig, normalizeBillMatch } from "../procure/matchRules";
import { SodConfig, normalizeSod } from "../roles/permRules";
import { StockReserveConfig, normalizeStockReserve } from "../stock/reservationRules";
import { normalizeUomPacks } from "./uomRules";

export interface MonthlyPayRules {
  deductAbsences: boolean;
  freeLeaves: number;
  overtime: boolean;
}

export const DEFAULT_MONTHLY_PAY_RULES: MonthlyPayRules = { deductAbsences: false, freeLeaves: 0, overtime: false };

export interface BusinessSettings {
  name: string;
  logoUrl: string;
  address: string;
  phone: string;
  /** Owner alerts go here (falls back to the business phone). */
  ownerPhone: string;
  fssaiNumber: string;
  bank: { name: string; account: string; ifsc: string };
  upiId: string;
  signatureUrl: string;
  /** quotation terms (validity etc.) — printed on quotations only */
  terms: string;
  /** F-b: invoice payment terms (no validity line) — copied onto event, cancellation-charge and lunch-box invoices */
  invoiceTerms: string;
  gstin: string;
  gstRegistered: boolean;
  defaultGstRate: number;
  profitMarginPct: number;
  seasonWeights: number[];
  monthlyPayRules: MonthlyPayRules;
  /** Fixed monthly costs for break-even = kitchenRent + other (R10-5; default kitchen rent ₹53,000). 0 = use rent expenses of the period. */
  fixedMonthlyCosts: number;
  /** R10-5 parts of fixedMonthlyCosts as stored ({ kitchenRent, other }; an old plain number counts as "other") */
  fixedCostParts: { kitchenRent: number; other: number };
  googleReviewUrl: string;
  /** % rise in a purchase rate that triggers a price-watch alert (R10-5 vendorPriceAlertPct; old priceRiseAlertPct). */
  priceRiseAlertPct: number;
  vendorPriceAlertPct: number;
  /** R10-4 target margin for suggested package prices (default 30) and per-plate labour / overhead added to food cost */
  targetMarginPct: number;
  labourPerPlate: number;
  overheadPerPlate: number;
  /** R10-8 Meta-approved template name per message type (e.g. { "customer.duesReminder": "suseela_dues_te" }) */
  whatsappTemplates: Record<string, string>;
  /** R10-12 default price of one lunch box (₹170) */
  lunchBoxPrice: number;
  /** Round 11: Target Board shows ₹ sales figures to managers and staff too (default false = % only). Profit stays admin-only. */
  targetBoardShowRupeesToAll: boolean;
  /** auto (server calculates, default) or manual (a person types the value), per area. */
  calcModes: CalcModes;
  /** managers may enter manual values (default true); staff never can. */
  managerCanOverride: boolean;
  /** take an event's groceries out of stock when it is Completed (default true) */
  autoStockDeduct: boolean;
  /** §12 minute overrides as stored (validated when saved; read with calc timelineMinutes) */
  timelineDefaults: Doc | null;
  /** R7: legal entity and brand; documents show "<brand> (a brand of <legal>)" when legalNameOnDocs */
  legalName: string;
  brandName: string;
  legalNameOnDocs: boolean;
  /** Module 1a: who gets a new lead (auto on/off, turn by turn or by source). Default off. */
  leadAssign: LeadAssignConfig;
  /** Module 1b: first response within N minutes (default on, 15 minutes, owner told at 2 × N). */
  leadTat: LeadTatConfig;
  /** Module 2d: daily notice about stock close to / past its expiry date (default on, 7 days ahead). */
  expiryAlert: ExpiryAlertConfig;
  /** Module 3a: a manager's purchase order above this amount waits for the owner (default on, ₹10,000). */
  poApproval: PoApprovalConfig;
  /** Module 3c: how far a bill rate may be above the order rate without a mismatch (default 0%). */
  billMatch: BillMatchConfig;
  /** Module 4d: separation of duties in the purchase flow (default on from ₹10,000; the owner is exempt but flagged). */
  sod: SodConfig;
  /** Module 4d: when a hand change of stock needs a supervisor */
  stockAdjust: StockAdjustConfig;
  /** Module 5e: the owner's food-safety checklists (none until he writes them) */
  foodSafety: FoodSafetyConfig;
  /** Module 5h: the owner's allergen list (none until he writes it) */
  allergens: Allergen[];
  /** Module 2g: reserve stock for confirmed events of the next N days (default on, 30 days). */
  stockReserve: StockReserveConfig;
  /** Module 2h: pack unit names offered on purchases (Bag, Tin …); the fixed units are always offered. */
  uomPacks: string[];
}

const EQUAL_WEIGHTS = Array.from({ length: 12 }, () => 1);

export const DEFAULT_KITCHEN_RENT = 53000;

/** Default invoice terms (Telugu; payment only — the quotation's validity line does not belong on a bill). */
export const DEFAULT_INVOICE_TERMS = [
  "1. బిల్ మొత్తం event రోజు లోపు పూర్తిగా చెల్లించాలి.",
  "2. చెల్లింపు: UPI / బ్యాంక్ ట్రాన్స్‌ఫర్ / నగదు — చెల్లించిన ప్రతి మొత్తానికి రసీదు ఇస్తాం.",
  "3. Event తర్వాత పెరిగిన అతిథులు / అదనపు వస్తువులు ఈ బిల్‌లో వేరుగా చూపించాం.",
  "4. ఆర్డర్ రద్దు అయితే, ఉంచుకున్న మొత్తం 'రద్దు చార్జీ' గా బిల్‌లో ఉంటుంది.",
].join("\n");

/** R10-5: { kitchenRent, other } (missing → kitchen rent ₹53,000); an old plain number is kept as "other". */
export function fixedCosts(v: unknown): { fixedMonthlyCosts: number; fixedCostParts: { kitchenRent: number; other: number } } {
  if (typeof v === "number" && Number.isFinite(v)) {
    const other = Math.max(0, v);
    return { fixedMonthlyCosts: other, fixedCostParts: { kitchenRent: 0, other } };
  }
  const o = asObj(v);
  const kitchenRent = o.kitchenRent === undefined || o.kitchenRent === null ? DEFAULT_KITCHEN_RENT : Math.max(0, asNum(o.kitchenRent));
  const other = Math.max(0, asNum(o.other));
  return { fixedMonthlyCosts: kitchenRent + other, fixedCostParts: { kitchenRent, other } };
}

function pctIn(v: unknown, def: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : def;
}

function alertPct(r: Doc): number {
  return pctIn(r.vendorPriceAlertPct, pctIn(r.priceRiseAlertPct, 5, 0, 100), 0, 100);
}

export function normalizeSettings(raw: Doc | undefined): BusinessSettings {
  const r = raw ?? {};
  const bank = asObj(r.bank);
  const weights = asArr(r.seasonWeights);
  const validWeights =
    weights.length === 12 && weights.every((w) => typeof w === "number" && Number.isFinite(w) && w >= 0) && (weights as number[]).some((w) => w > 0);
  const rules = asObj(r.monthlyPayRules);
  const gstRegistered = asBool(r.gstRegistered);
  const rate = asNum(r.defaultGstRate);
  return {
    name: asStr(r.name, "Suseela Caterings"),
    logoUrl: asStr(r.logoUrl),
    address: asStr(r.address),
    phone: asStr(r.phone),
    ownerPhone: asStr(r.ownerPhone) || asStr(r.phone),
    fssaiNumber: asStr(r.fssaiNumber),
    bank: { name: asStr(bank.name), account: asStr(bank.account), ifsc: asStr(bank.ifsc) },
    upiId: asStr(r.upiId),
    signatureUrl: asStr(r.signatureUrl),
    terms: asStr(r.terms),
    invoiceTerms: asStr(r.invoiceTerms).trim() || DEFAULT_INVOICE_TERMS,
    gstin: asStr(r.gstin),
    gstRegistered,
    defaultGstRate: gstRegistered && rate >= 0 && rate <= 28 ? rate : 0,
    profitMarginPct: asNum(r.profitMarginPct, 25),
    seasonWeights: validWeights ? (weights as number[]) : EQUAL_WEIGHTS.slice(),
    monthlyPayRules: {
      deductAbsences: asBool(rules.deductAbsences, DEFAULT_MONTHLY_PAY_RULES.deductAbsences),
      freeLeaves: Math.max(0, asNum(rules.freeLeaves, DEFAULT_MONTHLY_PAY_RULES.freeLeaves)),
      overtime: asBool(rules.overtime, DEFAULT_MONTHLY_PAY_RULES.overtime),
    },
    ...fixedCosts(r.fixedMonthlyCosts),
    googleReviewUrl: asStr(r.googleReviewUrl),
    priceRiseAlertPct: alertPct(r),
    vendorPriceAlertPct: alertPct(r),
    targetMarginPct: pctIn(r.targetMarginPct, 30, 0, 95),
    labourPerPlate: Math.max(0, asNum(r.labourPerPlate)),
    overheadPerPlate: Math.max(0, asNum(r.overheadPerPlate)),
    whatsappTemplates: Object.fromEntries(Object.entries(asObj(r.whatsappTemplates)).filter(([, v]) => typeof v === "string" && v.trim() !== "").map(([k, v]) => [k, String(v).trim()])),
    lunchBoxPrice: r.lunchBoxPrice === undefined || r.lunchBoxPrice === null ? 170 : Math.max(0, asNum(r.lunchBoxPrice, 170)),
    targetBoardShowRupeesToAll: asBool(r.targetBoardShowRupeesToAll, false),
    calcModes: normalizeCalcModes(r.calcModes),
    managerCanOverride: asBool(r.managerCanOverride, true),
    autoStockDeduct: asBool(r.autoStockDeduct, true),
    timelineDefaults: r.timelineDefaults && typeof r.timelineDefaults === "object" && !Array.isArray(r.timelineDefaults) ? (r.timelineDefaults as Doc) : null,
    legalName: asStr(r.legalName, "Suseela Technologies Private Limited"),
    brandName: asStr(r.brandName) || asStr(r.name, "Suseela Caterings"),
    legalNameOnDocs: asBool(r.legalNameOnDocs, false),
    leadAssign: normalizeLeadAssign(r.leadAssign),
    leadTat: normalizeLeadTat(r.leadTat),
    expiryAlert: normalizeExpiryAlert(r.expiryAlert),
    poApproval: normalizePoApproval(r.poApproval),
    billMatch: normalizeBillMatch(r.billMatch),
    sod: normalizeSod(r.sod),
    stockAdjust: normalizeStockAdjust(r.stockAdjust),
    foodSafety: normalizeFoodSafety(r.foodSafety),
    allergens: normalizeAllergenList(r.allergens),
    stockReserve: normalizeStockReserve(r.stockReserve),
    uomPacks: normalizeUomPacks(r.uomPacks),
  };
}

/** The GST rate to charge now: 0 until the owner enters a GSTIN (calc-spec §1). */
export function effectiveGstRate(s: BusinessSettings): number {
  return s.gstRegistered ? s.defaultGstRate : 0;
}

/** Document title printed on invoices. */
export function invoiceDocTitle(s: BusinessSettings): "Invoice" | "Tax Invoice" {
  return s.gstRegistered ? "Tax Invoice" : "Invoice";
}


/** Name line printed on invoices / quotations: brand, plus "(a brand of <legal name>)" once switched on. */
export function issuerLine(s: BusinessSettings): string {
  const brand = s.brandName || s.name;
  return s.legalNameOnDocs && s.legalName ? `${brand} (a brand of ${s.legalName})` : brand;
}
