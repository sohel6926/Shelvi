package com.example.suseelacateringcrm.ui.expenses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Expense
import com.example.suseelacateringcrm.data.repository.ExpenseRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class ExpensesHomeSummary(
    val todayTotal: Double = 0.0,
    val monthTotal: Double = 0.0,
    val totalPending: Double = 0.0,
    val sectionTotals: List<Pair<String, Double>> = emptyList(),
)

class ExpensesHomeViewModel(
    private val expenseRepository: ExpenseRepository = ServiceLocator.expenseRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val dayKeyFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    private val monthKeyFormat = SimpleDateFormat("yyyy-MM", Locale.getDefault())

    private val _summary = MutableStateFlow(ExpensesHomeSummary())
    val summary: StateFlow<ExpensesHomeSummary> = _summary.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> expenseRepository.expensesFlow(branchId) }
                .collect { expenses -> _summary.value = buildSummary(expenses) }
        }
    }

    private fun buildSummary(expenses: List<Expense>): ExpensesHomeSummary {
        val todayKey = dayKeyFormat.format(Date())
        val monthKey = monthKeyFormat.format(Date())
        val today = expenses.filter { it.serviceDate != null && dayKeyFormat.format(it.serviceDate) == todayKey }
        val month = expenses.filter { it.serviceDate != null && monthKeyFormat.format(it.serviceDate) == monthKey }
        val sectionTotals = expenses.groupBy { it.section }
            .map { (section, list) -> section to list.sumOf { it.totalAmount } }
            .sortedByDescending { it.second }

        return ExpensesHomeSummary(
            todayTotal = today.sumOf { it.totalAmount },
            monthTotal = month.sumOf { it.totalAmount },
            totalPending = expenses.sumOf { it.balanceAmount },
            sectionTotals = sectionTotals,
        )
    }
}
