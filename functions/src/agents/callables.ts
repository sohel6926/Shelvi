import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqBool, reqId, reqOneOf } from "../shared/validate";
import { asStr, Doc } from "../shared/coerce";
import { writeAuditEntry } from "../shared/auditLog";
import { AGENT_IDS, runAgent } from "./agentRun";
import { AGENT_JOBS, AGENT_SCHEDULES } from "./registry";

export const setAgentEnabled = callable("setAgentEnabled", ADMIN, async (data, caller) => {
  const agentId = reqOneOf(data, "agentId", AGENT_IDS);
  const enabled = reqBool(data, "enabled");
  await getFirestore()
    .collection(FirestoreCollections.AGENT_SETTINGS)
    .doc(agentId)
    .set({ enabled, schedule: AGENT_SCHEDULES[agentId] ?? "event", updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

/** Owner approves a `needs-approval` message → `queued`; the sender trigger then sends it. */
export const approveMessage = callable("approveMessage", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const messageId = reqId(data, "messageId");
  const ref = db.collection(FirestoreCollections.MESSAGES_OUTBOX).doc(messageId);
  const status = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ message దొరకలేదు.", "Message not found.");
    const m = snap.data() as Doc;
    if (asStr(m.status) !== "needs-approval") fail("failed-precondition", "ఈ message approval కోసం లేదు.", `Message is ${asStr(m.status)}, not needs-approval.`);
    tx.update(ref, { status: "queued", approvedBy: caller.uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return "queued";
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "approveMessage", collection: FirestoreCollections.MESSAGES_OUTBOX, docId: messageId });
  return { status };
});

export const runAgentNow = callable("runAgentNow", ADMIN, async (data) => {
  const agentId = reqOneOf(data, "agentId", AGENT_IDS);
  const runId = await runAgent(agentId, "manual", AGENT_JOBS[agentId]);
  return { runId };
}, { timeoutSeconds: 540 });
