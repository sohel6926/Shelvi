package com.example.suseelacateringcrm.ui.users

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.model.UserProfile
import com.example.suseelacateringcrm.data.repository.BranchRepository
import com.example.suseelacateringcrm.data.repository.UserRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.launchSafe

class UserManagementViewModel(
    private val userRepository: UserRepository = ServiceLocator.userRepository,
    private val branchRepository: BranchRepository = ServiceLocator.branchRepository,
) : ViewModel() {

    private val _users = MutableStateFlow<List<UserProfile>>(emptyList())
    val users: StateFlow<List<UserProfile>> = _users.asStateFlow()

    private val _branches = MutableStateFlow<List<Branch>>(emptyList())
    val branches: StateFlow<List<Branch>> = _branches.asStateFlow()

    init {
        viewModelScope.launch {
            userRepository.allUsersFlow().catchLogged("UserManagementViewModel").collect { users ->
                _users.value = users.sortedBy { it.name.lowercase() }
            }
        }
        viewModelScope.launch {
            branchRepository.activeBranchesFlow().catchLogged("UserManagementViewModel").collect { branches ->
                _branches.value = branches.sortedBy { it.name.lowercase() }
            }
        }
    }

    fun setRole(uid: String, role: String) {
        launchSafe("UserManagementViewModel") { userRepository.updateRole(uid, role) }
    }

    fun setJobRole(uid: String, jobRole: String) {
        launchSafe("UserManagementViewModel") { userRepository.updateJobRole(uid, jobRole) }
    }

    fun setActive(uid: String, active: Boolean) {
        launchSafe("UserManagementViewModel") { userRepository.updateActive(uid, active) }
    }

    fun setBranch(uid: String, branchId: String) {
        launchSafe("UserManagementViewModel") { userRepository.updateBranch(uid, branchId) }
    }
}
