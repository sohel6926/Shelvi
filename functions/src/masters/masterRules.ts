/**
 * Module 5a (19 Nov 2026) — Master Data Freeze 01: Company -> Brand -> Branch -> Kitchen -> Store.
 * Spec text: docs/spec/MDF-01-company-brand-branch.txt. Pure rules; tested in test/module5a.test.ts.
 *
 * Frozen decisions kept here: a Brand belongs to exactly one Company (F-01/F-02); a Branch belongs to one Company
 * and may serve several Brands (F-08, §24 — never one-to-one); Kitchens and Stores hang under a Branch and are
 * different objects (F-06/F-07); a Store may sit inside a Kitchen of the same Branch; nothing is ever deleted —
 * a master is Draft / Active / Temporarily inactive / Archived (§19, F-10).
 */
type AnyDoc = Record<string, unknown>;
export type Res<T> = { ok: true; value: T } | { ok: false; te: string; en: string };
const bad = (te: string, en: string) => ({ ok: false as const, te, en });

export const MASTER_KINDS = ["company", "brand", "branch", "kitchen", "store"] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];
export const MASTER_COLLECTION: Record<MasterKind, string> = { company: "companies", brand: "brands", branch: "branches", kitchen: "kitchens", store: "stores" };
const PREFIX: Record<MasterKind, string> = { company: "COM", brand: "BRD", branch: "BRN", kitchen: "KIT", store: "STR" };
/** §17 display IDs: COM-0001, BRD-0001 … */
export const masterCode = (kind: MasterKind, n: number): string => `${PREFIX[kind]}-${String(Math.max(1, Math.floor(n))).padStart(4, "0")}`;

export const MASTER_STATUSES = ["draft", "active", "inactive", "archived"] as const;
export type MasterStatus = (typeof MASTER_STATUSES)[number];
export const isMasterStatus = (v: unknown): v is MasterStatus => typeof v === "string" && (MASTER_STATUSES as readonly string[]).includes(v);
/** Old branch documents have `active: true/false` and no status. */
export const statusOf = (d: AnyDoc): MasterStatus => (isMasterStatus(d.status) ? d.status : d.active === false ? "inactive" : "active");
/** A record others may be newly attached to. */
export const isUsable = (d: AnyDoc): boolean => statusOf(d) === "active" || statusOf(d) === "draft";

export const BRAND_TYPES = ["pureVeg", "nonVeg", "mixed", "corporate", "wedding", "religious", "cloudKitchen", "eventFood", "other"] as const;
export const BRANCH_TYPES = ["sales", "kitchen", "fullOperations", "officeOnly", "warehouseOnly", "dispatchHub", "combination"] as const;
export const KITCHEN_TYPES = ["central", "veg", "nonVeg", "mixed", "sweet", "bakery", "prep", "satellite", "eventSite"] as const;
export const KITCHEN_SECTIONS = ["vegPrep", "rice", "curry", "fry", "nonVeg", "tiffin", "sweet", "bakery", "liveCounterPrep", "packing", "washing"] as const;
export const STORE_TYPES = ["main", "grocery", "dry", "vegetable", "fruit", "dairy", "cold", "freezer", "nonVegCold", "beverage", "packing", "cleaning", "equipment", "gasFuel", "return", "quarantine", "scrap", "transit"] as const;
/** §14 rules 7 and 9: stock in these stores is not issued normally. */
export const NO_ISSUE_STORE_TYPES: readonly string[] = ["quarantine", "scrap"];

const text = (d: AnyDoc, f: string, max: number): string => (typeof d[f] === "string" ? (d[f] as string).trim().replace(/\s+/g, " ").slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const many = (v: unknown, list: readonly string[]): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && list.includes(x)))] : []);
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "" && !x.includes("/")).map((x) => x.trim()))].slice(0, 50) : []);
const flag = (v: unknown): boolean => v === true;

