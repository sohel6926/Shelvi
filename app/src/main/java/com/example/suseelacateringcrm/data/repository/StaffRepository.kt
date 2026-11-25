package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

class StaffRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.STAFF)

    /** branchId == null means unfiltered (admin's "All Branches" combined view). */
    fun staffFlow(branchId: String? = null): Flow<List<Staff>> {
        val query: Query = if (branchId != null) collection().whereEqualTo("branchId", branchId) else collection()
        return query.snapshotsFlow().map { it.toObjects(Staff::class.java) }
    }

    suspend fun getStaff(staffId: String): Staff? =
        collection().document(staffId).get().await().toObject(Staff::class.java)

    suspend fun getStaffByLinkedUser(uid: String): Staff? =
        collection().whereEqualTo("linkedUserId", uid).limit(1).get().await()
            .documents.firstOrNull()?.toObject(Staff::class.java)

    /**
     * Module 4d: pay figures are kept in staff/{id}/private/pay (owner only) — the server moves them there right
     * after a save. Returns the person with the figures filled in, and whether the figures could be read; when
     * they could not (offline), the edit screen must not send them back, or a blank would wipe the real figure.
     */
    suspend fun getStaffWithPay(staffId: String): Pair<Staff?, Boolean> {
        val staff = getStaff(staffId) ?: return Pair(null, false)
        return try {
            val pay = collection().document(staffId).collection("private").document("pay").get().await()
            val filled = if (!pay.exists()) staff else staff.copy(
                dailyWage = pay.getDouble("dailyWage") ?: staff.dailyWage,
                monthlySalary = pay.getDouble("monthlySalary") ?: staff.monthlySalary,
            )
            Pair(filled, true)
        } catch (e: Exception) {
            Pair(staff, false)
        }
    }

    suspend fun saveStaff(staff: Staff, branchId: String? = null, includePay: Boolean = true): String {
        val payData: Map<String, Any?> = if (includePay) mapOf("dailyWage" to staff.dailyWage, "monthlySalary" to staff.monthlySalary) else emptyMap()
        val data: Map<String, Any?> = payData + mapOf(
            "name" to staff.name,
            "phone" to staff.phone,
            "jobRole" to staff.jobRole,
            "active" to staff.active,
            "joinedDate" to staff.joinedDate,
            "linkedUserId" to staff.linkedUserId,
            "payType" to staff.payType,
            "emergencyPhone" to staff.emergencyPhone,
        )
        val previousLinkedUser = if (staff.id.isBlank()) "" else (getStaff(staff.id)?.linkedUserId ?: "")
        val savedId = if (staff.id.isBlank()) {
            val createData = data + mapOf(
                "branchId" to requireNotNull(branchId) { "branchId required to create a staff member" },
                "createdBy" to currentUid(),
            )
            collection().add(createData).await().id
        } else {
            collection().document(staff.id).update(data + mapOf("updatedBy" to currentUid())).await()
            staff.id
        }
        syncUserStaffId(previousLinkedUser, staff.linkedUserId, savedId)
        return savedId
    }

    /**
     * Keeps users/{uid}.staffId in step with staff.linkedUserId (the rules use it to show staff
     * their bookings and attendance). Best effort: a Functions trigger may also do this.
     */
    private suspend fun syncUserStaffId(previousUid: String, newUid: String, staffId: String) {
        val users = firestore.collection(FirestoreCollections.USERS)
        try {
            if (previousUid.isNotBlank() && previousUid != newUid) {
                users.document(previousUid).update("staffId", "").await()
            }
            if (newUid.isNotBlank()) {
                users.document(newUid).update("staffId", staffId).await()
            }
        } catch (e: Exception) {
            android.util.Log.w("StaffRepository", "Could not update users.staffId", e)
        }
    }

    /** R7-3: no client delete — cancel/archive with a reason through the cancelRecord callable. */
    suspend fun deleteStaff(staffId: String, reason: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .cancelRecord(FirestoreCollections.STAFF, staffId, reason).getOrThrow()
    }
}
