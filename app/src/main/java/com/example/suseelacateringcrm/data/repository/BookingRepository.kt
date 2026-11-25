package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.currentUid

/**
 * [staffScope] returns null for admin/manager, or the signed-in staff member's staffId ("" when the
 * login is not linked yet). Security rules let staff read only bookings whose assignedStaffIds
 * contains their staffId, so every staff list query is narrowed here, in one place.
 */
class BookingRepository(
    private val firestore: FirebaseFirestore,
    private val staffScope: () -> String? = { null },
) {

    private fun collection() = firestore.collection(FirestoreCollections.BOOKINGS)

    /** branchId == null means unfiltered (admin's "All Branches" combined view). */
    fun bookingsFlow(branchId: String? = null): Flow<List<Booking>> {
        val staffId = staffScope()
        if (staffId != null) {
            if (staffId.isBlank()) return kotlinx.coroutines.flow.flowOf(emptyList())
            // No branch filter for staff: array-contains + equality would need a composite index,
            // and the rules only require the assignment.
            return collection().whereArrayContains("assignedStaffIds", staffId)
                .snapshotsFlow().map { it.toObjects(Booking::class.java) }
        }
        val query: Query = if (branchId != null) collection().whereEqualTo("branchId", branchId) else collection()
        return query.snapshotsFlow().map { it.toObjects(Booking::class.java) }
    }

    /**
     * One-off read for background work (no session state needed): staff → bookings assigned to
     * [staffId]; manager → [branchId]; admin (both null) → all. Matches the security rules.
     */
    suspend fun bookingsScopedOnce(staffId: String?, branchId: String?): List<Booking> {
        val query: Query = when {
            staffId != null -> collection().whereArrayContains("assignedStaffIds", staffId)
            branchId != null -> collection().whereEqualTo("branchId", branchId)
            else -> collection()
        }
        return query.get().await().toObjects(Booking::class.java)
    }

    /** The raw booking document (for server-owned maps like stockDeduction). */
    fun bookingRawFlow(bookingId: String): Flow<Map<String, Any?>?> =
        collection().document(bookingId).snapshotsFlow().map { snap -> if (snap.exists()) snap.data else null }

    fun bookingFlow(bookingId: String): Flow<Booking?> =
        collection().document(bookingId).snapshotsFlow().map { snapshot ->
            if (snapshot.exists()) snapshot.toObject(Booking::class.java) else null
        }

    fun bookingsForCustomerFlow(customerId: String, branchId: String? = null): Flow<List<Booking>> {
        var query: Query = collection().whereEqualTo("customerId", customerId)
        if (branchId != null) query = query.whereEqualTo("branchId", branchId)
        return query.snapshotsFlow().map { it.toObjects(Booking::class.java) }
    }

    suspend fun getBooking(bookingId: String): Booking? =
        collection().document(bookingId).get().await().toObject(Booking::class.java)

    /** Full save: creates/updates all admin-editable fields (pricing, menu, assignment, etc). */
    suspend fun saveBooking(booking: Booking, createdBy: String, branchId: String? = null, clearSessions: Boolean = false): String {
        return if (booking.id.isBlank()) {
            val data = bookingWriteMap(booking, clearSessions) + mapOf(
                "branchId" to requireNotNull(branchId) { "branchId required to create a booking" },
                "createdBy" to createdBy,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            collection().add(data).await().id
        } else {
            val data = bookingWriteMap(booking, clearSessions) + mapOf("updatedAt" to FieldValue.serverTimestamp(), "updatedBy" to currentUid())
            collection().document(booking.id).update(data).await()
            booking.id
        }
    }

    private fun bookingWriteMap(booking: Booking, clearSessions: Boolean = false): Map<String, Any?> = mapOf(
        "customerId" to booking.customerId,
        "customerNameSnapshot" to booking.customerNameSnapshot,
        "eventDate" to booking.eventDate,
        "eventType" to booking.eventType,
        "eventTypeCode" to booking.eventTypeCode.ifBlank { "wedding" },
        "packageId" to booking.packageId,
        "serveTime" to booking.serveTime,
        "travelMinutes" to booking.travelMinutes,
        "mealType" to booking.mealType,
        "venue" to booking.venue,
        "guestCount" to booking.guestCount,
        "menuItemIds" to booking.menuItemIds,
        "menuSnapshot" to booking.menuSnapshot.map {
            mapOf("itemId" to it.itemId, "name" to it.name, "pricePerPlate" to it.pricePerPlate)
        },
        "status" to booking.status,
        "assignedStaffIds" to booking.assignedStaffIds,
        "totalAmount" to booking.totalAmount,
        "advancePaid" to booking.advancePaid,
        "notes" to booking.notes,
    ) + (if (booking.serviceStyle.isNotBlank()) mapOf("serviceStyle" to booking.serviceStyle) else emptyMap()) + mapOf(
        // R10-11: kids plates + special meals (quoted and shown in the kitchen plan by the server).
        "kidsCount" to booking.kidsCount,
        "specialMeals" to booking.specialMeals.filter { it.count > 0 }.map { it.toMap() },
    ) + when {
        // R7-5: meal sessions (rules: list ≤ 20, items are maps with an id).
        booking.sessions.isNotEmpty() -> mapOf("sessions" to booking.sessions.take(20).map { it.toMap() })
        clearSessions -> mapOf("sessions" to emptyList<Any>())
        else -> emptyMap()
    }

    /** Staff-permitted update: only status/notes, per Firestore rules. */
    suspend fun updateStatusAndNotes(bookingId: String, status: String, notes: String) {
        collection().document(bookingId).update(
            mapOf(
                "status" to status,
                "notes" to notes,
                "updatedAt" to FieldValue.serverTimestamp(),
                "updatedBy" to currentUid(),
            )
        ).await()
    }

    suspend fun assignStaff(bookingId: String, staffIds: List<String>) {
        collection().document(bookingId).update(
            mapOf(
                "assignedStaffIds" to staffIds,
                "updatedAt" to FieldValue.serverTimestamp(),
                "updatedBy" to currentUid(),
            )
        ).await()
    }

    // Bookings are cancelled only through the cancelBooking callable (Round 9: money step, side effects).
}
