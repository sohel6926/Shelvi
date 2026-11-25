package com.example.suseelacateringcrm.ui.purchases

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.repository.PurchaseRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

data class ItemStaffBreakdown(val staffName: String, val quantity: Double, val amount: Double)
data class ItemReportEntry(
    val description: String,
    val unit: String,
    val totalQuantity: Double,
    val totalValue: Double,
    val byStaff: List<ItemStaffBreakdown>,
)

class ItemPurchaseReportViewModel(
    private val purchaseRepository: PurchaseRepository = ServiceLocator.purchaseRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _entries = MutableStateFlow<List<ItemReportEntry>>(emptyList())
    val entries: StateFlow<List<ItemReportEntry>> = _entries.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> purchaseRepository.purchasesFlow(branchId) }
                .collect { purchases ->
                val flattened = purchases.flatMap { purchase ->
                    purchase.items.map { item -> purchase.staffName.ifBlank { "Unknown" } to item }
                }
                _entries.value = flattened
                    .groupBy { (_, item) -> item.description to item.unit }
                    .map { (key, rows) ->
                        val byStaff = rows.groupBy { it.first }
                            .map { (staff, staffRows) ->
                                ItemStaffBreakdown(
                                    staffName = staff,
                                    quantity = staffRows.sumOf { it.second.quantity },
                                    amount = staffRows.sumOf { it.second.amount },
                                )
                            }
                            .sortedByDescending { it.quantity }
                        ItemReportEntry(
                            description = key.first,
                            unit = key.second,
                            totalQuantity = rows.sumOf { it.second.quantity },
                            totalValue = rows.sumOf { it.second.amount },
                            byStaff = byStaff,
                        )
                    }
                    .sortedByDescending { it.totalValue }
            }
        }
    }
}
