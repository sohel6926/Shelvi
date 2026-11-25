# Web admin notes (phase 3 screens)

**Telugu:** web admin లో కొత్త పేజీలు: లక్ష్య బోర్డు, సంవత్సర లక్ష్యం, లాభ నష్టాలు, మెనూ ప్యాకేజీలు, కొత్త కొటేషన్,
వ్యాపార వివరాలు (Setup), Excel దిగుమతి, ఎంక్వైరీలు, ప్రకటనల ఖర్చు, Agents, జీతాలు. అన్ని డబ్బు లెక్కలు server
(Cloud Functions) చేస్తుంది; web కేవలం వివరాలు పంపి, వచ్చిన సమాధానం చూపిస్తుంది. పైన "English / తెలుగు" బటన్‌తో భాష మార్చవచ్చు
(మొదట తెలుగు).

## How the web talks to the server
- `web/src/data/functions.ts` — one typed wrapper per callable in `docs/api-contract.md`, region `asia-south1`.
  Errors become `CallableError { code, te, en }`; screens show `errorText(e, lang)` (= `details.te` in Telugu).
- `web/src/firebase.ts` `functions` is asia-south1 for every callable, adjustStock included (decision 9).
- Language: `web/src/i18n/LanguageContext.tsx` — `useLang()` gives `L(te, en)`, `T({te,en})`; Telugu default,
  saved in localStorage `ui_lang`. All screens are bilingual (stored status words keep English in Firestore, shown in Telugu).
- Roles: `web/src/auth/roles.ts` (`admin | manager | staff`). Manager: no P&L / ₹ targets / ads / payroll / agents /
  settings / users; Target Board in % only; no wages column on Staff; branch-locked like staff.

## Screens and the callables they use
| Route | Roles | Uses |
|---|---|---|
| `/targets/board` | A, M, S (server role filter, Round 11) | `getTargetBoard` (TV mode: full screen, refresh 60 s); `/` opens it |
| `/targets` | A | `setYearTarget`; reads `targets/{year}` |
| `/pnl` | A | `getPnl` |
| `/menus/packages` | all | reads `menuPackages`; admin "load owner's menus" writes the seed (doc id = code) |
| `/quotes/new` | A, M | `quoteMenu` (live preview, debounced), `saveQuotation` |
| `/settings`, `/settings/import` | A | `saveBusinessSettings`, Storage `settings/`, `importRows` (CSV, ≤ 500 rows per call) |
| `/leads` | A, M | direct Firestore writes to `leads` (no money) |
| `/ads` | A | direct writes to `adSpend` (`source: "manual"`) |
| `/agents` | A | `setAgentEnabled`, `runAgentNow`, `approveMessage`; reads `agentSettings`, `agentRuns`, `messagesOutbox` |
| `/payroll` | A | `monthPayroll`, `overridePayrollRow` |
| `/gallery` | A, M | Storage `gallery/` (upload + list) |
| `/invoices/:id` | A, M (refund A) | `recordPayment`, `refundOrAdjust`; printable view with `docTitle`, phone, FSSAI, `upiQrPayload` |

## Behaviour changed in existing screens
- Contract decisions 1–13 applied: menu groups `[{options}]` only, `transportCharged`, `monthlyPayRules
  {deductAbsences, freeLeaves, overtime}`, Target Board `incomePct/profitPct` and `{actual, target|null}`, P&L
  `primeCost {pct, band}` and ISO `range`, `setupProgress.pct`, import rows 1-based.
- Booking form: "Advance paid" is read-only; the web no longer writes `advancePaid` on edit (new bookings start at 0).
  Advances are recorded as payments on the invoice. "Total amount" is labelled "Estimated total" (still saved, it is a
  booking planning number, not an invoice total).
- Invoices / quotations: printable letterhead + Print button; invoices open for managers (branch-scoped by rules).
- Totals summary order now follows calc §1 (subtotal − discount, then tax). Stored values only, nothing recalculated.
- Readers accept both Android names (`description/quantity/unitPrice`, `cgstAmount`, `totalAmount`) and calc names
  (`item/qty/rate`, `cgst`, `total`, or nested `totals`).

