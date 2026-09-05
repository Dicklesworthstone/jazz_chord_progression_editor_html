#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root/ios"

build_root="${FRANKEN_APPLE_BUILD_ROOT:-${DSR_QUALITY_RUN_DIR:-$repo_root/ios/build/dsr-apple-quality}}"
mkdir -p "$build_root/tmp"
sbh check --need 20G "$build_root"
(cd "$repo_root" && bun run check:ios-instrument-samples)
command -v xcodegen >/dev/null
xcodegen generate --spec project.yml
git diff --exit-code -- FrankenJazz.xcodeproj Sources/Info.plist
git ls-files -z -- '*.swift' | xargs -0 xcrun swiftc -parse -enable-bare-slash-regex
plutil -lint Sources/Info.plist
plutil -lint Sources/PrivacyInfo.xcprivacy
plutil -lint Sources/FrankenJazz.entitlements

/Users/jemanuel/.local/bin/ensure-simulator-audio-safe prepare
TMPDIR="$build_root/tmp" xcodebuild -project FrankenJazz.xcodeproj -scheme FrankenJazz \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$build_root/derived-data" \
  CODE_SIGNING_ALLOWED=NO build
TMPDIR="$build_root/tmp" xcodebuild -project FrankenJazz.xcodeproj -scheme FrankenJazz \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  -derivedDataPath "$build_root/derived-data" \
  CODE_SIGNING_ALLOWED=NO test -only-testing:FrankenJazzTests

# Resolve concrete devices only after proving the Simulator audio fence. The
# UI lanes intentionally exclude the one test that starts audible playback.
/Users/jemanuel/.local/bin/ensure-simulator-audio-safe prepare
iphone_id="${FJAZZ_IPHONE_SIMULATOR_ID:-}"
ipad_id="${FJAZZ_IPAD_SIMULATOR_ID:-}"
if [[ -z "$iphone_id" || -z "$ipad_id" ]]; then
  simulator_devices="$({ xcrun simctl list devices available || true; })"
  if [[ -z "$iphone_id" ]]; then
    iphone_id="$(awk -F '[()]' '
      /iPhone/ && /\(Booted\)$/ { print $2; found = 1; exit }
      /iPhone/ && fallback == "" { fallback = $2 }
      END { if (!found) print fallback }
    ' <<< "$simulator_devices")"
  fi
  if [[ -z "$ipad_id" ]]; then
    ipad_id="$(awk -F '[()]' '
      /iPad/ && /\(Booted\)$/ { print $2; found = 1; exit }
      /iPad/ && fallback == "" { fallback = $2 }
      END { if (!found) print fallback }
    ' <<< "$simulator_devices")"
  fi
fi
if [[ -z "$iphone_id" || -z "$ipad_id" ]]; then
  echo "FrankenJazz DSR requires one available iPhone and one available iPad Simulator" >&2
  exit 1
fi

/Users/jemanuel/.local/bin/ensure-simulator-audio-safe prepare
TMPDIR="$build_root/tmp" xcodebuild -project FrankenJazz.xcodeproj -scheme FrankenJazz \
  -destination "platform=iOS Simulator,id=$iphone_id" \
  -derivedDataPath "$build_root/derived-data" \
  CODE_SIGNING_ALLOWED=NO test \
  -only-testing:FrankenJazzUITests \
  -skip-testing:FrankenJazzUITests/FrankenJazzUITests/testRealPlaybackAndChordInspectorPath \
  -skip-testing:FrankenJazzUITests/FrankenJazzUITests/testIPadExpandedWorkspaceExposesLibraryChartInspectorAndTransport

/Users/jemanuel/.local/bin/ensure-simulator-audio-safe prepare
TMPDIR="$build_root/tmp" xcodebuild -project FrankenJazz.xcodeproj -scheme FrankenJazz \
  -destination "platform=iOS Simulator,id=$ipad_id" \
  -derivedDataPath "$build_root/derived-data" \
  CODE_SIGNING_ALLOWED=NO test \
  -only-testing:FrankenJazzUITests/FrankenJazzUITests/testIPadExpandedWorkspaceExposesLibraryChartInspectorAndTransport
