package com.example.suseelacateringcrm.ui.quotebuilder

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Customer
import com.example.suseelacateringcrm.data.model.MenuPackage
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.QuoteExtra
import com.example.suseelacateringcrm.data.remote.QuoteRequest
import com.example.suseelacateringcrm.data.remote.QuoteResult
import com.example.suseelacateringcrm.data.remote.QuoteSpecialMeal
import com.example.suseelacateringcrm.data.model.SpecialMeal
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.CustomerRepository
import com.example.suseelacateringcrm.data.repository.MenuPackageRepository
import com.example.suseelacateringcrm.data.repository.QuotationRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/** What the owner typed for one extra (qty, and a price when the menu says "ask price"). */
data class ExtraInput(val qtyText: String = "1", val priceText: String = "")

/** A request built from the form, or the Telugu/English reason it can't be built yet. */
private sealed class Built {
    data class Ok(val request: QuoteRequest) : Built()
    data class Invalid(val message: String) : Built()
}

/**
 * Quote builder: every total comes from `quoteMenu` (live preview, debounced) and is saved with
 * `saveQuotation` (server recomputes). Only input checks run here.
 */
@OptIn(FlowPreview::class)
class QuoteBuilderViewModel(
    initialPackageId: String?,
    private val bookingId: String?,
    private val customerRepository: CustomerRepository = ServiceLocator.customerRepository,
    private val packageRepository: MenuPackageRepository = ServiceLocator.menuPackageRepository,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val quotationRepository: QuotationRepository = ServiceLocator.quotationRepository,
) : ViewModel() {

    private val _customers = MutableStateFlow<List<Customer>>(emptyList())
    val customers: StateFlow<List<Customer>> = _customers.asStateFlow()
    /** Snapshot state (not a StateFlow) so the live preview re-runs when the menus arrive. */
    var packages by mutableStateOf<List<MenuPackage>>(emptyList())
        private set

    var customerId by mutableStateOf("")
    var packageId by mutableStateOf(initialPackageId ?: "")
        private set
    /** Chosen option index per menu group ("/" = choose one). */
    val selections = mutableStateListOf<Int>()

    var platesText by mutableStateOf("")
    var servingBoysText by mutableStateOf("0")
    var transportText by mutableStateOf("0")
    var discountText by mutableStateOf("")
    var notes by mutableStateOf("")
    var validDaysText by mutableStateOf("15")
    val chosenReplacements = mutableStateListOf<String>()
    val extras = mutableStateMapOf<String, ExtraInput>()
    /** R10-11 kids plates (on top of the plates) and special meals (inside the plates). */
    var kidsCount by mutableStateOf(0)
        private set
    var specialMeals by mutableStateOf<List<SpecialMeal>>(emptyList())
        private set
    /** Owner-set extra ₹ per special plate, same index as [specialMeals] ("" = included in the plate price). */
    var specialExtraTexts by mutableStateOf<List<String>>(emptyList())
        private set

    var preview by mutableStateOf<UiState<QuoteResult>?>(null)
        private set
    /** Input problem shown above the preview (not a server error). */
    var inputProblem by mutableStateOf<String?>(null)
        private set
    var saveState by mutableStateOf<UiState<String>?>(null)
        private set

    /** Optional hand-typed total (admin, or manager when allowed) — sent as `manual` to saveQuotation. */
    var manualTotalText by mutableStateOf("")
    var manualReason by mutableStateOf("")
    val role = ServiceLocator.currentRole()
    var business by mutableStateOf<com.example.suseelacateringcrm.data.model.BusinessSettings?>(null)
        private set
    val canOverride: Boolean get() = com.example.suseelacateringcrm.data.model.canOverride(role, business)
    /** settings.calcModes.quotation == "manual" → the manual total box is open by default. */
    val manualMode: Boolean
        get() = business?.modeOf(com.example.suseelacateringcrm.data.model.CalcArea.QUOTATION) == "manual"

    val selectedPackage: MenuPackage? get() = packages.find { it.id == packageId }
    /** Only the owner sets an extra price for special meals (same as the web). */
    val canPriceSpecials: Boolean get() = role == UserRole.ADMIN

    init {
        viewModelScope.launch {
            customerRepository.customersFlow().catchLogged("QuoteBuilderViewModel")
                .collect { list -> _customers.value = list.sortedBy { it.name.lowercase() } }
        }
        viewModelScope.launch {
            packageRepository.packagesFlow().catchLogged("QuoteBuilderViewModel").collect { list ->
                packages = list.filter { it.active }.sortedWith(compareBy({ it.mealType }, { it.code }))
                if (packageId.isNotBlank()) resetSelections()
            }
        }
        viewModelScope.launch {
            ServiceLocator.settingsRepository.businessFlow().catchLogged("QuoteBuilderViewModel").collect { business = it }
        }
        if (bookingId != null) {
            viewModelScope.launch {
                val booking = try { bookingRepository.getBooking(bookingId) } catch (e: Exception) { null }
                if (booking != null) {
                    if (customerId.isBlank()) customerId = booking.customerId
                    if (platesText.isBlank() && booking.guestCount > 0) platesText = booking.guestCount.toString()
                    if (packageId.isBlank() && booking.packageId.isNotBlank()) selectPackage(booking.packageId)
                    // R10-11: bring the booking's kids / special meals (a multi-meal booking: its live sessions added up).
                    if (kidsCount == 0 && specialMeals.isEmpty()) {
                        val live = booking.sessions.filter { it.status != "cancelled" }
                        if (live.isEmpty()) {
                            setKidsAndSpecials(booking.kidsCount, booking.specialMeals.filter { it.count > 0 })
                        } else {
                            val merged = mutableListOf<SpecialMeal>()
                            live.flatMap { it.specialMeals }.filter { it.count > 0 }.forEach { m ->
                                val i = if (m.type == "other") -1 else merged.indexOfFirst { it.type == m.type }
                                if (i >= 0) {
                                    val old = merged[i]
                                    merged[i] = old.copy(count = old.count + m.count, note = listOf(old.note, m.note).filter { it.isNotBlank() }.distinct().joinToString("; "))
                                } else merged += m
                            }
                            setKidsAndSpecials(live.sumOf { it.kidsCount }, merged)
                        }
                    }
                }
            }
        }
        // Live preview: rebuild the request whenever an input changes, wait 600 ms, ask the server.
        viewModelScope.launch {
            snapshotFlow { build() }
                .debounce(600)
                .distinctUntilChanged()
                .collectLatest { built ->
                    when (built) {
                        is Built.Invalid -> {
                            inputProblem = built.message
                            preview = null
                        }
                        is Built.Ok -> {
                            inputProblem = null
                            preview = UiState.Loading
                            preview = quotationRepository.quote(built.request).fold(
                                onSuccess = { UiState.Success(it) },
                                onFailure = { UiState.Error(CallableError.from(it).text) },
                            )
                        }
                    }
                }
        }
    }

    /** Refresh: ask the server for the preview again with the current inputs. */
    suspend fun refreshPreview() {
        val built = build()
        if (built is Built.Ok) {
            preview = quotationRepository.quote(built.request).fold(
                onSuccess = { UiState.Success(it) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }

    fun selectPackage(id: String) {
        if (id == packageId && selections.isNotEmpty()) return
        packageId = id
        chosenReplacements.clear()
        extras.clear()
        resetSelections()
    }

    private fun resetSelections() {
        val groups = selectedPackage?.groups ?: return
        if (selections.size == groups.size) return
        selections.clear()
        repeat(groups.size) { selections.add(0) }
    }

    fun choose(groupIndex: Int, optionIndex: Int) {
        if (groupIndex in selections.indices) selections[groupIndex] = optionIndex
    }

    fun toggleReplacement(key: String) {
        if (key in chosenReplacements) chosenReplacements.remove(key) else chosenReplacements.add(key)
    }

    fun toggleExtra(key: String) {
        if (extras.containsKey(key)) extras.remove(key) else extras[key] = ExtraInput()
    }

    fun setExtra(key: String, input: ExtraInput) {
        extras[key] = input
    }

    /** From the kids / special meals editor; keeps each row's extra price on the same row. */
    fun setKidsAndSpecials(kids: Int, meals: List<SpecialMeal>) {
        val old = specialMeals
        var texts = specialExtraTexts.take(old.size).let { it + List(old.size - it.size) { "" } }
        if (meals.size < old.size) {
            val removed = old.indices.firstOrNull { it >= meals.size || meals[it] != old[it] } ?: old.lastIndex
            texts = texts.filterIndexed { i, _ -> i != removed }
        }
        kidsCount = kids
        specialMeals = meals
        specialExtraTexts = texts.take(meals.size) + List((meals.size - texts.size).coerceAtLeast(0)) { "" }
    }

    fun setSpecialExtra(index: Int, text: String) {
        if (index in specialExtraTexts.indices) specialExtraTexts = specialExtraTexts.toMutableList().also { it[index] = text }
    }

    /** Client-side checks (B4): stop impossible numbers before they reach the server. */
    private fun build(): Built {
        val pkg = selectedPackage ?: return Built.Invalid(L("ముందు మెనూ ఎంచుకోండి", "Pick a menu first"))
        val plates = platesText.trim().toIntOrNull()
        if (plates == null || plates < 1) return Built.Invalid(L("ప్లేట్లు కనీసం 1 ఉండాలి (పూర్ణ సంఖ్య)", "Plates must be a whole number, at least 1"))
        val boys = servingBoysText.trim().ifBlank { "0" }.toIntOrNull()
        if (boys == null || boys < 0) return Built.Invalid(L("Serving boys సంఖ్య సరిగా లేదు", "Serving boys must be a whole number, 0 or more"))
        val transport = transportText.trim().ifBlank { "0" }.toDoubleOrNull()
        if (transport == null || transport < 0) return Built.Invalid(L("రవాణా ఖర్చు మైనస్ కాకూడదు", "Transport can't be negative"))
        // Contract decision 13: transport is inside the plate price when the menu doesn't charge it.
        if (!pkg.transportCharged && transport > 0) return Built.Invalid(L("ఈ మెనూ ధరలో రవాణా కలిసే ఉంది — 0 పెట్టండి", "Transport is included in this menu's price — enter 0"))
        val discount = discountText.trim().ifBlank { "0" }.toDoubleOrNull()
        if (discount == null || discount < 0) return Built.Invalid(L("తగ్గింపు మైనస్ కాకూడదు", "Discount can't be negative"))
        val extraList = mutableListOf<QuoteExtra>()
        for ((key, input) in extras.toMap()) {
            val menuExtra = pkg.extras.find { it.key == key } ?: continue
            val q = input.qtyText.trim().toIntOrNull()
            val name = L(menuExtra.te, menuExtra.en)
            if (q == null || q < 1) return Built.Invalid(L("$name: సంఖ్య కనీసం 1", "$name: quantity must be at least 1"))
            var price: Double? = null
            if (menuExtra.price == null) {
                price = input.priceText.trim().toDoubleOrNull()
                if (price == null || price < 0) return Built.Invalid(L("$name: ధర enter చేయండి", "$name: enter the price"))
            }
            extraList += QuoteExtra(key, q, price)
        }
        // R10-11 kids / special meals — the server checks the same and prices them.
        if (kidsCount < 0) return Built.Invalid(L("పిల్లల సంఖ్య 0 లేదా ఎక్కువ", "Kids must be 0 or more"))
        val specials = mutableListOf<QuoteSpecialMeal>()
        val seen = mutableSetOf<String>()
        for ((i, m) in specialMeals.withIndex()) {
            val label = SpecialMeal.typeLabel(m.type)
            if (m.count < 1) return Built.Invalid(L("$label: సంఖ్య 1 లేదా ఎక్కువ (లేదా తీసేయండి)", "$label: count must be 1 or more (or remove it)"))
            if (m.type != "other" && !seen.add(m.type)) return Built.Invalid(L("$label రెండుసార్లు ఉంది", "$label is listed twice"))
            val extraText = specialExtraTexts.getOrNull(i)?.trim().orEmpty()
            val extra = if (canPriceSpecials && extraText.isNotEmpty()) extraText.toDoubleOrNull() else null
            if (canPriceSpecials && extraText.isNotEmpty() && (extra == null || extra < 0)) return Built.Invalid(L("$label: అదనపు ధర సరిగా లేదు", "$label: extra price is not valid"))
            specials += QuoteSpecialMeal(m.type, m.count, m.note, extra?.takeIf { it > 0 })
        }
        if (specials.sumOf { it.count } > plates) return Built.Invalid(L("ప్రత్యేక భోజనాలు ప్లేట్ల కంటే ఎక్కువ ఉండకూడదు", "Special meals cannot be more than the plates"))
        return Built.Ok(
            QuoteRequest(
                menuPackageId = pkg.id,
                plates = plates,
                servingBoys = boys,
                transport = transport,
                replacements = chosenReplacements.toList().filter { k -> pkg.replacements.any { it.key == k } },
                extras = extraList,
                discount = if (discount > 0) discount else null,
                kidsCount = kidsCount,
                specialMeals = specials,
            )
        )
    }

    fun save() {
        if (customerId.isBlank()) {
            saveState = UiState.Error(L("Customer ఎంచుకోండి", "Select a customer"))
            return
        }
        val built = build()
        if (built is Built.Invalid) {
            saveState = UiState.Error(built.message)
            return
        }
        val request = (built as Built.Ok).request
        val validDays = validDaysText.trim().toIntOrNull()
        if (validDays == null || validDays < 1 || validDays > 90) {
            saveState = UiState.Error(L("Validity 1 నుంచి 90 రోజుల మధ్య ఉండాలి", "Validity must be 1 to 90 days"))
            return
        }
        // Booking-less quotations carry the selected branch (contract audit 9).
        val branchForQuote = if (bookingId == null) ServiceLocator.branchManager.currentBranchId.value else null
        if (bookingId == null && branchForQuote == null) {
            saveState = UiState.Error(L("ముందు menu లో branch ఎంచుకోండి", "Select a branch in the menu first"))
            return
        }
        var manual: com.example.suseelacateringcrm.data.remote.ManualOverride? = null
        if (manualTotalText.isNotBlank()) {
            val v = manualTotalText.trim().toDoubleOrNull()
            if (!canOverride) {
                saveState = UiState.Error(L("చేతితో మొత్తం పెట్టే అనుమతి లేదు", "You are not allowed to enter the total by hand"))
                return
            }
            if (v == null || v < 0) {
                saveState = UiState.Error(L("చేతితో పెట్టిన మొత్తం సరిగా లేదు", "The manual total is not a valid number"))
                return
            }
            if (manualReason.trim().length < 3) {
                saveState = UiState.Error(L("చేతితో మార్చిన కారణం రాయండి (కనీసం 3 అక్షరాలు)", "Write the reason for the manual total (at least 3 characters)"))
                return
            }
            manual = com.example.suseelacateringcrm.data.remote.ManualOverride(v, manualReason.trim())
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = quotationRepository.saveQuotation(
                quotationId = null,
                customerId = customerId,
                bookingId = bookingId,
                menuPackageId = request.menuPackageId,
                selections = selections.toList(),
                quote = request,
                validDays = validDays,
                notes = notes,
                manual = manual,
                branchId = branchForQuote,
            ).fold(
                onSuccess = { UiState.Success(it.first) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }
}
