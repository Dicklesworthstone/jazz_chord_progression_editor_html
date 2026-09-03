# U2 Chord Inspector Contract

Status: proposed independent specification packet — no production
implementation, no UI completion, no human acceptance, and no expert review
is claimed.

Package: U2 (`jcpe-milestone-reliable-studio-l3a.11.1`), Reliable Studio
milestone. Depends on accepted/closed authorities: U0 (accessible primitives),
U1 (chart editing & selection), T0 (chord grammar), T1 (resolution & spelling),
V0 (voicing candidates), and X1 (serialized transport & Stop guarantee).

This document, the code-facing module
`src/ui/studio/u2-chord-inspector-contract.ts`, the fixtures under
`tests/fixtures/chord-inspector/`, and the independent validator
`scripts/validate-u2-contract.ts` are the complete authority for `U2/build`.
Another agent must be able to implement the package from this packet without
consulting the markdown plan.

Pinned identities: contract schema
`changes.ui.u2-chord-inspector-contract.v1`; policy
`changes.u2-chord-inspector` version 1; fixture manifest schema
`changes.fixtures.u2-chord-inspector-contract.v1`.

---

## 1. Boundary and Architecture Invariants

U2 is the Chord Inspector surface: the progressive 7-section detail panel,
interactive MIDI coordinate piano, voicing mode manager, structured chord
editor, annotation sanitizer, and isolated chord preview orchestrator.

Key architectural invariants:

1. **Pure Presentation & Intent Dispatch**:
   The Inspector component computes only presentation (layout, tab selection,
   draft state, keyboard geometry). It dispatches application intents; it never
   directly mutates application state, audio graphs, or storage adapters.
2. **Draft / Commit Isolation**:
   Editing in the inspector operates on a local draft. Structural edits are
   synchronized with the draft symbol text and committed only when yielding a
   valid semantic chord. Unsupported/custom source text is never overwritten
   by a guessed canonical symbol.
3. **Exact Musical & Pitch Semantics**:
   Manual and frozen voicings preserve exact spelled pitches and MIDI note
   numbers without silent normalization or truncation.
4. **Isolated Audio Preview**:
   Chord preview sounds through the real X1 preview channel with an isolated
   generation ID. It mutates neither the document, active selection, undo
   history, nor the transport playhead.
5. **Accessibility First**:
   All interactive elements (tabs, structured buttons, piano keys) support
   complete keyboard navigation (Tab/Arrows/Roving focus) and provide accessible
   text/ARIA descriptions (including accessible list alternatives for the piano).

---

## 2. Progressive Disclosure: The 7 Sections

The inspector organizes chord information into 7 progressive tabs:

### 2.1 Symbol Tab (`symbol`)
- **Source text**: The raw text entered by the user.
- **Canonical text**: T0-formatted canonical representation (or null if syntax invalid / custom).
- **Diagnostics**: Syntax errors or warnings from T0 chord grammar.
- **Custom chord handling**: If unrecognized by T1 grammar, flagged as `isCustomUnrecognized`. Custom text is preserved verbatim.

