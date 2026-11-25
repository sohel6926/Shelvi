package com.example.suseelacateringcrm.ui.components

import androidx.compose.ui.graphics.Color
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.InvoiceStatus
import com.example.suseelacateringcrm.data.model.QuotationStatus

fun BookingStatus.color(): Color = when (this) {
    BookingStatus.INQUIRY -> Color(0xFF757575)
    BookingStatus.CONFIRMED -> Color(0xFF1976D2)
    BookingStatus.IN_PROGRESS -> Color(0xFFF9A825)
    BookingStatus.COMPLETED -> Color(0xFF2E7D32)
    BookingStatus.CLOSED -> Color(0xFF4A3A12)
    BookingStatus.CANCELLED -> Color(0xFFC62828)
}

fun InvoiceStatus.color(): Color = when (this) {
    InvoiceStatus.DRAFT -> Color(0xFF757575)
    InvoiceStatus.SENT -> Color(0xFF1976D2)
    InvoiceStatus.PARTIALLY_PAID -> Color(0xFFF9A825)
    InvoiceStatus.PAID -> Color(0xFF2E7D32)
    InvoiceStatus.OVERDUE -> Color(0xFFC62828)
}

fun QuotationStatus.color(): Color = when (this) {
    QuotationStatus.DRAFT -> Color(0xFF757575)
    QuotationStatus.SENT -> Color(0xFF1976D2)
    QuotationStatus.ACCEPTED -> Color(0xFF2E7D32)
    QuotationStatus.REJECTED -> Color(0xFFC62828)
    QuotationStatus.EXPIRED -> Color(0xFF8D6E63)
}
