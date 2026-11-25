package com.example.suseelacateringcrm.ui.billing

import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.PaymentMethod
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.StatusChip
import com.example.suseelacateringcrm.ui.components.color
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.PdfGenerator
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.QrCode
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.data.model.displayLabel
import com.example.suseelacateringcrm.ui.components.AmountRow
import com.example.suseelacateringcrm.ui.components.CalcModeChip
import com.example.suseelacateringcrm.data.model.canOverride
import com.example.suseelacateringcrm.ui.components.DayPickerField
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtQty
import com.example.suseelacateringcrm.ui.components.rupees
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoiceDetailScreen(
    invoiceId: String,
    padding: PaddingValues,
) {
    val viewModel: InvoiceDetailViewModel = viewModel(
        key = "invoice-detail-$invoiceId",
        factory = viewModelFactory { initializer { InvoiceDetailViewModel(invoiceId) } },
    )
    val invoice by viewModel.invoice.collectAsStateWithLifecycle()
    val payments by viewModel.payments.collectAsStateWithLifecycle()
    val business by viewModel.business.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val pdfScope = androidx.compose.runtime.rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var showPaymentDialog by remember { mutableStateOf(false) }
    var showRefundDialog by remember { mutableStateOf(false) }

    val currentInvoice = invoice ?: run {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }
    val isTax = currentInvoice.isTaxInvoice(business?.gstRegistered)

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        // "Invoice" until GST registration, "Tax Invoice" after (from the invoice data).
        ScreenHeader(currentInvoice.titleLabel(business?.gstRegistered), currentInvoice.invoiceNumber)
        business?.let { b ->
            if (b.name.isNotBlank()) Text(b.name, style = MaterialTheme.typography.titleMedium)
            val contact = listOfNotNull(
                b.phone.takeIf { it.isNotBlank() }?.let { L("ఫోన్ ", "Phone ") + it },
                b.fssaiNumber.takeIf { it.isNotBlank() }?.let { "FSSAI $it" },
                b.gstin.takeIf { it.isNotBlank() && isTax }?.let { "GSTIN $it" },
            )
            if (contact.isNotEmpty()) Text(contact.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
        }
        Text(DateUtils.formatDate(currentInvoice.issueDate))
        StatusChip(label = currentInvoice.invoiceStatus.displayLabel(), color = currentInvoice.invoiceStatus.color())

        SectionLabel(L("వివరాలు", "Items"))
        currentInvoice.lineItems.forEach { item ->
            AmountRow("${item.description}  ${fmtQty(item.quantity)} × ${rupees(item.unitPrice)}", rupees(item.amount))
        }
        AmountRow(L("మొత్తం (subtotal)", "Subtotal"), rupees(currentInvoice.subtotal))
        if (currentInvoice.discount > 0) AmountRow(L("తగ్గింపు", "Discount"), "-" + rupees(currentInvoice.discount))
        if (isTax) {
            Text("GST @ ${fmtQty(currentInvoice.gstRate)}%", style = MaterialTheme.typography.bodySmall)
            if (currentInvoice.isInterState) {
                AmountRow("IGST", rupees(currentInvoice.igstAmount))
            } else {
                AmountRow("CGST", rupees(currentInvoice.cgstAmount))
                AmountRow("SGST", rupees(currentInvoice.sgstAmount))
            }
        }
        AmountRow(L("చెల్లించాల్సింది", "Total"), rupees(currentInvoice.totalAmount), bold = true)
        CalcModeChip(
            info = currentInvoice.calc,
            currentValue = currentInvoice.totalAmount,
            canOverride = canOverride(viewModel.role, business),
            valueLabel = L("మొత్తం (₹)", "Total (₹)"),
            // Manual mode opens typing by default, but only before any payment is recorded.
            manualMode = business?.modeOf(com.example.suseelacateringcrm.data.model.CalcArea.INVOICE) == "manual" &&
                currentInvoice.amountPaid <= 0.0,
            onOverride = { m -> viewModel.overrideTotal(m) },
        )
        AmountRow(L("చెల్లించారు", "Paid"), rupees(currentInvoice.amountPaid))
        AmountRow(
            L("బాకీ", "Balance due"),
            rupees(currentInvoice.balanceDue),
            bold = true,
            color = if (currentInvoice.balanceDue > 0) MaterialTheme.colorScheme.error else androidx.compose.ui.graphics.Color.Unspecified,
        )

        // UPI QR from the server's payload (amount = balance, set by the server).
        if (currentInvoice.upiQrPayload.isNotBlank() && currentInvoice.balanceDue > 0) {
            SectionLabel(L("UPI తో చెల్లించండి", "Pay by UPI"))
            val qr = remember(currentInvoice.upiQrPayload) { QrCode.bitmap(currentInvoice.upiQrPayload) }
            if (qr != null) {
                Image(
                    bitmap = qr.asImageBitmap(),
                    contentDescription = L("UPI QR కోడ్", "UPI QR code"),
                    modifier = Modifier.size(220.dp),
                )
            }
            OutlinedButton(onClick = { clipboard.setText(AnnotatedString(currentInvoice.upiQrPayload)) }) {
                Text(L("UPI link copy చేయి", "Copy UPI link"))
            }
        } else if (currentInvoice.balanceDue > 0 && business?.upiId.isNullOrBlank()) {
            Text(L("UPI QR కోసం Setup లో UPI ID పెట్టండి", "Add a UPI ID in Setup to show a UPI QR"), style = MaterialTheme.typography.bodySmall)
        }

        SectionLabel(L("చెల్లింపులు", "Payments"))
        if (payments.isEmpty()) {
            Text(L("ఇంకా చెల్లింపులు లేవు", "No payments recorded yet."))
        } else {
            payments.forEach { payment ->
                val method = PaymentMethod.fromFirestore(payment.method).displayLabel
                AmountRow(
                    "${DateUtils.formatDate(payment.date)} · $method" + if (payment.type == "refund") L(" (వాపసు)", " (refund)") else "",
                    rupees(payment.amount),
                )
            }
        }
        (viewModel.paymentState as? UiState.Success)?.let { NoticeBox(it.data, Tone.GOOD) }
        if (!showPaymentDialog) (viewModel.paymentState as? UiState.Error)?.let { NoticeBox(it.message, Tone.BAD) }

        Row(modifier = Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { viewModel.clearPaymentState(); showPaymentDialog = true },
                enabled = currentInvoice.balanceDue > 0 && viewModel.paymentState !is UiState.Loading,
            ) {
                Text(L("చెల్లింపు నమోదు", "Record payment"))
            }
            // Refunds / adjustments: owner only (refundOrAdjust is admin-only).
            if (viewModel.role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN && currentInvoice.amountPaid > 0) {
                OutlinedButton(onClick = { showRefundDialog = true }) { Text(L("వాపసు", "Refund")) }
            }
            OutlinedButton(onClick = {
                // R10-3: business header, brand / legal line, UPI QR and signature image; no tax lines when GST is off.
                val b = business
                val header = buildList {
                    add(b?.name?.ifBlank { null } ?: "Suseela Caterings")
                    val issuer = currentInvoice.issuerLine.ifBlank { b?.issuerLine ?: "" }
                    if (issuer.isNotBlank()) add(issuer)
                    b?.address?.takeIf { it.isNotBlank() }?.let { add(it) }
                    add("Phone: ${b?.phone ?: com.example.suseelacateringcrm.data.model.DEFAULT_BUSINESS_PHONE}" +
                        (b?.fssaiNumber?.takeIf { it.isNotBlank() }?.let { "  FSSAI: $it" } ?: ""))
                    if (b != null && b.gstin.isNotBlank() && isTax) add("GSTIN: ${b.gstin}")
                }
                val lines = buildList {
                    add(currentInvoice.documentTitle.ifBlank { if (isTax) "Tax Invoice" else "Invoice" }.uppercase())
                    add("Date: ${DateUtils.formatDate(currentInvoice.issueDate)}")
                    add("Status: ${currentInvoice.invoiceStatus.label}")
                    add("")
                    currentInvoice.lineItems.forEach {
                        add("${it.description}: ${fmtQty(it.quantity)} x ${rupees(it.unitPrice)} = ${rupees(it.amount)}")
                    }
                    add("")
                    add("Subtotal: ${rupees(currentInvoice.subtotal)}")
                    if (currentInvoice.discount > 0) add("Discount: -${rupees(currentInvoice.discount)}")
                    if (isTax) {
                        add("GST @ ${fmtQty(currentInvoice.gstRate)}%")
                        if (currentInvoice.isInterState) {
                            add("IGST: ${rupees(currentInvoice.igstAmount)}")
                        } else {
                            add("CGST: ${rupees(currentInvoice.cgstAmount)}")
                            add("SGST: ${rupees(currentInvoice.sgstAmount)}")
                        }
                    }
                    add("Total: ${rupees(currentInvoice.totalAmount)}")
                    add("Paid: ${rupees(currentInvoice.amountPaid)}")
                    add("Balance due: ${rupees(currentInvoice.balanceDue)}")
                    b?.let { bb ->
                        if (bb.bank.account.isNotBlank()) add("Bank: ${bb.bank.name} A/c ${bb.bank.account} IFSC ${bb.bank.ifsc}")
                        if (bb.upiId.isNotBlank()) add("UPI: ${bb.upiId}")
                    }
                    // Final QA 12: bills print their own terms (invoice.terms, else settings.invoiceTerms) — never the quotation terms.
                    currentInvoice.terms.ifBlank { b?.invoiceTerms.orEmpty() }
                        .takeIf { it.isNotBlank() }?.let { t -> add(""); add("Terms:"); t.lines().forEach { add(it) } }
                }
                pdfScope.launch {
                    val images = buildList {
                        if (currentInvoice.upiQrPayload.isNotBlank() && currentInvoice.balanceDue > 0) {
                            com.example.suseelacateringcrm.util.QrCode.bitmap(currentInvoice.upiQrPayload, 480)
                                ?.let { add(PdfGenerator.PdfImage("Scan to pay (UPI)", it, 130f)) }
                        }
                        PdfGenerator.loadBitmap(b?.signatureUrl ?: "")?.let { add(PdfGenerator.PdfImage("Authorised signatory", it, 150f)) }
                    }
                    PdfGenerator.generateAndShare(
                        context = context,
                        fileName = "${currentInvoice.invoiceNumber.ifBlank { "invoice" }}.pdf",
                        title = currentInvoice.invoiceNumber,
                        lines = lines,
                        header = header,
                        images = images,
                        footer = "Thank you — ${b?.name?.ifBlank { null } ?: "Suseela Caterings"}",
                    )
                }
            }) {
                Text(L("PDF పంపు", "Export PDF"))
            }
        }
        // Change history (owner only).
        if (viewModel.role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN) {
            com.example.suseelacateringcrm.ui.history.HistorySection("invoices", currentInvoice.id)
        }
    }

    if (showRefundDialog) {
        var amountText by remember { mutableStateOf("") }
        var reason by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        var request by remember { mutableStateOf<Pair<String, String>?>(null) }
        request?.let { (a, r) ->
            LaunchedEffect(a, r) {
                val err = viewModel.refund(a, r)
                request = null
                if (err == null) showRefundDialog = false else error = err
            }
        }
        AlertDialog(
            onDismissRequest = { showRefundDialog = false },
            title = { Text(L("వాపసు / సర్దుబాటు", "Refund / adjustment")) },
            text = {
                Column {
                    Text(L("చెల్లించింది: ", "Paid so far: ") + rupees(currentInvoice.amountPaid), style = MaterialTheme.typography.titleSmall)
                    AppTextField(value = amountText, onValueChange = { amountText = it }, label = L("వాపసు మొత్తం (₹)", "Refund amount (₹)"), keyboardType = KeyboardType.Decimal)
                    AppTextField(value = reason, onValueChange = { reason = it }, label = L("కారణం (తప్పనిసరి)", "Reason (required)"), singleLine = false)
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    if (request != null) Text(L("సేవ్ చేస్తున్నాం…", "Saving…"))
                }
            },
            confirmButton = {
                TextButton(onClick = { error = null; request = amountText to reason }, enabled = request == null) { Text(L("సేవ్", "Save")) }
            },
            dismissButton = { TextButton(onClick = { showRefundDialog = false }) { Text(L("వద్దు", "Cancel")) } },
        )
    }

    if (showPaymentDialog) {
        var amountText by remember { mutableStateOf("") }
        var method by remember { mutableStateOf(PaymentMethod.CASH) }
        var note by remember { mutableStateOf("") }
        var date by remember { mutableStateOf(DayKey.today()) }
        var methodExpanded by remember { mutableStateOf(false) }

        LaunchedEffect(viewModel.paymentState) {
            if (viewModel.paymentState is UiState.Success) showPaymentDialog = false
        }

        AlertDialog(
            onDismissRequest = { showPaymentDialog = false },
            title = { Text(L("చెల్లింపు నమోదు", "Record payment")) },
            text = {
                Column {
                    Text(L("బాకీ: ", "Balance: ") + rupees(currentInvoice.balanceDue), style = MaterialTheme.typography.titleSmall)
                    AppTextField(value = amountText, onValueChange = { amountText = it }, label = L("మొత్తం (₹)", "Amount (₹)"), keyboardType = KeyboardType.Decimal)
                    ExposedDropdownMenuBox(expanded = methodExpanded, onExpandedChange = { methodExpanded = it }) {
                        OutlinedTextField(
                            value = method.displayLabel,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text(L("ఎలా", "Method")) },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = methodExpanded) },
                            modifier = Modifier.padding(vertical = 4.dp).menuAnchor(),
                        )
                        ExposedDropdownMenu(expanded = methodExpanded, onDismissRequest = { methodExpanded = false }) {
                            PaymentMethod.entries.forEach { m ->
                                DropdownMenuItem(text = { Text(m.displayLabel) }, onClick = {
                                    method = m
                                    methodExpanded = false
                                })
                            }
                        }
                    }
                    DayPickerField(L("తేదీ", "Date"), date, { date = it })
                    AppTextField(value = note, onValueChange = { note = it }, label = L("గమనిక (ఐచ్ఛికం)", "Note (optional)"))
                    when (val s = viewModel.paymentState) {
                        is UiState.Error -> Text(s.message, color = MaterialTheme.colorScheme.error)
                        is UiState.Loading -> Text(L("సేవ్ చేస్తున్నాం…", "Saving…"))
                        else -> {}
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.recordPayment(amountText, method.label, date, note) },
                    enabled = viewModel.paymentState !is UiState.Loading,
                ) { Text(L("సేవ్", "Save")) }
            },
            dismissButton = {
                TextButton(onClick = { showPaymentDialog = false }) { Text(L("వద్దు", "Cancel")) }
            },
        )
    }
}
