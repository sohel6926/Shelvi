# Suseela Caterings CRM — అన్ని points (Master checklist)

ఓనర్ చెప్పిన ప్రతి విషయం ఇక్కడ ఉంది. ప్రతి దశ చివర ఈ list మళ్ళీ చూసి ✅ పెడతాం — ఏదీ మిస్ అవ్వకూడదు.
Status: ✅ పూర్తి · 🔄 జరుగుతోంది · ⏳ తర్వాతి దశ (number = దశ) · ❓ ఓనర్ సమాధానం కావాలి

## A. పునాది & భద్రత
| # | Point | Status |
|---|---|---|
| A1 | Security fix: కొత్త users approve అయ్యే వరకు data కనిపించకూడదు (Pending approval screen) | ✅ server + web + phone (Pending approval screen, rules) · deploy 🔑 |
| A2 | Roles: Owner (admin), **Manager** (లాభం కనిపించదు), Staff | ✅ rules + web + phone; Manager కి లాభం/₹ కనిపించదు (getPnl Admin మాత్రమే, Target Board % మాత్రమే) |
| A3 | రెండో admin (owner phone పోయినా పని ఆగకూడదు) | 🔑 code ✅ (Users page లో Admin role ఇవ్వొచ్చు) — రెండో admin ని ఓనర్ పెట్టాలి |
| A4 | డబ్బు లెక్కలు server మాత్రమే రాస్తుంది (phone/web మార్చలేవు) | ✅ engine + firestore.rules (invoices create=false, payments/stock server మాత్రమే) |
| A5 | రోజూ రాత్రి 2 గంటలకి backup | ✅ agentBackup రోజూ 02:00 · 🔑 Blaze + IAM role (DEPLOY-STEPS 0.4) |
| A6 | Keystore backup, package name మార్పు, git setup (ఓనర్ చేయాల్సినవి) | 🔑 keystore backup ఓనర్ చేయాలి; package ఇంకా com.example.suseelacateringcrm (మొదటి release ముందు నిర్ణయం); git repo లేదు |

## B. లెక్కలు & check
| # | Point | Status |
|---|---|---|
| B1 | ప్రతి లెక్క spec లో రాసి ఉండాలి (GST, payments, ధర, targets, వంట, జీతం, లాభం, ads, కాలాలు) | ✅ docs/calc-spec.md §1–§19 |
| B2 | Checker 1 (code పరీక్షలు) | ✅ 95/95 server పరీక్షలు + rules 215/215 pass (5 నవంబర్ రాత్రి, Round 10 తర్వాత) |
| B3 | Checker 2 (code చూడకుండా వేరే పద్ధతిలో) — రెండుసార్లు check | ✅ round 1: 5,476 లెక్కలు, 2 తప్పులు → సరి; round 2: 6,311 లెక్కలు, menu లో 9 తప్పులు → సరి; చివరి 4 random rounds: తేడా లేదు; నెల జీతం 1,500 లెక్కలు: తేడా లేదు |
| B4 | Enter చేసేటప్పుడే తప్పు అంకెలు ఆపాలి (guests 0, minus ధర, bill కంటే ఎక్కువ payment) | ✅ server + web + phone (guests > 0, బాకీ కంటే ఎక్కువ payment ఆపుతుంది) |
| B5 | రాత్రి consistency check → తేడా ఉంటే ఉదయం summary లో చెప్పాలి | ✅ agentIntegrityCheck 03:00 → ఉదయం summary లో తేడాలు |
| B6 | పాత Android GST లెక్క తప్పు (discount tax తర్వాత) → సరిచేయాలి | ✅ phone GST లెక్క చేయదు — server అంకెలే చూపిస్తుంది |
| B7 | Android, server ఒకే లెక్క వాడాలి (రెండు చోట్ల వేరే లెక్క ఉండకూడదు) | ✅ డబ్బు లెక్కలన్నీ server callables (quoteMenu, invoice, payroll, targets) |

## C. GST & invoices
| # | Point | Status |
|---|---|---|
| C1 | GST registration లేదు → ఇప్పుడు invoices లో GST లేదు, "Invoice" మాత్రమే | ✅ engine/spec + docTitle 'Invoice' |
| C2 | GST number వచ్చాక **ఓనర్ manually enter** చేస్తారు → అప్పటి నుండి GST దానంతట అదే | ✅ web Settings + phone Setup/Settings లో GSTIN; server gstRegistered దానంతట అదే |
| C3 | Invoice మీద UPI QR code | ✅ server upiQrPayload; web print invoice లో QR బొమ్మ (UpiQr.tsx → TaxDocumentView); phone invoice screen + PDF లో QR (util/QrCode.kt, InvoiceDetailScreen) |
| C4 | Invoice మీద business phone **9966649469**, FSSAI license number (నియమం), signature, terms | ✅ web print ✅; phone invoice PDF: signature బొమ్మ (settings.signatureUrl), brand/legal line (issuerLine), phone, FSSAI (InvoiceDetailScreen) |
| C5 | Quotation 15 రోజుల validity, last-minute 10% terms | ✅ 15 రోజులు + 10% terms (server, web, phone setup); phone quotation PDF: business పేరు, legal line, phone, FSSAI, validity, terms; GST లేకపోతే tax line లేదు (QuotationDetailScreen) |
| C6 | Refunds / adjustments | ✅ refundOrAdjust + cancelBooking refund — web + phone |

## D. Menus & ధరలు
| # | Point | Status |
|---|---|---|
| D1 | ధర menu బట్టి మారుతుంది (fixed package ధర లేదు) | ✅ |
| D2 | 10 menus ఎక్కించాలి (టిఫిన్ 1–5, డిన్నర్ 1–3, లంచ్, లంచ్/డిన్నర్) | ✅ data/seed/menus.json + ఓనర్ 'menus load' button |
| D3 | "/" groups లో ఒకటి మాత్రమే ఎంచుకోవాలి | ✅ data + web QuoteBuilder + phone QuoteBuilder |
| D4 | ప్రతి 50 ప్లేట్లకు 5 ఉచిత ప్లేట్లు + 1 ఉచిత serving boy (లంచ్ menus); అదనపు boy ₹700 | ✅ engine (per50) + seed లంచ్ menus |
| D5 | కనీస order కంటే తక్కువ అయితే హెచ్చరిక | ✅ engine |
| D6 | Extras (water bottle ₹15, ice cream ₹15, sweet pan ₹20, water can ₹70, extra sweet ధర అడగాలి), మార్పులు (బొబ్బట్టు +₹10, పనసపొట్టు +₹20), ఆలూ మటర్ ఉచితం | ✅ engine + seed (ఆలూ మటర్ = group option, అదనం లేదు) |
| D7 | ₹10 పెంపు ఓనర్ చేస్తారు; menu తేదీ నుండి 12 నెలలకి గుర్తు | ✅ engine + agentMenuPriceReview రోజూ 08:00 |
| D8 | Menus English: ఓనర్ ఒకసారి చూడాలి (మైసూర్ బజ్జీ/బోండా, అనువాదాలు) | 🔑 ఓనర్ ఒకసారి చూడాలి |
| D9 | Kids plate, special meals (onion-garlic లేకుండా, allergy) | 🟡 server (kidsPrice, kidsCount, specialMeals → quotation lines; eventPlan/dayPlan లో) ✅; web (KidsSpecialEditor: booking, sessions, QuoteBuilder; PackagePricePanel పిల్లల ధర) ✅; phone booking/sessions + plan ✅ — కానీ phone QuoteBuilder (QuoteRequest) kidsCount / specialMeals పంపదు → phone లో చేసిన quotation లో పిల్లల / special lines రావు |
| D10 | Suseela lunch boxes ~₹170 (జనవరి 2027 నుండి) — కొత్త product | ✅ server lunchBoxes.ts (saveLunchBoxOrder, markLunchBoxDelivered, invoiceLunchBoxes) + dayPlan లో; web /lunch-boxes; phone list + delivery tick (orders web లో పెడతారు) — అమ్మకాలు జనవరి 2027 నుండి |
| D11 | Plate cost → 30% లాభంతో సూచించే ధర, margin రంగులు | ✅ suggestPackagePrice (calc/round10 + pricing) + web PackagePricePanel (రంగులు, సూచించిన ధర) + phone SuggestedPriceCard (చూడటం మాత్రమే) |

## E. లాభం, targets, reports
| # | Point | Status |
|---|---|---|
| E1 | లాభం/నష్టం: రోజు, వారం, నెల, 3, 6, 12 నెలలు | ✅ getPnl + web P&L page (phone లో P&L screen లేదు — owner web లో) |
| E2 | నష్టం ఎక్కడ వస్తోందో చూపించాలి (leaks, cost split, prime cost) | ✅ web P&L: leaks, cost split, prime cost |
| E3 | సంవత్సర target ₹1.5 కోట్లు, లాభం 25% (₹37.5 లక్షలు) | ✅ Targets page default ₹1,50,00,000 + 25% |
| E4 | Targets నమోదు చేసిన data బట్టి **దానంతట అవే మారాలి** | ✅ agentTargetPlanner ప్రతి నెల 1న |
| E5 | **Target Board** (పెద్ద screen, "రోజుకి ఇంకా ₹__", TV mode, % మాత్రమే option) | ✅ web Target Board (TV mode, % మాత్రమే) + phone Target Board |
| E6 | Animations: అంకెలు పెరుగుతూ, bars నిండుతూ, target పూర్తయితే పండగ | ✅ web + phone (నిజమైన builds OK) |
| E7 | Break-even (fixed costs లో kitchen అద్దె ₹53,000/నెల) | ✅ settings fixedMonthlyCosts { kitchenRent ₹53,000, other } web Settings లో; getPnl break-even దాన్నే వాడుతుంది (phone లో ఈ field లేదు — owner desk web) |
| E8 | Cash flow, బాకీలు, P&L నెలవారీ | ✅ web Reports (cash view) + P&L + invoices బాకీలు; phone Cash report |

## F. Ads & marketing
| # | Point | Status |
|---|---|---|
| F1 | Ads ఎక్కడ డబ్బు ఖర్చైనా లెక్కలో రావాలి (fixed budget లేదు) | ✅ data model + engine + web Ads |
| F2 | Platform వారీగా ROI, ఒక booking కి ఖర్చు, ఏ ad వృథా | ✅ web Ads page (ROI, ఒక booking కి ఖర్చు) |
| F3 | Meta / Google ads ఖర్చు దానంతట అదే రావడం | 🔑 code ఇంకా లేదు — ఓనర్ Meta / Google Ads API access ఇచ్చాకే చేస్తాం (api-contract Round 10: waiting on owner); అప్పటి వరకు ఖర్చు చేతితో |
| F4 | Content plan, referrals, Google reviews | ✅ googleReviewUrl web Settings + review agent (link లేకపోతే ఓనర్ కి గుర్తు); referral lead source ✅; content plan web /content-plan + phone ContentPlanScreen |

## G. వంటగది & operations
| # | Point | Status |
|---|---|---|
| G1 | **వంట లెక్క నేర్చుకోవాలి**: మిగిలింది నమోదు → తర్వాత ఎంత వండాలో చెప్పాలి | ✅ engine + cookingLearner + Round 8 (web + phone) |
| G2 | సరుకుల లెక్క (guests బట్టి, 5% buffer) | ✅ engine + groceryList / eventPlan |
| G3 | Stock, గడువు (FEFO), తక్కువ stock హెచ్చరిక | ✅ తక్కువ stock + గడువు హెచ్చరిక (stockWatch); పూర్తి batch/FEFO ⏸️ |
| G4 | Day plan timeline (ముందు రోజు 6 PM నుండి), event సిద్ధత | ✅ serviceTimeline + ముందు రోజు 18:00 agent |
| G5 | Vessels / rentals / returns | ✅ web + phone Equipment (R7-4) |
| G6 | Vehicles, driver license / insurance గడువు | ✅ web + phone Vehicles + 30/7 రోజుల హెచ్చరిక |
| G7 | Vendors, ధరల పోలిక, ధర పెరిగితే హెచ్చరిక | ✅ vendorPriceComparison + web /vendor-prices + phone VendorRatesScreen (చూడటం); vendorPriceAlertPct web Settings లో, priceWatch దాన్నే వాడుతుంది |

## H. Staff
| # | Point | Status |
|---|---|---|
| H1 | Attendance (phone లో, internet లేకపోయినా) | ✅ phone attendance + signal లేకపోతే queue (AttendanceRepository) |
| H2 | రోజువారీ జీతం + half day + OT (8 గంటల తర్వాత 1.5×) | ✅ engine + markAttendance |
| H3 | **నెల జీతం staff** (₹18,000, ₹20,000, 3 × ₹13,000): ఓనర్ rule = సెలవులకి కోత లేదు, OT లేదు, advances తీసేయాలి (settings లో మార్చొచ్చు) | 🟡 addStaffAdvance / listStaffAdvances / finalizePayroll + web StaffDetailDialog, PayrollPage + phone StaffAdvancesCard, payslip 'అడ్వాన్స్ కోత' ✅ — కానీ Expense form (web ExpenseFormPage, phone ExpensesHomeScreen) లో 'Staff Advance' category ఇంకా వస్తోంది: అక్కడ రాసిన advance జీతంలో కోత పడదు, P&L లో కూడా రాదు (contract R10-1: ఇక చూపించకూడదు) |
| H4 | Advances, shifts, leave, performance, tasks | ✅ saveShift / completeTask / rateStaff + tasks (rules) — web ShiftsCard, /tasks, StaffDetailDialog రేటింగ్; phone StaffWorkScreen (షిఫ్ట్‌లు, పనులు, రేటింగ్) + StaffRatingCard; సెలవు = attendance status |

## I. Customers & sales
| # | Point | Status |
|---|---|---|
| I1 | Leads, tasting, follow-ups, complaints (తెలుగు reply templates), customer statement | ✅ customerStatement + web /customers/:id/statement (print, WhatsApp) + phone CustomerStatementButton (PDF, WhatsApp); web lead → customer (convertLeadToCustomer) |
| I2 | Bookings, orders, events (అంచనా vs నిజం, guest count సరిపోల్చడం) | ✅ bookings, sessions, guest count log, extras → final invoice (web + phone) |
| I3 | WhatsApp: వేరే number (కొత్త SIM), customer అనుమతి tick box | ✅ whatsappOptIn tick web CustomerFormPage + phone CustomerEditScreen (తేదీ / ఎవరు: optInOnCustomer / optInOnLead); agents sendAs template (messagePolicy.chooseSendMode), template లేకపోతే 'template కావాలి' · 🔑 SIM / number / Meta templates |
| I4 | బాకీల గుర్తు (dues reminders) | ✅ duesCollector agent · 🔑 WhatsApp number వచ్చాకే పంపుతుంది |

