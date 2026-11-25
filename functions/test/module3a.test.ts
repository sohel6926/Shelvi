// Module 3a — purchase request and purchase order rules. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PO_APPROVAL, canCancelPo, canCancelPr, canDecidePo, canDecidePr, canEditPo, canOrderFromPr, canReceivePo, docNumber, lineAmount, linesTotal,
  normalizePoApproval, parseLines, parsePoApprovalPatch, parsePurchaseOrder, parsePurchaseRequest, poStatusOnSave,
} from "../src/procure/procureRules";

const line = { description: "Sona Masoori Rice", qty: 50, unit: "Kg", rate: 62.5 };
const today = "2026-11-18";

test("M3a lines need a name, a quantity above 0 and a unit; a rate only on an order", () => {
  const pr = parseLines([{ description: " Rice ", qty: 2.5, unit: "Bag" }], false);
  assert.ok(pr.ok);
  if (pr.ok) assert.deepEqual(pr.value[0], { description: "Rice", inventoryItemId: "", groceryItemId: "", qty: 2.5, unit: "Bag", rate: 0 });
  for (const patch of [{ description: "" }, { description: "x".repeat(121) }, { qty: 0 }, { qty: -1 }, { qty: "5" }, { qty: 1.2345 }, { unit: "" }, { unit: "x".repeat(21) }]) {
    assert.equal(parseLines([{ ...line, ...patch }], false).ok, false, JSON.stringify(patch).slice(0, 40));
  }
  assert.equal(parseLines([], false).ok, false, "no lines");
  assert.equal(parseLines("x", false).ok, false, "not a list");
  assert.equal(parseLines(Array.from({ length: 101 }, () => line), false).ok, false, "too many lines");
  for (const rate of [0, -1, "62", undefined]) assert.equal(parseLines([{ ...line, rate }], true).ok, false, `rate ${rate}`);
  const po = parseLines([{ ...line, rate: 62.555, inventoryItemId: "inv1" }], true);
  assert.ok(po.ok && po.value[0].rate === 62.56 && po.value[0].inventoryItemId === "inv1");
});

test("M3a money: line amount and total are kept to paise", () => {
  assert.equal(lineAmount({ qty: 50, rate: 62.5 }), 3125);
  assert.equal(lineAmount({ qty: 0.333, rate: 99.99 }), 33.3);
  assert.equal(linesTotal([{ qty: 50, rate: 62.5 }, { qty: 3, rate: 0.1 }, { qty: 1.005, rate: 1 }]), 3126.31);
  assert.equal(linesTotal([]), 0);
});

test("M3a a request needs a date that is not in the past", () => {
  const ok = parsePurchaseRequest({ neededBy: "2026-11-20", note: " for the wedding ", bookingId: "b1", lines: [line] }, today);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.note, "for the wedding");
    assert.equal(ok.value.lines[0].rate, 0, "a request carries no price");
  }
  assert.ok(parsePurchaseRequest({ neededBy: today, lines: [line] }, today).ok, "today is allowed");
  assert.equal(parsePurchaseRequest({ neededBy: "2026-11-17", lines: [line] }, today).ok, false, "yesterday");
  assert.equal(parsePurchaseRequest({ neededBy: "20-11-2026", lines: [line] }, today).ok, false, "bad date");
  assert.equal(parsePurchaseRequest({ neededBy: today, lines: [] }, today).ok, false, "no items");
  assert.equal(parsePurchaseRequest({ neededBy: today, note: "x".repeat(501), lines: [line] }, today).ok, false, "long note");
});

