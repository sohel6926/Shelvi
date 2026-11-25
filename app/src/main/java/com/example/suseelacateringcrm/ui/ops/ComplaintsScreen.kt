package com.example.suseelacateringcrm.ui.ops

import android.content.Intent
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.Complaint
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.BookingPickerField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.SimplePickerField
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.bookingPickLabel
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.launchSafe
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

class ComplaintsViewModel : ViewModel() {
    private val ops = ServiceLocator.opsRepository
    private val branch = ServiceLocator.branchManager.currentBranchId
    val role: UserRole? get() = ServiceLocator.currentRole()
    val canManage: Boolean get() = role == UserRole.ADMIN || role == UserRole.MANAGER

    var statusFilter by mutableStateOf("open")
    var message by mutableStateOf<Pair<String, Boolean>?>(null)

    private val _complaints = MutableStateFlow<List<Complaint>>(emptyList())
    val complaints: StateFlow<List<Complaint>> = _complaints.asStateFlow()
    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()
    private val _staff = MutableStateFlow<List<Staff>>(emptyList())
    val staff: StateFlow<List<Staff>> = _staff.asStateFlow()

    init {
        viewModelScope.launch { branch.flatMapLatest { ops.complaintsFlow(it, ownOnly = !canManage) }.catchLogged("ComplaintsVM").collect { _complaints.value = it } }
        viewModelScope.launch {
            branch.flatMapLatest { ServiceLocator.bookingRepository.bookingsFlow(it) }.catchLogged("ComplaintsVM").collect { _bookings.value = it }
        }
        if (canManage) {
            viewModelScope.launch { branch.flatMapLatest { ServiceLocator.staffRepository.staffFlow(it) }.catchLogged("ComplaintsVM").collect { _staff.value = it } }
        }
    }

    fun add(c: Complaint) {
        val b = _bookings.value.find { it.id == c.bookingId }
        val branchId = b?.branchId?.ifBlank { null } ?: branch.value
        if (branchId == null) {
            message = L("ముందు కార్యక్రమం / branch ఎంచుకోండి", "Choose the event / branch first") to true
            return
        }
        launchSafe("ComplaintsVM") {
            ops.addComplaint(c, branchId)
            message = L("ఫిర్యాదు నమోదు ✓", "Complaint saved ✓") to false
        }
    }

    fun assign(c: Complaint, s: Staff) = launchSafe("ComplaintsVM") {
        ops.updateComplaint(c.id, mapOf("assignedTo" to s.id, "assignedName" to s.name, "status" to "in-progress"))
        message = L("${s.name} కి ఇచ్చాం", "Assigned to ${s.name}") to false
    }

    fun setStatus(c: Complaint, status: String) = launchSafe("ComplaintsVM") {
        ops.updateComplaint(c.id, mapOf("status" to status))
    }

    fun resolve(c: Complaint, resolution: String, reply: String) = launchSafe("ComplaintsVM") {
        ops.updateComplaint(c.id, mapOf("status" to "resolved", "resolution" to resolution, "reply" to reply))
        message = L("పరిష్కరించాం ✓", "Resolved ✓") to false
    }
}

