// Module 2a — item-specific pack sizes (UOM conversions per item), aliases, duplicate items. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { duplicateItems, isGlobalUnit, itemQty, itemRate, itemUnitFactor, nameKey, normalizeAliases, normalizePacks, packsInUnit, parsePacks, Pack } from "../src/shared/itemUnits";
import { purchaseStockLines } from "../src/stock/purchaseStockRules";
import { groceryRefs, purchaseRateRows } from "../src/vendors/rateRules";
import { stockPacksFor } from "../src/kitchen/itemPacks";

const rice: Pack[] = [{ unit: "Bag", qty: 25 }, { unit: "Packet", qty: 1 }];
const oil: Pack[] = [{ unit: "Tin", qty: 15 }];

test("M2a global conversions still work and never need a pack", () => {
  assert.equal(itemUnitFactor("Gram", "kg", [], "kg"), 0.001);
  assert.equal(itemUnitFactor("kg", "Kg", [], ""), 1);
  assert.equal(itemQty(500, "Gram", "kg", [], "kg"), 0.5);
  assert.equal(itemQty(2, "Dozen", "pcs", [], "pcs"), 24);
});

test("M2a pack → item unit, pack → smaller unit, pack → pack, and back", () => {
  assert.equal(itemQty(2, "Bag", "kg", rice, "kg"), 50);
  assert.equal(itemQty(1, "bags", "kg", rice, "kg"), null, "an unknown spelling is not guessed");
  assert.equal(itemQty(1, "BAG", "kg", rice, "kg"), 25, "case does not matter");
  assert.equal(itemQty(1, "Bag", "Gram", rice, "kg"), 25000);
  assert.equal(itemQty(1, "Bag", "Packet", rice, "kg"), 25);
  assert.equal(itemQty(50, "kg", "Bag", rice, "kg"), 2);
  assert.equal(itemQty(3, "Tin", "L", oil, "L"), 45);
  assert.equal(itemQty(3, "Tin", "ml", oil, "L"), 45000);
});

test("M2a not convertible: wrong kind, unknown pack, no item unit", () => {
  assert.equal(itemQty(1, "Bag", "L", rice, "kg"), null);
  assert.equal(itemQty(1, "Tin", "kg", rice, "kg"), null);
  assert.equal(itemQty(1, "Bag", "kg", [], "kg"), null);
  assert.equal(itemQty(1, "Bag", "kg", rice, ""), null);
});

test("M2a rate per pack → rate per item unit", () => {
  assert.equal(itemRate(1500, "Bag", "kg", rice, "kg"), 60);
  assert.equal(itemRate(2100, "Tin", "L", oil, "L"), 140);
  assert.equal(itemRate(60, "kg", "Bag", rice, "kg"), 1500);
  assert.equal(itemRate(100, "Box", "kg", rice, "kg"), null);
});

test("M2a normalizePacks drops bad rows, global units and repeats; parsePacks says why", () => {
  assert.deepEqual(normalizePacks([{ unit: " Bag ", qty: 25 }, { unit: "bag", qty: 50 }, { unit: "Kg", qty: 2 }, { unit: "Tin", qty: 0 }, { unit: "", qty: 5 }, "x", { unit: "Box", qty: "10" }]), [{ unit: "Bag", qty: 25 }]);
  assert.deepEqual(normalizePacks(undefined), []);
  assert.equal(isGlobalUnit("Gram"), true);
  assert.equal(isGlobalUnit("Bag"), false);
  assert.deepEqual(parsePacks([{ unit: "Bag", qty: 25 }, { unit: "Tin", qty: 15.5 }]), { ok: true, value: [{ unit: "Bag", qty: 25 }, { unit: "Tin", qty: 15.5 }] });
  assert.equal(parsePacks([{ unit: "Kg", qty: 2 }]).ok, false);
  assert.equal(parsePacks([{ unit: "Bag", qty: 25 }, { unit: "BAG", qty: 30 }]).ok, false);
  assert.equal(parsePacks([{ unit: "Bag", qty: -1 }]).ok, false);
  assert.equal(parsePacks([{ unit: "", qty: 1 }]).ok, false);
  assert.equal(parsePacks("Bag=25").ok, false);
  assert.deepEqual(parsePacks([]), { ok: true, value: [] });
});

