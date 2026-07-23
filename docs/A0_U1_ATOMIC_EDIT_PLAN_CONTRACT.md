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
wrongly typed fields before any command property is read or musical work
begins. This descriptor-safe gate is deliberately earlier than the inherited
A0 envelope value checks for this new command only; the existing fifteen
command paths and their precedence remain unchanged.

`A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS` is the frozen runtime key authority for the
envelope, both insert lanes, every placement, all other plan variants,
snapshots, boundaries, metadata, declarations, warnings, ranges, and fixed
voicing, plus every nested duration, completion variant, key context, and
spelled tonic. A validator must inspect own data-property descriptors and
compare their enumerable string keys against the applicable row exactly;
reading values through ordinary property access before this capture is
forbidden. TypeScript's erased structural types are not runtime proof.

Exact shape includes bounded caller-owned text, not merely JavaScript string
type checks. Section names must be nonblank valid Unicode scalar text of at
most 256 code points; section annotations must be valid scalar text of at most
2,000 code points; and pickup/incomplete completion reasons must be nonblank
valid scalar text of at most 2,000 code points. These are the existing F2/F3
domain limits, frozen here as pre-allocation plan-shape checks so a malformed
plan cannot consume ID entropy before failing. The bounded scan is reported by
`metadataCodePointsObserved`; across the largest join plan it observes at most
6,768 accepted code points or 6,769 with one first-excess witness.

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

1. validate and capture the complete exact runtime shape from own data-property
   descriptors without invoking a getter, inherited property, or coercion;
2. validate the existing A0 envelope values, including document and revision,
   from that captured passive-data record;
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
any stage skips every later stage. A shape refusal can therefore precede an A0
envelope refusal only when the input is not a passive exact-shape value; for
ordinary exact-shape records, the inherited A0 value precedence is unchanged.

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

The stable target must canonicalize to the placement boundary in the current
guarded document. Canonicalization is deterministic and total over normal A0
insertion bookmarks:

| Placement level | QuickEntry target   | Canonical placement boundary                                 |
| --------------- | ------------------- | ------------------------------------------------------------ |
| Measure         | `before-event(E)`   | before the same event `E`                                    |
| Measure         | `after-event(E)`    | before `E`'s next sibling, or append if `E` is last          |
| Measure         | `measure-start(M)`  | before `M`'s first event, or append if `M` is empty          |
| Measure         | `measure-end(M)`    | append to `M`                                                |
| Section         | `before-measure(M)` | before the same measure `M`                                  |
| Section         | `after-measure(M)`  | before `M`'s next sibling, or append if `M` is last          |
| Section         | `section-start(S)`  | before `S`'s first measure, or append if `S` is empty        |
| Section         | `section-end(S)`    | append to `S`                                                |
| Document        | `before-section(S)` | before the same section `S`                                  |
| Document        | `after-section(S)`  | before `S`'s next sibling, or append if `S` is last          |
| Document        | `document-start`    | before the first section, or append if the document is empty |
| Document        | `document-end`      | append to the document                                       |

The strings encoding these rules are frozen in
`A0_U1_QUICK_ENTRY_TARGET_MATCH_POLICY`. Every referenced target must exist,
and event/measure targets must belong to the plan's declared parent. A target
at another structural level, a different canonical boundary, or a cross-parent
destination refuses; U1 may not rewrite QuickEntry state before dispatch merely
to manufacture a match.

## 5. Raw source and the single T0 call

Both insert lanes carry raw source only. A caller cannot supply a
`ChartTextDraft`, parsed chord, warning object with publication authority, or
candidate document.

Source preflight independently recounts code points, Unicode scalar validity,
and UTF-8 bytes before T0. The permitted maxima are 4,096 code points and
16,384 bytes. In a valid A0 state these three refusal branches are defensive
but unreachable: `set-quick-entry` already accepts only valid Unicode scalar
text of at most 4,096 code points, the exact snapshot must equal that state,
and 4,096 valid scalars occupy at most 16,384 UTF-8 bytes. Their refusal codes
remain reserved for corrupted or non-authoritative state input, while the
golden packet proves normal unreachability algebraically instead of fabricating
runtime transitions.

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

A successful T0 fragment draft contains only closed measures. A non-empty
closed measure has complete meter duration; an empty closed measure remains a
valid empty measure. In 4/4, for example, `C:2` is an underfilled chart failure,
not a successful one-event draft. A complete lane must never publish a partial
T0 result.

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

### 6.1 Into one empty measure

