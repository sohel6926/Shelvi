# కోడ్ మ్యాప్ — ఏ కోడ్ ఎక్కడ ఉంది
# Code map — where every piece of code lives

ఈ ఫైల్ చూస్తే: ఏ పని (feature) కోసం server కోడ్, web పేజీ, phone స్క్రీన్, database collection, భద్రతా నియమం (rules) ఎక్కడ ఉన్నాయో ఒకేచోట తెలుస్తుంది.
This file shows, for every feature, where its server code, web page, phone screen, database collection and security rule live.

కొత్త file / పేజీ కలిపినప్పుడు ఈ ఫైల్ కూడా మార్చండి, తర్వాత `python3 tools/check-code-map.py` నడపండి — తప్పు path ఉంటే అది చెబుతుంది.
When you add a file or page, update this map and run `python3 tools/check-code-map.py` — it fails if any path, route, callable, collection or rules section listed here does not exist.

## సంక్షిప్త గుర్తులు
## Short-hand used below

| గుర్తు / Mark | అర్థం / Meaning |
|---|---|
| **fn:**… | functions/src/… — server (Firebase Cloud Functions, TypeScript) |
| **web:**… | web/src/… — web admin (React + MUI) |
| **app:**… | app/src/main/java/com/example/suseelacateringcrm/… — Android phone app (Kotlin / Compose) |
| **name()** | server function exported from `functions/src/index.ts` (a callable, or an automatic trigger / schedule) |
| **/route** | web address of a page, from `web/src/routes/AppRouter.tsx` |
| **§N** | section N of `docs/calc-spec.md`; the formula code is in `fn:calc/` |
| **«…»** | section heading inside `firestore.rules` |
| plain `bookings` (no prefix) | Firestore collection name |

ఫోన్ app, web రెండూ server ని ఇక్కడి నుండి పిలుస్తాయి / Both apps call the server through: `web:data/functions.ts`, `app:data/remote/Functions.kt` (+ `app:data/remote/Round9Api.kt`, `app:data/remote/Round10Api.kt`, `app:data/remote/PlanApi.kt`). ఒప్పందం / Contract: `docs/api-contract.md`. Collection పేర్లు / Collection names: `fn:shared/firestorePaths.ts`, `app:data/remote/FirestoreCollections.kt`. Server entry (అన్ని functions list): `fn:index.ts`. Web pages list: `web:routes/AppRouter.tsx` + menu `web:components/AppShell.tsx`. Phone screens list: `app:ui/navigation/NavRoutes.kt`, `app:ui/navigation/SuseelaNavGraph.kt`, drawer `app:ui/navigation/AppScaffold.kt`.

---

## 1. పై స్థాయి ఫోల్డర్లు
## 1. Top-level folders

| ఫోల్డర్ / Folder | తెలుగు | English |
|---|---|---|
| `functions/` | Server — లెక్కలు, invoices, payments, జీతాలు, agents | Cloud Functions (TypeScript): calculations, money, triggers, schedules |
| `functions/src/calc/` | అన్ని లెక్కల సూత్రాలు (pure, పరీక్షలతో) | All formulas, pure code, matches `docs/calc-spec.md` |
| `functions/test/` | Server పరీక్షలు (`npm test`) | Server unit tests |
| `web/` | Owner / manager కోసం web admin | Web admin (React + MUI v9 + Vite) |
| `app/` | Android phone app | Android app (Kotlin, Jetpack Compose) |
| `firestore.rules` | Database భద్రతా నియమాలు — ఎవరు ఏది చూడొచ్చు / మార్చొచ్చు | Firestore security rules |
| `firestore.indexes.json` | Database search indexes | Firestore composite indexes |
| `storage.rules` | ఫోటోలు / bills upload నియమాలు | Cloud Storage rules (photos, bills, receipts) |
| `firebase.json` | Firebase settings (deploy, test mode ports) | Firebase project config (hosting, emulators) |
| `.firebaserc` | ఏ Firebase project కి deploy అవుతుందో | Which Firebase project to deploy to |
| `docs/` | అన్ని వివరణ పత్రాలు (క్రింద section 4) | All documentation (index in section 4) |
| `tools/` | Test mode data నింపడం, rules పరీక్ష, ఈ map check | Emulator seed, rules test, this map's checker |
| `data/seed/` | మొదటి data — 10 menus, grocery items | Seed data (menus, grocery items) |
| `design/` | రంగులు / font tokens | Design tokens (`design/tokens.json`) |
| `branding/` | సుశీల logo | Logo |
| `gradle/` | Android build సాధనం | Gradle wrapper (with `gradlew`, `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`) |
| `keystore/` | ⚠️ App sign keys — రహస్యం, ఎవరికీ పంపవద్దు, backup తప్పనిసరి | ⚠️ Release signing keys — secret, keep backed up |
| `local.properties` | ఈ Mac లో Android SDK ఎక్కడుందో (ఈ Mac కి మాత్రమే) | Android SDK path for this Mac only |
| `CRM Test Mode.command` | Double-click చేస్తే test mode (మీ Mac లో మాత్రమే) | Starts local test mode |
| `DEPLOY-STEPS.md` | Live చేయడానికి step-by-step (తెలుగు) | Go-live steps |
| `README.md` | మొదట చదవాల్సిన చిన్న పరిచయం | Short intro / entry point |
| `Catering-CRM-Complete-v15/` | పాత reference project — build లో వాడరు | Old reference project, not part of the build |
| `_backup_2026-11-05/` | మార్పులకు ముందు backups | Backups taken before changes |
| `_snap/` | పాత zip / tgz / apk snapshots | Old snapshots (zip, tgz, test APKs) |
| `_xfer/` | మునుపటి పనుల transfer files (build లో వాడరు) | Scratch transfer bundles from earlier work rounds |
| `_to_delete/` | పనికిరాని files — ఒకసారి చూసి delete చేయొచ్చు | Retired files, safe to delete after a look |
| .test-data/ | Test mode మూసేటప్పుడు మీ test data ఇక్కడ save అవుతుంది (మొదటిసారి తర్వాత వస్తుంది) | Test-mode data, created when test mode is closed |

.claude/, .idea/, .gradle/, .kotlin/, .firebase/, node_modules/, lib/, lib-test/, dist/, build/ — సాధనాల cache / build output; చేతితో మార్చవద్దు. Tool caches and build output; never edit by hand.

---

## 2. ప్రతి పని (feature) ఎక్కడ ఉంది
## 2. Feature table

ప్రతి వరుస: మొదట తెలుగు పేరు, తర్వాత English. "—" అంటే ఆ భాగం లేదు (ఉదా: server లెక్క అవసరం లేని పని).
Each row: Telugu name first, then English. "—" means that layer has no code for this feature.

