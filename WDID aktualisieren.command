#!/bin/bash
# WDID aktualisieren: neuesten Code holen, App bauen und auf das angeschlossene iPhone spielen.
# Doppelklick im Finder genügt. Erneuert dabei auch die 7-Tage-Signatur.
set -euo pipefail
cd "$(dirname "$0")"

BUNDLE_ID="$(cat .wdid-bundle 2>/dev/null || echo de.deroix.wdid)"
PROJECT="ios/App/App.xcodeproj"
DERIVED="build"
APP="$DERIVED/Build/Products/Debug-iphoneos/App.app"

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1"; read -r -p "Enter zum Schließen " _; exit 1; }
trap 'fail "Abgebrochen. Die Meldung oben sagt, woran es lag."' ERR

command -v xcodebuild >/dev/null || fail "Xcode fehlt. Installiere es aus dem App Store und öffne es einmal."
command -v node >/dev/null || fail "Node.js fehlt. Installiere die LTS-Version von nodejs.org."

if git remote get-url origin >/dev/null 2>&1; then
  step "Neuesten Stand holen"
  git pull --ff-only
fi

step "Abhängigkeiten prüfen"
npm ci --no-audit --no-fund --loglevel=error

# Team-ID der kostenlosen Apple-ID: aus .wdid-team oder aus dem Entwicklerzertifikat
TEAM="$(cat .wdid-team 2>/dev/null || true)"
if [ -z "$TEAM" ]; then
  TEAM="$(security find-certificate -a -c "Apple Development" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p' | head -1 || true)"
  [ -n "$TEAM" ] || fail "Kein Entwicklerzertifikat gefunden. Xcode → Einstellungen → Accounts → Apple-ID hinzufügen → Manage Certificates → + Apple Development."
  echo "$TEAM" > .wdid-team
fi
echo "Team: $TEAM"

step "iPhone suchen"
JSON="$(mktemp)"
xcrun devicectl list devices --json-output "$JSON" >/dev/null 2>&1 || true
DEVICE="$(/usr/bin/python3 - "$JSON" <<'PY'
import json, sys
try: devs = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception: devs = []
for d in devs:
    hw, cp = d.get("hardwareProperties", {}), d.get("connectionProperties", {})
    if hw.get("platform") == "iOS" and cp.get("tunnelState") != "unavailable" and cp.get("pairingState") == "paired":
        print(hw.get("udid", "")); break
PY
)"
rm -f "$JSON"
[ -n "$DEVICE" ] || fail "Kein iPhone gefunden. Per Kabel anschließen, entsperren und „Vertrauen“ tippen."
echo "iPhone: $DEVICE"

build() {
  xcodebuild -project "$PROJECT" -scheme App -configuration Debug \
    -destination "id=$DEVICE" -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
    -quiet build
}

step "App bauen"
npm run --silent sync
build

# Ablaufdatum der Signatur aus dem Profil lesen und in die App schreiben
EXPIRES="$(security cms -D -i "$APP/embedded.mobileprovision" | plutil -extract ExpirationDate raw -o - -)"
node scripts/build-info.mjs --expires "$EXPIRES"
npx cap copy ios >/dev/null
build

step "Auf das iPhone spielen"
xcrun devicectl device install app --device "$DEVICE" "$APP" >/dev/null
xcrun devicectl device process launch --device "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 || true

trap - ERR
printf '\n\033[32mFertig. WDID läuft bis %s.\033[0m\n' "$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$EXPIRES" '+%d.%m.%Y %H:%M' 2>/dev/null || echo "$EXPIRES")"
read -r -p "Enter zum Schließen " _
