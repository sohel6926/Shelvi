package com.example.suseelacateringcrm.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.model.CalcInfo
import com.example.suseelacateringcrm.data.remote.ManualOverride
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L

/**
 * "ఆటోమేటిక్" (green) or "మాన్యువల్ · name" (gold outline) next to a computed value.
 * Tap → details sheet: automatic value, difference, reason, and — only when [canOverride] —
 * "Enter manually" (reason required, ≥ 3 characters) and "Switch to automatic".
 *
 * [onOverride] receives a [ManualOverride]; value == null means "switch to automatic".
 * It returns an error text (Telugu/English already picked) or null on success.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalcModeChip(
    info: CalcInfo,
    currentValue: Double?,
    canOverride: Boolean,
    modifier: Modifier = Modifier,
    format: (Double) -> String = ::rupees,
    valueLabel: String = L("మొత్తం", "Amount"),
    /**
     * settings.calcModes.<area> == "manual": show the "Enter manually" button right next to the
     * chip (not only inside the details sheet), so typing the value is the default path.
     */
    manualMode: Boolean = false,
    onOverride: (suspend (ManualOverride) -> String?)? = null,
) {
    var showSheet by remember { mutableStateOf(false) }
    var showManual by remember { mutableStateOf(false) }
    var manualSwitchBack by remember { mutableStateOf(false) }
    val colors = SuseelaTheme.colors
    val shape = RoundedCornerShape(50)

    val text = if (info.manual) L("మాన్యువల్", "Manual") + (if (info.byName.isNotBlank()) " · ${info.byName}" else "")
    else L("ఆటోమేటిక్", "Automatic")
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = if (info.manual) colors.sectionLabel else colors.good,
        modifier = modifier
            .then(
                if (info.manual) Modifier.border(BorderStroke(1.5.dp, colors.gold), shape)
                else Modifier.background(colors.goodTint, shape)
            )
            .clickable { showSheet = true }
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
    if (manualMode && canOverride && onOverride != null && !info.manual) {
        OutlinedButton(
            onClick = { manualSwitchBack = false; showManual = true },
            modifier = Modifier.padding(top = 4.dp),
        ) { Text(L("చేతితో పెట్టు (Settings: మాన్యువల్)", "Enter manually (Settings: manual)")) }
    }

    if (showSheet) {
        val sheetState = rememberModalBottomSheetState()
        ModalBottomSheet(onDismissRequest = { showSheet = false }, sheetState = sheetState) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text(
                    if (info.manual) L("ఈ విలువ చేతితో పెట్టారు", "This value was entered by hand")
                    else L("ఈ విలువ server లెక్కించింది", "This value is calculated by the server"),
                    style = MaterialTheme.typography.titleMedium,
                )
                currentValue?.let { AmountRow(L("ఇప్పుడు ఉన్నది", "Current"), format(it), bold = true) }
                if (info.manual) {
                    info.autoValue?.let { auto ->
                        AmountRow(L("ఆటోమేటిక్ విలువ", "Automatic value"), format(auto))
                        currentValue?.let { cur ->
                            val diff = cur - auto
                            AmountRow(L("తేడా", "Difference"), (if (diff > 0) "+" else if (diff < 0) "-" else "") + format(kotlin.math.abs(diff)))
                        }
                    }
                    if (info.byName.isNotBlank()) AmountRow(L("మార్చినవారు", "Changed by"), info.byName)
                    if (info.at != null) AmountRow(L("ఎప్పుడు", "When"), DateUtils.formatDateTime(info.at))
                    if (info.reason.isNotBlank()) Text(L("కారణం: ", "Reason: ") + info.reason, modifier = Modifier.padding(top = 4.dp))
                }
                if (canOverride && onOverride != null) {
                    Button(onClick = { manualSwitchBack = false; showManual = true }, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
                        Text(L("చేతితో పెట్టు (Enter manually)", "Enter manually"))
                    }
                    if (info.manual) {
                        OutlinedButton(onClick = { showManual = true; manualSwitchBack = true }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                            Text(L("ఆటోమేటిక్‌కి మార్చు", "Switch to automatic"))
                        }
                    }
                } else if (!canOverride) {
                    Text(
                        L("చేతితో మార్చే అనుమతి owner కి (లేదా అనుమతి ఉన్న manager కి) మాత్రమే.", "Only the owner (or an allowed manager) can change this by hand."),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                TextButton(onClick = { showSheet = false }, modifier = Modifier.padding(vertical = 8.dp)) { Text(L("మూసివేయి", "Close")) }
            }
        }
    }

    if (showManual && onOverride != null) {
        ManualValueDialog(
            switchBack = manualSwitchBack,
            valueLabel = valueLabel,
            initial = currentValue,
            onDismiss = { showManual = false; manualSwitchBack = false },
            onSubmit = onOverride,
            onDone = { showManual = false; manualSwitchBack = false; showSheet = false },
        )
    }
}

@Composable
private fun ManualValueDialog(
    switchBack: Boolean,
    valueLabel: String,
    initial: Double?,
    onDismiss: () -> Unit,
    onSubmit: suspend (ManualOverride) -> String?,
    onDone: () -> Unit,
) {
    var valueText by remember { mutableStateOf(initial?.let { fmtQty(it) } ?: "") }
    var reason by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var submit by remember { mutableStateOf<ManualOverride?>(null) }

    // Run the suspend callback from a coroutine tied to the dialog.
    submit?.let { request ->
        androidx.compose.runtime.LaunchedEffect(request) {
            busy = true
            val err = onSubmit(request)
            busy = false
            submit = null
            if (err == null) onDone() else error = err
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (switchBack) L("ఆటోమేటిక్‌కి మార్చు", "Switch to automatic") else L("చేతితో పెట్టు", "Enter manually")) },
        text = {
            Column {
                if (!switchBack) {
                    AppTextField(valueText, { valueText = it }, valueLabel, keyboardType = KeyboardType.Decimal)
                }
                AppTextField(reason, { reason = it }, L("కారణం (తప్పనిసరి)", "Reason (required)"), singleLine = false)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (busy) Text(L("సేవ్ చేస్తున్నాం…", "Saving…"))
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                val r = reason.trim()
                if (r.length < 3) {
                    error = L("కారణం కనీసం 3 అక్షరాలు రాయండి", "Write a reason of at least 3 characters")
                    return@TextButton
                }
                if (switchBack) {
                    submit = ManualOverride(null, r)
                } else {
                    val v = valueText.trim().toDoubleOrNull()
                    if (v == null || v < 0) {
                        error = L("సరైన సంఖ్య (మైనస్ కాదు) రాయండి", "Enter a number, not negative")
                        return@TextButton
                    }
                    submit = ManualOverride(v, r)
                }
            }) { Text(L("సేవ్", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
