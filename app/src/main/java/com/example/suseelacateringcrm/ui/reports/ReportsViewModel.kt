package com.example.suseelacateringcrm.ui.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.Invoice
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.InvoiceRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import com.example.suseelacateringcrm.util.L

data class MonthlySummary(
    val monthKey: String,
    val monthLabel: String,
    val invoicedTotal: Double,
    val collectedTotal: Double,
    val pendingTotal: Double,
    val invoiceCount: Int,
)

data class ReportsSummary(
    val months: List<MonthlySummary> = emptyList(),
    val overallPendingDues: Double = 0.0,
    val bookingsThisMonth: Int = 0,
)

class ReportsViewModel(
    private val invoiceRepository: InvoiceRepository = ServiceLocator.invoiceRepository,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val monthKeyFormat = SimpleDateFormat("yyyy-MM", Locale.getDefault())
    private val monthLabelFormat = SimpleDateFormat("MMM yyyy", Locale.getDefault())

    private val _uiState = MutableStateFlow<UiState<ReportsSummary>>(UiState.Loading)
    val uiState: StateFlow<UiState<ReportsSummary>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId ->
                combine(
                    invoiceRepository.invoicesFlow(branchId),
                    bookingRepository.bookingsFlow(branchId),
                ) { invoices, bookings -> buildSummary(invoices, bookings) }
            }
                .catch { e -> _uiState.value = UiState.Error(L("రిపోర్టులు లోడ్ కాలేదు", "Failed to load reports") + (e.message?.let { ": $it" } ?: "")) }
                .collect { _uiState.value = UiState.Success(it) }
        }
    }

    private fun buildSummary(invoices: List<Invoice>, bookings: List<Booking>): ReportsSummary {
        val months = invoices
            .filter { it.issueDate != null }
            .groupBy { monthKeyFormat.format(it.issueDate!!) }
            .map { (key, list) ->
                MonthlySummary(
                    monthKey = key,
                    monthLabel = monthLabelFormat.format(list.first().issueDate!!),
                    invoicedTotal = list.sumOf { it.totalAmount },
                    collectedTotal = list.sumOf { it.amountPaid },
                    pendingTotal = list.sumOf { it.balanceDue },
                    invoiceCount = list.size,
                )
            }
            .sortedByDescending { it.monthKey }

        val currentMonthKey = monthKeyFormat.format(Date())
        val bookingsThisMonth = bookings.count {
            it.eventDate != null && monthKeyFormat.format(it.eventDate) == currentMonthKey
        }

        return ReportsSummary(
            months = months,
            overallPendingDues = invoices.sumOf { it.balanceDue },
            bookingsThisMonth = bookingsThisMonth,
        )
    }
}
