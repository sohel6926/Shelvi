package com.example.suseelacateringcrm.ui.expenses

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import coil.compose.AsyncImage
import com.example.suseelacateringcrm.data.model.EXPENSE_PAYMENT_METHODS
import com.example.suseelacateringcrm.data.model.ExpenseSections
import com.example.suseelacateringcrm.data.model.PURCHASE_UNITS
import com.example.suseelacateringcrm.data.model.VEHICLE_TYPES
import com.example.suseelacateringcrm.data.model.subCategoryOptionsFor
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpenseEntryScreen(
    padding: PaddingValues,
    expenseId: String? = null,
    prefillSection: String? = null,
    prefillSubCategory: String? = null,
    onDone: () -> Unit,
    /** Opens the staff list (admin only); null hides the button. */
    onOpenStaff: (() -> Unit)? = null,
) {
    val viewModel: ExpenseEntryViewModel = viewModel(
        key = "expense-entry-${expenseId ?: "$prefillSection-$prefillSubCategory"}",
        factory = viewModelFactory { initializer { ExpenseEntryViewModel(expenseId, prefillSection, prefillSubCategory) } },
    )

    LaunchedEffect(viewModel.saveState) {
        if (viewModel.saveState is UiState.Success) onDone()
    }

    if (viewModel.loading) {
        com.example.suseelacateringcrm.ui.components.LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    val bookings by viewModel.bookings.collectAsStateWithLifecycle()
    val knownPersons by viewModel.knownPersons.collectAsStateWithLifecycle()

    var sectionMenuExpanded by remember { mutableStateOf(false) }
    var subCategoryMenuExpanded by remember { mutableStateOf(false) }
    var personMenuExpanded by remember { mutableStateOf(false) }
    var vehicleMenuExpanded by remember { mutableStateOf(false) }
    var statusMenuExpanded by remember { mutableStateOf(false) }
    var methodMenuExpanded by remember { mutableStateOf(false) }
    var bookingMenuExpanded by remember { mutableStateOf(false) }
    var unitMenuExpanded by remember { mutableStateOf(false) }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) viewModel.receiptPhotoUri = uri
    }

    val subCategoryOptions = subCategoryOptionsFor(viewModel.section)

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(if (expenseId == null) L("కొత్త ఖర్చు", "New Expense Entry") else L("ఖర్చు మార్చు", "Edit Expense"), style = MaterialTheme.typography.titleLarge)
        if (viewModel.staffName.isNotBlank()) {
            Text(L("నమోదు చేసినవారు: ${viewModel.staffName}", "Recorded by: ${viewModel.staffName}"), style = MaterialTheme.typography.bodySmall)
        }

        // An old "Staff Advance" row keeps its section, shown read-only.
        val oldAdvance = viewModel.section == ExpenseSections.STAFF_ADVANCE
        ExposedDropdownMenuBox(expanded = sectionMenuExpanded && !oldAdvance, onExpandedChange = { sectionMenuExpanded = it && !oldAdvance }) {
            OutlinedTextField(
                value = viewModel.section,
                onValueChange = {},
                readOnly = true,
                label = { Text(L("విభాగం", "Section")) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = sectionMenuExpanded) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(expanded = sectionMenuExpanded, onDismissRequest = { sectionMenuExpanded = false }) {
                ExpenseSections.all.filter { it != ExpenseSections.STAFF_ADVANCE }.forEach { s ->
                    DropdownMenuItem(text = { Text(tr(s)) }, onClick = {
                        viewModel.section = s
                        viewModel.subCategory = ""
                        sectionMenuExpanded = false
                    })
                }
            }
        }

        if (expenseId == null || oldAdvance) {
            com.example.suseelacateringcrm.ui.components.NoticeBox(
                L(
                    "సిబ్బంది అడ్వాన్స్ → సిబ్బంది page లో 'అడ్వాన్స్' ఇవ్వండి (జీతంలో దానంతట అదే కట్ అవుతుంది)" +
                        (if (oldAdvance) " — ఇది పాత నమోదు, చూడటానికి మాత్రమే." else ""),
                    "Staff advance → give it as an 'Advance' on the Staff page (it is cut from the salary automatically)" +
                        (if (oldAdvance) " — this is an old entry, shown read-only." else ""),
                ),
                com.example.suseelacateringcrm.ui.components.Tone.INFO,
                modifier = Modifier.padding(vertical = 4.dp),
            )
            if (onOpenStaff != null) {
                OutlinedButton(onClick = onOpenStaff) { Text(L("సిబ్బంది page కి వెళ్ళు", "Go to Staff page")) }
            }
        }

        if (subCategoryOptions.isNotEmpty()) {
            ExposedDropdownMenuBox(expanded = subCategoryMenuExpanded, onExpandedChange = { subCategoryMenuExpanded = it }) {
                OutlinedTextField(
                    value = viewModel.subCategory,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("రకం", "Type")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = subCategoryMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = subCategoryMenuExpanded, onDismissRequest = { subCategoryMenuExpanded = false }) {
                    subCategoryOptions.forEach { option ->
                        DropdownMenuItem(text = { Text(tr(option)) }, onClick = {
                            viewModel.subCategory = option
                            subCategoryMenuExpanded = false
                        })
                    }
                }
            }
        } else {
            AppTextField(value = viewModel.subCategory, onValueChange = { viewModel.subCategory = it }, label = L("రకం / వివరణ", "Type / description"))
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        Text(L("వ్యక్తి / Supplier", "Person / Supplier"), style = MaterialTheme.typography.titleSmall)

        val filteredPersons = knownPersons.filter {
            viewModel.personName.isNotBlank() && it.first.contains(viewModel.personName, ignoreCase = true)
        }
        ExposedDropdownMenuBox(
            expanded = personMenuExpanded && filteredPersons.isNotEmpty(),
            onExpandedChange = { personMenuExpanded = it },
        ) {
            OutlinedTextField(
                value = viewModel.personName,
                onValueChange = { viewModel.personName = it; personMenuExpanded = true },
                label = { Text(L("వ్యక్తి / Supplier పేరు", "Person / Supplier name")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
            )
            ExposedDropdownMenu(
                expanded = personMenuExpanded && filteredPersons.isNotEmpty(),
                onDismissRequest = { personMenuExpanded = false },
            ) {
                filteredPersons.forEach { (name, mobile) ->
                    DropdownMenuItem(text = { Text(if (mobile.isNotBlank()) "$name — $mobile" else name) }, onClick = {
                        viewModel.selectPerson(name, mobile)
                        personMenuExpanded = false
                    })
                }
            }
        }
        AppTextField(
            value = viewModel.mobileNumber,
            onValueChange = { viewModel.mobileNumber = it },
            label = L("మొబైల్ నంబర్", "Mobile number"),
            keyboardType = KeyboardType.Phone,
        )

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        Text(L("పరిమాణం & ధర", "Quantity & Rate"), style = MaterialTheme.typography.titleSmall)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AppTextField(
                value = viewModel.quantityText,
                onValueChange = { viewModel.onQuantityChanged(it) },
                label = L("పరిమాణం / సంఖ్య", "Quantity / Count"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            ExposedDropdownMenuBox(
                expanded = unitMenuExpanded,
                onExpandedChange = { unitMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = viewModel.unit,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Unit") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = unitMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = unitMenuExpanded, onDismissRequest = { unitMenuExpanded = false }) {
                    PURCHASE_UNITS.forEach { u ->
                        DropdownMenuItem(text = { Text(u) }, onClick = { viewModel.unit = u; unitMenuExpanded = false })
                    }
                }
            }
        }
        AppTextField(
            value = viewModel.rateText,
            onValueChange = { viewModel.onRateChanged(it) },
            label = L("ధర (₹)", "Rate (₹)"),
            keyboardType = KeyboardType.Decimal,
        )

        if (viewModel.section == ExpenseSections.CLEANING || viewModel.section == ExpenseSections.TEMP_STAFF || viewModel.section == ExpenseSections.LIVE_COUNTER) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppTextField(
                    value = viewModel.numberOfStaffText,
                    onValueChange = { viewModel.numberOfStaffText = it },
                    label = L("సిబ్బంది సంఖ్య", "Number of staff"),
                    keyboardType = KeyboardType.Number,
                    modifier = Modifier.weight(1f),
                )
                AppTextField(
                    value = viewModel.numberOfDaysText,
                    onValueChange = { viewModel.numberOfDaysText = it },
                    label = L("రోజుల సంఖ్య", "Number of days"),
                    keyboardType = KeyboardType.Number,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (viewModel.section == ExpenseSections.TRANSPORT) {
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            Text(L("వాహనం / ట్రిప్", "Vehicle / Trip"), style = MaterialTheme.typography.titleSmall)
            ExposedDropdownMenuBox(expanded = vehicleMenuExpanded, onExpandedChange = { vehicleMenuExpanded = it }) {
                OutlinedTextField(
                    value = viewModel.vehicleType,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("వాహనం రకం", "Vehicle type")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = vehicleMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = vehicleMenuExpanded, onDismissRequest = { vehicleMenuExpanded = false }) {
                    VEHICLE_TYPES.forEach { v ->
                        DropdownMenuItem(text = { Text(v) }, onClick = { viewModel.vehicleType = v; vehicleMenuExpanded = false })
                    }
                }
            }
            AppTextField(value = viewModel.vehicleNumber, onValueChange = { viewModel.vehicleNumber = it }, label = L("వాహనం నంబర్", "Vehicle number"))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppTextField(value = viewModel.fromLocation, onValueChange = { viewModel.fromLocation = it }, label = L("నుండి", "From"), modifier = Modifier.weight(1f))
                AppTextField(value = viewModel.toLocation, onValueChange = { viewModel.toLocation = it }, label = L("వరకు", "To"), modifier = Modifier.weight(1f))
            }
            AppTextField(value = viewModel.tripCountText, onValueChange = { viewModel.tripCountText = it }, label = L("ట్రిప్పులు", "Trip count"), keyboardType = KeyboardType.Number)
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        Text(L("ఖర్చులు & మొత్తం", "Charges & Total"), style = MaterialTheme.typography.titleSmall)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AppTextField(
                value = viewModel.transportChargesText,
                onValueChange = { viewModel.onTransportChargesChanged(it) },
                label = L("రవాణా (₹)", "Transport (₹)"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            AppTextField(
                value = viewModel.setupChargesText,
                onValueChange = { viewModel.onSetupChargesChanged(it) },
                label = L("సెటప్ (₹)", "Setup (₹)"),
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
        }
        AppTextField(
            value = viewModel.otherChargesText,
            onValueChange = { viewModel.onOtherChargesChanged(it) },
            label = L("ఇతర ఖర్చులు (₹)", "Other charges (₹)"),
            keyboardType = KeyboardType.Decimal,
        )
        AppTextField(
            value = viewModel.totalAmountText,
            onValueChange = { viewModel.onTotalAmountEditedManually(it) },
            label = L("మొత్తం (₹)", "Total amount (₹)"),
            keyboardType = KeyboardType.Decimal,
        )
        AppTextField(
            value = viewModel.advancePaidText,
            onValueChange = { viewModel.advancePaidText = it },
            label = L("అడ్వాన్స్ ఇచ్చింది (₹)", "Advance paid (₹)"),
            keyboardType = KeyboardType.Decimal,
        )
        Text(
            L("బాకీ: ${CurrencyUtils.formatInr(viewModel.balanceAmount)}", "Balance: ${CurrencyUtils.formatInr(viewModel.balanceAmount)}"),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 4.dp),
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // R7-8: payment status comes from the server (vendor payments) — read-only.
            OutlinedTextField(
                value = tr(viewModel.paymentStatus.ifBlank { "Unpaid" }),
                onValueChange = {},
                readOnly = true,
                enabled = false,
                label = { Text(L("చెల్లింపు స్థితి (ఆటోమేటిక్)", "Payment status (automatic)")) },
                modifier = Modifier.weight(1f).padding(vertical = 4.dp),
            )
            ExposedDropdownMenuBox(
                expanded = methodMenuExpanded,
                onExpandedChange = { methodMenuExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = viewModel.paymentMethod,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(L("ఎలా చెల్లించారు", "Payment method")) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = methodMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).menuAnchor(),
                )
                ExposedDropdownMenu(expanded = methodMenuExpanded, onDismissRequest = { methodMenuExpanded = false }) {
                    EXPENSE_PAYMENT_METHODS.forEach { m ->
                        DropdownMenuItem(text = { Text(tr(m)) }, onClick = { viewModel.paymentMethod = m; methodMenuExpanded = false })
                    }
                }
            }
        }

        if (viewModel.section == ExpenseSections.UTILITY_BILL) {
            AppTextField(value = viewModel.billMonth, onValueChange = { viewModel.billMonth = it }, label = L("బిల్ నెల (ఉదా: Aug 2026)", "Bill month (e.g. Aug 2026)"))
        }
        AppTextField(value = viewModel.billNumber, onValueChange = { viewModel.billNumber = it }, label = L("బిల్ / రసీదు నంబర్ (ఐచ్ఛికం)", "Bill / receipt number (optional)"))

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        Text(L("తేదీలు", "Dates"), style = MaterialTheme.typography.titleSmall)
        AppDatePickerField(label = L("సేవ / కొన్న తేదీ", "Service / purchase date"), date = viewModel.serviceDate, onDateSelected = { viewModel.serviceDate = it })
        AppDatePickerField(label = L("గడువు తేదీ (ఐచ్ఛికం)", "Due date (optional)"), date = viewModel.dueDate, onDateSelected = { viewModel.dueDate = it })
        AppDatePickerField(label = L("చెల్లించిన తేదీ (ఐచ్ఛికం)", "Paid date (optional)"), date = viewModel.paidDate, onDateSelected = { viewModel.paidDate = it })

        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        com.example.suseelacateringcrm.ui.components.CostTargetPicker(
            target = viewModel.costTarget,
            bookings = bookings,
            onChange = { viewModel.selectCostTarget(it) },
        )
        if (viewModel.section == ExpenseSections.OUTSIDE_PURCHASE) {
            com.example.suseelacateringcrm.ui.components.NoticeBox(
                L(
                    "బయట ఆర్డర్లు (పుల్కా, ఐస్ క్రీం…) ఇప్పుడు 'బయట ఆర్డర్లు' స్క్రీన్‌లో వేయండి — వచ్చినవి / తిరిగి ఇచ్చినవి లెక్క అక్కడే.",
                    "Outside orders (pulka, ice cream…) now go in the 'Outside orders' screen — delivered / returned are tracked there.",
                ),
                com.example.suseelacateringcrm.ui.components.Tone.INFO,
            )
        }

        Text(L("రసీదు ఫోటో", "Receipt photo"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        val photoUri = viewModel.receiptPhotoUri
        val displayPhoto: Any? = photoUri ?: viewModel.existingReceiptPhotoUrl.takeIf { it.isNotBlank() }
        if (displayPhoto != null) {
            AsyncImage(
                model = displayPhoto,
                contentDescription = L("రసీదు ఫోటో", "Receipt photo"),
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().height(160.dp).padding(top = 8.dp),
            )
        }
        OutlinedButton(
            onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            modifier = Modifier.padding(top = 8.dp),
        ) {
            Text(if (displayPhoto == null) L("రసీదు ఫోటో జోడించు", "Attach receipt photo") else L("ఫోటో మార్చు", "Change photo"))
        }

        AppTextField(value = viewModel.notes, onValueChange = { viewModel.notes = it }, label = L("గమనికలు", "Notes"), singleLine = false, modifier = Modifier.padding(top = 8.dp))

        val saveState = viewModel.saveState
        if (saveState is UiState.Error) {
            Text(saveState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
        }
        if (viewModel.uploading) {
            Text(L("ఫోటో upload అవుతోంది…", "Uploading photo…"), modifier = Modifier.padding(top = 8.dp))
        }

        Button(
            onClick = { viewModel.save() },
            modifier = Modifier.padding(top = 16.dp),
            enabled = saveState !is UiState.Loading,
        ) {
            Text(L("ఖర్చు సేవ్ చేయి", "Save Expense"))
        }
    }
}
