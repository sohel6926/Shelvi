# Android notes — batch 1 (Frontend: Mobile)

**Telugu సారాంశం:** ఫోన్ app లో కొత్తగా: మొదటి సెటప్ (5 steps), మెనూలు, కొటేషన్ తయారీ, leads, హాజరు,
వంటగది (వంట లాగ్ / గైడ్ / సరుకులు), లక్ష్యాల బోర్డు, Refresh బటన్, ఆటోమేటిక్/మాన్యువల్ గుర్తు.
డబ్బు లెక్కలు అన్నీ server (Cloud Functions) చేస్తుంది. App ఇంకా ఒక్కసారి కూడా build కాలేదు —
Android Studio లో మొదటి build లో వచ్చే errors సరిచేయాలి.

## Language
`util/Lang.kt`: `L("తెలుగు", "English")` everywhere; `AppLanguage` (SharedPreferences, Telugu default) is
Compose snapshot state, so switching (drawer top, or Settings) recomposes at once. No `values-te/` resources.
Older screens (customers, bookings, purchases, expenses, inventory, reports …) still have English body text;
drawer, titles and every new/changed screen are bilingual.

## Server calls
`data/remote/Functions.kt` — `CrmFunctions` over `FirebaseFunctions.getInstance("asia-south1")`.
Every call returns `Result`; failures are `CallableError` with the server's `details.te/en` (`.text`).
Request/response shapes follow docs/api-contract.md incl. "Decisions" 1–13 and "Manual and automatic mode".

## Behaviour changes
- Invoices: created only via `generateInvoiceFromBooking` (no GST/discount inputs on the phone any more);
  payments via `recordPayment` (amount > 0, ≤ balance, date not in future checked first). Old local GST rule
  (discount after tax) and the client payment transaction are removed.
