package com.example.suseelacateringcrm.ui.staff

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.data.model.PayType
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StaffEditScreen(
    staffId: String?,
    padding: PaddingValues,
    onDone: () -> Unit,
) {
    val viewModel: StaffEditViewModel = viewModel(
        key = "staff-edit-$staffId",
        factory = viewModelFactory { initializer { StaffEditViewModel(staffId) } },
    )

    LaunchedEffect(viewModel.saveState) {
        if (viewModel.saveState is UiState.Success) onDone()
    }

    if (viewModel.loading) {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    val users by viewModel.users.collectAsStateWithLifecycle()
    var userMenuExpanded by remember { mutableStateOf(false) }
    val selectedUser = users.find { it.uid == viewModel.linkedUserId }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(if (staffId == null) L("కొత్త సిబ్బంది", "New Staff") else L("సిబ్బంది మార్చు", "Edit Staff"), style = MaterialTheme.typography.titleLarge)

        AppTextField(value = viewModel.name, onValueChange = { viewModel.name = it }, label = L("పేరు", "Name"))
        AppTextField(value = viewModel.phone, onValueChange = { viewModel.phone = it }, label = L("ఫోన్", "Phone"), keyboardType = KeyboardType.Phone)
        AppTextField(value = viewModel.jobRole, onValueChange = { viewModel.jobRole = it }, label = L("పని (ఉదా: వంట, సర్వర్)", "Job role (e.g. Cook, Server)"))
        Text(L("జీతం రకం", "Pay type"), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
        Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            PayType.entries.forEach { type ->
                FilterChip(
                    selected = viewModel.payType == type.code,
                    onClick = { viewModel.payType = type.code },
                    label = { Text(type.label) },
                )
            }
        }
        if (viewModel.payType == PayType.MONTHLY.code) {
            AppTextField(
                value = viewModel.monthlySalaryText,
                onValueChange = { viewModel.monthlySalaryText = it },
                label = L("నెల జీతం (₹)", "Monthly salary (₹)"),
                keyboardType = KeyboardType.Decimal,
            )
        } else {
            AppTextField(
                value = viewModel.dailyWageText,
                onValueChange = { viewModel.dailyWageText = it },
                label = L("రోజు కూలి (₹)", "Daily wage (₹)"),
                keyboardType = KeyboardType.Decimal,
            )
        }
        AppTextField(
            value = viewModel.emergencyPhone,
            onValueChange = { viewModel.emergencyPhone = it },
            label = L("అత్యవసర ఫోన్ (ఐచ్ఛికం)", "Emergency phone (optional)"),
            keyboardType = KeyboardType.Phone,
        )
        AppDatePickerField(label = L("చేరిన తేదీ", "Joined date"), date = viewModel.joinedDate, onDateSelected = { viewModel.joinedDate = it })

        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(L("పని చేస్తున్నారు", "Active"), modifier = Modifier.weight(1f))
            Switch(checked = viewModel.active, onCheckedChange = { viewModel.active = it })
        }

        ExposedDropdownMenuBox(expanded = userMenuExpanded, onExpandedChange = { userMenuExpanded = it }) {
            OutlinedTextField(
                value = selectedUser?.let { "${it.name} (${it.email})" } ?: L("ఏదీ లేదు", "None"),
                onValueChange = {},
                readOnly = true,
                label = { Text(L("App login లింక్ (ఐచ్ఛికం)", "Linked app login (optional)")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = userMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = userMenuExpanded, onDismissRequest = { userMenuExpanded = false }) {
                DropdownMenuItem(text = { Text(L("ఏదీ లేదు", "None")) }, onClick = {
                    viewModel.linkedUserId = ""
                    userMenuExpanded = false
                })
                users.forEach { user ->
                    DropdownMenuItem(text = { Text("${user.name} (${user.email})") }, onClick = {
                        viewModel.linkedUserId = user.uid
                        userMenuExpanded = false
                    })
                }
            }
        }

        val saveState = viewModel.saveState
        if (saveState is UiState.Error) {
            Text(saveState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }

        Button(
            onClick = { viewModel.save() },
            modifier = Modifier.padding(top = 16.dp),
            enabled = saveState !is UiState.Loading,
        ) {
            Text(L("సేవ్ చేయి", "Save"))
        }
        // R10-1 / R10-2: advances with balance, and the monthly rating average.
        if (staffId != null) {
            com.example.suseelacateringcrm.ui.staffops.StaffAdvancesCard(staffId)
            com.example.suseelacateringcrm.ui.staffops.StaffRatingCard(staffId)
        }
    }
}
