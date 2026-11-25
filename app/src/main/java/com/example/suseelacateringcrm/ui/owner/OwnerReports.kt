package com.example.suseelacateringcrm.ui.owner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.messageText
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.bookings.cancelReasonLabel
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.snapshotsFlow
import kotlinx.coroutines.launch

private fun Map<*, *>.n(k: String): Double = (this[k] as? Number)?.toDouble() ?: 0.0
private fun Map<*, *>.s(k: String): String = this[k]?.toString() ?: ""
private fun Map<*, *>.m(k: String): Map<*, *> = this[k] as? Map<*, *> ?: emptyMap<String, Any?>()
private fun Map<*, *>.l(k: String): List<Map<*, *>> = (this[k] as? List<*>)?.mapNotNull { it as? Map<*, *> } ?: emptyList()
private fun inr(v: Double) = CurrencyUtils.formatInr(v)

/** R10-10: owner views — P&L (getPnl), cancellations (getCancellationReport), year targets (targets/{year}). */
class OwnerReportsViewModel : ViewModel() {
    private val fn = ServiceLocator.functions
    var tab by mutableStateOf(0)
    var period by mutableStateOf("month")
        private set
    var month by mutableStateOf(DayKey.thisMonth())
        private set
    var year by mutableStateOf(DayKey.thisMonth().take(4).toInt())
        private set
    var pnl by mutableStateOf<UiState<Map<String, Any?>>>(UiState.Loading)
        private set
    var cancels by mutableStateOf<UiState<Map<String, Any?>>>(UiState.Loading)
        private set
    var target by mutableStateOf<Map<String, Any?>?>(null)
        private set

    init {
        loadPnl()
        loadCancels()
        viewModelScope.launch {
            ServiceLocator.firestore.collection("targets").document(year.toString()).snapshotsFlow()
                .catchLogged("OwnerReportsVM").collect { target = it.data }
        }
    }

    fun pickPeriod(p: String) { period = p; loadPnl() }
    fun shiftMonth(d: Int) { month = DayKey.shiftMonth(month, d); loadCancels() }

    fun loadPnl() {
        viewModelScope.launch {
            pnl = UiState.Loading
            pnl = fn.call("getPnl", mapOf("period" to period)).fold({ UiState.Success(it) }, { UiState.Error(CallableError.from(it).text) })
        }
    }

    fun loadCancels() {
        viewModelScope.launch {
            cancels = UiState.Loading
            cancels = fn.call("getCancellationReport", mapOf("month" to month, "branchId" to ServiceLocator.branchManager.currentBranchId.value))
                .fold({ UiState.Success(it) }, { UiState.Error(CallableError.from(it).text) })
        }
    }

    suspend fun refresh() { loadPnl(); loadCancels() }
}

@Composable
fun OwnerReportsScreen(padding: PaddingValues) {
    val vm: OwnerReportsViewModel = viewModel()
    OnRefresh { vm.refresh() }
    Column(Modifier.padding(padding).fillMaxSize()) {
        TabRow(selectedTabIndex = vm.tab) {
            listOf(L("లాభ నష్టాలు", "P&L"), L("రద్దులు", "Cancellations"), L("సంవత్సర లక్ష్యం", "Year target")).forEachIndexed { i, t ->
                Tab(selected = vm.tab == i, onClick = { vm.tab = i }, text = { Text(t) })
            }
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (vm.tab) {
                0 -> PnlTab(vm)
                1 -> CancellationsTab(vm)
                else -> YearTargetTab(vm)
            }
        }
    }
}

