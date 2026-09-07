# Rehearsal sessions

Consumer: `jcpe-rehearsal-session-6y2b.1` and its dependent implementation/key/
verification leaves. This packet specifies a new workflow; it does not claim
that rehearsal is implemented or that existing release/human gates have passed.
The code-facing sequence types are in
`src/playback/rehearsal/session-contract.ts`. Independent examples are in
`tests/fixtures/rehearsal/cases.json`.
Retire the proposal status when the four dependent phases implement and verify
this version; retain its literal examples as regressions until that version is
retired. This specification earns no runtime capability credit.

## 1. What a musician does

Select a passage and choose Practice. Setup defaults to the selected exact
range, four passes, the current chart tempo/key/groove, and one bar of count-in.
With no selected range, use the selected event; with neither, use the full
chart. Show the resolved scope before Play. Never convert an invalid or stale
range into the whole chart. A zero-length chart/range cannot start.

More exposes start/end tempo, passes per key, count-in, and explicit key order.
Key sequencing is a separate dependent leaf: it is unavailable until the H1
verified transformation boundary exists. Same-key rehearsal never waits for
that implementation. The build leaf DOES wait for the existing U4 verification;
this packet does not reassign or bypass its owner.

Play prevalidates the complete request before scheduling sound. Setup closes
after accepted admission, leaving the chart and persistent transport visible.
A compact practice status shows the pass actually audible, total passes, its
tempo and key, and Pause/Resume, Restart and End practice. Global Stop remains
reachable and stops both progression and preview. The app never hides transport
behind the setup dialog while a rehearsal is sounding. Escape cancels setup;
it does not silently stop an admitted session. No scores, accounts or tracking.

The chart's document, stable IDs, exact fractions, Manual/Frozen pitch order,
annotations, history, dirty/export markers and recovery never change merely
because rehearsal starts, advances, pauses or ends. Temporary tempo/count-in/
scope overrides belong to the session. Ordinary instrument/mix changes retain
their existing user authority; ending practice never rolls those changes back.
The ordinary chart tempo and loop intent remain stored as before and resume
their normal meaning after End, with no automatic restart of prior playback.

## 2. Exact scope and arrangement

Use A0's `selectBeatRange` over stable range bookmarks. Otherwise resolve the
selected event from the accepted timeline, or choose `[0,total)` explicitly.
Copy the resolved normalized range and bind it to the exact document reference,
document ID and revision. An unavailable bookmark refuses; equal musical IDs
do not make a replaced document reference current.

Complete, pickup, incomplete and empty measures follow the existing P0
timeline. Their widths are not inferred from a screen grid. An empty measure
occupies its full meter capacity; an empty section occupies zero. A nonempty
range containing only explicit rests remains a valid silent passage: report
that it has no notes and retain optional metronome/count-in behavior. It must
not acquire a borrowed bass note or chord to make the display look active.

The current defect is specific: `compilePerformancePlan` refuses a looped plan,
so the application falls back to literal pads. P0 actually preserves absolute
source positions; it does not rebase loops to zero. The new composition order is:

1. Realize and compile the complete source chart without a loop.
2. Perform that full plan with the selected reviewed groove and its complete
   source bar/cycle/voice-leading context.
3. Project the resulting immutable performance into the chosen range.

Do not perform an already clipped chart: doing so changes pickup positions,
bar-cycle phase, incoming bass placement and comp continuity. Do not remove the
old performance refusal without supplying the missing full-chart context.
The new rehearsal path surfaces a performance refusal with its real cause;
it never silently substitutes literal playback. Ordinary loop integration uses
the same perform-before-project helper and retains its existing X1 infinite-loop
ownership. Existing loop-free performance and all its tests remain unchanged.

For a performed event `[S,E)` and selected `[L,R)`, include exactly when
`S<R && E>L`. Preserve absolute time: start=`max(S,L)`, end=`min(E,R)`.
Retain pitches in their exact order, source spelling, velocity, event/source/
section/measure identity, source ordinal and full-chart totals. Increment the
existing source offset only by `newStart-oldStart`; retain original source
duration/start. Reassign contiguous output ordinals after filtering.
Set the P0 articulation kind from the actual left/right clipping, then compute
its existing gate `max(1,durationTicks-24)` and exact rational mirrors. No
additional groove clearance or arbitrary gap is introduced at the boundary.
An end at L and a start at R are excluded; spanning both boundaries emits one
restarted/clipped event. Empty projected arrays are preserved as silence.

## 3. Finite sequence and tempo authority

`RehearsalSequence` contains projected immutable templates and at most64 pass
descriptors. A pass references one template and an admitted integer tempo;
it does not duplicate the template's event array. Templates retain their source
chart tempo; the pass descriptor explicitly owns rehearsal tempo. At audio
admission, derive a small immutable plan header with that tempo over the same
events, so gesture compilation and beat-to-second conversion use the same
actual tempo. Never relabel a plan while timing it with another tempo.

