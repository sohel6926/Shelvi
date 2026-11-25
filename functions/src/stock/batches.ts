/**
 * Module 2d (18 Nov 2026) — batches with an expiry date.
 *  - applyBatchOnMovement: every stock movement (purchase, manual, event, reversal) passes here. For an item marked
 *    trackExpiry: an IN movement that carries expiryDay opens a batch; then the batches are kept within the stock,
 *    earliest expiry first (stock/batchRules.reconcileBatches). The item gets 🔒 nearestExpiry and 🔒 batchQty.
 *  - expiryWatch: every morning, one notice to the owner and managers about items past or close to their date.
 * Batches live in inventory/{id}/batches and are written only here.
 */
import { REGION, TIME_ZONE } from "../setup";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FirestoreCollections, BUSINESS_SETTINGS_DOC } from "../shared/firestorePaths";
import { asNum, asStr, Doc } from "../shared/coerce";
import { istDay } from "../shared/istDate";
import { Batch, expiredQty, heldQty, expiryNoticeText, expiryStatus, ExpiryRow, isExpiryDay, nearestExpiry, normalizeExpiryAlert, reconcileBatches } from "./batchRules";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const applyBatchOnMovement = onDocumentCreated({ document: "inventory/{itemId}/movements/{movementId}", region: REGION }, async (event) => {
  const db = getFirestore();
  const itemRef = db.collection(FirestoreCollections.INVENTORY).doc(event.params.itemId);
  const moveRef = itemRef.collection(FirestoreCollections.MOVEMENTS).doc(event.params.movementId);
  await db.runTransaction(async (tx) => {
    const [itemSnap, moveSnap] = await Promise.all([tx.get(itemRef), tx.get(moveRef)]);
    if (!itemSnap.exists || !moveSnap.exists) return;
    const item = itemSnap.data() as Doc;
    const move = moveSnap.data() as Doc;
    if (move.batchApplied === true) return; // delivered twice: already done
    if (item.trackExpiry !== true) return; // not a tracked item: no batches at all
    const batchSnaps = await tx.get(itemRef.collection("batches").where("qty", ">", 0));
    const batches: Batch[] = batchSnaps.docs.map((d) => {
      const x = d.data() as Doc;
      return { id: d.id, qty: asNum(x.qty), expiryDay: asStr(x.expiryDay), receivedAtMs: x.receivedAt instanceof Timestamp ? x.receivedAt.toMillis() : 0, hold: x.hold === true };
    });
    // An IN movement with a real expiry date opens a batch (id = the movement id, so it can never be opened twice).
    const qty = asNum(move.quantity);
    if (move.type === "IN" && qty > 0 && isExpiryDay(move.expiryDay)) {
      const newBatch: Batch = { id: event.params.movementId, qty, expiryDay: move.expiryDay, receivedAtMs: Date.now() };
      batches.push(newBatch);
      tx.set(itemRef.collection("batches").doc(newBatch.id), {
        qty,
        receivedQty: qty,
        expiryDay: move.expiryDay,
        batchNo: asStr(move.batchNo),
        reason: asStr(move.reason),
        purchaseId: asStr(move.purchaseId),
        receivedAt: FieldValue.serverTimestamp(),
      });
    }
    const stockNow = asNum(item.quantityInStock);
    const changes = reconcileBatches(stockNow, batches);
    for (const c of changes) {
      // set + merge so a batch opened in this same transaction is reduced correctly too
      tx.set(itemRef.collection("batches").doc(c.id), { qty: c.qty, lastUsedAt: FieldValue.serverTimestamp() }, { merge: true });
      const b = batches.find((x) => x.id === c.id);
      if (b) b.qty = c.qty;
    }
    tx.update(itemRef, { nearestExpiry: nearestExpiry(batches), batchQty: r3(batches.reduce((s, b) => s + Math.max(0, b.qty), 0)), expiredQty: expiredQty(batches, istDay(new Date())), heldQty: heldQty(batches) });
    tx.update(moveRef, { batchApplied: true, batchesUsed: changes.filter((c) => c.taken > 0).map((c) => ({ batchId: c.id, taken: c.taken })) });
  });
});

/** Every morning 07:00 IST: tracked items whose nearest batch is past its date or within settings.expiryAlert.days. */
export const expiryWatch = onSchedule({ schedule: "0 7 * * *", timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 120 }, async () => {
  const db = getFirestore();
  const cfg = normalizeExpiryAlert(((await db.collection(FirestoreCollections.SETTINGS).doc(BUSINESS_SETTINGS_DOC).get()).data() ?? {}).expiryAlert);
  const today = istDay(new Date());
  const snap = await db.collection(FirestoreCollections.INVENTORY).where("trackExpiry", "==", true).get();
  // X7: a date passes with time, not with a stock movement — so every morning the expired quantity of each tracked
  // item is worked out again (it is kept out of buying lists and reservations). This runs even when the notice is off.
  for (const d of snap.docs) {
    const x = d.data() as Doc;
    // Module 5d: an item with a batch on hold is always worked out from its batches
    if ((!asStr(x.nearestExpiry) || asStr(x.nearestExpiry) >= today) && !(asNum(x.heldQty) > 0)) {
      if (asNum(x.expiredQty) !== 0) await d.ref.update({ expiredQty: 0 });
      continue;
    }
    const bs = await d.ref.collection("batches").where("qty", ">", 0).get();
    const exp = expiredQty(bs.docs.map((b) => ({ id: b.id, qty: asNum((b.data() as Doc).qty), expiryDay: asStr((b.data() as Doc).expiryDay), receivedAtMs: 0, hold: (b.data() as Doc).hold === true })), today);
    if (asNum(x.expiredQty) !== exp) await d.ref.update({ expiredQty: exp });
  }
  if (!cfg.on) return;
  const rows: ExpiryRow[] = [];
  for (const d of snap.docs) {
    const x = d.data() as Doc;
    if (x.archived === true || x.isDeleted === true) continue;
    const status = expiryStatus(asStr(x.nearestExpiry), today, cfg.days);
    if (status === "expired" || status === "soon") rows.push({ name: asStr(x.name) || asStr(x.nameTe) || asStr(x.nameEn) || d.id, expiryDay: asStr(x.nearestExpiry), status });
  }
  const text = expiryNoticeText(rows, cfg.days);
  if (!text) return;
  await db.collection(FirestoreCollections.NOTIFICATIONS).doc(`expiry_${today}`).set({
    kind: "stockExpiry",
    audienceRoles: ["admin", "manager"],
    recipientUids: [],
    title: text,
    link: "/inventory",
    expired: rows.filter((r) => r.status === "expired").length,
    soon: rows.filter((r) => r.status === "soon").length,
    readBy: [],
    createdAt: FieldValue.serverTimestamp(),
  });
});
