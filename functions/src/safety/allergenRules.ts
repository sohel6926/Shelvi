/**
 * Module 5h (20 Nov 2026) — allergen matrix and veg / non-veg separation (spec §44 "Allergen matrix", "Veg/non-veg
 * separation"; Item Master "Food / Compliance: Veg/non-veg classification, allergen flags"; Product Master "Food
 * Controls: allergen/dietary labels"; Kitchen rule 7 "Veg/Non-Veg restrictions cannot be bypassed"). Pure; tested in
 * test/module5h.test.ts.
 *
 * Nothing is invented: the CRM ships with NO allergen list — the owner writes it (settings.allergens). A dish or a
 * grocery item says nothing about allergens until someone tags it (foodTagged = true); an untagged thing is shown as
 * "not tagged", never as "no allergens". The matrix of an event is built from the dish's own tags, the tags of every
 * grocery item in its recipes (learned, typed, every variant) and of every base it uses.
 */
type AnyDoc = Record<string, unknown>;
export type Res<T> = { ok: true; value: T } | { ok: false; te: string; en: string };
const bad = (te: string, en: string) => ({ ok: false as const, te, en });
const text = (d: AnyDoc, f: string, max: number): string => (typeof d[f] === "string" ? (d[f] as string).trim().replace(/\s+/g, " ").slice(0, max) : "");
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const FOOD_TYPES = ["veg", "nonveg"] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export interface Allergen {
  id: string;
  te: string;
  en: string;
}

/** settings.allergens as the owner wrote it: up to 30 names, no duplicates. */
export function parseAllergenList(raw: unknown): Res<Allergen[]> {
  if (!Array.isArray(raw)) return bad("అలర్జీల జాబితా సరిగా లేదు.", "The allergen list is not valid.");
  if (raw.length > 30) return bad("30 అలర్జీల వరకే పెట్టగలరు.", "Up to 30 allergens are allowed.");
  const out: Allergen[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [i, r] of raw.entries()) {
    const d = (typeof r === "object" && r !== null ? r : {}) as AnyDoc;
    const te = text(d, "te", 60);
    const en = text(d, "en", 60) || te;
    if (!te && !en) return bad(`${i + 1} వ అలర్జీకి పేరు రాయండి.`, `Allergen ${i + 1} needs a name.`);
    const key = (en || te).toLowerCase();
    if (names.has(key)) return bad(`"${te || en}" రెండుసార్లు ఉంది.`, `"${en || te}" is listed twice.`);
    names.add(key);
    let id = text(d, "id", 40);
    if (!ID_RE.test(id)) id = `a${i + 1}`;
    while (ids.has(id)) id = `${id}x`;
    ids.add(id);
    out.push({ id, te: te || en, en });
  }
  return { ok: true, value: out };
}
export function normalizeAllergenList(raw: unknown): Allergen[] {
  const r = parseAllergenList(raw);
  return r.ok ? r.value : [];
}

export interface FoodTags {
  foodType: FoodType | "";
  allergens: string[];
}

/** setFoodTags input: the food type ("" = not known) and allergens from the owner's list only. */
export function parseFoodTags(d: AnyDoc, list: Allergen[]): Res<FoodTags> {
  const foodType = d.foodType === undefined || d.foodType === null || d.foodType === "" ? "" : d.foodType;
  if (foodType !== "" && !(FOOD_TYPES as readonly unknown[]).includes(foodType)) return bad("శాకాహారం / మాంసాహారం ఎంచుకోండి.", "Choose veg or non-veg.");
  if (!Array.isArray(d.allergens)) return bad("అలర్జీల జాబితా సరిగా లేదు.", "The allergen list is not valid.");
  const known = new Set(list.map((a) => a.id));
  const out: string[] = [];
  for (const a of d.allergens) {
    if (typeof a !== "string" || !known.has(a)) return bad("జాబితాలో లేని అలర్జీ ఇచ్చారు. ముందు జాబితాలో చేర్చండి.", "An allergen that is not on your list was given. Add it to the list first.");
    if (!out.includes(a)) out.push(a);
  }
  return { ok: true, value: { foodType: foodType as FoodType | "", allergens: out } };
}

