/**
 * Module 1e (18 Nov 2026) — addLeadComment { leadId, text, mentions? }: a team note on a lead, kept in
 * leads/{id}/comments (server-written, like the other sub-collections). Mentioned people and the person who has the
 * lead get an in-app notification. Notes are never edited or deleted (history).
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { asStr, Doc } from "../shared/coerce";
import { cleanComment, cleanMentions, commentRecipients } from "./commentRules";

export const addLeadComment = callable("addLeadComment", ADMIN_MANAGER, async (data, caller) => {
  const leadId = reqId(data, "leadId");
  const text = cleanComment(data.text);
  if (!text) fail("invalid-argument", "నోట్ ఖాళీగా ఉంది లేదా చాలా పెద్దది (2000 అక్షరాల లోపు).", "The note is empty or too long (up to 2000 characters).");
  const mentions = cleanMentions(data.mentions);
  if (!mentions) fail("invalid-argument", "ఎవరిని పిలవాలో సరిగా లేదు.", "The mentions list is not valid.");

  const db = getFirestore();
  const leadRef = db.collection(FirestoreCollections.LEADS).doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) fail("not-found", "ఎంక్వైరీ దొరకలేదు.", "Lead not found.");
  const lead = leadSnap.data() as Doc;
  if (caller.role !== "admin" && caller.branchId !== asStr(lead.branchId)) fail("permission-denied", "ఈ branch ఎంక్వైరీకి నోట్ రాయడానికి మీకు అనుమతి లేదు.", "You do not have access to this branch.");

  const usersSnap = await db.collection(FirestoreCollections.USERS).where("role", "in", ["admin", "manager"]).get();
  const eligible = usersSnap.docs.filter((d) => d.data().role === "admin" || d.data().active === true).map((d) => d.id);
  const recipients = commentRecipients({ mentions, assignedTo: asStr(lead.assignedTo), authorUid: caller.uid, eligible });

  const commentRef = leadRef.collection("comments").doc();
  const batch = db.batch();
  batch.set(commentRef, {
    text,
    mentions: mentions.filter((u) => eligible.includes(u)),
    createdBy: caller.uid,
    createdByName: caller.name || "",
    createdAt: FieldValue.serverTimestamp(),
  });
  if (recipients.length) {
    const who = caller.name || "";
    const leadName = asStr(lead.name) || asStr(lead.phone);
    const short = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    batch.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`leadNote_${leadId}_${commentRef.id}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300)), {
      kind: "leadNote",
      audienceRoles: [],
      recipientUids: recipients,
      title: { te: `${leadName} ఎంక్వైరీ మీద ${who ? `${who} ` : ""}నోట్: ${short}`, en: `Note on lead ${leadName}${who ? ` by ${who}` : ""}: ${short}` },
      link: "/leads",
      leadId,
      readBy: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return { ok: true, id: commentRef.id, notified: recipients.length };
});
