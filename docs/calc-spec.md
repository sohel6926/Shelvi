# Calculation spec — Suseela Caterings CRM

This is the single source of truth for every number the CRM computes. The server engine
(`functions/src/calc/*.ts`) implements it; Checker 2 re-implements it independently from this
document alone and both must agree on randomized inputs. Any change starts here.

General rules
- Money is in rupees. `round2(x)` = round to 2 decimals, half away from zero.
- All dates/periods are in India time (Asia/Kolkata, UTC+05:30, no DST).
- Functions must reject invalid input (throw / return an error) rather than produce NaN, Infinity
  or negative money.

## 1. GST invoice total  (`gst.ts → invoiceTotals`)
Input: `subtotal ≥ 0`, `gstRate` in [0, 28], `isInterState` must be a real boolean (reject anything else), `discount ≥ 0`.
The business is **not GST-registered yet**: settings keep `defaultGstRate = 0`, so tax is 0 and the
document prints as a plain "Invoice" (not "Tax Invoice"). Turning GST on later only changes the setting.
```
taxable = round2(max(0, subtotal - discount))      # discount reduces the taxable value
tax     = round2(taxable * gstRate / 100)
if isInterState: igst = tax, cgst = 0, sgst = 0
else:            cgst = round2(tax / 2), sgst = round2(tax - cgst), igst = 0
total   = round2(taxable + tax)
```
Output: `{ taxable, cgst, sgst, igst, tax, total }`. Invariant: `cgst + sgst + igst == tax` exactly.
> Change from the old money-calc-spec: the discount used to be subtracted after tax. Under GST a
> discount shown on the invoice reduces the taxable value, so tax is now charged on
> `subtotal − discount`. The Android InvoiceGenerateViewModel must be updated to match in phase 2.

## 2. Recording a payment  (`payments.ts → applyPayment`)
Input: `total ≥ 0`, `paidSoFar ≥ 0`, `amount`.
- Reject if `amount < 0.01` (less than one paisa).
- `balance = round2(max(0, total - paidSoFar))`. Reject if `amount > balance + 0.005` (no over-payment).
```
newPaid    = round2(paidSoFar + amount)
newBalance = round2(max(0, total - newPaid))
status     = "Paid" if newBalance == 0 else "Partially Paid"
```

## 3. Plate cost and price  (`pricing.ts`)
`plateCost(foodPerPlate ≥ 0, otherPerPlate ≥ 0) = round2(food + other)`

`suggestedPrice(cost, targetMargin = 0.30)`: requires `0 ≤ targetMargin < 1`.
`raw = cost / (1 - targetMargin)`; result = `ceil(raw / 5) * 5` (round up to the next ₹5;
an exact multiple of 5 stays). Use `ceil(raw/5 - 1e-9)` to absorb float noise.

`margin(price, cost)`: if `price ≤ 0` → `{ pct: null, band: "bad" }`;
else `pct = round2((price - cost) / price * 100)`, band `"good"` if pct ≥ 25, `"warn"` if pct ≥ 10,
otherwise `"bad"`.

## 4. Year target split and re-plan  (`targets.ts`)
Season weights `w[0..11]` (Jan..Dec), all ≥ 0, sum > 0. Year target `Y` (whole rupees, > 0).

`allocate(amount, weights)` — split a whole-rupee amount over weights so parts are whole rupees and
sum to `amount` exactly (largest-remainder method):
```
exact_i = amount * w_i / Σw ;  base_i = floor(exact_i) ; left = amount - Σ base_i
give +1 to the `left` indices with the largest (exact_i - base_i); ties → lower index first
```
Remainders must be compared exactly (e.g. as numerators `amount·w_i − base_i·Σw`), so shares that are
mathematically equal really tie and the rupee goes to the earlier month.
If Σw over the chosen months is 0, split equally by the same method using weight 1 each.

`originalPlan(Y, w) = allocate(Y, w)`

