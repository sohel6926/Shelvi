package com.example.suseelacateringcrm.ui.kitchen

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.Dish
import com.example.suseelacateringcrm.data.model.EventType
import com.example.suseelacateringcrm.data.model.GroceryItem
import com.example.suseelacateringcrm.data.model.MenuPackage
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.CookLogEntry
import com.example.suseelacateringcrm.data.remote.CookingPlanItem
import com.example.suseelacateringcrm.data.remote.GroceryNeed
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.KitchenRepository
import com.example.suseelacateringcrm.data.repository.MenuPackageRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.fmtQty
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

data class CookInput(val cookedText: String = "", val leftoverText: String = "")

class KitchenViewModel(
    private val kitchen: KitchenRepository = ServiceLocator.kitchenRepository,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val packageRepository: MenuPackageRepository = ServiceLocator.menuPackageRepository,
) : ViewModel() {

    val role: UserRole? = ServiceLocator.currentRole()
    var tab by mutableStateOf(0)

    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()
    private val _dishes = MutableStateFlow<List<Dish>>(emptyList())
    val dishes: StateFlow<List<Dish>> = _dishes.asStateFlow()
    private val _groceryItems = MutableStateFlow<List<GroceryItem>>(emptyList())
    val groceryItems: StateFlow<List<GroceryItem>> = _groceryItems.asStateFlow()
    private val _packages = MutableStateFlow<List<MenuPackage>>(emptyList())
    val packages: StateFlow<List<MenuPackage>> = _packages.asStateFlow()

    // ---- Cook log ---------------------------------------------------------------------------
    var bookingId by mutableStateOf("")
        private set
    var guestsActualText by mutableStateOf("")
    val cookInputs = mutableStateMapOf<String, CookInput>()
    var cookLogState by mutableStateOf<UiState<String>?>(null)
        private set

    // ---- Cooking guide / grocery list -------------------------------------------------------
    var guestsText by mutableStateOf("")
    var eventType by mutableStateOf(EventType.WEDDING)
    var planPackageId by mutableStateOf("")
    var planState by mutableStateOf<UiState<List<CookingPlanItem>>?>(null)
        private set
    var groceryState by mutableStateOf<UiState<List<GroceryNeed>>?>(null)
        private set

    var addState by mutableStateOf<UiState<Unit>?>(null)
        private set

    private var business by mutableStateOf<com.example.suseelacateringcrm.data.model.BusinessSettings?>(null)
    /** Owner, or a manager when settings.managerCanOverride; never staff. */
    val canOverride: Boolean get() = com.example.suseelacateringcrm.data.model.canOverride(role, business)

    init {
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId
                .flatMapLatest { bookingRepository.bookingsFlow(it) }
                .catchLogged("KitchenViewModel")
                .collect { list ->
                    _bookings.value = list
                        .filter { it.bookingStatus != BookingStatus.CANCELLED }
                        .sortedByDescending { it.eventDate }
                }
        }
        if (role != UserRole.STAFF) {
            // settings/business is not readable by staff (security rules).
            viewModelScope.launch {
                ServiceLocator.settingsRepository.businessFlow().catchLogged("KitchenViewModel").collect { business = it }
            }
        }
        viewModelScope.launch {
            kitchen.dishesFlow().catchLogged("KitchenViewModel").collect { _dishes.value = it.sortedBy { d -> d.name.lowercase() } }
        }
        viewModelScope.launch {
            kitchen.groceryItemsFlow().catchLogged("KitchenViewModel").collect { _groceryItems.value = it.sortedBy { g -> g.name.lowercase() } }
        }
        viewModelScope.launch {
            packageRepository.packagesFlow().catchLogged("KitchenViewModel").collect { _packages.value = it.filter { p -> p.active } }
        }
    }

    fun selectBooking(id: String) {
        bookingId = id
        cookInputs.clear()
        cookLogState = null
        val b = _bookings.value.find { it.id == id }
        guestsActualText = when {
            b == null -> ""
            b.guestCountActual > 0 -> b.guestCountActual.toString()
            b.guestCount > 0 -> b.guestCount.toString()
            else -> ""
        }
        viewModelScope.launch {
            kitchen.cookLogFor(id).forEach { (dishId, pair) ->
                cookInputs[dishId] = CookInput(fmtQty(pair.first), fmtQty(pair.second))
            }
        }
    }

    fun setCook(dishId: String, input: CookInput) {
        cookInputs[dishId] = input
    }

    /** calc-spec §5: cooked > 0 and 0 ≤ leftover ≤ cooked; guests > 0. */
    fun saveCookLog() {
        if (bookingId.isBlank()) {
            cookLogState = UiState.Error(L("ముందు కార్యక్రమం ఎంచుకోండి", "Pick the event first"))
            return
        }
        val guests = guestsActualText.trim().ifBlank { null }?.toIntOrNull()
        if (guestsActualText.isNotBlank() && (guests == null || guests < 1)) {
            cookLogState = UiState.Error(L("వచ్చిన అతిథులు కనీసం 1", "Actual guests must be at least 1"))
            return
        }
        val entries = mutableListOf<CookLogEntry>()
        for ((dishId, input) in cookInputs.toMap()) {
            if (input.cookedText.isBlank() && input.leftoverText.isBlank()) continue
            val name = _dishes.value.find { it.id == dishId }?.name ?: dishId
            val cooked = input.cookedText.trim().toDoubleOrNull()
            val left = input.leftoverText.trim().ifBlank { "0" }.toDoubleOrNull()
            if (cooked == null || cooked <= 0) {
                cookLogState = UiState.Error(L("$name: వండినది 0 కంటే ఎక్కువ ఉండాలి", "$name: cooked must be more than 0"))
                return
            }
            if (left == null || left < 0 || left > cooked) {
                cookLogState = UiState.Error(L("$name: మిగిలింది 0 నుంచి వండినంత వరకే", "$name: leftover must be between 0 and the cooked amount"))
                return
            }
            entries += CookLogEntry(dishId, cooked, left)
        }
        if (entries.isEmpty()) {
            cookLogState = UiState.Error(L("కనీసం ఒక వంటకం నమోదు చేయండి", "Enter at least one dish"))
            return
        }
        viewModelScope.launch {
            cookLogState = UiState.Loading
            cookLogState = kitchen.saveCookLog(bookingId, guests, entries).fold(
                onSuccess = { n -> UiState.Success(L("సేవ్ అయింది. $n వంటకాల లెక్క నేర్చుకున్నాం.", "Saved. Learned quantities for $n dishes.")) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }

    /** Refresh: re-call whichever callables this screen has shown. */
    fun refreshCallables() {
        if (planState is UiState.Success) loadPlan()
        if (groceryState is UiState.Success) loadGroceries()
    }

    /**
     * Manual quantity for one dish: saved for the chosen event with saveCookingPlan
     * (every line of the current plan is sent; only typed lines are manual=true).
     * value == null → back to the automatic quantity.
     */
    suspend fun overridePlanItem(item: CookingPlanItem, manual: com.example.suseelacateringcrm.data.remote.ManualOverride): String? {
        if (bookingId.isBlank()) return L("ముందు కార్యక్రమం (booking) ఎంచుకోండి", "Pick the event (booking) first")
        val list = (planState as? UiState.Success)?.data ?: return L("ముందు గైడ్ చూపించండి", "Show the guide first")
        val updated = list.map { line ->
            if (line.dishId != item.dishId) line
            else if (manual.value == null) line.copy(
                quantity = line.calc.autoValue ?: line.quantity,
                calc = com.example.suseelacateringcrm.data.model.CalcInfo.AUTO,
            )
            else line.copy(
                quantity = manual.value,
                calc = com.example.suseelacateringcrm.data.model.CalcInfo(
                    manual = true,
                    autoValue = line.calc.autoValue ?: line.quantity,
                    byName = L("మీరు", "You"),
                    reason = manual.reason,
                ),
            )
        }
        val lines = updated.map { com.example.suseelacateringcrm.data.remote.PlanLine(it.dishId, it.quantity, it.calc.manual) }
        val err = ServiceLocator.functions.saveCookingPlan(bookingId, lines, manual.reason)
            .exceptionOrNull()?.let { CallableError.from(it).text }
        if (err == null) planState = UiState.Success(updated)
        return err
    }

    private fun guestsOrError(): Int? {
        val g = guestsText.trim().toIntOrNull()
        return if (g == null || g < 1) null else g
    }

    fun loadPlan() {
        val guests = guestsOrError() ?: run {
            planState = UiState.Error(L("అతిథులు కనీసం 1 ఉండాలి", "Guests must be at least 1"))
            return
        }
        val forBooking = bookingId
        viewModelScope.launch {
            planState = UiState.Loading
            val result = kitchen.cookingPlan(guests, eventType.code, planPackageId.ifBlank { null })
            planState = result.fold(
                onSuccess = { items ->
                    // If this event already has a saved plan, show its typed (manual) quantities.
                    val saved = if (forBooking.isBlank()) emptyList() else kitchen.savedPlanFor(forBooking)
                    UiState.Success(mergeSaved(items, saved))
                },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }

    /** Manual lines from the saved plan replace the fresh suggestion; saved dishes missing from it are added. */
    private fun mergeSaved(fresh: List<CookingPlanItem>, saved: List<CookingPlanItem>): List<CookingPlanItem> {
        if (saved.isEmpty()) return fresh
        val manual = saved.filter { it.calc.manual }.associateBy { it.dishId }
        val merged = fresh.map { item ->
            manual[item.dishId]?.let { s ->
                item.copy(quantity = s.quantity, calc = s.calc.copy(autoValue = s.calc.autoValue ?: item.quantity))
            } ?: item
        }
        val extra = manual.values.filter { s -> fresh.none { it.dishId == s.dishId } }
        return merged + extra
    }

    fun loadGroceries() {
        val guests = guestsOrError() ?: run {
            groceryState = UiState.Error(L("అతిథులు కనీసం 1 ఉండాలి", "Guests must be at least 1"))
            return
        }
        viewModelScope.launch {
            groceryState = UiState.Loading
            groceryState = kitchen.groceryList(guests, eventType.code).fold(
                onSuccess = { UiState.Success(it) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }

    /** R7-5: meal session picked inside the booking ("" = whole event). */
    var sessionId by androidx.compose.runtime.mutableStateOf("")
        private set

    /** R7-5: cooking / grocery inputs from one meal session (its guests and package). */
    fun fillFromSession(b: Booking, s: com.example.suseelacateringcrm.data.model.BookingSession?) {
        if (s == null) {
            sessionId = ""
            fillFromBooking(b)
            return
        }
        sessionId = s.id
        guestsText = (s.guestCountConfirmed.takeIf { it > 0 } ?: s.guests).takeIf { it > 0 }?.toString() ?: ""
        eventType = if (b.eventTypeCode.isNotBlank()) EventType.from(b.eventTypeCode) else EventType.guess(b.eventType)
        planPackageId = s.packageId.ifBlank { b.packageId }
        if (tab == 1 && guestsText.isNotBlank()) loadPlan()
    }

    /** Pre-fill the guide from a booking (guests + event type). */
    fun fillFromBooking(b: Booking) {
        sessionId = ""
        guestsText = b.guestCount.takeIf { it > 0 }?.toString() ?: ""
        eventType = if (b.eventTypeCode.isNotBlank()) EventType.from(b.eventTypeCode) else EventType.guess(b.eventType)
        planPackageId = b.packageId
        // Choosing an event loads its plan straight away (fresh suggestion + any saved manual quantities).
        if (tab == 1 && guestsText.isNotBlank()) loadPlan()
    }

    fun addDish(nameTe: String, nameEn: String, unit: String, per100Text: String) {
        val per100 = per100Text.trim().toDoubleOrNull()
        if ((nameTe.isBlank() && nameEn.isBlank()) || per100 == null || per100 <= 0) {
            addState = UiState.Error(L("పేరు, 100 మందికి ఎంత (0 కంటే ఎక్కువ) ఇవ్వండి", "Give a name and a quantity per 100 guests (more than 0)"))
            return
        }
        viewModelScope.launch {
            addState = try {
                kitchen.addDish(nameTe.trim(), nameEn.trim(), unit, per100, "")
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(e.message ?: "")
            }
        }
    }

    fun addGrocery(nameTe: String, nameEn: String, unit: String, per100Text: String) {
        val per100 = per100Text.trim().toDoubleOrNull()
        if ((nameTe.isBlank() && nameEn.isBlank()) || per100 == null || per100 <= 0) {
            addState = UiState.Error(L("పేరు, 100 మందికి ఎంత (0 కంటే ఎక్కువ) ఇవ్వండి", "Give a name and a quantity per 100 guests (more than 0)"))
            return
        }
        viewModelScope.launch {
            addState = try {
                kitchen.addGroceryItem(nameTe.trim(), nameEn.trim(), unit, per100)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(e.message ?: "")
            }
        }
    }

    fun clearAddState() {
        addState = null
    }
}