## J. Design
| # | Point | Status |
|---|---|---|
| J1 | Logo రంగులు (ఆకుపచ్చ, బంగారు), "AI తో చేసినట్టు" కనిపించకూడదు | ✅ design system (docs/design-system.md); పాత purple starter style తీసేశాం |
| J2 | Fonts: Baloo Tammudu 2, Anek Telugu, Hind Guntur | ✅ web + phone |
| J3 | తెలుగు + English రెండు భాషలు | ✅ web + phone (phone PDFs English మాత్రమే) |
| J4 | మన సంప్రదాయ design touches, నిజమైన food photos | 🔑 design ✅; నిజమైన food photos ఓనర్ ఇవ్వాలి |
| J5 | Phone, web రెండింట్లో enter చేయొచ్చు, ఒక చోట enter చేస్తే వెంటనే మరో చోట కనిపించాలి | ✅ live updates (web onSnapshot, phone Flow) |

## K. Setup (ఓనర్ తానే enter చేస్తారు)
| # | Point | Status |
|---|---|---|
| K1 | మొదటిసారి Setup screen: వ్యాపార వివరాలు, logo, GSTIN (తర్వాత), FSSAI, address, phone | ✅ web Settings (setup %) + phone Setup wizard |
| K2 | Bank, UPI ID | ✅ web + phone |
| K3 | Signature, terms | ✅ web + phone (ఓనర్ మాత్రమే upload) |
| K4 | Staff: ఒక్కొక్కరిగా లేదా Excel upload | ✅ web import .xlsx / .xls / .csv (SheetJS, ImportPage); phone .xlsx (SheetReader) |
| K5 | Food photos, పాత customers/menus/rates Excel upload | ✅ Gallery + importRows (customers / menuItems / vendors) · 🔑 photos ఓనర్ |
| K6 | ఎంత పూర్తయిందో % | ✅ setupProgress % |

## L. Agents (CRM లో దానంతట అవే పనిచేసేవి)
| # | Agent | Status |
|---|---|---|
| L1–L11 | ఉదయం summary, బాకీ వసూలు, enquiry follow-up, event సిద్ధత, వంట లెక్క, సరుకులు & stock, ధరల కాపలా, target planner, ads విశ్లేషణ, feedback & reviews, backup | ✅ 13 agents code (agents/schedules.ts); Meta/Google ads auto ❌ (F3 చూడండి) · 🔑 Blaze + deploy |
| L12 | Menu ధర సమీక్ష గుర్తు (12 నెలలు) | ✅ agentMenuPriceReview |
| L13 | Agents డబ్బు నిర్ణయాలు తీసుకోవు — ఓనర్ ఓకే అన్నాకే | ✅ design rule |

## M. Release
| # | Point | Status |
|---|---|---|
| M1 | మీ Mac లో build (npm, Android Studio) — step-by-step | ✅ server, web, Android builds success (5 నవంబర్) |
| M2 | Play Store లేదా APK నిర్ణయం, web domain | 🔑 ఓనర్ నిర్ణయం |
| M3 | ఒక నిజమైన event తో పూర్తి test | 🔑 deploy తర్వాత ఓనర్ తో |
| M4 | Speed audit (web) | ✅ Lighthouse జరిగింది (docs/web-notes.md R10-14): desktop perf 100; mobile perf 51–54 (firebase chunk బరువు — తర్వాత మెరుగుపరచొచ్చు) |

| J6 | అన్ని రంగులు చదవడానికి సరిపడా contrast (WCAG AA) | ✅ కొలిచాం; బంగారు రంగు అక్షరాలకి వాడం, అలంకరణకే |

## N. ఓనర్ కొత్త కోరికలు (5 నవంబర్ 2026, రాత్రి)
| # | Point | Status |
|---|---|---|
| N1 | ప్రతి లెక్కకి **2 options: Automatic, Manual** (quotation, invoice, attendance జీతం, నెల జీతాలు, వంట లెక్క, targets) | ✅ server + web + phone; నెలల targets మిశ్రమం ✅ (1,500 లెక్కల check, తేడా లేదు) |
| N2 | Manual గా మార్చితే **అందరికీ కనిపించాలి**: "మాన్యువల్ · ఎవరు మార్చారు", ఎందుకు, automatic అయితే ఎంత వచ్చేది | ✅ web + phone |
| N3 | Manual మార్చేవాళ్ళు: Owner; Manager (settings లో అనుమతి ఇస్తే); Staff ఎప్పటికీ కాదు | ✅ server నియమం |
| N4 | Payment amount ఎప్పుడూ చేతితోనే; Paid/బాకీ status మాత్రం automatic | ✅ నియమం |
| N5 | **ప్రతి page లో Refresh button** (phone లో క్రిందికి లాగితే కూడా) + "చివరి update సమయం" | 🟡 web + phone ✅ (phone: top-bar Refresh + OnRefresh); web కస్టమర్ statement page (/customers/:id/statement) కి Refresh button / చివరి update సమయం లేదు |
| N6 | **Manager కూడా images upload** చేయొచ్చు (bills, food photos, menu photos); logo, signature ఓనర్ మాత్రమే | ✅ web + phone + storage నియమాలు |
| N7 | App ఇంకా ఎక్కడా deploy కాలేదు, users లేరు → అన్నీ పూర్తయ్యాక ఒకేసారి deploy | ✅ ప్రణాళిక |

## O. చివరి పరీక్ష దశ (5 నవంబర్ 2026, మధ్యాహ్నం)
| # | Point | Status |
|---|---|---|
| O1 | రాత్రి ఆగిన 155 files Mac లో పెట్టడం (md5 check) | ✅ |
| O2 | ఒప్పందం checker: phone/web ↔ server, 22 functions | ✅ 15 తేడాలు → server ✅, web ✅, phone ✅ |
| O3 | Android build checker: నిజమైన Kotlin 2.0 compiler | ✅ errors + crash ప్రమాదాలు సరి; చివరి compile 183 files: **0 errors** |
| O4 | Server పరీక్షలు / Web type check | ✅ 53/53 pass / ✅ clean (68 files) |
| O5 | నెలల targets మిశ్రమ లెక్క స్వతంత్ర check | ✅ 1,500 లెక్కలు, తేడా లేదు |
| O6 | Deploy చేసేటప్పుడు server, web దానంతట అవే build (firebase.json) | ✅ |
| O7 | మొదటి owner: Firebase console లో role=admin, active=true చేతితో పెట్టాలి | ✅ DEPLOY-STEPS.md భాగం 2 |
| O8 | Deploy guide తెలుగులో step-by-step (DEPLOY-STEPS.md) | ✅ |
| O9 | మీ Mac లో నిజమైన build | ✅ server: install+53 పరీక్షలు+build; web: build (2 MUI errors సరి); Android: BUILD SUCCESSFUL (1 error సరి, Java 21) |
| O10 | ఒక test event (deploy తర్వాత) | 🔑 deploy తర్వాత ఓనర్ తో |

## P. GitHub ఆలోచనలు + test mode (5 నవంబర్ 2026, మధ్యాహ్నం)
| # | Point | Status |
|---|---|---|
| P1 | Event పూర్తయితే stock దానంతట అదే తగ్గడం (manual/automatic, తిరిగి వెనక్కి తేవచ్చు) | ✅ test mode లో పరీక్షించాం: 200 మంది → 6 సరుకుల లెక్కలు సరి, కూరగాయలు 12 kg తక్కువ హెచ్చరిక |
| P2 | ప్రతి మార్పుకి history: ఎవరు, ఎప్పుడు, ఏం మార్చారు (Owner కి మాత్రమే కనిపిస్తుంది) | ✅ పనిచేస్తోంది; తెలుగు వాక్యాలు (web historyText.ts / phone HistoryText.kt) |
| P3 | వడ్డించే సమయం బట్టి staff timeline (టిఫిన్/లంచ్/డిన్నర్, guests, ప్రయాణ సమయం) | ✅ లంచ్ 12:00 → వంట 7:40, packing 10:10 సరి |
| P4 | Web login page తెలుగులో | ✅ + login తర్వాత dashboard కి వెళ్ళని bug సరి |
| P5 | Test mode: మీ Mac లోనే, ఖర్చు లేకుండా, demo login ("CRM Test Mode" double-click) | ✅ quote ₹43,000 server లెక్క సరిగ్గా వచ్చింది |
| P6 | మీ Mac లో నిజమైన builds | ✅ server, web, Android అన్నీ success |
| P7 | Header లో "English" button కనిపించకపోవడం | ✅ సరిచేశాం |
| P8 | Booking అంచనా మొత్తం menu package ధరతో (200 × ₹290 = ₹58,000) | ✅ (bug సరిచేశాం) |

## Q. మీ 6 PDFs తో పోలిక → top 10 (ఓనర్: "అన్ని 10 చేయండి"; company: Suseela Technologies Pvt Ltd, brand Suseela Caterings)
పూర్తి పోలిక: docs/spec-gap-analysis.md (మొత్తం spec లో ~25%, రోజువారీ పనుల్లో 60–70% ఇప్పటికే ఉంది)
| # | Point | Status |
|---|---|---|
| Q1 | ప్రతి కొనుగోలు/ఖర్చు ఏ event కో లేదా "సాధారణ ఖర్చు" కో link (event లాభం నిజంగా తెలియాలి) | ✅ CostTargetPicker web + phone; server bookingCost |
| Q2 | Stock చేతితో మార్చలేరు, కారణంతో మాత్రమే; కొనుగోలు మార్చితే stock కూడా సరి అవుతుంది | ✅ rules lock + stockOnPurchase trigger + adjustStock కారణంతో |
| Q3 | Delete బదులు "రద్దు" (కారణంతో) — history పోదు | ✅ cancelRecord + 'రద్దైనవి చూపించు' (web + phone) |
| Q4 | పాత్రలు/సామాన్లు (ఇచ్చినవి, తిరిగి వచ్చినవి, పగిలినవి) + బండ్లు (insurance గడువు హెచ్చరిక, trips) screens | ✅ web + phone Equipment / Vehicles |
| Q5 | ఒక booking లో చాలా భోజనాలు (మెహందీ డిన్నర్, పెళ్ళి టిఫిన్, లంచ్…) — ప్రతిదానికి వేరే guests/menu/సమయం | ✅ sessions editor web + phone, syncBookingSessions |
| Q6 | బయటి orders (పుల్కా, బొబ్బట్టు, ice cream, పాన్): ఆర్డర్ → వచ్చింది → ఒప్పుకున్నది → బాకీ | ✅ Outside orders web + phone |
| Q7 | Event జరుగుతుండగా guest count, అదనపు items → చివరి invoice లోకి | ✅ guest log + extras → generateInvoiceFromBooking |
| Q8 | కొనుగోళ్లు/ఖర్చుల payment status దానంతట అదే + vendor బాకీలు | ✅ vendorPayments + Vendor dues (web + phone) |
| Q9 | Event ముగింపు: పాత్రలు, staff, vendor bills, customer బాకీ check → lock, కారణంతో reopen | ✅ closeEvent / reopenEvent (web + phone) |
| Q10 | Quotation versions (customer ఒప్పుకున్నది ఏది) + complaints screen | ✅ quotation versions + complaints (web + phone) |
| Q11 | వాయిదా వేసినవి (ఇప్పుడు అవసరం లేదు): 17 roles, ledger, PO/GRN/3-way match, batches/FEFO, recipe BOM, packing engine | ⏸️ తర్వాత |

## R. Round 8 — CRM learns from the owner's own events (owner request 5 Nov 2026)
- [x] R1 Dish master: category (rice/curry/dal/liquid/sweet/…), unit, variants with pieces per plate ("పుల్కా – 2/3", "ఇడ్లీ – 3") — ✅ server + web DishPage + phone DishesScreen (category, role, variants)
- [x] R2 Cook log after each event: cooked, leftover, ingredients actually used, shared-with events (batch split by guests) — ✅ saveCookLog v2 + web/phone cook log (ingredients, shared-with)
- [x] R3 Learning: first 1–5 events → "నేర్చుకుంటోంది n/5", then "నేర్చుకున్నది ✓"; newest 10 events used — ✅ learned.status + 'నేర్చుకుంటోంది n/5' badges (web + phone)
- [x] R4 Event size bands S/M/L/XL — big events eat less per head (≥2 events per band rule) — ✅ calc/recipes.ts byBand S/M/L/XL
- [x] R5 Ingredients per dish learned (Σused/Σcooked), typed starting recipe blended until 3 events — ✅ recipe perUnit + typedRecipe blend
- [x] R6 Event plan per booking/session: dish qty + ingredients + stock + to buy, no double counting — ✅ eventPlan (web KitchenPlanCards + phone EventPlanScreen)
- [x] R7 Day plan: several caterings same day → combined purchase list + per-dish split per event; print + WhatsApp copy — ✅ dayPlan + print + WhatsApp copy (web + phone)
- [x] R8 Real installs start empty; demo data only in test mode — ✅ demo data tools/seed-emulator.cjs లో మాత్రమే
- [ ] R9 Backend tests (edge cases) + real builds web/Android + click-through in test mode — 🟡 95/95 tests + builds ✅; test mode లో click చేయనివి: manager / staff login, refund-all / keep end-to-end, sessions తో quote, quotation versions, complaints save, manager కోసం lunch-box / advance dialogs, data ఉన్న vendor ధరల పట్టిక

## S. Audit 5 Nov 2026 (evening)
స్వతంత్ర audit: ప్రతి point ని code లో (functions/src, web/src, app/…/suseelacateringcrm, firestore.rules) చూసి status మార్చాం. పాత ⏳ numbers తీసేశాం.
గుర్తులు: ✅ పూర్తి (server + web + phone అవసరమైన చోట) · 🟡 సగం (ఏ వైపు మిగిలిందో రాశాం) · ❌ చేయలేదు · 🔑 ఓనర్ చేయాలి · ⏸️ కావాలనే తర్వాతకి.
లెక్క (A–R, 121 అంశాలు): ✅ 96 · 🟡 13 · ❌ 4 · 🔑 7 · ⏸️ 1. (✅ లో కొన్నింటికి deploy / Blaze 🔑 ఇంకా కావాలి: A1, A5, I4, K5, L1–L11.)

