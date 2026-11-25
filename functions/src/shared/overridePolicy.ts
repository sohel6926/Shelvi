/** Pure rules for manual overrides (api-contract "Manual and automatic mode"). */
import type { Bilingual } from "./errors";
import type { Role } from "../auth/authContext";
import { asObj } from "./coerce";

export type CalcMode = "auto" | "manual";
export const CALC_MODE_AREAS = ["quotation", "invoice", "attendancePay", "payroll", "cooking", "targets"] as const;
export type CalcModeArea = (typeof CALC_MODE_AREAS)[number];
export type CalcModes = Record<CalcModeArea, CalcMode>;

export const DEFAULT_CALC_MODES: CalcModes = { quotation: "auto", invoice: "auto", attendancePay: "auto", payroll: "auto", cooking: "auto", targets: "auto" };

export function normalizeCalcModes(raw: unknown): CalcModes {
  const o = asObj(raw);
  const out = { ...DEFAULT_CALC_MODES };
  for (const k of CALC_MODE_AREAS) if (o[k] === "manual" || o[k] === "auto") out[k] = o[k] as CalcMode;
  return out;
}

/** Staff never; manager only when settings.managerCanOverride; admin always. */
export function canOverride(role: Role, managerCanOverride: boolean): boolean {
  return role === "admin" || (role === "manager" && managerCanOverride);
}

export const MIN_REASON_LENGTH = 3;

export type ManualParse = { ok: true; values: Record<string, number>; reason: string } | { ok: false; error: Bilingual } | null;

/**
 * Reads request field `manual: { <value fields>, reason }`. null = no manual value (automatic).
 * Every listed field must be a finite number ≥ 0; reason must be at least 3 characters.
 */
export function parseManual(raw: unknown, fields: string[]): ManualParse {
  if (raw === undefined || raw === null) return null;
  const o = asObj(raw);
  const reason = typeof o.reason === "string" ? o.reason.trim() : "";
  if (reason.length < MIN_REASON_LENGTH) return { ok: false, error: { te: "మార్పుకి కారణం రాయండి (కనీసం 3 అక్షరాలు).", en: "A reason of at least 3 characters is required for a manual value." } };
  if (reason.length > 500) return { ok: false, error: { te: "కారణం 500 అక్షరాల లోపు ఉండాలి.", en: "Reason must be at most 500 characters." } };
  const values: Record<string, number> = {};
  for (const f of fields) {
    const v = o[f];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return { ok: false, error: { te: `"${f}" విలువ 0 లేదా అంతకంటే ఎక్కువ అంకె అయి ఉండాలి.`, en: `manual.${f} must be a number ≥ 0.` } };
    values[f] = v;
  }
  return { ok: true, values, reason };
}
