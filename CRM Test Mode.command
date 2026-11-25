#!/bin/zsh
# Suseela CRM — Test mode (మీ Mac లో మాత్రమే, internet/ఖర్చు లేదు). Double-click చేస్తే తెరుచుకుంటుంది.
# ఆపాలంటే: ఈ Terminal window మూసేయండి.
cd "$(dirname "$0")"
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/jdk-21.0.13+9/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
echo "Server మొదలవుతోంది..."
pkill -f "firebase emulators" 2>/dev/null; pkill -f "vite --mode emulator" 2>/dev/null; sleep 1
(cd functions && npm run build >/dev/null 2>&1)
~/.suseela-tools/node_modules/.bin/firebase emulators:start --project demo-suseela --only auth,firestore,functions,storage --import=.test-data --export-on-exit=.test-data > /tmp/emulators.log 2>&1 &
until grep -q "All emulators ready" /tmp/emulators.log; do sleep 2; done
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 NODE_PATH=functions/node_modules node tools/seed-emulator.cjs
(cd web && npm run dev:emulator > /tmp/web-dev.log 2>&1 &)
sleep 4
open "http://localhost:5173"
echo ""
echo "✅ CRM తెరుచుకుంది: http://localhost:5173"
echo "   Email:    owner@suseela.test"
echo "   Password: Suseela@2026"
echo "ఆపాలంటే ఈ window మూసేయండి (మీరు పెట్టిన test data .test-data లో save అవుతుంది)."
wait
