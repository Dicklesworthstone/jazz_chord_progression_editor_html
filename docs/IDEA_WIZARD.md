# Product Idea Wizard: Breadth, Scoring, and Selection

Status: completed phases 1-4  
Date: 2026-07-11

## Grounding

The ideation pass followed repository archaeology, runtime reproduction, the
legacy audit, a review of the empty initial Beads backlog, and selective mining
of implemented/tested chord material in `music_theory_data_tool`.

Ideas were scored from 1-5 for robustness, reliability, performance,
intuitiveness, user friendliness, ergonomics, usefulness, compelling value,
accretive value, and pragmatism. Usefulness and pragmatism receive 2x weight;
accretive value receives 1.5x. Ties are resolved by dependency value and synergy.

No candidate adds a backend, accounts, cloud collaboration, or generative AI.

## Thirty candidates

Legend: Rb robust, Rel reliable, Pf performant, Int intuitive, UF user-friendly,
Erg ergonomic, Use useful, Cmp compelling, Acc accretive, Prg pragmatic, W
weighted score.

| # | Idea | Rb | Rel | Pf | Int | UF | Erg | Use | Cmp | Acc | Prg | W |
|---:|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1 | Canonical spelling-first chord AST/parser | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.84 |
| 2 | Bar-grid timeline with meter and per-chord beats | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.84 |
| 3 | Undo/redo plus crash-safe local autosave/history | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 4.84 |
| 4 | Function- and spelling-preserving transpose | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4.76 |
| 5 | Visual voice-leading workbench | 4 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.68 |
| 6 | Deterministic playback transport | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 5 | 4 | 4.68 |
| 7 | Jazz voicing-family menu | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.68 |
| 8 | Key/Roman/function analysis overlay | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 4.68 |
| 9 | Keyboard-first editing and command palette | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4.68 |
| 10 | Accessibility-first interaction pass | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 4 | 5 | 4 | 4.68 |
| 11 | Context-aware palette, recents, and favorites | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 5 | 4.64 |
| 12 | Lead-sheet text entry and round-trip | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4.60 |
| 13 | Chord inspector: tones, tensions, scales | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4.60 |
| 14 | Loop range, count-in, and metronome | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 5 | 4.56 |
| 15 | Rule-based reharmonization option menu | 4 | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 4.52 |
| 16 | Progression lint/validation panel | 4 | 5 | 5 | 4 | 5 | 4 | 5 | 4 | 5 | 4 | 4.52 |
| 17 | Linked sections, repeats, and alternate endings | 4 | 4 | 5 | 4 | 4 | 5 | 5 | 4 | 5 | 4 | 4.44 |
| 18 | Instrument/range-aware voicing presets | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4.40 |
| 19 | Standard MIDI export | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4 | 4.40 |
| 20 | Beginner/expert progressive disclosure | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4.40 |
| 21 | Backend-free shareable URL/clipboard bundle | 4 | 4 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | 4.40 |
| 22 | Versioned import/export schema and migrations | 5 | 5 | 5 | 3 | 4 | 4 | 5 | 3 | 5 | 4 | 4.36 |
| 23 | A/B progression branches and audition | 4 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | 4 | 3 | 4.32 |
| 24 | Printable lead-sheet export | 4 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 4 | 4 | 4.32 |
| 25 | Swing/comping rhythm templates | 4 | 4 | 4 | 4 | 5 | 4 | 5 | 5 | 5 | 3 | 4.28 |
| 26 | Mobile-first chord editing bottom sheet | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 4 | 4 | 3 | 4.24 |
| 27 | Modular TypeScript core plus property tests | 5 | 5 | 4 | 3 | 4 | 4 | 5 | 3 | 5 | 3 | 4.12 |
| 28 | Voicing-delta heatmap | 4 | 4 | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 3.92 |
| 29 | MIDI keyboard chord capture | 3 | 4 | 4 | 4 | 4 | 5 | 4 | 4 | 4 | 3 | 3.84 |
| 30 | Long-chart rendering virtualization/cache | 4 | 4 | 5 | 3 | 3 | 3 | 3 | 2 | 4 | 4 | 3.52 |

