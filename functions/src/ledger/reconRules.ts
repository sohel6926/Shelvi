/**
 * Module 4f (19 Nov 2026) — bank / UPI statement reconciliation. Pure rules; tested in test/module4j.test.ts.
 *
 * The owner uploads the statement the bank gives (Excel / CSV). Banks differ in layout and put account details
 * above the table, so the sheet arrives here as a raw grid and this file finds the header row, reads each line
 * (date, text, money in, money out) and pairs it with the movements the books show on the bank account:
 * same direction, same amount, date within a few days. What is left on either side is the difference to look at.
 * Nothing is stored — it is a report.
 */
import { JournalEntry, round2 } from "./ledgerRules";

export interface StatementRow {
  /** 1-based row of the sheet, to find it again */
  line: number;
  day: string;
  text: string;
  ref: string;
  moneyIn: number;
  moneyOut: number;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** A statement date: an Excel day number, or text as Indian banks write it (day first). null = not a date. */
export function parseStatementDay(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v < 36526 || v > 73415) return null; // 2000-01-01 … 2100-12-31 as Excel day numbers
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  if (typeof v !== "string") return null;
  const s = v.trim().split(/[ T]\d{1,2}:\d{2}/)[0].trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2}|\d{4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

/** An amount cell: 12,345.50 · ₹500 · "1,200.00 Cr" · a number. Blank / dash = 0. null = not an amount. */
export function parseStatementAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? round2(Math.abs(v)) : null;
  if (typeof v !== "string") return v === null || v === undefined ? 0 : null;
  const s = v.replace(/[₹,\s]/g, "").replace(/(cr|dr)\.?$/i, "").replace(/^(inr|rs\.?)/i, "");
  if (s === "" || s === "-" || s === "--") return 0;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return round2(Math.abs(Number(s)));
}

interface Columns {
  date: number;
  text: number;
  ref: number;
  out: number;
  in: number;
  amount: number;
  type: number;
}
const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s_.()]+/g, " ").replace(/\binr\b|\brs\b|₹/g, "").trim() : "");

/** Which column is which, from one row of headings. null = this row is not the table's heading. */
export function readHeader(row: unknown[]): Columns | null {
  const c: Columns = { date: -1, text: -1, ref: -1, out: -1, in: -1, amount: -1, type: -1 };
  row.forEach((cell, i) => {
    const h = norm(cell);
    if (!h) return;
    const set = (k: keyof Columns) => { if (c[k] < 0) c[k] = i; };
    if (/balance/.test(h)) return;
    if (/^(txn|tran|transaction|trans|posting|post|value)? ?date$/.test(h) || h === "date") set("date");
    else if (/narration|description|particulars|remarks|details/.test(h)) set("text");
    else if (/withdrawal|debit|^dr$|paid out|money out/.test(h)) set("out");
    else if (/deposit|credit|^cr$|paid in|money in/.test(h)) set("in");
    else if (/dr ?\/ ?cr|cr ?\/ ?dr|^type$|txn type/.test(h)) set("type");
    else if (/amount/.test(h)) set("amount");
    else if (/ref|chq|cheque|utr/.test(h)) set("ref");
  });
  const hasMoney = (c.out >= 0 && c.in >= 0) || c.amount >= 0;
  return c.date >= 0 && hasMoney ? c : null;
}

export interface ParsedStatement {
  problem: "" | "no-header" | "no-rows";
  rows: StatementRow[];
  /** lines under the heading that could not be read (totals, blank lines, page breaks) */
  skipped: number;
}

export function parseStatement(grid: unknown[][]): ParsedStatement {
  let at = -1;
  let cols: Columns | null = null;
  for (let i = 0; i < Math.min(grid.length, 80) && !cols; i++) {
    cols = readHeader(Array.isArray(grid[i]) ? grid[i] : []);
    if (cols) at = i;
  }
  if (!cols) return { problem: "no-header", rows: [], skipped: 0 };
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (let i = at + 1; i < grid.length; i++) {
    const r = Array.isArray(grid[i]) ? grid[i] : [];
    if (r.every((x) => x === null || x === undefined || x === "")) continue;
    const day = parseStatementDay(r[cols.date]);
    let moneyIn = 0;
    let moneyOut = 0;
    let ok = day !== null;
    if (cols.out >= 0 && cols.in >= 0) {
      const o = parseStatementAmount(r[cols.out]);
      const n = parseStatementAmount(r[cols.in]);
      if (o === null || n === null) ok = false;
      else { moneyOut = o; moneyIn = n; }
    } else {
      const a = parseStatementAmount(r[cols.amount]);
      const raw = r[cols.amount];
      const mark = `${cols.type >= 0 ? norm(r[cols.type]) : ""} ${typeof raw === "string" ? raw.toLowerCase() : ""}`;
      const isIn = /\bcr\b|credit|deposit/.test(mark) || /cr\.?$/.test(mark.trim());
      const isOut = /\bdr\b|debit|withdraw/.test(mark) || /dr\.?$/.test(mark.trim()) || (typeof raw === "number" && raw < 0) || (typeof raw === "string" && raw.trim().startsWith("-"));
      if (a === null || (!isIn && !isOut)) ok = false;
      else if (isIn && !isOut) moneyIn = a;
      else moneyOut = a;
    }
    if (!ok || (moneyIn <= 0 && moneyOut <= 0)) {
      skipped++;
      continue;
    }
    const cell = (k: number) => (k >= 0 && r[k] !== null && r[k] !== undefined ? String(r[k]).trim().slice(0, 200) : "");
    rows.push({ line: i + 1, day: day as string, text: cell(cols.text), ref: cell(cols.ref), moneyIn, moneyOut });
  }
  return { problem: rows.length ? "" : "no-rows", rows, skipped };
}

