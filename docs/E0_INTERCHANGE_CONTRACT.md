# E0 transactional interchange contract

Status: code-facing specification and first golden packet accepted by the
project owner on 2026-07-21 for `E0/spec`
Public modules: `src/export` and `src/application`
Operations: `prepareCanonicalJsonExport`, `prepareLeadSheetTextExport`,
`sanitizeExportFilename`, `deliverExportArtifact`, `readImportSource`,
`prepareImportPreview`, `commitImportReplacement`,
`prepareCanonicalExportDelivery`, and
`completeCanonicalExportMarkerSettlement`

This document is the implementation handoff for deterministic JSON and
lead-sheet-text interchange. An implementation agent must be able to build E0
from this document, the two public TypeScript contracts, and the independent
fixtures under `tests/fixtures/interchange/` without consulting
`REBUILD_PLAN.md`.

The fixture package is definition-derived and was authored without an E0
production implementation. First-golden project-owner acceptance is recorded
in `docs/evidence/E0_GOLDEN_PACKET_REVIEW.md`. A validator may verify the
accepted packet and its recorded state; it cannot manufacture, broaden, or
renew human approval.

## 1. Ownership and boundary

E0 spans two existing architecture layers without weakening either one:

- `export` owns pure canonical JSON projection, lead-sheet-text projection,
  filename projection, artifacts, and the browser delivery adapter contract. It
  may import `domain`, `theory`, and `playback` only. It never imports
  application state, compatibility, persistence, UI, or Preact.
- `application` owns the abortable file/paste read, content routing, injected
  F2/T0/C0/F3 calls, preview publication, request/revision checks, A0
  replacement orchestration, the one-slot private prepared-export registry, and
  completed export-marker settlement. It also owns the consumer-side ports for
  atomic A0 export-revision publication, future A1 marker persistence, and
  future X1 serialized retirement. It may compose lower layers but performs no
  parser, migration, encoder, persistence, or transport shortcut.

Trusted canonical codec/hash and T0 projection ports are bound exactly once by
the export composition root through `createE0ExportOperations`. Trusted decoder,
A0, A1, and X1 ports are bound exactly once by the application composition root
through `createE0InterchangeOperations`.
`prepareCanonicalJsonExport` and `prepareLeadSheetTextExport` are request-only;
their dependency-taking coordinator types are private to composition. Filename
sanitization takes only title/format values, and delivery takes only its request.
`prepareImportPreview`, `commitImportReplacement`,
`prepareCanonicalExportDelivery`, and
`completeCanonicalExportMarkerSettlement` are request-only methods.
`readImportSource` accepts its request plus a caller-owned `AbortSignal`; the
request owns only an untrusted, bounded byte-source capability. Neither grants
parser, publication, transport, persistence, or recovery authority. UI/runtime
callers never receive a trusted dependency object and cannot substitute a
trusted adapter per call. The application factory allocates the prepared-export
registry itself; callers cannot inject, inspect, or retain it.

The codecs return values and reports; they do not mutate application state. UI
renders selectors and dispatches intents. UI never receives an export adapter,
storage handle, parser implementation, object URL, or file-system writer.

F2 remains the structural v2 decoder, T0 remains the sole chart grammar, C0
remains the sole unversioned legacy migrator, and F3 remains the sole semantic
publication gate. E0 never casts or constructs the opaque `ValidatedDocument`
brand.

Every record container is immutable. Import acquisition copies accepted
`Uint8Array` input before exposing a payload. Export artifacts retain immutable
text plus exact UTF-8 `byteLength`, never a shared mutable byte array. Ordinary
delivery encodes one fresh private byte copy. Marker-capable delivery pre-encodes
one private copy during preparation, stores it in the E0-owned single-use
registry, and transfers its sole ownership to the activation-safe start
primitive. Production artifact records are frozen before return, and both
delivery paths revalidate text/length defensively. Raw input bytes, delivery
bytes, and browser handles never enter
`AppState`, history, recovery, notices, or document JSON.

## 2. Public identities and result discipline

The public schemas and policy identities are the constants in:

- `src/export/interchange-contract.ts`;
- `src/application/e0-interchange-contract.ts`.

Every operation returns one exclusive discriminated result. A refusal before
delivery contains one stable bounded diagnostic and no partial artifact,
candidate, preview, replacement handoff, receipt, or marker. Once delivery
starts, every public result truthfully retains its normalized terminal delivery
projection; this can report a delivered snapshot even when a later clock,
stale-state, A0, or A1 step refuses marker advancement. A success report is
intentional data, not a disguised diagnostic.

The public E0 projection of a C0 refusal never retains `collidingId` or any raw
legacy value. It keeps only code/path, numeric limit detail, stable-ID kind,
factory code, and the first source path needed for an actionable diagnosis.
The raw C0 refusal may exist only inside the transient adapter/evidence layer.

Every retained diagnostic path is an E0-owned `ImportPublicPath`, never an
upstream `DomainPath`. Its field vocabulary is the deduplicated union of the
canonical JSON keys and reviewed C0 document/section/chord keys. E0 preserves
only nonnegative safe numeric indices through 65,536, replaces every unknown
field with `<redacted-field>`, replaces every invalid index with
`<invalid-index>`, and caps paths at 32 segments by ending the projection with
`<path-truncated>`. No operation-level error invents another string path
segment; errors outside reviewed source structure use `[]`.

Human messages may improve. Stable APIs are schema, policy/version, code, path,
source range, ordered counts, and terminal outcome. Diagnostics and logs never
echo titles, chord symbols, IDs, annotations, filenames, hostile values, or raw
payload text. Preview UI may render validated user strings only as text nodes.

## 3. Canonical JSON export

### 3.1 Explicit projection and key order

`prepareCanonicalJsonExport` accepts only a `ValidatedDocument`. It constructs a
fresh plain JSON projection by reading declared fields in the exact
`CANONICAL_JSON_KEY_ORDER`. It never spreads the document, enumerates runtime
keys, calls `toJSON`, consults prototypes, serializes a surrounding application
envelope, or includes derived analysis.

Arrays retain their declared semantic order:

- sections, measures, and events remain chronological;
- degree arrays remain their validated number/alter order;
- stored pitches retain exact written order, spelling, octave, and legal
  doubling;
- Custom pitch names retain stored order.

