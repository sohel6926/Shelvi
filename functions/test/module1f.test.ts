// Module 1f — leads report (totals, by source, by person, response speed). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeadReport, ReportLead } from "../src/leads/reportRules";

const MIN = 60000;
const T0 = Date.UTC(2026, 10, 1, 4);
const row = (extra: Partial<ReportLead> = {}): ReportLead => ({ status: "new", source: "instagram", assignedTo: "", assignedName: "", createdAtMs: T0, firstResponseAtMs: null, imported: false, cancelled: false, ...extra });

test("M1f empty report", () => {
  const r = buildLeadReport([], 15);
  assert.deepEqual(r.totals, { total: 0, open: 0, won: 0, lost: 0, dropped: 0, conversionPct: null });
  assert.deepEqual(r.bySource, []);
  assert.deepEqual(r.byPerson, []);
  assert.deepEqual(r.response, { measured: 0, answered: 0, inTime: 0, unanswered: 0, avgMinutes: null, inTimePct: null });
});

test("M1f totals and conversion: duplicates / invalid do not count against conversion; cancelled left out", () => {
  const rows = [
    row({ status: "won" }),
    row({ status: "won" }),
    row({ status: "lost" }),
    row({ status: "contacted" }),
    row({ status: "quoted" }),
    row({ status: "duplicate" }),
    row({ status: "invalid" }),
    row({ status: "won", cancelled: true }),
  ];
  const t = buildLeadReport(rows, 15).totals;
  assert.deepEqual(t, { total: 7, open: 2, won: 2, lost: 1, dropped: 2, conversionPct: 40 });
  assert.equal(t.open + t.won + t.lost + t.dropped, t.total);
});

test("M1f by source: counted, sorted by size, parts add up to the total", () => {
  const rows = [row({ source: "referral", status: "won" }), row({ source: "referral", status: "lost" }), row({ source: "referral" }), row({ source: "google", status: "won" }), row({ source: "justdial", status: "invalid" })];
  const r = buildLeadReport(rows, 15);
  assert.deepEqual(r.bySource.map((s) => [s.source, s.total, s.won, s.conversionPct]), [["referral", 3, 1, 33.3], ["google", 1, 1, 100], ["justdial", 1, 0, null]]);
  assert.equal(r.bySource.reduce((s, x) => s + x.total, 0), r.totals.total);
  assert.equal(r.bySource.reduce((s, x) => s + x.won, 0), r.totals.won);
});

test("M1f by person: unassigned is its own row; names kept; parts add up", () => {
  const rows = [
    row({ assignedTo: "u1", assignedName: "Ravi", status: "won" }),
    row({ assignedTo: "u1", assignedName: "Ravi", status: "contacted" }),
    row({ assignedTo: "u2", assignedName: "Sita", status: "lost" }),
    row({}),
  ];
  const r = buildLeadReport(rows, 15);
  assert.deepEqual(r.byPerson.map((p) => [p.uid, p.name, p.total, p.won, p.conversionPct]), [["u1", "Ravi", 2, 1, 50], ["", "", 1, 0, 0], ["u2", "Sita", 1, 0, 0]]);
  assert.equal(r.byPerson.reduce((s, x) => s + x.total, 0), r.totals.total);
});

test("M1f response speed: average, in-time %, unanswered; imported and undated leads not measured", () => {
  const rows = [
    row({ status: "contacted", firstResponseAtMs: T0 + 5 * MIN }),
    row({ status: "won", firstResponseAtMs: T0 + 15 * MIN }),
    row({ status: "lost", firstResponseAtMs: T0 + 40 * MIN }),
    row({ status: "new" }),
    row({ status: "assigned" }),
    row({ status: "new", imported: true }),
    row({ status: "contacted", createdAtMs: null, firstResponseAtMs: T0 }),
  ];
  const r = buildLeadReport(rows, 15).response;
  assert.deepEqual(r, { measured: 5, answered: 3, inTime: 2, unanswered: 2, avgMinutes: 20, inTimePct: 66.7 });
});

test("M1f response speed per person and a different limit", () => {
  const rows = [
    row({ assignedTo: "u1", assignedName: "Ravi", status: "contacted", firstResponseAtMs: T0 + 10 * MIN }),
    row({ assignedTo: "u1", assignedName: "Ravi", status: "contacted", firstResponseAtMs: T0 + 50 * MIN }),
    row({ assignedTo: "u2", assignedName: "Sita", status: "assigned" }),
  ];
  const r60 = buildLeadReport(rows, 60);
  const ravi = r60.byPerson.find((p) => p.uid === "u1")!;
  assert.deepEqual(ravi.response, { measured: 2, answered: 2, inTime: 2, unanswered: 0, avgMinutes: 30, inTimePct: 100 });
  assert.deepEqual(r60.byPerson.find((p) => p.uid === "u2")!.response, { measured: 1, answered: 0, inTime: 0, unanswered: 1, avgMinutes: null, inTimePct: null });
  assert.equal(buildLeadReport(rows, 15).byPerson.find((p) => p.uid === "u1")!.response.inTimePct, 50);
});

test("M1f a response stamped before creation (clock slip) is ignored, not counted as negative minutes", () => {
  const r = buildLeadReport([row({ status: "contacted", firstResponseAtMs: T0 - MIN })], 15).response;
  assert.deepEqual([r.measured, r.answered, r.avgMinutes], [1, 0, null]);
});
