package com.example.suseelacateringcrm.ui.bookings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.ServiceTimelineResult
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.ui.theme.tabular
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.OnRefresh
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch

class BookingTimelineViewModel(private val bookingId: String) : ViewModel() {
    var state by mutableStateOf<UiState<ServiceTimelineResult>>(UiState.Loading)
        private set

    fun load() {
        viewModelScope.launch {
            state = UiState.Loading
            state = ServiceLocator.functions.getServiceTimeline(bookingId).fold(
                onSuccess = { UiState.Success(it) },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
        }
    }
}

internal fun roleLabel(role: String): String = when (role) {
    "manager" -> L("మేనేజర్", "Manager")
    "cook" -> L("వంటవారు", "Cook")
    "helper" -> L("సహాయకులు", "Helper")
    "driver" -> L("డ్రైవర్", "Driver")
    "all" -> L("అందరూ", "Everyone")
    else -> role
}

/**
 * Booking detail "Timeline" card: who does what, when, counted back from the serving time.
 * Steps come from the `getServiceTimeline` callable (calc §12 + settings.timelineDefaults).
 * Reloads when the booking's date, guests, serving time, travel minutes or meal change, and on Refresh.
 */
@Composable
fun BookingTimelineCard(booking: Booking) {
    val viewModel: BookingTimelineViewModel = viewModel(
        key = "booking-timeline-${booking.id}",
        factory = viewModelFactory { initializer { BookingTimelineViewModel(booking.id) } },
    )
    LaunchedEffect(booking.eventDate, booking.guestCount, booking.guestCountActual, booking.serveTime, booking.travelMinutes, booking.mealType, booking.packageId) {
        viewModel.load()
    }
    OnRefresh { viewModel.load() }
    val eventDay = booking.eventDate?.let { DayKey.of(it) }

    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(SuseelaTheme.colors.good).padding(16.dp)) {
        Text(L("పని సమయాలు (timeline)", "Service timeline"), style = MaterialTheme.typography.titleMedium)
        when (val s = viewModel.state) {
            is UiState.Loading -> Text(L("లోడ్ అవుతోంది…", "Loading…"), style = MaterialTheme.typography.bodySmall)
            is UiState.Error -> {
                Text(s.message, color = SuseelaTheme.colors.bad, style = MaterialTheme.typography.bodyMedium)
                OutlinedButton(onClick = { viewModel.load() }) { Text(L("మళ్ళీ ప్రయత్నించు", "Try again")) }
            }
            is UiState.Success -> {
                val t = s.data
                Text(
                    L("వడ్డన ${t.serveTime} · ప్రయాణం ${t.travelMinutes} నిమిషాలు", "Serving at ${t.serveTime} · travel ${t.travelMinutes} min"),
                    style = MaterialTheme.typography.bodySmall,
                )
                t.steps.forEach { step ->
                    val before = eventDay != null && step.day < eventDay
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                        Text(
                            step.time,
                            style = MaterialTheme.typography.bodyLarge.tabular(),
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.width(56.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(step.text, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                roleLabel(step.role) +
                                    if (before) L(" · ముందు రోజు (${DayKey.display(step.day)})", " · day before (${DayKey.display(step.day)})") else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}
