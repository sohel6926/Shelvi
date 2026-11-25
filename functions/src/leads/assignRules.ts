/**
 * Module 1a (18 Nov 2026) — lead pipeline stages + who gets a new lead. Pure rules, no Firestore.
 * Spec: Master Blueprint p3 / TWF01 (New → Assigned → Contacted → Requirement → Qualified → Quotation Ready → Converted;
 * Lost / Duplicate / Invalid). Our stored codes keep the old ones: "quoted" = Quotation Ready, "won" = Converted,
 * and the catering-only "tasting" stage stays.
 */
import { asArr, asObj, Doc } from "../shared/coerce";

export const LEAD_SOURCES = ["instagram", "facebook", "google", "referral", "walkin", "justdial", "other"] as const;

/** Pipeline order (open stages first, then the closed ones). */
export const LEAD_STATUSES = ["new", "assigned", "contacted", "requirement", "tasting", "qualified", "quoted", "won", "lost", "duplicate", "invalid"] as const;
export type LeadStatusCode = (typeof LEAD_STATUSES)[number];

/** A lead in one of these needs no more follow-up. */
export const LEAD_CLOSED_STATUSES: readonly LeadStatusCode[] = ["won", "lost", "duplicate", "invalid"];

export type LeadAssignMode = "roundRobin" | "rules";

export interface LeadAssignRule {
  source: string;
  uid: string;
}

/** settings/business.leadAssign */
export interface LeadAssignConfig {
  /** on/off switch (default off: the owner picks the people first) */
  auto: boolean;
  /** roundRobin = turn by turn through `pool`; rules = by source first, then turn by turn */
  mode: LeadAssignMode;
  /** user ids that take turns, in order */
  pool: string[];
  rules: LeadAssignRule[];
}

export const DEFAULT_LEAD_ASSIGN: LeadAssignConfig = { auto: false, mode: "roundRobin", pool: [], rules: [] };

const MAX_POOL = 50;
const MAX_RULES = 50;
const isUid = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128 && !v.includes("/");

/** Reads whatever is stored and returns a safe config (bad parts fall back to the default). */
export function normalizeLeadAssign(raw: unknown): LeadAssignConfig {
  const o = asObj(raw);
  const pool = [...new Set(asArr(o.pool).filter(isUid))].slice(0, MAX_POOL);
  const rules = asArr(o.rules)
    .map((r) => asObj(r))
    .filter((r) => (LEAD_SOURCES as readonly string[]).includes(String(r.source)) && isUid(r.uid))
    .map((r) => ({ source: String(r.source), uid: String(r.uid) }))
    .slice(0, MAX_RULES);
  return { auto: o.auto === true, mode: o.mode === "rules" ? "rules" : "roundRobin", pool, rules };
}

/** Strict check of a settings patch value. Returns the config to store, or an English error. */
export function parseLeadAssignPatch(v: unknown): { ok: true; value: LeadAssignConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "leadAssign must be an object." };
  const o = v as Doc;
  if (typeof o.auto !== "boolean") return { ok: false, error: "leadAssign.auto must be true or false." };
  if (o.mode !== "roundRobin" && o.mode !== "rules") return { ok: false, error: "leadAssign.mode must be roundRobin or rules." };
  if (!Array.isArray(o.pool) || o.pool.length > MAX_POOL || !o.pool.every(isUid)) return { ok: false, error: "leadAssign.pool must be a list of user ids." };
  if (new Set(o.pool as string[]).size !== o.pool.length) return { ok: false, error: "leadAssign.pool has the same person twice." };
  const rules = o.rules === undefined ? [] : o.rules;
  if (!Array.isArray(rules) || rules.length > MAX_RULES) return { ok: false, error: "leadAssign.rules must be a list." };
  const seen = new Set<string>();
  for (const r of rules) {
    const x = asObj(r);
    if (!(LEAD_SOURCES as readonly string[]).includes(String(x.source)) || !isUid(x.uid)) return { ok: false, error: "Each leadAssign rule needs a valid source and a user id." };
    if (seen.has(String(x.source))) return { ok: false, error: `leadAssign has two rules for ${String(x.source)}.` };
    seen.add(String(x.source));
  }
  if (o.auto && (o.pool as string[]).length === 0 && rules.length === 0) return { ok: false, error: "Pick at least one person before turning auto-assign on." };
  return { ok: true, value: { auto: o.auto, mode: o.mode, pool: o.pool as string[], rules: rules.map((r) => ({ source: String(asObj(r).source), uid: String(asObj(r).uid) })) } };
}

export interface AssignPick {
  uid: string;
  via: "rule" | "roundRobin";
}

/**
 * Who gets a new lead. `eligible` = user ids that may take leads right now (active admin / manager).
 * `lastUid` = who got the previous turn-by-turn lead. Returns null when auto is off or nobody is eligible.
 * A source rule does not use up a turn (the caller keeps `lastUid` unchanged for via "rule").
 */
export function pickAssignee(lead: { source: string }, cfg: LeadAssignConfig, eligible: readonly string[], lastUid: string): AssignPick | null {
  if (!cfg.auto) return null;
  const ok = new Set(eligible);
  if (cfg.mode === "rules") {
    const rule = cfg.rules.find((r) => r.source === lead.source && ok.has(r.uid));
    if (rule) return { uid: rule.uid, via: "rule" };
  }
  const pool = cfg.pool.filter((u) => ok.has(u));
  if (pool.length === 0) return null;
  // Continue after the last person even when that person has since left the pool.
  const fullIdx = cfg.pool.indexOf(lastUid);
  if (fullIdx === -1) return { uid: pool[0], via: "roundRobin" };
  for (let step = 1; step <= cfg.pool.length; step++) {
    const candidate = cfg.pool[(fullIdx + step) % cfg.pool.length];
    if (ok.has(candidate)) return { uid: candidate, via: "roundRobin" };
  }
  return null;
}

/** May this lead be handed to someone automatically? Only a fresh, live, unassigned lead. */
export function canAutoAssign(lead: Doc | undefined): boolean {
  if (!lead) return false;
  if (lead.cancelled === true || lead.archived === true) return false;
  if (typeof lead.assignedTo === "string" && lead.assignedTo !== "") return false;
  return lead.status === undefined || lead.status === "new";
}

/** Status after an assignment: a "new" lead moves to "assigned"; later stages stay where they are. */
export function statusAfterAssign(status: unknown, assigned: boolean): string {
  const s = (LEAD_STATUSES as readonly string[]).includes(String(status)) ? String(status) : "new";
  if (assigned) return s === "new" ? "assigned" : s;
  return s === "assigned" ? "new" : s;
}
