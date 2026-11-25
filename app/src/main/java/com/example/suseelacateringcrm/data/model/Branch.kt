package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class Branch(
    @DocumentId val id: String = "",
    val name: String = "",
    val address: String = "",
    val phone: String = "",
    val active: Boolean = true,
    @ServerTimestamp val createdAt: Date? = null,
)
