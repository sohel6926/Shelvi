package com.example.suseelacateringcrm.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.NavType
import androidx.navigation.navArgument
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.SessionState
import com.example.suseelacateringcrm.ui.auth.LoginScreen
import com.example.suseelacateringcrm.ui.auth.PendingApprovalScreen
import com.example.suseelacateringcrm.ui.billing.InvoiceDetailScreen
import com.example.suseelacateringcrm.ui.billing.InvoiceGenerateScreen
import com.example.suseelacateringcrm.ui.billing.InvoicesListScreen
import com.example.suseelacateringcrm.ui.branches.BranchEditScreen
import com.example.suseelacateringcrm.ui.branches.BranchListScreen
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.customers.CustomerDetailScreen
import com.example.suseelacateringcrm.ui.customers.CustomerEditScreen
import com.example.suseelacateringcrm.ui.customers.CustomersListScreen
import com.example.suseelacateringcrm.ui.dashboard.DashboardScreen
import com.example.suseelacateringcrm.ui.expenses.ExpenseDetailScreen
import com.example.suseelacateringcrm.ui.expenses.ExpenseEntryScreen
import com.example.suseelacateringcrm.ui.expenses.ExpenseHistoryScreen
import com.example.suseelacateringcrm.ui.expenses.ExpensesHomeScreen
import com.example.suseelacateringcrm.ui.expenses.PersonWiseReportScreen
import com.example.suseelacateringcrm.ui.inventory.InventoryItemEditScreen
import com.example.suseelacateringcrm.ui.inventory.InventoryListScreen
import com.example.suseelacateringcrm.ui.bookings.BookingDetailScreen
import com.example.suseelacateringcrm.ui.bookings.BookingEditScreen
import com.example.suseelacateringcrm.ui.bookings.BookingsListScreen
import com.example.suseelacateringcrm.ui.menu.MenuItemEditScreen
import com.example.suseelacateringcrm.ui.menu.MenuListScreen
import com.example.suseelacateringcrm.ui.purchases.CatalogPickerScreen
import com.example.suseelacateringcrm.ui.purchases.ItemPurchaseReportScreen
import com.example.suseelacateringcrm.ui.purchases.OtherItemsScreen
import com.example.suseelacateringcrm.ui.purchases.PurchaseDetailScreen
import com.example.suseelacateringcrm.ui.purchases.PurchaseEditScreen
import com.example.suseelacateringcrm.ui.purchases.PurchaseHistoryScreen
import com.example.suseelacateringcrm.ui.purchases.PurchasesHomeScreen
import com.example.suseelacateringcrm.ui.purchases.StaffPurchaseReportScreen
import com.example.suseelacateringcrm.ui.quotations.QuotationDetailScreen
import com.example.suseelacateringcrm.ui.quotations.QuotationGenerateScreen
import com.example.suseelacateringcrm.ui.quotations.QuotationsListScreen
import com.example.suseelacateringcrm.ui.reports.ReportsScreen
import com.example.suseelacateringcrm.ui.staff.StaffEditScreen
import com.example.suseelacateringcrm.ui.staff.StaffListScreen
import com.example.suseelacateringcrm.ui.users.UserManagementScreen
import com.example.suseelacateringcrm.ui.vendors.VendorEditScreen
import com.example.suseelacateringcrm.ui.vendors.VendorListScreen
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import com.example.suseelacateringcrm.data.model.canManage
import com.example.suseelacateringcrm.ui.attendance.AttendanceScreen
import com.example.suseelacateringcrm.ui.attendance.PayrollScreen
import com.example.suseelacateringcrm.ui.components.RoleGate
import com.example.suseelacateringcrm.ui.kitchen.KitchenScreen
import com.example.suseelacateringcrm.ui.leads.LeadEditScreen
import com.example.suseelacateringcrm.ui.leads.LeadsListScreen
import com.example.suseelacateringcrm.ui.menupackages.MenuPackageDetailScreen
import com.example.suseelacateringcrm.ui.menupackages.MenuPackagesScreen
import com.example.suseelacateringcrm.ui.quotebuilder.QuoteBuilderScreen
import com.example.suseelacateringcrm.ui.settings.SettingsScreen
import com.example.suseelacateringcrm.ui.setup.SetupWizardScreen
import com.example.suseelacateringcrm.ui.targets.TargetBoardScreen
import com.example.suseelacateringcrm.ui.theme.LocalReducedMotion
import com.example.suseelacateringcrm.ui.theme.screenEnter
import com.example.suseelacateringcrm.ui.theme.screenExit
import com.example.suseelacateringcrm.util.L

