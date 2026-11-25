package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L

/** HOT / WARM / COLD for an open lead (Module 1c). */
enum class LeadBand(val te: String, val en: String) {
    HOT("HOT (వేడి)", "HOT"),
    WARM("WARM (మధ్యస్థం)", "WARM"),
    COLD("COLD (చల్లని)", "COLD");

    val label: String get() = L(te, en)
}

/**
 * Phone copy of functions/src/leads/scoreRules.ts (tested there) and web modules/leads/leadScore.ts — keep the three the same.
 * Points (max 100): event date 35 · guests 20 · budget 15 · stage 20 · source 10.  HOT ≥ 60 · WARM ≥ 35 · else COLD.
 */
object LeadScoring {
    private const val HOT_MIN = 60
    private const val WARM_MIN = 35
    private val STAGE_POINTS = mapOf("new" to 0, "assigned" to 0, "contacted" to 6, "requirement" to 10, "tasting" to 14, "qualified" to 16, "quoted" to 20)
    private val SOURCE_POINTS = mapOf("referral" to 10, "walkin" to 8, "google" to 5, "justdial" to 5, "instagram" to 4, "facebook" to 4, "other" to 2)
    private val DAY = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")

    private fun epochDay(day: String): Long? {
        val m = DAY.find(day) ?: return null
        val (y, mo, d) = m.destructured
        val cal = java.util.GregorianCalendar(java.util.TimeZone.getTimeZone("UTC"))
        cal.clear()
        cal.set(y.toInt(), mo.toInt() - 1, d.toInt())
        return Math.floorDiv(cal.timeInMillis, 86_400_000L)
    }

    /** Whole days from [today] to [day] (both "YYYY-MM-DD"); null when either is not a date. */
    fun daysUntil(day: String, today: String): Long? {
        val a = epochDay(day) ?: return null
        val b = epochDay(today) ?: return null
        return a - b
    }

    /** Automatic points 0–100; null for a closed or cancelled lead. */
    fun score(lead: Lead, today: String): Int? {
        if (!lead.leadStatus.isOpen || lead.status.equals("Cancelled", ignoreCase = true)) return null
        var points = 0
        val d = if (lead.eventDate.isNotBlank()) daysUntil(lead.eventDate, today) else null
        points += when {
            d == null || d < 0 -> 0
            d <= 7 -> 35
            d <= 30 -> 28
            d <= 90 -> 18
            else -> 8
        }
        val guests = lead.guests.takeIf { it >= 1 }
        points += when {
            guests == null -> 0
            guests >= 500 -> 20
            guests >= 200 -> 15
            guests >= 100 -> 10
            else -> 5
        }
        val budget = lead.budget.takeIf { it > 0 }
        points += when {
            budget == null -> 0
            guests == null -> 8
            budget / guests >= 300 -> 15
            budget / guests >= 150 -> 10
            else -> 5
        }
        points += STAGE_POINTS[lead.status] ?: 0
        points += SOURCE_POINTS[lead.source] ?: 2
        return minOf(100, points)
    }

    /** A band set by hand wins; otherwise from the points. */
    fun band(lead: Lead, today: String): LeadBand? {
        val score = score(lead, today) ?: return null
        return when (lead.scoreManual) {
            "hot" -> LeadBand.HOT
            "warm" -> LeadBand.WARM
            "cold" -> LeadBand.COLD
            else -> if (score >= HOT_MIN) LeadBand.HOT else if (score >= WARM_MIN) LeadBand.WARM else LeadBand.COLD
        }
    }
}
