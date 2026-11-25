import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { readAllergens, type Allergen } from "./foodTags";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import { db, storage } from "../firebase";
import type { BankDetails, LeadAssignConfig, LeadTatConfig, MonthlyPayRules, SetupProgress } from "./functions";
import { CALC_AREAS, DEFAULT_CALC_MODES, type CalcModes } from "./calcMode";

/** `settings/business` (docs/data-model.md). Written only through saveBusinessSettings. */
/** Module 5e: one food-safety checklist as the owner wrote it (settings.foodSafety). */
export interface SafetyChecklist {
  id: string;
  kind: string;
  te: string;
  en: string;
  active: boolean;
  /** "HH:MM" IST — the owner wants this done daily by then; "" = no reminder */
  dailyBy: string;
  items: { key: string; te: string; en: string; type: "yesno" | "number"; min: number | null; max: number | null; unit: string }[];
}
function readChecklists(raw: unknown): SafetyChecklist[] {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      id: s(c.id),
      kind: s(c.kind) || "other",
      te: s(c.te),
      en: s(c.en),
      active: c.active !== false,
      dailyBy: s(c.dailyBy),
      items: (Array.isArray(c.items) ? c.items : [])
        .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
        .map((i) => ({ key: s(i.key), te: s(i.te), en: s(i.en), type: i.type === "number" ? ("number" as const) : ("yesno" as const), min: n(i.min), max: n(i.max), unit: s(i.unit) })),
    }));
}

export interface BusinessSettings {
  name: string;
  logoUrl: string;
  address: string;
  phone: string;
  fssaiNumber: string;
  bank: BankDetails;
  upiId: string;
  signatureUrl: string;
  terms: string;
  /** Bill (invoice) terms; quotations print `terms`. "" = not set (server default applies on new invoices). */
  invoiceTerms: string;
  gstRegistered: boolean;
  gstin: string;
  defaultGstRate: number;
  profitMarginPct: number;
  seasonWeights: number[];
  monthlyPayRules: MonthlyPayRules;
  setupProgress: SetupProgress | null;
  /** Manual / automatic per area (default all "auto"). */
  calcModes: CalcModes;
  /** Managers may enter values by hand (default true). */
  managerCanOverride: boolean;
  /** Take stock out automatically when an event is Completed (default true). */
  autoStockDeduct: boolean;
  /** Module 1a: who gets a new lead (default off). */
  leadAssign: LeadAssignConfig;
  /** Module 1b: first response within N minutes (default on, 15, owner told). */
  leadTat: LeadTatConfig;
  /** Module 2d: daily expiry notice (default on, 7 days ahead). */
  expiryAlert: { on: boolean; days: number };
  /** Module 3a */
  poApproval: { on: boolean; managerLimit: number };
  /** Module 4d */
  stockAdjust: { on: boolean; percent: number };
  /** Module 5e */
  foodSafety: { checklists: SafetyChecklist[] };
  /** Module 5h: the owner's allergen list (none until he writes it) */
  allergens: Allergen[];
  /** Module 4d */
  sod: { on: boolean; minAmount: number; ownerExempt: boolean };
  /** Module 2g: reserve stock for confirmed events (default on, next 30 days). */
  stockReserve: { on: boolean; days: number };
  /** Module 2h: pack unit names offered on purchases (Bag, Tin …). */
  uomPacks: string[];
  /** Round 7: legal entity / brand; documents show "brand (a brand of legal)" only when legalNameOnDocs. */
  legalName: string;
  brandName: string;
  legalNameOnDocs: boolean;
  /** Round 11: Target Board shows ₹ sales to managers and staff (default false = % only). */
  targetBoardShowRupeesToAll: boolean;
  /** R10-5 (server-normalised; an old plain-number fixedMonthlyCosts counts as "other"). */
  fixedCostParts: { kitchenRent: number; other: number };
  googleReviewUrl: string;
  vendorPriceAlertPct: number;
  targetMarginPct: number;
  labourPerPlate: number;
  overheadPerPlate: number;
  lunchBoxPrice: number;
  /** R10-8: message type → Meta template name. */
  whatsappTemplates: Record<string, string>;
}

/** Reads settings.leadAssign defensively (the server validates on save). */
function toLeadAssign(raw: unknown): LeadAssignConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pool = Array.isArray(o.pool) ? [...new Set(o.pool.filter((u): u is string => typeof u === "string" && u !== ""))] : [];
  const rules = Array.isArray(o.rules)
    ? o.rules
        .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
        .filter((r) => typeof r.source === "string" && typeof r.uid === "string" && r.uid !== "")
        .map((r) => ({ source: r.source as string, uid: r.uid as string }))
    : [];
  return { auto: o.auto === true, mode: o.mode === "rules" ? "rules" : "roundRobin", pool, rules };
}

/** Same defaults as functions/src/stock/batchRules.ts normalizeExpiryAlert. */
function toExpiryAlert(raw: unknown): { on: boolean; days: number } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = o.days;
  return { on: o.on === undefined ? true : o.on === true, days: typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 90 ? d : 7 };
}