### S1. 🟡 సగం / ❌ చేయలేదు — ఏం మిగిలింది (size: S చిన్నది, M మధ్యస్థం, L పెద్దది)
| # | ఏం మిగిలింది | వైపు | Size |
|---|---|---|---|
| H3/H4 | Staff advance నమోదు screen లేదు: payroll `staffAdvances` collection చదువుతుంది కానీ web/phone ఎవరూ రాయరు → advance జీతంలో తగ్గదు ("Staff Advance" expense కి link లేదు) | web + phone | S |
| H4 | Shifts, performance, tasks | server + web + phone | M |
| C3 | Web print invoice లో UPI QR బొమ్మ (ఇప్పుడు link/text మాత్రమే); phone invoice PDF లో QR | web + phone PDF | S |
| C4 | Phone invoice PDF: signature, "Suseela Caterings (a brand of Suseela Technologies Pvt Ltd)" line (legalNameOnDocs) | phone | S |
| C5 | Phone quotation PDF: business పేరు/phone/FSSAI, terms; GST లేనప్పుడు "Tax" line చూపించకూడదు | phone | S |
| D11 | Plate cost → 30% సూచించే ధర, margin రంగులు: calc/pricing.ts ఉంది కానీ callable / screen లేదు | server + web (+ phone) | M |
| E7 | Settings లో "నెల fixed ఖర్చులు" (₹53,000 అద్దె) field — server `fixedMonthlyCosts` తీసుకుంటుంది, UI లేదు | web (+ phone) | S |
| F4 | Settings లో Google review link (`googleReviewUrl`) field లేదు → review message లో link ఖాళీ; content plan లేదు | web; content plan M | S / M |
| G7 | Vendor ధరల పోలిక screen; `priceRiseAlertPct` (5%) మార్చే field | web (+ phone) | S–M |
| I1 | Customer statement (invoices, payments, బాకీ ఒకే చోట); web లో lead → customer మార్పు | web + phone | S–M |
| I3 | Customer form లో WhatsApp అనుమతి tick (web + phone); agents `sendAs: "template"` వాడాలి (24 గంటల తర్వాత Meta plain text ఒప్పుకోదు) | web + phone + server | S |
| K4 | Web import లో .xlsx నేరుగా చదవడం (ఇప్పుడు CSV మాత్రమే; phone .xlsx చదువుతుంది) | web | S |
| R9 | Test mode లో click చేయనివి: sessions తో quote, quotation versions, complaints save, manager login, refund-all / keep | test | S |
| S-R9 | Phone లో "ఈ నెల రద్దులు" dashboard card + రద్దు కారణాల report లేదు (web లో ఉంది, getCancellationReport) | phone | S |
| D9 | Kids plate, special meals (onion-garlic లేకుండా, allergy) | server + web + phone | M |
| D10 | Suseela lunch boxes ~₹170 (జనవరి 2027 నుండి) — కొత్త product | server + web + phone | M–L |
| F3 | Meta / Google ads ఖర్చు దానంతట అదే (API) | server (+ ఓనర్ API access) | M–L |
| M4 | Web speed audit (Lighthouse) | web | S |

### S2. ఏ section లోనూ లేని ఓనర్ కోరికలు (api-contract లో మాత్రమే ఉన్నాయి) — ఇక్కడ చేర్చాం
| # | Point | Status |
|---|---|---|
| S2-1 | Round 9: order రద్దు (కారణం, advance తిరిగి / ఉంచుకోవడం, కస్టమర్ సందేశం), restore, తేదీ మార్చు (postpone), రద్దుల report | ✅ server + web ✅; phone రద్దు / restore / postpone + dashboard CancellationsCard + OwnerReports రద్దుల report (getCancellationReport) ✅ |
| S2-2 | Round 8 addition: బంతి భోజనం vs బఫే, menu కలయిక (బిర్యానీ / పుల్కా …), starting rules | ✅ server + web + phone |
| S2-3 | Round 8 addition 2: ప్రతి plan అంకెకి వివరణ (why-lines) + plan సిద్ధం / మారింది notifications | ✅ server + web + phone |
| S2-4 | Company: Suseela Technologies Pvt Ltd / brand Suseela Caterings — documents మీద line (legalNameOnDocs) | ✅ server + web ✅; phone invoice + quotation PDFs లో issuerLine (legal line) ✅ |

### S3. 🔑 ఓనర్ చేయాల్సినవి
Firebase Blaze plan + ₹500 budget alert · `firebase login` + deploy (DEPLOY-STEPS భాగం 1) · మొదటి owner కి role=admin (భాగం 2) · Backup IAM roles (0.4) · keystore/ folder Drive + pen drive backup · package name (com.example…) మొదటి release ముందు నిర్ణయం · రెండో admin · FSSAI number, GSTIN (తర్వాత), bank/UPI, signature, food photos · WhatsApp number (కొత్త SIM, Business API, Meta templates approval) · English menu పేర్లు చూడటం (D8) · Play Store / APK + web domain (M2) · ఒక నిజమైన test event (M3/O10) · cancellation charge పై GST — accountant ని అడగాలి.

### S4. గమనికలు
- DEPLOY-STEPS.md భాగం 1 లో "53 పరీక్షలు" అని ఉంది — ఇప్పుడు 86.
- P&L, Ads, Agents (messages approve), సంవత్సర targets, History filters: web లో మాత్రమే (owner desk screens) — phone లో లేవు.
- Web Notifications page కి Refresh button లేదు (live గా update అవుతుంది).

## T. Re-audit 5 Nov 2026 (night)
Round 10 (api-contract "## Round 10", R10-1 … R10-15) తర్వాత స్వతంత్ర re-audit: ప్రతి ✅ కాని point ని, ప్రతి R10 అంశాన్ని code లో (functions/src, web/src, app/…/suseelacateringcrm, firestore.rules) చూశాం. Builds / tests ముందే నిర్ధారించారు: server 95/95 + build, web build + lint 0 errors, Android assembleDebug OK, rules 215/215.
లెక్క (A–S2, 125 అంశాలు; L1–L11 ఒకటిగా): ✅ 112 · 🟡 4 · ❌ 0 · 🔑 8 · ⏸️ 1. (ముందు: ✅ 98 · 🟡 15 · ❌ 4 · 🔑 7 · ⏸️ 1.)
Round 10 (15 అంశాలు): ✅ 13 · 🟡 2 (R10-1, R10-11).

### T1. 🟡 ఇంకా మిగిలినవి (size: S చిన్నది, M మధ్యస్థం)
| # | ఏం మిగిలింది | వైపు | Size |
|---|---|---|---|
| H3 / R10-1 | Expense form లో "Staff Advance" category ఇంకా వస్తోంది (web ExpenseFormPage — EXPENSE_SECTIONS, phone ExpensesHomeScreen — ExpenseSections.all). అక్కడ రాసిన advance జీతంలో కోత పడదు (payroll staffAdvances మాత్రమే చదువుతుంది), P&L "other" లో కూడా రాదు → డబ్బు లెక్కలో కనిపించదు. కొత్త entries కి ఆ category తీసేయాలి (పాతవి list లో కనిపించాలి) | web + phone | S |
| D9 / R10-11 | Phone QuoteBuilder: QuoteRequest (data/remote/Functions.kt) లో kidsCount / specialMeals లేవు → phone లో చేసిన / మళ్ళీ save చేసిన quotation లో పిల్లల ప్లేట్లు, special meals lines రావు, final invoice లోనూ రావు (web QuoteBuilder సరిగా పంపుతుంది) | phone | S |
| N5 | Web కస్టమర్ statement page (/customers/:id/statement) కి Refresh button / "చివరి update" లేదు (తేదీ మార్చితే మాత్రమే మళ్ళీ load) | web | S |
| R9 | Test mode click-through మిగిలినవి: manager / staff login, refund-all / keep end-to-end, sessions తో quote, quotation versions, complaints save, manager కోసం lunch-box / advance dialogs, data ఉన్న vendor ధరల పట్టిక | test | S |

### T2. పేర్లు / fields పోలిక (12 Round 10 callables)
- addStaffAdvance, listStaffAdvances, finalizePayroll, saveShift, completeTask, rateStaff, suggestPackagePrice, vendorPriceComparison, customerStatement, saveLunchBoxOrder, markLunchBoxDelivered, invoiceLunchBoxes: పేర్లు, input fields server (functions/src/index.ts exports) = web (web/src/data/functions.ts) = phone (data/remote/Round10Api.kt; finalizePayroll AttendanceViewModel లో) — తేడా లేదు. Phone null values పంపదు (CrmFunctions.clean), server optional fields null/"" ని "ఇవ్వలేదు" గా తీసుకుంటుంది.
- Phone లో saveLunchBoxOrder / invoiceLunchBoxes wrappers లేవు — contract ప్రకారమే (orders, నెల bill web లో; phone list + delivery tick).
- 🟡 ఒక చిన్న తేడా: suggestPackagePrice `ingredients[].unitMismatch` — web (functions.ts type, PackagePricePanel.tsx "unit తేడా") చదువుతుంది, server (menus/suggestPrice.ts) ఆ field ఇవ్వదు → ఆ hint ఎప్పుడూ కనిపించదు (ధర లేని సరుకుల warning మాత్రం వస్తుంది). Size S, web లేదా server.
- Tasks: web saveTask, phone addTask రెండూ assigneeStaffId + assignedStaffIds రాస్తాయి; rules isMyTask, server completeTask అవే fields — సరిపోతాయి.

### T3. ఓనర్ నిర్ణయం కావాలి
- suggestPackagePrice Admin + Manager ఇద్దరికీ: web PackagePricePanel, phone SuggestedPriceCard manager కి కూడా ప్లేటు ఖర్చు, లాభం % చూపిస్తాయి. A2 నియమం "Manager కి లాభం కనిపించదు" — manager కి ఇది చూపించాలా వద్దా ఓనర్ చెప్పాలి.

### T4. 🔑 ఓనర్ చేయాల్సినవి (8)
A3 రెండో admin · A6 keystore backup, package name (com.example…), git · D8 English menu పేర్లు చూడటం · F3 Meta / Google Ads API access (ఇచ్చాకే code — M–L) · J4 నిజమైన food photos · M2 Play Store / APK + web domain · M3 / O10 deploy తర్వాత ఒక నిజమైన test event. ఇంకా (✅ అంశాలకి): Blaze + ₹500 budget alert, firebase login + deploy, మొదటి owner role=admin, backup IAM roles, FSSAI / GSTIN / bank / UPI / signature, WhatsApp number (కొత్త SIM, Business API, Meta templates + settings.whatsappTemplates), cancellation charge పై GST — accountant.

### T5. ⏸️ కావాలనే తర్వాత (1)
Q11: 17 roles, ledger, PO/GRN/3-way match, batches/FEFO, recipe BOM, packing engine.

### T6. గమనికలు
- S1 పట్టిక (evening audit) చరిత్ర కోసం అలాగే ఉంచాం; ఇప్పటి స్థితి పై sections A–S2 status cells + ఈ T section.
- Web mobile Lighthouse perf 51–54 (desktop 100): firebase chunk (firebase.ts లో అన్ని services మొదట్లోనే) — login తర్వాత Firestore / Functions / Storage load చేస్తే మెరుగు (ఐచ్ఛికం).
- E7 / F4 / G7 / I3 settings fields (fixedMonthlyCosts, googleReviewUrl, vendorPriceAlertPct, whatsappTemplates) web Settings లో మాత్రమే — phone లో లేవు (owner desk web; contract ప్రకారం సరే).

## U. 18 నవంబర్ 2026 — మళ్ళీ code తో సరిచూశాం / Re-check against code (18 Nov 2026)
T1 లో 🟡 గా ఉన్నవి code లో ఇప్పటికే పూర్తయ్యాయి (5 నవంబర్ రాత్రి చివరి మార్పుల్లో): / The T1 items were already finished in code:
- ✅ H3 / R10-1: కొత్త ఖర్చులకి "Staff Advance" category రాదు (web ExpenseFormPage, phone ExpenseEntryScreen / ExpensesHomeScreen); పాతవి చూడటానికి మాత్రమే.
- ✅ D9 / R10-11: phone QuoteRequest kidsCount / specialMeals పంపుతుంది (Functions.kt, QuoteBuilderViewModel).
- ✅ N5: web కస్టమర్ statement page లో RefreshButton ఉంది.
- ✅ unitMismatch: server suggestPrice.ts ఇప్పుడు ఇస్తుంది.
- ✅ T3 ఓనర్ నిర్ణయం (18 నవంబర్): manager కి ప్యాకేజీ ధర సూచనలో ప్లేటు ఖర్చు, లాభం % చూపించవచ్చు (code ఇప్పటికే ADMIN_MANAGER).
- 🟡 R9 మాత్రమే మిగిలింది: test mode లో చేతితో నొక్కి చూడటం (manager / staff login, refund, quotation versions, complaints).
పరీక్షలు (18 నవంబర్): server 106/106 pass; web typecheck (tsc -b) శుభ్రం. Android build ఈ రోజు నడపలేదు.
లెక్క: ✅ 115 · 🟡 1 (R9) · ❌ 0 · 🔑 8 · ⏸️ 1.

## V. Module 1 — Leads + pipeline (Smart CRM లాంటిది) — docs/ROADMAP-full-spec.md
| # | Point | Status |
|---|---|---|
| V1 | పైప్‌లైన్ దశలు (కొత్తది → అప్పగించాం → మాట్లాడాం → అవసరం → రుచి → అవకాశం → కొటేషన్ → బుక్; పోయింది / రెండోసారి / చెల్లనిది) | ✅ server + rules + web; phone పేర్లు ✅ (18 Nov) |
| V2 | Web పైప్‌లైన్ బోర్డ్ (లాగి వదలడం + phone కోసం picker), "నావి" filter | ✅ web · phone board ❌ |
| V3 | ఉద్యోగికి ఆటో అప్పగింత: ఆన్/ఆఫ్, వంతుల వారీ / source బట్టి, చేతితో మార్చడం | ✅ server (trigger + assignLead) + web · phone picker ❌ |
| V4 | అప్పగించినప్పుడు ఆ వ్యక్తికి notification | ✅ server |
| V5 | 15 నిమిషాల నియమం (ఆన్/ఆఫ్, నిమిషాలు మార్చొచ్చు) + ఎంక్వైరీ ఎవరిదో వారికి alert + రెండింతల సమయానికి ఓనర్ కి alert; web లో "ఆలస్యం" గుర్తు | ✅ server + web (18 Nov) · alerts CRM లోపల మాత్రమే (WhatsApp / phone push ❌) · phone "ఆలస్యం" గుర్తు ❌ |
| V6 | Lead మీద నోట్స్, టీమ్ నోట్స్ (@ తో పిలవడం → notification), మళ్ళీ మాట్లాడే సమయం, వాయిదా (రేపు / 3 / 7 రోజులు) | ✅ server + web (18 Nov) · phone టీమ్ నోట్స్ ❌ · సమయానికి ఆటో reminder (push / WhatsApp) ❌ |
| V7 | Leads Excel/CSV import (Excel / CSV దిగుమతి పేజీలో "ఎంక్వైరీలు"), duplicate ఫోన్ హెచ్చరిక (web form) | ✅ server + web (18 Nov) · customers తో duplicate check ❌ · phone ❌ |
| V8 | HOT / WARM / COLD: ఆటో మార్కులు + కారణాలు + చేతితో మార్చడం | ✅ rule + tests + web (18 Nov) · phone ❌ |
| V10 | ఎంక్వైరీల రిపోర్ట్: ఎక్కడి నుండి, ఎవరు ఎంత, బుకింగ్ %, స్పందన వేగం (ఎంక్వైరీల పేజీ → "రిపోర్ట్") | ✅ server + web (18 Nov) · phone ❌ |
| V9 | ఆటో WhatsApp, bulk, bot / auto dialer / Meta-Google-JustDial leads | 🔑 బయటి accounts వచ్చాక |
పరీక్షలు (18 Nov): server 146/146 pass (40 కొత్తవి); web typecheck శుభ్రం. **నడపనివి:** rules పరీక్షలు (emulator Mac లో నడపాలి — 16 కొత్త "M1a / M1b / M1c / M1e" cases, మొత్తం 249 రావాలి), web build, Android build, test mode లో నొక్కి చూడటం.

