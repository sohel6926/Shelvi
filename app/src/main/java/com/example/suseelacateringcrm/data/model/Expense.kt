package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

object ExpenseSections {
    const val OUTSIDE_PURCHASE = "Outside Purchase"
    const val STAFF_ADVANCE = "Staff Advance"
    const val TEMP_STAFF = "Temporary Staff"
    const val CLEANING = "Cleaning Department"
    const val TRANSPORT = "Transport"
    const val UTILITY_BILL = "Utility Bill"
    const val RENT = "Rent / Fixed Expense"
    const val LIVE_COUNTER = "Live Counter"
    const val OTHER = "Other Expense"

    val all = listOf(
        OUTSIDE_PURCHASE, STAFF_ADVANCE, TEMP_STAFF, CLEANING, TRANSPORT,
        UTILITY_BILL, RENT, LIVE_COUNTER, OTHER,
    )
}

val EXPENSE_PAYMENT_STATUSES = listOf("Unpaid", "Advance Paid", "Partially Paid", "Fully Paid", "Settled", "Cancelled")
val EXPENSE_PAYMENT_METHODS = listOf("Cash", "UPI", "Card", "Bank Transfer", "Credit")

val OUTSIDE_PURCHASE_TYPES = listOf(
    "Small Pulka", "Big Pulka", "Rumali Roti", "Small Rumali Roti", "Big Rumali Roti",
    "Regular Bobbatlu", "Small Bobbatlu", "Big Bobbatlu", "Special Bobbatlu",
    "Ice Cream Cup", "Ice Cream Tub", "Kulfi", "Ice Cream Cone", "Chocobar", "Bulk Ice Cream",
    "Ghee (Outside)", "Gas (Outside)",
    "Sweet Pan", "Normal Pan", "Meetha Pan", "Special Pan", "Chocolate Pan", "Fire Pan", "Other Pan",
)
val UTILITY_BILL_TYPES = listOf("Current Bill", "WiFi Bill", "Water Bill", "Phone Bill", "Gas Bill", "Other Utility Bill")
val RENT_TYPES = listOf("Shop Rent", "Kitchen Rent", "Godown Rent", "Office Rent", "Equipment Rent", "Vehicle Rent", "Other Rent")
val LIVE_COUNTER_TYPES = listOf(
    "Dosa Counter", "Pulka Counter", "Rumali Roti Counter", "Chat Counter", "Pan Counter",
    "Ice Cream Counter", "Juice Counter", "Tea Counter", "Coffee Counter", "Sweet Counter",
    "Chinese Counter", "Tandoori Counter", "Other Live Counter",
)
val TEMP_STAFF_ROLES = listOf(
    "Server", "Cook", "Helper", "Cleaner", "Driver", "Supervisor",
    "Dish Washing Staff", "Counter Staff", "Live Counter Staff", "Temporary Worker",
)
val VEHICLE_TYPES = listOf("Auto", "Bike", "Car", "Van", "Tata Ace", "Dost", "Pickup", "Mini Truck", "Truck", "Other")

/** Which extra sub-category picker (if any) a section uses when the staff is filling the entry form. */
fun subCategoryOptionsFor(section: String): List<String> = when (section) {
    ExpenseSections.OUTSIDE_PURCHASE -> OUTSIDE_PURCHASE_TYPES
    ExpenseSections.UTILITY_BILL -> UTILITY_BILL_TYPES
    ExpenseSections.RENT -> RENT_TYPES
    ExpenseSections.LIVE_COUNTER -> LIVE_COUNTER_TYPES
    ExpenseSections.TEMP_STAFF -> TEMP_STAFF_ROLES
    else -> emptyList()
}

data class Expense(
    @DocumentId val id: String = "",
    val expenseNumber: String = "",
    val section: String = "",
    val subCategory: String = "",
    val personName: String = "",
    val mobileNumber: String = "",

    val quantity: Double = 0.0,
    val unit: String = "",
    val rate: Double = 0.0,
    val numberOfStaff: Double = 0.0,
    val numberOfDays: Double = 0.0,

    val vehicleType: String = "",
    val vehicleNumber: String = "",
    val fromLocation: String = "",
    val toLocation: String = "",
    val tripCount: Double = 0.0,

    val transportCharges: Double = 0.0,
    val setupCharges: Double = 0.0,
    val otherCharges: Double = 0.0,
    val subtotal: Double = 0.0,
    val totalAmount: Double = 0.0,
    val advancePaid: Double = 0.0,
    val balanceAmount: Double = 0.0,

    val paymentStatus: String = "",
    val paymentMethod: String = "",
    val billNumber: String = "",
    val billMonth: String = "",

    val serviceDate: Date? = null,
    val dueDate: Date? = null,
    val paidDate: Date? = null,

    val bookingId: String = "",
    val bookingLabel: String = "",

    val staffUid: String = "",
    val staffName: String = "",
    val staffPhone: String = "",

    val receiptPhotoUrl: String = "",
    val notes: String = "",

    @get:PropertyName("isDeleted")
    val isDeleted: Boolean = false,
    val deletedBy: String = "",
    /** R7-1 cost target (see CostTarget). */
    val costTarget: Map<String, Any?>? = null,
    /** R7-3: "Cancelled" when cancelled through cancelRecord. */
    val status: String = "",
    val cancelReason: String = "",
    val branchId: String = "",
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Date? = null,
    val updatedBy: String = "",
    @ServerTimestamp val updatedAt: Date? = null,
)
