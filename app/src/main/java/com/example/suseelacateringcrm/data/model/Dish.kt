package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rInt
import com.example.suseelacateringcrm.util.rMap
import com.example.suseelacateringcrm.util.rMapList
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr

/** Server-owned learned quantity (calc-spec §5). */
data class DishLearned(
    val per100: Double = 0.0,
    val leftoverPct: Double? = null,
    val changePct: Double = 0.0,
    val advice: String = "ok",
    val eventsUsed: Int = 0,
    /** Round 8: none | learning | learned (server). */
    val status: String = "",
)

/** Round 8 dish variant, e.g. "పుల్కా – 2" (piecesPerPlate 2). */
data class DishVariant(val id: String, val nameTe: String, val nameEn: String, val piecesPerPlate: Double?) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })
}

/**
 * Owner's starting rule (calc-spec §13.5): optional style / comboKey / band, and either per100 or factorPct (±%).
 * Blank = "any". factorPct is used by the server only when exactly one of style / comboKey / band is set.
 */
data class StartRule(
    val style: String = "",
    val comboKey: String = "",
    val band: String = "",
    val per100: Double? = null,
    val factorPct: Double? = null,
) {
    fun toMap(): Map<String, Any> = buildMap {
        if (style.isNotBlank()) put("style", style)
        if (comboKey.isNotBlank()) put("comboKey", comboKey)
        if (band.isNotBlank()) put("band", band)
        per100?.let { put("per100", it) }
        factorPct?.let { put("factorPct", it) }
    }

    val dimensions: Int get() = listOf(style, comboKey, band).count { it.isNotBlank() }
}

/** Owner's typed starting recipe line: grocery used per 1 unit of the dish. */
data class TypedRecipeLine(val groceryItemId: String, val perUnit: Double)

/** `dishes/{id}` — a cooked dish with its base quantity per 100 guests. */
data class Dish(
    val id: String = "",
    val nameTe: String = "",
    val nameEn: String = "",
    val unit: String = "kg",
    val basePer100: Double = 0.0,
    val category: String = "",
    val learned: DishLearned? = null,
    /** Round 8: rice | flavoured-rice | bread | tiffin-main | side | sweet | starter | drink | other */
    val role: String = "",
    val variants: List<DishVariant> = emptyList(),
    val typedRecipe: List<TypedRecipeLine> = emptyList(),
    /** Server-learned recipe: groceryItemId → perUnit (read only). */
    val learnedRecipe: List<TypedRecipeLine> = emptyList(),
    val startRulesCount: Int = 0,
    /** Module 2e: a base (gravy, paste…) made first and used inside other dishes; not offered in menus. */
    val isSubRecipe: Boolean = false,
    val startRules: List<StartRule> = emptyList(),
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })

    companion object {
        /** [{ groceryItemId, perUnit }] or { groceryItemId: perUnit }. */
        fun recipeLines(raw: Any?): List<TypedRecipeLine> = when (raw) {
            is List<*> -> raw.mapNotNull { it as? Map<*, *> }.mapNotNull { r ->
                val id = r["groceryItemId"]?.toString() ?: return@mapNotNull null
                TypedRecipeLine(id, (r["perUnit"] as? Number)?.toDouble() ?: 0.0)
            }
            is Map<*, *> -> raw.mapNotNull { (k, v) -> (v as? Number)?.let { TypedRecipeLine(k.toString(), it.toDouble()) } }
            else -> emptyList()
        }

        /** Roles that make up the menu combination key (server MAIN_ROLES). */
        val MAIN_ROLES = listOf("bread", "flavoured-rice", "rice", "tiffin-main")
        val BANDS = listOf("S", "M", "L", "XL")

        fun bandLabel(b: String): String = when (b) {
            "S" -> L("చిన్నది (≤150)", "Small (≤150)")
            "M" -> L("మధ్యస్థం (151–400)", "Medium (151–400)")
            "L" -> L("పెద్దది (401–800)", "Large (401–800)")
            "XL" -> L("చాలా పెద్దది (800+)", "Very large (800+)")
            else -> L("ఏదైనా", "Any")
        }

        /** "bread+flavoured-rice" → "రొట్టెలు + బిర్యానీ / పులావ్". */
        fun comboLabel(key: String): String =
            if (key.isBlank()) L("ఏదైనా", "Any") else key.split('+').joinToString(" + ") { part ->
                val role = part.substringBefore('×')
                val n = part.substringAfter('×', "")
                roleLabel(role).ifBlank { role } + if (n.isNotBlank()) " ×$n" else ""
            }

        val ROLES = listOf("rice", "flavoured-rice", "bread", "tiffin-main", "side", "sweet", "starter", "drink", "other")

        fun roleLabel(r: String): String = when (r) {
            "rice" -> L("అన్నం", "Rice")
            "flavoured-rice" -> L("బిర్యానీ / పులావ్", "Flavoured rice")
            "bread" -> L("రొట్టెలు", "Bread")
            "tiffin-main" -> L("టిఫిన్", "Tiffin")
            "side" -> L("కూర / పప్పు", "Side")
            "sweet" -> L("స్వీట్", "Sweet")
            "starter" -> L("స్టార్టర్", "Starter")
            "drink" -> L("డ్రింక్", "Drink")
            "other" -> L("ఇతర", "Other")
            else -> ""
        }

        fun fromMap(id: String, m: Map<String, Any?>): Dish {
            val l = m["learned"] as? Map<*, *>
            val lm = m.rMap("learned")
            return Dish(
                id = id,
                nameTe = m.rStr("nameTe"),
                nameEn = m.rStr("nameEn"),
                unit = m.rStr("unit", "kg"),
                basePer100 = m.rNum("basePer100"),
                category = m.rStr("category"),
                learned = if (l == null) null else DishLearned(
                    per100 = lm.rNum("per100"),
                    leftoverPct = lm.rNumOrNull("leftoverPct"),
                    changePct = lm.rNum("changePct"),
                    advice = lm.rStr("advice", "ok"),
                    eventsUsed = lm.rInt("eventsUsed"),
                    status = lm.rStr("status"),
                ),
                role = m.rStr("role"),
                variants = m.rMapList("variants").map { v ->
                    DishVariant(v.rStr("id"), v.rStr("nameTe"), v.rStr("nameEn"), v.rNumOrNull("piecesPerPlate"))
                },
                typedRecipe = recipeLines(m["typedRecipe"]),
                learnedRecipe = recipeLines(m.rMap("recipe")["ingredients"]),
                startRulesCount = m.rMapList("startRules").size,
                isSubRecipe = m["isSubRecipe"] == true,
                startRules = m.rMapList("startRules").map { r ->
                    StartRule(r.rStr("style"), r.rStr("comboKey"), r.rStr("band"), r.rNumOrNull("per100"), r.rNumOrNull("factorPct"))
                },
            )
        }
    }
}

