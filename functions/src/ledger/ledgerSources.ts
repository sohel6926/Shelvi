/**
 * Module 4b (19 Nov 2026) — turns the money documents of the CRM into journal entries (pure; tested in
 * test/module4b.test.ts). The ledger is derived from these documents every time it is asked for, so it can never
 * drift from them.
 *
 * Money paid to vendors is recorded two ways in this CRM and is counted once here:
 *  - vendorPayments documents (recordVendorPayment) — booked on the payment day, whole amount;
 *  - an amount already paid on the bill itself (old "Paid" bills, an advance typed on an expense or outside order) —
 *    booked on the bill day as "paid directly" = the bill's paid total minus what vendorPayments allocated to it.
 */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { dayOfValue, daysInMonth, isValidMonth } from "../shared/istDate";
import { isLiveRecord } from "../shared/costTarget";
import { billOf, BillCollection } from "../vendors/billRules";
import {
  JournalEntry, customerPaymentEntry, expenseAccount, expenseEntry, invoiceEntry, moneyAccount, packedSaleEntry, payrollEntry, purchaseEntry, round2, salaryPaymentEntry, staffAdvanceEntry, vendorPaymentEntry,
} from "./ledgerRules";

type Row = { id: string; data: Doc };
const keep = (xs: (JournalEntry | null)[]) => xs.filter((x): x is JournalEntry => x !== null);

/** Invoice + its payments / refunds; a cancelled invoice leaves only its cancellation charge (other income). */
export function invoiceEntries(inv: Row, payments: Row[]): JournalEntry[] {
  const d = inv.data;
  const status = asStr(d.status);
  if (status === "Void" || d.isDeleted === true) return [];
  const number = asStr(d.invoiceNumber) || inv.id;
  const issue = dayOfValue(d.issueDate) ?? dayOfValue(d.createdAt);
  const out: (JournalEntry | null)[] = [];
  if (status === "Cancelled") {
    const charge = round2(Math.max(0, asNum(d.cancellationCharge)));
    const day = dayOfValue(d.cancelledAt) ?? issue;
    if (charge > 0 && day) {
      out.push({ day, memo: `Cancellation charge ${number}`, source: { collection: "invoices", id: inv.id, kind: "cancellationCharge" }, lines: [{ account: "1100", debit: charge, credit: 0 }, { account: "4200", debit: 0, credit: charge }] });
    }
  } else if (issue) {
    const gst = round2(asNum(d.cgstAmount) + asNum(d.sgstAmount) + asNum(d.igstAmount));
    out.push(invoiceEntry(inv.id, { day: issue, total: round2(Math.max(0, asNum(d.totalAmount))), gst, number }));
  }
  for (const p of payments) {
    if (!isLiveRecord(p.data)) continue;
    const amt = round2(asNum(p.data.amount));
    const day = asStr(p.data.day) || dayOfValue(p.data.date);
    if (!day || amt === 0) continue;
    out.push(customerPaymentEntry(`${inv.id}/${p.id}`, { day, amount: Math.abs(amt), method: asStr(p.data.method), refund: amt < 0 }));
  }
  return keep(out);
}

/** ₹ that vendorPayments allocated to each bill, keyed "collection/id". */
export function allocatedByBill(vendorPayments: Row[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of vendorPayments) {
    if (!isLiveRecord(p.data)) continue;
    for (const raw of asArr(p.data.allocations)) {
      const a = asObj(raw);
      const key = `${asStr(a.collection)}/${asStr(a.id)}`;
      out.set(key, round2((out.get(key) ?? 0) + Math.max(0, asNum(a.amount))));
    }
  }
  return out;
}

function directPaid(collection: BillCollection, row: Row, day: string, method: string, allocated: Map<string, number>): JournalEntry | null {
  const paid = billOf(collection, row.data).paidTotal;
  const direct = round2(paid - (allocated.get(`${collection}/${row.id}`) ?? 0));
  if (!(direct > 0.004)) return null;
  return { day, memo: "Paid directly on the bill", source: { collection, id: row.id, kind: "billPaidDirect" }, lines: [{ account: "2000", debit: direct, credit: 0 }, { account: moneyAccount(method || "Cash"), debit: 0, credit: direct }] };
}

export function purchaseEntries(row: Row, allocated: Map<string, number>): JournalEntry[] {
  const d = row.data;
  if (!isLiveRecord(d)) return [];
  const day = dayOfValue(d.purchaseDate) ?? dayOfValue(d.createdAt);
  if (!day) return [];
  const method = asStr(d.paymentMethod);
  return keep([purchaseEntry(row.id, { day, total: round2(Math.max(0, asNum(d.totalAmount))), number: asStr(d.purchaseNumber) || undefined }), directPaid("purchases", row, day, method === "Credit" ? "Cash" : method, allocated)]);
}

export function expenseEntries(row: Row, allocated: Map<string, number>): JournalEntry[] {
  const d = row.data;
  if (!isLiveRecord(d)) return [];
  const day = dayOfValue(d.serviceDate) ?? dayOfValue(d.createdAt);
  if (!day) return [];
  return keep([expenseEntry(row.id, { day, amount: round2(Math.max(0, asNum(d.totalAmount))), section: asStr(d.section) }), directPaid("expenses", row, day, asStr(d.paymentMethod), allocated)]);
}

