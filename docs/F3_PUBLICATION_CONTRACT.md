# F3 Semantic Document Publication Contract

Status: implementation handoff for `F3/spec`

This document is the self-contained production and independent-verification
contract for F3. The public TypeScript surface is
`src/application/document-validation-contract.ts`. The independently authored
authority is rooted at
`tests/fixtures/publication/f3-publication-contract.json`. An implementation or
verification agent must not need `REBUILD_PLAN.md` to decide an accepted
document, issue code/path, ordering rule, state effect, or resource bound.

F3 is the only bridge from an F2 `ProgressionDocumentShapeV2` candidate to the
opaque domain `ValidatedDocument` brand. It composes already-proven T0 parsing,
T1 resolution/spelling, and exact F1 time operations. It does not repair a
document, select an altered-dominant realization, generate a voicing, compile a
playback plan, mutate application state, call storage/audio/export, or infer a
key.

## 1. Ownership and publication boundary

F3 belongs to `application`. It may import only public `domain` and `theory`
entry points for this package. Domain remains independent of Theory, and Theory
remains independent of Application. Production validation must not import
fixtures, test support, content, UI, audio, persistence, export, compatibility,
playback, browser APIs, or the compiled Harmonic Atlas.

`application/document-validation.ts` is the sole statically allow-listed source
file that may cast to `ValidatedDocument`. It performs that cast exactly once,
after every structural and semantic prerequisite has succeeded. No constructor,
guard, assertion function, brand token, `satisfies` expression, double cast, or
second publication path is allowed. The public Application entry point may
export the validated operation only after the F3 build phase; it never exports
the private evidence seam.

The input precondition is a direct success value from F2's
`decodeDocumentShape`. Import, recovery, compatibility, commands, persistence,
playback, and export must route through the combined F2-then-F3 pipeline. Static
integration tests in F3/verify and A0 reject a caller that treats a hand-built
shape or a structural success as published state.

F3 is synchronous, pure, revision-free, and bounded. Cancellation, resume, and
stale-revision semantics do not apply to this value operation. A later
application runner must not wrap F3 in a wall-time musical cutoff.

## 2. Versioned identity and exact callable surface

The identities are:

| Meaning | ID | Version |
|---|---|---:|
| contract | `changes.application.document-validation-contract.v1` | encoded |
| semantic policy | `changes.document-semantics` | 1 |
| source/AST policy | `changes.document-source-ast-equivalence` | 1 |
| stored-pitch policy | `changes.document-stored-pitch-correspondence` | 1 |
| measure policy | `changes.document-measure-semantics` | 1 |

The complete callable surface has one member in this order:

```ts
interface DocumentValidationOperations {
  readonly validateDocumentSemantics: (
    candidate: ProgressionDocumentShapeV2,
  ) => DocumentSemanticValidationResult;
}
```

Success has exactly `ok`, `value`, and `warnings`; `warnings` is the exact empty
tuple. Failure has exactly `ok` and a nonempty `errors` tuple. It exposes no
partial document, warnings, inferred realization, or repaired value.

Every `DocumentSemanticIssue` has exactly `code`, `path`, and `message`.
Messages are nonblank deterministic prose but are not golden keys. They never
interpolate chart text, IDs, labels, annotations, hostile values, or other user
content. F3 does not populate `suggestion` or `sourceText`.

F3 owns no new issue vocabulary. It uses the ten F1-reviewed codes in this
order:

```text
chord.source_semantic_mismatch
custom.pitch_voicing_mismatch
measure.empty_has_events
measure.nonempty_has_no_events
measure.complete_duration_mismatch
measure.duration_over_capacity
measure.expected_duration_not_short
measure.expected_duration_not_positive
measure.expected_duration_mismatch
measure.reason_blank
```

## 3. Parsed source and AST equality

Every parsed event is checked in document order. F3 calls `parseChordSymbol`
exactly once with the stored `sourceText` and the fixed `ascii` accidental
style, then independently calls `resolveChord` exactly once with the stored
AST. The style only controls canonical formatting, which F3 ignores; freezing
it keeps the operation deterministic without making canonical text a
publication requirement. The two checks are independent: a source
mismatch does not suppress a formula/refusal finding, and a resolver refusal
does not make source text authoritative.

A source is equal when parsing succeeds and these ten stored fields equal the
parsed result exactly:

```text
root, triad, sixth, seventh, extensions, additions, alterations,
omissions, bass, colorPolicy
```

