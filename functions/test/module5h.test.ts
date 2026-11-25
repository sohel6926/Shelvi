// Module 5h — allergen matrix and veg / non-veg separation. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matrixRow, menuOnlyRow, normalizeAllergenList, parseAllergenList, parseFoodTags, recipeGroceryIds, tagsOf, type TaggedPart } from "../src/safety/allergenRules";
import { normalizeSettings } from "../src/shared/settingsModel";
import { applySettingsPatch } from "../src/settings/settingsPatch";

test("M5h the CRM ships with no allergen list — nothing is invented", () => {
  assert.deepEqual(normalizeAllergenList(undefined), []);
  assert.deepEqual(normalizeSettings({}).allergens, []);
});

test("M5h the owner's allergen list is kept as written; duplicates refused", () => {
  const r = parseAllergenList([{ id: "milk", te: "పాలు", en: "Milk" }, { te: "వేరుశనగ" }, { id: "milk", te: "నువ్వులు", en: "Sesame" }]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value.map((a) => [a.id, a.en]), [["milk", "Milk"], ["a2", "వేరుశనగ"], ["milkx", "Sesame"]]);
  assert.ok(!parseAllergenList([{ en: "Milk" }, { en: "milk" }]).ok, "same name twice");
  assert.ok(!parseAllergenList([{}]).ok, "no name");
  assert.ok(!parseAllergenList("x").ok);
});

test("M5h settings patch accepts the allergen list", () => {
  const r = applySettingsPatch({}, { allergens: [{ te: "పాలు", en: "Milk" }] });
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.update.allergens, [{ id: "a1", te: "పాలు", en: "Milk" }]);
  assert.equal(applySettingsPatch({}, { allergens: "x" }).errors.length, 1);
});

const list = [{ id: "milk", te: "పాలు", en: "Milk" }, { id: "nuts", te: "జీడిపప్పు", en: "Nuts" }];

test("M5h food tags: only allergens on the owner's list; type veg / non-veg / not known", () => {
  const r = parseFoodTags({ foodType: "veg", allergens: ["milk", "milk"] }, list);
  assert.deepEqual(r, { ok: true, value: { foodType: "veg", allergens: ["milk"] } });
  assert.deepEqual(parseFoodTags({ foodType: "", allergens: [] }, list), { ok: true, value: { foodType: "", allergens: [] } });
  assert.ok(!parseFoodTags({ foodType: "veg", allergens: ["gluten"] }, list).ok);
  assert.ok(!parseFoodTags({ foodType: "egg", allergens: [] }, list).ok);
  assert.ok(!parseFoodTags({ foodType: "veg" }, list).ok);
  assert.deepEqual(tagsOf({ foodType: "x", allergens: ["milk", 3] }), { tagged: false, foodType: "", allergens: ["milk"] });
});

const p = (id: string, foodType: "veg" | "nonveg" | "", allergens: string[] = [], tagged = true): TaggedPart => ({ id, name: id, tagged, foodType, allergens });

test("M5h matrix row: allergens from the dish, its ingredients and its bases, with where each comes from", () => {
  const row = matrixRow({ dishId: "payasam", name: "Payasam", self: p("Payasam", "veg", ["milk"]), bases: [p("Nut paste", "veg", ["nuts"])], ingredients: [p("Milk", "veg", ["milk"]), p("Sugar", "veg")] }, "");
  assert.deepEqual(row.allergens, { milk: ["Payasam", "Milk"], nuts: ["Nut paste"] });
  assert.equal(row.foodType, "veg");
  assert.deepEqual(row.problems, []);
});

test("M5h a dish marked veg with a non-veg ingredient is flagged, and a veg-only brand flags it too", () => {
  const row = matrixRow({ dishId: "d", name: "Gravy", self: p("Gravy", "veg"), bases: [], ingredients: [p("Chicken stock", "nonveg")] }, "Sri Veg");
  assert.equal(row.foodType, "nonveg");
  assert.deepEqual(row.problems.map((x) => x.code), ["mislabelled", "vegOnlyBrand"]);
});

test("M5h untagged things are never shown as safe", () => {
  const row = matrixRow({ dishId: "d", name: "Curry", self: p("Curry", "", [], false), bases: [], ingredients: [p("Masala", "", [], false)] }, "Sri Veg");
  assert.equal(row.foodType, "unknown");
  assert.deepEqual(row.untaggedParts, ["Masala"]);
  assert.deepEqual(row.problems.map((x) => x.code), ["untagged", "partsUntagged", "unknownType"]);
  const r2 = matrixRow({ dishId: "d", name: "Rice", self: p("Rice", "veg"), bases: [], ingredients: [p("Rice grain", "", [], false)] }, "");
  assert.equal(r2.foodType, "unknown", "veg only when every part's type is known");
});

test("M5h menu items not linked to a dish: allergens unknown; non-veg on a veg-only brand flagged", () => {
  assert.deepEqual(menuOnlyRow("Chicken 65", false, "Sri Veg").problems.map((x) => x.code), ["untagged", "vegOnlyBrand"]);
  assert.equal(menuOnlyRow("Pulihora", true, "").foodType, "veg");
});

test("M5h recipe grocery ids: learned, typed and every variant", () => {
  const dish = {
    recipe: { ingredients: [{ groceryItemId: "rice", perUnit: 0.5 }], typed: [{ groceryItemId: "salt", perUnit: 0.01 }], variants: { v1: { ingredients: [{ groceryItemId: "ghee", perUnit: 0.1 }] } } },
    typedRecipe: { oil: 0.05 },
    variants: [{ id: "v2", typedRecipe: [{ groceryItemId: "cashew", perUnit: 0.02 }] }],
  };
  assert.deepEqual(recipeGroceryIds(dish).sort(), ["cashew", "ghee", "oil", "rice", "salt"]);
  assert.deepEqual(recipeGroceryIds(null), []);
});
