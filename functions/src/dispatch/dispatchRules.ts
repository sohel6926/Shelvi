/**
 * Module 5f (20 Nov 2026) — packing and dispatch of an event (spec §32 Packing Engine, §33 Dispatch, TWF #08 rule 7,
 * the logistics trip flow, schema A12: packing_line / dispatch / dispatch_line / venue_receipt). Pure rules; tested
 * in test/module5f.test.ts.
 *
 * One dispatch = one load for one event (and session): what was packed, the load check, the vehicle, leaving,
 * the venue's receipt, what came back, and the reconciliation of what did not.
 *   packing -> packed -> loaded -> dispatched -> delivered -> returned -> reconciled        (or cancelled)
 * Frozen rules kept: every step records who did it and when (TWF #08 rule 7; trip rule 3); a load list holds food,
 * containers and equipment (trip rule 2); a missing or damaged returnable is written down as a shortage with a
 * reason — it never silently reduces stock (trip rule 6).
 */
type AnyDoc = Record<string, unknown>;
export type Res<T> = { ok: true; value: T } | { ok: false; te: string; en: string };
const bad = (te: string, en: string) => ({ ok: false as const, te, en });
const text = (d: AnyDoc, f: string, max: number): string => (typeof d[f] === "string" ? (d[f] as string).trim().replace(/\s+/g, " ").slice(0, max) : "");
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const qtyOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000000 ? r3(v) : null);

export const LINE_KINDS = ["food", "container", "equipment"] as const;
export type LineKind = (typeof LINE_KINDS)[number];
/** Containers and equipment come back; food does not. */
export const isReturnable = (kind: string): boolean => kind === "container" || kind === "equipment";

export interface DispatchLine {
  line: number;
  kind: LineKind;
  name: string;
  qty: number;
  unit: string;
  /** vessel / box the food is in, and its seal number, when used */
  container: string;
  seal: string;
  loadedQty: number | null;
  deliveredQty: number | null;
  returnedQty: number | null;
  shortReason: string;
}

export function parseDispatchLines(raw: unknown): Res<DispatchLine[]> {
  if (!Array.isArray(raw) || raw.length === 0) return bad("కనీసం ఒక వస్తువు రాయండి.", "Enter at least one line.");
  if (raw.length > 150) return bad("150 వరుసల వరకే.", "Up to 150 lines.");
  const out: DispatchLine[] = [];
  for (const [i, r] of raw.entries()) {
    const d = (typeof r === "object" && r !== null ? r : {}) as AnyDoc;
    const name = text(d, "name", 120);
    const qty = qtyOf(d.qty);
    if (!name) return bad(`${i + 1} వ వరుసకు పేరు రాయండి.`, `Line ${i + 1} needs a name.`);
    if (qty === null || qty <= 0) return bad(`"${name}" పరిమాణం 0 కంటే ఎక్కువ ఉండాలి.`, `The quantity of "${name}" must be more than 0.`);
    out.push({ line: i + 1, kind: (LINE_KINDS as readonly string[]).includes(d.kind as string) ? (d.kind as LineKind) : "food", name, qty, unit: text(d, "unit", 12), container: text(d, "container", 60), seal: text(d, "seal", 40), loadedQty: null, deliveredQty: null, returnedQty: null, shortReason: "" });
  }
  return { ok: true, value: out };
}

export const DISPATCH_STATUSES = ["packing", "packed", "loaded", "dispatched", "delivered", "returned", "reconciled", "cancelled"] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];
export const DISPATCH_STEPS = ["packed", "loaded", "dispatched", "delivered", "returned", "reconciled"] as const;
export type DispatchStep = (typeof DISPATCH_STEPS)[number];
const BEFORE: Record<DispatchStep, DispatchStatus> = { packed: "packing", loaded: "packed", dispatched: "loaded", delivered: "dispatched", returned: "delivered", reconciled: "returned" };

/** Steps go in order, one at a time. */
export function stepProblem(status: string, step: DispatchStep): "" | "wrong-order" | "closed" {
  if (status === "cancelled" || status === "reconciled") return "closed";
  return BEFORE[step] === status ? "" : "wrong-order";
}
export const canEditLines = (status: string): boolean => status === "packing";
export const canCancelDispatch = (status: string): boolean => status === "packing" || status === "packed" || status === "loaded";

type Qtys = Record<string, unknown>;
const given = (q: Qtys, line: number): number | null => qtyOf(q[String(line)]);

