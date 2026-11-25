// Module 4b — journal entries from the CRM's money documents. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allEntries, allocatedByBill, expenseEntries, invoiceEntries, outsideOrderEntries, payrollEntries, purchaseEntries, splitByPeriod, LedgerDocs } from "../src/ledger/ledgerSources";
import { balanceSheet, entryProblem, profitAndLoss, trialBalance } from "../src/ledger/ledgerRules";

const ts = (day: string) => new Date(`${day}T06:30:00Z`); // 12:00 IST
const empty: LedgerDocs = { invoices: [], purchases: [], expenses: [], outsideOrders: [], vendorPayments: [], packedSales: [], staffAdvances: [], payroll: [], journalEntries: [] };

test("M4b an invoice with payments and a refund", () => {
  const e = invoiceEntries(
    { id: "i1", data: { invoiceNumber: "INV-7", status: "PartiallyPaid", issueDate: ts("2026-11-02"), totalAmount: 105000, cgstAmount: 2500, sgstAmount: 2500 } },
    [{ id: "p1", data: { amount: 60000, day: "2026-11-03", method: "UPI" } }, { id: "p2", data: { amount: -5000, day: "2026-11-05", method: "Cash" } }, { id: "p3", data: { amount: 100, day: "2026-11-06", status: "Cancelled" } }],
  );
  assert.equal(e.length, 3, "the cancelled payment is left out");
  assert.deepEqual(e[0].lines.map((l) => [l.account, l.debit, l.credit]), [["1100", 105000, 0], ["4000", 0, 100000], ["2100", 0, 5000]]);
  assert.equal(e[1].source.kind, "payment");
  assert.deepEqual(e[2].lines.map((l) => [l.account, l.debit, l.credit]), [["1100", 5000, 0], ["1000", 0, 5000]], "a refund puts the amount back on the customer");
  for (const x of e) assert.equal(entryProblem(x), "");
});

test("M4b a cancelled invoice leaves only its cancellation charge; void and deleted leave nothing", () => {
  const c = invoiceEntries({ id: "i2", data: { status: "Cancelled", issueDate: ts("2026-11-02"), cancelledAt: ts("2026-11-09"), totalAmount: 80000, cancellationCharge: 10000 } }, [{ id: "p", data: { amount: 20000, day: "2026-11-03", method: "UPI" } }, { id: "r", data: { amount: -10000, day: "2026-11-09", method: "UPI" } }]);
  assert.deepEqual(c.map((x) => x.source.kind), ["cancellationCharge", "payment", "refund"]);
  assert.equal(c[0].day, "2026-11-09");
  const tb = trialBalance(c);
  assert.equal(tb.rows.find((r) => r.account === "1100")!.balance, 0, "charge 10000 + refund 10000 − paid 20000 = nothing owed");
  assert.deepEqual(invoiceEntries({ id: "i3", data: { status: "Void", issueDate: ts("2026-11-02"), totalAmount: 5 } }, []), []);
  assert.deepEqual(invoiceEntries({ id: "i4", data: { status: "Draft", isDeleted: true, issueDate: ts("2026-11-02"), totalAmount: 5 } }, []), []);
});

test("M4b money paid to a vendor is counted once", () => {
  const vendorPayments = [{ id: "vp1", data: { date: "2026-11-12", amount: 7000, method: "UPI", allocations: [{ collection: "purchases", id: "pu1", amount: 6000 }] } }];
  const allocated = allocatedByBill(vendorPayments);
  assert.equal(allocated.get("purchases/pu1"), 6000);
  // bill of 10000: 6000 came through vendorPayments, 1500 was already paid on the bill itself (old data)
  const pu = purchaseEntries({ id: "pu1", data: { purchaseDate: ts("2026-11-10"), totalAmount: 10000, paid: 7500, paymentMethod: "Cash" } }, allocated);
  assert.deepEqual(pu.map((x) => x.source.kind), ["purchase", "billPaidDirect"]);
  assert.deepEqual(pu[1].lines.map((l) => [l.account, l.debit, l.credit]), [["2000", 1500, 0], ["1000", 0, 1500]]);
  const all = allEntries({ ...empty, purchases: [{ id: "pu1", data: { purchaseDate: ts("2026-11-10"), totalAmount: 10000, paid: 7500, paymentMethod: "Cash" } }], vendorPayments });
  const tb = trialBalance(all);
  assert.equal(tb.rows.find((r) => r.account === "2000")!.balance, 1500, "owed: 10000 − 7000 paid by UPI (1000 of it not allocated yet) − 1500 paid directly");
  assert.equal(tb.rows.find((r) => r.account === "1010")!.balance, -7000);
  assert.equal(tb.rows.find((r) => r.account === "1000")!.balance, -1500);
  // fully through vendorPayments: no direct entry
  assert.equal(purchaseEntries({ id: "pu1", data: { purchaseDate: ts("2026-11-10"), totalAmount: 10000, paid: 6000 } }, allocated).length, 1);
  // an old bill marked Paid with no payment document: paid directly on the bill day
  const old = purchaseEntries({ id: "pu9", data: { purchaseDate: ts("2026-08-01"), totalAmount: 400, paymentStatus: "Paid", paymentMethod: "UPI" } }, allocated);
  assert.deepEqual(old[1].lines.map((l) => [l.account, l.credit]), [["2000", 0], ["1010", 400]]);
  assert.deepEqual(purchaseEntries({ id: "x", data: { purchaseDate: ts("2026-08-01"), totalAmount: 400, status: "Cancelled" } }, allocated), []);
});

