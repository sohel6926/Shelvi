import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";
import { cancelInfo, type CancelInfo } from "./cancel";
import { createStamp, updateStamp } from "./audit";

/** `leads/{id}` (docs/data-model.md). Written by manager/admin; no money is computed here. */
export const LEAD_SOURCES = ["instagram", "facebook", "google", "referral", "walkin", "justdial", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * Module 1a pipeline order (same list as functions/src/leads/assignRules.ts and firestore.rules).
 * "quoted" = Quotation Ready and "won" = Converted in the spec; "tasting" is our own catering stage.
 */
export const LEAD_STATUSES = ["new", "assigned", "contacted", "requirement", "tasting", "qualified", "quoted", "won", "lost", "duplicate", "invalid"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Closed stages: no more follow-up. Everything else is "open" and shown on the pipeline board. */
export const LEAD_CLOSED_STATUSES: readonly LeadStatus[] = ["won", "lost", "duplicate", "invalid"];
export const LEAD_OPEN_STATUSES: readonly LeadStatus[] = LEAD_STATUSES.filter((s) => !LEAD_CLOSED_STATUSES.includes(s));
export const isLeadOpen = (status: LeadStatus) => !LEAD_CLOSED_STATUSES.includes(status);

/** Module 1b: not answered yet (same list as functions/src/leads/tatRules.ts UNANSWERED_STATUSES). */
export const isLeadUnanswered = (status: LeadStatus) => status === "new" || status === "assigned";

/**
 * Whole minutes past the first-response limit right now (0 = in time, answered, or the rule is off).
 * Leads older than a day are not counted, like the server.
 */
export function leadMinutesLate(lead: Pick<Lead, "status" | "createdAt" | "cancelled" | "imported">, nowMs: number, tat: { on: boolean; minutes: number }): number {
  if (!tat.on || lead.cancelled || lead.imported || !lead.createdAt || !isLeadUnanswered(lead.status)) return 0;
  const age = nowMs - lead.createdAt.getTime();
  if (age < 0 || age > 24 * 60 * 60 * 1000) return 0;
  return Math.max(0, Math.floor(age / 60000) - tat.minutes);
}

export interface Lead extends CancelInfo {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  campaignId: string;
  /** YYYY-MM-DD */
  eventDate: string;
  /** null = not known yet (rules require a whole number ≥ 1 when present). */
  guests: number | null;
  budget: number | null;
  status: LeadStatus;
  /** YYYY-MM-DD */
  followUpDate: string;
  /** Module 1e: optional time of day for the follow-up, "HH:MM" (24-hour) or "" */
  followUpTime: string;
  /** Module 1e: free notes about the enquiry (same field the phone app writes) */
  notes: string;
  lostReason: string;
  whatsappOptIn: boolean;
  /** Module 1c: HOT / WARM / COLD set by a person ("" = automatic, see modules/leads/leadScore.ts). */
  scoreManual: "" | "hot" | "warm" | "cold";
  /** Module 1c: came from an Excel import (old enquiry: no 15-minute alert). Server-set. */
  imported: boolean;
  customerId: string;
  /** Module 1a — set only by the server (assignOnLeadCreate / assignLead). "" = nobody yet. */
  assignedTo: string;
  assignedName: string;
  /** "auto" or the uid of the person who assigned it */
  assignedBy: string;
  assignedAt: Date | null;
  /** Module 1b — server stamps: first time the lead left new / assigned; late alert sent; owner told. */
  firstResponseAt: Date | null;
  tatAlertAt: Date | null;
  tatEscalatedAt: Date | null;
  branchId: string;
  lastContactAt: Date | null;
  createdAt: Date | null;
}

export type LeadInput = Omit<
  Lead,
  "id" | "branchId" | "lastContactAt" | "createdAt" | "customerId" | "cancelled" | "cancelReason" | "assignedTo" | "assignedName" | "assignedBy" | "assignedAt" | "firstResponseAt" | "tatAlertAt" | "tatEscalatedAt" | "imported"
> & { id?: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");
function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
}

function toLead(id: string, d: DocumentData): Lead {
  return {
    id,
    name: str(d.name),
    phone: str(d.phone),
    source: (LEAD_SOURCES as readonly string[]).includes(d.source) ? (d.source as LeadSource) : "other",
    campaignId: str(d.campaignId),
    eventDate: str(d.eventDate),
    guests: typeof d.guests === "number" ? d.guests : null,
    budget: typeof d.budget === "number" ? d.budget : null,
    status: (LEAD_STATUSES as readonly string[]).includes(d.status) ? (d.status as LeadStatus) : "new",
    followUpDate: str(d.followUpDate),
    followUpTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(str(d.followUpTime)) ? str(d.followUpTime) : "",
    notes: str(d.notes),
    lostReason: str(d.lostReason),
    whatsappOptIn: d.whatsappOptIn === true,
    scoreManual: d.scoreManual === "hot" || d.scoreManual === "warm" || d.scoreManual === "cold" ? d.scoreManual : "",
    imported: d.imported === true,
    customerId: str(d.customerId),
    assignedTo: str(d.assignedTo),
    assignedName: str(d.assignedName),
    assignedBy: str(d.assignedBy),
    assignedAt: toDate(d.assignedAt),
    firstResponseAt: toDate(d.firstResponseAt),
    tatAlertAt: toDate(d.tatAlertAt),
    tatEscalatedAt: toDate(d.tatEscalatedAt),
    branchId: str(d.branchId),
    lastContactAt: toDate(d.lastContactAt),
    createdAt: toDate(d.createdAt),
    ...cancelInfo(d),
  };
}

export function subscribeLeads(
  branchId: string | null,
  onData: (rows: Lead[]) => void,
  onError?: (e: Error) => void,
): () => void {
  const col = collection(db, "leads");
  const q = branchId ? query(col, where("branchId", "==", branchId)) : query(col);
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs
          .map((d) => toLead(d.id, d.data()))
          .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
      ),
    (e) => onError?.(e),
  );
}

