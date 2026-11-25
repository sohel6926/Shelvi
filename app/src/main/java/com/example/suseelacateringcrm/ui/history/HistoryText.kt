package com.example.suseelacateringcrm.ui.history

import com.example.suseelacateringcrm.data.remote.HistoryEntry
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Collections the change-history trigger watches (api-contract Round 6 B). */
val HISTORY_COLLECTIONS = listOf(
    "bookings", "quotations", "invoices", "payments", "customers", "leads", "expenses", "purchases",
    "menuPackages", "staff", "inventory", "settings", "targets", "attendance",
)

fun collectionLabel(c: String): String = when (c) {
    "bookings" -> L("బుకింగ్", "Booking")
    "quotations" -> L("కొటేషన్", "Quotation")
    "invoices" -> L("ఇన్వాయిస్", "Invoice")
    "payments" -> L("చెల్లింపు", "Payment")
    "customers" -> L("Customer", "Customer")
    "leads" -> L("Lead", "Lead")
    "expenses" -> L("ఖర్చు", "Expense")
    "purchases" -> L("కొనుగోలు", "Purchase")
    "menuPackages" -> L("మెనూ", "Menu")
    "staff" -> L("సిబ్బంది", "Staff")
    "inventory" -> L("Stock", "Stock")
    "settings" -> L("సెట్టింగ్స్", "Settings")
    "targets" -> L("లక్ష్యం", "Target")
    "attendance" -> L("హాజరు", "Attendance")
    else -> c
}

/** Technical fields never shown in history sentences. */
private val HIDDEN_FIELDS = setOf(
    "updatedBy", "createdBy", "updatedAt", "createdAt", "lastUpdated", "branchId", "customerId",
    "assignedStaffIds", "menuItemIds", "menuSnapshot", "stockDeduction", "deletedBy", "deletedAt",
    "recordedBy", "savedBy", "staffId", "invoiceId", "bookingId", "quotationId", "linkedUserId", "id",
)

/** Telugu labels for the fields people care about (English when the app is in English). */
private val FIELD_LABELS: Map<String, Pair<String, String>> = mapOf(
    "guestCount" to ("అతిథులు" to "guests"), "guests" to ("అతిథులు" to "guests"),
    "guestCountActual" to ("వచ్చిన అతిథులు" to "actual guests"), "guestCountConfirmed" to ("ఖరారైన అతిథులు" to "confirmed guests"),
    "status" to ("స్థితి" to "status"), "quantityInStock" to ("నిల్వ" to "stock"),
    "totalAmount" to ("మొత్తం" to "total"), "total" to ("మొత్తం" to "total"), "subtotal" to ("subtotal" to "subtotal"),
    "amount" to ("మొత్తం" to "amount"), "amountPaid" to ("చెల్లించింది" to "paid"), "balanceDue" to ("బాకీ" to "balance"),
    "advancePaid" to ("అడ్వాన్స్" to "advance"), "discount" to ("తగ్గింపు" to "discount"),
    "eventDate" to ("తేదీ" to "date"), "date" to ("తేదీ" to "date"), "serveTime" to ("వడ్డించే సమయం" to "serving time"),
    "travelMinutes" to ("ప్రయాణం (నిమి.)" to "travel (min)"), "mealType" to ("భోజనం రకం" to "meal"),
    "eventType" to ("కార్యక్రమం" to "event"), "eventTypeCode" to ("కార్యక్రమం రకం" to "event type"),
    "venue" to ("వేదిక" to "venue"), "notes" to ("గమనికలు" to "notes"), "name" to ("పేరు" to "name"),
    "phone" to ("ఫోన్" to "phone"), "address" to ("చిరునామా" to "address"), "email" to ("ఇమెయిల్" to "email"),
    "customerNameSnapshot" to ("customer" to "customer"), "pricePerPlate" to ("ప్లేట్ ధర" to "plate price"),
    "minOrder" to ("కనీస order" to "minimum order"), "menuDate" to ("ధర తేదీ" to "price date"),
    "dailyWage" to ("రోజు కూలి" to "daily wage"), "monthlySalary" to ("నెల జీతం" to "monthly salary"),
    "payType" to ("జీతం రకం" to "pay type"), "jobRole" to ("పని" to "job"), "active" to ("పని చేస్తున్నారా" to "active"),
    "hours" to ("గంటలు" to "hours"), "pay" to ("కూలి" to "pay"), "method" to ("ఎలా" to "method"),
    "paymentStatus" to ("చెల్లింపు స్థితి" to "payment status"), "paymentMethod" to ("ఎలా చెల్లించారు" to "payment method"),
    "reorderLevel" to ("మళ్ళీ కొనాల్సిన స్థాయి" to "reorder level"), "unit" to ("unit" to "unit"),
    "source" to ("ఎక్కడ నుంచి" to "source"), "followUpDate" to ("మళ్ళీ మాట్లాడే తేదీ" to "follow-up"),
    "budget" to ("బడ్జెట్" to "budget"), "whatsappOptIn" to ("WhatsApp అనుమతి" to "WhatsApp opt-in"),
    "yearTarget" to ("సంవత్సర లక్ష్యం" to "year target"), "gstin" to ("GSTIN" to "GSTIN"), "upiId" to ("UPI" to "UPI"),
    "calcMode" to ("లెక్క" to "mode"), "isDeleted" to ("తీసేశారు" to "deleted"),
)

