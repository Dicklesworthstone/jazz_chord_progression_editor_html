repo: Dicklesworthstone/jazz_chord_progression_editor_html
branch: main
site: https://jazzchords.org/

## Last sync
date: 2026-08-04T07:05:00Z
note: read-only study of the source; no code was copied back. Redesign authored fresh as a Design Component.

### Updated in this project
- New visual identity: ink-on-paper lead sheet (ivory page on a linen desk) replacing the dark Blue Note shell. Annotation colours carry meaning — red pencil for playback, blue pencil for analysis and selection. Archivo + Literata.
- Single chart-first workspace replacing the three-rail shell (Library rail / ChartWorkspace / Harmony Lens); the chart is engraved with real barlines, four bars per system, slash marks and bar numbers.
- Chord entry moved onto the chart: inline typing, a root+quality keypad, and a ⌘K chart-text lane — three routes, one chart.
- Transport rebuilt: scrub line with loop region, prev/next chord, tempo stepper, groove and instrument in reach.
- Analysis surfaced three ways: roman numerals under every bar, pencilled phrase brackets under each system (ii–V–I, ii–V, tritone subs, turnarounds, dominant chains — labelled with their target key), and a summonable chord detail panel (notes, two-octave keyboard, scale, guide tones, guide-tone motion into the next chord, continuations).
- Playback reads as motion: a red playhead sweeps continuously through the sounding bar rather than stepping between highlights.
- Drag reorders MEASURES, not loose chords: a bar carries its whole chord bundle, neighbours spring out of the way, and the dropped measure settles into place (one undoable step). Works in both Sheet and Edit views.
- Bundles can be broken and made: a caesura cut mark on the dashed intra-bar line separates a shared measure into one bar per chord; a tie mark on the barline joins a measure with the next (up to 4 chords).
- Persistent desktop rails: left rail (chord palette, standard progressions, MIDI/chart-text import) from 1280px up; right rail (chord detail) always on from 820px up. Below that, both collapse to sheets.
- MIDI import is real: a standard-MIDI-file parser reads note events, quantises to bars, and names chords by best-fit against the quality table (honest about being a guess).
- Audio: persistent bus with an AnalyserNode. Volume slider + mute in the transport, live spectrum (full on wide screens, compact strip below 1180px and on mobile), and hover-to-hear on every note and piano key in the chord panel.
- Chord panel gains a computed harmonic spectrum drawn DAW-style on a dark inset, with octave grid, labelled fundamentals, and the hovered note's own harmonic series lit in blue.
- Light/paper and dark/night themes from one token set, persisted to localStorage, defaulting to the OS preference. Piano keys keep real key colours in both.
- Four-step tutorial (auto-shown on first visit, reachable from the ? button or the ? key) illustrated with real UI fragments rather than icons.

## Screen map
| Screen / surface | Built from (read) |
|---|---|
| Studio shell, header, workspace (`Jazz Studio v2.dc.html`) | src/ui/studio/StudioShell.tsx, StudioHeader.tsx |
| Chart (sheet + edit views) | src/ui/studio/ChartWorkspace.tsx (structure), screenshot.png |
| Chord entry (inline, keypad, command bar) | src/ui/studio/LibraryPanel.tsx (quick entry, palette, demos, library) |
| Chord detail (`Chord Detail.dc.html`) | src/ui/studio/HarmonyLens.tsx |
| Transport dock | src/ui/studio/TransportBar.tsx |
| Palette / type / tokens (superseded) | src/styles/tokens.css |
| Feature and copy inventory | README.md, docs/U0_UI_CONTRACT.md |
