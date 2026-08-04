# E1 Deterministic MIDI Export Contract

Status: reviewed implementation handoff for `E1/spec`
(`jcpe-milestone-advanced-craft-ulj.2.1`). This document, the public module
`src/export/midi-export-contract.ts`, the fixtures under
`tests/fixtures/midi-export/`, and the independent validator
`scripts/validate-e1-contract.ts` are the complete authority for `E1/build`.
No production SMF writer exists yet; every golden byte in the fixtures was
hand-assembled from this document and is re-parsed by the validator's own
minimal SMF reader.

Pinned identities: contract schema `changes.export.midi-export-contract.v1`;
writer `changes.midi-export` version 1 (tag `changes.midi-export.v1`);
request/result/report/marker schemas as in the module.

## 1. Ownership and boundary

E1 lives in the `export` layer (imports allowed: `domain`, `playback`,
`theory`). Its single operation `exportMidi(request)` is pure and
synchronous: one finished P0 `PlaybackPlan` in, SMF bytes plus a report out.
The plan's pitches are already the realized V0/V2 voicings projected by P0
(`midiPitches` index-aligned with spelled `pitches`); E1 never reparses
chord symbols, never revoices, never re-quantizes, and never generates or
selects candidates. Marker text arrives explicitly on the request, bound to
plan event ids; E1 never derives text from musical analysis. The export
layer never touches the network and never creates object URLs — download
wiring and URL revocation belong to the application/UI layers
(`MIDI_EXPORT_FILENAME_POLICY.objectUrlOwnership`).

## 2. Request

`MidiExportRequest` carries the writer pins, a request id matching
`^[A-Za-z0-9._-]{1,128}$`, the `documentId` that must equal
`plan.sourceDocumentId` (`midi.document_mismatch` otherwise), a
non-negative integer `sourceRevision` echoed into the report (staleness is
the caller's revision discipline; a mismatched pairing refuses rather than
exporting stale state), three text fields (`title`, `voicingTrackName`,
`instrumentName`), the marker list, and the plan.

Text law (`midi.text_invalid`): UTF-8, 1..96 bytes, no ASCII control
characters (0x00-0x1F, 0x7F). Text is emitted verbatim as meta payload
bytes; it is never parsed, evaluated, inserted as markup, or turned into a
URL.

Markers: at most `MAX_MIDI_EXPORT_MARKERS`; each names an existing plan
event (`midi.marker_unbound`) and a kind (`section` | `chord`); duplicate
(kind, eventId) pairs refuse (`midi.marker_duplicate`). A marker's tick is
its bound event's `startTick`.

Plan validation (E1 re-checks only what byte emission depends on, in
`MIDI_EXPORT_VALIDATION_PRECEDENCE` order): plan schema and all P0
compiler/policy pins exact (`midi.plan_invalid`); `midiPpq` exactly 960;
integer `tempoBpm` in 20..400 (`midi.tempo_invalid`); meter with
`beatsPerBar` 1..255 and `beatUnit` a power of two in 1..32
(`midi.meter_invalid`); events sorted by nondecreasing `startTick` with
ordinals 0.. (`midi.event_order_invalid`); every `midiPitches` entry an
integer 0..127 (`midi.pitch_out_of_range`); every `gateDurationTicks`
integer with `1 <= gate <= durationTicks` and every tick field a
non-negative integer with `startTick + durationTicks <= totalTicks`
(`midi.gate_invalid`); event count and total note count within
`MAX_MIDI_EXPORT_EVENTS` / `MAX_MIDI_EXPORT_NOTES` (`midi.plan_invalid`).

## 3. The byte model

All multi-byte integers are big-endian. Variable-length quantities use the
standard 7-bit continuation encoding, most significant group first, at most
four bytes; any delta above `MAX_MIDI_EXPORT_VLQ_VALUE` (0x0FFFFFFF)
refuses `midi.vlq_overflow` — silent clamping is forbidden.

Header chunk: `4D 54 68 64`, length 6, format 1, ntrks 2, division 960.

Track chunks: `4D 54 72 6B` + 32-bit length + events. Exactly two tracks:

**Track 0 (conductor)** — meta events only, in this order:

| Tick | Event | Payload |
|---|---|---|
| 0 | track name (FF 03) | `title` bytes |
| 0 | set tempo (FF 51 03) | `round(60_000_000 / tempoBpm)` as 3 bytes |
| 0 | time signature (FF 58 04) | `beatsPerBar`, `log2(beatUnit)`, 24, 8 |
| event ticks | markers (FF 06) | marker text bytes |
| totalTicks | end of track (FF 2F 00) | — |

Markers sort by ascending tick; at an equal tick, `section` before
`chord`; among equal-kind markers at an equal tick, ascending bound-event
`ordinal`.

**Track 1 (voicing)** — at tick 0: track name (FF 03, `voicingTrackName`)
then instrument name (FF 04, `instrumentName`); then, for every plan
event, one note-on (status 0x90, channel 0, velocity 96) per `midiPitches`
entry at `startTick` and one note-off (status 0x80, channel 0, velocity 0)
at `startTick + gateDurationTicks`; end of track at `totalTicks`.

