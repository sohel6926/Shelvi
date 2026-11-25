/**
 * Module 1b (18 Nov 2026) — 15-minute first-response rule.
 *  - stampLeadFirstResponse: the moment a lead leaves new / assigned, the server stamps firstResponseAt / firstResponseBy.
 *  - leadTatWatch: every 5 minutes, unanswered leads past the limit → notification (assignee, then owner).
 * firstResponseAt / firstResponseBy / tatAlertAt / tatEscalatedAt are server-only fields (firestore.rules).
 */
import { REGION, TIME_ZONE } from "../setup";
import { getFirestore, FieldValue, Timestamp, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FirestoreCollections, BUSINESS_SETTINGS_DOC } from "../shared/firestorePaths";
import { asStr, Doc } from "../shared/coerce";
import { isFirstResponse, normalizeLeadTat, tatStep, UNANSWERED_STATUSES } from "./tatRules";

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

export const stampLeadFirstResponse = onDocumentWritten({ document: "leads/{leadId}", region: REGION }, async (event: WriteEvent) => {
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  if (!after || !event.data?.after || !isFirstResponse(after)) return;
  await event.data.after.ref.update({ firstResponseAt: FieldValue.serverTimestamp(), firstResponseBy: asStr(after.updatedBy) });
});

export const leadTatWatch = onSchedule({ schedule: "every 5 minutes", timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 120 }, async () => {
  const db = getFirestore();
  const cfg = normalizeLeadTat(((await db.collection(FirestoreCollections.SETTINGS).doc(BUSINESS_SETTINGS_DOC).get()).data() ?? {}).leadTat);
  if (!cfg.on) return;
  const snap = await db.collection(FirestoreCollections.LEADS).where("status", "in", [...UNANSWERED_STATUSES]).get();
  const now = Date.now();
  for (const d of snap.docs) {
    const lead = d.data() as Doc;
    const step = tatStep(
      { status: asStr(lead.status, "new"), cancelled: lead.cancelled === true || lead.archived === true || lead.imported === true, createdAtMs: ms(lead.createdAt), alertedAtMs: ms(lead.tatAlertAt), escalatedAtMs: ms(lead.tatEscalatedAt) },
      now,
      cfg,
    );
    if (step === "none") continue;
    const name = asStr(lead.name) || asStr(lead.phone);
    const assignedTo = asStr(lead.assignedTo);
    const escalate = step === "escalate";
    const notif = db.collection(FirestoreCollections.NOTIFICATIONS).doc(`${escalate ? "leadTatEsc" : "leadTat"}_${d.id}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300));
    const batch = db.batch();
    batch.set(notif, {
      kind: escalate ? "leadTatEscalated" : "leadTatLate",
      // first alert: the person who has the lead (everyone who can see leads when nobody has it); second: the owner
      audienceRoles: escalate ? ["admin"] : assignedTo ? [] : ["admin", "manager"],
      recipientUids: !escalate && assignedTo ? [assignedTo] : [],
      title: escalate
        ? { te: `${cfg.minutes * 2} నిమిషాలైనా ఎవరూ మాట్లాడలేదు: ${name}${lead.assignedName ? ` (${asStr(lead.assignedName)})` : ""}`, en: `No response after ${cfg.minutes * 2} minutes: ${name}${lead.assignedName ? ` (${asStr(lead.assignedName)})` : ""}` }
        : { te: `${cfg.minutes} నిమిషాలు దాటింది, ఇంకా మాట్లాడలేదు: ${name}`, en: `${cfg.minutes} minutes passed with no response: ${name}` },
      link: "/leads",
      leadId: d.id,
      branchId: asStr(lead.branchId),
      readBy: [],
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(d.ref, escalate ? { tatEscalatedAt: FieldValue.serverTimestamp() } : { tatAlertAt: FieldValue.serverTimestamp() });
    await batch.commit();
  }
});
