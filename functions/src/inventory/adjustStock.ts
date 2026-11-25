import { REGION } from "../setup";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { requireActiveUser, assertAdminOrOwnBranch, CallerContext } from "../auth/authContext";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { callableDecision } from "../roles/callablePerms";
import { loadSettings } from "../shared/settings";
import { fail } from "../shared/errors";
import { reqBool, reqId } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { canApproveAdjust, decideProblem, isMaterial } from "./adjustRules";
import { branchStores } from "../stock/storeStock";
import { afterStoreChange, balanceIn, cleanStoreQty, homeStoreOf } from "../stock/storeRules";
import { FirestoreCollections } from "../shared/firestorePaths";
import { writeAuditEntry } from "../shared/auditLog";
import { guard } from "../shared/errors";
import { isExpiryDay } from "../stock/batchRules";

interface AdjustStockRequest {
  itemId: string;
  type: "IN" | "OUT";
  quantity: number;
  reason?: string;
  note?: string;
  relatedBookingId?: string;
  /** Module 2d: for an IN on an item that tracks expiry — the date on the pack (YYYY-MM-DD) and its batch number. */
  expiryDay?: string;
  batchNo?: string;
  /** Module 5c: the store the change happened in ("" / missing = the item's home store) */
  storeId?: string;
}

/** R7-2: manual stock changes must say why. Purchases and events move stock through their own triggers. */
export const ADJUST_REASONS = ["count", "damage", "return", "correction"] as const;

/**
 * Mirrors data/repository/InventoryRepository.kt's adjustStock: same transaction shape
 * (update quantityInStock + write a movements doc atomically), plus server-side re-validation
 * that OUT adjustments never push stock negative, and an audit log entry.
 */
export const adjustStock = onCall({ region: REGION }, (request) => guard(async () => {
  const caller = await requireActiveUser(request);
  const { itemId, type, quantity, reason, note, relatedBookingId, expiryDay, batchNo, storeId } = (request.data ?? {}) as AdjustStockRequest;
  if (storeId !== undefined && storeId !== null && (typeof storeId !== "string" || storeId.includes("/") || storeId.length > 200)) {
    throw new HttpsError("invalid-argument", "storeId is not valid.", { te: "స్టోర్ సరిగా లేదు.", en: "The store is not valid." });
  }
  if (expiryDay !== undefined && expiryDay !== null && expiryDay !== "" && (type !== "IN" || !isExpiryDay(expiryDay))) {
    throw new HttpsError("invalid-argument", "expiryDay must be a real date YYYY-MM-DD on a stock IN.", {
      te: "గడువు తేదీ సరిగా లేదు (stock లోపలికి వచ్చినప్పుడు మాత్రమే పెట్టవచ్చు).",
      en: "Expiry date is not valid (it can only be set when stock comes in).",
    });
  }
  if (!(ADJUST_REASONS as readonly string[]).includes(reason ?? "")) {
    throw new HttpsError("invalid-argument", "reason must be count, damage, return or correction.", {
      te: "కారణం ఎంచుకోండి: లెక్కింపు (count), పాడైంది (damage), తిరిగి ఇచ్చింది (return), సరిచేయడం (correction).",
      en: "reason must be one of count, damage, return, correction.",
    });
  }

  if (!itemId || (type !== "IN" && type !== "OUT")) {
    throw new HttpsError("invalid-argument", "itemId and a valid type (IN/OUT) are required.", { te: "వస్తువు, IN/OUT రకం ఇవ్వాలి.", en: "itemId and a valid type (IN/OUT) are required." });
  }
  if (typeof quantity !== "number" || !(quantity > 0)) {
    throw new HttpsError("invalid-argument", "quantity must be a positive number.", { te: "పరిమాణం 0 కంటే ఎక్కువ ఉండాలి.", en: "quantity must be a positive number." });
  }

  // Module 4d: the job role is checked here too (this callable predates shared/callable.ts)
  if (callableDecision("adjustStock", ["admin", "manager", "staff"], caller.role, caller.jobRole) !== "allow") {
    throw new HttpsError("permission-denied", "Job role cannot adjust stock.", { te: "మీ పని పాత్రకు స్టాక్ మార్చే అనుమతి లేదు.", en: "Your job role is not allowed to change stock." });
  }

  const db = getFirestore();
  const change: StockChange = { itemId, type, quantity, reason: reason ?? "", note: typeof note === "string" ? note.slice(0, 500) : "", relatedBookingId: relatedBookingId ?? "", expiryDay: type === "IN" && isExpiryDay(expiryDay) ? expiryDay : "", batchNo: typeof batchNo === "string" ? batchNo.trim().slice(0, 60) : "", storeId: typeof storeId === "string" ? storeId : "" };

  // B5: a material hand change by someone who may not approve stock waits for a supervisor
  if (!canApproveAdjust(caller.role, caller.jobRole)) {
    const itemSnap = await db.collection(FirestoreCollections.INVENTORY).doc(itemId).get();
    if (!itemSnap.exists) throw new HttpsError("not-found", "Inventory item not found.", { te: "ఆ stock వస్తువు దొరకలేదు.", en: "Inventory item not found." });
    const item = itemSnap.data() ?? {};
    const branchId = typeof item.branchId === "string" ? item.branchId : "";
    assertAdminOrOwnBranch(caller, branchId);
    const currentQty: number = typeof item.quantityInStock === "number" ? item.quantityInStock : 0;
    const settings = await loadSettings();
    if (isMaterial(settings.stockAdjust, { quantity, currentQty, reason: change.reason })) {
      if (type === "OUT" && currentQty - quantity < 0) {
        throw new HttpsError("failed-precondition", "This would take stock below zero.", { te: "Stock సున్నా కంటే తక్కువ అవుతుంది — తీయలేము.", en: "This would take stock below zero." });
      }
      const itemName = typeof item.name === "string" ? item.name : "";
      const ref = db.collection(FirestoreCollections.STOCK_ADJUST_REQUESTS).doc();
      const batch = db.batch();
      batch.set(ref, { ...change, itemName, unit: typeof item.unit === "string" ? item.unit : "", branchId, qtyAtRequest: currentQty, status: "pending", requestedBy: caller.uid, requestedByName: caller.name, requestedAt: FieldValue.serverTimestamp(), decidedBy: "", decidedByName: "", decideNote: "" });
      batch.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`stockAdjust_${ref.id}`), {
        kind: "stockAdjustRequest", audienceRoles: ["admin", "manager"], recipientUids: [], branchId,
        title: { te: `స్టాక్ సవరణ ఆమోదం కావాలి: ${itemName} ${type === "IN" ? "+" : "−"}${quantity} — ${caller.name}`, en: `Stock adjustment needs approval: ${itemName} ${type === "IN" ? "+" : "−"}${quantity} — ${caller.name}` },
        link: "/inventory", readBy: [], createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "requestStockAdjust", collection: FirestoreCollections.STOCK_ADJUST_REQUESTS, docId: ref.id, before: { quantityInStock: currentQty }, after: { type, quantity, reason: change.reason } });
      return { ok: true, newQuantity: currentQty, pending: true, requestId: ref.id };
    }
  }

  const { before, after } = await applyStockChange(db, caller, change);

  await writeAuditEntry({
    uid: caller.uid,
    role: caller.role,
    action: "adjustStock",
    collection: FirestoreCollections.INVENTORY,
    docId: itemId,
    before: { quantityInStock: before },
    after: { quantityInStock: after, type, quantity },
  });

  return { ok: true, newQuantity: after };
}));

