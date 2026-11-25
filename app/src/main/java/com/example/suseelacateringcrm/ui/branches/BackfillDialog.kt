package com.example.suseelacateringcrm.ui.branches

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.model.Branch
import com.example.suseelacateringcrm.data.repository.BackfillResult
import com.example.suseelacateringcrm.util.L

/** Lets an admin pick a branch and stamp it onto every pre-migration document missing a branchId. */
@Composable
fun BackfillPickDialog(
    branches: List<Branch>,
    onConfirm: (branchId: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedId by remember { mutableStateOf(branches.firstOrNull()?.id ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("పాత data కి branch పెట్టు", "Backfill existing data")) },
        text = {
            Column {
                Text(L("branch లేని పాత bookings, stock, సిబ్బంది, invoices, కొటేషన్లు, కొనుగోళ్లు, ఖర్చులు ఈ branch కి వెళ్తాయి:", "Existing bookings, inventory, staff, invoices, quotations, purchases and expenses without a branch will be assigned to:"))
                branches.forEach { branch ->
                    FilterChip(
                        selected = selectedId == branch.id,
                        onClick = { selectedId = branch.id },
                        label = { Text(branch.name) },
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { if (selectedId.isNotBlank()) onConfirm(selectedId) }, enabled = selectedId.isNotBlank()) {
                Text(L("Branch పెట్టు", "Run Backfill"))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

@Composable
fun BackfillResultDialog(result: BackfillResult, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(L("పూర్తయింది", "Backfill complete")) },
        text = {
            Column {
                result.counts.forEach { (collection, counts) ->
                    val (total, updated) = counts
                    Text(L("$collection: $total లో $updated మార్చాం", "$collection: $updated of $total updated"))
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(L("అయింది", "Done")) } },
    )
}
