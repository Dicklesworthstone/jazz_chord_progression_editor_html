# A0/U1 Atomic Edit Plan Contract

Status: proposed independent specification packet; production implementation
and human acceptance are not claimed.

Code-facing schema:
`changes.application.atomic-edit-plan-contract.v1`.

This document is the normative A0/U1 amendment for one additive
`apply-edit-plan` command. The exact proposed types and machine-readable
inventories are in
`src/application/application-edit-plan-contract.ts`. The existing
`APPLICATION_COMMAND_KINDS`, `DocumentCommand`, runner, application barrel, and
production bundle remain unchanged until a later implementation leaf implements
this proposal.

The words **must**, **must not**, **exactly**, and **refuse** are normative.

## 1. Boundary and authority

This amendment is subordinate to the existing F0, T0, F2, F3, and A0 contracts.
In particular:

- A0 still owns the command envelope, optimistic revision check, state
  transition, history, bookmark repair, focus, notices, and effects.
- T0 exclusively parses raw chart text and exposes its explicit
  `insertableChords` recovery lane. A0/U1 must not recreate chart syntax.
- Domain exact rationals, spelling-first chords, stable-ID brands, collection
  caps, and the 1,000,000-quarter-note timeline cap remain authoritative.
- F2 must decode the one private candidate exactly once. F3 must semantically
  validate that decoded candidate exactly once.
- Runtime behavior remains local, deterministic, synchronous, and offline.

This is an additive contract, not permission to move a caller-authored
document, draft, patch, candidate, command list, or nested plan through A0.
The forbidden payload keys are frozen in
`A0_U1_ATOMIC_EDIT_PLAN_FORBIDDEN_PAYLOAD_KEYS`.

## 2. Proposed command surface

The proposed command-kind tuple is the current fifteen A0 kinds in their
current order followed by `apply-edit-plan`. It is published separately as
`A0_U1_PROPOSED_APPLICATION_COMMAND_KINDS`; it does not mutate the live tuple.
Likewise, `ProposedDocumentCommand` is the separate type-only union of the live
`DocumentCommand` and `ApplyEditPlanCommand`; it does not replace or re-export
the live union.

The proposed envelope inherits the existing A0 field order exactly and then
adds its discriminant and plan:

- the normal `id`, `label`, `expectedDocumentId`, `expectedRevision`,
  `logicalTimeMs`, and `coalescing: null` fields, in that order;
- `kind: "apply-edit-plan"`; and
- one `plan: AtomicEditPlan`.

The plan union has exactly five top-level discriminants, in this order:

1. `insert-fragment`;
2. `split-event-duration`;
3. `join-event-durations`;
4. `split-section`; and
5. `join-sections`.

`insert-fragment` contains a closed two-lane source union, but remains one
top-level plan kind. No variant contains another command or plan. Exact runtime
shape validation rejects unknown, missing, inherited, accessor-backed, or
wrongly typed fields before musical work begins.

`A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS` is the frozen runtime key authority for the
envelope, both insert lanes, every placement, all other plan variants,
snapshots, boundaries, metadata, declarations, warnings, ranges, and fixed
voicing. A validator must compare own enumerable string keys against the
applicable row exactly; TypeScript's erased structural types are not runtime
proof.

The source-only `RunAtomicEditPlan` signature closes the implementation handoff.
Its request contains `AtomicEditPlanAppState`, one `ApplyEditPlanCommand`, and
the existing A0 dependency ports plus the synchronous T0 parser port. The
history retained-byte estimator is the same operation with its input widened
to the proposed history-row union so it can measure the new command kind.
The proposed state differs from live `AppState` only by widening history rows
to admit `commandKind: "apply-edit-plan"`; every current `AppState` remains a
valid input. Its result preserves the existing transition fields while adding
one `editPlanReceipt` on committed success or one nullable `editPlanRefusal` on
failure. It intentionally does not claim assignability back to today's
`ApplicationTransitionResult`, whose live history kind is still closed to the
original fifteen commands. The implementation leaf must merge the command and
history kinds before exporting the live runner.

## 3. Common command preflight

A future runner must execute these stages in the exact order exported by
`A0_U1_ATOMIC_EDIT_PLAN_RUNNER_STAGE_ORDER`:

