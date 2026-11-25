# Spec gap analysis — 6 frozen spec PDFs vs the built CRM (5 Nov 2026)

## ఓనర్ కోసం సారాంశం (Telugu)
1. ఈ 6 PDF specs లో మన CRM సుమారు **25%** చేస్తుంది; రోజువారీ పనులు (quotation → invoice → payment → జీతాలు) మాత్రం **60–70%** పూర్తి.
2. పెద్ద లోపం 1: కొనుగోళ్లు (purchases) ఏ event కి చెందినవో link లేదు → ప్రతి event లాభం ఉన్నదానికంటే ఎక్కువగా కనిపిస్తోంది.
3. పెద్ద లోపం 2: stock అంకెని నేరుగా మార్చొచ్చు, purchase మార్చినా stock వెనక్కి రాదు → stock లెక్క, తక్కువ stock హెచ్చరికలు నమ్మలేం.
4. పెద్ద లోపం 3: ఒక booking లో అనేక భోజనాలు (meal sessions) లేవు; పాత్రలు/వాహనాల screens, event close (lock) కూడా లేవు.
5. తర్వాత చేయొచ్చు (ఇప్పుడు అవసరం లేదు): 17 roles, accounting ledger, PO/GRN/three-way match, batch/expiry, పూర్తి recipe BOM, 141 screens / 92 reports.
6. ముందు deploy చేసి ఒక నిజమైన event తో test చేయాలి; తర్వాత క్రింద section 4 లోని 10 పనులు వరుసగా చేద్దాం.

---

# Catering CRM vs the 6 frozen spec PDFs: gap analysis

I read all 6 spec files in full. Then I checked them against the CRM's docs (`requirements-checklist`, `data-model`, `api-contract`, `calc-spec`, `security-review`, `backend-notes`) and confirmed with code: `functions/src/index.ts`, `web/src/routes/AppRouter.tsx`, Android `NavRoutes.kt` and the data models. Nothing was edited.

Page numbers use these short names:
- **BP** = Master Blueprint v2.0
- **IMP** = Complete Implementation Freeze Pack
- **CMF** = All CMF Master Pack
- **MDF01** = Master Data Freeze 01
- **P06** = PDF 06 Purchase & Expense
- **TWF** = Transaction Workflow Pack

## 1. Summary

The current CRM covers roughly **25% of the spec overall**. That rises to **about 60–70% for the sales → quotation → invoice → payment → staff pay core** the owner uses every day, and falls to **under 10% for the ERP layers**: procurement, inventory control, production, accounting and closing.

The biggest structural differences:
- **Booking = Event in one record.** There are no Event, Sub-Event or Meal Session objects (BP p3, Decision 01 p23).
- **Organisation is only Branch.** The spec has Company → Brand → Branch → Kitchen → Store → Zone/Rack/Bin (MDF01 p2, p12).
- **No recipe/BOM.** The CRM learns cooked quantity per 100 guests for each dish, plus a separate event-level grocery list per 100 guests. Products are not linked to ingredient Items (Decision 03, BP p24).
- **No UOM master, batches, expiry, stock locations or reservations.** Inventory is one `quantityInStock` number per item with IN/OUT movements.
- **Purchases are direct bills.** There are no PR, RFQ, PO, GRN or three-way match steps.
- **No ledger.** There is no double-entry layer, chart of accounts or cost allocation. Profit comes from server-computed stats and per-booking `costActual`.
- **Approvals are almost absent.** Only new users and outgoing WhatsApp messages need approval. Instead there is an audited "manual override with reason".
- **3 roles instead of 17.**
- **No event closing stages or financial lock.**

The CRM also has features the spec does not ask for: Telugu UI, menu-package pricing rules (free plates, serving boys), cooking-quantity learning, Target Board, ads ROI, 13 automatic agents and WhatsApp outbox, a setup wizard, and the Auto/Manual mode.

## 2. Area-by-area table

Status key: **Done** / **Partial** / **Missing** / **Different-by-design (DbD)**. Effort: S (days), M (1–3 weeks), L (more than 3 weeks).

