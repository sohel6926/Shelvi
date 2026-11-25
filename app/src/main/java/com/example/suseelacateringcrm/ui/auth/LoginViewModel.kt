package com.example.suseelacateringcrm.ui.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.repository.AuthRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L

class LoginViewModel(
    private val authRepository: AuthRepository = ServiceLocator.authRepository,
) : ViewModel() {

    var email by mutableStateOf("")
    var password by mutableStateOf("")
    var name by mutableStateOf("")
    var isRegisterMode by mutableStateOf(false)
        private set
    var uiState by mutableStateOf<UiState<Unit>?>(null)
        private set
    var resetState by mutableStateOf<UiState<Unit>?>(null)
        private set

    fun toggleMode() {
        isRegisterMode = !isRegisterMode
        uiState = null
        resetState = null
    }

    fun sendPasswordReset() {
        if (email.isBlank()) {
            resetState = UiState.Error(L("ముందు పైన ఇమెయిల్ రాయండి", "Enter your email above first"))
            return
        }
        viewModelScope.launch {
            resetState = UiState.Loading
            resetState = try {
                authRepository.sendPasswordReset(email.trim())
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("Reset email పంపలేకపోయాం", "Failed to send reset email") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }

    fun submit() {
        if (isRegisterMode) register() else login()
    }

    private fun login() {
        if (email.isBlank() || password.isBlank()) {
            uiState = UiState.Error(L("ఇమెయిల్, పాస్‌వర్డ్ రాయండి", "Enter your email and password"))
            return
        }
        viewModelScope.launch {
            uiState = UiState.Loading
            uiState = try {
                authRepository.login(email.trim(), password)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("Login కాలేదు — ఇమెయిల్ / పాస్‌వర్డ్ చూడండి", "Login failed") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }

    private fun register() {
        if (name.isBlank() || email.isBlank() || password.isBlank()) {
            uiState = UiState.Error(L("అన్ని వివరాలు నింపండి", "Fill in all fields to register"))
            return
        }
        viewModelScope.launch {
            uiState = UiState.Loading
            uiState = try {
                authRepository.register(name.trim(), email.trim(), password)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("నమోదు కాలేదు", "Registration failed") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
