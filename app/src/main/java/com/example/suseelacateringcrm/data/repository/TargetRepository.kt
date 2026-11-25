package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.remote.CrmFunctions
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.TargetBoard
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import kotlinx.coroutines.tasks.await

/** Target Board numbers come from `getTargetBoard` (managers get percent-only data from the server). */
class TargetRepository(
    private val functions: CrmFunctions,
    private val firestore: FirebaseFirestore,
) {
    suspend fun board(month: String): Result<TargetBoard> = functions.getTargetBoard(month)

    /**
     * targets/{year}.manualMonths as stored: 12 entries, a whole-rupee number for months typed by
     * hand, null for automatic months. Read from the server (fresh) so other people's typed months
     * are not lost; missing doc/field = all automatic. Admin-only collection.
     */
    suspend fun manualMonths(year: Int): List<Long?> {
        val snap = try {
            firestore.collection(FirestoreCollections.TARGETS).document(year.toString()).get(Source.SERVER).await()
        } catch (e: Exception) {
            firestore.collection(FirestoreCollections.TARGETS).document(year.toString()).get().await()
        }
        val raw = snap.get("manualMonths") as? List<*> ?: return List(12) { null }
        return (0 until 12).map { i -> (raw.getOrNull(i) as? Number)?.let { kotlin.math.round(it.toDouble()).toLong() } }
    }
}
