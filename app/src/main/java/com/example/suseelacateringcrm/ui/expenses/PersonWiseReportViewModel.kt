package com.example.suseelacateringcrm.ui.expenses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.repository.ExpenseRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

data class PersonTransaction(val section: String, val subCategory: String, val amount: Double, val date: String)
data class PersonReportEntry(
    val personName: String,
    val mobileNumber: String,
    val transactionCount: Int,
    val totalAmount: Double,
    val totalAdvance: Double,
    val totalPending: Double,
    val transactions: List<PersonTransaction>,
)

class PersonWiseReportViewModel(
    private val expenseRepository: ExpenseRepository = ServiceLocator.expenseRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _entries = MutableStateFlow<List<PersonReportEntry>>(emptyList())
    val entries: StateFlow<List<PersonReportEntry>> = _entries.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> expenseRepository.expensesFlow(branchId) }
                .collect { expenses ->
                _entries.value = expenses
                    .filter { it.personName.isNotBlank() }
                    .groupBy { it.personName }
                    .map { (name, list) ->
                        PersonReportEntry(
                            personName = name,
                            mobileNumber = list.firstOrNull { it.mobileNumber.isNotBlank() }?.mobileNumber ?: "",
                            transactionCount = list.size,
                            totalAmount = list.sumOf { it.totalAmount },
                            totalAdvance = list.sumOf { it.advancePaid },
                            totalPending = list.sumOf { it.balanceAmount },
                            transactions = list
                                .sortedByDescending { it.serviceDate }
                                .map {
                                    PersonTransaction(
                                        section = it.section,
                                        subCategory = it.subCategory,
                                        amount = it.totalAmount,
                                        date = com.example.suseelacateringcrm.util.DateUtils.formatDate(it.serviceDate),
                                    )
                                },
                        )
                    }
                    .sortedByDescending { it.totalAmount }
            }
        }
    }
}
