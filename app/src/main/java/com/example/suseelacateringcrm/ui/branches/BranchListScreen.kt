package com.example.suseelacateringcrm.ui.branches

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
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
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
import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.RoleGate
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun BranchListScreen(
    role: UserRole?,
    padding: PaddingValues,
    onAddBranch: () -> Unit,
    onEditBranch: (String) -> Unit,
    viewModel: BranchListViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showBackfillPicker by remember { mutableStateOf(false) }

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        when (val s = state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> {
                if (s.data.isEmpty()) {
                    EmptyState(L("Branches లేవు. + నొక్కి జోడించండి.", "No branches yet. Tap + to add one."))
                } else {
                    Column {
                        RoleGate(currentRole = role) {
                            OutlinedButton(
                                onClick = { showBackfillPicker = true },
                                modifier = Modifier.padding(16.dp),
                            ) {
                                Text(L("పాత data కి branch పెట్టు", "Backfill existing data"))
                            }
                        }
                        LazyColumn(contentPadding = PaddingValues(16.dp)) {
                            items(s.data, key = { it.id }) { branch ->
                                BranchRow(
                                    branch = branch,
                                    onClick = { onEditBranch(branch.id) },
                                    onSetActive = { active -> viewModel.setActive(branch.id, active) },
                                )
                            }
                        }
                    }

                    if (showBackfillPicker) {
                        BackfillPickDialog(
                            branches = s.data,
                            onConfirm = { branchId ->
                                showBackfillPicker = false
                                viewModel.backfill(branchId)
                            },
                            onDismiss = { showBackfillPicker = false },
                        )
                    }

                    val backfillState = viewModel.backfillState
                    if (backfillState is UiState.Success) {
                        BackfillResultDialog(result = backfillState.data, onDismiss = { viewModel.clearBackfillState() })
                    } else if (backfillState is UiState.Error) {
                        ErrorBanner(backfillState.message)
                    }
                }
            }
        }

        RoleGate(currentRole = role) {
            FloatingActionButton(
                onClick = onAddBranch,
                modifier = Modifier.padding(24.dp).align(Alignment.BottomEnd),
            ) {
                Icon(Icons.Filled.Add, contentDescription = L("కొత్త branch", "Add branch"))
            }
        }
    }
}

@Composable
private fun BranchRow(branch: Branch, onClick: () -> Unit, onSetActive: (Boolean) -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(branch.name, style = MaterialTheme.typography.titleMedium)
            if (branch.address.isNotBlank()) Text(branch.address, style = MaterialTheme.typography.bodyMedium)
            if (branch.phone.isNotBlank()) Text(branch.phone, style = MaterialTheme.typography.bodyMedium)

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(L("పని చేస్తున్నారు", "Active"), modifier = Modifier.padding(end = 8.dp))
                Switch(checked = branch.active, onCheckedChange = onSetActive)
            }
        }
    }
}