## Contract-audit fixes applied (5 Nov)
Agents on unless `enabled === false`; booking form `eventTypeCode` select (default wedding); quotation `validDays` 1–90,
re-save sends no notes / validDays / bookingId; `transportCharged` missing = true; `runAgentNow` timeout 540 s;
`saveCookingPlan` top-level `reason`; `adjustStock` errors via CallableError; imports and booking-less quotations send the
selected `branchId` (staff import and booking-less quotes require one); Target save sends no weights / manualMonths
(server keeps them); manual-mode areas open manual entry by default (quote builder switch on, invoice dialog opens once,
"By hand" buttons on payroll rows and target months); Target Board shows `monthCalcMode` / `monthAutoValue`.

## Manual / automatic mode (web)
- `web/src/data/calcMode.ts` reads `calcMode`, `autoValue`, `overriddenBy {uid,name}`, `overriddenAt`, `overrideReason`;
  `canOverride(role, settings.managerCanOverride)` (admin always, manager when allowed, staff never).
- `web/src/components/CalcModeChip.tsx`: `ఆటోమేటిక్` (green) / `మాన్యువల్ · name` (gold outline) chip with a popover
  (automatic value, difference, reason, "Switch to automatic", "Enter manually") and `ManualValueDialog`
  (value + reason ≥ 3 chars; min = amount already paid for invoices).
- Used on: invoice total (`overrideInvoiceTotal`), quotation total (re-save via `saveQuotation` with `manual`, needs the
  server-stored `quoteInput`, `menuPackageId`, `selections`), quote builder ("I'll enter the total by hand"; on by default
  when `calcModes.quotation == "manual"`), payroll rows (`overridePayrollRow`), month targets (`setYearTarget` `manualMonths`).
- Settings page: one switch per `calcModes` area + `managerCanOverride`, saved through `saveBusinessSettings`.
- **Not on the web yet:** attendance pay (`markAttendance manualPay`) and cooking plans (`saveCookingPlan`) — the web has no
  attendance or kitchen screens; the wrapper `saveCookingPlan` exists in `data/functions.ts`.

## Refresh
`components/RefreshButton.tsx` (icon in `PageHeader` / `ScreenTitle` via `onRefresh`) + `data/refresh.ts`
(`getDocsFromServer` / `getDocFromServer`; live listeners then get the fresh data). Callable screens re-call their callable.
Shows `చివరి update: hh:mm`; offline → Telugu message, cached data stays. Edit forms (customer / booking / menu item) have no
refresh so typed changes are not overwritten.

## Uploads
`data/uploads.ts`, `components/PhotoUpload.tsx`. Admin + manager: bill photos on Expenses / Purchases rows
(`expenses/{branchId}/…`, `purchases/{branchId}/…`, then only `photoUrl` / `billPhotoUrl` is updated on the doc), food photos
page `/gallery` (`gallery/…`), menu photos on each menu card (`menus/{menuId}/…`). Logo / signature: settings page, admin only.

## Assumptions to confirm (open)
1. "Switch to automatic" requests are not named in the contract. The web sends `overrideInvoiceTotal { invoiceId, auto: true }`
   and `overridePayrollRow { month, staffId, auto: true }`; for quotations it re-saves without `manual`; for a month target it
   sends `manualMonths[i] = null`.
2. `saveQuotation.manual = { total, reason }`; month override sends `setYearTarget { year, yearTarget, manualMonths[12], manual: { reason } }`.
3. `monthPayroll` rows are expected to carry `calcMode`, `autoValue`, `overriddenBy`, `overrideReason` when overridden;
   `targets/{year}` is expected to carry `manualMonths[12]` and per month `months[i].autoValue`.
4. Quotation print title is always "Quotation" (decision 4 lists only "Invoice" / "Tax Invoice" for docTitle).
5. UPI: `upiQrPayload` is shown as a link + text; no QR library is installed, so no QR image.
6. Ads page ROAS / cost per booking: display-only copy of calc §8 `adsResult` (nothing saved).
7. No web screen lists payments across invoices, so the collection-group query (decision 11) is not used yet;
   invoice detail reads `invoices/{id}/payments` (date from `day`, else `date`).

## Round 6 (5 Nov afternoon)
- Login and pending-approval pages bilingual (Telugu default, language button on the login card); the coordinator's
  redirect-after-sign-in is kept.