The draft must contain exactly one implicit section, exactly one non-empty
closed measure, and no named section. A successful non-empty T0 measure already
occupies the current meter's complete capacity, so this lane can commit only
into an existing empty target measure. `beforeEventId` is therefore the literal
`null`; the target measure must have zero events and completion `{kind:
"empty"}`; and the only canonical QuickEntry targets are that measure's
`measure-start` or `measure-end` boundary. Its events are appended in source
order, the required disposition is `flatten-one-implicit-measure`, and the one
completion declaration must name that target measure with `{kind:
"complete"}`. A non-empty target or a before-event target is a placement
mismatch, not a secretly overfilled candidate.

### 6.2 Into one section

The draft must contain exactly one implicit section and at least one measure.
All measures are inserted in source order before `beforeMeasureId`, or appended
when that field is null. `beforeMeasureId`, when present, must belong to the
target section. Measure and event grouping is preserved, and the required
disposition is `preserve-implicit-measures`.

This placement carries no completion declaration because completion for newly
allocated measures is determined by the conversion law below rather than by
mutating an existing measure.

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

### 6.4 New-measure completion conversion

`ChartDraftMeasure` deliberately has no persistent completion field. For every
newly allocated measure created by section- or document-level insertion, A0/U1
uses this exact conversion and no other inference:

- zero T0 events produce `{kind: "empty"}`; and
- one or more events from a successfully closed T0 measure produce `{kind:
"complete"}`.

The current meter used by T0 is the same guarded meter later seen by F3. A
pickup/incomplete completion, reason string, or caller-supplied completion is
not permitted for a newly allocated T0 measure.

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

- complete insertion into an empty measure: one `{kind: "complete"}` row for
  that measure;
- recovered insertion into a measure: one row for that measure;
- split event: one row for the containing measure;
- join events: one row for the containing measure; and
- insertion of complete measures, split section, or join sections: zero rows.

There may be no duplicate, unrelated, missing, or extra row. Each declared
completion is applied literally to the private candidate and must survive F2
and F3. Split and join event durations preserve the measure's exact total, so
their declaration must equal the measure's current completion value. No
operation may silently flip, infer, or repair an existing measure's completion;
section 6.4 is the sole explicit conversion for newly allocated measures.

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

All descriptor/shape, snapshot, source/parser, declaration,
operation-local, and computable final collection/timeline preflight must pass
before the first factory call. The runner then indexes document, section,
measure, and event IDs in one global collision set and allocates only the
required identities. F2, F3, and history remain authoritative post-allocation
publication gates; this contract does not pretend that operation-local
preflight can replace them.

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

The state, document, bookmarks, history, and effects remain unpublished on any
refusal. This contract does **not** claim to roll back factory entropy: the
current `StableIdFactory.next` interface has no reservation or rollback
operation, so an allocation, collision, F2, F3, or history refusal after the
first factory call may have consumed factory state. Join operations make no
calls and consume none. `A0_U1_ATOMIC_EDIT_PLAN_ID_ENTROPY_POLICY` freezes that
honest boundary.

## 14. Bookmark and focus mapping

Bookmark changes are part of the same atomic command and are recorded in the
receipt. Stable event selections are returned in current after-document order
and deduplicated without reordering those survivors. For insertion and both
range endpoints, every boundary not named below remains byte-for-byte equal if
its target survives.

### 14.1 Insert fragment

Existing selection and range values remain byte-for-byte equal. The insertion
point moves to `after-event` of the last inserted event for measure placement,
`after-measure` of the last inserted measure for section placement, or
`after-section` of the last inserted section for document placement.

### 14.2 Split event

The original ID continues to select the first span and the fresh ID is not
implicitly selected. Every `after-event(original)` insertion or range endpoint
is rewritten to `after-event(freshSecond)` so it continues to denote the old
whole-span end. `before-event(original)` and every other surviving boundary
remain unchanged.

### 14.3 Join events

Every selected right ID, including selection anchor/focus IDs, is replaced by
the surviving left ID and duplicates are removed. Boundary handling is total:

| Before boundary       | Insertion result          | Range endpoint result    |
| --------------------- | ------------------------- | ------------------------ |
| `before-event(left)`  | unchanged                 | unchanged                |
| `after-event(left)`   | clear insertion to `null` | clear the complete range |
| `before-event(right)` | clear insertion to `null` | clear the complete range |
| `after-event(right)`  | `after-event(left)`       | `after-event(left)`      |

`after-event(left)` and `before-event(right)` denoted the removed internal
beat; it cannot be represented by a stable event boundary after the join and
must never be guessed. Every unrelated surviving boundary remains unchanged.

### 14.4 Split section

Measure and event bookmarks remain stable. `after-section(source)` rewrites to
`after-section(suffix)` and `section-end(source)` rewrites to
`section-end(suffix)` for insertion and either range endpoint. Those boundaries
formerly denoted the end of the complete source section. `before-section` and
`section-start` on the retained leading section remain unchanged.

### 14.5 Join sections