`replan(Y, w, actuals)`: `actuals` = list of actual income (rupees, ≥ 0) for months 0..m-1
(already finished), `0 ≤ m ≤ 12`.
```
plan_i = round(actual_i)                      for i < m     (round half up to whole rupees)
remaining = Y - Σ plan_i (i < m)
future months i ≥ m:  allocate(max(0, remaining), w[m..11])
if m == 12: there are no future months; revised = the 12 rounded actuals and any shortfall
            shows only in aheadOrBehind (no error)
```
Output per month: `{ original, revised, isActual }` plus `aheadOrBehind = round2(Σactual - Σoriginal(i<m))`.

`profitTarget(Y, marginPct = 25) = round(Y * marginPct / 100)` — reject unless Y is a whole number > 0 and
`0 ≤ marginPct ≤ 100`.

`dailyNeeded(monthTarget, monthActualSoFar, daysLeftIncludingToday = whole number ≥ 1)
 = ceil(max(0, monthTarget - monthActualSoFar) / daysLeftIncludingToday)`

### 4b. Year plan with typed months  (`ops.ts → replanWithManual`)
Manual/automatic mode for targets. `manualMonths[0..11]`: a whole-rupee number ≥ 0 = typed by hand for that
month; `null` = automatic. Reject unless there are exactly 12 entries, each null or a whole number ≥ 0.
`actuals` and `m` as in §4.
```
auto        = replan(Y, w, actuals)                      # the fully automatic plan (§4)
if every entry is null: result = auto (every month calcMode "auto", autoValue = revised)
typed month i:                    revised = manualMonths[i], isActual = false, calcMode "manual"
automatic finished month i < m:   revised = round(actual_i) (half up), isActual = true, calcMode "auto"
automatic future months i ≥ m:    allocate(max(0, Y − Σ typed − Σ automatic finished revised), w over those months)
                                  isActual = false, calcMode "auto"
every month: original = auto.original_i, autoValue = auto.revised_i
aheadOrBehind = auto.aheadOrBehind
```
A typed month is never re-planned (also not by the target planner); if there are no automatic future months
nothing is allocated, and typed months above Y leave the automatic months at 0 (never negative).

## 5. Learning cooking quantities  (`cooking.ts`)
Each dish has `basePer100` (starting quantity per 100 guests, > 0), a unit (`kg`, `L` or `pcs`)
and history of past events `{ guests > 0, cooked > 0, leftover }` with `0 ≤ leftover ≤ cooked`
(reject otherwise), ordered oldest → newest.

```
use the newest 5 events only;  n = count
eaten_k   = (cooked_k - leftover_k) / guests_k * 100
pad       = max(0, 3 - n)                     # trust history fully only from 3 events
learned   = (Σ eaten_k + pad * basePer100) / (n + pad)
leftPct   = n == 0 ? null : mean(leftover_k / cooked_k) * 100
change    = round((learned - basePer100) / basePer100 * 100)      # whole percent, half away from zero
advice    = "cut" if change < -5, "add" if change > 5, else "ok"
```
Event factors: wedding 1.00, annadanam 1.20, housewarming 0.95, office 0.90, other 1.00.

`suggest(learned ≥ 0, unit, eventType, guests > 0, buffer ≥ 0 = 0.05)` (learned 0 → 0):
`raw = learned * factor * guests / 100 * (1 + buffer)`; for `kg`/`L` round **up** to the next 0.5,
for `pcs` round **up** to a whole number (use a 1e-9 tolerance before ceil).

## 6. Grocery list for an event  (`cooking.ts → groceryFor`)
For each item with `per100` and unit: same `suggest` rounding with factor from the event type and
buffer 0.05.