/** GSTIN: 2-digit state code + 10-character PAN + entity number + "Z" + check character (15 characters). */
export const isGstin = (v: string): boolean => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v);
/** PAN: 5 letters, 4 digits, 1 letter. */
export const isPan = (v: string): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
const isPin = (v: string): boolean => /^[1-9][0-9]{5}$/.test(v);
const isMobile = (v: string): boolean => /^[6-9][0-9]{9}$/.test(v);
const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function address(raw: unknown): Res<AnyDoc> {
  const a = (typeof raw === "object" && raw !== null ? raw : {}) as AnyDoc;
  const out = { line1: text(a, "line1", 200), line2: text(a, "line2", 200), area: text(a, "area", 100), city: text(a, "city", 100), district: text(a, "district", 100), state: text(a, "state", 100), pin: text(a, "pin", 6), country: text(a, "country", 60) || "India" };
  if (out.pin && !isPin(out.pin)) return bad("PIN కోడ్ 6 అంకెలు ఉండాలి.", "The PIN code must be 6 digits.");
  return { ok: true, value: out };
}
function contact(d: AnyDoc): Res<{ mobile: string; email: string }> {
  const mobile = text(d, "mobile", 10);
  const email = text(d, "email", 120).toLowerCase();
  if (mobile && !isMobile(mobile)) return bad("మొబైల్ నంబర్ 10 అంకెలు ఉండాలి.", "The mobile number must be 10 digits.");
  if (email && !isEmail(email)) return bad("ఈమెయిల్ సరిగా లేదు.", "The email is not valid.");
  return { ok: true, value: { mobile, email } };
}

export function parseCompany(d: AnyDoc): Res<AnyDoc> {
  const legalName = text(d, "legalName", 200);
  if (!legalName) return bad("కంపెనీ చట్టబద్ధ పేరు రాయండి.", "Enter the company's legal name.");
  const gstRegistered = flag(d.gstRegistered);
  const gstin = text(d, "gstin", 15).toUpperCase();
  const pan = text(d, "pan", 10).toUpperCase();
  if (gstRegistered && !isGstin(gstin)) return bad("GSTIN సరిగా లేదు (15 అక్షరాలు).", "The GSTIN is not valid (15 characters).");
  if (!gstRegistered && gstin) return bad("GST నమోదు లేదని చెప్పారు — GSTIN ఖాళీగా ఉంచండి, లేదా నమోదు ఉందని గుర్తించండి.", "GST is marked as not registered — leave the GSTIN empty, or mark it registered.");
  if (pan && !isPan(pan)) return bad("PAN సరిగా లేదు (ఉదా: ABCDE1234F).", "The PAN is not valid (e.g. ABCDE1234F).");
  if (gstin && pan && gstin.slice(2, 12) !== pan) return bad("GSTIN లో ఉన్న PAN, రాసిన PAN ఒకటి కావు.", "The PAN inside the GSTIN and the PAN entered do not match.");
  const a = address(d.address);
  if (!a.ok) return a;
  const c = contact(d);
  if (!c.ok) return c;
  const fy = typeof d.fyStartMonth === "number" && d.fyStartMonth >= 1 && d.fyStartMonth <= 12 ? Math.floor(d.fyStartMonth) : 4;
  return { ok: true, value: { legalName, displayName: text(d, "displayName", 120) || legalName, shortName: text(d, "shortName", 40), companyType: text(d, "companyType", 60), registrationNumber: text(d, "registrationNumber", 40).toUpperCase(), gstRegistered, gstin, pan, tan: text(d, "tan", 10).toUpperCase(), stateCode: gstin ? gstin.slice(0, 2) : text(d, "stateCode", 2), address: a.value, ...c.value, website: text(d, "website", 200), fyStartMonth: fy } };
}