export interface BookMove {
  day: string;
  memo: string;
  kind: string;
  collection: string;
  id: string;
  moneyIn: number;
  moneyOut: number;
}

/** Every movement the books show on one money account (a debit there is money in, a credit is money out). */
export function bookMoves(entries: JournalEntry[], account: string, from: string, to: string): BookMove[] {
  const out: BookMove[] = [];
  for (const e of entries) {
    if (e.day < from || e.day > to) continue;
    for (const l of e.lines) {
      if (l.account !== account || (l.debit <= 0 && l.credit <= 0)) continue;
      out.push({ day: e.day, memo: e.memo, kind: e.source.kind, collection: e.source.collection, id: e.source.id, moneyIn: round2(l.debit), moneyOut: round2(l.credit) });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

const dayNo = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
export const shiftDay = (d: string, by: number): string => {
  const t = new Date((dayNo(d) + by) * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

export interface Reconciliation {
  matched: { statement: StatementRow; book: BookMove; dayGap: number }[];
  /** on the bank statement, not in the books: money that moved without being entered in the CRM */
  onlyStatement: StatementRow[];
  /** in the books, not on the statement: entered in the CRM but the bank does not show it (wrong method? not yet cleared?) */
  onlyBooks: BookMove[];
  totals: { statementIn: number; statementOut: number; booksIn: number; booksOut: number; unmatchedStatementIn: number; unmatchedStatementOut: number; unmatchedBooksIn: number; unmatchedBooksOut: number };
}

/**
 * Pairs statement lines with book movements one to one: same direction, same amount (to the paisa), dates at most
 * `toleranceDays` apart; the nearest date wins. Book movements outside the statement's own dates are not reported
 * as missing (they belong to another statement).
 */
export function reconcile(statement: StatementRow[], books: BookMove[], toleranceDays: number): Reconciliation {
  const used = new Array<boolean>(books.length).fill(false);
  const matched: Reconciliation["matched"] = [];
  const onlyStatement: StatementRow[] = [];
  for (const s of [...statement].sort((a, b) => a.day.localeCompare(b.day) || a.line - b.line)) {
    const sd = dayNo(s.day);
    let best = -1;
    let bestGap = Infinity;
    books.forEach((b, i) => {
      if (used[i]) return;
      const same = s.moneyIn > 0 ? Math.abs(b.moneyIn - s.moneyIn) < 0.005 && b.moneyIn > 0 : Math.abs(b.moneyOut - s.moneyOut) < 0.005 && b.moneyOut > 0;
      if (!same) return;
      const gap = Math.abs(dayNo(b.day) - sd);
      if (gap <= toleranceDays && gap < bestGap) { best = i; bestGap = gap; }
    });
    if (best >= 0) {
      used[best] = true;
      matched.push({ statement: s, book: books[best], dayGap: bestGap });
    } else onlyStatement.push(s);
  }
  const first = statement.reduce((a, s) => (s.day < a ? s.day : a), statement[0]?.day ?? "");
  const last = statement.reduce((a, s) => (s.day > a ? s.day : a), statement[0]?.day ?? "");
  const onlyBooks = books.filter((b, i) => !used[i] && b.day >= first && b.day <= last);
  const sum = <T>(xs: T[], f: (x: T) => number) => round2(xs.reduce((a, x) => a + f(x), 0));
  return {
    matched,
    onlyStatement,
    onlyBooks,
    totals: {
      statementIn: sum(statement, (s) => s.moneyIn), statementOut: sum(statement, (s) => s.moneyOut),
      booksIn: sum(books.filter((b) => b.day >= first && b.day <= last), (b) => b.moneyIn), booksOut: sum(books.filter((b) => b.day >= first && b.day <= last), (b) => b.moneyOut),
      unmatchedStatementIn: sum(onlyStatement, (s) => s.moneyIn), unmatchedStatementOut: sum(onlyStatement, (s) => s.moneyOut),
      unmatchedBooksIn: sum(onlyBooks, (b) => b.moneyIn), unmatchedBooksOut: sum(onlyBooks, (b) => b.moneyOut),
    },
  };
}
