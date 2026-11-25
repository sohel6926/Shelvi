/** Pure: R7-1 cost tagging. Old untagged docs count as overhead "general"; a legacy bookingId tags to that event. */
import { asObj, asStr, Doc } from "./coerce";

export const OVERHEAD_CENTRES = ["kitchen-rent", "utilities", "office", "marketing", "vehicles", "maintenance", "general"] as const;
export type OverheadCentre = (typeof OVERHEAD_CENTRES)[number];
export type CostTarget = { type: "booking"; bookingId: string; sessionId?: string } | { type: "overhead"; centre: OverheadCentre };

export function costTargetOf(doc: Doc): CostTarget {
  const t = asObj(doc.costTarget);
  if (t.type === "booking" && asStr(t.bookingId)) {
    const sessionId = asStr(t.sessionId);
    return sessionId ? { type: "booking", bookingId: asStr(t.bookingId), sessionId } : { type: "booking", bookingId: asStr(t.bookingId) };
  }
  if (t.type === "overhead") {
    const c = asStr(t.centre) as OverheadCentre;
    return { type: "overhead", centre: (OVERHEAD_CENTRES as readonly string[]).includes(c) ? c : "general" };
  }
  const legacy = asStr(doc.bookingId);
  return legacy ? { type: "booking", bookingId: legacy } : { type: "overhead", centre: "general" };
}

/** Validates a costTarget sent by a client; returns null when invalid. */
export function parseCostTarget(raw: unknown): CostTarget | null {
  const t = asObj(raw);
  if (t.type === "booking") {
    const bookingId = asStr(t.bookingId).trim();
    if (!bookingId || bookingId.includes("/")) return null;
    const sessionId = asStr(t.sessionId).trim();
    return sessionId ? { type: "booking", bookingId, sessionId } : { type: "booking", bookingId };
  }
  if (t.type === "overhead" && (OVERHEAD_CENTRES as readonly string[]).includes(asStr(t.centre))) return { type: "overhead", centre: asStr(t.centre) as OverheadCentre };
  return null;
}

/** Cancelled / deleted records never count (R7-3). */
export function isLiveRecord(doc: Doc): boolean {
  return doc.isDeleted !== true && doc.archived !== true && asStr(doc.status) !== "Cancelled" && asStr(doc.status) !== "cancelled";
}
