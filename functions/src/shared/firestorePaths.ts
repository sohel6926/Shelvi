/**
 * Mirrors app/src/main/java/com/example/suseelacateringcrm/data/remote/FirestoreCollections.kt
 * Keep this in sync with that file — it is the single source of truth for collection names.
 * (Names from SETTINGS down were added for phase 2; FirestoreCollections.kt must gain the same.)
 */
export const FirestoreCollections = {
  USERS: "users",
  CUSTOMERS: "customers",
  MENU_ITEMS: "menuItems",
  BOOKINGS: "bookings",
  INVOICES: "invoices",
  PAYMENTS: "payments",
  QUOTATIONS: "quotations",
  STAFF: "staff",
  INVENTORY: "inventory",
  MOVEMENTS: "movements",
  VENDORS: "vendors",
  PURCHASES: "purchases",
  OTHER_PURCHASE_ITEMS: "otherPurchaseItems",
  EXPENSES: "expenses",
  BRANCHES: "branches",
  AUDIT_LOG: "auditLog",

  SETTINGS: "settings",
  COUNTERS: "counters",
  LEADS: "leads",
  DISHES: "dishes",
  /** bookings/{id}/cookLog/{dishId} */
  COOK_LOG: "cookLog",
  /** dishes/{id}/history/{bookingId} — server-owned copy of each event's cookLog line, feeds §5 */
  DISH_HISTORY: "history",
  MENU_PACKAGES: "menuPackages",
  GROCERY_ITEMS: "groceryItems",
  ATTENDANCE: "attendance",
  STAFF_ADVANCES: "staffAdvances",
  VEHICLES: "vehicles",
  VEHICLE_TRIPS: "vehicleTrips",
  EQUIPMENT: "equipment",
  EQUIPMENT_MOVES: "equipmentMoves",
  AD_SPEND: "adSpend",
  COMPLAINTS: "complaints",
  TASKS: "tasks",
  REFERRALS: "referrals",
  TARGETS: "targets",
  MONTHLY_STATS: "monthlyStats",
  DAILY_STATS: "dailyStats",
  MESSAGES_OUTBOX: "messagesOutbox",
  AGENT_SETTINGS: "agentSettings",
  AGENT_RUNS: "agentRuns",
  INTEGRITY_REPORTS: "integrityReports",
  /** payroll/{YYYY-MM}_{staffId} — manual payroll rows (overridePayrollRow) */
  PAYROLL: "payroll",
  /** Module 4e: salary money actually handed over */
  SALARY_PAYMENTS: "salaryPayments",
  /** bookings/{id}/cookingPlan/{dishId} — saved per-event cooking quantities (saveCookingPlan) */
  COOKING_PLAN: "cookingPlan",
  /** R7-6 outsideOrders/{id} */
  OUTSIDE_ORDERS: "outsideOrders",
  /** Module 2f packedProducts/{id} (+ runs sub-collection) — server only */
  PACKED_PRODUCTS: "packedProducts",
  /** X5 packedSales/{id} — server only */
  PACKED_SALES: "packedSales",
  // Module 3a
  PURCHASE_REQUESTS: "purchaseRequests",
  /** Module 4d: material stock adjustments waiting for a supervisor */
  STOCK_ADJUST_REQUESTS: "stockAdjustRequests",
  /** Module 6a: a manager asks, the owner approves, then the refund is paid */
  REFUND_REQUESTS: "refundRequests",
  /** Module 6b: Razorpay payment links made for invoices — server only */
  PAYMENT_LINKS: "paymentLinks",
  /** Module 6b: private customer links to one quotation / invoice — server only */
  PORTAL_LINKS: "portalLinks",
  /** Module 5e: food-safety checks and incidents */
  /** Module 5f: packing + dispatch of an event */
  DISPATCHES: "dispatches",
  SAFETY_CHECKS: "safetyChecks",
  SAFETY_INCIDENTS: "safetyIncidents",
  PURCHASE_ORDERS: "purchaseOrders",
  // Module 3b
  GOODS_RECEIPTS: "goodsReceipts",
  /** Module 4b journalEntries/{id} — hand-written ledger entries, server only */
  JOURNAL_ENTRIES: "journalEntries",
  /** Module 2g stockReservations/{bookingId} — server only */
  STOCK_RESERVATIONS: "stockReservations",
  /** R7-8 vendorPayments/{id} */
  VENDOR_PAYMENTS: "vendorPayments",
  /** R7-7 bookings/{id}/guestLog/{auto}, bookings/{id}/eventExtras/{auto} */
  GUEST_LOG: "guestLog",
  EVENT_EXTRAS: "eventExtras",
  /** R7-10 quotations/{id}/versions/{n} */
  QUOTATION_VERSIONS: "versions",
  /** Round 8 in-app notifications (admin + kitchen manager) */
  NOTIFICATIONS: "notifications",
  /** Round 10 */
  SHIFTS: "shifts",
  STAFF_RATINGS: "staffRatings",
  LUNCH_BOX_ORDERS: "lunchBoxOrders",
  CONTENT_PLAN: "contentPlan",
} as const;

/** settings/business — the one business settings document. */
export const BUSINESS_SETTINGS_DOC = "business";
