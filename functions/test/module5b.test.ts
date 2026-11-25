// Module 5b — company / brand on transactions and the brand report. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { brandChangeProblem, brandReport, orgOfBranch, orgOfDoc } from "../src/masters/orgRules";

const branches = new Map<string, Record<string, unknown>>([
  ["br1", { companyId: "c1", brandIds: ["veg", "royal"] }],
  ["br2", { companyId: "c1", brandIds: ["royal"] }],
  ["old", {}],
]);

test("M5b a branch's default brand and company", () => {
  assert.deepEqual(orgOfBranch(branches.get("br1")), { companyId: "c1", brandId: "veg" });
  assert.deepEqual(orgOfBranch(branches.get("old")), { companyId: "", brandId: "" }, "masters not set up yet");
  assert.deepEqual(orgOfBranch(undefined), { companyId: "", brandId: "" });
});

test("M5b a document's own stamp wins; an old document is read through its branch", () => {
  assert.deepEqual(orgOfDoc({ branchId: "br1", brandId: "royal", companyId: "c1" }, branches), { companyId: "c1", brandId: "royal" });
  assert.deepEqual(orgOfDoc({ branchId: "br1" }, branches), { companyId: "c1", brandId: "veg" });
  assert.deepEqual(orgOfDoc({ branchId: "nowhere" }, branches), { companyId: "", brandId: "" });
});

test("M5b moving a booking to another brand", () => {
  const open = { status: "Confirmed", hasInvoice: false };
  assert.equal(brandChangeProblem(branches.get("br1"), "royal", { status: "active" }, open), "");
  assert.equal(brandChangeProblem(branches.get("br2"), "veg", { status: "active" }, open), "not-served", "the branch does not serve that brand");
  assert.equal(brandChangeProblem(branches.get("br1"), "royal", undefined, open), "no-brand");
  assert.equal(brandChangeProblem(branches.get("br1"), "royal", { status: "archived" }, open), "archived");
  assert.equal(brandChangeProblem(branches.get("br1"), "royal", { status: "active" }, { status: "Closed", hasInvoice: false }), "closed");
  assert.equal(brandChangeProblem(branches.get("br1"), "royal", { status: "active" }, { status: "Confirmed", hasInvoice: true }), "invoiced", "a finished document is not rewritten");
});

test("M5b revenue and direct cost by brand", () => {
  const brands = [{ id: "veg", name: "Suseela Caterings" }, { id: "royal", name: "Royal Feast" }, { id: "idle", name: "Idle" }];
  const bookings = [
    { id: "b1", data: { branchId: "br1", status: "Completed" } }, // default brand of br1 = veg
    { id: "b2", data: { branchId: "br1", brandId: "royal", status: "Confirmed" } },
    { id: "b3", data: { branchId: "br2", status: "Cancelled" } },
    { id: "b4", data: { branchId: "old", status: "Confirmed" } }, // no masters: unassigned
  ];
  const invoices = [
    { bookingId: "b1", branchId: "br1", totalAmount: 100000, amountPaid: 60000, balanceDue: 40000, status: "Sent" },
    { bookingId: "b2", branchId: "br1", brandId: "royal", totalAmount: 50000, amountPaid: 50000, balanceDue: 0, status: "Paid" },
    { bookingId: "b2", branchId: "br1", brandId: "royal", totalAmount: 999, status: "Void" },
    { bookingId: "bX", branchId: "br2", totalAmount: 8000, amountPaid: 0, balanceDue: 8000, status: "Draft" }, // booking of an earlier month
  ];
  const costs = [{ bookingId: "b1", amount: 62000 }, { bookingId: "b2", amount: 30000 }, { bookingId: "b4", amount: 500 }];
  const r = brandReport(brands, branches, bookings, invoices, costs, new Map([["bX", "royal"]]));
  const by = (id: string) => r.lines.find((l) => l.brandId === id)!;
  assert.deepEqual([by("veg").events, by("veg").invoiced, by("veg").received, by("veg").due, by("veg").directCost, by("veg").margin, by("veg").marginPct], [1, 100000, 60000, 40000, 62000, 38000, 38]);
  assert.deepEqual([by("royal").events, by("royal").invoiced, by("royal").directCost, by("royal").margin], [1, 58000, 30000, 28000], "void invoice left out; the cancelled booking is not an event");
  assert.equal(by("idle").invoiced, 0, "a brand with nothing still shows");
  assert.deepEqual([by("").events, by("").directCost], [1, 500], "what has no brand is shown, not dropped");
  assert.equal(r.lines[r.lines.length - 1].brandId, "", "the unassigned line comes last");
  assert.equal(r.totals.invoiced, 158000);
  assert.equal(r.totals.directCost, 92500);
  assert.equal(r.totals.events, 3);
});
