# iOS native gap-closure evidence — 2026-09-01

This record covers the local source closure for Bead `jcpe-darl`. It does not
claim an App Store build, a signed archive, physical-device listening, or a
GitHub Actions result.

## Environment

- macOS host, Apple silicon
- Xcode 26.1.1 (build 17B100)
- XcodeGen 2.46.0
- source date: 2026-09-01 America/New_York

## Executed gates

1. `xcodegen generate --spec project.yml`
   - Result: PASS; the checked-in Xcode project was regenerated from the
     declarative project file.
2. `xcodebuild -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'platform=macOS,variant=Mac Catalyst' -derivedDataPath /tmp/FrankenJazzDerived CODE_SIGNING_ALLOWED=NO test -only-testing:FrankenJazzTests`
   - First run: FAIL, 27 tests with one assertion failure because the new add9
     test assumed pitch-class presentation order. The assertion was corrected
     to compare sets; production code was unchanged by that correction.
   - A later Save Copy regression assertion also exposed ISO-8601 subsecond
     normalization; the assertion was narrowed to the persisted document
     fields rather than requiring byte-identical `Date` precision.
   - Final run: PASS, 28 tests, 0 failures, 0 skipped tests, and 0 expected
     failures, independently read with `xcresulttool get test-results summary`.
   - Result bundle: `/tmp/FrankenJazzDerived/Logs/Test/Test-FrankenJazz-2026.09.01_22-37-54--0400.xcresult` on the executing host.
3. `xcodebuild -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FrankenJazzIOSDerived CODE_SIGNING_ALLOWED=NO build`
   - Result: PASS (`BUILD SUCCEEDED`).
4. Catalyst build-setting inspection
   - Result: `SUPPORTS_MACCATALYST = YES` and
     `CODE_SIGN_ENTITLEMENTS = Sources/FrankenJazz.entitlements`.

The unit suite includes independent assertions for added-ninth parsing,
explicit-duration formatter/parser closure, contextual function labels,
audible slash basses in every voicing family, distinct Spread voicing, and
next-chord transition motion. The CI workflow repeats project-generation
drift, iOS Simulator build, and Catalyst unit-test gates on pushes and pull
requests that touch the Apple app.

## Source-closure hashes

```text
872e213111ba77a96c5167482ec748ca20f4a3c7cc2b92d32b3e71c68a4bb4f2  ios/Sources/JazzTheory.swift
720b57a4cde560c87c3c5e4f3f1cb54034e12a4c3817a01ee73bc03b628bb310  ios/Sources/JazzModels.swift
0bb54272d0d4ed8007a0d18e70cdd8f7b1142cefcd0612d8483e6437bd783fdd  ios/Sources/JazzStudioStore.swift
b1d70bbdc6aa0385a11dabb5d5f08b7a350e6ab14b8296491e89a00a3c2afad6  ios/Sources/FrankenJazzStudioView.swift
19a256eb6a1dd4a59153fd3f3340a45ce1441048358374c22035acf0b6bb2b26  ios/Sources/FrankenJazzApp.swift
6849ee5a4ff2e35d099a0bfdc74188f043e7dd075a586b20fb08af8a1c4c7328  ios/Sources/FrankenJazzTheme.swift
0a77fbde41cae61513c9e1bcb91c8f529b8fe7604ce537f9dca46723a5eee23e  ios/Tests/FrankenJazzCoreTests.swift
7a5d23d3b2b11c1ef82c893847fce5489927a0024a7cd433739c9832221e8ae5  ios/project.yml
f2e96d699140991e813f28f42f418789a730336e0a4c569806e3c0ffafca91fd  ios/Sources/FrankenJazz.entitlements
1f7675b0ae9aa3e93b7f8bcdfca0e45ec909812d98f19d7c603833728748d8d2  .github/workflows/apple.yml
```

The historical commit `e371cd9` says it closes `jazz-4w9s`, but that Bead is
not present in this workspace. This record does not reinterpret or recreate
that missing tracker entry; current remediation is tracked by `jcpe-darl`.
