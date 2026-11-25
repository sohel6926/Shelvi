package com.example.suseelacateringcrm.ui.safety

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
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

data class DispatchLineRow(val line: Int, val kind: String, val name: String, val qty: Double, val unit: String, val loadedQty: Double?, val deliveredQty: Double?, val returnedQty: Double?) {
    val returnable: Boolean get() = kind == "container" || kind == "equipment"
    val sent: Double get() = deliveredQty ?: loadedQty ?: qty
}

data class DispatchRow(val id: String, val number: String, val status: String, val customer: String, val eventDay: String, val vehicle: String, val lines: List<DispatchLineRow>)

/** Status → (label, tone, the step that comes next, its button text). Steps run in this order (dispatchRules.ts). */
private fun statusInfo(s: String): Triple<String, Tone, Pair<String, String>?> = when (s) {
    "packing" -> Triple(L("ప్యాక్ చేస్తున్నారు", "Packing"), Tone.INFO, "packed" to L("ప్యాకింగ్ పూర్తయింది", "Packing done"))
    "packed" -> Triple(L("ప్యాక్ అయింది", "Packed"), Tone.INFO, "loaded" to L("లోడ్ తనిఖీ", "Load check"))
    "loaded" -> Triple(L("లోడ్ అయింది", "Loaded"), Tone.WARNING, "dispatched" to L("వాహనం బయలుదేరింది", "Vehicle left"))
    "dispatched" -> Triple(L("దారిలో ఉంది", "On the way"), Tone.WARNING, "delivered" to L("వేదిక వద్ద అందింది", "Received at the venue"))
    "delivered" -> Triple(L("అందింది", "Delivered"), Tone.GOOD, "returned" to L("తిరిగి వచ్చినవి లెక్క", "Count what came back"))
    "returned" -> Triple(L("తిరిగి వచ్చాయి", "Returned"), Tone.GOOD, "reconciled" to L("లెక్క సరిపోల్చు", "Reconcile"))
    "reconciled" -> Triple(L("లెక్క సరిపోయింది", "Reconciled"), Tone.GOOD, null)
    else -> Triple(L("రద్దయింది", "Cancelled"), Tone.BAD, null)
}

private fun fmt(q: Double): String = if (q % 1.0 == 0.0) q.toLong().toString() else q.toString()

/**
 * Module 5f on the phone: the packing → load → dispatch → delivery → return → reconcile steps of an event's load.
 * The load list itself (and its quantities from the cooking plan) is written on the web; here the staff on the
 * event move it along and the owner / manager reconcile or cancel.
 */
class DispatchViewModel(private val role: UserRole) : ViewModel() {
    val isBoss: Boolean = role == UserRole.ADMIN || role == UserRole.MANAGER
    var rows by mutableStateOf<List<DispatchRow>>(emptyList())
        private set
    var message by mutableStateOf<Pair<String, Tone>?>(null)
    var busy by mutableStateOf(false)
        private set

    private fun scoped(branchId: String?): Query? {
        val col = ServiceLocator.firestore.collection("dispatches")
        return when {
            role == UserRole.STAFF -> ServiceLocator.staffScopeId()?.takeIf { it.isNotBlank() }?.let { col.whereArrayContains("assignedStaffIds", it) }
            branchId != null -> col.whereEqualTo("branchId", branchId)
            role == UserRole.ADMIN -> col
            else -> null
        }
    }

    init {
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId
                .flatMapLatest { b -> scoped(b)?.snapshotsFlow() ?: kotlinx.coroutines.flow.emptyFlow() }
                .catch { }
                .collect { snap -> rows = snap.documents.map(::rowOf).sortedByDescending { it.number }.take(60) }
        }
    }

    private fun rowOf(d: DocumentSnapshot) = DispatchRow(
        id = d.id, number = d.getString("number").orEmpty(), status = d.getString("status").orEmpty(), customer = d.getString("customerName").orEmpty(),
        eventDay = d.getString("eventDay").orEmpty(), vehicle = d.getString("vehicleName").orEmpty(),
        lines = (d.get("lines") as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.map {
            fun n(k: String) = (it[k] as? Number)?.toDouble()
            DispatchLineRow((it["line"] as? Number)?.toInt() ?: 0, it["kind"]?.toString().orEmpty(), it["name"]?.toString().orEmpty(), n("qty") ?: 0.0, it["unit"]?.toString().orEmpty(), n("loadedQty"), n("deliveredQty"), n("returnedQty"))
        },
    )

    private fun run(name: String, data: Map<String, Any?>, ok: String, done: () -> Unit = {}) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            ServiceLocator.functions.call(name, data).fold(
                onSuccess = { message = ok to Tone.GOOD; done() },
                onFailure = { message = CallableError.from(it).text to Tone.BAD },
            )
            busy = false
        }
    }

    fun advance(d: DispatchRow, step: String, extra: Map<String, Any?>, done: () -> Unit) =
        run("advanceDispatch", mapOf("id" to d.id, "step" to step) + extra, L("${d.number}: నమోదైంది ✓", "${d.number}: saved ✓"), done)

    fun cancel(d: DispatchRow, reason: String) = run("cancelDispatch", mapOf("id" to d.id, "reason" to reason.trim()), L("${d.number} రద్దయింది.", "${d.number} cancelled."))
}

