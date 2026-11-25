package com.example.suseelacateringcrm.data.model

enum class UserRole {
    ADMIN,
    MANAGER,
    STAFF;

    companion object {
        fun fromFirestore(value: String?): UserRole = when (value) {
            "admin" -> ADMIN
            "manager" -> MANAGER
            else -> STAFF
        }

        /** Owner and manager: bookings, quotations, customers, leads, menus, payments. */
        val ADMIN_AND_MANAGER: Set<UserRole> = setOf(ADMIN, MANAGER)
        val ADMIN_ONLY: Set<UserRole> = setOf(ADMIN)
        val EVERYONE: Set<UserRole> = setOf(ADMIN, MANAGER, STAFF)
    }
}

fun UserRole.toFirestore(): String = when (this) {
    UserRole.ADMIN -> "admin"
    UserRole.MANAGER -> "manager"
    UserRole.STAFF -> "staff"
}

/** Admin (owner) sees profit, reports money, ₹ targets, users, bank settings, staff salaries. */
val UserRole?.isAdmin: Boolean get() = this == UserRole.ADMIN

/** Admin or manager — runs bookings, quotations, leads, menus, payments. */
val UserRole?.canManage: Boolean get() = this == UserRole.ADMIN || this == UserRole.MANAGER