- "Generate quotation" from a booking opens the quote builder (menu package + `quoteMenu`/`saveQuotation`).
  `QuotationGenerateViewModel.kt` is emptied (can't delete files).
- Invoice/quotation/payment documents are read field-by-field (`fromMap`) and accept both the old Android
  names (`totalAmount`, `cgstAmount` …) and calc names (`total`, `cgst`, `totals{}`); payment `date` may be a
  Timestamp or "YYYY-MM-DD". InvoiceStatus accepts "PartiallyPaid" and "Partially Paid".
- Roles: `MANAGER`. Manager is locked to own branch (BranchManager), sees bookings/quotations/customers/leads/
  menus/invoices/payments/purchases, target board in % only; no reports, users, staff list, payroll, bank details.
  Staff: bookings via `whereArrayContains("assignedStaffIds", users/{uid}.staffId)`; no customers/quotations/
  leads/invoices/users/staff screens; cannot create bookings. `StaffRepository.saveStaff` also writes
  `users/{uid}.staffId` (best effort).
- Bill uploads go to `expenses/{branchId}/…` and `purchases/{branchId}/…`; logo/signature `settings/…`;
  food photos `gallery/…`; menu photos `menus/{packageId}/…` (admin + manager for gallery/menus).
- Refresh: top-bar icon + pull-to-refresh around every screen (AppScaffold). It re-syncs all open listeners from
  the server (Firestore `disableNetwork()` → `enableNetwork()`), runs screen callables registered with
  `OnRefresh {}`, then shows "చివరి update: hh:mm". Offline: Telugu message, cached data stays.
  `getFromServer()` (Source.SERVER) helpers exist for one-off reads.
- Manual/automatic: `CalcModeChip` on quotation total, invoice total, attendance pay (admin), payroll net,
  cooking quantities, month target. "Enter manually" needs a reason (≥ 3 chars); admin always, manager only when
  `settings.managerCanOverride` (default true), staff never.

## Import (setup step 5)
`util/SheetReader.kt` reads .xlsx (first sheet, shared strings, no POI) and .csv. Old .xls is refused with a
message. Header names in Telugu/English are mapped to `name`, `phone`, `address`, `email`, `notes`, `jobRole`,
`dailyWage`, `monthlySalary`, `payType`, `pricePerPlate`, `category`, `nameTe`, `nameEn`; other headers are
passed through unchanged. Sent in chunks of 500 to `importRows`.

## Assumptions to confirm (not in the contract)
- "Switch to automatic" wire format: same callable with `calcMode: "auto"` and no `manual` (+ `reason`).
- `markAttendance` manual pay sent as `manual: { pay, reason }`; `saveQuotation` manual as `manual: { total, reason }`;
  `saveCookingPlan` takes a top-level `reason`; `setYearTarget` manual month = `manualMonths[12]` with only the
  edited month set (others null) + current `yearTarget`.
- Callable results for payroll rows / cooking items / target board may carry `calcMode`, `autoValue`,
  `overriddenBy`, `overrideReason` (target board: `monthTargetCalc{}` or flat) — read if present.
- getTargetBoard `year` field (to build setYearTarget) — falls back to the month string.

## Not done in batch 1
- No compile/run (no Gradle/SDK/network here).
- QR uses ZXing core 3.5.3 (new dependency) from `upiQrPayload`; a "copy UPI link" button is also there.
- `monthlyPayRules` editing UI, refunds (`refundOrAdjust`), Android `adjustStock` callable, kids/special meals.
- `BookingReminderWorker` still queries all bookings (would be denied for staff logins under the new rules).

## Batch 2 (5 Nov 2026)
- Month target by hand: `setYearTarget` gets the FULL `manualMonths[12]` read from `targets/{year}` (Source.SERVER),
  only the edited month changes (null = back to automatic); whole-rupee longs.
- Older screens bilingual: bookings, customers, invoices, quotations, expenses, purchases, inventory, staff, vendors,
  users, reports, cash report, calendar, branches, menu items, dashboard, plus ConfirmDialog / date picker.
  Stored English values (statuses, sections, payment methods, units, filters) are shown through `tr(value)` in
  `util/Lang.kt`; the stored value is unchanged. PDFs stay English.
- Settings (owner): calcModes switches per area, managerCanOverride, monthlyPayRules — saved with `saveBusinessSettings`.
- Invoice detail: owner "Refund" → `refundOrAdjust` (amount > 0, ≤ paid, reason ≥ 3 chars).
- Inventory IN/OUT → `adjustStock` callable (server refuses below zero); result shown above the list.
  `InventoryRepository.adjustStock` keeps its signature (also used by purchases) but now calls the server.
- BookingReminderWorker reads the user profile itself: staff → assignedStaffIds, manager → own branch, admin → all.
- Photos: `util/ImageCompress.kt` (≤ 1600 px, JPEG 80 %, EXIF rotation, ≤ 5 MB) before every upload
  (settings, gallery, menus, bills, receipts).
- Kitchen guide: choosing an event fills guests/type and loads `cookingPlan`, merged with saved
  `bookings/{id}/cookingPlan` manual quantities.

## Batch 3 (5 Nov 2026) — review fixes
- Compile: setValue/getValue imports (SettingsScreen, InventoryListViewModel).
- `util/SafeLaunch.kt`: `launchSafe {}` replaces bare `viewModelScope.launch` in the reviewed view models; failures
  show a Telugu line under the top bar (`AppErrors`) instead of crashing; loading flags are cleared.
- Navigation args: `Uri.encode` in NavRoutes, no second `URLDecoder.decode` (a '%' in a name no longer crashes).
- Session: missing `users/{uid}` → created as pending staff (createInitialUserDoc) → pending screen; read failure →
  `SessionErrorScreen` with Retry / Log out.
- Contract audit: quotations read `quoteInput`; target board reads `monthCalcMode` / `monthAutoValue`; booking form
  has the eventTypeCode dropdown (default wedding, saved); quote builder validity 1–90 and sends `branchId` for
  booking-less quotations.
- Manual mode: when `settings.calcModes.<area> == "manual"` the "Enter manually" button is shown next to the
  chip (quotation total, invoice total before any payment, attendance pay for owner / allowed manager — the manager
  never sees the amount — payroll row, month target).
- Login, pending-approval and session-error screens bilingual.

## Round 6 (5 Nov 2026) — real Gradle build: BUILD SUCCESSFUL
- B: every direct update writes `updatedBy` (util/CurrentUser.kt `currentUid()`), creates write `createdBy`.
  Admin "మార్పుల చరిత్ర" screen (ui/history, `getHistory` with collection/person filters and paging) and a
  "చరిత్ర" section on booking, quotation, invoice and customer detail (admin only).
- A: booking detail Stock card (EventStockCard.kt): stockDeduction lines, short-by warnings, automatic/manual chip;
  apply now / manual quantities + reason (A, M, via applyEventStock), reverse (A, via reverseEventStock).
- C: booking edit has meal type, serving time (TimePicker; default from package deliveryWindow start or meal) and
  travel minutes (default 45); booking detail Timeline card = Kotlin port of calc §12 (util/ServiceTimeline.kt,
  display only; settings.timelineDefaults not read yet — uses the §12 defaults).

## Round 7 (5 Nov 2026) — all ten gaps, real Gradle build: BUILD SUCCESSFUL
- R7-1 `CostTargetPicker` (ui/components/Round7Components.kt): event (+ meal session) or overhead centre; on purchase,
  expense and outside-order forms. `costTarget` always written on create (default overhead "general"); old docs read as
  general / legacy expense.bookingId. Purchase / expense no longer write `paymentStatus` (shown read-only, server-derived).
  Edits keep the original purchase / expense number (was regenerated before).
- R7-2 no `quantityInStock` writes (InventoryRepository.saveItemMetadata), purchase stock-IN loop removed (server trigger).
  Stock dialog needs a reason chip count / damage / return / correction (+ optional note; sent as `reason`, `reasonCode`, `note`).
- R7-3 every delete → `cancelRecord` with a reason (CancelRecordDialog, ≥ 3 letters): purchases, expenses, inventory,
  menu items, bookings (button on booking page), leads (edit form), equipment, vehicles, outside orders. Repo delete
  functions now take a reason and call the callable (otherPurchaseItems keep their delete — rules allow it).
  "రద్దైనవి చూపించు" toggles on purchases, expenses, inventory, menu, bookings, leads, equipment, vehicles, outside orders.
  Booking status pickers no longer offer Cancelled / Closed.
- R7-4 ui/ops/EquipmentScreen (items / issue-return per booking / still out; route `equipment?bookingId=`) and
  VehiclesScreen (master with 30 / 7-day expiry colours, trips). Writes carry branchId, createdBy, updatedBy; moves carry
  bookingId; equipment rent saved as `rentalRate`. Booking page shows "vessels still out" with a link.
- R7-5 sessions editor in booking edit (presets మెహందీ డిన్నర్, పెళ్ళి టిఫిన్ …; date, time, meal, package, guests, travel);
  guests = Σ sessions, date = earliest, estimate per session package. `sessions[]` written only when non-empty (or [] to
  clear). Booking page: per-session timeline (getServiceTimeline with sessionId). Kitchen: session chips fill guests /
  package for cooking plan and grocery list (saved plan stays per booking).
- R7-6 ui/ops/OutsideOrdersScreen: saveOutsideOrder / recordOutsideDelivery / cancel; amountDue shown from the server.
  Expense form shows a hint to use this screen for "Outside Purchase".
- R7-7 booking page "ఇప్పుడు ఎంత మంది" (logGuestCount) and "+ అదనపు ఐటమ్" (addEventExtra) for anyone who can open the
  booking; extras listed from bookings/{id}/eventExtras with approve / reject (approveEventExtra) for A / M.
- R7-8 ui/ops/VendorDuesScreen (owner): getVendorDues, expand bills, pay dialog → recordVendorPayment with allocations
  oldest-first (display only; server derives paid / balance / paymentStatus).
- R7-9 CloseEventCard (owner, booking Completed): vendorBillsEntered confirm, optional override reason for customer
  balance; blockers from the error's `details.blockers` listed in Telugu; closed snapshot + reopen with reason.
  Edit form / status update locked while `closed` exists.
- R7-10 QuotationVersionsCard on quotation detail (versions subcollection, current / accepted version, viewer) and
  ui/ops/ComplaintsScreen (list by status, add for an event, assign to staff, resolve with Telugu reply template + share).
- Assumptions (callables were not in functions/src/index.ts yet when written): saveOutsideOrder returns `{ id }`;
  getVendorDues returns `{ vendors: [...] }` (or `dues`) with bills `{ collection, id, label, date, amount, paid, balance }`;
  approveEventExtra takes `{ bookingId, extraId, approved, status }`; closeEvent blockers arrive in
  HttpsError details `{ te, en, blockers: [{ te, en }] }`; closed snapshot read from `closed.profit.{income, costs, profit, marginPct}`.
- Checked against the landed callables (functions/src): approveEventExtra sends `approve`; addEventExtra sends
  `customerApprovedBy { name, phone? }`; getVendorDues gives only bill counts, so the pay dialog reads the vendor's open
  purchases / expenses / delivered outside orders (server `balance` / `amountDue`) to build allocations; pay methods
  Cash | UPI | BankTransfer | Card | Other; closed snapshot read from `closed.{income, costs{food,labour,transport,rentals,other}, profit, marginPct}`.
  Final Round 7 build: BUILD SUCCESSFUL.

## Round 8 (5 Nov 2026) — learning recipes, real Gradle build (JDK 21): BUILD SUCCESSFUL
- data/remote/PlanApi.kt: `eventPlan`, `dayPlan`, `saveCookLogV2` (entries with variantId, ingredients used, sharedWith,
  optional sessionId); models PlanDish (qty, per100, source, matchedEvents, status/statusTe, why[] {te,en}, ingredient maths),
  PlanIngredient (needed / fromDishes / fromPer100 / inStock / toBuy), DayDish (total + perEvent). All numbers from the server.
- ui/recipes: EventPlanScreen (`event-plan/{bookingId}?sessionId=`; session chips, why-lines, qty × perUnit lines,
  ingredients needed / stock / to buy), DayPlanScreen (`day-plan?date=`, A/M; per-dish split per event, combined
  purchase list, WhatsApp share), CookLogScreen (`cook-log/{bookingId}`; rows = the event plan's dishes + add any dish;
  cooked / leftover / ingredients used / shared-with same-day events with guests; split shown as a preview only),
  DishesScreen (category, role, variants "పుల్కా – 2/3", badges "నేర్చుకుంటోంది n/5" / "నేర్చుకున్నది ✓", learned and
  typed recipe; A/M edit role, basePer100 and typedRecipe [{ groceryItemId, perUnit }]), NotificationsScreen
  (notifications where audienceRoles contains my role; tap marks `readBy` and opens the Day plan of that date).
- serviceStyle banthi | buffet | other: picker in the booking form (required on save) and in each meal session;
  written on bookings and sessions[]. Booking page: "వంట plan" / "వంట లాగ్" buttons and a warning if no style.
- Drawer: Day plan (A/M), Dishes, Kitchen notifications (A/M). Old Kitchen screen (quick guide / grocery / v1 cook log) kept.
- Follow-ups: vendor pay dialog now picks bills exactly like the server (open paymentStatus purchases / expenses, delivered
  outside orders; key = vendorId else name:trim+lowercase of vendorNameSnapshot||vendorName / vendorName||personName /
  vendorName). Dish page: startRules editor (style banthi / buffet / any, combination of main roles bread / flavoured-rice /
  rice / tiffin-main or any, size band S/M/L/XL or any, per 100 OR ±% with ±% only when exactly one dimension is set),
  A/M only. Counted combos like "flavoured-rice×2" can't be built with the chips (kept only if the rule isn't edited).
  Build: BUILD SUCCESSFUL.