- History: `data/audit.ts` stamps `updatedBy` (+ `updatedAt`) on every direct update and `createdBy`/`updatedBy` on create
  (bookings, customers, leads, adSpend, inventory metadata, menu items, vendors, users, bill photos, grocery links, menu seed).
  `/history` (admin) uses `getHistory` with filters (what / person / from–to day) and "show more" paging; a History card
  (admin only) on booking, quotation, invoice and customer detail. Sentences like `రాము · బుకింగ్ మార్చారు: అతిథులు 250 → 300 · 5 Nov, 2:30 pm`.
- Stock (A): booking detail "Stock" card shows `stockDeduction` (items, auto value when manual, short-by warnings, skipped,
  reversed, manual chip). Admin/manager "take out of stock now" (dialog pre-filled from `groceryList`; changed quantities →
  `items` + reason) via `applyEventStock`; admin "put stock back" via `reverseEventStock`. Settings switch `autoStockDeduct`.
  `/grocery-links` (admin): link each `groceryItems` doc to an inventory item (`inventoryItemId`, unit mismatch warning).
- Timeline (C): booking form has menu package, meal type, serving time (default = package window start, else meal default)
  and travel minutes (45); saved as `packageId`, `mealType`, `serveTime`, `travelMinutes`. Timeline card on booking detail
  and a form preview both call `getServiceTimeline` (no client copy of calc §12).
- Verified with the real build on the Mac: `npm run build` (tsc -b + vite) passes; `npm run lint` 0 errors.

## Grocery pages, grocery master, booking detail (5 Nov)
- `/bookings/:id` booking detail: summary, service timeline, event stock, extras / guest count / costs / close (R7), history (admin).
- `/cooking` (cookingPlan + saveCookingPlan), `/grocery` (groceryList; only items with per100 are counted, the rest are
  listed as "per-100 పెట్టని N సరుకులు"), `/grocery-items` (admin: 374-item master from `src/data/seed/grocery-items.json`,
  module chips, group, search te/en/roman, stock link, "జాబితా load చేయి" merge that never overwrites owner-edited items).
  Both kitchen pages accept `?booking=…&session=…` and send `{ bookingId, sessionId }` with the request.

