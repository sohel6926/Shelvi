package com.example.suseelacateringcrm.ui.inventory

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.repository.InventoryRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class InventoryItemEditViewModel(
    private val itemId: String?,
    private val inventoryRepository: InventoryRepository = ServiceLocator.inventoryRepository,
) : ViewModel() {

    var name by mutableStateOf("")
    var unit by mutableStateOf("")
    var category by mutableStateOf("")
    var reorderLevelText by mutableStateOf("")
    private var quantityInStock: Double = 0.0

    var loading by mutableStateOf(itemId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    init {
        if (itemId != null) {
            launchSafe("InventoryItemEditViewModel", onError = { loading = false }) {
                val existing = inventoryRepository.getItem(itemId)
                if (existing != null) {
                    name = existing.name
                    unit = existing.unit
                    category = existing.category
                    reorderLevelText = existing.reorderLevel.toString()
                    quantityInStock = existing.quantityInStock
                }
                loading = false
            }
        }
    }

    fun save() {
        val reorderLevel = reorderLevelText.toDoubleOrNull()
        if (name.isBlank() || unit.isBlank() || reorderLevel == null || reorderLevel < 0) {
            saveState = UiState.Error(L("పేరు, unit, సరైన reorder స్థాయి రాయండి", "Enter a name, unit, and valid reorder level"))
            return
        }
        val branchId = ServiceLocator.branchManager.currentBranchId.value
        if (itemId == null && branchId == null) {
            saveState = UiState.Error(L("ముందు menu లో branch ఎంచుకోండి", "Select a branch before adding an inventory item"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                val item = InventoryItem(
                    id = itemId ?: "",
                    name = name.trim(),
                    unit = unit.trim(),
                    quantityInStock = quantityInStock,
                    reorderLevel = reorderLevel,
                    category = category.trim(),
                )
                inventoryRepository.saveItemMetadata(item, branchId)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("వస్తువు సేవ్ కాలేదు", "Failed to save item") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
