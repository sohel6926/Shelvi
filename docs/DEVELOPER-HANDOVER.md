# Developer handover — Suseela Caterings CRM

Written 21 Nov 2026 after a full code audit. For a human developer (or agency) taking over. `docs/HANDOVER.md` is the
older file for the next Claude session; this one is for people.

**ఓనర్ కోసం సారాంశం (Telugu):** ఈ ఫైల్ కొత్త developer కు: కోడ్ ఎక్కడ ఉంది, ఎలా నడపాలి, ఎలా test చేయాలి, ఎలా deploy చేయాలి,
ఏం పూర్తి కాలేదు, live కి ముందు ఏం చేయాలి. చివర "Before go-live" జాబితా చాలా ముఖ్యం.

## 1. What this is
Catering business system: leads, bookings, quotations, invoices, kitchen / cooking plans, stock, purchases, vendors, staff and
payroll, ledger and P&L, targets, WhatsApp / Razorpay hooks, customer portal. Three clients on one Firebase project:

| Part | Folder | Stack | Size (lines, 21 Nov 2026) |
|---|---|---|---|
| Server | `functions/` | Firebase Cloud Functions v2, TypeScript, Node 22, region `asia-south1`, IST | ~19,700 |
| Web admin | `web/` | React 19 + MUI 9 + Vite, TypeScript | ~36,300 |
| Phone app | `app/` | Android, Kotlin + Jetpack Compose, minSdk 24, targetSdk 35 | ~32,700 |
| Rules | `firestore.rules`, `storage.rules` | Firestore / Storage security rules | ~1,700 |
| Tools | `tools/` | rules tests, Hindi pipeline, code-map check, seed data | ~800 |
| Docs | `docs/` | spec, contract, data model, security review, checklist | ~3,900 |

Firebase project: `suseela-catering-crm` (`.firebaserc`). Auth, Firestore, Storage, Hosting (web), Functions.

## 2. Read in this order
1. `README.md` and `docs/CODE-MAP.md` — which file does what (every path in it is checked by `python3 tools/check-code-map.py`).
2. `docs/data-model.md` — collections and who computes what.
3. `docs/security-review.md` — who may read / write what (the access tables), and the rules-size history.
4. `docs/api-contract.md` and `docs/backend-notes.md` — every callable and trigger, per build round.
5. `docs/calc-spec.md`, `docs/money-calc-spec.md` — every formula (costs, GST, payroll, P&L).
6. `docs/requirements-checklist.md` — every owner requirement and its status (rows X1–X76); `docs/spec/` — the frozen spec PDFs.
7. `docs/ROADMAP-full-spec.md` — history log; `docs/HANDOVER.md` — current state and pending list.

## 3. Machine setup
- Node 22 (`functions/package.json` engines = 22), Java 21 (the check script uses `~/Library/Java/JavaVirtualMachines/jdk-21.0.13+9`), Android Studio (SDK path in `local.properties`, not committed).
- Firebase CLI: the check script uses `~/.suseela-tools/node_modules/.bin/firebase`; a global `npm i -g firebase-tools` works too. `firebase login`, `firebase use suseela-catering-crm`.
- Install: `cd functions && npm ci`, `cd web && npm ci`.
- Secret / local files (never share, never commit): `keystore/` (release keystore + `keystore.properties`), `local.properties`, `functions/.secret.local`, `web/.env.local` (copy `web/.env.example`), `app/google-services.json` (from Firebase console).
- Server secrets (Firebase Secret Manager): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Until real values exist they are `none` and messages stay queued (`firebase functions:secrets:set NAME`).

## 4. Run locally
- Easiest: double-click `CRM Test Mode.command` (starts emulators + web with seed data from `tools/seed-emulator.cjs`; no cost, no internet needed).
- Emulator ports (`firebase.json`): auth 9099, firestore 8080, functions 5001, storage 9199. Web against emulators: `cd web && npm run dev:emulator` (port 5173, `web/.env.emulator`).
- Phone: open the folder in Android Studio, run `app`; or `./gradlew assembleDebug`.

## 5. Check everything (what "green" means)
Double-click `CRM Check.command` (Mac) → results in `_check-log.txt`, or run the steps by hand:

