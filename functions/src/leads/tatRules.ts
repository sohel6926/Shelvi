/**
 * Module 1b (18 Nov 2026) — speed-to-lead: a new lead must get a first response within N minutes (default 15).
 * Pure rules, no Firestore. Spec: Master Blueprint p18 (reminders and escalation), Smart-CRM-style TAT.
 * First breach → alert to the assigned person (or all admins / managers when nobody has it).
 * Second breach (2 × N minutes) → alert to the owner.
 */
import { asObj, Doc } from "../shared/coerce";

/** A lead in one of these has not been answered yet. */
export const UNANSWERED_STATUSES: readonly string[] = ["new", "assigned"];

/** settings/business.leadTat */
export interface LeadTatConfig {
  /** on/off switch (default on) */
  on: boolean;
  /** minutes allowed for the first response (5–1440, default 15) */
  minutes: number;
  /** also tell the owner at 2 × minutes (default on) */
  escalate: boolean;
}

export const DEFAULT_LEAD_TAT: LeadTatConfig = { on: true, minutes: 15, escalate: true };
export const TAT_MIN_MINUTES = 5;
export const TAT_MAX_MINUTES = 1440;
/** Leads older than this are never alerted (so turning the switch on does not flood old leads). */
export const TAT_STALE_MS = 24 * 60 * 60 * 1000;

const validMinutes = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= TAT_MIN_MINUTES && v <= TAT_MAX_MINUTES;

export function normalizeLeadTat(raw: unknown): LeadTatConfig {
  const o = asObj(raw);
  return {
    on: o.on === undefined ? DEFAULT_LEAD_TAT.on : o.on === true,
    minutes: validMinutes(o.minutes) ? o.minutes : DEFAULT_LEAD_TAT.minutes,
    escalate: o.escalate === undefined ? DEFAULT_LEAD_TAT.escalate : o.escalate === true,
  };
}

export function parseLeadTatPatch(v: unknown): { ok: true; value: LeadTatConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "leadTat must be an object." };
  const o = v as Doc;
  if (typeof o.on !== "boolean") return { ok: false, error: "leadTat.on must be true or false." };
  if (!validMinutes(o.minutes)) return { ok: false, error: `leadTat.minutes must be a whole number from ${TAT_MIN_MINUTES} to ${TAT_MAX_MINUTES}.` };
  if (typeof o.escalate !== "boolean") return { ok: false, error: "leadTat.escalate must be true or false." };
  return { ok: true, value: { on: o.on, minutes: o.minutes, escalate: o.escalate } };
}

export interface TatLead {
  status: string;
  cancelled: boolean;
  /** ms since epoch; null = unknown */
  createdAtMs: number | null;
  alertedAtMs: number | null;
  escalatedAtMs: number | null;
}

export type TatStep = "none" | "alert" | "escalate";

/**
 * What to do for one lead right now. "escalate" is returned once (and covers a missed first alert);
 * "alert" is returned once. Answered, cancelled, undated and stale leads get "none".
 */
export function tatStep(lead: TatLead, nowMs: number, cfg: LeadTatConfig): TatStep {
  if (!cfg.on || lead.cancelled || lead.createdAtMs === null) return "none";
  if (!UNANSWERED_STATUSES.includes(lead.status)) return "none";
  const age = nowMs - lead.createdAtMs;
  if (age < 0 || age > TAT_STALE_MS) return "none";
  const limit = cfg.minutes * 60 * 1000;
  if (cfg.escalate && age >= 2 * limit && lead.escalatedAtMs === null) return "escalate";
  if (age >= limit && lead.alertedAtMs === null && lead.escalatedAtMs === null) return "alert";
  return "none";
}

/** Did this write answer the lead for the first time? (left new / assigned, and no first response stamped yet) */
export function isFirstResponse(after: Doc | undefined): boolean {
  if (!after) return false;
  if (after.firstResponseAt !== undefined && after.firstResponseAt !== null) return false;
  const status = typeof after.status === "string" ? after.status : "new";
  return !UNANSWERED_STATUSES.includes(status);
}

/** Whole minutes late right now (0 = within time). Used by the clients for the "late" chip. */
export function minutesLate(createdAtMs: number | null, nowMs: number, cfg: LeadTatConfig): number {
  if (!cfg.on || createdAtMs === null) return 0;
  return Math.max(0, Math.floor((nowMs - createdAtMs) / 60000) - cfg.minutes);
}
