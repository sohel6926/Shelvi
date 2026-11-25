package com.example.suseelacateringcrm.ui.billing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Invoice
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.StatusChip
import com.example.suseelacateringcrm.ui.components.color
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.data.model.displayLabel

@Composable
fun InvoicesListScreen(
    padding: PaddingValues,
    onOpenInvoice: (String) -> Unit,
    viewModel: InvoicesListViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        when (val s = state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> {
                if (s.data.isEmpty()) {
                    EmptyState(L("ఇన్వాయిస్‌లు లేవు. ఖరారైన booking నుంచి తయారు చేయండి.", "No invoices yet. Generate one from a confirmed booking."))
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp)) {
                        items(s.data, key = { it.id }) { invoice ->
                            InvoiceRow(invoice = invoice, onClick = { onOpenInvoice(invoice.id) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InvoiceRow(invoice: Invoice, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(invoice.invoiceNumber, style = MaterialTheme.typography.titleMedium)
            Text(DateUtils.formatDate(invoice.issueDate))
            Text(L("మొత్తం: ${CurrencyUtils.formatInr(invoice.totalAmount)} · బాకీ: ${CurrencyUtils.formatInr(invoice.balanceDue)}", "Total: ${CurrencyUtils.formatInr(invoice.totalAmount)} · Due: ${CurrencyUtils.formatInr(invoice.balanceDue)}"))
            StatusChip(label = invoice.invoiceStatus.displayLabel(), color = invoice.invoiceStatus.color())
        }
    }
}