| Step | Command | Green = |
|---|---|---|
| Server tests | `cd functions && npm test` | `# pass 370`, fail 0 (45 files in `functions/test/`, `node --test`) |
| Web build | `cd web && npm run build` (`tsc -b` strict + `vite build`) | no errors |
| Rules tests | `firebase emulators:exec --only firestore "node tools/rules-test.mjs"` (needs `@firebase/rules-unit-testing@4`) | `351 passed, 0 failed` |
| Phone build | `./gradlew assembleDebug` | BUILD SUCCESSFUL |
| Web lint | `cd web && npm run lint` (oxlint) | 0 errors (42 style warnings: fast-refresh only) |
| Docs | `python3 tools/check-code-map.py` | `missing 0` |
| Translations | `python3 tools/extract-i18n.py` (run from repo ROOT) | `todo: 0` |

Not covered by any test today: web UI (no unit / e2e tests), Android (only the two template placeholder tests), real devices.

## 6. Deploy
Step-by-step in `DEPLOY-STEPS.md` (Telugu). Short form: `firebase deploy` (functions + rules + indexes + hosting; web builds in `predeploy`).
Blaze plan is required; set a budget alert. First owner account: sign up, then set `role=admin`, `active=true` on the `users` doc; the setup wizard opens.
A new customer = a new Firebase project (`docs/NEW-CUSTOMER-SETUP.md`). True multi-tenant is only designed: `docs/PLAN-B-MULTI-TENANT.md`.
Phone release: `app/build.gradle.kts` signs with `keystore/keystore.properties`.

## 7. Rules of the codebase (keep them)
- **Money and stock are server-owned.** Clients never write totals, balances or stock; callables do, inside transactions, with an audit entry.
- Every callable is `callable("name", LEVELS, handler)` (`functions/src/shared/callable.ts`) and needs a line in `functions/src/roles/callablePerms.ts` — a test fails otherwise. Direct `onCall` is used only by `ping`, `adjustStock` and the public portal functions.
- Errors are bilingual: `fail(code, te, en)`. Web text: `L("తెలుగు", "English")`. Phone: `L(te, en)`. Telugu first; Hindi is a third language built from the English text (see §9).
- Pure rules in their own files with `node --test` tests (`functions/test/moduleNN.test.ts`); keep logic out of handlers so it can be tested.
- Collection names live in three places that must match: `functions/src/shared/firestorePaths.ts`, `app/.../data/remote/FirestoreCollections.kt`, and the `match /name/` blocks in `firestore.rules` (an audit on 21 Nov found no mismatch).
- Generated files — do not hand-edit: the job-role block in `firestore.rules` (`node tools/gen-role-rules.mjs`), `app/.../data/model/JobRoles.kt` (`node tools/gen-phone-roles.js`), `web/src/data/roles.ts` (copy of the permission rules).
- Firestore rules have an expression limit per request (~1,000); see `docs/security-review.md` "Round 10b/10c" before adding conditions — add a rules test (`tools/rules-test.mjs`) for every new rule.
- Android minSdk 24: no `java.time` (use `DayKey` in `util/DocRead.kt` or `Math.floorDiv`).
- Dates are IST (`functions/src/shared/istDate.ts`, `DayKey`).
- After every change update `docs/requirements-checklist.md`, `docs/ROADMAP-full-spec.md`, `docs/CODE-MAP.md`, `docs/HANDOVER.md`.

## 8. How to add things
- **A server function:** pure rules file + test → handler with `callable(...)` → export from `functions/src/index.ts` → entry in `callablePerms.ts` → web wrapper in `web/src/data/functions.ts` → phone wrapper in `data/remote/Functions.kt` → `docs/api-contract.md`.
- **A collection:** name in the three places (§7) → rules block + tests → indexes in `firestore.indexes.json` if a query needs one → repository on web / phone.
- **A web screen:** `web/src/modules/<area>/`, route in `web/src/routes/AppRouter.tsx`, nav in the shell, all text through `L()`.
- **A phone screen:** composable in `app/.../ui/<area>/`, route in `NavRoutes` + `SuseelaNavGraph.kt`, drawer entry in `AppScaffold.kt`, text through `L()`.
- **Hindi text:** web — strings in `tools/hi/batch*.json`, then `python3 tools/hi/merge.py`; texts with numbers go in `web/src/i18n/hi-patterns.json`. Phone — `python3 tools/hi/phone_extract.py` lists missing texts (it also reads `fail(...)` messages of the server and the field tables), translate via `tools/hi/phone/apply.py`, then `python3 tools/hi/phone_merge.py`. Server messages: `python3 tools/hi/server_extract.py`.
- **Hindi review:** `python3 tools/hi/export_review.py` writes `docs/hindi-review.csv`; a Hindi speaker edits the Hindi column; `python3 tools/hi/apply_review.py` loads it back, then run both merge scripts. The translations were made by Claude and have NOT been read by a Hindi speaker.

