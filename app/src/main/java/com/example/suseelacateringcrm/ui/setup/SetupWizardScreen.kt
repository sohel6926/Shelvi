package com.example.suseelacateringcrm.ui.setup

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.compose.AsyncImage
import com.example.suseelacateringcrm.data.model.PayType
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.theme.AnimatedProgressBar
import com.example.suseelacateringcrm.util.L

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupWizardScreen(
    padding: PaddingValues,
    onFinish: () -> Unit,
) {
    val context = LocalContext.current
    val viewModel: SetupWizardViewModel = viewModel(
        key = "setup-wizard",
        factory = viewModelFactory { initializer { SetupWizardViewModel(context.applicationContext) } },
    )
    val staff by viewModel.staff.collectAsStateWithLifecycle()
    val stepTitles = listOf(
        L("1. వ్యాపార వివరాలు", "1. Business details"),
        L("2. బ్యాంక్ & UPI", "2. Bank & UPI"),
        L("3. సంతకం & నిబంధనలు", "3. Signature & terms"),
        L("4. సిబ్బంది", "4. Staff"),
        L("5. ఫోటోలు & Excel", "5. Photos & Excel import"),
    )

    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        ScreenHeader(L("మొదటి సెటప్", "First-time setup"), L("ఎప్పుడైనా ఆపి, తర్వాత కొనసాగించవచ్చు", "You can stop and continue later"))
        AnimatedProgressBar(
            progress = viewModel.percent / 100f,
            label = L("సెటప్ పూర్తి", "Setup complete"),
            celebrateOnComplete = true,
            modifier = Modifier.padding(vertical = 8.dp),
        )
        ChoiceChips(
            options = (0 until SetupWizardViewModel.STEPS).toList(),
            selected = viewModel.step,
            label = { i -> (if (viewModel.stepDone(i)) "✓ " else "") + stepTitles[i].substringBefore(".") },
            onSelect = { viewModel.goTo(it) },
        )
        SectionLabel(stepTitles[viewModel.step])

        when (viewModel.step) {
            0 -> BusinessStep(viewModel)
            1 -> BankStep(viewModel)
            2 -> SignatureStep(viewModel)
            3 -> StaffStep(viewModel, staff.map { it.name })
            else -> ImportStep(viewModel)
        }

        viewModel.message?.let { (text, isError) -> NoticeBox(text, if (isError) Tone.BAD else Tone.GOOD) }
        if (viewModel.busy) Text(L("దయచేసి ఆగండి…", "Please wait…"), modifier = Modifier.padding(top = 8.dp))

        Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onFinish) { Text(L("తర్వాత చేస్తాను", "Do it later")) }
            if (viewModel.step < SetupWizardViewModel.STEPS - 1) {
                TextButton(onClick = { viewModel.goTo(viewModel.step + 1) }) { Text(L("ఈ step దాటవేయి →", "Skip this step →")) }
            } else {
                Button(onClick = onFinish) { Text(L("పూర్తి", "Finish")) }
            }
        }
    }
}

@Composable
private fun BusinessStep(vm: SetupWizardViewModel) {
    val logoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.uploadLogo(uri)
    }
    AppTextField(vm.name, { vm.name = it }, L("వ్యాపారం పేరు", "Business name"))
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (vm.logoUrl.isNotBlank()) {
            AsyncImage(model = vm.logoUrl, contentDescription = L("లోగో", "Logo"), modifier = Modifier.size(64.dp), contentScale = ContentScale.Fit)
        }
        OutlinedButton(onClick = { logoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
            Text(if (vm.logoUrl.isBlank()) L("లోగో ఎంచుకోండి", "Pick logo") else L("లోగో మార్చు", "Change logo"))
        }
    }
    AppTextField(vm.address, { vm.address = it }, L("చిరునామా", "Address"), singleLine = false)
    AppTextField(vm.phone, { vm.phone = it }, L("ఫోన్", "Phone"), keyboardType = KeyboardType.Phone)
    AppTextField(vm.fssai, { vm.fssai = it }, L("FSSAI లైసెన్స్ నంబర్", "FSSAI licence number"), keyboardType = KeyboardType.Number)
    AppTextField(vm.gstin, { vm.gstin = it.uppercase() }, L("GSTIN (ఉంటే మాత్రమే)", "GSTIN (only if registered)"))
    if (vm.gstin.isNotBlank()) {
        AppTextField(vm.gstRateText, { vm.gstRateText = it }, L("GST రేటు (%)", "GST rate (%)"), keyboardType = KeyboardType.Decimal)
        NoticeBox(L("GSTIN పెడితే ఇప్పటి నుంచి invoices మీద GST పడుతుంది (Tax Invoice).", "With a GSTIN, invoices will charge GST from now on (Tax Invoice)."), Tone.INFO)
    } else {
        Text(L("GST registration లేదు — invoices మీద GST ఉండదు.", "Not GST-registered — invoices carry no GST."), style = MaterialTheme.typography.bodySmall)
    }
    Button(onClick = { vm.saveBusiness() }, enabled = !vm.busy, modifier = Modifier.padding(top = 8.dp)) { Text(L("సేవ్ చేసి ముందుకు", "Save and next")) }
}

@Composable
private fun BankStep(vm: SetupWizardViewModel) {
    AppTextField(vm.bankName, { vm.bankName = it }, L("బ్యాంక్ పేరు", "Bank name"))
    AppTextField(vm.bankAccount, { vm.bankAccount = it }, L("Account నంబర్", "Account number"), keyboardType = KeyboardType.Number)
    AppTextField(vm.ifsc, { vm.ifsc = it.uppercase() }, "IFSC")
    AppTextField(vm.upiId, { vm.upiId = it.trim() }, L("UPI ID (invoice మీద QR కోసం)", "UPI ID (for the QR on invoices)"))
    Button(onClick = { vm.saveBank() }, enabled = !vm.busy, modifier = Modifier.padding(top = 8.dp)) { Text(L("సేవ్ చేసి ముందుకు", "Save and next")) }
}

