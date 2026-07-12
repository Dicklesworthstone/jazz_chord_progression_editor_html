# Rebuild Plan: Changes — Jazz Progression Studio

Status: reviewed implementation contract (five review rounds complete)

Plan owner: this repository

Primary release artifact: `jazz_chord_progression_editor.html`
Source evidence: `docs/LEGACY_AUDIT.md`

## 1. Executive decision

Rebuild the application as a modular, typed, client-only music application and
compile it into one self-contained HTML release artifact.

The product will be called **Changes** in the interface, with the descriptive
subtitle **Jazz Progression Studio**. The existing repository and artifact name
remain unchanged so bookmarks, downloads, and deployment paths stay familiar.

The rebuild is not an attempt to reproduce the old UI with newer tooling. It
changes the center of gravity from “a catalog of impressive-looking chord
cards” to four connected musical jobs:

1. Write a progression as quickly as a musician would write a lead sheet.
2. Hear it with dependable timing and controllable, transparent voicing.
3. Understand the literal chord content and plausible contextual readings.
4. Compare, revise, save, and export ideas without losing work.

The result must keep the original project's best distribution promise: a user
can download one file and open it directly. Unlike the legacy artifact, the file
must actually work with the network blocked.

## 2. Why a rebuild is required

The evidence is recorded in `docs/LEGACY_AUDIT.md`. The load-bearing findings
are:

- whole-progression playback is silent because both live voicing branches
  receive an undefined variable;
- BPM and seeking are wired to a transport path that live playback does not use;
- six duplicated object methods make source order decide runtime behavior;
- unowned delayed callbacks can attack, reconnect, or dispose nodes after Stop;
- section completion replaces the chosen instrument with a generic synth and
  bypasses the effects/limiter graph;
- the editor classifies `maj7` as minor and drops the seventh from `9`, `11`,
  and `13` chords;
- advertised qualities silently fall back to a major triad;
- advanced voicing references state that does not exist;
- manual notes are silently revoiced during progression playback;
- the data model has no schema version, stable IDs, beat duration, undo, or
  transactional import;
- the single-file artifact requires ten remote CDN resources;
- touch listeners accumulate and suppress ordinary controls;
- core controls are not keyboard or screen-reader complete;
- 26 of 80 embedded preset chords fail even conservative checks against their
  own declared symbols.

The correct seams already exist conceptually—document, chord theory, voicing,
transport, audio, state, UI, persistence—but are interleaved in one mutable
object. The plan makes those seams explicit and testable.

## 3. Product promise

### 3.1 One-sentence promise

Changes lets a musician type, arrange, hear, inspect, and refine a jazz chord
progression in seconds, with reliable playback and theory explanations that say
what is known, what is contextual, and what is merely one musical option.

### 3.2 Primary users

#### Composer or improviser

Wants to capture changes quickly, loop them, try substitutions, compare
voicings, and export the result without setting up a DAW.

#### Student

Wants to see spelled chord tones, guide tones, plausible Roman numerals,
available tensions, and voice-leading motion while hearing the result.

#### Teacher

Wants a clean, projection-friendly chart, curated examples, annotations, and a
way to demonstrate why two voicings connect differently.

#### Arranger or producer

Wants exact manual voicings, beats and bars, transposition, MIDI export, and a
portable JSON document that does not lose spelling or timing.

### 3.3 Core jobs to be done

- Start from a blank chart, a pasted lead-sheet line, or a curated lesson.
- Add a chord exactly where the playhead or insertion cursor is.
- Type common jazz symbols without navigating a form for every alteration.
- See immediately whether a symbol parsed and how it was interpreted.
- Assign a chord one, two, three, four, or more beats.
- Rearrange chords and sections without losing selection, focus, or playback
  identity.
- Hear an individual chord without changing the document.
- Hear a section or the whole chart with consistent timing.
- Loop a difficult cadence or selected range.
- Pause, resume, seek, change BPM, and stop without stuck or late notes.
- Choose a voicing family and see the actual notes that will sound.
- Freeze an automatic voicing or edit exact pitches manually.
- Understand literal chord structure without needing to declare a key.
- Add a key to see evidence-bearing contextual interpretations.
- Compare a small menu of legal substitutions or next chords without the app
  pretending one is “best.”
- Undo any edit and recover recent work after a reload.
- Export a portable JSON chart and a playable MIDI file.
- Open the release artifact with no network connection.

## 4. Product principles

### 4.1 The chart is primary

The progression, its musical time, and the current insertion point dominate the
workspace. A palette and inspector support the chart; they do not compete with
it for attention.

### 4.2 Type first, click second

The fastest path is symbol text:

```text
| Dm9  G13(b9) | Cmaj9  A7alt |
| Dm9  G7sus   | C6/9         |
```

Structured controls remain available for discovery, accessibility, and precise
editing. They are synchronized views of one chord AST.

### 4.3 Musical time is beats, not seconds

Every chord event has a beat duration. Meter and BPM determine clock time. The
chart, scrubber, audio scheduler, playhead, MIDI export, and progress display
all derive from the same beat timeline.

### 4.4 Spelling is identity

G-sharp and A-flat may project to the same pitch class and MIDI number, but they
are not interchangeable in symbols, explanations, or notation. Pitch class and
MIDI are derived playback values.

### 4.5 Literal facts and contextual readings are separate

“C7 contains C, E, G, B-flat” is a literal derivation. “C7 is V/IV in C major”
is a contextual interpretation that requires key and progression evidence. The
second must never rewrite the first.

### 4.6 Suggestions are plural and explainable

Chord-scale choices, substitutions, and possible next chords are option menus.
Each option states why it is legal, its audible cost or color, and what it would
replace. The application may provide a deterministic default voicing for
playback, but it must label that as a selected style policy rather than theory
truth.

### 4.7 Manual means exact

An exact manual voicing is user-authored musical data. Playback, import/export,
undo, duplication, and MIDI export must preserve it without optimization.

### 4.8 One action, one result

Preview never edits. Selection never plays by itself. Drag never deletes. Stop
never rebuilds an instrument. Import never applies before validation and
confirmation.

### 4.9 Recovery is ordinary

Undo/redo, autosave status, safe import, and reload recovery are primary UI
states, not emergency afterthoughts.

### 4.10 Honest names

Synthesized instruments are named by their actual character—FM Electric Piano,
Mellow Keys, Warm Pad, Vibraphone, Analog Poly—not by an acoustic instrument the
engine does not emulate. Presets describe harmonic devices, not alleged copies
of named artists or AI-model sophistication.

## 5. Scope

### 5.1 Required for the rebuilt release

- Modular TypeScript source and Preact component UI.
- One generated, offline, self-contained HTML artifact.
- Strict chord-symbol parser with actionable diagnostics.
- Spelling-preserving pitch and semantic chord types.
- Lead-sheet text entry plus structured chord editing.
- Section, bar, beat, and chord-event model with stable IDs.
- Curated chord palette and progression lessons.
- Deterministic automatic voicing families.
- Exact manual and frozen voicing modes.
- Progression-level voice-leading optimization and explanations.
- Single native Web Audio engine and cancellable beat transport.
- Play, pause, resume, stop, restart, seek, section play, loop, and BPM.
- Honest synthesized instruments, master volume, and reverb.
- Contextual harmony lens with evidence and uncertainty.
- Contextual Continuation Engine with explainable next-chord options.
- Validated Harmonic Atlas with 250+ reviewed seeds and 3,000+ compiled variants.
- Goal-directed harmonic routes and constraint-based harmonization.
- Proof-carrying reharmonization branches and A/B audition.
- Multi-hypothesis tonal journeys, cadence/phrase analysis, and guide-tone paths.
- Contextual color/upper-structure, harmonic-rhythm, tension-curve, sequence,
  fingerprint, and nonfunctional/common-tone tools.
- Deterministic chart-derived practice exercises.
- Transposition with spelling preservation.
- Undo/redo and best-effort local recovery.
- Versioned JSON import/export and legacy migration.
- Standard MIDI file export.
- Keyboard-first and touch-complete editing.
- WCAG 2.2 AA semantics, contrast, focus, input, and motion behavior.
- Unit, property, metamorphic, golden, fake-clock, browser, accessibility,
  responsive, offline, migration, and stress tests.
- Updated README, architecture documentation, and built-in help.

### 5.2 Deliberate non-goals for this rebuild

- Backend, user accounts, cloud sync, or collaborative editing.
- Telemetry, ad tracking, or analytics.
- Generative AI chord selection.
- Automatic claims that a progression is “good,” “authentic,” or in the style
  of a named musician.
- Audio recording, microphone analysis, or waveform editing.
- Full score engraving or MusicXML authoring.
- MIDI input and performance capture.
- A generalized plugin ecosystem.
- A DAW-style multitrack mixer.
- Arbitrary tempo curves.
- Unbounded chord-notation grammar that silently guesses unsupported syntax.
- Multi-megabyte sample libraries without a later license, size, decode, and
  startup review.

These are non-goals to protect the progression editor's reliability, not a
license to omit the required theory, audio, UX, or verification depth.

### 5.3 Dependency-gated delivery milestones

All five milestones belong to the requested final release. They are gates, not
scope reductions:

1. **Foundation** — pinned offline build, domain schema, exact time, chord
   parser/resolver, theory authority ledger, and legacy fixtures.
2. **Reliable studio** — chart editing, commands/history, exact manual/frozen
   voicings, bounded local voicing, deterministic transport/audio, and JSON
   persistence.
3. **Musical intelligence** — contextual readings, scales/tensions, tonal
   journeys, phrase/cadence analysis, Continuation Engine, Atlas/fingerprints,
   spelling-preserving transposition, transition assignment, and factual lint
   after the literal theory corpus is independently green.
4. **Advanced craft** — route/constraint search, proof-carrying reharmonization,
   progression/guide-tone optimization, color/upper-structure, harmonic-rhythm,
   tension/sequence/nonfunctional tools, workbenches, MIDI, and practice/lessons.
5. **Release proof** — supported-browser, file/HTTP offline, accessibility,
   migration, stress, performance, listening, documentation, and reproducible
   artifact gates.

UI/audio integration cannot start until fake-clock stop-safety tests pass.
Suggestion providers cannot start until the literal chord corpus, mutation
checks, and spelling laws pass. A milestone may expose internal fixtures to the
next lane, but it is not called complete until every named gate is authoritative.

## 6. Experience architecture

### 6.1 Visual concept

The interface should feel like a late-night lead sheet laid over a restrained
studio console:

- ink-black and blue-black surfaces rather than generic gray panels;
- warm paper-white notation text;
- brass/gold accents for musical structure and current beat;
- coral for destructive/error states;
- cool cyan for analysis and informational overlays;
- subtle measure lines and staff-inspired spacing;
- one display face for chord symbols and a highly legible system face for UI;
- depth through borders, texture, and light rather than large drop shadows;
- motion limited to transport, insertion, and state transition feedback.

No visual state may rely on color alone. Selected, playing, error, manual,
frozen, and loop states receive text or iconography in addition to color.

### 6.2 Desktop shell

```text
┌────────────────────────────────────────────────────────────────────┐
│ Changes   chart title      key/mode   Undo Redo  Import Export Help│
├───────────────┬────────────────────────────────┬───────────────────┤
│ Library       │ Lead-sheet chart               │ Harmony Lens      │
│ - quick entry │ sections / measures / chords   │ symbol + tones    │
│ - palette     │ insertion cursor + playhead    │ voicing + motion  │
│ - lessons     │                                │ context + options │
├───────────────┴────────────────────────────────┴───────────────────┤
│ Transport  previous  play/pause  stop  loop  scrub  BPM instrument│
└────────────────────────────────────────────────────────────────────┘
```

The center chart receives the largest width. Both rails can collapse. The last
chosen layout is a local preference, not document data.

### 6.3 Mobile shell

- One full-width chart column.
- Compact header with document menu and undo/redo.
- Persistent bottom transport with play/pause, stop, current chord, and loop.
- Library opens as a named drawer.
- Harmony Lens opens as a bottom sheet with a visible close action.
- Reorder uses a visible handle plus Move Previous/Move Next actions.
- All primary authoring works without swipe or drag.
- The on-screen keyboard does not cover the active chord input or transport.
- Safe-area insets are honored without JavaScript layout guesses.

### 6.4 First-run state

Do not block the application with an audio-enable overlay. On first launch, show
the complete workspace and offer a non-destructive starter lesson that can be
opened or dismissed. The New command always creates a genuinely blank document.
The first Play or Preview action is
the user gesture that creates/resumes audio. If the browser refuses audio, keep
the chart fully usable and show an inline, actionable status near transport.

First-run guidance consists of three dismissible cues:

1. Type changes in the quick-entry field.
2. Select a chord to inspect or change its voicing.
3. Press Play to initialize audio and hear the chart.

### 6.5 Quick-entry workflow

The quick-entry field accepts:

- a single chord symbol;
- whitespace-separated chord symbols;
- bar-delimited lead-sheet text;
- an optional duration suffix such as `:2` for two beats;
- newline-separated sections with an explicit section marker.

Example:

```text
[A]
| Dm9:2 G13(b9):2 | Cmaj9:4 |
[B]
| Em7b5:2 A7alt:2 | Dm9:4   |
```

Before insertion, the UI shows a compact parsed preview. Invalid tokens are
underlined individually and keep their source text. Valid tokens can be inserted
without retyping the whole line. Importing quick-entry text is an undoable
command.

### 6.6 Chart editing workflow

- Clicking a chord selects it and opens its inspector.
- Double-click or Enter focuses symbol editing.
- A visible plus target before, after, and between measures controls insertion.
- Duplicate, split duration, join duration, move, and delete are available in a
  semantic menu and keyboard shortcuts.
- Delete is undoable and announces a temporary Undo action.
- Section boundaries can preserve voice leading or explicitly reset it.
- Each chord shows symbol, beat duration, optional Roman label, voicing mode,
  and annotation indicator.
- The chart can toggle between compact lead-sheet and expanded teaching views.

### 6.7 Chord inspector workflow

The inspector uses progressive disclosure:

1. **Symbol** — source text, canonical display, parse status.
2. **Structure** — spelled degrees, pitch classes, bass, omissions.
3. **Timing** — beat duration and measure placement.
4. **Voicing** — mode, family, density/range, exact pitches, freeze/edit.
5. **Harmony** — descriptive class, contextual readings, scales/tensions.
6. **Motion** — common tones and voice paths from previous/to next chord.
7. **Notes** — annotation.

Changing structured controls updates the symbol preview, but a change is not
committed until it yields a valid semantic chord. Unsupported source text is
never overwritten by a guessed canonical symbol.

### 6.8 Transport workflow

- Play from the current insertion/playhead point.
- Shift+Space plays the selected section.
- Space toggles play/pause only when focus is not inside an editing control.
- Stop returns to the playback start point.
- A separate Restart action returns to chart start; repeated Stop is not a
  hidden second command.
- Previous/Next moves to chord boundaries.
- The scrubber exposes beat/bar and supports keyboard arrows.
- A loop can be the selected chord, selected range, section, or full chart.
- BPM may be typed or adjusted in bounded steps.
- Instrument changes affect newly scheduled notes and never recreate transport.
- Audio status distinguishes locked, ready, playing, paused, interrupted, and
  unavailable.

### 6.9 Harmony Lens workflow

Without a key, show literal facts:

- chord quality and defining degrees;
- spelled tones and pitch classes;
- guide tones;
- alterations, additions, and omissions;
- interval/tension names;
- the selected voicing's actual pitches.

With a key and neighbors, add plural contextual readings:

- Roman numeral and scale degree;
- diatonic, mixture, secondary-dominant, tritone-substitution, passing, or
  unresolved/ambiguous classification;
- evidence used;
- evidence tier or exact-match status;
- alternative reading when applicable;
- resolution tendencies phrased as tendencies, not obligations.

Scale and substitution panels enumerate options and their tradeoffs. They do
not auto-edit the chart. Applying an option is an explicit, undoable command.

### 6.10 Selection, insertion, range, and playhead

The application keeps four related concepts separate:

- **selection** — the event(s) the next edit targets;
- **insertion point** — a boundary before/after an event or measure where new
  material is added;
- **range** — an ordered beat interval used for loop, bulk edit, or transpose;
- **playhead** — transport position derived from playback state.

Click/tap selects one event. Shift+click and Shift+arrow extend an ordered range.
On touch, an explicit Select Range action exposes two draggable/keyboard-capable
boundary handles, tap-based Set Start/Set End actions, numeric beat fields, and
Done/Cancel actions. Selection never moves the playhead;
preview never changes selection; playback can start from playhead, selected
range start, section start, or chart start through an explicit command.

Insertion and quick-entry preview must state one of:

- fits the current measure;
- creates one or more complete measures;
- leaves an intentionally incomplete measure that requires confirmation/reason;
- overfills and must be split/rebalanced;
- cannot be inserted atomically.

No implicit beat loss or silent measure rebalance is allowed.

### 6.11 Document lifecycle states

The UI distinguishes:

- pristine new document;
- dirty document since last explicit JSON export;
- recovery copy current/stale/unavailable;
- validated import pending confirmation;
- recovered document pending Keep/Discard decision;
- explicit export completed/failed.

New, lesson load, and import replacement show the current dirty/recovery state
and preserve a recoverable undo boundary when feasible. Import is replace-only
for the first release; section merge is deliberately deferred because collision,
meter, key, and history semantics would otherwise be underspecified.

Required non-happy-path views include blank chart, no search results, token parse
errors, storage unavailable/quota exceeded, corrupted recovery copy, audio fault,
browser interruption, empty inspector, and mobile sheet/dialog nesting.

### 6.12 Harmonic discovery workflows

- The insertion target exposes **Continue…**. A keyboard/touch-complete rail
  groups plural next-chord cards by intent, with Preview, Insert, Why, source
  context, exact timing, and stale-state handling.
- **Atlas** replaces the small preset modal with faceted offline search, mini
  timelines, listening/derivation notes, related fingerprints, Preview, Open,
  Insert in Range, and Practice actions.
- **Connect To…** opens the bounded Route Planner for a selected gap/range.
  Constraints are explicit chips/fields; route cards show per-edge derivations
  and exact conflicts when no path exists.
- **Harmonize Constraints…** reveals optional melody, bass, and guide-tone lanes.
  Pins are keyboard-editable, visibly hard/preferred, and never relaxed without
  confirmation.
- **Reharmonize…** opens an ephemeral branch comparison. Original and variants
  share synchronized A/B transport; cancel is nonmutating and Apply commits one
  revision-checked patch.
