// Module 2c — yield (cleaning loss): buy more than the recipe uses. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { grossQty, isValidYieldPct, lossQty, normalizeYieldPct } from "../src/kitchen/yieldRules";

test("M2c normalizeYieldPct: blank / bad / out of range → 100 (no loss)", () => {
  assert.equal(normalizeYieldPct(85), 85);
  assert.equal(normalizeYieldPct(100), 100);
  assert.equal(normalizeYieldPct(10), 10);
  for (const bad of [undefined, null, "85", NaN, 0, 9.9, 100.1, -5, 150]) assert.equal(normalizeYieldPct(bad), 100, String(bad));
});

test("M2c isValidYieldPct: blank or 10–100", () => {
  for (const ok of [null, undefined, 10, 85.5, 100]) assert.equal(isValidYieldPct(ok), true, String(ok));
  for (const bad of [9, 101, "85", NaN]) assert.equal(isValidYieldPct(bad), false, String(bad));
});

test("M2c no yield set → exactly the same quantity as before (no rounding drift)", () => {
  for (const [q, unit] of [[12.34, "kg"], [0.05, "L"], [7, "pcs"], [3.333, "bundle"]] as const) {
    assert.equal(grossQty(q, 100, unit), q);
    assert.equal(grossQty(q, NaN, unit), q);
  }
  assert.equal(grossQty(0, 85, "kg"), 0);
  assert.equal(grossQty(-1, 85, "kg"), 0);
});

test("M2c buy quantity = usable ÷ yield, rounded up so the kitchen is never short", () => {
  assert.equal(grossQty(8.5, 85, "kg"), 10);
  assert.equal(grossQty(10, 85, "kg"), 11.8); // 11.76 → 11.8
  assert.equal(grossQty(10, 50, "L"), 20);
  assert.equal(grossQty(1, 90, "L"), 1.2); // 1.11 → 1.2
  assert.equal(grossQty(100, 95, "pcs"), 106); // 105.26 → 106
  assert.equal(grossQty(10, 80, "bundle"), 12.5);
  for (const usable of [0.3, 2.7, 15, 99.9]) for (const y of [60, 75, 85, 99]) assert.ok(grossQty(usable, y, "kg") * (y / 100) >= usable - 1e-9, `${usable} @ ${y}%`);
});

test("M2c loss shown to the owner", () => {
  assert.equal(lossQty(10, 85), 1.5);
  assert.equal(lossQty(10, 100), 0);
  assert.equal(lossQty(0, 85), 0);
  assert.equal(lossQty(11.8, 85), 1.77);
});
