package com.example.suseelacateringcrm.ui.expenses

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
fun PersonWiseReportScreen(
    padding: PaddingValues,
    viewModel: PersonWiseReportViewModel = viewModel(),
) {
    val entries by viewModel.entries.collectAsStateWithLifecycle()

    if (entries.isEmpty()) {
        EmptyState(L("వ్యక్తి/supplier పేరుతో ఖర్చులు ఇంకా లేవు.", "No expense transactions with a person/supplier name yet."), modifier = Modifier.padding(padding).fillMaxSize())
        return
    }

    LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        items(entries, key = { it.personName }) { entry ->
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(entry.personName, style = MaterialTheme.typography.titleMedium)
                    if (entry.mobileNumber.isNotBlank()) Text(L("మొబైల్: ${entry.mobileNumber}", "Mobile: ${entry.mobileNumber}"))
                    Text(L("లావాదేవీలు: ${entry.transactionCount}", "Total transactions: ${entry.transactionCount}"))
                    Text(L("మొత్తం: ${CurrencyUtils.formatInr(entry.totalAmount)}", "Total amount: ${CurrencyUtils.formatInr(entry.totalAmount)}"))
                    Text(L("ఇచ్చింది: ${CurrencyUtils.formatInr(entry.totalAdvance)}", "Total advance/paid: ${CurrencyUtils.formatInr(entry.totalAdvance)}"))
                    Text(L("మొత్తం బాకీ: ${CurrencyUtils.formatInr(entry.totalPending)}", "Total pending: ${CurrencyUtils.formatInr(entry.totalPending)}"))
                    Text(L("చరిత్ర:", "History:"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                    entry.transactions.forEach { tx ->
                        Text("• ${tx.date} · ${tx.section}${if (tx.subCategory.isNotBlank()) " (${tx.subCategory})" else ""} — ${CurrencyUtils.formatInr(tx.amount)}")
                    }
                }
            }
        }
    }
}
