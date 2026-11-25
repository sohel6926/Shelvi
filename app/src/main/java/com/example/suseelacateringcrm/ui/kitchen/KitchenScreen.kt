package com.example.suseelacateringcrm.ui.kitchen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.EventType
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CookingPlanItem
import com.example.suseelacateringcrm.data.remote.GroceryNeed
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtQty
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState

private fun unitLabel(unit: String): String = when (unit) {
    "kg" -> L("కిలో", "kg")
    "L" -> L("లీటర్", "L")
    "pcs" -> L("ముక్కలు", "pcs")
    else -> unit
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KitchenScreen(
    padding: PaddingValues,
    viewModel: KitchenViewModel = viewModel(),
) {
    val tabs = listOf(L("వంట లాగ్", "Cook log"), L("వంట గైడ్", "Cooking guide"), L("సరుకుల జాబితా", "Grocery list"))
    com.example.suseelacateringcrm.util.OnRefresh { viewModel.refreshCallables() }
    Column(Modifier.padding(padding).fillMaxSize()) {
        TabRow(selectedTabIndex = viewModel.tab) {
            tabs.forEachIndexed { i, t -> Tab(selected = viewModel.tab == i, onClick = { viewModel.tab = i }, text = { Text(t) }) }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (viewModel.tab) {
                0 -> CookLogTab(viewModel)
                1 -> GuideTab(viewModel)
                else -> GroceryTab(viewModel)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BookingPicker(viewModel: KitchenViewModel, onPicked: (String) -> Unit) {
    val bookings by viewModel.bookings.collectAsStateWithLifecycle()
    var open by remember { mutableStateOf(false) }
    val current = bookings.find { it.id == viewModel.bookingId }
    fun label(b: com.example.suseelacateringcrm.data.model.Booking) =
        "${b.customerNameSnapshot} · ${b.eventDate?.let { DayKey.display(DayKey.of(it)) } ?: "-"} · ${L("${b.guestCount} మంది", "${b.guestCount} guests")}"
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = current?.let { label(it) } ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(L("కార్యక్రమం (booking)", "Event (booking)")) },
            // Staff see only the events assigned to them (BookingRepository staff scope).
            supportingText = if (bookings.isEmpty() && com.example.suseelacateringcrm.di.ServiceLocator.staffScopeId() != null) {
                { Text(L("మీకు కేటాయించిన events లేవు", "No events assigned to you")) }
            } else null,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            bookings.forEach { b ->
                DropdownMenuItem(text = { Text(label(b)) }, onClick = {
                    onPicked(b.id)
                    open = false
                })
            }
        }
    }
}

@Composable
private fun CookLogTab(viewModel: KitchenViewModel) {
    val dishes by viewModel.dishes.collectAsStateWithLifecycle()
    Text(
        L("కార్యక్రమం అయ్యాక: ప్రతి వంటకం ఎంత వండాం, ఎంత మిగిలింది రాయండి. తర్వాతిసారి ఎంత వండాలో app నేర్చుకుంటుంది.",
            "After the event: write how much of each dish was cooked and left over. The app learns how much to cook next time."),
        style = MaterialTheme.typography.bodyMedium,
    )
    BookingPicker(viewModel) { viewModel.selectBooking(it) }
    AppTextField(viewModel.guestsActualText, { viewModel.guestsActualText = it.filter(Char::isDigit) }, L("నిజంగా వచ్చిన అతిథులు", "Guests who actually came"), keyboardType = KeyboardType.Number)
    if (viewModel.role == UserRole.ADMIN) AddItemButton(viewModel, isDish = true)
    if (dishes.isEmpty()) {
        NoticeBox(L("వంటకాల జాబితా ఖాళీగా ఉంది. Owner వంటకాలు జోడించాలి.", "No dishes yet. The owner needs to add dishes."), Tone.INFO)
    }
    dishes.forEach { dish ->
        val input = viewModel.cookInputs[dish.id] ?: CookInput()
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${dish.name} (${unitLabel(dish.unit)})", modifier = Modifier.weight(1f))
            OutlinedTextField(
                value = input.cookedText,
                onValueChange = { viewModel.setCook(dish.id, input.copy(cookedText = it)) },
                label = { Text(L("వండింది", "Cooked")) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.width(96.dp),
            )
            OutlinedTextField(
                value = input.leftoverText,
                onValueChange = { viewModel.setCook(dish.id, input.copy(leftoverText = it)) },
                label = { Text(L("మిగిలింది", "Left")) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.width(96.dp),
            )
        }
    }
    when (val s = viewModel.cookLogState) {
        is UiState.Success -> NoticeBox(s.data, Tone.GOOD)
        is UiState.Error -> NoticeBox(s.message, Tone.BAD)
        else -> {}
    }
    Button(
        onClick = { viewModel.saveCookLog() },
        enabled = viewModel.cookLogState !is UiState.Loading,
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
    ) { Text(L("వంట లాగ్ సేవ్ చేయి", "Save cook log")) }
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun GuestsAndEvent(viewModel: KitchenViewModel, showPackage: Boolean) {
    val bookings by viewModel.bookings.collectAsStateWithLifecycle()
    val packages by viewModel.packages.collectAsStateWithLifecycle()
    if (bookings.isNotEmpty()) {
        BookingPicker(viewModel) { id ->
            viewModel.selectBooking(id)
            bookings.find { it.id == id }?.let { viewModel.fillFromBooking(it) }
        }
        // R7-5: a booking with meal sessions → pick the session (its guests and package).
        val picked = bookings.find { it.id == viewModel.bookingId }
        if (picked != null && picked.sessions.isNotEmpty()) {
            SectionLabel(L("ఏ భోజనం?", "Which meal?"))
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp)) {
                androidx.compose.material3.FilterChip(
                    selected = viewModel.sessionId.isBlank(),
                    onClick = { viewModel.fillFromSession(picked, null) },
                    label = { Text(L("మొత్తం కార్యక్రమం", "Whole event")) },
                )
                picked.sessions.sortedWith(compareBy({ it.date }, { it.serveTime })).forEach { s ->
                    androidx.compose.material3.FilterChip(
                        selected = viewModel.sessionId == s.id,
                        onClick = { viewModel.fillFromSession(picked, s) },
                        label = { Text("${s.name} · ${s.guests}") },
                    )
                }
            }
        }
    }
    AppTextField(viewModel.guestsText, { viewModel.guestsText = it.filter(Char::isDigit) }, L("అతిథులు", "Guests"), keyboardType = KeyboardType.Number)
    SectionLabel(L("కార్యక్రమం రకం", "Event type"))
    ChoiceChips(EventType.entries, viewModel.eventType, { it.label }, { viewModel.eventType = it })
    if (showPackage && packages.isNotEmpty()) {
        var open by remember { mutableStateOf(false) }
        val current = packages.find { it.id == viewModel.planPackageId }
        ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
            OutlinedTextField(
                value = current?.name ?: L("అన్ని వంటకాలు", "All dishes"),
                onValueChange = {},
                readOnly = true,
                label = { Text(L("మెనూ (ఐచ్ఛికం)", "Menu (optional)")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                DropdownMenuItem(text = { Text(L("అన్ని వంటకాలు", "All dishes")) }, onClick = { viewModel.planPackageId = ""; open = false })
                packages.forEach { p ->
                    DropdownMenuItem(text = { Text(p.name) }, onClick = { viewModel.planPackageId = p.id; open = false })
                }
            }
        }
    }
}

@Composable
private fun GuideTab(viewModel: KitchenViewModel) {
    GuestsAndEvent(viewModel, showPackage = true)
    Button(onClick = { viewModel.loadPlan() }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Text(L("ఎంత వండాలో చూపించు", "Show how much to cook"))
    }
    when (val s = viewModel.planState) {
        is UiState.Loading -> LoadingIndicator(Modifier.padding(24.dp))
        is UiState.Error -> NoticeBox(s.message, Tone.BAD)
        is UiState.Success -> {
            if (s.data.isEmpty()) EmptyState(L("వంటకాలు లేవు", "No dishes"), Modifier.padding(24.dp))
            s.data.forEach { item ->
                PlanCard(item, viewModel.canOverride, onOverride = { m -> viewModel.overridePlanItem(item, m) })
            }
        }
        null -> {}
    }
}

@Composable
private fun PlanCard(
    item: CookingPlanItem,
    canOverride: Boolean,
    onOverride: suspend (com.example.suseelacateringcrm.data.remote.ManualOverride) -> String?,
) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(L(item.nameTe.ifBlank { item.nameEn }, item.nameEn.ifBlank { item.nameTe }), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text("${fmtQty(item.quantity)} ${unitLabel(item.unit)}", style = MaterialTheme.typography.titleMedium)
            }
            val pct = kotlin.math.abs(item.changePct).toInt()
            when (item.advice) {
                "cut" -> Pill(L("గతంలో మిగిలింది — $pct% తగ్గించండి", "Leftovers before — cut $pct%"), Tone.WARNING)
                "add" -> Pill(L("గతంలో సరిపోలేదు — $pct% పెంచండి", "Ran short before — add $pct%"), Tone.BAD)
                else -> Pill(L("సరిపోతుంది", "About right"), Tone.GOOD)
            }
            Text(
                L("100 మందికి ${fmtQty(item.learnedPer100)} · ${item.eventsUsed} కార్యక్రమాల నుంచి నేర్చుకుంది",
                    "${fmtQty(item.learnedPer100)} per 100 · learned from ${item.eventsUsed} events"),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp),
            )
            com.example.suseelacateringcrm.ui.components.CalcModeChip(
                info = item.calc,
                currentValue = item.quantity,
                canOverride = canOverride,
                format = { "${fmtQty(it)} ${unitLabel(item.unit)}" },
                valueLabel = L("ఎంత వండాలి", "Quantity to cook"),
                onOverride = onOverride,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun GroceryTab(viewModel: KitchenViewModel) {
    GuestsAndEvent(viewModel, showPackage = false)
    if (viewModel.role == UserRole.ADMIN) AddItemButton(viewModel, isDish = false)
    Button(onClick = { viewModel.loadGroceries() }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Text(L("సరుకుల జాబితా చూపించు", "Show grocery list"))
    }
    when (val s = viewModel.groceryState) {
        is UiState.Loading -> LoadingIndicator(Modifier.padding(24.dp))
        is UiState.Error -> NoticeBox(s.message, Tone.BAD)
        is UiState.Success -> {
            if (s.data.isEmpty()) EmptyState(L("సరుకుల జాబితా ఖాళీ", "No grocery items"), Modifier.padding(24.dp))
            val toBuy = s.data.filter { it.toBuy > 0 }
            if (toBuy.isNotEmpty()) SectionLabel(L("కొనాల్సినవి (${toBuy.size})", "To buy (${toBuy.size})"))
            toBuy.forEach { GroceryRow(it) }
            val inStock = s.data.filter { it.toBuy <= 0 }
            if (inStock.isNotEmpty()) SectionLabel(L("stock లో ఉన్నాయి", "Already in stock"))
            inStock.forEach { GroceryRow(it) }
        }
        null -> {}
    }
}

@Composable
private fun GroceryRow(g: GroceryNeed) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(L(g.nameTe.ifBlank { g.nameEn }, g.nameEn.ifBlank { g.nameTe }), style = MaterialTheme.typography.bodyLarge)
            Text(
                L("కావాలి ${fmtQty(g.quantity)} · ఉన్నది ${fmtQty(g.inStock)}", "Need ${fmtQty(g.quantity)} · in stock ${fmtQty(g.inStock)}") + " ${unitLabel(g.unit)}",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (g.toBuy > 0) Pill(L("కొనాలి ", "Buy ") + "${fmtQty(g.toBuy)} ${unitLabel(g.unit)}", Tone.WARNING)
        else Pill(L("ఉంది", "In stock"), Tone.GOOD)
    }
}

/** Admin: add a dish (cook log / guide) or a grocery item with its quantity per 100 guests. */
@Composable
private fun AddItemButton(viewModel: KitchenViewModel, isDish: Boolean) {
    var show by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { viewModel.clearAddState(); show = true }, modifier = Modifier.padding(vertical = 4.dp)) {
        Text(if (isDish) L("+ వంటకం జోడించు", "+ Add dish") else L("+ సరుకు జోడించు", "+ Add grocery item"))
    }
    if (!show) return
    var te by remember { mutableStateOf("") }
    var en by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf("kg") }
    var per100 by remember { mutableStateOf("") }
    LaunchedEffect(viewModel.addState) {
        if (viewModel.addState is UiState.Success) show = false
    }
    AlertDialog(
        onDismissRequest = { show = false },
        title = { Text(if (isDish) L("కొత్త వంటకం", "New dish") else L("కొత్త సరుకు", "New grocery item")) },
        text = {
            Column {
                AppTextField(te, { te = it }, L("పేరు (తెలుగు)", "Name (Telugu)"))
                AppTextField(en, { en = it }, L("పేరు (English)", "Name (English)"))
                ChoiceChips(listOf("kg", "L", "pcs"), unit, { unitLabel(it) }, { unit = it })
                AppTextField(per100, { per100 = it }, L("100 మందికి ఎంత", "Quantity per 100 guests"), keyboardType = KeyboardType.Decimal)
                (viewModel.addState as? UiState.Error)?.let { Text(it.message, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (isDish) viewModel.addDish(te, en, unit, per100) else viewModel.addGrocery(te, en, unit, per100)
            }) { Text(L("సేవ్", "Save")) }
        },
        dismissButton = { TextButton(onClick = { show = false }) { Text(L("వద్దు", "Cancel")) } },
    )
}
