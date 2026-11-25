package com.example.suseelacateringcrm.data.remote

import com.example.suseelacateringcrm.util.L
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import kotlinx.coroutines.tasks.await

/** Region of every callable (docs/api-contract.md). */
const val FUNCTIONS_REGION = "asia-south1"

/**
 * Error from a callable. [te]/[en] come from the server's `details = { te, en }` when present,
 * otherwise a generic bilingual message for the error code. Show [text] to the user.
 */
class CallableError(
    val code: String,
    val te: String,
    val en: String,
    cause: Throwable? = null,
    /** Extra reasons from `details.blockers` (e.g. closeEvent), each { te, en }. */
    val blockers: List<Pair<String, String>> = emptyList(),
) : Exception(en, cause) {
    val text: String get() = L(te, en)

    /** No signal / server unreachable — the request may be retried later. */
    val isNetwork: Boolean get() = code == "unavailable" || code == "deadline-exceeded"

    companion object {
        fun from(e: Throwable): CallableError {
            if (e is CallableError) return e
            if (e is FirebaseFunctionsException) {
                val details = e.details as? Map<*, *>
                val te = details?.get("te") as? String
                val en = details?.get("en") as? String
                val code = e.code.name.lowercase().replace('_', '-')
                val fallback = genericFor(code)
                return CallableError(
                    code = code,
                    te = te ?: fallback.first,
                    en = en ?: e.message?.takeIf { it.isNotBlank() } ?: fallback.second,
                    cause = e,
                    blockers = parseBlockers(details?.get("blockers")),
                )
            }
            if (e is java.io.IOException) {
                val g = genericFor("unavailable")
                return CallableError("unavailable", g.first, g.second, e)
            }
            return CallableError(
                code = "unknown",
                te = "ఏదో పొరపాటు జరిగింది. మళ్ళీ ప్రయత్నించండి.",
                en = e.message ?: "Something went wrong. Please try again.",
                cause = e,
            )
        }

        /** [{ te, en } | "text"] → list of (te, en). */
        fun parseBlockers(raw: Any?): List<Pair<String, String>> =
            (raw as? List<*>)?.mapNotNull { b ->
                when (b) {
                    is Map<*, *> -> (b["te"]?.toString() ?: b["en"]?.toString() ?: "") to (b["en"]?.toString() ?: b["te"]?.toString() ?: "")
                    is String -> b to b
                    else -> null
                }
            }?.filter { it.first.isNotBlank() } ?: emptyList()

        private fun genericFor(code: String): Pair<String, String> = when (code) {
            "unavailable", "deadline-exceeded" ->
                "ఇంటర్నెట్ లేదు. సిగ్నల్ వచ్చాక మళ్ళీ ప్రయత్నించండి." to "No internet. Please try again when you are online."
            "permission-denied" -> "మీకు ఈ పని చేసే అనుమతి లేదు." to "You don't have permission to do this."
            "unauthenticated" -> "మళ్ళీ login అవ్వండి." to "Please log in again."
            "not-found" -> "సమాచారం దొరకలేదు." to "Not found."
            "failed-precondition" -> "ఇది ఇప్పుడు చేయలేం." to "This can't be done right now."
            "invalid-argument" -> "నమోదు చేసిన వివరాలు సరిగా లేవు." to "Some details are not valid."
            "not-implemented", "unimplemented" ->
                "ఈ server పని ఇంకా సిద్ధం కాలేదు." to "This server function is not deployed yet."
            else -> "ఏదో పొరపాటు జరిగింది. మళ్ళీ ప్రయత్నించండి." to "Something went wrong. Please try again."
        }
    }
}

/**
 * Thin wrapper over Firebase callables. Every call returns [Result]; failures are always a
 * [CallableError] carrying the server's Telugu/English message. Money is never computed here —
 * the server returns the numbers.
 */
class CrmFunctions(private val functions: FirebaseFunctions) {

    suspend fun call(name: String, data: Map<String, Any?>): Result<Map<String, Any?>> = try {
        val result = functions.getHttpsCallable(name).call(clean(data)).await()
        @Suppress("UNCHECKED_CAST")
        val map = (result.getData() as? Map<String, Any?>) ?: emptyMap()
        Result.success(map)
    } catch (e: Exception) {
        Result.failure(CallableError.from(e))
    }

    /** Drop null values (the server treats a missing field as "not given"). */
    private fun clean(value: Any?): Any? = when (value) {
        is Map<*, *> -> value.entries
            .filter { it.value != null }
            .associate { it.key.toString() to clean(it.value) }
        is List<*> -> value.map { clean(it) }
        else -> value
    }

    // ---- Settings & setup -----------------------------------------------------------------

