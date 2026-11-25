package com.example.suseelacateringcrm.ui.branches

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun BranchEditScreen(
    branchId: String?,
    padding: PaddingValues,
    onDone: () -> Unit,
) {
    val viewModel: BranchEditViewModel = viewModel(
        key = "branch-edit-$branchId",
        factory = viewModelFactory { initializer { BranchEditViewModel(branchId) } },
    )

    LaunchedEffect(viewModel.saveState) {
        if (viewModel.saveState is UiState.Success) onDone()
    }

    if (viewModel.loading) {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(
            if (branchId == null) L("కొత్త branch", "New Branch") else L("Branch మార్చు", "Edit Branch"),
            style = MaterialTheme.typography.titleLarge,
        )
        AppTextField(value = viewModel.name, onValueChange = { viewModel.name = it }, label = L("పేరు", "Name"))
        AppTextField(value = viewModel.address, onValueChange = { viewModel.address = it }, label = L("చిరునామా", "Address"), singleLine = false)
        AppTextField(value = viewModel.phone, onValueChange = { viewModel.phone = it }, label = L("ఫోన్", "Phone"), keyboardType = KeyboardType.Phone)

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
    }
}
