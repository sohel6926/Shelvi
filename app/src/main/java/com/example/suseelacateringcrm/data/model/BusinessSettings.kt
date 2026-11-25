package com.example.suseelacateringcrm.data.model

import com.example.suseelacateringcrm.util.rBool
import com.example.suseelacateringcrm.util.rInt
import com.example.suseelacateringcrm.util.rList
import com.example.suseelacateringcrm.util.rMap
import com.example.suseelacateringcrm.util.rNum
import com.example.suseelacateringcrm.util.rStr

/** Default business phone printed on invoices (owner, requirements C4). */
const val DEFAULT_BUSINESS_PHONE = "9966649469"

/** settings/business.monthlyPayRules (contract decision 3). Owner default: no cut, no free leaves, no OT. */
data class MonthlyPayRules(
    val deductAbsences: Boolean = false,
    val freeLeaves: Int = 0,
    val overtime: Boolean = false,
) {
    fun toMap(): Map<String, Any?> = mapOf("deductAbsences" to deductAbsences, "freeLeaves" to freeLeaves, "overtime" to overtime)
}

data class BankDetails(
    val name: String = "",
    val account: String = "",
    val ifsc: String = "",
)

/**
 * `settings/business` (one document). Written only through the `saveBusinessSettings` callable;
 * gstRegistered / defaultGstRate are set by the server from the GSTIN the owner types.
 */
data class BusinessSettings(
    val name: String = "",
    val logoUrl: String = "",
    val address: String = "",
    val phone: String = DEFAULT_BUSINESS_PHONE,
    val fssaiNumber: String = "",
    val gstin: String = "",
    val gstRegistered: Boolean = false,
    val defaultGstRate: Double = 0.0,
    val bank: BankDetails = BankDetails(),
    val upiId: String = "",
    val signatureUrl: String = "",
    val terms: String = "",
    /** Bill (invoice) terms — invoices print these (or the invoice's own `terms`); quotations print `terms`. */
    val invoiceTerms: String = "",
    val profitMarginPct: Double = 25.0,
    val seasonWeights: List<Double> = emptyList(),
    val setupProgress: Map<String, Boolean> = emptyMap(),
    /** setupProgress.pct from the server (0–100), if present. */
    val setupPct: Int? = null,
    /** calcModes { quotation, invoice, attendancePay, payroll, cooking, targets } = "auto" | "manual". */
    val calcModes: Map<String, String> = emptyMap(),
    /** Managers may type values by hand (default true). Staff never can. */
    val managerCanOverride: Boolean = true,
    /** Food / gallery photo URLs saved through saveBusinessSettings (contract decision 12). */
    val photoUrls: List<String> = emptyList(),
    val monthlyPayRules: MonthlyPayRules = MonthlyPayRules(),
    /** R7-10 / R10-3: legal entity line on documents. */
    val legalName: String = "",
    val brandName: String = "",
    val legalNameOnDocs: Boolean = false,
    /** R10-4 / R10-5 */
    val targetMarginPct: Double = 30.0,
    val lunchBoxPrice: Double = 170.0,
    /** Module 1b: first response to a new lead within N minutes (server default: on, 15). */
    val leadTatOn: Boolean = true,
    val leadTatMinutes: Int = 15,
    /** Module 2h: pack unit names the owner added (Bag, Tin …), offered on purchases next to the fixed units. */
    val uomPacks: List<String> = emptyList(),
) {
    /** "Suseela Caterings (a brand of Suseela Technologies Pvt Ltd)" when switched on, else "". */
    val issuerLine: String get() =
        if (legalNameOnDocs && legalName.isNotBlank()) "${brandName.ifBlank { name }} (a brand of $legalName)" else ""

    fun modeOf(area: CalcArea): String = calcModes[area.key] ?: "auto"

    companion object {
        fun fromMap(m: Map<String, Any?>): BusinessSettings {
            val bank = m.rMap("bank")
            return BusinessSettings(
                name = m.rStr("name"),
                logoUrl = m.rStr("logoUrl"),
                address = m.rStr("address"),
                phone = m.rStr("phone").ifBlank { DEFAULT_BUSINESS_PHONE },
                fssaiNumber = m.rStr("fssaiNumber"),
                gstin = m.rStr("gstin"),
                gstRegistered = m.rBool("gstRegistered"),
                defaultGstRate = m.rNum("defaultGstRate"),
                bank = BankDetails(bank.rStr("name"), bank.rStr("account"), bank.rStr("ifsc")),
                upiId = m.rStr("upiId"),
                signatureUrl = m.rStr("signatureUrl"),
                terms = m.rStr("terms"),
                invoiceTerms = m.rStr("invoiceTerms"),
                profitMarginPct = m.rNum("profitMarginPct", 25.0),
                seasonWeights = m.rList("seasonWeights").map { (it as? Number)?.toDouble() ?: 0.0 },
                setupProgress = m.rMap("setupProgress").filterValues { it is Boolean }.mapValues { it.value == true },
                setupPct = (m.rMap("setupProgress")["pct"] as? Number)?.toInt(),
                calcModes = m.rMap("calcModes").mapValues { it.value?.toString() ?: "auto" },
                managerCanOverride = m.rBool("managerCanOverride", true),
                photoUrls = m.rList("photoUrls").mapNotNull { it?.toString() },
                legalName = m.rStr("legalName"),
                brandName = m.rStr("brandName"),
                legalNameOnDocs = m.rBool("legalNameOnDocs"),
                targetMarginPct = m.rNum("targetMarginPct", 30.0),
                lunchBoxPrice = m.rNum("lunchBoxPrice", 170.0),
                leadTatOn = m.rMap("leadTat").rBool("on", true),
                leadTatMinutes = m.rMap("leadTat").rInt("minutes", 15),
                uomPacks = m.rList("uomPacks").mapNotNull { it?.toString() }.filter { it.isNotBlank() },
                monthlyPayRules = m.rMap("monthlyPayRules").let { r ->
                    MonthlyPayRules(
                        deductAbsences = r.rBool("deductAbsences"),
                        freeLeaves = r.rInt("freeLeaves"),
                        overtime = r.rBool("overtime"),
                    )
                },
            )
        }
    }
}
