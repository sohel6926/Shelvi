package com.example.suseelacateringcrm.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.util.L

/**
 * Shown to a signed-in user whose account an admin has not approved yet.
 * The session reacts live: as soon as an admin turns on "Active" in Users,
 * this screen is replaced by the dashboard.
 */
@Composable
fun PendingApprovalScreen(name: String, onLogout: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Filled.HourglassTop,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = if (name.isBlank()) L("అనుమతి కోసం ఎదురుచూస్తోంది", "Waiting for approval") else L("నమస్తే $name, అనుమతి కోసం ఎదురుచూస్తోంది", "Hi $name, waiting for approval"),
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = L(
                "మీ account తయారైంది. Owner (Admin) approve చేసిన తర్వాత CRM వాడొచ్చు.",
                "Your account is created. An admin must approve it before you can use the CRM.",
            ),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        OutlinedButton(onClick = onLogout) { Text(L("బయటకు (Log out)", "Log out")) }
    }
}
