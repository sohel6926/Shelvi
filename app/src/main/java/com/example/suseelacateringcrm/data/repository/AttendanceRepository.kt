package com.example.suseelacateringcrm.data.repository

import android.content.Context
import com.example.suseelacateringcrm.data.model.Attendance
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.CrmFunctions
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.PayrollRow
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

/** One attendance entry waiting for signal (kept on the phone until markAttendance succeeds). */
data class PendingAttendance(
    val staffId: String,
    val staffName: String,
    val date: String,
    val hours: Double,
    val status: String,
    val bookingId: String,
    /** R10-2: shift this attendance is for ("" = none). */
    val shiftId: String = "",
)

sealed class MarkOutcome {
    data class Saved(val pay: Double) : MarkOutcome()
    /** No signal: saved on the phone, sent automatically later. */
    data object Queued : MarkOutcome()
}

/**
 * Attendance is written only by the `markAttendance` callable (pay is server-owned, calc-spec §7).
 * Offline-friendly: when there is no signal the entry is kept in a small on-phone queue and sent
 * by [flushPending] when the screen opens again / the phone comes back online.
 *
 * [staffScope]: staffId for staff logins (they may only read their own rows), null otherwise.
 * [branchScope]: branch a manager is locked to, null for the admin.
 */
class AttendanceRepository(
    private val firestore: FirebaseFirestore,
    private val functions: CrmFunctions,
    context: Context,
    private val staffScope: () -> String? = { null },
    private val branchScope: () -> String? = { null },
) {
    private val prefs = context.applicationContext.getSharedPreferences("attendance_queue", Context.MODE_PRIVATE)
    private val mutex = Mutex()
    private val _pending = MutableStateFlow(readQueue())
    val pending: StateFlow<List<PendingAttendance>> = _pending.asStateFlow()

    private fun collection() = firestore.collection(FirestoreCollections.ATTENDANCE)

    /** Rows of one day ("YYYY-MM-DD"). Admin: optional [branchId] filter. */
    fun dayFlow(date: String, branchId: String?): Flow<List<Attendance>> {
        val staffId = staffScope()
        val query: Query = when {
            staffId != null -> {
                if (staffId.isBlank()) return flowOf(emptyList())
                collection().whereEqualTo("staffId", staffId).whereEqualTo("date", date)
            }
            branchScope() != null -> collection().whereEqualTo("date", date).whereEqualTo("branchId", branchScope())
            branchId != null -> collection().whereEqualTo("date", date).whereEqualTo("branchId", branchId)
            else -> collection().whereEqualTo("date", date)
        }
        return query.snapshotsFlow().map { snap -> snap.documents.map { Attendance.fromMap(it.id, it.data ?: emptyMap()) } }
    }

    suspend fun mark(entry: PendingAttendance): Result<MarkOutcome> {
        val r = functions.markAttendance(entry.staffId, entry.date, entry.hours, entry.status, entry.bookingId, shiftId = entry.shiftId)
        return r.fold(
            onSuccess = { pay ->
                removeFromQueue(entry.staffId, entry.date)
                Result.success(MarkOutcome.Saved(pay))
            },
            onFailure = { e ->
                val err = CallableError.from(e)
                if (err.isNetwork) {
                    enqueue(entry)
                    Result.success(MarkOutcome.Queued)
                } else {
                    Result.failure(err)
                }
            },
        )
    }

    /** Sends queued entries. Returns server errors for entries that were rejected (they are dropped). */
    suspend fun flushPending(): List<Pair<PendingAttendance, CallableError>> = mutex.withLock {
        val rejected = mutableListOf<Pair<PendingAttendance, CallableError>>()
        val still = mutableListOf<PendingAttendance>()
        for (p in readQueue()) {
            val r = functions.markAttendance(p.staffId, p.date, p.hours, p.status, p.bookingId, shiftId = p.shiftId)
            r.onFailure { e ->
                val err = CallableError.from(e)
                if (err.isNetwork) still += p else rejected += p to err
            }
        }
        writeQueue(still)
        rejected
    }

    suspend fun monthPayroll(month: String): Result<List<PayrollRow>> = functions.monthPayroll(month)

    // ---- tiny JSON queue in SharedPreferences -------------------------------------------------

    private suspend fun enqueue(entry: PendingAttendance) = mutex.withLock {
        val list = readQueue().filterNot { it.staffId == entry.staffId && it.date == entry.date } + entry
        writeQueue(list)
    }

    private suspend fun removeFromQueue(staffId: String, date: String) = mutex.withLock {
        val list = readQueue()
        val left = list.filterNot { it.staffId == staffId && it.date == date }
        if (left.size != list.size) writeQueue(left)
    }

    private fun readQueue(): List<PendingAttendance> = try {
        val arr = JSONArray(prefs.getString("items", "[]") ?: "[]")
        (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            PendingAttendance(
                staffId = o.optString("staffId"),
                staffName = o.optString("staffName"),
                date = o.optString("date"),
                hours = o.optDouble("hours", 0.0),
                status = o.optString("status"),
                bookingId = o.optString("bookingId"),
                shiftId = o.optString("shiftId"),
            )
        }
    } catch (e: Exception) {
        emptyList()
    }

    private fun writeQueue(list: List<PendingAttendance>) {
        val arr = JSONArray()
        list.forEach { p ->
            arr.put(
                JSONObject()
                    .put("staffId", p.staffId)
                    .put("staffName", p.staffName)
                    .put("date", p.date)
                    .put("hours", p.hours)
                    .put("status", p.status)
                    .put("bookingId", p.bookingId)
                    .put("shiftId", p.shiftId)
            )
        }
        prefs.edit().putString("items", arr.toString()).apply()
        _pending.value = list
    }
}
