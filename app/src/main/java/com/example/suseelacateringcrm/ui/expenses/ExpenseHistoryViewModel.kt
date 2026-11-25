package com.example.suseelacateringcrm.ui.expenses

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
import java.util.Calendar
import java.util.Date

enum class ExpenseDateFilter(val label: String) {
    ALL("All"), TODAY("Today"), YESTERDAY("Yesterday"), THIS_WEEK("This Week"), THIS_MONTH("This Month")
}

class ExpenseHistoryViewModel(
    private val initialSection: String?,
    private val expenseRepository: ExpenseRepository = ServiceLocator.expenseRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _allExpenses = MutableStateFlow<List<Expense>>(emptyList())

    var dateFilter by mutableStateOf(ExpenseDateFilter.ALL)
        private set
    var sectionFilter by mutableStateOf(initialSection ?: "All")
        private set
    var personFilter by mutableStateOf("All")
        private set
    var statusFilter by mutableStateOf("All")
        private set
    var searchQuery by mutableStateOf("")
        private set

    private val _filtered = MutableStateFlow<List<Expense>>(emptyList())
    val filtered: StateFlow<List<Expense>> = _filtered.asStateFlow()

    private val _personOptions = MutableStateFlow(listOf("All"))
    val personOptions: StateFlow<List<String>> = _personOptions.asStateFlow()

    fun onDateFilterSelected(value: ExpenseDateFilter) { dateFilter = value; applyFilters() }
    fun onSectionFilterSelected(value: String) { sectionFilter = value; applyFilters() }
    fun onPersonFilterSelected(value: String) { personFilter = value; applyFilters() }
    fun onStatusFilterSelected(value: String) { statusFilter = value; applyFilters() }
    fun onSearchQueryChanged(value: String) { searchQuery = value; applyFilters() }

    /** R7-3: cancelled expenses hidden unless "రద్దైనవి చూపించు". */
    var showCancelled by mutableStateOf(false)
        private set
    fun onShowCancelledChanged(value: Boolean) { showCancelled = value; applyFilters() }

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> expenseRepository.expensesFlow(branchId, includeCancelled = true) }
                .collect { expenses ->
                    _allExpenses.value = expenses
                    _personOptions.value = listOf("All") + expenses.map { it.personName }.filter { it.isNotBlank() }.distinct().sorted()
                    applyFilters()
                }
        }
    }

    private fun applyFilters() {
        val now = Calendar.getInstance()
        val expenses = _allExpenses.value

        _filtered.value = expenses.filter { expense ->
            val date = expense.serviceDate
            val dateMatches = when (dateFilter) {
                ExpenseDateFilter.ALL -> true
                ExpenseDateFilter.TODAY -> date != null && isSameDay(date, now.time)
                ExpenseDateFilter.YESTERDAY -> {
                    val yesterday = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
                    date != null && isSameDay(date, yesterday.time)
                }
                ExpenseDateFilter.THIS_WEEK -> {
                    val weekStart = (now.clone() as Calendar).apply {
                        set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
                        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
                    }
                    date != null && !date.before(weekStart.time)
                }
                ExpenseDateFilter.THIS_MONTH -> {
                    val monthStart = (now.clone() as Calendar).apply {
                        set(Calendar.DAY_OF_MONTH, 1)
                        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
                    }
                    date != null && !date.before(monthStart.time)
                }
            }
            val sectionMatches = sectionFilter == "All" || expense.section == sectionFilter
            val personMatches = personFilter == "All" || expense.personName == personFilter
            val statusMatches = statusFilter == "All" || expense.paymentStatus == statusFilter
            val searchMatches = searchQuery.isBlank() ||
                expense.subCategory.contains(searchQuery, ignoreCase = true) ||
                expense.personName.contains(searchQuery, ignoreCase = true) ||
                expense.section.contains(searchQuery, ignoreCase = true)

            val cancelMatches = showCancelled || !expense.status.equals("Cancelled", ignoreCase = true)
            dateMatches && sectionMatches && personMatches && statusMatches && searchMatches && cancelMatches
        }.sortedByDescending { it.serviceDate }
    }

    private fun isSameDay(a: Date, b: Date): Boolean {
        val ca = Calendar.getInstance().apply { time = a }
        val cb = Calendar.getInstance().apply { time = b }
        return ca.get(Calendar.YEAR) == cb.get(Calendar.YEAR) && ca.get(Calendar.DAY_OF_YEAR) == cb.get(Calendar.DAY_OF_YEAR)
    }
}
