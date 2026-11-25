# Backend notes — Cloud Functions (functions/)

**ఓనర్ కోసం (Telugu):** డబ్బు లెక్కలు, invoices, payments, జీతాలు, targets, రోజువారీ/నెలవారీ లెక్కలు,
agents (ఉదయం summary, బాకీల గుర్తు, backup …) అన్నీ ఇప్పుడు server (Cloud Functions) లో ఉన్నాయి.
ఇవి పని చేయాలంటే Firebase **Blaze plan** కావాలి. WhatsApp కొత్త SIM, Meta account వచ్చే వరకు messages
"queued" గా ఉంటాయి — ఏమీ పంపబడవు. Customer కి message వెళ్ళాలంటే customer అనుమతి (whatsappOptIn)
ఉండాలి; డబ్బు గురించిన / మొదటిసారి messages మీరు approve చేశాకే వెళ్తాయి.

Contract: `docs/api-contract.md`. Calculations: `functions/src/calc` (spec `docs/calc-spec.md`).
Region `asia-south1` everywhere (`src/setup.ts`); schedules use `Asia/Kolkata`.

## Layout
| folder | what |
|---|---|
| `setup.ts` | `setGlobalOptions({ region })` + `initializeApp()`; imported first by every function module |
| `shared/` | `callable()` wrapper (auth + active + role + `{te,en}` errors), `errors` (CalcError → invalid-argument), `validate`, `istDate` (IST days, reuses calc/periods), `counters` (numbering in a transaction), `settings`/`settingsModel`, `templates` (Telugu), `outbox` + `messagePolicy`, `firestorePaths` |
| `settings/`, `import/` | `saveBusinessSettings`, `importRows` |
| `menus/`, `billing/` | `quoteMenu`, `saveQuotation`, `generateInvoiceFromBooking`, `recordPayment`, `refundOrAdjust` |
| `kitchen/`, `staff/` | `saveCookLog`, `cookingPlan`, `groceryList`, `markAttendance`, `monthPayroll`, `syncStaffLink` trigger |
| `targets/`, `stats/` | `setYearTarget`, `getTargetBoard`, `getPnl`; stats triggers + booking cost |
| `agents/` | 13 agents, `agentRuns`, `setAgentEnabled`, `approveMessage`, `runAgentNow` |
| `integrations/` | `whatsapp.ts` (Cloud API adapter + sender trigger + hourly flush), `upi.ts` |

Pure helpers live in files that do not import Firebase, so `npm test` runs without the emulator.

## Exported functions
Callables: `ping`, `adjustStock`, `saveBusinessSettings`, `importRows`, `quoteMenu`, `saveQuotation`,
`generateInvoiceFromBooking`, `recordPayment`, `refundOrAdjust`, `saveCookLog`, `cookingPlan`, `groceryList`,
`markAttendance`, `monthPayroll`, `setYearTarget`, `getTargetBoard`, `getPnl`, `setAgentEnabled`,
`approveMessage`, `runAgentNow`.

Firestore triggers: `statsOnInvoice`, `statsOnPayment`, `statsOnExpense`, `statsOnPurchase`, `statsOnAdSpend`,
`statsOnAttendance`, `statsOnBooking`, `costOnVehicleTrip`, `costOnEquipmentMove`, `syncStaffLink`,
`agentCookingLearner` (cookLog), `agentPriceWatch` (purchases), `sendQueuedMessage` (outbox).

Schedules (IST): `agentMorningSummary` 07:30 · `agentDuesCollector` 10:00 daily (all dues on Monday, due-today
otherwise) · `agentEnquiryFollowup` 09:00 · `agentEventReadiness` 18:00 · `agentStockWatch` 18:00 ·
`agentTargetPlanner` 06:00 on the 1st · `agentAdsAnalyst` Sun 09:00 · `agentFeedbackReviews` 11:00 ·
`agentBackup` 02:00 · `agentMenuPriceReview` 08:00 · `agentIntegrityCheck` 03:00 · `flushOutbox` hourly 08:05–21:05.

