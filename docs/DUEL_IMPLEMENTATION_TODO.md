# All 15 duel ideas — implementation TODO

Owner request: 2026-09-10, implement all 15 finalists plus worthwhile additions. Campaign: `jcpe-6ujg`.

This checklist is the requested recovery inventory, not completion evidence. Consumer: owner and implementation agent; completion claim is gated on every original item. Retire into completed feature documentation once all entries are accepted. Existing source UI duplication and omitted contracts found by the duel are the observed tracking risks. No additional speculative feature is currently admitted.

Statuses: `[ ]` pending, `[x]` evidence recorded. Spec/build/verify are separate; package completion requires all three. No feature is implemented merely because its tasks exist.

## CC2: Play-along display

Package `jcpe-6ujg.1`. Spec `jcpe-6ujg.1.1` → build `jcpe-6ujg.1.2` → verify `jcpe-6ujg.1.3`.

- [ ] Specify source-timeline current/next/beat and loop/count-in/stale semantics
- [ ] Author literal expected timeline fixtures including rests and fractional changes
- [ ] Expose numeric revision-bound application selector without parsing display strings
- [ ] Integrate large current/next display into Focus with reachable Stop/Exit
- [ ] Verify real transport, 320px keyboard, reduced motion, and offline behavior
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## COD3: Performed arrangement MIDI

Package `jcpe-6ujg.2`. Spec `jcpe-6ujg.2.1` → build `jcpe-6ujg.2.2` → verify `jcpe-6ujg.2.3`.

- [ ] Specify additive writer and typed role provenance; retain literal export
- [ ] Capture same immutable performed snapshot as audition
- [ ] Encode conductor/bass/comp ticks, gates, velocities and overlapping unisons
- [ ] Integrate preparation/cancel/stale/download UI and sound-loss disclosure
- [ ] Verify independently decoded SMF against authored events and real download/DAW
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## COD1: Note-first chord creation

Package `jcpe-6ujg.3`. Spec `jcpe-6ujg.3.1` → build `jcpe-6ujg.3.2` → verify `jcpe-6ujg.3.3`.

- [ ] Review finite template extraction from M0 into pure theory interface
- [ ] Author ambiguous naming, enharmonic, duplicates, and no-match fixtures
- [ ] Build exact spelled note draft and plural name matcher with explicit work limits
- [ ] Wire preview, exact Manual insertion, Custom fallback and one Undo
- [ ] Verify real entry/audition/insertion/persistence plus M0 regressions
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## COD4 + AGY1: Exact guitar positions and instrument view

Package `jcpe-6ujg.4`. Spec `jcpe-6ujg.4.1` → build `jcpe-6ujg.4.2` → verify `jcpe-6ujg.4.3`.

- [ ] Specify standard tuning/fret/span and exact occurrence assignment
- [ ] Author independent placements, same-string conflict, duplicates and impossible cases
- [ ] Implement bounded injective solver with counters and honest no-position result
- [ ] Render diagrams and accessible note table in existing inspector; reuse piano
- [ ] Verify exact audition, source authority, phone layout and physical-player usability
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## COD2 + AGY2: Authored comping rhythms and groove controls

Package `jcpe-6ujg.5`. Spec `jcpe-6ujg.5.1` → build `jcpe-6ujg.5.2` → verify `jcpe-6ujg.5.3`.

- [ ] Specify distinct authored-arrival policy and rational preset timing
- [ ] Author attack/gate/accent tables through source changes/rests/loops
- [ ] Implement bounded comp-only four-bar recipe compiler without pitch repair
- [ ] Wire 16-slot editor, reviewed presets, preview, Use/Restore and recipe file
- [ ] Define explicit durable schema/sharing extension after session MVP
- [ ] Verify actual emitted events, cancellation and performed MIDI interoperability
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## COD5: Band-dropout practice

Package `jcpe-6ujg.6`. Spec `jcpe-6ujg.6.1` → build `jcpe-6ujg.6.2` → verify `jcpe-6ujg.6.3`.

- [ ] Reconcile finite rehearsal owner and prerequisite acceptance
- [ ] Specify four-bar passage repeated four times with 2-on/2-off mask
- [ ] Integrate occurrence masks preserving phase, releases and preview ownership
- [ ] Add count-in, Stop and return display through existing transport
- [ ] Verify real timing, pause/seek/replacement and no false grading claims
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## CC3: Touch chord pads

Package `jcpe-6ujg.7`. Spec `jcpe-6ujg.7.1` → build `jcpe-6ujg.7.2` → verify `jcpe-6ujg.7.3`.

