# New customer setup (one deployment per customer) — checklist for selling the CRM

Plan A from `docs/PRODUCT-COMPARE-and-SELL-PLAN.md`: each customer gets their own Firebase project, web site and Android app. Their data never mixes with ours. This list was made by searching the code for everything that is Suseela-specific. **Nothing here has been run for a second customer yet** — treat it as a checklist to test with a dummy customer first.

## A. Accounts the customer (or we, on their behalf) must create
1. A Google account and a new Firebase project (Blaze plan, region asia-south1). Budget alert ₹500/month.
2. Their own WhatsApp Business API number and Razorpay/UPI merchant account, when they want those (until then: `none` secrets, messages stay queued).
3. Their own Play Store developer account if they want the app in the store (otherwise send the APK).

## B. Things to change in the code copy (search for these)
| What | Where |
|---|---|
| Firebase project id | `.firebaserc` |
| Web Firebase keys | `web/.env.local` (copy `web/.env.example`) |
| Android Firebase file | `app/google-services.json` (from their project) |
| App name | `app/src/main/res/values/strings.xml` (`app_name`) |
| Android package / application id | `app/build.gradle.kts` (`namespace`, `applicationId`) — change the folder name too, or keep the id and only change the name |
| App colours | `app/src/main/res/values/themes.xml`, `web/src/theme/tokens.ts` |
| Page title / description | `web/index.html` |
| Login page + top bar name | `web/src/auth/LoginPage.tsx`, `web/src/components/AppShell.tsx` |
| Default business name, legal name, phone | `web/src/data/settingsRepository.ts` (`DEFAULT_PHONE`, `name`, `legalName`), `functions/src/shared/settingsModel.ts`, phone: `app/.../data/model/BusinessSettings.kt`, `app/.../util/SheetReader.kt` |
| Messages signature "— Suseela CRM", "Suseela Caterings" fallbacks | `functions/src/shared/templates.ts`, `functions/src/integrations/upi.ts`, `functions/src/events/cancelBookingRules.ts` |
| WhatsApp template names (`suseela_…`) | `functions/src/integrations/whatsappMessages.ts` — Meta must approve each template under the customer's own number |
| Logo and icon | `branding/`, `web/public`, `app/src/main/res/mipmap-*` |
| Telugu-only texts | The web already switches Telugu/English/Hindi; the phone is Telugu/English. A non-Telugu customer picks English in settings. |

Better, later: move all of these into one `brand.config` file read by web, functions and phone, so a new customer is one file plus keys. That is a small refactor (about a day) and worth doing before customer number two.

## C. Deploy (same steps as `DEPLOY-STEPS.md`, with the customer's project)
1. `firebase use <their-project>`; set secrets (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` = `none` at first).
2. `cd functions && npm install && npm test`; `cd web && npm install`.
3. `firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting`.
4. First owner: sign up, then set `role = admin`, `active = true` on their `users` document.
5. Setup wizard: business details, bank/UPI, staff, masters (company → brand → branch → kitchen → store).
6. Do NOT load our "10 menus" — it is Suseela's menu list. They enter their own menus and dishes.
7. Build the Android APK with their `google-services.json`; test on a real phone.

## D. Before handing over
- Accountant check of invoice wording, GST and HSN for their business.
- Privacy policy and terms on their own site.
- Backup permission (`Cloud Datastore Import Export Admin`) and a restore test.
- A written price, support hours and who pays the Firebase bill.

## E. Open points for the owner
- Price per customer and who owns the Firebase bill.
- Whether to do the one-file `brand.config` refactor now.
- Whether to go to real multi-tenant later (see the plan file, section 5B).
