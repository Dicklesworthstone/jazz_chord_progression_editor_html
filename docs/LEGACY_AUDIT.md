# Legacy Architecture and Failure Audit

Status: evidence baseline for the ground-up rebuild

Audited artifact: `jazz_chord_progression_editor.html` at 8,201 lines

Audit date: 2026-07-11

## Executive conclusion

The current application is not a modular editor with a few isolated defects. It
is one Alpine object containing the UI state, progression data, chord catalog,
multiple overlapping theory engines, several audio graphs, transport state,
import/export, mobile gestures, and all presets. Later object members silently
override earlier members with the same name. As a result, substantial portions
of the code and README-described behavior are dead, while the live behavior is
determined by source order.

The reported audio, UI, and theory glitches are reproducible consequences of
that structure:

- Whole-progression playback calls both voicing branches with an undefined
  variable, producing a `ReferenceError` for every chord.
- Tempo changes an unused Tone transport while live playback advances through
  fixed-duration wall-clock timers.
- Seeking requires a sequence object that live playback never creates.
- Advanced voicing first references an undefined chord and, independently,
  depends on a note map that does not exist on application state.
- Chord qualities are inferred with substring tests, so `maj7` is treated as
  minor and extended dominants such as `9`, `11`, and `13` lose their seventh.
- Stop, reset, preview, section playback, and instrument changes compete through
  unowned delayed callbacks and repeatedly disconnect, dispose, or recreate the
  synth and its graph.
- Mobile gesture initialization accumulates listeners, blocks ordinary touch
  behavior, and relies on array indices that cease to be stable after reorder.
- The UI disables browser zoom, omits accessible names on icon controls, uses
  click-only pseudo-controls, and provides neither focus containment nor a
  reliable escape path for all dialogs.

This evidence supports a replacement architecture. Patching the monolith would
preserve the conflicting sources of truth that caused the failures.

## Repository baseline

There is no `AGENTS.md` in this checkout or its project-root ancestry. The
tracked repository originally contained only:

- `jazz_chord_progression_editor.html`
- `README.md`
- `CHANGELOG.md`
- three image assets
- `LICENSE`

There was no package manifest, build system, source-module tree, schema,
automated test, browser test, formatter, linter, type checker, or release gate.
All third-party runtime resources were loaded from public CDNs. The supposed
download-and-double-click workflow therefore still required a working network
and compatible remote package versions.

The preserved cutover baseline is:

- Git commit: `c585871b638bea8b616a707e1a477b583c2cdf0d`
- Artifact SHA-256:
  `04d105634cab0ee064d42888b74bca8ca51feea7c82263e470004fb0b51c07e8`
- Artifact size: 419,344 bytes

The generated replacement may overwrite the tracked root artifact only after
the build verifies these values against the legacy file or an explicitly
provided legacy-baseline copy. This prevents a deterministic build from
silently destroying the evidence it is meant to supersede.

## Physical architecture

The single HTML artifact is organized only by comments:

| Region | Lines | Responsibility |
|---|---:|---|
| Remote assets | 15-36 | FontAwesome, Tailwind, Alpine, Animate.css, DaisyUI, Tone.js, SortableJS, FileSaver, Tonal.js, Popper, and Tippy |
| Custom CSS | 38-464 | Cards, timeline, piano, drag states, and mobile overrides |
| Alpine root | 467 | `x-data="chordEditor()"` plus `x-init="init()"` |
| Top navigation | 472-516 | Global document and audio actions |
| Chord palette | 518-692 | Root picker, catalog, and custom builder |
| Progression editor | 694-885 | Sections, chord cards, annotations, and reorder actions |
| Player | 887-1007 | Transport, scrubber, instrument, volume, and BPM |
| Dialogs | 1009-1790 | Presets, chord editor, settings, import, help, naming, and annotations |
| Alpine application object | 1795-8196 | Every state field, algorithm, integration, and preset |

The README calls this a component-based Alpine architecture. In practice,
there are no component boundaries: every method can mutate every domain, UI,
or audio field.

## Core data model

The only durable aggregate is:

```text
Progression
  name
  description
  sections[]
    name
    collapsed
    annotation
    transient edit flags
    chords[]
      name
      root
      type
      bass
      notes[]
      b5 / s5 / b9 / s9 / s11 / b13
      annotation
      voicingStyle
      baseOctave
      octaveSpan
      density
      tensions[]
```

