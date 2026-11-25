package com.example.suseelacateringcrm.ui.packed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.ui.components.ChoiceChips
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.snapshotsFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch

/** `packedProducts/{id}` (Module 2f) — the part the phone shows. Products are created and labels printed on the web. */
data class PackedProduct(
    val id: String = "",
    val nameTe: String = "",
    val nameEn: String = "",
    val netQty: Double = 0.0,
    val netUnit: String = "",
    val mrp: Double = 0.0,
    val shelfLifeDays: Int = 0,
    val active: Boolean = true,
    val branchId: String = "",
    val inventoryItemId: String = "",
    val lastPackedDay: String = "",
) {
    val name: String get() = L(nameTe.ifBlank { nameEn }, nameEn.ifBlank { nameTe })
}

/** Same list as the server (functions/src/packed/packRules.ts SALE_METHODS). */
private val SALE_METHODS = listOf("Cash", "UPI", "Card", "Bank", "Credit")

class PackedProductsViewModel : ViewModel() {
    var products by mutableStateOf<List<PackedProduct>>(emptyList())
        private set
    var stock by mutableStateOf<Map<String, InventoryItem>>(emptyMap())
        private set
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
        private set

    init {
        viewModelScope.launch {
            ServiceLocator.firestore.collection("packedProducts").snapshotsFlow()
                .catch { e -> error = L("ప్యాక్ ఉత్పత్తులు లోడ్ కాలేదు", "Could not load packed products") + ": ${e.message}"; loading = false }
                .collect { snap ->
                    products = snap.documents.map { d ->
                        PackedProduct(
                            id = d.id,
                            nameTe = d.getString("nameTe") ?: "",
                            nameEn = d.getString("nameEn") ?: "",
                            netQty = (d.get("netQty") as? Number)?.toDouble() ?: 0.0,
                            netUnit = d.getString("netUnit") ?: "",
                            mrp = (d.get("mrp") as? Number)?.toDouble() ?: 0.0,
                            shelfLifeDays = (d.get("shelfLifeDays") as? Number)?.toInt() ?: 0,
                            active = d.getBoolean("active") != false,
                            branchId = d.getString("branchId") ?: "",
                            inventoryItemId = d.getString("inventoryItemId") ?: "",
                            lastPackedDay = d.getString("lastPackedDay") ?: "",
                        )
                    }.filter { it.active }.sortedBy { it.name.lowercase() }
                    loading = false
                }
        }
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId
                .flatMapLatest { branchId -> ServiceLocator.inventoryRepository.inventoryFlow(branchId) }
                .catch { }
                .collect { items -> stock = items.associateBy { it.id } }
        }
    }

    /** Packs that can be sold now: stock minus packs past their date. */
    fun canSell(p: PackedProduct): Int {
        val item = stock[p.inventoryItemId] ?: return 0
        return maxOf(0.0, item.quantityInStock - item.expiredQty).toInt()
    }

    fun pack(p: PackedProduct, packs: Int) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            message = ServiceLocator.functions.call("recordPacking", mapOf("productId" to p.id, "packs" to packs)).fold(
                onSuccess = { r ->
                    L(
                        "$packs ప్యాక్‌లు నిల్వలో కలిశాయి. బ్యాచ్ ${r["batchNo"] ?: ""}, గడువు ${DayKey.display(r["expiryDay"]?.toString() ?: "")}.",
                        "$packs packs added to stock. Batch ${r["batchNo"] ?: ""}, expiry ${DayKey.display(r["expiryDay"]?.toString() ?: "")}.",
                    )
                },
                onFailure = { CallableError.from(it).text },
            )
            busy = false
        }
    }

    fun sell(p: PackedProduct, packs: Int, pricePerPack: Double, method: String, customerName: String) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            message = ServiceLocator.functions.call(
                "sellPacked",
                mapOf(
                    "productId" to p.id,
                    "packs" to packs,
                    "pricePerPack" to pricePerPack,
                    "method" to method,
                    "customerName" to customerName.trim().ifBlank { null },
                ),
            ).fold(
                onSuccess = { r ->
                    val amount = (r["amount"] as? Number)?.toDouble() ?: 0.0
                    L("అమ్మకం నమోదైంది: బిల్ ${r["saleNumber"] ?: ""}, ${rupees(amount)}.", "Sale recorded: bill ${r["saleNumber"] ?: ""}, ${rupees(amount)}.")
                },
                onFailure = { CallableError.from(it).text },
            )
            busy = false
        }
    }
}

