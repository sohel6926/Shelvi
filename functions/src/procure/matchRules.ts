/**
 * Module 3c (19 Nov 2026) — three-way match: order (PO) × goods received (GRN) × vendor bill. Pure rules, tested in
 * test/module3c.test.ts. A bill may charge only for goods that were accepted and not billed before, at no more than
 * the order's rate. Anything else is a mismatch and the bill is held from payment until the owner releases it.
 */
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { isValidDay } from "../shared/istDate";
import { ProcureLine, Res, round2 } from "./procureRules";

const bad = (te: string, en: string) => ({ ok: false as const, te, en });
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export interface BillLine {
  line: number;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  /** from the order, for the match */
  poRate: number;
}

export interface VendorBillInput {
  billNo: string;
  billDay: string;
  note: string;
  otherCharges: number;
  discount: number;
  lines: BillLine[];
  subtotal: number;
  total: number;
}

export function parseVendorBill(d: Doc, poLines: ProcureLine[], today: string): Res<VendorBillInput> {
  const billNo = asStr(d.billNo).trim();
  if (!billNo || billNo.length > 40) return bad("సరఫరాదారు బిల్ నంబర్ రాయండి (40 అక్షరాల లోపు).", "Give the vendor's bill number (up to 40 letters).");
  const billDay = asStr(d.billDay) || today;
  if (!isValidDay(billDay)) return bad("బిల్ తేదీ సరిగా లేదు.", "The bill date is not valid.");
  if (billDay > today) return bad("బిల్ తేదీ రేపటిది కాకూడదు.", "The bill date can't be in the future.");
  const note = asStr(d.note).trim();
  if (note.length > 500) return bad("గమనిక 500 అక్షరాల లోపు ఉండాలి.", "The note must be up to 500 letters.");
  const money = (v: unknown) => (v === undefined || v === null ? 0 : typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10000000 ? round2(v) : NaN);
  const otherCharges = money(d.otherCharges);
  const discount = money(d.discount);
  if (Number.isNaN(otherCharges) || Number.isNaN(discount)) return bad("ఇతర ఛార్జీలు / తగ్గింపు సరిగా లేవు.", "Other charges / discount are not valid.");
  if (!Array.isArray(d.lines)) return bad("బిల్‌లోని వస్తువులు రాయండి.", "Enter the bill's lines.");
  const seen = new Set<number>();
  const lines: BillLine[] = [];
  for (const raw of asArr(d.lines)) {
    const r = asObj(raw);
    const i = r.line;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= poLines.length) return bad("ఆర్డర్‌లో లేని వస్తువు ఉంది.", "A line is not on the order.");
    if (seen.has(i)) return bad("ఒకే వస్తువు రెండుసార్లు ఉంది.", "The same line is listed twice.");
    seen.add(i);
    const po = poLines[i];
    if (typeof r.qty !== "number" || !Number.isFinite(r.qty) || r.qty < 0 || r.qty > 1000000 || Math.abs(r.qty * 1000 - Math.round(r.qty * 1000)) > 1e-6) return bad(`${po.description}: పరిమాణం సరిగా లేదు.`, `${po.description}: the quantity is not valid.`);
    if (r.qty === 0) continue;
    if (typeof r.rate !== "number" || !Number.isFinite(r.rate) || r.rate <= 0 || r.rate > 10000000) return bad(`${po.description}: ధర 0 కంటే ఎక్కువ రాయండి.`, `${po.description}: the rate must be above 0.`);
    const rate = round2(r.rate);
    lines.push({ line: i, description: po.description, unit: po.unit, qty: r.qty, rate, amount: round2(r.qty * rate), poRate: po.rate });
  }
  if (lines.length === 0) return bad("కనీసం ఒక వస్తువుకి బిల్ పరిమాణం రాయండి.", "Enter the billed quantity for at least one item.");
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const total = round2(subtotal + otherCharges - discount);
  if (total <= 0) return bad("బిల్ మొత్తం 0 కంటే ఎక్కువ ఉండాలి.", "The bill total must be above 0.");
  return { ok: true, value: { billNo, billDay, note, otherCharges, discount, lines, subtotal, total } };
}