    /** setupProgress = { business, bank, signature, staff, photos: boolean, pct: number } (decision 7). */
    suspend fun saveBusinessSettings(fields: Map<String, Any?>): Result<SetupProgress> =
        call("saveBusinessSettings", fields).map { res ->
            val p = res["setupProgress"] as? Map<*, *> ?: emptyMap<String, Any?>()
            SetupProgress(
                steps = p.entries.filter { it.value is Boolean }.associate { it.key.toString() to (it.value == true) },
                pct = (p["pct"] as? Number)?.toInt(),
            )
        }

    suspend fun importRows(kind: String, rows: List<Map<String, Any?>>): Result<ImportResult> =
        call("importRows", mapOf("kind" to kind, "rows" to rows)).map { res ->
            ImportResult(
                created = res.int("created"),
                skipped = res.list("skipped").mapNotNull { it as? Map<*, *> }.map { s ->
                    val reason = s["reason"] as? Map<*, *>
                    SkippedRow(
                        row = (s["row"] as? Number)?.toInt() ?: 0,
                        te = reason?.get("te") as? String ?: "",
                        en = reason?.get("en") as? String ?: "",
                    )
                },
            )
        }

    // ---- Menus, quotations, invoices, payments ---------------------------------------------

    suspend fun quoteMenu(request: QuoteRequest): Result<QuoteResult> =
        call("quoteMenu", request.toMap()).map { QuoteResult.from(it) }

    suspend fun saveQuotation(
        quotationId: String?,
        customerId: String,
        bookingId: String?,
        menuPackageId: String,
        selections: List<Int>,
        quote: QuoteRequest,
        validDays: Int = 15,
        notes: String?,
        manual: ManualOverride? = null,
        /** Needed for booking-less quotations (contract audit 9): the currently selected branch. */
        branchId: String? = null,
    ): Result<Pair<String, String>> = call(
        "saveQuotation",
        mapOf(
            "quotationId" to quotationId,
            "customerId" to customerId,
            "bookingId" to bookingId,
            "branchId" to branchId,
            "menuPackageId" to menuPackageId,
            "selections" to selections,
            "quote" to quote.toMap(),
            "validDays" to validDays,
            "notes" to notes?.takeIf { it.isNotBlank() },
        ) + (manual?.toFields("total") ?: emptyMap()),
    ).map { it.str("quotationId") to it.str("quotationNumber") }

    /** Re-save an existing quotation exactly as stored, only changing the manual/auto total. */
    suspend fun resaveQuotationTotal(
        quotationId: String,
        customerId: String,
        bookingId: String?,
        menuPackageId: String,
        selections: List<Int>,
        storedQuote: Map<String, Any?>,
        manual: ManualOverride,
        /** Multi-session quotation: every session's stored input (the server needs bookingId with these). */
        sessions: List<Map<String, Any?>> = emptyList(),
    ): Result<Pair<String, String>> = call(
        "saveQuotation",
        mapOf(
            "quotationId" to quotationId,
            "customerId" to customerId,
            "bookingId" to bookingId?.takeIf { it.isNotBlank() },
            "menuPackageId" to menuPackageId,
            "selections" to selections,
            "quote" to storedQuote,
        ) + (if (sessions.isNotEmpty()) mapOf("sessions" to sessions) else emptyMap()) + manual.toFields("total"),
    ).map { it.str("quotationId") to it.str("quotationNumber") }

    /** api-contract "Manual and automatic mode": overrideInvoiceTotal { invoiceId, total, reason }. */
    suspend fun overrideInvoiceTotal(invoiceId: String, manual: ManualOverride): Result<Unit> = call(
        "overrideInvoiceTotal",
        mapOf("invoiceId" to invoiceId, "total" to manual.value, "reason" to manual.reason) + manual.autoFlag(),
    ).map { }

    /** overridePayrollRow { month, staffId, net, reason }. */
    suspend fun overridePayrollRow(month: String, staffId: String, manual: ManualOverride): Result<Unit> = call(
        "overridePayrollRow",
        mapOf("month" to month, "staffId" to staffId, "net" to manual.value, "reason" to manual.reason) + manual.autoFlag(),
    ).map { }

    /** saveCookingPlan { bookingId, items: [{ dishId, quantity, manual }] } (+ reason for manual lines). */
    suspend fun saveCookingPlan(bookingId: String, items: List<PlanLine>, reason: String?): Result<Unit> = call(
        "saveCookingPlan",
        mapOf(
            "bookingId" to bookingId,
            "items" to items.map { mapOf("dishId" to it.dishId, "quantity" to it.quantity, "manual" to it.manual) },
            "reason" to reason?.takeIf { it.isNotBlank() },
        ),
    ).map { }

