// Module 1b — 15-minute first-response rule (TAT) and escalation. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LEAD_TAT, LeadTatConfig, TatLead, isFirstResponse, minutesLate, normalizeLeadTat, parseLeadTatPatch, tatStep, TAT_STALE_MS } from "../src/leads/tatRules";
import { normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 18, 6, 0, 0);
const cfg = (extra: Partial<LeadTatConfig> = {}): LeadTatConfig => ({ on: true, minutes: 15, escalate: true, ...extra });
const lead = (extra: Partial<TatLead> = {}): TatLead => ({ status: "new", cancelled: false, createdAtMs: T0, alertedAtMs: null, escalatedAtMs: null, ...extra });

test("M1b defaults: on, 15 minutes, owner told", () => {
  assert.deepEqual(DEFAULT_LEAD_TAT, { on: true, minutes: 15, escalate: true });
  assert.deepEqual(normalizeSettings(undefined).leadTat, DEFAULT_LEAD_TAT);
  assert.deepEqual(normalizeLeadTat({ on: false, minutes: 30, escalate: false }), { on: false, minutes: 30, escalate: false });
  assert.deepEqual(normalizeLeadTat({ on: "x", minutes: 2, escalate: 1 }), { on: false, minutes: 15, escalate: false });
});

test("M1b timeline of one unanswered lead: nothing → alert at 15 → escalate at 30 → nothing", () => {
  assert.equal(tatStep(lead(), T0 + 14 * MIN + 59000, cfg()), "none");
  assert.equal(tatStep(lead(), T0 + 15 * MIN, cfg()), "alert");
  // alert already sent → wait for the second limit
  assert.equal(tatStep(lead({ alertedAtMs: T0 + 15 * MIN }), T0 + 29 * MIN, cfg()), "none");
  assert.equal(tatStep(lead({ alertedAtMs: T0 + 15 * MIN }), T0 + 30 * MIN, cfg()), "escalate");
  assert.equal(tatStep(lead({ alertedAtMs: T0 + 15 * MIN, escalatedAtMs: T0 + 30 * MIN }), T0 + 300 * MIN, cfg()), "none");
});

test("M1b a missed first alert goes straight to the owner once, never both", () => {
  assert.equal(tatStep(lead(), T0 + 45 * MIN, cfg()), "escalate");
  assert.equal(tatStep(lead({ escalatedAtMs: T0 + 45 * MIN }), T0 + 50 * MIN, cfg()), "none");
});

test("M1b escalate off: only the first alert, once", () => {
  const c = cfg({ escalate: false });
  assert.equal(tatStep(lead(), T0 + 45 * MIN, c), "alert");
  assert.equal(tatStep(lead({ alertedAtMs: T0 + 45 * MIN }), T0 + 500 * MIN, c), "none");
});

test("M1b no alert for: switch off, answered, cancelled, undated, future-dated, stale leads", () => {
  const late = T0 + 60 * MIN;
  assert.equal(tatStep(lead(), late, cfg({ on: false })), "none");
  for (const status of ["contacted", "requirement", "tasting", "qualified", "quoted", "won", "lost", "duplicate", "invalid"]) assert.equal(tatStep(lead({ status }), late, cfg()), "none", status);
  assert.equal(tatStep(lead({ status: "assigned" }), late, cfg()), "escalate", "assigned but not answered still counts");
  assert.equal(tatStep(lead({ cancelled: true }), late, cfg()), "none");
  assert.equal(tatStep(lead({ createdAtMs: null }), late, cfg()), "none");
  assert.equal(tatStep(lead({ createdAtMs: late + MIN }), late, cfg()), "none");
  assert.equal(tatStep(lead(), T0 + TAT_STALE_MS + 1, cfg()), "none");
  assert.equal(tatStep(lead(), T0 + TAT_STALE_MS, cfg()), "escalate");
});

test("M1b custom minutes", () => {
  const c = cfg({ minutes: 60 });
  assert.equal(tatStep(lead(), T0 + 59 * MIN, c), "none");
  assert.equal(tatStep(lead(), T0 + 60 * MIN, c), "alert");
  assert.equal(tatStep(lead({ alertedAtMs: 1 }), T0 + 120 * MIN, c), "escalate");
});

test("M1b isFirstResponse: leaving new / assigned stamps once", () => {
  assert.equal(isFirstResponse({ status: "new" }), false);
  assert.equal(isFirstResponse({ status: "assigned" }), false);
  assert.equal(isFirstResponse({}), false);
  assert.equal(isFirstResponse({ status: "contacted" }), true);
  assert.equal(isFirstResponse({ status: "lost" }), true);
  assert.equal(isFirstResponse({ status: "contacted", firstResponseAt: null }), true);
  assert.equal(isFirstResponse({ status: "contacted", firstResponseAt: { seconds: 1 } }), false);
  assert.equal(isFirstResponse(undefined), false);
});

test("M1b minutesLate for the client chip", () => {
  assert.equal(minutesLate(T0, T0 + 10 * MIN, cfg()), 0);
  assert.equal(minutesLate(T0, T0 + 15 * MIN, cfg()), 0);
  assert.equal(minutesLate(T0, T0 + 22 * MIN + 30000, cfg()), 7);
  assert.equal(minutesLate(T0, T0 + 500 * MIN, cfg({ on: false })), 0);
  assert.equal(minutesLate(null, T0, cfg()), 0);
});

test("M1b settings patch: strict, stored whole", () => {
  assert.equal(parseLeadTatPatch({ on: true, minutes: 15, escalate: true }).ok, true);
  assert.equal(parseLeadTatPatch({ on: true, minutes: 4, escalate: true }).ok, false);
  assert.equal(parseLeadTatPatch({ on: true, minutes: 1441, escalate: true }).ok, false);
  assert.equal(parseLeadTatPatch({ on: true, minutes: 15.5, escalate: true }).ok, false);
  assert.equal(parseLeadTatPatch({ on: true, minutes: "15", escalate: true }).ok, false);
  assert.equal(parseLeadTatPatch({ on: true, minutes: 15 }).ok, false);
  assert.equal(parseLeadTatPatch([]).ok, false);
  const good = applySettingsPatch({}, { leadTat: { on: false, minutes: 30, escalate: false } });
  assert.equal(good.errors.length, 0);
  assert.deepEqual(good.update, { leadTat: { on: false, minutes: 30, escalate: false } });
  const bad = applySettingsPatch({}, { leadTat: { on: true, minutes: 0, escalate: true } });
  assert.equal(bad.errors.length, 1);
  assert.equal("leadTat" in bad.update, false);
});
