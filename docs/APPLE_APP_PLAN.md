# FrankenJazz Apple App Plan

Status: implementation baseline, reviewed against the live TypeScript source on
2026-08-30. The web README still describes an earlier checkpoint; this plan is
based on the current application, theory, playback, audio, export, and library
modules.

## Product promise

FrankenJazz is a private, offline lead-sheet studio for iPhone, iPad, and Mac.
It should make a progression quick to type, satisfying to hear, and useful to
understand. The Apple app is a native sibling of Changes, not a web wrapper and
not a visual mock of its controls.

The first Apple release must let a musician:

1. type or paste a bar-delimited chart, directly duplicate/delete/reorder
   changes and insert/delete bars, and see a real parsed lead sheet;
2. select a chord and inspect literal tones, function, guide tones, and several
   playable voicing families;
3. hear the chart with a local generated instrument, tempo, swing, loop, seek,
   pause, and Stop that actually stop sound;
4. begin from the complete 27-entry reviewed web library—including the four
   explicitly owner-directed transcriptions—plus two native original studies;
5. transpose without flattening every accidental spelling;
6. recover work locally and import/export portable JSON, chart text, and a real
   Standard MIDI File;
7. use the same document comfortably on a phone, in an iPad split workspace,
   or in a freely resizable Mac window.

There is no account, analytics, telemetry, model call, cloud storage, remote
font, remote sample, or runtime network dependency. Imported chart text is
parsed as data and never interpreted as HTML or a URL.

## Source capability map

| Live source contract | Native surface |
| --- | --- |
| `studio-progression-library.ts` | All 27 stable web-library IDs, charts, provenance classes, canonical tempos/styles, plus two additive native studies |
| `chart-parser.ts` / `chord-symbol.ts` | Bounded native quick-entry and exact suffix grammar; octave-aware 9th/11th/13th/altered intervals feed the same inspector, playback, and MIDI authority |
| `studio-controller.ts` | `JazzStudioStore`, one observable owner for document/history/selection |
| U1 chart-editing operations | Undoable direct symbol editing plus selected-change and bar actions with exact four-beat preservation; a rename explicitly clears stored pitches or converts them to intentional Manual authority |
| domain pitch/key/duration types | Codable value types with stable UUID identities and exact bar slots |
| voicing family and optimizer modules | Close, shell, rootless, open, and spread voicing previews |
| chord resolution / chart analysis | Literal tones, Roman reading, guide tones, and transition motion |
| playback-plan contracts | Immutable compiled events before audio or MIDI delivery |
| persistent Web Audio graph | One persistent `AVAudioEngine`, generated PCM, owned playback generation |
| M0/M1 MIDI import doctrine | Bounded SMF 0/1 decoding; accepted named cells retain their exact MIDI stack as editable Manual voicings, conventional DAW note-state quirks are repaired into a reported salvage ledger, and structural corruption still refuses |
| JSON/text/MIDI exporters | Real files delivered through the system share/export sheet |
| recovery lifecycle | Atomic Application Support JSON with current and previous valid envelopes |

The web project contains much deeper deterministic research workflows (route
planning, constraint harmonization, reharmonization branches, tonal journey,
practice generation, and the compiled Atlas). Those are not represented by
nonfunctional buttons in release one. Their future native port must consume the
same deterministic rules and proof metadata, with results labeled as literal,
contextual, or optional exactly as the web architecture requires.

## Adaptive experience

### iPhone

- A focused Studio screen: compact identity, chart canvas, quick-entry field,
  and persistent transport.
- Selecting a chord opens a bottom sheet with harmony and voicing controls.
- Library and document actions are full-screen sheets with large targets.
- No default horizontal scrolling and no control label wrapping.

### iPad

- A three-column split where width permits: library, chart/editor, harmony.
- Portrait collapses intelligently to library plus detail; the transport stays
  visible without forcing the full workspace to scroll.
- Keyboard shortcuts and pointer affordances augment, never replace, touch.

### Mac Catalyst

- A normal freely resizable window, minimum 860 by 600, no artificial maximum.
- Library sidebar, central chart, and inspector use available width rather than
  a phone-shaped fixed card.
- Native menus expose New, Open, Save Copy, Undo/Redo, Play/Pause, Stop,
  Transpose, and inspector visibility with discoverable shortcuts.

## Visual system

The mood is a premium late-night rehearsal room crossed with a restrained
electrical laboratory: ink-blue black, warm paper, brass gold, emerald current,
cyan analysis, and coral refusal. Rounded display type is limited to identity
and controls; chart and explanation typography prioritize reading. The cute
monster-family icon carries a large uniform `J` badge and a glowing piano/chord
motif. Motion follows musical time and respects Reduce Motion.

## Acceptance gates

- iPhone simulator: edit, select, play, seek, stop, library load, transpose,
  export, relaunch recovery, Dynamic Type, and portrait/landscape screenshots.
- iPad simulator: portrait and landscape split behavior with no clipped primary
  actions, plus keyboard/pointer basics.
- Mac Catalyst: build, launch, resize from minimum through wide layout, menus,
  file open/export, and legible typography.
- Unit tests: golden library inventory, every bundled chart parsing and reaching
  playable MIDI pitches, 6/9 quality versus slash-bass parsing, distinct groove
  rendering, voicing, transposition, MIDI header/timing, recovery round trip,
  and hostile/oversized import refusal.
- Fresh-eyes source review, `git diff --check`, changed-file bug scan, and clean
  generated-project rebuild before the tracked task closes.
