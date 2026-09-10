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

- [ ] Reconcile finite rehearsal owner and prerequisite acceptance
- [ ] Specify four-bar passage repeated four times with 2-on/2-off mask
- [ ] Integrate occurrence masks preserving phase, releases and preview ownership
- [ ] Add count-in, Stop and return display through existing transport
- [ ] Verify real timing, pause/seek/replacement and no false grading claims
- [ ] Pass focused tests, typecheck, lint/boundaries, artifact size and applicable real-browser gates.
- [ ] Record independent acceptance and close all three phases before package.

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

2026-09-10 13:30 UTC: Thirteen finalists are implemented through eleven packages, now including exact QR sharing. QR `.10.2` has passed all named implementation gates; independent/physical-phone `.10.3` remains open. Dropout specification is next; its build still waits on rehearsal/U4. Ear training remains blocked by reopened G9 prerequisites. All independent verification leaves and package epics remain open.

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