## Round 9 (5 Nov 2026) — order cancellation, real Gradle build: BUILD SUCCESSFUL
- ui/bookings/BookingCancel.kt + data/remote/Round9Api.kt, names checked against functions/src/events/cancelBooking.ts.
- "ఆర్డర్ రద్దు" dialog → `cancelBooking { bookingId, reasonCode, reason, advance, refundAmount, refundMethod, notifyCustomer }`:
  7 reason chips, note (≥ 3), paid amount (sum of the booking's invoices' amountPaid, display only), refund-all / refund-part /
  keep + amount + method (Cash | UPI | BankTransfer | Card | Other), customer-message toggle, summary before confirm;
  result shows `summary` and `customerMessage` with WhatsApp share. Server refusals (e.g. vessels still out) are shown as-is.
- Booking cancel goes only through cancelBooking: the R7 cancelRecord button and BookingRepository.deleteBooking were removed.
- Red cancelled band (cancel.reasonCode / reason / by.name / at / refund / charge); admin "మళ్ళీ తెరువు" →
  `restoreBooking { bookingId, reason }` (shows the returned note). "తేదీ మార్చు" → `postponeBooking { bookingId, newDate, reason? }`.
- Lists: bookings already hide Cancelled unless the toggle or the "రద్దు" status chip is chosen.

