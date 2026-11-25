/**
 * Suseela Caterings CRM — Cloud Functions (v2, region asia-south1).
 * Contract: docs/api-contract.md. Calculations: src/calc (docs/calc-spec.md).
 */
import "./setup";
import { onCall } from "firebase-functions/v2/https";
import { REGION } from "./setup";
import { requireActiveUser } from "./auth/authContext";
import { guard } from "./shared/errors";

export { adjustStock, decideStockAdjust } from "./inventory/adjustStock";

// Round 6: event stock deduction, change history
export { stockOnBookingCompleted, applyEventStock, reverseEventStock } from "./stock/eventStock";
export { getHistory } from "./history/getHistory";
export { getServiceTimeline } from "./timeline/getServiceTimeline";

// Round 7
export { stockOnPurchase } from "./stock/purchaseStock";
export { cancelRecord } from "./records/cancelRecord";
export { saveOutsideOrder, recordOutsideDelivery } from "./outside/outsideOrders";
export { recordVendorPayment, getVendorDues, billStatusOnPurchase, billStatusOnExpense, migratePaymentStatuses } from "./vendors/vendorPayments";
export { syncMoveStaff, syncBookingStaffToMoves } from "./equipment/equipmentSync";
export { syncBookingSessions } from "./events/sessionSync";
export { logGuestCount, addEventExtra, approveEventExtra } from "./events/eventLive";
export { closeEvent, reopenEvent } from "./events/closeEvent";
export { quotationAcceptedVersion } from "./menus/quotationTriggers";

// Round 8
export { eventPlan, dayPlan, planOnBookingChange, planOnQuotationChange } from "./kitchen/eventPlan";

// Round 9 — order cancellation, restore, postpone, cancellation report
export { cancelBooking, restoreBooking, postponeBooking, getCancellationReport } from "./events/cancelBooking";
export {
  historyBookings,
  historyQuotations,
  historyInvoices,
  historyPayments,
  historyCustomers,
  historyLeads,
  historyExpenses,
  historyPurchases,
  historyMenuPackages,
  historyStaff,
  historyInventory,
  historySettings,
  historyTargets,
  historyAttendance,
} from "./history/historyTriggers";

// Settings & setup
export { saveBusinessSettings } from "./settings/saveBusinessSettings";
export { importRows } from "./import/importRows";

// Menus, quotations, invoices, payments
export { quoteMenu } from "./menus/quoteMenu";
export { saveQuotation } from "./menus/saveQuotation";
export { generateInvoiceFromBooking } from "./billing/generateInvoiceFromBooking";
export { recordPayment, refundOrAdjust } from "./billing/recordPayment";
export { requestRefund, decideRefund } from "./billing/refundRequests";
export { overrideInvoiceTotal } from "./billing/overrideInvoiceTotal";

// Kitchen
export { saveCookLog } from "./kitchen/saveCookLog";
export { cookingPlan, groceryList } from "./kitchen/planning";
export { saveCookingPlan } from "./kitchen/saveCookingPlan";

// Staff
export { markAttendance, monthPayroll, overridePayrollRow } from "./staff/attendance";
export { syncStaffLink } from "./staff/staffLink";
export { staffPayMover } from "./staff/pay";
// Module 5a — Company -> Brand -> Branch -> Kitchen -> Store masters
export { saveMaster, setMasterStatus, setupMasters } from "./masters/masters";
export { stampBookingOrg, setBookingBrand, brandReport } from "./masters/org";
// Module 5c — stock by store
export { transferStock, setItemHomeStore, transferToBranch, setItemLocation } from "./stock/storeStock";
// Module 5d — food safety: batch hold, decision, trace
export { holdBatch, decideBatchHold, traceBatch } from "./stock/batchHold";
export { listSafetyChecklists, saveSafetyCheck, saveSafetyIncident, resolveSafetyIncident } from "./safety/safety";
export { setFoodTags, allergenMatrix } from "./safety/allergens";
// Module 5f — packing and dispatch
export { saveDispatch, advanceDispatch, cancelDispatch } from "./dispatch/dispatch";
export { recordSalaryPayment, cancelSalaryPayment } from "./staff/salaryPay";

// Targets & reports
export { setYearTarget, getTargetBoard, getPnl } from "./targets/callables";
export { statsOnInvoice, statsOnPayment, statsOnExpense, statsOnPurchase, statsOnAdSpend, statsOnAttendance, statsOnBooking, costOnVehicleTrip, costOnEquipmentMove, statsOnOutsideOrder } from "./stats/triggers";

