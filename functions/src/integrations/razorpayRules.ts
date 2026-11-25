/**
 * 20 Nov 2026 — Razorpay payment links (pure rules; tested in test/module6b.test.ts).
 *
 * The owner's Razorpay account supplies three secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
 * Until each holds a real value (not "none"), no link is made and the UPI QR on the invoice stays the way to pay.
 * NOT yet tried against the real Razorpay: the field names follow Razorpay's published Payment Links API and
 * webhook (`payment_link.paid`) format and must be checked once with the owner's test keys.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

type AnyDoc = Record<string, unknown>;
export type Res<T> = { ok: true; value: T } | { ok: false; te: string; en: string };

export const isConfigured = (...secrets: string[]): boolean => secrets.length > 0 && secrets.every((s) => s.trim() !== "" && s.trim().toLowerCase() !== "none");

export const paiseOf = (rupees: number): number => Math.round(rupees * 100);
export const rupeesOf = (paise: number): number => Math.round(paise) / 100;

export const RAZORPAY_TEXT = {
  notConnected: { te: "ఆన్‌లైన్ చెల్లింపు ఇంకా కనెక్ట్ కాలేదు (Razorpay కీలు లేవు). ప్రస్తుతానికి UPI QR వాడండి.", en: "Online payment is not connected yet (no Razorpay keys). Use the UPI QR for now." },
  tooMuch: { te: "లింక్ మొత్తం మిగిలిన బాకీ కంటే ఎక్కువ ఉండకూడదు.", en: "The link amount cannot be more than the balance still due." },
  nothingDue: { te: "ఈ బిల్లుకు బాకీ లేదు.", en: "Nothing is due on this invoice." },
  minimum: { te: "కనీసం ₹1 ఉండాలి.", en: "The amount must be at least ₹1." },
  failed: { te: "చెల్లింపు లింక్ తయారు కాలేదు. కొంత సేపటి తర్వాత మళ్లీ ప్రయత్నించండి.", en: "The payment link could not be made. Try again in a little while." },
};

/** Why a link for `amount` cannot be made on an invoice with `balance` due; "" = fine. */
export function linkAmountProblem(amount: number, balance: number): keyof typeof RAZORPAY_TEXT | "" {
  if (!(balance > 0.005)) return "nothingDue";
  if (!(amount >= 1)) return "minimum";
  if (amount > balance + 0.005) return "tooMuch";
  return "";
}

export interface LinkInput {
  amount: number;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  phone: string;
  businessName: string;
  /** unix seconds */
  expireBy: number;
}

/** Body of POST /v1/payment_links. We send no SMS / e-mail from Razorpay: the owner shares the link himself. */
export function buildLinkBody(i: LinkInput): AnyDoc {
  const phone = i.phone.replace(/\D/g, "").slice(-10);
  return {
    amount: paiseOf(i.amount),
    currency: "INR",
    accept_partial: false,
    reference_id: `${i.invoiceId}`.slice(0, 40),
    description: `${i.businessName} — ${i.invoiceNumber}`.slice(0, 250),
    customer: { name: i.customerName.slice(0, 80), ...(phone.length === 10 ? { contact: `+91${phone}` } : {}) },
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: i.expireBy,
    notes: { invoiceId: i.invoiceId, invoiceNumber: i.invoiceNumber },
  };
}

/** Razorpay signs the raw request body with the webhook secret (HMAC-SHA256, hex) in X-Razorpay-Signature. */
export function verifyWebhookSignature(raw: string | Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PaymentMethod = "UPI" | "Card" | "BankTransfer" | "Other";
export function methodOf(rzp: unknown): PaymentMethod {
  switch (rzp) {
    case "upi":
      return "UPI";
    case "card":
      return "Card";
    case "netbanking":
    case "emandate":
      return "BankTransfer";
    default:
      return "Other";
  }
}

export interface PaidEvent {
  paymentId: string;
  linkId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
}

const obj = (v: unknown): AnyDoc => (typeof v === "object" && v !== null ? (v as AnyDoc) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * What a webhook body means for us. Only `payment_link.paid` with a paid link and a payment we can tie to an invoice
 * counts; every other event is ignored (ok:false, ignore) so the webhook can answer 200 and Razorpay stops retrying.
 */
export function parsePaidEvent(body: unknown): Res<PaidEvent> & { ignore?: boolean } {
  const b = obj(body);
  if (b.event !== "payment_link.paid") return { ok: false, ignore: true, te: "ఈ సంఘటన అవసరం లేదు.", en: "Event not needed." };
  const payload = obj(b.payload);
  const link = obj(obj(payload.payment_link).entity);
  const pay = obj(obj(payload.payment).entity);
  const notes = obj(link.notes);
  const invoiceId = str(notes.invoiceId);
  const paymentId = str(pay.id);
  const amountPaise = typeof pay.amount === "number" ? pay.amount : typeof link.amount_paid === "number" ? link.amount_paid : 0;
  if (str(link.status) !== "paid" && str(pay.status) !== "captured") return { ok: false, ignore: true, te: "చెల్లింపు పూర్తి కాలేదు.", en: "Not paid yet." };
  if (!invoiceId || !paymentId || !(amountPaise > 0)) return { ok: false, te: "చెల్లింపు వివరాలు సరిగా లేవు.", en: "The payment details are incomplete." };
  return { ok: true, value: { paymentId, linkId: str(link.id), invoiceId, amount: rupeesOf(amountPaise), method: methodOf(pay.method) } };
}
