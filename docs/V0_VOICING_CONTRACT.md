# V0 Voicing Candidate Contract

Status: implementation handoff for `V0/spec`

This document is the self-contained production and independent-verification
contract for V0. The code-facing TypeScript contract surface is
`src/theory/voicing-candidates-contract.ts`. V0 turns one explicitly selected
T1 `SemanticRealization` and one validated `AutoVoicing` policy into a bounded,
ordered candidate set. It also provides a zero-work pass-through for already
stored Manual and Frozen voicings.

V0 does not parse a symbol, choose an altered-dominant realization, infer a
scale, inspect neighboring chords, assign durable voice IDs, calculate V1
voice-leading costs, optimize a progression, mutate a document, or call UI,
audio, MIDI, storage, content, browser, or network code.

## 1. Ownership, dependencies, and authority

V0 belongs to `theory`. Production V0 may import the public `domain` surface
and T1 resolution contracts only. It is pure, synchronous, deterministic, and
recursively immutable. In particular, it must not import `content`, the
compiled Harmonic Atlas, application state, UI, playback, audio, persistence,
export, browser APIs, clocks, random sources, fixtures, or test support.

The normative project sources, in descending order of authority, are:

1. this contract and the checked-in V0 authority fixtures named in Section 15;
2. `src/theory/voicing-candidates-contract.ts`, which freezes the public names,
   discriminants, versions, tuple shapes, orderings, and numeric caps;
3. `docs/T1_RESOLUTION_CONTRACT.md` and T1's public result, which own exact
   realization membership, roles, spelling, order, and altered IDs;
4. `docs/F1_DOMAIN_CONTRACT.md` and the public domain surface, which own Auto,
   Manual, Frozen, range, voice-count, and bass-policy invariants;
5. `docs/ARCHITECTURE.md` and Sections 9.5, 10.3, 10.6, and 12.1-12.6 of
   `docs/REBUILD_PLAN.md` for package boundaries and product intent.

Production output is never an oracle for fixtures or expected values. A prose
example cannot override a typed value or an exact fixture cell.

Two published sources support the musical vocabulary without setting project
policy:

