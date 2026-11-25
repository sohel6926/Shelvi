package com.example.suseelacateringcrm.ui.customers

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.Customer
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.CustomerRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CustomerDetailViewModel(
    private val customerId: String,
    private val customerRepository: CustomerRepository = ServiceLocator.customerRepository,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
) : ViewModel() {

    private val _customer = MutableStateFlow<Customer?>(null)
    val customer: StateFlow<Customer?> = _customer.asStateFlow()

    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()

    init {
        viewModelScope.launch {
            customerRepository.customerFlow(customerId).catchLogged("CustomerDetailViewModel").collect { _customer.value = it }
        }
        viewModelScope.launch {
            bookingRepository.bookingsForCustomerFlow(customerId).catchLogged("CustomerDetailViewModel").collect { bookings ->
                _bookings.value = bookings.sortedByDescending { it.eventDate }
            }
        }
    }
}
