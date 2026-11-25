/**
 * Module 4a (19 Nov 2026) — double-entry ledger: chart of accounts, journal entries, trial balance, profit & loss,
 * balance sheet, period lock. Pure rules, tested in test/module4a.test.ts.
 *
 * How the books are kept (simple, on purpose):
 *  - Every money document (invoice, customer payment, purchase bill, expense, vendor payment, packed sale, staff
 *    advance, payroll) becomes one balanced journal entry. Debits always equal credits, to the paisa.
 *  - Purchases are booked as an expense on the day of the bill (not as stock value). The stock count stays in the
 *    inventory module; the books do not carry a stock asset. An accountant may add a closing-stock entry by hand.
 *  - GST is split out only where the document itself carries it.
 */
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { isValidDay, isValidMonth } from "../shared/istDate";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export interface Account {
  code: string;
  type: AccountType;
  te: string;
  en: string;
}

/** Fixed chart of accounts. Codes never change once used; new accounts are added, old ones are not renumbered. */
export const ACCOUNTS: readonly Account[] = [
  { code: "1000", type: "asset", te: "నగదు", en: "Cash" },
  { code: "1010", type: "asset", te: "బ్యాంక్ / UPI", en: "Bank / UPI" },
  { code: "1100", type: "asset", te: "కస్టమర్ల నుంచి రావలసింది", en: "Customers owe us" },
  { code: "1300", type: "asset", te: "సిబ్బంది అడ్వాన్సులు", en: "Staff advances" },
  { code: "1400", type: "asset", te: "GST input credit", en: "GST input credit" },
  { code: "2000", type: "liability", te: "సరఫరాదారులకు ఇవ్వవలసింది", en: "We owe vendors" },
  { code: "2100", type: "liability", te: "కట్టవలసిన GST", en: "GST payable" },
  { code: "2300", type: "liability", te: "ఇవ్వవలసిన జీతాలు", en: "Salaries payable" },
  { code: "3000", type: "equity", te: "యజమాని పెట్టుబడి", en: "Owner's capital" },
  { code: "3100", type: "equity", te: "యజమాని తీసుకున్నది", en: "Owner's drawings" },
  { code: "3900", type: "equity", te: "ప్రారంభ నిల్వలు / గత లాభం", en: "Opening balances / past profit" },
  { code: "4000", type: "income", te: "కేటరింగ్ ఆదాయం", en: "Catering income" },
  { code: "4100", type: "income", te: "ప్యాక్ ఉత్పత్తుల అమ్మకం", en: "Packed product sales" },
  { code: "4200", type: "income", te: "ఇతర ఆదాయం", en: "Other income" },
  { code: "5000", type: "expense", te: "సరుకుల కొనుగోలు", en: "Food & grocery purchases" },
  { code: "5100", type: "expense", te: "కూలీ & జీతాలు", en: "Labour & salaries" },
  { code: "5200", type: "expense", te: "రవాణా", en: "Transport" },
  { code: "5300", type: "expense", te: "అద్దె సామాను", en: "Rentals" },
  { code: "5400", type: "expense", te: "అద్దె & కరెంట్ / నీళ్ళు", en: "Rent & utilities" },
  { code: "5500", type: "expense", te: "ప్రచారం", en: "Marketing" },
  { code: "5900", type: "expense", te: "ఇతర ఖర్చులు", en: "Other expenses" },
  { code: "5950", type: "expense", te: "తగ్గింపులు / వదిలేసినవి", en: "Discounts / write-offs" },
] as const;

const BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a]));
export const accountOf = (code: string): Account | undefined => BY_CODE.get(code);
/** Accounts whose normal balance is a debit (assets, expenses); the rest are credit-normal. */
export const isDebitNormal = (type: AccountType) => type === "asset" || type === "expense";

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}
export interface JournalEntry {
  /** "YYYY-MM-DD" (IST) */
  day: string;
  memo: string;
  /** where it came from, e.g. { collection: "invoices", id, kind: "invoice" }; manual entries use collection "journalEntries" */
  source: { collection: string; id: string; kind: string };
  lines: JournalLine[];
}

const dr = (account: string, amount: number): JournalLine => ({ account, debit: round2(amount), credit: 0 });
const cr = (account: string, amount: number): JournalLine => ({ account, debit: 0, credit: round2(amount) });

