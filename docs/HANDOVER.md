# HANDOVER — Suseela Caterings CRM (written 19 Nov 2026; last updated 20 Nov 2026, 10:45 IST)

For the next Claude session that continues this work. (A human developer should start with `docs/DEVELOPER-HANDOVER.md`.) Read this first, then `docs/ROADMAP-full-spec.md`
(progress log at the bottom = the detailed history) and `docs/requirements-checklist.md` (section X, rows X1–X76).

## 1. Who and how
- Owner: Sahu Sainadh (Hyderabad), Suseela Caterings. **Reply in Telugu script, short.** He does not read English.
- **Do not stop to ask for a go-ahead at each step.** Decide, do, report. Stop only for what only he can do.
- Decision: build everything in the frozen spec PDFs (`docs/spec/`) + a Smart-CRM-style leads layer; go live only
  when all of it is done. Order: Module 1 leads, 2 recipe / batch, 3 purchase flow, 4 ledger + 17 roles, then 5.
- Report honestly: say what is only code, what passed tests, what was never seen on a screen.

## 2. The project
- Folder on his Mac: `/Users/apple/Desktop/Suseela catering CRM APP` (no git; deleting is not permitted).
- Firebase Cloud Functions (TypeScript, asia-south1) in `functions/`, Firestore rules `firestore.rules`,
  React + MUI + Vite web in `web/`, Android Kotlin / Compose in `app/`, docs in `docs/`.
- Patterns to keep: money and stock are server-owned; a pure rules file + `node --test` tests for every feature
  (`functions/test/moduleNN.test.ts`); errors bilingual `fail(code, te, en)`; web text `L("తెలుగు", "English")`;
  every callable is `callable("name", LEVELS, handler)` and needs a line in `functions/src/roles/callablePerms.ts`
  (a test fails otherwise); before changing files copy the originals to `_snap/<date>_<slice>/`.
- After each slice update: `docs/requirements-checklist.md` (section X), `docs/ROADMAP-full-spec.md` (progress log),
  `docs/CODE-MAP.md` (only real file paths in backticks — checked by `python3 tools/check-code-map.py`).
- Hindi: `web/src/i18n/hi.json` is built from `tools/hi/batch*.json` by `python3 tools/hi/merge.py`; patterns with
  numbers go in `web/src/i18n/hi-patterns.json`. `python3 tools/extract-i18n.py` must report `todo: 0`,
  `python3 tools/hi/templates.py --todo` must list nothing.
- Generated files, never edit by hand: the job-role block in `firestore.rules` (`node tools/gen-role-rules.mjs`),
  `app/.../data/model/JobRoles.kt` (`node tools/gen-phone-roles.js`), `web/src/data/roles.ts` (copy of permRules).

## 3. How to check
- Quick (in the VM): `cd functions && npx tsc --noEmit -p . && npm test` · `cd web && npx tsc -b --noEmit`.
- Full, on the Mac: double-click `CRM Check.command` in the project folder (server tests, web build, rules tests in
  the emulator, phone build; ~3 minutes); read `_check-log.txt`. Rules and Kotlin can only be proved this way.
  Agreed rhythm: quiet VM checks after each part, the Mac check at the end of a module or after rules / Kotlin changes.
- Test Mode (`CRM Test Mode.command`, localhost:5173): used for the click-throughs of 20 Nov. If port 5173 is taken
  by the owner's other app (FreeLLMAPI), ask him to stop it first. Logins: `tools/seed-emulator.cjs`.
  Browser-tool tips: MUI selects = mousedown on the combobox then click the option; date inputs = native value
  setter + input event; autocompletes = type, then click the option; window.prompt / confirm block the tool — set
  `window.prompt = () => "reason"` in the page first; a file upload = DataTransfer into the hidden file input.
  The functions emulator picks up a server change after `cd functions && npm run build`.

## 4. Where things stand
NOTE 20 Nov 17:40: Kotlin written after this stamp (X58 `StockApprovalDialog.kt`, X59 salary pay on phone) is NOT compiled yet — run the Mac check first.
Mac check passed 23:03 IST (see below) for Razorpay link/webhook (X61), customer portal (X62), calendar notes page + rules (X63), phone X58/X59 — compiled and tests pass, but none clicked on screen. Before go-live set secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (`firebase functions:secrets:set NAME`, enter `none` until the owner has a Razorpay account), then in Razorpay dashboard add the `razorpayWebhook` URL for event `payment_link.paid`. WhatsApp: `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` + Meta-approved templates.
Last Mac check: 21 Nov 00:21 IST (X78 web calendar-note photos included; X77 audit fixes + lint step; earlier 20 Nov 23:55 IST X72–X76: phone logo upload, calendar-notes bookings/photos, server Hindi on web + phone) — server 370/370, rules 351/351, web build OK, phone build OK (earlier: phone masters add/edit X71 and print/portal Hindi X70 included) (phone Hindi X69 included) (Hindi server messages X68 included; earlier items below) (phone calendar-notes X65, job-role chips X66, masters list X67 included) — server 370/370, web build OK, rules 348/348, phone build OK (covers everything
including Module 6a: GRN store choice, branch transfer, veg-only booking block, customer allergy note, kitchen split, refund approval, salary-payment cancel button, brand logo on invoices, store shelf locations, phone veg-only booking rule — all code + tests only, NOT clicked on screen). The check stops Test Mode (it kills the emulators) and recent Test Mode data can be lost — close the
Test Mode window first, then run the check; start Test Mode again afterwards. Nothing has changed since this check.

