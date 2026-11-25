package com.example.suseelacateringcrm.ui.expenses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.ExpenseSections
import com.example.suseelacateringcrm.util.CurrencyUtils
import com.example.suseelacateringcrm.util.L

@Composable
fun ExpensesHomeScreen(
    padding: PaddingValues,
    onOpenSection: (String) -> Unit,
    onOpenHistory: () -> Unit,
    onOpenPersonReport: () -> Unit,
    /** Opens the staff list (admin only); null hides the button. */
    onOpenStaff: (() -> Unit)? = null,
    viewModel: ExpensesHomeViewModel = viewModel(),
) {
    val summary by viewModel.summary.collectAsStateWithLifecycle()

    // Staff advances moved to the staff page (recovered from salary); outside items to Outside orders.
    val sections = ExpenseSections.all.filter { it != ExpenseSections.OUTSIDE_PURCHASE && it != ExpenseSections.STAFF_ADVANCE }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.padding(padding).fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(L("ఖర్చుల సారాంశం", "Expenses Overview"), style = MaterialTheme.typography.titleMedium)
                    if (com.example.suseelacateringcrm.di.ServiceLocator.isStaffLogin()) {
                        Text(
                            L("నా ఎంట్రీలు — మీరు నమోదు చేసినవి మాత్రమే", "My entries — only the ones you entered"),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Text(L("ఈ రోజు: ${CurrencyUtils.formatInr(summary.todayTotal)}", "Today: ${CurrencyUtils.formatInr(summary.todayTotal)}"))
                    Text(L("ఈ నెల: ${CurrencyUtils.formatInr(summary.monthTotal)}", "This month: ${CurrencyUtils.formatInr(summary.monthTotal)}"))
                    Text(L("మొత్తం బాకీ: ${CurrencyUtils.formatInr(summary.totalPending)}", "Total pending: ${CurrencyUtils.formatInr(summary.totalPending)}"))
                }
            }
        }

        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                com.example.suseelacateringcrm.ui.components.NoticeBox(
                    L(
                        "సిబ్బంది అడ్వాన్స్ → సిబ్బంది page లో 'అడ్వాన్స్' ఇవ్వండి (జీతంలో దానంతట అదే కట్ అవుతుంది)",
                        "Staff advance → give it as an 'Advance' on the Staff page (it is cut from the salary automatically)",
                    ),
                    com.example.suseelacateringcrm.ui.components.Tone.INFO,
                )
                if (onOpenStaff != null) {
                    OutlinedButton(onClick = onOpenStaff) { Text(L("సిబ్బంది page కి వెళ్ళు", "Go to Staff page")) }
                }
            }
        }

        items(sections) { section ->
            Card(onClick = { onOpenSection(section) }, modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(20.dp).fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(section, style = MaterialTheme.typography.titleSmall)
                }
            }
        }

        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(2) }) {
            Column(modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = onOpenHistory, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(L("ఖర్చుల చరిత్ర", "Expense History"))
                }
                OutlinedButton(onClick = onOpenPersonReport, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(L("వ్యక్తి వారీ రిపోర్ట్", "Person-wise Report"))
                }

                if (summary.sectionTotals.isNotEmpty()) {
                    Text(
                        L("విభాగం వారీగా (మొత్తం)", "By section (all time)"),
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                    )
                    summary.sectionTotals.forEach { (section, total) ->
                        Text("$section — ${CurrencyUtils.formatInr(total)}", modifier = Modifier.padding(vertical = 2.dp))
                    }
                }
            }
        }
    }
}
