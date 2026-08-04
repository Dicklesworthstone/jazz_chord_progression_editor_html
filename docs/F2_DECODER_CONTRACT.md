# F2 Structural Decoder Contract

Status: reviewed implementation authority for package F2. This document and the
machine-readable fixtures under `tests/fixtures/decoder/` are sufficient to
implement F2 without consulting `docs/REBUILD_PLAN.md`.

F2 is a wire-shape boundary, not a musical interpretation boundary. It turns a
bounded, parsed, unknown value into a fresh immutable
`ProgressionDocumentShapeV2`, or returns stable diagnostics and no value. It
imports only Domain modules and never imports Theory, the Atlas, Application,
UI, audio, persistence, export, or test-support code.

## Public surface and boundary split

F2 exposes two synchronous, pure operations:

```ts
preflightDocumentImportBytes(
  utf8ByteLength: number,
): DocumentImportBytePreflightResult;

decodeDocumentShape(input: unknown): DocumentShapeDecodeResult;
```

The F2/build package implements them in `src/domain/document-decoder.ts`,
exports a recursively frozen `documentDecodeOperations` value implementing
`DocumentDecodeOperations`, and re-exports the two functions, that value, and
their public types/constants from `src/domain/index.ts`. The F1
`DomainOperations` object remains unchanged.

`preflightDocumentImportBytes` is the authoritative domain-law check for file,
pasted-text, and recovery imports. The importing adapter observes the original
UTF-8 byte length before decoding or parsing and calls this operation. The
adapter remains responsible for binding that observation to the payload; E0
must prove that integration rather than trusting a caller-supplied chart field.
A valid canonical nonnegative safe-integer length at or below 2,097,152
succeeds, including positive zero. Negative zero is noncanonical and fails with
`shape.invalid_type`; F2 never silently changes its sign bit. A larger length
fails with `limit.import_bytes_exceeded` at `[]`. A runtime value that is not a
nonnegative safe integer fails with `shape.invalid_type` at `[]`. Success
returns the observed length and `warnings: []`; failure returns a nonempty
`errors` tuple and no value.

`decodeDocumentShape` accepts the already materialized value. It rechecks the
depth and structural limits but cannot reconstruct the byte length of an
arbitrary object without invoking user code or serializing it. It therefore
must not claim to enforce the byte limit. All untrusted import adapters must use
the byte preflight first.

The canonical import sequence is:

1. observe the original byte length without copying the payload;
2. run `preflightDocumentImportBytes` and stop on failure;
3. decode UTF-8 and parse JSON with no reviver;
4. run `decodeDocumentShape` into a temporary candidate;
5. run the later F3 semantic gate;
6. preview and publish only after explicit user confirmation.

Malformed UTF-8 and malformed JSON belong to the import adapter. F2 must not
invent an F2 issue code for either. Native `JSON.parse` is bounded by the prior
2 MiB check. The shape decoder's depth and collection preflights run before it
allocates candidate nodes proportional to those collections.

## Totality and observable input model

For every terminating ECMAScript reflection operation, both public operations
return a result and do not throw. F2 catches a throwing or revoked Proxy and
reports `shape.invalid_type` at the container path. JavaScript cannot guarantee
termination when a Proxy trap itself never returns; nonterminating host code is
the sole explicit exclusion from the totality claim. The bytes-first import
path never accepts host objects and is the security/resource boundary for
external data.
"Does not mutate input" means F2 performs no decoder-authored write. A Proxy
trap can itself mutate arbitrary state when reflection invokes it; JavaScript
cannot prevent that. Fixed callback and unchanged-input evidence therefore uses
passive probes whose terminating traps only record observations.

Persisted records are non-null values whose `typeof` is exactly `"object"`,
that are not arrays, and that are not ECMAScript boxed Boolean, Number, String,
BigInt, or Symbol wrapper objects. F2 identifies those wrappers only with the
corresponding intrinsic `valueOf` brand checks; a failed brand check means
"not this wrapper" and no property or prototype is read. Callable function
objects are not record containers. A callable or boxed-primitive root produces
`document.root_not_object`, and the same value at a nested record field
produces `shape.invalid_type` at that field. Accepted records are defined by own
string-keyed properties. F2 uses property
descriptors and never property reads, spread, iteration protocols, `toJSON`, a
reviver, or array helpers supplied by the input. It follows these rules:

- An allowed field must be an own enumerable data property. A missing field,
  accessor, or non-enumerable allowed field produces `shape.invalid_type` at
  that field path. The special missing root `schema` field instead produces
  `document.schema_missing`.
