package com.example.suseelacateringcrm.ui.leads

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Lead
import com.example.suseelacateringcrm.data.model.LeadSource
import com.example.suseelacateringcrm.data.model.LeadStatus
import com.example.suseelacateringcrm.data.repository.LeadRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

class LeadsListViewModel(
    private val leadRepository: LeadRepository = ServiceLocator.leadRepository,
    branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val _state = MutableStateFlow<UiState<List<Lead>>>(UiState.Loading)
    val state: StateFlow<UiState<List<Lead>>> = _state.asStateFlow()

    /** null = all open leads (not won / lost). */
    var statusFilter by mutableStateOf<LeadStatus?>(null)

    /** Module 1b: first-response limit from settings (server default: on, 15 minutes). */
    var tatOn by mutableStateOf(true)
        private set
    var tatMinutes by mutableStateOf(15)
        private set

    init {
        viewModelScope.launch {
            ServiceLocator.settingsRepository.businessFlow().catch { }.collect { s ->
                if (s != null) {
                    tatOn = s.leadTatOn
                    tatMinutes = s.leadTatMinutes
                }
            }
        }
        viewModelScope.launch {
            branchManager.currentBranchId
                .flatMapLatest { branchId -> leadRepository.leadsFlow(branchId) }
                .catch { e -> _state.value = UiState.Error(L("Leads లోడ్ కాలేదు", "Could not load leads") + ": ${e.message}") }
                .collect { leads ->
                    // Soonest follow-up first; leads without a follow-up date go last.
                    _state.value = UiState.Success(
                        leads.sortedWith(compareBy<Lead>({ it.followUpDate.isBlank() }, { it.followUpDate }, { it.name.lowercase() }))
                    )
                }
        }
    }
}

