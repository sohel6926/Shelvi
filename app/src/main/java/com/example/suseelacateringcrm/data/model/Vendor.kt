package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId

data class Vendor(
    @DocumentId val id: String = "",
    val name: String = "",
    val phone: String = "",
    val address: String = "",
    val notes: String = "",
)
