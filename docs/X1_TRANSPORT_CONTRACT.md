# X1 Serialized Transport Contract

Status: reviewed specification and independent fixture authority  
Contract schema: `changes.audio.transport-contract.v1`  
Transport policy: `changes.audio-transport@1`  
Scheduler policy: `changes.audio-transport-scheduler@1`  
Click policy: `changes.audio-transport-click@1`

This document, the public contract in `src/audio/transport-contract.ts`, and
the reviewed files under `tests/fixtures/transport/` are the complete
code-facing X1 authority. An implementer does not need the legacy file or
`docs/REBUILD_PLAN.md` to build X1. Production output may be checked against
these records; it may not create, rewrite, bless, or weaken them.

## 1. Ownership and layer boundary

X1 owns the transport state machine, the serialized command queue, the
control-thread lookahead scheduler, generated count-in/metronome click
events, chord preview command ownership, the natural-end deadline, browser
interruption handling, and monotonic transport notifications.

The transport lives in the audio layer and may import only `domain` and
`playback`. It calls the seven X0 engine operations through the injected
`TransportPlatformPort`; it never constructs a Web Audio object, imports
application/UI/persistence/export code, parses a chord symbol, chooses a
voicing, or reads a document. The application compiles P0 plans, wraps them
in a `TransportPlanBinding` with the exact document ID and plan revision,
and submits serialized commands. The UI never calls X1 directly.

Musical time authority is exact: plan beats are rational `BeatPosition`
values, and audio seconds exist only as `seconds = beats * 60 / tempoBpm`
against a captured audio-clock anchor. Wall timers, `Date`, and
`requestAnimationFrame` cannot define musical time; the animation frame is
display-only interpolation in the UI layer.

## 2. State machine

```text
locked --initialize-transport (trusted gesture)--> ready
ready --play--------------------------------------> playing
playing --pause-----------------------------------> paused
paused --resume-----------------------------------> playing
playing/paused --stop-----------------------------> ready
playing/paused --seek-----------------------------> unchanged status at target
playing --plan exhausted (natural end)------------> ready at run startBeat
ready/playing/paused --browser interruption------> interrupted
interrupted --resume (trusted gesture)------------> prior stable state
interrupted --stop--------------------------------> ready
any nonterminal --fatal engine/platform error----> fault
fault --initialize-transport (trusted gesture)---> ready
any nonterminal --dispose-transport--------------> disposed (terminal)
```

State transitions are serialized: one command completes its transition,
including every awaited X0 receipt, before the next command begins. Queued
commands run in strict FIFO admission order. The queue retains at most 32
commands; an overflowing submission refuses with
`transport.queue_overflow` and mutates nothing.

Every epoch boundary in `TRANSPORT_GENERATION_BOUNDARIES` increments the
transport generation exactly once and retires the outgoing progression
generation through X0 before the new epoch may schedule. No callback —
scheduler tick, engine settlement, or timer — may act without first
checking that its captured generation is still current; a stale callback
increments `staleCallbacksIgnored` and does nothing else.

## 3. Command envelope and refusal law

A `TransportCommand` carries a positive safe-integer `commandRequestId`
strictly greater than every previously submitted ID, plus one payload from
the closed fifteen-kind union. Unknown kinds, malformed payloads, and
non-monotonic IDs refuse before any state read. Validation follows
`TRANSPORT_REFUSAL_PRECEDENCE` exactly; a refusal is total — it changes no
state, retires no voice, publishes no notification, and appends only one
bounded debug event plus cumulative work counters.

A command that reaches X0 and is refused there completes as
`transport.engine_refusal` carrying the exact `AudioEngineRefusalCode`.
An engine fault during a command settles the command as `fault`
termination, enters the `fault` state, retires what X0 still owns, and
publishes one `failed` notification with a stable code.

`initialize-transport` and a `resume` that recovers from `interrupted`
require an `AudioUserGestureReceipt` with a strictly increasing sequence;
an ordinary `resume` from `paused` may carry `null`.
`initialize-transport` additionally carries the complete initial
`AudioMix`, forwarded to the X0 engine initialization unchanged, and a
view-identity echo (`documentId`, `planRevision`) matching the
application's expect-transport intent so the initial `ready` notification
can satisfy the A0 acceptance law before any plan is bound. An invalid mix
is refused by X0 and surfaces as `transport.engine_refusal`. Timing policy is
validated at initialization: tick interval 10–100 ms, lookahead 0.05–0.2 s,
and lookahead strictly greater than one tick interval. The 0.2 s ceiling
leaves an explicit 0.05 s margin under X0's 0.25 s attack admission window,
so a scheduled attack can never be refused for lateness by construction.