Nullable fields are emitted as `null`; empty arrays and empty optional text are
emitted. There are no omitted persisted fields, with exactly one amended
exception (2026-07-30, jcpe-jnnu): `playback.grooveStyleId` is emitted exactly
when the validated document stores it. The default groove `ballad-comp@1` is
expressed only by absence — F2 refuses a stored explicit default as
noncanonical — so the canonical bytes of every previously accepted document,
including the owner-accepted goldens, are unchanged. The projection uses ordinary
ECMAScript JSON string escaping, two ASCII spaces, LF line endings, and exactly
one final LF. It does not normalize Unicode, escape HTML specially, round
rational values, stringify nonfinite values, or sort object keys lexically.

Finite domain numbers use ECMAScript's shortest JSON form except that
`Object.is(value, -0)` emits the valid JSON token `-0`. This is required because
F2 accepts persisted negative zero in ordinary bounded numeric fields while
`JSON.stringify(-0)` would silently emit `0`. The equality gate also uses
`Object.is` for signed zero.

The canonical artifact contains only the v2 document. In particular it excludes
revision, export marker, recovery envelope, history, bookmarks, selection,
insertion, range, panels, dialogs, drafts, transport, notices, request tokens,
analysis, playback plans, and adapter metadata.

### 3.2 Portable-size law

The original F2 import ceiling is 2,097,152 UTF-8 bytes. A structurally valid v2
document can theoretically contain more serialized annotation text than that.
E0 resolves this pre-existing asymmetry honestly: canonical export succeeds
only when the complete bytes, including final LF, are at or below 2,097,152.
The first excess byte refuses `export.canonical_bytes_exceeded` before hashing
or delivery. A successful canonical artifact is therefore guaranteed to fit the
same release's import byte boundary; a large valid document is not falsely
called portable and remains unchanged with an Export-size diagnostic.

### 3.3 Self-round-trip gate

Bytes are not offered merely because serialization succeeded. Before hashing or
delivery, E0:

1. parses its own complete UTF-8 text once with one-argument `JSON.parse` and no
   reviver;
2. invokes F2 `decodeDocumentShape` once on that parsed value;
3. invokes injected F3 semantic validation once;
4. compares the returned validated document to the source by an explicit
   semantic equality operation covering every persisted field.

Parse, structural, semantic, or equality failure returns its exact E0 refusal
and performs zero adapter calls. The production encoder cannot certify the
round-trip oracle by comparing its output to itself; the F2/F3/equality
operations are independently owned dependencies.

### 3.4 Semantic document hash

`semanticDocumentHash` is lowercase hexadecimal SHA-256 over the exact canonical
artifact bytes, including formatting and final LF. It has no prefix and exactly
64 hexadecimal characters. It is called semantic because the bytes contain
only validated document data, not because it is stable across future canonical
policy versions. It is a change/truncation identifier, not a signature.

The injected hash boundary returns `unknown`. E0 accepts only the exact
`HashBytesResult` envelope and a lowercase 64-hex digest. A synchronous throw,
promise rejection, malformed envelope, or malformed digest is normalized to
`export.hash_unavailable`; no thrown/raw value, partial artifact, prepared
entry, delivery, or marker action survives.

The hash is computed only after the self-round-trip gate. A hash failure refuses
the export. Canonical policy/version and document schema must be recorded in
evidence so a future encoder policy cannot silently reinterpret an old marker.

## 4. Safe filenames

Filename projection never changes the document title. It is total and follows
this order:

1. Choose `.changes.json` or `.changes.txt` from the artifact kind.
2. Decide blankness with ECMAScript `trim()`. A blank title uses the exact
   `untitled-changes.json` or `untitled-changes.txt` fallback.
3. Iterate Unicode scalar values without normalization. Replace each maximal
   run of C0 controls, DEL, `" * / : < > ? \\ |`, bidi embedding/override or
   isolate controls, and lone-surrogate evidence with one ASCII hyphen. A
   validated title cannot contain a lone surrogate, but the filename function
   remains total when tested directly.
4. Remove one case-insensitive terminal `.changes.json`, `.changes.txt`,
   `.json`, or `.txt` from the projected basename so the owned extension is
   appended exactly once.
5. Remove leading/trailing ASCII spaces and trailing dots. Collapse consecutive
   replacement hyphens, but do not collapse authored ordinary hyphens.
6. Truncate to 120 Unicode scalar values, then repeat the trailing-space/dot
   removal. UTF-16 width is never used as the limit.
7. If empty after projection, use the fallback. If the ASCII-case-folded first
   basename component is a reserved DOS device name from the public table,
   prefix `changes-`.
8. Append the owned extension exactly once.

Internal ordinary spaces and non-control Unicode are preserved. Filename text
is assigned only through the File System Access suggested-name option or an
anchor's `download` property. It is never interpolated into HTML, a URL, a CSS
selector, a storage key, or executable source.

## 5. Lead-sheet text export

### 5.1 Supported structural projection

The exporter emits T0 document-mode syntax directly from the validated document
and calls T0's `formatChordSymbol` for every chord. It does not forge a
`ChartTextDraft`: that type is parser evidence whose `sourceText`, source
ranges, repeat origins, and ordinals must remain coherent. E0 then reparses the
complete emitted text through T0 in document mode and compares the supported
document projection before offering bytes. The exported text uses canonical
chord symbols, all event durations, document title/description, global
meter/tempo/key, section names/annotations, barlines, and JSON-escaped event
annotations. It ends in one LF and is limited to 2,097,152 UTF-8 bytes.
The application also supplies only whether a contextual alternate analysis is
currently present; it never passes the analysis payload into export.

The grammar requires at least one section and at least one measure in every
section. A document with no sections or a section with no measures therefore
refuses with an exact path. Only empty and complete measures are representable.
Pickup or incomplete completion metadata refuses with an exact measure path;
it is not emitted as invalid underfilled text. Custom chords likewise refuse at
their event path because T0 has no truthful canonical spelling for them. E0 does
not drop unsupported structure to obtain output.

E0 emits `/` only when the current canonical chord text is byte-identical to
the immediately preceding event's canonical chord text in the same section.
The repeat carries the current event's explicit duration; it never copies the
previous event's duration or annotation. An event with a nonempty annotation
uses a literal chord because T0 version 1 does not accept annotated repeats
(T0 contract §5.6). Repeat eligibility resets at every section,
and the supported-projection comparison ignores parser-only repeat origin while
still comparing the resolved chord. No farther-back or cross-section search is
performed.

