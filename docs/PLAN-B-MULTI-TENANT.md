# Plan B — one system, many caterers (design only, NOT built — 20 Nov 2026)

Plan A (one Firebase project per customer, `NEW-CUSTOMER-SETUP.md`) is what works today. This file is the worked-out
design for Plan B so that it can be built later in stages. Nothing here is implemented.

## Why it was not built in one go
Measured on 20 Nov 2026: about 414 Firestore call sites in `functions/src` (78 files), 148 in `web/src`, 129 in `app/`,
69 triggers / schedulers, 1,567 lines of `firestore.rules`, 119 of `storage.rules`. A half-done tenant split is worse than none:
one missed path shows customer A's data to customer B. It must be built stage by stage and tested against a real
Firebase project with two test tenants, which cannot be done from the build machine alone.

## Chosen design: one Firestore database per tenant (same project)
Firestore supports several named databases in one project. Every collection path stays exactly as it is, so no repository,
rule or trigger path has to be rewritten — only *which database* is used.

1. **Tenant id** — a short slug (`suseela`, `acme`). Stored as the custom claim `tenant` on every user (set by `setupTenant` / user approval).
2. **Server** — one helper `db(tenant)` replaces the 178 `getFirestore()` calls (mechanical; the 370 server tests keep passing with the default tenant).
   `callable()` reads the tenant from the verified token and passes it on; a user without the claim is refused.
3. **Triggers** — `onDocumentWritten` is bound to one database at deploy time. Each trigger becomes a factory that is
   instantiated once per tenant listed in `tenants.json` (deploy re-run when a tenant is added). Schedulers loop over the tenants.
4. **Rules** — `firebase.json` lists one `firestore` entry per database; all use the same `firestore.rules`. A rules test run is repeated per tenant.
5. **Storage** — prefix every path with `tenants/{tenant}/…`; `storage.rules` checks `request.auth.token.tenant == tenant`.
6. **Web / phone** — after sign-in read the claim, open `getFirestore(app, tenant)` (web) / `FirebaseFirestore.getInstance(app, tenant)` (Kotlin). One place each (`web/src/firebase.ts`, `ServiceLocator`).
7. **Secrets** (Razorpay, WhatsApp) — per tenant: stored in a server-only `tenantSecrets/{tenant}` document or Secret Manager, never one shared key.
8. **Billing / limits** — a `tenants` registry (name, plan, status) in the default database, owner-of-the-platform only.

## Build order (each stage ships and is tested before the next)
1. `db()` helper + `tenant` claim, default tenant only (no behaviour change; all tests green).
2. Trigger factories + scheduler loops, still one tenant.
3. Web / phone open the tenant database from the claim.
4. Storage prefix + rules.
5. Create tenant #2 in a test project; run the rules tests and a two-tenant leak test (A must never read B).
6. Onboarding screen / script for a new tenant; per-tenant secrets.

## What the owner must decide first
- Price per tenant and who supports them (decides whether a platform-owner screen is needed).
- Whether tenants may use their own domain / app name (white-label) — affects Android build flavours.