Channel-event ordering (`MIDI_EXPORT_EVENT_ORDER`): ascending tick; at an
equal tick, meta before channel, note-offs before note-ons, then ascending
note number within each kind. A duplicated note number inside one event's
`midiPitches` refuses `midi.plan_invalid` (P0 plans are duplicate-free by
construction, so this is a defensive law, not a repair). Overlapping notes
of the same number from *different* events are legal SMF; the off precedes
the on at a shared tick by the ordering law.

Running status (`MIDI_EXPORT_RUNNING_STATUS_POLICY`): a channel message
omits its status byte exactly when the previously emitted event in the
same track was a channel message with the identical status byte; every
meta event cancels running status. Note-ons and note-offs use distinct
status bytes (0x90 / 0x80), so runs break at each on/off kind switch.

Tempo law: `encodedMicrosecondsPerQuarter = round(60_000_000 / bpm)` (no
tie is possible for integer bpm 20..400). The report carries
`roundingErrorNumerator = |60_000_000 - encoded * bpm|` and
`roundingErrorDenominator = bpm`; the true error in microseconds is their
quotient and is bounded by one half.

Byte ceiling: a finished file larger than `MAX_MIDI_EXPORT_BYTES`
(4,194,304) refuses `limit.midi_export_size_exceeded` — a mechanical
ceiling far above the worst legal plan, present as a failsafe, never a
truncation device.

## 4. Report and losses

`MidiExportReport` states writer pins, format/division/track count,
requested and encoded tempo with the exact rational error, note count
(one per emitted on/off pair), marker count, byte length, total ticks,
the deterministic filename, and the loss list:

- `enharmonic-spelling` — one loss entry naming every event whose spelled
  pitches contain an accidental spelling that MIDI note numbers cannot
  represent (any `alter != 0`, and any two distinct spellings sharing one
  note number); canonical symbols stay in marker text and JSON exports.
- `annotation-text` — present when the caller supplied no chord marker for
  an event (its annotation/symbol text is absent from the file).
- `loop-range` — present exactly when `plan.loop` is non-null: SMF-1 has
  no loop chunk; the loop is dropped from bytes and reported.

Filename law: `changes-` + `documentId` with every character outside
`[A-Za-z0-9._-]` replaced by `-`, truncated so the full name is at most 64
characters including the `.mid` suffix.

## 5. Independent proof contract

Fixtures under `tests/fixtures/midi-export/`:

- `e1-midi-export-contract.json` — manifest binding every constant above.
- `golden-cases.json` — hand-assembled SMF byte goldens (hex) with the
  full expected parsed-event model and report for: a minimal one-event
  4/4 chart; a 6/8 two-event chart with a section and chord markers; an
  equal-tick dense-chord case proving off-before-on and ascending-number
  order plus running status runs; a gate-clip case (`durationTicks 1`,
  full gate); tempo edges 20, 140 (nonzero rounding error), and 400; a
  loop plan with its `loop-range` loss; and a spelling-loss case pairing
  F-sharp against G-flat.
- `refusal-cases.json` — one near-miss per refusal code in precedence
  order, including the stale pairing (`midi.document_mismatch`) and the
  VLQ-overflow delta.
- `limit-cases.json` — bound edges (marker cap, text byte cap at 96/97,
  filename truncation at 64).
- `mutation-controls.json`, `trace-ledger.json`, `provenance-ledger.json`
  — as in every package: JSON-pointer corruptions with expected finding
  codes, reciprocal traces to named future `E1/build` test files, and an
  authority ledger with `expectedValuesGenerated: false` and
  `productionOutputUsed: false`.

`scripts/validate-e1-contract.ts` imports nothing from `src/`, restates
every constant locally, and proves each golden two independent ways: it
parses the fixture's hex bytes with its own minimal SMF reader (header,
chunk lengths, VLQs, running status, metas, channel events) and diffs the
parsed model against the case's expected event model; and it re-derives
that expected model itself from the case's plan JSON (tick arithmetic,
ordering laws, tempo bytes, filename, losses, report) and diffs again.
Mutation controls must each produce their named finding.

## 6. Implementation handoff and forbidden shortcuts

Contract violations even if a demo appears to work:

- Reparsing chord symbols, revoicing, transposing, or re-quantizing
  anything; consuming any input other than the finished plan and the
  explicit request fields.
- Rounding a nonintegral value silently anywhere: every tick is already
  integral in the plan; any computed delta or length that fails its bound
  refuses.
- Emitting nondeterministic bytes: map/set iteration order, locale, date,
  randomness, or wall time must never influence output.
- Skipping the loss report, the rounding-error record, or the note-off /
  note-on equal-tick ordering; claiming General MIDI or emitting program
  changes, pitch bends, or any event outside the frozen vocabulary.
- Creating object URLs, filenames outside the frozen law, or any network
  or storage touch inside the export layer.

Handoff: `E1/build` implements `MidiExportOperations` in `src/export/`
(suggested module `midi-export.ts`), satisfies every fixture family via
the trace ledger's named future test files, and adds the release-matrix
note that at least two external DAWs/players must load the goldens in the
manual release evidence (owned by the release-proof milestone).