    /**
     * setYearTarget with the FULL manualMonths[12] (api-contract "Switching back to automatic"):
     * [existingManualMonths] = targets/{year}.manualMonths as stored (typed months kept); only
     * [monthIndex] is changed — to the typed whole-rupee value, or null to switch it back to automatic.
     */
    suspend fun setMonthTargetManual(
        year: Int,
        yearTarget: Double,
        existingManualMonths: List<Long?>,
        monthIndex: Int,
        manual: ManualOverride,
    ): Result<Unit> {
        val months: List<Long?> = (0 until 12).map { i ->
            if (i == monthIndex) manual.value?.let { kotlin.math.round(it).toLong() }
            else existingManualMonths.getOrNull(i)
        }
        return call(
            "setYearTarget",
            mapOf(
                "year" to year,
                "yearTarget" to kotlin.math.round(yearTarget).toLong(),
                "manualMonths" to months,
                "manual" to mapOf("reason" to manual.reason),
            ),
        ).map { }
    }

    // ---- Round 6: event stock + change history ------------------------------------------------

    /**
     * applyEventStock { bookingId, items?: [{ groceryItemId, quantity }], reason? } (A, M).
     * No [items] = automatic quantities (calc §6); with items = manual quantities (reason ≥ 3 chars).
     */
    suspend fun applyEventStock(bookingId: String, items: List<Pair<String, Double>>?, reason: String?): Result<Unit> = call(
        "applyEventStock",
        mapOf(
            "bookingId" to bookingId,
            "items" to items?.map { (id, q) -> mapOf("groceryItemId" to id, "quantity" to q) },
            "reason" to reason?.takeIf { it.isNotBlank() },
        ),
    ).map { }

    /** reverseEventStock { bookingId, reason } (A) — puts the stock back, stockDeduction.reversed = true. */
    suspend fun reverseEventStock(bookingId: String, reason: String): Result<Unit> = call(
        "reverseEventStock",
        mapOf("bookingId" to bookingId, "reason" to reason),
    ).map { }

    /** getHistory { collection?, docId?, by?, fromDay?, toDay?, limit ≤ 200, startAfter? } (A). */
    suspend fun getHistory(
        collection: String? = null,
        docId: String? = null,
        by: String? = null,
        fromDay: String? = null,
        toDay: String? = null,
        limit: Int = 50,
        startAfter: Any? = null,
    ): Result<HistoryPage> = call(
        "getHistory",
        mapOf(
            "collection" to collection,
            "docId" to docId,
            "by" to by,
            "fromDay" to fromDay,
            "toDay" to toDay,
            "limit" to limit.coerceIn(1, 200),
            "startAfter" to startAfter,
        ),
    ).map { res ->
        HistoryPage(
            entries = res.list("entries").mapNotNull { it as? Map<*, *> }.map { HistoryEntry.from(it) },
            nextCursor = res["nextCursor"],
        )
    }

    /**
     * getServiceTimeline { bookingId } → steps of calc §12 with settings.timelineDefaults applied
     * (the one implementation — the app no longer computes the timeline itself).
     */
    suspend fun getServiceTimeline(bookingId: String): Result<ServiceTimelineResult> =
        call("getServiceTimeline", mapOf("bookingId" to bookingId)).map { m ->
            ServiceTimelineResult(
                steps = m.list("steps").mapNotNull { it as? Map<*, *> }.map { s ->
                    TimelineStep(s.str("key"), s.str("day"), s.str("time"), s.str("te"), s.str("en"), s.str("role"))
                },
                serveTime = m.str("serveTime"),
                travelMinutes = m.int("travelMinutes"),
                mealType = m.str("mealType"),
            )
        }

    // ---- Round 7 ------------------------------------------------------------------------------

    /** R7-3: cancel (transactions) or archive (master data) with a reason; server reverses stock where relevant. */
    suspend fun cancelRecord(collection: String, id: String, reason: String): Result<Unit> =
        call("cancelRecord", mapOf("collection" to collection, "id" to id, "reason" to reason)).map { }

    /** R7-6: create/update an outside order. Returns its id. */
    suspend fun saveOutsideOrder(fields: Map<String, Any?>): Result<String> =
        call("saveOutsideOrder", fields).map { it.str("id").ifBlank { it.str("orderId") } }

    /** R7-6: what arrived, what was accepted / returned (and why). */
    suspend fun recordOutsideDelivery(
        id: String,
        deliveredQty: Double,
        acceptedQty: Double,
        returnedQty: Double,
        rejectReason: String?,
    ): Result<Unit> = call(
        "recordOutsideDelivery",
        mapOf(
            "id" to id, "deliveredQty" to deliveredQty, "acceptedQty" to acceptedQty,
            "returnedQty" to returnedQty, "rejectReason" to rejectReason?.takeIf { it.isNotBlank() },
        ),
    ).map { }

    /** R7-7: guest count now (A, M, assigned staff). */
    suspend fun logGuestCount(bookingId: String, sessionId: String?, count: Int, note: String?): Result<Unit> = call(
        "logGuestCount",
        mapOf("bookingId" to bookingId, "sessionId" to sessionId?.takeIf { it.isNotBlank() }, "count" to count, "note" to note?.takeIf { it.isNotBlank() }),
    ).map { }