Pitch spellings compare by written step and alteration. Degree arrays compare
element-for-element in their stored order. A supported alias such as `CM7` may
publish because it reparses to the same AST; canonical text is not required
until a structured edit. Enharmonic equality by pitch class is insufficient.

Parse failure or field drift emits
`chord.source_semantic_mismatch` at the event's
`["chord", "sourceText"]` path. The diagnostic never substitutes a parser
diagnostic code and never applies `didYouMean`.

If T1 refuses the stored AST, F3 emits the same F3 code at the event's
`["chord", ...refusal.path]`. T1 refusal details remain verification evidence,
not a second public issue vocabulary. F3 never accepts a valid prefix, defaults
an unsupported family, changes an accidental, or selects a different formula.

T1's `theory.omission_absent` warning is a derived theory observation rather
than a document contradiction. It does not block publication and is not copied
into F3's warning-free result.

## 4. Altered ambiguity and stored pitch correspondence

`7alt` must resolve to the reviewed four-member tuple in T1 order. F3 accepts
that unresolved plurality and never stores or silently chooses a realization.

Manual and Frozen pitches bypass generation but remain semantically tied to a
parsed chord. F1 intentionally permits spelled pitches outside MIDI; F3 first
proves that every stored pitch projects to MIDI for playback. After the
slash-bass projection below, the exact written pitch
classes of all stored pitches must be a subset of one single T1 realization.
The match is by written step and alteration, not pitch class alone. Omitting a
root or optional/required degree is permitted for Manual/Frozen data; adding a
tone absent from every compatible realization is not. For `7alt`, pitches from
different variants cannot be unioned to manufacture a match.

For an included slash bass, F1 has already proved that the exact-spelled bass is
at the minimum sounding register. F3 removes every exact-spelled minimum bass
unison before comparing the chord body. A same-spelled tone at a higher register
remains part of the body. An external bass is already absent from stored pitches
by F2. Slash bass never becomes a chord degree merely because it sounds inside
the voicing.

An unprojectable pitch or incompatible parsed Manual/Frozen body emits
`chord.source_semantic_mismatch` at `["voicing", "pitches"]`.

## 5. Custom chord correspondence

Custom source text and label are display data and are never parsed as a formula.
T1 must return the one custom realization with null degree/role fields and the
two reviewed limitations. F2 has already made Auto structurally impossible.

After the same included-slash-bass projection, custom `pitchNames` and stored
Manual/Frozen pitches compare as exact-written pitch-class sets. Octaves,
source order, and legal doublings do not change chord identity. Duplicate
declared pitch names do not create a multiplicity requirement. Enharmonic
substitution is still a mismatch. An unprojectable pitch or any missing or
extra written class emits one
`custom.pitch_voicing_mismatch` at `["voicing", "pitches"]`.

F3 does not rewrite a disagreeing parsed chord into Custom. Import and legacy
migration must make that explicit before publication.

## 6. Foundation playback realizability

F3 proves the playback facts available without importing downstream V0 or
audio:

- every parsed chord resolves to one or four nonempty semantic realizations;
- every Custom chord resolves to its nonempty literal pitch-class set;
- Manual/Frozen pitches are exact and nonempty after F2, then F3 independently
  proves that each one is MIDI-projectable and satisfies the correspondence
  rules above;
- an Auto range contains at least `voiceCount` distinct inclusive MIDI slots.

An Auto cardinality failure emits `chord.source_semantic_mismatch` at
`["voicing", "range"]`. F3 does not generate or audition a candidate.

V0 later owns the versioned quality/family template table. A missing Shell,
Rootless, Drop-2, or Quartal row is a typed V0 `voicing.family_unavailable`
outcome, not a reason for F3 to duplicate or pre-empt that downstream table.
This separation prevents a dependency cycle and keeps F3's brand stable as V0
content grows. Playback-plan compilation still requires both a
`ValidatedDocument` and explicit realized voicings.

## 7. Exact measure semantics

Capacity is exact quarter-note time:

```text
beatsPerBar * 4 / beatUnit
```

F3 folds durations with F1 rational addition. Floating point and elapsed time
are forbidden. It records the first event whose cumulative end exceeds
capacity. Independent measure contradictions are collected; one finding does
not hide another.

- `empty` requires zero events. The first event is
  `measure.empty_has_events` at `["events", 0]`.
- Every nonempty completion kind requires at least one event. Absence is
  `measure.nonempty_has_no_events` at `["events"]`.
