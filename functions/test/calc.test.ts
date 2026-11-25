// Checker 1 — hand-worked examples and invariants for the calculation engine (docs/calc-spec.md).
// Run: npm run build && node --test lib-test/   (see package.json "test")
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/calc";

const SEASON = [8, 9, 7, 6, 8, 4, 3, 4, 6, 9, 11, 10];

test("round2 half away from zero", () => {
  assert.equal(C.round2(1.005), 1.01);
  assert.equal(C.round2(-1.005), -1.01);
  assert.equal(C.round2(2.675), 2.68);
  assert.equal(C.round2(0), 0);
});

test("GST intra-state 5% with discount before tax", () => {
  const t = C.invoiceTotals(100000, 5, false, 2000);
  assert.deepEqual(t, { taxable: 98000, cgst: 2450, sgst: 2450, igst: 0, tax: 4900, total: 102900 });
});

test("GST odd paise split exactly", () => {
  const t = C.invoiceTotals(333.33, 5, false, 0);
  assert.equal(t.tax, 16.67);
  assert.equal(C.round2(t.cgst + t.sgst), t.tax);
  assert.equal(t.cgst, 8.34);
  assert.equal(t.sgst, 8.33);
});

test("GST inter-state and discount larger than subtotal", () => {
  assert.deepEqual(C.invoiceTotals(5000, 18, true), { taxable: 5000, cgst: 0, sgst: 0, igst: 900, tax: 900, total: 5900 });
  assert.equal(C.invoiceTotals(1000, 5, false, 1500).total, 0);
  assert.throws(() => C.invoiceTotals(-1, 5, false));
  assert.throws(() => C.invoiceTotals(100, 40, false));
  assert.throws(() => C.invoiceTotals(NaN, 5, false));
});

test("payments: partial, full, over-payment rejected", () => {
  assert.deepEqual(C.applyPayment(102900, 0, 50000), { newPaid: 50000, newBalance: 52900, status: "Partially Paid" });
  assert.deepEqual(C.applyPayment(102900, 50000, 52900), { newPaid: 102900, newBalance: 0, status: "Paid" });
  assert.throws(() => C.applyPayment(102900, 50000, 52901));
  assert.throws(() => C.applyPayment(1000, 0, 0));
  assert.throws(() => C.applyPayment(1000, 0, -5));
});

test("pricing: suggested price rounds up to ₹5; margin bands", () => {
  assert.equal(C.plateCost(212.5, 37.5), 250);
  assert.equal(C.suggestedPrice(250), 360); // 357.14 → 360
  assert.equal(C.suggestedPrice(245), 350); // exactly 350 stays
  assert.deepEqual(C.margin(360, 250), { pct: 30.56, band: "good" });
  assert.deepEqual(C.margin(300, 250), { pct: 16.67, band: "warn" });
  assert.deepEqual(C.margin(260, 250), { pct: 3.85, band: "bad" });
  assert.deepEqual(C.margin(0, 250), { pct: null, band: "bad" });
});

