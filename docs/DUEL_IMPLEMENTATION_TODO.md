# All 15 duel ideas — implementation TODO

Owner request: 2026-09-10, implement all 15 finalists plus worthwhile additions. Campaign: `jcpe-6ujg`.

This checklist is the requested recovery inventory, not completion evidence. Consumer: owner and implementation agent; completion claim is gated on every original item. Retire into completed feature documentation once all entries are accepted. Existing source UI duplication and omitted contracts found by the duel are the observed tracking risks. No additional speculative feature is currently admitted.

Statuses: `[ ]` pending, `[x]` evidence recorded. Spec/build/verify are separate; package completion requires all three. No feature is implemented merely because its tasks exist.

## CC2: Play-along display

Package `jcpe-6ujg.1`. Spec `jcpe-6ujg.1.1` → build `jcpe-6ujg.1.2` → verify `jcpe-6ujg.1.3`.

- [x] Specify source-timeline current/next/beat and loop/count-in/stale semantics — docs/PLAY_ALONG_DISPLAY.md; spec jcpe-6ujg.1.1 closed.
- [x] Author literal expected timeline fixtures including rests and fractional changes — 9 independently calculated cases; 12 selector tests pass.
- [x] Expose numeric revision-bound application selector without parsing display strings — cached immutable timeline and live transport authority.
- [x] Integrate large current/next display into Focus with reachable Stop/Exit — optional Follow playback; focus restored on Exit.
- [x] Verify real transport, 320px keyboard, reduced motion, and offline behavior — 48 browser cases pass; strengthened exact-label suite 6/6 across Chromium/Firefox/WebKit. Physical-device acceptance remains below.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates — build jcpe-6ujg.1.2 closed; see checkpoint.
- [ ] Record independent acceptance and close all three phases before package.

## COD3: Performed arrangement MIDI

Package `jcpe-6ujg.2`. Spec `jcpe-6ujg.2.1` → build `jcpe-6ujg.2.2` → verify `jcpe-6ujg.2.3`.

- [x] Specify additive writer and typed role provenance; retain literal export — docs/PERFORMED_MIDI.md and independently authored channel/tick fixtures; spec jcpe-6ujg.2.1 closed.
- [x] Capture immutable performed snapshot using playback’s full-context compiler and section projection, pinned to document/revision/groove.
- [x] Encode conductor/bass/comp ticks, gates, velocities and overlapping unisons — independent SMF reader, 15/16-lane boundary and four mutation witnesses.
- [x] Integrate preparation/cancel/stale/download UI and sound-loss disclosure — native downloads match prepared digest; cancellation, edit-during-hash and panel-remount regressions pass.
- [ ] Verify independently decoded SMF against authored events and real download/DAW — byte reader and browser downloads pass; two external players/DAWs remain unexecuted.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates — build jcpe-6ujg.2.2 closed with exact command/result evidence.
- [ ] Record independent acceptance and close all three phases before package.

### Performed MIDI verification: download failure cleanup (2026-09-11)

- [x] Claim ready `.2.3`; read original contracts and coordinate shared adapter ownership.
- [x] Identify URL/anchor leaks on synchronous activation exceptions and false cleanup success when anchor removal throws.
- [x] Add independent failure witnesses for each allocation/activation/cleanup boundary plus successful immediate activation.
- [x] Repair shared browser download cleanup without changing encoded MIDI or user-activation timing.
- [x] Exercise performed-MIDI coordinator refusals and recovery through the actual adapter.
- [x] Verify native file downloads and injected activation/removal failures in Chromium, Firefox and WebKit at 320/1280 widths.
- [x] Run focused MIDI regressions, strict types, lint/boundaries and guarded build through RCH; bind evidence to unchanged source.
- [x] Repair observed full-lint crash on generated `.rch-tmp` Playwright cache by matching its existing Git exclusion; preserve every source rule.
- [x] Fresh review, commit owned fixes and record evidence; retain original external-player/physical-device acceptance on `.2.3`.
- [x] Rebuild immediately before committing; rerun unchanged model/quality and native-playback release gates against committed bytes.
- [x] Publish the repair to both hosts, poll for the committed hash and verify native MIDI download/failure/recovery at phone/desktop widths.


The old adapter failed 8 of 11 independently authored fault witnesses. The repaired
adapter passed 183 focused MIDI/arrangement tests (4,791 assertions, 16 files),
`bun run typecheck`, full `bun run lint` (348 source-policy files, zero findings),
and the guarded `bun run build`, all via RCH hz2 with Bun 1.3.14 and Node 26.0.0.
The final browser matrix passed 24/24: 18 performed-MIDI download/failure/recovery
cases and six unchanged note-first/audio/storage round trips, three engines at
320/1280 widths, zero skipped/retried/flaky cases or unexpected console/page/network
errors. All 1,601 declared input hashes and local source mtimes remained unchanged.
The guarded candidate is SHA256
`687e5d1774639e8c8c4faff80476975f475e0b5e08e814c5b1b31a6d9ffbdef4`,
8,631,443 bytes. Evidence: `.tmp/midi-cleanup/final.log` for focused/static gates;
`test-results/midi-cleanup-settled/{browser-results,source-receipt}.json` and its
native MIDI files, resource observations and browser version/error diagnostics.

Earlier failed runs remain available: the new interceptor originally blocked its
own file navigation (16/24 passed); after correcting that, WebKit exposed a startup
race in revision capture (22/24 passed). The final tests wait for the existing
completed-demo banner before recording the revision; all original revision and
resource assertions remain. The observed generated-cache lint crash was fixed by
excluding only the already Git-ignored `.rch-tmp`; existing recovery diagnostics
were typed without changing their behavioral assertions. The first release-gate
attempt was refused before execution by RCH worker memory pressure; this is not a
release-gate pass. After pressure eased, the final guarded rebuild reproduced the
same bytes and `bun run predeploy:check` passed 11 shipping models and nine
rendered instruments with zero fail findings (warnings retained). Logs remain
under `.tmp/midi-cleanup/`; final release-gate evidence is in
`test-results/midi-cleanup-release-gates/`.


Repair and tooling commits `ec794529dcc5350acca85596254bb709e1be7713` and
`121e8ea` are pushed. Native release playback initially could not start on hz2
because of transient memory pressure. The hz3 alternative stalled after its
first instrument while disk utilization reached 100 percent; its owned browser
and server were stopped and confirmed absent before using the recovered hz2.
The interrupted run is not a pass. Its scratch launcher returned zero for a
signal-terminated child, so the launcher was tightened to reject signals and
require the complete semantic gate ledger. The checked-in gate, assertions and
instrument count remain unchanged. Logs: `playback.log`, `playback-hz3.log` and
`playback-hz2-recovered.log` under `.tmp/midi-cleanup/`.


