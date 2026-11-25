package com.example.suseelacateringcrm.ui.owner

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.AppTextField
import com.example.suseelacateringcrm.util.L
import kotlinx.coroutines.launch

/**
 * Add / change a company, brand, branch, kitchen or store on the phone — the same fields as the web Masters page,
 * including the brand logo (picked from the gallery, uploaded to Storage `settings/` — owner only, like the web). The server (`saveMaster`) checks every value and says what is wrong.
 */
data class MOpt(val code: String, val te: String, val en: String)

/** type: text | number | bool | select | multi | parent | parents | lines | image (a picture picked on the phone, kept as its link). `of` = the kind a parent field points to. */
data class MField(
    val key: String,
    val te: String,
    val en: String,
    val type: String = "text",
    val options: List<MOpt> = emptyList(),
    val of: String = "",
    val optional: Boolean = false,
    val address: Boolean = false,
    val upper: Boolean = false,
)

private fun o(code: String, te: String, en: String) = MOpt(code, te, en)

object MasterFields {
    private val BRAND_TYPES = listOf(o("pureVeg", "శుద్ధ శాకాహారం", "Pure veg"), o("nonVeg", "మాంసాహారం", "Non-veg"), o("mixed", "రెండూ", "Mixed"), o("corporate", "కార్పొరేట్", "Corporate"), o("wedding", "పెళ్ళిళ్ళు", "Wedding"), o("religious", "పూజలు / ధార్మిక", "Religious"), o("cloudKitchen", "క్లౌడ్ కిచెన్", "Cloud kitchen"), o("eventFood", "ఈవెంట్ ఫుడ్", "Event food"), o("other", "ఇతర", "Other"))
    private val BRANCH_TYPES = listOf(o("fullOperations", "పూర్తి కార్యకలాపాలు", "Full operations"), o("sales", "అమ్మకాలు", "Sales"), o("kitchen", "వంటశాల", "Kitchen"), o("officeOnly", "ఆఫీస్ మాత్రమే", "Office only"), o("warehouseOnly", "గోదాం మాత్రమే", "Warehouse only"), o("dispatchHub", "పంపిణీ కేంద్రం", "Dispatch hub"), o("combination", "మిశ్రమం", "Combination"))
    private val KITCHEN_TYPES = listOf(o("central", "ప్రధాన వంటశాల", "Central kitchen"), o("veg", "శాకాహార", "Veg"), o("nonVeg", "మాంసాహార", "Non-veg"), o("mixed", "రెండూ", "Mixed"), o("sweet", "స్వీట్లు", "Sweet"), o("bakery", "బేకరీ", "Bakery"), o("prep", "తయారీ", "Prep"), o("satellite", "ఉప వంటశాల", "Satellite"), o("eventSite", "కార్యక్రమ స్థలంలో", "Event-site"))
    private val SECTIONS = listOf(o("vegPrep", "కూరగాయల తయారీ", "Vegetable prep"), o("rice", "అన్నం", "Rice"), o("curry", "కూరలు", "Curry"), o("fry", "వేపుళ్ళు", "Fry"), o("nonVeg", "మాంసాహారం", "Non-veg"), o("tiffin", "టిఫిన్", "Tiffin"), o("sweet", "స్వీట్లు", "Sweet"), o("bakery", "బేకరీ", "Bakery"), o("liveCounterPrep", "లైవ్ కౌంటర్", "Live counter prep"), o("packing", "ప్యాకింగ్", "Packing"), o("washing", "కడగడం", "Washing"))
    private val STORE_TYPES = listOf(o("main", "ప్రధాన స్టోర్", "Main store"), o("grocery", "కిరాణా", "Grocery"), o("dry", "పొడి సరుకు", "Dry"), o("vegetable", "కూరగాయలు", "Vegetable"), o("fruit", "పండ్లు", "Fruit"), o("dairy", "పాల పదార్థాలు", "Dairy"), o("cold", "కోల్డ్ స్టోర్", "Cold store"), o("freezer", "ఫ్రీజర్", "Freezer"), o("nonVegCold", "మాంసం కోల్డ్ స్టోర్", "Non-veg cold store"), o("beverage", "పానీయాలు", "Beverage"), o("packing", "ప్యాకింగ్ సామాను", "Packing"), o("cleaning", "శుభ్రత సామాను", "Cleaning"), o("equipment", "పాత్రలు / సామాను", "Equipment"), o("gasFuel", "గ్యాస్ / ఇంధనం", "Gas / fuel"), o("return", "తిరిగి వచ్చినవి", "Return"), o("quarantine", "వేరుగా ఉంచినవి", "Quarantine"), o("scrap", "వ్యర్థం", "Scrap / waste"), o("transit", "రవాణాలో", "Transit"))

