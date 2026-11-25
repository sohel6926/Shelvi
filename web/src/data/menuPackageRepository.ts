import { collection, doc, getDoc, onSnapshot, updateDoc, writeBatch, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { cancelInfo, type CancelInfo } from "./cancel";
import { updateStamp } from "./audit";
import type { Bilingual } from "../i18n/LanguageContext";
import seed from "./seed/menus.json";

/**
 * `menuPackages/{id}` (docs/data-model.md). Prices are read here only to show the menu; every
 * quote total comes from the quoteMenu callable (calc-spec §11).
 *
 * Firestore cannot store an array directly inside an array, so the "/" groups are stored as
 * `groups: [{ options: [{te, en}, …] }, …]` (contract decision 1); the seed file's plain nested
 * list is converted when it is written.
 */
export interface MenuExtra extends Bilingual {
  key: string;
  price: number | null;
}

export interface MenuReplacement extends Bilingual {
  key: string;
  extraPerPlate: number;
}

export interface MenuPackage extends CancelInfo {
  id: string;
  code: string;
  nameTe: string;
  nameEn: string;
  mealType: string;
  menuDate: string;
  deliveryWindow: string;
  groups: MenuOption[][];
  pricePerPlate: number;
  /** Transport is charged on top, entered per quote (contract decision 2). */
  transportCharged: boolean;
  minOrder: number;
  servingBoy: { chargePerPerson: number; freeRule: "none" | "per50" };
  freePlates: { perPlates: number; extraPlates: number } | null;
  extras: MenuExtra[];
  replacements: MenuReplacement[];
  active: boolean;
  /** R10-11: kids plate price (owner sets); null = kids plates not offered. */
  kidsPrice: number | null;
  /** 🔒 Module 2i: the standard plate cost the owner fixed (null = not fixed yet). */
  standardCost: { perPlate: number; guests: number; at: Date | null } | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** One "/" choice; Round 8: may be linked to a dish (+ variant, pieces per plate) for the cooking plans. */
export interface MenuOption extends Bilingual {
  dishId?: string;
  variantId?: string;
  piecesPerPlate?: number;
}

function toOption(v: unknown): MenuOption {
  const o = (v ?? {}) as DocumentData;
  const out: MenuOption = { te: str(o.te), en: str(o.en) };
  if (str(o.dishId)) out.dishId = str(o.dishId);
  if (str(o.variantId)) out.variantId = str(o.variantId);
  if (typeof o.piecesPerPlate === "number" && o.piecesPerPlate > 0) out.piecesPerPlate = o.piecesPerPlate;
  return out;
}

function toGroups(value: unknown): MenuOption[][] {
  if (!Array.isArray(value)) return [];
  return value.map((g: unknown) => {
    const options = (g as DocumentData | null)?.options;
    return Array.isArray(options) ? options.map(toOption) : [];
  });
}

export function toMenuPackage(id: string, d: DocumentData): MenuPackage {
  const boy = (d.servingBoy ?? {}) as DocumentData;
  const free = d.freePlates as DocumentData | null | undefined;
  return {
    id,
    code: str(d.code) || id,
    nameTe: str(d.nameTe),
    nameEn: str(d.nameEn),
    mealType: str(d.mealType),
    menuDate: str(d.menuDate),
    deliveryWindow: str(d.deliveryWindow),
    groups: toGroups(d.groups),
    pricePerPlate: num(d.pricePerPlate),
    // Missing = true (transport charged extra), per the contract audit.
    transportCharged: d.transportCharged !== false,
    minOrder: num(d.minOrder),
    servingBoy: { chargePerPerson: num(boy.chargePerPerson), freeRule: boy.freeRule === "per50" ? "per50" : "none" },
    freePlates: free ? { perPlates: num(free.perPlates), extraPlates: num(free.extraPlates) } : null,
    extras: Array.isArray(d.extras)
      ? d.extras.map((e: DocumentData) => ({
          key: str(e.key),
          te: str(e.te),
          en: str(e.en),
          price: typeof e.price === "number" ? e.price : null,
        }))
      : [],
    replacements: Array.isArray(d.replacements)
      ? d.replacements.map((r: DocumentData) => ({
          key: str(r.key),
          te: str(r.te),
          en: str(r.en),
          extraPerPlate: num(r.extraPerPlate),
        }))
      : [],
    active: d.active !== false,
    kidsPrice: typeof d.kidsPrice === "number" && Number.isFinite(d.kidsPrice) && d.kidsPrice >= 0 ? d.kidsPrice : null,
    standardCost: d.standardCost && typeof d.standardCost.perPlate === "number" && d.standardCost.perPlate > 0 ? { perPlate: d.standardCost.perPlate, guests: num(d.standardCost.guests), at: typeof d.standardCost.at?.toDate === "function" ? d.standardCost.at.toDate() : null } : null,
    ...cancelInfo(d),
  };
}

/** R10-11 owner sets the kids plate price (null = not offered). */
export async function setKidsPrice(packageId: string, kidsPrice: number | null): Promise<void> {
  await updateDoc(doc(db, "menuPackages", packageId), { kidsPrice, ...updateStamp() });
}

const MEAL_ORDER = ["tiffin", "lunch", "dinner", "lunch-dinner"];

export function subscribeMenuPackages(
  onData: (rows: MenuPackage[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, "menuPackages"),
    (snap) => {
      const rows = snap.docs.map((d) => toMenuPackage(d.id, d.data()));
      rows.sort(
        (a, b) =>
          MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType) || a.code.localeCompare(b.code, "en", { numeric: true }),
      );
      onData(rows);
    },
    (e) => onError?.(e),
  );
}

export const SEED_MENU_COUNT = seed.menus.length;

/**
 * Admin only: writes the 10 owner menus from data/seed/menus.json (copied to ./seed/menus.json).
 * Document id = menu code, so pressing the button again updates instead of duplicating.
 */
export async function seedMenuPackages(uid: string, skipIds: ReadonlySet<string> = new Set(), existing: MenuPackage[] = []): Promise<number> {
  // Keep the owner's dish links (Round 8) when the same option (same Telugu / English text) is loaded again.
  const linksOf = (code: string) => {
    const m = new Map<string, MenuOption>();
    for (const g of existing.find((p) => p.id === code)?.groups ?? []) for (const o of g) if (o.dishId) m.set(`${o.te}|${o.en}`, o);
    return m;
  };
  const batch = writeBatch(db);
  let written = 0;
  for (const m of seed.menus) {
    // Archived packages are frozen for clients (R7-3) — leave them alone.
    if (skipIds.has(m.code)) continue;
    written++;
    const { groups, transportExtra, ...rest } = m;
    batch.set(
      doc(db, "menuPackages", m.code),
      {
        ...rest,
        groups: groups.map((options) => ({
          options: options.map((o: { te: string; en: string }) => {
            const l = linksOf(m.code).get(`${o.te}|${o.en}`);
            return l ? { ...o, dishId: l.dishId, ...(l.variantId ? { variantId: l.variantId } : {}), ...(l.piecesPerPlate ? { piecesPerPlate: l.piecesPerPlate } : {}) } : o;
          }),
        })),
        // The seed's `transportExtra: true` maps to `transportCharged: true` (contract decision 2).
        transportCharged: transportExtra === true,
        seededBy: uid,
        // merge-set: updatedBy for history; createdBy only matters the first time (server trigger reads it on create).
        createdBy: uid,
        ...updateStamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  return written;
}

/**
 * Admin: link one menu option to a dish (Round 8) — or unlink with `link = null`. The stored groups keep the
 * `[{ options: [...] }]` shape; other options are written back unchanged.
 */
export async function linkMenuOption(
  packageId: string,
  groupIndex: number,
  optionIndex: number,
  link: { dishId: string; variantId?: string; piecesPerPlate?: number | null } | null,
): Promise<void> {
  const ref = doc(db, "menuPackages", packageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Menu package not found");
  const raw = snap.data().groups;
  const groups: DocumentData[][] = Array.isArray(raw)
    ? raw.map((g: unknown) => (Array.isArray(g) ? g : Array.isArray((g as DocumentData | null)?.options) ? (g as DocumentData).options : []) as DocumentData[])
    : [];
  const opt = groups[groupIndex]?.[optionIndex];
  if (!opt) throw new Error("Menu option not found");
  const next: DocumentData = { te: str(opt.te), en: str(opt.en) };
  if (link) {
    next.dishId = link.dishId;
    if (link.variantId) next.variantId = link.variantId;
    if (link.piecesPerPlate && link.piecesPerPlate > 0) next.piecesPerPlate = link.piecesPerPlate;
  }
  groups[groupIndex][optionIndex] = next;
  await updateDoc(ref, { groups: groups.map((options) => ({ options })), ...updateStamp() });
}
