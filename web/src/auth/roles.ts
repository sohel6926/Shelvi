/**
 * Roles (docs/data-model.md → Roles).
 * - admin: owner (and one backup admin) — everything.
 * - manager: leads, customers, bookings, quotations, menus, payments. No profit / P&L / ₹ targets
 *   (Target Board in % only), no users, no settings / bank details, no salaries.
 * - staff: cook / helper / driver.
 */
export type Role = "admin" | "manager" | "staff";

export function parseRole(value: unknown): Role {
  return value === "admin" || value === "manager" ? value : "staff";
}

const MANAGER_CANCEL = new Set(["bookings", "leads", "purchases", "expenses", "staffAdvances", "lunchBoxOrders", "tasks", "shifts", "staffRatings"]);

/** What each role may see. Keep in step with firestore.rules and the callables' role checks. */
export const can = {
  seeProfit: (r: Role) => r === "admin",
  /** Round 11: the dashboard button on the Target Board (owner / manager). QA fix: staff no longer open the dashboard at all. */
  dashboardShortcut: (r: Role) => r === "admin" || r === "manager",
  seeSalaries: (r: Role) => r === "admin",
  manageUsers: (r: Role) => r === "admin",
  editSettings: (r: Role) => r === "admin",
  quote: (r: Role) => r === "admin" || r === "manager",
  recordPayment: (r: Role) => r === "admin" || r === "manager",
  refund: (r: Role) => r === "admin",
  /** Round 11: Target Board is everyone's first screen; the server sends ₹ / profit by role (getTargetBoard). */
  targetBoard: (r: Role) => r === "admin" || r === "manager" || r === "staff",
  /** Bill, food/gallery and menu photos (logo / signature stay admin-only). */
  uploadPhotos: (r: Role) => r === "admin" || r === "manager",
  /** Admin is the only role that can switch branches ("All Branches"). */
  switchBranch: (r: Role) => r === "admin",
  /** R7-3 cancelRecord: admin everything; manager only bookings / leads / purchases / expenses of own branch. */
  cancel: (r: Role, collection: string) => r === "admin" || (r === "manager" && MANAGER_CANCEL.has(collection)),
  /** R7-4 equipment / vehicles: admin and branch manager write. */
  manageAssets: (r: Role) => r === "admin" || r === "manager",
  /** R7-7 approve during-event extras; R7-10 complaints. */
  approveExtras: (r: Role) => r === "admin" || r === "manager",
  /** R7-8 vendor dues and payments; R7-9 close / reopen an event. */
  vendorDues: (r: Role) => r === "admin",
  closeEvent: (r: Role) => r === "admin",
};
