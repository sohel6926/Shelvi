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
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.model.Vehicle
import com.example.suseelacateringcrm.data.model.VehicleTrip
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
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
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.launchSafe
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class VehiclesViewModel : ViewModel() {
    private val ops = ServiceLocator.opsRepository
    private val branch = ServiceLocator.branchManager.currentBranchId
    val role: UserRole? get() = ServiceLocator.currentRole()
    val canWrite: Boolean get() = role == UserRole.ADMIN || role == UserRole.MANAGER

    var tab by mutableStateOf(0)
    var showArchived by mutableStateOf(false)
    var message by mutableStateOf<Pair<String, Boolean>?>(null)

    private val _vehicles = MutableStateFlow<List<Vehicle>>(emptyList())
    val vehicles: StateFlow<List<Vehicle>> = _vehicles.asStateFlow()
    private val _trips = MutableStateFlow<List<VehicleTrip>>(emptyList())
    val trips: StateFlow<List<VehicleTrip>> = _trips.asStateFlow()
    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()
    private val _staff = MutableStateFlow<List<Staff>>(emptyList())
    val staff: StateFlow<List<Staff>> = _staff.asStateFlow()

    init {
        viewModelScope.launch { branch.flatMapLatest { ops.vehiclesFlow(it) }.catchLogged("VehiclesVM").collect { _vehicles.value = it } }
        viewModelScope.launch { branch.flatMapLatest { ops.tripsFlow(it, ownOnly = !canWrite) }.catchLogged("VehiclesVM").collect { _trips.value = it } }
        viewModelScope.launch {
            branch.flatMapLatest { ServiceLocator.bookingRepository.bookingsFlow(it) }.catchLogged("VehiclesVM").collect { _bookings.value = it }
        }
        if (canWrite) {
            viewModelScope.launch { branch.flatMapLatest { ServiceLocator.staffRepository.staffFlow(it) }.catchLogged("VehiclesVM").collect { _staff.value = it } }
        }
    }

    fun save(v: Vehicle) = launchSafe("VehiclesVM") {
        ops.saveVehicle(v, branch.value)
        message = L("సేవ్ చేశాం ✓", "Saved ✓") to false
    }

    fun archive(v: Vehicle, reason: String) = launchSafe("VehiclesVM") {
        ServiceLocator.functions.cancelRecord("vehicles", v.id, reason).getOrThrow()
        message = L("పక్కన పెట్టాం", "Archived") to false
    }

    fun addTrip(t: VehicleTrip) {
        val b = _bookings.value.find { it.id == t.bookingId }
        val branchId = b?.branchId?.ifBlank { null } ?: branch.value
        if (branchId == null) {
            message = L("ముందు branch / కార్యక్రమం ఎంచుకోండి", "Choose the branch / event first") to true
            return
        }
        launchSafe("VehiclesVM") {
            ops.addTrip(t, branchId)
            message = L("ట్రిప్ నమోదు ✓", "Trip saved ✓") to false
        }
    }
}

/** Days from today to "YYYY-MM-DD" (null if blank / bad). */
private fun daysLeft(day: String): Long? {
    val d = DayKey.parse(day) ?: return null
    val today = DayKey.parse(DayKey.today()) ?: return null
    return TimeUnit.MILLISECONDS.toDays(d.time - today.time)
}

/** Expiry line with the 30 / 7-day warning colours (R7-4). */
@Composable
private fun ExpiryLine(labelTe: String, labelEn: String, day: String) {
    if (day.isBlank()) return
    val left = daysLeft(day)
    val (text, color) = when {
        left == null -> DayKey.display(day) to MaterialTheme.colorScheme.onSurface
        left < 0 -> L("గడువు ముగిసింది (${DayKey.display(day)})", "EXPIRED (${DayKey.display(day)})") to SuseelaTheme.colors.bad
        left <= 7 -> L("$left రోజుల్లో ముగుస్తుంది (${DayKey.display(day)})", "Expires in $left days (${DayKey.display(day)})") to SuseelaTheme.colors.bad
        left <= 30 -> L("$left రోజుల్లో ముగుస్తుంది (${DayKey.display(day)})", "Expires in $left days (${DayKey.display(day)})") to SuseelaTheme.colors.warning
        else -> DayKey.display(day) to MaterialTheme.colorScheme.onSurface
    }
    Text(L(labelTe, labelEn) + ": " + text, color = color, style = MaterialTheme.typography.bodySmall)
}

