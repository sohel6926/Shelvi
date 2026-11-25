export type CounterKind = "quotation" | "invoice";

const PREFIX: Record<CounterKind, string> = { quotation: "SC-Q", invoice: "SC-INV" };

/** SC-INV-2026-0001 — 4 digits minimum, grows past 9999 without breaking. */
export function formatDocNumber(kind: CounterKind, year: number, n: number): string {
  return `${PREFIX[kind]}-${year}-${String(n).padStart(4, "0")}`;
}
