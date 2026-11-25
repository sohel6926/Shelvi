package com.example.suseelacateringcrm.session

import android.content.Context
import com.example.suseelacateringcrm.data.model.UserRole
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Tracks the currently selected branch. For STAFF and MANAGER this is always forced to
 * their assigned branch (not user-switchable). For ADMIN, null means
 * "All Branches" (combined view); a specific id drills into one branch,
 * persisted across app restarts.
 */
class BranchManager(
    sessionManager: SessionManager,
    context: Context,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _currentBranchId = MutableStateFlow(prefs.getString(KEY_SELECTED_BRANCH, null))
    val currentBranchId: StateFlow<String?> = _currentBranchId.asStateFlow()

    init {
        scope.launch {
            sessionManager.state.collect { state ->
                _currentBranchId.value = when {
                    // Staff and managers are pinned to their own branch; only the admin can switch.
                    state is SessionState.LoggedIn && state.profile.userRole != UserRole.ADMIN ->
                        state.profile.branchId.ifBlank { null }
                    state is SessionState.LoggedIn ->
                        prefs.getString(KEY_SELECTED_BRANCH, null)
                    else -> null
                }
            }
        }
    }

    /** No-op for staff callers by construction — the UI never offers a switcher to staff. */
    fun selectBranch(branchId: String?) {
        prefs.edit().putString(KEY_SELECTED_BRANCH, branchId).apply()
        _currentBranchId.value = branchId
    }

    private companion object {
        const val PREFS_NAME = "branch_prefs"
        const val KEY_SELECTED_BRANCH = "selected_branch_id"
    }
}
