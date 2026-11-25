package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Quotation
import com.example.suseelacateringcrm.data.remote.CrmFunctions
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.QuoteRequest
import com.example.suseelacateringcrm.data.remote.QuoteResult
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

/**
 * Quotations are priced and saved by the `quoteMenu` / `saveQuotation` callables (calc-spec §11).
 * The old client-side `generateQuotationFromBooking` (which also used the wrong GST order) was removed.
 */
class QuotationRepository(
    private val firestore: FirebaseFirestore,
    private val functions: CrmFunctions,
) {

    private fun collection() = firestore.collection(FirestoreCollections.QUOTATIONS)

    /** branchId == null means unfiltered (admin's "All Branches" combined view). */
    fun quotationsFlow(branchId: String? = null): Flow<List<Quotation>> {
        val query: Query = if (branchId != null) collection().whereEqualTo("branchId", branchId) else collection()
        return query.snapshotsFlow().map { snap -> snap.documents.map { Quotation.fromMap(it.id, it.data ?: emptyMap()) } }
    }

    /** QA fix 4: quotations of one booking; branchId set (manager) = also filtered by branch. */
    fun quotationsForBookingFlow(bookingId: String, branchId: String?): Flow<List<Quotation>> {
        val base = collection().whereEqualTo("bookingId", bookingId)
        val query: Query = if (branchId != null) base.whereEqualTo("branchId", branchId) else base
        return query.snapshotsFlow().map { snap -> snap.documents.map { Quotation.fromMap(it.id, it.data ?: emptyMap()) } }
    }

    fun quotationFlow(quotationId: String): Flow<Quotation?> =
        collection().document(quotationId).snapshotsFlow().map { snapshot ->
            if (snapshot.exists()) Quotation.fromMap(snapshot.id, snapshot.data ?: emptyMap()) else null
        }

    suspend fun quote(request: QuoteRequest): Result<QuoteResult> = functions.quoteMenu(request)

    /** Returns (quotationId, quotationNumber). Totals are recomputed on the server. */
    suspend fun saveQuotation(
        quotationId: String?,
        customerId: String,
        bookingId: String?,
        menuPackageId: String,
        selections: List<Int>,
        quote: QuoteRequest,
        validDays: Int,
        notes: String?,
        manual: com.example.suseelacateringcrm.data.remote.ManualOverride? = null,
        branchId: String? = null,
    ): Result<Pair<String, String>> =
        functions.saveQuotation(quotationId, customerId, bookingId, menuPackageId, selections, quote, validDays, notes, manual, branchId)

    suspend fun updateStatus(quotationId: String, status: String) {
        collection().document(quotationId).update(
            mapOf("status" to status, "updatedAt" to FieldValue.serverTimestamp(), "updatedBy" to currentUid())
        ).await()
    }
}
