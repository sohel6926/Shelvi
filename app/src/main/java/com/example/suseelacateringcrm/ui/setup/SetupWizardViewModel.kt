package com.example.suseelacateringcrm.ui.setup

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.suseelacateringcrm.data.model.BusinessSettings
import com.example.suseelacateringcrm.data.model.DEFAULT_BUSINESS_PHONE
import com.example.suseelacateringcrm.data.model.PayType
import com.example.suseelacateringcrm.data.model.Staff
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.ImportResult
import com.example.suseelacateringcrm.data.repository.SettingsRepository
import com.example.suseelacateringcrm.data.repository.StaffRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.SheetReader
import com.example.suseelacateringcrm.util.catchLogged
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Kinds accepted by the `importRows` callable. */
enum class ImportKind(val code: String, val te: String, val en: String) {
    CUSTOMERS("customers", "పాత customers", "Customers"),
    STAFF("staff", "సిబ్బంది", "Staff"),
    MENU_ITEMS("menuItems", "వంటకాలు / ధరలు", "Menu items / rates"),
    VENDORS("vendors", "Vendors", "Vendors");

    val label: String get() = L(te, en)
}

const val DEFAULT_TERMS_TE_EN =
    "1. ఈ కొటేషన్ 15 రోజులు మాత్రమే చెల్లుతుంది. / This quotation is valid for 15 days.\n" +
        "2. చివరి నిమిషంలో అతిథులు పెరిగితే 10% అదనం. / Last-minute additions are charged 10% extra.\n" +
        "3. Advance చెల్లించాకే booking ఖరారు. / Booking is confirmed only after the advance is paid."

/**
 * Five-step setup (requirements K1–K6). Each step saves through `saveBusinessSettings`
 * (GSTIN → GST on is decided by the server). Progress and the open step are kept so the owner can
 * stop and continue later.
 */
