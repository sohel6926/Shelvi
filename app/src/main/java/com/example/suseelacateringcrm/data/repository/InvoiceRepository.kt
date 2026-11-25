package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Invoice
import com.example.suseelacateringcrm.data.model.Payment
import com.example.suseelacateringcrm.data.remote.CrmFunctions
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.PaymentResult
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

/**
 * Invoices are read from Firestore but CREATED and PAID only through Cloud Functions
 * (`generateInvoiceFromBooking`, `recordPayment`) — the server computes every rupee
 * (docs/calc-spec.md §1, §2). The old client-side totals and payment transaction were removed.
 */
class InvoiceRepository(
    private val firestore: FirebaseFirestore,
    private val functions: CrmFunctions,
    /** Branch a manager is locked to — list queries must filter on it (security rules). Null for admin. */
    private val branchScope: () -> String? = { null },
) {

    private fun collection() = firestore.collection(FirestoreCollections.INVOICES)
    private fun paymentsCollection(invoiceId: String) =
        collection().document(invoiceId).collection(FirestoreCollections.PAYMENTS)

    /** branchId == null means unfiltered (admin's "All Branches" combined view). */
    fun invoicesFlow(branchId: String? = null): Flow<List<Invoice>> {
        val query: Query = if (branchId != null) collection().whereEqualTo("branchId", branchId) else collection()
        return query.snapshotsFlow().map { snap -> snap.documents.map { Invoice.fromMap(it.id, it.data ?: emptyMap()) } }
    }

    /** QA fix 4: invoices of one booking (manager: also filtered by branch, as the rules need). */
    fun invoicesForBookingFlow(bookingId: String): Flow<List<Invoice>> {
        val branch = branchScope()
        val base = collection().whereEqualTo("bookingId", bookingId)
        val query: Query = if (branch != null) base.whereEqualTo("branchId", branch) else base
        return query.snapshotsFlow().map { snap -> snap.documents.map { Invoice.fromMap(it.id, it.data ?: emptyMap()) } }
    }

    fun invoiceFlow(invoiceId: String): Flow<Invoice?> =
        collection().document(invoiceId).snapshotsFlow().map { snapshot ->
            if (snapshot.exists()) Invoice.fromMap(snapshot.id, snapshot.data ?: emptyMap()) else null
        }

    fun paymentsFlow(invoiceId: String): Flow<List<Payment>> {
        val branch = branchScope()
        val query: Query = if (branch != null) paymentsCollection(invoiceId).whereEqualTo("branchId", branch)
        else paymentsCollection(invoiceId)
        return query.snapshotsFlow().map { snap ->
            snap.documents.map { Payment.fromMap(it.id, it.data ?: emptyMap()) }
        }
    }

    fun allPaymentsFlow(branchId: String? = null): Flow<List<Payment>> {
        val query: Query = if (branchId != null) {
            firestore.collectionGroup(FirestoreCollections.PAYMENTS).whereEqualTo("branchId", branchId)
        } else {
            firestore.collectionGroup(FirestoreCollections.PAYMENTS)
        }
        return query.snapshotsFlow().map { snap -> snap.documents.map { Payment.fromMap(it.id, it.data ?: emptyMap()) } }
    }

    /** Server builds line items from the booking's quotation / menuSnapshot. Returns (invoiceId, invoiceNumber). */
    suspend fun generateInvoiceFromBooking(bookingId: String): Result<Pair<String, String>> =
        functions.generateInvoiceFromBooking(bookingId)

    /** One server transaction (calc-spec §2). [date] is "YYYY-MM-DD". */
    suspend fun recordPayment(
        invoiceId: String,
        amount: Double,
        method: String,
        date: String,
        note: String,
    ): Result<PaymentResult> = functions.recordPayment(invoiceId, amount, method, date, note)

    /**
     * Manual status change — Draft / Sent / Overdue only. Paid / Partially Paid are set by the
     * server from payments (security rules reject them from the app).
     */
    suspend fun updateInvoiceStatus(invoiceId: String, status: String) {
        require(status in setOf("Draft", "Sent", "Overdue")) { "Paid status comes from recordPayment" }
        collection().document(invoiceId).update(
            mapOf("status" to status, "updatedAt" to FieldValue.serverTimestamp(), "updatedBy" to currentUid())
        ).await()
    }
}