test("targets: original plan sums to the year target exactly", () => {
  for (const y of [10000000, 15000000, 20000000, 12345677]) {
    const p = C.originalPlan(y, SEASON);
    assert.equal(p.reduce((a, b) => a + b, 0), y);
    assert.ok(p.every((x) => Number.isInteger(x) && x >= 0));
  }
  assert.deepEqual(C.allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(C.allocate(7, [0, 0]), [4, 3]);
});

test("targets: January low → rest of year goes up, total stays", () => {
  const y = 15000000;
  const orig = C.originalPlan(y, SEASON);
  const jan = orig[0] * 0.7;
  const r = C.replan(y, SEASON, [jan]);
  assert.equal(r.months.reduce((a, m) => a + m.revised, 0), y);
  assert.ok(r.months.slice(1).every((m) => m.revised >= m.original));
  assert.ok(r.aheadOrBehind < 0);
  assert.equal(r.months[0].isActual, true);
});

test("targets: year already beaten → future months 0", () => {
  const r = C.replan(1000, SEASON, [600, 600]);
  assert.ok(r.months.slice(2).every((m) => m.revised === 0));
});

test("targets: profit and daily needed", () => {
  assert.equal(C.profitTarget(15000000), 3750000);
  assert.equal(C.dailyNeeded(1149000, 541000, 26), 23385); // 608000/26 = 23384.6 → 23385
  assert.equal(C.dailyNeeded(100, 200, 3), 0);
  assert.throws(() => C.dailyNeeded(100, 0, 0));
});

test("cooking: learns from the preview's pulihora history", () => {
  const h = [{ guests: 450, cooked: 81, leftover: 14 }, { guests: 600, cooked: 108, leftover: 20 }, { guests: 200, cooked: 36, leftover: 6 }];
  const l = C.learn(18, h);
  // eaten/100: 14.889, 14.667, 15.0 → mean 14.852
  assert.ok(Math.abs(l.learnedPer100 - 14.85185) < 1e-4);
  assert.equal(l.changePct, -17);
  assert.equal(l.advice, "cut");
  assert.equal(C.suggest(l.learnedPer100, "kg", "wedding", 250), 39); // 38.99 → 39.0
});

test("cooking: few events are blended with the starting amount", () => {
  const l = C.learn(18, [{ guests: 100, cooked: 15, leftover: 0 }]);
  assert.equal(l.learnedPer100, (15 + 18 * 2) / 3); // 17
  assert.equal(C.learn(18, []).learnedPer100, 18);
  assert.equal(C.learn(18, []).leftoverPct, null);
  assert.throws(() => C.learn(18, [{ guests: 100, cooked: 10, leftover: 11 }]));
});

test("cooking: only newest 5 events count; pcs round up; annadanam factor", () => {
  const old = { guests: 100, cooked: 100, leftover: 0 };
  const recent = { guests: 100, cooked: 10, leftover: 0 };
  assert.equal(C.learn(10, [old, recent, recent, recent, recent, recent]).learnedPer100, 10);
  assert.equal(C.suggest(200, "pcs", "annadanam", 333), 840); // 200*1.2*3.33*1.05 = 839.16 → 840
  assert.equal(C.suggest(10, "L", "office", 100), 9.5); // 9.45 → 9.5
});

test("wages: half day, full day, overtime", () => {
  assert.equal(C.dayPay(800, 0), 0);
  assert.equal(C.dayPay(800, 3), 400);
  assert.equal(C.dayPay(800, 6), 800);
  assert.equal(C.dayPay(800, 10), 1100); // 800 + 2*100*1.5
  assert.deepEqual(C.monthSalary([{ dailyWage: 800, hours: 10 }, { dailyWage: 800, hours: 8 }], 2500), { gross: 1900, net: -600 });
  assert.throws(() => C.dayPay(800, 25));
});

test("health: break-even, prime cost, ads, profit", () => {
  assert.equal(C.breakEven(120000, 541000, 300000), 269378);
  assert.equal(C.breakEven(1000, 100, 120), null);
  assert.deepEqual(C.primeCostPct(200000, 120000, 541000), { pct: 59.15, band: "good" });
  assert.deepEqual(C.adsResult(12000, 48000, 4), { roas: 4, costPerBooking: 3000, band: "good" });
  assert.deepEqual(C.adsResult(0, 48000, 4), { roas: null, costPerBooking: null, band: "none" });
  assert.deepEqual(C.adsResult(10000, 5000, 0), { roas: 0.5, costPerBooking: null, band: "bad" });
  assert.deepEqual(C.profit(541000, 220000, 120000, 50000, 21300), { profit: 129700, marginPct: 23.97 });
});

test("periods use India time", () => {
  // 2026-11-05 02:30 IST = 2026-11-04 21:00 UTC (a Thursday)
  const now = new Date(Date.UTC(2026, 10, 4, 21, 0));
  const day = C.periodRange(now, "day");
  assert.equal(day.start.toISOString(), "2026-11-04T18:30:00.000Z");
  assert.equal(day.end.toISOString(), "2026-11-05T18:30:00.000Z");
  assert.equal(C.periodRange(now, "week").start.toISOString(), "2026-11-01T18:30:00.000Z"); // Mon 2 Nov
  assert.equal(C.periodRange(now, "month").start.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(C.periodRange(now, "3m").start.toISOString(), "2026-08-31T18:30:00.000Z"); // 1 Sep
  assert.equal(C.periodRange(now, "12m").start.toISOString(), "2025-11-30T18:30:00.000Z"); // 1 Dec 2025
  assert.equal(C.periodRange(new Date(Date.UTC(2027, 0, 1, 0, 0)), "6m").start.toISOString(), "2026-07-31T18:30:00.000Z");
});

test("nightly invoice check", () => {
  assert.deepEqual(C.checkInvoice({ total: 1000, amountPaid: 400, balanceDue: 600 }, [100, 300]), []);
  assert.deepEqual(C.checkInvoice({ total: 1000, amountPaid: 400, balanceDue: 500 }, [400]), ["balance-mismatch"]);
  assert.deepEqual(C.checkInvoice({ total: 1000, amountPaid: 1200, balanceDue: 0 }, [1200]), ["overpaid"]);
  assert.deepEqual(C.checkInvoice({ total: 1000, amountPaid: 400, balanceDue: 600 }, [300]), ["paid-mismatch"]);
});

// ---- Fixes found by Checker 2 ----
test("allocate: exact ties go to the earlier month", () => {
  assert.deepEqual(C.allocate(578508, [4, 12, 14]), [77135, 231403, 269970]);
});

test("replan: all 12 months finished and behind target does not crash", () => {
  const r = C.replan(1200, Array(12).fill(1), [...Array(11).fill(100), 99.4]);
  assert.equal(r.months.length, 12);
  assert.ok(r.months.every((m) => m.isActual));
  assert.ok(Math.abs(r.aheadOrBehind - -0.6) < 1e-9);
});

test("stricter input checks", () => {
  assert.throws(() => C.profitTarget(0));
  assert.throws(() => C.profitTarget(1000.5));
  assert.throws(() => C.profitTarget(1000, -10));
  assert.throws(() => C.invoiceTotals(100, 18, "yes" as unknown as boolean, 0));
  assert.throws(() => C.applyPayment(0, 0, 0.001));
  assert.equal(C.suggest(0, "kg", "wedding", 100), 0);
});

// ---- Menu quotes (owner's menus, Nov 2026) ----
const LUNCH: C.MenuPricing = {
  pricePerPlate: 290, minOrder: 50,
  servingBoy: { chargePerPerson: 700, freeRule: "per50" },
  freePlates: { perPlates: 50, extraPlates: 5 },
  extras: [{ key: "water250", price: 15 }, { key: "icecream", price: 15 }, { key: "sweetpan", price: 20 }, { key: "watercan", price: 70 }, { key: "extrasweet", price: null }],
  replacements: [{ key: "bobbatlu", extraPerPlate: 10 }, { key: "panasapottu", extraPerPlate: 20 }],
};
const TIFFIN1: C.MenuPricing = { pricePerPlate: 130, minOrder: 30, servingBoy: { chargePerPerson: 700, freeRule: "none" }, freePlates: null, extras: [], replacements: [] };

test("lunch 120 plates: 10 free plates, 2 free boys, bobbatlu, extras, no GST", () => {
  const q = C.quoteForMenu(LUNCH, { plates: 120, servingBoys: 3, transport: 1500, replacements: ["bobbatlu"], extras: [{ key: "water250", qty: 120 }, { key: "extrasweet", qty: 120, price: 25 }], gstRate: 0 });
  assert.equal(q.freePlates, 10);
  assert.equal(q.platesToCook, 130);
  assert.equal(q.freeServingBoys, 2);
  assert.equal(q.chargedServingBoys, 1);
  // 120*290 + 120*10 + 120*15 + 120*25 + 700 + 1500 = 34800+1200+1800+3000+700+1500
  assert.equal(q.subtotal, 43000);
  assert.equal(q.totals.total, 43000);
  assert.equal(q.totals.tax, 0);
  assert.equal(q.belowMinimum, false);
});

test("tiffin below minimum is flagged, boys all charged", () => {
  const q = C.quoteForMenu(TIFFIN1, { plates: 25, servingBoys: 1, transport: 0, replacements: [], extras: [], gstRate: 0 });
  assert.equal(q.belowMinimum, true);
  assert.equal(q.subtotal, 25 * 130 + 700);
  assert.equal(q.freePlates, 0);
});

test("menu quote rejects bad input", () => {
  assert.throws(() => C.quoteForMenu(LUNCH, { plates: 100, servingBoys: 0, transport: 0, replacements: [], extras: [{ key: "extrasweet", qty: 10 }], gstRate: 0 }));
  assert.throws(() => C.quoteForMenu(LUNCH, { plates: 0, servingBoys: 0, transport: 0, replacements: [], extras: [], gstRate: 0 }));
  assert.throws(() => C.quoteForMenu(LUNCH, { plates: 100, servingBoys: 0, transport: 0, replacements: ["paneer"], extras: [], gstRate: 0 }));
});

test("price review reminder after 12 months", () => {
  assert.equal(C.priceReviewDue("2025-06-28", "2026-06-27"), false);
  assert.equal(C.priceReviewDue("2025-06-28", "2026-06-28"), true);
  assert.equal(C.priceReviewDue("2024-02-11", "2026-11-05"), true);
  assert.equal(C.priceReviewDue("2026-08-24", "2026-11-05"), false);
});

// ---- Fixes found by Checker 2, round 2 ----
test("menu quote rejects impossible menus and duplicates", () => {
  const base = { plates: 100, servingBoys: 3, transport: 1000, replacements: [], extras: [], gstRate: 0 };
  assert.throws(() => C.quoteForMenu({ ...LUNCH, freePlates: { perPlates: 0, extraPlates: 5 } }, base));
  assert.throws(() => C.quoteForMenu({ ...LUNCH, freePlates: { perPlates: 50, extraPlates: -1 } }, base));
  assert.throws(() => C.quoteForMenu({ ...LUNCH, servingBoy: { chargePerPerson: -500, freeRule: "per50" } }, base));
  assert.throws(() => C.quoteForMenu({ ...LUNCH, replacements: [{ key: "x", extraPerPlate: -3 }] }, base));
  assert.throws(() => C.quoteForMenu({ ...LUNCH, servingBoy: { chargePerPerson: 700, freeRule: "weird" as "none" } }, base));
  assert.throws(() => C.quoteForMenu(LUNCH, { ...base, replacements: ["bobbatlu", "bobbatlu"] }));
  assert.equal(C.quoteForMenu(LUNCH, { plates: 50, servingBoys: 0, transport: 0, gstRate: 0 } as unknown as C.QuoteInput).subtotal, 14500);
});

test("price review: impossible dates rejected, 29 Feb → 1 Mar", () => {
  assert.throws(() => C.priceReviewDue("2025-02-30", "2026-11-04"));
  assert.throws(() => C.priceReviewDue("2025-13-05", "2026-11-04"));
  assert.throws(() => C.priceReviewDue("2025-01-05", "2026-02-30"));
  assert.equal(C.priceReviewDue("2024-02-29", "2025-02-28"), false);
  assert.equal(C.priceReviewDue("2024-02-29", "2025-03-01"), true);
});
