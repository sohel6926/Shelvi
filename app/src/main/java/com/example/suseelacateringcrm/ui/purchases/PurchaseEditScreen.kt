package com.example.suseelacateringcrm.ui.purchases

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.compose.AsyncImage
import com.example.suseelacateringcrm.data.model.PAYMENT_METHODS
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PurchaseEditScreen(
    padding: PaddingValues,
    purchaseId: String? = null,
    prefillName: String? = null,
    prefillCategory: String? = null,
    prefillModule: String? = null,
    prefillUnits: List<String>? = null,
    onDone: () -> Unit,
) {
    val viewModel: PurchaseEditViewModel = viewModel(
        key = "purchase-edit-${purchaseId ?: "$prefillName-$prefillCategory"}",
        factory = viewModelFactory {
            initializer { PurchaseEditViewModel(purchaseId, prefillName, prefillCategory, prefillModule, prefillUnits) }
        },
    )

    LaunchedEffect(viewModel.saveState) {
        if (viewModel.saveState is UiState.Success) onDone()
    }

    if (viewModel.loading) {
        com.example.suseelacateringcrm.ui.components.LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    val vendors by viewModel.vendors.collectAsStateWithLifecycle()
    val inventoryItems by viewModel.inventoryItems.collectAsStateWithLifecycle()
    val bookings by viewModel.bookings.collectAsStateWithLifecycle()
    var vendorMenuExpanded by remember { mutableStateOf(false) }
    var itemMenuExpanded by remember { mutableStateOf(false) }
    var unitMenuExpanded by remember { mutableStateOf(false) }
    var methodMenuExpanded by remember { mutableStateOf(false) }
    var statusMenuExpanded by remember { mutableStateOf(false) }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.billPhotoUri = uri
    }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(if (purchaseId == null) L("కొత్త కొనుగోలు", "New Purchase") else L("కొనుగోలు మార్చు", "Edit Purchase"), style = MaterialTheme.typography.titleLarge)
        if (viewModel.staffName.isNotBlank()) {
            Text(L("నమోదు చేసినవారు: ${viewModel.staffName}", "Recorded by: ${viewModel.staffName}"), style = MaterialTheme.typography.bodySmall)
        }

        ExposedDropdownMenuBox(expanded = vendorMenuExpanded, onExpandedChange = { vendorMenuExpanded = it }) {
            OutlinedTextField(
                value = viewModel.vendorName,
                onValueChange = {},
                readOnly = true,
                label = { Text("Vendor / Supplier") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = vendorMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = vendorMenuExpanded, onDismissRequest = { vendorMenuExpanded = false }) {
                if (vendors.isEmpty()) {
                    DropdownMenuItem(text = { Text(L("Vendors లేరు — ముందు ఒకరిని జోడించండి", "No vendors yet — add one first")) }, onClick = {})
                }
                vendors.forEach { vendor ->
                    DropdownMenuItem(text = { Text(vendor.name) }, onClick = {
                        viewModel.selectVendor(vendor)
                        vendorMenuExpanded = false
                    })
                }
            }
        }

        AppTextField(value = viewModel.billNumber, onValueChange = { viewModel.billNumber = it }, label = L("బిల్ నంబర్", "Bill number"))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AppDatePickerField(
                label = L("కొన్న తేదీ", "Purchase date"),
                date = viewModel.purchaseDate,
                onDateSelected = { viewModel.purchaseDate = it },
                modifier = Modifier.weight(1f),
            )
            AppTextField(
                value = viewModel.purchaseTimeText,
                onValueChange = { viewModel.purchaseTimeText = it },
                label = L("సమయం (HH:mm)", "Time (HH:mm)"),
                modifier = Modifier.weight(1f),
            )
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ExposedDropdownMenuBox(
                expanded = methodMenuExpanded,
                onExpandedChange = { methodMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = viewModel.paymentMethod,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("ఎలా చెల్లించారు", "Payment method")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = methodMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = methodMenuExpanded, onDismissRequest = { methodMenuExpanded = false }) {
                    PAYMENT_METHODS.forEach { method ->
                        DropdownMenuItem(text = { Text(tr(method)) }, onClick = {
                            viewModel.paymentMethod = method
                            methodMenuExpanded = false
                        })
                    }
                }
            }
            // R7-8: payment status is derived by the server from vendor payments (read-only here).
            OutlinedTextField(
                value = tr(viewModel.paymentStatus.ifBlank { "Unpaid" }),
                onValueChange = {},
                readOnly = true,
                enabled = false,
                label = { Text(L("చెల్లింపు స్థితి (ఆటోమేటిక్)", "Payment status (automatic)")) },
                modifier = Modifier.weight(1f).padding(vertical = 4.dp),
            )
        }

        com.example.suseelacateringcrm.ui.components.CostTargetPicker(
            target = viewModel.costTarget,
            bookings = bookings,
            onChange = { viewModel.costTarget = it },
            modifier = Modifier.padding(top = 8.dp),
        )

        Text(L("వస్తువు జోడించు", "Add item"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))

        ExposedDropdownMenuBox(expanded = itemMenuExpanded, onExpandedChange = { itemMenuExpanded = it }) {
            OutlinedTextField(
                value = if (viewModel.itemInventoryItemId.isBlank()) "Other / not stock-tracked" else viewModel.itemDescription,
                onValueChange = {},
                readOnly = true,
                label = { Text(L("Stock వస్తువుతో లింక్ (ఐచ్ఛికం)", "Link to inventory item (optional)")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = itemMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = itemMenuExpanded, onDismissRequest = { itemMenuExpanded = false }) {
                DropdownMenuItem(text = { Text(L("ఇతర / stock లో లేనివి", "Other / not stock-tracked")) }, onClick = {
                    viewModel.selectInventoryItemForDraft(null)
                    itemMenuExpanded = false
                })
                inventoryItems.forEach { item ->
                    DropdownMenuItem(text = { Text(item.name) }, onClick = {
                        viewModel.selectInventoryItemForDraft(item)
                        itemMenuExpanded = false
                    })
                }
            }
        }

        AppTextField(
            value = viewModel.itemDescription,
            onValueChange = { viewModel.itemDescription = it },
            label = L("వస్తువు పేరు", "Item name"),
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AppTextField(
                value = viewModel.itemQuantityText,
                onValueChange = { viewModel.itemQuantityText = it },
                label = L("పరిమాణం", "Quantity"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            ExposedDropdownMenuBox(
                expanded = unitMenuExpanded,
                onExpandedChange = { unitMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = viewModel.itemUnit,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Unit") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = unitMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = unitMenuExpanded, onDismissRequest = { unitMenuExpanded = false }) {
                    viewModel.allowedUnits.forEach { unit ->
                        DropdownMenuItem(text = { Text(tr(unit)) }, onClick = {
                            viewModel.itemUnit = unit
                            unitMenuExpanded = false
                        })
                    }
                }
            }
        }
        AppTextField(
            value = viewModel.itemUnitPriceText,
            onValueChange = { viewModel.itemUnitPriceText = it },
            label = L("ధర (ఒక unit కి ₹)", "Rate (₹ per unit)"),
            keyboardType = KeyboardType.Decimal,
        )
        OutlinedButton(onClick = { viewModel.addItem() }, modifier = Modifier.padding(top = 4.dp)) {
            Text(L("కొనుగోలుకి వస్తువు జోడించు", "Add item to purchase"))
        }

        if (viewModel.items.isNotEmpty()) {
            Text(L("వస్తువులు", "Items"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
            viewModel.items.forEach { item ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("${item.description}: ${item.quantity} ${item.unit} × ${CurrencyUtils.formatInr(item.unitPrice)} = ${CurrencyUtils.formatInr(item.amount)}")
                        IconButton(onClick = { viewModel.removeItem(item) }) {
                            Icon(Icons.Filled.Close, contentDescription = L("వస్తువు తీసేయి", "Remove item"))
                        }
                    }
                }
            }
            Text(L("మొత్తం (subtotal): ${CurrencyUtils.formatInr(viewModel.subtotal)}", "Subtotal: ${CurrencyUtils.formatInr(viewModel.subtotal)}"), modifier = Modifier.padding(top = 8.dp))
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AppTextField(
                value = viewModel.discountText,
                onValueChange = { viewModel.discountText = it },
                label = L("తగ్గింపు (₹)", "Discount (₹)"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            AppTextField(
                value = viewModel.otherChargesText,
                onValueChange = { viewModel.otherChargesText = it },
                label = L("ఇతర ఖర్చులు (₹)", "Other charges (₹)"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
        }
        Text(
            L("మొత్తం: ${CurrencyUtils.formatInr(viewModel.grandTotal)}", "Grand Total: ${CurrencyUtils.formatInr(viewModel.grandTotal)}"),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 8.dp),
        )

        Text(L("బిల్ ఫోటో", "Bill photo"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
        val photoUri = viewModel.billPhotoUri
        val displayPhoto: Any? = photoUri ?: viewModel.existingBillPhotoUrl.takeIf { it.isNotBlank() }
        if (displayPhoto != null) {
            AsyncImage(
                model = displayPhoto,
                contentDescription = L("బిల్ ఫోటో", "Bill photo"),
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(160.dp).padding(top = 8.dp),
            )
        }
        OutlinedButton(
            onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            modifier = Modifier.padding(top = 8.dp),
        ) {
            Text(if (displayPhoto == null) L("బిల్ ఫోటో జోడించు", "Attach bill photo") else L("ఫోటో మార్చు", "Change photo"))
        }

        AppTextField(value = viewModel.notes, onValueChange = { viewModel.notes = it }, label = L("గమనికలు", "Notes"), singleLine = false, modifier = Modifier.padding(top = 8.dp))

        val saveState = viewModel.saveState
        if (saveState is UiState.Error) {
            Text(saveState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }
        if (viewModel.uploading) {
            Text(L("ఫోటో upload అవుతోంది…", "Uploading photo…"), modifier = Modifier.padding(top = 8.dp))
        }

        Button(
            onClick = { viewModel.save() },
            modifier = Modifier.padding(top = 16.dp),
            enabled = saveState !is UiState.Loading,
        ) {
            Text(L("కొనుగోలు సేవ్ చేయి", "Save Purchase"))
        }
    }
}
