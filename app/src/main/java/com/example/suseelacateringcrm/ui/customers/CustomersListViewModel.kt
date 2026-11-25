package com.example.suseelacateringcrm.ui.customers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Customer
import com.example.suseelacateringcrm.data.repository.CustomerRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L

class CustomersListViewModel(
    private val customerRepository: CustomerRepository = ServiceLocator.customerRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<Customer>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Customer>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            customerRepository.customersFlow()
                .catch { e -> _uiState.value = UiState.Error(L("Customers లోడ్ కాలేదు", "Failed to load customers") + (e.message?.let { ": $it" } ?: "")) }
                .collect { customers ->
                    _uiState.value = UiState.Success(customers.sortedBy { it.name.lowercase() })
                }
        }
    }
}
