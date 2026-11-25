package com.example.suseelacateringcrm.ui.quotations

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
import com.example.suseelacateringcrm.data.model.Quotation
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.StatusChip
import com.example.suseelacateringcrm.ui.components.color
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@Composable
fun QuotationsListScreen(
    padding: PaddingValues,
    onOpenQuotation: (String) -> Unit,
    viewModel: QuotationsListViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        when (val s = state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> {
                if (s.data.isEmpty()) {
                    EmptyState(L("కొటేషన్లు లేవు. Booking నుంచి తయారు చేయండి.", "No quotations yet. Generate one from a booking."))
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp)) {
                        items(s.data, key = { it.id }) { quotation ->
                            QuotationRow(quotation = quotation, onClick = { onOpenQuotation(quotation.id) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuotationRow(quotation: Quotation, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(quotation.quotationNumber, style = MaterialTheme.typography.titleMedium)
            Text(DateUtils.formatDate(quotation.issueDate))
            Text(L("మొత్తం: ${CurrencyUtils.formatInr(quotation.totalAmount)} · గడువు: ${DateUtils.formatDate(quotation.validUntil)}", "Total: ${CurrencyUtils.formatInr(quotation.totalAmount)} · Valid until: ${DateUtils.formatDate(quotation.validUntil)}"))
            StatusChip(label = tr(quotation.quotationStatus.label), color = quotation.quotationStatus.color())
        }
    }
}
