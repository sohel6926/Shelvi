/**
 * Module 6a (20 Nov 2026) — a refund is asked for by a manager and paid only after the owner approves (spec: no silent
 * payment edits; prepare → approve → pay). Pure rules; tested in test/module6a.test.ts. The owner can still refund
 * directly (refundOrAdjust).
 */
export type RefundRequestProblem = "" | "bad-amount" | "more-than-paid" | "already-asked";

export function refundRequestProblem(x: { amount: number; paid: number; pendingForInvoice: number }): RefundRequestProblem {
  if (!(x.amount >= 0.01) || !Number.isFinite(x.amount)) return "bad-amount";
  if (x.amount > x.paid + 0.005) return "more-than-paid";
  if (x.pendingForInvoice > 0) return "already-asked";
  return "";
}

export const REFUND_REQUEST_TEXT: Record<Exclude<RefundRequestProblem, "">, { te: string; en: string }> = {
  "bad-amount": { te: "సరైన మొత్తం ఇవ్వండి.", en: "Enter a valid amount." },
  "more-than-paid": { te: "చెల్లించిన దాని కంటే ఎక్కువ తిరిగి ఇవ్వలేము.", en: "Can't refund more than was paid." },
  "already-asked": { te: "ఈ invoice కు ఇప్పటికే ఒక refund అభ్యర్థన ఆమోదం కోసం ఆగి ఉంది.", en: "A refund request for this invoice is already waiting for approval." },
};

export type RefundDecideProblem = "" | "not-pending" | "reason-needed";
export function refundDecideProblem(x: { status: string; approve: boolean; note: string }): RefundDecideProblem {
  if (x.status !== "pending") return "not-pending";
  if (!x.approve && x.note.trim() === "") return "reason-needed";
  return "";
}
