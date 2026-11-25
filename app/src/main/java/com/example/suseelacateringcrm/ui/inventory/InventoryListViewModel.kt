package com.example.suseelacateringcrm.ui.inventory

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.repository.InventoryRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class InventoryListViewModel(
    private val inventoryRepository: InventoryRepository = ServiceLocator.inventoryRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<InventoryItem>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<InventoryItem>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId
                .flatMapLatest { branchId -> inventoryRepository.inventoryFlow(branchId) }
                .catch { e -> _uiState.value = UiState.Error(L("Stock లోడ్ కాలేదు", "Failed to load inventory") + (e.message?.let { ": $it" } ?: "")) }
                .collect { items ->
                    _uiState.value = UiState.Success(items.sortedBy { it.name.lowercase() })
                }
        }
    }

    /** Result of the last stock change (Telugu/English), shown above the list. */
    var adjustMessage by androidx.compose.runtime.mutableStateOf<Pair<String, Boolean>?>(null)
        private set

    fun clearAdjustMessage() {
        adjustMessage = null
    }

    var showArchived by androidx.compose.runtime.mutableStateOf(false)

    fun adjustStock(itemId: String, type: String, quantity: Double, reason: String, note: String = "", expiryDay: String = "", batchNo: String = "") {
        if (quantity <= 0) {
            adjustMessage = L("పరిమాణం 0 కంటే ఎక్కువ ఉండాలి", "Quantity must be more than 0") to true
            return
        }
        viewModelScope.launch {
            adjustMessage = try {
                val pending = inventoryRepository.adjustStock(
                    itemId = itemId,
                    type = type,
                    quantity = quantity,
                    reason = reason,
                    relatedBookingId = "",
                    recordedBy = ServiceLocator.authRepository.currentUid ?: "",
                    note = note,
                    expiryDay = expiryDay,
                    batchNo = batchNo,
                )
                if (pending) {
                    L("పెద్ద మార్పు — ఆమోదం కోసం పంపాం. ఆమోదించే వరకు నిల్వ మారదు.", "Big change — sent for approval. Stock does not change until it is approved.") to false
                } else {
                    L("Stock మార్చాం ✓", "Stock updated ✓") to false
                }
            } catch (e: Exception) {
                com.example.suseelacateringcrm.data.remote.CallableError.from(e).text to true
            }
        }
    }

    /** R7-3: archive (no delete) with a reason. */
    fun archiveItem(itemId: String, reason: String) {
        launchSafe("InventoryListViewModel") {
            inventoryRepository.archiveItem(itemId, reason)
            adjustMessage = L("పక్కన పెట్టాం ✓", "Archived ✓") to false
        }
    }
}
