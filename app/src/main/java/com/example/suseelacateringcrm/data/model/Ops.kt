package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rDay
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr
import java.util.Date

// Round 7 models (api-contract R7-4, R7-6, R7-7, R7-10). All read field by field (fromMap).

/** equipment/{id}: vessels and rented items. kind own | rented. */
data class Equipment(
    val id: String = "",
    val nameTe: String = "",
    val nameEn: String = "",
    val kind: String = "own",
    val unit: String = "pcs",
    val qtyOwned: Double = 0.0,
    val rentalVendor: String = "",
    val rate: Double = 0.0,
    val archived: Boolean = false,
    val branchId: String = "",
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })

    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = Equipment(
            id = id, nameTe = m.rStr("nameTe"), nameEn = m.rStr("nameEn"), kind = m.rStr("kind", "own"),
            unit = m.rStr("unit", "pcs"), qtyOwned = m.rNum("qtyOwned"), rentalVendor = m.rStr("rentalVendor"),
            rate = m.rNumOrNull("rentalRate") ?: m.rNum("rate"), archived = m.rBool("archived"), branchId = m.rStr("branchId"),
        )
    }
}

/** equipmentMoves/{id}: type issue | return | damaged | lost. */
data class EquipmentMove(
    val id: String = "",
    val equipmentId: String = "",
    val equipmentName: String = "",
    val bookingId: String = "",
    val sessionId: String = "",
    val type: String = "issue",
    val qty: Double = 0.0,
    val note: String = "",
    val date: String = "",
) {
    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = EquipmentMove(
            id = id, equipmentId = m.rStr("equipmentId"), equipmentName = m.rStr("equipmentName"),
            bookingId = m.rStr("bookingId"), sessionId = m.rStr("sessionId"), type = m.rStr("type", "issue"),
            qty = m.rNum("qty"), note = m.rStr("note"), date = m.rDay("date"),
        )

        fun typeLabel(t: String): String = when (t) {
            "issue" -> L("ఇచ్చాం", "Issued")
            "return" -> L("తిరిగి వచ్చింది", "Returned")
            "damaged" -> L("పాడైంది", "Damaged")
            "lost" -> L("పోయింది", "Lost")
            else -> t
        }
    }
}

/** Outstanding of one item at one booking = issued − returned − damaged − lost. */
data class EquipmentOutstanding(val equipmentId: String, val name: String, val bookingId: String, val outstanding: Double)

fun outstandingOf(moves: List<EquipmentMove>): List<EquipmentOutstanding> =
    moves.groupBy { it.bookingId to it.equipmentId }.map { (key, list) ->
        val issued = list.filter { it.type == "issue" }.sumOf { it.qty }
        val back = list.filter { it.type != "issue" }.sumOf { it.qty }
        EquipmentOutstanding(key.second, list.first().equipmentName, key.first, issued - back)
    }

/** vehicles/{id}; expiry dates "YYYY-MM-DD". */
data class Vehicle(
    val id: String = "",
    val number: String = "",
    val type: String = "",
    val driverStaffId: String = "",
    val driverName: String = "",
    val insuranceExpiry: String = "",
    val fitnessExpiry: String = "",
    val pollutionExpiry: String = "",
    val driverLicenseExpiry: String = "",
    val rented: Boolean = false,
    val ratePerKm: Double = 0.0,
    val archived: Boolean = false,
) {
    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = Vehicle(
            id = id, number = m.rStr("number"), type = m.rStr("type"), driverStaffId = m.rStr("driverStaffId"),
            driverName = m.rStr("driverName"), insuranceExpiry = m.rDay("insuranceExpiry"), fitnessExpiry = m.rDay("fitnessExpiry"),
            pollutionExpiry = m.rDay("pollutionExpiry"), driverLicenseExpiry = m.rDay("driverLicenseExpiry"),
            rented = m.rBool("rented") || m.rStr("kind") == "rented", ratePerKm = m.rNum("ratePerKm"), archived = m.rBool("archived"),
        )
    }
}

/** vehicleTrips/{id}. */
data class VehicleTrip(
    val id: String = "",
    val vehicleId: String = "",
    val bookingId: String = "",
    val date: String = "",
    val kmStart: Double = 0.0,
    val kmEnd: Double = 0.0,
    val fuelCost: Double = 0.0,
    val ratePerKm: Double = 0.0,
) {
    val km: Double get() = (kmEnd - kmStart).coerceAtLeast(0.0)

    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = VehicleTrip(
            id = id, vehicleId = m.rStr("vehicleId"), bookingId = m.rStr("bookingId"), date = m.rDay("date"),
            kmStart = m.rNum("kmStart"), kmEnd = m.rNum("kmEnd"), fuelCost = m.rNum("fuelCost"), ratePerKm = m.rNum("ratePerKm"),
        )
    }
}

