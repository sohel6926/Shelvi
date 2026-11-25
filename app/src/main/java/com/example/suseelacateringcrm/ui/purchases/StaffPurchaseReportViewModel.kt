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

data class StaffItemSummary(val description: String, val quantity: Double, val unit: String, val amount: Double)
data class StaffReportEntry(val staffName: String, val purchaseCount: Int, val totalValue: Double, val items: List<StaffItemSummary>)

class StaffPurchaseReportViewModel(
    private val purchaseRepository: PurchaseRepository = ServiceLocator.purchaseRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _entries = MutableStateFlow<List<StaffReportEntry>>(emptyList())
    val entries: StateFlow<List<StaffReportEntry>> = _entries.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> purchaseRepository.purchasesFlow(branchId) }
                .collect { purchases ->
                _entries.value = purchases
                    .groupBy { it.staffName.ifBlank { "Unknown" } }
                    .map { (staff, list) ->
                        val itemSummaries = list.flatMap { it.items }
                            .groupBy { it.description to it.unit }
                            .map { (key, items) ->
                                StaffItemSummary(
                                    description = key.first,
                                    quantity = items.sumOf { it.quantity },
                                    unit = key.second,
                                    amount = items.sumOf { it.amount },
                                )
                            }
                            .sortedByDescending { it.amount }
                        StaffReportEntry(
                            staffName = staff,
                            purchaseCount = list.size,
                            totalValue = list.sumOf { it.totalAmount },
                            items = itemSummaries,
                        )
                    }
                    .sortedByDescending { it.totalValue }
            }
        }
    }
}
