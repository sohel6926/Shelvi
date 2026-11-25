package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class MenuSnapshotItem(
    val itemId: String = "",
    val name: String = "",
    val pricePerPlate: Double = 0.0,
)

/**
 * One meal inside a booking (R7-5), e.g. మెహందీ డిన్నర్ / పెళ్ళి టిఫిన్. Dates "YYYY-MM-DD",
 * serveTime "HH:MM", status planned | done | cancelled.
 */
/** R10-11: special meals inside a booking / session. type no-onion-garlic | jain | allergy | diabetic | other. */
data class SpecialMeal(val type: String = "other", val count: Int = 0, val note: String = "") {
    fun toMap(): Map<String, Any?> = mapOf("type" to type, "count" to count, "note" to note)

    companion object {
        val TYPES = listOf("no-onion-garlic", "jain", "allergy", "diabetic", "other")

        fun typeLabel(t: String): String = when (t) {
            "no-onion-garlic" -> com.example.suseelacateringcrm.util.L("ఉల్లి-వెల్లుల్లి లేకుండా", "No onion-garlic")
            "jain" -> com.example.suseelacateringcrm.util.L("జైన్", "Jain")
            "allergy" -> com.example.suseelacateringcrm.util.L("అలర్జీ", "Allergy")
            "diabetic" -> com.example.suseelacateringcrm.util.L("షుగర్ (డయాబెటిక్)", "Diabetic")
            else -> com.example.suseelacateringcrm.util.L("ఇతర", "Other")
        }
    }
}

data class BookingSession(
    val id: String = "",
    val nameTe: String = "",
    val nameEn: String = "",
    val date: String = "",
    val serveTime: String = "",
    val mealType: String = "lunch",
    val packageId: String = "",
    val guests: Int = 0,
    val guestCountConfirmed: Int = 0,
    val guestCountActual: Int = 0,
    val travelMinutes: Int = 45,
    val status: String = "planned",
    /** Round 8: banthi | buffet | other (needed for the cooking plan). */
    val serviceStyle: String = "",
    /** R10-11 */
    val kidsCount: Int = 0,
    val specialMeals: List<SpecialMeal> = emptyList(),
) {
    @get:com.google.firebase.firestore.Exclude
    val name: String get() = com.example.suseelacateringcrm.util.L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })

    fun toMap(): Map<String, Any?> = mapOf(
        "id" to id, "nameTe" to nameTe, "nameEn" to nameEn, "date" to date, "serveTime" to serveTime,
        "mealType" to mealType, "packageId" to packageId, "guests" to guests,
        "guestCountConfirmed" to guestCountConfirmed, "guestCountActual" to guestCountActual,
        "travelMinutes" to travelMinutes, "status" to status,
    ) + (if (serviceStyle.isNotBlank()) mapOf("serviceStyle" to serviceStyle) else emptyMap()) + mapOf(
        "kidsCount" to kidsCount,
        "specialMeals" to specialMeals.filter { it.count > 0 }.map { it.toMap() },
    )
}

data class Booking(
    @DocumentId val id: String = "",
    val customerId: String = "",
    val customerNameSnapshot: String = "",
    val eventDate: Date? = null,
    val eventType: String = "",
    val venue: String = "",
    val guestCount: Int = 0,
    val menuItemIds: List<String> = emptyList(),
    val menuSnapshot: List<MenuSnapshotItem> = emptyList(),
    val status: String = BookingStatus.INQUIRY.label,
    val assignedStaffIds: List<String> = emptyList(),
    val totalAmount: Double = 0.0,
    val advancePaid: Double = 0.0,
    val notes: String = "",
    /** wedding | annadanam | housewarming | office | other (calc-spec §5). Older bookings: blank. */
    val eventTypeCode: String = "",
    val packageId: String = "",
    val guestCountActual: Int = 0,
    /** Serving time "HH:MM" (24 h) — drives the service timeline (calc §12). Blank = default. */
    val serveTime: String = "",
    /** Minutes to drive to the venue (default 45). */
    val travelMinutes: Int = 45,
    /** tiffin | lunch | dinner | lunch-dinner | other (from the menu package). */
    val mealType: String = "",
    /** R7-5 meal sessions; empty = a single-meal booking (works as before). */
    val sessions: List<BookingSession> = emptyList(),
    /** Round 8: banthi (బంతి భోజనం) | buffet | other. */
    val serviceStyle: String = "",
    /** R10-11: kids plates and special meals. */
    val kidsCount: Int = 0,
    val specialMeals: List<SpecialMeal> = emptyList(),
    /** R7-3 */
    val cancelReason: String = "",
    /** R7-9: set by closeEvent (server-only) — { at, by, profit… }. Booking is frozen while present. */
    val closed: Map<String, Any?>? = null,
    /** Round 9 (server-only): cancel { reasonCode, reason, by, at, refund, charge }, kept advance, status before. */
    val cancel: Map<String, Any?>? = null,
    val cancellationCharge: Double = 0.0,
    val previousStatus: String = "",
    val branchId: String = "",
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Date? = null,
    @ServerTimestamp val updatedAt: Date? = null,
) {
    @get:com.google.firebase.firestore.Exclude
    val bookingStatus: BookingStatus get() = BookingStatus.fromFirestore(status)
}
