package com.example.suseelacateringcrm.util

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.remote.CallableError
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** One app-wide error line (shown under the top bar by AppScaffold, tap to dismiss). */
object AppErrors {
    var message by mutableStateOf<String?>(null)
        private set

    fun show(text: String) {
        message = text
    }

    fun clear() {
        message = null
    }
}

/** Telugu/English text for an exception from Firestore, a callable or anything else. */
fun errorText(e: Throwable): String = when (e) {
    is CallableError -> e.text
    is FirebaseFirestoreException -> when (e.code) {
        FirebaseFirestoreException.Code.PERMISSION_DENIED -> L("మీకు ఈ సమాచారం చూసే / మార్చే అనుమతి లేదు.", "You don't have permission for this.")
        FirebaseFirestoreException.Code.UNAVAILABLE -> L("ఇంటర్నెట్ లేదు — సిగ్నల్ వచ్చాక మళ్ళీ ప్రయత్నించండి.", "No internet — try again when online.")
        FirebaseFirestoreException.Code.NOT_FOUND -> L("సమాచారం దొరకలేదు.", "Not found.")
        else -> L("సమాచారం తెచ్చుకోవడం / సేవ్ చేయడం కాలేదు. మళ్ళీ ప్రయత్నించండి.", "Could not load or save. Please try again.")
    }
    else -> L("ఏదో పొరపాటు జరిగింది. మళ్ళీ ప్రయత్నించండి.", "Something went wrong. Please try again.")
}

/**
 * viewModelScope.launch that never crashes the app: any exception (except cancellation) is logged,
 * passed to [onError] (e.g. to clear a loading flag) and shown as a Telugu message via [AppErrors].
 */
fun ViewModel.launchSafe(
    tag: String,
    onError: ((Throwable) -> Unit)? = null,
    block: suspend CoroutineScope.() -> Unit,
): Job = viewModelScope.launch {
    try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Log.e(tag, "background work failed", e)
        onError?.invoke(e)
        AppErrors.show(errorText(e))
    }
}
