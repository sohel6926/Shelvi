package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class UserProfile(
    @DocumentId val uid: String = "",
    val name: String = "",
    val email: String = "",
    val phone: String = "",
    val role: String = "staff",
    val active: Boolean = false,
    val branchId: String = "",
    /** staff/{id} linked to this login (staff.linkedUserId == uid). Security rules use it to show staff their own bookings/attendance. */
    val staffId: String = "",
    /** Module 4d: one of the 17 business roles ("" = none). The owner sets it on the web Users page. */
    val jobRole: String = "",
    @ServerTimestamp val createdAt: Date? = null,
) {
    @get:com.google.firebase.firestore.Exclude
    val userRole: UserRole get() = UserRole.fromFirestore(role)

    /** Signed up but not yet approved by an admin. Admins are never blocked. */
    @get:com.google.firebase.firestore.Exclude
    val isPendingApproval: Boolean get() = !active && userRole != UserRole.ADMIN
}
