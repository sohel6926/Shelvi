package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rDay
import com.example.suseelacateringcrm.util.rInt
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr

enum class LeadSource(val code: String, val te: String, val en: String) {
    INSTAGRAM("instagram", "ఇన్‌స్టాగ్రామ్", "Instagram"),
    FACEBOOK("facebook", "ఫేస్‌బుక్", "Facebook"),
    GOOGLE("google", "గూగుల్", "Google"),
    REFERRAL("referral", "ఎవరో చెప్పారు", "Referral"),
    WALKIN("walkin", "నేరుగా వచ్చారు", "Walk-in"),
    JUSTDIAL("justdial", "జస్ట్‌డయల్", "JustDial"),
    OTHER("other", "ఇతర", "Other");

    val label: String get() = L(te, en)

    companion object {
        fun from(code: String?): LeadSource = entries.find { it.code == code } ?: OTHER
    }
}

enum class LeadStatus(val code: String, val te: String, val en: String) {
    // Module 1a (18 Nov 2026): pipeline order — same codes as web leadsRepository.ts and firestore.rules.
    NEW("new", "కొత్తది", "New"),
    ASSIGNED("assigned", "అప్పగించాం", "Assigned"),
    CONTACTED("contacted", "మాట్లాడాం", "Contacted"),
    REQUIREMENT("requirement", "అవసరం తెలిసింది", "Requirement"),
    TASTING("tasting", "రుచి చూపించాం", "Tasting"),
    QUALIFIED("qualified", "బుక్ అయ్యే అవకాశం", "Qualified"),
    QUOTED("quoted", "కొటేషన్ ఇచ్చాం", "Quoted"),
    WON("won", "బుక్ అయింది", "Won"),
    LOST("lost", "పోయింది", "Lost"),
    DUPLICATE("duplicate", "రెండోసారి వచ్చింది", "Duplicate"),
    INVALID("invalid", "చెల్లనిది", "Invalid");

    val label: String get() = L(te, en)

    /** Open = still needs follow-up (not won / lost / duplicate / invalid). */
    val isOpen: Boolean get() = this != WON && this != LOST && this != DUPLICATE && this != INVALID

    companion object {
        fun from(code: String?): LeadStatus = entries.find { it.code == code } ?: NEW
    }
}

/** `leads/{id}` — an enquiry before it becomes a customer/booking. Dates are "YYYY-MM-DD". */
data class Lead(
    val id: String = "",
    val name: String = "",
    val phone: String = "",
    val source: String = LeadSource.OTHER.code,
    val campaignId: String = "",
    val eventDate: String = "",
    val guests: Int = 0,
    val budget: Double = 0.0,
    val status: String = LeadStatus.NEW.code,
    val followUpDate: String = "",
    val lostReason: String = "",
    val whatsappOptIn: Boolean = false,
    /** 🔒 server stamp (R10-8): when / who (uid) ticked the WhatsApp consent. */
    val whatsappOptInAt: java.util.Date? = null,
    val whatsappOptInBy: String = "",
    val customerId: String = "",
    val notes: String = "",
    /** Module 1c: "hot" / "warm" / "cold" set by a person on the web; "" = automatic (LeadScoring). */
    val scoreManual: String = "",
    /** Module 1a 🔒 set only by the server: who handles this lead ("" = nobody yet). */
    val assignedTo: String = "",
    val assignedName: String = "",
    /** Module 1e: time of day for the follow-up, "HH:MM" (24-hour) or "". */
    val followUpTime: String = "",
    /** Module 1c 🔒 came from an Excel import (old enquiry: no late mark). */
    val imported: Boolean = false,
    val createdAt: java.util.Date? = null,
    val branchId: String = "",
) {
    val leadStatus: LeadStatus get() = LeadStatus.from(status)
    val leadSource: LeadSource get() = LeadSource.from(source)

    /**
     * Module 1b: whole minutes past the first-response limit right now (0 = in time, answered, or the rule is off).
     * Same as web leadMinutesLate: only "new" / "assigned" leads, not imported, not older than a day.
     */
    fun minutesLate(nowMs: Long, tatOn: Boolean, tatMinutes: Int): Int {
        val created = createdAt ?: return 0
        if (!tatOn || imported || status.equals("Cancelled", ignoreCase = true)) return 0
        if (leadStatus != LeadStatus.NEW && leadStatus != LeadStatus.ASSIGNED) return 0
        val age = nowMs - created.time
        if (age < 0 || age > 24L * 60 * 60 * 1000) return 0
        return maxOf(0, (age / 60000L).toInt() - tatMinutes)
    }

    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = Lead(
            id = id,
            name = m.rStr("name"),
            phone = m.rStr("phone"),
            source = m.rStr("source", LeadSource.OTHER.code),
            campaignId = m.rStr("campaignId"),
            eventDate = m.rDay("eventDate"),
            guests = m.rInt("guests"),
            budget = m.rNum("budget"),
            status = m.rStr("status", LeadStatus.NEW.code),
            followUpDate = m.rDay("followUpDate"),
            lostReason = m.rStr("lostReason"),
            whatsappOptIn = m.rBool("whatsappOptIn"),
            whatsappOptInAt = m.rDate("whatsappOptInAt"),
            whatsappOptInBy = m.rStr("whatsappOptInBy"),
            customerId = m.rStr("customerId"),
            notes = m.rStr("notes"),
            scoreManual = m.rStr("scoreManual"),
            assignedTo = m.rStr("assignedTo"),
            assignedName = m.rStr("assignedName"),
            followUpTime = m.rStr("followUpTime"),
            imported = m.rBool("imported"),
            createdAt = m.rDate("createdAt"),
            branchId = m.rStr("branchId"),
        )
    }
}

/** `leads/{id}/comments/{id}` — a team note (Module 1e). Written only by the addLeadComment callable. */
data class LeadComment(
    val id: String = "",
    val text: String = "",
    val createdByName: String = "",
    val createdAt: java.util.Date? = null,
)

/** A person a lead can be given to (leadAssignees callable). */
data class LeadAssignee(val uid: String = "", val name: String = "", val role: String = "")
