package com.example.suseelacateringcrm.util

import java.text.NumberFormat
import java.util.Locale

object CurrencyUtils {
    private val inrFormat = NumberFormat.getCurrencyInstance(Locale("en", "IN"))

    fun formatInr(amount: Double): String = inrFormat.format(amount)
}
