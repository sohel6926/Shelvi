package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.model.BookingSession
import com.example.suseelacateringcrm.data.model.MenuPackage
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L

/** Common meal sessions of a wedding (owner's words). te to en. */
val SESSION_PRESETS: List<Triple<String, String, String>> = listOf(
    Triple("మెహందీ డిన్నర్", "Mehendi dinner", "dinner"),
    Triple("హల్దీ లంచ్", "Haldi lunch", "lunch"),
    Triple("పెళ్ళి టిఫిన్", "Wedding tiffin", "tiffin"),
    Triple("పెళ్ళి భోజనం", "Wedding lunch", "lunch"),
    Triple("రిసెప్షన్ డిన్నర్", "Reception dinner", "dinner"),
    Triple("వ్రతం భోజనం", "Vratham lunch", "lunch"),
)

/** Round 8 service style: బంతి భోజనం (sit-down leaf) / బఫే / ఇతర. */
val SERVICE_STYLES = listOf("banthi", "buffet", "other")

fun serviceStyleLabel(s: String): String = when (s) {
    "banthi" -> L("బంతి భోజనం", "Banthi (sit-down)")
    "buffet" -> L("బఫే", "Buffet")
    "other" -> L("ఇతర", "Other")
    else -> L("ఎంచుకోలేదు", "Not chosen")
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ServiceStylePicker(selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(L("వడ్డన విధానం", "Service style"), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SERVICE_STYLES.forEach { s -> FilterChip(selected = selected == s, onClick = { onSelect(s) }, label = { Text(serviceStyleLabel(s)) }) }
        }
    }
}

fun sessionMealLabel(type: String): String = when (type) {
    "tiffin" -> L("టిఫిన్", "Tiffin")
    "lunch" -> L("లంచ్", "Lunch")
    "dinner" -> L("డిన్నర్", "Dinner")
    "lunch-dinner" -> L("లంచ్ / డిన్నర్", "Lunch / Dinner")
    else -> L("ఇతర", "Other")
}