## 4. Plan binding and replacement

`play`, `set-tempo`, `set-loop`, and `replace-plan` carry a
`TransportPlanBinding{plan, documentId, planRevision}`. The binding is
validated structurally (schema, compiler version, event ordering, exact
total beats) before any state change:

- `play` requires `startBeat` in `[0, plan.totalBeats]` and binds the run's
  document ID and plan revision.
- `set-tempo` requires the same `documentId` and a strictly greater
  `planRevision` (a tempo change is a document edit). It retires only the
  not-yet-attacked lookahead horizon, maps the current exact beat position
  onto the new tempo at a new epoch, and lets already sounding voices decay
  naturally so sounded notes never jump.
- `set-loop` requires the same `documentId` and the same `planRevision`
  (loop is ephemeral transport state, not document data) and a plan whose
  embedded `loop` equals the command's declared range. A null loop clears
  looping. The loop range must satisfy the P0 loop policy; a reversed,
  empty, or out-of-range loop refuses as `transport.loop_invalid`.
- `replace-plan` (import, New, or a non-tempo document edit while playing,
  paused, or previewing) first retires the progression generation and every
  preview through X0, awaits the no-future-attack receipts, then publishes
  the replacement binding at `ready` with playhead at the new plan's start.
  A null binding empties the transport back to `ready` with no plan.

A binding whose `documentId` or `planRevision` violates these rules refuses
as `transport.plan_mismatch` without touching the running epoch.

## 5. Lookahead scheduler

The scheduler runs on the injected timer port at the initialized tick
interval and schedules a bounded horizon against the audio clock:

1. read the current transport generation and `currentTimeSeconds()`;
2. abort silently if the generation changed (stale tick);
3. map `[now, now + lookaheadSeconds]` to exact beat positions through the
   epoch anchor (`anchorContextTime`, `anchorBeat`, plan tempo);
4. schedule each not-yet-scheduled plan event in range exactly once, in
   ascending `startTick` order, as one X0 attack batch per event with
   absolute audio-clock start/release seconds derived from exact beats;
5. record the scheduled event cursor;
6. handle loop wrap by crossing a `loop-wrap` generation boundary at the
   loop end and re-anchoring at the loop start without recreating the
   graph;
7. stop ticking when no unscheduled work remains and no loop is active.

Event gate time uses the plan's exact `gateDurationBeats`; the P0
release-gap policy already guarantees a positive gate no longer than the
event. When the exact gate converted to seconds falls below the X0
envelope floor of 0.005 s, the audio attack uses
`max(gateSeconds, 0.005)`. This audio-envelope floor is a frozen
deterministic law of the scheduler: it applies only to the Web Audio
release time, never to beats, ticks, MIDI export, or the plan; it can
only lengthen, never silence; and it is witnessed by golden cases
X1-TIME-013/014. Note-off before note-on at a shared boundary is X0's retrigger law;
the scheduler simply issues batches in exact order and never reorders,
merges, drops, or clips an event. Attack velocity is the plan's event
velocity. One plan event maps to at most one X0 batch per epoch; a batch
holds that event's pitches (P0 caps pitches per event at the X0 batch
ceiling of sixteen).

## 6. Stop guarantee

`stop()` provides the testable postcondition: after its promise resolves no
stale scheduled attack can begin. Implementation order is frozen:

1. serialize the transition (the command owns the queue head);
2. increment generation;
3. clear the scheduler timer handle and control state;
4. retire the progression generation and every preview through X0 with the
   0.012 s stop ramp;
5. await every X0 retirement receipt and require
   `noFutureAttackPostcondition === true` on each;
6. clear the scheduled event cursor and playhead anchors;
7. set playhead to the run's `startBeat`;
8. publish one `ready` notification.

