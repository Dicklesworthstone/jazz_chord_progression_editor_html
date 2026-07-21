# P0 Exact Playback Plan Contract

Status: reviewed implementation handoff for `P0/spec`

Package: P0 — exact validated playback plans and loop ranges

Authority: this document,
`src/playback/playback-plan-contract.ts`, and the independently authored records
under `tests/fixtures/playback-plan/` define the package. Production compiler
output is not authority for any expected result.

## 1. Purpose and product role

P0 turns one `ValidatedDocument`, one exact realization binding for every source
event, and an optional ephemeral loop into a deterministic immutable plan.
Audio scheduling and MIDI export consume that same plan. Neither consumer may
reinterpret document structure, regenerate a voicing, repair a pitch, invent a
duration, or choose a different loop projection.

P0 is pure, synchronous, offline, deterministic, and bounded. It has no Web
Audio calls, clock, timer, random source, model, prompt, network, persistence,
UI, locale, or wall-time cutoff. Floating-point seconds do not exist in P0.
Audio converts exact beats to seconds only at the X1 scheduling boundary.

P0 fixes the legacy `L-VOICE-01` failure: whole-progression playback may never
replace Manual pitches with a generated approximation. Manual and Frozen pitch
order, spelling, octave, enharmonic coexistence, unisons, and duplicates survive
exactly.

## 2. Ownership and dependency boundary

Production ownership is:

```text
src/playback/playback-plan-contract.ts
src/playback/compile-playback-plan.ts   # P0/build
src/playback/index.ts
```

Playback may import domain values and public theory types. It may not import
audio, application, UI, persistence, compatibility, export, test fixtures,
evidence helpers, or compiled content.

The only public operation is:

```ts
compilePlaybackPlan(request: CompilePlaybackPlanRequest):
  CompilePlaybackPlanResult
```

P0 accepts only the opaque `ValidatedDocument` publication type. It cannot cast
or manufacture that brand. It also does not call T1 or V0 during compilation.
The application supplies exact T1/V0 request/result material through realization
bindings.

The loop is request-local application/transport state. P0 never writes it into
the source document.

## 3. Stable identities

Version 1 fixes these identities:

```text
changes.playback.plan-contract.v1
changes.playback.plan-request.v1
changes.playback.realization-binding.v1
changes.playback.plan.v1
changes.playback.event.v1
changes.playback.plan-result.v1

changes.playback-plan-compiler / version 1
changes.playback-articulation / version 1
changes.playback-loop / version 1
changes.playback-velocity / version 1
changes.playback-realization-binding / version 1
```

An unknown schema, compiler version, or policy version refuses. Version 1 never
falls back to a nearby known policy.

The result repeats its schema, compiler ID, and compiler version. The plan
repeats every policy identity needed by audio or MIDI consumers.

## 4. Exact realization bindings

The request carries a `ReadonlyMap<ChordEventId,
PlaybackRealizationBinding>`. Coverage is exact:

- every source event has exactly one entry;
- no entry exists for an unknown source event;
- the Map key equals the binding's own `eventId`;
- events outside a requested loop still require valid bindings;
- Map insertion order is never musical order.

Missing bindings are reported in document chronology. Extra bindings and
binding-identity checks use complete event IDs in ECMAScript UTF-16 code-unit
order so Map insertion order cannot change the refusal.

### 4.1 Generated bindings

A generated binding contains the exact `AutoVoicingRequest` used for V0 plus
either:

```ts
{ ok: true, candidate: VoicingCandidate }
```

or the exact typed `VoicingFailure`.

The request's resolved source chord must structurally equal the current event
chord. Its V0 policy must structurally equal the current event's Auto voicing.
This is relevant-content freshness, not application-revision equality. A title,
description, annotation, tempo, duration, section name, or unrelated-event edit
does not stale an otherwise exact generated binding.

A false V0 outcome refuses as `playback.realization_unavailable` and preserves
the upstream V0 refusal code and termination. P0 never substitutes the first
candidate, a default triad, an older candidate, or a stored fallback.

