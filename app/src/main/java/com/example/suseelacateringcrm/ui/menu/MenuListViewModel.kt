package com.example.suseelacateringcrm.ui.menu

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.MenuItem
import com.example.suseelacateringcrm.data.repository.MenuRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class MenuListViewModel(
    private val menuRepository: MenuRepository = ServiceLocator.menuRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<List<MenuItem>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<MenuItem>>> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            menuRepository.menuItemsFlow()
                .catch { e -> _uiState.value = UiState.Error(L("మెనూ లోడ్ కాలేదు", "Failed to load menu") + (e.message?.let { ": $it" } ?: "")) }
                .collect { items ->
                    _uiState.value = UiState.Success(items.sortedWith(compareBy({ it.category }, { it.name })))
                }
        }
    }

    var showArchived by androidx.compose.runtime.mutableStateOf(false)

    /** R7-3: archive with a reason (cancelRecord), never a hard delete. */
    fun archiveItem(itemId: String, reason: String) {
        launchSafe("MenuListViewModel") { menuRepository.archiveMenuItem(itemId, reason) }
    }
}
