package com.example.suseelacateringcrm.ui.ops

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.CostTarget
import com.example.suseelacateringcrm.data.model.OutsideOrder
import com.example.suseelacateringcrm.data.model.Vendor
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.BookingPickerField
import com.example.suseelacateringcrm.ui.components.CancelRecordDialog
import com.example.suseelacateringcrm.ui.components.CostTargetPicker
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.ShowCancelledToggle
import com.example.suseelacateringcrm.ui.components.SimplePickerField
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.bookingPickLabel
import com.example.suseelacateringcrm.ui.components.fmtNum
import com.example.suseelacateringcrm.ui.components.numOrNull
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.launchSafe
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

class OutsideOrdersViewModel : ViewModel() {
    private val ops = ServiceLocator.opsRepository
    private val fn = ServiceLocator.functions
    private val branch = ServiceLocator.branchManager.currentBranchId

    var showCancelled by mutableStateOf(false)
    var bookingFilter by mutableStateOf("")
    var message by mutableStateOf<Pair<String, Boolean>?>(null)
    var busy by mutableStateOf(false)
        private set

    private val _orders = MutableStateFlow<List<OutsideOrder>>(emptyList())
    val orders: StateFlow<List<OutsideOrder>> = _orders.asStateFlow()
    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()
    private val _vendors = MutableStateFlow<List<Vendor>>(emptyList())
    val vendors: StateFlow<List<Vendor>> = _vendors.asStateFlow()

    init {
        viewModelScope.launch { branch.flatMapLatest { ops.outsideOrdersFlow(it) }.catchLogged("OutsideOrdersVM").collect { _orders.value = it } }
        viewModelScope.launch {
            branch.flatMapLatest { ServiceLocator.bookingRepository.bookingsFlow(it) }.catchLogged("OutsideOrdersVM").collect { _bookings.value = it }
        }
        viewModelScope.launch { ServiceLocator.vendorRepository.vendorsFlow().catchLogged("OutsideOrdersVM").collect { _vendors.value = it } }
    }

    private fun act(ok: String, block: suspend () -> Unit) = launchSafe("OutsideOrdersVM", onError = { busy = false }) {
        busy = true
        block()
        busy = false
        message = ok to false
    }

    fun save(o: OutsideOrder) {
        val b = _bookings.value.find { it.id == o.bookingId }
        act(L("ఆర్డర్ సేవ్ చేశాం ✓", "Order saved ✓")) {
            fn.saveOutsideOrder(
                mapOf(
                    "id" to o.id.ifBlank { null },
                    "bookingId" to o.bookingId,
                    "sessionId" to o.sessionId.ifBlank { null },
                    "vendorId" to o.vendorId.ifBlank { null },
                    "vendorName" to o.vendorName,
                    "item" to o.item,
                    "unit" to o.unit,
                    "rate" to o.rate,
                    "orderedQty" to o.orderedQty,
                    "advancePaid" to o.advancePaid,
                    "costTarget" to o.costTarget.toMap(),
                    "branchId" to (b?.branchId?.ifBlank { null } ?: branch.value),
                ),
            ).getOrThrow()
        }
    }

    fun delivery(o: OutsideOrder, delivered: Double, accepted: Double, returned: Double, reason: String) =
        act(L("వచ్చినవి నమోదు ✓", "Delivery recorded ✓")) {
            fn.recordOutsideDelivery(o.id, delivered, accepted, returned, reason).getOrThrow()
        }

    fun cancel(o: OutsideOrder, reason: String) = act(L("ఆర్డర్ రద్దు చేశాం", "Order cancelled")) {
        fn.cancelRecord("outsideOrders", o.id, reason).getOrThrow()
    }
}

