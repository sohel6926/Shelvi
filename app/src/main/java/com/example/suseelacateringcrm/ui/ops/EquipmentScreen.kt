package com.example.suseelacateringcrm.ui.ops

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import com.example.suseelacateringcrm.data.model.Equipment
import com.example.suseelacateringcrm.data.model.EquipmentMove
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.model.outstandingOf
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.BookingPickerField
import com.example.suseelacateringcrm.ui.components.CancelRecordDialog
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.ShowCancelledToggle
import com.example.suseelacateringcrm.ui.components.SimplePickerField
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.bookingPickLabel
import com.example.suseelacateringcrm.ui.components.fmtNum
import com.example.suseelacateringcrm.ui.components.numOrNull
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.launchSafe
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

class EquipmentViewModel(initialBookingId: String?) : ViewModel() {
    private val ops = ServiceLocator.opsRepository
    private val branch = ServiceLocator.branchManager.currentBranchId
    val role: UserRole? get() = ServiceLocator.currentRole()
    val canWrite: Boolean get() = role == UserRole.ADMIN || role == UserRole.MANAGER

    var tab by mutableStateOf(if (initialBookingId != null) 1 else 0)
    var showArchived by mutableStateOf(false)
    var message by mutableStateOf<Pair<String, Boolean>?>(null)

    private val _items = MutableStateFlow<List<Equipment>>(emptyList())
    val items: StateFlow<List<Equipment>> = _items.asStateFlow()
    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()
    private val _allMoves = MutableStateFlow<List<EquipmentMove>>(emptyList())
    val allMoves: StateFlow<List<EquipmentMove>> = _allMoves.asStateFlow()
    private val _bookingMoves = MutableStateFlow<List<EquipmentMove>>(emptyList())
    val bookingMoves: StateFlow<List<EquipmentMove>> = _bookingMoves.asStateFlow()

    private val selected = MutableStateFlow(initialBookingId ?: "")
    var bookingId by mutableStateOf(initialBookingId ?: "")
        private set

    init {
        viewModelScope.launch { branch.flatMapLatest { ops.equipmentFlow(it) }.catchLogged("EquipmentVM").collect { _items.value = it } }
        viewModelScope.launch {
            branch.flatMapLatest { ServiceLocator.bookingRepository.bookingsFlow(it) }.catchLogged("EquipmentVM").collect { _bookings.value = it }
        }
        if (canWrite) {
            viewModelScope.launch { branch.flatMapLatest { ops.movesFlow(it) }.catchLogged("EquipmentVM").collect { _allMoves.value = it } }
        }
        viewModelScope.launch {
            selected.flatMapLatest { id -> if (id.isBlank()) flowOf(emptyList()) else ops.movesFlow(null, id) }
                .catchLogged("EquipmentVM").collect { _bookingMoves.value = it }
        }
    }

    fun pickBooking(id: String) {
        bookingId = id
        selected.value = id
    }

    fun saveItem(e: Equipment) = launchSafe("EquipmentVM") {
        ops.saveEquipment(e, branch.value)
        message = L("సేవ్ చేశాం ✓", "Saved ✓") to false
    }

    fun archive(e: Equipment, reason: String) = launchSafe("EquipmentVM") {
        ServiceLocator.functions.cancelRecord("equipment", e.id, reason).getOrThrow()
        message = L("పక్కన పెట్టాం", "Archived") to false
    }

    fun addMove(item: Equipment, type: String, qty: Double, note: String, sessionId: String) {
        val b = _bookings.value.find { it.id == bookingId }
        val branchId = b?.branchId?.ifBlank { null } ?: branch.value
        if (bookingId.isBlank() || branchId == null) {
            message = L("ముందు కార్యక్రమం ఎంచుకోండి", "Choose the event first") to true
            return
        }
        launchSafe("EquipmentVM") {
            ops.addMove(
                EquipmentMove(
                    equipmentId = item.id, equipmentName = item.name, bookingId = bookingId, sessionId = sessionId,
                    type = type, qty = qty, note = note, date = DayKey.today(),
                ),
                branchId,
            )
            message = L("నమోదు చేశాం ✓", "Recorded ✓") to false
        }
    }
}

private val MOVE_TYPES = listOf("issue", "return", "damaged", "lost")

/** R7-4: vessels / equipment master, issue / return / damage / lost per booking, and what is still out. */
@Composable
fun EquipmentScreen(padding: PaddingValues, bookingId: String? = null) {
    val vm: EquipmentViewModel = viewModel(
        key = "equipment-${bookingId ?: ""}",
        factory = viewModelFactory { initializer { EquipmentViewModel(bookingId) } },
    )
    OnRefresh { }
    Column(Modifier.padding(padding).fillMaxSize()) {
        TabRow(selectedTabIndex = vm.tab) {
            listOf(L("సామాను", "Items"), L("ఇవ్వు / తిరిగి", "Issue / return"), L("బయట ఉన్నవి", "Still out")).forEachIndexed { i, t ->
                Tab(selected = vm.tab == i, onClick = { vm.tab = i }, text = { Text(t) })
            }
        }
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD, Modifier.padding(horizontal = 16.dp)) }
        when (vm.tab) {
            0 -> ItemsTab(vm)
            1 -> MovesTab(vm)
            else -> OutstandingTab(vm)
        }
    }
}