Measure and event bookmarks remain stable. Let `firstRightMeasure` be the first
measure moved from the right section when one exists. The following table
applies independently to insertion, range anchor, and range focus:

| Before boundary                                  | Non-empty right section             | Empty right section             |
| ------------------------------------------------ | ----------------------------------- | ------------------------------- |
| `before-section(left)` / `section-start(left)`   | unchanged                           | unchanged                       |
| `after-section(left)` / `section-end(left)`      | `before-measure(firstRightMeasure)` | preserve the same left boundary |
| `before-section(right)` / `section-start(right)` | `before-measure(firstRightMeasure)` | `section-end(left)`             |
| `after-section(right)`                           | `after-section(left)`               | `after-section(left)`           |
| `section-end(right)`                             | `section-end(left)`                 | `section-end(left)`             |

Every other surviving boundary remains unchanged. Thus an empty right section
is supported without inventing a first measure, while a non-empty right entry
edge maps to an exact existing measure boundary. No internal musical beat is
approximated.

### 14.6 Deterministic focus

A0/U1 never reads or infers current DOM focus; `focusRequest` is an outbound
request and is not current-focus state. After the operation-specific bookmark
mapping above, focus uses the existing A0 priority exactly:

1. the after-selection's valid `focusEventId`;
2. the after-insertion boundary's event, measure, or section target when that
   target is not the chart;
3. the first newly inserted/allocated event, measure, or section in structural
   order; or
4. the chart.

The receipt type admits only branches that can occur for that operation:

| Operation            | Legal focus branches                                        |
| -------------------- | ----------------------------------------------------------- |
| Insert fragment      | selection focus, non-chart insertion target                 |
| Split event duration | selection focus, non-chart insertion target, first inserted |
| Join event durations | selection focus, non-chart insertion target, chart          |
| Split section        | selection focus, non-chart insertion target, first inserted |
| Join sections        | selection focus, non-chart insertion target, chart          |

In particular, a join cannot claim a first-inserted target because it allocates
nothing, and insertion cannot fall through to chart because its new non-chart
insertion boundary survives. Within insert receipts, that non-chart branch is
further correlated to placement: into-measure targets an event, into-section a
measure, and into-document a section.

The receipt records both the branch and the exact `UiFocusTarget`, and that
target must equal `afterState.focusRequest.target`. Claims about an unrecorded
previous DOM focus are forbidden.

The five compact policy strings are frozen in
`A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES`. The success receipt carries the
actual selection replacements, boundary rewrites, insertion/range clear bits,
focus branch, and focus target so proof cannot rely on an unobserved helper.
Those fields are correlated discriminated outcomes, not independent flags:
preserve means no rewrite and `cleared: false`; rewrite means one actual
insertion rewrite or one/two actual range-endpoint rewrites and
`cleared: false`; clear means no rewrite and `cleared: true`. Each operation's
receipt union contains only the preserve/rewrite/clear outcomes admitted by
the tables above.

## 15. Atomic publication, history, and receipt

After private construction, F2 structural decode runs once and F3 semantic
validation runs once. Either refusal publishes none of the candidate. Success
does all of the following as one transition:

The inherited outer A0 `work.validationCalls` meaning does not change: it
counts only the F3 semantic-validation call, not F2. It is `0` for any refusal
through F2, `1` for F3 refusal, committed apply, or a later history refusal,
and `0` for the state-only undo/redo history ports. The nested
`structuralDecodeCalls` and `semanticValidationCalls` provide the new exact
0/1 pair without redefining the accepted outer counter.

All other inherited A0 counters retain their accepted meanings as well. The
atomic runner builds at most one complete index of the before document, reuses
it for target, order, collision, and bookmark work, and builds at most one
complete index of the validated after document. A refusal before target
resolution has no outer index work. Reaching target resolution records the
complete before-document section, measure, event, and stable-ID counts;
success or a later history refusal records the before-plus-after totals.
`stableIdsIndexed` counts section, measure, and event IDs, never the document
ID. `bookmarksRepaired` counts the single repair operation after successful F3,
not the number of bookmark records rewritten. `historyEntriesVisited` is zero
for every apply result because constructing a new entry is not undo/redo
traversal. `historyBytesEstimated` is zero until the estimator returns a valid
nonnegative safe integer, then equals that returned value even when it exceeds
the retained-byte cap. Request and transport counters remain zero.

State-only undo and redo preserve the existing A0 path: they visit one history
entry, build one complete index of the restored document for focus, perform no
bookmark repair, estimate no new history bytes, and call neither F2 nor F3.
These rules are exact fixture oracles; a packet cannot certify them by merely
mirroring the same outer record into both `expected.counters.outer` and the
result.

