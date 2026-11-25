// Module 4h — sharing overheads among events. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { overheadPool, overheadTotals, shareOverhead, EventLine } from "../src/ledger/overheadRules";

const ev = (id: string, income: number, directCost: number, guests: number): EventLine => ({ id, day: "2026-10-10", name: id, income, directCost, guests });

test("M4l shared by income", () => {
  const { lines, basisUsed } = shareOverhead(30000, [ev("a", 200000, 120000, 500), ev("b", 100000, 70000, 400)], "income");
  assert.equal(basisUsed, "income");
  assert.deepEqual(lines.map((l) => l.share), [20000, 10000]);
  assert.deepEqual(lines.map((l) => l.directProfit), [80000, 30000]);
  assert.deepEqual(lines.map((l) => l.netProfit), [60000, 20000]);
  assert.equal(lines[0].marginPct, 30);
});

test("M4l shared by guests and equally", () => {
  const events = [ev("a", 200000, 120000, 600), ev("b", 100000, 70000, 400)];
  assert.deepEqual(shareOverhead(30000, events, "guests").lines.map((l) => l.share), [18000, 12000]);
  assert.deepEqual(shareOverhead(30000, events, "equal").lines.map((l) => l.share), [15000, 15000]);
});

test("M4l the shares always add up to the pool", () => {
  const events = [ev("a", 100, 0, 1), ev("b", 100, 0, 1), ev("c", 100, 0, 1)];
  const { lines } = shareOverhead(1000, events, "income");
  assert.deepEqual(lines.map((l) => l.share), [333.33, 333.33, 333.34]);
  assert.equal(overheadTotals(lines).share, 1000);
});

test("M4l an event can turn out to lose money after its share", () => {
  const { lines } = shareOverhead(50000, [ev("small", 40000, 30000, 80), ev("big", 160000, 100000, 400)], "equal");
  assert.equal(lines[0].netProfit, -15000);
  assert.equal(lines[0].marginPct, -37.5);
});

test("M4l no income / no guest counts yet: shared equally, and said so", () => {
  const r = shareOverhead(900, [ev("a", 0, 0, 0), ev("b", 0, 0, 0), ev("c", 0, 0, 0)], "guests");
  assert.equal(r.basisUsed, "equal");
  assert.deepEqual(r.lines.map((l) => l.share), [300, 300, 300]);
  assert.equal(r.lines[0].marginPct, null);
  assert.deepEqual(shareOverhead(900, [], "income").lines, []);
});

test("M4l the pool: overhead costs by centre plus monthly salaries", () => {
  const p = overheadPool([{ centre: "kitchen-rent", amount: 40000 }, { centre: "utilities", amount: 8000 }, { centre: "utilities", amount: 1500.5 }, { centre: "general", amount: 0 }], 60000);
  assert.equal(p.total, 109500.5);
  assert.deepEqual(p.byCentre.map((c) => c.centre), ["salaries", "kitchen-rent", "utilities"]);
  assert.equal(p.byCentre[2].amount, 9500.5);
  assert.equal(overheadPool([], 0).total, 0);
});
