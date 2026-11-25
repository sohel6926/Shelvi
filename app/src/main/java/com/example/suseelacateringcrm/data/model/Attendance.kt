package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rDay
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr

enum class AttendanceStatus(val code: String, val te: String, val en: String) {
    PRESENT("present", "వచ్చారు", "Present"),
    HALF("half", "సగం రోజు", "Half day"),
    ABSENT("absent", "రాలేదు", "Absent"),
    LEAVE("leave", "సెలవు", "Leave");

    val label: String get() = L(te, en)

    /** Hours to pre-fill when this status is picked. */
    val defaultHours: Double get() = when (this) {
        PRESENT -> 8.0
        HALF -> 4.0
        ABSENT, LEAVE -> 0.0
    }

    companion object {
        fun from(code: String?): AttendanceStatus = entries.find { it.code == code } ?: PRESENT
    }
}

/** `attendance/{staffId_YYYY-MM-DD}`. `pay` is server-owned (calc-spec §7). */
data class Attendance(
    val id: String = "",
    val staffId: String = "",
    val date: String = "",
    val hours: Double = 0.0,
    val status: String = AttendanceStatus.PRESENT.code,
    val bookingId: String = "",
    val pay: Double = 0.0,
    val recordedBy: String = "",
    /** Automatic / manual stamp for `pay` (markAttendance with manual pay). */
    val calc: CalcInfo = CalcInfo.AUTO,
) {
    companion object {
        fun docId(staffId: String, date: String) = "${staffId}_$date"

        fun fromMap(id: String, m: Map<String, Any?>) = Attendance(
            id = id,
            staffId = m.rStr("staffId"),
            date = m.rDay("date"),
            hours = m.rNum("hours"),
            status = m.rStr("status", AttendanceStatus.PRESENT.code),
            bookingId = m.rStr("bookingId"),
            pay = m.rNum("pay"),
            recordedBy = m.rStr("recordedBy"),
            calc = CalcInfo.fromMap(m),
        )
    }
}

enum class PayType(val code: String, val te: String, val en: String) {
    DAILY("daily", "రోజు కూలి", "Daily wage"),
    MONTHLY("monthly", "నెల జీతం", "Monthly salary");

    val label: String get() = L(te, en)

    companion object {
        fun from(code: String?): PayType = entries.find { it.code == code } ?: DAILY
    }
}