| Module | State |
|---|---|
| 1 Leads + pipeline | code complete web / server / phone, Mac check passed |
| 2 Recipe / BOM, batch / expiry | code complete, Mac check passed |
| 3 PR → PO → GRN → 3-way match | code complete, Mac check passed, **never clicked through** |
| 4a–4c books, books from documents, period lock | Mac check passed, **never clicked through** |
| 4d 17 roles: callables, rules, sensitive figures, pay in private doc, stock-adjust approval, phone menu | Mac check passed, never clicked through |
| 4e salary payments · 4f bank statement check · 4g month-close checklist · 4h overhead share | Mac check passed, never clicked through; 4f never tried with a real bank file |
| 5a masters Company → Brand → Branch → Kitchen → Store | Mac check passed, never clicked through |
| 5b company / brand on bookings + invoices, brand report | Mac check passed, never clicked through |
| 5c stock by store + transfers | Mac check passed, never clicked through |
| 5d food safety part 1: batch hold, decision, trace | Mac check passed, never clicked through |
| 5e food safety part 2: owner-written checklists, checks, incidents | Mac check passed, never clicked through |
| 5f packing + dispatch of an event | Mac check passed 20 Nov 08:21 IST; **clicked through end to end 20 Nov 09:15** (create, six steps, shortage) |
| 5g dispatch polish (web only): fill names from the booking menu, vehicle picker, printable load sheet | clicked through 20 Nov (all three) |
| 5h allergen matrix + veg / non-veg separation (Food safety → "Allergens" tab) | code + 9 tests; clicked through 20 Nov 11:00; see ROADMAP |
| 5j dispatch: quantities from the cooking plan (button in the new-dispatch dialog) | web only; seen on screen 20 Nov 11:25; see ROADMAP |
| 5i reminders for checks not done (owner sets "daily by" time per checklist; `safetyCheckWatch`) | code + 1 test (347/347); time box + chips seen on screen 20 Nov 11:19; the notice itself only unit-tested; see ROADMAP |
| Click-through 20 Nov (5 parts, X33–X35) | every web screen of Modules 3–5 used on screen; see the ROADMAP entries |

