package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rMapList
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class InvoiceLineItem(
    val description: String = "",
    val quantity: Double = 0.0,
    val unitPrice: Double = 0.0,
    val amount: Double = 0.0,
) {
    companion object {
        /** Accepts the Android shape (description/quantity/unitPrice) and the calc shape (item/qty/rate). */
        fun fromMap(m: Map<String, Any?>) = InvoiceLineItem(
            description = m.rStr("description").ifBlank { m.rStr("item") },
            quantity = m.rNumOrNull("quantity") ?: m.rNum("qty"),
            unitPrice = m.rNumOrNull("unitPrice") ?: m.rNum("rate"),
            amount = m.rNum("amount"),
        )
    }
}

/**
 * `invoices/{id}`. Every total is written by the `generateInvoiceFromBooking` / `recordPayment`
 * callables (🔒 server-owned); the app only reads them.
 */
data class Invoice(
    @DocumentId val id: String = "",
    val bookingId: String = "",
    val customerId: String = "",
    val invoiceNumber: String = "",
    val issueDate: Date? = null,
    val lineItems: List<InvoiceLineItem> = emptyList(),
    val subtotal: Double = 0.0,
    val gstRate: Double = 0.0,
    @get:PropertyName("isInterState")
    val isInterState: Boolean = false,
    val cgstAmount: Double = 0.0,
    val sgstAmount: Double = 0.0,
    val igstAmount: Double = 0.0,
    val taxAmount: Double = 0.0,
    val discount: Double = 0.0,
    val totalAmount: Double = 0.0,
    val amountPaid: Double = 0.0,
    val balanceDue: Double = 0.0,
    val status: String = InvoiceStatus.DRAFT.label,
    val branchId: String = "",
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Date? = null,
    @ServerTimestamp val updatedAt: Date? = null,
    /** 🔒 "upi://pay?…" string for the QR code, written by the server. */
    val upiQrPayload: String = "",
    /** 🔒 `docTitle` from the server: "Invoice" or "Tax Invoice" (contract decision 4). */
    val documentTitle: String = "",
    /** 🔒 brand / legal-entity line written by the server when legalNameOnDocs is on. */
    val issuerLine: String = "",
    /** Automatic / manual stamp for the total (overrideInvoiceTotal). */
    @get:com.google.firebase.firestore.Exclude
    val calc: CalcInfo = CalcInfo.AUTO,
    /** 🔒 Bill terms copied from settings.invoiceTerms when the invoice was made ("" on older invoices). */
    val terms: String = "",
) {
    @get:com.google.firebase.firestore.Exclude
    val invoiceStatus: InvoiceStatus get() = InvoiceStatus.fromFirestore(status)

    /**
     * "Tax Invoice" vs plain "Invoice": the server's docTitle wins; if it is missing, fall back to
     * settings.gstRegistered (contract decision 4), and to the invoice's own tax when settings are unknown.
     */
    fun isTaxInvoice(gstRegistered: Boolean?): Boolean =
        if (documentTitle.isNotBlank()) documentTitle.contains("tax", ignoreCase = true)
        else gstRegistered ?: (taxAmount > 0.0 || gstRate > 0.0)

    fun titleLabel(gstRegistered: Boolean?): String =
        if (isTaxInvoice(gstRegistered)) L("పన్ను ఇన్వాయిస్ / Tax Invoice", "Tax Invoice") else L("ఇన్వాయిస్ / Invoice", "Invoice")

    companion object {
        /**
         * Reads both field-name styles: the old Android names (cgstAmount, totalAmount …) and the
         * calc-engine names (cgst, total, `totals{…}` …), so server-written invoices show correctly.
         */
        fun fromMap(id: String, m: Map<String, Any?>): Invoice {
            @Suppress("UNCHECKED_CAST")
            val totals = (m["totals"] as? Map<String, Any?>) ?: emptyMap()
            fun money(vararg keys: String): Double {
                for (k in keys) {
                    m.rNumOrNull(k)?.let { return it }
                    totals.rNumOrNull(k)?.let { return it }
                }
                return 0.0
            }
            val total = money("totalAmount", "total")
            val paid = money("amountPaid", "paid")
            return Invoice(
                id = id,
                bookingId = m.rStr("bookingId"),
                customerId = m.rStr("customerId"),
                invoiceNumber = m.rStr("invoiceNumber"),
                issueDate = m.rDate("issueDate") ?: m.rDate("date") ?: m.rDate("createdAt"),
                lineItems = (m.rMapList("lineItems").ifEmpty { m.rMapList("lines") }).map { InvoiceLineItem.fromMap(it) },
                subtotal = money("subtotal"),
                gstRate = money("gstRate"),
                isInterState = m.rBool("isInterState"),
                cgstAmount = money("cgstAmount", "cgst"),
                sgstAmount = money("sgstAmount", "sgst"),
                igstAmount = money("igstAmount", "igst"),
                taxAmount = money("taxAmount", "tax"),
                discount = money("discount"),
                totalAmount = total,
                amountPaid = paid,
                balanceDue = m.rNumOrNull("balanceDue") ?: (total - paid).coerceAtLeast(0.0),
                status = m.rStr("status", InvoiceStatus.DRAFT.label),
                branchId = m.rStr("branchId"),
                createdBy = m.rStr("createdBy"),
                createdAt = m.rDate("createdAt"),
                updatedAt = m.rDate("updatedAt"),
                upiQrPayload = m.rStr("upiQrPayload"),
                documentTitle = m.rStr("docTitle").ifBlank { m.rStr("documentTitle") },
                issuerLine = m.rStr("issuerLine"),
                calc = CalcInfo.fromMap(m),
                terms = m.rStr("terms"),
            )
        }
    }
}
