package com.example.suseelacateringcrm.util

import com.google.firebase.Timestamp
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Lenient readers for Firestore maps. The web app, Cloud Functions and this app all write these
 * documents; reading field by field (instead of toObject) means one unexpected type — a number
 * stored as text, a date stored as a Timestamp instead of "YYYY-MM-DD" — never hides a whole list.
 */
fun Map<String, Any?>.rStr(key: String, default: String = ""): String =
    when (val v = this[key]) {
        null -> default
        is String -> v
        else -> v.toString()
    }

fun Map<String, Any?>.rNum(key: String, default: Double = 0.0): Double =
    when (val v = this[key]) {
        is Number -> v.toDouble()
        is String -> v.toDoubleOrNull() ?: default
        else -> default
    }

fun Map<String, Any?>.rNumOrNull(key: String): Double? =
    when (val v = this[key]) {
        is Number -> v.toDouble()
        is String -> v.toDoubleOrNull()
        else -> null
    }

fun Map<String, Any?>.rInt(key: String, default: Int = 0): Int =
    when (val v = this[key]) {
        is Number -> v.toInt()
        is String -> v.toIntOrNull() ?: default
        else -> default
    }

fun Map<String, Any?>.rBool(key: String, default: Boolean = false): Boolean =
    when (val v = this[key]) {
        is Boolean -> v
        is String -> v.equals("true", ignoreCase = true)
        else -> default
    }

@Suppress("UNCHECKED_CAST")
fun Map<String, Any?>.rMap(key: String): Map<String, Any?> =
    (this[key] as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()

fun Map<String, Any?>.rList(key: String): List<Any?> = this[key] as? List<*> ?: emptyList<Any?>()

fun Map<String, Any?>.rMapList(key: String): List<Map<String, Any?>> =
    rList(key).mapNotNull { item -> (item as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } }

fun Map<String, Any?>.rStringList(key: String): List<String> = rList(key).mapNotNull { it?.toString() }

/** A moment stored either as a Firestore Timestamp, a Date or a "YYYY-MM-DD" string. */
fun Map<String, Any?>.rDate(key: String): Date? =
    when (val v = this[key]) {
        is Timestamp -> v.toDate()
        is Date -> v
        is String -> DayKey.parse(v)
        else -> null
    }

/** A business day as "YYYY-MM-DD" (India time) whether stored as text or as a Timestamp. */
fun Map<String, Any?>.rDay(key: String): String =
    when (val v = this[key]) {
        is String -> v
        is Timestamp -> DayKey.of(v.toDate())
        is Date -> DayKey.of(v)
        else -> ""
    }

/**
 * Business days are "YYYY-MM-DD" strings in India time (docs/data-model.md) so "which day"
 * never shifts with the phone's timezone.
 */
object DayKey {
    private val india: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")

    private fun fmt(pattern: String) = SimpleDateFormat(pattern, Locale.US).apply { timeZone = india }

    fun of(date: Date): String = fmt("yyyy-MM-dd").format(date)

    fun today(): String = of(Date())

    fun thisMonth(): String = fmt("yyyy-MM").format(Date())

    fun parse(day: String): Date? = try {
        if (day.length < 10) null else fmt("yyyy-MM-dd").parse(day.substring(0, 10))
    } catch (e: Exception) {
        null
    }

    /** Date-picker millis (UTC midnight of the picked day) → "YYYY-MM-DD". */
    fun fromPickerMillis(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(millis))

    /** "YYYY-MM-DD" → date-picker millis (UTC midnight). */
    fun toPickerMillis(day: String): Long? = try {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(day)?.time
    } catch (e: Exception) {
        null
    }

    /** "2026-11-05" → "05-11-2026" for display. */
    fun display(day: String): String =
        if (day.length >= 10) "${day.substring(8, 10)}-${day.substring(5, 7)}-${day.substring(0, 4)}" else day

    /** "YYYY-MM" shifted by [delta] months. */
    fun shiftMonth(month: String, delta: Int): String {
        val cal = Calendar.getInstance(india)
        val y = month.take(4).toIntOrNull() ?: cal.get(Calendar.YEAR)
        val m = month.drop(5).take(2).toIntOrNull() ?: (cal.get(Calendar.MONTH) + 1)
        val total = y * 12 + (m - 1) + delta
        return "%04d-%02d".format(Locale.US, total / 12, total % 12 + 1)
    }

    /** True when [today] is on or after [menuDate] + 1 year (calc-spec §11 priceReviewDue). Display only. */
    fun priceReviewDue(menuDate: String?, today: String = today()): Boolean {
        if (menuDate.isNullOrBlank() || menuDate.length < 10) return false
        val y = menuDate.take(4).toIntOrNull() ?: return false
        val due = "%04d".format(Locale.US, y + 1) + menuDate.substring(4, 10)
        return today >= due
    }
}
