import { asStr, Doc } from "../shared/coerce";

/** Which user docs must change when staff/{id}.linkedUserId changes: set on the new one, clear on the old one. */
export function staffLinkChanges(before: Doc | undefined, after: Doc | undefined): { set?: string; clear?: string } {
  const oldUid = before ? asStr(before.linkedUserId) : "";
  const newUid = after ? asStr(after.linkedUserId) : "";
  if (oldUid === newUid) return newUid ? { set: newUid } : {};
  return { ...(newUid ? { set: newUid } : {}), ...(oldUid ? { clear: oldUid } : {}) };
}