## Round 7 (5 Nov evening) — web side of R7-1 … R7-10
- **R7-1** `/purchases/new`, `/purchases/:id/edit` (folders = grocery master modules + "వేరే వస్తువు"; lines carry
  `groceryItemId` + the master's `inventoryItemId`) and `/expenses/new`, `/expenses/:id/edit` (Android fields; "Outside
  Purchase" is no longer offered for new entries). `CostTargetPicker` (event + session, or overhead centre) is required;
  writes `costTarget` and mirrors `bookingId` / `sessionId` at the top level. No `paymentStatus` / `paid` / `balance` are
  written. Admin may tick "ఇప్పుడే చెల్లించాం" on a new bill → `recordVendorPayment` for that bill. Lists show "దేనికి".
- **R7-2** Inventory "సరిచేయి" dialog → `adjustStock { reason: count | damage | return | correction, note }`; "count" asks
  for the actual quantity and sends the difference. Admin item dialog: new items start at 0. No purchase stock-in UI.
- **R7-3** `CancelButton` / `CancelDialog` (reason ≥ 3) → `cancelRecord` on purchases, expenses, outside orders, bookings
  (detail), quotations (detail), invoices (detail), payments (`id: "invoiceId/paymentId"`), leads, customers, staff,
  vendors, inventory, menu packages, menu items, grocery items, equipment, vehicles. Managers see the button only for
  bookings / leads / purchases / expenses. Every list has "రద్దైనవి చూపించు"; totals use live rows only. `deleteMenuItem`
  removed. Booking form no longer offers Cancelled / Closed; cancelled or closed bookings open read-only.
- **R7-4** `/equipment` (items own / rented with `qtyOwned`, `rentalRate`; moves issue / return / damaged / lost with
  `qty`, `bookingId`, `sessionId`, `branchId`; outstanding per event; damaged / lost need a note) and `/vehicles`
  (`number, type, kind, driver, driverPhone, ratePerKm`, four expiry dates with red ≤ 7 d / orange ≤ 30 d chips;
  trips `vehicleId, bookingId, date, kmStart, kmEnd, fuelCost, ratePerKm`). A and M.
- **R7-5** Booking form "భోజనాలు (sessions)" editor (presets: ముందు రోజు రాత్రి, టిఫిన్, పెళ్లి భోజనం, రాత్రి భోజనం);
  guests = Σ live sessions, date = earliest (server re-syncs). Saved sessions can be cancelled, not removed. Detail page:
  per-session card with timeline (`getServiceTimeline { bookingId, sessionId }`), cooking, groceries, quote links.
  Quote builder: session chips; one quotation with `sessions: [{ sessionId, menuPackageId, selections, quote }]`.
- **R7-6** `/outside-orders` (A, M): `saveOutsideOrder`, `recordOutsideDelivery` (reason required when returned > 0 or
  accepted < delivered); `amountDue` is shown as the server wrote it.
- **R7-7** Booking detail: live guest count (`logGuestCount`, log list) and extras (`addEventExtra` with
  `customerApprovedBy: { name, phone }`, `approveEventExtra { approve, reason }` for A / M).
- **R7-8** `/vendor-dues` (A): `getVendorDues` totals; bill lists for the pay dialog are read from Firestore (the
  callable returns counts only), oldest first, allocations ≤ balance, the rest stays as advance; methods = PAYMENT_METHODS.
  Button "పాత బిల్లుల స్థితి మార్చు (ఒక్కసారి)" → `migratePaymentStatuses`.
- **R7-9** Booking detail "Event ముగించు" (A, only when Completed): vendor-bills checkbox, blockers from
  `details.blockers` in Telugu, override reason when the customer still owes. Closed banner for all; profit snapshot for
  admin only; "మళ్ళీ తెరువు" with reason → `reopenEvent`.
- **R7-10** Quotation detail: versions card (`quotations/{id}/versions`), "Customer ఒప్పుకున్నది ఇదే" on
  `acceptedVersion`, "మళ్ళీ పంపాలి" chip for a re-saved Draft. `/complaints` (A, M): add / assign (staff list) / resolve
  with resolution + Telugu reply template per category (copy, WhatsApp link). Fields: `customerId, customerName,
  customerPhone, bookingId, category, severity (low|medium|high), description, status, assignedToStaffId,
  assignedToName, resolution, replyText, branchId, resolvedAt`.
- **Settings**: `brandName`, `legalName` (defaults "Suseela Caterings", "Suseela Technologies Private Limited"),
  `legalNameOnDocs` switch (default off) via saveBusinessSettings; documents add "Suseela Caterings (a brand of
  Suseela Technologies Pvt Ltd)" under the business name when on.
- **Test mode (5 Nov)**: purchase with cost target → trigger set Unpaid and stock +5 kg; cancel → hidden + toggle count;
  adjustStock count 20 → 18; closeEvent blockers shown in Telugu, close → snapshot, reopen; guest log 210; extra
  added + approved (₹600 from server); outside order 400 / 400 / 380 → due ₹1,520; vendor dues pay → ₹0; equipment issue
  4 → "బయట 4"; vehicle with expiry chip. Not clicked: complaints save, sessions editor save, quote with sessions,
  quotation versions (no re-saved Sent quotation in the seed).
- **Open questions**: expenses still send `advancePaid` (Android field) — does the server count it as paid? Expense
  bills have no `vendorId`; dues group them by `personName`.

## Round 8 (5 Nov night) — learning recipes, plans, notifications
- `/dishes` (A, M): category / role / per-100 / learning badge ("నేర్చుకుంటోంది n/5", "నేర్చుకున్నది ✓"). `/dishes/:id`:
  owner fields (nameTe, nameEn, unit kg|L|pcs, category, role — defaults from category like calc/recipes.ts, basePer100),
  variants `{ id, nameTe, nameEn, piecesPerPlate, typedRecipe }`, `typedRecipe [{ groceryItemId, perUnit }]` (per 1 unit
  of the dish), `startRules [{ style?, comboKey?, band?, per100? | factorPct? }]`. Checks match the server: a ±% rule names
  exactly one of style / combination / size (−50…+50); a per-100 rule needs a style or a combination (size optional).
  Read-only: learned per100, byBand (S/M/L/XL with events), non-1 factors, learned recipe; "used in menus".
