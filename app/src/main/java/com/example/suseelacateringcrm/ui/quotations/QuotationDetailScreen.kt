package com.example.suseelacateringcrm.ui.quotations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.QuotationStatus
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.StatusChip
import com.example.suseelacateringcrm.ui.components.color
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.PdfGenerator
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.tr

/** WhatsApp text: number, lines, total, validity — in the app language (QA fix 2). */
private fun quotationWhatsAppText(q: com.example.suseelacateringcrm.data.model.Quotation, customerName: String, businessName: String): String =
    buildList {
        add(businessName.ifBlank { "Suseela Caterings" })
        add(L("కొటేషన్ ${q.quotationNumber}", "Quotation ${q.quotationNumber}") + if (q.version > 1) " (v${q.version})" else "")
        if (customerName.isNotBlank()) add(L("$customerName గారికి", "For $customerName"))
        add("")
        q.lineItems.forEach { add("• ${it.description}: ${CurrencyUtils.formatInr(it.amount)}") }
        add("")
        add(L("మొత్తం: ${CurrencyUtils.formatInr(q.totalAmount)}", "Total: ${CurrencyUtils.formatInr(q.totalAmount)}"))
        if (q.validUntil != null) add(L("${DateUtils.formatDate(q.validUntil)} వరకు చెల్లుతుంది", "Valid until ${DateUtils.formatDate(q.validUntil)}"))
    }.joinToString("\n")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun QuotationDetailScreen(
    quotationId: String,
    padding: PaddingValues,
    onConvertToInvoice: (String) -> Unit,
) {
    val viewModel: QuotationDetailViewModel = viewModel(
        key = "quotation-detail-$quotationId",
        factory = viewModelFactory { initializer { QuotationDetailViewModel(quotationId) } },
    )
    val quotation by viewModel.quotation.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val currentQuotation = quotation ?: run {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(currentQuotation.quotationNumber, style = MaterialTheme.typography.headlineSmall)
        if (currentQuotation.bookingId.isBlank()) {
            Text(
                com.example.suseelacateringcrm.util.L(
                    "ఈ కొటేషన్‌కి booking లేదు — invoice కోసం ముందు booking చేయండి.",
                    "No booking linked — create a booking before invoicing.",
                ),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (currentQuotation.platesToCook > 0) {
            Text(com.example.suseelacateringcrm.util.L("వంట: ${currentQuotation.platesToCook} మందికి", "Cook for: ${currentQuotation.platesToCook}"))
        }
        Text(DateUtils.formatDate(currentQuotation.issueDate))
        Text(L("గడువు: ${DateUtils.formatDate(currentQuotation.validUntil)}", "Valid until: ${DateUtils.formatDate(currentQuotation.validUntil)}"))
        StatusChip(label = tr(currentQuotation.quotationStatus.label), color = currentQuotation.quotationStatus.color())

        Text(L("వివరాలు", "Line items"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        currentQuotation.lineItems.forEach { item ->
            Text("${item.description}: ${item.quantity.toInt()} × ${CurrencyUtils.formatInr(item.unitPrice)} = ${CurrencyUtils.formatInr(item.amount)}")
        }

        Text(L("మొత్తం (subtotal): ${CurrencyUtils.formatInr(currentQuotation.subtotal)}", "Subtotal: ${CurrencyUtils.formatInr(currentQuotation.subtotal)}"), modifier = Modifier.padding(top = 8.dp))
        if (currentQuotation.gstRate > 0) {
            Text("GST @ ${currentQuotation.gstRate}%")
            if (currentQuotation.isInterState) {
                Text("IGST: ${CurrencyUtils.formatInr(currentQuotation.igstAmount)}")
            } else {
                Text("CGST: ${CurrencyUtils.formatInr(currentQuotation.cgstAmount)}")
                Text("SGST: ${CurrencyUtils.formatInr(currentQuotation.sgstAmount)}")
            }
        } else {
            Text(L("పన్ను: ${CurrencyUtils.formatInr(currentQuotation.taxAmount)}", "Tax: ${CurrencyUtils.formatInr(currentQuotation.taxAmount)}"))
        }
        Text(L("తగ్గింపు: ${CurrencyUtils.formatInr(currentQuotation.discount)}", "Discount: ${CurrencyUtils.formatInr(currentQuotation.discount)}"))
        Text(L("మొత్తం: ${CurrencyUtils.formatInr(currentQuotation.totalAmount)}", "Total: ${CurrencyUtils.formatInr(currentQuotation.totalAmount)}"), style = MaterialTheme.typography.titleMedium)
        val business by viewModel.business.collectAsStateWithLifecycle()
        com.example.suseelacateringcrm.ui.components.CalcModeChip(
            info = currentQuotation.calc,
            currentValue = currentQuotation.totalAmount,
            canOverride = com.example.suseelacateringcrm.data.model.canOverride(viewModel.role, business),
            valueLabel = com.example.suseelacateringcrm.util.L("మొత్తం (₹)", "Total (₹)"),
            manualMode = business?.modeOf(com.example.suseelacateringcrm.data.model.CalcArea.QUOTATION) == "manual",
            onOverride = { m -> viewModel.overrideTotal(m) },
        )

        // QA fix 2: Draft → Sent → Accepted / Rejected (firestore.rules: admin / branch manager, status only).
        val mayChangeStatus = viewModel.role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN ||
            viewModel.role == com.example.suseelacateringcrm.data.model.UserRole.MANAGER
        val status = currentQuotation.quotationStatus
        if (mayChangeStatus && !currentQuotation.status.equals("Cancelled", ignoreCase = true)) {
            LaunchedEffect(currentQuotation.customerId) { viewModel.loadCustomer(currentQuotation.customerId) }
            val phone by viewModel.customerPhone.collectAsStateWithLifecycle()
            val customerName by viewModel.customerName.collectAsStateWithLifecycle()
            Text(L("కొటేషన్ స్థితి", "Quotation status"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
            Text(
                listOf(QuotationStatus.DRAFT, QuotationStatus.SENT).joinToString(" → ") { tr(it.label) } +
                    " → ${tr(QuotationStatus.ACCEPTED.label)} / ${tr(QuotationStatus.REJECTED.label)}",
                style = MaterialTheme.typography.bodySmall,
            )
            if (status == QuotationStatus.DRAFT && currentQuotation.version > 1) {
                Text(
                    L("మార్పు తర్వాత (v${currentQuotation.version}) — మళ్ళీ పంపాలి", "Changed (v${currentQuotation.version}) — send again"),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(top = 4.dp),
            ) {
                if (status != QuotationStatus.ACCEPTED) {
                    Button(onClick = {
                        val text = quotationWhatsAppText(currentQuotation, customerName, business?.name.orEmpty())
                        val digits = phone.filter { it.isDigit() }
                        val to = if (digits.length == 10) "91$digits" else digits
                        val uri = android.net.Uri.parse("https://wa.me/$to?text=" + android.net.Uri.encode(text))
                        runCatching { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri)) }
                        if (status != QuotationStatus.SENT) viewModel.updateStatus(QuotationStatus.SENT)
                    }) {
                        Text(if (status == QuotationStatus.SENT) L("WhatsApp లో మళ్ళీ పంపు", "Share on WhatsApp again") else L("WhatsApp లో పంపు (Sent)", "Send on WhatsApp (marks Sent)"))
                    }
                }
                status.next.forEach { s ->
                    OutlinedButton(onClick = { viewModel.updateStatus(s) }) {
                        Text(
                            when (s) {
                                QuotationStatus.SENT -> L("పంపినట్టు గుర్తు పెట్టు", "Mark as sent")
                                QuotationStatus.ACCEPTED -> L("Customer ఒప్పుకున్నారు", "Customer accepted")
                                QuotationStatus.REJECTED -> L("Customer వద్దన్నారు", "Customer rejected")
                                else -> tr(s.label)
                            },
                        )
                    }
                }
            }
        }

        Row(modifier = Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // An invoice is made from a booking; quotations from the quote builder may not have one yet.
            Button(
                onClick = { onConvertToInvoice(currentQuotation.bookingId) },
                enabled = currentQuotation.bookingId.isNotBlank(),
            ) {
                Text(com.example.suseelacateringcrm.util.L("ఇన్వాయిస్ గా మార్చు", "Convert to Invoice"))
            }
            OutlinedButton(onClick = {
                // R10-3: business name, brand / legal line, phone, FSSAI, validity and terms; tax only when GST is on.
                val b = business
                val header = buildList {
                    add(b?.name?.ifBlank { null } ?: "Suseela Caterings")
                    val issuer = currentQuotation.issuerLine.ifBlank { b?.issuerLine ?: "" }
                    if (issuer.isNotBlank()) add(issuer)
                    b?.address?.takeIf { it.isNotBlank() }?.let { add(it) }
                    add("Phone: ${b?.phone ?: com.example.suseelacateringcrm.data.model.DEFAULT_BUSINESS_PHONE}" +
                        (b?.fssaiNumber?.takeIf { it.isNotBlank() }?.let { "  FSSAI: $it" } ?: ""))
                }
                val showTax = (b?.gstRegistered == true) && currentQuotation.gstRate > 0
                val lines = buildList {
                    add("QUOTATION")
                    add("Date: ${DateUtils.formatDate(currentQuotation.issueDate)}")
                    add("Valid until: ${DateUtils.formatDate(currentQuotation.validUntil)}")
                    add("")
                    currentQuotation.lineItems.forEach {
                        add("${it.description}: ${it.quantity.toInt()} x ${CurrencyUtils.formatInr(it.unitPrice)} = ${CurrencyUtils.formatInr(it.amount)}")
                    }
                    add("")
                    add("Subtotal: ${CurrencyUtils.formatInr(currentQuotation.subtotal)}")
                    if (currentQuotation.discount > 0) add("Discount: -${CurrencyUtils.formatInr(currentQuotation.discount)}")
                    if (showTax) {
                        add("GST @ ${currentQuotation.gstRate}%")
                        if (currentQuotation.isInterState) {
                            add("IGST: ${CurrencyUtils.formatInr(currentQuotation.igstAmount)}")
                        } else {
                            add("CGST: ${CurrencyUtils.formatInr(currentQuotation.cgstAmount)}")
                            add("SGST: ${CurrencyUtils.formatInr(currentQuotation.sgstAmount)}")
                        }
                    }
                    add("Total: ${CurrencyUtils.formatInr(currentQuotation.totalAmount)}")
                    if (currentQuotation.notes.isNotBlank()) { add(""); currentQuotation.notes.lines().forEach { add(it) } }
                    add("")
                    add("Terms:")
                    add("• This quotation is valid until ${DateUtils.formatDate(currentQuotation.validUntil)}.")
                    b?.terms?.takeIf { it.isNotBlank() }?.lines()?.forEach { add(it) }
                }
                PdfGenerator.generateAndShare(
                    context = context,
                    fileName = "${currentQuotation.quotationNumber.ifBlank { "quotation" }}.pdf",
                    title = currentQuotation.quotationNumber,
                    lines = lines,
                    header = header,
                    footer = "Thank you — ${b?.name?.ifBlank { null } ?: "Suseela Caterings"}",
                )
            }) {
                Text(L("PDF పంపు", "Export PDF"))
            }
        }
        // R7-10: saved versions and the one the customer accepted.
        QuotationVersionsCard(currentQuotation.id)
        // Change history (owner only).
        if (viewModel.role == com.example.suseelacateringcrm.data.model.UserRole.ADMIN) {
            com.example.suseelacateringcrm.ui.history.HistorySection("quotations", currentQuotation.id)
        }
    }
}
