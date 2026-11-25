package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Customer
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

class CustomerRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.CUSTOMERS)

    fun customersFlow(): Flow<List<Customer>> =
        collection().snapshotsFlow().map { it.toObjects(Customer::class.java) }

    fun customerFlow(customerId: String): Flow<Customer?> =
        collection().document(customerId).snapshotsFlow().map { snapshot ->
            if (snapshot.exists()) snapshot.toObject(Customer::class.java) else null
        }

    suspend fun getCustomer(customerId: String): Customer? =
        collection().document(customerId).get().await().toObject(Customer::class.java)

    /** R10-8: the WhatsApp tick; the server trigger stamps whatsappOptInAt/By (or OptOutAt/By) when it changes. */
    private fun optInFields(customer: Customer, changed: Boolean): Map<String, Any?> =
        if (!changed) emptyMap() else mapOf("whatsappOptIn" to customer.whatsappOptIn)

    suspend fun saveCustomer(customer: Customer, createdBy: String, optInChanged: Boolean = false): String {
        return if (customer.id.isBlank()) {
            val data = mapOf(
                "name" to customer.name,
                "phone" to customer.phone,
                "email" to customer.email,
                "address" to customer.address,
                "notes" to customer.notes,
                "createdBy" to createdBy,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            ) + optInFields(customer, optInChanged)
            collection().add(data).await().id
        } else {
            val data = mapOf(
                "name" to customer.name,
                "phone" to customer.phone,
                "email" to customer.email,
                "address" to customer.address,
                "notes" to customer.notes,
                "updatedAt" to FieldValue.serverTimestamp(),
                "updatedBy" to currentUid(),
            ) + optInFields(customer, optInChanged)
            collection().document(customer.id).update(data).await()
            customer.id
        }
    }

    /** R7-3: no client delete — cancel/archive with a reason through the cancelRecord callable. */
    suspend fun deleteCustomer(customerId: String, reason: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .cancelRecord(FirestoreCollections.CUSTOMERS, customerId, reason).getOrThrow()
    }
}
