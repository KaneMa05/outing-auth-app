#!/usr/bin/env bash
# Manual screenshot workflow only. Never echo credentials or export xcresult logs.
set -euo pipefail
set +x
: "${REVIEW_STUDENT_ID:?Set secure review account variable}"
: "${REVIEW_STUDENT_PASSWORD:?Set secure review password variable}"
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
build_dir=$(mktemp -d)
output="$root/artifacts/store-screenshots"
mkdir -p "$output"
export REVIEW_SCREENSHOT_DEVICE_TOKEN="$(uuidgen)"
cleanup() {
  # Revoke only this job's ephemeral device, never any existing user device.
  python3 - <<'PY'
import json, os, urllib.request, urllib.error
payload = {'studentId': os.environ['REVIEW_STUDENT_ID'], 'deviceToken': os.environ['REVIEW_SCREENSHOT_DEVICE_TOKEN']}
def call(body):
    req = urllib.request.Request('https://outing-auth-app.vercel.app/api/student-devices', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)
try:
    result = call(dict(payload, action='validate'))
    if result.get('valid') and result.get('deviceId'):
        revoked = call(dict(payload, action='revoke', targetDeviceId=result['deviceId'], reason='Completed App Store screenshot capture'))
        if not revoked.get('ok'):
            raise RuntimeError('cleanup failed')
    print('Temporary screenshot device session cleaned up.')
except urllib.error.HTTPError as error:
    if error.code == 403:
        print('No active temporary screenshot device session remains.')
    else:
        print('Temporary screenshot device cleanup requires verification.')
except Exception:
    print('Temporary screenshot device cleanup requires verification.')
PY
  rm -rf "$build_dir"
}
trap cleanup EXIT
xcodegen generate --spec "$root/native/ios/App/project.yml"
xcrun simctl list devices available --json > "$build_dir/devices.json"
python3 - "$build_dir/devices.json" > "$build_dir/selected.txt" <<'PY'
import json, sys
inventory = json.load(open(sys.argv[1]))
for kind in ('iPhone', 'iPad'):
    choices = []
    for runtime, devices in inventory['devices'].items():
        if '.iOS-' not in runtime:
            continue
        version = tuple(map(int, runtime.split('.iOS-')[1].split('-')))
        for d in devices:
            name = d.get('name', '')
            wanted = ('Pro Max' in name) if kind == 'iPhone' else ('Pro' in name and ('13-inch' in name or '12.9-inch' in name))
            if name.startswith(kind) and wanted and d.get('isAvailable'):
                choices.append((version, name, d['udid']))
    if not choices:
        raise SystemExit('Required large display simulator is unavailable: ' + kind)
    print(kind, sorted(choices, reverse=True)[0][2])
PY
export TEST_RUNNER_REVIEW_STUDENT_ID="$REVIEW_STUDENT_ID"
export TEST_RUNNER_REVIEW_STUDENT_PASSWORD="$REVIEW_STUDENT_PASSWORD"
export TEST_RUNNER_REVIEW_SCREENSHOT_DEVICE_TOKEN="$REVIEW_SCREENSHOT_DEVICE_TOKEN"
while read -r kind simulator; do
  xcrun simctl boot "$simulator" || true
  xcrun simctl bootstatus "$simulator" -b
  xcrun simctl status_bar "$simulator" override --time '9:41' --batteryState charged --batteryLevel 100
  xcodebuild -project "$root/native/ios/App/RonparkStudy.xcodeproj" -scheme RonparkStudy \
    test -configuration Debug -destination "platform=iOS Simulator,id=$simulator" \
    -parallel-testing-enabled NO -only-testing:InterviewUITests/StoreScreenshotTests \
    -derivedDataPath "$build_dir/derived" -resultBundlePath "$build_dir/$kind.xcresult" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO > "$build_dir/$kind.log" 2>&1 || {
      printf '%s\n' "Screenshot test failed for $kind; no potentially sensitive test logs published." >&2
      python3 - "$build_dir/$kind.log" <<'PY'
import os, sys
for line in open(sys.argv[1], errors='replace'):
    if 'error:' in line or 'TEST FAILED' in line or ('Test Case' in line and 'failed' in line):
        for key in ('REVIEW_STUDENT_ID', 'REVIEW_STUDENT_PASSWORD', 'REVIEW_SCREENSHOT_DEVICE_TOKEN'):
            line = line.replace(os.environ[key], '[redacted]')
        print(line[:500].rstrip())
PY
      if [[ -d "$build_dir/$kind.xcresult" ]]; then
        xcrun xcresulttool export attachments --path "$build_dir/$kind.xcresult" --output-path "$output/$kind-failure" > /dev/null || true
      fi
      exit 1
    }
  xcrun xcresulttool export attachments --path "$build_dir/$kind.xcresult" --output-path "$output/$kind" > /dev/null
  xcrun simctl shutdown "$simulator"
done < "$build_dir/selected.txt"
printf '%s\n' 'Store screenshots captured. No review credentials included in artifacts.'
