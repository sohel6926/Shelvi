package com.example.suseelacateringcrm.ui.navigation

import androidx.compose.foundation.clickable
import com.example.suseelacateringcrm.data.model.JobRoles
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.SupervisorAccount
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.HowToReg
import androidx.compose.material.icons.filled.ManageAccounts
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Kitchen
import androidx.compose.material.icons.filled.History
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.input.nestedscroll.nestedScroll
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.RefreshController
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.SuseelaType
import com.example.suseelacateringcrm.ui.theme.navSelectedBar
import com.example.suseelacateringcrm.util.AppLanguage
import com.example.suseelacateringcrm.util.L
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.example.suseelacateringcrm.data.model.UserRole
import kotlinx.coroutines.launch

private data class DrawerDestination(
    val route: String,
    val te: String,
    val en: String,
    val icon: ImageVector,
    val roles: Set<UserRole> = UserRole.EVERYONE,
) {
    val label: String get() = L(te, en)
}

private data class DrawerGroup(val te: String, val en: String, val items: List<DrawerDestination>) {
    val label: String get() = L(te, en)
}

private val A = UserRole.ADMIN_ONLY
private val AM = UserRole.ADMIN_AND_MANAGER

/**
 * Grouped drawer. Roles follow docs/security-review.md: staff can't read customers, quotations,
 * leads, invoices, users or other staff; managers don't see profit / reports / users / staff pay.
 */
