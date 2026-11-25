package com.example.suseelacateringcrm.data.remote

import com.example.suseelacateringcrm.util.L

// Round 8 (api-contract "Round 8", calc-spec §13 / §13.5): learning recipes, event plan, day plan, cook log v2.
// Every number here comes from the server — the app only shows it.

/** One "why" line under a dish (combo, style, size, events matched, typed rule…). */
data class WhyLine(val te: String, val en: String) {
    val text: String get() = L(te, en)
}

/** Ingredient maths of one dish: qty × perUnit = qty. */
data class DishIngredient(val groceryItemId: String, val perUnit: Double, val qty: Double)

data class PlanDish(
    val key: String,
    val sessionId: String,
    val dishId: String,
    val variantId: String,
    val nameTe: String,
    val nameEn: String,
    val unit: String,
    val qty: Double?,
    val per100: Double?,
    val source: String,
    val matchedEvents: Int,
    val status: String,
    val statusTe: String,
    val eventsUsed: Int,
    val advice: String,
    val why: List<WhyLine>,
    val ingredients: List<DishIngredient>,
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })

    /** Learning badge text: "నేర్చుకుంటోంది 2/5" / "నేర్చుకున్నది ✓". */
    val badge: String get() = when {
        statusTe.isNotBlank() && com.example.suseelacateringcrm.util.AppLanguage.isTelugu -> statusTe
        else -> learnBadge(status, eventsUsed)
    }

    companion object {
        fun from(m: Map<*, *>) = PlanDish(
            key = m.str("key"), sessionId = m.str("sessionId"), dishId = m.str("dishId"), variantId = m.str("variantId"),
            nameTe = m.str("nameTe"), nameEn = m.str("nameEn"), unit = m.str("unit"),
            qty = m.numOrNull("qty"), per100 = m.numOrNull("per100"), source = m.str("source"),
            matchedEvents = m.int("matchedEvents"), status = m.str("status"), statusTe = m.str("statusTe"),
            eventsUsed = m.int("eventsUsed"), advice = m.str("advice"),
            why = whyList(m["why"]),
            ingredients = m.list("ingredients").mapNotNull { it as? Map<*, *> }.map {
                DishIngredient(it.str("groceryItemId"), it.num("perUnit"), it.num("qty"))
            },
        )
    }
}

fun whyList(raw: Any?): List<WhyLine> = (raw as? List<*>)?.mapNotNull { w ->
    when (w) {
        is Map<*, *> -> WhyLine(w.str("te"), w.str("en").ifBlank { w.str("te") })
        is String -> WhyLine(w, w)
        else -> null
    }
} ?: emptyList()

/** Badge from status + events used (same words as the server's learnStatus). */
fun learnBadge(status: String, eventsUsed: Int): String = when {
    status == "learned" || eventsUsed >= 5 -> L("నేర్చుకున్నది ✓", "Learned ✓")
    eventsUsed > 0 -> L("నేర్చుకుంటోంది $eventsUsed/5", "Learning $eventsUsed/5")
    else -> L("ఇంకా నేర్చుకోలేదు", "Not learned yet")
}

/** Source of the per-100 used. */
fun planSourceLabel(s: String): String = when (s) {
    "cell" -> L("ఇలాంటి కార్యక్రమాల నుంచి", "From similar events")
    "factors" -> L("మన లెక్కల నుంచి (సర్దుబాటు)", "From our events (adjusted)")
    "typed" -> L("మీరు రాసిన మొదటి లెక్క", "Your starting rule")
    "piece" -> L("ప్లేట్‌కు ముక్కలు", "Pieces per plate")
    "none" -> L("లెక్క లేదు — మొదటి లెక్క రాయండి", "No number yet — add a starting rule")
    else -> s
}

data class PlanIngredient(
    val groceryItemId: String,
    val nameTe: String,
    val nameEn: String,
    val unit: String,
    val needed: Double,
    val fromDishes: Double,
    val fromPer100: Double,
    val inStock: Double,
    val toBuy: Double,
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })

    companion object {
        fun from(m: Map<*, *>) = PlanIngredient(
            m.str("groceryItemId"), m.str("nameTe"), m.str("nameEn"), m.str("unit"), m.num("needed"),
            m.num("fromDishes"), m.num("fromPer100"), m.num("inStock"), m.num("toBuy"),
        )
    }
}

