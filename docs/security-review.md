# Security review — Firestore & Storage rules (2026-11-05)

## ఓనర్ కోసం సారాంశం (Telugu)

- **ఎవరు ఏం చూడొచ్చు:** Owner (admin) అన్నీ చూడొచ్చు, అన్నీ మార్చొచ్చు. Manager తన branch లోని
  bookings, quotations, invoices, customers, leads చూడొచ్చు — కానీ **లాభం, నెల లెక్కలు (P&L),
  targets, ads ఖర్చు, staff advances, payroll కనిపించవు**. Staff కి తనకు assign చేసిన events, తన
  attendance, తన tasks, వంటకాల లిస్ట్ మాత్రమే కనిపిస్తాయి.
- **కొత్తగా sign up చేసినవాళ్లు** మీరు approve చేసే వరకు ఏమీ చూడలేరు (ముందులాగే).
- **డబ్బు లెక్కలు phone / web నుంచి మార్చలేరు:** invoice total, GST, payments, బాకీ, లాభం, targets,
  జీతం (attendance pay) — ఇవన్నీ server (Cloud Functions) మాత్రమే రాస్తుంది. ఎవరైనా app ని
  hack చేసి number మార్చాలని చూసినా Firebase ఒప్పుకోదు.
- **Branch మార్చలేరు:** ఒకసారి ఒక branch లో entry పెడితే, ఆ branch తర్వాత మార్చడం కుదరదు.
- **ఫోటోలు:** staff, manager తమ branch బిల్ ఫోటోలు (5 MB లోపు) upload చేయగలరు. Manager food /
  gallery ఫోటోలు, menu ఫోటోలు కూడా కొత్తగా పెట్టగలరు; మార్చడం / తీసేయడం మీరు (admin) మాత్రమే.
  Logo, signature మీరు మాత్రమే. Backups ఎవరికీ app నుంచి కనిపించవు.
- **ఆటోమేటిక్ / మాన్యువల్:** ఏ లెక్క ఆటోమేటిక్, ఏది చేత్తో మార్చారు (ఎవరు, ఎందుకు, అసలు ఆటో విలువ)
  — ఈ వివరాలు server మాత్రమే రాస్తుంది; document చూడగలిగిన ప్రతి ఒక్కరికీ కనిపిస్తాయి, కానీ app
  నుంచి నేరుగా మార్చలేరు. ఆటో/మాన్యువల్ settings మీరు setup screen (saveBusinessSettings) నుంచి మాత్రమే మార్చగలరు.
- **మార్పుల చరిత్ర (Round 6):** ప్రతి మార్పు ఎవరు చేశారో (`updatedBy`) app తప్పనిసరిగా రాయాలి;
  వేరే వాళ్ల పేరు రాస్తే Firebase ఒప్పుకోదు. History (auditLog) server మాత్రమే రాస్తుంది, మీకు మాత్రమే
  కనిపిస్తుంది. Event పూర్తయినప్పుడు stock తగ్గింపు (`stockDeduction`) కూడా server మాత్రమే రాస్తుంది.
- **Round 7:** ఇకపై app నుంచి ఏదీ పూర్తిగా delete చేయలేరు — "రద్దు" (Cancelled / archived) మాత్రమే, అదీ
  కారణం రాసి server ద్వారా. Stock సంఖ్య app నుంచి నేరుగా మార్చలేరు. ప్రతి కొనుగోలు / ఖర్చు ఏ event కి
  లేదా ఏ overhead కి అన్నది తప్పనిసరి. Event "close" చేశాక ఆ event కి, దాని ఖర్చులకి మార్పులు కుదరవు.
- **Round 8:** వంటకాల "నేర్చుకున్న" లెక్కలు, recipe server మాత్రమే రాస్తుంది. వంటకం role, మొదటి నియమాలు
  (startRules), మీరు రాసే recipe — మీరు, manager మార్చగలరు. బంతి / బఫే manager కూడా ఎంచుకోవచ్చు.
  వంట plan notifications ఎవరికి పంపారో వాళ్లకే కనిపిస్తాయి.
- **మీరు చేయాల్సింది:** ఈ rules deploy చేసే **ముందు** Android / Web లో కింద ఉన్న "Cloud Functions కి
  మార్చాల్సినవి" పూర్తి కావాలి — లేకపోతే ప్రస్తుత app లో invoice తయారు చేయడం, payment
  నమోదు చేయడం, quotation తయారు చేయడం ఆగిపోతాయి. అలాగే staff కి bookings కనిపించాలంటే ప్రతి
  staff login కి ఆ staff record ని link చేయాలి (`staffId`).

---

Files: `firestore.rules`, `storage.rules`, `firestore.indexes.json` (originals in `_backup_2026-11-05/`).
Rules were checked by reading only (no emulator in this environment) — run the emulator suite or a
`firebase deploy --only firestore:rules,storage` from a branch project before production.

## Key concepts

- **Roles**: `users/{uid}.role` ∈ `admin | manager | staff`; `active == false` → pending (own user doc only).
  `isAdmin()` is role-only (unchanged from before, so the owner is never locked out); manager and staff
  must be `active`.
