package com.example.suseelacateringcrm.ui.expenses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.EXPENSE_PAYMENT_STATUSES
import com.example.suseelacateringcrm.data.model.ExpenseSections
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpenseHistoryScreen(
    padding: PaddingValues,
    initialSection: String? = null,
    onOpenExpense: (String) -> Unit,
    onAddExpense: () -> Unit,
) {
    val viewModel: ExpenseHistoryViewModel = viewModel(
        key = "expense-history-${initialSection ?: "all"}",
        factory = viewModelFactory { initializer { ExpenseHistoryViewModel(initialSection) } },
    )
    val filtered by viewModel.filtered.collectAsStateWithLifecycle()
    val personOptions by viewModel.personOptions.collectAsStateWithLifecycle()
    var sectionMenuExpanded by remember { mutableStateOf(false) }
    var personMenuExpanded by remember { mutableStateOf(false) }
    var statusMenuExpanded by remember { mutableStateOf(false) }

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
    Column(modifier = Modifier.fillMaxSize()) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(ExpenseDateFilter.entries.toList()) { filter ->
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
            label = { Text(L("వస్తువు, వ్యక్తి, విభాగం వెతకండి", "Search item, person, or section")) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )

        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ExposedDropdownMenuBox(
                expanded = sectionMenuExpanded,
                onExpandedChange = { sectionMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = viewModel.sectionFilter,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("విభాగం", "Section")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = sectionMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = sectionMenuExpanded, onDismissRequest = { sectionMenuExpanded = false }) {
                    (listOf("All") + ExpenseSections.all).forEach { section ->
                        DropdownMenuItem(text = { Text(tr(section)) }, onClick = {
                            viewModel.onSectionFilterSelected(section)
                            sectionMenuExpanded = false
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
                    value = viewModel.statusFilter,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("చెల్లింపు స్థితి", "Payment status")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = statusMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = statusMenuExpanded, onDismissRequest = { statusMenuExpanded = false }) {
                    (listOf("All") + EXPENSE_PAYMENT_STATUSES).forEach { status ->
                        DropdownMenuItem(text = { Text(tr(status)) }, onClick = {
                            viewModel.onStatusFilterSelected(status)
                            statusMenuExpanded = false
                        })
                    }
                }
            }
        }

        ExposedDropdownMenuBox(expanded = personMenuExpanded, onExpandedChange = { personMenuExpanded = it }) {
            OutlinedTextField(
                value = viewModel.personFilter,
                onValueChange = {},
                readOnly = true,
                label = { Text(L("వ్యక్తి", "Person")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = personMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = personMenuExpanded, onDismissRequest = { personMenuExpanded = false }) {
                personOptions.forEach { person ->
                    DropdownMenuItem(text = { Text(person) }, onClick = {
                        viewModel.onPersonFilterSelected(person)
                        personMenuExpanded = false
                    })
                }
            }
        }

        com.example.suseelacateringcrm.ui.components.ShowCancelledToggle(viewModel.showCancelled, viewModel::onShowCancelledChanged)
        if (filtered.isEmpty()) {
            EmptyState(L("ఈ ఎంపికలకు ఖర్చులు లేవు.", "No expenses match these filters."), modifier = Modifier.padding(top = 16.dp))
        } else {
            LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
                items(filtered, key = { it.id }) { expense ->
                    Card(
                        onClick = { onOpenExpense(expense.id) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(
                                "${expense.section}${if (expense.subCategory.isNotBlank()) " · ${expense.subCategory}" else ""}" +
                                    if (expense.status.equals("Cancelled", ignoreCase = true)) L(" · రద్దు", " · cancelled") else "",
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Text("${DateUtils.formatDate(expense.serviceDate)} · ${expense.personName.ifBlank { "-" }}")
                            Text(L("${CurrencyUtils.formatInr(expense.totalAmount)} · ${expense.paymentStatus} · బాకీ: ${CurrencyUtils.formatInr(expense.balanceAmount)}", "${CurrencyUtils.formatInr(expense.totalAmount)} · ${expense.paymentStatus} · Balance: ${CurrencyUtils.formatInr(expense.balanceAmount)}"))
                        }
                    }
                }
            }
        }
    }

        FloatingActionButton(
            onClick = onAddExpense,
            modifier = Modifier.padding(24.dp).align(Alignment.BottomEnd),
        ) {
            Icon(Icons.Filled.Add, contentDescription = L("కొత్త ఖర్చు", "Add expense"))
        }
    }
}
