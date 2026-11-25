package com.example.suseelacateringcrm.ui.users

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.model.JobRoles
import com.example.suseelacateringcrm.data.model.UserProfile
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.model.toFirestore
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.util.L

@Composable
fun UserManagementScreen(
    padding: PaddingValues,
    viewModel: UserManagementViewModel = viewModel(),
) {
    val users by viewModel.users.collectAsStateWithLifecycle()
    val branches by viewModel.branches.collectAsStateWithLifecycle()

    if (users.isEmpty()) {
        EmptyState(L("ఇంకా users లేరు.", "No registered users yet."), modifier = Modifier.padding(padding).fillMaxSize())
        return
    }

    LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
        items(users, key = { it.uid }) { user ->
            UserRow(
                user = user,
                branches = branches,
                onSetRole = { role -> viewModel.setRole(user.uid, role.toFirestore()) },
                onSetJobRole = { code -> viewModel.setJobRole(user.uid, code) },
                onSetActive = { active -> viewModel.setActive(user.uid, active) },
                onSetBranch = { branchId -> viewModel.setBranch(user.uid, branchId) },
            )
        }
    }
}

@Composable
private fun UserRow(
    user: UserProfile,
    branches: List<Branch>,
    onSetRole: (UserRole) -> Unit,
    onSetJobRole: (String) -> Unit,
    onSetActive: (Boolean) -> Unit,
    onSetBranch: (String) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(user.name.ifBlank { user.email }, style = MaterialTheme.typography.titleMedium)
            Text(user.email, style = MaterialTheme.typography.bodySmall)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = user.userRole == UserRole.STAFF,
                    onClick = { onSetRole(UserRole.STAFF) },
                    label = { Text(L("సిబ్బంది", "Staff")) },
                )
                FilterChip(
                    selected = user.userRole == UserRole.MANAGER,
                    onClick = { onSetRole(UserRole.MANAGER) },
                    label = { Text(com.example.suseelacateringcrm.util.L("మేనేజర్", "Manager")) },
                )
                FilterChip(
                    selected = user.userRole == UserRole.ADMIN,
                    onClick = { onSetRole(UserRole.ADMIN) },
                    label = { Text(L("Owner (Admin)", "Admin")) },
                )
            }

            // Business role (what work this person does). Only narrows the menu; the owner role is not handed out.
            if (user.userRole != UserRole.ADMIN) {
                val level = user.userRole.toFirestore()
                val roles = JobRoles.ALL.filter { it.level == level && it.code != "owner" }
                Text(L("పని పాత్ర", "Job role"), style = MaterialTheme.typography.labelMedium)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterChip(
                            selected = roles.none { it.code == user.jobRole },
                            onClick = { onSetJobRole("") },
                            label = { Text(L("ఇవ్వలేదు", "Not given")) },
                        )
                    }
                    items(roles, key = { it.code }) { r ->
                        FilterChip(
                            selected = user.jobRole == r.code,
                            onClick = { onSetJobRole(r.code) },
                            label = { Text(L(r.te, r.en)) },
                        )
                    }
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(L("పని చేస్తున్నారు", "Active"), modifier = Modifier.padding(end = 8.dp))
                Switch(checked = user.active, onCheckedChange = onSetActive)
            }

            // Staff and managers are locked to one branch (security rules), so both need one.
            if (user.userRole != UserRole.ADMIN) {
                Text("Branch", style = MaterialTheme.typography.labelMedium)
                if (branches.isEmpty()) {
                    Text(L("ఇంకా branches లేవు", "No branches set up yet"), style = MaterialTheme.typography.bodySmall)
                } else {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(branches, key = { it.id }) { branch ->
                            FilterChip(
                                selected = user.branchId == branch.id,
                                onClick = { onSetBranch(branch.id) },
                                label = { Text(branch.name) },
                            )
                        }
                    }
                }
            }
        }
    }
}