### 2.2 Structure Tab (`structure`)
- **Root & Bass**: Spelled root pitch, optional slash bass pitch.
- **Quality**: Human-readable quality name derived from T1 resolution.
- **Degrees & Pitch Classes**: Spelled scale degrees (1, 3, 5, 7, 9, 11, 13, etc.), pitch classes (0..11), role tags.
- **Alterations & Additions**: Explicit alterations (b5, #5, b9, #9, #11, b13) and additions (add9, 6).
- **Omissions**: Explicit omitted degrees (no3, no5).

### 2.3 Timing Tab (`timing`)
- **Duration**: Exact rational duration (e.g. 4/4, 2/4, 1/2).
- **Measure Placement**: Measure index, ordinal (1-based), start beat, offset in measure.
- **Measure Completeness**: Indicator if the current measure is complete or needs fill/split.

### 2.4 Voicing Tab (`voicing`)
- **Voicing Mode**: One of `auto`, `manual`, `frozen`.
- **Family**: V0 voicing family (`drop-2`, `drop-3`, `rootless-a`, `rootless-b`, `quartal`, `cluster`, `open-spread`, etc.).
- **Pitches**: Spelled pitches, MIDI note numbers, and pitch classes.
- **Mode Transitions**:
  - `Auto -> Manual`: Copies currently synthesized pitches into editable manual pitches.
  - `Manual -> Auto`: Requires user confirmation (`confirmDiscardManual: true`) to discard manual overrides.
  - `Auto -> Frozen` / `Manual -> Frozen`: Freezes current pitches against progression-level re-voicing.
- **Unison & Octave Laws**:
  - Exact duplicate unison notes (same MIDI number) are rejected (`u2.manual_voicing_unison_duplicate`).
  - Octave doublings (same pitch class in different octaves) are permitted.

### 2.5 Harmony Tab (`harmony`)
- **Quality Category**: Major, Minor, Dominant, Half-Diminished, Diminished, Augmented, Suspended, Altered.
- **Guide Tones**: The defining 3rd and 7th degrees.
- **Tensions & Color**: Available tensions and characteristic modal colors.
- **Scale Suggestions**: Recommended improvisation / chord-scale options.
- **Functional Analysis**: Roman numeral and tonal function in active key context.

### 2.6 Motion Tab (`motion`)
- **Voice Leading Paths**: Pitch-by-pitch intervals between previous chord and current chord, and to next chord.
- **Classification**: Common tones (0 semitones), stepwise motion (1-2 semitones), skips (3-4 semitones), leaps (>4 semitones).
- **Voice Metrics**: Count of common tones and stepwise connections.

### 2.7 Notes / Annotation Tab (`notes`)
- **User Annotation**: Freeform textual notes associated with the chord event.
- **Sanitization Law (`L-MARKUP-01`)**: All HTML markup and control characters are strictly sanitized/escaped before rendering; malformed markup is treated as inert plain text.
- **Length Bounds**: Capped at `MAX_ANNOTATION_CODE_POINTS` (500 code points).

---

## 3. Interactive Piano Keyboard

The interactive piano provides an authentic, accessible MIDI coordinate visualizer:

1. **Geometry & Key Mapping**:
   - Spans 88 keys (`PIANO_MIN_MIDI` = 21 / A0 to `PIANO_MAX_MIDI` = 108 / C8).
   - Default visible viewport focuses on the core harmonic register (`PIANO_DEFAULT_VISIBLE_MIN_MIDI` = 36 / C2 to `PIANO_DEFAULT_VISIBLE_MAX_MIDI` = 84 / C6).
   - Accurate white and black key layout (`L-PIANO-01`).
2. **Visual Role Indicators**:
   - `root`: Distinct root highlight (e.g. accent color).
   - `guide-third`, `guide-seventh`: Primary guide tone badges.
   - `tension`: Upper extension markers (9, 11, 13).
   - `bass`: Bass note indicator (for slash chords).
   - `color`: Modal/color additions.
3. **Manual Note Editing**:
   - In `manual` mode, clicking/activating a key toggles the note in the active voicing.
   - Enforces `MIN_MANUAL_VOICING_NOTES` (1) and `MAX_MANUAL_VOICING_NOTES` (12).
4. **Accessible Navigation**:
   - Roving tabindex across piano keys with Left/Right arrow navigation.
   - Screen-reader text announcements for key names (e.g., "C4, Root", "F#4, Sharp 11 Tension").
   - Semantic accessible list alternative.

---

## 4. Isolated Audio Preview

Chord preview is mediated through the application audio ports:

1. **Generation-Bound Preview**:
   - Pressing preview emits `preview-press-down` with the active pitches.
   - X1 allocates a single-use preview generation ID.
2. **Zero Side Effects**:
   - Preview does not advance the timeline playhead.
   - Preview does not alter document selection or create history undo records.
3. **Stop & Release Safety**:
   - Releasing the key/button emits `preview-release`, ramping down voices cleanly.
   - If global transport Stop is triggered, active preview is retired immediately alongside playback.

---

## 5. Traceability to Legacy Regressions

| Legacy Defect | Defect Description | U2 Prevention Invariant | Test Trace ID |
|---|---|---|---|
| `L-RUNTIME-02` | Preview argument/notes mismatch | Exact voiced pitch array passed directly to preview adapter | `U2-TRACE-PREVIEW-ARG` |
| `L-THEORY-03` | Displayed alterations do not alter notes | Structural alterations directly re-resolve degrees and synthesized pitches | `U2-TRACE-ALTERATION-SYNC` |
| `L-PIANO-01` | Octave geometry / flats incorrect | Strict MIDI-to-pitch-class geometry and canonical flat/sharp spellings | `U2-TRACE-PIANO-GEOMETRY` |
| `L-MARKUP-01` | Annotation markup malformed / unsafe | Strict plain-text sanitization; zero raw HTML injection | `U2-TRACE-ANNOTATION-SAFETY` |
