# C0 legacy migration contract

Status: reviewed code-facing specification for `C0/spec`  
Public module: `src/compatibility`  
Operation: `migrateLegacyJson`

This document is the implementation handoff for the deterministic unversioned
legacy importer. An implementer must be able to build C0 from this document,
the public TypeScript contract, and the fixtures under
`tests/fixtures/legacy-migration/` without consulting `REBUILD_PLAN.md`.

## Boundary and non-negotiable rules

C0 accepts caller-owned UTF-8 bytes and returns either one complete unvalidated
v2 candidate plus an itemized report, or one total refusal. It does not publish,
brand, persist, play, enqueue, mutate application state, or retain any
caller-owned container. F3 remains the only semantic publication gate, and an
application transaction may replace the current document only after the user
explicitly confirms the preview. E0 integration may invoke F3 before preview to
create an isolated validated candidate; A0 invokes F2/F3 again at confirmed
commit. Neither validation pass authorizes C0 to publish or mutate state.

C0 is a pure compatibility package. It imports only `domain` and injected T0/T1
interfaces. It must not import the Atlas, application state, audio, persistence,
UI, clocks, randomness, a model client, or a network adapter. The only identity
source is the injected `StableIdFactory`.

Forbidden shortcuts are:

- defaulting missing or invalid harmony to C major;
- trimming, case-folding, substring-matching, or repairing a legacy symbol;
- treating enharmonic equality as exact written agreement;
- combining tones from multiple resolver realizations;
- parsing only a prefix of a note string;
- repairing, sorting, respelling, deduplicating, re-registering, or otherwise
  optimizing trusted Manual pitches;
- guessing that legacy voicing controls equal a v2 voicing family;
- deriving expected fixture output from the production migration algorithm;
- returning a `ValidatedDocument` or casting its opaque brand;
- using elapsed time as a musical or hostile-input cutoff.

## Public result and ownership

The request contains one `Uint8Array`. The operation copies or completely
consumes all needed bytes during the synchronous call. After return, mutation of
the caller's array cannot affect the candidate or report.

Success has schema
`changes.compatibility.legacy-migration-candidate.v1` and contains:

1. `document`: an unbranded `ProgressionDocumentShapeV2`;
2. `report`: `changes.compatibility.legacy-migration-report.v1`.

Failure contains one code-and-path `LegacyMigrationRefusal`. There is no partial
candidate, partial identity table, resumable token, or warning-bearing success
outside the report.

The policy identity is `changes.legacy-migration` version `1`. The source kind is
always `unversioned-legacy-json`.

## Decode pipeline and hostile input

The implementation follows this order exactly:

1. Count bytes before decoding. At 2,097,153 bytes refuse
   `limit.legacy_utf8_bytes_exceeded`; 2,097,152 is allowed.
2. Decode with fatal UTF-8 semantics. Replacement-character recovery is
   forbidden. Invalid input refuses `legacy.utf8_invalid` at `[]`.
3. Run a string- and escape-aware lexical JSON preflight over every code unit.
   Count object/array nesting without interpreting brackets inside strings. At
   depth 33 refuse `limit.legacy_json_depth_exceeded`; depth 32 is allowed.
4. Parse with the host JSON parser without a reviver. Syntax failure refuses
   `legacy.json_syntax_invalid` at `[]`.
5. Traverse only own enumerable data properties. Never spread an untrusted
   object into a prototype-bearing target, assign through `__proto__`, invoke a
   getter, execute a string, interpret HTML, or dispatch an event-handler-looking
   key. Construct all output from explicit known fields.
6. Count every visited own source property, including unknown fields. The
   262,145th property refuses `limit.legacy_source_properties_exceeded`.

JSON text cannot contain executable accessors. Nevertheless, the traversal rule
is an explicit data-only invariant and also applies if a future internal decoder
feeds object-shaped data into the same core.

