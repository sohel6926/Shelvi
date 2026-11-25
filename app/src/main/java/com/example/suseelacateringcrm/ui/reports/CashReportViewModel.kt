package com.example.suseelacateringcrm.ui.reports

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Payment
import com.example.suseelacateringcrm.data.repository.InvoiceRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.Date

data class StaffCollectionEntry(
    val staffName: String,
    val totalAmount: Double,
    val cashAmount: Double,
    val transactionCount: Int,
)

data class CashReportUiState(
    val totalCollected: Double = 0.0,
    val totalCash: Double = 0.0,
    val totalNonCash: Double = 0.0,
    val staffBreakdown: List<StaffCollectionEntry> = emptyList(),
    val recentPayments: List<Payment> = emptyList(),
)

class CashReportViewModel(
    private val invoiceRepository: InvoiceRepository = ServiceLocator.invoiceRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val allPayments = MutableStateFlow<List<Payment>>(emptyList())

    var dateFilter by mutableStateOf("All")
        private set

    private val _uiState = MutableStateFlow(CashReportUiState())
    val uiState: StateFlow<CashReportUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> invoiceRepository.allPaymentsFlow(branchId) }
                .catchLogged("CashReportViewModel").collect { payments ->
                allPayments.value = payments
                recompute()
            }
        }
    }

    fun onDateFilterSelected(filter: String) {
        dateFilter = filter
        recompute()
    }

    private fun recompute() {
        val filtered = allPayments.value.filter { matchesDateFilter(it.date, dateFilter) }
        val staffGroups = filtered
            .filter { it.recordedByName.isNotBlank() }
            .groupBy { it.recordedByName }
            .map { (name, list) ->
                StaffCollectionEntry(
                    staffName = name,
                    totalAmount = list.sumOf { it.amount },
                    cashAmount = list.filter { it.method == "Cash" }.sumOf { it.amount },
                    transactionCount = list.size,
                )
            }
            .sortedByDescending { it.totalAmount }

        _uiState.value = CashReportUiState(
            totalCollected = filtered.sumOf { it.amount },
            totalCash = filtered.filter { it.method == "Cash" }.sumOf { it.amount },
            totalNonCash = filtered.filter { it.method != "Cash" }.sumOf { it.amount },
            staffBreakdown = staffGroups,
            recentPayments = filtered.sortedByDescending { it.date },
        )
    }

    private fun matchesDateFilter(date: Date?, filter: String): Boolean {
        if (filter == "All" || date == null) return filter == "All"
        val cal = Calendar.getInstance()
        val today = Calendar.getInstance()
        cal.time = date
        return when (filter) {
            "Today" -> isSameDay(cal, today)
            "Yesterday" -> {
                today.add(Calendar.DAY_OF_YEAR, -1)
                isSameDay(cal, today)
            }
            "This Week" -> {
                val weekAgo = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -7) }
                date.after(weekAgo.time)
            }
            "This Month" -> cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) &&
                cal.get(Calendar.MONTH) == today.get(Calendar.MONTH)
            else -> true
        }
    }

    private fun isSameDay(a: Calendar, b: Calendar): Boolean =
        a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR)

    companion object {
        fun formatPaymentLine(payment: Payment): String {
            val date = DateUtils.formatDate(payment.date)
            val invoiceLabel = payment.invoiceNumberSnapshot.ifBlank { "Invoice" }
            val customer = payment.customerNameSnapshot.ifBlank { "" }
            return "$date · $invoiceLabel${if (customer.isNotBlank()) " · $customer" else ""}"
        }
    }
}
