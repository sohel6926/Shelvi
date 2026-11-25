package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr
import com.google.firebase.firestore.DocumentId
import java.util.Date

enum class PaymentMethod(val label: String, val te: String) {
    CASH("Cash", "నగదు"),
    UPI("UPI", "UPI"),
    BANK_TRANSFER("BankTransfer", "బ్యాంక్ ట్రాన్స్‌ఫర్"),
    CARD("Card", "కార్డ్"),
    OTHER("Other", "ఇతర");

    val displayLabel: String get() = com.example.suseelacateringcrm.util.L(te, label)

    companion object {
        fun fromFirestore(value: String?): PaymentMethod =
            entries.find { it.label == value } ?: OTHER
    }
}

data class Payment(
    @DocumentId val id: String = "",
    val invoiceId: String = "",
    val invoiceNumberSnapshot: String = "",
    val customerNameSnapshot: String = "",
    val amount: Double = 0.0,
    val date: Date? = null,
    val method: String = PaymentMethod.CASH.label,
    val note: String = "",
    val recordedBy: String = "",
    val recordedByName: String = "",
    val branchId: String = "",
    /** "refund" for refunds/adjustments (stored as a negative amount by the server). */
    val type: String = "",
) {
    companion object {
        /** `date` may be a Timestamp (old Android) or "YYYY-MM-DD" (recordPayment callable). */
        fun fromMap(id: String, m: Map<String, Any?>) = Payment(
            id = id,
            invoiceId = m.rStr("invoiceId"),
            invoiceNumberSnapshot = m.rStr("invoiceNumberSnapshot"),
            customerNameSnapshot = m.rStr("customerNameSnapshot"),
            amount = m.rNum("amount"),
            date = m.rDate("date") ?: m.rDate("recordedAt") ?: m.rDate("createdAt"),
            method = m.rStr("method", PaymentMethod.CASH.label),
            note = m.rStr("note"),
            recordedBy = m.rStr("recordedBy"),
            recordedByName = m.rStr("recordedByName"),
            branchId = m.rStr("branchId"),
            type = m.rStr("type"),
        )
    }
}
