package com.example.suseelacateringcrm.ui.quotebuilder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.MenuPackage
import com.example.suseelacateringcrm.data.remote.QuoteResult
import com.example.suseelacateringcrm.ui.components.AmountRow
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtQty
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuoteBuilderScreen(
    packageId: String?,
    bookingId: String?,
    padding: PaddingValues,
    onSaved: (String) -> Unit,
) {
    val viewModel: QuoteBuilderViewModel = viewModel(
        key = "quote-builder-$packageId-$bookingId",
        factory = viewModelFactory { initializer { QuoteBuilderViewModel(packageId, bookingId) } },
    )
    val customers by viewModel.customers.collectAsStateWithLifecycle()
    val pkg = viewModel.selectedPackage

    com.example.suseelacateringcrm.util.OnRefresh { viewModel.refreshPreview() }

    LaunchedEffect(viewModel.saveState) {
        val s = viewModel.saveState
        if (s is UiState.Success) onSaved(s.data)
    }

    Column(
        Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        ScreenHeader(L("కొటేషన్ తయారీ", "Quote builder"), L("ధరలు server లెక్కిస్తుంది", "Prices are calculated by the server"))

        // Customer
        var customerOpen by remember { mutableStateOf(false) }
        val customer = customers.find { it.id == viewModel.customerId }
        ExposedDropdownMenuBox(expanded = customerOpen, onExpandedChange = { customerOpen = it }) {
            OutlinedTextField(
                value = customer?.let { "${it.name} · ${it.phone}" } ?: "",
                onValueChange = {},
                readOnly = true,
                label = { Text(L("Customer", "Customer")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = customerOpen) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = customerOpen, onDismissRequest = { customerOpen = false }) {
                customers.forEach { c ->
                    DropdownMenuItem(text = { Text("${c.name} · ${c.phone}") }, onClick = {
                        viewModel.customerId = c.id
                        customerOpen = false
                    })
                }
            }
        }

        // Menu package
        var pkgOpen by remember { mutableStateOf(false) }
        ExposedDropdownMenuBox(expanded = pkgOpen, onExpandedChange = { pkgOpen = it }) {
            OutlinedTextField(
                value = pkg?.let { "${it.name} · ${rupees(it.pricePerPlate)}" } ?: "",
                onValueChange = {},
                readOnly = true,
                label = { Text(L("మెనూ", "Menu")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = pkgOpen) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = pkgOpen, onDismissRequest = { pkgOpen = false }) {
                viewModel.packages.forEach { p ->
                    DropdownMenuItem(text = { Text("${p.name} · ${rupees(p.pricePerPlate)}") }, onClick = {
                        viewModel.selectPackage(p.id)
                        pkgOpen = false
                    })
                }
            }
        }

        if (pkg != null) {
            if (pkg.priceReviewDue) {
                NoticeBox(L("ఈ మెనూ ధర 12 నెలలు దాటింది — సమీక్షించండి", "This menu price is over 12 months old — review it"), Tone.WARNING)
            }
            val choiceGroups = pkg.groups.withIndex().filter { it.value.isChoice }
            if (choiceGroups.isNotEmpty()) {
                SectionLabel(L("ప్రతి వరుసలో ఒకటి ఎంచుకోండి", "Pick one in each line"))
                choiceGroups.forEach { (index, group) ->
                    Text("${index + 1}.", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 6.dp))
                    ChoiceChips(
                        options = group.options.indices.toList(),
                        selected = viewModel.selections.getOrNull(index) ?: 0,
                        label = { group.options[it].label },
                        onSelect = { viewModel.choose(index, it) },
                    )
                }
            }

            SectionLabel(L("ప్లేట్లు, సేవ", "Plates and service"))
            AppTextField(viewModel.platesText, { viewModel.platesText = it.filter(Char::isDigit) }, L("ప్లేట్లు (అతిథులు)", "Plates (guests)"), keyboardType = KeyboardType.Number)
            AppTextField(viewModel.servingBoysText, { viewModel.servingBoysText = it.filter(Char::isDigit) }, L("Serving boys (మొత్తం)", "Serving boys (total)"), keyboardType = KeyboardType.Number)
            if (pkg.servingBoy.freeRule == "per50") {
                Text(
                    L("ప్రతి 50 ప్లేట్లకు 1 serving boy ఉచితం; అదనపు వారికి ${rupees(pkg.servingBoy.chargePerPerson)}",
                        "1 serving boy free per 50 plates; extra boys ${rupees(pkg.servingBoy.chargePerPerson)} each"),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (pkg.transportCharged) {
                AppTextField(viewModel.transportText, { viewModel.transportText = it }, L("రవాణా (₹)", "Transport (₹)"), keyboardType = KeyboardType.Decimal)
            } else {
                Text(L("రవాణా ఈ మెనూ ధరలోనే ఉంది", "Transport is included in this menu's price"), style = MaterialTheme.typography.bodySmall)
            }

            if (pkg.replacements.isNotEmpty()) {
                SectionLabel(L("మార్పులు", "Replacements"))
                pkg.replacements.forEach { r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = r.key in viewModel.chosenReplacements, onCheckedChange = { viewModel.toggleReplacement(r.key) })
                        Text(
                            L(r.te, r.en) + "  " + if (r.extraPerPlate == 0.0) L("(ఉచితం)", "(free)") else L("(+${rupees(r.extraPerPlate)} / ప్లేట్)", "(+${rupees(r.extraPerPlate)} / plate)"),
                        )
                    }
                }
            }

            if (pkg.extras.isNotEmpty()) {
                SectionLabel(L("అదనపు వస్తువులు", "Extras"))
                pkg.extras.forEach { e ->
                    val input = viewModel.extras[e.key]
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = input != null, onCheckedChange = { viewModel.toggleExtra(e.key) })
                        Text(L(e.te, e.en) + "  " + (e.price?.let { rupees(it) } ?: L("(ధర అడగాలి)", "(ask price)")), modifier = Modifier.weight(1f))
                    }
                    if (input != null) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(start = 48.dp)) {
                            OutlinedTextField(
                                value = input.qtyText,
                                onValueChange = { v -> viewModel.setExtra(e.key, input.copy(qtyText = v.filter(Char::isDigit))) },
                                label = { Text(L("సంఖ్య", "Qty")) },
                                singleLine = true,
                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.width(110.dp),
                            )
                            if (e.price == null) {
                                OutlinedTextField(
                                    value = input.priceText,
                                    onValueChange = { v -> viewModel.setExtra(e.key, input.copy(priceText = v)) },
                                    label = { Text(L("ఒక్కదాని ధర ₹", "Price each ₹")) },
                                    singleLine = true,
                                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    modifier = Modifier.width(150.dp),
                                )
                            }
                        }
                    }
                }
            }

            // R10-11 kids plates (package kids price, on top of the plates) and special meals (inside the plates).
            SectionLabel(L("పిల్లలు & ప్రత్యేక భోజనాలు", "Kids & special meals"))
            Text(
                L("పిల్లల ప్లేట్లు ప్లేట్లకి అదనంగా (మెనూ పిల్లల ధర). ప్రత్యేక భోజనాలు ప్లేట్లలోనే లెక్క (వంటగదికి గుర్తు).",
                    "Kids plates are on top of the plates (menu kids price). Special meals are counted inside the plates (a note for the kitchen)."),
                style = MaterialTheme.typography.bodySmall,
            )
            com.example.suseelacateringcrm.ui.bookings.KidsAndSpecialMealsEditor(viewModel.kidsCount, viewModel.specialMeals) { k, m ->
                viewModel.setKidsAndSpecials(k, m)
            }
            if (viewModel.canPriceSpecials && viewModel.specialMeals.isNotEmpty()) {
                Text(L("ప్రత్యేక ప్లేటుకి అదనపు ధర (ఖాళీ = ప్లేట్ ధరలోనే)", "Extra per special plate (empty = included)"), style = MaterialTheme.typography.labelLarge)
                viewModel.specialMeals.forEachIndexed { i, m ->
                    OutlinedTextField(
                        value = viewModel.specialExtraTexts.getOrNull(i) ?: "",
                        onValueChange = { v -> viewModel.setSpecialExtra(i, v) },
                        label = { Text("${i + 1}. ${com.example.suseelacateringcrm.data.model.SpecialMeal.typeLabel(m.type)} ₹") },
                        singleLine = true,
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    )
                }
            }

            SectionLabel(L("తగ్గింపు, గడువు", "Discount and validity"))
            AppTextField(viewModel.discountText, { viewModel.discountText = it }, L("తగ్గింపు (₹, ఐచ్ఛికం)", "Discount (₹, optional)"), keyboardType = KeyboardType.Decimal)
            AppTextField(viewModel.validDaysText, { viewModel.validDaysText = it.filter(Char::isDigit).take(2) }, L("ఎన్ని రోజులు valid (1–90)", "Valid for days (1–90)"), keyboardType = KeyboardType.Number)
            AppTextField(viewModel.notes, { viewModel.notes = it }, L("గమనికలు", "Notes"), singleLine = false)

            viewModel.inputProblem?.let { NoticeBox(it, Tone.WARNING) }
            when (val p = viewModel.preview) {
                is UiState.Loading -> Text(L("లెక్కిస్తున్నాం…", "Calculating…"), modifier = Modifier.padding(vertical = 8.dp))
                is UiState.Error -> NoticeBox(p.message, Tone.BAD)
                is UiState.Success -> QuotePreview(p.data, pkg)
                null -> {}
            }
            if (viewModel.canOverride) {
                SectionLabel(
                    if (viewModel.manualMode) L("చేతితో మొత్తం (Settings: మాన్యువల్)", "Manual total (Settings: manual)")
                    else L("చేతితో మొత్తం (ఐచ్ఛికం)", "Manual total (optional)")
                )
                Text(
                    L("ఖాళీగా ఉంచితే server లెక్క (ఆటోమేటిక్). పెడితే 'మాన్యువల్' అని అందరికీ కనిపిస్తుంది.",
                        "Leave empty for the server's total (automatic). If filled, everyone sees it marked 'Manual'."),
                    style = MaterialTheme.typography.bodySmall,
                )
                AppTextField(viewModel.manualTotalText, { viewModel.manualTotalText = it }, L("మొత్తం (₹)", "Total (₹)"), keyboardType = KeyboardType.Decimal)
                if (viewModel.manualTotalText.isNotBlank()) {
                    AppTextField(viewModel.manualReason, { viewModel.manualReason = it }, L("కారణం (తప్పనిసరి)", "Reason (required)"))
                }
            }
        }

        val save = viewModel.saveState
        if (save is UiState.Error) NoticeBox(save.message, Tone.BAD)
        Button(
            onClick = { viewModel.save() },
            enabled = save !is UiState.Loading && pkg != null,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) {
            Text(if (save is UiState.Loading) L("సేవ్ చేస్తున్నాం…", "Saving…") else L("కొటేషన్ సేవ్ చేయి", "Save quotation"))
        }
    }
}

