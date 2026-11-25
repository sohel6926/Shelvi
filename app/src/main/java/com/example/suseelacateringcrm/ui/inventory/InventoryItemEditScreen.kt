package com.example.suseelacateringcrm.ui.inventory

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
fun InventoryItemEditScreen(
    itemId: String?,
    padding: PaddingValues,
    onDone: () -> Unit,
) {
    val viewModel: InventoryItemEditViewModel = viewModel(
        key = "inventory-item-edit-$itemId",
        factory = viewModelFactory { initializer { InventoryItemEditViewModel(itemId) } },
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
        Text(if (itemId == null) L("కొత్త stock వస్తువు", "New Inventory Item") else L("Stock వస్తువు మార్చు", "Edit Inventory Item"), style = MaterialTheme.typography.titleLarge)

        AppTextField(value = viewModel.name, onValueChange = { viewModel.name = it }, label = L("పేరు", "Name"))
        AppTextField(value = viewModel.unit, onValueChange = { viewModel.unit = it }, label = L("Unit (ఉదా: kg, లీటర్, pcs)", "Unit (e.g. kg, liter, pcs)"))
        AppTextField(value = viewModel.category, onValueChange = { viewModel.category = it }, label = L("రకం (ఐచ్ఛికం)", "Category (optional)"))
        AppTextField(
            value = viewModel.reorderLevelText,
            onValueChange = { viewModel.reorderLevelText = it },
            label = L("మళ్ళీ కొనాల్సిన స్థాయి", "Reorder level"),
            keyboardType = KeyboardType.Decimal,
        )

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
