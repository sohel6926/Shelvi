package com.example.suseelacateringcrm.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.SupervisorAccount
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.L

private data class DashboardTile(
    val label: String,
    val icon: ImageVector,
    val adminOnly: Boolean = false,
    /** Admin + manager (hidden from staff — security rules deny them these collections). */
    val managerToo: Boolean = false,
    val onClick: () -> Unit,
)

private val PastelPalette = listOf(
    Color(0xFFFBD8D8), // soft pink
    Color(0xFFE2D9F7), // soft lavender
    Color(0xFFD9ECFB), // soft blue
    Color(0xFFFCF1D0), // soft yellow
    Color(0xFFDCF3DC), // soft green
    Color(0xFFFCE1EE), // soft rose
    Color(0xFFDCEFF2), // soft teal
    Color(0xFFF6E3D6), // soft peach
    Color(0xFFE6E6FA), // soft periwinkle
    Color(0xFFE0F2E9), // soft mint
)

private val PastelOnColor = Color(0xFF3A2E2E)

@Composable
fun DashboardScreen(
    role: UserRole?,
    padding: PaddingValues,
    onNavigateCustomers: () -> Unit,
    onNavigateBookings: () -> Unit,
    onNavigateMenu: () -> Unit,
    onNavigateInventory: () -> Unit,
    onNavigateInvoices: () -> Unit,
    onNavigateQuotations: () -> Unit,
    onNavigateStaff: () -> Unit,
    onNavigateUsers: () -> Unit,
    onNavigateReports: () -> Unit,
    onNavigatePurchases: () -> Unit,
    onNavigateExpenses: () -> Unit,
    onNavigateCalendar: () -> Unit,
    onNavigateVendors: () -> Unit,
    onNavigateOwnerReports: () -> Unit = {},
    onOpenBooking: (String) -> Unit = {},
    viewModel: DashboardViewModel = viewModel(),
) {
    val summary by viewModel.summary.collectAsStateWithLifecycle()

    val tiles = listOf(
        DashboardTile(L("Customers", "Customers"), Icons.Filled.People, managerToo = true, onClick = onNavigateCustomers),
        DashboardTile(L("Bookings", "Bookings"), Icons.Filled.CalendarMonth, onClick = onNavigateBookings),
        DashboardTile(L("క్యాలెండర్", "Calendar"), Icons.Filled.CalendarMonth, onClick = onNavigateCalendar),
        DashboardTile(L("వంటకాలు & ధరలు", "Menu & Pricing"), Icons.Filled.Restaurant, onClick = onNavigateMenu),
        DashboardTile(L("స్టాక్", "Inventory"), Icons.Filled.Inventory, onClick = onNavigateInventory),
        DashboardTile(L("ఇన్వాయిస్‌లు", "Billing & Invoices"), Icons.Filled.Receipt, managerToo = true, onClick = onNavigateInvoices),
        DashboardTile(L("కొటేషన్లు", "Quotations"), Icons.Filled.RequestQuote, managerToo = true, onClick = onNavigateQuotations),
        DashboardTile(L("సిబ్బంది", "Staff"), Icons.Filled.SupervisorAccount, adminOnly = true, onClick = onNavigateStaff),
        DashboardTile(L("కొనుగోళ్లు", "Purchases"), Icons.Filled.ShoppingCart, adminOnly = true, onClick = onNavigatePurchases),
        DashboardTile(L("Vendors", "Vendors"), Icons.Filled.Storefront, adminOnly = true, onClick = onNavigateVendors),
        DashboardTile(L("ఖర్చులు", "Expenses"), Icons.Filled.RequestQuote, onClick = onNavigateExpenses),
        DashboardTile(L("Users", "User Management"), Icons.Filled.People, adminOnly = true, onClick = onNavigateUsers),
        DashboardTile(L("రిపోర్టులు", "Reports"), Icons.Filled.Assessment, adminOnly = true, onClick = onNavigateReports),
    ).filter {
        when {
            it.adminOnly -> role == UserRole.ADMIN
            it.managerToo -> role == UserRole.ADMIN || role == UserRole.MANAGER
            else -> true
        }
    }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.padding(padding),
    ) {
        // Calendar first: today's count, then today / tomorrow / this week / later.
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            TodayCard(count = summary.agenda.count { it.daysFromToday == 0 })
        }
        val groups = listOf(
            Triple(L("ఈ రోజు", "Today"), 0, 0),
            Triple(L("రేపు", "Tomorrow"), 1, 1),
            Triple(L("ఈ వారం", "This week"), 2, 6),
            Triple(L("తర్వాత", "Later"), 7, Int.MAX_VALUE),
        )
        groups.forEach { (title, from, to) ->
            val rows = summary.agenda.filter { it.daysFromToday in from..to }
            if (rows.isNotEmpty()) {
                item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                    AgendaGroup(title = title, rows = rows, showDate = from >= 2, onOpen = onOpenBooking)
                }
            }
        }
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            SummaryCard(role = role, summary = summary)
        }
        // R10-10: owner sees this month's cancellations card.
        if (role == UserRole.ADMIN) {
            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
                com.example.suseelacateringcrm.ui.owner.CancellationsCard(onOpen = onNavigateOwnerReports)
            }
        }
        itemsIndexed(tiles) { index, tile ->
            PastelDashboardCard(tile = tile, backgroundColor = PastelPalette[index % PastelPalette.size])
        }
    }
}

