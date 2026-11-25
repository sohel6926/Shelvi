package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.EquipmentMove
import com.example.suseelacateringcrm.data.model.EventExtra
import com.example.suseelacateringcrm.data.model.GuestLogEntry
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.model.outstandingOf
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.ServiceTimelineResult
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.snapshotsFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Round 7 event-day work on the booking page: meal sessions + their timelines (R7-5), live guest count and
 * extra items (R7-7), vessels still out (R7-4), cancel (R7-3), close / reopen (R7-9). All writes are callables.
 */
class EventOpsViewModel(private val bookingId: String) : ViewModel() {
    private val db = ServiceLocator.firestore
    private val fn = ServiceLocator.functions

    var guestLog by mutableStateOf<List<GuestLogEntry>>(emptyList())
        private set
    var extras by mutableStateOf<List<EventExtra>>(emptyList())
        private set
    var moves by mutableStateOf<List<EquipmentMove>>(emptyList())
        private set

    /** Message after an action: text + isError. */
    var message by mutableStateOf<Pair<String, Boolean>?>(null)
        private set
    var busy by mutableStateOf(false)
        private set

    /** Blockers returned by closeEvent (Telugu / English). */
    var blockers by mutableStateOf<List<Pair<String, String>>>(emptyList())
        private set

    val sessionTimelines = mutableStateMapOf<String, UiState<ServiceTimelineResult>>()

    init {
        val booking = db.collection(FirestoreCollections.BOOKINGS).document(bookingId)
        viewModelScope.launch {
            booking.collection("guestLog").snapshotsFlow()
                .map { q -> q.documents.map { GuestLogEntry.fromMap(it.id, it.data ?: emptyMap()) }.sortedByDescending { it.at } }
                .catchLogged("EventOpsViewModel").collect { guestLog = it }
        }
        viewModelScope.launch {
            booking.collection("eventExtras").snapshotsFlow()
                .map { q -> q.documents.map { EventExtra.fromMap(it.id, it.data ?: emptyMap()) }.sortedByDescending { it.at } }
                .catchLogged("EventOpsViewModel").collect { extras = it }
        }
        viewModelScope.launch {
            db.collection("equipmentMoves").whereEqualTo("bookingId", bookingId).snapshotsFlow()
                .map { q -> q.documents.map { EquipmentMove.fromMap(it.id, it.data ?: emptyMap()) } }
                .catchLogged("EventOpsViewModel").collect { moves = it }
        }
    }

    fun clearMessage() { message = null }

    private fun run(okText: String, block: suspend () -> Result<Unit>, onOk: () -> Unit = {}) {
        viewModelScope.launch {
            busy = true
            val r = try { block() } catch (e: Exception) { Result.failure(e) }
            busy = false
            r.fold(
                onSuccess = { message = okText to false; onOk() },
                onFailure = {
                    val ce = CallableError.from(it)
                    blockers = ce.blockers
                    message = ce.text to true
                },
            )
        }
    }

    fun logGuests(sessionId: String?, count: Int, note: String) =
        run(L("అతిథుల సంఖ్య నమోదు చేశాం ✓", "Guest count saved ✓"), { fn.logGuestCount(bookingId, sessionId, count, note) })

    fun addExtra(sessionId: String?, item: String, qty: Double, rate: Double, approvedBy: String) =
        run(L("అదనపు ఐటమ్ నమోదు ✓ — మేనేజర్ ఆమోదం కావాలి", "Extra added ✓ — needs manager approval"), {
            fn.addEventExtra(bookingId, sessionId, item, qty, rate, approvedBy)
        })

    fun approveExtra(id: String, approved: Boolean) =
        run(if (approved) L("ఆమోదించాం ✓", "Approved ✓") else L("తిరస్కరించాం", "Rejected"), { fn.approveEventExtra(bookingId, id, approved) })

    fun closeEvent(vendorBillsEntered: Boolean, overrideReason: String?) {
        blockers = emptyList()
        run(L("కార్యక్రమం ముగించాం ✓", "Event closed ✓"), { fn.closeEvent(bookingId, vendorBillsEntered, overrideReason) })
    }

    fun reopen(reason: String) =
        run(L("మళ్ళీ తెరిచాం", "Event reopened"), { fn.reopenEvent(bookingId, reason) })

