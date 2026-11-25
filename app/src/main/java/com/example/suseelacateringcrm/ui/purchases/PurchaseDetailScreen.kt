package com.example.suseelacateringcrm.ui.purchases

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
fun PurchaseDetailScreen(
    purchaseId: String,
    padding: PaddingValues,
    onEdit: (String) -> Unit,
    onDeleted: () -> Unit,
) {
    val viewModel: PurchaseDetailViewModel = viewModel(
        key = "purchase-detail-$purchaseId",
        factory = viewModelFactory { initializer { PurchaseDetailViewModel(purchaseId) } },
    )
    val purchase by viewModel.purchase.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(viewModel.deleteState) {
        if (viewModel.deleteState is UiState.Success) onDeleted()
    }

    val currentPurchase = purchase ?: run {
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
        Text(currentPurchase.purchaseNumber.ifBlank { L("కొనుగోలు", "Purchase") }, style = MaterialTheme.typography.headlineSmall)
        Text(currentPurchase.vendorNameSnapshot.ifBlank { L("తెలియని vendor", "Unknown vendor") }, style = MaterialTheme.typography.titleMedium)
        Text("${DateUtils.formatDateTime(currentPurchase.purchaseDate)}")
        if (currentPurchase.billNumber.isNotBlank()) Text(L("బిల్ నంబర్: ${currentPurchase.billNumber}", "Bill number: ${currentPurchase.billNumber}"))
        Text(L("నమోదు చేసినవారు: ", "Recorded by: ") + currentPurchase.staffName.ifBlank { L("తెలియదు", "Unknown") })

        Text(L("వస్తువులు", "Items"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        currentPurchase.items.forEach { item ->
            Text("${item.description}: ${item.quantity} ${item.unit} × ${CurrencyUtils.formatInr(item.unitPrice)} = ${CurrencyUtils.formatInr(item.amount)}")
        }

        Text(L("మొత్తం (subtotal): ${CurrencyUtils.formatInr(currentPurchase.subtotal)}", "Subtotal: ${CurrencyUtils.formatInr(currentPurchase.subtotal)}"), modifier = Modifier.padding(top = 8.dp))
        if (currentPurchase.discount > 0) Text(L("తగ్గింపు: ${CurrencyUtils.formatInr(currentPurchase.discount)}", "Discount: ${CurrencyUtils.formatInr(currentPurchase.discount)}"))
        if (currentPurchase.otherCharges > 0) Text(L("ఇతర ఖర్చులు: ${CurrencyUtils.formatInr(currentPurchase.otherCharges)}", "Other charges: ${CurrencyUtils.formatInr(currentPurchase.otherCharges)}"))
        Text(
            L("మొత్తం: ${CurrencyUtils.formatInr(currentPurchase.totalAmount)}", "Grand Total: ${CurrencyUtils.formatInr(currentPurchase.totalAmount)}"),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(L("చెల్లింపు: ${currentPurchase.paymentMethod} · ${currentPurchase.paymentStatus}", "Payment: ${currentPurchase.paymentMethod} · ${currentPurchase.paymentStatus}"))

        if (currentPurchase.notes.isNotBlank()) {
            Text(L("గమనికలు: ${currentPurchase.notes}", "Notes: ${currentPurchase.notes}"), modifier = Modifier.padding(top = 8.dp))
        }

        if (currentPurchase.billPhotoUrl.isNotBlank()) {
            Text(L("బిల్ ఫోటో", "Bill photo"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
            AsyncImage(
                model = currentPurchase.billPhotoUrl,
                contentDescription = L("బిల్ ఫోటో", "Bill photo"),
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().height(320.dp).padding(top = 8.dp),
            )
        }

        Row(modifier = Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onEdit(purchaseId) }) {
                Text(L("మార్చు", "Edit"))
            }
            OutlinedButton(onClick = {
                val summary = buildString {
                    appendLine(currentPurchase.purchaseNumber)
                    appendLine("Vendor: ${currentPurchase.vendorNameSnapshot}")
                    appendLine("Date: ${DateUtils.formatDateTime(currentPurchase.purchaseDate)}")
                    appendLine("Staff: ${currentPurchase.staffName}")
                    currentPurchase.items.forEach { item ->
                        appendLine("${item.description}: ${item.quantity} ${item.unit} = ${CurrencyUtils.formatInr(item.amount)}")
                    }
                    appendLine("Total: ${CurrencyUtils.formatInr(currentPurchase.totalAmount)}")
                }
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, summary)
                }
                context.startActivity(Intent.createChooser(intent, "Share purchase"))
            }) {
                Text(L("పంపు", "Share"))
            }
            if (!currentPurchase.status.equals("Cancelled", ignoreCase = true)) {
                OutlinedButton(onClick = { showDeleteConfirm = true }) {
                    Text(L("రద్దు చేయి", "Cancel"))
                }
            }
            OutlinedButton(onClick = {
                val lines = buildList {
                    add("Vendor: ${currentPurchase.vendorNameSnapshot}")
                    add("Date: ${DateUtils.formatDateTime(currentPurchase.purchaseDate)}")
                    if (currentPurchase.billNumber.isNotBlank()) add("Bill number: ${currentPurchase.billNumber}")
                    add("Staff: ${currentPurchase.staffName}")
                    add("")
                    add("Items:")
                    currentPurchase.items.forEach { item ->
                        add("${item.description}: ${item.quantity} ${item.unit} x ${CurrencyUtils.formatInr(item.unitPrice)} = ${CurrencyUtils.formatInr(item.amount)}")
                    }
                    add("")
                    add("Subtotal: ${CurrencyUtils.formatInr(currentPurchase.subtotal)}")
                    if (currentPurchase.discount > 0) add("Discount: ${CurrencyUtils.formatInr(currentPurchase.discount)}")
                    if (currentPurchase.otherCharges > 0) add("Other charges: ${CurrencyUtils.formatInr(currentPurchase.otherCharges)}")
                    add("Grand Total: ${CurrencyUtils.formatInr(currentPurchase.totalAmount)}")
                    add("Payment: ${currentPurchase.paymentMethod} · ${currentPurchase.paymentStatus}")
                }
                PdfGenerator.generateAndShare(
                    context = context,
                    fileName = "${currentPurchase.purchaseNumber.ifBlank { "purchase" }}.pdf",
                    title = currentPurchase.purchaseNumber,
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
            what = L("కొనుగోలు", "purchase"),
            onConfirm = { reason ->
                showDeleteConfirm = false
                viewModel.cancel(reason)
            },
            onDismiss = { showDeleteConfirm = false },
        )
    }
}
