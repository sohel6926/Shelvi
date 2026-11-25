package com.example.suseelacateringcrm.ui.inventory

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.example.suseelacateringcrm.data.model.InventoryItem
import com.example.suseelacateringcrm.data.model.StockMovementType
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.util.L

/** adjustStock reason codes (api-contract R7-2). */
val STOCK_REASONS: List<Pair<String, () -> String>> = listOf(
    "count" to { L("లెక్కపెట్టాం", "Count") },
    "damage" to { L("పాడైంది", "Damage") },
    "return" to { L("తిరిగి ఇచ్చాం/వచ్చింది", "Return") },
    "correction" to { L("సవరణ", "Correction") },
)

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun StockAdjustmentDialog(
    item: InventoryItem,
    onConfirm: (type: String, quantity: Double, reason: String, note: String, expiryDay: String, batchNo: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var type by remember { mutableStateOf(StockMovementType.IN) }
    var quantityText by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var expiryDay by remember { mutableStateOf("") }
    var batchNo by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("Stock మార్చు: ${item.name}", "Adjust stock: ${item.name}")) },
        text = {
            Column {
                Row {
                    FilterChip(selected = type == StockMovementType.IN, onClick = { type = StockMovementType.IN }, label = { Text(L("Stock లోపలికి (IN)", "Stock IN")) })
                    FilterChip(selected = type == StockMovementType.OUT, onClick = { type = StockMovementType.OUT }, label = { Text(L("Stock బయటికి (OUT)", "Stock OUT")) })
                }
                AppTextField(value = quantityText, onValueChange = { quantityText = it }, label = L("పరిమాణం (${item.unit})", "Quantity (${item.unit})"))
                // Module 2d: stock coming in for an item that keeps expiry dates.
                if (item.trackExpiry && type == StockMovementType.IN) {
                    com.example.suseelacateringcrm.ui.components.DayPickerField(L("గడువు తేదీ (ప్యాక్ మీద)", "Expiry date (on the pack)"), expiryDay, { expiryDay = it })
                    if (expiryDay.isNotBlank()) {
                        AppTextField(value = batchNo, onValueChange = { batchNo = it }, label = L("బ్యాచ్ నంబర్ (ఖాళీ = ఆటోమేటిక్)", "Batch no. (blank = auto)"))
                    }
                }
                // R7-2: manual changes must give a reason (count / damage / return / correction).
                Text(L("కారణం (తప్పనిసరి)", "Reason (required)"), style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                androidx.compose.foundation.layout.FlowRow {
                    STOCK_REASONS.forEach { (code, label) ->
                        FilterChip(selected = reason == code, onClick = { reason = code; error = null }, label = { Text(label()) })
                    }
                }
                AppTextField(value = note, onValueChange = { note = it }, label = L("వివరం (ఐచ్ఛికం)", "Note (optional)"))
                Text(
                    L("కొనుగోలు stock ఆటోమేటిక్‌గా కలుస్తుంది — ఇక్కడ మళ్ళీ వేయకండి.", "Purchased stock is added automatically — don't add it again here."),
                    style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                )
                error?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val quantity = quantityText.toDoubleOrNull()
                error = when {
                    quantity == null || quantity <= 0 -> L("పరిమాణం 0 కంటే ఎక్కువ రాయండి", "Enter a quantity above 0")
                    reason.isBlank() -> L("కారణం ఎంచుకోండి", "Choose a reason")
                    else -> null
                }
                if (error == null && quantity != null) onConfirm(type.label, quantity, reason, note.trim(), if (type == StockMovementType.IN) expiryDay else "", batchNo.trim())
            }) { Text(L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}
