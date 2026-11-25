/**
 * Module 2f (18 Nov 2026) — packed products (pickles, powders, sweets sold in packs). Pure, no Firestore.
 * Spec: Blueprint "packed products: MRP, label, FSSAI, batch, expiry"; CMF 04 "batch/lot + expiry required".
 *
 * A packed product is a master record (name, net quantity, MRP, shelf life, label text). Its stock lives in a linked
 * inventory item counted in packs, with expiry tracking on, so batches / FEFO / expiry alerts (Module 2d) apply.
 * A packing run adds packs with one batch number and one date: expiry = packed day + shelf life.
 */
import { addDays, isValidDay } from "../shared/istDate";

export const NET_UNITS = ["g", "kg", "ml", "L", "pcs"] as const;
export const VEG_TYPES = ["veg", "nonveg"] as const;
export const DATE_KINDS = ["bestBefore", "useBy"] as const;

export interface PackedProduct {
  nameTe: string;
  nameEn: string;
  netQty: number;
  netUnit: (typeof NET_UNITS)[number];
  /** maximum retail price of one pack, inclusive of all taxes */
  mrp: number;
  shelfLifeDays: number;
  vegType: (typeof VEG_TYPES)[number];
  dateKind: (typeof DATE_KINDS)[number];
  ingredientsText: string;
  allergensText: string;
  storageText: string;
  nutritionText: string;
  /** optional link to the dish this pack is made from */
  dishId: string;
  active: boolean;
  /** X5: tax code and GST % of the product (MRP already includes this tax), and the barcode number printed on the pack */
  hsn: string;
  gstRate: number;
  barcode: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; te: string; en: string };
const text = (v: unknown, max: number): string | null => (v === undefined || v === null ? "" : typeof v === "string" && v.trim().length <= max ? v.trim() : null);
const bad = (te: string, en: string) => ({ ok: false as const, te, en });

export function parsePackedProduct(d: Record<string, unknown>): Parsed<PackedProduct> {
  const nameTe = text(d.nameTe, 120);
  const nameEn = text(d.nameEn, 120);
  if (nameTe === null || nameEn === null || (!nameTe && !nameEn)) return bad("ఉత్పత్తి పేరు రాయండి (120 అక్షరాల లోపు).", "Enter the product name (up to 120 characters).");
  if (typeof d.netQty !== "number" || !Number.isFinite(d.netQty) || !(d.netQty > 0) || d.netQty > 100000) return bad("నికర పరిమాణం 0 కంటే ఎక్కువ ఉండాలి.", "Net quantity must be more than 0.");
  if (!(NET_UNITS as readonly unknown[]).includes(d.netUnit)) return bad("కొలత g, kg, ml, L లేదా pcs అయి ఉండాలి.", "Unit must be g, kg, ml, L or pcs.");
  if (typeof d.mrp !== "number" || !Number.isFinite(d.mrp) || !(d.mrp > 0) || d.mrp > 1000000) return bad("MRP 0 కంటే ఎక్కువ ఉండాలి.", "MRP must be more than 0.");
  if (typeof d.shelfLifeDays !== "number" || !Number.isInteger(d.shelfLifeDays) || d.shelfLifeDays < 1 || d.shelfLifeDays > 1095) return bad("నిల్వ ఉండే రోజులు 1 నుండి 1095 మధ్య ఉండాలి.", "Shelf life must be 1 to 1095 days.");
  const vegType = d.vegType === undefined ? "veg" : d.vegType;
  if (!(VEG_TYPES as readonly unknown[]).includes(vegType)) return bad("శాకాహారం / మాంసాహారం ఎంచుకోండి.", "Choose veg or non-veg.");
  const dateKind = d.dateKind === undefined ? "bestBefore" : d.dateKind;
  if (!(DATE_KINDS as readonly unknown[]).includes(dateKind)) return bad("తేదీ రకం సరిగా లేదు.", "Date kind is not valid.");
  const ingredientsText = text(d.ingredientsText, 1000);
  const allergensText = text(d.allergensText, 300);
  const storageText = text(d.storageText, 300);
  const nutritionText = text(d.nutritionText, 1000);
  const dishId = text(d.dishId, 200);
  if (ingredientsText === null || allergensText === null || storageText === null || nutritionText === null || dishId === null) return bad("లేబుల్ వివరాలు చాలా పెద్దవి.", "Label text is too long.");
  if (d.active !== undefined && typeof d.active !== "boolean") return bad("active true/false అయి ఉండాలి.", "active must be true or false.");
  const hsn = text(d.hsn, 8);
  if (hsn === null || (hsn && !/^\d{4,8}$/.test(hsn))) return bad("HSN కోడ్ 4 నుండి 8 అంకెలు.", "HSN code must be 4 to 8 digits.");
  const gstRate = d.gstRate === undefined || d.gstRate === null ? 0 : d.gstRate;
  if (typeof gstRate !== "number" || !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 28) return bad("GST % 0 నుండి 28 మధ్య ఉండాలి.", "GST % must be between 0 and 28.");
  const barcode = text(d.barcode, 32);
  if (barcode === null || (barcode && !/^[A-Za-z0-9-]+$/.test(barcode))) return bad("బార్‌కోడ్ లో అక్షరాలు, అంకెలు మాత్రమే (32 లోపు).", "Barcode may only have letters and digits (up to 32).");
  return {
    ok: true,
    value: { nameTe, nameEn, netQty: d.netQty, netUnit: d.netUnit as PackedProduct["netUnit"], mrp: Math.round(d.mrp * 100) / 100, shelfLifeDays: d.shelfLifeDays, vegType: vegType as PackedProduct["vegType"], dateKind: dateKind as PackedProduct["dateKind"], ingredientsText, allergensText, storageText, nutritionText, dishId, active: d.active !== false, hsn, gstRate, barcode },
  };
}