- [ ] Specify exact chart voicings, one active pad and bounded holds
- [ ] Prototype cold/warm touch-to-sound on real phone before latency promises
- [ ] Implement preparation/release/cancel/blur ownership through application
- [ ] Add section pads and keyboard alternative with exact note disclosure
- [ ] Verify rapid replacements, hidden tab, stale edits, tails and no mutation
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## CC1: Short WAV export

Package `jcpe-6ujg.8`. Spec `jcpe-6ujg.8.1` → build `jcpe-6ujg.8.2` → verify `jcpe-6ujg.8.3`.

- [ ] Prove bounded short PCM route for selected supported instrument
- [ ] Specify dry-render gates/tails/rate, retained-buffer limits and refusal roster
- [ ] Implement audio-owned cooperative render/cancel port and byte-only WAV encoder
- [ ] Add excerpt/progress/cancel/download with explicit effects limitations
- [ ] Verify independent sample/onset expectations, decoded WAV and real phone memory/listening
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## CC4: Compatible songbook import

Package `jcpe-6ujg.9`. Spec `jcpe-6ujg.9.1` → build `jcpe-6ujg.9.2` → verify `jcpe-6ujg.9.3`.

- [ ] Research authoritative supported format with permitted real examples and provenance
- [ ] Specify closed vocabulary, repeat expansion budgets and loss/refusal preview
- [ ] Implement inert bounded decoder with exact spelling/time mapping
- [ ] Wire single-song preview and atomic Add/Undo without silent approximation
- [ ] Verify independent real-file transcriptions, hostile input and expansion limits
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## CC5: Exact-link QR sharing

Package `jcpe-6ujg.10`. Spec `jcpe-6ujg.10.1` → build `jcpe-6ujg.10.2` → verify `jcpe-6ujg.10.3`.

- [ ] Specify conservative payload/density limits and honest receiver requirements
- [ ] Implement reviewed local QR encoder with independent standard vectors
- [ ] Integrate into exact-share dialog retaining link/JSON fallbacks
- [ ] Verify independent decoder, source revision and physical phone scans
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## AGY3: Printable vector charts

Package `jcpe-6ujg.11`. Spec `jcpe-6ujg.11.1` → build `jcpe-6ujg.11.2` → verify `jcpe-6ujg.11.3`.

- [ ] Reopen deferred chord-only printing scope under this user authorization
- [ ] Specify Letter/A4 geometry, pagination, fonts and overfull-cell behavior
- [ ] Implement deterministic escaped vector layout and standalone SVG export
- [ ] Wire in-document print view without popup/network requirements
- [ ] Verify exact symbols, dense/long charts, downloadable fonts and native phone/desktop output
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## AGY4: Audible ear training

Package `jcpe-6ujg.12`. Spec `jcpe-6ujg.12.1` → build `jcpe-6ujg.12.2` → verify `jcpe-6ujg.12.3`.

- [ ] Reconcile G9 owner and fix existing duplicate distractors without duplicating lab
- [ ] Author independently distinguishable heard-voicing answer fixtures
- [ ] Implement safe question generation accepting all audible interpretations
- [ ] Wire Replay, answer/explanation and ungraded hide/listen/reveal for ambiguous charts
- [ ] Verify actual sounded notes, answer leakage, stale session and Stop cleanup
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## AGY5: Neutral motion and register observations

Package `jcpe-6ujg.13`. Spec `jcpe-6ujg.13.1` → build `jcpe-6ujg.13.2` → verify `jcpe-6ujg.13.3`.

- [ ] Reuse existing Motion view and 7-voice assignment limits
- [ ] Specify neutral interval/register observations with source-occurrence mapping
- [ ] Implement missing lower-register facts without quality scores or automatic repair
- [ ] Add Hear and accessible exact-note explanation in existing inspector
- [ ] Verify duplicate/order preservation, boundary intervals and unsupported assignment sizes
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## Shared integration and release

- [ ] Reconcile existing U2/U4/U7/G9/rehearsal obligations before overlapping edits.
- [ ] Chain browser gates; never start a second Playwright suite.
- [ ] Preserve 524,288-byte Atlas reservation; measure new shell cost.
- [ ] Recheck source mtimes before gates and rebuild stable tree.
- [ ] Keep all schema changes explicit across recovery, share, backup and interchange.
- [ ] Preserve exact JSON and literal MIDI compatibility.
- [ ] Complete applicable human listening/accessibility/device evidence without synthetic claims.
- [ ] Commit explicit coherent paths and run predeploy checks against committed staged bytes.
- [ ] Deploy both hosts only after named gates; poll committed-byte match and verify real desktop/phone behavior.