The root must be a non-array object with an own `sections` array. Otherwise
refuse `legacy.root_invalid` or `legacy.sections_invalid`. More than 64 section
slots, more than 1,024 chord slots in one section, or more than 8,192 chord slots
in total are total refusals at the first excess path. Rejected section/event
slots still count toward these source collection ceilings.

Total refusal is reserved for malformed encoding/JSON/root shape, a global
limit, or identity failure. A malformed section or event is local: emit a
Rejected report item, skip that node, and continue deterministically.

## Recognized legacy shape

Only these exact own keys have semantics:

- document: `name`, `description`, `sections`;
- section: `name`, `annotation`, `chords`, `collapsed`, `isEditingName`,
  `editNameValue`;
- chord: `name`, `root`, `type`, `bass`, `notes`, `b5`, `s5`, `b9`, `s9`,
  `s11`, `b13`, `tensions`, `annotation`, `voicingStyle`, `baseOctave`,
  `octaveSpan`, `density`.

Every other own key emits `legacy.ignored.unknown_field` at that key. Unknown
objects are not recursively interpreted after that item is emitted.

`collapsed`, `isEditingName`, and `editNameValue` each emit
`legacy.ignored.ui_field`. `voicingStyle`, `baseOctave`, `octaveSpan`, and
`density` each emit `legacy.ignored.voicing_metadata`. `tensions` emits
`legacy.ignored.tensions`. Their values never affect candidate music.

## Text handling

No string is trimmed, normalized, HTML-decoded, case-folded, or interpolated
into diagnostics. Unicode scalar validity and v2 code-point limits are checked
before promotion:

- document title, section name, chord source text, and Custom label use the
  domain short-text ceiling of 256 code points;
- document description and annotations use the domain long-text ceiling of
  2,000 code points;
- harmony tokens and scientific pitches must additionally match their exact
  grammars.

An absent optional display field uses its disclosed default. A non-string value
emits `legacy.ignored.invalid_field_type` at the field and uses the default. A
string containing a lone surrogate emits
`legacy.rejected.invalid_unicode_scalar`; an over-limit string emits
`legacy.rejected.text_limit`. For optional document/section display fields and
annotations, that field is discarded and its default is used. For a chord name,
root, type, or bass needed to construct the event, the bad field is unusable and
the precedence table continues; if no usable symbol or bounded Custom label
remains, the event is rejected. An empty document name or section name is
unusable and takes the default. Empty description and annotations are valid.

Presence for the alteration-flag rule is strict: `name` is absent only when the
object has no own `name` key. A blank, non-string, over-limit, or unparseable own
`name` is still present, so alteration flags cannot help it.

## Candidate defaults and structural mapping

The candidate always has schema `changes.progression.v2` and these defaults:

| Field | Exact value |
|---|---|
| title | usable nonblank legacy `name`, else `Imported legacy progression` |
| description | usable legacy `description`, else empty string |
| meter | 4/4 |
| tempo | 120 BPM |
| key | `null` |
| playback | `mellow-keys`, volume `0.8`, reverb `0.2`, count-in `0` |
| section name | usable nonblank source name, else `Section ${sourceIndex + 1}` |
| section annotation | usable source annotation, else empty string |
| section key override | `null` |
| section voice-leading boundary | `reset` |
| event duration | exact `4/1` beats |
| event annotation | usable source annotation, else empty string |
| measure completion | `complete` |

A section slot that is not an object emits
`legacy.rejected.section_not_object` and is skipped. A section object with no own
`chords` emits `legacy.rejected.section_chords_missing` and is skipped. A
non-array `chords` emits `legacy.rejected.section_chords_not_array` and is
skipped. A valid empty chords array becomes a valid empty v2 section.

Each accepted legacy chord becomes exactly one measure containing exactly one
four-beat event. A non-object chord slot emits
`legacy.rejected.event_not_object`. An unusable object emits
`legacy.rejected.no_usable_symbol_or_notes`. Skipped slots produce no IDs and no
placeholder measures.