@Composable
private fun SignatureStep(vm: SetupWizardViewModel) {
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.uploadSignature(uri)
    }
    if (vm.signatureUrl.isNotBlank()) {
        AsyncImage(model = vm.signatureUrl, contentDescription = L("సంతకం", "Signature"), modifier = Modifier.fillMaxWidth().height(100.dp), contentScale = ContentScale.Fit)
    }
    OutlinedButton(onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
        Text(if (vm.signatureUrl.isBlank()) L("సంతకం ఫోటో ఎంచుకోండి", "Pick signature photo") else L("సంతకం మార్చు", "Change signature"))
    }
    Text(L("తెల్ల కాగితం మీద సంతకం చేసి ఫోటో తీయండి.", "Sign on white paper and take a photo."), style = MaterialTheme.typography.bodySmall)
    AppTextField(vm.terms, { vm.terms = it }, L("నిబంధనలు (invoice / quotation కింద)", "Terms (printed on invoices / quotations)"), singleLine = false)
    Button(onClick = { vm.saveTerms() }, enabled = !vm.busy, modifier = Modifier.padding(top = 8.dp)) { Text(L("సేవ్ చేసి ముందుకు", "Save and next")) }
}

@Composable
private fun StaffStep(vm: SetupWizardViewModel, names: List<String>) {
    Text(
        if (names.isEmpty()) L("ఇంకా ఎవరూ లేరు", "No staff yet")
        else L("ఇప్పటికే ${names.size} మంది: ", "${names.size} added: ") + names.joinToString(", "),
        style = MaterialTheme.typography.bodyMedium,
    )
    AppTextField(vm.staffName, { vm.staffName = it }, L("పేరు", "Name"))
    AppTextField(vm.staffPhone, { vm.staffPhone = it }, L("ఫోన్", "Phone"), keyboardType = KeyboardType.Phone)
    AppTextField(vm.staffRole, { vm.staffRole = it }, L("పని (వంట, సర్వర్, డ్రైవర్…)", "Job (cook, server, driver…)"))
    ChoiceChips(PayType.entries, vm.staffPayType, { it.label }, { vm.staffPayType = it })
    AppTextField(
        vm.staffWageText,
        { vm.staffWageText = it },
        if (vm.staffPayType == PayType.MONTHLY) L("నెల జీతం (₹)", "Monthly salary (₹)") else L("రోజు కూలి (₹)", "Daily wage (₹)"),
        keyboardType = KeyboardType.Decimal,
    )
    Button(onClick = { vm.addStaff() }, enabled = !vm.busy, modifier = Modifier.padding(top = 8.dp)) { Text(L("+ జోడించు", "+ Add")) }
    Text(L("చాలా మంది ఉంటే step 5 లో Excel నుంచి ఎక్కించవచ్చు.", "Many staff? Import them from Excel in step 5."), style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun ImportStep(vm: SetupWizardViewModel) {
    val context = LocalContext.current
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        vm.uploadPhotos(uris)
    }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importFile(context, uri)
    }
    Text(L("వంటకాల నిజమైన ఫోటోలు (ఒకేసారి 10 వరకు)", "Real food photos (up to 10 at a time)"), style = MaterialTheme.typography.bodyMedium)
    OutlinedButton(onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
        Text(L("ఫోటోలు ఎంచుకోండి", "Pick photos"))
    }
    if (vm.photosUploaded > 0) Text(L("${vm.photosUploaded} ఫోటోలు upload అయ్యాయి", "${vm.photosUploaded} photos uploaded"))

    SectionLabel(L("పాత లిస్టులు Excel నుంచి", "Old lists from Excel"))
    Text(
        L("మొదటి వరుసలో column పేర్లు ఉండాలి (పేరు, ఫోన్, చిరునామా…). .xlsx లేదా .csv ఫైల్. ఒకే ఫోన్ నంబర్ రెండోసారి వస్తే వదిలేస్తాం.",
            "Row 1 must have column names (name, phone, address…). .xlsx or .csv. Duplicates by phone are skipped."),
        style = MaterialTheme.typography.bodySmall,
    )
    ChoiceChips(ImportKind.entries, vm.importKind, { it.label }, { vm.importKind = it })
    OutlinedButton(onClick = {
        filePicker.launch(
            arrayOf(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "text/csv",
                "text/comma-separated-values",
                "application/octet-stream",
            )
        )
    }, enabled = !vm.busy) {
        Text(L("Excel / CSV ఫైల్ ఎంచుకోండి", "Pick Excel / CSV file"))
    }
    vm.importResult?.let { r ->
        if (r.skipped.isNotEmpty()) {
            Column(Modifier.padding(top = 8.dp)) {
                Text(L("వదిలేసిన వరుసలు:", "Skipped rows:"), style = MaterialTheme.typography.labelLarge)
                r.skipped.take(30).forEach { s ->
                    // Server row = 1-based data row (header not counted) → Excel row = row + 1.
                    Text(L("Excel వరుస ${s.row + 1}: ${s.te}", "Excel row ${s.row + 1}: ${s.en}"), style = MaterialTheme.typography.bodySmall)
                }
                if (r.skipped.size > 30) Text("…")
            }
        }
    }
}
