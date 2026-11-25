package com.example.suseelacateringcrm.ui.quotations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Quotation
import com.example.suseelacateringcrm.data.model.QuotationStatus
import com.example.suseelacateringcrm.data.repository.QuotationRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.launchSafe

class QuotationDetailViewModel(
    private val quotationId: String,
    private val quotationRepository: QuotationRepository = ServiceLocator.quotationRepository,
) : ViewModel() {

    private val _quotation = MutableStateFlow<Quotation?>(null)
    val quotation: StateFlow<Quotation?> = _quotation.asStateFlow()

    private val _business = MutableStateFlow<com.example.suseelacateringcrm.data.model.BusinessSettings?>(null)
    val business: StateFlow<com.example.suseelacateringcrm.data.model.BusinessSettings?> = _business.asStateFlow()
    val role = ServiceLocator.currentRole()

    /** Manual total / back to automatic, via saveQuotation (server recomputes and stamps calcMode). */
    suspend fun overrideTotal(manual: com.example.suseelacateringcrm.data.remote.ManualOverride): String? {
        val q = _quotation.value ?: return com.example.suseelacateringcrm.util.L("కొటేషన్ లోడ్ కాలేదు", "Quotation not loaded")
        // Multi-session quotation: re-send every session's stored input, with the booking (QA fix b).
        val sessions = q.sessionQuotes
        if (sessions.isNotEmpty()) {
            if (q.bookingId.isBlank()) {
                return com.example.suseelacateringcrm.util.L("ఈ కొటేషన్‌కి booking లేదు", "This quotation has no booking")
            }
            val first = sessions.first()
            return ServiceLocator.functions.resaveQuotationTotal(
                quotationId = q.id,
                customerId = q.customerId,
                bookingId = q.bookingId,
                menuPackageId = first.menuPackageId,
                selections = first.selections,
                storedQuote = first.quote,
                manual = manual,
                sessions = sessions.map { it.toMap() },
            ).exceptionOrNull()?.let { com.example.suseelacateringcrm.data.remote.CallableError.from(it).text }
        }
        if (q.menuPackageId.isBlank() || q.quoteRequest.isEmpty()) {
            return com.example.suseelacateringcrm.util.L(
                "పాత కొటేషన్ — quote builder తో కొత్తది చేయండి",
                "Old-style quotation — make a new one with the quote builder",
            )
        }
        return ServiceLocator.functions.resaveQuotationTotal(
            quotationId = q.id,
            customerId = q.customerId,
            bookingId = q.bookingId,
            menuPackageId = q.menuPackageId,
            selections = q.selections,
            storedQuote = q.quoteRequest,
            manual = manual,
        ).exceptionOrNull()?.let { com.example.suseelacateringcrm.data.remote.CallableError.from(it).text }
    }

    init {
        viewModelScope.launch {
            ServiceLocator.settingsRepository.businessFlow().catchLogged("QuotationDetailViewModel").collect { _business.value = it }
        }
        viewModelScope.launch {
            quotationRepository.quotationFlow(quotationId).catchLogged("QuotationDetailViewModel").collect {
                _quotation.value = it
            }
        }
    }

    /** Customer phone for the WhatsApp share (admin / manager can read customers). */
    private val _customerPhone = MutableStateFlow("")
    val customerPhone: StateFlow<String> = _customerPhone.asStateFlow()
    private val _customerName = MutableStateFlow("")
    val customerName: StateFlow<String> = _customerName.asStateFlow()
    private var phoneFor = ""

    fun loadCustomer(customerId: String) {
        if (customerId.isBlank() || customerId == phoneFor) return
        phoneFor = customerId
        launchSafe("QuotationDetailViewModel") {
            val c = ServiceLocator.customerRepository.getCustomer(customerId)
            _customerPhone.value = c?.phone.orEmpty()
            _customerName.value = c?.name.orEmpty()
        }
    }

    fun updateStatus(status: QuotationStatus) {
        launchSafe("QuotationDetailViewModel") {
            quotationRepository.updateStatus(quotationId, status.label)
        }
    }
}
