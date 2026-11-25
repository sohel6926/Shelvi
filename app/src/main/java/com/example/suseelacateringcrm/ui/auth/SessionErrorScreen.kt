package com.example.suseelacateringcrm.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.util.L

/** Shown when the signed-in user's profile could not be read or created. */
@Composable
fun SessionErrorScreen(onRetry: () -> Unit, onLogout: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            L("మీ వివరాలు తెచ్చుకోలేకపోయాం", "Could not load your account"),
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            L("ఇంటర్నెట్ చూసి మళ్ళీ ప్రయత్నించండి.", "Check the internet and try again."),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onRetry) { Text(L("మళ్ళీ ప్రయత్నించు", "Retry")) }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onLogout) { Text(L("బయటకు (Log out)", "Log out")) }
    }
}