/** Why an entry is not acceptable; "" = fine. */
export function entryProblem(e: Pick<JournalEntry, "day" | "lines">): string {
  if (!isValidDay(e.day)) return "bad-day";
  if (e.lines.length < 2) return "too-few-lines";
  let debit = 0;
  let credit = 0;
  for (const l of e.lines) {
    if (!accountOf(l.account)) return "unknown-account";
    if (!(l.debit >= 0) || !(l.credit >= 0) || !Number.isFinite(l.debit) || !Number.isFinite(l.credit)) return "bad-amount";
    if ((l.debit > 0) === (l.credit > 0)) return "one-side-only"; // each line is a debit or a credit, never both, never empty
    debit += l.debit;
    credit += l.credit;
  }
  if (Math.abs(round2(debit) - round2(credit)) > 0.005) return "not-balanced";
  return "";
}

/** Drops zero lines and merges nothing; returns null when nothing is left to book. */
function entry(day: string, memo: string, source: JournalEntry["source"], lines: JournalLine[]): JournalEntry | null {
  const kept = lines.filter((l) => l.debit > 0.004 || l.credit > 0.004);
  return kept.length >= 2 ? { day, memo, source, lines: kept } : null;
}

/** Cash goes to the cash account; UPI, bank transfer, card and anything else to the bank account. */
export const moneyAccount = (method: string) => (method.trim().toLowerCase() === "cash" ? "1000" : "1010");

/** Expense sections (expenses.section) and cost kinds → expense account. Unknown sections go to "Other expenses". */
const SECTION_ACCOUNT: Record<string, string> = {
  "Outside Purchase": "5000",
  "Staff Advance": "1300",
  "Temporary Staff": "5100",
  "Cleaning Department": "5100",
  Transport: "5200",
  "Utility Bill": "5400",
  "Rent / Fixed Expense": "5400",
  "Live Counter": "5000",
  "Other Expense": "5900",
  Other: "5900",
  Rentals: "5300",
  Marketing: "5500",
};
export const expenseAccount = (section: string) => SECTION_ACCOUNT[section] ?? "5900";

// ---- one entry per money document -----------------------------------------------------------------------------------

/** Invoice raised: the customer owes the total; income is the part before GST. */
export function invoiceEntry(id: string, x: { day: string; total: number; gst: number; number?: string }): JournalEntry | null {
  const gst = round2(Math.max(0, Math.min(x.gst, x.total)));
  return entry(x.day, `Invoice ${x.number ?? id}`, { collection: "invoices", id, kind: "invoice" }, [dr("1100", x.total), cr("4000", x.total - gst), cr("2100", gst)]);
}

/** Money from a customer (or back to the customer when `refund`). */
export function customerPaymentEntry(id: string, x: { day: string; amount: number; method: string; refund?: boolean }): JournalEntry | null {
  const m = moneyAccount(x.method);
  const src = { collection: "payments", id, kind: x.refund ? "refund" : "payment" };
  return x.refund ? entry(x.day, "Refund to customer", src, [dr("1100", x.amount), cr(m, x.amount)]) : entry(x.day, "Payment from customer", src, [dr(m, x.amount), cr("1100", x.amount)]);
}

/** Vendor bill for goods: an expense on the bill day; the vendor is owed the total. */
export function purchaseEntry(id: string, x: { day: string; total: number; gstInput?: number; number?: string }): JournalEntry | null {
  const gst = round2(Math.max(0, Math.min(x.gstInput ?? 0, x.total)));
  return entry(x.day, `Purchase ${x.number ?? id}`, { collection: "purchases", id, kind: "purchase" }, [dr("5000", x.total - gst), dr("1400", gst), cr("2000", x.total)]);
}

/** Any other expense, by its section. A "Staff Advance" expense is money lent to staff, not a cost. */
export function expenseEntry(id: string, x: { day: string; amount: number; section: string }): JournalEntry | null {
  return entry(x.day, `Expense: ${x.section || "Other"}`, { collection: "expenses", id, kind: "expense" }, [dr(expenseAccount(x.section), x.amount), cr("2000", x.amount)]);
}

