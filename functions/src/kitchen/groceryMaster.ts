/**
 * Pure: reading the grocery master (groceryItems). Most of the ~400 items have per100 = null until the owner
 * fills it in; extra fields (module, group, nameRoman, purchaseUnits) are tolerated. Only items with
 * per100 > 0 and a §5 unit (kg | L | pcs) take part in §6 grocery lines and event stock deduction.
 */
import { asNum, asStr, Doc } from "../shared/coerce";
import { Unit } from "../calc/cooking";

const UNITS: Unit[] = ["kg", "L", "pcs"];

export interface GroceryMasterItem {
  groceryItemId: string;
  nameTe: string;
  nameEn: string;
  unit: Unit;
  per100: number;
  inventoryItemId: string;
  /** category, else module */
  category: string;
  group: string;
}

export function splitGroceryMaster(docs: { id: string; data: Doc }[]): { usable: GroceryMasterItem[]; skippedNoPer100: number; skippedBadUnit: number } {
  const usable: GroceryMasterItem[] = [];
  let skippedNoPer100 = 0;
  let skippedBadUnit = 0;
  for (const { id, data } of docs) {
    const per100 = asNum(data.per100, 0);
    if (!(per100 > 0)) {
      skippedNoPer100++;
      continue;
    }
    const unit = asStr(data.unit) as Unit;
    if (!UNITS.includes(unit)) {
      skippedBadUnit++;
      continue;
    }
    usable.push({
      groceryItemId: id,
      nameTe: asStr(data.nameTe),
      nameEn: asStr(data.nameEn) || asStr(data.nameRoman),
      unit,
      per100,
      inventoryItemId: asStr(data.inventoryItemId),
      category: asStr(data.category) || asStr(data.module),
      group: asStr(data.group),
    });
  }
  return { usable, skippedNoPer100, skippedBadUnit };
}