## Stable identity

IDs are requested only after a node has passed the checks needed to know it will
exist. Request order is:

1. document once;
2. each accepted section in source order;
3. for each accepted chord in that section, measure then event.

No legacy index or text is used as an ID. The implementation maintains one set
across all four ID kinds. If the factory refuses, return
`legacy.id_factory_failed` with the kind and factory code. If any returned wire
string repeats an earlier allocation, even across different kinds, return
`legacy.id_collision` with the first source path. Never retry and never expose a
partial candidate.

Identity mappings are structural preorder records. The document maps `[]`; a
section maps `["sections", i]`; its measure and event both map the legacy chord
path `["sections", i, "chords", j]` and are distinguished by `kind` and target
path. These mappings preserve old locations without treating paths as identity.

## Symbol construction

The injected T0 parser is the sole symbol recognizer. A present legacy `name`
is sent exactly once, unchanged. A successful full parse wins; root, type,
bass, and flags cannot rewrite it. A failure emits
`legacy.ignored.name_parse_failure`, then the root/type fallback may run.

Fallback requires an exact pitch-class root matching
`^[A-G](?:bb|##|b|#)?$` and an exact type key in this exhaustive map:

| Legacy type | Suffix | Legacy type | Suffix | Legacy type | Suffix |
|---|---|---|---|---|---|
| major | empty | minor | `m` | dim | `dim` |
| aug | `aug` | sus2 | `sus2` | sus4 | `sus4` |
| 6 | `6` | m6 | `m6` | maj7 | `maj7` |
| 7 | `7` | m7 | `m7` | mMaj7 | `mMaj7` |
| m7b5 | `m7b5` | dim7 | `dim7` | aug7 | `7#5` |
| augMaj7 | `aug(maj7)` | maj9 | `maj9` | 9 | `9` |
| m9 | `m9` | 11 | `11` | m11 | `m11` |
| 13 | `13` | maj13 | `maj13` | m13 | `m13` |
| 7b9 | `7b9` | 7#9 | `7#9` | 7#11 | `7#11` |
| 7b13 | `7b13` | 7b5 | `7b5` | 7#5 | `7#5` |
| alt | `7alt` | maj7#11 | `maj7#11` | m9b5 | `m9b5` |
| 9sus4 | `9sus4` | 13sus4 | `13sus4` | 7b9sus4 | `7b9sus4` |
| m6/9 | `m6/9` | 6/9 | `6/9` | 9b5 | `9b5` |

`7sus4` is intentionally not present. Values are never stripped or
substring-matched. Invalid root and unknown type emit
`legacy.ignored.invalid_root` and `legacy.ignored.unknown_type` respectively.
The two non-identity seventh mappings are deliberate cross-contract adapters:
legacy `aug7` means a dominant seventh with an augmented fifth and therefore
uses T0's `7#5` spelling, while legacy `augMaj7` uses T0's sole reviewed
augmented-major-seventh form, `aug(maj7)`. The T0-rejected spelling `aug7` is
never sent to the parser.

If and only if the `name` key is absent, exact boolean `true` flags append the
modifiers `b5`, `#5`, `b9`, `#9`, `#11`, `b13` in that order. The constructed
wire text is `root + suffix`, followed by one parenthesized comma-separated flag
list when nonempty, followed by `/bass` when bass is a valid nonempty pitch
class. There is no de-duplication against the type suffix. T0 decides whether
the resulting exact string is valid. A nonempty invalid bass emits
`legacy.ignored.invalid_bass` and is omitted. Non-boolean known flag values emit
`legacy.ignored.invalid_field_type`.

When `name` is present, all own alteration flags emit
`legacy.ignored.alteration_evidence` and have no construction effect, whether
the name parse succeeded or failed. A successful fallback parse emits
`legacy.canonicalized.symbol_from_root_type`.

