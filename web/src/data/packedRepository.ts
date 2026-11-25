import { collection, type DocumentData, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";

/** Module 2f — packed products (server-written; saved through savePackedProduct, packed through recordPacking). */
export const NET_UNITS = ["g", "kg", "ml", "L", "pcs"] as const;

export interface PackedProduct {
  id: string;
  nameTe: string;
  nameEn: string;
  netQty: number;
  netUnit: string;
  mrp: number;
  shelfLifeDays: number;
  vegType: "veg" | "nonveg";
  dateKind: "bestBefore" | "useBy";
  ingredientsText: string;
  allergensText: string;
  storageText: string;
  nutritionText: string;
  dishId: string;
  active: boolean;
  branchId: string;
  inventoryItemId: string;
  runCount: number;
  lastPackedDay: string;
  hsn: string;
  gstRate: number;
  barcode: string;
}

/** X5 — one sale of packs (packedSales, written by the server). */
export interface PackedSale {
  id: string;
  saleNumber: string;
  productId: string;
  productName: string;
  packs: number;
  pricePerPack: number;
  amount: number;
  tax: number;
  method: string;
  customerName: string;
  saleDay: string;
  cancelled: boolean;
}

export const SALE_METHODS = ["Cash", "UPI", "Card", "Bank", "Credit"] as const;

/** Sales of one branch from `fromDay` on (YYYY-MM-DD), newest first. Owner / managers only (rules). */
export function subscribePackedSales(branchId: string, fromDay: string, onData: (rows: PackedSale[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "packedSales"), where("branchId", "==", branchId)),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            return { id: d.id, saleNumber: s(x.saleNumber), productId: s(x.productId), productName: s(x.productNameEn) || s(x.productNameTe), packs: n(x.packs), pricePerPack: n(x.pricePerPack), amount: n(x.amount), tax: n(x.tax), method: s(x.method), customerName: s(x.customerName), saleDay: s(x.saleDay), cancelled: x.status === "Cancelled" };
          })
          .filter((r) => r.saleDay >= fromDay)
          .sort((a, b) => b.saleNumber.localeCompare(a.saleNumber)),
      ),
    (e) => onError?.(e),
  );
}

export interface PackRun {
  id: string;
  runNumber: number;
  packs: number;
  packedDay: string;
  expiryDay: string;
  batchNo: string;
  mrp: number;
  netQty: number;
  netUnit: string;
  byName: string;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function toProduct(id: string, d: DocumentData): PackedProduct {
  return {
    id,
    nameTe: s(d.nameTe),
    nameEn: s(d.nameEn),
    netQty: n(d.netQty),
    netUnit: s(d.netUnit) || "g",
    mrp: n(d.mrp),
    shelfLifeDays: n(d.shelfLifeDays),
    vegType: d.vegType === "nonveg" ? "nonveg" : "veg",
    dateKind: d.dateKind === "useBy" ? "useBy" : "bestBefore",
    ingredientsText: s(d.ingredientsText),
    allergensText: s(d.allergensText),
    storageText: s(d.storageText),
    nutritionText: s(d.nutritionText),
    dishId: s(d.dishId),
    active: d.active !== false,
    branchId: s(d.branchId),
    inventoryItemId: s(d.inventoryItemId),
    runCount: n(d.runCount),
    lastPackedDay: s(d.lastPackedDay),
    hsn: s(d.hsn),
    gstRate: n(d.gstRate),
    barcode: s(d.barcode),
  };
}

/** branchId === null → all branches (owner's combined view). */
export function subscribePackedProducts(branchId: string | null, onData: (rows: PackedProduct[]) => void, onError?: (e: Error) => void): () => void {
  const col = collection(db, "packedProducts");
  return onSnapshot(
    branchId ? query(col, where("branchId", "==", branchId)) : col,
    (snap) => onData(snap.docs.map((d) => toProduct(d.id, d.data())).sort((a, b) => (a.nameEn || a.nameTe).localeCompare(b.nameEn || b.nameTe))),
    (e) => onError?.(e),
  );
}

/** The newest packing runs of one product. */
export function subscribePackRuns(productId: string, onData: (rows: PackRun[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "packedProducts", productId, "runs"), orderBy("at", "desc"), limit(20)),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, runNumber: n(x.runNumber), packs: n(x.packs), packedDay: s(x.packedDay), expiryDay: s(x.expiryDay), batchNo: s(x.batchNo), mrp: n(x.mrp), netQty: n(x.netQty), netUnit: s(x.netUnit), byName: s(x.byName) };
        }),
      ),
    (e) => onError?.(e),
  );
}

