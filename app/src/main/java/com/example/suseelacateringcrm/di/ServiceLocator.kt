package com.example.suseelacateringcrm.di

import android.content.Context
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CrmFunctions
import com.example.suseelacateringcrm.data.remote.FUNCTIONS_REGION
import com.example.suseelacateringcrm.data.repository.AttendanceRepository
import com.example.suseelacateringcrm.data.repository.AuthRepository
import com.example.suseelacateringcrm.data.repository.BookingRepository
import com.example.suseelacateringcrm.data.repository.BranchRepository
import com.example.suseelacateringcrm.data.repository.CustomerRepository
import com.example.suseelacateringcrm.data.repository.InventoryRepository
import com.example.suseelacateringcrm.data.repository.InvoiceRepository
import com.example.suseelacateringcrm.data.repository.ExpenseRepository
import com.example.suseelacateringcrm.data.repository.KitchenRepository
import com.example.suseelacateringcrm.data.repository.LeadRepository
import com.example.suseelacateringcrm.data.repository.MenuPackageRepository
import com.example.suseelacateringcrm.data.repository.MenuRepository
import com.example.suseelacateringcrm.data.repository.OtherPurchaseItemRepository
import com.example.suseelacateringcrm.data.repository.PurchaseRepository
import com.example.suseelacateringcrm.data.repository.QuotationRepository
import com.example.suseelacateringcrm.data.repository.SettingsRepository
import com.example.suseelacateringcrm.data.repository.StaffRepository
import com.example.suseelacateringcrm.data.repository.TargetRepository
import com.example.suseelacateringcrm.data.repository.UserRepository
import com.example.suseelacateringcrm.data.repository.VendorRepository
import com.example.suseelacateringcrm.session.BranchManager
import com.example.suseelacateringcrm.session.SessionManager
import com.example.suseelacateringcrm.session.SessionState
import com.example.suseelacateringcrm.util.AppLanguage
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage

object ServiceLocator {
    private lateinit var appContext: Context

    /** Application context (set in [init]). */
    val context: Context get() = appContext

    fun init(context: Context) {
        appContext = context.applicationContext
        AppLanguage.init(appContext)
    }

    val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }
    // Offline persistence is on by default in the Android Firestore SDK (entries made without
    // signal are cached and sync later); nothing here turns it off.
    val firestore: FirebaseFirestore by lazy { FirebaseFirestore.getInstance() }
    val storage: FirebaseStorage by lazy { FirebaseStorage.getInstance() }
    val functions: CrmFunctions by lazy { CrmFunctions(FirebaseFunctions.getInstance(FUNCTIONS_REGION)) }

    /** Role of the signed-in, approved user (null while loading / logged out). */
    fun currentRole(): UserRole? =
        (sessionManager.state.value as? SessionState.LoggedIn)?.profile?.userRole

    /** For staff: their staffId ("" if the login is not linked yet). Null for admin / manager. */
    fun staffScopeId(): String? {
        val profile = (sessionManager.state.value as? SessionState.LoggedIn)?.profile ?: return null
        return if (profile.userRole == UserRole.STAFF) profile.staffId else null
    }

    /** For staff: their login uid (purchases / expenses lists: own entries only). Null for admin / manager. */
    fun staffOwnerUid(): String? {
        val profile = (sessionManager.state.value as? SessionState.LoggedIn)?.profile ?: return null
        return if (profile.userRole == UserRole.STAFF) (auth.currentUser?.uid ?: profile.uid).ifBlank { null } else null
    }

    /** True for a staff login (screens label their lists "నా ఎంట్రీలు"). */
    fun isStaffLogin(): Boolean = currentRole() == UserRole.STAFF

    /** Branch a non-admin is locked to (queries must filter on it); null for the admin. */
    fun nonAdminBranchId(): String? =
        if (currentRole() == UserRole.ADMIN) null else branchManager.currentBranchId.value

    val userRepository: UserRepository by lazy { UserRepository(firestore) }
    val authRepository: AuthRepository by lazy { AuthRepository(auth, userRepository) }
    val customerRepository: CustomerRepository by lazy { CustomerRepository(firestore) }
    val menuRepository: MenuRepository by lazy { MenuRepository(firestore) }
    val bookingRepository: BookingRepository by lazy { BookingRepository(firestore) { staffScopeId() } }
    val invoiceRepository: InvoiceRepository by lazy { InvoiceRepository(firestore, functions) { nonAdminBranchId() } }
    val quotationRepository: QuotationRepository by lazy { QuotationRepository(firestore, functions) }
    val staffRepository: StaffRepository by lazy { StaffRepository(firestore) }
    val inventoryRepository: InventoryRepository by lazy { InventoryRepository(firestore, functions) }
    val vendorRepository: VendorRepository by lazy { VendorRepository(firestore) }
    val purchaseRepository: PurchaseRepository by lazy { PurchaseRepository(firestore) { staffOwnerUid() } }
    val otherPurchaseItemRepository: OtherPurchaseItemRepository by lazy { OtherPurchaseItemRepository(firestore) }
    val expenseRepository: ExpenseRepository by lazy { ExpenseRepository(firestore) { staffOwnerUid() } }
    val branchRepository: BranchRepository by lazy { BranchRepository(firestore) }

    // New (batch 1)
    val settingsRepository: SettingsRepository by lazy { SettingsRepository(firestore, functions, storage, appContext) }
    val menuPackageRepository: MenuPackageRepository by lazy { MenuPackageRepository(firestore) }
    val leadRepository: LeadRepository by lazy { LeadRepository(firestore) }
    // Round 7: equipment, vehicles, complaints, outside orders
    val opsRepository: com.example.suseelacateringcrm.data.repository.OpsRepository by lazy { com.example.suseelacateringcrm.data.repository.OpsRepository(firestore) }
    val kitchenRepository: KitchenRepository by lazy { KitchenRepository(firestore, functions) }
    val attendanceRepository: AttendanceRepository by lazy {
        AttendanceRepository(firestore, functions, appContext, staffScope = { staffScopeId() }, branchScope = { nonAdminBranchId() })
    }
    val targetRepository: TargetRepository by lazy { TargetRepository(functions, firestore) }

    val sessionManager: SessionManager by lazy { SessionManager(auth, userRepository) }
    val branchManager: BranchManager by lazy { BranchManager(sessionManager, appContext) }
}
