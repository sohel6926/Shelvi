import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { createStamp, updateStamp } from "./audit";

/**
 * R7-10 complaints / feedback (client-written; rules: admin, branch manager; needs branchId).
 * Field names: category food | service | delay | billing | other; severity low | medium | high;
 * status open | in-progress | resolved; assignedToStaffId / assignedToName; resolution; replyText.
 */
export const COMPLAINT_CATEGORIES = ["food", "service", "delay", "billing", "other"] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
export const COMPLAINT_SEVERITIES = ["low", "medium", "high"] as const;
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];
export const COMPLAINT_STATUSES = ["open", "in-progress", "resolved"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export interface Complaint {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  bookingId: string;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  description: string;
  status: ComplaintStatus;
  assignedToStaffId: string;
  assignedToName: string;
  resolution: string;
  replyText: string;
  branchId: string;
  createdAt: Date | null;
  resolvedAt: Date | null;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const d = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
};
const oneOf = <T extends string>(list: readonly T[], v: unknown, dflt: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : dflt);

function toComplaint(id: string, x: DocumentData): Complaint {
  return {
    id,
    customerId: s(x.customerId),
    customerName: s(x.customerName),
    customerPhone: s(x.customerPhone),
    bookingId: s(x.bookingId),
    category: oneOf(COMPLAINT_CATEGORIES, x.category, "other"),
    severity: oneOf(COMPLAINT_SEVERITIES, x.severity, "medium"),
    description: s(x.description),
    status: oneOf(COMPLAINT_STATUSES, x.status, "open"),
    assignedToStaffId: s(x.assignedToStaffId),
    assignedToName: s(x.assignedToName),
    resolution: s(x.resolution),
    replyText: s(x.replyText),
    branchId: s(x.branchId),
    createdAt: d(x.createdAt),
    resolvedAt: d(x.resolvedAt),
  };
}

/** Managers must filter by branch (rules). */
export function subscribeComplaints(branchId: string | null, onData: (rows: Complaint[]) => void, onError?: (e: Error) => void): () => void {
  const col = collection(db, "complaints");
  return onSnapshot(
    branchId ? query(col, where("branchId", "==", branchId)) : query(col),
    (snap) => onData(snap.docs.map((x) => toComplaint(x.id, x.data())).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))),
    (e) => onError?.(e),
  );
}

export type ComplaintInput = Omit<Complaint, "id" | "branchId" | "createdAt" | "resolvedAt"> & { id?: string };

export async function saveComplaint(input: ComplaintInput, branchId: string, wasResolved: boolean): Promise<void> {
  const data = {
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    bookingId: input.bookingId,
    category: input.category,
    severity: input.severity,
    description: input.description,
    status: input.status,
    assignedToStaffId: input.assignedToStaffId,
    assignedToName: input.assignedToName,
    resolution: input.resolution,
    replyText: input.replyText,
    ...(input.status === "resolved" && !wasResolved ? { resolvedAt: serverTimestamp() } : {}),
  };
  if (!input.id) {
    await addDoc(collection(db, "complaints"), { ...data, branchId, ...createStamp() });
  } else {
    await updateDoc(doc(db, "complaints", input.id), { ...data, ...updateStamp() });
  }
}
