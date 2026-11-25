package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import java.util.Date

data class Staff(
    @DocumentId val id: String = "",
    val name: String = "",
    val phone: String = "",
    val jobRole: String = "",
    val dailyWage: Double = 0.0,
    val active: Boolean = true,
    val joinedDate: Date? = null,
    val linkedUserId: String = "",
    val branchId: String = "",
    /** "daily" or "monthly" (api-contract, Staff). Older documents have no value = daily. */
    val payType: String = "daily",
    /** Only for monthly staff. */
    val monthlySalary: Double = 0.0,
    val emergencyPhone: String = "",
)