Templates follow the explicit key order; each gets `passesPerKey` consecutive
passes. Total=`templateCount*passesPerKey`, checked before compiling/rendering.
Same-key uses one template, including a null key for a chart with no declared
key. An all-key request requires an explicit source key and H1's checked spelled
transformations; no inferred key, octave folding, range repair or mode change.
The all-key convenience order is the explicit ascending tonic table
`C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B`, starting at C. Show this order before
admission; preserve the source mode for each tonic. The independent packet pins
each spelling, including double accidentals when required by a written interval.
H1 still owns admitting those transformations; this table cannot bypass a range
or spelling refusal. Custom order retains user order, including intentional
repeats, within12 entries and64 total passes.

Tempo endpoints are integers20..400, admitted by `makeTempoBpm`. With N>1,
pass i has `start + sign(end-start)*floor((2*abs(end-start)*i+N-1)/(2*(N-1)))`.
This is nearest-integer interpolation, exact in integer arithmetic, with ties
moving toward the requested endpoint. N=1 requires equal endpoints; it never
silently ignores a different end tempo. Equal endpoints preserve fixed tempo.
No document tempo commands or intermediate history/recovery writes occur.

Every template must have the same source identity, full timeline, meter and
selected range; explicit H1 transforms may change pitches/spelling/key but not
time or source ordering. Reject the whole request if any key, realization,
performance, range, resource bound or native render preflight fails. Display the
first failing key/pass and the original cause; do not play a successful prefix.

## 4. Existing X1 scheduler, additive finite-play boundary

The proposed extension is the optional, versioned `rehearsalSequence` field on
the existing `play` payload. Absence preserves every original X1 law. Its source
binding and first effective plan must match `binding`; `startBeat` must equal
the selected left boundary. The application cannot attach this extension to
set-loop/set-tempo/replace-plan. Invalid extensions refuse before retiring any
current voice or changing state. No new command kind, second command queue,
second timer, second graph or direct UI/audio path is introduced.

A finite sequence is an ordered program of event occurrences, not an infinite
loop stopped later by a timer. The existing horizon scheduler traverses its
pass/event cursors, bounded by the declared pass/event limits. Each occurrence
has identity `(session request, pass ordinal, template event ordinal, voice)`.
X0 uses a disjoint bounded `x1:rehearsal:` occurrence ID; the template's musical
event IDs remain unchanged and appear separately in diagnostics. Reusing a
voice ID on the next pass is forbidden. A finite sequence uses the run's
generation; ordinary X1 infinite loops retain their separate wrap-generation
law. No generation is invented merely to render a pass counter.

The audio epoch for pass i starts after the exact durations of all previous
passes and the optional initial count-in. Each duration is
`rangeTicks/960 * 60/passTempo`; only the audio layer converts this expression
to seconds against its captured AudioContext clock. Playback plans contain no
wall times. Schedule every event whose absolute attack enters the horizon,
including multiple short passes in one tick. Never wait for the UI or for a
natural-end notification to submit another Play. Stop and generation guards
invalidate every future occurrence together.

Track the scheduled cursor separately from the audible position. Pre-scheduling
pass2 does not change the visible pass1 tempo/key/playhead. The proposed pure
`readRehearsalTransportProgress` derives the audible pass from the audio epoch
map, just as the existing display playhead read does. It publishes no A0 state
and changes no work counters. Normal status changes retain existing monotonic
request/revision/generation/notification ownership; the application renders the
practice projection only while its exact source/session binding remains current.

Count-in is exactly one existing X1 click bar at the first pass tempo, once per
new Start/Restart and never on an ordinary Resume. Metronome follows the current
audible pass tempo and existing click policy. Preserve source bar phase within
the selected passage; count-in does not rewrite pickups. Outgoing releases are
not retired when the next pass first enters lookahead. Notes retain the projected
gate and existing X0 envelope-floor/recipe laws. Natural completion uses the
existing8-second maximum tail cleanup; explicit Stop retains its strict
no-future-attack receipt and0.012-second stop ramp.

## 5. Lifetime and UI authority

One application-owned preparation/session exists. Setup edits invalidate its
prepared result. Late compilation/render settlement checks both the operation
token and exact document reference/revision before publishing readiness.
Cancel, host removal, replacement and a newer request retire the old token.
Starting a session while transport is active first obtains the existing
serialized Stop receipt; it cannot overlap a rehearsal and ordinary run.