For an available candidate, P0 checks the public V0 identities and correlations,
including:

- candidate schema, engine, template-table, identity, evidence, and score
  shape;
- selected realization ID;
- family and voice count against the exact Auto policy;
- candidate `voices` and `pitches` index alignment;
- exact spelled-pitch-to-MIDI projection;
- declared range and bass-policy facts already carried by V0.

P0 copies candidate pitch order exactly. A V0 external bass remains named
context and is not appended to the sounded pitch list.

### 4.2 Stored bindings

A stored binding contains the exact V0 `StoredVoicingBypass` for the event's
Manual or Frozen voicing. The bypass voicing must structurally equal the current
stored voicing.

A chord-only edit does not stale a Manual/Frozen binding because stored pitches
are the playback authority. A pitch, bass-policy, mode, or Frozen provenance
change does stale it. Custom chords are accepted only through this stored path;
P0 never reconstructs octaves from custom pitch-class names.

Stored playback copies the document's pitch array. It never sorts, deduplicates,
respells, transposes, ranges, optimizes, or regenerates it.

## 5. Source timeline

All time is normalized exact quarter-note beat data whose denominator divides
MIDI PPQ 960. P0 also carries the exact integer tick mirror of every public time
field.

Source order is:

```text
section array index
  -> measure array index
    -> event array index
```

IDs never reorder events. A section's `voiceLeadingBoundary: "reset"` affects
later voice-leading work but never resets playback time.

### 5.1 Measure duration

Measure completion has an explicit temporal meaning:

- `complete`: advance by the exact event sum, already proven equal to meter
  capacity by F3;
- `pickup`: advance by the exact event sum;
- `incomplete`: advance by the exact event sum;
- `empty`: advance by one exact meter capacity as silence.

An empty measure emits no synthetic rest or playback event. It still occupies a
real bar in the chart, so later events and loops do not collapse across it.

An empty section contributes zero because it has no measures. A zero-section or
zero-measure document succeeds with zero total beats/ticks and no events. A
document containing one empty 4/4 measure has a four-beat source timeline and no
events.

Pickup and incomplete measures are not padded to capacity. Section boundaries
are not padded or rebased.

### 5.2 Timeline ceiling

The exact source end may not exceed 1,000,000 quarter-note beats. This P0 check
is necessary because a valid F3 document can contain many implicit empty-bar
capacities even though it contains no event duration to sum.

The first addition that would cross the ceiling refuses as
`playback.timeline_total_exceeded`. P0 never clamps, truncates, wraps, converts
to float, or emits a partial plan.

## 6. Beat and tick mirrors

The public event carries:

```text
sourceStartBeat       sourceStartTick
sourceDurationBeats   sourceDurationTicks
sourceOffsetBeats     sourceOffsetTicks
startBeat             startTick
durationBeats         durationTicks
gateDurationBeats     gateDurationTicks
```

The public plan carries `totalBeats`, `totalTicks`, the exact BeatRange loop, and
an index-aligned tick range.

Every tick value is an exact absolute chart position or duration at PPQ 960.
There is no rounding tolerance. Beat and tick mirrors must agree exactly.

`totalBeats` is a `BeatPosition`, not a positive duration, because zero is a
valid timeline end.

## 7. Loop projection

Loops are absolute, half-open source ranges:

```text
loop = [L, R)
```

They must be normalized, nonempty, nonreversed, start at or after zero, and end
at or before the full source timeline end. P0 never clamps a bad loop.

For one source event `[S, E)`:

```text
include iff       S < R && E > L
scheduled start = max(S, L)
scheduled end   = min(E, R)
duration        = scheduled end - scheduled start
```

Consequences:

- an event ending exactly at `L` is excluded;
- an event starting exactly at `R` is excluded;
- `S < L` creates a fresh attack at `L` with exact source offset `L - S`;
- `E > R` clips the scheduled duration at `R`;
- an event spanning both boundaries becomes one
  `loop-restart-end-clipped` event;
