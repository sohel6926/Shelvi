// Module 3b — goods receipt against a purchase order. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedValue, canCloseShort, parseGoodsReceipt, poStatusAfter, receivedAfter } from "../src/procure/grnRules";

const po = [
  { description: "Rice", inventoryItemId: "inv1", groceryItemId: "", qty: 50, unit: "Kg", rate: 60 },
  { description: "Oil", inventoryItemId: "inv2", groceryItemId: "", qty: 4, unit: "Tin", rate: 2150 },
  { description: "Plates", inventoryItemId: "", groceryItemId: "", qty: 1000, unit: "Piece", rate: 1.5 },
];
const today = "2026-11-18";

test("M3b a receipt notes delivered, accepted and sent back per order line", () => {
  const r = parseGoodsReceipt({ vendorBillNo: " B-77 ", lines: [{ line: 0, delivered: 50, accepted: 48, rejectReason: "wet bag" }, { line: 1, delivered: 4, accepted: 4, expiryDay: "2027-05-01", batchNo: "L9" }, { line: 2, delivered: 0, accepted: 0 }] }, po, [0, 0, 0], today);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.receiveDay, today, "today when no date is given");
  assert.equal(r.value.vendorBillNo, "B-77");
  assert.equal(r.value.lines.length, 2, "a line with nothing delivered is left out");
  assert.deepEqual({ ...r.value.lines[0] }, { line: 0, description: "Rice", unit: "Kg", rate: 60, inventoryItemId: "inv1", groceryItemId: "", ordered: 50, before: 0, delivered: 50, accepted: 48, rejected: 2, rejectReason: "wet bag", short: 2, expiryDay: "", batchNo: "" });
  assert.equal(r.value.lines[1].short, 0);
  assert.equal(r.value.lines[1].expiryDay, "2027-05-01");
  assert.equal(r.value.lines[1].batchNo, "L9");
});

test("M3b what a receipt refuses", () => {
  const one = (line: object, soFar = [0, 0, 0], extra: object = {}) => parseGoodsReceipt({ lines: [line], ...extra }, po, soFar, today).ok;
  assert.equal(one({ line: 0, delivered: 10, accepted: 10 }), true);
  assert.equal(one({ line: 3, delivered: 1, accepted: 1 }), false, "line not on the order");
  assert.equal(one({ line: 0.5, delivered: 1, accepted: 1 }), false, "line index must be whole");
  assert.equal(one({ line: 0, delivered: 10, accepted: 11 }), false, "accepted above delivered");
  assert.equal(one({ line: 0, delivered: 10, accepted: 8 }), false, "sent back without a reason");
  assert.equal(one({ line: 0, delivered: 51, accepted: 51 }), false, "more than ordered");
  assert.equal(one({ line: 0, delivered: 51, accepted: 50, rejectReason: "extra" }), true, "the extra is sent back");
  assert.equal(one({ line: 0, delivered: 11, accepted: 11 }, [40, 0, 0]), false, "more than what is still due");
  assert.equal(one({ line: 0, delivered: 10, accepted: 10 }, [40, 0, 0]), true, "exactly what is still due");
  assert.equal(one({ line: 0, delivered: -1, accepted: 0 }), false, "negative");
  assert.equal(one({ line: 0, delivered: "5", accepted: 5 }), false, "text instead of a number");
  assert.equal(one({ line: 0, delivered: 1.2345, accepted: 1 }), false, "too many decimals");
  assert.equal(one({ line: 0, delivered: 0, accepted: 0 }), false, "nothing delivered at all");
  assert.equal(one({ line: 1, delivered: 1, accepted: 1, expiryDay: "2026-11-17" }), false, "already expired goods accepted");
  assert.equal(one({ line: 1, delivered: 1, accepted: 0, rejectReason: "expired", expiryDay: "2026-11-17" }), true, "expired goods sent back");
  assert.equal(one({ line: 1, delivered: 1, accepted: 1, expiryDay: "1-5-2027" }), false, "bad expiry date");
  assert.equal(one({ line: 0, delivered: 1, accepted: 1 }, [0, 0, 0], { receiveDay: "2026-11-19" }), false, "tomorrow");
  assert.equal(one({ line: 0, delivered: 1, accepted: 1 }, [0, 0, 0], { receiveDay: "2026-11-10" }), true, "an earlier day is fine");
  assert.equal(parseGoodsReceipt({ lines: [{ line: 0, delivered: 1, accepted: 1 }, { line: 0, delivered: 1, accepted: 1 }] }, po, [0, 0, 0], today).ok, false, "same line twice");
  assert.equal(parseGoodsReceipt({ lines: "x" }, po, [0, 0, 0], today).ok, false, "lines must be a list");
  assert.equal(parseGoodsReceipt({ lines: [{ line: 0, delivered: 1, accepted: 1 }], vendorBillNo: "x".repeat(41) }, po, [0, 0, 0], today).ok, false, "long bill number");
});

test("M3b received so far and the order's status", () => {
  assert.deepEqual(receivedAfter(3, [10, 0], [{ line: 0, accepted: 40 }, { line: 2, accepted: 250.5 }]), [50, 0, 250.5]);
  assert.equal(poStatusAfter([50, 4, 1000], [0, 0, 0]), "approved");
  assert.equal(poStatusAfter([50, 4, 1000], [50, 0, 0]), "partReceived");
  assert.equal(poStatusAfter([50, 4, 1000], [50, 4, 999.999]), "partReceived");
  assert.equal(poStatusAfter([50, 4, 1000], [50, 4, 1000]), "received");
  assert.equal(poStatusAfter([], []), "approved", "an order without lines is never complete");
  assert.deepEqual(["pendingApproval", "approved", "partReceived", "received", "cancelled"].map(canCloseShort), [false, false, true, false, false]);
});

test("M3b value of the accepted goods at the order's rates", () => {
  assert.equal(acceptedValue([{ accepted: 48, rate: 60 }, { accepted: 4, rate: 2150 }]), 11480);
  assert.equal(acceptedValue([{ accepted: 0.333, rate: 99.99 }]), 33.3);
  assert.equal(acceptedValue([]), 0);
});
