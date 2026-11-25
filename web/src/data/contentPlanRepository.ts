import { addDoc, collection, doc, onSnapshot, query, updateDoc, where, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { createStamp, updateStamp } from "./audit";

/**
 * R10-13 content plan: `contentPlan/{id} { date (YYYY-MM-DD), platform, idea, owner, status Idea|Ready|Posted, link }`.
 * Plain marketing notes — no money. Written directly by admin / manager (firestore.rules decide).
 */
export const CONTENT_PLATFORMS = ["Instagram", "Facebook", "WhatsApp status", "YouTube", "Google"] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export const CONTENT_STATUSES = ["Idea", "Ready", "Posted"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export interface ContentItem {
  id: string;
  date: string;
  platform: ContentPlatform;
  idea: string;
  owner: string;
  status: ContentStatus;
  link: string;
}

export type ContentInput = Omit<ContentItem, "id"> & { id?: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");

function toItem(id: string, d: DocumentData): ContentItem {
  return {
    id,
    date: str(d.date),
    platform: (CONTENT_PLATFORMS as readonly string[]).includes(d.platform) ? (d.platform as ContentPlatform) : "Instagram",
    idea: str(d.idea),
    owner: str(d.owner),
    status: (CONTENT_STATUSES as readonly string[]).includes(d.status) ? (d.status as ContentStatus) : "Idea",
    link: str(d.link),
  };
}

/** One month ("YYYY-MM"): date range on the YYYY-MM-DD string. */
export function subscribeContentPlan(month: string, onData: (rows: ContentItem[]) => void, onError?: (e: Error) => void): () => void {
  const q = query(collection(db, "contentPlan"), where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => toItem(d.id, d.data())).sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform))),
    (e) => onError?.(e),
  );
}

export function contentPlanQuery(month: string) {
  return query(collection(db, "contentPlan"), where("date", ">=", `${month}-01`), where("date", "<=", `${month}-31`));
}

export async function saveContentItem(input: ContentInput): Promise<void> {
  const data = {
    date: input.date,
    platform: input.platform,
    idea: input.idea.trim(),
    owner: input.owner.trim(),
    status: input.status,
    link: input.link.trim(),
  };
  if (input.id) await updateDoc(doc(db, "contentPlan", input.id), { ...data, ...updateStamp() });
  else await addDoc(collection(db, "contentPlan"), { ...data, ...createStamp() });
}

export async function setContentStatus(id: string, status: ContentStatus): Promise<void> {
  await updateDoc(doc(db, "contentPlan", id), { status, ...updateStamp() });
}