    /** R7-7: extra item asked for at the venue (A, M, assigned staff). */
    suspend fun addEventExtra(
        bookingId: String,
        sessionId: String?,
        item: String,
        qty: Double,
        rate: Double,
        customerApprovedBy: String,
    ): Result<Unit> = call(
        "addEventExtra",
        mapOf(
            "bookingId" to bookingId, "sessionId" to sessionId?.takeIf { it.isNotBlank() }, "item" to item,
            "qty" to qty, "rate" to rate,
            // Server wants { name, phone? }; the form has one line "name / phone".
            "customerApprovedBy" to customerApprovedBy.split('/', ',').map { it.trim() }.let { parts ->
                val phone = parts.drop(1).firstOrNull { p -> p.count(Char::isDigit) >= 6 }
                mapOf("name" to parts.first(), "phone" to phone)
            },
        ),
    ).map { }

    /** R7-7: manager / owner approves or rejects an extra. */
    suspend fun approveEventExtra(bookingId: String, extraId: String, approved: Boolean): Result<Unit> = call(
        "approveEventExtra",
        mapOf("bookingId" to bookingId, "extraId" to extraId, "approve" to approved),
    ).map { }

    /** R7-8: owner pays a vendor; allocations say which bills it covers. */
    suspend fun recordVendorPayment(
        vendorId: String,
        vendorName: String,
        amount: Double,
        date: String,
        method: String,
        allocations: List<Triple<String, String, Double>>,
        note: String?,
    ): Result<Unit> = call(
        "recordVendorPayment",
        mapOf(
            "vendorId" to vendorId, "vendorName" to vendorName, "amount" to amount, "date" to date, "method" to method,
            "allocations" to allocations.map { (c, id, a) -> mapOf("collection" to c, "id" to id, "amount" to a) },
            "note" to note?.takeIf { it.isNotBlank() },
        ),
    ).map { }

    /** R7-8: what we owe each vendor. */
    suspend fun getVendorDues(vendorId: String? = null): Result<List<VendorDue>> =
        call("getVendorDues", mapOf("vendorId" to vendorId)).map { res ->
            (res["vendors"] as? List<*> ?: res["dues"] as? List<*> ?: emptyList<Any?>())
                .mapNotNull { it as? Map<*, *> }.map { VendorDue.from(it) }
        }

    /** R7-9: close an event (owner). Blockers come back as an error with details.blockers. */
    suspend fun closeEvent(bookingId: String, vendorBillsEntered: Boolean, overrideReason: String?): Result<Unit> = call(
        "closeEvent",
        mapOf(
            "bookingId" to bookingId,
            "confirm" to mapOf("vendorBillsEntered" to vendorBillsEntered),
            "overrideReason" to overrideReason?.takeIf { it.isNotBlank() },
        ),
    ).map { }

    suspend fun reopenEvent(bookingId: String, reason: String): Result<Unit> =
        call("reopenEvent", mapOf("bookingId" to bookingId, "reason" to reason)).map { }

    /** R7-5: timeline of one meal session. */
    suspend fun getSessionTimeline(bookingId: String, sessionId: String): Result<ServiceTimelineResult> =
        call("getServiceTimeline", mapOf("bookingId" to bookingId, "sessionId" to sessionId)).map { m ->
            ServiceTimelineResult(
                steps = m.list("steps").mapNotNull { it as? Map<*, *> }.map { s ->
                    TimelineStep(s.str("key"), s.str("day"), s.str("time"), s.str("te"), s.str("en"), s.str("role"))
                },
                serveTime = m.str("serveTime"),
                travelMinutes = m.int("travelMinutes"),
                mealType = m.str("mealType"),
            )
        }

    /** Admin: refund or adjustment, stored by the server as a negative payment with type "refund". */
    suspend fun refundOrAdjust(invoiceId: String, amount: Double, reason: String): Result<PaymentResult> = call(
        "refundOrAdjust",
        mapOf("invoiceId" to invoiceId, "amount" to amount, "reason" to reason),
    ).map { PaymentResult(it.num("newPaid"), it.num("newBalance"), it.str("status")) }

    suspend fun generateInvoiceFromBooking(bookingId: String): Result<Pair<String, String>> =
        call("generateInvoiceFromBooking", mapOf("bookingId" to bookingId))
            .map { it.str("invoiceId") to it.str("invoiceNumber") }

    /** [method] is one of Cash, UPI, BankTransfer, Card, Other. [date] is YYYY-MM-DD (India). */
    suspend fun recordPayment(
        invoiceId: String,
        amount: Double,
        method: String,
        date: String,
        note: String?,
    ): Result<PaymentResult> = call(
        "recordPayment",
        mapOf(
            "invoiceId" to invoiceId,
            "amount" to amount,
            "method" to method,
            "date" to date,
            "note" to note?.takeIf { it.isNotBlank() },
        ),
    ).map { PaymentResult(it.num("newPaid"), it.num("newBalance"), it.str("status")) }

