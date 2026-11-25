import { addDoc, collection, doc, onSnapshot, query, updateDoc, where, type DocumentData, type QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";
import { cancelInfo, type CancelInfo } from "./cancel";
import { createStamp, updateStamp } from "./audit";
import type { Role } from "../auth/roles";

/**
 * R10-2 shifts (🔒 saveShift), tasks (A/M create here; status via completeTask) and staff ratings (🔒 rateStaff).
 * Reads follow firestore.rules: admin all; manager filters by branchId; staff by their own staffId.
 */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const date = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
};

export interface Who {
  role: Role;
  branchId: string | null;
  staffId: string;
  uid: string;
}

/** Branch / own-record filter that the rules can prove for this person. */
function scope(who: Who): QueryConstraint[] {
  if (who.role === "admin") return who.branchId ? [where("branchId", "==", who.branchId)] : [];
  if (who.role === "manager") return [where("branchId", "==", who.branchId ?? "")];
  return [where("staffId", "==", who.staffId || "-")];
}

// ---------------------------------------------------------------- shifts

/** Same Telugu as functions/src/staff/shifts.ts SHIFT_ROLE_TE. */
export const SHIFT_ROLE_LABEL: Record<string, { te: string; en: string }> = {
  cook: { te: "వంట మనిషి", en: "Cook" },
  helper: { te: "హెల్పర్", en: "Helper" },
  server: { te: "సర్వర్", en: "Server" },
  driver: { te: "డ్రైవర్", en: "Driver" },
  supervisor: { te: "సూపర్‌వైజర్", en: "Supervisor" },
};

export interface Shift extends CancelInfo {
  id: string;
  bookingId: string;
  sessionId: string;
  staffId: string;
  staffName: string;
  role: string;
  roleTe: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  note: string;
  customer: string;
  branchId: string;
}

function toShift(id: string, d: DocumentData): Shift {
  return {
    id,
    bookingId: str(d.bookingId),
    sessionId: str(d.sessionId),
    staffId: str(d.staffId),
    staffName: str(d.staffName),
    role: str(d.role),
    roleTe: str(d.roleTe),
    date: str(d.date),
    startTime: str(d.startTime),
    endTime: str(d.endTime),
    hours: num(d.hours),
    note: str(d.note),
    customer: str(d.customerNameSnapshot),
    branchId: str(d.branchId),
    ...cancelInfo(d),
  };
}

const byTime = (a: Shift, b: Shift) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);

/** Shifts of one booking (A/M). Managers add their branch so the rules allow the list. */
export function subscribeBookingShifts(bookingId: string, who: Who, onData: (rows: Shift[]) => void, onError?: (e: Error) => void): () => void {
  const c = who.role === "admin" ? [] : [where("branchId", "==", who.branchId ?? "")];
  return onSnapshot(
    query(collection(db, "shifts"), where("bookingId", "==", bookingId), ...c),
    (s) => onData(s.docs.map((d) => toShift(d.id, d.data())).sort(byTime)),
    (e) => onError?.(e),
  );
}

/** One staff member's shifts (staff page). */
export function subscribeStaffShifts(staffId: string, who: Who, onData: (rows: Shift[]) => void, onError?: (e: Error) => void): () => void {
  const c = who.role === "admin" ? [] : who.role === "manager" ? [where("branchId", "==", who.branchId ?? "")] : [];
  return onSnapshot(
    query(collection(db, "shifts"), where("staffId", "==", staffId), ...c),
    (s) => onData(s.docs.map((d) => toShift(d.id, d.data())).sort(byTime).reverse()),
    (e) => onError?.(e),
  );
}

/** Shifts on one day (today's tasks page). */
export function subscribeDayShifts(day: string, who: Who, onData: (rows: Shift[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "shifts"), where("date", "==", day), ...scope(who)),
    (s) => onData(s.docs.map((d) => toShift(d.id, d.data())).sort(byTime)),
    (e) => onError?.(e),
  );
}

// ---------------------------------------------------------------- tasks

