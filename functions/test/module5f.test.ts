// Module 5f — packing and dispatch of an event. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DispatchLine, applyDelivery, applyLoadCheck, applyReconcile, applyReturn, canCancelDispatch, canEditLines, dispatchNumber, isReturnable, parseDispatchLines, shortagesOf, stepProblem } from "../src/dispatch/dispatchRules";

const raw = [
  { kind: "food", name: " Veg  Biryani ", qty: 40, unit: "kg", container: "Deksa 3", seal: "S-101" },
  { kind: "container", name: "Steel deksa", qty: 6, unit: "pcs" },
  { kind: "equipment", name: "Chafing dish", qty: 10, unit: "pcs" },
  { name: "Curd", qty: 15, unit: "kg" },
];

test("M5f the load list: food, containers and equipment", () => {
  const r = parseDispatchLines(raw);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value.map((l) => [l.line, l.kind, l.name, l.qty]), [[1, "food", "Veg Biryani", 40], [2, "container", "Steel deksa", 6], [3, "equipment", "Chafing dish", 10], [4, "food", "Curd", 15]]);
  assert.equal(r.value[0].seal, "S-101");
  assert.equal(parseDispatchLines([]).ok, false);
  assert.equal(parseDispatchLines([{ name: "", qty: 1 }]).ok, false);
  assert.equal(parseDispatchLines([{ name: "x", qty: 0 }]).ok, false);
  assert.equal(isReturnable("food"), false);
  assert.equal(isReturnable("container"), true);
});

test("M5f the steps go in order, one at a time", () => {
  assert.equal(stepProblem("packing", "packed"), "");
  assert.equal(stepProblem("packing", "loaded"), "wrong-order", "not loaded before it is packed");
  assert.equal(stepProblem("packed", "loaded"), "");
  assert.equal(stepProblem("loaded", "dispatched"), "");
  assert.equal(stepProblem("dispatched", "delivered"), "");
  assert.equal(stepProblem("delivered", "returned"), "");
  assert.equal(stepProblem("returned", "reconciled"), "");
  assert.equal(stepProblem("delivered", "reconciled"), "wrong-order");
  assert.equal(stepProblem("reconciled", "returned"), "closed");
  assert.equal(stepProblem("cancelled", "packed"), "closed");
  assert.equal(canEditLines("packing"), true);
  assert.equal(canEditLines("packed"), false, "a packed list is not rewritten");
  assert.equal(canCancelDispatch("loaded"), true);
  assert.equal(canCancelDispatch("dispatched"), false, "it has left");
});

const lines = (): DispatchLine[] => {
  const r = parseDispatchLines(raw);
  if (!r.ok) throw new Error("bad test data");
  return r.value;
};

test("M5f the load check", () => {
  const all = applyLoadCheck(lines(), {}, "");
  assert.ok(all.ok && all.value.short === 0 && all.value.lines.every((l) => l.loadedQty === l.qty), "nothing said = everything loaded");
  assert.equal(applyLoadCheck(lines(), { "3": 8 }, "").ok, false, "a short load needs its reason");
  const short = applyLoadCheck(lines(), { "3": 8 }, "2 dishes were not clean");
  assert.ok(short.ok && short.value.short === 1 && short.value.lines[2].loadedQty === 8);
  assert.equal(applyLoadCheck(lines(), { "1": 41 }, "x").ok, false, "more than was packed");
});

test("M5f delivery, return and what did not come back", () => {
  const lc = applyLoadCheck(lines(), { "3": 8 }, "note");
  assert.ok(lc.ok);
  if (!lc.ok) return;
  const loaded = lc.value.lines;
  assert.equal(applyDelivery(loaded, { "3": 9 }).ok, false, "more cannot arrive than was loaded");
  const delivered = applyDelivery(loaded, {});
  assert.ok(delivered.ok);
  if (!delivered.ok) return;
  assert.equal(delivered.value[2].deliveredQty, 8);
  assert.equal(applyReturn(delivered.value, { "2": 6 }).ok, false, "every returnable line must be counted");
  assert.equal(applyReturn(delivered.value, { "2": 7, "3": 8 }).ok, false, "more than was sent");
  const back = applyReturn(delivered.value, { "2": 6, "3": 7 });
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.equal(back.value[0].returnedQty, null, "food does not come back");
  assert.deepEqual(shortagesOf(back.value).map((s) => [s.name, s.missing]), [["Chafing dish", 1]]);
  assert.equal(applyReconcile(back.value, {}).ok, false, "a shortage needs its reason");
  const rec = applyReconcile(back.value, { "3": "left at the venue, to collect tomorrow" });
  assert.ok(rec.ok && rec.value.shortages.length === 1 && rec.value.shortages[0].reason.startsWith("left at the venue"));
  const clean = applyReturn(delivered.value, { "2": 6, "3": 8 });
  assert.ok(clean.ok && shortagesOf(clean.value).length === 0);
  assert.ok(clean.ok && applyReconcile(clean.value, {}).ok, "nothing missing: no reason needed");
});

test("M5f numbers", () => {
  assert.equal(dispatchNumber("2026-11-20", 1), "DSP-261120-001");
  assert.equal(dispatchNumber("2026-11-20", 42), "DSP-261120-042");
});
