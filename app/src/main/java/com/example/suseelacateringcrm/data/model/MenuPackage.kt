package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rInt
import com.example.suseelacateringcrm.util.rList
import com.example.suseelacateringcrm.util.rMap
import com.example.suseelacateringcrm.util.rMapList
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr

data class MenuOption(val te: String = "", val en: String = "") {
    val label: String get() = L(te, en)
}

/** One line of a menu. More than one option = "/" in the menu text: the customer picks one. */
data class MenuGroup(val options: List<MenuOption> = emptyList()) {
    val isChoice: Boolean get() = options.size > 1
}

data class MenuExtra(val key: String = "", val te: String = "", val en: String = "", val price: Double? = null)

data class MenuReplacement(val key: String = "", val te: String = "", val en: String = "", val extraPerPlate: Double = 0.0)

data class ServingBoyRule(val chargePerPerson: Double = 700.0, val freeRule: String = "none")

data class FreePlatesRule(val perPlates: Int = 50, val extraPlates: Int = 5)

/**
 * `menuPackages/{id}` (docs/data-model.md). Prices are for display; every quote total comes
 * from the `quoteMenu` / `saveQuotation` callables.
 *
 * Storage note: Firestore cannot store an array directly inside an array, so `groups` is
 * stored as `[{ options: [{te,en}, …] }, …]`. A plain nested list (the seed-file shape) is also
 * accepted when reading.
 */
data class MenuPackage(
    val id: String = "",
    val code: String = "",
    val nameTe: String = "",
    val nameEn: String = "",
    val mealType: String = "lunch",
    val menuDate: String? = null,
    val deliveryWindow: String = "",
    val groups: List<MenuGroup> = emptyList(),
    val pricePerPlate: Double = 0.0,
    /** true = transport is charged extra, entered per quote (contract decision 2: `transportCharged`). */
    val transportCharged: Boolean = true,
    val minOrder: Int = 0,
    val servingBoy: ServingBoyRule = ServingBoyRule(),
    val freePlates: FreePlatesRule? = null,
    val extras: List<MenuExtra> = emptyList(),
    val replacements: List<MenuReplacement> = emptyList(),
    val active: Boolean = true,
) {
    val name: String get() = L(nameTe, nameEn)
    val priceReviewDue: Boolean get() = DayKey.priceReviewDue(menuDate)

    companion object {
        fun fromMap(id: String, m: Map<String, Any?>): MenuPackage {
            val sb = m.rMap("servingBoy")
            val fp = m["freePlates"] as? Map<*, *>
            return MenuPackage(
                id = id,
                code = m.rStr("code"),
                nameTe = m.rStr("nameTe"),
                nameEn = m.rStr("nameEn"),
                mealType = m.rStr("mealType", "lunch"),
                menuDate = (m["menuDate"] as? String)?.takeIf { it.isNotBlank() },
                deliveryWindow = m.rStr("deliveryWindow"),
                groups = m.rList("groups").map { parseGroup(it) },
                pricePerPlate = m.rNum("pricePerPlate"),
                transportCharged = when (val t = m["transportCharged"] ?: m["transportExtra"]) {
                    is Boolean -> t
                    is Number -> t.toDouble() > 0
                    else -> true
                },
                minOrder = m.rInt("minOrder"),
                servingBoy = ServingBoyRule(sb.rNum("chargePerPerson", 700.0), sb.rStr("freeRule", "none")),
                freePlates = fp?.let {
                    FreePlatesRule(
                        perPlates = (it["perPlates"] as? Number)?.toInt() ?: 50,
                        extraPlates = (it["extraPlates"] as? Number)?.toInt() ?: 0,
                    )
                },
                extras = m.rMapList("extras").map {
                    MenuExtra(it.rStr("key"), it.rStr("te"), it.rStr("en"), it.rNumOrNull("price"))
                },
                replacements = m.rMapList("replacements").map {
                    MenuReplacement(it.rStr("key"), it.rStr("te"), it.rStr("en"), it.rNum("extraPerPlate"))
                },
                active = m.rBool("active", true),
            )
        }

        private fun parseGroup(raw: Any?): MenuGroup {
            val list: List<*> = when (raw) {
                is Map<*, *> -> raw["options"] as? List<*> ?: emptyList<Any?>()
                is List<*> -> raw
                else -> emptyList<Any?>()
            }
            return MenuGroup(
                list.mapNotNull { o ->
                    (o as? Map<*, *>)?.let { MenuOption(it["te"]?.toString() ?: "", it["en"]?.toString() ?: "") }
                }
            )
        }
    }
}

/** Meal-type tabs on the menu list. "lunch-dinner" shows under both lunch and dinner. */
enum class MealTab(val te: String, val en: String) {
    TIFFIN("టిఫిన్", "Tiffin"),
    LUNCH("లంచ్", "Lunch"),
    DINNER("డిన్నర్", "Dinner");

    val label: String get() = L(te, en)

    fun matches(mealType: String): Boolean = when (this) {
        TIFFIN -> mealType == "tiffin"
        LUNCH -> mealType == "lunch" || mealType == "lunch-dinner"
        DINNER -> mealType == "dinner" || mealType == "lunch-dinner"
    }
}