## Trusted scientific notes

The whole `notes` value is trusted or untrusted; there is no partial salvage.
It is trusted only when all conditions hold:

1. it is an array of 1 through 16 members;
2. every member is a string fully matching
   `^[A-G](?:bb|##|b|#)?(?:0|-?[1-9][0-9]*)$`;
3. each spelling projects under C4=60 to MIDI 0 through 127;
4. no two members project to the same exact MIDI integer.

Projection is `12 * (octave + 1) + naturalSemitone + accidental`, where natural
semitones are C=0, D=2, E=4, F=5, G=7, A=9, B=11 and accidentals are bb=-2,
b=-1, #=1, ##=2. Full-match spelling is preserved; enharmonic spellings are
not normalized. An untrusted value emits `legacy.ignored.invalid_notes` and is
treated exactly like absent notes. A parsed symbol then receives Balanced Auto;
without a parsed symbol the event is rejected. Untrusted members are never
reported individually with their private text.

A trusted array becomes Manual exactly as written: same array order, letter,
accidental, octave, and legal octave doublings. `pitchNames` for Custom is the
stable first occurrence of each exact written pitch-class substring, not a
sounding-class set.

## Resolver agreement and slash bass

The injected T1 resolver is called only after a full T0 parse. Agreement is
spelling-first and must hold against one single returned realization:

1. Convert trusted pitches to exact written pitch classes while retaining
   source order.
2. For a non-slash chord, every distinct written pitch class must occur in one
   realization's exact written pitch-class set.
3. For a slash chord, the minimum-MIDI stored pitch must have the exact written
   slash-bass pitch class. Exclude that one lowest bass occurrence from the
   chord-tone comparison, then apply the same one-realization subset rule.
4. Never union multiple realizations. Never accept merely enharmonic matches.

Agreement does not require every theoretical chord tone to be stored. It proves
only that all stored chord tones fit one reviewed realization. A Manual parsed
event uses `bassPolicy: included`. A missing, enharmonically respelled, or
non-lowest slash bass is a sounding conflict.

## Exact precedence outcomes

| Symbol result | Notes result | Outcome |
|---|---|---|
| present name parses | trusted and agrees | parsed chord plus exact Manual |
| present name parses | absent or untrusted | parsed chord plus disclosed Balanced Auto |
| present name parses | trusted spelling-only disagreement | Custom plus exact Manual; spelling-conflict code |
| present name parses | trusted sounding disagreement | Custom plus exact Manual; sounding-conflict code |
| name fails/absent, constructed symbol parses | trusted and agrees | parsed chord plus exact Manual |
| name fails/absent, constructed symbol parses | absent or untrusted | parsed chord plus disclosed Balanced Auto |
| constructed symbol parses | trusted disagreement | Custom plus exact Manual; constructed-conflict code |
| no parsed symbol | trusted notes and bounded label | Custom plus exact Manual; notes-without-symbol code |
| no parsed symbol | no trusted notes or no bounded label | reject event at its source path |

For any Custom outcome, preserve a usable nonempty legacy name as `sourceText`
and label; otherwise use the exact bounded constructed root/type text. Set
semantic `bass` to `null`, derive stable exact-written `pitchNames`, and use the
exact Manual pitches with `bassPolicy: included`. This deliberately preserves
the sounding artifact without asserting false harmony.

Balanced Auto is exactly family `balanced`, four voices, MIDI range 48 through
84, and `bassPolicy: generated`.

## Report semantics and ordering

The report has groups in this order: `preserved`, `canonicalized`, `custom`,
`ignored`, `rejected`. Codes and their declaration order are the arrays exported
by `src/compatibility`; the machine fixture repeats the complete vocabulary.

Emit report items at these semantic moments:

- preserved document/section text and annotation fields when copied;
- `legacy.preserved.symbol` for a successfully parsed original name;
- `legacy.preserved.manual_notes` for every trusted array used as Manual;
- the matching canonicalized default whenever a document, section, event,
  timing, playback, section-policy, or Auto-voicing default is installed;
