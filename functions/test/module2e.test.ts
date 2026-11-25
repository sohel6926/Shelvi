// Module 2e — sub-recipes (a base like gravy / masala used inside dishes). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { expandSubRecipes, loopIfSaved, ownIngredients, readSubRecipes, subRecipeExtra } from "../src/kitchen/subRecipeRules";
import { recipeFingerprint, recipeSnapshot, needsNewVersion } from "../src/kitchen/recipeVersionRules";

type D = Record<string, unknown>;
const db = (docs: Record<string, D>) => (id: string) => docs[id] ?? null;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

const gravy: D = { isSubRecipe: true, unit: "kg", typedRecipe: [{ groceryItemId: "onion", perUnit: 0.5 }, { groceryItemId: "tomato", perUnit: 0.4 }, { groceryItemId: "oil", perUnit: 0.05 }] };
const masala: D = { isSubRecipe: true, unit: "kg", typedRecipe: [{ groceryItemId: "chilli", perUnit: 0.3 }, { groceryItemId: "coriander", perUnit: 0.7 }] };

test("M2e readSubRecipes keeps valid lines, last line per base wins, at most 20", () => {
  assert.deepEqual(readSubRecipes([{ dishId: "g", perUnit: 0.2 }, { dishId: "", perUnit: 1 }, { dishId: "m", perUnit: 0 }, { dishId: "x", perUnit: -1 }, { dishId: "g", perUnit: 0.3 }, "junk"]), [{ dishId: "g", perUnit: 0.3 }]);
  assert.deepEqual(readSubRecipes(undefined), []);
  assert.equal(readSubRecipes(Array.from({ length: 30 }, (_, i) => ({ dishId: `d${i}`, perUnit: 1 }))).length, 20);
});

test("M2e a base uses the typed recipe until the server has learned ratios", () => {
  assert.deepEqual(ownIngredients(gravy), { onion: 0.5, tomato: 0.4, oil: 0.05 });
  assert.deepEqual(ownIngredients({ ...gravy, recipe: { ingredients: [{ groceryItemId: "onion", perUnit: 0.6 }] } }), { onion: 0.6 });
  assert.deepEqual(ownIngredients({ ...gravy, recipe: { ingredients: [] } }), { onion: 0.5, tomato: 0.4, oil: 0.05 });
  assert.deepEqual(ownIngredients(null), {});
});

test("M2e one base: 0.3 kg gravy per kg of curry", () => {
  const get = db({ curry: { subRecipes: [{ dishId: "gravy", perUnit: 0.3 }], typedRecipe: [{ groceryItemId: "paneer", perUnit: 0.5 }] }, gravy });
  const r = expandSubRecipes("curry", get);
  near(r.perUnit.onion, 0.15);
  near(r.perUnit.tomato, 0.12);
  near(r.perUnit.oil, 0.015);
  assert.equal(r.perUnit.paneer, undefined, "the dish's own lines are not repeated here");
  assert.deepEqual(r.bases, { gravy: 0.3 });
  assert.deepEqual(r.problems, []);
});

test("M2e a base inside a base multiplies through, and the same grocery from two routes adds up", () => {
  const gravy2 = { ...gravy, subRecipes: [{ dishId: "masala", perUnit: 0.1 }] };
  const get = db({ curry: { subRecipes: [{ dishId: "gravy", perUnit: 0.3 }, { dishId: "masala", perUnit: 0.02 }] }, gravy: gravy2, masala });
  const r = expandSubRecipes("curry", get);
  near(r.bases.masala, 0.3 * 0.1 + 0.02);
  near(r.perUnit.chilli, (0.03 + 0.02) * 0.3);
  near(r.perUnit.onion, 0.15);
  assert.deepEqual(r.problems, []);
});