### 5.2 Explicit losses

Successful text export returns a versioned loss report ordered by domain path,
then the declared loss-code order. It contains code/path only. These are the
declared losses:

- all persistent document/section/measure/event identities as one global item;
- playback instrument, volume, reverb, and count-in as one playback item;
- a present derived or alternate contextual analysis as one global item because
  it is intentionally outside document data and the application supplied only
  the presence flag;
- each non-null section key override;
- each section voice-leading boundary that is not the chart-import default;
- each source-symbol alias whose T0 canonical form differs;
- each event's Auto family/range/bass/voice policy;
- every exact Manual voicing;
- every exact Frozen voicing and generator metadata.

The report has complete counts and at most 16,515 items by construction. It
never claims that text preserves voicing, playback settings, stable identity,
or analysis. Chart-text export never advances the canonical JSON export marker.

## 6. Import acquisition and stage precedence

File and paste sources converge immediately after byte acquisition. A file is
read as bytes with `ArrayBuffer`/stream semantics, never `File.text()` replacement
decoding. The reader requests at most 2,097,153 bytes, so the first excess byte
can be observed without retaining an unbounded payload. Paste text is encoded
once as UTF-8 and follows the identical byte path.

`readImportSource` is abortable and service-owned. It may return completed,
cancelled, or failed exactly once. A late callback is settled through A0's
request identity and cannot publish a preview. The source handle and raw bytes
are released after preparation; the preview records `rawSourceRetained: false`.

The source handle is deliberately untrusted. E0 calls `readAtMost` with exactly
2,097,153 and treats its raw completion as `unknown`. Success requires an exact
envelope, a `Uint8Array` no longer than the requested cap, and a nonnegative
safe-integer `observedByteLength` equal to `bytes.byteLength`; E0 copies the
accepted bytes before exposing the payload. A synchronous throw, promise
rejection, malformed envelope, oversized returned array, or invalid/mismatched
length normalizes to `import.read_failed`, settles exactly once, and retains no
raw value or bytes. Only the exact closed cancellation envelope becomes
`import.read_cancelled`.

`prepareImportPreview` executes the exact `IMPORT_STAGE_ORDER`:

1. bind the byte observation to the actual acquired payload;
2. call F2 byte preflight before any decoding or parser;
3. decode UTF-8 fatally, with no replacement characters;
4. classify the first non-ECMAScript-whitespace scalar and treat any explicit
   format hint as an assertion about the route, never as authority to bypass
   lexical/schema evidence;
5. for JSON, run a string/escape-aware lexical pass that rejects repeated
   decoded keys in any object, including `"x"` plus `"\\u0078"`;
6. use that same lexical pass to classify only the root schema/sections shape,
   without materializing a second object;
7. route schema/content without fallback guessing;
8. for native JSON call one-argument `JSON.parse` exactly once with no reviver;
   for legacy JSON call C0 on the original bytes and make zero E0 host-parse
   calls because C0 owns its one parse;
9. produce an unbranded candidate through F2, C0, or T0 conversion;
10. run F2 on every constructed/migrated candidate where it was not already the
    native F2 result;
11. run F3 exactly once;
12. compute bounded summary, warning/report projection, and replacement impact;
13. publish a preview only through the matching A0 request settlement.

An earlier failure stops every later stage. Counters prove all skipped calls.
Wall time never affects a format, diagnosis, candidate, or musical result.
If malformed JSON prevents a trustworthy root route, lexical classification
returns `host-parse-to-diagnose-malformed`; the one-argument E0 host parse then
owns the syntax refusal and no chart or legacy fallback is attempted.

## 7. Deterministic format routing

An explicit hint constrains the permitted route and cannot fall back. It does
not select a parser before content classification. JSON-looking bytes always
receive the duplicate-key and root-schema lexical pass, even under a chart-text
hint; non-JSON-looking bytes cannot enter a JSON route. A mismatch refuses
`import.format_mismatch`. In `auto`:

- first non-whitespace `{` or `[` selects the JSON family;
- any other first scalar selects T0 chart text;
- malformed JSON never falls back to chart text;
- chart syntax failure never falls back to JSON.

The lexical root classifier routes JSON before the route's one owned parse:

- exact own schema `changes.progression.v2` routes to native F2 then F3;
- an own schema matching the frozen regular expression
  `^changes\.progression\.v(?:[3-9]|[1-9][0-9]+)$` refuses
  `import.future_schema_unsupported` with compatible-version guidance owned by
  UI copy;
- any other own schema refuses `import.schema_unsupported` and never routes to
  legacy;
- no own schema plus an own `sections` array routes to C0;
- every other unversioned shape refuses `import.json_shape_unrecognized`.

Native v2 data is then parsed once by E0. Recognized legacy bytes are handed to
C0 without an E0 host parse, so C0 remains the owner of that route's sole
`JSON.parse` call. Fixtures pin `1/0` native E0/C0 parse calls and `0/1` legacy
E0/C0 parse calls respectively.

Filename, MIME type, extension, and pasted/file channel are advisory display
metadata only. They never select a more permissive parser or override byte and
schema evidence.

## 8. Native, legacy, and chart candidates

### 8.1 Native v2

Native data passes directly through F2 and F3. A failure carries bounded ordered
code/path projections and no candidate. E0 neither repairs unknown fields nor
silently strips an unsupported value.

### 8.2 Unversioned legacy

E0 invokes C0 exactly once with the original bytes and injected dependencies.
C0's candidate/report remain authoritative. E0 then invokes F3 before preview.
A legacy source for which every chord slot was rejected refuses
`import.legacy_no_events`; it is never presented as a plausible successful empty
conversion. A genuinely empty legacy chart should use New rather than a lossy
compatibility path.

This freezes the cross-contract timing decision: C0 itself remains candidate-
only and performs no publication; E0 calls F2/F3 before preview, and A0 rechecks
F2/F3 at confirmed commit. C0's boundary now distinguishes isolated preview
validation from application document replacement; only the latter requires
confirmation.

Preview report rows preserve C0 group/path/code ordering. At most 256 rows are
retained for immediate presentation, with exact total/omitted counts and the
complete bounded C0 report available to the service/evidence layer. No private
source value is added.

