package com.example.suseelacateringcrm.ui.menu

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import com.example.suseelacateringcrm.data.model.MenuItem
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.RoleGate
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun MenuListScreen(
    role: UserRole?,
    padding: PaddingValues,
    onAddItem: () -> Unit,
    onEditItem: (String) -> Unit,
    viewModel: MenuListViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var pendingDelete by remember { mutableStateOf<MenuItem?>(null) }

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        when (val s = state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> androidx.compose.foundation.layout.Column {
                com.example.suseelacateringcrm.ui.components.ShowCancelledToggle(viewModel.showArchived, { viewModel.showArchived = it })
                val shown = s.data.filter { viewModel.showArchived || !it.archived }
                if (shown.isEmpty()) {
                    EmptyState(L("వంటకాలు లేవు.", "No menu items yet."))
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp)) {
                        items(shown, key = { it.id }) { item ->
                            MenuItemRow(
                                item = item,
                                isAdmin = role == UserRole.ADMIN,
                                onEdit = { onEditItem(item.id) },
                                onDelete = { pendingDelete = item },
                            )
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
                Icon(Icons.Filled.Add, contentDescription = L("కొత్త వంటకం", "Add menu item"))
            }
        }
    }

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
private fun MenuItemRow(
    item: MenuItem,
    isAdmin: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            androidx.compose.foundation.layout.Column {
                Text(item.name + if (item.archived) L(" (పక్కన పెట్టారు)", " (archived)") else "", style = MaterialTheme.typography.titleMedium)
                Text(item.menuCategory.label, style = MaterialTheme.typography.bodySmall)
                Text(CurrencyUtils.formatInr(item.pricePerPlate) + " / plate")
                if (!item.isActive) {
                    Text(L("పని మానేశారు", "Inactive"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
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