## W. Module 2 — సరుకుల మాస్టర్, కొలతలు, రెసిపీ, బ్యాచ్ / గడువు — docs/ROADMAP-full-spec.md
| # | Point | Status |
|---|---|---|
| W1 | ప్యాక్ కొలతలు: 1 Bag = 25 kg లాంటివి ప్రతి సరుకుకి; Bag లో కొన్నా stock kg లో పెరగాలి, ధర kg కి రావాలి | ✅ server + web (18 Nov) · phone form ❌ |
| W2 | ఇతర పేర్లు (aliases) + ఒకే సరుకు రెండుసార్లు చేయకుండా హెచ్చరిక | ✅ web (18 Nov) · phone ❌ |
| W3 | UOM master (కొలతల జాబితా, తేదీలతో), కొనుగోలు line లో అప్పటి మార్పిడి snapshot (18 Nov: server + web కోడ్ పూర్తి: Settings లో కొలతల జాబితా, ప్యాక్ కొలతల చరిత్ర, కొనుగోలులో మార్పిడి నిలిపి ఉంచడం; phone app జాబితా, తెరపై పరీక్ష మిగిలాయి) | 🟡 |
| W4 | రెసిపీ / BOM: ప్రతి వంటకానికి సరుకులు (R8 లో ఉంది) + **రెసిపీ వెర్షన్ చరిత్ర** (18 Nov ✅ server + web) · ఉప-రెసిపీలు / బేస్ తయారీలు ✅ (18 Nov, server + web కోడ్; తెరపై పరీక్ష మిగిలింది) · దిగుబడి % ✅ (18 Nov, server + web; ఖాళీ = నష్టం లేదు) · event లో వెర్షన్ snapshot ❌ |
| W5 | ప్లేటు ఖర్చు: రెసిపీ × తాజా ధర (R10 లో ఉంది; manager కి server లో ఆగిపోయేది → 18 Nov సరిచేశాం) · ప్రామాణిక / అంచనా / నిజమైన వేర్వేరుగా ❌ |
| W6 | బ్యాచ్, గడువు తేదీ, FEFO, గడువు హెచ్చరిక (18 Nov: server + web కోడ్ పూర్తి; phone app screen, తెరపై పరీక్ష మిగిలాయి) | 🟡 |
| W7 | ప్యాక్ చేసిన ఉత్పత్తులు (MRP, label, FSSAI) (18 Nov: server + web కోడ్ పూర్తి: ఉత్పత్తి, ప్యాకింగ్ నమోదు, బ్యాచ్ + గడువు, లేబుల్ ప్రింట్; ప్యాక్ అమ్మకం bill, phone app, తెరపై పరీక్ష మిగిలాయి) | 🟡 |
| W8 | ఖరారైన event కి stock రిజర్వ్ (18 Nov: server + web కోడ్ పూర్తి; phone app, తెరపై పరీక్ష మిగిలాయి) | 🟡 |
| W9 | ఖర్చు మూడు రకాలుగా విడిగా: ప్రామాణిక (మెనూ), అంచనా (ఖరారు రోజు, నిలిపి ఉంచినది), నిజమైన (బిల్‌లు) + పోలిక (18 Nov: server + web కోడ్ పూర్తి; quotation మీద అంచనా snapshot, phone app, తెరపై పరీక్ష మిగిలాయి) | 🟡 |
పరీక్షలు (18 Nov): server 166/166 pass; web typecheck శుభ్రం. నడపనివి: rules emulator, web build, Android build, test mode click-through.

## X. మిగిలిన పనుల జాబితా — 18 నవంబర్ 2026 సాయంత్రం నాటికి / Pending list

నడిచిన పరీక్షలు (Mac లో, `CRM Check.command`): server 209/209 ✅ · web build ✅ · rules 277/277 ✅ · phone app build ✅.

| # | పని / Item | ఎవరు | స్థితి |
|---|---|---|---|
| X1 | తెరపై పరీక్ష — 18 Nov రాత్రి చూసినవి ✅: ప్యాక్ ఉత్పత్తి, ప్యాకింగ్, లేబుల్, బ్యాచ్ తగ్గడం, ఖర్చు పోలిక, ప్యాక్ అమ్మకం (PS-261118-001), ఎంక్వైరీ చేర్చడం, బోర్డ్. మిగిలినవి: బోర్డ్ లో లాగడం (automation తో లాగలేకపోయాను — చేతితో చూడాలి), అప్పగింత, బేస్‌ని వంటకంలో వాడడం, కొనుగోలు బిల్‌లో గడువు తేదీ, నిజమైన ఈవెంట్‌తో రిజర్వ్, లేబుల్ ప్రింట్, రెసిపీ / ప్యాక్ చరిత్ర, కొలతల జాబితా సేవ్, కొటేషన్ అంచనా column | Claude | 🟡 |
| X2 | Browser console "400" — తేలింది: Test Mode మళ్ళీ మొదలైనప్పుడు పాత login token ఒకసారి తిరస్కరించబడుతుంది (emulator మాత్రమే); మళ్ళీ రాదు, ప్రభావం లేదు. సరిచేశాం: ప్యాక్ పేజీ table లో "same key" React హెచ్చరిక. | Claude | ✅ |
| X3 | Phone app: Module 1 తెరలు — కోడ్ పూర్తి (18 Nov, Mac build OK): దశల చిప్స్ మీద లెక్క, HOT / WARM / COLD గుర్తు, "జవాబు ఆలస్యం" గుర్తు (settings లో నిమిషాల ప్రకారం), చూసేవారు + అప్పగించడం / మార్చడం / వెనక్కి తీసుకోవడం, టీమ్ నోట్స్ (చదవడం + జోడించడం), follow-up సమయం. మిగిలింది: నిజమైన phone మీద చేతితో చూడటం (ఓనర్ చెప్పినట్టు పని అంతా అయ్యాక); నోట్స్ లో @ పేరు ప్రస్తావన phone లో లేదు. | Claude | 🟡 |
| X4 | Phone app: Module 2 తెరలు — కోడ్ పూర్తి (18 Nov, Mac build OK): stock జాబితాలో గడువు గుర్తు, ఈవెంట్లకు ఉంచినది / గడువు దాటినది / వాడుకోదగ్గది, బ్యాచ్‌ల జాబితా, stock IN లో గడువు తేదీ + బ్యాచ్ నంబర్; తెర "ప్యాక్ ఉత్పత్తులు" (ప్యాక్ చేశాం, అమ్ము); వంటకాల్లో "(బేస్)" గుర్తు; కొనుగోలులో ఓనర్ చేర్చిన ప్యాక్ కొలతలు; booking లో ఖర్చు పోలిక (ఓనర్ మాత్రమే). web లోనే ఉండేవి: కొత్త ప్యాక్ ఉత్పత్తి, లేబుల్ ప్రింట్, గడువు switch, బేస్ రెసిపీ రాయడం, ప్రామాణిక ఖర్చు పెట్టడం, కొత్త అంచనా. మిగిలింది: నిజమైన phone మీద చేతితో చూడటం. | Claude | 🟡 |
| X5 | ప్యాక్ ఉత్పత్తుల అమ్మకం bill: MRP కంటే ఎక్కువ కాదు, గడువు దాటినవి అమ్మలేరు, stock తగ్గడం (ముందు గడువు ఉన్నది ముందు), GST లోపలి నుండి విడదీయడం, HSN, barcode నంబర్, రద్దు (18 Nov రాత్రి: server + web కోడ్ పూర్తి; తెరపై చూడలేదు). P&L / ledger లో కలపడం Module 4 లో; barcode బొమ్మ, ప్రింట్ బిల్ లేవు. | Claude | 🟡 |
| X6 | మెనూ / లంచ్ బాక్స్ జాబితాల్లో బేస్‌లను దాచడం; రెసిపీ చరిత్ర panel లో బేస్ మార్పులు (18 Nov రాత్రి: web కోడ్ పూర్తి, తెరపై చూడలేదు) | Claude | 🟡 |
| X7 | గడువు దాటిన సరుకు లెక్కలో వాడకుండా ఆపడం: కొనాల్సిన జాబితా, రిజర్వ్ లో గడువు దాటినది లెక్కించము; stock పేజీలో ఎరుపు గుర్తు (18 Nov రాత్రి: server + web కోడ్ పూర్తి, తెరపై చూడలేదు). చేతితో stock తీయడాన్ని ఆపలేదు. | Claude | 🟡 |
| X8 | కొనుగోలు / stock మార్పు అయిన 5 నిమిషాల్లో రిజర్వ్ లెక్క మారడం (18 Nov రాత్రి: server కోడ్ పూర్తి). "రోజు వంట plan" లో రిజర్వ్ ఇంకా లేదు. | Claude | 🟡 |
| X9 | Quotation మీద అంచనా ఖర్చు + లాభం % snapshot (18 Nov రాత్రి: server trigger + web జాబితాలో column; తెరపై చూడలేదు) | Claude | 🟡 |
| X10 | ఎంక్వైరీ గుర్తు చేసే సమయానికి notification (18 Nov రాత్రి: server కోడ్ పూర్తి — ప్రతి 5 నిమిషాలకు; సమయం లేకపోతే ఉదయం 9) | Claude | 🟡 |
| X11 | Module 3: కొనుగోలు అభ్యర్థన → ఆర్డర్ → సరుకు అందుకోవడం → మూడు వైపుల సరిపోలిక + అనుమతుల engine | Claude | ❌ |
| X12 | Module 4: ledger, period lock, 17 roles | Claude | ❌ |
| X13 | Module 5: Company → Brand → Branch, venues, packing, food safety, reports, Hindi | Claude | ❌ |
| X14 | ఓనర్ నిర్ణయం: వంటకానికి రాసిన సరుకుల లెక్కను మొదటి వంట నమోదు కాకముందే plan వాడాలా? | ఓనర్ | 🔑 |
| X15 | లేబుల్ వివరాల జాబితాను ఫుడ్ లైసెన్స్ సలహాదారుతో సరిచూడడం; Settings లో FSSAI 14 అంకెల నంబర్ | ఓనర్ | 🔑 |
| X16 | WhatsApp API, dialer, Meta / Google / JustDial ఎంక్వైరీలు — ఓనర్ ఖాతాలు కావాలి | ఓనర్ | 🔑 |
| X17 | Firebase Blaze plan + deploy (DEPLOY-STEPS) — "అన్నీ పూర్తయ్యాకే లైవ్" | ఓనర్ | ⏸ |

