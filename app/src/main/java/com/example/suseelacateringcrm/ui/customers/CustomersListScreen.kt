package com.example.suseelacateringcrm.ui.customers

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Customer
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun CustomersListScreen(
    padding: PaddingValues,
    onAddCustomer: () -> Unit,
    onOpenCustomer: (String) -> Unit,
    viewModel: CustomersListViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Box(modifier = Modifier.padding(padding).fillMaxSize()) {
        when (val s = state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> ErrorBanner(s.message)
            is UiState.Success -> {
                if (s.data.isEmpty()) {
                    EmptyState(L("Customers లేరు. + నొక్కి జోడించండి.", "No customers yet. Tap + to add one."))
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp)) {
                        items(s.data, key = { it.id }) { customer ->
                            CustomerRow(customer = customer, onClick = { onOpenCustomer(customer.id) })
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = onAddCustomer,
            modifier = Modifier.padding(24.dp).align(Alignment.BottomEnd),
        ) {
            Icon(Icons.Filled.Add, contentDescription = L("కొత్త customer", "Add customer"))
        }
    }
}

@Composable
private fun CustomerRow(customer: Customer, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(customer.name, style = MaterialTheme.typography.titleMedium)
            if (customer.phone.isNotBlank()) Text(customer.phone, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
