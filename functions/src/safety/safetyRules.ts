/**
 * Module 5e (19 Nov 2026) — food safety part 2 (spec §44 and X10): checklists, checks and incidents. Pure rules;
 * tested in test/module5e.test.ts.
 *
 * The spec forbids inventing checkpoints or limits ("Do not invent food-safety temperature limits or statutory
 * thresholds; use Owner Configuration"). So the CRM ships with NO checklist: the owner writes each checklist and its
 * lines in settings.foodSafety, and gives the allowed range of a measured line himself. A check is one filled-in
 * checklist; it passes only when every line is answered and fine. An incident is a food problem someone reports.
 */
type AnyDoc = Record<string, unknown>;
export type Res<T> = { ok: true; value: T } | { ok: false; te: string; en: string };
const bad = (te: string, en: string) => ({ ok: false as const, te, en });
const text = (d: AnyDoc, f: string, max: number): string => (typeof d[f] === "string" ? (d[f] as string).trim().replace(/\s+/g, " ").slice(0, max) : "");
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

export const CHECK_KINDS = ["hygiene", "cleaning", "temperature", "tasting", "storage", "transport", "other"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];
export const ITEM_TYPES = ["yesno", "number"] as const;

export interface ChecklistItem {
  key: string;
  te: string;
  en: string;
  type: "yesno" | "number";
  /** for a measured line: the allowed range, as the owner gave it (null = no limit on that side) */
  min: number | null;
  max: number | null;
  unit: string;
}
export interface Checklist {
  id: string;
  kind: CheckKind;
  te: string;
  en: string;
  active: boolean;
  /** "HH:MM" (IST): the owner wants this check done every day by this time. "" = no reminder. Never set by the CRM itself. */
  dailyBy: string;
  items: ChecklistItem[];
}
export interface FoodSafetyConfig {
  checklists: Checklist[];
}
export const DEFAULT_FOOD_SAFETY: FoodSafetyConfig = { checklists: [] };
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseItem(raw: unknown, n: number): Res<ChecklistItem> {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as AnyDoc;
  const te = text(d, "te", 200);
  const en = text(d, "en", 200) || te;
  if (!te && !en) return bad(`${n} వ వరుసకు పేరు రాయండి.`, `Line ${n} needs a name.`);
  const type = d.type === "number" ? "number" : "yesno";
  const min = type === "number" ? numOrNull(d.min) : null;
  const max = type === "number" ? numOrNull(d.max) : null;
  if (min !== null && max !== null && min > max) return bad(`${n} వ వరుసలో కనిష్టం గరిష్టం కంటే ఎక్కువ ఉంది.`, `Line ${n}: the lowest allowed value is above the highest.`);
  const key = text(d, "key", 40);
  return { ok: true, value: { key: ID_RE.test(key) ? key : `i${n}`, te: te || en, en, type, min, max, unit: type === "number" ? text(d, "unit", 12) : "" } };
}

