import { addDoc, collection, doc, onSnapshot, query, updateDoc, type DocumentData } from "firebase/firestore";
import { readFoodTags, type FoodTags } from "./foodTags";
import { db } from "../firebase";
import { createStamp, updateStamp } from "./audit";
import { cancelInfo, type CancelInfo } from "./cancel";
import type { Bilingual } from "../i18n/LanguageContext";

/**
 * Round 8 dish master (`dishes/{id}`, calc-spec §13 / §13.5). Owner fields (admin + manager write): nameTe, nameEn,
 * unit, category, role, variants[], typedRecipe[], startRules[], basePer100. `learned` and `recipe` are 🔒 server-only.
 */
export const DISH_CATEGORIES = ["rice", "curry", "dal", "liquid", "fry", "sweet", "chutney-pickle", "roti-bread", "snack", "drink", "tiffin", "other"] as const;
export type DishCategory = (typeof DISH_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<DishCategory, Bilingual> = {
  rice: { te: "అన్నం రకాలు", en: "Rice" },
  curry: { te: "కూర", en: "Curry" },
  dal: { te: "పప్పు", en: "Dal" },
  liquid: { te: "సాంబారు / రసం / పులుసు", en: "Sambar / rasam" },
  fry: { te: "వేపుడు", en: "Fry" },
  sweet: { te: "స్వీట్", en: "Sweet" },
  "chutney-pickle": { te: "పచ్చడి / ఊరగాయ", en: "Chutney / pickle" },
  "roti-bread": { te: "రొట్టె / పుల్కా", en: "Roti / bread" },
  snack: { te: "స్నాక్స్ / స్టార్టర్", en: "Snack / starter" },
  drink: { te: "పానీయం", en: "Drink" },
  tiffin: { te: "టిఫిన్", en: "Tiffin" },
  other: { te: "ఇతర", en: "Other" },
};

export const DISH_ROLES = ["rice", "flavoured-rice", "bread", "tiffin-main", "side", "sweet", "starter", "drink", "other"] as const;
export type DishRole = (typeof DISH_ROLES)[number];

export const ROLE_LABEL: Record<DishRole, Bilingual> = {
  rice: { te: "తెల్ల అన్నం", en: "Plain rice" },
  "flavoured-rice": { te: "రుచి అన్నం (పులిహోర, బిర్యానీ, పులావ్)", en: "Flavoured rice" },
  bread: { te: "రొట్టె / పుల్కా", en: "Bread" },
  "tiffin-main": { te: "టిఫిన్ ముఖ్యం", en: "Tiffin main" },
  side: { te: "కూర / పప్పు / సాంబారు (పక్కది)", en: "Side" },
  sweet: { te: "స్వీట్", en: "Sweet" },
  starter: { te: "స్టార్టర్", en: "Starter" },
  drink: { te: "పానీయం", en: "Drink" },
  other: { te: "ఇతర", en: "Other" },
};

/** Default role from the category (server calc/recipes.ts roleOfCategory). */
export function roleOfCategory(category: string): DishRole {
  switch (category) {
    case "rice":
      return "rice";
    case "roti-bread":
      return "bread";
    case "tiffin":
      return "tiffin-main";
    case "curry":
    case "dal":
    case "liquid":
    case "fry":
    case "chutney-pickle":
      return "side";
    case "sweet":
      return "sweet";
    case "snack":
      return "starter";
    case "drink":
      return "drink";
    default:
      return "other";
  }
}

/** Main roles used in comboKey (§13.5): sorted, joined with "+". */
export const MAIN_ROLES = ["bread", "flavoured-rice", "rice", "tiffin-main"] as const;

/** All combinations of main roles (sorted, "+"-joined) for the starting-rules picker. */
export const COMBO_KEYS: string[] = (() => {
  const out: string[] = [];
  const n = MAIN_ROLES.length;
  for (let mask = 1; mask < 1 << n; mask++) out.push(MAIN_ROLES.filter((_, i) => mask & (1 << i)).join("+"));
  return out.sort((a, b) => a.split("+").length - b.split("+").length || a.localeCompare(b));
})();

export function comboLabel(key: string, lang: "te" | "en"): string {
  if (!key) return lang === "te" ? "ఏదైనా" : "Any";
  return key
    .split("+")
    .map((r) => {
      const [role, times] = r.split("×");
      const l = ROLE_LABEL[role as DishRole];
      const name = l ? (lang === "te" ? l.te.split(" (")[0] : l.en) : role;
      return times ? `${name} ×${times}` : name;
    })
    .join(" + ");
}

export const SERVICE_STYLES = ["banthi", "buffet", "other"] as const;
export type ServiceStyle = (typeof SERVICE_STYLES)[number];
export const STYLE_LABEL: Record<ServiceStyle, Bilingual> = {
  banthi: { te: "బంతి భోజనం", en: "Banthi (served at the table)" },
  buffet: { te: "బఫే", en: "Buffet" },
  other: { te: "ఇతర", en: "Other" },
};
export function toServiceStyle(v: unknown): ServiceStyle | "" {
  return (SERVICE_STYLES as readonly string[]).includes(v as string) ? (v as ServiceStyle) : "";
}

export const SIZE_BANDS = ["S", "M", "L", "XL"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const BAND_LABEL: Record<SizeBand, Bilingual> = {
  S: { te: "చిన్న (≤150)", en: "Small (≤150)" },
  M: { te: "మధ్య (151–400)", en: "Medium (151–400)" },
  L: { te: "పెద్ద (401–800)", en: "Large (401–800)" },
  XL: { te: "చాలా పెద్ద (800+)", en: "Very large (800+)" },
};

export const DISH_UNITS = ["kg", "L", "pcs"] as const;

export interface TypedLine {
  groceryItemId: string;
  /** Grocery quantity per 1 kg / L / pc of the cooked dish. */
  perUnit: number;
}

export interface DishVariant {
  id: string;
  nameTe: string;
  nameEn: string;
  piecesPerPlate: number | null;
  typedRecipe: TypedLine[];
}

/** One owner starting rule (§13.5): per100 for a (style / combo / size) cell, or ±% for exactly ONE dimension. */
export interface StartRule {
  style?: string;
  comboKey?: string;
  band?: string;
  per100?: number;
  factorPct?: number;
}

export interface LearnedBand {
  per100: number | null;
  events: number;
}

export interface Learned {
  per100: number | null;
  status: "none" | "learning" | "learned";
  eventsUsed: number;
  advice: string;
  changePct: number;
  byBand: Partial<Record<SizeBand, LearnedBand>>;
  byCell: Record<string, LearnedBand>;
  factors: { band: Record<string, number>; style: Record<string, number>; combo: Record<string, number> };
}

export interface Dish extends CancelInfo {
  id: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  category: DishCategory;
  role: DishRole;
  variants: DishVariant[];
  typedRecipe: TypedLine[];
  startRules: StartRule[];
  basePer100: number | null;
  learned: Learned | null;
  /** 🔒 learned ingredient ratios per 1 unit of the dish. */
  recipe: { groceryItemId: string; perUnit: number; eventsUsed: number }[];
  /** Module 2e: this is a base preparation (gravy, masala …) used inside other dishes. */
  isSubRecipe: boolean;
  /** Module 2e: bases used by this dish — quantity of the base per 1 unit of the dish. */
  subRecipes: SubRecipeLine[];
  /** Module 5h */
  food: FoodTags;
}

export interface SubRecipeLine {
  dishId: string;
  perUnit: number;
}

/** Module 2e: would saving `subs` on `dishId` make a loop (a base that leads back to this dish)? Returns that base's id or "". */
export function subRecipeLoop(dishId: string, subs: SubRecipeLine[], all: Dish[]): string {
  const byId = new Map(all.map((d) => [d.id, d]));
  const reaches = (id: string, seen: Set<string>): boolean => {
    if (id === dishId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (byId.get(id)?.subRecipes ?? []).some((l) => reaches(l.dishId, seen));
  };
  for (const l of subs) if (dishId && reaches(l.dishId, new Set())) return l.dishId;
  return "";
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toTyped(v: unknown): TypedLine[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object").map((x: DocumentData) => ({ groceryItemId: s(x.groceryItemId), perUnit: n(x.perUnit) ?? 0 })).filter((x) => x.groceryItemId);
  if (v && typeof v === "object") return Object.entries(v as DocumentData).filter(([, x]) => typeof x === "number").map(([k, x]) => ({ groceryItemId: k, perUnit: x as number }));
  return [];
}

function toNumMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as DocumentData)) if (typeof x === "number") out[k] = x;
  return out;
}

function toBandMap(v: unknown): Record<string, LearnedBand> {
  const out: Record<string, LearnedBand> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as DocumentData)) if (x && typeof x === "object") out[k] = { per100: n((x as DocumentData).per100), events: n((x as DocumentData).events) ?? 0 };
  return out;
}