    private fun f(key: String, te: String, en: String, type: String = "text", address: Boolean = false, upper: Boolean = false) = MField(key, te, en, type, address = address, upper = upper)
    private val ADDRESS = listOf(f("line1", "చిరునామా", "Address", address = true), f("area", "ప్రాంతం", "Area", address = true), f("city", "నగరం", "City", address = true), f("state", "రాష్ట్రం", "State", address = true), f("pin", "PIN కోడ్", "PIN code", address = true))
    private val CONTACT = listOf(f("mobile", "మొబైల్ (10 అంకెలు)", "Mobile (10 digits)"), f("email", "ఈమెయిల్", "Email"))

    val FIELDS: Map<String, List<MField>> = mapOf(
        "company" to listOf(f("legalName", "చట్టబద్ధ పేరు", "Legal name"), f("displayName", "చూపే పేరు", "Display name"), f("companyType", "కంపెనీ రకం (Pvt Ltd, Proprietorship …)", "Company type (Pvt Ltd, Proprietorship …)"), f("registrationNumber", "రిజిస్ట్రేషన్ / CIN నంబర్", "Registration / CIN number", upper = true), f("gstRegistered", "GST నమోదు ఉంది", "GST registered", "bool"), f("gstin", "GSTIN", "GSTIN", upper = true), f("pan", "PAN", "PAN", upper = true)) + ADDRESS + CONTACT + f("website", "వెబ్‌సైట్", "Website"),
        "brand" to listOf(MField("companyId", "కంపెనీ", "Company", "parent", of = "company"), f("name", "బ్రాండ్ పేరు", "Brand name"), MField("businessTypes", "వ్యాపార రకం", "Business type", "multi", options = BRAND_TYPES), f("tagline", "ట్యాగ్‌లైన్", "Tagline"), MField("logoUrl", "లోగో", "Logo", "image"), f("invoiceDisplayName", "ఇన్వాయిస్‌పై పేరు", "Name on invoices"), f("quotationDisplayName", "కొటేషన్‌పై పేరు", "Name on quotations"), f("vegOnly", "శాకాహారం మాత్రమే", "Veg only", "bool")) + CONTACT + listOf(f("whatsapp", "WhatsApp నంబర్", "WhatsApp number"), f("website", "వెబ్‌సైట్", "Website")),
        "branch" to listOf(MField("companyId", "కంపెనీ", "Company", "parent", of = "company"), f("name", "శాఖ పేరు", "Branch name"), MField("brandIds", "ఈ శాఖ ఏ బ్రాండ్‌లకు పని చేస్తుంది", "Brands this branch serves", "parents", of = "brand"), MField("branchType", "శాఖ రకం", "Branch type", "select", options = BRANCH_TYPES)) + ADDRESS + CONTACT + f("maxEventsPerDay", "రోజుకు గరిష్ట కార్యక్రమాలు (0 = పరిమితి లేదు)", "Most events per day (0 = no limit)", "number"),
        "kitchen" to listOf(MField("branchId", "శాఖ", "Branch", "parent", of = "branch"), f("name", "వంటశాల పేరు", "Kitchen name"), MField("kitchenType", "వంటశాల రకం", "Kitchen type", "select", options = KITCHEN_TYPES), MField("sections", "విభాగాలు", "Sections", "multi", options = SECTIONS), f("vegOnly", "శాకాహారం మాత్రమే", "Veg only", "bool"), f("maxPlatesPerShift", "ఒక షిఫ్ట్‌లో గరిష్ట ప్లేట్లు (0 = చెప్పలేదు)", "Most plates per shift (0 = not set)", "number"), f("qualityApprovalRequired", "నాణ్యత ఆమోదం తప్పనిసరి", "Quality approval required", "bool"), f("temperatureLogRequired", "ఉష్ణోగ్రత నమోదు తప్పనిసరి", "Temperature log required", "bool"), f("batchTrackingRequired", "బ్యాచ్ నమోదు తప్పనిసరి", "Batch tracking required", "bool")),
        "store" to listOf(MField("branchId", "శాఖ", "Branch", "parent", of = "branch"), MField("kitchenId", "వంటశాల (ఉంటే)", "Kitchen (if any)", "parent", of = "kitchen", optional = true), f("name", "స్టోర్ పేరు", "Store name"), MField("storeType", "స్టోర్ రకం", "Store type", "select", options = STORE_TYPES), f("temperatureControlled", "ఉష్ణోగ్రత నియంత్రణ ఉంది", "Temperature controlled", "bool"), f("restrictedAccess", "అనుమతి ఉన్నవారికే ప్రవేశం", "Restricted access", "bool"), f("expiryTracking", "గడువు తేదీ నమోదు", "Expiry tracking", "bool"), MField("locations", "స్థానాలు (ఒక్కో లైన్‌కి ఒకటి: జోన్ / ర్యాక్ / షెల్ఫ్ / బిన్)", "Shelf locations (one per line: Zone / Rack / Shelf / Bin)", "lines")),
    )
}

