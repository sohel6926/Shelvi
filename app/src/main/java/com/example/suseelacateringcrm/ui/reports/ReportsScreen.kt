package com.example.suseelacateringcrm.ui.reports

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
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun ReportsScreen(
    padding: PaddingValues,
    onOpenCashReport: () -> Unit = {},
    viewModel: ReportsViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        when (val s = state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> {
                val summary = s.data
                LazyColumn(contentPadding = PaddingValues(16.dp)) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(L("సారాంశం", "Overview"), style = MaterialTheme.typography.titleMedium)
                                Text(L("ఈ నెల bookings: ${summary.bookingsThisMonth}", "Bookings this month: ${summary.bookingsThisMonth}"))
                                Text(L("మొత్తం బాకీలు: ${CurrencyUtils.formatInr(summary.overallPendingDues)}", "Total pending dues (all time): ${CurrencyUtils.formatInr(summary.overallPendingDues)}"))
                            }
                        }
                        androidx.compose.material3.OutlinedButton(
                            onClick = onOpenCashReport,
                            modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                        ) {
                            Text(L("నగదు వసూలు — ఎవరు ఎంత తీసుకున్నారు", "Cash Collection Report — who collected how much"))
                        }
                        Text(
                            L("నెలవారీ బిల్లుల సారాంశం", "Monthly billing summary"),
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                    }
                    if (summary.months.isEmpty()) {
                        item { EmptyState(L("ఇన్వాయిస్‌లు లేవు — ఖరారైన booking నుంచి ఒకటి తయారు చేయండి.", "No invoices yet — generate one from a confirmed booking to see reports.")) }
                    }
                    items(summary.months, key = { it.monthKey }) { month ->
                        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(month.monthLabel, style = MaterialTheme.typography.titleSmall)
                                Text(L("బిల్లు చేసింది: ${CurrencyUtils.formatInr(month.invoicedTotal)} (${month.invoiceCount} ఇన్వాయిస్‌లు)", "Invoiced: ${CurrencyUtils.formatInr(month.invoicedTotal)} (${month.invoiceCount} invoices)"))
                                Text(L("వసూలైంది: ${CurrencyUtils.formatInr(month.collectedTotal)}", "Collected: ${CurrencyUtils.formatInr(month.collectedTotal)}"))
                                Text(L("బాకీ: ${CurrencyUtils.formatInr(month.pendingTotal)}", "Pending: ${CurrencyUtils.formatInr(month.pendingTotal)}"))
                            }
                        }
                    }
                }
            }
        }
    }
}