@Composable
fun PackedProductsScreen(padding: PaddingValues, viewModel: PackedProductsViewModel = viewModel()) {
    var packing by remember { mutableStateOf<PackedProduct?>(null) }
    var selling by remember { mutableStateOf<PackedProduct?>(null) }
    Column(Modifier.padding(padding).fillMaxSize()) {
        viewModel.error?.let { NoticeBox(it, Tone.BAD, Modifier.padding(16.dp)) }
        viewModel.message?.let { NoticeBox(it, Tone.INFO, Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) }
        if (!viewModel.loading && viewModel.products.isEmpty() && viewModel.error == null) {
            EmptyState(L("ప్యాక్ ఉత్పత్తులు లేవు. కొత్త ఉత్పత్తి web లో చేర్చండి.", "No packed products. Add a product on the web."))
        }
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(viewModel.products, key = { it.id }) { p ->
                val canSell = viewModel.canSell(p)
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(p.name, style = MaterialTheme.typography.titleMedium)
                        Text("${p.netQty} ${p.netUnit} · MRP ${rupees(p.mrp)}", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            L("అమ్మదగ్గవి: $canSell ప్యాక్‌లు", "Can be sold: $canSell packs") +
                                (if (p.lastPackedDay.isBlank()) "" else " · " + L("చివరి ప్యాకింగ్ ", "Last packed ") + DayKey.display(p.lastPackedDay)),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { viewModel.message = null; packing = p }, enabled = !viewModel.busy) { Text(L("ప్యాక్ చేశాం", "Packed")) }
                            OutlinedButton(onClick = { viewModel.message = null; selling = p }, enabled = !viewModel.busy && canSell > 0) { Text(L("అమ్ము", "Sell")) }
                        }
                    }
                }
            }
        }
    }
    packing?.let { p ->
        var packsText by remember(p.id) { mutableStateOf("") }
        val n = packsText.toIntOrNull()
        AlertDialog(
            onDismissRequest = { packing = null },
            title = { Text(L("ప్యాకింగ్: ${p.name}", "Packing: ${p.name}")) },
            text = {
                Column {
                    AppTextField(packsText, { packsText = it.filter(Char::isDigit) }, L("ఎన్ని ప్యాక్‌లు", "How many packs"), keyboardType = KeyboardType.Number)
                    Text(
                        L("గడువు తేదీ ఆటోమేటిక్: ప్యాక్ చేసిన రోజు + ${p.shelfLifeDays} రోజులు.", "The expiry date is worked out for you: packing day + ${p.shelfLifeDays} days."),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { if (n != null && n >= 1) { viewModel.pack(p, n); packing = null } }, enabled = n != null && n >= 1) { Text(L("నిల్వలో కలుపు", "Add to stock")) }
            },
            dismissButton = { TextButton(onClick = { packing = null }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
    selling?.let { p ->
        val canSell = viewModel.canSell(p)
        var packsText by remember(p.id) { mutableStateOf("1") }
        var priceText by remember(p.id) { mutableStateOf(if (p.mrp % 1.0 == 0.0) p.mrp.toInt().toString() else p.mrp.toString()) }
        var method by remember(p.id) { mutableStateOf("Cash") }
        var customer by remember(p.id) { mutableStateOf("") }
        val n = packsText.toIntOrNull()
        val price = priceText.toDoubleOrNull()
        val overMrp = price != null && price > p.mrp
        val valid = n != null && n >= 1 && n <= canSell && price != null && price > 0 && !overMrp && (method != "Credit" || customer.isNotBlank())
        AlertDialog(
            onDismissRequest = { selling = null },
            title = { Text(L("అమ్మకం: ${p.name}", "Sell: ${p.name}")) },
            text = {
                Column {
                    AppTextField(packsText, { packsText = it.filter(Char::isDigit) }, L("ఎన్ని ప్యాక్‌లు (గరిష్ఠం $canSell)", "How many packs (max $canSell)"), keyboardType = KeyboardType.Number)
                    AppTextField(priceText, { priceText = it }, L("ఒక ప్యాక్ ధర ₹ (MRP ${rupees(p.mrp)} మించకూడదు)", "Price per pack ₹ (not above MRP ${rupees(p.mrp)})"), keyboardType = KeyboardType.Decimal, isError = overMrp)
                    ChoiceChips(SALE_METHODS, method, { if (it == "Credit") L("అప్పు (Credit)", "Credit") else it }, { method = it })
                    AppTextField(customer, { customer = it }, if (method == "Credit") L("కస్టమర్ పేరు (తప్పనిసరి)", "Customer name (required)") else L("కస్టమర్ పేరు (ఐచ్ఛికం)", "Customer name (optional)"))
                    if (n != null && price != null && valid) Text(L("మొత్తం ${rupees(n * price)}", "Total ${rupees(n * price)}"), style = MaterialTheme.typography.titleSmall)
                }
            },
            confirmButton = {
                TextButton(onClick = { if (valid && n != null && price != null) { viewModel.sell(p, n, price, method, customer); selling = null } }, enabled = valid) { Text(L("అమ్మకం నమోదు చేయి", "Record sale")) }
            },
            dismissButton = { TextButton(onClick = { selling = null }) { Text(L("వద్దు", "Cancel")) } },
        )
    }
}
