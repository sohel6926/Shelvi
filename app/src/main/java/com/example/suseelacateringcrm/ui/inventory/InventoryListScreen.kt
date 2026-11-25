package com.example.suseelacateringcrm.ui.inventory

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.RoleGate
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun InventoryListScreen(
    role: UserRole?,
    padding: PaddingValues,
    onAddItem: () -> Unit,
    onEditItem: (String) -> Unit,
    viewModel: InventoryListViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var adjustingItem by remember { mutableStateOf<InventoryItem?>(null) }
    var pendingDelete by remember { mutableStateOf<InventoryItem?>(null) }
    var showApprovals by remember { mutableStateOf(false) }
    val branchId by com.example.suseelacateringcrm.di.ServiceLocator.branchManager.currentBranchId.collectAsStateWithLifecycle()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
      androidx.compose.foundation.layout.Column(Modifier.fillMaxSize()) {
        viewModel.adjustMessage?.let { (text, isError) ->
            com.example.suseelacateringcrm.ui.components.NoticeBox(
                text,
                if (isError) com.example.suseelacateringcrm.ui.components.Tone.BAD else com.example.suseelacateringcrm.ui.components.Tone.GOOD,
                Modifier.padding(horizontal = 16.dp),
            )
        }
        when (val s = state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> {
                com.example.suseelacateringcrm.ui.components.ShowCancelledToggle(viewModel.showArchived, { viewModel.showArchived = it })
                if (role == UserRole.ADMIN || role == UserRole.MANAGER) {
                    OutlinedButton(onClick = { showApprovals = true }, modifier = Modifier.padding(horizontal = 16.dp)) {
                        Text(L("ఆమోదం కోసం ఆగినవి", "Waiting for approval"))
                    }
                }
                val shown = s.data.filter { viewModel.showArchived || !it.archived }
                if (shown.isEmpty()) {
                    EmptyState(L("Stock వస్తువులు లేవు.", "No inventory items yet."))
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp)) {
                        items(shown, key = { it.id }) { item ->
                            InventoryRow(
                                item = item,
                                isAdmin = role == UserRole.ADMIN,
                                onAdjust = { adjustingItem = item },
                                onEdit = { onEditItem(item.id) },
                                onDelete = { pendingDelete = item },
                            )
                        }
                    }
                }
            }
        }
      }

        RoleGate(currentRole = role) {
            FloatingActionButton(
                onClick = onAddItem,
                modifier = Modifier.padding(24.dp).align(Alignment.BottomEnd),
            ) {
                Icon(Icons.Filled.Add, contentDescription = L("కొత్త stock వస్తువు", "Add inventory item"))
            }
        }
    }

    adjustingItem?.let { item ->
        StockAdjustmentDialog(
            item = item,
            onConfirm = { type, quantity, reason, note, expiryDay, batchNo ->
                viewModel.adjustStock(item.id, type, quantity, reason, note, expiryDay, batchNo)
                adjustingItem = null
            },
            onDismiss = { adjustingItem = null },
        )
    }

    if (showApprovals) StockApprovalDialog(role = role, branchId = branchId, onDismiss = { showApprovals = false })

    pendingDelete?.let { item ->
        com.example.suseelacateringcrm.ui.components.CancelRecordDialog(
            what = item.name,
            archive = true,
            onConfirm = { reason ->
                viewModel.archiveItem(item.id, reason)
                pendingDelete = null
            },
            onDismiss = { pendingDelete = null },
        )
    }
}

