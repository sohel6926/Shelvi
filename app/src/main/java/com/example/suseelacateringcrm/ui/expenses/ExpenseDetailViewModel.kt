package com.example.suseelacateringcrm.ui.expenses

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Expense
import com.example.suseelacateringcrm.data.repository.ExpenseRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.launchSafe

class ExpenseDetailViewModel(
    private val expenseId: String,
    private val expenseRepository: ExpenseRepository = ServiceLocator.expenseRepository,
) : ViewModel() {

    private val _expense = MutableStateFlow<Expense?>(null)
    val expense: StateFlow<Expense?> = _expense.asStateFlow()

    var deleteState by mutableStateOf<UiState<Unit>?>(null)
        private set

    init {
        launchSafe("ExpenseDetailViewModel") { _expense.value = expenseRepository.getExpense(expenseId) }
    }

    /** R7-3: "రద్దు చేయి" with a reason via cancelRecord (no delete). */
    fun cancel(reason: String) {
        viewModelScope.launch {
            deleteState = UiState.Loading
            deleteState = try {
                expenseRepository.cancelExpense(expenseId, reason)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(com.example.suseelacateringcrm.util.errorText(com.example.suseelacateringcrm.data.remote.CallableError.from(e)))
            }
        }
    }
}