- **Branch scope**: non-admins read/write only documents whose `branchId == users/{uid}.branchId`.
  `branchId` must be present on create and is immutable afterwards, for every client including admin.
  Single exception: admin **backfill** (only `branchId` changes, only where it was missing/blank) so
  `BranchRepository.backfillDefaultBranch` keeps working.
- **Staff ↔ login link**: rules read `users/{uid}.staffId` (= the `staff` doc id whose
  `linkedUserId == uid`). Staff see bookings/tasks where `assignedStaffIds` contains it, and attendance
  where `staffId` equals it.
- **Server-owned fields**: client create/update that sets or changes them is rejected, for admins too
  (Admin SDK in Cloud Functions bypasses rules).
- **Validation** (cheap, only on keys that are written): money ≥ 0, guests int ≥ 1, phone string ≤ 30,
  enums for status/source/unit/eventTypeCode, `createdBy == auth.uid` on create, `createdBy`/`createdAt`
  unchanged on update.
- **Default deny** for every path not listed.

## Access table — Firestore (current, after Round 8)

A = admin, M = manager (active, own branch where the doc has `branchId`), S = staff (active),
"fn" = only through a Cloud Function (client write denied). **No client hard-deletes** except where the
delete column says otherwise (R7-3). "cancel" = `cancelRecord` (status Cancelled / archived + cancel fields).
Every audited client update must carry `updatedBy == caller` (Round 6).

| collection | read | create | update | delete |
|---|---|---|---|---|
| `users/{uid}` | own doc; A all | self only: role `staff`, `active false`, keys name/email/phone/role/active/createdAt/updatedBy | A any (role ∈ admin/manager/staff); self: name, phone, updatedAt | A (login removal) |
| `customers`, `leads` | A, M | A, M (createdBy, enums, guests ≥ 1, budget ≥ 0) | A, M (not cancelled/archived) | no — cancel |
| `complaints` | A; M own branch; creator | A, M own branch; S own branch for an assigned booking, status `open` | A, M own branch (status open/in-progress/resolved) | no |
| `referrals` | A, M | A, M | A, M | no |
| `menuItems`, `menuPackages`, `groceryItems` (+`inventoryItemId`) | all active | A | A (not archived) | no — archive |
| `dishes` | all active | A, M — 🔒 `learned` (incl. byCell), `recipe`; role enum | A, M — same | no — archive |
| `dishes/*/history` | A, M | fn | fn | fn |
| `bookings` | A; M own branch; S assigned | A, M own branch — 🔒 costActual, profitActual, stockDeduction, closed, override + cancel keys; status not Cancelled/Closed | **only while `closed` is absent**: A, M own branch (incl. `sessions[]`, serveTime, travelMinutes, mealType); S assigned: status / notes | no — cancel |
| `bookings/*/cookLog`, `cookingPlan`, `guestLog`, `eventExtras` | same as parent booking | fn | fn | fn |
| `quotations` | A; M own branch | **fn** (saveQuotation) | A, M own branch: status only (no Cancelled) | no |
| `quotations/*/versions` | same as parent quotation | fn | fn | fn |
| `invoices` | A; M own branch | **fn** | A, M own branch: status Draft/Sent/Overdue only | no |
| `invoices/*/payments` (+ collection group) | A; M own branch | **fn** | fn (admin branchId backfill only) | no |
| `staff` | A; M own branch; own record | A | A (branchId immutable, not archived) | no — archive |
| `attendance` | A; M own branch; S own | **fn** (markAttendance) | fn | no |
| `staffAdvances` | A; M own branch; staff own | fn (addStaffAdvance) | fn | no |
| `shifts`, `staffRatings` | A; M own branch; staff own | fn | fn | no |
| `lunchBoxOrders` | A; own branch | A, M own branch — 🔒 deliveries, deliveredBy, invoicing | same; cancel via cancelRecord | no |
| `contentPlan` | A, M | A, M | A, M | A, M |
| `payroll/**` | A | fn | fn | fn |
| `tasks` | A; M own branch; S own (assignee) | A, M own branch (status Open) | A, M — status / doneAt / doneBy / staffNote only via completeTask | no |
| `inventory` | all active | A (quantityInStock absent or 0) | A metadata only — 🔒 quantityInStock (adjustStock / triggers) | no — archive |
| `inventory/*/movements` | all active | **fn** | fn | fn |
| `vendors` | all active | A | A | no — archive |
| `otherPurchaseItems` (name suggestions) | all active | A | A | A |
| `purchases`, `expenses` | A; M own branch; S **own entries only** (createdBy) | A; own branch — `costTarget` required, isDeleted false, 🔒 paid / balance / paymentStatus / stockApplied | A; M own branch; S own entries — not if cancelled, not if `costTarget` (old or new) is a closed booking, isDeleted never changes | no — cancel |
| `outsideOrders`, `vendorPayments` | A; M own branch | **fn** | fn | fn |
| `vehicles` | all active | A, M own branch | A, M own branch | no — archive |
| `vehicleTrips` | A; M own branch; own trips | A, M own branch; S own branch for an assigned booking; booking not closed | A, M own branch; S own trip (same booking); booking not closed | no |
| `equipment` | all active | A, M own branch (kind own/rented, qty/rate ≥ 0) | A, M own branch | no — archive |
| `equipmentMoves` | A; M own branch; S in `assignedStaffIds` (server-copied) | A, M own branch (type issue/return/damaged/lost, qty ≥ 0); booking not closed | same | no |
| `adSpend` | A | A | A | no |
| `targets/{year}` | A | A — 🔒 months, aheadOrBehind, manualMonths, override keys | same | no |
| `monthlyStats`, `dailyStats`, `agentRuns`, `integrityReports`, `messagesOutbox`, `auditLog` | A | fn | fn | fn |
| `notifications` | recipients (role in `audienceRoles` / uid in `recipientUids`) | fn | recipient: add own uid to `readBy` only | fn |
| `settings/business` | A, M | **fn** (saveBusinessSettings) | fn | fn |
| `settings/{other}`, `agentSettings` | A | A | A | A (config) |
| `counters` | nobody | fn | fn | fn |
| `branches` | all active | A | A | no |
| anything else | denied | denied | denied | denied |