private val drawerGroups = listOf(
    DrawerGroup("ముఖ్యం", "Main", listOf(
        // Round 11: Target Board first, for everyone.
        DrawerDestination(NavRoutes.TARGET_BOARD, "లక్ష్య బోర్డు", "Target Board", Icons.Filled.EmojiEvents),
        DrawerDestination(NavRoutes.DASHBOARD, "డాష్‌బోర్డ్", "Dashboard", Icons.Filled.Dashboard),
        DrawerDestination(NavRoutes.CALENDAR, "క్యాలెండర్", "Calendar", Icons.Filled.CalendarMonth),
    )),
    DrawerGroup("అమ్మకాలు", "Sales", listOf(
        DrawerDestination(NavRoutes.LEADS_LIST, "Enquiries (leads)", "Leads", Icons.Filled.PersonAdd, AM),
        DrawerDestination(NavRoutes.CUSTOMERS_LIST, "Customers", "Customers", Icons.Filled.People, AM),
        DrawerDestination(NavRoutes.BOOKINGS_LIST, "Bookings / కార్యక్రమాలు", "Bookings", Icons.Filled.Event),
        DrawerDestination(NavRoutes.QUOTATIONS_LIST, "కొటేషన్లు", "Quotations", Icons.Filled.RequestQuote, AM),
        DrawerDestination(NavRoutes.QUOTE_BUILDER, "కొత్త కొటేషన్", "New quotation", Icons.Filled.Calculate, AM),
    )),
    DrawerGroup("మెనూ & వంట", "Menu & kitchen", listOf(
        DrawerDestination(NavRoutes.MENU_PACKAGES, "మెనూలు (ధరలు)", "Menu packages", Icons.AutoMirrored.Filled.MenuBook),
        DrawerDestination(NavRoutes.MENU_LIST, "వంటకాలు & ధరలు", "Menu items & pricing", Icons.Filled.Restaurant),
        DrawerDestination(NavRoutes.KITCHEN, "వంటగది", "Kitchen", Icons.Filled.Kitchen),
        DrawerDestination(NavRoutes.INVENTORY_LIST, "స్టాక్", "Inventory", Icons.Filled.Inventory),
        DrawerDestination(NavRoutes.DAY_PLAN, "రోజు వంట plan", "Day plan", Icons.Filled.CalendarMonth, AM),
        DrawerDestination(NavRoutes.DISHES, "వంటకాలు (నేర్చుకున్నవి)", "Dishes (learning)", Icons.Filled.Restaurant),
        DrawerDestination(NavRoutes.NOTIFICATIONS, "వంట సందేశాలు", "Kitchen notifications", Icons.Filled.Checklist, AM),
    )),
    DrawerGroup("కార్యక్రమం పనులు", "Event operations", listOf(
        DrawerDestination(NavRoutes.EQUIPMENT, "పాత్రలు / సామాను", "Vessels & equipment", Icons.Filled.Kitchen),
        DrawerDestination(NavRoutes.VEHICLES, "వాహనాలు", "Vehicles", Icons.Filled.LocalShipping),
        DrawerDestination(NavRoutes.OUTSIDE_ORDERS, "బయట ఆర్డర్లు", "Outside orders", Icons.Filled.ShoppingCart, AM),
        DrawerDestination(NavRoutes.PACKED_PRODUCTS, "ప్యాక్ ఉత్పత్తులు", "Packed products", Icons.Filled.Inventory, AM),
        DrawerDestination(NavRoutes.PROCUREMENT, "కొనుగోలు అభ్యర్థనలు & ఆర్డర్లు", "Purchase requests & orders", Icons.Filled.ShoppingCart),
        DrawerDestination(NavRoutes.COMPLAINTS, "ఫిర్యాదులు", "Complaints", Icons.Filled.Checklist),
        DrawerDestination(NavRoutes.DISPATCH, "ప్యాకింగ్ & పంపిణీ", "Packing & dispatch", Icons.Filled.LocalShipping),
        DrawerDestination(NavRoutes.FOOD_SAFETY, "ఫుడ్ సేఫ్టీ", "Food safety", Icons.Filled.Checklist),
        DrawerDestination(NavRoutes.LUNCH_BOXES, "లంచ్ బాక్సులు", "Lunch boxes", Icons.Filled.LocalShipping),
        DrawerDestination(NavRoutes.CONTENT_PLAN, "పోస్టుల ప్లాన్", "Content plan", Icons.Filled.CalendarMonth, AM),
        DrawerDestination(NavRoutes.CALENDAR_NOTES, "పండుగలు & నోట్లు", "Festivals & notes", Icons.Filled.CalendarMonth, AM),
    )),
    DrawerGroup("డబ్బు", "Money", listOf(
        DrawerDestination(NavRoutes.INVOICES_LIST, "ఇన్వాయిస్‌లు & చెల్లింపులు", "Invoices & payments", Icons.Filled.Receipt, AM),
        DrawerDestination(NavRoutes.EXPENSES_LIST, "ఖర్చులు", "Expenses", Icons.Filled.Payments),
        DrawerDestination(NavRoutes.PURCHASES_LIST, "కొనుగోళ్లు", "Purchases", Icons.Filled.ShoppingCart, AM),
        DrawerDestination(NavRoutes.VENDORS_LIST, "Vendors", "Vendors", Icons.Filled.LocalShipping, A),
        DrawerDestination(NavRoutes.VENDOR_DUES, "వ్యాపారులకు బాకీ", "Vendor dues", Icons.Filled.Payments, A),
        DrawerDestination(NavRoutes.VENDOR_RATES, "ధరల పోలిక", "Vendor price comparison", Icons.Filled.Assessment, AM),
        DrawerDestination(NavRoutes.REPORTS, "రిపోర్టులు", "Reports", Icons.Filled.Assessment, A),
        DrawerDestination(NavRoutes.OWNER_REPORTS, "లాభం · రద్దులు · లక్ష్యం", "P&L · cancellations · target", Icons.Filled.Assessment, A),
    )),
    DrawerGroup("సిబ్బంది", "Staff", listOf(
        DrawerDestination(NavRoutes.ATTENDANCE, "హాజరు", "Attendance", Icons.Filled.HowToReg),
        DrawerDestination(NavRoutes.STAFF_WORK, "షిఫ్ట్‌లు & పనులు", "Shifts & tasks", Icons.Filled.Checklist),
        DrawerDestination(NavRoutes.STAFF_LIST, "సిబ్బంది", "Staff", Icons.Filled.SupervisorAccount, A),
        DrawerDestination(NavRoutes.USER_MANAGEMENT, "Users (logins)", "User management", Icons.Filled.ManageAccounts, A),
        DrawerDestination(NavRoutes.MASTERS, "కంపెనీ · శాఖలు · స్టోర్లు", "Company, branches, stores", Icons.Filled.ManageAccounts, A),
    )),
    DrawerGroup("సెట్టింగ్స్", "Settings", listOf(
        DrawerDestination(NavRoutes.SETTINGS, "సెట్టింగ్స్ & భాష", "Settings & language", Icons.Filled.Settings),
        DrawerDestination(NavRoutes.SETUP, "మొదటి సెటప్", "Setup wizard", Icons.Filled.Checklist, A),
        DrawerDestination(NavRoutes.HISTORY, "మార్పుల చరిత్ర", "Change history", Icons.Filled.History, A),
        DrawerDestination(NavRoutes.BRANCHES_LIST, "Branches", "Branches", Icons.Filled.LocationOn, A),
    )),
)