### A. Foundation (BP sections 1–8)
| # | Spec (page) | Requirement | Status | Evidence | Effort |
|---|---|---|---|---|---|
| 1 | BP p3, MDF01 p2–16 | Company→Brand→Branch→Kitchen→Store; Booking→Event→Sub-Event→Session | DbD / Missing | only `branches`; `bookings` = event (data-model.md) | L |
| 2 | BP p3 | Golden rules: no direct stock edit, no silent payment/closed-event edit, backend calculates money | Partial | Money is server-owned (security-review). Stock is still client-editable (residual risk 3). No close lock. | M |
| 3 | BP p3, TWF01 p3 | Lead pipeline: New→Assigned→Contacted→Requirement→Qualified→Quotation Ready→Converted; Lost/Duplicate/Invalid | Partial | `leads`: new/contacted/tasting/quoted/won/lost, lostReason, followUpDate, source, campaignId. No assignment, no Duplicate/Invalid status. | S |
| 4 | BP p4, CMF02 p4 | Customer 360: multiple phones/contacts/addresses, billing/tax profile, consent history, credit/risk | Partial | Customer has one phone/email/address, whatsappOptIn, source, referredBy. 360 view only on Android (`CustomerDetailScreen`); web has list and form only. | M |
| 5 | BP p4, CMF15 p28, TWF03 p7 | Booking as commercial parent: payment schedule, contract, hold expiry, Tentative→Advance Pending→Confirmed | Partial | Booking statuses Inquiry/Confirmed/InProgress/Completed/Cancelled. `advancePaid` is typed by the client. No schedule, contract or postpone status. | M |
| 6 | BP p4, CMF16 p30 | Event: 12 statuses, BEO versions, capacity/conflict check | Partial | Booking holds date, venue (free text), guests, assigned staff and service timeline (§12). No BEO versions or conflict check. | M |
| 7 | BP p4–5, CMF17 p32, TWF04 p8 | Meal Session as a separate object with its own guests, menu, staff, cost | **Missing** | none | L |
| 8 | BP p5, CMF03 p6 | Venue master + versioned site survey | **Missing** | `venue` is a text field | M |

### B. Food & Inventory (BP sections 9–24)
| # | Spec | Requirement | Status | Evidence | Effort |
|---|---|---|---|---|---|
| 9 | BP p5, CMF09 p16 | Menu master, versioned; menu lines point to Products | Partial | `menuPackages` (10 seeded, pick-one groups, extras, replacements, menuDate) and `menuItems`. No version history. | S |
| 10 | BP p5–6, CMF07 p12 | Product: recipe link, standard/estimated/actual cost, in-house/outsourced | Partial | `dishes` (basePer100, learned values) and `menuItems` are separate and not linked to items | M |
| 11 | BP p6, CMF04 p8, P06 p4 | Item master: one ID per real item, SKU, aliases, purchase/stock/recipe UOM | Partial | `inventory` items exist, but the purchase catalogue is hard-coded in `PurchaseCatalog.kt` as name strings. No aliases. "Lemon" is in both the Vegetables and Fruits lists. | M |
| 12 | BP p6 | Product-wise inventory drill-down | Missing | — | L |
| 13 | BP p7 | Item-wise: reserved/committed/available, batch, location, price history | Partial | Has quantity, reorderLevel and IN/OUT movements. The `priceWatch` agent watches purchase prices. | M |
| 14 | BP p7, CMF06 p11 | UOM / conversion engine (1 bag = 25 kg) | **Missing** | Units are free-text pick lists | M |
| 15–16 | BP p7–8 | Batch/lot/expiry, FEFO; stock locations (cold store, vehicle, venue, quarantine…) | Missing | checklist G3 marked ⏳ (later phase) | L |
| 17 | BP p8, TWF07 p12 | Stock only through typed movements (15 types) with evidence | Partial | Movements are IN/OUT with reason and bookingId. `quantityInStock` is client-writable. Editing a purchase does not reverse its stock. | M |
| 18 | BP p8, Decision 07 | Compulsory stock reservation for confirmed events | Missing | — | L |
| 19–21 | BP p9, CMF08 p14 | Versioned Recipe/BOM, sub-recipes, yield stages | DbD | Quantity per 100 guests learned from cooked vs leftover (calc §5), grocery list per 100 guests (§6), 5% buffer | L |
| 22 | BP p9, IMP p15 | Standard, estimated and actual cost kept separate; never overwritten | Partial | Plate cost / suggested price (§3) and booking `costActual`. No estimated-cost snapshot on quotations. | M |
| 23 | BP p9–10 | Pricing engine incl. low-margin warning/approval | Done (except approval) | `quoteForMenu` §11, margin bands §3 | S |
| 24 | BP p10, TWF05 p10 | Demand planning across all upcoming events, net of stock and incoming | Partial | `groceryList` per event with inStock/toBuy. No consolidation across events, no 1/3/7/15/30-day views. | M |

