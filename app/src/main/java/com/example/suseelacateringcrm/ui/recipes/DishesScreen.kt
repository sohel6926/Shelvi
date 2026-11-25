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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.Dish
import com.example.suseelacateringcrm.data.model.GroceryItem
import com.example.suseelacateringcrm.data.model.TypedRecipeLine
import com.example.suseelacateringcrm.data.model.StartRule
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.learnBadge
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.SimplePickerField
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtNum
import com.example.suseelacateringcrm.ui.components.numOrNull
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.launchSafe
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DishesViewModel : GroceryNamesViewModel() {
    val canEdit: Boolean get() = ServiceLocator.currentRole().let { it == UserRole.ADMIN || it == UserRole.MANAGER }
    var search by mutableStateOf("")
    var message by mutableStateOf<Pair<String, Boolean>?>(null)
    private val _dishes = MutableStateFlow<List<Dish>>(emptyList())
    val dishes: StateFlow<List<Dish>> = _dishes.asStateFlow()

    init {
        viewModelScope.launch {
            ServiceLocator.kitchenRepository.dishesFlow().catchLogged("DishesVM").collect { list ->
                _dishes.value = list.sortedWith(compareBy({ it.category }, { it.name.lowercase() }))
            }
        }
    }

    fun saveRecipe(d: Dish, role: String, basePer100: Double, typed: List<TypedRecipeLine>, rules: List<StartRule>) = launchSafe("DishesVM") {
        ServiceLocator.kitchenRepository.updateDishRecipe(d.id, role, basePer100, typed, rules)
        message = L("సేవ్ చేశాం ✓", "Saved ✓") to false
    }
}

/** Variant text like "పుల్కా – 2 / 3". */
private fun variantsText(d: Dish): String {
    val pieces = d.variants.mapNotNull { it.piecesPerPlate }.map { fmtNum(it) }
    return if (pieces.isNotEmpty()) "${d.name} – ${pieces.joinToString("/")}" else d.variants.joinToString(", ") { it.name }
}