## Definitions used by dailyStats / monthlyStats (recomputed from sources, idempotent)
- income = Σ invoice `totalAmount − taxAmount` by `issueDate` (GST is not income; Cancelled/Void ignored)
- collected = Σ payments by `date` (refunds negative)
- food = Σ purchases `totalAmount` (not deleted) by `purchaseDate`
- labour = Σ attendance `pay` + "Temporary Staff" expenses + monthly salaries (day doc: salary ÷ days in month)
- other = Σ expenses by `serviceDate` except "Temporary Staff" and "Staff Advance" (advance is part of salary)
- ads = Σ adSpend `amount` (adSpend.date must be the string `YYYY-MM-DD`)
- breakEven (month only): fixed = `settings.fixedMonthlyCosts` (or the month's "Rent / Fixed Expense" expenses when 0)
- extra fields: collected, adsRevenue, adsLeads, adsBookings, invoiceCount
- Concurrent writes on the same day can, rarely, leave a stale doc; `integrityCheck` (03:00) re-derives
  yesterday and today, and any later write to the day fixes it again.

`bookings.costActual / profitActual`: direct costs with that `bookingId` (purchases, Outside Purchase/Live Counter
→ food; attendance + Temporary Staff → labour; Transport + vehicleTrips.fuelCost; equipmentMoves rentalCost +
damageCost → rentals; other expenses). Monthly salaries and rent are not allocated to events.

## Proposed calc-spec additions (implemented in `calc/ops.ts`, please add to docs/calc-spec.md)
**§7b Monthly staff** — `perDay = monthlySalary / daysInMonth`; `missed = absent + leave + 0.5·half`;
`unpaid = max(0, missed − freeLeaves)`; `cut = deductAbsences ? round2(min(salary, unpaid·perDay)) : 0`;
`ot = overtime ? round2(Σ max(0, hours−8) · perDay/8 · 1.5) : 0`; `net = round2(salary − cut + ot − advances)`
(may be negative). Defaults `{deductAbsences:false, freeLeaves:0, overtime:false}`.
Daily staff rows: gross = Σ dayPay(first 8 h), ot = Σ dayPay beyond 8 h, net = §7 net.
**Rate change** `round2((new − old)/old·100)` (price watch alert when ≥ `settings.priceRiseAlertPct`, default 5).
**Percent of target** `round2(actual/target·100)`, null when target 0.

`calc/menus.ts` was brought in line with §11 (whole-menu checks, duplicate replacements/extras, missing lists
default to [], real calendar dates and 29 Feb → 1 Mar in `priceReviewDue`) — the existing `calc.test.ts` already
expected this and was failing 2 tests.

## Differences from / additions to the contract
1. `recordPayment` / `refundOrAdjust` return and store status **`PartiallyPaid`** (Android `InvoiceStatus` label),
   not "Partially Paid". A full refund sets status `Sent`.
2. **No top-level `payments` mirror**: Android lists payments with `collectionGroup("payments")`, so a mirror
   would show every payment twice. Payments have `type: "payment" | "refund"`, `day: "YYYY-MM-DD"`.
3. `getTargetBoard` (decision 5): `events` / `bookings` = `{ actual, target }`; target comes from optional
   `targets/{year}.eventTargets[12]` / `bookingTargets[12]`, else null. Managers (`percentOnly`) get every rupee
   field `null`; `incomePct` (month income vs month target), `profitPct` and extra `yearPct` (1 decimal) are always
   filled. `profitTarget` is for the month. The plan is recomputed from current actuals on each call.
4. `getPnl` (decision 6): `primeCost = { pct, band }` (null when no income), `range = { start, end }` (ISO, end
   exclusive), `breakEven` rupees or null; adds `collected`.
5. `quoteMenu` response also has `gstRate`.
6. `saveBusinessSettings` also accepts `ownerPhone` (owner alerts; falls back to `phone`), `fixedMonthlyCosts`,
   `googleReviewUrl`, `priceRiseAlertPct`, `monthlyPayRules`, `photoUrls`. `monthPayroll` reads
   `settings/business.monthlyPayRules` (decision 3), default `{ deductAbsences:false, freeLeaves:0, overtime:false }`.
   `setupProgress` (decision 7) = `{ business, bank, signature, staff, photos, pct }`: business = name + phone +
   address; bank = account + IFSC or a UPI ID; signature = signatureUrl; staff = at least one staff record;
   photos = logo or a `photoUrls` entry; pct = whole percent of the 5 steps.
7. `importRows` accepts optional `branchId` (staff rows need one; default = caller's branch); `skipped[].row` is
   the 1-based position in `rows`.
8. Invoices also store `docTitle`, `taxable`, `gstin`, `dueDate` (= event date), `quotationId`,
   `customerNameSnapshot`, `upiQrPayload` (updated to the remaining balance after each payment; null when 0 or no
   UPI ID). Line items carry `key` and `descriptionTe`.
9. Quotations store `pricingSnapshot` + `quoteInput`; `generateInvoiceFromBooking` recomputes from these (prefers
   an Accepted quotation, else the newest) with today's GST setting; falls back to the booking's `menuSnapshot ×
   guests`. Regenerating replaces an unpaid invoice of the booking (same number); refused once paid.
10. New server-owned paths: `dishes/{id}/history/{bookingId}` (feeds §5), `agentSettings/{id}.lastRun`,
    counters `counters/invoice-YYYY`, `counters/quotation-YYYY`. Outbox status adds `sending` (claim before send).
11. `menuPackages.groups` (decision 1) is `[{ options: [{te,en}] }]`; `selections[i]` indexes `groups[i].options`
    (the plain nested seed shape is also read). Optional `inventoryItemIds[]` on a package lets price watch name
    affected packages.
12. `transportCharged` (decision 2; seed `transportExtra` maps to it, default true): when false, `quoteMenu` /
    `saveQuotation` reject a transport amount > 0 (transport is inside the plate price).
13. `docTitle` ("Invoice" / "Tax Invoice") is written on both quotations and invoices (decision 4).
    `adjustStock` declares `asia-south1` explicitly (decision 9).

## Manual and automatic mode (api-contract, binding)
- Settings: `calcModes { quotation, invoice, attendancePay, payroll, cooking, targets }` each `auto | manual`
  (default auto) and `managerCanOverride` (default true) — accepted by `saveBusinessSettings` (calcModes merges).
- Who: admin always; manager only when `managerCanOverride`; staff never (permission-denied).
- Request: `manual: { <value>, reason }`, reason ≥ 3 chars, value ≥ 0. Stored on the document:
  `calcMode`, `autoValue`, `overriddenBy {uid,name}`, `overriddenAt`, `overrideReason`; plus an `auditLog` entry.
  Automatic writes store `calcMode: "auto"` and `autoValue` too, so every value shows its chip.
- Manual mode never blocks normal work: with no `manual` value the automatic value is saved even when the area is
  "manual" (clients open the manual entry by default). Staff marking their own attendance keep the automatic pay
  and never erase a manual pay the owner set.
- `saveQuotation` / `generateInvoiceFromBooking`: `manual: { total, reason }` — line items stay; tax fields are
  re-split from the GST-inclusive total (`calc/ops splitGrossTotal`); `adjustment` = manual − automatic.
- `overrideInvoiceTotal { invoiceId, total, reason }` (A, M if allowed); `{ invoiceId, auto: true }` restores
  `autoValue`. Total can never go below `amountPaid` (`invoiceAfterTotalChange`); balance and Paid/PartiallyPaid
  stay automatic; UPI payload follows the new balance. Returns `{ totalAmount, balanceDue, status, calcMode, autoValue }`.
- `markAttendance`: `manual: { pay, reason }`. Response adds `calcMode`, `autoValue`. Payroll counts a manual day
  at its typed pay (all gross, no OT split).
- `overridePayrollRow { month, staffId, net, reason }` (admin; `{ month, staffId, auto: true }` switches back) →
  `payroll/{YYYY-MM}_{staffId}`. `monthPayroll` rows now carry `calcMode`, `autoValue`, `overriddenBy`, `overrideReason`.
- `saveCookingPlan { bookingId, items: [{ dishId, quantity, manual }], reason? }` (A, M) →
  `bookings/{id}/cookingPlan/{dishId}`; automatic items get the §5 suggestion for the booking's guests/event type
  (client quantity ignored); manual items need `reason`. Returns `{ items: [{ dishId, unit, quantity, autoValue, calcMode }] }`.
- `setYearTarget`: `manualMonths: (number | null)[12]` + `manual: { reason }` (or top-level `reason`): number = typed
  month, null = automatic month (calc-spec §4b, `calc/ops replanWithManual`). Null months share
  max(0, yearTarget − Σ typed − automatic finished actuals) by season weight. Missing / all null = fully automatic.
  Stored: `targets/{year}.manualMonths` (with nulls), doc `calcMode` (manual if any month typed) + override fields,
  and every `months[i]` = `{ original, revised, isActual, calcMode, autoValue }` (autoValue = fully automatic plan).
  Not sent: `profitMarginPct` / `weights` / `manualMonths` keep the year's stored values (settings only for a new
  year); kept typed months keep who typed them. `getTargetBoard` recomputes with §4b (typed
  months kept, automatic months from current actuals) and adds `monthCalcMode`, `monthAutoValue` (null when
  percent-only). `targetPlanner` re-plans only the null months and keeps typed months and who typed them.
- New server-owned paths for rules: `payroll/{id}` (admin read), `bookings/{id}/cookingPlan/{dishId}`
  (same read access as the booking).

## Contract audit fixes (5 Nov 2026)
- `requireActiveUser`: role admin passes even when `active` is false; other roles need `active == true`.
- `saveQuotation` update: `notes`, `bookingId`, `validDays`/`validUntil` keep stored values unless sent (validUntil
  recomputed from today only when `validDays` 1–90 is sent); the original `issueDate` is kept.
- branchId = request `branchId`, else the caller's branch. Empty → invalid-argument (Telugu message) only for
  `saveQuotation` without a booking and staff imports; customers / vendors are imported with "" if neither is set
  (no branch scope in the rules). Managers only for their own branch.
- `runAgentNow` keeps `timeoutSeconds: 540`.

## Round 6 (stock deduction, change history, service timeline)
- **Stock:** `stockOnBookingCompleted` (status → Completed, `settings.autoStockDeduct` default true) and
  `applyEventStock` (A, M; `items` = manual quantities, reason ≥ 3, manager only with managerCanOverride) /
  `reverseEventStock` (A) — one transaction each; OUT/IN movements like `adjustStock` (reason `event` /
  `event-reversed`, `bookingId`); quantities from `calc/stock eventStockLines` (§6, stock never below 0 → `shortBy`;
  unlinked / missing / bad-unit grocery items → `skipped`). Never deducts twice (checks `stockDeduction` first).
- **History:** `history*` triggers (14 collections) write `auditLog { kind: "change", … }` via
  `shared/historyDiff changeSummary`; function entries now carry `kind` ("override" / "action"), `by` and `at`.
  Server writes set `updatedBy` (caller uid, or "system" for triggers/agents) so `by` is right.
  `getHistory` (A): with `docId` an equality query (no composite index); otherwise newest-first scan on `at`
  (single-field index), filters in memory, ≤ 5,000 entries per call; `byName` from users.
- **Timeline:** `calc/timeline.ts serviceTimeline` (§12) with `settings.timelineDefaults` (validated on save:
  keys of §12 + cookExtraStep / cookExtraMax, whole minutes 0–600; cookBase / serveSpan per meal or one number).
  `eventReadiness` uses booking `serveTime` / `travelMinutes` / `mealType` (package `packageId` or `menuPackageId`
  for deliveryWindow / mealType). No callable for the booking-detail view — clients use the same §12 formula.

## Round 7 (server side of R7-1 … R7-10)
- **R7-1** `shared/costTarget.ts`: `costTargetOf` (untagged = overhead general; legacy `bookingId` = that event). Stats
  count outside orders as food and add `overheadByCentre`; `getPnl` returns it. `bookingCost` = purchases + expenses +
  accepted outside orders tagged to the booking + rented equipment (qty × rentalRate × days) + trips (fuel + ratePerKm × km).
- **R7-2** `stockOnPurchase`: lines with `inventoryItemId` → IN/OUT for the difference to `purchase.stockApplied`
  (old purchases without it: their previous lines count as already applied); cancel/edit/delete reverses.
  `adjustStock` now needs `reason` ∈ count | damage | return | correction (+ optional `note`). Units are not converted.
- **R7-3** `cancelRecord { collection, id, reason, invoiceId? }`: status Cancelled / archived; cancelled booking gives
  its event stock back; cancelled payment re-derives the invoice; invoices with money must be refunded first;
  records of a closed event are refused. Stats ignore cancelled / archived / deleted records.
- **R7-4** stockWatch alerts vehicle papers 30 / 7 days before and when expired; morningSummary line
  `వాహనాల పత్రాలు`. equipmentMoves get the booking's `assignedStaffIds` (`syncMoveStaff`, `syncBookingStaffToMoves`).
- **R7-5** `syncBookingSessions` (guestCount = Σ, eventDate = earliest session, guestCountActual = Σ when known);
  `saveQuotation { sessions: [...] }` (one quotation, `sessionQuotes[]`, lines "Session — line", GST once on the sum);
  `getServiceTimeline { bookingId, sessionId }`; `cookingPlan` / `groceryList { bookingId, sessionId? }`;
  event stock = Σ of each session's §6 quantities.
- **R7-6** `saveOutsideOrder`, `recordOutsideDelivery` (`amountDue` §15; status ordered → delivered → settled).
- **R7-7** `logGuestCount`, `addEventExtra`, `approveEventExtra`; invoices add approved extras and extra plates (§14).
- **R7-8** `recordVendorPayment` (allocations ≤ each bill's balance, Σ ≤ amount), `getVendorDues`,
  `billStatusOnPurchase/Expense` keep paid / balance / paymentStatus (Unpaid | PartiallyPaid | Paid), old free-text
  status kept as `legacyPaymentStatus`; `migratePaymentStatuses` (A) does all old docs once.
- **R7-9** `closeEvent` (blockers §18, profit snapshot, status Closed), `reopenEvent` (audited). Cost recompute stops
  while closed.
- **R7-10** editing a Sent / Accepted quotation snapshots `versions/{n}`, bumps `version`, new version is Draft;
  `quotationAcceptedVersion` sets `acceptedVersion`. Settings `legalName`, `brandName`, `legalNameOnDocs` → `issuerLine`
  on quotations / invoices.
- Index notes: `costTarget.bookingId` equality queries use the automatic map-field index; getVendorDues uses
  `paymentStatus in [...]` and outsideOrders `status in [...]` (single-field).

## Round 8 (learning recipes, plans, kitchen notifications)
- `calc/recipes.ts` (§13 / §13.5): sizeBand, eatenPer100, piecePer100, learnStatus, bandPer100 (§13.1, for
  `learned.byBand`), comboKey / roleOfCategory / defaultServiceStyle, **per100ForPlan** (piece → exact cell ≥ 2 →
  factors overall × f_band × f_style × f_combo, each from ≥ 2 events else typed `startRules` factorPct else 1, clamped
  0.5–1.5 → typed per100 style+combo / combo / style → basePer100 → none, with `why[] {te,en}`), ingredientRatios (§13.2
  typed blend while n < 3), roundUpQty (kg/L 0.1, pcs whole), splitShared (Σ shares = batch, remainder → most guests),
  piecesFromName ("ఇడ్లీ – 3" → 3).
- Plans use §13.5 (it replaces §13.1's single learned value); §13.1's nearest-band ratio is kept only for `byBand` display.
- `saveCookLog` v2: `{ bookingId, sessionId?, guestCountActual?, entries: [{ dishId, variantId?, cooked, leftover,
  ingredients?, sharedWith? }] }` → cookLog doc id `dishId[__v-variant][__s-session]` with guests, band, serviceStyle,
  comboKey, ingredients; shared batches are split by guests and written to every event. History
  `dishes/{id}/history/{bookingId}__{logId}`; `dishes.learned` (per100, status, eventsUsed, byBand, byCell, factors,
  variants) and `dishes.recipe` (ingredients perUnit, typed, variants) are server-only. Owner fields: `category`, `role`,
  `variants[] { id, nameTe, nameEn, piecesPerPlate?, typedRecipe? }`, `startRules[]`, `typedRecipe`, `basePer100`.
- Menu options keep `dishId`, `variantId`, `piecesPerPlate` (parsed from the name when not typed).
- `eventPlan { bookingId, sessionId? }` (A, M, assigned S) and `dayPlan { date, branchId? }` (A, M): dishes with qty,
  per100, source, matchedEvents, status, why, ingredient maths (qty × perUnit); ingredient totals = dish recipes + §6
  per-100 lines only for grocery items no planned dish's recipe covers; stock and toBuy. Menu dishes come from the
  booking's quotation choices (session or whole), else single-option groups of the package.
- Notifications `notifications/{id} { kind: plan-ready | plan-changed | plan-tomorrow, audienceRoles: [admin, manager],
  title {te,en}, link "/day-plan?date=…", bookingId?, day, changes?, readBy[] }`: first plan for a booking, plan number
  changes (old → new) after menu / guests / style changes (`planOnBookingChange`, `planOnQuotationChange`;
  `bookings.planSnapshot` 🔒), and the day-before 6 PM eventReadiness run (tomorrow's day plan).
- tools/seed-emulator.cjs: dish category / role and 3 demo pulihora events → "నేర్చుకుంటోంది 3/5" in test mode.
- **For the Security agent (rules):** `dishes.learned`, `dishes.recipe`, `dishes/*/history/*`, `bookings.planSnapshot`,
  `bookings/*/cookLog/*` are server-only; `dishes.category / role / variants / startRules / typedRecipe / basePer100`
  writable by admin + manager; `notifications`: read by admin + manager, client update only `readBy` (arrayUnion own uid);
  `bookings.serviceStyle` and `sessions[].serviceStyle` ∈ banthi | buffet | other.

## Round 9 (order cancellation, restore, postpone)
Callables (all `{te,en}` errors, asia-south1):
- `cancelBooking { bookingId, reasonCode, reason, advance?, refundAmount?, refundMethod?, notifyCustomer? }` (A; M own
  branch). One transaction: booking `status Cancelled` + `previousStatus` + `cancel { reasonCode, reasonTe, reason, by,
  at, day, paid, refund, charge, refundMethod, refunds[], previousStatus, releasedStaffIds, releasedTrips,
  releasedMoves, invoiceIds }` + `cancelledAt/cancelledBy/cancelReason`, `assignedStaffIds: []`, `planSnapshot` removed;
  refund = negative payment(s) `type:"refund", cancellation:true, bookingId` with the chosen method (split over the
  booking's live invoices, most-paid first); each live invoice → `Cancelled`; its old money (status, lineItems,
  subtotal, discount, taxable, gstRate, cgst/sgst/igst, taxAmount, totalAmount, balanceDue) moves to `beforeCancel`
  and the document becomes only the charge: `lineItems = [{ key:"cancellation-charge", descriptionTe:"రద్దు చార్జీ ₹X" }]`
  (`[]` when X = 0), `subtotal = taxable = totalAmount = amountPaid = cancellationCharge = X`, discount / tax 0,
  `balanceDue 0`; quotations → `Cancelled`
  (+previousStatus; accepted version untouched); equipment moves not yet issued (status planned/reserved, type
  reserve, or an issue dated after today) and vehicle trips not driven (status planned or no km/fuel) → `Cancelled`.
  Equipment still out (issued − returned − damaged − lost > 0) → `failed-precondition` with a Telugu blocker
  (`details.blockers[0].code = "equipment-out"`, `details.outstanding`). After the transaction: event stock returned
  (existing `reverseStockForBooking`), "plan మారింది" notification `planCancelled_{bookingId}` (event today or later),
  unsent outbox messages for the booking / its invoices → `status:"cancelled"`, booking cost refreshed.
  Returns `{ paid, refund, charge, refunds, released {staff, trips, equipmentMoves}, stockReturned, summary {te,en},
  customerMessage }` — `customerMessage` (Telugu, with refund / charge) only when `notifyCustomer`; never auto-sent.
- `cancelRecord` on `bookings` now goes through the same code (reasonCode `other`); if money was paid it refuses and
  asks for the refund / keep choice (use `cancelBooking`).
- `restoreBooking { bookingId, reason }` (A): only when the event day is today or later. Status ← `cancel.previousStatus`
  (never Completed/Closed → Confirmed), staff re-assigned from `releasedStaffIds`, `cancel` moved to `lastCancel`
  (+restoredAt/By/reason). Invoices get back every `beforeCancel` money field (lines, subtotal, tax, total); refunds stay (amountPaid stays reduced,
  balance goes up, status re-derived by §2); quotations back to their previousStatus. Released trips / equipment
  reservations stay cancelled (enter again). Stock is taken again by the normal Completed trigger.
- `postponeBooking { bookingId, newDate, reason? }` (A; M own branch): same time of day on the new date, sessions shift
  by the same number of days, `postponements[]` + `lastPostponed { from, to, reason, by, at }`. History logs the
  eventDate change; `planOnBookingChange` sends "తేదీ మారింది" (`dateChanged_{id}_{from}_{to}`) for any day change of a
  live booking (also a plain form edit) and re-plans; the timeline is computed on request so it follows.
- `getCancellationReport { month, branchId? }` (A; M own branch): `{ count, refunded, kept, card {te,en}, reasons[]
  {code, te, count, refunded, kept}, lossOnCancelled, bookings[] }`.
Stats: `dailyStats/monthlyStats` gain `eventRevenue`, `cancellationCharges`, `cancellations`, `cancelRefunded`, `cancelLoss`;
`income = eventRevenue + cancellationCharges` (targets use income, so the charge counts; events / bookings counts skip
Cancelled). `statsOnBooking` also watches `cancelledAt`. `cancelLoss` = Σ bookings.cancelLoss of those orders (same as the report's `lossOnCancelled`). `getPnl` returns
`eventRevenue`, `cancellationCharges`, `cancelLoss`, `cancellations {count, refunded, kept, loss}`. A cancelled order's tagged purchases / expenses stay in stats (food / other)
and on the booking as `costActual` with `profitActual = charge − costs` and `cancelLoss` ("రద్దైన event ఖర్చు").
Agents already skip Cancelled bookings / invoices (`bookingsOnDay`, `openInvoices`).
GST on the cancellation charge is not split out (charge stored tax 0) — confirm with the accountant.

### For the Security agent (Round 9)
- Server-only booking fields: `cancel`, `lastCancel`, `cancelLoss`, `postponements`, `lastPostponed`, plus the existing
  `status: Cancelled`, `previousStatus`, `cancelReason`, `cancelledBy`, `cancelledAt`. Clients must not set
  `status: "Cancelled"` on bookings directly (only cancelBooking / cancelRecord), nor move a booking out of Cancelled
  (only restoreBooking). Postpone via the form may still write `eventDate` directly where rules allow it today.
- Server-only invoice fields: `cancellationCharge`, `beforeCancel`, `restoredAt`, `restoredBy`; invoices with status
  Cancelled are frozen for clients.
- Payments with `type: "refund"` / `cancellation: true` are server-created only.
- `equipmentMoves` / `vehicleTrips` / `quotations`: `status: Cancelled` + `previousStatus` / `cancel*` are server-set.
- `messagesOutbox.status` may now be `"cancelled"` (server).
- `notifications` kinds added: `plan-changed` (cancel, id `planCancelled_…`) and `date-changed`.
- Firestore index: none composite — `bookings.cancelledAt` range and `messagesOutbox.relatedId in` are single-field.

## Round 10 (server side of R10-1, 2, 4, 5, 6, 7, 8, 11, 12, 15)
- **R10-1 advances** — `addStaffAdvance { staffId, amount, date?, note?, recoverMonth? }` (A; M own branch) writes
  `staffAdvances { staffId, staffName, amount, date, note, recoverMonth (default next month), status "Open", recovered 0,
  recoveries [], recoveryMonths [], branchId, createdBy… }`. `listStaffAdvances { staffId }` (A/M; staff own) → rows
  with recovered / balance + total balance. Payroll (`monthPayroll` rows) now deducts due advances capped at the pay
  (§20): row `advances` = the cut ("అడ్వాన్స్ కోత"), `advanceTakes[]`, `advanceCarry`. `finalizePayroll { month }` (A)
  writes the payslips `payroll/{month}_{staffId}` (gross, cut, ot, advances, advanceTakes, advanceCarry, net unless typed,
  finalized) and books `recoveries[{month, amount, payslipId}]`; fully recovered → `Recovered` + `recoveredPayslipId`.
  Safe to run again. Cancel: `cancelRecord { collection: "staffAdvances" }` (A/M), refused once anything was recovered.
  Old advances without a status keep the old rule (their own month only).
  **"Staff Advance" expenses are not payroll advances**: payroll reads only `staffAdvances`. Expenses with section
  "Staff Advance" (old category, being removed from the forms) are never deducted from pay, and stats / event cost
  already leave them out of labour, other and overheads (they are a cash movement, not a cost). No trigger change. Index: none composite (`status ==`,
  `recoveryMonths array-contains`, `date` range).
- **R10-2** — `saveShift { id?, bookingId, sessionId?, staffId, role cook|helper|server|driver|supervisor, date,
  startTime, endTime, note? }` (A/M) → `shifts { …, start, end (Timestamps), hours, roleTe, status "Planned", branchId }`,
  refuses overlaps for that staff member on that day and cancelled/closed events, adds the staff to
  `bookings.assignedStaffIds`. `markAttendance` takes `shiftId?` (stored). `completeTask { taskId, done?, note? }` (staff:
  own tasks by `assigneeStaffId` / `assigneeUid`; A/M own branch) → `status Done|Open, doneAt, doneBy, staffNote`.
  `rateStaff { staffId, bookingId, stars 1–5, note? }` (A/M) → `staffRatings/{bookingId}_{staffId} { …, month, by }`;
  trigger `ratingOnWrite` keeps `staff/{id}.ratings[YYYY-MM] = { avg, count }` (§25). Shifts / tasks / ratings can be
  cancelled with cancelRecord.
- **R10-4** — `suggestPackagePrice { packageId, guests? = 100 }` (**admin only** — owner rule A2, a manager never sees
  profit; managers get permission-denied "ప్లేటు ఖర్చు, లాభం owner (admin) మాత్రమే చూడగలరు.") → `{ currentPrice, foodPerPlate,
  labourPerPlate, overheadPerPlate, plateCost, targetMarginPct, suggestedPrice, marginPct, band red|amber|green, bandTe,
  summary {te,en}, ingredients[] (qty, rate, rateDay, vendor, unitMismatch, cost), missingRates[], warnings[], knownPlateCost,
  coveragePct, costedLines, pricedLines }` (§24). Any costed ingredient without a rate → `band "unknown"` (grey) with
  plateCost / marginPct / suggestedPrice null. Rates: latest live purchase line matched to the grocery item (§25
  matching, unit-converted; last 1,000 purchases). `unitMismatch: true` when the item's most recent purchase line was in
  a unit that cannot be converted to the grocery unit (Packet, Tray…); the latest convertible rate is still used if
  there is one.
- **R10-5 settings** — `fixedMonthlyCosts { kitchenRent (default 53000), other }` (a plain number is still read, as
  "other"); break-even (monthly stats, getPnl) uses kitchenRent + other. `vendorPriceAlertPct` (default 5; the old
  `priceRiseAlertPct` is read as fallback and written together) drives priceWatch. `targetMarginPct` (30),
  `labourPerPlate`, `overheadPerPlate` (0), `lunchBoxPrice` (170), `whatsappTemplates { type: metaTemplateName }`
  (names a-z0-9_), `googleReviewUrl`, `signatureUrl` — all through saveBusinessSettings. The review agent sends nothing
  without `googleReviewUrl` and tells the owner once a month.
- **R10-6** — `vendorPriceComparison { groceryItemId? }` (A/M) → `items[] { itemKey, groceryItemId, name, unit,
  vendors[] { vendorId, vendorName, lastRate, lastDay, previousRate, changePct, cheapest } }, purchasesScanned,
  linesWithRate` (§25), cheapest first. Lines match the grocery master by groceryItemId (web) → inventoryItemId
  (Android) → name; typed vendors (vendorId "") are grouped by name. Cancelled purchases never count.
- **R10-7** — `customerStatement { customerId, from?, to? }` (A/M) → `{ opening, lines[] { day, kind
  booking|invoice|cancellation-charge|payment|refund, ref, amount, te, en, balance }, closing, invoiced, paid,
  whatsappText }` (§23).
- **R10-8 WhatsApp** — every outbox message now gets `sendAs`: plain `text` only when the person wrote to us in the last
  24 h (`customers/leads.whatsappLastInboundAt`; nothing sets it yet — needs the inbound webhook when the API number
  exists), otherwise `template` with `metaTemplate = settings.whatsappTemplates[type]` (full key
  "customer.duesReminder" or "duesReminder") and `metaParams` in placeholder order. No template → `status
  "needs-approval"`, `holdReason "template-missing"`, `holdTe "template కావాలి"` (approvals list). If the owner approves
  a held message, the sender uses a template set since then, else plain text. Trigger `optInOnCustomer` /
  `optInOnLead`: a change of `whatsappOptIn` stamps `whatsappOptInAt/By` or `whatsappOptOutAt/By` (server).
- **R10-11** — menu package `kidsPrice` (null = not offered); quote request `kidsCount`, `specialMeals[] { type, count,
  note?, extraPerPlate? }` (§21) → lines `kids`, `special:<type>` in quoteMenu / saveQuotation / invoices (pricing
  snapshot keeps kidsPrice). eventPlan / dayPlan parts carry `kidsCount`, `specialMeals[] { type, typeTe, count, note }`
  from the booking or session, and cook for guests + kids.
- **R10-12 lunch boxes** — `saveLunchBoxOrder` (A/M) → `lunchBoxOrders { customerId, customerNameSnapshot, date |
  days[mon–sat] + startDate + endDate?, count, menuOptionIds (dish ids), deliveryAddress, deliveryTime, pricePerBox
  (default settings.lunchBoxPrice), status active|paused|cancelled, deliveries { day: boxes }, branchId }`.
  `markLunchBoxDelivered { orderId, date, count? }` (A/M/S branch) is the delivery tick (`deliveries.<day>`,
  `deliveredBy.<day>`). dayPlan includes the day's active orders as parts `kind: "lunchBox"`, `lunchBoxOrderId`.
  `invoiceLunchBoxes { customerId, month }` (A/M) → invoice `lunchbox_{customerId}_{month}` (`kind "lunchBox"`,
  `lunchBoxMonth`), rebuilt on re-run until money is received (§22).
- **R10-15** — DEPLOY-STEPS test count updated.

### For the Security agent (Round 10)
- Server-only: `staffAdvances` `status`, `recovered`, `recoveries`, `recoveryMonths`, `recoveredPayslipId`,
  `recoveredMonth` (create only via addStaffAdvance; clients read: A, M own branch, staff own); `payroll` payslip fields
  (`advanceTakes`, `advanceCarry`, `finalized*`); `staff.ratings`; `staffRatings` (write via rateStaff only);
  `shifts` (write via saveShift; staff read own `staffId`); `tasks.status/doneAt/doneBy` change via completeTask (staff
  may not edit other task fields); `lunchBoxOrders` (write via saveLunchBoxOrder / markLunchBoxDelivered; `deliveries`,
  `deliveredBy` server-only); invoices with `kind "lunchBox"` are server-created; customers / leads
  `whatsappOptInAt/By`, `whatsappOptOutAt/By`, `whatsappLastInboundAt`; messagesOutbox `sendAs`, `metaTemplate`,
  `metaParams`, `holdReason`, `holdTe` (the owner's approval may only flip `status` needs-approval → queued).
- Settings fields added (admin write via saveBusinessSettings): `fixedMonthlyCosts` (now a map), `vendorPriceAlertPct`,
  `targetMarginPct`, `labourPerPlate`, `overheadPerPlate`, `lunchBoxPrice`, `whatsappTemplates`.
- New collections: `shifts`, `staffRatings`, `lunchBoxOrders` (all with `branchId`); `contentPlan` is client data
  (no server code) — needs its own rule (A/M).
- Indexes: none composite (all new queries are equality-only or single-field).

## Final QA fixes (5 Nov 2026)
- **F4 purchase stock units** — `stockOnPurchase` converts each line into the stock item's `unit` (shared/units.ts:
  Gram→kg, ML→L, Dozen→pcs; spellings Kg/kgs/Kilo, Litre/ltr, Piece/pcs/Nos…). 500 Gram of toor dal now adds 0.5 kg.
  A line whose unit cannot be converted (Packet for a kg item) moves no stock and is listed on the purchase as
  `stockSkipped[] { line, description, inventoryItemId, quantity, unit, stockUnit, reason unit-mismatch|stock-unit-unknown,
  te, en }`; notification `notifications/stockSkipped_{purchaseId}` (kind `stock-unit`, admin + manager) "యూనిట్ వేరు —
  stock మార్చలేదు, చేతితో సరిచేయండి …"; it is removed when the purchase is fixed or cancelled. Stock item without a
  unit: kg / L / pcs / blank lines go in as typed, others are skipped. `stockApplied` keeps exactly what was moved (stock
  units), so edits and cancel reverse exactly that; a purchase saved under the old bug is corrected on its next save
  (e.g. −499.5 kg). Old lines without a unit go in as typed.
- **Invoice terms** — `settings.invoiceTerms` (default Telugu payment terms, no validity line; editable via
  saveBusinessSettings, ≤ 5,000 chars) is copied as `terms` onto event invoices (generateInvoiceFromBooking), cancelled
  invoices (cancelBooking) and lunch-box invoices. Clients print `invoice.terms` on invoices (fallback
  settings.invoiceTerms) and `settings.terms` on quotations only.
- **Cancellation-charge line** — named just "రద్దు చార్జీ" / "Cancellation charge" (the amount is in the amount column).
  cancelBooking writes an audit entry per rewritten invoice (`action "cancelBooking:invoice"`, before/after money,
  `summary {te,en}`); restoreBooking writes `restoreBooking:invoice`. The history trigger also logs the change.
- **Quotation history** — saveQuotation's own entry is `action "create"` with `summary` "కొటేషన్ తయారు <no> (N భోజనాలు)"
  for a new quotation and `saveQuotation` with "కొటేషన్ మార్చారు <no> (వెర్షన్ n)" for an edit. Audit entries may now carry
  `summary {te,en}`; getHistory returns it — the history screens should show it when present.
- **Staff and money (owner decision)** — checked every callable open to staff (markAttendance, eventPlan, cookingPlan,
  groceryList, saveCookLog, getServiceTimeline, logGuestCount, addEventExtra, completeTask, listStaffAdvances (own only),
  markLunchBoxDelivered): none returns purchase / expense amounts or branch totals. P&L, stats, payroll, history,
  reports, vendor rates and suggested prices are admin (or admin/manager) only. Rules for reading purchases / expenses
  are the Security agent's change.

## Needed before deploy
- **Blaze plan** (scheduled functions, Secret Manager, outbound fetch to graph.facebook.com / Firestore export).
- **Index** (add to `firestore.indexes.json` → `fieldOverrides`): collection group `payments`, field `date`,
  ASCENDING + DESCENDING with `queryScope: COLLECTION_GROUP` (stats "collected"; without it collected stays 0
  and a warning is logged).
- **Secrets**: `firebase functions:secrets:set WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` — enter `none` until the
  WhatsApp number is ready; then the real token + numeric phone-number id. Business-initiated messages outside
  the 24-hour window need Meta-approved templates (names `suseela_<template key>`, e.g. `suseela_owner_alert`);
  the adapter sends plain text unless an outbox doc has `sendAs: "template"`.
- **Backup**: the default compute service account needs *Cloud Datastore Import Export Admin* and write access
  to the default bucket; add a bucket lifecycle rule to delete `backups/firestore/` after e.g. 30 days.
- Firestore database location must be compatible with `asia-south1` triggers (check in the console).
- `FirestoreCollections.kt` must gain the new names in `src/shared/firestorePaths.ts`.

## Not verified here
No `npm install`, emulator or deploy was possible: code was type-checked with TypeScript (strict) against
hand-written stubs of the Firebase APIs used, and the pure helpers are unit tested. First real run should be on
the emulator suite (`npm run serve`) — especially transactions, trigger paths, the WhatsApp call and the export.