/** R7-6: outside orders (పుల్కా, రుమాలీ రోటీ, బొబ్బట్లు, ఐస్ క్రీం, పాన్ …): order → delivered / accepted / returned → amount due. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OutsideOrdersScreen(padding: PaddingValues) {
    val vm: OutsideOrdersViewModel = viewModel()
    val orders by vm.orders.collectAsStateWithLifecycle()
    val bookings by vm.bookings.collectAsStateWithLifecycle()
    val vendors by vm.vendors.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<OutsideOrder?>(null) }
    var delivering by remember { mutableStateOf<OutsideOrder?>(null) }
    var cancelling by remember { mutableStateOf<OutsideOrder?>(null) }

    Column(Modifier.padding(padding).fillMaxSize()) {
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD, Modifier.padding(horizontal = 16.dp)) }
        Button(onClick = {
            editing = OutsideOrder(bookingId = vm.bookingFilter, costTarget = if (vm.bookingFilter.isNotBlank()) CostTarget(CostTarget.TYPE_BOOKING, vm.bookingFilter) else CostTarget())
        }, modifier = Modifier.padding(horizontal = 16.dp)) { Text(L("+ కొత్త బయట ఆర్డర్", "+ New outside order")) }
        BookingPickerField(bookings, vm.bookingFilter, { vm.bookingFilter = it.id }, L("కార్యక్రమం వారీగా చూడు", "Filter by event"), Modifier.padding(horizontal = 16.dp))
        if (vm.bookingFilter.isNotBlank()) TextButton(onClick = { vm.bookingFilter = "" }) { Text(L("అన్నీ చూపించు", "Show all")) }
        ShowCancelledToggle(vm.showCancelled, { vm.showCancelled = it })
        val shown = orders
            .filter { vm.bookingFilter.isBlank() || it.bookingId == vm.bookingFilter }
            .filter { vm.showCancelled || !it.status.equals("cancelled", ignoreCase = true) }
            .sortedWith(compareBy({ statusOrder(it.status) }, { it.item }))
        val due = shown.filterNot { it.status.equals("cancelled", true) }.sumOf { it.amountDue }
        if (due > 0) Text(
            L("ఇవ్వాల్సిన మొత్తం: ${CurrencyUtils.formatInr(due)}", "Total due: ${CurrencyUtils.formatInr(due)}"),
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 16.dp),
        )
        if (shown.isEmpty()) EmptyState(L("బయట ఆర్డర్లు లేవు.", "No outside orders."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(shown, key = { it.id }) { o ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${o.item} · ${o.vendorName}", style = MaterialTheme.typography.titleSmall)
                        bookings.find { it.id == o.bookingId }?.let { b ->
                            val sName = b.sessions.find { it.id == o.sessionId }?.name
                            Text(bookingPickLabel(b) + (sName?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall)
                        }
                        Text(
                            L(
                                "ఆర్డర్ ${fmtNum(o.orderedQty)} · వచ్చినవి ${fmtNum(o.deliveredQty)} · తీసుకున్నవి ${fmtNum(o.acceptedQty)} · తిరిగి ${fmtNum(o.returnedQty)} ${o.unit}",
                                "Ordered ${fmtNum(o.orderedQty)} · delivered ${fmtNum(o.deliveredQty)} · accepted ${fmtNum(o.acceptedQty)} · returned ${fmtNum(o.returnedQty)} ${o.unit}",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        if (o.rejectReason.isNotBlank()) Text(L("తిరిగి ఇచ్చిన కారణం: ${o.rejectReason}", "Returned because: ${o.rejectReason}"), style = MaterialTheme.typography.bodySmall)
                        Text(
                            L("ధర ${CurrencyUtils.formatInr(o.rate)} · అడ్వాన్స్ ${CurrencyUtils.formatInr(o.advancePaid)} · బాకీ ${CurrencyUtils.formatInr(o.amountDue)}",
                                "Rate ${CurrencyUtils.formatInr(o.rate)} · advance ${CurrencyUtils.formatInr(o.advancePaid)} · due ${CurrencyUtils.formatInr(o.amountDue)}"),
                        )
                        Text(OutsideOrder.statusLabel(o.status), color = when (o.status) {
                            "settled" -> SuseelaTheme.colors.good
                            "cancelled", "Cancelled" -> SuseelaTheme.colors.bad
                            else -> SuseelaTheme.colors.warning
                        }, fontWeight = FontWeight.SemiBold)
                        if (!o.status.equals("cancelled", true) && o.status != "settled") {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                TextButton(enabled = !vm.busy, onClick = { delivering = o }) { Text(L("వచ్చినవి నమోదు", "Record delivery")) }
                                if (o.status == "ordered") TextButton(enabled = !vm.busy, onClick = { editing = o }) { Text(L("మార్చు", "Edit")) }
                                TextButton(enabled = !vm.busy, onClick = { cancelling = o }) { Text(L("రద్దు చేయి", "Cancel")) }
                            }
                        }
                    }
                }
            }
        }
    }
    editing?.let { o -> OrderDialog(o, bookings, vendors, onDismiss = { editing = null }) { vm.save(it); editing = null } }
    delivering?.let { o -> DeliveryDialog(o, onDismiss = { delivering = null }) { d, a, r, why -> vm.delivery(o, d, a, r, why); delivering = null } }
    cancelling?.let { o -> CancelRecordDialog(o.item, onConfirm = { vm.cancel(o, it); cancelling = null }, onDismiss = { cancelling = null }) }
}

private fun statusOrder(s: String) = when (s) { "ordered" -> 0; "delivered" -> 1; "settled" -> 2; else -> 3 }

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OrderDialog(initial: OutsideOrder, bookings: List<Booking>, vendors: List<Vendor>, onDismiss: () -> Unit, onSave: (OutsideOrder) -> Unit) {
    var o by remember { mutableStateOf(initial) }
    var rate by remember { mutableStateOf(if (initial.rate > 0) fmtNum(initial.rate) else "") }
    var qty by remember { mutableStateOf(if (initial.orderedQty > 0) fmtNum(initial.orderedQty) else "") }
    var adv by remember { mutableStateOf(if (initial.advancePaid > 0) fmtNum(initial.advancePaid) else "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) L("బయట ఆర్డర్", "Outside order") else L("ఆర్డర్ మార్చు", "Edit order")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutsideOrder.COMMON_ITEMS.forEach { name ->
                        FilterChip(selected = o.item == name, onClick = { o = o.copy(item = name) }, label = { Text(com.example.suseelacateringcrm.util.tr(name)) })
                    }
                }
                AppTextField(o.item, { o = o.copy(item = it) }, L("ఐటమ్", "Item"))
                SimplePickerField(vendors, vendors.find { it.id == o.vendorId }, { it.name }, { o = o.copy(vendorId = it.id, vendorName = it.name) }, L("వ్యాపారి (ఎంచుకోండి)", "Vendor (pick)"))
                AppTextField(o.vendorName, { o = o.copy(vendorName = it, vendorId = "") }, L("వ్యాపారి పేరు", "Vendor name"))
                AppTextField(o.unit, { o = o.copy(unit = it) }, L("యూనిట్ (పీస్, కిలో…)", "Unit (pcs, kg…)"))
                AppTextField(qty, { qty = it }, L("ఎన్ని ఆర్డర్", "Quantity ordered"), keyboardType = KeyboardType.Decimal)
                AppTextField(rate, { rate = it }, L("ఒక్కదానికి ధర (₹)", "Rate each (₹)"), keyboardType = KeyboardType.Decimal)
                AppTextField(adv, { adv = it }, L("అడ్వాన్స్ ఇచ్చింది (₹)", "Advance paid (₹)"), keyboardType = KeyboardType.Decimal)
                CostTargetPicker(o.costTarget, bookings, {
                    o = o.copy(costTarget = it, bookingId = if (it.isBooking) it.bookingId else o.bookingId, sessionId = if (it.isBooking) it.sessionId else "")
                })
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val q = numOrNull(qty)
                val r = numOrNull(rate)
                val a = numOrNull(adv) ?: 0.0
                error = when {
                    o.item.isBlank() -> L("ఐటమ్ రాయండి", "Enter the item")
                    o.vendorName.isBlank() -> L("వ్యాపారి పేరు రాయండి", "Enter the vendor")
                    q == null || q <= 0 -> L("ఎన్ని — 0 కంటే ఎక్కువ", "Quantity must be more than 0")
                    r == null || r < 0 -> L("ధర సరిగ్గా రాయండి", "Enter a valid rate")
                    a < 0 -> L("అడ్వాన్స్ 0 లేదా ఎక్కువ", "Advance must be 0 or more")
                    !o.costTarget.isBooking || o.costTarget.bookingId.isBlank() -> L("ఏ కార్యక్రమానికో ఎంచుకోండి", "Choose the event")
                    else -> null
                }
                if (error == null) onSave(o.copy(item = o.item.trim(), vendorName = o.vendorName.trim(), orderedQty = q!!, rate = r!!, advancePaid = a))
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

@Composable
private fun DeliveryDialog(o: OutsideOrder, onDismiss: () -> Unit, onSave: (Double, Double, Double, String) -> Unit) {
    var delivered by remember { mutableStateOf(fmtNum(if (o.deliveredQty > 0) o.deliveredQty else o.orderedQty)) }
    var accepted by remember { mutableStateOf(fmtNum(if (o.acceptedQty > 0) o.acceptedQty else o.orderedQty)) }
    var returned by remember { mutableStateOf(fmtNum(o.returnedQty)) }
    var reason by remember { mutableStateOf(o.rejectReason) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("వచ్చినవి: ${o.item}", "Delivery: ${o.item}")) },
        text = {
            Column {
                Text(L("ఆర్డర్: ${fmtNum(o.orderedQty)} ${o.unit}", "Ordered: ${fmtNum(o.orderedQty)} ${o.unit}"))
                AppTextField(delivered, { delivered = it }, L("వచ్చినవి", "Delivered"), keyboardType = KeyboardType.Decimal)
                AppTextField(accepted, { accepted = it }, L("తీసుకున్నవి (బాగున్నవి)", "Accepted (good)"), keyboardType = KeyboardType.Decimal)
                AppTextField(returned, { returned = it }, L("తిరిగి ఇచ్చినవి", "Returned"), keyboardType = KeyboardType.Decimal)
                AppTextField(reason, { reason = it }, L("తిరిగి ఇచ్చిన కారణం", "Reason for return"))
                Text(L("బాకీ మొత్తం సర్వర్ లెక్కపెడుతుంది.", "The amount due is worked out by the server."), style = MaterialTheme.typography.bodySmall)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val d = numOrNull(delivered) ?: -1.0
                val a = numOrNull(accepted) ?: -1.0
                val r = numOrNull(returned) ?: 0.0
                error = when {
                    d < 0 || a < 0 || r < 0 -> L("సంఖ్యలు 0 లేదా ఎక్కువ", "Numbers must be 0 or more")
                    a > d -> L("తీసుకున్నవి వచ్చినవాటి కంటే ఎక్కువ కాకూడదు", "Accepted can't be more than delivered")
                    r > 0 && reason.isBlank() -> L("తిరిగి ఇచ్చిన కారణం రాయండి", "Give the reason for the return")
                    else -> null
                }
                if (error == null) onSave(d, a, r, reason.trim())
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
