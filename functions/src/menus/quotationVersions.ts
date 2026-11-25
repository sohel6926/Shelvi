/** Pure: R7-10 quotation versions. */
import { asNum, asStr, Doc } from "../shared/coerce";

/**
 * Saving a quotation that was Sent or Accepted keeps the old one as version n (snapshot) and the edit becomes
 * version n + 1 as a Draft (it must be sent again). Draft / Rejected / Expired quotations are edited in place.
 */
export function versionBump(existing: Doc): { version: number; snapshotVersion: number | null; status: string | null } {
  const v = Math.max(1, Math.floor(asNum(existing.version, 1)));
  const st = asStr(existing.status);
  if (st === "Sent" || st === "Accepted") return { version: v + 1, snapshotVersion: v, status: "Draft" };
  return { version: v, snapshotVersion: null, status: null };
}

/** acceptedVersion follows the status becoming Accepted (trigger). */
export function acceptedVersionUpdate(before: Doc | undefined, after: Doc | undefined): number | null {
  if (!after || asStr(after.status) !== "Accepted") return null;
  const v = Math.max(1, Math.floor(asNum(after.version, 1)));
  if (asStr(before?.status) === "Accepted" && asNum(after.acceptedVersion, 0) === v) return null;
  return asNum(after.acceptedVersion, 0) === v ? null : v;
}
