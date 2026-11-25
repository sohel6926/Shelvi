package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.OtherPurchaseItem
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class OtherPurchaseItemRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.OTHER_PURCHASE_ITEMS)

    fun itemsFlow(): Flow<List<OtherPurchaseItem>> =
        collection().snapshotsFlow().map { it.toObjects(OtherPurchaseItem::class.java) }

    /** Throws if an item with the same name (case-insensitive) already exists — enforces the "one master item" rule. */
    suspend fun addItem(item: OtherPurchaseItem, createdBy: String): String {
        val existing = collection().get().await().toObjects(OtherPurchaseItem::class.java)
        if (existing.any { it.name.trim().equals(item.name.trim(), ignoreCase = true) }) {
            error("\"${item.name}\" already exists in Other Items")
        }
        val data = mapOf(
            "name" to item.name.trim(),
            "category" to item.category.trim(),
            "unit" to item.unit,
            "defaultSupplierName" to item.defaultSupplierName.trim(),
            "notes" to item.notes.trim(),
            "createdBy" to createdBy,
            "createdAt" to FieldValue.serverTimestamp(),
        )
        return collection().add(data).await().id
    }

    suspend fun deleteItem(itemId: String) {
        collection().document(itemId).delete().await()
    }
}
