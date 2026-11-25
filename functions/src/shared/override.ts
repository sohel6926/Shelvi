/** Manual-override plumbing shared by callables: permission, parsing, stored fields, audit. */
import { FieldValue } from "firebase-admin/firestore";
import { CallerContext } from "../auth/authContext";
import { fail } from "./errors";
import { writeAuditEntry } from "./auditLog";
import { BusinessSettings } from "./settingsModel";
import { CalcModeArea, canOverride, parseManual } from "./overridePolicy";

export interface ManualValue {
  values: Record<string, number>;
  reason: string;
}

/**
 * Parses `manual` from the request and checks the caller may override. Returns null for automatic.
 * Manual mode never blocks normal work (contract audit fix 2): with no manual value the automatic value is
 * saved even when `settings.calcModes[area]` is "manual" — clients just open the manual entry by default.
 */
export function readManual(raw: unknown, fields: string[], caller: CallerContext, settings: BusinessSettings, _area: CalcModeArea): ManualValue | null {
  const m = parseManual(raw, fields);
  if (m === null) return null;
  if (!m.ok) fail("invalid-argument", m.error.te, m.error.en);
  assertCanOverride(caller, settings);
  return { values: m.values, reason: m.reason };
}

export function assertCanOverride(caller: CallerContext, settings: BusinessSettings): void {
  if (!canOverride(caller.role, settings.managerCanOverride)) {
    fail("permission-denied", "లెక్క మార్చడానికి (మాన్యువల్) మీకు అనుమతి లేదు.", "You are not allowed to enter manual values.");
  }
}

/** Fields stored on the document for a manual value. */
export function manualFields(caller: CallerContext, autoValue: unknown, reason: string) {
  return {
    calcMode: "manual" as const,
    autoValue,
    overriddenBy: { uid: caller.uid, name: caller.name },
    overriddenAt: FieldValue.serverTimestamp(),
    overrideReason: reason,
  };
}

/** Fields stored for an automatic value (also used by "switch to automatic"). */
export function autoFields(autoValue: unknown) {
  return { calcMode: "auto" as const, autoValue, overriddenBy: null, overriddenAt: null, overrideReason: "" };
}

export async function auditOverride(caller: CallerContext, action: string, collection: string, docId: string, autoValue: unknown, manualValue: unknown, reason: string): Promise<void> {
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action, collection, docId, before: { autoValue }, after: { manualValue, reason }, kind: "override" });
}
