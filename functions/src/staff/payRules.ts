/**
 * Module 4d step 5 (19 Nov 2026) — pay figures live apart from the staff document. Pure rules; tested in
 * test/module4g.test.ts.
 *
 * Why: a branch manager can read staff/{id} (names are needed to plan work), and Firestore cannot hide one field of
 * a document. So dailyWage / monthlySalary are kept in staff/{id}/private/pay, which only the owner reads.
 * payType ("daily" / "monthly") is not a figure and stays on the staff document.
 */
export const PAY_FIELDS = ["dailyWage", "monthlySalary"] as const;
export interface StaffPay {
  dailyWage: number;
  monthlySalary: number;
}
type AnyDoc = Record<string, unknown>;
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Does the staff document itself still carry a pay figure (old data, an import, the phone's edit screen)? */
export const hasPayFields = (staff: AnyDoc | undefined): boolean => !!staff && PAY_FIELDS.some((f) => f in staff);

/**
 * The pay of one person. A figure still sitting on the staff document is the newest write (the mover has not run
 * yet), so it wins; otherwise the private document; otherwise 0.
 */
export function payOf(staff: AnyDoc | undefined, priv: AnyDoc | undefined): StaffPay {
  const pick = (f: (typeof PAY_FIELDS)[number]) => (staff && f in staff ? n(staff[f]) : n(priv?.[f]));
  return { dailyWage: pick("dailyWage"), monthlySalary: pick("monthlySalary") };
}

/** What the mover writes into the private document: only the figures that are on the staff document. */
export function payToMove(staff: AnyDoc): Partial<StaffPay> {
  const out: Partial<StaffPay> = {};
  for (const f of PAY_FIELDS) if (f in staff) out[f] = n(staff[f]);
  return out;
}
