# iOS release-readiness evidence — 2026-09-01

This record covers the local source closure for Bead
`jcpe-ios-quality-verification-uo47.7`. It proves catalog hygiene, generated
project currency, entitlement/privacy consistency, an unsigned local archive,
and current-source builds/tests. It does not claim code signing, notarization,
App Store Connect upload, or Apple's remote validation.

## Implemented laws

- The catalog references exactly one opaque 1024×1024 App Store icon. The old
  RGBA duplicate was Git-tracked but unreferenced; it was removed and remains
  recoverable from Git history.
- The in-app monster artwork now has exact 64×64, 128×128, and 192×192 PNGs for
  its 1x/2x/3x slots instead of a 1024-pixel 1x image plus two empty slots. The
  variants are deterministic downscales of the approved source artwork.
- Catalyst build settings name `Sources/FrankenJazz.entitlements`, whose only
  capabilities are App Sandbox and user-selected read/write files. There is no
  network entitlement, matching the privacy manifest's zero tracking and zero
  collected-data declaration.
- `project.yml` remains the version/build and project authority. The README now
  records the release-version versus monotonically increasing upload-build law
  and the exact regeneration/diff gate already enforced by Apple CI.

## Executed gates

1. `xcodegen generate --spec project.yml && git diff --exit-code -- FrankenJazz.xcodeproj Sources/Info.plist`
   - PASS; the committed generated project and plist are current.
2. Generic iOS Simulator build with a fresh derived-data directory
   - PASS, exit 0, with zero asset-catalog warnings.
3. Mac Catalyst current-source unit suite
   - PASS: 38 tests, 38 passed, 0 failed, 0 skipped, 0 expected failures.
   - Result bundle: `/tmp/FrankenJazzAssetsCatalystDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-51-15--0400.xcresult` on the executing host.
   - No asset-catalog warning was emitted. The host still emits its unrelated
     missing Metal-toolchain search-path warning.
4. Unsigned generic-iOS archive
   - PASS, exit 0, at `/tmp/FrankenJazzAssets.xcarchive` on the executing host.
   - Archive version 2 contains an arm64 FrankenJazz application, privacy
     manifest, compiled assets, app icons, and dSYM; version is 0.1.0 (1).
5. Catalyst build-setting inspection plus plist/image inspection
   - PASS: Catalyst support enabled; bundle id `com.frankenjazz.FrankenJazz`;
     entitlement path resolves; sandbox and user-selected read/write are true;
     privacy collections/tracking are empty/false; the source App Store icon is
     1024×1024 with no alpha channel.

## Source-closure hashes

```text
08434bf7fbd82910ac45654934fd9382a12aa9498f401e87760e67354c041dc5  ios/Assets.xcassets/AppIcon.appiconset/Contents.json
caad79dbfaa896630442e8fdea173ff6763d607293f2af05b21c0595b808a9a6  ios/Assets.xcassets/AppIcon.appiconset/FrankenJazz-AppIcon-1024-opaque.png
f4947b89575cdf12fbffd640b86b628606f4cb3f20597a58efc8fd9cca308819  ios/Assets.xcassets/MonsterIcon.imageset/Contents.json
26fec1cabdded9fee00c9b0d61092f4a3b560030a8be4521bc829300b98ea316  ios/Assets.xcassets/MonsterIcon.imageset/FrankenJazz-Monster-64.png
344787db1310834a17d8063edbc2d96689fd42342de1bbe51eb8f836f52337d3  ios/Assets.xcassets/MonsterIcon.imageset/FrankenJazz-Monster-128.png
db7191ce977403ea974bbdaa17cc83a2193533404da071d840200e263686e5f7  ios/Assets.xcassets/MonsterIcon.imageset/FrankenJazz-Monster-192.png
f2e96d699140991e813f28f42f418789a730336e0a4c569806e3c0ffafca91fd  ios/Sources/FrankenJazz.entitlements
418018c160ded561d379cee1510cfb6e0806573c7221177a5330d76ea4145990  ios/Sources/PrivacyInfo.xcprivacy
7a5d23d3b2b11c1ef82c893847fce5489927a0024a7cd433739c9832221e8ae5  ios/project.yml
e35cd2bc40dd3c080b4510d23ce2d8d74129cfd48edd2397899e68a048d74643  ios/FrankenJazz.xcodeproj/project.pbxproj
d896d62913ccaf4d2d2f0269b925797b485fefc4908d6587b81a0e693dddec6f  ios/README.md
```