function toLearned(v: unknown): Learned | null {
  if (!v || typeof v !== "object") return null;
  const d = v as DocumentData;
  const f = (d.factors ?? {}) as DocumentData;
  const events = n(d.eventsUsed) ?? 0;
  return {
    per100: n(d.per100),
    status: d.status === "learned" ? "learned" : d.status === "learning" ? "learning" : events > 0 ? (events >= 5 ? "learned" : "learning") : "none",
    eventsUsed: events,
    advice: s(d.advice) || "ok",
    changePct: n(d.changePct) ?? 0,
    byBand: toBandMap(d.byBand),
    byCell: toBandMap(d.byCell),
    factors: { band: toNumMap(f.band), style: toNumMap(f.style), combo: toNumMap(f.combo) },
  };
}

export function toDish(id: string, d: DocumentData): Dish {
  const category = (DISH_CATEGORIES as readonly string[]).includes(d.category) ? (d.category as DishCategory) : "other";
  const recipe = (d.recipe ?? {}) as DocumentData;
  return {
    id,
    nameTe: s(d.nameTe),
    nameEn: s(d.nameEn),
    unit: (DISH_UNITS as readonly string[]).includes(d.unit) ? d.unit : "kg",
    category,
    role: (DISH_ROLES as readonly string[]).includes(d.role) ? (d.role as DishRole) : roleOfCategory(category),
    variants: Array.isArray(d.variants)
      ? d.variants
          .filter((x: unknown) => x && typeof x === "object")
          .map((x: DocumentData, i: number) => ({
            id: s(x.id) || `v${i + 1}`,
            nameTe: s(x.nameTe),
            nameEn: s(x.nameEn),
            piecesPerPlate: n(x.piecesPerPlate),
            typedRecipe: toTyped(x.typedRecipe),
          }))
      : [],
    typedRecipe: toTyped(d.typedRecipe),
    startRules: Array.isArray(d.startRules)
      ? d.startRules
          .filter((x: unknown) => x && typeof x === "object")
          .map((x: DocumentData) => {
            const r: StartRule = {};
            if (s(x.style)) r.style = s(x.style);
            if (typeof x.comboKey === "string" && x.comboKey) r.comboKey = x.comboKey;
            if (s(x.band)) r.band = s(x.band);
            if (n(x.per100) !== null) r.per100 = n(x.per100) as number;
            if (n(x.factorPct) !== null) r.factorPct = n(x.factorPct) as number;
            return r;
          })
      : [],
    basePer100: n(d.basePer100),
    learned: toLearned(d.learned),
    recipe: Array.isArray(recipe.ingredients)
      ? recipe.ingredients
          .filter((x: unknown) => x && typeof x === "object")
          .map((x: DocumentData) => ({ groceryItemId: s(x.groceryItemId), perUnit: n(x.perUnit) ?? 0, eventsUsed: n(x.eventsUsed) ?? 0 }))
      : [],
    isSubRecipe: d.isSubRecipe === true,
    subRecipes: Array.isArray(d.subRecipes)
      ? d.subRecipes
          .filter((x: unknown) => x && typeof x === "object")
          .map((x: DocumentData) => ({ dishId: s(x.dishId), perUnit: n(x.perUnit) ?? 0 }))
          .filter((x: SubRecipeLine) => x.dishId && x.perUnit > 0)
      : [],
    food: readFoodTags(d),
    ...cancelInfo(d),
  };
}