The recovered hz2 run passed the unchanged native playback gate for all 15
instruments with zero console/page errors. Recovery enforcement stayed enabled;
its PASS was explicitly vacuous because no refusal reproduced. Committed HTML
and share-image bytes were then uploaded to both hosts. Both public URLs matched
`git show ec794529dcc5350acca85596254bb709e1be7713:jazz_chord_progression_editor.html`
on the first poll. Cloudflare deployment: `455591b9.jazz-chord-progression-editor-html.pages.dev`.
Vercel: `dpl_DkwJCVgCKuZ1RgemjQ32bbNW3ZNa`, READY, production target. Evidence:
`test-results/midi-cleanup-release/playback-gate.json`, `.tmp/midi-cleanup/upload.log`
and `.tmp/midi-cleanup/host-hashes.json`.

2026-09-11 20:46 UTC: Live Chromium 149.0.7827.55 passed 12/12 cases: two hosts
at 320/1280 widths, normal download and injected click/removal failure followed
by successful fresh preparation/download. Zero skipped/retried/flaky cases,
console/page errors, unexpected requests or panel overflow. All twelve retained
MIDI files are 1,166 bytes with SHA256
`41b9c57d4a5b1dfe5c20f0e8d274696105d62c9e08d1cb0f84360fa74827442f`,
matching each prepared artifact. Revision equality and URL/anchor accounting
passed. Phone and desktop screenshots were inspected. No Cloudflare beacon
error occurred in these sessions; this does not claim permanent removal of the
platform injection. Reports: `test-results/midi-cleanup-live/host-{0,1}.json`;
summary and screenshots under `.tmp/midi-cleanup/`. The repair is shipped;
original independent acceptance remains open on `.2.3`.

This is author-executed automated proof, not independent acceptance. `.2.3` and
its package stay open for the original two external MIDI players/DAWs, independent
review and applicable physical-device evidence. The three pre-existing untracked
application UI copies remain untouched and excluded from the candidate; this is
not a claim that every in-flight file or every project acceptance gate passed.

## COD1: Note-first chord creation

Package `jcpe-6ujg.3`. Spec `jcpe-6ujg.3.1` → build `jcpe-6ujg.3.2` → verify `jcpe-6ujg.3.3`.

- [x] Review finite template extraction from M0 into pure theory interface
- [x] Author ambiguous naming, enharmonic, duplicates, and no-match fixtures
- [x] Build exact spelled note draft and plural name matcher with explicit work limits
- [x] Wire preview, exact Manual insertion, Custom fallback and one Undo
- [x] Verify real entry/audition/insertion/persistence plus M0 regressions
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## COD4 + AGY1: Exact guitar positions and instrument view

Package `jcpe-6ujg.4`. Spec `jcpe-6ujg.4.1` → build `jcpe-6ujg.4.2` → verify `jcpe-6ujg.4.3`.

- [x] Specify standard tuning/fret/span and exact occurrence assignment
- [x] Author independent placements, same-string conflict, duplicates and impossible cases
- [x] Implement bounded injective solver with counters and honest no-position result
- [x] Render diagrams and accessible note table in existing inspector; reuse piano
- [x] Verify exact audition, source authority and 320px layouts in three real browser engines.
- [ ] Verify physical-player usability with a guitarist.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

## COD2 + AGY2: Authored comping rhythms and groove controls

Package `jcpe-6ujg.5`. Spec `jcpe-6ujg.5.1` → build `jcpe-6ujg.5.2` → verify `jcpe-6ujg.5.3`.

- [x] Specify distinct authored-arrival policy and rational preset timing — docs/AUTHORED_COMPING.md; spec `.5.1` closed.
- [x] Author ten attack/gate/accent tables through source changes, rests and passage phase; finite one-pass audition, no implicit loop rearticulation.
- [x] Implement bounded comp-only four-bar recipe compiler without pitch repair — source/slot/cursor/attack/pitch counters and independent tables pass.
- [x] Wire 16-slot editor, authored presets, three rational gates, audition/Stop/Restore, bounded recipe file/paste preview/apply/download and separate performed MIDI.
- [x] Keep v1 session-only with explicit sharing/backup disclosure and separate closed-schema recipe files. Durable native-document migration remains deferred by the accepted v1 scope.
- [x] Verify exact submitted audio plans, cancellation before async submission, independent MIDI decoding and actual native browser downloads. Human listening remains below.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates — build `.5.2` closed.
- [ ] Record independent acceptance and close all three phases before package.

## COD5: Band-dropout practice

Package `jcpe-6ujg.6`. Spec `jcpe-6ujg.6.1` → build `jcpe-6ujg.6.2` → verify `jcpe-6ujg.6.3`.

- [x] Reconcile finite rehearsal owner and prerequisite acceptance — existing rehearsal build and U4 verification remain open; no ownership override.
- [x] Specify four-bar passage repeated four times with 2-on/2-off mask — docs/BAND_DROPOUT.md and independent fixtures; `.6.1` closed.
- [ ] Integrate occurrence masks preserving phase, releases and preview ownership
- [ ] Add count-in, Stop and return display through existing transport
- [ ] Verify real timing, pause/seek/replacement and no false grading claims
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

- [x] Check independent exact epochs, inclusive-boundary near miss, source-origin translation, tails, repeated spellings and countdown arithmetic.
- [x] Pass specification-only RCH tests, test-project types and owned lint.
- [ ] Complete the existing rehearsal/U4 prerequisites before claiming `.6.2`.
- [ ] Replay these fixtures against actual production occurrence masking and kill all eight named source mutants.
- [ ] Observe native return timing and independent preview ownership on real phones before acceptance.

## CC3: Touch chord pads

Package `jcpe-6ujg.7`. Spec `jcpe-6ujg.7.1` → build `jcpe-6ujg.7.2` → verify `jcpe-6ujg.7.3`.

- [x] Specify exact chart voicings, one active pad and bounded holds
- [ ] Prototype cold/warm touch-to-sound on real phone before latency promises — automated timings are explicitly desktop-only; no physical latency claim.
- [x] Implement preparation/release/cancel/blur ownership through application
- [x] Add section pads and keyboard alternative with exact note disclosure
- [x] Verify rapid replacements, stale edits, Stop, tails and no mutation through real application/audio owner; real browser key/pointer holds, injected cancellation, focus loss, page changes and repeated click activation pass.
- [ ] Verify physical background/foreground and touch behavior on supported phones.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

### Keyboard hold repair (2026-09-12, `jcpe-6ujg.7.3`)