- an event wholly inside the loop remains `ordinary`;
- a loop wholly inside empty-bar silence succeeds with zero events;
- event and loop positions remain absolute rather than rebased to zero.

Articulation values are:

```text
ordinary
loop-restart
loop-end-clipped
loop-restart-end-clipped
```

P0 emits no wrap duplicate. X1 owns loop generations: at the right boundary it
retires the old generation and schedules the same plan again from the left
boundary.

The plan's `totalBeats` and `totalTicks` always describe the full source
timeline, not loop length.

## 8. Gate, velocity, and pitches

The version-1 gate is computed after loop clipping:

```text
gateTicks =
  durationTicks - min(24, durationTicks - 1)
```

Equivalently:

```text
gateTicks = max(1, durationTicks - 24)
```

Thus gate is positive, never exceeds scheduled duration, and leaves a 24-tick
release gap whenever the scheduled event is long enough. A one-tick event uses
one full tick. The exact reduced beat mirror is then constructed from
`gateTicks / 960`.

Because genuine F1 durations and loop boundaries are PPQ-integral, a legitimate
validated request always produces an integral gate. The
`playback.gate_not_midi_integral` refusal is a defensive boundary for a
malformed runtime object pretending to carry the opaque/domain brands. P0 never
rounds such a value.

Velocity is fixed at 96 for every event in version 1. Tempo, location, chord
quality, voicing family, section, and loop status do not alter it.

Each event carries:

- exact spelled pitches in source/V0 order;
- exact index-aligned MIDI pitches;
- no alias to an input pitch array.

For generated voicings, MIDI values agree with candidate voices and exact
spelling projection. For stored voicings, MIDI values are projected from the
preserved source pitches. Duplicate or enharmonically equivalent stored pitches
remain distinct entries.

Audio envelopes, attack/release milliseconds, gain curves, instruments, and
seconds are outside P0.

## 9. Output identity, ordering, and immutability

Output event `ordinal` is zero-based emitted-event order.
`sourceOrdinal` is zero-based global source-event order before loop filtering.
Each event retains exact source event, section, and measure IDs.

The plan/event own-key orders are fixed by
`PLAYBACK_PLAN_OWN_KEY_ORDER` and `PLAYBACK_EVENT_OWN_KEY_ORDER`.
Constructing objects in those orders makes `JSON.stringify(plan)`
byte-deterministic for the same semantic request. Map insertion order, object
allocation order, hash order, locale, timezone, date, randomness, and machine
speed cannot affect output.

The successful plan, event array, every event, pitch arrays, tick range, and
nested copied pitch records are recursively frozen. Inputs remain byte-for-byte
unchanged. Output arrays do not alias caller-owned arrays.

Audio and MIDI consumers receive the same plan object. A consumer may derive
adapter-specific commands but may not mutate the plan or replace its timing or
pitch facts.

## 10. Validation and refusal precedence

The stable semantic code order is the order in
`PLAYBACK_PLAN_REFUSAL_CODES`. Within a code:

- source-event findings use source chronology;
- binding enumeration and extra IDs use UTF-16 code-unit order;
- candidate pitch findings use candidate array index;
- stored pitch findings use stored array index;
- loop checks run shape, order, then bounds.

High-level phases are:

1. request/schema/compiler/policy identities;
2. bounded source timeline and source-event inventory;
3. realization-map size, coverage, identity, freshness, and V0 outcome;
4. loop validity and projection;
5. gates, pitches, immutable event construction;
6. immutable plan construction.

Work and memory caps are protective boundaries. The operation checks a counter
immediately before accepting the record that would exceed its inclusive limit.
That resource refusal necessarily preempts any semantic issue that would require
unsafe additional work to discover. No failure returns a partial plan.

Termination is correlated by type:

| Refusal family | Termination |
|---|---|
| request/compiler/policy | `request-invalid` |
| source timeline | `timeline-invalid` |
| binding/staleness/V0/candidate/stored | `realization-invalid` |
| loop | `loop-invalid` |
| gate | `gate-invalid` |
| bounded resource | `work-limit-exceeded` |

## 11. Bounded work and memory

Version 1 publishes every counter, limit, and increment rule in
`PLAYBACK_PLAN_WORK_LIMITS`, `PLAYBACK_PLAN_MEMORY_LIMITS`, and
`PLAYBACK_PLAN_WORK_INCREMENT_POLICY`.

Principal public maxima are:

| Population/work | Maximum |
|---|---:|
| sections visited | 64 |
| measures visited | 65,536 |
| source events | 8,192 |
| realization bindings | 8,192 |
| pitches per event | 16 |
| output pitch records | 131,072 |
| loop intersection checks | 8,192 |
| gate calculations | 8,192 |
| tracked records | 155,648 |

Counters increment at the attempted operation named by the public increment
policy. Limits are inclusive. Maximum succeeds; attempting maximum plus one
returns:

```text
limit.playback_plan_work_exceeded
received = maximum + 1
partialResult = false
```

Peak tracked memory counts only operation-owned source-event records, sorted
binding index records, output events, and output pitch-pair records. Caller-owned
documents, Maps, V0 requests, and candidates are not claimed as P0-owned memory.
P0 may not create an unbounded parallel diagnostic collection.

Wall time is evidence only. It never stops musical work or changes a result.

## 12. Independent fixtures and required laws

The reviewed fixture package under `tests/fixtures/playback-plan/` is authored
without running the production compiler. Every file states:

```text
expectedValuesGenerated: false
productionOutputUsed: false
```

The package covers:

- 2/2 through 6/8 meter behavior;
- 0.5, 1, 2, and 4 beat durations;
- BPM 20 and 400 with unchanged beat/tick geometry;
- source ordering, IDs, section reset, empty bars, empty sections, pickup, and
  incomplete measures;
- generated, Manual, Frozen, and Custom bindings;
- missing, extra, mismatched, stale, malformed, and unavailable realizations;
- exact gates, one-tick behavior, velocity, and PPQ mirrors;
- null loops, exact-boundary loops, overlap restart, end clipping, both-boundary
  clipping, silent loops, and invalid ranges;
- deterministic Map permutations and repeated calls;
- transposition and inverse-transposition laws;
- input immutability and consumer nonmutation;
- exact maximum and maximum-plus-one resource seams;
- the `L-VOICE-01` stored-pitch regression.

Every law has a positive witness, a negative or near-miss witness, a
transposition witness where musically applicable, and a mutation control.

Expected plan values are literal reviewed rationals/ticks. A fixture generator,
the P0 compiler, an audio scheduler, or a MIDI encoder may not certify them.

## 13. Implementation handoff and forbidden shortcuts

P0/build may choose internal helpers, but it must implement this public
contract without reopening product decisions.

Forbidden shortcuts include:

- calculating time in floating point or seconds;
- collapsing an empty bar to zero time;
- padding pickup/incomplete measures to meter capacity;
- resetting time at a section boundary;
- sorting events by ID or bindings by Map insertion order;
- compiling only loop-visible bindings;
- clamping or rebasing an invalid loop;
- omitting a pre-loop overlapping event;
- emitting wrap duplicates;
- trimming a precomputed full-event gate instead of recomputing from the
  scheduled duration;
- rounding a nonintegral tick;
- appending V0 external bass;
- sorting, deduplicating, respelling, transposing, or optimizing stored pitches;
- regenerating Frozen or Custom pitches;
- replacing an unavailable V0 outcome with a fallback;
- mutating/aliasing input records;
- allowing audio, MIDI, UI, or application state to decide P0 semantics;
- using wall time as a musical cutoff;
- generating fixture expectations from production output.

Another implementer should be able to build P0 from this document, the public
TypeScript contract, and the reviewed fixture package without consulting the
larger rebuild plan.
