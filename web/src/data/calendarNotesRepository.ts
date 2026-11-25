import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { createStamp, updateStamp } from "./audit";

/**
 * 20 Nov 2026 calendar notes: `calendarNotes/{id} { day (YYYY-MM-DD), kind Festival|Idea|Note|Reminder, title, note }`.
 * Festivals, ideas and reminders the owner / manager types on the calendar — no money. Written directly by admin /
 * manager (firestore.rules decide). The CRM ships no festival dates: lunar festival days change every year.
 */
export const NOTE_KINDS = ["Festival", "Idea", "Note", "Reminder"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface CalendarNote {
  id: string;
  day: string;
  kind: NoteKind;
  title: string;
  note: string;
  /** Pictures added on the phone (Storage links, at most 5). Shown here read-only; the web page keeps them as they are. */
  photos?: string[];
}
export type CalendarNoteInput = Omit<CalendarNote, "id"> & { id?: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");

function toNote(id: string, d: DocumentData): CalendarNote {
  return { id, day: str(d.day), kind: (NOTE_KINDS as readonly string[]).includes(d.kind) ? (d.kind as NoteKind) : "Note", title: str(d.title), note: str(d.note), photos: Array.isArray(d.photos) ? d.photos.filter((x): x is string => typeof x === "string") : [] };
}

export function subscribeCalendarNotes(month: string, onData: (rows: CalendarNote[]) => void, onError?: (e: Error) => void): () => void {
  const q = query(collection(db, "calendarNotes"), where("day", ">=", `${month}-01`), where("day", "<=", `${month}-31`));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => toNote(d.id, d.data())).sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind))),
    (e) => onError?.(e),
  );
}

export async function saveCalendarNote(input: CalendarNoteInput): Promise<void> {
  const data = { day: input.day, kind: input.kind, title: input.title.trim(), note: input.note.trim() };
  if (input.id) await updateDoc(doc(db, "calendarNotes", input.id), { ...data, ...updateStamp() });
  else await addDoc(collection(db, "calendarNotes"), { ...data, ...createStamp() });
}

export async function deleteCalendarNote(id: string): Promise<void> {
  await deleteDoc(doc(db, "calendarNotes", id));
}