private fun asStrings(v: Any?): List<String> = (v as? List<*>)?.mapNotNull { it as? String }.orEmpty()

/** The first form values of a record (or of a new one), as the form edits them. */
private fun startValues(kind: String, raw: Map<String, Any?>?): Map<String, Any?> {
    val addr = (raw?.get("address") as? Map<*, *>)?.mapKeys { it.key.toString() }.orEmpty()
    val out = HashMap<String, Any?>()
    MasterFields.FIELDS.getValue(kind).forEach { fl ->
        val v: Any? = if (fl.address) addr[fl.key] else raw?.get(fl.key)
        out[(if (fl.address) "address." else "") + fl.key] = when (fl.type) {
            "bool" -> v == true
            "number" -> (v as? Number)?.let { if (it.toDouble() == 0.0) "" else it.toLong().toString() } ?: ""
            "select" -> (v as? String)?.takeIf { s -> fl.options.any { it.code == s } } ?: fl.options.first().code
            "multi", "parents" -> asStrings(v)
            "lines" -> asStrings(v).joinToString("\n")
            else -> (v as? String) ?: ""
        }
    }
    return out
}

/** Parsed by the server but not shown in the form — kept as they are on an edit (the server resets missing ones to defaults). */
private val HIDDEN_KEYS = listOf("shortName", "tan", "stateCode", "fyStartMonth", "nonVegAllowed", "adjustmentApprovalRequired")

