package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rInt
import com.example.suseelacateringcrm.util.rList
import com.example.suseelacateringcrm.util.rMapList
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

/**
 * One meal session of a multi-session quotation, as saveQuotation stores it in `sessionQuotes[]`
 * (`quoteInput`); older docs used `sessions[]` with `quote`. Needed to re-save (manual / automatic total).
 */
data class QuoteSessionInput(
    val sessionId: String = "",
    val menuPackageId: String = "",
    val selections: List<Int> = emptyList(),
    val quote: Map<String, Any?> = emptyMap(),
) {
    fun toMap(): Map<String, Any?> = mapOf("sessionId" to sessionId, "menuPackageId" to menuPackageId, "selections" to selections, "quote" to quote)

    companion object {
        @Suppress("UNCHECKED_CAST")
        fun listFrom(m: Map<String, Any?>): List<QuoteSessionInput> {
            val raw = m.rMapList("sessionQuotes").ifEmpty { m.rMapList("sessions") }
            return raw.map { s ->
                QuoteSessionInput(
                    sessionId = s.rStr("sessionId"),
                    menuPackageId = s.rStr("menuPackageId"),
                    selections = s.rList("selections").map { (it as? Number)?.toInt() ?: 0 },
                    quote = (s["quoteInput"] as? Map<String, Any?>) ?: (s["quote"] as? Map<String, Any?>) ?: emptyMap(),
                )
            }.filter { it.sessionId.isNotBlank() && it.menuPackageId.isNotBlank() }
        }
    }
}

data class Quotation(
    @DocumentId val id: String = "",
    val bookingId: String = "",
    val customerId: String = "",
    val quotationNumber: String = "",
    val issueDate: Date? = null,
    val validUntil: Date? = null,
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
    val status: String = QuotationStatus.DRAFT.label,
    val branchId: String = "",
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Date? = null,
    @ServerTimestamp val updatedAt: Date? = null,
    /** Set when the quotation was made with the quote builder (`saveQuotation`). */
    val menuPackageId: String = "",
    val platesToCook: Int = 0,
    val freePlates: Int = 0,
    val notes: String = "",
    /** 🔒 "Invoice"-style title from the server ("Quotation" text is added by the UI). */
    val docTitle: String = "",
    /** 🔒 brand / legal-entity line (server, when legalNameOnDocs is on). */
    val issuerLine: String = "",
    @get:com.google.firebase.firestore.Exclude
    val calc: CalcInfo = CalcInfo.AUTO,
    /** The saved quoteMenu request and choices — needed to re-save with a manual total. */
    @get:com.google.firebase.firestore.Exclude
    val quoteRequest: Map<String, Any?> = emptyMap(),
    @get:com.google.firebase.firestore.Exclude
    val selections: List<Int> = emptyList(),
    /** R7-10 🔒 version number (bumped and reset to Draft when a Sent / Accepted quotation is re-saved). */
    val version: Int = 1,
    /** R7-5 per-session inputs (multi-session quotations); empty for a one-menu quotation. */
    val sessionQuotes: List<QuoteSessionInput> = emptyList(),
) {
    @get:com.google.firebase.firestore.Exclude
    val quotationStatus: QuotationStatus get() = QuotationStatus.fromFirestore(status)

    companion object {
        /** Reads both the old Android field names and the calc-engine names (see Invoice.fromMap). */
        fun fromMap(id: String, m: Map<String, Any?>): Quotation {
            @Suppress("UNCHECKED_CAST")
            val totals = (m["totals"] as? Map<String, Any?>) ?: emptyMap()
            @Suppress("UNCHECKED_CAST")
            val quote = (m["quoteInput"] as? Map<String, Any?>) ?: (m["quote"] as? Map<String, Any?>) ?: emptyMap()  // server field is quoteInput (contract audit 6)
            fun money(vararg keys: String): Double {
                for (k in keys) {
                    m.rNumOrNull(k)?.let { return it }
                    totals.rNumOrNull(k)?.let { return it }
                }
                return 0.0
            }
            return Quotation(
                id = id,
                bookingId = m.rStr("bookingId"),
                customerId = m.rStr("customerId"),
                quotationNumber = m.rStr("quotationNumber"),
                issueDate = m.rDate("issueDate") ?: m.rDate("createdAt"),
                validUntil = m.rDate("validUntil"),
                lineItems = (m.rMapList("lineItems").ifEmpty { m.rMapList("lines") }).map { InvoiceLineItem.fromMap(it) },
                subtotal = money("subtotal"),
                gstRate = money("gstRate"),
                isInterState = m.rBool("isInterState"),
                cgstAmount = money("cgstAmount", "cgst"),
                sgstAmount = money("sgstAmount", "sgst"),
                igstAmount = money("igstAmount", "igst"),
                taxAmount = money("taxAmount", "tax"),
                discount = m.rNumOrNull("discount") ?: quote.rNum("discount"),
                totalAmount = money("totalAmount", "total"),
                status = m.rStr("status", QuotationStatus.DRAFT.label),
                branchId = m.rStr("branchId"),
                createdBy = m.rStr("createdBy"),
                createdAt = m.rDate("createdAt"),
                updatedAt = m.rDate("updatedAt"),
                menuPackageId = m.rStr("menuPackageId"),
                platesToCook = m.rInt("platesToCook"),
                freePlates = m.rInt("freePlates"),
                notes = m.rStr("notes"),
                docTitle = m.rStr("docTitle"),
                issuerLine = m.rStr("issuerLine"),
                calc = CalcInfo.fromMap(m),
                quoteRequest = quote,
                selections = m.rList("selections").map { (it as? Number)?.toInt() ?: 0 },
                version = m.rInt("version").takeIf { it > 0 } ?: 1,
                sessionQuotes = QuoteSessionInput.listFrom(m),
            )
        }
    }
}