- [x] Claim the verification leaf, inspect its inherited contracts and reserve the pad UI, browser tests and this TODO.
- [x] Identify cross-key release: Space/Enter and main/keypad Enter currently share one keyboard owner.
- [x] Add real keyboard/native-audio regressions for all four owning/other-key orders, preserving document revision and rejecting extra attacks.
- [x] Demonstrate those regressions fail against committed artifact `687e5d1774639e8c8c4faff80476975f475e0b5e08e814c5b1b31a6d9ffbdef4`: RCH Chromium 0 passed/4 expected diagnostic failures, each at the premature-release assertion; original diagnostics retained in `test-results/pad-key-baseline`.
- [x] Preserve both key and physical code; release only that key's hold. Pointer ownership and bounded assistive click activation keep their existing paths.
- [x] Pass RCH `bun test tests/unit/studio-pads.test.ts tests/integration/studio-pads.test.ts tests/integration/studio-inspector-commands.test.ts tests/integration/studio-comping.test.ts` (39 tests, 277 assertions), `bun run typecheck` (all four projects), `bun run lint` and `bun run build`.
- [x] Pass all 27 native pad cases in Chromium 149.0.7827.55, Firefox 151.0 and WebKit 26.5 with 0 failures/skips/retries/flaky cases: `test-results/pad-key-fixed/browser-results.json`. This includes all four physical-key orders, pointer/cancellation/focus/page/tap behavior, 320/1280px, both themes and accessibility. Artifact `acf66ca16933a9afd40c125fb56d30a95d0d012aa5a6dfa4be58d7a17a5dccc5`, 8,631,505 bytes; 1,610 source/test/config hashes and mtimes unchanged.
- [ ] Recheck source hashes/mtimes, commit explicit paths and push the verified repair.
- [ ] Pass both deployment gates, publish committed bytes and verify both hosts in real browsers at desktop and phone widths.
- [ ] Retain physical-phone, listening and independent acceptance as open; automated author verification cannot close this leaf.

## CC1: Short WAV export

Package `jcpe-6ujg.8`. Spec `jcpe-6ujg.8.1` → build `jcpe-6ujg.8.2` → verify `jcpe-6ujg.8.3`.

- [x] Prove bounded approved dry Concert Grand PCM route — 18 real feasibility renders; no live instrument/effect parity claim.
- [x] Specify dry-render gates/tails/rate, retained-buffer limits and refusal roster — docs/SHORT_PIANO_WAV.md and independent fixtures; `.8.1` closed.
- [x] Implement audio-owned cooperative render/cancel port and byte-only WAV encoder — 24 focused tests and four semantic mutants pass; build `.8.2` closed.
- [x] Add passage/progress/cancel/download with explicit effects limitations — actual application tests and 12 native browser download cases pass.
- [x] Verify independent sample/onset expectations and decoded native WAV — 24 tests/176 assertions, maximum 64-note/16-second render, four mutants, 12 browser cases.
- [ ] Verify physical phone peak memory, cancellation and listening — `.8.3` remains open.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates — `.8.2` closed.
- [ ] Record independent acceptance and close all three phases before package.

## CC4: Compatible songbook import

Package `jcpe-6ujg.9`. Spec `jcpe-6ujg.9.1` → build `jcpe-6ujg.9.2` → verify `jcpe-6ujg.9.3`.

- [x] Research authoritative supported format with permitted real examples and provenance — explicit ChordPro grid subset, official references and three original permitted .crd files; docs/CHORDPRO_GRID_IMPORT.md.
- [x] Specify closed vocabulary, repeat expansion budgets and loss/refusal preview — spec `.9.1` closed; quarter-cell interpretation requires acknowledgement, unsupported forms refuse.
- [x] Implement inert bounded decoder with exact spelling/time mapping — 16 tests/201 assertions, maximum 128 bars/512 events, four killed semantic mutants.
- [x] Wire single-song preview and atomic Add/Undo without silent approximation — native file and paste, explicit timing consent, source revision and file races, one complete section command.
- [x] Verify independent real-file transcriptions, hostile input and expansion limits — three original permitted .crd files, hand transcriptions and 12 native browser Add/Undo/Redo/JSON cases. External reference-tool/user acceptance stays open.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates — `.9.2` closed with exact evidence.
- [ ] Record independent acceptance and close all three phases before package.

## CC5: Exact-link QR sharing

Package `jcpe-6ujg.10`. Spec `jcpe-6ujg.10.1` → build `jcpe-6ujg.10.2` → verify `jcpe-6ujg.10.3`.

- [x] Specify conservative payload/density limits and honest receiver requirements — docs/EXACT_QR_SHARING.md; `.10.1` closed, 1,190 ASCII bytes / M v1–28 / four-module quiet zone / minimum two CSS pixels per module.
- [x] Implement reviewed local QR encoder with independent standard vectors
- [x] Integrate into exact-share dialog retaining link/JSON fallbacks
- [ ] Verify independent decoder, source revision and physical phone scans
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

- [x] Prove native lossless compression feasibility in Chromium/Firefox/WebKit; record differing encoded bytes without claiming differing document content.
- [x] Author independent libqrencode matrices and Python zlib fixtures before implementation; supplemental all-mask/all-capacity C references added independently afterward.
- [x] Verify additive v3 bounded streaming receiver through unchanged E0/F2/F3, negative-zero/escape preservation, old v1/v2 readers and decompression-bomb refusals.
- [x] Verify source/owner invalidation and no late code publication after cancellation, edit or overlay.
- [x] Decode real browser QR pixels with libzbar, open a fresh receiver, and compare native JSON byte-for-byte.
- [x] Keep physical phone scans and independent acceptance open until observed.

## AGY3: Printable vector charts

Package `jcpe-6ujg.11`. Spec `jcpe-6ujg.11.1` → build `jcpe-6ujg.11.2` → verify `jcpe-6ujg.11.3`.

- [x] Reopen deferred chord-only printing scope under this user authorization — `.11.1` closed.
- [x] Specify Letter/A4 geometry, pagination, fonts and overfull-cell behavior — docs/PRINTABLE_CHARTS.md; independent geometry/wrapping/font/boundary fixtures validated.
- [x] Implement deterministic escaped vector layout and standalone SVG export — `.11.2` closed; exact source text/time, bounded wrapping, embedded font and explicit refusals.
- [x] Wire in-document preview, native print and single-use SVG download — print-mode overlay lifecycle and named-page minifier defects fixed.
- [x] Verify exact symbols, dense/long chart refusals, downloadable fonts and native desktop PDF — 12 unit/integration tests, four mutants, 12 browser cases and four independent native PDF proofs.
- [ ] Verify physical A4/Letter output and native phone printing — `.11.3` remains open.
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates — `.11.2` closed.
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

