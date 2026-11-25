package com.example.suseelacateringcrm.ui.billing

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.ui.components.AmountRow
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState

@Composable
fun InvoiceGenerateScreen(
    bookingId: String,
    padding: PaddingValues,
    onDone: (String) -> Unit,
) {
    val viewModel: InvoiceGenerateViewModel = viewModel(
        key = "invoice-generate-$bookingId",
        factory = viewModelFactory { initializer { InvoiceGenerateViewModel(bookingId) } },
    )

    LaunchedEffect(viewModel.generateState) {
        val state = viewModel.generateState
        if (state is UiState.Success) onDone(state.data)
    }

    if (viewModel.loading) {
        LoadingIndicator(modifier = Modifier.padding(padding))
        return
    }

    val booking = viewModel.booking
    if (booking == null) {
        Column(modifier = Modifier.padding(padding).fillMaxSize().padding(16.dp)) {
            Text(L("Booking దొరకలేదు", "Booking not found"))
        }
        return
    }

    Column(
        modifier = Modifier
            .padding(padding)
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        ScreenHeader(L("ఇన్వాయిస్ తయారు చేయి", "Generate invoice"), booking.customerNameSnapshot)
        Text(L("${booking.guestCount} మంది అతిథులు", "${booking.guestCount} guests"))

        SectionLabel(L("Booking లోని మెనూ", "Menu on the booking"))
        booking.menuSnapshot.forEach { item ->
            AmountRow(item.name, rupees(item.pricePerPlate) + L(" / ప్లేట్", " / plate"))
        }
        NoticeBox(
            L(
                "మొత్తం, GST (ఉంటే), తగ్గింపు — అన్నీ server లెక్కిస్తుంది. Booking కి కొటేషన్ ఉంటే దాని ధరలే వస్తాయి.",
                "Totals, GST (if registered) and discount are calculated by the server. If the booking has a quotation, its prices are used.",
            ),
            Tone.INFO,
        )

        val state = viewModel.generateState
        if (state is UiState.Error) NoticeBox(state.message, Tone.BAD)

        Button(
            onClick = { viewModel.generate() },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            enabled = state !is UiState.Loading,
        ) {
            Text(if (state is UiState.Loading) L("తయారు చేస్తున్నాం…", "Generating…") else L("ఇన్వాయిస్ తయారు చేయి", "Generate invoice"))
        }
        Text(
            L("ఇంటర్నెట్ ఉండాలి.", "Needs internet."),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}