- publishes one validated document at exactly `baseRevision + 1`;
- publishes the operation-specific bookmarks and focus request;
- appends exactly one non-coalesced history entry and clears redo;
- clears QuickEntry to `idle` with empty text/issues, the committed revision,
  and the new insertion bookmark;
- emits exactly one each of `queue-recovery`, `compile-playback-plan`,
  `restore-focus`, and `announce`, in that order; and
- returns one `AtomicEditPlanTransitionResult` whose `editPlanReceipt` contains
  identities, survivor, insertion-lane evidence, completion IDs, timeline
  disposition, bookmark rewrites, history count, effects, and complete work
  evidence.

`AtomicEditPlanReceipt` is a discriminated union, not an uncorrelated product.
The exact branches are:

| Branch                 | Survivor            | Insert source              | Allocated/removed identity shape                             | Completion IDs                 | Timeline disposition                         |
| ---------------------- | ------------------- | -------------------------- | ------------------------------------------------------------ | ------------------------------ | -------------------------------------------- |
| Complete into measure  | `null`              | complete + `into-measure`  | one or more fragment events / none                           | exactly the target measure     | splice source order                          |
| Complete into section  | `null`              | complete + `into-section`  | structural preorder beginning with a fragment measure / none | empty                          | splice source order                          |
| Complete into document | `null`              | complete + `into-document` | structural preorder beginning with a fragment section / none | empty                          | splice source order                          |
| Recovered chord        | `null`              | recovered + `into-measure` | exactly one recovered event / none                           | exactly the target measure     | insert one recovered chord                   |
| Split event            | original event ID   | `null`                     | exactly one split-second event / none                        | exactly the containing measure | replace one span with two exact-sum spans    |
| Join events            | left event ID       | `null`                     | none / exactly the right event                               | exactly the containing measure | replace two spans with one exact-sum span    |
| Split section          | original section ID | `null`                     | exactly one suffix section / none                            | empty                          | preserve flattened event order and durations |
| Join sections          | left section ID     | `null`                     | none / exactly the right section                             | empty                          | preserve flattened event order and durations |

Within every success, receipt `commandId`, `documentId`, `baseRevision`, and
`committedRevision` must equal the command/input/after-state values;
`committedRevision` is exactly `baseRevision + 1`; receipt effects equal the
top-level effect-kind projection in the same order, every top-level effect uses
the committed revision, receipt work equals the nested expected work, and the
operation-specific identity order equals the allocation/removal trace.
Impossible cross-branch combinations are a contract violation even if
TypeScript is bypassed.

Undo restores the exact before document and bookmarks in one revision. Redo
restores the exact after document, allocated IDs, metadata, annotations,
completion declarations, and bookmarks without calling T0 or allocating new
IDs. Undo and redo retain A0's existing QuickEntry-clear behavior.
Literal transition fixtures use the apply command only for the `apply` phase.
Their `command` field is `null` for `undo` and `redo`, because those phases
invoke the proposed state-only `UndoAtomicEditPlanHistory` and
`RedoAtomicEditPlanHistory` ports over `AtomicEditPlanAppState`; the retained
history entry, not a replayed caller command, is their authority. These
proposed types widen only the history-row state/result surface. The
implementation leaf must merge or genericize the live A0 history ports before
claiming that today's `UndoDocumentCommand`/`RedoDocumentCommand` accept the
new row; a cast is forbidden.

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

The history pair is not interchangeable. A returned value that is not a
nonnegative safe integer maps exactly to `history.byte_estimate_invalid`; a
valid estimate greater than `MAX_HISTORY_RETAINED_BYTES` maps exactly to
`history.entry_too_large`. Both carry nested
`edit-plan.history-refused` at `["history"]`.

Within a stage, the first failing check in the source-declared field/order
sequence is primary. The nested code and outer path use this condition table;
`i` means the first failing source-order index. Existing A0 envelope failures
retain their already-reviewed outer code/path and carry no nested refusal.

`A0_U1_ATOMIC_EDIT_PATH_TEMPLATE_GRAMMAR` is the machine-readable path
authority. Templates are RFC 6901 JSON Pointers: the empty string denotes the
root; `{index}` denotes a canonical non-negative base-10 source-order array
index; and `{metadataField}` expands only to `name`, `annotation`,
`keyOverride`, or `voiceLeadingBoundary`. No other brace token is legal.
Decoding a template yields the runtime `DomainPath`. An attacker-controlled
unknown property name is never echoed into diagnostics: shape refusal uses the
nearest frozen parent template, while a known field uses its exact template.