The model has no schema version or stable IDs. Section and chord identity is an
array index, including Alpine keys, selection, playback highlighting, Sortable
closures, annotations, and touch events. A reorder changes identity from the
perspective of any stale listener.

Literal chord data and derived data are mixed:

- `name`, `type`, alteration booleans, and `tensions` can disagree.
- `notes` can be user-authored, generated, legacy-loaded, voice-led, or repaired
  without a provenance or mode field.
- Manual piano edits appear durable but playback runs them through another
  optimizer and may change them.
- UI-only fields such as section editing flags are stored inside progression
  content.
- Settings and playback semantics are not exported with the document.

## Boot and listener lifecycle

`init()` filters the palette, applies a theme, computes duration, populates a
preset preview, installs keyboard and unload listeners, constructs the audio
enable overlay, repairs progression notes, installs custom touch events, and
starts a deep watcher over every section.

Several intended boot paths never run:

- `mounted()` contains resize and safe-area setup but is never called.
- `initSortable()` is not called for the initial document.
- `initTooltips()` is never called.
- Initial `isPlaying` is `true` even though audio and transport are idle.

The deep section watcher repeatedly calls `initSwipeGestures()`. That method
adds new anonymous listeners to every chord card and never removes previous
listeners. Document-level touch and custom-event listeners are also anonymous,
so `cleanup()` cannot remove them. Long sessions therefore accumulate behavior.

## Duplicate method keys and dead code

The Alpine object defines six methods twice. JavaScript object-literal semantics
make only the later definition live:

| Method | Earlier definition | Live definition |
|---|---:|---:|
| `initSimpleTone` | 2406 | 4589 |
| `playChord` | 3334 | 4347 |
| `stopPlayback` | 4429 | 6393 |
| `emergencyResetAudio` | 4517 | 6519 |
| `getNoteIndex` | 2538 | 3836 |
| `prioritizeChordTones` | 5066 | 6117 |

This is not harmless duplication. The earlier instrument-aware initializer is
replaced by a triangle-synth initializer. The comprehensive reset is replaced
by a smaller context-close routine. Comments and README descriptions often
describe the overridden implementation rather than the code that runs.

## Audio and transport failures

### Confirmed playback exception

`startPlayback()` assigns `currentChord` and then calls both the advanced and
simple voicing branches with `chord`, which is undefined. A headless Chromium
run reproduced:

```text
ReferenceError: chord is not defined
    at jazz_chord_progression_editor.html:4125
```

The per-chord catch advances to the next timer, so the application can appear to
be playing while emitting no chord and not presenting useful recovery.

### More than one scheduler

The file contains three incompatible scheduling designs:

1. whole-progression recursive `setTimeout` playback;
2. section-specific first-chord-plus-recursive-timers playback;
3. a Tone `Sequence`/`Transport` path that is defined but not used by the live
   progression or section controls.

The UI is wired to state from the third design in some places and the first two
designs in others.

Consequences:

- BPM updates only `Tone.Transport.bpm`; live playback uses seconds from
  `chordDuration`, so BPM has no audible effect.
- `seekToPosition()` returns when `chordSequence` is null; live playback never
  assigns it, so the scrubber is inert.
- Progress advances at timer boundaries, not from an audio clock.
- Browser timer jitter, tab throttling, and audio-clock drift are unaccounted
  for.

### Graph mutation as ordinary control flow

Stop and transition paths silence the synth by assigning `-Infinity`, release
notes, disconnect the synth, and later reconnect it. Section completion uses a
"nuclear cleanup" timer that disposes the active synth and creates a generic
triangle synth directly on the destination. This silently loses the selected
instrument and bypasses EQ, reverb, and limiting.

Instrument changes independently dispose and rebuild the voice graph. Several
paths rebuild it with different polyphony, envelope, routing, and volume rules,
so the same instrument label does not guarantee the same sound across a
session.

The last live `initSimpleTone()` preconnects EQ to reverb and reverb to limiter,
then also uses a full chain call over the same nodes. Stop later reconnects the
synth to EQ without a graph ownership abstraction. Routing is an emergent side
effect rather than a fixed topology.

### Unowned callbacks

`playVoicedChord()` schedules a 40 ms delayed volume restore and attack without
storing its handle. `stopPlayback()` schedules a 150 ms reconnect. Section-end
and fallback paths add more delayed callbacks. A stop or new playback cannot
invalidate all of them; an old callback can sound a note, restore volume,
reconnect, or dispose a newer synth.

### Reset is not a state transition

