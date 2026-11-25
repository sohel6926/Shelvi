import { addDoc, collection, doc, onSnapshot, query, updateDoc, writeBatch, type DocumentData } from "firebase/firestore";
import { readFoodTags, type FoodTags } from "./foodTags";
import { db } from "../firebase";
import { createStamp, updateStamp } from "./audit";
import { cancelInfo } from "./cancel";
import seed from "./seed/grocery-items.json";

/**
 * `groceryItems/{id}` — the grocery master (calc §6). `per100` = quantity for 100 guests (null = not
 * set yet → left out of the grocery calculation). `inventoryItemId` links the item to a stock item for
 * event stock deduction. `source: "seed"` marks items loaded from data/seed/grocery-items.json that
 * the owner has not edited; any edit from the web sets `source: "owner"`, and the seed loader never
 * overwrites those.
 */
export const GROCERY_UNITS = ["kg", "L", "pcs"] as const;
export type GroceryUnit = (typeof GROCERY_UNITS)[number];

export interface GroceryModule {
  id: string;
  te: string;
  en: string;
}

/** The 7 purchase modules (same order as the phone app's catalog). */
export const GROCERY_MODULES: GroceryModule[] = seed.modules;

export interface GroceryItem {
  id: string;
  nameTe: string;
  nameEn: string;
  nameRoman: string;
  module: string;
  group: string;
  unit: string;
  purchaseUnits: string[];
  aliases: string[];
  /** Module 2a: this item's own pack sizes — 1 `unit` = `qty` of the item's unit ("Bag" = 25 kg). */
  packs: GroceryPack[];
  /** Module 2c: usable share of what is bought, 10–100; null = no loss (100). */
  yieldPct: number | null;
  /** null = not set yet */
  per100: number | null;
  inventoryItemId: string;
  source: string;
  /** R7-3 archived (hidden unless "show cancelled"). */
  cancelled: boolean;
  cancelReason: string;
  /** Module 5h */
  food: FoodTags;
}

export interface GroceryPack {
  unit: string;
  qty: number;
}

/** Units with a fixed meaning: never a pack (same list as functions/src/shared/itemUnits.ts). */
const FIXED_UNITS = ["kg", "kgs", "kilo", "kilos", "g", "gm", "gms", "gram", "grams", "l", "lt", "ltr", "litre", "litres", "liter", "liters", "ml", "pc", "pcs", "piece", "pieces", "no", "nos", "dozen", "dz"];
export const isFixedUnit = (u: string) => FIXED_UNITS.includes(u.trim().toLowerCase().replace(/\.$/, ""));

/** Lower-case, letters and digits only — for comparing item names (same as the server's nameKey). */
export const nameKey = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "");

/** Every name an item is known by: Telugu, English, Roman and its other names. */
export const groceryNames = (i: Pick<GroceryItem, "nameTe" | "nameEn" | "nameRoman" | "aliases">) => [i.nameTe, i.nameEn, i.nameRoman, ...i.aliases].filter((n) => nameKey(n) !== "");

export interface GroceryItemInput {
  id?: string;
  nameTe: string;
  nameEn: string;
  nameRoman: string;
  module: string;
  group: string;
  unit: GroceryUnit;
  /** Quantity for 100 guests (≥ 0), or null = not set. */
  per100: number | null;
  inventoryItemId: string;
  /** Module 2a */
  packs: GroceryPack[];
  aliases: string[];
  /** Module 2c: 10–100, or null = no loss */
  yieldPct: number | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toGrocery(id: string, d: DocumentData): GroceryItem {
  return {
    id,
    nameTe: str(d.nameTe),
    nameEn: str(d.nameEn),
    nameRoman: str(d.nameRoman),
    module: str(d.module),
    group: str(d.group),
    unit: str(d.unit),
    purchaseUnits: strList(d.purchaseUnits),
    aliases: strList(d.aliases),
    packs: Array.isArray(d.packs)
      ? d.packs
          .filter((p): p is { unit: string; qty: number } => !!p && typeof p.unit === "string" && p.unit.trim() !== "" && typeof p.qty === "number" && p.qty > 0)
          .map((p) => ({ unit: p.unit, qty: p.qty }))
      : [],
    yieldPct: typeof d.yieldPct === "number" && d.yieldPct >= 10 && d.yieldPct <= 100 ? d.yieldPct : null,
    per100: typeof d.per100 === "number" && Number.isFinite(d.per100) ? d.per100 : null,
    inventoryItemId: str(d.inventoryItemId),
    source: str(d.source),
    food: readFoodTags(d),
    ...cancelInfo(d),
  };
}

/** Readable to every active user (rules), written by the admin. */
export function subscribeGroceryItems(onData: (rows: GroceryItem[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "groceryItems")),
    (snap) =>
      onData(
        snap.docs
          .map((d) => toGrocery(d.id, d.data()))
          .sort((a, b) => (a.nameEn || a.nameTe).localeCompare(b.nameEn || b.nameTe)),
      ),
    (e) => onError?.(e),
  );
}

