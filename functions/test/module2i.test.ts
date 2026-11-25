// Module 2i — standard / estimated / actual cost kept apart. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { actualTotal, costCompare, costFigure, needsEstimate, nextEstimateId } from "../src/costs/costRules";

test("M2i cost figure: ingredients × rates + labour and overhead per plate", () => {
  const f = costFigure({ guests: 200, lines: [{ qty: 50, rate: 60 }, { qty: 10, rate: 150 }, { qty: 0, rate: null }], labourPerPlate: 20, overheadPerPlate: 10 });
  assert.deepEqual(f, { guests: 200, food: 4500, labour: 4000, overhead: 2000, total: 10500, perPlate: 52.5, coveragePct: 100, complete: true });
});

test("M2i a missing rate is never guessed: the figure says it is incomplete", () => {
  const f = costFigure({ guests: 100, lines: [{ qty: 50, rate: 60 }, { qty: 10, rate: null }, { qty: 5, rate: 0 }], labourPerPlate: 0, overheadPerPlate: 0 });
  assert.equal(f.food, 3000);
  assert.equal(f.coveragePct, 33.3);
  assert.equal(f.complete, false);
  const none = costFigure({ guests: 100, lines: [], labourPerPlate: 20, overheadPerPlate: 0 });
  assert.equal(none.complete, false);
  assert.equal(none.coveragePct, null);
  assert.equal(none.total, 2000);
  assert.equal(costFigure({ guests: 0, lines: [{ qty: 1, rate: 5 }], labourPerPlate: 9, overheadPerPlate: 9 }).perPlate, 0);
});

test("M2i the estimate is frozen once, when the booking becomes Confirmed", () => {
  assert.equal(needsEstimate({ status: "Inquiry" }, { status: "Confirmed" }), true);
  assert.equal(needsEstimate(undefined, { status: "Confirmed" }), true, "created as confirmed");
  assert.equal(needsEstimate({ status: "Inquiry" }, { status: "Confirmed", costEstimate: { total: 5 } }), false, "already has one");
  assert.equal(needsEstimate({ status: "Confirmed" }, { status: "Confirmed", guestCount: 300 } as never), false, "a later edit never overwrites it");
  assert.equal(needsEstimate({ status: "InProgress" }, { status: "Confirmed" }), false);
  assert.equal(needsEstimate({ status: "Inquiry" }, { status: "Inquiry" }), false);
  assert.equal(needsEstimate({ status: "Inquiry" }, { status: "Confirmed", archived: true }), false);
  assert.equal(needsEstimate({ status: "Cancelled" }, { status: "Confirmed" }), true, "restored booking without an estimate");
});

test("M2i actual total from costActual", () => {
  assert.equal(actualTotal({ food: 4000.5, labour: 3000, transport: 500, rentals: 0, other: 250.25, revenue: 99999 }), 7750.75);
  assert.equal(actualTotal(undefined), null);
  assert.equal(actualTotal({}), 0);
});

test("M2i the three costs side by side, with the differences", () => {
  const c = costCompare({ guests: 200, standardPerPlate: 50, estimatedTotal: 10500, actualTotal: 12000 });
  assert.deepEqual(c.standard, { total: 10000, perPlate: 50 });
  assert.deepEqual(c.estimated, { total: 10500, perPlate: 52.5 });
  assert.deepEqual(c.actual, { total: 12000, perPlate: 60 });
  assert.deepEqual(c.estVsStd, { amount: 500, pct: 5 });
  assert.equal(c.estVsStdFlag, "ok", "exactly 5 % is still within range");
  assert.deepEqual(c.actVsEst, { amount: 1500, pct: 14.3 });
  assert.equal(c.actVsEstFlag, "over");
  assert.equal(costCompare({ guests: 200, standardPerPlate: 50, estimatedTotal: 9000, actualTotal: 8000 }).actVsEstFlag, "under");
});

test("M2i missing figures stay missing — nothing is filled in", () => {
  const c = costCompare({ guests: 200, standardPerPlate: null, estimatedTotal: null, actualTotal: 12000 });
  assert.deepEqual(c.standard, { total: null, perPlate: null });
  assert.deepEqual(c.estimated, { total: null, perPlate: null });
  assert.equal(c.estVsStd, null);
  assert.equal(c.actVsEst, null);
  assert.equal(c.actVsEstFlag, null);
  assert.deepEqual(costCompare({ guests: 0, standardPerPlate: 50, estimatedTotal: 100, actualTotal: 100 }).standard, { total: null, perPlate: null });
  assert.equal(costCompare({ guests: 10, standardPerPlate: 0, estimatedTotal: 0, actualTotal: 50 }).actVsEst?.pct, null, "no % against a zero estimate");
});

test("M2i estimate versions count up and old ones are kept", () => {
  assert.deepEqual(nextEstimateId(undefined), { version: 1, id: "0001" });
  assert.deepEqual(nextEstimateId(1), { version: 2, id: "0002" });
  assert.deepEqual(nextEstimateId("x"), { version: 1, id: "0001" });
});
