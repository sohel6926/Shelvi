package com.example.suseelacateringcrm.ui.menupackages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.suseelacateringcrm.data.model.MealTab
import com.example.suseelacateringcrm.data.model.MenuPackage
import com.example.suseelacateringcrm.data.model.UserRole
import com.example.suseelacateringcrm.data.model.isAdmin
import com.example.suseelacateringcrm.data.model.canManage
import com.example.suseelacateringcrm.ui.components.AmountRow
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.ui.components.ErrorBanner
import com.example.suseelacateringcrm.ui.components.LoadingIndicator
import com.example.suseelacateringcrm.ui.components.NoticeBox
import com.example.suseelacateringcrm.ui.components.Pill
import com.example.suseelacateringcrm.ui.components.ScreenHeader
import com.example.suseelacateringcrm.ui.components.SectionLabel
import com.example.suseelacateringcrm.ui.components.Tone
import com.example.suseelacateringcrm.ui.components.rupees
import com.example.suseelacateringcrm.util.DayKey
import com.example.suseelacateringcrm.util.L
import com.example.suseelacateringcrm.util.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MenuPackagesScreen(
    role: UserRole?,
    padding: PaddingValues,
    onOpenPackage: (String) -> Unit,
    onQuote: (String) -> Unit,
    viewModel: MenuPackagesViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    Column(Modifier.padding(padding).fillMaxSize()) {
        TabRow(selectedTabIndex = viewModel.tab.ordinal) {
            MealTab.entries.forEach { t ->
                Tab(selected = viewModel.tab == t, onClick = { viewModel.tab = t }, text = { Text(t.label) })
            }
        }
        if (role.canManage) {
            // Food photos for the gallery — owner and manager (api-contract "Manager uploads").
            com.example.suseelacateringcrm.ui.components.PhotoUploadButton(
                folder = "gallery",
                label = L("ఆహారం ఫోటోలు జోడించు", "Add food photos"),
                modifier = Modifier.padding(start = 16.dp, top = 8.dp),
            )
        }
        if (role.isAdmin) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                OutlinedButton(
                    onClick = { viewModel.seed(context) },
                    enabled = viewModel.seedState !is UiState.Loading,
                ) { Text(L("10 మెనూలు ఎక్కించు (seed)", "Load the 10 menus (seed)")) }
                when (val s = viewModel.seedState) {
                    is UiState.Success -> NoticeBox(L("${s.data} మెనూలు ఎక్కించాం", "${s.data} menus loaded"), Tone.GOOD)
                    is UiState.Error -> NoticeBox(s.message, Tone.BAD)
                    else -> {}
                }
            }
        }
        Box(Modifier.fillMaxSize()) {
            when (val s = state) {
                is UiState.Loading -> LoadingIndicator()
                is UiState.Error -> ErrorBanner(s.message)
                is UiState.Success -> {
                    val list = s.data.filter { it.active && viewModel.tab.matches(it.mealType) }
                    if (list.isEmpty()) {
                        EmptyState(L("ఈ రకం మెనూలు లేవు", "No menus of this type yet"))
                    } else {
                        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(list, key = { it.id }) { pkg ->
                                PackageCard(pkg, onClick = { onOpenPackage(pkg.id) }, onQuote = { onQuote(pkg.id) })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PackageCard(pkg: MenuPackage, onClick: () -> Unit, onQuote: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(pkg.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text(rupees(pkg.pricePerPlate) + L(" / ప్లేట్", " / plate"), style = MaterialTheme.typography.titleMedium)
            }
            Text(
                L("కనీసం ${pkg.minOrder} ప్లేట్లు", "Minimum ${pkg.minOrder} plates") +
                    if (pkg.deliveryWindow.isNotBlank()) " · ${pkg.deliveryWindow}" else "",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (pkg.priceReviewDue) Pill(L("ధర సమీక్ష సమయం", "Price review due"), Tone.WARNING)
                if (pkg.menuDate == null) Pill(L("ధర తేదీ లేదు", "No price date"), Tone.INFO)
                if (pkg.freePlates != null) Pill(L("ఉచిత ప్లేట్లు", "Free plates"), Tone.GOOD)
            }
            OutlinedButton(onClick = onQuote, modifier = Modifier.padding(top = 4.dp)) {
                Text(L("కొటేషన్ తయారు చేయి", "Make quotation"))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MenuPackageDetailScreen(
    packageId: String,
    padding: PaddingValues,
    onQuote: (String) -> Unit,
) {
    val viewModel: MenuPackageDetailViewModel = viewModel(
        key = "menu-package-$packageId",
        factory = viewModelFactory { initializer { MenuPackageDetailViewModel(packageId) } },
    )
    val state by viewModel.pkg.collectAsStateWithLifecycle()
    when (val s = state) {
        is UiState.Loading -> LoadingIndicator(Modifier.padding(padding))
        is UiState.Error -> ErrorBanner(s.message, Modifier.padding(padding))
        is UiState.Success -> {
            val pkg = s.data
            if (pkg == null) {
                EmptyState(L("మెనూ దొరకలేదు", "Menu not found"), Modifier.padding(padding))
                return
            }
            Column(
                Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            ) {
                ScreenHeader(pkg.name, subtitle = pkg.deliveryWindow.ifBlank { null })
                if (pkg.priceReviewDue) {
                    NoticeBox(
                        L(
                            "ఈ ధర పెట్టి 12 నెలలు దాటింది (${DayKey.display(pkg.menuDate ?: "")}). ధర సమీక్షించండి.",
                            "This price is over 12 months old (${DayKey.display(pkg.menuDate ?: "")}). Review the price.",
                        ),
                        Tone.WARNING,
                    )
                }
                AmountRow(L("ఒక ప్లేట్ ధర", "Price per plate"), rupees(pkg.pricePerPlate), bold = true)
                AmountRow(L("కనీస order", "Minimum order"), L("${pkg.minOrder} ప్లేట్లు", "${pkg.minOrder} plates"))
                AmountRow(L("Serving boy (ఒక్కరికి)", "Serving boy (each)"), rupees(pkg.servingBoy.chargePerPerson))
                if (pkg.servingBoy.freeRule == "per50") {
                    Text(L("ప్రతి 50 ప్లేట్లకు 1 serving boy ఉచితం", "1 serving boy free per 50 plates"), style = MaterialTheme.typography.bodyMedium)
                }
                pkg.freePlates?.let {
                    Text(
                        L("ప్రతి ${it.perPlates} ప్లేట్లకు ${it.extraPlates} ప్లేట్లు ఉచితం", "${it.extraPlates} free plates per ${it.perPlates}"),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                if (pkg.transportCharged) {
                    Text(L("రవాణా ఖర్చు అదనం", "Transport is extra"), style = MaterialTheme.typography.bodyMedium)
                }

                SectionLabel(L("మెనూ (\"/\" ఉన్నచోట ఒకటి ఎంచుకోవాలి)", "Menu (pick one where there is a \"/\")"))
                pkg.groups.forEachIndexed { i, group ->
                    Text(
                        "${i + 1}. " + group.options.joinToString(" / ") { it.label },
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(vertical = 2.dp),
                    )
                }
                if (pkg.replacements.isNotEmpty()) {
                    SectionLabel(L("మార్పులు (ప్లేట్‌కి అదనం)", "Replacements (extra per plate)"))
                    pkg.replacements.forEach { r ->
                        AmountRow(L(r.te, r.en), if (r.extraPerPlate == 0.0) L("ఉచితం", "Free") else "+" + rupees(r.extraPerPlate))
                    }
                }
                if (pkg.extras.isNotEmpty()) {
                    SectionLabel(L("అదనపు వస్తువులు", "Extras"))
                    pkg.extras.forEach { e ->
                        AmountRow(L(e.te, e.en), e.price?.let { rupees(it) } ?: L("ధర అడగాలి", "Ask price"))
                    }
                }
                Button(onClick = { onQuote(pkg.id) }, modifier = Modifier.padding(top = 16.dp)) {
                    Text(L("ఈ మెనూతో కొటేషన్", "Quote with this menu"))
                }
                // R10-4: suggested price / plate cost / margin — owner only (owner rule A2: managers never see profit).
                if (com.example.suseelacateringcrm.di.ServiceLocator.currentRole().isAdmin) {
                    com.example.suseelacateringcrm.ui.owner.SuggestedPriceCard(pkg.id)
                }
                if (com.example.suseelacateringcrm.di.ServiceLocator.currentRole().canManage) {
                    com.example.suseelacateringcrm.ui.components.PhotoUploadButton(
                        folder = "menus/${pkg.id}",
                        label = L("ఈ మెనూ ఫోటోలు జోడించు", "Add photos of this menu"),
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }
    }
}
