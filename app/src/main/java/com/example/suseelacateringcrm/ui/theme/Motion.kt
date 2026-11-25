package com.example.suseelacateringcrm.ui.theme

import android.provider.Settings
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import android.icu.text.NumberFormat
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin

/*
 * Motion for the Suseela CRM Android app — kept light for low-cost phones:
 * animated values are read in the draw phase where possible, so a bar filling does not
 * recompose the screen. Everything here turns off when the phone's animations are off
 * (Developer options / Accessibility "Remove animations" set the animator duration scale to 0).
 * Motion never carries meaning alone: the progress bar always shows its % as text.
 */

object MotionTokens {
    const val PRESS_MS = 100
    const val FAST_MS = 150
    const val BASE_MS = 200          // screen enter (max 250)
    const val SLOW_MS = 300
    const val PROGRESS_FILL_MS = 500
    const val COUNT_UP_MS = 600
    const val CELEBRATE_MS = 900
    const val PRESS_SCALE = 0.97f

    val EaseOut = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)
    val EaseIn = CubicBezierEasing(0.7f, 0f, 0.84f, 0f)
    val Standard = CubicBezierEasing(0.2f, 0f, 0f, 1f)
}

/** True when the user has switched animations off. Provided by SuseelaCateringCRMTheme. */
val LocalReducedMotion = staticCompositionLocalOf { false }

@Composable
internal fun rememberSystemReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

// ---------------------------------------------------------------------------------------------
// Count-up
// ---------------------------------------------------------------------------------------------

/**
 * Animated whole number for KPIs: counts from 0 the first time, then from the previous value
 * when [target] changes. Uses a 0→1 fraction internally, so large rupee totals stay exact.
 * Reduced motion: returns [target] at once.
 */
@Composable
fun rememberCountUp(target: Long, durationMillis: Int = MotionTokens.COUNT_UP_MS): Long {
    val reduced = LocalReducedMotion.current
    val fraction = remember { Animatable(1f) }
    var from by remember { mutableLongStateOf(0L) }
    var to by remember { mutableLongStateOf(if (reduced) target else 0L) }

    LaunchedEffect(target, reduced) {
        if (reduced) {
            from = target
            to = target
            fraction.snapTo(1f)
            return@LaunchedEffect
        }
        val current = from + ((to - from) * fraction.value.toDouble()).roundToLong()
        from = current
        to = target
        fraction.snapTo(0f)
        fraction.animateTo(1f, tween(durationMillis, easing = MotionTokens.EaseOut))
    }
    return from + ((to - from) * fraction.value.toDouble()).roundToLong()
}

// android.icu (API 24+) knows Indian grouping; java.text.NumberFormat does not.
private val indianNumber: NumberFormat = NumberFormat.getIntegerInstance(Locale.forLanguageTag("en-IN"))

/** 1234567 -> "12,34,567". */
fun formatIndian(value: Long): String = indianNumber.format(value)

/**
 * KPI number that counts up. Baloo Tammudu 2 has no equal-width digits, so the final value is
 * laid out invisibly underneath to fix the width — the number never jitters sideways.
 * TalkBack reads only the final value.
 */
@Composable
fun CountUpText(
    value: Long,
    modifier: Modifier = Modifier,
    style: TextStyle = SuseelaType.kpi,
    color: Color = MaterialTheme.colorScheme.onSurface,
    format: (Long) -> String = ::formatIndian,
) {
    val shown = rememberCountUp(value)
    val finalText = format(value)
    Box(modifier.clearAndSetSemantics { contentDescription = finalText }) {
        Text(finalText, style = style, color = color, modifier = Modifier.alpha(0f))
        Text(format(shown), style = style, color = color)
    }
}

// ---------------------------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------------------------

/**
 * Progress bar that fills from 0 on first show (500 ms ease-out) and glides on later changes.
 * [progress] is 0f..1f. The bar is drawn on a Canvas, so filling does not recompose.
 * Gold is too light against the track (2.4:1), so use green / warning / bad for the bar.
 */
