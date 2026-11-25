/** Module 5h: food type + allergen tags on dishes and grocery items (written only by the setFoodTags callable). */
export type FoodType = "veg" | "nonveg";
export interface FoodTags {
  /** false = nobody has tagged it: its allergens are NOT known (never read as "none") */
  tagged: boolean;
  foodType: FoodType | "";
  allergens: string[];
}
export function readFoodTags(d: Record<string, unknown>): FoodTags {
  return {
    tagged: d.foodTagged === true,
    foodType: d.foodType === "veg" || d.foodType === "nonveg" ? d.foodType : "",
    allergens: Array.isArray(d.allergens) ? d.allergens.filter((x): x is string => typeof x === "string") : [],
  };
}
export interface Allergen {
  id: string;
  te: string;
  en: string;
}
export function readAllergens(raw: unknown): Allergen[] {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return raw.filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null).map((a) => ({ id: s(a.id), te: s(a.te), en: s(a.en) || s(a.te) })).filter((a) => a.id);
}
