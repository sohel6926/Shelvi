package com.example.suseelacateringcrm.ui.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items as columnItems
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.util.DateUtils
import com.example.suseelacateringcrm.util.L

private val WEEKDAY_LABELS = listOf("S", "M", "T", "W", "T", "F", "S")

@Composable
fun CalendarScreen(
    padding: PaddingValues,
    onOpenBooking: (String) -> Unit,
    viewModel: CalendarViewModel = viewModel(),
) {
    val bookingsByDay by viewModel.monthBookingsByDay.collectAsStateWithLifecycle()
    val daysInMonth = viewModel.daysInDisplayedMonth()
    val offset = viewModel.firstDayOfWeekOffset()

    Column(modifier = Modifier.padding(padding).fillMaxSize().padding(16.dp)) {
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            IconButton(onClick = { viewModel.prevMonth() }, modifier = Modifier.align(Alignment.CenterStart)) {
                Icon(Icons.Filled.ChevronLeft, contentDescription = L("ముందు నెల", "Previous month"))
            }
            Text(viewModel.monthLabel(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            IconButton(onClick = { viewModel.nextMonth() }, modifier = Modifier.align(Alignment.CenterEnd)) {
                Icon(Icons.Filled.ChevronRight, contentDescription = L("తర్వాతి నెల", "Next month"))
            }
        }

        androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(top = 8.dp))

        LazyVerticalGrid(columns = GridCells.Fixed(7), modifier = Modifier.fillMaxWidth()) {
            items(WEEKDAY_LABELS) { label ->
                Box(modifier = Modifier.aspectRatio(1f), contentAlignment = Alignment.Center) {
                    Text(label, style = MaterialTheme.typography.labelMedium)
                }
            }
            items(offset) { Box(modifier = Modifier.aspectRatio(1f)) {} }
            items(daysInMonth) { index ->
                val day = index + 1
                val hasBookings = bookingsByDay.containsKey(day)
                val isSelected = viewModel.selectedDay == day
                val isToday = viewModel.isToday(day)
                Box(
                    modifier = Modifier
                        .aspectRatio(1f)
                        .padding(2.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(
                            when {
                                isSelected -> MaterialTheme.colorScheme.primary
                                isToday -> MaterialTheme.colorScheme.primaryContainer
                                else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                            }
                        )
                        .clickable { viewModel.selectDay(day) },
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            day.toString(),
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        )
                        if (hasBookings) {
                            Box(
                                modifier = Modifier
                                    .size(5.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (isSelected) MaterialTheme.colorScheme.onPrimary
                                        else MaterialTheme.colorScheme.primary
                                    )
                            )
                        }
                    }
                }
            }
        }

        androidx.compose.foundation.layout.Spacer(modifier = Modifier.padding(top = 16.dp))

        val selectedBookings = viewModel.selectedDayBookings()
        if (viewModel.selectedDay == null) {
            Text(L("తేదీ నొక్కితే ఆ రోజు కార్యక్రమాలు కనిపిస్తాయి.", "Tap a date to see its events."), style = MaterialTheme.typography.bodyMedium)
        } else if (selectedBookings.isEmpty()) {
            EmptyState(L("ఈ తేదీన కార్యక్రమాలు లేవు.", "No events on this date."))
        } else {
            Text(L("కార్యక్రమాలు", "Events"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = 8.dp))
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                columnItems(selectedBookings, key = { it.id }) { booking ->
                    Card(
                        onClick = { onOpenBooking(booking.id) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(booking.customerNameSnapshot, style = MaterialTheme.typography.titleSmall)
                            Text(L("${booking.eventType} · ${booking.guestCount} మంది", "${booking.eventType} · ${booking.guestCount} guests"))
                            if (booking.venue.isNotBlank()) Text(booking.venue)
                            Text(DateUtils.formatDate(booking.eventDate), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