/** Tags as stored on a dish / grocery item (written only by setFoodTags). */
export function tagsOf(doc: AnyDoc | null | undefined): { tagged: boolean; foodType: FoodType | ""; allergens: string[] } {
  const d = doc ?? {};
  const foodType = (FOOD_TYPES as readonly unknown[]).includes(d.foodType) ? (d.foodType as FoodType) : "";
  const allergens = Array.isArray(d.allergens) ? d.allergens.filter((x): x is string => typeof x === "string") : [];
  return { tagged: d.foodTagged === true, foodType, allergens };
}

export interface TaggedPart {
  id: string;
  name: string;
  tagged: boolean;
  foodType: FoodType | "";
  allergens: string[];
}
export interface MatrixDishInput {
  dishId: string;
  name: string;
  self: TaggedPart;
  /** grocery items of all its recipes and of its bases */
  ingredients: TaggedPart[];
  /** bases (gravy, masala …) the dish uses, tagged as dishes */
  bases: TaggedPart[];
}
export interface MatrixProblem {
  code: "untagged" | "partsUntagged" | "mislabelled" | "vegOnlyBrand" | "unknownType";
  te: string;
  en: string;
}
export interface MatrixRow {
  dishId: string;
  name: string;
  /** declared on the dish itself */
  declaredType: FoodType | "";
  /** what it really is: non-veg if anything in it is non-veg */
  foodType: FoodType | "unknown";
  /** allergen id → the names of what brings it in */
  allergens: Record<string, string[]>;
  untaggedParts: string[];
  problems: MatrixProblem[];
}

/** One row of the allergen matrix (pure). */
export function matrixRow(d: MatrixDishInput, vegOnlyBrand: string): MatrixRow {
  const allergens: Record<string, string[]> = {};
  const add = (ids: string[], from: string) => {
    for (const id of ids) {
      const l = (allergens[id] ??= []);
      if (!l.includes(from)) l.push(from);
    }
  };
  const parts = [d.self, ...d.bases, ...d.ingredients];
  for (const p of parts) add(p.allergens, p.name);
  const untaggedParts = [...d.bases, ...d.ingredients].filter((p) => !p.tagged).map((p) => p.name);
  const nonVegFrom = parts.filter((p) => p.foodType === "nonveg").map((p) => p.name);
  const everyTypeKnown = parts.every((p) => p.foodType !== "");
  const foodType: MatrixRow["foodType"] = nonVegFrom.length ? "nonveg" : d.self.foodType === "veg" && everyTypeKnown ? "veg" : "unknown";
  const problems: MatrixProblem[] = [];
  if (!d.self.tagged) problems.push({ code: "untagged", te: "ఈ వంటకానికి గుర్తులు పెట్టలేదు", en: "This dish is not tagged" });
  if (untaggedParts.length) problems.push({ code: "partsUntagged", te: `గుర్తులు లేని పదార్థాలు: ${untaggedParts.join(", ")}`, en: `Ingredients / bases not tagged: ${untaggedParts.join(", ")}` });
  if (d.self.foodType === "veg" && nonVegFrom.length) problems.push({ code: "mislabelled", te: `శాకాహారం అని గుర్తించారు, కానీ ఇందులో మాంసాహారం ఉంది: ${nonVegFrom.join(", ")}`, en: `Marked veg, but it contains non-veg: ${nonVegFrom.join(", ")}` });
  if (vegOnlyBrand && foodType === "nonveg") problems.push({ code: "vegOnlyBrand", te: `"${vegOnlyBrand}" శాకాహారం మాత్రమే బ్రాండ్ — ఈ వంటకం మాంసాహారం`, en: `"${vegOnlyBrand}" is a veg-only brand — this dish is non-veg` });
  else if (vegOnlyBrand && foodType === "unknown") problems.push({ code: "unknownType", te: `"${vegOnlyBrand}" శాకాహారం మాత్రమే బ్రాండ్ — ఈ వంటకం శాకాహారమో కాదో తెలియదు`, en: `"${vegOnlyBrand}" is a veg-only brand — not known whether this dish is veg` });
  return { dishId: d.dishId, name: d.name, declaredType: d.self.foodType, foodType, allergens, untaggedParts, problems };
}