test("M3a an order needs a vendor, a delivery date and priced lines; the total is worked out here", () => {
  const ok = parsePurchaseOrder({ vendorId: "v1", expectedDay: "2026-11-21", terms: "", prId: "pr1", lines: [line, { description: "Oil", qty: 2, unit: "Tin", rate: 2150 }] }, today);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.total, 7425);
    assert.equal(ok.value.prId, "pr1");
  }
  assert.equal(parsePurchaseOrder({ vendorId: "", expectedDay: today, lines: [line] }, today).ok, false, "no vendor");
  assert.equal(parsePurchaseOrder({ vendorId: "a/b", expectedDay: today, lines: [line] }, today).ok, false, "vendor id with a slash");
  assert.equal(parsePurchaseOrder({ vendorId: "v1", expectedDay: "2026-11-01", lines: [line] }, today).ok, false, "past date");
  assert.equal(parsePurchaseOrder({ vendorId: "v1", expectedDay: today, lines: [{ ...line, rate: 0 }] }, today).ok, false, "no price");
  assert.equal(parsePurchaseOrder({ vendorId: "v1", expectedDay: today, total: 1, lines: [line] }, today).ok && true, true, "a total sent by the screen is ignored");
});

test("M3a who must approve: the owner's order is approved at once, a manager's only up to the limit", () => {
  const cfg = { on: true, managerLimit: 10000 };
  assert.equal(poStatusOnSave("admin", 500000, cfg), "approved");
  assert.equal(poStatusOnSave("manager", 10000, cfg), "approved", "at the limit");
  assert.equal(poStatusOnSave("manager", 10000.01, cfg), "pendingApproval", "one paisa over");
  assert.equal(poStatusOnSave("manager", 500000, { on: false, managerLimit: 0 }), "approved", "switch off");
  assert.equal(poStatusOnSave("manager", 1, { on: true, managerLimit: 0 }), "pendingApproval", "limit 0 = every manager order waits");
  assert.equal(poStatusOnSave("staff", 1, cfg), "approved", "role is checked by the callable, not here");
});

test("M3a approval settings: default on with a ₹10,000 manager limit; bad values fall back", () => {
  assert.deepEqual(normalizePoApproval(undefined), DEFAULT_PO_APPROVAL);
  assert.deepEqual(normalizePoApproval({ on: false, managerLimit: 2500.5 }), { on: false, managerLimit: 2500.5 });
  assert.deepEqual(normalizePoApproval({ managerLimit: -1 }), DEFAULT_PO_APPROVAL);
  assert.ok(parsePoApprovalPatch({ on: true, managerLimit: 0 }).ok);
  for (const v of [null, [], { on: "yes", managerLimit: 1 }, { on: true }, { on: true, managerLimit: -5 }, { on: true, managerLimit: 1e9 }]) {
    assert.equal(parsePoApprovalPatch(v).ok, false, JSON.stringify(v));
  }
});

test("M3a what can be done in each status", () => {
  assert.deepEqual(["submitted", "approved", "rejected", "ordered", "cancelled"].map(canDecidePr), [true, false, false, false, false]);
  assert.deepEqual(["submitted", "approved", "rejected", "ordered", "cancelled"].map(canCancelPr), [true, true, false, false, false]);
  assert.deepEqual(["submitted", "approved", "rejected", "ordered", "cancelled"].map(canOrderFromPr), [false, true, false, false, false]);
  const po = ["pendingApproval", "approved", "rejected", "partReceived", "received", "cancelled"];
  assert.deepEqual(po.map(canDecidePo), [true, false, false, false, false, false]);
  assert.deepEqual(po.map(canEditPo), [true, false, true, false, false, false]);
  assert.deepEqual(po.map(canCancelPo), [true, true, true, false, false, false]);
  assert.deepEqual(po.map(canReceivePo), [false, true, false, true, false, false]);
});

test("M3a document numbers", () => {
  assert.equal(docNumber("PR", "2026-11-18", 1), "PR-261118-001");
  assert.equal(docNumber("PO", "2026-01-05", 42), "PO-260105-042");
  assert.equal(docNumber("GRN", "2026-11-18", 0), "GRN-261118-001");
  assert.equal(docNumber("PO", "2026-11-18", 1234), "PO-261118-1234");
});
