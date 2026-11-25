package com.example.suseelacateringcrm.ui.staffops

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.StaffAdvances
import com.example.suseelacateringcrm.data.remote.addStaffAdvance
import com.example.suseelacateringcrm.data.remote.completeTask
import com.example.suseelacateringcrm.data.remote.listStaffAdvances
import com.example.suseelacateringcrm.data.remote.rateStaff
import com.example.suseelacateringcrm.data.remote.saveShift
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.BookingPickerField
import com.example.suseelacateringcrm.ui.components.CancelRecordDialog
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.SimplePickerField
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.bookingPickLabel
import com.example.suseelacateringcrm.ui.components.numOrNull
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.currentUid
import com.example.suseelacateringcrm.util.launchSafe
import com.example.suseelacateringcrm.util.rDay
import com.example.suseelacateringcrm.util.rMap
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

private fun inr(v: Double) = CurrencyUtils.formatInr(v)

// ============================================================================ R10-1 advances (staff page)

/** Staff page: advances with balance, add (A/M), cancel an untouched one (cancelRecord). */
@Composable
fun StaffAdvancesCard(staffId: String) {
    val role = ServiceLocator.currentRole()
    val canAdd = role == UserRole.ADMIN || role == UserRole.MANAGER
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<StaffAdvances?>(null) }
    var message by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var adding by remember { mutableStateOf(false) }
    var cancelling by remember { mutableStateOf<String?>(null) }
    suspend fun load() {
        ServiceLocator.functions.listStaffAdvances(staffId).fold({ data = it }, { message = CallableError.from(it).text to true })
    }
    LaunchedEffect(staffId) { load() }
    OnRefresh { load() }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.warning).padding(12.dp)) {
        Text(L("అడ్వాన్స్‌లు", "Advances"), style = MaterialTheme.typography.titleMedium)
        message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD) }
        val d = data
        if (d != null) {
            Text(L("ఇంకా కోయాల్సింది: ${inr(d.balance)}", "Still to recover: ${inr(d.balance)}"), fontWeight = FontWeight.SemiBold)
            d.rows.forEach { a ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${DayKey.display(a.date)} · ${inr(a.amount)} · ${advanceStatus(a.status)}")
                        Text(
                            L("కోత నెల ${a.recoverMonth} · కోసింది ${inr(a.recovered)} · మిగిలింది ${inr(a.balance)}", "Recover ${a.recoverMonth} · recovered ${inr(a.recovered)} · left ${inr(a.balance)}") +
                                if (a.note.isNotBlank()) " · ${a.note}" else "",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (canAdd && a.status == "Open" && a.recovered <= 0) TextButton(onClick = { cancelling = a.id }) { Text(L("రద్దు", "Cancel")) }
                }
            }
        }
        if (canAdd) OutlinedButton(onClick = { adding = true }) { Text(L("+ అడ్వాన్స్ ఇవ్వు", "+ Give advance")) }
    }
    if (adding) AdvanceDialog(onDismiss = { adding = false }) { amt, date, month, note ->
        adding = false
        scope.launch {
            message = ServiceLocator.functions.addStaffAdvance(staffId, amt, date, month, note).fold({ it to false }, { CallableError.from(it).text to true })
            load()
        }
    }
    cancelling?.let { id ->
        CancelRecordDialog(L("అడ్వాన్స్", "advance"), onDismiss = { cancelling = null }, onConfirm = { reason ->
            cancelling = null
            scope.launch {
                message = ServiceLocator.functions.cancelRecord(FirestoreCollections.STAFF_ADVANCES, id, reason)
                    .fold({ L("రద్దు చేశాం", "Cancelled") to false }, { CallableError.from(it).text to true })
                load()
            }
        })
    }
}

private fun advanceStatus(s: String) = when (s) {
    "Open" -> L("కోయాలి", "Open")
    "Recovered" -> L("కోసేశాం", "Recovered")
    "Cancelled" -> L("రద్దు", "Cancelled")
    "Old" -> L("పాతది", "Old")
    else -> s
}