1. validate the existing A0 envelope, including document and revision;
2. validate the exact runtime shape;
3. compare the QuickEntry snapshot for `insert-fragment`;
4. perform bounded source preflight;
5. resolve target and destination;
6. call T0 once for an insert source;
7. compare warning acknowledgements when applicable;
8. compare completion and metadata declarations;
9. prove the operation-specific laws;
10. prove final collection and timeline bounds;
11. allocate all required stable IDs;
12. construct one private candidate;
13. run F2 exactly once;
14. run F3 exactly once; and
15. publish bookmarks, history, state, and effects atomically.

Non-insert variants perform zero source scans and zero T0 calls. A refusal at
any stage skips every later stage.

## 4. Exact QuickEntry guard

Every insert source carries an `AtomicEditPlanQuickEntrySnapshot`. It contains
the raw `sourceText`, QuickEntry `baseRevision`, non-null stable `target`, exact
`issueCodes` sequence, expected status, and expected lane. Before parsing or ID
allocation, A0/U1 must prove all of the following:

- `sourceText` is code-unit-for-code-unit equal to `state.quickEntry.text`;
- `baseRevision` equals both `state.quickEntry.baseRevision` and the current
  application revision;
- `target` is structurally equal to `state.quickEntry.target`;
- `issueCodes` is equal in length, order, and string value;
- `expectedStatus` equals the current QuickEntry status; and
- `expectedLane` agrees with the source-union discriminant.

The complete lane requires status `ready` and lane `complete-draft`. The
recovery lane requires status `invalid` and lane `recovered-chord`. `idle`, a
null target, or any stale field refuses with
`edit-plan.quick-entry-snapshot-mismatch`.

The stable target must also be the canonical target of the placement:

| Placement                          | Required QuickEntry target                |
| ---------------------------------- | ----------------------------------------- |
| Into a measure before an event     | `before-event` with the same event ID     |
| Append to a measure                | `measure-end` with the same measure ID    |
| Into a section before a measure    | `before-measure` with the same measure ID |
| Append to a section                | `section-end` with the same section ID    |
| Into the document before a section | `before-section` with the same section ID |
| Append to the document             | `document-end`                            |

The strings encoding this rule are frozen in
`A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY`. The plan's destination IDs must refer
to the same target node and parent; target equality alone does not excuse a
cross-parent destination.

## 5. Raw source and the single T0 call

Both insert lanes carry raw source only. A caller cannot supply a
`ChartTextDraft`, parsed chord, warning object with publication authority, or
candidate document.

Source preflight first counts at most 4,097 code points as a first-excess
witness, then rejects invalid Unicode scalar structure within the bounded
source, and only then counts at most 16,385 UTF-8 bytes as a first-excess
witness. The permitted maxima are 4,096 code points and 16,384 bytes. Invalid
Unicode and either exceeded maximum refuse before T0.

At application time, the injected real public T0 operation is called exactly
once and synchronously as:

```text
parseChartText(
  quickEntrySnapshot.sourceText,
  { mode: "fragment", meter: state.document.meter },
  "ascii",
)
```

No cached UI parse, caller-supplied draft, canonicalized text, repaired text,
or second parse may influence publication. The current meter is read from the
same state snapshot guarded by the command envelope.

### 5.1 Complete-draft lane

`source.kind: "complete-draft"` requires T0 success. T0 failure refuses with
`edit-plan.syntax-refused`; the runner must not silently fall through to chord
recovery.

The supplied warning acknowledgements must match the success result's warnings
one-for-one and in T0 order. Equality uses only exact warning `code` and exact
half-open UTF-16 `range.start`/`range.end`. Human-readable messages are not
stable authority and must neither be trusted nor compared. Missing, extra,
reordered, or altered acknowledgements refuse with
`edit-plan.warning-acknowledgements-mismatch` before allocation.

A successful T0 fragment draft contains only measure-complete material. In
4/4, for example, `C:2` is an underfilled chart failure, not a successful
one-event draft. A complete lane must never publish a partial T0 result.

### 5.2 Recovered-chord lane

`source.kind: "recovered-chord"` requires T0 failure. T0 success refuses with
`edit-plan.recovered-chord-requires-parse-failure`; the caller must submit the
complete lane instead.

