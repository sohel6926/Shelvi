package com.example.suseelacateringcrm.ui.expenses

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.EXPENSE_PAYMENT_METHODS
import com.example.suseelacateringcrm.data.model.Expense
import com.example.suseelacateringcrm.data.model.ExpenseSections
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.ExpenseRepository
import com.example.suseelacateringcrm.data.repository.StaffRepository
import com.example.suseelacateringcrm.data.repository.UserRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Calendar
import java.util.Date
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class ExpenseEntryViewModel(
    private val existingExpenseId: String?,
    prefillSection: String?,
    prefillSubCategory: String?,
    private val expenseRepository: ExpenseRepository = ServiceLocator.expenseRepository,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val staffRepository: StaffRepository = ServiceLocator.staffRepository,
    private val userRepository: UserRepository = ServiceLocator.userRepository,
    private val storage: FirebaseStorage = ServiceLocator.storage,
) : ViewModel() {

    // Staff advances are no longer expenses — they go on the staff page (recovered from salary).
    var section by mutableStateOf(prefillSection?.takeUnless { it == ExpenseSections.STAFF_ADVANCE } ?: ExpenseSections.OTHER)
    var subCategory by mutableStateOf(prefillSubCategory ?: "")
    var personName by mutableStateOf("")
    var mobileNumber by mutableStateOf("")

    var quantityText by mutableStateOf("")
    var unit by mutableStateOf("")
    var rateText by mutableStateOf("")
    var numberOfStaffText by mutableStateOf("")
    var numberOfDaysText by mutableStateOf("")

    var vehicleType by mutableStateOf("")
    var vehicleNumber by mutableStateOf("")
    var fromLocation by mutableStateOf("")
    var toLocation by mutableStateOf("")
    var tripCountText by mutableStateOf("")

    var transportChargesText by mutableStateOf("0")
    var setupChargesText by mutableStateOf("0")
    var otherChargesText by mutableStateOf("0")
    var totalAmountText by mutableStateOf("0")
    var autoTotal by mutableStateOf(true)
    var advancePaidText by mutableStateOf("0")

    /** Server-derived (R7-8); shown read-only, never written. */
    var paymentStatus by mutableStateOf("")
        private set
    var paymentMethod by mutableStateOf(EXPENSE_PAYMENT_METHODS.first())
    var billNumber by mutableStateOf("")
    var billMonth by mutableStateOf("")

    var serviceDate by mutableStateOf<Date?>(Date())
    var dueDate by mutableStateOf<Date?>(null)
    var paidDate by mutableStateOf<Date?>(null)

    var bookingId by mutableStateOf("")
    var bookingLabel by mutableStateOf("")

    /** R7-1: event (booking/session) or overhead centre. Default "general". */
    var costTarget by mutableStateOf(com.example.suseelacateringcrm.data.model.CostTarget())
        private set
    private var existingNumber: String = ""

    var notes by mutableStateOf("")
    var receiptPhotoUri by mutableStateOf<Uri?>(null)
    var existingReceiptPhotoUrl by mutableStateOf("")
        private set
    var uploading by mutableStateOf(false)
        private set

    var staffUid by mutableStateOf("")
        private set
    var staffName by mutableStateOf("")
        private set
    var staffPhone by mutableStateOf("")
        private set

    var loading by mutableStateOf(existingExpenseId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    private val _bookings = MutableStateFlow<List<Booking>>(emptyList())
    val bookings: StateFlow<List<Booking>> = _bookings.asStateFlow()

    private val _knownPersons = MutableStateFlow<List<Pair<String, String>>>(emptyList())
    val knownPersons: StateFlow<List<Pair<String, String>>> = _knownPersons.asStateFlow()

    val computedSubtotal: Double
        get() {
            val qty = quantityText.toDoubleOrNull() ?: 0.0
            val rate = rateText.toDoubleOrNull() ?: 0.0
            return qty * rate
        }
    val transportCharges: Double get() = transportChargesText.toDoubleOrNull() ?: 0.0
    val setupCharges: Double get() = setupChargesText.toDoubleOrNull() ?: 0.0
    val otherCharges: Double get() = otherChargesText.toDoubleOrNull() ?: 0.0
    val totalAmount: Double get() = totalAmountText.toDoubleOrNull() ?: 0.0
    val advancePaid: Double get() = advancePaidText.toDoubleOrNull() ?: 0.0
    val balanceAmount: Double get() = (totalAmount - advancePaid).coerceAtLeast(0.0)

    init {
        val branchId = ServiceLocator.branchManager.currentBranchId.value
        viewModelScope.launch { bookingRepository.bookingsFlow(branchId).collect { _bookings.value = it } }
        viewModelScope.launch {
            expenseRepository.expensesFlow(branchId).collect { expenses ->
                _knownPersons.value = expenses
                    .filter { it.personName.isNotBlank() }
                    .distinctBy { it.personName.lowercase() }
                    .map { it.personName to it.mobileNumber }
            }
        }
        launchSafe("ExpenseEntryViewModel") {
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
        if (existingExpenseId != null) {
            launchSafe("ExpenseEntryViewModel", onError = { loading = false }) {
                val existing = expenseRepository.getExpense(existingExpenseId)
                if (existing != null) {
                    section = existing.section
                    subCategory = existing.subCategory
                    personName = existing.personName
                    mobileNumber = existing.mobileNumber
                    quantityText = if (existing.quantity == 0.0) "" else existing.quantity.toString()
                    unit = existing.unit
                    rateText = if (existing.rate == 0.0) "" else existing.rate.toString()
                    numberOfStaffText = if (existing.numberOfStaff == 0.0) "" else existing.numberOfStaff.toString()
                    numberOfDaysText = if (existing.numberOfDays == 0.0) "" else existing.numberOfDays.toString()
                    vehicleType = existing.vehicleType
                    vehicleNumber = existing.vehicleNumber
                    fromLocation = existing.fromLocation
                    toLocation = existing.toLocation
                    tripCountText = if (existing.tripCount == 0.0) "" else existing.tripCount.toString()
                    transportChargesText = existing.transportCharges.toString()
                    setupChargesText = existing.setupCharges.toString()
                    otherChargesText = existing.otherCharges.toString()
                    totalAmountText = existing.totalAmount.toString()
                    autoTotal = false
                    advancePaidText = existing.advancePaid.toString()
                    paymentStatus = existing.paymentStatus
                    paymentMethod = existing.paymentMethod.ifBlank { EXPENSE_PAYMENT_METHODS.first() }
                    billNumber = existing.billNumber
                    billMonth = existing.billMonth
                    serviceDate = existing.serviceDate
                    dueDate = existing.dueDate
                    paidDate = existing.paidDate
                    bookingId = existing.bookingId
                    bookingLabel = existing.bookingLabel
                    costTarget = com.example.suseelacateringcrm.data.model.CostTarget.from(existing.costTarget, existing.bookingId)
                    existingNumber = existing.expenseNumber
                    notes = existing.notes
                    existingReceiptPhotoUrl = existing.receiptPhotoUrl
                }
                loading = false
            }
        }
    }

    private fun recomputeTotal() {
        if (autoTotal) {
            totalAmountText = (computedSubtotal + transportCharges + setupCharges + otherCharges).toString()
        }
    }

    fun onQuantityChanged(value: String) { quantityText = value; recomputeTotal() }
    fun onRateChanged(value: String) { rateText = value; recomputeTotal() }
    fun onTransportChargesChanged(value: String) { transportChargesText = value; recomputeTotal() }
    fun onSetupChargesChanged(value: String) { setupChargesText = value; recomputeTotal() }
    fun onOtherChargesChanged(value: String) { otherChargesText = value; recomputeTotal() }
    fun onTotalAmountEditedManually(value: String) { totalAmountText = value; autoTotal = false }

    fun selectPerson(name: String, mobile: String) {
        personName = name
        mobileNumber = mobile
    }

    /** R7-1 picker: keeps the legacy bookingId / bookingLabel in step for old screens. */
    fun selectCostTarget(target: com.example.suseelacateringcrm.data.model.CostTarget) {
        costTarget = target
        if (target.isBooking) selectBooking(_bookings.value.find { it.id == target.bookingId }) else selectBooking(null)
    }

    fun selectBooking(booking: Booking?) {
        if (booking == null) {
            bookingId = ""
            bookingLabel = ""
        } else {
            bookingId = booking.id
            bookingLabel = "${booking.customerNameSnapshot} · ${booking.eventType}".trim(' ', '·')
        }
    }

    fun save() {
        if (existingExpenseId == null && section == ExpenseSections.STAFF_ADVANCE) {
            saveState = UiState.Error(L("సిబ్బంది అడ్వాన్స్ → సిబ్బంది page లో 'అడ్వాన్స్' ఇవ్వండి", "Give staff advances on the Staff page ('Advance')"))
            return
        }
        if (totalAmount <= 0) {
            saveState = UiState.Error(L("సరైన మొత్తం రాయండి", "Enter a valid total amount"))
            return
        }
        if (serviceDate == null) {
            saveState = UiState.Error(L("తేదీ ఎంచుకోండి", "Select a date"))
            return
        }
        if (!costTarget.isComplete) {
            saveState = UiState.Error(L("ఏ కార్యక్రమానికో ఎంచుకోండి (లేదా 'సాధారణ ఖర్చు')", "Choose the event (or 'Overhead')"))
            return
        }
        val branchId = ServiceLocator.branchManager.currentBranchId.value
        if (existingExpenseId == null && branchId == null) {
            saveState = UiState.Error(L("ముందు menu లో branch ఎంచుకోండి", "Select a branch before adding an expense"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                var photoUrl = existingReceiptPhotoUrl
                val uri = receiptPhotoUri
                if (uri != null) {
                    uploading = true
                    // Branch folder per storage.rules (expenses/{branchId}/…, ≤ 5 MB); legacy path if no branch.
                    val folder = (branchId ?: ServiceLocator.branchManager.currentBranchId.value)
                        ?.let { "expenses/$it" } ?: "expense_receipts"
                    val ref = storage.reference.child("$folder/${System.currentTimeMillis()}.jpg")
                    // Shrink first: ≤ 1600 px JPEG ~80 %, never over 5 MB (storage.rules).
                    val bytes = com.example.suseelacateringcrm.util.ImageCompress.jpegBytes(ServiceLocator.context, uri)
                    ref.putBytes(bytes, com.example.suseelacateringcrm.util.ImageCompress.jpegMetadata).await()
                    photoUrl = ref.downloadUrl.await().toString()
                    uploading = false
                }
                val year = Calendar.getInstance().get(Calendar.YEAR)
                val expenseNumber = existingNumber.ifBlank { "EXP-$year-${System.currentTimeMillis().toString().takeLast(6)}" }
                val expense = Expense(
                    expenseNumber = expenseNumber,
                    section = section,
                    subCategory = subCategory.trim(),
                    personName = personName.trim(),
                    mobileNumber = mobileNumber.trim(),
                    quantity = quantityText.toDoubleOrNull() ?: 0.0,
                    unit = unit,
                    rate = rateText.toDoubleOrNull() ?: 0.0,
                    numberOfStaff = numberOfStaffText.toDoubleOrNull() ?: 0.0,
                    numberOfDays = numberOfDaysText.toDoubleOrNull() ?: 0.0,
                    vehicleType = vehicleType,
                    vehicleNumber = vehicleNumber.trim(),
                    fromLocation = fromLocation.trim(),
                    toLocation = toLocation.trim(),
                    tripCount = tripCountText.toDoubleOrNull() ?: 0.0,
                    transportCharges = transportCharges,
                    setupCharges = setupCharges,
                    otherCharges = otherCharges,
                    subtotal = computedSubtotal,
                    totalAmount = totalAmount,
                    advancePaid = advancePaid,
                    balanceAmount = balanceAmount,
                    paymentMethod = paymentMethod,
                    billNumber = billNumber.trim(),
                    billMonth = billMonth.trim(),
                    serviceDate = serviceDate,
                    dueDate = dueDate,
                    paidDate = paidDate,
                    bookingId = bookingId,
                    bookingLabel = bookingLabel,
                    staffUid = staffUid,
                    staffName = staffName,
                    staffPhone = staffPhone,
                    receiptPhotoUrl = photoUrl,
                    notes = notes.trim(),
                    costTarget = costTarget.toMap(),
                )
                if (existingExpenseId != null) {
                    expenseRepository.updateExpense(existingExpenseId, expense, updatedBy = staffUid)
                } else {
                    expenseRepository.saveExpense(expense, createdBy = staffUid, branchId = requireNotNull(branchId))
                }
                UiState.Success(Unit)
            } catch (e: Exception) {
                uploading = false
                UiState.Error(L("ఖర్చు సేవ్ కాలేదు", "Failed to save expense") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