- [x] Reuse existing Motion view and 7-voice assignment limits
- [x] Specify neutral interval/register observations with source-occurrence mapping
- [x] Implement missing lower-register facts without quality scores or automatic repair
- [x] Add Hear and accessible exact-note explanation in existing inspector
- [x] Verify duplicate/order preservation, boundary intervals and unsupported assignment sizes
- [x] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
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

## Current execution checkpoint

2026-09-10 13:30 UTC: Thirteen finalists are implemented through eleven packages, now including exact QR sharing. QR `.10.2` has passed all named implementation gates; independent/physical-phone `.10.3` remains open. Dropout specification `.6.1` is closed; its build still waits on rehearsal/U4. Ear training remains blocked by reopened G9 prerequisites. All independent verification leaves and package epics remain open.

Current guarded root/dist SHA-256: `8a966d4e6f2af00f860936b01146606977cb93753f6e08f61441fd79aa2e30b9`, 8,620,607 bytes. All 359 source-file hashes checked before promotion. Shell headroom: 292,289 bytes; Atlas reservation: 524,288 bytes intact. No deployment or new implementation commits by this agent. Other contributors' work and earlier commits are preserved.

HUD: 14 focused tests/46 assertions, full typecheck/lint/build, 48 original browser cases, four killed mutants. Strengthened combined HUD/performed-MIDI browser receipt: 12 expected, zero unexpected/skipped/flaky (`combined-final-results.json`). Native audio and exact cue transitions observed; passive in-page observation avoids driver-roundtrip timing loss without changing assertions or timeouts.

Performed MIDI: 170 tests/4,696 assertions including unchanged E1/U7/performance regression suites; four killed mutants. Final subscription delta: 13 tests/217 assertions plus typecheck/source policy/targeted lint/build. Six native downloaded files match prepared hashes and independently checked three-track headers. Two external players/DAWs remain unexecuted.

Note-first: 166 tests/1,789 assertions, four killed mutants, unchanged M0 contract, types/lint/source policy/build. F3 spelling law preserved: acknowledged enharmonic names become Custom labels, exact names remain parsed. Six browser cases prove native audition, exact duplicates, Add/Undo/Redo, downloads and actual recovery reload. Small usability extras add touch spacing and retain the selected alternative when names are collapsed.

Guitar: 12 independently authored position fixtures and 23 tests/365 assertions including controller audition and existing inspector regression; four killed mutants. Full global typecheck/lint and guarded build pass. Standard tuning, frets 0–20, exact occurrences with deterministic search counters, three ranked placements or honest impossibility. No guessed fingerings or pitch repair. Existing inspector tabs and preview owner preserved.

Earlier combined note-first/guitar receipt on artifact d4c025: 15 expected, zero unexpected/skipped/flaky, 66.1 seconds (`guitar-note-choice-browser-results.json`). Guitar runs at 320×568, 320×900 and 1280×900 in Chromium/Firefox/WebKit; note entry at phone/desktop widths. Real audio, exact note tables, scoped accessibility checks, source immutability, no overflow/errors/forbidden requests. Test navigation was corrected for distinct short-phone and tall-phone inspector entry points; failed diagnostics retained. Human/device/guitarist acceptance remains open.

Detailed logs, JSON receipts, mutations, source hashes, browser request/error records, videos and downloads remain under `.tmp/duel-implementation/`. They are ephemeral evidence, not files to commit.

Agent Mail delivered guitar coordination to IvoryBluff (message 41205) at 09:04 UTC; inbox reads now succeed. Earlier backend-rejected messages remain failed deliveries. Existing U2/U4/U7/M1/rehearsal owners and their acceptance obligations remain authoritative.

Authored comping: 91 RCH tests/4,488 assertions plus four killed mutants with honest twins; full types, corrected targeted lint, source policy and guarded build pass. New source-edit-during-preparation witness caught and fixed a real late attack. Cancellation, stale MIDI hashes, unrelated preview ownership and bounded asynchronous recipe reads pass. The exact grid/accents/gates feed audio and performed MIDI without extra chord-arrival attacks or note repair.

Current rhythm receipt: `comping-release-browser-results.json`, 18 expected, zero unexpected/skipped/flaky, 66.3 seconds, every attached hash equals its comping artifact cc96af97. Three engines × three viewport sizes × light/dark, actual audio and recipe/MIDI downloads, unchanged chart revision, no errors/requests/overflow. Visual review caught dark text on dark fallback backgrounds; fixed to app theme tokens. A direct contrast assertion reproduces the old defect and passes on the final build; final phone visual review confirms readable slot labels.

Cross-feature receipt `comping-combined-browser-results.json`: 36 pass, but the first HUD six selected the old root through a wrong environment key. They are not counted as current proof. Corrected `comping-hud-browser-results.json` adds six passes explicitly bound to the same pre-CSS candidate as the other 30 cases (`be1b453f...`); subsequent changes are scoped rhythm CSS only. No failed diagnostics or prior receipts discarded.

Agent Mail delivered rhythm/U4 coordination as message 41206. Cass history queries are currently blocked by Quill query-fuel exhaustion at 10,000,000 units, including an exact-term follow-up; no historical negative finding is inferred. Live source, Beads and Git remain authoritative. Honesty inventory reviewed the test changes, preparation-race fix, artifact selection correction and contrast-proof gap; no gate relaxation or human-proof substitution was used.

Register observations: 46 RCH tests/470 assertions including unchanged inspector regressions; four killed semantic mutants plus honest twin; full types, touched lint, 326-file source policy and guarded build pass. Twelve browser cases on dd522441 (three engines, two widths, both themes) prove literal enharmonic duplicates, 8/28-pair disclosure, honest V1 unavailability, native audition/release, unchanged source revision and no errors/network/overflow; Axe clean. Initial test omitted the existing Advanced controls entry point; corrected navigation without changing app behavior/assertions. Final browser test types/lint and phone visual review pass. Independent human acceptance remains `.13.3`.

Touch pads: 37 RCH tests/257 assertions including inspector and comping regressions, four killed semantic mutants with honest twin; final added boundaries/gesture fix: 17 tests/115 assertions, full types/touched lint/source policy328/build. Current ea812917 artifact: 12 matrix cases/51.6s plus 3 focused lifecycle cases/15.0s; all 15 hashes verified, zero unexpected/skipped/flaky. Three engines, phone/desktop, themes; actual holds/releases, page17, duplicate labels, source revision, Axe/no overflow/errors/network. Pointercancel and AT-style clicks explicitly injected; physical device/screen-reader timing remains open. Final browser test types/lint and phone visual pass. Native JSON import replaces an oversized share-link fixture; share cap unchanged.


