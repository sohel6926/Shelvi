package com.example.suseelacateringcrm.ui.bookings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.repository.BookingRepository
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

class BookingsListViewModel(
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<Booking>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Booking>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId
                .flatMapLatest { branchId -> bookingRepository.bookingsFlow(branchId) }
                .catch { e -> _uiState.value = UiState.Error(L("Bookings లోడ్ కాలేదు", "Failed to load bookings") + (e.message?.let { ": $it" } ?: "")) }
                .collect { bookings ->
                    _uiState.value = UiState.Success(bookings.sortedByDescending { it.eventDate })
                }
        }
    }
}
