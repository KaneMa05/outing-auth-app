#!/usr/bin/env bash
set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || { printf '%s\n' 'Run this script on the cloud macOS runner.' >&2; exit 1; }
[[ -d "${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}" ]] || { printf '%s\n' 'The configured Xcode version is unavailable.' >&2; exit 1; }

tool_dir=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ronpark-xcodegen.XXXXXX")
archive="$tool_dir/xcodegen.zip"
curl --fail --location --retry 2 --connect-timeout 20 --max-time 180 \
  'https://github.com/yonaskolb/XcodeGen/releases/download/2.46.0/xcodegen.zip' -o "$archive"
printf '%s  %s\n' '4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806' "$archive" | shasum -a 256 -c -
ditto -x -k "$archive" "$tool_dir/unpacked"
tool="$tool_dir/unpacked/xcodegen/bin/xcodegen"
[[ -f "$tool" ]] || { printf '%s\n' 'Unexpected XcodeGen release layout.' >&2; exit 1; }
chmod +x "$tool"
"$tool" --version
printf '%s\n' "$(dirname "$tool")" >> "$GITHUB_PATH"
xcodebuild -version