| Stage and condition                                                                                                                                                | Nested code                                            | Exact primary path                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Root command is not a passive exact object, or has a missing/extra/accessor/inherited field                                                                        | `edit-plan.command-shape-invalid`                      | `[]` for the root/unknown key, or `[field]` for the first known field                                                                |
| Plan/nested object has a missing/extra/accessor/inherited/wrongly typed field, including a policy literal, duration, completion, metadata, key, or spelling object | `edit-plan.plan-shape-invalid`                         | exact decoded source template; nearest frozen parent for an unknown extra key                                                        |
| First unequal QuickEntry snapshot field                                                                                                                            | `edit-plan.quick-entry-snapshot-mismatch`              | `["plan","source","quickEntrySnapshot",field]`                                                                                       |
| Defensive code-point / Unicode / UTF-8 source check                                                                                                                | matching `edit-plan.source-*` code                     | `["plan","source","quickEntrySnapshot","sourceText"]`                                                                                |
| Referenced target/container does not exist                                                                                                                         | `edit-plan.target-missing`                             | the exact missing ID field in `placement` or `quickEntrySnapshot.target`                                                             |
| Existing destination belongs to another parent, the target canonicalizes to another sibling slot, or complete-draft measure placement targets a non-empty measure  | `edit-plan.destination-invalid`                        | the placement's destination ID field or `["plan","placement"]`                                                                       |
| Event pair is not ordered adjacent siblings                                                                                                                        | `edit-plan.event-order-invalid`                        | `["plan","rightEventId"]`                                                                                                            |
| Section split is not strict interior                                                                                                                               | `edit-plan.section-split-boundary-invalid`             | `["plan","beforeMeasureId"]`                                                                                                         |
| Section pair is not ordered adjacent siblings                                                                                                                      | `edit-plan.section-order-invalid`                      | `["plan","rightSectionId"]`                                                                                                          |
| T0 fragment section/measure structure does not satisfy the selected complete-draft placement                                                                       | `edit-plan.fragment-placement-mismatch`                | `["plan","placement"]`                                                                                                               |
| Recovery uses a non-measure placement                                                                                                                              | `edit-plan.recovered-chord-placement-invalid`          | `["plan","placement"]`                                                                                                               |
| Complete lane receives T0 failure                                                                                                                                  | `edit-plan.syntax-refused`                             | `["plan","source","quickEntrySnapshot","sourceText"]`                                                                                |
| Recovery lane receives T0 success                                                                                                                                  | `edit-plan.recovered-chord-requires-parse-failure`     | `["plan","source","kind"]`                                                                                                           |
| Recovery ordinal is invalid/missing                                                                                                                                | `edit-plan.recovered-chord-ordinal-missing`            | `["plan","source","selectedGlobalOrdinal"]`                                                                                          |
| First warning acknowledgement mismatch                                                                                                                             | `edit-plan.warning-acknowledgements-mismatch`          | `["plan","source","warningAcknowledgements",i]`                                                                                      |
| Completion tuple/value differs from the operation law                                                                                                              | `edit-plan.completion-declarations-mismatch`           | `["plan","completionDeclarations",i]` or `["plan","placement","completionDeclarations",i]`                                           |
| First missing/reordered section declaration or stale expected/current section metadata field                                                                       | `edit-plan.section-metadata-mismatch`                  | `["plan","placement","sectionDeclarations",i]`, `["plan","expectedLeftMetadata",field]`, or `["plan","expectedRightMetadata",field]` |
| Recovery layout token differs                                                                                                                                      | `edit-plan.recovered-chord-layout-loss-unacknowledged` | `["plan","source","layoutLossAcknowledgement"]`                                                                                      |
| Recovery duration branch/value differs                                                                                                                             | `edit-plan.recovered-chord-duration-mismatch`          | `["plan","source","callerDuration"]`                                                                                                 |
| Split/join duration is non-positive/noncanonical                                                                                                                   | `edit-plan.duration-invalid`                           | the first duration field in plan order                                                                                               |
| Split/join exact sum differs                                                                                                                                       | `edit-plan.duration-sum-mismatch`                      | the last supplied duration field participating in the sum                                                                            |
| Join chord/voicing differs                                                                                                                                         | `edit-plan.event-content-mismatch`                     | `["plan","rightEventId"]`                                                                                                            |
| Join right annotation is not empty                                                                                                                                 | `edit-plan.right-annotation-not-empty`                 | `["plan","rightEventId"]`                                                                                                            |
| First final collection exceeds its cap                                                                                                                             | `edit-plan.collection-limit-exceeded`                  | `["plan"]`, with observed/maximum diagnostic and collection-specific secondary path                                                  |
| Final exact timeline exceeds its cap                                                                                                                               | `edit-plan.timeline-limit-exceeded`                    | `["plan"]`                                                                                                                           |
| Factory refuses at allocation position `i`                                                                                                                         | `edit-plan.id-factory-failed`                          | `["plan"]`; trace position `i` is retained separately                                                                                |
| Returned ID collides at allocation position `i`                                                                                                                    | `edit-plan.id-collision`                               | `["plan"]`; trace position `i` is retained separately                                                                                |
| F2 rejects the private candidate                                                                                                                                   | `edit-plan.structural-publication-refused`             | `["candidate"]`                                                                                                                      |
| F3 rejects the decoded candidate                                                                                                                                   | `edit-plan.semantic-publication-refused`               | `["candidate"]`                                                                                                                      |
| Estimator is invalid or entry exceeds the retained-byte cap                                                                                                        | `edit-plan.history-refused`                            | `["history"]`                                                                                                                        |

