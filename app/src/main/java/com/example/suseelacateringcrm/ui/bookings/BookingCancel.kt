package com.example.suseelacateringcrm.ui.bookings

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.model.outstandingOf
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.cancelBooking
import com.example.suseelacateringcrm.data.remote.postponeBooking
import com.example.suseelacateringcrm.data.remote.restoreBooking
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.fmtNum
import com.example.suseelacateringcrm.ui.components.numOrNull
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rMap
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.tr
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/** Round 9 cancel reasons (api-contract). */
val CANCEL_REASONS = listOf("customer-cancelled", "postponed-no-date", "price", "went-elsewhere", "event-called-off", "our-side", "other")

fun cancelReasonLabel(code: String): String = when (code) {
    "customer-cancelled" -> L("కస్టమర్ రద్దు చేశారు", "Customer cancelled")
    "postponed-no-date" -> L("వాయిదా — తేదీ లేదు", "Postponed, no date")
    "price" -> L("ధర ఎక్కువ", "Price too high")
    "went-elsewhere" -> L("వేరే వాళ్ళకి ఇచ్చారు", "Went elsewhere")
    "event-called-off" -> L("శుభకార్యం జరగట్లేదు", "Event called off")
    "our-side" -> L("మా వైపు సమస్య", "Problem on our side")
    "other" -> L("ఇతర", "Other")
    else -> code
}

/** Invoice payment methods (server recordPayment list). */
private val REFUND_METHODS = listOf("Cash", "UPI", "BankTransfer", "Card", "Other")

/** Money the customer has paid on this booking's invoices (server-written amountPaid). */
private suspend fun paidOnBooking(bookingId: String): Double = try {
    ServiceLocator.firestore.collection("invoices").whereEqualTo("bookingId", bookingId).get().await()
        .documents.mapNotNull { it.data }
        .filterNot { it.rStr("status").equals("Cancelled", true) }
        .sumOf { it.rNum("amountPaid") }
} catch (e: Exception) {
    0.0
}

private fun shareText(context: android.content.Context, text: String) {
    val wa = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text); setPackage("com.whatsapp") }
    try {
        context.startActivity(wa)
    } catch (e: Exception) {
        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }, L("పంపు", "Share")))
    }
}