export interface BillMatchConfig {
  /** a bill rate may be above the order rate by this % without a mismatch (0–20, default 0) */
  rateTolerancePct: number;
}
export const DEFAULT_BILL_MATCH: BillMatchConfig = { rateTolerancePct: 0 };
export function normalizeBillMatch(raw: unknown): BillMatchConfig {
  const v = asObj(raw).rateTolerancePct;
  return { rateTolerancePct: typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 20 ? v : DEFAULT_BILL_MATCH.rateTolerancePct };
}
export function parseBillMatchPatch(v: unknown): { ok: true; value: BillMatchConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "billMatch must be an object." };
  const t = (v as Doc).rateTolerancePct;
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 20) return { ok: false, error: "billMatch.rateTolerancePct must be a number from 0 to 20." };
  return { ok: true, value: { rateTolerancePct: t } };
}

export type MatchIssueKind = "qty-over" | "rate-over" | "charges";
export interface MatchIssue {
  kind: MatchIssueKind;
  line: number;
  te: string;
  en: string;
  /** ₹ the bill asks for beyond what the order and receipts support */
  extra: number;
}

export interface MatchResult {
  status: "matched" | "mismatch";
  issues: MatchIssue[];
  /** ₹ that the order and receipts support for the billed lines */
  supported: number;
  extra: number;
}

/**
 * `accepted[i]` = accepted on receipts so far, `billedBefore[i]` = quantity on earlier live bills of the same order.
 * Other charges that the order did not mention are flagged too (the owner decides).
 */
export function matchBill(bill: Pick<VendorBillInput, "lines" | "otherCharges">, accepted: number[], billedBefore: number[], cfg: BillMatchConfig): MatchResult {
  const issues: MatchIssue[] = [];
  let supported = 0;
  for (const l of bill.lines) {
    const canBill = round3(Math.max(0, (accepted[l.line] ?? 0) - (billedBefore[l.line] ?? 0)));
    const okQty = Math.min(l.qty, canBill);
    const okRate = Math.min(l.rate, l.poRate);
    supported = round2(supported + round2(okQty * okRate));
    if (l.qty > canBill + 1e-9) {
      const over = round3(l.qty - canBill);
      issues.push({
        kind: "qty-over", line: l.line, extra: round2(over * l.rate),
        te: `${l.description}: బిల్‌లో ${l.qty} ${l.unit}, కానీ తీసుకున్నది (ఇంకా బిల్ కానిది) ${canBill} ${l.unit} మాత్రమే`,
        en: `${l.description}: billed ${l.qty} ${l.unit}, but only ${canBill} ${l.unit} was accepted and not billed yet`,
      });
    }
    const limit = round2(l.poRate * (1 + cfg.rateTolerancePct / 100));
    if (l.rate > limit + 0.005) {
      issues.push({
        kind: "rate-over", line: l.line, extra: round2(Math.min(l.qty, canBill) * (l.rate - l.poRate)),
        te: `${l.description}: బిల్ ధర ₹${l.rate}, ఆర్డర్ ధర ₹${l.poRate}`,
        en: `${l.description}: bill rate ₹${l.rate}, order rate ₹${l.poRate}`,
      });
    }
  }
  if (bill.otherCharges > 0.005) issues.push({ kind: "charges", line: -1, extra: bill.otherCharges, te: `ఆర్డర్‌లో లేని ఇతర ఛార్జీలు ₹${bill.otherCharges}`, en: `Other charges of ₹${bill.otherCharges} that are not on the order` });
  const extra = round2(issues.reduce((s, x) => s + x.extra, 0));
  return { status: issues.length ? "mismatch" : "matched", issues, supported, extra };
}

/** Quantity billed so far per order line, from the live bills of the order. */
export function billedSoFar(lineCount: number, bills: Doc[]): number[] {
  const out = Array.from({ length: lineCount }, () => 0);
  for (const b of bills) {
    for (const raw of asArr(b.poLines)) {
      const l = asObj(raw);
      if (typeof l.line === "number" && Number.isInteger(l.line) && l.line >= 0 && l.line < lineCount && typeof l.qty === "number") out[l.line] = round3(out[l.line] + l.qty);
    }
  }
  return out;
}

/** A receipt can be taken back only while no bill has charged for its goods. */
export function canCancelReceipt(receipt: { cancelled: boolean; lines: { line: number; accepted: number }[] }, receivedSoFar: number[], billed: number[]): boolean {
  if (receipt.cancelled) return false;
  return receipt.lines.every((l) => round3((receivedSoFar[l.line] ?? 0) - l.accepted) >= (billed[l.line] ?? 0) - 1e-9);
}
