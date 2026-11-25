import { test } from "node:test";
import assert from "node:assert/strict";
import { exportRows, MAX_EXPORT_ROWS } from "../src/ledger/exportRules";
import type { JournalEntry } from "../src/ledger/ledgerRules";

const names = (c: string) => ({ te: `తె-${c}`, en: `en-${c}` });
const entry = (day: string, memo: string, amt: number): JournalEntry => ({
  day,
  memo,
  source: { collection: "invoices", id: "i" + day, kind: "invoice" },
  lines: [
    { account: "1100", debit: amt, credit: 0 },
    { account: "4000", debit: 0, credit: amt },
  ],
});

test("exportRows: date order, one voucher number per entry, one row per line", () => {
  const r = exportRows([entry("2026-11-05", "b", 200), entry("2026-11-01", "a", 100)], names);
  assert.equal(r.entryCount, 2);
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows[0].day, "2026-11-01");
  assert.equal(r.rows[0].voucher, "V0001");
  assert.equal(r.rows[1].voucher, "V0001");
  assert.equal(r.rows[2].voucher, "V0002");
  assert.equal(r.rows[0].accountEn, "en-1100");
  assert.equal(r.rows[1].credit, 100);
  assert.equal(r.truncated, false);
});

test("exportRows: stops before the row cap and says so", () => {
  const many = Array.from({ length: MAX_EXPORT_ROWS / 2 + 5 }, (_, i) => entry("2026-11-01", "x" + i, 1));
  const r = exportRows(many, names);
  assert.equal(r.truncated, true);
  assert.ok(r.rows.length <= MAX_EXPORT_ROWS);
  assert.equal(r.rows.length % 2, 0);
});

test("exportRows: empty period gives no rows", () => {
  const r = exportRows([], names);
  assert.deepEqual(r, { rows: [], entryCount: 0, truncated: false });
});

import { buildLinkBody, isConfigured, linkAmountProblem, methodOf, paiseOf, parsePaidEvent, verifyWebhookSignature } from "../src/integrations/razorpayRules";
import { acceptProblem, cleanName, linkProblem, newToken, portalDoc, tokenLooksRight } from "../src/portal/portalRules";
import { createHmac } from "node:crypto";

test("razorpay: configured only with real values", () => {
  assert.equal(isConfigured("k", "s"), true);
  assert.equal(isConfigured("none", "s"), false);
  assert.equal(isConfigured("k", ""), false);
  assert.equal(isConfigured(), false);
});

test("razorpay: amount rules and paise", () => {
  assert.equal(paiseOf(1234.56), 123456);
  assert.equal(linkAmountProblem(500, 0), "nothingDue");
  assert.equal(linkAmountProblem(0.5, 100), "minimum");
  assert.equal(linkAmountProblem(150, 100), "tooMuch");
  assert.equal(linkAmountProblem(100, 100), "");
});

test("razorpay: link body has paise, notes and no Razorpay notifications", () => {
  const b = buildLinkBody({ amount: 2500.5, invoiceId: "inv1", invoiceNumber: "INV-7", customerName: "Ravi", phone: "+91 99666 49469", businessName: "Suseela", expireBy: 1800000000 }) as Record<string, unknown>;
  assert.equal(b.amount, 250050);
  assert.deepEqual(b.notes, { invoiceId: "inv1", invoiceNumber: "INV-7" });
  assert.deepEqual(b.notify, { sms: false, email: false });
  assert.deepEqual(b.customer, { name: "Ravi", contact: "+919966649469" });
});

test("razorpay: webhook signature", () => {
  const raw = JSON.stringify({ a: 1 });
  const sig = createHmac("sha256", "sec").update(raw).digest("hex");
  assert.equal(verifyWebhookSignature(raw, sig, "sec"), true);
  assert.equal(verifyWebhookSignature(raw, sig, "other"), false);
  assert.equal(verifyWebhookSignature(raw, "", "sec"), false);
  assert.equal(verifyWebhookSignature(raw + " ", sig, "sec"), false);
});

test("razorpay: paid event parsing", () => {
  const ok = parsePaidEvent({ event: "payment_link.paid", payload: { payment_link: { entity: { id: "plink_1", status: "paid", notes: { invoiceId: "inv1" } } }, payment: { entity: { id: "pay_1", amount: 150000, method: "upi", status: "captured" } } } });
  assert.deepEqual(ok, { ok: true, value: { paymentId: "pay_1", linkId: "plink_1", invoiceId: "inv1", amount: 1500, method: "UPI" } });
  const other = parsePaidEvent({ event: "payment.failed" });
  assert.equal(other.ok, false);
  assert.equal((other as { ignore?: boolean }).ignore, true);
  const noInv = parsePaidEvent({ event: "payment_link.paid", payload: { payment_link: { entity: { status: "paid", notes: {} } }, payment: { entity: { id: "p", amount: 100, status: "captured" } } } });
  assert.equal(noInv.ok, false);
  assert.equal((noInv as { ignore?: boolean }).ignore, undefined);
  assert.equal(methodOf("netbanking"), "BankTransfer");
  assert.equal(methodOf("wallet"), "Other");
});

test("portal: token shape, link checks", () => {
  const t = newToken();
  assert.equal(t.length, 32);
  assert.equal(tokenLooksRight(t), true);
  assert.equal(tokenLooksRight("short"), false);
  assert.equal(tokenLooksRight("../../etc/passwd/................"), false);
  const now = 1_000_000;
  assert.equal(linkProblem(null, now), "badLink");
  assert.equal(linkProblem({ kind: "quotation", docId: "q", expiresAt: now + 1, revoked: false }, now), "");
  assert.equal(linkProblem({ kind: "quotation", docId: "q", expiresAt: now - 1, revoked: false }, now), "expired");
  assert.equal(linkProblem({ kind: "quotation", docId: "q", expiresAt: now + 1, revoked: true }, now), "revoked");
  assert.equal(linkProblem({ kind: "other", docId: "q", expiresAt: now + 1, revoked: false }, now), "badLink");
});

test("portal: only whitelisted fields leave the server", () => {
  const v = portalDoc("quotation", { quotationNumber: "Q-1", status: "Sent", costEstimate: { total: 10 }, internalNote: "secret", lineItems: [{ name: "Biryani", quantity: 10, unitPrice: 100, amount: 1000, cost: 700 }], totalAmount: 1000, customerNameSnapshot: "Ravi" }, () => "2026-11-20");
  const json = JSON.stringify(v);
  assert.ok(!json.includes("secret"));
  assert.ok(!json.includes("costEstimate"));
  assert.ok(!json.includes("700"));
  assert.equal(v.number, "Q-1");
  assert.equal(v.total, 1000);
  assert.deepEqual(v.lines, [{ name: "Biryani", quantity: 10, unitPrice: 100, amount: 1000 }]);
});

test("portal: accept rules", () => {
  const open = { status: "Sent", cancelled: false, validUntilDay: "2026-12-01" };
  assert.equal(acceptProblem(open, "2026-11-20", "Ravi"), "");
  assert.equal(acceptProblem({ ...open, status: "Accepted" }, "2026-11-20", "Ravi"), "notOpen");
  assert.equal(acceptProblem({ ...open, cancelled: true }, "2026-11-20", "Ravi"), "notOpen");
  assert.equal(acceptProblem(open, "2026-12-02", "Ravi"), "quoteExpired");
  assert.equal(acceptProblem(open, "2026-11-20", " "), "needName");
  assert.equal(cleanName("  Ravi   Kumar "), "Ravi Kumar");
});
