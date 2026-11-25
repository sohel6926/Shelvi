package com.example.suseelacateringcrm.ui.owner

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
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
import coil.compose.AsyncImage
import com.example.suseelacateringcrm.data.model.Booking
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
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.rStringList
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * calendarNotes/{id} (20 Nov 2026, same collection as the web "Festivals & notes" page):
 * day (YYYY-MM-DD), kind Festival | Idea | Note | Reminder, title, note. Admin and manager only (firestore.rules).
 * photos: up to 5 pictures (Storage `gallery/`). The CRM ships no festival dates — the owner types them. Below the notes the
 * month's event bookings are listed (not cancelled ones), like the web page.
 */
data class CalendarNote(
    val id: String = "",
    val day: String = DayKey.today(),
    val kind: String = "Festival",
    val title: String = "",
    val note: String = "",
    val photos: List<String> = emptyList(),
) {
    companion object {
        val KINDS = listOf("Festival", "Idea", "Note", "Reminder")

        fun kindLabel(k: String) = when (k) {
            "Festival" -> L("పండుగ", "Festival")
            "Idea" -> L("ఐడియా", "Idea")
            "Note" -> L("నోట్", "Note")
            "Reminder" -> L("గుర్తు", "Reminder")
            else -> k
        }

        fun fromMap(id: String, m: Map<String, Any?>): CalendarNote {
            val kind = m.rStr("kind", "Note")
            return CalendarNote(id, m.rStr("day"), if (kind in KINDS) kind else "Note", m.rStr("title"), m.rStr("note"), m.rStringList("photos"))
        }

        /** "2026-11" shifted by [delta] months, without java.time (minSdk 24). */
        fun shiftMonth(month: String, delta: Int): String {
            val y = month.substring(0, 4).toInt()
            val m = month.substring(5, 7).toInt() - 1 + delta
            val ny = y + Math.floorDiv(m, 12)
            val nm = Math.floorMod(m, 12) + 1
            return "%04d-%02d".format(ny, nm)
        }
    }
}

class CalendarNotesViewModel : ViewModel() {
    private val col = ServiceLocator.firestore.collection("calendarNotes")
    private val monthFlow = MutableStateFlow(DayKey.today().substring(0, 7))
    var month by mutableStateOf(monthFlow.value)
        private set
    var notes by mutableStateOf<List<CalendarNote>>(emptyList())
        private set

    /** The month's event bookings (not cancelled), earliest first. */
    private var bookings by mutableStateOf<List<Booking>>(emptyList())
    val events: List<Booking>
        get() = bookings.filter { it.status != "Cancelled" && it.eventDate != null && DayKey.of(it.eventDate!!).startsWith(month) }
            .sortedBy { it.eventDate }

    init {
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId.flatMapLatest { b -> ServiceLocator.bookingRepository.bookingsFlow(b) }
                .catchLogged("CalendarNotesVM").collect { all -> bookings = all }
        }
        viewModelScope.launch {
            monthFlow.flatMapLatest { m ->
                col.whereGreaterThanOrEqualTo("day", "$m-01").whereLessThanOrEqualTo("day", "$m-31").snapshotsFlow()
            }.catchLogged("CalendarNotesVM").collect { q ->
                notes = q.documents.map { CalendarNote.fromMap(it.id, it.data ?: emptyMap()) }
                    .sortedWith(compareBy({ it.day }, { it.kind }))
            }
        }
    }

    fun shift(delta: Int) {
        month = CalendarNote.shiftMonth(month, delta)
        monthFlow.value = month
    }

    fun save(n: CalendarNote) = launchSafe("CalendarNotesVM") {
        val fields = mapOf(
            "day" to n.day, "kind" to n.kind, "title" to n.title, "note" to n.note, "photos" to n.photos,
            "updatedBy" to currentUid(), "updatedAt" to FieldValue.serverTimestamp(),
        )
        if (n.id.isBlank()) {
            col.add(fields + mapOf("createdBy" to currentUid(), "createdAt" to FieldValue.serverTimestamp())).await()
        } else {
            col.document(n.id).update(fields).await()
        }
    }

    fun delete(id: String) = launchSafe("CalendarNotesVM") { col.document(id).delete().await() }
}