private fun fieldLabel(f: String): String = FIELD_LABELS[f]?.let { L(it.first, it.second) } ?: f

private val TE_MONTHS = listOf("జన", "ఫిబ్ర", "మార్చి", "ఏప్రి", "మే", "జూన్", "జూలై", "ఆగ", "సెప్టెం", "అక్టో", "నవం", "డిసెం")
private val EN_MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

/** "2026-11-12" → "12 నవం" / "12 Nov". */
private fun dayLabel(day: String): String {
    val m = day.substring(5, 7).toIntOrNull() ?: return day
    val d = day.substring(8, 10).toIntOrNull() ?: return day
    if (m !in 1..12) return day
    return "$d " + L(TE_MONTHS[m - 1], EN_MONTHS[m - 1])
}

private val DAY_RE = Regex("^\\d{4}-\\d{2}-\\d{2}")
private val MONEY_FIELDS = setOf("totalAmount", "total", "subtotal", "amount", "amountPaid", "balanceDue", "advancePaid",
    "discount", "pricePerPlate", "dailyWage", "monthlySalary", "pay", "budget", "yearTarget")

/** Stored value → readable text: statuses via tr(), dates, rupees, yes/no; never long ids. */
private fun valueText(field: String, v: Any?): String = when (v) {
    null -> "—"
    is Boolean -> if (v) L("అవును", "yes") else L("కాదు", "no")
    is Number -> {
        val d = v.toDouble()
        val n = if (d == Math.floor(d) && !d.isInfinite()) d.toLong().toString() else "%.2f".format(java.util.Locale.US, d)
        if (field in MONEY_FIELDS) "₹$n" else n
    }
    is String -> when {
        v.isBlank() -> "—"
        DAY_RE.containsMatchIn(v) && v.length <= 25 -> dayLabel(v)
        else -> tr(v).take(60)
    }
    else -> "…"
}

private fun actionLabel(e: HistoryEntry): String = when {
    e.kind == "override" -> L("చేతితో మార్చారు", "changed by hand")
    e.action == "create" -> L("చేర్చారు", "created")
    e.action == "delete" -> L("తీసేశారు", "deleted")
    else -> L("మార్చారు", "changed")
}

