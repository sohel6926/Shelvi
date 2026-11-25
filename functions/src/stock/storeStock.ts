/**
 * Module 5c — stock by store: transferStock, setItemHomeStore, and the helpers adjustStock uses.
 * Rules: storeRules.ts.
 */
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqId, reqNum } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { branchTransferProblem, BRANCH_TRANSFER_TEXT, matchItem } from "./branchTransferRules";
import { afterStoreChange, afterTransfer, balanceIn, cleanStoreQty, homeStoreOf, rehome, transferProblem } from "./storeRules";

export async function branchStores(db: Firestore, branchId: string): Promise<{ id: string; data: Doc }[]> {
  if (!branchId) return [];
  return (await db.collection("stores").where("branchId", "==", branchId).get()).docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
}

const PROBLEM: Record<string, { code: "invalid-argument" | "failed-precondition" | "not-found" | "permission-denied"; te: string; en: string }> = {
  "bad-quantity": { code: "invalid-argument", te: "పరిమాణం 0 కంటే ఎక్కువ ఉండాలి.", en: "The quantity must be more than 0." },
  "same-store": { code: "invalid-argument", te: "ఒకే స్టోర్ నుంచి అదే స్టోర్‌కు బదిలీ కుదరదు.", en: "Stock cannot be transferred to the same store." },
  "no-store": { code: "not-found", te: "ఆ స్టోర్ దొరకలేదు.", en: "That store was not found." },
  "other-branch": { code: "failed-precondition", te: "ఈ వస్తువు శాఖలోని స్టోర్ల మధ్యే బదిలీ చేయగలరు.", en: "Stock can be transferred only between stores of the item's own branch." },
  "not-in-use": { code: "failed-precondition", te: "ఆ స్టోర్ ఇప్పుడు వాడుకలో లేదు.", en: "That store is not in use now." },
  blocked: { code: "permission-denied", te: "వేరుగా ఉంచిన / వ్యర్థ స్టోర్ నుంచి సరుకు తీయడం యజమాని మాత్రమే చేయగలరు.", en: "Only the owner can take stock out of a quarantine or scrap store." },
  "not-enough": { code: "failed-precondition", te: "ఆ స్టోర్‌లో అంత నిల్వ లేదు.", en: "That store does not hold that much." },
};

/**
 * transferStock { itemId, fromStoreId, toStoreId, quantity, note? } — owner / manager of the branch. The item's total
 * does not change; an Out movement and an In movement are written (MDF-01 §14 rule 4).
 */
