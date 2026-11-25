package com.example.suseelacateringcrm.ui.purchases

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Purchase
import com.example.suseelacateringcrm.data.repository.PurchaseRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.launchSafe

class PurchaseDetailViewModel(
    private val purchaseId: String,
    private val purchaseRepository: PurchaseRepository = ServiceLocator.purchaseRepository,
) : ViewModel() {

    private val _purchase = MutableStateFlow<Purchase?>(null)
    val purchase: StateFlow<Purchase?> = _purchase.asStateFlow()

    var deleteState by mutableStateOf<UiState<Unit>?>(null)
        private set

    init {
        launchSafe("PurchaseDetailViewModel") {
            _purchase.value = purchaseRepository.getPurchase(purchaseId)
        }
    }

    /** R7-3: "రద్దు చేయి" with a reason via cancelRecord (no delete). */
    fun cancel(reason: String) {
        viewModelScope.launch {
            deleteState = UiState.Loading
            deleteState = try {
                purchaseRepository.cancelPurchase(purchaseId, reason)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(com.example.suseelacateringcrm.util.errorText(com.example.suseelacateringcrm.data.remote.CallableError.from(e)))
            }
        }
    }
}
