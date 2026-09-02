# iOS curated-library parity evidence — 2026-09-01

This record covers the local source closure for Bead `jcpe-cu6k`. It proves
native library inventory, parsing, playable pitch compilation, native groove
rendering, metadata loading, and one real iPhone library gesture. It does not
claim note-for-note equivalence between the native generated accompaniment and
the web audio engine, a physical-device run, or a hosted-CI pass.

## Implemented laws

- Every one of the web library's 27 stable IDs and exact chart texts is present
  in native FrankenJazz. The two pre-existing native original studies remain as
  additive entries, for 29 native entries total.
- The four narrowly authorized `owner-directed` entries retain that provenance
  instead of being mislabeled as public-domain works or original studies.
- Web entries with a canonical tempo apply it; entries without one preserve the
  musician's current tempo, matching the web library-load contract.
- `uptempo-swing@1` and `syncopated-sixteenths@1` map to distinct native groove
  cases with distinct locally rendered percussion patterns.
- `6/9` is parsed as a chord quality while ordinary slash notation remains an
  explicit bass. This closes the `F6/9` and `Eb6/9` vocabulary needed by Peg.
- All 29 native library charts parse, compile one non-empty playable pitch set
  per chord event, and stay inside the supported MIDI range.

## Executed gates

1. Canonical inventory/chart comparison (read-only Node script over the two
   source files)
   - PASS: web 27, native 29, missing `[]`, mismatched chart texts `[]`.
2. `xcodegen generate --spec project.yml`
   - PASS; generated project remained current.
3. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'platform=macOS,variant=Mac Catalyst' -derivedDataPath /tmp/FrankenJazzLibraryFullDerived CODE_SIGNING_ALLOWED=NO test -only-testing:FrankenJazzTests`
   - PASS: 35 tests, 35 passed, 0 failed, 0 skipped, 0 expected failures.
   - Result bundle: `/tmp/FrankenJazzLibraryFullDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-38-39--0400.xcresult` on the executing host.
4. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'platform=iOS Simulator,id=12EC3EAF-28DE-4880-B763-1BD4F118D935' -derivedDataPath /tmp/FrankenJazzLibraryUIDerived CODE_SIGNING_ALLOWED=NO test -only-testing:FrankenJazzUITests/FrankenJazzUITests/testOwnerDirectedLibraryEntryIsSearchableAndLoadsCanonicalMetadata`
   - PASS: 1 UI test, 1 passed, 0 failed or skipped on iPhone 17 Pro / iOS 26.1.
   - The test searched the real library sheet for Giant Steps, loaded it, and
     observed the chart title, 290 BPM, and Uptempo swing selection.
   - Result bundle: `/tmp/FrankenJazzLibraryUIDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-39-05--0400.xcresult` on the executing host.
5. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FrankenJazzLibraryIOSDerived CODE_SIGNING_ALLOWED=NO build`
   - PASS (`BUILD SUCCEEDED`, quiet-mode exit 0).
6. `git diff --check`
   - PASS.
7. `ubs` over all changed Swift, test, plan, and evidence files
   - REVIEWED: no actionable finding introduced by this slice. The 41 reported
     “Process/system” criticals are the scanner mistaking SwiftUI `.system(...)`
     font calls for shell execution. The three `Data(contentsOf:)` warnings are
     pre-existing bounded document/recovery reads; the user-selected import read
     already occurs in a detached task.

## Source-closure hashes

```text
743c929b5f750c6029355b377060f2f3e82e859f8b9f3f45df7a97b12d448905  src/application/studio-progression-library.ts
0907f5471888ab2852479c571f6527a6c602db8e81b0273a0168f349e4ef6ac3  ios/Sources/JazzLibrary.swift
174a6af765b1344ff7670a909c6daaada7923a30ec3d4d7183d6b9e0a36e9201  ios/Sources/JazzModels.swift
bb6430403276dc5d3e88312ae8982f78aba9cd769b23a940bf574916b8212c5f  ios/Sources/JazzTheory.swift
72be14d766a147d358e9ccdef9cf5faa5a6003b3c2cc89ebb2754bb1cd45e5e6  ios/Sources/JazzAudioRenderer.swift
ca1f6b12a35dc65bc56dde354ff254b1d312e25875a9b0e3a8ffba8feea2d50a  ios/Sources/JazzStudioStore.swift
ee5ade6d569155a904d4e74222dc1f9675dcf5414400f5480d6e9be2eed6415d  ios/Sources/FrankenJazzStudioView.swift
85e0c9db4e1a88d4015506881a0ac9e6e7c147d7f648beb2ba236aab1b82810e  ios/Tests/FrankenJazzCoreTests.swift
f73c80995266bebfc07da38dc8b479f0284c6cc1d59cc9f9ac460ba5d2fa5ce3  ios/UITests/FrankenJazzUITests.swift
```