The plan supplies a finite, non-negative safe-integer
`selectedGlobalOrdinal`. A0/U1 examines the returned `insertableChords` in
their T0 order and requires exactly one item whose global ordinal equals it.
No match refuses with `edit-plan.recovered-chord-ordinal-missing`. Only that
item's chord, annotation, range, and duration branch may be used. Diagnostic
siblings and every other insertable chord remain unapplied. There is no
"apply valid parts" operation.
`insertableChordsExamined` counts returned insertable rows through the matched
row (or all returned rows on no match); it is not `selectedGlobalOrdinal + 1`,
because T0 global ordinals also account for non-insertable event slots and may
therefore contain gaps.

The layout acknowledgement must equal the literal
`source-bar-and-section-layout-will-be-lost@1`. A boolean, localized copy,
different version, or absent acknowledgement refuses with
`edit-plan.recovered-chord-layout-loss-unacknowledged`.

Duration handling is a closed branch:

- if T0 returns `duration.kind: "resolved"`, `callerDuration` must be `null`
  and the exact T0 duration is used;
- if T0 returns `duration.kind: "requires-caller"`, `callerDuration` must be a
  valid positive exact domain `BeatDuration` and that exact value is used.

Any other pairing refuses with
`edit-plan.recovered-chord-duration-mismatch`. Recovery may use only the
`into-measure` placement with
`layoutDisposition: "insert-one-recovered-chord"`; any section or document
placement refuses with `edit-plan.recovered-chord-placement-invalid`.

## 6. Complete-draft placement laws

The complete lane has exactly three placement forms.

### 6.1 Into one measure

The draft must contain exactly one implicit section, exactly one non-empty
measure, and no named section. Its events are inserted in source order before
`beforeEventId`, or appended when that field is null. The event list is the
only source structure retained, hence the required disposition
`flatten-one-implicit-measure`.

The target measure must exist. A non-null `beforeEventId` must exist in that
same measure. This placement carries exactly one completion declaration for
that target measure.

### 6.2 Into one section

The draft must contain exactly one implicit section and at least one measure.
All measures are inserted in source order before `beforeMeasureId`, or appended
when that field is null. `beforeMeasureId`, when present, must belong to the
target section. Measure and event grouping is preserved, and the required
disposition is `preserve-implicit-measures`.

This placement carries no completion declaration because every inserted T0
measure is complete.

### 6.3 Into the document

The draft must contain one or more sections and every section must be named.
Sections, measures, and events remain in source order and are inserted before
`beforeSectionId`, or appended when it is null. The required disposition is
`preserve-named-sections`.

`sectionDeclarations` must contain exactly one row per draft section in exact
source order, with unique contiguous ordinals `0..sectionCount-1`. Each new
section receives:

- its exact T0 name and annotation;
- `keyOverride: null`; and
- the declaration's exact `voiceLeadingBoundary`.

This placement carries no completion declaration. Missing, duplicated,
reordered, or extra declarations refuse; metadata is never guessed.

## 7. New event policy

Every event created from complete or recovered T0 material receives the exact
T0 chord spelling, exact T0 annotation, exact selected duration, a fresh event
ID, and this fixed Auto voicing:

```text
mode         auto
family       balanced
voiceCount   4
lowMidi      48
highMidi     84
bassPolicy   generated
```

The required policy ID is
`a0-u1-balanced-4-48-84-generated@1`. The exact values are independently
published as `A0_U1_NEW_EVENT_POLICY_ID` and
`A0_U1_NEW_EVENT_AUTO_VOICING`. A caller cannot override any field.

## 8. Completion declarations

The plan carries an exact closed completion tuple:

- complete or recovered insertion into a measure: one row for that measure;
- split event: one row for the containing measure;
- join events: one row for the containing measure; and
- insertion of complete measures, split section, or join sections: zero rows.

There may be no duplicate, unrelated, missing, or extra row. Each declared
completion is applied literally to the private candidate and must survive F2
and F3. Split and join event durations preserve the measure's exact total, so
their declaration must equal the measure's current completion value. No
operation may silently flip, infer, or repair completion.

## 9. Split one event duration

`split-event-duration` targets one existing event. Both supplied durations
must be valid positive exact `BeatDuration` values and their exact rational sum
must equal the event's current duration.

The result is adjacent first and second spans:

- the first span keeps the original event ID, chord, voicing, and annotation,
  and receives `firstDuration`;
- the second span receives one fresh event ID, copies the chord and voicing
  literally, receives `secondDuration`, and has annotation `""`.