## 7. Staff day pay and month salary  (`wages.ts`)
`dayPay(dailyWage ≥ 0, hours in [0, 24])`:
```
hours == 0      → base 0
0 < hours < 4   → base = dailyWage / 2
hours ≥ 4       → base = dailyWage
ot   = max(0, hours - 8) * (dailyWage / 8) * 1.5
pay  = round2(base + ot)
```
`monthSalary(days[], advances ≥ 0) = { gross = round2(Σ dayPay), net = round2(gross - advances) }`
(net may be negative = staff owes money; show it, don't hide it).

### 7b. Monthly-salary staff  (`ops.ts → monthlyStaffPay`)  — the only monthly-pay formula
Inputs: monthlySalary ≥ 0, daysInMonth (28–31), the month's attendance days `[{ status: present | half |
absent | leave, hours 0–24 }]`, advances ≥ 0, rules `{ deductAbsences, freeLeaves ≥ 0, overtime }`.
**Owner's rule (Nov 2026): no cut for leave, no overtime; advances deducted** →
`{ deductAbsences: false, freeLeaves: 0, overtime: false }` (changeable in settings).
```
perDay  = monthlySalary / daysInMonth
missed  = count(absent) + count(leave) + 0.5 × count(half)
unpaid  = max(0, missed − freeLeaves)
cut     = deductAbsences ? round2(min(monthlySalary, unpaid × perDay)) : 0
ot      = overtime ? round2(Σ over present/half days of max(0, hours − 8) × (perDay / 8) × 1.5) : 0
gross   = round2(monthlySalary);  net = round2(gross − cut + ot − advances)   (may be negative)
```
Daily-wage staff in payroll use §7 `dayPay` per day (`ops.ts → dailyStaffPay`: gross = pay of the first
8 hours, ot = the rest, net = gross + ot − advances).
Verified independently: 1,500 random cases, 0 differences (Nov 2026).

## 8. Business health  (`health.ts`)
- `breakEven(fixedCosts ≥ 0, revenue > 0, variableCosts ≥ 0)`: `ratio = (revenue - variable) / revenue`;
  if ratio ≤ 0 → `null` (cannot break even); else `round(fixedCosts / ratio)`.
- `primeCostPct(food, labour, revenue > 0) = round2((food + labour) / revenue * 100)`;
  band good ≤ 60, warn ≤ 65, else bad.
- `adsResult(spend ≥ 0, revenue ≥ 0, bookings ≥ 0)`: if spend == 0 → `{ roas: null, costPerBooking: null, band: "none" }`;
  `roas = round2(revenue / spend)`; `costPerBooking = bookings == 0 ? null : round2(spend / bookings)`;
  band good if roas ≥ 3, warn if roas ≥ 1, else bad.
- `profit(income, food, labour, other, ads) = round2(income - food - labour - other - ads)`,
  `marginPct = income > 0 ? round2(profit / income * 100) : null`.

## 9. Report periods  (`periods.ts → periodRange(now, period)`)
Returns `[start, end)` as UTC instants for India-time boundaries.
- `day`: today 00:00 IST → tomorrow 00:00 IST
- `week`: Monday 00:00 IST of the current week → next Monday
- `month`: 1st of current month → 1st of next month
- `3m` / `6m` / `12m`: 1st of the month 2 / 5 / 11 months before the current one → 1st of next month

## 10. Nightly consistency check  (`checks.ts → checkInvoice`)
Given an invoice `{ total, amountPaid, balanceDue }` and its payment amounts:
problems list (empty = OK):
- `"paid-mismatch"` if `|Σpayments - amountPaid| > 0.01`
- `"balance-mismatch"` if `|total - amountPaid - balanceDue| > 0.01` and `balanceDue > 0`,
  or `balanceDue > 0.01` while `amountPaid ≥ total`
- `"overpaid"` if `amountPaid > total + 0.01`
- `"negative"` if any of total / amountPaid / balanceDue / a payment < 0

## 11. Menu package quote  (`menus.ts → quoteForMenu`, `priceReviewDue`)
Menu pricing: `pricePerPlate`, `minOrder`, serving boy `{ chargePerPerson, freeRule: none | per50 }`,
`freePlates: { perPlates, extraPlates } | null`, `extras [{ key, price | null }]`,
`replacements [{ key, extraPerPlate }]`. Request: `plates` (whole ≥ 1), `servingBoys` (whole ≥ 0),
`transport ≥ 0`, chosen replacement keys, extras `[{ key, qty whole ≥ 1, price? }]` (price is required
when the menu's price is null, e.g. "extra sweet — price depends"), `discount`, `gstRate`.
```
lines: plates × pricePerPlate
       for each chosen replacement: plates × extraPerPlate
       for each extra: qty × (menu price, else the given price)
