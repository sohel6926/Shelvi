// Round 11 — Target Board first for everyone: the server-side role filter. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFullBoard, filterBoard, daysLeftIn, aheadStatusOf, RUPEE_KEYS, PROFIT_KEYS, BoardInputs } from "../src/targets/boardView";
import { normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

const inputs = (extra: Partial<BoardInputs> = {}): BoardInputs => ({
  month: "2026-11",
  today: "2026-11-21",
  yearTarget: 15000000,
  profitMarginPct: 25,
  monthTarget: 300000,
  monthAutoValue: 300000,
  monthCalcMode: "auto",
  monthActual: 120000,
  todayActual: 20000,
  yearActual: 9000000,
  aheadOrBehind: -150000,
  monthProfit: 30000,
  events: { actual: 6, target: 10 },
  bookings: { actual: 4, target: null },
  daysInMonth: 30,
  ...extra,
});

test("R11 board maths reuse §4: days left, daily needed, today's target, ahead/behind", () => {
  const f = buildFullBoard(inputs());
  assert.equal(f.daysLeft, 10); // 21st → 21..30
  assert.equal(f.dailyNeeded, 18000); // ceil((300000 − 120000) / 10)
  assert.equal(f.todayTarget, 20000); // ceil((300000 − 100000) / 10): before today's sales
  assert.equal(f.todayActual, 20000);
  assert.equal(f.todayPct, 100);
  assert.equal(f.todayHit, true);
  assert.equal(f.incomePct, 40);
  assert.equal(f.yearPct, 60);
  assert.equal(f.profitTarget, 75000); // 25 % of the month target
  assert.equal(f.profitPct, 40);
  assert.equal(f.aheadStatus, "behind");
  assert.equal(f.hitTarget, false);
  // a past month: no days left, nothing per day, no "today"
  const past = buildFullBoard(inputs({ month: "2026-10", daysInMonth: 31 }));
  assert.equal(past.daysLeft, 0);
  assert.equal(past.dailyNeeded, 0);
  assert.equal(past.todayTarget, null);
  assert.equal(past.todayActual, null);
  assert.equal(daysLeftIn("2026-12", "2026-11-21", 31), 31);
  assert.equal(aheadStatusOf(0), "onTrack");
  assert.equal(aheadStatusOf(1000), "ahead");
});

test("R11 admin sees everything including profit", () => {
  const v = filterBoard(buildFullBoard(inputs()), "admin", false);
  assert.equal(v.percentOnly, false);
  assert.equal(v.showProfit, true);
  assert.equal(v.monthTarget, 300000);
  assert.equal(v.dailyNeeded, 18000);
  assert.equal(v.profitActual, 30000);
  assert.equal(v.profitPct, 40);
});

for (const role of ["manager", "staff"] as const) {
  test(`R11 ${role} (default): percentages only, no ₹ and never profit`, () => {
    const v = filterBoard(buildFullBoard(inputs()), role, false) as unknown as Record<string, unknown>;
    assert.equal(v.percentOnly, true);
    assert.equal(v.showProfit, false);
    for (const k of [...RUPEE_KEYS, ...PROFIT_KEYS]) assert.equal(v[k], null, `${role} must not get ${k}`);
    assert.equal(v.incomePct, 40);
    assert.equal(v.yearPct, 60);
    assert.equal(v.todayPct, 100);
    assert.equal(v.daysLeft, 10);
    assert.equal(v.aheadStatus, "behind");
    assert.deepEqual(v.events, { actual: 6, target: 10 });
    // no rupee value hides anywhere in the answer
    const json = JSON.stringify(v);
    for (const n of ["300000", "120000", "18000", "30000", "75000", "15000000"]) assert.ok(!json.includes(n), `${role} answer leaks ${n}`);
  });

  test(`R11 ${role} with "show ₹ to everyone": ₹ sales yes, profit still never`, () => {
    const v = filterBoard(buildFullBoard(inputs()), role, true) as unknown as Record<string, unknown>;
    assert.equal(v.percentOnly, false);
    assert.equal(v.showProfit, false);
    assert.equal(v.monthTarget, 300000);
    assert.equal(v.monthActual, 120000);
    assert.equal(v.dailyNeeded, 18000);
    assert.equal(v.todayTarget, 20000);
    for (const k of PROFIT_KEYS) assert.equal(v[k], null, `${role} must not get ${k}`);
  });
}

test("R11 setting targetBoardShowRupeesToAll: default false, boolean only", () => {
  assert.equal(normalizeSettings(undefined).targetBoardShowRupeesToAll, false);
  assert.equal(normalizeSettings({ targetBoardShowRupeesToAll: true }).targetBoardShowRupeesToAll, true);
  assert.deepEqual(applySettingsPatch({}, { targetBoardShowRupeesToAll: true }).update, { targetBoardShowRupeesToAll: true });
  assert.equal(applySettingsPatch({}, { targetBoardShowRupeesToAll: "yes" }).errors.length, 1);
});
