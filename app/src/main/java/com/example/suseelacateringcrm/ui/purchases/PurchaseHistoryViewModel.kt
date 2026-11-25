package com.example.suseelacateringcrm.ui.purchases

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Purchase
import com.example.suseelacateringcrm.data.repository.PurchaseRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.Date

enum class DateFilter(val label: String) {
    ALL("All"), TODAY("Today"), YESTERDAY("Yesterday"), THIS_WEEK("This Week"), THIS_MONTH("This Month")
}

class PurchaseHistoryViewModel(
    private val purchaseRepository: PurchaseRepository = ServiceLocator.purchaseRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _allPurchases = MutableStateFlow<List<Purchase>>(emptyList())

    var dateFilter by mutableStateOf(DateFilter.ALL)
        private set
    var staffFilter by mutableStateOf("All")
        private set
    var paymentStatusFilter by mutableStateOf("All")
        private set
    var searchQuery by mutableStateOf("")
        private set

    fun onDateFilterSelected(value: DateFilter) { dateFilter = value; applyFilters() }
    fun onStaffFilterSelected(value: String) { staffFilter = value; applyFilters() }
    fun onPaymentStatusFilterSelected(value: String) { paymentStatusFilter = value; applyFilters() }
    fun onSearchQueryChanged(value: String) { searchQuery = value; applyFilters() }

    /** R7-3: cancelled purchases hidden unless "రద్దైనవి చూపించు". */
    var showCancelled by mutableStateOf(false)
        private set
    fun onShowCancelledChanged(value: Boolean) { showCancelled = value; applyFilters() }

    private val _filtered = MutableStateFlow<List<Purchase>>(emptyList())
    val filtered: StateFlow<List<Purchase>> = _filtered.asStateFlow()

    val staffOptions: StateFlow<List<String>> = MutableStateFlow(listOf("All")).also { flow ->
        viewModelScope.launch {
            _allPurchases.collect { purchases ->
                flow.value = listOf("All") + purchases.map { it.staffName }.filter { it.isNotBlank() }.distinct().sorted()
            }
        }
    }.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> purchaseRepository.purchasesFlow(branchId, includeCancelled = true) }
                .collect { purchases ->
                    _allPurchases.value = purchases
                    applyFilters()
                }
        }
    }

    private fun applyFilters() {
        val now = Calendar.getInstance()
        val purchases = _allPurchases.value

        _filtered.value = purchases.filter { purchase ->
            val date = purchase.purchaseDate
            val dateMatches = when (dateFilter) {
                DateFilter.ALL -> true
                DateFilter.TODAY -> date != null && isSameDay(date, now.time)
                DateFilter.YESTERDAY -> {
                    val yesterday = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
                    date != null && isSameDay(date, yesterday.time)
                }
                DateFilter.THIS_WEEK -> {
                    val weekStart = (now.clone() as Calendar).apply {
                        set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
                        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
                    }
                    date != null && !date.before(weekStart.time)
                }
                DateFilter.THIS_MONTH -> {
                    val monthStart = (now.clone() as Calendar).apply {
                        set(Calendar.DAY_OF_MONTH, 1)
                        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
                    }
                    date != null && !date.before(monthStart.time)
                }
            }
            val staffMatches = staffFilter == "All" || purchase.staffName == staffFilter
            val statusMatches = paymentStatusFilter == "All" || purchase.paymentStatus == paymentStatusFilter
            val searchMatches = searchQuery.isBlank() ||
                purchase.items.any { it.description.contains(searchQuery, ignoreCase = true) } ||
                purchase.vendorNameSnapshot.contains(searchQuery, ignoreCase = true)

            val cancelMatches = showCancelled || !purchase.status.equals("Cancelled", ignoreCase = true)
            dateMatches && staffMatches && statusMatches && searchMatches && cancelMatches
        }.sortedByDescending { it.purchaseDate }
    }

    private fun isSameDay(a: Date, b: Date): Boolean {
        val ca = Calendar.getInstance().apply { time = a }
        val cb = Calendar.getInstance().apply { time = b }
        return ca.get(Calendar.YEAR) == cb.get(Calendar.YEAR) && ca.get(Calendar.DAY_OF_YEAR) == cb.get(Calendar.DAY_OF_YEAR)
    }
}
