# సుశీల క్యాటరింగ్స్ CRM
# Suseela Caterings CRM

బుకింగ్‌లు, కొటేషన్లు, invoices, వంట plan, సరుకులు, సిబ్బంది, లక్ష్యాలు, లాభ నష్టాలు — అన్నీ ఒకేచోట. Web admin + Android phone app + Firebase server.
Bookings, quotations, invoices, kitchen planning, stock, staff, targets and P&L in one place: a web admin, an Android app and a Firebase server.

## ముందు ఇవి చూడండి
## Start here

| ఏమి కావాలి | ఎక్కడ చూడాలి |
|---|---|
| ఏ కోడ్ ఎక్కడ ఉంది / Where each piece of code is | `docs/CODE-MAP.md` |
| Live చేయడం (deploy) step-by-step / Go-live steps | `DEPLOY-STEPS.md` |
| మీ Mac లో test mode (internet, ఖర్చు లేదు) / Local test mode | `CRM Test Mode.command` — Finder లో double-click చేయండి / double-click it in Finder |
| ఓనర్ చెప్పిన అన్ని points / Every requirement | `docs/requirements-checklist.md` |
| ప్రతి లెక్క సూత్రం / Every formula | `docs/calc-spec.md` |

## ఫోల్డర్లు (సంక్షిప్తంగా)
## Folders (short)

- `functions/` — server (లెక్కలు, డబ్బు, agents) / Cloud Functions
- `web/` — web admin / React web admin
- `app/` — Android phone app
- `firestore.rules`, `storage.rules` — భద్రతా నియమాలు / security rules
- `docs/` — అన్ని వివరణలు / documentation
- `tools/` — test mode data, rules పరీక్ష, code map check / helper scripts

పూర్తి వివరాలు `docs/CODE-MAP.md` లో. Full details are in `docs/CODE-MAP.md`.

⚠️ `keystore/`, `local.properties`, `functions/.secret.local`, `web/.env.local` — రహస్యాలు; ఎవరికీ పంపవద్దు. These hold secrets or machine settings: never share them.