### C. Procurement & Operations (BP sections 25–36)
| # | Spec | Requirement | Status | Evidence | Effort |
|---|---|---|---|---|---|
| 25 | BP p10, TWF06 p11 | PR→RFQ→quote comparison→PO→approval→GRN→bill→payment | Partial (direct bill only) | Android purchase entry: multi-line bill, bill photo, staff auto-link, 8 folders. Web is a read-only list. | L |
| 26–27 | BP p10–11 | GRN quantities (ordered/delivered/measured/accepted/rejected/short); three-way match and payment hold | **Missing** | — | L |
| 28 | BP p11, CMF10 p18 | Vendor 360: rate cards, terms, score, outstanding derived from bills | Partial | Vendor has name, phone, address, notes only | M |
| 29 | BP p11–12, CMF11 p20, TWF09 p15, P06 p17 | One outsource engine: ordered/delivered/accepted/returned, advance/balance, per session | Partial | An "Outside Purchase" expense section with variant list (Pulka, Bobbatlu, Ice Cream, Pan…), one quantity, advance/balance | M |
| 30 | BP p12, TWF08 p14 | Production plan → batch → QC → ready → pack → dispatch | Partial | `cookingPlan`/`saveCookingPlan`, `saveCookLog`, service timeline §12 (prep/cook/load/leave times) | M |
| 31–33 | BP p12–13 | Multi-kitchen sections; packing engine (containers, seals); dispatch/venue receipt | Missing | timeline steps only | L |
| 34 | BP p13, TWF10 p17 | Live counter board (opening/replenishment/served/closing) | Partial | counter cost is an expense section only | M |
| 35 | BP p13 | Time-stamped live guest-count log | Partial | guestCount, guestCountConfirmed, guestCountActual. No log or correction history (auditLog diffs only). | S |
| 36 | BP p13 | During-event customer extras: request→price→customer and ops approval→billing | Partial | Extras exist only at quotation time | M |

### D. People & Logistics (BP sections 37–44)
| # | Spec | Requirement | Status | Evidence | Effort |
|---|---|---|---|---|---|
| 37 | BP p13–14, CMF12 p22 | Staff master: monthly/daily/hourly/per-event/contract | Partial | `payType` daily/monthly, skills, emergency phone | S |
| 38 | BP p14, TWF11 p19 | Roster, shifts, check-in/out, late, no-show, replacement | Partial | `markAttendance` (hours, present/half/absent/leave, bookingId), `assignedStaffIds` | M |
| 39 | BP p14, P06 p19 | Temporary staff settlement (rate, OT, advance, pending) | Partial | Expense sections Temporary Staff and Staff Advance | S |
| 40 | BP p14 | Payroll with lock after approval | Mostly done | `monthPayroll`, §7/§7b, `overridePayrollRow`. No lock. | S |
| 41 | BP p15, CMF13 p24 | Vehicles and trips | Partial | Backend only (`vehicles`, `vehicleTrips`, `costOnVehicleTrip`). **No web or Android screen.** | S–M |
| 42 | BP p15, CMF14 p26 | Equipment/vessels: reserve→issue→return→damage | Partial | Backend only (`equipment`, `equipmentMoves`, `costOnEquipmentMove`). **No screen.** | S–M |
| 43 | BP p15–16 | Wastage by reason (14 types) | Partial | Leftover per dish in cookLog | S |
| 44 | BP p16 | Food safety (allergens, hygiene checklist, traceability) | Missing | checklist D9 "special meals" ⏳ | M |

