package com.example.suseelacateringcrm.ui.billing

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.BusinessSettings
import com.example.suseelacateringcrm.data.model.Invoice
import com.example.suseelacateringcrm.data.model.Payment
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.repository.InvoiceRepository
import com.example.suseelacateringcrm.data.repository.SettingsRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class InvoiceDetailViewModel(
    private val invoiceId: String,
    private val invoiceRepository: InvoiceRepository = ServiceLocator.invoiceRepository,
    private val settingsRepository: SettingsRepository = ServiceLocator.settingsRepository,
) : ViewModel() {

    private val _invoice = MutableStateFlow<Invoice?>(null)
    val invoice: StateFlow<Invoice?> = _invoice.asStateFlow()

    private val _payments = MutableStateFlow<List<Payment>>(emptyList())
    val payments: StateFlow<List<Payment>> = _payments.asStateFlow()

    private val _business = MutableStateFlow<BusinessSettings?>(null)
    val business: StateFlow<BusinessSettings?> = _business.asStateFlow()

    var paymentState by mutableStateOf<UiState<String>?>(null)
        private set

    init {
        viewModelScope.launch {
            invoiceRepository.invoiceFlow(invoiceId).catchLogged("InvoiceDetailViewModel").collect { _invoice.value = it }
        }
        viewModelScope.launch {
            invoiceRepository.paymentsFlow(invoiceId).catchLogged("InvoiceDetailViewModel").collect { payments ->
                _payments.value = payments.sortedByDescending { it.date }
            }
        }
        viewModelScope.launch {
            settingsRepository.businessFlow().catchLogged("InvoiceDetailViewModel").collect { _business.value = it }
        }
    }

    val role = ServiceLocator.currentRole()

    /** overrideInvoiceTotal — a manual total can't go below what is already paid. */
    suspend fun overrideTotal(manual: com.example.suseelacateringcrm.data.remote.ManualOverride): String? {
        val inv = _invoice.value ?: return L("ఇన్వాయిస్ లోడ్ కాలేదు", "Invoice not loaded")
        val v = manual.value
        if (v != null && v + 0.005 < inv.amountPaid) {
            return L("ఇప్పటికే ${rupees(inv.amountPaid)} చెల్లించారు — అంతకంటే తక్కువ పెట్టలేం", "Already paid ${rupees(inv.amountPaid)} — the total can't be lower")
        }
        return ServiceLocator.functions.overrideInvoiceTotal(invoiceId, manual)
            .exceptionOrNull()?.let { CallableError.from(it).text }
    }

    /**
     * Admin refund / adjustment via refundOrAdjust. Checked here first: amount > 0, not more than
     * what was paid, reason at least 3 characters. Returns an error text or null.
     */
    suspend fun refund(amountText: String, reason: String): String? {
        val inv = _invoice.value ?: return L("ఇన్వాయిస్ లోడ్ కాలేదు", "Invoice not loaded")
        val amount = amountText.trim().toDoubleOrNull()
        if (amount == null || amount < 0.01) return L("మొత్తం 0 కంటే ఎక్కువ ఉండాలి", "Amount must be more than 0")
        if (amount > inv.amountPaid + 0.005) {
            return L("చెల్లించింది ${rupees(inv.amountPaid)} మాత్రమే — అంతకంటే ఎక్కువ వాపసు ఇవ్వలేం", "Only ${rupees(inv.amountPaid)} was paid — can't refund more")
        }
        if (reason.trim().length < 3) return L("కారణం రాయండి (కనీసం 3 అక్షరాలు)", "Write a reason (at least 3 characters)")
        return ServiceLocator.functions.refundOrAdjust(invoiceId, amount, reason.trim()).fold(
            onSuccess = { r ->
                paymentState = UiState.Success(L("వాపసు నమోదైంది. ఇప్పుడు బాకీ ${rupees(r.newBalance)}", "Refund recorded. Balance now ${rupees(r.newBalance)}"))
                null
            },
            onFailure = { CallableError.from(it).text },
        )
    }

    fun clearPaymentState() {
        paymentState = null
    }

    /**
     * Checks run here first (amount > 0, at most the balance, valid date) with Telugu messages;
     * the server repeats them and records the payment in one transaction (calc-spec §2).
     * Returns false when the input is rejected locally (dialog stays open).
     */
    fun recordPayment(amountText: String, method: String, date: String, note: String): Boolean {
        val inv = _invoice.value ?: return false
        val amount = amountText.trim().toDoubleOrNull()
        if (amount == null || amount < 0.01) {
            paymentState = UiState.Error(L("మొత్తం 0 కంటే ఎక్కువ ఉండాలి", "Amount must be more than 0"))
            return false
        }
        if (amount > inv.balanceDue + 0.005) {
            paymentState = UiState.Error(
                L("బాకీ ${rupees(inv.balanceDue)} మాత్రమే — అంతకంటే ఎక్కువ తీసుకోలేం", "Balance is only ${rupees(inv.balanceDue)} — can't take more")
            )
            return false
        }
        if (DayKey.parse(date) == null) {
            paymentState = UiState.Error(L("తేదీ ఎంచుకోండి", "Pick the date"))
            return false
        }
        if (date > DayKey.today()) {
            paymentState = UiState.Error(L("రాబోయే తేదీ కాకూడదు", "The date can't be in the future"))
            return false
        }
        viewModelScope.launch {
            paymentState = UiState.Loading
            paymentState = invoiceRepository.recordPayment(invoiceId, amount, method, date, note).fold(
                onSuccess = { r ->
                    UiState.Success(
                        L("జమ అయింది. ఇంకా బాకీ ${rupees(r.newBalance)}", "Recorded. Balance now ${rupees(r.newBalance)}")
                    )
                },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
        return true
    }
}
