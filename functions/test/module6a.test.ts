// Module 6a — goods into a chosen store, and stock moved between branches. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollBookingDay } from "../src/ledger/ledgerSources";
import { parseBrand, parseLocations } from "../src/masters/masterRules";
import { refundDecideProblem, refundRequestProblem } from "../src/billing/refundRequestRules";
import { kitchenSplit } from "../src/safety/allergenRules";
import { branchTransferProblem, matchItem } from "../src/stock/branchTransferRules";

const src = { name: "Rice ", unit: "kg" };
const item = (id: string, name: string, unit: string, status = "active") => ({ id, data: { name, unit, status } });

test("M6a the same item in the other branch is found by name and unit", () => {
  assert.deepEqual(matchItem(src, [item("a", "rice", "KG"), item("b", "Dal", "kg")]), { id: "a" }, "case and spaces do not matter");
  assert.equal(matchItem(src, [item("b", "Dal", "kg")]), "none");
  assert.equal(matchItem(src, [item("a", "Rice", "bag")]), "none", "a different unit is a different item");
  assert.equal(matchItem(src, [item("a", "Rice", "kg"), item("c", "rice", "kg")]), "many");
  assert.equal(matchItem(src, [item("a", "Rice", "kg", "archived")]), "none", "an archived item is not a target");
});

test("M6a branch transfer problems", () => {
  const ok = { quantity: 5, fromBranchId: "b1", toBranchId: "b2", source: src, match: { id: "a" } as const, balance: 10 };
  assert.equal(branchTransferProblem(ok), "");
  assert.equal(branchTransferProblem({ ...ok, quantity: 0 }), "bad-quantity");
  assert.equal(branchTransferProblem({ ...ok, quantity: NaN }), "bad-quantity");
  assert.equal(branchTransferProblem({ ...ok, toBranchId: "b1" }), "same-branch");
  assert.equal(branchTransferProblem({ ...ok, source: { ...src, trackExpiry: true } }), "tracks-expiry");
  assert.equal(branchTransferProblem({ ...ok, match: "none" }), "no-match");
  assert.equal(branchTransferProblem({ ...ok, match: "many" }), "many-match");
  assert.equal(branchTransferProblem({ ...ok, balance: 4.99 }), "not-enough");
  assert.equal(branchTransferProblem({ ...ok, balance: 5 }), "", "exactly what is there can move");
});

test("M6a veg and non-veg dishes go to different kitchens", () => {
  const rows = [{ name: "Dal", foodType: "veg" as const }, { name: "Chicken", foodType: "nonveg" as const }, { name: "Curd", foodType: "unknown" as const }];
  const veg = { id: "k1", name: "Veg kitchen", vegOnly: true, nonVegAllowed: false };
  const non = { id: "k2", name: "Non-veg kitchen", vegOnly: false, nonVegAllowed: true };
  const a = kitchenSplit(rows, [veg, non]);
  assert.deepEqual(a.veg, { dishes: ["Dal"], kitchens: ["Veg kitchen"] });
  assert.deepEqual(a.nonveg, { dishes: ["Chicken"], kitchens: ["Non-veg kitchen"] });
  assert.deepEqual(a.unknown, ["Curd"], "unknown dishes are not placed");
  assert.equal(a.warnings.length, 0);
  const b = kitchenSplit(rows, [non]);
  assert.equal(b.warnings.length, 1, "no veg-only kitchen: veg and non-veg would mix");
  assert.deepEqual(b.veg.kitchens, ["Non-veg kitchen"]);
  const c = kitchenSplit(rows, [veg]);
  assert.equal(c.warnings.length, 1, "no kitchen may cook non-veg");
  assert.deepEqual(c.nonveg.kitchens, []);
  assert.equal(kitchenSplit(rows, []).warnings.length, 1, "no kitchens set up");
  assert.equal(kitchenSplit([{ name: "Dal", foodType: "veg" }], [non]).warnings.length, 0, "only veg dishes: nothing to separate");
});

