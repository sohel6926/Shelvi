import { dateLocale } from "./LanguageContext";
import type { HistoryEntry } from "../data/functions";
import type { Lang } from "./LanguageContext";
import { MONTHS_TE } from "./LanguageContext";
import { docStatusLabel } from "../components/StatusChip";
import { bookingStatusLabel } from "../modules/bookings/statusColor";
import type { BookingStatus } from "../data/bookingRepository";

/**
 * Owner-friendly change-history sentences (contract Round 6 B), e.g.
 * "రాము · బుకింగ్ మార్చారు: అతిథులు 250 → 300 · 5 నవం, 2:30 PM".
 * Technical fields are hidden, ids are never shown, stored values are translated.
 */

type Bi = { te: string; en: string };

export const HISTORY_COLLECTIONS: Record<string, Bi> = {
  bookings: { te: "బుకింగ్", en: "booking" },
  quotations: { te: "కొటేషన్", en: "quotation" },
  invoices: { te: "Invoice", en: "invoice" },
  payments: { te: "చెల్లింపు", en: "payment" },
  customers: { te: "కస్టమర్", en: "customer" },
  leads: { te: "ఎంక్వైరీ", en: "lead" },
  expenses: { te: "ఖర్చు", en: "expense" },
  purchases: { te: "కొనుగోలు", en: "purchase" },
  menuPackages: { te: "మెనూ ప్యాకేజీ", en: "menu package" },
  staff: { te: "సిబ్బంది", en: "staff member" },
  inventory: { te: "Stock వస్తువు", en: "stock item" },
  settings: { te: "వ్యాపార వివరాలు", en: "business settings" },
  targets: { te: "లక్ష్యం", en: "target" },
  attendance: { te: "హాజరు", en: "attendance" },
};

/** Never shown: ids, audit stamps, internal lists. */
const HIDDEN = new Set([
  "updatedBy",
  "createdBy",
  "updatedAt",
  "createdAt",
  "lastUpdated",
  "branchId",
  "customerId",
  "assignedStaffIds",
  "menuItemIds",
  "menuSnapshot",
  "packageId",
  "seededBy",
  "optInAt",
  "recordedBy",
  "recordedAt",
  "overriddenBy",
  "overriddenAt",
  "autoValue",
  "calcMode",
  "upiQrPayload",
  "lineItems",
  "pricingSnapshot",
  "quoteInput",
  "selections",
  "setupProgress",
]);

function isHidden(field: string): boolean {
  return HIDDEN.has(field) || /(Id|Ids|By|At)$/.test(field);
}

const FIELD: Record<string, Bi> = {
  guestCount: { te: "అతిథులు", en: "guests" },
  guests: { te: "అతిథులు", en: "guests" },
  guestCountConfirmed: { te: "ఖరారైన అతిథులు", en: "confirmed guests" },
  guestCountActual: { te: "వచ్చిన అతిథులు", en: "actual guests" },
  status: { te: "స్థితి", en: "status" },
  eventDate: { te: "తేదీ", en: "date" },
  date: { te: "తేదీ", en: "date" },
  venue: { te: "వేదిక", en: "venue" },
  name: { te: "పేరు", en: "name" },
  customerNameSnapshot: { te: "కస్టమర్", en: "customer" },
  phone: { te: "ఫోన్", en: "phone" },
  email: { te: "ఈమెయిల్", en: "email" },
  notes: { te: "గమనికలు", en: "notes" },
  totalAmount: { te: "మొత్తం", en: "total" },
  amount: { te: "మొత్తం", en: "amount" },
  amountPaid: { te: "చెల్లించింది", en: "paid" },
  balanceDue: { te: "బాకీ", en: "balance" },
  advancePaid: { te: "అడ్వాన్స్", en: "advance" },
  discount: { te: "తగ్గింపు", en: "discount" },
  pricePerPlate: { te: "ప్లేట్ ధర", en: "plate price" },
  quantityInStock: { te: "నిల్వ", en: "stock" },
  reorderLevel: { te: "తక్కువ నిల్వ హద్దు", en: "reorder level" },
  serveTime: { te: "వడ్డించే సమయం", en: "serving time" },
  travelMinutes: { te: "ప్రయాణ నిమిషాలు", en: "travel minutes" },
  mealType: { te: "భోజనం", en: "meal" },
  eventType: { te: "event వివరం", en: "event details" },
  eventTypeCode: { te: "event రకం", en: "event type" },
  address: { te: "చిరునామా", en: "address" },
  dailyWage: { te: "రోజు కూలీ", en: "daily wage" },
  monthlySalary: { te: "నెల జీతం", en: "monthly salary" },
  yearTarget: { te: "సంవత్సర లక్ష్యం", en: "year target" },
  hours: { te: "గంటలు", en: "hours" },
  pay: { te: "కూలీ", en: "pay" },
  method: { te: "చెల్లింపు విధానం", en: "method" },
  budget: { te: "బడ్జెట్", en: "budget" },
  source: { te: "ఎక్కడి నుండి", en: "source" },
  followUpDate: { te: "మళ్ళీ మాట్లాడే తేదీ", en: "follow-up date" },
  lostReason: { te: "పోయిన కారణం", en: "lost reason" },
  whatsappOptIn: { te: "WhatsApp అనుమతి", en: "WhatsApp opt-in" },
  active: { te: "పనిలో", en: "active" },
  role: { te: "పాత్ర", en: "role" },
  isActive: { te: "అందుబాటులో", en: "available" },
  quotationNumber: { te: "కొటేషన్ నం.", en: "quotation no." },
  invoiceNumber: { te: "Invoice నం.", en: "invoice no." },
  docTitle: { te: "పేరు", en: "title" },
  overrideReason: { te: "కారణం", en: "reason" },
  validDays: { te: "చెల్లుబాటు రోజులు", en: "valid days" },
  gstin: { te: "GSTIN", en: "GSTIN" },
  fssaiNumber: { te: "FSSAI", en: "FSSAI" },
  upiId: { te: "UPI", en: "UPI" },
  terms: { te: "నిబంధనలు", en: "terms" },
  profitMarginPct: { te: "లాభం %", en: "profit %" },
  autoStockDeduct: { te: "ఆటోమేటిక్ stock తగ్గింపు", en: "automatic stock deduction" },
  managerCanOverride: { te: "మేనేజర్ మార్చగలరు", en: "manager may override" },
};