class SetupWizardViewModel(
    context: Context,
    private val settings: SettingsRepository = ServiceLocator.settingsRepository,
    private val staffRepository: StaffRepository = ServiceLocator.staffRepository,
) : ViewModel() {

    private val prefs = context.applicationContext.getSharedPreferences("setup_wizard", Context.MODE_PRIVATE)

    var step by mutableStateOf(prefs.getInt("step", 0).coerceIn(0, STEPS - 1))
        private set

    // Step 1 — business
    var name by mutableStateOf("సుశీల క్యాటరింగ్స్ / Suseela Caterings")
    var address by mutableStateOf("")
    var phone by mutableStateOf(DEFAULT_BUSINESS_PHONE)
    var fssai by mutableStateOf("")
    var gstin by mutableStateOf("")
    var gstRateText by mutableStateOf("5")
    var logoUrl by mutableStateOf("")
        private set
    // Step 2 — bank
    var bankName by mutableStateOf("")
    var bankAccount by mutableStateOf("")
    var ifsc by mutableStateOf("")
    var upiId by mutableStateOf("")
    // Step 3 — signature + terms
    var signatureUrl by mutableStateOf("")
        private set
    var terms by mutableStateOf(DEFAULT_TERMS_TE_EN)
    // Step 4 — staff
    var staffName by mutableStateOf("")
    var staffPhone by mutableStateOf("")
    var staffRole by mutableStateOf("")
    var staffPayType by mutableStateOf(PayType.DAILY)
    var staffWageText by mutableStateOf("")
    // Step 5 — photos + import
    var importKind by mutableStateOf(ImportKind.CUSTOMERS)
    var photosUploaded by mutableStateOf(prefs.getInt("photos", 0))
        private set
    var importDone by mutableStateOf(prefs.getBoolean("imported", false))
        private set

    var serverProgress by mutableStateOf<Map<String, Boolean>>(emptyMap())
        private set
    var serverPct by mutableStateOf<Int?>(null)
        private set
    var current by mutableStateOf<BusinessSettings?>(null)
        private set
    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<Pair<String, Boolean>?>(null)   // text, isError
        private set
    var importResult by mutableStateOf<ImportResult?>(null)
        private set

    private val _staff = MutableStateFlow<List<Staff>>(emptyList())
    val staff: StateFlow<List<Staff>> = _staff.asStateFlow()

    private var filledFromServer = false

    init {
        viewModelScope.launch {
            settings.businessFlow().catchLogged("SetupWizardViewModel").collect { s ->
                current = s
                if (s != null) {
                    serverProgress = s.setupProgress
                    if (s.setupPct != null) serverPct = s.setupPct
                    if (!filledFromServer) {
                        filledFromServer = true
                        if (s.name.isNotBlank()) name = s.name
                        address = s.address
                        phone = s.phone.ifBlank { DEFAULT_BUSINESS_PHONE }
                        fssai = s.fssaiNumber
                        gstin = s.gstin
                        if (s.defaultGstRate > 0) gstRateText = trimNum(s.defaultGstRate)
                        logoUrl = s.logoUrl
                        bankName = s.bank.name
                        bankAccount = s.bank.account
                        ifsc = s.bank.ifsc
                        upiId = s.upiId
                        signatureUrl = s.signatureUrl
                        if (s.terms.isNotBlank()) terms = s.terms
                    }
                }
            }
        }
        viewModelScope.launch {
            ServiceLocator.branchManager.currentBranchId
                .flatMapLatest { staffRepository.staffFlow(it) }
                .catchLogged("SetupWizardViewModel")
                .collect { _staff.value = it }
        }
    }

    // ---- progress -----------------------------------------------------------------------------

    /** Done flags per step; the server's setupProgress counts too when it says a step is done. */
    fun stepDone(i: Int): Boolean {
        val s = current
        val local = when (i) {
            0 -> s != null && s.name.isNotBlank() && s.address.isNotBlank() && s.phone.isNotBlank()
            1 -> s != null && (s.upiId.isNotBlank() || s.bank.account.isNotBlank())
            2 -> s != null && s.signatureUrl.isNotBlank() && s.terms.isNotBlank()
            3 -> _staff.value.isNotEmpty()
            else -> photosUploaded > 0 || importDone
        }
        val keys = SERVER_KEYS[i]
        return local || keys.any { serverProgress[it] == true }
    }

    /** Larger of the server's pct and the local count, so the bar never goes backwards. */
    val percent: Int get() = maxOf(serverPct ?: 0, (0 until STEPS).count { stepDone(it) } * 100 / STEPS).coerceIn(0, 100)

    fun goTo(i: Int) {
        step = i.coerceIn(0, STEPS - 1)
        message = null
        prefs.edit().putInt("step", step).apply()
    }

    // ---- validation helpers -------------------------------------------------------------------

    private fun fail(te: String, en: String): Boolean {
        message = L(te, en) to true
        return false
    }

    private fun digits(s: String) = s.filter { it.isDigit() }

    private suspend fun save(fields: Map<String, Any?>, next: Boolean) {
        busy = true
        val r = settings.save(fields)
        busy = false
        r.fold(
            onSuccess = { progress ->
                if (progress.steps.isNotEmpty()) serverProgress = progress.steps
                if (progress.pct != null) serverPct = progress.pct
                message = L("సేవ్ అయింది ✓", "Saved ✓") to false
                if (next && step < STEPS - 1) goTo(step + 1)
            },
            onFailure = { message = CallableError.from(it).text to true },
        )
    }

    // ---- step 1 -----------------------------------------------------------------------------

    fun saveBusiness() {
        if (name.isBlank()) { fail("వ్యాపారం పేరు రాయండి", "Enter the business name"); return }
        if (address.isBlank()) { fail("చిరునామా రాయండి", "Enter the address"); return }
        if (digits(phone).length != 10) { fail("ఫోన్ 10 అంకెలు ఉండాలి", "Phone must have 10 digits"); return }
        if (fssai.isNotBlank() && digits(fssai).length != 14) { fail("FSSAI నంబర్ 14 అంకెలు", "FSSAI number has 14 digits"); return }
        val g = gstin.trim().uppercase()
        var rate: Double? = null
        if (g.isNotEmpty()) {
            if (!GSTIN_REGEX.matches(g)) { fail("GSTIN 15 అక్షరాలు, సరిగా లేదు (ఉదా: 36ABCDE1234F1Z5)", "GSTIN must be 15 characters, e.g. 36ABCDE1234F1Z5"); return }
            rate = gstRateText.trim().toDoubleOrNull()
            if (rate == null || rate < 0 || rate > 28) { fail("GST రేటు 0 నుంచి 28 మధ్య", "GST rate must be between 0 and 28"); return }
        }
        viewModelScope.launch {
            save(
                mapOf(
                    "name" to name.trim(),
                    "logoUrl" to logoUrl,
                    "address" to address.trim(),
                    "phone" to digits(phone),
                    "fssaiNumber" to digits(fssai),
                    // Empty GSTIN = not registered (server sets gstRegistered false / rate 0).
                    "gstin" to g,
                    "gstRate" to (rate ?: 0.0),
                ),
                next = true,
            )
        }
    }

    fun uploadLogo(uri: Uri) = upload("settings/logo", uri) { url ->
        logoUrl = url
        save(mapOf("logoUrl" to url), next = false)
    }

    // ---- step 2 -----------------------------------------------------------------------------

    fun saveBank() {
        val code = ifsc.trim().uppercase()
        if (code.isNotEmpty() && !IFSC_REGEX.matches(code)) { fail("IFSC 11 అక్షరాలు (ఉదా: SBIN0001234)", "IFSC has 11 characters, e.g. SBIN0001234"); return }
        if (bankAccount.isNotBlank() && digits(bankAccount).length !in 9..18) { fail("Account నంబర్ 9–18 అంకెలు", "Account number has 9–18 digits"); return }
        if (upiId.isNotBlank() && !UPI_REGEX.matches(upiId.trim())) { fail("UPI ID సరిగా లేదు (ఉదా: name@okaxis)", "UPI ID looks wrong, e.g. name@okaxis"); return }
        if (upiId.isBlank() && bankAccount.isBlank()) { fail("UPI ID లేదా bank account ఇవ్వండి", "Give a UPI ID or a bank account"); return }
        viewModelScope.launch {
            save(
                mapOf(
                    "bank" to mapOf("name" to bankName.trim(), "account" to digits(bankAccount), "ifsc" to code),
                    "upiId" to upiId.trim(),
                ),
                next = true,
            )
        }
    }

    // ---- step 3 -----------------------------------------------------------------------------

    fun uploadSignature(uri: Uri) = upload("settings/signature", uri) { url ->
        signatureUrl = url
        save(mapOf("signatureUrl" to url), next = false)
    }

    fun saveTerms() {
        if (terms.isBlank()) { fail("Terms రాయండి", "Write the terms"); return }
        viewModelScope.launch { save(mapOf("terms" to terms.trim(), "signatureUrl" to signatureUrl), next = true) }
    }

    // ---- step 4 -----------------------------------------------------------------------------

    fun addStaff() {
        if (staffName.isBlank()) { fail("పేరు రాయండి", "Enter the name"); return }
        if (digits(staffPhone).length != 10) { fail("ఫోన్ 10 అంకెలు ఉండాలి", "Phone must have 10 digits"); return }
        val amount = staffWageText.trim().toDoubleOrNull()
        if (amount == null || amount < 0) { fail("జీతం సరైన సంఖ్య (మైనస్ కాదు)", "Pay must be a number, not negative"); return }
        val branchId = ServiceLocator.branchManager.currentBranchId.value
        if (branchId == null) { fail("ముందు menu లో branch ఎంచుకోండి", "Select a branch in the menu first"); return }
        viewModelScope.launch {
            busy = true
            message = try {
                staffRepository.saveStaff(
                    Staff(
                        name = staffName.trim(),
                        phone = digits(staffPhone),
                        jobRole = staffRole.trim(),
                        dailyWage = if (staffPayType == PayType.DAILY) amount else 0.0,
                        payType = staffPayType.code,
                        monthlySalary = if (staffPayType == PayType.MONTHLY) amount else 0.0,
                        active = true,
                        joinedDate = java.util.Date(),
                    ),
                    branchId,
                )
                staffName = ""; staffPhone = ""; staffRole = ""; staffWageText = ""
                L("జోడించాం ✓ ఇంకొకరిని జోడించండి", "Added ✓ Add the next one") to false
            } catch (e: Exception) {
                (L("జోడించలేకపోయాం", "Could not add") + ": ${e.message}") to true
            }
            busy = false
        }
    }

    // ---- step 5 -----------------------------------------------------------------------------

    fun uploadPhotos(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            busy = true
            var ok = 0
            val urls = mutableListOf<String>()
            for (uri in uris) {
                try {
                    urls += settings.uploadImage("gallery", uri)
                    ok++
                } catch (e: Exception) {
                    message = (L("ఫోటో upload కాలేదు", "Photo upload failed") + ": ${e.message}") to true
                }
            }
            photosUploaded += ok
            prefs.edit().putInt("photos", photosUploaded).apply()
            if (urls.isNotEmpty()) {
                // Contract decision 12: saveBusinessSettings accepts photoUrls.
                val all = (current?.photoUrls ?: emptyList()) + urls
                settings.save(mapOf("photoUrls" to all)).onFailure { e ->
                    message = CallableError.from(e).text to true
                }
            }
            busy = false
            if (ok > 0) message = L("$ok ఫోటోలు upload అయ్యాయి ✓", "$ok photos uploaded ✓") to false
        }
    }

    fun importFile(context: Context, uri: Uri) {
        viewModelScope.launch {
            busy = true
            importResult = null
            try {
                val rows = withContext(Dispatchers.IO) { SheetReader.read(context.applicationContext, uri) }
                if (rows.isEmpty()) {
                    message = L("ఫైల్‌లో వరుసలు లేవు", "No rows in the file") to true
                } else {
                    settings.importRows(importKind.code, rows).fold(
                        onSuccess = {
                            importResult = it
                            importDone = true
                            prefs.edit().putBoolean("imported", true).apply()
                            message = L("${it.created} ఎక్కించాం, ${it.skipped.size} వదిలేశాం", "${it.created} imported, ${it.skipped.size} skipped") to false
                        },
                        onFailure = { message = CallableError.from(it).text to true },
                    )
                }
            } catch (e: SheetReader.SheetError) {
                message = L(e.te, e.en) to true
            } catch (e: Exception) {
                message = (L("ఫైల్ చదవలేకపోయాం", "Could not read the file") + ": ${e.message}") to true
            }
            busy = false
        }
    }

    private fun upload(folder: String, uri: Uri, then: suspend (String) -> Unit) {
        viewModelScope.launch {
            busy = true
            try {
                val url = settings.uploadImage(folder, uri)
                then(url)
            } catch (e: Exception) {
                message = (L("ఫోటో upload కాలేదు", "Upload failed") + ": ${e.message}") to true
            }
            busy = false
        }
    }

    private fun trimNum(d: Double): String = if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()

    companion object {
        const val STEPS = 5
        /** setupProgress keys per step (contract decision 7). */
        private val SERVER_KEYS = listOf(
            listOf("business"),
            listOf("bank"),
            listOf("signature"),
            listOf("staff"),
            listOf("photos"),
        )
        private val GSTIN_REGEX = Regex("^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$")
        private val IFSC_REGEX = Regex("^[A-Z]{4}0[A-Z0-9]{6}$")
        private val UPI_REGEX = Regex("^[A-Za-z0-9.\\-_]{2,}@[A-Za-z]{2,}$")
    }
}