Pause stores the audible pass and exact source beat, retires the entire future
schedule and leaves remaining descriptors immutable. Resume starts a fresh
epoch at that position, with no repeated count-in or missed-note burst.
Backgrounding uses the existing platform interruption/pause authority even if
that browser leaves its AudioContext running; it never advances the practice
position during hidden time. Resuming requires an explicit trusted gesture.
A callback that arrives after a pass boundary was missed due to suspension or
page hiding cannot use the native short-clock-drift catch-up policy to fire
the missed passage. Preserve that normal admission policy for ordinary small
clock movement; do not weaken X0 or manufacture a browser interruption result.

A source edit, Undo/Redo or replacement invalidates rehearsal and requests
serialized retirement. Do not render Ended before the actual Stop receipt.
Late preparation/status/results from the previous source cannot repaint the
new chart or start notes. A refused retirement remains visibly unresolved;
never certify no-future-attacks from an optimistic status.

Rehearsal owns its temporary range/tempo. During it, ordinary free seeking,
loop-scope changes and chart tempo editing require End practice first; render
the reason and retain Stop/End, not a silently inert control. Instrument/mix,
metronome and preview keep their existing explicit authority. Restart is one
application intent that awaits retirement and starts pass1 on the same graph.
Setup uses the existing single-dialog/focus host; active practice uses a compact
nonmodal status with the source chart's written notation and an explicit audible
key/tempo label. Export still exports the unchanged current chart, never secretly
the repeated or transposed practice sequence.

## 6. Bounds and diagnostics

Limits are closed in `REHEARSAL_LIMITS`:12 templates,64 total passes,8192 source
events per template,786432 full-performance input visits,65536 retained projected
events,262144 retained pitch slots and4194304 pass-event visits. Source timeline
remains at P0's960000000 ticks; expanded duration is at most61440000000 ticks.
There is one pending preparation and one active session. Existing P0/performance/
X0 queue, voice, render, ID and work caps remain mandatory and may refuse first.
The64-pass cap is not a promise that every maximum-size chart fits every other
resource bound. Checked counters and failing resource/maximum/attempted values
explain the actual refusal; no quota eviction or silent shortened session.

Count successful visits/allocations in `RehearsalWork`; check the next increment
before allocating beyond a limit. A limit refusal reports its attempted value
separately. Stop/cancel releases prepared plan references, source subscriptions
and render ownership. Templates share immutable arrays; do not retain64 full
document copies. Native heap samples are performance evidence, not a claim that
JavaScript object sizes are portable musical limits.

Precedence: request/schema/source binding, key-count bounds, pass-count/expanded
pass bounds, tempo bounds, exact
range, template identity/shape in declared order, source transform/performance
cause, retained work/memory bounds, then whole-session native preparation.
Application cancellation/staleness is checked around every awaited boundary
and supersedes publication of that old result. No elapsed-time search cutoff.

## 7. Independent proof and phase gates

The literal fixture packet must cover three passes with bass and comp attacks
and releases; pickup/partial/empty bars; left/right/both-edge clipping; at-edge
inclusion/exclusion;64/65 passes;12/13 key entries;20/400 BPM and near misses;
tempo ties in both directions; one-bar count-in; very short passes within one
horizon; and the difference between an audible pass and a scheduled pass.
State cases cover cancel/stale preparation, failed render/retirement, source edits,
pause/resume, background interruption, Stop, natural tails and final cleanup.
Key proof includes all12 pitch classes and inverse transposition of the full
Manual/Frozen/spelling/unison witness, with honest out-of-range refusals.

Specification gates: `bun test tests/static/rehearsal-contract.test.ts`, app/
test-project TypeScript and owned ESLint. These prove the packet, not playback.
Build gates: `bun test tests/unit/rehearsal-session.test.ts
tests/integration/rehearsal-session-integration.test.ts`, unchanged relevant P0/
performance/X1/U4 suites, and native `tests/e2e/rehearsal-session.spec.ts` with
one worker. Verify replays independent fixtures and actual source mutations:
literal fallback, shifted bar phase, missing bass/comp pass, duplicate occurrence
ID, early retirement, skipped pass, endpoint/tempo rounding, over-cap expansion,
stale source acceptance, false Stop receipt and background catch-up.

Native proof uses real Node/Playwright, Chromium/Firefox/WebKit, file/loopback,
1280 desktop,390x844/320x568 touch, keyboard/200% layout and reduced motion.
Record exact source/fixture/artifact hashes, expected/actual schedules and
documents, requests/errors, engine/generation/voice/listener counts, receipts,
resource limits and retained failures. No retries/skips/quarantines or relaxed
gates. Specification closure does not certify any runtime checkbox; build waits
for U4 verification; key implementation waits for H1 verification; the parent
waits for all four phases. Aggregate release/predeploy/committed-byte deployment
and existing human listening/accessibility gates remain unchanged.
