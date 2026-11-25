package com.example.suseelacateringcrm.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.repository.BranchRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

class BranchSwitcherViewModel(
    private val branchRepository: BranchRepository = ServiceLocator.branchRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _branches = MutableStateFlow<List<Branch>>(emptyList())
    val branches: StateFlow<List<Branch>> = _branches.asStateFlow()

    val currentBranchId: StateFlow<String?> = branchManager.currentBranchId

    init {
        viewModelScope.launch {
            branchRepository.activeBranchesFlow()
                .catch { }
                .collect { branches -> _branches.value = branches.sortedBy { it.name.lowercase() } }
        }
    }

    fun selectBranch(branchId: String?) {
        branchManager.selectBranch(branchId)
    }
}