## 9. Audit result, 21 Nov 2026 (what was checked)
| Check | Result |
|---|---|
| Server tests | 370 / 370 pass |
| Rules tests | 351 / 351 pass |
| Web TypeScript | `strict` was missing from `web/tsconfig.app.json`; code already passed strict (0 errors) → turned on |
| Lint | 0 errors, 42 warnings |
| Every callable has a permission entry | yes (115 callables) |
| Client collections without a rules block | none |
| Web files never imported (dead code) | none |
| Secrets in source | none found; only Firebase client API keys (public by design) in `app/google-services.json` and `web/.env.local` |
| `@ts-ignore` / `any` | no `@ts-ignore`; 21 `eslint-disable` (react-hooks deps), 7 `any` |
| Hosting | security headers were missing → added (nosniff, frame deny, referrer, permissions-policy); CSP NOT added (would need testing with Firebase / Razorpay scripts) |
| Android backup | `allowBackup` was true → set false |
| Dependency audit (`npm audit`) | NOT run (network blocked on the build machine) — run it |
| Real device / real browser clicking | NOT done — everything so far is code + automated tests + builds |

## 10. Before go-live (blockers and risks)
1. **No version control.** The folder is not a git repo; old copies pile up in `_snap/` (295 MB), `Catering-CRM-Complete-v15/` (220 MB), `_to_delete/`, `_backup_2026-11-05/`, `_xfer/`. Do `git init`, commit, push to a private remote (`.gitignore` already excludes those folders, keystore and local env files), then retire the copies.
2. **Android `applicationId` is `com.example.suseelacateringcrm`** — Google Play does not accept `com.example.*`. Pick the final id (e.g. `in.suseela.crm`), register it in Firebase (new `google-services.json`), and change `namespace` / `applicationId`. Do it before the first release: it cannot be changed after publishing.
3. **Release keystore** (`keystore/suseela-release.keystore` + passwords) exists only on one Mac. Back it up in two safe places; losing it means no more updates to the Play app.
4. **Release build is not minified** (`isMinifyEnabled = false`) and `versionCode = 1`. If R8 is turned on, add keep rules for the Firestore model classes and test a release build on a device first.
5. **No App Check; public callables** (`portalView`, `portalAccept`, `portalPay`, token-based, no sign-in) have no rate limit. Turn on Firebase App Check and set `maxInstances` / budget alerts.
6. **Restrict the Firebase API keys** (Google Cloud → Credentials) to the web domain and the Android package + SHA-1.
7. **CI is written but never run:** `.github/workflows/ci.yml` (server tests, web build + lint + docs checks, rules tests, `assembleDebug`) was written without GitHub access — push to a GitHub repo and fix whatever the first run shows. Until then `CRM Check.command` (manual, Mac-only) is the only check.
8. **Tests are thin at the edges:** no web UI tests, no Android tests, never run on a real phone. Do a full click-through (checklist in `docs/requirements-checklist.md`) on a real phone and browser first.
9. **Owner inputs still missing:** Razorpay keys, WhatsApp Business account, discount-approval limit number, company legal name + GSTIN, a real bank-statement Excel. Nothing may be invented for these.
10. **Not built:** Plan B multi-tenant (design only); the web calendar-notes page shows the phone's `photos` read-only (cannot add them); the Hindi translations have not been reviewed by a Hindi speaker.
11. Monitoring: set Firebase budget alert, Functions error alerts, and check the nightly Backup agent (2 AM, needs the permission in `DEPLOY-STEPS.md` §0.4) really produces backups before trusting it.
12. Play Store listing needs a privacy policy URL and the Data Safety form (the app stores customer names and phone numbers).

## 11. Folders you can ignore
`_snap/`, `_backup_2026-11-05/`, `_xfer/`, `_to_delete/`, `Catering-CRM-Complete-v15/` (old copies), `firestore-debug.log`, `_check-log.txt`, `functions/lib*`, `web/dist`, `.gradle`, `build/`.
