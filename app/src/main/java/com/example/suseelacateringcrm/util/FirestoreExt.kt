package com.example.suseelacateringcrm.util

import android.util.Log
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QuerySnapshot
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch

/**
 * Swallows and logs errors from a Firestore listener flow instead of letting them crash the
 * collector (e.g. PERMISSION_DENIED while signed out, or briefly while auth is still attaching).
 */
fun <T> Flow<T>.catchLogged(tag: String): Flow<T> = catch { e -> Log.e(tag, "Firestore flow error", e) }

fun Query.snapshotsFlow(): Flow<QuerySnapshot> = callbackFlow {
    val registration = addSnapshotListener { snapshot, error ->
        if (error != null) {
            close(error)
            return@addSnapshotListener
        }
        if (snapshot != null) trySend(snapshot)
    }
    awaitClose { registration.remove() }
}

fun com.google.firebase.firestore.DocumentReference.snapshotsFlow(): Flow<DocumentSnapshot> = callbackFlow {
    val registration = addSnapshotListener { snapshot, error ->
        if (error != null) {
            close(error)
            return@addSnapshotListener
        }
        if (snapshot != null) trySend(snapshot)
    }
    awaitClose { registration.remove() }
}
