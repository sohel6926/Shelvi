package com.example.suseelacateringcrm.ui.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp

/** 14dp corners for cards, KPI cards and table panels. */
val CardShape = RoundedCornerShape(14.dp)

/**
 * KPI / stat card surface: white, 14dp corners, 1dp warm hairline, 4dp coloured top border,
 * soft warm shadow. Add your own padding inside. Example:
 *   Column(Modifier.kpiCard(SuseelaTheme.colors.good).padding(20.dp)) { … }
 * Don't make every KPI an identical tile — lead with the one number that matters.
 */
fun Modifier.kpiCard(
    accent: Color,
    surface: Color = Raised,
    border: Color = BorderSubtle,
    shadowColor: Color = WarmShadow,
): Modifier = this
    .shadow(elevation = 4.dp, shape = CardShape, clip = false, ambientColor = shadowColor, spotColor = shadowColor)
    .clip(CardShape)
    .background(surface)
    .border(1.dp, border, CardShape)
    .drawBehind { drawRect(accent, size = Size(size.width, 4.dp.toPx())) }

/** 4dp gold bar on the start edge of the selected navigation item. */
fun Modifier.navSelectedBar(selected: Boolean, color: Color = BrandGold): Modifier =
    if (!selected) this
    else this.drawBehind { drawRect(color, size = Size(4.dp.toPx(), size.height)) }

/**
 * Restrained traditional touch: one row of small gold "kolam" dots. Use once per screen at
 * most (e.g. under a page title). Decorative, hidden from TalkBack.
 */
@Composable
fun KolamDivider(modifier: Modifier = Modifier, color: Color = SuseelaTheme.colors.gold) {
    Canvas(
        modifier
            .widthIn(max = 240.dp)
            .fillMaxWidth()
            .height(6.dp)
            .clearAndSetSemantics { }
    ) {
        val step = 12.dp.toPx()
        val r = 1.4.dp.toPx()
        var x = step / 2
        while (x < size.width) {
            drawCircle(color.copy(alpha = 0.7f), radius = r, center = Offset(x, size.height / 2))
            x += step
        }
    }
}
