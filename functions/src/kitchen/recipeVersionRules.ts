/**
 * Module 2b (18 Nov 2026) — recipe versions. Spec CMF 08: REC-01 "Recipe is versioned"; rule 3 "changing a recipe
 * creates a new version … it does not rewrite history". Pure: decides when a dish's typed recipe really changed and
 * what the version snapshot holds. The learned ratios (dishes.recipe) are not part of a version: they come from events.
 */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { readSubRecipes } from "./subRecipeRules";

export interface RecipeLine {
  groceryItemId: string;
  perUnit: number;
}

export interface RecipeSnapshot {
  unit: string;
  typedRecipe: RecipeLine[];
  variants: { id: string; nameTe: string; nameEn: string; typedRecipe: RecipeLine[] }[];
  /** Module 2e: bases used by the dish — present only when there is at least one */
  subRecipes?: { dishId: string; perUnit: number }[];
}

function lines(raw: unknown): RecipeLine[] {
  const byId = new Map<string, number>();
  for (const l of asArr(raw).map(asObj)) {
    const id = asStr(l.groceryItemId);
    const q = asNum(l.perUnit, NaN);
    if (!id || !Number.isFinite(q) || q < 0) continue;
    byId.set(id, q); // the last line for an item wins, like the planner
  }
  return [...byId.entries()].map(([groceryItemId, perUnit]) => ({ groceryItemId, perUnit })).sort((a, b) => a.groceryItemId.localeCompare(b.groceryItemId));
}

/** The recipe part of a dish document, in a fixed order (so the same recipe always looks the same). */
export function recipeSnapshot(dish: Doc | undefined): RecipeSnapshot {
  const d = dish ?? {};
  const subs = readSubRecipes(d.subRecipes).sort((a, b) => a.dishId.localeCompare(b.dishId));
  return {
    ...(subs.length ? { subRecipes: subs } : {}),
    unit: asStr(d.unit),
    typedRecipe: lines(d.typedRecipe),
    variants: asArr(d.variants)
      .map(asObj)
      .map((v) => ({ id: asStr(v.id), nameTe: asStr(v.nameTe), nameEn: asStr(v.nameEn), typedRecipe: lines(v.typedRecipe) }))
      .filter((v) => v.id !== "" || v.nameTe !== "" || v.nameEn !== "")
      .sort((a, b) => a.id.localeCompare(b.id) || a.nameEn.localeCompare(b.nameEn)),
  };
}

/** Text that is equal exactly when two recipes are the same (names of variants do not count, only quantities). */
export function recipeFingerprint(s: RecipeSnapshot): string {
  const base = [s.unit, s.typedRecipe.map((l) => [l.groceryItemId, l.perUnit]), s.variants.map((v) => [v.id, v.typedRecipe.map((l) => [l.groceryItemId, l.perUnit])])];
  // Module 2e: bases are added only when the dish has some, so every dish without bases keeps the fingerprint it had.
  return JSON.stringify(s.subRecipes?.length ? [...base, s.subRecipes.map((l) => [l.dishId, l.perUnit])] : base);
}

/** A recipe with no ingredient line anywhere is "empty": nothing worth a version. */
export function isEmptyRecipe(s: RecipeSnapshot): boolean {
  return s.typedRecipe.length === 0 && s.variants.every((v) => v.typedRecipe.length === 0) && !s.subRecipes?.length;
}

/**
 * Should this write create a version? Yes when the recipe is not the one already recorded (`recordedFingerprint`,
 * kept on the dish by the server) and there is something to record — a first empty recipe is skipped, but emptying a
 * recipe that had a version is recorded.
 */
export function needsNewVersion(after: Doc | undefined, recordedFingerprint: string, recordedVersion: number): boolean {
  if (!after || after.archived === true) return false;
  const snap = recipeSnapshot(after);
  if (recipeFingerprint(snap) === recordedFingerprint) return false;
  return !(recordedVersion === 0 && isEmptyRecipe(snap));
}

/** What changed between two versions, per ingredient (for the history screen). */
export function recipeDiff(before: RecipeLine[], after: RecipeLine[]): { groceryItemId: string; from: number | null; to: number | null }[] {
  const a = new Map(before.map((l) => [l.groceryItemId, l.perUnit]));
  const b = new Map(after.map((l) => [l.groceryItemId, l.perUnit]));
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .map((id) => ({ groceryItemId: id, from: a.has(id) ? (a.get(id) as number) : null, to: b.has(id) ? (b.get(id) as number) : null }))
    .filter((d) => d.from !== d.to);
}
