package com.example.suseelacateringcrm.data.model

enum class BookingStatus(val label: String) {
    INQUIRY("Inquiry"),
    CONFIRMED("Confirmed"),
    IN_PROGRESS("InProgress"),
    COMPLETED("Completed"),
    /** R7-9: closed by the owner after the checklist (locked; reopen with a reason). */
    CLOSED("Closed"),
    CANCELLED("Cancelled");

    companion object {
        fun fromFirestore(value: String?): BookingStatus =
            entries.find { it.label == value } ?: INQUIRY
    }
}
