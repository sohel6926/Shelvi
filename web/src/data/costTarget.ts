import type { DocumentData } from "firebase/firestore";
import type { Bilingual } from "../i18n/LanguageContext";

/**
 * R7-1: every purchase, expense and outside order belongs to an event (booking, optionally one meal
 * session) or to an overhead centre. Old untagged documents count as overhead "general".
 */
export const OVERHEAD_CENTRES = ["kitchen-rent", "utilities", "office", "marketing", "vehicles", "maintenance", "general"] as const;
export type OverheadCentre = (typeof OVERHEAD_CENTRES)[number];

export const CENTRE_LABEL: Record<OverheadCentre, Bilingual> = {
  "kitchen-rent": { te: "కిచెన్ అద్దె", en: "Kitchen rent" },
  utilities: { te: "కరెంట్ / నీళ్ళు / గ్యాస్ బిల్లులు", en: "Utilities" },
  office: { te: "ఆఫీస్", en: "Office" },
  marketing: { te: "ప్రచారం / ప్రకటనలు", en: "Marketing" },
  vehicles: { te: "వాహనాలు", en: "Vehicles" },
  maintenance: { te: "మరమ్మతులు", en: "Maintenance" },
  general: { te: "సాధారణ ఖర్చు", en: "General" },
};

export type CostTarget =
  | { type: "booking"; bookingId: string; sessionId?: string }
  | { type: "overhead"; centre: OverheadCentre };

export const GENERAL_OVERHEAD: CostTarget = { type: "overhead", centre: "general" };

function toCentre(v: unknown): OverheadCentre {
  return (OVERHEAD_CENTRES as readonly string[]).includes(v as string) ? (v as OverheadCentre) : "general";
}

/** Read a document's cost target. Legacy docs with only `bookingId` count as that booking; nothing at all → overhead general. */
export function toCostTarget(d: DocumentData | undefined): CostTarget {
  const t = d?.costTarget as DocumentData | undefined;
  if (t && t.type === "booking" && typeof t.bookingId === "string" && t.bookingId) {
    return typeof t.sessionId === "string" && t.sessionId
      ? { type: "booking", bookingId: t.bookingId, sessionId: t.sessionId }
      : { type: "booking", bookingId: t.bookingId };
  }
  if (t && t.type === "overhead") return { type: "overhead", centre: toCentre(t.centre) };
  if (typeof d?.bookingId === "string" && d.bookingId) return { type: "booking", bookingId: d.bookingId };
  return GENERAL_OVERHEAD;
}

/**
 * Fields to write for a cost target. `bookingId` / `sessionId` are mirrored at the top level because
 * the server's per-booking cost queries (stats/bookingCost) and the Android expense form use `bookingId`.
 */
export function costTargetFields(t: CostTarget): { costTarget: CostTarget; bookingId: string; sessionId: string } {
  if (t.type === "booking") {
    const clean: CostTarget = t.sessionId ? { type: "booking", bookingId: t.bookingId, sessionId: t.sessionId } : { type: "booking", bookingId: t.bookingId };
    return { costTarget: clean, bookingId: t.bookingId, sessionId: t.sessionId ?? "" };
  }
  return { costTarget: { type: "overhead", centre: t.centre }, bookingId: "", sessionId: "" };
}