- The Harmony Lens gains Journey, Guide Tones, Color, Rhythm/Tension,
  Similarity, and Transform tabs. Progressive disclosure keeps literal facts
  first and makes every contextual/transformational assumption visible.
- **Practice this chart** creates a local deterministic exercise session. It
  never edits the chart unless the user explicitly applies a completed answer as
  a new branch/document.

## 7. Accessibility and UX acceptance criteria

### 7.1 Visibility of system status

- Transport state and audio availability are always visible.
- Recovery status distinguishes Recovery current, Changes pending recovery,
  Storage unavailable, and Export recommended.
- Import shows validation progress, a summary, warnings, and whether it will
  replace the current document. Merge is not a release feature.
- Parsing shows token-level success/error before insertion.
- Long analysis or voicing recalculation has a non-blocking busy state.

### 7.2 User control and recovery

- Every retained document mutation is undoable and redoable; the explicit
  oversized-replacement exception in Section 14.3 must be disclosed before the
  replacement commits.
- Dialogs have Close and Cancel where applicable.
- Escape closes the topmost dismissible surface.
- Focus returns to the invoking element.
- Destructive replacement requires a clear summary and confirmation.
- Import failures leave the authoritative document, history, selection,
  transport, and recovery state byte-for-byte unchanged; only the isolated
  import draft/error UI may change.
- Audio failure never blocks editing or saving.

### 7.3 Error prevention and messages

- Invalid symbols are not committed as a different chord.
- Contradictory structured fields are disabled or explained.
- Slash bass spelling mismatches receive a specific suggestion.
- Empty sections and charts remain valid and usable.
- File size, nesting, schema, and data errors name the offending path.
- Error messages state what happened, what was preserved, and the next safe
  action.

### 7.4 Keyboard

- All actions are reachable without a pointer.
- Tab order follows header, library, chart, inspector, transport.
- Repeated chord grids use roving focus or a documented list pattern.
- Arrow keys move within a grid without creating a trap.
- Enter edits/activates; Escape cancels/closes; Delete invokes an undoable
  delete.
- Drag alternatives are complete.
- Shortcuts are inactive in text fields except field-local conventions.
- A searchable shortcut reference is available from Help.

### 7.5 Screen reader

- One `h1`, logical section headings, landmarks, and a skip link.
- Every icon button has a visible or accessible name.
- Current chord, playback state, parse errors, save state, and applied edits use
  restrained live regions.
- Dialog and sheet semantics include label, description, modal state, initial
  focus, and focus restoration.
- Chord symbol pronunciation has an accessible text alternative where glyphs
  alone would be ambiguous.
- Piano keys expose note, octave, selected state, and action.

### 7.6 Perceivable and motion-safe

- Normal text reaches WCAG 2.2 AA 4.5:1 contrast; large text and controls reach
  3:1.
- Focus indicators reach 3:1 against adjacent surfaces.
- Browser zoom remains enabled.
- Layout works at 200% zoom and 320 CSS-pixel width.
- State never relies only on hue.
- `prefers-reduced-motion` removes pulses, large transforms, and smooth scroll.
- No flashing content.
- Pointer targets meet WCAG 2.2 target-size requirements or an applicable
  spacing exception.
- Forced-colors mode retains selection, playhead, error, focus, and dialog
  visibility.
- Automated accessibility output records rule IDs and every permitted exception
  with rationale; zero unreviewed serious/critical violations is required.
- Manual evidence covers keyboard scripts, focus order/restoration, a
  screen-reader matrix, 320 px layouts, 200% zoom, reduced motion, and
  forced-colors mode.

## 8. Target technical architecture

```text
src/
  index.html
  main.tsx
  styles/
    tokens.css
    reset.css
    app.css
    responsive.css
  domain/
    ids.ts
    pitch.ts
    duration.ts
    key.ts
    instrument-id.ts
    chord.ts
    document.ts
    validated-document.ts
    decode.ts
    validation.ts
  theory/
    symbol-grammar.ts
    symbol-parser.ts
    symbol-format.ts
    chord-resolver.ts
    spelling.ts
    analysis.ts
    phrase-analysis.ts
    tonal-journey.ts
    chord-scales.ts
    color-options.ts
    suggestion-laws.ts
    continuation-engine.ts
    transform-laws.ts
    reharmonization.ts
    route-planner.ts
    constraint-harmonizer.ts
    guide-tone-lines.ts
    cadences.ts
    harmonic-rhythm.ts
    tension-curve.ts
    fingerprints.ts
    atlas-query.ts
    sequences.ts
    nonfunctional.ts
    practice-engine.ts
    voicing-candidates.ts
    voice-assignment.ts
    voice-leading.ts
    progression-voicing.ts
  playback/
    playback-plan.ts
    compile-plan.ts
  audio/
    audio-engine.ts
    master-graph.ts
    instruments.ts
    synth-voice.ts
    active-voice-registry.ts
    scheduler.ts
    transport.ts
  application/
    app-state.ts
    actions.ts
    reducer.ts
    history.ts
    selectors.ts
    document-validation.ts
    services.ts
  persistence/
    persistence.ts
    recovery.ts
  compatibility/
    legacy-types.ts
    legacy-import.ts
    migration-report.ts
  export/
    json.ts
    text.ts
    midi.ts
  content/
    atlas-schema.ts
    atlas-index.ts
    atlas-compiled.ts
    atlas-adapter.ts
    lessons.ts
    practice-records.ts
    default-document.ts
  ui/
    App.tsx
    shell/
    chart/
    library/
    discovery/
    routes/
    reharmonization/
    constraints/
    practice/
    inspector/
    transport/
    dialogs/
    help/
    primitives/
  test-support/
    builders.ts
    fake-clock.ts
    fake-audio.ts
    theory-corpus.ts
tests/
  unit/
  conformance/
  property/
  golden/
  integration/
  e2e/
  visual/
scripts/
  compile-atlas.ts
  validate-theory-ledger.ts
  verify-traceability.ts
  verify-discovery-traceability.ts
  verify-standalone.ts
  inspect-artifact.ts
docs/
  LEGACY_AUDIT.md
  THEORY_IDEA_WIZARD.md
  REBUILD_PLAN.md
  ARCHITECTURE.md
```

### 8.1 Architectural dependency direction

```text
domain
  ↑
theory          compatibility
  ↑                  ↑
playback-plan   persistence / export
       ↑            ↑
       application commands/services
                    ↑
                    ui

audio <- immutable playback plan + serialized transport commands
```

- `domain` imports no UI, audio, storage, or Preact code.
- `theory` imports only domain types and pure helpers.
- Harmonic discovery modules remain pure theory services over explicit requests;
  they share bounded-search utilities but cannot import UI, audio, persistence,
  or mutable application state.
- Source atlas/quarantine data is build input. `compile-atlas.ts` invokes domain
  and theory validation to produce immutable, typed `atlas-compiled` records;
  `content/atlas-adapter` implements a read-only `AtlasQuery` interface and is
  injected into theory requests by application services. Theory never imports
  content. `theory/practice-engine` contains algorithms; content contains only
  compiled practice records/prompts.
- `audio` consumes immutable playback plans; it does not inspect UI state or
  progression drafts.
- `playback` owns exact, pure beat/tick plans shared by audio and MIDI export.
- `application` owns commands/history, invokes services/adapters, and derives
  plans/selectors.
- `domain/validated-document` declares an opaque brand type but exports no public
  constructor. `application/document-validation` is the sole audited brand-cast
  site after combined structural+semantic validation; a static boundary test
  rejects any other cast/construction. Pure theory consumes explicit domain
  request values, while playback/persistence/export require the brand.
- `ui` invokes application actions and renders selectors; it does not call audio
  or persistence adapters and does not mutate domain objects.
- `compatibility` produces decoded document candidates and migration reports;
  the application publication gate performs final semantic validation.
- `export` consumes validated documents/plans and has no UI dependency.

### 8.2 Runtime dependencies

Use Preact as the only required production package. Its role is limited to
component rendering, hooks, and context. Do not add Redux, a router, a CSS
runtime, an icon package, a modal framework, or a drag framework unless a
measured implementation gap survives review.

Use inline SVG icons with accessible names. Use native Pointer Events and
semantic controls. Use Web Audio directly so lifecycle and scheduling
invariants remain visible and testable.

### 8.3 Build and distribution

Use Bun for package management, tests, and browser bundling. Current Bun
documentation explicitly supports TypeScript/JSX browser targets and standalone
HTML builds that inline JavaScript, CSS, and images.

Pin Bun through `packageManager`, pin Preact/TypeScript/test dependencies in the
manifest and committed lockfile, and document the supported modern-browser
syntax baseline. Required development packages are TypeScript, Playwright, and
the chosen Playwright accessibility adapter; visual comparison uses Playwright
screenshots without a second UI test framework unless a measured need appears.

Required commands:

```text
bun install --frozen-lockfile
bun run typecheck   # tsc --noEmit
bun run lint        # source invariants, duplicate members, dependency boundaries
bun test
bun run test:e2e
bun run build
bun run verify:standalone
bun run verify      # aggregate all required gates and clean-tree check in CI
```

`bun run build` compiles `src/index.html` with `--compile --target=browser` and
produces:

- `dist/index.html` for inspection;
- the canonical `jazz_chord_progression_editor.html` release artifact;
- an optional development source map outside the standalone artifact;
- an asset/license inventory and size report.

The initial uncompressed standalone artifact budget is 1.5 MiB, including the
compiled Harmonic Atlas but excluding any later separately approved sample
library. Atlas templates/variants use compact structured data and lazy indexes,
not duplicated prose or note arrays. A budget change requires measured value,
startup/decode evidence, and license provenance.

The generated release must contain no external script/style/media/font URL and
no dynamic import, worker, fetch, or module request. Verification inspects
URL-bearing HTML attributes/import sites and intercepts runtime requests rather
than rejecting harmless documentation/license strings. E2E opens the artifact
through both `file://` and HTTP while all nonlocal network requests are denied.

CI rebuilds the canonical artifact and fails on a diff, runs the no-network
smoke tests, records artifact size/license inventory, and tests the supported
Chromium/Firefox/WebKit browser matrix.

The source template—not the generated artifact—is the implementation source of
truth. `AGENTS.md` will state that the artifact must be regenerated, never
hand-edited.

## 9. Canonical domain model

The code-facing F1 decisions, validation-stage ownership, diagnostic ordering,
and independently authored fixture rules are frozen in
[`F1_DOMAIN_CONTRACT.md`](F1_DOMAIN_CONTRACT.md).

### 9.1 IDs

Every document, section, measure, and chord event receives a stable opaque ID.
IDs are generated at mutation time and preserved through reorder, export/import,
playback, selection, focus, and history. Duplication/lesson instantiation are
explicit copy operations that allocate a new ID for the copied root and every
descendant through one reference-remapping table; originals retain their IDs.

Uniqueness of document, section, measure, and event IDs and integrity of every
stored reference are hard decode/command invariants, not lint-only advice. A v2
import with any duplicate ID is rejected transactionally at both duplicate
paths. Duplication commands allocate every descendant ID before commit and fail
atomically if the injected factory collides.

Tests use deterministic ID factories. Production may use `crypto.randomUUID()`
or an RFC-4122-style `crypto.getRandomValues()` fallback; it refuses when
cryptographic entropy is unavailable and never uses `Math.random()`. Persisted
IDs are globally unique across node kinds, case-sensitive, at most 128 ASCII
characters, and match `[A-Za-z0-9][A-Za-z0-9._:-]*`. Copy allocation is
structural preorder (document, sections, measures, events). Any injected
collision fails the entire preallocated remap without retry or partial commit.

### 9.2 Spelled pitch types

```ts
type Step = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

type SpelledPitchClass = {
  step: Step;
  alter: -2 | -1 | 0 | 1 | 2;
};

type SpelledPitch = SpelledPitchClass & {
  octave: number;
};

type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
type MidiPitch = number;
```

`PitchClass` and `MidiPitch` are projections. Equality of spelled values compares
step and alteration, not only projection. Triple accidentals are rejected with
a typed diagnostic in the first release.

Scientific pitch notation is fixed: middle C is `C4` and A4 is MIDI 69. The
projection is:

```text
midi = 12 * (octave + 1) + naturalPitchClass(step) + alter
```

Accidentals may cross the written octave boundary, so `B#3` and `C4` both project
to MIDI 60 while `Cb4` projects to 59. Projection outside 0...127 is a typed
refusal. Audio uses twelve-tone equal temperament with
`frequency = 440 * 2^((midi - 69) / 12)`. Goldens cover boundary spellings and
legacy octave-bearing note names.

### 9.3 Degree types

```ts
type DegreeNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9 | 11 | 13;

type ChordDegree<N extends DegreeNumber = DegreeNumber> = {
  number: N;
  alter: -2 | -1 | 0 | 1 | 2;
};
```

A degree retains diatonic number and chromatic alteration. `#9` is not stored as
the same thing as `b3`, even though the first release's playback projection may
sound the same pitch class.

### 9.4 Chord AST

```ts
type TriadQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'sus2'
  | 'sus4'
  | 'power';

type SeventhQuality = 'major' | 'minor' | 'diminished';

type ChordSpec = {
  kind: 'parsed';
  sourceText: string;
  root: SpelledPitchClass;
  triad: TriadQuality;
  sixth: ChordDegree<6> | null;
  seventh: SeventhQuality | null;
  extensions: ChordDegree[];
  additions: ChordDegree[];
  alterations: ChordDegree[];
  omissions: DegreeNumber[];
  bass: SpelledPitchClass | null;
  colorPolicy: 'none' | 'altered-dominant';
};

type CustomChordSpec = {
  kind: 'custom';
  sourceText: string;
  label: string;
  pitchNames: SpelledPitchClass[];
  bass: SpelledPitchClass | null;
};
```

`CustomChordSpec` is a first-class escape hatch, not an error bucket. It keeps
experimental/legacy sonorities playable and editable without claiming a formula
the parser cannot prove.

For a parsed chord, `sourceText` is never allowed to disagree with the semantic
AST. Import may preserve a supported alias while it still reparses to the same
AST. The first structured edit rewrites `sourceText` through the canonical
formatter. Only `CustomChordSpec` may preserve arbitrary display text. In
particular, a root edit cannot relabel an old note list and a modifier edit
cannot change text without changing resolved degrees.

The sixth is a degree rather than a major/minor flag. Standard `C6` and `Cm6`
both contain an unaltered major sixth above the root; an altered sixth is stored
explicitly and formatted without confusing it with a diminished seventh.

### 9.5 Voicing state

```ts
type AutoVoicing = {
  mode: 'auto';
  family: 'balanced' | 'shell' | 'rootless-a' | 'rootless-b' |
          'open' | 'drop2' | 'quartal';
  voiceCount: 3 | 4 | 5 | 6 | 7;
  range: { lowMidi: number; highMidi: number };
  bassPolicy: 'generated' | 'external' | 'none';
};

type ManualVoicing = {
  mode: 'manual';
  pitches: SpelledPitch[];
  bassPolicy: 'included' | 'external';
};

type FrozenVoicing = {
  mode: 'frozen';
  pitches: SpelledPitch[];
  bassPolicy: 'included' | 'external';
  generatedBy: {
    engineVersion: string;
    family: AutoVoicing['family'];
  };
};
```

Manual and frozen pitches round-trip exactly. Automatic mode stores constraints,
not a stale derived note list. Freeze copies the current derived voicing into
document data through an undoable command.

Manual and Frozen arrays are nonempty and preserve order, spelling, octave, and
duplicates exactly. For a slash chord, `included` requires at least one exact
slash spelling among all pitches tied at the minimum projected MIDI; enharmonic
co-minima may coexist. `external` delegates the slash bass and excludes it from
stored and sounded pitches by sounding pitch class, including enharmonic spellings. A
non-slash Manual/Frozen voicing cannot be `external`.
Returning from Frozen to Auto requires a complete new Auto configuration; the
application never guesses discarded range/count/bass settings.

`voiceCount` is the total number of pitches generated by the application. An
`external` bass is excluded from that count and is not sounded/exported on the
voicing track; the UI and export report name the assumed bass. A slash bass must
either use `generated` and sound as the lowest pitch or use `external` and be
visibly delegated. `none` is invalid for a slash chord. Rootless families require
`external`; all other family/policy combinations are validated explicitly.

### 9.6 Musical timeline

Use normalized rational beat values represented as bounded integer
numerator/denominator, not floating-point equality. Arithmetic uses integer
cross-products with overflow checks and reduces by greatest common divisor.
Floating-point seconds appear only at the final Web Audio boundary:

```ts
type BeatValue = {
  numerator: number;
  denominator: number;
};

type BeatDuration = BeatValue;
type BeatPosition = BeatValue;

type BeatRange = {
  start: BeatPosition;
  end: BeatPosition;
};

type Meter = {
  beatsPerBar: number;
  beatUnit: 2 | 4 | 8;
};

type ChordEvent = {
  id: string;
  chord: ChordSpec | CustomChordSpec;
  duration: BeatDuration;
  annotation: string;
  voicing: AutoVoicing | ManualVoicing | FrozenVoicing;
};

type Measure = {
  id: string;
  events: ChordEvent[];
  completion:
    | { kind: 'empty' }
    | { kind: 'complete' }
    | {
        kind: 'pickup' | 'incomplete';
        expectedDuration: BeatDuration;
        reason: string;
      };
};

type Section = {
  id: string;
  name: string;
  annotation: string;
  keyOverride: KeyContext | null;
  voiceLeadingBoundary: 'continue' | 'reset';
  measures: Measure[];
};
```

One beat unit in storage is one quarter note regardless of time signature;
measure capacity is `beatsPerBar * 4 / beatUnit`. `tempoBpm` is quarter-notes per
minute. The UI may additionally label compound-meter pulses, but it may not
reinterpret stored durations. Numerators are nonnegative safe integers,
durations are strictly positive, positions start at zero, and normalized values
must fit the decoder's bounded total timeline.

The normalized denominator must be a positive divisor of MIDI PPQ 960. Inputs
normalize with `BigInt` before this check, so `7/7` is accepted as `1/1` and the
safe raw value `4294967294/2` is accepted at the normalized numerator ceiling.
This set
is closed under reduced addition/subtraction because the least common multiple
of two divisors of 960 is also a divisor of 960. Arithmetic uses `BigInt`
intermediates, then refuses a numerator above 2,147,483,647 or a total timeline
above 1,000,000 quarter-note beats. A nonempty `BeatRange` requires
`0 <= start < end`. Exact conversions are:

```text
seconds = quarterNoteBeats * 60 / tempoBpm
midiTicks = quarterNoteBeats * 960
measureCapacity = beatsPerBar * 4 / beatUnit
```

