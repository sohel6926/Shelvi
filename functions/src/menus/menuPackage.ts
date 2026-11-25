/**
 * Reading a menuPackages/{id} document into calc's MenuPricing, with the whole-menu checks of
 * spec §11 ("the whole menu is checked, not only chosen items"), and validating quote requests.
 * Throws CalcError → invalid-argument.
 */
import { CalcError } from "../calc/util";
import { piecesFromName } from "../calc/recipes";
import { MenuPricing, QuoteInput } from "../calc/menus";
import { SpecialMeal, SPECIAL_MEAL_TYPES } from "../calc/round10";
import { asArr, asObj, asStr, Doc } from "../shared/coerce";

export interface Bi {
  te: string;
  en: string;
}

/** A menu option: name, and (Round 8) the dish + variant it links to and pieces per plate. */
export interface MenuOption extends Bi {
  dishId?: string;
  variantId?: string;
  piecesPerPlate?: number;
}

/** Option → object without undefined fields (Firestore rejects undefined). piecesPerPlate parsed from "ఇడ్లీ – 3". */
export function menuOption(v: unknown): MenuOption {
  const o = asObj(v);
  const out: MenuOption = { te: asStr(o.te), en: asStr(o.en) };
  if (asStr(o.dishId)) out.dishId = asStr(o.dishId);
  if (asStr(o.variantId)) out.variantId = asStr(o.variantId);
  const typed = typeof o.piecesPerPlate === "number" && o.piecesPerPlate > 0 ? o.piecesPerPlate : null;
  const parsed = typed ?? piecesFromName(out.te) ?? piecesFromName(out.en);
  if (parsed) out.piecesPerPlate = parsed;
  return out;
}

export interface MenuMeta {
  code: string;
  nameTe: string;
  nameEn: string;
  menuDate: string;
  mealType: string;
  /** each group: pick exactly one option */
  groups: MenuOption[][];
  extraNames: Record<string, Bi>;
  replacementNames: Record<string, Bi>;
  active: boolean;
  /** true = transport is charged extra, entered per quote (seed `transportExtra: true` maps to this). */
  transportCharged: boolean;
  /** R10-11 price of a kids plate; null = kids plates not offered */
  kidsPrice: number | null;
}

function finiteNonNeg(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new CalcError(`menu: ${name} must be a number ≥ 0`);
  return v;
}

function wholeAtLeast(name: string, v: unknown, min: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) throw new CalcError(`menu: ${name} must be a whole number ≥ ${min}`);
  return v;
}

function bi(v: unknown): Bi {
  const o = asObj(v);
  return { te: asStr(o.te), en: asStr(o.en) };
}

/** Groups may be stored as [[{te,en}]] (seed JSON) or [{options:[{te,en}]}] (Firestore cannot store nested arrays). */
function parseGroups(v: unknown): MenuOption[][] {
  return asArr(v).map((g) => (Array.isArray(g) ? g : asArr(asObj(g).options)).map(menuOption));
}

