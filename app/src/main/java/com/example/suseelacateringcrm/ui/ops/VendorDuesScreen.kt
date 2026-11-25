package com.example.suseelacateringcrm.ui.ops

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.VendorBill
import com.example.suseelacateringcrm.data.remote.VendorDue
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppDatePickerField
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.SimplePickerField
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.numOrNull
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh
import com.example.suseelacateringcrm.util.UiState
import com.example.suseelacateringcrm.util.tr
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rDay
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr

class VendorDuesViewModel : ViewModel() {
    var state by mutableStateOf<UiState<List<VendorDue>>>(UiState.Loading)
        private set
    var message by mutableStateOf<Pair<String, Boolean>?>(null)
    var busy by mutableStateOf(false)
        private set
    val isOwner: Boolean get() = ServiceLocator.currentRole() == UserRole.ADMIN

    init { load() }

    fun load() {
        viewModelScope.launch {
            state = ServiceLocator.functions.getVendorDues().fold(
                onSuccess = { list -> UiState.Success(list.sortedByDescending { it.outstanding }) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }

    suspend fun reload() {
        state = ServiceLocator.functions.getVendorDues().fold(
            onSuccess = { list -> UiState.Success(list.sortedByDescending { it.outstanding }) },
            onFailure = { UiState.Error(CallableError.from(it).text) },
        )
    }

    /** Open bills of each vendor (getVendorDues only gives counts), keyed by vendorId or name. */
    val bills = androidx.compose.runtime.mutableStateMapOf<String, List<VendorBill>>()

    /**
     * Reads the vendor's open bills to allocate a payment. Same selection and vendor key as the server's
     * getVendorDues / vendorKeyOf: purchases and expenses whose paymentStatus is still open, delivered outside
     * orders; key = vendorId, else "name:" + (purchases: vendorNameSnapshot || vendorName,
     * expenses: vendorName || personName, outside orders: vendorName) trimmed + lowercased.
     * Amounts are the server-derived `balance` / `amountDue` (no client maths).
     */
    fun loadBills(due: VendorDue) {
        val key = dueKey(due)
        if (bills.containsKey(key)) return
        viewModelScope.launch {
            try {
                val db = ServiceLocator.firestore
                val open = listOf("Unpaid", "PartiallyPaid", "Pending", "Partial", "Partially Paid", "Advance Paid", "Credit", "")
                val p = db.collection("purchases").whereIn("paymentStatus", open).get().await()
                val e = db.collection("expenses").whereIn("paymentStatus", open).get().await()
                val o = db.collection("outsideOrders").whereEqualTo("status", "delivered").get().await()
                fun live(m: Map<String, Any?>) =
                    !m.rStr("status").equals("Cancelled", true) && !m.rBool("isDeleted") && !m.rBool("archived")
                /** Server balance; old docs not yet migrated have none → unpaid total (server re-checks on pay). */
                fun balanceOf(m: Map<String, Any?>) = m.rNumOrNull("balance") ?: (m.rNum("totalAmount") - m.rNum("paid"))
                val list = p.documents.mapNotNull { d ->
                    val m = d.data ?: return@mapNotNull null
                    if (!live(m) || vendorKey(m.rStr("vendorId"), m.rStr("vendorNameSnapshot").ifBlank { m.rStr("vendorName") }) != key) null
                    else VendorBill("purchases", d.id, m.rStr("purchaseNumber").ifBlank { m.rStr("billNumber") },
                        m.rDate("purchaseDate")?.let { DayKey.of(it) } ?: "", m.rNum("totalAmount"), m.rNum("paid"), balanceOf(m))
                } + e.documents.mapNotNull { d ->
                    val m = d.data ?: return@mapNotNull null
                    if (!live(m) || vendorKey(m.rStr("vendorId"), m.rStr("vendorName").ifBlank { m.rStr("personName") }) != key) null
                    else VendorBill("expenses", d.id, m.rStr("expenseNumber").ifBlank { m.rStr("section") },
                        (m.rDate("dueDate") ?: m.rDate("serviceDate"))?.let { DayKey.of(it) } ?: "", m.rNum("totalAmount"), m.rNum("paid"), balanceOf(m))
                } + o.documents.mapNotNull { d ->
                    val m = d.data ?: return@mapNotNull null
                    if (!live(m) || vendorKey(m.rStr("vendorId"), m.rStr("vendorName")) != key) null
                    else VendorBill("outsideOrders", d.id, m.rStr("item"), m.rDay("date"),
                        m.rNum("amountDue") + m.rNum("paid") + m.rNum("advancePaid"), m.rNum("paid") + m.rNum("advancePaid"), m.rNum("amountDue"))
                }
                bills[key] = list.filter { it.balance > 0.005 }.sortedBy { it.date }
            } catch (ex: Exception) {
                bills[key] = emptyList()
                message = com.example.suseelacateringcrm.util.errorText(ex) to true
            }
        }
    }

    fun pay(due: VendorDue, amount: Double, date: String, method: String, allocations: List<Triple<String, String, Double>>, note: String) {
        viewModelScope.launch {
            busy = true
            val r = ServiceLocator.functions.recordVendorPayment(due.vendorId, due.vendorName, amount, date, method, allocations, note)
            busy = false
            r.fold(
                onSuccess = {
                    message = L("చెల్లింపు నమోదు ✓", "Payment recorded ✓") to false
                    bills.remove(dueKey(due))
                    load()
                },
                onFailure = { message = CallableError.from(it).text to true },
            )
        }
    }
}

/** Split [amount] over the bills, oldest first (display of what the payment covers; the server derives paid / balance). */
private fun allocate(bills: List<VendorBill>, amount: Double): List<Triple<String, String, Double>> {
    var left = amount
    val out = mutableListOf<Triple<String, String, Double>>()
    bills.filter { it.balance > 0 }.sortedBy { it.date }.forEach { b ->
        if (left <= 0) return@forEach
        val take = minOf(left, b.balance)
        out += Triple(b.collection, b.id, Math.round(take * 100) / 100.0)
        left -= take
    }
    return out
}

/** Server vendorKeyOf: vendorId, else "name:" + trimmed lower-case name. */
private fun vendorKey(vendorId: String, name: String): String = vendorId.ifBlank { "name:" + name.trim().lowercase() }

private fun dueKey(d: VendorDue): String = vendorKey(d.vendorId, d.vendorName)

/** recordVendorPayment methods (server list). */
private val VENDOR_PAY_METHODS = listOf("Cash", "UPI", "BankTransfer", "Card", "Other")

private fun collectionLabel(c: String) = when (c) {
    "purchases" -> L("కొనుగోలు", "Purchase")
    "expenses" -> L("ఖర్చు", "Expense")
    "outsideOrders" -> L("బయట ఆర్డర్", "Outside order")
    else -> c
}

/** R7-8: what we owe each vendor (getVendorDues) and the owner's pay dialog (recordVendorPayment). */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun VendorDuesScreen(padding: PaddingValues) {
    val vm: VendorDuesViewModel = viewModel()
    OnRefresh { vm.reload() }
    var paying by remember { mutableStateOf<VendorDue?>(null) }
    var expanded by remember { mutableStateOf<String?>(null) }
    Column(Modifier.padding(padding).fillMaxSize()) {
        vm.message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD, Modifier.padding(horizontal = 16.dp)) }
        when (val s = vm.state) {
            is UiState.Loading -> LoadingIndicator()
            is UiState.Error -> {
                NoticeBox(s.message, Tone.BAD, Modifier.padding(16.dp))
                TextButton(onClick = { vm.load() }) { Text(L("మళ్ళీ ప్రయత్నించు", "Try again")) }
            }
            is UiState.Success -> {
                val list = s.data.filter { it.outstanding > 0 }
                val total = list.sumOf { it.outstanding }
                Text(
                    L("మొత్తం బాకీ: ${CurrencyUtils.formatInr(total)}", "Total owed: ${CurrencyUtils.formatInr(total)}"),
                    style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp),
                )
                if (list.isEmpty()) EmptyState(L("ఎవరికీ బాకీ లేదు ✓", "Nothing owed ✓"))
                LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp)) {
                    items(list, key = { it.vendorId.ifBlank { it.vendorName } }) { d ->
                        val key = dueKey(d)
                        Card(onClick = { expanded = if (expanded == key) null else key; vm.loadBills(d) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Column(Modifier.padding(12.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(d.vendorName, style = MaterialTheme.typography.titleSmall)
                                        Text(
                                            L("${d.billCount} బిల్లులు · ఇచ్చింది ${CurrencyUtils.formatInr(d.paid)}", "${d.billCount} bills · paid ${CurrencyUtils.formatInr(d.paid)}") +
                                                if (d.oldestDue.isNotBlank()) L(" · పాతది ${DayKey.display(d.oldestDue)}", " · oldest ${DayKey.display(d.oldestDue)}") else "",
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                    Text(CurrencyUtils.formatInr(d.outstanding), fontWeight = FontWeight.SemiBold, color = SuseelaTheme.colors.bad)
                                }
                                if (expanded == key) {
                                    vm.bills[key].orEmpty().filter { it.balance > 0 }.sortedBy { it.date }.forEach { b ->
                                        Text(
                                            "${DayKey.display(b.date)} · ${collectionLabel(b.collection)} ${b.label} · " +
                                                L("బాకీ ${CurrencyUtils.formatInr(b.balance)} / ${CurrencyUtils.formatInr(b.amount)}", "due ${CurrencyUtils.formatInr(b.balance)} of ${CurrencyUtils.formatInr(b.amount)}"),
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                }
                                if (vm.isOwner) Button(enabled = !vm.busy, onClick = { vm.loadBills(d); paying = d }) { Text(L("చెల్లించు", "Pay")) }
                            }
                        }
                    }
                }
            }
        }
    }
    paying?.let { d -> PayDialog(d, vm.bills[dueKey(d)].orEmpty(), onDismiss = { paying = null }) { amt, date, method, alloc, note -> vm.pay(d, amt, date, method, alloc, note); paying = null } }
}

@Composable
private fun PayDialog(
    due: VendorDue,
    openBills: List<VendorBill>,
    onDismiss: () -> Unit,
    onPay: (Double, String, String, List<Triple<String, String, Double>>, String) -> Unit,
) {
    var amount by remember { mutableStateOf(String.format(java.util.Locale.US, "%.2f", due.outstanding)) }
    var date by remember { mutableStateOf(DayKey.today()) }
    var method by remember { mutableStateOf(VENDOR_PAY_METHODS.first()) }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val amt = numOrNull(amount) ?: 0.0
    val alloc = remember(amt, openBills) { allocate(openBills, amt) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("చెల్లింపు: ${due.vendorName}", "Pay: ${due.vendorName}")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(L("బాకీ: ${CurrencyUtils.formatInr(due.outstanding)}", "Owed: ${CurrencyUtils.formatInr(due.outstanding)}"))
                AppTextField(amount, { amount = it }, L("ఎంత ఇస్తున్నారు (₹)", "Amount (₹)"), keyboardType = KeyboardType.Decimal)
                AppDatePickerField(L("తేదీ", "Date"), DayKey.parse(date), { date = DayKey.of(it) })
                SimplePickerField(VENDOR_PAY_METHODS, method, { tr(it) }, { method = it }, L("ఎలా", "Method"))
                AppTextField(note, { note = it }, L("గమనిక", "Note"))
                Text(L("ఈ బిల్లులకు (పాతవి ముందు):", "Covers these bills (oldest first):"), style = MaterialTheme.typography.bodySmall)
                alloc.forEach { (c, id, a) ->
                    val b = openBills.find { it.id == id && it.collection == c }
                    Text("• ${collectionLabel(c)} ${b?.label ?: ""} ${b?.date?.let { DayKey.display(it) } ?: ""} — ${CurrencyUtils.formatInr(a)}", style = MaterialTheme.typography.bodySmall)
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                error = when {
                    amt <= 0 -> L("మొత్తం 0 కంటే ఎక్కువ", "Amount must be more than 0")
                    amt > due.outstanding + 0.005 -> L("బాకీ కంటే ఎక్కువ ఇవ్వలేం", "Can't pay more than owed")
                    alloc.isEmpty() -> L("బిల్లులు లోడ్ అవుతున్నాయి — కాసేపాగి మళ్ళీ నొక్కండి", "Bills are loading — tap again in a moment")
                    else -> null
                }
                if (error == null) onPay(amt, date, method, alloc, note.trim())
            }) { Text(L("చెల్లించు", "Pay")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
