@file:OptIn(ExperimentalTextApi::class)

package com.example.suseelacateringcrm.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.sp
import com.example.suseelacateringcrm.R

/*
 * Brand fonts, downloaded at runtime from Google Fonts through Google Play services
 * (no font files in the APK). Until a font arrives — or on phones without Play services —
 * Android's own Telugu font is shown, so text is never invisible.
 *
 *  - Baloo Tammudu 2 : headings and big KPI numbers (no tabular digits in this font)
 *  - Anek Telugu     : body, forms, tables (has tabular digits: use [tabular])
 *  - Hind Guntur     : printed invoices / quotations
 *
 * Only three weights are used anywhere: 400, 500, 600.
 */

private val provider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)

private val Baloo = GoogleFont("Baloo Tammudu 2")
private val Anek = GoogleFont("Anek Telugu")
private val Hind = GoogleFont("Hind Guntur")

val HeadingFamily = FontFamily(
    Font(googleFont = Baloo, fontProvider = provider, weight = FontWeight.Medium),
    Font(googleFont = Baloo, fontProvider = provider, weight = FontWeight.SemiBold),
)

val BodyFamily = FontFamily(
    Font(googleFont = Anek, fontProvider = provider, weight = FontWeight.Normal),
    Font(googleFont = Anek, fontProvider = provider, weight = FontWeight.Medium),
    Font(googleFont = Anek, fontProvider = provider, weight = FontWeight.SemiBold),
)

val PrintFamily = FontFamily(
    Font(googleFont = Hind, fontProvider = provider, weight = FontWeight.Normal),
    Font(googleFont = Hind, fontProvider = provider, weight = FontWeight.Medium),
    Font(googleFont = Hind, fontProvider = provider, weight = FontWeight.SemiBold),
)

/** Telugu vowel signs sit high and low: centre the line box and don't trim it. */
private val TeluguLines = LineHeightStyle(
    alignment = LineHeightStyle.Alignment.Center,
    trim = LineHeightStyle.Trim.None,
)

private fun heading(size: Int, line: Int, weight: FontWeight = FontWeight.SemiBold) = TextStyle(
    fontFamily = HeadingFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = 0.sp,
    lineHeightStyle = TeluguLines,
)

private fun body(size: Int, line: Int, weight: FontWeight = FontWeight.Normal) = TextStyle(
    fontFamily = BodyFamily,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = 0.sp,
    lineHeightStyle = TeluguLines,
)

/*
 * Minor-third scale from 16sp (same as web): 12 · 14 · 16 · 19 · 23 · 28 · 33 · 40.
 * Line heights are taller than Latin defaults because of Telugu script.
 */
val Typography = Typography(
    displayLarge = heading(48, 56),
    displayMedium = heading(44, 52),
    displaySmall = heading(40, 46),          // KPI numbers
    headlineLarge = heading(33, 43),         // page title
    headlineMedium = heading(28, 36),
    headlineSmall = heading(23, 31),
    titleLarge = heading(19, 27),            // card / section title
    titleMedium = heading(16, 24),
    titleSmall = body(14, 20, FontWeight.SemiBold),
    bodyLarge = body(16, 26),                // body, table rows
    bodyMedium = body(14, 22),               // secondary text
    bodySmall = body(12, 17),                // timestamps, helper text only
    labelLarge = body(16, 22, FontWeight.Medium),  // buttons, pills
    labelMedium = body(14, 20, FontWeight.Medium),
    labelSmall = body(12, 16, FontWeight.Medium),
)

/** Extra text styles Material has no slot for. */
object SuseelaType {
    /** Big KPI number. Wrap with CountUpText (Motion.kt) so its width never jumps. */
    val kpi: TextStyle = heading(40, 46)

    /** Group / section label; colour it with SuseelaTheme.colors.sectionLabel. */
    val section: TextStyle = body(14, 20, FontWeight.SemiBold)

    /** Table header cell. */
    val tableHead: TextStyle = body(14, 20, FontWeight.SemiBold)

    /** Table body cell, with digits lined up in columns. */
    val tableCell: TextStyle = body(16, 24).tabular()

    /** Printed invoice / quotation body. Hind Guntur has no tabular digits: right-align amounts. */
    val print: TextStyle = TextStyle(
        fontFamily = PrintFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        lineHeightStyle = TeluguLines,
    )
}

/** Equal-width digits so amounts line up (works with Anek Telugu). */
fun TextStyle.tabular(): TextStyle = merge(TextStyle(fontFeatureSettings = "tnum"))