`edit-plan.section-metadata-mismatch` is for a well-shaped expected snapshot
that is stale relative to current state. A malformed/out-of-range metadata
object is `edit-plan.plan-shape-invalid` earlier. Fixed policy literals likewise
fail exact shape; they are never reclassified as a musical mismatch.

Diagnostics are sanitized structured data. They contain nested code, owner,
domain path, optional T0 range/code, and optional observed/maximum integers.
They must not retain raw source, chord text, annotation text, document values,
localized messages, thrown values, or stack traces.

Diagnostics reuse the reviewed domain-path order exactly. Compare path segments
left to right: two numbers numerically; two strings by ECMAScript code-unit
order; a number before a string for malformed mixed positions; and, when all
shared segments match, the shorter path first. At an equal path, a null source
range sorts before a range, then ranges sort by numeric start and numeric end,
then codes sort by ECMAScript code units. At most 64 rows are retained after
order is established; counters still report all bounded work reached. A T0
parse failure preserves T0 code and range, never its mutable message.

## 17. Bounds, work, memory, and termination

The accepted input, domain, and retained-record maxima are exported in
`A0_U1_ATOMIC_EDIT_LIMITS`:

| Quantity                            |   Maximum |
| ----------------------------------- | --------: |
| Structural decode calls             |         1 |
| Semantic validation calls           |         1 |
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
| Exact beat additions                |     8,193 |
| Exact beat comparisons              |     8,193 |
| Metadata fields compared            |        12 |
| Section-name code points            |       256 |
| Section-annotation code points      |     2,000 |
| Completion-reason code points       |     2,000 |
| Plan metadata code points           |     6,768 |

Every published work counter has a separate absolute ceiling in
`A0_U1_ATOMIC_EDIT_WORK_COUNTER_MAXIMA`. A permitted-value maximum and an
observable counter maximum are intentionally different when the counter
retains one first-excess witness:

| Work counter                       | Maximum |
| ---------------------------------- | ------: |
| `structuralDecodeCalls`            |       1 |
| `semanticValidationCalls`          |       1 |
| `planNodesVisited`                 |  73,794 |
| `sourceCodePointsObserved`         |   4,097 |
| `sourceUtf8BytesObserved`          |  16,385 |
| `quickEntrySnapshotFieldsCompared` |       6 |
| `quickEntryIssueCodesCompared`     |      65 |
| `syntaxParseCalls`                 |       1 |
| `warningAcknowledgementsCompared`  |      65 |
| `insertableChordsExamined`         |   8,192 |
| `recoveryFieldsCompared`           |       4 |
| `draftSectionsVisited`             |      65 |
| `draftMeasuresVisited`             |  65,537 |
| `draftEventsVisited`               |   8,193 |
| `completionDeclarationsVisited`    |       2 |
| `metadataFieldsCompared`           |      12 |
| `metadataCodePointsObserved`       |   6,769 |
| `exactBeatAdditions`               |   8,193 |
| `exactBeatComparisons`             |   8,193 |
| `idAllocationAttempts`             |  73,792 |
| `idCollisionChecks`                |  73,792 |
| `bookmarkRecordsExamined`          |   8,196 |
| `bookmarkRecordsRewritten`         |       4 |
| `peakPlanNodeRecords`              |  73,794 |
| `peakAllocatedIdRecords`           |  73,792 |
| `peakDiagnosticRecords`            |      64 |

The 65,537th draft-measure witness is reachable with 63 full 1,024-measure
sections followed by a 64th section whose 1,025th measure triggers the
per-section refusal. Defensive source and QuickEntry first-excess values remain
statically unreachable from accepted A0 state, but their absolute ceilings are
still explicit.

