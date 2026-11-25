/**
 * 20 Nov 2026 — Razorpay payment links for invoices.
 *  - createPaymentLink { invoiceId, amount? } (owner / manager): makes a Razorpay link for the balance (or part of it)
 *    and stores it on the invoice. The owner shares it himself (WhatsApp, SMS); Razorpay sends nothing.
 *  - razorpayWebhook (HTTP): Razorpay tells us a link was paid; after checking the signature we record the payment on
 *    the invoice (once per Razorpay payment id).
 * Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET ("none" until the owner has a Razorpay account).
 * NOT yet tried against the real Razorpay — see razorpayRules.ts.
 */
import { REGION } from "../setup";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optNum, reqId } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { istNoon, todayIST } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { applyPayment } from "../calc/payments";
import { round2 } from "../calc/util";
import { buildUpiPayload } from "./upi";
import { storedPaymentStatus } from "../billing/invoiceLines";
import { RAZORPAY_TEXT, buildLinkBody, isConfigured, linkAmountProblem, parsePaidEvent, verifyWebhookSignature } from "./razorpayRules";

export const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
export const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
export const RAZORPAY_WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");
export const RAZORPAY_SECRETS = [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET];

const LINK_DAYS = 7;

function secretValue(s: { value(): string }): string {
  try {
    return s.value();
  } catch {
    return "";
  }
}

export interface MadeLink {
  id: string;
  url: string;
  amount: number;
  reused: boolean;
}

/** Makes (or re-uses) the Razorpay link of an invoice. Shared by createPaymentLink and the customer portal. */
export async function makePaymentLink(invoiceId: string, wanted: number | undefined, actor: { uid: string; branchCheck?: (branchId: string) => void }): Promise<MadeLink> {
  const keyId = secretValue(RAZORPAY_KEY_ID);
  const keySecret = secretValue(RAZORPAY_KEY_SECRET);
  if (!isConfigured(keyId, keySecret)) fail("failed-precondition", RAZORPAY_TEXT.notConnected.te, RAZORPAY_TEXT.notConnected.en);
  const db = getFirestore();
  const invRef = db.collection(FirestoreCollections.INVOICES).doc(invoiceId);
  const snap = await invRef.get();
  if (!snap.exists) fail("not-found", "బిల్లు దొరకలేదు.", "Invoice not found.");
  const inv = snap.data() as Doc;
  actor.branchCheck?.(asStr(inv.branchId));
  if (["Cancelled", "Void"].includes(asStr(inv.status)) || inv.isDeleted === true) fail("failed-precondition", "రద్దు అయిన బిల్లుకు లింక్ చేయలేము.", "Cannot make a link for a cancelled invoice.");
  const balance = round2(asNum(inv.totalAmount) - asNum(inv.amountPaid));
  const amount = round2(wanted ?? balance);
  const problem = linkAmountProblem(amount, balance);
  if (problem) fail("invalid-argument", RAZORPAY_TEXT[problem].te, RAZORPAY_TEXT[problem].en);

  const now = Date.now();
  const old = (typeof inv.paymentLink === "object" && inv.paymentLink !== null ? inv.paymentLink : null) as Doc | null;
  if (old && asStr(old.url) && round2(asNum(old.amount)) === amount && asNum(old.expireBy) * 1000 > now + 3_600_000) {
    return { id: asStr(old.id), url: asStr(old.url), amount, reused: true };
  }

  const settings = await loadSettings();
  let phone = "";
  const cid = asStr(inv.customerId);
  if (cid) phone = asStr(((await db.collection(FirestoreCollections.CUSTOMERS).doc(cid).get()).data() as Doc | undefined)?.phone);
  const expireBy = Math.floor(now / 1000) + LINK_DAYS * 86400;
  const body = buildLinkBody({ amount, invoiceId, invoiceNumber: asStr(inv.invoiceNumber), customerName: asStr(inv.customerNameSnapshot) || "Customer", phone, businessName: settings.name, expireBy });
  let json: Doc;
  try {
    const res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64") },
      body: JSON.stringify(body),
    });
    json = (await res.json()) as Doc;
    if (!res.ok) {
      logger.error("Razorpay refused the link", { status: res.status, error: json.error });
      fail("unavailable", RAZORPAY_TEXT.failed.te, RAZORPAY_TEXT.failed.en);
    }
  } catch (e) {
    if (e instanceof Error && "code" in e) throw e;
    logger.error("Razorpay call failed", e);
    fail("unavailable", RAZORPAY_TEXT.failed.te, RAZORPAY_TEXT.failed.en);
  }
  const id = asStr(json.id);
  const url = asStr(json.short_url);
  if (!id || !url) fail("unavailable", RAZORPAY_TEXT.failed.te, RAZORPAY_TEXT.failed.en);
  await db.collection(FirestoreCollections.PAYMENT_LINKS).doc(id).set({ invoiceId, url, amount, branchId: asStr(inv.branchId), status: "created", expireBy, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp() });
  await invRef.update({ paymentLink: { id, url, amount, expireBy }, updatedAt: FieldValue.serverTimestamp() });
  return { id, url, amount, reused: false };
}

