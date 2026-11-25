package com.example.suseelacateringcrm.ui.procure

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.PURCHASE_UNITS
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.DayPickerField
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

/** One line of a request / order (Module 3a). */
data class ProcLine(val description: String = "", val qty: Double = 0.0, val unit: String = "", val rate: Double = 0.0, val inventoryItemId: String = "")

data class ProcRequest(
    val id: String = "",
    val number: String = "",
    val status: String = "",
    val neededBy: String = "",
    val lines: List<ProcLine> = emptyList(),
    val requestedBy: String = "",
    val requestedByName: String = "",
    val poNumber: String = "",
    val decideReason: String = "",
)

data class ProcOrder(
    val id: String = "",
    val number: String = "",
    val status: String = "",
    val vendorName: String = "",
    val expectedDay: String = "",
    val lines: List<ProcLine> = emptyList(),
    val total: Double = 0.0,
    val receivedQty: List<Double> = emptyList(),
    val heldCount: Int = 0,
)

private fun linesOf(d: DocumentSnapshot): List<ProcLine> =
    (d.get("lines") as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.map {
        ProcLine(
            description = it["description"]?.toString() ?: "",
            qty = (it["qty"] as? Number)?.toDouble() ?: 0.0,
            unit = it["unit"]?.toString() ?: "",
            rate = (it["rate"] as? Number)?.toDouble() ?: 0.0,
            inventoryItemId = it["inventoryItemId"]?.toString() ?: "",
        )
    }

private fun requestStatus(s: String): Pair<String, Tone> = when (s) {
    "submitted" -> L("ఆమోదం కోసం", "Waiting for approval") to Tone.WARNING
    "approved" -> L("ఆమోదించారు", "Approved") to Tone.GOOD
    "rejected" -> L("తిరస్కరించారు", "Rejected") to Tone.BAD
    "ordered" -> L("ఆర్డర్ రాశారు", "Order written") to Tone.INFO
    else -> L("రద్దు", "Cancelled") to Tone.INFO
}

private fun orderStatus(s: String): Pair<String, Tone> = when (s) {
    "pendingApproval" -> L("యజమాని ఆమోదం కోసం", "Waiting for the owner") to Tone.WARNING
    "approved" -> L("ఆమోదించారు", "Approved") to Tone.GOOD
    "rejected" -> L("తిరస్కరించారు", "Rejected") to Tone.BAD
    "partReceived" -> L("కొంత సరుకు అందింది", "Partly received") to Tone.INFO
    "received" -> L("సరుకు అందింది", "Received") to Tone.GOOD
    else -> L("రద్దు", "Cancelled") to Tone.INFO
}

private fun fmt(q: Double): String = if (q % 1.0 == 0.0) q.toLong().toString() else q.toString()
private fun linesText(lines: List<ProcLine>): String =
    lines.take(3).joinToString(", ") { "${it.description} ${fmt(it.qty)} ${it.unit}" } + if (lines.size > 3) " +${lines.size - 3}" else ""

/**
 * Module 3 on the phone: ask for goods, approve / reject, receive goods against an order.
 * Writing an order and entering the vendor's bill stay on the web.
 */
class ProcurementViewModel(private val role: UserRole) : ViewModel() {
    val uid: String = ServiceLocator.authRepository.currentUid ?: ""
    val isBoss: Boolean = role == UserRole.ADMIN || role == UserRole.MANAGER
    val isAdmin: Boolean = role == UserRole.ADMIN

    var requests by mutableStateOf<List<ProcRequest>>(emptyList())
        private set
    var orders by mutableStateOf<List<ProcOrder>>(emptyList())
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
        private set

    /** The owner sees everything (or one branch), a manager the branch, staff only their own requests. */
    private fun scoped(collection: String, branchId: String?): Query? {
        val col = ServiceLocator.firestore.collection(collection)
        return when {
            role == UserRole.STAFF -> col.whereEqualTo("requestedBy", uid)
            branchId != null -> col.whereEqualTo("branchId", branchId)
            role == UserRole.ADMIN -> col
            else -> null
        }
    }

    init {
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId
                .flatMapLatest { b -> scoped("purchaseRequests", b)?.snapshotsFlow() ?: kotlinx.coroutines.flow.emptyFlow() }
                .catch { e -> error = L("అభ్యర్థనలు లోడ్ కాలేదు", "Could not load requests") + ": ${e.message}" }
                .collect { snap ->
                    requests = snap.documents.map { d ->
                        ProcRequest(
                            id = d.id, number = d.getString("number") ?: "", status = d.getString("status") ?: "", neededBy = d.getString("neededBy") ?: "", lines = linesOf(d),
                            requestedBy = d.getString("requestedBy") ?: "", requestedByName = d.getString("requestedByName") ?: "", poNumber = d.getString("poNumber") ?: "", decideReason = d.getString("decideReason") ?: "",
                        )
                    }.sortedByDescending { it.number }
                }
        }
        if (isBoss) {
            viewModelScope.launch {
                ServiceLocator.branchManager.currentBranchId
                    .flatMapLatest { b -> scoped("purchaseOrders", b)?.snapshotsFlow() ?: kotlinx.coroutines.flow.emptyFlow() }
                    .catch { e -> error = L("ఆర్డర్లు లోడ్ కాలేదు", "Could not load orders") + ": ${e.message}" }
                    .collect { snap ->
                        orders = snap.documents.map { d ->
                            ProcOrder(
                                id = d.id, number = d.getString("number") ?: "", status = d.getString("status") ?: "", vendorName = d.getString("vendorName") ?: "", expectedDay = d.getString("expectedDay") ?: "",
                                lines = linesOf(d), total = (d.get("total") as? Number)?.toDouble() ?: 0.0,
                                receivedQty = (d.get("receivedQty") as? List<*>).orEmpty().map { (it as? Number)?.toDouble() ?: 0.0 },
                                heldCount = (d.get("heldCount") as? Number)?.toInt() ?: 0,
                            )
                        }.sortedByDescending { it.number }
                    }
            }
        }
    }

    private fun run(name: String, data: Map<String, Any?>, done: (Map<String, Any?>) -> String) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            message = ServiceLocator.functions.call(name, data).fold(onSuccess = done, onFailure = { CallableError.from(it).text })
            busy = false
        }
    }

    fun sendRequest(neededBy: String, note: String, lines: List<ProcLine>) = run(
        "savePurchaseRequest",
        mapOf(
            "neededBy" to neededBy,
            "note" to note.trim().ifBlank { null },
            "branchId" to ServiceLocator.branchManager.currentBranchId.value,
            "lines" to lines.map { mapOf("description" to it.description, "qty" to it.qty, "unit" to it.unit) },
        ),
    ) { L("అభ్యర్థన ${it["number"] ?: ""} పంపాం.", "Request ${it["number"] ?: ""} sent.") }

    fun decideRequest(r: ProcRequest, approve: Boolean, reason: String) = run(
        "decidePurchaseRequest", mapOf("id" to r.id, "approve" to approve, "reason" to reason.trim().ifBlank { null }),
    ) { if (approve) L("${r.number} ఆమోదించాం.", "${r.number} approved.") else L("${r.number} తిరస్కరించాం.", "${r.number} rejected.") }

    fun cancelRequest(r: ProcRequest, reason: String) = run("cancelPurchaseRequest", mapOf("id" to r.id, "reason" to reason.trim())) { L("${r.number} రద్దు అయింది.", "${r.number} cancelled.") }

    fun decideOrder(o: ProcOrder, approve: Boolean, reason: String) = run(
        "decidePurchaseOrder", mapOf("id" to o.id, "approve" to approve, "reason" to reason.trim().ifBlank { null }),
    ) { if (approve) L("ఆర్డర్ ${o.number} ఆమోదించాం.", "Order ${o.number} approved.") else L("ఆర్డర్ ${o.number} తిరస్కరించాం.", "Order ${o.number} rejected.") }

    fun receive(o: ProcOrder, billNo: String, lines: List<Map<String, Any?>>) = run(
        "receiveGoods", mapOf("poId" to o.id, "vendorBillNo" to billNo.trim().ifBlank { null }, "lines" to lines),
    ) { r ->
        val skipped = (r["stockSkipped"] as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.joinToString("; ") { L(it["te"]?.toString() ?: "", it["en"]?.toString() ?: "") }
        L("రసీదు ${r["number"] ?: ""} నమోదైంది.", "Receipt ${r["number"] ?: ""} recorded.") +
            if (skipped.isBlank()) "" else " " + L("Stock మార్చనివి — చేతితో సరిచేయండి: $skipped", "Stock not changed — adjust by hand: $skipped")
    }
}