/** Routes a role may open (used by the nav graph to block deep links / stale back stack). */
fun allowedDrawerRoutes(role: UserRole?): Set<String> =
    drawerGroups.flatMap { it.items }.filter { role != null && role in it.roles && JobRoles.navAllowed(it.route, role) }.map { it.route }.toSet()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppScaffold(
    navController: NavHostController,
    currentRoute: String?,
    role: UserRole?,
    title: String,
    onLogout: () -> Unit,
    content: @Composable (androidx.compose.foundation.layout.PaddingValues) -> Unit,
) {
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        text = L("సుశీల క్యాటరింగ్స్", "Suseela Caterings"),
                        modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    // Language switch — Telugu is the default.
                    Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { AppLanguage.set("te") }, enabled = AppLanguage.code != "te") { Text("తెలుగు") }
                        Text("|")
                        TextButton(onClick = { AppLanguage.set("en") }, enabled = AppLanguage.code != "en") { Text("English") }
                        Text("|")
                        TextButton(onClick = { AppLanguage.set("hi") }, enabled = AppLanguage.code != "hi") { Text("हिन्दी") }
                    }
                    BranchSwitcher(role = role)
                    drawerGroups.forEach { group ->
                        val items = group.items.filter { role != null && role in it.roles && JobRoles.navAllowed(it.route, role) }
                        if (items.isNotEmpty()) {
                            Text(
                                group.label,
                                style = SuseelaType.section,
                                color = SuseelaTheme.colors.sectionLabel,
                                modifier = Modifier.padding(start = 28.dp, top = 12.dp, bottom = 4.dp),
                            )
                            items.forEach { destination ->
                                val selected = currentRoute == destination.route
                                NavigationDrawerItem(
                                    icon = { Icon(destination.icon, contentDescription = null) },
                                    label = { Text(destination.label) },
                                    selected = selected,
                                    onClick = {
                                        scope.launch { drawerState.close() }
                                        if (currentRoute != destination.route) {
                                            navController.navigate(destination.route) {
                                                popUpTo(NavRoutes.TARGET_BOARD)
                                                launchSingleTop = true
                                            }
                                        }
                                    },
                                    modifier = Modifier.padding(horizontal = 12.dp).navSelectedBar(selected),
                                )
                            }
                        }
                    }
                    NavigationDrawerItem(
                        icon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null) },
                        label = { Text(L("బయటకు (Logout)", "Logout")) },
                        selected = false,
                        onClick = {
                            scope.launch { drawerState.close() }
                            onLogout()
                        },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                    )
                }
            }
        },
    ) {
        val isOnline by com.example.suseelacateringcrm.util.rememberIsOnline()
        // Refresh (api-contract "Refresh"): top-bar icon + pull-to-refresh on every screen.
        val pullState = rememberPullToRefreshState()
        if (pullState.isRefreshing) {
            LaunchedEffect(true) {
                RefreshController.refresh(ServiceLocator.firestore, isOnline)
                pullState.endRefresh()
            }
        }

        Scaffold(
            topBar = {
                Column {
                    TopAppBar(
                        title = { Text(title) },
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(Icons.Filled.Menu, contentDescription = L("మెనూ", "Menu"))
                            }
                        },
                        actions = {
                            IconButton(
                                onClick = { if (!pullState.isRefreshing) pullState.startRefresh() },
                                enabled = !RefreshController.refreshing,
                            ) {
                                Icon(Icons.Filled.Refresh, contentDescription = L("Refresh (మళ్ళీ తెచ్చు)", "Refresh"))
                            }
                        },
                    )
                    // App-wide error from background work (launchSafe) — tap to hide.
                    com.example.suseelacateringcrm.util.AppErrors.message?.let { err ->
                        Text(
                            err,
                            modifier = Modifier.fillMaxWidth()
                                .clickable { com.example.suseelacateringcrm.util.AppErrors.clear() }
                                .padding(horizontal = 16.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    val last = RefreshController.lastUpdated
                    val refreshMessage = RefreshController.message
                    if (refreshMessage != null) {
                        Text(
                            refreshMessage,
                            modifier = Modifier.fillMaxWidth().clickable { RefreshController.clearMessage() }.padding(horizontal = 16.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    } else if (last != null) {
                        Text(
                            L("చివరి update: ", "Last update: ") + last,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!isOnline) {
                        androidx.compose.material3.Surface(color = androidx.compose.material3.MaterialTheme.colorScheme.errorContainer) {
                            Text(
                                text = L("ఇంటర్నెట్ లేదు — సిగ్నల్ వచ్చాక మార్పులు పంపుతాం", "Offline — changes will sync when you're back online"),
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                                color = androidx.compose.material3.MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                }
            },
        ) { padding ->
            Box(Modifier.fillMaxSize().nestedScroll(pullState.nestedScrollConnection)) {
                content(padding)
                PullToRefreshContainer(
                    state = pullState,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = padding.calculateTopPadding()),
                )
            }
        }
    }
}

@Composable
private fun BranchSwitcher(
    role: UserRole?,
    viewModel: BranchSwitcherViewModel = viewModel(),
) {
    val branches by viewModel.branches.collectAsStateWithLifecycle()
    val currentBranchId by viewModel.currentBranchId.collectAsStateWithLifecycle()
    val currentBranchName = branches.find { it.id == currentBranchId }?.name

    if (role == UserRole.ADMIN) {
        var expanded by remember { mutableStateOf(false) }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = true }
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
            Text(
                text = currentBranchName ?: L("అన్ని branches", "All Branches"),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Filled.ArrowDropDown, contentDescription = "Switch branch")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(L("అన్ని branches", "All Branches")) },
                onClick = { viewModel.selectBranch(null); expanded = false },
            )
            branches.forEach { branch ->
                DropdownMenuItem(
                    text = { Text(branch.name) },
                    onClick = { viewModel.selectBranch(branch.id); expanded = false },
                )
            }
        }
    } else if (currentBranchName != null) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
            Text(text = currentBranchName, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
