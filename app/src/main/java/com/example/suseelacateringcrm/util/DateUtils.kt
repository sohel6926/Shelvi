package com.example.suseelacateringcrm.util

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object DateUtils {
    private val dateFormat = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
    private val dateTimeFormat = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())

    fun formatDate(date: Date?): String = date?.let { dateFormat.format(it) } ?: "-"

    fun formatDateTime(date: Date?): String = date?.let { dateTimeFormat.format(it) } ?: "-"
}