export function subscribeDishes(onData: (rows: Dish[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "dishes")),
    (snap) => onData(snap.docs.map((d) => toDish(d.id, d.data())).sort((a, b) => (a.nameTe || a.nameEn).localeCompare(b.nameTe || b.nameEn))),
    (e) => onError?.(e),
  );
}

export function subscribeDish(id: string, onData: (d: Dish | null) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db, "dishes", id),
    (snap) => onData(snap.exists() ? toDish(snap.id, snap.data()) : null),
    (e) => onError?.(e),
  );
}

export type DishInput = Pick<Dish, "nameTe" | "nameEn" | "unit" | "category" | "role" | "variants" | "typedRecipe" | "startRules" | "basePer100" | "isSubRecipe" | "subRecipes"> & { id?: string };

/** Owner fields only (rules: learned / recipe are server-only). No undefined values reach Firestore. */
export async function saveDish(input: DishInput): Promise<string> {
  const data = {
    nameTe: input.nameTe,
    nameEn: input.nameEn,
    unit: input.unit,
    category: input.category,
    role: input.role,
    variants: input.variants.map((v) => ({
      id: v.id,
      nameTe: v.nameTe,
      nameEn: v.nameEn,
      piecesPerPlate: v.piecesPerPlate,
      typedRecipe: v.typedRecipe.map((t) => ({ groceryItemId: t.groceryItemId, perUnit: t.perUnit })),
    })),
    typedRecipe: input.typedRecipe.map((t) => ({ groceryItemId: t.groceryItemId, perUnit: t.perUnit })),
    startRules: input.startRules.map((r) => {
      const o: Record<string, string | number> = {};
      if (r.style) o.style = r.style;
      if (r.comboKey) o.comboKey = r.comboKey;
      if (r.band) o.band = r.band;
      if (typeof r.per100 === "number") o.per100 = r.per100;
      if (typeof r.factorPct === "number") o.factorPct = r.factorPct;
      return o;
    }),
    basePer100: input.basePer100,
    isSubRecipe: input.isSubRecipe,
    subRecipes: input.subRecipes.filter((l) => l.dishId && l.perUnit > 0).slice(0, 20).map((l) => ({ dishId: l.dishId, perUnit: l.perUnit })),
  };
  if (!input.id) {
    const ref = await addDoc(collection(db, "dishes"), { ...data, ...createStamp() });
    return ref.id;
  }
  await updateDoc(doc(db, "dishes", input.id), { ...data, ...updateStamp() });
  return input.id;
}