@Composable
private fun AdvanceDialog(onDismiss: () -> Unit, onSave: (Double, String, String, String) -> Unit) {
    var amount by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(DayKey.today()) }
    var month by remember { mutableStateOf(DayKey.shiftMonth(DayKey.thisMonth(), 1)) }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("అడ్వాన్స్ ఇవ్వు", "Give advance")) },
        text = {
            Column {
                AppTextField(amount, { amount = it }, L("మొత్తం (₹)", "Amount (₹)"), keyboardType = KeyboardType.Decimal)
                AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(date), { date = DayKey.of(it) })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(L("ఏ నెల జీతంలో కోత: ", "Recover from pay of: ") + month, Modifier.weight(1f))
                    TextButton(onClick = { month = DayKey.shiftMonth(month, -1) }) { Text("‹") }
                    TextButton(onClick = { month = DayKey.shiftMonth(month, 1) }) { Text("›") }
                }
                AppTextField(note, { note = it }, L("గమనిక", "Note"))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val a = numOrNull(amount)
                error = when {
                    a == null || a <= 0 -> L("మొత్తం 0 కంటే ఎక్కువ", "Amount must be more than 0")
                    date > DayKey.today() -> L("భవిష్యత్తు తేదీ కుదరదు", "No future dates")
                    month < date.take(7) -> L("కోత నెల అడ్వాన్స్ నెల లేదా తర్వాత", "Recover month must be the advance month or later")
                    else -> null
                }
                if (error == null) onSave(a!!, date, month, note.trim())
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

/** Staff page: monthly average rating from staff/{id}.ratings[YYYY-MM] = { avg, count } (server trigger). */
@Composable
fun StaffRatingCard(staffId: String) {
    var ratings by remember { mutableStateOf<List<Triple<String, Double, Int>>>(emptyList()) }
    LaunchedEffect(staffId) {
        ServiceLocator.firestore.collection(FirestoreCollections.STAFF).document(staffId).snapshotsFlow().catchLogged("StaffRating").collect { s ->
            val m = s.data?.rMap("ratings").orEmpty()
            ratings = m.mapNotNull { (k, v) -> (v as? Map<*, *>)?.let { r -> Triple(k, (r["avg"] as? Number)?.toDouble() ?: 0.0, (r["count"] as? Number)?.toInt() ?: 0) } }
                .sortedByDescending { it.first }.take(6)
        }
    }
    if (ratings.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.gold).padding(12.dp)) {
        Text(L("పని రేటింగ్ (నెల సగటు)", "Rating (monthly average)"), style = MaterialTheme.typography.titleMedium)
        ratings.forEach { (month, avg, count) -> Text("$month: ${"★".repeat(avg.toInt().coerceIn(0, 5))} ${"%.1f".format(avg)} ($count)") }
    }
}

// ============================================================================ R10-2 shifts, tasks, ratings

data class ShiftRow(val id: String, val bookingId: String, val staffName: String, val roleTe: String, val role: String, val date: String,
                    val startTime: String, val endTime: String, val hours: Double, val customer: String, val note: String, val status: String)

data class TaskRow(val id: String, val title: String, val assigneeName: String, val bookingId: String, val due: String, val status: String, val staffNote: String)

private val SHIFT_ROLES = listOf("cook", "helper", "server", "driver", "supervisor")
private fun shiftRoleLabel(r: String) = when (r) {
    "cook" -> L("వంట మనిషి", "Cook")
    "helper" -> L("హెల్పర్", "Helper")
    "server" -> L("సర్వర్", "Server")
    "driver" -> L("డ్రైవర్", "Driver")
    "supervisor" -> L("సూపర్‌వైజర్", "Supervisor")
    else -> r
}

class StaffWorkViewModel : ViewModel() {
    private val db = ServiceLocator.firestore
    private val branch = ServiceLocator.branchManager.currentBranchId
    val role: UserRole? = ServiceLocator.currentRole()
    val isManager: Boolean = role == UserRole.ADMIN || role == UserRole.MANAGER
    private val myStaffId: String? = ServiceLocator.staffScopeId()

    var tab by mutableStateOf(0)
    var day by mutableStateOf(DayKey.today())
    var message by mutableStateOf<Pair<String, Boolean>?>(null)
    var shifts by mutableStateOf<List<ShiftRow>>(emptyList())
        private set
    var tasks by mutableStateOf<List<TaskRow>>(emptyList())
        private set
    private val _staff = MutableStateFlow<List<Staff>>(emptyList())
    val staff: StateFlow<List<Staff>> = _staff.asStateFlow()
    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()