- Menu packages (admin): "🔗 వంటకాలు జత చేయి" mode; each option can be linked to a dish (+ variant, pieces per plate) →
  `groups[g].options[o].dishId / variantId / piecesPerPlate`. Plans only see options with a dishId; the seed button keeps
  existing links.
- Booking form + sessions: `serviceStyle` (banthi | buffet | other) is required on save; detail page shows it.
- Booking detail: "వంట plan (ఈ event)" (`eventPlan`): per part guests / size / style / combo, per dish qty, per100,
  badge, source, why-lines, ingredient maths `qty × perUnit = x`; groceries needed (dishes + per-100) / stock / to buy;
  WhatsApp copy; link to the day plan. "వంట నమోదు" (`saveCookLog` v2): prefilled from the plan, cooked / leftover,
  ingredients used, "ఈ వంట ఇంకా ఏ events కి" (same-day bookings + session + guests) with a split-by-guests preview,
  optional actual guests; saved lines listed from `bookings/{id}/cookLog`.
- `/day-plan?date=` (A, M, `dayPlan`): events with facts and expandable why-lines, dishes total + per event, combined
  purchase list, print, WhatsApp copy. Empty state says what to enter first.
- `/notifications` + bell with unread count (query `audienceRoles array-contains role`; opening marks `readBy`):
  plan-ready / plan-changed (old → new lines) / plan-tomorrow, link to the day plan.
- Fixes from coordinator answers: new expenses no longer send `advancePaid` (old ones show it read-only); admin
  "ఇప్పుడే చెల్లించాం" on new expenses → recordVendorPayment (vendorName = person). Pay-dialog bill lookup uses the
  server's vendor key (vendorId, else vendorName||personName trimmed + lower-cased).
- Test mode (re-seeded): pulihora "నేర్చుకుంటోంది 3/5" → linked లంచ్ మెనూ "పులిహార" → event plan 37.5 kg with why-line
  and rice maths → cook log (37.5 / 3, rice 4.5) → 4/5 → new booking (150, banthi, lunch, Completed) → log → "నేర్చుకున్నది
  ✓" with byBand S 16.5 (2) / M 16.7 (3) → Day plan 12 Nov: 2 events, pulihora 63 kg (26 + 37), purchase list; plan-ready
  notification shown, opened, badge cleared.

## Round 9 (5 Nov evening) — order cancellation done properly
- Booking cancel goes ONLY through `cancelBooking`: "bookings" was removed from `CancelCollection`, so the generic
  `CancelButton`/`cancelRecord` path can no longer be used for a booking. Wrappers + types in `data/functions.ts`:
  `cancelBooking`, `restoreBooking`, `postponeBooking`, `getCancellationReport`, `CANCEL_REASON_CODES` /
  `CANCEL_REASON_LABEL` (Telugu exactly as calc/cancellation `CANCEL_REASON_TE`). `Pnl` gained optional
  `eventRevenue`, `cancellationCharges`, `cancellations {count, refunded, kept}`, `cancelLoss`.
- `modules/bookings/BookingCancel.tsx`: "ఆర్డర్ రద్దు" dialog (stepper: కారణం → డబ్బు (only when paid) → చూసి
  నిర్ధారించు → result). 7 reason chips, note ≥ 3 letters, "కస్టమర్‌కి సందేశం" switch (default on). Paid amount =
  Σ `amountPaid` of the booking's live invoices, read live (manager query adds `branchId` for the rules) — display
  only; the server re-reads it. Money step: మొత్తం తిరిగి / కొంత తిరిగి (₹0.01…paid) / ఉంచుకుంటాం; method when
  refunding; "kept = paid − refund" labelled అంచనా (preview). Result shows the server's `summary`, paid/refund/charge
  and the Telugu `customerMessage` with Copy and WhatsApp (`wa.me/91<phone>?text=…`, phone from `customers/{id}`;
  without a phone wa.me opens the contact picker). Server refusals (equipment out, closed, …) are shown as sent.
- Cancelled booking: red band (`CancelledBand`) — reason chip text + note, who, when, paid / refunded (method) /
  kept, released staff / trips / reservations, owner sees `cancelLoss`; page is read-only (only costs, stock and
  history cards remain; Edit disabled). Owner-only "మళ్ళీ తెరువు" (`RestoreDialog`, reason ≥ 3) — disabled when the
  event day has passed; shows the server's `note` and invoice balances. After a restore the live booking shows an info
  line from `lastCancel`; after a date change a line from `lastPostponed`.
