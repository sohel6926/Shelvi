package com.example.suseelacateringcrm.ui.purchases

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Purchase
import com.example.suseelacateringcrm.data.repository.PurchaseRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class PurchasesHomeSummary(
    val todayTotal: Double = 0.0,
    val todayCount: Int = 0,
    val monthTotal: Double = 0.0,
    val pendingPaymentsTotal: Double = 0.0,
    val staffWiseToday: List<Pair<String, Double>> = emptyList(),
    val recentPurchases: List<Purchase> = emptyList(),
)

class PurchasesHomeViewModel(
    private val purchaseRepository: PurchaseRepository = ServiceLocator.purchaseRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val dayKeyFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    private val monthKeyFormat = SimpleDateFormat("yyyy-MM", Locale.getDefault())

    private val _summary = MutableStateFlow(PurchasesHomeSummary())
    val summary: StateFlow<PurchasesHomeSummary> = _summary.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> purchaseRepository.purchasesFlow(branchId) }
                .collect { purchases ->
                val todayKey = dayKeyFormat.format(Date())
                val monthKey = monthKeyFormat.format(Date())

                val todayPurchases = purchases.filter { it.purchaseDate != null && dayKeyFormat.format(it.purchaseDate) == todayKey }
                val monthPurchases = purchases.filter { it.purchaseDate != null && monthKeyFormat.format(it.purchaseDate) == monthKey }

                val staffToday = todayPurchases
                    .groupBy { it.staffName.ifBlank { "Unknown" } }
                    .map { (name, list) -> name to list.sumOf { it.totalAmount } }
                    .sortedByDescending { it.second }

                _summary.value = PurchasesHomeSummary(
                    todayTotal = todayPurchases.sumOf { it.totalAmount },
                    todayCount = todayPurchases.size,
                    monthTotal = monthPurchases.sumOf { it.totalAmount },
                    pendingPaymentsTotal = purchases.filter { it.paymentStatus != "Paid" }.sumOf { it.totalAmount },
                    staffWiseToday = staffToday,
                    recentPurchases = purchases.sortedByDescending { it.purchaseDate }.take(5),
                )
            }
        }
    }
}
