package com.example.suseelacateringcrm.ui.owner

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.customerStatement
import com.example.suseelacateringcrm.data.remote.markLunchBoxDelivered
import com.example.suseelacateringcrm.data.remote.messageText
import com.example.suseelacateringcrm.data.remote.suggestPackagePrice
import com.example.suseelacateringcrm.data.remote.vendorPriceComparison
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.fmtNum
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh
import com.example.suseelacateringcrm.util.PdfGenerator
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.snapshotsFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

private fun Map<*, *>.n(k: String): Double = (this[k] as? Number)?.toDouble() ?: 0.0
private fun Map<*, *>.nOrNull(k: String): Double? = (this[k] as? Number)?.toDouble()
private fun Map<*, *>.s(k: String): String = this[k]?.toString() ?: ""
private fun Map<*, *>.l(k: String): List<Map<*, *>> = (this[k] as? List<*>)?.mapNotNull { it as? Map<*, *> } ?: emptyList()
private fun inr(v: Double) = CurrencyUtils.formatInr(v)

private fun shareWhatsApp(context: android.content.Context, text: String) {
    val wa = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text); setPackage("com.whatsapp") }
    try {
        context.startActivity(wa)
    } catch (e: Exception) {
        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }, L("పంపు", "Share")))
    }
}

// ============================================================================ R10-4 suggested price (read only)