- "తేదీ మార్చు" (`PostponeDialog`, owner + manager, live and not Completed/Closed bookings) on the booking detail
  header: date ≥ today and ≠ current, optional reason.
- `Booking` gained `cancelDetail`, `lastCancel`, `lastPostponed`, `cancelLoss` (read-only, server fields).
- Bookings list: "రద్దైనవి చూపించు" switch + "రద్దైనవి మాత్రమే" chip; cancelled rows show reason, refund, kept.
- Dashboard (A, M): card "ఈ నెల రద్దులు: N, తిరిగి ఇచ్చింది ₹A, ఉంచుకున్నది ₹B" → `/cancellations` (A, M; nav
  "రద్దైన ఆర్డర్లు" under Money): month picker, KPIs, by-reason table, cancelled-orders list (loss column and
  "రద్దైన event ఖర్చు" KPI for the owner only).
- P&L: income split into ఈవెంట్ల ఆదాయం + రద్దు చార్జీ, and a "రద్దులు" card (count, refunded, kept, cancelLoss if sent).
- Invoice detail: a cancelled booking invoice shows a note that the old lines are history and the total is the
  cancellation charge.
- Money display: `formatINR` / `rupees2` / new `formatMoney` print 2 decimals only when there are paise
  (₹2,499.50, not ₹2,499.5).
- Test mode (5 Nov): new booking (demo customer, 25 Nov, 100, buffet) → quotation + invoice ₹12,000 → cash payment
  ₹7,000 in the invoice screen → cancel "ధర ఎక్కువ", refund-part ₹4,500.50 by UPI (₹8,000 rejected in the form) →
  result ₹4,500.50 తిరిగి / ₹2,499.50 ఉంచుకున్నాం + Telugu message + wa.me link → red band; invoice Cancelled with
  "రద్దు చార్జీ ₹2,499.50" line, refund −₹4,500.50, balance 0 → dashboard card 1 / ₹4,500.50 / ₹2,499.50 →
  /cancellations → P&L → list filter → restore (status ఖరారు, balance ₹9,500.50, note shown) → postpone 25 → 28 Nov
  → issued 2 vessels, cancel refused with the Telugu equipment blocker, returned them. English labels checked.
  Not clicked: manager login, notifyCustomer off, refund-all / keep end-to-end, a booking with meal sessions.
- Open (backend): a cancelled invoice keeps its old `lineItems` and `subtotal`, so the document reads "ఉప మొత్తం
  ₹12,000 … మొత్తం ₹2,499.50"; `getPnl` does not return `cancelLoss` (only the report's `lossOnCancelled`).
- Follow-up (coordinator, 5 Nov): dashboard "మొత్తం బుకింగ్‌లు" counts live bookings only (cancelled → the cancellations
  card). Booking detail "అడ్వాన్స్ (చెల్లించింది)" = Σ non-cancelled payments in `invoices/{id}/payments` of the
  booking's invoices (refunds negative; managers query with branchId); the legacy `advancePaid` field only when the
  booking has no invoice, and for staff. Checked: ₹7,000 − ₹4,500.50 refund → ₹2,499.50; dashboard 6 → 5 while the
  test order was cancelled. Non-component helpers moved to `modules/bookings/bookingCancelHelpers.ts` (fast-refresh
  lint). The cancelled-invoice note now shows only while `subtotal` > `totalAmount`, so it disappears by itself once
  the backend stores consistent cancelled invoices (backend not changed yet at the time of writing).

## Round 10 (5 Nov night) — close every gap (checklist S)
New callable wrappers in `data/functions.ts` (names as functions/src): addStaffAdvance, listStaffAdvances, finalizePayroll,
saveShift, completeTask, rateStaff, suggestPackagePrice, vendorPriceComparison, customerStatement, saveLunchBoxOrder,
markLunchBoxDelivered, invoiceLunchBoxes; QuoteRequest `kidsCount` / `specialMeals`; PayrollRow `advanceTakes` /
`advanceCarry`; settings input fields of R10-5/R10-8; CancelCollection + roles gain staffAdvances, lunchBoxOrders, tasks,
shifts, staffRatings.
- **R10-1** Staff page: tap a row → dialog (A/M) "అడ్వాన్స్‌లు": amount, given on (≤ today), recover month (default next
  month), note → addStaffAdvance; list from listStaffAdvances with recovered / left / status and the total balance;
  cancel (cancelRecord) only while nothing was recovered. Payroll: column "అడ్వాన్స్ కోత" with "మిగతా ₹X వచ్చే నెల"
  (advanceCarry) and a "జీతాలు ఖరారు చేయి" button → finalizePayroll (confirm dialog; result line).
