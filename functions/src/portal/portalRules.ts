/**
 * 20 Nov 2026 — customer portal (pure rules; tested in test/module6b.test.ts).
 *
 * The owner or a manager makes a private link for one quotation or invoice. The customer opens it WITHOUT a login,
 * sees only the whitelisted fields below, can accept a quotation (typed name) and can pay an invoice by the payment
 * link. The link is a long random token: whoever has it can see that one document, so it expires and can be switched off.
 */
import { randomBytes } from "node:crypto";

type AnyDoc = Record<string, unknown>;
export const PORTAL_KINDS = ["quotation", "invoice"] as const;
export type PortalKind = (typeof PORTAL_KINDS)[number];
export const PORTAL_DAYS = 30;

export const PORTAL_TEXT = {
  badLink: { te: "ఈ లింక్ సరైనది కాదు.", en: "This link is not valid." },
  expired: { te: "ఈ లింక్ గడువు ముగిసింది. కొత్త లింక్ అడగండి.", en: "This link has expired. Ask for a new one." },
  revoked: { te: "ఈ లింక్ ఆపివేయబడింది.", en: "This link was switched off." },
  notAQuotation: { te: "ఇది కొటేషన్ లింక్ కాదు.", en: "This is not a quotation link." },
  notAnInvoice: { te: "ఇది బిల్లు లింక్ కాదు.", en: "This is not an invoice link." },
  notOpen: { te: "ఈ కొటేషన్ ఇప్పుడు ఒప్పుకోవడానికి తెరిచి లేదు.", en: "This quotation is not open for acceptance." },
  quoteExpired: { te: "ఈ కొటేషన్ గడువు ముగిసింది.", en: "This quotation has expired." },
  needName: { te: "ఒప్పుకోవడానికి మీ పేరు రాయండి.", en: "Type your name to accept." },
};

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}
/** 32 chars of base64url; anything else is refused before the database is touched. */
export const tokenLooksRight = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{32}$/.test(t);

export interface PortalLink {
  kind: string;
  docId: string;
  /** ms since epoch */
  expiresAt: number;
  revoked: boolean;
}
export function linkProblem(l: PortalLink | null, now: number): keyof typeof PORTAL_TEXT | "" {
  if (!l || !(PORTAL_KINDS as readonly string[]).includes(l.kind) || !l.docId) return "badLink";
  if (l.revoked) return "revoked";
  if (now > l.expiresAt) return "expired";
  return "";
}

const s = (v: unknown, max = 400): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const first = (...v: unknown[]): number => {
  for (const x of v) if (typeof x === "number" && Number.isFinite(x)) return x;
  return 0;
};

export interface PortalLine {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}
function lines(raw: unknown): PortalLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).map((x) => {
    const li = (typeof x === "object" && x !== null ? x : {}) as AnyDoc;
    return { name: s(li.name ?? li.description ?? li.item, 200), quantity: n(li.quantity ?? li.qty), unitPrice: first(li.unitPrice, li.rate), amount: n(li.amount) };
  });
}

/** Cost, margin, internal notes, manual-override reasons and staff names never leave the server. */
export function portalDoc(kind: PortalKind, d: AnyDoc, dayOf: (v: unknown) => string): AnyDoc {
  const t = (typeof d.totals === "object" && d.totals !== null ? d.totals : {}) as AnyDoc;
  return {
    kind,
    number: s(kind === "quotation" ? d.quotationNumber : d.invoiceNumber, 40),
    status: s(d.status, 20),
    issueDate: dayOf(d.issueDate),
    validUntil: kind === "quotation" ? dayOf(d.validUntil) : "",
    customerName: s(d.customerNameSnapshot ?? d.customerName, 120),
    lines: lines(d.lineItems),
    subtotal: n(d.subtotal),
    discount: n(d.discount),
    gstRate: n(d.gstRate),
    tax: first(d.taxAmount, d.tax, t.tax),
    total: first(d.totalAmount, d.total, t.total),
    amountPaid: kind === "invoice" ? n(d.amountPaid) : 0,
    balanceDue: kind === "invoice" ? n(d.balanceDue) : 0,
    notes: s(d.notes, 1000),
    terms: s(d.terms, 2000),
    acceptedAt: kind === "quotation" ? dayOf(d.portalAcceptedAt) : "",
    acceptedBy: kind === "quotation" ? s(d.portalAcceptedBy, 80) : "",
  };
}

export type AcceptProblem = "notOpen" | "quoteExpired" | "needName" | "";
/** A quotation can be accepted by the customer only while it is "Sent", not cancelled and not past its valid-until day. */
export function acceptProblem(q: { status: string; cancelled: boolean; validUntilDay: string }, today: string, name: string): AcceptProblem {
  if (q.cancelled || q.status !== "Sent") return "notOpen";
  if (q.validUntilDay && today > q.validUntilDay) return "quoteExpired";
  if (name.trim().length < 2) return "needName";
  return "";
}
export const cleanName = (v: unknown): string => s(v, 80).replace(/\s+/g, " ");
