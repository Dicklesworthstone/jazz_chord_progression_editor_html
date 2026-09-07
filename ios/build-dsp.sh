#!/usr/bin/env bash
# Build the original Changes Rust instrument core for iPhone, Simulator, and
# Mac Catalyst, then package it as a non-embedded static XCFramework.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: FrankenJazz Apple DSP slices require a Darwin host with Xcode" >&2
  exit 2
fi

APPLE_DEPLOYMENT_TARGET="${APPLE_DEPLOYMENT_TARGET:-17.0}"
APPLE_RUST_TOOLCHAIN="${APPLE_RUST_TOOLCHAIN:-nightly-2026-08-31-aarch64-apple-darwin}"
APPLE_CARGO="${APPLE_CARGO:-$(rustup which --toolchain "$APPLE_RUST_TOOLCHAIN" cargo)}"
TARGET_BASE="${RCH_TARGET_BASE:-${CARGO_TARGET_DIR:-target}}"
TARGET_ROOT="${FRANKENJAZZ_APPLE_TARGET_DIR:-${TARGET_BASE}/frankenjazz-apple}"
MANIFEST="ios/rust/Cargo.toml"
LIBRARY="libfrankenjazz_dsp.a"

for target in \
  aarch64-apple-ios \
  aarch64-apple-ios-sim \
  aarch64-apple-ios-macabi \
  x86_64-apple-ios-macabi
do
  rustup target list --toolchain "$APPLE_RUST_TOOLCHAIN" --installed | grep -qx "$target" || \
    rustup target add --toolchain "$APPLE_RUST_TOOLCHAIN" "$target"
  IPHONEOS_DEPLOYMENT_TARGET="$APPLE_DEPLOYMENT_TARGET" \
    RUSTUP_TOOLCHAIN="$APPLE_RUST_TOOLCHAIN" \
    RCH_CARGO_WRAPPER_BYPASS=1 \
    CARGO_TARGET_DIR="$TARGET_ROOT" \
    "$APPLE_CARGO" build --release --locked --manifest-path "$MANIFEST" --target "$target"
done

header_root="$(mktemp -d /tmp/frankenjazz-dsp-headers.XXXXXX)"
catalyst_root="$(mktemp -d /tmp/frankenjazz-dsp-catalyst.XXXXXX)"
output_root="$(mktemp -d /tmp/frankenjazz-dsp-xcframework.XXXXXX)"
trap 'rm -rf "$header_root" "$catalyst_root" "$output_root"' EXIT
cp ios/rust/include/frankenjazz_dsp.h ios/rust/include/module.modulemap "$header_root/"

lipo -create \
  "$TARGET_ROOT/aarch64-apple-ios-macabi/release/$LIBRARY" \
  "$TARGET_ROOT/x86_64-apple-ios-macabi/release/$LIBRARY" \
  -output "$catalyst_root/$LIBRARY"

staged="$output_root/FrankenJazzDSP.xcframework"
xcodebuild -create-xcframework \
  -library "$TARGET_ROOT/aarch64-apple-ios/release/$LIBRARY" -headers "$header_root" \
  -library "$TARGET_ROOT/aarch64-apple-ios-sim/release/$LIBRARY" -headers "$header_root" \
  -library "$catalyst_root/$LIBRARY" -headers "$header_root" \
  -output "$staged"

framework="ios/FrankenJazzDSP.xcframework"
backup=""
if [[ -e "$framework" ]]; then
  backup="$output_root/FrankenJazzDSP.previous.xcframework"
  mv "$framework" "$backup"
fi
if mv "$staged" "$framework"; then
  rm -rf "$backup"
else
  [[ -z "$backup" ]] || mv "$backup" "$framework"
  exit 1
fi

du -sh "$framework"
echo "built $framework"