@Composable
fun ProcurementScreen(padding: PaddingValues, role: UserRole) {
    val vm: ProcurementViewModel = viewModel(key = "procure-$role", factory = viewModelFactory { initializer { ProcurementViewModel(role) } })
    var newRequest by remember { mutableStateOf(false) }
    var reasonFor by remember { mutableStateOf<Pair<String, (String) -> Unit>?>(null) }
    var receiving by remember { mutableStateOf<ProcOrder?>(null) }
    val openRequests = vm.requests.filter { it.status == "submitted" || it.status == "approved" }
    val openOrders = vm.orders.filter { it.status == "pendingApproval" || it.status == "approved" || it.status == "partReceived" }

    LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            vm.error?.let { NoticeBox(it, Tone.BAD) }
            vm.message?.let { NoticeBox(it, Tone.INFO) }
            Button(onClick = { vm.message = null; newRequest = true }, enabled = !vm.busy, modifier = Modifier.fillMaxWidth()) { Text(L("కొత్త కొనుగోలు అభ్యర్థన", "New purchase request")) }
            SectionLabel(L("అభ్యర్థనలు (${openRequests.size})", "Requests (${openRequests.size})"))
            if (openRequests.isEmpty()) Text(L("తెరిచి ఉన్న అభ్యర్థనలు లేవు.", "No open requests."), style = MaterialTheme.typography.bodySmall)
        }
        items(openRequests, key = { "r" + it.id }) { r ->
            val (label, tone) = requestStatus(r.status)
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row { Text(r.number, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Pill(label, tone) }
                    Text(linesText(r.lines), style = MaterialTheme.typography.bodyMedium)
                    Text(L("కావలసిన తేదీ ", "Needed by ") + DayKey.display(r.neededBy) + " · " + r.requestedByName, style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (vm.isBoss && r.status == "submitted") {
                            Button(onClick = { vm.decideRequest(r, true, "") }, enabled = !vm.busy) { Text(L("ఆమోదించు", "Approve")) }
                            OutlinedButton(onClick = { reasonFor = L("తిరస్కరించడానికి కారణం", "Reason for rejecting") to { why: String -> vm.decideRequest(r, false, why) } }, enabled = !vm.busy) { Text(L("తిరస్కరించు", "Reject")) }
                        }
                        if (vm.isBoss || r.requestedBy == vm.uid) {
                            TextButton(onClick = { reasonFor = L("రద్దు చేయడానికి కారణం", "Reason for cancelling") to { why: String -> vm.cancelRequest(r, why) } }, enabled = !vm.busy) { Text(L("రద్దు", "Cancel")) }
                        }
                    }
                    if (vm.isBoss && r.status == "approved") Text(L("ఆర్డర్ web లో రాయండి.", "Write the order on the web."), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (vm.isBoss) {
            item {
                SectionLabel(L("ఆర్డర్లు (${openOrders.size})", "Orders (${openOrders.size})"))
                if (openOrders.isEmpty()) Text(L("తెరిచి ఉన్న ఆర్డర్లు లేవు.", "No open orders."), style = MaterialTheme.typography.bodySmall)
            }
            items(openOrders, key = { "o" + it.id }) { o ->
                val (label, tone) = orderStatus(o.status)
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row { Text("${o.number} · ${o.vendorName}", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Pill(label, tone) }
                        Text(linesText(o.lines), style = MaterialTheme.typography.bodyMedium)
                        Text(rupees(o.total) + " · " + L("రావలసిన తేదీ ", "Expected ") + DayKey.display(o.expectedDay), style = MaterialTheme.typography.bodySmall)
                        if (o.heldCount > 0) Pill(L("బిల్ సరిపోలలేదు — చెల్లింపు ఆపాం", "Bill does not match — payment on hold"), Tone.BAD)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (vm.isAdmin && o.status == "pendingApproval") {
                                Button(onClick = { vm.decideOrder(o, true, "") }, enabled = !vm.busy) { Text(L("ఆమోదించు", "Approve")) }
                                OutlinedButton(onClick = { reasonFor = L("తిరస్కరించడానికి కారణం", "Reason for rejecting") to { why: String -> vm.decideOrder(o, false, why) } }, enabled = !vm.busy) { Text(L("తిరస్కరించు", "Reject")) }
                            }
                            if (o.status == "approved" || o.status == "partReceived") {
                                Button(onClick = { vm.message = null; receiving = o }, enabled = !vm.busy) { Text(L("సరుకు తీసుకో", "Receive goods")) }
                            }
                        }
                    }
                }
            }
        }
    }

    if (newRequest) NewRequestDialog(onSend = { day, note, lines -> vm.sendRequest(day, note, lines); newRequest = false }, onDismiss = { newRequest = false })
    reasonFor?.let { (title, action) ->
        var text by remember(title) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { reasonFor = null },
            title = { Text(title) },
            text = { AppTextField(text, { text = it }, L("కారణం", "Reason"), singleLine = false) },
            confirmButton = { TextButton(onClick = { action(text); reasonFor = null }, enabled = text.isNotBlank()) { Text(L("సరే", "OK")) } },
            dismissButton = { TextButton(onClick = { reasonFor = null }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
    receiving?.let { o -> ReceiveDialog(o, onSave = { billNo, lines -> vm.receive(o, billNo, lines); receiving = null }, onDismiss = { receiving = null }) }
}

@Composable
private fun NewRequestDialog(onSend: (String, String, List<ProcLine>) -> Unit, onDismiss: () -> Unit) {
    var neededBy by remember { mutableStateOf(DayKey.today()) }
    var note by remember { mutableStateOf("") }
    var lines by remember { mutableStateOf<List<ProcLine>>(emptyList()) }
    var item by remember { mutableStateOf("") }
    var qtyText by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf(PURCHASE_UNITS.first()) }
    val qty = qtyText.toDoubleOrNull()
    val canAdd = item.isNotBlank() && qty != null && qty > 0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("కొత్త కొనుగోలు అభ్యర్థన", "New purchase request")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                DayPickerField(L("ఎప్పటికి కావాలి", "Needed by"), neededBy, { neededBy = it })
                lines.forEachIndexed { i, l ->
                    Row {
                        Text("${l.description} ${fmt(l.qty)} ${l.unit}", Modifier.weight(1f).padding(top = 12.dp))
                        TextButton(onClick = { lines = lines.filterIndexed { j, _ -> j != i } }) { Text(L("తీసేయి", "Remove")) }
                    }
                }
                SectionLabel(L("వస్తువు చేర్చు", "Add an item"))
                AppTextField(item, { item = it }, L("వస్తువు", "Item"))
                AppTextField(qtyText, { qtyText = it }, L("పరిమాణం", "Quantity"), keyboardType = KeyboardType.Decimal)
                ChoiceChips(PURCHASE_UNITS, unit, { it }, { unit = it })
                OutlinedButton(
                    onClick = {
                        if (qty != null) lines = lines + ProcLine(description = item.trim(), qty = qty, unit = unit)
                        item = ""
                        qtyText = ""
                    },
                    enabled = canAdd,
                ) { Text(L("జాబితాలో చేర్చు", "Add to the list")) }
                AppTextField(note, { note = it }, L("గమనిక (ఐచ్ఛికం)", "Note (optional)"), singleLine = false)
            }
        },
        confirmButton = { TextButton(onClick = { onSend(neededBy, note, lines) }, enabled = lines.isNotEmpty() && neededBy >= DayKey.today()) { Text(L("అభ్యర్థన పంపు", "Send request")) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

/** Module 3b on the phone: delivered and accepted per line; the difference is sent back and needs a reason. */
@Composable
private fun ReceiveDialog(order: ProcOrder, onSave: (String, List<Map<String, Any?>>) -> Unit, onDismiss: () -> Unit) {
    val due = order.lines.mapIndexed { i, l -> maxOf(0.0, Math.round((l.qty - (order.receivedQty.getOrNull(i) ?: 0.0)) * 1000) / 1000.0) }
    var delivered by remember(order.id) { mutableStateOf(due.map { if (it > 0) fmt(it) else "" }) }
    var accepted by remember(order.id) { mutableStateOf(due.map { if (it > 0) fmt(it) else "" }) }
    var reasons by remember(order.id) { mutableStateOf(due.map { "" }) }
    var expiry by remember(order.id) { mutableStateOf(due.map { "" }) }
    var billNo by remember(order.id) { mutableStateOf("") }
    fun <T> List<T>.with(i: Int, v: T): List<T> = mapIndexed { j, x -> if (j == i) v else x }

    val rows = order.lines.indices.map { i ->
        val d = if (delivered[i].isBlank()) 0.0 else delivered[i].toDoubleOrNull()
        val a = if (accepted[i].isBlank()) 0.0 else accepted[i].toDoubleOrNull()
        val back = if (d != null && a != null) Math.round((d - a) * 1000) / 1000.0 else 0.0
        val ok = d != null && a != null && d >= 0 && a >= 0 && a <= d && a <= due[i] && (back == 0.0 || reasons[i].isNotBlank())
        Triple(d ?: 0.0, a ?: 0.0, ok) to back
    }
    val valid = rows.all { it.first.third } && rows.any { it.first.first > 0 }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("సరుకు రసీదు — ${order.number}", "Goods receipt — ${order.number}")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                AppTextField(billNo, { billNo = it }, L("బిల్ / చలాన్ నంబర్ (ఐచ్ఛికం)", "Bill / challan no. (optional)"))
                order.lines.forEachIndexed { i, l ->
                    SectionLabel("${l.description} — " + L("రావలసింది ${fmt(due[i])} ${l.unit}", "still due ${fmt(due[i])} ${l.unit}"))
                    if (due[i] > 0) {
                        AppTextField(delivered[i], { delivered = delivered.with(i, it) }, L("వచ్చినది", "Delivered"), keyboardType = KeyboardType.Decimal)
                        AppTextField(accepted[i], { accepted = accepted.with(i, it) }, L("తీసుకున్నది", "Accepted"), keyboardType = KeyboardType.Decimal, isError = !rows[i].first.third)
                        if (rows[i].second > 0) {
                            AppTextField(reasons[i], { reasons = reasons.with(i, it) }, L("తిప్పి పంపినది ${fmt(rows[i].second)} ${l.unit} — కారణం", "Sent back ${fmt(rows[i].second)} ${l.unit} — reason"), isError = reasons[i].isBlank())
                        }
                        DayPickerField(L("గడువు తేదీ (ఉంటే)", "Expiry date (if any)"), expiry[i], { expiry = expiry.with(i, it) })
                        if (l.inventoryItemId.isBlank()) Text(L("నిల్వ వస్తువుకి లింక్ లేదు — నిల్వలో కలవదు.", "Not linked to a stock item — stock will not change."), style = MaterialTheme.typography.bodySmall)
                    } else {
                        Text(L("పూర్తిగా అందింది.", "Fully received."), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val out = rows.mapIndexedNotNull { i, (t, back) ->
                        if (t.first <= 0) null
                        else mapOf(
                            "line" to i,
                            "delivered" to t.first,
                            "accepted" to t.second,
                            "rejectReason" to reasons[i].trim().takeIf { back > 0 },
                            "expiryDay" to expiry[i].takeIf { it.isNotBlank() && t.second > 0 },
                        )
                    }
                    onSave(billNo, out)
                },
                enabled = valid,
            ) { Text(L("రసీదు నమోదు చేయి", "Record receipt")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