| X18 | హిందీ భాష (ఓనర్ 18 Nov రాత్రి అడిగారు): web లో భాష బటన్ తెలుగు → English → हिंदी. స్థిర వాక్యాలు 1689 లో 1689 అనువాదం అయ్యాయి (తెరపై 2 పేజీలు చూశాం). సంఖ్యలు / పేర్లు కలిసిన వాక్యాలు 187 నమూనాలు కూడా అనువాదం అయ్యాయి (web/src/i18n/hi-patterns.json). మిగిలినవి: కోడ్‌లో `lang === "te"` తో ఎంచుకునే కొన్ని వాక్యాలు, server ఎర్రర్ సందేశాలు, తేదీలు / నెలల పేర్లు, ప్రింట్ పత్రాలు, phone app; హిందీ తెలిసిన వ్యక్తితో ఒకసారి చదివించాలి. | Claude | 🟡 |
| X19 | Module 3 (కొనుగోలు అభ్యర్థన → ఆర్డర్ → సరుకు రసీదు → బిల్ సరిపోల్చడం) — కోడ్ పూర్తి, Mac చెక్ పాస్ (19 Nov 23:50: server 236/236, web build OK, rules 289/289, phone build OK). 3a అభ్యర్థన / ఆర్డర్ / ఆమోదం (మేనేజర్ పరిమితి ₹10,000 — Settings), 3b సరుకు రసీదు (stock లోకి వెంటనే) + రసీదు రద్దు, 3c బిల్ మూడు విధాల సరిపోల్చడం + చెల్లింపు ఆపడం + ఓనర్ విడుదల. Web తెర /procurement; phone తెర (అభ్యర్థన, ఆమోదం, సరుకు తీసుకోవడం — ఆర్డర్ రాయడం, బిల్ web లోనే). మిగిలినవి: తెర మీద click-through (Test Mode నడవలేదు — port 5173 ని వేరే app వాడుతోంది), phone మీద చేతితో చూడటం, api-contract.md, Settings లో ధర తేడా % card (billMatch.rateTolerancePct, default 0). ఓనర్ నిర్ణయాలు: మేనేజర్ పరిమితి ₹10,000 సరేనా; ఆర్డర్‌లో లేని చిన్న ఛార్జీలకు కూడా బిల్ ఆగాలా. | Claude | 🟡 |
| X20 | Module 4 (ఖాతా పుస్తకం, నెల లాక్, పాత్రలు). అయినవి (19 Nov, code): 4a ఖాతాల జాబితా + జర్నల్ నియమాలు + రిపోర్ట్ లెక్కలు; 4b అసలు పత్రాల నుంచి ఎంట్రీలు (బిల్లులు + చెల్లింపులు / వాపసులు, రద్దు చార్జీ, కొనుగోళ్లు, ఖర్చులు, బయట ఆర్డర్లు, సరఫరాదారు చెల్లింపులు — ఒకే డబ్బు ఒక్కసారే, ప్యాక్ అమ్మకాలు, సిబ్బంది అడ్వాన్సులు, జీతాలు), ledgerReport, చేతి ఎంట్రీ / రద్దు, నెల లాక్ / తిరిగి తెరవడం (ఓనర్ మాత్రమే), web తెర "ఖాతా పుస్తకం" (/books), హిందీ. Server tests 250/250, typechecks సరే. ఇంకా నడపనివి: Mac చెక్ (3 కొత్త rules tests), click-through, నిజమైన డేటాతో సరిచూడటం. తెలిసిన లోపాలు: జీతం చెల్లించినప్పుడు నమోదు చేసే పత్రం CRM లో లేదు (ఇవ్వవలసిన జీతాలు పెరుగుతూనే ఉంటాయి — చేతి ఎంట్రీతో సరిచేయాలి); "Staff Advance" ఖర్చు + staffAdvances రెండూ రాస్తే రెండుసార్లు లెక్క; 4c నెల లాక్ అమలు అయింది (19 Nov, tests 252/252): లాక్ అయిన నెల తేదీతో కస్టమర్ చెల్లింపు, సరఫరాదారు చెల్లింపు, సరఫరాదారు బిల్, ప్యాక్ అమ్మకం / రద్దు, సిబ్బంది అడ్వాన్స్, జీతం ఖరారు, బయట ఆర్డర్, బిల్ మొత్తం మార్పు, ఏ డబ్బు పత్రం రద్దు అయినా server ఆపుతుంది; కొనుగోలు / ఖర్చు client నుంచి రాసేవి rules ఆపుతాయి (4 కొత్త rules tests, ఇంకా నడపలేదు). మిగిలినవి (Modules plan PDF ప్రకారం): 17 పాత్రలు + బాధ్యతల విభజన — అసలు spec PDF (Blueprint p16–19, IMP p11–13) folder లో లేదు, పాత్రల పేర్లు తెలియవు: ఓనర్ PDF ఇవ్వాలి; బ్యాంక్ / UPI statement సరిపోల్చడం; సాధారణ ఖర్చుల పంపకం; నెల ముగింపు checklist; జీతం చెల్లింపు నమోదు; phone. Accountant నిర్ధారించాలి: కొనుగోలు = బిల్ రోజే ఖర్చు; ఖాతాల జాబితా. | Claude | 🟡 |
| X21 | Module 4d — 17 పాత్రలు (spec: Implementation Freeze Pack Part B, పేజీ 11–13; వచనం docs/spec/IMP-Part-B-roles-p11-13.txt లో). అయినవి (19 Nov, code; tests 259/259, typechecks సరే): pure rules (17 పాత్రలు, 10 actions, module × action పట్టిక, సున్నిత అంకెలు, కొనుగోలులో బాధ్యతల విభజన); users.jobRole (ఓనర్ Users తెరలో ఇస్తారు — rules: స్థాయికి సరిపోయే పాత్ర మాత్రమే, తనకు తాను ఇచ్చుకోలేరు); పాత్ర ఇచ్చిన వారికి web మెనూ ఆ పాత్ర భాగాలకే తగ్గుతుంది (ఇవ్వనివారికి మార్పు లేదు); బాధ్యతల విభజన server లో అమలు: సరుకు తీసుకోవడం, బిల్ రాయడం, సరఫరాదారు చెల్లింపు (₹10,000 నుంచి; ఓనర్ మినహాయింపు — sodOverride గా నమోదు); Settings card "కొనుగోలులో బాధ్యతల విభజన"; హిందీ. ఇంకా నడపనివి: Mac చెక్ (4 కొత్త rules tests), click-through. రెండో దశ (19 Nov, code; tests 265/265): 82 callables అన్నింటికీ server లో పాత్ర తనిఖీ (functions/src/roles/callablePerms.ts — పాత్ర ఇచ్చిన వారికే తగ్గుతుంది; ఆడిటర్ చూడటం మాత్రమే); Finance Head కి ఖాతా పుస్తకం, సరఫరాదారు బాకీలు + చెల్లింపు, లాభనష్టాలు, ఆపిన బిల్ విడుదల; Accountant కి ఖాతా పుస్తకం (చూడటం + ఎంట్రీ), బాకీలు చూడటం (చెల్లించలేరు); నెల లాక్ ఓనర్ దగ్గరే. మూడో దశ (19 Nov, code; tests 268/268; rules ఇంకా Mac లో నడపలేదు): firestore.rules లో jobMay() — పట్టిక permRules.ts నుంచి tools/gen-role-rules.mjs తో తయారవుతుంది (చేత్తో మార్చకూడదు; తేడా ఉంటే module4f test ఫెయిల్). నేరుగా రాసే 30 చోట్ల తనిఖీ: customers, leads, complaints, referrals, dishes, bookings, quotations, invoices, purchases, expenses, vehicles, vehicleTrips, equipment, equipmentMoves, lunchBoxOrders, contentPlan. తనిఖీ లేనివి (కావాలనే): tasks, notifications, booking లోపలి వంట/అతిథి లాగ్‌లు, lead comments; worker / driver సిబ్బంది రోజువారీ రాతలు. నాలుగో దశ — సున్నిత అంకెలు (19 Nov, code; tests 269/269): జీతాల నెల తెర (monthPayroll) Finance Head, HR Manager కి కూడా (ఖరారు ఓనర్ మాత్రమే); అడ్వాన్స్ వివరాలు (callable + rules jobSees) జీతం చూడగల పాత్రలకే; web లో రోజు కూలీ column అదే నియమం. లాభం, వంట ఖర్చు అంచనాలు, audit log ముందే ఓనర్‌కే. ఐదో దశ (19 Nov, code; tests 274/274; rules + phone నడపలేదు): కూలీ / జీతం అంకెలు staff/{id}/private/pay లోకి (ఓనర్ మాత్రమే చదవగలరు; రాసేది server మాత్రమే). staffPayMover trigger — staff పత్రంలో అంకె రాయగానే private కి మార్చి అక్కడ తీసేస్తుంది; పాత data జీతాల తెర తెరిచినప్పుడు మారుతుంది. payroll, attendance, గణాంకాలు private నుంచి చదువుతాయి (మారని పాత పత్రాలకు fallback). web సిబ్బంది తెర, phone సిబ్బంది edit తెర మార్చాను. గమనిక: import / phone save తర్వాత trigger నడిచే కొన్ని క్షణాలు అంకె staff పత్రంలో ఉంటుంది. Mac చెక్ 19 Nov 16:42 (ఐదో దశ వరకు): server 274/274, web build సరే, rules 312/312, phone build సరే. ఆరో దశ — B5 స్టాక్ సవరణ (19 Nov, code; tests 278/278; ఇంకా Mac లో నడపలేదు): adjustStock కి పాత్ర తనిఖీ (ముందు లేదు); స్టోర్ / సిబ్బంది చేసే పెద్ద చేతి మార్పు (నిల్వలో 10% లేదా ఎక్కువ; count / damage / correction) stockAdjustRequests లో ఆగుతుంది — యజమాని లేదా ఆమోదించగల మేనేజర్ decideStockAdjust తో ఆమోదిస్తేనే నిల్వ మారుతుంది; తను అడిగింది తానే ఆమోదించలేరు (యజమాని తప్ప). Settings card "స్టాక్ సవరణ ఆమోదం"; web నిల్వ తెరలో ఆగిన జాబితా + ఆమోదించు / తిరస్కరించు; phone లో సందేశం మాత్రమే (ఆమోద తెర web లోనే). ఏడో దశ — phone (19 Nov): UserProfile.jobRole; JobRoles.kt (tools/gen-phone-roles.js తో తయారవుతుంది); పాత్ర ఇచ్చిన మేనేజర్‌కి drawer మెనూ తగ్గుతుంది. web లో కూడా సిబ్బంది స్థాయి (worker / driver / auditor) మెనూ ఇక తగ్గదు (server తో ఒకేలా). Mac చెక్ 19 Nov 16:56 (ఆరో + ఏడో దశలు): server 278/278, web build సరే, rules 315/315, phone build సరే. phone లో లేనివి: పాత్ర ఇచ్చే తెర (web Users లోనే), ఆగిన స్టాక్ సవరణల ఆమోదం, Finance పాత్రలకు అదనపు తెరలు. B5 లో మిగిలినవి: వాపసు, జీతం దశలు, డిస్కౌంట్ ఆమోదం (ఇవి ఇప్పుడు ఓనర్ మాత్రమే చేస్తారు కాబట్టి విభజన సహజంగానే ఉంది; పాత్రలకు పంచాలంటే కొత్త ఆమోద ప్రవాహాలు కావాలి). వర్తించనివి: vendor bank వివరాలు, contact export — ఇలాంటి features ఇప్పుడు లేవు. మిగిలినవి: సున్నిత అంకెలు పాత్ర బట్టి దాచడం; మిగతా B5 విభజనలు (stock సవరణ, వాపసు, జీతం, discount, event reopen, vendor bank మార్పు); phone. Spec "ఓనర్ నిర్ణయించాలి": పాత్ర వారీ ఆమోద పరిమితులు, branch manager పాత్ర, backup approver, export అనుమతులు, MFA. | Claude | 🟡 |
| X22 | Module 4e — జీతం చెల్లింపు నమోదు (19 Nov, code; tests 282/282, typechecks సరే; Mac లో నడపలేదు, click-through లేదు). ఖరారైన payslip కి recordSalaryPayment (ఓనర్): ఎవరికి, ఏ నెల, ఎంత, తేదీ, నగదు / UPI / బ్యాంక్; కొంత కొంతగా ఇవ్వవచ్చు; బాకీ కంటే ఎక్కువ కుదరదు; లాక్ అయిన నెల తేదీ కుదరదు. cancelSalaryPayment (కారణంతో). payslip లో paidTotal / paidStatus. ఖాతా పుస్తకం: Dr ఇవ్వవలసిన జీతాలు (2300), Cr నగదు / బ్యాంక్ — ఇంతకు ముందు 2300 పెరుగుతూనే ఉండేది. web జీతాల తెరలో "జీతం చెల్లింపులు" పట్టీ (ఖరారు · ఇచ్చింది · బాకీ · చెల్లించు). rules: salaryPayments ఓనర్ చదవగలరు, client రాయలేరు. లేనివి: రద్దు బటన్ web లో (callable ఉంది), phone తెర, చెల్లింపుల జాబితా / రసీదు. Mac చెక్ 19 Nov 22:46: server 301/301, web build, rules 318/318, phone build — అన్నీ సరే (తెరపై click-through ఇంకా లేదు). | Claude | 🟡 |
| X23 | Module 4f — బ్యాంక్ / UPI స్టేట్‌మెంట్ సరిపోల్చడం (19 Nov, code; tests 289/289, typechecks సరే; Mac లో నడపలేదు; నిజమైన బ్యాంక్ ఫైల్‌తో ప్రయత్నించలేదు). ఖాతా పుస్తకం తెర కింద "బ్యాంక్ స్టేట్‌మెంట్ సరిపోల్చడం": Excel / CSV అప్‌లోడ్ → reconcileStatement (ఓనర్, Finance Head, Accountant). server శీర్షిక వరుసను వెతుకుతుంది (బ్యాంక్ వివరాల కింద ఉన్నా), తేదీలు (dd/mm/yyyy, dd-Mon-yyyy, Excel సంఖ్య), జమ / ఖర్చు కాలమ్‌లు లేదా ఒకే మొత్తం + Dr/Cr చదువుతుంది; ఒకే దిశ + ఒకే మొత్తం + తేదీ ±3 రోజులు ఉంటే జత. చూపేవి: సరిపోయినవి, బ్యాంక్‌లో ఉండి CRM లో లేనివి, CRM లో ఉండి బ్యాంక్‌లో లేనివి. ఏదీ సేవ్ కాదు (report మాత్రమే). లేనివి: "సరిపోల్చాం" అని గుర్తు పెట్టి దాచడం, PDF స్టేట్‌మెంట్, ఒక చెల్లింపు అనేక వరుసలుగా / అనేక చెల్లింపులు ఒకే వరుసగా ఉన్నప్పుడు జత. Mac చెక్ 19 Nov 22:46: server 301/301, web build, rules 318/318, phone build — అన్నీ సరే (తెరపై click-through ఇంకా లేదు). | Claude | 🟡 |
| X24 | Module 4g — నెల ముగింపు చెక్‌లిస్ట్ (19 Nov, code; tests 295/295, typechecks సరే; Mac లో నడపలేదు, click-through లేదు). ఖాతా పుస్తకం తెర కింద నెల ఎంచుకుని "తనిఖీ చేయి" → monthCloseCheck (ఓనర్, Finance Head, Accountant): ఖాతా పుస్తకం సరిపోతుందా, ఇన్వాయిస్ లేని కార్యక్రమాలు, Draft ఇన్వాయిస్‌లు, ఆగిన సరఫరాదారు బిల్లులు, ముగియని కొనుగోలు ఆర్డర్లు, ఆగిన స్టాక్ సవరణలు, జీతం ఖరారు కాని సిబ్బంది, ఇవ్వని జీతాలు (సమాచారం మాత్రమే), ముందు నెల లాక్. ప్రతిదానికి సరిచేసే తెరకు లింక్; అన్నీ పూర్తయితే అక్కడే లాక్ బటన్ (ఓనర్). చెక్‌లిస్ట్ చూపుతుంది మాత్రమే — లాక్‌ను ఆపదు (ఖాతా పుస్తకం సరిపోకపోతే బటన్ కనిపించదు). server వాక్యాలు హిందీలో రావు. Mac చెక్ 19 Nov 22:46: server 301/301, web build, rules 318/318, phone build — అన్నీ సరే (తెరపై click-through ఇంకా లేదు). | Claude | 🟡 |
| X25 | Module 4h — సాధారణ ఖర్చులను ఈవెంట్లకు పంచడం (19 Nov, code; tests 301/301, typechecks సరే). లాభ నష్టాల తెర కింద "సాధారణ ఖర్చులు పంచిన తర్వాత ఈవెంట్ లాభం": నెల + పంచే విధానం (ఆదాయం / అతిథులు / సమానం) → overheadShare (ఓనర్, Finance Head). పంచే మొత్తం = ఆ నెలలో "overhead" గా గుర్తించిన కొనుగోళ్లు + ఖర్చులు (కేంద్రం వారీ) + నెల జీతాలు. ప్రతి ఈవెంట్‌కు ఆదాయం, నేరు ఖర్చు, ఈవెంట్ లాభం, వాటా, నికర లాభం (%). ముగించిన ఈవెంట్‌కు ముగించినప్పటి అంకెలు. Report మాత్రమే — ఏదీ సేవ్ కాదు, ఖాతా పుస్తకం మారదు. లేనివి: రోజువారీ కూలీ సిబ్బంది ఖర్చు ఈవెంట్‌కు చెందనప్పుడు పంచడం; ఈవెంట్ తెరలోనే ఈ నికర లాభం చూపడం. Mac చెక్ 19 Nov 22:46: server 301/301, web build, rules 318/318, phone build — అన్నీ సరే (తెరపై click-through ఇంకా లేదు). | Claude | 🟡 |
| X26 | Module 5a — Master Data Freeze 01: కంపెనీ → బ్రాండ్ → శాఖ → వంటశాల → స్టోర్ (spec వచనం docs/spec/MDF-01-company-brand-branch.txt; 19 Nov, code; tests 310/310, typechecks సరే; Mac లో నడపలేదు, click-through లేదు). collections companies, brands, kitchens, stores (కొత్తవి) + branches కి companyId, brandIds[], code, branchType, status. saveMaster / setMasterStatus / setupMasters (ఓనర్ మాత్రమే; client రాయలేరు). నియమాలు: బ్రాండ్ ఒకే కంపెనీది; శాఖ అనేక బ్రాండ్‌లకు పని చేయవచ్చు (ఒకటికి-ఒకటి కాదు); వంటశాల ≠ స్టోర్; స్టోర్ అదే శాఖ వంటశాలలో ఉండవచ్చు; నకిలీ పేరు / GSTIN / PAN తిరస్కరణ; GSTIN, PAN, PIN, మొబైల్ రూపం తనిఖీ; ఏదీ తొలగించరు — draft / active / inactive / archived; కింద వాడుకలో ఉన్నవి ఉంటే archive కాదు; ప్రతి మార్పు audit log లో (పాత → కొత్త). కోడ్‌లు COM-0001, BRD-, BRN-, KIT-, STR-. web తెర /masters (5 tabs, "మొదటి ఏర్పాటు" బటన్). ఇంకా లేనివి (తర్వాతి దశలు): లావాదేవీలపై company / brand ముద్ర (§25), స్టోర్ వారీ నిల్వ + స్టోర్ల మధ్య బదిలీ (§14), Zone → Rack → Shelf → Bin (§13), సున్నిత మార్పులకు ఆమోదం (§20), బ్యాంక్ / UPI ఖాతా masters, లోగో / సంతకం, పాత్ర వారీ కనిపించడం (§22), phone తెర. | Claude | 🟡 |
| X27 | Module 5b — లావాదేవీలపై కంపెనీ / బ్రాండ్ ముద్ర + బ్రాండ్ వారీ రిపోర్ట్ (MDF-01 §25, brand rules 3, 9; 19 Nov, code; tests 314/314, typechecks సరే). కొత్త బుకింగ్‌కు server trigger (stampBookingOrg) శాఖ యొక్క కంపెనీ + మొదటి బ్రాండ్ ముద్ర వేస్తుంది; client ఈ fields రాయలేరు (rules). setBookingBrand (ఓనర్ / మేనేజర్): ఆ శాఖ పని చేసే బ్రాండ్‌కే, ఇన్వాయిస్ / ముగింపు ముందే. కొత్త ఇన్వాయిస్ బుకింగ్ బ్రాండ్‌ను కాపీ చేసుకుని ఉంచుకుంటుంది (తర్వాత మారినా పాత ఇన్వాయిస్ మారదు). brandReport (ఓనర్, Finance Head): బ్రాండ్ వారీ కార్యక్రమాలు, ఇన్వాయిస్ మొత్తం, వచ్చింది, రావలసింది, నేరు ఖర్చు, మిగులు; బ్రాండ్ తెలియనివి వేరే వరుసలో. ముద్ర లేని పాత పత్రాలు శాఖ ద్వారా చదవబడతాయి. web: బుకింగ్ తెరలో బ్రాండ్ ఎంపిక (శాఖకు 2+ బ్రాండ్‌లు ఉంటేనే కనిపిస్తుంది), లాభ నష్టాల తెరలో బ్రాండ్ రిపోర్ట్. లేనివి: కొటేషన్, కొనుగోలు, ఖర్చు పత్రాలపై ముద్ర (రిపోర్ట్ వాటిని కార్యక్రమం ద్వారా చదువుతుంది); బ్రాండ్ వారీ లోగో / పేరు ఇన్వాయిస్ ప్రింట్‌లో; phone. | Claude | 🟡 |
| X28 | Module 5c — స్టోర్ వారీ నిల్వ + స్టోర్ల మధ్య బదిలీ (MDF-01 §10–§14; 19 Nov, code; tests 322/322, typechecks సరే; Mac లో నడపలేదు, click-through లేదు). పద్ధతి: వస్తువుకు ఒకే మొత్తం (quantityInStock) — కొనుగోలు, వంట తీసివేత, ప్యాకింగ్ ముందులాగే మారుస్తాయి (వాటిలో మార్పు లేదు). ప్రతి వస్తువుకు "సాధారణ స్టోర్" (homeStoreId; లేకపోతే శాఖ ప్రధాన స్టోర్); inventory.storeQty = ఇతర స్టోర్లలో ఉన్నది; సాధారణ స్టోర్ నిల్వ = మొత్తం − ఇతర స్టోర్లు. transferStock (ఓనర్ / మేనేజర్): అదే శాఖ స్టోర్ల మధ్య; మొత్తం మారదు; XFER_OUT + XFER_IN movements; quarantine / scrap స్టోర్ నుంచి తీయడం ఓనర్ మాత్రమే. setItemHomeStore: సాధారణ స్టోర్ మార్చినా ఏ నిల్వా కదలదు. adjustStock కి storeId (ఐచ్ఛికం) — ఆ స్టోర్‌లో ఉన్నంతే తీయగలరు. client స్టోర్ నిల్వను నేరుగా రాయలేరు (rules). web: నిల్వ తెరలో "స్టోర్లు" బటన్ → స్టోర్ వారీ నిల్వ, బదిలీ, సాధారణ స్టోర్. తెలిసిన పరిమితులు: కొనుగోలు / సరుకు రసీదు స్టోర్ ఎంచుకోనివ్వదు (సాధారణ స్టోర్‌కే); వంట తీసివేత సాధారణ స్టోర్ నుంచే — అక్కడ లేకపోతే ఆ స్టోర్ మైనస్ చూపుతుంది (హెచ్చరికతో); బ్యాచ్ / గడువు స్టోర్ వారీగా కాదు; శాఖల మధ్య బదిలీ లేదు; phone తెర లేదు; web లో చేతి సవరణకు స్టోర్ ఎంపిక ఇంకా లేదు (server సిద్ధం). Mac చెక్ 19 Nov 23:28: server 322/322, web build, rules 327/327, phone build — అన్నీ సరే. | Claude | 🟡 |
| X29 | Module 5d — ఫుడ్ సేఫ్టీ, మొదటి భాగం (spec X10 "Food safety, QC and traceability"; 19 Nov, code; tests 326/326, typechecks సరే; Mac లో నడపలేదు, click-through లేదు). బ్యాచ్ ఆపడం (holdBatch — ఓనర్ / మేనేజర్, కారణంతో): ఆపిన బ్యాచ్ ప్లాన్‌లో, రిజర్వ్‌లో, అమ్మకంలో లెక్కకు రాదు (inventory.expiredQty లో కలుస్తుంది — దాన్ని అన్ని చోట్లా ముందే తీసేస్తున్నారు), వాడకంలో చివరికి వస్తుంది. నిర్ణయం (decideBatchHold): విడుదల లేదా పారవేయడం (పారవేస్తే నిల్వ నుంచి movement తో పోతుంది); ఆపిన వ్యక్తే నిర్ణయించలేరు (ఓనర్ తప్ప); ఆమోదించగల పాత్రలే. జాడ (traceBatch): ఆ బ్యాచ్ ఏ కార్యక్రమాలకు ఎంత వెళ్ళిందో. web: నిల్వ తెరలో ప్రతి బ్యాచ్ దగ్గర ఆపు / విడుదల / పారవేయి / ఎక్కడికి వెళ్ళింది. పరిమితి: గడువు తేదీ నమోదు చేసే వస్తువులకే బ్యాచ్‌లు ఉంటాయి. spec X10 / §44 లో ఇంకా లేనివి: పరిశుభ్రత / శుభ్రత చెక్‌లిస్ట్‌లు, ఉష్ణోగ్రత నమోదు, రుచి ఆమోదం, ఆహార సంఘటన నమోదు, అలర్జీ పట్టిక, వెజ్ / నాన్-వెజ్ వేరు — పరిమితులు, తనిఖీ అంశాలు ఓనర్ ఇవ్వాలి (spec: "కనిపెట్టకూడదు"). | Claude | 🟡 |
| X30 | Module 5e — ఫుడ్ సేఫ్టీ, రెండో భాగం (spec §44, X10; 19 Nov, code; tests 331/331, typechecks సరే; Mac చెక్ 19 Nov 23:44: server 331/331, web build, rules 332/332, phone build — అన్నీ సరే; click-through లేదు). చెక్‌లిస్ట్‌లు ఓనర్ రాస్తారు (settings.foodSafety; CRM లో ముందే ఏ అంశమూ, ఏ ఉష్ణోగ్రత పరిమితీ లేదు — spec ప్రకారం కనిపెట్టకూడదు): రకం (పరిశుభ్రత / శుభ్రత / ఉష్ణోగ్రత / రుచి ఆమోదం / నిల్వ / రవాణా), అంశాలు "సరే / సరిగా లేదు" లేదా అంకె (ఓనర్ ఇచ్చిన కనిష్ట – గరిష్ట పరిమితితో). తనిఖీ (saveSafetyCheck — అందరూ): ప్రతి అంశానికి జవాబు తప్పనిసరి; ఒక్కటి సరిగా లేకపోయినా ఫెయిల్ → ఓనర్, మేనేజర్‌కు notification. ఆహార సంఘటన (saveSafetyIncident — అందరూ; resolveSafetyIncident — ఓనర్ / మేనేజర్, నమోదు చేసిన వ్యక్తి తానే ముగించలేరు). web తెర /food-safety (4 tabs). మిగిలినవి: అలర్జీ పట్టిక, వెజ్ / నాన్-వెజ్ వేరు తనిఖీ, తనిఖీ చేయకపోతే గుర్తు చేయడం (రోజూ / ప్రతి కార్యక్రమానికి), కార్యక్రమానికి తనిఖీ జోడించడం web లో, phone తెర, రిపోర్ట్. | Claude | 🟡 |
| X31 | Module 5f — ప్యాకింగ్ & పంపిణీ (spec §32 Packing Engine, §33 Dispatch, TWF #08 rule 7, trip flow; 20 Nov, code; Mac చెక్ 20 Nov 08:21: server 336/336, web build, rules 335/335, phone build — అన్నీ సరే; click-through లేదు). collection dispatches (server మాత్రమే రాస్తుంది). ఒక పంపిణీ = ఒక కార్యక్రమానికి ఒక లోడ్: వరుసలు (ఆహారం / పాత్రలు / సామాను; పరిమాణం, పాత్ర, సీల్ నంబర్). దశలు వరుసగా: ప్యాక్ చేస్తున్నారు → ప్యాక్ అయింది → లోడ్ తనిఖీ (వాహనం, డ్రైవర్; తక్కువ లోడ్ అయితే కారణం తప్పనిసరి) → బయలుదేరింది → వేదికకు అందింది (తీసుకున్నవారి పేరు) → తిరిగి వచ్చినవి లెక్క (పాత్రలు, సామాను ప్రతిదీ లెక్కించాలి) → లెక్క ముగింపు (రానివాటికి కారణం తప్పనిసరి; ఓనర్ / మేనేజర్‌కు notification; నిల్వ నిశ్శబ్దంగా తగ్గదు). ప్రతి దశకు ఎవరు, ఎప్పుడు నమోదు. saveDispatch / cancelDispatch — ఓనర్ / మేనేజర్; advanceDispatch — కేటాయించిన సిబ్బంది కూడా (లెక్క ముగింపు తప్ప). web: /dispatch తెర + బుకింగ్ తెరలో "పంపిణీ" బటన్. లేనివి: వంట ప్లాన్ నుంచి వరుసలు స్వయంగా నింపడం; vehicles / vehicleTrips, equipmentMoves తో అనుసంధానం (ఇప్పుడు వాహనం పేరు రాయాలి); ఫోటో / సంతకం రుజువు; ప్రింట్; phone తెర. | Claude | 🟡 |
| X32 | Module 5g — పంపిణీ మెరుగులు (20 Nov, web మాత్రమే; web typecheck సరే; server / rules మారలేదు; click-through లేదు). కొత్త జాబితాలో "బుకింగ్ మెనూ నుంచి నింపు" (వంటకాల పేర్లు మాత్రమే; పరిమాణం చేతితో); లోడ్ తనిఖీలో వాహనాల జాబితా నుంచి ఎంపిక (డ్రైవర్ పేరు స్వయంగా నిండుతుంది; కొత్త పేరు కూడా రాయవచ్చు); "లోడ్ జాబితా ప్రింట్" (కాగితం: వరుసలు, లోడ్ / అందింది / తిరిగి వచ్చింది గడులు, మూడు సంతకాల గీతలు). లేనివి: వంట ప్లాన్ పరిమాణాలు; vehicleTrips / equipmentMoves లో స్వయంగా నమోదు; ఫోటో రుజువు; phone. | Claude | 🟡 |
| X33 | మొదటి click-through (20 Nov 09:15, Test Mode, ఓనర్ లాగిన్). తెరపై పని చేసినవి: పంపిణీ మొత్తం (కొత్త జాబితా + ఆరు దశలు + రానివాటి కారణం); మాస్టర్ల మొదటి ఏర్పాటు; /food-safety, /books, /payroll, /vendor-dues, /pnl, /inventory, /users తెరలు తెరుచుకున్నాయి. దొరికి సరిచేసినది: Users తెరలో React హెచ్చరిక. ఇంకా నొక్కనివి ROADMAP చివరి ఎంట్రీలో. | Claude | 🟡 |
| X34 | click-through 2–4 భాగాలు (20 Nov 09:35–10:25). తెరపై పని చేసినవి: పంపిణీ ప్రింట్ / రద్దు / వాహనం ఎంపిక; ఫుడ్ సేఫ్టీ చెక్‌లిస్ట్ + తనిఖీ + సంఘటన; రెండో స్టోర్ + బదిలీ; PO → సరుకు రసీదు → బిల్ తేడా వల్ల చెల్లింపు ఆగడం; నెల ముగింపు చెక్‌లిస్ట్ + లాక్; జీతాల ఖరారు + చెల్లింపు; అకౌంటెంట్ లాగిన్‌తో మెనూ తగ్గడం. చేరనివి: మెనూ నుంచి నింపు, బ్యాంక్ సరిపోలిక, బ్యాచ్ నిలుపుదల, నిల్వ మార్పు ఆమోదం, బ్రాండ్ రిపోర్ట్, PR దశ. తేలాల్సినవి: నెల మధ్యలో "ఇవ్వవలసిన జీతాలు" మైనస్; ఆగిన బిల్లు బాకీల తెరలో లేదు; /menu తెర ఇంగ్లీషులో. | Claude | 🟡 |
| X35 | click-through 5వ భాగం + సవరణలు (20 Nov 10:35, Test Mode). సరిచేసి తెరపై చూసినవి: /menu తెర తెలుగులో (హిందీ కూడా); /vendor-dues లో తేడా వల్ల ఆగిన బిల్లు "ఆగింది ₹…" గా కనిపిస్తుంది, ఆగిన మొత్తానికి "చెల్లించు" ఉండదు, చెల్లింపు పంపకంలో ఆగిన బిల్లు రాదు (server: heldAmount, test 337/337); Test Mode మళ్ళీ మొదలైనప్పుడు శాఖ వివరాలు చెరిగిపోయే seed లోపం సరిచేశాను. తెరపై పని చేసినవి: మెనూ నుంచి పంపిణీ జాబితా నింపు; బ్యాంక్ సరిపోలిక (తయారు చేసిన CSV తో — నిజమైన బ్యాంక్ ఫైల్ ఇంకా కావాలి); రెండో బ్రాండ్ + బుకింగ్ బ్రాండ్ ఎంపిక + బ్రాండ్ రిపోర్ట్; బ్యాచ్ ఆపడం / జాడ / విడుదల; స్టోర్ మేనేజర్ నిల్వ మార్పు ఆమోదం కోసం ఆగడం → ఓనర్ ఆమోదం; PR → ఆమోదం → PO; ఆగిన బిల్ విడుదల. ఇంకా: phone app, నిజమైన బ్యాంక్ ఫైల్. తేలాల్సింది: నెల మధ్యలో "ఇవ్వవలసిన జీతాలు" మైనస్ (అకౌంటెంట్ నిర్ణయం). | Claude | 🟡 |
| X36 | Module 5h — అలర్జీ పట్టిక + వెజ్ / నాన్-వెజ్ వేరు (spec §44; 20 Nov; server tests 346/346; తెరపై నొక్కి చూశాను). CRM లో ముందే ఏ అలర్జీ పేరూ లేదు — ఓనర్ జాబితా రాస్తారు. వంటకాలు, సరుకులకు శాకాహారం / మాంసాహారం + అలర్జీ గుర్తులు (server ద్వారా మాత్రమే, audit తో); గుర్తించనివి "తెలియదు" గానే. కార్యక్రమం పట్టిక: వంటకం × అలర్జీ (ఎక్కడి నుంచి వచ్చిందో), అసలు రకం (లోపల ఏదైనా మాంసాహారం ఉంటే మాంసాహారం), "శాకాహారం అని గుర్తించారు కానీ మాంసాహారం ఉంది", శాకాహారం మాత్రమే బ్రాండ్‌లో మాంసాహారం, అలర్జీ ప్రత్యేక భోజనాలు; ప్రింట్. తెర: ఫుడ్ సేఫ్టీ → "అలర్జీ / వెజ్-నాన్‌వెజ్". క్లిక్ చేస్తుండగా దొరికి సరిచేసినది: ఒక వంటకం సేవ్ అయితే ఇతర వరుసల్లో ఎంచుకున్నవి పోయేవి. లేనివి: వంటశాల స్థాయి వేరు (బుకింగ్‌కు వంటశాల లేదు), బుకింగ్ సమయంలో ఆపడం (హెచ్చరిక మాత్రమే), కస్టమర్ అలర్జీ గమనిక, phone. | Claude | 🟡 |
| X37 | 5h తర్వాత: మీరు చెప్పినట్టు అలర్జీల జాబితాలో "FSSAI 8 అలర్జీలు చేర్చు" బటన్ (గ్లూటెన్ ధాన్యాలు, క్రస్టేషియన్, పాలు, గుడ్డు, చేప, వేరుశనగ / గింజలు, సోయా, సల్ఫైట్ — FSSAI Labelling & Display Regulations 2020). Test Mode లో నొక్కి, సేవ్ చేసి, 4 వంటకాలకు గుర్తులు పెట్టి, పట్టికలో చూశాను. web మాత్రమే (typecheck సరే). | Claude | 🟡 |
| X38 | 5i: చేయని తనిఖీలకు గుర్తు (spec: ఏ పరిమితినీ CRM కనిపెట్టదు). ప్రతి చెక్‌లిస్ట్‌కు యజమాని "రోజూ ఈ సమయంలోపు" పెడితేనే వాచ్ — ఖాళీ అయితే గుర్తు లేదు. ఆ సమయం దాటినా ఆ శాఖలో ఈరోజు ఆ చెక్‌లిస్ట్ నింపకపోతే యజమాని/మేనేజర్‌కు నోటిఫికేషన్ (రోజుకు ఒక్కసారి, శాఖ × చెక్‌లిస్ట్ వారీ; `safetyCheckWatch`, ప్రతి 15 నిమిషాలు). వెబ్: చెక్‌లిస్ట్ ఎడిటర్‌లో సమయం గడి; "తనిఖీ చేయి" ట్యాబ్ పైన "ఈరోజు తనిఖీలు" చిప్స్ (అయింది ✓ / ఆలస్యం). Test: M5e 1 కొత్తది (347/347). Test Mode తెరపై సమయం సేవ్, చిప్స్ చూశాను; **watcher నోటిఫికేషన్ పంపడం unit test మాత్రమే (scheduled function emulatorలో నడిపి చూడలేదు)**; ఫోన్ లేదు. | Claude | 🟡 |
| X39 | 5j: పంపిణీ జాబితా డైలాగ్‌లో "వంట ప్లాన్ నుంచి పరిమాణాలు" బటన్ — `eventPlan` నుంచి వంటకాల పేర్లు + పరిమాణం + కొలత నింపుతుంది (ఇప్పటికే ఉన్న వరుసలకు పరిమాణం వేస్తుంది); బుకింగ్‌లో ఒకటికంటే ఎక్కువ సెషన్‌లు ఉంటే సెషన్ ఎంచుకోవాలి (లోడ్ ఆ సెషన్‌కు `sessionId`తో సేవ్). ప్లాన్‌లో పరిమాణం లేని (నేర్చుకోని) వంటకాలు ఖాళీగా వస్తాయి — మీరే రాయాలి; ప్లాన్ ఖాళీ అయితే చెబుతుంది. కొత్త server కోడ్ లేదు. Test Mode తెరపై చూశాను: లంచ్ మెనూ కొటేషన్ → పులిహార 26.5 kg, పెరుగు 16 kg వచ్చాయి, సేవ్ అయింది. **చూడనివి:** బహు-సెషన్ ఎంపిక, ఫోన్. | Claude | 🟡 |
| X40 | లోపం సరిచేశాను: సిబ్బంది (staff) కు settings చదివే అనుమతి లేదు, కాబట్టి ఫుడ్ సేఫ్టీ "తనిఖీ చేయి" లో చెక్‌లిస్ట్‌లు వాళ్లకు కనిపించేవి కావు (web లో). కొత్త server కాల్ `listSafetyChecklists` (ఎవరికైనా; ఆపిన లిస్ట్‌లు రావు) — staff కు web, ఫోన్ ఇదే వాడతాయి. Test: callable పట్టిక (349/349). staff login తో తెరపై చూడలేదు. | Claude | 🟡 |
| X41 | ఫోన్: ఫుడ్ సేఫ్టీ స్క్రీన్ (`ui/safety/FoodSafetyScreen.kt`) — తనిఖీ చేయి (సరే / సరిగా లేదు, అంకెలు + పరిమితి చూపు), చరిత్ర, ఆహార సంఘటన నమోదు, ముగించడం (యజమాని/మేనేజర్; తాను నమోదు చేసినదాన్ని తానే ముగించలేరు). కోడ్ మాత్రమే — Mac build చెక్ చూడండి; **ఫోన్‌లో నిజంగా నొక్కి చూడలేదు**. | Claude | 🟡 |
| X42 | ఫోన్: పంపిణీ స్క్రీన్ (`ui/safety/DispatchScreen.kt`) — దశలు: ప్యాకింగ్ పూర్తి → లోడ్ తనిఖీ (వాహనం, పరిమాణాలు; తక్కువైతే కారణం) → బయలుదేరింది → వేదిక వద్ద అందింది (తీసుకున్నవారి పేరు) → తిరిగి వచ్చినవి లెక్క (చేతితో లెక్కించాలి, ఊహించదు) → లెక్క సరిపోల్చు (యజమాని/మేనేజర్, తక్కువకు కారణం). కొత్త జాబితా web లో రాయాలి. కోడ్ మాత్రమే; **ఫోన్‌లో చూడలేదు**. | Claude | 🟡 |
| X43 | మీ నిర్ణయాలు (20 Nov, 11:39): stock-adjust ఆమోద శాతం డిఫాల్ట్ 10 → **30%** (settings లో మార్చుకోవచ్చు; ఇప్పటికే సేవ్ చేసిన విలువ ఉంటే అదే నిలుస్తుంది). నెల లాక్ → **మేనేజర్ కూడా** చేయగలరు (server `lockPeriod`; తిరిగి తెరవడం `unlockPeriod` యజమాని మాత్రమే). గమనిక: web "పుస్తకాలు" పేజీ యజమాని మాత్రమే తెరవగలరు, కాబట్టి మేనేజర్‌కు లాక్ బటన్ ఇంకా కనిపించదు — ఆ పేజీ మేనేజర్‌కు తెరవాలో మీరు చెప్పాలి. వాహన ట్రిప్పులు: తేదీ చేతితో, ఖర్చు కి.మీ. ప్రకారం (ఇప్పుడున్నదే: ఇంధనం + ₹/కి.మీ × కి.మీ) — ఆటో రాయడం చేయం. | Claude | 🟡 |
| X44 | సరుకు రసీదు (GRN) లో "ఏ స్టోర్‌లోకి" ఎంపిక: `receiveGoods` కు ఐచ్ఛిక `storeId` (శాఖలోని వాడుకలో ఉన్న, వేరుగా ఉంచని స్టోర్ మాత్రమే). ఖాళీ అయితే ఇదివరకటిలా వస్తువు సాధారణ స్టోర్. రసీదు రద్దు చేస్తే ఆ స్టోర్ నుంచే తీసేస్తుంది. Tests ✅ (పని నియమాలు); తెరపై నొక్కి చూడలేదు. | Claude | 🟡 |
| X45 | శాఖ నుంచి శాఖకు stock బదిలీ: `transferToBranch` (యజమాని / తన శాఖ మేనేజర్). ఆ శాఖలో ఇదే పేరు + ఇదే యూనిట్ వస్తువు ఉండాలి (లేకపోతే కాదు — ఏదీ కొత్తగా సృష్టించదు). గడువు తేదీ లెక్కించే వస్తువులు ఇంకా బదిలీ కావు (చేతితో తీసి అక్కడ చేర్చాలి). రెండు కదలికలు, డబ్బు కదలదు. web: Inventory → స్టోర్ నిల్వ డైలాగ్ లో "మరో శాఖకు పంపడం". Tests ✅; తెరపై చూడలేదు. | Claude | 🟡 |
| X46 | veg-only బ్రాండ్‌కు non-veg ఆపడం: బుకింగ్ web ఫారం‌లో (`useVegOnlyBrand`) — బుకింగ్ బ్రాండ్ (లేకపోతే శాఖ మొదటి బ్రాండ్) శాకాహారం-మాత్రమే అయితే, మాంసాహార మెనూ ఐటమ్ ఉన్న బుకింగ్ సేవ్ కాదు. గమనిక: ఇది web ఫారం లో మాత్రమే (బుకింగ్ నేరుగా Firestore కు రాస్తుంది, server కాల్ కాదు); ఫోన్ బుకింగ్ ఫారం లో ఇంకా లేదు; అలెర్జీ షీట్ లో ఇదివరకే హెచ్చరిక ఉంది. తెరపై చూడలేదు. | Claude | 🟡 |
| X47 | కస్టమర్ అలెర్జీ నోట్: customer ఫారం లో కొత్త గడి (`allergyNote`, rules లో 1000 అక్షరాలు వరకు), ఆ customer బుకింగ్ అలెర్జీ షీట్ లో నోట్ కనిపిస్తుంది. rules tests రెండు చేర్చాను (Mac check లో నడుస్తాయి). | Claude | 🟡 |
| X48 | "శాకాహారం, మాంసాహారం వేరు వేరు వంటశాలల్లో": అలెర్జీ షీట్ లో ఈ శాఖ వంటశాలల ప్రకారం ఏ వంటకం ఏ వంటశాలలో వండాలో చూపుతుంది; శాకాహార-మాత్రమే వంటశాల లేకపోతే, మాంసాహార వంటశాల లేకపోతే, వంటశాలలే లేకపోతే హెచ్చరిక. ఇది చూపించడం మాత్రమే — వంటశాలను బుకింగ్‌కు కేటాయించడం, నిర్బంధం ఇంకా లేదు (యజమాని చెప్పాలి). Tests ✅. | Claude | 🟡 |
| X49 | Refund ఆమోద విధానం (spec: తయారు → ఆమోదం → చెల్లింపు): మేనేజర్ Invoice తెరలో "Refund కోసం అభ్యర్థన" (`requestRefund`, శాఖ సొంత invoice, చెల్లించిన దాని కంటే ఎక్కువ కాదు, ఒక invoice కు ఒక్కటే ఆగి ఉండాలి) → యజమాని "ఆమోదించి refund చేయి" / కారణంతో తిరస్కరణ (`decideRefund`) → ఆమోదిస్తే అప్పుడే refund నమోదు (అదే `applyRefund`). యజమాని ఇప్పటికీ నేరుగా refund చేయవచ్చు. notifications, `refundRequests` (క్లయింట్ రాయలేరు). Tests ✅ (356); తెరపై చూడలేదు. | Claude | 🟡 |
| X50 | web: జీతం చెల్లింపు రద్దు బటన్ (యజమాని) — జీతం చెల్లింపుల ప్యానెల్ లో ప్రతి చెల్లింపు పక్కన "రద్దు" + కారణం; లాక్ అయిన నెల చెల్లింపు రద్దు కాదు (server). తెరపై చూడలేదు. | Claude | 🟡 |
| X51 | ఇంకా చేయనివి (మీ అంకెలు కావాలి): discount ఆమోద పరిమితి (ఏ శాతం/మొత్తం దాటితే యజమాని ఆమోదం) — పరిమితి నేను కనిపెట్టను; జీతం దశల ఆమోదం (ఇప్పుడు ఖరారు యజమాని మాత్రమే చేస్తారు కాబట్టి అదే ఆమోదం). | యజమాని | ⬜ |
| X52 | బ్రాండ్ లోగో: బ్రాండ్ మాస్టర్ లో లోగో అప్‌లోడ్ (`logoUrl`, https మాత్రమే); ఇన్‌వాయిస్ ప్రింట్ లో ఆ బుకింగ్ బ్రాండ్ (లేకపోతే శాఖ మొదటి బ్రాండ్) లోగో + ఇన్‌వాయిస్ పేరు వస్తుంది (`useInvoiceBrand`). లోగో లేకపోతే ఇదివరకటి వ్యాపార లోగో. కొటేషన్ ప్రింట్ లో ఇంకా కాదు. తెరపై చూడలేదు. | Claude | 🟡 |
| X53 | స్టోర్ లోపల స్థానాలు (జోన్ / ర్యాక్ / షెల్ఫ్ / బిన్): స్టోర్ మాస్టర్ లో యజమాని రాస్తారు (`parseLocations`, 1–4 భాగాలు); వస్తువుకు ఆ జాబితా నుంచి స్థానం ఎంచుకోవచ్చు (`setItemLocation`, స్టోర్ నిల్వ డైలాగ్). స్థానం వారీగా నిల్వ లెక్క లేదు (స్టోర్ వారీ లెక్క మాత్రమే) — అది కావాలంటే చెప్పండి. Tests ✅ (358); తెరపై చూడలేదు. | Claude | 🟡 |
| X54 | ఫోన్: veg-only బ్రాండ్ నియమం బుకింగ్ ఫారం లో (`BookingEditViewModel.save` → శాఖ మొదటి బ్రాండ్ శాకాహారం-మాత్రమే అయితే మాంసాహార ఐటమ్ ఉన్న బుకింగ్ సేవ్ కాదు; లుక్అప్ విఫలమైతే సేవ్ ఆపదు). Compile OK; ఫోన్‌లో నొక్కి చూడలేదు. | Claude | 🟡 |
| X55 | జీతం ఖాతా తేదీ: జీతం నెల మధ్యలో ఖరారు చేస్తే ఆ రోజే లెక్కలో చేరుతుంది, లేకపోతే నెలాఖరున (`payrollBookingDay` in `functions/src/ledger/ledgerSources.ts`) — "చెల్లించాల్సిన జీతాలు" మైనస్ కాకుండా. యజమాని A/B/C ఎంపిక చేయలేకపోయాడు, కాబట్టి ఇది నా నిర్ణయం (A కు చిన్న మెరుగు); మార్చాలంటే చెప్పండి. కోడ్ + పరీక్ష మాత్రమే | server test ✔ (screen లో చూడలేదు) |
| X56 | ఫుడ్ సేఫ్టీ: "ముసాయిదా జాబితాలు చేర్చు" బటన్ (`FoodSafetyPage.tsx`) — 3 అవును/కాదు జాబితాలు (పరిశుభ్రత, నిల్వ, ఈవెంట్‌కు పంపే ముందు) ఆపి ఉంచిన స్థితిలో చేరతాయి; అంకెలు/ఉష్ణోగ్రత పరిమితులు ఏవీ లేవు; యజమాని చదివి మార్చి "వాడుకలోకి" నొక్కి సేవ్ చేయాలి | web build ✔ (screen లో చూడలేదు) |
| X57 | కొటేషన్ ప్రింట్ లో బ్రాండ్ లోగో/పేరు (ఇన్వాయిస్ లాగే; `QuotationsPage.tsx` + `useInvoiceBrand`) | web build ✔ (screen లో చూడలేదు) |
| X58 | ఫోన్: "ఆమోదం కోసం ఆగినవి" — ఆగిన stock సవరణలు ఆమోదం/తిరస్కరణ (`StockApprovalDialog.kt`, `InventoryListScreen.kt`; owner + manager) | కోడ్ మాత్రమే — ఫోన్ build ఇంకా కంపైల్ చేయలేదు (Mac లాక్ అయి ఉంది) |
| X59 | ఫోన్: జీతం పేజీలో ఖరారైన జీతం / ఇచ్చినది / ఇంకా ఇవ్వాల్సింది + "చెల్లించు" (owner → `recordSalaryPayment`; `AttendanceScreens.kt`, `AttendanceViewModel.kt`, `Functions.kt`) | కోడ్ మాత్రమే — ఫోన్ build ఇంకా కంపైల్ చేయలేదు |
| X60 | ఖాతా పుస్తకాల CSV ఎగుమతి: Books పేజీ "CSV ఎగుమతి" (యజమాని) → `ledgerExport` (`functions/src/ledger/exportRules.ts`) — ప్రతి journal line ఒక వరుస, వరుస సంఖ్య voucher. ఇది సాధారణ అకౌంటింగ్ CSV; నేరుగా Tally ఫైల్ కాదు, Tally లో ప్రయత్నించలేదు | server test ✔ 362/362, web build ✔ (screen లో చూడలేదు) |
| X61 | Razorpay చెల్లింపు లింక్: invoice పై "చెల్లింపు లింక్" బటన్ → `createPaymentLink` (`functions/src/integrations/razorpay.ts`, నియమాలు `razorpayRules.ts`). కస్టమర్ చెల్లిస్తే `razorpayWebhook` (HMAC సంతకం చూసి) ఆటోమేటిక్ గా రసీదు నమోదు. యజమాని Razorpay ఖాతా keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) పెట్టే వరకు `none` — అప్పటివరకు పనిచేయదు | server test ✔ 370/370; నిజమైన Razorpay తో ప్రయత్నించలేదు, screen లో చూడలేదు |
| X62 | కస్టమర్ పోర్టల్: quotation / invoice పై "కస్టమర్ లింక్" బటన్ → `createPortalLink` (గడువు ఉన్న రహస్య లింక్, `revokePortalLinks` తో రద్దు). లింక్ `/p/<token>` లో లాగిన్ లేకుండా కస్టమర్ quotation చూసి ఒప్పుకోవచ్చు (`portalAccept`), invoice చూసి చెల్లింపు లింక్ తెరవచ్చు (`portalPay`). కస్టమర్ ఎవరి ధరలు/ఇతర డేటా చూడలేడు (`functions/src/portal/portalRules.ts`, `PortalPage.tsx`) | server test ✔; web build ✔; screen లో చూడలేదు |
| X63 | క్యాలెండర్ "పండుగలు & నోట్లు" పేజీ (`CalendarNotesPage.tsx`): పండుగ / ఐడియా / నోట్ / గుర్తు నెల క్యాలెండర్ లో + ఆ నెల ఈవెంట్ బుకింగ్ లు కలిపి. యజమాని/మేనేజర్ చేర్చి మార్చి తీసేయవచ్చు (`calendarNotes` + rules). పండుగ తేదీలు CRM ఇవ్వదు (చాంద్రమాన తేదీలు ప్రతి ఏడాది మారతాయి — మీరే రాయాలి). నోట్లకు ఫోటోలు లేవు; ఫోన్ లో కూడా ఉంది (X65) | web build ✔, Hindi ✔, rules tests ✔ 348/348 (Mac); screen లో చూడలేదు |
| X64 | WhatsApp: కొత్త కోడ్ అవసరం లేదు — పాత adapter (`functions/src/integrations/whatsapp.ts`) ఉంది; `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` నిజమైన విలువలు + Meta ఆమోదించిన templates వచ్చే వరకు సందేశాలు "queued" లో ఉంటాయి | యజమాని ఖాతా కావాలి; నిజంగా పంపి చూడలేదు |
| X65 | ఫోన్: "పండుగలు & నోట్లు" స్క్రీన్ (డ్రాయర్, యజమాని + మేనేజర్): నెల వారీగా పండుగ/ఐడియా/నోట్/గుర్తు చూడటం, చేర్చడం, మార్చడం, తీసేయడం — వెబ్ తో ఒకే `calendarNotes` డేటా (`CalendarNotesScreen.kt`). ఫోన్ లో ఆ నెల ఈవెంట్ బుకింగ్ లు చూపించదు (వెబ్ లో చూపిస్తుంది) | Mac phone build ✔ (23:07); screen లో చూడలేదు |
| X66 | ఫోన్: వినియోగదారుల పేజీలో "పని పాత్ర" (17 పాత్రల్లో ఎంచుకోవడం; యజమాని పాత్ర ఇవ్వరు). స్థాయి (సిబ్బంది/మేనేజర్) మార్చితే పని పాత్ర ఖాళీ అవుతుంది — వెబ్ లాగే (`UserManagementScreen.kt`, `UserRepository.kt`). ఇది మెనూ మాత్రమే తగ్గిస్తుంది, అనుమతులు ఇవ్వదు | Mac phone build ✔ (23:12); screen లో చూడలేదు |
| X67 | ఫోన్: "కంపెనీ · శాఖలు · స్టోర్లు" స్క్రీన్ (యజమాని మాత్రమే): కంపెనీ/బ్రాండ్/శాఖ/వంటశాల/స్టోర్ల జాబితా, కొత్తది చేర్చడం, వివరాలు మార్చడం (వెబ్ లోని అవే ఫీల్డ్లు; `saveMaster`, `MasterForms.kt`), స్థితి మార్పు (వాడుకలో / ఆపారు / ఆర్కైవ్, కారణం తప్పనిసరి; `setMasterStatus`). బ్రాండ్ లోగో అప్‌లోడ్ మాత్రం వెబ్ లోనే | Mac phone build ఫలితం కింద; screen లో చూడలేదు |
| X68 | హిందీ: server పంపే error సందేశాలలో స్థిరమైన 206 ఇప్పుడు హిందీలో (`tools/hi/batch10.json` → `errorText` లో హిందీ చూసుకుంటుంది). అంకెలు/పేర్లు కలిసిన సందేశాలు, ప్రింట్ చేసే డాక్యుమెంట్లు, ఫోన్ యాప్ ఇంకా ఇంగ్లీష్/తెలుగులోనే. అనువాదం నేను చేసినది — హిందీ తెలిసిన వారు చూడాలి | web build ✔ (Mac 23:19); screen లో చూడలేదు |
| X69 | ఫోన్ యాప్ హిందీ: సెట్టింగ్స్ + డ్రాయర్ లో "हिन्दी" ఎంపిక. ఫోన్ లోని 1,356 వాక్యాలు + 236 నమూనాలు హిందీలోకి (`assets/hi.json`, `hi-patterns.json` ← `tools/hi/phone/` + `python3 tools/hi/phone_merge.py`; ఇంకా లేనివి `phone_extract.py` చూపిస్తుంది). `L("తెలుగు","English")` లో ఇంగ్లీష్ వాక్యం హిందీ నిఘంటువులో వెతుకుతారు; దొరకనిది ఇంగ్లీష్ గా కనిపిస్తుంది. అనువాదం నేను చేసినది — హిందీ తెలిసిన వారు చూడాలి | Mac phone build ✔ (23:33); screen లో చూడలేదు |
| X70 | ప్రింట్ పత్రాలు మరియు కస్టమర్ పోర్టల్ హిందీ: పన్ను పత్రం తేదీలు హిందీ లొకేల్ లో, పోర్టల్ భాష బటన్ te/en/hi తిరుగుతుంది | Mac web build OK; screen లో చూడలేదు |
| X71 | ఫోన్: master లకు కొత్తవి చేర్చడం మరియు మార్చడం (కంపెనీ/బ్రాండ్/శాఖ/వంటశాల/స్టోర్; `saveMaster`; `MasterForms.kt`), పేరెంట్ ఎంపిక, సర్వర్ తప్పులు చూపిస్తుంది. బ్రాండ్ లోగో వెబ్ లోనే | Mac phone build OK; screen లో చూడలేదు |
| X72 | ఫోన్ masters లో బ్రాండ్ లోగో ఎంచుకుని upload (Storage `settings/`, యజమాని మాత్రమే). Masters edit లో దాచిన ఫీల్డ్లు (shortName, TAN, stateCode, FY ప్రారంభ నెల, nonVegAllowed, adjustmentApprovalRequired) ఇకపై reset కావు — వెబ్ మరియు ఫోన్ రెండిటిలో సరిచేశాను | Mac build OK; screen లో చూడలేదు |
| X73 | ఫోన్ calendar notes: ఆ నెల ఈవెంట్ బుకింగ్లు (రద్దైనవి కాకుండా) జాబితాలో, నోట్ కు 5 ఫోటోల వరకు (Storage `gallery/`); firestore.rules `photos` జాబితా ≤5 + 3 కొత్త rules tests. వెబ్ లో ఫోటోలు ఇంకా చూపవు | rules tests + Mac build; screen లో చూడలేదు |
| X74 | Hindi: సంఖ్యలు/పేర్లు ఉన్న server సందేశాల 26 templates; ఫోన్ లో server సందేశాల హిందీ (210 + 26) — ముందు ఫోన్ assets లో లేవు; 3 తేదీ స్థలాలు హిందీ locale కు | web build + phone build; హిందీ తెలిసినవారు చదవలేదు |
| X75 | Hindi review సాధనాలు: `tools/hi/export_review.py` → `docs/hindi-review.csv` (3,810 వరుసలు), సరిచేసిన CSV ను `apply_review.py` తో తిరిగి లోడ్; పదాల ఏకరూపత (ఇనవాయిస్, సప్లయర్, రసోయి, బకాయా, స్టాఫ్) 91 చోట్ల; హిందీ తెలిసినవారి సమీక్ష ఇంకా కాలేదు | scripts నడిచాయి |
| X76 | Plan B (multi-tenant): నిర్మించలేదు — `docs/PLAN-B-MULTI-TENANT.md` లో రూపకల్పన మరియు దశలవారీ క్రమం మాత్రమే | కోడ్ లేదు |
| X77 | Developer handover: `docs/DEVELOPER-HANDOVER.md` (architecture, setup, checks, deploy, how-to, audit result, go-live blockers). Audit fixes: web `strict` on, hosting security headers, Android backup off, `.gitignore`, lint step in `CRM Check.command`, DEPLOY-STEPS test counts | Mac check 21 Nov 00:05 IST OK (server 370, rules 351, web build + lint, phone build) |
| X78 | వెబ్ calendar notes: ఫోన్ లో జోడించిన ఫోటోలు చూపిస్తుంది (చదవడానికి మాత్రమే); `.github/workflows/ci.yml` (CI ఫైల్ — ఇంకా నడపలేదు) | web build Mac check తర్వాత; CI GitHub లో నడపలేదు |