    init {
        viewModelScope.launch {
            val flow: kotlinx.coroutines.flow.Flow<com.google.firebase.firestore.QuerySnapshot?> = if (isManager) branch.flatMapLatest { b -> scoped(FirestoreCollections.SHIFTS, b).snapshotsFlow() }
            else if (!myStaffId.isNullOrBlank()) db.collection(FirestoreCollections.SHIFTS).whereEqualTo("staffId", myStaffId).snapshotsFlow()
            else flowOf(null)
            flow.catchLogged("StaffWorkVM").collect { q ->
                shifts = q?.documents?.map { d ->
                    val m = d.data ?: emptyMap()
                    ShiftRow(d.id, m.rStr("bookingId"), m.rStr("staffName"), m.rStr("roleTe"), m.rStr("role"), m.rDay("date"),
                        m.rStr("startTime"), m.rStr("endTime"), m.rNum("hours"), m.rStr("customerNameSnapshot"), m.rStr("note"), m.rStr("status"))
                }?.filterNot { it.status.equals("Cancelled", true) }?.sortedWith(compareBy({ it.date }, { it.startTime })) ?: emptyList()
            }
        }
        viewModelScope.launch {
            val flow: kotlinx.coroutines.flow.Flow<com.google.firebase.firestore.QuerySnapshot?> = if (isManager) branch.flatMapLatest { b -> scoped(FirestoreCollections.TASKS, b).snapshotsFlow() }
            else if (!myStaffId.isNullOrBlank()) db.collection(FirestoreCollections.TASKS).whereArrayContains("assignedStaffIds", myStaffId).snapshotsFlow()
            else flowOf(null)
            flow.catchLogged("StaffWorkVM").collect { q ->
                tasks = q?.documents?.map { d ->
                    val m = d.data ?: emptyMap()
                    TaskRow(d.id, m.rStr("title"), m.rStr("assigneeName"), m.rStr("bookingId"), m.rDay("due"), m.rStr("status", "Open"), m.rStr("staffNote"))
                }?.filterNot { it.status.equals("Cancelled", true) }?.sortedWith(compareBy({ it.status == "Done" }, { it.due })) ?: emptyList()
            }
        }
        viewModelScope.launch { branch.flatMapLatest { ServiceLocator.bookingRepository.bookingsFlow(it) }.catchLogged("StaffWorkVM").collect { _bookings.value = it } }
        if (isManager) viewModelScope.launch { branch.flatMapLatest { ServiceLocator.staffRepository.staffFlow(it) }.catchLogged("StaffWorkVM").collect { _staff.value = it } }
    }

    private fun scoped(name: String, b: String?): Query = if (b != null) db.collection(name).whereEqualTo("branchId", b) else db.collection(name)

    private fun act(ok: String, block: suspend () -> Result<*>) = viewModelScope.launch {
        message = block().fold({ ok to false }, { CallableError.from(it).text to true })
    }

    fun toggleTask(t: TaskRow) = act(if (t.status == "Done") L("మళ్ళీ తెరిచాం", "Reopened") else L("పని అయిపోయింది ✓", "Done ✓")) {
        ServiceLocator.functions.completeTask(t.id, t.status != "Done")
    }

    fun saveShift(bookingId: String, sessionId: String, staffId: String, role: String, date: String, start: String, end: String, note: String) =
        act(L("షిఫ్ట్ సేవ్ చేశాం ✓", "Shift saved ✓")) { ServiceLocator.functions.saveShift(null, bookingId, sessionId, staffId, role, date, start, end, note) }

    fun rate(staffId: String, bookingId: String, stars: Int, note: String) =
        act(L("రేటింగ్ సేవ్ చేశాం ✓", "Rating saved ✓")) { ServiceLocator.functions.rateStaff(staffId, bookingId, stars, note) }

    /** Tasks are client data (rules: A, M own branch); staff tick them through completeTask. */
    fun addTask(title: String, s: Staff, bookingId: String, due: String) = launchSafe("StaffWorkVM") {
        val b = _bookings.value.find { it.id == bookingId }
        db.collection(FirestoreCollections.TASKS).add(
            mapOf(
                "title" to title, "assigneeStaffId" to s.id, "assigneeName" to s.name, "assignedStaffIds" to listOf(s.id),
                "bookingId" to bookingId, "due" to due, "status" to "Open",
                "branchId" to (b?.branchId?.ifBlank { null } ?: s.branchId.ifBlank { null } ?: branch.value ?: ""),
                "createdBy" to currentUid(), "createdAt" to FieldValue.serverTimestamp(),
                "updatedBy" to currentUid(), "updatedAt" to FieldValue.serverTimestamp(),
            ),
        ).await()
        message = L("పని ఇచ్చాం ✓", "Task added ✓") to false
    }
}

/** R10-2: my shifts, tasks with a done tick; managers add shifts / tasks and rate staff per event. */
@Composable
fun StaffWorkScreen(padding: PaddingValues) {
    val vm: StaffWorkViewModel = viewModel()
    Column(Modifier.padding(padding).fillMaxSize()) {
        val tabs = listOf(L("షిఫ్ట్‌లు", "Shifts"), L("పనులు", "Tasks")) + if (vm.isManager) listOf(L("రేటింగ్", "Ratings")) else emptyList()
        TabRow(selectedTabIndex = vm.tab) { tabs.forEachIndexed { i, t -> Tab(selected = vm.tab == i, onClick = { vm.tab = i }, text = { Text(t) }) } }
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD, Modifier.padding(horizontal = 16.dp)) }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (vm.tab) {
                0 -> ShiftsTab(vm)
                1 -> TasksTab(vm)
                else -> RatingsTab(vm)
            }
        }
    }
}