## 5. Pending, in order
1. **Click-through — DONE 20 Nov (09:15–10:35 IST), five entries at the end of `docs/ROADMAP-full-spec.md`.**
   Every web screen of Modules 3–5 was used on screen. Fixed on the way: /menu Telugu; held bills on /vendor-dues;
   seed wiping the branch. Not possible here: the phone app (owner's phone, step 9), a real bank file (step 7).
   **Open decision for the accountant:** payroll is booked on the last day of the month, a salary payment on the day
   paid, so mid-month "Salaries payable" goes negative until month end (date the payroll entry on the finalise day?).
   Last Mac check result: see section 4 (run `CRM Check.command` again after any server / rules / Kotlin change).
2. Rest of Module 5 (spec PDFs in `docs/spec/`; extract text with `pdftotext -layout` as was done for
   `MDF-01-company-brand-branch.txt`): the rest of dispatch (quantities from the cooking plan DONE as 5j; write vehicleTrips / equipmentMoves automatically — NOT done on purpose: they feed booking cost, needs the owner's rule — the vehicle is already picked from the list; proof photo; phone. 5g web polish clicked through 20 Nov), the rest of food safety (allergen matrix + veg / non-veg DONE as 5h; reminders for checks not done DONE as 5i; still open: kitchen-level veg separation, phone screen — the checklists themselves are written by the owner in the app; the spec forbids inventing checkpoints or limits), remaining screens and reports. All spec text is in `docs/spec/txt/`.
   Read the spec pages first; nothing of these is started.
3. Left open inside 5a–5c: store choice on purchase / goods receipt; event issue from a chosen store; batches per
   store; branch-to-branch transfer; Zone → Rack → Shelf → Bin; approval for sensitive master changes (GST, bank);
   bank / UPI account masters; brand logo and name on printed invoices; store picker in the web adjust dialog
   (the server already accepts `storeId`); phone screens for masters and stores.
4. Left open in Module 4: B5 workflows for refund, payroll stages and customer discount (owner-only today);
   cancel button for a salary payment on the web (callable exists); phone screens for salary payment and for
   deciding stock adjustments; role assignment on the phone (web Users page only); `/history` for the System Admin
   role; a pay change shows in history as "figure removed" instead of old → new; "Staff Advance" expense +
   staffAdvances may double count in the books; ledgerReport reads whole collections (slow when data grows).
5. `docs/api-contract.md` is not written for Modules 3, 4, 5.
6. Click-through in Test Mode of Modules 3, 4, 5 (needs port 5173 free).
7. A real bank statement Excel file from the owner to prove 4f.
8. Hindi: server error messages, notifications, history sentences, printed documents and the whole phone app are
   still Telugu / English only. A Hindi speaker should read the Hindi once.
9. At the very end: the owner's hands-on check on a real phone; then go-live steps (`DEPLOY-STEPS.md`).

## 5a. Where the files are (all under the project folder)
| What | Where |
|---|---|
| This handover | `docs/HANDOVER.md` |
| Detailed history, newest at the bottom | `docs/ROADMAP-full-spec.md` |
| Every requirement and its state (rows X1–X32 = this build) | `docs/requirements-checklist.md` |
| Which file does what | `docs/CODE-MAP.md` |
| Frozen spec PDFs / their text | `docs/spec/` · `docs/spec/txt/` |
| Server code (one folder per feature: `leads`, `procure`, `ledger`, `roles`, `staff`, `masters`, `stock`, `safety`, `dispatch`, …) | `functions/src/` |
| Server tests (`moduleNN.test.ts`) | `functions/test/` |
| Who may call what (17 roles) | `functions/src/roles/permRules.ts`, `functions/src/roles/callablePerms.ts` |
| Database security rules + their tests | `firestore.rules`, `functions/test/` (rules tests run in the Mac check) |
| Web screens (one folder per screen) | `web/src/modules/` |
| Web calls to the server | `web/src/data/functions.ts` |
| Web routes / menu | `web/src/routes/AppRouter.tsx`, `web/src/components/AppShell.tsx` |
| Hindi text + tools | `web/src/i18n/hi.json`, `web/src/i18n/hi-patterns.json`, `tools/hi/` |
| Android app | `app/` |
| Full check on the Mac / its result | `CRM Check.command` → `_check-log.txt` |
| Test Mode on the Mac | `CRM Test Mode.command` (data in `.test-data/`) |
| Go-live steps | `DEPLOY-STEPS.md` |
| Copies of files as they were before each change | `_snap/<date>_<slice>/` |

How the Mac check was run from a cloud session: computer use → grant Finder + Terminal → Finder, Cmd+Shift+G →
`~/Desktop/Suseela catering CRM APP` → select `CRM Check.command` → Cmd+O → wait about 3 minutes → read
`_check-log.txt` with `grep -aE "^=====|STEP-RESULT|^# (tests|pass|fail)|RESULT:|built in|BUILD"`.

## 6. Owner decisions still open (current defaults in brackets)
- New-customer setup checklist (one Firebase project each): `docs/NEW-CUSTOMER-SETUP.md` (never run for a second customer yet; a one-file `brand.config` refactor is suggested first).
- Selling to other brands (20 Nov): plan + market comparison in `docs/PRODUCT-COMPARE-and-SELL-PLAN.md` — per-customer deployment first, true multi-tenant later; owner to choose.
- Manager purchase-order limit [₹10,000 — owner did not know what a PO is; explained; needs his number if he wants a change] · separation of duties from [₹10,000], owner exempt [yes].
- Any charge on a vendor bill not on the order holds the bill [strict].
- Stock change by store / staff waits for approval from [30 % of stock on hand — owner's choice, 20 Nov].
- Month lock: owner and manager (server; unlock owner only). The Books page is still owner-only, so managers have no button yet — owner said "later" (20 Nov), so it stays owner-only for now.
- Payroll ledger date: decided by me (owner could not choose) — booked at month-end, or the finalize day if that is earlier (X55).
- Discount approval limit: owner said yes it is wanted but gave no % or amount — NOT built; needs his number.
- Chart of accounts (22 fixed accounts) to be confirmed by his accountant.
- Spec "owner configuration": approval limits by role, a separate branch-manager role, backup approver,
  export permissions, MFA.
- Company legal name / GSTIN on the masters page (his Pvt Ltd registration is in progress).
- Outside accounts for Module 1: WhatsApp Business API number, telephony provider, Meta / Google / JustDial /
  IndiaMART lead access — manual fallback is built until each is connected.
- Food-safety checklist items and limits: three paused yes/no draft lists can be added with one button (X56); he must read, change and switch them on; temperature/number limits are his to write (none shipped).
- He was asked for screenshots of an Instagram reel design (the link could not be opened); none sent yet.

## 7. Prompt to paste into a new Claude session
```
Continue my Suseela Caterings CRM build. The project folder on my Mac is
"/Users/apple/Desktop/Suseela catering CRM APP" (connect it if it is not connected).
First read docs/HANDOVER.md, then the progress log at the end of docs/ROADMAP-full-spec.md and section X of
docs/requirements-checklist.md. Then carry on from "Pending, in order" in the handover, step 1.
Rules: reply to me only in Telugu script and keep replies short; do not stop to ask for a go-ahead at each step —
decide and do; tell me honestly what is only code and what was actually tested; keep docs/HANDOVER.md up to date
whenever a part is finished.
```
