package com.example.suseelacateringcrm.ui.navigation

object NavRoutes {
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"

    const val CUSTOMERS_LIST = "customers"
    const val CUSTOMER_EDIT = "customers/edit"
    const val CUSTOMER_EDIT_ARG = "customers/edit?customerId={customerId}"
    const val CUSTOMER_DETAIL = "customers/{customerId}"

    const val MENU_LIST = "menu"
    const val MENU_ITEM_EDIT = "menu/edit"
    const val MENU_ITEM_EDIT_ARG = "menu/edit?itemId={itemId}"

    const val BOOKINGS_LIST = "bookings"
    const val BOOKING_EDIT = "bookings/edit"
    const val BOOKING_EDIT_ARG = "bookings/edit?bookingId={bookingId}"
    const val BOOKING_DETAIL = "bookings/{bookingId}"
    const val KITCHEN_PLAN = "bookings/{bookingId}/kitchen-plan"

    const val INVOICES_LIST = "invoices"
    const val INVOICE_GENERATE = "invoices/generate"
    const val INVOICE_GENERATE_ARG = "invoices/generate/{bookingId}"
    const val INVOICE_DETAIL = "invoices/{invoiceId}"

    const val QUOTATIONS_LIST = "quotations"
    const val QUOTATION_GENERATE = "quotations/generate"
    const val QUOTATION_GENERATE_ARG = "quotations/generate/{bookingId}"
    const val QUOTATION_DETAIL = "quotations/{quotationId}"

    const val STAFF_LIST = "staff"
    const val STAFF_EDIT = "staff/edit"
    const val STAFF_EDIT_ARG = "staff/edit?staffId={staffId}"

    const val INVENTORY_LIST = "inventory"
    const val INVENTORY_ITEM_EDIT = "inventory/edit"
    const val INVENTORY_ITEM_EDIT_ARG = "inventory/edit?itemId={itemId}"

    const val USER_MANAGEMENT = "users"
    const val MASTERS = "masters"
    const val REPORTS = "reports"
    const val CASH_REPORT = "reports/cash"
    const val CALENDAR = "calendar"

    const val VENDORS_LIST = "vendors"
    const val VENDOR_EDIT = "vendors/edit"
    const val VENDOR_EDIT_ARG = "vendors/edit?vendorId={vendorId}"

    const val BRANCHES_LIST = "branches"
    const val BRANCH_EDIT = "branches/edit"
    const val BRANCH_EDIT_ARG = "branches/edit?branchId={branchId}"

    const val PURCHASES_LIST = "purchases"
    const val KIRANA_CATALOG = "purchases/kirana"
    const val KAYAGORALU_CATALOG = "purchases/kayagoralu"
    const val DISPOSABLES_CATALOG = "purchases/disposables"
    const val FRUITS_CATALOG = "purchases/fruits"
    const val NONVEG_CATALOG = "purchases/nonveg"
    const val GASFUEL_CATALOG = "purchases/gasfuel"
    const val WATERICE_CATALOG = "purchases/waterice"
    const val OTHER_ITEMS = "purchases/other"
    const val PURCHASE_HISTORY = "purchases/history"
    const val STAFF_PURCHASE_REPORT = "purchases/staff-report"
    const val ITEM_PURCHASE_REPORT = "purchases/item-report"
    const val PURCHASE_ADD = "purchases/add"
    const val PURCHASE_ADD_ARG = "purchases/add?itemName={itemName}&category={category}&module={module}&units={units}"
    const val PURCHASE_DETAIL = "purchases/detail/{purchaseId}"
    const val PURCHASE_EDIT_ARG = "purchases/edit/{purchaseId}"

    const val EXPENSES_LIST = "expenses"
    const val EXPENSE_HISTORY = "expenses/history"
    const val EXPENSE_HISTORY_ARG = "expenses/history?section={section}"
    const val EXPENSE_PERSON_REPORT = "expenses/person-report"
    const val EXPENSE_ADD = "expenses/add"
    const val EXPENSE_ADD_ARG = "expenses/add?section={section}&subCategory={subCategory}"
    const val EXPENSE_DETAIL = "expenses/detail/{expenseId}"
    const val EXPENSE_EDIT_ARG = "expenses/edit/{expenseId}"

    // ---- Batch 1 (new screens) ----
    const val LEADS_LIST = "leads"
    const val LEAD_EDIT = "leads/edit"
    const val LEAD_EDIT_ARG = "leads/edit?leadId={leadId}"
    const val MENU_PACKAGES = "menu-packages"
    const val MENU_PACKAGE_DETAIL = "menu-packages/{packageId}"
    const val QUOTE_BUILDER = "quote-builder"
    const val QUOTE_BUILDER_ARG = "quote-builder?packageId={packageId}&bookingId={bookingId}"
    const val ATTENDANCE = "attendance"
    const val PAYROLL = "attendance/payroll"
    const val KITCHEN = "kitchen"
    const val TARGET_BOARD = "target-board"
    const val SETUP = "setup"
    const val SETTINGS = "settings"
    const val HISTORY = "history"

