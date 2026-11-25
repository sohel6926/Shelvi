package com.example.suseelacateringcrm.ui.history

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.UserProfile
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.HistoryEntry
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.launch

/**
 * Change history via the admin-only `getHistory` callable, with filters and paging.
 * [fixedCollection]/[fixedDocId] are set for the per-document history section.
 */
class HistoryViewModel(
    private val fixedCollection: String? = null,
    private val fixedDocId: String? = null,
    private val pageSize: Int = 30,
) : ViewModel() {
    var collectionFilter by mutableStateOf<String?>(null)
        private set
    var personFilter by mutableStateOf<UserProfile?>(null)
        private set
    var entries by mutableStateOf<List<HistoryEntry>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var hasMore by mutableStateOf(false)
        private set
    var users by mutableStateOf<List<UserProfile>>(emptyList())
        private set

    private var cursor: Any? = null

    init {
        if (fixedDocId == null) {
            // Person filter list (users are admin-readable).
            viewModelScope.launch {
                ServiceLocator.userRepository.allUsersFlow().catchLogged("HistoryViewModel")
                    .collect { users = it.sortedBy { u -> u.name.lowercase() } }
            }
        }
        reload()
    }

    fun setCollection(c: String?) {
        collectionFilter = c
        reload()
    }

    fun setPerson(u: UserProfile?) {
        personFilter = u
        reload()
    }

    fun reload() {
        cursor = null
        entries = emptyList()
        loadMore()
    }

    fun loadMore() {
        if (loading) return
        viewModelScope.launch {
            loading = true
            error = null
            ServiceLocator.functions.getHistory(
                collection = fixedCollection ?: collectionFilter,
                docId = fixedDocId,
                by = personFilter?.uid,
                limit = pageSize,
                startAfter = cursor,
            ).fold(
                onSuccess = { page ->
                    entries = entries + page.entries
                    cursor = page.nextCursor
                    hasMore = page.nextCursor != null && page.entries.isNotEmpty()
                },
                onFailure = { error = CallableError.from(it).text },
            )
            loading = false
        }
    }
}