test("M2e loops, missing bases and non-bases are skipped and reported, never followed", () => {
  const a = { isSubRecipe: true, typedRecipe: [{ groceryItemId: "x", perUnit: 1 }], subRecipes: [{ dishId: "b", perUnit: 1 }] };
  const b = { isSubRecipe: true, typedRecipe: [{ groceryItemId: "y", perUnit: 1 }], subRecipes: [{ dishId: "a", perUnit: 1 }] };
  const r = expandSubRecipes("dish", db({ dish: { subRecipes: [{ dishId: "a", perUnit: 2 }, { dishId: "gone", perUnit: 1 }, { dishId: "biryani", perUnit: 1 }, { dishId: "dish", perUnit: 1 }] }, a, b, biryani: { typedRecipe: [{ groceryItemId: "rice", perUnit: 1 }] } }));
  assert.deepEqual(r.perUnit, { x: 2, y: 2 });
  assert.deepEqual(r.problems.map((p) => `${p.kind}:${p.dishId}`).sort(), ["loop:a", "loop:dish", "missing:gone", "notBase:biryani"]);
});

test("M2e depth is limited to 4 levels", () => {
  const docs: Record<string, D> = { dish: { subRecipes: [{ dishId: "b1", perUnit: 1 }] } };
  for (let i = 1; i <= 6; i++) docs[`b${i}`] = { isSubRecipe: true, typedRecipe: [{ groceryItemId: `g${i}`, perUnit: 1 }], subRecipes: i < 6 ? [{ dishId: `b${i + 1}`, perUnit: 1 }] : [] };
  const r = expandSubRecipes("dish", db(docs));
  assert.deepEqual(Object.keys(r.perUnit).sort(), ["g1", "g2", "g3", "g4"]);
  assert.deepEqual(r.problems, [{ kind: "tooDeep", dishId: "b4" }]);
});

test("M2e loopIfSaved finds the base that would close a loop", () => {
  const get = db({ gravy: { subRecipes: [{ dishId: "masala", perUnit: 1 }] }, masala: { subRecipes: [] }, curry: {} });
  assert.equal(loopIfSaved("masala", [{ dishId: "gravy", perUnit: 1 }], get), "gravy");
  assert.equal(loopIfSaved("masala", [{ dishId: "masala", perUnit: 1 }], get), "masala");
  assert.equal(loopIfSaved("curry", [{ dishId: "gravy", perUnit: 1 }], get), "");
});

test("M2e recipe versions: bases are part of the recipe, and dishes without bases keep their old fingerprint", () => {
  const plain = { unit: "kg", typedRecipe: [{ groceryItemId: "rice", perUnit: 1 }] };
  const before = recipeFingerprint(recipeSnapshot(plain));
  assert.equal(before, JSON.stringify(["kg", [["rice", 1]], []]), "unchanged format → no surprise version for existing dishes");
  assert.equal("subRecipes" in recipeSnapshot(plain), false);
  const withBase = { ...plain, subRecipes: [{ dishId: "gravy", perUnit: 0.3 }] };
  assert.deepEqual(recipeSnapshot(withBase).subRecipes, [{ dishId: "gravy", perUnit: 0.3 }]);
  assert.notEqual(recipeFingerprint(recipeSnapshot(withBase)), before);
  assert.equal(needsNewVersion(withBase, before, 1), true);
  assert.equal(needsNewVersion({ unit: "kg", subRecipes: [{ dishId: "gravy", perUnit: 0.3 }] }, "", 0), true, "a dish made only of bases is not an empty recipe");
});

test("M2e base + own line: typed lines add up, logged ratios are never counted twice", () => {
  assert.equal(subRecipeExtra(0.2, 0.15, false), 0.15, "typed 0.2 + base 0.15 = 0.35");
  assert.equal(subRecipeExtra(0.2, 0.15, true), 0, "log already shows 0.2 ≥ base 0.15");
  near(subRecipeExtra(0.1, 0.15, true), 0.05);
  assert.equal(subRecipeExtra(0.2, 0, false), 0);
});