The live emergency reset only closes the Tone context and recreates the enable
overlay. It does not serialize with playback, retire stale callbacks, reset all
transport fields, or rebuild a single canonical graph. Closing a context also
makes it unusable, while several paths continue to retain nodes made from it.

## Music-theory failures

The application has at least five overlapping theory representations:

1. the UI chord catalog's symbolic interval lists;
2. suffix-to-type and alteration parsing;
3. a separate type-to-interval map;
4. editor-specific chord reconstruction and style transforms;
5. simple and advanced playback voicing pipelines.

They do not cover the same vocabulary and do not share one chord type.

### Substring classification

Quality and function are inferred with string containment:

- `maj7` and `maj9` contain `m`, so multiple paths classify them as minor.
- `9`, `11`, `13`, and `alt` do not contain `7`, so dominant detection fails.
- `dim7` can take a generic minor path before diminished-specific logic.
- "function" is inferred from chord quality alone, without a key, previous
  chord, next chord, or section context.

Runtime checks confirmed corrupt regeneration examples:

| Requested symbol | Regenerated result |
|---|---|
| `Cmaj7` | C, E-flat, G, B |
| `Cmaj9` | C, E-flat, G, D |
| `C9` | C, E, G, D (missing B-flat) |
| `C13` | C, E, G, A (missing B-flat) |
| `Cdim7` | C, E-flat, G, B-flat |

### Catalog and resolver drift

The visible catalog advertises qualities that `getIntervalsForChordType()` does
not implement. `mMaj7`, `augMaj7`, `m11`, `maj13`, `m13`, `9sus4`, `13sus4`,
and `7sus4` fall back silently to a major triad.

The custom builder records alteration flags but generates notes before applying
those alterations. The advanced editor computes a tension/density-adjusted
interval array, then ignores it and manually rebuilds a different note list.
Several displayed controls therefore do not control the saved result.

### Pitch-class collapse and spelling errors

Pitch spelling is repeatedly implemented as a map from strings to 0-11 and a
reverse lookup that prefers naturals, then sharps, or hard-coded flats. The key,
root spelling, and interval degree do not govern the result. Enharmonic pitches
sound alike but musical identity is lost: for example, the seventh of D-flat 7
must be C-flat, not B, if the UI is explaining chord structure.

Tonal.js is loaded but never used. The repeated handwritten maps therefore gain
the network and compatibility cost of Tonal without using it as implementation
or oracle.

### Advanced mode is independently broken

The whole-progression advanced branch references the undefined `chord` variable.
If corrected, `intervalsToNotes()` and register adjustment call
`Object.keys(this.noteMap)`, but application state defines no `noteMap`.
Headless execution reproduced `Cannot convert undefined or null to object`.

### Voice-leading state does not represent sounded notes

The simple transition engine updates `voiceLeadingState`, after which
`playVoicedChord()` runs the notes through `optimizeJazzVoicing()` a second
time. The next chord is optimized against the pre-playback voicing, not the
notes that actually sounded. Essential-tone assignment also uses greedy string
and pitch-class checks that can collapse enharmonic distinctions or reuse
inappropriate voices.

### Manual voicing is not authoritative

The Notes tab suggests exact note editing, but the playback layer always runs an
algorithmic optimizer. A user's chosen inversion, doubling, register, or cluster
can therefore be rewritten without notice. There is no mode distinguishing an
automatic voicing recipe from exact manual pitches.

## Import, export, and data safety

Export serializes only `currentProgression`. It omits tempo, meter, instrument,
volume, reverb, theme, and any explicit schema version.

Import checks primarily for a `sections` array and then mutates/repairs nested
objects in place. Unknown or missing chord types often fall back to a major
triad. Failed parsing can therefore turn user data into plausible but incorrect
music rather than preserving the unknown value or refusing safely.

There is no transactional decode, size/depth limit, migration report, local
recovery, autosave, dirty indicator, or undo history. New/preset actions use
blocking browser confirms; ordinary edits can be lost without recovery.

All identity remains index-based after import, duplicate, and reorder. Presets
are embedded as large mutable objects inside application state and receive only
shallow normalization before immediate playback.

## UI and UX audit

### Critical and major task failures

- The initial transport icon shows pause because `isPlaying` starts true.
- Main playback is silent due to the confirmed undefined variable.
- Chord and preset preview markup passes one argument to functions that expect
  `(event, value)`, so the value is undefined. Chromium reproduced Alpine
  expression errors for preview.
- The chord annotation menu contains malformed HTML with a missing opening
  anchor and a stray closing anchor, leaving the action inert.
