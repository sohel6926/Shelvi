package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.RoleGate
import com.example.suseelacateringcrm.ui.components.StatusChip
import com.example.suseelacateringcrm.ui.components.color
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingDetailScreen(
    bookingId: String,
    role: UserRole?,
    padding: PaddingValues,
    onEdit: () -> Unit,
    onGenerateInvoice: () -> Unit,
    onGenerateQuotation: () -> Unit,
    onOpenInvoice: (String) -> Unit = {},
    onOpenKitchenPlan: () -> Unit,
    onOpenEquipment: () -> Unit = {},
    onOpenEventPlan: () -> Unit = {},
    onOpenCookLog: () -> Unit = {},
) {
    val viewModel: BookingDetailViewModel = viewModel(
        key = "booking-detail-$bookingId",
        factory = viewModelFactory { initializer { BookingDetailViewModel(bookingId) } },
    )
    val booking by viewModel.booking.collectAsStateWithLifecycle()
    val staffList by viewModel.staffList.collectAsStateWithLifecycle()

    val currentBooking = booking ?: run {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    var statusMenuExpanded by remember { mutableStateOf(false) }
    var editableStatus by remember(currentBooking.id) { mutableStateOf(currentBooking.bookingStatus) }
    var editableNotes by remember(currentBooking.id) { mutableStateOf(currentBooking.notes) }
    var showAssignDialog by remember { mutableStateOf(false) }
    val ops = rememberEventOps(bookingId)

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(currentBooking.customerNameSnapshot.ifBlank { L("పేరు లేని customer", "Unnamed customer") }, style = MaterialTheme.typography.headlineSmall)
        StatusChip(label = tr(currentBooking.bookingStatus.label), color = currentBooking.bookingStatus.color())
        CancelledBand(currentBooking, role)
        Text("${currentBooking.eventType.ifBlank { "Event" }} · ${DateUtils.formatDate(currentBooking.eventDate)}")
        if (currentBooking.venue.isNotBlank()) Text(L("వేదిక: ${currentBooking.venue}", "Venue: ${currentBooking.venue}"))
        Text(L("${currentBooking.guestCount} మంది", "${currentBooking.guestCount} guests"))
        Text(L("మొత్తం: ${CurrencyUtils.formatInr(currentBooking.totalAmount)}", "Total: ${CurrencyUtils.formatInr(currentBooking.totalAmount)}"))
        Text(L("అడ్వాన్స్: ${CurrencyUtils.formatInr(currentBooking.advancePaid)}", "Advance paid: ${CurrencyUtils.formatInr(currentBooking.advancePaid)}"))
        if (currentBooking.menuSnapshot.isNotEmpty()) {
            Text(L("మెనూ", "Menu"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            currentBooking.menuSnapshot.forEach { item ->
                Text(L("• ${item.name} (ప్లేట్ ${CurrencyUtils.formatInr(item.pricePerPlate)})", "• ${item.name} (${CurrencyUtils.formatInr(item.pricePerPlate)}/plate)"))
            }
        }

        OutlinedButton(onClick = onOpenKitchenPlan, modifier = Modifier.padding(top = 8.dp)) {
            Text(L("వంటగది సిద్ధత లిస్ట్", "Kitchen Prep List"))
        }
        // Round 8: learning cooking plan (eventPlan) and the cook log after the event.
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onOpenEventPlan) { Text(L("వంట plan", "Cooking plan")) }
            OutlinedButton(onClick = onOpenCookLog) { Text(L("వంట లాగ్", "Cook log")) }
        }
        if (currentBooking.serviceStyle.isBlank() && currentBooking.sessions.none { it.serviceStyle.isNotBlank() }) {
            Text(L("వడ్డన విధానం: ఎంచుకోలేదు (Booking మార్చు లో బంతి భోజనం / బఫే ఎంచుకోండి)", "Service style not chosen (pick banthi / buffet in Edit Booking)"),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        } else if (currentBooking.serviceStyle.isNotBlank()) {
            Text(L("వడ్డన: ", "Service: ") + serviceStyleLabel(currentBooking.serviceStyle), style = MaterialTheme.typography.bodySmall)
        }

        // Round 7: messages, event-day buttons (guest count / extras), meal sessions, vessels out, close.
        EventOpsMessage(ops)
        EventDayCard(currentBooking, role, ops)
        SessionsCard(currentBooking, ops)
        // Who does what, when — counted back from the serving time (calc §12, display only).
        BookingTimelineCard(currentBooking)
        VesselsOutCard(ops, onOpenEquipment)
        CloseEventCard(currentBooking, role, ops)
        // Stock taken for this event (owner + manager; staff can't read stock data here).
        if (role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN || role == com.example.suseelacateringcrm.data.model.UserRole.MANAGER) {
            EventStockCard(currentBooking)
        }

        Text(L("కేటాయించిన సిబ్బంది", "Assigned staff"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        val assignedNames = staffList.filter { it.id in currentBooking.assignedStaffIds }.map { it.name }
        Text(if (assignedNames.isEmpty()) L("ఎవరూ లేరు", "None assigned") else assignedNames.joinToString(", "))
        RoleGate(currentRole = role, allow = com.example.suseelacateringcrm.data.model.UserRole.ADMIN_AND_MANAGER) {
            OutlinedButton(onClick = { showAssignDialog = true }, modifier = Modifier.padding(top = 4.dp)) {
                Text(L("సిబ్బందిని కేటాయించు", "Assign Staff"))
            }
        }

        Text(L("స్థితి మార్చు", "Update status"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
        ExposedDropdownMenuBox(expanded = statusMenuExpanded, onExpandedChange = { statusMenuExpanded = it }) {
            OutlinedTextField(
                value = editableStatus.label,
                onValueChange = {},
                readOnly = true,
                label = { Text(L("స్థితి", "Status")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = statusMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = statusMenuExpanded, onDismissRequest = { statusMenuExpanded = false }) {
                // Cancel / close use their own buttons (cancelRecord / closeEvent).
                BookingStatus.entries.filter { it != BookingStatus.CANCELLED && it != BookingStatus.CLOSED }.forEach { status ->
                    DropdownMenuItem(text = { Text(tr(status.label)) }, onClick = {
                        editableStatus = status
                        statusMenuExpanded = false
                    })
                }
            }
        }
        AppTextField(value = editableNotes, onValueChange = { editableNotes = it }, label = L("గమనికలు", "Notes"), singleLine = false)
        Button(
            enabled = currentBooking.closed == null && currentBooking.bookingStatus != BookingStatus.CANCELLED,
            onClick = { viewModel.updateStatusAndNotes(editableStatus.label, editableNotes) },
        ) {
            Text(L("మార్చు", "Update"))
        }

        // Manager runs bookings too (edit, quotation, invoice) — security rules allow A and M.
        RoleGate(currentRole = role, allow = com.example.suseelacateringcrm.data.model.UserRole.ADMIN_AND_MANAGER) {
            Column(modifier = Modifier.padding(top = 16.dp)) {
                Button(onClick = onEdit) { Text(L("Booking మార్చు", "Edit Booking")) }
                Button(
                    onClick = onGenerateQuotation,
                    enabled = currentBooking.bookingStatus != BookingStatus.CANCELLED,
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    Text(L("కొటేషన్ తయారు చేయి", "Generate Quotation"))
                }
                // QA fix 4: "బిల్ తయారు చేయి" when there is a quotation (or a confirmed booking with its menu) and no
                // live bill yet; once the bill exists, open it to record the advance.
                val bill by viewModel.bill.collectAsStateWithLifecycle()
                if (bill.liveInvoiceId.isNotBlank()) {
                    Button(onClick = { onOpenInvoice(bill.liveInvoiceId) }, modifier = Modifier.padding(top = 8.dp)) {
                        Text(L("బిల్ ${bill.liveInvoiceNumber} — అడ్వాన్స్ నమోదు", "Bill ${bill.liveInvoiceNumber} — record advance"))
                    }
                } else {
                    Button(
                        onClick = onGenerateInvoice,
                        enabled = bill.loaded && currentBooking.closed == null && currentBooking.bookingStatus != BookingStatus.CANCELLED &&
                            (bill.hasQuote || currentBooking.bookingStatus == BookingStatus.CONFIRMED || currentBooking.bookingStatus == BookingStatus.COMPLETED),
                        modifier = Modifier.padding(top = 8.dp),
                    ) {
                        Text(L("బిల్ తయారు చేయి", "Make bill"))
                    }
                }
                // Round 9: "ఆర్డర్ రద్దు" (cancelBooking with money step) and "తేదీ మార్చు" (postpone).
                CancelOrPostponeButtons(currentBooking, role, ops)
            }
        }
        // Change history (owner only).
        if (role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN) {
            // Module 2i: standard / estimated / actual cost (owner only).
            CostCompareCard(currentBooking.id)
            com.example.suseelacateringcrm.ui.history.HistorySection("bookings", currentBooking.id)
        }
    }

    if (showAssignDialog) {
        var selected by remember { mutableStateOf(currentBooking.assignedStaffIds) }
        AlertDialog(
            onDismissRequest = { showAssignDialog = false },
            title = { Text(L("సిబ్బందిని కేటాయించు", "Assign Staff")) },
            text = {
                Column {
                    staffList.filter { it.active }.forEach { staff ->
                        Row {
                            Checkbox(
                                checked = staff.id in selected,
                                onCheckedChange = { checked ->
                                    selected = if (checked) selected + staff.id else selected - staff.id
                                },
                            )
                            Text(staff.name, modifier = Modifier.padding(top = 12.dp))
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.assignStaff(selected)
                    showAssignDialog = false
                }) { Text(L("సేవ్ చేయి", "Save")) }
            },
            dismissButton = {
                TextButton(onClick = { showAssignDialog = false }) { Text(L("వద్దు", "Cancel")) }
            },
        )
    }
}