The fixed policy literals must be
`retain-source-first-allocate-second`, `copy-exact-chord-and-voicing`, and
`retain-source-first-clear-second`.

Keeping the original annotation only on the retained first/left event is
deliberate. It loses no source information, avoids duplicating semantic text,
and makes split followed immediately by the permitted join an exact inverse:
the join retains the left annotation and removes only an empty right
annotation.

## 10. Join two event durations

`join-event-durations` is ordered: `leftEventId` must immediately precede
`rightEventId` in the same measure. The left event is the sole survivor.

Before allocation or candidate construction, A0/U1 must prove:

- chord objects are literally equal in every spelling-first field;
- voicing objects are literally equal in every field;
- the right annotation is exactly the empty string;
- `joinedDuration` is a valid positive exact duration; and
- `joinedDuration` equals the exact rational sum of left and right durations.

Enharmonic equivalence, sounding-pitch equivalence, normalized source text, or
an approximately equal duration is insufficient. On success, the left ID,
chord, voicing, and annotation survive; only its duration changes. The right ID
is removed. The fixed policy literals in the source type are mandatory.

## 11. Split one section

`split-section` targets one existing section and a `beforeMeasureId` within
it. The boundary must be strict interior: at least one measure remains in the
leading prefix and at least one moves to the suffix.

The original section ID and all original section metadata remain on the
leading prefix. One fresh section ID and the explicit `newSectionMetadata`
belong to the suffix. The selected measure becomes the first suffix measure.
All measure and event IDs, values, completion states, and source order are
preserved exactly. No timeline span moves relative to another span.

The fixed identity and measure policies are
`retain-source-prefix-allocate-suffix` and
`move-suffix-preserve-identities`.

## 12. Join two sections

`join-sections` is ordered: the left and right IDs must name immediately
adjacent sections in that order. The left ID is the sole section survivor.

The caller supplies `expectedLeftMetadata`, `expectedRightMetadata`, and
`resultMetadata`. Each metadata object contains exact name, annotation,
`keyOverride`, and `voiceLeadingBoundary`. Both expected objects must equal
the current sections before any ID work. The result object is then applied
literally to the surviving left section.

Measures are concatenated left then right without changing any measure or
event ID or value. The combined measure count must remain at most 1,024. The
right section ID is removed. Its entry `voiceLeadingBoundary` ceases to be a
section boundary; the literal
`remove-right-entry-boundary-confirmed` records that explicit fact. The fixed
identity, measure, and metadata policy literals in the source type are
mandatory.

## 13. Stable IDs and honest entropy

All non-ID laws, final collection sizes, and final timeline bounds must pass
before the first factory call. The runner then indexes document, section,
measure, and event IDs in one global collision set and allocates only the
required identities.

Allocation order is deterministic structural preorder:

1. a newly inserted fragment section before its descendants;
2. each newly inserted measure before its events;
3. fragment events in global source order;
4. a recovered event as the sole recovered allocation;
5. a split event's second event only; or
6. a split section's suffix section only.

Join-event and join-section plans allocate nothing. Their
allocation/collision proof uses a hostile factory that would collide if called
and proves zero calls and zero allocation attempts; an unrelated refusal may
not be relabeled as collision evidence.

Every returned ID is checked against the global occupied set and immediately
reserved in the local set. The first factory failure or collision refuses.
There is no retry, repair, fallback ID, or partial remap publication.

The state, document, bookmarks, history, and effects remain unpublished on
such a refusal. This contract does **not** claim to roll back factory entropy:
the current `StableIdFactory.next` interface has no reservation or rollback
operation, so a refused allocation sequence may have consumed factory state.
`A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY` freezes that honest boundary.

## 14. Bookmark and focus mapping

Bookmark changes are part of the same atomic command and are recorded in the
receipt. Stable event selections are deduplicated without reordering survivors.

### 14.1 Insert fragment

Existing selections and representable range boundaries keep their stable IDs.
The insertion point moves after the last inserted event, measure, or section as
appropriate. The focus remains on a stable prior target when one exists;
otherwise it moves to the first inserted material.

### 14.2 Split event

The original ID continues to select the first span. An `after-event` boundary
that denoted the original span end is rewritten to `after-event` of the fresh
second event; the corresponding insertion and range endpoints use the same
rewrite. `before-event` of the original remains unchanged.