`tempoBpm` is an integer from 20 through 400. Audio uses the exact quotient;
MIDI rounds microseconds-per-quarter to the nearest integer and records the
resulting sub-microsecond quantization in its export report.

The validator permits `empty` only when there are no events and ensures measure
duration matches meter when `kind` is `complete`. Pickup/incomplete status is
explicit document data whose positive expected duration equals the event sum,
is below ordinary capacity, and has a nonempty reason. F1 does not restrict a
pickup to a position or require a complementary final bar. Editing
helpers split and rebalance measures predictably; they never silently discard
beats or silently toggle completion status.

The document validator enforces `CustomChordSpec` has nonempty `pitchNames` and a
nonempty Manual or Frozen voicing. Automatic voicing is invalid for a custom
chord because arbitrary pitch sets have no semantic degree roles. Custom
resolution exposes pitch names/classes and an empty degree/guide-tone set with a
`custom.no_degree_analysis` limitation; it never invents a formula.

### 9.7 Progression document v2

```ts
type ProgressionDocumentV2 = {
  schema: 'changes.progression.v2';
  id: string;
  title: string;
  description: string;
  meter: Meter;
  tempoBpm: number;
  key: KeyContext | null;
  sections: Section[];
  playback: {
    instrumentId: InstrumentId;
    masterVolume: number;
    reverbAmount: number;
    countInBars: 0 | 1 | 2;
  };
};
```

`InstrumentId` is a persisted domain identifier, initially
`'mellow-keys' | 'fm-electric-piano' | 'vibraphone' | 'warm-pad' |
'analog-poly'`. Audio owns the recipe implementation for each ID; the decoder
owns validation of the persisted value. `KeyContext` in Section 11.2 is likewise
a domain type even though harmony services are its primary consumer.

UI layout, open panels, current selection, dialog state, and undo history are not
document data. Best-effort recovery stores an application envelope containing
the document, a revision, and compatible local preferences.

### 9.8 Validation result

All decoders are total over `unknown` input and return:

```ts
type DecodeResult<T> =
  | { ok: true; value: T; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[] };

type ValidationIssue = {
  code: string;
  path: Array<string | number>;
  message: string;
  suggestion?: string;
  sourceText?: string;
};
```

Validation is deliberately two-stage to preserve dependency direction:

1. `decodeDocumentShape(unknown)` in `domain` validates schema, primitive/range
   types, collection limits, IDs/references, structural AST shape, and voicing
   compatibility without importing the parser/resolver.
2. `validateDocumentSemantics(shape)` in the application validation service
   imports `domain` plus `theory` and verifies `sourceText`/AST agreement,
   formula/refusal rules, spelling, custom/voicing invariants, measure arithmetic,
   and playback realizability.

Only the combined pipeline performs the one statically allow-listed cast to the
opaque domain `ValidatedDocument` brand; no public constructor exists.
Application commands, persistence publication, playback compilation, and export
require that brand. Pure theory services accept explicit domain inputs and remain
independent of the publication module. F2 owns structural decoding and F3 (after
T1) owns semantic validation.

Decoders have the following first-release limits, checked before allocating
proportionally to untrusted input:

| Limit | Value |
|---|---:|
| UTF-8 import bytes | 2 MiB |
| JSON nesting depth | 32 |
| Sections | 64 |
| Measures per section | 1,024 |
| Chord events per document | 8,192 |
| Nodes in one copy source/destination | 73,793 each; count source once, emit its plan once, and index destination once before ID allocation |
| Copy auxiliary planning/index entries | 295,172 maximum, plus the bounded returned copy graph |
| Notes in a custom/manual/frozen voicing | 16 |
| Symbol/annotation/title string | 256 / 2,000 / 256 code points |
| Tempo | integer 20-400 quarter-notes/minute |
| Beats per bar / beat unit | 1-32 / 2, 4, or 8 |
| Beat numerator / denominator | 0-2,147,483,647 / positive divisor of 960 |
| Total document time | 1,000,000 quarter-note beats |
| MIDI pitch | 0-127 |

Text limits count Unicode scalar values, reject lone UTF-16 surrogates, and use
ECMAScript `String.prototype.trim()` only to decide required-field blankness.
Thus U+FEFF is blank and U+0085 is not; accepted stored strings are never
trimmed or normalized.

Imports exceeding a limit fail with a stable issue code and leave current state
unchanged. Decoders validate into a temporary value and never partially mutate
application state.

## 10. Chord symbol grammar and resolution

### 10.1 Grammar contract

The parser supports a declared jazz lead-sheet grammar. It does not claim to
understand every historical or publisher-specific notation. Supported aliases
canonicalize to one semantic AST while preserving `sourceText` for display and
round-trip diagnostics.

The grammar is built from these ordered regions:

```text
symbol          := root body slash-bass?
root            := letter accidental?
body            := power-body | quality-head? family-tail
power-body      := '5'
quality-head    := major | minor | diminished | augmented | half-diminished
family-tail     := sixth-family | extension-family? suspension? modifier*
sixth-family    := '6' ('/' '9')?
extension-family := major-marker? ('7' | '9' | '11' | '13')
suspension      := 'sus' | 'sus2' | 'sus4'
modifier        := parenthesized-list | inline-alteration | addition |
                   omission | seventh-modifier | alt
seventh-modifier := 'maj7' | 'M7' | 'Δ7'
addition        := 'add' ('2' | '3' | '4' | '6' | '9' | '11' | '13')
omission        := ('no' | 'omit') ('3' | '5')
slash-bass      := '/' root
```

The lexer uses longest-token precedence for `6/9`, `maj13`...`maj7`, `mMaj7`,
`m7b5`, `sus4`, `add...`, and `omit...` before single-number tokens. A suspension
after an extension rewrites the triad before semantic resolution, so `C9sus4`,
`C13sus4`, and `C7b9sus4` are generable. A parenthesized seventh modifier permits
`Caug(maj7)`; an explicit `add3` permits `Csus4(add3)`; `C5` maps only to the
power triad. The parser/formatter table contains an AST row for every combined
form, rather than relying on substring order.

Supported accidental input:

- ASCII: `b`, `bb`, `#`, `##`;
- Unicode: `♭`, `𝄫`, `♯`, `𝄪`;
- normalized output uses the user's ASCII/Unicode display preference while the
  AST stores a numeric alteration.

Supported quality aliases:

| Meaning | Accepted examples | Canonical text |
|---|---|---|
| Major triad | `C`, `Cmaj` | `C` |
| Minor triad | `Cm`, `Cmin`, `C-` | `Cm` |
| Diminished | `Cdim`, `Co`, `C°` | `Cdim` |
| Half diminished | `Cm7b5`, `Cø`, `Cø7` | `Cm7b5` |
| Augmented | `Caug`, `C+` | `Caug` |
| Suspended fourth | `Csus`, `Csus4` | `Csus4` |
| Suspended second | `Csus2` | `Csus2` |
| Power chord | `C5` | `C5` |
| Major seventh family | `Cmaj7`, `CM7`, `CΔ7` | `Cmaj7` |
| Minor-major seventh | `CmMaj7`, `Cm(maj7)`, `CmΔ7` | `Cm(maj7)` |
| Altered dominant | `C7alt`, `Calt` | `C7alt` |

Supported extensions and colors:

- 6, 7, 9, 11, 13;
- major 7/9/11/13 families;
- minor 6/7/9/11/13 families;
- 6/9 and minor 6/9;
- b5, #5, b9, #9, #11, b13;
- add2/add9, add3, add4/add11, add6/add13;
- no3 and no5;
- combinations in parentheses separated by commas or spaces;
- slash bass;
- dominant suspended 7/9/13 forms.

The first release deliberately does not treat `/` as both a 6/9 separator and a
slash bass without grammar context. `C6/9` is a known quality token; `C6/E` is a
slash chord. Ambiguous input receives a diagnostic instead of a guess.

### 10.2 Parser result

```ts
type ParseResult =
  | {
      ok: true;
      chord: ChordSpec;
      canonicalText: string;
      warnings: ParseDiagnostic[];
    }
  | {
      ok: false;
      sourceText: string;
      diagnostics: ParseDiagnostic[];
      didYouMean: string[];
    };
```

Diagnostics include source ranges so the UI can underline one token or modifier.
Codes are stable enough for tests and import reports, for example:

- `symbol.root_missing`
- `symbol.accidental_out_of_range`
- `symbol.quality_unknown`
- `symbol.extension_conflict`
- `symbol.modifier_duplicate`
- `symbol.modifier_conflict`
- `symbol.bass_invalid`
- `symbol.trailing_input`
- `symbol.ambiguous_slash`

`SymbolParser` parses exactly one chord symbol and rejects trailing chart text.
`ChartTextParser` is a separate adapter for fast lead-sheet entry. It tokenizes
section headers, barlines, repeat markers, explicit beat durations, annotations,
and chord-symbol spans, then delegates each symbol span to `SymbolParser`. It
never repairs a failed symbol by stripping characters or defaulting to a triad.
Its result is a draft plus source-ranged diagnostics; the user previews the
result and explicitly applies it as one undoable command. The first release uses
one round-trippable grammar for quick entry and text export:

```text
chart        := header* section+
header       := '@title' json-string |
                '@description' json-string |
                '@meter' integer '/' ('2' | '4' | '8') |
                '@tempo' integer |
                '@key' root mode
section      := '[' escaped-section-name ']' json-string? measure+
measure      := '|' slot* '|'
slot         := event | repeat
event        := chord-symbol duration? json-string?
repeat       := '/' duration?
duration     := ':' positive-integer ('/' positive-divisor-of-960)?
comment      := ';' text-to-end-of-line
```

JSON strings use ordinary JSON escaping for document, section, and chord
annotations. Section-name `\]` and `\\` escapes are the only bracket-name escapes.
Comments are ignored and not round-tripped. The canonical exporter emits every
event duration explicitly, canonical chord symbols, and JSON-escaped annotations:

```text
@title "Late Set"
@meter 4/4
@tempo 120
@key C major
[A] "opening"
| Cmaj7:2 "hold" Dm7:2 | G7:4 |
[B]
| Fmaj7:1 /:1 /:1 Fm6:1 | C/G:4 |
```

For input convenience, an entirely undurated bar divides its exact measure
capacity equally among its slots. A partially explicit bar reserves explicit
durations and divides the remainder equally among undurated slots. The result
must reduce to an allowed denominator dividing 960; otherwise the parser asks
for explicit durations. Negative remainder is overfill. An unbarred sequence is
treated as one virtual bar at the active meter. A repeat copies only the previous
literal chord AST, never its annotation/ID, and receives its own allocated or
explicit duration. An empty `| |` creates an empty measure. Missing prior repeat,
unclosed annotation, invalid header, under/overfill, and nonrepresentable division
are source-ranged diagnostics.

Unsupported repeat endings, nested forms, rhythmic notation, or prose remain
diagnostics rather than guesses. This separation prevents the bare `C9`/`C13`
token drift found in the mined MTDT chart parser from entering the canonical
symbol parser.

Apply Entire Draft is enabled only when chart structure and every included token
are valid. With errors, each valid token exposes an explicit Insert This Chord
action that inserts only that event at the current insertion point and ignores
the token's source bar/section layout; its button states this loss of context.
There is no ambiguous partial-chart commit and no silent omission of failed
tokens.

### 10.3 Formula resolution

`resolveChord(spec)` returns one or more exact semantic realizations before
pitches. Multiple realizations are required for family symbols such as `7alt`;
the literal resolver never smuggles in an audition preference:

```ts
type SemanticRealization = {
  kind: 'semantic';
  id: string;
  degrees: ChordDegree[];
  requiredDegrees: ChordDegree[];
  optionalDegrees: ChordDegree[];
  guideToneDegrees: ChordDegree[];
  spelledPitchNames: SpelledPitchClass[];
  pitchClasses: PitchClass[];
};

type CustomRealization = {
  kind: 'custom';
  id: 'custom';
  degrees: null;
  requiredDegrees: null;
  optionalDegrees: null;
  guideToneDegrees: null;
  spelledPitchNames: SpelledPitchClass[];
  pitchClasses: PitchClass[];
  limitations: ['custom.no_degree_analysis', 'custom.no_auto_voicing'];
};

type ResolvedChord = {
  source: ChordSpec | CustomChordSpec;
  realizations: Array<SemanticRealization | CustomRealization>;
  bass: SpelledPitchClass | null;
  warnings: TheoryIssue[];
};
```

For ordinary parsed symbols `realizations` has one member. `7alt` has the
versioned legal sets `b9+b5`, `b9+#5`, `#9+b5`, and `#9+#5` over fixed
`1, 3, b7`; it does not include natural 5 or 9. A voicing/audition policy may
choose one realization deterministically and must show that choice. Manual or
frozen pitches remain exact. `CustomChordSpec` produces the one custom
realization above and is already constrained to Manual/Frozen mode.

The exhaustive construction table is normative. “Required” means required by
the default Balanced automatic realization; family-specific templates in
Section 12 may override only as explicitly declared.

| Syntax family | Exact semantic construction | Default role notes |
|---|---|---|
| Major/minor/dim/aug/sus2/sus4/power | `1 3 5`; `1 b3 5`; `1 b3 b5`; `1 3 #5`; `1 2 5`; `1 4 5`; `1 5` | identity tones; 3/b3 or suspension is a guide, fifth is optional except power/dim/aug identity |
| `6`, `m6` | triad + natural `6` | 6 is characteristic/required; no seventh |
| `6/9`, `m6/9` | triad + natural `6` + added `9` | 6 required, 9 optional; no seventh/intermediate closure |
| dominant `7/9/11/13` | triad + `b7`; then `9`; then `9,11`; then `9,11,13` | 3 and b7 guides; highest named color required, intermediate 9/11 optional |
| major `maj7/9/11/13` | major triad + `7`; then `9`; then `9,11`; then `9,11,13` | 3 and 7 guides; highest named color required |
| minor `m7/9/11/13` | minor triad + `b7`; then `9`; then `9,11`; then `9,11,13` | b3 and b7 guides; highest named color required |
| minor-major | minor triad + `7`, with named extension closure | b3 and 7 guides |
| half diminished | `1,b3,b5,b7`, plus named 9/11/13 closure only when grammar declares it | b3,b5,b7 identity; unsupported families refuse |
| diminished seventh | `1,b3,b5,bb7` | all four are identity tones; bb7 never normalized to degree 6 |
| augmented-major seventh | `1,3,#5,7` plus explicit named colors | #5 and 7 remain distinct identity/color facts |

Modifier order is deterministic:

1. build the base quality and extension family from the table;
2. apply suspension by removing degree 3 and adding 2 or 4;
3. apply structural alterations (`b5/#5`) by removing natural 5 and adding the
   altered degree; paired `b5+#5` is a conflict in this release;
4. apply color alterations (`b9/#9/#11/b13`): remove the natural degree of the
   same number if extension closure supplied it, then add every explicitly
   requested altered color; paired `b9+#9` is legal and both remain;
5. apply `addN` without implying any intermediate degree and without replacing a
   differently altered degree; `add3` may coexist with a suspension;
6. apply `no3/no5`, warning only when the degree number was absent;
7. canonicalize exact duplicate degrees and reject contradictory duplicates;
8. keep slash bass separate from membership and inversion analysis.

Thus `C9` contains `1,3,5,b7,9`; `C11` additionally contains 11; `C13`
additionally contains 11 and 13; `C6/9` contains `1,3,5,6,9` without b7;
`C7(b9,#9)` contains both altered ninths and no natural 9; and `Csus4(add3)`
contains both 4 and 3. Formula, role, and refusal rows are machine-readable,
versioned, independently golden-tested, and mutation-tested.

### 10.4 Spelling algorithm

To spell a degree from a root:

1. advance the root letter by the degree's diatonic distance;
2. calculate the target pitch class from semitone formula;
3. compare it to the natural pitch class of the target letter;
4. choose the required alteration in the supported -2...2 range;
5. return a typed refusal if the result requires an unsupported accidental.

Examples:

| Symbol/degree | Required spelling | Rejected shortcut |
|---|---|---|
| Db7 / b7 | Cb | B |
| F#maj7 / 7 | E# | F |
| C7 / #9 | D# | Eb |
| C7 / b3 | Eb | D# |
| Gbmaj7 / 3 | Bb | A# |
| Abdim7 / diminished 7 | Fb | E |

The UI may show an enharmonic playback label as secondary information, but the
primary chord explanation uses degree-correct spelling.

### 10.5 Round-trip and metamorphic laws

- `parse(format(parse(x)))` yields a semantically equal AST.
- Canonical formatting is idempotent.
- Formatting never invents a modifier absent from the AST.
- Transposing by a fully specified `SpelledInterval` (diatonic steps plus
  semitones) and then its exact inverse restores spelling and structure.
- Pitch-class projection commutes with transposition modulo 12.
- Enharmonic source aliases may project equally but remain distinct AST values.
- Resolving then formatting does not duplicate 9/11/13 tokens.
- Unknown source text is preserved in `CustomChordSpec` or a parse failure; it
  never becomes a major triad through defaulting.

### 10.6 Required theory corpus

The golden corpus includes all twelve roots where relevant and at least:

```text
C, Cm, Cdim, Caug, Csus2, Csus4, C5
C6, Cm6, C6/9, Cm6/9
Cmaj7, C7, Cm7, Cm(maj7), Cm7b5, Cdim7, Caug(maj7)
Cmaj9, C9, Cm9, C11, Cm11, C13, Cmaj13, Cm13
C7b5, C7#5, C7b9, C7#9, C7#11, C7b13
C7(b9,#9), C7(#9,#11), C13(b9,#11), C7alt
C9sus4, C13sus4, C7b9sus4
Cmaj7(#11)/G, Db7/Cb, F#m7b5/C
Cadd9, Cm(add9), C7(no5), Csus4(add3)
```

The corpus also contains malformed, conflicting, Unicode, whitespace, extreme
length, and legacy symbols. Expected values are recomputed from semantic degrees
rather than copied from the fixture's self-reported note list.

### 10.7 Theory authority and independence

Every golden example cites an authority class in a machine-readable ledger:

- `definition` — derivable from the declared grammar/formula table;
- `published-reference` — independently checked against a named jazz-theory or
  notation reference, with edition/page in the ledger;
- `expert-reviewed` — judgment-bearing spelling or usage reviewed and dated by
  a qualified musician;
- `compatibility` — legacy input behavior intentionally accepted without being
  called theoretically normative.

