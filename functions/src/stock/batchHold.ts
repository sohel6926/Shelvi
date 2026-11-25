/**
 * Module 5d — food safety, part 1 (spec X10 "Food safety, QC and traceability"): holding a batch, deciding the hold,
 * and tracing where a batch went. Rules: batchRules.ts (expiredQty counts held batches, heldQty,
 * holdDecisionProblem, traceBatchUses).
 *  - holdBatch { itemId, batchId, reason }: owner / manager. From that moment the batch is not planned with,
 *    reserved, or sold (inventory.expiredQty carries it) and is the last to be consumed.
 *  - decideBatchHold { itemId, batchId, decision: "release" | "discard", note }: someone who may approve stock, and
 *    not the person who placed the hold (the owner may). Discard takes the quantity out of stock with a movement.
 *  - traceBatch { itemId, batchId }: every movement that took from the batch and the events it went to.
 */
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqId, reqOneOf, reqString } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { istDay } from "../shared/istDate";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { canApproveAdjust } from "../inventory/adjustRules";
import { Batch, expiredQty, heldQty, holdDecisionProblem, traceBatchUses } from "./batchRules";

const toBatch = (id: string, x: Doc): Batch => ({ id, qty: asNum(x.qty), expiryDay: asStr(x.expiryDay), receivedAtMs: x.receivedAt instanceof Timestamp ? x.receivedAt.toMillis() : 0, hold: x.hold === true });

export const holdBatch = callable("holdBatch", ADMIN_MANAGER, async (data, caller) => {
  const itemId = reqId(data, "itemId");
  const batchId = reqId(data, "batchId");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(itemId);
  const batchRef = itemRef.collection("batches").doc(batchId);
  const out = await db.runTransaction(async (tx) => {
    const [itemSnap, batchSnap] = await Promise.all([tx.get(itemRef), tx.get(batchRef)]);
    if (!itemSnap.exists || !batchSnap.exists) fail("not-found", "ఆ బ్యాచ్ దొరకలేదు.", "That batch was not found.");
    const item = itemSnap.data() as Doc;
    assertAdminOrOwnBranch(caller, asStr(item.branchId));
    const b = batchSnap.data() as Doc;
    if (b.hold === true) fail("failed-precondition", "ఈ బ్యాచ్ ఇప్పటికే ఆపి ఉంది.", "This batch is already on hold.");
    if (!(asNum(b.qty) > 0)) fail("failed-precondition", "ఈ బ్యాచ్‌లో నిల్వ మిగలలేదు.", "Nothing is left in this batch.");
    const all = (await tx.get(itemRef.collection("batches").where("qty", ">", 0))).docs.map((d) => toBatch(d.id, d.data() as Doc)).map((x) => (x.id === batchId ? { ...x, hold: true } : x));
    tx.update(batchRef, { hold: true, holdReason: reason, heldBy: caller.uid, heldByName: caller.name, heldAt: FieldValue.serverTimestamp() });
    tx.update(itemRef, { expiredQty: expiredQty(all, istDay(new Date())), heldQty: heldQty(all) });
    tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`batchHold_${itemId}_${batchId}`), {
      kind: "batchHold", audienceRoles: ["admin", "manager"], recipientUids: [], branchId: asStr(item.branchId),
      title: { te: `బ్యాచ్ ఆపారు: ${asStr(item.name)} ${asNum(b.qty)} ${asStr(item.unit)} — ${reason}`, en: `Batch put on hold: ${asStr(item.name)} ${asNum(b.qty)} ${asStr(item.unit)} — ${reason}` },
      link: "/inventory", readBy: [], createdAt: FieldValue.serverTimestamp(),
    });
    return { qty: asNum(b.qty) };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "holdBatch", collection: FirestoreCollections.INVENTORY, docId: itemId, before: { batchId, hold: false }, after: { batchId, hold: true, reason, qty: out.qty } });
  return { ok: true, heldQty: out.qty };
});

