package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Vendor
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

class VendorRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.VENDORS)

    fun vendorsFlow(): Flow<List<Vendor>> =
        collection().snapshotsFlow().map { it.toObjects(Vendor::class.java) }

    suspend fun getVendor(vendorId: String): Vendor? =
        collection().document(vendorId).get().await().toObject(Vendor::class.java)

    suspend fun saveVendor(vendor: Vendor): String {
        val data = mapOf(
            "name" to vendor.name,
            "phone" to vendor.phone,
            "address" to vendor.address,
            "notes" to vendor.notes,
        )
        return if (vendor.id.isBlank()) {
            collection().add(data + mapOf("createdBy" to currentUid())).await().id
        } else {
            collection().document(vendor.id).update(data + mapOf("updatedBy" to currentUid())).await()
            vendor.id
        }
    }

    /** R7-3: no client delete — cancel/archive with a reason through the cancelRecord callable. */
    suspend fun deleteVendor(vendorId: String, reason: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .cancelRecord(FirestoreCollections.VENDORS, vendorId, reason).getOrThrow()
    }
}