Fixture generation code may not import production resolvers. Independent
expected degree/spelling data is reviewed as data. Mutation tests deliberately
flip interval, implication, accidental, and omission rules and require the
corpus to fail. A release cannot claim theoretical coverage merely because a
validator agrees with values generated by the same implementation.

## 11. Harmony and progression intelligence

### 11.1 Boundary between facts, analysis, and suggestions

The engine exposes three distinct result classes:

```ts
type LiteralFact = { kind: 'literal'; evidence: DegreeEvidence };
type EvidenceStrength = 'exact' | 'strong' | 'plausible' | 'speculative';
type ContextReading = {
  kind: 'reading';
  strength: EvidenceStrength;
  evidence: Evidence[];
  missingEvidence: string[];
};
type OptionCandidate = { kind: 'option'; laws: string[]; costs: CostVector };
```

Literal facts are deterministic consequences of the symbol. Context readings
depend on key and neighbors. Options are legal transformations the user may
choose. The UI labels all three differently. Evidence tiers have explicit rule
definitions and are not presented as probabilities. Numeric confidence is
forbidden until it is calibrated against a labeled, versioned evaluation set.

### 11.2 Key context

```ts
type KeyMode =
  | 'major'
  | 'natural-minor'
  | 'harmonic-minor'
  | 'melodic-minor';

type KeyContext = {
  tonic: SpelledPitchClass;
  mode: KeyMode;
};
```

Sections may override document key. An absent key is valid. Analysis must never
infer and silently persist a key.

### 11.3 Roman numeral readings

`analyzeChordInContext()` returns zero or more readings. Each reading contains:

- Roman label;
- key used;
- chord-tone match score;
- root scale degree and accidental;
- quality match;
- relation to previous and next chords;
- classification such as diatonic, mixture, secondary dominant, tritone
  substitute, leading-tone diminished, passing diminished, or unresolved;
- evidence tier, matched rules, counterevidence, and missing evidence;
- optional governing target chord ID.

The first pass supports:

- exact diatonic seventh-chord matching in declared major/minor modes;
- chromatic Roman roots;
- secondary dominants when a dominant-quality chord targets a following root by
  descending fifth and that target is not the active key's tonic; tonic-target
  V is classified as ordinary dominant function;
- secondary leading-tone diminished chords when evidence is exact;
- tritone-substitution candidates with shared dominant guide-tone pitch classes;
- parallel major/minor modal mixture;
- backdoor dominant candidates resolving from bVII7 to I;
- an explicit ambiguous/unclassified outcome.

The system does not treat a common-practice grammar as universal jazz syntax.
Planing, modal harmony, nonfunctional sequences, and unresolved colors are
legitimate descriptive outcomes.

The versioned analysis table supplies positive and near-miss rows, including:

| Active key and motion | Reading | Reason |
|---|---|---|
| C major: `G7 -> C` | `V -> I`, not secondary | target is tonic |
| C major: `D7 -> G` | `V/V -> V` | exact dominant target on scale degree 5 |
| C major: `A7 -> Dm` | `V/ii -> ii` | exact non-tonic diatonic target |
| C major: `C7 -> F` | `V/IV -> IV` | exact non-tonic target |
| C major: `Db7 -> C` | tritone/backdoor-adjacent candidate, not secondary dominant | root motion and guide-tone evidence differ |
| C major: `D7 -> F` | unresolved/unclassified dominant | no declared target relation |

Literal chord-match scoring is mechanical and visible: root, third/suspension,
and seventh each have weight 2; fifth and each color have weight 1; an expected
alteration matched only enharmonically does not count as spelled agreement.
`matchedWeight / expectedWeight` is evidence data, not probability. `exact`
requires a complete literal match and every rule precondition with no
counterevidence; `strong` permits alternate context but has exact target motion;
`plausible` is compatible with missing key/neighbor evidence; `speculative`
requires an explicit caveat and never drives an automatic edit.

### 11.4 Chord scales and tensions

Chord-scale results are plural compatible options. Each option contains:

- scale name;
- spelled degrees over the chord root;
- which chord tones it contains;
- available tensions;
- minor-ninth clashes against chord tones;
- declared jazz exceptions such as suspended-dominant fourth treatment;
- contextual notes and evidence strength.

The engine does not say “the scale” unless context makes one mapping exact.
Initial families include major/Ionian, Lydian, Mixolydian, Lydian dominant,
altered, whole-tone, half-whole and whole-half diminished, Dorian, melodic minor,
Locrian, and Locrian natural 2. The initial versioned mapping table is:

| Chord/context predicate | Candidate scale(s) | Required containment and treatment |
|---|---|---|
| major triad/6 or tonic `maj7` | major/Ionian | 1,3,5 and declared 6/7; 11 is reported as a minor-ninth clash over 3 |
| non-tonic `maj7` with exact #4 context or explicit #11 | Lydian | 1,3,5,7,#11 |
| unaltered dominant 7/9/13 | Mixolydian | 1,3,5,b7 plus named colors; natural 11 clash reported over 3 |
| dominant `7#11` | Lydian dominant | 1,3,5,b7,#11 |
| `7alt` realization | altered | 1,3,b7 plus selected b9/#9 and b5/#5 realization |
| augmented dominant or explicit #5 with no conflicting colors | whole-tone | 1,3,#5,b7 and available 9/#11 |
| dominant b9/#9 with diminished evidence | half-whole diminished | 1,3,5,b7 and selected altered ninths; 13 availability stated per table |
| fully diminished seventh | whole-half diminished | 1,b3,b5,bb7; spelling remains degree-based |
| minor 6/7/9/11 in Dorian-compatible context | Dorian | 1,b3,5,6,b7,9,11 as declared |
| minor-major or tonic melodic-minor context | melodic minor | 1,b3,5,6,7 plus named colors |
| half diminished | Locrian; Locrian natural 2 when context supports natural 9 | 1,b3,b5,b7 plus b9 or 9 distinction |
| suspended dominant | Mixolydian/specified modal candidate | 1,4,5,b7; fourth is a chord tone, not an avoid-note claim |

Every row has required/forbidden-degree predicates, available-tension and
minor-ninth-clash data, positive and near-miss fixtures, citation/review tier,
and explicit evidence-tier derivation. An implementation cannot add a mapping by
adding only a test that repeats its own output.

### 11.5 Suggestion providers

Suggestion providers consume the current document context and return an ordered
but not auto-applied menu. Initial providers:

- diatonic next chords in key;
- secondary dominant targeting the next/selected chord;
- tritone substitute for a dominant;
- backdoor approach to tonic;
- modal-interchange alternatives;
- passing diminished link when bass motion is stepwise;
- tonicization or turnaround continuations;
- voice-leading alternatives for the same literal chord.

Every suggestion carries:

```ts
type SuggestedEventDraft = {
  chord: ChordSpec;
  duration: BeatDuration;
  voicing: AutoVoicing;
  annotation: string;
};

type SuggestionEditPlan =
  | {
      operation: 'replace';
      replacesEventIds: string[];
      expectedRemovedDuration: BeatDuration;
      events: SuggestedEventDraft[];
      insertedDuration: BeatDuration;
    }
  | {
      operation: 'insert';
      anchor: InsertionPoint;
      events: SuggestedEventDraft[];
      insertedDuration: BeatDuration;
      rebalancing: 'none' | 'requires-user-confirmation';
    };

type Suggestion = {
  id: string;
  label: string;
  baseRevision: number;
  edit: SuggestionEditPlan;
  derivedFrom: string;
  laws: SuggestionLaw[];
  voiceLeadingCost: VoiceLeadingCost;
  colorTags: string[];
  warnings: string[];
};
```

`SuggestionLaw` is a stable rule ID plus human explanation and machine-checkable
preconditions/postconditions. `derivedFrom` identifies provider and version,
not an opaque prose claim. A suggestion whose law cannot be revalidated against
the current document is stale and cannot be applied.

A replacement must preserve exact removed duration unless its edit plan is
presented through the ordinary split/rebalance confirmation workflow. An insert
with nonzero duration must fit empty capacity or carry
`requires-user-confirmation`; it cannot invent time. Next-chord, passing-chord,
turnaround, and multi-event suggestions therefore use the same measure-fill and
revision checks as direct editing.

Tritone substitution validation recomputes that roots are a tritone apart and
that the dominant guide-tone pitch-class pair is shared. Spelling remains exact:
the seventh of Db7 is Cb. Backdoor validation checks bVII root relative to tonic
and semitone resolution tendencies. Passing diminished validation checks the
declared bass link.

### 11.6 Transposition

Users can transpose a chord, selected range, section, or document by a spelled
interval or target key:

```ts
type SpelledInterval = {
  diatonicSteps: number;
  semitones: number;
  direction: 'up' | 'down';
};
```

“Major second up” and “minor third down” therefore carry both letter motion and
chromatic distance. A semitone-only quick action asks for or derives a target
spelling preference and records that choice in the undo description.

The command:

- changes root and slash bass spelling through diatonic-aware interval logic;
- preserves chord quality, additions, alterations, omissions, source semantics,
  duration, annotation, and IDs;
- transposes exact manual/frozen pitches when requested;
- can instead keep manual voicings and warn that they no longer match;
- updates section/document key when scope includes it;
- recalculates contextual readings rather than rewriting them as document data;
- produces a reversible command description such as `Transpose Section B up a
  major second`.

Round-trip transposition is a metamorphic release gate.

### 11.7 Progression lint

Lint is factual and nonjudgmental. It reports:

- invalid or unsupported symbols;
- measure underfill/overfill;
- unsupported slash-bass spelling, and realized generated bass outside the
  requested MIDI range;
- manual notes that do not match a chord, as an informational discrepancy;
- voicing range or low-register crowding as versioned voicing-policy advisories;
- contextual analysis conflicts;
- unresolved import warnings.

Duplicate IDs and broken stored references cannot reach lint: they are hard
decoder/command validation errors from Section 9.1.

It does not report parallel fifths, unusual resolution, non-diatonic harmony, or
dissonance as universally wrong.

### 11.8 Analysis and suggestion verification

The harmony suite includes table tests for every rule precondition, adversarial
near misses, transpositions through all roots, and law revalidation after edits.
At least one independent fixture per rule is hand-authored rather than produced
by the implementation. Mutation tests must catch inverted target motion,
enharmonic guide-tone shortcuts, absent keys, stale event IDs, and suggestions
applied after their context changed. Judgment-bearing wording receives musician
review and is framed as an option or reading, never a universal verdict.

### 11.9 Harmonic Discovery System expansion

The focused Idea Wizard in `THEORY_IDEA_WIZARD.md` expands the engine into
fifteen connected deterministic capabilities. They share this proof envelope:

```ts
type Evidence =
  | { kind: 'rule'; id: string; strength: EvidenceStrength; statement: string;
      sourceRef?: string }
  | { kind: 'corpus'; id: string; reviewTier: string; statement: string }
  | { kind: 'context'; id: string; eventIds: string[];
      strength: EvidenceStrength; statement: string }
  | { kind: 'counterevidence'; id: string; strength: EvidenceStrength;
      statement: string };

type CostAxis = {
  family: 'voice-leading' | 'harmony' | 'target-fit' | 'corpus' | 'complexity';
  id: string;
  value: number;
  unit: 'semitones' | 'count' | 'weighted-count' | 'ratio' | 'rank';
  direction: 'minimize' | 'maximize' | 'target';
  target?: number;
};

type CostVector = { axes: CostAxis[] };

type ConstraintConflict = {
  constraintIds: string[];
  explanation: string;
  minimality: 'proven-minimal' | 'bounded-small';
  explicitRelaxations: string[];
};

type SearchIdentity = {
  requestId: string;
  documentId: string;
  sourceRevision: number;
  engineVersion: string;
  corpusVersion: string;
};

type SearchStats = {
  workQuanta: number;
  expandedStates: number;
  generatedCandidates: number;
  retainedCandidates: number;
  peakTrackedBytes: number;
};

type SearchTermination =
  | 'complete' | 'candidate-cap' | 'state-cap' | 'depth-cap'
  | 'work-quanta-cap' | 'memory-cap'
  | 'cancelled' | 'stale';

type HarmonicProof = {
  identity: SearchIdentity;
  ruleIds: string[];
  corpusRecordIds: string[];
  inputEventIds: string[];
  assumptions: string[];
  evidence: Evidence[];
  counterevidence: Evidence[];
  missingEvidence: string[];
  costs: CostVector;
  limitsReached: string[];
};

type HarmonicSearchResult<T> =
  | { kind: 'results'; identity: SearchIdentity; stats: SearchStats;
      termination: 'complete';
      options: Array<{ id: string; value: T; proof: HarmonicProof }> }
  | { kind: 'no-result'; identity: SearchIdentity; stats: SearchStats;
      termination: 'complete'; conflicts: ConstraintConflict[];
      evidence: Evidence[] }
  | { kind: 'degraded'; options: Array<{ id: string; value: T; proof: HarmonicProof }>;
      identity: SearchIdentity; stats: SearchStats;
      termination: Exclude<SearchTermination, 'complete' | 'cancelled' | 'stale'> }
  | { kind: 'cancelled'; identity: SearchIdentity;
      stats: SearchStats; termination: 'cancelled' }
  | { kind: 'stale'; identity: SearchIdentity;
      stats: SearchStats; termination: 'stale' };
```

The same inputs, versions, visible policy, and seed produce byte-identical IDs,
values, and ordering. Results revalidate before Apply. Hard constraints never
weaken silently. Every search has candidate/state/depth/work-quanta/memory caps and
a typed no-result/degraded outcome. Cost axes cannot be compared or summed until
a visible policy supplies compatible units/normalization; a voice-leading
semitone is not silently treated as a corpus rank.

Search is a pure resumable stepper whose state advances in a fixed number of
expansions per work quantum. An abortable application runner schedules quanta
cooperatively (using a local `MessageChannel`/task yield), publishes a nonblocking
busy state, rejects stale revisions, and supports Cancel. Wall-clock time is a
performance measurement and release gate, never a semantic termination input;
hardware load therefore cannot alter candidates or ordering. Deterministic caps
alone produce `degraded`, while user cancellation produces no partial option set.

#### 11.9.1 Contextual Continuation Engine

At an insertion point, providers inspect the prior one to four events, plural
context readings, metric/phrase position, root/bass motion, guide tones,
repetition, cadence setup, and color trend. Providers cover diatonic motion,
dominant resolution, secondary dominants, ii-V expansion, tritone/backdoor,
modal interchange, passing/common-tone diminished, sequences, dominant chains,
chromatic approaches, pedal/line-cliche, and nonfunctional/modal continuation.

Cards group results as Resolve, Continue Pattern, Increase Color, Stay Modal,
Approach Target, or Explore. Smooth, Functional, Colorful, and Exploratory are
visible versioned cost profiles, not correctness claims. Providers emit at most
32 candidates each; canonical deduplication/Pareto pruning leaves at most 16.
The complete search has a 100 ms performance gate for an eight-event context;
the gate cannot truncate results. Each card includes exact timed drafts,
Why/Why Not evidence, Preview, and revision-checked Insert.

#### 11.9.2 Validated Progression Atlas and Preset Compiler

At least 250 independently reviewed source templates cover major/minor cadences,
turnarounds/dominant cycles, blues/backdoor devices, modal vamps, planing,
passing/common-tone diminished uses, chromatic/plagal/deceptive approaches,
rhythm-changes-derived skeletons without artist imitation, symmetric cycles,
chromatic mediants, line cliches, pedals, slash-bass motion, and reharmonization
before/after pairs.

Templates store relative or exact relationships, ASTs, meter/durations,
key/mode, phrase/cadence roles, transformations, skeleton, listening notes, and
provenance/review tier. The compiler expands at least 3,000 declared variants,
then parse/format checks, measure-validates, law-validates,
transpose/inverse-transposes, fingerprints, and deduplicates them. Users filter
by goal, function, length, key, meter, device, complexity, bass contour,
tonal/modal character, or fingerprint; records Preview, open, insert, or launch
a practice exercise.

Ownership is staged: G1 proves schema/compiler/index/fingerprint algorithms on a
small independently authored fixture corpus; G2 proves law-only Continuation
against an injected query fixture and does not require the full Atlas. D0 then
owns the 250 reviewed seeds, 3,000 variants, review signoffs, full golden manifest,
and optional corpus enrichment of Continuation. D0's P0 dependency proves every
variant has a MIDI-integral exact plan; D0 does not claim final SMF export, which
remains E1 in Advanced Craft.

#### 11.9.3 Goal-Directed Harmonic Route Planner

Connect To accepts source, destination chord/key/function/cadence, exact slots or
beats, allowed devices, chromaticism, bass direction, fixed notes/events,
tension contour, and required/forbidden material. Nodes preserve spelling and
plural context; edges are revalidated laws. Bounded multi-objective A*/DP returns
contrasting Direct, Functional, Chromatic, Modal, and Voice-Leading routes with
an edge-by-edge derivation.

Initial caps are eight generated events, 64 outgoing canonical edges per state,
50,000 explored states, and 64 MiB tracked transient memory. Complete search has
a 250 ms target and one-second release performance ceiling, but neither time
value truncates or changes semantic output. Endpoint, timing, and constraints
match exactly. No-route names a small conflict set and never relaxes it.

#### 11.9.4 Constraint Harmonization Workbench

Users pin melody/top notes, bass/contour, guide tones, fixed events, key/mode/
function, allowed colors, exact rhythm, range/leap, and destination/cadence. The
solver enumerates a finite chord universe per slot, filters hard constraints,
builds legal transitions, and uses exact DP or bounded beam search. Users may
lock part of a result and regenerate the rest.

Initial caps are 16 slots, 128 candidates per slot, and 100,000 transition
states. Complete search has a 500 ms release performance ceiling that cannot
truncate output. Every result satisfies every hard constraint;
small cases are compared exhaustively to brute force. No-result exposes a
minimal or bounded-small conflict set and only relaxes after confirmation.

#### 11.9.5 Proof-Carrying Reharmonization Branches

Every `TransformLaw` has stable ID/version, exact preconditions, a pure timed
patch, preserved/changed properties, machine-checkable postconditions,
limitations, and positive/negative/near-miss fixtures. Initial laws cover
secondary-dominant insertion, ii-V expansion, tritone/backdoor substitution,
modal interchange, dominant chains, passing/common-tone diminished insertion,
turnaround expand/contract, sequence transposition, pivot reinterpretation, and
clearly labeled nonfunctional moves.

An ephemeral branch tree supports A/B audition, diff, lineage, and cost
comparison without mutation. Depth is at most three, eight law applications per
node, and 128 canonical nodes. Every intermediate branch revalidates; stale
branches cannot Apply. One branch commits as one undoable patch.

