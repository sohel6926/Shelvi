import type { DocumentData } from "firebase/firestore";
import type { Role } from "../auth/roles";

/**
 * Manual / automatic mode (docs/api-contract.md → "Manual and automatic mode"). Every computed
 * value can be automatic (server, default) or manual (typed by a person, with a reason). The server
 * stores these fields next to the value; the web only shows them and calls the override callables.
 */
export type CalcMode = "auto" | "manual";

export interface CalcMeta {
  calcMode: CalcMode;
  /** What the system calculated (kept for comparison when manual). */
  autoValue: number | null;
  overriddenBy: { uid: string; name: string } | null;
  overriddenAt: Date | null;
  overrideReason: string;
}

export const AUTO_META: CalcMeta = { calcMode: "auto", autoValue: null, overriddenBy: null, overriddenAt: null, overrideReason: "" };

export function toCalcMeta(d: DocumentData | null | undefined): CalcMeta {
  if (!d) return AUTO_META;
  const by = d.overriddenBy as DocumentData | null | undefined;
  const at = d.overriddenAt as { toDate?: () => Date } | null | undefined;
  return {
    calcMode: d.calcMode === "manual" ? "manual" : "auto",
    autoValue: typeof d.autoValue === "number" ? d.autoValue : null,
    overriddenBy: by && typeof by === "object" ? { uid: String(by.uid ?? ""), name: String(by.name ?? "") } : null,
    overriddenAt: at && typeof at.toDate === "function" ? at.toDate() : null,
    overrideReason: typeof d.overrideReason === "string" ? d.overrideReason : "",
  };
}

/** `settings/business.calcModes` areas. */
export const CALC_AREAS = ["quotation", "invoice", "attendancePay", "payroll", "cooking", "targets"] as const;
export type CalcArea = (typeof CALC_AREAS)[number];
export type CalcModes = Record<CalcArea, CalcMode>;

export const DEFAULT_CALC_MODES: CalcModes = {
  quotation: "auto",
  invoice: "auto",
  attendancePay: "auto",
  payroll: "auto",
  cooking: "auto",
  targets: "auto",
};

/** Admin always; manager only when settings.managerCanOverride; staff never. */
export function canOverride(role: Role, managerCanOverride: boolean): boolean {
  return role === "admin" || (role === "manager" && managerCanOverride);
}

export const MIN_REASON = 3;
