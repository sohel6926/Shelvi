package com.example.suseelacateringcrm.ui.quotations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Quotation
import com.example.suseelacateringcrm.data.repository.QuotationRepository
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

class QuotationsListViewModel(
    private val quotationRepository: QuotationRepository = ServiceLocator.quotationRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<Quotation>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Quotation>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId
                .flatMapLatest { branchId -> quotationRepository.quotationsFlow(branchId) }
                .catch { e -> _uiState.value = UiState.Error(L("కొటేషన్లు లోడ్ కాలేదు", "Failed to load quotations") + (e.message?.let { ": $it" } ?: "")) }
                .collect { quotations ->
                    _uiState.value = UiState.Success(quotations.sortedByDescending { it.issueDate })
                }
        }
    }
}
