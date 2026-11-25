package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.EventType
import com.example.suseelacateringcrm.data.model.StockDeduction
import com.example.suseelacateringcrm.data.model.StockLine
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.CalcModeChip
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtQty
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** One editable line for manual quantities (grocery item id → typed quantity). */
data class StockEditLine(val groceryItemId: String, val name: String, val unit: String, val quantityText: String)

class EventStockViewModel(private val bookingId: String) : ViewModel() {
    val role: UserRole? = ServiceLocator.currentRole()

    private val _deduction = MutableStateFlow<StockDeduction?>(null)
    val deduction: StateFlow<StockDeduction?> = _deduction.asStateFlow()

    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<Pair<String, Boolean>?>(null)
        private set

    /** Manual editor (null = closed). */
    var editLines by mutableStateOf<List<StockEditLine>?>(null)
        private set

    init {
        viewModelScope.launch {
            ServiceLocator.bookingRepository.bookingRawFlow(bookingId)
                .catchLogged("EventStockViewModel")
                .collect { raw -> _deduction.value = StockDeduction.from(raw?.get("stockDeduction")) }
        }
    }

    private fun done(r: Result<Unit>, okTe: String, okEn: String) {
        message = r.fold(
            onSuccess = { L(okTe, okEn) to false },
            onFailure = { CallableError.from(it).text to true },
        )
    }

    /** Automatic quantities now (auto-deduct off, or after a reverse). */
    fun applyAuto() {
        viewModelScope.launch {
            busy = true
            done(ServiceLocator.functions.applyEventStock(bookingId, null, null), "Stock తగ్గించాం ✓", "Stock deducted ✓")
            busy = false
        }
    }

    /** Open the manual editor: from the last deduction's lines, else from the grocery list for this event. */
    fun openEditor(booking: Booking) {
        val existing = _deduction.value?.items
        if (!existing.isNullOrEmpty()) {
            editLines = existing.map { StockEditLine(it.groceryItemId, it.name, it.unit, fmtQty(it.quantity)) }
            return
        }
        val guests = booking.guestCountActual.takeIf { it > 0 } ?: booking.guestCount
        if (guests < 1) {
            message = L("అతిథుల సంఖ్య లేదు", "The booking has no guest count") to true
            return
        }
        val eventCode = booking.eventTypeCode.ifBlank { EventType.guess(booking.eventType).code }
        viewModelScope.launch {
            busy = true
            ServiceLocator.functions.groceryList(guests, eventCode).fold(
                onSuccess = { list ->
                    editLines = list.map { StockEditLine(it.groceryItemId, L(it.nameTe.ifBlank { it.nameEn }, it.nameEn.ifBlank { it.nameTe }), it.unit, fmtQty(it.quantity)) }
                },
                onFailure = { message = CallableError.from(it).text to true },
            )
            busy = false
        }
    }

    fun closeEditor() {
        editLines = null
    }

    fun setLine(index: Int, text: String) {
        val lines = editLines ?: return
        editLines = lines.mapIndexed { i, l -> if (i == index) l.copy(quantityText = text) else l }
    }

    /** Manual quantities (≥ 0) + reason ≥ 3 chars → applyEventStock with items. */
    fun applyManual(reason: String) {
        val lines = editLines ?: return
        if (reason.trim().length < 3) {
            message = L("కారణం రాయండి (కనీసం 3 అక్షరాలు)", "Write a reason (at least 3 characters)") to true
            return
        }
        val items = mutableListOf<Pair<String, Double>>()
        for (l in lines) {
            val q = l.quantityText.trim().toDoubleOrNull()
            if (q == null || q < 0) {
                message = L("${l.name}: సరైన సంఖ్య (మైనస్ కాదు) రాయండి", "${l.name}: enter a number, not negative") to true
                return
            }
            items += l.groceryItemId to q
        }
        viewModelScope.launch {
            busy = true
            val r = ServiceLocator.functions.applyEventStock(bookingId, items, reason.trim())
            done(r, "చేతితో పెట్టిన పరిమాణాలతో stock తగ్గించాం ✓", "Stock deducted with manual quantities ✓")
            if (r.isSuccess) editLines = null
            busy = false
        }
    }

    fun reverse(reason: String) {
        if (reason.trim().length < 3) {
            message = L("కారణం రాయండి (కనీసం 3 అక్షరాలు)", "Write a reason (at least 3 characters)") to true
            return
        }
        viewModelScope.launch {
            busy = true
            done(ServiceLocator.functions.reverseEventStock(bookingId, reason.trim()), "Stock తిరిగి కలిపాం ✓", "Stock put back ✓")
            busy = false
        }
    }
}

/**
 * Booking detail "Stock" card (api-contract Round 6 A): what the event took out of stock, short-by
 * warnings, automatic/manual stamp; apply (owner + manager) and reverse (owner only).
 */