### E. Finance & Control (BP sections 45–56)
| # | Spec | Requirement | Status | Evidence | Effort |
|---|---|---|---|---|---|
| 45 | BP p16, CMF18 p34 | Every expense tagged to an Event or an Overhead cost centre; split allocation | Partial | 9 sections, optional `bookingId`. No cost-centre field, untagged expenses allowed, no splits. | S |
| 46 | BP p16, TWF13 p21 | Finance flows: advance, invoice, receipt, credit note, refund, vendor bills/payments, petty cash | Partial | Invoice, `recordPayment`, `refundOrAdjust`, cash report. No vendor payable, credit note or petty-cash close. | M |
| 47 | BP p16–17, CMF19 p36 | Chart of accounts, double-entry ledger, period locks | **Missing (by design)** | — | L |
| 48 | BP p17 | Cost allocation (one bill split across events and overhead) | Missing | — | M |
| 49 | BP p17, IMP p16 | Event contribution and net profit after allocated overhead | Partial | `bookingCost()`: income minus direct costs. **Purchases have no bookingId on Android or web**, so purchase cost never reaches event profit. | S (link) / M (overhead) |
| 50 | BP p17, TWF14 p23 | 7-stage event close, blockers, reopen with approval | **Missing** | — | M |
| 51 | BP p17–18, TWF15 p24 | Complaint workflow | Partial | `complaints`, `referrals`, `tasks` collections and rules exist; **no UI** on either client | S |
| 52 | BP p18 | Reminders and escalation | Partial | 13 agents (dues, follow-ups, event readiness, stock watch…). No escalation chain. | S |
| 53 | BP p18, CMF20 p38 | Approval engine (discount, purchase, refund, stock adjustment…) with limits | **Missing** | only user approval and `approveMessage` | M |
| 54 | BP p19, IMP p11–13 | 17 roles, action-level permissions, data scopes, segregation of duties | DbD | admin/manager/staff plus branch scope (security-review) | L |
| 55 | BP p19 | Audit: actor, role, device, old/new, reason | Mostly done | `auditLog` change triggers, override reason, `/history`. No device or role recorded. | S |
| 56 | BP p19–20, P06 p4 | Master-data governance: duplicate warning, merge, aliases | Partial | `importRows` skips duplicate phones. No merge or alias. | M |

### F. Mobile, Owner & Reporting (BP sections 57–62)
| # | Spec | Requirement | Status | Evidence | Effort |
|---|---|---|---|---|---|
| 57 | BP p20, IMP p21 (24 mobile screens) | Role-based mobile operations | Partial | Android has about 50 routes (bookings, kitchen, attendance, purchases, expenses, target board). No driver, store or GRN screens. | M |
| 58 | BP p20, IMP p33 | Offline queue, sync states, conflict handling, idempotency | Partial | Firestore offline persistence. Callables (payments, quotes, attendance) need network. No idempotency keys in the API contract. | M |
| 59 | BP p20–21 | Owner command dashboard, every KPI drills to source | Partial | Dashboard, Target Board, `getPnl` (with leaks, prime cost, break-even), morning summary | M |
| 60 | BP p21–22, IMP p27–29 (92 reports) | Report catalogue | Partial (~10) | P&L, cash report, staff/item purchase reports, person-wise expense report, ads ROI | L |
| – | IMP p17–21 | 141 web screens | ~38 web routes | `AppRouter.tsx` | — |
| – | IMP p23–26 | REST `/api/v1`, response envelope, 409/422 codes | DbD | Firebase callables + direct Firestore | — |
| – | IMP p31–32 | 28 mandatory business test scenarios, UAT sign-off | Partial | 53 server tests, independent calculation checker | M |
| – | IMP p33–34 | Backups, restore drill, monitoring | Partial | backup agent at 02:00 (needs Blaze plan); no restore drill | S |
| – | P06 p3–28 | 9 purchase folders + 8 expense sections, sticky search, staff auto-link, multi-item bill, reports, finance-derived status | **~60% (Android only)** | Folders, seed lists, bill photo, staff/item/person reports exist. Missing: aliases, Item-ID identity, GRN routing, Supplier report, Purchase dashboard, Outside Purchases as an order flow, and any web purchase entry. | M |