private val DueRed = Color(0xFFB42318)

/** "13:30" -> "1:30 PM"; blank when not set. */
private fun serveClock(hhmm: String): String {
    val parts = hhmm.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: return ""
    val m = parts.getOrNull(1)?.toIntOrNull() ?: return ""
    val h12 = if (h % 12 == 0) 12 else h % 12
    return "$h12:${m.toString().padStart(2, '0')} ${if (h >= 12) "PM" else "AM"}"
}

@Composable
private fun TodayCard(count: Int) {
    Card(
        modifier = Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp)),
        colors = CardDefaults.cardColors(containerColor = if (count > 0) Color(0xFFDCF3DC) else Color(0xFFF1EFEA)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        androidx.compose.foundation.layout.Column(modifier = Modifier.padding(16.dp)) {
            Text(L("ఈ రోజు కార్యక్రమాలు", "Events today"), style = MaterialTheme.typography.titleMedium)
            Text(count.toString(), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun AgendaGroup(title: String, rows: List<AgendaEvent>, showDate: Boolean, onOpen: (String) -> Unit) {
    androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = Color(0xFF8A5300))
        rows.forEach { event ->
            Card(
                onClick = { onOpen(event.bookingId) },
                modifier = Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp)),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBF2)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            ) {
                androidx.compose.foundation.layout.Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(72.dp)) {
                        Text(
                            serveClock(event.serveTime).ifBlank { com.example.suseelacateringcrm.util.DateUtils.formatDate(event.eventDate) },
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (showDate && event.serveTime.isNotBlank()) {
                            Text(com.example.suseelacateringcrm.util.DateUtils.formatDate(event.eventDate), style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    androidx.compose.foundation.layout.Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "${event.customerName.ifBlank { L("పేరు లేదు", "Unnamed") }} — ${event.eventType.ifBlank { L("కార్యక్రమం", "Event") }}",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        )
                        val where = if (event.venue.isBlank()) "" else event.venue + " · "
                        Text(where + L("${event.guestCount} మంది", "${event.guestCount} guests"), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        if (event.dueAmount > 0) {
                            Text(
                                CurrencyUtils.formatInr(event.dueAmount) + " " + L("బాకీ", "due"),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = DueRed,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PastelDashboardCard(tile: DashboardTile, backgroundColor: Color) {
    Card(
        onClick = tile.onClick,
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1.15f)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp)),
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            Text(
                text = tile.label,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = PastelOnColor,
                modifier = Modifier.align(Alignment.TopStart),
            )
            Icon(
                imageVector = tile.icon,
                contentDescription = null,
                tint = PastelOnColor,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(36.dp),
            )
        }
    }
}

@Composable
private fun SummaryCard(role: UserRole?, summary: DashboardSummary) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp)),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        androidx.compose.foundation.layout.Column(modifier = Modifier.padding(16.dp)) {
            Text(L("సారాంశం", "Overview"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(4.dp))
            Text(L("రాబోయే bookings: ", "Upcoming bookings: ") + summary.upcomingBookings)
            if (role == UserRole.ADMIN || role == UserRole.MANAGER) {
                Text(L("రావాల్సిన బాకీలు: ", "Pending dues: ") + CurrencyUtils.formatInr(summary.pendingDuesTotal))
            }
            Text(L("తక్కువ stock: ", "Low stock items: ") + summary.lowStockCount)
        }
    }

}