### 14.3 Join events

Every selected right ID is replaced by the surviving left ID and duplicates
are removed. A right span-end boundary is rewritten to the joined left
span-end. A range using the removed internal boundary between left and right
cannot be represented after the join and is cleared rather than guessed.
Focus on the right event moves to the left.

### 14.4 Split section

Measure and event bookmarks remain stable. A source section-end boundary that
formerly denoted the end of the complete section is rewritten to the suffix
section end; the leading section start remains on the original ID.

### 14.5 Join sections

Measure and event bookmarks remain stable. The removed right section start is
mapped to the exact boundary of its first moved measure, and its section end is
mapped to the surviving left section end. Focus on the removed right section
moves to the left section. No internal musical beat is approximated.

The five compact policy strings are frozen in
`A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES`. The success receipt carries the
actual selection replacements, boundary rewrites, range-cleared bit, and focus
policy so proof cannot rely on an unobserved helper.

## 15. Atomic publication, history, and receipt

After private construction, F2 structural decode runs once and F3 semantic
validation runs once. Either refusal publishes none of the candidate. Success
does all of the following as one transition:

- publishes one validated document at exactly `baseRevision + 1`;
- publishes the operation-specific bookmarks and focus request;
- appends exactly one non-coalesced history entry and clears redo;
- clears QuickEntry to `idle` with empty text/issues, the committed revision,
  and the new insertion bookmark;
- emits exactly one each of `queue-recovery`, `compile-playback-plan`,
  `restore-focus`, and `announce`, in that order; and
- returns one `AtomicEditPlanTransitionResult` whose `editPlanReceipt` contains
  identities, survivor, insertion-lane evidence, completion IDs, timeline
  disposition, bookmark rewrites, F2/F3 counts, history count, effects, and work
  evidence.

Undo restores the exact before document and bookmarks in one revision. Redo
restores the exact after document, allocated IDs, metadata, annotations,
completion declarations, and bookmarks without calling T0 or allocating new
IDs. Undo and redo retain A0's existing QuickEntry-clear behavior.
Literal transition fixtures use the apply command only for the `apply` phase.
Their `command` field is `null` for `undo` and `redo`, because those phases
invoke A0's state-only `undoDocumentCommand` and `redoDocumentCommand` ports;
the retained history entry, not a replayed caller command, is their authority.

A normal refusal follows existing A0 failure semantics: document, bookmarks,
history, QuickEntry, and effects are unchanged; only the already-permitted
notice and sequence bookkeeping may differ. The ID-entropy caveat in section
13 is the only external-state qualification.

An A0 envelope refusal occurs before edit-plan work and therefore returns
`editPlanRefusal: null`. A refusal after edit-plan validation begins returns a
complete `AtomicEditPlanRefusal`; its `outerCode` and path must equal the outer
`ApplicationRefusal` code and path exactly. A future implementation may not
drop, bury in a message, or infer this nested diagnostic/work detail.
`AtomicEditPlanTransitionResult` encodes the null/non-null split and outer-code
correlation as a discriminated mapped union. Domain paths are runtime arrays,
so exact path equality remains an explicit runner law and fixture assertion.

## 16. Refusals and diagnostics

The nested refusal vocabulary, in precedence order, is exactly
`A0_U1_ATOMIC_EDIT_REFUSAL_CODES`. It maps to existing outer A0 codes as
follows:

| Nested refusal family                                                                                      | Existing A0 outer code                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Command/plan/snapshot/source/syntax/warning/recovery/completion/duration/content/annotation/metadata/limit | `command.payload_invalid`                                    |
| Missing target                                                                                             | `command.target_missing`                                     |
| Destination, event order, section boundary, or section order                                               | `command.destination_invalid`                                |
| Factory failure or collision                                                                               | `command.id_allocation_failed`                               |
| F2 refusal                                                                                                 | `command.structural_validation_failed`                       |
| F3 refusal                                                                                                 | `command.semantic_validation_failed`                         |
| History retained-size refusal                                                                              | `history.entry_too_large` or `history.byte_estimate_invalid` |

Diagnostics are sanitized structured data. They contain nested code, owner,
domain path, optional T0 range/code, and optional observed/maximum integers.
They must not retain raw source, chord text, annotation text, document values,
localized messages, thrown values, or stack traces.