## 3. Conflicts (spec vs what we decided)

1. **GST**
   - **Spec:** a configurable tax engine with tax profiles per registration and place-of-supply. Formulas are "owner configuration required" (IMP p14, p15; CMF19 p36).
   - **Ours:** one hard-coded rule (discount before tax, CGST/SGST halves or IGST), rate 0 until a GSTIN is entered, "Invoice" vs "Tax Invoice" title (calc-spec §1, api-contract).
   - Close to the spec in practice, but an accountant must confirm the rate and the discount treatment before GST goes live.
2. **Payment edits and refunds**
   - **Spec:** no silent payment edits. A refund is prepared, verified, approved and then paid as separate steps (BP p3; IMP p13).
   - **Ours:** `refundOrAdjust` is an admin-only negative payment, with no approval chain.
3. **Invoice total overrides**
   - **Spec:** the final invoice may differ from the quote only through approved extras or changes (TWF02 p6).
   - **Ours:** `overrideInvoiceTotal` lets the owner, or a manager if allowed, change the total with a reason. It is audited but not approved.
4. **Stock editing**
   - **Spec:** stock changes only through movements; negative stock is off by default (BP p3, Decision 06 p24; MDF01 p11–12).
   - **Ours, in four ways:**
     - Any active user can write `quantityInStock` (security-review residual risk 3).
     - Editing a purchase does not reverse its stock.
     - Stock deduction when an event completes is an estimate from the per-100 grocery list, not real issues.
     - Shortfalls are capped at 0 and recorded as `shortBy`.
5. **Roles**
   - **Spec:** 17 roles plus Verify/Approve/Pay/Reopen actions and segregation of duties (IMP p11–13).
   - **Ours:** the owner's choice of Owner / Manager (no profit visibility) / Staff.
6. **Numbering**
   - **Spec:** codes like CUS-000001, EVT-000001, COM-0001, format configurable (IMP p2; MDF01 p13).
   - **Ours:** SC-Q-YYYY-0001 and SC-INV-YYYY-0001 come from a server counter. Android purchases use `PUR-YYYY-<last 6 digits of a timestamp>`, which is not guaranteed unique. Customers and bookings have no display codes.
7. **Hard delete**
   - **Spec:** no hard delete of transactional history (IMP p2; P06 p27).
   - **Ours:** `firestore.rules` lets the admin delete customers, bookings, quotations, staff, purchases, expenses and more (about 20 `allow delete: if isAdmin()` rules). Invoices and payments cannot be deleted.
8. **Advance and payment status**
   - **Spec:** advance is finance-derived (CMF15 p28); payment status for purchases, expenses and outsourcing is finance-derived (P06 p22; TWF09 p16).
   - **Ours:** `bookings.advancePaid` is typed by the client. Purchase and expense statuses are typed by the user, using two different word lists (Paid/Pending/Partial vs Unpaid/Advance Paid/…).
9. **Quotation versions**
   - **Spec:** every change creates a new version and old versions stay readable (TWF02 p5).
   - **Ours:** `saveQuotation` updates the same document; only the history log keeps the diffs.
10. **Statuses**
    - **Spec:** 12 event statuses (BP p4) and the booking/lead flows above.
    - **Ours:** 5 booking statuses. Our lead flow has a "tasting" step the spec lacks.
    - "Completed" triggers stock deduction, but completed events have no lock. The spec says operational completion is not financial close (TWF14 p23).
11. **Payroll lock**
    - **Spec:** payroll is locked after approval (BP p14; TWF11 p19).
    - **Ours:** payroll rows can be overridden at any time.
12. **Profit**
    - **Spec:** contribution profit and net profit after allocated overhead (BP p17).
    - **Ours:** per-event profit is contribution only. Rent and other fixed costs appear only in the monthly P&L and break-even.
13. **Money type**
    - **Spec:** fixed decimal, never floating point (IMP p2).
    - **Ours:** JS numbers and Kotlin Doubles with `round2`. Low practical risk.
