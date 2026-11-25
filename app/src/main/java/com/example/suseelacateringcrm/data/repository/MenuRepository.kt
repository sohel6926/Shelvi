package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.MenuItem
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

class MenuRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.MENU_ITEMS)

    fun menuItemsFlow(): Flow<List<MenuItem>> =
        collection().snapshotsFlow().map { it.toObjects(MenuItem::class.java) }

    suspend fun getMenuItem(itemId: String): MenuItem? =
        collection().document(itemId).get().await().toObject(MenuItem::class.java)

    private fun recipeIngredientsData(item: MenuItem) = item.recipeIngredients.map {
        mapOf(
            "inventoryItemId" to it.inventoryItemId,
            "inventoryItemName" to it.inventoryItemName,
            "quantityPerPlate" to it.quantityPerPlate,
            "unit" to it.unit,
        )
    }

    suspend fun saveMenuItem(item: MenuItem): String {
        return if (item.id.isBlank()) {
            val data = mapOf(
                "name" to item.name,
                "category" to item.category,
                "isPackage" to item.isPackage,
                "includedItemIds" to item.includedItemIds,
                "pricePerPlate" to item.pricePerPlate,
                "isVeg" to item.isVeg,
                "isActive" to item.isActive,
                "recipeIngredients" to recipeIngredientsData(item),
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
                "createdBy" to currentUid(),
            )
            collection().add(data).await().id
        } else {
            val data = mapOf(
                "name" to item.name,
                "category" to item.category,
                "isPackage" to item.isPackage,
                "includedItemIds" to item.includedItemIds,
                "pricePerPlate" to item.pricePerPlate,
                "isVeg" to item.isVeg,
                "isActive" to item.isActive,
                "recipeIngredients" to recipeIngredientsData(item),
                "updatedAt" to FieldValue.serverTimestamp(),
                "updatedBy" to currentUid(),
            )
            collection().document(item.id).update(data).await()
            item.id
        }
    }

    /** R7-3: archive (cancelRecord callable), never a client delete. */
    suspend fun archiveMenuItem(itemId: String, reason: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .cancelRecord(FirestoreCollections.MENU_ITEMS, itemId, reason).getOrThrow()
    }
}
