// Module 3c — three-way match of a vendor bill against the order and the goods received. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { billedSoFar, canCancelReceipt, matchBill, normalizeBillMatch, parseBillMatchPatch, parseVendorBill } from "../src/procure/matchRules";

const po = [
  { description: "Rice", inventoryItemId: "inv1", groceryItemId: "", qty: 50, unit: "Kg", rate: 60 },
  { description: "Oil", inventoryItemId: "inv2", groceryItemId: "", qty: 4, unit: "Tin", rate: 2150 },
];
const today = "2026-11-19";
const bill = (lines: object[], extra: object = {}) => parseVendorBill({ billNo: "B-77", lines, ...extra }, po, today);
const exact = { rateTolerancePct: 0 };

test("M3c a bill needs a number and lines from the order; totals are worked out here", () => {
  const r = bill([{ line: 0, qty: 48, rate: 60 }, { line: 1, qty: 4, rate: 2150 }], { otherCharges: 100, discount: 80 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.subtotal, 11480);
  assert.equal(r.value.total, 11500);
  assert.equal(r.value.billDay, today);
  assert.equal(r.value.lines[0].poRate, 60);
  assert.equal(parseVendorBill({ billNo: "", lines: [{ line: 0, qty: 1, rate: 60 }] }, po, today).ok, false, "no bill number");
  assert.equal(bill([{ line: 2, qty: 1, rate: 1 }]).ok, false, "line not on the order");
  assert.equal(bill([{ line: 0, qty: 1, rate: 60 }, { line: 0, qty: 1, rate: 60 }]).ok, false, "same line twice");
  assert.equal(bill([{ line: 0, qty: 1, rate: 0 }]).ok, false, "no rate");
  assert.equal(bill([{ line: 0, qty: 0, rate: 60 }]).ok, false, "nothing billed");
  assert.equal(bill([{ line: 0, qty: 1, rate: 60 }], { billDay: "2026-11-20" }).ok, false, "tomorrow");
  assert.equal(bill([{ line: 0, qty: 1, rate: 60 }], { discount: 100 }).ok, false, "total not above 0");
  assert.equal(bill([{ line: 0, qty: 1, rate: 60 }], { otherCharges: -1 }).ok, false, "negative charges");
});

test("M3c matched: billed what was accepted, at the order's rate or less", () => {
  const b = bill([{ line: 0, qty: 48, rate: 60 }, { line: 1, qty: 4, rate: 2100 }]);
  assert.ok(b.ok);
  if (!b.ok) return;
  const m = matchBill(b.value, [48, 4], [0, 0], exact);
  assert.equal(m.status, "matched");
  assert.deepEqual(m.issues, []);
  assert.equal(m.supported, 11280, "a lower bill rate is accepted as it is");
  assert.equal(m.extra, 0);
});

test("M3c mismatch: more than accepted, a higher rate, charges not on the order", () => {
  const qty = bill([{ line: 0, qty: 50, rate: 60 }]);
  assert.ok(qty.ok);
  if (qty.ok) {
    const m = matchBill(qty.value, [48, 0], [0, 0], exact);
    assert.equal(m.status, "mismatch");
    assert.equal(m.issues[0].kind, "qty-over");
    assert.equal(m.issues[0].extra, 120, "2 kg × ₹60 not supported");
    assert.equal(m.supported, 2880);
  }
  const again = bill([{ line: 0, qty: 10, rate: 60 }]);
  if (again.ok) assert.equal(matchBill(again.value, [48, 0], [40, 0], exact).issues[0].kind, "qty-over", "only 8 kg is left to bill after an earlier bill");
  if (again.ok) assert.equal(matchBill(again.value, [48, 0], [38, 0], exact).status, "matched", "exactly what is left");
  const rate = bill([{ line: 0, qty: 48, rate: 62 }]);
  if (rate.ok) {
    const m = matchBill(rate.value, [48, 0], [0, 0], exact);
    assert.equal(m.issues[0].kind, "rate-over");
    assert.equal(m.issues[0].extra, 96);
    assert.equal(matchBill(rate.value, [48, 0], [0, 0], { rateTolerancePct: 5 }).status, "matched", "inside the 5% tolerance");
    assert.equal(matchBill(rate.value, [48, 0], [0, 0], { rateTolerancePct: 3 }).status, "mismatch", "₹62 is above ₹61.80");
  }
  const ch = bill([{ line: 0, qty: 48, rate: 60 }], { otherCharges: 150 });
  if (ch.ok) {
    const m = matchBill(ch.value, [48, 0], [0, 0], exact);
    assert.equal(m.status, "mismatch");
    assert.equal(m.issues[0].kind, "charges");
    assert.equal(m.extra, 150);
  }
  const nothing = bill([{ line: 1, qty: 1, rate: 2150 }]);
  if (nothing.ok) assert.equal(matchBill(nothing.value, [48, 0], [0, 0], exact).issues[0].kind, "qty-over", "billed before anything was received");
});

test("M3c billed so far comes from the live bills of the order", () => {
  assert.deepEqual(billedSoFar(2, [{ poLines: [{ line: 0, qty: 20 }, { line: 1, qty: 1 }] }, { poLines: [{ line: 0, qty: 18.5 }, { line: 5, qty: 9 }, { line: "0", qty: 9 }] }, {}]), [38.5, 1]);
  assert.deepEqual(billedSoFar(2, []), [0, 0]);
});

test("M3c a receipt can be taken back only while its goods are not billed", () => {
  const r = { cancelled: false, lines: [{ line: 0, accepted: 20 }] };
  assert.equal(canCancelReceipt(r, [48, 0], [0, 0]), true);
  assert.equal(canCancelReceipt(r, [48, 0], [28, 0]), true, "the other receipt covers the bill");
  assert.equal(canCancelReceipt(r, [48, 0], [28.001, 0]), false, "part of this receipt is billed");
  assert.equal(canCancelReceipt({ ...r, cancelled: true }, [48, 0], [0, 0]), false);
});

test("M3c match settings: rate tolerance 0–20%, default 0", () => {
  assert.deepEqual(normalizeBillMatch(undefined), { rateTolerancePct: 0 });
  assert.deepEqual(normalizeBillMatch({ rateTolerancePct: 2.5 }), { rateTolerancePct: 2.5 });
  assert.deepEqual(normalizeBillMatch({ rateTolerancePct: 50 }), { rateTolerancePct: 0 });
  assert.ok(parseBillMatchPatch({ rateTolerancePct: 20 }).ok);
  for (const v of [null, {}, { rateTolerancePct: -1 }, { rateTolerancePct: 21 }, { rateTolerancePct: "2" }]) assert.equal(parseBillMatchPatch(v).ok, false, JSON.stringify(v));
});
