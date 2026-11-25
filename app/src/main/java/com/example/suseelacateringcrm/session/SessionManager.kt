package com.example.suseelacateringcrm.session

import android.util.Log
import com.example.suseelacateringcrm.data.model.UserProfile
import com.example.suseelacateringcrm.data.repository.UserRepository
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

private const val TAG = "SessionManager"

sealed class SessionState {
    data object Loading : SessionState()
    data object LoggedOut : SessionState()
    data class LoggedIn(val profile: UserProfile) : SessionState()
    /** Reading users/{uid} failed (e.g. no internet on first start). The UI offers Retry. */
    data class Error(val cause: Throwable?) : SessionState()
}

class SessionManager(
    private val auth: FirebaseAuth,
    private val userRepository: UserRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    private var profileJob: Job? = null
    /** uids for which we already tried to create the missing users/{uid} doc (once per app run). */
    private val createdFor = mutableSetOf<String>()

    init {
        auth.addAuthStateListener { firebaseAuth ->
            val uid = firebaseAuth.currentUser?.uid
            Log.d(TAG, "authStateListener fired, uid=$uid")
            if (uid == null) {
                profileJob?.cancel()
                _state.value = SessionState.LoggedOut
            } else {
                listen(uid)
            }
        }
    }

    /** Try again after [SessionState.Error]. */
    fun retry() {
        val uid = auth.currentUser?.uid
        if (uid == null) _state.value = SessionState.LoggedOut else listen(uid)
    }

    private fun listen(uid: String) {
        profileJob?.cancel()
        _state.value = SessionState.Loading
        profileJob = scope.launch {
            userRepository.userProfileFlow(uid)
                .catch { e ->
                    Log.e(TAG, "userProfileFlow error for uid=$uid", e)
                    _state.value = SessionState.Error(e)
                }
                .collect { profile ->
                    Log.d(TAG, "userProfileFlow emitted profile=$profile")
                    if (profile != null) {
                        _state.value = SessionState.LoggedIn(profile)
                    } else {
                        // Signed in but users/{uid} doesn't exist (e.g. sign-up was interrupted):
                        // create it as a pending staff login so the owner can approve it, instead of
                        // waiting on "Loading" forever. The listener then emits the new profile.
                        createMissingProfile(uid)
                    }
                }
        }
    }

    private fun createMissingProfile(uid: String) {
        if (!createdFor.add(uid)) {
            _state.value = SessionState.Error(null)
            return
        }
        val user = auth.currentUser
        scope.launch {
            try {
                userRepository.createInitialUserDoc(
                    uid = uid,
                    name = user?.displayName?.takeIf { it.isNotBlank() } ?: user?.email?.substringBefore("@") ?: "",
                    email = user?.email ?: "",
                )
            } catch (e: Exception) {
                Log.e(TAG, "could not create users/$uid", e)
                _state.value = SessionState.Error(e)
            }
        }
    }
}
