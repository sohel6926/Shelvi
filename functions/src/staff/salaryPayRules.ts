/**
 * Module 4e (19 Nov 2026) — paying salaries. Pure rules; tested in test/module4i.test.ts.
 *
 * finalizePayroll fixes what each person is owed for a month (the payslip, payroll/{month}_{staffId}). Until now
 * nothing recorded the money actually handed over, so "Salaries payable" in the books only grew. A salary payment
 * (salaryPayments/{id}) is that hand-over: who, which month, how much, which day, cash or bank. It can be paid in
 * parts; the payslip keeps the running total.
 */
export const SALARY_PAY_METHODS = ["Cash", "UPI", "BankTransfer", "Other"] as const;
export type SalaryPayMethod = (typeof SALARY_PAY_METHODS)[number];

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** What is still to be handed over on a payslip (never below 0; a negative net means the staff member owes). */
export function salaryBalance(net: number, paid: number): number {
  return r2(Math.max(0, r2(net) - r2(Math.max(0, paid))));
}

export type SalaryPaidStatus = "unpaid" | "partial" | "paid";
export function salaryPaidStatus(net: number, paid: number): SalaryPaidStatus {
  if (r2(Math.max(0, paid)) <= 0) return net <= 0 ? "paid" : "unpaid";
  return salaryBalance(net, paid) <= 0.005 ? "paid" : "partial";
}

/** Why a payment cannot be recorded ("" = it can). */
export function salaryPayProblem(slip: { exists: boolean; finalized: boolean; net: number; paid: number }, amount: number): "" | "not-finalized" | "nothing-due" | "too-much" | "bad-amount" {
  if (!(amount > 0) || !Number.isFinite(amount)) return "bad-amount";
  if (!slip.exists || !slip.finalized) return "not-finalized";
  const due = salaryBalance(slip.net, slip.paid);
  if (due <= 0) return "nothing-due";
  if (r2(amount) > due + 0.005) return "too-much";
  return "";
}

/** The payslip's running total after a payment is added (+) or cancelled (−). */
export function paidAfter(paid: number, change: number): number {
  return r2(Math.max(0, r2(Math.max(0, paid)) + change));
}
