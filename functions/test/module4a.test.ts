// Module 4a — double-entry ledger rules. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTS, accountOf, balanceSheet, customerPaymentEntry, entryProblem, expenseAccount, expenseEntry, invoiceEntry, isLockedDay, lockProblem, moneyAccount,
  packedSaleEntry, parseManualEntry, payrollEntry, profitAndLoss, purchaseEntry, staffAdvanceEntry, trialBalance, unlockTarget, vendorPaymentEntry, JournalEntry,
} from "../src/ledger/ledgerRules";

const day = "2026-11-10";
const all = (xs: (JournalEntry | null)[]) => xs.filter((x): x is JournalEntry => x !== null);

test("M4a chart of accounts: unique codes, every type present", () => {
  assert.equal(new Set(ACCOUNTS.map((a) => a.code)).size, ACCOUNTS.length);
  for (const t of ["asset", "liability", "equity", "income", "expense"]) assert.ok(ACCOUNTS.some((a) => a.type === t), t);
  assert.equal(accountOf("1000")?.en, "Cash");
  assert.equal(accountOf("9999"), undefined);
});

test("M4a every document entry is balanced", () => {
  const entries = all([
    invoiceEntry("i1", { day, total: 105000, gst: 5000, number: "INV-1" }),
    customerPaymentEntry("p1", { day, amount: 50000, method: "UPI" }),
    customerPaymentEntry("p2", { day, amount: 2000, method: "Cash", refund: true }),
    purchaseEntry("pu1", { day, total: 11800, gstInput: 1800 }),
    expenseEntry("e1", { day, amount: 3500, section: "Transport" }),
    vendorPaymentEntry("v1", { day, amount: 10000, method: "BankTransfer" }),
    packedSaleEntry("s1", { day, amount: 450, tax: 21.43, method: "Cash" }),
    staffAdvanceEntry("a1", { day, amount: 5000 }),
    payrollEntry("pay1", { day, gross: 18000, advanceCut: 2000 }),
  ]);
  assert.equal(entries.length, 9);
  for (const e of entries) assert.equal(entryProblem(e), "", e.memo);
});

test("M4a what each document does to the accounts", () => {
  const inv = invoiceEntry("i1", { day, total: 105000, gst: 5000 })!;
  assert.deepEqual(inv.lines, [{ account: "1100", debit: 105000, credit: 0 }, { account: "4000", debit: 0, credit: 100000 }, { account: "2100", debit: 0, credit: 5000 }]);
  assert.equal(invoiceEntry("i2", { day, total: 50000, gst: 0 })!.lines.length, 2, "no GST line when there is no GST");
  assert.equal(invoiceEntry("i3", { day, total: 0, gst: 0 }), null, "nothing to book");
  assert.deepEqual(customerPaymentEntry("p", { day, amount: 100, method: "Cash" })!.lines.map((l) => l.account), ["1000", "1100"]);
  assert.deepEqual(customerPaymentEntry("p", { day, amount: 100, method: "UPI", refund: true })!.lines, [{ account: "1100", debit: 100, credit: 0 }, { account: "1010", debit: 0, credit: 100 }]);
  assert.deepEqual(purchaseEntry("pu", { day, total: 1000 })!.lines, [{ account: "5000", debit: 1000, credit: 0 }, { account: "2000", debit: 0, credit: 1000 }]);
  assert.equal(expenseEntry("e", { day, amount: 100, section: "Staff Advance" })!.lines[0].account, "1300", "an advance is money lent, not a cost");
  assert.equal(expenseEntry("e", { day, amount: 100, section: "Something new" })!.lines[0].account, "5900");
  assert.equal(packedSaleEntry("s", { day, amount: 450, tax: 0, method: "Credit" })!.lines[0].account, "1100", "a credit sale is owed by the customer");
  assert.deepEqual(payrollEntry("pay", { day, gross: 18000, advanceCut: 2000 })!.lines, [{ account: "5100", debit: 18000, credit: 0 }, { account: "1300", debit: 0, credit: 2000 }, { account: "2300", debit: 0, credit: 16000 }]);
  assert.deepEqual(payrollEntry("pay", { day, gross: 1000, advanceCut: 5000 })!.lines.map((l) => l.credit), [0, 1000], "the cut is never more than the pay");
  assert.equal(moneyAccount("cash"), "1000");
  assert.equal(moneyAccount("Card"), "1010");
  assert.equal(expenseAccount("Utility Bill"), "5400");
});

test("M4a entry checks", () => {
  const ok = { day, lines: [{ account: "1000", debit: 100, credit: 0 }, { account: "4200", debit: 0, credit: 100 }] };
  assert.equal(entryProblem(ok), "");
  assert.equal(entryProblem({ ...ok, day: "10-11-2026" }), "bad-day");
  assert.equal(entryProblem({ day, lines: [ok.lines[0]] }), "too-few-lines");
  assert.equal(entryProblem({ day, lines: [{ account: "0001", debit: 100, credit: 0 }, ok.lines[1]] }), "unknown-account");
  assert.equal(entryProblem({ day, lines: [{ account: "1000", debit: 100, credit: 100 }, ok.lines[1]] }), "one-side-only");
  assert.equal(entryProblem({ day, lines: [{ account: "1000", debit: 0, credit: 0 }, ok.lines[1]] }), "one-side-only");
  assert.equal(entryProblem({ day, lines: [{ account: "1000", debit: 100.01, credit: 0 }, ok.lines[1]] }), "not-balanced");
  assert.equal(entryProblem({ day, lines: [{ account: "1000", debit: -1, credit: 0 }, ok.lines[1]] }), "bad-amount");
});