## Access table — Storage

| path | read | write |
|---|---|---|
| `expenses/{branchId}/**`, `purchases/{branchId}/**` | A; active users (M, S) of that branch | create: A / active M or S of that branch, image/*, < 5 MB; update/delete: A |
| `purchase_bills/*`, `expense_receipts/*` (legacy, current Android) | active users | create only: active user, image/*, < 10 MB; delete: A |
| `settings/**` (logo, signature) | active users | A only, image/*, < 5 MB |
| `gallery/**` (food photos), `menus/**` (menu photos) | active users | create: A or active M, image/*, < 5 MB; replace (update) / delete: A only |
| `backups/**` | nobody | nobody (backup function uses Admin SDK) |
| anything else | denied | denied |

## Final QA — staff see only their own purchases / expenses

- **Finding**: any staff login could read every purchase / expense of the branch (₹ totals, vendor names).
- **Rule now** (`costDocReadOk`, one role-exclusive expression): admin all; active manager of the branch; staff
  **only entries they created** (`createdBy == uid`). Writes were already own-entry for staff.
- **Client change needed (Android / web staff screens)**: staff lists must query
  `whereEqualTo("createdBy", uid)` (optionally plus `branchId ==`); an unfiltered or branch-only query from a staff
  login is now refused. Staff purchase-history / person-wise / item-wise report screens show only their own bills.
- `customers`: staff get permission-denied — expected (admin / manager only), unchanged.
- Tests: 18 added (own / other's reads, createdBy-filtered vs branch / unfiltered / other-user queries, manager and
  other-branch manager, admin, pending user) — 233 in total.

## Round 10c — cheap denials (instrumented emulator run: 26 denies hit the 1,000 limit)

- **Finding**: the security outcome was right, but 25 booking-update denials and 1 expense-update denial were
  refused by the 1,000-expression limit instead of by logic. The emulator evaluates the **whole** expression tree
  when the answer is deny (no short-circuit), so the full tree must stay small — not only the path taken.
- **Fix (bookings, purchases, expenses)**:
  - Hard stops first: closed / cancelled state, `updatedBy == caller`, and every locked key (branchId, createdBy/At,
    server-owned and cancel keys) in **one inline `ch.hasAny([...])` list literal** — no list-building helper calls.
  - **One role expression**, mutually exclusive by `role` value: admin | active manager of the branch | active
    assigned staff (bookings: status / notes only) or own-entry staff (purchases / expenses).
  - Per-field checks are single inline expressions (`!('k' in ch) || d.k == null || d.k >= 0`) — no per-field
    function calls; non-numbers fail the comparison; optional new fields may be null.
  - Closed-event checks are one compact `costBookingOpen(id)` (exists + get, cached) per id; the costTarget shape
    check is one function; the admin branch backfill is a separate small `kitBackfillOk`.
  - Also fixed on re-read: a manager / staff user **without** a branchId could match a legacy doc with a blank
    branchId in the new update paths — now requires a non-empty branch.
  - Removed now-unused helpers (validCostTarget, costTargetOpen, costDocServerKeys, overheadCentres,
    bookingServerKeys, clientBookingStatuses, uIsAssigned, uIsStaff).
- Customers, leads and lunchBoxOrders stay on the Round 10b kit (their denials did not hit the limit).
- Tests: 10 added (blank-branch manager, admin backfill on bookings / expenses and that it works only once, null
  optional fields, string amounts, staff 12-field booking edit) — 215 in total. Target for the instrumented run:
  zero "maximum of 1000" lines.

## Round 10b — expression-limit refactor (after the Mac emulator run: 194 / 195)

- **Problem found**: a manager booking edit touching many fields hit Firestore's limit of 1,000 evaluated
  expressions per request ("Unable to evaluate the expression…") and was denied. Cause: every per-field helper
  (`okX()`) recomputed `diff()` and every role helper re-read the user doc expression chain.
- **Fix**: a "fast check kit" in `firestore.rules`. The allow line computes the caller's user doc (`me()`, one
  `get`), the new data, the stored doc and the written-key set (`keys().toSet()` on create,
  `diff().affectedKeys()` on update) **once** and passes them down; field checks are grouped and each group runs
  only when one of its keys is written (`!ch.hasAny([...]) || checks`); sessions / specialMeals / serveTime are
  behind their own `in ch` guards. Applied to **bookings, purchases, expenses, customers, leads, lunchBoxOrders**
  (same rules as before, cheaper evaluation). Invoices / quotations were already light (status-only updates).
  Smaller collections keep the simple helpers.
- **Stress tests added** (10): 20-field manager booking edit, 19-field booking create, 11-field staff purchase edit,
  18-field expense create, 15-field manager expense edit, invoice status + updatedAt + updatedBy, 8-field customer,
  lead and lunch-box edits — all must pass — plus one mega-edit that also writes `costActual` (must be denied).
  `tools/rules-test.mjs` now has 205 checks.
- If a future rule pushes a collection close to the limit again, the emulator message names the line; move that
  collection onto the kit the same way.

## Round 10 (api-contract / backend-notes "Round 10")

- **staffAdvances**: server-only writes (`addStaffAdvance`, `cancelRecord`, `finalizePayroll` — status, recovered,
  recoveries, recoveryMonths, recoveredPayslipId / Month). Read: A, M own branch, staff their own (`staffId`).
- **shifts** (`saveShift`) and **staffRatings** (`rateStaff`): server-only writes; read A, M own branch, staff their
  own (query `staffId == myStaffId`). `staff.ratings` (ratingOnWrite) is server-only.
- **tasks**: A / M own branch create (status `Open` only) and edit; `status`, `doneAt`, `doneBy`, `staffNote`,
  `completedAt` change only through `completeTask` — for everyone. Staff read their own (`assigneeStaffId`,
  `assigneeUid`, or older `assignedStaffIds`). **Deletes removed** (cancelRecord), so tasks are no longer on the
  "deletes that remain" list.
- **lunchBoxOrders**: A / M own branch create / edit (status active | paused, count int ≥ 1, pricePerBox ≥ 0);
  `deliveries`, `deliveredBy` and invoicing fields server-only; cancelled only via cancelRecord; branch staff read
  (they tick deliveries through `markLunchBoxDelivered`). Lunch-box invoices are server-created like all invoices.
- **contentPlan**: A / M read / write / delete (plain client data, platform and status enums); staff none.
  **Deletes that remain** now: `users` (A), `otherPurchaseItems` (A), `settings/{other}` and `agentSettings` (A),
  `contentPlan` (A, M).
- **Settings** (fixedMonthlyCosts map, vendorPriceAlertPct, targetMarginPct, labourPerPlate, overheadPerPlate,
  lunchBoxPrice, whatsappTemplates, googleReviewUrl, signatureUrl): `settings/business` stays saveBusinessSettings
  only. Residual: managers can read `settings/business`, so they see targetMarginPct / labour / overhead per plate
  (rules cannot hide single fields — move them to an admin-only doc if that matters).
- **menuPackages.kidsPrice** ≥ 0 (admin); **bookings.kidsCount** int ≥ 0 and **specialMeals[]** (list ≤ 10, first
  item type ∈ no-onion-garlic | jain | allergy | diabetic | other, count int ≥ 1) for A / M.
- **customers / leads**: `whatsappOptIn` stays a client tick; `whatsappOptInAt/By`, `whatsappOptOutAt/By`,
  `whatsappLastInboundAt` are server-only. **messagesOutbox** stays fully server-written (sendAs, metaTemplate,
  metaParams, holdReason, holdTe, approval flip via approveMessage).
- Client changes needed: Android / web staff "task done" must call `completeTask`; any direct staffAdvances writes
  (old expense-style advance screens) must call `addStaffAdvance`.
- Tests: 59 Round 10 checks added — `tools/rules-test.mjs` now has 195.

## Round 9 (order cancellation — api-contract / backend-notes "Round 9")

- **Bookings**: `cancel`, `lastCancel`, `previousStatus`, `cancelLoss`, `postponements`, `lastPostponed` (plus the
  existing `cancelReason / cancelledBy / cancelledAt`) are server-only. Clients can never set status `Cancelled`
  (cancelBooking / cancelRecord) and a cancelled booking is frozen, so it cannot be moved back either
  (restoreBooking). A plain form edit may still change `eventDate` (postponeBooking is the full path).
- **Invoices**: `cancellationCharge`, `beforeCancel`, `restoredAt`, `restoredBy` cannot change (client updates are
  status-only, Draft / Sent / Overdue); a Cancelled invoice is frozen.
- **Payments**: every payment, including refunds (`type: "refund"`, `cancellation: true`, negative), is server-only.
- **Quotations, vehicleTrips, equipmentMoves**: status `Cancelled` and `previousStatus` / `cancel*` are server-set;
  cancelled ones are frozen for clients (trips and moves now use the same cancel guard as the rest).
- `cancelKeys()` now also covers `previousStatus`, `cancel`, `lastCancel`, `restoredAt`, `restoredBy` everywhere.
- Tests: 27 Round 9 checks added to `tools/rules-test.mjs` (136 in total).

## Round 8 (docs/api-contract.md "Round 8" + both additions, calc-spec §13 / §13.5, backend-notes Round 8)

- **dishes**: `learned` (per100, status, eventsUsed, byBand, **byCell**, factors, variants) and `recipe`
  (ingredients perUnit, typed, variants) are server-only — any client write that sets or changes them,
  including a dotted `learned.byCell` update, is denied. Owner fields `category`, `role` (rice |
  flavoured-rice | bread | tiffin-main | side | sweet | starter | drink | other), `variants[]`,
  `startRules[]`, `typedRecipe`, `basePer100`: **admin + manager** (was admin only). Staff read only.
  `dishes/*/history/*`: A, M read; server write.
- **cook log v2** (`bookings/*/cookLog/*`: guests, band, serviceStyle, comboKey, ingredients, shared splits):
  server-only (saveCookLog); read as the booking.
- **bookings**: `serviceStyle` ∈ banthi | buffet | other, writable by A / M (also checked on the first
  `sessions[]` item); `comboKey` and `planSnapshot` are server-only on the booking. `sessions[].comboKey`
  cannot be blocked inside a list by rules — `syncBookingSessions` must recompute it on every write
  (it does per backend-notes).
- **notifications** (`notifications/{id}`): server-written. Read only by recipients — an active user whose
  role is in `audienceRoles` (or whose uid is in an optional `recipientUids`); query with
  `whereArrayContains("audienceRoles", myRole)`. The one client write is "mark as read": `readBy` may only
  change by adding the caller's own uid (arrayUnion). No client create / delete.
- **Unchanged from Round 7 and re-checked**: `vendorPayments`, `outsideOrders` (server-only; A + M own
  branch read), `quotations/*/versions` (read like the quotation, server-only), `bookings.closed` (closeEvent
  snapshot; server-only, freezes the booking and its tagged purchases / expenses / trips / moves).
- **Tightened with backend facts**: `equipmentMoves.assignedStaffIds` is copied by the server
  (`syncMoveStaff`), so staff read moves with `whereArrayContains("assignedStaffIds", myStaffId)` and
  clients may not write that field (replaces the Round 7 `get()`-based check). Legacy `expenses.bookingId`
  (no costTarget) now also counts for the closed-event freeze. `legacyPaymentStatus` is server-only.
- **Residual**: managers see all manager notifications (no `branchId` on notifications yet — add one and
  the rule can scope it).

### Emulator test status
**18 Nov 2026: run on the Mac — RESULT: 277 passed, 0 failed** (double-click `CRM Check.command` in the project folder; it also runs the server tests, the web build and the Android build and writes `_check-log.txt`). The older note below is kept for history.

`tools/rules-test.mjs` holds 233 checks (Rounds 1–10c + final QA) (users / pending, branch scope, staff assignment queries,
updatedBy, server-owned fields, closed events, costTarget, stock, cancel / delete, dishes R8,
notifications, outside orders, vendor payments, equipment, trips, complaints, settings, auditLog). They
**could not be run** in this round: the Firestore emulator download host (`storage.googleapis.com`) is
blocked both on the Mac's Linux VM and in the cloud session. Run on the Mac (Terminal, project folder,
emulator already installed by "CRM Test Mode"):

```
cd ~/rt-tests && npm i @firebase/rules-unit-testing@4 firebase@11   # once, any empty folder
cd "<project folder>" && NODE_PATH=~/rt-tests/node_modules \
  ~/.suseela-tools/node_modules/.bin/firebase emulators:exec --project demo-suseela-rules \
  --only firestore "node tools/rules-test.mjs"