@Composable
private fun ShiftsTab(vm: StaffWorkViewModel) {
    var adding by remember { mutableStateOf(false) }
    if (vm.isManager) {
        AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(vm.day), { vm.day = DayKey.of(it) })
        Button(onClick = { adding = true }) { Text(L("+ షిఫ్ట్", "+ Shift")) }
    }
    val list = if (vm.isManager) vm.shifts.filter { it.date == vm.day } else vm.shifts.filter { it.date >= DayKey.today() }
    if (list.isEmpty()) Text(L("షిఫ్ట్‌లు లేవు.", "No shifts."), modifier = Modifier.padding(top = 8.dp))
    list.forEach { s ->
        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(SuseelaTheme.colors.info).padding(10.dp)) {
            Text("${DayKey.display(s.date)} · ${s.startTime}–${s.endTime} · ${s.roleTe.ifBlank { shiftRoleLabel(s.role) }}", fontWeight = FontWeight.SemiBold)
            Text((if (vm.isManager) s.staffName + " · " else "") + s.customer + " · " + L("${"%.1f".format(s.hours)} గంటలు", "${"%.1f".format(s.hours)} h"), style = MaterialTheme.typography.bodySmall)
            if (s.note.isNotBlank()) Text(s.note, style = MaterialTheme.typography.bodySmall)
        }
    }
    if (adding) {
        val staff by vm.staff.collectAsStateWithLifecycle()
        val bookings by vm.bookings.collectAsStateWithLifecycle()
        ShiftDialog(staff, bookings, vm.day, onDismiss = { adding = false }) { b, sess, st, r, d, a, e, n -> vm.saveShift(b, sess, st, r, d, a, e, n); adding = false }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ShiftDialog(
    staff: List<Staff>, bookings: List<Booking>, day: String, onDismiss: () -> Unit,
    onSave: (String, String, String, String, String, String, String, String) -> Unit,
) {
    var bookingId by remember { mutableStateOf("") }
    var sessionId by remember { mutableStateOf("") }
    var s by remember { mutableStateOf<Staff?>(null) }
    var role by remember { mutableStateOf("helper") }
    var date by remember { mutableStateOf(day) }
    var start by remember { mutableStateOf("08:00") }
    var end by remember { mutableStateOf("16:00") }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val timeOk = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("షిఫ్ట్", "Shift")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                BookingPickerField(bookings, bookingId, { bookingId = it.id; sessionId = "" })
                bookings.find { it.id == bookingId }?.sessions?.takeIf { it.isNotEmpty() }?.let { ss ->
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(selected = sessionId.isBlank(), onClick = { sessionId = "" }, label = { Text(L("మొత్తం", "Whole")) })
                        ss.forEach { x -> FilterChip(selected = sessionId == x.id, onClick = { sessionId = x.id }, label = { Text(x.name) }) }
                    }
                }
                SimplePickerField(staff.filter { it.active }, s, { it.name }, { s = it }, L("సిబ్బంది", "Staff"))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    SHIFT_ROLES.forEach { r -> FilterChip(selected = role == r, onClick = { role = r }, label = { Text(shiftRoleLabel(r)) }) }
                }
                AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(date), { date = DayKey.of(it) })
                Row {
                    AppTextField(start, { start = it.take(5) }, L("మొదలు (HH:MM)", "Start (HH:MM)"), Modifier.weight(1f))
                    AppTextField(end, { end = it.take(5) }, L("ముగింపు", "End"), Modifier.weight(1f).padding(start = 6.dp))
                }
                AppTextField(note, { note = it }, L("గమనిక", "Note"))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = when {
                    bookingId.isBlank() -> L("కార్యక్రమం ఎంచుకోండి", "Choose the event")
                    s == null -> L("సిబ్బంది ఎంచుకోండి", "Choose the staff member")
                    !timeOk.matches(start) || !timeOk.matches(end) -> L("సమయం HH:MM లో రాయండి", "Times must be HH:MM")
                    else -> null
                }
                if (error == null) onSave(bookingId, sessionId, s!!.id, role, date, start, end, note.trim())
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

