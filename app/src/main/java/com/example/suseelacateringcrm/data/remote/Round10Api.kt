package com.example.suseelacateringcrm.data.remote

// Round 10 callables (functions/src: staff/advances.ts, staff/shifts.ts, menus/suggestPrice.ts,
// vendors/purchaseRates.ts, customers/customerStatement.ts, lunchBoxes/lunchBoxes.ts). Server values only.

data class StaffAdvanceRow(
    val id: String,
    val amount: Double,
    val date: String,
    val note: String,
    val recoverMonth: String,
    val status: String,
    val recovered: Double,
    val balance: Double,
)

data class StaffAdvances(val rows: List<StaffAdvanceRow>, val balance: Double)

/** addStaffAdvance { staffId, amount, date?, recoverMonth?, note? } (A, M) → server text { te, en }. */
suspend fun CrmFunctions.addStaffAdvance(staffId: String, amount: Double, date: String?, recoverMonth: String?, note: String): Result<String> =
    call(
        "addStaffAdvance",
        mapOf("staffId" to staffId, "amount" to amount, "date" to date?.ifBlank { null }, "recoverMonth" to recoverMonth?.ifBlank { null }, "note" to note),
    ).map { messageText(it["text"]) }

/** listStaffAdvances { staffId } → advances with recovered / balance, total balance. */
suspend fun CrmFunctions.listStaffAdvances(staffId: String): Result<StaffAdvances> =
    call("listStaffAdvances", mapOf("staffId" to staffId)).map { m ->
        StaffAdvances(
            rows = m.list("advances").mapNotNull { it as? Map<*, *> }.map { r ->
                StaffAdvanceRow(r.str("id"), r.num("amount"), r.str("date"), r.str("note"), r.str("recoverMonth"), r.str("status"), r.num("recovered"), r.num("balance"))
            },
            balance = m.num("balance"),
        )
    }

/** saveShift { id?, bookingId, sessionId?, staffId, role, date, startTime, endTime, note? } (A, M). */
suspend fun CrmFunctions.saveShift(
    id: String?, bookingId: String, sessionId: String?, staffId: String, role: String, date: String, startTime: String, endTime: String, note: String,
): Result<Double> = call(
    "saveShift",
    mapOf(
        "id" to id?.ifBlank { null }, "bookingId" to bookingId, "sessionId" to sessionId?.ifBlank { null }, "staffId" to staffId,
        "role" to role, "date" to date, "startTime" to startTime, "endTime" to endTime, "note" to note,
    ),
).map { it.num("hours") }

/** completeTask { taskId, done, note? } (assigned staff, A, M). */
suspend fun CrmFunctions.completeTask(taskId: String, done: Boolean, note: String? = null): Result<Unit> =
    call("completeTask", mapOf("taskId" to taskId, "done" to done, "note" to note)).map { }

/** rateStaff { staffId, bookingId, stars 1–5, note } (A, M). */
suspend fun CrmFunctions.rateStaff(staffId: String, bookingId: String, stars: Int, note: String): Result<Unit> =
    call("rateStaff", mapOf("staffId" to staffId, "bookingId" to bookingId, "stars" to stars, "note" to note)).map { }

/** suggestPackagePrice { packageId, guests? } → raw map (plateCost, currentPrice, suggestedPrice, marginPct, band, bandTe, summary, ingredients, warnings). */
suspend fun CrmFunctions.suggestPackagePrice(packageId: String, guests: Int?): Result<Map<String, Any?>> =
    call("suggestPackagePrice", mapOf("packageId" to packageId, "guests" to guests))

/** vendorPriceComparison { groceryItemId? } → { items: [{ itemKey, name, unit, vendors: [{ vendorName, lastRate, lastDay, previousRate, changePct, cheapest }] }] }. */
suspend fun CrmFunctions.vendorPriceComparison(groceryItemId: String? = null): Result<Map<String, Any?>> =
    call("vendorPriceComparison", mapOf("groceryItemId" to groceryItemId))

/** customerStatement { customerId, from?, to? } → opening, lines [{ day, kind, ref, amount, te, en, balance }], closing, invoiced, paid, whatsappText. */
suspend fun CrmFunctions.customerStatement(customerId: String, from: String?, to: String?): Result<Map<String, Any?>> =
    call("customerStatement", mapOf("customerId" to customerId, "from" to from?.ifBlank { null }, "to" to to?.ifBlank { null }))

/** markLunchBoxDelivered { orderId, date, count? } (any active user of the branch). */
suspend fun CrmFunctions.markLunchBoxDelivered(orderId: String, date: String, count: Int?): Result<Unit> =
    call("markLunchBoxDelivered", mapOf("orderId" to orderId, "date" to date, "count" to count)).map { }