test("M4a trial balance, profit and balance sheet tie out", () => {
  const entries = all([
    { day, memo: "Capital", source: { collection: "journalEntries", id: "m1", kind: "manual" }, lines: [{ account: "1010", debit: 200000, credit: 0 }, { account: "3000", debit: 0, credit: 200000 }] },
    invoiceEntry("i1", { day, total: 105000, gst: 5000 }),
    customerPaymentEntry("p1", { day, amount: 60000, method: "UPI" }),
    purchaseEntry("pu1", { day, total: 40000 }),
    vendorPaymentEntry("v1", { day, amount: 25000, method: "BankTransfer" }),
    expenseEntry("e1", { day, amount: 3000, section: "Transport" }),
    payrollEntry("pay1", { day, gross: 18000, advanceCut: 0 }),
    { day, memo: "broken", source: { collection: "journalEntries", id: "x", kind: "manual" }, lines: [{ account: "1000", debit: 5, credit: 0 }, { account: "4200", debit: 0, credit: 4 }] },
  ]);
  const tb = trialBalance(entries);
  assert.equal(tb.skipped, 1, "an unbalanced entry is left out");
  assert.equal(tb.balanced, true);
  assert.equal(tb.totalDebit, tb.totalCredit);
  const get = (code: string) => tb.rows.find((r) => r.account === code)!.balance;
  assert.equal(get("1010"), 235000, "bank: 200000 + 60000 − 25000");
  assert.equal(get("1100"), 45000, "customers still owe 105000 − 60000");
  assert.equal(get("2000"), 18000, "vendors are owed 40000 + 3000 − 25000");
  assert.equal(get("2100"), 5000);
  assert.equal(get("2300"), 18000);
  const pl = profitAndLoss(tb);
  assert.deepEqual({ income: pl.income, expenses: pl.expenses, profit: pl.profit }, { income: 100000, expenses: 61000, profit: 39000 });
  const bs = balanceSheet(tb);
  assert.deepEqual(bs, { assets: 280000, liabilities: 41000, equity: 200000, profit: 39000, balanced: true });
  assert.deepEqual(trialBalance([]), { rows: [], totalDebit: 0, totalCredit: 0, balanced: true, skipped: 0 });
});

test("M4a a hand-written entry must balance and name real accounts", () => {
  const good = { day, memo: "Owner put money in", lines: [{ account: "1010", debit: 50000 }, { account: "3000", credit: 50000 }] };
  const r = parseManualEntry(good, "2026-11-19");
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value.lines, [{ account: "1010", debit: 50000, credit: 0 }, { account: "3000", debit: 0, credit: 50000 }]);
  assert.equal(parseManualEntry({ ...good, day: "2026-11-20" }, "2026-11-19").ok, false, "future date");
  assert.equal(parseManualEntry({ ...good, memo: " " }, "2026-11-19").ok, false, "no memo");
  assert.equal(parseManualEntry({ ...good, lines: [good.lines[0]] }, "2026-11-19").ok, false, "one line");
  assert.equal(parseManualEntry({ ...good, lines: [{ account: "1010", debit: 50000 }, { account: "3000", credit: 49999 }] }, "2026-11-19").ok, false, "not balanced");
  assert.equal(parseManualEntry({ ...good, lines: [{ account: "1010", debit: 50000, credit: 1 }, { account: "3000", credit: 50000 }] }, "2026-11-19").ok, false, "both sides on one line");
  assert.equal(parseManualEntry({ ...good, lines: [{ account: "1", debit: 50000 }, { account: "3000", credit: 50000 }] }, "2026-11-19").ok, false, "unknown account");
  assert.equal(parseManualEntry({ ...good, lines: "x" }, "2026-11-19").ok, false, "lines must be a list");
});

test("M4a period lock: only ended months, only forward; a locked day cannot change", () => {
  assert.equal(isLockedDay("2026-10-31", "2026-10"), true);
  assert.equal(isLockedDay("2026-09-01", "2026-10"), true);
  assert.equal(isLockedDay("2026-11-01", "2026-10"), false);
  assert.equal(isLockedDay("2026-10-31", ""), false, "nothing locked yet");
  assert.equal(lockProblem("2026-10", "", "2026-11-19"), "");
  assert.equal(lockProblem("2026-11", "", "2026-11-19"), "not-ended", "the running month cannot be locked");
  assert.equal(lockProblem("2026-12", "", "2026-11-19"), "not-ended");
  assert.equal(lockProblem("2026-09", "2026-10", "2026-11-19"), "already-locked");
  assert.equal(lockProblem("2026-10", "2026-10", "2026-11-19"), "already-locked");
  assert.equal(lockProblem("2026-13", "", "2026-11-19"), "bad-month");
  assert.equal(unlockTarget("2026-10"), "2026-09");
  assert.equal(unlockTarget("2026-01"), "2025-12");
  assert.equal(unlockTarget(""), "");
});
