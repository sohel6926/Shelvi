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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
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
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

/** One line of a checklist the owner wrote (settings.foodSafety). Nothing is built in — see docs/requirements-checklist.md X10 / X38. */
data class SafetyItem(val key: String, val te: String, val en: String, val isNumber: Boolean, val min: Double?, val max: Double?, val unit: String) {
    val label: String get() = L(te, en.ifBlank { te })
}

data class SafetyList(val id: String, val te: String, val en: String, val dailyBy: String, val items: List<SafetyItem>) {
    val label: String get() = L(te, en.ifBlank { te })
}

data class SafetyCheckRow(val id: String, val name: String, val day: String, val by: String, val result: String, val failed: Int, val checklistId: String)
data class SafetyIncidentRow(val id: String, val what: String, val severity: String, val day: String, val by: String, val status: String, val resolution: String, val byUid: String)

private fun listFrom(m: Map<*, *>): SafetyList? {
    val id = m["id"]?.toString().orEmpty()
    if (id.isBlank()) return null
    val items = (m["items"] as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.map {
        SafetyItem(
            key = it["key"]?.toString().orEmpty(), te = it["te"]?.toString().orEmpty(), en = it["en"]?.toString().orEmpty(),
            isNumber = it["type"] == "number", min = (it["min"] as? Number)?.toDouble(), max = (it["max"] as? Number)?.toDouble(), unit = it["unit"]?.toString().orEmpty(),
        )
    }
    return SafetyList(id, m["te"]?.toString().orEmpty(), m["en"]?.toString().orEmpty(), m["dailyBy"]?.toString().orEmpty(), items)
}

private fun fmt(q: Double): String = if (q % 1.0 == 0.0) q.toLong().toString() else q.toString()
private fun severityLabel(s: String) = when (s) { "low" -> L("చిన్నది", "Minor"); "high" -> L("తీవ్రం", "Serious"); else -> L("మధ్యస్థం", "Medium") }

/**
 * Module 5e on the phone: do a check from the owner's checklists, see past checks, report a food incident and (owner / manager)
 * close one. The checklists themselves are written on the web by the owner. Staff get the checklists from the server
 * (listSafetyChecklists) because they cannot read settings.
 */
class FoodSafetyViewModel(private val role: UserRole) : ViewModel() {
    val uid: String = ServiceLocator.authRepository.currentUid ?: ""
    val isBoss: Boolean = role == UserRole.ADMIN || role == UserRole.MANAGER

    var lists by mutableStateOf<List<SafetyList>>(emptyList())
        private set
    var listsLoaded by mutableStateOf(false)
        private set
    var checks by mutableStateOf<List<SafetyCheckRow>>(emptyList())
        private set
    var incidents by mutableStateOf<List<SafetyIncidentRow>>(emptyList())
        private set
    var message by mutableStateOf<Pair<String, Tone>?>(null)
    var busy by mutableStateOf(false)
        private set

    /** The owner: the chosen branch (or all); a manager: own branch; staff: only their own. */
    private fun scoped(collection: String, branchId: String?): Query? {
        val col = ServiceLocator.firestore.collection(collection)
        return when {
            role == UserRole.STAFF -> col.whereEqualTo("byUid", uid)
            branchId != null -> col.whereEqualTo("branchId", branchId)
            role == UserRole.ADMIN -> col
            else -> null
        }
    }

    init {
        loadLists()
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId
                .flatMapLatest { b -> scoped("safetyChecks", b)?.snapshotsFlow() ?: kotlinx.coroutines.flow.emptyFlow() }
                .catch { }
                .collect { snap ->
                    checks = snap.documents.map(::checkOf).sortedByDescending { it.day }.take(60)
                }
        }
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId
                .flatMapLatest { b -> scoped("safetyIncidents", b)?.snapshotsFlow() ?: kotlinx.coroutines.flow.emptyFlow() }
                .catch { }
                .collect { snap ->
                    incidents = snap.documents.map(::incidentOf).sortedWith(compareBy<SafetyIncidentRow> { it.status != "open" }.thenByDescending { it.day }).take(60)
                }
        }
    }

    private fun checkOf(d: DocumentSnapshot) = SafetyCheckRow(
        id = d.id, name = ((d.get("name") as? Map<*, *>)?.let { L(it["te"]?.toString().orEmpty(), it["en"]?.toString().orEmpty()) }).orEmpty(),
        day = d.getString("day").orEmpty(), by = (d.get("by") as? Map<*, *>)?.get("name")?.toString().orEmpty(), result = d.getString("result").orEmpty(),
        failed = (d.get("failed") as? Number)?.toInt() ?: 0, checklistId = d.getString("checklistId").orEmpty(),
    )

    private fun incidentOf(d: DocumentSnapshot) = SafetyIncidentRow(
        id = d.id, what = d.getString("what").orEmpty(), severity = d.getString("severity").orEmpty(), day = d.getString("day").orEmpty(),
        by = (d.get("by") as? Map<*, *>)?.get("name")?.toString().orEmpty(), status = d.getString("status").orEmpty(), resolution = d.getString("resolution").orEmpty(), byUid = d.getString("byUid").orEmpty(),
    )

    fun loadLists() {
        viewModelScope.launch {
            ServiceLocator.functions.call("listSafetyChecklists", emptyMap()).fold(
                onSuccess = { r -> lists = (r["checklists"] as? List<*>).orEmpty().mapNotNull { (it as? Map<*, *>)?.let(::listFrom) }; listsLoaded = true },
                onFailure = { message = CallableError.from(it).text to Tone.BAD; listsLoaded = true },
            )
        }
    }

    private fun branchData(): Map<String, Any?> = if (role == UserRole.ADMIN) mapOf("branchId" to ServiceLocator.branchManager.currentBranchId.value) else emptyMap()

    fun saveCheck(list: SafetyList, answers: Map<String, Any>, note: String, done: () -> Unit) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            ServiceLocator.functions.call("saveSafetyCheck", mapOf("checklistId" to list.id, "answers" to answers, "note" to note.trim().ifBlank { null }) + branchData()).fold(
                onSuccess = { r ->
                    val failed = (r["failed"] as? Number)?.toInt() ?: 0
                    message = if (failed == 0) L("తనిఖీ నమోదైంది — అన్నీ సరిగా ఉన్నాయి ✓", "Check saved — everything is fine ✓") to Tone.GOOD
                    else L("తనిఖీ నమోదైంది — $failed అంశాలు సరిగా లేవు. యజమానికి, మేనేజర్‌కు తెలియజేశాం.", "Check saved — $failed lines are not fine. The owner and manager have been told.") to Tone.WARNING
                    done()
                },
                onFailure = { message = CallableError.from(it).text to Tone.BAD },
            )
            busy = false
        }
    }

    fun reportIncident(what: String, severity: String, action: String, done: () -> Unit) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            ServiceLocator.functions.call("saveSafetyIncident", mapOf("what" to what.trim(), "severity" to severity, "action" to action.trim().ifBlank { null }) + branchData()).fold(
                onSuccess = { message = L("సంఘటన నమోదైంది. యజమానికి తెలియజేశాం.", "Incident saved. The owner has been told.") to Tone.GOOD; done() },
                onFailure = { message = CallableError.from(it).text to Tone.BAD },
            )
            busy = false
        }
    }

    fun resolve(i: SafetyIncidentRow, resolution: String) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            ServiceLocator.functions.call("resolveSafetyIncident", mapOf("id" to i.id, "resolution" to resolution.trim())).fold(
                onSuccess = { message = L("సంఘటన ముగిసింది ✓", "Incident resolved ✓") to Tone.GOOD },
                onFailure = { message = CallableError.from(it).text to Tone.BAD },
            )
            busy = false
        }
    }
}