### 8.3 Chart text

Replacement import accepts T0 document mode only. A fragment may support U1's
explicit Insert This Chord path later, but it cannot become a replacement
candidate. Any document-mode diagnostic prevents whole-draft publication; valid
prefixes are never committed.

E0 invokes T0 exactly as
`parseChartText(sourceText, { mode: "document" },
CHART_IMPORT_PARSE_ACCIDENTAL_STYLE)`, where the public constant is permanently
`"ascii"` for version 1. Callers do not choose this argument. The choice freezes
canonical diagnostic and presentation behavior; it is not evidence that Unicode
accidentals are rejected by T0.

The E0 candidate builder applies these disclosed defaults:

- title header or `Imported lead sheet`;
- description header or empty;
- required T0 meter, tempo header or 120, key header or null;
- `mellow-keys`, volume 0.8, reverb 0.2, count-in 0;
- implicit section names `Section ${sourceOrdinal + 1}`;
- null section key override and `reset` voice-leading boundary;
- exact parsed chord/duration/annotation;
- Balanced Auto, four voices, MIDI 48...84, generated bass.

No Manual/Frozen voicing, section override, playback setting, Custom chord, or
analysis is invented. IDs come only from the injected stable-ID factory in
structural preorder: document; then for each source section its section ID;
then for each measure its measure ID; then each event ID. A refusal or collision
is total, is never retried, and exposes no partial candidate. The complete
candidate passes F2 and F3 before preview. The builder defensively stops before
a 73,794th request; 73,793 is the exact maximum implied by one document, 64
sections, 65,536 measures, and 8,192 events. The first excess refuses
`limit.chart_import_id_requests_exceeded` before calling the factory again.

T0 chart text becomes a canonical validated v2 candidate, so its A0 replacement
origin is `canonical-import`. The preview retains source format
`chart-text-v1`; UI copy must still say Lead-sheet text import rather than JSON.

## 9. Preview and replacement transaction

File selection, paste submission, and successful decoding authorize only a
preview. `autoApplyAuthorized` is always false. Preview contains the exact
request/document/base-revision identity, validated candidate, source format,
counts, bounded issue/report projections, and a replacement-impact assessment.
The complete C0 report and complete T0 diagnostic/warning objects are transient
adapter/evidence values only. They never enter `ImportPreview`,
`ImportPreviewRefusal`, `ImportDraft`, `AppState`, history, recovery, or a
notice. The bounded issue projection keeps stable code/stage/path/range; the
bounded report projection keeps only code/source-path/target-path plus exact
total and omitted counts.

E0 requires a public application-owned impact operation before confirmation.
It uses A0's exact retained-byte estimator and history caps to disclose:

- retained byte estimate;
- whether Undo is retained or explicitly unavailable;
- how many old undo entries would be evicted;
- whether export is recommended;
- that explicit confirmation is always required.

The impact operation must share the estimator/policy used by commit. A private
approximation or “likely undoable” label is forbidden.

Its immutable input includes the exact A0 base-state snapshot and the command
ID, label, and logical time that commit will use. The preview retains that
immutable command seed alongside the result, which discloses the new entry's
retained-byte estimate, undo entries/bytes after caps, evicted undo entries,
cleared redo entries, and exact undo disposition. A retained result always has
`exportRecommended: false`; an explicitly-unavailable result always has zero
retained undo entries/bytes and `exportRecommended: true`.

The explicitly-unavailable golden is induced by a real A0 value, not by a fake
estimator return. Its current document materializes through F2 and F3 from the
reviewed bounded recipe in the input ledger: 48 sections, 49,152 measures,
4,722 complete single-event measures, then 44,430 empty measures. With the
reviewed short-ID policy, seven-code-point description, current empty bookmarks,
the distinct value-equal empty replacement bookmarks that A0 publishes, minimal
candidate, and stored replacement seed, the production A0 retained-byte
estimator returns exactly 16,777,217 bytes—one byte above the 16 MiB history
cap. Preview reassessment and A0 commit use that same estimator operation and
the same object-identity policy.

Before preview publication, application allocates one bounded non-undoable
confirmation seed. A retained preview stores no confirmation requirement. An
explicitly-unavailable preview stores an immutable
`changes.import-nonundoable-confirmation.v1` requirement binding the seed ID,
request/document/base-revision identity, candidate document ID, stored command
ID, and every disclosed impact field. Confirmation supplies an acknowledgement
that echoes this complete requirement field-for-field. The matching and
wrong-token fixtures are both complete public acknowledgement values; the
wrong-token near miss differs only at `requirement.confirmationId`. A new token,
a matching token with different scope, or an acknowledgement of different
impact is not a match.

A0's current `ImportDraft` is only a shallow candidate plus at most 64 issue
codes. E0/build must amend that public A0 shape to a discriminated
reading/invalid/ready/cancelled state that can carry the typed E0 preview or
refusal while preserving A0's request, history, and replacement invariants.
It must not hide a second candidate, migration result, or raw payload behind the
old loose record.

Cancel while reading aborts and settles the request. Cancel after preview clears
only the import draft/request. It never retires audio, creates history, runs a
replacement command, queues recovery, compiles a plan, or changes the marker.

`commitImportReplacement` is the sole public import-commit orchestration. Its
caller supplies the preview, current state, matching `retiring-transport`
transition, and—only for an explicitly non-undoable replacement—the complete
preview-owned acknowledgement. The caller never supplies a retirement receipt,
proof, command, or transport request.

Before any X1 call, E0 invokes A0's
`prepareImportReplacementPublication` port. A0 checks request ID, document ID,
base revision, candidate ID, disclosed undo disposition, transition state,
pending request, and complete confirmation identity; reruns its exact impact
assessor; defensively validates the candidate; and prepares history/bookmarks.
Success allocates one bounded, single-use entry in A0's private preparation
registry, keyed by the exact import request identity, and returns a structurally bound
`PreparedImportReplacementPublication`. The raw port return is `unknown` until
E0 validates and normalizes the complete envelope and binding. A caller-created
lookalike is useless because it has no live registry entry. Any unavailable
assessment or mismatch refuses with zero retirement attempts. This ordering is
load-bearing: no user-input, stale-state, confirmation, impact, parse,
migration, structural, or semantic refusal remains after transport retirement.