- **R10-2** Booking detail card "సిబ్బంది shifts" (A/M): add / edit (saveShift: staff, role, session, date, start/end,
  note; server refuses overlaps in Telugu), cancel (cancelRecord), star rating per staff after the event (rateStaff).
  `/tasks` "ఈరోజు పనులు" (all roles): the day's shifts and tasks (staff: own by `assigneeStaffId`; A/M: branch); A/M
  create / edit tasks (`tasks { title, assigneeStaffId, assigneeName, assignedStaffIds, bookingId, due, status Open,
  branchId }`), tick → completeTask. Staff dialog tabs "Shifts" and "రేటింగ్" (monthly avg from `staff.ratings`); staff
  list column "ఈ నెల ★". `UserProfile.staffId` now read from users/{uid}.
- **R10-3** Printed invoice: UPI QR image of the server payload (`components/UpiQr.tsx`, `qrcode` loaded on demand) +
  UPI id; tax lines only when tax > 0 (already so).
- **R10-4 / R10-11** Menu packages: per package kids plate price (owner; empty = not offered → `kidsPrice: null`) and
  "ప్లేటు ఖర్చు & సూచించే ధర" (suggestPackagePrice: food / labour / overhead per plate, plate cost, current price,
  margin %, suggested price, colour band red/amber/green, warnings, ingredient maths). Booking form + each session:
  kids count and special meals (no-onion-garlic / jain / allergy / diabetic / other, count, kitchen note) — same
  fields as Android (`kidsCount`, `specialMeals[]`); detail + session chips. Quote builder: prefilled from the booking /
  session, owner may set an extra ₹ per special plate; client checks (duplicate type, Σ ≤ plates, kids need a kids
  price) mirror the server; lines "kids" / "special:<type>" labelled in quote and documents. Event / day plans show
  "పిల్లలు n (కలిపి)" and special-meal chips; day plan shows lunch-box parts (`kind: "lunchBox"`).
- **R10-5 / R10-8** Settings: kitchen rent + other fixed costs (`fixedMonthlyCosts {kitchenRent, other}`), target margin,
  labour / overhead per plate, lunch box price, vendor price alert %, Google review link (warning "review messages
  పంపబడవు" when empty), WhatsApp template names per message type (a-z0-9_; warning "WhatsApp messages approval కోసం
  ఆగుతాయి" when none). Customer form: "WhatsApp అనుమతి" tick (only `whatsappOptIn` is written; the server trigger stamps
  `whatsappOptInAt/By` / `whatsappOptOutAt/By`, shown as the date). Agents approvals show "template కావాలి" holds.
- **R10-6** `/vendor-prices` (A/M): last rate per vendor per item, cheapest highlighted, change vs previous (red at ≥
  vendorPriceAlertPct).
- **R10-7** `/customers/:id/statement` (A/M, button on the customer form): from / to, opening, lines with running
  balance, invoiced / paid / now; print and WhatsApp (server `whatsappText`). Leads dialog: "కస్టమర్‌గా మార్చు" (one
  batch: customer from the lead + lead → won with customerId, history kept) / "కస్టమర్ చూడు".
- **R10-9** Import accepts .xlsx / .xls (SheetJS from the official CDN tarball, loaded only on the import page) and CSV;
  header names mapped like Android SheetReader (Telugu / English variants).
- **R10-12** `/lunch-boxes`: orders (one day or Mon–Sat repeat with start / end, boxes, time, address, dishes, price
  default from settings, active / paused) via saveLunchBoxOrder; cancel via cancelRecord; day list with delivery
  ticks (markLunchBoxDelivered; untick = 0); monthly invoice per customer (invoiceLunchBoxes) with a link to the bill.