@Composable
fun EventStockCard(booking: Booking) {
    val viewModel: EventStockViewModel = viewModel(
        key = "event-stock-${booking.id}",
        factory = viewModelFactory { initializer { EventStockViewModel(booking.id) } },
    )
    val deduction by viewModel.deduction.collectAsStateWithLifecycle()
    val canApply = viewModel.role == UserRole.ADMIN || viewModel.role == UserRole.MANAGER
    val isAdmin = viewModel.role == UserRole.ADMIN
    var showReverse by remember { mutableStateOf(false) }
    var manualReason by remember { mutableStateOf("") }

    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.info).padding(16.dp)) {
        Text(L("Stock (ఈ కార్యక్రమానికి తీసినవి)", "Stock (taken for this event)"), style = MaterialTheme.typography.titleMedium)
        val d = deduction
        when {
            d == null -> {
                Text(
                    if (booking.bookingStatus == BookingStatus.COMPLETED)
                        L("ఇంకా stock తగ్గించలేదు.", "Stock has not been deducted yet.")
                    else L("కార్యక్రమం 'పూర్తి' అయ్యాక stock దానంతట అదే తగ్గుతుంది.", "Stock is deducted automatically when the event is marked Completed."),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            d.reversed -> NoticeBox(L("Stock తిరిగి కలిపాం (reverse).", "The deduction was reversed; stock was put back."), Tone.INFO)
            else -> {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        (if (d.byAuto) L("ఆటోమేటిక్‌గా", "Automatically") else d.byName) + " · " + DateUtils.formatDateTime(d.at),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    // Whole-deduction stamp; per-line automatic values are shown below.
                    CalcModeChip(info = d.calc, currentValue = null, canOverride = true, onOverride = null)
                }
                d.items.forEach { StockRow(it) }
                if (d.skipped.isNotEmpty()) {
                    Text(
                        L("Stock తో link లేనివి (తగ్గించలేదు): ", "Not linked to stock (skipped): ") + d.skipped.joinToString(", "),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }

        viewModel.message?.let { (text, isError) -> NoticeBox(text, if (isError) Tone.BAD else Tone.GOOD) }

        val editing = viewModel.editLines
        if (editing != null) {
            SectionLabel(L("చేతితో పరిమాణాలు", "Manual quantities"))
            editing.forEachIndexed { i, line ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${line.name} (${line.unit})", modifier = Modifier.weight(1f))
                    OutlinedTextField(
                        value = line.quantityText,
                        onValueChange = { viewModel.setLine(i, it) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.width(110.dp),
                    )
                }
            }
            AppTextField(manualReason, { manualReason = it }, L("కారణం (తప్పనిసరి)", "Reason (required)"))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                Button(onClick = { viewModel.applyManual(manualReason) }, enabled = !viewModel.busy) { Text(L("Stock తగ్గించు", "Deduct stock")) }
                TextButton(onClick = { viewModel.closeEditor() }) { Text(L("వద్దు", "Cancel")) }
            }
        } else if (canApply && (d == null || d.reversed)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                Button(onClick = { viewModel.applyAuto() }, enabled = !viewModel.busy) { Text(L("ఇప్పుడు తగ్గించు", "Deduct now")) }
                OutlinedButton(onClick = { viewModel.openEditor(booking) }, enabled = !viewModel.busy) { Text(L("చేతితో పరిమాణాలు", "Manual quantities")) }
            }
        }
        if (isAdmin && d != null && !d.reversed && editing == null) {
            OutlinedButton(onClick = { showReverse = true }, enabled = !viewModel.busy, modifier = Modifier.padding(top = 8.dp)) {
                Text(L("Stock తిరిగి కలుపు (reverse)", "Put stock back (reverse)"))
            }
        }
    }

    if (showReverse) {
        var reason by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showReverse = false },
            title = { Text(L("Stock తిరిగి కలపాలా?", "Put the stock back?")) },
            text = {
                Column {
                    Text(L("ఈ కార్యక్రమానికి తీసిన stock మళ్ళీ కలుపుతాం.", "The stock taken for this event will be added back."))
                    AppTextField(reason, { reason = it }, L("కారణం (తప్పనిసరి)", "Reason (required)"))
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.reverse(reason); showReverse = false }) { Text(L("సరే", "OK")) }
            },
            dismissButton = { TextButton(onClick = { showReverse = false }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}

@Composable
private fun StockRow(line: StockLine) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(line.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
            Text("${fmtQty(line.quantity)} ${line.unit}", style = MaterialTheme.typography.bodyLarge)
        }
        val auto = line.autoValue
        if (auto != null && kotlin.math.abs(auto - line.quantity) > 0.0001) {
            Text(L("ఆటోమేటిక్ లెక్క: ${fmtQty(auto)} ${line.unit}", "Automatic: ${fmtQty(auto)} ${line.unit}"), style = MaterialTheme.typography.bodySmall)
        }
        if (line.shortBy > 0) {
            Text(
                L("Stock సరిపోలేదు — ${fmtQty(line.shortBy)} ${line.unit} తక్కువ", "Not enough stock — short by ${fmtQty(line.shortBy)} ${line.unit}"),
                color = SuseelaTheme.colors.bad,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