/**
 * Round 9 "ఆర్డర్ రద్దు": reason chips + note, advance step (paid amount, refund all / part / keep, amount, method),
 * customer-message toggle, summary, then cancelBooking. The returned Telugu message can be shared on WhatsApp.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CancelOrderDialog(booking: Booking, ops: EventOpsViewModel, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var reasonCode by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var paid by remember { mutableStateOf<Double?>(null) }
    var advance by remember { mutableStateOf("refund-all") }
    var refundText by remember { mutableStateOf("") }
    var method by remember { mutableStateOf("Cash") }
    var notify by remember { mutableStateOf(true) }
    var confirming by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var blockers by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var resultMessage by remember { mutableStateOf<String?>(null) }
    var summaryText by remember { mutableStateOf("") }
    LaunchedEffect(booking.id) { paid = paidOnBooking(booking.id) }

    val paidAmt = paid ?: 0.0
    val refund = when {
        paidAmt <= 0 -> 0.0
        advance == "refund-all" -> paidAmt
        advance == "refund-part" -> numOrNull(refundText) ?: 0.0
        else -> 0.0
    }
    val kept = (paidAmt - refund).coerceAtLeast(0.0)
    val vesselsOut = outstandingOf(ops.moves).filter { it.outstanding > 0 }

    fun validate(): String? = when {
        reasonCode.isBlank() -> L("రద్దుకు కారణం ఎంచుకోండి", "Choose a reason")
        note.trim().length < 3 -> L("వివరం కనీసం 3 అక్షరాలు రాయండి", "Write at least 3 letters")
        paidAmt > 0 && advance == "refund-part" && (refund < 0.01 || refund > paidAmt) ->
            L("తిరిగి ఇచ్చే మొత్తం ₹0.01 నుంచి ${CurrencyUtils.formatInr(paidAmt)} మధ్య", "Refund must be ₹0.01 to ${CurrencyUtils.formatInr(paidAmt)}")
        else -> null
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (resultMessage != null) L("ఆర్డర్ రద్దు అయింది", "Order cancelled") else L("ఆర్డర్ రద్దు", "Cancel order")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                val done = resultMessage
                if (done != null) {
                    if (summaryText.isNotBlank()) Text(summaryText, fontWeight = FontWeight.SemiBold)
                    Text(L("కస్టమర్‌కి సందేశం:", "Message for the customer:"), style = MaterialTheme.typography.labelMedium)
                    Text(done, style = MaterialTheme.typography.bodyMedium)
                    return@Column
                }
                if (!confirming) {
                    Text(L("కారణం", "Reason"), style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        CANCEL_REASONS.forEach { c -> FilterChip(selected = reasonCode == c, onClick = { reasonCode = c }, label = { Text(cancelReasonLabel(c)) }) }
                    }
                    OutlinedTextField(note, { note = it }, label = { Text(L("వివరం", "Note")) }, modifier = Modifier.fillMaxWidth())
                    when {
                        paid == null -> Text(L("చెల్లింపులు చూస్తున్నాం…", "Checking payments…"), style = MaterialTheme.typography.bodySmall)
                        paidAmt <= 0 -> Text(L("కస్టమర్ ఇంకా ఏమీ కట్టలేదు.", "The customer has paid nothing."), style = MaterialTheme.typography.bodySmall)
                        else -> {
                            Text(
                                L("కస్టమర్ కట్టింది: ${CurrencyUtils.formatInr(paidAmt)}", "Customer paid: ${CurrencyUtils.formatInr(paidAmt)}"),
                                fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp),
                            )
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                FilterChip(selected = advance == "refund-all", onClick = { advance = "refund-all" }, label = { Text(L("మొత్తం తిరిగి", "Refund all")) })
                                FilterChip(selected = advance == "refund-part", onClick = { advance = "refund-part" }, label = { Text(L("కొంత తిరిగి", "Refund part")) })
                                FilterChip(selected = advance == "keep", onClick = { advance = "keep" }, label = { Text(L("ఉంచుకుంటాం", "Keep it")) })
                            }
                            if (advance == "refund-part") {
                                OutlinedTextField(
                                    refundText, { refundText = it }, label = { Text(L("తిరిగి ఇచ్చే మొత్తం (₹)", "Refund amount (₹)")) },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            if (advance != "keep") {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    REFUND_METHODS.forEach { m -> FilterChip(selected = method == m, onClick = { method = m }, label = { Text(tr(m)) }) }
                                }
                            }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                        Text(L("కస్టమర్‌కి సందేశం", "Message to customer"), Modifier.weight(1f))
                        Switch(checked = notify, onCheckedChange = { notify = it })
                    }
                    if (vesselsOut.isNotEmpty()) {
                        Text(
                            L("ముందు పాత్రలు తిరిగి తీసుకోవాలి: ", "Vessels must come back first: ") + vesselsOut.joinToString { "${it.name} ${fmtNum(it.outstanding)}" },
                            color = SuseelaTheme.colors.bad, style = MaterialTheme.typography.bodySmall,
                        )
                    }
                } else {
                    // Summary before confirm.
                    Text(L("సరిచూడండి:", "Please check:"), style = MaterialTheme.typography.labelMedium)
                    Text("• " + cancelReasonLabel(reasonCode) + " — " + note.trim())
                    if (paidAmt > 0) {
                        Text("• " + L("${CurrencyUtils.formatInr(refund)} తిరిగి, ${CurrencyUtils.formatInr(kept)} ఉంచుకున్నాం",
                            "${CurrencyUtils.formatInr(refund)} refunded, ${CurrencyUtils.formatInr(kept)} kept") +
                            if (refund > 0) " (${tr(method)})" else "")
                    }
                    if (booking.assignedStaffIds.isNotEmpty()) Text("• " + L("${booking.assignedStaffIds.size} సిబ్బంది ఖాళీ", "${booking.assignedStaffIds.size} staff freed"))
                    Text("• " + L("కొటేషన్లు రద్దు, stock తిరిగి, వంట plan నుంచి తీసేస్తాం", "Quotations cancelled, stock returned, removed from kitchen plans"))
                    if (notify) Text("• " + L("కస్టమర్‌కి పంపడానికి సందేశం తయారు చేస్తాం", "A message for the customer will be prepared"))
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                blockers.forEach { (te, en) -> Text("• " + L(te, en), color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            val done = resultMessage
            when {
                done != null -> TextButton(onClick = { shareText(context, done) }) { Text(L("WhatsApp లో పంపు", "Share on WhatsApp")) }
                !confirming -> TextButton(enabled = paid != null, onClick = {
                    error = validate()
                    if (error == null) confirming = true
                }) { Text(L("తర్వాత", "Next")) }
                else -> TextButton(enabled = !busy, onClick = {
                    busy = true
                    error = null
                    blockers = emptyList()
                    scope.launch {
                        val r = ServiceLocator.functions.cancelBooking(
                            bookingId = booking.id,
                            reasonCode = reasonCode,
                            reason = note.trim(),
                            advance = if (paidAmt > 0) advance else null,
                            refundAmount = if (paidAmt > 0 && advance != "keep") refund else null,
                            refundMethod = if (paidAmt > 0 && advance != "keep") method else null,
                            notifyCustomer = notify,
                        )
                        busy = false
                        r.fold(
                            onSuccess = { r ->
                                summaryText = r.summary
                                if (r.customerMessage.isNotBlank()) resultMessage = r.customerMessage else onDismiss()
                            },
                            onFailure = {
                                val ce = CallableError.from(it)
                                error = ce.text
                                blockers = ce.blockers
                                confirming = false
                            },
                        )
                    }
                }) { Text(L("రద్దు చేయి", "Cancel order"), color = SuseelaTheme.colors.bad) }
            }
        },
        dismissButton = {
            TextButton(enabled = !busy, onClick = { if (confirming && resultMessage == null) confirming = false else onDismiss() }) {
                Text(if (resultMessage != null) L("మూసు", "Close") else if (confirming) L("వెనక్కి", "Back") else L("వద్దు", "Don't cancel"))
            }
        },
    )
}

/** Round 9: red band on a cancelled booking — reason, who, when, money; admin can restore. */
@Composable
fun CancelledBand(booking: Booking, role: UserRole?) {
    if (booking.bookingStatus != BookingStatus.CANCELLED) return
    val c = booking.cancel.orEmpty()
    val by = c.rMap("by").rStr("name").ifBlank { c.rStr("by") }
    val at = c.rDate("at")
    val refund = (c["refund"] as? Map<*, *>)?.let { (it["amount"] as? Number)?.toDouble() } ?: c.rNum("refund")
    val charge = c.rNum("charge").takeIf { it > 0 } ?: booking.cancellationCharge
    var showRestore by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp).background(SuseelaTheme.colors.badTint, androidx.compose.foundation.shape.RoundedCornerShape(8.dp)).padding(12.dp)) {
        Text(L("ఈ ఆర్డర్ రద్దు అయింది", "This order is cancelled"), color = SuseelaTheme.colors.bad, fontWeight = FontWeight.Bold)
        val code = c.rStr("reasonCode")
        Text(listOf(if (code.isNotBlank()) cancelReasonLabel(code) else "", c.rStr("reason").ifBlank { booking.cancelReason })
            .filter { it.isNotBlank() }.joinToString(" — "))
        if (by.isNotBlank() || at != null) Text(L("చేసినవారు: ", "By: ") + listOf(by, at?.let { DateUtils.formatDateTime(it) } ?: "").filter { it.isNotBlank() }.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
        if (refund > 0 || charge > 0) {
            Text(L("తిరిగి ఇచ్చింది ${CurrencyUtils.formatInr(refund)} · రద్దు చార్జీ ${CurrencyUtils.formatInr(charge)}",
                "Refunded ${CurrencyUtils.formatInr(refund)} · cancellation charge ${CurrencyUtils.formatInr(charge)}"))
        }
        message?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        if (role == UserRole.ADMIN) {
            OutlinedButton(onClick = { showRestore = true }) { Text(L("మళ్ళీ తెరువు", "Restore order")) }
        }
    }
    if (showRestore) {
        var reason by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showRestore = false },
            title = { Text(L("ఆర్డర్ మళ్ళీ తెరువు", "Restore order")) },
            text = {
                Column {
                    Text(L("తిరిగి ఇచ్చిన డబ్బు మారదు — మళ్ళీ కడితే కొత్త చెల్లింపుగా రాయండి.", "Refunds are not reversed — record any new payment."), style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(reason, { reason = it }, label = { Text(L("కారణం", "Reason")) }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton(enabled = reason.trim().length >= 3, onClick = {
                    showRestore = false
                    scope.launch {
                        message = ServiceLocator.functions.restoreBooking(booking.id, reason.trim()).fold(
                            onSuccess = { note -> L("మళ్ళీ తెరిచాం ✓ ", "Restored ✓ ") + note },
                            onFailure = { CallableError.from(it).text },
                        )
                    }
                }) { Text(L("తెరువు", "Restore")) }
            },
            dismissButton = { TextButton(onClick = { showRestore = false }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}

/** Round 9: "ఆర్డర్ రద్దు" + "తేదీ మార్చు" buttons for owner / manager on a live booking. */
@Composable
fun CancelOrPostponeButtons(booking: Booking, role: UserRole?, ops: EventOpsViewModel) {
    if ((role != UserRole.ADMIN && role != UserRole.MANAGER) || booking.bookingStatus == BookingStatus.CANCELLED || booking.closed != null ||
        booking.bookingStatus == BookingStatus.CLOSED) return
    var showCancel by remember { mutableStateOf(false) }
    var showPostpone by remember { mutableStateOf(false) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        OutlinedButton(onClick = { showPostpone = true }) { Text(L("తేదీ మార్చు", "Change date")) }
        OutlinedButton(onClick = { showCancel = true }) { Text(L("ఆర్డర్ రద్దు", "Cancel order"), color = SuseelaTheme.colors.bad) }
    }
    if (showCancel) CancelOrderDialog(booking, ops, onDismiss = { showCancel = false })
    if (showPostpone) PostponeDialog(booking, onDismiss = { showPostpone = false })
}

@Composable
private fun PostponeDialog(booking: Booking, onDismiss: () -> Unit) {
    var date by remember { mutableStateOf(booking.eventDate?.let { DayKey.of(it) } ?: DayKey.today()) }
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val oldDay = booking.eventDate?.let { DayKey.of(it) } ?: ""
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(L("తేదీ మార్చు (వాయిదా)", "Change date (postpone)")) },
        text = {
            Column {
                Text(L("మెనూ, అడ్వాన్స్, సిబ్బంది అన్నీ అలాగే ఉంటాయి. పాత → కొత్త తేదీ చరిత్రలో రాస్తాం.", "Menu, advance and staff stay. Old → new date is logged."), style = MaterialTheme.typography.bodySmall)
                if (oldDay.isNotBlank()) Text(L("ఇప్పటి తేదీ: ${DayKey.display(oldDay)}", "Current date: ${DayKey.display(oldDay)}"))
                AppDatePickerField(L("కొత్త తేదీ", "New date"), DayKey.parse(date), { date = DayKey.of(it) })
                if (booking.sessions.isNotEmpty()) Text(L("భోజనాల తేదీలు కూడా అదే రోజుల తేడాతో జరుగుతాయి.", "Meal session dates move by the same number of days."), style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(reason, { reason = it }, label = { Text(L("కారణం (ఐచ్ఛికం)", "Reason (optional)")) }, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && date != oldDay, onClick = {
                if (date < DayKey.today()) {
                    error = L("కొత్త తేదీ ఈ రోజు లేదా తర్వాత ఉండాలి", "The new date must be today or later")
                    return@TextButton
                }
                busy = true
                scope.launch {
                    ServiceLocator.functions.postponeBooking(booking.id, date, reason.trim()).fold(
                        onSuccess = { busy = false; onDismiss() },
                        onFailure = { busy = false; error = CallableError.from(it).text },
                    )
                }
            }) { Text(L("మార్చు", "Change")) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