2026-09-10 11:32 UTC: Short WAV `.8.2` closed. Ten finalists now have implemented spec/build paths through eight packages. Root/dist SHA256 `68b3cf2fcd7faeb4dc55973e7c64911ccebecdd51a316e584d706f08078c8cd2`, 8,529,001 bytes; source snapshot checked before promotion. RCH final WAV proof: 24 tests/176 assertions and four killed mutants; browser receipt `wav-browser-results.json`: 12 pass, zero skipped/unexpected/flaky, 48,574.941 ms, all bound to this hash. All verification leaves/epics remain open. Five finalists remain: dropout, songbook import, QR, print, ear training. Print is the next independent package. G9's reopened specification itself remains blocked by G1/G2/G5/G6/G7/G8; no practice correction or new graded listening completion is claimed.


Historical print implementation checkpoint (superseded by closure below): shared typed layout and source-bound service are wired to existing command lane plus a print-only document outside overlays. Bundled Archivo bytes/OFL travel with standalone SVG; unsupported glyphs, overfull headers/bars, empty sections and bounded-source failures are explicit. Outstanding implementation subtasks: pass focused/static gates; kill four semantic mutants; validate actual downloaded SVG/fonts in three browsers; inspect native Chromium A4/Letter PDFs with independent PDF tools; review phone preview; promote only a source-hash-verified guarded artifact; record exact evidence before build closure. Physical print/phone acceptance remains `.11.3`.


2026-09-10 12:15 UTC: Print `.11.2` closed. Eleven finalists implemented through nine spec/build packages: `.1`–`.5`, `.7`, `.8`, `.11`, `.13`. Four remain: dropout, songbook import, exact QR and ear training. Root/dist SHA256 `5f61b03b23b75cc9a96455c8198daa569a4c8d0d05f4cc786ccafaf0130b7d76`, 8,595,902 bytes, shell headroom 316,994 bytes plus preserved Atlas reserve. Print proof: 12 tests/97 assertions, four killed mutants; 12 browser cases/60,675.595ms, all bound to this artifact; four real PDFs independently checked on both pages with unchanged content and embedded font. Old malformed-page output is rejected by the same helper. Detailed receipts: print-browser-results.json, print-all-pages-proof.json, print-final-proof-types.log, print-final-source-policy.log in the ignored implementation evidence directory. No console/CSP exception, skipped or retried gate. All independent verification leaves and package epics remain open; no commit/deployment in this campaign.

2026-09-10 12:35 UTC: ChordPro grid specification closed with three original permitted files and exact hand transcriptions. Build `.9.2` active: inert decoder, revision-bound file/paste preview and single-section Add/Undo implemented. First 14 focused tests/173 assertions pass. Strict typing found and corrected a missing nonempty event-tuple construction; final gates and browser proof remain pending. No songbook build closure or artifact promotion claimed yet.

2026-09-10 12:42 UTC: Songbook `.9.2` completed. Twelve finalists now have implemented spec/build paths through ten packages; dropout, QR and ear training remain. RCH songbook-clean-gates.log: 16 tests/201 assertions, four killed mutants plus honest pass, full typecheck/touched lint, source policy 341 files PASS, guarded build. songbook-browser-results.json: 12 passed, 0 skipped/unexpected/flaky, 57,569.669ms, all artifact hash `2c99acda954d41733466ed1f471a9606c70f43f3b899f1412c9259890de6a39d`. Native file/paste, refusal, exact expanded bars, JSON download, one Undo/Redo, Axe/overflow/no network/errors; 320px visual inspected. Root/dist promoted only after source hash-map verification: 8,607,967 bytes, 304,929 shell headroom, Atlas reserve intact. Songbook `.9.3` independent reference-tool/user review remains open; all package epics remain open. QR is next. No commit/deploy.


QR implementation: 61 RCH tests/510 assertions, all project type checks, touched lint, source policy 344 files and guarded build; four killed semantic mutants with honest twin. Final proof logs: qr-built-gates.log, qr-final-proof.log, qr-clean-final-lint.log. Fifteen QR browser cases pass in 74,935.465ms (qr-final-browser-results.json), plus 18 unchanged old-share startup/download/native Play/Stop cases in 75,759.514ms against the candidate (qr-old-share-browser-results.json). All 33 receipts match the promoted hash, with zero skipped/unexpected/flaky cases and no page/console/forbidden-network errors. Actual pixels independently decoded by libzbar in all four rotations; native JSON matches byte-for-byte including negative zero. Every image rejects a missing quiet module; independent matrix-to-SVG reconstruction passes. Playwright WebKit's stylesheet-injecting screenshot preparation was replaced only in this test by a version-checked direct renderer snapshot protocol, preserving CSP and zero-error assertions. Prior failed capture/fragment-navigation diagnostics retained. Final test-only typing/braces cleanup passed e2e types/lint; production source remained unchanged. Phone/desktop visuals inspected. Physical camera/device/usability acceptance remains open; no deployment claim.
2026-09-10 13:36 UTC: Dropout `.6.1` closed after RCH specification checks: 6 tests/95 assertions, test-project TypeScript and owned ESLint PASS (dropout-spec-final-gates.log). This is specification consistency only; no dropout runtime implementation or audio/mutation acceptance claimed. `.6.2` remains open behind `jcpe-rehearsal-session-6y2b.2`, itself behind `jcpe-milestone-reliable-studio-l3a.12.3` U4 verification and IvoryBluff's active U4 build. Ear-training `.12.1/.12.2` remain open behind reopened G9 spec/build; G9 requires G1/G2/G5/G6/G7/G8. All eleven implemented package verification leaves and all package epics remain open. The complete set of 15 finalists has not yet been delivered. No new source edits after QR artifact promotion; no commit/deployment. Aggregate release is not claimed: existing human listening/accessibility and feature device/reference-tool acceptance remain outstanding.


### Fresh-eyes repair pass — jcpe-9fmt (2026-09-10)

- [x] Reread new feature services, algorithms, UI wiring and shared preview lifetimes.
- [x] Reproduce premature rhythm Stop success with delayed retirement.
- [x] Reproduce a note-first attack after the source changes during preparation.
- [x] Reproduce clipped QR geometry at 844 × 390 in Chromium.
- [x] Implement receipt-aware Stop, source-bound note-first ownership, truthful release-request notices and QR sizing against both dialog dimensions.
- [x] Re-run independent regressions remotely, types, lint and source policy (43 tests / 504 assertions; all four TypeScript projects; touched ESLint zero warnings; source policy 344 files).
- [x] Rebuild generated artifact with source snapshot guard; 60 real browser cases passed across Chromium, Firefox and WebKit, including landscape QR pixel decoding.
- [x] Reread repairs and triage scanner output; record exact results and remaining limitations.

