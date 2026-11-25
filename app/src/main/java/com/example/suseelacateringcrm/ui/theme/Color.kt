package com.example.suseelacateringcrm.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/*
 * Suseela Caterings CRM colour tokens.
 * Source of truth: design/tokens.json — kept identical to web/src/theme/tokens.ts.
 * Change a hex in tokens.json first, then here and in tokens.ts together.
 * Contrast ratios (WCAG 2.x) are listed in docs/design-system.md.
 */

// Brand (from the logo)
val BrandGreen = Color(0xFF1F6E45)       // 6.22:1 on white, 5.66:1 on cream
val BrandGreenDark = Color(0xFF185A38)   // pressed; white on it 8.21:1
val BrandGreenTint = Color(0xFFE4F1E8)
val BrandGold = Color(0xFFC08A2E)        // DECORATIVE ONLY (3.04:1 on white) — never for text
val BrandGoldDeep = Color(0xFF8A5300)    // text-safe gold: section labels, 5.76:1 on cream

// Kept for older references; prefer the tokens above.
val BrandGreenLight = Color(0xFF4C9270)
val BrandGoldLight = Color(0xFFD9AC5C)
val BrandTerracotta = Color(0xFFA65D3B)
val BrandTerracottaLight = Color(0xFFC98868)

// Surfaces
val Cream = Color(0xFFF7F4EC)            // page background
val NavSurface = Color(0xFFFFFDF8)       // drawer / bottom bar
val Raised = Color(0xFFFFFFFF)           // cards, tables
val TableHeader = Color(0xFFF1EBDD)
val RowHover = Color(0xFFFBF8F1)
val Track = Color(0xFFECE4D2)
val BorderSubtle = Color(0xFFECE4D2)
val BorderStrong = Color(0xFFD9CDB2)

// Text
val Ink = Color(0xFF1C2421)              // 14.43:1 on cream
val InkSecondary = Color(0xFF4F5A55)     // 6.53:1 on cream
val TableHeaderInk = Color(0xFF4A3A12)   // 9.27:1 on TableHeader
val OnGold = Color(0xFF1C2421)           // 5.22:1 on BrandGold

// Status (text-safe on white, cream and their own tint)
val Good = Color(0xFF1F6E45)
val GoodTint = Color(0xFFE4F1E8)
val Warning = Color(0xFF945C00)          // 5.04:1 on cream, 4.84:1 on tint
val WarningTint = Color(0xFFFBEEDA)
val Bad = Color(0xFFB42318)              // 5.98:1 on cream
val BadTint = Color(0xFFFBE5E2)
val Info = Color(0xFF205E8C)             // 6.28:1 on cream
val InfoTint = Color(0xFFE3EEF6)
val Neutral = Color(0xFF4A3A12)
val NeutralTint = Color(0xFFEFE9DC)

/** Warm shadow colour, rgba(60,45,10,0.08). */
val WarmShadow = Color(0x143C2D0A)

// Dark scheme
val DarkCanvas = Color(0xFF121714)
val DarkSurface = Color(0xFF1B211D)
val DarkSurfaceHigh = Color(0xFF232A25)
val DarkSurfaceHighest = Color(0xFF2A322C)
val DarkInk = Color(0xFFECE8DE)          // 14.82:1 on canvas
val DarkInkSecondary = Color(0xFFB9BEB6) // 9.59:1 on canvas
val DarkGreen = Color(0xFF7CC59A)        // 8.90:1 on canvas
val DarkOnGreen = Color(0xFF0B2A19)      // 7.58:1 on DarkGreen
val DarkGold = Color(0xFFE0B25C)         // 9.23:1 on canvas
val DarkWarning = Color(0xFFEDB95E)
val DarkBad = Color(0xFFF4A398)
val DarkInfo = Color(0xFF93C3E8)
val DarkBorder = Color(0xFF2E3631)

/** Colours Material 3 has no slot for: status tones, gold, nav and table surfaces. */
@Immutable
data class SuseelaColors(
    val good: Color,
    val goodTint: Color,
    val warning: Color,
    val warningTint: Color,
    val bad: Color,
    val badTint: Color,
    val info: Color,
    val infoTint: Color,
    val neutral: Color,
    val neutralTint: Color,
    val gold: Color,
    val sectionLabel: Color,
    val nav: Color,
    val tableHeader: Color,
    val tableHeaderInk: Color,
    val track: Color,
    val border: Color,
    val shadow: Color,
)

val LightSuseelaColors = SuseelaColors(
    good = Good, goodTint = GoodTint,
    warning = Warning, warningTint = WarningTint,
    bad = Bad, badTint = BadTint,
    info = Info, infoTint = InfoTint,
    neutral = Neutral, neutralTint = NeutralTint,
    gold = BrandGold, sectionLabel = BrandGoldDeep,
    nav = NavSurface, tableHeader = TableHeader, tableHeaderInk = TableHeaderInk,
    track = Track, border = BorderSubtle, shadow = WarmShadow,
)

val DarkSuseelaColors = SuseelaColors(
    good = DarkGreen, goodTint = Color(0xFF1C3326),
    warning = DarkWarning, warningTint = Color(0xFF3A2C12),
    bad = DarkBad, badTint = Color(0xFF3D1E1A),
    info = DarkInfo, infoTint = Color(0xFF1A2C3A),
    neutral = DarkInkSecondary, neutralTint = DarkSurfaceHigh,
    gold = DarkGold, sectionLabel = DarkGold,
    nav = DarkSurface, tableHeader = DarkSurfaceHigh, tableHeaderInk = DarkInk,
    track = DarkSurfaceHighest, border = DarkBorder, shadow = Color(0x33000000),
)

val LocalSuseelaColors = staticCompositionLocalOf { LightSuseelaColors }