export interface LabelBusiness {
  name: string;
  address: string;
  phone: string;
  fssaiNumber: string;
}

export type LabelGap = "name" | "ingredients" | "allergens" | "storage" | "makerName" | "makerAddress" | "fssai" | "phone" | "nutrition";

/** Same rule as functions/src/packed/packRules.ts labelGaps. */
export function labelGaps(p: Pick<PackedProduct, "nameEn" | "ingredientsText" | "allergensText" | "storageText" | "nutritionText">, b: LabelBusiness): { must: LabelGap[]; check: LabelGap[] } {
  const must: LabelGap[] = [];
  const check: LabelGap[] = [];
  if (!p.nameEn.trim()) must.push("name");
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

export const GAP_LABEL: Record<LabelGap, { te: string; en: string }> = {
  name: { te: "English పేరు", en: "Name in English" },
  ingredients: { te: "పదార్థాల జాబితా", en: "Ingredients list" },
  allergens: { te: "అలెర్జీ సమాచారం", en: "Allergen information" },
  storage: { te: "నిల్వ చేసే విధానం", en: "Storage instructions" },
  makerName: { te: "వ్యాపారం పేరు (Settings)", en: "Business name (Settings)" },
  makerAddress: { te: "వ్యాపారం చిరునామా (Settings)", en: "Business address (Settings)" },
  fssai: { te: "FSSAI లైసెన్స్ నంబర్, 14 అంకెలు (Settings)", en: "FSSAI licence number, 14 digits (Settings)" },
  phone: { te: "కస్టమర్ కేర్ ఫోన్ (Settings)", en: "Customer care phone (Settings)" },
  nutrition: { te: "పోషక విలువల సమాచారం", en: "Nutrition information" },
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dmy = (day: string) => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : day);

/** One label as HTML (English, as labels are printed), for the preview and for printing. All text is escaped. */
export function labelHtml(p: PackedProduct, run: { batchNo: string; packedDay: string; expiryDay: string; mrp: number; netQty: number; netUnit: string }, b: LabelBusiness): string {
  const color = p.vegType === "veg" ? "#0a8a0a" : "#8b4513";
  const mark = `<span style="display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:16px;height:16px;border:2px solid ${color};vertical-align:middle"><span style="display:block;width:8px;height:8px;border-radius:50%;background:${color}"></span></span>`;
  const row = (k: string, v: string) => (v.trim() ? `<div><b>${esc(k)}:</b> ${esc(v)}</div>` : "");
  return `<div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.35;border:1px solid #000;padding:8px;width:260px;box-sizing:border-box;color:#000;background:#fff">
<div style="font-size:15px;font-weight:700">${mark} ${esc(p.nameEn || p.nameTe)}</div>
${p.nameEn && p.nameTe ? `<div>${esc(p.nameTe)}</div>` : ""}
${row("Ingredients", p.ingredientsText)}
${row("Allergen information", p.allergensText)}
${row("Nutrition", p.nutritionText)}
<div><b>Net quantity:</b> ${esc(String(Math.round(run.netQty * 1000) / 1000))} ${esc(run.netUnit)}</div>
<div><b>MRP:</b> ₹${esc(run.mrp.toFixed(2))} (inclusive of all taxes)</div>
<div><b>Batch no.:</b> ${esc(run.batchNo)}</div>
<div><b>Packed on:</b> ${esc(dmy(run.packedDay))}</div>
<div><b>${p.dateKind === "useBy" ? "Use by" : "Best before"}:</b> ${esc(dmy(run.expiryDay))}</div>
${row("Storage", p.storageText)}
<div style="margin-top:4px"><b>Manufactured &amp; packed by:</b> ${esc(b.name)}${b.address ? `, ${esc(b.address)}` : ""}</div>
${row("FSSAI Lic. No.", b.fssaiNumber)}
${row("Customer care", b.phone)}
${row("Barcode", p.barcode)}
</div>`;
}