- Megan Lavengood, [“Jazz Voicings,” Open Music Theory](https://viva.pressbooks.pub/openmusictheory/chapter/jazz-voicings/),
  supports the general practice of wider low-register spacing, closer upper
  spacing, extension placement, controlled doubling, and fifth omission.
- Changton Kunjara, [“Drop 2 Voicing for Guitar”](https://doi.org/10.59796/rmj.V20N2.2025.A0101),
  supports the defining Drop-2 transform: lower the second-highest member of a
  close voicing by one octave.

Neither source defines V0's numeric bands, templates, score, limits, or
availability matrix. Those are versioned project decisions below. No artifact
may describe the V0 corpus as human-reviewed or expert-reviewed unless that
review actually occurs and is recorded separately.

## 2. Stable identities and complete callable surface

The exact identities are:

| Meaning | ID | Version |
|---|---|---:|
| contract schema | `changes.theory.voicing-candidates-contract.v1` | in ID |
| request schema | `changes.theory.voicing-request.v1` | in ID |
| result schema | `changes.theory.voicing-result.v1` | in ID |
| candidate schema | `changes.theory.voicing-candidate.v1` | in ID |
| template schema | `changes.theory.voicing-family-template.v1` | in ID |
| family-register-policy schema | `changes.theory.voicing-family-register-policy.v1` | in ID |
| quartal-context schema | `changes.theory.quartal-context.v1` | in ID |
| engine | `changes.voicing-candidates` | 1 |
| engine tag | `changes.voicing-candidates.v1` | in ID |
| template table | `changes.voicing-family-templates` | 1 |
| realization-role selection | `changes.voicing-realization-role-selection` | 1 |
| local score policy | `changes.voicing-local-score` | 1 |
| low-register policy | `changes.voicing-low-register-spacing` | 1 |
| quartal-context gate | `changes.quartal-context-gate` | 1 |

`VoicingCandidateOperations` contains exactly one operation, in this order:

```ts
interface VoicingCandidateOperations {
  readonly realizeVoicing: RealizeVoicing;
}

interface RealizeVoicing {
  <Source extends ManualVoicing | FrozenVoicing>(
    request: StoredVoicingRequest<Source>,
  ): StoredVoicingResult<Source>;
  (request: AutoVoicingRequest): GeneratedVoicingResult;
  (request: RealizeVoicingRequest): RealizeVoicingResult;
}
```

The overloads are normative. A statically stored request cannot report an Auto
refusal or nonzero generation work. An Auto request cannot return a stored
bypass. The final union overload exists only for already-union-typed callers.

All input and output records are readonly. V0 never sorts, freezes, repairs, or
otherwise mutates an input object or input array. Returned V0-owned arrays and
records are recursively frozen.

## 3. Exact request branches

### 3.1 Auto

The actual Auto surface is the following correlated union:

```ts
type AutoVoicingRequestIdentity = Readonly<{
  schema: "changes.theory.voicing-request.v1";
  kind: "auto";
  resolved: ParsedResolvedChord;
  realizationId: SemanticRealizationId;
}>;

type QuartalAutoVoicingRequest = AutoVoicingRequestIdentity & Readonly<{
  policy: AutoVoicing & Readonly<{ family: "quartal" }>;
  quartalContext: QuartalContext;
}>;

type NonQuartalAutoVoicingRequest = AutoVoicingRequestIdentity & Readonly<{
  policy: AutoVoicing & Readonly<{
    family: Exclude<AutoVoicingFamily, "quartal">;
  }>;
  quartalContext: null;
}>;

type AutoVoicingRequest =
  | QuartalAutoVoicingRequest
  | NonQuartalAutoVoicingRequest;
```

Thus a Quartal policy requires a non-null `QuartalContext`; every other family
requires `null`. The typed operation has no `unknown` decoder overload. The
unexpected/required/invalid refusals are defensive runtime outcomes for unsafe
JavaScript, unchecked deserialization, or other callers that bypass the
TypeScript contract; boundary decoding remains outside V0.

`resolved` must be a parsed T1 success. Custom resolution is statically
excluded because custom chords declare `custom.no_auto_voicing`. The explicit
`realizationId` must name a member of `resolved.realizations`. V0 never picks
the first altered realization, merges alternate realizations, or derives a
realization from source text.

### 3.2 Stored bypass

A stored request contains only the schema, `kind: "stored"`, and one already
validated `ManualVoicing | FrozenVoicing`. It deliberately contains no resolved
chord, realization, family table, context, or neighbor.

The success returns the exact input voicing reference. Pitch order, spelling,
octave, duplicates, bass policy, and Frozen `generatedBy` metadata are
unchanged. `candidateGenerationPerformed` is `false`; raw and retained counts
are zero; all 24 work/memory counters are literal zero; termination is
`complete-bypass`. No V0 template, degree, register, transform, constraint, or
score code is invoked.

## 4. Binding one T1 realization

Find `realizationId` in `resolved.realizations` by exact string equality and in
T1 tuple order. If absent, return `voicing.realization_unavailable` with the
requested ID and all available IDs in that same order. This is the first Auto
refusal.

After binding, these arrays are index-aligned and authoritative:

- `degrees[index]` is exact number-and-alter identity;
- `spelledPitchNames[index]` is the only spelling for that degree;
- `pitchClasses[index]` is its sounding projection;
- `requiredDegrees`, `optionalDegrees`, and `guideToneDegrees` retain T1's
  exact identities and order.

Every non-slash V0 voice carries a degree that is an exact member of this one
selected realization and a `sourceDegreeIndex` pointing to that member.
Register realization may add only `octave`; it may not respell the pitch class.
Thus `#9` never becomes `b3`, `bb7` never becomes `6`, and enharmonic equality
never substitutes for degree or spelling identity.

The sole non-degree voice is an explicit generated slash bass. It has
`degree: null`, `sourceDegreeIndex: null`, and `provenance: "slash-bass"`.
No other voice may use null degree metadata.

## 5. Quality classification and exhaustive matrix

V0 classifies the selected realization structurally from T1's formula rule and
typed source fields, never from `sourceText`. The 16 closed classes, in exact
order, are:

```text
major-triad, minor-triad, diminished-triad, augmented-triad,
suspended-triad, power-triad, major-sixth, minor-sixth,
major-seventh, dominant-seventh, minor-seventh,
minor-major-seventh, half-diminished-seventh,
diminished-seventh, augmented-major-seventh, suspended-dominant
```

The mapping is exhaustive:

| T1 rule | V0 class |
|---|---|
| `base-major` | `major-triad` |
| `base-minor` | `minor-triad` |
| `base-diminished` | `diminished-triad` |
| `base-augmented` | `augmented-triad` |
| `base-sus2`, `base-sus4` | `suspended-triad` |
| `base-power` | `power-triad` |
| `sixth-major` | `major-sixth` |
| `sixth-minor` | `minor-sixth` |
| `seventh-major`, `extension-major` | `major-seventh` |
| `seventh-dominant`, `extension-dominant`, `altered-dominant` | `dominant-seventh` |
| `seventh-minor`, `extension-minor` | `minor-seventh` |
| `seventh-minor-major` | `minor-major-seventh` |
| `seventh-half-diminished` | `half-diminished-seventh` |
| `seventh-diminished` | `diminished-seventh` |
| `seventh-augmented-major` | `augmented-major-seventh` |
| `extension-suspended-dominant` | `suspended-dominant` |

The required production applicability scan is the complete 16-class by 7-family
Cartesian product: 112 semantic positions, including explicit unavailable
outcomes. Compact policy authority is materialized for the selected realization
at a position; this does not require 112 verbose records to be checked in. The
scan uses the F1 family order exactly:

```text
balanced, shell, rootless-a, rootless-b, open, drop2, quartal
```

At the later V0/proof exit, independent verification must expand the 33 T1
literal formula seeds plus the four altered IDs in T1 order across those seven
families and voice counts `3, 4, 5, 6, 7`. The required matrix is exactly
`37 * 7 * 5 = 1,295` cells, with no holes, exclusions, duplicates, or
production-derived expected outcomes.

The 37 row identities are T1 formula seeds `T1-FORMULA-001` through
`T1-FORMULA-033`, then `alt-b9-b5`, `alt-b9-sharp5`, `alt-sharp9-b5`, and
`alt-sharp9-sharp5`. A cell records one of:

- a concrete available template and expected feasibility outcome;
- a context-gated Quartal template;
- `voicing.family_unavailable` with one of the two exact reasons;
- `voicing.constraints_unsatisfied` with the winning reason when a row exists
  but the voice count or exact realization cannot satisfy it.

The cell's `expected.refusal` is a compact static-decision projection containing
only code, termination, and ordered reason facts needed by this matrix. It is
not a serialized `RealizeVoicing` runtime refusal and deliberately omits its
path, complete constraint observations, work evidence, and other typed payload.
Runtime refusal shape is proved by the request/result law cases.

This matrix has an explicit static baseline: the seed has no slash bass;
non-rootless families use `bassPolicy: "none"`; Rootless A/B use
`bassPolicy: "external"`; and no register range search is executed. A null
cell refusal means row, exact-degree content, count, doubling, and structural
family feasibility pass under that baseline, not that every later range or
bass variant has a candidate. Generated slash, generated root, other legal bass
policies, and exact ranges belong to the later bass/register proof matrix.
The baseline must be recorded in `availability-matrix.json`, never inferred.

Template count admissibility and selected-realization fit are separate laws.
`voice-count-below-template-minimum` compares the requested total voice count
only with the row's declared `minimumVoiceCount`; the count of required or
guide degrees must never redefine that minimum. For an otherwise-supported
adaptive count, the static non-slash matrix treats `voiceCount` as the number
of degree-bearing slots and reports the Section 6.1 omission reasons. At
runtime, generated slash bass consumes one total voice, so the bass-aware
selector recomputes the omission suffix from the actual degree-bearing slot
count before producing the full typed observations.

Extension and modifier cases retain their class but use their actual selected
degree inventory. The matrix seed never authorizes V0 to inject a degree that
the current realization lacks.

## 6. Family table and exact degree policy

The seven family records below are project policy. Fixed and Quartal degree
sequences are declared low-to-high before octave placement. Adaptive selected
occurrence order is content and traversal authority, not sounding order. A
token means exact number and alteration, not pitch class. `s` is not a
wildcard: where a row says `4`, a `sus2` realization containing `2` but no `4`
is unsatisfied.

Every non-unavailable semantic position has exactly one public selection mode:

- `realization-roles` is exclusive to Balanced, Open, and Drop-2. It names the
  exact sources `selected-realization-required`,
  `selected-realization-optional`, and `selected-realization-guide-tone`, binds
  policy `changes.voicing-realization-role-selection` version 1, and permits at
  most seven selected degree slots. It carries no static degree sequence.
- `fixed-degree-sequence` is exclusive to Shell and Rootless A/B. It owns the
  exact one-through-seven `VoicingTemplateDegreeSequence` printed by the
  compact authority.
- `quartal-context-sequence` is exclusive to context-gated Quartal. Its source
  is exactly `quartal-context`, with two through seven selected degree slots;
  the row carries no substitute sequence.

An unavailable position carries identity and reason only. It must not carry an
inert selection or register policy.

### 6.1 Common adaptive selection

Balanced and Open use every step of this exact content selector. Drop-2 uses
steps 1-3 for unique-degree selection, then refuses if degree-bearing slots
remain; it does not use the octave-doubling fill in steps 4-5:

1. Start with every distinct T1 required degree and every guide tone. Guide
   tones are normally already required; union by exact degree without changing
   T1 order.
2. If the available degree-bearing slots are fewer than that set, return
   `voicing.constraints_unsatisfied` with `required-degree-omitted`,
   `guide-tone-omitted`, or both in constraint order. The omitted payload is
   exactly the unplaceable suffix of that one ordered mandatory vector. Project
   the suffix independently onto T1's required and guide roles, preserving
   order; a degree belonging to both roles intentionally appears in both
   observations.
3. Fill remaining slots only from exact T1 optional members. Priority is:
   altered characteristic optional members in canonical order; `13`; `b13`;
   `#11`; `11`; `#9`; `b9`; `9`; `6`; then natural `5`. Any remaining domain
   degree follows the canonical order below.
4. If slots remain, one octave duplicate of exact `1`, then one octave
   duplicate of exact natural `5`, may be added in that order. Each degree may
   be doubled at most once.
5. Never double a guide tone, altered degree, characteristic required color,
   or slash bass. No other doubling is permitted.
6. If the requested count still cannot be reached, return
   `voicing.constraints_unsatisfied` carrying a
   `voicing.constraint.voice_count` observation and the applicable typed
   reason; do not fabricate a color or repeat a prohibited degree.

For `C7alt` realization `alt-b9-b5`, the mandatory vector is exactly
`[1,3,b5,b7,b9]` and the guide vector is `[3,b7]`. Balanced voice count 3 is
supported by its declared minimum of 3, but only three degree-bearing slots are
available. The ordered observations are therefore
`required-degree-omitted` with `[b7,b9]`, then `guide-tone-omitted` with
`[b7]`; no voice-count observation is present. At count 4 only required `b9`
is omitted. At count 5 the realization fits. Drop-2 count 3 remains a true
`voice-count-below-template-minimum` refusal because that row's declared
minimum is 4.

Canonical degree order is:

```text
1, 2, b3, 3, 4, b5, 5, #5, 6, bb7, b7, 7,
b9, 9, #9, 11, #11, b13, 13
```

Any domain-valid exact degree not printed in that shorthand is ordered by
domain degree-number order and then numeric `alter`. This fallback affects
ordering only; it never grants membership.

An original occurrence has provenance `realization`. An authorized extra
octave occurrence has provenance `doubling` and repeats the original
`sourceDegreeIndex`.

Only a `fixed-degree-sequence` selection owns
`VoicingTemplateDegreeSlot` records. Every such slot materializes exact degree,
role, required and guide-tone flags, minimum and preferred octave lift from the
preceding slot, and omission/doubling permissions. The four closed roles are:

- `identity`: root, third/suspension, or altered structural member whose loss
  would misstate the chord family;
- `guide`: an exact T1 guide tone;
- `color`: sixth, extension, or characteristic alteration;
- `support`: a non-guide member such as an ordinary fifth.

Fixed-slot materialization is exact. Role precedence is identity, then T1
guide, then color, then support; the separate `guideTone` flag remains `true`
when an identity slot is also a T1 guide. Every printed fixed slot has
`required: true`, `mayOmit: false`, and `mayDouble: false`. The first slot has
both octave-lift fields zero. For every later slot, minimum lift is zero when
its pitch class is strictly above the preceding slot in the same octave and one
when it must wrap; preferred lift equals that minimum. Wider legal placements
come only from register enumeration within the fixed row's span and global
caps. These table lifts encode the C-reference directed interval: after a
spelled transposition, placement validates the same adjacent semitone interval,
not the raw difference between the two written SPN octave numbers. Adaptive
multiplicity instead follows steps 1-6 above; Quartal never doubles.

The public fixed `VoicingTemplateDegreeSequence` is an exact one-through-seven
tuple union. `RealizationRoleTemplateSelection.maximumSelectedDegreeSlots` is
the literal 7; Quartal freezes literal minimum 2 and maximum 7. The adaptive
priority belongs to the versioned selection policy rather than mutable arrays
on each folded quality row. Together these bounds make the 112-by-7 slot-work
ceiling sound.

The exact identity sets are:

| Quality class | Identity degrees |
|---|---|
| major-triad | `1,3` |
| minor-triad | `1,b3` |
| diminished-triad | `1,b3,b5` |
| augmented-triad | `1,3,#5` |
| suspended-triad | `1,2` for sus2; `1,4` for sus4 |
| power-triad | `1,5` |
| major-sixth | `1,3` |
| minor-sixth | `1,b3` |
| major-seventh | `1,3` |
| dominant-seventh | `1,3` |
| minor-seventh | `1,b3` |
| minor-major-seventh | `1,b3` |
| half-diminished-seventh | `1,b3,b5` |
| diminished-seventh | `1,b3,b5` |
| augmented-major-seventh | `1,3,#5` |
| suspended-dominant | `1,2` for sus2; `1,4` for sus4 |

These are root plus the exact source-triad identity members. Sixth, seventh,
and extension membership remains governed independently by T1 required/guide
roles and the fixed family row. An altered-dominant realization uses the
dominant-seventh identity set; its selected altered fifth and ninth remain
T1-required colors for adaptive families. A fixed family may omit a required
color only because its exact row says so.

### 6.2 Availability summary

`A` means the adaptive selector is available; `C` means context-gated; `-`
means an explicit unavailable row. A fixed sequence is printed directly.

| Quality class | Balanced | Shell | Rootless A | Rootless B | Open | Drop-2 | Quartal |
|---|---|---|---|---|---|---|---|
| major-triad | A | - | - | - | A | A | - |
| minor-triad | A | - | - | - | A | A | - |
| diminished-triad | A | - | - | - | A | A | - |
| augmented-triad | A | - | - | - | A | A | - |
| suspended-triad | A | - | - | - | A | A | - |
| power-triad | A | - | - | - | A | A | - |
| major-sixth | A | - | - | - | A | A | - |
| minor-sixth | A | - | - | - | A | A | - |
| major-seventh | A | `1,3,7` | `3,7,9,5` | `7,9,3,13` | A | A | C |
| dominant-seventh | A | `1,3,b7` | `3,b7,9,13` | `b7,9,3,13` | A | A | - |
| minor-seventh | A | `1,b3,b7` | `b3,b7,9,5` | `b7,9,b3,11` | A | A | C |
| minor-major-seventh | A | `1,b3,7` | `b3,7,9,5` | `7,9,b3,6` | A | A | - |
| half-diminished-seventh | A | `1,b3,b5,b7` | `b3,b5,b7,11` | `b7,11,b3,b5` | A | A | C |
| diminished-seventh | A | `1,b3,b5,bb7` | - | - | A | A | C |
| augmented-major-seventh | A | - | - | - | A | A | - |
| suspended-dominant | A | `1,4,b7` | `4,b7,9,13` | `b7,9,4,13` | A | A | C |

The exact policy/template IDs are:

```text
balanced-adaptive-v1
open-adaptive-v1
drop2-adaptive-v1

shell-major-v1
shell-dominant-v1
shell-minor-v1
shell-minor-major-v1
shell-half-diminished-v1
shell-diminished-v1
shell-suspended-dominant-v1

rootless-a-major-v1              rootless-b-major-v1
rootless-a-dominant-v1           rootless-b-dominant-v1
rootless-a-minor-v1              rootless-b-minor-v1
rootless-a-minor-major-v1        rootless-b-minor-major-v1
rootless-a-half-diminished-v1    rootless-b-half-diminished-v1
rootless-a-suspended-v1          rootless-b-suspended-v1

quartal-major-lydian-v1
quartal-minor-dorian-v1
quartal-suspended-modal-v1
quartal-half-diminished-locrian-v1
quartal-diminished-symmetric-v1

shell-no-row-v1
rootless-no-row-v1
quartal-no-row-v1
```

Non-Quartal `-` rows use `quality-family-unsupported`. Quartal `-` rows use
`quartal-row-undeclared`. A missing exact degree in a printed row is not family
unavailability: it is `voicing.constraints_unsatisfied` with
`template-degree-absent`. In particular, V0 does not add 9 or 13 to make a
rootless row work. Examples include `Cmaj7` Rootless A missing 9, `C9`
Rootless B missing 13, `Cm7` missing the Rootless colors, minor-major missing 9
or 6, half-diminished missing 11, and `C7sus2` confronted with a fixed `4` row.

The four selected altered-dominant realizations remain distinct. Adaptive
families use each realization's exact altered fifth and ninth. Fixed dominant
Shell or Rootless rows do not replace natural template degrees with altered
ones; they either use exact members already present or report
`template-degree-absent`. Identical candidate pitches from two separately
requested realization IDs do not merge the requests.

### 6.3 Family structure

The register-policy IDs are `balanced-register-v1`,
`fixed-template-register-v1`, `open-register-v1`, `drop2-register-v1`, and
`quartal-register-v1`. The public `VoicingFamilyRegisterPolicy` union freezes
their complete min/max span, selected-slot traversal/order, wide-gap,
voice-count scope for any wide-gap heuristic, closed-source, and transform
records. Every available or context-gated
template carries its typed register-policy ID/version binding and target span;
unavailable templates do not. The production implementation must own typed
policy values and must not import the fixture. Their numeric laws follow.

The exact exported register vocabularies are:

```text
slot order: selected-degree-register-weave-v1, template-low-to-high,
            closed-source-low-to-high, quartal-context-low-to-high
transform:  drop2
source:     second-from-top
output:     midi-ascending
```

#### Selected-degree register weave (v1)

Balanced and Open use exactly one ordered selected-occurrence vector. They do
not enumerate rotations or permutations. First choose the exact degree
occurrences under Section 6.1. Membership priority does not determine sounding
position. After membership is complete, order occurrences by the canonical
degree order in Section 6.1. For two occurrences of the same exact degree, the
`realization` occurrence precedes the authorized `doubling` occurrence. Assign
contiguous zero-based template ordinals in that order.

For each selected occurrence, form one register-placement list by retaining
its exact source spelling and varying only the octave across every MIDI in the
inclusive requested range. Each list is ascending by MIDI. Occurrences sharing
one `sourceDegreeIndex` reuse the same immutable placement list but remain
independent search slots; work accounting visits each distinct source
placement once.

Traverse the Cartesian product depth-first. Selected occurrence zero is the
outermost slot, the final occurrence is the innermost slot, and every slot
visits its placement list in ascending MIDI order. There is no order-variant
loop. A complete adaptive assignment may be nonascending in selected-slot
order. Sort the complete sounded assignment by ascending MIDI before hard
validation, preserving every spelling, exact degree, provenance, and source
index, then reject an exact MIDI tie. Balanced and Open apply no structural
transform after this sort.

For generated non-slash bass, exact degree `1` with `realization` provenance is
an ordinary selected occurrence and consumes one requested voice. It has no
separate bass loop; after sorting it must be the unique lowest voice. A
generated explicit slash bass instead reserves one requested voice before
degree selection and is not a selected-degree occurrence. After each complete
degree assignment, enumerate that exact slash spelling's in-range placements
in ascending MIDI as the innermost loop, attach it with null degree and source
index, sort the complete sounded assignment, and retain it only when the slash
voice is uniquely lowest. `external` and `none` add no traversal slot; external
bass remains unsounded.

Assign `rawGenerationOrdinal` as the next zero-based integer only after the
post-sort candidate passes every hard constraint, before equivalence
normalization, local scoring, final ordering, or retention. A rejected leaf
consumes no raw ordinal. If equivalent hard-valid leaves occur, normalization
retains the earlier raw ordinal.

`V0-CAND-001` freezes the positive and near-miss boundary. Its selected vector
is `[1,3,5,7]`; the depth-first assignment
`[C3=48,E4=64,G3=55,B3=59]` is intentionally nonascending in selected-slot
order; MIDI sorting produces `[1@48,5@55,7@59,3@64]`; its raw generation
ordinal is 6; and its template-order displacement is
`|0-0| + |1-3| + |2-1| + |3-2| = 4`. The final degree order is not a cyclic
rotation of `[1,3,5,7]` or T1 role order `[1,3,7,5]`. A cyclic-rotation
prefilter would therefore delete a reviewed legal voicing and is forbidden.

#### Balanced

Balanced supports policy counts 3-7 subject to exact content, bass, range, and
doubling feasibility. Traverse exactly the selected-degree register weave
above. Candidate span is 0-36 semitones and the local target span is 12.

#### Shell

Shell uses only the printed fixed sequence and never rotates it. Major,
dominant, minor, minor-major, and suspended rows require exactly three policy
voices. Half-diminished and diminished rows require exactly four. No Shell
slot may double and no omitted color is silently restored. The fixed-template
span is 0-24 semitones with target 12.

#### Rootless A and B

Rootless uses only the printed four-voice low-to-high sequence, never rotates,
never doubles, and permits only `bassPolicy: "external"`. Exact root degree 1
must be absent from candidate voices even if another degree is enharmonically
equal. The named external bass supplies context but is neither sounded nor
counted. The fixed-template span is 0-24 semitones with target 12.

#### Open

Open uses the exact Balanced content selector and selected-degree register
weave, but accepts only placements with total span 12-36 semitones and at least
one adjacent gap of seven or more semitones. Its target span is 19. Merely
attaching the word “open” to a Balanced candidate that lacks that structure is
forbidden.

#### Drop-2

Drop-2 supports policy counts 4-7. First construct a strict low-to-high closed
source with at least four voices, no duplicate MIDI, and total span at most 11
semitones. Identify the second-highest source voice by MIDI, lower that exact
voice by 12 semitones, sort the transformed voices low-to-high, and revalidate
every bass, range, spelling, identity, spacing, count, and family constraint.

The final span must be 12-36 semitones and target span is 19. For four- and
five-voice results, at least one adjacent gap must be seven or more semitones.
Dense six- and seven-voice results do not apply that extra gap heuristic: the
literal closed-source transform and complete post-transform revalidation are
their structural proof. `Drop2TransformEvidence` records the complete source
MIDI sequence, the zero-based second-from-top source ordinal,
`loweredBySemitones: 12`, and the complete transformed MIDI sequence. Lowering
the second voice from the bottom, lowering two octaves, pre-spreading the source
beyond 11 semitones, or labeling a generic spread as Drop-2 is nonconforming.

Although Drop-2 reuses the common unique-degree selection order, it does not
inherit the final root/fifth octave-doubling fill. A repeated pitch class cannot
fit a strict source span of at most 11 without duplicate MIDI. Therefore a
Drop-2 count greater than the selected realization's distinct degree count is
statically infeasible even when that doubling would be legal in Balanced or
Open. It returns constraints-unsatisfied with `doubling-not-permitted`; the
availability matrix must not mark such a cell as feasible.

Exact-degree count alone is not sufficient static proof. Under the non-slash
matrix baseline, V0 enumerates every cyclic inversion of the selected pitch
classes as a unique ascending closed source within 11 semitones, applies the
literal second-from-top lowering, and checks the final 12-36-semitone span plus
the seven-semitone adjacent-gap law only for counts four and five. Coincident
pitch classes, or a sparse-count pitch-class geometry for which no inversion
passes, return constraints-unsatisfied with `family-transform-invalid` before
register search. Runtime performs the same preflight after bass-aware slot
selection, including an explicit generated slash bass in the pitch-class set.

#### Quartal

Quartal has context-gated rows only for major-seventh, minor-seventh,
half-diminished-seventh, diminished-seventh, and suspended-dominant. Major,
minor, suspended, and half-diminished rows permit policy counts 3-5;
diminished-seventh permits 3-4. The context's degree sequence is low-to-high,
is never rotated, and may not double.

Every context degree must be an exact selected-realization member. For each
adjacent pair, take the positive upward pitch-class distance in twelve-tone
equal temperament; it must be exactly 5 or 6 semitones. Register realization
uses that simple interval, not a compound 17- or 18-semitone substitute. The
final span must be 10-24 semitones and target span is 15. A reordered tertian
stack is not Quartal. Adjacency evidence calls 5 `perfect-fourth` and 6
`augmented-fourth`; no other kind or semitone count exists.

## 7. Quartal context is an injected gate, not content authority

`QuartalContext` contains exactly the schema and policy identity/version,
`evidenceKind`, bounded `evidenceId`, positive safe-integer `evidenceVersion`,
and an ordered 2-7 degree sequence. An evidence ID contains 1-256 Unicode code
points and at most 512 UTF-8 bytes. Code points are measured by
`Array.from(value).length`; bytes are measured by
`new TextEncoder().encode(value).byteLength`. The two-member form exists only
for the upper dyad of a three-total-voice generated explicit-slash request. Its three
evidence kinds are:

```text
compatible-chord-scale
declared-modal-template
declared-suspended-template
```

Names such as Lydian, Dorian, Locrian, Mixolydian, suspended-modal, and
symmetric-diminished in authority data are descriptive provenance for the
issuer of `evidenceId`; they are not fields on `QuartalContext` and V0 does not
parse them out of an ID. Runtime compatibility is attested by the versioned
evidence kind/ID and then independently narrowed by exact realization
membership and 5/6-semitone adjacency.

V0 does not import H0 or `content` to obtain or verify this record. The record
does not grant a missing degree, spelling, pitch, omission, or family row. Its
ID or label alone never authorizes a candidate. V0 uses it only to gate the
declared quality/family row and to order exact degrees that already exist in
the selected T1 realization.

Validation order is exact:

1. schema;
2. policy ID;
3. policy version;
4. evidence ID with 1-256 code points and at most 512 UTF-8 bytes;
5. positive safe-integer evidence version;
6. degree count against the policy's degree-bearing voice slots: exactly
   `voiceCount - 1` for a generated non-member slash bass and exactly
   `voiceCount` otherwise;
7. every degree's exact realization membership, in sequence order;
8. every adjacent interval, in sequence order, being 5 or 6 semitones.

A two-member context on any request other than that generated-slash,
three-total-voice case fails step 6 with `degree-count-mismatch`; it is not a
general two-note Quartal family.

The corresponding invalid reasons, in that same order, are:

```text
schema-mismatch, policy-id-mismatch, policy-version-mismatch,
evidence-id-invalid, evidence-version-invalid, degree-count-mismatch,
degree-absent-from-realization,
adjacency-not-perfect-or-augmented-fourth
```

A non-Quartal request with context returns
`voicing.quartal_context_unexpected`. A Quartal request without context returns
`voicing.quartal_context_required`. Invalid evidence returns
`voicing.quartal_context_invalid`; it never degrades to another family.

The generated-slash, three-total-voice case has exactly two degree-bearing
slots. A valid two-member context supplies that upper dyad; the slash bass
remains a null-degree voice and cannot satisfy either context member.

The v1 context-invalid vocabulary has no repeated-degree reason. A sequence
such as `1,#4,1` may pass context membership and 6+6 adjacency, but the second
occurrence is an undeclared octave doubling. Candidate validation therefore
returns `voicing.constraints_unsatisfied` with `doubling-not-permitted`; it must
not invent a Quartal-context reason outside the closed tuple.

## 8. Bass and total voice-count semantics

`policy.voiceCount` is always the number of generated candidate voices. It is
not “upper voices plus bass.”

### Generated

- A slash chord receives one exact generated slash-bass voice. It is the lowest
  candidate MIDI, participates in range and spacing, has null degree metadata,
  and consumes one of the requested voices. It cannot satisfy a realization or
  template degree.
- A non-slash chord receives one generated root voice using exact degree `1`
  and T1's root spelling. It is both the lowest candidate voice and one of the
  template's degree-bearing voices; it is not an additional voice.
- If all mandatory template degrees plus a non-member slash bass do not fit the
  requested count, the result is constraints-unsatisfied.

### External

No external bass appears in `voices`, `pitches`, range checks, spacing checks,
or voice count. `explanation.externalBass` names the exact resolved slash bass
when present; otherwise it names the exact chord root. Thus non-slash
`external` has an explicit effective bass rather than an unnamed assumption.
Rootless families require this policy. Exclusion checks sounding pitch class,
so an enharmonic spelling of the delegated bass is also excluded from candidate
voices; the explanation still preserves the exact named source spelling.

### None

No bass is generated or named. `none` is invalid for a slash chord under F1 and
cannot be used by a valid slash Auto request. It is never permitted for a
rootless family.

An enharmonic slash pitch at the lowest MIDI is still wrong if its spelling is
not the exact resolved slash spelling. External bass must never leak into the
candidate as an ordinary realization voice.

## 9. Register enumeration and hard musical laws

Ranges are inclusive. For each selected degree slot, enumerate every exact
spelling/octave placement whose MIDI lies in `[lowMidi, highMidi]`, in ascending
MIDI order. There are at most 11 MIDI placements per degree and at most 16 T1
degrees, hence the exact 176-placement cap.

Fixed and Quartal sequences search partial assignments depth-first by declared
slot and ascending MIDI and require their completed pre-transform sequence to
be strictly low-to-high. Drop-2 MIDI-sorts and validates its closed source
before applying its one declared transform. Balanced and Open follow the exact
single-vector selected-degree register weave in Section 6.3. Raw generation
ordinal is the zero-based order in which hard-valid candidates emerge from
these traversals, before equivalence normalization. Wall time cannot change
traversal or membership.

Every successful candidate satisfies all applicable constraints in this exact
report order:

```text
voicing.constraint.realization_membership
voicing.constraint.template_degree_membership
voicing.constraint.voice_count
voicing.constraint.midi_range
voicing.constraint.required_degrees
voicing.constraint.guide_tones
voicing.constraint.identity_tones
voicing.constraint.bass_policy
voicing.constraint.slash_bass_lowest
voicing.constraint.external_bass_excluded
voicing.constraint.rootless_root_omitted
voicing.constraint.unique_midi
voicing.constraint.permitted_doubling
voicing.constraint.low_register_spacing
voicing.constraint.family_structure
voicing.constraint.quartal_context
```

Fixed Shell and Rootless templates are explicit family-specific omission
policies; their printed members are mandatory even when T1 calls one optional.
Adaptive templates may not omit T1 required or guide degrees. No family may
omit its quality-defining identity tones. Rootless's exact root omission is the
sole intentional root exception.

Duplicate exact MIDI is forbidden even when spellings or degrees differ.
For fixed rows, octave duplication is legal only when that exact slot declares
`mayDouble`; every V0 fixed row currently forbids it. Realization-role adaptive
rows may duplicate only by steps 4-5 of Section 6.1, and Drop-2 stops before
those steps. Quartal never duplicates.

### 9.1 Low-register spacing

Sort the complete sounded candidate low-to-high. For every adjacent pair use
the lower MIDI to choose exactly one band, then require the actual interval to
be at least the stated minimum:

| Lower MIDI | Minimum adjacent interval |
|---:|---:|
| 0-35 | 10 semitones |
| 36-47 | 7 semitones |
| 48-59 | 4 semitones |
| 60-127 | 1 semitone |

The comparisons at 35/36, 47/48, and 59/60 are normative. Generated bass is
included; external bass is excluded. These numbers are project policy, not a
numeric claim attributed to the supporting sources in Section 1.

## 10. Candidate identity, evidence, explanation, and equivalence

Candidate voices are ordered low-to-high with contiguous zero-based ordinals.
`pitches` is the exact index-aligned projection of `voices[].pitch`. A
realization or doubling voice carries exact degree and source index; a slash
bass carries null for both.

Canonicalization sorts by MIDI, rejects any tie, rewrites ordinals to
`0..voiceCount - 1`, projects the aligned `pitches` tuple, and preserves every
exact spelling, degree, source index, and provenance field. It does not choose
an enharmonic representative or change family structure.

For one request, two raw candidates are equivalent only when every ordered
voice has the same MIDI, octave, domain step, alteration, exact degree or null,
provenance, and source-degree index. MIDI equality alone is insufficient.
Spelling-distinct, degree-distinct, or provenance-distinct candidates remain
distinct. Raw ordinal, score, structured explanation, and candidate ID do not enter
equivalence. Canonical candidates are compared against previously kept records
in raw order; an equivalent later record is discarded, so the earliest raw
generation ordinal is the representative.

Successful candidate evidence uses the fixed causal code order:

```text
voicing.evidence.quality_classified
voicing.evidence.template_selected
voicing.evidence.realization_bound
voicing.evidence.register_enumerated
voicing.evidence.family_transform
voicing.evidence.constraints_checked
voicing.evidence.local_score
voicing.evidence.stable_retention
voicing.evidence.quartal_context
```

The final entry appears only for Quartal. Evidence records name their source
ID/version and exact affected voice ordinals/degrees. Every evidence
`sourceId` obeys the same 1-256-code-point and 512-byte limits as a Quartal
`evidenceId`; an engine-produced candidate may never emit an invalid source ID.

`VoicingCandidateExplanation` records the quality class, template ID, ordered
degree-bearing voices, exact omitted and doubled degrees, named external bass,
Drop-2 transform evidence when applicable, and every Quartal adjacency when
applicable. Omitted and doubled degree lists use selected-realization order and
preserve repeated doubling occurrences.

All candidate and refusal diagnostic payload is bounded, not merely its
top-level candidate count:

| Payload | Inclusive cardinality |
|---|---:|
| successful hard-constraint observations | exactly 16, in constraint-code order |
| non-Quartal / Quartal causal evidence records | exactly 8 / 9, in evidence-code order |
| voice ordinals, degrees, or MIDI values in one observation | at most 7 |
| explanation ordered degrees | 2-7 |
| explanation omitted / doubled degrees | at most 16 / 2 |
| explanation Quartal adjacencies | at most 4 |
| Drop-2 source and transformed MIDI arrays | equal length, 4-7 |
| generated result candidates | 1-24 |
| realization-unavailable available IDs | 1-4 |
| constraints-unsatisfied observations | 1-16 full-payload-unique records |

Successful immutable constraint, evidence, score, and explanation projections
are payload of their owning candidate record. A no-result search may retain
only the single operation-local constraint-observation population declared in
Section 12. It may not retain a parallel key map or another diagnostic side
collection.

## 11. Exact local score and stable order

All score axes are nonnegative safe integers and compare ascending in this
exact order:

1. `optionalDegreesOmitted`: number of exact T1 optional members absent from
   the candidate's distinct degree set;
2. `nonPreferredDoublings`: doubling occurrences not taken at the first still
   available position of the template's declared doubling priority;
3. `guideToneDoublings`: doubling occurrences whose exact degree is a T1 guide;
4. `templateOrderDisplacement`: after removing slash bass, match every
   remaining occurrence to its selected occurrence by exact degree, source
   index, and provenance, with repeated occurrences matched left-to-right, then
   sum the absolute difference between its zero-based template ordinal and
   observed low-to-high ordinal. Generated root participates; generated slash
   does not;
5. `targetSpanDistance`: absolute difference between complete candidate span
   and the template's target span;
6. `rangeCenterDistanceTwice`:
   `abs((candidateLow + candidateHigh) - (range.lowMidi + range.highMidi))`.

Complete candidate span includes generated bass and excludes external bass.

After equivalence normalization, compare candidates by:

1. the six local-score axes above;
2. ordered MIDI sequence, lexicographically;
3. ordered degrees by number then alteration, lexicographically, with null
   slash-bass before any degree;
4. ordered spelling by octave, then domain step order `C D E F G A B`, then
   alteration;
5. template ID by UTF-16 code units, never locale;
6. raw-generation ordinal.

The corresponding exact exported order keys are:

```text
local-score-axis-order
midi-sequence-lexicographic
degree-number-then-alter-lexicographic
spelling-octave-then-domain-step-then-alter-lexicographic
template-id-utf16-lexicographic
raw-generation-ordinal
```

Retain the first 24. Assign zero-based `retainedOrdinal` and IDs
`candidate-000` through `candidate-023` only after final ordering. Replaying an
identical request and engine version must return byte-equivalent serialized
values and identical evidence counters.

## 12. Bounded work, memory, and termination

The operation records 16 cumulative work counters and eight peak-memory
counters. Every counter is a nonnegative safe integer. Inclusive maxima are:

| Counter | Maximum |
|---|---:|
| `realizationDegreeRecordsVisited` | 16 |
| `templateRowsVisited` | 112 |
| `templateDegreeSlotsVisited` | 784 |
| `registerPlacementsVisited` | 176 |
| `searchStatesExpanded` | 8,192 |
| `structuralTransformsAttempted` | 8,192 |
| `hardConstraintChecks` | 131,072 |
| `rawCandidatesProduced` | 96 |
| `candidateCanonicalizations` | 96 |
| `duplicateCandidateComparisons` | 4,560 |
| `localScoresComputed` | 96 |
| `orderingComparisons` | 4,560 |
| `retainedCandidatesProduced` | 24 |
| `outputVoicesProduced` | 168 |
| `constraintObservationComparisons` | 2,228,224 |
| `constraintObservationsProduced` | 16 |
| `peakRegisterPlacementRecords` | 176 |
| `peakSearchStateRecords` | 512 |
| `peakRawCandidateRecords` | 96 |
| `peakRawVoiceRecords` | 672 |
| `peakRetainedCandidateRecords` | 24 |
| `peakOutputVoiceRecords` | 168 |
| `peakTrackedRecords` | 1,792 |
| `peakConstraintObservationRecords` | 16 |

The derivations are fixed: 112 is 16 classes by seven families; 784 is 112 by
seven template slots; 176 is 16 realization degrees by 11 register placements;
131,072 is 8,192 expansions by 16 hard constraints; 4,560 is `96 choose 2`;
672 is 96 raw candidates by seven voices; 168 is 24 retained candidates by
seven voices; and 2,228,224 is 16 retained-observation comparisons for each of
131,072 hard-constraint checks plus 8,192 structural attempts. The 1,792
tracked-record ceiling is exactly
`16 + 112 + 176 + 512 + 96 + 672 + 24 + 168 + 16`:
selected-realization degree records, template rows, register placements, search
states, raw candidates, raw voices, retained candidates, output voices, and
constraint observations, respectively.

Those nine named populations are the complete accounting units, in that order.
Their individual maxima are `16, 112, 176, 512, 96, 672, 24, 168, 16`, and
their sum is the aggregate maximum 1,792. Candidate-owned bounded diagnostics
are charged to their raw- or retained-candidate owner. Only unsatisfied-report
records may occupy the last population, and the ordered accumulator is
transferred into the refusal rather than copied. Any parallel diagnostic
projection is an undeclared tenth population and is forbidden.

Counter increments are also normative:

- visiting one selected T1 degree, template row, template slot, or materialized
  in-range spelled MIDI placement increments its corresponding visit counter;
- removing one partial or complete assignment from deterministic depth-first
  search increments `searchStatesExpanded`;
- submitting one complete assignment to the family's structural step,
  including a no-op Balanced/fixed step, increments
  `structuralTransformsAttempted`;
- executing one constraint-code predicate increments `hardConstraintChecks`;
- comparing one incoming unsatisfied observation with one retained observation
  increments `constraintObservationComparisons`; equality means the complete
  public payload matches, not merely its code;
- accepting one first-seen complete unsatisfied payload increments
  `constraintObservationsProduced`; an exact duplicate performs comparisons but
  consumes neither another record nor another produced unit;
- presenting one hard-valid pre-canonical candidate computes the prospective
  `rawCandidatesProduced + 1`; V0 stores it and increments the counter only
  when the inclusive cap permits it, otherwise the refusal reports that
  prospective received value;
- canonicalizing, equivalence-comparing, scoring, comparator-calling, retaining,
  and copying an output voice each increment the correspondingly named counter.

For `templateDegreeSlotsVisited`, a slot is one bounded position exposed after
selection-mode binding: a fixed slot, one realization-role-selected position,
or one Quartal-context position. An unavailable semantic position exposes zero
slots. `MAX_VOICING_TEMPLATE_DEGREE_SLOTS` is exactly 7.

Final ordering uses a stable insertion sort over the already deterministic raw
order so comparison evidence is runtime-independent and cannot exceed
`96 choose 2`. A memory peak is sampled after every allocation and before every
release. Candidate, voice, placement, search-state, constraint-observation, and
retained/output array entries are tracked records; scalar counters are not. A
cap is checked before accepting the next record or work unit. The constraint
collector is one ordered array with no companion key collection.

Exactly 96 raw candidates may complete. Before accepting a 97th raw candidate,
return `limit.voicing_work_exceeded` with counter
`rawCandidatesProduced`, `received: 97`, `maximum: 96`, and
`partialResult: false`. The same exact-plus-one rule applies to every other
counter. A limit refusal returns no candidates, even if a partial set had been
collected. Wall time is performance evidence only and never a musical cutoff.

Constraint-observation overflow has one necessary qualification because
rejected assignments are not output evidence when any legal candidate exists.
Until the first hard-valid candidate, V0 retains at most 16 unique observations.
A prospective distinct record 17 saves the typed
`constraintObservationsProduced` plus-one refusal, stops diagnostic collection,
and continues the otherwise unchanged musical traversal. The first hard-valid
candidate clears that provisional diagnostic state and generation continues;
the recorded comparison/production work and peak remain evidence. If complete
bounded traversal yields no legal candidate, the saved overflow becomes the
final work-limit refusal. An ordinary search/work/memory cap that prevents
complete traversal remains immediately terminal and wins. This qualification
does not truncate a constraint report or change candidate membership/order.

On success, canonicalize every raw candidate, discard equivalent later
records, compute one local score per kept canonical candidate, perform the
stable order, and retain at most 24.
There is no silent early top-K truncation. If complete bounded search produces
no legal candidate, return constraints-unsatisfied. If completing the search
would exceed a cap, return the work-limit refusal instead of claiming no legal
candidate.

The complete termination vocabulary is:

```text
complete-generated, complete-bypass, realization-unavailable,
quartal-context-unexpected, quartal-context-required,
quartal-context-invalid, family-unavailable, constraints-unsatisfied,
work-limit-exceeded
```

Each failure type is statically coupled to its matching termination. A stored
bypass has all 24 numeric counters exactly zero.

## 13. Results, refusals, and precedence

Generated success contains the result schema, `kind: "generated"`, engine
identity/version, explicit realization ID, exact Auto policy, raw candidate
count, and a nonempty ordered candidate tuple. Each candidate contains schema,
stable metadata, raw and retained ordinal, exact voices/pitches, all satisfied
hard constraints, score identity/value, evidence, and explanation.

There is no partial success and no warning-shaped fallback. The refusal codes,
in exact first-independently-discoverable order, are:

```text
voicing.realization_unavailable
voicing.quartal_context_unexpected
voicing.quartal_context_required
voicing.quartal_context_invalid
voicing.family_unavailable
voicing.constraints_unsatisfied
limit.voicing_work_exceeded
```

Stable payload paths and fields are:

| Code | Path | Additional payload |
|---|---|---|
| `voicing.realization_unavailable` | `["realizationId"]` | received ID and available IDs in T1 order |
| `voicing.quartal_context_unexpected` | `["quartalContext"]` | non-Quartal family |
| `voicing.quartal_context_required` | `["quartalContext"]` | `quartal`, policy ID, policy version |
| `voicing.quartal_context_invalid` | `["quartalContext"]` or the exact failing degree-sequence index | winning invalid reason |
| `voicing.family_unavailable` | `["policy","family"]` | family, quality class, formula rule, unavailable reason |
| `voicing.constraints_unsatisfied` | `["policy"]` | nonempty ordered constraint tuple |
| `limit.voicing_work_exceeded` | `[]` | counter, received, maximum, `partialResult: false` |

The indexed Quartal path is
`["quartalContext","degreeSequence",index]`. Failures contain evidence and
no partial `value`.

Quartal validation precedes family-table lookup. Static unavailable rows
precede register search. Constraints are accumulated only after a real row is
bound. A work-limit result wins whenever the operation cannot finish the work
needed to establish a later musical outcome.

The exact constraints-unsatisfied reasons, in report precedence, are:

```text
selected-realization-mismatch
template-degree-absent
voice-count-below-template-minimum
voice-count-unsupported
bass-policy-unsupported
required-degree-omitted
guide-tone-omitted
identity-tone-omitted
slash-bass-unplaceable
external-bass-present
root-present-in-rootless
range-insufficient
duplicate-midi
doubling-not-permitted
low-register-spacing
family-transform-invalid
quartal-context-invalid
no-legal-register-placement
```

When several constraints are unsatisfied, compare and deduplicate their complete
public payload: `satisfied: false`, code, reason, voice ordinals, exact degree
number/alter pairs, and MIDI values. Exact duplicates collapse; distinct facts
with the same code remain distinct. Keep the collector in the 16-code order from
Section 9; within one code, sort by voice ordinals, exact degrees, and MIDI
values lexicographically, then by the frozen reason-precedence rank to totalize
otherwise-identical projections. Proper prefixes sort first. Each observation
includes code, reason, affected ordinals/degrees/MIDI, and no unstable prose
comparison key. If a no-result search would require a seventeenth unique record,
return the typed work-limit outcome described in Section 12, never a truncated
tuple or exception.

`voicing.family_unavailable` carries family, class, formula rule, and exactly
`quality-family-unsupported` or `quartal-row-undeclared`. It never substitutes
another family. No failure falls back to C major, arbitrary source notes, a
generic spread, or the literal altered realization.

## 14. State and applicability

V0 is one synchronous function call. It has no queued, running, canceled,
resumed, stale, degraded, or partially committed state. Cancellation and stale
document revision are not applicable here; application orchestration owns them
before invoking V0 or before applying its result. Browser/audio/storage state
is not applicable. V1 owns neighbors, voice arcs, voice IDs, locks, transition
costs, and progression optimization.

No request field may contain `previous`, `next`, event/document revision,
voice ID, wall-time budget, UI selection, audio state, or storage identity.
Such values cannot affect V0 output through ambient state.

## 15. V0/spec authority package and later exit coverage

V0/spec checks in the following independently authored, pre-production
authority and representative case specifications under
`tests/fixtures/voicing/`. They freeze decisions and expected outcomes; their
presence does not claim that the V0/build engine exists, that cases were
executed against production, or that the full independent-proof exit gate has
passed:

- `v0-voicing-contract.json`: identities, request/result schemas, refusal and
  constraint precedence, orderings, counters, caps, and applicability;
- `family-templates.json`: compact normative policy authority for the three
  adaptive selectors, exact fixed Shell/Rootless sequences, request-owned
  Quartal sequence mode, unavailable-policy closure, identity rules, counts,
  omissions, doublings, bass policies, and companion register policies. Its
  deterministic materialization covers all 112 semantic applicability
  positions without pretending that 112 verbose records are checked in;
- `availability-matrix.json`: all 1,295 seed/family/count cells;
- `candidate-cases.json`: exact candidate membership, pitches, degrees, source
  indices, provenance, bass treatment, family transforms, omissions/doublings,
  and compact refusal and stored-bypass facts. Full ordering/score, work-limit,
  and operation-state evidence belongs to the corresponding law, limit, and
  operation-state fixtures;
- `law-cases.json`: representative positive, near-miss, replay, immutability,
  refusal, boundary, and transposition case specifications and links;
- `limit-cases.json`: exact-limit and exact-plus-one expected boundary cases for
  every work and memory counter plus minimum, exact-maximum, and plus-one
  Unicode-code-point and UTF-8-byte identifier recipes;
- `transposition-seeds.json`: contract-selected project seeds and all-root and
  inverse recipes without production-generated expected values;
- `mutation-controls.json`: semantic counterfactual definitions and their
  intended killing case IDs;
- `provenance-ledger.json`: declared claim authority and derivation lineage;
- `trace-ledger.json`: declared reciprocal
  invariant-to-case-to-mutation-to-authority links;
- `operation-state-cases.json`: expected stored zero-work and explicit
  not-applicable cancellation/stale/browser/audio/storage records.

Every hand-authored independent expectation fixture declares:

```json
{
  "status": "independently-authored-pre-production",
  "productionOutputUsed": false,
  "expectedValuesGenerated": false
}
```

That status means independent of the production implementation; it does not
claim a human or expert review.

`availability-matrix.json` is the sole mechanical-expansion exception. It may
declare `expectedValuesGenerated: true` only because it is the complete
Cartesian expansion of checked-in pre-production seed and policy authority. It
must also declare `productionGeneratedExpectedValues: false`, retain
`productionOutputUsed: false`, record that no production module was imported or
executed, name every judgment-bearing input, and publish reproducible semantic
projection hashes. Generated-by-production and mechanically-expanded-from-
independent-authority are different claims; only the latter is permitted.

### 15.1 V0/build and independent-proof exit coverage

The following is a later exit obligation, not a V0/spec completion claim. The
V0/build and independent-proof leaves must execute and validate, for every
supported template row, a roomy-range exact golden, every
supported voice count, exact low/high placement boundaries, a one-semitone-too-
tight range, every legal bass/slash state, legal and illegal doubling, duplicate
MIDI rejection, deterministic replay, recursive immutability, and at least one
spelling-aware transposition seed.

Exit coverage additionally proves:

- all 1,295 availability cells and all 112 semantic applicability scan
  positions;
- all 42 family by slash-state by bass-policy states inherited from F1;
- each altered realization separately, including coincident-degree variants;
- Drop-2 for 4-7 voices, count 3 refusal, exact second-from-top lowering,
  source/output span, order, and post-transform range/bass failure;
- Quartal exact evidence, the two-member generated-slash upper dyad,
  absent/unexpected/malformed evidence, every invalid reason, every declared
  and undeclared class, and a tertian impostor;
- generated, external, and none bass semantics, including exact slash spelling;
- Manual/Frozen compile-time exclusion from generation and 24 literal zeros;
- every spacing boundary and every numeric cap at exact and exact-plus-one;
- no elapsed-time cutoff and no ambient previous/next influence.

Transposition seeds include major-13 Rootless A, dominant-13 Rootless B,
minor-13 Rootless A/B, diminished-7 Shell preserving `bb7`, minor-major Shell,
suspended-13 Rootless, Drop-2 major-7, generated slash bass, all four altered
IDs, every declared Quartal template, the non-cyclic Cmaj7 selected-degree
register weave, and the Cmaj7/major-third external-bass observation overflow
with range transposed together. Expand all 18 seeds through the same 12-root
spelling set used by T1 for 216 cells, transpose range and context together, then
inverse-transpose. Keep separate C-sharp and D-flat seeds so MIDI equality
cannot erase spelling.

`V0-TRANS-017` uses the Cmaj7 weave projection in a normalized C range of
`[60,84]`, then shifts both inclusive endpoints by the root's chromatic delta.
Across all 12 spelled roots it freezes selected order `[1,3,5,7]`, sounding
order `[1,5,7,3]`, relative MIDI `[0,7,11,16]`, nine raw and nine retained
candidates, raw ordinal 4, retained ordinal 7, and template-order displacement
4. The normalized range keeps every lower MIDI at or above 60 so a low-register
spacing-band transition cannot masquerade as register-weave transposition
drift. This transposition proof complements the original-range
`V0-CAND-001` raw-ordinal-6 witness; it does not replace it.

## 16. Mutation and trace contract

The provenance ledger uses these stable authority IDs:

```text
V0-AUTH-CONTRACT            this V0 project contract
V0-AUTH-F1                  inherited domain voicing and bass laws
V0-AUTH-T1                  exact realization, role, spelling, and ID laws
V0-AUTH-DROP2               supporting Drop-2 transform definition only
V0-AUTH-TEMPLATES           versioned project family-template decisions
V0-AUTH-SPACING             versioned project numeric spacing decisions
V0-AUTH-LIMITS              work/memory, payload, identifier, and termination decisions
V0-AUTH-INDEPENDENCE        oracle and mutation-testing policy
```

Each authority record names its source URI or repository path, version or
access date, exact claim IDs, trace IDs, and authority class. Case and mutation
links live in the reciprocal trace and mutation ledgers. The Kunjara source
record under `V0-AUTH-DROP2` and the Open Music Theory source records under
`V0-AUTH-TEMPLATES` and `V0-AUTH-SPACING` are supporting-only; they cannot be
used to claim that numeric or template policy received external review.

The minimum mutation inventory is:

```text
V0-MUT-001 omit identity tone
V0-MUT-002 omit guide third/suspension
V0-MUT-003 omit seventh
V0-MUT-004 promote optional fifth to mandatory
V0-MUT-005 fabricate absent 9/11/13
V0-MUT-006 normalize #9 to b3
V0-MUT-007 normalize bb7 to 6
V0-MUT-008 respell during register lift
V0-MUT-009 accept duplicate exact MIDI
V0-MUT-010 accept undeclared octave doubling
V0-MUT-011 return wrong total voice count
V0-MUT-012 sound or count external bass
V0-MUT-013 place slash bass above another voice
V0-MUT-014 accept enharmonic slash spelling
V0-MUT-015 accept slash bassPolicy none
V0-MUT-016 accept non-external rootless policy
V0-MUT-017 insert root into rootless output
V0-MUT-018 lower wrong Drop-2 voice
V0-MUT-019 lower Drop-2 voice by 24
V0-MUT-020 relabel generic spread as Drop-2
V0-MUT-021 skip Drop-2 revalidation
V0-MUT-022 accept Quartal without evidence
V0-MUT-023 relabel tertian stack as Quartal
V0-MUT-024 accept incompatible Quartal evidence
V0-MUT-025 select altered realization implicitly
V0-MUT-026 merge altered realizations
V0-MUT-027 invoke generation for Manual
V0-MUT-028 regenerate Frozen pitches or metadata
V0-MUT-029 fallback to C major/arbitrary notes
V0-MUT-030 move a range boundary by one
V0-MUT-031 invert a low-spacing comparison
V0-MUT-032 make candidate order nondeterministic
V0-MUT-033 allow raw candidate 97
V0-MUT-034 retain candidate 25
V0-MUT-035 reverse final tie break
V0-MUT-036 deduplicate spelling-distinct MIDI
V0-MUT-037 transpose chromatically without spelling
V0-MUT-038 fail inverse transposition
V0-MUT-039 mutate an input
V0-MUT-040 return mutable output
V0-MUT-041 let previous/next change V0 output
V0-MUT-042 let wall time change candidate membership
V0-MUT-043 replace the selected-degree register weave with cyclic rotations
V0-MUT-044 promote selected-realization cardinality into the template minimum
V0-MUT-045 deduplicate unsatisfied observations by code only
V0-MUT-046 count an exact duplicate as a distinct observation
V0-MUT-047 truncate the no-result report to its first 16 observations
V0-MUT-048 make provisional observation overflow reject a later legal candidate
V0-MUT-049 ignore reason in observation identity or frozen reason precedence
V0-MUT-050 apply the seven-semitone Drop-2 gap heuristic to dense six- and seven-voice results
V0-MUT-051 assume a filled Drop-2 row is structurally feasible from exact-degree count alone
```

Each control names at least one direct killing case, any corroborative cases
with non-killing reasons, applicable trace IDs, and authority IDs. Merely
mentioning a mutation in prose is not proof. At V0/spec these are declarative
case links; V0/build plus independent proof must execute the controls and show
that the named direct cases actually kill them.

`killedByCaseIds` contains only detector-applicable direct links.
`corroboratedByCaseIds` and `corroborativeLinks`, when present, name adjacent
evidence that supports the same boundary but cannot be changed by the literal
operator; each such link carries a stable reason code and explanation.
`reviewedCaseLinkOrder` freezes the direct-then-corroborative review order. In
particular, the selected `alt-b9-b5` candidate corroborates exact altered
spelling but cannot kill a `#9`-to-`b3` operator, and a shallow returned-child
probe corroborates immutability but cannot kill caller-request mutation.

The reciprocal trace ledger contains at least:

```text
V0-TRACE-BOUNDARY
V0-TRACE-ALT-SELECTION
V0-TRACE-FAMILIES
V0-TRACE-DEGREES
V0-TRACE-BASS
V0-TRACE-SPACING
V0-TRACE-DROP2
V0-TRACE-QUARTAL
V0-TRACE-ORDERING
V0-TRACE-LIMITS
V0-TRACE-BYPASS
V0-TRACE-TRANSPOSITION
V0-TRACE-REFUSAL
V0-TRACE-IMMUTABILITY
V0-TRACE-DETERMINISM
```

`V0-TRACE-FAMILIES` covers the static matrix and the Balanced, Shell,
Rootless, Open, and general family laws; `V0-TRACE-ORDERING` covers the
selected-degree register weave, raw generation order, candidate equivalence,
local score, and tie order. The other IDs keep the same umbrella meaning used
by `candidate-cases.json`, `law-cases.json`, and `mutation-controls.json`;
aliases are not silently introduced.

Every parent invariant and success criterion links to cases; every case links
back to traces and authorities; every semantic mutation links to a killing
case; every judgment-bearing expected value names its provenance class. The
checked-in ledgers declare this graph; the independent-proof exit validator
must establish reciprocal link integrity and executed-case results.

## 17. Forbidden shortcuts and implementation handoff

An implementation is nonconforming if it:

- imports H0/content or any adapter instead of accepting typed Quartal evidence;
- generates a degree absent from the explicitly selected realization;
- chooses, merges, or silently replaces an altered realization;
- uses source-text substring tests or pitch-class-only equality;
- repairs spelling, range, bass policy, Manual, or Frozen data;
- counts an external bass or invents a degree for slash bass;
- rotates a fixed Shell/Rootless/Quartal sequence;
- calls a spread “Open,” “Drop-2,” or “Quartal” without the exact structural
  law;
- drops a required identity/guide tone without an explicit fixed template;
- allows exact MIDI unison or undeclared doubling;
- changes search membership because of wall time, machine speed, neighbors,
  UI state, or random order;
- truncates at a cap and presents the partial set as complete;
- derives fixtures, goldens, exclusions, or expected hashes from production;
- adds V1 voice IDs, transition costs, previous/next context, progression
  search, UI, audio, MIDI, storage, or application semantics to V0.

The V0/build implementer should be able to implement `realizeVoicing` and the
independent verifier should be able to reject every shortcut above using only
this document, the public contract module, and the checked-in V0 fixtures.