private fun Vehicle.worstDays(): Long? =
    listOf(insuranceExpiry, fitnessExpiry, pollutionExpiry, driverLicenseExpiry).mapNotNull { daysLeft(it) }.minOrNull()

/** R7-4: vehicles master with expiry warnings, and trips (km, fuel, rented ₹/km). */
@Composable
fun VehiclesScreen(padding: PaddingValues) {
    val vm: VehiclesViewModel = viewModel()
    Column(Modifier.padding(padding).fillMaxSize()) {
        TabRow(selectedTabIndex = vm.tab) {
            listOf(L("వాహనాలు", "Vehicles"), L("ట్రిప్పులు", "Trips")).forEachIndexed { i, t ->
                Tab(selected = vm.tab == i, onClick = { vm.tab = i }, text = { Text(t) })
            }
        }
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD, Modifier.padding(horizontal = 16.dp)) }
        if (vm.tab == 0) VehicleListTab(vm) else TripsTab(vm)
    }
}

@Composable
private fun VehicleListTab(vm: VehiclesViewModel) {
    val vehicles by vm.vehicles.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Vehicle?>(null) }
    var archiving by remember { mutableStateOf<Vehicle?>(null) }
    Column(Modifier.fillMaxSize()) {
        ShowCancelledToggle(vm.showArchived, { vm.showArchived = it })
        if (vm.canWrite) Button(onClick = { editing = Vehicle() }, modifier = Modifier.padding(horizontal = 16.dp)) { Text(L("+ కొత్త వాహనం", "+ New vehicle")) }
        val shown = vehicles.filter { vm.showArchived || !it.archived }.sortedBy { it.worstDays() ?: Long.MAX_VALUE }
        val due = shown.count { (it.worstDays() ?: 999) <= 30 }
        if (due > 0) NoticeBox(L("$due వాహనాల పత్రాల గడువు 30 రోజుల్లోపు", "$due vehicle(s) have papers expiring within 30 days"), Tone.WARNING, Modifier.padding(horizontal = 16.dp))
        if (shown.isEmpty()) EmptyState(L("వాహనాలు లేవు.", "No vehicles yet."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(shown, key = { it.id }) { v ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${v.number} · ${v.type}" + if (v.archived) L(" (పక్కన పెట్టారు)", " (archived)") else "", style = MaterialTheme.typography.titleSmall)
                            if (v.driverName.isNotBlank()) Text(L("డ్రైవర్: ${v.driverName}", "Driver: ${v.driverName}"), style = MaterialTheme.typography.bodySmall)
                            if (v.rented) Text(L("అద్దె · ${CurrencyUtils.formatInr(v.ratePerKm)}/కి.మీ", "Rented · ${CurrencyUtils.formatInr(v.ratePerKm)}/km"), style = MaterialTheme.typography.bodySmall)
                            ExpiryLine("ఇన్సూరెన్స్", "Insurance", v.insuranceExpiry)
                            ExpiryLine("ఫిట్‌నెస్", "Fitness", v.fitnessExpiry)
                            ExpiryLine("పొల్యూషన్", "Pollution", v.pollutionExpiry)
                            ExpiryLine("డ్రైవర్ లైసెన్స్", "Driver licence", v.driverLicenseExpiry)
                        }
                        if (vm.canWrite && !v.archived) {
                            Column {
                                TextButton(onClick = { editing = v }) { Text(L("మార్చు", "Edit")) }
                                TextButton(onClick = { archiving = v }) { Text(L("పక్కన పెట్టు", "Archive")) }
                            }
                        }
                    }
                }
            }
        }
    }
    val staff by vm.staff.collectAsStateWithLifecycle()
    editing?.let { v -> VehicleDialog(v, staff, onDismiss = { editing = null }) { vm.save(it); editing = null } }
    archiving?.let { v -> CancelRecordDialog(v.number, archive = true, onConfirm = { vm.archive(v, it); archiving = null }, onDismiss = { archiving = null }) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VehicleDialog(initial: Vehicle, staff: List<Staff>, onDismiss: () -> Unit, onSave: (Vehicle) -> Unit) {
    var v by remember { mutableStateOf(initial) }
    var rateText by remember { mutableStateOf(if (initial.ratePerKm > 0) fmtNum(initial.ratePerKm) else "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) L("కొత్త వాహనం", "New vehicle") else L("వాహనం మార్చు", "Edit vehicle")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                AppTextField(v.number, { v = v.copy(number = it.uppercase()) }, L("నంబర్ (AP 09 …)", "Number"))
                AppTextField(v.type, { v = v.copy(type = it) }, L("రకం (టాటా ఏస్, వ్యాన్…)", "Type (Tata Ace, van…)"))
                SimplePickerField(staff.filter { it.active }, staff.find { it.id == v.driverStaffId }, { it.name }, {
                    v = v.copy(driverStaffId = it.id, driverName = it.name)
                }, L("డ్రైవర్ (సిబ్బంది)", "Driver (staff)"))
                AppTextField(v.driverName, { v = v.copy(driverName = it) }, L("డ్రైవర్ పేరు", "Driver name"))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = !v.rented, onClick = { v = v.copy(rented = false) }, label = { Text(L("మనది", "Own")) })
                    FilterChip(selected = v.rented, onClick = { v = v.copy(rented = true) }, label = { Text(L("అద్దె", "Rented")) })
                }
                if (v.rented) AppTextField(rateText, { rateText = it }, L("కి.మీ కి ధర (₹)", "Rate per km (₹)"), keyboardType = KeyboardType.Decimal)
                AppDatePickerField(L("ఇన్సూరెన్స్ గడువు", "Insurance expiry"), DayKey.parse(v.insuranceExpiry), { v = v.copy(insuranceExpiry = DayKey.of(it)) })
                AppDatePickerField(L("ఫిట్‌నెస్ గడువు", "Fitness expiry"), DayKey.parse(v.fitnessExpiry), { v = v.copy(fitnessExpiry = DayKey.of(it)) })
                AppDatePickerField(L("పొల్యూషన్ గడువు", "Pollution expiry"), DayKey.parse(v.pollutionExpiry), { v = v.copy(pollutionExpiry = DayKey.of(it)) })
                AppDatePickerField(L("డ్రైవర్ లైసెన్స్ గడువు", "Driver licence expiry"), DayKey.parse(v.driverLicenseExpiry), { v = v.copy(driverLicenseExpiry = DayKey.of(it)) })
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val rate = numOrNull(rateText) ?: 0.0
                error = when {
                    v.number.isBlank() -> L("వాహనం నంబర్ రాయండి", "Enter the vehicle number")
                    rate < 0 -> L("ధర 0 లేదా ఎక్కువ", "Rate must be 0 or more")
                    else -> null
                }
                if (error == null) onSave(v.copy(number = v.number.trim(), ratePerKm = if (v.rented) rate else 0.0))
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

@Composable
private fun TripsTab(vm: VehiclesViewModel) {
    val trips by vm.trips.collectAsStateWithLifecycle()
    val vehicles by vm.vehicles.collectAsStateWithLifecycle()
    val bookings by vm.bookings.collectAsStateWithLifecycle()
    var adding by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        Button(onClick = { adding = true }, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { Text(L("+ ట్రిప్ నమోదు", "+ Record trip")) }
        if (trips.isEmpty()) EmptyState(L("ట్రిప్పులు లేవు.", "No trips yet."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(trips, key = { it.id }) { t ->
                val v = vehicles.find { it.id == t.vehicleId }
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${DayKey.display(t.date)} · ${v?.number ?: ""}", style = MaterialTheme.typography.titleSmall)
                        bookings.find { it.id == t.bookingId }?.let { Text(bookingPickLabel(it), style = MaterialTheme.typography.bodySmall) }
                        Text(
                            L("${fmtNum(t.km)} కి.మీ · డీజిల్ ${CurrencyUtils.formatInr(t.fuelCost)}", "${fmtNum(t.km)} km · fuel ${CurrencyUtils.formatInr(t.fuelCost)}") +
                                if (t.ratePerKm > 0) " · ${CurrencyUtils.formatInr(t.ratePerKm)}/" + L("కి.మీ", "km") else "",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
    if (adding) TripDialog(vehicles.filterNot { it.archived }, bookings, onDismiss = { adding = false }) { vm.addTrip(it); adding = false }
}

@Composable
private fun TripDialog(vehicles: List<Vehicle>, bookings: List<Booking>, onDismiss: () -> Unit, onSave: (VehicleTrip) -> Unit) {
    var vehicle by remember { mutableStateOf<Vehicle?>(null) }
    var bookingId by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(DayKey.today()) }
    var kmStart by remember { mutableStateOf("") }
    var kmEnd by remember { mutableStateOf("") }
    var fuel by remember { mutableStateOf("") }
    var rate by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("ట్రిప్ నమోదు", "Record trip")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                SimplePickerField(vehicles, vehicle, { "${it.number} · ${it.type}" }, {
                    vehicle = it
                    if (it.rented && it.ratePerKm > 0) rate = fmtNum(it.ratePerKm)
                }, L("వాహనం", "Vehicle"))
                BookingPickerField(bookings, bookingId, { bookingId = it.id })
                AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(date), { date = DayKey.of(it) })
                AppTextField(kmStart, { kmStart = it }, L("మొదలు కి.మీ (మీటర్)", "Start km (meter)"), keyboardType = KeyboardType.Decimal)
                AppTextField(kmEnd, { kmEnd = it }, L("చివరి కి.మీ (మీటర్)", "End km (meter)"), keyboardType = KeyboardType.Decimal)
                AppTextField(fuel, { fuel = it }, L("డీజిల్ / పెట్రోల్ ఖర్చు (₹)", "Fuel cost (₹)"), keyboardType = KeyboardType.Decimal)
                if (vehicle?.rented == true) AppTextField(rate, { rate = it }, L("కి.మీ కి ధర (₹)", "Rate per km (₹)"), keyboardType = KeyboardType.Decimal)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val s = numOrNull(kmStart)
                val e = numOrNull(kmEnd)
                val f = numOrNull(fuel) ?: 0.0
                val r = numOrNull(rate) ?: 0.0
                error = when {
                    vehicle == null -> L("వాహనం ఎంచుకోండి", "Choose the vehicle")
                    bookingId.isBlank() -> L("కార్యక్రమం ఎంచుకోండి", "Choose the event")
                    s == null || e == null || s < 0 -> L("మీటర్ కి.మీ రాయండి", "Enter the meter readings")
                    e < s -> L("చివరి కి.మీ మొదలు కంటే తక్కువ ఉండకూడదు", "End km can't be less than start km")
                    f < 0 || r < 0 -> L("ఖర్చు 0 లేదా ఎక్కువ", "Costs must be 0 or more")
                    else -> null
                }
                if (error == null) onSave(VehicleTrip(vehicleId = vehicle!!.id, bookingId = bookingId, date = date, kmStart = s!!, kmEnd = e!!, fuelCost = f, ratePerKm = r))
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
