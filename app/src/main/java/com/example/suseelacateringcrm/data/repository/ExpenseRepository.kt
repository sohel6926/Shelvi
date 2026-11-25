package com.example.suseelacateringcrm.data.repository

import com.example.suseelacateringcrm.data.model.Expense
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import java.util.Date

/**
 * @param ownerScope staff login → their uid (firestore.rules costDocReadOk lets staff read only the
 * expenses they created, so their lists ask for `createdBy == uid`); null for admin / manager.
 */
class ExpenseRepository(
    private val firestore: FirebaseFirestore,
    private val ownerScope: () -> String? = { null },
) {

    private fun collection() = firestore.collection(FirestoreCollections.EXPENSES)

    /**
     * Live, non-deleted expenses only.
     * branchId == null means unfiltered (admin's "All Branches" combined view).
     */
    fun expensesFlow(branchId: String? = null, includeCancelled: Boolean = false): Flow<List<Expense>> {
        val owner = ownerScope()
        val query: Query = when {
            // QA fix 1: staff see only their own entries ("నా ఎంట్రీలు"); a branch-wide query is denied.
            owner != null -> collection().whereEqualTo("createdBy", owner)
            branchId != null -> collection().whereEqualTo("branchId", branchId)
            else -> collection()
        }
        return query.snapshotsFlow().map { snapshot ->
            snapshot.toObjects(Expense::class.java)
                .filter { !it.isDeleted && (includeCancelled || !it.status.equals("Cancelled", ignoreCase = true)) }
        }
    }

    suspend fun getExpense(expenseId: String): Expense? =
        collection().document(expenseId).get().await().toObject(Expense::class.java)

    private fun expenseFieldsMap(expense: Expense): Map<String, Any?> = mapOf(
        "expenseNumber" to expense.expenseNumber,
        "section" to expense.section,
        "subCategory" to expense.subCategory,
        "personName" to expense.personName,
        "mobileNumber" to expense.mobileNumber,
        "quantity" to expense.quantity,
        "unit" to expense.unit,
        "rate" to expense.rate,
        "numberOfStaff" to expense.numberOfStaff,
        "numberOfDays" to expense.numberOfDays,
        "vehicleType" to expense.vehicleType,
        "vehicleNumber" to expense.vehicleNumber,
        "fromLocation" to expense.fromLocation,
        "toLocation" to expense.toLocation,
        "tripCount" to expense.tripCount,
        "transportCharges" to expense.transportCharges,
        "setupCharges" to expense.setupCharges,
        "otherCharges" to expense.otherCharges,
        "subtotal" to expense.subtotal,
        "totalAmount" to expense.totalAmount,
        "advancePaid" to expense.advancePaid,
        "balanceAmount" to expense.balanceAmount,
        // R7-8: paymentStatus / paid / balance are server-derived — never written by the app.
        "paymentMethod" to expense.paymentMethod,
        "billNumber" to expense.billNumber,
        "billMonth" to expense.billMonth,
        "serviceDate" to (expense.serviceDate ?: Date()),
        "dueDate" to expense.dueDate,
        "paidDate" to expense.paidDate,
        "bookingId" to expense.bookingId,
        "bookingLabel" to expense.bookingLabel,
        "staffUid" to expense.staffUid,
        "staffName" to expense.staffName,
        "staffPhone" to expense.staffPhone,
        "receiptPhotoUrl" to expense.receiptPhotoUrl,
        "notes" to expense.notes,
        // R7-1: required on create; old docs without it count as overhead "general".
        "costTarget" to (expense.costTarget ?: com.example.suseelacateringcrm.data.model.CostTarget().toMap()),
    )

    suspend fun saveExpense(expense: Expense, createdBy: String, branchId: String): String {
        val data = expenseFieldsMap(expense) + mapOf(
            "isDeleted" to false,
            "branchId" to branchId,
            "createdBy" to createdBy,
            "createdAt" to FieldValue.serverTimestamp(),
        )
        return collection().add(data).await().id
    }

    suspend fun updateExpense(expenseId: String, expense: Expense, updatedBy: String) {
        val data = expenseFieldsMap(expense) + mapOf(
            "updatedBy" to updatedBy,
            "updatedAt" to FieldValue.serverTimestamp(),
        )
        collection().document(expenseId).update(data).await()
    }

    /** R7-3: cancel with a reason via the cancelRecord callable (no soft-delete writes). */
    suspend fun cancelExpense(expenseId: String, reason: String) {
        com.example.suseelacateringcrm.di.ServiceLocator.functions
            .cancelRecord(FirestoreCollections.EXPENSES, expenseId, reason).getOrThrow()
    }
}
