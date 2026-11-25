package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L

/**
 * Who pays for a purchase / expense / outside order (api-contract R7-1):
 * an event (booking, optional meal session) or an overhead centre. Required on create.
 */
data class CostTarget(
    val type: String = TYPE_OVERHEAD,
    val bookingId: String = "",
    val sessionId: String = "",
    val centre: String = "general",
) {
    val isBooking: Boolean get() = type == TYPE_BOOKING

    fun toMap(): Map<String, Any?> =
        if (isBooking) buildMap {
            put("type", TYPE_BOOKING)
            put("bookingId", bookingId)
            if (sessionId.isNotBlank()) put("sessionId", sessionId)
        } else mapOf("type" to TYPE_OVERHEAD, "centre" to centre.ifBlank { "general" })

    /** Valid to save: a booking target needs a booking id. */
    val isComplete: Boolean get() = !isBooking || bookingId.isNotBlank()

    companion object {
        const val TYPE_BOOKING = "booking"
        const val TYPE_OVERHEAD = "overhead"

        val CENTRES = listOf("kitchen-rent", "utilities", "office", "marketing", "vehicles", "maintenance", "general")

        fun centreLabel(c: String): String = when (c) {
            "kitchen-rent" -> L("వంటగది అద్దె", "Kitchen rent")
            "utilities" -> L("కరెంట్ / నీళ్ళు", "Utilities")
            "office" -> L("ఆఫీస్", "Office")
            "marketing" -> L("ప్రచారం", "Marketing")
            "vehicles" -> L("వాహనాలు", "Vehicles")
            "maintenance" -> L("మరమ్మతులు", "Maintenance")
            else -> L("సాధారణ", "General")
        }

        /** Old untagged docs count as overhead "general". [legacyBookingId] = old expense.bookingId. */
        fun from(raw: Any?, legacyBookingId: String = ""): CostTarget {
            val m = raw as? Map<*, *>
            if (m == null) {
                return if (legacyBookingId.isNotBlank()) CostTarget(TYPE_BOOKING, legacyBookingId) else CostTarget()
            }
            return if (m["type"] == TYPE_BOOKING) CostTarget(
                type = TYPE_BOOKING,
                bookingId = m["bookingId"]?.toString() ?: "",
                sessionId = m["sessionId"]?.toString() ?: "",
            ) else CostTarget(centre = m["centre"]?.toString()?.takeIf { it in CENTRES } ?: "general")
        }
    }
}