test("M4b expenses go to the account of their section; an advance typed on the expense is money out", () => {
  const e = expenseEntries({ id: "e1", data: { section: "Transport", serviceDate: ts("2026-11-04"), totalAmount: 3000, advancePaid: 1000, paymentMethod: "Cash" } }, new Map());
  assert.deepEqual(e[0].lines.map((l) => [l.account, l.debit, l.credit]), [["5200", 3000, 0], ["2000", 0, 3000]]);
  assert.deepEqual(e[1].lines.map((l) => [l.account, l.debit, l.credit]), [["2000", 1000, 0], ["1000", 0, 1000]]);
});

test("M4b an outside order costs money only once delivered; its advance is money out before that", () => {
  const ordered = outsideOrderEntries({ id: "o1", data: { item: "Small Pulka", status: "ordered", date: "2026-11-08", rate: 4, acceptedQty: 0, advancePaid: 500 } }, new Map());
  assert.deepEqual(ordered.map((x) => x.source.kind), ["billPaidDirect"]);
  const delivered = outsideOrderEntries({ id: "o1", data: { item: "Small Pulka", status: "delivered", date: "2026-11-08", rate: 4, acceptedQty: 1000, advancePaid: 500 } }, new Map());
  assert.deepEqual(delivered.map((x) => x.source.kind), ["outsideOrder", "billPaidDirect"]);
  assert.equal(delivered[0].lines[0].debit, 4000);
});

test("M4b payroll: earned pay is the cost, the advance recovered comes off what staff owe", () => {
  const p = payrollEntries({ id: "2026-10_s1", data: { month: "2026-10", finalized: true, net: 16000, advances: 2000 } });
  assert.equal(p[0].day, "2026-10-31");
  assert.deepEqual(p[0].lines.map((l) => [l.account, l.debit, l.credit]), [["5100", 18000, 0], ["1300", 0, 2000], ["2300", 0, 16000]]);
  assert.deepEqual(payrollEntries({ id: "x", data: { month: "2026-10", finalized: false, net: 16000 } }), [], "not finalized yet");
});

test("M4b the whole book balances and splits by period", () => {
  const docs: LedgerDocs = {
    ...empty,
    journalEntries: [{ id: "m1", data: { day: "2026-10-01", memo: "Capital", lines: [{ account: "1010", debit: 100000 }, { account: "3000", credit: 100000 }] } }, { id: "m2", data: { day: "2026-10-02", memo: "x", cancelled: true, lines: [{ account: "1010", debit: 9 }, { account: "3000", credit: 9 }] } }],
    invoices: [{ id: "i1", data: { status: "Paid", issueDate: ts("2026-10-20"), totalAmount: 50000 }, payments: [{ id: "p1", data: { amount: 50000, day: "2026-11-02", method: "UPI" } }] }],
    purchases: [{ id: "pu1", data: { purchaseDate: ts("2026-10-18"), totalAmount: 20000 } }],
    packedSales: [{ id: "s1", data: { saleDay: "2026-11-05", amount: 450, tax: 0, method: "Cash" } }, { id: "s2", data: { saleDay: "2026-11-05", amount: 450, tax: 0, method: "Cash", cancelled: true } }],
    staffAdvances: [{ id: "a1", data: { date: "2026-11-06", amount: 3000 } }],
  };
  const all = allEntries(docs);
  assert.equal(all.length, 6);
  assert.deepEqual(all.map((e) => e.day), [...all.map((e) => e.day)].sort(), "oldest first");
  assert.equal(trialBalance(all).balanced, true);
  const oct = splitByPeriod(all, "2026-10-01", "2026-10-31");
  assert.equal(profitAndLoss(trialBalance(oct.inPeriod)).profit, 30000, "October: 50000 income − 20000 purchases");
  assert.deepEqual(balanceSheet(trialBalance(oct.upTo)), { assets: 150000, liabilities: 20000, equity: 100000, profit: 30000, balanced: true });
  const nov = splitByPeriod(all, "2026-11-01", "2026-11-30");
  assert.equal(profitAndLoss(trialBalance(nov.inPeriod)).profit, 450);
  const bs = balanceSheet(trialBalance(nov.upTo));
  assert.equal(bs.balanced, true);
  assert.equal(bs.assets, 150450, "bank 150000, cash 450 − 3000, staff owe 3000");
});
