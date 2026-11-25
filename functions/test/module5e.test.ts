// Module 5e — food-safety checklists, checks and incidents. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FOOD_SAFETY, evaluateCheck, normalizeFoodSafety, parseFoodSafety, parseIncident } from "../src/safety/safetyRules";

test("M5e the CRM ships with no checklist — nothing is invented", () => {
  assert.deepEqual(DEFAULT_FOOD_SAFETY, { checklists: [] });
  assert.deepEqual(normalizeFoodSafety(undefined), { checklists: [] });
  assert.deepEqual(normalizeFoodSafety({ checklists: "x" }), { checklists: [] });
});

const raw = {
  checklists: [
    { id: "morning", kind: "hygiene", te: "ఉదయం పరిశుభ్రత", en: "Morning hygiene", items: [{ key: "hands", te: "చేతులు కడిగారా", en: "Hands washed" }, { te: "టోపీ, గ్లవ్స్", en: "Cap and gloves" }] },
    { kind: "temperature", te: "ఫ్రిజ్", items: [{ key: "t", te: "ఫ్రిజ్ ఉష్ణోగ్రత", type: "number", min: 1, max: 5, unit: "°C" }, { key: "t", te: "ఫ్రీజర్", type: "number", max: -15 }] },
  ],
};

test("M5e the owner's checklists are kept as written", () => {
  const r = parseFoodSafety(raw);
  assert.ok(r.ok);
  if (!r.ok) return;
  const [a, b] = r.value.checklists;
  assert.equal(a.id, "morning");
  assert.deepEqual(a.items.map((i) => [i.key, i.type]), [["hands", "yesno"], ["i2", "yesno"]], "a line with no key gets one");
  assert.equal(b.id, "c2");
  assert.equal(b.en, "ఫ్రిజ్", "English falls back to the Telugu name");
  assert.deepEqual(b.items.map((i) => [i.key, i.min, i.max, i.unit]), [["t", 1, 5, "°C"], ["tx", null, -15, ""]], "duplicate keys are made different; a one-sided limit is allowed");
  assert.equal(a.active, true);
});

test("M5e bad checklists are refused", () => {
  assert.equal(parseFoodSafety({ checklists: [{ te: "", items: [{ te: "x" }] }] }).ok, false, "no name");
  assert.equal(parseFoodSafety({ checklists: [{ te: "A", items: [] }] }).ok, false, "no lines");
  assert.equal(parseFoodSafety({ checklists: [{ te: "A", items: [{ te: "t", type: "number", min: 9, max: 2 }] }] }).ok, false, "lowest above highest");
  assert.equal(parseFoodSafety({ checklists: [{ te: "A", items: [{}] }] }).ok, false, "a line with no name");
  assert.equal(parseFoodSafety({ checklists: Array.from({ length: 31 }, () => ({ te: "A", items: [{ te: "x" }] })) }).ok, false);
});

test("M5e a check passes only when every line is answered and fine", () => {
  const cfg = parseFoodSafety(raw);
  assert.ok(cfg.ok);
  if (!cfg.ok) return;
  const [hygiene, fridge] = cfg.value.checklists;
  const pass = evaluateCheck(hygiene, { hands: true, i2: true });
  assert.ok(pass.ok && pass.value.result === "pass" && pass.value.failed === 0);
  const fail = evaluateCheck(hygiene, { hands: true, i2: false });
  assert.ok(fail.ok && fail.value.result === "fail" && fail.value.failed === 1);
  assert.equal(evaluateCheck(hygiene, { hands: true }).ok, false, "an unanswered line is not a pass");
  assert.equal(evaluateCheck(hygiene, { hands: "yes", i2: true }).ok, false);
  const ok = evaluateCheck(fridge, { t: 4, tx: -18 });
  assert.ok(ok.ok && ok.value.result === "pass");
  const warm = evaluateCheck(fridge, { t: 7.256, tx: -18 });
  assert.ok(warm.ok && warm.value.result === "fail" && warm.value.answers[0].value === 7.26 && warm.value.answers[0].ok === false);
  const edge = evaluateCheck(fridge, { t: 5, tx: -15 });
  assert.ok(edge.ok && edge.value.result === "pass", "the owner's limits are inclusive");
  assert.equal(evaluateCheck(fridge, { t: 4 }).ok, false, "a measured line needs a number");
});

test("M5e incidents", () => {
  const r = parseIncident({ what: "  కూరలో వెంట్రుక   వచ్చింది ", severity: "high", bookingId: "bk1", itemId: "a/b" }, "2026-11-19");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.what, "కూరలో వెంట్రుక వచ్చింది");
    assert.equal(r.value.severity, "high");
    assert.equal(r.value.day, "2026-11-19");
    assert.equal(r.value.bookingId, "bk1");
    assert.equal(r.value.itemId, "", "a bad id is dropped, not trusted");
  }
  assert.equal(parseIncident({ what: "x" }, "2026-11-19").ok, false);
  assert.equal(parseIncident({ what: "something happened", day: "2026-11-20" }, "2026-11-19").ok, false, "not in the future");
  const d = parseIncident({ what: "something happened", severity: "terrible" }, "2026-11-19");
  assert.ok(d.ok && d.value.severity === "medium");
});

import { missedChecks } from "../src/safety/safetyRules";
test("X38 reminders: only a checklist the owner gave a time is watched, once that time has passed and nothing was filled today", () => {
  const r = parseFoodSafety({ checklists: [
    { id: "morning", te: "ఉదయం", en: "Morning", dailyBy: "09:30", items: [{ te: "చేతులు" }] },
    { id: "fridge", te: "ఫ్రిజ్", en: "Fridge", items: [{ te: "t" }] },
    { id: "late", te: "రాత్రి", en: "Night", dailyBy: "21:00", items: [{ te: "x" }] },
    { id: "off", te: "ఆపినది", dailyBy: "08:00", active: false, items: [{ te: "x" }] },
  ] });
  assert.ok(r.ok);
  if (!r.ok) return;
  const cfg = r.value;
  assert.deepEqual(cfg.checklists.map((l) => l.dailyBy), ["09:30", "", "21:00", "08:00"], "no time unless the owner wrote one");
  assert.deepEqual(missedChecks(cfg, ["main"], new Set(), "09:29"), [], "before the time: nothing");
  assert.deepEqual(missedChecks(cfg, ["main"], new Set(), "09:30").map((m) => m.checklistId), ["morning"], "at the time, not done: reminder; no-time and paused lists never");
  assert.deepEqual(missedChecks(cfg, ["main"], new Set(["main|morning"]), "10:00"), [], "done today (even a failed one) = no reminder");
  assert.deepEqual(missedChecks(cfg, ["main", "b2"], new Set(["main|morning"]), "22:00").map((m) => `${m.branchId}|${m.checklistId}`), ["b2|morning", "main|late", "b2|late"], "each branch is checked on its own");
  assert.deepEqual(missedChecks(DEFAULT_FOOD_SAFETY, ["main"], new Set(), "23:00"), [], "no checklist, no reminder");
  assert.equal(parseFoodSafety({ checklists: [{ te: "A", dailyBy: "9am", items: [{ te: "x" }] }] }).ok, false, "a time that is not HH:MM is refused");
});

import { CALLABLE_PERMS } from "../src/roles/callablePerms";
test("X40 staff can list the active checklists (they cannot read settings)", () => {
  assert.ok("listSafetyChecklists" in CALLABLE_PERMS);
});
