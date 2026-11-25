// Module 4g — month-close checklist. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCloseChecklist, countEventsWithoutInvoice, payrollGaps, CloseInput } from "../src/ledger/closeRules";

const clean: CloseInput = { month: "2026-10", booksBalanced: true, booksSkipped: 0, eventsWithoutInvoice: 0, draftInvoices: 0, heldBills: 0, heldBillsAmount: 0, openOrders: 0, pendingStockAdjusts: 0, staffWithoutPayslip: 0, unpaidSalaries: 0, unpaidSalariesAmount: 0, lockedThrough: "2026-09", previousMonth: "2026-09" };

test("M4k a clean month is ready to lock", () => {
  const r = buildCloseChecklist(clean);
  assert.equal(r.ready, true);
  assert.equal(r.todo, 0);
  assert.equal(r.alreadyLocked, false);
  assert.ok(r.items.every((i) => i.state === "ok"));
  assert.equal(r.items.length, 9);
});

test("M4k loose ends are listed with where to fix them", () => {
  const r = buildCloseChecklist({ ...clean, eventsWithoutInvoice: 2, heldBills: 1, heldBillsAmount: 18400, staffWithoutPayslip: 3 });
  assert.equal(r.ready, false);
  assert.equal(r.todo, 3);
  const by = (k: string) => r.items.find((i) => i.key === k)!;
  assert.equal(by("events").link, "/bookings");
  assert.equal(by("heldBills").amount, 18400);
  assert.match(by("payroll").en, /3/);
  assert.equal(by("drafts").state, "ok");
});

test("M4k unbalanced books stop the lock; unpaid salaries and an unlocked earlier month do not", () => {
  assert.equal(buildCloseChecklist({ ...clean, booksBalanced: false }).ready, false);
  assert.equal(buildCloseChecklist({ ...clean, booksSkipped: 1 }).items[0].state, "block");
  const r = buildCloseChecklist({ ...clean, unpaidSalaries: 4, unpaidSalariesAmount: 52000, lockedThrough: "" });
  assert.equal(r.ready, true, "salaries are often paid in the next month");
  assert.equal(r.items.find((i) => i.key === "salaries")!.state, "info");
  assert.equal(r.items.find((i) => i.key === "previous")!.state, "info");
});

test("M4k a month that is already locked says so", () => {
  assert.equal(buildCloseChecklist({ ...clean, lockedThrough: "2026-10" }).alreadyLocked, true);
  assert.equal(buildCloseChecklist({ ...clean, lockedThrough: "2026-11" }).alreadyLocked, true);
});

test("M4k events with no invoice", () => {
  const bookings = [
    { id: "b1", day: "2026-10-04", status: "Completed" },
    { id: "b2", day: "2026-10-18", status: "Closed" },
    { id: "b3", day: "2026-10-20", status: "Cancelled" },
    { id: "b4", day: "2026-11-02", status: "Confirmed" },
    { id: "b5", day: "2026-10-25", status: "Completed" },
  ];
  const invoices = [{ bookingId: "b1", status: "Sent" }, { bookingId: "b2", status: "Void" }, { bookingId: "b5", status: "Paid", isDeleted: true }];
  assert.equal(countEventsWithoutInvoice(bookings, invoices, "2026-10"), 2, "b2 (void invoice) and b5 (deleted invoice); b3 cancelled, b4 next month");
});

test("M4k payroll gaps", () => {
  const slips = [
    { month: "2026-10", staffId: "s1", finalized: true, net: 12000, paidTotal: 12000 },
    { month: "2026-10", staffId: "s2", finalized: true, net: 9000, paidTotal: 4000 },
    { month: "2026-10", staffId: "s3", finalized: false, net: 5000 },
    { month: "2026-09", staffId: "s4", finalized: true, net: 7000 },
    { month: "2026-10", staffId: "s5", finalized: true, net: -200 },
  ];
  assert.deepEqual(payrollGaps(["s1", "s2", "s3", "s3", "s4"], slips, "2026-10"), { withoutPayslip: 2, unpaid: 1, unpaidAmount: 5000 });
});
