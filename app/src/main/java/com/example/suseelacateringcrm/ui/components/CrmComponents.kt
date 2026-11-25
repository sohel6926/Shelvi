package com.example.suseelacateringcrm.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.ui.theme.KolamDivider
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.SuseelaType
import com.example.suseelacateringcrm.ui.theme.formatIndian
import com.example.suseelacateringcrm.ui.theme.tabular
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import kotlin.math.abs
import kotlin.math.roundToLong

/** "₹12,34,567" or "₹1,250.50" (Indian grouping; paise only when there are paise). */
fun rupees(amount: Double): String {
    val negative = amount < 0
    val paiseTotal = (abs(amount) * 100).roundToLong()
    val whole = paiseTotal / 100
    val paise = paiseTotal % 100
    val text = "₹" + formatIndian(whole) + if (paise != 0L) ".%02d".format(paise) else ""
    return if (negative) "-$text" else text
}

/** Quantity without a trailing ".0": 2.5 → "2.5", 3.0 → "3". */
fun fmtQty(value: Double): String =
    if (value == value.roundToLong().toDouble()) value.roundToLong().toString() else "%.2f".format(value).trimEnd('0').trimEnd('.')

/** Page title with the gold kolam dot rule underneath (once per screen, design-system). */
@Composable
fun ScreenHeader(title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        KolamDivider(Modifier.padding(top = 6.dp))
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = SuseelaType.section,
        color = SuseelaTheme.colors.sectionLabel,
        modifier = modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

enum class Tone { GOOD, WARNING, BAD, INFO }

/** Soft tinted message box. Colour is never the only signal — the text says it. */
@Composable
fun NoticeBox(text: String, tone: Tone = Tone.INFO, modifier: Modifier = Modifier) {
    val c = SuseelaTheme.colors
    val (fg, bg) = when (tone) {
        Tone.GOOD -> c.good to c.goodTint
        Tone.WARNING -> c.warning to c.warningTint
        Tone.BAD -> c.bad to c.badTint
        Tone.INFO -> c.info to c.infoTint
    }
    Text(
        text,
        color = fg,
        style = MaterialTheme.typography.bodyMedium,
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .background(bg, RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    )
}

/** Small coloured pill (status, badges). */
@Composable
fun Pill(text: String, tone: Tone, modifier: Modifier = Modifier) {
    val c = SuseelaTheme.colors
    val (fg, bg) = when (tone) {
        Tone.GOOD -> c.good to c.goodTint
        Tone.WARNING -> c.warning to c.warningTint
        Tone.BAD -> c.bad to c.badTint
        Tone.INFO -> c.info to c.infoTint
    }
    Text(
        text,
        color = fg,
        style = MaterialTheme.typography.labelMedium,
        modifier = modifier
            .background(bg, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/** Label on the left, amount right-aligned in tabular digits. */
@Composable
fun AmountRow(label: String, amount: String, bold: Boolean = false, color: Color = Color.Unspecified) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        )
        Text(
            amount,
            style = SuseelaType.tableCell,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
            color = color,
            textAlign = TextAlign.End,
        )
    }
}

/** Single-choice chips that wrap onto several lines. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun <T> ChoiceChips(
    options: List<T>,
    selected: T?,
    label: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            FilterChip(
                selected = option == selected,
                onClick = { onSelect(option) },
                label = { Text(label(option)) },
            )
        }
    }
}

/** Date field that works with "YYYY-MM-DD" business-day strings. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DayPickerField(
    label: String,
    day: String,
    onDaySelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var show by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = if (day.isBlank()) "" else DayKey.display(day),
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        trailingIcon = {
            IconButton(onClick = { show = true }) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = L("తేదీ ఎంచుకోండి", "Pick date"))
            }
        },
        modifier = modifier.fillMaxWidth().padding(vertical = 4.dp),
    )
    if (show) {
        val state = rememberDatePickerState(initialSelectedDateMillis = DayKey.toPickerMillis(day))
        DatePickerDialog(
            onDismissRequest = { show = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onDaySelected(DayKey.fromPickerMillis(it)) }
                    show = false
                }) { Text(L("సరే", "OK")) }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text(L("వద్దు", "Cancel")) } },
        ) {
            DatePicker(state = state)
        }
    }
}

/** Small right-aligned tabular number text. */
@Composable
fun NumText(text: String, modifier: Modifier = Modifier, bold: Boolean = false) {
    Text(
        text,
        modifier = modifier,
        style = MaterialTheme.typography.bodyLarge.tabular(),
        fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
    )
}