14. **Company identity**
    - The spec's example company is "Ramanadh Global Private Limited" (MDF01 p2). The owner's saved notes say the company being incorporated is Suseela Technologies Pvt Ltd, with Suseela Caterings as the brand. Confirm which is the real legal entity before building a Company master.

## 4. Top 10 gaps to close first (for daily running, not ERP completeness)

1. **Link every purchase to an event or to "General overhead" (S).** Today purchase cost never reaches event profit because purchases have no `bookingId`, so every event looks more profitable than it is. It is also the spec's basic rule (P06 p3, rule 9).
2. **Stop direct stock edits (S–M).** Send all stock changes through the `adjustStock` callable, reverse stock when a purchase is edited or cancelled, and lock the `quantityInStock` field in the rules. Otherwise stock and the low-stock alerts can't be trusted.
3. **Replace admin hard-delete with cancel or soft-delete (S).** A mistaken tap shouldn't erase a booking or bill history. This is a rules change.
4. **Vessels/equipment and vehicle screens (S–M).** The backend already exists, and these are daily pains (checklist G5/G6): lost vessels, insurance expiry.
5. **Meal sessions inside a booking (M, lightweight).** Weddings have several meals; each needs its own guests, menu, time and cost. This could be a `sessions[]` list on the booking rather than the full spec hierarchy.
6. **Outside orders as real orders (M).** Pulka, bobbatlu, ice cream and paan need ordered / delivered / accepted / returned quantities, advance and balance, per event. This prevents paying for short deliveries.
7. **During-event extras and live guest count flowing into the final invoice (M).** Extra plates and items are where money leaks at the venue.
8. **Payment status calculated by the system for purchases and expenses, plus a vendor dues view (M).** The owner needs to know who he owes, and one consistent status vocabulary.
9. **Simple event close (M).** A checklist (vessels back, staff paid, vendor bills in, customer paid), then lock, with reopen allowed only with a reason. This gives a final, trustworthy event profit.
10. **Quotation versions plus a complaints/feedback screen (S each).** Disputes need the version the customer agreed to. The complaints collections already exist, but there is no screen for them.

All of this comes after deployment. Nothing is live yet (checklist N7, O10), so the first test event will show which of these hurts most.

## 5. Spec items the owner can safely defer at this stage

- 17 roles, delegation, segregation of duties, configurable approval limits. The owner approves everything himself.
- Double-entry ledger, chart of accounts, journals, bank/UPI reconciliation, period locks. Leave these to the CA's accounting software.
- PR → RFQ → vendor quote comparison → PO → three-way match. Kirana and vegetables are bought daily, direct from the market.
- Company / Brand / Branch / Kitchen / Store / Zone / Rack / Shelf / Bin hierarchy. There is one kitchen. Keep the branch field so this can be added later.
- Batch/lot, FEFO, quarantine, cold-store locations, the stock reservation engine.
- Full recipe/BOM with sub-recipes, yield stages, three-layer costing. The learned per-100 approach is simpler and already works.
- Packing engine (container IDs, seals), dispatch board, multi-kitchen sections.
- Food-safety allergen matrix and recall tracing. A veg/non-veg flag and a hygiene checklist are enough for now.
- 141 web screens, 92 reports, a REST `/api/v1` API, MFA, formal RPO/RTO.
- Vendor scoring, customer consent history and merge, overhead allocation runs.

## Old project `Catering-CRM-Complete-v15/`

It is **not** an earlier implementation of these specs. Its files are dated 12 Aug 2026, before the specs were frozen (14–15 Aug), and it contains none of the spec's concepts (no sessions, GRN, three-way match, CMF or TWF). It is a different stack: Next/Vinext + Cloudflare D1/R2, with a Capacitor WebView Android app and 26 tables.

Worth borrowing only as field lists for the gaps above:
- `outside_food_orders`, `equipment_movements` (sent/returned/damaged), `event_logistics` (km rate)
- `event_checklist`, `wastage_records` (prepared/served/returned/wasted)
- `recipe_ingredients` (quantity per 100 guests per ingredient: a light recipe/BOM)
- `payment_approvals`
- the GST inclusive/exclusive logic in `lib/business-logic.ts`

No code is worth reusing directly.
