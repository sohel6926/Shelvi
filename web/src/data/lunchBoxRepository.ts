import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { cancelInfo, type CancelInfo } from "./cancel";
import type { Role } from "../auth/roles";

/** R10-12 `lunchBoxOrders` (written only by saveLunchBoxOrder / markLunchBoxDelivered; read here). */
export interface LunchBoxOrder extends CancelInfo {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  days: string[];
  startDate: string;
  endDate: string;
  count: number;
  menuOptionIds: string[];
  deliveryAddress: string;
  deliveryTime: string;
  pricePerBox: number;
  status: "active" | "paused" | "cancelled";
  deliveries: Record<string, number>;
  branchId: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function toOrder(id: string, d: DocumentData): LunchBoxOrder {
  const deliveries: Record<string, number> = {};
  for (const [k, v] of Object.entries((d.deliveries ?? {}) as DocumentData)) if (typeof v === "number") deliveries[k] = v;
  const st = str(d.status);
  return {
    id,
    customerId: str(d.customerId),
    customerName: str(d.customerNameSnapshot),
    date: str(d.date),
    days: Array.isArray(d.days) ? d.days.map(String) : [],
    startDate: str(d.startDate),
    endDate: str(d.endDate),
    count: typeof d.count === "number" ? d.count : 0,
    menuOptionIds: Array.isArray(d.menuOptionIds) ? d.menuOptionIds.map(String) : [],
    deliveryAddress: str(d.deliveryAddress),
    deliveryTime: str(d.deliveryTime),
    pricePerBox: typeof d.pricePerBox === "number" ? d.pricePerBox : 0,
    status: st === "paused" || st === "cancelled" ? st : "active",
    deliveries,
    branchId: str(d.branchId),
    ...cancelInfo(d),
  };
}

/** Admin: all or the chosen branch; manager / staff: their branch (rules: isOwnBranch). */
export function subscribeLunchBoxOrders(role: Role, branchId: string | null, onData: (rows: LunchBoxOrder[]) => void, onError?: (e: Error) => void): () => void {
  const c = role === "admin" && !branchId ? [] : [where("branchId", "==", branchId ?? "")];
  return onSnapshot(
    query(collection(db, "lunchBoxOrders"), ...c),
    (s) => onData(s.docs.map((d) => toOrder(d.id, d.data())).sort((a, b) => a.customerName.localeCompare(b.customerName))),
    (e) => onError?.(e),
  );
}

export function lunchBoxQuery(role: Role, branchId: string | null) {
  const c = role === "admin" && !branchId ? [] : [where("branchId", "==", branchId ?? "")];
  return query(collection(db, "lunchBoxOrders"), ...c);
}

const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Display hint only (which orders are due on a day, same rule as calc §22 lunchBoxesOn); the server decides the
 * planned boxes when the delivery is ticked and bills only ticked deliveries.
 */
export function dueOn(o: LunchBoxOrder, day: string): boolean {
  if (o.status !== "active" || o.cancelled) return false;
  if (o.date) return o.date === day;
  if (!o.days.length) return false;
  if (o.startDate && day < o.startDate) return false;
  if (o.endDate && day > o.endDate) return false;
  return o.days.includes(WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]);
}
