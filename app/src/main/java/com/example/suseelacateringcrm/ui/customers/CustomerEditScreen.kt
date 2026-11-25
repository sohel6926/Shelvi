package com.example.suseelacateringcrm.ui.customers

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
fun CustomerEditScreen(
    customerId: String?,
    padding: PaddingValues,
    onDone: () -> Unit,
) {
    val viewModel: CustomerEditViewModel = viewModel(
        key = "customer-edit-$customerId",
        factory = viewModelFactory { initializer { CustomerEditViewModel(customerId) } },
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
            if (customerId == null) L("కొత్త customer", "New Customer") else L("Customer మార్చు", "Edit Customer"),
            style = MaterialTheme.typography.titleLarge,
        )
        AppTextField(value = viewModel.name, onValueChange = { viewModel.name = it }, label = L("పేరు", "Name"))
        AppTextField(value = viewModel.phone, onValueChange = { viewModel.phone = it }, label = L("ఫోన్", "Phone"), keyboardType = KeyboardType.Phone)
        AppTextField(value = viewModel.email, onValueChange = { viewModel.email = it }, label = L("ఇమెయిల్", "Email"), keyboardType = KeyboardType.Email)
        AppTextField(value = viewModel.address, onValueChange = { viewModel.address = it }, label = L("చిరునామా", "Address"), singleLine = false)
        AppTextField(value = viewModel.notes, onValueChange = { viewModel.notes = it }, label = L("గమనికలు", "Notes"), singleLine = false)
        // R10-8: WhatsApp consent — agents message only ticked customers.
        androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            androidx.compose.material3.Checkbox(checked = viewModel.whatsappOptIn, onCheckedChange = { viewModel.whatsappOptIn = it })
            Text(L("WhatsApp సందేశాలు పంపడానికి customer ఒప్పుకున్నారు", "Customer agreed to WhatsApp messages"))
        }
        if (viewModel.whatsappOptIn) com.example.suseelacateringcrm.ui.components.OptInStampLine(viewModel.optInAt, viewModel.optInBy)

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