export const decideBatchHold = callable("decideBatchHold", ADMIN_MANAGER, async (data, caller) => {
  const itemId = reqId(data, "itemId");
  const batchId = reqId(data, "batchId");
  const decision = reqOneOf(data, "decision", ["release", "discard"] as const);
  const note = reqString(data, "note", 300);
  const db = getFirestore();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(itemId);
  const batchRef = itemRef.collection("batches").doc(batchId);
  const out = await db.runTransaction(async (tx) => {
    const [itemSnap, batchSnap] = await Promise.all([tx.get(itemRef), tx.get(batchRef)]);
    if (!itemSnap.exists) fail("not-found", "ఆ stock వస్తువు దొరకలేదు.", "Inventory item not found.");
    const item = itemSnap.data() as Doc;
    assertAdminOrOwnBranch(caller, asStr(item.branchId));
    const b = (batchSnap.data() ?? {}) as Doc;
    const problem = holdDecisionProblem({ exists: batchSnap.exists, hold: b.hold === true, heldBy: asStr(b.heldBy), qty: asNum(b.qty) }, { uid: caller.uid, isOwner: caller.role === "admin", mayApprove: canApproveAdjust(caller.role, caller.jobRole) });
    if (problem === "no-batch") fail("not-found", "ఆ బ్యాచ్ దొరకలేదు.", "That batch was not found.");
    if (problem === "not-held") fail("failed-precondition", "ఈ బ్యాచ్ ఆపి లేదు.", "This batch is not on hold.");
    if (problem === "not-allowed") fail("permission-denied", "ఆపిన బ్యాచ్‌పై నిర్ణయం తీసుకునే అనుమతి మీకు లేదు.", "You are not allowed to decide a batch hold.");
    if (problem === "own-hold") fail("permission-denied", "మీరు ఆపిన బ్యాచ్‌ను మీరే విడుదల / తొలగించలేరు. వేరొకరు (లేదా యజమాని) చేయాలి.", "You can't decide a hold you placed yourself. Someone else (or the owner) must.");
    const qty = Math.max(0, asNum(b.qty));
    const others = (await tx.get(itemRef.collection("batches").where("qty", ">", 0))).docs.map((d) => toBatch(d.id, d.data() as Doc)).filter((x) => x.id !== batchId);
    const decided = { holdDecision: decision, holdDecisionNote: note, holdDecidedBy: caller.uid, holdDecidedByName: caller.name, holdDecidedAt: FieldValue.serverTimestamp() };
    if (decision === "release") {
      const all = [...others, { ...toBatch(batchId, b), hold: false }];
      tx.update(batchRef, { hold: false, ...decided });
      tx.update(itemRef, { expiredQty: expiredQty(all, istDay(new Date())), heldQty: heldQty(all) });
      return { qty, newQuantity: asNum(item.quantityInStock) };
    }
    // discard: the quantity leaves stock through a movement; the batch is emptied here so the batch trigger has nothing left to reconcile
    const newQty = Math.max(0, Math.round((asNum(item.quantityInStock) - qty) * 1000) / 1000);
    tx.update(batchRef, { hold: false, qty: 0, discardedQty: qty, ...decided });
    tx.update(itemRef, { quantityInStock: newQty, expiredQty: expiredQty(others, istDay(new Date())), heldQty: heldQty(others), lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    tx.set(itemRef.collection(FirestoreCollections.MOVEMENTS).doc(), { type: "OUT", quantity: qty, reason: "held-batch-discarded", note, batchId, batchesUsed: [{ batchId, taken: qty }], batchApplied: true, date: FieldValue.serverTimestamp(), recordedBy: caller.uid });
    return { qty, newQuantity: newQty };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "decideBatchHold", collection: FirestoreCollections.INVENTORY, docId: itemId, before: { batchId, hold: true }, after: { batchId, decision, note, qty: out.qty } });
  return { ok: true, decision, ...out };
});

export const traceBatch = callable("traceBatch", ADMIN_MANAGER, async (data, caller) => {
  const itemId = reqId(data, "itemId");
  const batchId = reqId(data, "batchId");
  void optString(data, "note", 1);
  const db = getFirestore();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(itemId);
  const [itemSnap, batchSnap, moves] = await Promise.all([itemRef.get(), itemRef.collection("batches").doc(batchId).get(), itemRef.collection(FirestoreCollections.MOVEMENTS).where("batchApplied", "==", true).get()]);
  if (!itemSnap.exists || !batchSnap.exists) fail("not-found", "ఆ బ్యాచ్ దొరకలేదు.", "That batch was not found.");
  const item = itemSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(item.branchId));
  const b = batchSnap.data() as Doc;
  const t = traceBatchUses(batchId, moves.docs.map((d) => ({ id: d.id, data: d.data() as Doc, day: (d.data() as Doc).date instanceof Timestamp ? istDay(((d.data() as Doc).date as Timestamp).toDate()) : "" })));
  const bookings = t.bookingIds.length ? await db.getAll(...t.bookingIds.slice(0, 100).map((id) => db.collection(FirestoreCollections.BOOKINGS).doc(id))) : [];
  const events = bookings.filter((s) => s.exists).map((s) => {
    const x = s.data() as Doc;
    return { bookingId: s.id, customer: asStr(x.customerNameSnapshot), day: x.eventDate instanceof Timestamp ? istDay(x.eventDate.toDate()) : "", status: asStr(x.status), taken: t.uses.filter((u) => u.bookingId === s.id).reduce((a, u) => a + u.taken, 0) };
  });
  return {
    item: { id: itemId, name: asStr(item.name), unit: asStr(item.unit) },
    batch: { id: batchId, receivedQty: asNum(b.receivedQty), qty: asNum(b.qty), expiryDay: asStr(b.expiryDay), batchNo: asStr(b.batchNo), purchaseId: asStr(b.purchaseId), receivedDay: b.receivedAt instanceof Timestamp ? istDay(b.receivedAt.toDate()) : "", hold: b.hold === true, holdReason: asStr(b.holdReason) },
    uses: t.uses.slice(0, 300),
    events,
    totalTaken: t.totalTaken,
  };
});