@Composable
fun SuseelaNavGraph(
    navController: NavHostController = rememberNavController(),
) {
    val sessionState by ServiceLocator.sessionManager.state.collectAsStateWithLifecycle()

    when (val state = sessionState) {
        is SessionState.Loading -> LoadingIndicator()
        is SessionState.Error -> com.example.suseelacateringcrm.ui.auth.SessionErrorScreen(
            onRetry = { ServiceLocator.sessionManager.retry() },
            onLogout = { ServiceLocator.authRepository.logout() },
        )
        is SessionState.LoggedOut -> LoginScreen(onLoggedIn = { /* nav graph reacts to session change automatically */ })
        is SessionState.LoggedIn -> if (state.profile.isPendingApproval) {
            PendingApprovalScreen(
                name = state.profile.name,
                onLogout = { ServiceLocator.authRepository.logout() },
            )
        } else {
            val role = state.profile.userRole
            // Module 4d: the drawer narrows for a manager who was given a business role
            if (com.example.suseelacateringcrm.data.model.JobRoles.current != state.profile.jobRole) com.example.suseelacateringcrm.data.model.JobRoles.current = state.profile.jobRole
            val backStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = backStackEntry?.destination?.route
            val reduced = LocalReducedMotion.current
            val context = LocalContext.current

            // First admin login: open the setup wizard once if settings/business doesn't exist yet.
            LaunchedEffect(role) {
                if (role == UserRole.ADMIN) {
                    val prefs = context.getSharedPreferences("setup_wizard", android.content.Context.MODE_PRIVATE)
                    if (!prefs.getBoolean("prompted", false)) {
                        val existing = ServiceLocator.settingsRepository.getBusiness()
                        prefs.edit().putBoolean("prompted", true).apply()
                        if (existing == null || existing.name.isBlank()) {
                            navController.navigate(NavRoutes.SETUP) { launchSingleTop = true }
                        }
                    }
                }
            }

            AppScaffold(
                navController = navController,
                currentRoute = currentRoute,
                role = role,
                title = titleForRoute(currentRoute),
                onLogout = { ServiceLocator.authRepository.logout() },
            ) { padding ->
                NavHost(
                    navController = navController,
                    // Round 11: the Target Board is the first screen for everyone (owner request).
                    startDestination = NavRoutes.TARGET_BOARD,
                    enterTransition = { screenEnter(reduced) },
                    exitTransition = { screenExit(reduced) },
                    popEnterTransition = { screenEnter(reduced) },
                    popExitTransition = { screenExit(reduced) },
                ) {
                    composable(NavRoutes.DASHBOARD) {
                        DashboardScreen(
                            role = role,
                            padding = padding,
                            onNavigateCustomers = { navController.navigate(NavRoutes.CUSTOMERS_LIST) },
                            onNavigateBookings = { navController.navigate(NavRoutes.BOOKINGS_LIST) },
                            onNavigateMenu = { navController.navigate(NavRoutes.MENU_LIST) },
                            onNavigateInventory = { navController.navigate(NavRoutes.INVENTORY_LIST) },
                            onNavigateInvoices = { navController.navigate(NavRoutes.INVOICES_LIST) },
                            onNavigateQuotations = { navController.navigate(NavRoutes.QUOTATIONS_LIST) },
                            onNavigateStaff = { navController.navigate(NavRoutes.STAFF_LIST) },
                            onNavigateUsers = { navController.navigate(NavRoutes.USER_MANAGEMENT) },
                            onNavigateReports = { navController.navigate(NavRoutes.REPORTS) },
                            onNavigatePurchases = { navController.navigate(NavRoutes.PURCHASES_LIST) },
                            onNavigateExpenses = { navController.navigate(NavRoutes.EXPENSES_LIST) },
                            onNavigateCalendar = { navController.navigate(NavRoutes.CALENDAR) },
                            onNavigateVendors = { navController.navigate(NavRoutes.VENDORS_LIST) },
                            onNavigateOwnerReports = { navController.navigate(NavRoutes.OWNER_REPORTS) },
                            onOpenBooking = { id -> navController.navigate(NavRoutes.bookingDetail(id)) },
                        )
                    }

                    // ---------------- Batch 1 screens ----------------
                    composable(NavRoutes.MENU_PACKAGES) {
                        MenuPackagesScreen(
                            role = role,
                            padding = padding,
                            onOpenPackage = { id -> navController.navigate(NavRoutes.menuPackageDetail(id)) },
                            onQuote = { id -> navController.navigate(NavRoutes.quoteBuilder(packageId = id)) },
                        )
                    }
                    composable(NavRoutes.MENU_PACKAGE_DETAIL) { entry ->
                        val packageId = entry.arguments?.getString("packageId") ?: return@composable
                        MenuPackageDetailScreen(
                            packageId = packageId,
                            padding = padding,
                            onQuote = { id -> navController.navigate(NavRoutes.quoteBuilder(packageId = id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.QUOTE_BUILDER_ARG,
                        arguments = listOf(
                            navArgument("packageId") { type = NavType.StringType; nullable = true; defaultValue = null },
                            navArgument("bookingId") { type = NavType.StringType; nullable = true; defaultValue = null },
                        ),
                    ) { entry ->
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) {
                            QuoteBuilderScreen(
                                packageId = entry.arguments?.getString("packageId"),
                                bookingId = entry.arguments?.getString("bookingId"),
                                padding = padding,
                                onSaved = { quotationId ->
                                    navController.navigate(NavRoutes.quotationDetail(quotationId)) {
                                        popUpTo(NavRoutes.TARGET_BOARD)
                                    }
                                },
                            )
                        }
                    }
                    composable(NavRoutes.LEADS_LIST) {
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) {
                            LeadsListScreen(
                                padding = padding,
                                onAddLead = { navController.navigate(NavRoutes.leadEdit()) },
                                onOpenLead = { id -> navController.navigate(NavRoutes.leadEdit(id)) },
                            )
                        }
                    }
                    composable(
                        route = NavRoutes.LEAD_EDIT_ARG,
                        arguments = listOf(navArgument("leadId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) {
                            LeadEditScreen(
                                leadId = entry.arguments?.getString("leadId"),
                                padding = padding,
                                onDone = { navController.popBackStack() },
                                onOpenCustomer = { customerId ->
                                    navController.navigate(NavRoutes.customerDetail(customerId)) {
                                        popUpTo(NavRoutes.LEADS_LIST)
                                    }
                                },
                            )
                        }
                    }
                    composable(NavRoutes.ATTENDANCE) {
                        AttendanceScreen(
                            padding = padding,
                            onOpenPayroll = { navController.navigate(NavRoutes.PAYROLL) },
                        )
                    }
                    composable(NavRoutes.PAYROLL) {
                        RoleGate(role) { PayrollScreen(padding = padding) }
                    }
                    composable(NavRoutes.KITCHEN) {
                        KitchenScreen(padding = padding)
                    }
                    composable(NavRoutes.TARGET_BOARD) {
                        // Everyone; the server sends ₹ / profit by role (getTargetBoard).
                        TargetBoardScreen(
                            padding = padding,
                            onOpenDashboard = { navController.navigate(NavRoutes.DASHBOARD) { launchSingleTop = true } },
                        )
                    }
                    composable(NavRoutes.SETUP) {
                        RoleGate(role) {
                            SetupWizardScreen(
                                padding = padding,
                                onFinish = {
                                    if (!navController.popBackStack()) navController.navigate(NavRoutes.DASHBOARD)
                                },
                            )
                        }
                    }
                    // Round 10
                    composable(NavRoutes.VENDOR_RATES) {
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) { com.example.suseelacateringcrm.ui.owner.VendorRatesScreen(padding = padding) }
                    }
                    composable(NavRoutes.LUNCH_BOXES) {
                        com.example.suseelacateringcrm.ui.owner.LunchBoxesScreen(padding = padding)
                    }
                    composable(NavRoutes.CONTENT_PLAN) {
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) { com.example.suseelacateringcrm.ui.owner.ContentPlanScreen(padding = padding) }
                    }
                    composable(NavRoutes.CALENDAR_NOTES) {
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) { com.example.suseelacateringcrm.ui.owner.CalendarNotesScreen(padding = padding) }
                    }
                    composable(NavRoutes.STAFF_WORK) {
                        com.example.suseelacateringcrm.ui.staffops.StaffWorkScreen(padding = padding)
                    }
                    composable(NavRoutes.OWNER_REPORTS) {
                        RoleGate(role) { com.example.suseelacateringcrm.ui.owner.OwnerReportsScreen(padding = padding) }
                    }
                    // Round 8 screens
                    composable(
                        NavRoutes.EVENT_PLAN,
                        arguments = listOf(
                            androidx.navigation.navArgument("bookingId") { type = androidx.navigation.NavType.StringType },
                            androidx.navigation.navArgument("sessionId") { type = androidx.navigation.NavType.StringType; nullable = true; defaultValue = null },
                        ),
                    ) { entry ->
                        val bid = entry.arguments?.getString("bookingId") ?: return@composable
                        com.example.suseelacateringcrm.ui.recipes.EventPlanScreen(
                            padding = padding, bookingId = bid, sessionId = entry.arguments?.getString("sessionId"),
                            onOpenCookLog = { navController.navigate(NavRoutes.cookLog(bid)) },
                        )
                    }
                    composable(NavRoutes.COOK_LOG) { entry ->
                        val bid = entry.arguments?.getString("bookingId") ?: return@composable
                        com.example.suseelacateringcrm.ui.recipes.CookLogScreen(padding = padding, bookingId = bid)
                    }
                    composable(
                        NavRoutes.DAY_PLAN_ARG,
                        arguments = listOf(androidx.navigation.navArgument("date") { type = androidx.navigation.NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) {
                            com.example.suseelacateringcrm.ui.recipes.DayPlanScreen(padding = padding, date = entry.arguments?.getString("date"))
                        }
                    }
                    composable(NavRoutes.DISHES) {
                        com.example.suseelacateringcrm.ui.recipes.DishesScreen(padding = padding)
                    }
                    composable(NavRoutes.NOTIFICATIONS) {
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) {
                            com.example.suseelacateringcrm.ui.recipes.NotificationsScreen(
                                padding = padding,
                                onOpenDayPlan = { d -> navController.navigate(NavRoutes.dayPlan(d)) },
                            )
                        }
                    }
                    // Round 7 screens
                    composable(
                        NavRoutes.EQUIPMENT_ARG,
                        arguments = listOf(androidx.navigation.navArgument("bookingId") { type = androidx.navigation.NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        com.example.suseelacateringcrm.ui.ops.EquipmentScreen(padding = padding, bookingId = entry.arguments?.getString("bookingId"))
                    }
                    composable(NavRoutes.VEHICLES) {
                        com.example.suseelacateringcrm.ui.ops.VehiclesScreen(padding = padding)
                    }
                    composable(NavRoutes.PROCUREMENT) {
                        com.example.suseelacateringcrm.ui.procure.ProcurementScreen(padding = padding, role = role)
                    }
                    composable(NavRoutes.PACKED_PRODUCTS) {
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) { com.example.suseelacateringcrm.ui.packed.PackedProductsScreen(padding = padding) }
                    }
                    composable(NavRoutes.OUTSIDE_ORDERS) {
                        RoleGate(role, UserRole.ADMIN_AND_MANAGER) { com.example.suseelacateringcrm.ui.ops.OutsideOrdersScreen(padding = padding) }
                    }
                    composable(NavRoutes.VENDOR_DUES) {
                        RoleGate(role) { com.example.suseelacateringcrm.ui.ops.VendorDuesScreen(padding = padding) }
                    }
                    composable(NavRoutes.DISPATCH) {
                        com.example.suseelacateringcrm.ui.safety.DispatchScreen(padding = padding, role = role)
                    }
                    composable(NavRoutes.FOOD_SAFETY) {
                        com.example.suseelacateringcrm.ui.safety.FoodSafetyScreen(padding = padding, role = role)
                    }
                    composable(NavRoutes.COMPLAINTS) {
                        com.example.suseelacateringcrm.ui.ops.ComplaintsScreen(padding = padding)
                    }
                    composable(NavRoutes.HISTORY) {
                        RoleGate(role) { com.example.suseelacateringcrm.ui.history.HistoryScreen(padding = padding) }
                    }
                    composable(NavRoutes.SETTINGS) {
                        SettingsScreen(
                            role = role,
                            padding = padding,
                            onOpenSetup = { navController.navigate(NavRoutes.SETUP) },
                        )
                    }

                    composable(NavRoutes.CUSTOMERS_LIST) {
                        CustomersListScreen(
                            padding = padding,
                            onAddCustomer = { navController.navigate(NavRoutes.customerEdit()) },
                            onOpenCustomer = { id -> navController.navigate(NavRoutes.customerDetail(id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.CUSTOMER_EDIT_ARG,
                        arguments = listOf(navArgument("customerId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        CustomerEditScreen(
                            customerId = entry.arguments?.getString("customerId"),
                            padding = padding,
                            onDone = { navController.popBackStack() },
                        )
                    }
                    composable(NavRoutes.CUSTOMER_DETAIL) { entry ->
                        val customerId = entry.arguments?.getString("customerId") ?: return@composable
                        CustomerDetailScreen(
                            customerId = customerId,
                            padding = padding,
                            role = role,
                            onEdit = { navController.navigate(NavRoutes.customerEdit(customerId)) },
                            onOpenBooking = { bookingId -> navController.navigate(NavRoutes.bookingDetail(bookingId)) },
                        )
                    }

                    composable(NavRoutes.MENU_LIST) {
                        MenuListScreen(
                            role = role,
                            padding = padding,
                            onAddItem = { navController.navigate(NavRoutes.menuItemEdit()) },
                            onEditItem = { id -> navController.navigate(NavRoutes.menuItemEdit(id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.MENU_ITEM_EDIT_ARG,
                        arguments = listOf(navArgument("itemId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        MenuItemEditScreen(
                            itemId = entry.arguments?.getString("itemId"),
                            padding = padding,
                            onDone = { navController.popBackStack() },
                        )
                    }

                    composable(NavRoutes.BOOKINGS_LIST) {
                        BookingsListScreen(
                            padding = padding,
                            canCreate = role.canManage,
                            onAddBooking = { navController.navigate(NavRoutes.bookingEdit()) },
                            onOpenBooking = { id -> navController.navigate(NavRoutes.bookingDetail(id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.BOOKING_EDIT_ARG,
                        arguments = listOf(navArgument("bookingId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        BookingEditScreen(
                            bookingId = entry.arguments?.getString("bookingId"),
                            role = role,
                            padding = padding,
                            onDone = { navController.popBackStack() },
                        )
                    }
                    composable(NavRoutes.BOOKING_DETAIL) { entry ->
                        val bookingId = entry.arguments?.getString("bookingId") ?: return@composable
                        BookingDetailScreen(
                            bookingId = bookingId,
                            role = role,
                            padding = padding,
                            onEdit = { navController.navigate(NavRoutes.bookingEdit(bookingId)) },
                            onGenerateInvoice = { navController.navigate(NavRoutes.invoiceGenerate(bookingId)) },
                            onGenerateQuotation = { navController.navigate(NavRoutes.quoteBuilder(bookingId = bookingId)) },
                            onOpenInvoice = { invoiceId -> navController.navigate(NavRoutes.invoiceDetail(invoiceId)) },
                            onOpenKitchenPlan = { navController.navigate(NavRoutes.kitchenPlan(bookingId)) },
                            onOpenEquipment = { navController.navigate(NavRoutes.equipment(bookingId)) },
                            onOpenEventPlan = { navController.navigate(NavRoutes.eventPlan(bookingId)) },
                            onOpenCookLog = { navController.navigate(NavRoutes.cookLog(bookingId)) },
                        )
                    }
                    composable(NavRoutes.KITCHEN_PLAN) { entry ->
                        val bookingId = entry.arguments?.getString("bookingId") ?: return@composable
                        com.example.suseelacateringcrm.ui.bookings.KitchenPlanScreen(bookingId = bookingId, padding = padding)
                    }

                    composable(NavRoutes.INVOICES_LIST) {
                        InvoicesListScreen(
                            padding = padding,
                            onOpenInvoice = { id -> navController.navigate(NavRoutes.invoiceDetail(id)) },
                        )
                    }
                    composable(NavRoutes.INVOICE_GENERATE_ARG) { entry ->
                        val bookingId = entry.arguments?.getString("bookingId") ?: return@composable
                        InvoiceGenerateScreen(
                            bookingId = bookingId,
                            padding = padding,
                            onDone = { invoiceId ->
                                navController.navigate(NavRoutes.invoiceDetail(invoiceId)) {
                                    popUpTo(NavRoutes.BOOKINGS_LIST)
                                }
                            },
                        )
                    }
                    composable(NavRoutes.INVOICE_DETAIL) { entry ->
                        val invoiceId = entry.arguments?.getString("invoiceId") ?: return@composable
                        InvoiceDetailScreen(invoiceId = invoiceId, padding = padding)
                    }

                    composable(NavRoutes.QUOTATIONS_LIST) {
                        QuotationsListScreen(
                            padding = padding,
                            onOpenQuotation = { id -> navController.navigate(NavRoutes.quotationDetail(id)) },
                        )
                    }
                    composable(NavRoutes.QUOTATION_GENERATE_ARG) { entry ->
                        val bookingId = entry.arguments?.getString("bookingId") ?: return@composable
                        QuotationGenerateScreen(
                            bookingId = bookingId,
                            padding = padding,
                            onDone = { quotationId ->
                                navController.navigate(NavRoutes.quotationDetail(quotationId)) {
                                    popUpTo(NavRoutes.BOOKINGS_LIST)
                                }
                            },
                        )
                    }
                    composable(NavRoutes.QUOTATION_DETAIL) { entry ->
                        val quotationId = entry.arguments?.getString("quotationId") ?: return@composable
                        QuotationDetailScreen(
                            quotationId = quotationId,
                            padding = padding,
                            onConvertToInvoice = { bookingId -> navController.navigate(NavRoutes.invoiceGenerate(bookingId)) },
                        )
                    }

                    composable(NavRoutes.STAFF_LIST) {
                        StaffListScreen(
                            padding = padding,
                            onAddStaff = { navController.navigate(NavRoutes.staffEdit()) },
                            onEditStaff = { id -> navController.navigate(NavRoutes.staffEdit(id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.STAFF_EDIT_ARG,
                        arguments = listOf(navArgument("staffId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        StaffEditScreen(
                            staffId = entry.arguments?.getString("staffId"),
                            padding = padding,
                            onDone = { navController.popBackStack() },
                        )
                    }

                    composable(NavRoutes.INVENTORY_LIST) {
                        InventoryListScreen(
                            role = role,
                            padding = padding,
                            onAddItem = { navController.navigate(NavRoutes.inventoryItemEdit()) },
                            onEditItem = { id -> navController.navigate(NavRoutes.inventoryItemEdit(id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.INVENTORY_ITEM_EDIT_ARG,
                        arguments = listOf(navArgument("itemId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        InventoryItemEditScreen(
                            itemId = entry.arguments?.getString("itemId"),
                            padding = padding,
                            onDone = { navController.popBackStack() },
                        )
                    }

                    composable(NavRoutes.USER_MANAGEMENT) {
                        UserManagementScreen(padding = padding)
                    }
                    composable(NavRoutes.MASTERS) {
                        RoleGate(role) { com.example.suseelacateringcrm.ui.owner.MastersScreen(padding = padding) }
                    }

                    composable(NavRoutes.REPORTS) {
                        ReportsScreen(
                            padding = padding,
                            onOpenCashReport = { navController.navigate(NavRoutes.CASH_REPORT) },
                        )
                    }
                    composable(NavRoutes.CASH_REPORT) {
                        com.example.suseelacateringcrm.ui.reports.CashReportScreen(padding = padding)
                    }
                    composable(NavRoutes.CALENDAR) {
                        com.example.suseelacateringcrm.ui.calendar.CalendarScreen(
                            padding = padding,
                            onOpenBooking = { id -> navController.navigate(NavRoutes.bookingDetail(id)) },
                        )
                    }

                    composable(NavRoutes.VENDORS_LIST) {
                        VendorListScreen(
                            role = role,
                            padding = padding,
                            onAddVendor = { navController.navigate(NavRoutes.vendorEdit()) },
                            onEditVendor = { id -> navController.navigate(NavRoutes.vendorEdit(id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.VENDOR_EDIT_ARG,
                        arguments = listOf(navArgument("vendorId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        VendorEditScreen(
                            vendorId = entry.arguments?.getString("vendorId"),
                            padding = padding,
                            onDone = { navController.popBackStack() },
                        )
                    }

                    composable(NavRoutes.BRANCHES_LIST) {
                        BranchListScreen(
                            role = role,
                            padding = padding,
                            onAddBranch = { navController.navigate(NavRoutes.branchEdit()) },
                            onEditBranch = { id -> navController.navigate(NavRoutes.branchEdit(id)) },
                        )
                    }
                    composable(
                        route = NavRoutes.BRANCH_EDIT_ARG,
                        arguments = listOf(navArgument("branchId") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        BranchEditScreen(
                            branchId = entry.arguments?.getString("branchId"),
                            padding = padding,
                            onDone = { navController.popBackStack() },
                        )
                    }

                    composable(NavRoutes.PURCHASES_LIST) {
                        PurchasesHomeScreen(
                            padding = padding,
                            onOpenKirana = { navController.navigate(NavRoutes.KIRANA_CATALOG) },
                            onOpenKayagoralu = { navController.navigate(NavRoutes.KAYAGORALU_CATALOG) },
                            onOpenDisposables = { navController.navigate(NavRoutes.DISPOSABLES_CATALOG) },
                            onOpenFruits = { navController.navigate(NavRoutes.FRUITS_CATALOG) },
                            onOpenNonVeg = { navController.navigate(NavRoutes.NONVEG_CATALOG) },
                            onOpenGasFuel = { navController.navigate(NavRoutes.GASFUEL_CATALOG) },
                            onOpenWaterIce = { navController.navigate(NavRoutes.WATERICE_CATALOG) },
                            onOpenOtherItems = { navController.navigate(NavRoutes.OTHER_ITEMS) },
                            onOpenOutsidePurchases = {
                                navController.navigate(NavRoutes.expenseHistory(com.example.suseelacateringcrm.data.model.ExpenseSections.OUTSIDE_PURCHASE))
                            },
                            onOpenHistory = { navController.navigate(NavRoutes.PURCHASE_HISTORY) },
                            onOpenStaffReport = { navController.navigate(NavRoutes.STAFF_PURCHASE_REPORT) },
                            onOpenItemReport = { navController.navigate(NavRoutes.ITEM_PURCHASE_REPORT) },
                        )
                    }
                    composable(NavRoutes.KIRANA_CATALOG) {
                        CatalogPickerScreen(
                            padding = padding,
                            categories = com.example.suseelacateringcrm.data.model.KiranaCatalog.categories,
                            allItems = com.example.suseelacateringcrm.data.model.KiranaCatalog.items,
                            onItemSelected = { item ->
                                navController.navigate(NavRoutes.purchaseAdd(item.name, item.category, item.module, item.units))
                            },
                        )
                    }
                    composable(NavRoutes.KAYAGORALU_CATALOG) {
                        CatalogPickerScreen(
                            padding = padding,
                            categories = com.example.suseelacateringcrm.data.model.VegetableCatalog.categories,
                            allItems = com.example.suseelacateringcrm.data.model.VegetableCatalog.items,
                            onItemSelected = { item ->
                                navController.navigate(NavRoutes.purchaseAdd(item.name, item.category, item.module, item.units))
                            },
                        )
                    }
                    composable(NavRoutes.DISPOSABLES_CATALOG) {
                        CatalogPickerScreen(
                            padding = padding,
                            categories = com.example.suseelacateringcrm.data.model.DisposablesCatalog.categories,
                            allItems = com.example.suseelacateringcrm.data.model.DisposablesCatalog.items,
                            onItemSelected = { item ->
                                navController.navigate(NavRoutes.purchaseAdd(item.name, item.category, item.module, item.units))
                            },
                        )
                    }
                    composable(NavRoutes.FRUITS_CATALOG) {
                        CatalogPickerScreen(
                            padding = padding,
                            categories = com.example.suseelacateringcrm.data.model.FruitsCatalog.categories,
                            allItems = com.example.suseelacateringcrm.data.model.FruitsCatalog.items,
                            onItemSelected = { item ->
                                navController.navigate(NavRoutes.purchaseAdd(item.name, item.category, item.module, item.units))
                            },
                        )
                    }
                    composable(NavRoutes.NONVEG_CATALOG) {
                        CatalogPickerScreen(
                            padding = padding,
                            categories = com.example.suseelacateringcrm.data.model.NonVegCatalog.categories,
                            allItems = com.example.suseelacateringcrm.data.model.NonVegCatalog.items,
                            onItemSelected = { item ->
                                navController.navigate(NavRoutes.purchaseAdd(item.name, item.category, item.module, item.units))
                            },
                        )
                    }
                    composable(NavRoutes.GASFUEL_CATALOG) {
                        CatalogPickerScreen(
                            padding = padding,
                            categories = com.example.suseelacateringcrm.data.model.GasFuelCatalog.categories,
                            allItems = com.example.suseelacateringcrm.data.model.GasFuelCatalog.items,
                            onItemSelected = { item ->
                                navController.navigate(NavRoutes.purchaseAdd(item.name, item.category, item.module, item.units))
                            },
                        )
                    }
                    composable(NavRoutes.WATERICE_CATALOG) {
                        CatalogPickerScreen(
                            padding = padding,
                            categories = com.example.suseelacateringcrm.data.model.WaterIceCatalog.categories,
                            allItems = com.example.suseelacateringcrm.data.model.WaterIceCatalog.items,
                            onItemSelected = { item ->
                                navController.navigate(NavRoutes.purchaseAdd(item.name, item.category, item.module, item.units))
                            },
                        )
                    }
                    composable(NavRoutes.OTHER_ITEMS) {
                        OtherItemsScreen(
                            role = role,
                            padding = padding,
                            onItemSelected = { name, category, unit ->
                                navController.navigate(
                                    NavRoutes.purchaseAdd(name, category, com.example.suseelacateringcrm.data.model.PurchaseModules.OTHER, listOf(unit))
                                )
                            },
                        )
                    }
                    composable(NavRoutes.PURCHASE_HISTORY) {
                        PurchaseHistoryScreen(
                            padding = padding,
                            onOpenPurchase = { id -> navController.navigate(NavRoutes.purchaseDetail(id)) },
                        )
                    }
                    composable(NavRoutes.STAFF_PURCHASE_REPORT) {
                        StaffPurchaseReportScreen(padding = padding)
                    }
                    composable(NavRoutes.ITEM_PURCHASE_REPORT) {
                        ItemPurchaseReportScreen(padding = padding)
                    }
                    composable(
                        route = NavRoutes.PURCHASE_ADD_ARG,
                        arguments = listOf(
                            navArgument("itemName") { type = NavType.StringType; nullable = true; defaultValue = null },
                            navArgument("category") { type = NavType.StringType; nullable = true; defaultValue = null },
                            navArgument("module") { type = NavType.StringType; nullable = true; defaultValue = null },
                            navArgument("units") { type = NavType.StringType; nullable = true; defaultValue = null },
                        ),
                    ) { entry ->
                        // Navigation already decodes arguments once; decoding again broke names containing '%'.
                        fun decode(value: String?): String? = value?.takeIf { it.isNotBlank() }
                        val decodedUnits = decode(entry.arguments?.getString("units"))
                            ?.split(",")
                            ?.filter { it.isNotBlank() }
                            ?.takeIf { it.isNotEmpty() }
                        PurchaseEditScreen(
                            padding = padding,
                            prefillName = decode(entry.arguments?.getString("itemName")),
                            prefillCategory = decode(entry.arguments?.getString("category")),
                            prefillModule = decode(entry.arguments?.getString("module")),
                            prefillUnits = decodedUnits,
                            onDone = { navController.popBackStack(NavRoutes.PURCHASES_LIST, inclusive = false) },
                        )
                    }
                    composable(NavRoutes.PURCHASE_DETAIL) { entry ->
                        val purchaseId = entry.arguments?.getString("purchaseId") ?: return@composable
                        PurchaseDetailScreen(
                            purchaseId = purchaseId,
                            padding = padding,
                            onEdit = { id -> navController.navigate(NavRoutes.purchaseEdit(id)) },
                            onDeleted = { navController.popBackStack() },
                        )
                    }
                    composable(NavRoutes.PURCHASE_EDIT_ARG) { entry ->
                        val purchaseId = entry.arguments?.getString("purchaseId") ?: return@composable
                        PurchaseEditScreen(
                            padding = padding,
                            purchaseId = purchaseId,
                            onDone = { navController.popBackStack() },
                        )
                    }

                    composable(NavRoutes.EXPENSES_LIST) {
                        ExpensesHomeScreen(
                            padding = padding,
                            onOpenSection = { section -> navController.navigate(NavRoutes.expenseHistory(section)) },
                            onOpenHistory = { navController.navigate(NavRoutes.EXPENSE_HISTORY) },
                            onOpenPersonReport = { navController.navigate(NavRoutes.EXPENSE_PERSON_REPORT) },
                            onOpenStaff = if (role == UserRole.ADMIN) { { navController.navigate(NavRoutes.STAFF_LIST) } } else null,
                        )
                    }
                    composable(
                        route = NavRoutes.EXPENSE_HISTORY_ARG,
                        arguments = listOf(navArgument("section") { type = NavType.StringType; nullable = true; defaultValue = null }),
                    ) { entry ->
                        // Navigation already decodes the argument (no second decode).
                        val section = entry.arguments?.getString("section")
                            ?.takeIf { it.isNotBlank() }
                        ExpenseHistoryScreen(
                            padding = padding,
                            initialSection = section,
                            onOpenExpense = { id -> navController.navigate(NavRoutes.expenseDetail(id)) },
                            onAddExpense = { navController.navigate(NavRoutes.expenseAdd(section)) },
                        )
                    }
                    composable(NavRoutes.EXPENSE_PERSON_REPORT) {
                        PersonWiseReportScreen(padding = padding)
                    }
                    composable(
                        route = NavRoutes.EXPENSE_ADD_ARG,
                        arguments = listOf(
                            navArgument("section") { type = NavType.StringType; nullable = true; defaultValue = null },
                            navArgument("subCategory") { type = NavType.StringType; nullable = true; defaultValue = null },
                        ),
                    ) { entry ->
                        // Navigation already decodes arguments once; decoding again broke names containing '%'.
                        fun decode(value: String?): String? = value?.takeIf { it.isNotBlank() }
                        ExpenseEntryScreen(
                            padding = padding,
                            prefillSection = decode(entry.arguments?.getString("section")),
                            prefillSubCategory = decode(entry.arguments?.getString("subCategory")),
                            onDone = { navController.popBackStack() },
                            onOpenStaff = if (role == UserRole.ADMIN) { { navController.navigate(NavRoutes.STAFF_LIST) } } else null,
                        )
                    }
                    composable(NavRoutes.EXPENSE_DETAIL) { entry ->
                        val expenseId = entry.arguments?.getString("expenseId") ?: return@composable
                        ExpenseDetailScreen(
                            expenseId = expenseId,
                            padding = padding,
                            onEdit = { id -> navController.navigate(NavRoutes.expenseEdit(id)) },
                            onDeleted = { navController.popBackStack() },
                        )
                    }
                    composable(NavRoutes.EXPENSE_EDIT_ARG) { entry ->
                        val expenseId = entry.arguments?.getString("expenseId") ?: return@composable
                        ExpenseEntryScreen(
                            padding = padding,
                            expenseId = expenseId,
                            onDone = { navController.popBackStack() },
                            onOpenStaff = if (role == UserRole.ADMIN) { { navController.navigate(NavRoutes.STAFF_LIST) } } else null,
                        )
                    }
                }
            }
        }
    }
}

private fun titleForRoute(route: String?): String = when {
    route == null -> L("సుశీల క్యాటరింగ్స్", "Suseela Catering CRM")
    route == NavRoutes.DASHBOARD -> L("డాష్‌బోర్డ్", "Dashboard")
    route == NavRoutes.CUSTOMERS_LIST -> L("Customers", "Customers")
    route == NavRoutes.MENU_LIST -> L("వంటకాలు & ధరలు", "Menu & Pricing")
    route == NavRoutes.BOOKINGS_LIST -> L("Bookings", "Bookings")
    route == NavRoutes.INVOICES_LIST -> L("ఇన్వాయిస్‌లు", "Billing & Invoices")
    route == NavRoutes.QUOTATIONS_LIST -> L("కొటేషన్లు", "Quotations")
    route == NavRoutes.STAFF_LIST -> L("సిబ్బంది", "Staff")
    route == NavRoutes.INVENTORY_LIST -> L("స్టాక్", "Inventory")
    route == NavRoutes.USER_MANAGEMENT -> L("Users", "User Management")
    route == NavRoutes.REPORTS -> L("రిపోర్టులు", "Reports")
    route == NavRoutes.MENU_PACKAGES -> L("మెనూలు", "Menu packages")
    route == NavRoutes.MENU_PACKAGE_DETAIL -> L("మెనూ", "Menu")
    route.startsWith(NavRoutes.QUOTE_BUILDER) -> L("కొత్త కొటేషన్", "New quotation")
    route == NavRoutes.LEADS_LIST -> L("Enquiries (leads)", "Leads")
    route.startsWith("leads/") -> L("Lead", "Lead")
    route == NavRoutes.ATTENDANCE -> L("హాజరు", "Attendance")
    route == NavRoutes.PAYROLL -> L("నెల జీతాలు", "Payroll")
    route == NavRoutes.KITCHEN -> L("వంటగది", "Kitchen")
    route == NavRoutes.TARGET_BOARD -> L("లక్ష్యాల బోర్డు", "Target Board")
    route == NavRoutes.SETUP -> L("సెటప్", "Setup")
    route == NavRoutes.SETTINGS -> L("సెట్టింగ్స్", "Settings")
    route == NavRoutes.HISTORY -> L("మార్పుల చరిత్ర", "Change history")
    route == NavRoutes.VENDOR_RATES -> L("వ్యాపారుల ధరల పోలిక", "Vendor price comparison")
    route == NavRoutes.LUNCH_BOXES -> L("లంచ్ బాక్సులు", "Lunch boxes")
    route == NavRoutes.CONTENT_PLAN -> L("పోస్టుల ప్లాన్", "Content plan")
    route == NavRoutes.STAFF_WORK -> L("షిఫ్ట్‌లు & పనులు", "Shifts & tasks")
    route == NavRoutes.OWNER_REPORTS -> L("లాభం, రద్దులు, లక్ష్యం", "P&L, cancellations, target")
    route.startsWith("event-plan/") -> L("వంట plan", "Cooking plan")
    route.startsWith("cook-log/") -> L("వంట లాగ్", "Cook log")
    route.startsWith(NavRoutes.DAY_PLAN) -> L("రోజు వంట plan", "Day plan")
    route == NavRoutes.DISHES -> L("వంటకాలు", "Dishes")
    route == NavRoutes.NOTIFICATIONS -> L("వంట సందేశాలు", "Kitchen notifications")
    route.startsWith(NavRoutes.EQUIPMENT) -> L("పాత్రలు / సామాను", "Vessels & equipment")
    route == NavRoutes.VEHICLES -> L("వాహనాలు", "Vehicles")
    route == NavRoutes.OUTSIDE_ORDERS -> L("బయట ఆర్డర్లు", "Outside orders")
    route == NavRoutes.PACKED_PRODUCTS -> L("ప్యాక్ ఉత్పత్తులు", "Packed products")
    route == NavRoutes.PROCUREMENT -> L("కొనుగోలు అభ్యర్థనలు & ఆర్డర్లు", "Purchase requests & orders")
    route == NavRoutes.VENDOR_DUES -> L("వ్యాపారులకు బాకీ", "Vendor dues")
    route == NavRoutes.COMPLAINTS -> L("ఫిర్యాదులు", "Complaints")
    route == NavRoutes.DISPATCH -> L("ప్యాకింగ్ & పంపిణీ", "Packing & dispatch")
    route == NavRoutes.FOOD_SAFETY -> L("ఫుడ్ సేఫ్టీ", "Food safety")
    route == NavRoutes.CASH_REPORT -> "Cash Collection Report"
    route == NavRoutes.CALENDAR -> "Calendar"
    route == NavRoutes.VENDORS_LIST -> "Vendors"
    route == NavRoutes.BRANCHES_LIST -> "Branches"
    route == NavRoutes.PURCHASES_LIST -> "Purchases"
    route == NavRoutes.KIRANA_CATALOG -> "Kirana Purchase"
    route == NavRoutes.KAYAGORALU_CATALOG -> "Kayagoralu Purchase"
    route == NavRoutes.DISPOSABLES_CATALOG -> "Disposables"
    route == NavRoutes.FRUITS_CATALOG -> "Fruits"
    route == NavRoutes.NONVEG_CATALOG -> "Non-Veg"
    route == NavRoutes.GASFUEL_CATALOG -> "Gas / Fuel"
    route == NavRoutes.WATERICE_CATALOG -> "Water / Ice"
    route == NavRoutes.OTHER_ITEMS -> "Other Items"
    route == NavRoutes.PURCHASE_HISTORY -> "Purchase History"
    route == NavRoutes.STAFF_PURCHASE_REPORT -> "Staff-wise Report"
    route == NavRoutes.ITEM_PURCHASE_REPORT -> "Item-wise Report"
    route == NavRoutes.PURCHASE_ADD || route == NavRoutes.PURCHASE_ADD_ARG -> "New Purchase"
    route == NavRoutes.EXPENSES_LIST -> "Expenses"
    route == NavRoutes.EXPENSE_HISTORY || route == NavRoutes.EXPENSE_HISTORY_ARG -> "Expense History"
    route == NavRoutes.EXPENSE_PERSON_REPORT -> "Person-wise Report"
    route == NavRoutes.EXPENSE_ADD || route == NavRoutes.EXPENSE_ADD_ARG -> "New Expense"
    route == NavRoutes.EXPENSE_EDIT_ARG -> "Edit Expense"
    route == NavRoutes.PURCHASE_EDIT_ARG -> "Edit Purchase"
    route.startsWith("expenses/") -> "Expense"
    route.startsWith("vendors/") -> "Vendor"
    route.startsWith("branches/") -> "Branch"
    route.startsWith("purchases/") -> "Purchase"
    route.startsWith("customers/") -> "Customer"
    route.startsWith("menu/") -> "Menu Item"
    route.endsWith("/kitchen-plan") -> "Kitchen Prep List"
    route.startsWith("bookings/") -> "Booking"
    route.startsWith("invoices/") -> "Invoice"
    route.startsWith("quotations/") -> "Quotation"
    route.startsWith("staff/") -> "Staff"
    route.startsWith("inventory/") -> "Inventory Item"
    else -> "Suseela Catering CRM"
}
