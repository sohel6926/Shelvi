package com.example.suseelacateringcrm.ui.purchases

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.L

private data class PurchaseFolder(val label: String, val onClick: () -> Unit)

@Composable
fun PurchasesHomeScreen(
    padding: PaddingValues,
    onOpenKirana: () -> Unit,
    onOpenKayagoralu: () -> Unit,
    onOpenDisposables: () -> Unit,
    onOpenFruits: () -> Unit,
    onOpenNonVeg: () -> Unit,
    onOpenGasFuel: () -> Unit,
    onOpenWaterIce: () -> Unit,
    onOpenOtherItems: () -> Unit,
    onOpenOutsidePurchases: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenStaffReport: () -> Unit,
    onOpenItemReport: () -> Unit,
    viewModel: PurchasesHomeViewModel = viewModel(),
) {
    val summary by viewModel.summary.collectAsStateWithLifecycle()

    val folders = listOf(
        PurchaseFolder(L("కిరాణా", "Kirana"), onOpenKirana),
        PurchaseFolder(L("కాయగూరలు", "Vegetables"), onOpenKayagoralu),
        PurchaseFolder(L("డిస్పోజబుల్స్", "Disposables"), onOpenDisposables),
        PurchaseFolder(L("పండ్లు", "Fruits"), onOpenFruits),
        PurchaseFolder(L("మాంసాహారం", "Non-Veg"), onOpenNonVeg),
        PurchaseFolder(L("గ్యాస్ / ఇంధనం", "Gas / Fuel"), onOpenGasFuel),
        PurchaseFolder(L("నీళ్ళు / ఐస్", "Water / Ice"), onOpenWaterIce),
        PurchaseFolder(L("బయట కొనుగోళ్లు", "Outside Purchases"), onOpenOutsidePurchases),
        PurchaseFolder(L("ఇతర వస్తువులు", "Other Items"), onOpenOtherItems),
    )

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.padding(padding).fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(L("ఈ రోజు కొనుగోలు", "Today's Purchase"), style = MaterialTheme.typography.titleMedium)
                    if (com.example.suseelacateringcrm.di.ServiceLocator.isStaffLogin()) {
                        Text(
                            L("నా ఎంట్రీలు — మీరు నమోదు చేసినవి మాత్రమే", "My entries — only the ones you entered"),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Text(L("ఈ రోజు ఖర్చు: ${CurrencyUtils.formatInr(summary.todayTotal)} (${summary.todayCount} కొనుగోళ్లు)", "Today's total spend: ${CurrencyUtils.formatInr(summary.todayTotal)} (${summary.todayCount} purchases)"))
                    Text(L("ఈ నెల కొనుగోలు: ${CurrencyUtils.formatInr(summary.monthTotal)}", "This month's purchase: ${CurrencyUtils.formatInr(summary.monthTotal)}"))
                    Text(L("ఇవ్వాల్సినవి: ${CurrencyUtils.formatInr(summary.pendingPaymentsTotal)}", "Pending payments: ${CurrencyUtils.formatInr(summary.pendingPaymentsTotal)}"))
                }
            }
        }

        items(folders) { folder ->
            Card(onClick = folder.onClick, modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(folder.label, style = MaterialTheme.typography.titleSmall)
                }
            }
        }

        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            Column(modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = onOpenHistory, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(L("కొనుగోళ్ల చరిత్ర", "Purchase History"))
                }
                OutlinedButton(onClick = onOpenStaffReport, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(L("సిబ్బంది వారీ రిపోర్ట్", "Staff-wise Report"))
                }
                OutlinedButton(onClick = onOpenItemReport, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(L("వస్తువు వారీ రిపోర్ట్", "Item-wise Report"))
                }

                if (summary.staffWiseToday.isNotEmpty()) {
                    Text(
                        L("ఈ రోజు సిబ్బంది వారీగా", "Staff-wise today"),
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                    )
                    summary.staffWiseToday.forEach { (name, total) ->
                        Text("$name — ${CurrencyUtils.formatInr(total)}", modifier = Modifier.padding(vertical = 2.dp))
                    }
                }
            }
        }
    }
}
