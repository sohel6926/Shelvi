package com.example.suseelacateringcrm.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/*
 * Material 3 roles mapped to the Suseela tokens.
 * - secondaryContainer is solid green + white: M3 uses it for the selected item in the
 *   navigation drawer, bottom bar and FilterChip, which gives the brand "selected = green" look.
 *   Add Modifier.navSelectedBar() (Decor.kt) to a selected drawer item for the gold bar.
 * - tertiary is the logo gold (decorative fills only; text on it uses onTertiary, 5.22:1).
 */
private val LightColorScheme = lightColorScheme(
    primary = BrandGreen,
    onPrimary = Color.White,                 // 6.22:1
    primaryContainer = BrandGreenTint,
    onPrimaryContainer = Color(0xFF0F3D25),  // 10.53:1
    inversePrimary = DarkGreen,
    secondary = BrandGoldDeep,
    onSecondary = Color.White,               // 6.33:1
    secondaryContainer = BrandGreen,
    onSecondaryContainer = Color.White,      // 6.22:1
    tertiary = BrandGold,
    onTertiary = OnGold,                     // 5.22:1
    tertiaryContainer = WarningTint,
    onTertiaryContainer = BrandGoldDeep,
    background = Cream,
    onBackground = Ink,
    surface = Raised,
    onSurface = Ink,
    surfaceVariant = TableHeader,
    onSurfaceVariant = InkSecondary,         // 6.04:1 on TableHeader
    surfaceTint = Color.Transparent,         // no green wash on elevated surfaces
    surfaceBright = Raised,
    surfaceDim = NeutralTint,
    surfaceContainerLowest = Raised,
    surfaceContainerLow = NavSurface,
    surfaceContainer = NavSurface,
    surfaceContainerHigh = RowHover,
    surfaceContainerHighest = Raised,        // filled Card = white, as the KPI card spec says
    outline = BorderStrong,
    outlineVariant = BorderSubtle,
    error = Bad,
    onError = Color.White,
    errorContainer = BadTint,
    onErrorContainer = Color(0xFF7A1A11),    // 8.78:1
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkGreen,
    onPrimary = DarkOnGreen,
    primaryContainer = BrandGreen,
    onPrimaryContainer = BrandGreenTint,     // 5.35:1
    inversePrimary = BrandGreen,
    secondary = DarkGold,
    onSecondary = Color(0xFF2A1C00),         // 8.46:1
    secondaryContainer = BrandGreen,
    onSecondaryContainer = Color.White,
    tertiary = DarkGold,
    onTertiary = Color(0xFF2A1C00),
    background = DarkCanvas,
    onBackground = DarkInk,
    surface = DarkSurface,
    onSurface = DarkInk,
    surfaceVariant = DarkSurfaceHigh,
    onSurfaceVariant = DarkInkSecondary,
    surfaceTint = Color.Transparent,
    surfaceBright = DarkSurfaceHighest,
    surfaceDim = DarkCanvas,
    surfaceContainerLowest = Color(0xFF0E120F),
    surfaceContainerLow = Color(0xFF171C19),
    surfaceContainer = DarkSurface,
    surfaceContainerHigh = DarkSurfaceHigh,
    surfaceContainerHighest = DarkSurfaceHighest,
    outline = Color(0xFF4A544D),
    outlineVariant = DarkBorder,
    error = DarkBad,
    onError = Color(0xFF5C130B),             // 6.79:1
    errorContainer = Color(0xFF3D1E1A),
    onErrorContainer = DarkBad,
)

/** Radii from tokens.json: sm 8, md 10, lg 14; buttons and chips are pills (Material default). */
val SuseelaShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(14.dp),
    extraLarge = RoundedCornerShape(14.dp),
)

@Composable
fun SuseelaCateringCRMTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Off by default so the brand palette above always shows, instead of the phone wallpaper's Material You colors.
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }

        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    val suseelaColors = if (darkTheme) DarkSuseelaColors else LightSuseelaColors
    val reducedMotion = rememberSystemReducedMotion()

    CompositionLocalProvider(
        LocalSuseelaColors provides suseelaColors,
        LocalReducedMotion provides reducedMotion,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            shapes = SuseelaShapes,
            content = content
        )
    }
}

/** Access the Suseela extras: SuseelaTheme.colors.warning, SuseelaTheme.reducedMotion … */
object SuseelaTheme {
    val colors: SuseelaColors
        @Composable @ReadOnlyComposable get() = LocalSuseelaColors.current

    val reducedMotion: Boolean
        @Composable @ReadOnlyComposable get() = LocalReducedMotion.current
}