freePlates       = floor(plates / perPlates) × extraPlates      (0 if the menu has none)
platesToCook     = plates + freePlates
freeServingBoys  = freeRule == per50 ? floor(plates / 50) : 0    (owner confirmed: 1 free per 50 plates)
chargedBoys      = max(0, servingBoys − freeServingBoys);  line chargedBoys × chargePerPerson if > 0
transport line   = transport if > 0
subtotal         = round2(Σ line amounts);  totals = invoiceTotals(subtotal, gstRate, isInterState, discount)
belowMinimum     = plates < minOrder        (warning shown to the user, not an error)
```
Rejected (error, never a quote):
- the whole menu is checked, not only chosen items: `pricePerPlate`, `chargePerPerson`, every extra
  price that is not null and every `extraPerPlate` must be ≥ 0; `minOrder` whole ≥ 0 (0 = no minimum);
  `freeRule` exactly `none` or `per50`; `freePlates.perPlates` whole ≥ 1, `extraPlates` whole ≥ 0;
- unknown replacement/extra keys, extras without a price, the same replacement chosen twice, the same
  extra listed twice (use qty).
Defaults: missing `replacements` / `extras` = empty list; missing `isInterState` = false; missing
`discount` = 0. `gstRate` is required — the caller passes the business setting (0 until GST
registration). Line names: `plates`, `replacement:<key>`, `extra:<key>`, `servingBoys`, `transport`.

`priceReviewDue(menuDate, today)` (both real calendar dates `YYYY-MM-DD`; 2025-02-30 or month 13 are
rejected): true when `today ≥ menuDate + 1 year` (same month/day next year; a 29 Feb menu date is due
from 1 March in a non-leap year). The owner raises prices himself (≈ ₹10/plate a year) and then updates the menu
date; the CRM only reminds.

## 12. Service timeline  (`timeline.ts → serviceTimeline`)
Inputs: `eventDay` (YYYY-MM-DD), `serveTime` (HH:MM, 00:00–23:59), `guests` (whole ≥ 1),
`mealType` (`tiffin | lunch | dinner | lunch-dinner | other`), `travelMinutes` (whole 0–300).
Minutes (defaults, may be overridden by settings `timelineDefaults` with the same keys):
```
cookBase   = tiffin 90, lunch 150, dinner 150, lunch-dinner 150, other 150
cookExtra  = min(120, 30 × ceil(max(0, guests − 250) / 250))       # bigger events cook longer
cook       = cookBase + cookExtra
setup = 45, load = 20, prep = 60, serveSpan = tiffin 60, others 90, cleanup = 60
serve      = eventDay serveTime
setupAt    = serve − setup
leaveAt    = setupAt − travelMinutes
loadAt     = leaveAt − load
cookAt     = loadAt − cook
prepAt     = cookAt − prep
steps (in time order):
  dayBefore 18:00  groceryCheck   "సరుకులు, కూరగాయలు సరిచూసుకోవడం; తక్కువ ఉన్నవి కొనడం"   manager
  dayBefore 19:00  vesselsReady   "పాత్రలు, gas, బండి సిద్ధం"                                 manager
  prepAt           prep           "కూరగాయలు కోయడం, నానబెట్టడం"                                 cook
  cookAt           cookStart      "వంట మొదలు"                                                 cook
  loadAt           load           "packing, బండిలో ఎక్కించడం"                                  helper
  leaveAt          leave          "Venue కి బయలుదేరడం"                                         driver
  setupAt          setup          "Counter, plates set-up"                                    helper
  serve            serveStart     "వడ్డన మొదలు"                                                all
  serve+serveSpan  serveEnd       "వడ్డన ముగింపు"                                              all
  serveEnd         cleanup        "శుభ్రం, పాత్రలు తిరిగి లెక్కపెట్టడం"                          helper
  serveEnd+cleanup leftoverEntry  "మిగిలిన భోజనం CRM లో నమోదు"                                  manager
  (serveEnd = serve + serveSpan)
