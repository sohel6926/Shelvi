/** Safe readers for Firestore document fields (documents may be old, partial or hand-edited). */
export type Doc = Record<string, unknown>;

export function asNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asObj(v: unknown): Doc {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Doc) : {};
}

/** Non-negative finite number or 0 — used when summing stored money so one bad doc cannot poison a total. */
export function nonNeg(v: unknown): number {
  const n = asNum(v);
  return n > 0 ? n : 0;
}
