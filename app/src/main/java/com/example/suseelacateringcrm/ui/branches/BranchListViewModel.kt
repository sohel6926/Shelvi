package com.example.suseelacateringcrm.ui.branches

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.repository.BackfillResult
import com.example.suseelacateringcrm.data.repository.BranchRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class BranchListViewModel(
    private val branchRepository: BranchRepository = ServiceLocator.branchRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<Branch>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<Branch>>> = _uiState.asStateFlow()

    var backfillState by mutableStateOf<UiState<BackfillResult>?>(null)
        private set

    init {
        viewModelScope.launch {
            branchRepository.branchesFlow()
                .catch { e -> _uiState.value = UiState.Error(L("Branches లోడ్ కాలేదు", "Failed to load branches") + (e.message?.let { ": $it" } ?: "")) }
                .collect { branches ->
                    _uiState.value = UiState.Success(branches.sortedBy { it.name.lowercase() })
                }
        }
    }

    fun setActive(branchId: String, active: Boolean) {
        launchSafe("BranchListViewModel") { branchRepository.setActive(branchId, active) }
    }

    fun backfill(defaultBranchId: String) {
        viewModelScope.launch {
            backfillState = UiState.Loading
            backfillState = try {
                UiState.Success(branchRepository.backfillDefaultBranch(defaultBranchId))
            } catch (e: Exception) {
                UiState.Error(L("కాలేదు", "Backfill failed") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }

    fun clearBackfillState() {
        backfillState = null
    }
}
