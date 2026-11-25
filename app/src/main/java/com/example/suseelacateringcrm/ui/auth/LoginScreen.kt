package com.example.suseelacateringcrm.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    viewModel: LoginViewModel = viewModel(),
) {
    val state = viewModel.uiState
    LaunchedEffect(state) {
        if (state is UiState.Success) onLoggedIn()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = L("సుశీల క్యాటరింగ్స్ CRM", "Suseela Catering CRM"),
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(bottom = 24.dp),
        )

        if (viewModel.isRegisterMode) {
            AppTextField(value = viewModel.name, onValueChange = { viewModel.name = it }, label = L("పూర్తి పేరు", "Full name"))
        }
        AppTextField(
            value = viewModel.email,
            onValueChange = { viewModel.email = it },
            label = L("ఇమెయిల్", "Email"),
            keyboardType = KeyboardType.Email,
        )
        androidx.compose.material3.OutlinedTextField(
            value = viewModel.password,
            onValueChange = { viewModel.password = it },
            label = { Text(L("పాస్‌వర్డ్", "Password")) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        )

        if (state is UiState.Error) {
            Text(
                text = state.message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Button(
            onClick = { viewModel.submit() },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            enabled = state !is UiState.Loading,
        ) {
            if (state is UiState.Loading) {
                CircularProgressIndicator(modifier = Modifier.padding(2.dp))
            } else {
                Text(if (viewModel.isRegisterMode) L("నమోదు (Register)", "Register") else L("లోపలికి (Login)", "Login"))
            }
        }

        TextButton(onClick = { viewModel.toggleMode() }, modifier = Modifier.padding(top = 8.dp)) {
            Text(
                if (viewModel.isRegisterMode) L("ఇప్పటికే account ఉందా? Login", "Already have an account? Login") else L("కొత్తవారా? Register", "New here? Register")
            )
        }

        if (!viewModel.isRegisterMode) {
            val resetState = viewModel.resetState
            TextButton(onClick = { viewModel.sendPasswordReset() }, enabled = resetState !is UiState.Loading) {
                Text(L("పాస్‌వర్డ్ మర్చిపోయారా?", "Forgot password?"))
            }
            when (resetState) {
                is UiState.Success -> Text(
                    text = L("${viewModel.email.trim()} కి reset email పంపాం. Inbox చూడండి.", "Reset email sent to ${viewModel.email.trim()}. Check your inbox."),
                    color = MaterialTheme.colorScheme.primary,
                )
                is UiState.Error -> Text(
                    text = resetState.message,
                    color = MaterialTheme.colorScheme.error,
                )
                else -> {}
            }
        }
    }
}
