package com.example.suseelacateringcrm.util

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.suseelacateringcrm.data.model.BookingStatus
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.di.ServiceLocator
import java.util.concurrent.TimeUnit

/**
 * Runs roughly once a day; notifies for bookings whose event date is today or tomorrow
 * so staff/admin get a reminder without needing to open the app.
 */
class BookingReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        // The worker can start without the app open, so set up language/context here too.
        ServiceLocator.init(applicationContext)
        val uid = ServiceLocator.auth.currentUser?.uid ?: return Result.success()
        return try {
            // Read the profile directly (session state may not be loaded in a background start).
            val profile = ServiceLocator.userRepository.getUserProfile(uid) ?: return Result.success()
            if (profile.isPendingApproval) return Result.success()
            val bookings = when (profile.userRole) {
                // Staff: only events they are assigned to (security rules).
                UserRole.STAFF -> {
                    if (profile.staffId.isBlank()) return Result.success()
                    ServiceLocator.bookingRepository.bookingsScopedOnce(staffId = profile.staffId, branchId = null)
                }
                // Manager: own branch only.
                UserRole.MANAGER -> {
                    if (profile.branchId.isBlank()) return Result.success()
                    ServiceLocator.bookingRepository.bookingsScopedOnce(staffId = null, branchId = profile.branchId)
                }
                UserRole.ADMIN -> ServiceLocator.bookingRepository.bookingsScopedOnce(staffId = null, branchId = null)
            }
            val now = System.currentTimeMillis()
            val millisPerDay = 24L * 60 * 60 * 1000
            bookings
                .filter { it.bookingStatus == BookingStatus.CONFIRMED || it.bookingStatus == BookingStatus.INQUIRY }
                .forEach { booking ->
                    val eventDate = booking.eventDate ?: return@forEach
                    val daysUntil = (eventDate.time - now) / millisPerDay
                    if (daysUntil in 0..1) {
                        val whenLabel = if (daysUntil == 0L) L("ఈ రోజు", "today") else L("రేపు", "tomorrow")
                        NotificationHelper.showEventReminder(
                            context = applicationContext,
                            notificationId = booking.id.hashCode(),
                            title = L("కార్యక్రమం $whenLabel: ${booking.customerNameSnapshot}", "Event $whenLabel: ${booking.customerNameSnapshot}"),
                            message = "${booking.eventType.ifBlank { L("కార్యక్రమం", "Event") }} · " +
                                L("${booking.guestCount} మంది", "${booking.guestCount} guests") + " · ${DateUtils.formatDate(eventDate)}",
                        )
                    }
                }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val WORK_NAME = "booking_reminder_worker"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<BookingReminderWorker>(24, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