The receipt's `noFutureAttackPostcondition` is true only after step 5
completes. Stress evidence inspects the fake audio log after Stop and
requires zero later attacks across rapid play/stop cycles.

## 7. Pause, resume, seek, natural end, and interruption

- `pause` computes the exact paused beat from the current anchor, crosses a
  generation boundary retiring the sounding epoch, stores the paused beat,
  and publishes `paused` with the playhead at that beat.
- `resume` creates a new epoch anchored at the paused beat.
- `seek` uses the same retirement path, sets the target beat (refusing
  outside `[0, plan.totalBeats]`), and republishes the prior status —
  a paused seek stays `paused`; a playing seek resumes at the target.
- Natural end: when the cursor is exhausted and the final gate has
  elapsed, the transport stops scheduling, crosses the `natural-end`
  boundary without a forced ramp, lets tails decay, and publishes `ready`
  with the playhead back at the run's `startBeat`. Every voice must be
  absent from the X0 registry by eight seconds after the final note-off
  (`TRANSPORT_NATURAL_END_TAIL_DEADLINE_SECONDS`, equal to the X0 cleanup
  ceiling). Replay during a residual tail first retires the old generation,
  then begins the new run on the same graph.
- Browser interruption (platform `suspended`/`interrupted` outside an
  explicit command) freezes the playhead at the last computed beat —
  suspended wall time never advances musical time — crosses the
  `interruption` boundary, retires the sounding epoch, and publishes
  `paused` with failure code `transport.interrupted`. Recovery requires a
  trusted `resume` gesture, which re-anchors a new epoch at the stored
  beat; stale pre-interruption callbacks are generation-dead by
  construction.

## 8. Instrument, count-in, metronome, and preview

- `set-instrument` validates the exact domain instrument ID, serializes
  behind the queue, cancels every not-yet-attacked voice in the lookahead
  horizon (their X0 sources stop at or before their start, so they can
  never sound), rewinds the cursor over exactly those events, and
  reschedules them with the new recipe at their original exact times,
  incrementing `horizonReschedules` once. Already sounding voices keep
  their recipe through natural or commanded release. A paused instrument
  change applies to the next resume. A preview begun before the change
  keeps the recipe current when its command was admitted.
- Count-in, when enabled, prepends exactly one bar
  (`TRANSPORT_COUNT_IN_BARS = 1`) of generated clicks at the plan meter and
  tempo before beat zero; the metronome, when enabled, generates one click
  per integer beat while playing. Clicks are generated transport events —
  never document data — rendered through the one persistent X0 graph as
  ordinary progression-owner voices with reserved event IDs
  `x1:click:<epoch>:<index>`. The reviewed X0 topology authority (twelve
  nodes, thirteen edges) supersedes the plan sketch's informal separate
  click bus. Click policy `changes.audio-transport-click@1` freezes:
  vibraphone recipe, accented downbeat MIDI 88 at velocity 112, other
  beats MIDI 81 at velocity 84, 0.06 s gate. Clicks respect every X0 cap
  and count in `clickEventsGenerated`.
- `start-preview` owns X0 preview-owner voices under a validated
  `x1:preview:`-prefixed ID with 1–16 MIDI pitches and an X0-legal gate.
  Starting a new preview first releases the previous preview through the
  X0 preview selector. `release-preview` releases exactly the named
  preview. Preview commands never change progression transport state,
  playhead, plan binding, or published status, and a preview may run in
  `ready`, `playing`, or `paused`. Stop also retires previews; preview
  release never retires progression voices.

## 9. Notifications and the application projection

Every settled status change publishes exactly one
`TransportServiceNotification` through the injected port with:

- the closed status union `ready | playing | paused | failed`;
- the current generation and the admitting `commandRequestId`;
- a `notificationSequence` strictly increasing across the service lifetime;
- the bound `documentId`, `planRevision`, run `startBeat`, and exact
  `playhead`;
- a stable `failureCode` (`transport.interrupted` for interruption,
  an engine/transport code for `failed`, otherwise null).

`locked` and `disposed` publish nothing. The application accepts a
notification only when the generation is newer, or equal with a strictly
greater sequence, and the request/document/revision identities match; X1
therefore never reuses a (generation, sequence) pair and never publishes
out of admission order. A stale view update after Stop or replacement is
impossible on the service side and rejected on the application side.
Sequence exhaustion refuses/faults with
`transport.internal_sequence_exhausted`; sequences never wrap.

