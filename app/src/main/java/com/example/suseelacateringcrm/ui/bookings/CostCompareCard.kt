package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.L
import kotlinx.coroutines.launch

/**
 * Module 2i on the phone (owner only): standard / estimated / actual cost of one event, read from the costComparison
 * callable. Fixing the standard cost and making a new estimate stay on the web.
 */
@Composable
fun CostCompareCard(bookingId: String) {
    val scope = rememberCoroutineScope()
    var data by remember(bookingId) { mutableStateOf<Map<String, Any?>?>(null) }
    var error by remember(bookingId) { mutableStateOf<String?>(null) }
    var busy by remember(bookingId) { mutableStateOf(false) }

    fun money(row: Map<*, *>?, key: String): String = (row?.get(key) as? Number)?.let { rupees(it.toDouble()) } ?: L("తెలియదు", "not known")

    Card(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Column(Modifier.padding(16.dp)) {
            Text(L("ఖర్చు పోలిక (యజమానికి మాత్రమే)", "Cost comparison (owner only)"), style = MaterialTheme.typography.titleMedium)
            OutlinedButton(
                onClick = {
                    scope.launch {
                        busy = true
                        error = null
                        ServiceLocator.functions.call("costComparison", mapOf("bookingId" to bookingId)).fold(
                            onSuccess = { data = it },
                            onFailure = { error = CallableError.from(it).text },
                        )
                        busy = false
                    }
                },
                enabled = !busy,
                modifier = Modifier.padding(top = 8.dp),
            ) { Text(if (data == null) L("ఖర్చు పోలిక చూపించు", "Show the comparison") else L("మళ్ళీ లెక్కించు", "Work it out again")) }
            error?.let { NoticeBox(it, Tone.BAD) }
            data?.let { d ->
                val rows = listOf(
                    Triple(L("ప్రామాణిక ఖర్చు (మెనూ)", "Standard (menu)"), d["standard"] as? Map<*, *>, null as String?),
                    Triple(L("అంచనా (ఖరారు రోజు)", "Estimated (at confirmation)"), d["estimated"] as? Map<*, *>, d["estVsStdFlag"]?.toString()),
                    Triple(L("అసలు ఖర్చు", "Actual"), d["actual"] as? Map<*, *>, d["actVsEstFlag"]?.toString()),
                )
                rows.forEach { (label, row, flag) ->
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(label, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                money(row, "total") + " · " + L("ప్లేటుకి ", "per plate ") + money(row, "perPlate"),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        when (flag) {
                            "over" -> Pill(L("ఎక్కువ", "Over"), Tone.BAD)
                            "under" -> Pill(L("తక్కువ", "Under"), Tone.GOOD)
                            "ok" -> Pill(L("సరిగ్గా", "OK"), Tone.INFO)
                            else -> {}
                        }
                    }
                }
                val estimate = d["estimate"] as? Map<*, *>
                if (estimate != null && estimate["complete"] == false) {
                    val pct = (estimate["coveragePct"] as? Number)?.toInt() ?: 0
                    NoticeBox(
                        L("అంచనా పూర్తి కాదు: $pct% సరుకులకే ధర తెలుసు. మిగతావి ఈ మొత్తంలో లేవు.", "The estimate is not complete: only $pct% of ingredients had a rate. The rest is not in this figure."),
                        Tone.WARNING,
                    )
                }
            }
        }
    }
}
