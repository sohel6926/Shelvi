# Suseela Caterings CRM — మొదటిసారి Live చేయడం (Step-by-step)

ఈ guide ఒక్కసారి మొదటి నుండి చివరి వరకు చేస్తే CRM live అవుతుంది. ప్రతి step తర్వాత ✅ పెట్టుకోండి.
ఏదైనా step లో error వస్తే, ఆ error ని copy చేసి Claude కి పంపండి — అక్కడే ఆగండి, తర్వాతి step కి వెళ్ళకండి.

Firebase project: **suseela-catering-crm** · Region: **asia-south1 (Mumbai)**

---

## భాగం 0 — ఒక్కసారి మాత్రమే (setup)

### 0.1 Mac లో కావాల్సినవి
Terminal తెరవండి (Spotlight → "Terminal") మరియు ఇవి type చేయండి:
```bash
node -v        # v22 రావాలి (functions engines = 22). రాకపోతే: https://nodejs.org నుండి "LTS" install చేయండి
npm -v
```
Firebase tool install:
```bash
npm install -g firebase-tools
firebase login            # browser తెరుచుకుంటుంది — మీ Google account తో login అవ్వండి
```
Android Studio: https://developer.android.com/studio నుండి install చేయండి (ఇప్పటికే ఉంటే skip).

### 0.2 Firebase Blaze plan (తప్పనిసరి)
Server functions, automatic agents నడవాలంటే Blaze plan కావాలి (వాడినంత మాత్రమే కడతారు).
1. https://console.firebase.google.com → **suseela-catering-crm** → ఎడమ క్రింద **Upgrade** → **Blaze**
2. Billing account జత చేయండి.
3. **Budget alert** పెట్టండి: Google Cloud console → Billing → Budgets → ₹500/నెల (మించితే email వస్తుంది).

### 0.3 WhatsApp secrets (ఇప్పటికి "none")
WhatsApp Business API number ఇంకా రాలేదు కాబట్టి ఇప్పటికి `none` పెట్టండి — messages "queued" లో ఉంటాయి, ఎవరికీ వెళ్ళవు.
```bash
cd "$HOME/Desktop/Suseela catering CRM APP"
firebase functions:secrets:set WHATSAPP_TOKEN      # అడిగినప్పుడు none అని type చేసి Enter
firebase functions:secrets:set WHATSAPP_PHONE_ID   # none
```
WhatsApp number వచ్చాక ఇదే command తో నిజమైన values పెట్టి, మళ్ళీ `firebase deploy --only functions` చేయండి.

### 0.4 Backup కోసం అనుమతి (agent "Backup" రోజూ 2 AM)
Google Cloud console → IAM → `suseela-catering-crm@appspot.gserviceaccount.com` కి
**Cloud Datastore Import Export Admin** మరియు **Storage Admin** roles ఇవ్వండి.

---

## భాగం 1 — Server, నియమాలు, website live చేయడం

```bash
cd "$HOME/Desktop/Suseela catering CRM APP"

# 1. Server functions కి కావాల్సినవి install, పరీక్షలు
cd functions && npm install && npm test && cd ..
#    చివర "# fail 0" రావాలి (370 పరీక్షలు pass — 21 Nov 2026). fail వస్తే ఆగి Claude కి పంపండి.

# 2. Web admin కి కావాల్సినవి install
cd web && npm install && cd ..

# 3. అన్నీ ఒకేసారి live (server + నియమాలు + indexes + website)
#    (functions, web build దానంతట అదే జరుగుతుంది)
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting
```
మొదటిసారి ఇది 5–10 నిమిషాలు పడుతుంది. చివర **Hosting URL** వస్తుంది — అదే మీ web CRM address.

> Firestore database location "asia-south1" కాకుండా వేరే ఉంటే triggers deploy లో error రావచ్చు — అప్పుడు error ని Claude కి పంపండి.

---

## భాగం 2 — మొదటి Owner account (ఒక్కసారి మాత్రమే)

1. Hosting URL తెరిచి మీ email తో **Sign up** చేయండి. "Approval కోసం వేచి ఉండండి" screen వస్తుంది — సరైనదే.
2. https://console.firebase.google.com → **Firestore Database** → `users` → మీ document తెరవండి.
3. ఈ fields మార్చండి: `role` = `admin`, `active` = `true` (boolean). Save.
4. Web CRM ని refresh చేయండి — **Setup wizard** తెరుచుకుంటుంది.

---

## భాగం 3 — Setup wizard (మీరే enter చేయాలి)
1. వ్యాపార వివరాలు: పేరు, logo, address, phone **9966649469**, **FSSAI license number**
   (GSTIN ఇప్పుడు ఖాళీగా వదలండి — GST registration అయ్యాక ఇక్కడే enter చేస్తే GST దానంతట అదే on అవుతుంది)
