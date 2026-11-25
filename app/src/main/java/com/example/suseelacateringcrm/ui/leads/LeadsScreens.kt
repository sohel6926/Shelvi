package com.example.suseelacateringcrm.ui.leads

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.Lead
import com.example.suseelacateringcrm.data.model.LeadBand
import com.example.suseelacateringcrm.data.model.LeadScoring
import com.example.suseelacateringcrm.data.model.LeadSource
import com.example.suseelacateringcrm.data.model.LeadStatus
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.DayPickerField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState

private fun LeadStatus.tone(): Tone = when (this) {
    LeadStatus.NEW, LeadStatus.ASSIGNED -> Tone.INFO
    LeadStatus.CONTACTED, LeadStatus.REQUIREMENT, LeadStatus.TASTING, LeadStatus.QUALIFIED, LeadStatus.QUOTED -> Tone.WARNING
    LeadStatus.WON -> Tone.GOOD
    LeadStatus.LOST, LeadStatus.DUPLICATE, LeadStatus.INVALID -> Tone.BAD
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadsListScreen(
    padding: PaddingValues,
    onAddLead: () -> Unit,
    onOpenLead: (String) -> Unit,
    viewModel: LeadsListViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val today = DayKey.today()
    var showCancelled by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val allLeads: List<Lead> = (state as? UiState.Success<List<Lead>>)?.data.orEmpty()
    Box(Modifier.padding(padding).fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            ChoiceChips(
                options = listOf<LeadStatus?>(null) + LeadStatus.entries,
                selected = viewModel.statusFilter,
                // Module 1 on the phone: each stage shows how many leads are in it (the web board's columns).
                label = { st ->
                    val n = allLeads.count { l ->
                        !l.status.equals("Cancelled", ignoreCase = true) && (if (st == null) l.leadStatus.isOpen else l.leadStatus == st)
                    }
                    (st?.label ?: L("తెరిచి ఉన్నవి", "Open")) + " ($n)"
                },
                onSelect = { viewModel.statusFilter = it },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            when (val s = state) {
                is UiState.Loading -> LoadingIndicator()
                is UiState.Error -> ErrorBanner(s.message)
                is UiState.Success -> {
                    val filter = viewModel.statusFilter
                    // R7-3: cancelled leads stay hidden unless "రద్దైనవి చూపించు".
                    com.example.suseelacateringcrm.ui.components.ShowCancelledToggle(showCancelled, { showCancelled = it })
                    val list = s.data.filter {
                        val cancelled = it.status.equals("Cancelled", ignoreCase = true)
                        if (cancelled) showCancelled
                        else if (filter == null) it.leadStatus.isOpen
                        else it.leadStatus == filter
                    }
                    if (list.isEmpty()) {
                        EmptyState(L("Leads లేవు. + నొక్కి కొత్తది జోడించండి.", "No leads. Tap + to add one."))
                    } else {
                        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(list, key = { it.id }) { lead ->
                                LeadRow(lead, today, lead.minutesLate(System.currentTimeMillis(), viewModel.tatOn, viewModel.tatMinutes), onClick = { onOpenLead(lead.id) })
                            }
                        }
                    }
                }
            }
        }
        FloatingActionButton(onClick = onAddLead, modifier = Modifier.padding(24.dp).align(Alignment.BottomEnd)) {
            Icon(Icons.Filled.Add, contentDescription = L("కొత్త lead", "Add lead"))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LeadRow(lead: Lead, today: String, minutesLate: Int, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(lead.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Pill(lead.leadStatus.label, lead.leadStatus.tone())
            }
            Text("${lead.phone} · ${lead.leadSource.label}", style = MaterialTheme.typography.bodyMedium)
            val band = LeadScoring.band(lead, today)
            if (minutesLate > 0) {
                Pill(L("జవాబు ఆలస్యం: $minutesLate ని.", "Answer late: $minutesLate min"), Tone.BAD)
            }
            if (band != null || lead.assignedName.isNotBlank()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (band != null) {
                        Pill(band.label, when (band) { LeadBand.HOT -> Tone.BAD; LeadBand.WARM -> Tone.WARNING; LeadBand.COLD -> Tone.INFO })
                    }
                    if (lead.assignedName.isNotBlank()) Pill(L("చూసేవారు: ", "With: ") + lead.assignedName, Tone.INFO)
                }
            }
            val bits = buildList {
                if (lead.eventDate.isNotBlank()) add(L("కార్యక్రమం ", "Event ") + DayKey.display(lead.eventDate))
                if (lead.guests > 0) add(L("${lead.guests} మంది", "${lead.guests} guests"))
                if (lead.budget > 0) add(L("బడ్జెట్ ", "Budget ") + rupees(lead.budget))
            }
            if (bits.isNotEmpty()) Text(bits.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            if (lead.followUpDate.isNotBlank()) {
                val overdue = lead.followUpDate <= today && lead.leadStatus.isOpen
                Pill(
                    L("మళ్ళీ మాట్లాడాలి: ", "Follow up: ") + DayKey.display(lead.followUpDate),
                    if (overdue) Tone.BAD else Tone.INFO,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadEditScreen(
    leadId: String?,
    padding: PaddingValues,
    onDone: () -> Unit,
    onOpenCustomer: (String) -> Unit,
) {
    val viewModel: LeadEditViewModel = viewModel(
        key = "lead-edit-$leadId",
        factory = viewModelFactory { initializer { LeadEditViewModel(leadId) } },
    )
    LaunchedEffect(viewModel.saveState) {
        if (viewModel.saveState is UiState.Success) onDone()
    }
    LaunchedEffect(viewModel.convertState) {
        val s = viewModel.convertState
        if (s is UiState.Success) onOpenCustomer(s.data)
    }
    if (viewModel.loading) {
        LoadingIndicator(Modifier.padding(padding))
        return
    }
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        ScreenHeader(if (leadId == null) L("కొత్త enquiry (lead)", "New lead") else L("Lead వివరాలు", "Lead details"))
        AppTextField(viewModel.name, { viewModel.name = it }, L("పేరు", "Name"))
        AppTextField(viewModel.phone, { viewModel.phone = it }, L("ఫోన్", "Phone"), keyboardType = KeyboardType.Phone)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = viewModel.whatsappOptIn, onCheckedChange = { viewModel.whatsappOptIn = it })
            Text(L("WhatsApp లో messages పంపడానికి ఒప్పుకున్నారు", "Agreed to receive WhatsApp messages"))
        }
        if (viewModel.whatsappOptIn) com.example.suseelacateringcrm.ui.components.OptInStampLine(viewModel.optInAt, viewModel.optInBy)
        if (leadId != null) {
            NoticeBox(
                if (viewModel.assignedName.isNotBlank()) L("ఈ lead చూసేవారు: ", "This lead is with: ") + viewModel.assignedName
                else L("ఈ lead ఇంకా ఎవరికీ అప్పగించలేదు", "This lead is not with anyone yet"),
                Tone.INFO,
            )
            if (!viewModel.cancelled) {
                var showPeople by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
                OutlinedButton(
                    onClick = { showPeople = !showPeople; if (showPeople) viewModel.loadPeople() },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) { Text(if (showPeople) L("జాబితా మూసేయి", "Close the list") else L("ఎవరికి అప్పగించాలి / మార్చు", "Give to someone / change")) }
                if (showPeople) {
                    if (viewModel.teamBusy) Text(L("ఒక్క నిమిషం…", "One moment…"), style = MaterialTheme.typography.bodySmall)
                    ChoiceChips(
                        options = viewModel.people,
                        selected = viewModel.people.find { it.uid == viewModel.assignedTo },
                        label = { it.name },
                        onSelect = { viewModel.assign(it.uid) },
                    )
                    if (viewModel.assignedTo.isNotBlank()) {
                        OutlinedButton(onClick = { viewModel.assign("") }, modifier = Modifier.padding(top = 4.dp)) {
                            Text(L("ఎవరికీ వద్దు (వెనక్కి తీసుకో)", "Nobody (take it back)"))
                        }
                    }
                }
            }
        }
        SectionLabel(L("ఎక్కడ నుంచి వచ్చారు", "Source"))
        ChoiceChips(LeadSource.entries, viewModel.source, { it.label }, { viewModel.source = it })
        SectionLabel(L("కార్యక్రమం", "Event"))
        DayPickerField(L("కార్యక్రమం తేదీ", "Event date"), viewModel.eventDate, { viewModel.eventDate = it })
        AppTextField(viewModel.guestsText, { viewModel.guestsText = it.filter(Char::isDigit) }, L("అతిథులు", "Guests"), keyboardType = KeyboardType.Number)
        AppTextField(viewModel.budgetText, { viewModel.budgetText = it }, L("బడ్జెట్ (₹)", "Budget (₹)"), keyboardType = KeyboardType.Decimal)
        SectionLabel(L("స్థితి", "Status"))
        ChoiceChips(LeadStatus.entries, viewModel.status, { it.label }, { viewModel.status = it })
        if (viewModel.status == LeadStatus.LOST) {
            AppTextField(viewModel.lostReason, { viewModel.lostReason = it }, L("ఎందుకు పోయింది", "Why lost"))
        }
        DayPickerField(L("మళ్ళీ ఎప్పుడు మాట్లాడాలి", "Follow-up date"), viewModel.followUpDate, { viewModel.followUpDate = it })
        if (viewModel.followUpDate.isNotBlank()) {
            AppTextField(viewModel.followUpTime, { viewModel.followUpTime = it }, L("ఏ సమయానికి (HH:MM, ఐచ్ఛికం)", "At what time (HH:MM, optional)"))
        }
        AppTextField(viewModel.notes, { viewModel.notes = it }, L("గమనికలు", "Notes"), singleLine = false)

        if (leadId != null) {
            SectionLabel(L("టీమ్ నోట్స్", "Team notes"))
            if (viewModel.comments.isEmpty()) {
                Text(L("ఇంకా నోట్స్ లేవు.", "No notes yet."), style = MaterialTheme.typography.bodySmall)
            }
            viewModel.comments.forEach { c ->
                Card(modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(c.text, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            listOfNotNull(
                                c.createdByName.ifBlank { null },
                                c.createdAt?.let { java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT).format(it) },
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            if (!viewModel.cancelled) {
                AppTextField(viewModel.newNote, { viewModel.newNote = it }, L("కొత్త నోట్", "New note"), singleLine = false)
                OutlinedButton(
                    onClick = { viewModel.addNote() },
                    enabled = !viewModel.noteBusy && viewModel.newNote.isNotBlank(),
                    modifier = Modifier.padding(top = 4.dp),
                ) { Text(L("నోట్ జోడించు", "Add note")) }
            }
        }
        viewModel.teamError?.let { NoticeBox(it, Tone.BAD) }

        (viewModel.saveState as? UiState.Error)?.let { NoticeBox(it.message, Tone.BAD) }
        (viewModel.convertState as? UiState.Error)?.let { NoticeBox(it.message, Tone.BAD) }

        Button(
            onClick = { viewModel.save() },
            enabled = viewModel.saveState !is UiState.Loading,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) { Text(L("సేవ్ చేయి", "Save")) }
        if (viewModel.customerId.isBlank()) {
            OutlinedButton(
                onClick = { viewModel.convert() },
                enabled = viewModel.convertState !is UiState.Loading,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) { Text(L("Customer గా మార్చు (బుక్ అయింది)", "Convert to customer (won)")) }
        } else {
            OutlinedButton(
                onClick = { onOpenCustomer(viewModel.customerId) },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) { Text(L("Customer చూడండి", "Open customer")) }
        }
        // R7-3: no delete — cancel with a reason (cancelRecord).
        if (leadId != null && !viewModel.cancelled) {
            var showCancel by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
            OutlinedButton(
                onClick = { showCancel = true },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) { Text(L("Lead రద్దు చేయి", "Cancel lead")) }
            if (showCancel) {
                com.example.suseelacateringcrm.ui.components.CancelRecordDialog(
                    what = viewModel.name.ifBlank { "lead" },
                    onConfirm = { viewModel.cancelLead(it); showCancel = false },
                    onDismiss = { showCancel = false },
                )
            }
        }
    }
}