## Round 10 (5 Nov 2026) — real Gradle build: BUILD SUCCESSFUL
- R10-1 Staff page: StaffAdvancesCard (listStaffAdvances, addStaffAdvance with date / recover month / note, cancel an
  untouched Open advance via cancelRecord "staffAdvances"); payslip line "అడ్వాన్స్ కోత" (row `advances`) + `advanceCarry`.
- R10-2 ui/staffops/StaffWork.kt ("షిఫ్ట్‌లు & పనులు"): shifts (staff: own by staffId; A/M: branch, by date, add via
  saveShift), tasks (client create by A/M with assigneeStaffId + assignedStaffIds; done tick via completeTask; today /
  later / done), ratings (rateStaff 1–5 ★ for assigned staff of an event); staff page shows staff.ratings monthly avg.
- R10-3 PdfGenerator: header lines, images, footer. Invoice PDF: business name, issuerLine (server) / legal line,
  address, phone, FSSAI, GSTIN only when tax, UPI QR (server payload, when balance > 0), signature image (settings.signatureUrl),
  bank / UPI id, terms. Quotation PDF: business name, issuer line, phone, FSSAI, validity, terms; tax lines only when GST
  registered and rate > 0.
- R10-4 SuggestedPriceCard on the menu package page (A/M, read only, band colour, ingredient costs, warnings).
- R10-6 VendorRatesScreen (A/M, read only). R10-7 customer page "ఖాతా వివరం": customerStatement with running balance,
  WhatsApp (server whatsappText) and PDF. R10-8 customer form whatsappOptIn tick (server stamps At/By).
