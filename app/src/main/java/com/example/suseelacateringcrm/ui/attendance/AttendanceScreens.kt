@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.example.suseelacateringcrm.ui.attendance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.AttendanceStatus
import com.example.suseelacateringcrm.data.model.PayType
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.PayrollRow
import com.example.suseelacateringcrm.ui.components.AmountRow
import com.example.suseelacateringcrm.ui.components.CalcModeChip
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.DayPickerField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.rememberIsOnline

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(
    padding: PaddingValues,
    onOpenPayroll: () -> Unit,
    viewModel: AttendanceViewModel = viewModel(),
) {
    val staffState by viewModel.staff.collectAsStateWithLifecycle()
    val records by viewModel.records.collectAsStateWithLifecycle()
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    val isOnline by rememberIsOnline()

    // Back online → send what was kept on the phone.
    LaunchedEffect(isOnline) { if (isOnline) viewModel.flushPending() }
    com.example.suseelacateringcrm.util.OnRefresh { viewModel.flushPending() }

    Column(Modifier.padding(padding).fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            ScreenHeader(
                if (viewModel.isStaffSelf) L("నా హాజరు", "My attendance") else L("హాజరు", "Attendance"),
                DayKey.display(viewModel.date),
            )
            if (!viewModel.isStaffSelf) {
                DayPickerField(L("తేదీ", "Date"), viewModel.date, { viewModel.changeDate(it) })
            }
            if (viewModel.role == UserRole.ADMIN) {
                Button(onClick = onOpenPayroll) { Text(L("నెల జీతాల లెక్క", "Month payroll")) }
            }
            if (pending.isNotEmpty()) {
                NoticeBox(
                    L("${pending.size} హాజరు phone లో ఉన్నాయి — సిగ్నల్ రాగానే పంపుతాం", "${pending.size} entries waiting on the phone — sent when online"),
                    Tone.WARNING,
                )
            }
            viewModel.flushMessage?.let { NoticeBox(it, Tone.BAD) }
        }
        when (val s = staffState) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> {
                if (s.data.isEmpty()) {
                    EmptyState(L("సిబ్బంది లేరు", "No staff"))
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(s.data, key = { it.id }) { staff ->
                            val input = viewModel.inputFor(staff.id)
                            val saved = records[staff.id]
                            val waiting = pending.any { it.staffId == staff.id && it.date == viewModel.date }
                            Card(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(staff.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                                        when {
                                            waiting -> Pill(L("పంపాలి", "Waiting"), Tone.WARNING)
                                            saved != null -> Pill(AttendanceStatus.from(saved.status).label, Tone.GOOD)
                                            else -> Pill(L("నమోదు కాలేదు", "Not marked"), Tone.INFO)
                                        }
                                    }
                                    ChoiceChips(AttendanceStatus.entries, input.status, { it.label }, { viewModel.setStatus(staff.id, it) })
                                    // R10-2: the shift this attendance is for (picked automatically, tap to change).
                                    viewModel.shiftsByStaff[staff.id]?.takeIf { it.isNotEmpty() }?.let { shifts ->
                                        val chosen = viewModel.chosenShift[staff.id] ?: ""
                                        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            shifts.forEach { sh ->
                                                androidx.compose.material3.FilterChip(
                                                    selected = chosen == sh.id,
                                                    onClick = { viewModel.chosenShift[staff.id] = sh.id },
                                                    label = { Text(L("షిఫ్ట్ ", "Shift ") + sh.label) },
                                                )
                                            }
                                            androidx.compose.material3.FilterChip(
                                                selected = chosen.isBlank(),
                                                onClick = { viewModel.chosenShift[staff.id] = "" },
                                                label = { Text(L("షిఫ్ట్ లేకుండా", "No shift")) },
                                            )
                                        }
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        OutlinedTextField(
                                            value = input.hoursText,
                                            onValueChange = { viewModel.setHours(staff.id, it) },
                                            label = { Text(L("గంటలు", "Hours")) },
                                            singleLine = true,
                                            enabled = input.status == AttendanceStatus.PRESENT || input.status == AttendanceStatus.HALF,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                            modifier = Modifier.width(120.dp),
                                        )
                                        Button(onClick = { viewModel.save(staff) }) { Text(L("సేవ్", "Save")) }
                                    }
                                    // Wages are admin-only (managers don't see staff pay).
                                    val isAdmin = viewModel.role == UserRole.ADMIN
                                    // Owner sees the pay; a manager (when allowed) may type it in manual mode
                                    // but never sees the amount (staff pay stays owner-only).
                                    val showPayChip = isAdmin || (viewModel.payManualMode && viewModel.canOverridePay)
                                    if (showPayChip && saved != null && PayType.from(staff.payType) == PayType.DAILY) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            if (isAdmin) {
                                                Text(L("ఈ రోజు కూలి: ", "Today's pay: ") + rupees(saved.pay), style = MaterialTheme.typography.bodySmall)
                                            }
                                            CalcModeChip(
                                                info = saved.calc,
                                                currentValue = if (isAdmin) saved.pay else null,
                                                canOverride = viewModel.canOverridePay,
                                                valueLabel = L("కూలి (₹)", "Pay (₹)"),
                                                manualMode = viewModel.payManualMode,
                                                onOverride = { m -> viewModel.overridePay(staff, saved, m) },
                                            )
                                        }
                                    }
                                    viewModel.rowMessages[staff.id]?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PayrollScreen(
    padding: PaddingValues,
    viewModel: PayrollViewModel = viewModel(),
) {
    com.example.suseelacateringcrm.util.OnRefresh { viewModel.load() }
    Column(Modifier.padding(padding).fillMaxSize().padding(16.dp)) {
        ScreenHeader(L("నెల జీతాలు", "Month payroll"), L("server లెక్క", "calculated by the server"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { viewModel.shift(-1) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, L("ముందు నెల", "Previous month")) }
            Text(viewModel.month, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = { viewModel.shift(1) }) { Icon(Icons.AutoMirrored.Filled.ArrowForward, L("తర్వాతి నెల", "Next month")) }
        }
        when (val s = viewModel.state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> NoticeBox(s.message, Tone.BAD)
            is UiState.Success -> {
                if (s.data.isEmpty()) EmptyState(L("ఈ నెల లెక్కలు లేవు", "Nothing for this month"))
                else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(s.data, key = { it.staffId }) { row ->
                            PayrollCard(
                                row,
                                viewModel.manualMode,
                                onOverride = { m -> viewModel.overrideRow(row.staffId, m) },
                                canPay = viewModel.isOwner,
                                onPay = { amount, date, method, note -> viewModel.paySalary(row.staffId, amount, date, method, note) },
                            )
                        }
                        item {
                            HorizontalDivider(Modifier.padding(vertical = 8.dp))
                            AmountRow(L("మొత్తం చెల్లించాల్సింది", "Total to pay"), rupees(s.data.sumOf { it.net }), bold = true)
                            // R10-1: owner closes the month — payslips written, advances booked as recovered.
                            if (viewModel.isOwner) FinalizePayrollButton(viewModel, s.data)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PayrollCard(
    row: PayrollRow,
    manualMode: Boolean,
    onOverride: suspend (com.example.suseelacateringcrm.data.remote.ManualOverride) -> String?,
    canPay: Boolean = false,
    onPay: suspend (Double, String, String, String) -> String? = { _, _, _, _ -> null },
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(row.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Pill(PayType.from(row.payType).label, Tone.INFO)
            }
            AmountRow(L("మొత్తం", "Gross"), rupees(row.gross))
            if (row.cut != 0.0) AmountRow(L("కోత", "Cut"), "-" + rupees(row.cut))
            if (row.ot != 0.0) AmountRow(L("ఓవర్‌టైమ్", "Overtime"), rupees(row.ot))
            if (row.advances != 0.0) AmountRow(L("అడ్వాన్స్ కోత", "Advance deduction"), "-" + rupees(row.advances))
            if (row.advanceCarry > 0) AmountRow(L("మిగిలిన అడ్వాన్స్ (వచ్చే నెల)", "Advance carried to next month"), rupees(row.advanceCarry))
            AmountRow(
                L("చేతికి", "Net"),
                rupees(row.net),
                bold = true,
                color = if (row.net < 0) MaterialTheme.colorScheme.error else androidx.compose.ui.graphics.Color.Unspecified,
            )
            if (row.net < 0) Text(L("Staff మనకు బాకీ ఉన్నారు", "Staff owes this amount"), style = MaterialTheme.typography.bodySmall)
            // Payroll is owner-only, so the owner may always type a value by hand.
            CalcModeChip(
                info = row.calc,
                currentValue = row.net,
                canOverride = true,
                valueLabel = L("చేతికి (₹)", "Net (₹)"),
                manualMode = manualMode,
                onOverride = onOverride,
            )
            // Module 4e: after the month is finalized the owner records the money handed over (part payments allowed).
            if (row.finalized) SalaryPaySection(row, canPay, onPay)
        }
    }
}

private val SALARY_METHODS = listOf("Cash", "UPI", "BankTransfer", "Other")
private fun salaryMethodLabel(code: String): String = when (code) {
    "Cash" -> L("నగదు", "Cash")
    "UPI" -> "UPI"
    "BankTransfer" -> L("బ్యాంక్ బదిలీ", "Bank transfer")
    else -> L("ఇతర", "Other")
}

/** Phone twin of the web SalaryPayPanel: fixed pay, paid so far, still due, and "చెల్లించు" (owner → recordSalaryPayment). */
@Composable
private fun SalaryPaySection(row: PayrollRow, canPay: Boolean, onPay: suspend (Double, String, String, String) -> String?) {
    var open by remember { mutableStateOf(false) }
    AmountRow(L("ఖరారైన జీతం", "Fixed pay"), rupees(row.finalNet))
    AmountRow(L("ఇచ్చినది", "Paid so far"), rupees(row.paid))
    AmountRow(L("ఇంకా ఇవ్వాల్సింది", "Still due"), rupees(row.due), bold = true)
    if (canPay && row.due > 0) {
        Button(onClick = { open = true }, modifier = Modifier.padding(top = 6.dp)) { Text(L("చెల్లించు", "Pay")) }
    }
    if (open) {
        var amountText by remember { mutableStateOf(row.due.toString()) }
        var date by remember { mutableStateOf(DayKey.today()) }
        var method by remember { mutableStateOf("Cash") }
        var note by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        var busy by remember { mutableStateOf(false) }
        val scope = androidx.compose.runtime.rememberCoroutineScope()
        val amount = amountText.toDoubleOrNull() ?: 0.0
        val valid = amount > 0 && amount <= row.due + 0.005 && date.isNotBlank() && date <= DayKey.today()
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!busy) open = false },
            title = { Text(L("జీతం చెల్లింపు — ${row.name}", "Salary payment — ${row.name}")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    error?.let { NoticeBox(it, Tone.BAD) }
                    Text(L("ఇంకా ఇవ్వాల్సింది ${rupees(row.due)}", "Still due ${rupees(row.due)}"))
                    OutlinedTextField(amountText, { amountText = it }, label = { Text(L("మొత్తం (₹)", "Amount (₹)")) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                    DayPickerField(label = L("తేదీ", "Date"), day = date, onDaySelected = { date = it })
                    ChoiceChips(SALARY_METHODS, method, { salaryMethodLabel(it) }, { method = it })
                    OutlinedTextField(note, { note = it }, label = { Text(L("గమనిక", "Note")) }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                Button(
                    enabled = valid && !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            error = onPay(amount, date, method, note)
                            busy = false
                            if (error == null) open = false
                        }
                    },
                ) { Text(L("సేవ్", "Save")) }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { open = false }, enabled = !busy) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}

/** R10-1: "జీతాలు ఖరారు చేయి" (owner) → finalizePayroll { month }; confirm shows total pay and total advance cut. */
@Composable
private fun FinalizePayrollButton(viewModel: PayrollViewModel, rows: List<PayrollRow>) {
    var confirm by remember { mutableStateOf(false) }
    val finalizedAt = viewModel.finalizedAt
    // QA fix 9: already finalized → say when, and the button stays off.
    if (finalizedAt != null) {
        val day = com.example.suseelacateringcrm.util.DateUtils.formatDate(finalizedAt)
        NoticeBox(L("ఈ నెల జీతాలు ఖరారు అయ్యాయి ($day)", "This month's payroll is finalized ($day)"), Tone.INFO)
    }
    Button(onClick = { confirm = true }, enabled = !viewModel.finalizing && finalizedAt == null, modifier = Modifier.padding(top = 8.dp)) {
        Text(if (finalizedAt != null) L("ఖరారు అయ్యాయి", "Finalized") else L("జీతాలు ఖరారు చేయి", "Finalize payroll"))
    }
    viewModel.finalizeMessage?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD) }
    if (confirm) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text(L("${viewModel.month} జీతాలు ఖరారు", "Finalize ${viewModel.month} payroll")) },
            text = {
                Column {
                    Text(L("${rows.size} మంది సిబ్బంది", "${rows.size} staff"))
                    AmountRow(L("మొత్తం జీతాలు", "Total pay"), rupees(rows.sumOf { it.net }), bold = true)
                    AmountRow(L("అడ్వాన్స్ కోత మొత్తం", "Total advance cut"), rupees(rows.sumOf { it.advances }))
                    if (rows.any { it.advanceCarry > 0 }) AmountRow(L("వచ్చే నెలకు మిగిలిన అడ్వాన్స్", "Advance carried forward"), rupees(rows.sumOf { it.advanceCarry }))
                    Text(L("జీతం చీటీలు నమోదు అవుతాయి, కోసిన అడ్వాన్స్‌లు తీరినట్టు రాస్తాం. మళ్ళీ చేసినా సమస్య లేదు.",
                        "Payslips are written and the cut advances are booked as recovered. Safe to run again."), style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { confirm = false; viewModel.finalize() }) { Text(L("ఖరారు చేయి", "Finalize")) } },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { confirm = false }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}