- one Custom code for the exclusive conflict class that caused conversion;
- one ignored item per present ignored/invalid/unknown source field;
- one rejected item per skipped source node or rejected text field.

`meter_duration_default` is emitted once per accepted event at its chord source
path. `playback_default` is emitted once at the document root.
`section_policy_default` is emitted once per accepted section.
`auto_voicing_default` is emitted once per Auto event. Display-field default
codes are emitted once at their source field path.

Every item has only `group`, stable `code`, `sourcePath`, and `targetPath`; it has
no message or copied source value. `targetPath` is null when no candidate value
was produced from that source item. Thus reports can be logged without echoing
private chart text.

After collection, sort groups by the fixed group order. Within a group, compare
`sourcePath`, then code declaration index, then `targetPath` with null first.
Path comparison is segment-by-segment: a shorter equal prefix sorts first;
strings sort before numbers; strings compare by Unicode scalar value; numbers
compare arithmetically. Discovery order, object insertion order, localized text,
and allocated ID strings are never tie-breakers.

Identity mappings remain in structural preorder rather than report-code order.
Summary counts are derived from the final candidate and sorted report. Report
emission is bounded at 65,536 items; the attempted 65,537th item causes the total
refusal `limit.legacy_report_items_exceeded`, not truncation.

## Work, memory, and termination

The operation records the eleven public counters. Hard maxima are:

| Counter/resource | Maximum |
|---|---:|
| bytes visited | 2,097,153 including the first excess observation |
| sections visited | 64 |
| chord slots visited | 8,192 |
| notes visited | 131,072 |
| symbol parse calls | 16,384 |
| resolution calls | 16,384 |
| ID requests / identity mappings | 16,449 |
| tracked records | 352,321 |

`jsonCodeUnitsVisited`, `maximumJsonDepth`, `sourcePropertiesVisited`, and
`reportItemsEmitted` are bounded directly by decoded bytes or their declared
ceilings. The two terminal states are `complete-candidate` and
`complete-refusal`. Cancellation, stale revision, and resume are inapplicable to
this synchronous value operation. A wall-time cutoff is forbidden.

## Reviewed fixture authority

`c0-legacy-migration-contract.json` is the machine-readable mirror of this
contract. Its six reviewed companions are hash-bound:

- `legacy-presets-source.json`: literal-only extraction of the audited artifact;
- `preset-expectations.json`: independent classification of all 80 chords;
- `adversarial-cases.json`: 70 positive, near-miss, malformed, limit,
  applicability, and transaction cases;
- `mutation-controls.json`: 30 reviewed corruptions the validator must detect;
- `provenance-ledger.json`: seven judgment authorities;
- `trace-ledger.json`: direct links from every parent requirement to fixtures.

The preset expectation authority contains 35 parsed Manual outcomes and 45
Custom Manual outcomes. Those counts are reviewed findings, not an implementation
target to force by changing parser or resolver semantics. Production output may
be compared with them; it may never regenerate or overwrite them.

## Verification commands

- `bun run validate:c0-contract` validates the reviewed authority package.
- `bun run verify:c0-evidence` runs the exact retry-zero C0 suite and writes a
  hash-bound case, preset, trace, counter, mutation, environment, and resource
  ledger under `test-results/`.
- `bun scripts/verify-c0-evidence.ts --check` rejects missing, stale, tampered,
  drifted, skipped, retried, quarantined, or incomplete stored evidence.

Browser, audio, accessibility, network, cancellation, resume, stale revision,
and resource cleanup are not applicable to this pure synchronous value package.
Preview/confirm/cancel belongs to E0/A0/U5. C0 proves candidate-only output and
zero publication calls; the evidence suite separately proves that an external
caller can pass accepted candidates through the real F3 publication gate.
