/** Pure: R10-8 WhatsApp consent stamp. */
import { asStr, Doc } from "../shared/coerce";

/** Pure: the stamp to write when the consent tick changed (null = nothing to do). */
export function optInStamp(before: Doc | undefined, after: Doc | undefined): Doc | null {
  if (!after) return null;
  const was = before?.whatsappOptIn === true;
  const now = after.whatsappOptIn === true;
  if (was === now && (before || !now)) return null;
  const by = asStr(after.updatedBy) || asStr(after.createdBy) || "unknown";
  return now ? { whatsappOptInBy: by, whatsappOptOutAt: null } : { whatsappOptOutBy: by };
}