private fun buildData(kind: String, values: Map<String, Any?>, raw: Map<String, Any?>?): Map<String, Any?> {
    val data = HashMap<String, Any?>()
    if (raw != null) HIDDEN_KEYS.forEach { k -> raw[k]?.let { data[k] = it } }
    val address = HashMap<String, Any?>()
    MasterFields.FIELDS.getValue(kind).forEach { fl ->
        val v = values[(if (fl.address) "address." else "") + fl.key]
        val out: Any? = when (fl.type) {
            "number" -> (v as? String)?.trim()?.toDoubleOrNull() ?: 0.0
            "lines" -> ((v as? String) ?: "").split("\n")
            else -> v
        }
        if (fl.address) address[fl.key] = out else data[fl.key] = out
    }
    data["address"] = address
    return data
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MasterFormDialog(
    kind: String,
    row: MasterRow?,
    all: Map<String, List<MasterRow>>,
    onDismiss: () -> Unit,
    onSave: suspend (Map<String, Any?>) -> String?,
) {
    var values by remember { mutableStateOf(startValues(kind, row?.raw)) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun set(key: String, v: Any?) { values = values + (key to v) }
    fun usable(k: String) = all[k].orEmpty().filter { it.status == "active" || it.status == "draft" }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (row == null) L("కొత్తది చేర్చు", "Add new") else "${row.code} · ${row.name}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                MasterFields.FIELDS.getValue(kind).forEach { fl ->
                    val key = (if (fl.address) "address." else "") + fl.key
                    val label = L(fl.te, fl.en)
                    when (fl.type) {
                        "bool" -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, Modifier.weight(1f))
                            Switch(checked = values[key] == true, onCheckedChange = { set(key, it) })
                        }
                        "select" -> {
                            Text(label, style = MaterialTheme.typography.labelMedium)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                fl.options.forEach { op -> FilterChip(selected = values[key] == op.code, onClick = { set(key, op.code) }, label = { Text(L(op.te, op.en)) }) }
                            }
                        }
                        "multi", "parents" -> {
                            val opts: List<MOpt> = if (fl.type == "multi") fl.options else usable(fl.of)
                                .filter { fl.of != "brand" || values["companyId"] == "" || it.raw["companyId"] == values["companyId"] }
                                .map { MOpt(it.id, it.name, it.name) }
                            @Suppress("UNCHECKED_CAST") val chosen = (values[key] as? List<String>).orEmpty()
                            Text(label, style = MaterialTheme.typography.labelMedium)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                opts.forEach { op ->
                                    FilterChip(
                                        selected = op.code in chosen,
                                        onClick = { set(key, if (op.code in chosen) chosen - op.code else chosen + op.code) },
                                        label = { Text(L(op.te, op.en)) },
                                    )
                                }
                            }
                        }
                        "parent" -> {
                            val rows = usable(fl.of).filter { fl.of != "kitchen" || values["branchId"] == "" || it.raw["branchId"] == values["branchId"] }
                            Text(label, style = MaterialTheme.typography.labelMedium)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                if (fl.optional) FilterChip(selected = values[key] == "", enabled = true, onClick = { set(key, "") }, label = { Text(L("— లేదు —", "— none —")) })
                                rows.forEach { r ->
                                    // A parent cannot be changed once saved (same as the web page), except an optional one.
                                    FilterChip(selected = values[key] == r.id, enabled = row == null || fl.optional, onClick = { set(key, r.id) }, label = { Text(r.name) })
                                }
                            }
                        }
                        "image" -> LogoField(label, values[key] as? String ?: "", { set(key, it) })
                        "lines" -> AppTextField(values[key] as? String ?: "", { set(key, it) }, label, singleLine = false)
                        "number" -> AppTextField(values[key] as? String ?: "", { set(key, it.filter { c -> c.isDigit() }) }, label)
                        else -> AppTextField(values[key] as? String ?: "", { set(key, if (fl.upper) it.uppercase() else it) }, label)
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 4.dp)) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                busy = true
                error = null
                scope.launch {
                    val err = onSave(buildData(kind, values, row?.raw))
                    busy = false
                    if (err == null) onDismiss() else error = err
                }
            }) { Text(if (busy) L("Save అవుతోంది…", "Saving…") else L("సేవ్ చేయి", "Save")) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text(L("వద్దు", "Cancel")) } },
    )
}

/** Logo picker: gallery -> compressed JPEG -> Storage `settings/` -> link kept in the form. Cleared with "తీసివేయి". */
@Composable
private fun LogoField(label: String, url: String, onChange: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            msg = null
            try {
                onChange(ServiceLocator.settingsRepository.uploadImage("settings", uri))
            } catch (e: Exception) {
                msg = L("Upload కాలేదు — మళ్ళీ ప్రయత్నించండి.", "Upload failed — please try again.")
            }
            busy = false
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        if (url.isNotBlank()) AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(96.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(enabled = !busy, onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                Text(if (busy) L("Upload అవుతోంది…", "Uploading…") else if (url.isBlank()) L("లోగో ఎంచుకో", "Choose logo") else L("లోగో మార్చు", "Change logo"))
            }
            if (url.isNotBlank()) TextButton(enabled = !busy, onClick = { onChange("") }) { Text(L("తీసివేయి", "Remove")) }
        }
        msg?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