class LeadEditViewModel(
    private val leadId: String?,
    private val leadRepository: LeadRepository = ServiceLocator.leadRepository,
) : ViewModel() {
    var name by mutableStateOf("")
    var phone by mutableStateOf("")
    var source by mutableStateOf(LeadSource.INSTAGRAM)
    var eventDate by mutableStateOf("")
    var guestsText by mutableStateOf("")
    var budgetText by mutableStateOf("")
    var status by mutableStateOf(LeadStatus.NEW)
    var followUpDate by mutableStateOf("")
    var lostReason by mutableStateOf("")
    var whatsappOptIn by mutableStateOf(false)
    /** 🔒 server stamp (R10-8), read only. */
    var optInAt by mutableStateOf<java.util.Date?>(null)
        private set
    var optInBy by mutableStateOf("")
        private set
    var notes by mutableStateOf("")
    var customerId by mutableStateOf("")
        private set
    /** Module 1a 🔒 who handles this lead (set on the server), read only. */
    var assignedName by mutableStateOf("")
        private set
    var assignedTo by mutableStateOf("")
        private set
    /** Module 1e: follow-up time of day, "HH:MM" or "". */
    var followUpTime by mutableStateOf("")
    /** Module 1e: team notes (oldest first) and the note being typed. */
    var comments by mutableStateOf<List<com.example.suseelacateringcrm.data.model.LeadComment>>(emptyList())
        private set
    var newNote by mutableStateOf("")
    var noteBusy by mutableStateOf(false)
        private set
    /** Module 1a: people this lead can be given to (loaded when the list is opened). */
    var people by mutableStateOf<List<com.example.suseelacateringcrm.data.model.LeadAssignee>>(emptyList())
        private set
    var teamBusy by mutableStateOf(false)
        private set
    var teamError by mutableStateOf<String?>(null)
        private set
    /** True when the lead was cancelled (frozen for edits). */
    var cancelled by mutableStateOf(false)
        private set

    var loading by mutableStateOf(leadId != null)
        private set
    var saveState by mutableStateOf<UiState<String>?>(null)
        private set
    var convertState by mutableStateOf<UiState<String>?>(null)
        private set

    private var loaded: Lead? = null

    init {
        if (leadId != null) {
            viewModelScope.launch {
                val lead = try { leadRepository.getLead(leadId) } catch (e: Exception) { null }
                if (lead != null) {
                    loaded = lead
                    name = lead.name
                    phone = lead.phone
                    source = lead.leadSource
                    eventDate = lead.eventDate
                    guestsText = if (lead.guests > 0) lead.guests.toString() else ""
                    budgetText = if (lead.budget > 0) lead.budget.toString() else ""
                    status = lead.leadStatus
                    cancelled = lead.status.equals("Cancelled", ignoreCase = true)
                    followUpDate = lead.followUpDate
                    lostReason = lead.lostReason
                    whatsappOptIn = lead.whatsappOptIn
                    optInAt = lead.whatsappOptInAt
                    optInBy = lead.whatsappOptInBy
                    notes = lead.notes
                    customerId = lead.customerId
                    assignedName = lead.assignedName
                    assignedTo = lead.assignedTo
                    followUpTime = lead.followUpTime
                }
                loading = false
            }
            viewModelScope.launch {
                leadRepository.commentsFlow(leadId).catch { }.collect { comments = it }
            }
        }
    }

    fun addNote() {
        val id = leadId ?: return
        val text = newNote.trim()
        if (text.isBlank() || noteBusy) return
        viewModelScope.launch {
            noteBusy = true
            teamError = null
            try {
                leadRepository.addComment(id, text)
                newNote = ""
            } catch (e: Exception) {
                teamError = com.example.suseelacateringcrm.data.remote.CallableError.from(e).text
            }
            noteBusy = false
        }
    }

    fun loadPeople() {
        if (people.isNotEmpty() || teamBusy) return
        viewModelScope.launch {
            teamBusy = true
            teamError = null
            try {
                people = leadRepository.assignees()
            } catch (e: Exception) {
                teamError = com.example.suseelacateringcrm.data.remote.CallableError.from(e).text
            }
            teamBusy = false
        }
    }

    /** uid "" takes the lead back (nobody). */
    fun assign(uid: String) {
        val id = leadId ?: return
        if (teamBusy) return
        viewModelScope.launch {
            teamBusy = true
            teamError = null
            try {
                assignedName = leadRepository.assign(id, uid)
                assignedTo = uid
            } catch (e: Exception) {
                teamError = com.example.suseelacateringcrm.data.remote.CallableError.from(e).text
            }
            teamBusy = false
        }
    }

    private fun validated(): Lead? {
        if (name.isBlank() || phone.isBlank()) {
            saveState = UiState.Error(L("పేరు, ఫోన్ తప్పనిసరి", "Name and phone are required"))
            return null
        }
        if (phone.filter { it.isDigit() }.length < 10) {
            saveState = UiState.Error(L("ఫోన్ నంబర్ 10 అంకెలు ఉండాలి", "Phone number needs 10 digits"))
            return null
        }
        val guests = guestsText.trim().toIntOrNull()
        if (guests == null || guests < 1) {
            saveState = UiState.Error(L("అతిథులు కనీసం 1 ఉండాలి", "Guests must be at least 1"))
            return null
        }
        val budget = budgetText.trim().ifBlank { "0" }.toDoubleOrNull()
        if (budget == null || budget < 0) {
            saveState = UiState.Error(L("బడ్జెట్ మైనస్ కాకూడదు", "Budget can't be negative"))
            return null
        }
        if (leadId == null && ServiceLocator.branchManager.currentBranchId.value == null) {
            saveState = UiState.Error(L("ముందు branch ఎంచుకోండి (menu లో)", "Select a branch first (in the menu)"))
            return null
        }
        if (followUpTime.isNotBlank() && !Regex("""^([01]\d|2[0-3]):[0-5]\d$""").matches(followUpTime.trim())) {
            saveState = UiState.Error(L("సమయం 24 గంటల పద్ధతిలో HH:MM గా రాయండి (ఉదా: 16:30)", "Write the time as HH:MM, 24-hour (e.g. 16:30)"))
            return null
        }
        if (status == LeadStatus.LOST && lostReason.isBlank()) {
            saveState = UiState.Error(L("ఎందుకు పోయిందో రాయండి", "Write why the lead was lost"))
            return null
        }
        return Lead(
            id = leadId ?: "",
            name = name.trim(),
            phone = phone.trim(),
            source = source.code,
            campaignId = loaded?.campaignId ?: "",
            eventDate = eventDate,
            guests = guests,
            budget = budget,
            status = status.code,
            followUpDate = followUpDate,
            followUpTime = if (followUpDate.isBlank()) "" else followUpTime.trim(),
            lostReason = if (status == LeadStatus.LOST) lostReason.trim() else "",
            whatsappOptIn = whatsappOptIn,
            customerId = customerId,
            notes = notes.trim(),
        )
    }

    fun save() {
        val lead = validated() ?: return
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                UiState.Success(
                    leadRepository.saveLead(
                        lead,
                        createdBy = ServiceLocator.authRepository.currentUid ?: "",
                        branchId = ServiceLocator.branchManager.currentBranchId.value,
                    )
                )
            } catch (e: Exception) {
                UiState.Error(L("సేవ్ కాలేదు", "Could not save") + ": ${e.message}")
            }
        }
    }

    /** R7-3: cancel with a reason via cancelRecord; closes the form like a save. */
    fun cancelLead(reason: String) {
        val id = leadId ?: return
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = try {
                leadRepository.deleteLead(id, reason)
                cancelled = true
                UiState.Success(id)
            } catch (e: Exception) {
                UiState.Error(com.example.suseelacateringcrm.data.remote.CallableError.from(e).text)
            }
        }
    }

    /** Saves the form, then creates the customer and marks the lead won. Emits the customer id. */
    fun convert() {
        val lead = validated() ?: return
        viewModelScope.launch {
            convertState = UiState.Loading
            convertState = try {
                val uid = ServiceLocator.authRepository.currentUid ?: ""
                val id = leadRepository.saveLead(lead, uid, ServiceLocator.branchManager.currentBranchId.value)
                val newCustomerId = leadRepository.convertToCustomer(lead.copy(id = id), uid)
                customerId = newCustomerId
                status = LeadStatus.WON
                UiState.Success(newCustomerId)
            } catch (e: Exception) {
                UiState.Error(L("Customer గా మార్చలేకపోయాం", "Could not convert to customer") + ": ${e.message}")
            }
        }
    }
}
