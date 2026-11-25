package com.example.suseelacateringcrm.ui.purchases

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.OtherPurchaseItem
import com.example.suseelacateringcrm.data.repository.OtherPurchaseItemRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L

class OtherItemsViewModel(
    private val otherPurchaseItemRepository: OtherPurchaseItemRepository = ServiceLocator.otherPurchaseItemRepository,
) : ViewModel() {

    private val _items = MutableStateFlow<List<OtherPurchaseItem>>(emptyList())
    val items: StateFlow<List<OtherPurchaseItem>> = _items.asStateFlow()

    var newItemName by mutableStateOf("")
    var newItemCategory by mutableStateOf("")
    var newItemUnit by mutableStateOf("Piece")
    var newItemSupplier by mutableStateOf("")
    var newItemNotes by mutableStateOf("")

    var addState by mutableStateOf<UiState<Unit>?>(null)
        private set

    init {
        viewModelScope.launch {
            otherPurchaseItemRepository.itemsFlow().collect { _items.value = it.sortedBy { item -> item.name.lowercase() } }
        }
    }

    fun addItem() {
        if (newItemName.isBlank()) {
            addState = UiState.Error(L("వస్తువు పేరు తప్పనిసరి", "Item name is required"))
            return
        }
        viewModelScope.launch {
            addState = UiState.Loading
            addState = try {
                otherPurchaseItemRepository.addItem(
                    OtherPurchaseItem(
                        name = newItemName,
                        category = newItemCategory.ifBlank { "Other" },
                        unit = newItemUnit,
                        defaultSupplierName = newItemSupplier,
                        notes = newItemNotes,
                    ),
                    createdBy = ServiceLocator.authRepository.currentUid ?: "",
                )
                newItemName = ""
                newItemCategory = ""
                newItemSupplier = ""
                newItemNotes = ""
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("వస్తువు జోడించలేకపోయాం", "Failed to add item") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }

    fun resetAddState() {
        addState = null
    }
}