Final collection checks apply to the whole candidate, not just inserted
material. Their exact sub-order is
`A0_U1_FINAL_COLLECTION_LIMIT_COMPARISON_ORDER`: final document sections;
per-section measures in section order; final total measures; final document
events; occupied-ID records; then plan-node records. A dominated composite
limit remains in this order as an algebraic proof rather than a fabricated
transition. Every collection scan stops after either exhaustion or the
maximum-plus-one first-excess witness. Exact duration arithmetic uses bounded
domain rational operations, never floating point and never wall time.
If an earlier invariant makes a later refusal or first-excess state
unreachable, the obligation ledger records an algebraic dominance proof rather
than a fabricated runtime transition. In particular, accepted A0 QuickEntry
state already proves valid Unicode, at most 4,096 code points, and at most 64
issue codes. Exact snapshot equality therefore makes source-code-point,
source-Unicode, source-UTF-8, and QuickEntry-issue-count excess transitions
unreachable for authoritative states. A 4,096-scalar valid string occupies at
most 16,384 UTF-8 bytes. Those defensive branches remain specified but are
covered by upstream/state-invariant proofs.

### 17.1 Exact counter accounting

Counters increment at the named event, before testing whether that event is
the first mismatch/excess. A refusal preserves every count already reached and
leaves every later-stage counter zero. No counter is inferred from wall time or
from the expected result.