Review evidence: `.tmp/fresh-eyes/regression-before.log` records both intentionally failing regressions (late note-first attack and premature Stop success); `qr-before.log` records the original landscape clipping failure. `all-gates.log` records 43 tests / 504 assertions, four TypeScript projects, touched ESLint, source policy (344 files), and guarded build. `adjacent-tests.log` adds 147 tests / 1,699 assertions across the other feature services and theory/export algorithms. No test retries, skips or weakened assertions were used.

Source-proof scope: the source and tests tracked at `c49412b` were hashed before the gates and checked unchanged afterward. A concurrent Git operation introduced untracked UI copies at `src/application/ChordPadsPanel.tsx`, `src/application/ExactShareDialog.tsx`, and `src/application/NoteFirstPanel.tsx`. They were preserved and excluded by exact path from the remote transfer, not from any compiler or source-policy rule. They are **not** covered by the green committed-source proof and must be reconciled by their owner before a local whole-tree release gate. Agent Mail messages 41214–41217 record the coordination.

Scanner triage: retained before/after/detailed UBS logs in `.tmp/fresh-eyes/`. UBS still exits nonzero (after: 222 critical-labelled heuristics, 500 warnings). Sampled critical classes are intentional null/undefined checks, public revision/generation comparisons misclassified as secrets, and locally declared download counters misclassified as globals. Other witnesses include a JSON.parse already inside try/catch and listener cleanup already in the component teardown. No blanket ignores or scanner-clean claim. Typed checks, source policy, negative regressions and actual browser adapter evidence remain the behavioral proof.

Final browser proof: real Node 26 / Playwright 1.61.1 ran `test tests/e2e/studio-qr-share.spec.ts tests/e2e/studio-note-first.spec.ts tests/e2e/studio-comping.spec.ts tests/e2e/studio-pads.spec.ts --config .tmp/fresh-eyes/playwright.config.ts --workers 1` with all four artifact environment variables pointing at `.tmp/fresh-eyes/candidate.html`. `browser-results.json`: 60 expected, 0 skipped, 0 unexpected, 0 flaky, duration 263,851.426 ms. All 60 evidence attachments match the candidate hash and contain no page/console errors; request assertions prohibit runtime network. Both themes and the 844 × 390 QR case pass in all three engines; independent libzbar decodes actual renderer pixels and rejects the missing-quiet-module negative control. Native audio, exact Manual-note insertion/undo/reload, rhythm MIDI/recipe downloads and pad cancellation regressions pass.

The source/test hash guard remained unchanged through completion. Promoted only the guarded remote build bytes: root artifact and `dist/index.html` SHA-256 `fb6bbd36dc4026d80aea26379be0efefd15100618088ea0ec3785e66314c47e1`, 8,621,237 bytes. Review repairs complete; no aggregate release, deployment, human listening/device acceptance, or clean UBS scan is claimed. The three unrelated untracked wrong-layer copies remain preserved for their owner.

### COD1 tactile entry continuation (2026-09-10)

Consumer: user-requested best-idea implementation; retire this checklist into
the note-first feature record after implementation and acceptance.

- [x] Select original COD1 tapping experience without bypassing blocked rehearsal/G9 owners.
- [x] Specify octave/spelling, exact occurrence edits and 16-note limits; hand-author MIDI and spelling fixtures.
- [x] Pass specification packet checks, then claim the implementation leaf.
- [x] Implement application keyboard selector and atomic draft edits using existing theory/domain validation.
- [x] Wire accessible on-screen keys, octave/spelling controls, occurrence removal and Clear.
- [x] Prove exact typed/keyboard mixing, duplicate retention, invalid-draft refusal, source rebinding and native audition/Add/Undo/Redo.
- [x] Pass RCH types/lint/source policy/guarded build and real Chromium/Firefox/WebKit phone-width cases; promote byte-identical artifact.
- [x] Fresh reread and regression proof; retain physical/player acceptance under `.3.3`.

Keyboard evidence (`.tmp/note-first-keyboard/`): `spec.log` passes the independently authored packet's 19 assertions and test-project types. `final-gates.log` passes 32 focused tests / 297 assertions, application types, owned ESLint with zero warnings, source policy (346 files), and the guarded build. All four TypeScript projects passed in `gates-fixed.log`; its subsequent lint failure identified an unnecessarily narrow runtime-validator parameter, corrected before the final gates. The earlier application-interface omission was also fixed. No compiler or lint rule was weakened.

`mutants.log` records four actual production defects killed by behavioral assertions: deduplicating occurrences, removing the wrong occurrence, reversing flat spelling, and allowing a prepared audition to attack after a draft edit. Restored production passes the same integration suite: 4 tests / 120 assertions. Fixtures were hand-authored before production; mutation output did not regenerate expectations.

Real Node 26 / Playwright ran `test tests/e2e/note-first-keyboard.spec.ts tests/e2e/studio-note-first.spec.ts --config .tmp/note-first-keyboard/playwright.config.ts --workers 1`, with `JCPE_KEYBOARD_ARTIFACT` and `JCPE_NOTE_FIRST_ARTIFACT` pointing at `candidate.html`. `browser-results.json`: 15 expected, zero skipped/unexpected/flaky, 76,163.419 ms. All 15 evidence attachments match SHA-256 `a954be1979b0b8d0ffb64faccc0751e428bf603a602611b0b13d4af0acb9df3a`, with no page/console errors or runtime network requests. Original tests also record permitted initial/reload navigation to the local artifact. Three engines cover 320px/desktop, native touch and keyboard activation, exact Add/Undo/Redo downloads, real audio, invalid input, octave limits, 16-note capacity, focus after removal, Axe and overflow. Chromium phone/dark and desktop/light screenshots were visually reviewed.

The 361-file source hash map remained unchanged, including the exact file set, before promotion. Root and `dist/index.html` now contain the same guarded 8,626,490 bytes (5,253 bytes added; 286,406 bytes of shell headroom plus the untouched Atlas reserve). Verification retains the exact three-file transfer exclusion documented above for the unrelated wrong-layer UI copies; those files remain untouched and whole-worktree release readiness is not claimed. Implementation `.3.5` is complete; existing physical/player verification `.3.3`, package epics, dropout dependencies and reopened G9 remain open. No commit or deployment was performed for this extension.

### Guitar positions while composing (COD1 + COD4, 2026-09-11)

Consumer: the owner's continued implementation request. This connects the two
working finalists; retain physical/player acceptance under `.3.3` and `.4.3`.

