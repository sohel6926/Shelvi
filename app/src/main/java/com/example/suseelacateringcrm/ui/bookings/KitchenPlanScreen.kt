package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L

@Composable
fun KitchenPlanScreen(
    bookingId: String,
    padding: PaddingValues,
) {
    val viewModel: KitchenPlanViewModel = viewModel(
        key = "kitchen-plan-$bookingId",
        factory = viewModelFactory { initializer { KitchenPlanViewModel(bookingId) } },
    )

    if (viewModel.loading) {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    val booking = viewModel.booking ?: run {
        EmptyState(L("Booking దొరకలేదు.", "Booking not found."), modifier = Modifier.padding(padding).fillMaxSize())
        return
    }
    val requirements by viewModel.requirements.collectAsStateWithLifecycle()

    LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        item {
            Card(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(booking.customerNameSnapshot.ifBlank { L("పేరు లేని customer", "Unnamed customer") }, style = MaterialTheme.typography.titleMedium)
                    Text("${booking.eventType.ifBlank { "Event" }} · ${DateUtils.formatDate(booking.eventDate)}")
                    Text(L("${booking.guestCount} మంది", "${booking.guestCount} guests"))
                }
            }
            Text(L("కావాల్సిన సరుకులు", "Raw material requirement"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(bottom = 8.dp))
        }

        if (booking.menuItemIds.isEmpty()) {
            item { EmptyState(L("ఈ booking లో వంటకాలు ఎంచుకోలేదు.", "This booking has no menu items selected.")) }
        } else if (!viewModel.hasRecipes) {
            item {
                Text(
                    L("ఎంచుకున్న వంటకాలకు recipe లేదు. వంటకాలు & ధరలు → వంటకం మార్చు లో సరుకులు జోడించండి.", "None of the selected menu items have a recipe set up yet. Add ingredients to a menu item (Menu & Pricing → edit item) to see requirements here."),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        } else if (requirements.isEmpty()) {
            item { EmptyState(L("సరుకులు అవసరం లేదు.", "No ingredients required.")) }
        } else {
            items(requirements, key = { it.inventoryItemId }) { req ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(req.name, style = MaterialTheme.typography.titleSmall)
                        Text(L("కావాలి: ${req.requiredQuantity} ${req.unit}", "Required: ${req.requiredQuantity} ${req.unit}"))
                        Text(L("ఉన్న stock: ${req.currentStock} ${req.unit}", "Current stock: ${req.currentStock} ${req.unit}"))
                        if (req.shortage > 0) {
                            Text(
                                L("${req.shortage} ${req.unit} తక్కువ", "Short by ${req.shortage} ${req.unit}"),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        } else {
                            Text(L("stock సరిపోతుంది", "Sufficient stock"), color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}
