// Module 4d step 6 — a material stock adjustment waits for a supervisor. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STOCK_ADJUST, canApproveAdjust, decideProblem, isMaterial, normalizeStockAdjust, parseStockAdjustPatch } from "../src/inventory/adjustRules";

test("M4h what counts as a material change", () => {
  const cfg = { on: true, percent: 10 }; // a 10 % setting (the default is now 30 %)
  assert.equal(isMaterial(cfg, { quantity: 4, currentQty: 50, reason: "count" }), false, "8 % is small");
  assert.equal(isMaterial(cfg, { quantity: 5, currentQty: 50, reason: "damage" }), true, "exactly 10 % is material");
  assert.equal(isMaterial(cfg, { quantity: 30, currentQty: 50, reason: "correction" }), true);
  assert.equal(isMaterial(cfg, { quantity: 30, currentQty: 50, reason: "return" }), false, "goods coming back are not held");
  assert.equal(isMaterial(cfg, { quantity: 2, currentQty: 0, reason: "count" }), true, "found stock the books do not show");
  assert.equal(isMaterial({ on: false, percent: 10 }, { quantity: 50, currentQty: 50, reason: "count" }), false, "switched off");
  assert.equal(isMaterial({ on: true, percent: 0 }, { quantity: 0.1, currentQty: 50, reason: "count" }), true, "0 % = every hand change");
});

test("M4h who may approve (and so apply their own change at once)", () => {
  assert.equal(canApproveAdjust("admin", ""), true);
  assert.equal(canApproveAdjust("manager", ""), true, "a manager with no role: as before");
  assert.equal(canApproveAdjust("manager", "coo"), true);
  assert.equal(canApproveAdjust("manager", "storeManager"), false, "the store submits, a supervisor approves");
  assert.equal(canApproveAdjust("manager", "kitchenHead"), false);
  assert.equal(canApproveAdjust("staff", ""), false);
  assert.equal(canApproveAdjust("staff", "worker"), false);
});

test("M4h nobody but the owner approves their own request", () => {
  assert.equal(decideProblem({ status: "pending", requestedBy: "u1" }, { uid: "u2", level: "manager" }), "");
  assert.equal(decideProblem({ status: "pending", requestedBy: "u1" }, { uid: "u1", level: "manager" }), "own-request");
  assert.equal(decideProblem({ status: "pending", requestedBy: "u1" }, { uid: "u1", level: "admin" }), "");
  assert.equal(decideProblem({ status: "approved", requestedBy: "u1" }, { uid: "u2", level: "admin" }), "not-pending");
});

test("M4h settings", () => {
  assert.deepEqual(normalizeStockAdjust(undefined), { on: true, percent: 30 });
  assert.deepEqual(normalizeStockAdjust({ on: false, percent: 25 }), { on: false, percent: 25 });
  assert.deepEqual(normalizeStockAdjust({ percent: 500 }), { on: true, percent: 30 });
  assert.equal(parseStockAdjustPatch({ on: true, percent: 101 }).ok, false);
  assert.equal(parseStockAdjustPatch({ on: "yes", percent: 5 }).ok, false);
  assert.deepEqual(parseStockAdjustPatch({ on: true, percent: 5 }), { ok: true, value: { on: true, percent: 5 } });
});

test("M4h the owner's choice (20 Nov): the default approval threshold is 30 %", () => {
  assert.equal(DEFAULT_STOCK_ADJUST.percent, 30);
  assert.equal(isMaterial(DEFAULT_STOCK_ADJUST, { quantity: 14, currentQty: 50, reason: "count" }), false, "28 % goes through");
  assert.equal(isMaterial(DEFAULT_STOCK_ADJUST, { quantity: 15, currentQty: 50, reason: "count" }), true, "30 % is held for approval");
});