export const transferStock = callable("transferStock", ADMIN_MANAGER, async (data, caller) => {
  const itemId = reqId(data, "itemId");
  const fromStoreId = reqId(data, "fromStoreId");
  const toStoreId = reqId(data, "toStoreId");
  const quantity = Math.round(reqNum(data, "quantity", { min: 0.001 }) * 1000) / 1000;
  const note = optString(data, "note", 300) ?? "";
  const db = getFirestore();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(itemId);
  const pre = await itemRef.get();
  if (!pre.exists) fail("not-found", "ఆ stock వస్తువు దొరకలేదు.", "Inventory item not found.");
  const branchId = asStr((pre.data() as Doc).branchId);
  assertAdminOrOwnBranch(caller, branchId);
  const stores = await branchStores(db, branchId);
  const out = await db.runTransaction(async (tx) => {
    const item = (await tx.get(itemRef)).data() as Doc;
    const home = homeStoreOf(item, stores);
    const storeQty = cleanStoreQty(item.storeQty, home);
    const problem = transferProblem({ total: asNum(item.quantityInStock), storeQty, homeStoreId: home, fromStoreId, toStoreId, quantity, itemBranchId: branchId, from: stores.find((s) => s.id === fromStoreId)?.data, to: stores.find((s) => s.id === toStoreId)?.data, isOwner: caller.role === "admin" });
    if (problem) fail(PROBLEM[problem].code, PROBLEM[problem].te, PROBLEM[problem].en);
    const next = afterTransfer(storeQty, home, fromStoreId, toStoreId, quantity);
    const moves = itemRef.collection(FirestoreCollections.MOVEMENTS);
    const outRef = moves.doc();
    const base = { quantity, reason: "transfer", note, transferId: outRef.id, fromStoreId, toStoreId, date: FieldValue.serverTimestamp(), recordedBy: caller.uid };
    // XFER_* never changes quantityInStock: every reader that adds up IN / OUT ignores these
    tx.set(outRef, { ...base, type: "XFER_OUT", storeId: fromStoreId });
    tx.set(moves.doc(), { ...base, type: "XFER_IN", storeId: toStoreId });
    tx.update(itemRef, { storeQty: next, homeStoreId: home, lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    return { transferId: outRef.id, storeQty: next, homeStoreId: home };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "transferStock", collection: FirestoreCollections.INVENTORY, docId: itemId, before: {}, after: { fromStoreId, toStoreId, quantity, note } });
  return { ok: true, ...out };
});

/**
 * setItemHomeStore { itemId, storeId } — names the store an item normally lives in. Nothing moves: every store keeps
 * its balance (storeRules.rehome).
 */
export const setItemHomeStore = callable("setItemHomeStore", ADMIN_MANAGER, async (data, caller) => {
  const itemId = reqId(data, "itemId");
  const storeId = reqId(data, "storeId");
  const db = getFirestore();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(itemId);
  const pre = await itemRef.get();
  if (!pre.exists) fail("not-found", "ఆ stock వస్తువు దొరకలేదు.", "Inventory item not found.");
  const branchId = asStr((pre.data() as Doc).branchId);
  assertAdminOrOwnBranch(caller, branchId);
  const stores = await branchStores(db, branchId);
  const target = stores.find((s) => s.id === storeId);
  if (!target) fail("not-found", "ఆ స్టోర్ ఈ శాఖలో దొరకలేదు.", "That store was not found in this branch.");
  if (target!.data.status === "archived" || target!.data.status === "inactive") fail("failed-precondition", "ఆ స్టోర్ ఇప్పుడు వాడుకలో లేదు.", "That store is not in use now.");
  if (target!.data.issueBlocked === true) fail("failed-precondition", "వేరుగా ఉంచిన / వ్యర్థ స్టోర్‌ను సాధారణ స్టోర్‌గా పెట్టలేరు.", "A quarantine or scrap store cannot be an item's normal store.");
  const out = await db.runTransaction(async (tx) => {
    const item = (await tx.get(itemRef)).data() as Doc;
    const oldHome = homeStoreOf(item, stores);
    if (oldHome === storeId && asStr(item.homeStoreId) === storeId) return { homeStoreId: storeId, changed: false };
    const next = rehome(asNum(item.quantityInStock), cleanStoreQty(item.storeQty, oldHome), oldHome, storeId);
    tx.update(itemRef, { homeStoreId: storeId, storeQty: next, updatedBy: caller.uid, lastUpdated: FieldValue.serverTimestamp() });
    return { homeStoreId: storeId, changed: true, from: oldHome };
  });
  if (out.changed) await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "setItemHomeStore", collection: FirestoreCollections.INVENTORY, docId: itemId, before: { homeStoreId: out.from ?? "" }, after: { homeStoreId: storeId } });
  return { ok: true, homeStoreId: storeId };
});

/**
 * transferToBranch { itemId, toBranchId, quantity, fromStoreId?, note? } — Module 6a. Owner (any branch) or manager
 * (from their own branch). Takes the quantity out of the item (from `fromStoreId`, default its home store) and adds it to
 * the same item of the other branch (its home store). Two movements share a transferId; no money moves.
 */
