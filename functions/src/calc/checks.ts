export type InvoiceProblem = "paid-mismatch" | "balance-mismatch" | "overpaid" | "negative";

/** Spec §10. Nightly consistency check of one invoice against its payments. */
export function checkInvoice(inv: { total: number; amountPaid: number; balanceDue: number }, payments: number[]): InvoiceProblem[] {
  const problems: InvoiceProblem[] = [];
  const sum = payments.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - inv.amountPaid) > 0.01) problems.push("paid-mismatch");
  const balBad =
    (Math.abs(inv.total - inv.amountPaid - inv.balanceDue) > 0.01 && inv.balanceDue > 0) ||
    (inv.balanceDue > 0.01 && inv.amountPaid >= inv.total);
  if (balBad) problems.push("balance-mismatch");
  if (inv.amountPaid > inv.total + 0.01) problems.push("overpaid");
  if ([inv.total, inv.amountPaid, inv.balanceDue, ...payments].some((x) => x < 0)) problems.push("negative");
  return problems;
}