```
Times may cross midnight (an early tiffin's prep/cook falls on the day before): each step returns its own
`day` and `time`. Output: `[{ key, day, time, te, en, role }]` sorted by (day, time). Reject invalid inputs.

## 13. Learning recipes from the owner's own events  (`recipes.ts`)  — Round 8
Goal: the owner enters real data for the first 1–5 events; afterwards the CRM predicts, for the next catering, how much
of each dish to cook **and how much of each ingredient** it needs — by dish category, piece counts, event size and
several caterings on the same day.

**Dish master** `dishes/{id}`: nameTe/nameEn, `category` (`rice | curry | dal | liquid | fry | sweet | chutney-pickle |
roti-bread | snack | drink | tiffin | other`), unit (`kg | L | pcs`), optional `variants[]` `{ id, nameTe, nameEn,
piecesPerPlate? }` (e.g. "పుల్కా – 2", "పుల్కా – 3", "ఇడ్లీ – 3"; menu options link to a dish + variant).
`basePer100` stays as the owner's starting guess (optional now).

**Event log** (per event or per session, per dish): `cooked` (dish unit), `leftover`, `guests` (actual), and
`ingredients[] { groceryItemId, used }` (kg/L/pcs actually used for THIS dish). Several events cooked in one batch:
`sharedWith[] { bookingId, sessionId?, guests }` → the batch's cooked, leftover and ingredients are split between the
events in proportion to guests (each event stores its share; Σ shares = batch).

**1. Dish quantity per 100 guests (extends §5).**
- Piece dishes with `piecesPerPlate` (from the menu option/variant): `per100 = piecesPerPlate × 100` — no learning
  needed; leftovers still tracked for advice.
- Otherwise eaten_k = (cooked − leftover)/guests × 100 per event (newest 10 events of that dish+variant).
- Size bands: `S ≤ 150`, `M 151–400`, `L 401–800`, `XL > 800` guests.
  overall = mean(eaten_k); bandMean = mean(eaten_k in the target band);
  if the band has ≥ 2 events: learned = bandMean; else if ≥ 2 events in other bands: learned = overall × bandFactor
  where bandFactor = mean over bands with ≥ 2 events of (bandMean_b / overall) weighted toward the nearest band
  (nearest band's ratio; ties → the smaller band); else learned = overall (no size adjustment invented).
- Until 1 event: basePer100 if the owner set one, else "ఇంకా నేర్చుకోలేదు" (no suggestion).
- Status: `learning` (1–4 events), `learned` (≥ 5 events) — shown as "నేర్చుకుంటోంది 2/5" / "నేర్చుకున్నది ✓".

**2. Ingredients per unit of dish (the light recipe).**
ratio_i = Σ used_i / Σ cooked over the newest 10 events of that dish+variant (weighted by quantity, so a big event
counts more). The owner may also type a starting recipe (per 1 kg / 1 L / 1 pc) which is used until the first logged
event and then blended like §5's padding: with n < 3 events, ratio = (Σ used + (3−n)·typed·avgCooked) / (Σ cooked + (3−n)·avgCooked).
Ingredients needed for a planned dish = plannedQty × ratio_i (round up: kg/L to 0.1, pcs to whole).

**3. Plan for an event / session** = for each dish in the chosen menu (menu option → dish + variant):
qty = learned per100 × eventFactor (§5) × guests / 100 × (1 + buffer 0.05), rounding as §5; ingredients from 2.
Totals per grocery item = Σ over dishes; compare with stock → to buy. Event-level per-100 grocery lines (§6) are only
used for items no learned dish covers (e.g. disposables), so nothing is counted twice.

**4. Several caterings on one day** (`dayPlan(date)`): all bookings/sessions of that day (same branch) → per-event
dish quantities + a combined ingredient list for the day (Σ), minus stock → one purchase list; and a cooking list per
dish with the split per event (so a single batch can be cooked and divided).

## 14. Extra plates on the final invoice  (`round7.ts → extraPlates`)  — Round 7 (R7-7)
Per meal session (or the booking when it has no sessions), with the quotation's quoted plates and plate price:
```
qty    = max(0, guestCountActual − quotedPlates)      (whole numbers ≥ 0; reject otherwise)
amount = round2(qty × pricePerPlate)
```
Added as a separate labelled invoice line; approved event extras are lines of `qty × rate`. The invoice total is then
§1 on (quote subtotal + extra lines) with the quote's discount.

## 15. Outside order amounts  (`round7.ts → outsideOrderAmounts`, `checkOutsideDelivery`)  — R7-6
```
cost      = round2(acceptedQty × rate)                      (cost to the event, food)
amountDue = round2(cost − advancePaid − paid)               (negative = the vendor owes us)
delivery  : acceptedQty + returnedQty ≤ deliveredQty, all ≥ 0
```

## 16. Vessels / equipment outstanding and rental cost  (`round7.ts`)  — R7-4
```
outstanding(item, booking) = max(0, Σ issue − Σ return − Σ damaged − Σ lost)
rentalCost                 = round2(qty × ratePerDay × days)        (rented items; days whole ≥ 1, default 1)
tripCost                   = round2(fuelCost + ratePerKm × (kmEnd − kmStart))     (kmEnd ≥ kmStart)
```

## 17. Bill payment status  (`round7.ts → billPaymentStatus`, `mapLegacyPaymentStatus`)  — R7-8
For purchases / expenses (total = totalAmount) and outside orders (total = §15 cost, paid = advancePaid + paid):
```
balance       = round2(max(0, total − paid))
paymentStatus = Paid if balance == 0, PartiallyPaid if paid > 0, else Unpaid
```
One-time mapping of the old free-text status: Paid / Fully Paid / Settled → paid = total; Cancelled → the record is
cancelled; anything else (Pending, Partial, Credit, Advance Paid, …) → paid = min(advancePaid, total) (0 if none).

## 18. Event close blockers  (`round7.ts → closeBlockers`)  — R7-9
Close is refused while any of these hold (each with a Telugu message):
vessels outstanding (§16) > 0; outside orders not `settled` (cancelled ignored); event extras `pending`;
an assigned staff member without attendance on an event day; vendor bills not confirmed as entered;
customer balance (Σ balanceDue of the booking's invoices) > 0 — this one only, the owner may override with a
reason of at least 3 characters. On close the snapshot is income, costs by type, profit and marginPct (§8 profit).


### 13.5 Menu combination and service style (owner request, same day — binding addition to §13.1)
The owner's rule: how much of a dish to cook depends on **what else is on the menu** (e.g. biryani with pulka vs biryani
alone; plain rice when there is no biryani) and on **service style** (బంతి భోజనం = sit-down leaf service, vs buffet).

**Dish role** `dishes/{id}.role` (owner sets; default from category):
`rice` (plain rice) · `flavoured-rice` (biryani, pulao, bagara, fried rice, pulihora…) · `bread` (pulka, roti, chapati,
naan, poori, parotta) · `tiffin-main` (idli, dosa, vada, upma, pongal) · `side` (curry, dal, liquid, fry, chutney, pickle,
curd) · `sweet` · `starter` · `drink` · `other`.

**Session fields**: `serviceStyle` = `banthi | buffet | other` (required for a plan; default from event type, owner can
change). `comboKey` (server-computed from the session's menu) = sorted main roles present on the menu, with a count when a
role appears more than once, e.g. `flavoured-rice` (biryani only), `bread+flavoured-rice` (biryani + pulka),
`bread+rice` (no biryani), `bread+flavoured-rice×2+rice`.

**Per-100 for a dish (replaces the single "learned" in §13.1; piece dishes still use piecesPerPlate×100 but their
leftover pattern is shown per style/combo as advice).** Each logged event stores band, serviceStyle, comboKey with eaten_k.
1. **Exact cell**: events with the same band + style + comboKey ≥ 2 → per100 = mean of those.
2. **Else factor model**: per100 = overall × f_band × f_style × f_combo, where for each dimension
   f = mean(eaten_k in the target group) / overall when that group has ≥ 2 events; else the owner's typed starting
   factor for that group if set; else 1.0. (overall = mean over the newest 10 events of the dish+variant.)
3. **No event yet**: the owner's typed starting per100 for the closest matching rule (style+combo, then combo, then
   style, then plain basePer100); else "ఇంకా నేర్చుకోలేదు".
Factors are clamped to 0.5–1.5 so one strange event can't break a plan. Each plan line returns `why[]` in Telugu/English
(e.g. "పుల్కా ఉంది: −18% (4 events)", "buffet: +6% (3 events)", "పెద్ద event 800+: −10% (2 events)").

**Owner's starting rules** `dishes/{id}.startRules[] { style?, comboKey?, band?, per100?, factorPct? }` — typed from
experience ("పుల్కా ఉన్నప్పుడు బిర్యానీ 100 మందికి 14 kg"); used until real events replace them (exact-cell or
group with ≥ 2 events wins over a typed rule).
Status counts stay per dish (learning n/5); the plan also shows how many events matched this exact combination.

## 19. Order cancellation money  (`cancellation.ts`)  — Round 9
`paid` = what the customer has paid on the booking's live invoices (Σ amountPaid, refunds already netted).
Nothing paid (round2(paid) < ₹0.01) → refund 0, charge 0 (no money step).
| advance | refund |
|---|---|
| `refund-all` | paid |
| `refund-part` | round2(refundAmount), must be ₹0.01 ≤ refund ≤ paid |
| `keep` | 0 |
`cancellationCharge` = round2(paid − refund) — income ("రద్దు చార్జీ"), not event revenue.
Several invoices: the refund is split most-paid invoice first, never more than each invoice's paid (`allocateRefund`).
Stats: `income = eventRevenue + cancellationCharges`; `cancellationCharges` = Σ cancel.charge of bookings with status
Cancelled whose `cancelledAt` falls in the period; `cancellations` = their count; `cancelRefunded` = Σ cancel.refund.
Event cost of a cancelled order: incomeActual = charge; `cancelLoss` = max(0, tagged costs − charge).
Dashboard / reasons: `cancellationSummary` → { count, refunded, kept, byReason }.

## 20. Staff advance recovery  (`round10.ts → advanceRecovery`, `advanceBalances`, `nextMonth`)  — R10-1
Advance `{ amount, date, recoverMonth (default: month after date), status Open|Recovered|Cancelled, recoveries[] {month, amount} }`.
Due in month M: not Cancelled, recoverMonth ≤ M, balanceBefore = amount − Σ recoveries of months before M > 0.
Old advances without a status (before Round 10): due only in the month of their date, never carried.
Order: recoverMonth, date, id. pay = the row's net before advances (§7 / §7b).
cut = min(Σ balanceBefore, max(0, pay)) taken oldest first (the pay never goes below ₹0);
carry = Σ balanceAfter (recovered from next month's pay). Payslip: "అడ్వాన్స్ కోత ₹cut".
Booking the month (`finalizePayroll`) replaces that month's recovery on each advance, so it can run again;
an advance with Σ recoveries ≥ amount becomes Recovered (with the payslip id).

## 21. Kids plates and special meals  (`round10.ts → kidsSpecialLines`; `menus/fullQuote.ts`)  — R10-11
Kids: kidsCount plates on top of `plates`, at the package `kidsPrice` (no kidsPrice = not offered → error); kids are
also cooked (`platesToCook += kidsCount`, plan guests + kids).
Special meals `{ type no-onion-garlic|jain|allergy|diabetic|other, count, note?, extraPerPlate? }` are inside `plates`
(already charged at the package price); Σ counts ≤ plates; one quote line per type: qty = count, rate = extraPerPlate
(0 when the owner set no extra — shown, adds nothing). Subtotal = §11 lines + these lines; totals by §1.

## 22. Lunch boxes  (`round10.ts → lunchBoxesOn`, `lunchBoxMonthLines`)  — R10-12
Order on a day: one-off `date`, or recurring weekdays (mon–sat) between startDate and endDate; paused / cancelled = 0.
Month invoice per customer: per order, boxes = Σ delivery ticks of the month (days without a tick are not billed),
amount = round2(boxes × pricePerBox) (default settings.lunchBoxPrice ₹170); GST by §1 on the subtotal.

## 23. Customer statement  (`round10.ts → statement`)  — R10-7
Entries: invoice +total (by issue day); cancelled invoice: +cancellationCharge only (by cancel day); payment −amount;
refund (negative payment) +|amount|; orders listed with 0. Sorted by day, then booking, invoice, charge, payment, refund.
opening = Σ entries before `from`; each line's balance = previous + amount; closing = last balance
(> 0 customer owes; < 0 we owe the customer).

## 24. Suggested package price  (`round10.ts → packagePriceSuggestion`, `priceBand`; §3 `suggestedPrice`)  — R10-4
Groceries for the package at `guests` plates (default 100) from §13 recipes (each choice group costed with its first
option; per-100 lines for items no dish covers). Rate = the latest purchase rate of the linked stock item (same unit;
converted Gram→kg, ML→L, Dozen→pcs; other units listed as missing, never guessed).
food/plate = round2(Σ qty × rate ÷ guests); plateCost = round2(food/plate + labourPerPlate + overheadPerPlate) (settings);
suggested = §3 suggestedPrice(plateCost, targetMarginPct ÷ 100) (rounded up to ₹5; default 30%);
margin % = round2((price − cost) ÷ price × 100); band red < 15, amber 15–25, green ≥ 25.
coverage % = round1(priced lines ÷ costed lines (qty > 0) × 100). If any costed line has no rate, or no line is
costed, band = "unknown" (grey) with the missing items; plateCost, margin % and suggested price are null and only
knownPlateCost (the priced part) is given — never a colour from a partly priced cost.

## 25. Vendor rates, ratings, shifts  (`round10.ts`)  — R10-6 / R10-2
Purchase line → grocery item: groceryItemId (web form), else inventoryItemId (Android), else the name
(roman / English / Telugu / aliases, letters and digits only, an ambiguous name matches nothing); the rate is converted
to the grocery unit as in §24; an unconvertible unit is its own row "<item> (<unit>)"; unmatched lines keep
description + unit. Cancelled / deleted purchases are skipped.
Vendor table per item: each vendor's last rate and date, the previous rate of that vendor and
change % = round2((last − previous) ÷ previous × 100); cheapest = the lowest last rate (ties all marked).
Monthly rating = mean of the month's 1–5 stars, 1 decimal (count shown). Shift: end after start, at most 16 h;
a staff member's shifts on a day may not overlap.

## 26. Purchase quantities into stock units  (`shared/units.ts`, `stock/purchaseStockRules.ts`)  — final QA F4
qty in stock unit = qty × factor(line unit → stock unit): g→kg 0.001, ml→L 0.001, dozen→pcs 12, same unit 1 (case and
spelling ignored). Not convertible (Packet, Bag, Box… against kg / L / pcs) → the line moves no stock and is listed in
stockSkipped. Stock item without a unit: lines in kg / L / pcs / blank go in as typed. Per item: round2(Σ converted).
Moved = wanted − stockApplied (§R7-2), so edits and cancellation move back exactly what was applied.
