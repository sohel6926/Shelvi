package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr
import java.util.Date

/**
 * "Automatic or manual" stamp the server stores next to every computed value
 * (api-contract "Manual and automatic mode"): calcMode, autoValue, overriddenBy {uid, name},
 * overriddenAt, overrideReason. Missing fields = automatic.
 */
data class CalcInfo(
    val manual: Boolean = false,
    val autoValue: Double? = null,
    val byUid: String = "",
    val byName: String = "",
    val at: Date? = null,
    val reason: String = "",
) {
    companion object {
        val AUTO = CalcInfo()

        fun fromMap(m: Map<*, *>?): CalcInfo {
            if (m == null) return AUTO
            @Suppress("UNCHECKED_CAST")
            val map = m.entries.associate { it.key.toString() to it.value }
            val by = map["overriddenBy"]
            val byMap = (by as? Map<*, *>)
            return CalcInfo(
                manual = map.rStr("calcMode") == "manual",
                autoValue = map.rNumOrNull("autoValue"),
                byUid = byMap?.get("uid")?.toString() ?: "",
                byName = byMap?.get("name")?.toString() ?: (by as? String ?: ""),
                at = map.rDate("overriddenAt"),
                reason = map.rStr("overrideReason"),
            )
        }
    }
}

/** Value kinds in settings/business.calcModes. */
enum class CalcArea(val key: String) {
    QUOTATION("quotation"), INVOICE("invoice"), ATTENDANCE_PAY("attendancePay"),
    PAYROLL("payroll"), COOKING("cooking"), TARGETS("targets"),
}

/**
 * Who may type a value by hand: the admin always; a manager only when
 * settings.managerCanOverride is true (default true); staff never.
 */
fun canOverride(role: UserRole?, settings: BusinessSettings?): Boolean = when (role) {
    UserRole.ADMIN -> true
    UserRole.MANAGER -> settings?.managerCanOverride ?: true
    else -> false
}