    // ---- Kitchen ----------------------------------------------------------------------------

    suspend fun saveCookLog(
        bookingId: String,
        guestCountActual: Int?,
        entries: List<CookLogEntry>,
    ): Result<Int> = call(
        "saveCookLog",
        mapOf(
            "bookingId" to bookingId,
            "guestCountActual" to guestCountActual,
            "entries" to entries.map { mapOf("dishId" to it.dishId, "cooked" to it.cooked, "leftover" to it.leftover) },
        ),
    ).map { it.list("updatedDishes").size }

    suspend fun cookingPlan(
        guests: Int,
        eventTypeCode: String,
        dishIds: List<String>? = null,
        menuPackageId: String? = null,
    ): Result<List<CookingPlanItem>> = call(
        "cookingPlan",
        mapOf(
            "guests" to guests,
            "eventTypeCode" to eventTypeCode,
            "dishIds" to dishIds?.takeIf { it.isNotEmpty() },
            "menuPackageId" to menuPackageId,
        ),
    ).map { res ->
        res.list("items").mapNotNull { it as? Map<*, *> }.map { m ->
            CookingPlanItem(
                calc = com.example.suseelacateringcrm.data.model.CalcInfo.fromMap(m),
                dishId = m.str("dishId"),
                nameTe = m.str("nameTe"),
                nameEn = m.str("nameEn"),
                unit = m.str("unit"),
                quantity = m.num("quantity"),
                learnedPer100 = m.num("learnedPer100"),
                changePct = m.num("changePct"),
                advice = m.str("advice"),
                eventsUsed = m.int("eventsUsed"),
            )
        }
    }

    suspend fun groceryList(guests: Int, eventTypeCode: String): Result<List<GroceryNeed>> =
        call("groceryList", mapOf("guests" to guests, "eventTypeCode" to eventTypeCode)).map { res ->
            res.list("items").mapNotNull { it as? Map<*, *> }.map { m ->
                GroceryNeed(
                    groceryItemId = m.str("groceryItemId"),
                    nameTe = m.str("nameTe"),
                    nameEn = m.str("nameEn"),
                    unit = m.str("unit"),
                    quantity = m.num("quantity"),
                    inStock = m.num("inStock"),
                    toBuy = m.num("toBuy"),
                )
            }
        }

    // ---- Staff ------------------------------------------------------------------------------

    suspend fun markAttendance(
        staffId: String,
        date: String,
        hours: Double,
        status: String,
        bookingId: String?,
        manual: ManualOverride? = null,
        /** R10-2: the shift this attendance is for. */
        shiftId: String? = null,
    ): Result<Double> = call(
        "markAttendance",
        mapOf(
            "staffId" to staffId,
            "date" to date,
            "hours" to hours,
            "status" to status,
            "bookingId" to bookingId?.takeIf { it.isNotBlank() },
            "shiftId" to shiftId?.takeIf { it.isNotBlank() },
        ) + (manual?.toFields("pay") ?: emptyMap()),
    ).map { it.num("pay") }

    suspend fun monthPayroll(month: String): Result<List<PayrollRow>> =
        call("monthPayroll", mapOf("month" to month)).map { res ->
            res.list("rows").mapNotNull { it as? Map<*, *> }.map { m ->
                PayrollRow(
                    calc = com.example.suseelacateringcrm.data.model.CalcInfo.fromMap(m),
                    staffId = m.str("staffId"),
                    name = m.str("name"),
                    payType = m.str("payType"),
                    gross = m.num("gross"),
                    cut = m.num("cut"),
                    ot = m.num("ot"),
                    advances = m.num("advances"),
                    advanceCarry = m.num("advanceCarry"),
                    net = m.num("net"),
                    finalized = m["finalized"] == true,
                    finalNet = m.num("finalNet"),
                    paid = m.num("paid"),
                )
            }
        }

    /** recordSalaryPayment { month, staffId, amount, date, method, note? } (owner). */
    suspend fun recordSalaryPayment(month: String, staffId: String, amount: Double, date: String, method: String, note: String): Result<Unit> = call(
        "recordSalaryPayment",
        mapOf("month" to month, "staffId" to staffId, "amount" to amount, "date" to date, "method" to method, "note" to note.trim().takeIf { it.isNotEmpty() }),
    ).map { }

    /** saveMaster { kind, id?, data } (owner): add (no id) or change a company / brand / branch / kitchen / store. The server checks every field. */
    suspend fun saveMaster(kind: String, id: String?, data: Map<String, Any?>): Result<Unit> = call(
        "saveMaster",
        mapOf("kind" to kind, "id" to id, "data" to data),
    ).map { }