const MONEY = new Set([
  "totalAmount",
  "amount",
  "amountPaid",
  "balanceDue",
  "advancePaid",
  "discount",
  "pricePerPlate",
  "dailyWage",
  "monthlySalary",
  "yearTarget",
  "pay",
  "budget",
]);

const VALUE: Record<string, Bi> = {
  // event types / meals
  wedding: { te: "పెళ్ళి", en: "wedding" },
  annadanam: { te: "అన్నదానం", en: "annadanam" },
  housewarming: { te: "గృహప్రవేశం", en: "housewarming" },
  office: { te: "ఆఫీస్", en: "office" },
  tiffin: { te: "టిఫిన్", en: "tiffin" },
  lunch: { te: "భోజనం", en: "lunch" },
  dinner: { te: "రాత్రి భోజనం", en: "dinner" },
  "lunch-dinner": { te: "భోజనం + రాత్రి", en: "lunch + dinner" },
  other: { te: "ఇతర", en: "other" },
  // lead statuses
  new: { te: "కొత్తది", en: "new" },
  contacted: { te: "మాట్లాడాం", en: "contacted" },
  tasting: { te: "రుచి చూపించాం", en: "tasting" },
  quoted: { te: "కొటేషన్ ఇచ్చాం", en: "quoted" },
  won: { te: "బుక్ అయింది", en: "won" },
  lost: { te: "పోయింది", en: "lost" },
  // attendance / roles / misc
  present: { te: "వచ్చారు", en: "present" },
  half: { te: "సగం రోజు", en: "half day" },
  absent: { te: "రాలేదు", en: "absent" },
  leave: { te: "సెలవు", en: "leave" },
  admin: { te: "యజమాని", en: "admin" },
  manager: { te: "మేనేజర్", en: "manager" },
  staff: { te: "సిబ్బంది", en: "staff" },
  BankTransfer: { te: "బ్యాంక్ బదిలీ", en: "bank transfer" },
  Cash: { te: "నగదు", en: "cash" },
  auto: { te: "ఆటోమేటిక్", en: "automatic" },
  manual: { te: "మాన్యువల్", en: "manual" },
};

const BOOKING_STATUSES = new Set(["Inquiry", "Confirmed", "InProgress", "Completed", "Cancelled", "Closed"]);