/** Menu items of the booking that are not matched to a kitchen dish: only their own veg mark is known. */
export interface MenuOnlyRow {
  name: string;
  foodType: FoodType;
  problems: MatrixProblem[];
}
export function menuOnlyRow(name: string, isVeg: boolean, vegOnlyBrand: string): MenuOnlyRow {
  const foodType: FoodType = isVeg ? "veg" : "nonveg";
  const problems: MatrixProblem[] = [{ code: "untagged", te: "వంటశాల వంటకంతో జత కాలేదు — అలర్జీలు తెలియవు", en: "Not linked to a kitchen dish — allergens unknown" }];
  if (vegOnlyBrand && foodType === "nonveg") problems.push({ code: "vegOnlyBrand", te: `"${vegOnlyBrand}" శాకాహారం మాత్రమే బ్రాండ్ — ఈ ఐటమ్ మాంసాహారం`, en: `"${vegOnlyBrand}" is a veg-only brand — this item is non-veg` });
  return { name, foodType, problems };
}

/** Grocery item ids named in a dish's recipes: learned (every variant), typed (every variant). */
export function recipeGroceryIds(dish: AnyDoc | null): string[] {
  if (!dish) return [];
  const out = new Set<string>();
  const obj = (v: unknown): AnyDoc => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as AnyDoc) : {});
  const fromLines = (v: unknown) => {
    if (Array.isArray(v)) for (const x of v) {
      const id = obj(x).groceryItemId;
      if (typeof id === "string" && id) out.add(id);
    }
    else for (const k of Object.keys(obj(v))) if (k && typeof obj(v)[k] === "number") out.add(k);
  };
  const recipe = obj(dish.recipe);
  fromLines(Array.isArray(dish.recipe) ? dish.recipe : recipe.ingredients);
  fromLines(recipe.typed);
  for (const v of Object.values(obj(recipe.variants))) {
    fromLines(obj(v).ingredients);
    fromLines(obj(v).typed);
  }
  fromLines(dish.typedRecipe);
  for (const v of Array.isArray(dish.variants) ? dish.variants : []) fromLines(obj(v).typedRecipe);
  return [...out];
}

/** Module 6a — veg and non-veg are cooked apart. Which kitchen of the branch each kind of dish belongs in (pure). */
export interface KitchenInfo {
  id: string;
  name: string;
  vegOnly: boolean;
  nonVegAllowed: boolean;
}
export interface KitchenSplit {
  veg: { dishes: string[]; kitchens: string[] };
  nonveg: { dishes: string[]; kitchens: string[] };
  /** dishes whose veg / non-veg is not known: they must be tagged before they can be placed */
  unknown: string[];
  warnings: { te: string; en: string }[];
}
export function kitchenSplit(rows: { name: string; foodType: FoodType | "unknown" }[], kitchens: KitchenInfo[]): KitchenSplit {
  const names = (t: FoodType) => rows.filter((r) => r.foodType === t).map((r) => r.name);
  const vegDishes = names("veg");
  const nonDishes = names("nonveg");
  const vegKitchens = kitchens.filter((k) => k.vegOnly).map((k) => k.name);
  const nonKitchens = kitchens.filter((k) => !k.vegOnly && k.nonVegAllowed).map((k) => k.name);
  const warnings: KitchenSplit["warnings"] = [];
  if (nonDishes.length && vegDishes.length && vegKitchens.length === 0 && kitchens.length > 0) {
    warnings.push({ te: "ఈ శాఖలో శాకాహార-మాత్రమే వంటశాల లేదు — శాకాహార, మాంసాహార వంటలు ఒకే వంటశాలలో కలుస్తాయి.", en: "This branch has no veg-only kitchen — veg and non-veg dishes would be cooked in the same kitchen." });
  }
  if (nonDishes.length && nonKitchens.length === 0 && kitchens.length > 0) {
    warnings.push({ te: "మాంసాహారం వండడానికి అనుమతి ఉన్న వంటశాల ఈ శాఖలో లేదు.", en: "No kitchen in this branch is allowed to cook non-veg." });
  }
  if (kitchens.length === 0 && (vegDishes.length || nonDishes.length)) {
    warnings.push({ te: "ఈ శాఖకు వంటశాలలు ఇంకా చేర్చలేదు (\"కంపెనీ · బ్రాండ్ · శాఖలు\" తెర).", en: "No kitchens are set up for this branch yet (Company · Brands · Branches screen)." });
  }
  return {
    veg: { dishes: vegDishes, kitchens: vegKitchens.length ? vegKitchens : kitchens.filter((k) => k.nonVegAllowed || !k.vegOnly).map((k) => k.name) },
    nonveg: { dishes: nonDishes, kitchens: nonKitchens },
    unknown: rows.filter((r) => r.foodType === "unknown").map((r) => r.name),
    warnings,
  };
}
