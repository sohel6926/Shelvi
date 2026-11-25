package com.example.suseelacateringcrm.ui.purchases

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.PURCHASE_UNITS
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.RoleGate
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OtherItemsScreen(
    role: UserRole?,
    padding: PaddingValues,
    onItemSelected: (name: String, category: String, unit: String) -> Unit,
    viewModel: OtherItemsViewModel = viewModel(),
) {
    val items by viewModel.items.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var showAddDialog by remember { mutableStateOf(false) }

    LaunchedEffect(viewModel.addState) {
        if (viewModel.addState is UiState.Success) showAddDialog = false
    }

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text(L("ఇతర వస్తువులు వెతకండి...", "Search Other Items...")) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
            )

            val filtered = items.filter { query.isBlank() || it.name.contains(query, ignoreCase = true) }
            if (filtered.isEmpty()) {
                EmptyState(
                    if (items.isEmpty()) L("ఇతర వస్తువులు లేవు. Owner + తో జోడించవచ్చు.", "No other items yet. Admin can add one with +.") else "No items match \"$query\".",
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                    items(filtered, key = { it.id }) { item ->
                        Card(
                            onClick = { onItemSelected(item.name, item.category, item.unit) },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(item.name, style = MaterialTheme.typography.titleSmall)
                                Text(item.category, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }

        RoleGate(currentRole = role) {
            FloatingActionButton(
                onClick = { showAddDialog = true },
                modifier = Modifier.padding(24.dp).align(Alignment.BottomEnd),
            ) {
                Icon(Icons.Filled.Add, contentDescription = L("వస్తువు జోడించు", "Add item"))
            }
        }
    }

    if (showAddDialog) {
        var unitMenuExpanded by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { showAddDialog = false; viewModel.resetAddState() },
            title = { Text(L("కొత్త వస్తువు", "New Master Item")) },
            text = {
                Column {
                    OutlinedTextField(
                        value = viewModel.newItemName,
                        onValueChange = { viewModel.newItemName = it },
                        label = { Text(L("వస్తువు పేరు", "Item name")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    )
                    OutlinedTextField(
                        value = viewModel.newItemCategory,
                        onValueChange = { viewModel.newItemCategory = it },
                        label = { Text(L("రకం", "Category")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    )
                    ExposedDropdownMenuBox(expanded = unitMenuExpanded, onExpandedChange = { unitMenuExpanded = it }) {
                        OutlinedTextField(
                            value = viewModel.newItemUnit,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Unit") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = unitMenuExpanded) },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                        )
                        ExposedDropdownMenu(expanded = unitMenuExpanded, onDismissRequest = { unitMenuExpanded = false }) {
                            PURCHASE_UNITS.forEach { unit ->
                                DropdownMenuItem(text = { Text(tr(unit)) }, onClick = {
                                    viewModel.newItemUnit = unit
                                    unitMenuExpanded = false
                                })
                            }
                        }
                    }
                    OutlinedTextField(
                        value = viewModel.newItemSupplier,
                        onValueChange = { viewModel.newItemSupplier = it },
                        label = { Text(L("మామూలు supplier (ఐచ్ఛికం)", "Default supplier (optional)")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    )
                    OutlinedTextField(
                        value = viewModel.newItemNotes,
                        onValueChange = { viewModel.newItemNotes = it },
                        label = { Text(L("గమనికలు (ఐచ్ఛికం)", "Notes (optional)")) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    )
                    val addState = viewModel.addState
                    if (addState is UiState.Error) {
                        Text(addState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.addItem() }, enabled = viewModel.addState !is UiState.Loading) {
                    Text(L("జోడించు", "Add"))
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddDialog = false; viewModel.resetAddState() }) { Text(L("వద్దు", "Cancel")) }
            },
        )
    }
}