/** Money paid to a vendor (or for an expense). */
export function vendorPaymentEntry(id: string, x: { day: string; amount: number; method: string }): JournalEntry | null {
  return entry(x.day, "Payment to vendor", { collection: "vendorPayments", id, kind: "vendorPayment" }, [dr("2000", x.amount), cr(moneyAccount(x.method), x.amount)]);
}

/** Packed products sold. A credit sale is owed by the customer; any other method is money in hand. */
export function packedSaleEntry(id: string, x: { day: string; amount: number; tax: number; method: string; number?: string }): JournalEntry | null {
  const tax = round2(Math.max(0, Math.min(x.tax, x.amount)));
  const debit = x.method === "Credit" ? "1100" : moneyAccount(x.method);
  return entry(x.day, `Packed sale ${x.number ?? id}`, { collection: "packedSales", id, kind: "packedSale" }, [dr(debit, x.amount), cr("4100", x.amount - tax), cr("2100", tax)]);
}

/** Advance given to a staff member: money out, owed back by the staff member. */
export function staffAdvanceEntry(id: string, x: { day: string; amount: number; method?: string }): JournalEntry | null {
  return entry(x.day, "Staff advance", { collection: "staffAdvances", id, kind: "staffAdvance" }, [dr("1300", x.amount), cr(moneyAccount(x.method ?? "Cash"), x.amount)]);
}

/** A month's payroll for one person: gross pay is the cost; the advance cut reduces what staff owe; the rest is payable. */
export function payrollEntry(id: string, x: { day: string; gross: number; advanceCut: number }): JournalEntry | null {
  const cut = round2(Math.max(0, Math.min(x.advanceCut, x.gross)));
  return entry(x.day, "Payroll", { collection: "payroll", id, kind: "payroll" }, [dr("5100", x.gross), cr("1300", cut), cr("2300", x.gross - cut)]);
}

/** Salary handed over: what we owed the staff goes down, money goes out. */
export function salaryPaymentEntry(id: string, x: { day: string; amount: number; method: string }): JournalEntry | null {
  return entry(x.day, "Salary paid", { collection: "salaryPayments", id, kind: "salaryPayment" }, [dr("2300", x.amount), cr(moneyAccount(x.method), x.amount)]);
}

// ---- manual entries (owner / accountant) ----------------------------------------------------------------------------

export type Res<T> = { ok: true; value: T } | { ok: false; te: string; en: string };
const bad = (te: string, en: string) => ({ ok: false as const, te, en });

export function parseManualEntry(d: Doc, today: string): Res<{ day: string; memo: string; lines: JournalLine[] }> {
  const day = asStr(d.day);
  if (!isValidDay(day)) return bad("తేదీ సరిగా లేదు.", "The date is not valid.");
  if (day > today) return bad("రేపటి తేదీతో ఎంట్రీ రాయలేరు.", "An entry can't be dated in the future.");
  const memo = asStr(d.memo).trim();
  if (!memo || memo.length > 200) return bad("ఎంట్రీ ఎందుకో వివరం రాయండి (200 అక్షరాల లోపు).", "Say what the entry is for (up to 200 letters).");
  const rows = asArr(d.lines);
  if (!Array.isArray(d.lines) || rows.length < 2 || rows.length > 20) return bad("కనీసం 2, గరిష్ఠంగా 20 లైన్లు ఉండాలి.", "An entry needs 2 to 20 lines.");
  const lines: JournalLine[] = [];
  for (const raw of rows) {
    const r = asObj(raw);
    const account = asStr(r.account);
    if (!accountOf(account)) return bad("ఖాతా సరిగా లేదు.", "An account is not valid.");
    const debit = typeof r.debit === "number" && Number.isFinite(r.debit) ? round2(r.debit) : 0;
    const credit = typeof r.credit === "number" && Number.isFinite(r.credit) ? round2(r.credit) : 0;
    if (debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) return bad("ప్రతి లైన్‌లో డెబిట్ లేదా క్రెడిట్ ఒక్కటే ఉండాలి (0 కంటే ఎక్కువ).", "Each line needs a debit or a credit, not both (above 0).");
    if (debit > 100000000 || credit > 100000000) return bad("మొత్తం చాలా పెద్దది.", "The amount is too large.");
    lines.push({ account, debit, credit });
  }
  const p = entryProblem({ day, lines });
  if (p === "not-balanced") return bad("డెబిట్ మొత్తం, క్రెడిట్ మొత్తం సమానంగా ఉండాలి.", "Total debits must equal total credits.");
  if (p) return bad("ఎంట్రీ సరిగా లేదు.", "The entry is not valid.");
  return { ok: true, value: { day, memo, lines } };
}

