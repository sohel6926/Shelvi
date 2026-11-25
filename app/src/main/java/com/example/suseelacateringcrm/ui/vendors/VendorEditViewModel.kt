package com.example.suseelacateringcrm.ui.vendors

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Vendor
import com.example.suseelacateringcrm.data.repository.VendorRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class VendorEditViewModel(
    private val vendorId: String?,
    private val vendorRepository: VendorRepository = ServiceLocator.vendorRepository,
) : ViewModel() {

    var name by mutableStateOf("")
    var phone by mutableStateOf("")
    var address by mutableStateOf("")
    var notes by mutableStateOf("")

    var loading by mutableStateOf(vendorId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    init {
        if (vendorId != null) {
            launchSafe("VendorEditViewModel", onError = { loading = false }) {
                val existing = vendorRepository.getVendor(vendorId)
                if (existing != null) {
                    name = existing.name
                    phone = existing.phone
                    address = existing.address
                    notes = existing.notes
                }
                loading = false
            }
        }
    }

    fun save() {
        if (name.isBlank()) {
            saveState = UiState.Error(L("పేరు తప్పనిసరి", "Name is required"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                val vendor = Vendor(
                    id = vendorId ?: "",
                    name = name.trim(),
                    phone = phone.trim(),
                    address = address.trim(),
                    notes = notes.trim(),
                )
                vendorRepository.saveVendor(vendor)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("Vendor సేవ్ కాలేదు", "Failed to save vendor") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