interface StockChange {
  itemId: string;
  type: "IN" | "OUT";
  quantity: number;
  reason: string;
  note: string;
  relatedBookingId: string;
  expiryDay: string;
  batchNo: string;
  /** Module 5c: "" = the home store */
  storeId?: string;
}

/** The stock change itself: quantity + one movement, in one transaction, never below zero. `recordedBy` = who asked. */
async function applyStockChange(db: Firestore, caller: CallerContext, c: StockChange, recordedBy: string = caller.uid, approvedBy = ""): Promise<{ before: number; after: number }> {
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(c.itemId);
  const movementRef = itemRef.collection(FirestoreCollections.MOVEMENTS).doc();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Inventory item not found.", { te: "ఆ stock వస్తువు దొరకలేదు.", en: "Inventory item not found." });
    }
    const itemData = snapshot.data() ?? {};
    assertAdminOrOwnBranch(caller, typeof itemData.branchId === "string" ? itemData.branchId : "");
    const currentQty: number = typeof itemData.quantityInStock === "number" ? itemData.quantityInStock : 0;
    const delta = c.type === "IN" ? c.quantity : -c.quantity;
    const newQty = currentQty + delta;
    if (newQty < 0) {
      throw new HttpsError("failed-precondition", "This would take stock below zero.", { te: "Stock సున్నా కంటే తక్కువ అవుతుంది — తీయలేము.", en: "This would take stock below zero." });
    }
    // Module 5c: the change lands in one store. Stores are looked up only when the item is spread over stores or a store was named.
    const spread = typeof itemData.storeQty === "object" && itemData.storeQty !== null && Object.keys(itemData.storeQty as object).length > 0;
    let storeFields: Record<string, unknown> = {};
    let storeId = "";
    if (c.storeId || spread) {
      const stores = await branchStores(db, typeof itemData.branchId === "string" ? itemData.branchId : "");
      const home = homeStoreOf(itemData, stores);
      storeId = c.storeId || home;
      const store = stores.find((s) => s.id === storeId);
      if (!store) throw new HttpsError("not-found", "Store not found in this branch.", { te: "ఆ స్టోర్ ఈ శాఖలో దొరకలేదు.", en: "That store was not found in this branch." });
      const map = cleanStoreQty(itemData.storeQty, home);
      if (c.type === "OUT" && balanceIn(currentQty, map, home, storeId) + 1e-9 < c.quantity) {
        throw new HttpsError("failed-precondition", "That store does not hold that much.", { te: "ఆ స్టోర్‌లో అంత నిల్వ లేదు. ముందు వేరే స్టోర్ నుంచి బదిలీ చేయండి.", en: "That store does not hold that much. Transfer from another store first." });
      }
      storeFields = { storeQty: afterStoreChange(map, home, storeId, delta), homeStoreId: home };
    }
    transaction.update(itemRef, { quantityInStock: newQty, ...storeFields, lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    transaction.set(movementRef, {
      type: c.type,
      quantity: c.quantity,
      reason: c.reason,
      note: c.note,
      relatedBookingId: c.relatedBookingId,
      ...(c.type === "IN" && c.expiryDay ? { expiryDay: c.expiryDay, batchNo: c.batchNo } : {}),
      ...(approvedBy ? { approvedBy } : {}),
      ...(storeId ? { storeId } : {}),
      date: FieldValue.serverTimestamp(),
      recordedBy,
    });
    return { before: currentQty, after: newQty };
  });
}