export const transferToBranch = callable("transferToBranch", ADMIN_MANAGER, async (data, caller) => {
  const itemId = reqId(data, "itemId");
  const toBranchId = reqId(data, "toBranchId");
  const quantity = Math.round(reqNum(data, "quantity", { min: 0.001 }) * 1000) / 1000;
  const note = optString(data, "note", 300) ?? "";
  const fromStoreWanted = optString(data, "fromStoreId", 200) ?? "";
  const db = getFirestore();
  const c = FirestoreCollections;
  const srcRef = db.collection(c.INVENTORY).doc(itemId);
  const pre = await srcRef.get();
  if (!pre.exists) fail("not-found", "ఆ stock వస్తువు దొరకలేదు.", "Inventory item not found.");
  const fromBranchId = asStr((pre.data() as Doc).branchId);
  assertAdminOrOwnBranch(caller, fromBranchId);
  const toBranch = await db.collection(c.BRANCHES).doc(toBranchId).get();
  if (!toBranch.exists) fail("not-found", "ఆ శాఖ దొరకలేదు.", "That branch was not found.");
  const candidates = (await db.collection(c.INVENTORY).where("branchId", "==", toBranchId).get()).docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
  const fromStores = await branchStores(db, fromBranchId);
  const toStores = await branchStores(db, toBranchId);
  const out = await db.runTransaction(async (tx) => {
    const src = (await tx.get(srcRef)).data() as Doc;
    const match = matchItem(src, candidates);
    const home = homeStoreOf(src, fromStores);
    const fromStoreId = fromStoreWanted || home;
    const fromStore = fromStores.find((s) => s.id === fromStoreId);
    if (!fromStore) fail("not-found", "ఆ స్టోర్ ఈ శాఖలో దొరకలేదు.", "That store was not found in this branch.");
    if (fromStore!.data.issueBlocked === true && caller.role !== "admin") fail("permission-denied", PROBLEM.blocked.te, PROBLEM.blocked.en);
    const map = cleanStoreQty(src.storeQty, home);
    const total = asNum(src.quantityInStock);
    const problem = branchTransferProblem({ quantity, fromBranchId, toBranchId, source: src, match, balance: balanceIn(total, map, home, fromStoreId) });
    if (problem) fail(problem === "not-enough" ? "failed-precondition" : "invalid-argument", BRANCH_TRANSFER_TEXT[problem].te, BRANCH_TRANSFER_TEXT[problem].en);
    const destRef = db.collection(c.INVENTORY).doc((match as { id: string }).id);
    const dest = (await tx.get(destRef)).data() as Doc;
    const destHome = homeStoreOf(dest, toStores);
    const transferId = srcRef.collection(c.MOVEMENTS).doc().id;
    const base = { quantity, reason: "branch-transfer", note, transferId, fromBranchId, toBranchId, date: FieldValue.serverTimestamp(), recordedBy: caller.uid };
    tx.set(srcRef.collection(c.MOVEMENTS).doc(transferId), { ...base, type: "OUT", storeId: fromStoreId, counterpartItemId: destRef.id });
    tx.set(destRef.collection(c.MOVEMENTS).doc(), { ...base, type: "IN", ...(destHome ? { storeId: destHome } : {}), counterpartItemId: itemId });
    tx.update(srcRef, { quantityInStock: Math.round((total - quantity) * 1000) / 1000, storeQty: afterStoreChange(map, home, fromStoreId, -quantity), homeStoreId: home, lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    tx.update(destRef, { quantityInStock: Math.round((asNum(dest.quantityInStock) + quantity) * 1000) / 1000, ...(destHome ? { homeStoreId: destHome } : {}), lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
    return { transferId, toItemId: destRef.id };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "transferToBranch", collection: c.INVENTORY, docId: itemId, before: { branchId: fromBranchId }, after: { toBranchId, toItemId: out.toItemId, quantity, note } });
  return { ok: true, ...out };
});

/**
 * setItemLocation { itemId, storeId, location } — Module 6a: where in a store an item is kept ("Zone / Rack / Shelf / Bin").
 * The place must be one the owner wrote in that store's list; "" clears it. Nothing moves; stock is not counted per shelf.
 */
export const setItemLocation = callable("setItemLocation", ADMIN_MANAGER, async (data, caller) => {
  const itemId = reqId(data, "itemId");
  const storeId = reqId(data, "storeId");
  const location = (optString(data, "location", 200) ?? "").trim();
  const db = getFirestore();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(itemId);
  const item = await itemRef.get();
  if (!item.exists) fail("not-found", "ఆ stock వస్తువు దొరకలేదు.", "Inventory item not found.");
  const branchId = asStr((item.data() as Doc).branchId);
  assertAdminOrOwnBranch(caller, branchId);
  const store = (await branchStores(db, branchId)).find((s) => s.id === storeId);
  if (!store) fail("not-found", "ఆ స్టోర్ ఈ శాఖలో దొరకలేదు.", "That store was not found in this branch.");
  const known = Array.isArray(store!.data.locations) ? (store!.data.locations as unknown[]).map((x) => asStr(x)) : [];
  if (location && !known.includes(location)) fail("failed-precondition", "ఆ స్థానం ఈ స్టోర్ జాబితాలో లేదు. ముందు \"కంపెనీ · బ్రాండ్ · శాఖలు\" తెరలో స్టోర్‌కు స్థానాలు రాయండి.", "That place is not in this store's list. Add the store's locations on the Company · Brands · Branches screen first.");
  const prev = (item.data() as Doc).binLocation;
  const map: Record<string, string> = typeof prev === "object" && prev !== null ? Object.fromEntries(Object.entries(prev as Doc).map(([k, v]) => [k, asStr(v)]).filter(([, v]) => v)) : {};
  if (location) map[storeId] = location;
  else delete map[storeId];
  await itemRef.update({ binLocation: map, lastUpdated: FieldValue.serverTimestamp(), updatedBy: caller.uid });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "setItemLocation", collection: FirestoreCollections.INVENTORY, docId: itemId, before: {}, after: { storeId, location } });
  return { ok: true, binLocation: map };
});
