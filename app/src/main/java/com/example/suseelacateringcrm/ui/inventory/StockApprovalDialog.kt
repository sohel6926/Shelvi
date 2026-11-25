package com.example.suseelacateringcrm.ui.inventory

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.util.L
import kotlinx.coroutines.launch

/** One stock change that is waiting for the owner / manager (a big change made by store or staff). */
private data class PendingAdjust(
    val id: String,
    val itemName: String,
    val unit: String,
    val type: String,
    val quantity: Double,
    val qtyAtRequest: Double,
    val reason: String,
    val note: String,
    val requestedBy: String,
    val requestedByName: String,
)

/**
 * 20 Nov 2026 — phone screen for the stock changes waiting for approval (the web page has the same list). The server
 * decides for real (`decideStockAdjust`: nobody approves their own request unless owner; a manager must be allowed to);
 * this screen only shows the list and sends approve / reject. Compiled only; not yet tried on a phone.
 */
@Composable
fun StockApprovalDialog(role: UserRole?, branchId: String?, onDismiss: () -> Unit) {
    val rows = remember { mutableStateListOf<PendingAdjust>() }
    var loadError by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var busyId by remember { mutableStateOf("") }
    var rejectingId by remember { mutableStateOf("") }
    var rejectNote by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val myUid = ServiceLocator.authRepository.currentUid ?: ""

    DisposableEffect(role, branchId) {
        var reg: com.google.firebase.firestore.ListenerRegistration? = null
        rows.clear()
        loadError = null
        val col = ServiceLocator.firestore.collection("stockAdjustRequests")
        val q = when {
            role == UserRole.ADMIN && branchId.isNullOrBlank() -> col.whereEqualTo("status", "pending")
            !branchId.isNullOrBlank() -> col.whereEqualTo("branchId", branchId).whereEqualTo("status", "pending")
            else -> null
        }
        if (q == null) {
            loadError = L("శాఖ ఎంచుకోండి.", "Pick a branch first.")
        } else {
            reg = q.addSnapshotListener { snap, e ->
                if (e != null || snap == null) {
                    loadError = L("లోడ్ కాలేదు.", "Could not load.")
                    return@addSnapshotListener
                }
                rows.clear()
                rows.addAll(
                    snap.documents.map { d ->
                        PendingAdjust(
                            id = d.id,
                            itemName = d.getString("itemName") ?: "",
                            unit = d.getString("unit") ?: "",
                            type = if (d.getString("type") == "IN") "IN" else "OUT",
                            quantity = d.getDouble("quantity") ?: 0.0,
                            qtyAtRequest = d.getDouble("qtyAtRequest") ?: 0.0,
                            reason = d.getString("reason") ?: "",
                            note = d.getString("note") ?: "",
                            requestedBy = d.getString("requestedBy") ?: "",
                            requestedByName = d.getString("requestedByName") ?: "",
                        )
                    },
                )
            }
        }
        onDispose { reg?.remove() }
    }

    fun decide(id: String, approve: Boolean, why: String = "") {
        busyId = id
        message = null
        scope.launch {
            val data = buildMap<String, Any?> {
                put("id", id)
                put("approve", approve)
                if (why.isNotBlank()) put("note", why.trim())
            }
            message = ServiceLocator.functions.call("decideStockAdjust", data).fold(
                onSuccess = { (if (approve) L("ఆమోదించాం ✓ — stock మారింది", "Approved ✓ — stock updated") else L("తిరస్కరించాం", "Rejected")) to false },
                onFailure = { CallableError.from(it).text to true },
            )
            busyId = ""
            rejectingId = ""
            rejectNote = ""
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("ఆమోదం కోసం ఆగిన stock మార్పులు", "Stock changes waiting for approval")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                message?.let { (t, bad) -> NoticeBox(t, if (bad) Tone.BAD else Tone.GOOD) }
                loadError?.let { NoticeBox(it, Tone.BAD) }
                if (loadError == null && rows.isEmpty()) Text(L("ఏదీ ఆగి లేదు.", "Nothing is waiting."))
                LazyColumn(modifier = Modifier.heightIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(rows, key = { it.id }) { r ->
                        Column(Modifier.fillMaxWidth()) {
                            Text(r.itemName, style = MaterialTheme.typography.titleSmall)
                            Text(
                                (if (r.type == "IN") L("పెంపు", "Add") else L("తగ్గింపు", "Remove")) +
                                    " ${r.quantity} ${r.unit} · " + L("అప్పుడు stock ${r.qtyAtRequest}", "stock then ${r.qtyAtRequest}") +
                                    (if (r.reason.isNotBlank()) " · ${r.reason}" else ""),
                                style = MaterialTheme.typography.bodySmall,
                            )
                            if (r.note.isNotBlank()) Text(r.note, style = MaterialTheme.typography.bodySmall)
                            if (r.requestedByName.isNotBlank()) Text(L("అడిగినవారు: ${r.requestedByName}", "Asked by: ${r.requestedByName}"), style = MaterialTheme.typography.bodySmall)
                            if (r.requestedBy == myUid && role != UserRole.ADMIN) {
                                Text(L("మీ స్వంత అభ్యర్థన — వేరొకరు ఆమోదించాలి.", "Your own request — someone else must approve."), style = MaterialTheme.typography.bodySmall)
                            } else if (rejectingId == r.id) {
                                OutlinedTextField(rejectNote, { rejectNote = it }, label = { Text(L("తిరస్కరణ కారణం", "Reason for rejecting")) }, modifier = Modifier.fillMaxWidth())
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                                    Button(onClick = { decide(r.id, false, rejectNote) }, enabled = busyId.isEmpty()) { Text(L("తిరస్కరించు", "Reject")) }
                                    TextButton(onClick = { rejectingId = "" }) { Text(L("వద్దు", "Back")) }
                                }
                            } else {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                                    Button(onClick = { decide(r.id, true) }, enabled = busyId.isEmpty()) { Text(L("ఆమోదించు", "Approve")) }
                                    OutlinedButton(onClick = { rejectingId = r.id }, enabled = busyId.isEmpty()) { Text(L("తిరస్కరించు", "Reject")) }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(L("మూసివేయి", "Close")) } },
    )
}