The private registry has at most one live preparation per active
document-transition request. If X1 returns unavailable, failed, or stale, if
its promise rejects, or if E0 detects an invalid preparation or retirement
result, E0 synchronously calls `discardImportReplacementPublication` with the
original request identity and a closed reason before returning. This idempotent
A0 operation invalidates any registry entry for that request and proves
`liveForRequest: 0`; it never trusts a possibly malformed returned binding. A
normal preflight refusal creates no entry, successful publication consumes
exactly one entry, and every protocol-invalid or post-prepare nonpublication
returns with zero live entries for that request. Replaying either a consumed or
invalidated preparation is refused inside A0.

Registry invalidation is the sole exception to the raw-return normalization
rule: it is a trusted, total, synchronous intra-A0 primitive with no external
effects or normal refusal. E0/build must prove against the production A0
registry that every closed invalidation reason is idempotent, cannot throw, and
returns the original identity with `liveForRequest: 0`. All fallible adapter
returns remain `unknown` until validated and normalized.

Exceptions do not escape a public E0 operation and no thrown value is retained.
A synchronous A0 preparation throw is normalized as
`import.replacement_preparation_result_invalid` and request-keyed invalidation
runs before return. An X1 synchronous throw or promise rejection is normalized
as `transport.replacement_retirement_evidence_invalid`, invalidates the
preparation, and records `TRANSPORT_RECONCILIATION_REQUIRED` because E0 cannot
certify whether transport authority changed. An A0 publication throw after
valid X1 evidence is normalized as
`import.replacement_publication_result_invalid`, invalidates the request entry,
and records `APPLICATION_TRANSPORT_RECONCILIATION_REQUIRED`. The bounded public
diagnostic distinguishes `threw-or-rejected` from an invalid returned envelope
without exposing the exception.

Only after that complete preflight does E0 derive and call the injected X1 port
with the exact import identity, source format, candidate document ID, expected
transport generation, fixed `progression-and-preview` scope, and fixed
`zero-future-attack` postcondition. The raw asynchronous X1 return is `unknown`
until its complete envelope, request echo, and receipt are validated. An
ordinary normalized X1 refusal carries
`retirementEffect: "none"`; it therefore preserves application and transport
authority exactly. A success returns structurally inspectable evidence with the
fixed schema/authority, a field-identical echo of the entire request, and the
observed request ID, retired generation, progression/preview retirement, and
no-future-attack values. E0 accepts it only when every binding matches and all
three postconditions are true. Authority comes from the production composition
binding and serialized X1 call, not an erased TypeScript brand.

An `ok: true` value with a mismatched request or false postcondition is an X1
protocol breach, not an ordinary user-visible refusal. E0 publishes no
replacement and returns `reconciliation-required`; this records an outstanding
obligation, not a completed effect. The runtime must enter a safe transport
reconciliation and fail the named X1/E0 integration gate before it permits
further transport or document work. No evidence fixture may pretend that such a
breach preserved transport authority.

After valid evidence, E0 constructs a fresh narrowed A0
`ReplacementRetirementReceipt` and synchronously passes it with the prepared
single-use capability to the A0 publication port. Inside that private port, A0
constructs the exact `committing` transition and one fully formed A0 `ReplaceDocumentCommand`.
ID, label, and logical time come only from the
prepared preview seed; the non-undoable confirmation ID comes only from the
preview requirement. The port consumes the registry entry, has no normal
refusal after preparation, and returns the committed A0 state/effects. Its raw
return is `unknown`; E0 validates the complete committed result and exposes that
publication result as the sole authoritative post-state. A malformed
publication result triggers request-identity invalidation, publishes no claimed
state, and returns `import.replacement_publication_result_invalid` with
reconciliation required because X1 has already retired transport and A0 may
already have committed. That result records an outstanding application-plus-
transport reconciliation obligation; it does not claim either reconciliation
already ran. The raw command is never an E0 input or output. E0/build must add
production source-policy gates: no UI or other E0 call site may construct a
`replace-document` command or submit one through the general public command
runner; no UI or other E0 call site may dispatch raw `mark-exported`; and no
public E0 operation may accept a caller-supplied trusted dependency.

No parse or migration is rerun for commit, undo, or redo. Double confirmation
and every stale/wrong callback are rejected before X1 and cannot create a
second history entry. Until X1 is implemented and production-bound, its adapter
returns the explicit unavailable/no-effect result and apply remains
unavailable; E0/build may not install a fake success adapter.

The named canonical and legacy workflow evidence is a literal Cartesian
matrix: two source formats times all seven A0 transport statuses
(`unavailable`, `ready`, `starting`, `playing`, `paused`, `stopping`, `failed`)
times preview/apply/cancel/failure, for 56 independently authored cells. No
equivalence reduction is authorized. Preview and cancel perform no retirement.
Ordinary failure uses the no-effect X1 refusal and performs no retirement.
Apply describes the complete exact X1 evidence expected in every status,
including `unavailable`, `ready`, and `failed`; runtime success remains gated on
X1. Each format/status cell derives and exact-compares its own request/evidence;
no canonical-playing fixture stands in for legacy or another transport
generation. `starting` and `stopping` additionally record one wait behind the
serialized transition. The adapter-protocol near-miss matrix mutates every
request-echo, receipt, and postcondition field independently; every row records
`reconciliation-required`, never `stateEffect: NONE`. Its fixture state effect
is `TRANSPORT_RECONCILIATION_REQUIRED`, so it cannot be mistaken for a completed
repair.
Preview, cancel, failure, handoff, and A0 command publication preserve the exact
transport reference. Installation of the replacement document's later playback
plan is a separate transport-service integration obligation and is not claimed
by this E0 public boundary.

Every apply/failure cell owns a complete format-specific retiring `AppState`,
not an idle state plus a detached transition. That state contains exactly one
matching running document-transition request and a retiring transition whose
request, origin, revision, candidate, and retained disposition are field-equal
to the handoff input. The seven transport projections are derived from each of
the canonical and legacy retiring states. Runtime apply evidence remains
incomplete until the production X1 adapter returns exact evidence and the
separate X1/E0 integration suite proves retirement plus replacement-plan
installation.