#### 11.9.6 Multi-Hypothesis Tonal Journey Map

A bounded k-best sequence analysis tracks tonic/mode, tonicization,
modal/nonfunctional, no-key, and unclassified states. The five best
non-dominated paths show key-area spans, pivots, modulation boundaries,
phrase/cadence roles, alternate readings, evidence, and counterevidence. Users
may pin a reading or mark a deliberately nonfunctional range; inferred keys are
never silently persisted.

#### 11.9.7 Guide-Tone Line Designer

Enumerate noncrossing paths through thirds, sevenths, suspensions, and
characteristic alterations. Arcs retain spelled degree identity and label common,
oblique, contrary, entering, and leaving motion. Users pin pitch/degree, maximum
leap, direction, or destination and pass the chosen ephemeral targets into
voicing or the Constraint Workbench; only explicit Freeze/Apply persists them.

#### 11.9.8 Contextual Color and Upper-Structure Laboratory

Enumerate compatible tension sets, chord-scale candidates, altered-dominant
realizations, and upper-structure triads. Each row lists exact degrees,
replacements/omissions, melody clashes, guide-tone retention, assumed bass,
context predicates, symbol impact, and realizable voicings. Tables are versioned,
cited, and contain typed unavailable rows. Audition never changes literal theory;
Apply explicitly changes AST or exact voicing.

#### 11.9.9 Cadence, Phrase, and Approach Builder

Detect phrase/cadence evidence from meter, duration, repetition, target motion,
and context without treating every dominant as cadential. At an exact target and
duration, offer law-backed authentic major/minor, plagal/backdoor, deceptive,
ii-V, diminished, chromatic, and modal approaches. Positive and near-miss
fixtures cover every class and root.

#### 11.9.10 Harmonic-Rhythm Transformation Engine

Expand, contract, anticipate, delay, split, or consolidate a progression
skeleton using exact bar-preserving templates. Compare one-per-bar, two-per-bar,
turnaround acceleration, pedal holds, and cadence-weighted rhythm. Every transform
declares preserved chord identity, endpoints, total duration, metric accents,
and annotations and uses normal measure-fill confirmation.

#### 11.9.11 Harmonic Tension/Release Curve Designer

Expose separate formula-defined axes—contextual chromatic distance, altered
color density, unresolved tendencies, guide-tone motion, common-tone loss,
register crowding, and cadence evidence—rather than one correctness score. A
user contour ranks continuation/routes as a visible preference, never an
objective property. Every axis has unit, bounds, and counterexample fixtures.

#### 11.9.12 Progression Fingerprint and Similarity Explorer

Layer fingerprints for exact AST/spelling, root intervals, contextual function,
harmonic rhythm, bass contour, cadence structure, and transformation lineage.
Atlas search distinguishes Exact, Transposed, Functionally Similar, and
Surface-Different matches and shows matching layers. Deduplication collapses
aliases/declared derivations without erasing spelling or context distinctions.

#### 11.9.13 Motif and Sequence Transformation Engine

Repeat a selected harmonic cell through spelled interval, scale degree,
dominant-cycle, chromatic, or constant-structure motion. Users choose count,
direction, destination, and preserved literal/function shape. The engine emits
exact timed drafts and refuses or requests an explicit final adjustment if it
cannot land exactly.

#### 11.9.14 Nonfunctional/Common-Tone Transformation Atlas

Cover common-tone substitutions, pedals, constant-structure planing, chromatic
mediants, augmented/diminished cycles, and bounded Neo-Riemannian P/L/R moves for
supported triads. Each edge states only its mechanical pitch/common-tone
relation and caveat, never invented functional causality. These edges broaden
Continuation/Routes beyond dominant chains.

#### 11.9.15 Chart-to-Practice Laboratory

Generate seeded exercises from a chart or atlas: hide symbols, identify guide
tones, select law-valid continuations, compare reharmonizations, complete a
cadence under constraints, or reconstruct function/voicing paths. Each has a
finite answer set or declared rubric, hints, replayable seed, and post-submission
explanation. It stores no behavioral profile and never grades musical taste.

### 11.10 Development-time AI quarantine

AI may propose breadth during development but cannot certify theory:

1. candidates enter an unshipped quarantine directory with generator/prompt
   version, intended rule IDs, and `synthetic-unverified` provenance;
2. a total decoder rejects unknown, oversized, or invalid records;
3. gates parse/format, measure-validate, law-revalidate, transpose every declared
   key, inverse-transpose, realize voicings, compile playback/MIDI, fingerprint,
   and deduplicate;
4. a candidate cannot cite itself or production output as independent evidence;
5. judgment-bearing seeds require human review; derived variants inherit the
   reviewed seed and compiler version;
6. only deterministic compiled records and provenance/license inventory ship;
7. runtime contains no model client, prompt execution, remote endpoint, or branch
   that treats AI authorship as correctness.

## 12. Voicing and voice leading

### 12.1 Pure service contract

```ts
type VoicingRequest = {
  chord: ChordSpec;
  realization: SemanticRealization;
  bass: SpelledPitchClass | null;
  policy: AutoVoicing;
  previous?: RealizedVoicing;
  next?: SemanticRealization;
};

type VoiceAssignment = {
  voiceId: string;
  ordinal: number;
  pitch: SpelledPitch;
  degree: ChordDegree;
  provenance: 'chord-degree' | 'slash-bass' | 'doubling';
};

type RealizedVoicing = {
  pitches: SpelledPitch[];
  voices: VoiceAssignment[];
  family: AutoVoicing['family'];
  hardConstraints: ConstraintResult[];
  costs: VoiceLeadingCost;
  explanation: VoicingExplanation;
};
```

Local candidate generation and pair assignment are deterministic, synchronous,
bounded, and free of audio/UI state. Progression optimization uses the shared
pure resumable-stepper/application-runner contract from Section 11.9 so it yields
between fixed work quanta without making wall time semantic. For identical
inputs and engine version both paths return identical output.

### 12.2 Hard constraints

- All pitches project to playable MIDI values within the requested range.
- Voice count matches policy unless a typed unsatisfied result explains why.
- Required guide tones are present for qualities that define them.
- With `bassPolicy: generated`, an explicit slash bass is the lowest pitch. With
  `external`, it is named but excluded; `none` is invalid for a slash chord.
- Rootless policies omit root, require external bass, and clearly state it.
- Duplicate exact MIDI unisons are forbidden. Octave doubling of a pitch class is
  allowed only by a template that declares its degree/doubling rule.
- Manual voicing bypasses generation completely.
- Frozen voicing bypasses generation and retains its generation metadata.
- A chord with no legal candidate returns a constraint report; it never falls
  back to C major or arbitrary source notes.

### 12.3 Candidate generation

Candidate generation proceeds from spelled degrees, then register lifts:

1. choose required and optional degrees for the family;
2. enumerate legal octave placements within range;
3. normalize equivalent MIDI sets while preserving preferred spelling;
4. apply family-specific structural transformations;
5. reject hard-constraint violations;
6. retain a bounded candidate set by stable local score.

Families:

#### Balanced

Root/bass support plus guide tones and the most characteristic available color,
with low-register spacing protection.

#### Shell

Root, third/suspension, and seventh. A rootless shell variant is not mislabeled
as a root-containing shell.

#### Rootless A and B

Quality-specific guide-tone and color templates. The UI explains that a bass
player or separate bass layer is assumed.

#### Open

Tertian content distributed across a wider range while retaining chord identity.

#### Drop 2

Generate a closed four-or-more-note candidate, identify the second voice from
the top by pitch, lower it one octave, and revalidate range/order. This is a
real transform, not a label on a generic spread.

#### Quartal

Generate fourth-based upper structures from compatible chord-scale degrees or a
declared modal/suspended template. Reordering tertian chord tones is not enough.

The versioned template table is authoritative; a missing row is a typed
`voicing.family_unavailable`, not a generic fallback:

| Quality class | Shell | Rootless A low-to-high | Rootless B low-to-high | Quartal |
|---|---|---|---|---|
| major 7/9/13 | `1,3,7` | `3,7,9,5` | `7,9,3,13` | only with Lydian-compatible scale evidence |
| dominant 7/9/13 | `1,3,b7` | `3,b7,9,13` | `b7,9,3,13` | only suspended/modal-compatible row |
| minor 7/9/11 | `1,b3,b7` | `b3,b7,9,5` | `b7,9,b3,11` | Dorian-compatible evidence |
| minor-major | `1,b3,7` | `b3,7,9,5` | `7,9,b3,6` | unavailable initially |
| half diminished | `1,b3,b5,b7` | `b3,b5,b7,11` | `b7,11,b3,b5` | Locrian-compatible declared row only |
| diminished seventh | `1,b3,b5,bb7` | unavailable | unavailable | symmetric diminished row only |
| suspended dominant | `1,4,b7` | `4,b7,9,13` | `b7,9,4,13` | Mixolydian/specified modal row |
| triad, power, augmented without seventh | balanced/open/drop only | unavailable | unavailable | only an explicitly declared modal template |

Template sequences are degree/register recipes, not unordered sets. Every row
specifies minimum voice count, permitted omissions/doublings, bass policy, range,
and typed unavailable cases in machine-readable data with goldens and citations.

### 12.4 Transition assignment

For 3-7 voices, use exact order-preserving sequence-alignment dynamic programming
rather than a factorial permutation routine. Matching source and target voices
in ascending MIDI order forbids crossing by construction; gap operations model
entering/leaving voices. Because crossings are forbidden rather than independently
costed, the transition objective remains decomposable and testable.

Return arcs:

```ts
type VoiceArc = {
  fromVoiceId: string | null;
  toVoiceId: string | null;
  from: SpelledPitch | null;
  to: SpelledPitch | null;
  fromDegree: ChordDegree | null;
  toDegree: ChordDegree | null;
  semitones: number | null;
  commonTone: boolean;
  guideTone: boolean;
};
```

Entering or leaving voices have `semitones: null`; zero is reserved for a real
common-tone assignment. Pitch-class equality is used for octave-displaced common
tones, exact MIDI equality for literal sustained/unison identity, and spelled
identity for notation explanations. Tests cover all three questions explicitly.

Voice IDs are deterministic and stable only within one versioned optimization
request. A realization assigns low-to-high ordinals; the transition service
propagates IDs across matched arcs and allocates new IDs for entering voices.
Workbench locks therefore bind `{requestId,eventId,voiceId,pitch,degree}` and are
invalidated visibly when that request changes; they never rely on a global
soprano/tenor naming fiction.

The optimizer never matches notes by string prefix. Equality uses pitch-class or
spelled identity according to the question being answered.

### 12.5 Cost vector

Keep costs plural in the explanation, even if the selected policy uses declared
weights for a deterministic default:

```ts
type VoiceLeadingCost = {
  totalMotion: number;
  maximumLeap: number;
  commonTonesLost: number;
  crowdedLowIntervals: number;
  doubledGuideTones: number;
  omittedColors: number;
  totalSpan: number;
};
```

Policy weights are versioned constants and exposed in developer documentation.
Candidates that are worse on every relevant axis may be Pareto-pruned. Tied or
non-dominated alternatives remain available in the voice-leading workbench.

### 12.6 Progression-level optimization

Do not greedily optimize only from the immediately previous chord. Compile a
bounded candidate set per event and use beam-search/dynamic programming across
the progression or current section. This prevents one locally minimal voicing
from forcing an extreme later leap.

The first-release resource contract is deterministic: at most 96 raw candidates
per event survive generation, at most 24 Pareto/local-score candidates enter
progression optimization, beam width is at most 48, and one optimization command
may inspect at most 512 events. Above that limit the service optimizes explicit
512-event windows with fixed boundary voicings and returns a visible
`voicing.optimization_degraded` notice. It must never freeze the UI thread behind
an unbounded search; fixed expansion quanta yield cooperatively. Performance
tests enforce a 100 ms target for a 64-event four-voice section on the CI
reference runner and a 500 ms release ceiling. Missing either fails the release
performance gate but never selects/truncates a different result.

Boundaries:

- manual/frozen events have one fixed candidate;
- section `reset` starts a new chain;
- loop boundaries may include last-to-first transition cost;
- optimization is cached by chord AST, policy, neighbor constraints, and engine
  version;
- editing invalidates only the affected chain segment.

Manual and frozen events are immutable boundary candidates during optimization.
If they make requested constraints impossible, the service preserves them and
returns a local warning; it never rewrites their pitches. A document edit may
make a manual/frozen voicing disagree with its chord, and that remains a visible
lint condition until the user explicitly transposes, regenerates, or edits it.

### 12.7 Voice-leading workbench

The UI shows adjacent voicings as vertical note stacks connected by strands.
Each strand names the source, destination, and semitone motion. Common tones,
guide tones, entering/leaving voices, and large leaps use icon/text labels in
addition to color.

Users may:

- audition non-dominated candidate voicings;
- lock bass, soprano, individual voice, or entire voicing;
- switch family or range;
- freeze the chosen result;
- compare cost axes;
- reset to policy default.

The workbench edits only through explicit commands. Merely opening or auditioning
an alternative does not change the document.

Workbench locks are ephemeral candidate constraints. They survive audition and
comparison while the workbench is open but are not document data and disappear
on cancel/reset. “Freeze chosen voicing” is the sole action that persists the
locked result, as one undoable `FrozenVoicing` command. This avoids a hidden
fourth voicing state and gives persistence/Undo unambiguous semantics.

## 13. Audio engine and transport

### 13.1 Standards grounding

The Web Audio specification states that scheduled times are relative to
`AudioContext.currentTime`, that a running context's time is monotonic, and that
most documents should use one `AudioContext`. Current browser guidance requires
creating or resuming the context in a user gesture and recommends AudioParam
scheduling methods for timed changes.

The architecture follows those contracts directly.

### 13.2 Persistent graph

Create the context lazily on the first explicit Play or Preview action. Once
created, ordinary play, stop, seek, instrument change, progression end, import,
or new document never closes it.

```text
voice source(s)
  -> per-voice envelope gain
  -> instrument bus
  -> tone filter / EQ
  -> dry bus ----------------------┐
  -> reverb send -> convolver -----┤
                                   v
                     conservative dynamics compressor
                                   -> soft-clip safety shaper
                                   -> master gain
                                   -> destination
```

The master graph is constructed once. Instrument selection changes the voice
factory/recipe and future voices, not the graph or transport.

The compressor is described as a dynamics stage, not a brick-wall limiter. A
bounded, measured soft-clip curve and conservative per-voice normalization form
the final safety margin. Automated peak checks and human listening both gate
release; the UI makes no mastering-quality claim.

### 13.3 Instrument recipes

Each recipe declares oscillator partials, detune, envelope, filter, and level.
Initial instruments:

- **Mellow Keys** — triangle/sine partials, quick attack, short body, gentle
  low-pass decay;
- **FM Electric Piano** — carrier/modulator pair with velocity-sensitive
  brightness and tine-like decay;
- **Vibraphone** — sine partials, mallet transient, slow amplitude tremolo;
- **Warm Pad** — detuned saw/triangle blend, slow attack/release, low-pass;
- **Analog Poly** — saw/pulse blend with a resonant low-pass envelope.

Recipes have honest names, conservative output levels, and per-note gain
normalization based on voice count. Instrument code contains no document or UI
logic.

The initial reverb impulse is generated once from a versioned, fixed-seed
algorithm into an `AudioBuffer`; its checksum is golden-tested. It is project
code, so there is no undisclosed sample asset or network decode. If a recorded
impulse is introduced later, it must be embedded, attributed in the artifact
license inventory, and covered by the same offline/no-request gate.

### 13.4 Synth voice lifecycle

Each scheduled note owns:

- a stable note/voice ID;
- playback generation ID;
- oscillator/source nodes;
- envelope gain;
- start and release audio times;
- cleanup callback/registry entry.

Attack and release use AudioParam ramps to avoid clicks. Source nodes are stopped
at a bounded time and disconnected exactly once. Cleanup is idempotent.

At identical timestamps, note-off/release scheduling occurs before note-on so a
rearticulated pitch cannot be stolen by stale ownership.

### 13.5 Active voice registry

The registry indexes voices by voice ID, generation, event ID, and MIDI pitch.
It supports:

- stop one preview;
- stop one event;
- stop one generation;
- all-notes-off;
- instrument polyphony limit and oldest/quietest voice stealing;
- debug counts for tests.

All scheduled audio work must be discoverable through the registry. No anonymous
delayed attack or graph reconnect is permitted.

The visible global Stop command retires both progression and preview generations,
then places the playhead at that progression run's `startBeat`. A separate
preview-only Release action (also used when a new preview starts or its momentary
control ends) retires preview without changing progression state or playhead.

### 13.6 Playback plan

The pure compiler turns a validated document plus realized voicings into:

```ts
type CompilePlaybackPlanRequest = {
  document: ValidatedDocument;
  realizedVoicings: ReadonlyMap<string, RealizedVoicing>;
  loop: BeatRange | null;
};

type PlaybackEvent = {
  eventId: string;
  sectionId: string;
  measureId: string;
  startBeat: BeatPosition;
  durationBeats: BeatDuration;
  gateDurationBeats: BeatDuration;
  pitches: SpelledPitch[];
  velocity: number;
};

type PlaybackPlan = {
  tempoBpm: number;
  meter: Meter;
  events: PlaybackEvent[];
  totalBeats: BeatDuration;
  loop: BeatRange | null;
};
```

Loop is ephemeral transport/application state supplied explicitly in the compile
request, not document data. The compiler validates it against total exact time,
clips/restarts overlapping events by the declared articulation rule, and refuses
an empty/out-of-range/reversed loop. A null loop compiles the ordinary plan.

`eventId` is the source `ChordEvent.id`; there is no second chord identity.
`gateDurationBeats` is exact, positive, and no longer than the event duration.
The versioned articulation policy must produce a representable divisor-of-960
value or refuse; audio attack/release milliseconds belong to the instrument
recipe and do not leak into MIDI timing.

The compiler does not touch Web Audio. All plan time remains normalized rational
beat data; MIDI converts it to exact integer ticks at PPQ 960, and audio converts
it to seconds only when scheduling against a context epoch. It is unit-tested
with exact beat timelines and serves MIDI export as well as playback.

### 13.7 Transport state machine

```text
locked --initialize--> ready
ready  --play-------> playing
playing --pause-----> paused
paused --resume-----> playing
playing/paused --stop--> ready
playing/paused --seek--> ready -> playing/paused as requested
playing --plan exhausted--> ready at run start beat
any nonclosed --browser interruption--> interrupted
interrupted --resume gesture--> prior stable state
any --fatal audio error--> fault
fault --reinitialize gesture--> ready
```