// Agents & messages
export { setAgentEnabled, approveMessage, runAgentNow } from "./agents/callables";
export {
  agentMorningSummary,
  agentDuesCollector,
  agentEnquiryFollowup,
  agentEventReadiness,
  agentStockWatch,
  agentTargetPlanner,
  agentAdsAnalyst,
  agentFeedbackReviews,
  agentBackup,
  agentMenuPriceReview,
  agentIntegrityCheck,
  agentCookingLearner,
  agentPriceWatch,
} from "./agents/schedules";
export { sendQueuedMessage, flushOutbox } from "./integrations/whatsapp";

/** Scaffolding check: a signed-in, active user can call a function and it can read their role/branch. */
export const ping = onCall({ region: REGION }, (request) =>
  guard(async () => {
    const caller = await requireActiveUser(request);
    return { ok: true, uid: caller.uid, role: caller.role, branchId: caller.branchId, serverTime: new Date().toISOString() };
  }),
);

// Round 10 — staff advances, shifts / tasks / ratings, suggested price, vendor rates, customer statement,
// WhatsApp consent stamp, lunch boxes
export { addStaffAdvance, listStaffAdvances, finalizePayroll } from "./staff/advances";
export { saveShift, completeTask, rateStaff, ratingOnWrite } from "./staff/shifts";
export { suggestPackagePrice } from "./menus/suggestPrice";
export { vendorPriceComparison } from "./vendors/purchaseRates";
export { customerStatement } from "./customers/customerStatement";
export { optInOnCustomer, optInOnLead } from "./integrations/optIn";
export { saveLunchBoxOrder, markLunchBoxDelivered, invoiceLunchBoxes } from "./lunchBoxes/lunchBoxes";

// Module 1a (18 Nov 2026) — lead pipeline: auto-assign on create, manual assign, assignee list
export { assignOnLeadCreate, assignLead, leadAssignees } from "./leads/assignLead";
// Module 1b — 15-minute first-response rule: stamp the first response, alert late leads every 5 minutes
export { stampLeadFirstResponse, leadTatWatch } from "./leads/tatWatch";
// Module 1e — team notes on a lead
export { addLeadComment } from "./leads/leadComments";
// Module 1f — leads report (by source, by person, response speed)
export { leadReport } from "./leads/leadReport";

// Module 2a (18 Nov 2026) — item-specific pack sizes: keep the stock item in step with its grocery item
export { syncItemPacks } from "./kitchen/itemPacks";
// Module 2b — every recipe change is kept as a version
export { recordRecipeVersion } from "./kitchen/recipeVersions";
// Module 2d — batches with an expiry date (FEFO) and the daily expiry notice
export { applyBatchOnMovement, expiryWatch } from "./stock/batches";
// Module 2f — packed products (MRP, label, packing runs with batch + expiry)
export { savePackedProduct, recordPacking, sellPacked, cancelPackedSale } from "./packed/packedProducts";
// Module 3a — purchase request → purchase order, with approval
export { savePurchaseRequest, decidePurchaseRequest, cancelPurchaseRequest, savePurchaseOrder, decidePurchaseOrder, cancelPurchaseOrder } from "./procure/procure";
// Module 3b — goods receipt against an order (accepted goods go into stock)
export { receiveGoods, closePurchaseOrder } from "./procure/goodsReceipt";
// Module 3c — vendor bill matched against the order and the receipts; payment hold on a mismatch
export { saveVendorBill, releaseBillHold, cancelGoodsReceipt, poBillRollup } from "./procure/vendorBill";
// Module 4b — the books (derived ledger, hand-written entries, period lock) — owner only
export { createPortalLink, revokePortalLinks, portalView, portalAccept, portalPay } from "./portal/portal";
export { createPaymentLink, razorpayWebhook } from "./integrations/razorpay";
export { ledgerReport, ledgerExport, saveJournalEntry, cancelJournalEntry, lockPeriod, unlockPeriod, reconcileStatement, monthCloseCheck, overheadShare } from "./ledger/ledger";
// Module 2g — stock reserved for confirmed events
export { reservationsHourly, reservationsOnBookingChange, refreshStockReservations, reservationsDirtyOnStock } from "./stock/reservations";
// Module 2i — standard / estimated / actual cost
export { setStandardCost, estimateOnConfirm, refreshCostEstimate, costComparison, estimateOnQuotation } from "./costs/costs";
// Pending list X8 / X10 (18 Nov 2026)
export { leadReminderWatch } from "./leads/reminderWatch";
export { safetyCheckWatch } from "./safety/safetyWatch";