## Selected top five

### 1. Canonical spelling-first chord AST/parser

Replace suffix parsing, boolean alteration flags, stored display names, and
pitch-class-normalized spelling with one typed chord object. Every editor,
renderer, analyzer, transposer, importer, voicer, and audio path consumes it.

This prevents the observed C9/C13 and G-sharp/A-flat error classes and enables
nearly every other selected idea. It is pure, bounded, and testable through
goldens, properties, and parse/format idempotence.

### 2. Bar-grid timeline with meter and per-chord beats

Replace “one chord equals one global duration in seconds” with sections,
measures, chord events, and beat duration. Users see and edit harmonic rhythm.
Playback, looping, quick entry, MIDI, printing, and future repeats share the same
timeline.

This is the change that makes the product a progression editor rather than a
chord-list player.

### 3. Undo/redo plus crash-safe local history

Record every edit as a reversible command or bounded snapshot, autosave locally,
recover after reload, and label undo/redo actions musically. Experimentation
becomes safe without adding a backend.

### 4. Function- and spelling-preserving transpose

Transpose a chord, range, section, or document while preserving diatonic letter
spelling, slash-bass meaning, quality, colors, timing, annotations, and optional
manual-voicing shape. Transpose/inverse-transpose is an unusually strong
metamorphic correctness gate.

### 5. Visual voice-leading workbench

Show voice strands, common tones, leaps, and multiple non-dominated voicing
candidates. Let users audition and lock voices rather than accepting an opaque
choice. This turns the application's claimed differentiator into a visible,
teachable workflow.

## Selected next ten

6. **Deterministic playback transport** — one scheduler, explicit note IDs,
   note-off-before-note-on ordering, seek-safe rescheduling, and guaranteed
   all-notes-off.
7. **Jazz voicing-family menu** — shell, guide-tone, rootless A/B, drop-2,
   close/open, quartal, and upper-structure candidates that remain user-visible.
8. **Key/Roman/function overlay** — multiple evidence-bearing contextual
   readings stored separately from literal chord identity.
9. **Keyboard-first editing and command palette** — insertion, movement,
   duration, audition, transpose, and history without modal traversal.
10. **Accessibility-first interaction** — semantic controls, focus management,
    drag alternatives, screen-reader summaries, contrast, and reduced motion.
11. **Context-aware palette, recents, and favorites** — deterministic filters
    and user history, never an opaque recommendation model.
12. **Lead-sheet text entry and round-trip** — fast bar-delimited input with
    token-level diagnostics and canonical serialization.
13. **Chord inspector** — spelled tones, guide tones, tensions, clashes,
    compatible scale options, bass status, and actual realized voicing.
14. **Loop range, count-in, and metronome** — a practice workflow built on the
    shared beat timeline and transport.
15. **Rule-based reharmonization option menu** — explicit substitution devices,
    derivation, voice-leading costs, preview, and user-owned application.

## Overlap and scope decision

The initial Beads backlog was empty, so no idea duplicated existing tracker
work. All top fifteen are represented in `docs/REBUILD_PLAN.md` as core
architecture or product requirements.

Lower-ranked ideas are handled as follows:

- Progression lint, range-aware policies, MIDI export, progressive disclosure,
  mobile editing, schema migration, and modular/property-tested source are
  required supporting work because selected ideas depend on them.
- Repeats/alternate endings, shareable URL bundles, A/B branches, printable
  export, rhythm templates, heatmaps, MIDI input, and virtualization are deferred
  until the rebuilt core passes its release gates.
- Deferral does not permit hidden architecture blockers: stable IDs, timeline,
  export adapters, and selectors should leave clean future seams.

