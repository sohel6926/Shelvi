package com.example.suseelacateringcrm.ui.components

import androidx.compose.runtime.Composable
import com.example.suseelacateringcrm.data.model.UserRole

/**
 * Shows [content] only for the roles in [allow]. Default stays admin-only so every existing
 * call site keeps its old behaviour; pass [UserRole.ADMIN_AND_MANAGER] for manager features.
 */
@Composable
fun RoleGate(
    currentRole: UserRole?,
    allow: Set<UserRole> = UserRole.ADMIN_ONLY,
    content: @Composable () -> Unit,
) {
    if (currentRole != null && currentRole in allow) {
        content()
    }
}