    /** setMasterStatus { kind, id, status, reason } (owner): kind company|brand|branch|kitchen|store; status draft|active|inactive|archived. Nothing is deleted. */
    suspend fun setMasterStatus(kind: String, id: String, status: String, reason: String): Result<Unit> = call(
        "setMasterStatus",
        mapOf("kind" to kind, "id" to id, "status" to status, "reason" to reason.trim()),
    ).map { }

    // ---- Targets ----------------------------------------------------------------------------

    suspend fun getTargetBoard(month: String): Result<TargetBoard> =
        call("getTargetBoard", mapOf("month" to month)).map { m ->
            // Contract decision 5: events/bookings = { actual, target|null }; with percentOnly the
            // rupee fields are null and incomePct / profitPct are filled.
            fun count(key: String): CountVsTarget = when (val v = m[key]) {
                is Map<*, *> -> CountVsTarget(v.int("actual"), (v["target"] as? Number)?.toInt())
                is Number -> CountVsTarget(v.toInt(), null)
                else -> CountVsTarget(0, null)
            }
            TargetBoard(
                yearTarget = m.numOrNull("yearTarget"),
                yearActual = m.numOrNull("yearActual"),
                monthTarget = m.numOrNull("monthTarget"),
                monthActual = m.numOrNull("monthActual"),
                profitTarget = m.numOrNull("profitTarget"),
                profitActual = m.numOrNull("profitActual"),
                events = count("events"),
                bookings = count("bookings"),
                daysLeft = m.int("daysLeft"),
                dailyNeeded = m.numOrNull("dailyNeeded"),
                hitTarget = m["hitTarget"] == true,
                percentOnly = m["percentOnly"] == true,
                incomePct = m.numOrNull("incomePct"),
                profitPct = m.numOrNull("profitPct"),
                yearPct = m.numOrNull("yearPct"),
                year = m.int("year").takeIf { it > 0 },
                // Month-target stamp (contract audit 5): monthCalcMode / monthAutoValue.
                monthTargetCalc = com.example.suseelacateringcrm.data.model.CalcInfo(
                    manual = m["monthCalcMode"] == "manual",
                    autoValue = m.numOrNull("monthAutoValue"),
                ),
                todayTarget = m.numOrNull("todayTarget"),
                todayActual = m.numOrNull("todayActual"),
                todayPct = m.numOrNull("todayPct"),
                todayHit = m["todayHit"] == true,
                aheadOrBehind = m.numOrNull("aheadOrBehind"),
                aheadStatus = m["aheadStatus"] as? String,
                showProfit = m["showProfit"] == true,
            )
        }
}

// ---- Request / response shapes (docs/api-contract.md) -------------------------------------

/**
 * A hand-typed value. [value] == null means "Switch to automatic" (restore the server's autoValue).
 * Wire format (api-contract, "Manual and automatic mode"): `manual: { <field>: value, reason }`.
 * Switching back: saveQuotation is simply sent without `manual`; overrideInvoiceTotal /
 * overridePayrollRow send `auto: true`; setYearTarget sends the month as null.
 */
data class ManualOverride(val value: Double?, val reason: String) {
    fun toFields(field: String): Map<String, Any?> =
        if (value == null) emptyMap()
        else mapOf("manual" to mapOf(field to value, "reason" to reason))

    fun autoFlag(): Map<String, Any?> = if (value == null) mapOf("auto" to true) else emptyMap()
}

data class PlanLine(val dishId: String, val quantity: Double, val manual: Boolean)

data class HistoryPage(val entries: List<HistoryEntry>, val nextCursor: Any?)

/** One unpaid bill of a vendor (purchase / expense / outside order). */
data class VendorBill(val collection: String, val id: String, val label: String, val date: String, val amount: Double, val paid: Double, val balance: Double)

/** getVendorDues row (R7-8). */
data class VendorDue(
    val vendorId: String,
    val vendorName: String,
    val bills: List<VendorBill>,
    val billCount: Int,
    val billed: Double,
    val paid: Double,
    val outstanding: Double,
    val oldestDue: String,
) {
    companion object {
        fun from(m: Map<*, *>): VendorDue {
            val billList = (m["bills"] as? List<*>)?.mapNotNull { it as? Map<*, *> }?.map { b ->
                VendorBill(
                    collection = b.str("collection"),
                    id = b.str("id"),
                    label = b.str("label").ifBlank { b.str("number").ifBlank { b.str("billNumber") } },
                    date = b.str("date"),
                    amount = b.num("amount").takeIf { it > 0 } ?: b.num("total"),
                    paid = b.num("paid"),
                    balance = b.num("balance"),
                )
            } ?: emptyList()
            return VendorDue(
                vendorId = m.str("vendorId"),
                vendorName = m.str("vendorName"),
                bills = billList,
                billCount = (m["bills"] as? Number)?.toInt() ?: billList.size,
                billed = m.num("billed").takeIf { it > 0 } ?: m.num("total"),
                paid = m.num("paid"),
                outstanding = m.num("outstanding"),
                oldestDue = m.str("oldestDue").ifBlank { m.str("oldestDueDate") },
            )
        }
    }
}