/** `groceryItems/{id}` — raw material needed per 100 guests. */
data class GroceryItem(
    val id: String = "",
    val nameTe: String = "",
    val nameEn: String = "",
    val unit: String = "kg",
    val per100: Double = 0.0,
    val inventoryItemId: String = "",
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })

    companion object {
        fun fromMap(id: String, m: Map<String, Any?>) = GroceryItem(
            id = id,
            nameTe = m.rStr("nameTe"),
            nameEn = m.rStr("nameEn"),
            unit = m.rStr("unit", "kg"),
            per100 = m.rNum("per100"),
            inventoryItemId = m.rStr("inventoryItemId"),
        )
    }
}

/** Event types that drive the cooking factors (calc-spec §5). */
enum class EventType(val code: String, val te: String, val en: String) {
    WEDDING("wedding", "పెళ్ళి", "Wedding"),
    ANNADANAM("annadanam", "అన్నదానం", "Annadanam"),
    HOUSEWARMING("housewarming", "గృహప్రవేశం", "Housewarming"),
    OFFICE("office", "ఆఫీస్", "Office"),
    OTHER("other", "ఇతర", "Other");

    val label: String get() = L(te, en)

    companion object {
        fun from(code: String?): EventType = entries.find { it.code == code } ?: OTHER

        /** Best guess from the free-text eventType on older bookings. */
        fun guess(text: String?): EventType {
            val t = text?.lowercase() ?: return OTHER
            return when {
                "wedding" in t || "marriage" in t || "పెళ్ళి" in t || "పెళ్లి" in t -> WEDDING
                "annadan" in t || "అన్నదాన" in t -> ANNADANAM
                "house" in t || "gruha" in t || "గృహ" in t -> HOUSEWARMING
                "office" in t || "corporate" in t || "ఆఫీస్" in t -> OFFICE
                else -> entries.find { it.code == t } ?: OTHER
            }
        }
    }
}
