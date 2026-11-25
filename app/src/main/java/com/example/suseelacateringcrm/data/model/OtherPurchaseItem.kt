package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class OtherPurchaseItem(
    @DocumentId val id: String = "",
    val name: String = "",
    val category: String = "",
    val unit: String = "",
    val defaultSupplierName: String = "",
    val notes: String = "",
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Date? = null,
)
