/**
 * Module 2e (18 Nov 2026) — sub-recipes. Spec CMF 08: "a recipe can use another recipe (gravy, masala, base) as an
 * ingredient". Pure, no Firestore.
 *
 * A base preparation is a dish marked `isSubRecipe`, with its own typed recipe per 1 unit of the base
 * (e.g. per 1 kg of gravy). Any dish may list `subRecipes: [{ dishId, perUnit }]` — how much of the base goes into
 * 1 unit of the dish. For buying and costing, a base is opened into its grocery items:
 *   grocery needed per unit of the dish = Σ perUnit(base) × grocery per unit of that base (bases inside bases too).
 * A base that points back to itself (directly or through another base) is skipped and reported, never followed.
 */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";

export const MAX_SUB_RECIPES = 20;
export const MAX_SUB_DEPTH = 4;

export interface SubRecipeLine {
  dishId: string;
  perUnit: number;
}

/** dishes.subRecipes as stored: lines with a dish id and a quantity above 0; one line per base (the last wins). */
export function readSubRecipes(v: unknown): SubRecipeLine[] {
  const byId = new Map<string, number>();
  for (const x of asArr(v).map(asObj)) {
    const id = asStr(x.dishId);
    const q = asNum(x.perUnit, NaN);
    if (!id || !Number.isFinite(q) || !(q > 0)) continue;
    byId.set(id, q);
  }
  return [...byId.entries()].slice(0, MAX_SUB_RECIPES).map(([dishId, perUnit]) => ({ dishId, perUnit }));
}

/**
 * Grocery per 1 unit of a base itself (not counting bases inside it): the learned ratios when the server has them,
 * otherwise the recipe the owner typed. A base is never cooked for guests on its own, so it usually has only the
 * typed recipe.
 */
export function ownIngredients(dish: Doc | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!dish) return out;
  const learned = asArr(asObj(dish.recipe).ingredients).map(asObj);
  const lines = learned.some((l) => asStr(l.groceryItemId) && asNum(l.perUnit) > 0) ? learned : asArr(dish.typedRecipe).map(asObj);
  for (const l of lines) {
    const id = asStr(l.groceryItemId);
    const q = asNum(l.perUnit);
    if (id && q > 0) out[id] = q;
  }
  return out;
}

export type SubProblem = { kind: "missing" | "loop" | "tooDeep" | "notBase"; dishId: string };

export interface Expanded {
  /** grocery item → quantity per 1 unit of the dish, coming from its bases only */
  perUnit: Record<string, number>;
  /** each base used (at any depth) → quantity of that base per 1 unit of the dish */
  bases: Record<string, number>;
  problems: SubProblem[];
}

/**
 * Opens the bases of `dishId` into grocery items. `get` returns a dish document (null = not found / archived).
 * The dish's own typed/learned ingredients are NOT included — only what comes through its bases.
 */
export function expandSubRecipes(dishId: string, get: (id: string) => Doc | null | undefined): Expanded {
  const perUnit: Record<string, number> = {};
  const bases: Record<string, number> = {};
  const problems: SubProblem[] = [];
  const note = (p: SubProblem) => {
    if (!problems.some((x) => x.kind === p.kind && x.dishId === p.dishId)) problems.push(p);
  };
  const walk = (id: string, factor: number, path: string[]) => {
    for (const line of readSubRecipes(get(id)?.subRecipes)) {
      if (line.dishId === dishId || path.includes(line.dishId)) {
        note({ kind: "loop", dishId: line.dishId });
        continue;
      }
      const base = get(line.dishId);
      if (!base) {
        note({ kind: "missing", dishId: line.dishId });
        continue;
      }
      if (base.isSubRecipe !== true) {
        note({ kind: "notBase", dishId: line.dishId });
        continue;
      }
      const f = factor * line.perUnit;
      bases[line.dishId] = (bases[line.dishId] ?? 0) + f;
      for (const [g, q] of Object.entries(ownIngredients(base))) perUnit[g] = (perUnit[g] ?? 0) + f * q;
      if (path.length + 1 >= MAX_SUB_DEPTH) {
        if (readSubRecipes(base.subRecipes).length) note({ kind: "tooDeep", dishId: line.dishId });
        continue;
      }
      walk(line.dishId, f, [...path, line.dishId]);
    }
  };
  walk(dishId, 1, []);
  return { perUnit, bases, problems };
}

/** Every dish id that `dishId` reaches through bases (for loading them before expandSubRecipes). */
export function subRecipeIds(dishId: string, get: (id: string) => Doc | null | undefined): string[] {
  return Object.keys(expandSubRecipes(dishId, get).bases);
}

/** Would saving `subRecipes` on `dishId` make a loop? Returns the base that closes it, or "". */
export function loopIfSaved(dishId: string, subRecipes: SubRecipeLine[], get: (id: string) => Doc | null | undefined): string {
  const seen = new Set<string>();
  const reaches = (id: string, depth: number): boolean => {
    if (id === dishId) return true;
    if (seen.has(id) || depth > 12) return false;
    seen.add(id);
    return readSubRecipes(get(id)?.subRecipes).some((l) => reaches(l.dishId, depth + 1));
  };
  for (const l of subRecipes) {
    seen.clear();
    if (reaches(l.dishId, 0)) return l.dishId;
  }
  return "";
}

/**
 * How much to add to a dish's own per-unit quantity of a grocery item for what comes through its bases.
 * Own quantity typed by the owner → the base quantity is added in full. Own quantity learned from cook logs → the
 * logs already include what went in through the base, so only the shortfall up to the base quantity is added
 * (result = the larger of the two).
 */
export function subRecipeExtra(ownPerUnit: number, basePerUnit: number, ownIsLogged: boolean): number {
  if (!(basePerUnit > 0)) return 0;
  return ownIsLogged ? Math.max(0, basePerUnit - Math.max(0, ownPerUnit)) : basePerUnit;
}
