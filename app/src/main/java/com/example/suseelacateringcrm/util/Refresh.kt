package com.example.suseelacateringcrm.util

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QuerySnapshot
import com.google.firebase.firestore.Source
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * App-wide Refresh (api-contract "Refresh"): the top-bar icon and pull-to-refresh call [refresh].
 *
 * 1. Every open Firestore listener is re-synced from the server by briefly switching the
 *    Firestore network off and on (works for every existing list/detail screen without
 *    changing them; cached data stays on screen if the server can't be reached).
 * 2. Screens that show callable results (quote preview, target board, payroll, kitchen plan …)
 *    register an extra action with [OnRefresh]; those re-call their callables.
 * 3. "చివరి update: hh:mm" is shown in the top bar afterwards.
 */
object RefreshController {
    var refreshing by mutableStateOf(false)
        private set
    /** "hh:mm" (India time) of the last successful refresh. */
    var lastUpdated by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set

    private val actions = LinkedHashMap<Int, suspend () -> Unit>()
    private var nextKey = 0

    internal fun register(action: suspend () -> Unit): Int {
        val key = nextKey++
        actions[key] = action
        return key
    }

    internal fun unregister(key: Int) {
        actions.remove(key)
    }

    fun clearMessage() {
        message = null
    }

    suspend fun refresh(firestore: FirebaseFirestore, isOnline: Boolean) {
        if (refreshing) return
        if (!isOnline) {
            message = L("ఇంటర్నెట్ లేదు — phone లో ఉన్న పాత సమాచారం చూపిస్తున్నాం", "No internet — showing the data saved on the phone")
            return
        }
        refreshing = true
        message = null
        try {
            firestore.disableNetwork().await()
            firestore.enableNetwork().await()
            actions.values.toList().forEach { action ->
                try { action() } catch (e: Exception) { message = e.message }
            }
            lastUpdated = SimpleDateFormat("hh:mm a", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(Date())
        } catch (e: Exception) {
            try { firestore.enableNetwork().await() } catch (_: Exception) { }
            message = L("Refresh కాలేదు — మళ్ళీ ప్రయత్నించండి", "Refresh failed — please try again")
        } finally {
            refreshing = false
        }
    }
}

/** Register [action] to run on Refresh while this screen is shown. */
@Composable
fun OnRefresh(action: suspend () -> Unit) {
    val latest by rememberUpdatedState(action)
    DisposableEffect(Unit) {
        val key = RefreshController.register { latest() }
        onDispose { RefreshController.unregister(key) }
    }
}

/** One-off server reads (Source.SERVER) for screens that load once instead of listening. */
suspend fun DocumentReference.getFromServer(): DocumentSnapshot = get(Source.SERVER).await()
suspend fun Query.getFromServer(): QuerySnapshot = get(Source.SERVER).await()
