/**
 * R7-2: purchases move stock. A trigger compares the lines that carry inventoryItemId with what the purchase has
 * already applied (`stockApplied`) and writes IN / OUT movements for the difference — editing, cancelling or deleting
 * a purchase reverses its stock. Idempotent; stock never goes below 0 (the missing part is noted as shortBy).
 * F4: line quantities are converted to the stock item's unit (500 Gram → 0.5 kg); a line in a unit that cannot be
 * converted (Packet) moves nothing, is listed in `stockSkipped` on the purchase and raises an in-app notice.
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asNum, asStr, Doc } from "../shared/coerce";
import { sameValue } from "../shared/historyDiff";
import { purchaseStockDelta } from "../calc/round7";
import { round2 } from "../calc/util";
import { appliedStock, purchaseStockLines, stockSkippedText } from "./purchaseStockRules";
import { normalizePacks } from "../shared/itemUnits";
import { purchaseExpiryByItem } from "./batchRules";
import { frozenFactors } from "../shared/uomRules";
import { isLiveRecord } from "../shared/costTarget";

export const stockOnPurchase = onDocumentWritten(
  { document: "purchases/{purchaseId}", region: REGION },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>) => {
    const purchaseId = event.params.purchaseId;
    const previous = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const db = getFirestore();
    const c = FirestoreCollections;
    const ref = db.collection(c.PURCHASES).doc(purchaseId);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? (snap.data() as Doc) : undefined;
        const applied = appliedStock(current, previous);
        const lineIds = (Array.isArray(current?.items) ? (current?.items as unknown[]) : []).map((it) => asStr((it as Doc)?.inventoryItemId)).filter(Boolean);
        const ids = [...new Set([...lineIds, ...Object.keys(applied)])];
        const invSnaps = ids.length ? await tx.getAll(...ids.map((id) => db.collection(c.INVENTORY).doc(id))) : [];
        const exists = new Map(invSnaps.map((s) => [s.id, s]));
        const units = Object.fromEntries(invSnaps.filter((s) => s.exists).map((s) => [s.id, asStr((s.data() as Doc).unit)]));
        // Module 2a: the stock item's own pack sizes (kept in step with the grocery item by syncItemPacks)
        const packs = Object.fromEntries(invSnaps.filter((s) => s.exists).map((s) => [s.id, normalizePacks((s.data() as Doc).packs)]));
        // Module 2h: a conversion this purchase already used stays as it was, whatever the packs are today
        const lines = purchaseStockLines(current, units, packs, frozenFactors(current?.stockConversions));
        const conversionsChanged = !!current && isLiveRecord(current) && !sameValue(current.stockConversions ?? [], lines.conversions);
        const expiryByItem = purchaseExpiryByItem(current?.items);
        const wantedAll = lines.wanted;
        const skipped = lines.skipped.filter((x) => exists.get(x.inventoryItemId)?.exists); // missing stock items: nothing to move anyway
        const notifRef = db.collection(c.NOTIFICATIONS).doc(`stockSkipped_${purchaseId}`);
        const skippedChanged = !!current && !sameValue(current.stockSkipped ?? [], skipped);
        // Lines pointing at a missing stock item are left out (nothing to move).
        const wanted = Object.fromEntries(Object.entries(wantedAll).filter(([k]) => exists.get(k)?.exists));
        const delta = purchaseStockDelta(wanted, applied);
        const next: Record<string, number> = { ...applied };
        let changed = false;
        for (const [id, d] of Object.entries(delta)) {
          const s = exists.get(id);
          if (!s?.exists) {
            delete next[id];
            changed = true;
            continue;
          }
          const stock = asNum((s.data() as Doc).quantityInStock);
          const move = d > 0 ? d : -Math.min(-d, Math.max(0, stock));
          const shortBy = d < 0 ? round2(-d + move) : 0;
          if (move === 0) continue;
          tx.set(s.ref.collection(c.MOVEMENTS).doc(), {
            type: move > 0 ? "IN" : "OUT",
            quantity: Math.abs(move),
            reason: move > 0 ? "purchase" : "purchase-reversed",
            purchaseId,
            // Module 2d: the expiry date typed on the purchase line opens a batch for a tracked item (stock/batches)
            ...(move > 0 && expiryByItem[id] ? expiryByItem[id] : {}),
            shortBy,
            relatedBookingId: asStr((current ?? previous)?.bookingId),
            date: FieldValue.serverTimestamp(),
            recordedBy: "system",
          });
          tx.update(s.ref, { quantityInStock: round2(Math.max(0, stock + move)), lastUpdated: FieldValue.serverTimestamp(), updatedBy: "system" });
          next[id] = round2((next[id] ?? 0) + move);
          if (next[id] === 0) delete next[id];
          changed = true;
        }
        if (current && (changed || skippedChanged || conversionsChanged)) tx.update(ref, { ...(changed ? { stockApplied: next } : {}), ...(skippedChanged ? { stockSkipped: skipped } : {}), ...(conversionsChanged ? { stockConversions: lines.conversions } : {}) });
        if (skippedChanged && skipped.length) {
          tx.set(notifRef, {
            kind: "stock-unit",
            audienceRoles: ["admin", "manager"],
            title: stockSkippedText(asStr(current?.purchaseNumber) || purchaseId, skipped),
            link: `/purchases/${purchaseId}`,
            purchaseId,
            branchId: asStr(current?.branchId),
            readBy: [],
            createdAt: FieldValue.serverTimestamp(),
          });
        } else if (skippedChanged) tx.delete(notifRef); // fixed (or cancelled): the notice goes away
      });
    } catch (e) {
      logger.error("purchase stock update failed", purchaseId, e);
    }
  },
);