@Composable
fun AnimatedProgressBar(
    progress: Float,
    label: String,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.primary,
    trackColor: Color = SuseelaTheme.colors.track,
    height: Dp = 8.dp,
    showValue: Boolean = true,
    celebrateOnComplete: Boolean = false,
) {
    val reduced = LocalReducedMotion.current
    val target = progress.coerceIn(0f, 1f)
    val anim = remember { Animatable(if (reduced) target else 0f) }
    LaunchedEffect(target, reduced) {
        if (reduced) anim.snapTo(target)
        else anim.animateTo(target, tween(MotionTokens.PROGRESS_FILL_MS, easing = MotionTokens.EaseOut))
    }
    val percent = (target * 100).roundToInt()

    Row(
        modifier = modifier.clearAndSetSemantics {
            contentDescription = "$label $percent%"
            progressBarRangeInfo = ProgressBarRangeInfo(target, 0f..1f)
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .height(height)
            ) {
                val r = CornerRadius(size.height / 2, size.height / 2)
                drawRoundRect(trackColor, cornerRadius = r)
                val w = size.width * anim.value
                if (w > 0f) {
                    clipRect(right = w) { drawRoundRect(color, cornerRadius = r) }
                }
            }
            if (celebrateOnComplete) {
                GoldBurst(
                    active = target >= 1f,
                    delayMillis = MotionTokens.PROGRESS_FILL_MS,
                    modifier = Modifier.size(96.dp),
                )
            }
        }
        if (showValue) {
            Text(
                text = "$percent%",
                style = MaterialTheme.typography.labelMedium.tabular(),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Celebration
// ---------------------------------------------------------------------------------------------

/**
 * A short gold burst (ring + 14 dots) for "target reached". Plays once each time [active]
 * turns true, drawn on one Canvas. Decorative — always also say it in text
 * ("లక్ష్యం పూర్తి / Target reached"). Reduced motion: draws nothing.
 */
@Composable
fun GoldBurst(
    active: Boolean,
    modifier: Modifier = Modifier,
    delayMillis: Int = 0,
    gold: Color = SuseelaTheme.colors.gold,
    green: Color = MaterialTheme.colorScheme.primary,
) {
    val reduced = LocalReducedMotion.current
    val t = remember { Animatable(1f) }   // 1f = finished / invisible
    LaunchedEffect(active, reduced) {
        if (!active || reduced) {
            t.snapTo(1f)
            return@LaunchedEffect
        }
        delay(delayMillis.toLong())
        t.snapTo(0f)
        t.animateTo(1f, tween(MotionTokens.CELEBRATE_MS, easing = LinearEasing))
    }
    if (reduced) return

    Canvas(modifier) {
        val p = t.value
        if (p >= 1f) return@Canvas
        val eased = MotionTokens.EaseOut.transform(p)
        val alpha = if (p < 0.7f) 1f else (1f - p) / 0.3f
        val center = Offset(size.width / 2, size.height / 2)
        val maxR = size.minDimension / 2

        drawCircle(
            color = gold.copy(alpha = alpha * 0.9f),
            radius = maxR * (0.3f + 0.7f * eased),
            center = center,
            style = Stroke(width = 2.dp.toPx()),
        )
        val count = 14
        for (i in 0 until count) {
            val angle = (i.toDouble() / count) * 2 * PI
            val reach = if (i % 2 == 0) 0.95f else 0.7f
            val d = maxR * reach * eased
            val pos = Offset(center.x + (cos(angle) * d).toFloat(), center.y + (sin(angle) * d).toFloat())
            val dotR = 3.5.dp.toPx() * (1f - 0.6f * eased)
            drawCircle(color = (if (i % 4 == 1) green else gold).copy(alpha = alpha), radius = dotR, center = pos)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Press feedback and screen transitions
// ---------------------------------------------------------------------------------------------

/**
 * Small shrink while pressed (100 ms). Pass the same interactionSource you give the button.
 * Reduced motion: no scale (the ripple still shows the press).
 */
@Composable
fun Modifier.pressFeedback(interactionSource: InteractionSource): Modifier {
    val reduced = LocalReducedMotion.current
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && !reduced) MotionTokens.PRESS_SCALE else 1f,
        animationSpec = tween(MotionTokens.PRESS_MS, easing = MotionTokens.Standard),
        label = "press",
    )
    return this.graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/** For NavHost(enterTransition = { screenEnter(reduced) }, exitTransition = { screenExit(reduced) }). */
fun screenEnter(reduced: Boolean): EnterTransition =
    if (reduced) EnterTransition.None
    else fadeIn(tween(MotionTokens.BASE_MS, easing = MotionTokens.EaseOut)) +
        slideInVertically(tween(MotionTokens.BASE_MS, easing = MotionTokens.EaseOut)) { it / 40 }

fun screenExit(reduced: Boolean): ExitTransition =
    if (reduced) ExitTransition.None
    else fadeOut(tween(MotionTokens.FAST_MS, easing = MotionTokens.EaseIn))
