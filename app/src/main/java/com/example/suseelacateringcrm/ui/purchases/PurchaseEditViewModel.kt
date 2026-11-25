package com.example.suseelacateringcrm.ui.purchases

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.model.PAYMENT_METHODS
import com.example.suseelacateringcrm.data.model.PURCHASE_UNITS
import com.example.suseelacateringcrm.data.model.Purchase
import com.example.suseelacateringcrm.data.model.PurchaseItem
import com.example.suseelacateringcrm.data.model.Vendor
import com.example.suseelacateringcrm.data.repository.InventoryRepository
import com.example.suseelacateringcrm.data.repository.PurchaseRepository
import com.example.suseelacateringcrm.data.repository.StaffRepository
import com.example.suseelacateringcrm.data.repository.UserRepository
import com.example.suseelacateringcrm.data.repository.VendorRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class PurchaseEditViewModel(
    private val existingPurchaseId: String?,
    private val prefillName: String?,
    private val prefillCategory: String?,
    private val prefillModule: String?,
    private val prefillUnits: List<String>?,
    private val vendorRepository: VendorRepository = ServiceLocator.vendorRepository,
    private val purchaseRepository: PurchaseRepository = ServiceLocator.purchaseRepository,
    private val inventoryRepository: InventoryRepository = ServiceLocator.inventoryRepository,
    private val staffRepository: StaffRepository = ServiceLocator.staffRepository,
    private val userRepository: UserRepository = ServiceLocator.userRepository,
    private val storage: FirebaseStorage = ServiceLocator.storage,
) : ViewModel() {

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

    var vendorId by mutableStateOf("")
    var vendorName by mutableStateOf("")
    var billNumber by mutableStateOf("")
    var purchaseDate by mutableStateOf<Date?>(Date())
    var purchaseTimeText by mutableStateOf(timeFormat.format(Date()))
    var paymentMethod by mutableStateOf(PAYMENT_METHODS.first())
    /** Server-derived (R7-8); shown read-only. */
    var paymentStatus by mutableStateOf("")
        private set
    var discountText by mutableStateOf("0")
    var otherChargesText by mutableStateOf("0")
    var notes by mutableStateOf("")

    /** R7-1: event (booking/session) or overhead centre; default "general". */
    var costTarget by mutableStateOf(com.example.suseelacateringcrm.data.model.CostTarget())
    private var existingNumber: String = ""

    private val _bookings = MutableStateFlow<List<com.example.suseelacateringcrm.data.model.Booking>>(emptyList())
    val bookings: StateFlow<List<com.example.suseelacateringcrm.data.model.Booking>> = _bookings.asStateFlow()

    var staffUid by mutableStateOf("")
        private set
    var staffName by mutableStateOf("")
        private set
    var staffPhone by mutableStateOf("")
        private set

    var items by mutableStateOf<List<PurchaseItem>>(emptyList())
        private set

    // Draft fields for the "add item" row.
    var itemInventoryItemId by mutableStateOf("")
    var itemDescription by mutableStateOf(prefillName ?: "")
    var itemCategory by mutableStateOf(prefillCategory ?: "")
    var itemModule by mutableStateOf(prefillModule ?: "")
    var allowedUnits: List<String> by mutableStateOf(prefillUnits?.takeIf { it.isNotEmpty() } ?: PURCHASE_UNITS)
        private set
    var itemUnit by mutableStateOf(allowedUnits.first())

    init {
        // Module 2h: pack names the owner added in Settings are offered too (only when the item has no fixed unit list).
        if (prefillUnits.isNullOrEmpty()) {
            viewModelScope.launch {
                val packs = try { com.example.suseelacateringcrm.di.ServiceLocator.settingsRepository.getBusiness()?.uomPacks.orEmpty() } catch (e: Exception) { emptyList() }
                val extra = packs.filter { p -> allowedUnits.none { it.equals(p, ignoreCase = true) } }
                if (extra.isNotEmpty()) allowedUnits = allowedUnits + extra
            }
        }
    }
    var itemQuantityText by mutableStateOf("")
    var itemUnitPriceText by mutableStateOf("")

    var billPhotoUri by mutableStateOf<Uri?>(null)
    var existingBillPhotoUrl by mutableStateOf("")
        private set
    var uploading by mutableStateOf(false)
        private set

    var loading by mutableStateOf(existingPurchaseId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    private val _vendors = MutableStateFlow<List<Vendor>>(emptyList())
    val vendors: StateFlow<List<Vendor>> = _vendors.asStateFlow()

    private val _inventoryItems = MutableStateFlow<List<InventoryItem>>(emptyList())
    val inventoryItems: StateFlow<List<InventoryItem>> = _inventoryItems.asStateFlow()

    val subtotal: Double get() = items.sumOf { it.amount }
    val discount: Double get() = discountText.toDoubleOrNull() ?: 0.0
    val otherCharges: Double get() = otherChargesText.toDoubleOrNull() ?: 0.0
    val grandTotal: Double get() = (subtotal - discount + otherCharges).coerceAtLeast(0.0)

    init {
        launchSafe("PurchaseEditViewModel") { vendorRepository.vendorsFlow().collect { _vendors.value = it } }
        launchSafe("PurchaseEditViewModel") { inventoryRepository.inventoryFlow().collect { _inventoryItems.value = it.filterNot { i -> i.archived } } }
        launchSafe("PurchaseEditViewModel") {
            ServiceLocator.bookingRepository.bookingsFlow(ServiceLocator.branchManager.currentBranchId.value)
                .collect { _bookings.value = it.sortedByDescending { b -> b.eventDate } }
        }
        launchSafe("PurchaseEditViewModel") {
            val uid = ServiceLocator.authRepository.currentUid ?: return@launchSafe
            staffUid = uid
            val staff = staffRepository.getStaffByLinkedUser(uid)
            if (staff != null) {
                staffName = staff.name
                staffPhone = staff.phone
            } else {
                val profile = userRepository.getUserProfile(uid)
                staffName = profile?.name ?: ""
                staffPhone = profile?.phone ?: ""
            }
        }
        if (existingPurchaseId != null) {
            launchSafe("PurchaseEditViewModel", onError = { loading = false }) {
                val existing = purchaseRepository.getPurchase(existingPurchaseId)
                if (existing != null) {
                    vendorId = existing.vendorId
                    vendorName = existing.vendorNameSnapshot
                    billNumber = existing.billNumber
                    purchaseDate = existing.purchaseDate
                    existing.purchaseDate?.let { purchaseTimeText = timeFormat.format(it) }
                    paymentMethod = existing.paymentMethod.ifBlank { PAYMENT_METHODS.first() }
                    paymentStatus = existing.paymentStatus
                    discountText = existing.discount.toString()
                    otherChargesText = existing.otherCharges.toString()
                    notes = existing.notes
                    costTarget = com.example.suseelacateringcrm.data.model.CostTarget.from(existing.costTarget)
                    existingNumber = existing.purchaseNumber
                    items = existing.items
                    existingBillPhotoUrl = existing.billPhotoUrl
                }
                loading = false
            }
        }
    }

    fun selectVendor(vendor: Vendor) {
        vendorId = vendor.id
        vendorName = vendor.name
    }

    fun selectInventoryItemForDraft(item: InventoryItem?) {
        if (item == null) {
            itemInventoryItemId = ""
        } else {
            itemInventoryItemId = item.id
            itemDescription = item.name
        }
    }

    fun addItem() {
        val qty = itemQuantityText.toDoubleOrNull()
        val price = itemUnitPriceText.toDoubleOrNull()
        if (itemDescription.isBlank() || qty == null || qty <= 0 || price == null || price < 0) return
        items = items + PurchaseItem(
            description = itemDescription.trim(),
            category = itemCategory,
            module = itemModule,
            quantity = qty,
            unit = itemUnit,
            unitPrice = price,
            amount = qty * price,
            inventoryItemId = itemInventoryItemId,
        )
        itemInventoryItemId = ""
        itemDescription = ""
        itemCategory = ""
        itemModule = ""
        itemQuantityText = ""
        itemUnitPriceText = ""
    }

    fun removeItem(item: PurchaseItem) {
        items = items - item
    }

    private fun combinedDateTime(): Date {
        val cal = Calendar.getInstance()
        purchaseDate?.let { cal.time = it }
        try {
            val parsed = timeFormat.parse(purchaseTimeText)
            if (parsed != null) {
                val timeCal = Calendar.getInstance().apply { time = parsed }
                cal.set(Calendar.HOUR_OF_DAY, timeCal.get(Calendar.HOUR_OF_DAY))
                cal.set(Calendar.MINUTE, timeCal.get(Calendar.MINUTE))
            }
        } catch (_: Exception) {
            // Keep whatever time purchaseDate already carries.
        }
        return cal.time
    }

    fun save() {
        if (vendorId.isBlank() || items.isEmpty()) {
            saveState = UiState.Error(L("Vendor ఎంచుకుని కనీసం ఒక వస్తువు జోడించండి", "Select a vendor and add at least one item"))
            return
        }
        if (!costTarget.isComplete) {
            saveState = UiState.Error(L("ఏ కార్యక్రమానికో ఎంచుకోండి (లేదా 'సాధారణ ఖర్చు')", "Choose the event (or 'Overhead')"))
            return
        }
        val branchId = ServiceLocator.branchManager.currentBranchId.value
        if (existingPurchaseId == null && branchId == null) {
            saveState = UiState.Error(L("ముందు menu లో branch ఎంచుకోండి", "Select a branch before adding a purchase"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                var photoUrl = existingBillPhotoUrl
                val uri = billPhotoUri
                if (uri != null) {
                    uploading = true
                    // Branch folder per storage.rules (purchases/{branchId}/…, ≤ 5 MB); legacy path if no branch.
                    val folder = ServiceLocator.branchManager.currentBranchId.value
                        ?.let { "purchases/$it" } ?: "purchase_bills"
                    val ref = storage.reference.child("$folder/${System.currentTimeMillis()}.jpg")
                    // Shrink first: ≤ 1600 px JPEG ~80 %, never over 5 MB (storage.rules).
                    val bytes = com.example.suseelacateringcrm.util.ImageCompress.jpegBytes(ServiceLocator.context, uri)
                    ref.putBytes(bytes, com.example.suseelacateringcrm.util.ImageCompress.jpegMetadata).await()
                    photoUrl = ref.downloadUrl.await().toString()
                    uploading = false
                }
                val year = Calendar.getInstance().get(Calendar.YEAR)
                val purchaseNumber = existingNumber.ifBlank { "PUR-$year-${System.currentTimeMillis().toString().takeLast(6)}" }
                val purchase = Purchase(
                    purchaseNumber = purchaseNumber,
                    vendorId = vendorId,
                    vendorNameSnapshot = vendorName,
                    billNumber = billNumber.trim(),
                    purchaseDate = combinedDateTime(),
                    items = items,
                    subtotal = subtotal,
                    discount = discount,
                    otherCharges = otherCharges,
                    totalAmount = grandTotal,
                    paymentMethod = paymentMethod,
                    paymentStatus = paymentStatus,
                    billPhotoUrl = photoUrl,
                    notes = notes.trim(),
                    staffUid = staffUid,
                    staffName = staffName,
                    staffPhone = staffPhone,
                    costTarget = costTarget.toMap(),
                )
                if (existingPurchaseId != null) {
                    purchaseRepository.updatePurchase(existingPurchaseId, purchase, updatedBy = staffUid)
                } else {
                    // R7-2: stock IN for lines with inventoryItemId is done by the server trigger on purchases.
                    purchaseRepository.savePurchase(purchase, createdBy = staffUid, branchId = requireNotNull(branchId))
                }
                UiState.Success(Unit)
            } catch (e: Exception) {
                uploading = false
                UiState.Error(L("కొనుగోలు సేవ్ కాలేదు", "Failed to save purchase") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
