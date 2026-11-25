package com.example.suseelacateringcrm.data.model

enum class QuotationStatus(val label: String) {
    DRAFT("Draft"),
    SENT("Sent"),
    ACCEPTED("Accepted"),
    REJECTED("Rejected"),
    EXPIRED("Expired");

    /** QA fix 2: the next steps a person can take (Draft → Sent → Accepted / Rejected). */
    val next: List<QuotationStatus>
        get() = when (this) {
            DRAFT -> listOf(SENT)
            SENT -> listOf(ACCEPTED, REJECTED)
            REJECTED, EXPIRED -> listOf(SENT)
            ACCEPTED -> emptyList()
        }

    companion object {
        fun fromFirestore(value: String?): QuotationStatus =
            entries.find { it.label == value } ?: DRAFT
    }
}
