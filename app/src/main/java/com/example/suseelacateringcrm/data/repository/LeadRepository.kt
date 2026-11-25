package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Lead
import com.example.suseelacateringcrm.data.model.LeadAssignee
import com.example.suseelacateringcrm.data.model.LeadComment
import com.example.suseelacateringcrm.data.model.LeadStatus
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

class LeadRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.LEADS)

    /** branchId == null means unfiltered (admin's "All Branches"). */
    fun leadsFlow(branchId: String? = null): Flow<List<Lead>> {
        val query: Query = if (branchId != null) collection().whereEqualTo("branchId", branchId) else collection()
        return query.snapshotsFlow().map { snap -> snap.documents.map { Lead.fromMap(it.id, it.data ?: emptyMap()) } }
    }

    suspend fun getLead(id: String): Lead? {
        val snap = collection().document(id).get().await()
        return if (snap.exists()) Lead.fromMap(snap.id, snap.data ?: emptyMap()) else null
    }

    private fun writeMap(lead: Lead): Map<String, Any?> = mapOf(
        "name" to lead.name,
        "phone" to lead.phone,
        "source" to lead.source,
        "campaignId" to lead.campaignId,
        "eventDate" to lead.eventDate,
        "guests" to lead.guests,
        "budget" to lead.budget,
        "status" to lead.status,
        "followUpDate" to lead.followUpDate,
        "followUpTime" to lead.followUpTime,
        "lostReason" to lead.lostReason,
        "whatsappOptIn" to lead.whatsappOptIn,
        "notes" to lead.notes,
        "updatedAt" to FieldValue.serverTimestamp(),
        "updatedBy" to currentUid(),
    )

    /** branchId is stamped only on create (never in an update — money-calc-spec rule). */
    suspend fun saveLead(lead: Lead, createdBy: String, branchId: String?): String {
        return if (lead.id.isBlank()) {
            val data = writeMap(lead) + mapOf(
                "branchId" to (branchId ?: ""),
                "createdBy" to createdBy,
                "createdAt" to FieldValue.serverTimestamp(),
            )
            collection().add(data).await().id
        } else {
            collection().document(lead.id).update(writeMap(lead)).await()
            lead.id
        }
    }

    /** Module 1e: team notes of one lead, oldest first. */
    fun commentsFlow(leadId: String): Flow<List<LeadComment>> =
        collection().document(leadId).collection("comments").orderBy("createdAt").snapshotsFlow().map { snap ->
            snap.documents.map { d ->
                val m = d.data ?: emptyMap()
                LeadComment(
                    id = d.id,
                    text = m["text"]?.toString() ?: "",
                    createdByName = m["createdByName"]?.toString() ?: "",
                    createdAt = (m["createdAt"] as? com.google.firebase.Timestamp)?.toDate(),
                )
            }
        }

    /** Module 1e: add a team note (server writes it and tells the people involved). */
    suspend fun addComment(leadId: String, text: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .call("addLeadComment", mapOf("leadId" to leadId, "text" to text)).getOrThrow()
    }

    /** Module 1a: people a lead can be given to. */
    suspend fun assignees(): List<LeadAssignee> {
        val res = com.example.suseelacateringcrm.di.ServiceLocator.functions.call("leadAssignees", emptyMap()).getOrThrow()
        return (res["people"] as? List<*>).orEmpty().mapNotNull { it as? Map<*, *> }.map {
            LeadAssignee(uid = it["uid"]?.toString() ?: "", name = it["name"]?.toString() ?: "", role = it["role"]?.toString() ?: "")
        }.filter { it.uid.isNotBlank() }
    }

    /** Module 1a: give the lead to a person (uid "" = take it back). Returns the new name ("" = nobody). */
    suspend fun assign(leadId: String, uid: String): String {
        val res = com.example.suseelacateringcrm.di.ServiceLocator.functions
            .call("assignLead", mapOf("leadId" to leadId, "uid" to uid)).getOrThrow()
        return res["assignedName"]?.toString() ?: ""
    }

    /** R7-3: no client delete — cancel/archive with a reason through the cancelRecord callable. */
    suspend fun deleteLead(id: String, reason: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .cancelRecord(FirestoreCollections.LEADS, id, reason).getOrThrow()
    }

    /**
     * Creates the customer from the lead and marks the lead "won" in one batch.
     * The WhatsApp opt-in tick and the lead source carry over. Returns the new customer id.
     */
    suspend fun convertToCustomer(lead: Lead, createdBy: String): String {
        if (lead.customerId.isNotBlank()) return lead.customerId
        val customerRef = firestore.collection(FirestoreCollections.CUSTOMERS).document()
        val batch = firestore.batch()
        batch.set(
            customerRef,
            mapOf(
                "name" to lead.name,
                "phone" to lead.phone,
                "email" to "",
                "address" to "",
                "notes" to lead.notes,
                // R10-8: only the tick; the server trigger stamps whatsappOptInAt / whatsappOptInBy.
                "whatsappOptIn" to lead.whatsappOptIn,
                "source" to lead.source,
                "createdBy" to createdBy,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
        )
        batch.update(
            collection().document(lead.id),
            mapOf(
                "status" to LeadStatus.WON.code,
                "customerId" to customerRef.id,
                "updatedAt" to FieldValue.serverTimestamp(),
                "updatedBy" to currentUid(),
            ),
        )
        batch.commit().await()
        return customerRef.id
    }
}
