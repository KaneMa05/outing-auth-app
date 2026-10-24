#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || { printf '%s\n' 'This build runs on cloud macOS, not Windows.' >&2; exit 1; }
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
app_dir="$root/native/ios/App"
output="$root/artifacts/ios-cloud"
build_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ronpark-ios.XXXXXX")
mkdir -p "$output"

collect_evidence() {
  code=$?
  trap - EXIT
  if [[ -d "$build_dir/NativeTests.xcresult" ]]; then
    xcrun xcresulttool export attachments --path "$build_dir/NativeTests.xcresult" \
      --output-path "$output/screenshots" > "$output/attachment-export.log" 2>&1 || true
    ditto -c -k --keepParent "$build_dir/NativeTests.xcresult" "$output/NativeTests.xcresult.zip" || true
  fi
  python3 - "$output" "$code" <<'PY'
import json, os, pathlib, sys
out = pathlib.Path(sys.argv[1])
(out / 'build-status.json').write_text(json.dumps({
    'success': sys.argv[2] == '0', 'exitCode': int(sys.argv[2]),
    'commit': os.environ.get('GITHUB_SHA', ''), 'signedForDevice': False,
    'paidAIRequests': False, 'deploymentPerformed': False,
    'note': 'Simulator app and unsigned archive only. Neither is an installable signed iPhone IPA.'
}, indent=2) + '\n')
PY
  exit "$code"
}
trap collect_evidence EXIT

cd "$app_dir"
xcodegen generate --spec project.yml 2>&1 | tee "$output/project-generation.log"
project="$app_dir/RonparkStudy.xcodeproj"
common=(-project "$project" -scheme RonparkStudy -clonedSourcePackagesDirPath "$build_dir/packages")
xcodebuild "${common[@]}" -resolvePackageDependencies 2>&1 | tee "$output/package-resolution.log"

# No Apple account, certificate, OpenAI key, or production login is supplied to this job.
xcrun simctl list devices available --json > "$output/simulators.json"
simulator=$(python3 "$root/scripts/ios/select-simulator.py" < "$output/simulators.json")
xcodebuild "${common[@]}" test -configuration Debug \
  -destination "platform=iOS Simulator,id=$simulator" -destination-timeout 120 \
  -parallel-testing-enabled NO -maximum-concurrent-test-simulator-destinations 1 \
  -derivedDataPath "$build_dir/derived" -resultBundlePath "$build_dir/NativeTests.xcresult" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO 2>&1 | tee "$output/simulator-tests.log"

ditto -c -k --sequesterRsrc --keepParent \
  "$build_dir/derived/Build/Products/Debug-iphonesimulator/RonparkStudy.app" \
  "$output/RonparkStudy-simulator.app.zip"

xcodebuild "${common[@]}" archive -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$build_dir/RonparkStudy-unsigned.xcarchive" \
  -derivedDataPath "$build_dir/device-derived" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO 2>&1 | tee "$output/device-archive.log"
ditto -c -k --sequesterRsrc --keepParent \
  "$build_dir/RonparkStudy-unsigned.xcarchive" "$output/RonparkStudy-unsigned.xcarchive.zip"

python3 - "$output" <<'PY'
import hashlib, pathlib, sys
out = pathlib.Path(sys.argv[1])
files = sorted(out.glob('RonparkStudy-*.zip'))
(out / 'SHA256SUMS.txt').write_text(''.join(hashlib.file_digest(f.open('rb'), 'sha256').hexdigest() + '  ' + f.name + '\n' for f in files))
(out / 'READ-ME.txt').write_text(
    'Cloud macOS build; no local Mac or Apple account used.\n'
    'The .app.zip is for iOS Simulator. The .xcarchive.zip is an unsigned device archive.\n'
    'They cannot be installed directly on an iPhone. Signing is a separate step.\n'
    'UI tests use synthetic native interview questions; no paid AI calls.\n'
    'Native screen screenshots are in screenshots/ and NativeTests.xcresult.zip.\n'
)
PY