/** Same defaults as functions/src/leads/tatRules.ts normalizeLeadTat. */
function toLeadTat(raw: unknown): LeadTatConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const m = o.minutes;
  return {
    on: o.on === undefined ? true : o.on === true,
    minutes: typeof m === "number" && Number.isInteger(m) && m >= 5 && m <= 1440 ? m : 15,
    escalate: o.escalate === undefined ? true : o.escalate === true,
  };
}

export const DEFAULT_PHONE = "9966649469";

/** Owner's rule for monthly staff (requirements H3, contract decision 3): no cut for absences, no OT. */
export const DEFAULT_PAY_RULES: MonthlyPayRules = { deductAbsences: false, freeLeaves: 0, overtime: false };

export const DEFAULT_SETTINGS: BusinessSettings = {
  name: "సుశీల క్యాటరింగ్స్ / Suseela Caterings",
  logoUrl: "",
  address: "",
  phone: DEFAULT_PHONE,
  fssaiNumber: "",
  bank: { name: "", account: "", ifsc: "" },
  upiId: "",
  signatureUrl: "",
  terms: "",
  invoiceTerms: "",
  gstRegistered: false,
  gstin: "",
  defaultGstRate: 0,
  profitMarginPct: 25,
  seasonWeights: Array(12).fill(1),
  monthlyPayRules: DEFAULT_PAY_RULES,
  setupProgress: null,
  calcModes: DEFAULT_CALC_MODES,
  managerCanOverride: true,
  autoStockDeduct: true,
  leadAssign: { auto: false, mode: "roundRobin", pool: [], rules: [] },
  leadTat: { on: true, minutes: 15, escalate: true },
  expiryAlert: { on: true, days: 7 },
  poApproval: { on: true, managerLimit: 10000 },
  stockAdjust: { on: true, percent: 30 },
  foodSafety: { checklists: [] },
  allergens: [],
  sod: { on: true, minAmount: 10000, ownerExempt: true },
  stockReserve: { on: true, days: 30 },
  uomPacks: ["Packet", "Box", "Bag", "Tin", "Bottle", "Bundle", "Crate", "Tray", "Can", "Cylinder", "Block"],
  legalName: "Suseela Technologies Private Limited",
  brandName: "Suseela Caterings",
  legalNameOnDocs: false,
  targetBoardShowRupeesToAll: false,
  fixedCostParts: { kitchenRent: 53000, other: 0 },
  googleReviewUrl: "",
  vendorPriceAlertPct: 5,
  targetMarginPct: 30,
  labourPerPlate: 0,
  overheadPerPlate: 0,
  lunchBoxPrice: 170,
  whatsappTemplates: {},
};

/** "Pvt Ltd" short form used in the document line. */
function shortLegal(legal: string): string {
  return legal.replace(/Private Limited$/i, "Pvt Ltd").trim();
}

/** "Suseela Caterings (a brand of Suseela Technologies Pvt Ltd)" — or just the brand while the switch is off. */
export function docBrandLine(brand: string, legal: string, onDocs: boolean): string {
  const b = brand.trim() || DEFAULT_SETTINGS.brandName;
  return onDocs && legal.trim() ? `${b} (a brand of ${shortLegal(legal)})` : b;
}

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

