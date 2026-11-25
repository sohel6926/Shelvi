package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.UserProfile
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class UserRepository(private val firestore: FirebaseFirestore) {

    private fun usersCollection() = firestore.collection(FirestoreCollections.USERS)

    fun userProfileFlow(uid: String): Flow<UserProfile?> =
        usersCollection().document(uid).snapshotsFlow().map { snapshot ->
            if (snapshot.exists()) snapshot.toObject(UserProfile::class.java) else null
        }

    fun allUsersFlow(): Flow<List<UserProfile>> =
        usersCollection().snapshotsFlow().map { snapshot ->
            snapshot.toObjects(UserProfile::class.java)
        }

    suspend fun getUserProfile(uid: String): UserProfile? =
        usersCollection().document(uid).get().await().toObject(UserProfile::class.java)

    suspend fun createInitialUserDoc(uid: String, name: String, email: String, phone: String = "") {
        val data = mapOf(
            "name" to name,
            "email" to email,
            "phone" to phone,
            "role" to "staff",
            // New sign-ups wait for an admin to approve them (Users screen -> Active switch).
            "active" to false,
            "createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
        )
        usersCollection().document(uid).set(data).await()
    }

    suspend fun updateOwnProfile(uid: String, name: String, phone: String) {
        usersCollection().document(uid).update(
            mapOf("name" to name, "phone" to phone)
        ).await()
    }

    suspend fun updateRole(uid: String, role: String) {
        // A business role belongs to one security level, so changing the level clears it (same as the web Users page).
        usersCollection().document(uid).update(mapOf("role" to role, "jobRole" to "")).await()
    }

    suspend fun updateJobRole(uid: String, jobRole: String) {
        usersCollection().document(uid).update("jobRole", jobRole).await()
    }

    suspend fun updateActive(uid: String, active: Boolean) {
        usersCollection().document(uid).update("active", active).await()
    }

    /** Admin only: links a login to its staff record (security rules read users/{uid}.staffId). */
    suspend fun updateStaffId(uid: String, staffId: String) {
        usersCollection().document(uid).update("staffId", staffId).await()
    }

    suspend fun updateBranch(uid: String, branchId: String) {
        usersCollection().document(uid).update("branchId", branchId).await()
    }
}
