package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingEditScreen(
    bookingId: String?,
    role: UserRole?,
    padding: PaddingValues,
    onDone: () -> Unit,
) {
    val viewModel: BookingEditViewModel = viewModel(
        key = "booking-edit-$bookingId",
        factory = viewModelFactory { initializer { BookingEditViewModel(bookingId) } },
    )

    LaunchedEffect(viewModel.saveState) {
        if (viewModel.saveState is UiState.Success) onDone()
    }

    if (viewModel.loading) {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    val customers by viewModel.customers.collectAsStateWithLifecycle()
    val menuItems by viewModel.menuItems.collectAsStateWithLifecycle()
    var customerMenuExpanded by remember { mutableStateOf(false) }
    var statusMenuExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(if (bookingId == null) L("కొత్త booking", "New Booking") else L("Booking మార్చు", "Edit Booking"), style = MaterialTheme.typography.titleLarge)
        if (viewModel.locked) {
            com.example.suseelacateringcrm.ui.components.NoticeBox(
                L("ఈ కార్యక్రమం ముగించారు / రద్దు చేశారు — మార్చలేం.", "This event is closed or cancelled — it can't be edited."),
                com.example.suseelacateringcrm.ui.components.Tone.WARNING,
            )
        }

        ExposedDropdownMenuBox(expanded = customerMenuExpanded, onExpandedChange = { customerMenuExpanded = it }) {
            OutlinedTextField(
                value = viewModel.customerName,
                onValueChange = {},
                readOnly = true,
                label = { Text("Customer") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = customerMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = customerMenuExpanded, onDismissRequest = { customerMenuExpanded = false }) {
                if (customers.isEmpty()) {
                    DropdownMenuItem(text = { Text(L("Customers లేరు — ముందు ఒకరిని జోడించండి", "No customers yet — add one first")) }, onClick = {})
                }
                customers.forEach { customer ->
                    DropdownMenuItem(text = { Text(customer.name) }, onClick = {
                        viewModel.selectCustomer(customer)
                        customerMenuExpanded = false
                    })
                }
            }
        }

        AppDatePickerField(label = L("కార్యక్రమం తేదీ", "Event date"), date = viewModel.eventDate, onDateSelected = { viewModel.eventDate = it })
        var eventCodeExpanded by remember { mutableStateOf(false) }
        ExposedDropdownMenuBox(expanded = eventCodeExpanded, onExpandedChange = { eventCodeExpanded = it }) {
            OutlinedTextField(
                value = com.example.suseelacateringcrm.data.model.EventType.from(viewModel.eventTypeCode).label,
                onValueChange = {},
                readOnly = true,
                label = { Text(L("కార్యక్రమం రకం", "Event type")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = eventCodeExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = eventCodeExpanded, onDismissRequest = { eventCodeExpanded = false }) {
                com.example.suseelacateringcrm.data.model.EventType.entries.forEach { t ->
                    DropdownMenuItem(text = { Text(t.label) }, onClick = {
                        viewModel.eventTypeCode = t.code
                        eventCodeExpanded = false
                    })
                }
            }
        }
        AppTextField(value = viewModel.eventType, onValueChange = { viewModel.eventType = it }, label = L("కార్యక్రమం వివరణ (ఐచ్ఛికం)", "Event description (optional)"))
        AppTextField(value = viewModel.venue, onValueChange = { viewModel.venue = it }, label = L("వేదిక", "Venue"))

        // Service timeline inputs: meal, serving time, travel minutes (api-contract Round 6 C).
        Text(L("భోజనం రకం", "Meal"), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
        com.example.suseelacateringcrm.ui.components.ChoiceChips(
            options = listOf("tiffin", "lunch", "dinner", "lunch-dinner", "other"),
            selected = viewModel.mealType,
            label = { mealLabel(it) },
            onSelect = { viewModel.selectMealType(it) },
        )
        ServiceStylePicker(viewModel.serviceStyle, { viewModel.serviceStyle = it }, Modifier.padding(top = 8.dp))
        if (viewModel.sessions.isEmpty()) {
            KidsAndSpecialMealsEditor(viewModel.kidsCount, viewModel.specialMeals) { k, m -> viewModel.kidsCount = k; viewModel.specialMeals = m }
        }
        var showTimePicker by remember { mutableStateOf(false) }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
            Text(L("వడ్డించే సమయం: ", "Serving time: ") + viewModel.serveTime, modifier = Modifier.weight(1f))
            androidx.compose.material3.OutlinedButton(onClick = { showTimePicker = true }) { Text(L("మార్చు", "Change")) }
        }
        if (showTimePicker) {
            ServeTimeDialog(
                initial = viewModel.serveTime,
                onPicked = { h, m -> viewModel.pickServeTime(h, m); showTimePicker = false },
                onDismiss = { showTimePicker = false },
            )
        }
        AppTextField(
            value = viewModel.travelMinutesText,
            onValueChange = { viewModel.travelMinutesText = it.filter(Char::isDigit).take(3) },
            label = L("venue కి ప్రయాణం (నిమిషాలు)", "Travel to venue (minutes)"),
            keyboardType = KeyboardType.Number,
        )
        AppTextField(
            value = viewModel.guestCountText,
            onValueChange = { viewModel.onGuestCountChanged(it) },
            label = L("అతిథుల సంఖ్య", "Guest count"),
            keyboardType = KeyboardType.Number,
        )

        // Menu package: plate price for the estimate, meal type and default serving time.
        val packages by viewModel.packages.collectAsStateWithLifecycle()
        SessionsEditorSection(
            sessions = viewModel.sessions,
            packages = packages,
            defaultServiceStyle = viewModel.serviceStyle,
            onSave = { viewModel.saveSession(it) },
            onRemove = { viewModel.removeSession(it) },
        )
        var packageExpanded by remember { mutableStateOf(false) }
        ExposedDropdownMenuBox(expanded = packageExpanded, onExpandedChange = { packageExpanded = it }) {
            OutlinedTextField(
                value = packages.find { it.id == viewModel.packageId }?.let { "${it.name} · ${CurrencyUtils.formatInr(it.pricePerPlate)}" }
                    ?: L("మెనూ ప్యాకేజీ లేదు", "No menu package"),
                onValueChange = {},
                readOnly = true,
                label = { Text(L("మెనూ ప్యాకేజీ", "Menu package")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = packageExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = packageExpanded, onDismissRequest = { packageExpanded = false }) {
                DropdownMenuItem(text = { Text(L("మెనూ ప్యాకేజీ లేదు", "No menu package")) }, onClick = {
                    viewModel.choosePackage("")
                    packageExpanded = false
                })
                packages.forEach { p ->
                    DropdownMenuItem(text = { Text("${p.name} · ${CurrencyUtils.formatInr(p.pricePerPlate)}") }, onClick = {
                        viewModel.choosePackage(p.id)
                        packageExpanded = false
                    })
                }
            }
        }

        Text(L("అదనపు వంటకాలు", "Extra menu items"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        menuItems.forEach { item ->
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = item.id in viewModel.selectedMenuItemIds,
                    onCheckedChange = { viewModel.toggleMenuItem(item.id) },
                )
                Text("${item.name} — ${CurrencyUtils.formatInr(item.pricePerPlate)}")
            }
        }

        AppTextField(
            value = viewModel.totalAmountText,
            onValueChange = { viewModel.onTotalAmountEditedManually(it) },
            label = L("మొత్తం (₹)", "Total amount (₹)"),
            keyboardType = KeyboardType.Decimal,
        )
        AppTextField(
            value = viewModel.advancePaidText,
            onValueChange = { viewModel.advancePaidText = it },
            label = L("అడ్వాన్స్ ఇచ్చింది (₹)", "Advance paid (₹)"),
            keyboardType = KeyboardType.Decimal,
        )

        if (bookingId != null) {
            ExposedDropdownMenuBox(expanded = statusMenuExpanded, onExpandedChange = { statusMenuExpanded = it }) {
                OutlinedTextField(
                    value = viewModel.status.label,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("స్థితి", "Status")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = statusMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = statusMenuExpanded, onDismissRequest = { statusMenuExpanded = false }) {
                    // Cancel / close have their own buttons on the booking page (cancelRecord / closeEvent).
                    BookingStatus.entries.filter { it != BookingStatus.CANCELLED && it != BookingStatus.CLOSED }.forEach { status ->
                        DropdownMenuItem(text = { Text(tr(status.label)) }, onClick = {
                            viewModel.status = status
                            statusMenuExpanded = false
                        })
                    }
                }
            }
        }

        AppTextField(value = viewModel.notes, onValueChange = { viewModel.notes = it }, label = L("గమనికలు", "Notes"), singleLine = false)

        val saveState = viewModel.saveState
        if (saveState is UiState.Error) {
            Text(saveState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }

        Button(
            onClick = { viewModel.save() },
            modifier = Modifier.padding(top = 16.dp),
            enabled = saveState !is UiState.Loading,
        ) {
            Text(L("సేవ్ చేయి", "Save"))
        }
    }
}

private fun mealLabel(type: String): String = when (type) {
    "tiffin" -> L("టిఫిన్", "Tiffin")
    "lunch" -> L("లంచ్", "Lunch")
    "dinner" -> L("డిన్నర్", "Dinner")
    "lunch-dinner" -> L("లంచ్ / డిన్నర్", "Lunch / Dinner")
    else -> L("ఇతర", "Other")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ServeTimeDialog(initial: String, onPicked: (Int, Int) -> Unit, onDismiss: () -> Unit) {
    val h = initial.take(2).toIntOrNull()?.coerceIn(0, 23) ?: 12
    val m = initial.drop(3).take(2).toIntOrNull()?.coerceIn(0, 59) ?: 0
    val state = androidx.compose.material3.rememberTimePickerState(initialHour = h, initialMinute = m, is24Hour = true)
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("వడ్డించే సమయం", "Serving time")) },
        text = { androidx.compose.material3.TimePicker(state = state) },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { onPicked(state.hour, state.minute) }) { Text(L("సరే", "OK")) } },
        dismissButton = { androidx.compose.material3.TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
