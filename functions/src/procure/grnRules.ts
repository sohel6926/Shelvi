/**
 * Module 3b (18 Nov 2026) — goods receipt (GRN) against a purchase order: pure rules, tested in test/module3b.test.ts.
 * For every order line the store notes what was delivered, what was accepted and what was sent back (with a reason).
 * Accepted goods go into stock at once; the vendor's bill is matched later (Module 3c).
 */
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { isValidDay } from "../shared/istDate";
import { ProcureLine, Res, round2 } from "./procureRules";

const bad = (te: string, en: string) => ({ ok: false as const, te, en });
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const isQty0 = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000000 && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

export interface GrnLine {
  /** index of the line on the order */
  line: number;
  description: string;
  unit: string;
  rate: number;
  inventoryItemId: string;
  groceryItemId: string;
  ordered: number;
  /** accepted on earlier receipts */
  before: number;
  delivered: number;
  accepted: number;
  rejected: number;
  rejectReason: string;
  /** still to come after this receipt */
  short: number;
  expiryDay: string;
  batchNo: string;
}

export interface GoodsReceiptInput {
  receiveDay: string;
  vendorBillNo: string;
  note: string;
  lines: GrnLine[];
}

export function parseGoodsReceipt(d: Doc, poLines: ProcureLine[], receivedSoFar: number[], today: string): Res<GoodsReceiptInput> {
  const receiveDay = asStr(d.receiveDay) || today;
  if (!isValidDay(receiveDay)) return bad("సరుకు అందిన తేదీ సరిగా లేదు.", "The receipt date is not valid.");
  if (receiveDay > today) return bad("సరుకు అందిన తేదీ రేపటిది కాకూడదు.", "The receipt date can't be in the future.");
  const vendorBillNo = asStr(d.vendorBillNo).trim();
  if (vendorBillNo.length > 40) return bad("బిల్ / చలాన్ నంబర్ 40 అక్షరాల లోపు ఉండాలి.", "The bill / challan number must be up to 40 letters.");
  const note = asStr(d.note).trim();
  if (note.length > 500) return bad("గమనిక 500 అక్షరాల లోపు ఉండాలి.", "The note must be up to 500 letters.");
  if (!Array.isArray(d.lines)) return bad("అందిన సరుకు వివరాలు రాయండి.", "Enter what was received.");
  const seen = new Set<number>();
  const out: GrnLine[] = [];
  for (const raw of asArr(d.lines)) {
    const r = asObj(raw);
    const i = r.line;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= poLines.length) return bad("ఆర్డర్‌లో లేని వస్తువు ఉంది.", "A line is not on the order.");
    if (seen.has(i)) return bad("ఒకే వస్తువు రెండుసార్లు ఉంది.", "The same line is listed twice.");
    seen.add(i);
    const po = poLines[i];
    const n = `${po.description}`;
    if (!isQty0(r.delivered) || !isQty0(r.accepted)) return bad(`${n}: పరిమాణం సరిగా లేదు (0 లేదా ఎక్కువ, 3 దశాంశాల వరకు).`, `${n}: the quantity is not valid (0 or more, up to 3 decimals).`);
    const delivered = r.delivered;
    const accepted = r.accepted;
    if (delivered === 0) continue; // nothing came for this line today
    if (accepted > delivered + 1e-9) return bad(`${n}: తీసుకున్నది వచ్చిన దానికంటే ఎక్కువ ఉండకూడదు.`, `${n}: accepted can't be more than delivered.`);
    const rejected = round3(delivered - accepted);
    const rejectReason = asStr(r.rejectReason).trim().slice(0, 200);
    if (rejected > 0 && !rejectReason) return bad(`${n}: తిప్పి పంపిన దానికి కారణం రాయండి.`, `${n}: give a reason for what was sent back.`);
    const before = round3(receivedSoFar[i] ?? 0);
    const outstanding = round3(Math.max(0, po.qty - before));
    if (accepted > outstanding + 1e-9) {
      return bad(
        `${n}: ఆర్డర్‌లో ఇంకా రావలసింది ${outstanding} ${po.unit} మాత్రమే. ఎక్కువ వచ్చినది తిప్పి పంపండి లేదా కొత్త ఆర్డర్ రాయండి.`,
        `${n}: only ${outstanding} ${po.unit} is still due on the order. Send the extra back or write a new order.`,
      );
    }
    const expiryDay = asStr(r.expiryDay);
    if (expiryDay && !isValidDay(expiryDay)) return bad(`${n}: గడువు తేదీ సరిగా లేదు.`, `${n}: the expiry date is not valid.`);
    if (expiryDay && accepted > 0 && expiryDay < receiveDay) return bad(`${n}: గడువు దాటిన సరుకు తీసుకోకూడదు — తిప్పి పంపండి.`, `${n}: goods past their expiry date can't be accepted — send them back.`);
    out.push({
      line: i, description: po.description, unit: po.unit, rate: po.rate, inventoryItemId: po.inventoryItemId, groceryItemId: po.groceryItemId,
      ordered: po.qty, before, delivered, accepted, rejected, rejectReason: rejected > 0 ? rejectReason : "", short: round3(Math.max(0, po.qty - before - accepted)),
      expiryDay: accepted > 0 ? expiryDay : "", batchNo: accepted > 0 && expiryDay ? asStr(r.batchNo).trim().slice(0, 40) : "",
    });
  }
  if (out.length === 0) return bad("కనీసం ఒక వస్తువుకి వచ్చిన పరిమాణం రాయండి.", "Enter the delivered quantity for at least one item.");
  return { ok: true, value: { receiveDay, vendorBillNo, note, lines: out } };
}

/** Accepted so far per order line, after this receipt. */
export function receivedAfter(lineCount: number, receivedSoFar: number[], lines: Pick<GrnLine, "line" | "accepted">[]): number[] {
  const out = Array.from({ length: lineCount }, (_, i) => round3(receivedSoFar[i] ?? 0));
  for (const l of lines) out[l.line] = round3(out[l.line] + l.accepted);
  return out;
}

/** Order status from what has been accepted so far. */
export function poStatusAfter(ordered: number[], received: number[]): "approved" | "partReceived" | "received" {
  if (ordered.length > 0 && ordered.every((q, i) => (received[i] ?? 0) >= q - 1e-6)) return "received";
  return received.some((q) => q > 0) ? "partReceived" : "approved";
}

/** Value of the accepted goods at the order's rates (what the vendor may bill for this receipt). */
export const acceptedValue = (lines: Pick<GrnLine, "accepted" | "rate">[]) => round2(lines.reduce((s, l) => s + round2(l.accepted * l.rate), 0));

/** An order that will not be completed can be closed once something was received. */
export const canCloseShort = (status: string) => status === "partReceived";
