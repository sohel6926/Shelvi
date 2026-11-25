package com.example.suseelacateringcrm.ui.purchases

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
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.L

@Composable
fun StaffPurchaseReportScreen(
    padding: PaddingValues,
    viewModel: StaffPurchaseReportViewModel = viewModel(),
) {
    val entries by viewModel.entries.collectAsStateWithLifecycle()

    if (entries.isEmpty()) {
        EmptyState(L("కొనుగోళ్లు ఇంకా లేవు.", "No purchases recorded yet."), modifier = Modifier.padding(padding).fillMaxSize())
        return
    }

    LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        items(entries, key = { it.staffName }) { entry ->
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(entry.staffName, style = MaterialTheme.typography.titleMedium)
                    Text(L("కొనుగోళ్లు: ${entry.purchaseCount}", "Total purchases: ${entry.purchaseCount}"))
                    Text(L("మొత్తం కొనుగోలు: ${CurrencyUtils.formatInr(entry.totalValue)}", "Total purchase value: ${CurrencyUtils.formatInr(entry.totalValue)}"))
                    Text(L("వస్తువులు:", "Items:"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                    entry.items.forEach { item ->
                        Text("• ${item.description} — ${item.quantity} ${item.unit} (${CurrencyUtils.formatInr(item.amount)})")
                    }
                }
            }
        }
    }
}
