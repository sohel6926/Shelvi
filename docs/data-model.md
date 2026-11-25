# Data model — Suseela Caterings CRM (Firestore)

**Telugu summary for the owner:** ఈ document లో app లోని ప్రతి సమాచారం ఎక్కడ, ఏ రూపంలో save అవుతుందో
ఉంది. Phone app, web admin, server — మూడూ ఇదే రూపం వాడతాయి, అందుకే ఒక చోట enter చేసింది మిగతా
చోట్ల వెంటనే కనిపిస్తుంది. డబ్బు లెక్కలు (GST, బాకీలు, లాభం, targets) server మాత్రమే రాస్తుంది.

All three parts (Android, web, Cloud Functions) use these shapes. Collection names live in
`functions/src/shared/firestorePaths.ts` and `FirestoreCollections.kt` — keep them in sync.
Calculations referenced as §n are in `docs/calc-spec.md`.

## Conventions
- Every business document carries `branchId` (set once at create, never updated — see money-calc-spec),
  `createdBy` (uid), `createdAt`, `updatedAt` (server timestamps).
- Money: rupees as numbers with ≤ 2 decimals. Dates of a business day: string `YYYY-MM-DD` in India
  time (so "which day" never shifts with the phone's timezone); moments: Firestore timestamps.
- Bilingual names: `nameTe`, `nameEn`.
- **Server-owned fields** (marked 🔒) are written only by Cloud Functions; security rules reject client
  writes to them. Clients may show a local estimate offline, but the server value is the truth.
- Offline: Android keeps Firestore offline persistence on; staff entries made without signal sync later.

## Roles
| role | who | can |
|---|---|---|
| `admin` | owner (and one trusted backup admin) | everything |
| `manager` | **new** — runs bookings/quotations | leads, customers, bookings, quotations, menus, payments; no profit/P&L, no user admin |
| `staff` | cook / helper / driver | own attendance, leftovers, purchases & expense bills for assigned events, tasks |
Pending users: `active == false` until an admin approves (already implemented).
`UserRole.kt` / web types gain `MANAGER("manager")`.

## Existing collections (kept, with additions)
- `users/{uid}` — role, active, branchId, name, phone.
- `customers/{id}` — + `whatsappOptIn: boolean`, `optInAt`, `source` (lead source), `referredBy`.
- `menuItems/{id}` — + `nameTe`, `category`, `dishId` (link to cooking dish, optional).
- `bookings/{id}` (= an event) — existing fields, plus:
  - `eventTypeCode`: `wedding | annadanam | housewarming | office | other` (drives §5 factors)
  - `guestCountConfirmed` (3-day confirmation), `guestCountActual`
  - `packageId`, `pricePerPlate`, `menuSnapshot` (unchanged)
  - 🔒 `costActual { food, labour, transport, rentals, other }`, 🔒 `profitActual`
  - subcollection `cookLog/{dishId}`: `{ dishId, unit, cooked, leftover, recordedBy, recordedAt }`
- `quotations/{id}`, `invoices/{id}` — 🔒 all totals (§1) are computed by the function from line items;
  + `upiQrPayload` 🔒, `validUntil` (15 days default).
- `invoices/{id}/payments/{id}` (and top-level `payments` mirror) — written only through the
  `recordPayment` function (§2, transaction).
- `staff/{id}` — + `skills`, `emergencyPhone`, `photoUrl`.
- `inventory`, `movements`, `vendors`, `purchases`, `otherPurchaseItems`, `expenses`, `branches`, `auditLog` — unchanged.
  `expenses` + `photoUrl` (bill photo), `bookingId` (optional link to an event).

## New collections
| collection | key fields | written by |
|---|---|---|
| `settings/business` (one doc) | name, logoUrl, gstin, address, phone, bank {name, account, ifsc}, upiId, signatureUrl, terms, gstRegistered (false), gstin (empty until registered), defaultGstRate (0 until registered), profitMarginPct (25), seasonWeights[12], setupProgress {step: bool} | admin (setup wizard) |
| `leads/{id}` | name, phone, source (`instagram|facebook|google|referral|walkin|justdial|other`), campaignId, eventDate, guests, budget, status (`new|contacted|tasting|quoted|won|lost`), followUpDate, lostReason, whatsappOptIn, customerId (when won) | manager/admin; Enquiry agent adds `lastContactAt` |
| `dishes/{id}` | nameTe, nameEn, unit (`kg|L|pcs`), basePer100, category; 🔒 `learned { per100, leftoverPct, changePct, advice, eventsUsed, updatedAt }` | admin; 🔒 by Cooking agent (§5) after each event's cookLog |
| `menuPackages/{id}` | code, nameTe, nameEn, mealType (`tiffin|lunch|dinner|lunch-dinner`), menuDate (price date), deliveryWindow, groups[] (each a list of {te,en} options — pick one), pricePerPlate, transportExtra, minOrder, servingBoy {chargePerPerson 700, freeRule `none|per50`}, freePlates {perPlates 50, extraPlates 5} or null, extras[] {key,te,en,price or null}, replacements[] {key,te,en,extraPerPlate}, active | admin (seed: `data/seed/menus.json`); quote §11; price-review reminder 12 months after menuDate |
| `groceryItems/{id}` | nameTe, nameEn, unit, per100, inventoryItemId | admin |
| `attendance/{staffId_YYYY-MM-DD}` | staffId, date, hours, status (`present|half|absent|leave`), bookingId, 🔒 `pay` (§7), recordedBy | staff (own) / manager |
| `staffAdvances/{id}` | staffId, amount, date, note | admin |
| `vehicles/{id}` | number, type, driverStaffId, insuranceExpiry, fitnessExpiry, pollutionExpiry | admin |
| `vehicleTrips/{id}` | vehicleId, bookingId, date, kmStart, kmEnd, fuelCost | driver/staff |
| `equipment/{id}`, `equipmentMoves/{id}` | vessel/rental items, out/return per booking, damages | manager |
| `adSpend/{id}` | date, platform, campaign, amount, leads, bookings, revenue, source (`manual|meta-api|google-api`) | admin; API agent imports |
| `complaints/{id}`, `tasks/{id}`, `referrals/{id}` | as in the preview screens | manager/admin |
| `targets/{year}` | yearTarget, profitMarginPct, weights[12]; 🔒 `months[12] {original, revised, isActual}`, 🔒 `aheadOrBehind` (§4) | admin sets target; 🔒 Target planner |
| `monthlyStats/{YYYY-MM}` 🔒 | income, food, labour, other, ads, profit, marginPct, events, bookings, breakEven, primeCostPct | Cloud Functions only (feeds P&L, reports, Target Board) |
| `dailyStats/{YYYY-MM-DD}` 🔒 | same shape for the day | Cloud Functions only |
| `messagesOutbox/{id}` | channel (`whatsapp`), to, template, params, relatedType/Id, status (`queued|needs-approval|sent|failed`), error | agents; sending needs `customers.whatsappOptIn` |
| `agentSettings/{agentId}` | enabled, schedule, owner overrides | admin |
| `agentRuns/{id}` 🔒 | agentId, startedAt, finishedAt, status, summary, itemsHandled, alerts | Cloud Functions only |
| `integrityReports/{YYYY-MM-DD}` 🔒 | nightly §10 results: problems[] {type, docPath} | Cloud Functions only |

## Who computes what
- Totals, GST, payments, profits, targets, learned quantities, wages: **server** (`functions/src/calc`).
  Android/web show the server's stored values; they never write those fields.
- The Android app may compute a preview (e.g. invoice total before saving) using the same spec, but
  the saved number always comes back from the function.
