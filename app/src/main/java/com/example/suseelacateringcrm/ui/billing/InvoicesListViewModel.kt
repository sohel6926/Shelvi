package com.example.suseelacateringcrm.ui.billing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Invoice
import com.example.suseelacateringcrm.data.repository.InvoiceRepository
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

class InvoicesListViewModel(
    private val invoiceRepository: InvoiceRepository = ServiceLocator.invoiceRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<Invoice>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Invoice>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId
                .flatMapLatest { branchId -> invoiceRepository.invoicesFlow(branchId) }
                .catch { e -> _uiState.value = UiState.Error(L("ఇన్వాయిస్‌లు లోడ్ కాలేదు", "Failed to load invoices") + (e.message?.let { ": $it" } ?: "")) }
                .collect { invoices ->
                    _uiState.value = UiState.Success(invoices.sortedByDescending { it.issueDate })
                }
        }
    }
}
