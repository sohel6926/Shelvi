package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class InventoryItem(
    @DocumentId val id: String = "",
    val name: String = "",
    val unit: String = "",
    val quantityInStock: Double = 0.0,
    val reorderLevel: Double = 0.0,
    val category: String = "",
    val branchId: String = "",
    val archived: Boolean = false,
    /** Module 2d: this item keeps batches with an expiry date (owner switch, set on the web). */
    val trackExpiry: Boolean = false,
    /** 🔒 Module 2d: earliest expiry date ("YYYY-MM-DD") among batches that still hold stock; "" = none. */
    val nearestExpiry: String = "",
    /** 🔒 Module 2g: part of the stock promised to confirmed events (still on the shelf). */
    val reservedQty: Double = 0.0,
    /** 🔒 stock past its expiry date — on the shelf, but never planned with or reserved. */
    val expiredQty: Double = 0.0,
    @ServerTimestamp val lastUpdated: Date? = null,
) {
    /** Stock that is neither promised to an event nor expired. */
    @get:com.google.firebase.firestore.Exclude
    val freeQty: Double get() = maxOf(0.0, quantityInStock - reservedQty - expiredQty)

    @get:com.google.firebase.firestore.Exclude
    val isLowStock: Boolean get() = quantityInStock <= reorderLevel
}

enum class StockMovementType(val label: String) {
    IN("IN"),
    OUT("OUT");

    companion object {
        fun fromFirestore(value: String?): StockMovementType =
            entries.find { it.label == value } ?: IN
    }
}

data class StockMovement(
    @DocumentId val id: String = "",
    val type: String = StockMovementType.IN.label,
    val quantity: Double = 0.0,
    val reason: String = "",
    val relatedBookingId: String = "",
    val date: Date? = null,
    val recordedBy: String = "",
)

/** `inventory/{id}/batches/{id}` — one batch of a tracked item (Module 2d). Written only by the server. */
data class StockBatch(
    val id: String = "",
    val qty: Double = 0.0,
    val expiryDay: String = "",
    val batchNo: String = "",
)
