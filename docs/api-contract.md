# API contract — Cloud Functions ↔ Android ↔ Web

**Telugu:** phone app, web admin, server ఒకరితో ఒకరు ఎలా మాట్లాడతారో ఈ ఒప్పందం చెబుతుంది. ముగ్గురూ ఇదే పాటించాలి.

Read with `docs/data-model.md` (shapes) and `docs/calc-spec.md` (numbers). Region: **`asia-south1`**.
All callables are Firebase **v2 `onCall`**; caller must be signed in and `active` (`requireActiveUser`).
Errors: `HttpsError(code, message, details)` where `details = { te: "<Telugu>", en: "<English>" }` — clients
show `details.te` when the UI language is Telugu. Codes: `invalid-argument` (validation, incl. every
`CalcError`), `permission-denied` (role), `not-found`, `failed-precondition` (e.g. invoice already paid).
Dates of a business day are strings `YYYY-MM-DD` (India time). Money in rupees (≤ 2 decimals).

Roles column: A = admin, M = manager, S = staff.

## Settings & setup
| callable | roles | request | response |
|---|---|---|---|
| `saveBusinessSettings` | A | partial `settings/business` fields: name, logoUrl, address, phone, fssaiNumber, bank{name,account,ifsc}, upiId, signatureUrl, terms, profitMarginPct, seasonWeights[12], **gstin**, **gstRate** | `{ ok, setupProgress }`. Entering a valid 15-char GSTIN sets `gstRegistered = true` and `defaultGstRate = gstRate` (owner types the rate); clearing GSTIN sets them back to false / 0. |
| `importRows` | A | `{ kind: "customers" \| "staff" \| "menuItems" \| "vendors", rows: object[] }` (parsed from Excel on the client, max 500 rows/call) | `{ created, skipped: [{ row, reason: {te,en} }] }` — duplicates by phone (customers/staff/vendors) or name (menuItems) are skipped |

## Menus, quotations, invoices, payments
| callable | roles | request | response |
|---|---|---|---|
| `quoteMenu` | A M | `{ menuPackageId, plates, servingBoys, transport, replacements: string[], extras: [{key, qty, price?}], discount? }` | `Quote` from calc §11 (gstRate taken from settings) + `{ priceReviewDue: boolean }` |
| `saveQuotation` | A M | `{ quotationId?, customerId, bookingId?, menuPackageId, selections: number[] /* chosen option index per group */, quote: <quoteMenu request>, validDays?: 15, notes? }` | `{ quotationId, quotationNumber }` — totals recomputed on the server |
| `generateInvoiceFromBooking` | A M | `{ bookingId }` | `{ invoiceId, invoiceNumber }` — line items from the booking's quotation/menuSnapshot; totals §1 |
| `recordPayment` | A M | `{ invoiceId, amount, method: "Cash"\|"UPI"\|"BankTransfer"\|"Card"\|"Other", date, note? }` | `{ newPaid, newBalance, status }` — one transaction (§2) |
| `refundOrAdjust` | A | `{ invoiceId, amount, reason }` | `{ newPaid, newBalance, status }` (stored as a negative payment with `type: "refund"`) |

Numbering: `SC-Q-YYYY-0001`, `SC-INV-YYYY-0001` (per calendar year, counter doc `counters/{kind}-{year}` in a transaction).

## Kitchen
| callable | roles | request | response |
|---|---|---|---|
| `saveCookLog` | A M S(assigned) | `{ bookingId, guestCountActual?, entries: [{ dishId, cooked, leftover }] }` | `{ updatedDishes: [{dishId, learned}] }` — writes `bookings/{id}/cookLog`, recomputes `dishes/{id}.learned` (§5) |
| `cookingPlan` | A M S | `{ guests, eventTypeCode, dishIds?: string[], menuPackageId? }` | `{ items: [{ dishId, nameTe, nameEn, unit, quantity, learnedPer100, changePct, advice, eventsUsed }] }` |
| `groceryList` | A M S | `{ guests, eventTypeCode }` | `{ items: [{ groceryItemId, nameTe, nameEn, unit, quantity, inStock, toBuy }] }` |

## Staff
| callable | roles | request | response |
|---|---|---|---|
| `markAttendance` | A M; S own only | `{ staffId, date, hours, status, bookingId? }` | `{ pay }` — §7 for `payType: "daily"`, 0 for monthly staff (paid by `monthPayroll`) |
| `monthPayroll` | A | `{ month: "YYYY-MM" }` | `{ rows: [{ staffId, name, payType, gross, cut, ot, advances, net }] }` — §7 / §7b with `settings.monthlyPayRules` |

`staff` gains `payType: "daily" | "monthly"`, `monthlySalary` (monthly staff), `dailyWage` (daily staff).

## Targets & reports
| callable | roles | request | response |
|---|---|---|---|
| `setYearTarget` | A | `{ year, yearTarget, profitMarginPct?, weights? }` | `{ months }` — replan §4 with the year's finished months |
| `getTargetBoard` | A, M, S (role-filtered on the server — Round 11) | `{ month: "YYYY-MM" }` | `{ yearTarget, yearActual, monthTarget, monthActual, profitTarget, profitActual, events, bookings, daysLeft, dailyNeeded, hitTarget: boolean, percentOnly: boolean }` |
| `getPnl` | A | `{ period: "day"\|"week"\|"month"\|"3m"\|"6m"\|"12m" }` | `{ range, income, food, labour, other, ads, profit, marginPct, primeCost, breakEven, leaks: [{te,en,amount}] , series: [{label, income, profit}] }` |

`dailyStats` / `monthlyStats` are maintained by Firestore triggers on `invoices`, `invoices/*/payments`,
`expenses`, `purchases`, `adSpend`, `attendance` (recompute the affected day/month; idempotent).

## Agents & messages
| callable | roles | request | response |
|---|---|---|---|
| `setAgentEnabled` | A | `{ agentId, enabled }` | `{ ok }` |
| `approveMessage` | A | `{ messageId }` | `{ status }` — for outbox items in `needs-approval` |
| `runAgentNow` | A | `{ agentId }` | `{ runId }` |

Agent ids: `morningSummary`, `duesCollector`, `enquiryFollowup`, `eventReadiness`, `cookingLearner`,
`stockWatch`, `priceWatch`, `targetPlanner`, `adsAnalyst`, `feedbackReviews`, `backup`, `menuPriceReview`, `integrityCheck`.
WhatsApp sending goes through `functions/src/integrations/whatsapp.ts`, an adapter that does nothing
but mark messages `queued` until `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` secrets are set. Only customers
with `whatsappOptIn == true` are messaged; money-related or first-contact messages need owner approval.

## Decisions after the first build round (binding)
1. **Menu groups shape in Firestore:** Firestore cannot store an array inside an array, so
   `menuPackages/{id}.groups` is `[{ options: [{ te, en }] }]`. Seed JSON keeps the plain nested list;
   whoever writes it to Firestore converts it. `selections[i]` = chosen option index in `groups[i].options`.
2. **Transport:** `transportCharged: boolean` (true = transport is charged extra, entered per quote).
   The seed's `transportExtra: true` maps to `transportCharged: true`.
3. **Monthly pay rules:** `settings/business.monthlyPayRules = { deductAbsences: boolean, freeLeaves: number,
   overtime: boolean }` — the same shape as calc `MonthlyPayRules`; owner default
   `{ deductAbsences: false, freeLeaves: 0, overtime: false }`. Advances are always deducted.
4. **`docTitle`** on quotations/invoices is written by the server: "Invoice" / "Tax Invoice" (GST registered).
   Clients fall back to settings.gstRegistered if missing.
5. **getTargetBoard** `events`/`bookings` = `{ actual: number, target: number | null }`; when
   `percentOnly` is true all rupee fields are `null` and `incomePct`, `profitPct` (0–100+, 1 decimal) are filled.
6. **getPnl** `primeCost = { pct, band }`; `range = { start: ISO, end: ISO }`; `breakEven` rupees or null.
7. **saveBusinessSettings** response `setupProgress = { business, bank, signature, staff, photos: boolean, pct: number }`.
8. **importRows** skip row numbers are 1-based data rows (header not counted).
9. `adjustStock` moves to region asia-south1 with everything else.
10. **Payment status** is stored as `PartiallyPaid` (no space) and `Paid`, matching Android `InvoiceStatus`.
11. **No top-level `payments` mirror**: payments live only in `invoices/{id}/payments`; read them with a
    collection-group query (index on `payments.date`, COLLECTION_GROUP scope).