/** True when the item has a usable per-100 quantity (only those enter the grocery calculation). */
export function hasPer100(i: GroceryItem): boolean {
  return i.per100 !== null && i.per100 > 0;
}

/** Search in Telugu, English, the catalog's Roman spelling and the other known names. */
export function matchesGrocery(i: GroceryItem, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [i.nameTe, i.nameEn, i.nameRoman, i.group, ...i.aliases].some((t) => t.toLowerCase().includes(s));
}

/** Admin: add or edit a grocery item (rules: admin, updatedBy = caller, per100 ≥ 0 or null). */
export async function saveGroceryItem(input: GroceryItemInput): Promise<void> {
  const data = {
    nameTe: input.nameTe.trim(),
    nameEn: input.nameEn.trim(),
    nameRoman: input.nameRoman.trim(),
    module: input.module,
    group: input.group.trim(),
    unit: input.unit,
    per100: input.per100,
    inventoryItemId: input.inventoryItemId || null,
    packs: input.packs.map((p) => ({ unit: p.unit.trim(), qty: p.qty })),
    aliases: input.aliases.map((a) => a.trim()).filter(Boolean),
    yieldPct: input.yieldPct,
    source: "owner",
  };
  if (!input.id) await addDoc(collection(db, "groceryItems"), { ...data, ...createStamp() });
  else await updateDoc(doc(db, "groceryItems", input.id), { ...data, ...updateStamp() });
}

/** Admin: link (or unlink with "") a grocery item to an inventory item. Counts as an owner edit. */
export async function linkGroceryItem(id: string, inventoryItemId: string): Promise<void> {
  await updateDoc(doc(db, "groceryItems", id), { inventoryItemId: inventoryItemId || null, source: "owner", ...updateStamp() });
}

export const SEED_GROCERY_COUNT = seed.items.length;

/**
 * Admin "జాబితా load చేయి": merge data/seed/grocery-items.json by id.
 * - missing → created (source "seed", no stock link);
 * - existing and still `source: "seed"` → names / module / group / units refreshed, per100 filled only if
 *   empty, stock link kept;
 * - anything else (edited by the owner, added by hand, or archived) → left exactly as it is.
 */
export async function loadGrocerySeed(existing: GroceryItem[]): Promise<{ created: number; updated: number; kept: number }> {
  const byId = new Map(existing.map((i) => [i.id, i]));
  let created = 0;
  let updated = 0;
  let kept = 0;
  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => {
    if (ops > 0) await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };
  for (const s of seed.items) {
    const ex = byId.get(s.id);
    const ref = doc(db, "groceryItems", s.id);
    const fields = {
      nameTe: s.nameTe,
      nameEn: s.nameEn,
      nameRoman: s.nameRoman,
      module: s.module,
      group: s.group,
      unit: s.unit,
      purchaseUnits: s.purchaseUnits,
      aliases: s.aliases,
      seedVersion: seed.version,
    };
    if (!ex) {
      batch.set(ref, { ...fields, per100: s.per100, inventoryItemId: null, source: "seed", ...createStamp() });
      created++;
    } else if (ex.source === "seed" && !ex.cancelled) {
      batch.update(ref, { ...fields, ...(ex.per100 === null ? { per100: s.per100 } : {}), ...updateStamp() });
      updated++;
    } else {
      kept++;
      continue;
    }
    if (++ops >= 400) await flush();
  }
  await flush();
  return { created, updated, kept };
}

/** Module 2h — one dated change of an item's pack sizes (groceryItems/{id}/packHistory, written by the server). */
export interface PackHistoryEntry {
  id: string;
  unit: string;
  packs: { unit: string; qty: number }[];
  from: Date | null;
}

export function subscribePackHistory(itemId: string, onData: (rows: PackHistoryEntry[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, "groceryItems", itemId, "packHistory"),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            const at = x.from as { toDate?: () => Date } | null | undefined;
            return {
              id: d.id,
              unit: typeof x.unit === "string" ? x.unit : "",
              packs: (Array.isArray(x.packs) ? x.packs : []).filter((p: unknown) => p && typeof p === "object").map((p: { unit?: unknown; qty?: unknown }) => ({ unit: typeof p.unit === "string" ? p.unit : "", qty: typeof p.qty === "number" ? p.qty : 0 })),
              from: at && typeof at.toDate === "function" ? at.toDate() : null,
            };
          })
          .sort((a, b) => (b.from?.getTime() ?? 0) - (a.from?.getTime() ?? 0)),
      ),
    (e) => onError?.(e),
  );
}