/** One event (booking or meal session) in a plan. */
data class PlanPart(
    val bookingId: String,
    val sessionId: String,
    val labelTe: String,
    val labelEn: String,
    val day: String,
    val guests: Int,
    val serviceStyle: String,
    val customer: String,
    val band: String,
    val comboKey: String,
    val dishes: List<PlanDish>,
    /** R10-11: kids plates and tagged special meals with the kitchen note. */
    val kidsCount: Int = 0,
    val specialMeals: List<Triple<String, Int, String>> = emptyList(),
    /** R10-12: "lunchBox" parts in the day plan. */
    val kind: String = "",
) {
    val label: String get() = L(labelTe.ifBlank { labelEn }, labelEn.ifBlank { labelTe })

    companion object {
        fun from(m: Map<*, *>) = PlanPart(
            m.str("bookingId"), m.str("sessionId"), m.str("labelTe"), m.str("labelEn"), m.str("day"), m.int("guests"),
            m.str("serviceStyle"), m.str("customer"), m.str("band"), m.str("comboKey"),
            m.list("dishes").mapNotNull { it as? Map<*, *> }.map { PlanDish.from(it) },
            kidsCount = m.int("kidsCount"),
            specialMeals = m.list("specialMeals").mapNotNull { it as? Map<*, *> }.map { sm ->
                Triple(L(sm.str("typeTe").ifBlank { sm.str("type") }, sm.str("type")), sm.int("count"), sm.str("note"))
            },
            kind = m.str("kind"),
        )
    }
}

data class EventPlanResult(val parts: List<PlanPart>, val dishes: List<PlanDish>, val ingredients: List<PlanIngredient>)

data class DayDishShare(val bookingId: String, val sessionId: String, val customer: String, val qty: Double?)

data class DayDish(
    val dishId: String,
    val variantId: String,
    val nameTe: String,
    val nameEn: String,
    val unit: String,
    val total: Double,
    val perEvent: List<DayDishShare>,
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })
}

data class DayPlanResult(val date: String, val events: List<PlanPart>, val dishes: List<DayDish>, val ingredients: List<PlanIngredient>)

/** Cook log v2 line: one dish (variant) of one event. */
data class CookLogLine(
    val dishId: String,
    val variantId: String,
    val cooked: Double,
    val leftover: Double,
    /** groceryItemId → used */
    val ingredients: List<Pair<String, Double>>,
    /** (bookingId, sessionId, guests) of other events that ate from the same batch */
    val sharedWith: List<Triple<String, String, Int>>,
)

private fun ingredientsOf(m: Map<*, *>) = m.list("ingredients").mapNotNull { it as? Map<*, *> }.map { PlanIngredient.from(it) }

suspend fun CrmFunctions.eventPlan(bookingId: String, sessionId: String?): Result<EventPlanResult> =
    call("eventPlan", mapOf("bookingId" to bookingId, "sessionId" to sessionId?.takeIf { it.isNotBlank() })).map { m ->
        EventPlanResult(
            parts = m.list("parts").mapNotNull { it as? Map<*, *> }.map { PlanPart.from(it) },
            dishes = m.list("dishes").mapNotNull { it as? Map<*, *> }.map { PlanDish.from(it) },
            ingredients = ingredientsOf(m),
        )
    }

suspend fun CrmFunctions.dayPlan(date: String, branchId: String?): Result<DayPlanResult> =
    call("dayPlan", mapOf("date" to date, "branchId" to branchId)).map { m ->
        DayPlanResult(
            date = m.str("date").ifBlank { date },
            events = m.list("events").mapNotNull { it as? Map<*, *> }.map { PlanPart.from(it) },
            dishes = m.list("dishes").mapNotNull { it as? Map<*, *> }.map { d ->
                DayDish(
                    d.str("dishId"), d.str("variantId"), d.str("nameTe"), d.str("nameEn"), d.str("unit"), d.num("total"),
                    d.list("perEvent").mapNotNull { it as? Map<*, *> }.map { p ->
                        DayDishShare(p.str("bookingId"), p.str("sessionId"), p.str("customer"), p.numOrNull("qty"))
                    },
                )
            },
            ingredients = ingredientsOf(m),
        )
    }

/** saveCookLog v2 (bookingId, sessionId?, guestCountActual?, entries with ingredients used and shared-with events). */
suspend fun CrmFunctions.saveCookLogV2(bookingId: String, sessionId: String?, guestCountActual: Int?, lines: List<CookLogLine>): Result<Int> =
    call(
        "saveCookLog",
        mapOf(
            "bookingId" to bookingId,
            "sessionId" to sessionId?.takeIf { it.isNotBlank() },
            "guestCountActual" to guestCountActual,
            "entries" to lines.map { l ->
                mapOf(
                    "dishId" to l.dishId,
                    "variantId" to l.variantId.ifBlank { null },
                    "cooked" to l.cooked,
                    "leftover" to l.leftover,
                    "ingredients" to l.ingredients.filter { it.second >= 0 }.map { (g, u) -> mapOf("groceryItemId" to g, "used" to u) },
                    "sharedWith" to l.sharedWith.map { (b, s, g) -> mapOf("bookingId" to b, "sessionId" to s.ifBlank { null }, "guests" to g) },
                )
            },
        ),
    ).map { it.list("updatedDishes").size }