12. Extra fields the backend accepts/returns: getPnl `collected`; quoteMenu `gstRate`; saveBusinessSettings
    `ownerPhone`, `fixedMonthlyCosts`, `googleReviewUrl`, `priceRiseAlertPct`, `photoUrls`, `monthlyPayRules`;
    importRows optional `branchId`; getTargetBoard `yearPct`; targets/{year} optional `eventTargets[12]`, `bookingTargets[12]`.
13. If a menu has `transportCharged: false`, a transport amount above 0 is rejected (transport is inside the plate price).

## Manual and automatic mode (owner request, Nov 2026 — binding)
Every computed money/quantity value can be **automatic** (server calculates — default) or **manual**
(a person types the value). Everyone who can see the document sees which one it is.
- Settings `settings/business.calcModes = { quotation, invoice, attendancePay, payroll, cooking, targets }`,
  each `"auto" | "manual"`, default `"auto"`; `managerCanOverride: boolean` (default true). Staff can never override.
- Per-document override at any time, even in auto mode: callables `saveQuotation`, `generateInvoiceFromBooking`
  (and new `overrideInvoiceTotal { invoiceId, total, reason }`), `markAttendance` (`manualPay`), `monthPayroll`
  → new `overridePayrollRow { month, staffId, net, reason }`, `cookingPlan` result can be saved per event with
  manual quantities via new `saveCookingPlan { bookingId, items: [{ dishId, quantity, manual: boolean }] }`,
  `setYearTarget` (`manualMonths[12]` → targets mode manual: the target planner agent does not re-plan).
  Request field: `manual: { <value fields>, reason: string (required, ≥ 3 chars) }`.
- The server still validates manual values (≥ 0; an invoice total can't go below the amount already paid) and
  stores: `calcMode: "auto" | "manual"`, `autoValue` (what the system calculated, kept for comparison),
  `overriddenBy` (uid + name), `overriddenAt`, `overrideReason`, and writes an `auditLog` entry.
- Payments: the amount is always typed by hand; payment status (Paid / PartiallyPaid) stays automatic.
- UI: a chip on every such value — `ఆటోమేటిక్` (green) or `మాన్యువల్ · <name>` (gold outline) — tap to see
  the automatic value, the difference and the reason. A "Switch to automatic" action restores `autoValue`.

## Refresh (owner request — binding)
Every list and detail screen has a **Refresh** button (web: icon button in the page header; Android: refresh icon
in the top bar plus pull-to-refresh). It re-reads from the server (Android `Source.SERVER`, web `getDocsFromServer`)
and re-calls the screen's callables, then shows `చివరి update: hh:mm`. Offline: show a Telugu message, keep cached data.

## Manager uploads (owner request — binding)
Managers may upload images: bill photos (`expenses/{branchId}/…`, `purchases/{branchId}/…`), food/gallery photos
(`gallery/…`), menu photos (`menus/…`). Logo and the owner's signature (`settings/…`) stay owner-only.

### Switching back to automatic (binding, 5 Nov 2026)
- `saveQuotation`: send again without `manual`.
- `overrideInvoiceTotal { invoiceId, auto: true }`, `overridePayrollRow { month, staffId, auto: true }`.
- `markAttendance`: send again without `manual` (admin/manager).
- `saveCookingPlan`: item with `manual: false`.
- `setYearTarget { year, yearTarget, manualMonths: (number | null)[12], manual: { reason } }`: a number = typed by
  hand for that month; `null` = automatic for that month. Null months share `yearTarget − Σ typed months`
  (never below 0) by season weight (calc `allocate`). All 12 null (or no `manualMonths`) = fully automatic.
  `targets/{year}.manualMonths` stores the array with its nulls; each month row carries `calcMode` + `autoValue`.
  Clients send the full array (existing typed months kept), not just the one month they changed.

### Fixes after the contract audit (binding, 5 Nov 2026)
1. **Owner access:** a user with `role == "admin"` passes `requireActiveUser` even if `active` is false (same as the rules).
   Other roles still need `active == true`.
2. **Manual mode never blocks normal work:** when an area is set to `"manual"` in settings and a call has no
   `manual` value, the server saves the automatic value as usual (it does not reject). Clients open the manual
   entry by default in that mode. (Attendance marks, invoice generation, target saves keep working.)
3. **saveQuotation update** (`quotationId` given): fields not sent (`notes`, `validDays`/`validUntil`, `bookingId`)
   keep their stored values. `validDays` 1–90; clients limit the input to 90.
4. **setYearTarget:** `profitMarginPct` / `weights` not sent → keep the year's stored values (settings only for a new
   year). `manualMonths` not sent → keep the stored typed months; send 12 nulls to make the year fully automatic.
5. **getTargetBoard** month stamp fields are `monthCalcMode`, `monthAutoValue` (clients read these names).
6. **Quotations** store the request as `quoteInput` (clients read `quoteInput`).
7. **agentSettings.enabled:** missing = on. Clients show `enabled !== false` as on.
8. **bookings.eventTypeCode** (`wedding|annadanam|housewarming|office|other`) is chosen in the booking form on
   both clients (default `wedding`).
9. **branchId for imports / booking-less quotations:** clients send the currently selected `branchId`; if the server
   would stamp an empty branchId it rejects with a Telugu message instead.
10. Web `runAgentNow` client timeout 540 s.

## Round 6 — owner asked for all three ideas (binding, 5 Nov 2026 afternoon)

### A. Event stock deduction ("event పూర్తయితే stock దానంతట అదే తగ్గడం")
- `groceryItems/{id}.inventoryItemId` links a grocery item to a stock item (`inventory/{id}`, field
  `quantityInStock`). Unlinked grocery items are skipped (listed as `skipped`).
- Settings `settings/business.autoStockDeduct: boolean` (default **true**).
- Trigger: when a booking's status becomes `Completed` and `stockDeduction` is absent (or reversed), and
  autoStockDeduct is on → quantities = calc §6 `groceryFor(eventTypeCode, guests)` with
  guests = `guestCountActual || guestCountConfirmed || guestCount`. For each linked item write an OUT movement
  (same path/shape as `adjustStock`, reason `event`, `bookingId`); stock never goes below 0 — the missing part is
  recorded as `shortBy`. Store 🔒 `bookings/{id}.stockDeduction = { at, by: "auto" | {uid,name}, calcMode,
  items: [{ groceryItemId, inventoryItemId, nameTe, nameEn, unit, quantity, autoValue, shortBy }], skipped: [...],
  reversed: false }`. Idempotent: never deducts twice.
- Callables: `applyEventStock { bookingId, items?: [{ groceryItemId, quantity }], reason? }` (A, M) — run now
  (auto off / after reverse); `items` = manual quantities (manual/automatic mode rules, reason ≥ 3 chars);
  `reverseEventStock { bookingId, reason }` (A) — IN movements back, `reversed: true`.

