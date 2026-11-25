/** Pure rules for cancelRecord (R7-3). */
import type { Role } from "../auth/authContext";

export const TRANSACTIONAL = ["bookings", "quotations", "invoices", "payments", "purchases", "expenses", "outsideOrders", "attendance", "leads", "staffAdvances", "lunchBoxOrders", "tasks", "shifts", "staffRatings"] as const;
export const MASTER = ["customers", "staff", "inventory", "vendors", "menuPackages", "menuItems", "dishes", "groceryItems", "equipment", "vehicles"] as const;
export const MANAGER_CAN_CANCEL = ["bookings", "leads", "purchases", "expenses", "staffAdvances", "lunchBoxOrders", "tasks", "shifts", "staffRatings"] as const;

export type CancelKind = "transactional" | "master";

export function cancelKind(collection: string): CancelKind | null {
  if ((TRANSACTIONAL as readonly string[]).includes(collection)) return "transactional";
  if ((MASTER as readonly string[]).includes(collection)) return "master";
  return null;
}

/** Admin: everything; manager: bookings / leads / purchases / expenses (branch checked separately); staff: nothing. */
export function canCancel(role: Role, collection: string): boolean {
  return role === "admin" || (role === "manager" && (MANAGER_CAN_CANCEL as readonly string[]).includes(collection));
}

/** Status word written on cancel (outside orders use their lower-case status vocabulary). */
export function cancelledStatus(collection: string): string {
  return collection === "outsideOrders" ? "cancelled" : "Cancelled";
}

export function isAlreadyCancelled(doc: Record<string, unknown>): boolean {
  return doc.archived === true || doc.status === "Cancelled" || doc.status === "cancelled";
}