    // Round 7
    const val EQUIPMENT = "equipment"
    const val EQUIPMENT_ARG = "equipment?bookingId={bookingId}"
    const val VEHICLES = "vehicles"
    const val OUTSIDE_ORDERS = "outside-orders"
    /** Module 2f: packed products — pack and sell (products and labels are made on the web). */
    const val PACKED_PRODUCTS = "packed-products"
    /** Module 3: purchase requests, approvals and goods receipt. */
    const val PROCUREMENT = "procurement"
    const val VENDOR_DUES = "vendor-dues"
    const val COMPLAINTS = "complaints"
    /** Module 5e: food-safety checks and incidents. */
    const val FOOD_SAFETY = "food-safety"
    /** Module 5f: packing, load, delivery and return of an event's load. */
    const val DISPATCH = "dispatch"
    // Round 10
    const val OWNER_REPORTS = "owner-reports"
    const val VENDOR_RATES = "vendor-rates"
    const val LUNCH_BOXES = "lunch-boxes"
    const val CONTENT_PLAN = "content-plan"
    const val CALENDAR_NOTES = "calendar-notes"
    const val STAFF_WORK = "staff-work"

    // Round 8
    const val EVENT_PLAN = "event-plan/{bookingId}?sessionId={sessionId}"
    const val COOK_LOG = "cook-log/{bookingId}"
    const val DAY_PLAN = "day-plan"
    const val DAY_PLAN_ARG = "day-plan?date={date}"
    const val DISHES = "dishes"
    const val NOTIFICATIONS = "notifications"
    fun eventPlan(bookingId: String, sessionId: String? = null) =
        "event-plan/$bookingId" + if (sessionId.isNullOrBlank()) "" else "?sessionId=$sessionId"
    fun cookLog(bookingId: String) = "cook-log/$bookingId"
    fun dayPlan(date: String? = null) = if (date.isNullOrBlank()) DAY_PLAN else "day-plan?date=$date"
    fun equipment(bookingId: String? = null) = if (bookingId == null) EQUIPMENT else "equipment?bookingId=$bookingId"

    fun leadEdit(leadId: String? = null) = if (leadId == null) LEAD_EDIT else "leads/edit?leadId=$leadId"
    fun menuPackageDetail(packageId: String) = "menu-packages/$packageId"
    fun quoteBuilder(packageId: String? = null, bookingId: String? = null): String {
        val parts = listOfNotNull(packageId?.let { "packageId=$it" }, bookingId?.let { "bookingId=$it" })
        return if (parts.isEmpty()) QUOTE_BUILDER else "quote-builder?" + parts.joinToString("&")
    }

    fun customerDetail(customerId: String) = "customers/$customerId"
    fun customerEdit(customerId: String? = null) =
        if (customerId == null) "customers/edit" else "customers/edit?customerId=$customerId"

    fun menuItemEdit(itemId: String? = null) =
        if (itemId == null) "menu/edit" else "menu/edit?itemId=$itemId"

    fun bookingDetail(bookingId: String) = "bookings/$bookingId"
    fun kitchenPlan(bookingId: String) = "bookings/$bookingId/kitchen-plan"
    fun bookingEdit(bookingId: String? = null) =
        if (bookingId == null) "bookings/edit" else "bookings/edit?bookingId=$bookingId"

    fun invoiceGenerate(bookingId: String) = "invoices/generate/$bookingId"
    fun invoiceDetail(invoiceId: String) = "invoices/$invoiceId"

    fun quotationGenerate(bookingId: String) = "quotations/generate/$bookingId"
    fun quotationDetail(quotationId: String) = "quotations/$quotationId"

    fun staffEdit(staffId: String? = null) =
        if (staffId == null) "staff/edit" else "staff/edit?staffId=$staffId"

    fun inventoryItemEdit(itemId: String? = null) =
        if (itemId == null) "inventory/edit" else "inventory/edit?itemId=$itemId"

    fun vendorEdit(vendorId: String? = null) =
        if (vendorId == null) "vendors/edit" else "vendors/edit?vendorId=$vendorId"

    fun branchEdit(branchId: String? = null) =
        if (branchId == null) "branches/edit" else "branches/edit?branchId=$branchId"

    fun purchaseDetail(purchaseId: String) = "purchases/detail/$purchaseId"
    fun purchaseEdit(purchaseId: String) = "purchases/edit/$purchaseId"

    fun purchaseAdd(
        itemName: String? = null,
        category: String? = null,
        module: String? = null,
        units: List<String>? = null,
    ): String {
        if (itemName == null) return PURCHASE_ADD
        // Uri.encode (%20 for spaces); Navigation decodes the argument once on the other side.
        fun enc(value: String) = android.net.Uri.encode(value)
        val encodedName = enc(itemName)
        val encodedCategory = enc(category ?: "")
        val encodedModule = enc(module ?: "")
        val encodedUnits = enc(units?.joinToString(",") ?: "")
        return "purchases/add?itemName=$encodedName&category=$encodedCategory&module=$encodedModule&units=$encodedUnits"
    }

    fun expenseHistory(section: String? = null): String {
        if (section == null) return EXPENSE_HISTORY
        return "expenses/history?section=${android.net.Uri.encode(section)}"
    }

    fun expenseAdd(section: String? = null, subCategory: String? = null): String {
        if (section == null) return EXPENSE_ADD
        val encodedSection = android.net.Uri.encode(section)
        val encodedSubCategory = android.net.Uri.encode(subCategory ?: "")
        return "expenses/add?section=$encodedSection&subCategory=$encodedSubCategory"
    }

    fun expenseDetail(expenseId: String) = "expenses/detail/$expenseId"
    fun expenseEdit(expenseId: String) = "expenses/edit/$expenseId"
}
