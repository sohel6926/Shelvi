package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Dish
import com.example.suseelacateringcrm.data.model.GroceryItem
import com.example.suseelacateringcrm.data.remote.CookLogEntry
import com.example.suseelacateringcrm.data.remote.CookingPlanItem
import com.example.suseelacateringcrm.data.remote.CrmFunctions
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.GroceryNeed
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

/** Dishes, grocery items, after-event cook logs and the cooking / grocery callables (calc-spec §5, §6). */
class KitchenRepository(
    private val firestore: FirebaseFirestore,
    private val functions: CrmFunctions,
) {
    private fun dishes() = firestore.collection(FirestoreCollections.DISHES)
    private fun groceries() = firestore.collection(FirestoreCollections.GROCERY_ITEMS)

    fun dishesFlow(): Flow<List<Dish>> =
        dishes().snapshotsFlow().map { snap -> snap.documents.map { Dish.fromMap(it.id, it.data ?: emptyMap()) } }

    fun groceryItemsFlow(): Flow<List<GroceryItem>> =
        groceries().snapshotsFlow().map { snap -> snap.documents.map { GroceryItem.fromMap(it.id, it.data ?: emptyMap()) } }

    /** Admin adds a dish with its starting quantity per 100 guests. `learned` is server-owned. */
    suspend fun addDish(nameTe: String, nameEn: String, unit: String, basePer100: Double, category: String): String =
        dishes().add(
            mapOf(
                "nameTe" to nameTe,
                "nameEn" to nameEn,
                "unit" to unit,
                "basePer100" to basePer100,
                "category" to category,
                "createdAt" to FieldValue.serverTimestamp(),
                "createdBy" to currentUid(),
            )
        ).await().id

    /**
     * Round 8: owner / manager edit the dish role, starting per-100 and typed starting recipe
     * ([{ groceryItemId, perUnit }]). `learned` / `recipe` stay server-only.
     */
    suspend fun updateDishRecipe(
        dishId: String,
        role: String,
        basePer100: Double,
        typed: List<com.example.suseelacateringcrm.data.model.TypedRecipeLine>,
        startRules: List<com.example.suseelacateringcrm.data.model.StartRule>,
    ) {
        dishes().document(dishId).update(
            mapOf(
                "role" to role.ifBlank { "other" },
                "basePer100" to basePer100,
                "typedRecipe" to typed.filter { it.perUnit > 0 }.map { mapOf("groceryItemId" to it.groceryItemId, "perUnit" to it.perUnit) },
                "startRules" to startRules.map { it.toMap() },
                "updatedBy" to currentUid(),
                "updatedAt" to FieldValue.serverTimestamp(),
            )
        ).await()
    }

    suspend fun addGroceryItem(nameTe: String, nameEn: String, unit: String, per100: Double): String =
        groceries().add(
            mapOf(
                "nameTe" to nameTe,
                "nameEn" to nameEn,
                "unit" to unit,
                "per100" to per100,
                "inventoryItemId" to "",
                "createdAt" to FieldValue.serverTimestamp(),
                "createdBy" to currentUid(),
            )
        ).await().id

    /** Existing cook log of a booking (bookings/{id}/cookLog/{dishId}) → dishId to (cooked, leftover). */
    suspend fun cookLogFor(bookingId: String): Map<String, Pair<Double, Double>> = try {
        firestore.collection(FirestoreCollections.BOOKINGS).document(bookingId)
            .collection(FirestoreCollections.COOK_LOG).get().await()
            .documents.associate { d ->
                val m = d.data ?: emptyMap()
                (m.rStr("dishId").ifBlank { d.id }) to (m.rNum("cooked") to m.rNum("leftover"))
            }
    } catch (e: Exception) {
        emptyMap()
    }

    /**
     * Saved per-event plan (bookings/{id}/cookingPlan/{dishId}, written by saveCookingPlan):
     * quantity + automatic/manual stamp per dish. Empty when nothing was saved yet.
     */
    suspend fun savedPlanFor(bookingId: String): List<CookingPlanItem> = try {
        firestore.collection(FirestoreCollections.BOOKINGS).document(bookingId)
            .collection(FirestoreCollections.COOKING_PLAN).get().await()
            .documents.map { d ->
                val m = d.data ?: emptyMap()
                CookingPlanItem(
                    calc = com.example.suseelacateringcrm.data.model.CalcInfo.fromMap(m),
                    dishId = m.rStr("dishId").ifBlank { d.id },
                    nameTe = m.rStr("nameTe"),
                    nameEn = m.rStr("nameEn"),
                    unit = m.rStr("unit"),
                    quantity = m.rNum("quantity"),
                    learnedPer100 = 0.0,
                    changePct = 0.0,
                    advice = "ok",
                    eventsUsed = 0,
                )
            }
    } catch (e: Exception) {
        emptyList()
    }

    suspend fun saveCookLog(bookingId: String, guestCountActual: Int?, entries: List<CookLogEntry>): Result<Int> =
        functions.saveCookLog(bookingId, guestCountActual, entries)

    suspend fun cookingPlan(guests: Int, eventTypeCode: String, menuPackageId: String?): Result<List<CookingPlanItem>> =
        functions.cookingPlan(guests, eventTypeCode, null, menuPackageId)

    suspend fun groceryList(guests: Int, eventTypeCode: String): Result<List<GroceryNeed>> =
        functions.groceryList(guests, eventTypeCode)
}