@Composable
private fun Line(label: String, value: Double, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, Modifier.weight(1f))
        Text(inr(value), fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PnlTab(vm: OwnerReportsViewModel) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf("day" to L("ఈ రోజు", "Today"), "week" to L("ఈ వారం", "Week"), "month" to L("ఈ నెల", "Month"),
            "3m" to L("3 నెలలు", "3 months"), "6m" to L("6 నెలలు", "6 months"), "12m" to L("12 నెలలు", "12 months")).forEach { (p, t) ->
            FilterChip(selected = vm.period == p, onClick = { vm.pickPeriod(p) }, label = { Text(t) })
        }
    }
    when (val s = vm.pnl) {
        is UiState.Loading -> LoadingIndicator()
        is UiState.Error -> NoticeBox(s.message, Tone.BAD)
        is UiState.Success -> {
            val r = s.data
            Column(Modifier.fillMaxWidth().padding(top = 8.dp).kpiCard(if (r.n("profit") >= 0) SuseelaTheme.colors.good else SuseelaTheme.colors.bad).padding(12.dp)) {
                Line(L("మొత్తం ఆదాయం", "Income"), r.n("income"), true)
                Line(L("  కార్యక్రమాల ఆదాయం", "  Event revenue"), r.n("eventRevenue"))
                Line(L("  రద్దు చార్జీ", "  Cancellation charges"), r.n("cancellationCharges"))
                Line(L("సరుకులు", "Food"), r.n("food"))
                Line(L("జీతాలు / కూలీ", "Labour"), r.n("labour"))
                Line(L("ఇతర ఖర్చులు", "Other"), r.n("other"))
                Line(L("ప్రకటనలు", "Ads"), r.n("ads"))
                if (r.n("cancelLoss") > 0) Line(L("రద్దైన event ఖర్చు", "Cost of cancelled events"), r.n("cancelLoss"))
                Line(L("లాభం", "Profit"), r.n("profit"), true)
                Text(L("మార్జిన్ ${"%.1f".format(r.n("marginPct"))}%", "Margin ${"%.1f".format(r.n("marginPct"))}%"))
                (r["primeCost"] as? Number)?.let { Text(L("సరుకులు + జీతాలు: ${"%.1f".format(it.toDouble())}% ఆదాయంలో", "Prime cost: ${"%.1f".format(it.toDouble())}% of income")) }
                Line(L("బ్రేక్-ఈవెన్", "Break-even"), r.n("breakEven"))
                Line(L("వసూలైనది", "Collected"), r.n("collected"))
            }
            val centres = r.m("overheadByCentre")
            if (centres.isNotEmpty()) {
                Text(L("సాధారణ ఖర్చులు (విభాగం వారీగా)", "Overhead by centre"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                centres.forEach { (k, v) -> Line(com.example.suseelacateringcrm.data.model.CostTarget.centreLabel(k.toString()), (v as? Number)?.toDouble() ?: 0.0) }
            }
            val leaks = r.l("leaks")
            if (leaks.isNotEmpty()) {
                Text(L("డబ్బు ఎక్కడ పోతోంది", "Where money leaks"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                leaks.forEach { k -> Text("• " + L(k.s("te"), k.s("en")) + " (${inr(k.n("amount"))})", color = SuseelaTheme.colors.bad) }
            }
            val series = r.l("series")
            if (series.isNotEmpty()) {
                Text(L("వారీగా", "By period"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                series.forEach { p ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(p.s("label"), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        Text(inr(p.n("income")) + " / " + inr(p.n("profit")), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun CancellationsTab(vm: OwnerReportsViewModel) {
    Row {
        TextButton(onClick = { vm.shiftMonth(-1) }) { Text("‹") }
        Text(vm.month, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
        TextButton(onClick = { vm.shiftMonth(1) }) { Text("›") }
    }
    when (val s = vm.cancels) {
        is UiState.Loading -> LoadingIndicator()
        is UiState.Error -> NoticeBox(s.message, Tone.BAD)
        is UiState.Success -> {
            val r = s.data
            NoticeBox(messageText(r["card"]), Tone.INFO)
            if (r.n("lossOnCancelled") > 0) Text(L("రద్దైన event లపై ఖర్చు: ${inr(r.n("lossOnCancelled"))}", "Spent on cancelled events: ${inr(r.n("lossOnCancelled"))}"), color = SuseelaTheme.colors.bad)
            val reasons = r.l("reasons")
            if (reasons.isNotEmpty()) {
                Text(L("కారణాలు", "Reasons"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                reasons.forEach { x ->
                    Text("• " + L(x.s("te").ifBlank { cancelReasonLabel(x.s("code")) }, cancelReasonLabel(x.s("code"))) + ": " + (x["count"] as? Number)?.toInt())
                }
            }
            val list = r.l("bookings")
            if (list.isNotEmpty()) Text(L("రద్దైన ఆర్డర్లు", "Cancelled orders"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            list.forEach { b ->
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).kpiCard(SuseelaTheme.colors.bad).padding(10.dp)) {
                    Text(b.s("customer") + " · " + DayKey.display(b.s("eventDay")), fontWeight = FontWeight.SemiBold)
                    Text(cancelReasonLabel(b.s("reasonCode")) + (if (b.s("reason").isNotBlank()) " — " + b.s("reason") else ""), style = MaterialTheme.typography.bodySmall)
                    Text(
                        L("రద్దు: ${DayKey.display(b.s("cancelledDay"))} · ${b.s("by")} · తిరిగి ${inr(b.n("refund"))} · ఉంచుకున్నది ${inr(b.n("charge"))}",
                            "Cancelled ${DayKey.display(b.s("cancelledDay"))} · ${b.s("by")} · refunded ${inr(b.n("refund"))} · kept ${inr(b.n("charge"))}"),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun YearTargetTab(vm: OwnerReportsViewModel) {
    val t = vm.target
    if (t == null || t.n("yearTarget") <= 0) {
        NoticeBox(L("${vm.year} సంవత్సర లక్ష్యం ఇంకా పెట్టలేదు — లక్ష్యాల బోర్డులో పెట్టండి.", "No ${vm.year} target yet — set it on the Target Board."), Tone.INFO)
        return
    }
    Column(Modifier.fillMaxWidth().kpiCard(SuseelaTheme.colors.gold).padding(12.dp)) {
        Line(L("${vm.year} లక్ష్యం", "${vm.year} target"), t.n("yearTarget"), true)
        Line(L("లాభం లక్ష్యం", "Profit target"), t.n("profitTarget"))
        val ab = t.n("aheadOrBehind")
        Text(
            if (ab >= 0) L("ముందున్నాం: ${inr(ab)}", "Ahead by ${inr(ab)}") else L("వెనకబడ్డాం: ${inr(-ab)}", "Behind by ${inr(-ab)}"),
            color = if (ab >= 0) SuseelaTheme.colors.good else SuseelaTheme.colors.bad, fontWeight = FontWeight.SemiBold,
        )
    }
    val monthsTe = listOf("జన", "ఫిబ్ర", "మార్చి", "ఏప్రి", "మే", "జూన్", "జులై", "ఆగ", "సెప్టె", "అక్టో", "నవం", "డిసెం")
    val monthsEn = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    Text(L("నెల వారీగా (అసలు / సవరించిన లక్ష్యం)", "By month (original / revised)"), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
    t.l("months").forEachIndexed { i, m ->
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Text(L(monthsTe.getOrElse(i) { "" }, monthsEn.getOrElse(i) { "" }), Modifier.weight(0.25f))
            Text(inr(m.n("original")), Modifier.weight(0.35f), style = MaterialTheme.typography.bodySmall)
            Text(
                inr(m.n("revised")) + if (m["isActual"] == true) L(" (అసలు)", " (actual)") else "",
                Modifier.weight(0.4f), style = MaterialTheme.typography.bodySmall,
                fontWeight = if (m["isActual"] == true) FontWeight.SemiBold else FontWeight.Normal,
            )
        }
    }
}

/** Dashboard card (owner): "ఈ నెల రద్దులు: N, తిరిగి ఇచ్చింది ₹A, ఉంచుకున్నది ₹B" from getCancellationReport. */
@Composable
fun CancellationsCard(onOpen: () -> Unit) {
    val state = androidx.compose.runtime.remember { mutableStateOf("") }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        state.value = ServiceLocator.functions.call("getCancellationReport", mapOf("month" to DayKey.thisMonth()))
            .fold({ messageText(it["card"]) }, { "" })
    }
    if (state.value.isBlank()) return
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp).kpiCard(SuseelaTheme.colors.bad).padding(12.dp)) {
        Text(state.value)
        TextButton(onClick = onOpen) { Text(L("రిపోర్ట్ చూడు", "Open report")) }
    }
}
