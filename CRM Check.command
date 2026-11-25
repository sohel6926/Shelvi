#!/bin/zsh
# Suseela CRM — అన్ని పరీక్షలు ఒకేసారి (మీ Mac లో మాత్రమే). Double-click చేయండి, పూర్తయ్యే వరకు ఆగండి.
# ఫలితం: ఈ ఫోల్డర్ లో _check-log.txt
cd "$(dirname "$0")"
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/jdk-21.0.13+9/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
LOG="$PWD/_check-log.txt"
FB="$HOME/.suseela-tools/node_modules/.bin/firebase"
echo "CRM Check — $(date)" > "$LOG"
say_step() { echo ""; echo "▶ $1"; echo "" >> "$LOG"; echo "===== $1 =====" >> "$LOG"; }
done_step() { if [ "$1" -eq 0 ]; then echo "   ✅ సరే"; echo "STEP-RESULT: OK" >> "$LOG"; else echo "   ❌ తప్పు ఉంది (వివరాలు log లో)"; echo "STEP-RESULT: FAILED ($1)" >> "$LOG"; fi }

echo "Test Mode నడుస్తుంటే ఆపుతున్నాం (పరీక్షలకి అదే port కావాలి)..."
pkill -f "firebase emulators" 2>/dev/null; pkill -f "vite --mode emulator" 2>/dev/null; sleep 2

say_step "1/5 SERVER TESTS (functions npm test)"
(cd functions && npm test 2>&1 | tail -40) >> "$LOG" 2>&1; done_step ${pipestatus[1]}

say_step "2/5 WEB BUILD (web npm run build)"
(cd web && npm run build 2>&1 | tail -60) >> "$LOG" 2>&1; done_step ${pipestatus[1]}

say_step "3/5 RULES TESTS (firestore emulator)"
mkdir -p "$HOME/rt-tests"
if [ ! -d "$HOME/rt-tests/node_modules/@firebase/rules-unit-testing" ]; then
  echo "   (మొదటిసారి: పరీక్ష సాధనం download అవుతోంది, 1–2 నిమిషాలు)"
  (cd "$HOME/rt-tests" && npm init -y >/dev/null 2>&1 && npm i @firebase/rules-unit-testing@4 firebase@11 2>&1 | tail -5) >> "$LOG" 2>&1
fi
cp tools/rules-test.mjs "$HOME/rt-tests/rules-test.mjs"
"$FB" emulators:exec --project demo-suseela-rules --only firestore "node $HOME/rt-tests/rules-test.mjs" 2>&1 | grep -v "^i  \|^⚠  emulators" | tail -80 >> "$LOG" 2>&1; done_step ${pipestatus[1]}

say_step "4/5 PHONE APP BUILD (gradlew assembleDebug) — 5 నుండి 15 నిమిషాలు పట్టవచ్చు"
./gradlew assembleDebug --console=plain 2>&1 | tail -50 >> "$LOG" 2>&1; done_step ${pipestatus[1]}

say_step "5/5 WEB LINT (oxlint)"
(cd web && npm run lint 2>&1 | tail -40) >> "$LOG" 2>&1; done_step ${pipestatus[1]}

echo ""
echo "పూర్తయింది. ఇప్పుడు Claude కి \"ayindi\" అని చెప్పండి. ఈ window మూసేయవచ్చు."
