package com.example.suseelacateringcrm.ui.branches

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.repository.BranchRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class BranchEditViewModel(
    private val branchId: String?,
    private val branchRepository: BranchRepository = ServiceLocator.branchRepository,
) : ViewModel() {

    var name by mutableStateOf("")
    var address by mutableStateOf("")
    var phone by mutableStateOf("")

    var loading by mutableStateOf(branchId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    init {
        if (branchId != null) {
            launchSafe("BranchEditViewModel", onError = { loading = false }) {
                val existing = branchRepository.getBranch(branchId)
                if (existing != null) {
                    name = existing.name
                    address = existing.address
                    phone = existing.phone
                }
                loading = false
            }
        }
    }

    fun save() {
        if (name.isBlank()) {
            saveState = UiState.Error(L("పేరు తప్పనిసరి", "Name is required"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                val branch = Branch(
                    id = branchId ?: "",
                    name = name.trim(),
                    address = address.trim(),
                    phone = phone.trim(),
                )
                branchRepository.saveBranch(branch)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("Branch సేవ్ కాలేదు", "Failed to save branch") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
