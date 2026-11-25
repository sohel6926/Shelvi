/**
 * Telugu WhatsApp message templates. Placeholders are {name}. Pure functions — unit tested.
 * Business-initiated WhatsApp messages need Meta-approved templates; the template keys here are
 * meant to be registered with the same names (see docs/backend-notes.md).
 */
export type TemplateKey =
  | "owner.alert"
  | "owner.morningSummary"
  | "customer.duesReminder"
  | "lead.firstContact"
  | "lead.followup"
  | "customer.guestCountConfirm"
  | "staff.timeline"
  | "customer.feedbackRequest";

export const TEMPLATES: Record<TemplateKey, string> = {
  "owner.alert": "{title}\n{body}\n— Suseela CRM",
  "owner.morningSummary":
    "శుభోదయం! సుశీల కేటరింగ్స్ — {date}\n" +
    "ఈ రోజు events: {eventsToday}\n{eventLines}\n" +
    "నిన్న ఆదాయం: {yIncome} | ఖర్చులు: {yCosts} | లాభం: {yProfit}\n" +
    "మొత్తం బాకీలు: {duesTotal} ({duesCount} bills)\n" +
    "ఈ రోజు follow-up చేయాల్సిన enquiries: {followups}\n" +
    "తక్కువ stock: {lowStock}\n" +
    "వాహనాల పత్రాలు (7 రోజుల్లో గడువు): {vehicleDocs}\n" +
    "Approve చేయాల్సిన messages: {pendingApprovals}\n" +
    "రాత్రి లెక్కల check: {integrity}",
  "customer.duesReminder":
    "నమస్కారం {name} గారు,\n" +
    "సుశీల కేటరింగ్స్ నుండి చిన్న గుర్తు: బిల్ నంబర్ {invoiceNumber} కి ఇంకా {balance} చెల్లించాల్సి ఉంది.\n" +
    "UPI ID: {upiId}\n" +
    "ఇప్పటికే చెల్లించి ఉంటే ఈ message పట్టించుకోవద్దు. ధన్యవాదాలు.\n— సుశీల కేటరింగ్స్, {phone}",
  "lead.firstContact":
    "నమస్కారం {name} గారు,\n" +
    "సుశీల కేటరింగ్స్ ని సంప్రదించినందుకు ధన్యవాదాలు. మీ {eventDate} event కోసం menu, ధరల వివరాలు పంపమంటారా? " +
    "మాట్లాడటానికి మీకు ఏ సమయం బాగుంటుందో చెప్పండి.\n— సుశీల కేటరింగ్స్, {phone}",
  "lead.followup":
    "నమస్కారం {name} గారు,\n" +
    "మీ event ({eventDate}) గురించి గుర్తు చేస్తున్నాం. ఏమైనా సందేహాలు ఉంటే అడగండి — రుచి చూడటానికి (tasting) కూడా ఏర్పాటు చేస్తాం.\n" +
    "— సుశీల కేటరింగ్స్, {phone}",
  "customer.guestCountConfirm":
    "నమస్కారం {name} గారు,\n" +
    "{eventDate} న మీ event కి ఇంకా 3 రోజులు ఉంది. దయచేసి అతిథుల సంఖ్య ఖరారు చేయండి (ఇప్పుడు మా దగ్గర ఉన్నది: {guests} మంది). " +
    "దాని బట్టి వంట సిద్ధం చేస్తాం.\n— సుశీల కేటరింగ్స్, {phone}",
  "staff.timeline":
    "రేపు event: {customer} — {venue}\nసమయం: {eventTime}, అతిథులు: {guests}\nపని వరుస:\n{timeline}\n— సుశీల కేటరింగ్స్",
  "customer.feedbackRequest":
    "నమస్కారం {name} గారు,\n" +
    "మీ event లో సేవ చేసే అవకాశం ఇచ్చినందుకు ధన్యవాదాలు. భోజనం, సేవ ఎలా అనిపించాయో ఒక్క మాటలో చెప్పగలరా?\n" +
    "నచ్చితే ఇక్కడ review ఇవ్వండి: {reviewUrl}\n— సుశీల కేటరింగ్స్",
};

export type TemplateParams = Record<string, string | number | null | undefined>;

/** R10-8: placeholder names in order of first appearance — the body parameters {{1}}, {{2}}… of the Meta template. */
export function templateParamOrder(key: TemplateKey): string[] {
  const tpl = TEMPLATES[key];
  if (tpl === undefined) throw new Error(`unknown template ${key}`);
  const out: string[] = [];
  for (const m of tpl.matchAll(/\{(\w+)\}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Body parameters for the Meta template (missing values → "-", newlines folded: Meta rejects them in parameters). */
export function templateParams(key: TemplateKey, params: TemplateParams): string[] {
  return templateParamOrder(key).map((k) => {
    const v = params[k];
    return v === undefined || v === null || v === "" ? "-" : String(v).replace(/\s*\n\s*/g, " | ");
  });
}

/** Fills {placeholders}; missing values become "-" so a message never shows "{name}". */
export function renderTemplate(key: TemplateKey, params: TemplateParams): string {
  const tpl = TEMPLATES[key];
  if (tpl === undefined) throw new Error(`unknown template ${key}`);
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = params[k];
    return v === undefined || v === null || v === "" ? "-" : String(v);
  });
}

/** ₹1,50,000.50 — Indian digit grouping, paise only when present. */
export function formatRupees(amount: number): string {
  if (!Number.isFinite(amount)) return "₹-";
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs + 1e-9);
  const paise = Math.round((abs - rupees) * 100);
  const r = paise === 100 ? rupees + 1 : rupees;
  const p = paise === 100 ? 0 : paise;
  const s = String(r);
  let grouped = s;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return `${neg ? "-" : ""}₹${grouped}${p ? "." + String(p).padStart(2, "0") : ""}`;
}
