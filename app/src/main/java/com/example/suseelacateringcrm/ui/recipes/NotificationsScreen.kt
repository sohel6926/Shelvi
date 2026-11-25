package com.example.suseelacateringcrm.ui.recipes

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.currentUid
import com.example.suseelacateringcrm.util.launchSafe
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rMap
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.rStringList
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import java.util.Date

/** notifications/{id} (Round 8): plan-ready | plan-changed | plan-tomorrow, title { te, en }, link "/day-plan?date=…". */
data class AppNotification(
    val id: String,
    val kind: String,
    val titleTe: String,
    val titleEn: String,
    val link: String,
    val day: String,
    val createdAt: Date?,
    val read: Boolean,
) {
    val title: String get() = L(titleTe.ifBlank { titleEn }, titleEn.ifBlank { titleTe })

    /** Date the Day plan should open on. */
    val planDate: String get() = day.ifBlank { Regex("date=(\\d{4}-\\d{2}-\\d{2})").find(link)?.groupValues?.get(1) ?: "" }
}

class NotificationsViewModel : ViewModel() {
    var items by mutableStateOf<List<AppNotification>>(emptyList())
        private set

    init {
        val role = when (ServiceLocator.currentRole()) {
            UserRole.ADMIN -> "admin"
            UserRole.MANAGER -> "manager"
            else -> null
        }
        val uid = currentUid()
        viewModelScope.launch {
            val flow: kotlinx.coroutines.flow.Flow<com.google.firebase.firestore.QuerySnapshot?> = if (role == null) flowOf(null) else
                ServiceLocator.firestore.collection("notifications").whereArrayContains("audienceRoles", role).snapshotsFlow()
            flow.catchLogged("NotificationsVM").collect { q ->
                items = q?.documents?.map { d ->
                    val m = d.data ?: emptyMap()
                    val t = m.rMap("title")
                    AppNotification(
                        id = d.id, kind = m.rStr("kind"),
                        titleTe = t.rStr("te").ifBlank { m.rStr("title") }, titleEn = t.rStr("en"),
                        link = m.rStr("link"), day = m.rStr("day"), createdAt = m.rDate("createdAt"),
                        read = uid in m.rStringList("readBy"),
                    )
                }?.sortedByDescending { it.createdAt } ?: emptyList()
            }
        }
    }

    /** Only `readBy` changes (rules: arrayUnion of the caller's uid). */
    fun markRead(n: AppNotification) {
        if (n.read) return
        launchSafe("NotificationsVM") {
            ServiceLocator.firestore.collection("notifications").document(n.id)
                .update("readBy", FieldValue.arrayUnion(currentUid()))
        }
    }
}

private fun kindLabel(k: String) = when (k) {
    "plan-ready" -> L("వంట plan సిద్ధం", "Plan ready")
    "plan-changed" -> L("plan మారింది", "Plan changed")
    "plan-tomorrow" -> L("రేపటి plan", "Tomorrow's plan")
    else -> k
}

/** Round 8: kitchen notifications; tapping opens the Day plan of that date. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(padding: PaddingValues, onOpenDayPlan: (String) -> Unit) {
    val vm: NotificationsViewModel = viewModel()
    Column(Modifier.padding(padding).fillMaxSize()) {
        if (vm.items.isEmpty()) EmptyState(L("సందేశాలు లేవు.", "No notifications."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(vm.items, key = { it.id }) { n ->
                Card(onClick = { vm.markRead(n); onOpenDayPlan(n.planDate) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            kindLabel(n.kind) + (if (n.planDate.isNotBlank()) " · ${DayKey.display(n.planDate)}" else ""),
                            style = MaterialTheme.typography.labelMedium,
                        )
                        Text(n.title, fontWeight = if (n.read) FontWeight.Normal else FontWeight.SemiBold)
                        Text(DateUtils.formatDateTime(n.createdAt), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