- [x] Confirm that saved-chord guitar positions exist but drafts cannot use them.
- [x] Specify draft/source authority and hand-author exact-position fixtures before implementation (`.4.4`).
- [x] Pass specification checks; claim `.4.5` only afterward.
- [x] Add pure application draft-position read with current-source and parser validation.
- [x] Share diagrams/tables with saved-chord view; add lazy draft disclosure and owned audition.
- [x] Prove live edits, exact unisons/spellings, no-position, stale hiding, selection reset and unchanged chart.
- [x] Run RCH focused tests, four TypeScript projects, owned lint/source policy and guarded build; kill four semantic mutants.
- [x] Trace browser execution failures; repair missing worker audio infrastructure while retaining original assertions, timeouts and failed receipts.
- [x] Find and fix the existing export/recovery defect exposed by the native regression suite, with an independently written failing test first.
- [x] Prove marker-refresh success and refusal after newer edits, stale delivery and quota failure; rerun lifecycle/recovery regressions and source gates.
- [x] Complete all 33 real-browser phone/desktop cases, including existing guitar/note-first regressions; inspect receipts/screenshots and promote only unchanged-source guarded bytes.
- [x] Finish exact evidence and close `.4.5`; keep physical/player `.3.3` and `.4.3` open.

Source evidence lives in `.tmp/note-first-guitar/`. The independently authored
specification packet passes 16 assertions. `recovery-gates-fixed.log` passes
52 guitar/note-entry tests / 912 assertions plus 67 lifecycle/recovery tests /
414 assertions: **119 tests / 1,326 assertions**, all four strict TypeScript
projects, owned ESLint, source policy (347 files), and guarded Bun 1.3.14 build.
Initial nullable/indexed test values were fixed with explicit validation, without
changing expected values or weakening compiler/lint rules.

`mutants.log` kills actual duplicate collapse, occurrence reversal, ignored
document identity and ignored revision; restored selector production passes
3 tests / 277 assertions. That selector is unchanged in the rebuilt artifact.
Native tests exercise real audio, storage and downloads; the small integration
audio double proves ownership, not physical listening quality.

Browser failures remain inspectable. The two local runs recorded 9 passes /
2 failures before stopping, then 8 passes / 3 failures / 1 interrupted with the
documented `LP_NUM_THREADS=4`. Long workflows exhausted the unchanged 30-second
total budget. The renderer setting alone did not fix this local timing
limitation; no local performance repair is claimed. The same complete suite
moved to hz2 through RCH. Chromium passed, but Firefox's existing and new audio
checks exposed an absent worker audio server. PulseAudio 17 with its native
local `auto_null` sink fixed that prerequisite; a real Node/native AudioContext
preflight passes in Chromium 149.0.7827.55, Firefox 151.0 and WebKit 26.5.
This is an OS audio backend, not a mock Web Audio implementation. The first
worker report remains at `test-results/draft-guitar-run/`.

The first complete corrected-environment matrix (`draft-guitar-final`) was
32/33. Its WebKit desktop reload failure initially appeared to be Export racing
recovery, so the existing test was strengthened to await “Recovered chart
opened” before its unchanged exact-document comparison. The next complete
matrix (`draft-guitar-verified`) remained 32/33: that explanation was incomplete.
Targeted native diagnostics (`draft-guitar-recovery-debug` and
`draft-guitar-recovery-storage`) recorded no post-reload input and inspected real
IndexedDB. The revision 6 recovery envelope still carried revision 5 `lastExport`
beside a durable revision 6 export binding. The app correctly offered Keep for
that mismatch; successful export had never queued a refreshed recovery envelope.

`recovery-red.log` proves the new production lifecycle/A1 test failed before the
fix: 23 pass / 1 failure, missing queued refresh. Successful marker persistence
now queues the exact current document through existing recovery scheduling,
only if its document ID and revision still match. A late storage completion
cannot queue an older chart, and failed/stale exports queue nothing. The new
positive and late-edit controls, existing negative controls, and cold-service
startup checks pass in the 67-test recovery set. The complete matrix at `test-results/draft-guitar-recovery-fixed/` passes
**33/33**, zero skipped/unexpected/flaky, in 220,902.453 ms. No assertion,
timeout, retry count, CSP or browser matrix was relaxed.

Verification retains the exact three-file transfer exclusion for unowned
`src/application/ChordPadsPanel.tsx`, `src/application/ExactShareDialog.tsx`, and
`src/application/NoteFirstPanel.tsx`. Those files remain untouched. Whole-tree
release readiness, physical acceptance and deployment are not claimed.


Final browser command (RCH hz2, pinned real Node 26):
`node node_modules/@playwright/test/cli.js test tests/e2e/note-first-guitar.spec.ts tests/e2e/studio-guitar.spec.ts tests/e2e/note-first-keyboard.spec.ts tests/e2e/studio-note-first.spec.ts --config test-results/draft-guitar-recovery-fixed/playwright.config.ts --workers 1`.
The runner binds all four artifact environment variables to the same guarded
candidate. All 33 machine-readable evidence attachments match SHA-256
`3cd5aea9ee98647b44d5d4dbca6d8dd05a79c1d9f2b4eaa137e94412f0b168c9`;
none records page/console errors or runtime network requests. Existing cases
also record allowed initial/reload navigation to the local artifact. The matrix
covers Chromium/Firefox/WebKit, 320px/desktop, dark/light presentation, touch and
keyboard entry, exact duplicate/spelling tables, live edits, stale hiding,
no-position boundaries, native audition/release, unchanged chart until Add,
exact Add/Undo/Redo and automatic recovery downloads, Axe and overflow. Both
Chromium screenshots were visually reviewed.

The exact 362-file source set and hashes remained unchanged before promotion.
Root HTML and `dist/index.html` now contain the same guarded **8,628,372 bytes**,
1,882 bytes above the prior keyboard build, leaving 284,524 bytes of shell
headroom plus the untouched 524,288-byte Atlas reserve. The corresponding
standalone manifest is in `dist/`. Implementation `.4.5` is complete; physical
verification `.3.3`/`.4.3`, package epics, dropout prerequisites and reopened G9
remain open. No Git commit, push or deployment was performed by this session.

## Explicit short WAV excerpts (2026-09-11, CyanCove)