export function parseMenuPackage(d: Doc): { pricing: MenuPricing; meta: MenuMeta } {
  const servingBoy = asObj(d.servingBoy);
  const freeRule = servingBoy.freeRule;
  if (freeRule !== "none" && freeRule !== "per50") throw new CalcError("menu: servingBoy.freeRule must be none or per50");
  let freePlates: MenuPricing["freePlates"] = null;
  if (d.freePlates !== null && d.freePlates !== undefined) {
    const fp = asObj(d.freePlates);
    freePlates = { perPlates: wholeAtLeast("freePlates.perPlates", fp.perPlates, 1), extraPlates: wholeAtLeast("freePlates.extraPlates", fp.extraPlates, 0) };
  }
  const extraNames: Record<string, Bi> = {};
  const extras = asArr(d.extras).map((x) => {
    const o = asObj(x);
    const key = asStr(o.key);
    if (!key) throw new CalcError("menu: every extra needs a key");
    if (extraNames[key]) throw new CalcError(`menu: extra key ${key} is listed twice`);
    extraNames[key] = bi(o);
    const price = o.price === null || o.price === undefined ? null : finiteNonNeg(`extra ${key} price`, o.price);
    return { key, price };
  });
  const replacementNames: Record<string, Bi> = {};
  const replacements = asArr(d.replacements).map((x) => {
    const o = asObj(x);
    const key = asStr(o.key);
    if (!key) throw new CalcError("menu: every replacement needs a key");
    if (replacementNames[key]) throw new CalcError(`menu: replacement key ${key} is listed twice`);
    replacementNames[key] = bi(o);
    return { key, extraPerPlate: finiteNonNeg(`replacement ${key} extraPerPlate`, o.extraPerPlate) };
  });
  const pricing: MenuPricing = {
    pricePerPlate: finiteNonNeg("pricePerPlate", d.pricePerPlate),
    minOrder: wholeAtLeast("minOrder", d.minOrder ?? 0, 0),
    servingBoy: { chargePerPerson: finiteNonNeg("servingBoy.chargePerPerson", servingBoy.chargePerPerson), freeRule },
    freePlates,
    extras,
    replacements,
  };
  const meta: MenuMeta = {
    code: asStr(d.code),
    nameTe: asStr(d.nameTe),
    nameEn: asStr(d.nameEn),
    menuDate: asStr(d.menuDate),
    mealType: asStr(d.mealType),
    groups: parseGroups(d.groups),
    extraNames,
    replacementNames,
    active: d.active !== false,
    transportCharged: typeof d.transportCharged === "boolean" ? d.transportCharged : d.transportExtra !== false,
    kidsPrice: d.kidsPrice === undefined || d.kidsPrice === null || d.kidsPrice === "" ? null : finiteNonNeg("kidsPrice", d.kidsPrice),
  };
  return { pricing, meta };
}

/** The quoteMenu request minus gstRate (taken from settings on the server); R10-11 kids and special meals. */
export type QuoteRequest = Omit<QuoteInput, "gstRate"> & { kidsCount?: number; specialMeals?: SpecialMeal[] };

/** R10-11 specialMeals[] { type, count, note?, extraPerPlate? } (validated again by the calc). */
export function parseSpecialMeals(v: unknown): SpecialMeal[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20) throw new CalcError("specialMeals must be a list (at most 20)");
  return v.map((x, i) => {
    const o = asObj(x);
    if (!(SPECIAL_MEAL_TYPES as readonly string[]).includes(asStr(o.type))) throw new CalcError(`specialMeals[${i}].type must be one of ${SPECIAL_MEAL_TYPES.join(", ")}`);
    if (typeof o.count !== "number" || !Number.isInteger(o.count) || o.count < 1) throw new CalcError(`specialMeals[${i}].count must be a whole number ≥ 1`);
    const m: SpecialMeal = { type: asStr(o.type) as SpecialMeal["type"], count: o.count };
    const note = asStr(o.note).trim().slice(0, 500);
    if (note) m.note = note;
    if (o.extraPerPlate !== undefined && o.extraPerPlate !== null) {
      if (typeof o.extraPerPlate !== "number" || !Number.isFinite(o.extraPerPlate) || o.extraPerPlate < 0) throw new CalcError(`specialMeals[${i}].extraPerPlate must be ≥ 0`);
      if (o.extraPerPlate > 0) m.extraPerPlate = o.extraPerPlate;
    }
    return m;
  });
}

