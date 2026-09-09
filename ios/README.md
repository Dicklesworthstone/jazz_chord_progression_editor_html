# FrankenJazz

FrankenJazz is the native Apple sibling of the Changes jazz progression studio.
One SwiftUI target adapts deliberately across iPhone, iPad, and Mac Catalyst.
It runs offline and stores recovery data only in the app's private Application
Support directory.

## Included in the native app

- bounded bar-delimited lead-sheet entry with automatic validated publication;
- a substantial bundled library of public-domain progressions, shared harmonic
  devices, and original studies with provenance and musical notes;
- selectable native measure cards, chord-tone piano, Roman/context reading,
  guide-tone evidence, six realized voicing families, and distinct per-chord
  Frozen and Manual exact voicings that drive playback and MIDI export;
- a compact note-by-note exact-voicing editor with semitone/octave moves,
  voice addition/removal, exact order and doubling preservation, and named
  range/count refusals;
- bounded per-chord rehearsal notes with lead-sheet indicators, undo, recovery,
  and canonical FrankenJazz document persistence;
- direct selected-chord symbol editing with parser-backed refusal, one-step
  undo, and an explicit choice to clear stored pitches or keep them as Manual;
- transposition, key, tempo, groove, and generated instrument controls;
- all 15 original instrument identities; the nine source-rendered instruments
  use their reviewed native equivalents: the original Rust Concert Grand,
  Flute, Clarinet, Archtop, Electric, Steel Dreadnought, and Re-entrant
  Ukulele physical models plus the pitch-verified CC0 Upright Bass and Concert
  Vibes sample engines. Chart playback and the tappable inspector keyboard
  share the same authoritative renderers;
- a persistent transport with background preparation, play/pause, Stop, loop,
  playhead highlighting, and interactive waveform-style seeking. Replacement
  and Stop cancel Swift render loops immediately, Concert Grand between bounded
  runtime steps, and simultaneous guitar-family chords inside their Rust
  physical simulation without caching or publishing partial PCM;
- atomic local recovery with a previous valid fallback;
- bounded `.frankenjazz`, lead-sheet text, and format-0/1 Standard MIDI File
  import; accepted named MIDI stacks retain their exact pitches as editable
  Manual voicings, with reported salvage for conventional DAW note-state quirks;
- actual `.frankenjazz`, `.txt`, and `.mid` exports through the system share sheet;
- a searchable My Charts repertoire of explicit snapshots with revision-bound
  open, rename, duplicate, replace, remove, and selected-chart export actions;
- deterministic bounded native collection backups with strict hostile-input
  refusal and a no-write restore preview that classifies additions, identicals,
  and conflicts before one explicit atomic merge;
- iPhone sheets, iPad split workspaces, keyboard shortcuts, and a freely
  resizable three-column Mac Catalyst studio.

## Generate and build

Requirements: Xcode 26 or newer and XcodeGen 2.46 or newer.

```bash
# Regenerate the compact native PCM resources only when their already-reviewed
# checked-in web payloads change.
bun run build:ios-instrument-samples
cd ios
xcodegen generate

# iPhone/iPad simulator
xcodebuild -project FrankenJazz.xcodeproj \
  -scheme FrankenJazz \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO build

# Mac Catalyst
xcodebuild -project FrankenJazz.xcodeproj \
  -scheme FrankenJazz \
  -destination 'platform=macOS,variant=Mac Catalyst' \
  CODE_SIGNING_ALLOWED=NO build

# Repository-owned DSR lane: generated-project drift, Swift/property-list
# checks, generic iOS build, Catalyst units, eleven non-audio iPhone interaction
# tests, and a focused iPad expanded-workspace plus inspector test.
cd ..
dsr quality --tool jazz_chord_progression_editor_html -w "$PWD"
```

The DSR UI lane deliberately excludes the separate playback-starting test.
Simulator audio is never played as automated evidence.

The current source-stable gate is recorded in
`docs/evidence/IOS_PHYSICAL_RENDER_CANCELLATION_2026-09-07.md`: generic iOS
build, 72 Catalyst tests, 11 iPhone UI tests, and 1 iPad UI test passed. Human
listening remains a separate owner/device release gate. The Flute, Clarinet,
and individual single-note plucked C calls are fenced before and after their
monolithic FFI calls; unlike Concert Grand and simultaneous guitar-family
chords, those individual calls are not yet preemptible from inside Rust.

The project file is generated from `project.yml`; edit that specification, not
the generated `project.pbxproj`. Before committing a project-setting change,
prove the checked-in project is current:

```bash
xcodegen generate --spec project.yml
git diff --exit-code -- FrankenJazz.xcodeproj Sources/Info.plist
```

`MARKETING_VERSION` is the user-facing release version and changes only when a
release is deliberately cut. `CURRENT_PROJECT_VERSION` is the monotonically
increasing build number and must advance for every new App Store Connect upload.
Both authorities live in `project.yml`; regenerating the project publishes them
to the target. Signing-team changes remain owner-controlled.

App data is never uploaded. The only way a chart leaves the device is an
explicit system share/export action.
