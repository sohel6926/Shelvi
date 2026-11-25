package com.example.suseelacateringcrm.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.BusinessSettings
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.model.isAdmin
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AmountRow
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.util.AppLanguage
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.data.model.CalcArea
import com.example.suseelacateringcrm.data.model.MonthlyPayRules
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Switch
import androidx.compose.ui.Alignment
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

class SettingsViewModel : ViewModel() {
    /** settings/business is readable by admin and manager only (security rules). */
    val business: StateFlow<BusinessSettings?> = ServiceLocator.settingsRepository.businessFlow()
        .catchLogged("SettingsViewModel")
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    // ---- Owner rules (edited here, saved with saveBusinessSettings) ----
    val autoModes = androidx.compose.runtime.mutableStateMapOf<String, Boolean>()
    var managerCanOverride by androidx.compose.runtime.mutableStateOf(true)
    var deductAbsences by androidx.compose.runtime.mutableStateOf(false)
    var freeLeavesText by androidx.compose.runtime.mutableStateOf("0")
    var overtime by androidx.compose.runtime.mutableStateOf(false)
    var saveMessage by androidx.compose.runtime.mutableStateOf<Pair<String, Boolean>?>(null)
        private set
    var saving by androidx.compose.runtime.mutableStateOf(false)
        private set
    private var filled = false

    // ---- Bill terms (settings.invoiceTerms; admin only; printed on invoices — quotations keep `terms`) ----
    var invoiceTerms by androidx.compose.runtime.mutableStateOf("")
    var termsMessage by androidx.compose.runtime.mutableStateOf<Pair<String, Boolean>?>(null)
        private set
    var savingTerms by androidx.compose.runtime.mutableStateOf(false)
        private set

    fun saveInvoiceTerms() {
        val t = invoiceTerms.trim()
        if (t.length > 5000) {
            termsMessage = L("బిల్ షరతులు 5,000 అక్షరాల లోపు ఉండాలి", "Bill terms must be under 5,000 characters") to true
            return
        }
        viewModelScope.launch {
            savingTerms = true
            val r = ServiceLocator.settingsRepository.save(mapOf("invoiceTerms" to t))
            savingTerms = false
            termsMessage = r.fold(
                onSuccess = { L("బిల్ షరతులు సేవ్ అయ్యాయి ✓", "Bill terms saved ✓") to false },
                onFailure = { com.example.suseelacateringcrm.data.remote.CallableError.from(it).text to true },
            )
        }
    }

    /** Copy the stored values into the form once (later live updates don't overwrite typing). */
    fun fillOnce(b: BusinessSettings) {
        if (filled) return
        filled = true
        CalcArea.entries.forEach { autoModes[it.key] = b.modeOf(it) != "manual" }
        managerCanOverride = b.managerCanOverride
        deductAbsences = b.monthlyPayRules.deductAbsences
        freeLeavesText = b.monthlyPayRules.freeLeaves.toString()
        overtime = b.monthlyPayRules.overtime
        invoiceTerms = b.invoiceTerms.ifBlank { DEFAULT_INVOICE_TERMS_TE }
    }

    fun saveRules() {
        val freeLeaves = freeLeavesText.trim().ifBlank { "0" }.toIntOrNull()
        if (freeLeaves == null || freeLeaves < 0 || freeLeaves > 31) {
            saveMessage = L("ఉచిత సెలవులు 0 నుంచి 31 మధ్య", "Free leaves must be between 0 and 31") to true
            return
        }
        viewModelScope.launch {
            saving = true
            val r = ServiceLocator.settingsRepository.save(
                mapOf(
                    "calcModes" to CalcArea.entries.associate { it.key to if (autoModes[it.key] != false) "auto" else "manual" },
                    "managerCanOverride" to managerCanOverride,
                    "monthlyPayRules" to MonthlyPayRules(deductAbsences, freeLeaves, overtime).toMap(),
                )
            )
            saving = false
            saveMessage = r.fold(
                onSuccess = { L("సేవ్ అయింది ✓", "Saved ✓") to false },
                onFailure = { com.example.suseelacateringcrm.data.remote.CallableError.from(it).text to true },
            )
        }
    }
}

/** Same default as the server (functions/src/shared/settingsModel.ts DEFAULT_INVOICE_TERMS). */
private val DEFAULT_INVOICE_TERMS_TE = listOf(
    "1. బిల్ మొత్తం event రోజు లోపు పూర్తిగా చెల్లించాలి.",
    "2. చెల్లింపు: UPI / బ్యాంక్ ట్రాన్స్‌ఫర్ / నగదు — చెల్లించిన ప్రతి మొత్తానికి రసీదు ఇస్తాం.",
    "3. Event తర్వాత పెరిగిన అతిథులు / అదనపు వస్తువులు ఈ బిల్‌లో వేరుగా చూపించాం.",
    "4. ఆర్డర్ రద్దు అయితే, ఉంచుకున్న మొత్తం 'రద్దు చార్జీ' గా బిల్‌లో ఉంటుంది.",
).joinToString("\n")

