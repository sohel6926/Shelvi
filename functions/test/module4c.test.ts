// Module 4c — period lock for money documents. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyDayOf } from "../src/ledger/lockGuard";
import { isLockedDay } from "../src/ledger/ledgerRules";

const ts = (day: string) => new Date(`${day}T06:30:00Z`);

test("M4c the day a money document belongs to (same as the books)", () => {
  assert.equal(moneyDayOf("invoices", { issueDate: ts("2026-10-20"), createdAt: ts("2026-10-19") }), "2026-10-20");
  assert.equal(moneyDayOf("payments", { day: "2026-10-21", date: ts("2026-10-22") }), "2026-10-21");
  assert.equal(moneyDayOf("purchases", { purchaseDate: ts("2026-10-15") }), "2026-10-15");
  assert.equal(moneyDayOf("purchases", { createdAt: ts("2026-10-16") }), "2026-10-16", "no bill date: the day it was entered");
  assert.equal(moneyDayOf("expenses", { serviceDate: ts("2026-10-17") }), "2026-10-17");
  assert.equal(moneyDayOf("outsideOrders", { date: "2026-10-18" }), "2026-10-18");
  assert.equal(moneyDayOf("staffAdvances", { date: "2026-10-19" }), "2026-10-19");
  assert.equal(moneyDayOf("vendorPayments", { date: "2026-10-20" }), "2026-10-20");
  assert.equal(moneyDayOf("packedSales", { saleDay: "2026-10-21" }), "2026-10-21");
  assert.equal(moneyDayOf("leads", { createdAt: ts("2026-10-21") }), null, "not a money document: never locked");
  assert.equal(moneyDayOf("packedSales", {}), null);
});

test("M4c a document of a locked month is frozen, the next month is open", () => {
  const day = moneyDayOf("purchases", { purchaseDate: ts("2026-10-31") })!;
  assert.equal(isLockedDay(day, "2026-10"), true);
  assert.equal(isLockedDay(moneyDayOf("purchases", { purchaseDate: ts("2026-11-01") })!, "2026-10"), false);
});
