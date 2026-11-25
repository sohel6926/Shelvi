import {
  addDoc,
  collection,
  doc,
  type DocumentData,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { createStamp, updateStamp } from "./audit";
import { adjustStock as adjustStockCall, CallableError, type StockReason } from "./functions";
import { cancelInfo, type CancelInfo } from "./cancel";

/** Mirrors data/model/InventoryItem.kt */
export interface InventoryItem extends CancelInfo {
  id: string;
  name: string;
  unit: string;
  quantityInStock: number;
  reorderLevel: number;
  category: string;
  branchId: string;
  /** Module 2d: keep batches with an expiry date for this item (owner switch). */
  trackExpiry: boolean;
  /** 🔒 earliest expiry date among batches that still hold stock ("" = none) and the stock held in batches */
  nearestExpiry: string;
  batchQty: number;
  /** 🔒 Module 2g: part of the stock promised to confirmed events (still on the shelf) */
  reservedQty: number;
  /** 🔒 X7: stock past its expiry date — on the shelf, but never planned with or reserved */
  expiredQty: number;
}

/** Module 2g — what one confirmed event holds (stockReservations/{bookingId}, written by the server). */
export interface StockReservation {
  bookingId: string;
  day: string;
  customer: string;
  branchId: string;
  lines: { inventoryItemId: string; name: string; unit: string; needed: number; reserved: number; short: number }[];
}

export function subscribeReservations(onData: (rows: StockReservation[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, "stockReservations"),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            const num = (v: unknown) => (typeof v === "number" ? v : 0);
            const str = (v: unknown) => (typeof v === "string" ? v : "");
            return {
              bookingId: d.id,
              day: str(x.day),
              customer: str(x.customer),
              branchId: str(x.branchId),
              lines: (Array.isArray(x.lines) ? x.lines : []).map((l: DocumentData) => ({ inventoryItemId: str(l.inventoryItemId), name: str(l.name), unit: str(l.unit), needed: num(l.needed), reserved: num(l.reserved), short: num(l.short) })),
            };
          })
          .sort((a, b) => a.day.localeCompare(b.day)),
      ),
    (e) => onError?.(e),
  );
}

export interface InventoryItemInput {
  id?: string;
  name: string;
  unit: string;
  reorderLevel: number;
  category: string;
  trackExpiry: boolean;
}

/** Module 2d — one batch of a tracked item (inventory/{id}/batches, written by the server). */
export interface StockBatch {
  id: string;
  qty: number;
  receivedQty: number;
  expiryDay: string;
  batchNo: string;
  receivedAt: Date | null;
  /** Module 5d: on a food-safety hold */
  hold: boolean;
  holdReason: string;
}

/** Live batches of one item that still hold stock, earliest expiry first (undated last). */
export function subscribeBatches(itemId: string, onData: (rows: StockBatch[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "inventory", itemId, "batches"), where("qty", ">", 0)),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const x = d.data();
            const at = x.receivedAt as { toDate?: () => Date } | null | undefined;
            return {
              id: d.id,
              qty: typeof x.qty === "number" ? x.qty : 0,
              receivedQty: typeof x.receivedQty === "number" ? x.receivedQty : 0,
              expiryDay: typeof x.expiryDay === "string" ? x.expiryDay : "",
              batchNo: typeof x.batchNo === "string" ? x.batchNo : "",
              receivedAt: at && typeof at.toDate === "function" ? at.toDate() : null,
              hold: x.hold === true,
              holdReason: typeof x.holdReason === "string" ? x.holdReason : "",
            };
          })
          .sort((a, b) => (!!a.expiryDay !== !!b.expiryDay ? (a.expiryDay ? -1 : 1) : a.expiryDay.localeCompare(b.expiryDay) || (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0))),
      ),
    (e) => onError?.(e),
  );
}

/** Module 2d: none / ok / soon (within `alertDays`, today counts) / expired — same rule as the server's expiryStatus. */
export function expiryStatusOf(expiryDay: string, today: string, alertDays: number): "none" | "ok" | "soon" | "expired" {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDay) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return "none";
  const d = Math.round((Date.parse(`${expiryDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (Number.isNaN(d)) return "none";
  return d < 0 ? "expired" : d <= alertDays ? "soon" : "ok";
}

const inventoryCol = collection(db, "inventory");

function toInventoryItem(id: string, data: DocumentData): InventoryItem {
  return {
    id,
    name: data.name ?? "",
    unit: data.unit ?? "",
    quantityInStock: data.quantityInStock ?? 0,
    reorderLevel: data.reorderLevel ?? 0,
    category: data.category ?? "",
    branchId: data.branchId ?? "",
    trackExpiry: data.trackExpiry === true,
    nearestExpiry: typeof data.nearestExpiry === "string" ? data.nearestExpiry : "",
    batchQty: typeof data.batchQty === "number" ? data.batchQty : 0,
    reservedQty: typeof data.reservedQty === "number" ? data.reservedQty : 0,
    expiredQty: typeof data.expiredQty === "number" ? data.expiredQty : 0,
    ...cancelInfo(data),
  };
}

/** branchId === null means unfiltered (admin's "All Branches" combined view). */
export function subscribeInventory(branchId: string | null, onData: (items: InventoryItem[]) => void): () => void {
  const q = branchId ? query(inventoryCol, where("branchId", "==", branchId)) : inventoryCol;
  return onSnapshot(q, (snap) =>
    onData(snap.docs.map((d) => toInventoryItem(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)))
  );
}

/**
 * Mirrors InventoryRepository.kt's saveItemMetadata — admin-only per firestore.rules
 * (staff may only adjust quantityInStock, via the adjustStock Cloud Function below).
 */
export async function saveInventoryItemMetadata(
  input: InventoryItemInput,
  branchId: string | null
): Promise<void> {
  const data = {
    name: input.name,
    unit: input.unit,
    category: input.category,
    reorderLevel: input.reorderLevel,
    trackExpiry: input.trackExpiry,
  };
  if (!input.id) {
    if (!branchId) throw new CallableError("no-branch", "వస్తువు చేర్చే ముందు శాఖ (branch) ఎంచుకోండి", "Select a branch before creating an inventory item");
    await addDoc(inventoryCol, {
      ...data,
      branchId,
      quantityInStock: 0,
      lastUpdated: serverTimestamp(),
      ...createStamp(),
    });
  } else {
    await updateDoc(doc(db, "inventory", input.id), { ...data, lastUpdated: serverTimestamp(), ...updateStamp() });
  }
}

interface AdjustStockResult {
  ok: boolean;
  newQuantity: number;
  pending?: boolean;
}

/**
 * Calls the adjustStock Cloud Function — the only way a screen changes stock (R7-2; rules lock
 * quantityInStock). `reason` is one of count / damage / return / correction; `note` is free text.
 */
export async function adjustStock(
  itemId: string,
  type: "IN" | "OUT",
  quantity: number,
  reason: StockReason,
  note?: string,
  /** Module 2d: on a stock IN for an item that tracks expiry */
  batch?: { expiryDay: string; batchNo?: string },
): Promise<{ newQuantity: number; pending: boolean }> {
  // Through data/functions.ts so errors carry the server's Telugu / English text (CallableError).
  const result: AdjustStockResult = await adjustStockCall({
    itemId,
    type,
    quantity,
    reason,
    ...(note ? { note } : {}),
    ...(type === "IN" && batch?.expiryDay ? { expiryDay: batch.expiryDay, ...(batch.batchNo ? { batchNo: batch.batchNo } : {}) } : {}),
  });
  return { newQuantity: result.newQuantity, pending: result.pending === true };
}