/** Festivals, ideas, notes and reminders by day, one month at a time. */
@Composable
fun CalendarNotesScreen(padding: PaddingValues) {
    val vm: CalendarNotesViewModel = viewModel()
    var editing by remember { mutableStateOf<CalendarNote?>(null) }
    Column(Modifier.padding(padding).fillMaxSize()) {
        Row(Modifier.padding(horizontal = 16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { vm.shift(-1) }) { Text("‹") }
            Text(vm.month, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
            TextButton(onClick = { vm.shift(1) }) { Text("›") }
            Button(onClick = {
                val today = DayKey.today()
                editing = CalendarNote(day = if (today.startsWith(vm.month)) today else "${vm.month}-01")
            }) { Text(L("+ కొత్తది", "+ Add")) }
        }
        if (vm.notes.isEmpty()) EmptyState(L("ఈ నెల ఇంకా ఏమీ లేదు.", "Nothing this month yet."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(vm.notes, key = { it.id }) { n ->
                val color = when (n.kind) {
                    "Festival" -> SuseelaTheme.colors.warning
                    "Reminder" -> SuseelaTheme.colors.good
                    else -> SuseelaTheme.colors.info
                }
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(color).padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(DayKey.display(n.day), Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        Text(CalendarNote.kindLabel(n.kind), color = color)
                    }
                    Text(n.title)
                    if (n.note.isNotBlank()) Text(n.note, style = MaterialTheme.typography.bodySmall)
                    if (n.photos.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                        n.photos.forEach { AsyncImage(model = it, contentDescription = null, modifier = Modifier.size(64.dp)) }
                    }
                    TextButton(onClick = { editing = n }) { Text(L("మార్చు", "Edit")) }
                }
            }
            if (vm.events.isNotEmpty()) {
                item(key = "events-title") {
                    Text(L("ఈ నెల ఈవెంట్లు", "Events this month"), Modifier.padding(top = 12.dp, bottom = 4.dp), fontWeight = FontWeight.SemiBold)
                }
                items(vm.events, key = { "ev-" + it.id }) { b ->
                    Text(
                        "🍽 ${DayKey.display(DayKey.of(b.eventDate!!))} · ${b.customerNameSnapshot} · ${b.guestCount}" + if (b.eventType.isNotBlank()) " · ${b.eventType}" else "",
                        Modifier.padding(vertical = 2.dp),
                        color = SuseelaTheme.colors.good,
                    )
                }
            }
        }
    }
    editing?.let { n ->
        CalendarNoteDialog(n, onDismiss = { editing = null }, onDelete = { vm.delete(it); editing = null }) { vm.save(it); editing = null }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CalendarNoteDialog(initial: CalendarNote, onDismiss: () -> Unit, onDelete: (String) -> Unit, onSave: (CalendarNote) -> Unit) {
    var n by remember { mutableStateOf(initial) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) L("కొత్తది", "New") else L("మార్చు", "Edit")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(n.day), { n = n.copy(day = DayKey.of(it)) })
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CalendarNote.KINDS.forEach { k -> FilterChip(selected = n.kind == k, onClick = { n = n.copy(kind = k) }, label = { Text(CalendarNote.kindLabel(k)) }) }
                }
                AppTextField(n.title, { n = n.copy(title = it) }, L("పేరు", "Title"))
                AppTextField(n.note, { n = n.copy(note = it) }, L("వివరం (ఐచ్ఛికం)", "Details (optional)"), singleLine = false)
                NotePhotos(n.photos) { n = n.copy(photos = it) }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = if (n.title.trim().length < 2) L("పేరు రాయండి", "Write a title") else null
                if (error == null) onSave(n.copy(title = n.title.trim(), note = n.note.trim()))
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = {
            Row {
                if (initial.id.isNotBlank()) TextButton(onClick = { onDelete(initial.id) }) { Text(L("తీసేయి", "Delete"), color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) }
            }
        },
    )
}

/** Up to 5 pictures on a note: gallery -> compressed JPEG -> Storage `gallery/` (admin / manager may add) -> links on the note. */
@Composable
private fun NotePhotos(photos: List<String>, onChange: (List<String>) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    val room = (5 - photos.size).coerceAtLeast(1)
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(room)) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            msg = null
            val added = mutableListOf<String>()
            for (uri in uris.take(5 - photos.size)) {
                try { added += ServiceLocator.settingsRepository.uploadImage("gallery", uri) } catch (e: Exception) { msg = L("కొన్ని ఫోటోలు upload కాలేదు.", "Some photos failed to upload.") }
            }
            onChange(photos + added)
            busy = false
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            photos.forEach { url ->
                Column {
                    AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(64.dp))
                    TextButton(onClick = { onChange(photos - url) }) { Text("✕") }
                }
            }
        }
        if (photos.size < 5) OutlinedButton(enabled = !busy, onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
            Text(if (busy) L("Upload అవుతోంది…", "Uploading…") else L("ఫోటో జోడించు (5 వరకు)", "Add photo (up to 5)"))
        }
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