Transport state contains generation, plan, anchor context time, anchor beat,
paused beat, scheduled event cursor, loop range, and start beat. State transitions
are serialized; a command cannot overlap another transition.

### 13.8 Lookahead scheduler

Use a short control-thread interval to schedule a bounded horizon against the
audio clock:

```text
tick every approximately 25 ms
schedule approximately 100 ms ahead
```

Those values are defaults subject to measured browser tests, not correctness
constants. Correctness comes from absolute `AudioContext.currentTime` times,
owned event cursors, and generation checks.

The scheduler:

1. reads current transport generation and audio time;
2. maps the scheduling horizon to beat position;
3. schedules each not-yet-scheduled event in range exactly once;
4. records scheduled voices in the registry;
5. handles loop wrap through a new epoch/generation boundary;
6. stops ticking when no unscheduled work remains.

`requestAnimationFrame` reads transport position for visual interpolation only.
UI rendering never decides when a note sounds.

### 13.9 Stop guarantee

`stop()` must provide a testable postcondition: after its promise resolves, no
stale scheduled attack can begin.

Implementation order:

1. serialize the transition;
2. increment generation;
3. clear scheduler/control handles;
4. cancel future automation where safe;
5. apply a very short release ramp to active gains;
6. stop and unregister sources;
7. clear scheduled cursor/playhead state;
8. publish ready state.

Every callback checks generation before work. Stress tests inspect the fake audio
log after Stop and require zero later attacks.

### 13.10 Pause, resume, seek, tempo, and loop

- Pause records beat from the old epoch, retires generation, and releases voices.
- Resume creates a new epoch at the paused beat.
- Seek uses the same retirement path, then sets beat and optionally resumes.
- Tempo changes retire only the unsounded horizon and create a new epoch so
  sounded notes do not jump.
- Loop compilation includes events that overlap the range and clips/restarts
  them according to a documented articulation rule.
- Count-in and metronome are generated transport events on a separate click bus.
- Natural progression end stops scheduling new attacks but lets owned release
  and reverb tails decay for at most eight seconds; by that deadline every voice
  source/envelope is stopped, disconnected, and absent from the registry while
  the persistent master graph remains ready. Explicit Stop uses the stricter
  immediate retirement guarantee and returns to `startBeat`.
- Browser `suspended`/`interrupted` state never advances the musical playhead as
  if sound occurred. Recovery requires a gesture, retires the old epoch, and
  resumes from its stored beat rather than replaying stale callbacks.
- An instrument command is serialized, cancels/reschedules every not-yet-attacked
  voice in the lookahead horizon, and takes effect for the first attack after the
  command resolves. Already sounding voices keep their recipe through a bounded
  release. A paused instrument change updates the next resume; a preview uses the
  recipe current when that preview command begins.
- Natural end publishes `ready` with playhead at the run's `startBeat`. Replay
  during an old release/reverb tail first retires the old voice generation, then
  begins the new run without rebuilding the graph.

### 13.11 Preview channel

Chord and voicing preview uses the same context, graph, recipes, registry, and
voice implementation but a separate preview generation. Starting a new preview
releases the previous preview. Preview never changes progression transport,
document state, selection, insertion point, range, or playhead.

### 13.12 Audio tests

Pure/fake tests cover:

- beat-to-second mapping across BPM values;
- exact event ordering;
- note-off before note-on at a boundary;
- one schedule per event;
- stale generation rejection;
- play/pause/resume/seek/stop transitions;
- tempo change epoch;
- loop wrap;
- browser interruption/recovery;
- active registry empty after stop;
- 100 rapid play/stop cycles;
- instrument change without graph recreation;
- end then immediate replay;
- import/new while playing;
- polyphony and voice stealing;
- gain/range safety for dense seven-note voicings.
- Stop while previewing and preview-only Release while progression plays;
- rapid instrument selection, instrument change inside the lookahead horizon,
  paused instrument change, and instrument-during-preview behavior;
- natural-end deadline, zero voice registry entries, and immediate replay during
  a residual tail;
- stale transport-view notification rejection after Stop and replacement;
- 0.5-, 1-, 2-, and 4-beat onset/gate/release goldens across slow, medium, and
  fast BPM values, prohibiting duration caps that create accidental silence.

The mandatory real-browser matrix runs the supported `AudioContext` checks and
asserts state, node bookkeeping, and console cleanliness; unsupported automation
capabilities are recorded as explicit matrix exceptions and covered manually.
Human listening tests remain required for timbre and click/stuck-note perception;
automation does not claim to hear.

`OfflineAudioContext` render tests additionally assert bounded peak/RMS levels,
non-silent output, expected event onset windows, tail decay, no NaN samples, and
deterministic impulse response. Mandatory manual listening covers each
instrument in Chromium, Firefox, and WebKit/Safari where available, headphones
and laptop speakers, dense/seven-note passages, rapid Stop/Replay, tempo change,
loop boundaries, long releases, and OS/browser interruption. Results, browser
versions, hardware category, and known timbral limitations are recorded in the
release checklist.

## 14. Application state, commands, and history

### 14.1 State ownership

The application state is explicit and serializable except for service handles:

```ts
type AppState = {
  document: ProgressionDocumentV2;
  revision: number;
  exportRevision: number | null;
  recovery: RecoveryStatus;
  history: HistoryState;
  selection: SelectionState;
  insertion: InsertionPoint;
  range: BeatRange | null;
  panels: PanelState;
  dialogs: DialogStack;
  quickEntry: QuickEntryDraft;
  importDraft: ImportDraft | null;
  transport: TransportViewState;
  notices: Notice[];
};
```

`AudioContext`, nodes, timers, file handles, database handles, and abort
controllers live behind injected services and never enter this tree. The
document is the only musical source of truth. Selection points to stable IDs,
not array indexes; selectors resolve current positions and safely return an
empty result when an event disappears.

The transport service state machine is the sole playback authority.
`TransportViewState` is a read-only, generation-tagged projection of serialized
service events. Reducers may render it but may not advance time or schedule
sound. Notifications whose generation/request precedes the latest accepted
transition are discarded, so an old playhead update cannot repaint the UI after
Stop, replacement, or replay.

### 14.2 Commands

Every document mutation is a typed command with:

```ts
type DocumentCommand = {
  id: string;
  label: string;
  apply(document: ProgressionDocumentV2): CommandResult;
  invert(before: ProgressionDocumentV2, after: ProgressionDocumentV2): DocumentCommand;
  coalesceKey?: string;
};
```

The command runner validates the precondition, applies to an isolated value,
validates the result, increments revision once, repairs ephemeral selection by
stable ID, appends history, and only then publishes. Failure publishes a notice
but no partial document. Commands cover insert, delete, move, duration change,
section edits, symbol/structured chord edits, voicing changes, transpose,
suggestion apply, lesson load, New, and confirmed import replacement.

Continuous sliders keep a local preview and commit one command on pointer/key
completion. Text edits coalesce only while the same field remains focused and
the previous command is less than one second old. Structural operations never
coalesce accidentally.

### 14.3 Undo and redo

History stores reversible before/after document references using immutable
structural sharing, not JSON cloning:

```ts
type HistoryEntry = {
  commandId: string;
  label: string;
  before: ProgressionDocumentV2;
  after: ProgressionDocumentV2;
  beforeBookmarks: StableUiBookmarks;
  afterBookmarks: StableUiBookmarks;
};
```

Bookmarks contain selection IDs, insertion boundary IDs, and range boundary IDs;
playhead and transport are deliberately excluded. The default cap is 200
commands or 16 MiB of retained estimates, whichever is reached first. Eviction
removes the oldest complete undo entry and announces no false ability to undo it.
A new command clears redo. Undo/redo cannot run while an import confirmation or
document transition is committing.

New, lesson load, and import replacement create recoverable history boundaries
when the old document fits the cap. If it cannot be retained, confirmation says
that Undo will be unavailable and requires an explicit export recommendation.
Undoing an import restores the exact prior document and selection; redo restores
the exact validated imported document without reparsing changed external text.

### 14.4 Effects and service orchestration

Reducers and domain commands remain pure. An application service layer owns
ordered effects:

1. validate the user intent;
2. retire or pause transport if document replacement requires it;
3. commit the pure command;
4. queue recovery persistence;
5. derive a new playback plan only when relevant content changed;
6. restore focus and announce the result.

Effectful intents use an `AbortController` and monotonically increasing request
ID. Late analysis, import reads, or voicing results are discarded if their
revision/request no longer matches. Audio transitions are serialized by the
transport service. UI components never sequence these effects themselves.

New, starter-lesson load, canonical import, and legacy import all use one
replacement transaction. After confirmation it:

1. waits behind any active transport transition;
2. retires progression and preview generations and awaits the strict
   no-future-attack postcondition;
3. validates the already-decoded replacement and prepares history/bookmarks;
4. atomically publishes the document command;
5. installs its playback plan in `ready` at beat zero;
6. clears old event announcements, selection, insertion, and range, then chooses
   the first valid insertion target;
7. queues recovery and restores focus.

If a pre-commit audio retirement or validation step fails, the document command
does not publish and authoritative state remains unchanged. Cancel never begins
the transaction. Fake-clock and real-browser tests cover every replacement while
playing, paused, previewing, and ready, plus cancellation and decode/audio
failure.

### 14.5 Derived state

Selectors derive measure fill, canonical symbols, resolved tones, contextual
analysis, candidate voicings, playback plan status, dirty status, and visible
notices. Memoization keys include document revision plus the smallest relevant
IDs. Derived values are never written back into document JSON merely as a cache.

Small literal resolution, local voicing, and selectors run synchronously within
their tight bounds. Progression voicing and Harmonic Discovery searches use pure
resumable steppers plus an abortable cooperative application runner with fixed
work quanta. The runner yields to rendering, publishes busy/progress/cancel state,
and drops stale revisions; yield timing cannot change the result. If profiling
later proves cooperative execution inadequate, the unchanged stepper contract may
move to an inlined worker, but no worker is introduced speculatively.

## 15. Persistence, recovery, import, and migration

### 15.1 Recovery is not a file save

The application calls browser persistence **Recovery**, not Save. JSON export is
the explicit portable save action. Status text distinguishes:

- `Recovered locally at 14:32`;
- `Changes pending recovery`;
- `Recovery unavailable — export recommended`;
- `Exported at revision 18`;
- `Changed since export`.

The primary adapter uses IndexedDB with a versioned object store. A bounded
localStorage adapter is a fallback only after a capability probe. If both fail
or quota is exceeded, editing continues and the persistent header status points
to Export. Storage keys include application schema and document ID; user text is
never used as a key.

### 15.2 Recovery envelope and write discipline

```ts
type RecoveryEnvelope = {
  schema: 'changes.recovery.v1';
  savedAt: string;
  revision: number;
  lastExport?: {
    revision: number;
    exportedAt: string;
    semanticDocumentHash: string;
  };
  document: ProgressionDocumentV2;
  checksum: string;
};
```

The checksum detects truncation/accidental corruption; it is not described as a
security signature. Persistence keeps current and previous validated envelopes.
A successful canonical JSON export computes the semantic document hash and
persists this marker separately and in the next recovery envelope; changing a
title, chord, timing, or setting therefore makes Changed since export
deterministic across reload. Export download cancellation/failure never advances
the marker.
A mutation marks recovery pending immediately and queues a write after 400 ms of
inactivity, with a maximum two-second delay during continuous editing. A final
best-effort write is requested on visibility change; correctness never depends
on asynchronous work completing during unload.

Writes serialize a snapshot for the triggering revision. Completion may mark
recovery current only if that revision is still current. Older completions may
not overwrite a newer status. Each envelope is decoded and checksum-checked
before it becomes a startup candidate.

### 15.3 Startup recovery choice

Startup renders the blank workspace immediately, probes recovery, and then:

- opens a current valid recovery automatically only when no conflicting session
  state exists, with a visible explanation and Discard/New actions;
- offers Keep/Discard when a recovered document is stale or differs from an
  explicit last-export marker;
- offers the previous envelope if current is corrupted;
- reports a nonblocking diagnostic if neither copy decodes.

Recovery never initializes audio and never silently overwrites an already edited
in-memory document.

### 15.4 Canonical JSON import

File and pasted-text import share one pipeline:

1. enforce the byte limit before parse;
2. parse JSON without revivers;
3. detect schema/legacy shape;
4. decode into a temporary document;
5. run semantic validation and migration;
6. show document summary, counts, warnings, and replacement impact;
7. apply only after explicit confirmation as one command.

Selecting a file never auto-imports it. Cancel discards the draft. A failed
import leaves document, history, selection, transport, and recovery byte-for-byte
unchanged. User-provided strings render as text nodes; the application never
uses `dangerouslySetInnerHTML` for import data.

### 15.5 Legacy importer

The compatibility decoder recognizes the unversioned legacy shape documented in
`LEGACY_AUDIT.md`: progression `name`, `description`, and `sections`, each with
index-based `chords` containing `name`, `root`, `type`, `bass`, `notes`, alteration
flags, tensions, annotation, and voicing controls.

Migration rules are conservative:

- assign new stable IDs while recording old array paths;
- ignore UI-only `collapsed`/editing flags with an informational report;
- create 4/4 measures and four-beat events because legacy files have no meter or
  duration; one legacy chord becomes one measure;
- use the deterministic precedence table below; never choose a “best” field by
  undocumented judgment;
- use default document playback settings and report every absent field;
- never import transient state or execute imported content.

| Condition in one legacy chord | Deterministic outcome |
|---|---|
| `name` parses; valid notes project to one resolver realization | parsed chord + exact Manual voicing |
| `name` parses; notes absent | parsed chord + default Balanced Auto policy, with missing-notes report |
| `name` parses; valid notes disagree | Custom chord labeled by `name` + exact Manual voicing; report all conflicting fields |
| `name` fails/missing; valid `root` + allow-listed `type` builds a symbol; notes agree/absent | parsed chord + Manual when notes exist, otherwise Balanced Auto |
| constructed symbol and valid notes disagree | Custom chord + Manual, using constructed text only as label |
| no parseable symbol but valid notes exist | Custom chord + Manual; label preserves nonempty `name` or bounded root/type text |
| neither parseable symbol nor valid notes | reject that event at its exact path; do not insert a fallback chord |

The allow-listed type-to-suffix map is checked in and exhaustive for the legacy
palette: `major -> ''`, `minor -> m`, `dim`, `aug`, `sus2`, `sus4`, `6`, `m6`,
`maj7`, `7`, `m7`, `mMaj7`, `m7b5`, `dim7`, `aug7`, `augMaj7`, `maj9`, `9`,
`m9`, `11`, `m11`, `13`, `maj13`, `m13`, `7b9`, `7#9`, `7#11`, `7b13`,
`7b5`, `7#5`, `alt -> 7alt`, `maj7#11`, `m9b5`, `9sus4`, `13sus4`,
`7b9sus4`, `m6/9`, `6/9`, and `9b5`. Unknown values are not stripped or
substring-matched. Alteration flags may help construct a name only when `name`
is absent and every true flag maps to one supported modifier; otherwise they are
reported as conflicting/ignored evidence and cannot rewrite a parsed name.

A trustworthy legacy note array contains 1-16 strings, each fully matching the
documented scientific-pitch grammar, projecting through the C4=60 convention to
MIDI 0...127, and containing no duplicate exact MIDI pitch. Empty arrays,
pitch-class-only strings, partial parses, nonstrings, and exact duplicates are
untrusted. A valid array preserves every spelling/octave as Manual pitches;
custom `pitchNames` are its stable first-occurrence spelled pitch classes.
Untrusted arrays are reported and never repaired.

Legacy `voicingStyle: close`, `baseOctave`, `octaveSpan`, and `density` do not
prove an exact v2 family. Exact notes take precedence as Manual. Without exact
notes, migration uses the disclosed Balanced default and reports ignored legacy
voicing metadata; no name is called equivalent without a row in a future
reviewed mapping table.

The preview groups outcomes as Preserved, Canonicalized, Converted to Custom,
Ignored UI data, and Rejected. Each warning includes its legacy path and stable
code. Golden fixtures cover every shipped legacy preset and adversarial files.
Expected outputs are hand-authored independently for every shipped preset plus
each field-conflict row before the importer implementation is accepted.

### 15.6 Native schema evolution

Each future schema change is a pure `vN -> vN+1` migration with golden input and
output. Decoders never mutate older objects. Unsupported future versions are
refused with an Export/Open-in-compatible-version message, not guessed. The
canonical exporter always emits the newest schema; it can include a human-readable
migration report as a separate download, never inside musical data unless the
schema declares it.

## 16. Export and interchange

### 16.1 Canonical JSON

JSON export emits only validated `ProgressionDocumentV2`, pretty-printed with a
stable top-level/property ordering and final newline. Derived analysis, UI state,
recovery metadata, and history are excluded. Export performs a decode round trip
and semantic equality check before offering bytes. The filename is a sanitized
title plus `.changes.json`; an empty title uses `untitled-changes.json`.

Use the File System Access API only as progressive enhancement after a user
gesture. The universal path is a Blob plus temporary download anchor, implemented
locally without FileSaver or a network dependency. Object URLs are revoked after
activation.

### 16.2 Lead-sheet text

Text export uses the declared chart grammar with section headers, barlines,
canonical symbols, durations, key/meter/tempo header directives, and JSON-escaped
annotations.
Before export it lists lossy elements: exact manual/frozen octave voicings,
instrument/effect settings and alternate analyses. Text export is for human
interchange and re-import, not the canonical
lossless format.

Round-trip tests require literal chord structure, sections, measure timing, and
annotations supported by the text grammar to survive. Losses are explicit and
golden-tested.

### 16.3 MIDI

MIDI export writes a local Standard MIDI File without a runtime dependency:

- format 1;
- PPQ 960;
- conductor track with tempo, meter, title, section markers, and chord markers;
- one voicing track with realized pitches, velocity, articulation, and instrument
  name metadata;
- exact rational beat-to-tick conversion, refusing any value that cannot map
  integrally rather than rounding silently;
- note-off ordering before note-on at equal ticks;
- bounded variable-length quantities and pitch/velocity validation.