test("M2a purchase in Bags goes into stock in kg; without the pack it is skipped as before", () => {
  const purchase = { items: [{ inventoryItemId: "rice", description: "Rice", quantity: 2, unit: "Bag" }, { inventoryItemId: "rice", description: "Rice", quantity: 500, unit: "Gram" }, { inventoryItemId: "oil", description: "Oil", quantity: 1, unit: "Tin" }] };
  const withPacks = purchaseStockLines(purchase, { rice: "kg", oil: "L" }, { rice, oil });
  assert.deepEqual(withPacks.wanted, { rice: 50.5, oil: 15 });
  assert.equal(withPacks.skipped.length, 0);
  const noPacks = purchaseStockLines(purchase, { rice: "kg", oil: "L" });
  assert.deepEqual(noPacks.wanted, { rice: 0.5 });
  assert.deepEqual(noPacks.skipped.map((s) => [s.inventoryItemId, s.unit, s.reason]), [["rice", "Bag", "unit-mismatch"], ["oil", "Tin", "unit-mismatch"]]);
  // a pack never applies to a stock item without a unit
  assert.equal(purchaseStockLines(purchase, {}, { rice, oil }).skipped.length, 3);
});

test("M2a vendor rate bought per Bag becomes a rate per kg for the grocery item", () => {
  const refs = groceryRefs([{ id: "g1", data: { nameEn: "Rice", unit: "kg", inventoryItemId: "rice", packs: rice, aliases: ["Sona Masoori", "బియ్యం"] } }]);
  assert.deepEqual(refs[0].packs, rice);
  const rows = purchaseRateRows([{ id: "p1", data: { purchaseDate: "2026-11-10", vendorName: "Kirana", items: [{ description: "sona masoori", unit: "Bag", unitPrice: 1500, quantity: 2 }] } }], refs);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].itemKey, rows[0].rate, rows[0].unit, rows[0].rawRate, rows[0].rawUnit], ["g:g1", 60, "kg", 1500, "Bag"]);
  const noPack = purchaseRateRows([{ id: "p2", data: { purchaseDate: "2026-11-10", vendorName: "Kirana", items: [{ description: "Rice", unit: "Box", unitPrice: 900, quantity: 1 }] } }], refs);
  assert.deepEqual([noPack[0].itemKey, noPack[0].rate, noPack[0].unit], ["g:g1|box", 900, "Box"]);
});

test("M2a packs copied to the stock item in the stock item's unit, or not at all", () => {
  assert.deepEqual(packsInUnit(rice, "kg", "g"), [{ unit: "Bag", qty: 25000 }, { unit: "Packet", qty: 1000 }]);
  assert.equal(packsInUnit(rice, "kg", "pcs"), null);
  assert.deepEqual(stockPacksFor({ unit: "kg", packs: rice }, "kg"), rice);
  assert.deepEqual(stockPacksFor({ unit: "kg", packs: rice }, "Gram"), [{ unit: "Bag", qty: 25000 }, { unit: "Packet", qty: 1000 }]);
  assert.equal(stockPacksFor({ unit: "kg", packs: rice }, "pcs"), null);
  assert.equal(stockPacksFor({ unit: "kg", packs: rice }, ""), null);
  assert.equal(stockPacksFor({ unit: "kg", packs: rice, archived: true }, "kg"), null);
  assert.deepEqual(stockPacksFor({ unit: "kg" }, "kg"), []);
});

test("M2a aliases and duplicate items (same thing typed twice must not become two items)", () => {
  assert.equal(nameKey(" Toor  Dal! "), "toordal");
  assert.equal(nameKey("కంది పప్పు"), nameKey("కందిపప్పు"));
  assert.deepEqual(normalizeAliases([" Toor Dal ", "toor-dal", "", 5, "Arhar"]), ["Toor Dal", "Arhar"]);
  const items = [{ id: "a", names: ["Toor Dal", "కందిపప్పు", "Arhar"] }, { id: "b", names: ["Moong Dal"] }];
  assert.deepEqual(duplicateItems(["toor dal"], items), ["a"]);
  assert.deepEqual(duplicateItems(["Red gram", "ARHAR"], items), ["a"]);
  assert.deepEqual(duplicateItems(["కంది పప్పు"], items), ["a"]);
  assert.deepEqual(duplicateItems(["Toor Dal"], items, "a"), [], "an item is not its own duplicate");
  assert.deepEqual(duplicateItems(["Chana Dal"], items), []);
  assert.deepEqual(duplicateItems(["", "  "], items), []);
});