/** QA fix c: "బిల్ షరతులు" — printed on new bills (invoices); the quotation terms stay in the setup wizard. */
@Composable
private fun InvoiceTermsSection(viewModel: SettingsViewModel) {
    SectionLabel(L("బిల్ షరతులు", "Bill terms"))
    Text(
        L("కొత్త బిల్లుల (invoice) మీద ప్రింట్ అవుతాయి — కొటేషన్ షరతులు వేరు (validity లైన్ వద్దు).",
            "Printed on new bills (invoices) — separate from the quotation terms (no validity line)."),
        style = MaterialTheme.typography.bodySmall,
    )
    AppTextField(
        viewModel.invoiceTerms,
        { viewModel.invoiceTerms = it.take(5000) },
        L("బిల్ షరతులు", "Bill terms"),
        singleLine = false,
    )
    viewModel.termsMessage?.let { (text, isError) -> NoticeBox(text, if (isError) Tone.BAD else Tone.GOOD) }
    Button(
        onClick = { viewModel.saveInvoiceTerms() },
        enabled = !viewModel.savingTerms,
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
    ) { Text(L("బిల్ షరతులు సేవ్ చేయి", "Save bill terms")) }
}

private fun areaLabel(area: CalcArea): String = when (area) {
    CalcArea.QUOTATION -> L("కొటేషన్ మొత్తం", "Quotation totals")
    CalcArea.INVOICE -> L("ఇన్వాయిస్ మొత్తం", "Invoice totals")
    CalcArea.ATTENDANCE_PAY -> L("రోజు కూలి (హాజరు)", "Attendance pay")
    CalcArea.PAYROLL -> L("నెల జీతాలు", "Payroll")
    CalcArea.COOKING -> L("వంట పరిమాణాలు", "Cooking quantities")
    CalcArea.TARGETS -> L("నెల లక్ష్యాలు", "Month targets")
}

@Composable
private fun OwnerRules(viewModel: SettingsViewModel) {
    SectionLabel(L("లెక్కలు: ఆటోమేటిక్ / మాన్యువల్", "Calculations: automatic / manual"))
    Text(
        L("ఆన్ = server లెక్కిస్తుంది (ఆటోమేటిక్). ఆఫ్ = మీరు చేతితో పెడతారు (మాన్యువల్).",
            "On = the server calculates (automatic). Off = typed by hand (manual)."),
        style = MaterialTheme.typography.bodySmall,
    )
    CalcArea.entries.forEach { area ->
        SwitchRow(areaLabel(area), viewModel.autoModes[area.key] != false) { viewModel.autoModes[area.key] = it }
    }
    SwitchRow(
        L("Manager కూడా చేతితో మార్చొచ్చు", "Manager may enter values by hand"),
        viewModel.managerCanOverride,
    ) { viewModel.managerCanOverride = it }

    SectionLabel(L("నెల జీతం నియమాలు", "Monthly salary rules"))
    SwitchRow(L("సెలవులకి జీతం కోత", "Cut pay for absences"), viewModel.deductAbsences) { viewModel.deductAbsences = it }
    AppTextField(
        viewModel.freeLeavesText,
        { viewModel.freeLeavesText = it.filter(Char::isDigit) },
        L("నెలకి ఉచిత సెలవులు", "Free leaves per month"),
        keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
    )
    SwitchRow(L("ఓవర్‌టైమ్ ఇవ్వాలి", "Pay overtime"), viewModel.overtime) { viewModel.overtime = it }
    Text(L("Advances ఎప్పుడూ తీసేస్తాం.", "Advances are always deducted."), style = MaterialTheme.typography.bodySmall)

    viewModel.saveMessage?.let { (text, isError) -> NoticeBox(text, if (isError) Tone.BAD else Tone.GOOD) }
    Button(
        onClick = { viewModel.saveRules() },
        enabled = !viewModel.saving,
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
    ) { Text(L("నియమాలు సేవ్ చేయి", "Save rules")) }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
fun SettingsScreen(
    role: UserRole?,
    padding: PaddingValues,
    onOpenSetup: () -> Unit,
) {
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        ScreenHeader(L("సెట్టింగ్స్", "Settings"))
        SectionLabel(L("భాష", "Language"))
        ChoiceChips(
            options = listOf("te", "en", "hi"),
            selected = AppLanguage.code,
            label = { when (it) { "te" -> "తెలుగు"; "hi" -> "हिन्दी"; else -> "English" } },
            onSelect = { AppLanguage.set(it) },
        )
        if (role != UserRole.STAFF) {
            val viewModel: SettingsViewModel = viewModel()
            val b by viewModel.business.collectAsStateWithLifecycle()
            SectionLabel(L("వ్యాపార వివరాలు", "Business details"))
            val s = b
            if (s == null) {
                Text(L("ఇంకా సెటప్ చేయలేదు", "Not set up yet"))
            } else {
                AmountRow(L("పేరు", "Name"), s.name)
                AmountRow(L("ఫోన్", "Phone"), s.phone)
                AmountRow("FSSAI", s.fssaiNumber.ifBlank { "-" })
                AmountRow("GST", if (s.gstRegistered) "${s.gstin} · ${s.defaultGstRate}%" else L("లేదు (Invoice మాత్రమే)", "Not registered (plain Invoice)"))
                // Bank details are owner-only on screen.
                if (role.isAdmin) {
                    AmountRow(L("బ్యాంక్", "Bank"), listOf(s.bank.name, s.bank.account, s.bank.ifsc).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "-" })
                    AmountRow("UPI", s.upiId.ifBlank { "-" })
                }
            }
            if (role.isAdmin) {
                Button(onClick = onOpenSetup, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
                    Text(L("సెటప్ wizard తెరువు", "Open setup wizard"))
                }
                if (s != null) {
                    androidx.compose.runtime.LaunchedEffect(s) { viewModel.fillOnce(s) }
                    InvoiceTermsSection(viewModel)
                    OwnerRules(viewModel)
                }
            }
        }
        Text(
            L("డబ్బు లెక్కలు (GST, బాకీలు, జీతాలు) server మాత్రమే చేస్తుంది.", "Money (GST, dues, wages) is calculated only by the server."),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 24.dp),
        )
    }
}
