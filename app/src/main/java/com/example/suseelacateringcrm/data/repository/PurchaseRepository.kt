package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Purchase
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * @param ownerScope staff login → their uid (firestore.rules costDocReadOk lets staff read only the
 * purchases they created, so their lists ask for `createdBy == uid`); null for admin / manager.
 */
class PurchaseRepository(
    private val firestore: FirebaseFirestore,
    private val ownerScope: () -> String? = { null },
) {

    private fun collection() = firestore.collection(FirestoreCollections.PURCHASES)

    /**
     * Live, non-deleted purchases only — soft-deleted rows are filtered out client-side.
     * branchId == null means unfiltered (admin's "All Branches" combined view).
     */
    fun purchasesFlow(branchId: String? = null, includeCancelled: Boolean = false): Flow<List<Purchase>> {
        val owner = ownerScope()
        val query: Query = when {
            // QA fix 1: staff see only their own entries ("నా ఎంట్రీలు"); a branch-wide query is denied.
            owner != null -> collection().whereEqualTo("createdBy", owner)
            branchId != null -> collection().whereEqualTo("branchId", branchId)
            else -> collection()
        }
        return query.snapshotsFlow().map { snapshot ->
            snapshot.toObjects(Purchase::class.java)
                .filter { !it.isDeleted && (includeCancelled || !it.status.equals("Cancelled", ignoreCase = true)) }
        }
    }

    suspend fun getPurchase(purchaseId: String): Purchase? =
        collection().document(purchaseId).get().await().toObject(Purchase::class.java)

    private fun purchaseFieldsMap(purchase: Purchase): Map<String, Any?> = mapOf(
        "purchaseNumber" to purchase.purchaseNumber,
        "vendorId" to purchase.vendorId,
        "vendorNameSnapshot" to purchase.vendorNameSnapshot,
        "billNumber" to purchase.billNumber,
        "purchaseDate" to (purchase.purchaseDate ?: Date()),
        "items" to purchase.items.map {
            mapOf(
                "description" to it.description,
                "category" to it.category,
                "module" to it.module,
                "quantity" to it.quantity,
                "unit" to it.unit,
                "unitPrice" to it.unitPrice,
                "amount" to it.amount,
                "inventoryItemId" to it.inventoryItemId,
            )
        },
        "subtotal" to purchase.subtotal,
        "discount" to purchase.discount,
        "otherCharges" to purchase.otherCharges,
        "totalAmount" to purchase.totalAmount,
        "paymentMethod" to purchase.paymentMethod,
        // R7-8: paymentStatus / paid / balance are server-derived (vendorPayments) — never written here.
        "billPhotoUrl" to purchase.billPhotoUrl,
        "notes" to purchase.notes,
        "staffUid" to purchase.staffUid,
        "staffName" to purchase.staffName,
        "staffPhone" to purchase.staffPhone,
        // R7-1: required on create; old docs without it count as overhead "general".
        "costTarget" to (purchase.costTarget ?: com.example.suseelacateringcrm.data.model.CostTarget().toMap()),
    )

    suspend fun savePurchase(purchase: Purchase, createdBy: String, branchId: String): String {
        val data = purchaseFieldsMap(purchase) + mapOf(
            "isDeleted" to false,
            "branchId" to branchId,
            "createdBy" to createdBy,
            "createdAt" to FieldValue.serverTimestamp(),
        )
        return collection().add(data).await().id
    }

    suspend fun updatePurchase(purchaseId: String, purchase: Purchase, updatedBy: String) {
        val data = purchaseFieldsMap(purchase) + mapOf(
            "updatedBy" to updatedBy,
            "updatedAt" to FieldValue.serverTimestamp(),
        )
        collection().document(purchaseId).update(data).await()
    }

    /** R7-3: cancel with a reason (server sets status Cancelled and reverses stock). */
    suspend fun cancelPurchase(purchaseId: String, reason: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .cancelRecord(FirestoreCollections.PURCHASES, purchaseId, reason).getOrThrow()
    }
}