- An own string field absent from the allowed-field set produces
  `shape.unknown_field` at that field path. Its accessor is never invoked. Its
  data-descriptor value may be traversed only by the prior depth/cycle preflight
  so an unknown branch cannot hide an over-depth graph; it is never
  semantically decoded.
- An own symbol key cannot be represented in `DomainPath` and produces one
  `shape.invalid_type` at its containing object or array path.
- Prototypes are never enumerated or consulted for field values. An object with
  `Object.prototype`, a null prototype, or a custom prototype is accepted when
  its own surface is otherwise valid. Inherited required fields remain missing,
  inherited unknown fields are ignored, and inherited getters are never called.
- Frozen, sealed, non-writable, and non-configurable enumerable data properties
  are valid. Candidate construction never depends on input mutability.
- An own JSON key named `__proto__`, `constructor`, or `prototype` has no magic
  status. It is an unknown field wherever the schema does not allow it. F2
  never assigns untrusted keys to candidate objects.

Arrays must be genuine arrays. Typed arrays, iterables, `arguments`, and
array-like objects are invalid types. Array slots are inspected by own property
descriptor; holes and accessor slots produce `shape.invalid_type` at the
numeric slot path. Inherited indices do not fill holes. Extra own string keys
produce `shape.unknown_field`; an own symbol key produces `shape.invalid_type`
at the array path. F2 never calls the input's iterator, `map`, `slice`,
`forEach`, or other methods.
The own-key audit permits only the intrinsic non-enumerable `length` property
and canonical in-range index keys; `length` is not treated as an unknown field.
Every present index must be an enumerable data descriptor. A non-enumerable or
accessor index is `shape.invalid_type` at its numeric slot path.

A container that is an ancestor of itself is not a JSON tree and produces
`shape.invalid_type` at the first repeated edge path. Cycle detection occurs
before applying the depth increment for that repeated edge; an acyclic edge
that first reaches depth 33 instead produces the global depth issue. A shared
but acyclic container may be decoded at both locations; the two output
locations must be distinct fresh objects.
Shared acyclic containers are accepted; ancestor cycles are not.

## Required phases and failure precedence

The implementation uses these observable phases:

1. import-byte preflight, when applicable;
2. root inspectability and root-object check;
3. iterative graph depth preflight;
4. collection-length and total-event preflight;
5. field decoding, local F1 construction, cross-field structural checks, ID
   indexing, and exact timeline accumulation;
6. diagnostic sort and either candidate freeze or transactional discard.

An import-byte failure is returned alone and the adapter must not parse or call
the shape decoder. A nonobject root returns only `document.root_not_object` at
`[]`. A depth failure returns only `limit.json_depth_exceeded` at `[]`.

Depth preflight walks own data-descriptor values in comparator preorder:
object string keys lexically; arrays by numeric index, then extra string keys
lexically; symbol values are never descended. A throwing reflection operation
or first ancestor cycle is a fatal preflight `shape.invalid_type` at that
container/edge path and is returned alone. This inspection/cycle check precedes
the depth increment at a repeated edge. Accessors are recorded for the ordinary
shape phase but never invoked or descended.

Collection preflight checks sections, each section's measures in numeric index
order, the cumulative event count, and then each reachable custom or stored
pitch array before its elements. The first exceeded collection limit is a fatal
preflight result returned alone; no ordinary sibling diagnostics or candidate
nodes are produced. Precedence is sections, per-section measures in chronology,
cumulative events, then pitch arrays in chronology. The event counter stops as
soon as it observes 8,193 slots, because the diagnostic path is always
`["sections"]`.
Within one event, a Custom chord's `pitchNames` length is checked before that
event's Manual/Frozen `voicing.pitches` length. If both are 17, the sole fatal
issue is at the chord `pitchNames` path. Parsed events have no chord pitch array
and proceed directly to the stored-voicing array when applicable.
"Reachable" here means that the containing own data fields and union
discriminator were inspectable and recognized. An invalid container or
discriminator is not guessed merely to run a descendant length check; its
ordinary structural issue wins for that branch.
When a section, measure, event, or chord branch is missing or malformed but no
reflection failure occurs, collection preflight prunes that branch and
continues later siblings in chronology. It counts array slots, not successfully
decoded elements. Fatal collection precedence is therefore deterministic even
when ordinary shape errors coexist elsewhere.

Field decoding aggregates every independently reachable ordinary issue rather
than stopping at the first bad scalar. A field whose type/container is invalid
is reported once and is not descended into. Unknown fields do not suppress
known sibling checks. Cross-field checks run only when all of their operands
decoded successfully.