| పని / Feature | Server file(s) + functions | లెక్క / Calc (`fn:calc/`) + §  | Web page + route | Android screen(s) | Firestore | Rules |
|---|---|---|---|---|---|---|
| **బుకింగ్‌లు (ఈవెంట్లు)**<br>Bookings (events) | `fn:events/sessionSync.ts` `syncBookingSessions()`<br>`fn:events/sessions.ts`<br>`fn:stats/triggers.ts` `statsOnBooking()` | — (price: §11, §21) | `web:modules/bookings/BookingsListPage.tsx` `/bookings`<br>`web:modules/bookings/BookingFormPage.tsx` `/bookings/new` `/bookings/:id/edit`<br>`web:modules/bookings/BookingDetailPage.tsx` `/bookings/:id`<br>`web:modules/bookings/BookingDetailCards.tsx`<br>`web:data/bookingRepository.ts` | `app:ui/bookings/BookingsListScreen.kt`<br>`app:ui/bookings/BookingEditScreen.kt`<br>`app:ui/bookings/BookingDetailScreen.kt`<br>`app:ui/calendar/CalendarScreen.kt`<br>`app:data/repository/BookingRepository.kt` | `bookings` | «bookings (events)» |
| **భోజన సెషన్లు (ఉదయం / మధ్యాహ్నం / రాత్రి)**<br>Meal sessions | `fn:events/sessions.ts`<br>`fn:events/sessionSync.ts` `syncBookingSessions()`<br>`fn:billing/invoiceLines.ts` | — | `web:modules/bookings/SessionsEditor.tsx` (inside `/bookings/new`) | `app:ui/bookings/SessionsEditor.kt`<br>`app:ui/bookings/EventOps.kt` (SessionsCard) | `bookings` (field sessions) | «bookings (events)» |
| **Event రోజు: అతిథుల లెక్క, extras, event ముగించడం**<br>Event day: guest count, extras, close / reopen | `fn:events/eventLive.ts` `logGuestCount()` `addEventExtra()` `approveEventExtra()`<br>`fn:events/closeEvent.ts` `closeEvent()` `reopenEvent()` | `fn:calc/round7.ts` §14 (extra plates), §18 (close blockers) | `web:modules/bookings/EventLiveCards.tsx` (on `/bookings/:id`) | `app:ui/bookings/EventOps.kt` | `guestLog` `eventExtras` | «bookings (events)» |
| **Service timeline (వంట మొదలు → వడ్డన)**<br>Service timeline | `fn:timeline/getServiceTimeline.ts` `getServiceTimeline()` | `fn:calc/timeline.ts` §12 | `web:modules/bookings/BookingDetailCards.tsx`<br>`web:util/timeline.ts` | `app:ui/bookings/BookingTimelineCard.kt`<br>`app:util/ServiceTimeline.kt` | `bookings` | «bookings (events)» |
| **కొటేషన్లు + versions**<br>Quotations + versions | `fn:menus/saveQuotation.ts` `saveQuotation()`<br>`fn:menus/quotationVersions.ts`<br>`fn:menus/quotationUpdate.ts`<br>`fn:menus/quotationTriggers.ts` `quotationAcceptedVersion()` | `fn:calc/menus.ts` §11, `fn:calc/gst.ts` §1 | `web:modules/quotations/QuotationsPage.tsx` `/quotations` `/quotations/:id` | `app:ui/quotations/QuotationsListScreen.kt`<br>`app:ui/quotations/QuotationDetailScreen.kt`<br>`app:ui/quotations/QuotationGenerateScreen.kt`<br>`app:ui/quotations/QuotationVersionsCard.kt` | `quotations` (+ sub `versions`) | «quotations, invoices, payments» |
| **Quote builder (మెనూ ఎంచుకుని ధర)**<br>Quote builder | `fn:menus/quoteMenu.ts` `quoteMenu()`<br>`fn:menus/fullQuote.ts` | `fn:calc/menus.ts` §11, `fn:calc/round10.ts` §21 | `web:modules/quotes/QuoteBuilderPage.tsx` `/quotes/new` | `app:ui/quotebuilder/QuoteBuilderScreen.kt` | `quotations` | «quotations, invoices, payments» |
| **Invoices + payments + refunds**<br>Invoices, payments, refunds | `fn:billing/generateInvoiceFromBooking.ts` `generateInvoiceFromBooking()`<br>`fn:billing/recordPayment.ts` `recordPayment()` `refundOrAdjust()`<br>`fn:billing/overrideInvoiceTotal.ts` `overrideInvoiceTotal()`<br>`fn:billing/invoiceLines.ts`<br>`fn:shared/docNumber.ts` `fn:shared/counters.ts`<br>`fn:integrations/upi.ts` | `fn:calc/gst.ts` §1, `fn:calc/payments.ts` §2, `fn:calc/round7.ts` §14 | `web:modules/invoices/InvoicesPage.tsx` `/invoices` `/invoices/:id`<br>`web:components/TaxDocumentView.tsx`<br>`web:components/UpiQr.tsx` | `app:ui/billing/InvoicesListScreen.kt`<br>`app:ui/billing/InvoiceDetailScreen.kt`<br>`app:ui/billing/InvoiceGenerateScreen.kt`<br>`app:util/PdfGenerator.kt` `app:util/QrCode.kt` | `invoices` `payments` `counters` | «quotations, invoices, payments» |
| **ఆర్డర్ రద్దు / మళ్ళీ తెరవడం / వాయిదా**<br>Cancellation, restore, postpone | `fn:events/cancelBooking.ts` `cancelBooking()` `restoreBooking()` `postponeBooking()` `getCancellationReport()`<br>`fn:events/cancelBookingRules.ts`<br>`fn:records/cancelRecord.ts` `cancelRecord()` (other records)<br>`fn:records/cancelRules.ts` | `fn:calc/cancellation.ts` §19 | `web:modules/bookings/BookingCancel.tsx`<br>`web:modules/bookings/bookingCancelHelpers.ts`<br>`web:modules/bookings/CancellationsPage.tsx` `/cancellations`<br>`web:components/CancelControls.tsx` `web:data/cancel.ts` | `app:ui/bookings/BookingCancel.kt`<br>`app:ui/owner/OwnerReports.kt` (CancellationsCard) | `bookings` `invoices` `payments` | «bookings (events)» |
| **మెనూలు, packages, పిల్లల / special భోజనాలు**<br>Menus, packages, kids / special meals | `fn:menus/menuPackage.ts`<br>`fn:menus/fullQuote.ts`<br>`fn:menus/suggestPrice.ts` `suggestPackagePrice()`<br>`fn:kitchen/menuDishes.ts` | `fn:calc/menus.ts` §11, `fn:calc/round10.ts` §21 §24, `fn:calc/pricing.ts` §3 | `web:modules/menu/MenuListPage.tsx` `/menu`<br>`web:modules/menu/MenuFormPage.tsx` `/menu/new` `/menu/:id/edit`<br>`web:modules/menu/categoryLabel.ts` (category names on screen)<br>`web:modules/menus/MenuPackagesPage.tsx` `/menus/packages`<br>`web:modules/menus/PackagePricePanel.tsx`<br>`web:modules/bookings/KidsSpecialEditor.tsx` | `app:ui/menu/MenuListScreen.kt`<br>`app:ui/menu/MenuItemEditScreen.kt`<br>`app:ui/menupackages/MenuPackagesScreen.kt`<br>`app:ui/owner/Round10Views.kt` (SuggestedPriceCard) | `menuItems` `menuPackages` | «menus (admin writes; archive via cancelRecord)» |
| **వంట plan / వంటకాలు నేర్చుకోవడం / event plan / day plan**<br>Cooking plan, learning recipes, event plan, day plan | `fn:kitchen/planning.ts` `cookingPlan()` `groceryList()`<br>`fn:kitchen/saveCookingPlan.ts` `saveCookingPlan()`<br>`fn:kitchen/saveCookLog.ts` `saveCookLog()`<br>`fn:kitchen/cookLearning.ts` `fn:kitchen/recipeSummary.ts`<br>`fn:kitchen/eventPlan.ts` `eventPlan()` `dayPlan()` `planOnBookingChange()` `planOnQuotationChange()`<br>`fn:kitchen/planRules.ts` | `fn:calc/cooking.ts` §5 §6, `fn:calc/recipes.ts` §13 (+ §13.5) | `web:modules/kitchen/CookingPage.tsx` `/cooking`<br>`web:modules/kitchen/DayPlanPage.tsx` `/day-plan`<br>`web:modules/kitchen/PlanViews.tsx` `web:modules/kitchen/EventInputs.tsx`<br>`web:modules/bookings/KitchenPlanCards.tsx`<br>`web:modules/dishes/DishesPage.tsx` `/dishes`<br>`web:modules/dishes/DishPage.tsx` `/dishes/new` `/dishes/:id` | `app:ui/kitchen/KitchenScreen.kt`<br>`app:ui/recipes/PlanScreens.kt` (EventPlan, DayPlan)<br>`app:ui/recipes/CookLogScreen.kt`<br>`app:ui/recipes/DishesScreen.kt`<br>`app:ui/bookings/KitchenPlanScreen.kt` | `cookingPlan` `cookLog` `dishes` (+ sub `history`) | «bookings (events)» (cookLog, cookingPlan), «menus (admin writes; archive via cancelRecord)» (dishes) |
| **సరుకులు, stock, కొనుగోళ్లు (unit మార్పు)**<br>Groceries, stock, purchases (unit conversion) | `fn:inventory/adjustStock.ts` `adjustStock()`<br>`fn:stock/purchaseStock.ts` `stockOnPurchase()`<br>`fn:stock/purchaseStockRules.ts`<br>`fn:stock/eventStock.ts` `stockOnBookingCompleted()` `applyEventStock()` `reverseEventStock()`<br>`fn:shared/units.ts`<br>`fn:kitchen/groceryMaster.ts`<br>`fn:stats/triggers.ts` `statsOnPurchase()` | `fn:calc/stock.ts` §26, `fn:calc/cooking.ts` §6 | `web:modules/inventory/InventoryPage.tsx` `/inventory`<br>`web:modules/purchases/PurchasesPage.tsx` `/purchases`<br>`web:modules/purchases/PurchaseFormPage.tsx` `/purchases/new` `/purchases/:id/edit`<br>`web:modules/grocery/GroceryLinksPage.tsx` `/grocery-items`<br>`web:modules/kitchen/GroceryPage.tsx` `/grocery` | `app:ui/inventory/InventoryListScreen.kt`<br>`app:ui/inventory/StockAdjustmentDialog.kt`<br>`app:ui/purchases/PurchasesHomeScreen.kt`<br>`app:ui/purchases/PurchaseEditScreen.kt`<br>`app:ui/purchases/CatalogPickerScreen.kt`<br>`app:ui/bookings/EventStockCard.kt` | `inventory` (+ sub `movements`) `groceryItems` `purchases` `otherPurchaseItems` | «inventory, vendors, purchases, expenses, outside orders» |
| **Vendors, vendor బాకీలు, ధరల పోలిక**<br>Vendors, vendor dues, price comparison | `fn:vendors/vendorPayments.ts` `recordVendorPayment()` `getVendorDues()` `billStatusOnPurchase()` `billStatusOnExpense()` `migratePaymentStatuses()`<br>`fn:vendors/billRules.ts`<br>`fn:vendors/purchaseRates.ts` `vendorPriceComparison()`<br>`fn:vendors/rateRules.ts` | `fn:calc/round7.ts` §17, `fn:calc/round10.ts` §25 | `web:modules/vendors/VendorsPage.tsx` `/vendors`<br>`web:modules/vendors/VendorPricesPage.tsx` `/vendor-prices`<br>`web:modules/vendordues/VendorDuesPage.tsx` `/vendor-dues` | `app:ui/vendors/VendorListScreen.kt`<br>`app:ui/vendors/VendorEditScreen.kt`<br>`app:ui/ops/VendorDuesScreen.kt`<br>`app:ui/owner/Round10Views.kt` (VendorRatesScreen) | `vendors` `vendorPayments` | «inventory, vendors, purchases, expenses, outside orders» |
| **ఖర్చులు + ఖర్చు ఎవరికి (cost target)**<br>Expenses & cost targets | `fn:stats/triggers.ts` `statsOnExpense()`<br>`fn:vendors/vendorPayments.ts` `billStatusOnExpense()`<br>`fn:shared/costTarget.ts` | `fn:calc/round7.ts` §17 | `web:modules/expenses/ExpensesPage.tsx` `/expenses`<br>`web:modules/expenses/ExpenseFormPage.tsx` `/expenses/new` `/expenses/:id/edit`<br>`web:modules/expenses/sections.ts`<br>`web:components/CostTargetPicker.tsx` `web:data/costTarget.ts` | `app:ui/expenses/ExpensesHomeScreen.kt`<br>`app:ui/expenses/ExpenseEntryScreen.kt`<br>`app:ui/expenses/ExpenseHistoryScreen.kt`<br>`app:ui/expenses/PersonWiseReportScreen.kt` | `expenses` | «inventory, vendors, purchases, expenses, outside orders» |
| **బయటి ఆర్డర్లు**<br>Outside orders | `fn:outside/outsideOrders.ts` `saveOutsideOrder()` `recordOutsideDelivery()`<br>`fn:stats/triggers.ts` `statsOnOutsideOrder()` | `fn:calc/round7.ts` §15 | `web:modules/outside/OutsideOrdersPage.tsx` `/outside-orders` | `app:ui/ops/OutsideOrdersScreen.kt` | `outsideOrders` | «inventory, vendors, purchases, expenses, outside orders» |
| **పాత్రలు / equipment, వాహనాలు**<br>Equipment & vehicles | `fn:equipment/equipmentSync.ts` `syncMoveStaff()` `syncBookingStaffToMoves()`<br>`fn:stats/triggers.ts` `costOnVehicleTrip()` `costOnEquipmentMove()`<br>`fn:agents/helpers.ts` (vehicle paper expiry) | `fn:calc/round7.ts` §16 | `web:modules/assets/EquipmentPage.tsx` `/equipment`<br>`web:modules/assets/VehiclesPage.tsx` `/vehicles`<br>`web:data/assetsRepository.ts` | `app:ui/ops/EquipmentScreen.kt`<br>`app:ui/ops/VehiclesScreen.kt`<br>`app:ui/bookings/EventOps.kt` (VesselsOutCard) | `equipment` `equipmentMoves` `vehicles` `vehicleTrips` | «vehicles, equipment (R7-4)» |
| **సిబ్బంది, హాజరు, shifts, పనులు, ratings, advances, జీతాలు**<br>Staff, attendance, shifts, tasks, ratings, advances, payroll | `fn:staff/attendance.ts` `markAttendance()` `monthPayroll()` `overridePayrollRow()`<br>`fn:staff/advances.ts` `addStaffAdvance()` `listStaffAdvances()` `finalizePayroll()`<br>`fn:staff/advanceRules.ts`<br>`fn:staff/shifts.ts` `saveShift()` `completeTask()` `rateStaff()` `ratingOnWrite()`<br>`fn:staff/staffLink.ts` `syncStaffLink()` `fn:staff/linkLogic.ts`<br>`fn:stats/triggers.ts` `statsOnAttendance()` | `fn:calc/wages.ts` §7, `fn:calc/ops.ts` §7b, `fn:calc/round10.ts` §20 §25 | `web:modules/staff/StaffPage.tsx` `/staff`<br>`web:modules/staff/StaffDetailDialog.tsx` (advances)<br>`web:modules/staff/TasksPage.tsx` `/tasks`<br>`web:modules/payroll/PayrollPage.tsx` `/payroll`<br>`web:modules/bookings/ShiftsCard.tsx` (shifts, ratings)<br>`web:data/staffWorkRepository.ts` | `app:ui/staff/StaffListScreen.kt`<br>`app:ui/staff/StaffEditScreen.kt`<br>`app:ui/attendance/AttendanceScreens.kt` (attendance + payroll)<br>`app:ui/staffops/StaffWork.kt` (shifts, tasks, ratings, advances) | `staff` `attendance` `shifts` `staffRatings` `staffAdvances` `payroll` `tasks` | «staff, attendance, tasks» |
| **కస్టమర్లు, leads, statement, WhatsApp అనుమతి**<br>Customers, leads, statement, WhatsApp opt-in | `fn:customers/customerStatement.ts` `customerStatement()`<br>`fn:customers/statementRules.ts`<br>`fn:integrations/optIn.ts` `optInOnCustomer()` `optInOnLead()`<br>`fn:integrations/optInRules.ts` | `fn:calc/round10.ts` §23 | `web:modules/customers/CustomersListPage.tsx` `/customers`<br>`web:modules/customers/CustomerFormPage.tsx` `/customers/new` `/customers/:id/edit`<br>`web:modules/customers/CustomerStatementPage.tsx` `/customers/:id/statement`<br>`web:modules/leads/LeadsPage.tsx` `/leads` | `app:ui/customers/CustomersListScreen.kt`<br>`app:ui/customers/CustomerDetailScreen.kt`<br>`app:ui/customers/CustomerEditScreen.kt`<br>`app:ui/leads/LeadsScreens.kt`<br>`app:data/model/LeadScore.kt`<br>`app:ui/owner/Round10Views.kt` (CustomerStatementButton) | `customers` `leads` `referrals` | «sales: customers, leads, complaints» |
| **ఫిర్యాదులు**<br>Complaints | — (direct Firestore writes) | — | `web:modules/complaints/ComplaintsPage.tsx` `/complaints`<br>`web:data/complaintsRepository.ts` | `app:ui/ops/ComplaintsScreen.kt` | `complaints` | «sales: customers, leads, complaints» |
| **లంచ్ బాక్సులు**<br>Lunch boxes | `fn:lunchBoxes/lunchBoxes.ts` `saveLunchBoxOrder()` `markLunchBoxDelivered()` `invoiceLunchBoxes()`<br>`fn:lunchBoxes/lunchBoxRules.ts` | `fn:calc/round10.ts` §22 | `web:modules/lunchboxes/LunchBoxesPage.tsx` `/lunch-boxes`<br>`web:data/lunchBoxRepository.ts` | `app:ui/owner/Round10Views.kt` (LunchBoxesScreen) | `lunchBoxOrders` | «lunch boxes (R10-12), content plan (R10-13)» |
| **Content plan (social media posts)**<br>Content plan | — (direct Firestore writes) | — | `web:modules/marketing/ContentPlanPage.tsx` `/content-plan`<br>`web:data/contentPlanRepository.ts` | `app:ui/owner/ContentPlanScreen.kt` | `contentPlan` | «lunch boxes (R10-12), content plan (R10-13)» |
| **Ads ఖర్చు (digital marketing)**<br>Ad spend | `fn:stats/triggers.ts` `statsOnAdSpend()` | `fn:calc/health.ts` §8 | `web:modules/ads/AdsPage.tsx` `/ads`<br>`web:data/adSpendRepository.ts` | — (web only) | `adSpend` | «owner-only money & settings» |
| **లక్ష్యాలు + Target Board**<br>Targets & Target Board | `fn:targets/callables.ts` `setYearTarget()` `getTargetBoard()`<br>`fn:targets/plan.ts` `fn:targets/months.ts` `fn:targets/boardView.ts` | `fn:calc/targets.ts` §4, `fn:calc/ops.ts` §4b, `fn:calc/health.ts` §8 | `web:modules/targets/TargetsPage.tsx` `/targets`<br>`web:modules/targets/TargetBoardPage.tsx` `/targets/board`<br>`web:data/targetsRepository.ts` | `app:ui/targets/TargetBoardScreen.kt` | `targets` `monthlyStats` | «owner-only money & settings» |
| **లాభ నష్టాలు, గణాంకాలు, reports**<br>P&L, stats, reports | `fn:targets/callables.ts` `getPnl()`<br>`fn:targets/leaks.ts` (where money is lost)<br>`fn:stats/aggregate.ts` `fn:stats/recompute.ts` `fn:stats/affected.ts`<br>`fn:stats/bookingCost.ts` `fn:stats/bookingCostCalc.ts`<br>`fn:stats/triggers.ts` `statsOnInvoice()` `statsOnPayment()` | `fn:calc/periods.ts` §9, `fn:calc/health.ts` §8 | `web:modules/pnl/PnlPage.tsx` `/pnl`<br>`web:modules/reports/ReportsPage.tsx` `/reports`<br>`web:modules/dashboard/DashboardPage.tsx` `/dashboard` | `app:ui/owner/OwnerReports.kt`<br>`app:ui/reports/ReportsScreen.kt`<br>`app:ui/reports/CashReportScreen.kt`<br>`app:ui/dashboard/DashboardScreen.kt`<br>`app:ui/purchases/ItemPurchaseReportScreen.kt` | `dailyStats` `monthlyStats` | «owner-only money & settings» |
| **Agents (రోజువారీ సహాయకులు) + WhatsApp outbox**<br>Agents & WhatsApp outbox | `fn:agents/schedules.ts` `agentMorningSummary()` `agentDuesCollector()` `agentIntegrityCheck()` `agentBackup()` (+ 9 more)<br>`fn:agents/jobs/summary.ts` `fn:agents/jobs/business.ts` `fn:agents/jobs/customers.ts` `fn:agents/jobs/kitchen.ts` `fn:agents/jobs/common.ts`<br>`fn:agents/callables.ts` `setAgentEnabled()` `approveMessage()` `runAgentNow()`<br>`fn:agents/agentRun.ts` `fn:agents/registry.ts`<br>`fn:integrations/whatsapp.ts` `sendQueuedMessage()` `flushOutbox()`<br>`fn:integrations/whatsappMessages.ts` `fn:shared/outbox.ts` `fn:shared/messagePolicy.ts` `fn:shared/templates.ts` | `fn:calc/checks.ts` §10 (integrity) | `web:modules/agents/AgentsPage.tsx` `/agents`<br>`web:data/agentsRepository.ts` | — (web only) | `agentSettings` `agentRuns` `integrityReports` `messagesOutbox` | «agents & server bookkeeping» |
| **Notifications (సూచనలు)**<br>Notifications | written by `fn:stock/purchaseStock.ts`, `fn:kitchen/eventPlan.ts` | — | `web:modules/notifications/NotificationsPage.tsx` `/notifications`<br>`web:data/notificationsRepository.ts` | `app:ui/recipes/NotificationsScreen.kt`<br>`app:util/NotificationHelper.kt`<br>`app:util/BookingReminderWorker.kt` | `notifications` | «agents & server bookkeeping» |
| **మార్పుల చరిత్ర / audit**<br>History / audit | `fn:history/getHistory.ts` `getHistory()`<br>`fn:history/historyTriggers.ts` `historyBookings()` … `historyAttendance()` (14 triggers)<br>`fn:history/historyQuery.ts` `fn:shared/historyDiff.ts` `fn:shared/auditLog.ts` | — | `web:modules/history/HistoryPage.tsx` `/history`<br>`web:components/HistoryList.tsx`<br>`web:i18n/historyText.ts` | `app:ui/history/HistoryScreens.kt`<br>`app:ui/history/HistoryText.kt` | `auditLog` | «agents & server bookkeeping» |
| **Settings (GST, bank, UPI, షరతులు, జీతం నియమాలు)**<br>Settings | `fn:settings/saveBusinessSettings.ts` `saveBusinessSettings()`<br>`fn:settings/settingsPatch.ts`<br>`fn:shared/settings.ts` `fn:shared/settingsModel.ts` (defaults) | — | `web:modules/settings/SettingsPage.tsx` `/settings`<br>`web:data/settingsRepository.ts` | `app:ui/settings/SettingsScreen.kt`<br>`app:ui/setup/SetupWizardScreen.kt` (first-time setup) | `settings` | «owner-only money & settings» |
| **Excel / CSV నుండి data దిగుమతి**<br>Import | `fn:import/importRows.ts` `importRows()`<br>`fn:import/normalizeRow.ts` | — | `web:modules/settings/ImportPage.tsx` `/settings/import`<br>`web:util/sheet.ts` `web:util/csv.ts` | `app:ui/setup/SetupWizardViewModel.kt`<br>`app:util/SheetReader.kt` | `customers` `menuItems` (and others, by kind) | per collection |
| **Login, పాత్రలు (admin / manager / staff), users**<br>Auth & roles | `fn:auth/authContext.ts`<br>`fn:shared/callable.ts` (role lists per function)<br>`fn:shared/branch.ts` | — | `web:auth/AuthProvider.tsx` `web:auth/LoginPage.tsx` `web:auth/PendingApproval.tsx` `web:auth/roles.ts`<br>`web:modules/users/UsersPage.tsx` `/users`<br>`web:routes/AppRouter.tsx` (page role limits) | `app:ui/auth/LoginScreen.kt`<br>`app:ui/users/UserManagementScreen.kt`<br>`app:session/SessionManager.kt`<br>`app:ui/components/RoleGate.kt` | `users` | «users» (+ identity helpers at the top of `firestore.rules`) |
| **శాఖలు (branches)**<br>Branches | `fn:shared/branch.ts` | — | `web:session/BranchContext.tsx`<br>`web:data/branchRepository.ts` | `app:ui/branches/BranchListScreen.kt`<br>`app:ui/branches/BranchEditScreen.kt`<br>`app:session/BranchManager.kt` | `branches` | «branches» |
| **ఫోటోలు / gallery / bills upload**<br>Photos, gallery, uploads | — | — | `web:modules/gallery/GalleryPage.tsx` `/gallery`<br>`web:components/PhotoUpload.tsx` `web:data/uploads.ts` | `app:ui/components/PhotoUploadButton.kt`<br>`app:util/ImageCompress.kt` | Cloud Storage | `storage.rules` |
| **Auto / manual లెక్క (ప్రతి లెక్కకు)**<br>Auto / manual calculation mode | `fn:shared/override.ts` `fn:shared/overridePolicy.ts` | — | `web:components/CalcModeChip.tsx` `web:data/calcMode.ts` | `app:ui/components/CalcModeChip.kt`<br>`app:data/model/CalcInfo.kt` | (field on each record) | per collection |
| **Test mode (మీ Mac లో మాత్రమే)**<br>Test mode | `functions/` runs inside the local emulator | — | `web/.env.emulator` (`npm run dev:emulator`) | — | local emulator only | — |

