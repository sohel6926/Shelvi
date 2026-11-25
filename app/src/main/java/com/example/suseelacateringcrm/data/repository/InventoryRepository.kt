package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.model.StockMovement
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

class InventoryRepository(
    private val firestore: FirebaseFirestore,
    private val functions: com.example.suseelacateringcrm.data.remote.CrmFunctions,
) {

    private fun collection() = firestore.collection(FirestoreCollections.INVENTORY)
    private fun movementsCollection(itemId: String) =
        collection().document(itemId).collection(FirestoreCollections.MOVEMENTS)

    /** branchId == null means unfiltered (admin's "All Branches" combined view). */
    fun inventoryFlow(branchId: String? = null): Flow<List<InventoryItem>> {
        val query: Query = if (branchId != null) collection().whereEqualTo("branchId", branchId) else collection()
        return query.snapshotsFlow().map { it.toObjects(InventoryItem::class.java) }
    }

    fun movementsFlow(itemId: String): Flow<List<StockMovement>> =
        movementsCollection(itemId).snapshotsFlow().map { it.toObjects(StockMovement::class.java) }

    /** Module 2d: batches of one item that still hold stock, earliest expiry first (undated last). */
    fun batchesFlow(itemId: String): Flow<List<com.example.suseelacateringcrm.data.model.StockBatch>> =
        collection().document(itemId).collection("batches").whereGreaterThan("qty", 0).snapshotsFlow().map { snap ->
            snap.documents.map { d ->
                com.example.suseelacateringcrm.data.model.StockBatch(
                    id = d.id,
                    qty = (d.get("qty") as? Number)?.toDouble() ?: 0.0,
                    expiryDay = d.get("expiryDay") as? String ?: "",
                    batchNo = d.get("batchNo") as? String ?: "",
                )
            }.sortedWith(compareBy({ it.expiryDay.isBlank() }, { it.expiryDay }))
        }

    suspend fun getItem(itemId: String): InventoryItem? =
        collection().document(itemId).get().await().toObject(InventoryItem::class.java)

    /**
     * Create/edit item metadata (name, unit, category, reorderLevel). R7-2: never writes
     * quantityInStock — stock only changes through the adjustStock callable.
     */
    suspend fun saveItemMetadata(item: InventoryItem, branchId: String? = null): String {
        val data = mapOf(
            "name" to item.name,
            "unit" to item.unit,
            "category" to item.category,
            "reorderLevel" to item.reorderLevel,
            "lastUpdated" to FieldValue.serverTimestamp(),
        )
        return if (item.id.isBlank()) {
            val createData = data + mapOf(
                "branchId" to requireNotNull(branchId) { "branchId required to create an inventory item" },
                "createdBy" to currentUid(),
            )
            collection().add(createData).await().id
        } else {
            collection().document(item.id).update(data + mapOf("updatedBy" to currentUid())).await()
            item.id
        }
    }

    /** R7-3: no hard delete — archive with a reason via the cancelRecord callable. */
    suspend fun archiveItem(itemId: String, reason: String) {
        functions.cancelRecord(FirestoreCollections.INVENTORY, itemId, reason).getOrThrow()
    }

    /** Open to admin + staff: adjusts stock quantity and records a movement, atomically. */
    /**
     * Stock IN / OUT goes through the `adjustStock` callable (asia-south1): the server updates
     * quantityInStock + writes the movement in one transaction, refuses to go below zero and
     * writes the audit log. Throws [com.example.suseelacateringcrm.data.remote.CallableError]
     * (with Telugu text) on failure. [recordedBy] is kept for call-site compatibility; the server
     * uses the signed-in user.
     */
    @Suppress("UNUSED_PARAMETER")
    suspend fun adjustStock(
        itemId: String,
        type: String,
        quantity: Double,
        reason: String,
        relatedBookingId: String,
        recordedBy: String,
        note: String = "",
        /** Module 2d: on a stock IN for an item that tracks expiry. */
        expiryDay: String = "",
        batchNo: String = "",
    ): Boolean {
        // Module 4d (B5): true = the server kept it as a request for a supervisor; the stock has not changed yet
        val result: Any? = functions.call(
            "adjustStock",
            mapOf(
                "itemId" to itemId,
                "type" to type,
                "quantity" to quantity,
                "reason" to reason,
                "relatedBookingId" to relatedBookingId.ifBlank { null },
                "reasonCode" to reason,
                "note" to note.ifBlank { null },
                "expiryDay" to expiryDay.takeIf { type == "IN" && it.isNotBlank() },
                "batchNo" to batchNo.trim().takeIf { type == "IN" && expiryDay.isNotBlank() && it.isNotBlank() },
            ),
        ).getOrThrow()
        return (result as? Map<*, *>)?.get("pending") == true
    }
}