F1 constructors provide value laws, not F2's aggregation policy. F2 validates
independent sibling fields/arrays separately and may isolate a leaf law with a
reviewed valid counterpart rather than letting a constructor's first refusal
hide later siblings. In `F2-VALUE-002` accepted-axis Custom-bass cells, that
counterpart is exact: after changing the bass step/alter, the fixture replaces
Manual `pitches[0]` with the same spelling at octave 3 so every accepted bass
spelling remains the lowest included pitch. A single correctly typed scalar emits every independently
applicable local issue only where this contract explicitly names co-diagnostics:
free text may emit Unicode, length, and blankness;
event Beat wire `0/2` or `-0/1` emits `beat.not_normalized` at the Beat path and
`beat.duration_not_positive` at its `numerator` path. Final sorting, not check
order, determines their order.

All other individual scalar/value constructors retain F1 refusal precedence.
For example, ID length precedes syntax; tempo uses nonfinite, then noninteger,
then range; octave and MIDI use noninteger before their later bound; playback
levels use nonfinite before range; Beat numerator/denominator normalization uses
the F1 order before the two explicit canonical-wire/duration observations
above. Different fields still aggregate independently.

Conditional chord/voicing laws use this fixed precedence after all leaf fields
decode: Custom+Auto; rootless Auto requiring external (which supersedes the
slash/none law); nonrootless slash Auto with `none`; non-slash stored
`external`; slash stored `external` containing the delegated sounding pitch
class; then slash stored `included` exact-spelling/minimum checks. Within the
last check, an exact spelling only above the minimum yields
`voicing.included_bass_not_lowest`; no exact spelling at a minimum yields
`voicing.included_bass_spelling_mismatch`. Only the first applicable condition
in this list is emitted for one voicing. Independent events still aggregate.

## Exact persisted schema

Every listed field is required, including nullable fields and empty arrays.
There are no optional persisted properties in v2 — with exactly one amended
exception, `playback.grooveStyleId` (see the groove amendment section at the
end of this document). A property present with `undefined` is not equivalent
to absence and fails its field rule; that rule applies to the optional groove
field too.

| Record / variant | Exact own fields |
|---|---|
| document | `schema`, `id`, `title`, `description`, `meter`, `tempoBpm`, `key`, `sections`, `playback` |
| meter | `beatsPerBar`, `beatUnit` |
| key context | `tonic`, `mode` |
| spelled pitch class | `step`, `alter` |
| spelled pitch | `step`, `alter`, `octave` |
| section | `id`, `name`, `annotation`, `keyOverride`, `voiceLeadingBoundary`, `measures` |
| measure | `id`, `events`, `completion` |
| completion `empty` / `complete` | `kind` |
| completion `pickup` / `incomplete` | `kind`, `expectedDuration`, `reason` |
| event | `id`, `duration`, `annotation`, `chord`, `voicing` |
| beat value / duration | `numerator`, `denominator` |
| parsed chord | `kind`, `sourceText`, `root`, `triad`, `sixth`, `seventh`, `extensions`, `additions`, `alterations`, `omissions`, `bass`, `colorPolicy` |
| custom chord | `kind`, `sourceText`, `label`, `pitchNames`, `bass` |
| chord degree | `number`, `alter` |
| Auto voicing | `mode`, `family`, `voiceCount`, `range`, `bassPolicy` |
| MIDI range | `lowMidi`, `highMidi` |
| Manual voicing | `mode`, `pitches`, `bassPolicy` |
| Frozen voicing | `mode`, `pitches`, `bassPolicy`, `generatedBy` |
| Frozen provenance | `engineVersion`, `family` |
| playback | `instrumentId`, `masterVolume`, `reverbAmount`, `countInBars`; optional `grooveStyleId` |

Discriminators are exact, case-sensitive strings:

- document schema: `changes.progression.v2`;
- chord kind: `parsed` or `custom`;
- completion kind: `empty`, `complete`, `pickup`, or `incomplete`;
- voicing mode: `auto`, `manual`, or `frozen`.

A missing root schema reports `document.schema_missing`. Any present schema
other than the exact v2 string, including a future version or a nonstring,
reports `document.schema_invalid`. Unknown union discriminators use
`shape.invalid_type` at the discriminator path. Once a recognized discriminator
is available, its variant's exact field set applies; fields from another
variant are unknown. When a discriminator is invalid, F2 reports that field and
does not interpret variant-only descendants or cascade unknown-field issues for
the union's otherwise plausible branch fields. Fields common to every variant
remain independently decodable, and a truly unknown own key remains unknown;
those common-field and unknown-key issues aggregate with the discriminator
issue in comparator order.

