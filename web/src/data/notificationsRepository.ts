import { arrayUnion, collection, doc, onSnapshot, query, updateDoc, where, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import type { Bilingual } from "../i18n/LanguageContext";
import type { Role } from "../auth/roles";

/**
 * Round 8 in-app notifications (🔒 server-written): plan-ready, plan-changed (old → new), plan-tomorrow.
 * `notifications/{id} { kind, audienceRoles, title {te,en}, link, bookingId?, day, changes?, readBy[] }`.
 * Clients may only add their own uid to `readBy`.
 */
export interface PlanChangeLine {
  key: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  old: number | null;
  now: number | null;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: Bilingual;
  link: string;
  bookingId: string;
  day: string;
  changes: PlanChangeLine[];
  readBy: string[];
  createdAt: Date | null;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toNotification(id: string, d: DocumentData): AppNotification {
  const t = (d.title ?? {}) as DocumentData;
  return {
    id,
    kind: s(d.kind),
    title: typeof d.title === "string" ? { te: d.title, en: d.title } : { te: s(t.te) || s(t.en), en: s(t.en) || s(t.te) },
    link: s(d.link),
    bookingId: s(d.bookingId),
    day: s(d.day),
    changes: Array.isArray(d.changes)
      ? d.changes
          .filter((c: unknown) => c && typeof c === "object")
          .map((c: DocumentData) => ({ key: s(c.key), nameTe: s(c.nameTe), nameEn: s(c.nameEn), unit: s(c.unit), old: n(c.old), now: n(c.now) }))
      : [],
    readBy: Array.isArray(d.readBy) ? d.readBy.filter((x: unknown): x is string => typeof x === "string") : [],
    createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : null,
  };
}

/** Notifications for my role (the rules only allow queries that filter on audienceRoles). Newest first. */
export function subscribeNotifications(role: Role, onData: (rows: AppNotification[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "notifications"), where("audienceRoles", "array-contains", role)),
    (snap) => onData(snap.docs.map((d) => toNotification(d.id, d.data())).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))),
    (e) => onError?.(e),
  );
}

export async function markNotificationRead(id: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "notifications", id), { readBy: arrayUnion(uid) });
}