function toSettings(data: DocumentData | undefined): BusinessSettings {
  if (!data) return DEFAULT_SETTINGS;
  const bank = (data.bank ?? {}) as DocumentData;
  const rules = (data.monthlyPayRules ?? {}) as DocumentData;
  const weights = Array.isArray(data.seasonWeights) && data.seasonWeights.length === 12
    ? data.seasonWeights.map((w: unknown) => num(w, 1))
    : DEFAULT_SETTINGS.seasonWeights;
  const progress = data.setupProgress;
  return {
    name: str(data.name, DEFAULT_SETTINGS.name),
    logoUrl: str(data.logoUrl),
    address: str(data.address),
    phone: str(data.phone) || DEFAULT_PHONE,
    fssaiNumber: str(data.fssaiNumber),
    bank: { name: str(bank.name), account: str(bank.account), ifsc: str(bank.ifsc) },
    upiId: str(data.upiId),
    signatureUrl: str(data.signatureUrl),
    terms: str(data.terms),
    invoiceTerms: str(data.invoiceTerms),
    gstRegistered: data.gstRegistered === true,
    gstin: str(data.gstin),
    defaultGstRate: num(data.defaultGstRate),
    profitMarginPct: num(data.profitMarginPct, 25),
    seasonWeights: weights,
    monthlyPayRules: {
      deductAbsences: bool(rules.deductAbsences, DEFAULT_PAY_RULES.deductAbsences),
      freeLeaves: Math.max(0, Math.round(num(rules.freeLeaves, DEFAULT_PAY_RULES.freeLeaves))),
      overtime: bool(rules.overtime, DEFAULT_PAY_RULES.overtime),
    },
    setupProgress: progress && typeof progress === "object" ? (progress as SetupProgress) : null,
    calcModes: Object.fromEntries(
      CALC_AREAS.map((a) => [a, (data.calcModes as DocumentData | undefined)?.[a] === "manual" ? "manual" : "auto"]),
    ) as CalcModes,
    managerCanOverride: data.managerCanOverride !== false,
    autoStockDeduct: data.autoStockDeduct !== false,
    leadAssign: toLeadAssign(data.leadAssign),
    leadTat: toLeadTat(data.leadTat),
    expiryAlert: toExpiryAlert(data.expiryAlert),
    sod: ((o: { on?: unknown; minAmount?: unknown; ownerExempt?: unknown }) => ({
      on: o.on !== false,
      minAmount: typeof o.minAmount === "number" && Number.isFinite(o.minAmount) && o.minAmount >= 0 ? o.minAmount : 10000,
      ownerExempt: o.ownerExempt !== false,
    }))((data.sod ?? {}) as { on?: unknown; minAmount?: unknown; ownerExempt?: unknown }),
    foodSafety: { checklists: readChecklists((data.foodSafety as { checklists?: unknown } | undefined)?.checklists) },
    allergens: readAllergens(data.allergens),
    stockAdjust: ((o: { on?: unknown; percent?: unknown }) => ({
      on: o.on !== false,
      percent: typeof o.percent === "number" && Number.isFinite(o.percent) && o.percent >= 0 && o.percent <= 100 ? o.percent : 30,
    }))((data.stockAdjust ?? {}) as { on?: unknown; percent?: unknown }),
    poApproval: {
      on: (data.poApproval as { on?: unknown } | undefined)?.on !== false,
      managerLimit: ((v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 10000))((data.poApproval as { managerLimit?: unknown } | undefined)?.managerLimit),
    },
    uomPacks: Array.isArray(data.uomPacks) ? data.uomPacks.filter((x: unknown): x is string => typeof x === "string" && x.trim() !== "") : DEFAULT_SETTINGS.uomPacks,
    stockReserve: { on: toExpiryAlert(data.stockReserve).on, days: toExpiryAlert({ days: (data.stockReserve as { days?: unknown } | undefined)?.days ?? 30 }).days },
    legalName: str(data.legalName) || DEFAULT_SETTINGS.legalName,
    brandName: str(data.brandName) || DEFAULT_SETTINGS.brandName,
    legalNameOnDocs: data.legalNameOnDocs === true,
    targetBoardShowRupeesToAll: data.targetBoardShowRupeesToAll === true,
    fixedCostParts: fixedParts(data.fixedMonthlyCosts),
    googleReviewUrl: str(data.googleReviewUrl),
    vendorPriceAlertPct: num(data.vendorPriceAlertPct, num(data.priceRiseAlertPct, 5)),
    targetMarginPct: num(data.targetMarginPct, 30),
    labourPerPlate: num(data.labourPerPlate),
    overheadPerPlate: num(data.overheadPerPlate),
    lunchBoxPrice: num(data.lunchBoxPrice, 170),
    whatsappTemplates: Object.fromEntries(
      Object.entries((data.whatsappTemplates ?? {}) as DocumentData).filter(([, v]) => typeof v === "string" && v.trim() !== "") as [string, string][],
    ),
  };
}

/** `fixedMonthlyCosts`: { kitchenRent, other } (R10-5) or an old plain number (= other); missing = owner default rent. */
function fixedParts(v: unknown): { kitchenRent: number; other: number } {
  if (typeof v === "number" && Number.isFinite(v)) return { kitchenRent: 0, other: v };
  if (v && typeof v === "object") {
    const o = v as DocumentData;
    return { kitchenRent: num(o.kitchenRent), other: num(o.other) };
  }
  return DEFAULT_SETTINGS.fixedCostParts;
}

export function subscribeBusinessSettings(
  onData: (s: BusinessSettings) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, "settings", "business"),
    (snap) => onData(toSettings(snap.exists() ? snap.data() : undefined)),
    (e) => {
      onData(DEFAULT_SETTINGS);
      onError?.(e);
    },
  );
}

/** Live business settings (falls back to defaults, e.g. phone 9966649469, while loading or if unreadable). */
export function useBusinessSettings(): { settings: BusinessSettings; loaded: boolean } {
  const [state, setState] = useState<{ settings: BusinessSettings; loaded: boolean }>({
    settings: DEFAULT_SETTINGS,
    loaded: false,
  });
  useEffect(() => subscribeBusinessSettings((settings) => setState({ settings, loaded: true })), []);
  return state;
}

/** Setup progress 0–100 (`setupProgress.pct`, contract decision 7). */
export function progressPercent(progress: SetupProgress | null | undefined): number {
  const pct = progress?.pct;
  return typeof pct === "number" && Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
}

/** Uploads a logo / signature image to Storage `settings/` and returns its download URL. */
export async function uploadSettingsImage(file: File, kind: "logo" | "signature"): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const fileRef = ref(storage, `settings/${kind}-${Date.now()}.${ext || "png"}`);
  await uploadBytes(fileRef, file, { contentType: file.type || "image/png" });
  return getDownloadURL(fileRef);
}

/** Module 2h: units whose conversion never changes — always offered, never removable. */
export const FIXED_UOMS = ["Kg", "Gram", "Litre", "ML", "Piece", "Dozen"];