/**
 * The load check: what went on the vehicle, line by line. A line not mentioned is taken as fully loaded. Loading
 * less than was packed needs a note; loading more than was packed is refused.
 */
export function applyLoadCheck(lines: DispatchLine[], loaded: Qtys, note: string): Res<{ lines: DispatchLine[]; short: number }> {
  let short = 0;
  const out: DispatchLine[] = [];
  for (const l of lines) {
    const q = given(loaded, l.line) ?? l.qty;
    if (q > l.qty + 1e-9) return bad(`"${l.name}": ప్యాక్ చేసిన దానికంటే ఎక్కువ లోడ్ చేయలేరు.`, `"${l.name}": more cannot be loaded than was packed.`);
    if (q < l.qty - 1e-9) short++;
    out.push({ ...l, loadedQty: q });
  }
  if (short > 0 && !note.trim()) return bad("కొన్ని వస్తువులు పూర్తిగా లోడ్ కాలేదు — కారణం రాయండి.", "Some lines were not fully loaded — give the reason.");
  return { ok: true, value: { lines: out, short } };
}

/** The venue's receipt: what arrived. A line not mentioned arrived as loaded; more than was loaded is refused. */
export function applyDelivery(lines: DispatchLine[], delivered: Qtys): Res<DispatchLine[]> {
  const out: DispatchLine[] = [];
  for (const l of lines) {
    const loadedQty = l.loadedQty ?? l.qty;
    const q = given(delivered, l.line) ?? loadedQty;
    if (q > loadedQty + 1e-9) return bad(`"${l.name}": లోడ్ చేసిన దానికంటే ఎక్కువ అందలేదు.`, `"${l.name}": more cannot arrive than was loaded.`);
    out.push({ ...l, deliveredQty: q });
  }
  return { ok: true, value: out };
}

/** The return: what came back of the returnable lines. Every returnable line must be counted. */
export function applyReturn(lines: DispatchLine[], returned: Qtys): Res<DispatchLine[]> {
  const out: DispatchLine[] = [];
  for (const l of lines) {
    if (!isReturnable(l.kind)) {
      out.push({ ...l, returnedQty: null });
      continue;
    }
    const sent = l.deliveredQty ?? l.loadedQty ?? l.qty;
    const q = given(returned, l.line);
    if (q === null) return bad(`"${l.name}" ఎన్ని తిరిగి వచ్చాయో రాయండి.`, `Enter how many of "${l.name}" came back.`);
    if (q > sent + 1e-9) return bad(`"${l.name}": పంపిన దానికంటే ఎక్కువ తిరిగి రాలేదు.`, `"${l.name}": more cannot come back than was sent.`);
    out.push({ ...l, returnedQty: q });
  }
  return { ok: true, value: out };
}

export interface Shortage {
  line: number;
  name: string;
  kind: LineKind;
  missing: number;
  unit: string;
  reason: string;
}
/** What was sent and did not come back. */
export function shortagesOf(lines: DispatchLine[]): Shortage[] {
  return lines
    .filter((l) => isReturnable(l.kind))
    .map((l) => ({ line: l.line, name: l.name, kind: l.kind, unit: l.unit, reason: l.shortReason, missing: r3((l.deliveredQty ?? l.loadedQty ?? l.qty) - (l.returnedQty ?? 0)) }))
    .filter((s) => s.missing > 0);
}

/** Reconciliation: every shortage needs its reason (lost, damaged, left at the venue to collect …). */
export function applyReconcile(lines: DispatchLine[], reasons: Record<string, unknown>): Res<{ lines: DispatchLine[]; shortages: Shortage[] }> {
  const out = lines.map((l) => ({ ...l }));
  for (const s of shortagesOf(out)) {
    const why = typeof reasons[String(s.line)] === "string" ? (reasons[String(s.line)] as string).trim().slice(0, 200) : "";
    if (!why) return bad(`"${s.name}" ${s.missing} తిరిగి రాలేదు — కారణం రాయండి.`, `${s.missing} of "${s.name}" did not come back — give the reason.`);
    out.find((l) => l.line === s.line)!.shortReason = why;
  }
  return { ok: true, value: { lines: out, shortages: shortagesOf(out) } };
}

/** DSP-261120-001 */
export const dispatchNumber = (day: string, n: number): string => `DSP-${day.slice(2).replace(/-/g, "")}-${String(Math.max(1, Math.floor(n))).padStart(3, "0")}`;
