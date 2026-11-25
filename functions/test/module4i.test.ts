// Module 4e — salary payments. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paidAfter, salaryBalance, salaryPaidStatus, salaryPayProblem } from "../src/staff/salaryPayRules";
import { salaryPaymentEntry, trialBalance } from "../src/ledger/ledgerRules";
import { payrollEntries, salaryPaymentEntries } from "../src/ledger/ledgerSources";

test("M4i what is still due on a payslip", () => {
  assert.equal(salaryBalance(12000, 0), 12000);
  assert.equal(salaryBalance(12000, 5000), 7000);
  assert.equal(salaryBalance(12000, 12000), 0);
  assert.equal(salaryBalance(-300, 0), 0, "a negative net is owed by the staff member, nothing to pay");
  assert.equal(salaryPaidStatus(12000, 0), "unpaid");
  assert.equal(salaryPaidStatus(12000, 5000), "partial");
  assert.equal(salaryPaidStatus(12000, 12000), "paid");
  assert.equal(salaryPaidStatus(0, 0), "paid", "nothing was due");
});

test("M4i a payment needs a finalized payslip and cannot exceed what is due", () => {
  const slip = { exists: true, finalized: true, net: 12000, paid: 5000 };
  assert.equal(salaryPayProblem(slip, 7000), "");
  assert.equal(salaryPayProblem(slip, 3000), "", "part payment");
  assert.equal(salaryPayProblem(slip, 7000.01), "too-much");
  assert.equal(salaryPayProblem({ ...slip, paid: 12000 }, 1), "nothing-due");
  assert.equal(salaryPayProblem({ ...slip, finalized: false }, 100), "not-finalized");
  assert.equal(salaryPayProblem({ exists: false, finalized: false, net: 0, paid: 0 }, 100), "not-finalized");
  assert.equal(salaryPayProblem(slip, 0), "bad-amount");
  assert.equal(salaryPayProblem(slip, -5), "bad-amount");
});

test("M4i the running total goes up with a payment and down with a cancellation", () => {
  assert.equal(paidAfter(5000, 2000), 7000);
  assert.equal(paidAfter(7000, -2000), 5000);
  assert.equal(paidAfter(1000, -5000), 0, "never below zero");
});

test("M4i books: paying a salary clears Salaries payable", () => {
  const slip = payrollEntries({ id: "2026-10_s1", data: { month: "2026-10", finalized: true, net: 11000, advances: 1000 } });
  const pay1 = salaryPaymentEntries({ id: "p1", data: { date: "2026-11-02", amount: 6000, method: "Cash", cancelled: false } });
  const pay2 = salaryPaymentEntries({ id: "p2", data: { date: "2026-11-05", amount: 5000, method: "UPI", cancelled: false } });
  const gone = salaryPaymentEntries({ id: "p3", data: { date: "2026-11-05", amount: 999, method: "Cash", cancelled: true } });
  assert.equal(gone.length, 0, "a cancelled payment is not in the books");
  const tb = trialBalance([...slip, ...pay1, ...pay2]);
  const bal = (code: string) => tb.rows.find((r) => r.account === code)?.balance ?? 0;
  assert.equal(bal("2300"), 0, "payable is cleared");
  assert.equal(bal("5100"), 12000, "the cost of the month stays");
  assert.equal(tb.totalDebit, tb.totalCredit);
  const e = salaryPaymentEntry("p1", { day: "2026-11-02", amount: 6000, method: "Cash" });
  assert.deepEqual(e?.lines.map((l) => [l.account, l.debit, l.credit]), [["2300", 6000, 0], ["1000", 0, 6000]]);
});
