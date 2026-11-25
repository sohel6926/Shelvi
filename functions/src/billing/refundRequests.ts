/**
 * Module 6a — refund requests: requestRefund { invoiceId, amount, reason } (owner / manager of the branch) and
 * decideRefund { id, approve, note? } (owner only). Approving pays the refund now (applyRefund) against today's invoice;
 * rejecting needs a reason. Rules: refundRequestRules.ts.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqBool, reqId, reqNum, reqString } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { applyRefund } from "./recordPayment";
import { REFUND_REQUEST_TEXT, refundDecideProblem, refundRequestProblem } from "./refundRequestRules";

const stamp = () => FieldValue.serverTimestamp();

export const requestRefund = callable("requestRefund", ADMIN_MANAGER, async (data, caller) => {
  const invoiceId = reqId(data, "invoiceId");
  const amount = Math.round(reqNum(data, "amount", { min: 0.01 }) * 100) / 100;
  const reason = reqString(data, "reason", 500);
  const db = getFirestore();
  const invSnap = await db.collection(FirestoreCollections.INVOICES).doc(invoiceId).get();
  if (!invSnap.exists) fail("not-found", "Invoice దొరకలేదు.", "Invoice not found.");
  const inv = invSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(inv.branchId));
  const pending = await db.collection(FirestoreCollections.REFUND_REQUESTS).where("invoiceId", "==", invoiceId).where("status", "==", "pending").limit(1).get();
  const problem = refundRequestProblem({ amount, paid: asNum(inv.amountPaid), pendingForInvoice: pending.size });
  if (problem) fail(problem === "already-asked" ? "failed-precondition" : "invalid-argument", REFUND_REQUEST_TEXT[problem].te, REFUND_REQUEST_TEXT[problem].en);
  const ref = db.collection(FirestoreCollections.REFUND_REQUESTS).doc();
  const number = asStr(inv.invoiceNumber);
  const batch = db.batch();
  batch.set(ref, { invoiceId, invoiceNumber: number, customerName: asStr(inv.customerNameSnapshot), branchId: asStr(inv.branchId), amount, reason, amountPaidAtRequest: asNum(inv.amountPaid), status: "pending", requestedBy: caller.uid, requestedByName: caller.name, requestedAt: stamp(), decidedBy: "", decidedByName: "", decideNote: "" });
  batch.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`refundRequest_${ref.id}`), {
    kind: "refundRequest", audienceRoles: ["admin"], recipientUids: [], branchId: asStr(inv.branchId),
    title: { te: `Refund ఆమోదం కావాలి: ${number} ₹${amount} — ${caller.name}`, en: `Refund needs approval: ${number} ₹${amount} — ${caller.name}` },
    link: "/invoices", readBy: [], createdAt: stamp(),
  });
  await batch.commit();
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "requestRefund", collection: FirestoreCollections.REFUND_REQUESTS, docId: ref.id, before: {}, after: { invoiceId, amount, reason } });
  return { ok: true, id: ref.id };
});

export const decideRefund = callable("decideRefund", ADMIN, async (data, caller) => {
  const id = reqId(data, "id");
  const approve = reqBool(data, "approve");
  const note = asStr(data.note).trim().slice(0, 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.REFUND_REQUESTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "ఆ refund అభ్యర్థన దొరకలేదు.", "That refund request was not found.");
  const req = snap.data() as Doc;
  const problem = refundDecideProblem({ status: asStr(req.status), approve, note });
  if (problem === "not-pending") fail("failed-precondition", "ఈ అభ్యర్థనపై ఇప్పటికే నిర్ణయం అయింది.", "This request has already been decided.");
  if (problem === "reason-needed") fail("invalid-argument", "తిరస్కరించడానికి కారణం రాయండి.", "Give a reason to reject.");
  let after: { newPaid: number; newBalance: number } | null = null;
  if (approve) {
    after = await applyRefund(caller, asStr(req.invoiceId), asNum(req.amount), asStr(req.reason), { refundRequestId: id, requestedBy: asStr(req.requestedBy), requestedByName: asStr(req.requestedByName) });
  }
  // a second tap may have got here first: only a still-pending request is closed
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as Doc;
    if (asStr(cur.status) !== "pending") return;
    tx.update(ref, { status: approve ? "approved" : "rejected", decidedBy: caller.uid, decidedByName: caller.name, decideNote: note, decidedAt: stamp() });
    tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`refundDecided_${id}`), {
      kind: "refundDecided", audienceRoles: [], recipientUids: [asStr(req.requestedBy)].filter(Boolean), branchId: asStr(req.branchId),
      title: approve ? { te: `మీ refund ఆమోదించారు: ${asStr(req.invoiceNumber)} ₹${asNum(req.amount)}`, en: `Your refund was approved: ${asStr(req.invoiceNumber)} ₹${asNum(req.amount)}` } : { te: `మీ refund తిరస్కరించారు: ${asStr(req.invoiceNumber)} — ${note}`, en: `Your refund was rejected: ${asStr(req.invoiceNumber)} — ${note}` },
      link: "/invoices", readBy: [], createdAt: stamp(),
    });
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "decideRefund", collection: FirestoreCollections.REFUND_REQUESTS, docId: id, before: { status: "pending" }, after: { status: approve ? "approved" : "rejected", note } });
  return { ok: true, status: approve ? "approved" : "rejected", ...(after ? { newBalance: after.newBalance } : {}) };
});
