// Module 2h — units master, conversion snapshot on purchases, pack size history. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PACK_UOMS, conversionKey, frozenFactors, lineFactor, normalizeUomPacks, packChange, parseUomPacksPatch, purchaseUnitNames } from "../src/shared/uomRules";
import { purchaseStockLines } from "../src/stock/purchaseStockRules";
import { normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

test("M2h unit list: fixed units always there, pack names kept by the owner", () => {
  assert.deepEqual(normalizeSettings(undefined).uomPacks, DEFAULT_PACK_UOMS);
  assert.deepEqual(normalizeUomPacks(["Bag", " bag ", "Kg", "Sack", 5, "", "Tin"]), ["Bag", "Sack", "Tin"]);
  assert.deepEqual(normalizeUomPacks([]), [], "an empty list stays empty (owner removed all)");
  assert.deepEqual(purchaseUnitNames(["Bag", "Sack"]), ["Kg", "Gram", "Litre", "ML", "Piece", "Dozen", "Bag", "Sack"]);
  assert.deepEqual(parseUomPacksPatch(["Bag", "Gunny Sack"]), { ok: true, value: ["Bag", "Gunny Sack"] });
  for (const bad of [["Bag", "BAG"], ["Kg"], ["grams"], [""], ["x".repeat(31)], ["<b>"], "Bag", Array.from({ length: 61 }, (_, i) => `U${i}`)]) assert.equal(parseUomPacksPatch(bad).ok, false, JSON.stringify(bad).slice(0, 30));
  assert.deepEqual(applySettingsPatch({}, { uomPacks: ["Bag", "డబ్బా"] }).update, { uomPacks: ["Bag", "డబ్బా"] });
  assert.equal(applySettingsPatch({}, { uomPacks: ["Kg"] }).errors.length, 1);
});

test("M2h a purchase keeps the conversion it used", () => {
  const purchase = { items: [{ inventoryItemId: "rice", quantity: 2, unit: "Bag", description: "Rice" }, { inventoryItemId: "oil", quantity: 500, unit: "ML" }, { inventoryItemId: "salt", quantity: 3, unit: "Kg" }] };
  const units = { rice: "kg", oil: "L", salt: "kg" };
  const first = purchaseStockLines(purchase, units, { rice: [{ unit: "Bag", qty: 25 }] });
  assert.deepEqual(first.wanted, { rice: 50, oil: 0.5, salt: 3 });
  assert.deepEqual(first.conversions, [
    { inventoryItemId: "rice", unit: "Bag", stockUnit: "kg", factor: 25 },
    { inventoryItemId: "oil", unit: "ML", stockUnit: "L", factor: 0.001 },
    { inventoryItemId: "salt", unit: "Kg", stockUnit: "kg", factor: 1 },
  ]);

  // The owner later changes the bag to 26 kg: the old purchase still means 2 × 25.
  const frozen = frozenFactors(first.conversions);
  const later = purchaseStockLines(purchase, units, { rice: [{ unit: "Bag", qty: 26 }] }, frozen);
  assert.deepEqual(later.wanted, { rice: 50, oil: 0.5, salt: 3 });
  assert.deepEqual(later.conversions, first.conversions);
  // …while a purchase made now uses 26.
  assert.equal(purchaseStockLines(purchase, units, { rice: [{ unit: "Bag", qty: 26 }] }).wanted.rice, 52);
  // Even if the pack is deleted from the item, the old purchase is still understood.
  assert.equal(purchaseStockLines(purchase, units, {}, frozen).wanted.rice, 50);
  assert.equal(purchaseStockLines(purchase, units, {}).skipped.length, 1);
});

test("M2h a kept conversion is used only for the same item, unit and stock unit", () => {
  const frozen = frozenFactors([{ inventoryItemId: "rice", unit: "Bag", stockUnit: "kg", factor: 25 }, { inventoryItemId: "x", unit: "Bag", stockUnit: "kg", factor: -1 }, "junk", { inventoryItemId: "y", unit: "Bag", stockUnit: "kg" }]);
  assert.deepEqual(Object.keys(frozen), [conversionKey("rice", "bag")]);
  assert.equal(lineFactor("rice", "BAG", "kg", [], frozen), 25, "unit names compare without case");
  assert.equal(lineFactor("rice", "Bag", "g", [{ unit: "Bag", qty: 26000 }], frozen), 26000, "stock unit changed → today's conversion");
  assert.equal(lineFactor("dal", "Bag", "kg", [], frozen), null);
  assert.equal(lineFactor("dal", "Gram", "kg", [], {}), 0.001);
});

test("M2h a line changed to another unit gets today's conversion; removed lines drop their snapshot", () => {
  const units = { rice: "kg" };
  const packs = { rice: [{ unit: "Bag", qty: 26 }, { unit: "Sack", qty: 50 }] };
  const frozen = frozenFactors([{ inventoryItemId: "rice", unit: "Bag", stockUnit: "kg", factor: 25 }]);
  const r = purchaseStockLines({ items: [{ inventoryItemId: "rice", quantity: 1, unit: "Sack" }] }, units, packs, frozen);
  assert.deepEqual(r.wanted, { rice: 50 });
  assert.deepEqual(r.conversions, [{ inventoryItemId: "rice", unit: "Sack", stockUnit: "kg", factor: 50 }]);
  assert.deepEqual(purchaseStockLines({ items: [], status: "Active" }, units, packs, frozen).conversions, []);
});

test("M2h pack history: recorded only when the packs or the unit really changed", () => {
  const bag25 = { unit: "kg", packs: [{ unit: "Bag", qty: 25 }] };
  assert.deepEqual(packChange(undefined, bag25), { unit: "kg", packs: [{ unit: "Bag", qty: 25 }] });
  assert.equal(packChange(undefined, { unit: "kg" }), null, "new item without packs");
  assert.equal(packChange(bag25, { ...bag25, nameEn: "Sona rice" } as never), null);
  assert.deepEqual(packChange(bag25, { unit: "kg", packs: [{ unit: "Bag", qty: 26 }] }), { unit: "kg", packs: [{ unit: "Bag", qty: 26 }] });
  assert.deepEqual(packChange(bag25, { unit: "kg", packs: [] }), { unit: "kg", packs: [] }, "removing the packs is a change too");
  assert.equal(packChange({ unit: "kg" }, { unit: "L" }), null, "unit change of an item without packs");
  assert.equal(packChange(bag25, undefined), null);
});