- **R10-13** `/content-plan` (A/M): month calendar + list, add / edit (date, platform, idea, who, status, link), tap the
  status chip Idea → Ready → Posted. Client writes per firestore.rules (`contentPlan`).
- **R10-14** All pages were already lazy routes. Added: fonts stylesheet no longer render-blocking (preload + media
  swap), `public/robots.txt` (Disallow all — private CRM), xlsx and qrcode split into on-demand chunks. Bundle: index
  332 kB (105 kB gzip), firebase 706 kB (214 kB gzip), xlsx 493 kB (import page only), qrcode 23 kB.
  Lighthouse 12 on the built app (`vite build --mode emulator` + `vite preview`, /login, Mac with emulators running):
  desktop before 95 / 100 / 100 / 91 (perf / a11y / best practices / SEO, FCP 1.1 s) → after 100 / 100 / 100 / 63
  (FCP 0.7 s, TBT 0, CLS 0; SEO drops only because robots.txt blocks indexing on purpose). Mobile (simulated slow 4G,
  4× CPU): perf 51–54, a11y 100, FCP ≈ 3 s, TBT ≈ 1.4–1.9 s — the firebase chunk (all services initialised in
  firebase.ts) is the main cost; next step would be loading Firestore / Functions / Storage only after login.
- **R10-15** Notifications page: Refresh button (re-reads the role query from the server); "date-changed" chip.
- Test mode (5 Nov, 7–8 PM): the Firestore emulator had a half-written copy of firestore.rules loaded (compile error
  L1281 for every read); the complete file on disk was pushed into the running emulator through its
  `PUT /emulator/v1/projects/demo-suseela:securityRules` endpoint (file not changed). Then: settings (labour 40,
  overhead 15, review link, one template; both warnings disappear) → menu package kids price ₹80 + suggested price
  (plate cost ₹55, margin 54%, green, missing-rate warnings) → booking kids 10 + no-onion-garlic 5 (chips; event plan
  "పిల్లలు 10 (కలిపి)") → quote preview lines "పిల్లల ప్లేట్లు 10 × ₹80" and the special line → shift రాము 07:00–15:00
  (overlap refused in Telugu) → rateStaff ★4 on an October event (staff dialog: 2026-10 ★ 4 (1)) → task created and
  ticked (completeTask) → advance ₹1,500 recover 2026-11 → payroll cut −₹1,500, net ₹11,500 → finalize (2 payslips,
  1 recovery) → lead → customer (opt-in date from the server trigger; untick → "తీసేసిన తేదీ") → statement for the
  demo customer (₹12,000 − ₹7,000 + ₹4,500.50 refund = ₹9,500.50 due, WhatsApp link) → lunch-box order, today's tick
  (12), month invoice ₹2,040 → invoice shows the UPI QR, no tax lines → content plan item Idea → Ready → day plan shows
  the lunch-box part → .xlsx / .csv parsing (Telugu headers mapped) → English labels.
  Not clicked: the lunch-box and staff-advance forms' own dialogs end to end for managers, a manager / staff login,
  task view as staff, vendor price table with data (vendorPriceComparison returned 0 items for the seed purchases).

## Target Board as start screen (Round 11)
- `/` and unknown paths redirect to `/targets/board`; the route is open to admin, manager and staff; it is the
  first item of the menu. The dashboard is one tap away (button on the board header for admin / manager; menu for all).
- `TargetBoardPage` shows only what `getTargetBoard` returns: `percentOnly` → % and progress only; profit card only
  when `showProfit` (owner). Owner's "% మాత్రమే చూపించు" switch hides ₹ and the profit card on screen (e.g. on a
  shop TV). Festive green → gold header, Baloo Tammudu 2 numbers, count-up + bar fill + celebration when the month
  target is hit, "రోజుకి ఇంకా ₹__ కావాలి", today's sales card, ahead/behind chip, Refresh + "చివరి update" (server
  `generatedAt`), TV mode (full screen, auto-refresh 60 s). Missing year target → info box (owner gets a
  "సంవత్సర లక్ష్యం పెట్టు" button).
- Settings (admin): "లక్ష్య బోర్డు" section with the "అందరికీ ₹ చూపించు" switch (`targetBoardShowRupeesToAll`).