## 10. Work, memory, and termination bounds

| Resource | Hard maximum |
|---|---:|
| queued commands | 32 |
| command kinds | 15 |
| tick interval | 10–100 ms |
| lookahead horizon | 0.05–0.2 s |
| attack lead over X0 window margin | 0.05 s |
| preview pitches per command | 16 |
| count-in bars | 1 |
| click gate | 0.06 s |
| natural-end tail deadline | 8 s |
| stop ramp | 0.012 s |
| generation / request ID / sequence / plan revision | safe integer, no wrap |

The fifteen work counters in `TRANSPORT_WORK_COUNTER_NAMES` are monotonic
safe integers covering admission, refusal, ticks, scheduling, batches,
clicks, reschedules, loop wraps, retirements, previews, natural ends,
notifications, stale callbacks, and interruptions. Elapsed wall time is
performance evidence only — never a musical cutoff, scheduling deadline
substitute, or reason to alter a result. Every bounded loop (queue drain,
horizon scan, reschedule, click generation) terminates by count, and the
evidence suite reports deterministic work/state/memory termination.

## 11. Independent proof contract

The main manifest under `tests/fixtures/transport/` byte-binds the
companion fixture files. The validator imports no production transport
code and checks exact schemas, closed unions, numeric bounds, projection
totality, state-matrix coverage, scheduler goldens, stop and natural-end
witnesses, notification monotonicity, click policy, provenance, reciprocal
trace links, and the named semantic mutation controls.

The future X1 implementation must pass:

- fake-clock/fake-engine tests for every state-machine row: transitions,
  refusals, races, command overlap serialization, and stale callbacks;
- exact beat-to-second goldens at 60/120/240 BPM for 0.5/1/2/4-beat events
  (`golden-timing.json`), prohibiting duration caps that create accidental
  silence;
- one-schedule-per-event, ordering, loop-wrap epoch, tempo-change horizon,
  and instrument-reschedule proofs against the fake engine log;
- stop-stress: one hundred rapid play/stop cycles on one graph with zero
  post-stop attacks, an empty final registry, and no duplicate retirement;
- natural-end deadline, replay-during-tail, import/New-while-playing,
  pause/resume/seek exactness, interruption/recovery, count-in and
  metronome click generation, preview isolation, and notification
  monotonicity including stale-view rejection evidence at the A0 boundary;
- the mandatory real-browser matrix (Chromium, Firefox, WebKit) asserting
  state, node bookkeeping, and console cleanliness with real
  `AudioContext` semantics; unsupported automation capabilities are
  recorded as explicit matrix exceptions and completed manually;
- human listening remains required for timbre, click feel, and
  stuck-note perception; automation does not claim to hear
  (`TR-X1-LISTENING` scenes, including the X0-deferred scenes 003–005).

## 12. Implementation handoff and forbidden shortcuts

Production implementation provides `createTransportService(platform)` and
the two public operations without broadening the platform port. Before
claiming X1 complete, an implementer must prove every trace in
`tests/fixtures/transport/trace-ledger.json`, including the legacy
regressions L-RUNTIME-01 (whole-chart silence), L-AUDIO-01 (post-Stop
attacks), L-AUDIO-03 (inert BPM/scrub/duration), and L-AUDIO-04
(init/rapid-instrument races).

The following are contract violations even if a demo sounds right:

- scheduling from `requestAnimationFrame`, `Date`, or any wall-clock value;
- a callback that acts without a generation check, or a second in-flight
  transition;
- a Stop path that resolves before every X0 no-future-attack receipt;
- advancing the playhead across a browser suspension as if sound occurred;
- retiring sounding voices on tempo change, or letting them jump tempo;
- a loop wrap that recreates the graph or reuses the outgoing generation;
- clicks as document events, a second graph/bus for clicks, or click IDs
  that can collide with document event IDs;
- preview commands that mutate progression transport, playhead, or plan
  binding;
- reusing or decreasing a notification (generation, sequence) pair;
- silently repairing an invalid command, binding, beat, loop, or tempo;
- wall-time cutoffs, skipped named gates, or goldens generated by the
  production scheduler they test.
