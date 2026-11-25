package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L

enum class InvoiceStatus(val label: String) {
    DRAFT("Draft"),
    SENT("Sent"),
    PARTIALLY_PAID("PartiallyPaid"),
    PAID("Paid"),
    OVERDUE("Overdue");

    companion object {
        /**
         * The server (calc-spec §2) writes "Partially Paid" with a space; older Android data has
         * "PartiallyPaid". Compare without spaces/case so both read correctly.
         */
        fun fromFirestore(value: String?): InvoiceStatus {
            val v = value?.replace(" ", "")?.lowercase() ?: return DRAFT
            return entries.find { it.label.lowercase() == v } ?: DRAFT
        }
    }
}

fun InvoiceStatus.displayLabel(): String = when (this) {
    InvoiceStatus.DRAFT -> L("డ్రాఫ్ట్", "Draft")
    InvoiceStatus.SENT -> L("పంపాం", "Sent")
    InvoiceStatus.PARTIALLY_PAID -> L("కొంత చెల్లించారు", "Partly paid")
    InvoiceStatus.PAID -> L("పూర్తిగా చెల్లించారు", "Paid")
    InvoiceStatus.OVERDUE -> L("గడువు దాటింది", "Overdue")
}