Ordinary preflight and no-effect X1 failure may change only isolated
draft/error/request/notice presentation. Document, revision, history,
bookmarks, selection, insertion, range, transport, recovery, export marker, and
playback authority remain exact. Adapter-protocol breach is deliberately
excluded from that false preservation claim and instead records a required safe
transport reconciliation. This is the primary `L-IMPORT-01` law.

A committed E0 publication preserves the retired transport projection only at
the A0 boundary. The complete replacement transaction is not user-visible as
finished until X1 installs the new document's P0 plan in `ready` at beat zero.
That real-browser completion proof is owned by E0/verify after X1; this spec
packet does not relabel a detached A0 commit as the end-to-end audio result.

## 10. Browser delivery and cleanup

Delivery requires actual transient user activation observed synchronously by
the bound browser adapter; no caller boolean or request field may assert it.
Missing activation causes no picker, anchor, object URL, or marker action. A
caller-context lookalike claiming a gesture while the browser probe is false
still refuses `export.delivery_user_gesture_required`.

Canonical marker delivery is deliberately two phase. The asynchronous public
`prepareCanonicalExportDelivery({ state })` operation runs canonical
projection, round-trip checks, SHA-256, and UTF-8 encoding before a click. It
stores at most one frozen text-free artifact binding and one privately owned byte array, capped at
2,097,152 bytes, in an E0-owned registry. Its public ready metadata contains
only an opaque `preparationId`, monotonic generation, document/revision,
filename, byte length, semantic hash, and policy versions. It exposes no text,
bytes, delivery receipt, candidate, marker, browser handle, or trusted port.

The registry lifecycle is exactly
`empty -> preparing -> ready -> delivering -> empty`. Any prepare while
`preparing` or `delivering` refuses `export.preparation_busy`, regardless of
document identity. Preparation is single-flight: no second export, hash, text,
or byte allocation starts while the first is unsettled. A prepare from `ready`
first invalidates and zeroes the old private bytes. A monotonically guarded
publish prevents a stale or duplicate asynchronous completion from replacing a
newer generation. After asynchronous preparation, a bound synchronous
controller identity read must still match before readiness is published. A
later document/revision change makes a ready entry ineligible; the next prepare
or completion lazily discards and zeroes it, so no subscription is assumed. A
late completion is discarded and zeroed. Every failed, refused, stale, or
otherwise unpublished preparation calls the generation-keyed
`abandonPreparation(preparationId)`: it clears only a matching `preparing` or
`ready` generation and is an exact no-op for a nonmatching ID. Every browser
terminal calls generation-keyed `finishDelivery(preparationId)`: it clears only
the matching `delivering` generation and is likewise a no-op for a stale ID.
Both keyed cleanup methods are total, synchronous, nonthrowing E0 primitives;
production proof must exercise idempotence and byte zeroing. No asynchronous
path has an unkeyed invalidation capability. Sequence exhaustion refuses
explicitly.

The registry counter starts at 1, is a positive safe integer, and advances
exactly once for each accepted `begin`, including a begin whose later export
refuses. `preparationId` and `generation` are the same counter value. Value
9,007,199,254,740,991 may be allocated once; the next begin refuses
`export.preparation_sequence_exhausted` and never wraps or reuses an ID.
Every delivery attempt consumes the ready entry exactly once before browser
work. Cancellation, ordinary failure, cleanup failure, protocol failure, stale
identity, and success all require a fresh preparation; no path restores or
replays consumed bytes. A successful preparation intentionally ends with one
ready entry. Every terminal after an exact generation is accepted for
completion ends with zero live entries; a forged/nonmatching locator refusal is
not permitted to erase an unrelated ready generation.

The click-path request contains only a state locator, opaque `preparationId`,
and delivery preference. Immediately before consume, E0 synchronously reads the
controller-owned latest document/revision and requires it to match both request
and private entry. With no await between that read and browser start, E0
atomically verifies the entry's ID/generation/identity and transitions `ready`
to `delivering`. An unknown, forged, or nonmatching ID returns unavailable and
cannot erase an unrelated ready entry. An exact ID whose document/revision is
stale discards and zeroes that exact entry. Already-consumed and double-clicked
IDs are unavailable. All make zero browser/A0/A1 calls. A malformed/throwing
identity reader fails the release configuration and starts no browser work.
When the request names the exact ready generation, that branch uses keyed
`abandonPreparation`, zeroes the bytes, and ends empty; a forged or nonmatching
ID remains an exact no-op against the actual entry. Public readiness metadata
is never used as the artifact source.

The composition-private `startPreparedExportDelivery` is synchronous and
returns an envelope containing a completion promise. Before it returns, awaits,
or queues a microtask it must probe activation and invoke either
`showSaveFilePicker()` or the temporary anchor activation. No encode, hash,
clock read, A0 call, or A1 call occurs in that activation interval; the bytes
were prepared earlier. A normal async function returning a bare promise does
not satisfy this contract.

If File System Access is available and preferred, the start primitive opens one
picker; its completion writes the exact transferred byte array, closes once,
and returns `completed`. User `AbortError` is `cancelled` and never launches a
Blob fallback. Operational picker/writer failure is `failed`, not capability
absence. Handles and writers are closed or aborted on every terminal path. If
the capability is absent or download-only is requested, E0 synchronously uses
one local Blob, one object URL, and one temporary anchor, assigns `download`,
activates once, removes the anchor, and revokes the URL exactly once. A clean
activation is `handed-off`, not verified disk completion.

Every ordinary terminal receipt carries `cleanup: "complete"`, correlated
created/revoked counts, and `outstandingOwnedResources: 0`. A known cleanup
primitive failure returns only the typed non-receipt `cleanup-failed`, with
`artifact: null`, `cleanup: "reconciliation-required"`, a nonempty ordered
bounded failure-kind list, and honest resource counts.
Failure kinds are channel-discriminated: FSA may name only writer/handle
cleanup, Blob may name only anchor/object-URL cleanup, and one typed attempt has
at most two distinct outstanding resources even when three cleanup calls fail.
URL created/revoked counts correlate exactly with the Blob failure set.
If the synchronous start
envelope or outer completion is malformed/throws and its internal resource
ledger is unavailable, E0 instead returns `export.delivery_result_invalid`
with `cleanupKnowledge: "unknown"`, only the fixed maximum of four possibly
outstanding resources, and delivery-resource reconciliation required. It never
fabricates an exact cleanup count or failure kind. Neither branch advances
A0/A1 and both fail the real-adapter release gate.