@Composable
private fun InventoryRow(
    item: InventoryItem,
    isAdmin: Boolean,
    onAdjust: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(item.name + if (item.archived) L(" (పక్కన పెట్టారు)", " (archived)") else "", style = MaterialTheme.typography.titleMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(L("stock లో ${item.quantityInStock} ${item.unit}", "${item.quantityInStock} ${item.unit} in stock"))
                    if (item.isLowStock) {
                        Icon(Icons.Filled.Warning, contentDescription = L("తక్కువ stock", "Low stock"), tint = Color(0xFFC62828), modifier = Modifier.padding(start = 6.dp))
                    }
                }
                // Module 2g / X7: what is promised to events and what is past its date.
                if (item.reservedQty > 0 || item.expiredQty > 0) {
                    Text(
                        listOfNotNull(
                            if (item.reservedQty > 0) L("ఈవెంట్లకు ఉంచినది ${item.reservedQty}", "reserved ${item.reservedQty}") else null,
                            if (item.expiredQty > 0) L("గడువు దాటినది ${item.expiredQty} (లెక్కలో లేదు)", "expired ${item.expiredQty} (not counted)") else null,
                            L("వాడుకోదగ్గది ${item.freeQty} ${item.unit}", "free ${item.freeQty} ${item.unit}"),
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                // Module 2d: nearest expiry date (red = past, amber = within 7 days).
                if (item.nearestExpiry.isNotBlank()) {
                    val days = com.example.suseelacateringcrm.data.model.LeadScoring.daysUntil(item.nearestExpiry, com.example.suseelacateringcrm.util.DayKey.today())
                    val shown = com.example.suseelacateringcrm.util.DayKey.display(item.nearestExpiry)
                    com.example.suseelacateringcrm.ui.components.Pill(
                        if (days != null && days < 0) L("గడువు దాటింది: $shown", "Expired: $shown") else L("గడువు: $shown", "Expires: $shown"),
                        when {
                            days != null && days < 0 -> com.example.suseelacateringcrm.ui.components.Tone.BAD
                            days != null && days <= 7 -> com.example.suseelacateringcrm.ui.components.Tone.WARNING
                            else -> com.example.suseelacateringcrm.ui.components.Tone.INFO
                        },
                    )
                }
                Row {
                    OutlinedButton(onClick = onAdjust, modifier = Modifier.padding(top = 4.dp)) {
                        Text(L("Stock మార్చు", "Adjust Stock"))
                    }
                    if (item.trackExpiry) {
                        var showBatches by remember { mutableStateOf(false) }
                        OutlinedButton(onClick = { showBatches = true }, modifier = Modifier.padding(top = 4.dp, start = 8.dp)) {
                            Text(L("బ్యాచ్‌లు", "Batches"))
                        }
                        if (showBatches) BatchesDialog(item) { showBatches = false }
                    }
                }
            }
            if (isAdmin) {
                Row {
                    IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = L("మార్చు", "Edit")) }
                    if (!item.archived) IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = L("పక్కన పెట్టు", "Archive")) }
                }
            }
        }
    }
}

/** Module 2d: batches of one item, earliest expiry first — that one is used first. */
@Composable
private fun BatchesDialog(item: InventoryItem, onDismiss: () -> Unit) {
    val flow = remember(item.id) { com.example.suseelacateringcrm.di.ServiceLocator.inventoryRepository.batchesFlow(item.id) }
    val batches by androidx.compose.runtime.produceState(initialValue = emptyList<com.example.suseelacateringcrm.data.model.StockBatch>(), flow) {
        try {
            flow.collect { value = it }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
        }
    }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("బ్యాచ్‌లు: ${item.name}", "Batches: ${item.name}")) },
        text = {
            Column {
                Text(L("ముందు గడువు ఉన్నది ముందు వాడతారు.", "The earliest expiry is used first."), style = MaterialTheme.typography.bodySmall)
                if (batches.isEmpty()) Text(L("బ్యాచ్‌లు లేవు.", "No batches."))
                batches.forEach { b ->
                    Text(
                        "${b.qty} ${item.unit} · " +
                            (if (b.expiryDay.isBlank()) L("తేదీ లేదు", "no date") else com.example.suseelacateringcrm.util.DayKey.display(b.expiryDay)) +
                            (if (b.batchNo.isBlank()) "" else " · ${b.batchNo}"),
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        },
        confirmButton = { androidx.compose.material3.TextButton(onClick = onDismiss) { Text(L("సరే", "OK")) } },
    )
}
