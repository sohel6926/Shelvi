// Module 1c — lead import rows, HOT / WARM / COLD score. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { importDay, normalizeImportRow, IMPORT_KINDS } from "../src/import/normalizeRow";
import { importNeedsBranch } from "../src/shared/branch";
import { bandOf, daysUntil, scoreLead, ScoreLead, HOT_MIN, WARM_MIN } from "../src/leads/scoreRules";
import { tatStep } from "../src/leads/tatRules";

const TODAY = "2026-11-18";
const lead = (extra: Partial<ScoreLead> = {}): ScoreLead => ({ status: "new", source: "other", eventDate: "", guests: null, budget: null, ...extra });
const pts = (l: ScoreLead) => scoreLead(l, TODAY)!.reasons.map((r) => r.points);

test("M1c importDay: ISO and day-first dates, empty, bad", () => {
  assert.equal(importDay(""), "");
  assert.equal(importDay(undefined), "");
  assert.equal(importDay("2026-12-05"), "2026-12-05");
  assert.equal(importDay("5/12/2026"), "2026-12-05");
  assert.equal(importDay("05-12-2026"), "2026-12-05");
  assert.equal(importDay("05.12.2026"), "2026-12-05");
  assert.equal(importDay("31/02/2026"), "bad");
  assert.equal(importDay("2026-13-01"), "bad");
  assert.equal(importDay("12/5/26"), "bad");
  assert.equal(importDay("tomorrow"), "bad");
});

test("M1c lead import row: full row, Telugu headers, defaults", () => {
  assert.ok((IMPORT_KINDS as readonly string[]).includes("leads"));
  assert.ok(importNeedsBranch("leads"));
  const r = normalizeImportRow("leads", { Name: " Lakshmi ", Mobile: "+91 98765 43210", Source: "Just Dial", "Event Date": "05/12/2026", Guests: "250", Budget: "₹75,000", "Follow Up": "2026-11-20", WhatsApp: "yes" });
  assert.deepEqual(r, {
    ok: true,
    key: "9876543210",
    doc: { name: "Lakshmi", phone: "9876543210", source: "justdial", campaignId: "", eventDate: "2026-12-05", guests: 250, budget: 75000, status: "new", followUpDate: "2026-11-20", lostReason: "", whatsappOptIn: true, imported: true },
  });
  const te = normalizeImportRow("leads", { "పేరు": "రవి", "ఫోన్": "9000000001", "అతిథులు": 100 });
  assert.ok(te.ok);
  if (te.ok) {
    assert.equal(te.doc.source, "other");
    assert.equal(te.doc.guests, 100);
    assert.equal(te.doc.budget, null);
    assert.equal(te.doc.eventDate, "");
    assert.equal(te.doc.whatsappOptIn, false);
  }
});

test("M1c lead import row: rejected rows say why", () => {
  assert.equal(normalizeImportRow("leads", { phone: "9876543210" }).ok, false, "no name");
  assert.equal(normalizeImportRow("leads", { name: "A", phone: "12345" }).ok, false, "bad phone");
  assert.equal(normalizeImportRow("leads", { name: "A", phone: "9876543210", eventDate: "soon" }).ok, false, "bad date");
  assert.equal(normalizeImportRow("leads", { name: "A", phone: "9876543210", guests: "many" }).ok, false, "bad guests");
  assert.equal(normalizeImportRow("leads", { name: "A", phone: "9876543210", guests: "10.5" }).ok, false, "half a guest");
  const zero = normalizeImportRow("leads", { name: "A", phone: "9876543210", guests: "0", budget: "0" });
  assert.ok(zero.ok && zero.doc.guests === null && zero.doc.budget === null, "0 means not known");
});

test("M1c imported leads never trigger the 15-minute alert (tatWatch passes imported as cancelled)", () => {
  const t0 = Date.UTC(2026, 10, 18, 6);
  assert.equal(tatStep({ status: "new", cancelled: true, createdAtMs: t0, alertedAtMs: null, escalatedAtMs: null }, t0 + 3600000, { on: true, minutes: 15, escalate: true }), "none");
});

