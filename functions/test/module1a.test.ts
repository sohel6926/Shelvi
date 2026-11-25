// Module 1a — lead pipeline stages + who gets a new lead (auto-assign). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LEAD_ASSIGN,
  LEAD_CLOSED_STATUSES,
  LEAD_STATUSES,
  LeadAssignConfig,
  canAutoAssign,
  normalizeLeadAssign,
  parseLeadAssignPatch,
  pickAssignee,
  statusAfterAssign,
} from "../src/leads/assignRules";
import { normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

const cfg = (extra: Partial<LeadAssignConfig> = {}): LeadAssignConfig => ({ auto: true, mode: "roundRobin", pool: ["a", "b", "c"], rules: [], ...extra });

test("M1a stages: old codes stay, spec stages added, closed set is right", () => {
  for (const old of ["new", "contacted", "tasting", "quoted", "won", "lost"]) assert.ok((LEAD_STATUSES as readonly string[]).includes(old), old);
  for (const added of ["assigned", "requirement", "qualified", "duplicate", "invalid"]) assert.ok((LEAD_STATUSES as readonly string[]).includes(added), added);
  assert.deepEqual([...LEAD_CLOSED_STATUSES].sort(), ["duplicate", "invalid", "lost", "won"]);
  assert.equal(new Set(LEAD_STATUSES).size, LEAD_STATUSES.length);
});

test("M1a auto off: nobody is picked, default is off", () => {
  assert.equal(DEFAULT_LEAD_ASSIGN.auto, false);
  assert.equal(pickAssignee({ source: "instagram" }, cfg({ auto: false }), ["a", "b", "c"], ""), null);
  assert.equal(normalizeSettings(undefined).leadAssign.auto, false);
});

test("M1a turn by turn: a → b → c → a, everyone gets the same share", () => {
  let last = "";
  const got: string[] = [];
  for (let i = 0; i < 9; i++) {
    const p = pickAssignee({ source: "google" }, cfg(), ["a", "b", "c"], last);
    assert.ok(p);
    assert.equal(p.via, "roundRobin");
    got.push(p.uid);
    last = p.uid;
  }
  assert.deepEqual(got, ["a", "b", "c", "a", "b", "c", "a", "b", "c"]);
});

test("M1a turn by turn skips people who are not active / not eligible", () => {
  assert.equal(pickAssignee({ source: "google" }, cfg(), ["a", "c"], "a")?.uid, "c");
  assert.equal(pickAssignee({ source: "google" }, cfg(), ["a", "c"], "c")?.uid, "a");
  assert.equal(pickAssignee({ source: "google" }, cfg(), ["b"], "b")?.uid, "b");
  assert.equal(pickAssignee({ source: "google" }, cfg(), [], "a"), null);
  assert.equal(pickAssignee({ source: "google" }, cfg(), ["zzz"], "a"), null);
});

test("M1a turn continues after a person who left the pool list is unknown → starts from the first", () => {
  assert.equal(pickAssignee({ source: "google" }, cfg(), ["a", "b", "c"], "gone")?.uid, "a");
  assert.equal(pickAssignee({ source: "google" }, cfg({ pool: [] }), ["a"], ""), null);
});

test("M1a rules mode: source rule wins, falls back to turn by turn, and ignores an inactive person", () => {
  const c = cfg({ mode: "rules", rules: [{ source: "instagram", uid: "b" }, { source: "justdial", uid: "x" }] });
  assert.deepEqual(pickAssignee({ source: "instagram" }, c, ["a", "b", "c"], "a"), { uid: "b", via: "rule" });
  assert.deepEqual(pickAssignee({ source: "google" }, c, ["a", "b", "c"], "a"), { uid: "b", via: "roundRobin" });
  // "x" is not active → the JustDial lead goes turn by turn instead of being lost
  assert.deepEqual(pickAssignee({ source: "justdial" }, c, ["a", "b", "c"], "c"), { uid: "a", via: "roundRobin" });
  // in roundRobin mode the rules are ignored
  assert.equal(pickAssignee({ source: "instagram" }, cfg({ rules: [{ source: "instagram", uid: "c" }] }), ["a", "b", "c"], "")?.uid, "a");
});

test("M1a canAutoAssign: only a fresh, live, unassigned lead", () => {
  assert.equal(canAutoAssign({ status: "new" }), true);
  assert.equal(canAutoAssign({}), true);
  assert.equal(canAutoAssign({ status: "new", assignedTo: "" }), true);
  assert.equal(canAutoAssign({ status: "new", assignedTo: "a" }), false);
  assert.equal(canAutoAssign({ status: "contacted" }), false);
  assert.equal(canAutoAssign({ status: "new", cancelled: true }), false);
  assert.equal(canAutoAssign(undefined), false);
});

test("M1a statusAfterAssign: new ↔ assigned only; later stages never move back", () => {
  assert.equal(statusAfterAssign("new", true), "assigned");
  assert.equal(statusAfterAssign("assigned", false), "new");
  assert.equal(statusAfterAssign("contacted", true), "contacted");
  assert.equal(statusAfterAssign("quoted", false), "quoted");
  assert.equal(statusAfterAssign("won", true), "won");
  assert.equal(statusAfterAssign("garbage", true), "assigned");
});

test("M1a normalizeLeadAssign: bad stored data becomes a safe config", () => {
  assert.deepEqual(normalizeLeadAssign(undefined), DEFAULT_LEAD_ASSIGN);
  assert.deepEqual(normalizeLeadAssign("x"), DEFAULT_LEAD_ASSIGN);
  const n = normalizeLeadAssign({ auto: "yes", mode: "weird", pool: ["a", "a", 5, "", "b/c", "b"], rules: [{ source: "instagram", uid: "a" }, { source: "tv", uid: "a" }, { source: "google" }] });
  assert.deepEqual(n, { auto: false, mode: "roundRobin", pool: ["a", "b"], rules: [{ source: "instagram", uid: "a" }] });
});

test("M1a parseLeadAssignPatch: strict", () => {
  assert.equal(parseLeadAssignPatch(null).ok, false);
  assert.equal(parseLeadAssignPatch({ auto: "true", mode: "roundRobin", pool: ["a"] }).ok, false);
  assert.equal(parseLeadAssignPatch({ auto: true, mode: "x", pool: ["a"] }).ok, false);
  assert.equal(parseLeadAssignPatch({ auto: true, mode: "roundRobin", pool: ["a", "a"] }).ok, false);
  assert.equal(parseLeadAssignPatch({ auto: true, mode: "roundRobin", pool: [] }).ok, false, "on with nobody picked");
  assert.equal(parseLeadAssignPatch({ auto: false, mode: "roundRobin", pool: [] }).ok, true, "off with nobody is fine");
  assert.equal(parseLeadAssignPatch({ auto: true, mode: "rules", pool: ["a"], rules: [{ source: "tv", uid: "a" }] }).ok, false);
  assert.equal(parseLeadAssignPatch({ auto: true, mode: "rules", pool: ["a"], rules: [{ source: "google", uid: "a" }, { source: "google", uid: "b" }] }).ok, false);
  const ok = parseLeadAssignPatch({ auto: true, mode: "rules", pool: ["a", "b"], rules: [{ source: "google", uid: "b", extra: 1 }] });
  assert.deepEqual(ok, { ok: true, value: { auto: true, mode: "rules", pool: ["a", "b"], rules: [{ source: "google", uid: "b" }] } });
});

test("M1a settings patch: leadAssign is validated and stored; other settings untouched", () => {
  const good = applySettingsPatch({}, { leadAssign: { auto: true, mode: "roundRobin", pool: ["u1", "u2"], rules: [] } });
  assert.equal(good.errors.length, 0);
  assert.deepEqual(good.update.leadAssign, { auto: true, mode: "roundRobin", pool: ["u1", "u2"], rules: [] });
  assert.deepEqual(Object.keys(good.update), ["leadAssign"]);
  const bad = applySettingsPatch({}, { leadAssign: { auto: true, mode: "roundRobin", pool: [] } });
  assert.equal(bad.errors.length, 1);
  assert.equal("leadAssign" in bad.update, false);
  assert.deepEqual(normalizeSettings({ leadAssign: good.update.leadAssign }).leadAssign, good.update.leadAssign);
});

test("M1a fairness over many leads with a mixed rule: turns are not used up by rule leads", () => {
  const c = cfg({ mode: "rules", pool: ["a", "b"], rules: [{ source: "instagram", uid: "a" }] });
  let last = "";
  const count: Record<string, number> = { a: 0, b: 0 };
  const sources = ["google", "instagram", "google", "instagram", "google", "google"];
  for (const source of sources) {
    const p = pickAssignee({ source }, c, ["a", "b"], last);
    assert.ok(p);
    count[p.uid]++;
    if (p.via === "roundRobin") last = p.uid;
  }
  // 4 google leads split 2 / 2; 2 instagram leads both to "a"
  assert.deepEqual(count, { a: 4, b: 2 });
});
