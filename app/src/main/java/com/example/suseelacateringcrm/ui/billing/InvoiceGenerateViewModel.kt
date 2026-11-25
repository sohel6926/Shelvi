package com.example.suseelacateringcrm.ui.billing

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.InvoiceRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch

/**
 * Invoice creation now goes through the `generateInvoiceFromBooking` callable: the server builds
 * the line items from the booking's quotation / menuSnapshot and computes GST (calc-spec §1,
 * discount BEFORE tax). The old local GST rule (discount subtracted after tax) is gone, and the
 * app no longer asks for a GST rate — it comes from settings (0 until GST registration).
 */
class InvoiceGenerateViewModel(
    private val bookingId: String,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val invoiceRepository: InvoiceRepository = ServiceLocator.invoiceRepository,
) : ViewModel() {

    var booking by mutableStateOf<Booking?>(null)
        private set
    var loading by mutableStateOf(true)
        private set

    var generateState by mutableStateOf<UiState<String>?>(null)
        private set

    init {
        viewModelScope.launch {
            booking = try { bookingRepository.getBooking(bookingId) } catch (e: Exception) { null }
            loading = false
        }
    }

    fun generate() {
        val b = booking ?: return
        if (b.guestCount < 1) {
            generateState = UiState.Error(L("Booking లో అతిథులు కనీసం 1 ఉండాలి", "The booking needs at least 1 guest"))
            return
        }
        if (b.bookingStatus == BookingStatus.CANCELLED) {
            generateState = UiState.Error(L("రద్దయిన booking కి invoice చేయలేం", "Cancelled bookings can't be invoiced"))
            return
        }
        viewModelScope.launch {
            generateState = UiState.Loading
            generateState = invoiceRepository.generateInvoiceFromBooking(bookingId).fold(
                onSuccess = { UiState.Success(it.first) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }
}
