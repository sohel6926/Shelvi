/** Pure: change-history entry contents (api-contract Round 6 B). */
import { Doc } from "./coerce";

export const IGNORED_FIELDS = new Set(["updatedAt", "lastUpdated"]);
export const MAX_DIFF_FIELDS = 20;
export const MAX_DIFF_STRING = 200;

type Simple = number | boolean | string | null;

/** Values shown in a diff: numbers, booleans, strings ≤ 200 chars (missing = null). Anything else is not shown. */
function simple(v: unknown): { ok: true; value: Simple } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v === "number" || typeof v === "boolean") return { ok: true, value: v };
  if (typeof v === "string" && v.length <= MAX_DIFF_STRING) return { ok: true, value: v };
  return { ok: false };
}

/** Deep equality for Firestore values (Timestamps compared by time, objects/arrays by content). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return Number.isNaN(a) && Number.isNaN(b);
  const ta = (a as { toMillis?: () => number }).toMillis;
  const tb = (b as { toMillis?: () => number }).toMillis;
  if (typeof ta === "function" && typeof tb === "function") return (a as { toMillis: () => number }).toMillis() === (b as { toMillis: () => number }).toMillis();
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Doc)[k], (b as Doc)[k]));
}

export interface ChangeSummary {
  action: "create" | "update" | "delete";
  changed: string[];
  diff: Record<string, { before: Simple; after: Simple }>;
  by: string;
}

/**
 * Top-level fields that changed (updatedAt / lastUpdated ignored) and a small diff.
 * Returns null when nothing but ignored fields changed (no history entry).
 * by: updatedBy (update/delete) or createdBy (create); "system" when absent (Cloud Function write).
 */
export function changeSummary(before: Doc | undefined, after: Doc | undefined): ChangeSummary | null {
  if (!before && !after) return null;
  const action = !before ? "create" : !after ? "delete" : "update";
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !IGNORED_FIELDS.has(k)).sort();
  const changed = keys.filter((k) => !sameValue(before?.[k], after?.[k]));
  if (!changed.length) return null;
  const diff: ChangeSummary["diff"] = {};
  for (const k of changed) {
    if (Object.keys(diff).length >= MAX_DIFF_FIELDS) break;
    const b = simple(before?.[k]);
    const a = simple(after?.[k]);
    if (b.ok && a.ok) diff[k] = { before: b.value, after: a.value };
  }
  const who = action === "create" ? after?.createdBy : action === "update" ? after?.updatedBy : before?.updatedBy;
  return { action, changed, diff, by: typeof who === "string" && who ? who : "system" };
}
