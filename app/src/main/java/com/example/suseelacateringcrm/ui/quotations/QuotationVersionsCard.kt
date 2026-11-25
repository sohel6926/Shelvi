package com.example.suseelacateringcrm.ui.quotations

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.InvoiceLineItem
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.catchLogged
import com.example.suseelacateringcrm.util.rDate
import com.example.suseelacateringcrm.util.rInt
import com.example.suseelacateringcrm.util.rMap
import com.example.suseelacateringcrm.util.rMapList
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rNumOrNull
import com.example.suseelacateringcrm.util.rStr
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.example.suseelacateringcrm.util.tr
import kotlinx.coroutines.launch
import java.util.Date

/** One saved version of a quotation (quotations/{id}/versions/{n}, server-written). */
data class QuotationVersion(
    val n: Int,
    val savedAt: Date?,
    val status: String,
    val total: Double,
    val lines: List<InvoiceLineItem>,
    val notes: String,
) {
    companion object {
        fun fromMap(id: String, m: Map<String, Any?>): QuotationVersion {
            val totals = m.rMap("totals")
            return QuotationVersion(
                n = m.rInt("version").takeIf { it > 0 } ?: id.toIntOrNull() ?: 0,
                savedAt = m.rDate("savedAt") ?: m.rDate("updatedAt") ?: m.rDate("createdAt"),
                status = m.rStr("status"),
                total = m.rNumOrNull("totalAmount") ?: totals.rNum("total").takeIf { it > 0 } ?: totals.rNum("grandTotal"),
                lines = m.rMapList("lineItems").map { InvoiceLineItem.fromMap(it) },
                notes = m.rStr("notes"),
            )
        }
    }
}

class QuotationVersionsViewModel(quotationId: String) : ViewModel() {
    var versions by mutableStateOf<List<QuotationVersion>>(emptyList())
        private set
    var current by mutableStateOf(0)
        private set
    var accepted by mutableStateOf(0)
        private set

    init {
        val doc = ServiceLocator.firestore.collection(FirestoreCollections.QUOTATIONS).document(quotationId)
        viewModelScope.launch {
            doc.snapshotsFlow().catchLogged("QuotationVersionsVM").collect { s ->
                val m = s.data ?: emptyMap()
                current = m.rInt("version")
                accepted = m.rInt("acceptedVersion")
            }
        }
        viewModelScope.launch {
            doc.collection("versions").snapshotsFlow().catchLogged("QuotationVersionsVM").collect { q ->
                versions = q.documents.map { QuotationVersion.fromMap(it.id, it.data ?: emptyMap()) }.sortedByDescending { it.n }
            }
        }
    }
}

/** R7-10: list of saved versions, view any one, and which one the customer accepted. */
@Composable
fun QuotationVersionsCard(quotationId: String) {
    val vm: QuotationVersionsViewModel = viewModel(
        key = "quotation-versions-$quotationId",
        factory = viewModelFactory { initializer { QuotationVersionsViewModel(quotationId) } },
    )
    if (vm.versions.isEmpty() && vm.current <= 1) return
    var viewing by remember { mutableStateOf<QuotationVersion?>(null) }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.info).padding(16.dp)) {
        Text(L("కొటేషన్ వెర్షన్లు", "Quotation versions"), style = MaterialTheme.typography.titleMedium)
        if (vm.current > 0) Text(L("ఇప్పుడున్నది: వెర్షన్ ${vm.current}", "Current: version ${vm.current}"), style = MaterialTheme.typography.bodySmall)
        Text(
            L("పంపిన / ఒప్పుకున్న కొటేషన్ మార్చితే పాతది ఇక్కడ దాచి, కొత్త వెర్షన్ Draft గా మొదలవుతుంది.",
                "Editing a sent / accepted quotation keeps the old one here and starts a new Draft version."),
            style = MaterialTheme.typography.bodySmall,
        )
        if (vm.accepted > 0) Text(
            L("customer ఒప్పుకున్నది: వెర్షన్ ${vm.accepted} ✓", "Customer accepted: version ${vm.accepted} ✓"),
            color = SuseelaTheme.colors.good, fontWeight = FontWeight.SemiBold,
        )
        vm.versions.forEach { v ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    L("వెర్షన్ ${v.n}", "Version ${v.n}") + " · ${DateUtils.formatDate(v.savedAt)} · ${CurrencyUtils.formatInr(v.total)}" +
                        (if (v.status.isNotBlank()) " · ${tr(v.status)}" else "") + if (v.n == vm.accepted) " ✓" else "",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium,
                )
                TextButton(onClick = { viewing = v }) { Text(L("చూడు", "View")) }
            }
        }
    }
    viewing?.let { v ->
        AlertDialog(
            onDismissRequest = { viewing = null },
            title = { Text(L("వెర్షన్ ${v.n}", "Version ${v.n}") + if (v.n == vm.accepted) L(" — customer ఒప్పుకున్నది", " — accepted by the customer") else "") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(DateUtils.formatDateTime(v.savedAt), style = MaterialTheme.typography.bodySmall)
                    v.lines.forEach { li ->
                        Text("${li.description}: ${li.quantity} × ${CurrencyUtils.formatInr(li.unitPrice)} = ${CurrencyUtils.formatInr(li.amount)}")
                    }
                    Text(L("మొత్తం: ${CurrencyUtils.formatInr(v.total)}", "Total: ${CurrencyUtils.formatInr(v.total)}"), fontWeight = FontWeight.SemiBold)
                    if (v.notes.isNotBlank()) Text(v.notes, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton(onClick = { viewing = null }) { Text(L("సరే", "OK")) } },
        )
    }
}
