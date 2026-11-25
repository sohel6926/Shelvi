package com.example.suseelacateringcrm.ui.vendors

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Vendor
import com.example.suseelacateringcrm.data.repository.VendorRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L

class VendorListViewModel(
    private val vendorRepository: VendorRepository = ServiceLocator.vendorRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<Vendor>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Vendor>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            vendorRepository.vendorsFlow()
                .catch { e -> _uiState.value = UiState.Error(L("Vendors లోడ్ కాలేదు", "Failed to load vendors") + (e.message?.let { ": $it" } ?: "")) }
                .collect { vendors ->
                    _uiState.value = UiState.Success(vendors.sortedBy { it.name.lowercase() })
                }
        }
    }
}