Automatic voicings are realized deterministically at export time using the same
engine version shown in the report. Manual and frozen register, doubling, onset,
gate timing, and velocity are exact at PPQ 960. MIDI note numbers cannot encode
enharmonic spelling, so canonical spelled chord symbols are retained in marker
text and JSON while spelling loss is listed in the preview/report. Integer MIDI
tempo is nearest-microsecond-per-quarter as specified in Section 9.6; the report
states requested and encoded BPM and the bounded error. Export preview identifies
any unsatisfied voicing, range issue, nonintegral timing, or custom chord without
playable notes and permits cancellation. A MIDI parser in tests validates event
ordering, exact ticks, gate duration, markers, and tempo encoding; at least two
external DAWs/players are included in the manual release matrix.

## 17. UI component and interaction contract

### 17.1 Design system

CSS custom properties define color, typography, space, radius, border, focus,
motion, and responsive breakpoints. The shipped artifact uses system/local font
stacks only; no font request is allowed. Light mode is not a release requirement,
but forced-colors and increased contrast are. Every component consumes semantic
tokens such as `--surface-chart`, `--text-muted`, `--state-error`, and
`--focus-ring`, never copy-pasted hex values for state.

The UI uses the **owned-component-library approach popularized by shadcn**:
polished component source lives in this repository and is adapted to the
product, rather than hiding behavior behind a runtime component dependency.
The implementation is native Preact/CSS—not React, Radix, Tailwind, a shadcn
package, or a copied compatibility layer—so the one-file artifact and Preact-only
production boundary remain intact.

The component library is broad enough that feature work composes consistent
parts instead of inventing one-off controls:

- foundations: Button, IconButton, LinkButton, Badge, Kbd, Separator, Skeleton,
  Spinner, VisuallyHidden, Card, EmptyState, StatusPill, Progress, and Meter;
- forms: Field, Label, Input, Textarea, NumberField, Select, Combobox, Listbox,
  Checkbox, RadioGroup, Switch, Slider, SegmentedControl, Toggle, and
  ToggleGroup;
- navigation and commands: Tabs, Breadcrumb, Toolbar, Menu, ContextMenu,
  CommandPalette, Disclosure, Accordion, ScrollArea, and roving-focus helpers;
- overlays and feedback: Tooltip, Popover, Dialog, AlertDialog, Sheet/Drawer,
  Toast/Notice, and one shared focus/dismissal layer;
- structured views: KeyValueList, DataTable, Tree, ResizablePanels, and
  timeline/lane primitives used by chart, analysis, voicing, and search tools.

This is a source-owned design system, not license to recreate every component
regardless of need. U0 specifies the complete public prop/state/keyboard matrix
and implements the components required by the planned product surfaces. Every
primitive has default/hover/active/focus/disabled/loading/error/empty/dense and
responsive states where meaningful, plus keyboard, focus, touch,
reduced-motion, forced-colors, zoom, and axe evidence before feature
composition. An isolated test-only component gallery captures visual baselines
without shipping Storybook or another runtime.

### 17.2 Component ownership

```text
App
  Header / DocumentStatus / DocumentMenu
  Workspace
    LibraryRail / QuickEntry / ChordPalette / Lessons
      AtlasBrowser / AtlasFilters / PracticeLauncher
    Chart
      SectionView / MeasureView / ChordCard / InsertionTarget
      ContinuationRail / ConstraintLanes
    HarmonyLens
      SymbolPanel / StructurePanel / VoicingPanel
      JourneyMap / ContextPanel / GuideToneDesigner / ColorLab
      RhythmTensionPanel / SimilarityPanel / VoiceLeadingWorkbench
      AnnotationPanel
    DiscoverySurfaces
      RoutePlanner / ReharmonizationBranches / SequenceBuilder
  TransportBar / Scrubber / AudioStatus
  DialogHost / NoticeRegion / Help
```

Feature components receive selector values and dispatch application intents.
They do not import storage, audio, or parser implementation modules directly.
Primitives do not know about chord documents. The dialog host enforces one
modal focus scope; a mobile sheet either becomes the active dialog or remains
nonmodal, never a modal nested inside another modal.

### 17.3 Chart semantics and focus

The chart is a labeled region containing section headings and ordered measure
lists. A chord card is a focusable group with one primary select/edit action and
a named More menu; nested controls do not turn the whole card into an invalid
button. Roving focus follows visual order while stable IDs preserve focus across
reorder. When the focused event is deleted, focus moves to the next event, then
previous, then the section insertion target.

Drag is optional enhancement using Pointer Events and a dedicated handle.
Keyboard Move Before/After and menu Move Previous/Next share the same command.
Pointer capture is released on cancel/unmount; listeners are component-scoped
and never multiplied by document mutations. Touch activation does not call
`preventDefault` until a real drag threshold is crossed, preserving taps and
scroll.

### 17.4 Editing transactions

Inline symbol editing keeps raw text local. Enter/Apply parses and commits only
on success; Escape restores the prior exact text. Blur does not silently convert
invalid text. Structured inspector changes operate on a draft AST, render a live
canonical preview, and dispatch one command on Apply. Switching away with dirty
draft changes prompts Apply/Discard/Continue editing.

Duration edits always show resulting measure fill. Overfill offers Split at bar,
Move following events, or Cancel. Underfill offers leave explicit incomplete
measure with reason, insert rests only if a future rest model exists, or Cancel;
the first release does not synthesize hidden rests.

### 17.5 Piano and voicing controls

The piano is a view/editor for exact pitches, not the chord formula authority.
It uses MIDI coordinates for geometry so black-key offsets remain correct across
octaves. Labels respect spelling preference while each key exposes MIDI pitch,
spelled note, octave, selected state, and action. Keyboard alternatives use a
list/spin control for adding/removing notes; no user must play a visual keyboard.

Manual mode preserves stored pitch order, spelling, octave, and duplicate or
unison entries exactly. The piano may offer a separate low-to-high visual lens,
but it never rewrites the stored array. Switching Auto to Manual
copies the current realized pitches as one command; switching back requires a
family/range choice and never discards manual data without confirmation/undo.

### 17.6 Responsive behavior

Desktop uses the three-column studio at sufficient width. Medium widths collapse
Library first, then Harmony Lens, into named drawers. Mobile keeps chart and
transport visible while drawers/sheets are open. Breakpoints respond to content,
not device names. Tests cover 320x568, 390x844, 768x1024, 1280x800, and 1440x900,
plus 200% zoom. No primary action depends on hover.

### 17.7 Copy and feedback

Labels use musically honest verbs: Preview, Play from selection, Freeze voicing,
Recover, Export JSON, Replace document. Avoid `Save` for browser recovery,
`Perfect voice leading`, `Professional sound`, or an analysis presented as fact.
Errors include preservation and recovery: “Import stopped at Section B, chord 4.
Your current chart was not changed.” Notices are deduplicated, dismissible when
appropriate, and never cover transport on mobile.

## 18. Built-in content and default data

### 18.1 Blank by default

New creates an empty titled document with one empty 4/4 measure, 120 BPM, no
asserted key, Mellow Keys, moderate master level, light reverb, and no selection.
An empty measure uses an explicit `empty` completion state that is valid only
while it has no events; inserting the first event must resolve it to complete or
intentional pickup/incomplete status. The UI labels it Empty rather than falsely
reporting an underfill error before authoring begins.

The optional starter lesson is separate immutable content. Opening it is an
undoable document replacement and never changes what New means.

### 18.2 Lessons and examples

Initial lessons are small and evidence-bearing:

1. **ii-V-I with guide tones** — Dm7-G7-Cmaj7, spelled tones, thirds/sevenths,
   and two voice-leading alternatives.
2. **Minor ii-V-i** — Dm7b5-G7b9-Cm(maj7), altered tension and spelling notes.
3. **Tritone option** — compare G7 and Db7 approaching Cmaj7, explicitly labeled
   as options.
4. **Backdoor color** — Fm7-Bb7-Cmaj7 with contextual caveat.
5. **Modal planing** — nonfunctional parallel harmony to demonstrate that the
   lint/analysis engine does not call every sequence a cadence error.

Content is authored as validated v2 documents plus lesson narration with stable
source citations in the theory ledger. Examples are not mutable singleton
objects. The decoder validates and preserves fixture IDs; an explicit
`instantiateLesson` command then deep-copies the validated fixture and remaps the
document, section, measure, and event IDs through one collision-checked map before
publication. Property tests prove all references remap exactly once and the
fixture remains unchanged.
Every shipped example parses, resolves, voices, plays, exports, and passes lint
without unexplained warnings.

### 18.3 Palette and search

The palette is generated from canonical templates rather than 80 hand-copied
note arrays. It includes common quality families, recent symbols stored as a
local preference, and search by symbol/quality/tension. Choosing a template
creates a fresh AST at the current root and insertion duration. Template labels,
resolved degrees, and previews all come from the same resolver. Search with no
matches has a clear Custom chord/Help route.

### 18.4 Harmonic Atlas source, compilation, and practice content

`content/atlas-source/` contains reviewed compact templates; unverified generated
candidates live outside shipped source under `content/atlas-quarantine/` and are
excluded from build inputs. Each source record has stable ID/version,
relationships, exact time, applicability, rule IDs, provenance/review tier,
listening note, skeleton, transformations, and practice prompts.

`compile-atlas.ts` deterministically produces the runtime corpus, facet index,
fingerprints, derivation links, and manifest. It reports accepted/rejected counts,
every rejection code, template/variant/family coverage, size, duplicate groups,
and provenance inventory. A checked-in golden manifest proves that no candidate
entered or disappeared incidentally. Runtime never reads source/quarantine files.

Practice templates declare finite question/answer generation rules, hints,
explanation references, and seeds. A grader may check literal facts or a finite
set of law-valid options; it cannot grade “musical quality.” Atlas and practice
copy avoids living-artist imitation and distinguishes referenced examples,
definition-derived variants, and synthetic exercises.

## 19. Verification, quality, security, and performance

### 19.1 Test layers

| Layer | Required proof |
|---|---|
| Type/static | strict TypeScript, no unchecked production `any`, dependency boundary check |
| Unit | domain arithmetic, parser, resolver, spelling, commands, selectors, audio utilities |
| Property/metamorphic | parser/formatter, transpose, rational time, IDs, reorder, undo/redo |
| Golden | chord corpus, legacy migrations, examples, MIDI bytes/events, text export |
| Mutation | theory formula/law mutations must be killed by independent fixtures |
| Search/conformance | continuation, route, constraint, tonal-path, branch, and guide-line results revalidate every law/constraint and match brute force on small spaces |
| Corpus compiler | deterministic atlas manifest, all variants valid, provenance complete, quarantine excluded, facet/fingerprint goldens |
| Integration | command/effect/persistence/import/playback-plan flows with fakes |
| Audio render | `OfflineAudioContext` signal, timing, tails, safety, determinism |
| Browser E2E | author/edit/reorder/undo/import/export/play/stop/recover workflows |
| Discovery E2E | continue, atlas, connect, constrain, branch/A-B, journey, color, sequence, and practice workflows with stale/no-result/degraded states |
| Accessibility | automated rule scan plus manual keyboard/screen-reader/zoom evidence |
| Visual | reviewed desktop/mobile/error/dialog/forced-color snapshots |
| Artifact | file and HTTP offline boot, denied network, checksum/build reproducibility |

Tests are deterministic: seeded generators, fake clocks where timing is logical,
fixed IDs, and no arbitrary sleep as an oracle. Browser tests wait on visible
state or application debug hooks compiled only in test mode. Production code
does not expose privileged mutation hooks.

### 19.2 Mandatory regression cases

The release suite names each confirmed legacy failure:

- Play produces scheduled attacks and never references an out-of-scope chord;
- `Cmaj7`, `Cmaj9`, `C9`, `C13`, and `Cdim7` resolve to correct degrees;
- preview receives and plays the selected chord without undefined notes;
- advanced/voice-leading playback needs no undefined `noteMap`;
- Stop prevents every stale future attack across 100 rapid cycles;
- section and full playback use the identical master effects path;
- tempo and scrubber change audible/transport behavior;
- custom alterations change semantic degrees or remain unapplied drafts;
- root edits cannot retain stale notes under a new label;
- manual pitches sound exactly as stored;
- `C` never matches `C#` by prefix;
- unsupported types become diagnostics/custom chords, never C major;
- touch chord activation works and listener counts stay constant;
- reorder preserves selected/playback identity by ID;
- file selection previews but does not auto-apply import;
- piano geometry and flat spellings work across octaves;
- audio init failure remains actionable and editing stays available;
- every control has keyboard and accessible-name coverage;
- malformed annotations render as inert text;
- standalone startup makes zero nonlocal requests.

The following stable traceability rows are mandatory. Test paths may move only
if this table and its verifier move in the same change. Q0 runs
`scripts/verify-traceability.ts`, which requires every Critical/High legacy ID to
have an existing owning package, named test, passing result, and release-evidence
heading.

| Legacy ID | Confirmed failure | Owner | Regression test | Evidence heading |
|---|---|---|---|---|
| L-RUNTIME-01 | whole-chart undefined chord/silence | X1 | `tests/integration/transport-play.test.ts` | `audio/whole-chart` |
| L-RUNTIME-02 | preview argument/notes mismatch | U2 | `tests/e2e/preview.spec.ts` | `audio/preview` |
| L-RUNTIME-03 | advanced undefined note map | V1 | `tests/unit/voice-assignment.test.ts` | `theory/voice-assignment` |
| L-AUDIO-01 | callbacks attack after Stop | X1 | `tests/integration/transport-stop-stress.test.ts` | `audio/stop-stress` |
| L-AUDIO-02 | section bypasses effects/recipe | X0 | `tests/integration/audio-routing.test.ts` | `audio/routing` |
| L-AUDIO-03 | BPM/scrubber/duration are inert | X1 | `tests/integration/transport-time.test.ts` | `audio/time-controls` |
| L-AUDIO-04 | init and rapid instrument races | X1 | `tests/integration/audio-command-races.test.ts` | `audio/command-races` |
| L-THEORY-01 | maj7/9/13/dim7 formulas corrupt | T1 | `tests/golden/chord-corpus.test.ts` | `theory/literal-corpus` |
| L-THEORY-02 | unsupported quality defaults major | T0 | `tests/unit/symbol-errors.test.ts` | `theory/refusals` |
| L-THEORY-03 | displayed alterations do not alter notes | U2 | `tests/e2e/structured-chord-edit.spec.ts` | `theory/structured-edit` |
| L-DATA-01 | root edit relabels stale notes | A0 | `tests/integration/chord-command.test.ts` | `data/command-integrity` |
| L-VOICE-01 | manual notes are reoptimized | P0 | `tests/unit/playback-plan-manual.test.ts` | `theory/manual-exactness` |
| L-VOICE-02 | prefix equality confuses C/C-sharp | V1 | `tests/unit/voice-identity.test.ts` | `theory/pitch-identity` |
| L-STATE-01 | index identity drifts after reorder | A0 | `tests/property/stable-id-reorder.test.ts` | `data/stable-ids` |
| L-STATE-02 | initial UI falsely reports playing | U4 | `tests/e2e/initial-transport.spec.ts` | `ux/transport-status` |
| L-TOUCH-01 | touch listeners suppress/multiply taps | U1 | `tests/e2e/touch-chart.spec.ts` | `ux/touch` |
| L-IMPORT-01 | file selection auto-applies unsafe import | E0 | `tests/integration/import-transaction.test.ts` | `data/import` |
| L-PIANO-01 | octave geometry/flats are incorrect | U2 | `tests/e2e/piano.spec.ts` | `ux/piano` |
| L-A11Y-01 | controls lack names/keyboard/focus | Q0 | `tests/e2e/accessibility.spec.ts` | `accessibility/core` |
| L-MARKUP-01 | annotation markup is malformed/unsafe | U2 | `tests/e2e/annotation.spec.ts` | `security/annotations` |
| L-OFFLINE-01 | release requires remote CDNs | F0 | `tests/e2e/standalone-offline.spec.ts` | `artifact/offline` |
| L-SOURCE-01 | duplicate members silently override | F0 | `tests/static/no-duplicate-members.test.ts` | `quality/source-integrity` |
| L-CORPUS-01 | 26/80 legacy presets self-disagree | C0 | `tests/golden/legacy-presets.test.ts` | `migration/preset-corpus` |

Q0 also runs `scripts/verify-discovery-traceability.ts`. It requires every
selected Idea Wizard capability to have existing conformance, E2E, deterministic
limit/no-result/degraded proof, and a populated release-evidence heading:

| Idea ID | Capability | Engine / UI owner | Conformance test | E2E test | Limit/failure test | Evidence heading |
|---|---|---|---|---|---|---|
| HD-01 | Contextual Continuation | G2 / U8 | `tests/conformance/continuation.test.ts` | `tests/e2e/continuation.spec.ts` | `tests/conformance/continuation-limits.test.ts` | `discovery/continuation` |
| HD-02 | Validated Atlas/compiler | G1+D0 / U8 | `tests/conformance/atlas-manifest.test.ts` | `tests/e2e/atlas.spec.ts` | `tests/conformance/atlas-rejections.test.ts` | `discovery/atlas` |
| HD-03 | Harmonic Route Planner | G3 / U9 | `tests/conformance/routes.test.ts` | `tests/e2e/routes.spec.ts` | `tests/conformance/route-limits.test.ts` | `discovery/routes` |
| HD-04 | Constraint Harmonization | G4 / U9 | `tests/conformance/constraints-bruteforce.test.ts` | `tests/e2e/constraints.spec.ts` | `tests/conformance/constraint-conflicts.test.ts` | `discovery/constraints` |
| HD-05 | Reharmonization Branches | G5 / U9 | `tests/conformance/transform-laws.test.ts` | `tests/e2e/reharmonization.spec.ts` | `tests/conformance/branch-limits.test.ts` | `discovery/reharmonization` |
| HD-06 | Tonal Journey Map | G0 / U8 | `tests/conformance/tonal-journey.test.ts` | `tests/e2e/tonal-journey.spec.ts` | `tests/conformance/tonal-ambiguity.test.ts` | `discovery/tonal-journey` |
| HD-07 | Guide-Tone Designer | G6 / U10 | `tests/conformance/guide-tone-paths.test.ts` | `tests/e2e/guide-tones.spec.ts` | `tests/conformance/guide-tone-no-path.test.ts` | `discovery/guide-tones` |
| HD-08 | Color/Upper-Structure Lab | G6 / U10 | `tests/conformance/color-options.test.ts` | `tests/e2e/color-lab.spec.ts` | `tests/conformance/color-unavailable.test.ts` | `discovery/color-lab` |
| HD-09 | Cadence/Phrase/Approach | G7 / U10 | `tests/conformance/cadences.test.ts` | `tests/e2e/cadence-builder.spec.ts` | `tests/conformance/cadence-near-misses.test.ts` | `discovery/cadences` |
| HD-10 | Harmonic-Rhythm transforms | G7 / U10 | `tests/conformance/harmonic-rhythm.test.ts` | `tests/e2e/harmonic-rhythm.spec.ts` | `tests/conformance/rhythm-refusals.test.ts` | `discovery/harmonic-rhythm` |
| HD-11 | Tension/Release curves | G7 / U10 | `tests/conformance/tension-axes.test.ts` | `tests/e2e/tension-curve.spec.ts` | `tests/conformance/tension-counterexamples.test.ts` | `discovery/tension-curves` |
| HD-12 | Fingerprint/Similarity | G1 / U8 | `tests/conformance/fingerprints.test.ts` | `tests/e2e/similarity.spec.ts` | `tests/conformance/fingerprint-collisions.test.ts` | `discovery/similarity` |
| HD-13 | Motif/Sequence transforms | G8 / U10 | `tests/conformance/sequences.test.ts` | `tests/e2e/sequences.spec.ts` | `tests/conformance/sequence-no-landing.test.ts` | `discovery/sequences` |
| HD-14 | Nonfunctional/Common-Tone Atlas | G8 / U10 | `tests/conformance/nonfunctional.test.ts` | `tests/e2e/nonfunctional.spec.ts` | `tests/conformance/nonfunctional-refusals.test.ts` | `discovery/nonfunctional` |
| HD-15 | Chart-to-Practice Lab | G9 / U11 | `tests/conformance/practice-grading.test.ts` | `tests/e2e/practice.spec.ts` | `tests/conformance/practice-invalid.test.ts` | `discovery/practice` |