function fieldLabel(field: string, lang: Lang): string {
  const f = FIELD[field];
  if (f) return f[lang];
  // camelCase → words (English); Telugu falls back to the same words.
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function dayText(day: string, lang: Lang): string {
  const [, m, d] = day.split("-").map(Number);
  return lang === "te" ? `${d} ${MONTHS_TE[m - 1]?.slice(0, 3) ?? m}` : new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function valueText(field: string, v: unknown, collection: string, lang: Lang): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? (lang === "te" ? "అవును" : "yes") : lang === "te" ? "కాదు" : "no";
  if (typeof v === "number") {
    if (MONEY.has(field)) return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    return v.toLocaleString("en-IN");
  }
  const s = String(v);
  if (field === "status") {
    if (collection === "bookings" && BOOKING_STATUSES.has(s)) return bookingStatusLabel(s as BookingStatus, lang);
    if (VALUE[s]) return VALUE[s][lang];
    return docStatusLabel(s, lang);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dayText(s, lang);
  if (VALUE[s]) return VALUE[s][lang];
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function whenText(at: unknown, lang: Lang): string {
  let d: Date | null = null;
  if (typeof at === "string" || typeof at === "number") d = new Date(at);
  else if (at && typeof at === "object") {
    const o = at as { _seconds?: number; seconds?: number };
    const s = o._seconds ?? o.seconds;
    if (typeof s === "number") d = new Date(s * 1000);
  }
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(dateLocale(lang), {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** Short summary of a new / deleted document from its values. */
function summary(e: HistoryEntry, values: Record<string, unknown>, lang: Lang): string {
  const parts: string[] = [];
  const name = values.customerNameSnapshot ?? values.name ?? values.quotationNumber ?? values.invoiceNumber;
  if (typeof name === "string" && name) parts.push(name);
  const guests = values.guestCount ?? values.guests;
  if (typeof guests === "number") parts.push(lang === "te" ? `${guests} మంది` : `${guests} guests`);
  for (const f of ["eventDate", "date"]) {
    const v = values[f];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      parts.push(dayText(v.slice(0, 10), lang));
      break;
    }
  }
  for (const f of ["totalAmount", "amount"]) {
    if (typeof values[f] === "number") {
      parts.push(valueText(f, values[f], e.collection, lang));
      break;
    }
  }
  if (typeof values.status === "string" && parts.length < 4) parts.push(valueText("status", values.status, e.collection, lang));
  return parts.slice(0, 4).join(", ");
}

/**
 * @param names uid → display name (resolves `by` when the server did not send byName).
 */
export function historySentence(e: HistoryEntry, lang: Lang, names: Record<string, string> = {}): string {
  const te = lang === "te";
  const who =
    e.by === "system"
      ? te ? "సర్వర్ (ఆటోమేటిక్)" : "Server (automatic)"
      : e.byName || names[e.by] || (te ? "ఎవరో" : "Someone");
  const coll = HISTORY_COLLECTIONS[e.collection];
  const what = coll ? coll[lang] : te ? "రికార్డు" : "record";
  const diff = e.diff ?? {};
  const changed = (e.changed ?? []).filter((f) => !isHidden(f));
  const stockTouched = (e.changed ?? []).includes("stockDeduction") || "stockDeduction" in diff;
  const when = whenText(e.at, lang);
  let body: string;
  // QA fix 13: the server's own summary { te, en } wins when present; else the wording built here.
  const serverSummary = e.summary && typeof e.summary === "object" ? (te ? e.summary.te || e.summary.en : e.summary.en || e.summary.te) : "";

  if (typeof serverSummary === "string" && serverSummary.trim()) {
    body = serverSummary.trim();
  } else if (e.action === "create") {
    const values = Object.fromEntries(Object.entries(diff).map(([k, d]) => [k, d.after]));
    const s = summary(e, values, lang);
    body = te ? `కొత్త ${what}${s ? `: ${s}` : ""}` : `New ${what}${s ? `: ${s}` : ""}`;
  } else if (e.action === "delete") {
    const values = Object.fromEntries(Object.entries(diff).map(([k, d]) => [k, d.before]));
    const s = summary(e, values, lang);
    body = te ? `${what} తీసేశారు${s ? `: ${s}` : ""}` : `Deleted ${what}${s ? `: ${s}` : ""}`;
  } else {
    const parts = Object.entries(diff)
      .filter(([f]) => !isHidden(f) && f !== "stockDeduction")
      .slice(0, 6)
      .map(([f, d]) => `${fieldLabel(f, lang)} ${valueText(f, d.before, e.collection, lang)} → ${valueText(f, d.after, e.collection, lang)}`);
    // Fields that changed but have no before/after in the diff (long text, lists): name them only.
    const named = changed.filter((f) => !(f in diff) && f !== "stockDeduction").slice(0, 4).map((f) => fieldLabel(f, lang));
    if (named.length) parts.push(named.join(", "));
    if (stockTouched) parts.push(te ? "Stock తీశారు / తిరిగి పెట్టారు" : "stock taken out / put back");
    const verb = e.kind === "override" ? (te ? "చేతితో మార్చారు" : "overrode") : te ? "మార్చారు" : "changed";
    body = te ? `${what} ${verb}` : `${verb} ${what}`;
    if (parts.length) body += `: ${parts.join(", ")}`;
  }

  const reason = e.reason ? (te ? ` (కారణం: ${e.reason})` : ` (reason: ${e.reason})`) : "";
  return [who, body + reason, when].filter(Boolean).join(" · ");
}
