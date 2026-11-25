package com.example.suseelacateringcrm.ui.customers

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Customer
import com.example.suseelacateringcrm.data.repository.CustomerRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class CustomerEditViewModel(
    private val customerId: String?,
    private val customerRepository: CustomerRepository = ServiceLocator.customerRepository,
) : ViewModel() {

    var name by mutableStateOf("")
    var phone by mutableStateOf("")
    var email by mutableStateOf("")
    var address by mutableStateOf("")
    var notes by mutableStateOf("")
    /** R10-8: WhatsApp consent tick (date + who are stamped when it changes). */
    var whatsappOptIn by mutableStateOf(false)
    private var originalOptIn = false
    /** 🔒 server stamp, shown read only. */
    var optInAt by mutableStateOf<java.util.Date?>(null)
        private set
    var optInBy by mutableStateOf("")
        private set

    var loading by mutableStateOf(customerId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    init {
        if (customerId != null) {
            launchSafe("CustomerEditViewModel", onError = { loading = false }) {
                val existing = customerRepository.getCustomer(customerId)
                if (existing != null) {
                    name = existing.name
                    phone = existing.phone
                    email = existing.email
                    address = existing.address
                    notes = existing.notes
                    whatsappOptIn = existing.whatsappOptIn
                    originalOptIn = existing.whatsappOptIn
                    optInAt = existing.whatsappOptInAt
                    optInBy = existing.whatsappOptInBy
                }
                loading = false
            }
        }
    }

    fun save() {
        if (name.isBlank() || phone.isBlank()) {
            saveState = UiState.Error(L("పేరు, ఫోన్ తప్పనిసరి", "Name and phone are required"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                val customer = Customer(
                    id = customerId ?: "",
                    name = name.trim(),
                    phone = phone.trim(),
                    email = email.trim(),
                    address = address.trim(),
                    notes = notes.trim(),
                    whatsappOptIn = whatsappOptIn,
                )
                customerRepository.saveCustomer(customer, optInChanged = customerId == null || whatsappOptIn != originalOptIn, createdBy = ServiceLocator.authRepository.currentUid ?: "")
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("Customer సేవ్ కాలేదు", "Failed to save customer") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