/** Expiry of a pack: packed day + shelf life in days. */
export function expiryFor(packedDay: string, shelfLifeDays: number): string {
  return addDays(packedDay, shelfLifeDays);
}

/** Batch number of a run: YYMMDD of the packing day + the product's run number, e.g. 261118-03. */
export function batchNoFor(packedDay: string, runNumber: number): string {
  return `${packedDay.slice(2).replace(/-/g, "")}-${String(Math.max(1, runNumber)).padStart(2, "0")}`;
}

export interface PackRun {
  packs: number;
  packedDay: string;
  batchNo: string;
}

/** A run: whole packs 1–100000, a real day not after `today` and not more than 60 days back, optional batch number. */
export function parsePackRun(d: Record<string, unknown>, today: string): Parsed<PackRun> {
  if (typeof d.packs !== "number" || !Number.isInteger(d.packs) || d.packs < 1 || d.packs > 100000) return bad("ఎన్ని ప్యాక్‌లో పూర్ణ సంఖ్యలో రాయండి.", "Enter the number of packs as a whole number.");
  const day = d.packedDay === undefined || d.packedDay === "" ? today : d.packedDay;
  if (typeof day !== "string" || !isValidDay(day) || day > today || day < addDays(today, -60)) return bad("ప్యాక్ చేసిన తేదీ సరిగా లేదు (ఈరోజు లేదా గత 60 రోజుల్లో).", "Packing date is not valid (today or within the last 60 days).");
  const batchNo = text(d.batchNo, 40);
  if (batchNo === null || (batchNo && !/^[A-Za-z0-9 ./_-]+$/.test(batchNo))) return bad("బ్యాచ్ నంబర్ లో అక్షరాలు, అంకెలు మాత్రమే ఉండాలి.", "Batch number may only have letters, digits and . / _ -");
  return { ok: true, value: { packs: d.packs, packedDay: day, batchNo } };
}

export interface LabelBusiness {
  name: string;
  address: string;
  phone: string;
  fssaiNumber: string;
}

export type LabelGap = "name" | "ingredients" | "allergens" | "storage" | "makerName" | "makerAddress" | "fssai" | "phone" | "nutrition";

/**
 * What is still missing for the label. `must` = the pack should not be sold without it; `check` = ask your food
 * licence consultant whether it applies to this product. (The list follows the usual label declarations; it is a
 * reminder for the owner, not legal advice.)
 */
export function labelGaps(p: Pick<PackedProduct, "nameTe" | "nameEn" | "ingredientsText" | "allergensText" | "storageText" | "nutritionText">, b: LabelBusiness): { must: LabelGap[]; check: LabelGap[] } {
  const must: LabelGap[] = [];
  const check: LabelGap[] = [];
  if (!p.nameEn.trim()) must.push("name"); // the label carries the name in English
  if (!p.ingredientsText.trim()) must.push("ingredients");
  if (!b.name.trim()) must.push("makerName");
  if (!b.address.trim()) must.push("makerAddress");
  if (!/^\d{14}$/.test(b.fssaiNumber.replace(/\s/g, ""))) must.push("fssai");
  if (!b.phone.trim()) must.push("phone");
  if (!p.allergensText.trim()) check.push("allergens");
  if (!p.storageText.trim()) check.push("storage");
  if (!p.nutritionText.trim()) check.push("nutrition");
  return { must, check };
}