/** Human label for a server line name: plates, replacement:<key>, extra:<key>, servingBoys, transport. */
fun quoteLineLabel(item: String, pkg: MenuPackage?): String = when {
    item == "plates" -> L("ప్లేట్లు", "Plates")
    item == "servingBoys" -> L("Serving boys", "Serving boys")
    item == "transport" -> L("రవాణా", "Transport")
    item == "kids" -> L("పిల్లల ప్లేట్లు", "Kids plates")
    item.startsWith("special:") -> L("ప్రత్యేక భోజనం", "Special meal") + ": " +
        com.example.suseelacateringcrm.data.model.SpecialMeal.typeLabel(item.removePrefix("special:"))
    item.startsWith("replacement:") -> {
        val key = item.removePrefix("replacement:")
        pkg?.replacements?.find { it.key == key }?.let { L(it.te, it.en) } ?: key
    }
    item.startsWith("extra:") -> {
        val key = item.removePrefix("extra:")
        pkg?.extras?.find { it.key == key }?.let { L(it.te, it.en) } ?: key
    }
    else -> item
}

@Composable
private fun QuotePreview(q: QuoteResult, pkg: MenuPackage) {
    Column(
        Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.good).padding(16.dp),
    ) {
        Text(L("ధర (server లెక్క)", "Price (server calculation)"), style = MaterialTheme.typography.titleMedium)
        if (q.belowMinimum) {
            NoticeBox(L("కనీస order ${pkg.minOrder} ప్లేట్లు — ఇది తక్కువ", "Below the minimum order of ${pkg.minOrder} plates"), Tone.WARNING)
        }
        if (q.priceReviewDue) {
            NoticeBox(L("మెనూ ధర సమీక్ష సమయం వచ్చింది", "Menu price review is due"), Tone.WARNING)
        }
        q.lines.forEach { line ->
            AmountRow("${quoteLineLabel(line.item, pkg)}  ${fmtQty(line.qty)} × ${rupees(line.rate)}", rupees(line.amount))
        }
        HorizontalDivider(Modifier.padding(vertical = 6.dp))
        AmountRow(L("మొత్తం (subtotal)", "Subtotal"), rupees(q.subtotal))
        if (q.subtotal - q.taxable > 0.004) AmountRow(L("తగ్గింపు", "Discount"), "-" + rupees(q.subtotal - q.taxable))
        if (q.tax > 0) {
            if (q.igst > 0) AmountRow("IGST", rupees(q.igst))
            else {
                AmountRow("CGST", rupees(q.cgst))
                AmountRow("SGST", rupees(q.sgst))
            }
        }
        AmountRow(L("చెల్లించాల్సింది", "Total"), rupees(q.total), bold = true)
        HorizontalDivider(Modifier.padding(vertical = 6.dp))
        if (q.freePlates > 0) Text(L("ఉచిత ప్లేట్లు: ${q.freePlates}", "Free plates: ${q.freePlates}"))
        Text(L("వంట చేయాల్సింది: ${q.platesToCook} మందికి", "Cook for: ${q.platesToCook}"), style = MaterialTheme.typography.titleSmall)
        if (q.freeServingBoys > 0) {
            Text(L("ఉచిత serving boys: ${q.freeServingBoys} · charge: ${q.chargedServingBoys}", "Free serving boys: ${q.freeServingBoys} · charged: ${q.chargedServingBoys}"))
        }
    }
}