## Scalar, text, and collection laws

All numbers must have JavaScript type `number`. F1 constructors decide their
finite/integer/range refusal after that type check. Booleans, numeric strings,
boxed primitives, BigInts, and `null` are invalid types unless `null` is
explicitly allowed.

Stable IDs are case-sensitive, 1-128 ASCII characters, and match
`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Document, section, measure, and event IDs
share one global namespace. Invalid IDs are not inserted into the duplicate
index. For a duplicate cluster, emit exactly one `id.duplicate` issue at every
occurrence path, including the first occurrence; never emit pairwise O(n^2)
diagnostics. Multiple clusters are combined and globally sorted. The v2 schema
currently contains no stored ID references, so `id.reference_missing` is
reserved and F2 emits it only when a future reviewed schema declares a
reference field.

Strings reject unpaired UTF-16 surrogates, count Unicode scalar values, and are
preserved code-unit-for-code-unit. No string is trimmed or normalized. Required
nonblank fields use only ECMAScript `String.prototype.trim()` to decide
blankness, so U+FEFF is blank and U+0085 is nonblank.
This Unicode-scalar/free-text policy applies exactly to the eight fields in the
table below. IDs use the ASCII ID grammar; schema, enum, discriminator, mode,
family, policy, and instrument strings use their exact inventories instead and
do not additionally emit `string.invalid_unicode_scalar`.

| Persisted field | Required | Limit | Excess issue |
|---|---:|---:|---|
| `title` | nonblank | 256 code points | `limit.title_code_points_exceeded` |
| `description` | may be empty | 2,000 | `limit.description_code_points_exceeded` |
| section `name` | nonblank | 256 | `limit.section_name_code_points_exceeded` |
| annotation | may be empty | 2,000 | `limit.annotation_code_points_exceeded` |
| chord `sourceText` | nonblank | 256 | `limit.symbol_code_points_exceeded` |
| custom chord `label` | nonblank | 256 | `limit.custom_label_code_points_exceeded` |
| partial completion `reason` | may be blank in F2 | 2,000 | `limit.reason_code_points_exceeded` |
| frozen `engineVersion` | nonblank | 64 | `limit.engine_version_code_points_exceeded` |

Every lone surrogate also produces `string.invalid_unicode_scalar` at the field
path. Independently true same-path text issues coexist and sort by code; for
example, 257 spaces in `title` produce the limit issue before `string.blank`.
Partial-completion reason blankness is the deliberate exception to the F1
nonblank text inventory: F2 enforces its type, scalar validity, and length, then
F3 owns `measure.reason_blank`. Frozen engine-version blankness uses the existing
F1 `voicing.engine_version_invalid` code rather than `string.blank`.

| Resource | Inclusive maximum | Failure code and path |
|---|---:|---|
| original UTF-8 import | 2,097,152 bytes | `limit.import_bytes_exceeded` at `[]` |
| container nesting | 32, root container is depth 1 | `limit.json_depth_exceeded` at `[]` |
| sections | 64 | `limit.sections_exceeded` at `["sections"]` |
| measures in one section | 1,024 | `limit.measures_per_section_exceeded` at the section's `measures` path |
| event slots across document | 8,192 | `limit.events_per_document_exceeded` at `["sections"]` |
| custom pitch classes | 16 | `limit.voicing_notes_exceeded` at chord `pitchNames` |
| Manual/Frozen pitches | 16 | `limit.voicing_notes_exceeded` at voicing `pitches` |
| normalized beat numerator | 2,147,483,647 | F1 beat issue at `numerator` |
| total document time | 1,000,000 quarter notes | `timeline.total_exceeded` at `["sections"]` |

Empty section and measure arrays are structurally valid. Empty custom
`pitchNames` and Manual/Frozen `pitches` are structurally invalid. Degree arrays
may be empty; accepted degree arrays are already strictly number-then-alter
ordered and duplicate-free, and omission arrays are strictly increasing and
duplicate-free.

## Local value and structural compatibility laws

F2 performs strict primitive/container checks before calling F1 constructors,
then prefixes every F1 operation-relative path exactly once.

- Spelled pitch class steps are `C D E F G A B`; alterations are integers
  `-2..2`. Stored pitches additionally require a safe-integer octave. MIDI range
  endpoints are integers `0..127`.
- Key modes are `major`, `natural-minor`, `harmonic-minor`, and
  `melodic-minor`; key and section key override may be `null`.
- Meter is 1-32 beats per bar with beat unit 2, 4, or 8. Tempo is a finite
  integer 20-400.
- Playback instrument is one of `mellow-keys`, `fm-electric-piano`,
  `vibraphone`, `warm-pad`, or `analog-poly`; levels are finite `0..1`; count-in
  bars is 0, 1, or 2.
- A present `playback.grooveStyleId` is one of `medium-swing@1`,
  `bossa-nova@1`, `straight-eighths@1`, or `block-chords@1`
  (`playback.groove_style_invalid` otherwise). The default `ballad-comp@1` is
  expressed only by absence: a stored explicit default reports
  `playback.groove_style_not_canonical` at the field path, mirroring the
  `beat.not_normalized` no-repair precedent.
- `voiceLeadingBoundary` is `continue` or `reset`.
- Beat wire values use a safe integer numerator and denominator. They must
  already be canonical and reduced, with nonnegative numerator no greater than
  2,147,483,647 and positive denominator dividing 960. A reducible but
  noncanonical pair reports `beat.not_normalized` at the beat object path.
  Event durations must additionally be strictly positive. F2 never repairs a
  fraction.
- Negative zero is noncanonical for a Beat numerator: normalization produces
  positive zero, so persisted `-0` reports `beat.not_normalized` at the beat
  object path. In ordinary numeric fields where positive zero is valid, F1's
  numeric comparison semantics treat `-0` as zero; F2 does not invent a new
  refusal code.
- Parsed chord triad, seventh, color, degree, Auto family, voice-count, range,
  and bass-policy inventories are the exact exported F1 inventories. Degree
  arrays and omissions retain exact order.
- Auto rootless families require external bass. A slash chord cannot use Auto
  `bassPolicy: "none"`. A custom chord cannot use Auto voicing.
- Custom pitch names and Manual/Frozen pitches are nonempty and capped at 16.
  Manual/Frozen order, spelling, octave, and duplicates are preserved exactly.
  Stored bass-policy constraints, exact spelled included bass, lowest sounding
  bass, and external-bass exclusion are F2 structural checks already expressed
  by `makeChordEvent`.
- Frozen provenance has a nonblank bounded engine version and a recognized Auto
  family. F2 preserves it exactly.

All decoded events' exact durations are accumulated in chronology order. The
timeline limit is structural even if one or more measures will later fail F3
completion semantics. Every locally valid event duration contributes even when
that event has an unrelated invalid ID, annotation, chord, or voicing. An
invalid duration contributes nothing because F2 has no exact value to add.

## Deliberate F3 boundary

Structural success does not certify musical meaning and is never cast to
`ValidatedDocument`. F2 deliberately accepts candidates with:

- parsed `sourceText` that disagrees with its stored chord AST;
- cross-category formula conflicts that require the parser/resolver;
- custom pitch names that disagree with Manual/Frozen voicing pitches;
- `empty` completion with events or nonempty completion with no events;
- complete, pickup, or incomplete duration/capacity mismatches;
- a blank-document or empty-section shape;
- any playback setting whose recipe's later realizability cannot be established
  without downstream content/audio services.

F3 owns those checks after T1 exists. F2 must not import Theory or reject these
fixtures to make its output look semantically cleaner.

## Diagnostics

The public result types are exclusive:

- success has `ok: true`, a deeply frozen fresh `value`, and exactly
  `warnings: []`; it has no `errors`;
- failure has `ok: false` and a deeply frozen nonempty `errors` tuple; it has no
  `value` or `warnings`.

Every issue has a stable `code`, frozen `path`, and nonblank deterministic
`message`. Messages name schema fields and rules but never interpolate chart
text, IDs, hostile values, or other user content. F2 first-release issues omit
`suggestion` and `sourceText`. Prose is not a golden API; code and path are.
The public `DocumentDecoderIssue<C>` type therefore has exactly the keys
`code`, `path`, and `message`; it is not the broader optional-field
`ValidationIssue<C>` surface used by later semantic/application diagnostics.

Final issues are sorted with `compareValidationIssues`: path segments from left
to right, numeric segments numerically, string segments lexically, shorter
equal prefix first, then issue code lexically. Object declaration order, input
insertion order, reflection order, and set/map order never affect output.
Exactly duplicate code/path pairs are collapsed; distinct independently true
codes at one path remain.

## Freshness, immutability, and state

F2 does not mutate the input, current document, selection, history, transport,
recovery, or audio. It creates no stable IDs and performs no repair, coercion,
sorting, deduplication, trimming, normalization, inference, or optimization.

On success every output object and array is newly allocated and recursively
frozen, including path arrays and the warnings array. No mutable or immutable
input container is aliased into the result. On failure all temporary candidate
nodes are discarded and no partial candidate is observable. Repeating a decode
of an unchanged input yields deeply equal results but distinct success values.
For every successful conformance cell, a test-owned own-data descriptor
projection compares the recognized persisted input tree with the decoded tree.
Record fields are canonicalized in reviewed schema order and require the exact
same field set and values; input record insertion order is irrelevant. Arrays
retain exact order, and every scalar uses `Object.is`. This
corpus-wide oracle includes spellings, source text, IDs, durations, duplicates,
and negative zero, and excludes only descriptor flags, prototypes, envelopes,
and diagnostics. Production output never generates either side of the oracle.

The operations are synchronous, revision-free, and side-effect-free.
Cancellation and stale-revision semantics are explicitly not applicable; A0
and later adapter packages own them.

## Deterministic work and memory evidence

Correctness cutoffs use counts, never wall time. F2 verification records:

- observed import bytes and the 2,097,153 stopping witness;
- maximum container depth and the depth-33 stopping witness;
- section, per-section measure, cumulative event, and pitch-array slots with
  exact capped witnesses of 65, 1,025, 8,193, and 17;
- records and arrays inspected exactly once when their cached reflection audit
  begins, scalar fields entering semantic validation, descriptors, and array
  slots;
- decoded candidate graph objects/arrays retained before and after each
  preflight;
- raw diagnostic candidates before exact code/path collapse;
- ID occurrences/clusters plus index work units that expose pairwise scans;
- exact timeline additions and PPQ-960 ticks through the 960,000,001
  one-tick-over witness;
- getter, iterator, and `toJSON` call counts, all zero;
- input/output mutation and alias checks.

Evidence distinguishes depth-preflight descriptor/slot inspections from
semantic element decodes and candidate copies. A plus-one collection may have
nonzero depth descriptor/slot reads, but must have zero semantic decodes and
zero candidate copies for the oversized collection. Getter-call counters remain
zero in every phase. One descriptor snapshot per reached container is built on
first inspection and reused by every later phase in the call. Its array snapshot
includes the intrinsic `length` descriptor; every own numeric index descriptor
also increments `arraySlotsRead`. `recordsInspected` and `arraysInspected`
therefore count reached container occurrences once per call rather than once per
consumer phase.

F2/build supplies two internal evidence-returning seams in
`src/domain/document-decoder.ts` with these exact signatures:

```ts
preflightDocumentImportBytesWithEvidence(
  utf8ByteLength: number,
): DocumentImportBytePreflightWithEvidenceResult;

