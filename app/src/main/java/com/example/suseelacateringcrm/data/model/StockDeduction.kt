package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rMapList
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr
import java.util.Date

/** One stock line taken out for an event (🔒 bookings/{id}.stockDeduction.items[]). */
data class StockLine(
    val groceryItemId: String,
    val inventoryItemId: String,
    val nameTe: String,
    val nameEn: String,
    val unit: String,
    val quantity: Double,
    val autoValue: Double?,
    /** What could not be taken because stock ran out (stock never goes below 0). */
    val shortBy: Double,
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })
}

/** 🔒 bookings/{id}.stockDeduction (api-contract Round 6 A) — written only by the server. */
data class StockDeduction(
    val at: Date?,
    val byAuto: Boolean,
    val byName: String,
    val calc: CalcInfo,
    val items: List<StockLine>,
    val skipped: List<String>,
    val reversed: Boolean,
) {
    companion object {
        fun from(raw: Any?): StockDeduction? {
            val m = (raw as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: return null
            val by = m["by"]
            return StockDeduction(
                at = m.rDate("at"),
                byAuto = by == "auto",
                byName = (by as? Map<*, *>)?.get("name")?.toString() ?: "",
                calc = CalcInfo.fromMap(m),
                items = m.rMapList("items").map {
                    StockLine(
                        groceryItemId = it.rStr("groceryItemId"),
                        inventoryItemId = it.rStr("inventoryItemId"),
                        nameTe = it.rStr("nameTe"),
                        nameEn = it.rStr("nameEn"),
                        unit = it.rStr("unit"),
                        quantity = it.rNum("quantity"),
                        autoValue = it.rNumOrNull("autoValue"),
                        shortBy = it.rNum("shortBy"),
                    )
                },
                // skipped: names or {nameTe/nameEn/groceryItemId} objects
                skipped = (m["skipped"] as? List<*>)?.map { s ->
                    when (s) {
                        is Map<*, *> -> L(
                            (s["nameTe"] ?: s["nameEn"] ?: s["groceryItemId"] ?: "").toString(),
                            (s["nameEn"] ?: s["nameTe"] ?: s["groceryItemId"] ?: "").toString(),
                        )
                        else -> s.toString()
                    }
                } ?: emptyList(),
                reversed = m.rBool("reversed"),
            )
        }
    }
}