/** One step of the service timeline: day "YYYY-MM-DD", time "HH:MM", role manager|cook|helper|driver|all. */
data class TimelineStep(val key: String, val day: String, val time: String, val te: String, val en: String, val role: String) {
    val text: String get() = com.example.suseelacateringcrm.util.L(te, en)
}

data class ServiceTimelineResult(
    val steps: List<TimelineStep>,
    val serveTime: String,
    val travelMinutes: Int,
    val mealType: String,
)

/** One auditLog entry from getHistory (api-contract Round 6 B). */
data class HistoryEntry(
    val id: String,
    val kind: String,
    val collection: String,
    val docId: String,
    val action: String,
    val changed: List<String>,
    /** field → (before, after) */
    val diff: Map<String, Pair<Any?, Any?>>,
    val by: String,
    val byName: String,
    val at: java.util.Date?,
    val reason: String,
    /** Server-written one-line description (getHistory `summary {te, en}`); blank on older entries. */
    val summaryTe: String = "",
    val summaryEn: String = "",
) {
    companion object {
        fun from(m: Map<*, *>): HistoryEntry {
            val summary = m["summary"] as? Map<*, *>
            val diff = (m["diff"] as? Map<*, *>)?.entries?.associate { (k, v) ->
                val d = v as? Map<*, *>
                k.toString() to (d?.get("before") to d?.get("after"))
            } ?: emptyMap()
            return HistoryEntry(
                id = m.str("id"),
                kind = m.str("kind").ifBlank { "change" },
                collection = m.str("collection"),
                docId = m.str("docId"),
                action = m.str("action"),
                changed = m.list("changed").mapNotNull { it?.toString() },
                diff = diff,
                by = m.str("by"),
                byName = m.str("byName"),
                at = parseWhen(m["at"]),
                reason = m.str("reason").ifBlank { m.str("overrideReason") },
                summaryTe = (summary?.get("te") as? String).orEmpty(),
                summaryEn = (summary?.get("en") as? String).orEmpty(),
            )
        }

        /** Callable results carry times as ISO text, millis, or {_seconds}/{seconds}. */
        private fun parseWhen(v: Any?): java.util.Date? = when (v) {
            is Number -> java.util.Date(v.toLong())
            is String -> try {
                java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
                    .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                    .parse(v.take(19))
            } catch (e: Exception) {
                null
            }
            is Map<*, *> -> ((v["_seconds"] ?: v["seconds"]) as? Number)?.let { java.util.Date(it.toLong() * 1000) }
            else -> null
        }
    }
}

data class ImportResult(val created: Int, val skipped: List<SkippedRow>)
data class SkippedRow(val row: Int, val te: String, val en: String)

data class QuoteExtra(val key: String, val qty: Int, val price: Double? = null)

/**
 * R10-11 special meal in a quote request (server parseSpecialMeals): type no-onion-garlic | jain | allergy | diabetic | other,
 * count ≥ 1 (inside the plates), optional kitchen note, optional owner-set extraPerPlate (₹, > 0; absent = included).
 */
data class QuoteSpecialMeal(val type: String, val count: Int, val note: String = "", val extraPerPlate: Double? = null) {
    fun toMap(): Map<String, Any?> = buildMap {
        put("type", type)
        put("count", count)
        if (note.isNotBlank()) put("note", note.trim())
        if (extraPerPlate != null && extraPerPlate > 0) put("extraPerPlate", extraPerPlate)
    }
}

/** The `quoteMenu` request — also embedded as `quote` in `saveQuotation`. */
data class QuoteRequest(
    val menuPackageId: String,
    val plates: Int,
    val servingBoys: Int,
    val transport: Double,
    val replacements: List<String>,
    val extras: List<QuoteExtra>,
    val discount: Double?,
    /** R10-11: kids plates on top of `plates` (package kidsPrice); sent only when > 0. */
    val kidsCount: Int = 0,
    /** R10-11: special meals counted inside `plates`; sent only when not empty. */
    val specialMeals: List<QuoteSpecialMeal> = emptyList(),
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "menuPackageId" to menuPackageId,
        "plates" to plates,
        "servingBoys" to servingBoys,
        "transport" to transport,
        "replacements" to replacements,
        "extras" to extras.map { mapOf("key" to it.key, "qty" to it.qty, "price" to it.price) },
        "discount" to discount,
    ) + (if (kidsCount > 0) mapOf("kidsCount" to kidsCount) else emptyMap()) +
        (if (specialMeals.isNotEmpty()) mapOf("specialMeals" to specialMeals.map { it.toMap() }) else emptyMap())
}

data class QuoteLine(val item: String, val qty: Double, val rate: Double, val amount: Double)

