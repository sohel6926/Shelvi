// Module 4f — bank statement reconciliation. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookMoves, parseStatement, parseStatementAmount, parseStatementDay, readHeader, reconcile, shiftDay } from "../src/ledger/reconRules";
import { customerPaymentEntry, vendorPaymentEntry } from "../src/ledger/ledgerRules";

test("M4j statement dates as Indian banks write them", () => {
  assert.equal(parseStatementDay("05/11/2026"), "2026-11-05", "day first");
  assert.equal(parseStatementDay("5-11-26"), "2026-11-05");
  assert.equal(parseStatementDay("05-Nov-2026"), "2026-11-05");
  assert.equal(parseStatementDay("05 Nov 2026"), "2026-11-05");
  assert.equal(parseStatementDay("05 November 2026"), "2026-11-05");
  assert.equal(parseStatementDay("2026-11-05"), "2026-11-05");
  assert.equal(parseStatementDay("05/11/2026 14:32:10"), "2026-11-05");
  assert.equal(parseStatementDay(46331), "2026-11-05", "an Excel day number");
  assert.equal(parseStatementDay("31/02/2026"), null);
  assert.equal(parseStatementDay("Opening balance"), null);
  assert.equal(parseStatementDay(12), null);
});

test("M4j statement amounts", () => {
  assert.equal(parseStatementAmount("12,345.50"), 12345.5);
  assert.equal(parseStatementAmount("₹ 500"), 500);
  assert.equal(parseStatementAmount("1,200.00 Cr"), 1200);
  assert.equal(parseStatementAmount(750), 750);
  assert.equal(parseStatementAmount(""), 0);
  assert.equal(parseStatementAmount("-"), 0);
  assert.equal(parseStatementAmount(null), 0);
  assert.equal(parseStatementAmount("abc"), null);
});

test("M4j finds the heading row under the bank's account details", () => {
  const grid = [
    ["HDFC BANK Ltd"],
    ["Account No", "5020001234"],
    [],
    ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
    ["01/11/26", "UPI-RAVI KUMAR-ADVANCE", "0000431", "01/11/26", "", "25,000.00", "1,25,000.00"],
    ["03/11/26", "NEFT-SRI LAKSHMI TRADERS", "N3052", "03/11/26", "18,400.00", "", "1,06,600.00"],
    ["", "Page total", "", "", "18,400.00", "25,000.00", ""],
  ];
  const p = parseStatement(grid);
  assert.equal(p.problem, "");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { line: 5, day: "2026-11-01", text: "UPI-RAVI KUMAR-ADVANCE", ref: "0000431", moneyIn: 25000, moneyOut: 0 });
  assert.equal(p.rows[1].moneyOut, 18400);
  assert.equal(p.skipped, 1, "the total line has no date");
});

test("M4j a single amount column with Dr / Cr", () => {
  const p = parseStatement([
    ["Txn Date", "Description", "Amount (INR)", "Dr/Cr", "Balance"],
    ["05 Nov 2026", "IMPS in", 5000, "CR", 9000],
    ["06 Nov 2026", "ATM", "2,000.00", "DR", 7000],
    ["07 Nov 2026", "odd", 100, "", 7100],
  ]);
  assert.deepEqual(p.rows.map((r) => [r.day, r.moneyIn, r.moneyOut]), [["2026-11-05", 5000, 0], ["2026-11-06", 0, 2000]]);
  assert.equal(p.skipped, 1, "no direction, not guessed");
});

test("M4j a sheet that is not a statement", () => {
  assert.equal(parseStatement([["Name", "Phone"], ["Ravi", "98"]]).problem, "no-header");
  assert.equal(parseStatement([["Date", "Narration", "Debit", "Credit"]]).problem, "no-rows");
  assert.equal(readHeader(["Date", "Closing Balance"]), null, "a balance column is not money moved");
});

test("M4j pairing with the books", () => {
  const entries = [
    customerPaymentEntry("p1", { day: "2026-11-01", amount: 25000, method: "UPI" })!,
    vendorPaymentEntry("v1", { day: "2026-11-02", amount: 18400, method: "BankTransfer" })!,
    vendorPaymentEntry("v2", { day: "2026-11-10", amount: 3000, method: "UPI" })!, // entered in the CRM, bank does not show it
    customerPaymentEntry("p2", { day: "2026-11-04", amount: 9000, method: "Cash" })!, // cash: not on the bank account
    vendorPaymentEntry("v3", { day: "2026-12-20", amount: 700, method: "UPI" })!, // after the statement
  ];
  const books = bookMoves(entries, "1010", "2026-10-29", "2026-12-31");
  assert.equal(books.length, 4, "cash is on another account");
  const statement = parseStatement([
    ["Date", "Narration", "Debit", "Credit"],
    ["01/11/2026", "UPI RAVI", "", 25000],
    ["03/11/2026", "NEFT TRADERS", 18400, ""],
    ["12/11/2026", "UPI UNKNOWN", 1500, ""], // money left the bank, not in the CRM
  ]).rows;
  const r = reconcile(statement, books, 3);
  assert.equal(r.matched.length, 2);
  assert.equal(r.matched[1].dayGap, 1, "the bank showed it a day later");
  assert.deepEqual(r.onlyStatement.map((s) => s.moneyOut), [1500]);
  assert.deepEqual(r.onlyBooks.map((b) => b.id), ["v2"], "v3 is outside the statement's dates and is not reported");
  assert.equal(r.totals.unmatchedStatementOut, 1500);
  assert.equal(r.totals.unmatchedBooksOut, 3000);
  assert.equal(r.totals.statementIn, 25000);
});

test("M4j one book line is never used for two statement lines; too far apart is not a match", () => {
  const books = bookMoves([vendorPaymentEntry("v1", { day: "2026-11-02", amount: 500, method: "UPI" })!], "1010", "2026-11-01", "2026-11-30");
  const two = parseStatement([["Date", "Narration", "Debit", "Credit"], ["02/11/2026", "a", 500, ""], ["02/11/2026", "b", 500, ""]]).rows;
  const r = reconcile(two, books, 3);
  assert.equal(r.matched.length, 1);
  assert.equal(r.onlyStatement.length, 1);
  const far = parseStatement([["Date", "Narration", "Debit", "Credit"], ["09/11/2026", "late", 500, ""]]).rows;
  assert.equal(reconcile(far, books, 3).matched.length, 0);
  assert.equal(reconcile(far, books, 7).matched.length, 1);
  assert.equal(shiftDay("2026-11-01", -3), "2026-10-29");
});