- `complete` requires the exact event sum equal capacity. Mismatch is
  `measure.complete_duration_mismatch` at `["completion"]`.
- Any cumulative crossing is `measure.duration_over_capacity` at the crossing
  event's `["duration"]`.
- `pickup` and `incomplete` require `expectedDuration > 0`,
  `expectedDuration < capacity`, and exact equality with the event sum. The
  three corresponding codes point to
  `["completion", "expectedDuration"]`.
- A partial reason must be nonblank under ECMAScript `trim()` without changing
  the stored string. Failure is `measure.reason_blank` at
  `["completion", "reason"]`.

F3 does not restrict a pickup to a position or require a complementary final
bar. Empty documents, empty section lists, empty measure lists, and valid empty
measures publish. No event is inserted to make a measure complete.

## 8. Diagnostics, transactionality, and identity

All independently true event and measure findings are collected. Final issues
are deduplicated by exact code/path, then sorted with Domain's reviewed
path-then-code comparator: numeric segments numerically, string segments by
ECMAScript code units, shorter equal prefix first, then issue code.

Failure returns the complete ordered issue list and no value. It leaves input,
current document, selection, history, transport, recovery, audio, object URLs,
and adapter calls unchanged. Success preserves every ID, source spelling,
string, exact duration, section/measure/event order, Manual/Frozen pitch order,
duplicates, and generation metadata. It returns a recursively frozen
publication value and performs no repair, normalization, sorting, deduplication,
inference, or optimization of document data.

The build must prove the returned publication graph cannot be affected by later
mutation of a test-owned input. Whether the implementation reuses already-frozen
F2 nodes or copies them is not observable through the public value; no mutable
container may cross the brand boundary.

## 9. Work, memory, and termination bounds

All bounds are counts. Wall time is performance evidence only.

| Counter | Maximum |
|---|---:|
| sections visited | 64 |
| measures visited | 65,536 |
| events visited | 8,192 |
| symbol parse calls | 8,192 |
| T1 resolution calls | 8,192 |
| voicing checks | 8,192 |
| exact beat additions | 16,384 |
| publication graph node visits | 73,793 |
| findings per event | 3 |
| findings per measure | 4 |
| complete semantic findings | 286,720 |
| maximum tracked records | 368,705 |

The only terminations are `complete-success` and `complete-refusal`. F3 cannot
return a partial, cancelled, stale, timed-out, yielded, or resumed result. The
private evidence seam records the exact counters and termination but is not a
second callable production API and is not re-exported from Application.

## 10. Independent fixture and proof contract

The F3 fixture root contains exactly:

```text
f3-publication-contract.json
document-cases.json
operation-state-cases.json
mutation-controls.json
trace-ledger.json
provenance-ledger.json
```

Fixtures are authored before production validation. Declarative mutations are
materialized by test support and carry literal expected code/path sequences;
the validator never calls production parsing, resolution, or document
validation to generate expectations. T0/T1 fixture IDs may be cited as
cross-package authority, but their output is not copied at runtime.

The corpus covers: empty/ordinary/alias/custom/Manual/Frozen/Auto/alt/slash
successes; source, formula, spelling, custom, Auto-range, and every measure code;
multi-error ordering; exact 3/8 arithmetic; maximum measure/event work; repeated
determinism; recursive immutability; no aliasing; transactional failure; and
explicit not-applicable cancellation/resume/stale rows.

Each parent clause has a trace entry with positive, near-miss, transposition or
spelling variation where musical, and named mutation proof. Every
judgment-bearing expectation links to a provenance authority. F3/build consumes
the fixtures; F3/verify independently authors the production adapter, mutation
harness, evidence ledger, and bypass/static proofs.

## 11. Forbidden shortcuts

- Casting before all checks complete, or adding any other brand cast site.
- Treating F2 structural success as publication.
- Parsing Custom display text or rewriting a parsed failure to Custom.
- Comparing enharmonic pitch classes where written spelling is authoritative.
- Selecting the first `7alt` realization.
- Unioning multiple altered realizations to justify one stored voicing.
- Requiring Manual/Frozen to contain every Balanced required degree.
- Duplicating V0's family-template availability table in F3.
- Using floating point, timer deadlines, or audio rendering for measure truth.
- Returning only the first error or insertion-order diagnostics.
- Repairing source text, durations, completion markers, pitches, or voicing.
- Echoing chart content into diagnostics or evidence logs.
- Importing fixtures or test support into production.
