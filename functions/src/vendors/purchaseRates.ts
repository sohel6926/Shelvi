/** R10-4 / R10-6: purchase line rates (latest per item, per vendor). Pure parts: rateRules.ts. */
import { getFirestore } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId } from "../shared/validate";
import { Doc } from "../shared/coerce";
import { vendorRateTable } from "../calc/round10";
import { GroceryRef, groceryRefs, purchaseRateRows } from "./rateRules";

export { purchaseRateRows } from "./rateRules";

export async function recentPurchases(limit = 1000): Promise<{ id: string; data: Doc }[]> {
  const snap = await getFirestore().collection(FirestoreCollections.PURCHASES).orderBy("purchaseDate", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
}

export async function loadGroceryRefs(): Promise<GroceryRef[]> {
  const snap = await getFirestore().collection(FirestoreCollections.GROCERY_ITEMS).get();
  return groceryRefs(snap.docs.map((d) => ({ id: d.id, data: d.data() as Doc })));
}

/**
 * vendorPriceComparison { groceryItemId? } → per item: vendors with last rate + date, cheapest marked, change vs
 * previous. Lines are matched to the grocery master by groceryItemId, inventoryItemId or name (rateRules).
 */
export const vendorPriceComparison = callable("vendorPriceComparison", ADMIN_MANAGER, async (data) => {
  const groceryItemId = optId(data, "groceryItemId");
  const [refs, purchases] = await Promise.all([loadGroceryRefs(), recentPurchases()]);
  if (groceryItemId && !refs.some((r) => r.id === groceryItemId)) fail("not-found", "ఆ సరుకు దొరకలేదు.", "Grocery item not found.");
  const all = purchaseRateRows(purchases, refs);
  const rows = groceryItemId ? all.filter((r) => r.groceryItemId === groceryItemId) : all;
  const table = vendorRateTable(rows);
  const names = new Map<string, { name: string; unit: string; groceryItemId: string }>();
  for (const r of rows) if (!names.has(r.itemKey)) names.set(r.itemKey, { name: r.name, unit: r.unit, groceryItemId: r.groceryItemId });
  const items = Object.entries(table)
    .map(([itemKey, vendors]) => ({ itemKey, groceryItemId: names.get(itemKey)?.groceryItemId ?? "", name: names.get(itemKey)?.name ?? itemKey, unit: names.get(itemKey)?.unit ?? "", vendors, vendorCount: vendors.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { items, purchasesScanned: purchases.length, linesWithRate: all.length };
});
