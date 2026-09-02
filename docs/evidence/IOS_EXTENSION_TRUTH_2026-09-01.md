# iOS chord-extension truth evidence — 2026-09-01

This record covers the local source closure for Bead
`jcpe-ios-quality-verification-uo47.5`. It proves the native parser, default
balanced playback, and Standard MIDI export share the same literal interval
authority for every bundled library symbol. It does not claim that deliberately
reduced shell/rootless voicing families contain every literal chord tone, or
that native generated audio is timbrally identical to the web engine.

## Implemented laws

- `ChordDescription` keeps both pitch-class identity and root-relative,
  octave-aware intervals; 9ths, 11ths, and 13ths no longer collapse into the
  root octave before voicing.
- The suffix grammar is an exact closed set. Unknown tails such as
  `maj7banana` refuse and the quick-entry diagnostic names that fragment.
- `maj7#11`, altered dominants, altered ninths/fifths, 6/9, 9ths, 11ths, and
  13ths produce explicit interval sets rather than falling through broad
  substring branches.
- Color descriptions derive from realized intervals and quality, so the
  inspector cannot announce altered or extended color that the tone set lacks.
- Balanced voicing carries up to six authored intervals. Open voicing uses the
  realized perfect, flat, or sharp fifth rather than forcing a perfect fifth.
- The 6/9 slash remains a quality through parsing and transposition; ordinary
  slash notation remains an audible explicit bass.
- For all 29 library entries plus the starter, tests compare each literal
  pitch-class set (including an explicit bass) with compiled balanced playback,
  then parse the exported MIDI track and compare its note-ons with the compiled
  pitches.

## Executed gates

1. Focused Catalyst regressions for extension intervals, named refusal, full
   library playback/MIDI identity, and library parse/playability
   - PASS: 4 tests, 4 passed, 0 failed or skipped.
   - Result bundle: `/tmp/FrankenJazzExtensionsDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-46-15--0400.xcresult` on the executing host.
2. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'platform=macOS,variant=Mac Catalyst' -derivedDataPath /tmp/FrankenJazzExtensionsFullDerived CODE_SIGNING_ALLOWED=NO test -only-testing:FrankenJazzTests`
   - PASS: 38 tests, 38 passed, 0 failed, 0 skipped, 0 expected failures.
   - Result bundle: `/tmp/FrankenJazzExtensionsFullDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-47-30--0400.xcresult` on the executing host.
3. `xcodebuild -quiet -project FrankenJazz.xcodeproj -scheme FrankenJazz -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/FrankenJazzExtensionsIOSDerived CODE_SIGNING_ALLOWED=NO build`
   - PASS (`BUILD SUCCEEDED`, quiet-mode exit 0).
4. `git diff --check`
   - PASS.
5. `ubs` over both changed Swift sources, the changed test source, the plan,
   and this evidence record
   - PASS: 0 critical, 0 warning, 0 info findings in the changed Swift files.

## Source-closure hashes

```text
5016ab46ec83b068f0650a904353ce151e36a6021fc4f8840f4ee864c10740fa  ios/Sources/JazzModels.swift
9914f949a1b9433bb324da7ed2c5a45ebaad4cbdef85d0c934f7ceb7c91f3907  ios/Sources/JazzTheory.swift
85f91a5b793b0ac3549b0d88e1b81eab6eb1716a69a84165bff29a53ef19cea3  ios/Tests/FrankenJazzCoreTests.swift
96da683889a0fe9b965f3ece6c08de862eb76c7d8ef98bc3cb9cda69b5b424a1  docs/APPLE_APP_PLAN.md
```
