package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.InventoryRepository
import com.example.suseelacateringcrm.data.repository.MenuRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import com.example.suseelacateringcrm.util.launchSafe

data class KitchenRequirement(
    val inventoryItemId: String,
    val name: String,
    val unit: String,
    val requiredQuantity: Double,
    val currentStock: Double,
    val shortage: Double,
)

class KitchenPlanViewModel(
    private val bookingId: String,
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val menuRepository: MenuRepository = ServiceLocator.menuRepository,
    private val inventoryRepository: InventoryRepository = ServiceLocator.inventoryRepository,
) : ViewModel() {

    var booking by mutableStateOf<Booking?>(null)
        private set
    var loading by mutableStateOf(true)
        private set
    var hasRecipes by mutableStateOf(true)
        private set

    private val _requirements = MutableStateFlow<List<KitchenRequirement>>(emptyList())
    val requirements: StateFlow<List<KitchenRequirement>> = _requirements.asStateFlow()

    init {
        launchSafe("KitchenPlanViewModel", onError = { loading = false }) {
            val b = bookingRepository.getBooking(bookingId)
            booking = b
            if (b != null && b.menuItemIds.isNotEmpty()) {
                val allMenuItems = menuRepository.menuItemsFlow().first()
                val allInventory = inventoryRepository.inventoryFlow(b.branchId.ifBlank { null }).first()
                val menuItemsInBooking = allMenuItems.filter { it.id in b.menuItemIds }

                hasRecipes = menuItemsInBooking.any { it.recipeIngredients.isNotEmpty() }

                val aggregated = linkedMapOf<String, KitchenRequirement>()
                menuItemsInBooking.forEach { menuItem ->
                    menuItem.recipeIngredients.forEach { ingredient ->
                        val needed = ingredient.quantityPerPlate * b.guestCount
                        val existing = aggregated[ingredient.inventoryItemId]
                        if (existing != null) {
                            aggregated[ingredient.inventoryItemId] = existing.copy(requiredQuantity = existing.requiredQuantity + needed)
                        } else {
                            val stock = allInventory.find { it.id == ingredient.inventoryItemId }?.quantityInStock ?: 0.0
                            aggregated[ingredient.inventoryItemId] = KitchenRequirement(
                                inventoryItemId = ingredient.inventoryItemId,
                                name = ingredient.inventoryItemName,
                                unit = ingredient.unit,
                                requiredQuantity = needed,
                                currentStock = stock,
                                shortage = 0.0,
                            )
                        }
                    }
                }
                _requirements.value = aggregated.values
                    .map { it.copy(shortage = (it.requiredQuantity - it.currentStock).coerceAtLeast(0.0)) }
                    .sortedByDescending { it.shortage }
            }
            loading = false
        }
    }
}
