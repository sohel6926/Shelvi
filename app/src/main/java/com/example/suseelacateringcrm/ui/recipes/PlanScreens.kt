package com.example.suseelacateringcrm.ui.recipes

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.GroceryItem
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.DayPlanResult
import com.example.suseelacateringcrm.data.remote.EventPlanResult
import com.example.suseelacateringcrm.data.remote.PlanDish
import com.example.suseelacateringcrm.data.remote.PlanIngredient
import com.example.suseelacateringcrm.data.remote.dayPlan
import com.example.suseelacateringcrm.data.remote.eventPlan
import com.example.suseelacateringcrm.data.remote.planSourceLabel
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.bookings.serviceStyleLabel
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtNum
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

fun unitText(unit: String): String = when (unit) {
    "kg" -> L("కిలో", "kg")
    "L" -> L("లీటర్", "L")
    "pcs" -> L("ముక్కలు", "pcs")
    else -> unit
}

/** Grocery names for the ingredient maths (shared by the plan screens). */
open class GroceryNamesViewModel : ViewModel() {
    private val _groceries = MutableStateFlow<Map<String, GroceryItem>>(emptyMap())
    val groceries: StateFlow<Map<String, GroceryItem>> = _groceries.asStateFlow()

    init {
        viewModelScope.launch {
            ServiceLocator.kitchenRepository.groceryItemsFlow().catchLogged("GroceryNames").collect { list -> _groceries.value = list.associateBy { it.id } }
        }
    }
}

// ---------------------------------------------------------------------------------------------- shared cards