@Composable
private fun ItemsTab(vm: EquipmentViewModel) {
    val items by vm.items.collectAsStateWithLifecycle()
    val moves by vm.allMoves.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Equipment?>(null) }
    var archiving by remember { mutableStateOf<Equipment?>(null) }
    val outByItem = outstandingOf(moves).groupBy { it.equipmentId }.mapValues { e -> e.value.sumOf { it.outstanding.coerceAtLeast(0.0) } }
    Column(Modifier.fillMaxSize()) {
        ShowCancelledToggle(vm.showArchived, { vm.showArchived = it })
        if (vm.canWrite) {
            Button(onClick = { editing = Equipment() }, modifier = Modifier.padding(horizontal = 16.dp)) { Text(L("+ కొత్త సామాను", "+ New item")) }
        }
        val shown = items.filter { vm.showArchived || !it.archived }
        if (shown.isEmpty()) EmptyState(L("ఇంకా సామాను లేదు.", "No items yet."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(shown, key = { it.id }) { e ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(e.name + if (e.archived) L(" (పక్కన పెట్టారు)", " (archived)") else "", style = MaterialTheme.typography.titleSmall)
                            val kind = if (e.kind == "rented") L("అద్దెకు", "Rented") + (if (e.rentalVendor.isNotBlank()) " · ${e.rentalVendor}" else "") +
                                " · ${CurrencyUtils.formatInr(e.rate)}/" + L("రోజు", "day") else L("మనవి", "Own")
                            Text("$kind · " + L("మొత్తం ${fmtNum(e.qtyOwned)} ${e.unit}", "Owned ${fmtNum(e.qtyOwned)} ${e.unit}"), style = MaterialTheme.typography.bodySmall)
                            val out = outByItem[e.id] ?: 0.0
                            if (out > 0) Text(L("బయట ఉన్నవి: ${fmtNum(out)}", "Out now: ${fmtNum(out)}"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                        if (vm.canWrite && !e.archived) {
                            TextButton(onClick = { editing = e }) { Text(L("మార్చు", "Edit")) }
                            TextButton(onClick = { archiving = e }) { Text(L("పక్కన పెట్టు", "Archive")) }
                        }
                    }
                }
            }
        }
    }
    editing?.let { e -> EquipmentDialog(e, onDismiss = { editing = null }) { vm.saveItem(it); editing = null } }
    archiving?.let { e -> CancelRecordDialog(e.name, archive = true, onConfirm = { vm.archive(e, it); archiving = null }, onDismiss = { archiving = null }) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EquipmentDialog(initial: Equipment, onDismiss: () -> Unit, onSave: (Equipment) -> Unit) {
    var nameTe by remember { mutableStateOf(initial.nameTe) }
    var nameEn by remember { mutableStateOf(initial.nameEn) }
    var kind by remember { mutableStateOf(initial.kind) }
    var unit by remember { mutableStateOf(initial.unit) }
    var qty by remember { mutableStateOf(if (initial.qtyOwned > 0) fmtNum(initial.qtyOwned) else "") }
    var vendor by remember { mutableStateOf(initial.rentalVendor) }
    var rate by remember { mutableStateOf(if (initial.rate > 0) fmtNum(initial.rate) else "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) L("కొత్త సామాను", "New item") else L("సామాను మార్చు", "Edit item")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                AppTextField(nameTe, { nameTe = it }, L("పేరు (తెలుగు) ఉదా: పెద్ద గిన్నె", "Name (Telugu)"))
                AppTextField(nameEn, { nameEn = it }, L("పేరు (English)", "Name (English)"))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = kind == "own", onClick = { kind = "own" }, label = { Text(L("మనవి", "Own")) })
                    FilterChip(selected = kind == "rented", onClick = { kind = "rented" }, label = { Text(L("అద్దెకు", "Rented")) })
                }
                AppTextField(unit, { unit = it }, L("యూనిట్ (pcs, set…)", "Unit (pcs, set…)"))
                AppTextField(qty, { qty = it }, L("మొత్తం ఎన్ని", "Quantity owned"), keyboardType = KeyboardType.Decimal)
                if (kind == "rented") {
                    AppTextField(vendor, { vendor = it }, L("అద్దె ఎవరి దగ్గర", "Rented from"))
                    AppTextField(rate, { rate = it }, L("ఒక్కదానికి రోజు అద్దె (₹)", "Rent per piece per day (₹)"), keyboardType = KeyboardType.Decimal)
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val q = numOrNull(qty) ?: 0.0
                val r = numOrNull(rate) ?: 0.0
                error = when {
                    nameTe.isBlank() && nameEn.isBlank() -> L("పేరు రాయండి", "Enter a name")
                    q < 0 || r < 0 -> L("సంఖ్యలు 0 లేదా ఎక్కువ", "Numbers must be 0 or more")
                    else -> null
                }
                if (error == null) onSave(
                    initial.copy(
                        nameTe = nameTe.trim(), nameEn = nameEn.trim(), kind = kind, unit = unit.trim().ifBlank { "pcs" },
                        qtyOwned = q, rentalVendor = if (kind == "rented") vendor.trim() else "", rate = if (kind == "rented") r else 0.0,
                    ),
                )
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MovesTab(vm: EquipmentViewModel) {
    val bookings by vm.bookings.collectAsStateWithLifecycle()
    val items by vm.items.collectAsStateWithLifecycle()
    val moves by vm.bookingMoves.collectAsStateWithLifecycle()
    var item by remember { mutableStateOf<Equipment?>(null) }
    var type by remember { mutableStateOf("issue") }
    var qty by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var sessionId by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        BookingPickerField(bookings, vm.bookingId, { vm.pickBooking(it.id) })
        val booking = bookings.find { it.id == vm.bookingId }
        if (vm.canWrite && booking != null) {
            if (booking.sessions.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = sessionId.isBlank(), onClick = { sessionId = "" }, label = { Text(L("మొత్తం", "Whole event")) })
                    booking.sessions.forEach { s -> FilterChip(selected = sessionId == s.id, onClick = { sessionId = s.id }, label = { Text(s.name) }) }
                }
            }
            SimplePickerField(items.filterNot { it.archived }, item, { "${it.name} (${it.unit})" }, { item = it }, L("సామాను", "Item"))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                MOVE_TYPES.forEach { t -> FilterChip(selected = type == t, onClick = { type = t }, label = { Text(EquipmentMove.typeLabel(t)) }) }
            }
            AppTextField(qty, { qty = it }, L("ఎన్ని", "Quantity"), keyboardType = KeyboardType.Decimal)
            AppTextField(note, { note = it }, L("గమనిక (ఐచ్ఛికం)", "Note (optional)"))
            Button(onClick = {
                val q = numOrNull(qty)
                val it0 = item
                if (it0 == null || q == null || q <= 0) {
                    vm.message = L("సామాను, ఎన్ని (0 కంటే ఎక్కువ) ఇవ్వండి", "Choose an item and a quantity above 0") to true
                } else {
                    vm.addMove(it0, type, q, note.trim(), sessionId)
                    qty = ""; note = ""
                }
            }) { Text(L("నమోదు చేయి", "Record")) }
        }
        if (booking != null) {
            val out = outstandingOf(moves)
            Text(L("ఈ కార్యక్రమం లెక్క", "This event"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
            if (out.isEmpty()) Text(L("ఇంకా ఏమీ ఇవ్వలేదు.", "Nothing issued yet."))
            out.forEach { o ->
                Text(
                    if (o.outstanding > 0) L("${o.name}: ${fmtNum(o.outstanding)} ఇంకా రాలేదు", "${o.name}: ${fmtNum(o.outstanding)} still out")
                    else L("${o.name}: అన్నీ వచ్చాయి ✓", "${o.name}: all back ✓"),
                    color = if (o.outstanding > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(L("కదలికలు", "Moves"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
            moves.forEach { m ->
                Text(
                    "${DayKey.display(m.date)} · ${m.equipmentName} · ${EquipmentMove.typeLabel(m.type)} ${fmtNum(m.qty)}" +
                        (if (m.note.isNotBlank()) " · ${m.note}" else ""),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun OutstandingTab(vm: EquipmentViewModel) {
    val moves by vm.allMoves.collectAsStateWithLifecycle()
    val bookings by vm.bookings.collectAsStateWithLifecycle()
    val out = outstandingOf(moves).filter { it.outstanding > 0 }.groupBy { it.bookingId }
    if (!vm.canWrite) {
        EmptyState(L("కార్యక్రమం ఎంచుకుని 'ఇవ్వు / తిరిగి' లో చూడండి.", "Pick the event in 'Issue / return'."))
        return
    }
    if (out.isEmpty()) {
        EmptyState(L("అన్నీ తిరిగి వచ్చాయి ✓", "Everything is back ✓"))
        return
    }
    LazyColumn(contentPadding = PaddingValues(16.dp)) {
        items(out.entries.toList(), key = { it.key }) { (bid, list) ->
            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Text(bookings.find { it.id == bid }?.let { bookingPickLabel(it) } ?: bid, style = MaterialTheme.typography.titleSmall)
                    list.forEach { Text(L("${it.name}: ${fmtNum(it.outstanding)} ఇంకా రాలేదు", "${it.name}: ${fmtNum(it.outstanding)} still out")) }
                    OutlinedButton(onClick = { vm.pickBooking(bid); vm.tab = 1 }) { Text(L("తిరిగి తీసుకో", "Record return")) }
                }
            }
        }
    }
}