/** Outside orders (pulka, ice cream …): a cost once delivered; an advance paid earlier is money out on the order day. */
export function outsideOrderEntries(row: Row, allocated: Map<string, number>): JournalEntry[] {
  const d = row.data;
  if (!isLiveRecord(d)) return [];
  const day = asStr(d.date) || dayOfValue(d.createdAt);
  if (!day) return [];
  const out: (JournalEntry | null)[] = [];
  if (asStr(d.status) !== "ordered") {
    const cost = billOf("outsideOrders", d).total;
    if (cost > 0.004) out.push({ day, memo: `Outside order: ${asStr(d.item)}`, source: { collection: "outsideOrders", id: row.id, kind: "outsideOrder" }, lines: [{ account: expenseAccount("Outside Purchase"), debit: cost, credit: 0 }, { account: "2000", debit: 0, credit: cost }] });
  }
  out.push(directPaid("outsideOrders", row, day, "Cash", allocated));
  return keep(out);
}

export function vendorPaymentEntries(row: Row): JournalEntry[] {
  const d = row.data;
  if (!isLiveRecord(d)) return [];
  const day = asStr(d.date) || dayOfValue(d.paidAt);
  if (!day) return [];
  return keep([vendorPaymentEntry(row.id, { day, amount: round2(Math.max(0, asNum(d.amount))), method: asStr(d.method) })]);
}

export function packedSaleEntries(row: Row): JournalEntry[] {
  const d = row.data;
  if (d.cancelled === true || !isLiveRecord(d)) return [];
  const day = asStr(d.saleDay);
  if (!day) return [];
  return keep([packedSaleEntry(row.id, { day, amount: round2(Math.max(0, asNum(d.amount))), tax: round2(Math.max(0, asNum(d.tax))), method: asStr(d.method), number: asStr(d.saleNumber) || undefined })]);
}

export function staffAdvanceEntries(row: Row): JournalEntry[] {
  const d = row.data;
  if (!isLiveRecord(d)) return [];
  const day = asStr(d.date) || dayOfValue(d.createdAt);
  if (!day) return [];
  return keep([staffAdvanceEntry(row.id, { day, amount: round2(Math.max(0, asNum(d.amount))) })]);
}

/**
 * The day a month's payroll is booked: the last day of that month — or the day it was finalized, if that is earlier
 * (payroll finalized and paid mid-month would otherwise show "Salaries payable" below zero until month end).
 */
export function payrollBookingDay(month: string, finalizedDay: string): string {
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(finalizedDay) && finalizedDay >= `${month}-01` && finalizedDay < last ? finalizedDay : last;
}

/** A finalized payroll row, booked on the last day of its month (or its finalize day when earlier). Earned pay = net pay + advance recovered. */
export function payrollEntries(row: Row): JournalEntry[] {
  const d = row.data;
  const month = asStr(d.month);
  if (d.finalized !== true || !isValidMonth(month)) return [];
  const advanceCut = round2(Math.max(0, asNum(d.advances)));
  const gross = round2(Math.max(0, asNum(d.net)) + advanceCut);
  return keep([payrollEntry(row.id, { day: payrollBookingDay(month, dayOfValue(d.finalizedAt) ?? ""), gross, advanceCut })]);
}

/** Module 4e: salary money handed over (salaryPayments). */
export function salaryPaymentEntries(row: Row): JournalEntry[] {
  const d = row.data;
  if (d.cancelled === true) return [];
  const day = asStr(d.date);
  if (!day) return [];
  return keep([salaryPaymentEntry(row.id, { day, amount: round2(Math.max(0, asNum(d.amount))), method: asStr(d.method) })]);
}

/** A hand-written entry (journalEntries) as stored by saveJournalEntry. */
export function manualEntries(row: Row): JournalEntry[] {
  const d = row.data;
  if (d.cancelled === true) return [];
  const lines = asArr(d.lines).map((x) => {
    const l = asObj(x);
    return { account: asStr(l.account), debit: round2(Math.max(0, asNum(l.debit))), credit: round2(Math.max(0, asNum(l.credit))) };
  });
  return [{ day: asStr(d.day), memo: asStr(d.memo), source: { collection: "journalEntries", id: row.id, kind: "manual" }, lines }];
}

export interface LedgerDocs {
  invoices: (Row & { payments: Row[] })[];
  purchases: Row[];
  expenses: Row[];
  outsideOrders: Row[];
  vendorPayments: Row[];
  packedSales: Row[];
  staffAdvances: Row[];
  payroll: Row[];
  /** optional so older callers / tests keep working */
  salaryPayments?: Row[];
  journalEntries: Row[];
}

/** Every journal entry of the business, oldest first. */
export function allEntries(docs: LedgerDocs): JournalEntry[] {
  const allocated = allocatedByBill(docs.vendorPayments);
  return [
    ...docs.invoices.flatMap((i) => invoiceEntries(i, i.payments)),
    ...docs.purchases.flatMap((r) => purchaseEntries(r, allocated)),
    ...docs.expenses.flatMap((r) => expenseEntries(r, allocated)),
    ...docs.outsideOrders.flatMap((r) => outsideOrderEntries(r, allocated)),
    ...docs.vendorPayments.flatMap(vendorPaymentEntries),
    ...docs.packedSales.flatMap(packedSaleEntries),
    ...docs.staffAdvances.flatMap(staffAdvanceEntries),
    ...docs.payroll.flatMap(payrollEntries),
    ...(docs.salaryPayments ?? []).flatMap(salaryPaymentEntries),
    ...docs.journalEntries.flatMap(manualEntries),
  ].sort((a, b) => a.day.localeCompare(b.day));
}

/** Entries up to and including `to` (balance sheet) and those from `from` to `to` (profit & loss). */
export function splitByPeriod(entries: JournalEntry[], from: string, to: string): { upTo: JournalEntry[]; inPeriod: JournalEntry[] } {
  const upTo = entries.filter((e) => e.day <= to);
  return { upTo, inPeriod: upTo.filter((e) => e.day >= from) };
}
