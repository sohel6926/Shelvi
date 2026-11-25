# Suseela CRM — market comparison, ideas to add, and plan to sell to other brands (20 Nov 2026)

## ఓనర్ కోసం సారాంశం (Telugu)
1. ఇతర caterers కు అమ్మవచ్చు. ఇప్పటికే Company → Brand → Branch నిర్మాణం ఉంది, కాబట్టి ఒక కంపెనీలో చాలా బ్రాండ్లు వాడగలవు. కానీ "చాలా వేర్వేరు కంపెనీలు ఒకే సిస్టమ్‌లో" (multi-tenant) ఇంకా లేదు.
2. సులభమైన మొదటి దారి: ప్రతి కస్టమర్‌కు ఒక వేరే Firebase ప్రాజెక్ట్ (కోడ్ మార్పు దాదాపు లేదు, డేటా పూర్తిగా వేరుగా ఉంటుంది). కస్టమర్లు పెరిగాక నిజమైన multi-tenant చేయవచ్చు.
3. బయటి CRMలతో పోలిస్తే మనకు ఉన్న బలాలు: తెలుగు UI, పర్ ప్లేట్ ప్యాకేజీ ధరలు, వంట పరిమాణం నేర్చుకోవడం, ఫుడ్ సేఫ్టీ/అలెర్జెన్, లెక్కల పుస్తకాలు (ledger), జీతాలు.
4. లేనివి (మార్కెట్‌లో ఉన్నవి): ఆన్‌లైన్ చెల్లింపు లింక్ (Razorpay/UPI), కస్టమర్ పోర్టల్ + ఈ-సైన్, WhatsApp అసలు కనెక్షన్, Tally/Zoho ఎగుమతి, డెలివరీ లైవ్ ట్రాకింగ్, ఈవెంట్ తర్వాత రేటింగ్/ఫీడ్‌బ్యాక్, లాయల్టీ, subscription బిల్లింగ్ (అమ్మకానికి).
5. పాత v15 CRM లో ఉండి మనలో లేనివి: పండుగల క్యాలెండర్, ఐడియాలు/నోట్లు, క్యాలెండర్ ఫొటోలు.

---

## 1. What is on the laptop
`Catering-CRM-Complete-v15/` — an earlier, separate catering CRM (Next.js + Cloudflare D1/R2, Capacitor Android; English/Telugu/Hindi). Not Firebase, so its code is not reused; only its feature ideas.
Features it has: festivals + ideas + notes + photos on the calendar, bill-photo capture, wastage records, equipment movements, event logistics (kilometre charges, driver settlement), outside food orders (sweets, paan, ice cream), payment approvals, activity log + restore, automatic/manual backups, GST CGST/SGST/IGST.
Compared with ours (checked in `docs/requirements-checklist.md` and `functions/src`):
- Already in ours (and deeper): outside orders, backups, audit/activity, payment/refund approval, wastage, GST, equipment, logistics, kitchen, stock, ledger, payroll.
- Not in ours: **festival calendar entries, "ideas" notes on the calendar, calendar photos**. Small to add (a calendar-notes collection + a web calendar form).

## 2. What outside catering software offers (web research, Nov 2026)
Sources: Capterra catering category and product pages (Tripleseat, Caterease, CaterZen, Better Cater, Flex Catering, Planning Pod, CaterTrax, Skanda, CaterKit, Apron Desk), the India comparison on dineopen.com, Odoo catering modules, and GitHub `ury-erp/ury` (restaurant ERP on ERPNext).
Common feature set: proposals/quotes, e-signature, online payments, event calendar, kitchen/menu and recipe management, billing, CRM, email marketing, online ordering, delivery tracking, staff scheduling, reports, integrations (QuickBooks, Google Calendar, Gmail).
India-specific must-haves (dineopen.com): large multi-course orders with guest-count changes, calendar with conflict flags, per-plate costing with transport/equipment, staff across several events, custom menu from a master dish library, advance/instalment/final payments with GST invoice.
Indian price points quoted there: about ₹899/month (DineOpen) to ₹8,000–12,000/month (CaterZen, Petpooja, Primasol). That is the range a seller would be compared against.

## 3. Our CRM against that list
| Area | Ours |
|---|---|
| Quote → invoice → advance/instalment payments, GST | Yes |
| Guest-count change, menu packages, per-plate rules | Yes (plus free plates, serving boys) |
| Calendar with conflicts | Yes |
| Per-plate costing + event profit | Yes (cost actuals, ledger) |
| Staff on many events, attendance, payroll, advances | Yes |
| Kitchen plans, grocery lists, stock, batches/expiry, stores | Yes |
| Purchases, vendor bills, three-way match | Yes |
| Food safety, allergen matrix | Yes (checklists are owner-written) |
| Accounting ledger, month lock | Yes |
| Telugu UI, Hindi (web) | Yes (phone Hindi not yet) |
| Online payment link / UPI collect | **No** |
| Customer portal: view quote, accept, e-sign | **No** (quotation accept is staff-side) |
| Real WhatsApp / telephony / lead-source connections | **No** (needs owner's accounts) |
| Tally / Zoho / CSV accounting export | **No** |
| Delivery live tracking (GPS) | **No** |
| Post-event feedback / rating request | **No** |
| Loyalty / repeat-customer offers | **No** |
| Festival + idea notes on calendar | **No** |
| Subscription plans, per-customer billing, onboarding | **No** (needed only for selling) |

## 4. Ideas to add, in order of value for a seller
1. Razorpay/UPI payment link on invoices (needs owner's merchant account).
2. Customer portal page (public link per quotation: view, accept, pay advance). E-sign can be "accepted with OTP".
3. WhatsApp Business connection (already designed; waits for his number).
4. Tally/Zoho export of the ledger (CSV first).
5. Post-event feedback form sent by WhatsApp; rating shown on the dashboard.
6. Festival + ideas notes on the calendar (from v15).
7. Repeat-customer reminders / simple loyalty.
8. Delivery vehicle live location (phone GPS, share a link).

## 5. Selling to other brands — two ways
**A. One deployment per customer (recommended first).**
Each customer gets their own Firebase project, web site and Android build with their name/logo. Their data is fully separate, which is also the easiest answer to "is my data safe?". Needed: a one-command setup script (project, rules, indexes, functions, first owner user, seed masters), white-label branding (logo, name, colours, app id), a customer price list, and a support routine. Little change to code.
**B. True multi-tenant (one system, many companies).**
Needs a company id on every document and every query, rules and functions that check it, per-company settings, a super-admin console, subscription billing and usage limits. It is a large refactor of all callables and the rules. Do this only after several paying customers on A.

**Already inside one customer:** several brands and branches (Company → Brand → Branch → Kitchen → Store), brand-wise invoice name/logo, veg-only brands. So a catering group with many brands can use one deployment today.

## 6. Who it suits
Wedding and event caterers, multi-branch caterers, central-kitchen groups, cloud kitchens and tiffin services with bulk orders, sweet shops with function orders, function halls with in-house catering. Weak fit for: single-counter restaurants (they need POS), pure event planners without a kitchen.

## 7. Before the first sale
- Finish his own go-live and real-phone test (`DEPLOY-STEPS.md`).
- Accountant sign-off on invoice wording and GST.
- Legal: privacy policy, terms, data-processing wording, backup/restore promise.
- Decide price, support hours, who hosts (customer's own Firebase bill vs. ours).
- Brand-neutral demo data and a 10-minute demo script.

## 8. Not done yet (honest)
Nothing here is built. This file is research and a plan only. The phone code written today is not compiled yet (Mac was locked).