/**
 * R7-5: meal sessions inside one booking (మెహందీ డిన్నర్, పెళ్ళి టిఫిన్ …). Each has date, time, meal,
 * package and guests. When there are sessions, guests = Σ sessions and event date = earliest session.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionsEditorSection(
    sessions: List<BookingSession>,
    packages: List<MenuPackage>,
    defaultServiceStyle: String = "",
    onSave: (BookingSession) -> Unit,
    onRemove: (String) -> Unit,
) {
    var editing by remember { mutableStateOf<BookingSession?>(null) }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Text(L("భోజనాలు (సెషన్లు)", "Meal sessions"), style = MaterialTheme.typography.titleSmall)
        Text(
            L(
                "ఒకే కార్యక్రమంలో చాలా భోజనాలు ఉంటే ఇక్కడ వేయండి. ఉంటే అతిథులు = అన్నిటి మొత్తం, తేదీ = మొదటి భోజనం తేదీ.",
                "Add when one event has several meals. Guests = total of all, date = first meal's date.",
            ),
            style = MaterialTheme.typography.bodySmall,
        )
        sessions.sortedWith(compareBy({ it.date }, { it.serveTime })).forEach { s ->
            Card(onClick = { editing = s }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(s.name.ifBlank { L("భోజనం", "Meal") }, style = MaterialTheme.typography.titleSmall)
                        val pkg = packages.find { it.id == s.packageId }
                        Text(
                            listOf(DayKey.display(s.date), s.serveTime, sessionMealLabel(s.mealType),
                                if (s.serviceStyle.isNotBlank()) serviceStyleLabel(s.serviceStyle) else "",
                                L("${s.guests} మంది", "${s.guests} guests"), pkg?.name ?: "")
                                .filter { it.isNotBlank() }.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    TextButton(onClick = { onRemove(s.id) }) { Text(L("తీసేయి", "Remove")) }
                }
            }
        }
        OutlinedButton(onClick = { editing = BookingSession(serviceStyle = defaultServiceStyle) }, modifier = Modifier.padding(top = 4.dp)) {
            Text(L("+ భోజనం జోడించు", "+ Add meal session"))
        }
    }
    editing?.let { s ->
        SessionDialog(
            initial = s,
            packages = packages,
            onSave = { onSave(it); editing = null },
            onDismiss = { editing = null },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun SessionDialog(
    initial: BookingSession,
    packages: List<MenuPackage>,
    onSave: (BookingSession) -> Unit,
    onDismiss: () -> Unit,
) {
    var nameTe by remember { mutableStateOf(initial.nameTe) }
    var nameEn by remember { mutableStateOf(initial.nameEn) }
    var date by remember { mutableStateOf(initial.date) }
    var serveTime by remember { mutableStateOf(initial.serveTime.ifBlank { "12:00" }) }
    var mealType by remember { mutableStateOf(initial.mealType) }
    var packageId by remember { mutableStateOf(initial.packageId) }
    var guestsText by remember { mutableStateOf(if (initial.guests > 0) initial.guests.toString() else "") }
    var travelText by remember { mutableStateOf(initial.travelMinutes.toString()) }
    var style by remember { mutableStateOf(initial.serviceStyle) }
    var kids by remember { mutableStateOf(initial.kidsCount) }
    var meals by remember { mutableStateOf(initial.specialMeals) }
    var showTime by remember { mutableStateOf(false) }
    var pkgOpen by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id.isBlank()) L("భోజనం జోడించు", "Add meal session") else L("భోజనం మార్చు", "Edit meal session")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    SESSION_PRESETS.forEach { (te, en, meal) ->
                        FilterChip(
                            selected = nameTe == te,
                            onClick = {
                                nameTe = te; nameEn = en; mealType = meal
                                serveTime = when (meal) { "tiffin" -> "08:00"; "dinner" -> "19:30"; else -> "12:30" }
                            },
                            label = { Text(L(te, en)) },
                        )
                    }
                }
                AppTextField(value = nameTe, onValueChange = { nameTe = it }, label = L("పేరు (తెలుగు)", "Name (Telugu)"))
                AppTextField(value = nameEn, onValueChange = { nameEn = it }, label = L("పేరు (English)", "Name (English)"))
                AppDatePickerField(
                    label = L("తేదీ", "Date"),
                    date = DayKey.parse(date),
                    onDateSelected = { date = DayKey.of(it) },
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(L("వడ్డించే సమయం: ", "Serving time: ") + serveTime, modifier = Modifier.weight(1f))
                    TextButton(onClick = { showTime = true }) { Text(L("మార్చు", "Change")) }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("tiffin", "lunch", "dinner", "other").forEach { m ->
                        FilterChip(selected = mealType == m, onClick = { mealType = m }, label = { Text(sessionMealLabel(m)) })
                    }
                }
                ExposedDropdownMenuBox(expanded = pkgOpen, onExpandedChange = { pkgOpen = it }) {
                    OutlinedTextField(
                        value = packages.find { it.id == packageId }?.let { "${it.name} · ${CurrencyUtils.formatInr(it.pricePerPlate)}" }
                            ?: L("ప్యాకేజీ లేదు (booking ప్యాకేజీ)", "No package (booking's package)"),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(L("మెనూ ప్యాకేజీ", "Menu package")) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = pkgOpen) },
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                    )
                    ExposedDropdownMenu(expanded = pkgOpen, onDismissRequest = { pkgOpen = false }) {
                        DropdownMenuItem(text = { Text(L("ప్యాకేజీ లేదు", "No package")) }, onClick = { packageId = ""; pkgOpen = false })
                        packages.forEach { p ->
                            DropdownMenuItem(
                                text = { Text("${p.name} · ${CurrencyUtils.formatInr(p.pricePerPlate)}") },
                                onClick = { packageId = p.id; mealType = p.mealType.ifBlank { mealType }; pkgOpen = false },
                            )
                        }
                    }
                }
                ServiceStylePicker(style, { style = it })
                KidsAndSpecialMealsEditor(kids, meals) { k, m -> kids = k; meals = m }
                OutlinedTextField(
                    value = guestsText,
                    onValueChange = { guestsText = it.filter(Char::isDigit).take(5) },
                    label = { Text(L("అతిథులు", "Guests")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                )
                OutlinedTextField(
                    value = travelText,
                    onValueChange = { travelText = it.filter(Char::isDigit).take(3) },
                    label = { Text(L("ప్రయాణం (నిమిషాలు)", "Travel (minutes)")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val guests = guestsText.toIntOrNull() ?: 0
                val travel = travelText.ifBlank { "45" }.toIntOrNull() ?: -1
                error = when {
                    nameTe.isBlank() && nameEn.isBlank() -> L("భోజనం పేరు రాయండి", "Enter the meal name")
                    date.length < 10 -> L("తేదీ ఎంచుకోండి", "Choose the date")
                    guests < 1 -> L("అతిథులు కనీసం 1", "Guests must be at least 1")
                    travel !in 0..300 -> L("ప్రయాణం 0–300 నిమిషాలు", "Travel 0–300 minutes")
                    style.isBlank() -> L("బంతి భోజనం / బఫే ఎంచుకోండి", "Choose banthi / buffet")
                    else -> null
                }
                if (error == null) {
                    onSave(
                        initial.copy(
                            id = initial.id.ifBlank { "s" + System.currentTimeMillis().toString(36) },
                            nameTe = nameTe.trim(), nameEn = nameEn.trim(), date = date, serveTime = serveTime,
                            mealType = mealType, packageId = packageId, guests = guests, travelMinutes = travel,
                            serviceStyle = style,
                            kidsCount = kids,
                            specialMeals = meals.filter { it.count > 0 },
                        ),
                    )
                }
            }) { Text(L("సరే", "OK")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
    if (showTime) {
        ServeTimeDialog(
            initial = serveTime,
            onPicked = { h, m -> serveTime = "%02d:%02d".format(java.util.Locale.US, h, m); showTime = false },
            onDismiss = { showTime = false },
        )
    }
}

/**
 * R10-11: kids plates and special meals (ఉల్లి-వెల్లుల్లి లేకుండా, జైన్, అలర్జీ, షుగర్ …) with count and a kitchen note.
 * Prices come from the server quotation (kids at the package kidsPrice).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun KidsAndSpecialMealsEditor(
    kidsCount: Int,
    meals: List<com.example.suseelacateringcrm.data.model.SpecialMeal>,
    onChange: (Int, List<com.example.suseelacateringcrm.data.model.SpecialMeal>) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        OutlinedTextField(
            value = if (kidsCount > 0) kidsCount.toString() else "",
            onValueChange = { onChange(it.filter(Char::isDigit).take(5).toIntOrNull() ?: 0, meals) },
            label = { Text(L("పిల్లలు (ఎంత మంది)", "Kids (count)")) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
        )
        Text(L("ప్రత్యేక భోజనాలు", "Special meals"), style = MaterialTheme.typography.labelLarge)
        meals.forEachIndexed { i, m ->
            Column(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    com.example.suseelacateringcrm.data.model.SpecialMeal.TYPES.forEach { t ->
                        FilterChip(selected = m.type == t, onClick = { onChange(kidsCount, meals.toMutableList().also { it[i] = m.copy(type = t) }) },
                            label = { Text(com.example.suseelacateringcrm.data.model.SpecialMeal.typeLabel(t)) })
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = if (m.count > 0) m.count.toString() else "",
                        onValueChange = { v -> onChange(kidsCount, meals.toMutableList().also { it[i] = m.copy(count = v.filter(Char::isDigit).take(5).toIntOrNull() ?: 0) }) },
                        label = { Text(L("ఎంత మంది", "Count")) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(0.35f),
                    )
                    OutlinedTextField(
                        value = m.note,
                        onValueChange = { v -> onChange(kidsCount, meals.toMutableList().also { it[i] = m.copy(note = v) }) },
                        label = { Text(L("వంటగదికి గమనిక", "Kitchen note")) },
                        modifier = Modifier.weight(0.65f).padding(start = 6.dp),
                    )
                    TextButton(onClick = { onChange(kidsCount, meals.toMutableList().also { it.removeAt(i) }) }) { Text("✕") }
                }
            }
        }
        TextButton(onClick = { onChange(kidsCount, meals + com.example.suseelacateringcrm.data.model.SpecialMeal()) }) {
            Text(L("+ ప్రత్యేక భోజనం", "+ Special meal"))
        }
    }
}