/** "Hh:mm a, d MMM" in India time. */
fun historyTime(e: HistoryEntry): String = e.at?.let {
    val cal = java.util.Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata")).apply { time = it }
    val time = SimpleDateFormat("h:mm a", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(it)
    "${cal.get(java.util.Calendar.DAY_OF_MONTH)} ${L(TE_MONTHS[cal.get(java.util.Calendar.MONTH)], EN_MONTHS[cal.get(java.util.Calendar.MONTH)])} $time"
} ?: ""

/** Who did it — a name, "server (automatic)", never a raw uid. */
private fun whoText(e: HistoryEntry): String = when {
    e.byName.isNotBlank() -> e.byName
    e.by == "system" || e.by.isBlank() -> L("సర్వర్ (ఆటోమేటిక్)", "Server (automatic)")
    else -> L("ఒక user", "A user")
}

/** Short summary of a new document: "రమేష్, 200 మంది, 12 నవం, ₹58,000". */
private fun createSummary(e: HistoryEntry): String {
    fun after(vararg keys: String): Any? = keys.firstNotNullOfOrNull { k -> e.diff[k]?.second }
    val bits = mutableListOf<String>()
    (after("customerNameSnapshot", "name", "nameTe", "nameEn", "vendorNameSnapshot", "personName") as? String)
        ?.takeIf { it.isNotBlank() }?.let { bits += it.take(40) }
    (after("guestCount", "guests") as? Number)?.let { bits += L("${it.toLong()} మంది", "${it.toLong()} guests") }
    (after("eventDate", "date", "serviceDate", "purchaseDate") as? String)?.takeIf { DAY_RE.containsMatchIn(it) }?.let { bits += dayLabel(it) }
    after("totalAmount", "total", "amount")?.let { bits += valueText("totalAmount", it) }
    (after("status") as? String)?.takeIf { it.isNotBlank() }?.let { bits += tr(it) }
    return bits.joinToString(", ")
}

private fun newLabel(c: String): String = when (c) {
    "bookings" -> L("కొత్త బుకింగ్", "New booking")
    "quotations" -> L("కొత్త కొటేషన్", "New quotation")
    "invoices" -> L("కొత్త ఇన్వాయిస్", "New invoice")
    "payments" -> L("కొత్త చెల్లింపు", "New payment")
    "customers" -> L("కొత్త customer", "New customer")
    "leads" -> L("కొత్త lead", "New lead")
    "expenses" -> L("కొత్త ఖర్చు", "New expense")
    "purchases" -> L("కొత్త కొనుగోలు", "New purchase")
    "attendance" -> L("హాజరు నమోదు", "Attendance marked")
    else -> L("కొత్తది", "New") + " " + collectionLabel(c)
}

/**
 * One Telugu sentence per entry, e.g.
 * "రాము · బుకింగ్ మార్చారు: అతిథులు 250 → 300 · 5 నవం 2:30 PM",
 * "రాము · కొత్త బుకింగ్: రమేష్, 200 మంది, 12 నవం · …".
 * Technical fields (ids, timestamps, who-fields) are never shown.
 */
fun historySentence(e: HistoryEntry): String {
    val who = whoText(e)
    val time = historyTime(e)
    val reason = if (e.reason.isNotBlank()) L(" (కారణం: ${e.reason})", " (reason: ${e.reason})") else ""
    // Final QA 13: the server's own summary { te, en } wins when present; else the wording built here.
    val serverSummary = L(e.summaryTe.ifBlank { e.summaryEn }, e.summaryEn.ifBlank { e.summaryTe }).trim()
    val body: String = when {
        serverSummary.isNotBlank() -> serverSummary
        e.action == "create" -> {
            val sum = createSummary(e)
            newLabel(e.collection) + if (sum.isNotBlank()) ": $sum" else ""
        }
        e.action == "delete" -> collectionLabel(e.collection) + " " + actionLabel(e)
        else -> {
            val stock = "stockDeduction" in e.changed || e.diff.containsKey("stockDeduction")
            val visible = e.diff.entries.filter { it.key !in HIDDEN_FIELDS }
            val parts = visible.take(6).joinToString(", ") { (field, ba) ->
                "${fieldLabel(field)} ${valueText(field, ba.first)} → ${valueText(field, ba.second)}"
            }
            val extraNames = e.changed.filter { it !in HIDDEN_FIELDS && !e.diff.containsKey(it) }.take(4).map { fieldLabel(it) }
            val more = if (visible.size > 6) L(" … ఇంకా ${visible.size - 6}", " … +${visible.size - 6} more") else ""
            val list = listOf(parts, extraNames.joinToString(", ")).filter { it.isNotBlank() }.joinToString(", ") + more
            buildString {
                append(collectionLabel(e.collection)).append(' ').append(actionLabel(e))
                if (list.isNotBlank()) append(": ").append(list)
                if (stock) append(if (list.isNotBlank()) "; " else ": ").append(L("Stock తీశారు / తిరిగి పెట్టారు", "stock taken out / put back"))
            }
        }
    }
    return buildString {
        append(who).append(" · ").append(body).append(reason)
        if (time.isNotBlank()) append(" · ").append(time)
    }
}