export function parseBrand(d: AnyDoc): Res<AnyDoc> {
  const name = text(d, "name", 120);
  const companyId = text(d, "companyId", 200);
  if (!name) return bad("బ్రాండ్ పేరు రాయండి.", "Enter the brand name.");
  if (!companyId || companyId.includes("/")) return bad("ఈ బ్రాండ్ ఏ కంపెనీదో ఎంచుకోండి.", "Choose the company this brand belongs to.");
  const c = contact(d);
  if (!c.ok) return c;
  const vegOnly = flag(d.vegOnly);
  return { ok: true, value: { name, companyId, shortName: text(d, "shortName", 40), businessTypes: many(d.businessTypes, BRAND_TYPES), ...c.value, whatsapp: text(d, "whatsapp", 10), website: text(d, "website", 200), tagline: text(d, "tagline", 200), invoiceDisplayName: text(d, "invoiceDisplayName", 120) || name, logoUrl: /^https:\/\//.test(text(d, "logoUrl", 800)) ? text(d, "logoUrl", 800) : "", quotationDisplayName: text(d, "quotationDisplayName", 120) || name, vegOnly, nonVegAllowed: !vegOnly && flag(d.nonVegAllowed) } };
}

/** Only the master fields of a branch; its name / active flag keep being edited where they always were. */
export function parseBranch(d: AnyDoc): Res<AnyDoc> {
  const name = text(d, "name", 120);
  const companyId = text(d, "companyId", 200);
  if (!name) return bad("శాఖ పేరు రాయండి.", "Enter the branch name.");
  if (!companyId || companyId.includes("/")) return bad("ఈ శాఖ ఏ కంపెనీదో ఎంచుకోండి.", "Choose the company this branch belongs to.");
  const a = address(d.address);
  if (!a.ok) return a;
  const c = contact(d);
  if (!c.ok) return c;
  const maxEvents = typeof d.maxEventsPerDay === "number" && d.maxEventsPerDay >= 0 && d.maxEventsPerDay <= 500 ? Math.floor(d.maxEventsPerDay) : 0;
  return { ok: true, value: { name, companyId, brandIds: ids(d.brandIds), branchType: oneOf(d.branchType, BRANCH_TYPES, "fullOperations"), address: a.value, ...c.value, maxEventsPerDay: maxEvents } };
}

export function parseKitchen(d: AnyDoc): Res<AnyDoc> {
  const name = text(d, "name", 120);
  const branchId = text(d, "branchId", 200);
  if (!name) return bad("వంటశాల పేరు రాయండి.", "Enter the kitchen name.");
  if (!branchId || branchId.includes("/")) return bad("ఈ వంటశాల ఏ శాఖదో ఎంచుకోండి.", "Choose the branch this kitchen belongs to.");
  const kitchenType = oneOf(d.kitchenType, KITCHEN_TYPES, "central");
  const vegOnly = flag(d.vegOnly) || kitchenType === "veg";
  if (vegOnly && kitchenType === "nonVeg") return bad("నాన్-వెజ్ వంటశాలను వెజ్ మాత్రమే అని గుర్తించలేరు.", "A non-veg kitchen cannot be marked veg only.");
  const cap = typeof d.maxPlatesPerShift === "number" && d.maxPlatesPerShift >= 0 && d.maxPlatesPerShift <= 1000000 ? Math.floor(d.maxPlatesPerShift) : 0;
  return { ok: true, value: { name, branchId, kitchenType, sections: many(d.sections, KITCHEN_SECTIONS), vegOnly, nonVegAllowed: !vegOnly, maxPlatesPerShift: cap, qualityApprovalRequired: flag(d.qualityApprovalRequired), temperatureLogRequired: flag(d.temperatureLogRequired), batchTrackingRequired: flag(d.batchTrackingRequired) } };
}

/**
 * Module 6a — shelf locations inside a store: one per line, "Zone / Rack / Shelf / Bin" (1 to 4 parts, each up to 30
 * characters). The owner writes them; nothing is invented. Returns the clean list (no repeats, in the order written).
 */
export function parseLocations(raw: unknown): Res<string[]> {
  const lines = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("\n") : [];
  const out: string[] = [];
  for (const l of lines) {
    if (typeof l !== "string" || l.trim() === "") continue;
    const parts = l.split(/[/>]/).map((x) => x.trim().replace(/\s+/g, " "));
    if (parts.length > 4 || parts.some((x) => x === "" || x.length > 30)) return bad(`స్థానం "${String(l).slice(0, 60)}" సరిగా లేదు — "జోన్ / ర్యాక్ / షెల్ఫ్ / బిన్" (గరిష్ఠం 4 భాగాలు, ప్రతిదీ 30 అక్షరాల లోపు).`, `The location "${String(l).slice(0, 60)}" is not valid — use "Zone / Rack / Shelf / Bin" (up to 4 parts, each under 30 characters).`);
    const clean = parts.join(" / ");
    if (!out.includes(clean)) out.push(clean);
  }
  if (out.length > 300) return bad("ఒక స్టోర్‌కు 300 కంటే ఎక్కువ స్థానాలు వద్దు.", "No more than 300 locations per store.");
  return { ok: true, value: out };
}

export function parseStore(d: AnyDoc): Res<AnyDoc> {
  const name = text(d, "name", 120);
  const branchId = text(d, "branchId", 200);
  const kitchenId = text(d, "kitchenId", 200);
  if (!name) return bad("స్టోర్ పేరు రాయండి.", "Enter the store name.");
  if (!branchId || branchId.includes("/")) return bad("ఈ స్టోర్ ఏ శాఖదో ఎంచుకోండి.", "Choose the branch this store belongs to.");
  if (kitchenId.includes("/")) return bad("వంటశాల సరిగా లేదు.", "The kitchen is not valid.");
  const storeType = oneOf(d.storeType, STORE_TYPES, "main");
  const locations = parseLocations(d.locations);
  if (!locations.ok) return locations;
  return { ok: true, value: { name, branchId, kitchenId, storeType, locations: locations.value, temperatureControlled: flag(d.temperatureControlled) || ["cold", "freezer", "nonVegCold", "dairy"].includes(storeType), restrictedAccess: flag(d.restrictedAccess), /* §12: negative stock is never allowed by default */ negativeStockAllowed: false, issueBlocked: NO_ISSUE_STORE_TYPES.includes(storeType), expiryTracking: flag(d.expiryTracking), adjustmentApprovalRequired: d.adjustmentApprovalRequired !== false } };
}

export const PARSERS: Record<MasterKind, (d: AnyDoc) => Res<AnyDoc>> = { company: parseCompany, brand: parseBrand, branch: parseBranch, kitchen: parseKitchen, store: parseStore };

const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() !== "" && a.trim().toLowerCase() === b.trim().toLowerCase();
type Row = { id: string; data: AnyDoc };

/** §18 duplicate prevention. Returns what clashes with another live record of the same kind ("" = nothing). */
export function duplicateOf(kind: MasterKind, id: string, v: AnyDoc, others: Row[]): "" | "name" | "gstin" | "pan" | "registration" {
  for (const o of others) {
    if (o.id === id || statusOf(o.data) === "archived") continue;
    if (kind === "company") {
      if (same(o.data.legalName, v.legalName)) return "name";
      if (v.gstin && same(o.data.gstin, v.gstin)) return "gstin";
      if (v.pan && same(o.data.pan, v.pan)) return "pan";
      if (v.registrationNumber && same(o.data.registrationNumber, v.registrationNumber)) return "registration";
    } else if (kind === "brand") {
      if (o.data.companyId === v.companyId && same(o.data.name, v.name)) return "name";
    } else if (kind === "branch") {
      if (o.data.companyId === v.companyId && same(o.data.name, v.name)) return "name";
    } else if (o.data.branchId === v.branchId && same(o.data.name, v.name)) return "name";
  }
  return "";
}

export interface MasterWorld {
  companies: Row[];
  brands: Row[];
  branches: Row[];
  kitchens: Row[];
  stores: Row[];
}
const find = (rows: Row[], id: unknown) => rows.find((r) => r.id === id);

/** Do the parents this record points at exist and accept new children? */
export function parentProblem(kind: MasterKind, v: AnyDoc, w: MasterWorld): Res<true> {
  if (kind === "brand" || kind === "branch") {
    const c = find(w.companies, v.companyId);
    if (!c) return bad("ఆ కంపెనీ దొరకలేదు.", "That company was not found.");
    if (!isUsable(c.data)) return bad("ఆ కంపెనీ ఇప్పుడు వాడుకలో లేదు.", "That company is not in use now.");
  }
  if (kind === "branch") {
    for (const b of (v.brandIds as string[]) ?? []) {
      const br = find(w.brands, b);
      if (!br) return bad("ఎంచుకున్న బ్రాండ్ దొరకలేదు.", "A chosen brand was not found.");
      if (br.data.companyId !== v.companyId) return bad("ఎంచుకున్న బ్రాండ్ ఈ కంపెనీది కాదు.", "A chosen brand does not belong to this company.");
    }
  }
  if (kind === "kitchen" || kind === "store") {
    const b = find(w.branches, v.branchId);
    if (!b) return bad("ఆ శాఖ దొరకలేదు.", "That branch was not found.");
    if (!isUsable(b.data)) return bad("ఆ శాఖ ఇప్పుడు వాడుకలో లేదు.", "That branch is not in use now.");
  }
  if (kind === "store" && v.kitchenId) {
    const k = find(w.kitchens, v.kitchenId);
    if (!k) return bad("ఆ వంటశాల దొరకలేదు.", "That kitchen was not found.");
    if (k.data.branchId !== v.branchId) return bad("ఆ వంటశాల ఈ శాఖది కాదు.", "That kitchen does not belong to this branch.");
  }
  return { ok: true, value: true };
}

/** A record with live children cannot be archived (the children would be left without a parent). */
export function liveChildren(kind: MasterKind, id: string, w: MasterWorld): number {
  const live = (rows: Row[], f: (d: AnyDoc) => boolean) => rows.filter((r) => statusOf(r.data) !== "archived" && f(r.data)).length;
  if (kind === "company") return live(w.brands, (d) => d.companyId === id) + live(w.branches, (d) => d.companyId === id);
  if (kind === "branch") return live(w.kitchens, (d) => d.branchId === id) + live(w.stores, (d) => d.branchId === id);
  if (kind === "kitchen") return live(w.stores, (d) => d.kitchenId === id);
  return 0;
}

/** May the status change? Archived is final here (un-archiving needs a deliberate, separate action). */
export function statusChangeProblem(kind: MasterKind, id: string, from: MasterStatus, to: MasterStatus, w: MasterWorld): "" | "same" | "archived" | "children" {
  if (from === to) return "same";
  if (from === "archived") return "archived";
  if (to === "archived" && liveChildren(kind, id, w) > 0) return "children";
  return "";
}

/** The first set-up: one company and one brand from the business settings; every existing branch gets a kitchen and a main store. */
export function firstSetupPlan(settings: { legalName: string; brandName: string; gstin: string; address: string; phone: string }, branches: Row[], w: MasterWorld): { company: AnyDoc | null; brand: AnyDoc | null; kitchensFor: string[]; storesFor: string[] } {
  const company = w.companies.length ? null : { legalName: settings.legalName || settings.brandName || "Company", gstRegistered: isGstin(settings.gstin.toUpperCase()), gstin: isGstin(settings.gstin.toUpperCase()) ? settings.gstin.toUpperCase() : "", address: { line1: settings.address.slice(0, 200) }, mobile: isMobile(settings.phone) ? settings.phone : "" };
  const brand = w.brands.length ? null : { name: settings.brandName || "Brand" };
  const liveBranches = branches.filter((b) => statusOf(b.data) !== "archived");
  return { company, brand, kitchensFor: liveBranches.filter((b) => !w.kitchens.some((k) => k.data.branchId === b.id)).map((b) => b.id), storesFor: liveBranches.filter((b) => !w.stores.some((s) => s.data.branchId === b.id)).map((b) => b.id) };
}
