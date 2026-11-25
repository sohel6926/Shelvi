package com.example.suseelacateringcrm.ui.owner

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.currentUid
import com.example.suseelacateringcrm.util.launchSafe
import com.example.suseelacateringcrm.util.rDay
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/** contentPlan/{id} (R10-13): date, platform, idea, owner, status Idea | Ready | Posted, link. */
data class ContentItem(
    val id: String = "",
    val date: String = DayKey.today(),
    val platform: String = "Instagram",
    val idea: String = "",
    val owner: String = "",
    val status: String = "Idea",
    val link: String = "",
) {
    companion object {
        val PLATFORMS = listOf("Instagram", "Facebook", "WhatsApp status", "YouTube", "Google")
        val STATUSES = listOf("Idea", "Ready", "Posted")

        fun statusLabel(s: String) = when (s) {
            "Idea" -> L("ఆలోచన", "Idea")
            "Ready" -> L("సిద్ధం", "Ready")
            "Posted" -> L("పోస్ట్ చేశాం", "Posted")
            else -> s
        }

        fun fromMap(id: String, m: Map<String, Any?>) = ContentItem(
            id, m.rDay("date"), m.rStr("platform", "Instagram"), m.rStr("idea"), m.rStr("owner"), m.rStr("status", "Idea"), m.rStr("link"),
        )
    }
}

class ContentPlanViewModel : ViewModel() {
    private val col = ServiceLocator.firestore.collection("contentPlan")
    var items by mutableStateOf<List<ContentItem>>(emptyList())
        private set
    var statusFilter by mutableStateOf("")

    init {
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId.flatMapLatest { b ->
                (if (b != null) col.whereEqualTo("branchId", b) else col).snapshotsFlow()
            }.catchLogged("ContentPlanVM").collect { q ->
                items = q.documents.map { ContentItem.fromMap(it.id, it.data ?: emptyMap()) }.sortedBy { it.date }
            }
        }
    }

    fun save(c: ContentItem) = launchSafe("ContentPlanVM") {
        val fields = mapOf(
            "date" to c.date, "platform" to c.platform, "idea" to c.idea, "owner" to c.owner, "status" to c.status, "link" to c.link,
            "updatedBy" to currentUid(), "updatedAt" to FieldValue.serverTimestamp(),
        )
        if (c.id.isBlank()) {
            col.add(fields + mapOf(
                "branchId" to (ServiceLocator.branchManager.currentBranchId.value ?: ""),
                "createdBy" to currentUid(), "createdAt" to FieldValue.serverTimestamp(),
            )).await()
        } else {
            col.document(c.id).update(fields).await()
        }
    }
}

/** R10-13: content plan — what to post where and when (Instagram, Facebook, WhatsApp status, YouTube, Google). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ContentPlanScreen(padding: PaddingValues) {
    val vm: ContentPlanViewModel = viewModel()
    val context = LocalContext.current
    var editing by remember { mutableStateOf<ContentItem?>(null) }
    Column(Modifier.padding(padding).fillMaxSize()) {
        Button(onClick = { editing = ContentItem() }, modifier = Modifier.padding(horizontal = 16.dp)) { Text(L("+ కొత్త ఆలోచన", "+ New idea")) }
        FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            (listOf("") + ContentItem.STATUSES).forEach { s ->
                FilterChip(selected = vm.statusFilter == s, onClick = { vm.statusFilter = s }, label = {
                    Text((if (s.isBlank()) L("అన్నీ", "All") else ContentItem.statusLabel(s)) + " (${vm.items.count { s.isBlank() || it.status == s }})")
                })
            }
        }
        val shown = vm.items.filter { vm.statusFilter.isBlank() || it.status == vm.statusFilter }
        if (shown.isEmpty()) EmptyState(L("ఇంకా ఏమీ లేదు.", "Nothing planned yet."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(shown, key = { it.id }) { c ->
                val color = when (c.status) { "Posted" -> SuseelaTheme.colors.good; "Ready" -> SuseelaTheme.colors.warning; else -> SuseelaTheme.colors.info }
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(color).padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${DayKey.display(c.date)} · ${c.platform}", Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        Text(ContentItem.statusLabel(c.status), color = color)
                    }
                    Text(c.idea)
                    if (c.owner.isNotBlank()) Text(L("చేసేవారు: ${c.owner}", "Owner: ${c.owner}"), style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { editing = c }) { Text(L("మార్చు", "Edit")) }
                        val next = when (c.status) { "Idea" -> "Ready"; "Ready" -> "Posted"; else -> null }
                        next?.let { n -> TextButton(onClick = { vm.save(c.copy(status = n)) }) { Text("→ " + ContentItem.statusLabel(n)) } }
                        if (c.link.isNotBlank()) TextButton(onClick = {
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(c.link))) }
                        }) { Text(L("లింక్", "Link")) }
                    }
                }
            }
        }
    }
    editing?.let { c -> ContentDialog(c, onDismiss = { editing = null }) { vm.save(it); editing = null } }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContentDialog(initial: ContentItem, onDismiss: () -> Unit, onSave: (ContentItem) -> Unit) {
    var c by remember { mutableStateOf(initial) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) L("కొత్త ఆలోచన", "New idea") else L("మార్చు", "Edit")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(c.date), { c = c.copy(date = DayKey.of(it)) })
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ContentItem.PLATFORMS.forEach { p -> FilterChip(selected = c.platform == p, onClick = { c = c.copy(platform = p) }, label = { Text(p) }) }
                }
                AppTextField(c.idea, { c = c.copy(idea = it) }, L("ఏం పోస్ట్ చేయాలి", "What to post"), singleLine = false)
                AppTextField(c.owner, { c = c.copy(owner = it) }, L("ఎవరు చేస్తారు", "Who does it"))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ContentItem.STATUSES.forEach { s -> FilterChip(selected = c.status == s, onClick = { c = c.copy(status = s) }, label = { Text(ContentItem.statusLabel(s)) }) }
                }
                AppTextField(c.link, { c = c.copy(link = it.trim()) }, L("లింక్ (పోస్ట్ అయ్యాక)", "Link (after posting)"))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = if (c.idea.isBlank()) L("ఏం పోస్ట్ చేయాలో రాయండి", "Write the idea") else null
                if (error == null) onSave(c.copy(idea = c.idea.trim(), owner = c.owner.trim()))
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
