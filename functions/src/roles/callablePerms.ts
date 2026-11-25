/**
 * Module 4d, step 2 (19 Nov 2026) — which permission of the role matrix each callable needs. Pure; tested in
 * test/module4e.test.ts (which also checks that EVERY callable in src/ has an entry here).
 *
 * How it is used (shared/callable.ts → callableDecision):
 *  - A login with NO job role works exactly as before: only the level list of the callable counts.
 *  - A login WITH a job role must pass the level list AND the matrix entry below — the role narrows.
 *  - `widen`: a few owner-only finance callables are also open to a manager-level role that has the matrix
 *    permission (Finance Head, Accountant). Nothing else is ever widened.
 *  - `see`: the caller's role must also be allowed to see that sensitive figure (B4).
 *  - null = not decided by the job role (owner-only controls, or everyday staff work).
 *  - The Auditor / Viewer role is read-only: it is refused on every callable that is not a View / Export.
 */
import { Action, Level, Module, SensitiveKind, allowed, canHoldRole, canSee, RoleCode } from "./permRules";

export interface CallablePerm {
  m: Module;
  a: Action;
  widen?: true;
  see?: SensitiveKind;
}
const p = (m: Module, a: Action, extra: Partial<CallablePerm> = {}): CallablePerm => ({ m, a, ...extra });

export const CALLABLE_PERMS: Record<string, CallablePerm | null> = {
  // ---- leads, customers, quotations, bookings
  addLeadComment: p("leads", "E"), assignLead: p("leads", "A"), leadAssignees: p("leads", "V"), leadReport: p("leads", "V"),
  customerStatement: p("customers", "V"), quoteMenu: p("quotations", "V"), saveQuotation: p("quotations", "C"),
  cancelBooking: p("bookings", "A"), postponeBooking: p("bookings", "E"), saveLunchBoxOrder: p("bookings", "C"), getCancellationReport: p("reports", "V"),
  restoreBooking: null,
  // ---- events
  approveEventExtra: p("events", "A"), closeEvent: null, reopenEvent: null,
  // ---- invoices, receipts
  generateInvoiceFromBooking: p("invoices", "C"), invoiceLunchBoxes: p("invoices", "C"), overrideInvoiceTotal: p("invoices", "A"), recordPayment: p("receipts", "C"), refundOrAdjust: null, requestRefund: p("receipts", "C"), decideRefund: null,
  // ---- purchase flow
  decidePurchaseRequest: p("purchaseRequests", "A"), savePurchaseOrder: p("purchaseOrders", "C"), cancelPurchaseOrder: p("purchaseOrders", "E"), closePurchaseOrder: p("purchaseOrders", "E"),
  decidePurchaseOrder: null, saveOutsideOrder: p("purchaseOrders", "C"), recordOutsideDelivery: p("goodsReceipts", "C"),
  receiveGoods: p("goodsReceipts", "C"), cancelGoodsReceipt: p("goodsReceipts", "X"), saveVendorBill: p("vendorBills", "C"), releaseBillHold: p("vendorBills", "A", { widen: true }),
  vendorPriceComparison: p("vendors", "V"), getVendorDues: p("vendorPayments", "V", { widen: true }), recordVendorPayment: p("vendorPayments", "P", { widen: true }),
  migratePaymentStatuses: null, cancelRecord: null,
  // ---- stock, recipes, kitchen
  holdBatch: p("inventory", "E"), decideBatchHold: p("inventory", "A"), traceBatch: p("inventory", "V"),
  transferStock: p("inventory", "E"), transferToBranch: p("inventory", "E"), setItemLocation: p("inventory", "E"), setItemHomeStore: p("inventory", "E"),
  adjustStock: p("inventory", "E"), decideStockAdjust: p("inventory", "A"),
  applyEventStock: p("inventory", "E"), reverseEventStock: null, refreshStockReservations: p("inventory", "V"), savePackedProduct: p("inventory", "C"), sellPacked: p("inventory", "E"), cancelPackedSale: null,
  suggestPackagePrice: p("recipes", "V"), setStandardCost: null, refreshCostEstimate: null, costComparison: null,
  dayPlan: p("production", "V"), saveCookingPlan: p("production", "E"), recordPacking: p("production", "E"),
  // ---- people
  rateStaff: p("staff", "E"), saveShift: p("attendance", "E"), addStaffAdvance: p("payroll", "C"), monthPayroll: p("payroll", "V", { widen: true, see: "salary" }), overridePayrollRow: null, finalizePayroll: null, recordSalaryPayment: null, cancelSalaryPayment: null,
  // ---- books
  createPaymentLink: p("receipts", "C"), createPortalLink: p("quotations", "E"), revokePortalLinks: p("quotations", "E"),
  ledgerReport: p("ledger", "V", { widen: true }), ledgerExport: p("ledger", "V", { widen: true }), reconcileStatement: p("ledger", "V", { widen: true }), monthCloseCheck: p("ledger", "V", { widen: true }), saveJournalEntry: p("ledger", "C", { widen: true }), cancelJournalEntry: p("ledger", "R", { widen: true }),
  getPnl: p("ledger", "V", { widen: true, see: "profit" }), overheadShare: p("ledger", "V", { widen: true, see: "profit" }), lockPeriod: null, unlockPeriod: null,
  // ---- owner controls
  saveMaster: null, setMasterStatus: null, setupMasters: null, setBookingBrand: p("bookings", "E"), brandReport: p("ledger", "V", { widen: true, see: "profit" }),
  approveMessage: null, getHistory: null, importRows: null, runAgentNow: null, setAgentEnabled: null, saveBusinessSettings: null, setYearTarget: null,
  // ---- everyday work open to every login (the Auditor is still refused on the ones in STAFF_WRITES)
  saveDispatch: null, advanceDispatch: null, cancelDispatch: null,
  listSafetyChecklists: null, saveSafetyCheck: null, saveSafetyIncident: null, resolveSafetyIncident: null,
  setFoodTags: p("recipes", "E"), allergenMatrix: p("recipes", "V"),
  addEventExtra: null, cancelPurchaseRequest: null, completeTask: null, cookingPlan: null, eventPlan: null, getServiceTimeline: null, getTargetBoard: null, groceryList: null,
  listStaffAdvances: null, logGuestCount: null, markAttendance: null, markLunchBoxDelivered: null, saveCookLog: null, savePurchaseRequest: null,
};

