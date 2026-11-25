package com.example.suseelacateringcrm.ui.owner

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.snapshotsFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

/**
 * Company, brands, branches, kitchens and stores on the phone (owner only): a list per kind, add / edit through
 * `saveMaster` (form in MasterForms.kt — brand logo upload stays on the web) and the status change (Active / Paused /
 * Archived) through `setMasterStatus`.
 */
data class MasterRow(val id: String, val code: String, val name: String, val status: String, val raw: Map<String, Any?> = emptyMap()) {
    companion object {
        /** kind → Firestore collection, in the order shown. */
        val KINDS = listOf("company" to "companies", "brand" to "brands", "branch" to "branches", "kitchen" to "kitchens", "store" to "stores")

        fun kindLabel(k: String) = when (k) {
            "company" -> L("కంపెనీ", "Company")
            "brand" -> L("బ్రాండ్‌లు", "Brands")
            "branch" -> L("శాఖలు", "Branches")
            "kitchen" -> L("వంటశాలలు", "Kitchens")
            else -> L("స్టోర్లు", "Stores")
        }

        fun statusLabel(s: String) = when (s) {
            "draft" -> L("డ్రాఫ్ట్", "Draft")
            "active" -> L("వాడుకలో", "Active")
            "inactive" -> L("తాత్కాలికంగా ఆపారు", "Paused")
            "archived" -> L("ఆర్కైవ్", "Archived")
            else -> s
        }

        const val STATUS_ACTIVE = "active"
        val STATUSES = listOf("active", "inactive", "archived")

        fun fromMap(kind: String, id: String, m: Map<String, Any?>): MasterRow {
            val name = if (kind == "company") m.rStr("displayName").ifBlank { m.rStr("legalName") } else m.rStr("name")
            val raw = m.rStr("status")
            val status = if (raw in listOf("draft", "active", "inactive", "archived")) raw else if (m["active"] == false) "inactive" else "active"
            return MasterRow(id, m.rStr("code"), name.ifBlank { id }, status, m)
        }
    }
}

class MastersViewModel : ViewModel() {
    var kind by mutableStateOf("branch")
        private set
    /** Every kind's records (the parent pickers of the form need them). */
    var all by mutableStateOf<Map<String, List<MasterRow>>>(emptyMap())
        private set
    val rows: List<MasterRow> get() = all[kind].orEmpty()

    init {
        MasterRow.KINDS.forEach { (k, coll) ->
            viewModelScope.launch {
                ServiceLocator.firestore.collection(coll).snapshotsFlow().catchLogged("MastersVM").collect { q ->
                    val list = q.documents.map { MasterRow.fromMap(k, it.id, it.data ?: emptyMap()) }.sortedBy { it.code.ifBlank { it.name } }
                    all = all + (k to list)
                }
            }
        }
    }

    fun pick(k: String) { kind = k }

    /** Returns an error text or null. */
    suspend fun setStatus(id: String, status: String, reason: String): String? =
        ServiceLocator.functions.setMasterStatus(kind, id, status, reason).exceptionOrNull()?.let { CallableError.from(it).text }

    /** Add (id == null) or change one record. Returns an error text or null. */
    suspend fun save(id: String?, data: Map<String, Any?>): String? =
        ServiceLocator.functions.saveMaster(kind, id, data).exceptionOrNull()?.let { CallableError.from(it).text }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MastersScreen(padding: PaddingValues) {
    val vm: MastersViewModel = viewModel()
    var editing by remember { mutableStateOf<MasterRow?>(null) }
    var form by remember { mutableStateOf<MasterRow?>(null) }
    var adding by remember { mutableStateOf(false) }
    Column(Modifier.padding(padding).fillMaxSize()) {
        FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            MasterRow.KINDS.forEach { (k, _) ->
                FilterChip(selected = vm.kind == k, onClick = { vm.pick(k) }, label = { Text(MasterRow.kindLabel(k)) })
            }
        }
        TextButton(onClick = { adding = true }, modifier = Modifier.padding(horizontal = 8.dp)) { Text(L("+ కొత్తది చేర్చు", "+ Add new")) }
        if (vm.rows.isEmpty()) EmptyState(L("ఇంకా ఏమీ లేదు.", "Nothing here yet."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(vm.rows, key = { it.id }) { r ->
                val color = when (r.status) {
                    "active" -> SuseelaTheme.colors.good
                    "inactive" -> SuseelaTheme.colors.warning
                    else -> SuseelaTheme.colors.info
                }
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(color).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(r.name, fontWeight = FontWeight.SemiBold)
                        if (r.code.isNotBlank()) Text(r.code, style = MaterialTheme.typography.bodySmall)
                        Text(MasterRow.statusLabel(r.status), color = color)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        TextButton(onClick = { form = r }) { Text(L("మార్చు", "Edit")) }
                        TextButton(onClick = { editing = r }) { Text(L("స్థితి మార్చు", "Change status")) }
                    }
                }
            }
        }
    }
    if (adding) MasterFormDialog(vm.kind, null, vm.all, onDismiss = { adding = false }) { data -> vm.save(null, data) }
    form?.let { r -> MasterFormDialog(vm.kind, r, vm.all, onDismiss = { form = null }) { data -> vm.save(r.id, data) } }
    editing?.let { r ->
        StatusDialog(r, onDismiss = { editing = null }) { status, reason -> vm.setStatus(r.id, status, reason) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatusDialog(row: MasterRow, onDismiss: () -> Unit, onSave: suspend (String, String) -> String?) {
    var status by remember { mutableStateOf(row.status) }
    var reason by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(row.name) },
        text = {
            Column {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    MasterRow.STATUSES.forEach { s -> FilterChip(selected = status == s, onClick = { status = s }, label = { Text(MasterRow.statusLabel(s)) }) }
                }
                AppTextField(reason, { reason = it }, L("కారణం", "Reason"), singleLine = false)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                if (status == row.status) { error = L("అదే స్థితి ఉంది", "Already in this status"); return@TextButton }
                if (reason.isBlank()) { error = L("కారణం రాయండి", "Write a reason"); return@TextButton }
                busy = true
                error = null
                scope.launch {
                    val err = onSave(status, reason)
                    busy = false
                    if (err == null) onDismiss() else error = err
                }
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
