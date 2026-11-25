package com.example.suseelacateringcrm.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.CostTarget
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

/** Short label for a booking in pickers: "Customer · Event · 12 Nov". */
fun bookingPickLabel(b: Booking): String =
    listOf(b.customerNameSnapshot, tr(b.eventType), b.eventDate?.let { DateUtils.formatDate(it) } ?: "")
        .filter { it.isNotBlank() }.joinToString(" · ")

/**
 * R7-3: "రద్దు చేయి" with a reason (at least 3 letters). [onConfirm] gets the trimmed reason.
 * [archive] = master data (wording "పక్కన పెట్టు / Archive").
 */
@Composable
fun CancelRecordDialog(
    what: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
    archive: Boolean = false,
    busy: Boolean = false,
) {
    var reason by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (archive) L("పక్కన పెట్టు: $what", "Archive: $what") else L("రద్దు చేయి: $what", "Cancel: $what")) },
        text = {
            Column {
                Text(
                    L(
                        "ఇది తీసేయం — 'రద్దైనవి' లో కనిపిస్తుంది, లెక్కల్లో కలవదు. కారణం రాయండి.",
                        "Nothing is deleted — it moves to 'cancelled' and is left out of totals. Give a reason.",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                )
                AppTextField(
                    value = reason,
                    onValueChange = { reason = it; error = null },
                    label = L("కారణం", "Reason"),
                    singleLine = false,
                    isError = error != null,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                val r = reason.trim()
                if (r.length < 3) error = L("కారణం కనీసం 3 అక్షరాలు రాయండి", "Reason must be at least 3 letters")
                else onConfirm(r)
            }) { Text(if (archive) L("పక్కన పెట్టు", "Archive") else L("రద్దు చేయి", "Cancel record")) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(L("వద్దు", "Back")) } },
    )
}

/** R7-3: list toggle "రద్దైనవి చూపించు". */
@Composable
fun ShowCancelledToggle(checked: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(L("రద్దైనవి చూపించు", "Show cancelled"), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

/** True for docs that R7-3 hides by default. */
fun isCancelledStatus(status: String?): Boolean = status.equals("Cancelled", ignoreCase = true)

/**
 * R7-1 cost target: an event (booking + optional meal session) or an overhead centre.
 * Required on create; callers default it to the booking picked on screen, else "general".
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CostTargetPicker(
    target: CostTarget,
    bookings: List<Booking>,
    onChange: (CostTarget) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(L("ఈ ఖర్చు దేనికి?", "Who pays for this?"), style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = target.isBooking,
                enabled = enabled,
                onClick = { if (!target.isBooking) onChange(CostTarget(type = CostTarget.TYPE_BOOKING)) },
                label = { Text(L("కార్యక్రమం (Event)", "Event")) },
            )
            FilterChip(
                selected = !target.isBooking,
                enabled = enabled,
                onClick = { if (target.isBooking) onChange(CostTarget()) },
                label = { Text(L("సాధారణ ఖర్చు", "Overhead")) },
            )
        }
        if (target.isBooking) {
            val picked = bookings.find { it.id == target.bookingId }
            ExposedDropdownMenuBox(expanded = menuOpen, onExpandedChange = { if (enabled) menuOpen = it }) {
                OutlinedTextField(
                    value = picked?.let { bookingPickLabel(it) } ?: if (target.bookingId.isNotBlank()) target.bookingId else "",
                    onValueChange = {},
                    readOnly = true,
                    enabled = enabled,
                    isError = target.bookingId.isBlank(),
                    label = { Text(L("కార్యక్రమం ఎంచుకోండి", "Choose the event")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuOpen) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    bookings.filterNot { isCancelledStatus(it.status) }.forEach { b ->
                        DropdownMenuItem(
                            text = { Text(bookingPickLabel(b)) },
                            onClick = { onChange(CostTarget(type = CostTarget.TYPE_BOOKING, bookingId = b.id)); menuOpen = false },
                        )
                    }
                }
            }
            val sessions = picked?.sessions.orEmpty()
            if (sessions.isNotEmpty()) {
                Text(L("ఏ భోజనం? (ఐచ్ఛికం)", "Which meal? (optional)"), style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(
                        selected = target.sessionId.isBlank(),
                        enabled = enabled,
                        onClick = { onChange(target.copy(sessionId = "")) },
                        label = { Text(L("మొత్తం కార్యక్రమం", "Whole event")) },
                    )
                    sessions.forEach { s ->
                        FilterChip(
                            selected = target.sessionId == s.id,
                            enabled = enabled,
                            onClick = { onChange(target.copy(sessionId = s.id)) },
                            label = { Text(s.name.ifBlank { s.date }) },
                        )
                    }
                }
            }
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CostTarget.CENTRES.forEach { c ->
                    FilterChip(
                        selected = target.centre == c,
                        enabled = enabled,
                        onClick = { onChange(CostTarget(centre = c)) },
                        label = { Text(CostTarget.centreLabel(c)) },
                    )
                }
            }
        }
    }
}

/** Dropdown to pick one booking (cancelled ones left out). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingPickerField(
    bookings: List<Booking>,
    selectedId: String,
    onPick: (Booking) -> Unit,
    label: String = L("కార్యక్రమం", "Event"),
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val picked = bookings.find { it.id == selectedId }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }, modifier = modifier) {
        OutlinedTextField(
            value = picked?.let { bookingPickLabel(it) } ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            bookings.filterNot { isCancelledStatus(it.status) }.sortedByDescending { it.eventDate }.forEach { b ->
                DropdownMenuItem(text = { Text(bookingPickLabel(b)) }, onClick = { onPick(b); open = false })
            }
        }
    }
}

/** Simple string dropdown. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> SimplePickerField(
    items: List<T>,
    selected: T?,
    itemLabel: (T) -> String,
    onPick: (T) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }, modifier = modifier) {
        OutlinedTextField(
            value = selected?.let(itemLabel) ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            items.forEach { item ->
                DropdownMenuItem(text = { Text(itemLabel(item)) }, onClick = { onPick(item); open = false })
            }
        }
    }
}

/** Number text → Double (blank = null). */
fun numOrNull(text: String): Double? = text.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()

fun fmtNum(q: Double): String = if (q % 1.0 == 0.0) q.toLong().toString() else "%.2f".format(q)

/** R10-8: server stamp of the WhatsApp consent (read only): "ఒప్పుకున్నది: date · who". */
@Composable
fun OptInStampLine(at: java.util.Date?, byUid: String) {
    if (at == null) return
    var who by remember(byUid) { mutableStateOf("") }
    androidx.compose.runtime.LaunchedEffect(byUid) {
        who = if (byUid.isBlank() || byUid == "system" || byUid == "unknown") "" else try {
            com.example.suseelacateringcrm.di.ServiceLocator.userRepository.getUserProfile(byUid)?.name ?: ""
        } catch (e: Exception) {
            ""
        }
    }
    Text(
        L("ఒప్పుకున్నది: ", "Agreed: ") + DateUtils.formatDateTime(at) + if (who.isNotBlank()) " · $who" else "",
        style = MaterialTheme.typography.bodySmall,
    )
}
