package com.example.suseelacateringcrm.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.InventoryRepository
import com.example.suseelacateringcrm.data.repository.InvoiceRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.session.BranchManager
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn

data class UpcomingEvent(
    val bookingId: String,
    val customerName: String,
    val eventType: String,
    val eventDate: java.util.Date,
    val daysUntil: Int,
)

/** One row of the calendar-first home agenda (today, tomorrow, this week, later). */
data class AgendaEvent(
    val bookingId: String,
    val customerName: String,
    val eventType: String,
    val eventDate: java.util.Date,
    /** Whole days from the start of today: 0 = today, 1 = tomorrow. */
    val daysFromToday: Int,
    /** "HH:MM" 24h, empty = not set. */
    val serveTime: String,
    val venue: String,
    val guestCount: Int,
    val dueAmount: Double,
)

data class DashboardSummary(
    val upcomingBookings: Int = 0,
    val pendingDuesTotal: Double = 0.0,
    val lowStockCount: Int = 0,
    val upcomingEvents: List<UpcomingEvent> = emptyList(),
    val agenda: List<AgendaEvent> = emptyList(),
)

class DashboardViewModel(
    private val bookingRepository: BookingRepository = ServiceLocator.bookingRepository,
    private val invoiceRepository: InvoiceRepository = ServiceLocator.invoiceRepository,
    private val inventoryRepository: InventoryRepository = ServiceLocator.inventoryRepository,
    private val branchManager: BranchManager = ServiceLocator.branchManager,
) : ViewModel() {

    val summary: StateFlow<DashboardSummary> = branchManager.currentBranchId.flatMapLatest { branchId ->
        combine(
            bookingRepository.bookingsFlow(branchId).catchLogged("DashboardViewModel"),
            invoiceRepository.invoicesFlow(branchId).catch { emit(emptyList()) },
            inventoryRepository.inventoryFlow(branchId).catchLogged("DashboardViewModel"),
        ) { bookings, invoices, inventory ->
            val now = java.util.Date()
            val millisPerDay = 24L * 60 * 60 * 1000
            val upcoming = bookings
                .filter { booking ->
                    booking.bookingStatus in listOf(BookingStatus.INQUIRY, BookingStatus.CONFIRMED) &&
                        (booking.eventDate?.after(now) != false)
                }
                .sortedBy { it.eventDate }
            val cal = java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.HOUR_OF_DAY, 0)
                set(java.util.Calendar.MINUTE, 0)
                set(java.util.Calendar.SECOND, 0)
                set(java.util.Calendar.MILLISECOND, 0)
            }
            val startOfToday = cal.timeInMillis
            val agenda = bookings
                .filter { booking ->
                    booking.bookingStatus in listOf(BookingStatus.INQUIRY, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS) &&
                        (booking.eventDate?.time ?: -1L) >= startOfToday
                }
                .sortedWith(compareBy({ it.eventDate }, { it.serveTime }))
                .mapNotNull { booking ->
                    val eventDate = booking.eventDate ?: return@mapNotNull null
                    AgendaEvent(
                        bookingId = booking.id,
                        customerName = booking.customerNameSnapshot,
                        eventType = booking.eventType,
                        eventDate = eventDate,
                        daysFromToday = ((eventDate.time - startOfToday) / millisPerDay).toInt(),
                        serveTime = booking.serveTime,
                        venue = booking.venue,
                        guestCount = booking.guestCount,
                        dueAmount = (booking.totalAmount - booking.advancePaid).coerceAtLeast(0.0),
                    )
                }
                .take(14)
            DashboardSummary(
                agenda = agenda,
                upcomingBookings = upcoming.size,
                pendingDuesTotal = invoices.sumOf { it.balanceDue },
                lowStockCount = inventory.count { it.isLowStock },
                upcomingEvents = upcoming.take(5).mapNotNull { booking ->
                    val eventDate = booking.eventDate ?: return@mapNotNull null
                    val daysUntil = ((eventDate.time - now.time) / millisPerDay).toInt().coerceAtLeast(0)
                    UpcomingEvent(
                        bookingId = booking.id,
                        customerName = booking.customerNameSnapshot,
                        eventType = booking.eventType,
                        eventDate = eventDate,
                        daysUntil = daysUntil,
                    )
                },
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DashboardSummary())
}