@Composable
fun FoodSafetyScreen(padding: PaddingValues, role: UserRole) {
    val vm: FoodSafetyViewModel = viewModel(key = "safety-$role", factory = viewModelFactory { initializer { FoodSafetyViewModel(role) } })
    var tab by remember { mutableStateOf("check") }
    var reporting by remember { mutableStateOf(false) }
    var resolving by remember { mutableStateOf<SafetyIncidentRow?>(null) }
    val openIncidents = vm.incidents.count { it.status == "open" }

    Column(Modifier.padding(padding).fillMaxSize()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = tab == "check", onClick = { tab = "check" }, label = { Text(L("తనిఖీ చేయి", "Do a check")) })
            FilterChip(selected = tab == "history", onClick = { tab = "history" }, label = { Text(L("చరిత్ర (${vm.checks.size})", "Past (${vm.checks.size})")) })
            FilterChip(selected = tab == "incidents", onClick = { tab = "incidents" }, label = { Text(L("సంఘటనలు" + if (openIncidents > 0) " ($openIncidents)" else "", "Incidents" + if (openIncidents > 0) " ($openIncidents)" else "")) })
        }
        vm.message?.let { (t, tone) -> NoticeBox(t, tone, Modifier.padding(horizontal = 16.dp)) }
        when (tab) {
            "check" -> DoCheck(vm)
            "history" -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (vm.checks.isEmpty()) item { Text(L("ఇంకా తనిఖీలు లేవు.", "No checks yet."), style = MaterialTheme.typography.bodySmall) }
                items(vm.checks, key = { it.id }) { c ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row { Text(c.name, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall); if (c.result == "pass") Pill(L("సరిగా ఉంది", "Fine"), Tone.GOOD) else Pill(L("${c.failed} అంశాలు సరిగా లేవు", "${c.failed} lines not fine"), Tone.BAD) }
                            Text(c.day + " · " + c.by, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Button(onClick = { vm.message = null; reporting = true }, enabled = !vm.busy, modifier = Modifier.fillMaxWidth()) { Text(L("+ ఆహార సంఘటన నమోదు", "+ Report a food incident")) } }
                if (vm.incidents.isEmpty()) item { Text(L("సంఘటనలు లేవు.", "No incidents."), style = MaterialTheme.typography.bodySmall) }
                items(vm.incidents, key = { it.id }) { i ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row { Text(i.what, Modifier.weight(1f)); Pill(if (i.status == "open") L("తెరిచి ఉంది", "Open") else L("ముగిసింది", "Resolved"), if (i.status == "open") Tone.WARNING else Tone.GOOD) }
                            Text(severityLabel(i.severity) + " · " + i.day + " · " + i.by, style = MaterialTheme.typography.bodySmall)
                            if (i.resolution.isNotBlank()) Text(L("పరిష్కారం: ", "Resolution: ") + i.resolution, style = MaterialTheme.typography.bodySmall)
                            if (vm.isBoss && i.status == "open") {
                                if (i.byUid == vm.uid && role != UserRole.ADMIN) Text(L("మీరు నమోదు చేసినది — వేరొకరు ముగించాలి.", "You reported this — someone else must close it."), style = MaterialTheme.typography.bodySmall)
                                else TextButton(onClick = { vm.message = null; resolving = i }, enabled = !vm.busy) { Text(L("ముగించు", "Close it")) }
                            }
                        }
                    }
                }
            }
        }
    }
    if (reporting) ReportDialog(onSave = { what, sev, action -> vm.reportIncident(what, sev, action) { reporting = false } }, onDismiss = { reporting = false })
    resolving?.let { i ->
        var text by remember(i.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { resolving = null },
            title = { Text(L("సంఘటనను ఎలా ముగించారు?", "How was it resolved?")) },
            text = { AppTextField(text, { text = it }, L("పరిష్కారం", "Resolution"), singleLine = false) },
            confirmButton = { TextButton(onClick = { vm.resolve(i, text); resolving = null }, enabled = text.isNotBlank()) { Text(L("సరే", "OK")) } },
            dismissButton = { TextButton(onClick = { resolving = null }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}

@Composable
private fun DoCheck(vm: FoodSafetyViewModel) {
    var listId by remember { mutableStateOf<String?>(null) }
    val list = vm.lists.find { it.id == listId }
    // yes/no answers: true / false; measured lines: text. Cleared when another checklist is chosen.
    var yesNo by remember(listId) { mutableStateOf<Map<String, Boolean>>(emptyMap()) }
    var nums by remember(listId) { mutableStateOf<Map<String, String>>(emptyMap()) }
    var note by remember(listId) { mutableStateOf("") }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!vm.listsLoaded) item { Text(L("చెక్‌లిస్ట్‌లు వస్తున్నాయి…", "Loading checklists…"), style = MaterialTheme.typography.bodySmall) }
        else if (vm.lists.isEmpty()) item { NoticeBox(L("ఇంకా చెక్‌లిస్ట్‌లు లేవు. యజమాని web లో \"చెక్‌లిస్ట్‌లు\" ట్యాబ్‌లో తనిఖీ అంశాలు రాయాలి.", "There are no checklists yet. The owner writes the lines on the web, \"Checklists\" tab."), Tone.INFO) }
        else {
            item { ChoiceChips(vm.lists, list, { it.label }, { listId = it.id }) }
        }
        if (list != null) {
            items(list.items, key = { list.id + it.key }) { it ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(it.label, style = MaterialTheme.typography.titleSmall)
                        if (!it.isNumber) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                val v = yesNo[it.key]
                                if (v == true) Button(onClick = { yesNo = yesNo + (it.key to true) }) { Text(L("సరే", "OK")) } else OutlinedButton(onClick = { yesNo = yesNo + (it.key to true) }) { Text(L("సరే", "OK")) }
                                if (v == false) Button(onClick = { yesNo = yesNo + (it.key to false) }) { Text(L("సరిగా లేదు", "Not OK")) } else OutlinedButton(onClick = { yesNo = yesNo + (it.key to false) }) { Text(L("సరిగా లేదు", "Not OK")) }
                            }
                        } else {
                            val range = listOfNotNull(it.min?.let { m -> L("కనిష్టం ", "min ") + fmt(m) }, it.max?.let { m -> L("గరిష్టం ", "max ") + fmt(m) }).joinToString(", ")
                            AppTextField(nums[it.key].orEmpty(), { v -> nums = nums + (it.key to v) }, it.unit.ifBlank { L("అంకె", "Number") } + if (range.isNotBlank()) " ($range)" else "", keyboardType = KeyboardType.Decimal)
                        }
                    }
                }
            }
            item {
                AppTextField(note, { note = it }, L("గమనిక (ఐచ్ఛికం)", "Note (optional)"), singleLine = false)
                val complete = list.items.all { if (it.isNumber) nums[it.key]?.toDoubleOrNull() != null else yesNo[it.key] != null }
                Button(
                    onClick = {
                        val answers = list.items.associate { it.key to (if (it.isNumber) nums[it.key]!!.toDouble() else yesNo[it.key]!!) as Any }
                        vm.saveCheck(list, answers, note) { listId = null }
                    },
                    enabled = complete && !vm.busy, modifier = Modifier.fillMaxWidth(),
                ) { Text(L("తనిఖీ సేవ్", "Save the check")) }
            }
        }
    }
}

@Composable
private fun ReportDialog(onSave: (String, String, String) -> Unit, onDismiss: () -> Unit) {
    var what by remember { mutableStateOf("") }
    var severity by remember { mutableStateOf("medium") }
    var action by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("ఆహార సంఘటన", "Food incident")) },
        text = {
            Column {
                AppTextField(what, { what = it }, L("ఏం జరిగింది?", "What happened?"), singleLine = false)
                SectionLabel(L("ఎంత తీవ్రం", "How serious"))
                ChoiceChips(listOf("low", "medium", "high"), severity, { severityLabel(it) }, { severity = it })
                AppTextField(action, { action = it }, L("వెంటనే ఏం చేశారు (ఐచ్ఛికం)", "Action taken (optional)"), singleLine = false)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(what, severity, action) }, enabled = what.trim().length >= 5) { Text(L("నమోదు", "Save")) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