export interface Task extends CancelInfo {
  id: string;
  title: string;
  assigneeStaffId: string;
  assigneeName: string;
  bookingId: string;
  due: string;
  status: "Open" | "Done";
  doneAt: Date | null;
  doneBy: string;
  staffNote: string;
  branchId: string;
}

function toTask(id: string, d: DocumentData): Task {
  const by = d.doneBy && typeof d.doneBy === "object" ? str((d.doneBy as DocumentData).name) : "";
  return {
    id,
    title: str(d.title),
    assigneeStaffId: str(d.assigneeStaffId),
    assigneeName: str(d.assigneeName),
    bookingId: str(d.bookingId),
    due: str(d.due),
    status: d.status === "Done" ? "Done" : "Open",
    doneAt: date(d.doneAt),
    doneBy: by,
    staffNote: str(d.staffNote),
    branchId: str(d.branchId),
    ...cancelInfo(d),
  };
}

/** Tasks due on or before `day` that are open, plus those due that day (A/M: branch; staff: own). */
export function subscribeTasks(who: Who, onData: (rows: Task[]) => void, onError?: (e: Error) => void): () => void {
  const c =
    who.role === "staff"
      ? [where("assigneeStaffId", "==", who.staffId || "-")]
      : who.role === "manager"
        ? [where("branchId", "==", who.branchId ?? "")]
        : who.branchId
          ? [where("branchId", "==", who.branchId)]
          : [];
  return onSnapshot(
    query(collection(db, "tasks"), ...c),
    (s) => onData(s.docs.map((d) => toTask(d.id, d.data())).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title))),
    (e) => onError?.(e),
  );
}

export interface TaskInput {
  id?: string;
  title: string;
  assigneeStaffId: string;
  assigneeName: string;
  bookingId: string;
  due: string;
}

/** A/M create / edit (status changes only through completeTask). */
export async function saveTask(input: TaskInput, branchId: string): Promise<void> {
  const data = {
    title: input.title.trim(),
    assigneeStaffId: input.assigneeStaffId,
    assigneeName: input.assigneeName,
    assignedStaffIds: input.assigneeStaffId ? [input.assigneeStaffId] : [],
    bookingId: input.bookingId,
    due: input.due,
  };
  if (input.id) await updateDoc(doc(db, "tasks", input.id), { ...data, ...updateStamp() });
  else await addDoc(collection(db, "tasks"), { ...data, status: "Open", branchId, ...createStamp() });
}

// ---------------------------------------------------------------- ratings

export interface StaffRating extends CancelInfo {
  id: string;
  staffId: string;
  staffName: string;
  bookingId: string;
  customer: string;
  day: string;
  month: string;
  stars: number;
  note: string;
  byName: string;
}

function toRating(id: string, d: DocumentData): StaffRating {
  return {
    id,
    staffId: str(d.staffId),
    staffName: str(d.staffName),
    bookingId: str(d.bookingId),
    customer: str(d.customerNameSnapshot),
    day: str(d.day),
    month: str(d.month),
    stars: num(d.stars),
    note: str(d.note),
    byName: d.by && typeof d.by === "object" ? str((d.by as DocumentData).name) : "",
    ...cancelInfo(d),
  };
}

export function subscribeBookingRatings(bookingId: string, who: Who, onData: (rows: StaffRating[]) => void, onError?: (e: Error) => void): () => void {
  const c = who.role === "admin" ? [] : [where("branchId", "==", who.branchId ?? "")];
  return onSnapshot(
    query(collection(db, "staffRatings"), where("bookingId", "==", bookingId), ...c),
    (s) => onData(s.docs.map((d) => toRating(d.id, d.data()))),
    (e) => onError?.(e),
  );
}

export function subscribeStaffRatings(staffId: string, who: Who, onData: (rows: StaffRating[]) => void, onError?: (e: Error) => void): () => void {
  const c = who.role === "admin" ? [] : who.role === "manager" ? [where("branchId", "==", who.branchId ?? "")] : [];
  return onSnapshot(
    query(collection(db, "staffRatings"), where("staffId", "==", staffId), ...c),
    (s) => onData(s.docs.map((d) => toRating(d.id, d.data())).sort((a, b) => b.day.localeCompare(a.day))),
    (e) => onError?.(e),
  );
}
