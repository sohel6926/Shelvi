package com.example.suseelacateringcrm.ui.recipes

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.model.Dish
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.CookLogLine
import com.example.suseelacateringcrm.data.remote.eventPlan
import com.example.suseelacateringcrm.data.remote.saveCookLogV2
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.SimplePickerField
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtNum
import com.example.suseelacateringcrm.ui.components.numOrNull
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

/** Editable row of the cook log: one dish (variant). */
class CookRow(
    val dishId: String,
    val variantId: String,
    val name: String,
    val unit: String,
    /** groceryItemIds from the plan's ingredient maths / the dish recipe. */
    ingredientIds: List<String>,
) {
    var cooked by mutableStateOf("")
    var leftover by mutableStateOf("")
    val used = androidx.compose.runtime.mutableStateMapOf<String, String>().apply { ingredientIds.forEach { put(it, "") } }
    /** bookingId|sessionId → guests text, for other events that ate from the same batch. */
    val shared = androidx.compose.runtime.mutableStateMapOf<String, String>()
    var open by mutableStateOf(false)
}

class CookLogViewModel(private val bookingId: String) : GroceryNamesViewModel() {
    private val fn = ServiceLocator.functions
    var booking by mutableStateOf<Booking?>(null)
        private set
    var sessionId by mutableStateOf("")
        private set
    var guestsText by mutableStateOf("")
    val rows = mutableStateListOf<CookRow>()
    var loading by mutableStateOf(true)
        private set
    var saveState by mutableStateOf<UiState<String>?>(null)
        private set

    private val _dishes = MutableStateFlow<List<Dish>>(emptyList())
    val dishes: StateFlow<List<Dish>> = _dishes.asStateFlow()
    /** Other bookings on the same day (for "shared with"). */
    private val _sameDay = MutableStateFlow<List<Booking>>(emptyList())
    val sameDay: StateFlow<List<Booking>> = _sameDay.asStateFlow()
    private var all: List<Booking> = emptyList()

    init {
        viewModelScope.launch { ServiceLocator.kitchenRepository.dishesFlow().catchLogged("CookLogVM").collect { _dishes.value = it.sortedBy { d -> d.name.lowercase() } } }
        viewModelScope.launch {
            ServiceLocator.bookingRepository.bookingFlow(bookingId).catchLogged("CookLogVM").collect { b ->
                val first = booking == null
                booking = b
                recomputeSameDay()
                if (first && b != null) {
                    guestsText = (b.guestCountActual.takeIf { it > 0 } ?: b.guestCount).takeIf { it > 0 }?.toString() ?: ""
                    loadRows()
                }
            }
        }
        viewModelScope.launch {
            ServiceLocator.bookingRepository.bookingsFlow(ServiceLocator.branchManager.currentBranchId.value).catchLogged("CookLogVM").collect { list ->
                all = list
                recomputeSameDay()
            }
        }
    }

    private fun recomputeSameDay() {
        val day = booking?.eventDate?.let { DayKey.of(it) }
        _sameDay.value = all.filter { it.id != bookingId && day != null && !it.status.equals("Cancelled", true) && it.eventDate?.let { d -> DayKey.of(d) } == day }
    }

    fun pickSession(id: String) {
        sessionId = id
        val s = booking?.sessions?.find { it.id == id }
        guestsText = ((s?.guestCountActual?.takeIf { it > 0 } ?: s?.guests) ?: booking?.guestCount)?.takeIf { it > 0 }?.toString() ?: ""
        loadRows()
    }

    /** Rows = the dishes of this event's plan (server), so the cook writes only what was on the menu. */
    private fun loadRows() {
        viewModelScope.launch {
            loading = true
            rows.clear()
            fn.eventPlan(bookingId, sessionId).onSuccess { r ->
                r.dishes.filter { sessionId.isBlank() || it.sessionId == sessionId || it.sessionId.isBlank() }
                    .distinctBy { it.dishId + "|" + it.variantId }
                    .forEach { d -> rows += CookRow(d.dishId, d.variantId, d.name, d.unit, d.ingredients.map { it.groceryItemId }) }
            }
            loading = false
        }
    }

