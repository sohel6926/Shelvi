package com.example.suseelacateringcrm.ui.menu

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.model.MenuCategory
import com.example.suseelacateringcrm.data.model.MenuItem
import com.example.suseelacateringcrm.data.model.RecipeIngredient
import com.example.suseelacateringcrm.data.repository.InventoryRepository
import com.example.suseelacateringcrm.data.repository.MenuRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class MenuItemEditViewModel(
    private val itemId: String?,
    private val menuRepository: MenuRepository = ServiceLocator.menuRepository,
    private val inventoryRepository: InventoryRepository = ServiceLocator.inventoryRepository,
) : ViewModel() {

    var name by mutableStateOf("")
    var category by mutableStateOf(MenuCategory.STARTER)
    var isPackage by mutableStateOf(false)
    var includedItemIds by mutableStateOf<List<String>>(emptyList())
    var pricePerPlateText by mutableStateOf("")
    var isVeg by mutableStateOf(true)
    var isActive by mutableStateOf(true)

    var recipeIngredients by mutableStateOf<List<RecipeIngredient>>(emptyList())
        private set

    // Draft fields for "add ingredient" row.
    var draftInventoryItemId by mutableStateOf("")
    var draftInventoryItemName by mutableStateOf("")
    var draftQuantityPerPlateText by mutableStateOf("")

    var loading by mutableStateOf(itemId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    private val _availableItems = MutableStateFlow<List<MenuItem>>(emptyList())
    val availableItems: StateFlow<List<MenuItem>> = _availableItems.asStateFlow()

    private val _inventoryItems = MutableStateFlow<List<InventoryItem>>(emptyList())
    val inventoryItems: StateFlow<List<InventoryItem>> = _inventoryItems.asStateFlow()

    init {
        viewModelScope.launch {
            menuRepository.menuItemsFlow().catchLogged("MenuItemEditViewModel").collect { items ->
                _availableItems.value = items.filter { it.id != itemId && !it.isPackage }
            }
        }
        viewModelScope.launch {
            inventoryRepository.inventoryFlow().catchLogged("MenuItemEditViewModel").collect { _inventoryItems.value = it }
        }
        if (itemId != null) {
            launchSafe("MenuItemEditViewModel", onError = { loading = false }) {
                val existing = menuRepository.getMenuItem(itemId)
                if (existing != null) {
                    name = existing.name
                    category = existing.menuCategory
                    isPackage = existing.isPackage
                    includedItemIds = existing.includedItemIds
                    pricePerPlateText = if (existing.pricePerPlate == 0.0) "" else existing.pricePerPlate.toString()
                    isVeg = existing.isVeg
                    isActive = existing.isActive
                    recipeIngredients = existing.recipeIngredients
                }
                loading = false
            }
        }
    }

    fun toggleIncludedItem(id: String) {
        includedItemIds = if (id in includedItemIds) includedItemIds - id else includedItemIds + id
    }

    fun selectDraftIngredient(item: InventoryItem) {
        draftInventoryItemId = item.id
        draftInventoryItemName = item.name
    }

    fun addIngredient() {
        val qty = draftQuantityPerPlateText.toDoubleOrNull()
        if (draftInventoryItemId.isBlank() || qty == null || qty <= 0) return
        val unit = _inventoryItems.value.find { it.id == draftInventoryItemId }?.unit ?: ""
        recipeIngredients = recipeIngredients + RecipeIngredient(
            inventoryItemId = draftInventoryItemId,
            inventoryItemName = draftInventoryItemName,
            quantityPerPlate = qty,
            unit = unit,
        )
        draftInventoryItemId = ""
        draftInventoryItemName = ""
        draftQuantityPerPlateText = ""
    }

    fun removeIngredient(ingredient: RecipeIngredient) {
        recipeIngredients = recipeIngredients - ingredient
    }

    fun save() {
        val price = pricePerPlateText.toDoubleOrNull()
        if (name.isBlank() || price == null || price < 0) {
            saveState = UiState.Error(L("పేరు, సరైన ధర రాయండి", "Enter a name and a valid price"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                val item = MenuItem(
                    id = itemId ?: "",
                    name = name.trim(),
                    category = category.label,
                    isPackage = isPackage,
                    includedItemIds = if (isPackage) includedItemIds else emptyList(),
                    pricePerPlate = price,
                    isVeg = isVeg,
                    isActive = isActive,
                    recipeIngredients = recipeIngredients,
                )
                menuRepository.saveMenuItem(item)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("వంటకం సేవ్ కాలేదు", "Failed to save menu item") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
