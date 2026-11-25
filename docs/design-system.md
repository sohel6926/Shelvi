# సుశీల క్యాటరింగ్స్ CRM — డిజైన్ వ్యవస్థ (Design system)

## యజమానికి సంక్షిప్తంగా

- **రంగులు మన లోగో నుంచే.** ఆకుపచ్చ (#1F6E45) ముఖ్యమైన బటన్లకు, ఎంచుకున్న మెనూకు. బంగారు రంగు (#C08A2E) అలంకారానికి మాత్రమే: చిన్న గీతలు, చుక్కలు. పేజీ వెనుక రంగు లేత క్రీమ్.
- **అక్షరాలు స్పష్టంగా కనిపిస్తాయి.** ప్రతి అక్షరపు రంగుకి, దాని వెనుక రంగుకి మధ్య తేడాని కొలిచి చూశాం. అన్నీ అంతర్జాతీయ ప్రమాణం (WCAG AA, 4.5:1) దాటాయి.
- **స్థితి రంగులు:** ఆకుపచ్చ అంటే బాగుంది / చెల్లించారు. కాషాయం అంటే జాగ్రత్త / కొంత బాకీ. ఎరుపు అంటే సమస్య / బాకీ. నీలం అంటే సమాచారం. రంగుతో పాటు ఎప్పుడూ మాట కూడా రాసి ఉంటుంది.
- **ఫాంట్లు (Google Fonts, ఉచితం):** శీర్షికలకు, పెద్ద సంఖ్యలకు Baloo Tammudu 2. మామూలు అక్షరాలకు, పట్టికలకు Anek Telugu. ప్రింట్ చేసే ఇన్వాయిస్ / కొటేషన్‌కి Hind Guntur.
- **బటన్లు పెద్దవి:** వేలితో సులువుగా నొక్కేంత (కనీసం 44px / 48dp).
- **కదలికలు:** KPI సంఖ్యలు 0 నుంచి లెక్కపెడుతూ పెరుగుతాయి. ప్రోగ్రెస్ బార్ నిండుతుంది. లక్ష్యం 100% చేరితే చిన్న బంగారు మెరుపు వస్తుంది. ఫోన్‌లో "యానిమేషన్లు తీసేయి" (Remove animations) ఆన్ చేస్తే ఇవన్నీ ఆగిపోతాయి.
- **సంప్రదాయ స్పర్శ:** పేజీ శీర్షిక కింద చిన్న బంగారు ముగ్గు చుక్కల గీత. ఒక పేజీలో ఒక్కసారే వాడతాం.

---

## For developers

**Single source of truth: `design/tokens.json`.** Change a value there first, then mirror it in:

| Client | Files |
|---|---|
| Web (MUI) | `web/src/theme/tokens.ts` (theme + `tokens`, `kpiCardSx`, `kolamDividerSx`, `tabularNums`), `web/src/theme/motion.tsx`, fonts in `web/index.html` |
| Android (Compose M3) | `ui/theme/Color.kt`, `Type.kt`, `Theme.kt`, `Motion.kt`, `Decor.kt`, `res/values/font_certs.xml`, dependency `androidx.compose.ui:ui-text-google-fonts` (version from the Compose BOM) |

### Colour and measured contrast (WCAG 2.x)

| Token | Hex | White | Cream #F7F4EC | Other |
|---|---|---|---|---|
| Text | #1C2421 | 15.86 | 14.43 | 13.35 on table header |
| Secondary text | #4F5A55 | 7.18 | 6.53 | 6.04 on table header |
| Section label | #8A5300 | 6.33 | 5.76 | 6.23 on nav #FFFDF8 |
| Table header text | #4A3A12 | | | 9.27 on #F1EBDD |
| Primary green | #1F6E45 | 6.22 | 5.66 | white on it 6.22, on #185A38 8.21 |
| Gold (decorative) | #C08A2E | 3.04 | 2.76 | **never text**; #1C2421 on gold 5.22 |
| Good | #1F6E45 | 6.22 | 5.66 | 5.35 on tint #E4F1E8 |
| Warning | #945C00 | 5.54 | 5.04 | 4.84 on tint #FBEEDA |
| Bad | #B42318 | 6.57 | 5.98 | 5.45 on tint #FBE5E2 |
| Info | #205E8C | 6.91 | 6.28 | 5.86 on tint #E3EEF6 |
| Neutral chip | #4A3A12 | | | 9.11 on tint #EFE9DC |

Progress bars: green bar vs track #ECE4D2 is 4.92:1. Gold vs track is 2.40:1, so gold is never used as a bar colour. Android dark-scheme pairs (text, status colours and their dark tints) all measure 5.09:1 or higher. The numbers are in `tokens.json`.

Colour budget: cream canvas around 60%, white cards / nav / tables around 30%, green accent around 10% (primary buttons, selected nav, links, focus). Status colours only appear on chips, numbers and bars.

### Type

Minor-third scale from 16px: 12 · 14 · 16 · 19 · 23 · 28 · 33 · 40. Only weights 400 / 500 / 600.

- Headings `h1`–`h6` and the `kpi` variant use **Baloo Tammudu 2**. Body, tables and buttons use **Anek Telugu**. The `print` variant / `SuseelaType.print` uses **Hind Guntur**.
- Telugu has tall vowel signs, so line heights are 1.3–1.4 for headings and 1.6 for body. That is taller than Latin-only defaults on purpose.
- Table rows use 16px, headers 14px. 12px is for timestamps and helper text only.
- **Tabular figures (checked in the font files):** Anek Telugu has `tnum`, and it is on for every table cell (web `MuiTableCell`, Android `SuseelaType.tableCell` / `.tabular()`). Baloo Tammudu 2 and Hind Guntur have **no** `tnum`. `<CountUp/>` / `CountUpText` reserve the final width so animating KPI numbers don't jitter. On printed invoices, right-align amount columns (or set them in Anek Telugu with tnum).
- Web loads fonts from Google Fonts with `display=swap`. A font file only downloads once a glyph needs it, so Hind Guntur costs nothing until a print view renders. Android downloads fonts through Google Play services. Phones without Play services fall back to the system Telugu font.

### Components (web theme overrides)

- **Button:** pill shape, at least 44px tall, no uppercase, weight 500. It shrinks to 0.97 for 100ms while pressed.
- **Nav (`ListItemButton`):** at least 48px tall. Selected = green fill, white text and a 4px gold inset bar on the left. Group headers (`ListSubheader`) are 14px / 600 in #8A5300. The drawer is #FFFDF8 with a #ECE4D2 right border. The AppBar has a 3px gold underline.
- **Paper / Card:** white, 14px radius, 1px #ECE4D2 border and the warm shadow. KPI cards use `sx={kpiCardSx("good")}` (4px coloured top border). Lead with the one number that matters instead of a grid of identical tiles.
- **Table:** header row #F1EBDD with #4A3A12 text, hairline row dividers, row hover #FBF8F1, tabular digits.
- **Chip:** status chips (`color="success|warning|error|info"`, filled) render as soft tint + dark text, so the existing `StatusChip` picks this up with no code change. Clickable chips are 44px pills for choices.
- **Focus:** 2px green outline, 2px offset, on every interactive element.

On Android, M3's `secondaryContainer` is set to solid green + white. The selected drawer item, bottom-bar indicator and selected `FilterChip` get the brand look automatically. Add `Modifier.navSelectedBar(selected)` for the gold bar. Use `Modifier.kpiCard(SuseelaTheme.colors.good)` for KPI cards and `KolamDivider()` for the dot rule.

### Motion

| Use | Duration | Easing |
|---|---|---|
| Press feedback | 100ms | standard |
| Hover / exit | 150ms | ease-in on exit |
| Screen enter (fade + 4px rise) | 200ms | ease-out |
| Progress fill | 500ms (exception) | ease-out |
| KPI count-up | 600ms (exception) | ease-out |
| Target-reached gold burst | 900ms, once (exception) | ease-out |

Only `transform` and `opacity` animate. The count-up changes only the text. There are no bounce curves and no infinite loops.

- Web: `useCountUp(value, ms)`, `<CountUp value={…} />`, `<AnimatedProgress value={72} label="ఈ నెల లక్ష్యం / This month's target" celebrateOnComplete />`, `<Celebrate active />`, `usePrefersReducedMotion()`, `screenEnterSx`.
- Android: `rememberCountUp(target)`, `CountUpText(value)`, `AnimatedProgressBar(progress, label, celebrateOnComplete = true)`, `GoldBurst(active)`, `Modifier.pressFeedback(interactionSource)`, `screenEnter(reduced)` / `screenExit(reduced)` for `NavHost`.
- **Reduced motion:** on the web, `prefers-reduced-motion: reduce` makes every helper jump to its final state, and a global CSS reset in `CssBaseline` covers MUI's own transitions. On Android, an animator duration scale of 0 ("Remove animations") does the same through `LocalReducedMotion`.
- Motion never carries meaning alone. Progress always shows its % as text, and a reached target must also say so in words ("లక్ష్యం పూర్తి / Target reached").

### Known gaps

- `web/src/index.css` is still the Vite starter stylesheet (18px root font, dark `color-scheme`, a centred 1126px `#root` with `text-align: center`, purple accent variables). The theme neutralises these through `CssBaseline`. The clean fix is to empty that file.
- The web theme is light-only. Android has a matching dark scheme.
- The Android GoogleFont provider needs Google Play services. You can preload the fonts with the `preloaded_fonts` manifest entry if first-launch font swap is noticeable.
