package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

/** Per-collection (totalDocs, updatedDocs) from a backfill run. */
data class BackfillResult(val counts: Map<String, Pair<Int, Int>>)

/** Collections that carry a branchId field and need backfilling onto a default branch. */
private val BRANCH_SCOPED_COLLECTIONS = listOf(
    FirestoreCollections.BOOKINGS,
    FirestoreCollections.INVENTORY,
    FirestoreCollections.STAFF,
    FirestoreCollections.INVOICES,
    FirestoreCollections.QUOTATIONS,
    FirestoreCollections.PURCHASES,
    FirestoreCollections.EXPENSES,
)

class BranchRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.BRANCHES)

    fun branchesFlow(): Flow<List<Branch>> =
        collection().snapshotsFlow().map { it.toObjects(Branch::class.java) }

    fun activeBranchesFlow(): Flow<List<Branch>> =
        collection().whereEqualTo("active", true).snapshotsFlow()
            .map { it.toObjects(Branch::class.java) }

    suspend fun getBranch(branchId: String): Branch? =
        collection().document(branchId).get().await().toObject(Branch::class.java)

    suspend fun saveBranch(branch: Branch): String {
        return if (branch.id.isBlank()) {
            val data = mapOf(
                "name" to branch.name,
                "address" to branch.address,
                "phone" to branch.phone,
                "active" to branch.active,
                "createdAt" to FieldValue.serverTimestamp(),
                "createdBy" to currentUid(),
            )
            collection().add(data).await().id
        } else {
            val data = mapOf(
                "name" to branch.name,
                "address" to branch.address,
                "phone" to branch.phone,
                "active" to branch.active,
                "updatedBy" to currentUid(),
            )
            collection().document(branch.id).update(data).await()
            branch.id
        }
    }

    suspend fun setActive(branchId: String, active: Boolean) {
        collection().document(branchId).update(mapOf("active" to active, "updatedBy" to currentUid())).await()
    }

    /**
     * Idempotent: only touches documents where branchId is blank/missing, so re-running
     * after a full backfill is a safe no-op (and doubles as verification — 0 updated == done).
     */
    suspend fun backfillDefaultBranch(defaultBranchId: String): BackfillResult {
        val counts = mutableMapOf<String, Pair<Int, Int>>()

        for (collectionName in BRANCH_SCOPED_COLLECTIONS) {
            val snapshot = firestore.collection(collectionName).get().await()
            val missing = snapshot.documents.filter { it.getString("branchId").isNullOrBlank() }
            missing.chunked(400).forEach { chunk ->
                val batch = firestore.batch()
                chunk.forEach { doc -> batch.update(doc.reference, "branchId", defaultBranchId) }
                batch.commit().await()
            }
            counts[collectionName] = snapshot.size() to missing.size
        }

        // Payments are nested under invoices and can't be listed top-level; backfill per-parent
        // invoice using that invoice's (now-set) branchId, falling back to the default branch.
        var paymentsTotal = 0
        var paymentsUpdated = 0
        val invoiceDocs = firestore.collection(FirestoreCollections.INVOICES).get().await()
        for (invoiceDoc in invoiceDocs.documents) {
            val invoiceBranchId = invoiceDoc.getString("branchId")?.ifBlank { null } ?: defaultBranchId
            val paymentsSnapshot = invoiceDoc.reference.collection(FirestoreCollections.PAYMENTS).get().await()
            val missingPayments = paymentsSnapshot.documents.filter { it.getString("branchId").isNullOrBlank() }
            paymentsTotal += paymentsSnapshot.size()
            paymentsUpdated += missingPayments.size
            missingPayments.chunked(400).forEach { chunk ->
                val batch = firestore.batch()
                chunk.forEach { doc -> batch.update(doc.reference, "branchId", invoiceBranchId) }
                batch.commit().await()
            }
        }
        counts[FirestoreCollections.PAYMENTS] = paymentsTotal to paymentsUpdated

        return BackfillResult(counts)
    }
}