/**
 * decideStockAdjust { id, approve, note? } (admin / manager with Approve on inventory) — B5. Approve applies the
 * change now (against today's stock, never below zero); reject needs a note. Nobody but the owner decides their own.
 */
export const decideStockAdjust = callable("decideStockAdjust", ADMIN_MANAGER, async (data, caller) => {
  const id = reqId(data, "id");
  const approve = reqBool(data, "approve");
  const note = asStr(data.note).trim().slice(0, 300);
  if (!approve && !note) fail("invalid-argument", "తిరస్కరించడానికి కారణం రాయండి.", "Give a reason to reject.");
  if (!canApproveAdjust(caller.role, caller.jobRole)) fail("permission-denied", "స్టాక్ సవరణ ఆమోదించే అనుమతి మీకు లేదు.", "You are not allowed to approve stock adjustments.");
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.STOCK_ADJUST_REQUESTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "ఆ సవరణ అభ్యర్థన దొరకలేదు.", "That adjustment request was not found.");
  const req = snap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(req.branchId));
  const problem = decideProblem({ status: asStr(req.status), requestedBy: asStr(req.requestedBy) }, { uid: caller.uid, level: caller.role });
  if (problem === "not-pending") fail("failed-precondition", "ఈ అభ్యర్థనపై ఇప్పటికే నిర్ణయం అయింది.", "This request has already been decided.");
  if (problem === "own-request") fail("permission-denied", "మీరు అడిగిన సవరణను మీరే ఆమోదించలేరు. వేరొకరు (లేదా యజమాని) చేయాలి.", "You can't decide your own adjustment. Someone else (or the owner) must.");
  let after: number | null = null;
  if (approve) {
    const type = asStr(req.type) === "IN" ? "IN" : "OUT";
    const r = await applyStockChange(db, caller, { itemId: asStr(req.itemId), type, quantity: asNum(req.quantity), reason: asStr(req.reason), note: asStr(req.note), relatedBookingId: asStr(req.relatedBookingId), expiryDay: asStr(req.expiryDay), batchNo: asStr(req.batchNo), storeId: asStr(req.storeId) }, asStr(req.requestedBy), caller.uid);
    after = r.after;
  }
  const status = approve ? "approved" : "rejected";
  // a second approver may have got here first: only a still-pending request is closed
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as Doc;
    if (asStr(cur.status) !== "pending") return;
    tx.update(ref, { status, decidedBy: caller.uid, decidedByName: caller.name, decideNote: note, decidedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`stockAdjustDecided_${id}`), {
      kind: "stockAdjustDecided", audienceRoles: [], recipientUids: [asStr(req.requestedBy)].filter(Boolean),
      title: approve ? { te: `మీ స్టాక్ సవరణ ఆమోదించారు: ${asStr(req.itemName)}`, en: `Your stock adjustment was approved: ${asStr(req.itemName)}` } : { te: `మీ స్టాక్ సవరణ తిరస్కరించారు: ${asStr(req.itemName)} — ${note}`, en: `Your stock adjustment was rejected: ${asStr(req.itemName)} — ${note}` },
      link: "/inventory", readBy: [], createdAt: FieldValue.serverTimestamp(),
    });
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "decideStockAdjust", collection: FirestoreCollections.STOCK_ADJUST_REQUESTS, docId: id, before: { status: "pending" }, after: { status, note, ...(after !== null ? { quantityInStock: after } : {}) } });
  return { ok: true, status, newQuantity: after };
});
