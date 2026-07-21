# V1 Exact Voice Assignment Contract

Status: reviewed implementation handoff for `V1/spec`

Package: V1 — exact noncrossing pairwise voice assignment

Authority: this document, `src/theory/voice-assignment-contract.ts`, and the
independently authored records under `tests/fixtures/voice-assignment/` define
the package. Production output is not an authority for any expected result.

## 1. Purpose and product role

V1 turns two exact V0 voicings into a deterministic, inspectable transition.
It answers five separate questions without collapsing them:

1. Which low-to-high voices correspond under a noncrossing assignment?
2. Which voices enter or leave?
3. Which request-local voice identities propagate?
4. What exact, pitch-class, spelled, degree, and guide-tone facts hold?
5. What plural motion costs and motion relations explain the selected path?

V1 is the reusable transition foundation for progression voicing, guide-tone
paths, continuation ranking, route planning, color comparison, the Harmony
Lens, and lockable voice-leading workflows. It is not a taste model and does
not label one voicing universally best.

The package is offline, pure, synchronous, deterministic, and bounded. It has
no model, prompt, network, corpus adapter, UI state, audio state, random input,
or wall-time cutoff.

## 2. Ownership and dependency boundary

Production ownership is `src/theory/voice-assignment-contract.ts` followed by
`src/theory/voice-assignment.ts` in V1/build. Theory imports only domain and
other public theory contracts. V1 may consume exact V0 voice records but may
not import application, audio, UI, compatibility, persistence, export, or
compiled content modules.

V1 does not regenerate, respell, reorder, repair, or optimize a V0 voicing. It
receives exact low-to-high automatic-candidate voices and describes
correspondence between them. Manual and Frozen preservation belongs to V0/P0;
those stored modes are deliberately outside the V1 input type rather than being
silently sorted or converted into automatic candidates.

The public barrel is `src/theory/index.ts`. Fixtures, validators, reference
oracles, mutation controls, and evidence-only helpers are never production
imports.

## 3. Public identities and versioning

The stable identities are:

```text
changes.theory.voice-assignment-contract.v1
changes.theory.voice-assignment-request.v1
changes.theory.voice-assignment-frame.v1
changes.theory.voice-assignment-result.v1
changes.theory.voice-arc.v1
changes.theory.voice-lock.v1
changes.voice-assignment
changes.voice-assignment.v1
changes.voice-assignment.order-preserving-smooth / version 1
changes.voice-identity / version 1
changes.voice-assignment.tie-break / version 1
changes.voice-assignment.v0-template-roles / version 1
```

The request, frame, lock, and transition-policy identities are validated and
unknown versions refuse; they never fall back. The request schema itself fixes
the engine, identity, tie-break, role, and inherited low-register policy
versions reported in the result. Those are not caller-selectable input fields,
so V1 does not claim an unreachable refusal for them.