/** Round 8: dish list with category, variants and learning badges; owner / manager edit the typed starting recipe. */
@Composable
fun DishesScreen(padding: PaddingValues) {
    val vm: DishesViewModel = viewModel()
    val dishes by vm.dishes.collectAsStateWithLifecycle()
    val groceries by vm.groceries.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Dish?>(null) }
    Column(Modifier.padding(padding).fillMaxSize()) {
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD, Modifier.padding(horizontal = 16.dp)) }
        AppTextField(vm.search, { vm.search = it }, L("వెతుకు", "Search"), Modifier.padding(horizontal = 16.dp))
        val shown = dishes.filter { vm.search.isBlank() || it.nameTe.contains(vm.search, true) || it.nameEn.contains(vm.search, true) }
        if (shown.isEmpty()) EmptyState(L("వంటకాలు లేవు.", "No dishes."))
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            items(shown, key = { it.id }) { d ->
                val events = d.learned?.eventsUsed ?: 0
                val status = d.learned?.status ?: ""
                val color = when {
                    status == "learned" || events >= 5 -> SuseelaTheme.colors.good
                    events > 0 -> SuseelaTheme.colors.warning
                    else -> SuseelaTheme.colors.info
                }
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(color).padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(d.name + if (d.isSubRecipe) L(" (బేస్)", " (base)") else "", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                        Text(learnBadge(status, events), color = color, style = MaterialTheme.typography.labelMedium)
                    }
                    Text(
                        listOf(d.category, Dish.roleLabel(d.role), unitText(d.unit)).filter { it.isNotBlank() }.joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    if (d.variants.isNotEmpty()) Text(variantsText(d), style = MaterialTheme.typography.bodySmall)
                    d.learned?.takeIf { it.per100 > 0 }?.let {
                        Text(L("నేర్చుకున్న లెక్క: 100 మందికి ${fmtNum(it.per100)} ${unitText(d.unit)}", "Learned: ${fmtNum(it.per100)} ${unitText(d.unit)} per 100"), style = MaterialTheme.typography.bodySmall)
                    }
                    if (d.basePer100 > 0) Text(L("మొదటి లెక్క: 100 మందికి ${fmtNum(d.basePer100)}", "Starting: ${fmtNum(d.basePer100)} per 100"), style = MaterialTheme.typography.bodySmall)
                    val recipe = d.learnedRecipe.ifEmpty { d.typedRecipe }
                    if (recipe.isNotEmpty()) {
                        Text(
                            (if (d.learnedRecipe.isNotEmpty()) L("నేర్చుకున్న రెసిపీ (1 ${unitText(d.unit)}కి): ", "Learned recipe (per 1 ${unitText(d.unit)}): ")
                            else L("మీరు రాసిన రెసిపీ (1 ${unitText(d.unit)}కి): ", "Typed recipe (per 1 ${unitText(d.unit)}): ")) +
                                recipe.joinToString(", ") { "${groceries[it.groceryItemId]?.name ?: it.groceryItemId} ${fmtNum(it.perUnit)}" },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (d.startRules.isNotEmpty()) {
                        Text(L("మొదటి నియమాలు", "Starting rules"), style = MaterialTheme.typography.labelMedium)
                        d.startRules.forEach { r -> Text("• " + ruleText(r, d.unit), style = MaterialTheme.typography.bodySmall) }
                    }
                    if (vm.canEdit) TextButton(onClick = { editing = d }) { Text(L("రెసిపీ మార్చు", "Edit recipe")) }
                }
            }
        }
    }
    editing?.let { d ->
        RecipeDialog(d, groceries, onDismiss = { editing = null }) { role, base, typed, rules -> vm.saveRecipe(d, role, base, typed, rules); editing = null }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecipeDialog(
    d: Dish,
    groceries: Map<String, GroceryItem>,
    onDismiss: () -> Unit,
    onSave: (String, Double, List<TypedRecipeLine>, List<StartRule>) -> Unit,
) {
    val rules = remember { mutableStateListOf<StartRule>().apply { addAll(d.startRules) } }
    var editingRule by remember { mutableStateOf<Int?>(null) }
    var role by remember { mutableStateOf(d.role) }
    var base by remember { mutableStateOf(if (d.basePer100 > 0) fmtNum(d.basePer100) else "") }
    val lines = remember { mutableStateListOf<Pair<String, String>>().apply { addAll(d.typedRecipe.map { it.groceryItemId to fmtNum(it.perUnit) }) } }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("రెసిపీ: ${d.name}", "Recipe: ${d.name}")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(L("రకం", "Role"), style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Dish.ROLES.forEach { r -> FilterChip(selected = role == r, onClick = { role = r }, label = { Text(Dish.roleLabel(r)) }) }
                }
                OutlinedTextField(
                    base, { base = it }, label = { Text(L("100 మందికి మొదటి లెక్క (${unitText(d.unit)})", "Starting per 100 guests (${unitText(d.unit)})")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    L("1 ${unitText(d.unit)} ${d.name} కి ఏ సరుకు ఎంత (కార్యక్రమాల తర్వాత app నేర్చుకుంటుంది)",
                        "Grocery per 1 ${unitText(d.unit)} of ${d.name} (the app learns after events)"),
                    style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp),
                )
                lines.forEachIndexed { i, (gid, qty) ->
                    val g = groceries[gid]
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${g?.name ?: gid} (${g?.let { unitText(it.unit) } ?: ""})", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        OutlinedTextField(qty, { lines[i] = gid to it }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.width(96.dp))
                        TextButton(onClick = { lines.removeAt(i) }) { Text("✕") }
                    }
                }
                SimplePickerField(groceries.values.sortedBy { it.name.lowercase() }.filter { g -> lines.none { it.first == g.id } }, null, { it.name },
                    { lines += it.id to "" }, L("+ సరుకు జోడించు", "+ Add grocery"))
                // Starting rules (§13.5): used until real events replace them.
                Text(L("మొదటి నియమాలు (అనుభవం నుంచి)", "Starting rules (from experience)"), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
                rules.forEachIndexed { i, r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(ruleText(r, d.unit), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { editingRule = i }) { Text(L("మార్చు", "Edit")) }
                        TextButton(onClick = { rules.removeAt(i) }) { Text("✕") }
                    }
                }
                TextButton(onClick = { editingRule = -1 }) { Text(L("+ నియమం జోడించు", "+ Add rule")) }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val b = numOrNull(base) ?: 0.0
                val typed = lines.mapNotNull { (g, t) -> numOrNull(t)?.let { TypedRecipeLine(g, it) } }
                error = when {
                    b < 0 -> L("లెక్క 0 లేదా ఎక్కువ", "Must be 0 or more")
                    typed.any { it.perUnit < 0 } -> L("సరుకు లెక్క 0 లేదా ఎక్కువ", "Grocery amounts must be 0 or more")
                    else -> null
                }
                if (error == null) onSave(role, b, typed, rules.toList())
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
    editingRule?.let { i ->
        StartRuleDialog(
            initial = rules.getOrNull(i) ?: StartRule(),
            unit = d.unit,
            onDismiss = { editingRule = null },
            onSave = { r -> if (i in rules.indices) rules[i] = r else rules.add(r); editingRule = null },
        )
    }
}

/** "బఫే · రొట్టెలు + బిర్యానీ · పెద్దది: 100 మందికి 14 kg" / "… : −10%". */
private fun ruleText(r: StartRule, unit: String): String {
    val where = listOfNotNull(
        r.style.takeIf { it.isNotBlank() }?.let { com.example.suseelacateringcrm.ui.bookings.serviceStyleLabel(it) },
        r.comboKey.takeIf { it.isNotBlank() }?.let { Dish.comboLabel(it) },
        r.band.takeIf { it.isNotBlank() }?.let { Dish.bandLabel(it) },
    ).ifEmpty { listOf(L("అన్నిటికీ", "Always")) }.joinToString(" · ")
    val value = r.per100?.let { L("100 మందికి ${fmtNum(it)} ${unitText(unit)}", "${fmtNum(it)} ${unitText(unit)} per 100") }
        ?: r.factorPct?.let { (if (it >= 0) "+" else "") + fmtNum(it) + "%" } ?: ""
    return "$where: $value"
}

/** One starting rule: style (banthi / buffet / any), combination of main roles (or any), size band (or any), per 100 OR ±%. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StartRuleDialog(initial: StartRule, unit: String, onDismiss: () -> Unit, onSave: (StartRule) -> Unit) {
    var style by remember { mutableStateOf(initial.style) }
    val roles = remember {
        mutableStateListOf<String>().apply { addAll(initial.comboKey.split('+').map { it.substringBefore('×') }.filter { it in Dish.MAIN_ROLES }) }
    }
    var band by remember { mutableStateOf(initial.band) }
    var usePct by remember { mutableStateOf(initial.per100 == null && initial.factorPct != null) }
    var valueText by remember { mutableStateOf((initial.per100 ?: initial.factorPct)?.let { fmtNum(it) } ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("మొదటి నియమం", "Starting rule")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(L("వడ్డన విధానం", "Service style"), style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("", "banthi", "buffet").forEach { s ->
                        FilterChip(selected = style == s, onClick = { style = s }, label = {
                            Text(if (s.isBlank()) L("ఏదైనా", "Any") else com.example.suseelacateringcrm.ui.bookings.serviceStyleLabel(s))
                        })
                    }
                }
                Text(L("మెనూలో ఏమేం ఉన్నప్పుడు (ఏదీ ఎంచుకోకపోతే = ఏదైనా)", "Menu combination (none = any)"), style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Dish.MAIN_ROLES.forEach { r ->
                        FilterChip(selected = r in roles, onClick = { if (r in roles) roles.remove(r) else roles.add(r) }, label = { Text(Dish.roleLabel(r)) })
                    }
                }
                Text(L("కార్యక్రమం సైజు", "Event size"), style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (listOf("") + Dish.BANDS).forEach { b -> FilterChip(selected = band == b, onClick = { band = b }, label = { Text(Dish.bandLabel(b)) }) }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = !usePct, onClick = { usePct = false }, label = { Text(L("100 మందికి ఎంత", "Per 100 guests")) })
                    FilterChip(selected = usePct, onClick = { usePct = true }, label = { Text(L("± శాతం", "± percent")) })
                }
                OutlinedTextField(
                    valueText, { valueText = it },
                    label = { Text(if (usePct) L("శాతం (ఉదా: -10 లేదా 15)", "Percent (e.g. -10 or 15)") else L("100 మందికి (${unitText(unit)})", "Per 100 guests (${unitText(unit)})")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text), modifier = Modifier.fillMaxWidth(),
                )
                if (usePct) Text(
                    L("± శాతం పని చేయాలంటే విధానం / కలయిక / సైజు లో ఒక్కటే ఎంచుకోండి.", "± percent works only with exactly one of style / combination / size."),
                    style = MaterialTheme.typography.bodySmall,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val v = numOrNull(valueText)
                val combo = roles.distinct().sorted().joinToString("+")
                val rule = StartRule(style, combo, band, if (usePct) null else v, if (usePct) v else null)
                error = when {
                    v == null -> L("సంఖ్య రాయండి", "Enter a number")
                    !usePct && v <= 0 -> L("100 మందికి లెక్క 0 కంటే ఎక్కువ", "Per 100 must be more than 0")
                    usePct && (v < -50 || v > 50) -> L("శాతం −50 నుంచి +50 మధ్య", "Percent must be between −50 and +50")
                    usePct && rule.dimensions != 1 -> L("± శాతానికి ఒక్కటే (విధానం / కలయిక / సైజు) ఎంచుకోండి", "For ± percent choose exactly one of style / combination / size")
                    else -> null
                }
                if (error == null) onSave(rule)
            }) { Text(L("సరే", "OK")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
