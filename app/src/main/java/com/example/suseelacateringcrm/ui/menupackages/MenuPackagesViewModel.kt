package com.example.suseelacateringcrm.ui.menupackages

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.MealTab
import com.example.suseelacateringcrm.data.model.MenuPackage
import com.example.suseelacateringcrm.data.repository.MenuPackageRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

class MenuPackagesViewModel(
    private val repository: MenuPackageRepository = ServiceLocator.menuPackageRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<UiState<List<MenuPackage>>>(UiState.Loading)
    val state: StateFlow<UiState<List<MenuPackage>>> = _state.asStateFlow()

    var tab by mutableStateOf(MealTab.LUNCH)
    var seedState by mutableStateOf<UiState<Int>?>(null)
        private set

    init {
        viewModelScope.launch {
            repository.packagesFlow()
                .catch { e -> _state.value = UiState.Error(L("మెనూలు లోడ్ కాలేదు", "Could not load menus") + ": ${e.message}") }
                .collect { list -> _state.value = UiState.Success(list.sortedWith(compareBy({ it.mealType }, { it.code }))) }
        }
    }

    fun seed(context: Context) {
        viewModelScope.launch {
            seedState = UiState.Loading
            seedState = try {
                UiState.Success(repository.seedFromAssets(context, ServiceLocator.authRepository.currentUid ?: ""))
            } catch (e: Exception) {
                UiState.Error(L("మెనూలు ఎక్కించలేకపోయాం", "Could not load the menus") + ": ${e.message}")
            }
        }
    }
}

class MenuPackageDetailViewModel(
    packageId: String,
    repository: MenuPackageRepository = ServiceLocator.menuPackageRepository,
) : ViewModel() {
    private val _pkg = MutableStateFlow<UiState<MenuPackage?>>(UiState.Loading)
    val pkg: StateFlow<UiState<MenuPackage?>> = _pkg.asStateFlow()

    init {
        viewModelScope.launch {
            repository.packageFlow(packageId)
                .catch { e -> _pkg.value = UiState.Error(e.message ?: "") }
                .collect { _pkg.value = UiState.Success(it) }
        }
    }
}
