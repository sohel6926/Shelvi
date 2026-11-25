package com.example.suseelacateringcrm.ui.staff

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.repository.StaffRepository
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

class StaffListViewModel(
    private val staffRepository: StaffRepository = ServiceLocator.staffRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<Staff>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Staff>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId
                .flatMapLatest { branchId -> staffRepository.staffFlow(branchId) }
                .catch { e -> _uiState.value = UiState.Error(L("సిబ్బంది లోడ్ కాలేదు", "Failed to load staff") + (e.message?.let { ": $it" } ?: "")) }
                .collect { staff ->
                    _uiState.value = UiState.Success(staff.sortedBy { it.name.lowercase() })
                }
        }
    }
}