2. Bank & UPI ID
3. Signature photo, terms
4. Staff: ఒక్కొక్కరిని add చేయండి (నెల జీతం / రోజువారీ కూలీ ఎంచుకోండి) — లేదా CSV upload
5. Photos & పాత data: food photos, పాత customers/menus CSV
6. **Menus → "10 menus load చేయి"** button నొక్కండి (మీ టిఫిన్/లంచ్/డిన్నర్ menus ఎక్కుతాయి)
7. **Targets** → సంవత్సర target ₹1,50,00,000, లాభం 25% → Save
8. **Settings → Automatic / Manual** — అన్నీ Automatic గా వదలండి (తర్వాత కావాలంటే మార్చుకోవచ్చు)

Manager / staff కి: వాళ్ళు sign up చేశాక **Users** page లో Role, Branch ఎంచుకుని Active on చేయండి.
Staff కి వాళ్ళ staff record లో "linked user" కూడా ఎంచుకోండి (అప్పుడే వాళ్ళ events వాళ్ళకి కనిపిస్తాయి).

---

## భాగం 4 — Android app (phone)

1. Android Studio → **Open** → `Suseela catering CRM APP` folder → "Trust project".
2. పైన **Sync Now** వస్తే నొక్కండి (మొదటిసారి 5–15 నిమిషాలు — internet కావాలి).
   (Java 21 ఇప్పటికే మీ Mac లో పెట్టాం, `gradle.properties` లో set చేశాం — Android Studio లోని Java 25 తో Gradle 8.10 పనిచేయదు.
   5 నవంబర్ న ఈ Mac మీద `./gradlew assembleDebug` → **BUILD SUCCESSFUL** వచ్చింది.)
3. Phone ని USB తో కలిపి ▶ **Run** — లేదా APK కోసం: **Build → Generate Signed App Bundle / APK → APK**
   → keystore: `keystore/suseela-release.keystore` (passwords: `keystore/keystore.properties` లో ఉన్నాయి)
   → **release** → Create. APK ని staff phones కి WhatsApp/Drive ద్వారా పంపి install చేయండి.
4. Build లో error వస్తే: Android Studio క్రింద **Build** tab లోని మొదటి ఎరుపు error line copy చేసి Claude కి పంపండి.
   (అన్ని files compile check చేశాం — కానీ ఇది మొదటి నిజమైన build కాబట్టి 1–2 చిన్న errors రావచ్చు.)

⚠️ **Keystore backup:** `keystore/` folder ని Google Drive లో మరియు pen drive లో copy పెట్టుకోండి.
ఇది పోతే app కి update ఇవ్వలేరు.

---

## భాగం 5 — ఒక నిజమైన event తో పరీక్ష (live కి ముందు)
1. ఒక test customer → quote (లంచ్ menu, 120 ప్లేట్లు) → 3 serving boys, రవాణా ₹1,500, బొబ్బట్టు మార్పు, water bottle 120, extra sweet 120 × ₹25 తో మొత్తం **₹43,000** రావాలి (10 ఉచిత ప్లేట్లు, 2 ఉచిత boys)
2. Booking → invoice → ₹10,000 payment → బాకీ సరిగ్గా వస్తుందో చూడండి
3. Staff phone లో attendance, event తర్వాత "మిగిలింది" నమోదు
4. Target Board లో అంకెలు మారాయో చూడండి
5. అన్నీ సరిగ్గా ఉంటే → నిజమైన data మొదలుపెట్టండి. Test data ని తర్వాత delete చేయవచ్చు.

---

## తర్వాత updates
```bash
cd "$HOME/Desktop/Suseela catering CRM APP"
firebase deploy --only functions,hosting      # server/web మార్పులు
firebase deploy --only firestore:rules,storage  # నియమాల మార్పులు
```
Android మార్పులకి: versionCode పెంచి కొత్త APK.

పాత files backup: `_backup_2026-11-05/` folder. పని files: `_xfer/`, `_snap/` (తర్వాత delete చేయవచ్చు).

---
## 5 Nov 2026 రాత్రి: deploy test run లో తెలిసినవి / Found in the deploy dry-run
- Server ఇప్పుడు **Node 22** మీద నడుస్తుంది (Google, Node 20 ని 30 Oct 2026 నుండి ఆపేసింది). `functions/package.json` engines 22, `firebase.json` runtime nodejs22. Tests 370/370 pass (21 Nov 2026).
  Server now runs on Node 22 (Node 20 was decommissioned on 30 Oct 2026).
- Deploy ముందు Google Cloud లో **Secret Manager API** ఆన్ చేయాలి (ఒక్కసారి):
  https://console.developers.google.com/apis/api/secretmanager.googleapis.com/overview?project=suseela-catering-crm → "Enable".
  Enable the Secret Manager API once before the first deploy.
- Firebase login account (5 Nov): ramanadhgobal@gmail.com — project `suseela-catering-crm` ఈ account లో ఉంది.
- firebase-functions SDK 5.1.1 పాతది అని హెచ్చరిక వస్తుంది; ఇప్పటికి పని చేస్తుంది. Upgrade (v6/v7) లో పెద్ద మార్పులు ఉంటాయి — deploy తర్వాత వేరుగా చేద్దాం.
