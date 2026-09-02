# iOS direct-editing evidence — 2026-09-01

This record covers the local source closure for Bead `jcpe-v64w`. It proves
the native direct-editing slice; it does not claim cross-bar chord movement,
drag-and-drop, a signed archive, physical-device testing, or a hosted-CI pass.

## Implemented laws

- Duplicate assigns a fresh identity, copies the chord and annotation, and
  splits the source beat slot without changing the bar total.
- Delete refuses the only change in a bar. Otherwise it transfers the removed
  duration to an adjacent survivor and preserves the four-beat total.
- Move earlier/later is bounded to the selected bar and preserves stable chord
  identity and duration.
- Insert bar creates one valid four-beat `Cmaj7` bar after the requested bar.
- Delete bar refuses the final remaining bar and selects a deterministic
  neighboring bar after success.
- Every successful action stops playback and travels through the store's one
  undo/recovery/re-prime mutation path. Every refusal leaves document and undo
  history unchanged.
- Touch users receive a visible inspector menu and chord context actions;
  VoiceOver receives named duplicate/delete actions; Catalyst receives native
  menu commands and shortcuts.

## Executed gates

1. `xcodegen generate --spec project.yml`
   - PASS; generated project remained current.
2. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'platform=macOS,variant=Mac Catalyst' -derivedDataPath /tmp/FrankenJazzDirectEditDerived CODE_SIGNING_ALLOWED=NO test -only-testing:FrankenJazzTests`
   - PASS: 32 tests, 32 passed, 0 failed, 0 skipped, 0 expected failures.
   - Result bundle: `/tmp/FrankenJazzDirectEditDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-29-16--0400.xcresult` on the executing host.
3. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'platform=iOS Simulator,id=12EC3EAF-28DE-4880-B763-1BD4F118D935' -derivedDataPath /tmp/FrankenJazzDirectEditUIDerived CODE_SIGNING_ALLOWED=NO test -only-testing:FrankenJazzUITests/FrankenJazzUITests/testInspectorDirectEditingDuplicatesAChangeAndPreservesAccess`
   - PASS: 1 UI test, 1 passed, 0 failed or skipped. The test opened the real
     chord inspector, invoked Duplicate Change, and observed the success state.
   - Result bundle: `/tmp/FrankenJazzDirectEditUIDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-25-54--0400.xcresult` on the executing host.
4. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FrankenJazzDirectEditIOSDerived CODE_SIGNING_ALLOWED=NO build`
   - PASS (`BUILD SUCCEEDED`, quiet-mode exit 0).
5. `git diff --check`
   - PASS.

## Source-closure hashes

```text
b3e4d309c55f3eda447b573b77e603ef368262dde04d62de7f629391e195f432  ios/Sources/JazzStudioStore.swift
3d41eb8f08945b7c66052156b756cdcf1fda61d277128e4ecd7b2368393776de  ios/Sources/FrankenJazzStudioView.swift
9815b17df3e02c40d6a12ad6126762142476a6848923f35c77ec30b68438d848  ios/Sources/FrankenJazzApp.swift
a489726bf1c9e72f4804d51d3e8071cc563261769d3f1eeb857ceac6f95a505b  ios/Tests/FrankenJazzCoreTests.swift
d3167ba42e965df8634b0c0e3fa42a4a5835b9bf53a0d6757e366a492cd69ed0  ios/UITests/FrankenJazzUITests.swift
```