    fun addDish(d: Dish) {
        if (rows.any { it.dishId == d.id && it.variantId.isBlank() }) return
        val ids = (d.typedRecipe + d.learnedRecipe).map { it.groceryItemId }.distinct()
        rows += CookRow(d.id, "", d.name, d.unit, ids)
    }

    fun addIngredient(row: CookRow, groceryId: String) {
        if (!row.used.containsKey(groceryId)) row.used[groceryId] = ""
    }

    fun save() {
        val guests = guestsText.toIntOrNull()
        val lines = mutableListOf<CookLogLine>()
        for (r in rows) {
            if (r.cooked.isBlank() && r.leftover.isBlank()) continue
            val c = numOrNull(r.cooked)
            val l = numOrNull(r.leftover) ?: 0.0
            if (c == null || c <= 0 || l < 0 || l > c) {
                saveState = UiState.Error(L("${r.name}: వండింది > 0, మిగిలింది 0 నుంచి వండినంత వరకు", "${r.name}: cooked > 0 and 0 ≤ leftover ≤ cooked"))
                return
            }
            val used = r.used.mapNotNull { (g, t) -> numOrNull(t)?.let { g to it } }
            if (used.any { it.second < 0 }) {
                saveState = UiState.Error(L("${r.name}: పదార్థాలు 0 లేదా ఎక్కువ", "${r.name}: ingredients must be 0 or more"))
                return
            }
            val shared = r.shared.mapNotNull { (k, t) ->
                val g = t.toIntOrNull() ?: return@mapNotNull null
                if (g < 1) null else Triple(k.substringBefore('|'), k.substringAfter('|', ""), g)
            }
            lines += CookLogLine(r.dishId, r.variantId, c, l, used, shared)
        }
        if (lines.isEmpty()) {
            saveState = UiState.Error(L("కనీసం ఒక వంటకం లెక్క రాయండి", "Enter at least one dish"))
            return
        }
        if (guests != null && guests < 1) {
            saveState = UiState.Error(L("అతిథులు కనీసం 1", "Guests must be at least 1"))
            return
        }
        viewModelScope.launch {
            saveState = UiState.Loading
            saveState = fn.saveCookLogV2(bookingId, sessionId, guests, lines).fold(
                onSuccess = { n -> UiState.Success(L("సేవ్ చేశాం ✓ — $n వంటకాల లెక్క నేర్చుకుంది", "Saved ✓ — learned from $n dishes")) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }
}

/**
 * Round 8 cook log after the event: per dish cooked, leftover, ingredients used, and other events that ate
 * from the same batch (with a preview of the split by guests — the server does the real split).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CookLogScreen(padding: PaddingValues, bookingId: String) {
    val vm: CookLogViewModel = viewModel(
        key = "cook-log-$bookingId",
        factory = viewModelFactory { initializer { CookLogViewModel(bookingId) } },
    )
    OnRefresh { }
    val groceries by vm.groceries.collectAsStateWithLifecycle()
    val dishes by vm.dishes.collectAsStateWithLifecycle()
    val sameDay by vm.sameDay.collectAsStateWithLifecycle()
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        val b = vm.booking
        Text(L("వంట లాగ్ — ${b?.customerNameSnapshot ?: ""}", "Cook log — ${b?.customerNameSnapshot ?: ""}"), style = MaterialTheme.typography.titleLarge)
        Text(
            L("ప్రతి వంటకం: ఎంత వండాం, ఎంత మిగిలింది, ఏ సరుకు ఎంత వాడాం. తర్వాతి plan దీని నుంచి నేర్చుకుంటుంది.",
                "Per dish: cooked, left over, and ingredients used. The next plan learns from this."),
            style = MaterialTheme.typography.bodySmall,
        )
        if (b != null && b.sessions.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = vm.sessionId.isBlank(), onClick = { vm.pickSession("") }, label = { Text(L("మొత్తం", "Whole event")) })
                b.sessions.forEach { s -> FilterChip(selected = vm.sessionId == s.id, onClick = { vm.pickSession(s.id) }, label = { Text(s.name) }) }
            }
        }
        OutlinedTextField(
            value = vm.guestsText, onValueChange = { vm.guestsText = it.filter(Char::isDigit) },
            label = { Text(L("నిజంగా వచ్చిన అతిథులు", "Guests who actually came")) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth(),
        )
        if (vm.loading) Text(L("మెనూ లోడ్ అవుతోంది…", "Loading menu…"))
        vm.rows.forEach { r -> CookRowCard(r, vm, groceries, sameDay) }
        SimplePickerField(dishes, null, { it.name }, { vm.addDish(it) }, L("+ ఇంకో వంటకం జోడించు", "+ Add another dish"))
        when (val s = vm.saveState) {
            is UiState.Success -> NoticeBox(s.data, Tone.GOOD)
            is UiState.Error -> NoticeBox(s.message, Tone.BAD)
            else -> {}
        }
        Button(onClick = { vm.save() }, enabled = vm.saveState !is UiState.Loading, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Text(L("వంట లాగ్ సేవ్ చేయి", "Save cook log"))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CookRowCard(
    r: CookRow,
    vm: CookLogViewModel,
    groceries: Map<String, com.example.suseelacateringcrm.data.model.GroceryItem>,
    sameDay: List<Booking>,
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(SuseelaTheme.colors.info).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${r.name} (${unitText(r.unit)})", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            OutlinedTextField(r.cooked, { r.cooked = it }, label = { Text(L("వండింది", "Cooked")) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.width(92.dp))
            OutlinedTextField(r.leftover, { r.leftover = it }, label = { Text(L("మిగిలింది", "Left")) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.width(92.dp))
        }
        TextButton(onClick = { r.open = !r.open }) {
            Text(if (r.open) L("పదార్థాలు / పంచుకున్నవి మూసు", "Hide ingredients / sharing") else L("పదార్థాలు, పంచుకున్న కార్యక్రమాలు", "Ingredients used, shared with"))
        }
        if (r.open) {
            Text(L("వాడిన సరుకులు", "Ingredients used"), style = MaterialTheme.typography.labelMedium)
            r.used.keys.toList().forEach { gid ->
                val g = groceries[gid]
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${g?.name ?: gid} (${g?.let { unitText(it.unit) } ?: ""})", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(r.used[gid] ?: "", { r.used[gid] = it }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.width(110.dp))
                }
            }
            SimplePickerField(groceries.values.sortedBy { it.name.lowercase() }, null, { it.name }, { vm.addIngredient(r, it.id) }, L("+ సరుకు జోడించు", "+ Add ingredient"))
            if (sameDay.isNotEmpty()) {
                Text(L("ఇదే వంట ఇంకే కార్యక్రమాలకు వెళ్ళింది? (అతిథులు)", "Same batch also served (guests)"), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp))
                sameDay.forEach { o ->
                    val key = o.id + "|"
                    val on = r.shared.containsKey(key)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = on, onCheckedChange = { c -> if (c) r.shared[key] = (o.guestCountActual.takeIf { it > 0 } ?: o.guestCount).toString() else r.shared.remove(key) })
                        Text(o.customerNameSnapshot, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        if (on) OutlinedTextField(r.shared[key] ?: "", { r.shared[key] = it.filter(Char::isDigit) }, singleLine = true,
                            label = { Text(L("అతిథులు", "Guests")) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(100.dp))
                    }
                }
                // Preview only: batch split by guests (the server writes the real split to every event).
                val mine = vm.guestsText.toIntOrNull() ?: 0
                val others = r.shared.values.mapNotNull { it.toIntOrNull() }.filter { it > 0 }
                val cooked = numOrNull(r.cooked)
                if (others.isNotEmpty() && cooked != null && mine > 0) {
                    val total = mine + others.sum()
                    Text(
                        L("విభజన (చూపు మాత్రమే): ఈ కార్యక్రమానికి ≈ ${fmtNum(cooked * mine / total)} ${unitText(r.unit)}",
                            "Split preview: this event ≈ ${fmtNum(cooked * mine / total)} ${unitText(r.unit)}"),
                        style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}
