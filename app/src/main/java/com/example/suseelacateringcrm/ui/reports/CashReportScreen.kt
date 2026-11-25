package com.example.suseelacateringcrm.ui.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

private val DATE_FILTERS = listOf("All", "Today", "Yesterday", "This Week", "This Month")

@Composable
fun CashReportScreen(
    padding: PaddingValues,
    viewModel: CashReportViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 12.dp)) {
                items(DATE_FILTERS) { filter ->
                    FilterChip(
                        selected = viewModel.dateFilter == filter,
                        onClick = { viewModel.onDateFilterSelected(filter) },
                        label = { Text(tr(filter)) },
                    )
                }
            }
            Card(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(L("నగదు వసూలు సారాంశం", "Cash Collection Overview"), style = MaterialTheme.typography.titleMedium)
                    Text(L("మొత్తం వసూలు: ${CurrencyUtils.formatInr(state.totalCollected)}", "Total collected: ${CurrencyUtils.formatInr(state.totalCollected)}"))
                    Text(L("నగదు: ${CurrencyUtils.formatInr(state.totalCash)}", "Cash: ${CurrencyUtils.formatInr(state.totalCash)}"))
                    Text(L("ఇతర (UPI/కార్డ్/బ్యాంక్): ${CurrencyUtils.formatInr(state.totalNonCash)}", "Other methods (UPI/Card/Bank): ${CurrencyUtils.formatInr(state.totalNonCash)}"))
                }
            }
            Text(
                L("సిబ్బంది వారీ వసూలు", "Staff-wise collection"),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
        if (state.staffBreakdown.isEmpty()) {
            item { EmptyState(L("ఈ కాలంలో చెల్లింపులు లేవు.", "No payments recorded for this period.")) }
        }
        items(state.staffBreakdown, key = { it.staffName }) { entry ->
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(entry.staffName, style = MaterialTheme.typography.titleSmall)
                    Text(L("మొత్తం వసూలు: ${CurrencyUtils.formatInr(entry.totalAmount)}", "Total collected: ${CurrencyUtils.formatInr(entry.totalAmount)}"))
                    Text(L("నగదు: ${CurrencyUtils.formatInr(entry.cashAmount)}", "Cash collected: ${CurrencyUtils.formatInr(entry.cashAmount)}"))
                    Text(L("లావాదేవీలు: ${entry.transactionCount}", "Transactions: ${entry.transactionCount}"))
                }
            }
        }
        if (state.recentPayments.isNotEmpty()) {
            item {
                Text(
                    L("ఇటీవలి చెల్లింపులు", "Recent payments"),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 12.dp, bottom = 8.dp),
                )
            }
            items(state.recentPayments, key = { it.id }) { payment ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(CashReportViewModel.formatPaymentLine(payment), style = MaterialTheme.typography.bodyMedium)
                        Text("${CurrencyUtils.formatInr(payment.amount)} · ${payment.method}${if (payment.recordedByName.isNotBlank()) " · by ${payment.recordedByName}" else ""}")
                    }
                }
            }
        }
    }
}