/** Callables open to every login that change something — the read-only Auditor may not use them. */
export const STAFF_WRITES: readonly string[] = ["addEventExtra", "cancelPurchaseRequest", "completeTask", "logGuestCount", "markAttendance", "markLunchBoxDelivered", "saveCookLog", "savePurchaseRequest", "saveSafetyCheck", "saveSafetyIncident", "advanceDispatch"];

/**
 * B4 — may this caller see a sensitive figure (salary, food cost, profit …)? Narrows only: the owner and a login
 * with no job role see what their level already shows.
 */
export function callerSees(level: string, jobRole: unknown, kind: SensitiveKind): boolean {
  if (level === "admin" || !canHoldRole(level, jobRole)) return true;
  if (level === "staff" && jobRole !== "auditor") return true; // workers / drivers: own data only, decided elsewhere
  return canSee(jobRole as RoleCode, kind);
}

export type CallableVerdict = "allow" | "deny-level" | "deny-role";

/** May this login use this callable? `levels` is the callable's own level list (ADMIN / ADMIN_MANAGER / ALL_ROLES). */
export function callableDecision(name: string, levels: readonly string[], level: string, jobRole: unknown): CallableVerdict {
  const levelOk = levels.includes(level);
  if (level === "admin") return levelOk ? "allow" : "deny-level"; // the owner is never narrowed
  if (!canHoldRole(level, jobRole)) return levelOk ? "allow" : "deny-level"; // no job role given: the old behaviour
  const role = jobRole as RoleCode;
  const perm = CALLABLE_PERMS[name] ?? null;
  if (role === "auditor" && (STAFF_WRITES.includes(name) || (perm !== null && perm.a !== "V" && perm.a !== "O"))) return "deny-role";
  if (perm === null) return levelOk ? "allow" : "deny-level";
  const roleOk = allowed(role, perm.m, perm.a) && (!perm.see || canSee(role, perm.see));
  if (levelOk) return roleOk ? "allow" : "deny-role";
  return perm.widen === true && (level as Level) === "manager" && roleOk ? "allow" : "deny-level";
}
