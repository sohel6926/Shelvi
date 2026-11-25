/**
 * Module 2a (18 Nov 2026) — syncItemPacks: the owner types pack sizes once, on the grocery item ("1 Bag = 25 kg").
 * This trigger copies them to the linked stock item (inventory/{id}.packs, in the stock item's unit), so a purchase
 * in Bags goes into stock in kg (purchaseStock) and gives a rate per kg (rateRules). Nothing is copied when the two
 * units measure different things (kg vs pcs) — the stock item's packs are then cleared, never guessed.
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asStr, Doc } from "../shared/coerce";
import { normalizePacks, packsInUnit, Pack } from "../shared/itemUnits";
import { packChange } from "../shared/uomRules";

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/** Pure: what the linked stock item's packs should be, or null when the grocery item gives nothing usable. */
export function stockPacksFor(grocery: Doc | undefined, stockUnit: string): Pack[] | null {
  if (!grocery || grocery.archived === true || grocery.isDeleted === true) return null;
  const unit = asStr(grocery.unit);
  if (!unit || !stockUnit) return null;
  return packsInUnit(normalizePacks(grocery.packs), unit, stockUnit);
}

const same = (a: Pack[], b: Pack[]) => a.length === b.length && a.every((p, i) => p.unit === b[i].unit && p.qty === b[i].qty);

export const syncItemPacks = onDocumentWritten({ document: "groceryItems/{groceryItemId}", region: REGION }, async (event: WriteEvent) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  // Module 2h: every change of an item's pack sizes is kept with its date (groceryItems/{id}/packHistory).
  const change = packChange(before, after);
  if (change) {
    await getFirestore().collection(FirestoreCollections.GROCERY_ITEMS).doc(event.params.groceryItemId).collection("packHistory").add({ ...change, from: FieldValue.serverTimestamp(), changedBy: asStr(after?.updatedBy) });
  }
  const invId = asStr(after?.inventoryItemId);
  if (!after || !invId) return;
  // Only when something that matters changed (packs, unit, or the link itself).
  const changed = !before || JSON.stringify(before.packs ?? null) !== JSON.stringify(after.packs ?? null) || asStr(before.unit) !== asStr(after.unit) || asStr(before.inventoryItemId) !== invId;
  if (!changed) return;
  const ref = getFirestore().collection(FirestoreCollections.INVENTORY).doc(invId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const inv = snap.data() as Doc;
  const wanted = stockPacksFor(after, asStr(inv.unit)) ?? [];
  if (same(normalizePacks(inv.packs), wanted)) return;
  await ref.update({ packs: wanted, packsFrom: event.params.groceryItemId, updatedAt: FieldValue.serverTimestamp(), updatedBy: "system" });
});