@Composable
fun DispatchScreen(padding: PaddingValues, role: UserRole) {
    val vm: DispatchViewModel = viewModel(key = "dispatch-$role", factory = viewModelFactory { initializer { DispatchViewModel(role) } })
    var stepFor by remember { mutableStateOf<DispatchRow?>(null) }
    var cancelling by remember { mutableStateOf<DispatchRow?>(null) }
    val open = vm.rows.filter { it.status != "reconciled" && it.status != "cancelled" }
    val closed = vm.rows.filter { it.status == "reconciled" || it.status == "cancelled" }.take(10)

    LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            vm.message?.let { (t, tone) -> NoticeBox(t, tone) }
            Text(L("కొత్త జాబితా web లో రాయండి; ఇక్కడ దశలు నమోదు చేయండి.", "Write a new load list on the web; record the steps here."), style = MaterialTheme.typography.bodySmall)
            SectionLabel(L("నడుస్తున్నవి (${open.size})", "In progress (${open.size})"))
            if (open.isEmpty()) Text(L("నడుస్తున్న పంపిణీలు లేవు.", "Nothing in progress."), style = MaterialTheme.typography.bodySmall)
        }
        items(open + closed, key = { it.id }) { d ->
            val (label, tone, next) = statusInfo(d.status)
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row { Text(d.number, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Pill(label, tone) }
                    Text(d.customer + " · " + DayKey.display(d.eventDay), style = MaterialTheme.typography.bodySmall)
                    if (d.vehicle.isNotBlank()) Text(L("వాహనం: ", "Vehicle: ") + d.vehicle, style = MaterialTheme.typography.bodySmall)
                    d.lines.forEach { l -> Text("• ${l.name} ${fmt(l.qty)} ${l.unit}" + if (l.returnable) "  ↩" else "", style = MaterialTheme.typography.bodyMedium) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (next != null && (next.first != "reconciled" || vm.isBoss)) Button(onClick = { vm.message = null; stepFor = d }, enabled = !vm.busy) { Text(next.second) }
                        if (vm.isBoss && d.status in listOf("packing", "packed", "loaded")) TextButton(onClick = { vm.message = null; cancelling = d }, enabled = !vm.busy) { Text(L("రద్దు", "Cancel")) }
                    }
                }
            }
        }
    }
    stepFor?.let { d -> StepDialog(vm, d) { stepFor = null } }
    cancelling?.let { d ->
        var text by remember(d.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { cancelling = null },
            title = { Text(L("రద్దు చేయడానికి కారణం", "Reason for cancelling")) },
            text = { AppTextField(text, { text = it }, L("కారణం", "Reason"), singleLine = false) },
            confirmButton = { TextButton(onClick = { vm.cancel(d, text); cancelling = null }, enabled = text.isNotBlank()) { Text(L("సరే", "OK")) } },
            dismissButton = { TextButton(onClick = { cancelling = null }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}

/** Asks only for what the next step needs (same rules as the server: dispatchRules.ts). */
@Composable
private fun StepDialog(vm: DispatchViewModel, d: DispatchRow, onClose: () -> Unit) {
    val step = statusInfo(d.status).third?.first ?: return onClose()
    var note by remember(d.id, step) { mutableStateOf("") }
    var vehicle by remember(d.id, step) { mutableStateOf("") }
    var driver by remember(d.id, step) { mutableStateOf("") }
    var receiver by remember(d.id, step) { mutableStateOf("") }
    var phone by remember(d.id, step) { mutableStateOf("") }
    // Per-line numbers. loaded / delivered start at the full amount; returned must be counted by hand (never assumed).
    var qtys by remember(d.id, step) {
        mutableStateOf(d.lines.associate { l ->
            l.line to when (step) { "loaded" -> fmt(l.qty); "delivered" -> fmt(l.loadedQty ?: l.qty); else -> "" }
        })
    }
    var reasons by remember(d.id, step) { mutableStateOf<Map<Int, String>>(emptyMap()) }
    val qtyLines = when (step) { "loaded", "delivered" -> d.lines; "returned" -> d.lines.filter { it.returnable }; else -> emptyList() }
    val shortages = if (step == "reconciled") d.lines.filter { it.returnable && it.sent - (it.returnedQty ?: 0.0) > 1e-9 } else emptyList()
    val qtyOk = qtyLines.all { qtys[it.line]?.toDoubleOrNull() != null }
    val short = step == "loaded" && d.lines.any { (qtys[it.line]?.toDoubleOrNull() ?: it.qty) < it.qty - 1e-9 }
    val valid = qtyOk && when (step) {
        "loaded" -> vehicle.isNotBlank() && (!short || note.isNotBlank())
        "delivered" -> receiver.isNotBlank()
        "reconciled" -> shortages.all { !reasons[it.line].isNullOrBlank() }
        else -> true
    }
    fun qMap() = qtyLines.associate { it.line.toString() to qtys[it.line]!!.toDouble() }

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(d.number + " — " + (statusInfo(d.status).third?.second ?: "")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (step == "loaded") {
                    AppTextField(vehicle, { vehicle = it }, L("వాహనం (నంబర్ / పేరు)", "Vehicle (number / name)"))
                    AppTextField(driver, { driver = it }, L("డ్రైవర్ (ఐచ్ఛికం)", "Driver (optional)"))
                }
                if (step == "delivered") {
                    AppTextField(receiver, { receiver = it }, L("వేదిక వద్ద తీసుకున్నవారి పేరు", "Received by (name)"))
                    AppTextField(phone, { phone = it }, L("వారి ఫోన్ (ఐచ్ఛికం)", "Their phone (optional)"), keyboardType = KeyboardType.Phone)
                }
                qtyLines.forEach { l ->
                    val hint = when (step) { "loaded" -> L("ప్యాక్ చేసినది ", "Packed "); "delivered" -> L("లోడ్ చేసినది ", "Loaded "); else -> L("పంపినది ", "Sent ") } + fmt(if (step == "loaded") l.qty else if (step == "delivered") (l.loadedQty ?: l.qty) else l.sent)
                    AppTextField(qtys[l.line].orEmpty(), { v -> qtys = qtys + (l.line to v) }, "${l.name} ($hint ${l.unit})", keyboardType = KeyboardType.Decimal)
                }
                if (step == "returned" && qtyLines.isEmpty()) Text(L("తిరిగి రావలసిన వస్తువులు లేవు.", "Nothing is due back."), style = MaterialTheme.typography.bodySmall)
                shortages.forEach { l ->
                    val missing = l.sent - (l.returnedQty ?: 0.0)
                    AppTextField(reasons[l.line].orEmpty(), { v -> reasons = reasons + (l.line to v) }, L("${l.name}: ${fmt(missing)} తిరిగి రాలేదు — కారణం", "${l.name}: ${fmt(missing)} did not come back — reason"))
                }
                if (step == "reconciled" && shortages.isEmpty()) Text(L("అన్నీ తిరిగి వచ్చాయి.", "Everything came back."), style = MaterialTheme.typography.bodySmall)
                AppTextField(note, { note = it }, if (short) L("కారణం (పూర్తిగా లోడ్ కాలేదు)", "Reason (not fully loaded)") else L("గమనిక (ఐచ్ఛికం)", "Note (optional)"), singleLine = false)
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid && !vm.busy,
                onClick = {
                    val extra: Map<String, Any?> = buildMap {
                        put("note", note.trim().ifBlank { null })
                        when (step) {
                            "loaded" -> { put("loaded", qMap()); put("vehicleName", vehicle.trim()); put("driverName", driver.trim().ifBlank { null }) }
                            "delivered" -> { put("delivered", qMap()); put("receiverName", receiver.trim()); put("receiverPhone", phone.trim().ifBlank { null }) }
                            "returned" -> put("returned", qMap())
                            "reconciled" -> put("reasons", shortages.associate { it.line.toString() to reasons[it.line]!!.trim() })
                        }
                    }
                    vm.advance(d, step, extra, onClose)
                },
            ) { Text(L("నమోదు", "Save")) }
        },
        dismissButton = { TextButton(onClick = onClose) { Text(L("వద్దు", "Cancel")) } },
    )
}
