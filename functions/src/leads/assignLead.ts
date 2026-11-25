/**
 * Module 1a (18 Nov 2026) — lead assignment.
 *  - assignOnLeadCreate: a new lead goes to a person by settings/business.leadAssign (auto on/off, by source or turn by turn).
 *  - assignLead { leadId, uid }: admin / manager hands a lead to someone ("" = take it back).
 *  - leadAssignees {}: the people who can take leads (active admins and managers) — for the pickers.
 * assignedTo / assignedName / assignedAt / assignedBy are server-only fields (firestore.rules).
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections, BUSINESS_SETTINGS_DOC } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { asStr, Doc } from "../shared/coerce";
import { writeAuditEntry } from "../shared/auditLog";
import { canAutoAssign, normalizeLeadAssign, pickAssignee, statusAfterAssign } from "./assignRules";

/** settings/leadAssignState — { lastUid }: whose turn it was last (turn-by-turn mode). */
const STATE_DOC = "leadAssignState";

export interface LeadAssignee {
  uid: string;
  name: string;
  role: "admin" | "manager";
  branchId: string;
}

/** Active admins and managers, sorted by name. Staff cannot read leads, so they never take one. */
async function loadAssignees(): Promise<LeadAssignee[]> {
  const snap = await getFirestore().collection(FirestoreCollections.USERS).where("role", "in", ["admin", "manager"]).get();
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() as Doc }))
    .filter((u) => u.data.role === "admin" || u.data.active === true)
    .map((u) => ({
      uid: u.id,
      name: asStr(u.data.name) || asStr(u.data.email) || u.id,
      role: (u.data.role === "admin" ? "admin" : "manager") as "admin" | "manager",
      branchId: asStr(u.data.branchId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function notifyAssignee(leadId: string, lead: Doc, uid: string): Promise<void> {
  const name = asStr(lead.name) || asStr(lead.phone);
  await getFirestore()
    .collection(FirestoreCollections.NOTIFICATIONS)
    .doc(`leadAssigned_${leadId}_${uid}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300))
    .set({
      kind: "leadAssigned",
      audienceRoles: [],
      recipientUids: [uid],
      title: { te: `కొత్త ఎంక్వైరీ మీకు అప్పగించాం: ${name}`, en: `New lead assigned to you: ${name}` },
      link: "/leads",
      leadId,
      readBy: [],
      createdAt: FieldValue.serverTimestamp(),
    });
}

/** A new lead → the right person, when auto-assign is on. Never overrides a lead that already has someone. */
export const assignOnLeadCreate = onDocumentCreated({ document: "leads/{leadId}", region: REGION }, async (event) => {
  const created = event.data?.data() as Doc | undefined;
  if (!canAutoAssign(created)) return;
  const db = getFirestore();
  const leadRef = db.collection(FirestoreCollections.LEADS).doc(event.params.leadId);
  const settingsRef = db.collection(FirestoreCollections.SETTINGS).doc(BUSINESS_SETTINGS_DOC);
  const stateRef = db.collection(FirestoreCollections.SETTINGS).doc(STATE_DOC);

  const cfg = normalizeLeadAssign(((await settingsRef.get()).data() ?? {}).leadAssign);
  if (!cfg.auto) return;
  const people = await loadAssignees();

  const picked = await db.runTransaction(async (tx) => {
    const leadSnap = await tx.get(leadRef);
    const lead = leadSnap.data() as Doc | undefined;
    if (!leadSnap.exists || !canAutoAssign(lead)) return null;
    const lastUid = asStr(((await tx.get(stateRef)).data() ?? {}).lastUid);
    const branchId = asStr(lead?.branchId);
    // A manager only takes leads of their own branch; an admin takes any.
    const eligible = people.filter((p) => p.role === "admin" || !p.branchId || p.branchId === branchId).map((p) => p.uid);
    const pick = pickAssignee({ source: asStr(lead?.source, "other") }, cfg, eligible, lastUid);
    if (!pick) return null;
    const person = people.find((p) => p.uid === pick.uid);
    tx.update(leadRef, {
      assignedTo: pick.uid,
      assignedName: person?.name ?? "",
      assignedAt: FieldValue.serverTimestamp(),
      assignedBy: "auto",
      assignedVia: pick.via,
      status: statusAfterAssign(lead?.status, true),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "system",
    });
    if (pick.via === "roundRobin") tx.set(stateRef, { lastUid: pick.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { uid: pick.uid, lead: lead ?? {} };
  });
  // An Excel import can create hundreds of leads at once: assign them, but do not send one notification each.
  if (picked && picked.lead.imported !== true) await notifyAssignee(event.params.leadId, picked.lead, picked.uid);
});

/** assignLead { leadId, uid } — uid "" takes the lead back (unassigned). A manager may only touch their own branch. */
export const assignLead = callable("assignLead", ADMIN_MANAGER, async (data, caller) => {
  const leadId = reqId(data, "leadId");
  const uid = typeof data.uid === "string" ? data.uid.trim() : null;
  if (uid === null || uid.length > 128 || uid.includes("/")) fail("invalid-argument", "ఎవరికి అప్పగించాలో సరిగా లేదు.", "uid is not valid.");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.LEADS).doc(leadId);
  const people = uid ? await loadAssignees() : [];
  const person = people.find((p) => p.uid === uid);
  if (uid && !person) fail("failed-precondition", "ఈ వ్యక్తికి ఎంక్వైరీలు అప్పగించలేము (active admin / manager కాదు).", "This person cannot take leads (not an active admin or manager).");

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఎంక్వైరీ దొరకలేదు.", "Lead not found.");
    const lead = snap.data() as Doc;
    const branchId = asStr(lead.branchId);
    if (caller.role !== "admin" && caller.branchId !== branchId) fail("permission-denied", "ఈ branch ఎంక్వైరీ మార్చడానికి మీకు అనుమతి లేదు.", "You do not have access to this branch.");
    if (lead.cancelled === true || lead.archived === true) fail("failed-precondition", "రద్దైన ఎంక్వైరీని అప్పగించలేము.", "A cancelled lead cannot be assigned.");
    if (person && person.role === "manager" && person.branchId && person.branchId !== branchId) fail("failed-precondition", "ఈ manager వేరే branch కి చెందినవారు.", "This manager belongs to another branch.");
    const before = asStr(lead.assignedTo);
    if (before === uid) return { changed: false, lead };
    tx.update(ref, {
      assignedTo: uid,
      assignedName: person?.name ?? "",
      assignedAt: uid ? FieldValue.serverTimestamp() : null,
      assignedBy: uid ? caller.uid : "",
      assignedVia: uid ? "manual" : "",
      status: statusAfterAssign(lead.status, uid !== ""),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.uid,
    });
    return { changed: true, lead, before };
  });

  if (result.changed) {
    await writeAuditEntry({
      uid: caller.uid,
      role: caller.role,
      action: uid ? "assignLead" : "unassignLead",
      collection: FirestoreCollections.LEADS,
      docId: leadId,
      before: { assignedTo: result.before ?? "" },
      after: { assignedTo: uid, assignedName: person?.name ?? "" },
      summary: uid
        ? { te: `ఎంక్వైరీని ${person?.name ?? ""} కి అప్పగించారు`, en: `Lead assigned to ${person?.name ?? ""}` }
        : { te: "ఎంక్వైరీ అప్పగింత తీసేశారు", en: "Lead unassigned" },
    });
    if (uid && uid !== caller.uid) await notifyAssignee(leadId, result.lead, uid);
  }
  return { ok: true, assignedTo: uid, assignedName: person?.name ?? "" };
});

/** leadAssignees {} → { people } for the assignee picker and the auto-assign settings. */
export const leadAssignees = callable("leadAssignees", ADMIN_MANAGER, async (_data, caller) => {
  const people = await loadAssignees();
  return { people: caller.role === "admin" ? people : people.filter((p) => p.role === "admin" || !p.branchId || p.branchId === caller.branchId) };
});