// ---- reports --------------------------------------------------------------------------------------------------------

export interface TrialRow {
  account: string;
  type: AccountType;
  debit: number;
  credit: number;
  /** positive on the account's normal side */
  balance: number;
}
export interface TrialBalance {
  rows: TrialRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/** Totals per account over the given entries (entries with a problem are left out and counted in `skipped`). */
export function trialBalance(entries: JournalEntry[]): TrialBalance & { skipped: number } {
  const sums = new Map<string, { debit: number; credit: number }>();
  let skipped = 0;
  for (const e of entries) {
    if (entryProblem(e)) {
      skipped++;
      continue;
    }
    for (const l of e.lines) {
      const s = sums.get(l.account) ?? { debit: 0, credit: 0 };
      s.debit = round2(s.debit + l.debit);
      s.credit = round2(s.credit + l.credit);
      sums.set(l.account, s);
    }
  }
  const rows: TrialRow[] = ACCOUNTS.filter((a) => sums.has(a.code)).map((a) => {
    const s = sums.get(a.code)!;
    return { account: a.code, type: a.type, debit: s.debit, credit: s.credit, balance: round2(isDebitNormal(a.type) ? s.debit - s.credit : s.credit - s.debit) };
  });
  const totalDebit = round2(rows.reduce((a, r) => a + r.debit, 0));
  const totalCredit = round2(rows.reduce((a, r) => a + r.credit, 0));
  return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.005, skipped };
}

export interface ProfitAndLoss {
  income: number;
  expenses: number;
  profit: number;
  byAccount: { account: string; type: "income" | "expense"; amount: number }[];
}
export function profitAndLoss(tb: Pick<TrialBalance, "rows">): ProfitAndLoss {
  const byAccount = tb.rows.filter((r) => r.type === "income" || r.type === "expense").map((r) => ({ account: r.account, type: r.type as "income" | "expense", amount: r.balance }));
  const income = round2(byAccount.filter((r) => r.type === "income").reduce((a, r) => a + r.amount, 0));
  const expenses = round2(byAccount.filter((r) => r.type === "expense").reduce((a, r) => a + r.amount, 0));
  return { income, expenses, profit: round2(income - expenses), byAccount };
}

export interface BalanceSheet {
  assets: number;
  liabilities: number;
  equity: number;
  /** profit of the entries that were given (not yet moved into equity) */
  profit: number;
  /** assets = liabilities + equity + profit */
  balanced: boolean;
}
export function balanceSheet(tb: Pick<TrialBalance, "rows">): BalanceSheet {
  const sum = (t: AccountType) => round2(tb.rows.filter((r) => r.type === t).reduce((a, r) => a + r.balance, 0));
  const assets = sum("asset");
  const liabilities = sum("liability");
  const equity = sum("equity");
  const profit = profitAndLoss(tb).profit;
  return { assets, liabilities, equity, profit, balanced: Math.abs(assets - round2(liabilities + equity + profit)) < 0.005 };
}

// ---- period lock ----------------------------------------------------------------------------------------------------

/** `lockedThrough` = last locked month "YYYY-MM" ("" = nothing locked). A day in or before it cannot be changed. */
export function isLockedDay(day: string, lockedThrough: string): boolean {
  return isValidMonth(lockedThrough) && isValidDay(day) && day.slice(0, 7) <= lockedThrough;
}

/** A month can be locked only after it has ended, and only moving forward. */
export function lockProblem(month: string, lockedThrough: string, today: string): "" | "bad-month" | "not-ended" | "already-locked" {
  if (!isValidMonth(month)) return "bad-month";
  if (month >= today.slice(0, 7)) return "not-ended";
  if (isValidMonth(lockedThrough) && month <= lockedThrough) return "already-locked";
  return "";
}

/** Unlocking goes back one step at most: only the last locked month can be reopened (owner, with a reason). */
export function unlockTarget(lockedThrough: string): string {
  if (!isValidMonth(lockedThrough)) return "";
  const [y, m] = lockedThrough.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return prev;
}