data class QuoteResult(
    val belowMinimum: Boolean,
    val freePlates: Int,
    val platesToCook: Int,
    val freeServingBoys: Int,
    val chargedServingBoys: Int,
    val lines: List<QuoteLine>,
    val subtotal: Double,
    val taxable: Double,
    val cgst: Double,
    val sgst: Double,
    val igst: Double,
    val tax: Double,
    val total: Double,
    val priceReviewDue: Boolean,
) {
    companion object {
        fun from(m: Map<String, Any?>): QuoteResult {
            val totals = m["totals"] as? Map<*, *> ?: emptyMap<String, Any?>()
            return QuoteResult(
                belowMinimum = m["belowMinimum"] == true,
                freePlates = m.int("freePlates"),
                platesToCook = m.int("platesToCook"),
                freeServingBoys = m.int("freeServingBoys"),
                chargedServingBoys = m.int("chargedServingBoys"),
                lines = m.list("lines").mapNotNull { it as? Map<*, *> }.map { l ->
                    QuoteLine(l.str("item"), l.num("qty"), l.num("rate"), l.num("amount"))
                },
                subtotal = m.num("subtotal"),
                taxable = totals.num("taxable"),
                cgst = totals.num("cgst"),
                sgst = totals.num("sgst"),
                igst = totals.num("igst"),
                tax = totals.num("tax"),
                total = totals.num("total"),
                priceReviewDue = m["priceReviewDue"] == true,
            )
        }
    }
}

data class PaymentResult(val newPaid: Double, val newBalance: Double, val status: String)

data class CookLogEntry(val dishId: String, val cooked: Double, val leftover: Double)

data class CookingPlanItem(
    val calc: com.example.suseelacateringcrm.data.model.CalcInfo,
    val dishId: String,
    val nameTe: String,
    val nameEn: String,
    val unit: String,
    val quantity: Double,
    val learnedPer100: Double,
    val changePct: Double,
    val advice: String,
    val eventsUsed: Int,
)

data class GroceryNeed(
    val groceryItemId: String,
    val nameTe: String,
    val nameEn: String,
    val unit: String,
    val quantity: Double,
    val inStock: Double,
    val toBuy: Double,
)

data class PayrollRow(
    val calc: com.example.suseelacateringcrm.data.model.CalcInfo,
    val staffId: String,
    val name: String,
    val payType: String,
    val gross: Double,
    val cut: Double,
    val ot: Double,
    val advances: Double,
    val net: Double,
    /** R10-1: advance left over for next month (pay was not enough). */
    val advanceCarry: Double = 0.0,
    /** Module 4e: from the stored payslip — month finalized for this person, the fixed net pay, and what was handed over. */
    val finalized: Boolean = false,
    val finalNet: Double = 0.0,
    val paid: Double = 0.0,
) {
    /** What is still to be handed over (never below 0). */
    val due: Double get() = (kotlin.math.round((finalNet - paid) * 100) / 100.0).coerceAtLeast(0.0)
}

data class CountVsTarget(val actual: Int, val target: Int?)

/** Rupee fields are null when [percentOnly] (manager). [incomePct]/[profitPct] are then filled. */
data class TargetBoard(
    val yearTarget: Double?,
    val yearActual: Double?,
    val monthTarget: Double?,
    val monthActual: Double?,
    val profitTarget: Double?,
    val profitActual: Double?,
    val events: CountVsTarget,
    val bookings: CountVsTarget,
    val daysLeft: Int,
    val dailyNeeded: Double?,
    val hitTarget: Boolean,
    val percentOnly: Boolean,
    val incomePct: Double?,
    val profitPct: Double?,
    val yearPct: Double?,
    val year: Int?,
    val monthTargetCalc: com.example.suseelacateringcrm.data.model.CalcInfo,
    /** Round 11 (server role filter): today's target / sales, ahead-behind of the year plan, profit visibility. */
    val todayTarget: Double? = null,
    val todayActual: Double? = null,
    val todayPct: Double? = null,
    val todayHit: Boolean = false,
    val aheadOrBehind: Double? = null,
    /** "ahead" | "behind" | "onTrack" */
    val aheadStatus: String? = null,
    val showProfit: Boolean = false,
)

/** saveBusinessSettings response (contract decision 7). */
data class SetupProgress(val steps: Map<String, Boolean>, val pct: Int?)

// ---- Loose map readers (callable results arrive as Map<String, Any?> with Int/Long/Double) ----

internal fun Map<*, *>.num(key: String): Double = (this[key] as? Number)?.toDouble() ?: 0.0
internal fun Map<*, *>.numOrNull(key: String): Double? = (this[key] as? Number)?.toDouble()
internal fun Map<*, *>.int(key: String): Int = (this[key] as? Number)?.toInt() ?: 0
internal fun Map<*, *>.str(key: String): String = this[key]?.toString() ?: ""
internal fun Map<*, *>.list(key: String): List<Any?> = this[key] as? List<*> ?: emptyList<Any?>()
