package com.example.suseelacateringcrm.ui.customers

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.StatusChip
import com.example.suseelacateringcrm.ui.components.color
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@Composable
fun CustomerDetailScreen(
    customerId: String,
    padding: PaddingValues,
    role: UserRole?,
    onEdit: () -> Unit,
    onOpenBooking: (String) -> Unit,
) {
    val viewModel: CustomerDetailViewModel = viewModel(
        key = "customer-detail-$customerId",
        factory = viewModelFactory { initializer { CustomerDetailViewModel(customerId) } },
    )
    val customer by viewModel.customer.collectAsStateWithLifecycle()
    val bookings by viewModel.bookings.collectAsStateWithLifecycle()

    LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        item {
            customer?.let { c ->
                Column {
                    Text(c.name, style = MaterialTheme.typography.headlineSmall)
                    if (c.phone.isNotBlank()) Text(c.phone)
                    if (c.email.isNotBlank()) Text(c.email)
                    if (c.address.isNotBlank()) Text(c.address)
                    if (c.notes.isNotBlank()) Text(L("గమనికలు: ${c.notes}", "Notes: ${c.notes}"), style = MaterialTheme.typography.bodySmall)
                    Button(onClick = onEdit, modifier = Modifier.padding(top = 12.dp)) {
                        Text(L("Customer మార్చు", "Edit Customer"))
                    }
                    // R10-7: account statement (owner / manager).
                    if (role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN || role == com.example.suseelacateringcrm.data.model.UserRole.MANAGER) {
                        com.example.suseelacateringcrm.ui.owner.CustomerStatementButton(customerId)
                    }
                }
            }
            Text(
                "Bookings",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
            )
        }
        if (bookings.isEmpty()) {
            item { EmptyState(L("ఈ customer కి ఇంకా bookings లేవు.", "No bookings for this customer yet.")) }
        }
        items(bookings, key = { it.id }) { booking ->
            Card(
                onClick = { onOpenBooking(booking.id) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(booking.eventType.ifBlank { L("కార్యక్రమం", "Event") }, style = MaterialTheme.typography.titleSmall)
                    Text(DateUtils.formatDate(booking.eventDate))
                    StatusChip(
                        label = tr(booking.bookingStatus.label),
                        color = booking.bookingStatus.color(),
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        // Change history (owner only).
        if (role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN) {
            item { com.example.suseelacateringcrm.ui.history.HistorySection("customers", customerId) }
        }
    }
}
