package com.example.suseelacateringcrm.data.remote

// Round 9 (api-contract "Round 9"): order cancellation with the money step, and restore.

/** cancelBooking result: Telugu customer message ("" when not asked) and the summary line { te, en }. */
data class CancelResult(val customerMessage: String, val summary: String)

/** cancelBooking { bookingId, reasonCode, reason, advance?, refundAmount?, refundMethod?, notifyCustomer }. */
suspend fun CrmFunctions.cancelBooking(
    bookingId: String,
    reasonCode: String,
    reason: String,
    advance: String?,
    refundAmount: Double?,
    refundMethod: String?,
    notifyCustomer: Boolean,
): Result<CancelResult> = call(
    "cancelBooking",
    mapOf(
        "bookingId" to bookingId,
        "reasonCode" to reasonCode,
        "reason" to reason,
        "advance" to advance,
        "refundAmount" to refundAmount,
        "refundMethod" to refundMethod,
        "notifyCustomer" to notifyCustomer,
    ),
).map { res -> CancelResult(messageText(res["customerMessage"]), messageText(res["summary"])) }

/** restoreBooking { bookingId, reason } (admin). Returns the server's note { te, en }. */
suspend fun CrmFunctions.restoreBooking(bookingId: String, reason: String): Result<String> =
    call("restoreBooking", mapOf("bookingId" to bookingId, "reason" to reason)).map { messageText(it["note"]) }

/** A message field may be plain text or { te, en }. */
internal fun messageText(raw: Any?): String = when (raw) {
    is String -> raw
    is Map<*, *> -> com.example.suseelacateringcrm.util.L(raw.str("te").ifBlank { raw.str("en") }, raw.str("en").ifBlank { raw.str("te") })
    else -> ""
}

/**
 * postponeBooking { bookingId, newDate "YYYY-MM-DD", reason? } (A; M own branch): moves the event and its sessions,
 * keeps everything else; history logs old → new and the kitchen gets a "తేదీ మారింది" notification.
 */
suspend fun CrmFunctions.postponeBooking(bookingId: String, newDate: String, reason: String): Result<Unit> =
    call("postponeBooking", mapOf("bookingId" to bookingId, "newDate" to newDate, "reason" to reason.ifBlank { null })).map { }
