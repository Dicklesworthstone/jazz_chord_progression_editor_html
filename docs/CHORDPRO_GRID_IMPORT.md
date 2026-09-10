# ChordPro grid import, version 1

CC4 (`jcpe-6ujg.9`). An explicitly limited ChordPro jazz-grid reader, not a
claim of general ChordPro, iReal Pro, lyric-chart, or proprietary compatibility.
It adds one song as a new section through one ordinary undoable document command.
No runtime dependencies or network access.

## Authority and interpretation

Reviewed 2026-09-10: [official grid specification](https://www.chordpro.org/chordpro/directives-env_grid/),
[time](https://www.chordpro.org/chordpro/directives-time/),
[tempo](https://www.chordpro.org/chordpro/directives-tempo/), and
[title](https://www.chordpro.org/chordpro/directives-title/).
Grid shape is a layout property, not an exact musical-time encoding. Therefore
Changes requires explicit acknowledgement of this import interpretation:
**4/4, one quarter-note beat per cell, dots continue the previous chord within
the bar, `/` starts another occurrence of the previous chord, and `% . . .`
copies the previous complete bar.** Chords receive Balanced Auto voicing; source
files contain no exact voicing or performance. This interpretation is displayed
before Add, never silently inferred as an authoritative ChordPro playback law.

## Closed input vocabulary

UTF-8 text, optional initial BOM, LF or CRLF. Blank lines and whole lines beginning
`#` are counted and disclosed as omitted comments. No executable markup, includes,
configuration, remote content, lyrics, multiple songs, or unknown directives.
One nonempty `{title: ...}` or `{t: ...}`, one `{time: 4/4}`, and optional one
`{tempo: N}` (integer 20–400) must precede exactly one grid. Title is preserved as
the new section name (1–256 code points, no control characters). The current
chart title stays unchanged. Explicit tempo must equal the destination chart's
tempo; missing tempo is disclosed as using the current chart tempo. The destination
must be 4/4. Never change global tempo/meter or existing music to accommodate import.

Grid delimiters: `{start_of_grid}`, `{sog}`, or either with `: N` / `: Mx4`, or
`shape="N"` / `shape="Mx4"`. N is 4, 8, 12, or 16; M is 1–4. Omitted shape is
16 cells. End is `{end_of_grid}` or `{eog}`. Margin text, labels, and other
properties are refused. Shape bounds each line; it does not create silent bars.

Each grid line has leading and trailing barlines, whitespace-separated tokens,
and 1–4 complete bars of exactly four cells each. Accepted non-repeating barlines
are `|`, `||`, and `|.`. A final `|.` must be the final token on that line.
Chord cells are exact symbols accepted by Changes' existing spelling-first T0
parser, at most 64 code points. They are never converted by suffix heuristics.
A dot after a chord extends that event by one exact quarter beat. A leading dot
is ambiguous and refuses, including all-dot bars. A slash repeats the most recent
chord (including the previous bar's last chord), starting a distinct event.
A slash without a predecessor refuses. `% . . .` expands the immediately previous
bar once, with independent later IDs and identical spelling, duration and attacks;
its first occurrence without a predecessor refuses. Consecutive `%` bars remain
linear and bounded. Two-bar repeats `%%`, repeat barlines, voltas, strum lines,
`~` subdivisions, time/tempo changes, unknown chords and partial bars refuse.
No partial candidate is returned on any error; report the first offending line.

## Bounded work and retained state

Before splitting or encoding: source UTF-16 length ≤16,384. UTF-8 ≤16,384 bytes;
≤512 lines; each line ≤1,024 UTF-16 units; ≤2,048 non-directive grid tokens;
≤128 expanded bars and ≤512 events. Each chord token delegates once to bounded
T0. Repeat copying is at most four events per bar; no recursive expansion. Results
include bytes, visited lines, tokens, symbol delegations, expanded bars, events and
termination (`complete` or `refused`). Logical retained state is bounded by input,
128 bars, 512 events and a single first diagnostic; no wall-clock cutoff.

## Application and UI laws

Paste and file input share the same inert decoder. Check File.size before reading
and recheck actual UTF-8 bytes afterward; fatal UTF-8 decoding. Replacing text,
selecting another file, closing the tool or editing the destination invalidates
pending reads and previews. Capture document ID/revision before async file reads;
a completion may not bind itself to a newer chart. Add recomputes the source and
checks source identity, tempo/meter and the explicit interpretation acknowledgement.
Use one section insertion command, fresh section/measure/event IDs, exact complete
bars, no key override and a reset voice-leading boundary. Domain validation remains
authoritative; limits or identity failures leave document/history unchanged.
One Undo restores the entire previous document; Redo restores the same new IDs.
Preview allocates no IDs, plays no sound and changes no document or Quick entry.
The UI exposes full expanded bar/event spellings and quarter durations with bounded
pagination, source title, source/current tempo, omitted comment count, Add and Close.
Strings render as text. Import does not mark a JSON backup as saved.

## Independent fixtures and gates

`tests/fixtures/chordpro-grid/*.crd` are original, permitted, actual ChordPro-format
files authored for this project, not copied songs. `cases.json` contains hand
transcriptions fixed before the decoder. `PROVENANCE.md` records authorship and
reference limits. No external renderer compatibility claim is made without a
separate reference-tool run. Fixture validation must establish every bar sums to
four exact quarters, expected repeat identity and explicit rearticulation.

Required build proof: literal positive/negative and enharmonic/transposed examples,
all bounds, mutation witnesses for dot duration, slash occurrence, repeat spelling
and unsupported-directive refusal; file race/staleness and atomic Add/Undo/Redo;
RCH focused tests, typecheck, touched lint, source-policy and guarded build; real
Chromium/Firefox/WebKit file/paste, preview, Add/Undo/Redo, native JSON download,
320px/desktop, light/dark, accessibility, no network/console/page errors. Bind every
browser receipt to the exact artifact. Independent reference-tool/user songbook
review remains the verify leaf; do not claim it from self-authored fixtures.
