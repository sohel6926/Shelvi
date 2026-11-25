import {
  addDoc,
  collection,
  doc,
  type DocumentData,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { cancelInfo, type CancelInfo } from "./cancel";
import { createStamp, updateStamp } from "./audit";

export const MENU_CATEGORIES = ["Starter", "Main Course", "Dessert", "Beverage", "Package"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];

/** Mirrors data/model/MenuItem.kt */
export interface MenuItem extends CancelInfo {
  id: string;
  name: string;
  category: MenuCategory;
  pricePerPlate: number;
  isVeg: boolean;
  isActive: boolean;
}

export interface MenuItemInput {
  id?: string;
  name: string;
  category: MenuCategory;
  pricePerPlate: number;
  isVeg: boolean;
  isActive: boolean;
}

const menuItemsCol = collection(db, "menuItems");

function toMenuItem(id: string, data: DocumentData): MenuItem {
  return {
    id,
    name: data.name ?? "",
    category: (data.category as MenuCategory) ?? "Starter",
    pricePerPlate: data.pricePerPlate ?? 0,
    isVeg: data.isVeg !== false,
    isActive: data.isActive !== false,
    ...cancelInfo(data),
  };
}

/** Used by the Bookings menu-item picker. */
export function subscribeActiveMenuItems(onData: (items: MenuItem[]) => void): () => void {
  const q = query(menuItemsCol, where("isActive", "==", true));
  return onSnapshot(q, (snap) =>
    onData(snap.docs.map((d) => toMenuItem(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)))
  );
}

/** Used by the Menu management screen — includes inactive items too. */
export function subscribeAllMenuItems(onData: (items: MenuItem[]) => void): () => void {
  return onSnapshot(menuItemsCol, (snap) =>
    onData(snap.docs.map((d) => toMenuItem(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)))
  );
}

export async function getMenuItem(id: string): Promise<MenuItem | null> {
  const snap = await getDoc(doc(db, "menuItems", id));
  return snap.exists() ? toMenuItem(snap.id, snap.data()) : null;
}

/**
 * Mirrors MenuRepository.kt's saveMenuItem. NOTE: recipeIngredients / isPackage / includedItemIds
 * are not editable from the web yet — omitted here (defaults to []/false on create, left untouched
 * on update since they're simply not part of this write map).
 */
export async function saveMenuItem(input: MenuItemInput): Promise<void> {
  const data = {
    name: input.name,
    category: input.category,
    pricePerPlate: input.pricePerPlate,
    isVeg: input.isVeg,
    isActive: input.isActive,
  };
  if (!input.id) {
    await addDoc(menuItemsCol, {
      ...data,
      isPackage: false,
      includedItemIds: [],
      recipeIngredients: [],
      ...createStamp(),
    });
  } else {
    await updateDoc(doc(db, "menuItems", input.id), { ...data, ...updateStamp() });
  }
}