The product policy treats a clean `handed-off` receipt as observable export
handoff and may advance the canonical marker, while UI/help never claims disk
durability. No FileSaver, remote package, navigation, popup, network request,
HTML parsing, or runtime dependency is permitted. One hundred sequential
deliveries must end with zero live registry entries, byte buffers, object URLs,
anchors, listeners, writers, and handles.

## 11. Export marker settlement

Only canonical JSON may create a marker candidate. The public settlement request
does not accept a prior marker, artifact, bytes, receipt, candidate, hash,
timestamp, revision override, gesture assertion, or adapter. Full prior marker
data is not authenticated by `AppState.exportRevision` and is therefore never
accepted or echoed as authority. Cancellation/failure simply makes no A0/A1
change; UI reads current controller state rather than installing a click-time
snapshot returned after an asynchronous picker.

After a clean canonical `completed` or `handed-off` receipt, E0 verifies the
receipt against the consumed private artifact's kind, document ID, filename,
artifact byte length, actual `bytesOffered`, and semantic hash. Text receipts
and any mismatch stop with
`export.marker_artifact_mismatch`. Only then does E0 read its bound application
clock. The clock must return exactly one 24-character UTC millisecond instant in
canonical `YYYY-MM-DDTHH:mm:ss.sssZ` / `toISOString()` form. Throw, promise,
wrong type, invalid date, offset, extra precision, or noncanonical equivalent
returns `export.marker_timestamp_invalid`, retains the successful delivery
evidence, calls no A0/A1 port, and marks the release configuration failed. It
does not claim application reconciliation because no application mutation
occurred.

E0 derives the candidate internally from the consumed artifact, delivery
receipt, preparation document/revision, supported policy versions, and checked
clock. The internal settlement stage accepts only a marker-eligible canonical
delivery plus that derived candidate; cancelled, failed, cleanup-failed, and
malformed delivery outcomes never reach it.

For an accepted candidate, E0 calls A0 then A1 in exact order:

1. `CanonicalExportRevisionPublication` contains only expected document ID and
   revision. The bound A0 controller port synchronously and atomically reads the
   latest state, compares that identity, and applies its checked `mark-exported`
   transition before any further await. Click-time state is not publication
   authority. Its raw success transiently returns `observedBefore` and post-state
   so E0 can validate that only the exact export revision changed while newer
   ephemeral fields were preserved. E0 then projects a state-free public receipt
   `{ documentId, revision }`; neither raw state survives a later A1 await. If the
   user edits while the picker is open, A0 refuses
   `export.marker_publication_stale`, E0 projects only the observed document/
   revision identity, reports that the older snapshot was delivered, and makes
   no A1 call.
   A malformed/throwing response is
   `export.marker_publication_result_invalid`, exposes no guessed state or
   marker, and requires application reconciliation.
2. `CanonicalExportMarkerPersistenceHandoff` carries the newly derived marker
   plus exact document/hash/byte-length/filename and canonical/hash policy
   versions. It is passed to the future A1-owned
   `queueCanonicalExportMarkerPersistence` only after checked A0 success.

The public result always preserves the normalized delivery projection after
browser work, allowing UI to distinguish FSA `completed` from Blob
`handed-off`. The A1 port is a consumer contract, not a durability claim. An
unavailable or failed A1 completion yields `pending-failed`; only exact success
may report `recovery-persisted`. A malformed return, synchronous throw, or
rejection is `recovery.marker_persistence_result_invalid` with recovery
reconciliation required and no raw value retained. A1 owns persistence retry
from the retained handoff; the consumed registry entry is never restored and a
retry never redelivers the artifact.

Advanced results duplicate neither state nor marker: the sole new full marker is
the A1 handoff marker, while every A0 public receipt is state-free. No marker
result returns an `AppState`; controller selectors are always the sole current
state source. This remains true if the user edits during the later A1 await, so
no historical snapshot can be installed over newer work.

These are real A0-owned capabilities, not structural lookalikes supplied by E0.
The explicit A0/E0 bridge work (`jcpe-94yu.1` spec, `.2` build, `.3` verify)
owns the replacement registry, latest-identity read, and atomic marker CAS. The
dependency chain is E0/spec -> bridge spec/build -> E0/build -> bridge verify ->
E0/verify, and bridge verification must exercise the real controller/E0
composition boundary.

The golden packet materializes independently authored literal values for the
entire accepted settlement, A0 publication request and published state, A1
persistence handoff, and each A1 outcome. One-field near misses cover wrong A0
document/revision and wrong A1 document, filename, byte length, semantic hash,
canonical policy version, and semantic-hash policy version. Counts or prose are
not substitutes for these exact values.

In-session dirty status remains revision-based: undoing to semantically equal
bytes at a different revision still says Changed since export. On reload, A1 may
compare the recovered canonical semantic hash to the persisted marker. This
deliberately avoids making ordinary edits hash the entire document.

## 12. Bounds, work, memory, and termination

The public work-counter orders in the TypeScript contracts are exhaustive. Each
counter increments at the named semantic operation and includes the first
excess observation where a plus-one limit is required. Upstream F2, T0, C0, and
F3 counters remain owned by those packages; E0 records call counts and the
adapter binding rather than relabeling upstream work as its own.

Hard E0 bounds include:

| Resource                                |                      Maximum |
| --------------------------------------- | ---------------------------: |
| input bytes accepted                    |                    2,097,152 |
| input bytes observed                    |                    2,097,153 |
| canonical JSON bytes offered            |                    2,097,152 |
| lead-sheet text bytes offered           |                    2,097,152 |
| prepared canonical registry entries     |                            1 |
| concurrent canonical preparation tasks  |                            1 |
| prepared canonical private bytes        |                    2,097,152 |
| filename basename                       |    120 Unicode scalar values |
| immediate preview issues                |  64 plus exact omitted count |
| immediate migration/report rows         | 256 plus exact omitted count |
| chart-import ID requests                |                       73,793 |
| sections / measures / events summarized |          64 / 65,536 / 8,192 |
| lead-sheet loss rows                    |                       16,515 |
| object URLs per Blob attempt            |         1 created, 1 revoked |
| replacement handoffs per confirmation   |                            1 |

