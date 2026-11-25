package com.example.suseelacateringcrm.ui.staff

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.model.UserProfile
import com.example.suseelacateringcrm.data.repository.StaffRepository
import com.example.suseelacateringcrm.data.repository.UserRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Date
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.launchSafe

class StaffEditViewModel(
    private val staffId: String?,
    private val staffRepository: StaffRepository = ServiceLocator.staffRepository,
    private val userRepository: UserRepository = ServiceLocator.userRepository,
) : ViewModel() {

    var name by mutableStateOf("")
    var phone by mutableStateOf("")
    var jobRole by mutableStateOf("")
    /** Module 4d: false when the private pay figures could not be read — then a save leaves them untouched. */
    private var payLoaded = true
    var dailyWageText by mutableStateOf("")
    var active by mutableStateOf(true)
    var joinedDate by mutableStateOf<Date?>(Date())
    var linkedUserId by mutableStateOf("")
    /** "daily" or "monthly" (api-contract, Staff). */
    var payType by mutableStateOf(com.example.suseelacateringcrm.data.model.PayType.DAILY.code)
    var monthlySalaryText by mutableStateOf("")
    var emergencyPhone by mutableStateOf("")

    var loading by mutableStateOf(staffId != null)
        private set
    var saveState by mutableStateOf<UiState<Unit>?>(null)
        private set

    private val _users = MutableStateFlow<List<UserProfile>>(emptyList())
    val users: StateFlow<List<UserProfile>> = _users.asStateFlow()

    init {
        viewModelScope.launch {
            userRepository.allUsersFlow().catchLogged("StaffEditViewModel").collect { _users.value = it }
        }
        if (staffId != null) {
            launchSafe("StaffEditViewModel", onError = { loading = false }) {
                val (existing, payOk) = staffRepository.getStaffWithPay(staffId)
                payLoaded = payOk
                if (existing != null) {
                    name = existing.name
                    phone = existing.phone
                    jobRole = existing.jobRole
                    dailyWageText = if (existing.dailyWage == 0.0) "" else existing.dailyWage.toString()
                    active = existing.active
                    joinedDate = existing.joinedDate
                    linkedUserId = existing.linkedUserId
                    payType = existing.payType.ifBlank { com.example.suseelacateringcrm.data.model.PayType.DAILY.code }
                    monthlySalaryText = if (existing.monthlySalary == 0.0) "" else existing.monthlySalary.toString()
                    emergencyPhone = existing.emergencyPhone
                }
                loading = false
            }
        }
    }

    fun save() {
        if (name.isBlank() || phone.isBlank()) {
            saveState = UiState.Error(com.example.suseelacateringcrm.util.L("పేరు, ఫోన్ తప్పనిసరి", "Name and phone are required"))
            return
        }
        val wage = dailyWageText.toDoubleOrNull()
        val salary = monthlySalaryText.toDoubleOrNull()
        if ((dailyWageText.isNotBlank() && (wage == null || wage < 0)) || (monthlySalaryText.isNotBlank() && (salary == null || salary < 0))) {
            saveState = UiState.Error(com.example.suseelacateringcrm.util.L("జీతం సరైన సంఖ్య కాదు (మైనస్ కాకూడదు)", "Wage/salary must be a number, not negative"))
            return
        }
        val branchId = ServiceLocator.branchManager.currentBranchId.value
        if (staffId == null && branchId == null) {
            saveState = UiState.Error(L("ముందు menu లో branch ఎంచుకోండి", "Select a branch before adding a staff member"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                val staff = Staff(
                    id = staffId ?: "",
                    name = name.trim(),
                    phone = phone.trim(),
                    jobRole = jobRole.trim(),
                    dailyWage = dailyWageText.toDoubleOrNull() ?: 0.0,
                    active = active,
                    joinedDate = joinedDate,
                    linkedUserId = linkedUserId,
                    payType = payType,
                    monthlySalary = monthlySalaryText.toDoubleOrNull() ?: 0.0,
                    emergencyPhone = emergencyPhone.trim(),
                )
                staffRepository.saveStaff(staff, branchId, includePay = payLoaded)
                UiState.Success(Unit)
            } catch (e: Exception) {
                UiState.Error(L("సిబ్బంది సేవ్ కాలేదు", "Failed to save staff") + (e.message?.let { ": $it" } ?: ""))
            }
        }
    }
}