/** R7-10: complaints — list, add (event, category, severity, description), assign, resolve with a Telugu reply. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ComplaintsScreen(padding: PaddingValues) {
    val vm: ComplaintsViewModel = viewModel()
    val complaints by vm.complaints.collectAsStateWithLifecycle()
    val bookings by vm.bookings.collectAsStateWithLifecycle()
    val staff by vm.staff.collectAsStateWithLifecycle()
    var adding by remember { mutableStateOf(false) }
    var assigning by remember { mutableStateOf<Complaint?>(null) }
    var resolving by remember { mutableStateOf<Complaint?>(null) }
    val context = LocalContext.current

    Column(Modifier.padding(padding).fillMaxSize()) {
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD, Modifier.padding(horizontal = 16.dp)) }
        Button(onClick = { adding = true }, modifier = Modifier.padding(horizontal = 16.dp)) { Text(L("+ కొత్త ఫిర్యాదు", "+ New complaint")) }
        FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            (Complaint.STATUSES + "all").forEach { s ->
                val count = if (s == "all") complaints.size else complaints.count { it.status == s }
                FilterChip(
                    selected = vm.statusFilter == s,
                    onClick = { vm.statusFilter = s },
                    label = { Text((if (s == "all") L("అన్నీ", "All") else Complaint.statusLabel(s)) + " ($count)") },
                )
            }
        }
        val shown = complaints.filter { vm.statusFilter == "all" || it.status == vm.statusFilter }
        if (shown.isEmpty()) EmptyState(L("ఫిర్యాదులు లేవు.", "No complaints."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(shown, key = { it.id }) { c ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            "${Complaint.categoryLabel(c.category)} · ${Complaint.severityLabel(c.severity)}",
                            style = MaterialTheme.typography.titleSmall,
                            color = if (c.severity == "high") SuseelaTheme.colors.bad else MaterialTheme.colorScheme.onSurface,
                        )
                        val b = bookings.find { it.id == c.bookingId }
                        Text((c.customerName.ifBlank { b?.customerNameSnapshot ?: "" }) + (b?.let { " · " + bookingPickLabel(it) } ?: ""), style = MaterialTheme.typography.bodySmall)
                        Text(c.description)
                        Text(
                            Complaint.statusLabel(c.status) + (if (c.assignedName.isNotBlank()) L(" · చూస్తున్నది: ${c.assignedName}", " · with ${c.assignedName}") else "") +
                                " · ${DateUtils.formatDate(c.createdAt)}",
                            fontWeight = FontWeight.SemiBold,
                            color = when (c.status) { "resolved" -> SuseelaTheme.colors.good; "open" -> SuseelaTheme.colors.bad; else -> SuseelaTheme.colors.warning },
                        )
                        if (c.resolution.isNotBlank()) Text(L("పరిష్కారం: ${c.resolution}", "Resolution: ${c.resolution}"), style = MaterialTheme.typography.bodySmall)
                        if (vm.canManage) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                if (c.status != "resolved") {
                                    TextButton(onClick = { assigning = c }) { Text(L("ఎవరికి ఇవ్వాలి", "Assign")) }
                                    TextButton(onClick = { resolving = c }) { Text(L("పరిష్కరించాం", "Resolve")) }
                                } else {
                                    TextButton(onClick = { vm.setStatus(c, "open") }) { Text(L("మళ్ళీ తెరువు", "Reopen")) }
                                }
                                if (c.reply.isNotBlank()) TextButton(onClick = {
                                    val i = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, c.reply) }
                                    context.startActivity(Intent.createChooser(i, L("జవాబు పంపు", "Send reply")))
                                }) { Text(L("జవాబు పంపు", "Send reply")) }
                            }
                        }
                    }
                }
            }
        }
    }
    if (adding) AddComplaintDialog(bookings, onDismiss = { adding = false }) { vm.add(it); adding = false }
    assigning?.let { c ->
        var pick by remember { mutableStateOf<Staff?>(null) }
        AlertDialog(
            onDismissRequest = { assigning = null },
            title = { Text(L("ఎవరు చూస్తారు?", "Who will handle it?")) },
            text = { SimplePickerField(staff.filter { it.active }, pick, { it.name }, { pick = it }, L("సిబ్బంది", "Staff")) },
            confirmButton = { TextButton(enabled = pick != null, onClick = { vm.assign(c, pick!!); assigning = null }) { Text(L("సరే", "OK")) } },
            dismissButton = { TextButton(onClick = { assigning = null }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
    resolving?.let { c -> ResolveDialog(c, onDismiss = { resolving = null }) { res, reply -> vm.resolve(c, res, reply); resolving = null } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddComplaintDialog(bookings: List<Booking>, onDismiss: () -> Unit, onSave: (Complaint) -> Unit) {
    var c by remember { mutableStateOf(Complaint()) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("కొత్త ఫిర్యాదు", "New complaint")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                BookingPickerField(bookings, c.bookingId, { b -> c = c.copy(bookingId = b.id, customerId = b.customerId, customerName = b.customerNameSnapshot) })
                Text(L("రకం", "Category"), style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Complaint.CATEGORIES.forEach { k -> FilterChip(selected = c.category == k, onClick = { c = c.copy(category = k) }, label = { Text(Complaint.categoryLabel(k)) }) }
                }
                Text(L("ఎంత పెద్దది", "Severity"), style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Complaint.SEVERITIES.forEach { k -> FilterChip(selected = c.severity == k, onClick = { c = c.copy(severity = k) }, label = { Text(Complaint.severityLabel(k)) }) }
                }
                AppTextField(c.description, { c = c.copy(description = it) }, L("ఏం జరిగింది", "What happened"), singleLine = false)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = when {
                    c.bookingId.isBlank() -> L("కార్యక్రమం ఎంచుకోండి", "Choose the event")
                    c.description.trim().length < 3 -> L("ఏం జరిగిందో రాయండి", "Describe what happened")
                    else -> null
                }
                if (error == null) onSave(c.copy(description = c.description.trim()))
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ResolveDialog(c: Complaint, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var resolution by remember { mutableStateOf(c.resolution) }
    var reply by remember { mutableStateOf(c.reply.ifBlank { Complaint.REPLY_TEMPLATES.first() }) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("పరిష్కారం", "Resolve")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                AppTextField(resolution, { resolution = it }, L("ఏం చేశాం", "What we did"), singleLine = false)
                Text(L("customer కి జవాబు (ఒకటి ఎంచుకుని మార్చుకోవచ్చు)", "Reply to the customer (pick one, then edit)"), style = MaterialTheme.typography.bodySmall)
                Complaint.REPLY_TEMPLATES.forEachIndexed { i, t ->
                    FilterChip(selected = reply == t, onClick = { reply = t }, label = { Text(L("జవాబు ${i + 1}", "Reply ${i + 1}")) })
                }
                AppTextField(reply, { reply = it }, L("జవాబు", "Reply"), singleLine = false)
            }
        },
        confirmButton = {
            TextButton(enabled = resolution.trim().length >= 3, onClick = { onSave(resolution.trim(), reply.trim()) }) { Text(L("పరిష్కరించాం", "Resolve")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
