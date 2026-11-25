package com.example.suseelacateringcrm.ui.attendance

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Attendance
import com.example.suseelacateringcrm.data.model.AttendanceStatus
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.PayrollRow
import com.example.suseelacateringcrm.data.repository.AttendanceRepository
import com.example.suseelacateringcrm.data.repository.MarkOutcome
import com.example.suseelacateringcrm.data.repository.PendingAttendance
import com.example.suseelacateringcrm.data.repository.StaffRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.example.suseelacateringcrm.util.rStr

data class AttendanceInput(val status: AttendanceStatus, val hoursText: String)

class AttendanceViewModel(
    private val repository: AttendanceRepository = ServiceLocator.attendanceRepository,
    private val staffRepository: StaffRepository = ServiceLocator.staffRepository,
) : ViewModel() {

    val role: UserRole? = ServiceLocator.currentRole()

    /** settings/business (admin + manager may read it): calc modes and managerCanOverride. */
    var business by mutableStateOf<com.example.suseelacateringcrm.data.model.BusinessSettings?>(null)
        private set

    private fun watchSettings() {
        if (ServiceLocator.currentRole() == UserRole.STAFF) return
        viewModelScope.launch {
            ServiceLocator.settingsRepository.businessFlow()
                .catchLogged("SettingsWatch")
                .collect { business = it }
        }
    }

    /** Who may type a day's pay: owner, or manager when allowed (manager still never sees the amount). */
    val canOverridePay: Boolean get() = com.example.suseelacateringcrm.data.model.canOverride(role, business)
    val payManualMode: Boolean
        get() = business?.modeOf(com.example.suseelacateringcrm.data.model.CalcArea.ATTENDANCE_PAY) == "manual"
    val isStaffSelf: Boolean get() = role == UserRole.STAFF

    var date by mutableStateOf(DayKey.today())
        private set

    private val _staff = MutableStateFlow<UiState<List<Staff>>>(UiState.Loading)
    val staff: StateFlow<UiState<List<Staff>>> = _staff.asStateFlow()

    private val _records = MutableStateFlow<Map<String, Attendance>>(emptyMap())
    val records: StateFlow<Map<String, Attendance>> = _records.asStateFlow()

    val pending: StateFlow<List<PendingAttendance>> = repository.pending

    val inputs = mutableStateMapOf<String, AttendanceInput>()
    /** Per-row message after saving (Telugu/English). */
    val rowMessages = mutableStateMapOf<String, String>()
    var flushMessage by mutableStateOf<String?>(null)
        private set

    private var recordsJob: Job? = null
    private var shiftsJob: Job? = null

    /** R10-2: shifts on the chosen day, per staff member: (shiftId, bookingId, label). */
    data class DayShift(val id: String, val bookingId: String, val label: String)
    val shiftsByStaff = mutableStateMapOf<String, List<DayShift>>()
    /** Chosen shift per staff ("" = no shift); defaults to their first shift that day. */
    val chosenShift = mutableStateMapOf<String, String>()

    private fun loadShifts() {
        shiftsJob?.cancel()
        shiftsJob = viewModelScope.launch {
            val db = ServiceLocator.firestore.collection(com.example.suseelacateringcrm.data.remote.FirestoreCollections.SHIFTS)
            val myStaff = ServiceLocator.staffScopeId()
            val branch = ServiceLocator.branchManager.currentBranchId.value
            val q = when {
                isStaffSelf -> if (myStaff.isNullOrBlank()) null else db.whereEqualTo("staffId", myStaff)
                branch != null -> db.whereEqualTo("branchId", branch).whereEqualTo("date", date)
                else -> db.whereEqualTo("date", date)
            } ?: return@launch
            q.snapshotsFlow().catchLogged("AttendanceShifts").collect { snap ->
                val docs = snap.documents.map { it.id to (it.data ?: emptyMap()) }
                val map = docs.filter { it.second.rStr("date") == date && !it.second.rStr("status").equals("Cancelled", true) }
                    .groupBy({ it.second.rStr("staffId") }) { (id, m) ->
                        DayShift(id, m.rStr("bookingId"), "${m.rStr("startTime")}–${m.rStr("endTime")} ${m.rStr("customerNameSnapshot")}".trim())
                    }
                shiftsByStaff.clear()
                shiftsByStaff.putAll(map)
                map.forEach { (sid, list) -> if (chosenShift[sid] == null || list.none { it.id == chosenShift[sid] }) chosenShift[sid] = list.first().id }
            }
        }
    }

    init {
        watchSettings()
        viewModelScope.launch {
            if (isStaffSelf) {
                val uid = ServiceLocator.authRepository.currentUid ?: ""
                val me = try { staffRepository.getStaffByLinkedUser(uid) } catch (e: Exception) { null }
                _staff.value = if (me == null) {
                    UiState.Error(L("మీ login కి staff record link కాలేదు. Owner ని అడగండి.", "Your login is not linked to a staff record. Ask the owner."))
                } else {
                    UiState.Success(listOf(me))
                }
            } else {
                ServiceLocator.branchManager.currentBranchId
                    .flatMapLatest { branchId -> staffRepository.staffFlow(branchId) }
                    .catchLogged("AttendanceViewModel")
                    .collect { list -> _staff.value = UiState.Success(list.filter { it.active }.sortedBy { it.name.lowercase() }) }
            }
        }
        loadRecords()
        loadShifts()
        flushPending()
    }

    private fun loadRecords() {
        recordsJob?.cancel()
        recordsJob = viewModelScope.launch {
            repository.dayFlow(date, ServiceLocator.branchManager.currentBranchId.value)
                .catchLogged("AttendanceViewModel")
                .collect { list ->
                    _records.value = list.associateBy { it.staffId }
                    list.forEach { a ->
                        if (!inputs.containsKey(a.staffId)) {
                            inputs[a.staffId] = AttendanceInput(AttendanceStatus.from(a.status), hoursText(a.hours))
                        }
                    }
                }
        }
    }

    fun changeDate(day: String) {
        if (isStaffSelf || day.isBlank()) return
        date = day
        inputs.clear()
        rowMessages.clear()
        loadRecords()
        loadShifts()
    }

    fun inputFor(staffId: String): AttendanceInput =
        inputs[staffId] ?: AttendanceInput(AttendanceStatus.PRESENT, "8")

    fun setStatus(staffId: String, status: AttendanceStatus) {
        inputs[staffId] = AttendanceInput(status, hoursText(status.defaultHours))
    }

    fun setHours(staffId: String, text: String) {
        inputs[staffId] = inputFor(staffId).copy(hoursText = text)
    }

    fun save(staff: Staff) {
        val input = inputFor(staff.id)
        val hours = input.hoursText.trim().ifBlank { "0" }.toDoubleOrNull()
        if (hours == null || hours < 0 || hours > 24) {
            rowMessages[staff.id] = L("గంటలు 0 నుంచి 24 మధ్య ఉండాలి", "Hours must be between 0 and 24")
            return
        }
        val finalHours = if (input.status == AttendanceStatus.ABSENT || input.status == AttendanceStatus.LEAVE) 0.0 else hours
        if (input.status == AttendanceStatus.PRESENT && finalHours == 0.0) {
            rowMessages[staff.id] = L("వచ్చారు అంటే గంటలు 0 కాకూడదు", "Present needs more than 0 hours")
            return
        }
        rowMessages[staff.id] = L("సేవ్ చేస్తున్నాం…", "Saving…")
        viewModelScope.launch {
            val shift = shiftsByStaff[staff.id].orEmpty().find { it.id == chosenShift[staff.id] }
            val entry = PendingAttendance(staff.id, staff.name, date, finalHours, input.status.code, shift?.bookingId ?: "", shift?.id ?: "")
            rowMessages[staff.id] = repository.mark(entry).fold(
                onSuccess = { outcome ->
                    when (outcome) {
                        is MarkOutcome.Saved -> L("సేవ్ అయింది ✓", "Saved ✓")
                        MarkOutcome.Queued -> L("సిగ్నల్ లేదు — phone లో ఉంచాం, తర్వాత పంపుతాం", "No signal — kept on the phone, will send later")
                    }
                },
                onFailure = { CallableError.from(it).text },
            )
        }
    }

    /** Pay by hand for one day (markAttendance with `manual`) — owner only; needs internet. */
    suspend fun overridePay(staff: Staff, record: Attendance, manual: com.example.suseelacateringcrm.data.remote.ManualOverride): String? =
        ServiceLocator.functions.markAttendance(staff.id, record.date, record.hours, record.status, record.bookingId, manual)
            .exceptionOrNull()?.let { CallableError.from(it).text }

    fun flushPending() {
        viewModelScope.launch {
            if (repository.pending.value.isEmpty()) return@launch
            val rejected = repository.flushPending()
            flushMessage = if (rejected.isEmpty()) null else rejected.joinToString("\n") { (p, err) ->
                "${p.staffName} (${DayKey.display(p.date)}): ${err.text}"
            }
        }
    }

    private fun hoursText(h: Double): String =
        if (h == h.toLong().toDouble()) h.toLong().toString() else h.toString()
}

