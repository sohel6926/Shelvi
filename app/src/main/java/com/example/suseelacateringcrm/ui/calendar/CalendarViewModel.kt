package com.example.suseelacateringcrm.ui.calendar

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.Booking
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import java.util.Calendar

class CalendarViewModel(
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    private val today = Calendar.getInstance()

    var displayedYear by mutableIntStateOf(today.get(Calendar.YEAR))
        private set
    var displayedMonth by mutableIntStateOf(today.get(Calendar.MONTH))
        private set
    var selectedDay by mutableStateOf<Int?>(today.get(Calendar.DAY_OF_MONTH))
        private set

    private val _allBookings = MutableStateFlow<List<Booking>>(emptyList())

    private val _bookingsByDay = MutableStateFlow<Map<Int, List<Booking>>>(emptyMap())
    val monthBookingsByDay: StateFlow<Map<Int, List<Booking>>> = _bookingsByDay.asStateFlow()

    init {
        viewModelScope.launch {
            branchManager.currentBranchId.flatMapLatest { branchId -> bookingRepository.bookingsFlow(branchId) }
                .collect { bookings ->
                    _allBookings.value = bookings
                    recomputeMonth()
                }
        }
    }

    fun nextMonth() {
        displayedMonth++
        if (displayedMonth > 11) {
            displayedMonth = 0
            displayedYear++
        }
        selectedDay = null
        recomputeMonth()
    }

    fun prevMonth() {
        displayedMonth--
        if (displayedMonth < 0) {
            displayedMonth = 11
            displayedYear--
        }
        selectedDay = null
        recomputeMonth()
    }

    fun selectDay(day: Int) {
        selectedDay = if (selectedDay == day) null else day
    }

    fun selectedDayBookings(): List<Booking> {
        val day = selectedDay ?: return emptyList()
        return _bookingsByDay.value[day] ?: emptyList()
    }

    private fun recomputeMonth() {
        val cal = Calendar.getInstance()
        _bookingsByDay.value = _allBookings.value
            .filter { it.eventDate != null }
            .filter { booking ->
                cal.time = booking.eventDate!!
                cal.get(Calendar.YEAR) == displayedYear && cal.get(Calendar.MONTH) == displayedMonth
            }
            .groupBy { booking ->
                cal.time = booking.eventDate!!
                cal.get(Calendar.DAY_OF_MONTH)
            }
    }

    fun daysInDisplayedMonth(): Int {
        val cal = Calendar.getInstance()
        cal.set(displayedYear, displayedMonth, 1)
        return cal.getActualMaximum(Calendar.DAY_OF_MONTH)
    }

    /** 0 = Sunday .. 6 = Saturday, for the 1st of the displayed month. */
    fun firstDayOfWeekOffset(): Int {
        val cal = Calendar.getInstance()
        cal.set(displayedYear, displayedMonth, 1)
        return cal.get(Calendar.DAY_OF_WEEK) - 1
    }

    fun isToday(day: Int): Boolean =
        displayedYear == today.get(Calendar.YEAR) &&
            displayedMonth == today.get(Calendar.MONTH) &&
            day == today.get(Calendar.DAY_OF_MONTH)

    fun monthLabel(): String {
        val cal = Calendar.getInstance()
        cal.set(displayedYear, displayedMonth, 1)
        return java.text.SimpleDateFormat("MMMM yyyy", java.util.Locale.getDefault()).format(cal.time)
    }
}