@Composable
private fun TasksTab(vm: StaffWorkViewModel) {
    var adding by remember { mutableStateOf(false) }
    if (vm.isManager) Button(onClick = { adding = true }) { Text(L("+ పని ఇవ్వు", "+ Add task")) }
    val today = DayKey.today()
    val todays = vm.tasks.filter { it.status != "Done" && (it.due.isBlank() || it.due <= today) }
    val later = vm.tasks.filter { it.status != "Done" && it.due > today }
    val done = vm.tasks.filter { it.status == "Done" }.take(20)
    if (vm.tasks.isEmpty()) EmptyState(L("పనులు లేవు.", "No tasks."))
    if (todays.isNotEmpty()) Text(L("ఈ రోజు చేయాల్సినవి", "Today's tasks"), style = MaterialTheme.typography.titleSmall)
    todays.forEach { TaskLine(it, vm) }
    if (later.isNotEmpty()) Text(L("తర్వాత", "Later"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
    later.forEach { TaskLine(it, vm) }
    if (done.isNotEmpty()) Text(L("అయిపోయినవి", "Done"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
    done.forEach { TaskLine(it, vm) }
    if (adding) {
        val staff by vm.staff.collectAsStateWithLifecycle()
        val bookings by vm.bookings.collectAsStateWithLifecycle()
        var title by remember { mutableStateOf("") }
        var s by remember { mutableStateOf<Staff?>(null) }
        var bookingId by remember { mutableStateOf("") }
        var due by remember { mutableStateOf(DayKey.today()) }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text(L("పని ఇవ్వు", "Add task")) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    AppTextField(title, { title = it }, L("ఏం చేయాలి", "What to do"))
                    SimplePickerField(staff.filter { it.active }, s, { it.name }, { s = it }, L("ఎవరు", "Who"))
                    BookingPickerField(bookings, bookingId, { bookingId = it.id }, L("కార్యక్రమం (ఐచ్ఛికం)", "Event (optional)"))
                    AppDatePickerField(L("ఎప్పటికి", "Due"), DayKey.parse(due), { due = DayKey.of(it) })
                }
            },
            confirmButton = {
                TextButton(enabled = title.isNotBlank() && s != null, onClick = { vm.addTask(title.trim(), s!!, bookingId, due); adding = false }) { Text(L("సేవ్ చేయి", "Save")) }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}

@Composable
private fun TaskLine(t: TaskRow, vm: StaffWorkViewModel) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        // QA fix 10: TalkBack reads what the tick-box is for.
        val tickLabel = L("పూర్తి: ${t.title}", "Done: ${t.title}")
        Checkbox(
            checked = t.status == "Done",
            onCheckedChange = { vm.toggleTask(t) },
            modifier = Modifier.semantics { contentDescription = tickLabel },
        )
        Column(Modifier.weight(1f)) {
            Text(t.title, fontWeight = if (t.status == "Done") FontWeight.Normal else FontWeight.SemiBold)
            Text(listOf(t.assigneeName.takeIf { vm.isManager } ?: "", if (t.due.isNotBlank()) DayKey.display(t.due) else "").filter { it.isNotBlank() }.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun RatingsTab(vm: StaffWorkViewModel) {
    val staff by vm.staff.collectAsStateWithLifecycle()
    val bookings by vm.bookings.collectAsStateWithLifecycle()
    var bookingId by remember { mutableStateOf("") }
    var s by remember { mutableStateOf<Staff?>(null) }
    var stars by remember { mutableStateOf(0) }
    var note by remember { mutableStateOf("") }
    Text(L("కార్యక్రమం అయ్యాక సిబ్బంది పనికి రేటింగ్ (1–5 ★)", "Rate staff after an event (1–5 ★)"), style = MaterialTheme.typography.bodySmall)
    BookingPickerField(bookings, bookingId, { bookingId = it.id; s = null })
    val b = bookings.find { it.id == bookingId }
    val assigned = staff.filter { b == null || it.id in b.assignedStaffIds }
    SimplePickerField(assigned, s, { it.name }, { s = it }, L("సిబ్బంది", "Staff"))
    Row {
        (1..5).forEach { n -> TextButton(onClick = { stars = n }) { Text(if (n <= stars) "★" else "☆", style = MaterialTheme.typography.headlineSmall) } }
    }
    AppTextField(note, { note = it }, L("గమనిక", "Note"))
    Button(enabled = bookingId.isNotBlank() && s != null && stars in 1..5, onClick = {
        vm.rate(s!!.id, bookingId, stars, note.trim()); stars = 0; note = ""
    }) { Text(L("సేవ్ చేయి", "Save")) }
    if (b != null) Text(bookingPickLabel(b), style = MaterialTheme.typography.bodySmall)
}