/** "250 g", "1 kg", "12 pcs" */
export function netText(qty: number, unit: string): string {
  return `${Math.round(qty * 1000) / 1000} ${unit}`;
}

// ---- X5: selling packs ----

export const SALE_METHODS = ["Cash", "UPI", "Card", "Bank", "Credit"] as const;

export interface PackSale {
  packs: number;
  /** price charged per pack, inclusive of tax — never above the MRP printed on the pack */
  pricePerPack: number;
  method: (typeof SALE_METHODS)[number];
  customerName: string;
  phone: string;
  saleDay: string;
}

/**
 * A sale: whole packs, a price per pack from above 0 up to the MRP (a pack may be sold below MRP, never above —
 * the printed MRP is the legal ceiling), a payment method, an optional customer, and a day (today or up to 7 days back).
 */
export function parsePackSale(d: Record<string, unknown>, mrp: number, today: string): Parsed<PackSale> {
  if (typeof d.packs !== "number" || !Number.isInteger(d.packs) || d.packs < 1 || d.packs > 100000) return bad("ఎన్ని ప్యాక్‌లో పూర్ణ సంఖ్యలో రాయండి.", "Enter the number of packs as a whole number.");
  const price = d.pricePerPack === undefined || d.pricePerPack === null ? mrp : d.pricePerPack;
  if (typeof price !== "number" || !Number.isFinite(price) || !(price > 0)) return bad("ప్యాక్ ధర 0 కంటే ఎక్కువ ఉండాలి.", "Price per pack must be more than 0.");
  if (Math.round(price * 100) > Math.round(mrp * 100)) return bad(`MRP (₹${mrp}) కంటే ఎక్కువ ధరకు అమ్మకూడదు.`, `A pack cannot be sold above its MRP (₹${mrp}).`);
  const method = d.method === undefined ? "Cash" : d.method;
  if (!(SALE_METHODS as readonly unknown[]).includes(method)) return bad("చెల్లింపు విధానం సరిగా లేదు.", "Payment method is not valid.");
  const customerName = text(d.customerName, 120);
  const phone = text(d.phone, 20);
  if (customerName === null || phone === null || (phone && !/^[0-9+ -]{6,20}$/.test(phone))) return bad("కస్టమర్ పేరు / ఫోన్ సరిగా లేదు.", "Customer name or phone is not valid.");
  if (method === "Credit" && !customerName) return bad("అప్పు మీద అమ్మితే కస్టమర్ పేరు రాయాలి.", "A credit sale needs the customer's name.");
  const day = d.saleDay === undefined || d.saleDay === "" ? today : d.saleDay;
  if (typeof day !== "string" || !isValidDay(day) || day > today || day < addDays(today, -7)) return bad("అమ్మిన తేదీ సరిగా లేదు (ఈరోజు లేదా గత 7 రోజుల్లో).", "Sale date is not valid (today or within the last 7 days).");
  return { ok: true, value: { packs: d.packs, pricePerPack: Math.round(price * 100) / 100, method: method as PackSale["method"], customerName, phone, saleDay: day } };
}

export interface SaleMoney {
  amount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  tax: number;
  gstRate: number;
  discountFromMrp: number;
}

/**
 * Money of a sale. The price already includes tax; when the business is GST-registered and the product has a rate,
 * the tax inside it is split out (taxable = amount × 100 ÷ (100 + rate)), half CGST and half SGST. Otherwise no tax.
 */
export function saleMoney(packs: number, pricePerPack: number, mrp: number, gstRate: number, gstRegistered: boolean): SaleMoney {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const amount = r2(packs * pricePerPack);
  const rate = gstRegistered && gstRate > 0 ? gstRate : 0;
  const taxable = rate ? r2((amount * 100) / (100 + rate)) : amount;
  const tax = r2(amount - taxable);
  const cgst = r2(tax / 2);
  return { amount, taxable, cgst, sgst: r2(tax - cgst), tax, gstRate: rate, discountFromMrp: r2(Math.max(0, packs * mrp - amount)) };
}

/** Packs that may be sold now: in stock minus the packs past their expiry date. */
export function sellablePacks(quantityInStock: number, expiredQty: number): number {
  return Math.max(0, Math.floor(quantityInStock - Math.max(0, expiredQty)));
}

/** Sale number: PS-YYMMDD-NNN (N counts the sales of that day). */
export function saleNumber(saleDay: string, n: number): string {
  return `PS-${saleDay.slice(2).replace(/-/g, "")}-${String(Math.max(1, n)).padStart(3, "0")}`;
}
