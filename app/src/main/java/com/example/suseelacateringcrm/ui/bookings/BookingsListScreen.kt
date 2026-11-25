package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.StatusChip
import com.example.suseelacateringcrm.ui.components.color
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@Composable
fun BookingsListScreen(
    padding: PaddingValues,
    onAddBooking: () -> Unit,
    onOpenBooking: (String) -> Unit,
    /** Staff can't create bookings (security rules) — the + button is hidden for them. */
    canCreate: Boolean = true,
    viewModel: BookingsListViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var statusFilter by remember { mutableStateOf<BookingStatus?>(null) }
    var showCancelled by remember { mutableStateOf(false) }

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    FilterChip(selected = statusFilter == null, onClick = { statusFilter = null }, label = { Text(L("అన్నీ", "All")) })
                }
                items(BookingStatus.entries.toList()) { status ->
                    FilterChip(
                        selected = statusFilter == status,
                        onClick = { statusFilter = if (statusFilter == status) null else status },
                        label = { Text(tr(status.label)) },
                    )
                }
            }

            when (val s = state) {
                is UiState.Loading -> LoadingIndicator()
                is UiState.Error -> ErrorBanner(s.message)
                is UiState.Success -> {
                    // R7-3: "All" hides cancelled bookings unless the toggle is on.
                    com.example.suseelacateringcrm.ui.components.ShowCancelledToggle(showCancelled, { showCancelled = it })
                    val filtered = s.data.filter {
                        if (statusFilter == null) showCancelled || it.bookingStatus != BookingStatus.CANCELLED
                        else it.bookingStatus == statusFilter
                    }
                    if (filtered.isEmpty()) {
                        EmptyState(
                            if (com.example.suseelacateringcrm.di.ServiceLocator.staffScopeId() != null) L("మీకు కేటాయించిన events లేవు", "No events assigned to you")
                            else L("Bookings లేవు.", "No bookings found."),
                        )
                    } else {
                        LazyColumn(contentPadding = PaddingValues(16.dp)) {
                            items(filtered, key = { it.id }) { booking ->
                                BookingRow(booking = booking, onClick = { onOpenBooking(booking.id) })
                            }
                        }
                    }
                }
            }
        }

        if (canCreate) FloatingActionButton(
            onClick = onAddBooking,
            modifier = Modifier.padding(24.dp).align(Alignment.BottomEnd),
        ) {
            Icon(Icons.Filled.Add, contentDescription = L("కొత్త booking", "Add booking"))
        }
    }
}

@Composable
private fun BookingRow(booking: Booking, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(booking.customerNameSnapshot.ifBlank { L("పేరు లేని customer", "Unnamed customer") }, style = MaterialTheme.typography.titleMedium)
            Text("${booking.eventType.ifBlank { "Event" }} · ${DateUtils.formatDate(booking.eventDate)}")
            Text(L("${booking.guestCount} మంది · ${CurrencyUtils.formatInr(booking.totalAmount)}", "${booking.guestCount} guests · ${CurrencyUtils.formatInr(booking.totalAmount)}"))
            StatusChip(label = tr(booking.bookingStatus.label), color = booking.bookingStatus.color())
        }
    }
}