Synchronous value operations end in complete success/refusal. File read and
delivery additionally have explicit cancelled/failed outcomes. Import request
settlement and generation-keyed internal registry cleanup may report
`ignored-stale`; public marker completion uses explicit prepared-unavailable,
prepared-stale, or A0 CAS refusal outcomes. No operation uses wall time as an
input cutoff, musical cutoff, format chooser, or deterministic tie-break.

## 13. Independent fixture and golden authority

`e0-interchange-contract.json` is the machine-readable mirror. Its companions
freeze independently authored cases for:

- canonical JSON bytes, nested key order, Unicode, hash, and filename;
- canonical/legacy import routing and the seven inherited F2 raw-parser cells;
- chart-text export/import, exact timing, losses, and projection round trip;
- file/FSA/Blob cleanup and observable receipts;
- 56 literal canonical/legacy by transport-status by workflow-action cells,
  including 14 complete format-specific retiring-state projections; their
  expected evidence does not claim a live X1 success, whose runtime
  materialization remains an X1 integration gate;
- fully materialized A0 state/history/bookmarks/transport and E0 preview,
  transition, receipt, confirmation, handoff-command, and post-state values;
- the bounded F2/F3 oversized-current-document recipe whose real A0 history
  estimate is exactly one byte above the cap;
- preview/confirm/cancel/stale/transport/undo/marker states;
- every exact/plus-one limit and hostile inert string;
- cross-cutting laws, mutation controls, provenance, and traceability.

Expected bytes/text/state traces are literal fixture values. E0 production may
be compared with them but may never generate, update, scrub, or approve them.
Dynamic request IDs/timestamps use explicit test-owned values; there is no broad
scrubber that could hide a stale-result defect. The first packet was accepted
by the project owner on 2026-07-21. Every future golden update still requires a
visible diff, independent review, and renewed human acceptance before the
changed packet is called approved.

The packet carries forward F2's two E0-owned mutations:

- byte count changed from UTF-8 bytes to UTF-16 code units;
- JSON parse moved before byte preflight.

Those controls remain future production-mutation obligations at spec time; the
validator proves their case links and cannot falsely claim execution.

## 14. Trace and provenance policy

Every case cites known trace and authority IDs. Every trace reciprocally names
all cases and mutation controls. Proof kinds include positive, negative or
near-miss, exact-boundary, cancellation/stale where applicable, and mutation
link. The validator rejects unknown references, missing backlinks, orphan
cases/controls, duplicate IDs or JSON keys, incomplete proof-kind coverage, and
coherent fixture/manifest tampering through independent semantic locks.

Authority classes are `definition`, `published-reference`, `compatibility`, and
`verification-policy`. Project policy is never laundered into a published
standard. The packet currently makes no musician/expert-review claim. External
browser/encoding/JSON rows name exact specifications; musical expectations are
inherited from F1/T0/C0/F3 rather than reinvented in E0.

## 15. Forbidden shortcuts

Implementers and verifiers must not:

- serialize a live object by runtime enumeration or `JSON.stringify(document)`
  without the explicit projection;
- omit the final LF, normalize Unicode, use floating-point duration text, or
  hash an application envelope;
- skip the JSON self-decode/F3/equality gate;
- use raw title text as a path, URL, HTML, or storage key;
- count UTF-16 units as imported bytes or filename scalar length;
- parse before byte preflight, pass a reviver, or accept duplicate decoded JSON
  keys with last-value-wins behavior;
- route malformed/future JSON to chart text or legacy migration;
- use `File.text()` replacement decoding for external bytes;
- let C0/T0/F2/F3 mutate or publish current state;
- present file selection, decode success, or preview as confirmation;
- apply a valid prefix/subset of an invalid chart;
- invent Manual/Frozen notes, playback settings, Custom harmony, section
  policies, or analysis during chart import;
- merge an imported chart, perform sequential partial commits, or parse again
  during commit/undo/redo;
- approximate undo impact with a policy different from A0 commit;
- call X1 before stale/identity/confirmation/impact preflight is complete;
- accept X1 evidence without an exact request echo and all three retirement
  postconditions;
- expose or replay the internal A0 replacement publication handoff;
- pass trusted adapters or dependency objects to a public E0 operation (the
  bounded untrusted import-source handle is not authority);
- accept caller-supplied artifact/bytes/receipt/candidate/hash/timestamp/prior
  marker as export-marker authority, or expose private prepared bytes/text;
- hash, encode, await, queue a microtask, or read the clock before the
  activation probe and picker/anchor invocation in the click path;
- use click-time `AppState` as post-delivery publication authority instead of
  the bound latest-identity check and atomic A0 compare-and-set;
- restore/replay a consumed prepared export, or redeliver merely to retry A1
  persistence;
- construct or submit a `replace-document` command outside the private
  proof-gated E0/A0 publication port;
- retain a complete C0 report or T0 diagnostic/warning object in preview,
  refusal, or application state;
- let a caller choose the T0 chart-import accidental style;
- let cancel, failure, stale callback, or double confirmation mutate protected
  state;
- describe object-URL activation as verified durable disk persistence;
- fall back after user cancellation of an available file picker;
- advance the canonical marker for text export, cancellation, failure, or a
  stale revision;
- call public `mark-exported` outside the bound marker-settlement port, publish
  `exportRevision` without the typed A0 transition, queue A1 before A0
  succeeds, or claim A1 marker durability without an exact successful A1
  completion;
- leak a URL, anchor, listener, writer, handle, payload, or caller-owned array;
- echo private import text into diagnostics/logs or render it as HTML;
- add runtime AI, telemetry, remote content, CDN, font, sample, model, or
  network dependency;
- generate fixture expectations from production behavior or auto-accept a
  changed golden;
- use a wall-clock timeout as a semantic bound;
- skip, retry, quarantine, or silently relax a named gate.

## 16. Spec verification commands

- `bun run validate:e0-contract` validates the accepted authority package,
  semantic locks, companion digests, backlinks, limits, golden bytes, and
  mutation inventory.
- `bun test tests/static/e0-contract.test.ts` compares public constants/types to
  the independent authority and tests validator tamper controls.
- `bunx tsc -p tsconfig.app.json --noEmit` proves the public surfaces compose
  with the current layers.

Production, browser, transaction, property, and evidence gates belong to
`E0/build` and `E0/verify`. Spec validation must not claim that future production
mutants, real downloads, or application workflows have already run.
