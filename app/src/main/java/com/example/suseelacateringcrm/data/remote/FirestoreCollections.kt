package com.example.suseelacateringcrm.data.remote

/**
 * Collection names. Mirrors functions/src/shared/firestorePaths.ts — keep both in sync
 * (docs/data-model.md lists every collection).
 */
object FirestoreCollections {
    const val USERS = "users"
    const val CUSTOMERS = "customers"
    const val MENU_ITEMS = "menuItems"
    const val BOOKINGS = "bookings"
    const val INVOICES = "invoices"
    const val PAYMENTS = "payments"
    const val QUOTATIONS = "quotations"
    const val STAFF = "staff"
    const val INVENTORY = "inventory"
    const val MOVEMENTS = "movements"
    const val VENDORS = "vendors"
    const val PURCHASES = "purchases"
    const val OTHER_PURCHASE_ITEMS = "otherPurchaseItems"
    const val EXPENSES = "expenses"
    const val BRANCHES = "branches"
    const val AUDIT_LOG = "auditLog"

    // New collections (docs/data-model.md, "New collections")
    const val SETTINGS = "settings"
    const val SETTINGS_BUSINESS_DOC = "business"   // settings/business
    const val LEADS = "leads"
    const val DISHES = "dishes"
    const val MENU_PACKAGES = "menuPackages"
    const val GROCERY_ITEMS = "groceryItems"
    const val ATTENDANCE = "attendance"
    const val STAFF_ADVANCES = "staffAdvances"
    const val TARGETS = "targets"
    const val MONTHLY_STATS = "monthlyStats"
    const val DAILY_STATS = "dailyStats"
    const val COOK_LOG = "cookLog"                 // bookings/{id}/cookLog
    const val COOKING_PLAN = "cookingPlan"         // bookings/{id}/cookingPlan/{dishId} (saveCookingPlan)

    // Round 7 / 8
    const val EQUIPMENT = "equipment"
    const val EQUIPMENT_MOVES = "equipmentMoves"
    const val VEHICLES = "vehicles"
    const val VEHICLE_TRIPS = "vehicleTrips"
    const val COMPLAINTS = "complaints"
    const val OUTSIDE_ORDERS = "outsideOrders"
    const val VENDOR_PAYMENTS = "vendorPayments"
    const val NOTIFICATIONS = "notifications"

    // Round 10
    const val TASKS = "tasks"
    const val SHIFTS = "shifts"
    const val STAFF_RATINGS = "staffRatings"
    const val LUNCH_BOX_ORDERS = "lunchBoxOrders"
    const val CONTENT_PLAN = "contentPlan"
}
