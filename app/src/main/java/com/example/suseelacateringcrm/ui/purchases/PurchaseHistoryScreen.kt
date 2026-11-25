package com.example.suseelacateringcrm.ui.purchases

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
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.PAYMENT_STATUSES
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PurchaseHistoryScreen(
    padding: PaddingValues,
    onOpenPurchase: (String) -> Unit,
    viewModel: PurchaseHistoryViewModel = viewModel(),
) {
    val filtered by viewModel.filtered.collectAsStateWithLifecycle()
    val staffOptions by viewModel.staffOptions.collectAsStateWithLifecycle()
    var staffMenuExpanded by remember { mutableStateOf(false) }
    var statusMenuExpanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.padding(padding).fillMaxSize()) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(DateFilter.entries.toList()) { filter ->
                FilterChip(
                    selected = viewModel.dateFilter == filter,
                    onClick = { viewModel.onDateFilterSelected(filter) },
                    label = { Text(tr(filter.label)) },
                )
            }
        }

        if (com.example.suseelacateringcrm.di.ServiceLocator.isStaffLogin()) {
            Text(
                L("నా ఎంట్రీలు — మీరు నమోదు చేసినవి మాత్రమే", "My entries — only the ones you entered"),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        OutlinedTextField(
            value = viewModel.searchQuery,
            onValueChange = { viewModel.onSearchQueryChanged(it) },
            label = { Text(L("వస్తువు లేదా vendor వెతకండి", "Search item or vendor")) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )

        androidx.compose.foundation.layout.Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ExposedDropdownMenuBox(
                expanded = staffMenuExpanded,
                onExpandedChange = { staffMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = viewModel.staffFilter,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("సిబ్బంది", "Staff")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = staffMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = staffMenuExpanded, onDismissRequest = { staffMenuExpanded = false }) {
                    staffOptions.forEach { staff ->
                        DropdownMenuItem(text = { Text(staff) }, onClick = {
                            viewModel.onStaffFilterSelected(staff)
                            staffMenuExpanded = false
                        })
                    }
                }
            }
            ExposedDropdownMenuBox(
                expanded = statusMenuExpanded,
                onExpandedChange = { statusMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = viewModel.paymentStatusFilter,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("చెల్లింపు స్థితి", "Payment status")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = statusMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = statusMenuExpanded, onDismissRequest = { statusMenuExpanded = false }) {
                    (listOf("All") + PAYMENT_STATUSES).forEach { status ->
                        DropdownMenuItem(text = { Text(tr(status)) }, onClick = {
                            viewModel.onPaymentStatusFilterSelected(status)
                            statusMenuExpanded = false
                        })
                    }
                }
            }
        }

        com.example.suseelacateringcrm.ui.components.ShowCancelledToggle(viewModel.showCancelled, viewModel::onShowCancelledChanged)
        if (filtered.isEmpty()) {
            EmptyState(L("ఈ ఎంపికలకు కొనుగోళ్లు లేవు.", "No purchases match these filters."))
        } else {
            LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                items(filtered, key = { it.id }) { purchase ->
                    Card(
                        onClick = { onOpenPurchase(purchase.id) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                purchase.vendorNameSnapshot.ifBlank { L("తెలియని vendor", "Unknown vendor") } +
                                    if (purchase.status.equals("Cancelled", ignoreCase = true)) L(" · రద్దు", " · cancelled") else "",
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Text("${DateUtils.formatDate(purchase.purchaseDate)} · ${purchase.staffName}")
                            Text(L("${purchase.items.size} వస్తువులు · ${CurrencyUtils.formatInr(purchase.totalAmount)} · ${purchase.paymentStatus}", "${purchase.items.size} items · ${CurrencyUtils.formatInr(purchase.totalAmount)} · ${purchase.paymentStatus}"))
                        }
                    }
                }
            }
        }
    }
}
