package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

data class Customer(
    @DocumentId val id: String = "",
    val name: String = "",
    val phone: String = "",
    val email: String = "",
    val address: String = "",
    val notes: String = "",
    /** Customer agreed to WhatsApp messages (tick box). Agents only message opted-in customers. */
    val whatsappOptIn: Boolean = false,
    /** 🔒 server stamp (R10-8): when / who (uid) ticked the WhatsApp consent. */
    val whatsappOptInAt: Date? = null,
    val whatsappOptInBy: String = "",
    /** Lead source code when the customer came from a lead (instagram, referral …). */
    val source: String = "",
    val referredBy: String = "",
    val createdBy: String = "",
    @ServerTimestamp val createdAt: Date? = null,
    @ServerTimestamp val updatedAt: Date? = null,
)