/** One dish of a plan: qty, learning badge, per-100 + source, why-lines and ingredient maths (all server values). */
@Composable
fun PlanDishCard(d: PlanDish, groceries: Map<String, GroceryItem>) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(badgeColor(d.status, d.eventsUsed)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(d.name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Text(
                d.qty?.let { "${fmtNum(it)} ${unitText(d.unit)}" } ?: L("లెక్క లేదు", "No number"),
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
            )
        }
        Text(d.badge, color = badgeColor(d.status, d.eventsUsed), style = MaterialTheme.typography.labelMedium)
        d.per100?.let {
            Text(
                L("100 మందికి ${fmtNum(it)} ${unitText(d.unit)}", "${fmtNum(it)} ${unitText(d.unit)} per 100 guests") +
                    " · " + planSourceLabel(d.source) +
                    if (d.matchedEvents > 0) L(" · ${d.matchedEvents} కార్యక్రమాలు", " · ${d.matchedEvents} events") else "",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        d.why.forEach { w -> Text("• " + w.text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (d.ingredients.isNotEmpty() && d.qty != null) {
            Text(L("పదార్థాల లెక్క", "Ingredient maths"), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 4.dp))
            d.ingredients.forEach { i ->
                val g = groceries[i.groceryItemId]
                Text(
                    "${g?.name ?: i.groceryItemId}: ${fmtNum(d.qty)} × ${fmtNum(i.perUnit)} = ${fmtNum(i.qty)} ${g?.let { unitText(it.unit) } ?: ""}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun badgeColor(status: String, events: Int) = when {
    status == "learned" || events >= 5 -> SuseelaTheme.colors.good
    events > 0 -> SuseelaTheme.colors.warning
    else -> SuseelaTheme.colors.info
}

/** Ingredients: needed / in stock / to buy. */
@Composable
fun IngredientsTable(list: List<PlanIngredient>) {
    if (list.isEmpty()) return
    Text(L("సరుకులు", "Ingredients"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
    Row(Modifier.fillMaxWidth()) {
        Text(L("సరుకు", "Item"), Modifier.weight(1f), style = MaterialTheme.typography.labelMedium)
        Text(L("కావాలి", "Need"), Modifier.width(72.dp), style = MaterialTheme.typography.labelMedium)
        Text(L("ఉంది", "Stock"), Modifier.width(64.dp), style = MaterialTheme.typography.labelMedium)
        Text(L("కొనాలి", "Buy"), Modifier.width(72.dp), style = MaterialTheme.typography.labelMedium)
    }
    list.forEach { g ->
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Text("${g.name} (${unitText(g.unit)})", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            Text(fmtNum(g.needed), Modifier.width(72.dp), style = MaterialTheme.typography.bodySmall)
            Text(fmtNum(g.inStock), Modifier.width(64.dp), style = MaterialTheme.typography.bodySmall)
            Text(
                fmtNum(g.toBuy), Modifier.width(72.dp), style = MaterialTheme.typography.bodySmall,
                fontWeight = if (g.toBuy > 0) FontWeight.SemiBold else FontWeight.Normal,
                color = if (g.toBuy > 0) SuseelaTheme.colors.bad else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

// ---------------------------------------------------------------------------------------------- event plan

class EventPlanViewModel(private val bookingId: String, initialSession: String?) : GroceryNamesViewModel() {
    var sessionId by mutableStateOf(initialSession ?: "")
        private set
    var booking by mutableStateOf<Booking?>(null)
        private set
    var state by mutableStateOf<UiState<EventPlanResult>>(UiState.Loading)
        private set

    init {
        viewModelScope.launch {
            ServiceLocator.bookingRepository.bookingFlow(bookingId).catchLogged("EventPlanVM").collect { booking = it }
        }
        load()
    }

    fun pickSession(id: String) {
        sessionId = id
        load()
    }

    fun load() {
        viewModelScope.launch { reload() }
    }

    suspend fun reload() {
        state = UiState.Loading
        state = ServiceLocator.functions.eventPlan(bookingId, sessionId).fold(
            onSuccess = { UiState.Success(it) },
            onFailure = { UiState.Error(CallableError.from(it).text) },
        )
    }
}

/** Round 8: cooking plan of one booking / meal session (eventPlan). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EventPlanScreen(padding: PaddingValues, bookingId: String, sessionId: String?, onOpenCookLog: () -> Unit) {
    val vm: EventPlanViewModel = viewModel(
        key = "event-plan-$bookingId-${sessionId ?: ""}",
        factory = viewModelFactory { initializer { EventPlanViewModel(bookingId, sessionId) } },
    )
    OnRefresh { vm.reload() }
    val groceries by vm.groceries.collectAsStateWithLifecycle()
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        val b = vm.booking
        if (b != null) {
            Text(b.customerNameSnapshot, style = MaterialTheme.typography.titleLarge)
            if (b.serviceStyle.isBlank() && b.sessions.none { it.serviceStyle.isNotBlank() }) {
                NoticeBox(L("Booking లో 'బంతి భోజనం / బఫే' ఎంచుకోండి — plan దాని మీద ఆధారపడుతుంది.", "Choose banthi / buffet on the booking — the plan depends on it."), Tone.WARNING)
            }
            if (b.sessions.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = vm.sessionId.isBlank(), onClick = { vm.pickSession("") }, label = { Text(L("అన్ని భోజనాలు", "All meals")) })
                    b.sessions.sortedWith(compareBy({ it.date }, { it.serveTime })).forEach { s ->
                        FilterChip(selected = vm.sessionId == s.id, onClick = { vm.pickSession(s.id) }, label = { Text(s.name) })
                    }
                }
            }
        }
        OutlinedButton(onClick = onOpenCookLog) { Text(L("కార్యక్రమం అయ్యాక: వంట లాగ్", "After the event: cook log")) }
        when (val s = vm.state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> {
                NoticeBox(s.message, Tone.BAD)
                TextButton(onClick = { vm.load() }) { Text(L("మళ్ళీ ప్రయత్నించు", "Try again")) }
            }
            is UiState.Success -> {
                val r = s.data
                if (r.parts.isEmpty() || r.dishes.isEmpty()) {
                    NoticeBox(L("ఈ కార్యక్రమానికి మెనూ వంటకాలు లేవు — కొటేషన్ / మెనూ ప్యాకేజీలో వంటకాలు ఎంచుకోండి.", "No menu dishes for this event — pick dishes in the quotation / menu package."), Tone.INFO)
                }
                r.parts.forEach { p ->
                    Text(
                        listOf(p.label.ifBlank { p.customer }, DayKey.display(p.day), L("${p.guests} మంది", "${p.guests} guests"),
                            serviceStyleLabel(p.serviceStyle)).filter { it.isNotBlank() }.joinToString(" · "),
                        style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp),
                    )
                    if (p.comboKey.isNotBlank()) Text(L("మెనూ కలయిక: ${p.comboKey}", "Menu combo: ${p.comboKey}"), style = MaterialTheme.typography.bodySmall)
                    PartExtras(p)
                    p.dishes.forEach { PlanDishCard(it, groceries) }
                }
                IngredientsTable(r.ingredients)
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------- day plan

class DayPlanViewModel(initialDate: String?) : GroceryNamesViewModel() {
    var date by mutableStateOf(initialDate?.takeIf { it.length >= 10 } ?: DayKey.today())
        private set
    var state by mutableStateOf<UiState<DayPlanResult>>(UiState.Loading)
        private set

    init { load() }

    fun pickDate(d: String) {
        date = d
        load()
    }

    fun load() {
        viewModelScope.launch { reload() }
    }

    suspend fun reload() {
        state = UiState.Loading
        state = ServiceLocator.functions.dayPlan(date, ServiceLocator.branchManager.currentBranchId.value).fold(
            onSuccess = { UiState.Success(it) },
            onFailure = { UiState.Error(CallableError.from(it).text) },
        )
    }
}

/** WhatsApp text of the day plan (server numbers only). */
private fun dayPlanText(r: DayPlanResult): String = buildString {
    appendLine(L("📋 ${DayKey.display(r.date)} వంట plan", "📋 Cooking plan ${DayKey.display(r.date)}"))
    r.events.forEach { e -> appendLine("• ${e.label.ifBlank { e.customer }} — ${e.guests} " + L("మంది", "guests") + " (${serviceStyleLabel(e.serviceStyle)})") }
    appendLine()
    appendLine(L("వంటకాలు:", "Dishes:"))
    r.dishes.forEach { d ->
        appendLine("${d.name}: ${fmtNum(d.total)} ${unitText(d.unit)}")
        if (d.perEvent.size > 1) d.perEvent.forEach { p -> appendLine("   - ${p.customer}: ${p.qty?.let { fmtNum(it) } ?: "-"}") }
    }
    val buy = r.ingredients.filter { it.toBuy > 0 }
    if (buy.isNotEmpty()) {
        appendLine()
        appendLine(L("కొనాల్సినవి:", "To buy:"))
        buy.forEach { g -> appendLine("${g.name}: ${fmtNum(g.toBuy)} ${unitText(g.unit)}") }
    }
}

/** Round 8: everything cooked on one day — per-dish split per event + combined purchase list, share to WhatsApp. */
@Composable
fun DayPlanScreen(padding: PaddingValues, date: String?) {
    val vm: DayPlanViewModel = viewModel(
        key = "day-plan-${date ?: ""}",
        factory = viewModelFactory { initializer { DayPlanViewModel(date) } },
    )
    OnRefresh { vm.reload() }
    val context = LocalContext.current
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(vm.date), { vm.pickDate(DayKey.of(it)) })
        when (val s = vm.state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> {
                NoticeBox(s.message, Tone.BAD)
                TextButton(onClick = { vm.load() }) { Text(L("మళ్ళీ ప్రయత్నించు", "Try again")) }
            }
            is UiState.Success -> {
                val r = s.data
                if (r.events.isEmpty()) {
                    NoticeBox(L("ఈ రోజు కార్యక్రమాలు లేవు.", "No events on this day."), Tone.INFO)
                    return@Column
                }
                Button(onClick = {
                    val text = dayPlanText(r)
                    val wa = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text); setPackage("com.whatsapp") }
                    try {
                        context.startActivity(wa)
                    } catch (e: Exception) {
                        val any = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
                        context.startActivity(Intent.createChooser(any, L("పంపు", "Share")))
                    }
                }) { Text(L("WhatsApp లో పంపు", "Share on WhatsApp")) }
                Text(L("కార్యక్రమాలు (${r.events.size})", "Events (${r.events.size})"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                r.events.forEach { e ->
                    Text(
                        "• " + (if (e.kind == "lunchBox") L("లంచ్ బాక్స్: ", "Lunch box: ") else "") +
                            "${e.label.ifBlank { e.customer }} · ${e.guests} " + L("మంది", "guests") +
                            if (e.serviceStyle.isNotBlank()) " · ${serviceStyleLabel(e.serviceStyle)}" else "",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    PartExtras(e)
                }
                Text(L("వంటకాలు (మొత్తం + కార్యక్రమం వారీగా)", "Dishes (total + per event)"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
                r.dishes.forEach { d ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(SuseelaTheme.colors.info).padding(12.dp)) {
                        Row {
                            Text(d.name, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                            Text("${fmtNum(d.total)} ${unitText(d.unit)}", fontWeight = FontWeight.SemiBold)
                        }
                        d.perEvent.forEach { p ->
                            Text("   ${p.customer}: ${p.qty?.let { fmtNum(it) + " " + unitText(d.unit) } ?: L("లెక్క లేదు", "no number")}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                // Why-lines per event / dish (same cards as the event plan).
                val groceries by vm.groceries.collectAsStateWithLifecycle()
                Text(L("ఎందుకు ఈ లెక్క", "Why these numbers"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
                r.events.forEach { e ->
                    Text(e.label.ifBlank { e.customer }, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp))
                    e.dishes.forEach { PlanDishCard(it, groceries) }
                }
                IngredientsTable(r.ingredients)
            }
        }
    }
}

/** R10-11: kids count and tagged special meals with the kitchen note (server values). */
@Composable
fun PartExtras(p: com.example.suseelacateringcrm.data.remote.PlanPart) {
    if (p.kidsCount > 0) Text(L("   పిల్లలు: ${p.kidsCount}", "   Kids: ${p.kidsCount}"), style = MaterialTheme.typography.bodySmall)
    p.specialMeals.filter { it.second > 0 }.forEach { (label, count, note) ->
        Text("   ⚠ $label: $count" + if (note.isNotBlank()) " — $note" else "", style = MaterialTheme.typography.bodySmall, color = SuseelaTheme.colors.warning)
    }
}
