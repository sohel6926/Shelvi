// Module 2b — recipe versions (a recipe change makes a new version, history is never rewritten). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmptyRecipe, needsNewVersion, recipeDiff, recipeFingerprint, recipeSnapshot } from "../src/kitchen/recipeVersionRules";

const dish = (extra: Record<string, unknown> = {}) => ({ unit: "kg", typedRecipe: [{ groceryItemId: "rice", perUnit: 0.4 }, { groceryItemId: "ghee", perUnit: 0.02 }], variants: [], ...extra });
const key = (d: Record<string, unknown>) => recipeFingerprint(recipeSnapshot(d));

test("M2b snapshot is in a fixed order and drops bad lines", () => {
  const s = recipeSnapshot({ unit: "kg", typedRecipe: [{ groceryItemId: "rice", perUnit: 0.4 }, { groceryItemId: "", perUnit: 1 }, { groceryItemId: "salt", perUnit: -1 }, { groceryItemId: "ghee", perUnit: 0.02 }, "x"] });
  assert.deepEqual(s.typedRecipe, [{ groceryItemId: "ghee", perUnit: 0.02 }, { groceryItemId: "rice", perUnit: 0.4 }]);
  assert.deepEqual(recipeSnapshot(undefined), { unit: "", typedRecipe: [], variants: [] });
});

test("M2b the same recipe typed in another order, or with other fields changed, is not a new version", () => {
  const a = key(dish());
  assert.equal(key(dish({ typedRecipe: [{ groceryItemId: "ghee", perUnit: 0.02 }, { groceryItemId: "rice", perUnit: 0.4 }] })), a);
  assert.equal(key(dish({ nameTe: "అన్నం", basePer100: 18, startRules: [{ style: "buffet", per100: 20 }], learned: { per100: 17 } })), a);
  assert.equal(needsNewVersion(dish({ nameTe: "కొత్త పేరు" }), a, 1), false);
});

test("M2b a changed quantity, a new or removed ingredient, a changed unit or variant recipe is a new version", () => {
  const a = key(dish());
  assert.notEqual(key(dish({ typedRecipe: [{ groceryItemId: "rice", perUnit: 0.45 }, { groceryItemId: "ghee", perUnit: 0.02 }] })), a);
  assert.notEqual(key(dish({ typedRecipe: [{ groceryItemId: "rice", perUnit: 0.4 }] })), a);
  assert.notEqual(key(dish({ unit: "L" })), a);
  const v1 = dish({ variants: [{ id: "v1", nameTe: "జీరా", nameEn: "Jeera", typedRecipe: [{ groceryItemId: "jeera", perUnit: 0.01 }] }] });
  const v2 = dish({ variants: [{ id: "v1", nameTe: "జీరా రైస్", nameEn: "Jeera rice", typedRecipe: [{ groceryItemId: "jeera", perUnit: 0.01 }] }] });
  const v3 = dish({ variants: [{ id: "v1", nameTe: "జీరా", nameEn: "Jeera", typedRecipe: [{ groceryItemId: "jeera", perUnit: 0.02 }] }] });
  assert.notEqual(key(v1), a);
  assert.equal(key(v2), key(v1), "renaming a variant is not a recipe change");
  assert.notEqual(key(v3), key(v1));
  assert.equal(needsNewVersion(v3, key(v1), 2), true);
});

test("M2b first version: an empty recipe is not recorded, a real one is; emptying a recorded recipe is recorded", () => {
  const empty = { unit: "kg", typedRecipe: [], variants: [] };
  assert.equal(isEmptyRecipe(recipeSnapshot(empty)), true);
  assert.equal(needsNewVersion(empty, "", 0), false);
  assert.equal(needsNewVersion(dish(), "", 0), true);
  assert.equal(needsNewVersion(empty, key(dish()), 1), true);
  assert.equal(needsNewVersion(undefined, "", 0), false);
  assert.equal(needsNewVersion(dish({ archived: true }), "", 0), false);
});

test("M2b after the server records a version, its own write does not make another", () => {
  const d = dish();
  const recorded = { ...d, recipeVersion: 1, recipeVersionKey: key(d) };
  assert.equal(needsNewVersion(recorded, recorded.recipeVersionKey, recorded.recipeVersion), false);
});

test("M2b diff between two versions lists only what changed", () => {
  const before = [{ groceryItemId: "rice", perUnit: 0.4 }, { groceryItemId: "ghee", perUnit: 0.02 }, { groceryItemId: "salt", perUnit: 0.01 }];
  const after = [{ groceryItemId: "rice", perUnit: 0.45 }, { groceryItemId: "salt", perUnit: 0.01 }, { groceryItemId: "jeera", perUnit: 0.005 }];
  assert.deepEqual(recipeDiff(before, after), [{ groceryItemId: "ghee", from: 0.02, to: null }, { groceryItemId: "jeera", from: null, to: 0.005 }, { groceryItemId: "rice", from: 0.4, to: 0.45 }]);
  assert.deepEqual(recipeDiff(before, before), []);
});