/** "నేర్చుకుంటోంది 2/5" / "నేర్చుకున్నది ✓" / "ఇంకా నేర్చుకోలేదు" (server learnStatus). */
export function learnBadge(events: number): { status: "none" | "learning" | "learned"; te: string; en: string } {
  if (events <= 0) return { status: "none", te: "ఇంకా నేర్చుకోలేదు", en: "Not learned yet" };
  if (events < 5) return { status: "learning", te: `నేర్చుకుంటోంది ${events}/5`, en: `Learning ${events}/5` };
  return { status: "learned", te: "నేర్చుకున్నది ✓", en: "Learned ✓" };
}

/** Problems with the starting rules (Telugu / English). A ±% rule must name exactly one of style / combo / size. */
export function startRuleProblems(rules: StartRule[], L: (te: string, en: string) => string): string[] {
  const out: string[] = [];
  rules.forEach((r, i) => {
    const dims = [r.style, r.comboKey, r.band].filter((x) => x !== undefined && x !== "").length;
    const hasPer = typeof r.per100 === "number";
    const hasPct = typeof r.factorPct === "number";
    if (hasPer === hasPct) out.push(L(`నియమం ${i + 1}: 100 మందికి లేదా ±% — ఏదో ఒకటి రాయండి.`, `Rule ${i + 1}: give either per 100 or ±%, not both.`));
    if (hasPct && dims !== 1) out.push(L(`నియమం ${i + 1}: ±% నియమానికి ఒక్కటే ఎంచుకోండి (వడ్డన / కలయిక / సైజు).`, `Rule ${i + 1}: a ±% rule needs exactly one of style / combination / size.`));
    // Server (calc/recipes.ts): a per-100 rule is picked by style and / or combination; size only narrows it.
    if (hasPer && !r.style && !r.comboKey) out.push(L(`నియమం ${i + 1}: వడ్డన రకం లేదా మెనూ కలయిక ఎంచుకోండి.`, `Rule ${i + 1}: choose a service style or a menu combination.`));
    if (hasPer && (r.per100 as number) < 0) out.push(L(`నియమం ${i + 1}: 100 మందికి 0 లేదా ఎక్కువ.`, `Rule ${i + 1}: per 100 must be 0 or more.`));
    if (hasPct && ((r.factorPct as number) < -50 || (r.factorPct as number) > 50)) out.push(L(`నియమం ${i + 1}: % −50 నుండి +50 మధ్య.`, `Rule ${i + 1}: % must be between −50 and +50.`));
  });
  return out;
}