- R10-10 OwnerReportsScreen (P&L getPnl by period, cancellations getCancellationReport by month, year target from
  targets/{year}); dashboard cancellations card (owner). History screen already filters by collection / person.
- R10-11 kidsCount + specialMeals[] { type, count, note } on booking and on each session; plans show them tagged.
- R10-12 LunchBoxesScreen: the day's active orders (single date or weekdays between start/end), delivery tick and
  "other count" via markLunchBoxDelivered; orders are set up on the web. R10-13 ContentPlanScreen (contentPlan with
  branchId, createdBy, updatedBy; needs its rule).
- Not done on Android: markAttendance shiftId link, finalizePayroll button, invoiceLunchBoxes (web).
- Follow-ups: attendance rows show that day's shifts as chips (first one picked automatically, "షిఫ్ట్ లేకుండా" to
  unlink); markAttendance sends `shiftId` + the shift's bookingId (also kept in the offline queue). Payroll screen:
  owner "జీతాలు ఖరారు చేయి" → confirm (staff count, total pay, total advance cut, carry) → finalizePayroll { month },
  result "N payslips, M advances". Build: BUILD SUCCESSFUL.
- Fix: leads (incl. lead → customer convert) and customers write only `whatsappOptIn`; the old client `optInAt` stamp is
  gone. Customer and lead forms show the server's whatsappOptInAt / whatsappOptInBy read only ("ఒప్పుకున్నది: date ·
  name", name looked up from users when readable). Build: BUILD SUCCESSFUL.

## Target Board as start screen (Round 11)
- NavHost `startDestination = target-board` for every role; the board composable is no longer role-gated; drawer
  lists "లక్ష్య బోర్డు" first for everyone; drawer / quote-saved `popUpTo` now targets the board (start destination).
- `TargetBoardScreen` shows what `getTargetBoard` returns (server role filter): `percentOnly` → % only; profit card
  only when `showProfit` (owner). New: festive header (green → gold), Refresh button + "చివరి update" time, Dashboard
  button (admin / manager), today's sales card, ahead/behind line, bigger numbers; existing count-up, bar fill and
  GoldBurst celebration kept. The old client-side "manager = % only" override was removed (the owner's
  "అందరికీ ₹ చూపించు" setting now decides on the server).
- `TargetBoard` model: added `todayTarget, todayActual, todayPct, todayHit, aheadOrBehind, aheadStatus, showProfit`.
