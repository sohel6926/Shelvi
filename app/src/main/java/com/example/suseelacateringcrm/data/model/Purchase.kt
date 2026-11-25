package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class PurchaseItem(
    val description: String = "",
    val category: String = "",
    val module: String = "",
    val quantity: Double = 0.0,
    val unit: String = "",
    val unitPrice: Double = 0.0,
    val amount: Double = 0.0,
    val inventoryItemId: String = "",
)

data class Purchase(
    @DocumentId val id: String = "",
    val purchaseNumber: String = "",
    val vendorId: String = "",
    val vendorNameSnapshot: String = "",
    val billNumber: String = "",
    val purchaseDate: Date? = null,
    val items: List<PurchaseItem> = emptyList(),
    val subtotal: Double = 0.0,
    val discount: Double = 0.0,
    val otherCharges: Double = 0.0,
    val totalAmount: Double = 0.0,
    val paymentMethod: String = "",
    val paymentStatus: String = "",
    val billPhotoUrl: String = "",
    val notes: String = "",
    val staffUid: String = "",
    val staffName: String = "",
    val staffPhone: String = "",
    @get:PropertyName("isDeleted")
    val isDeleted: Boolean = false,
    val deletedBy: String = "",
    /** R7-1: { type: booking, bookingId, sessionId? } | { type: overhead, centre }. */
    val costTarget: Map<String, Any?>? = null,
    /** R7-3: "Cancelled" when cancelled through cancelRecord. */
    val status: String = "",
    val cancelReason: String = "",
    /** R7-8 (🔒 server-derived): amount paid so far and balance. */
    val paid: Double = 0.0,
    val balance: Double = 0.0,
    val branchId: String = "",
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Date? = null,
    val updatedBy: String = "",
    @ServerTimestamp val updatedAt: Date? = null,
)