### 19.3 Browser and artifact matrix

At release time, `docs/RELEASE_EVIDENCE.md` records exact stable browser and OS
versions. Non-waivable automated cells are Playwright Chromium, Firefox, and
WebKit for offline boot, editing, import integrity, keyboard access, Play/Stop,
and console/request cleanliness; Chromium and WebKit touch viewports also run
activation, range, reorder-alternative, drawer, and dialog workflows. Each engine
runs its supported real-`AudioContext` state/bookkeeping suite, while
`OfflineAudioContext` covers signal assertions.

Before the project claims corresponding real-device support, non-waivable manual
cells are current desktop Chrome, Firefox, and Safari audio plus Android Chrome
and iOS Safari touch activation. At least one desktop and one touch device also
complete the listening/usability rubric. Missing hardware narrows the documented
support claim and keeps the full release gate open; an exception may not waive
core playback, import integrity, offline operation, keyboard access, or touch
activation.

The canonical artifact is opened from `file://` and a local HTTP server with the
network interception rule active. Tests reload, restore recovery, export files,
exercise back/forward focus where relevant, and fail on uncaught exception,
unhandled rejection, severe console error, or unexpected request.

### 19.4 Performance budgets

Measured on the documented CI reference runner after warmup:

- standalone artifact: <= 1.5 MiB uncompressed including the compiled atlas;
- interactive blank workspace: <= 1.0 s over local HTTP and <= 1.5 s file-open;
- common command-to-paint: p95 <= 50 ms for a 256-event document;
- quick-entry parse: <= 50 ms for 512 tokens;
- 64-event voicing optimization: target <= 100 ms, hard <= 500 ms;
- scrub/playhead animation: no persistent long tasks over 50 ms;
- recovery serialization/write scheduling: no synchronous task over 50 ms;
- no unbounded node, timer, listener, object-URL, or history growth over the
  repeated-interaction stress suite.
- Continuation Engine: <= 100 ms for an eight-event context and <= 16 displayed
  options after pruning.
- Route Planner: <= 250 ms target, one-second release performance ceiling, and
  <= 50,000 deterministic states; time cannot truncate candidates.
- Constraint Workbench: <= 500 ms release performance ceiling and <= 100,000
  deterministic states; time cannot truncate candidates.
- Tonal Journey: <= 200 ms for a 256-event chart and five returned paths.
- Atlas facet/fingerprint query: <= 50 ms over the full compiled corpus.

Budgets are gates with captured traces/counts, not claims based on code reading.
A slower environment may scale timing thresholds through one documented factor;
functional bounds and leak counts never scale away.

### 19.5 Security and privacy

The application is offline and has no analytics, telemetry, account, cookie,
remote API, or arbitrary URL feature. A restrictive Content Security Policy is
embedded where compatible with standalone inline assets and tested under HTTP;
file-mode limitations are documented. Imported text is never evaluated,
inserted as HTML, used in CSS, or used to construct URLs. JSON parsing is bounded;
objects are decoded into fresh known-shape values so prototype keys are ignored.

Exports occur only after explicit gestures. Diagnostics copied by the user omit
chart text by default and include app version, browser family, state-machine
status, and redacted issue codes. No clipboard read occurs. Dependency licenses
and production transitive packages are inventoried in the artifact report.

### 19.6 Code quality gates

- `bun run typecheck` has zero errors.
- `bun test` and browser suites have zero unexpected skips.
- production bundle has no source TODO/FIXME placeholder for promised behavior.
- duplicate exported identifiers and dependency-boundary violations fail CI.
- generated artifact diff is clean after build.
- `git diff --check` is clean.
- CI's final `git status --porcelain` is empty after the frozen install, build,
  tests, and verification; generated or cache residue is either declared output
  or correctly ignored before release.
- the bug scanner/review pass reports no unresolved critical/high correctness
  finding; accepted lower findings are documented with owner and rationale.
- README, architecture, theory ledger, keyboard help, migration guide, and
  release evidence describe the shipped behavior rather than aspirations.

## 20. Implementation graph and delivery order

### 20.1 Work packages

The Beads graph mirrors these packages. A package is complete only with its
named tests/evidence; later packages depend on public contracts, not unfinished
private code.

| ID | Package | Depends on | Exit evidence |
|---|---|---|---|
| F0 | Toolchain, Preact shell, strict TS, standalone build | — | reproducible blank artifact, denied-network smoke |
| F1 | Domain IDs, pitch, key, rational time, document types | F0 | unit/property tests |
| F2 | Structural v2 decoder, IDs, and validation limits | F1 | adversarial structural decode suite |
| T0 | Symbol grammar, parser, formatter | F1 | grammar goldens and round trips |
| T1 | Resolver, degree spelling, theory corpus/ledger | T0 | independent goldens and mutations |
| F3 | Combined semantic document publication gate | F2, T1 | AST/source/formula/time/voicing semantic suite |
| A0 | Application state, commands, history, selectors | F3 | command/undo integration suite |
| A1 | Recovery persistence and lifecycle | A0 | fake + browser recovery/quota tests |
| C0 | Legacy decoder and deterministic migration report | F3 | all preset/adversarial migration goldens |
| P0 | Exact playback-plan compiler | F3, V0 | timeline, realization, loop, and MIDI-integral plan tests |
| V0 | Voicing candidates and families | T1 | constraint/family corpus |
| V1 | Exact pairwise voice assignment | V0 | exact entering/leaving/common-tone arc tests |
| V2 | Bounded progression voicing optimizer | V1 | Pareto, degradation, bounds/perf tests |
| H0 | Key/context readings and chord-scale options | T1 | evidence-tier rule suite |
| H1 | Transformation/suggestion law registry and transpose | H0, V1 | adversarial laws and round trips |
| G0 | Phrase analysis and multi-hypothesis Tonal Journey | H0 | k-best path, evidence, ambiguity tests |
| G1 | Atlas schema/compiler, provenance, and fingerprints | H1, G0 | deterministic fixture compilation, manifest, and fingerprint goldens |
| G2 | Contextual Continuation Engine | H1, G0, G1, V1 | provider, ordering, staleness, 100 ms tests |
| G3 | Goal-directed Harmonic Route Planner | G2, V1 | endpoint/constraint/search-bound conformance |
| G4 | Constraint Harmonization Workbench engine | G2, V2 | brute-force small-space and conflict tests |
| G5 | Proof-carrying reharmonization branches | G2, A0 | composed-law, nonmutation, patch/undo tests |
| G6 | Guide-tone paths and contextual Color Lab | H0, V0, V1 | path, tension, upper-structure table tests |
| G7 | Cadence/phrase builder, rhythm and tension transforms | G0, H1 | positive/near-miss/exact-time tests |
| G8 | Motif/sequence and nonfunctional transformation atlas | H1, G1 | landing, relation, refusal tests |
| G9 | Deterministic chart-to-practice engine | G1, G2, G5, G6, G7, G8 | finite-answer/seed/grading tests |
| X0 | Persistent audio graph, instruments, voice registry | F0, F1 | fake/offline render and leak tests |
| X1 | Transport state machine and lookahead scheduler | X0, P0 | transition/stale-callback stress suite |
| E0 | JSON and chart-text import/export | F3, T0, C0, A0 | transactional and round-trip suite |
| E1 | MIDI export | P0, V2 | parsed golden SMF suite with progression voicings |
| U0 | Tokens, primitives, responsive app shell | F0, A0 | visual/a11y primitive evidence |
| U1 | Quick entry and lead-sheet chart editor | U0, T0, A0 | keyboard/touch/edit E2E |
| U2 | Chord inspector, piano, annotation, structure | U1, T1, V0, X1 | semantic-edit/manual-note/real-preview E2E |
| U3 | Harmony Lens and transition explanations | U2, H1, V1 | reading/option/motion E2E |
| U4 | Transport UI and audio status | U0, X1 | real-browser control/stress E2E |
| U5 | JSON/text import/export, recovery, document dialogs | U0, A1, E0 | lifecycle/failure E2E |
| U6 | Progression voice-leading workbench | U3, V2 | audition/lock/freeze E2E |
| U7 | MIDI export workflow | U0, E1 | preview/warning/download E2E |
| U8 | Continuation, Atlas, and Tonal Journey UI | U3, G0, G1, G2, D0 | keyboard/a11y/stale/no-result E2E |
| U9 | Route, Constraint, and Reharmonization UI | U8, G3, G4, G5 | constraint/branch/A-B E2E |
| U10 | Guide/color/rhythm/tension/sequence/nonfunctional UI | U8, G6, G7, G8 | discovery workflow E2E |
| U11 | Practice Laboratory UI | U8, G9 | seeded exercise/grading E2E |
| D0 | Reviewed Atlas source corpus and compiled index | G0, G1, G2, P0, X1, E0, U1 | 250 seeds/3,000 variants, independent-review ledger, coverage/provenance/plan/play/export proof |
| D1 | Lessons, practice prompts, palette, help, keyboard guide | G9, U1, D0 | content validation and copy review |
| Q0 | Full regression, accessibility, visual, performance | U3, U4, U5, U6, U7, U8, U9, U10, U11, D1 | complete matrix and reviewed baselines |
| R0 | Docs, generated artifact, license/release evidence | Q0 | clean rebuild and Definition of Done |

### 20.2 Milestone gates

1. **Foundation** — F0-F3, T0-T1. A user can open the offline shell and parse,
   resolve, format, structurally decode, and semantically publish trustworthy
   chord documents without audio.
2. **Reliable studio** — A0-A1, C0, P0, V0, X0-X1, E0, U0-U2, U4-U5. A user can
   author, recover, realize dependable local voicings, and reliably play/stop a
   chart; U5 completes the migrate/import/export JSON/text lifecycle in this gate.
3. **Musical intelligence** — V1, H0-H1, G0-G2, D0, U3, U8. Analysis, Tonal
   Journey, Atlas/fingerprints, explainable Continuation, suggestions, and
   transpose are factual/optional and independently tested against the real
   reviewed corpus.
4. **Advanced craft** — V2, E1, G3-G9, U6-U7, U9-U11, D1 plus the full mobile
   and lesson workflows. Routes, constraint solving, reharmonization, guide/color,
   cadence/rhythm/tension, sequence/nonfunctional tools, practice, progression
   voicing, MIDI, content, and edge-state polish are complete.
5. **Release proof** — Q0-R0. All browser, audio, accessibility, artifact,
   security, performance, and documentation evidence is current.

Foundation contracts may be implemented in parallel only where the table has no
dependency. UI may use typed fixtures while a service is under construction,
but a milestone cannot close against mocks where its exit evidence names the real
service. No “all UI first, wire later” merge is treated as usable progress.

### 20.3 Cutover from the legacy file

The legacy HTML remains untouched until F0 can generate the canonical root
artifact and the audit's baseline evidence is committed/preserved in history.
Then source modules become authoritative and build output replaces
`jazz_chord_progression_editor.html`. Do not keep a second shipped legacy runtime
or compatibility mode. Legacy support exists only at the data importer boundary.

At cutover:

- add root `AGENTS.md` with build/test/generated-file/shared-tree rules;
- replace aspirational README prose with accurate architecture, usage, formats,
  browser support, limitations, and verification commands;
- retain `LEGACY_AUDIT.md` as historical evidence with its base commit hash;
- ensure the release artifact starts with a generated-file banner;
- fail CI when source and artifact diverge.

### 20.4 Beads execution rules

The reviewed plan is converted with `br` into epics and leaf issues using stable
`plan:F0`...`plan:R0` labels. Dependencies follow the table and milestone gates;
no issue depends on its descendant. Each leaf repeats the necessary background,
technical approach, acceptance criteria, test plan, and non-goals so it is
actionable without rereading this entire document.

Work selection uses `bv --robot-*` only, confirms live state with
`br show <id> --json`, claims one coherent ready leaf, and keeps unrelated dirty
work intact. A bead closes only after its own named evidence is green and changes
are actually present; broad downstream gates do not retroactively excuse a leaf's
missing test. Graph changes use `br dep` and are cycle-checked before sync.

## 21. Release Definition of Done

The reimagined application is done only when all of the following are true:

### Product and data

- A blank chart, optional lesson, and every primary authoring workflow are usable
  on desktop and mobile with keyboard/touch alternatives.
- Canonical JSON v2 uses stable IDs, exact measure timing, spelled chord ASTs,
  explicit voicing modes, meter/key/playback settings, and total validation.
- Recovery, dirty/export status, New, lesson load, import confirmation, undo/redo,
  and failure recovery match their written lifecycle contracts.
- Every shipped legacy preset either migrates with an itemized report or receives
  an explicit refusal; no unknown chord defaults to major.

### Theory and musical behavior

- The independent corpus and mutation suite catch every named legacy formula and
  spelling regression.
- Manual/frozen voicings sound/export exactly; automatic families meet declared
  constraints and bounded optimization behavior.
- Analysis separates literal facts, evidence-tier readings, and optional
  suggestions; law checks and wording have completed review.
- Transposition preserves spelling/structure under round-trip laws.
- The Atlas contains at least 250 reviewed seeds and 3,000 deterministic
  validated variants with complete provenance, zero quarantine leakage, and
  passing facet/fingerprint/transpose/play/export gates.
- All fifteen Harmonic Discovery workflows in Section 11.9 ship with visible
  proof/limits, deterministic results, hard-constraint preservation,
  nonmutating preview/search, revision-checked Apply, and named no-result/
  degraded E2E coverage.
- Continuation, Route, Constraint, Branch, Tonal Journey, guide/color,
  cadence/rhythm/tension, sequence/nonfunctional, fingerprint, and practice
  conformance suites meet their stated bounds and independent goldens.

### Audio

- Play, pause, resume, seek, tempo, loop, preview, instrument change, natural end,
  interruption, Stop, and replay satisfy the state machine and stress suite.
- All playback paths use one persistent graph; no stale attack, stuck voice,
  multiplying listener/timer, or graph recreation remains.
- Offline render evidence is safe/non-silent and the recorded human matrix finds
  no release-blocking click, truncation, imbalance, or dishonest timbre label.

### UX and accessibility

- WCAG 2.2 AA target criteria in this plan have automated and manual evidence,
  including keyboard, focus, screen reader, zoom, target size, reduced motion,
  and forced colors.
- Empty, loading/busy, error, unavailable, confirmation, and recovery states are
  designed and tested, not console-only.
- Reviewed visual baselines meet the studio/lead-sheet concept at all named
  viewports without clipping, overlap, hidden primary actions, or hover-only use.

### Engineering and distribution

- All commands in Section 8.3 pass from a clean checkout with pinned lockfile.
- The generated single HTML is within budget, reproducible, and fully functional
  through file and HTTP with all nonlocal requests denied.
- Current browser, audio-listening, performance, license, migration, and release
  evidence is checked in; exceptions are explicit and accepted, not absent cells.
- No production CDN, telemetry, unsafe imported markup, fake placeholder feature,
  unresolved critical/high audit issue, or known data-loss path remains.
- Root README and AGENTS describe the actual shipped system; generated output and
  source are clean and synchronized.
- The Beads dependency graph has no cycle, every implementation leaf is honestly
  closed with evidence, and release epics have no open/blocking descendants.

## 22. Deferred work and decision record

### 22.1 Explicitly deferred

The following are not hidden requirements for the first release:

- collaboration, accounts, cloud sync, analytics, or remote services;
- MusicXML, PDF/notation engraving, MIDI input, microphone input, or audio files;
- arbitrary time-signature changes inside one document;
- section merge import;
- nested repeats, first/second endings, polychord grammar, or publisher-specific
  chart dialects beyond the declared grammar;
- microtonality, triple accidentals, more than seven generated voices, or exact
  orchestral/acoustic instrument sampling;
- unbounded/opaque automatic composition, probabilistic or runtime-AI
  suggestions, or a claim of one correct jazz analysis; bounded law-checked
  generation in Section 11.9 is explicitly in scope;
- plugin architecture or background worker before profiling proves need.

Deferred input is preserved as source-ranged diagnostics or custom chords where
safe; it is never silently approximated. Requests enter a later plan with schema,
interaction, migration, and test implications before implementation.

### 22.2 Decisions fixed by this plan

- Source: modular strict TypeScript/Preact; distribution: generated standalone
  HTML; runtime production dependency: Preact only.
- Musical identity: spelling-first chord AST plus first-class custom chord.
- Time: exact rational beats through playback/MIDI planning.
- State: pure commands with stable IDs; service adapters own effects.
- Persistence: local recovery plus explicit JSON export, not a false Save claim.
- Audio: one lazy persistent Web Audio graph, generation-owned scheduling, strict
  Stop guarantee, honest synthesized instruments.
- Intelligence: literal facts, evidence-tier readings, proof-carrying laws,
  validated corpora, bounded deterministic search, plural options, and zero
  runtime AI.
- Delivery: dependency-gated Beads graph and evidence-based closure.

Any change to those decisions requires an amendment here, impact analysis across
the graph, and updated tests before code lands. This document is therefore both
the implementation contract and the standard against which the final fresh-eyes
audit judges the rebuilt application.
