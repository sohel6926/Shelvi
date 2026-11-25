package com.example.suseelacateringcrm.ui.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.remote.HistoryEntry
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh

/** Admin "మార్పుల చరిత్ర" screen: every change, filter by collection and person, paged. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    padding: PaddingValues,
    viewModel: HistoryViewModel = viewModel(key = "history-all", factory = viewModelFactory { initializer { HistoryViewModel() } }),
) {
    OnRefresh { viewModel.reload() }
    Column(Modifier.padding(padding).fillMaxSize().padding(horizontal = 16.dp)) {
        ScreenHeader(L("మార్పుల చరిత్ర", "Change history"), L("ఎవరు, ఎప్పుడు, ఏం మార్చారు", "Who changed what, and when"))
        ChoiceChips(
            options = listOf<String?>(null) + HISTORY_COLLECTIONS,
            selected = viewModel.collectionFilter,
            label = { it?.let { c -> collectionLabel(c) } ?: L("అన్నీ", "All") },
            onSelect = { viewModel.setCollection(it) },
        )
        var open by remember { mutableStateOf(false) }
        ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
            OutlinedTextField(
                value = viewModel.personFilter?.let { it.name.ifBlank { it.email } } ?: L("అందరూ", "Everyone"),
                onValueChange = {},
                readOnly = true,
                label = { Text(L("వ్యక్తి", "Person")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(text = { Text(L("అందరూ", "Everyone")) }, onClick = { viewModel.setPerson(null); open = false })
                viewModel.users.forEach { u ->
                    DropdownMenuItem(text = { Text(u.name.ifBlank { u.email }) }, onClick = { viewModel.setPerson(u); open = false })
                }
            }
        }
        viewModel.error?.let { NoticeBox(it, Tone.BAD) }
        if (viewModel.entries.isEmpty() && !viewModel.loading && viewModel.error == null) {
            EmptyState(L("మార్పులు లేవు", "No changes found"))
        } else {
            LazyColumn(contentPadding = PaddingValues(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(viewModel.entries) { e -> HistoryRow(e) }
                item { MoreButton(viewModel) }
            }
        }
    }
}

/** "చరిత్ర / History" section for one document (admin only — the caller checks the role). */
@Composable
fun HistorySection(collection: String, docId: String) {
    val viewModel: HistoryViewModel = viewModel(
        key = "history-$collection-$docId",
        factory = viewModelFactory { initializer { HistoryViewModel(collection, docId, pageSize = 10) } },
    )
    var expanded by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        SectionLabel(L("చరిత్ర", "History"))
        if (!expanded) {
            OutlinedButton(onClick = { expanded = true }) { Text(L("మార్పుల చరిత్ర చూపించు", "Show change history")) }
            return@Column
        }
        viewModel.error?.let { NoticeBox(it, Tone.BAD) }
        if (viewModel.entries.isEmpty() && !viewModel.loading && viewModel.error == null) {
            Text(L("మార్పులు లేవు", "No changes yet"), style = MaterialTheme.typography.bodySmall)
        }
        viewModel.entries.forEach { HistoryRow(it) }
        MoreButton(viewModel)
    }
}

@Composable
private fun HistoryRow(e: HistoryEntry) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(historySentence(e), style = MaterialTheme.typography.bodyMedium)
        HorizontalDivider(Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun MoreButton(viewModel: HistoryViewModel) {
    when {
        viewModel.loading -> Text(L("లోడ్ అవుతోంది…", "Loading…"), modifier = Modifier.padding(8.dp))
        viewModel.hasMore -> OutlinedButton(onClick = { viewModel.loadMore() }, modifier = Modifier.padding(vertical = 8.dp)) {
            Text(L("మరిన్ని చూపించు", "Show more"))
        }
        else -> {}
    }
}