Request IDs contain 1–128 ASCII characters and match
`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. They are supplied by the caller and are
compared as complete strings. A request ID is not parsed by prefix and is not a
document-global identity.

## 4. Frames and input voices

Each frame contains exactly 3–7 voices in strictly ascending MIDI order.
Ordinals are exactly `0..length-1`; duplicate exact MIDI is invalid. The stored
spelling must project to the supplied MIDI exactly. A spelling whose exact
projection is outside MIDI still refuses as `pitch_midi_mismatch`; its
`expected` field preserves that out-of-range exact projection. V1 never silently sorts,
deduplicates, respells, clamps, or substitutes a voice.

An unassigned voice is one exact V0 candidate voice plus exact `guideTone` and
`colorTone` role facts. Each frame also carries duplicate-free, degree-ordered
`guideDegrees` and `colorDegrees` from the selected realization, each with the
inherited T1 maximum of 16 degrees. The role context binds these lists to the
exact V0 candidate ID, realization ID, selected-template evidence source ID and
version, and `changes.voice-assignment.v0-template-roles` version 1. Guide
degrees come from the selected realization's guide set. Color degrees are only
tokens explicitly labeled `color` by the selected V0 template/role projection;
an arbitrary optional degree is not silently promoted to a color. Source IDs
reuse V0's 256-code-point/512-UTF-8-byte bound and source versions are positive
integers at most 65,535. The per-voice
role booleans must agree with those exact degree identities; a null slash-bass
degree is neither a root, guide, nor color by inference.
Its degree/provenance correlation remains exact:

- `realization` and `doubling` require a degree and source degree index;
- `slash-bass` requires both fields to be `null`;
- `guideTone` is an exact selected-realization role, not a degree-number guess.

An assigned frame adds a request-local `voiceId`, numeric `voiceSerial`, and
`nextVoiceSerial`. IDs use canonical `voice-NNNN` formatting in version 1,
where the serial is zero-padded to four digits and matches
`^voice-[0-9]{4}$`. IDs are compared in full. ID format is checked independently
of the numeric scalar. Digit/serial correlation is attempted only when
`voiceSerial` is already a safe integer in `0..4095`; an invalid scalar cannot
be misreported as a digit mismatch. Canonical digit correlation plus duplicate
full-ID detection implies serial uniqueness, so there is no separate duplicate-
serial refusal. Every assigned serial is strictly below `nextVoiceSerial`.
Assigned serials end at 4,095; `nextVoiceSerial` may be the exhausted sentinel
4,096.

Source and target event IDs are stable domain `ChordEventId` values. A pairwise
transition requires distinct event IDs. The output target frame retains the
target event ID exactly.

## 5. Request-local identity lifecycle

`initializeVoiceFrame` creates the first assigned frame for a request. It
assigns source voices low-to-high as `voice-0000`, `voice-0001`, and so on, and
sets `nextVoiceSerial` to the source voice count.

`assignVoiceTransition` requires its request ID to equal the source frame
request ID. A matched target voice inherits the exact source voice ID and
serial. An entering target voice receives the next unused serial in target
low-to-high order after the alignment path is fixed. A leaving source voice's
ID is retired and is never reused in the same request.

Remaining namespace capacity is not a musical selection input. V1 first chooses
the canonical path under every musical rule and eligible lock while ignoring
only identity-serial capacity. It then performs one post-selection feasibility
check: `nextVoiceSerial + enteringVoices` must be at most 4,096. If the complete
set of entering identities does not fit, V1 returns
`voice-id-space-exhausted` without allocating any ID. It never chooses a
lower-ranked musical path merely because that path needs fewer new IDs. Thus a
namespace serial cannot change the selected musical path while allocation is
feasible; exhaustion is an all-or-nothing refusal.

The output frame carries the first unused serial. This makes repeated pairwise
calls chainable without global soprano/alto/tenor/bass names and without target
ordinal masquerading as identity.

Changing a request ID starts a new identity namespace. A caller must initialize
a new frame; it may not relabel an old frame as belonging to the new request.

## 6. Exact order-preserving alignment

For source length `m` and target length `n`, V1 builds a `(m+1)*(n+1)` dynamic
programming matrix over source and target prefixes. Legal predecessor operations
are:

1. `match`: consume one source and one target voice;
2. `leave`: consume one source voice and create a leaving arc;
3. `enter`: consume one target voice and create an entering arc.

Because matches advance both low-to-high sequences, crossing is impossible by
construction. V1 does not enumerate permutations, run a factorial assignment,
or add a separable crossing penalty to an otherwise crossing-capable match.

Every legal path is scored by the declared version-1 vector. A match contributes
the absolute signed MIDI difference. An enter or leave contributes a fixed gap
cost of 12. The selected path minimizes, in order:

1. alignment cost (`totalAbsoluteMotion + 12 * gapCount`);
2. common tones lost;
3. guide tones lost;
4. gap count;
5. negative exact-sustain count;
6. negative spelled-pitch-continuity count;
7. the complete canonical operation path.

The selection key contains only axes that preserve optimal substructure for one
best predecessor per two-dimensional cell. With fixed source and target frames,
minimizing `commonTonesLost` already maximizes preserved pitch-class occurrences,
and alignment cost plus gap count determines total absolute motion.
`maximumAbsoluteLeap` remains an exact reported fact but is not a selection
axis: a later larger leap can equalize two different prefix maxima and reveal a
different winner on gap count, so ranking prefixes by their running maximum
would require a frontier rather than the declared single score record per cell.
All plural facts remain visible in the report.

The canonical operation order is `match`, `leave`, `enter`. A path key is a
bounded readonly sequence of correlated records: match has two ordinals, leave
has a source ordinal and null target, and enter has a null source and target
ordinal. Comparing only the last operation at a cell is insufficient; tied
complete paths compare every record by the declared operation rank and then
source/target ordinal. Initialization alone reports the empty path. No string
encoding, iteration order, hash order, machine speed, or elapsed time
participates.

The independent brute-force oracle enumerates every order-preserving path only
for reviewed small cases. Production uses the bounded DP. The oracle and the
production algorithm may not share path-selection code.

Identity capacity adds no state dimension or frontier. The production matrix is
always the same two-dimensional source-prefix by target-prefix matrix and keeps
the declared 64-cell, 64-score-record, and 63-predecessor-record maxima. The
post-selection identity check inspects only the selected path's entering count.

## 7. Locks and typed no-assignment

A lock binds exactly:

```text
{requestId, eventId, voiceId, pitch, degree}
```

The request ID must equal the active transition request, the event ID must equal
the target event, the source voice ID must exist, and the exact target spelling,
octave, and degree must exist. `null` degree is meaningful for slash bass and is
not interchangeable with a chord degree.

Locks restrict legal match/enter choices before path selection. They are never
preferences and are never silently dropped. A locked source cannot leave, its
resolved target cannot enter or match a different source, and the only legal
operation is their exact match. Validation produces ordered evidence with one
of:

```text
eligible
satisfied
stale-request
stale-event
source-voice-missing
target-pitch-missing
target-degree-mismatch
```

Only a completed transition upgrades every eligible record to `satisfied`.
Stale or malformed lock identity is an input refusal and retains the ordered
validation evidence. A valid set of individually eligible locks with no legal
ordered path returns `voice_assignment.no_assignment` and one exact
reason:

```text
lock-conflict
locked-order-crossing
voice-id-space-exhausted
```

Conflicting lock ordinals are ordered and reported. V1 never relaxes a lock to
manufacture an assignment.

`voice-id-space-exhausted` is also the typed result when the canonical musical
path exists but its entering identities fail the post-selection namespace
check. It has no conflicting lock ordinals, publishes no partial path/frame,
allocates zero IDs, and does not retry a lower-ranked path.

## 8. Identity questions

Every matched arc reports five independent facts:

- exact MIDI identity: source MIDI equals target MIDI;
- pitch-class identity: MIDI values are equal modulo 12;
- spelled pitch-class identity: `step` and `alter` are equal;
- spelled pitch identity: step, alter, and octave are equal;
- degree identity: degree number and alteration are equal, including exact
  `null` handling.

`commonTone` means pitch-class identity, including an octave displacement. It
does not imply literal sustain or identical notation. `exactMidiIdentity` is the
literal sounding identity question. Spelled identity never uses source text or
string prefixes. In particular C and C-sharp are distinct, while C-sharp and
D-flat can share pitch class without sharing spelling.

Guide-tone continuity requires guide-role facts at both endpoints and exact
degree identity. Altered and unaltered degrees with the same number are not the
same guide tone.

## 9. Arc contract

Matched, entering, and leaving arcs are separate public union branches.

A matched arc has both endpoints, one `propagated` identity record, signed semitones,
absolute semitones, motion direction, all five identity facts, common-tone fact,
and guide-tone facts. Signed semitones are `targetMidi - sourceMidi`.

An entering arc has no source endpoint and one `allocated` target identity. A
leaving arc has no target endpoint and one `retired` source identity. Endpoints
embed the exact V0 voice union, preserving the correlation among provenance,
degree, and source-degree index without copying identity into four fields. Both
gap branches have `semitones: null`, `absoluteSemitones: null`,
and all inapplicable identity questions set to `null`. Zero is reserved for a
real matched voice with identical MIDI; a gap can never report zero motion.

The following correlations are laws, not display conventions:

- `absoluteSemitones === abs(semitones)` for a match;
- motion is descending for a negative value, stationary for zero, and ascending
  for a positive value;
- `commonTone === pitchClassIdentity`;
- `guideTone` is true iff either present endpoint has `guideTone: true`;
- `guideToneContinuity` is true iff both endpoints are guides and their exact,
  non-null degree identities match;
- propagated/allocated/retired identity and serial equal the corresponding
  source/output, output-only, or source-only frame voice;
- every endpoint is a recursively immutable value-equal copy of its exact input
  or output-frame voice facts, never a caller-owned alias.

Arcs are ordered by the complete backtrace path from the empty prefixes to the
full prefixes. Their source and target ordinals are monotone wherever present.
There are at most 14 arcs.

## 10. Motion relations

For each low-to-high pair of matched arcs, V1 records one relation:

- `stationary-pair`: both signed motions are zero;
- `oblique`: exactly one is zero;
- `contrary`: signs are opposite;
- `parallel`: nonzero signs and exact signed semitone intervals are equal;
- `similar`: nonzero signs are equal but signed intervals differ.

Pairs are ordered by first arc ordinal then second arc ordinal. Gap arcs do not
participate. With at most seven matched arcs there are at most 21 relations.
These are mechanical direction facts, not claims about stylistic quality.

## 11. Cost and explanation payload

The result keeps the following facts plural and inspectable:

```text
alignmentCost
gapCount
enteringVoices
leavingVoices
totalAbsoluteMotion
maximumAbsoluteLeap
pitchClassCommonTones
exactSustains
spelledPitchClassContinuities
spelledPitchContinuities
commonTonesLost
guideToneContinuities
guideTonesLost
crowdedLowIntervals
doubledGuideTones
omittedColors
totalSpan
```

Exact formulas and empty-set behavior are:

- `gapCount = enteringVoices + leavingVoices`;
- `totalAbsoluteMotion` is the sum of matched absolute semitones;
- `maximumAbsoluteLeap` is their maximum, or zero when no voices match;
- `pitchClassCommonTones`, `exactSustains`, and the two spelled-continuity
  counts are the number of matched arcs whose corresponding fact is true;
- the available common-tone pool is the pitch-class multiset intersection of
  the two frames; `commonTonesLost` is that pool size minus preserved
  pitch-class-common matched arcs;
- `guideToneContinuities` counts matched arcs with exact guide continuity;
- `guideTonesLost` is the number of source guide-tone voice occurrences minus
  `guideToneContinuities`;
- `alignmentCost = totalAbsoluteMotion + 12 * gapCount`.

`maximumAbsoluteLeap` is reported for explanation and downstream comparison; it
does not participate in the V1 path-selection key.

The last four axes implement the complete Section 12.5 handoff without turning
them into one hidden score. `crowdedLowIntervals` counts adjacent target pairs
that violate the exact inherited V0 spacing bands (`lower <= 35: 10`,
`<= 47: 7`, `<= 59: 4`, otherwise `1`). `doubledGuideTones` sums multiplicity
above one for each exact target guide degree. `omittedColors` counts declared
target color degrees absent by exact number/alter identity; an enharmonic pitch
without that degree provenance does not satisfy it. `totalSpan` is highest
target MIDI minus lowest target MIDI. These target-local facts are constant for
one source/target pair and therefore are reported but do not distort alignment
path selection.

All numeric values are finite safe integers. Signed semitones are `-127..127`;
absolute semitones, maximum leap, and span are `0..127`; alignment and total
motion are `0..889`; gap count and arc/path length are at most 14; per-voice
facts, entries, leaves, common/lost/guide counts are at most 7; crowded adjacent
pairs and doubled guides are at most 6; omitted colors are at most 16; relations
are at most 21. Source/target ordinals are `0..6`, arc ordinals `0..13`, and lock
ordinals `0..6`. Negated count keys are `-7..0`. A transition path has 3–14
steps; initialization alone has zero.

The result also carries the exact order key, operation path, engine/policy/
identity/tie versions, `noncrossingByConstruction: true`, and
`wallTimeAffectedSelection: false`. Downstream policies may display or combine
these axes but may not rewrite the V1 assignment as though it were probabilistic
or universally optimal.

## 12. Deterministic work and memory bounds

For the maximum 7-by-7 request:

- input voices visited: 7 source and 7 target;
- matrix cells: `(7+1)*(7+1) = 64`;
- legal transition candidates: `49 match + 56 leave + 56 enter = 161`;
- score comparisons: `161 - 63 non-origin cells = 98`;
- backtrace steps and arcs: at most 14;
- endpoint identity comparisons: at most 49;
- role-degree records visited: at most 64 across two guide and two color lists;
- role membership comparisons: at most 448, caching each voice/list fact;
- role ordering/duplicate comparisons: at most 60, fifteen adjacent comparisons
  for each of four maximum-length role lists;
- matched-arc motion relations: at most 21;
- locks checked and IDs allocated: at most 7 each.

Tracked record populations are capped independently:

```text
input voices                         14
input role degrees                   64
matrix cells                         64
predecessors                         63
score records                        64
backtrace path steps                 14
arcs                                 14
arc endpoints                        14
arc identity records                 14
output voices                         7
copied output role degrees           32
relations                            21
input locks                           7
lock evidence                         7
aggregate tracked records           399
```

The tracked-record policy counts every member of a variable-size collection,
including immutable output copies. Fixed-shape container objects and scalar
fields do not scale with input size and are not separate population records.
The conservative aggregate assumes all populations coexist; an implementation
may release phases earlier but may not claim a larger hidden population.

Every success and refusal reports all work and peak-memory counters plus one
termination. Initialization reports zero DP work. A valid 3–7 voice request
must finish at or below the declared caps. Derived 65th-cell, 162nd-candidate,
15th-arc, 22nd-relation, and 400th-record cases are verifier-only accounting
probes through a test seam: public validation rejects out-of-range inputs before
they could reach those states. A prospective exact-plus-one always produces the
typed all-or-nothing work-limit refusal, never truncation or partial success.

Wall time is performance evidence only. Cancellation is not applicable to this
bounded synchronous value operation. Later progression search may cancel
between fixed work quanta, but it may not change a V1 pairwise result.

## 13. Refusals and precedence

The stable refusal code order is:

```text
voice_assignment.schema_invalid
voice_assignment.policy_invalid
voice_assignment.request_id_invalid
voice_assignment.event_identity_invalid
voice_assignment.voice_count_invalid
voice_assignment.voice_ordinal_invalid
voice_assignment.voice_order_invalid
voice_assignment.duplicate_midi
voice_assignment.pitch_midi_mismatch
voice_assignment.provenance_invalid
voice_assignment.role_context_invalid
voice_assignment.source_request_mismatch
voice_assignment.voice_id_invalid
voice_assignment.voice_id_duplicate
voice_assignment.voice_serial_invalid
voice_assignment.next_voice_serial_invalid
voice_assignment.lock_limit_exceeded
voice_assignment.lock_invalid
voice_assignment.no_assignment
limit.voice_assignment_work_exceeded
```

Validation is global code-major: it completes one refusal-code check across all
applicable frames before considering the next code. Initialization has only the
`initial` frame. A transition checks `source`, then `target`, and each same-code
frame check proceeds low-to-high (or by the lower ordinal for adjacent pairs).
This means an earlier code in the target beats a later code in the source, while
the same code in the source beats that code in the target. The descending-MIDI
predicate is strictly `lowerMidi > upperMidi`; equality continues to the later
`duplicate_midi` check instead of being swallowed as descending order.

Within the stable code order, voice-ID format is checked before scalar serial
refusals, but `serial-digits-mismatch` is prerequisite-gated on the scalar being
a safe integer in `0..4095`. A non-integer or out-of-range scalar therefore
reaches `voice_serial_invalid`; full canonical-ID duplication remains the sole
serial-uniqueness refusal. Malformed input never allocates a matrix. A
no-assignment result includes the reviewed reason, conflicting lock ordinals,
and individually eligible lock records. A work-limit result names the exact
counter, received value, maximum, and `partialResult: false`. Failure branches
correlate their refusal with one exact termination; no union permits an input
refusal to claim a work-limit or no-assignment termination. No refusal contains
a partial frame or arc list.

## 14. Independent fixture package

`tests/fixtures/voice-assignment/` contains exactly:

```text
v1-voice-assignment-contract.json
assignment-policy.json
assignment-cases.json
law-cases.json
operation-state-cases.json
limit-cases.json
mutation-controls.json
provenance-ledger.json
trace-ledger.json
```

Every file declares a stable schema, semantic version, pre-production
independence status, `productionOutputUsed: false`, and
`expectedValuesGenerated: false`. The package validator rejects undeclared
files, duplicate JSON keys, unknown top-level keys, schema/version drift,
unbounded text/arrays, broken reciprocal links, and unreviewed digests.

Required assignment coverage includes:

- literal exact sustains;
- octave-displaced pitch-class common tones;
- enharmonic pitch-class equality with spelling inequality;
- the C/C-sharp prefix regression;
- 3–7 voices and every differing-count direction;
- entering, leaving, and mixed gap paths with null semitones;
- repeated pitch classes across octaves;
- crossing counterexamples where a permutation method would choose differently;
- tied paths and the complete operation-path tie break;
- guide-tone preservation, alteration mismatch, and loss;
- stationary-pair, oblique, contrary, parallel, and similar motion, including
  a parallel/similar near miss;
- locked success, stale lock, conflict, and ordered-lock crossing;
- deterministic replay, recursive immutability, and input nonmutation;
- brute-force equality for independently enumerated small cases.

Limit fixtures cover every exact maximum and exact-plus-one for voice count,
request ID, voice serial/sentinel, roles, locks, matrix cells, transition
candidates, score and role comparisons, backtrace, arcs, relations, and tracked
records. Unreachable derived work exact-plus-one rows are labeled test-seam
accounting probes, never public requests. Operation-state
fixtures explicitly mark browser, audio, storage, network, cancellation, and
stale application revision as outside this pure operation while proving that
request-stale locks refuse visibly.

## 15. Mutation controls

The minimum reviewed controls are:

```text
V1-MUT-001 permit a crossing permutation
V1-MUT-002 use a finite separable crossing penalty
V1-MUT-003 order voices by pitch string
V1-MUT-004 remove enter operations
V1-MUT-005 remove leave operations
V1-MUT-006 report gap semitones as zero
V1-MUT-007 use gap cost 11
V1-MUT-008 use gap cost 13
V1-MUT-009 compare pitch names by prefix
V1-MUT-010 require exact MIDI for common tone
V1-MUT-011 use pitch class as spelled identity
V1-MUT-012 use spelling as exact MIDI identity
V1-MUT-013 count repeated pitch classes as a set
V1-MUT-014 discard signed motion direction
V1-MUT-015 compute maximum leap from signed/minimum motion
V1-MUT-016 omit oblique relations
V1-MUT-017 classify contrary motion as similar
V1-MUT-018 allocate a new identity on match
V1-MUT-019 reuse a leaving identity for enter
V1-MUT-020 allocate identities from a global or random counter
V1-MUT-021 allocate entering identities before path selection
V1-MUT-022 drop degree provenance
V1-MUT-023 compare guide degrees by number only
V1-MUT-024 treat a null slash degree as root
V1-MUT-025 shift a low-register spacing threshold
V1-MUT-026 count doubled guides by pitch class
V1-MUT-027 satisfy omitted colors by sounding pitch only
V1-MUT-028 reverse or randomize complete-path tie order
V1-MUT-029 accept eight voices or reject seven
V1-MUT-030 skip the final DP row or column
V1-MUT-031 enumerate permutations or all Delannoy paths in production
V1-MUT-032 return a partial result on a work limit
V1-MUT-033 accept a stale request lock
V1-MUT-034 validate a lock by voice ID only
V1-MUT-035 let wall time or cancellation change the result
V1-MUT-036 mutate or sort caller-owned input
V1-MUT-037 collapse parallel motion into similar motion
```

Each control names at least one direct independently authored killing case and
reciprocal trace/authority links. A prose mention is not evidence. V1/build and
V1/verify execute the controls; V1/spec freezes the reviewed links and expected
law boundaries.

## 16. Trace and provenance contract

Stable trace IDs are:

```text
V1-TRACE-BOUNDARY
V1-TRACE-DP-ORDER
V1-TRACE-GAPS
V1-TRACE-IDENTITY
V1-TRACE-VOICE-IDS
V1-TRACE-LOCKS
V1-TRACE-COSTS
V1-TRACE-MOTION
V1-TRACE-GUIDE-TONES
V1-TRACE-TIES
V1-TRACE-LIMITS
V1-TRACE-REFUSALS
V1-TRACE-IMMUTABILITY
V1-TRACE-DETERMINISM
V1-TRACE-LEGACY
```

The provenance ledger separates contract, inherited V0/domain facts,
order-preserving alignment, project policy, resource limits, and independent
oracle policy. Project-chosen gap cost and tie policy are labeled project
decisions, not externally reviewed musical truths.

`V1-TRACE-LEGACY` owns both mandatory regressions:

- `L-RUNTIME-03` → `tests/unit/v1-voice-assignment.test.ts`;
- `L-VOICE-02` → `tests/unit/v1-voice-assignment.test.ts`.

Planned build/verify paths are ownership declarations in the spec corpus, not
claims of already executed evidence.

## 17. Forbidden shortcuts and implementation handoff

An implementation is nonconforming if it:

- sorts or repairs an input frame;
- matches notes by source-text or string prefix;
- treats exact MIDI, pitch class, spelling, and degree as one equality mode;
- emits zero semitones for a gap;
- enumerates voice permutations or uses a crossing-capable assignment;
- chooses a path greedily rather than matching the exact DP/oracle result;
- lets local predecessor iteration decide a complete-path tie;
- reuses a retired ID or derives identity from target ordinal;
- carries IDs across request changes;
- silently ignores or relaxes a lock;
- reports a partial assignment as success;
- omits deterministic work or peak-memory evidence;
- makes elapsed time, randomness, UI, audio, storage, or network state semantic;
- derives independent fixtures from production output;
- mutates or aliases request data in a result.

V1/build should be implementable from this document, the public TypeScript
contract, and the checked-in fixtures alone. V1/verify must independently prove
the DP against the brute-force small-case oracle, all identity distinctions,
all lock/refusal states, every bound, the two legacy regressions, deterministic
replay, and recursive immutability before the V1 package can close.

V1 returns one exact canonical pairwise assignment. Retaining bounded tied or
Pareto-nondominated progression alternatives belongs to V2 and the workbench,
which consume V1's plural facts; V1 does not silently discard a collection it
ever promised to return.