    fun loadSessionTimeline(sessionId: String) {
        viewModelScope.launch {
            sessionTimelines[sessionId] = UiState.Loading
            sessionTimelines[sessionId] = fn.getSessionTimeline(bookingId, sessionId).fold(
                onSuccess = { UiState.Success(it) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }
}

@Composable
fun rememberEventOps(bookingId: String): EventOpsViewModel = viewModel(
    key = "event-ops-$bookingId",
    factory = viewModelFactory { initializer { EventOpsViewModel(bookingId) } },
)

private fun Booking.isClosed(): Boolean = closed != null || bookingStatus == BookingStatus.CLOSED
private fun Booking.isCancelled(): Boolean = bookingStatus == BookingStatus.CANCELLED

/** R7-5: meal sessions of the booking with their own timeline. */
@Composable
fun SessionsCard(booking: Booking, ops: EventOpsViewModel) {
    if (booking.sessions.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.info).padding(16.dp)) {
        Text(L("భోజనాలు (${booking.sessions.size})", "Meal sessions (${booking.sessions.size})"), style = MaterialTheme.typography.titleMedium)
        booking.sessions.sortedWith(compareBy({ it.date }, { it.serveTime })).forEach { s ->
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text(s.name, style = MaterialTheme.typography.titleSmall)
                val actual = if (s.guestCountActual > 0) L(" · వచ్చినవారు ${s.guestCountActual}", " · actual ${s.guestCountActual}") else ""
                Text(
                    "${DayKey.display(s.date)} · ${s.serveTime} · ${sessionMealLabel(s.mealType)} · " +
                        L("${s.guests} మంది", "${s.guests} guests") + actual,
                    style = MaterialTheme.typography.bodySmall,
                )
                when (val t = ops.sessionTimelines[s.id]) {
                    null -> TextButton(onClick = { ops.loadSessionTimeline(s.id) }) { Text(L("పని సమయాలు చూపించు", "Show timeline")) }
                    is UiState.Loading -> Text(L("లోడ్ అవుతోంది…", "Loading…"), style = MaterialTheme.typography.bodySmall)
                    is UiState.Error -> Text(t.message, color = SuseelaTheme.colors.bad, style = MaterialTheme.typography.bodySmall)
                    is UiState.Success -> t.data.steps.forEach { step ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                            Text(step.time, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(56.dp))
                            Column(Modifier.weight(1f)) {
                                Text(step.text, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    roleLabel(step.role) + if (step.day != s.date && step.day.isNotBlank()) " · ${DayKey.display(step.day)}" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * R7-7: staff-friendly event-day buttons (assigned staff, manager, owner): "guest count now" and
 * "extra item". Manager / owner approve or reject extras; approved extras go on the final invoice.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EventDayCard(booking: Booking, role: UserRole?, ops: EventOpsViewModel) {
    if (booking.isCancelled()) return
    var showGuests by remember { mutableStateOf(false) }
    var showExtra by remember { mutableStateOf(false) }
    val canApprove = role == UserRole.ADMIN || role == UserRole.MANAGER
    val locked = booking.isClosed()
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.warning).padding(16.dp)) {
        Text(L("కార్యక్రమం రోజు", "Event day"), style = MaterialTheme.typography.titleMedium)
        if (!locked) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { showGuests = true }) { Text(L("ఇప్పుడు ఎంత మంది", "Guest count now")) }
                OutlinedButton(onClick = { showExtra = true }) { Text(L("+ అదనపు ఐటమ్", "+ Extra item")) }
            }
        }
        // Latest count per session (or whole event).
        val latest = ops.guestLog.groupBy { it.sessionId }.mapValues { it.value.first() }
        latest.forEach { (sid, e) ->
            val sName = booking.sessions.find { it.id == sid }?.name ?: L("మొత్తం", "Whole event")
            Text(
                L("$sName: ${e.count} మంది", "$sName: ${e.count} guests") +
                    " · ${DateUtils.formatDateTime(e.at)}" + if (e.byName.isNotBlank()) " · ${e.byName}" else "",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        if (ops.extras.isNotEmpty()) {
            Text(L("అదనపు ఐటమ్స్", "Extra items"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            ops.extras.forEach { x ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${x.item} · ${fmtQty(x.qty)} × ${CurrencyUtils.formatInr(x.rate)} = ${CurrencyUtils.formatInr(x.amount)}")
                        Text(
                            extraStatusLabel(x.status) + if (x.customerApprovedBy.isNotBlank()) L(" · ఒప్పుకున్నవారు: ${x.customerApprovedBy}", " · agreed by: ${x.customerApprovedBy}") else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = when (x.status) {
                                "approved" -> SuseelaTheme.colors.good
                                "rejected" -> SuseelaTheme.colors.bad
                                else -> SuseelaTheme.colors.warning
                            },
                        )
                    }
                    if (canApprove && x.status == "pending" && !locked) {
                        TextButton(enabled = !ops.busy, onClick = { ops.approveExtra(x.id, true) }) { Text(L("ఆమోదించు", "Approve")) }
                        TextButton(enabled = !ops.busy, onClick = { ops.approveExtra(x.id, false) }) { Text(L("వద్దు", "Reject")) }
                    }
                }
            }
        }
    }
    if (showGuests) GuestCountDialog(booking, onDismiss = { showGuests = false }) { sid, count, note ->
        ops.logGuests(sid, count, note); showGuests = false
    }
    if (showExtra) ExtraItemDialog(booking, onDismiss = { showExtra = false }) { sid, item, qty, rate, by ->
        ops.addExtra(sid, item, qty, rate, by); showExtra = false
    }
}

private fun extraStatusLabel(s: String): String = when (s) {
    "approved" -> L("ఆమోదించారు", "Approved")
    "rejected" -> L("తిరస్కరించారు", "Rejected")
    else -> L("ఆమోదం కోసం", "Waiting for approval")
}

private fun fmtQty(q: Double): String = if (q % 1.0 == 0.0) q.toLong().toString() else "%.2f".format(q)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SessionChips(booking: Booking, selected: String, onSelect: (String) -> Unit) {
    if (booking.sessions.isEmpty()) return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        booking.sessions.sortedWith(compareBy({ it.date }, { it.serveTime })).forEach { s ->
            FilterChip(selected = selected == s.id, onClick = { onSelect(s.id) }, label = { Text(s.name) })
        }
    }
}

/** Default session = today's first session, else the first one. */
private fun defaultSession(booking: Booking): String {
    val today = DayKey.today()
    return (booking.sessions.firstOrNull { it.date == today } ?: booking.sessions.minByOrNull { it.date + it.serveTime })?.id ?: ""
}

@Composable
private fun GuestCountDialog(booking: Booking, onDismiss: () -> Unit, onSave: (String?, Int, String) -> Unit) {
    var sid by remember { mutableStateOf(defaultSession(booking)) }
    var countText by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("ఇప్పుడు ఎంత మంది ఉన్నారు?", "How many guests now?")) },
        text = {
            Column {
                SessionChips(booking, sid) { sid = it }
                OutlinedTextField(
                    value = countText,
                    onValueChange = { countText = it.filter(Char::isDigit).take(5); error = null },
                    label = { Text(L("అతిథుల సంఖ్య", "Guest count")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text(L("గమనిక (ఐచ్ఛికం)", "Note (optional)")) }, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val c = countText.toIntOrNull()
                if (c == null || c < 1) error = L("కనీసం 1 రాయండి", "Enter at least 1") else onSave(sid.ifBlank { null }, c, note.trim())
            }) { Text(L("నమోదు చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

@Composable
private fun ExtraItemDialog(booking: Booking, onDismiss: () -> Unit, onSave: (String?, String, Double, Double, String) -> Unit) {
    var sid by remember { mutableStateOf(defaultSession(booking)) }
    var item by remember { mutableStateOf("") }
    var qtyText by remember { mutableStateOf("") }
    var rateText by remember { mutableStateOf("") }
    var by by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("అదనపు ఐటమ్ (customer అడిగారు)", "Extra item (customer asked)")) },
        text = {
            Column {
                SessionChips(booking, sid) { sid = it }
                OutlinedTextField(value = item, onValueChange = { item = it }, label = { Text(L("ఏమిటి (ఉదా: ఐస్ క్రీం)", "What (e.g. ice cream)")) }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    value = qtyText, onValueChange = { qtyText = it },
                    label = { Text(L("ఎన్ని", "Quantity")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = rateText, onValueChange = { rateText = it },
                    label = { Text(L("ఒక్కదానికి ధర (₹)", "Rate each (₹)")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = by, onValueChange = { by = it },
                    label = { Text(L("ఒప్పుకున్న customer (పేరు / ఫోన్)", "Agreed by (customer name / phone)")) },
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val q = qtyText.toDoubleOrNull()
                val r = rateText.toDoubleOrNull()
                error = when {
                    item.isBlank() -> L("ఐటమ్ పేరు రాయండి", "Enter the item")
                    q == null || q <= 0 -> L("ఎన్ని — 0 కంటే ఎక్కువ", "Quantity must be more than 0")
                    r == null || r < 0 -> L("ధర సరిగ్గా రాయండి", "Enter a valid rate")
                    by.isBlank() -> L("customer లో ఎవరు ఒప్పుకున్నారో రాయండి", "Who from the customer agreed?")
                    else -> null
                }
                if (error == null) onSave(sid.ifBlank { null }, item.trim(), q!!, r!!, by.trim())
            }) { Text(L("జోడించు", "Add")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

/** R7-4: vessels / equipment still out for this booking (issued − returned − damaged − lost). */
@Composable
fun VesselsOutCard(ops: EventOpsViewModel, onOpenEquipment: () -> Unit) {
    val out = outstandingOf(ops.moves).filter { it.outstanding > 0 }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(if (out.isEmpty()) SuseelaTheme.colors.good else SuseelaTheme.colors.bad).padding(16.dp)) {
        Text(L("పాత్రలు / సామాను", "Vessels / equipment"), style = MaterialTheme.typography.titleMedium)
        if (ops.moves.isEmpty()) {
            Text(L("ఇంకా ఏమీ ఇవ్వలేదు.", "Nothing issued yet."), style = MaterialTheme.typography.bodySmall)
        } else if (out.isEmpty()) {
            Text(L("అన్నీ తిరిగి వచ్చాయి ✓", "Everything is back ✓"), color = SuseelaTheme.colors.good)
        } else {
            out.forEach { Text(L("${it.name}: ${fmtQty(it.outstanding)} ఇంకా రాలేదు", "${it.name}: ${fmtQty(it.outstanding)} still out")) }
        }
        OutlinedButton(onClick = onOpenEquipment, modifier = Modifier.padding(top = 4.dp)) { Text(L("ఇవ్వు / తిరిగి తీసుకో", "Issue / return")) }
    }
}

/**
 * R7-9: "Event ముగించు" (owner). Server checks the blockers (vessels out, outside orders not settled, pending
 * extras, attendance not marked, customer balance, vendor bills) and returns each in Telugu.
 * Closed events show the profit snapshot and can be reopened with a reason.
 */
@Composable
fun CloseEventCard(booking: Booking, role: UserRole?, ops: EventOpsViewModel) {
    if (role != UserRole.ADMIN || booking.isCancelled()) return
    val closed = booking.isClosed()
    if (!closed && booking.bookingStatus != BookingStatus.COMPLETED) return
    var showClose by remember { mutableStateOf(false) }
    var showReopen by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.gold).padding(16.dp)) {
        if (closed) {
            Text(L("కార్యక్రమం ముగించారు 🔒", "Event closed 🔒"), style = MaterialTheme.typography.titleMedium)
            // Snapshot written by closeEvent: income, costs { food, labour, transport, rentals, other }, profit, marginPct.
            val c = booking.closed.orEmpty()
            val income = c.rNum("income")
            val costs = (c["costs"] as? Map<*, *>)?.entries?.mapNotNull { (k, v) -> (v as? Number)?.let { k.toString() to it.toDouble() } }.orEmpty()
            val p = c.rNum("profit")
            val margin = c.rNum("marginPct")
            Text(L("ఆదాయం ${CurrencyUtils.formatInr(income)}", "Income ${CurrencyUtils.formatInr(income)}"))
            costs.filter { it.second > 0 }.forEach { (k, v) ->
                Text("  " + costLabel(k) + ": " + CurrencyUtils.formatInr(v), style = MaterialTheme.typography.bodySmall)
            }
            Text(
                L("లాభం ${CurrencyUtils.formatInr(p)} (${"%.1f".format(margin)}%)", "Profit ${CurrencyUtils.formatInr(p)} (${"%.1f".format(margin)}%)"),
                fontWeight = FontWeight.SemiBold,
                color = if (p >= 0) SuseelaTheme.colors.good else SuseelaTheme.colors.bad,
            )
            c.rStr("overrideReason").takeIf { it.isNotBlank() }?.let { Text(L("బాకీతో ముగించారు: $it", "Closed with balance: $it"), style = MaterialTheme.typography.bodySmall) }
            OutlinedButton(onClick = { showReopen = true }, enabled = !ops.busy) { Text(L("మళ్ళీ తెరువు", "Reopen")) }
        } else {
            Text(L("కార్యక్రమం ముగించు", "Close the event"), style = MaterialTheme.typography.titleMedium)
            Text(
                L("ముగించాక ఈ కార్యక్రమం, దాని ఖర్చులు మార్చలేం. లాభం లెక్క భద్రపరుస్తాం.", "After closing, the event and its costs are locked and the profit is saved."),
                style = MaterialTheme.typography.bodySmall,
            )
            Button(onClick = { showClose = true }, enabled = !ops.busy) { Text(L("Event ముగించు", "Close event")) }
        }
        if (ops.blockers.isNotEmpty()) {
            Text(L("ముగించలేం — ఇవి పూర్తి చేయండి:", "Can't close yet — finish these:"), color = SuseelaTheme.colors.bad, modifier = Modifier.padding(top = 6.dp))
            ops.blockers.forEach { (te, en) -> Text("• " + L(te, en), color = SuseelaTheme.colors.bad) }
        }
    }
    if (showClose) {
        var bills by remember { mutableStateOf(false) }
        var withBalance by remember { mutableStateOf(false) }
        var reason by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { showClose = false },
            title = { Text(L("Event ముగించు", "Close event")) },
            text = {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = bills, onCheckedChange = { bills = it })
                        Text(L("వ్యాపారుల బిల్లులన్నీ నమోదు చేశాం", "All vendor bills are entered"))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = withBalance, onCheckedChange = { withBalance = it })
                        Text(L("customer బాకీ ఉన్నా ముగించు", "Close even if the customer still owes"))
                    }
                    if (withBalance) {
                        OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text(L("కారణం", "Reason")) }, modifier = Modifier.fillMaxWidth())
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    error = when {
                        !bills -> L("ముందు బిల్లులన్నీ నమోదు చేయండి", "Enter all vendor bills first")
                        withBalance && reason.trim().length < 3 -> L("కారణం కనీసం 3 అక్షరాలు", "Reason at least 3 letters")
                        else -> null
                    }
                    if (error == null) {
                        ops.closeEvent(true, if (withBalance) reason.trim() else null)
                        showClose = false
                    }
                }) { Text(L("ముగించు", "Close")) }
            },
            dismissButton = { TextButton(onClick = { showClose = false }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
    if (showReopen) {
        var reason by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showReopen = false },
            title = { Text(L("మళ్ళీ తెరువు", "Reopen event")) },
            text = { OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text(L("కారణం", "Reason")) }, modifier = Modifier.fillMaxWidth()) },
            confirmButton = {
                TextButton(enabled = reason.trim().length >= 3, onClick = { ops.reopen(reason.trim()); showReopen = false }) { Text(L("తెరువు", "Reopen")) }
            },
            dismissButton = { TextButton(onClick = { showReopen = false }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}

private fun costLabel(k: String): String = when (k) {
    "food" -> L("భోజనం / సరుకులు", "Food")
    "labour" -> L("కూలీ", "Labour")
    "transport" -> L("రవాణా", "Transport")
    "rentals" -> L("అద్దెలు", "Rentals")
    "other" -> L("ఇతర", "Other")
    else -> k
}

/** Result line of the last event action. */
@Composable
fun EventOpsMessage(ops: EventOpsViewModel) {
    ops.message?.let { (text, isError) ->
        NoticeBox(text, if (isError) Tone.BAD else Tone.GOOD, Modifier.padding(top = 8.dp))
    }
}
