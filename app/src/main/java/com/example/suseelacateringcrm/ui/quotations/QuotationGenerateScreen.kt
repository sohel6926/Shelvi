package com.example.suseelacateringcrm.ui.quotations

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.runtime.Composable
import com.example.suseelacateringcrm.ui.quotebuilder.QuoteBuilderScreen

/**
 * "Generate Quotation" from a booking now opens the menu-package quote builder with the booking's
 * customer and guest count filled in. Totals come from the server (`quoteMenu` / `saveQuotation`).
 */
@Composable
fun QuotationGenerateScreen(
    bookingId: String,
    padding: PaddingValues,
    onDone: (String) -> Unit,
) {
    QuoteBuilderScreen(packageId = null, bookingId = bookingId, padding = padding, onSaved = onDone)
}
