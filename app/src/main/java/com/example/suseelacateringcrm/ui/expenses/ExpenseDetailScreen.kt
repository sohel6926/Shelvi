package com.example.suseelacateringcrm.ui.expenses

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.compose.AsyncImage
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.PdfGenerator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun ExpenseDetailScreen(
    expenseId: String,
    padding: PaddingValues,
    onEdit: (String) -> Unit,
    onDeleted: () -> Unit,
) {
    val viewModel: ExpenseDetailViewModel = viewModel(
        key = "expense-detail-$expenseId",
        factory = viewModelFactory { initializer { ExpenseDetailViewModel(expenseId) } },
    )
    val expense by viewModel.expense.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(viewModel.deleteState) {
        if (viewModel.deleteState is UiState.Success) onDeleted()
    }

    val current = expense ?: run {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(current.expenseNumber.ifBlank { L("ఖర్చు", "Expense") }, style = MaterialTheme.typography.headlineSmall)
        Text("${current.section}${if (current.subCategory.isNotBlank()) " · ${current.subCategory}" else ""}", style = MaterialTheme.typography.titleMedium)
        Text(DateUtils.formatDate(current.serviceDate))
        if (current.personName.isNotBlank()) Text("Person: ${current.personName}${if (current.mobileNumber.isNotBlank()) " (${current.mobileNumber})" else ""}")
        Text(L("నమోదు చేసినవారు: ", "Recorded by: ") + current.staffName.ifBlank { L("తెలియదు", "Unknown") })

        if (current.quantity > 0) Text(L("పరిమాణం: ${current.quantity} ${current.unit} × ${CurrencyUtils.formatInr(current.rate)}", "Quantity: ${current.quantity} ${current.unit} × ${CurrencyUtils.formatInr(current.rate)}"))
        if (current.vehicleType.isNotBlank()) Text(L("వాహనం: ${current.vehicleType} ${current.vehicleNumber}", "Vehicle: ${current.vehicleType} ${current.vehicleNumber}"))
        if (current.fromLocation.isNotBlank() || current.toLocation.isNotBlank()) Text(L("మార్గం: ${current.fromLocation} → ${current.toLocation}", "Route: ${current.fromLocation} → ${current.toLocation}"))

        Text(L("మొత్తం (subtotal): ${CurrencyUtils.formatInr(current.subtotal)}", "Subtotal: ${CurrencyUtils.formatInr(current.subtotal)}"), modifier = Modifier.padding(top = 8.dp))
        if (current.transportCharges > 0) Text(L("రవాణా: ${CurrencyUtils.formatInr(current.transportCharges)}", "Transport: ${CurrencyUtils.formatInr(current.transportCharges)}"))
        if (current.setupCharges > 0) Text(L("సెటప్: ${CurrencyUtils.formatInr(current.setupCharges)}", "Setup: ${CurrencyUtils.formatInr(current.setupCharges)}"))
        if (current.otherCharges > 0) Text(L("ఇతర ఖర్చులు: ${CurrencyUtils.formatInr(current.otherCharges)}", "Other charges: ${CurrencyUtils.formatInr(current.otherCharges)}"))
        Text(L("మొత్తం: ${CurrencyUtils.formatInr(current.totalAmount)}", "Total: ${CurrencyUtils.formatInr(current.totalAmount)}"), style = MaterialTheme.typography.titleMedium)
        Text(L("అడ్వాన్స్: ${CurrencyUtils.formatInr(current.advancePaid)}", "Advance paid: ${CurrencyUtils.formatInr(current.advancePaid)}"))
        Text(L("బాకీ: ${CurrencyUtils.formatInr(current.balanceAmount)}", "Balance: ${CurrencyUtils.formatInr(current.balanceAmount)}"), style = MaterialTheme.typography.titleMedium)
        Text(L("చెల్లింపు: ${current.paymentMethod} · ${current.paymentStatus}", "Payment: ${current.paymentMethod} · ${current.paymentStatus}"))

        if (current.billNumber.isNotBlank()) Text(L("బిల్ నంబర్: ${current.billNumber}", "Bill number: ${current.billNumber}"))
        if (current.billMonth.isNotBlank()) Text(L("బిల్ నెల: ${current.billMonth}", "Bill month: ${current.billMonth}"))
        if (current.dueDate != null) Text(L("గడువు: ${DateUtils.formatDate(current.dueDate)}", "Due date: ${DateUtils.formatDate(current.dueDate)}"))
        if (current.paidDate != null) Text(L("చెల్లించిన తేదీ: ${DateUtils.formatDate(current.paidDate)}", "Paid date: ${DateUtils.formatDate(current.paidDate)}"))
        if (current.bookingLabel.isNotBlank()) Text(L("కార్యక్రమం: ${current.bookingLabel}", "Linked event: ${current.bookingLabel}"))
        if (current.notes.isNotBlank()) Text(L("గమనికలు: ${current.notes}", "Notes: ${current.notes}"), modifier = Modifier.padding(top = 8.dp))

        if (current.receiptPhotoUrl.isNotBlank()) {
            Text(L("రసీదు ఫోటో", "Receipt photo"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
            AsyncImage(
                model = current.receiptPhotoUrl,
                contentDescription = L("రసీదు ఫోటో", "Receipt photo"),
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().height(320.dp).padding(top = 8.dp),
            )
        }

        Row(modifier = Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onEdit(expenseId) }) {
                Text(L("మార్చు", "Edit"))
            }
            OutlinedButton(onClick = {
                val summary = buildString {
                    appendLine(current.expenseNumber)
                    appendLine("${current.section} · ${current.subCategory}")
                    appendLine("Date: ${DateUtils.formatDate(current.serviceDate)}")
                    appendLine("Person: ${current.personName} (${current.mobileNumber})")
                    appendLine("Total: ${CurrencyUtils.formatInr(current.totalAmount)}")
                    appendLine("Advance: ${CurrencyUtils.formatInr(current.advancePaid)} · Balance: ${CurrencyUtils.formatInr(current.balanceAmount)}")
                    appendLine("Status: ${current.paymentStatus}")
                }
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, summary)
                }
                context.startActivity(Intent.createChooser(intent, "Share expense"))
            }) {
                Text(L("పంపు", "Share"))
            }
            if (!current.status.equals("Cancelled", ignoreCase = true)) {
                OutlinedButton(onClick = { showDeleteConfirm = true }) {
                    Text(L("రద్దు చేయి", "Cancel"))
                }
            }
            OutlinedButton(onClick = {
                val lines = buildList {
                    add("${current.section}${if (current.subCategory.isNotBlank()) " · ${current.subCategory}" else ""}")
                    add("Date: ${DateUtils.formatDate(current.serviceDate)}")
                    if (current.personName.isNotBlank()) add("Person: ${current.personName} (${current.mobileNumber})")
                    add("Recorded by: ${current.staffName}")
                    add("")
                    if (current.quantity > 0) add("Quantity: ${current.quantity} ${current.unit} x ${CurrencyUtils.formatInr(current.rate)}")
                    add("Subtotal: ${CurrencyUtils.formatInr(current.subtotal)}")
                    if (current.transportCharges > 0) add("Transport: ${CurrencyUtils.formatInr(current.transportCharges)}")
                    if (current.setupCharges > 0) add("Setup: ${CurrencyUtils.formatInr(current.setupCharges)}")
                    if (current.otherCharges > 0) add("Other charges: ${CurrencyUtils.formatInr(current.otherCharges)}")
                    add("Total: ${CurrencyUtils.formatInr(current.totalAmount)}")
                    add("Advance paid: ${CurrencyUtils.formatInr(current.advancePaid)}")
                    add("Balance: ${CurrencyUtils.formatInr(current.balanceAmount)}")
                    add("Payment: ${current.paymentMethod} · ${current.paymentStatus}")
                    if (current.billNumber.isNotBlank()) add("Bill number: ${current.billNumber}")
                    if (current.bookingLabel.isNotBlank()) add("Linked event: ${current.bookingLabel}")
                }
                PdfGenerator.generateAndShare(
                    context = context,
                    fileName = "${current.expenseNumber.ifBlank { "expense" }}.pdf",
                    title = current.expenseNumber,
                    lines = lines,
                )
            }) {
                Text(L("PDF పంపు", "Export PDF"))
            }
        }

        val deleteState = viewModel.deleteState
        if (deleteState is UiState.Error) {
            Text(deleteState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }
    }

    if (showDeleteConfirm) {
        com.example.suseelacateringcrm.ui.components.CancelRecordDialog(
            what = L("ఖర్చు", "expense"),
            onConfirm = { reason ->
                showDeleteConfirm = false
                viewModel.cancel(reason)
            },
            onDismiss = { showDeleteConfirm = false },
        )
    }
}