export function parseFoodSafety(raw: unknown): Res<FoodSafetyConfig> {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as AnyDoc;
  if (!Array.isArray(d.checklists)) return bad("చెక్‌లిస్ట్‌ల జాబితా సరిగా లేదు.", "The list of checklists is not valid.");
  if (d.checklists.length > 30) return bad("30 చెక్‌లిస్ట్‌ల వరకే పెట్టగలరు.", "Up to 30 checklists are allowed.");
  const out: Checklist[] = [];
  const seen = new Set<string>();
  for (const [i, rawList] of d.checklists.entries()) {
    const c = (typeof rawList === "object" && rawList !== null ? rawList : {}) as AnyDoc;
    const te = text(c, "te", 120);
    const en = text(c, "en", 120) || te;
    if (!te && !en) return bad(`${i + 1} వ చెక్‌లిస్ట్‌కు పేరు రాయండి.`, `Checklist ${i + 1} needs a name.`);
    const rawItems = Array.isArray(c.items) ? c.items : [];
    if (rawItems.length === 0) return bad(`"${te || en}" లో కనీసం ఒక వరుస ఉండాలి.`, `"${en || te}" needs at least one line.`);
    if (rawItems.length > 40) return bad(`"${te || en}" లో 40 వరుసల వరకే.`, `"${en || te}" can have up to 40 lines.`);
    const items: ChecklistItem[] = [];
    const keys = new Set<string>();
    for (const [n, r] of rawItems.entries()) {
      const it = parseItem(r, n + 1);
      if (!it.ok) return it;
      let key = it.value.key;
      while (keys.has(key)) key = `${key}x`;
      keys.add(key);
      items.push({ ...it.value, key });
    }
    let id = text(c, "id", 40);
    if (!ID_RE.test(id)) id = `c${i + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    const dailyBy = typeof c.dailyBy === "string" ? c.dailyBy.trim() : "";
    if (dailyBy !== "" && !TIME_RE.test(dailyBy)) return bad(`"${te || en}": సమయం గంట:నిమిషం రూపంలో రాయండి (ఉదా 09:30).`, `"${en || te}": write the time as HH:MM (for example 09:30).`);
    out.push({ id, kind: (CHECK_KINDS as readonly string[]).includes(c.kind as string) ? (c.kind as CheckKind) : "other", te: te || en, en, active: c.active !== false, dailyBy, items });
  }
  return { ok: true, value: { checklists: out } };
}
export function normalizeFoodSafety(raw: unknown): FoodSafetyConfig {
  const r = parseFoodSafety(raw);
  return r.ok ? r.value : DEFAULT_FOOD_SAFETY;
}

export interface CheckAnswer {
  key: string;
  te: string;
  en: string;
  type: "yesno" | "number";
  /** yes / no line: the answer. measured line: within the owner's range */
  ok: boolean;
  value: number | null;
  unit: string;
  min: number | null;
  max: number | null;
}

/** Fills a checklist with the answers given. Every line must be answered; a measured line needs a number. */
export function evaluateCheck(list: Checklist, answers: unknown): Res<{ answers: CheckAnswer[]; result: "pass" | "fail"; failed: number }> {
  const a = (typeof answers === "object" && answers !== null ? answers : {}) as AnyDoc;
  const out: CheckAnswer[] = [];
  for (const it of list.items) {
    const v = a[it.key];
    if (it.type === "yesno") {
      if (typeof v !== "boolean") return bad(`"${it.te}" కి అవును / కాదు చెప్పండి.`, `Answer yes or no for "${it.en}".`);
      out.push({ key: it.key, te: it.te, en: it.en, type: "yesno", ok: v, value: null, unit: "", min: null, max: null });
    } else {
      if (typeof v !== "number" || !Number.isFinite(v)) return bad(`"${it.te}" కి అంకె రాయండి.`, `Enter a number for "${it.en}".`);
      const value = Math.round(v * 100) / 100;
      const ok = (it.min === null || value >= it.min) && (it.max === null || value <= it.max);
      out.push({ key: it.key, te: it.te, en: it.en, type: "number", ok, value, unit: it.unit, min: it.min, max: it.max });
    }
  }
  const failed = out.filter((x) => !x.ok).length;
  return { ok: true, value: { answers: out, result: failed ? "fail" : "pass", failed } };
}

export const INCIDENT_SEVERITIES = ["low", "medium", "high"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export function parseIncident(d: AnyDoc, today: string): Res<{ what: string; severity: IncidentSeverity; day: string; bookingId: string; itemId: string; batchId: string; action: string }> {
  const what = text(d, "what", 1000);
  if (what.length < 5) return bad("ఏం జరిగిందో రాయండి.", "Describe what happened.");
  const day = typeof d.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.day) ? d.day : today;
  if (day > today) return bad("భవిష్యత్తు తేదీ పెట్టలేరు.", "The date cannot be in the future.");
  const id = (f: string) => { const v = text(d, f, 200); return v.includes("/") ? "" : v; };
  return { ok: true, value: { what, severity: (INCIDENT_SEVERITIES as readonly string[]).includes(d.severity as string) ? (d.severity as IncidentSeverity) : "medium", day, bookingId: id("bookingId"), itemId: id("itemId"), batchId: id("batchId"), action: text(d, "action", 500) } };
}

export interface MissedCheck {
  checklistId: string;
  branchId: string;
  te: string;
  en: string;
  dailyBy: string;
}
/**
 * Reminders for checks not done (X38). Only a checklist the owner gave a "daily by" time is watched; the CRM sets no
 * time itself. After that time, a branch that has not filled that checklist today is "missed". `doneToday` holds
 * "branchId|checklistId" for every check already saved today (pass or fail — the check was done).
 */
export function missedChecks(cfg: FoodSafetyConfig, branchIds: string[], doneToday: ReadonlySet<string>, nowTime: string): MissedCheck[] {
  const out: MissedCheck[] = [];
  for (const l of cfg.checklists) {
    if (!l.active || !l.dailyBy || nowTime < l.dailyBy) continue;
    for (const b of branchIds) if (!doneToday.has(`${b}|${l.id}`)) out.push({ checklistId: l.id, branchId: b, te: l.te, en: l.en, dailyBy: l.dailyBy });
  }
  return out;
}