export async function saveLead(input: LeadInput, uid: string, branchId: string | null): Promise<void> {
  const { id, ...fields } = input;
  const data = {
    ...fields,
    name: fields.name.trim(),
    phone: fields.phone.trim(),
    guests: fields.guests && fields.guests >= 1 ? Math.round(fields.guests) : null,
    budget: fields.budget && fields.budget > 0 ? fields.budget : null,
    lostReason: fields.status === "lost" ? fields.lostReason.trim() : "",
    notes: fields.notes.trim(),
    followUpTime: fields.followUpDate ? fields.followUpTime : "",
    ...updateStamp(),
  };
  if (!id) {
    if (!branchId) throw new Error("Select a branch first / ముందు branch ఎంచుకోండి");
    await addDoc(collection(db, "leads"), {
      ...data,
      optInAt: fields.whatsappOptIn ? serverTimestamp() : null,
      branchId,
      ...createStamp(),
      createdBy: uid,
    });
  } else {
    // optInAt keeps the first opt-in moment; it is cleared when the customer withdraws.
    await updateDoc(doc(db, "leads", id), fields.whatsappOptIn ? data : { ...data, optInAt: null });
  }
}

/** Module 1e — one team note on a lead (leads/{id}/comments, written by the addLeadComment callable). */
export interface LeadComment {
  id: string;
  text: string;
  mentions: string[];
  createdBy: string;
  createdByName: string;
  createdAt: Date | null;
}

/** Live notes of one lead, oldest first. */
export function subscribeLeadComments(leadId: string, onData: (rows: LeadComment[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "leads", leadId, "comments"), orderBy("createdAt", "asc")),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            text: str(x.text),
            mentions: Array.isArray(x.mentions) ? x.mentions.filter((u): u is string => typeof u === "string") : [],
            createdBy: str(x.createdBy),
            createdByName: str(x.createdByName),
            createdAt: toDate(x.createdAt),
          };
        }),
      ),
    (e) => onError?.(e),
  );
}

/** Module 1a: move a lead to another pipeline stage (board drag / quick change). Leaving "lost" clears its reason. */
export async function setLeadStatus(id: string, status: LeadStatus): Promise<void> {
  await updateDoc(doc(db, "leads", id), status === "lost" ? { status, ...updateStamp() } : { status, lostReason: "", ...updateStamp() });
}

/**
 * R10-7 "కస్టమర్‌గా మార్చు" — same as Android LeadRepository.convertToCustomer: creates the customer from the lead
 * and marks the lead "won" with its customerId in one batch (lead history stays). WhatsApp opt-in and source carry over.
 * Returns the customer id (the existing one when already converted).
 */
export async function convertLeadToCustomer(lead: Lead, uid: string): Promise<string> {
  if (lead.customerId) return lead.customerId;
  const customerRef = doc(collection(db, "customers"));
  const batch = writeBatch(db);
  batch.set(customerRef, {
    name: lead.name.trim(),
    phone: lead.phone.trim(),
    email: "",
    address: "",
    notes: "",
    // the server trigger (optInOnCustomer) stamps whatsappOptInAt/By
    whatsappOptIn: lead.whatsappOptIn,
    source: lead.source,
    ...createStamp(),
    createdBy: uid,
  });
  batch.update(doc(db, "leads", lead.id), { status: "won", customerId: customerRef.id, ...updateStamp() });
  await batch.commit();
  return customerRef.id;
}