class PayrollViewModel(
    private val repository: AttendanceRepository = ServiceLocator.attendanceRepository,
) : ViewModel() {
    var month by mutableStateOf(DayKey.thisMonth())
        private set
    var state by mutableStateOf<UiState<List<PayrollRow>>>(UiState.Loading)
        private set

    /** settings/business (admin + manager may read it): calc modes and managerCanOverride. */
    var business by mutableStateOf<com.example.suseelacateringcrm.data.model.BusinessSettings?>(null)
        private set

    private fun watchSettings() {
        if (ServiceLocator.currentRole() == UserRole.STAFF) return
        viewModelScope.launch {
            ServiceLocator.settingsRepository.businessFlow()
                .catchLogged("SettingsWatch")
                .collect { business = it }
        }
    }

    val manualMode: Boolean
        get() = business?.modeOf(com.example.suseelacateringcrm.data.model.CalcArea.PAYROLL) == "manual"

    val isOwner: Boolean get() = ServiceLocator.currentRole() == UserRole.ADMIN
    var finalizing by mutableStateOf(false)
        private set
    var finalizeMessage by mutableStateOf<Pair<String, Boolean>?>(null)
        private set

    /** finalizePayroll { month } (owner) → { month, payslips, advancesTouched }. */
    fun finalize() {
        viewModelScope.launch {
            finalizing = true
            finalizeMessage = ServiceLocator.functions.call("finalizePayroll", mapOf("month" to month)).fold(
                onSuccess = { r ->
                    val n = (r["payslips"] as? Number)?.toInt() ?: 0
                    val a = (r["advancesTouched"] as? Number)?.toInt() ?: 0
                    L("$month జీతాలు ఖరారు ✓ — $n జీతం చీటీలు, $a అడ్వాన్స్‌లు నమోదు", "$month payroll finalized ✓ — $n payslips, $a advances updated") to false
                },
                onFailure = { CallableError.from(it).text to true },
            )
            finalizing = false
            load()
        }
    }

    init {
        watchSettings()
        load()
    }

    fun shift(delta: Int) {
        month = DayKey.shiftMonth(month, delta)
        load()
    }

    /** recordSalaryPayment (owner): money handed over for a finalized payslip; part payments are fine. Returns an error text or null. */
    suspend fun paySalary(staffId: String, amount: Double, date: String, method: String, note: String): String? {
        val err = ServiceLocator.functions.recordSalaryPayment(month, staffId, amount, date, method, note)
            .exceptionOrNull()?.let { CallableError.from(it).text }
        if (err == null) load()
        return err
    }

    /** overridePayrollRow { month, staffId, net, reason } — owner only (payroll is admin data). */
    suspend fun overrideRow(staffId: String, manual: com.example.suseelacateringcrm.data.remote.ManualOverride): String? {
        val err = ServiceLocator.functions.overridePayrollRow(month, staffId, manual)
            .exceptionOrNull()?.let { CallableError.from(it).text }
        if (err == null) load()
        return err
    }

    /** QA fix 9: when the month's payslips were finalized (payroll/{month}_{staffId}.finalizedAt); null = not yet. */
    var finalizedAt by mutableStateOf<java.util.Date?>(null)
        private set

    private suspend fun loadFinalized(m: String): java.util.Date? = runCatching {
        if (!isOwner) return@runCatching null
        ServiceLocator.firestore.collection("payroll").whereEqualTo("month", m).get().await().documents
            .filter { it.getBoolean("finalized") == true }
            .mapNotNull { it.getTimestamp("finalizedAt")?.toDate() ?: it.getTimestamp("updatedAt")?.toDate() }
            .maxOrNull()
    }.getOrNull()

    fun load() {
        viewModelScope.launch {
            state = UiState.Loading
            val m = month
            finalizedAt = loadFinalized(m)
            state = repository.monthPayroll(m).fold(
                onSuccess = { UiState.Success(it.sortedBy { r -> r.name.lowercase() }) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }
}