| Counter                                                                | Exact increment rule                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planNodesVisited`                                                     | One for the plan root, then one for each T0 draft section, measure, event, or recovery insertable row entered in source order; stop at refusal/first excess.                                                                                                                                                            |
| `sourceCodePointsObserved`                                             | One per guarded source code point visited, capped by the first-excess witness.                                                                                                                                                                                                                                          |
| `sourceUtf8BytesObserved`                                              | The exact UTF-8 byte length of visited valid scalars, capped by the first-excess byte.                                                                                                                                                                                                                                  |
| `quickEntrySnapshotFieldsCompared`                                     | One per field entered in `sourceText`, `baseRevision`, `target`, `issueCodes`, `expectedStatus`, `expectedLane` order.                                                                                                                                                                                                  |
| `quickEntryIssueCodesCompared`                                         | One per ordered issue position entered, including the first mismatched/unpaired position.                                                                                                                                                                                                                               |
| `syntaxParseCalls`                                                     | One immediately before the sole synchronous T0 call; otherwise zero.                                                                                                                                                                                                                                                    |
| `warningAcknowledgementsCompared`                                      | One per ordered warning/acknowledgement position entered, including the first mismatched/unpaired position.                                                                                                                                                                                                             |
| `insertableChordsExamined`                                             | Returned T0 insertable rows through the selected match, or every returned row when no match exists. Sparse global ordinals are never used as work.                                                                                                                                                                      |
| `recoveryFieldsCompared`                                               | One per entered check in `placement`, `selected-global-ordinal`, `layout-loss-acknowledgement`, `duration-branch-and-value` order. This is `A0_U1_RECOVERY_FIELD_COMPARISON_ORDER` and follows runner-stage/refusal precedence exactly.                                                                                 |
| `draftSectionsVisited` / `draftMeasuresVisited` / `draftEventsVisited` | One per successful T0 draft record entered in structural source order, including a first-excess record.                                                                                                                                                                                                                 |
| `completionDeclarationsVisited`                                        | One per supplied declaration entered, including the first unexpected/extra row.                                                                                                                                                                                                                                         |
| `metadataFieldsCompared`                                               | One per plan-owned section metadata field entered in `name`, `annotation`, `keyOverride`, `voiceLeadingBoundary` order: four for split metadata and twelve for join expected-left, expected-right, then result metadata. Section-declaration row visits are accounted by draft/plan-node counters.                      |
| `metadataCodePointsObserved`                                           | One per code-point iteration entered while validating plan-owned section names, annotations, or pickup/incomplete reasons, including the first invalid or over-limit item. Join order is expected-left, expected-right, then result metadata; no operation combines that three-object maximum with a completion reason. |
| `exactBeatAdditions`                                                   | One per exact operation-local duration sum plus one per event accumulated by the reached final-timeline scan.                                                                                                                                                                                                           |
| `exactBeatComparisons`                                                 | One per exact operation-local equality/order check plus one per accumulated final event compared with the timeline bound.                                                                                                                                                                                               |
| `idAllocationAttempts`                                                 | One immediately before each factory call.                                                                                                                                                                                                                                                                               |
| `idCollisionChecks`                                                    | One for each ID actually returned and checked against the occupied/local set; a thrown/refused factory attempt returns no ID and adds zero.                                                                                                                                                                             |
| `bookmarkRecordsExamined`                                              | One for the selection record, one per selected event ID, one for a non-null insertion boundary, and one for each non-null range endpoint.                                                                                                                                                                               |
| `bookmarkRecordsRewritten`                                             | One per selected event ID replacement, one per changed/cleared insertion, one per rewritten range endpoint, or one for clearing the complete range; unchanged records add zero.                                                                                                                                         |
| `structuralDecodeCalls`                                                | One immediately before F2; otherwise zero.                                                                                                                                                                                                                                                                              |
| `semanticValidationCalls`                                              | One immediately before F3 after F2 succeeds; otherwise zero.                                                                                                                                                                                                                                                            |
| `peakPlanNodeRecords`                                                  | Maximum simultaneously retained plan/draft/recovery records counted by the plan-node rule.                                                                                                                                                                                                                              |
| `peakAllocatedIdRecords`                                               | Maximum successfully returned fresh IDs simultaneously reserved locally; a colliding returned ID is not reserved.                                                                                                                                                                                                       |
| `peakDiagnosticRecords`                                                | Maximum sanitized diagnostic rows retained after deterministic ordering/truncation.                                                                                                                                                                                                                                     |

For exact duration work, the `+1` above the 8,192-event document cap is real:
a successful split can check one split sum and then scan an 8,192-event final
timeline. Collection first-excess scans stop before later timeline work when
their earlier bound already refuses.

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

| Law ID                                                     | Normative obligation                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `A0-U1-ATOM-001-command-and-five-closed-variants`          | One additive command, exactly five top-level variants, exact shape, no candidate or nested batch.                                                      |
| `A0-U1-ATOM-002-quick-entry-snapshot-and-target-exact`     | Insert compares every frozen QuickEntry field and the canonical placement target before parse/allocation.                                              |
| `A0-U1-ATOM-003-raw-source-reparsed-once-by-t0`            | The guarded raw text is synchronously reparsed exactly once by real T0 with current meter and ASCII style.                                             |
| `A0-U1-ATOM-004-complete-draft-success-and-warnings-exact` | Complete lane requires T0 success and exact ordered code/range warning acknowledgements.                                                               |
| `A0-U1-ATOM-005-recovered-failure-selects-one-chord`       | Recovery requires T0 failure, selects exactly one global insertable ordinal, and applies no sibling.                                                   |
| `A0-U1-ATOM-006-recovered-loss-duration-placement-exact`   | Recovery requires the exact layout-loss token, exact resolved/caller duration branch, and one-measure placement.                                       |
| `A0-U1-ATOM-007-complete-draft-placement-shape-exact`      | Measure, section, and document lanes permit only their declared T0 structure and preserve/flatten exactly as stated.                                   |
| `A0-U1-ATOM-008-new-event-policy-fixed`                    | Every inserted event uses exact T0 content and the fixed balanced four-voice Auto policy.                                                              |
| `A0-U1-ATOM-009-completion-declarations-exact`             | The operation supplies the exact closed tuple and no completion is inferred or repaired.                                                               |
| `A0-U1-ATOM-010-split-event-lossless-exact`                | Exact positive sum; original/left keeps ID, content, and annotation; fresh right copies content and has empty annotation.                              |
| `A0-U1-ATOM-011-join-events-left-inverse-exact`            | Immediate siblings require literal chord/voicing equality and empty right annotation; left ID/content/annotation survive exact sum.                    |
| `A0-U1-ATOM-012-split-section-leading-survivor-exact`      | Strict interior split retains leading ID/metadata and every measure/event identity while allocating one suffix ID.                                     |
| `A0-U1-ATOM-013-join-sections-left-metadata-exact`         | Adjacent join retains left ID, compares both expected metadata objects, applies explicit result, and removes the right entry boundary.                 |
| `A0-U1-ATOM-014-timeline-and-bounds-preserved`             | Flattened event order/durations and unaffected data remain exact, and every final domain bound holds.                                                  |
| `A0-U1-ATOM-015-ids-preflight-preorder-honest-entropy`     | Operation-local computable preflight precedes deterministic allocation; F2/F3/history remain post-allocation; no retry or entropy rollback is claimed. |
| `A0-U1-ATOM-016-bookmarks-publication-history-atomic`      | Operation-specific bookmarks, one F2, one F3, one revision, one history entry, effects, undo, and redo are atomic.                                     |
| `A0-U1-ATOM-017-transposition-and-existing-a0-unchanged`   | Metamorphic transposition laws hold and all fifteen existing commands remain byte-for-byte behavior compatible.                                        |

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

The aggregate packet must additionally prove malformed exact shapes (including
accessor/inherited-property rejection without getter execution), unknown keys,
stale envelope revision, each stale QuickEntry field, every canonical start/
before/after/end target form, T0 success/failure lane swaps, warning order/range
mutations, recovered sibling suppression, resolved/caller duration swaps, each
placement mismatch, empty/non-empty new-measure completion conversion, total
bookmark mappings including empty-section joins, every reachable maximum and
maximum-plus-one witness, explicit static dominance for unreachable bounds, ID
failure/collision at every allocation position, F2/F3 refusal with exact public
call counters, history refusal, undo/redo identity stability, and existing A0
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
