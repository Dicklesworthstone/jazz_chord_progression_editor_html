# iOS MIDI salvage evidence — 2026-09-02

This record covers the local source closure for Bead
`jcpe-ios-quality-verification-uo47.9`. It proves deterministic bounded repair
of conventional DAW note-state quirks and preservation of the existing hard
structural refusals. It does not claim sustain-pedal interpretation, format-2
support, non-4/4 import, or arbitrary tempo-map preservation.

## Implemented laws

- Re-striking a still-open note closes the earlier instance at the retrigger
  tick and starts the new instance; the ledger increments `retriggeredNotes`.
- A note-off without a matching open note is ignored as content-level debris;
  the ledger increments `ignoredNoteOffs`.
- Notes still open when the track ends are closed at the final decoded tick;
  the ledger increments `notesClosedAtTrackEnd`.
- A track chunk that ends without a formal end-of-track event is accepted after
  structurally valid decoding; the ledger increments `synthesizedEndOfTracks`.
- Repair counters remain bounded by the existing event/note ceilings and are
  included in the import result's user-visible notice. Store import remains one
  undoable document replacement.
- Invalid headers/chunks/events/VLQs, truncation, SMPTE division, format 2,
  hostile resource sizes, unsupported meter, and unnameable harmony retain
  their hard refusals.
- The document-center copy now tells musicians which common DAW defects are
  repaired and reported, and which semantic/structural boundaries still refuse.

## Executed gates

1. Focused Catalyst matrix: combined DAW-quirk salvage fixture, hostile timing
   and structure, truncation/limits/unnameable harmony, and independent format-1
   running-status fixture
   - PASS: 4 tests, 4 passed, 0 failed or skipped.
   - Result bundle: `/tmp/FrankenJazzMIDISalvageDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-55-24--0400.xcresult` on the executing host.
2. Full current-source Catalyst suite
   - PASS: 40 tests, 40 passed, 0 failed, 0 skipped, 0 expected failures.
   - Result bundle: `/tmp/FrankenJazzMIDISalvageFullDerived/Logs/Test/Test-FrankenJazz-2026.09.01_23-56-18--0400.xcresult` on the executing host.
3. Generic iOS Simulator build
   - PASS (`BUILD SUCCEEDED`, quiet-mode exit 0).
4. Focused iPhone 17 Pro / iOS 26.1 document-center UI boundary
   - PASS: 1 test, 1 passed, 0 failed or skipped.
   - Result bundle: `/tmp/FrankenJazzMIDISalvageUIRetry2Derived/Logs/Test/Test-FrankenJazz-2026.09.02_00-02-31--0400.xcresult` on the executing host.
   - A concurrent first attempt lost its simulator test-runner service. The
     first isolated retry then exposed XCTest's 128-character direct-identifier
   query ceiling; the assertion was corrected to a label predicate. The final
   isolated retry above is the credited UI result.
5. Patch hygiene
   - PASS: `git diff --check` produced no diagnostics.
6. UBS review of the four changed Swift files
   - REVIEWED: UBS reported 41 critical shell-execution matches, all of which
     are lexical false positives on SwiftUI `Font.system(...)` calls in
     `FrankenJazzStudioView.swift`; a direct search found no `Process`,
     `/bin/sh`, `popen`, or C `system` execution in the scanned files.
   - UBS also reported informational localization/formatting heuristics and no
     sleep-based tests or placeholder `XCTFail` calls. This is recorded as a
     reviewed static-analysis result, not misrepresented as a zero-finding run.

## Source-closure hashes

```text
dc1188769444757f46c4a004c5a1a88b3942e58a4c6be91a2cb485a71416d67b  ios/Sources/MIDIFileImporter.swift
debbae41cb04eb4916127ccf3c9b9ea6a09c22c43b2407ec5573413d27d7e35d  ios/Sources/FrankenJazzStudioView.swift
517cd82e18b11a6ca4980d7d2d276f61dc0323dc1d37000fc2d3cd06cbfa0b57  ios/Tests/FrankenJazzCoreTests.swift
4cb26487d293a910911df67afee257a1b1b68b4d246cfdbe893a5639220507b1  ios/UITests/FrankenJazzUITests.swift
edf3ea067984eed76c552bbf390ef07d5598846e5168b6d6aa59a64b5726aa5c  docs/APPLE_APP_PLAN.md
601aed20fbd42720af8c359bd1a2911f6f0bf48da2d84b430eef16143f7d820c  ios/README.md
```
