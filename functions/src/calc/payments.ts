import { CalcError, requireFinite, requireNonNeg, round2 } from "./util";

export interface PaymentResult {
  newPaid: number;
  newBalance: number;
  status: "Paid" | "Partially Paid";
}

/** Spec §2. Rejects zero/negative amounts and over-payment. */
export function applyPayment(total: number, paidSoFar: number, amount: number): PaymentResult {
  requireNonNeg("total", total);
  requireNonNeg("paidSoFar", paidSoFar);
  requireFinite("amount", amount);
  if (amount < 0.01) throw new CalcError("Payment amount must be at least ₹0.01");
  const balance = round2(Math.max(0, total - paidSoFar));
  if (amount > balance + 0.005) throw new CalcError(`Payment ₹${amount} is more than the balance ₹${balance}`);
  const newPaid = round2(paidSoFar + amount);
  const newBalance = round2(Math.max(0, total - newPaid));
  return { newPaid, newBalance, status: newBalance === 0 ? "Paid" : "Partially Paid" };
}