test("M6a a refund request is checked before the owner sees it", () => {
  assert.equal(refundRequestProblem({ amount: 500, paid: 1000, pendingForInvoice: 0 }), "");
  assert.equal(refundRequestProblem({ amount: 1000, paid: 1000, pendingForInvoice: 0 }), "", "the whole amount paid may be refunded");
  assert.equal(refundRequestProblem({ amount: 0, paid: 1000, pendingForInvoice: 0 }), "bad-amount");
  assert.equal(refundRequestProblem({ amount: NaN, paid: 1000, pendingForInvoice: 0 }), "bad-amount");
  assert.equal(refundRequestProblem({ amount: 1000.01, paid: 1000, pendingForInvoice: 0 }), "more-than-paid");
  assert.equal(refundRequestProblem({ amount: 100, paid: 1000, pendingForInvoice: 1 }), "already-asked");
});

test("M6a deciding a refund request", () => {
  assert.equal(refundDecideProblem({ status: "pending", approve: true, note: "" }), "");
  assert.equal(refundDecideProblem({ status: "pending", approve: false, note: "  " }), "reason-needed", "a rejection needs a reason");
  assert.equal(refundDecideProblem({ status: "pending", approve: false, note: "not agreed" }), "");
  assert.equal(refundDecideProblem({ status: "approved", approve: true, note: "" }), "not-pending");
});

test("M6a a brand keeps its logo only when it is a secure web address", () => {
  const ok = (logoUrl: unknown) => { const r = parseBrand({ name: "Nivas", companyId: "c1", logoUrl }); return r.ok ? (r.value as { logoUrl: string }).logoUrl : "ERR"; };
  assert.equal(ok("https://firebasestorage.googleapis.com/v0/b/x/o/settings%2Flogo-1.png?alt=media&token=abc"), "https://firebasestorage.googleapis.com/v0/b/x/o/settings%2Flogo-1.png?alt=media&token=abc");
  assert.equal(ok("http://example.com/a.png"), "", "plain http is dropped");
  assert.equal(ok("javascript:alert(1)"), "");
  assert.equal(ok(undefined), "");
});

test("M6a shelf locations of a store", () => {
  const r = parseLocations("Dry / R1 / S2 / B3\n  Cold>Rack 4 \nDry / R1 / S2 / B3\n\n");
  assert.deepEqual(r.ok && r.value, ["Dry / R1 / S2 / B3", "Cold / Rack 4"], "cleaned, no repeats, blank lines skipped");
  assert.deepEqual(parseLocations(["Zone A"]).ok && (parseLocations(["Zone A"]) as { value: string[] }).value, ["Zone A"]);
  assert.equal(parseLocations("a/b/c/d/e").ok, false, "at most four parts");
  assert.equal(parseLocations("a//b").ok, false, "an empty part");
  assert.equal(parseLocations("x".repeat(31)).ok, false, "a part over 30 characters");
  assert.deepEqual(parseLocations(undefined).ok && (parseLocations(undefined) as { value: string[] }).value, []);
});

test("M6a payroll is booked at month end, or on the finalize day when that is earlier", () => {
  assert.equal(payrollBookingDay("2026-11", "2026-12-03"), "2026-11-30", "the usual case: finalized after the month");
  assert.equal(payrollBookingDay("2026-11", "2026-11-25"), "2026-11-25", "finalized mid-month: no negative payable before month end");
  assert.equal(payrollBookingDay("2026-11", "2026-11-30"), "2026-11-30");
  assert.equal(payrollBookingDay("2026-11", ""), "2026-11-30", "an old row without a finalize day");
  assert.equal(payrollBookingDay("2026-11", "2026-10-31"), "2026-11-30", "a day before the month is ignored");
  assert.equal(payrollBookingDay("2026-02", "2026-02-10"), "2026-02-10");
});
