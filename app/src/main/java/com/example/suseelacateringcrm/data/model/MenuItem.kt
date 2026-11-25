package com.example.suseelacateringcrm.data.model

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.PropertyName
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

enum class MenuCategory(val label: String) {
    STARTER("Starter"),
    MAIN_COURSE("Main Course"),
    DESSERT("Dessert"),
    BEVERAGE("Beverage"),
    PACKAGE("Package");

    companion object {
        fun fromFirestore(value: String?): MenuCategory =
            entries.find { it.label == value } ?: STARTER
    }
}

data class RecipeIngredient(
    val inventoryItemId: String = "",
    val inventoryItemName: String = "",
    val quantityPerPlate: Double = 0.0,
    val unit: String = "",
)

data class MenuItem(
    @DocumentId val id: String = "",
    val name: String = "",
    val category: String = MenuCategory.STARTER.label,
    @get:PropertyName("isPackage")
    val isPackage: Boolean = false,
    val includedItemIds: List<String> = emptyList(),
    val pricePerPlate: Double = 0.0,
    @get:PropertyName("isVeg")
    val isVeg: Boolean = true,
    @get:PropertyName("isActive")
    val isActive: Boolean = true,
    val recipeIngredients: List<RecipeIngredient> = emptyList(),
    val archived: Boolean = false,
    @ServerTimestamp val createdAt: Date? = null,
    @ServerTimestamp val updatedAt: Date? = null,
) {
    @get:com.google.firebase.firestore.Exclude
    val menuCategory: MenuCategory get() = MenuCategory.fromFirestore(category)
}
