import { asObj, Doc } from "../shared/coerce";
import type { Bilingual } from "../shared/errors";
import { normalizeIndianPhone } from "../shared/messagePolicy";

export const IMPORT_KINDS = ["customers", "staff", "menuItems", "vendors", "leads"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** Column names the owner's Excel sheets may use (English / Telugu). */
const ALIASES: Record<string, string[]> = {
  name: ["name", "Name", "NAME", "customer", "Customer Name", "పేరు"],
  nameTe: ["nameTe", "Telugu Name", "తెలుగు పేరు"],
  phone: ["phone", "Phone", "mobile", "Mobile", "Mobile Number", "Phone Number", "ఫోన్", "మొబైల్"],
  email: ["email", "Email"],
  address: ["address", "Address", "చిరునామా"],
  notes: ["notes", "Notes", "వివరాలు"],
  jobRole: ["jobRole", "role", "Role", "Job", "పని"],
  dailyWage: ["dailyWage", "Daily Wage", "రోజు కూలి"],
  monthlySalary: ["monthlySalary", "Monthly Salary", "Salary", "నెల జీతం"],
  payType: ["payType", "Pay Type"],
  category: ["category", "Category", "రకం"],
  pricePerPlate: ["pricePerPlate", "Price", "Price Per Plate", "ధర"],
  isVeg: ["isVeg", "Veg"],
  whatsappOptIn: ["whatsappOptIn", "WhatsApp", "WhatsApp OK"],
  // Module 1c — leads
  source: ["source", "Source", "ఎక్కడి నుండి"],
  eventDate: ["eventDate", "Event Date", "Event date", "Date", "తేదీ", "Event తేదీ"],
  guests: ["guests", "Guests", "Plates", "అతిథులు"],
  budget: ["budget", "Budget", "బడ్జెట్"],
  followUpDate: ["followUpDate", "Follow Up", "Follow-up", "Follow Up Date"],
  campaignId: ["campaignId", "Campaign", "Ad"],
};

const LEAD_IMPORT_SOURCES = ["instagram", "facebook", "google", "referral", "walkin", "justdial", "other"];

/** "" for empty; YYYY-MM-DD for 2026-12-05, 05/12/2026 or 05-12-2026 (day first); "bad" otherwise. */
export function importDay(v: unknown): string {
  if (v === undefined || v === null || String(v).trim() === "") return "";
  const s = String(v).trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const dmy = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [y, m, d] = [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])];
  else return "bad";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) return "bad";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function pick(row: Doc, field: string): unknown {
  for (const k of ALIASES[field] ?? [field]) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  return undefined;
}

function text(row: Doc, field: string, max = 500): string {
  const v = pick(row, field);
  return v === undefined ? "" : String(v).trim().slice(0, max);
}

function money(row: Doc, field: string): number | null | "bad" {
  const v = pick(row, field);
  if (v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "bad";
}

function yes(v: unknown): boolean {
  return v === true || (typeof v === "string" && ["yes", "y", "true", "1", "అవును"].includes(v.trim().toLowerCase()));
}

export type NormalizedRow = { ok: true; key: string; doc: Doc } | { ok: false; reason: Bilingual };

/** One spreadsheet row → document to create, plus its duplicate key (phone or lower-case name). */
export function normalizeImportRow(kind: ImportKind, raw: unknown): NormalizedRow {
  const row = asObj(raw);
  const name = text(row, "name", 200);
  if (!name) return { ok: false, reason: { te: "పేరు లేదు.", en: "Name is missing." } };
  if (kind === "menuItems") {
    const price = money(row, "pricePerPlate");
    if (price === "bad") return { ok: false, reason: { te: "ధర సరిగా లేదు.", en: "Price is not a valid number." } };
    return {
      ok: true,
      key: name.toLowerCase(),
      doc: { name, nameTe: text(row, "nameTe", 200), category: text(row, "category", 50) || "Main Course", pricePerPlate: price ?? 0, isVeg: pick(row, "isVeg") === undefined ? true : yes(pick(row, "isVeg")), isActive: true, isPackage: false },
    };
  }
  const phone = normalizeIndianPhone(text(row, "phone", 30));
  if (!phone) return { ok: false, reason: { te: "ఫోన్ నంబర్ సరిగా లేదు (10 అంకెలు).", en: "Phone number is not a valid 10-digit mobile." } };
  const phone10 = phone.slice(2);
  if (kind === "customers") {
    const optIn = yes(pick(row, "whatsappOptIn"));
    return { ok: true, key: phone10, doc: { name, phone: phone10, email: text(row, "email", 200), address: text(row, "address", 1000), notes: text(row, "notes", 2000), whatsappOptIn: optIn, source: "import" } };
  }
  if (kind === "leads") {
    const eventDate = importDay(pick(row, "eventDate"));
    const followUpDate = importDay(pick(row, "followUpDate"));
    if (eventDate === "bad" || followUpDate === "bad") return { ok: false, reason: { te: "తేదీ సరిగా లేదు (2026-12-05 లేదా 05/12/2026 లా రాయండి).", en: "Date is not valid (write it like 2026-12-05 or 05/12/2026)." } };
    const guestsRaw = money(row, "guests");
    const budget = money(row, "budget");
    if (guestsRaw === "bad" || budget === "bad" || (guestsRaw !== null && (!Number.isInteger(guestsRaw) || guestsRaw > 1000000))) return { ok: false, reason: { te: "అతిథులు / బడ్జెట్ అంకె సరిగా లేదు.", en: "Guests / budget is not a valid number." } };
    const src = text(row, "source", 30).toLowerCase().replace(/[\s-]/g, "");
    return {
      ok: true,
      key: phone10,
      doc: {
        name,
        phone: phone10,
        source: LEAD_IMPORT_SOURCES.includes(src) ? src : "other",
        campaignId: text(row, "campaignId", 200),
        eventDate,
        guests: guestsRaw !== null && guestsRaw >= 1 ? guestsRaw : null,
        budget: budget !== null && budget > 0 ? budget : null,
        status: "new",
        followUpDate,
        lostReason: "",
        whatsappOptIn: yes(pick(row, "whatsappOptIn")),
        // imported leads are old enquiries: no 15-minute alert, no "assigned to you" notification for each
        imported: true,
      },
    };
  }
  if (kind === "vendors") return { ok: true, key: phone10, doc: { name, phone: phone10, address: text(row, "address", 1000), notes: text(row, "notes", 2000) } };
  const monthly = money(row, "monthlySalary");
  const daily = money(row, "dailyWage");
  if (monthly === "bad" || daily === "bad") return { ok: false, reason: { te: "జీతం అంకె సరిగా లేదు.", en: "Wage / salary is not a valid number." } };
  const payTypeRaw = text(row, "payType", 20).toLowerCase();
  const payType = payTypeRaw === "monthly" || (payTypeRaw !== "daily" && monthly !== null && monthly > 0) ? "monthly" : "daily";
  return { ok: true, key: phone10, doc: { name, phone: phone10, jobRole: text(row, "jobRole", 100), payType, dailyWage: daily ?? 0, monthlySalary: monthly ?? 0, active: true } };
}

