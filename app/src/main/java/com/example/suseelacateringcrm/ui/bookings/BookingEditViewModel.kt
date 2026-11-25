package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.Customer
import com.example.suseelacateringcrm.data.model.MenuItem
import com.example.suseelacateringcrm.data.model.MenuSnapshotItem
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.CustomerRepository
import com.example.suseelacateringcrm.data.repository.MenuRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Date
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class BookingEditViewModel(
    private val bookingId: String?,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val customerRepository: CustomerRepository = ServiceLocator.customerRepository,
    private val menuRepository: MenuRepository = ServiceLocator.menuRepository,
) : ViewModel() {

    var customerId by mutableStateOf("")
    var customerName by mutableStateOf("")
    var eventDate by mutableStateOf<Date?>(null)
    var eventType by mutableStateOf("")
    /** wedding | annadanam | housewarming | office | other — drives cooking factors (default wedding). */
    var eventTypeCode by mutableStateOf(com.example.suseelacateringcrm.data.model.EventType.WEDDING.code)
    var venue by mutableStateOf("")
    /** Service timeline inputs (api-contract Round 6 C). */
    var mealType by mutableStateOf("lunch")
        private set
    var serveTime by mutableStateOf(formServeTimeDefault(null, "lunch"))
        private set
    var travelMinutesText by mutableStateOf("45")
    /** Round 8: banthi | buffet | other — needed for the cooking plan. */
    var serviceStyle by mutableStateOf("")
    /** R10-11 */
    var kidsCount by mutableStateOf(0)
    var specialMeals by mutableStateOf<List<com.example.suseelacateringcrm.data.model.SpecialMeal>>(emptyList())
    /** deliveryWindow of the booking's menu package (for the default serve time). */
    private var packageWindow: String? = null
    private var serveTimeTouched = false

    fun selectMealType(type: String) {
        mealType = type
        if (!serveTimeTouched) serveTime = formServeTimeDefault(packageWindow, type)
    }

    fun pickServeTime(hour: Int, minute: Int) {
        serveTime = "%02d:%02d".format(java.util.Locale.US, hour, minute)
        serveTimeTouched = true
    }
    var guestCountText by mutableStateOf("")
    var selectedMenuItemIds by mutableStateOf<List<String>>(emptyList())
    var status by mutableStateOf(BookingStatus.INQUIRY)
    var totalAmountText by mutableStateOf("")
    var advancePaidText by mutableStateOf("")
    var notes by mutableStateOf("")
    var autoTotal by mutableStateOf(true)
    private var assignedStaffIds: List<String> = emptyList()

    /** R7-5 meal sessions. */
    var sessions by mutableStateOf<List<com.example.suseelacateringcrm.data.model.BookingSession>>(emptyList())
        private set
    private var hadSessions = false
    /** Closed or cancelled bookings are frozen (rules deny edits). */
    var locked by mutableStateOf(false)
        private set

    fun saveSession(s: com.example.suseelacateringcrm.data.model.BookingSession) {
        sessions = if (sessions.any { it.id == s.id }) sessions.map { if (it.id == s.id) s else it } else sessions + s
        syncFromSessions()
    }

    fun removeSession(id: String) {
        sessions = sessions.filterNot { it.id == id }
        syncFromSessions()
    }

    /** Guests = Σ session guests, date = earliest session date (server keeps the same in sync). */
    private fun syncFromSessions() {
        if (sessions.isEmpty()) return
        guestCountText = sessions.sumOf { it.guests }.toString()
        sessions.map { it.date }.filter { it.length >= 10 }.minOrNull()
            ?.let { com.example.suseelacateringcrm.util.DayKey.parse(it) }?.let { eventDate = it }
        if (autoTotal) totalAmountText = computedTotal.toString()
    }

    var loading by mutableStateOf(bookingId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    private val _customers = MutableStateFlow<List<Customer>>(emptyList())
    val customers: StateFlow<List<Customer>> = _customers.asStateFlow()

    private val _menuItems = MutableStateFlow<List<MenuItem>>(emptyList())
    val menuItems: StateFlow<List<MenuItem>> = _menuItems.asStateFlow()

    /** Active menu packages for the package picker. */
    private val _packages = MutableStateFlow<List<com.example.suseelacateringcrm.data.model.MenuPackage>>(emptyList())
    val packages: StateFlow<List<com.example.suseelacateringcrm.data.model.MenuPackage>> = _packages.asStateFlow()

    /** Menu package of this booking ("" = none). Saved as bookings.packageId. */
    var packageId by mutableStateOf("")
        private set

    /**
     * Rough estimate (same rule as the web form): guests × (package plate price + extra menu items).
     * The real price comes from the quotation (server).
     */
    val computedTotal: Double
        get() {
            val guestCount = guestCountText.toIntOrNull() ?: 0
            val packagePrice = _packages.value.find { it.id == packageId }?.pricePerPlate ?: 0.0
            val pricePerPlateSum = _menuItems.value
                .filter { it.id in selectedMenuItemIds }
                .sumOf { it.pricePerPlate }
            if (sessions.isNotEmpty()) {
                // Each session at its own package price (else the booking's package) + extra items.
                return sessions.sumOf { s ->
                    val p = _packages.value.find { it.id == s.packageId }?.pricePerPlate ?: packagePrice
                    s.guests * (p + pricePerPlateSum)
                }
            }
            return guestCount * (packagePrice + pricePerPlateSum)
        }

    fun choosePackage(id: String) {
        packageId = id
        val pkg = _packages.value.find { it.id == id }
        packageWindow = pkg?.deliveryWindow
        if (pkg != null) mealType = pkg.mealType
        if (!serveTimeTouched) serveTime = formServeTimeDefault(packageWindow, mealType)
        if (autoTotal) totalAmountText = computedTotal.toString()
    }

    init {
        viewModelScope.launch {
            customerRepository.customersFlow().catchLogged("BookingEditViewModel").collect { _customers.value = it }
        }
        viewModelScope.launch {
            ServiceLocator.menuPackageRepository.packagesFlow().catchLogged("BookingEditViewModel").collect { list ->
                _packages.value = list.filter { it.active }.sortedWith(compareBy({ it.mealType }, { it.code }))
                if (autoTotal) totalAmountText = computedTotal.toString()
            }
        }
        viewModelScope.launch {
            menuRepository.menuItemsFlow().catchLogged("BookingEditViewModel").collect { items ->
                _menuItems.value = items.filter { it.isActive }
                if (autoTotal) totalAmountText = computedTotal.toString()
            }
        }
        if (bookingId != null) {
            launchSafe("BookingEditViewModel", onError = { loading = false }) {
                val existing = bookingRepository.getBooking(bookingId)
                if (existing != null) {
                    bookingBranchId = existing.branchId.ifBlank { null }
                    customerId = existing.customerId
                    customerName = existing.customerNameSnapshot
                    eventDate = existing.eventDate
                    eventType = existing.eventType
                    eventTypeCode = existing.eventTypeCode.ifBlank {
                        com.example.suseelacateringcrm.data.model.EventType.guess(existing.eventType).code
                    }
                    venue = existing.venue
                    guestCountText = existing.guestCount.toString()
                    selectedMenuItemIds = existing.menuItemIds
                    status = existing.bookingStatus
                    totalAmountText = existing.totalAmount.toString()
                    advancePaidText = existing.advancePaid.toString()
                    notes = existing.notes
                    assignedStaffIds = existing.assignedStaffIds
                    sessions = existing.sessions
                    hadSessions = existing.sessions.isNotEmpty()
                    locked = existing.closed != null ||
                        existing.bookingStatus == BookingStatus.CANCELLED || existing.bookingStatus == BookingStatus.CLOSED
                    autoTotal = false
                    travelMinutesText = existing.travelMinutes.toString()
                    serviceStyle = existing.serviceStyle
                    kidsCount = existing.kidsCount
                    specialMeals = existing.specialMeals
                    // Meal type and default serve time come from the menu package when there is one.
                    val pkg = existing.packageId.takeIf { it.isNotBlank() }?.let {
                        try { ServiceLocator.menuPackageRepository.getPackage(it) } catch (e: Exception) { null }
                    }
                    packageId = existing.packageId
                    packageWindow = pkg?.deliveryWindow
                    mealType = existing.mealType.ifBlank { pkg?.mealType ?: "lunch" }
                    if (existing.serveTime.isNotBlank()) {
                        serveTime = existing.serveTime
                        serveTimeTouched = true
                    } else {
                        serveTime = formServeTimeDefault(packageWindow, mealType)
                    }
                }
                loading = false
            }
        }
    }

    fun selectCustomer(customer: Customer) {
        customerId = customer.id
        customerName = customer.name
    }

    fun toggleMenuItem(itemId: String) {
        selectedMenuItemIds = if (itemId in selectedMenuItemIds) selectedMenuItemIds - itemId else selectedMenuItemIds + itemId
        if (autoTotal) totalAmountText = computedTotal.toString()
    }

    fun onGuestCountChanged(value: String) {
        guestCountText = value
        if (autoTotal) totalAmountText = computedTotal.toString()
    }

    fun onTotalAmountEditedManually(value: String) {
        totalAmountText = value
        autoTotal = false
    }

    /** Branch of the booking being edited (the branch menu may be "all branches" for the owner). */
    private var bookingBranchId: String? = null

    /** Name of the brand this branch sells under when it is veg only, else "" (the branch's first brand, as on the web). */
    private suspend fun vegOnlyBrandName(branchId: String?): String {
        if (branchId.isNullOrBlank()) return ""
        return try {
            val db = ServiceLocator.firestore
            val branch = db.collection("branches").document(branchId).get().await()
            val brandId = (branch.get("brandIds") as? List<*>)?.firstOrNull() as? String ?: return ""
            val brand = db.collection("brands").document(brandId).get().await()
            if (brand.getBoolean("vegOnly") == true) (brand.getString("name") ?: "—") else ""
        } catch (e: Exception) {
            "" // the server-side allergen sheet still warns; do not block a save because this lookup failed
        }
    }

    fun save() {
        if (locked) {
            saveState = UiState.Error(L("ముగించిన / రద్దైన కార్యక్రమం మార్చలేం.", "A closed or cancelled event can't be edited."))
            return
        }
        if (status == BookingStatus.CANCELLED || status == BookingStatus.CLOSED) {
            saveState = UiState.Error(L("రద్దు / ముగించడం booking పేజీలోని బటన్‌తో చేయండి.", "Cancel or close from the booking page buttons."))
            return
        }
        syncFromSessions()
        val guestCount = guestCountText.toIntOrNull()
        val totalAmount = totalAmountText.toDoubleOrNull()
        if (customerId.isBlank() || guestCount == null || guestCount <= 0 || eventDate == null || totalAmount == null) {
            saveState = UiState.Error(
                com.example.suseelacateringcrm.util.L(
                    "Customer, తేదీ ఎంచుకోండి; అతిథులు కనీసం 1 ఉండాలి",
                    "Select a customer and event date; guests must be at least 1",
                )
            )
            return
        }
        if (serviceStyle.isBlank()) {
            saveState = UiState.Error(L("వడ్డన విధానం (బంతి భోజనం / బఫే) ఎంచుకోండి", "Choose the service style (banthi / buffet)"))
            return
        }
        val travelMinutes = travelMinutesText.trim().ifBlank { "45" }.toIntOrNull()
        if (travelMinutes == null || travelMinutes !in 0..300) {
            saveState = UiState.Error(L("ప్రయాణ సమయం 0 నుంచి 300 నిమిషాలు", "Travel time must be 0 to 300 minutes"))
            return
        }
        val branchId = ServiceLocator.branchManager.currentBranchId.value
        if (bookingId == null && branchId == null) {
            saveState = UiState.Error(L("ముందు menu లో branch ఎంచుకోండి", "Select a branch before creating a booking"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                // Module 6a: a veg-only brand does not sell a non-veg dish
                val nonVeg = _menuItems.value.filter { it.id in selectedMenuItemIds && !it.isVeg }
                if (nonVeg.isNotEmpty()) {
                    val vegBrand = vegOnlyBrandName(bookingBranchId ?: branchId)
                    if (vegBrand.isNotEmpty()) {
                        val names = nonVeg.joinToString(", ") { it.name }
                        saveState = UiState.Error(
                            L("\"$vegBrand\" శాకాహార బ్రాండ్ — ఈ మాంసాహార వంటకాలు తీసేయండి: $names", "\"$vegBrand\" is a veg-only brand — remove these non-veg dishes: $names"),
                        )
                        return@launch
                    }
                }
                val menuSnapshot = _menuItems.value
                    .filter { it.id in selectedMenuItemIds }
                    .map { MenuSnapshotItem(itemId = it.id, name = it.name, pricePerPlate = it.pricePerPlate) }
                val booking = Booking(
                    id = bookingId ?: "",
                    customerId = customerId,
                    customerNameSnapshot = customerName,
                    eventDate = eventDate,
                    eventType = eventType.trim(),
                    eventTypeCode = eventTypeCode,
                    venue = venue.trim(),
                    guestCount = guestCount,
                    menuItemIds = selectedMenuItemIds,
                    menuSnapshot = menuSnapshot,
                    status = status.label,
                    assignedStaffIds = assignedStaffIds,
                    totalAmount = totalAmount,
                    advancePaid = advancePaidText.toDoubleOrNull() ?: 0.0,
                    notes = notes.trim(),
                    serveTime = serveTime,
                    travelMinutes = travelMinutes,
                    packageId = packageId,
                    mealType = mealType,
                    sessions = sessions,
                    serviceStyle = serviceStyle,
                    kidsCount = kidsCount,
                    specialMeals = specialMeals.filter { it.count > 0 },
                )
                bookingRepository.saveBooking(
                    booking,
                    createdBy = ServiceLocator.authRepository.currentUid ?: "",
                    branchId = branchId,
                    clearSessions = hadSessions && sessions.isEmpty(),
                )
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("Booking సేవ్ కాలేదు", "Failed to save booking") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}

/**
 * Starting value for the serving-time picker only (package deliveryWindow start, else by meal — same rule as
 * api-contract Round 6 C). The timeline itself is computed by the server (getServiceTimeline).
 */
private fun formServeTimeDefault(deliveryWindow: String?, mealType: String?): String {
    val start = deliveryWindow?.trim()?.take(5)
    if (start != null && Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(start)) return start
    return when (mealType) {
        "tiffin" -> "08:00"
        "lunch" -> "12:00"
        "dinner" -> "19:30"
        else -> "12:00"
    }
}