/** outsideOrders/{id} (R7-6). amountDue is 🔒 server-computed. */
data class OutsideOrder(
    val id: String = "",
    val bookingId: String = "",
    val sessionId: String = "",
    val vendorId: String = "",
    val vendorName: String = "",
    val item: String = "",
    val unit: String = "",
    val rate: Double = 0.0,
    val orderedQty: Double = 0.0,
    val deliveredQty: Double = 0.0,
    val acceptedQty: Double = 0.0,
    val returnedQty: Double = 0.0,
    val rejectReason: String = "",
    val advancePaid: Double = 0.0,
    val status: String = "ordered",
    val amountDue: Double = 0.0,
    val costTarget: CostTarget = CostTarget(),
) {
    val cost: Double get() = acceptedQty * rate

    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = OutsideOrder(
            id = id, bookingId = m.rStr("bookingId"), sessionId = m.rStr("sessionId"), vendorId = m.rStr("vendorId"),
            vendorName = m.rStr("vendorName"), item = m.rStr("item"), unit = m.rStr("unit"), rate = m.rNum("rate"),
            orderedQty = m.rNum("orderedQty"), deliveredQty = m.rNum("deliveredQty"), acceptedQty = m.rNum("acceptedQty"),
            returnedQty = m.rNum("returnedQty"), rejectReason = m.rStr("rejectReason"), advancePaid = m.rNum("advancePaid"),
            status = m.rStr("status", "ordered"), amountDue = m.rNum("amountDue"),
            costTarget = CostTarget.from(m["costTarget"], m.rStr("bookingId")),
        )

        fun statusLabel(s: String): String = when (s) {
            "ordered" -> L("ఆర్డర్ ఇచ్చాం", "Ordered")
            "delivered" -> L("వచ్చింది", "Delivered")
            "settled" -> L("లెక్క తేలింది", "Settled")
            "cancelled", "Cancelled" -> L("రద్దు", "Cancelled")
            else -> s
        }

        /** Common outside items (owner's list). */
        val COMMON_ITEMS = listOf("Pulka", "Rumali Roti", "Bobbatlu", "Ice Cream", "Paan", "Water Can", "Sweets")
    }
}

/** bookings/{id}/guestLog (R7-7). */
data class GuestLogEntry(val id: String, val sessionId: String, val count: Int, val at: Date?, val byName: String, val note: String) {
    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = GuestLogEntry(
            id, m.rStr("sessionId"), m.rNum("count").toInt(), m.rDate("at"),
            m.rStr("byName").ifBlank { (m["by"] as? Map<*, *>)?.get("name")?.toString() ?: "" }, m.rStr("note"),
        )
    }
}

/** bookings/{id}/eventExtras (R7-7). status pending | approved | rejected. */
data class EventExtra(
    val id: String,
    val sessionId: String,
    val item: String,
    val qty: Double,
    val rate: Double,
    val amount: Double,
    val customerApprovedBy: String,
    val status: String,
    val at: Date?,
) {
    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = EventExtra(
            id, m.rStr("sessionId"), m.rStr("item"), m.rNum("qty"), m.rNum("rate"),
            m.rNum("amount").takeIf { it > 0 } ?: (m.rNum("qty") * m.rNum("rate")),
            m.rStr("customerApprovedBy").ifBlank {
                (m["customerApprovedBy"] as? Map<*, *>)?.let { a -> listOfNotNull(a["name"], a["phone"]).joinToString(" · ") } ?: ""
            },
            m.rStr("status", "pending"), m.rDate("at"),
        )
    }
}

/** complaints/{id} (R7-10). status open | in-progress | resolved. */
data class Complaint(
    val id: String = "",
    val customerId: String = "",
    val customerName: String = "",
    val bookingId: String = "",
    val category: String = "food",
    val severity: String = "medium",
    val description: String = "",
    val assignedTo: String = "",
    val assignedName: String = "",
    val status: String = "open",
    val resolution: String = "",
    val reply: String = "",
    val createdAt: Date? = null,
) {
    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = Complaint(
            id = id, customerId = m.rStr("customerId"), customerName = m.rStr("customerName"), bookingId = m.rStr("bookingId"),
            category = m.rStr("category", "other"), severity = m.rStr("severity", "medium"), description = m.rStr("description"),
            assignedTo = m.rStr("assignedTo"), assignedName = m.rStr("assignedName"), status = m.rStr("status", "open"),
            resolution = m.rStr("resolution"), reply = m.rStr("reply"), createdAt = m.rDate("createdAt"),
        )

        val CATEGORIES = listOf("food", "service", "delay", "billing", "other")
        val SEVERITIES = listOf("low", "medium", "high")
        val STATUSES = listOf("open", "in-progress", "resolved")

        fun categoryLabel(c: String): String = when (c) {
            "food" -> L("భోజనం", "Food")
            "service" -> L("సేవ", "Service")
            "delay" -> L("ఆలస్యం", "Delay")
            "billing" -> L("బిల్లు", "Billing")
            else -> L("ఇతర", "Other")
        }

        fun severityLabel(s: String): String = when (s) {
            "low" -> L("చిన్నది", "Low")
            "high" -> L("పెద్దది", "High")
            else -> L("మధ్యస్థం", "Medium")
        }

        fun statusLabel(s: String): String = when (s) {
            "open" -> L("తెరిచి ఉంది", "Open")
            "in-progress" -> L("చూస్తున్నాం", "In progress")
            "resolved" -> L("పరిష్కరించాం", "Resolved")
            else -> s
        }

        /** Telugu reply templates the owner can send to the customer. */
        val REPLY_TEMPLATES = listOf(
            "క్షమించండి. మీ ఫిర్యాదు అందింది. వెంటనే సరిచేస్తాం. — సుశీల క్యాటరింగ్స్",
            "మీ అసౌకర్యానికి చింతిస్తున్నాం. తదుపరి కార్యక్రమంలో ఇలా జరగకుండా చూసుకుంటాం. — సుశీల క్యాటరింగ్స్",
            "మీ బిల్లు సరిచేశాం. సవరించిన బిల్లు పంపుతున్నాం. — సుశీల క్యాటరింగ్స్",
            "మీ సూచనకు ధన్యవాదాలు. మా బృందానికి తెలియజేశాం. — సుశీల క్యాటరింగ్స్",
        )
    }
}
