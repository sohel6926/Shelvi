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
fun ItemPurchaseReportScreen(
    padding: PaddingValues,
    viewModel: ItemPurchaseReportViewModel = viewModel(),
) {
    val entries by viewModel.entries.collectAsStateWithLifecycle()

    if (entries.isEmpty()) {
        EmptyState(L("కొనుగోళ్లు ఇంకా లేవు.", "No purchases recorded yet."), modifier = Modifier.padding(padding).fillMaxSize())
        return
    }

    LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        items(entries, key = { "${it.description}-${it.unit}" }) { entry ->
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(entry.description, style = MaterialTheme.typography.titleMedium)
                    Text(L("మొత్తం కొన్నది: ${entry.totalQuantity} ${entry.unit}", "Total purchased: ${entry.totalQuantity} ${entry.unit}"))
                    Text(L("మొత్తం కొనుగోలు: ${CurrencyUtils.formatInr(entry.totalValue)}", "Total purchase value: ${CurrencyUtils.formatInr(entry.totalValue)}"))
                    Text(L("కొన్నవారు:", "Purchased by:"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                    entry.byStaff.forEach { staffRow ->
                        Text("• ${staffRow.staffName} — ${staffRow.quantity} ${entry.unit} (${CurrencyUtils.formatInr(staffRow.amount)})")
                    }
                }
            }
        }
    }
}
