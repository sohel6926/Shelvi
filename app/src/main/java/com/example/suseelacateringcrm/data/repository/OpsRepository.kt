package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Complaint
import com.example.suseelacateringcrm.data.model.Equipment
import com.example.suseelacateringcrm.data.model.EquipmentMove
import com.example.suseelacateringcrm.data.model.OutsideOrder
import com.example.suseelacateringcrm.data.model.Vehicle
import com.example.suseelacateringcrm.data.model.VehicleTrip
import com.example.suseelacateringcrm.util.currentUid
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

/**
 * Round 7 operations data: equipment / vessels and their moves, vehicles and trips, complaints (direct
 * writes allowed by the rules, always with branchId + createdBy / updatedBy) and outside orders (read only;
 * writes go through saveOutsideOrder / recordOutsideDelivery). [branchId] null = admin "All branches".
 */
class OpsRepository(private val db: FirebaseFirestore) {

    private fun scoped(name: String, branchId: String?): Query =
        if (branchId != null) db.collection(name).whereEqualTo("branchId", branchId) else db.collection(name)

    private fun createMeta(branchId: String) = mapOf(
        "branchId" to branchId,
        "createdBy" to currentUid(),
        "createdAt" to FieldValue.serverTimestamp(),
        "updatedBy" to currentUid(),
        "updatedAt" to FieldValue.serverTimestamp(),
    )

    private fun updateMeta() = mapOf("updatedBy" to currentUid(), "updatedAt" to FieldValue.serverTimestamp())

    // ---- equipment / vessels (R7-4) ---------------------------------------------------------

    fun equipmentFlow(branchId: String?): Flow<List<Equipment>> =
        scoped(EQUIPMENT, branchId).snapshotsFlow().map { q ->
            q.documents.map { Equipment.fromMap(it.id, it.data ?: emptyMap()) }.sortedBy { it.name.lowercase() }
        }

    suspend fun saveEquipment(e: Equipment, branchId: String?) {
        val fields = mapOf(
            "nameTe" to e.nameTe, "nameEn" to e.nameEn, "kind" to e.kind, "unit" to e.unit,
            "qtyOwned" to e.qtyOwned, "rentalVendor" to e.rentalVendor, "rentalRate" to e.rate,
        )
        if (e.id.isBlank()) {
            db.collection(EQUIPMENT).add(fields + createMeta(requireNotNull(branchId) { "branch" })).await()
        } else {
            db.collection(EQUIPMENT).document(e.id).update(fields + updateMeta()).await()
        }
    }

    /** Admin / manager: moves of the branch; [bookingId] narrows to one event (staff must pass it). */
    fun movesFlow(branchId: String?, bookingId: String? = null): Flow<List<EquipmentMove>> {
        val q: Query = if (bookingId != null) db.collection(MOVES).whereEqualTo("bookingId", bookingId) else scoped(MOVES, branchId)
        return q.snapshotsFlow().map { s ->
            s.documents.map { EquipmentMove.fromMap(it.id, it.data ?: emptyMap()) }.sortedByDescending { it.date }
        }
    }

    suspend fun addMove(m: EquipmentMove, branchId: String) {
        val fields = mapOf(
            "equipmentId" to m.equipmentId, "equipmentName" to m.equipmentName, "bookingId" to m.bookingId,
            "sessionId" to m.sessionId.ifBlank { null }, "type" to m.type, "qty" to m.qty, "note" to m.note, "date" to m.date,
        ).filterValues { it != null }
        db.collection(MOVES).add(fields + createMeta(branchId)).await()
    }

    // ---- vehicles and trips (R7-4) ----------------------------------------------------------

    fun vehiclesFlow(branchId: String?): Flow<List<Vehicle>> =
        scoped(VEHICLES, branchId).snapshotsFlow().map { q ->
            q.documents.map { Vehicle.fromMap(it.id, it.data ?: emptyMap()) }.sortedBy { it.number }
        }

    suspend fun saveVehicle(v: Vehicle, branchId: String?) {
        val fields = mapOf(
            "number" to v.number, "type" to v.type, "driverStaffId" to v.driverStaffId, "driverName" to v.driverName,
            "insuranceExpiry" to v.insuranceExpiry, "fitnessExpiry" to v.fitnessExpiry, "pollutionExpiry" to v.pollutionExpiry,
            "driverLicenseExpiry" to v.driverLicenseExpiry, "kind" to if (v.rented) "rented" else "own", "ratePerKm" to v.ratePerKm,
        )
        if (v.id.isBlank()) {
            db.collection(VEHICLES).add(fields + createMeta(requireNotNull(branchId) { "branch" })).await()
        } else {
            db.collection(VEHICLES).document(v.id).update(fields + updateMeta()).await()
        }
    }

    /** Admin / manager: branch trips. Staff: only their own trips (rules). */
    fun tripsFlow(branchId: String?, ownOnly: Boolean): Flow<List<VehicleTrip>> {
        val q: Query = if (ownOnly) db.collection(TRIPS).whereEqualTo("createdBy", currentUid()) else scoped(TRIPS, branchId)
        return q.snapshotsFlow().map { s ->
            s.documents.map { VehicleTrip.fromMap(it.id, it.data ?: emptyMap()) }.sortedByDescending { it.date }
        }
    }

    suspend fun addTrip(t: VehicleTrip, branchId: String) {
        val fields = mapOf(
            "vehicleId" to t.vehicleId, "bookingId" to t.bookingId, "date" to t.date, "kmStart" to t.kmStart,
            "kmEnd" to t.kmEnd, "fuelCost" to t.fuelCost, "ratePerKm" to t.ratePerKm,
        )
        db.collection(TRIPS).add(fields + createMeta(branchId)).await()
    }

    // ---- complaints (R7-10) -----------------------------------------------------------------

    /** Admin / manager: branch complaints. Staff: the ones they wrote. */
    fun complaintsFlow(branchId: String?, ownOnly: Boolean): Flow<List<Complaint>> {
        val q: Query = if (ownOnly) db.collection(COMPLAINTS).whereEqualTo("createdBy", currentUid()) else scoped(COMPLAINTS, branchId)
        return q.snapshotsFlow().map { s ->
            s.documents.map { Complaint.fromMap(it.id, it.data ?: emptyMap()) }.sortedByDescending { it.createdAt }
        }
    }

    suspend fun addComplaint(c: Complaint, branchId: String) {
        val fields = mapOf(
            "customerId" to c.customerId, "customerName" to c.customerName, "bookingId" to c.bookingId,
            "category" to c.category, "severity" to c.severity, "description" to c.description, "status" to "open",
        )
        db.collection(COMPLAINTS).add(fields + createMeta(branchId)).await()
    }

    suspend fun updateComplaint(id: String, fields: Map<String, Any?>) {
        db.collection(COMPLAINTS).document(id).update(fields + updateMeta()).await()
    }

    // ---- outside orders (R7-6, read only) ---------------------------------------------------

    fun outsideOrdersFlow(branchId: String?): Flow<List<OutsideOrder>> =
        scoped(OUTSIDE_ORDERS, branchId).snapshotsFlow().map { q ->
            q.documents.map { OutsideOrder.fromMap(it.id, it.data ?: emptyMap()) }
        }

    companion object {
        const val EQUIPMENT = "equipment"
        const val MOVES = "equipmentMoves"
        const val VEHICLES = "vehicles"
        const val TRIPS = "vehicleTrips"
        const val COMPLAINTS = "complaints"
        const val OUTSIDE_ORDERS = "outsideOrders"
    }
}
