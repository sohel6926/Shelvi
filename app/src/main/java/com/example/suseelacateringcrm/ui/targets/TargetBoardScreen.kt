package com.example.suseelacateringcrm.ui.targets

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.remote.CallableError
import com.example.suseelacateringcrm.data.remote.TargetBoard
import com.example.suseelacateringcrm.data.repository.TargetRepository
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.theme.AnimatedProgressBar
import com.example.suseelacateringcrm.ui.theme.CountUpText
import com.example.suseelacateringcrm.ui.theme.GoldBurst
import com.example.suseelacateringcrm.ui.theme.SuseelaTheme
import com.example.suseelacateringcrm.ui.theme.SuseelaType
import com.example.suseelacateringcrm.ui.theme.formatIndian
import com.example.suseelacateringcrm.ui.theme.kpiCard
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState
import kotlinx.coroutines.launch
import com.example.suseelacateringcrm.util.catchLogged
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Round 11 — the Target Board is the first screen after login for everyone (admin, manager, staff).
 * getTargetBoard filters by role on the server: profit only for the owner; ₹ sales for managers / staff only
 * when the owner turned on "అందరికీ ₹ చూపించు". This screen shows what it gets and never computes a target.
 */
class TargetBoardViewModel(
    private val repository: TargetRepository = ServiceLocator.targetRepository,
) : ViewModel() {
    /** settings/business (admin + manager may read it): calc modes and managerCanOverride. */
    var business by mutableStateOf<com.example.suseelacateringcrm.data.model.BusinessSettings?>(null)
        private set

    private fun watchSettings() {
        if (ServiceLocator.currentRole() == UserRole.STAFF) return
        viewModelScope.launch {
            ServiceLocator.settingsRepository.businessFlow()
                .catchLogged("SettingsWatch")
                .collect { business = it }
        }
    }

    /** settings.calcModes.targets == "manual" → typing the month target is offered by default. */
    val manualMode: Boolean
        get() = business?.modeOf(com.example.suseelacateringcrm.data.model.CalcArea.TARGETS) == "manual"

    var month by mutableStateOf(DayKey.thisMonth())
        private set
    var state by mutableStateOf<UiState<TargetBoard>>(UiState.Loading)
        private set

    /** "hh:mm a" India time of the last successful load ("చివరి update"). */
    var updatedAt by mutableStateOf<String?>(null)
        private set
    var refreshing by mutableStateOf(false)
        private set

    init {
        watchSettings()
        load()
    }

    fun shift(delta: Int) {
        month = DayKey.shiftMonth(month, delta)
        state = UiState.Loading
        load()
    }

    val isAdmin: Boolean = ServiceLocator.currentRole() == UserRole.ADMIN
    /** Dashboard stays one tap away for the owner and managers (staff keep it in the menu). */
    val showDashboardButton: Boolean = ServiceLocator.currentRole() != UserRole.STAFF

    /** Month target by hand (setYearTarget with manualMonths) — owner only (targets are admin data). */
    suspend fun overrideMonthTarget(board: TargetBoard, manual: com.example.suseelacateringcrm.data.remote.ManualOverride): String? {
        val year = board.year ?: month.take(4).toIntOrNull() ?: return L("సంవత్సరం తెలియలేదు", "Unknown year")
        val yearTarget = board.yearTarget ?: return L("సంవత్సర లక్ష్యం ఇంకా పెట్టలేదు", "No year target set yet")
        val monthIndex = (month.drop(5).take(2).toIntOrNull() ?: 1) - 1
        // Send the whole year: keep every other month's typed value, change only this month.
        val existing = try {
            repository.manualMonths(year)
        } catch (e: Exception) {
            return L("ఇప్పటి లక్ష్యాలు చదవలేకపోయాం — ఇంటర్నెట్ చూడండి", "Could not read the current targets — check the internet")
        }
        val err = ServiceLocator.functions.setMonthTargetManual(year, yearTarget, existing, monthIndex, manual)
            .exceptionOrNull()?.let { CallableError.from(it).text }
        if (err == null) load()
        return err
    }

    fun load() {
        viewModelScope.launch {
            // Keep the board on screen while refreshing (no flash back to the spinner).
            if (state !is UiState.Success) state = UiState.Loading
            refreshing = true
            state = repository.board(month).fold(
                onSuccess = {
                    updatedAt = SimpleDateFormat("hh:mm a", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(Date())
                    UiState.Success(it)
                },
                onFailure = { UiState.Error(CallableError.from(it).text) },
            )
            refreshing = false
        }
    }
}

/** Display-only ratio (never saved). Prefers the percent the server sent. */
private fun fraction(actual: Double?, target: Double?, serverPercent: Double?): Float? = when {
    serverPercent != null -> (serverPercent / 100.0).toFloat()
    actual != null && target != null && target > 0 -> (actual / target).toFloat()
    else -> null
}

private fun rupeesWhole(v: Long): String = "₹" + formatIndian(v)

private fun Double?.whole(): Long = (this ?: 0.0).roundToLong()

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TargetBoardScreen(
    padding: PaddingValues,
    onOpenDashboard: () -> Unit = {},
    viewModel: TargetBoardViewModel = viewModel(),
) {
    com.example.suseelacateringcrm.util.OnRefresh { viewModel.load() }
    val colors = SuseelaTheme.colors
    val green = MaterialTheme.colorScheme.primary
    Column(Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        // ---- Festive header in the logo colours ---------------------------------------------------
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Brush.linearGradient(listOf(green, green, colors.gold)))
                .padding(16.dp),
        ) {
            Text(
                L("లక్ష్య బోర్డు", "Target Board"),
                style = SuseelaType.kpi.copy(fontSize = 32.sp, lineHeight = 40.sp),
                color = Color.White,
            )
            Text(
                L("${viewModel.month} — మనం ఎంత దగ్గరలో ఉన్నాం", "${viewModel.month} — how close we are"),
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White,
            )
            FlowRow(
                Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                IconButton(onClick = { viewModel.shift(-1) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, L("ముందు నెల", "Previous month"), tint = Color.White) }
                IconButton(onClick = { viewModel.shift(1) }) { Icon(Icons.AutoMirrored.Filled.ArrowForward, L("తర్వాతి నెల", "Next month"), tint = Color.White) }
                OutlinedButton(onClick = { viewModel.load() }, enabled = !viewModel.refreshing) {
                    Icon(Icons.Filled.Refresh, contentDescription = null, tint = Color.White)
                    Text(" " + L("Refresh", "Refresh"), color = Color.White)
                }
                if (viewModel.showDashboardButton) {
                    OutlinedButton(onClick = onOpenDashboard) {
                        Icon(Icons.Filled.Dashboard, contentDescription = null, tint = Color.White)
                        Text(" " + L("డాష్‌బోర్డ్", "Dashboard"), color = Color.White)
                    }
                }
            }
        }
        viewModel.updatedAt?.let {
            Text(
                L("చివరి update: $it", "Last update: $it"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
        when (val s = viewModel.state) {
            is UiState.Loading -> LoadingIndicator(Modifier.padding(32.dp))
            is UiState.Error -> {
                NoticeBox(s.message, Tone.BAD)
                OutlinedButton(onClick = { viewModel.load() }) { Text(L("మళ్ళీ ప్రయత్నించు", "Try again")) }
            }
            is UiState.Success -> Board(
                s.data,
                percentOnly = s.data.percentOnly,
                showProfit = s.data.showProfit && viewModel.isAdmin,
                canOverride = viewModel.isAdmin,
                manualMode = viewModel.manualMode,
                onOverride = { m -> viewModel.overrideMonthTarget(s.data, m) },
            )
        }
    }
}

@Composable
private fun Board(
    b: TargetBoard,
    percentOnly: Boolean,
    showProfit: Boolean,
    canOverride: Boolean,
    manualMode: Boolean,
    onOverride: suspend (com.example.suseelacateringcrm.data.remote.ManualOverride) -> String?,
) {
    val colors = SuseelaTheme.colors
    val monthFrac = fraction(b.monthActual, b.monthTarget, b.incomePct) ?: 0f
    val yearFrac = fraction(b.yearActual, b.yearTarget, b.yearPct)
    val todayFrac = fraction(b.todayActual, b.todayTarget, b.todayPct)
    val profitFrac = fraction(b.profitActual, b.profitTarget, b.profitPct)
    val reached = b.hitTarget || monthFrac >= 1f
    val showRupees = !percentOnly && b.monthActual != null
    val bigKpi = SuseelaType.kpi.copy(fontSize = 52.sp, lineHeight = 60.sp)

    // ---- This month: the one number that matters --------------------------------------------
    Column(Modifier.fillMaxWidth().padding(top = 12.dp).kpiCard(if (reached) colors.good else colors.warning).padding(20.dp)) {
        Text(L("ఈ నెల అమ్మకాలు", "This month's sales"), style = SuseelaType.section.copy(fontSize = 17.sp), color = colors.sectionLabel)
        Box(contentAlignment = Alignment.Center) {
            if (showRupees) {
                CountUpText(b.monthActual.whole(), style = bigKpi, format = ::rupeesWhole)
            } else {
                CountUpText((monthFrac * 100).toDouble().roundToLong(), style = bigKpi, format = { "$it%" })
            }
            GoldBurst(active = reached, modifier = Modifier.size(180.dp), delayMillis = 300)
        }
        if (showRupees && b.monthTarget != null) {
            Text(L("లక్ష్యం ", "Target ") + rupeesWhole(b.monthTarget.whole()), style = MaterialTheme.typography.titleMedium)
        }
        // Everyone sees whether the month target is automatic or typed by hand.
        com.example.suseelacateringcrm.ui.components.CalcModeChip(
            info = b.monthTargetCalc,
            currentValue = if (showRupees) b.monthTarget else null,
            canOverride = canOverride && showRupees,
            valueLabel = L("ఈ నెల లక్ష్యం (₹)", "This month's target (₹)"),
            manualMode = manualMode,
            onOverride = onOverride,
        )
        AnimatedProgressBar(
            progress = monthFrac,
            label = L("ఈ నెల లక్ష్యం", "This month's target"),
            color = if (reached) colors.good else MaterialTheme.colorScheme.primary,
            height = 16.dp,
            celebrateOnComplete = true,
            modifier = Modifier.padding(top = 10.dp),
        )
        val daily = b.dailyNeeded
        if (reached) {
            Text(
                L("ఈ నెల లక్ష్యం పూర్తి! అభినందనలు 🎉", "This month's target is done! Well done 🎉"),
                style = MaterialTheme.typography.titleLarge,
                color = colors.good,
                modifier = Modifier.padding(top = 8.dp),
            )
        } else if (showRupees && daily != null && daily > 0 && b.daysLeft > 0) {
            Text(
                L("రోజుకి ఇంకా ${rupeesWhole(daily.whole())} కావాలి", "${rupeesWhole(daily.whole())} more needed per day"),
                style = SuseelaType.kpi.copy(fontSize = 26.sp, lineHeight = 34.sp),
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        if (!reached) {
            Text(L("ఇంకా ${b.daysLeft} రోజులు ఉన్నాయి", "${b.daysLeft} days left"), style = MaterialTheme.typography.titleMedium)
        }
        b.aheadStatus?.let { st ->
            val amount = b.aheadOrBehind
            val (text, tone) = when (st) {
                "ahead" -> L("సంవత్సర plan కంటే ముందున్నాం", "Ahead of the year plan") +
                    (if (!percentOnly && amount != null) " · +" + rupeesWhole(amount.whole()) else "") to colors.good
                "behind" -> L("సంవత్సర plan కంటే వెనకబడ్డాం", "Behind the year plan") +
                    (if (!percentOnly && amount != null) " · " + rupeesWhole(abs(amount).roundToLong()) else "") to colors.warning
                else -> L("సంవత్సర plan ప్రకారమే ఉన్నాం", "On the year plan") to colors.good
            }
            Text(text, style = MaterialTheme.typography.titleSmall, color = tone, modifier = Modifier.padding(top = 6.dp))
        }
    }

    // ---- Today ----------------------------------------------------------------------------------
    if (todayFrac != null || b.todayTarget != null) {
        Column(Modifier.fillMaxWidth().padding(top = 16.dp).kpiCard(if (b.todayHit) colors.good else colors.info).padding(16.dp)) {
            Text(L("ఈరోజు అమ్మకాలు", "Today's sales"), style = SuseelaType.section.copy(fontSize = 16.sp), color = colors.sectionLabel)
            if (showRupees && b.todayActual != null) {
                Text(
                    rupeesWhole(b.todayActual.whole()) + (b.todayTarget?.let { L(" / లక్ష్యం ", " / target ") + rupeesWhole(it.whole()) } ?: ""),
                    style = MaterialTheme.typography.titleLarge,
                )
            }
            todayFrac?.let {
                AnimatedProgressBar(progress = it, label = L("ఈరోజు లక్ష్యం", "Today's target"), height = 12.dp, celebrateOnComplete = true, modifier = Modifier.padding(top = 8.dp))
            }
            if (b.todayHit) Text(L("ఈరోజు లక్ష్యం పూర్తి!", "Today's target reached!"), color = colors.good, style = MaterialTheme.typography.titleMedium)
        }
    }

    // ---- Year -------------------------------------------------------------------------------------
    if (yearFrac != null) {
        Column(Modifier.fillMaxWidth().padding(top = 16.dp).kpiCard(colors.info).padding(16.dp)) {
            Text(L("ఈ సంవత్సరం", "This year"), style = SuseelaType.section.copy(fontSize = 16.sp), color = colors.sectionLabel)
            if (showRupees && b.yearActual != null && b.yearTarget != null) {
                Text(
                    rupeesWhole(b.yearActual.whole()) + L(" / లక్ష్యం ", " / target ") + rupeesWhole(b.yearTarget.whole()),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            AnimatedProgressBar(progress = yearFrac, label = L("సంవత్సర లక్ష్యం", "Year target"), height = 12.dp, modifier = Modifier.padding(top = 8.dp))
        }
    }

    Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f).kpiCard(colors.neutral).padding(14.dp)) {
            Text(L("కార్యక్రమాలు (ఈ నెల)", "Events (this month)"), style = SuseelaType.section, color = colors.sectionLabel)
            CountUpText(b.events.actual.toLong())
            b.events.target?.let { Text(L("లక్ష్యం $it", "Target $it"), style = MaterialTheme.typography.bodySmall) }
        }
        Column(Modifier.weight(1f).kpiCard(colors.neutral).padding(14.dp)) {
            Text(L("కొత్త bookings", "New bookings"), style = SuseelaType.section, color = colors.sectionLabel)
            CountUpText(b.bookings.actual.toLong())
            b.bookings.target?.let { Text(L("లక్ష్యం $it", "Target $it"), style = MaterialTheme.typography.bodySmall) }
        }
    }

    // ---- Profit: owner only (the server sends nothing to others) -------------------------------
    if (showProfit && profitFrac != null) {
        Column(Modifier.fillMaxWidth().padding(top = 16.dp).kpiCard(colors.good).padding(16.dp)) {
            Text(L("లాభం (ఈ నెల) — మీకు మాత్రమే", "Profit (this month) — only you see this"), style = SuseelaType.section, color = colors.sectionLabel)
            if (b.profitActual != null && b.profitTarget != null) {
                Text(
                    rupeesWhole(b.profitActual.whole()) + L(" / లక్ష్యం ", " / target ") + rupeesWhole(b.profitTarget.whole()),
                    style = MaterialTheme.typography.titleMedium,
                    color = if (b.profitActual < 0) colors.bad else Color.Unspecified,
                )
            }
            AnimatedProgressBar(progress = profitFrac, label = L("లాభం లక్ష్యం", "Profit target"), color = colors.good, modifier = Modifier.padding(top = 8.dp))
        }
    }

    if (percentOnly && !canOverride) {
        Text(
            L("₹ అంకెలు యజమాని మాత్రమే చూస్తారు; మీకు % కనిపిస్తుంది.", "₹ figures are for the owner; you see percentages."),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}