decodeDocumentShapeWithEvidence(
  input: unknown,
): DocumentShapeDecodeWithEvidenceResult;
```

Each result is the recursively frozen `{result,evidence}` record declared in
`document-decoder-contract.ts`. Its `DocumentDecoderEvidence` has exactly the
28 decoder-owned counter keys named there. Every call creates and resets its
own evidence record; no module-global counter or hidden mutable state exists.
The public functions call the same core, discard evidence, and retain their
exact one-argument signatures.

The seven callback/state observations `getterCallbacks`,
`propertyGetCallbacks`, `prototypeCallbacks`, `iteratorCallbacks`,
`toJSONCallbacks`, `sourceMutations`, and `stateWrites` are harness-owned.
Test-owned descriptors/callbacks and before/after snapshots record them outside
the decoder, then `src/test-support/` merges them with the returned 28 counters
only for a campaign observation. They never appear in the private seam's
evidence record and require no hidden decoder state.

An adapter under `src/test-support/` may deep-import the two seams and their
result/evidence types. Neither seam nor any evidence-only type is re-exported
from the Domain index. Static boundary tests prove that production modules
cannot import test-support and that both seams and all evidence-only types are
absent from the public index.

The same AST-aware static gate proves implementation mechanics that runtime
outputs cannot reveal. `document-decoder.ts` has no module-scope `let`/`var`,
no unfrozen module-scope reference binding other than named function
declarations, reviewed recursively frozen lookup constants, and
`documentDecodeOperations`, and no write to a function, import, function
property, or module binding. A reviewed lookup constant may contain only
primitive literals and acyclic plain object/array literals recursively frozen
at initialization. `Map`, `Set`, `WeakMap`, `WeakSet`, typed arrays, dates,
regular expressions, class instances, functions, accessors, and any other
mutable built-in are forbidden inside those constants; freezing their wrapper
would not freeze their internal mutable state. These rules are the
deterministic proof that user objects cannot be retained in module state.

Taint-aware AST proof also follows the input and every data-descriptor value
derived from it. Outside the single reviewed reflection-snapshot routine, the
decoder may not read an untrusted container with a `MemberExpression`,
destructuring pattern, `Reflect.get`, iterator/spread protocol, or an
input-supplied method call. The snapshot routine may use only reviewed
intrinsics that cannot invoke an input getter or helper, captures each own-key
and own-property descriptor once, and all later phases read only that cached
snapshot. On a tainted container the gate forbids assignment/update, `delete`,
`Object.assign`, `Object.defineProperty`, `Object.defineProperties`,
`Object.setPrototypeOf`, `Reflect.set`, `Reflect.deleteProperty`,
`Reflect.defineProperty`, `Reflect.setPrototypeOf`, and mutating method calls.
This catches write-then-restore mutations which a before/after descriptor
snapshot alone cannot observe. The runtime campaign additionally wraps a full
representative record/array graph in recursive write-trapping proxies and
requires zero `set`, `defineProperty`, `deleteProperty`, or
`setPrototypeOf` callbacks.

The depth-preflight call graph must be acyclic and contain an explicit
function-local worklist loop, with no direct or indirect recursive traversal.
The gate also rejects `Object.assign`, `JSON.stringify`, and untrusted spread
in the decoder module. No correctness path may read `Date.now`,
`performance.now`, `Temporal.Now`, a timer, or another wall-clock API; elapsed
time may be recorded only outside the semantic gate as performance evidence.
Candidate flow also rejects `any` assertions, double casts, and unchecked
assertion helpers, while still allowing reviewed literal-narrowing `as const`.

Every checked-in materialized cell runs on fresh equivalent inputs through
both the public operation and its private evidence seam. The public result must
exactly equal the private `{result,evidence}.result`; the static gate separately
requires both wrappers to call one shared core and forbids semantic branches in
the public wrapper.

`candidateObjectsAllocated` and `candidateArraysAllocated` count only nodes of
the decoded-document candidate graph: a node increments exactly once when the
single record/array that can become that output node is created and attached to
the in-progress candidate graph. F1 refusal/result envelopes, leaf-value
records used only to validate, diagnostics, paths, evidence, reflection
snapshots, and worklists are not candidate nodes. Discarded or replacement
candidate record/array construction is forbidden: every accepted persisted
record/array is assembled exactly once and the representative golden graph is
therefore exactly 14 objects and 7 arrays. Fatal collection preflight occurs
before any candidate graph node is created, so its candidate counts are zero.
The static gate requires every candidate graph record/array to be created by
the two local counter-incrementing candidate factories and rejects candidate
containers built anywhere else. An F1-returned container may be inspected only
as a leaf-law validation result and may never itself be attached to the
candidate graph. In particular, composite constructors such as
`makeChordEvent` are forbidden: they allocate replacement chord wrappers and
also impose first-refusal aggregation that does not satisfy this contract.

The supported external path is bounded by 2 MiB before parse. The decoder uses
an iterative depth scan, bounded collection counters, an O(n) global ID index,
and exact rational accumulation. Candidate memory is O(accepted known-shape
nodes plus diagnostics). It does not allocate candidate arrays proportional to
an oversized declared collection. ECMAScript reflection necessarily produces
engine-owned key/descriptor observations; on the supported external path their
size is bounded by the prior byte cap. Resource claims do not extend to a host
Proxy whose traps do not terminate.

Malformed UTF-8, malformed JSON, duplicate raw JSON keys, parse invocation
counts, and no-reviver proof are named E0 integration obligations in the trace
ledger. They are not fabricated as F2 decoder evidence because the reviewed F2
issue vocabulary contains no corresponding parse codes.

## Fixture adapter and handoff

The checked-in F2 fixtures are independent observations, not serialized
production result envelopes. Descriptor cases such as exact byte counts,
depth, sparse arrays, accessors, Proxies, and special numbers are materialized
by test support. The adapter compares exact code/path sequences, result
exclusivity, counters, freshness, freezing, and unchanged-state observations.

Fixture expected values must never be generated by `decodeDocumentShape`, an
F1 constructor, or a production serializer. The F2 corpus validator imports no
production constants. A separate production-conformance test will compare the
implementation and public exports against the reviewed fixture literals.

Atomic fixture expansion is part of the reviewed corpus. Ordinary cells run
independently against fresh templates in checked-in order; multiple axes form a
Cartesian product only where a case's structured `cellExpansion` says so and
names the nesting order. In particular, the accepted chord inventory varies one
axis at a time, every degree value is applied independently to extensions,
additions, and alterations, and the unknown-field campaign lists exact
activations and node paths for every variant record.

Seeded replay shuffles case IDs only. A scheduled case materializes all of its
atomic cells in the corpus-defined internal order and produces one projected
case observation. A success projects to `{ok:true}`; a failure projects to
`{ok:false,errors:[{code,path},...]}` in public diagnostic order. Exact values,
messages, counters, and heterogeneous assertion labels remain mandatory test
oracles but stay outside this narrow replay digest, so message prose does not
become a golden API. After recursively sorting object keys by ECMAScript
code-unit order, test support applies no-space `JSON.stringify`, hashes the
UTF-8 bytes with SHA-256, and emits
`caseId<TAB>lowercase-case-hash<LF>`. It records one digest per stable seed in
the seed-ID order frozen by `F2-WORK-001`. Cell indices are deliberately absent,
so there is no second implicit indexing convention.

Forbidden shortcuts:

- property reads, spread, input iterators, getters, revivers, `toJSON`, or
  prototype traversal;
- `JSON.stringify` as shape validation or byte measurement;
- accepting a candidate after dropping an unknown field;
- returning the temporary value alongside errors;
- using `as ProgressionDocumentShapeV2` as validation;
- casting `ValidatedDocument` or moving the allow-listed cast into Domain;
- normalizing BeatValue wire fractions or user-owned strings/pitches;
- treating F3 semantic failures as F2 structural failures;
- using elapsed time as a musical or resource cutoff;
- adding a runtime network, model, prompt, telemetry, or remote-content path.

## Optional groove field (additive amendment, 2026-07-30, jcpe-jnnu)

`playback.grooveStyleId` is the single optional persisted property in the v2
schema. The amendment authorizes exactly this and nothing wider:

- Absence is the canonical — and only — representation of the default groove
  `ballad-comp@1`. The decoder never materializes the default; an absent
  field decodes to an absent field, so every previously accepted v2 document
  and byte golden decodes byte-for-byte unchanged.
- A present value must be one of the four non-default declared groove ids;
  unknown ids report `playback.groove_style_invalid`, and a stored explicit
  default reports `playback.groove_style_not_canonical`. F2 refuses the
  noncanonical form rather than repairing it, exactly as `beat.not_normalized`
  refuses reducible fractions.
- The domain groove inventory is `GROOVE_STYLE_IDS` in `src/domain/document.ts`
  and must stay identical to the playback layer's performance-style ids; a
  static law pins the two tuples together.
- The fixture authority for this amendment: the `playback` object schema in
  `f2-decoder-contract.json` carries the sole `optionalFields` entry, and
  `shape-cases.json` F2-VALUE-002 carries the accepted, unknown-id,
  explicit-default, and wrong-type oracles.
- Every other record keeps the frozen no-optional-properties law. A second
  optional property requires its own recorded amendment with the same
  fixture and digest discipline.

### Groove vocabulary expansion (additive amendment, 2026-07-31)

The owner-directed What a Fool Believes landing adds a sixth declared
groove id, `syncopated-sixteenths@1`, to the domain inventory. Where the
2026-07-30 amendment above says "one of the four non-default declared
groove ids", read "one of the five": the storable set is now
`medium-swing@1`, `bossa-nova@1`, `straight-eighths@1`,
`syncopated-sixteenths@1`, and `block-chords@1`. Everything else the
amendment froze is unchanged:

- The default remains `ballad-comp@1`, expressed only by absence; a stored
  explicit default still reports `playback.groove_style_not_canonical`, and
  ids outside the expanded set still report `playback.groove_style_invalid`.
- The addition is purely additive: every previously accepted document,
  byte golden, and fixture oracle decodes byte-for-byte unchanged, so the
  `shape-cases.json` F2-VALUE-002 cells for the original four storable ids
  remain the pinned oracles and are not re-authored. The new id's
  acceptance law lives with its declaring vocabulary:
  `tests/unit/performance-style-syncopated-sixteenths.test.ts` sweeps every
  `GROOVE_STYLE_IDS` member through the production decoder, refuses the
  explicit default, and refuses a near-miss unknown id.
- The normative inventory pointer is unchanged: `GROOVE_STYLE_IDS` in
  `src/domain/document.ts`, kept identical to the playback layer's
  performance-style ids by the pinned vocabulary law.
