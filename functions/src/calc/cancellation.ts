/** Round 9 — order cancellation money (calc-spec §19). Pure. */
import { CalcError, requireFinite, requireNonNeg, round2 } from "./util";

export type AdvanceChoice = "refund-all" | "refund-part" | "keep";
export const ADVANCE_CHOICES: AdvanceChoice[] = ["refund-all", "refund-part", "keep"];

/**
 * paid = what the customer has paid (net of earlier refunds). Nothing paid → no money step (0 / 0).
 *   refund-all : refund = paid
 *   refund-part: ₹0.01 ≤ refundAmount ≤ paid
 *   keep       : refund = 0
 *   charge (cancellation charge, kept as income) = round2(paid − refund)
 */
export function cancellationMoney(paid: number, advance: AdvanceChoice | undefined, refundAmount?: number): { refund: number; charge: number } {
  requireNonNeg("paid", paid);
  const p = round2(paid);
  if (p < 0.01) return { refund: 0, charge: 0 };
  let refund: number;
  if (advance === "refund-all") refund = p;
  else if (advance === "keep") refund = 0;
  else if (advance === "refund-part") {
    if (refundAmount === undefined) throw new CalcError("refundAmount is required for refund-part");
    requireFinite("refundAmount", refundAmount);
    refund = round2(refundAmount);
    if (refund < 0.01) throw new CalcError("refund must be at least ₹0.01");
    if (refund > p + 0.005) throw new CalcError(`refund ₹${refund} cannot be more than the amount paid ₹${p}`);
  } else throw new CalcError("advance must be refund-all, refund-part or keep when the customer has paid");
  return { refund, charge: round2(p - refund) };
}

/** Splits a refund over several invoices, most-paid first, never more than each invoice's paid amount. */
export function allocateRefund(refund: number, paidPerInvoice: { id: string; paid: number }[]): Record<string, number> {
  requireNonNeg("refund", refund);
  let left = round2(refund);
  const out: Record<string, number> = {};
  for (const inv of [...paidPerInvoice].sort((a, b) => b.paid - a.paid || a.id.localeCompare(b.id))) {
    if (left <= 0) break;
    const take = round2(Math.min(left, Math.max(0, inv.paid)));
    if (take > 0) {
      out[inv.id] = take;
      left = round2(left - take);
    }
  }
  if (left > 0.005) throw new CalcError("refund is more than the amount paid on the invoices");
  return out;
}

export const CANCEL_REASONS = ["customer-cancelled", "postponed-no-date", "price", "went-elsewhere", "event-called-off", "our-side", "other"] as const;
export type CancelReasonCode = (typeof CANCEL_REASONS)[number];

export const CANCEL_REASON_TE: Record<CancelReasonCode, string> = {
  "customer-cancelled": "కస్టమర్ రద్దు చేశారు",
  "postponed-no-date": "వాయిదా — తేదీ లేదు",
  price: "ధర ఎక్కువ",
  "went-elsewhere": "వేరే వాళ్ళకి ఇచ్చారు",
  "event-called-off": "శుభకార్యం జరగట్లేదు",
  "our-side": "మా వైపు సమస్య",
  other: "ఇతర",
};

/** Dashboard: "ఈ నెల రద్దులు: N, తిరిగి ఇచ్చింది ₹A, ఉంచుకున్నది ₹B" + reasons breakdown. */
export function cancellationSummary(cancels: { reasonCode: string; refund: number; charge: number }[]): { count: number; refunded: number; kept: number; byReason: Record<string, { count: number; refunded: number; kept: number }> } {
  const byReason: Record<string, { count: number; refunded: number; kept: number }> = {};
  let refunded = 0;
  let kept = 0;
  for (const c of cancels) {
    const r = byReason[c.reasonCode] ?? { count: 0, refunded: 0, kept: 0 };
    r.count += 1;
    r.refunded = round2(r.refunded + Math.max(0, c.refund));
    r.kept = round2(r.kept + Math.max(0, c.charge));
    byReason[c.reasonCode] = r;
    refunded = round2(refunded + Math.max(0, c.refund));
    kept = round2(kept + Math.max(0, c.charge));
  }
  return { count: cancels.length, refunded, kept, byReason };
}