```
Expected last line: `RESULT: 109 passed, 0 failed`.

## Round 7 (docs/api-contract.md "Round 7", 5 Nov 2026)

- **R7-1 costTarget**: required on every client create of `purchases` / `expenses`:
  `{ type: "booking", bookingId (existing booking), sessionId? }` or `{ type: "overhead", centre }` with centre
  in kitchen-rent / utilities / office / marketing / vehicles / maintenance / general. On update it may stay
  untouched (old untagged docs); if changed it must be valid.
- **R7-2 stock**: `inventory.quantityInStock` is server-only (create: absent or 0; update: never changes);
  the old quantity-only update path is removed; `inventory/*/movements` client create removed;
  `purchases.stockApplied` server-only.
- **R7-3 no deletes / cancel only**: client delete removed from every listed collection and also from
  referrals, complaints, staffAdvances, adSpend, vehicleTrips, equipmentMoves, branches. **Deletes that remain**:
  `users` (A — removes a login, not business data), `tasks` (A, M own branch — work notes),
  `otherPurchaseItems` (A — name suggestions), `settings/{other}` and `agentSettings` (A — configuration).
  Clients can never set `status` Cancelled / cancelled / Closed, `archived`, `cancelReason`, `cancelledBy`,
  `cancelledAt`, nor change `isDeleted`; a cancelled or archived doc is frozen for clients
  (restore / unarchive needs a callable).
- **R7-4**: vehicles / equipment / equipmentMoves / vehicleTrips: A and M (own branch) write; staff read the
  moves of bookings they are assigned to (query with `bookingId ==`) and create trips only for assigned
  bookings (may edit their own trip, same booking). No deletes.
- **R7-5**: `bookings.sessions[]` writable by A / M with a light check (list ≤ 20, first item a map with a
  string `id`; rules cannot loop over items). guestCount / date stay writable; the server re-syncs them.
- **R7-6/7/8**: `outsideOrders`, `vendorPayments` (A; M own branch) and `bookings/*/guestLog`, `eventExtras`
  (as the booking: A, M own branch, assigned S) are server-written only. `paid`, `balance`, `paymentStatus`
  are server-only on purchases / expenses (outside orders are fully server-written).
- **R7-9 closed events**: `bookings.closed` is server-only. While it exists, every client update of the
  booking is denied (booking subcollections are server-only anyway), and so is any create/update of a
  purchase / expense whose `costTarget.bookingId` (old or new) is that booking, any vehicleTrip /
  equipmentMove for it.
- **R7-10**: `quotations/*/versions` read like the quotation, server-only; `version` / `acceptedVersion`
  cannot change (client quotation updates are status-only). Complaints: A / M own branch create + update
  (status, category enums); staff create for an assigned booking with status `open`; creators can read
  their own.
- **Client code that breaks until changed** (Android / web agents):
  - purchases / expenses create without `costTarget`, or with `paymentStatus` (Android sends it today) or
    `paid` / `balance` → denied. Soft-delete (`isDeleted: true`) → use `cancelRecord`.
  - Android `InventoryRepository.adjustStock` transaction and any quantity edit (incl. Android item create with
    a non-zero `quantityInStock`) → `adjustStock` callable; purchase stock-IN calls must stop (trigger does it).
  - All client `delete()` calls (Android BookingRepository / CustomerRepository / InventoryRepository /
    MenuRepository / StaffRepository / VendorRepository, web deleteMenuItem) → `cancelRecord`.
  - Booking status "Cancelled" from the booking form → `cancelRecord`.
  - Vehicles / equipment docs now need `branchId`; equipmentMoves need `branchId` + `bookingId`;
    complaints need `branchId` (+ `bookingId` for staff).
- **Untested assumptions**: staff list queries on `equipmentMoves` rely on a rule that does a `get()` on the
  booking named in the doc — query with `where("bookingId", "==", id)`; if the query is refused in the
  emulator, add `assignedStaffIds` to each move (server-copied) instead. Field names assumed: move `type`,
  `qty`; equipment `kind`, `qtyOwned`, `rentalRate`/`rate`; trips `bookingId`, `ratePerKm`.
- **Cost**: purchases / expenses writes now read the tagged booking (up to 2 extra document reads).

## Round 6 (docs/api-contract.md "Round 6", 5 Nov 2026)

- **Event stock deduction**: `bookings.stockDeduction` is server-owned (trigger / `applyEventStock` /
  `reverseEventStock`); clients can neither set nor change it. `groceryItems.inventoryItemId` (string ≤ 200)
  is admin-writable. `settings/business.autoStockDeduct` and `timelineDefaults` change only through
  `saveBusinessSettings` (clients cannot write `settings/business` at all).
- **Service timeline**: admin / branch manager may write `bookings.serveTime` (`"HH:MM"`, 24 h, regex
  `^([01][0-9]|2[0-3]):[0-5][0-9]$`), `travelMinutes` (int 0–300) and `mealType`
  (`tiffin | lunch | dinner | lunch-dinner | other`) on create and update.
- **Change history**: `auditLog` stays admin-read, client writes denied (triggers write it).
  `updatedBy` rules (helpers `updatedByOk()` / `writerOk()` in `firestore.rules`):
  - **Audited collections — every direct client update must carry `updatedBy == request.auth.uid`**;
    on create it is optional but must be the caller if present: bookings (incl. staff status/notes),
    customers, leads, expenses, purchases, menuPackages, menuItems, dishes, groceryItems, staff,
    inventory (incl. the quantity-only update), vendors, quotations / invoices (status changes), adSpend.
  - **Other client-written collections** (tasks, complaints, referrals, equipmentMoves, vehicleTrips,
    staffAdvances, targets, branch backfill): `updatedBy` optional, must be the caller when written.
  - Every fixed field list (`hasOnly` / `onlyChangedFields`) also allows `updatedBy` (checked = caller):
    staff booking status/notes, quotation and invoice status, staff task fields, stock quantity, branch
    backfill, and `users` (self-signup keys; self-update name / phone / updatedAt).
  - Not covered: `users` (updatedBy optional there), `inventory/*/movements` (uses
    `recordedBy == caller`), `otherPurchaseItems`, `vehicles`, `equipment`, `branches`, `agentSettings`,
    `settings/{other}` (unchanged).
- **Client code that must add `updatedBy: uid` before these rules deploy** (otherwise the update is denied):
  Android `BookingRepository` (saveBooking update, updateStatus, assignStaff), `CustomerRepository`,
  `InventoryRepository` (metadata update and the `adjustStock` transaction), `MenuRepository`,
  `VendorRepository`, `StaffRepository`, `QuotationRepository.updateStatus`,
  `InvoiceRepository.updateInvoiceStatus`; web `saveBooking`, `saveCustomer`, `saveInventoryItemMetadata`,
  `saveMenuItem`, `saveVendor`. Android expenses / purchases already send `updatedBy` (must be the uid).
- Limits: rules can only check that `updatedBy` names the caller; a doc changed by a Cloud Function
  keeps the last client's `updatedBy`, so triggers must use `"system"` for function writes as the contract
  says. Deleting a doc carries no `updatedBy` — the trigger uses the stored one (the last editor, not the
  deleter); deletes are admin-only here, so history for deletes should say "admin".

## Manual and automatic mode (docs/api-contract.md, owner request Nov 2026)

- Server-owned on quotations, invoices, attendance, payroll, targets and saved cooking plans (and on
  bookings, should a callable store them there): `calcMode`, `autoValue`, `overriddenBy`, `overriddenAt`,
  `overrideReason`. Written only by `saveQuotation`, `generateInvoiceFromBooking`, `overrideInvoiceTotal`,
  `markAttendance` (`manualPay`), `overridePayrollRow`, `saveCookingPlan`, `setYearTarget`.
- How the rules enforce it: quotations / invoices allow client updates of `status` + `updatedAt` only;
  attendance, payroll and cookingPlan have no client writes; targets and bookings list these keys
  (plus `targets.manualMonths`) as server-owned via `overrideKeys()` in `firestore.rules`.
- Reading: no extra rule — anyone who may read the document sees which mode a value is in (staff: their own
  attendance and assigned bookings' cooking plans; managers: their branch; admin: all).
- `settings/business.calcModes` and `managerCanOverride` live in the doc clients cannot write, so they change
  only through `saveBusinessSettings`. **Who may override** (manager allowed only when
  `managerCanOverride`, staff never, reason ≥ 3 chars, value ≥ 0, invoice total ≥ amount paid) must be
  checked inside the callables — rules cannot see a callable's request.

## Client writes that must move to Cloud Functions

These existing writes put server-owned money fields from the client and are **denied** by the new rules.
Deploy the rules only after the Android/Web agents switch them:

| # | client code today | writes | switch to |
|---|---|---|---|
| 1 | Android `InvoiceRepository.generateInvoice…` (`collection().add(...)`) | invoice `subtotal`, `gstRate`, `cgst/sgst/igstAmount`, `taxAmount`, `discount`, `totalAmount`, `amountPaid`, `balanceDue`, `status` | `generateInvoiceFromBooking` |
| 2 | Android `InvoiceRepository.recordPayment` (transaction) | invoice `amountPaid`, `balanceDue`, `status` + new `payments` doc | `recordPayment` (and `refundOrAdjust`) |
| 3 | Android `QuotationRepository.generateQuotationFromBooking` | quotation totals (same fields as #1) | `saveQuotation` (use `quoteMenu` for the preview) |
| 4 | Android `InvoiceRepository.updateInvoiceStatus` to `Paid` / `PartiallyPaid` | invoice status derived from payments | only via `recordPayment`; manual Draft/Sent/Overdue still allowed |
| 5 | any future direct write of `settings/business` (setup wizard) | GSTIN → `gstRegistered`, `defaultGstRate`, bank/UPI | `saveBusinessSettings` |
| 6 | any future direct write of `targets.months` / `attendance` / `cookLog` / `dishes.learned` / `bookings.costActual` / `profitActual` / `messagesOutbox` | server-owned | `setYearTarget`, `markAttendance`, `saveCookLog`, `approveMessage` |

Recommended (not forced by the rules): Android `InventoryRepository.adjustStock` should call the
`adjustStock` callable like the web already does.

## Other existing behaviour the new rules change (role matrix, not money)

For the Android / Web agents — these screens need a code change or will get `PERMISSION_DENIED`:

1. **Staff bookings list / calendar / dashboard / expense-entry booking picker**: staff can no longer read
   every booking of the branch. Query `bookings` with `whereArrayContains("assignedStaffIds", myStaffId)`
   (optionally plus `branchId ==`). Needs `users/{uid}.staffId` (see below).
2. **Staff can no longer create bookings** (admin / manager only). Staff may still change `status` / `notes`
   of bookings assigned to them.
3. **Staff can no longer read `customers`, `quotations`, other users, or other staff records**
   (CustomersList, BookingEdit customer picker, QuotationsList, BookingDetail staff names for staff).
   Staff can read their own staff record via `whereEqualTo("linkedUserId", uid)` (already used).
4. **Users list** (`users`) is readable only by admin (previously any active user).
5. **Staff can edit only their own expenses / purchases** (previously any entry of the branch).
6. **No client hard-deletes** (Round 7) — invoices, bookings, customers, … are cancelled / archived via `cancelRecord`.
7. **Storage**: `expense_receipts/` had no rule before (uploads were failing); it is now allowed as a legacy
   path. Move uploads to `expenses/{branchId}/…` and `purchases/{branchId}/…` (≤ 5 MB).

## What other agents must provide for these rules to work

- **`users/{uid}.staffId`** — set it whenever a staff record's `linkedUserId` is set/changed (Functions
  agent: Firestore trigger on `staff/{id}`; or the admin Users/Staff screen writes it). Without it staff see
  no bookings, tasks or attendance.
- **Manager role in clients**: `UserRole.MANAGER`, web `AppUser.role`, and `BranchManager` must force a
  manager to their own branch like staff (queries without `branchId ==` are denied for managers).
  `functions/src/auth/authContext.ts` must also learn `manager`.
- **`branchId` on every new doc**: bookings, tasks, attendance, vehicleTrips, payments, cookLog parent.
- **Paths assumed for manual mode**: saved cooking plans at `bookings/{id}/cookingPlan/{dishId}`; payroll at
  `payroll/{month}` (+ any subcollection). A different path is denied until a rule is added.
- **Shapes assumed for new collections**: `tasks { branchId, assignedStaffIds[], status, completedAt,
  staffNote, createdBy }`, `vehicleTrips { branchId, createdBy, kmStart, kmEnd, fuelCost }`,
  `attendance { staffId, branchId, date, … }`.
- **Callables must re-check roles** (Admin SDK bypasses rules): e.g. `saveCookLog` only for staff assigned
  to that booking, `markAttendance` staff only for their own `staffId`, `getTargetBoard` filtered by role
  on the server (`targets/boardView.ts` `filterBoard`): ₹ sales figures for non-admins (manager and staff)
  only when the owner's setting `settings.targetBoardShowRupeesToAll` is on (otherwise % only); profit is
  never sent to a non-admin, whatever the setting. (Updated 5 Nov 2026 — it used to say "manager sees % only".)

## Indexes added (`firestore.indexes.json`)

bookings (branchId+eventDate asc/desc, assignedStaffIds contains+eventDate, branchId+status+eventDate);
invoices (status+dueDate, branchId+status+dueDate); leads (status+followUpDate); attendance
(staffId+date asc/desc, branchId+date); adSpend (platform+date); messagesOutbox (status+createdAt);
tasks (assignedStaffIds contains+dueDate, branchId+status+dueDate); vehicleTrips (createdBy+date desc);
`payments.branchId` override now covers collection **and** collection-group scope.
Single-field queries (leads by `followUpDate`, adSpend by `date`) use Firestore's automatic indexes.

## Residual risks

1. **No field-level read control**: staff reading an assigned booking also see `totalAmount` /
   `advancePaid` / `menuSnapshot` prices; managers reading `staff` see `dailyWage` / `monthlySalary`, and
   reading `attendance` see `pay`. Split those into admin-only docs if this matters.
2. **Admin = role only** (kept from before): setting an admin's `active` to false does not lock them out —
   change their role instead.
3. **Inventory quantity** is server-only since Round 7 (adjustStock / triggers) — resolved.
4. **Booking `totalAmount` / `advancePaid`** are still client-written (not marked server-owned in the data
   model); the invoice (server) is the money truth.
5. **Customers / leads / complaints / referrals are not branch-scoped** (no `branchId` in the model) — any
   manager sees all branches' customers.
6. **Light schema validation**: unknown extra fields are allowed on most docs (only `users` create is
   key-restricted); expense photo is not mandatory; an expense's `bookingId` is not checked against the
   staff member's assignments.
7. **Legacy storage paths** (`purchase_bills/`, `expense_receipts/`) are readable by any active user of any
   branch, and file names are guessable timestamps.
8. **Cost**: almost every rule reads `users/{uid}` (one billed read per request; cookLog reads also read
   the parent booking).
9. **Guest count ≥ 1** is enforced when `guestCount` is written — the Android `Booking` default is 0, so a
   booking form that saves 0 guests will be rejected (validate in the form).
10. **Not emulator-tested** — syntax and logic were reviewed by hand twice.

**Run on the Mac 5 Nov 2026 (coordinator):** against the running test-mode emulator, separate project
`demo-suseela-rules` (owner's test data untouched): 107/108 first run. The one failure was a test expectation, not a
rules hole: "update without updatedBy" passes when the stored updatedBy is already the caller, so attribution is still
correct. Test fixed (an admin edit first), plus `env.clearFirestore()` at the start so reruns are clean.
Result now: `RESULT: 109 passed, 0 failed, 109 total`, twice in a row.