- [x] Recover live Beads/Agent Mail/Git state and read WAV/timing/layer contracts.
- [x] Identify observed gap: no way to select four later bars from a longer chart.
- [x] Specify opt-in one-based chart/section bar ranges and unchanged audio limits.
- [x] Author independent ticks for rests, fractional pickups, cross-section ranges.
- [x] Pass specification fixture gate (RCH hz2: 1 test, 12 assertions); close `.8.4`, claim dependent build `.8.5`.
- [x] Implement bounded exact original-document range resolution and refusals.
- [x] Wire excerpt intents/view and accessible first-bar/count UI into existing WAV.
- [x] Preserve full-context P0, exact note occurrences, source state and dry route.
- [x] Test invalid ranges, source limits, rendering/hashing cancellation and stale bytes.
- [x] Decode actual later-excerpt PCM and browser downloads, retaining leading silence.
- [x] Run RCH focused tests/types/lint/source policy/guarded build and native browser matrix.
- [x] Fresh-eyes review, exact evidence and source-bound generated artifact promotion.
- [x] Close build `.8.5` after named gates; leave `.8.3` physical memory/listening open.

2026-09-11 06:05 UTC: Explicit WAV excerpt implementation `.8.5` passes its named
automated gates. Choose specific bars within a longer chart/section; full-context
P0 retains exact spelling/register/order/duplicates and rational rests/pickups.
Range edits cancel rendering/hashing and clear old downloads. Existing dry-piano
limits, source immutability, and whole-chart/section defaults remain in force.

Evidence: RCH hz2, Bun 1.3.14 and Node 26.0.0; `.tmp/wav-excerpt/gates-final.log`
contains 30 tests / 225 assertions, zero failures, focused final types, owned lint,
source policy 348 files / zero findings, and guarded build. All four type projects
passed in `gates-typed.log`; changed test projects were rechecked after correcting
the Promise-returning test hash port's lint issue. Four semantic mutations (wrong
section offset, off-by-one start, dropped rest time, five-bar admission) were killed
by actual failing assertions in `mutants.log`; source restoration was verified.

Native results `test-results/wav-excerpt-restored/browser-results.json`: 24 passed,
0 skipped/unexpected/flaky, retries 0; 139,029.256 ms. Chromium 149.0.7827.55,
Firefox 151.0, WebKit 26.5; 320/1280 widths and light/dark. Every artifact-bound
receipt has zero console/page errors and runtime network requests. Axe and overflow
checks pass. Actual downloads independently decode to 537,644-byte stereo PCM16
WAVs with 64,000 silent leading frames; chart bars 5–6 and section bars 2–3 are
byte-identical. Existing whole-passage native WAV cases pass unchanged.

Root/dist are byte-identical at SHA256
`3f16acb3b339e13febaef0d9480a670303c298c822aa43755ca300922d2f7cc9`,
8,631,170 bytes. All 363 scoped source file hashes matched before promotion;
281,726 shell-budget bytes remain plus the reserved 524,288 Atlas bytes. The three
pre-existing unowned application-layer UI copies remain untouched and excluded
from scoped RCH transfer; this is not a whole-tree release/deployment claim.

Failed evidence retained: initial fixture used unnormalized stored durations
(corrected to exact 1/3, 5/2, 4/1 without changing expected ticks); branded-value test
assertions needed explicit primitive projection; one async test adapter needed a
Promise return; RCH admission needed stale-own-lease recovery. Initial browser run
could not launch missing pinned executables (0 pass / 24 failures); restored the
same browser versions into a task-owned cache and reran the full unchanged matrix.
No assertion, timeout, retry, gate or acceptance requirement was relaxed.
Fresh-eyes self-review and honesty inventory found no inflated completion or
weakened gate. No deployment was performed. Original `.8.3` physical-phone
memory/listening verification and parent epic remain open.

## WAV excerpt production release (2026-09-11, jcpe-sho1)

- [x] Recover exact tested artifact/source identity and claim release lane.
- [x] Rebuild matching bytes via RCH; commit only completed artifact/TODO/Beads and push.
- [x] Pass mandatory model acceptance, instrument quality, and native playback gates.
- [x] Upload committed HTML and share image to Cloudflare Pages and Vercel.
- [x] Poll both public hosts until their bytes match the committed artifact.
- [x] Verify live boot and WAV excerpt download at phone/desktop widths with real browsers.
- [x] Record host/commit/hash/evidence and close deployment task; retain physical acceptance limits.

2026-09-11 19:31 UTC: User-requested production release `jcpe-sho1` completed.
Both `https://jazzchords.org/` and
`https://changes-jazz-progression-studio.vercel.app/` serve committed artifact
`ace028f1964f6d199f44304ce91f5fb47fae66d1`, SHA256
`3f16acb3b339e13febaef0d9480a670303c298c822aa43755ca300922d2f7cc9`,
8,631,170 bytes. Both matched on the first post-upload poll.
Cloudflare deployment: `a3bd32bd.jazz-chord-progression-editor-html.pages.dev`.
Vercel deployment: `dpl_3edpr5HWQhNMMWe5PtPztHXmWKvU`, READY, production alias set.

Release gates used unchanged checked-in programs on RCH hz2, Bun 1.3.14 and
real Node 26.0.0: guarded rebuild exactly matched the tested artifact;
`bun run predeploy:check` passed all 11 shipping model rows and instrument
quality (9 rendered instruments, zero fail findings; warning diagnostics retained).
`node scripts/check-predeploy-playback.ts <committed-artifact> --json ...`
passed all 15 instruments with zero console/page errors. Recovery enforcement
remained enabled; its PASS was explicitly vacuous because no refusal reproduced.
Evidence: `.tmp/wav-release/gates-corpus.log`,
`test-results/instrument-quality/instrument-quality-v2.json`, and
`test-results/wav-release/playback-gate.json`.

Uploads used the same two committed public assets and targets as `bun run deploy`;
the gates were executed remotely through RCH and authenticated uploads locally.
Session-only launchers set the required HTTP User-Agent without editing gates,
assertions, timing, or production code. The saved Wrangler login succeeded after
the environment API token returned 10000; no global credentials were changed.
The stale unmanaged RCH listener had no active/queued builds, ignored SIGTERM,
and was terminated before the healthy listener resumed. The ignored UIowa corpus
was restored to the worker from six locally SHA-verified manifest-pinned files.
All failed infrastructure/prerequisite logs remain under `.tmp/wav-release/`.

Live native Chromium 149.0.7827.55: 8/8 cases, two hosts x light/dark x 320/1280;
zero skipped/retried/flaky cases, console/page errors, unexpected requests, axe
violations, or panel overflow. Every real WAV download retained its independently
expected 537,644 bytes and 64,000 silent leading frames. Chart bars 5–6 and section
bars 2–3 were byte-identical on both sites, and chart revision stayed unchanged.
Phone screenshots were inspected. Reports: `test-results/wav-release-live/host-0.json`
and `host-1.json`; exact receipt summary `.tmp/wav-release/live-evidence-summary.json`.
No Cloudflare beacon error occurred in these browser sessions; this does not claim
the platform injection is permanently disabled. Original `.8.3` physical-device
memory/listening verification remains open. No release gate was weakened or skipped.