test("M1c daysUntil and bands", () => {
  assert.equal(daysUntil("2026-11-18", TODAY), 0);
  assert.equal(daysUntil("2026-11-25", TODAY), 7);
  assert.equal(daysUntil("2026-11-17", TODAY), -1);
  assert.equal(daysUntil("2027-01-01", TODAY), 44);
  assert.equal(daysUntil("", TODAY), null);
  assert.equal(daysUntil("05/12/2026", TODAY), null);
  assert.equal(bandOf(HOT_MIN), "hot");
  assert.equal(bandOf(HOT_MIN - 1), "warm");
  assert.equal(bandOf(WARM_MIN), "warm");
  assert.equal(bandOf(WARM_MIN - 1), "cold");
});

test("M1c score parts: date 35/28/18/8/0, guests 20/15/10/5/0, budget 15/10/5/8/0, stage, source", () => {
  // order of reasons: date, guests, budget, stage, source
  assert.deepEqual(pts(lead()), [0, 0, 0, 0, 2]);
  assert.equal(pts(lead({ eventDate: "2026-11-20" }))[0], 35);
  assert.equal(pts(lead({ eventDate: "2026-12-10" }))[0], 28);
  assert.equal(pts(lead({ eventDate: "2027-02-01" }))[0], 18);
  assert.equal(pts(lead({ eventDate: "2027-06-01" }))[0], 8);
  assert.equal(pts(lead({ eventDate: "2026-11-01" }))[0], 0, "past date");
  assert.deepEqual([600, 200, 100, 20].map((g) => pts(lead({ guests: g }))[1]), [20, 15, 10, 5]);
  assert.equal(pts(lead({ guests: 100, budget: 30000 }))[2], 15);
  assert.equal(pts(lead({ guests: 100, budget: 15000 }))[2], 10);
  assert.equal(pts(lead({ guests: 100, budget: 9000 }))[2], 5);
  assert.equal(pts(lead({ budget: 50000 }))[2], 8, "budget without guests");
  assert.deepEqual(["new", "assigned", "contacted", "requirement", "tasting", "qualified", "quoted"].map((s) => pts(lead({ status: s }))[3]), [0, 0, 6, 10, 14, 16, 20]);
  assert.deepEqual(["referral", "walkin", "google", "justdial", "instagram", "facebook", "other", "unknown"].map((s) => pts(lead({ source: s }))[4]), [10, 8, 5, 5, 4, 4, 2, 2]);
});

test("M1c whole-lead examples: hot, warm, cold; closed leads have no score", () => {
  const hot = scoreLead(lead({ eventDate: "2026-11-24", guests: 300, budget: 90000, status: "contacted", source: "referral" }), TODAY)!;
  assert.equal(hot.score, 35 + 15 + 15 + 6 + 10);
  assert.equal(hot.band, "hot");
  assert.equal(hot.manual, false);
  const warm = scoreLead(lead({ eventDate: "2026-12-10", guests: 80, source: "instagram" }), TODAY)!;
  assert.equal(warm.score, 28 + 5 + 0 + 0 + 4);
  assert.equal(warm.band, "warm");
  const cold = scoreLead(lead({ source: "instagram" }), TODAY)!;
  assert.equal(cold.score, 4);
  assert.equal(cold.band, "cold");
  const max = scoreLead(lead({ eventDate: TODAY, guests: 1000, budget: 1000000, status: "quoted", source: "referral" }), TODAY)!;
  assert.equal(max.score, 100);
  for (const s of ["won", "lost", "duplicate", "invalid"]) assert.equal(scoreLead(lead({ status: s }), TODAY), null, s);
});

test("M1c manual band wins but the automatic points are still shown", () => {
  const s = scoreLead(lead({ source: "instagram", scoreManual: "hot" }), TODAY)!;
  assert.deepEqual([s.band, s.manual, s.score], ["hot", true, 4]);
  const auto = scoreLead(lead({ source: "instagram", scoreManual: "" }), TODAY)!;
  assert.deepEqual([auto.band, auto.manual], ["cold", false]);
  assert.equal(scoreLead(lead({ scoreManual: "boiling" }), TODAY)!.manual, false);
});