- Settings and help dialogs have methods and markup but no reliable visible
  desktop opener.
- Escape-state detection omits at least presets and mobile settings.
- The mobile palette open button is nested inside the panel controlled by the
  same visibility state, making reopen behavior fragile.

### Accessibility failures

- The viewport explicitly disables user scaling.
- Most icon-only buttons have no accessible name.
- Tabs, root choices, menu items, piano keys, and timeline interactions use
  anchors or divs without complete keyboard semantics.
- Dialogs lack `role="dialog"`, names, focus containment, initial focus, and
  focus restoration.
- There is no skip link or consistent visible focus treatment.
- Playing/selected state relies heavily on violet color and animation.
- Pulse animation does not respect reduced-motion preferences.
- Keyboard shortcuts can fire while focus is inside form fields.
- The dynamically constructed audio overlay has no dialog semantics and forces
  users through a blocking screen before they can inspect the editor.

### Cognitive load and domain mismatch

The central surface is a dense grid of similarly weighted cards. Musical time
is not visible: chord cards have no beat duration, bar, meter, or repeat model.
"Tempo" exists beside a global duration in seconds, so the UI exposes two
incompatible notions of time.

Important authoring controls are split between a palette, a custom builder,
three chord-editor tabs, hidden menus, and settings. The user cannot type a
lead-sheet line such as `| Dm7 G7 | Cmaj7 |` as the primary workflow. Harmonic
analysis is claimed in documentation but not presented as contextual,
confidence-bearing information in the editor.

AI-model-branded presets contain dozens of visually complex symbols but do not
form a trustworthy teaching corpus. They prioritize apparent sophistication
over audible progression craft, contextual explanation, and verified formulas.

## MTDT lessons adopted selectively

The neighboring `music_theory_data_tool` reinforces five design contracts:

1. Pitch spelling is identity: `{step, alter, octave}` is canonical, while
   pitch class, MIDI, and frequency are projections.
2. Literal chord content is separate from one or more contextual harmonic
   readings. Reanalysis must not change the chord itself.
3. A chord-chart event needs stable identity, source/canonical text, a semantic
   chord AST, score position, and duration.
4. Chord-scale, tension, reharmonization, and function results should be plural
   option/evidence sets, not unqualified aesthetic truth.
5. Voice leading has multiple useful cost axes; at minimum, the UI should expose
   total motion, maximum leap, common-tone retention, and register constraints.

MTDT code is not copied wholesale. Its chord-chart parser has source-proven
extended-chord drift, its so-called Hungarian solver enumerates permutations,
some skill validators only inspect self-reported fixture fields, and several
advertised surfaces remain aspirational. The rebuild borrows invariants and
recomputable tests, then implements a progression-focused browser grammar and
bounded optimizer.

## Rebuild invariants derived from evidence

The replacement must satisfy all of the following:

1. Modular source produces one self-contained, network-independent HTML release
   artifact. Single-file distribution is not single-file architecture.
2. One versioned progression schema uses stable IDs and models meter, beats,
   chord duration, literal symbols, annotations, and voicing mode.
3. Spelled pitch identity is distinct from pitch class and MIDI.
4. One chord parser and semantic chord AST feed display, editing, analysis,
   voicing, import, export, presets, and tests.
5. Unsupported symbols are preserved with diagnostics or represented as custom
   pitch sets; they never silently become C major.
6. Literal chord structure is separate from contextual analysis. Function is
   offered only with explicit key/progression evidence.
7. Manual voicings play and round-trip exactly. Automatic and frozen voicings
   are visibly different modes.
8. Voicing and voice leading are pure, deterministic, bounded, explainable, and
   tested against hard musical invariants.
9. One persistent `AudioContext` and fixed master graph serve the session.
10. One cancellable transport maps beats to `AudioContext.currentTime`; BPM,
    playhead, pause, resume, seek, highlight, and scheduling share that timeline.
11. Every timer, scheduled event, and voice belongs to a generation/registry so
    stop guarantees no later attack from stale work.
12. State mutations are commands with undo/redo, safe import, and local recovery.
13. Core editing is keyboard accessible, mobile operable without gestures,
    screen-reader named, focus managed, zoomable, and reduced-motion aware.
14. Presets are curated progression lessons with verified formulas and honest
    explanations rather than model-brand showcases.
15. Completion requires unit, metamorphic, golden, transport, browser, offline,
    accessibility, responsive, migration, and stress evidence.
