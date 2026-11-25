package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.StaffRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

/** QA fix 4: what the booking's bill button shows. */
data class BillState(
    val loaded: Boolean = false,
    val liveInvoiceId: String = "",
    val liveInvoiceNumber: String = "",
    /** An accepted (or latest live) quotation exists — the server bills from it. */
    val hasQuote: Boolean = false,
)

class BookingDetailViewModel(
    private val bookingId: String,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val staffRepository: StaffRepository = ServiceLocator.staffRepository,
) : ViewModel() {

    private val _booking = MutableStateFlow<Booking?>(null)
    val booking: StateFlow<Booking?> = _booking.asStateFlow()

    private val _staffList = MutableStateFlow<List<Staff>>(emptyList())
    val staffList: StateFlow<List<Staff>> = _staffList.asStateFlow()

    var updateState by mutableStateOf<UiState<Unit>?>(null)
        private set

    private val _bill = MutableStateFlow(BillState())
    val bill: StateFlow<BillState> = _bill.asStateFlow()

    init {
        // QA fix 4: bill button (admin / manager only — money docs are not readable by staff).
        val role = ServiceLocator.currentRole()
        if (role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN || role == com.example.suseelacateringcrm.data.model.UserRole.MANAGER) {
            viewModelScope.launch {
                kotlinx.coroutines.flow.combine(
                    ServiceLocator.invoiceRepository.invoicesForBookingFlow(bookingId),
                    ServiceLocator.quotationRepository.quotationsForBookingFlow(bookingId, ServiceLocator.nonAdminBranchId()),
                ) { invoices, quotes ->
                    val live = invoices.firstOrNull { inv ->
                        !inv.status.equals("Cancelled", ignoreCase = true) && !inv.status.equals("Void", ignoreCase = true)
                    }
                    BillState(
                        loaded = true,
                        liveInvoiceId = live?.id.orEmpty(),
                        liveInvoiceNumber = live?.invoiceNumber.orEmpty(),
                        hasQuote = quotes.any { q -> q.status !in listOf("Rejected", "Cancelled") },
                    )
                }.catchLogged("BookingDetailViewModel").collect { _bill.value = it }
            }
        }
        viewModelScope.launch {
            bookingRepository.bookingFlow(bookingId).catchLogged("BookingDetailViewModel").collect { _booking.value = it }
        }
        launchSafe("BookingDetailViewModel") {
            val branchId = bookingRepository.getBooking(bookingId)?.branchId?.ifBlank { null }
            staffRepository.staffFlow(branchId).catchLogged("BookingDetailViewModel").collect { _staffList.value = it }
        }
    }

    fun updateStatusAndNotes(status: String, notes: String) {
        viewModelScope.launch {
            updateState = UiState.Loading
            updateState = try {
                bookingRepository.updateStatusAndNotes(bookingId, status, notes)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("Booking మార్చలేకపోయాం", "Failed to update booking") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }

    fun assignStaff(staffIds: List<String>) {
        viewModelScope.launch {
            updateState = UiState.Loading
            updateState = try {
                bookingRepository.assignStaff(bookingId, staffIds)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("సిబ్బందిని కేటాయించలేకపోయాం", "Failed to assign staff") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
