package com.example.suseelacateringcrm.ui.menu

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.example.suseelacateringcrm.data.model.MenuCategory
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MenuItemEditScreen(
    itemId: String?,
    padding: PaddingValues,
    onDone: () -> Unit,
) {
    val viewModel: MenuItemEditViewModel = viewModel(
        key = "menu-item-edit-$itemId",
        factory = viewModelFactory { initializer { MenuItemEditViewModel(itemId) } },
    )

    LaunchedEffect(viewModel.saveState) {
        if (viewModel.saveState is UiState.Success) onDone()
    }

    if (viewModel.loading) {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    val availableItems by viewModel.availableItems.collectAsStateWithLifecycle()
    val inventoryItems by viewModel.inventoryItems.collectAsStateWithLifecycle()
    var categoryExpanded by remember { mutableStateOf(false) }
    var ingredientMenuExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(if (itemId == null) L("కొత్త వంటకం", "New Menu Item") else L("వంటకం మార్చు", "Edit Menu Item"), style = MaterialTheme.typography.titleLarge)

        AppTextField(value = viewModel.name, onValueChange = { viewModel.name = it }, label = L("పేరు", "Name"))

        ExposedDropdownMenuBox(expanded = categoryExpanded, onExpandedChange = { categoryExpanded = it }) {
            OutlinedTextField(
                value = viewModel.category.label,
                onValueChange = {},
                readOnly = true,
                label = { Text(L("రకం", "Category")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = categoryExpanded, onDismissRequest = { categoryExpanded = false }) {
                MenuCategory.entries.forEach { cat ->
                    DropdownMenuItem(text = { Text(cat.label) }, onClick = {
                        viewModel.category = cat
                        categoryExpanded = false
                    })
                }
            }
        }

        AppTextField(
            value = viewModel.pricePerPlateText,
            onValueChange = { viewModel.pricePerPlateText = it },
            label = L("ప్లేట్ ధర (₹)", "Price per plate (₹)"),
            keyboardType = KeyboardType.Decimal,
        )

        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(L("శాకాహారం", "Vegetarian"), modifier = Modifier.weight(1f))
            Switch(checked = viewModel.isVeg, onCheckedChange = { viewModel.isVeg = it })
        }
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(L("పని చేస్తున్నారు", "Active"), modifier = Modifier.weight(1f))
            Switch(checked = viewModel.isActive, onCheckedChange = { viewModel.isActive = it })
        }
        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(L("ఇది ప్యాకేజీ (చాలా వస్తువుల కలయిక)", "Is a package (bundle of items)"), modifier = Modifier.weight(1f))
            Switch(checked = viewModel.isPackage, onCheckedChange = { viewModel.isPackage = it })
        }

        if (viewModel.isPackage) {
            Text(L("లోపల ఉన్న వస్తువులు", "Included items"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            availableItems.forEach { item ->
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = item.id in viewModel.includedItemIds,
                        onCheckedChange = { viewModel.toggleIncludedItem(item.id) },
                    )
                    Text(item.name)
                }
            }
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        Text(L("Recipe / సరుకులు (ప్లేట్‌కి)", "Recipe / Ingredients (per plate)"), style = MaterialTheme.typography.titleSmall)
        Text(
            L("Booking అతిథుల సంఖ్య నుంచి సరుకుల లెక్క కోసం.", "Used to calculate raw-material requirements from a booking's guest count."),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        if (viewModel.recipeIngredients.isNotEmpty()) {
            viewModel.recipeIngredients.forEach { ingredient ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(L("${ingredient.inventoryItemName}: ప్లేట్‌కి ${ingredient.quantityPerPlate} ${ingredient.unit}", "${ingredient.inventoryItemName}: ${ingredient.quantityPerPlate} ${ingredient.unit} / plate"))
                        IconButton(onClick = { viewModel.removeIngredient(ingredient) }) {
                            Icon(Icons.Filled.Close, contentDescription = L("సరుకు తీసేయి", "Remove ingredient"))
                        }
                    }
                }
            }
        }

        ExposedDropdownMenuBox(expanded = ingredientMenuExpanded, onExpandedChange = { ingredientMenuExpanded = it }) {
            OutlinedTextField(
                value = viewModel.draftInventoryItemName.ifBlank { L("stock వస్తువు ఎంచుకోండి", "Select inventory item") },
                onValueChange = {},
                readOnly = true,
                label = { Text(L("సరుకు (stock వస్తువు)", "Ingredient (inventory item)")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = ingredientMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = ingredientMenuExpanded, onDismissRequest = { ingredientMenuExpanded = false }) {
                if (inventoryItems.isEmpty()) {
                    DropdownMenuItem(text = { Text(L("Stock వస్తువులు లేవు", "No inventory items yet")) }, onClick = {})
                }
                inventoryItems.forEach { invItem ->
                    DropdownMenuItem(text = { Text("${invItem.name} (${invItem.unit})") }, onClick = {
                        viewModel.selectDraftIngredient(invItem)
                        ingredientMenuExpanded = false
                    })
                }
            }
        }
        AppTextField(
            value = viewModel.draftQuantityPerPlateText,
            onValueChange = { viewModel.draftQuantityPerPlateText = it },
            label = L("ప్లేట్‌కి పరిమాణం", "Quantity per plate"),
            keyboardType = KeyboardType.Decimal,
        )
        OutlinedButton(onClick = { viewModel.addIngredient() }, modifier = Modifier.padding(top = 4.dp)) {
            Text(L("సరుకు జోడించు", "Add ingredient"))
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
    }
}
