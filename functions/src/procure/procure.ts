/**
 * Module 3a (18 Nov 2026) — purchase request (PR) → purchase order (PO), with approval.
 *  - savePurchaseRequest { neededBy, note?, bookingId?, lines[] }: anyone on the team asks for goods (status "submitted").
 *  - decidePurchaseRequest { id, approve, reason? }: owner / manager approve or reject (a reason is needed to reject).
 *  - cancelPurchaseRequest { id, reason }: the person who asked, or owner / manager, until an order is written from it.
 *  - savePurchaseOrder { id?, vendorId, expectedDay, terms?, prId?, lines[] with rate }: owner / manager. The total is
 *    worked out here. An owner's order is approved at once; a manager's above settings.poApproval.managerLimit waits
 *    for the owner. Lines can be changed only before approval or after a rejection.
 *  - decidePurchaseOrder { id, approve, reason? }: owner only.
 *  - cancelPurchaseOrder { id, reason }: owner / manager, until goods are received; the request goes back to "approved".
 * purchaseRequests and purchaseOrders are written only here. No stock and no money moves in this step
 * (goods receipt = Module 3b, bill match = Module 3c).
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqBool, reqId, reqString } from "../shared/validate";
import { asStr, asNum, Doc } from "../shared/coerce";
import { todayIST } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { canCancelPo, canCancelPr, canDecidePo, canDecidePr, canEditPo, canOrderFromPr, docNumber, parsePurchaseOrder, parsePurchaseRequest, poStatusOnSave } from "./procureRules";

const stamp = () => FieldValue.serverTimestamp();

function notice(kind: string, id: string, to: { roles?: string[]; uids?: string[] }, te: string, en: string): [string, Doc] {
  return [
    `${kind}_${id}_${Date.now()}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300),
    { kind, audienceRoles: to.roles ?? [], recipientUids: (to.uids ?? []).filter(Boolean), title: { te, en }, link: "/procurement", readBy: [], createdAt: stamp() },
  ];
}

export const savePurchaseRequest = callable("savePurchaseRequest", ALL_ROLES, async (data, caller) => {
  const today = todayIST();
  const parsed = parsePurchaseRequest(data, today);
  if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
  const pr = parsed.value;
  const branchId = caller.role === "admin" ? asStr(data.branchId) || caller.branchId : caller.branchId;
  if (!branchId) fail("invalid-argument", "ముందు branch ఎంచుకోండి.", "Choose a branch first.");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PURCHASE_REQUESTS).doc();
  const counterRef = db.collection(FirestoreCollections.COUNTERS).doc(`purchaseRequest-${today}`);
  const number = await db.runTransaction(async (tx) => {
    const n = asNum(((await tx.get(counterRef)).data() ?? {}).last) + 1;
    const num = docNumber("PR", today, n);
    tx.set(counterRef, { kind: "purchaseRequest", day: today, last: n, updatedAt: stamp() }, { merge: true });
    tx.set(ref, { ...pr, number: num, status: "submitted", branchId, requestedBy: caller.uid, requestedByName: caller.name, requestDay: today, poId: "", decidedBy: "", decidedByName: "", decideReason: "", createdAt: stamp(), updatedAt: stamp() });
    const [nid, n1] = notice("purchaseRequest", ref.id, { roles: ["admin", "manager"] }, `కొత్త కొనుగోలు అభ్యర్థన ${num} — ${caller.name}`, `New purchase request ${num} — ${caller.name}`);
    tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(nid), { ...n1, branchId });
    return num;
  });
  return { ok: true, id: ref.id, number };
});

export const decidePurchaseRequest = callable("decidePurchaseRequest", ADMIN_MANAGER, async (data, caller) => {
  const id = reqId(data, "id");
  const approve = reqBool(data, "approve");
  const reason = asStr(data.reason).trim().slice(0, 300);
  if (!approve && !reason) fail("invalid-argument", "తిరస్కరించడానికి కారణం రాయండి.", "Give a reason to reject.");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PURCHASE_REQUESTS).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ అభ్యర్థన దొరకలేదు.", "Purchase request not found.");
    const cur = snap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(cur.branchId)) fail("permission-denied", "ఈ branch అభ్యర్థనపై నిర్ణయం తీసుకోవడానికి మీకు అనుమతి లేదు.", "You can't decide a request of another branch.");
    if (!canDecidePr(asStr(cur.status))) fail("failed-precondition", "ఈ అభ్యర్థనపై ఇప్పటికే నిర్ణయం అయింది.", "This request has already been decided.");
    const status = approve ? "approved" : "rejected";
    tx.update(ref, { status, decidedBy: caller.uid, decidedByName: caller.name, decideReason: reason, decidedAt: stamp(), updatedAt: stamp() });
    const num = asStr(cur.number);
    const [nid, n1] = notice("purchaseRequestDecided", id, { uids: [asStr(cur.requestedBy)] }, approve ? `మీ అభ్యర్థన ${num} ఆమోదించారు` : `మీ అభ్యర్థన ${num} తిరస్కరించారు: ${reason}`, approve ? `Your request ${num} was approved` : `Your request ${num} was rejected: ${reason}`);
    tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(nid), n1);
    return { ok: true, status };
  });
});

export const cancelPurchaseRequest = callable("cancelPurchaseRequest", ALL_ROLES, async (data, caller) => {
  const id = reqId(data, "id");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PURCHASE_REQUESTS).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ అభ్యర్థన దొరకలేదు.", "Purchase request not found.");
    const cur = snap.data() as Doc;
    const own = asStr(cur.requestedBy) === caller.uid;
    const boss = caller.role === "admin" || (caller.role === "manager" && caller.branchId === asStr(cur.branchId));
    if (!own && !boss) fail("permission-denied", "ఈ అభ్యర్థనను రద్దు చేయడానికి మీకు అనుమతి లేదు.", "You can't cancel this request.");
    if (!canCancelPr(asStr(cur.status))) fail("failed-precondition", "ఈ అభ్యర్థనను ఇప్పుడు రద్దు చేయలేరు (ఆర్డర్ రాసి ఉంటే ముందు ఆర్డర్ రద్దు చేయండి).", "This request can't be cancelled now (cancel its order first if one was written).");
    tx.update(ref, { status: "cancelled", cancelReason: reason, cancelledBy: caller.uid, cancelledAt: stamp(), updatedAt: stamp() });
    return { ok: true };
  });
});

export const savePurchaseOrder = callable("savePurchaseOrder", ADMIN_MANAGER, async (data, caller) => {
  const today = todayIST();
  const parsed = parsePurchaseOrder(data, today);
  if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
  const po = parsed.value;
  const settings = await loadSettings();
  const db = getFirestore();
  const col = db.collection(FirestoreCollections.PURCHASE_ORDERS);
  const id = asStr(data.id);
  const ref = id ? col.doc(id) : col.doc();
  const vendorRef = db.collection(FirestoreCollections.VENDORS).doc(po.vendorId);
  const counterRef = db.collection(FirestoreCollections.COUNTERS).doc(`purchaseOrder-${today}`);
  const status = poStatusOnSave(caller.role, po.total, settings.poApproval);

  return db.runTransaction(async (tx) => {
    // reads first
    const vendor = await tx.get(vendorRef);
    if (!vendor.exists) fail("not-found", "ఆ సరఫరాదారు దొరకలేదు.", "Vendor not found.");
    const vendorName = asStr((vendor.data() as Doc).name);
    const cur = id ? await tx.get(ref) : null;
    if (id && !cur?.exists) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Purchase order not found.");
    const old = (cur?.data() ?? {}) as Doc;
    const branchId = id ? asStr(old.branchId) : caller.role === "admin" ? asStr(data.branchId) || caller.branchId : caller.branchId;
    if (!branchId) fail("invalid-argument", "ముందు branch ఎంచుకోండి.", "Choose a branch first.");
    if (id) {
      if (caller.role !== "admin" && caller.branchId !== branchId) fail("permission-denied", "ఈ branch ఆర్డర్‌ను మార్చడానికి మీకు అనుమతి లేదు.", "You can't change an order of another branch.");
      if (!canEditPo(asStr(old.status))) fail("failed-precondition", "ఆమోదం అయిన ఆర్డర్‌ను మార్చలేరు. రద్దు చేసి కొత్తది రాయండి.", "An approved order can't be changed. Cancel it and write a new one.");
    }
    // the request link is fixed when the order is first written
    const prId = id ? asStr(old.prId) : po.prId;
    let sodRequestedBy = asStr(old.sodRequestedBy);
    const prRef = prId ? db.collection(FirestoreCollections.PURCHASE_REQUESTS).doc(prId) : null;
    if (!id && prRef) {
      const pr = await tx.get(prRef);
      if (!pr.exists) fail("not-found", "ఆ అభ్యర్థన దొరకలేదు.", "Purchase request not found.");
      const p = pr.data() as Doc;
      sodRequestedBy = asStr(p.requestedBy); // Module 4d: separation of duties starts with who asked
      if (asStr(p.branchId) !== branchId) fail("failed-precondition", "అభ్యర్థన వేరే branch ది.", "The request belongs to another branch.");
      if (!canOrderFromPr(asStr(p.status))) fail("failed-precondition", "ఆమోదం అయిన అభ్యర్థన నుంచే ఆర్డర్ రాయగలరు.", "An order can be written only from an approved request.");
    }
    let number = asStr(old.number);
    let counter = 0;
    if (!id) {
      counter = asNum(((await tx.get(counterRef)).data() ?? {}).last) + 1;
      number = docNumber("PO", today, counter);
    }

    // writes
    const fields = { vendorId: po.vendorId, vendorName, expectedDay: po.expectedDay, terms: po.terms, lines: po.lines, total: po.total, status, decideReason: "", updatedAt: stamp(), updatedBy: caller.uid };
    const approvedBy = status === "approved" ? { approvedBy: caller.uid, approvedByName: caller.name, approvedAt: stamp() } : { approvedBy: "", approvedByName: "" };
    if (id) tx.update(ref, { ...fields, ...approvedBy });
    else {
      tx.set(counterRef, { kind: "purchaseOrder", day: today, last: counter, updatedAt: stamp() }, { merge: true });
      tx.set(ref, { ...fields, ...approvedBy, number, prId, branchId, sodRequestedBy, receivedByUids: [], orderDay: today, receivedQty: po.lines.map(() => 0), createdBy: caller.uid, createdByName: caller.name, createdAt: stamp() });
      if (prRef) tx.update(prRef, { status: "ordered", poId: ref.id, poNumber: number, updatedAt: stamp() });
    }
    if (status === "pendingApproval") {
      const [nid, n1] = notice("purchaseOrderApproval", ref.id, { roles: ["admin"] }, `ఆర్డర్ ${number} (₹${po.total}) మీ ఆమోదం కోసం — ${vendorName}`, `Order ${number} (₹${po.total}) waits for your approval — ${vendorName}`);
      tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(nid), n1);
    }
    return { ok: true, id: ref.id, number, status, total: po.total };
  });
});

export const decidePurchaseOrder = callable("decidePurchaseOrder", ADMIN, async (data, caller) => {
  const id = reqId(data, "id");
  const approve = reqBool(data, "approve");
  const reason = asStr(data.reason).trim().slice(0, 300);
  if (!approve && !reason) fail("invalid-argument", "తిరస్కరించడానికి కారణం రాయండి.", "Give a reason to reject.");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PURCHASE_ORDERS).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Purchase order not found.");
    const cur = snap.data() as Doc;
    if (!canDecidePo(asStr(cur.status))) fail("failed-precondition", "ఈ ఆర్డర్ ఆమోదం కోసం ఎదురుచూడటం లేదు.", "This order is not waiting for approval.");
    const status = approve ? "approved" : "rejected";
    tx.update(ref, { status, decideReason: reason, approvedBy: approve ? caller.uid : "", approvedByName: approve ? caller.name : "", ...(approve ? { approvedAt: stamp() } : {}), updatedAt: stamp(), updatedBy: caller.uid });
    const num = asStr(cur.number);
    const [nid, n1] = notice("purchaseOrderDecided", id, { uids: [asStr(cur.createdBy)] }, approve ? `ఆర్డర్ ${num} ఆమోదించారు` : `ఆర్డర్ ${num} తిరస్కరించారు: ${reason}`, approve ? `Order ${num} was approved` : `Order ${num} was rejected: ${reason}`);
    tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(nid), n1);
    return { ok: true, status };
  });
});

export const cancelPurchaseOrder = callable("cancelPurchaseOrder", ADMIN_MANAGER, async (data, caller) => {
  const id = reqId(data, "id");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.PURCHASE_ORDERS).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ ఆర్డర్ దొరకలేదు.", "Purchase order not found.");
    const cur = snap.data() as Doc;
    if (caller.role !== "admin" && caller.branchId !== asStr(cur.branchId)) fail("permission-denied", "ఈ branch ఆర్డర్‌ను రద్దు చేయడానికి మీకు అనుమతి లేదు.", "You can't cancel an order of another branch.");
    if (!canCancelPo(asStr(cur.status))) fail("failed-precondition", "సరుకు అందిన ఆర్డర్‌ను రద్దు చేయలేరు.", "An order with goods received can't be cancelled.");
    tx.update(ref, { status: "cancelled", cancelReason: reason, cancelledBy: caller.uid, cancelledAt: stamp(), updatedAt: stamp(), updatedBy: caller.uid });
    const prId = asStr(cur.prId);
    if (prId) tx.update(db.collection(FirestoreCollections.PURCHASE_REQUESTS).doc(prId), { status: "approved", poId: "", poNumber: "", updatedAt: stamp() });
    return { ok: true };
  });
});