Diagnostics are ordered by domain path using ECMAScript code-unit lexical
order, then source-range start, source-range end, and code. Null ranges sort
before ranged rows at the same path. At most 64 rows are retained after order
is established; counters still report all bounded work reached. A T0 parse
failure preserves T0 code and range, never its mutable message.

## 17. Bounds, work, memory, and termination

The exact maxima are exported in `A0_U1_ATOMIC_EDIT_LIMITS`:

| Quantity                            |   Maximum |
| ----------------------------------- | --------: |
| Source code points                  |     4,096 |
| Source UTF-8 bytes                  |    16,384 |
| Fragment sections                   |        64 |
| Measures per fragment/final section |     1,024 |
| Total fragment measure records      |    65,536 |
| Fragment or final document events   |     8,192 |
| Final timeline quarter-note beats   | 1,000,000 |
| Completion declarations             |         1 |
| Section declarations                |        64 |
| Retained diagnostics                |        64 |
| Warning acknowledgements            |        64 |
| QuickEntry issue codes              |        64 |
| QuickEntry snapshot fields compared |         6 |
| Insertable chords examined          |     8,192 |
| Recovery fields compared            |         4 |
| ID allocation attempts              |    73,792 |
| Occupied ID records                 |    73,793 |
| Plan-node records                   |    73,793 |
| Bookmark records examined           |     8,196 |
| Exact beat additions                |     8,192 |
| Exact beat comparisons              |     8,192 |
| Metadata fields compared            |        12 |

Final collection checks apply to the whole candidate, not just inserted
material. Every collection scan stops after either exhaustion or the
maximum-plus-one first-excess witness. Exact duration arithmetic uses bounded
domain rational operations, never floating point and never wall time.
If an earlier invariant makes a later refusal or first-excess state
unreachable, the obligation ledger records an algebraic dominance proof rather
than a fabricated runtime transition. In particular, 4,096 valid Unicode
scalars occupy at most 16,384 UTF-8 bytes; a larger scalar sequence reaches the
code-point refusal first, and a lone surrogate reaches Unicode refusal first.

Every apply outcome that reaches edit-plan validation returns all counters
named by `A0_U1_ATOMIC_EDIT_WORK_COUNTER_NAMES`, including zeros for unreached
work, plus exactly one termination label:

- `complete`;
- `input-refusal`;
- `allocation-refusal`;
- `publication-refusal`; or
- `history-refusal`.

An inherited A0 envelope refusal occurs before this nested work record exists:
the runtime result has `editPlanRefusal: null`, while the independent fixture
envelope records `editPlan: null`. Undo and redo likewise record `editPlan:
null` because they replay the retained history entry without parsing,
revalidating the plan, or allocating IDs.

Peak plan, allocated-ID, and diagnostic record counts are explicit. Temporary
memory is bounded by the exported record caps plus the one private candidate
and the existing bounded A0 history estimator. Wall-clock time is performance
evidence only and cannot terminate musical work.

## 18. The seventeen laws

The fixture inventory has exactly the following seventeen rows, byte-for-byte
equal to `A0_U1_ATOMIC_EDIT_LAW_IDS`:

| Law ID                                                     | Normative obligation                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `A0-U1-ATOM-001-command-and-five-closed-variants`          | One additive command, exactly five top-level variants, exact shape, no candidate or nested batch.                                      |
| `A0-U1-ATOM-002-quick-entry-snapshot-and-target-exact`     | Insert compares every frozen QuickEntry field and the canonical placement target before parse/allocation.                              |
| `A0-U1-ATOM-003-raw-source-reparsed-once-by-t0`            | The guarded raw text is synchronously reparsed exactly once by real T0 with current meter and ASCII style.                             |
| `A0-U1-ATOM-004-complete-draft-success-and-warnings-exact` | Complete lane requires T0 success and exact ordered code/range warning acknowledgements.                                               |
| `A0-U1-ATOM-005-recovered-failure-selects-one-chord`       | Recovery requires T0 failure, selects exactly one global insertable ordinal, and applies no sibling.                                   |
| `A0-U1-ATOM-006-recovered-loss-duration-placement-exact`   | Recovery requires the exact layout-loss token, exact resolved/caller duration branch, and one-measure placement.                       |
| `A0-U1-ATOM-007-complete-draft-placement-shape-exact`      | Measure, section, and document lanes permit only their declared T0 structure and preserve/flatten exactly as stated.                   |
| `A0-U1-ATOM-008-new-event-policy-fixed`                    | Every inserted event uses exact T0 content and the fixed balanced four-voice Auto policy.                                              |
| `A0-U1-ATOM-009-completion-declarations-exact`             | The operation supplies the exact closed tuple and no completion is inferred or repaired.                                               |
| `A0-U1-ATOM-010-split-event-lossless-exact`                | Exact positive sum; original/left keeps ID, content, and annotation; fresh right copies content and has empty annotation.              |
| `A0-U1-ATOM-011-join-events-left-inverse-exact`            | Immediate siblings require literal chord/voicing equality and empty right annotation; left ID/content/annotation survive exact sum.    |
| `A0-U1-ATOM-012-split-section-leading-survivor-exact`      | Strict interior split retains leading ID/metadata and every measure/event identity while allocating one suffix ID.                     |
| `A0-U1-ATOM-013-join-sections-left-metadata-exact`         | Adjacent join retains left ID, compares both expected metadata objects, applies explicit result, and removes the right entry boundary. |
| `A0-U1-ATOM-014-timeline-and-bounds-preserved`             | Flattened event order/durations and unaffected data remain exact, and every final domain bound holds.                                  |
| `A0-U1-ATOM-015-ids-preflight-preorder-honest-entropy`     | All non-ID work precedes deterministic preorder allocation; collisions never retry; entropy rollback is not claimed.                   |
| `A0-U1-ATOM-016-bookmarks-publication-history-atomic`      | Operation-specific bookmarks, one F2, one F3, one revision, one history entry, effects, undo, and redo are atomic.                     |
| `A0-U1-ATOM-017-transposition-and-existing-a0-unchanged`   | Metamorphic transposition laws hold and all fifteen existing commands remain byte-for-byte behavior compatible.                        |

## 19. Transposition and mutation proof

The edit operation itself never transposes. Split/join event and split/join
section commute with spelling-preserving transposition of the affected event
IDs. Join equality is deliberately literal before either side is transposed.

Complete and recovered insertion preserve T0 source spelling exactly. Their
metamorphic pair uses correspondingly transposed raw source and compares
results modulo the deterministic bijection between fresh IDs. A spelling
mutation, accidental-style mutation, enharmonic substitution, or stale source
must be detected rather than normalized.

Proof for each applicable law must include:

- one positive fixture;
- one negative or adjacent near-miss fixture;
- one mutation that would pass if an equality/check were omitted;
- transposition evidence or an explicit non-applicability reason;
- deterministic work and peak-memory evidence; and
- exact refusal code, path, diagnostics, and first-excess counts where refused.

Each insert transition also carries independently authored `parserEvidence`:
the exact raw source/meter/mode/style, parser outcome, ordered global event
slots, and ordered insertable rows with source ordinals, content, duration
branch, and range. It is never generated from the production parser. The
validator uses it to prove inserted content and recovery scan position; global
ordinals alone are not array indexes.

The aggregate packet must additionally prove malformed exact shapes, unknown
keys, stale envelope revision, each stale QuickEntry field, T0 success/failure
lane swaps, warning order/range mutations, recovered sibling suppression,
resolved/caller duration swaps, each placement mismatch, every maximum and
maximum-plus-one witness, ID failure/collision at every allocation position,
F2/F3 refusal, history refusal, undo/redo identity stability, and existing A0
regression compatibility.

The 5-plan × 10-category case matrix is representative evidence, not a naming
exercise: every linked apply transition must execute the row's plan kind and
the validator must independently prove the stated category. The companion
`obligationRows` ledger enumerates the complete refusal, snapshot-field,
placement, limit, allocation-site, publication, bookmark, history, and
transposition obligations above. Root booleans, reciprocal links, summaries,
or category labels cannot satisfy an obligation without a semantically checked
literal witness.

## 20. Implementation handoff

This packet intentionally defines data and laws only. It adds no runner branch,
parser adapter wiring, barrel export, browser behavior, generated artifact, or
release claim. A later implementation bead must adopt these exact inventories,
author independent fixtures first, bind the synchronous T0 dependency, and
then prove the complete release-facing A0 gate without relaxing any existing
test.
