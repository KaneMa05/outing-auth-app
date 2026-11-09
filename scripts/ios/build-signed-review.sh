#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ "$(uname -s)" == Darwin ]] || { printf '%s\n' 'Signing runs on the cloud macOS runner.' >&2; exit 1; }
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
task=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ronpark-signing.XXXXXX")
output="$root/artifacts/ios-signed-review"
mkdir -p "$output" "$task/private_keys"
keychain="$task/review-signing.keychain-db"
profile_installed=''
uploaded=false

cleanup() {
  code=$?
  trap - EXIT
  python3 - "$output/build-status.json" "$code" "$uploaded" <<'PY'
import json, os, pathlib, sys
pathlib.Path(sys.argv[1]).write_text(json.dumps({
    'success': sys.argv[2] == '0', 'exitCode': int(sys.argv[2]),
    'commit': os.environ.get('GITHUB_SHA'),
    'version': '1.0.0', 'buildNumber': os.environ.get('RONPARK_BUILD_NUMBER'),
    'uploadedToAppStoreConnect': sys.argv[3] == 'true',
    'submittedForReview': False, 'publicReleasePerformed': False
}, indent=2) + '\n')
PY
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  if [[ -n "$profile_installed" ]]; then rm -f "$profile_installed"; fi
  rm -rf "$task"
  exit "$code"
}
trap cleanup EXIT

printf '%s' "$RONPARK_SIGNING_P12_B64" | base64 --decode > "$task/signing.p12"
printf '%s' "$RONPARK_SIGNING_PROFILE_B64" | base64 --decode > "$task/profile.mobileprovision"
printf '%s' "$RONPARK_ASC_PRIVATE_KEY_B64" | base64 --decode > "$task/private_keys/AuthKey_${RONPARK_ASC_KEY_ID}.p8"
unset RONPARK_SIGNING_P12_B64 RONPARK_SIGNING_PROFILE_B64 RONPARK_ASC_PRIVATE_KEY_B64

security cms -D -i "$task/profile.mobileprovision" > "$task/profile.plist"
profile_uuid=$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$task/profile.plist")
profile_name=$(/usr/libexec/PlistBuddy -c 'Print :Name' "$task/profile.plist")
profile_app=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$task/profile.plist")
[[ "$profile_name" == "$RONPARK_PROFILE_NAME" && "$profile_app" == "$RONPARK_TEAM_ID.com.ronpark.study" ]] || { printf '%s\n' 'Unexpected signing profile.' >&2; exit 1; }
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
profile_installed="$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision"
cp "$task/profile.mobileprovision" "$profile_installed"

keychain_password=$(openssl rand -hex 24)
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$task/signing.p12" -k "$keychain" -P "$RONPARK_SIGNING_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
unset RONPARK_SIGNING_P12_PASSWORD
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"

xcodegen generate --spec "$root/native/ios/App/project.yml"
archive="$task/RonparkStudy.xcarchive"
xcodebuild -project "$root/native/ios/App/RonparkStudy.xcodeproj" -scheme RonparkStudy \
  -configuration Release -destination 'generic/platform=iOS' -archivePath "$archive" \
  -derivedDataPath "$task/DerivedData" CURRENT_PROJECT_VERSION="$RONPARK_BUILD_NUMBER" \
  DEVELOPMENT_TEAM="$RONPARK_TEAM_ID" CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY='Apple Distribution' PROVISIONING_PROFILE_SPECIFIER="$RONPARK_PROFILE_NAME" archive

python3 - "$task/ExportOptions.plist" <<'PY'
import os, plistlib, sys
with open(sys.argv[1], 'wb') as handle:
    plistlib.dump({
        'method': 'app-store-connect', 'destination': 'export',
        'teamID': os.environ['RONPARK_TEAM_ID'], 'signingStyle': 'manual',
        'signingCertificate': 'Apple Distribution',
        'provisioningProfiles': {'com.ronpark.study': os.environ['RONPARK_PROFILE_NAME']},
        'manageAppVersionAndBuildNumber': False, 'uploadSymbols': True,
        'stripSwiftSymbols': True
    }, handle)
PY
xcodebuild -exportArchive -archivePath "$archive" -exportPath "$task/export" -exportOptionsPlist "$task/ExportOptions.plist"
ipa=$(find "$task/export" -maxdepth 1 -name '*.ipa' -type f -print -quit)
[[ -n "$ipa" ]] || { printf '%s\n' 'Signed IPA not produced.' >&2; exit 1; }

# altool reads the API key from ./private_keys. No key is embedded in the app.
cd "$task"
xcrun altool --upload-app --file "$ipa" --type ios --apiKey "$RONPARK_ASC_KEY_ID" --apiIssuer "$RONPARK_ASC_ISSUER_ID"
uploaded=true