/** Menu package page (owner only — rule A2): plate cost, current price, margin band and the suggested price — all from the server. */
@Composable
fun SuggestedPriceCard(packageId: String) {
    // Owner rule A2: profit numbers are never shown to managers / staff, wherever this card is placed.
    if (ServiceLocator.currentRole() != com.example.suseelacateringcrm.data.model.UserRole.ADMIN) return
    var state by remember { mutableStateOf<UiState<Map<String, Any?>>?>(null) }
    val scope = rememberCoroutineScope()
    fun load() = scope.launch {
        state = UiState.Loading
        state = ServiceLocator.functions.suggestPackagePrice(packageId, null).fold({ UiState.Success(it) }, { UiState.Error(CallableError.from(it).text) })
    }
    OnRefresh { if (state != null) load() }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        when (val s = state) {
            null -> OutlinedButton(onClick = { load() }) { Text(L("సూచించిన ధర చూడు", "Show suggested price")) }
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> NoticeBox(s.message, Tone.BAD)
            is UiState.Success -> {
                val r = s.data
                val color = when (r.s("band")) { "red" -> SuseelaTheme.colors.bad; "amber" -> SuseelaTheme.colors.warning; "green" -> SuseelaTheme.colors.good; else -> SuseelaTheme.colors.neutral }
                Column(Modifier.fillMaxWidth().kpiCard(color).padding(12.dp)) {
                    Text(L("ధర లెక్క (100 మందికి)", "Price check (for 100 guests)"), style = MaterialTheme.typography.titleMedium)
                    Text(messageText(r["summary"]))
                    Row { Text(L("సరుకులు / ప్లేటు", "Food / plate"), Modifier.weight(1f)); Text(inr(r.n("foodPerPlate"))) }
                    Row { Text(L("కూలీ / ప్లేటు", "Labour / plate"), Modifier.weight(1f)); Text(inr(r.n("labourPerPlate"))) }
                    Row { Text(L("ఇతర / ప్లేటు", "Overhead / plate"), Modifier.weight(1f)); Text(inr(r.n("overheadPerPlate"))) }
                    Row { Text(L("ప్లేటు ఖర్చు", "Plate cost"), Modifier.weight(1f)); Text(r.nOrNull("plateCost")?.let { inr(it) } ?: L("తెలియదు (తెలిసిన భాగం ${inr(r.n("knownPlateCost"))})", "Unknown (known part ${inr(r.n("knownPlateCost"))})"), fontWeight = FontWeight.SemiBold) }
                    Row { Text(L("ఇప్పటి ధర", "Current price"), Modifier.weight(1f)); Text(inr(r.n("currentPrice"))) }
                    Row {
                        Text(L("లాభం", "Margin"), Modifier.weight(1f))
                        Text((r.nOrNull("marginPct")?.let { "%.1f".format(it) + "%" } ?: "-") + " · " + r.s("bandTe"), color = color, fontWeight = FontWeight.SemiBold)
                    }
                    Row {
                        Text(L("సూచించిన ధర (${fmtNum(r.n("targetMarginPct"))}% లాభం)", "Suggested (${fmtNum(r.n("targetMarginPct"))}% margin)"), Modifier.weight(1f))
                        Text(r.nOrNull("suggestedPrice")?.let { inr(it) } ?: "—", fontWeight = FontWeight.Bold)
                    }
                    r.l("ingredients").filter { it["cost"] != null }.take(12).forEach { i ->
                        Text("${L(i.s("nameTe").ifBlank { i.s("nameEn") }, i.s("nameEn").ifBlank { i.s("nameTe") })}: ${fmtNum(i.n("qty"))} × ${inr(i.n("rate"))} = ${inr(i.n("cost"))}",
                            style = MaterialTheme.typography.bodySmall)
                    }
                    r.l("warnings").forEach { w -> Text("• " + L(w.s("te"), w.s("en")), color = SuseelaTheme.colors.warning, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }
}

// ============================================================================ R10-6 vendor price comparison

class VendorRatesViewModel : ViewModel() {
    var state by mutableStateOf<UiState<List<Map<*, *>>>>(UiState.Loading)
        private set
    var search by mutableStateOf("")

    init { viewModelScope.launch { reload() } }

    suspend fun reload() {
        state = ServiceLocator.functions.vendorPriceComparison().fold({ UiState.Success(it.l("items")) }, { UiState.Error(CallableError.from(it).text) })
    }
}

/** R10-6 (A/M, read only): last rate per vendor for each item, cheapest first, change vs the previous rate. */
@Composable
fun VendorRatesScreen(padding: PaddingValues) {
    val vm: VendorRatesViewModel = viewModel()
    OnRefresh { vm.reload() }
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        AppTextField(vm.search, { vm.search = it }, L("సరుకు వెతుకు", "Search item"))
        when (val s = vm.state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> NoticeBox(s.message, Tone.BAD)
            is UiState.Success -> {
                val items = s.data.filter { vm.search.isBlank() || it.s("name").contains(vm.search, true) }
                if (items.isEmpty()) EmptyState(L("కొనుగోలు ధరలు లేవు.", "No purchase rates yet."))
                items.forEach { item ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(SuseelaTheme.colors.info).padding(10.dp)) {
                        Text("${item.s("name")} (${item.s("unit")})", fontWeight = FontWeight.SemiBold)
                        item.l("vendors").forEach { v ->
                            val change = v.nOrNull("changePct")
                            Row(Modifier.fillMaxWidth()) {
                                Text((if (v["cheapest"] == true) "✓ " else "  ") + v.s("vendorName"), Modifier.weight(1f),
                                    color = if (v["cheapest"] == true) SuseelaTheme.colors.good else MaterialTheme.colorScheme.onSurface)
                                Text(inr(v.n("lastRate")) + " · " + DayKey.display(v.s("lastDay")), style = MaterialTheme.typography.bodySmall)
                            }
                            if (change != null) Text(
                                "    " + (if (change > 0) "▲ " else if (change < 0) "▼ " else "") + "%.1f".format(change) + "%" +
                                    (v.nOrNull("previousRate")?.let { L(" (ముందు ${inr(it)})", " (was ${inr(it)})") } ?: ""),
                                style = MaterialTheme.typography.bodySmall,
                                color = if (change > 0) SuseelaTheme.colors.bad else SuseelaTheme.colors.good,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================ R10-7 customer statement

/** Customer page (A/M): customerStatement with running balance, PDF and WhatsApp share of the server text. */
@Composable
fun CustomerStatementButton(customerId: String) {
    var show by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { show = true }, modifier = Modifier.padding(top = 8.dp)) { Text(L("ఖాతా వివరం (statement)", "Account statement")) }
    if (show) CustomerStatementDialog(customerId) { show = false }
}

@Composable
private fun CustomerStatementDialog(customerId: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var from by remember { mutableStateOf("") }
    var to by remember { mutableStateOf("") }
    var state by remember { mutableStateOf<UiState<Map<String, Any?>>>(UiState.Loading) }
    LaunchedEffect(from, to) {
        state = UiState.Loading
        state = ServiceLocator.functions.customerStatement(customerId, from, to).fold({ UiState.Success(it) }, { UiState.Error(CallableError.from(it).text) })
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("ఖాతా వివరం", "Account statement")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                AppDatePickerField(L("నుంచి (ఐచ్ఛికం)", "From (optional)"), DayKey.parse(from), { from = DayKey.of(it) })
                AppDatePickerField(L("వరకు (ఐచ్ఛికం)", "To (optional)"), DayKey.parse(to), { to = DayKey.of(it) })
                when (val s = state) {
                    is UiState.Loading -> LoadingIndicator()
                    is UiState.Error -> NoticeBox(s.message, Tone.BAD)
                    is UiState.Success -> {
                        val r = s.data
                        Text(r.s("customerName"), fontWeight = FontWeight.SemiBold)
                        if (r.n("opening") != 0.0) Text(L("ముందు బాకీ: ${inr(r.n("opening"))}", "Opening: ${inr(r.n("opening"))}"))
                        r.l("lines").forEach { l ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 1.dp)) {
                                Text("${DayKey.display(l.s("day"))} ${L(l.s("te"), l.s("en"))}", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                                Text(inr(l.n("amount")), style = MaterialTheme.typography.bodySmall)
                                Text("  " + inr(l.n("balance")), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        Text(L("బిల్లులు ${inr(r.n("invoiced"))} · కట్టింది ${inr(r.n("paid"))}", "Billed ${inr(r.n("invoiced"))} · paid ${inr(r.n("paid"))}"))
                        Text(L("ఇప్పుడు బాకీ: ${inr(r.n("closing"))}", "Balance now: ${inr(r.n("closing"))}"), fontWeight = FontWeight.Bold,
                            color = if (r.n("closing") > 0) SuseelaTheme.colors.bad else SuseelaTheme.colors.good)
                    }
                }
            }
        },
        confirmButton = {
            val r = (state as? UiState.Success)?.data
            Row {
                TextButton(enabled = r != null, onClick = { r?.let { shareWhatsApp(context, it.s("whatsappText")) } }) { Text("WhatsApp") }
                TextButton(enabled = r != null, onClick = {
                    r ?: return@TextButton
                    val lines = buildList {
                        if (r.n("opening") != 0.0) add("Opening balance: ${inr(r.n("opening"))}")
                        r.l("lines").forEach { l -> add("${DayKey.display(l.s("day"))}  ${l.s("en")}  ${inr(l.n("amount"))}  bal ${inr(l.n("balance"))}") }
                        add("")
                        add("Billed: ${inr(r.n("invoiced"))}   Paid: ${inr(r.n("paid"))}")
                        add("Balance: ${inr(r.n("closing"))}")
                    }
                    PdfGenerator.generateAndShare(context, "statement_${r.s("customerName").ifBlank { customerId }}.pdf", "Statement — ${r.s("customerName")}", lines,
                        header = listOf("Suseela Caterings", "Phone: ${com.example.suseelacateringcrm.data.model.DEFAULT_BUSINESS_PHONE}"))
                }) { Text("PDF") }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("మూసు", "Close")) } },
    )
}

// ============================================================================ R10-12 lunch boxes (list + delivery tick)

data class LunchBoxRow(
    val id: String, val customer: String, val date: String, val days: List<String>, val startDate: String, val endDate: String,
    val count: Int, val address: String, val time: String, val status: String, val deliveries: Map<String, Int>,
) {
    /** Does this order deliver on [day] ("YYYY-MM-DD")? Same rule as the server: one date, or weekdays between start/end. */
    fun runsOn(day: String): Boolean {
        if (status != "active") return false
        if (date.isNotBlank()) return date == day
        if (startDate.isNotBlank() && day < startDate) return false
        if (endDate.isNotBlank() && day > endDate) return false
        val d = DayKey.parse(day) ?: return false
        val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Kolkata")).apply { time = d }
        val key = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")[cal.get(java.util.Calendar.DAY_OF_WEEK) - 1]
        return key in days
    }
}

class LunchBoxesViewModel : ViewModel() {
    var day by mutableStateOf(DayKey.today())
    var orders by mutableStateOf<List<LunchBoxRow>>(emptyList())
        private set
    var message by mutableStateOf<Pair<String, Boolean>?>(null)

    init {
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId.flatMapLatest { b ->
                val c = ServiceLocator.firestore.collection(FirestoreCollections.LUNCH_BOX_ORDERS)
                (if (b != null) c.whereEqualTo("branchId", b) else c).snapshotsFlow()
            }.catchLogged("LunchBoxesVM").collect { q ->
                orders = q.documents.map { d ->
                    val m = d.data ?: emptyMap<String, Any?>()
                    LunchBoxRow(
                        d.id, m.s("customerNameSnapshot"), m.s("date"),
                        (m["days"] as? List<*>)?.map { it.toString() } ?: emptyList(), m.s("startDate"), m.s("endDate"),
                        (m["count"] as? Number)?.toInt() ?: 0, m.s("deliveryAddress"), m.s("deliveryTime"), m.s("status").ifBlank { "active" },
                        (m["deliveries"] as? Map<*, *>)?.mapNotNull { (k, v) -> (v as? Number)?.let { k.toString() to it.toInt() } }?.toMap() ?: emptyMap(),
                    )
                }.sortedBy { it.time }
            }
        }
    }

    fun deliver(o: LunchBoxRow, count: Int) {
        viewModelScope.launch {
            message = ServiceLocator.functions.markLunchBoxDelivered(o.id, day, count)
                .fold({ L("ఇచ్చేశాం ✓ ${o.customer}: $count", "Delivered ✓ ${o.customer}: $count") to false }, { CallableError.from(it).text to true })
        }
    }
}

/** R10-12: the day's lunch box orders with a delivery tick (markLunchBoxDelivered). Orders are set up on the web. */
@Composable
fun LunchBoxesScreen(padding: PaddingValues) {
    val vm: LunchBoxesViewModel = viewModel()
    var partial by remember { mutableStateOf<LunchBoxRow?>(null) }
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(vm.day), { vm.day = DayKey.of(it) })
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD) }
        val today = vm.orders.filter { it.runsOn(vm.day) }
        val total = today.sumOf { it.count }
        Text(L("ఈ రోజు బాక్సులు: $total (${today.size} ఆర్డర్లు)", "Boxes today: $total (${today.size} orders)"), fontWeight = FontWeight.SemiBold)
        if (today.isEmpty()) EmptyState(L("ఈ రోజు లంచ్ బాక్సులు లేవు.", "No lunch boxes on this day."))
        today.forEach { o ->
            val delivered = o.deliveries[vm.day]
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(if (delivered != null) SuseelaTheme.colors.good else SuseelaTheme.colors.warning).padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // QA fix 10: TalkBack label for the delivery tick-box.
                    val tickLabel = L("ఇచ్చాం: ${o.customer}, ${o.count} బాక్సులు", "Delivered: ${o.customer}, ${o.count} boxes")
                    Checkbox(
                        checked = delivered != null,
                        onCheckedChange = { if (delivered == null) vm.deliver(o, o.count) },
                        modifier = Modifier.semantics { contentDescription = tickLabel },
                    )
                    Column(Modifier.weight(1f)) {
                        Text("${o.time} · ${o.customer} · ${o.count} " + L("బాక్సులు", "boxes"), fontWeight = FontWeight.SemiBold)
                        if (o.address.isNotBlank()) Text(o.address, style = MaterialTheme.typography.bodySmall)
                        if (delivered != null) Text(L("ఇచ్చింది: $delivered", "Delivered: $delivered"), color = SuseelaTheme.colors.good)
                    }
                    TextButton(onClick = { partial = o }) { Text(L("వేరే సంఖ్య", "Other count")) }
                }
            }
        }
    }
    partial?.let { o ->
        var text by remember { mutableStateOf(o.count.toString()) }
        AlertDialog(
            onDismissRequest = { partial = null },
            title = { Text(L("ఎన్ని బాక్సులు ఇచ్చారు?", "How many boxes delivered?")) },
            text = { AppTextField(text, { text = it.filter(Char::isDigit) }, L("బాక్సులు", "Boxes"), keyboardType = androidx.compose.ui.text.input.KeyboardType.Number) },
            confirmButton = { TextButton(onClick = { text.toIntOrNull()?.let { vm.deliver(o, it) }; partial = null }) { Text(L("సరే", "OK")) } },
            dismissButton = { TextButton(onClick = { partial = null }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}