export const createPaymentLink = callable(
  "createPaymentLink",
  ADMIN_MANAGER,
  async (data, caller) => {
    const invoiceId = reqId(data, "invoiceId");
    const amount = optNum(data, "amount", { min: 1, max: 100_000_000 });
    const link = await makePaymentLink(invoiceId, amount, { uid: caller.uid, branchCheck: (b) => assertAdminOrOwnBranch(caller, b) });
    await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "createPaymentLink", collection: FirestoreCollections.INVOICES, docId: invoiceId, before: {}, after: { amount: link.amount, linkId: link.id } });
    return link;
  },
  { secrets: RAZORPAY_SECRETS },
);

/** Records a paid Razorpay payment on the invoice, once per Razorpay payment id. Returns what happened. */
export async function recordOnlinePayment(p: { paymentId: string; linkId: string; invoiceId: string; amount: number; method: string }): Promise<"recorded" | "duplicate" | "no-invoice"> {
  const db = getFirestore();
  const invRef = db.collection(FirestoreCollections.INVOICES).doc(p.invoiceId);
  const payRef = invRef.collection(FirestoreCollections.PAYMENTS).doc(`rzp_${p.paymentId}`);
  const settings = await loadSettings();
  const today = todayIST();
  const out = await db.runTransaction(async (tx) => {
    const [inv, existing] = await Promise.all([tx.get(invRef), tx.get(payRef)]);
    if (existing.exists) return { kind: "duplicate" as const, excess: 0 };
    if (!inv.exists) return { kind: "no-invoice" as const, excess: 0 };
    const d = inv.data() as Doc;
    const total = asNum(d.totalAmount);
    const paid = asNum(d.amountPaid);
    const balance = round2(Math.max(0, total - paid));
    const use = round2(Math.min(p.amount, balance));
    const excess = round2(p.amount - use);
    if (use < 0.01) return { kind: "recorded" as const, excess: p.amount, none: true };
    const r = applyPayment(total, paid, use);
    tx.set(payRef, {
      createdBy: "razorpay",
      invoiceId: p.invoiceId,
      invoiceNumberSnapshot: asStr(d.invoiceNumber),
      customerNameSnapshot: asStr(d.customerNameSnapshot),
      amount: use,
      type: "payment",
      date: Timestamp.fromDate(istNoon(today)),
      day: today,
      method: p.method,
      note: `Razorpay ${p.paymentId}`,
      razorpayPaymentId: p.paymentId,
      razorpayLinkId: p.linkId,
      recordedBy: "razorpay",
      recordedByName: "Razorpay (online)",
      branchId: asStr(d.branchId),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(invRef, {
      updatedBy: "razorpay",
      amountPaid: r.newPaid,
      balanceDue: r.newBalance,
      status: storedPaymentStatus(r.status),
      upiQrPayload: buildUpiPayload({ upiId: settings.upiId, payeeName: settings.name, amount: r.newBalance, note: asStr(d.invoiceNumber) }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`onlinePaid_${p.paymentId}`), {
      kind: "onlinePaid",
      audienceRoles: ["admin", "manager"],
      recipientUids: [],
      branchId: asStr(d.branchId),
      title: { te: `ఆన్‌లైన్ చెల్లింపు వచ్చింది: ₹${use} — ${asStr(d.invoiceNumber)}`, en: `Online payment received: ₹${use} — ${asStr(d.invoiceNumber)}` },
      link: "/invoices",
      readBy: [],
      createdAt: FieldValue.serverTimestamp(),
    });
    return { kind: "recorded" as const, excess };
  });
  if (out.excess > 0) logger.warn("Online payment was more than the balance — the extra needs a refund by hand", { invoiceId: p.invoiceId, paymentId: p.paymentId, excess: out.excess });
  await db.collection(FirestoreCollections.PAYMENT_LINKS).doc(p.linkId || `p_${p.paymentId}`).set({ invoiceId: p.invoiceId, status: "paid", paymentId: p.paymentId, paidAmount: p.amount, excess: out.excess, paidAt: FieldValue.serverTimestamp() }, { merge: true });
  return out.kind;
}

export const razorpayWebhook = onRequest({ region: REGION, secrets: [RAZORPAY_WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("POST only");
    return;
  }
  const secret = secretValue(RAZORPAY_WEBHOOK_SECRET);
  if (!isConfigured(secret)) {
    res.status(503).send("not configured");
    return;
  }
  const raw = req.rawBody ?? Buffer.from("");
  if (!verifyWebhookSignature(raw, String(req.get("x-razorpay-signature") ?? ""), secret)) {
    res.status(401).send("bad signature");
    return;
  }
  const ev = parsePaidEvent(req.body);
  if (!ev.ok) {
    res.status(ev.ignore ? 200 : 400).send(ev.ignore ? "ignored" : "bad event");
    return;
  }
  try {
    const r = await recordOnlinePayment(ev.value);
    res.status(200).send(r);
  } catch (e) {
    logger.error("Could not record an online payment", e);
    res.status(500).send("try again");
  }
});