export function parseQuoteRequest(d: Doc): QuoteRequest {
  const replacements = d.replacements === undefined || d.replacements === null ? [] : d.replacements;
  if (!Array.isArray(replacements) || !replacements.every((r) => typeof r === "string")) throw new CalcError("replacements must be a list of keys");
  if (new Set(replacements).size !== replacements.length) throw new CalcError("the same replacement is chosen twice");
  const extrasRaw = d.extras === undefined || d.extras === null ? [] : d.extras;
  if (!Array.isArray(extrasRaw)) throw new CalcError("extras must be a list");
  const extras = extrasRaw.map((x, i) => {
    const o = asObj(x);
    if (typeof o.key !== "string" || !o.key) throw new CalcError(`extras[${i}].key is required`);
    if (typeof o.qty !== "number") throw new CalcError(`extras[${i}].qty must be a number`);
    const e: { key: string; qty: number; price?: number } = { key: o.key, qty: o.qty };
    if (o.price !== undefined && o.price !== null) {
      if (typeof o.price !== "number") throw new CalcError(`extras[${i}].price must be a number`);
      e.price = o.price;
    }
    return e;
  });
  if (new Set(extras.map((e) => e.key)).size !== extras.length) throw new CalcError("the same extra is listed twice (use qty)");
  const num = (k: string, def?: number): number => {
    const v = d[k];
    if (v === undefined || v === null) {
      if (def === undefined) throw new CalcError(`${k} is required`);
      return def;
    }
    if (typeof v !== "number") throw new CalcError(`${k} must be a number`);
    return v;
  };
  if (d.isInterState !== undefined && typeof d.isInterState !== "boolean") throw new CalcError("isInterState must be true or false");
  const kidsCount = num("kidsCount", 0);
  if (!Number.isInteger(kidsCount) || kidsCount < 0) throw new CalcError("kidsCount must be a whole number ≥ 0");
  const specialMeals = parseSpecialMeals(d.specialMeals);
  return {
    ...(kidsCount > 0 ? { kidsCount } : {}),
    ...(specialMeals.length ? { specialMeals } : {}),
    plates: num("plates"),
    servingBoys: num("servingBoys", 0),
    transport: num("transport", 0),
    replacements: replacements as string[],
    extras,
    discount: num("discount", 0),
    isInterState: d.isInterState === true,
  };
}

/** Bilingual description of a quote line (line names from calc: plates, replacement:<k>, extra:<k>, servingBoys, transport). */
export function describeLine(item: string, meta: MenuMeta): Bi {
  if (item === "plates") return { te: `${meta.nameTe || meta.nameEn} — ప్లేట్లు`, en: `${meta.nameEn || meta.nameTe} — plates` };
  if (item === "servingBoys") return { te: "సర్వింగ్ బాయ్స్", en: "Serving boys" };
  if (item === "transport") return { te: "రవాణా", en: "Transport" };
  if (item === "kids") return { te: "పిల్లల ప్లేట్లు", en: "Kids plates" };
  if (item.startsWith("special:")) {
    const t = SPECIAL_MEAL_TE[item.slice(8)] ?? { te: item.slice(8), en: item.slice(8) };
    return { te: `ప్రత్యేక భోజనం: ${t.te}`, en: `Special meal: ${t.en}` };
  }
  const [kind, key] = item.split(":");
  const n = kind === "replacement" ? meta.replacementNames[key] : meta.extraNames[key];
  if (kind === "replacement") return { te: `మార్పు: ${n?.te || key}`, en: `Replacement: ${n?.en || key}` };
  return { te: `అదనం: ${n?.te || key}`, en: `Extra: ${n?.en || key}` };
}

export const SPECIAL_MEAL_TE: Record<string, Bi> = {
  "no-onion-garlic": { te: "ఉల్లి, వెల్లుల్లి లేకుండా", en: "No onion / garlic" },
  jain: { te: "జైన్", en: "Jain" },
  allergy: { te: "అలర్జీ", en: "Allergy" },
  diabetic: { te: "షుగర్ ఉన్నవారికి", en: "Diabetic" },
  other: { te: "ఇతర", en: "Other" },
};

/** The chosen dish of each "/" group. */
export function chooseOptions(meta: MenuMeta, selections: unknown): MenuOption[] {
  if (!Array.isArray(selections)) throw new CalcError("selections must be a list");
  if (selections.length !== meta.groups.length) throw new CalcError(`selections must have one choice for each of the ${meta.groups.length} groups`);
  return meta.groups.map((g, i) => {
    const s = selections[i];
    if (typeof s !== "number" || !Number.isInteger(s) || s < 0 || s >= g.length) throw new CalcError(`selections[${i}] must be 0–${g.length - 1}`);
    return g[s];
  });
}

/** A menu with transportCharged == false includes transport in the plate price, so no transport amount may be added. */
export function checkTransport(meta: MenuMeta, transport: number): void {
  if (!meta.transportCharged && transport > 0) throw new CalcError("this menu includes transport in the plate price; transport must be 0");
}