Test mode files: `CRM Test Mode.command`, `tools/seed-emulator.cjs` (demo data), `data/seed/menus.json`, `data/seed/grocery-items.json`, `firebase.json` (emulator ports), `tools/rules-test.mjs` (rules tests).

---

## 3. ఎలా చేయాలి
## 3. How to…

### Test mode నడపడం
### Run test mode

1. Finder లో project folder తెరిచి `CRM Test Mode.command` మీద double-click చేయండి.
2. ఒక Terminal window తెరుచుకుంటుంది; 1–2 నిమిషాల్లో browser లో CRM (http://localhost:5173) వస్తుంది. Login వివరాలు ఆ Terminal window లోనే కనిపిస్తాయి.
3. ఇది మీ Mac లో మాత్రమే — internet లోని నిజమైన data కి, ఖర్చుకి సంబంధం లేదు.
4. ఆపాలంటే ఆ Terminal window మూసేయండి. మీరు పెట్టిన test data .test-data/ ఫోల్డర్ లో save అవుతుంది, మళ్ళీ తెరిస్తే అదే వస్తుంది.

### పరీక్షలు (tests) నడపడం
### Run tests

- Server పరీక్షలు: Terminal లో `functions/` ఫోల్డర్ కి వెళ్ళి `npm test` — చివర "# fail 0" రావాలి.
- Server build: అదే ఫోల్డర్ లో `npm run build`.
- Database rules పరీక్షలు: `tools/rules-test.mjs` — test mode (emulator) నడుస్తున్నప్పుడు మాత్రమే; వివరాలు `docs/security-review.md` లో.
- ఈ code map సరిగ్గా ఉందా: project folder లో `python3 tools/check-code-map.py`.

### Web admin build చేయడం
### Build the web admin

- `web/` ఫోల్డర్ లో `npm run build` — తయారైన website `web/dist/` లో వస్తుంది.
- కోడ్ శుభ్రత check: `npm run lint` — errors 0 ఉండాలి.

### Android APK తయారు చేయడం
### Build the Android APK

- Project folder లో `./gradlew assembleDebug` — test APK `app/build/outputs/apk/debug/` లో వస్తుంది.
- Staff phones కి ఇచ్చే sign చేసిన (release) APK: `DEPLOY-STEPS.md` లో "భాగం 4" చూడండి (`keystore/` అవసరం).

### Live చేయడం (deploy)
### Deploy

- అన్ని steps తెలుగులో `DEPLOY-STEPS.md` లో ఉన్నాయి (server + rules + website ఒకేసారి).

### ధరలు, షరతులు, settings ఎక్కడ మార్చాలి
### Where to change prices, terms and settings

కోడ్ మార్చనవసరం లేదు — ఇవన్నీ app లోనే (owner login తో) మారుతాయి:

| ఏమి మార్చాలి | ఎక్కడ (web) | ఎక్కడ (phone) |
|---|---|---|
| Package ధరలు, package లో వంటకాలు / Package prices | `/menus/packages` | `app:ui/menupackages/MenuPackagesScreen.kt` |
| ఒక్కో item ధర / Menu item prices | `/menu` | `app:ui/menu/MenuListScreen.kt` |
| GST, bank, UPI, quotation / invoice షరతులు, జీతం నియమాలు, kitchen అద్దె / GST, bank, UPI, terms, pay rules, kitchen rent | `/settings` | `app:ui/settings/SettingsScreen.kt` |
| సంవత్సర లక్ష్యం / Year target | `/targets` | `app:ui/targets/TargetBoardScreen.kt` |
| Agents on / off | `/agents` | — |

మొదటిసారి (ఏమీ save చేయకముందు) వచ్చే default విలువలు కోడ్ లో ఇక్కడ ఉన్నాయి / Built-in defaults (used only until the owner saves settings): `fn:shared/settingsModel.ts` (server), `web:data/settingsRepository.ts` (web), default Telugu terms in `web:modules/settings/SettingsPage.tsx`. మొదటి menus: `data/seed/menus.json`.

---

## 4. Docs సూచిక
## 4. Docs index

| File | తెలుగు | English |
|---|---|---|
| `docs/CODE-MAP.md` | ఈ ఫైల్ — ఏ కోడ్ ఎక్కడ | This file — where every piece of code lives |
| `docs/requirements-checklist.md` | ఓనర్ చెప్పిన అన్ని points, ✅ తో | Master checklist of every owner requirement |
| `docs/calc-spec.md` | ప్రతి లెక్క సూత్రం (ఒకే నిజం) | Every formula — the single source of truth (§ numbers used above) |
| `docs/money-calc-spec.md` | పాత డబ్బు లెక్కల spec — ఇప్పుడు calc-spec చూడండి | Older money spec, superseded by calc-spec.md |
| `docs/data-model.md` | Database లో ఏ data ఎక్కడ, ఏ రూపంలో | Firestore data model, roles, who computes what |
| `docs/api-contract.md` | Phone, web, server మధ్య ఒప్పందం | API contract: every callable's input / output |
| `docs/backend-notes.md` | Server (functions) వివరాలు | Backend (Cloud Functions) notes |
| `docs/web-notes.md` | Web admin పేజీల వివరాలు | Web admin notes |
| `docs/android-notes.md` | Phone app వివరాలు | Android app notes |
| `docs/design-system.md` | రంగులు, అక్షరాలు, animations | Design system (colours, type, motion) |
| `docs/security-review.md` | భద్రతా పరిశీలన + rules పరీక్షలు | Security review of Firestore / Storage rules, rules-test status |
| `docs/spec-gap-analysis.md` | Spec PDFs తో పోలిక — ఏమి మిగిలింది | Gap analysis: frozen spec PDFs vs the built CRM |
| `DEPLOY-STEPS.md` | Live చేయడానికి steps | Go-live steps (Telugu) |

## Module 1a — ఎంక్వైరీల పైప్‌లైన్ + ఆటో అప్పగింత / Lead pipeline + auto-assign (18 Nov 2026)
| ఏమిటి / What | ఎక్కడ / Where |
|---|---|
| దశల జాబితా, ఎవరికి అప్పగించాలో నియమాలు (pure) / stages + who-gets-it rules | `functions/src/leads/assignRules.ts` |
| కొత్త lead వస్తే ఆటో అప్పగింత, చేతితో అప్పగింత, వ్యక్తుల జాబితా / trigger + callables | `functions/src/leads/assignLead.ts` (exports in `functions/src/index.ts`) |
| Settings లో leadAssign / settings field | `functions/src/shared/settingsModel.ts`, `functions/src/settings/settingsPatch.ts` |
| పరీక్షలు / tests | `functions/test/module1a.test.ts`; rules: `tools/rules-test.mjs` (cases named M1a) |
| భద్రతా నియమాలు / rules | `firestore.rules` (function leadValuesOk) |
| 15 నిమిషాల నియమం (pure) + ప్రతి 5 నిమిషాలకి కాపలా / first-response rule + watch (Module 1b) | `functions/src/leads/tatRules.ts`, `functions/src/leads/tatWatch.ts`; tests `functions/test/module1b.test.ts` |
| HOT / WARM / COLD నియమం (Module 1c) / score rule | `functions/src/leads/scoreRules.ts` (web copy `web/src/modules/leads/leadScore.ts`); tests `functions/test/module1c.test.ts` |
| ఎంక్వైరీల Excel దిగుమతి / lead import | `functions/src/import/normalizeRow.ts`, `functions/src/import/importRows.ts`, `web/src/modules/settings/ImportPage.tsx` |
| టీమ్ నోట్స్ (Module 1e) / team notes on a lead | `functions/src/leads/commentRules.ts`, `functions/src/leads/leadComments.ts`; tests `functions/test/module1e.test.ts` |
| ఎంక్వైరీల రిపోర్ట్ (Module 1f) / leads report | `functions/src/leads/reportRules.ts`, `functions/src/leads/leadReport.ts`; tests `functions/test/module1f.test.ts`; web `web/src/modules/leads/LeadReportView.tsx` |
| Web: జాబితా + పైప్‌లైన్ బోర్డ్ + "ఎవరు చూసుకోవాలి" / list, board, assignee | `web/src/modules/leads/LeadsPage.tsx` |
| Web: తెలుగు / English పేర్లు / labels | `web/src/modules/leads/leadLabels.ts` |
| Web: ఆటో అప్పగింత ఆన్/ఆఫ్ card (Leads page button + Settings page) | `web/src/modules/leads/LeadAssignCard.tsx` |
| Web data | `web/src/data/leadsRepository.ts`, `web/src/data/functions.ts` (assignLead, leadAssignees), `web/src/data/settingsRepository.ts` |
| Phone: కొత్త దశల పేర్లు మాత్రమే / new stage names only | `app/src/main/java/com/example/suseelacateringcrm/data/model/Lead.kt`, `app/src/main/java/com/example/suseelacateringcrm/ui/leads/LeadsScreens.kt` |
| మార్పుకు ముందు కాపీలు / files before this change | `_snap/2026-11-18_module1a` |

## Module 2a — ప్యాక్ కొలతలు + ఇతర పేర్లు / Item pack sizes + aliases (18 Nov 2026)
| ఏమిటి / What | ఎక్కడ / Where |
|---|---|
| ప్యాక్ మార్పిడి నియమాలు (pure) / per-item unit conversion | `functions/src/shared/itemUnits.ts` |
| Stock వస్తువుకి packs copy / sync to the stock item | `functions/src/kitchen/itemPacks.ts` |
| కొనుగోలు → stock, ధర లో వాడకం / used by purchases | `functions/src/stock/purchaseStockRules.ts`, `functions/src/stock/purchaseStock.ts`, `functions/src/vendors/rateRules.ts` |
| పరీక్షలు / tests | `functions/test/module2a.test.ts` |
| Web: సరుకుల జాబితా form (ప్యాక్ కొలతలు, ఇతర పేర్లు, duplicate హెచ్చరిక) | `web/src/modules/grocery/GroceryLinksPage.tsx`, `web/src/data/groceryRepository.ts` |
| దిగుబడి % (Module 2c) / yield, cleaning loss | `functions/src/kitchen/yieldRules.ts` (used in `functions/src/kitchen/eventPlan.ts`, `functions/src/menus/suggestPrice.ts`); tests `functions/test/module2c.test.ts` |
| బ్యాచ్, గడువు తేదీ, FEFO (Module 2d) / batches, expiry | `functions/src/stock/batchRules.ts`, `functions/src/stock/batches.ts`; web `web/src/modules/inventory/InventoryPage.tsx`, `web/src/modules/inventory/ExpiryAlertCard.tsx`, `web/src/modules/purchases/PurchaseFormPage.tsx`; tests `functions/test/module2d.test.ts` |
| బేస్ తయారీలు, సబ్-రెసిపీ (Module 2e) / sub-recipes | `functions/src/kitchen/subRecipeRules.ts` (used in `functions/src/kitchen/eventPlan.ts`, `functions/src/kitchen/recipeVersionRules.ts`); web `web/src/modules/dishes/DishPage.tsx`, `web/src/modules/bookings/KitchenPlanCards.tsx`; tests `functions/test/module2e.test.ts` |
| ప్యాక్ ఉత్పత్తులు, MRP, లేబుల్ (Module 2f) / packed products | `functions/src/packed/packRules.ts`, `functions/src/packed/packedProducts.ts`; web `web/src/modules/packed/PackedProductsPage.tsx`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/packed/PackedProductsScreen.kt`, `web/src/data/packedRepository.ts`; tests `functions/test/module2f.test.ts`; selling packs (X5): same files (sellPacked, cancelPackedSale), tests `functions/test/pendingX.test.ts` |
| ఖరారైన ఈవెంట్‌కి స్టాక్ రిజర్వ్ (Module 2g) / stock reservation | `functions/src/stock/reservationRules.ts`, `functions/src/stock/reservations.ts` (used in `functions/src/kitchen/eventPlan.ts`); web `web/src/modules/inventory/InventoryPage.tsx`, `web/src/modules/inventory/StockReserveCard.tsx`, `web/src/modules/kitchen/PlanViews.tsx`; tests `functions/test/module2g.test.ts` |
| కొలతల జాబితా, మార్పిడి snapshot, ప్యాక్ చరిత్ర (Module 2h) / UOM master | `functions/src/shared/uomRules.ts` (used in `functions/src/stock/purchaseStockRules.ts`, `functions/src/stock/purchaseStock.ts`, `functions/src/kitchen/itemPacks.ts`); web `web/src/modules/settings/UomCard.tsx`, `web/src/modules/grocery/GroceryLinksPage.tsx`, `web/src/modules/purchases/PurchaseFormPage.tsx`; tests `functions/test/module2h.test.ts` |
| ప్రామాణిక / అంచనా / నిజమైన ఖర్చు (Module 2i) / standard, estimated, actual cost | `functions/src/costs/costRules.ts`, `functions/src/costs/costs.ts`; web `web/src/modules/bookings/CostCompareCard.tsx`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/bookings/CostCompareCard.kt`, `web/src/modules/menus/PackagePricePanel.tsx`; tests `functions/test/module2i.test.ts` |
| ఎంక్వైరీ రిమైండర్, గడువు దాటిన సరుకు, quotation అంచనా (X7–X10) / follow-up reminders, expired stock, quotation estimate | `functions/src/leads/reminderRules.ts`, `functions/src/leads/reminderWatch.ts`, `functions/src/stock/batchRules.ts`, `functions/src/stock/reservations.ts`, `functions/src/costs/costs.ts`; tests `functions/test/pendingX.test.ts` |
| హిందీ భాష (X18) / Hindi language | `web/src/i18n/LanguageContext.tsx`, `web/src/i18n/hi.json`, `web/src/i18n/hi-patterns.json`, `tools/hi/templates.py`, `tools/hi/merge.py`, `tools/extract-i18n.py` |
| రెసిపీ వెర్షన్లు (Module 2b) / recipe versions | `functions/src/kitchen/recipeVersionRules.ts`, `functions/src/kitchen/recipeVersions.ts`; tests `functions/test/module2b.test.ts`; web `web/src/modules/dishes/RecipeVersionsPanel.tsx` |
| మార్పుకు ముందు కాపీలు / files before this change | `_snap/2026-11-18_module2a`, `_snap/2026-11-18_module2b` |
| **కొనుగోలు అభ్యర్థన → ఆర్డర్ (Module 3a)**<br>Purchase request → purchase order | `functions/src/procure/procureRules.ts`<br>`functions/src/procure/procure.ts`<br>`functions/src/procure/grnRules.ts`<br>`functions/src/procure/goodsReceipt.ts`<br>`functions/test/module3b.test.ts`<br>`functions/src/procure/matchRules.ts`<br>`functions/src/procure/vendorBill.ts`<br>`functions/test/module3c.test.ts`<br>`functions/test/module3a.test.ts` | `web/src/modules/procure/ProcurementPage.tsx`<br>`web/src/modules/procure/PoApprovalCard.tsx`<br>`web/src/data/procureRepository.ts`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/procure/ProcurementScreen.kt` |
| **ఖాతా పుస్తకం (Module 4a)**<br>Double-entry ledger rules | `functions/src/ledger/exportRules.ts`, `functions/src/ledger/ledgerRules.ts`<br>`functions/test/module4a.test.ts`<br>`functions/src/ledger/ledgerSources.ts`<br>`functions/src/ledger/ledger.ts`<br>`functions/test/module4b.test.ts`<br>`functions/src/ledger/lockGuard.ts`<br>`functions/test/module4c.test.ts` | `web/src/modules/books/BooksPage.tsx` |
| **17 పాత్రలు, అనుమతులు, బాధ్యతల విభజన (Module 4d)**<br>Roles, permission matrix, separation of duties | `functions/src/roles/permRules.ts`<br>`functions/src/roles/callablePerms.ts`<br>`functions/src/roles/rulesBlock.ts`<br>`functions/src/inventory/adjustRules.ts`<br>`functions/src/inventory/adjustStock.ts`<br>`functions/test/module4h.test.ts`<br>`functions/src/staff/payRules.ts`<br>`functions/src/ledger/reconRules.ts`<br>`functions/src/ledger/closeRules.ts`<br>`functions/src/ledger/overheadRules.ts`<br>`functions/test/module4l.test.ts`<br>`functions/test/module4k.test.ts`<br>`functions/test/module4j.test.ts`<br>`functions/src/staff/salaryPayRules.ts`<br>`functions/src/staff/salaryPay.ts`<br>`functions/test/module4i.test.ts`<br>`functions/src/staff/pay.ts`<br>`functions/test/module4g.test.ts`<br>`tools/gen-role-rules.mjs`<br>`functions/test/module4f.test.ts`<br>`functions/src/shared/callable.ts`<br>`functions/test/module4d.test.ts`<br>`functions/test/module4e.test.ts`<br>`docs/spec/IMP-Part-B-roles-p11-13.txt` | `web/src/data/roles.ts`<br>`web/src/modules/users/UsersPage.tsx`<br>`web/src/modules/procure/SodCard.tsx`<br>`web/src/modules/inventory/StockAdjustRequests.tsx`<br>`web/src/modules/inventory/StockAdjustCard.tsx`<br>`web/src/modules/payroll/SalaryPayPanel.tsx`<br>`web/src/modules/books/BankReconPanel.tsx`<br>`web/src/modules/books/MonthClosePanel.tsx`<br>`web/src/modules/pnl/OverheadSharePanel.tsx`<br>`app/src/main/java/com/example/suseelacateringcrm/data/model/JobRoles.kt`<br>`tools/gen-phone-roles.js` |
| Spec PDFs (owner's frozen packs) | `docs/spec` | — |
| **కంపెనీ → బ్రాండ్ → శాఖ → వంటశాల → స్టోర్ (Module 5a)**<br>Masters: company, brand, branch, kitchen, store | `functions/src/masters/masterRules.ts`<br>`functions/src/masters/masters.ts`<br>`functions/src/dispatch/dispatchRules.ts`<br>`functions/src/dispatch/dispatch.ts`<br>`functions/test/module5f.test.ts`<br>`functions/src/safety/safetyRules.ts`<br>`functions/src/safety/safety.ts`<br>`functions/src/safety/safetyWatch.ts`<br>`functions/test/module5e.test.ts`<br>`functions/src/safety/allergenRules.ts`<br>`functions/src/safety/allergens.ts`<br>`functions/test/module5h.test.ts`<br>`functions/src/stock/batchHold.ts`<br>`functions/test/module5d.test.ts`<br>`functions/src/stock/storeRules.ts`<br>`functions/src/stock/branchTransferRules.ts`<br>`functions/src/stock/storeStock.ts`<br>`functions/test/module5c.test.ts`<br>`functions/src/masters/orgRules.ts`<br>`functions/src/masters/org.ts`<br>`functions/test/module5b.test.ts`<br>`functions/test/module5a.test.ts`<br>`docs/spec/MDF-01-company-brand-branch.txt` | `web/src/modules/masters/MastersPage.tsx`<br>`web/src/modules/inventory/StoreStockDialog.tsx`<br>`web/src/modules/inventory/BatchSafety.tsx`<br>`web/src/modules/safety/FoodSafetyPage.tsx`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/safety/FoodSafetyScreen.kt`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/safety/DispatchScreen.kt`<br>`web/src/modules/safety/AllergenPanel.tsx`<br>`web/src/modules/bookings/useVegOnlyBrand.ts`<br>`web/src/data/foodTags.ts`<br>`web/src/modules/dispatch/DispatchPage.tsx`<br>`web/src/modules/bookings/BookingBrandChip.tsx`<br>`web/src/modules/pnl/BrandReportPanel.tsx` |
| **Module 6a — స్టోర్ ఎంపిక, శాఖల బదిలీ, refund ఆమోదం**<br>GRN store choice, branch transfer, refund approval, veg-only rules | `functions/src/stock/branchTransferRules.ts`<br>`functions/src/billing/refundRequests.ts`<br>`functions/src/billing/refundRequestRules.ts`<br>`functions/test/module6a.test.ts`<br>`web/src/modules/bookings/useVegOnlyBrand.ts`<br>`web/src/modules/payroll/SalaryPayPanel.tsx`<br>`web/src/modules/invoices/InvoicesPage.tsx`<br>`web/src/modules/invoices/useInvoiceBrand.ts`<br>`web/src/modules/masters/MastersPage.tsx`<br>`web/src/modules/inventory/StoreStockDialog.tsx` | — |
| **Online payment link, customer portal, calendar notes (20 Nov 2026)**<br>Razorpay link + webhook, public customer page, festivals/notes | `functions/src/integrations/razorpay.ts`, `functions/src/integrations/razorpayRules.ts`<br>`functions/src/portal/portal.ts`, `functions/src/portal/portalRules.ts` | `web/src/modules/portal/PortalPage.tsx`, `web/src/modules/portal/ShareLinkButtons.tsx`<br>`web/src/modules/marketing/CalendarNotesPage.tsx`, `web/src/data/calendarNotesRepository.ts`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/owner/CalendarNotesScreen.kt`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/owner/MastersScreen.kt`<br>`app/src/main/java/com/example/suseelacateringcrm/ui/owner/MasterForms.kt`<br>`app/src/main/java/com/example/suseelacateringcrm/util/Lang.kt`<br>`tools/hi/phone_extract.py`, `tools/hi/phone_merge.py` |
