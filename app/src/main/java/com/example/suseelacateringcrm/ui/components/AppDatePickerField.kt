package com.example.suseelacateringcrm.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.util.DateUtils
import java.util.Date
import com.example.suseelacateringcrm.util.L

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppDatePickerField(
    label: String,
    date: Date?,
    onDateSelected: (Date) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showDialog by remember { mutableStateOf(false) }

    OutlinedTextField(
        value = DateUtils.formatDate(date).takeIf { date != null } ?: "",
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        trailingIcon = {
            IconButton(onClick = { showDialog = true }) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = L("తేదీ ఎంచుకోండి", "Pick date"))
            }
        },
        modifier = modifier.fillMaxWidth().padding(vertical = 4.dp),
    )

    if (showDialog) {
        val state = rememberDatePickerState(initialSelectedDateMillis = date?.time)
        DatePickerDialog(
            onDismissRequest = { showDialog = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onDateSelected(Date(it)) }
                    showDialog = false
                }) { Text(L("సరే", "OK")) }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text(L("వద్దు", "Cancel")) }
            },
        ) {
            DatePicker(state = state)
        }
    }
}
