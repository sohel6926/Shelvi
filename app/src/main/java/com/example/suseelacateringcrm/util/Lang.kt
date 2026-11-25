package com.example.suseelacateringcrm.util

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * App-wide language switch. Telugu is the default (the owner reads Telugu only).
 *
 * Usage everywhere (Compose or plain Kotlin): `L("తెలుగు", "English")`.
 * [isTelugu] is Compose snapshot state, so every screen that called L() recomposes the moment
 * the language is switched in the drawer — no Activity restart, no string resources.
 */
object AppLanguage {
    private const val PREFS = "app_language"
    private const val KEY = "lang"
    private var prefs: SharedPreferences? = null

    /** "te" (default), "en" or "hi". Compose snapshot state, so every L() caller recomposes when it changes. */
    var code by mutableStateOf("te")
        private set

    val isTelugu: Boolean get() = code == "te"
    val isHindi: Boolean get() = code == "hi"

    fun init(context: Context) {
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs = p
        code = p.getString(KEY, "te").let { if (it == "en" || it == "hi") it else "te" }
        HindiText.init(context)
    }

    fun set(newCode: String) {
        code = if (newCode == "en" || newCode == "hi") newCode else "te"
        prefs?.edit()?.putString(KEY, code)?.apply()
    }

    fun switchTo(telugu: Boolean) = set(if (telugu) "te" else "en")
}

/**
 * Hindi for the phone app: the English text of every L(te, en) call is looked up in assets/hi.json (exact text) and
 * then in assets/hi-patterns.json (texts with values inside, "{0}" = a value). Unknown text stays English.
 * Both files are built by tools/hi/phone_merge.py; the translations are in tools/hi/phone/.
 */
object HindiText {
    private var appContext: Context? = null
    private var exact: Map<String, String>? = null
    private var patterns: List<Pair<Regex, String>>? = null
    private val seen = HashMap<String, String>()

    fun init(context: Context) { appContext = context.applicationContext }

    private fun load() {
        if (exact != null) return
        val ctx = appContext ?: run { exact = emptyMap(); patterns = emptyList(); return }
        fun readText(name: String): String? = try {
            ctx.assets.open(name).bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (e: Exception) { null }
        val ex = HashMap<String, String>()
        readText("hi.json")?.let { t -> org.json.JSONObject(t).let { o -> o.keys().forEach { k -> ex[k] = o.getString(k) } } }
        val pl = ArrayList<Pair<Regex, String>>()
        val ph = Regex("\\{(\\d)\\}")
        // hi-patterns.json is a list of [english, hindi]; the order (specific first) is kept
        readText("hi-patterns.json")?.let { t ->
            val arr = org.json.JSONArray(t)
            for (i in 0 until arr.length()) {
                val pair = arr.getJSONArray(i)
                val en = pair.getString(0)
                val order = ph.findAll(en).map { it.groupValues[1].toInt() }.toList()
                val re = Regex("^" + ph.split(en).joinToString("(.*?)") { Regex.escape(it) } + "$", RegexOption.DOT_MATCHES_ALL)
                // renumber {n} to the capture-group order of the English text
                val hi = ph.replace(pair.getString(1)) { m -> "\u0000" + order.indexOf(m.groupValues[1].toInt()) + "\u0000" }
                pl.add(re to hi)
            }
        }
        exact = ex
        patterns = pl
    }

    fun of(en: String): String {
        load()
        exact?.get(en)?.let { return it }
        seen[en]?.let { return it }
        var out = en
        for ((re, hi) in patterns.orEmpty()) {
            val m = re.matchEntire(en) ?: continue
            out = Regex("\u0000(\\d+)\u0000").replace(hi) { g -> m.groupValues.getOrNull(g.groupValues[1].toInt() + 1) ?: "" }
            break
        }
        if (seen.size > 5000) seen.clear()
        seen[en] = out
        return out
    }
}

/** Pick the Telugu, English or Hindi text for the current app language (Hindi is looked up from the English text). */
fun L(te: String, en: String): String = when (AppLanguage.code) {
    "te" -> te
    "hi" -> HindiText.of(en)
    else -> en
}

/**
 * Telugu display text for stored English values (statuses, filters, sections, payment methods,
 * units …). The stored value never changes — only what is shown. Unknown values pass through.
 */
fun tr(value: String): String {
    if (AppLanguage.isHindi) return HindiText.of(value)
    if (!AppLanguage.isTelugu) return value
    return TELUGU_VALUES[value] ?: value
}

private val TELUGU_VALUES: Map<String, String> = mapOf(
    // filters
    "All" to "అన్నీ", "Today" to "ఈ రోజు", "Yesterday" to "నిన్న", "Tomorrow" to "రేపు",
    "This Week" to "ఈ వారం", "This Month" to "ఈ నెల",
    // booking status labels
    "Pulka" to "పుల్కా", "Rumali Roti" to "రుమాలీ రోటీ", "Bobbatlu" to "బొబ్బట్లు", "Ice Cream" to "ఐస్ క్రీం", "Paan" to "పాన్", "Water Can" to "వాటర్ క్యాన్", "Sweets" to "స్వీట్లు",
    "Inquiry" to "విచారణ", "Confirmed" to "ఖరారు", "InProgress" to "జరుగుతోంది", "Completed" to "పూర్తి", "Closed" to "ముగించారు", "Cancelled" to "రద్దు",
    // quotation / invoice status labels
    "Draft" to "డ్రాఫ్ట్", "Sent" to "పంపాం", "Accepted" to "ఒప్పుకున్నారు", "Rejected" to "తిరస్కరించారు", "Expired" to "గడువు అయిపోయింది",
    "PartiallyPaid" to "కొంత చెల్లించారు", "Paid" to "చెల్లించారు", "Overdue" to "గడువు దాటింది",
    // payment statuses (purchases / expenses)
    "Pending" to "ఇంకా ఇవ్వాలి", "Partial" to "కొంత ఇచ్చాం", "Unpaid" to "ఇవ్వలేదు", "Advance Paid" to "అడ్వాన్స్ ఇచ్చాం",
    "Partially Paid" to "కొంత ఇచ్చాం", "Fully Paid" to "పూర్తిగా ఇచ్చాం", "Settled" to "సెటిల్ అయింది",
    // payment methods
    "Cash" to "నగదు", "Card" to "కార్డ్", "Bank Transfer" to "బ్యాంక్ ట్రాన్స్‌ఫర్", "BankTransfer" to "బ్యాంక్ ట్రాన్స్‌ఫర్",
    "Credit" to "అప్పు", "Other" to "ఇతర",
    // expense sections
    "Outside Purchase" to "బయట కొనుగోలు", "Staff Advance" to "సిబ్బంది అడ్వాన్స్", "Temporary Staff" to "తాత్కాలిక సిబ్బంది",
    "Cleaning Department" to "శుభ్రత విభాగం", "Transport" to "రవాణా", "Utility Bill" to "కరెంట్ / నీళ్ళ బిల్లు",
    "Rent / Fixed Expense" to "అద్దె / స్థిర ఖర్చు", "Live Counter" to "లైవ్ కౌంటర్", "Other Expense" to "ఇతర ఖర్చు",
    // units
    "Kg" to "కిలో", "Gram" to "గ్రాము", "Litre" to "లీటర్", "Bottle" to "బాటిల్", "Bundle" to "కట్ట", "Piece" to "ముక్క",
    // staff
    "Daily wage" to "రోజు కూలి", "Monthly salary" to "నెల జీతం",
)
