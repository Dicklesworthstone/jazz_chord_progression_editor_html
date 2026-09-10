# Band dropout, version 1

COD5, `jcpe-6ujg.6`. This is a specification and independent fixture packet,
not an implemented or accepted runtime capability. Its build remains blocked
by `jcpe-rehearsal-session-6y2b.2`, which waits for U4 verification. Preserve
the existing rehearsal owner, full contract in `REHEARSAL_SESSION.md`, and
release/human gates. Do not introduce a second practice engine to bypass them.

## Musician interaction

In rehearsal setup, choose **Band dropout: two bars on, two bars out**. Resolve
and show exactly four consecutive complete 4/4 bars from the selected range;
do not silently expand a chord selection, truncate a longer range, round a
partial bar, or change meter. A full-capacity explicitly empty bar is allowed.
Refuse a passage with no performed bass or comp attacks during its on half;
explain that this preset needs audible accompaniment to return. The ordinary
rehearsal workflow retains its own valid silent-passage behavior.

The fixed preset has one same-key template, four passes, current integer
tempo, and one initial 4/4 count-in. No tempo ramp, key sequence, custom mask,
persisted setting, account, microphone, scoring or inferred performance grade.
Show the selected bars, tempo, four-pass duration and count-in before Start.
The existing metronome setting remains explicit: if enabled, explain that its
clicks continue while the band is out. Count-in and preview are never masked.

After admission use the existing persistent transport and play-along display.
Show the **audible** pass and **Band in / Band out**, not a scheduled lookahead
cursor. While out, show beats until the next return; on the fourth pass say
**ends in** instead of promising a nonexistent fifth pass. Beat countdown is
the ceiling of exact remaining quarter-note ticks divided by 960; it controls
no sound. During count-in show Count-in, and after completion show Finished.
Global Stop and End practice remain reachable. Setup Escape cancels preparation.

## Exact occurrence law

Perform the full source chart first, then use the existing rehearsal projection
into `[L,R)`. Keep original bar/groove phase and voice leading. Here `R-L=15360`
ticks, on interval `[L,L+7680)`, off interval `[L+7680,R)`, PPQ960. Every pass
uses the same source interval; its epoch advances through all 15360 ticks even
when no band attack is emitted. Four passes total 61440 ticks, excluding count-in.

The proposed additive admitted sequence descriptor is
`attackPolicy: { schema: "changes.rehearsal.band-dropout.v1" }`; it is absent
for ordinary rehearsal. The compiler validates the fixed preset and attaches
this immutable tag. The audio boundary revalidates it against the sequence,
not an unchecked UI boolean. No new command, timer, graph or persisted schema.
Implement its typed contract with the runtime leaf, after rehearsal is ready.

For each already projected bass/comp occurrence, retain its attack iff
`L <= startTick < L+7680`. An attack at `L+7680` is out; one at `R` belongs to
no occurrence in this pass. Do not use end time, source-event start before
projection, wall time, event ordinal or absolute chart tick modulo for this
decision. A left-clipped/restarted occurrence attacks at L and is in. Skip an
out occurrence exactly once and advance the ordinary event cursor. Never defer
it to the next on interval or compress silent time out of the sequence.

Keep the retained occurrence's projected gate, source offset, velocity, pitch
order, duplicate unisons, source spelling and IDs exactly. An on attack whose
release extends into the off half keeps that release. Existing instrument
release/reverb tails continue: the promise is **no new band attacks**, not
instant silence. Never mute the shared master/bus, retire unrelated previews,
cut gates at the off boundary, or rename musical source events. Existing unique
session/pass/event/voice occurrence IDs still distinguish subsequent passes.

Whole-request admission precedes sound. Scalar/scope/schema failures precede
render work. Existing rehearsal/source/performance/native resource refusals
retain their causes, and no successful prefix plays. Unsupported descriptor
versions refuse. The source document, history, recovery, export state and
ordinary chart settings remain unchanged.

## Pause, interruption and ownership

Use rehearsal's exact audible pass/source beat and serialized retirement.
Resume in an off interval remains off until its actual next pass epoch, without
count-in, borrowed attacks, phase reset or catch-up. Resume in an on interval
uses the existing rehearsal resume articulation, then applies this same mask
to any restarted occurrence. Hidden time never advances practice; resuming
requires the existing trusted gesture. Restart retires the old run, then starts
pass one with a new count-in. End/Stop report retirement only after its receipt.

Free seek, tempo and loop edits during practice require End first, as in the
rehearsal contract. Source edits, Undo/Redo, document replacement, cancellation
and host removal invalidate the prepared/session binding. A stale awaited
continuation cannot publish readiness, an old Band-in label, or new sound.
Retirement failure remains visible. Instrument/mix and independently owned
preview keep their existing authority and survive the mask without gain tricks.

## Bounds and proof

One template, four passes, four bars, 61440 expanded ticks, one pending request,
one active session. Reuse rehearsal's 65536 retained-event and 262144 pitch-slot
caps and all earlier P0/performance/audio bounds. Masking visits each candidate
once per pass: at most 262144 mask decisions. No separate event-array copies,
timers or unbounded mask search. Diagnostics distinguish candidate visits,
retained attacks and suppressed attacks; a resource refusal identifies the
attempted increment. Native memory and elapsed time are observations, not cutoffs.

`tests/fixtures/band-dropout/cases.json` contains hand-authored ticks, exact
seconds, boundary near misses, nonzero source origin, duplicate pitch witnesses,
audible-state examples and lifecycle expectations. It predates implementation.
The static test independently checks its arithmetic and counterexamples; this
is specification consistency, not a production test or runtime mutation kill.

Spec gate via RCH/Bun1.3.14: `bun test tests/static/band-dropout-contract.test.ts`,
test-project TypeScript and owned ESLint. Build must add actual production-path
unit/integration tests and replay this packet, retaining existing rehearsal,
P0/performance/X1/U4 regressions. Kill real source mutants for inclusive-off
boundary, absolute-source phase, collapsed silence, clipped tail, replayed
suppressed attack, global preview mute, early audible label and stale publication.

Native build/verify proof must use the real persistent audio graph in all three
engines, file and loopback, desktop/320x568/390x844, keyboard/200%/reduced motion.
Measure actual source attack and gate times across all four passes, unchanged
preview, count-in/metronome, audible labels, pause/resume both halves, hidden
interruption, blocked seek, source replacement, Restart, Stop and natural tails.
Retain exact fixture/source/artifact hashes, request/error logs, generations,
voice/listener counts, counters and failure diagnostics. No skipped/retried gates.
Independent musician listening and real-phone pulse/latency/touch acceptance
remain `.6.3`; a desktop viewport is not physical-device evidence.