### B. Change history ("ప్రతి మార్పుకి history")
- Firestore triggers on create/update/delete of: bookings, quotations, invoices, invoices/*/payments, customers,
  leads, expenses, purchases, menuPackages, staff, inventory, settings/business, targets, attendance.
  Each writes `auditLog/{id}` 🔒: `{ kind: "change", collection, docId, path, action: "create"|"update"|"delete",
  changed: string[] (top-level fields, ignoring updatedAt/lastUpdated), diff: { field: { before, after } } — only
  numbers, booleans and strings ≤ 200 chars, max 20 fields, by: uid | "system", byName?, at, branchId }`.
  Override entries already written keep `kind: "override"`.
- `by`: the document's `updatedBy` (on update/delete) or `createdBy` (on create); "system" when written by a
  Cloud Function. **Clients write `updatedBy: <uid>` on every direct update** (and `createdBy` on create, as now).
- Read: admin only (rules). New callable `getHistory { collection?, docId?, by?, fromDay?, toDay?, limit ≤ 200,
  startAfter? }` (A) → `{ entries, nextCursor }` with `byName` resolved from users.
- UI: web `/history` (admin) with filters; a "చరిత్ర / History" section on booking, quotation, invoice and
  customer detail (web + Android, admin only). Telugu sentence per entry, e.g.
  `రాము · బుకింగ్ మార్చారు: guests 250 → 300 · 5 Nov 2:30 PM`.

### C. Service timeline ("వడ్డించే సమయం బట్టి staff timeline")
- `bookings.serveTime` "HH:MM" (24h). Default = start of the menu package `deliveryWindow`
  (e.g. "12:00-12:30" → 12:00), else by meal: tiffin 08:00, lunch 12:00, dinner 19:30, other 12:00.
  `bookings.travelMinutes` (default 45), `bookings.mealType` (from the package).
- calc §12 `serviceTimeline(...)` gives the steps; booking detail shows them (web + Android) and the
  `eventReadiness` agent sends them to assigned staff the day before (replacing the fixed timeline).
- Settings `timelineDefaults` may override the minutes in §12 (owner can tune later).
- Callable `getServiceTimeline { bookingId }` (A, M own branch, S assigned) or `{ eventDay, guests, serveTime?, mealType?, travelMinutes? }` (form preview, defaults as above) → `{ steps: [{ key, day, time, te, en, role }], serveTime, travelMinutes, mealType, defaultsUsed }` — the one implementation of §12 for both clients.

### D. Login page in Telugu (web): bilingual with L(te, en), Telugu default.

## Round 7 — top 10 gaps from docs/spec-gap-analysis.md (owner: "do all 10", binding, 5 Nov 2026)
Legal entity: **Suseela Technologies Private Limited**; brand **Suseela Caterings** → `settings/business.legalName`,
`brandName` (shown on invoices/quotations as "Suseela Caterings (a brand of Suseela Technologies Pvt Ltd)" once
incorporation is done — `legalNameOnDocs: boolean`, default false until the owner switches it on).

### R7-1 Every purchase/expense/outside order is tagged to an event or to overhead
`costTarget = { type: "booking", bookingId, sessionId? } | { type: "overhead", centre }`, centre one of
`kitchen-rent | utilities | office | marketing | vehicles | maintenance | general`. Required on create (clients make the
user choose; default = the booking picked on screen, else "general"). Old untagged docs count as overhead "general".
Stats/`bookingCost` include purchases + expenses + accepted outside orders tagged to the booking; getPnl shows overhead
by centre; event profit = contribution (spec "net after overhead allocation" is deferred).

### R7-2 No direct stock edits
Clients never write `inventory.quantityInStock` (rules lock it; item metadata stays editable). All changes via
`adjustStock` (manual counts must give a reason: "count", "damage", "return", "correction"). Purchases: a trigger on
`purchases` computes the stock delta between old and new lines that carry `inventoryItemId` and writes IN/OUT
movements (idempotent: `purchase.stockApplied = { [inventoryItemId]: qty }`); editing or cancelling a purchase reverses
its stock. Clients stop calling adjustStock for purchase stock-IN (no double counting). Negative stock: never (clamp + shortBy as today).

### R7-3 Cancel/archive instead of hard delete
No client `delete` on: customers, leads, bookings, quotations, invoices, payments, purchases, expenses, outsideOrders,
staff, attendance, inventory, vendors, menuPackages, menuItems, dishes, groceryItems, equipment, vehicles.
Instead: transactional docs get `status: "Cancelled"` + `cancelReason` (≥ 3 chars) + `cancelledBy` + `cancelledAt`;
master data gets `archived: true` + same fields. Lists hide cancelled/archived by default with a "రద్దైనవి చూపించు" toggle.
Cancelled docs are excluded from stats. Callable `cancelRecord { collection, id, reason }` (A; M for bookings/leads/
purchases/expenses of own branch) does it server-side and reverses stock where relevant.

### R7-4 Vessels/equipment and vehicles screens (backend exists: equipment, equipmentMoves, vehicles, vehicleTrips)
Equipment: name (te/en), kind `own | rented`, unit, qtyOwned, rentalVendor/rate. Moves: `issue` to booking(/session),
`return`, `damaged`, `lost` with qty and note; outstanding per booking = issued − returned − damaged − lost; rented items
cost = qty × rate × days. Vehicles: number, type, driver, insuranceExpiry, fitnessExpiry, pollutionExpiry,
driverLicenseExpiry (alerts 30/7 days before via stockWatch/morningSummary). Trips: booking, date, kmStart, kmEnd,
fuelCost, ratePerKm (rented vehicles). Screens on web + Android.

### R7-5 Meal sessions inside a booking (lightweight)
`bookings.sessions[]` = `{ id, nameTe, nameEn, date, serveTime, mealType, packageId, guests, guestCountConfirmed,
guestCountActual, travelMinutes, status }` (status `planned | done | cancelled`). If a booking has sessions, its
`guestCount` = Σ session guests (server keeps it in sync) and date = earliest session date. Per session: quote
(saveQuotation accepts `sessions: [{ sessionId, menuPackageId, selections, quote }]` → one quotation with line items
labelled by session), timeline (`getServiceTimeline { bookingId, sessionId }`), cooking/grocery (inputs from the session),
stock deduction (Σ over sessions on booking Completed), costs (`costTarget.sessionId`). Bookings without sessions keep working as today.

### R7-6 Outside orders as real orders
Collection `outsideOrders`: `{ bookingId, sessionId?, vendorId?, vendorName, item (Pulka, Rumali Roti, Bobbatlu, Ice
Cream, Paan, …), unit, rate, orderedQty, deliveredQty, acceptedQty, returnedQty, rejectReason, advancePaid, status
(ordered | delivered | settled | cancelled), costTarget }` 🔒 `amountDue = round2(acceptedQty × rate − advancePaid − paid)`.
Cost to the event = acceptedQty × rate. Callables `saveOutsideOrder`, `recordOutsideDelivery { id, deliveredQty,
acceptedQty, returnedQty, rejectReason }`. The old "Outside Purchase" expense section stays readable but new entries go here.

### R7-7 During-event extras and live guest count → final invoice
`bookings/{id}/guestLog/{autoId}` `{ sessionId?, count, at, by, note }` via callable `logGuestCount` (A, M, assigned S);
latest count per session becomes `guestCountActual`. `bookings/{id}/eventExtras/{autoId}` `{ sessionId?, item, qty, rate,
amount, customerApprovedBy (name/phone), addedBy, at, status (pending | approved | rejected) }` via `addEventExtra`
(A, M, assigned S) and `approveEventExtra` (A, M). `generateInvoiceFromBooking` adds approved extras and extra plates
(max(0, guestCountActual − quoted plates) × plate price, per session) as separate labelled lines.

### R7-8 Payment status derived for purchases/expenses/outside orders + vendor dues
`vendorPayments/{id}` `{ vendorId, vendorName, amount, date, method, allocations: [{ collection, id, amount }], note }` via
callable `recordVendorPayment` (A). Server derives each target's `paid`, `balance`, `paymentStatus` (`Unpaid |
PartiallyPaid | Paid`) — one vocabulary everywhere (old free-text statuses mapped once). `getVendorDues { vendorId? }`
(A) → per vendor: bills, paid, outstanding, oldest due date. Screens: vendor dues list + pay dialog (web + Android).

### R7-9 Simple event close
`closeEvent { bookingId, confirm: { vendorBillsEntered: boolean }, overrideReason? }` (A). Server blockers (each shown in
Telugu): vessels outstanding > 0; outside orders not settled; pending extras; attendance not marked for assigned staff on
event day; customer balance > 0 (owner may close with `overrideReason`); vendorBillsEntered false. On close:
`booking.closed = { at, by, profit snapshot (income, costs by type, profit, marginPct) }`; rules then deny client edits to
the booking, its subcollections, and purchases/expenses/outsideOrders tagged to it. `reopenEvent { bookingId, reason }` (A),
audited. Booking status `Closed` follows `Completed`.

### R7-10 Quotation versions + complaints screen
Saving a quotation whose status is Sent/Accepted creates a new version: previous snapshot to
`quotations/{id}/versions/{n}` 🔒, `quotation.version = n+1`; `acceptedVersion` set when status becomes Accepted.
UI: version list, view any version, "this is the version the customer accepted". Complaints (collection exists): list,
add (customer, booking, category food/service/delay/billing/other, severity, description), assign, resolve with
resolution + Telugu reply template, status `open | in-progress | resolved`; web + Android.

## Round 8 — learning recipes from the owner's own data (owner request, binding; spec: calc-spec §13)
- Dish master gets `category`, `variants[]`; menu package options may carry `dishId` + `variantId` + `piecesPerPlate`
  (the seed's "ఇడ్లీ – 3", "పుల్కా – 2" are parsed into piecesPerPlate; owner can edit).
- Cook log v2 (`saveCookLog`): per dish `{ dishId, variantId?, cooked, leftover, ingredients: [{ groceryItemId, used }],
  sharedWith?: [{ bookingId, sessionId?, guests }] }`; optional `sessionId`.
- `dishes/{id}.learned` 🔒 adds `byBand`, `status` (learning|learned), `eventsUsed`; `dishes/{id}.recipe` 🔒
  `{ ingredients: [{ groceryItemId, perUnit, eventsUsed }], typed?: [...] }`; owner may set `typedRecipe` (A).
- New callables: `eventPlan { bookingId, sessionId? }` → dishes (qty, status, advice) + ingredients (needed, stock, toBuy);
  `dayPlan { date, branchId? }` → events of the day, per-dish split per event, combined ingredients, to buy.
  `cookingPlan`/`groceryList` keep working for quick "guests + event type" checks.
- UI (web + Android): Dish master with category/variants and typed starting recipe; cook log entry after the event with
  ingredients used and "shared with" events; Event plan (per booking/session); Day plan (date picker) with print +
  WhatsApp copy; learning badges "నేర్చుకుంటోంది 2/5" / "నేర్చుకున్నది ✓". Sample data stays only in test mode; real
  installs start empty and the owner enters dishes, menus and the first events.
- **Round 8 addition (same day, binding; spec calc-spec §13.5):** `dishes.role` (rice | flavoured-rice | bread |
  tiffin-main | side | sweet | starter | drink | other); booking/session `serviceStyle` (banthi | buffet | other, required
  for plans, shown in the booking form as "బంతి భోజనం / బఫే"); server-computed `comboKey` on each session and stored on
  every cook-log line with band + serviceStyle; `dishes.startRules[]` (admin/manager write); `dishes.learned` 🔒 adds
  `byCell` and per-dimension factors; eventPlan/dayPlan lines return `per100`, `source` (cell|factors|typed|none),
  `matchedEvents`, `why[] {te,en}`. UI shows the why-lines under each dish and a "starting rules" table on the dish page.
- **Round 8 addition 2 (owner: "CRM target ఇచ్చినప్పుడు తెలియాలి"):** every plan number is explained — eventPlan/dayPlan
  show per dish: final qty, the per-100 used, the why-lines (combo, style, size, events matched, typed rule) and the
  ingredient maths (qty × perUnit). When a booking's plan is first available and again the day before (at the existing
  "day before 6 PM" timeline step), the server writes an in-app notification for admin + kitchen manager
  ("రేపటి వంట plan సిద్ధం: 2 events, పులావ్ 41 kg…") with a link to the Day plan. If a plan number changes after a
  menu/guest change, a notification says what changed (old → new).

## Round 9 — order cancellation done properly (owner request 5 Nov 2026, binding)
Builds on R7-3 `cancelRecord` for `bookings`. New callable `cancelBooking { bookingId, reasonCode, reason, advance, refundAmount?, refundMethod?, notifyCustomer }`
(admin, or manager of the branch; closed events must be reopened first):
- `reasonCode`: `customer-cancelled | postponed-no-date | price | went-elsewhere | event-called-off | our-side | other`
  (Telugu labels: కస్టమర్ రద్దు చేశారు / వాయిదా — తేదీ లేదు / ధర ఎక్కువ / వేరే వాళ్ళకి ఇచ్చారు / శుభకార్యం జరగట్లేదు / మా వైపు సమస్య / ఇతర); `reason` text ≥ 3 letters.
- `advance` (only when the customer has paid): `refund-all | refund-part | keep` →
  refund = negative payment on the booking's invoice (method required, ₹0.01 ≤ refund ≤ paid); what is kept becomes
  `cancellationCharge` (income, counted in stats/targets as "రద్దు చార్జీ", not as event revenue). Invoice → status
  `Cancelled` with a final line "రద్దు చార్జీ ₹X" when X > 0, balance 0. Paid nothing → no money step.
- Side effects in one go: booking `status: Cancelled`, `cancel {reasonCode, reason, by, at, refund, charge}`;
  quotations of the booking → `Cancelled` (accepted version kept for history); event stock returned (existing);
  staff assignments, equipment moves not yet issued, planned vehicle trips released (equipment already issued must be
  returned first → blocker in Telugu); kitchen plan/dayPlan drop it and a "plan మారింది" notification is sent;
  purchases/expenses already tagged to the booking stay as a loss on that event ("రద్దైన event ఖర్చు") in stats;
  reminders/agents skip it; target "booked" figures drop it.
- `notifyCustomer`: returns a Telugu message (WhatsApp copy/share, not auto-sent) with refund amount if any.
- **Undo** `restoreBooking { bookingId, reason }` (admin only): back to `previousStatus` when the date is today or later;
  refunds are not reversed (record a new payment); stock deduction not re-applied until completion.
- **Postpone instead of cancel**: booking form "తేదీ మార్చు" keeps everything, logs old → new date in history, re-runs
  timeline/plan, and notifies.
- Lists: filter "రద్దైనవి"; dashboard card "ఈ నెల రద్దులు: N, తిరిగి ఇచ్చింది ₹A, ఉంచుకున్నది ₹B"; reasons report.
UI (web + Android): one "ఆర్డర్ రద్దు" dialog — reason chips, note, advance step (shows paid amount, three choices,
refund amount + method), "కస్టమర్‌కి సందేశం" toggle, summary before confirm ("₹5,000 తిరిగి, ₹2,000 ఉంచుకున్నాం,
3 staff, 1 vehicle free"). Cancelled bookings show a red band with reason, who, when, money.

## Round 10 — close every gap from the 5 Nov evening audit (checklist section S; owner: "ఏ point మిస్ అవ్వకూడదు")
Binding. Server owns all maths/money; clients show server values. Telugu first. Refresh on every page.
- **R10-1 Staff advances (H3):** `staffAdvances/{id} { staffId, amount>0, date, note, recoverMonth (YYYY-MM, default next month), branchId, createdBy, status Open|Recovered|Cancelled }`; admin/manager create via callable `addStaffAdvance` (and cancel via cancelRecord). Payroll (already reads staffAdvances) deducts open advances of that month, capped at the pay (rest carries to next month), marks Recovered with the payslip id. New expense category "Staff Advance" is no longer offered; old ones stay. UI web + Android: advance entry on the staff page + list with balance; payslip shows "అడ్వాన్స్ కోత ₹X".
- **R10-2 Shifts, tasks, performance (H4):** `shifts` per booking/session `{ staffId, role (cook/helper/server/driver/supervisor), start, end }` (attendance links to it); `tasks { title, assigneeStaffId|uid, bookingId?, due, status Open|Done, doneAt }` with a "today's tasks" list; `staffRatings { staffId, bookingId, stars 1–5, note, by }` (manager/admin) → monthly average on the staff page (owner sees all, manager own branch, staff only their own tasks/shifts).
- **R10-3 Documents (C3–C5):** web printed invoice shows the UPI QR image (render the server payload with a QR library); Android invoice PDF gets QR, signature image (settings.signatureUrl), brand/legal line when legalNameOnDocs; Android quotation PDF gets business name, phone 9966649469, FSSAI, validity/terms; no tax line when GST is off.
- **R10-4 Suggested price (D11):** callable `suggestPackagePrice { packageId, guests? }` using calc/pricing.ts: plate cost = Σ learned/typed recipe ingredients × latest purchase rate per unit + labour & overhead per plate (from settings), suggested price at target margin (default 30%, settings.targetMarginPct); returns cost, current price, margin %, colour band (red < 15%, amber 15–25%, green ≥ 25%) and missing-rate warnings. Web menu packages page + Android read-only.
- **R10-5 Settings fields:** `fixedMonthlyCosts { kitchenRent 53000, other }` (break-even uses it), `googleReviewUrl`, `vendorPriceAlertPct` (default 5), `targetMarginPct` (30), `signatureUrl`, `whatsappTemplates { messageType: templateName }`.
- **R10-6 Vendor price comparison (G7):** callable `vendorPriceComparison { groceryItemId? }` → last rate per vendor (date), cheapest marked, change vs previous; web screen + Android read-only.
- **R10-7 Customer statement + lead convert (I1):** callable `customerStatement { customerId, from?, to? }` → bookings, invoices, payments, refunds, cancellation charges, running balance; print + WhatsApp copy (web + Android). Web lead page "కస్టమర్‌గా మార్చు" (same as Android: creates/links customer, keeps lead history).
- **R10-8 WhatsApp (I3):** `whatsappOptIn` tick on customer forms (web + Android) with date + who; agents send `sendAs: "template"` with settings.whatsappTemplates[type]; plain text only when the customer wrote in the last 24 h; missing template → message held as "template కావాలి" in the approvals list.
- **R10-9 Import (K4):** web import accepts .xlsx (SheetJS) as well as CSV, same validation as Android.
- **R10-10 Android owner views:** cancellations card + report (getCancellationReport), P&L (getPnl), year targets view, history filters — owner only.
- **R10-11 Kids plates & special meals (D9):** per package `kidsPrice` (owner sets; empty = not offered); booking/session `kidsCount`; `specialMeals[] { type (no-onion-garlic | jain | allergy | diabetic | other), count, note }` → quotation lines (kids at kidsPrice; special meals at package price unless owner sets extra), and they appear in eventPlan/dayPlan as tagged counts with the kitchen note.
- **R10-12 Lunch boxes (D10, sales from Jan 2027):** product `lunchBoxes`: `lunchBoxOrders { customerId (company/person), date or recurring days Mon–Sat, count, menuOptionIds, deliveryAddress, deliveryTime, pricePerBox (default settings.lunchBoxPrice 170), status }`; dayPlan includes them as an "event"; monthly invoice per customer (callable `invoiceLunchBoxes { customerId, month }`); web screens + Android list/delivery tick.
- **R10-13 Content plan (F4):** `contentPlan { date, platform (Instagram|Facebook|WhatsApp status|YouTube|Google), idea, owner, status Idea|Ready|Posted, link }` web calendar/list + Android list.
- **R10-14 Web speed (M4):** lazy-load routes, check bundle sizes, Lighthouse on the built app (record scores in docs/web-notes.md).
- **R10-15 Small:** web Notifications page Refresh button; DEPLOY-STEPS test counts updated.
- Waiting on the owner (not in this round): F3 ads spend import (needs Meta/Google API access), Blaze/deploy, FSSAI, photos, keystore backup, package name, WhatsApp number/API.

## Round 11 — Target Board first for everyone
Owner request (5 Nov 2026, binding): "the Target Board must be at the start, and visible to everyone."
- **First screen:** after login web opens `/targets/board` (`/` and unknown paths redirect there); Android start
  destination is `target-board`. Admin, manager and staff. The dashboard stays one tap away (button on the board for
  admin / manager; menu item for everyone).
- **`getTargetBoard { month: "YYYY-MM" }` — roles A, M, S.** Built in `functions/src/targets/boardView.ts` from the
  stored plan with the existing §4 / §4b maths (`replanWithManual`, `dailyNeeded`, `profitTarget`, `percentOf`; no new
  formulas) and filtered by role on the server (`filterBoard`, unit-tested in `test/round11.test.ts`):
  - always: `year, month, yearPct, incomePct, todayPct, todayHit, daysLeft, hitTarget, aheadStatus
    ("ahead" | "behind" | "onTrack", sign of §4 aheadOrBehind), events, bookings, monthCalcMode, percentOnly, showProfit,
    generatedAt (ISO)`;
  - ₹ sales (`yearTarget, yearActual, monthTarget, monthActual, monthAutoValue, todayTarget, todayActual, dailyNeeded,
    aheadOrBehind`): admin always; manager / staff only when `settings.targetBoardShowRupeesToAll` is true, else null
    and `percentOnly: true`;
  - profit (`profitTarget, profitActual, profitPct`): admin only, always — null for manager / staff (A2).
  - `todayTarget` = `dailyNeeded(monthTarget, monthActual − todayActual, daysLeft)` (what was needed per day when
    today started; current month only, else null); `todayActual` = `dailyStats/{today}.income`.
- **Setting `targetBoardShowRupeesToAll`** (boolean, default false) on `settings/business`, saved only through
  `saveBusinessSettings` (admin). Web Settings: "అందరికీ ₹ చూపించు".
- **No firestore.rules change:** the board reads `targets`, `monthlyStats`, `dailyStats`, `settings` with the Admin
  SDK inside the callable; those docs stay admin-only for direct reads.

## Module 1a — lead pipeline + auto-assign (binding, 18 Nov 2026)

Owner decision: build the whole spec + a Smart-CRM-style lead layer, one module at a time (docs/ROADMAP-full-spec.md). This is the first slice.

### Stages (`leads/{id}.status`)
`new → assigned → contacted → requirement → tasting → qualified → quoted → won`, closed: `lost`, `duplicate`, `invalid`.
Spec names: quoted = Quotation Ready, won = Converted; `tasting` is our own stage. Old leads keep working. Clients may change `status` (rules enum); "open" = not won / lost / duplicate / invalid.

### Server-only lead fields
`assignedTo` (uid, "" = nobody), `assignedName`, `assignedAt`, `assignedBy` ("auto" or a uid), `assignedVia` ("rule" | "roundRobin" | "manual"). Rules reject any client write of these.

### settings/business.leadAssign (saveBusinessSettings, admin)
`{ auto: boolean, mode: "roundRobin" | "rules", pool: uid[], rules: [{ source, uid }] }` — default `{ auto: false, mode: "roundRobin", pool: [], rules: [] }`. One rule per source. Turning auto on with nobody picked is rejected.
Turn state: `settings/leadAssignState.lastUid` (server-written).

### Functions
- `assignOnLeadCreate` (trigger, leads/{id} created): when auto is on and the lead is new, live and unassigned → pick (source rule first in "rules" mode, else next in `pool` after lastUid; only active admins / managers; a manager only for their own branch) → set the server fields, `status: "assigned"`, notification to that person (`recipientUids`). A rule pick does not use up a turn.
- `assignLead { leadId, uid }` (admin, manager of the lead's branch): uid "" takes it back. new ↔ assigned follows; later stages never move back. Audit entry + notification.
- `leadAssignees {}` (admin, manager) → `{ people: [{ uid, name, role, branchId }] }`.

### Not in this slice (next slices of Module 1)
15-minute TAT + escalation, reminders on a lead, CSV import for leads, HOT/WARM/COLD score, lead chat, phone board screen and phone assignee picker, rules by event type / area (the lead has no such fields yet), WhatsApp / dialer / Meta-Google lead sources (need outside accounts).

## Module 1b — first-response rule (TAT) + escalation (binding, 18 Nov 2026)

### settings/business.leadTat (saveBusinessSettings, admin)
`{ on: boolean, minutes: 5–1440 whole number, escalate: boolean }` — default `{ on: true, minutes: 15, escalate: true }`.

### Server-only lead fields
`firstResponseAt`, `firstResponseBy`, `tatAlertAt`, `tatEscalatedAt`. Rules reject client writes.

### Functions
- `stampLeadFirstResponse` (trigger, leads/{id} written): the first time a lead is in any status other than new / assigned → `firstResponseAt` (server time) + `firstResponseBy` (= updatedBy). Stamped once.
- `leadTatWatch` (every 5 minutes): for leads still new / assigned, not cancelled, created within the last 24 h:
  - age ≥ minutes and no alert yet → notification `leadTatLate` to the assignee (`recipientUids`), or to admins + managers when unassigned; sets `tatAlertAt`.
  - age ≥ 2 × minutes, `escalate` on, not escalated → notification `leadTatEscalated` to admins; sets `tatEscalatedAt`. A missed first alert goes straight to this one; never both in one run.
- Clients show "N min late" from `createdAt` + settings (same rule, `leadMinutesLate`); they never write the stamps.

### Not done here
WhatsApp / push delivery of these alerts (in-app notifications only until the WhatsApp number and phone push are set up); per-lead follow-up time of day; snooze.

## Module 1c — lead import, duplicate warning, HOT / WARM / COLD (binding, 18 Nov 2026)

### importRows { kind: "leads", rows, branchId } (admin)
Columns (English or Telugu headers): name, phone, source, eventDate, guests, budget, followUpDate, campaignId, whatsappOptIn. A branch is required. Dates: `2026-12-05`, `05/12/2026`, `05-12-2026` (day first). Unknown source → "other". Rows with no name, a bad phone, a bad date or a bad number are skipped with a reason; a phone that already has a lead is skipped. Created leads get `status: "new"` and server-only `imported: true`: they are auto-assigned when that is on, but get no "assigned to you" notification each and no 15-minute alert.

### HOT / WARM / COLD
Rule (functions/src/leads/scoreRules.ts, web copy web/src/modules/leads/leadScore.ts): event date 35 (≤7 days 35, ≤30 28, ≤90 18, later 8, unknown / past 0) · guests 20 (≥500 20, ≥200 15, ≥100 10, else 5) · budget 15 (per plate ≥₹300 15, ≥₹150 10, else 5; 8 when guests unknown) · stage 20 (contacted 6, requirement 10, tasting 14, qualified 16, quoted 20) · source 10 (referral 10, walk-in 8, Google / JustDial 5, Instagram / Facebook 4, other 2). HOT ≥ 60, WARM ≥ 35, else COLD. Closed leads have no score. Calculated when shown (it depends on today's date); nothing is stored.
`leads/{id}.scoreManual`: "" (automatic) | "hot" | "warm" | "cold" — client-writable (rules enum). The automatic points and reasons are still shown.

### Duplicate warning
Web lead form: another live lead with the same last 10 phone digits → warning with "open it". Saving is still allowed (same family, second event). Customers are not checked yet.

## Module 1e — lead notes, team notes ("lead chat"), follow-up time, snooze (binding, 18 Nov 2026)

- `leads/{id}.notes` (≤ 5000, client-writable; the phone app already wrote it) and `leads/{id}.followUpTime` ("HH:MM" 24-hour or "", client-writable, only kept when there is a followUpDate).
- `addLeadComment { leadId, text (1–2000), mentions?: uid[] (≤ 20) }` (admin, manager of the lead's branch) → writes `leads/{id}/comments/{auto}` `{ text, mentions, createdBy, createdByName, createdAt }` and one notification `leadNote` to the mentioned people + the lead's assignee (never the author; only active admins / managers). Returns `{ ok, id, notified }`.
- `leads/{id}/comments`: read admin / manager; no client writes; never edited or deleted.
- Snooze on web = quick buttons that set followUpDate to tomorrow / +3 / +7 days (saved with the form).

## Module 1f — leads report (binding, 18 Nov 2026)

`leadReport { from, to, branchId? }` (admin: chosen branch or all; manager: own branch only). Leads whose `createdAt` falls in the IST days from..to (both included, ≤ 366 days); cancelled / archived leads are left out.
Returns `{ from, to, branchId, limitMinutes, totals, bySource[], byPerson[], response }`:
- counts `{ total, open, won, lost, dropped (duplicate + invalid), conversionPct = won ÷ (total − dropped), 1 decimal, null when 0 }`
- response `{ measured (not imported, has createdAt), answered, inTime (≤ settings.leadTat.minutes), unanswered (still new / assigned), avgMinutes, inTimePct }`; byPerson rows carry their own response; uid "" = unassigned.
No money in this report. Counting is in functions/src/leads/reportRules.ts (tested).

## Module 2a — item-specific pack sizes + other names (binding, 18 Nov 2026)

Spec: CMF 04 Item Master (rule 2: duplicate spellings must not create parallel items) and CMF 06 UOM & Conversion (UOM-02 item-specific conversions).
- `groceryItems/{id}.packs`: `[{ unit, qty }]` — 1 `unit` of THIS item = `qty` of the item's unit (kg / L / pcs). Up to 20; a name with a fixed meaning (kg, g, L, ml, pcs, dozen and their spellings) cannot be a pack; no repeats. Admin-written (rules: list).
- `groceryItems/{id}.aliases`: other names for the same item (already used by the purchase-line matcher). The web form warns when a typed name or alias already belongs to another live item.
- `syncItemPacks` (trigger, groceryItems/{id} written): copies the packs to the linked stock item as `inventory/{id}.packs` in the stock item's unit (kg → g ×1000); when the two units measure different things the stock item's packs are cleared. Also sets `packsFrom`.
- Purchases: a line in a pack unit now goes into stock in the stock unit (`purchaseStockLines` third argument) and gives a rate per item unit (`purchaseRateRows`). Lines in an unknown pack are skipped / kept as a separate rate row exactly as before.
- Engine: functions/src/shared/itemUnits.ts (`itemUnitFactor`, `itemQty`, `itemRate`, `packsInUnit`, `parsePacks`, `duplicateItems`).
Not done yet (rest of Module 2): a UOM master collection with effective dates, conversion snapshot on each purchase line, item SKU codes, yield %, recipe / BOM, batch / expiry, FEFO, stock reservation.

## Module 2b — recipe versions + manager price panel (binding, 18 Nov 2026)

What already existed (Round 8 / 10): a dish has a typed recipe (`typedRecipe[]`: groceryItemId + quantity per 1 unit of the dish), variants with their own typed recipe, ratios learned from cook logs (🔒 `recipe`), and plate cost from recipe × latest purchase rates (`suggestPackagePrice`). So the "recipe / BOM" of the spec is partly there; this slice adds what was missing for CMF 08 REC-01 / rule 3.
- `recordRecipeVersion` (trigger, dishes/{id} written): when the typed recipe (main or a variant's), or the dish unit, really changes → `dishes/{id}/recipeVersions/{0001…}` `{ version, unit, typedRecipe, variants[{ id, nameTe, nameEn, typedRecipe }], changedBy, changedAt }`; the dish gets 🔒 `recipeVersion` and 🔒 `recipeVersionKey`. Reordering lines, renaming, or changing other fields is not a new version. A first empty recipe is not recorded; emptying a recorded one is. Versions are never edited or deleted (rules: read admin / manager, no client write).
- `suggestPackagePrice`: now really admin + manager (owner decision 18 Nov 2026). The server still had an admin-only check that made the manager's price panel fail; removed. P&L stays admin-only.
Still open in Module 2 (spec CMF 08): sub-recipes (gravy, masala as reusable recipes), yield / cleaning-loss % per item, recipe version snapshot on a confirmed quotation / event, chef approval, standard vs estimated vs actual cost kept separately.

## Module 2c — yield / cleaning loss per item (binding, 18 Nov 2026)

- `groceryItems/{id}.yieldPct`: usable share of what is bought, 10–100; null / absent = 100 (no loss). Admin-written (rules: number 10–100).
- Planner (`ingredientTotals` in kitchen/eventPlan.ts): each ingredient row now also returns `yieldPct` and `gross` = needed ÷ yield (kg / L rounded up to 0.1, pcs up to a whole piece); `toBuy` = max(0, gross − inStock). `needed` (usable quantity from recipes / per-100) is unchanged. With no yield on the item nothing changes.
- `suggestPackagePrice`: ingredient `qty` and `cost` use the gross quantity (what is paid for); `usableQty` and `yieldPct` are returned too.
- The owner is told on the form to fill this only when recipe quantities are weights AFTER cleaning; if recipes are in as-bought weights (as the learned ratios from cook logs are), leave it empty — otherwise the loss is counted twice.
- Event stock deduction (§6 per-100 list) is not changed by yield in this slice.
Sub-recipes are still open.

## Module 2d — batches, expiry date, FEFO (binding, 18 Nov 2026)

- `inventory/{id}.trackExpiry` (bool, owner): the item keeps batches. 🔒 `nearestExpiry` (YYYY-MM-DD or ""), 🔒 `batchQty` — server only.
- `inventory/{id}/batches/{batchId}` — server only (rules: read active users, write false): `qty`, `receivedQty`, `expiryDay`, `batchNo`, `reason`, `purchaseId`, `receivedAt`, `lastUsedAt`. The batch id is the id of the IN movement that opened it.
- A batch opens only when an IN movement carries a valid `expiryDay`:
  - `adjustStock` accepts optional `expiryDay`, `batchNo` (IN only; a bad date or a date on OUT → `invalid-argument`).
  - purchase lines may carry `expiryDay`, `batchNo`; the purchase trigger copies the earliest date per stock item onto its IN movement.
- Trigger `applyBatchOnMovement` (every `inventory/{id}/movements/{mid}` create; idempotent through 🔒 `batchApplied` on the movement): stock without a date is used first; when the batches together hold more than `quantityInStock`, the excess is taken from the batches, earliest `expiryDay` first, undated batches last. The movement gets 🔒 `batchesUsed: [{batchId, taken}]`.
- `settings/business.expiryAlert { on: bool, days: 1–90 }` (default on, 7) via `saveBusinessSettings`. Scheduled `expiryWatch` (07:00 IST daily) writes one notification `expiry_<day>` (`kind: "stockExpiry"`, admin + manager) listing expired items and items within `days`.
- Not in this slice: refusing to issue expired stock, per-batch cost, batch screens in the phone app.

## Module 2e — sub-recipes / bases (binding, 18 Nov 2026)

- `dishes/{id}.isSubRecipe` (bool): the dish is a base preparation. `dishes/{id}.subRecipes: [{ dishId, perUnit }]` (max 20): quantity of the base per 1 unit of the dish. Both are owner / manager fields (rules: bool, list).
- Planner (`planForBooking`, `ingredientsForPackage`, so also `suggestPackagePrice`): for every planned dish, each base is opened into grocery items — `perUnit(base) × grocery per unit of the base`, bases inside bases up to 4 levels. A base uses its learned ratios when it has them, otherwise its typed recipe.
- Skipped and never followed: a base that leads back to the dish (loop), a missing / archived dish, a dish not marked `isSubRecipe`.
- Own line + base for the same grocery item: a typed own quantity and the base quantity are added; an own quantity learned from cook logs is not added to — the larger of the two is used.
- Each plan dish carries `bases: [{ dishId, nameTe, nameEn, unit, qty }]` (how much of each base to prepare).
- Recipe versions: `subRecipes` is part of the snapshot and the fingerprint only when the dish has bases (dishes without bases keep their fingerprint).

## Module 2f — packed products (binding, 18 Nov 2026)

- `packedProducts/{id}` and `packedProducts/{id}/runs/{runId}` — server only (rules: read active users, write false).
- `savePackedProduct { id?, branchId?, nameTe, nameEn, netQty, netUnit (g|kg|ml|L|pcs), mrp, shelfLifeDays (1–1095), vegType (veg|nonveg), dateKind (bestBefore|useBy), ingredientsText, allergensText, storageText, nutritionText, dishId, active }` → `{ ok, id }`. Owner / manager. Create also opens `inventory/{itemId}` (`unit: "pcs"`, `category: "Packed"`, `trackExpiry: true`, `quantityInStock: 0`, `packedProductId`) and stores `inventoryItemId`; update keeps the stock item's name in step.
- `recordPacking { productId, packs (whole, 1–100000), packedDay? (today or up to 60 days back), batchNo? }` → `{ ok, runId, batchNo, expiryDay, packedDay, packs, newQuantity }`. Expiry = packed day + shelfLifeDays. Batch number when not given = YYMMDD-run number. One transaction: stock + `movements` doc (`reason: "packed"`, `expiryDay`, `batchNo`, `packedDay`, `packedProductId`) + `runs/{movementId}` (packs, days, batch number, and the MRP / net quantity printed on that batch) + `runCount`, `lastPackedDay`. The batch itself is opened by Module 2d's movement trigger.
- Label (web): built from the product, the run and `settings/business` (name, address, phone, fssaiNumber). `labelGaps` lists what is missing (`must`) and what to confirm (`check`); it is a reminder, not a legal check.

## Module 2g — stock reserved for confirmed events (binding, 18 Nov 2026)

- `settings/business.stockReserve { on: bool, days: 1–90 }` (default on, 30) via `saveBusinessSettings`.
- A booking holds stock when its status is `Confirmed` or `InProgress`, it is not archived, and it has no live `stockDeduction`.
- `recomputeReservations` (hourly job `reservationsHourly`; trigger `reservationsOnBookingChange` when status / eventDate / guests / menu / quotation / sessions change; callable `refreshStockReservations {}` for owner / manager → `{ ok, events, items, short }`): plans each holding booking with an event date from today to today + days, takes `gross` per linked stock item, and shares `quantityInStock` out in event-date order (ties by booking id).
- Writes (server only): `stockReservations/{bookingId} { bookingId, branchId, day, customer, lines: [{ inventoryItemId, name, unit, needed, reserved, short }], itemIds, shortCount, updatedAt }` and 🔒 `inventory/{id}.reservedQty`. Reservations of bookings that no longer hold stock are deleted. `quantityInStock` is never changed.
- `eventPlan` ingredients gain `inventoryItemId`, `reservedOthers`; `toBuy = max(0, gross − (inStock − reserved for other events))`. The day plan (several events together) still uses plain stock.

## Module 2h — units master, conversion snapshot, pack history (binding, 18 Nov 2026)

- Fixed units (always offered, fixed conversion): Kg, Gram, Litre, ML, Piece, Dozen. `settings/business.uomPacks: string[]` (≤ 60 names, 1–30 characters, unique, never a fixed unit) via `saveBusinessSettings`; default = Packet, Box, Bag, Tin, Bottle, Bundle, Crate, Tray, Can, Cylinder, Block. An item's own `purchaseUnits` still win on its purchase line.
- 🔒 `purchases/{id}.stockConversions: [{ inventoryItemId, unit, stockUnit, factor }]` — written by the purchase stock trigger: the conversion each stock line used. On every later run the kept factor is used for the same item + unit + stock unit; today's packs apply only to lines without a kept factor. Kept while the purchase is cancelled. Clients cannot write it (rules).
- `groceryItems/{id}/packHistory/{autoId} { unit, packs, from, changedBy }` — written by `syncItemPacks` whenever the packs (or the unit of an item with packs) change. Rules: read owner / manager, write false.

## Module 2i — standard / estimated / actual cost (binding, 18 Nov 2026)

- Standard: `setStandardCost { packageId, guests? = 100 }` (owner) → `{ ok, packageId, perPlate, foodPerPlate, labourPerPlate, overheadPerPlate, guests }`. Recipes × latest purchase rates + labour / overhead per plate; `failed-precondition` while any ingredient line has no rate. Writes 🔒 `menuPackages/{id}.standardCost` and `menuPackages/{id}/standardCosts/{autoId}` (history, read owner).
- Estimated: trigger `estimateOnConfirm` — when a booking becomes `Confirmed` and has no estimate, writes 🔒 `bookings/{id}.costEstimate { guests, food, labour, overhead, total, perPlate, coveragePct, complete, version, standardPerPlate, packageId, by, at }` and `bookings/{id}/costEstimates/{0001…}` (read owner). Never overwritten by later edits. `refreshCostEstimate { bookingId, reason (≥ 3) }` (owner) adds the next version.
- Actual: `bookings/{id}.costActual` (unchanged, kept by the cost trigger).
- `costComparison { bookingId }` (owner) → `{ guests, standard, estimated, actual: { total, perPlate }, estVsStd, actVsEst: { amount, pct } | null, estVsStdFlag, actVsEstFlag: "over" | "under" | "ok" | null, estimate, actualParts }`. Flags: more than 5 % above = over, more than 5 % below = under. A missing figure stays null.

## Pending list X7–X10 (binding, 18 Nov 2026 night)

- X7: 🔒 `inventory/{id}.expiredQty` — stock in batches whose `expiryDay` is before today; written by `applyBatchOnMovement` and every morning by `expiryWatch` (also when the notice is off). `eventPlan` ingredients gain `expired`; available stock = `quantityInStock − expiredQty` (then minus stock reserved for other events). Reservations share out the same usable stock. Manual stock OUT is not blocked.
- X8: trigger `reservationsDirtyOnStock` sets `settings/reservationState { dirty: true }` when `quantityInStock` or `expiredQty` of any item changes; `reservationsHourly` now runs every 5 minutes and recomputes when dirty or when the last run is an hour old.
- X9: trigger `estimateOnQuotation` writes 🔒 `quotations/{id}.costEstimate { guests, food, labour, overhead, total, perPlate, coveragePct, complete, key, marginPct, at }` — cost of each session's menu at its plates to cook (recipes × latest purchase rates + labour / overhead per plate); `marginPct` = (amount before tax − cost) ÷ amount before tax, null while the cost is incomplete. Recomputed only when the menus or plates change (`key`).
- X10: `leadReminderWatch` (every 5 minutes): for open leads whose `followUpDate` is today and whose `followUpTime` (09:00 when empty) has come, one notification `kind: "leadReminder"` to the assignee (owner + managers when nobody has the lead); 🔒 `leads/{id}.reminderSentFor = "<date> <time>"` so each moment is announced once.

## X5 — selling packed products (binding, 18 Nov 2026 night)

- Product fields added to `savePackedProduct`: `hsn` (4–8 digits or ""), `gstRate` (0–28, default 0), `barcode` (letters / digits / "-", ≤ 32).
- `sellPacked { productId, packs, pricePerPack? (default MRP), method? (Cash | UPI | Card | Bank | Credit, default Cash), customerName?, phone?, saleDay? (today or up to 7 days back) }` (owner / manager) → `{ ok, saleId, saleNumber, amount, taxable, cgst, sgst, tax, gstRate, discountFromMrp, newQuantity }`. Refused: price above MRP; more packs than `quantityInStock − expiredQty`; Credit without a customer name. One transaction: stock, `movements/{saleId}` (`reason: "sold"`), `packedSales/{saleId}`, day counter `counters/packedSale-<day>`. Sale number `PS-YYMMDD-NNN`. The price includes tax; for a GST-registered business with a product rate, taxable = amount × 100 ÷ (100 + rate), half CGST half SGST.
- `cancelPackedSale { saleId, reason (≥ 3) }` (owner) → packs back into stock (`reason: "sold-reversed"`, no batch date), sale `status: "Cancelled"`.
- `packedSales/{id}` — rules: read owner, or manager of the same branch; write false.

## Modules 3–5 — callable index (generated 20 Nov 2026 from `functions/src`; binding names, roles and inputs)
The inputs listed are the fields each function reads from `data` (required ones use `req…`, optional use `opt…` or a default). Exact value shapes: `docs/data-model.md` and the TypeScript types in `web/src/data/functions.ts`. Errors are always `{te, en}`. Job-role limits on top of these levels: `functions/src/roles/callablePerms.ts`. Money and stock are written only by these functions (clients cannot write the server-owned collections — `firestore.rules`).

### Module 3 — purchasing, goods receipt, vendor bills, vendor payments

| Function | Roles | Reads | File |
|---|---|---|---|
| `receiveGoods` | A M | `poId`, `storeId` (optional), `receiveDay`, `lines`… | `functions/src/procure/goodsReceipt.ts` |
| `closePurchaseOrder` | A M | `id`, `reason` | `functions/src/procure/goodsReceipt.ts` |
| `savePurchaseRequest` | A M S | `branchId` | `functions/src/procure/procure.ts` |
| `decidePurchaseRequest` | A M | `id`, `approve`, `reason` | `functions/src/procure/procure.ts` |
| `cancelPurchaseRequest` | A M S | `id`, `reason` | `functions/src/procure/procure.ts` |
| `savePurchaseOrder` | A M | `id`, `branchId` | `functions/src/procure/procure.ts` |
| `decidePurchaseOrder` | A | `id`, `approve`, `reason` | `functions/src/procure/procure.ts` |
| `cancelPurchaseOrder` | A M | `id`, `reason` | `functions/src/procure/procure.ts` |
| `saveVendorBill` | A M | `poId`, `billDay` | `functions/src/procure/vendorBill.ts` |
| `releaseBillHold` | A | `purchaseId`, `reason` | `functions/src/procure/vendorBill.ts` |
| `cancelGoodsReceipt` | A M | `id`, `reason` | `functions/src/procure/vendorBill.ts` |
| `vendorPriceComparison` | A M | `groceryItemId` | `functions/src/vendors/purchaseRates.ts` |
| `recordVendorPayment` | A | `vendorId`, `vendorName`, `amount`, `date`, `method`, `note`, `allocations` | `functions/src/vendors/vendorPayments.ts` |
| `getVendorDues` | A | `vendorId` | `functions/src/vendors/vendorPayments.ts` |
| `migratePaymentStatuses` | A | — | `functions/src/vendors/vendorPayments.ts` |

### Module 4 — ledger, approvals, payroll, roles, settings

| Function | Roles | Reads | File |
|---|---|---|---|
| `ledgerReport` | A | `from`, `to`, `account` | `functions/src/ledger/ledger.ts` |
| `saveJournalEntry` | A | — | `functions/src/ledger/ledger.ts` |
| `cancelJournalEntry` | A | `id`, `reason` | `functions/src/ledger/ledger.ts` |
| `lockPeriod` | A M | `month` | `functions/src/ledger/ledger.ts` |
| `unlockPeriod` | A | `reason` | `functions/src/ledger/ledger.ts` |
| `reconcileStatement` | A | `grid`, `account`, `toleranceDays` | `functions/src/ledger/ledger.ts` |
| `monthCloseCheck` | A | `month` | `functions/src/ledger/ledger.ts` |
| `overheadShare` | A | `month`, `basis`, `active` | `functions/src/ledger/ledger.ts` |
| `addStaffAdvance` | A M | `staffId`, `amount`, `note`, `date`, `recoverMonth` | `functions/src/staff/advances.ts` |
| `listStaffAdvances` | A M S | `staffId` | `functions/src/staff/advances.ts` |
| `finalizePayroll` | A | `month` | `functions/src/staff/advances.ts` |
| `markAttendance` | A M S | `staffId`, `date`, `hours`, `status`, `bookingId`, `shiftId`, `manual` | `functions/src/staff/attendance.ts` |
| `monthPayroll` | A | `month` | `functions/src/staff/attendance.ts` |
| `overridePayrollRow` | A | `month`, `staffId`, `auto`, `net`, `reason` | `functions/src/staff/attendance.ts` |
| `recordSalaryPayment` | A | `month`, `staffId`, `amount`, `date`, `method`, `note` | `functions/src/staff/salaryPay.ts` |
| `cancelSalaryPayment` | A | `id`, `reason` | `functions/src/staff/salaryPay.ts` |
| `saveShift` | A M | `id`, `bookingId`, `sessionId`, `staffId`, `role`, `date`, `startTime`, `endTime`, `note` | `functions/src/staff/shifts.ts` |
| `completeTask` | A M S | `taskId`, `note`, `done` | `functions/src/staff/shifts.ts` |
| `rateStaff` | A M | `staffId`, `bookingId`, `stars`, `note` | `functions/src/staff/shifts.ts` |
| `decideStockAdjust` | A M | `id`, `approve`, `note` | `functions/src/inventory/adjustStock.ts` |
| `adjustStock` | A M S (+ job role) | see file | `functions/src/inventory/adjustStock.ts` |
| `saveBusinessSettings` | A | — | `functions/src/settings/saveBusinessSettings.ts` |
| `generateInvoiceFromBooking` | A M | `bookingId`, `manual` | `functions/src/billing/generateInvoiceFromBooking.ts` |
| `overrideInvoiceTotal` | A M | `invoiceId`, `auto`, `total`, `reason` | `functions/src/billing/overrideInvoiceTotal.ts` |
| `recordPayment` | A M | `invoiceId`, `amount`, `method`, `date`, `note` | `functions/src/billing/recordPayment.ts` |
| `refundOrAdjust` | A | `invoiceId`, `amount`, `reason` | `functions/src/billing/recordPayment.ts` |
| `requestRefund` | A M | `invoiceId`, `amount`, `reason` | `functions/src/billing/refundRequests.ts` |
| `decideRefund` | A | `id`, `approve`, `note` | `functions/src/billing/refundRequests.ts` |

### Module 5 — masters, stores, allergens, food safety, dispatch

| Function | Roles | Reads | File |
|---|---|---|---|
| `saveMaster` | A | `kind`, `id`, `data`, `branchId`, `companyId`, `code` | `functions/src/masters/masters.ts` |
| `setMasterStatus` | A | `kind`, `id`, `status`, `reason` | `functions/src/masters/masters.ts` |
| `setupMasters` | A | `companyId`, `code` | `functions/src/masters/masters.ts` |
| `setBookingBrand` | A M | `bookingId`, `brandId` | `functions/src/masters/org.ts` |
| `brandReport` | A | `from`, `to`, `eventDate` | `functions/src/masters/org.ts` |
| `holdBatch` | A M | `itemId`, `batchId`, `reason` | `functions/src/stock/batchHold.ts` |
| `decideBatchHold` | A M | `itemId`, `batchId`, `decision`, `note` | `functions/src/stock/batchHold.ts` |
| `traceBatch` | A M | `itemId`, `batchId`, `note` | `functions/src/stock/batchHold.ts` |
| `applyEventStock` | A M | `bookingId`, `items`, `reason` | `functions/src/stock/eventStock.ts` |
| `reverseEventStock` | A | `bookingId`, `reason` | `functions/src/stock/eventStock.ts` |
| `refreshStockReservations` | A M | — | `functions/src/stock/reservations.ts` |
| `transferStock` | A M | `itemId`, `fromStoreId`, `toStoreId`, `quantity`, `note` | `functions/src/stock/storeStock.ts` |
| `setItemHomeStore` | A M | `itemId`, `storeId`, `status`, `issueBlocked` | `functions/src/stock/storeStock.ts` |
| `transferToBranch` | A M | `itemId`, `toBranchId`, `quantity`, `note`, `fromStoreId`, `issueBlocked` | `functions/src/stock/storeStock.ts` |
| `setFoodTags` | A M | `kind`, `id` | `functions/src/safety/allergens.ts` |
| `allergenMatrix` | A M | `bookingId` | `functions/src/safety/allergens.ts` |
| `listSafetyChecklists` | A M S | — | `functions/src/safety/safety.ts` |
| `saveSafetyCheck` | A M S | `checklistId`, `note`, `bookingId`, `answers` | `functions/src/safety/safety.ts` |
| `saveSafetyIncident` | A M S | — | `functions/src/safety/safety.ts` |
| `resolveSafetyIncident` | A M | `id`, `resolution` | `functions/src/safety/safety.ts` |
| `saveDispatch` | A M | `bookingId`, `note`, `id`, `sessionId`, `lines` | `functions/src/dispatch/dispatch.ts` |
| `advanceDispatch` | A M S | `id`, `step`, `note`, `vehicleName`, `driverName`, `receiverName`, `receiverPhone`, `loaded`, `delivered`, `returned`, `reasons` | `functions/src/dispatch/dispatch.ts` |
| `cancelDispatch` | A M | `id`, `reason` | `functions/src/dispatch/dispatch.ts` |

### Scheduled / triggers (no client call)

`safetyCheckWatch` (every 15 min, missed food-safety checks → notifications), `poBillRollup` (keeps an order's bill totals), batch / reservation / lead triggers as listed in `docs/backend-notes.md`.
