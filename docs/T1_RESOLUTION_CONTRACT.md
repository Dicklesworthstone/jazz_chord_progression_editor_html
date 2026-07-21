# T1 Chord Resolution and Spelling Contract

Status: implementation handoff for `T1/spec`

This document is the self-contained production and independent-verification
contract for T1. The public TypeScript surface is
`src/theory/resolution-contract.ts`. The work-evidence surface in
`src/theory/resolution-evidence-contract.ts` is a package-private verification
seam and is not a second production API. An implementation or verification
agent must not need `REBUILD_PLAN.md` to decide a formula, role, spelling,
ordering, refusal, or resource outcome.

T1 resolves an already-typed `ChordSpec` or `CustomChordSpec`. It does not
parse or format symbols, infer a key, choose a voicing or altered-dominant
audition, mutate a document, allocate an ID, call a browser/audio/storage
adapter, or publish a `ValidatedDocument`.

## 1. Ownership and dependency boundary

T1 belongs to `theory`, imports only the public `domain` entry point, and is
pure. Production resolution must not import syntax fixtures, test support,
content, application state, UI, playback, audio, persistence, export, browser
APIs, or the compiled Harmonic Atlas. T0 owns text-to-`ChordSpec` syntax; F1
owns spelling-first values and their local invariants; F3 later composes T1
with document semantic validation.

The T1 specification leaf owns contracts and independent authority data only.
It must contain no production resolver or spelling implementation disguised as
a fixture validator. The build leaf implements the two operations against this
contract. The verify leaf authors its production adapter, properties, mutation
harness, and evidence ledger independently.

All returned objects and arrays are recursively immutable. No operation mutates,
sorts, freezes as a side effect, or otherwise changes an input object or input
array. `sourceText` is neither reparsed nor treated as formula authority.

## 2. Versioned identity and public surface

The exact public identifiers are:

| Meaning | ID | Version |
|---|---|---:|
| resolution contract | `changes.theory.resolution-contract.v1` | encoded in ID |
| resolved chord schema | `changes.theory.resolved-chord.v1` | encoded in ID |
| formula table | `changes.chord-formulas` | 1 |
| degree spelling policy | `changes.degree-spelling` | 1 |
| Balanced role policy | `changes.balanced-degree-roles` | 1 |

`ResolutionOperations` is the complete callable production surface, in this
fixed declaration order:

```ts
interface ResolutionOperations {
  readonly spellChordDegree: (
    root: SpelledPitchClass,
    degree: ChordDegree,
  ) => DegreeSpellingResult;

  readonly resolveChord: ResolveChord;
}

interface ResolveChord {
  <Pitches extends NonEmptySpelledPitchClassTuple>(
    source: CustomChordSpecWithPitches<Pitches>,
  ): CustomResolveChordResult<Pitches>;
  (source: ChordSpec): ParsedResolveChordResult;
  (source: ChordSpec | CustomChordSpec): ResolveChordResult;
}
```

The overloads are normative. A parsed call cannot statically return a custom
realization; a custom call cannot return a formula refusal or parsed
realization, and it preserves the exact input pitch tuple length in the output
pitch-class tuple. The success-only custom overload accepts only a statically
nonempty tuple of one through sixteen pitches; a wider `CustomChordSpec` reaches
only the union overload. The union overload exists only for already-union-typed
callers after both exact branches have been declared.

`DegreeSpelling` carries the spelling-policy ID and version, the exact input
root and degree, the degree-correct `spelled` pitch class, and its `pitchClass`
projection. A failed spelling contains only a typed refusal and no repaired
pitch.

A successful `ResolvedChord` carries these flat metadata fields on both parsed
and custom results:

```ts
{
  schema: 'changes.theory.resolved-chord.v1';
  formulaTableId: 'changes.chord-formulas';
  formulaTableVersion: 1;
  degreeSpellingPolicyId: 'changes.degree-spelling';
  degreeSpellingPolicyVersion: 1;
  degreeRolePolicyId: 'changes.balanced-degree-roles';
  degreeRolePolicyVersion: 1;
}
```

Every semantic realization carries `kind: 'semantic'`, a stable realization
`id`, a stable `formulaRuleId`, canonical `degrees`, role subsets, and
index-aligned `spelledPitchNames` and `pitchClasses`. Ordinary parsed chords
return the exact one-element tuple `[literal]`. Altered dominant returns the
exact four-element tuple specified in Section 7. Custom returns `[custom]`.

The essential result branches are:

```ts
type IndexAlignedTuple<Source extends readonly unknown[], Value> = {
  readonly [Index in keyof Source]: Value;
};

type ImmutableTuple<Source extends readonly unknown[]> = {
  readonly [Index in keyof Source]: Source[Index];
};

type SemanticRealization<
  Id extends SemanticRealizationId,
  Degrees extends readonly [ChordDegree, ...ChordDegree[]],
> = Id extends SemanticRealizationId
  ? Readonly<{
      kind: 'semantic';
      id: Id;
      formulaRuleId:
        Id extends 'literal' ? LiteralFormulaRuleId : 'altered-dominant';
      degrees: ImmutableTuple<Degrees>;
      requiredDegrees: readonly Degrees[number][];
      optionalDegrees: readonly Degrees[number][];
      guideToneDegrees: readonly Degrees[number][];
      spelledPitchNames: IndexAlignedTuple<Degrees, SpelledPitchClass>;
      pitchClasses: IndexAlignedTuple<Degrees, PitchClass>;
    }>
  : never;

type CustomRealization = Readonly<{
  kind: 'custom';
  id: 'custom';
  formulaRuleId: 'custom';
  degrees: null;
  requiredDegrees: null;
  optionalDegrees: null;
  guideToneDegrees: null;
  spelledPitchNames: readonly [SpelledPitchClass, ...SpelledPitchClass[]];
  pitchClasses: readonly PitchClass[]; // same tuple length
  limitations: readonly [
    'custom.no_degree_analysis',
    'custom.no_auto_voicing',
  ];
}>;

type ParsedResolvedChord = ResolvedChordMetadata & Readonly<{
  source: ChordSpec;
  realizations:
    | readonly [LiteralSemanticRealization]
    | AlteredDominantRealizationTuple;
  bass: SpelledPitchClass | null;
  warnings: TheoryWarnings;
}>;

type CustomResolvedChord = ResolvedChordMetadata & Readonly<{
  source: CustomChordSpec;
  realizations: readonly [CustomRealization];
  bass: SpelledPitchClass | null;
  warnings: readonly [];
}>;

type ResolvedChord = ParsedResolvedChord | CustomResolvedChord;
```

The exported generic tuple types make projection lengths compile-time aligned
and normalize even a mutable input tuple to readonly output fields. The
conditional is deliberately distributive: for semantic IDs, `literal`
excludes the `altered-dominant` and `custom` rule IDs, while every `alt-*` ID
fixes `formulaRuleId: 'altered-dominant'`.

The closed formula-rule vocabulary is:

```text
base-major                 base-minor
base-diminished            base-augmented
base-sus2                  base-sus4
base-power                 sixth-major
sixth-minor                seventh-major
seventh-dominant           seventh-minor
seventh-minor-major        seventh-half-diminished
seventh-diminished         seventh-augmented-major
extension-major            extension-dominant
extension-minor            extension-suspended-dominant
altered-dominant           custom
```

The custom realization has `formulaRuleId: 'custom'`, null degree and role
fields, exact input-order pitch names and projections, and exactly these
limitations in this order:

```text
custom.no_degree_analysis
custom.no_auto_voicing
```

## 3. Exact result, warning, and refusal contract

Every fallible operation returns `{ ok: true, value }` or
`{ ok: false, refusal }`. Failure never contains a partial realization,
partial spelling, warnings, or an implicitly selected alternate formula.

The only T1 warning is `theory.omission_absent`. It carries its input-relative
`path`, absent degree number `3`, and explanatory prose. Every declared v1
family contains a natural or altered degree 5, and structural alteration still
leaves a degree 5, so `no5` always removes something. Only `no3` on an already
thirdless family can be absent. At most one warning is therefore reachable.
Warning code, path, and degree number are contract data; human-readable
`message` prose may improve without becoming a comparison key.

The exact refusal vocabulary is:

```text
theory.formula_family_unsupported
theory.sixth_invalid
theory.extension_invalid
theory.addition_invalid
theory.alteration_invalid
theory.omission_invalid
theory.modifier_conflict
theory.color_policy_invalid
theory.spelling_accidental_out_of_range
limit.theory_realization_degrees_exceeded
```

Stable refusal payloads are those exported by `resolution-contract.ts`:

- formula refusals carry the applicable formula phase and parsed-chord rule ID;
  `custom` is excluded because custom resolution has no formula-refusal branch;
- invalid sixth reason is `alteration | family`;
- invalid extension reason is `count | number | alteration | family`;
- invalid addition reason is `count | number | alteration`;
- invalid alteration reason is `count | number | alteration`;
- invalid omission reason is `count | number`;
- modifier conflicts carry `leftPath` and `rightPath` plus one of
  `sixth-with-seventh`, `sixth-with-extension`, `addition-omission`,
  `alteration-omission`, or `structural-alteration-pair`;
- the conflict discriminant fixes its phase: either sixth conflict is `base`,
  addition/omission is `additions`, and either fifth conflict is
  `structural-alterations`;
- invalid altered color policy uses reason `requires-dominant-seventh` or
  `explicit-five-or-nine-alteration` and always records the received policy as
  `altered-dominant`;
- spelling refusal carries the spelling-policy ID/version, exact root and
  degree, computed unsupported alteration, and supported minimum/maximum;
- the output-limit refusal carries observed and maximum degree counts and has
  the exact phase `canonicalization`.

The public runtime-frozen `THEORY_REFUSAL_PRECEDENCE` is a compile-time checked
full permutation of `THEORY_REFUSAL_CODES`. The resolver uses this exact
first-refusal order. Within an array, source array index order wins:

1. validate `sixth`;
2. validate `extensions` in index order, including the first excess entry;
3. validate `additions` in index order, including the first excess entry;
4. validate `alterations` in index order, including the first excess entry;
5. validate `omissions` in index order, including the first excess entry;
6. validate base-family compatibility;
7. validate altered color-policy compatibility;
8. detect cross-category conflicts in the conflict-vocabulary order above;
9. enforce the per-realization output bound;
10. spell in realization order, then canonical degree order.

Equivalently, the winning code sequence is:

```text
theory.sixth_invalid
theory.extension_invalid
theory.addition_invalid
theory.alteration_invalid
theory.omission_invalid
theory.formula_family_unsupported
theory.color_policy_invalid
theory.modifier_conflict
limit.theory_realization_degrees_exceeded
theory.spelling_accidental_out_of_range
```

This order compares only refusals that are independently discoverable from the
validated prefix. Extension-family compatibility is not discoverable until the
triad/seventh family prefix itself is supported. Therefore a power triad with
an unsupported minor seventh and an additional ninth refuses at `['seventh']`
as `theory.formula_family_unsupported`; the resolver does not skip that first
incompatible family field to manufacture a competing `extension_invalid`.
`T1-FAMILY-STATE-SENTINEL-001` freezes this distinction.

Within one refusal code, the public, deeply frozen
`THEORY_REFUSAL_REASON_PRECEDENCE` is equally normative. The exact order is:

```text
sixth:       alteration, family
extension:   count, number, alteration, family
addition:    count, number, alteration
alteration:  count, number, alteration
omission:    count, number
colorPolicy: requires-dominant-seventh, explicit-five-or-nine-alteration
```

The first excess collection member therefore reports `count` even when that
same domain-valid record also has an invalid number or alteration. For a
non-excess member, number is checked before alteration, local shape is checked
before family compatibility, and the dominant-seventh prerequisite is checked
before explicit altered-color conflicts. `T1-OPSTATE-007` contains exact
multi-reason contests as well as full public refusal payloads for all four
first-excess boundaries. Together they witness all ten adjacent same-code
reason pairs, including count over number for extension, addition, alteration,
and omission.

`T1-OPSTATE-010` makes this executable as nine adjacent pairwise contests.
It also freezes lowest source-array index and every adjacent pair in the
five-item modifier-conflict sub-order, including cases where ignoring the
earlier conflict would expose the 17-degree limit and where ignoring the limit
would expose a spelling refusal. Every row contains the complete winning public
refusal and an independently interpreted input recipe that must actually
trigger both contenders.

This operational precedence is more precise than the declaration order of the
code strings. A malformed `ChordSpec` is never repaired into the nearest
supported family. In particular, a programmatically constructed minor triad
with major seventh and a ninth extension is refused: `CmMaj9` is not a T1
family. This agrees with T0's `symbol.extension_conflict` and
`symbol.ast_unformattable` treatment; T1 does not revive that rejected syntax.

Local field validation is exact. `sixth` is null or natural degree 6 and is
family-compatible only with a major or minor base triad. Its `family` reason
means that the base triad itself cannot take a sixth; it does not consume the
separate `sixth-with-seventh` or `sixth-with-extension` conflicts. Those two
cross-category combinations deliberately survive local validation and formula
selection so the later `theory.modifier_conflict` branch remains reachable.
`extensions` has at most one natural member numbered 9, 11, or 13.
`additions` has at most seven natural members drawn from 2, 3, 4, 6, 9, 11,
and 13. `alterations` has at most eight members: flat or sharp 5, 9, 11, or
13. `omissions` has at most two members, 3 and 5. These are input collection
bounds, not permission for a cross-category conflict; the later compatibility
and conflict stages still refuse an invalid combination.

An invalid alteration's diagnostic phase is deterministic: number 9, 11, or
13 belongs to `color-alterations`; every other number, including an invalid
number and degree 5, belongs to `structural-alterations`. This classification
chooses the phase only; it never makes an invalid number acceptable.

Refusal paths are input-relative and frozen as follows:

- sixth validation uses `['sixth']`;
- an array member, including the first excess member, uses
  `[field, index]` for `extensions`, `additions`, `alterations`, or `omissions`;
- an unsupported base family points to the first incompatible family-defining
  input in `triad`, `sixth`, `seventh`, then `extensions` precedence. A
  suspension is represented by `ChordSpec.triad`, not by a nonexistent
  `suspension` property, so its concrete path is `['triad']`. An incompatible
  extension normally already wins as `theory.extension_invalid` with reason
  `family` at `['extensions', index]`;
- color-policy incompatibility uses `['colorPolicy']`;
- a modifier conflict's top-level `path` equals `leftPath`; `leftPath` and
  `rightPath` are ordered by formula phase, then source index, using the field
  declaration order in `ChordSpec` for scalar ties;
- the output degree limit is a whole-result bound and uses `[]`;
- standalone `spellChordDegree` failure uses `['degree']`;
- resolver spelling failure preserves the winning degree's input provenance:
  an explicit modifier uses its array-member path. Every v1 base-formula degree
  is spellable from an unaltered root; consequently a base-degree accidental
  overflow is caused by the written root and uses `['root']`. There is no
  separate unreachable family-field spelling path in v1. If canonicalization
  merged exact duplicates, an explicit modifier path wins only when that
  modifier is what makes the retained degree unspellable; otherwise the root
  owns the base-degree overflow.

No diagnostic path names a synthetic candidate, realization index, formatted
token, or source-text range that is absent from the operation input.

## 4. Canonical arrays, ordering, and role laws

Canonical degree order is ascending degree number using the domain's declared
degree-number order, then ascending alteration. Thus `b9`, `9`, `#9` remain
three distinct degree records in that order; pitch-class equality never merges
them. Exact duplicate degree records are collapsed only in formula phase 7.

For a semantic realization:

- `degrees` is nonempty, duplicate-free, and canonical;
- `requiredDegrees` and `optionalDegrees` are duplicate-free canonical subsets
  of `degrees`, are disjoint, and together cover `degrees` exactly;
- `guideToneDegrees` is a duplicate-free canonical subset of
  `requiredDegrees`;
- `spelledPitchNames.length === pitchClasses.length === degrees.length`;
- item `i` in both projection arrays is derived from `degrees[i]` without a
  reorder, enharmonic substitution, or omitted duplicate;
- every returned semantic degree record belongs to that realization; mutable
  candidate records never leak into output.

The Balanced role policy is exact:

- root is required;
- a base major or minor third is required and a guide;
- an ordinary perfect fifth is optional;
- the fifth is required for power, diminished, augmented, half-diminished,
  diminished-seventh, and augmented-major-seventh identities;
- every seventh, including `bb7`, is required and a guide;
- a sixth is required; the 9 in a lexical 6/9 family is optional;
- the highest named 9/11/13 extension is required and intervening extension
  closure is optional;
- every accepted explicit addition or alteration is required;
- a suspension degree is required and a guide;
- generic `add3` is required but is not promoted to a guide merely because it
  is degree 3;
- an omission removes every same-number degree and every associated role from
  every realization; it warns only if there was nothing to remove;
- slash bass is outside every degree and role array.

When canonicalization merges the same degree from several sources, required
dominates optional, while guide status is the union of the contributing facts.
The special 6/9 policy keeps its natural 9 optional. Differently altered
degrees of one number are never duplicates.

## 5. Normative base formula table

Degree tokens below are spelling-first identities, not pitch-class aliases.
All 33 rows are mandatory all-root `matrixSeed` families. An earlier inventory
counted 32 by accidentally omitting the already-declared major-eleventh family;
the normative table and corpus correct that arithmetic rather than turning the
omission into a product rule.

Every machine-readable row also carries an exact `match` over `ChordSpec`
facts: `triad`, `sixth`, `seventh`, `extensions`, the lexical 6/9 `additions`
fact, and `colorPolicy`. Matching never reads `sourceText`. Empty arrays and
nulls are significant. Ordinary later modifiers are outside the family match;
the one exception is natural added 9 paired with a sixth, because that exact
typed fact is the 6/9 family. Valid `ChordSpec` degree arrays are internally
duplicate-free, so the matcher consumes that unique record: the selected base
phase inserts it once as optional, and phase 5 skips it while processing every
sibling addition normally as required. Presence, not array
exclusivity, is the marker, so `C6/9(add2)` remains the 6/9 family plus required
add2. The marker is visited once during input preflight and inserted once; it
is never counted or role-merged a second time. A row's displayed degrees and
roles are its final canonical output before unrelated explicit modifiers.

Rule selection is deterministic even on a refused input. Begin with the exact
triad rule; advance to a compatible sixth rule, then a compatible seventh rule,
then a compatible highest-extension rule, and finally altered dominant. A
refusal's `ruleId` is the most specific compatible prefix reached before its
winning invalid field. Thus an unsupported minor-major ninth names
`seventh-minor-major`, while a sixth incompatible with a diminished triad names
`base-diminished`. A declared cross-category conflict retains the earlier
selected rule (`sixth-major` or `sixth-minor` for either sixth conflict) and is
deferred to the conflict phase. No arbitrary nearest row or source spelling may
supply a refusal rule ID. The one explicit attempted-rule exception is
`theory.color_policy_invalid`: because that diagnostic is specifically about a
requested `altered-dominant` policy, its `ruleId` is always
`altered-dominant`, even when the most specific compatible musical prefix is a
plain base or seventh rule.

Suspended rows additionally carry a `basePhase` record. It is the corresponding
unsuspended major or dominant skeleton, including its pre-suspension third and
roles. Phase 2 removes all degree-3 candidates and their roles, then inserts the
declared 2 or 4 as required and guide. Non-suspended rows have `basePhase`
identical to their final row. These explicit before/after records freeze both
the transformation and its work counters.

Altered dominant has its own exact match and four keyed `basePhase` records,
one for each stable realization ID. Family selection creates all four seeds in
the public order; it does not first create a hidden literal realization or use
one variant as another's oracle. Phase 4 subsequently handles only accepted
explicit 11/13 colors and the declared 5/9-policy refusals. This makes all
eight transitions, base insertions, and later transformations countable per
realization.

| Fixture ID | Family ID | C-root form | Degrees | Required | Optional | Guides |
|---|---|---|---|---|---|---|
| T1-FORMULA-001 | major-triad | C | 1 3 5 | 1 3 | 5 | 3 |
| T1-FORMULA-002 | minor-triad | Cm | 1 b3 5 | 1 b3 | 5 | b3 |
| T1-FORMULA-003 | diminished-triad | Cdim | 1 b3 b5 | 1 b3 b5 | - | b3 |
| T1-FORMULA-004 | augmented-triad | Caug | 1 3 #5 | 1 3 #5 | - | 3 |
| T1-FORMULA-005 | sus2-triad | Csus2 | 1 2 5 | 1 2 | 5 | 2 |
| T1-FORMULA-006 | sus4-triad | Csus4 | 1 4 5 | 1 4 | 5 | 4 |
| T1-FORMULA-007 | power-triad | C5 | 1 5 | 1 5 | - | - |
| T1-FORMULA-008 | major-sixth | C6 | 1 3 5 6 | 1 3 6 | 5 | 3 |
| T1-FORMULA-009 | minor-sixth | Cm6 | 1 b3 5 6 | 1 b3 6 | 5 | b3 |
| T1-FORMULA-010 | major-six-nine | C6/9 | 1 3 5 6 9 | 1 3 6 | 5 9 | 3 |
| T1-FORMULA-011 | minor-six-nine | Cm6/9 | 1 b3 5 6 9 | 1 b3 6 | 5 9 | b3 |
| T1-FORMULA-012 | major-seventh | Cmaj7 | 1 3 5 7 | 1 3 7 | 5 | 3 7 |
| T1-FORMULA-013 | dominant-seventh | C7 | 1 3 5 b7 | 1 3 b7 | 5 | 3 b7 |
| T1-FORMULA-014 | minor-seventh | Cm7 | 1 b3 5 b7 | 1 b3 b7 | 5 | b3 b7 |
| T1-FORMULA-015 | minor-major-seventh | Cm(maj7) | 1 b3 5 7 | 1 b3 7 | 5 | b3 7 |
| T1-FORMULA-016 | half-diminished-seventh | Cm7b5 | 1 b3 b5 b7 | 1 b3 b5 b7 | - | b3 b7 |
| T1-FORMULA-017 | diminished-seventh | Cdim7 | 1 b3 b5 bb7 | 1 b3 b5 bb7 | - | b3 bb7 |
| T1-FORMULA-018 | augmented-major-seventh | Caug(maj7) | 1 3 #5 7 | 1 3 #5 7 | - | 3 7 |
| T1-FORMULA-019 | major-ninth | Cmaj9 | 1 3 5 7 9 | 1 3 7 9 | 5 | 3 7 |
| T1-FORMULA-020 | dominant-ninth | C9 | 1 3 5 b7 9 | 1 3 b7 9 | 5 | 3 b7 |
| T1-FORMULA-021 | minor-ninth | Cm9 | 1 b3 5 b7 9 | 1 b3 b7 9 | 5 | b3 b7 |
| T1-FORMULA-022 | dominant-eleventh | C11 | 1 3 5 b7 9 11 | 1 3 b7 11 | 5 9 | 3 b7 |
| T1-FORMULA-023 | minor-eleventh | Cm11 | 1 b3 5 b7 9 11 | 1 b3 b7 11 | 5 9 | b3 b7 |
| T1-FORMULA-024 | dominant-thirteenth | C13 | 1 3 5 b7 9 11 13 | 1 3 b7 13 | 5 9 11 | 3 b7 |
| T1-FORMULA-025 | major-thirteenth | Cmaj13 | 1 3 5 7 9 11 13 | 1 3 7 13 | 5 9 11 | 3 7 |
| T1-FORMULA-026 | minor-thirteenth | Cm13 | 1 b3 5 b7 9 11 13 | 1 b3 b7 13 | 5 9 11 | b3 b7 |
| T1-FORMULA-027 | dominant-seven-sus2 | C7sus2 | 1 2 5 b7 | 1 2 b7 | 5 | 2 b7 |
| T1-FORMULA-028 | dominant-nine-sus2 | C9sus2 | 1 2 5 b7 9 | 1 2 b7 9 | 5 | 2 b7 |
| T1-FORMULA-029 | dominant-thirteen-sus2 | C13sus2 | 1 2 5 b7 9 11 13 | 1 2 b7 13 | 5 9 11 | 2 b7 |
| T1-FORMULA-030 | dominant-seven-sus4 | C7sus4 | 1 4 5 b7 | 1 4 b7 | 5 | 4 b7 |
| T1-FORMULA-031 | dominant-nine-sus4 | C9sus4 | 1 4 5 b7 9 | 1 4 b7 9 | 5 | 4 b7 |
| T1-FORMULA-032 | dominant-thirteen-sus4 | C13sus4 | 1 4 5 b7 9 11 13 | 1 4 b7 13 | 5 9 11 | 4 b7 |
| T1-FORMULA-033 | major-eleventh | Cmaj11 | 1 3 5 7 9 11 | 1 3 7 11 | 5 9 | 3 7 |

Literal result rule IDs map exactly as follows. The seven triads use
`base-major`, `base-minor`, `base-diminished`, `base-augmented`, `base-sus2`,
`base-sus4`, and `base-power`. Major/minor sixth and 6/9 rows use
`sixth-major` or `sixth-minor`. The seven seventh rows use, in table order,
`seventh-major`, `seventh-dominant`, `seventh-minor`,
`seventh-minor-major`, `seventh-half-diminished`, `seventh-diminished`, and
`seventh-augmented-major`. Major, dominant, and minor 9/11/13 rows use
`extension-major`, `extension-dominant`, or `extension-minor`. All six
suspended-dominant rows use `extension-suspended-dominant`.

The extension field stores only the highest named extension. T1 supplies
closure: 9 adds `9`; 11 adds `9, 11`; 13 adds `9, 11, 13`. It does not infer a
different seventh quality. Minor-major is supported only as the declared
seventh family. Half-diminished, diminished, augmented-major, power, and
suspended dominant compatibility is exactly the table; an unsupported higher
family refuses rather than degrading to its triad or seventh.

The mandatory root inventory, in exact fixture order, is:

```text
C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B
```

The corpus is the complete Cartesian product of those 12 roots and the 33
matrix seeds: exactly 396 cells, with no production-derived exclusion list.
Modifier cases are additional evidence, not substitutes for any cell. The
bucket arithmetic is `7 triad + 4 sixth + 7 seventh + 9 extension + 6 suspended
dominant = 33`.

Exact supported rows do not by themselves prove that every other typed family
state refuses instead of falling back. `familyStateMatrix` therefore expands
all 896 combinations of seven triads, absent/natural sixth, four seventh
states, absent/9/11/13 highest extension, absent/present natural add9, and
none/altered color policy over a safe C root. An independent classifier freezes
64 accepted states and the complete refused complement: 320 invalid-sixth,
192 unsupported-family, 140 invalid-extension-family, 120 invalid-color, and
60 sixth-conflict states. It also freezes every attempted public rule-ID count
and overlap sentinels such as unsupported power seventh before extension,
color-policy failure before a sixth conflict, and suspended eleventh refusal.
The fixture additionally freezes a SHA-256 digest of the canonical ordered list
of all 896 input facts and complete expected outcomes; aggregate counts cannot
hide an isolated cell swap.
For every accepted cell, “complete” means the full public `ParsedResolvedChord`
envelope: versioned metadata, exact source passthrough, every ordered
realization, degree and role tuples, directed spellings, pitch classes, bass,
and warnings. Refusals likewise include every code-specific public field. Thus
the digest distinguishes ordinary `C` from `Cadd9`, bare altered dominant from
`C7alt(add9)`, and optional closure from an explicit required duplicate; it is
not merely a family/rule-ID digest.
Natural add9 is a 6/9 family marker only when paired with a sixth; otherwise it
remains an ordinary later addition, including on altered dominant.

## 6. Eight formula phases

Every semantic realization passes through these phases in order. A later phase
may remove or annotate an earlier candidate only as declared here; it may not
reinterpret the source family.

1. **base** selects one rule from its exact `match` and inserts that row's
   explicit `basePhase` candidates with role provenance. Altered dominant
   inserts its four keyed base-phase seeds in stable realization order.
2. **suspension** removes every degree numbered 3, then adds the declared 2 or
   4 as required and guide. A later explicit `add3` may coexist.
3. **structural-alterations** handles only `b5` or `#5`: remove natural 5 and
   add the explicit altered fifth as required. The
   `structural-alteration-pair` conflict applies only when two source
   alteration records explicitly request both `b5` and `#5`. A `b5` or `#5`
   inherited from the selected base family is not one half of that
   source-record conflict and may coexist with the opposite explicit fifth.
4. **color-alterations** handles `b9`, `#9`, `b11`, `#11`, `b13`, and `#13`:
   remove a natural same-number closure degree if present, then add every
   explicit color as required. Opposite alterations of one color degree legally
   coexist; only paired structural fifths conflict.
5. **additions** adds exactly the named natural degree as required. It implies
   no intermediate closure and does not replace a differently altered degree.
   Generic `add3` is required but not a guide. The 6/9 base-policy exception
   keeps its consumed natural-9 family marker optional and skips that one source
   record in this phase; every other addition remains required.
6. **omissions** removes all candidates of the omitted degree number from every
   realization and all role sets. If no such candidate existed, emit the one
   ordered `theory.omission_absent` warning for that omission.
7. **canonicalization** orders by number then alteration and collapses only
   exact duplicates. Differently altered degrees coexist. Required role wins
   over optional on a merge; guide provenance is retained.
8. **spelling** applies the directed diatonic algorithm in Section 8 to every
   retained degree, in realization then degree order. Any refusal discards the
   whole resolution result.

Cross-realization traversal is phase-major and deterministic. For phases 1
through 7, visit every live realization in stable realization-ID order before
advancing to the next phase. Only after all realizations have completed
canonicalization does phase 8 visit realizations in stable order and degrees in
canonical order. The decisive refusal stops traversal immediately. Thus an
altered-dominant spelling failure in the first variant enters 28 construction
and canonicalization phase instances plus that variant's spelling phase: 29
transitions, not 8 or 32. `T1-EVIDENCE-ALTERED-SPELLING-REFUSAL` freezes this
schedule with exact counters.

The syntactically valid cross-category conflicts remain refusals, not order
effects: a sixth with a seventh, a sixth with an extension, an added and omitted
same degree, an altered and omitted fifth, or explicitly paired source
structural alterations. Local
extension-family validation and base-family matching must defer the two
declared sixth conflicts rather than converting them into
`theory.extension_invalid` or `theory.formula_family_unsupported`.

## 7. Altered-dominant ambiguity

`colorPolicy: 'altered-dominant'` is valid only for the exact dominant-seventh
base: major triad, minor seventh, no sixth, and no named extension. It exposes
four realizations in this fixed order:

| ID | Degrees | Required | Optional | Guides |
|---|---|---|---|---|
| alt-b9-b5 | 1 3 b5 b7 b9 | all | - | 3 b7 |
| alt-b9-sharp5 | 1 3 #5 b7 b9 | all | - | 3 b7 |
| alt-sharp9-b5 | 1 3 b5 b7 #9 | all | - | 3 b7 |
| alt-sharp9-sharp5 | 1 3 #5 b7 #9 | all | - | 3 b7 |

Bare `7alt` therefore contains neither natural 5 nor natural 9. T1 never picks,
ranks, or labels one variant as best. A downstream, explicit audition/voicing
policy may choose one and must expose the choice.

Explicit modifiers after the altered-family expansion obey the ordinary later
phases and transform all four variants without changing, merging, or reordering
their stable IDs:

- any explicit 5 or 9 alteration conflicts with altered color policy, because
  it would covertly narrow or restate the four-way ambiguity;
- accepted `b11`, `#11`, `b13`, or `#13` is added as required to every variant;
- natural `add11` or `add13` is added as required to every variant and implies
  no closure;
- `add9` explicitly adds natural 9 alongside each selected altered ninth;
- all other accepted additions apply identically to every variant;
- `no3` or `no5` removes that degree number from every variant; even if this
  makes two degree arrays equal, realization IDs remain distinct and are not
  collapsed;
- an absent omission produces at most its one ordered warning, not one warning
  per variant.

## 8. Directed diatonic spelling

Spelling follows the written root and the degree's directed diatonic interval.
It never projects to a pitch class and chooses a convenient enharmonic name.

For degree `n`, use `(n - 1)` directed letter steps and the compound
major-degree semitone basis
`1=0, 2=2, 3=4, 4=5, 5=7, 6=9, 7=11, 9=14, 11=17, 13=21`.
The spelling calculation retains the compound octave; only the final
pitch-class projection reduces modulo 12. Compute:

1. the target letter by advancing the root letter by the directed steps;
2. the target sounding semitone from the written root plus the basis semitones
   plus `degree.alter`;
3. the natural target letter's directed semitone position, without reducing
   away the octave crossing;
4. `requiredAlteration = targetSemitone - naturalTargetSemitone`;
5. the exact pitch-class projection by Euclidean modulo 12.

If `requiredAlteration` is outside `-2...2`, return
`theory.spelling_accidental_out_of_range`. Do not respell the root, change the
degree number, substitute an enharmonic target letter, clamp the accidental, or
omit the degree.

The standalone operation accepts the entire finite F1 domain, not just degrees
emitted by the 33 formula rows. `publicDegreeMatrix` is therefore the complete
Cartesian product of 35 written roots (seven letters times alterations
`-2...2`) and 50 degree identities (ten degree numbers times alterations
`-2...2`): 1,750 cells with no exclusions. The independent oracle classifies
1,308 exact successes and 442 exact refusals; required alterations range from
`-5` through `5`. This matrix specifically covers otherwise formula-unused
identities such as `#2`, `b4`, and `#6` and freezes every success spelling,
projection, refusal payload, and boundary. Its reviewed semantic digest is over
the canonical ordered list of all 1,750 inputs and complete public results, so
matching aggregate counts alone is insufficient.

Normative examples include:

| Root / degree | Spelling | Forbidden shortcut |
|---|---|---|
| Db / b7 | Cb | B |
| F# / 7 | E# | F |
| C / #9 | D# | Eb |
| C / b3 | Eb | D# |
| Gb / 3 | Bb | A# |
| G / bb7 | Fb | E |
| Ab / bb7 | Gbb | Fb or F |

The last row corrects a typo in the older plan: the diminished seventh above
A-flat is G-double-flat; F-flat is the diminished seventh above G. All-root
diminished-seventh fixtures must follow the directed law.

The standalone `spellChordDegree` and the resolver use the same policy and
produce the same spelling for the same root/degree. Their conformance proof may
share expected data, but it may not use one production operation as the oracle
for the other.

## 9. Custom and slash-chord invariants

Custom resolution is literal projection, not formula inference:

- return one `custom` realization with the two exact limitations;
- preserve custom pitch-name order, spellings, and duplicates exactly;
- project each pitch name positionally to pitch class;
- keep every degree and role field null;
- emit no theory warning;
- inherit the F1 maximum of 16 custom pitch names;
- never synthesize a formula, deduplicate an enharmonic/unison pitch, or enable
  automatic voicing.

For both parsed and custom results, `bass` equals the source slash-bass value or
null. A slash bass is never inserted into degrees or custom pitch names, never
changes realization order, and never turns the result into an inversion-sorted
array. If the slash spelling is enharmonic to a member, both spellings remain
independent facts.

## 10. Deterministic limits, work, memory, and termination

T1 is synchronous and bounded by semantic counters, not elapsed wall time.
The exact bounds are:

| Resource | Maximum |
|---|---:|
| realizations per resolution | 4 |
| degrees per realization | 16 |
| returned semantic degree records | 64 |
| spelling attempts | 64 |
| warnings | 1 |
| declared formula phases | 8 |
| formula phase transitions | 32 |
| candidate-degree insertions | 84 |
| peak candidate-degree records in one realization | 21 |
| input degree records visited | 23 |
| tracked candidate/output/warning records | 149 |
| custom pitch names | 16 |
| supported written alteration | -2 through 2 |

The 23 input visits are the bounded first-refusal scan: one sixth, the first two
extensions, first eight additions, first nine alterations, and first three
omissions. Those include each collection's first excess entry. The 32 phase
transitions are eight phases across four realizations. Candidate-insertion
accounting is proved by family case split rather than the invalid assumption
that cumulative insertions always equal peak live records: a literal path has
at most 22 insertions including the suspension replacement, while the four-way
altered path has at most 64 total insertions. Both remain below the reviewed
84-record safety cap (`4 * 21`). The 149 tracked-record cap is 84 candidate
records plus 64 returned semantic degree records plus one warning record.
Output projection arrays remain bounded positionally by the same 64 semantic
records; no hidden unbounded queue, recursion, cache, or log is permitted.

The private evidence adapter reports exactly:

```text
inputDegreeRecordsVisited
formulaPhaseTransitions
candidateDegreesObserved
duplicateDegreesCanonicalized
realizationsProduced
spellingAttempts
degreesProduced
warningsProduced
peakCandidateDegreeRecords
termination
```

Its `resolveChord` callable mirrors all three public overloads, including the
custom pitch-tuple generic, so enabling counters cannot widen a parsed result or
erase custom tuple alignment.

Counter bounds are direct: `inputDegreeRecordsVisited <= 23`,
`formulaPhaseTransitions <= 32`, `candidateDegreesObserved <= 84`,
`duplicateDegreesCanonicalized <= candidateDegreesObserved`,
`realizationsProduced <= 4`, `spellingAttempts <= 64`,
`degreesProduced <= 64`, `warningsProduced <= 1`, and
`peakCandidateDegreeRecords <= 21`. All are nonnegative safe integers.

`termination` is exactly one of `complete`, `formula-refusal`,
`spelling-refusal`, or `output-limit-refusal`. Counters include work performed
through the first decisive refusal and no work after it. Wall time is useful
performance evidence but never changes a musical result, ordering, warning, or
cutoff. The evidence result is a result-discriminated union: success fixes
`complete`, each refusal family fixes its matching termination, and impossible
result/termination pairs do not typecheck.

`operation-state-cases.json` freezes one independently counted row for every
termination. Candidate and phase counters describe scratch work; by contrast,
`realizationsProduced`, `degreesProduced`, and `warningsProduced` count only
records present on a returned success branch and are zero on every refusal.
`spellingAttempts` includes the refusing degree. A preflight or family refusal
enters no formula phase. It also freezes every callable branch: standalone
spelling success and refusal, parsed literal, duplicate-merge, warning, and
altered success, custom success, root-owned, explicit-addition-owned,
explicit-alteration-owned, and altered spelling refusal, formula refusal, and
output-limit refusal. The
`C11(add9)` row proves one nonzero canonicalized duplicate; `Csus4(no3)` proves
one returned warning; `C##7#9` proves that an otherwise spellable base reports
the unspellable explicit `#9` at `['alterations', 0]`; and `D##m(add3)` proves
that an otherwise spellable minor base reports its explicit natural third at
`['additions', 0]` when that addition alone requires `F###`. Standalone spelling
reports one produced degree only on success and no realization/candidate/phase
work. Custom resolution reports one realization but zero semantic degrees,
formula phases, candidate records, or spelling attempts; its exact bounded
pitch-class projection remains positionally proved by the custom tuple fixtures.
`C7alt(add9)` proves that a later natural ninth coexists with each altered color
ninth without selecting or merging any of the four variants. A parsed F-sharp
minor-seventh AST whose retained `sourceText` says `Cmaj7` proves that typed
fields, never stored text, select harmony.

The output-limit branch is reachable and therefore mandatory evidence. Its
reviewed recipe starts from diminished `1,b3,b5`, explicitly adds `#5`, all six
9/11/13 color alterations, and all seven natural additions. No records are
duplicates, so canonicalization observes 17 degrees and returns
`limit.theory_realization_degrees_exceeded` at path `[]`, phase
`canonicalization`, with no spelling or partial output. This is also the
first-excess proof for the 16-degree realization cap.

## 11. State applicability

Both public operations are total, synchronous, pure, deterministic functions of
their complete arguments. They read no revision, clock, randomness, locale,
network, storage, browser, audio graph, mutable cache, or global policy.

Consequently cancellation, pause/resume, stale revision, application retries,
browser cleanup, audio cleanup, storage transactions, and download behavior are
inapplicable to T1. Verification records that inapplicability explicitly; it
does not fabricate mock cancellation or stale-result branches. Later bounded
search and application commands own those states. Repeated T1 invocations are
ordinary fresh calls, not resume operations.

## 12. Independent fixture and provenance contract

The independent authority root is `tests/fixtures/resolution/`. Its exact files
are `t1-resolution-contract.json`, `formula-rules.json`, `literal-cases.json`,
`spelling-cases.json`, `all-root-cases.json`, `custom-cases.json`,
`law-cases.json`, `operation-state-cases.json`, `trace-ledger.json`,
`provenance-ledger.json`, and `mutation-controls.json`. These are reviewed data.
A validator may decode them and implement independent arithmetic, but it must
not import `resolveChord`, `spellChordDegree`, a production formula table, or a
production-derived exclusion list to generate expectations.

Authority IDs are:

```text
T1-AUTH-FORMULA
T1-AUTH-SPELLING
T1-AUTH-ROLES
T1-AUTH-DOMAIN
T1-AUTH-LEGACY
T1-AUTH-INDEPENDENCE
```

The initial ledger claims only reviewed project definitions, domain contracts,
compatibility decisions, and verification policy. It does not claim an external
publication check or expert review that did not occur. Any later
`published-reference` or `expert-reviewed` row must record the real source or
dated reviewer; fixture prose cannot promote itself.

Every case carries stable case, trace, and authority IDs. Formula seeds are
`T1-FORMULA-*`; literal/modifier cases are `T1-LIT-*`; spelling cases are
`T1-SPELL-*`; all-root cells are `T1-ROOT-*`; custom cases are `T1-CUSTOM-*`;
metamorphic laws are `T1-LAW-*`; refusal and operation-state cases are
`T1-OPSTATE-*`; reviewed mutation controls are `T1-MUT-*`.

The minimum independent inventory is 33 matrix formula rows, 396 all-root
cells, 46 literal-plan symbols, 12 focused spelling cases, six custom cases,
ten laws, six operation state/applicability cases, 13 trace rows, six
authorities, and 30 reviewed mutation controls. Minimums never authorize
duplicate filler cases.

The frozen specification handoff exceeds those floors: 88 literal cases, 16
focused spelling cases, nine custom cases, 12 laws, ten operation-state cases,
53 mutation controls, and 229 reciprocally linked records. The validator checks
those exact handoff totals, all 1,824 degree spellings implied by the 396 formula
matrix cells, all 1,750 standalone public spelling cells, all 896 family-state
cells, the ordered per-cell semantic digests for both exhaustive matrices, the
complete public success/refusal payload digest for the 896 family-state cells,
and separate reviewed byte and semantic digests for every fixture file.
Formatting drift therefore cannot masquerade as a semantic review, and a
semantic edit cannot be accepted merely by reformatting the corpus.

The 53 mutation controls preserve 140 reviewed case relationships in their
original order, signed by semantic SHA-256
`fbf7124754ba69ec01ef246d4f42ba637b0f75effc95745d39a2cff55430b261`.
They are intentionally classified rather than overstated: 124 are direct
killer links and 16 are corroborative links. A `killedByCaseIds` relationship
is direct only when the named semantic counterfactual applies to that runtime
case and changes a fact checked by its independent oracle. Every control has at
least one such direct killer. A `corroboratedByCaseIds` relationship proves an
adjacent invariant but either does not execute the mutated operation or remains
unchanged under that exact counterfactual; it is observed but never counted as
a kill.

Each corroborative relationship has a same-order `corroborativeLinks` record
with its case ID, a nonblank explanation, and one of these reviewed reason
codes: `predicate-does-not-constrain-ordinary-fifth-role`,
`operator-scope-mismatch`, `single-identity-no-collection-collapse`,
`near-miss-no-target`, `no-transposition-executed`,
`no-extension-supplied-natural-closure`, `single-same-number-member`, or
`stable-sort-tie-no-reordering`. Controls with a split classification retain
their original relationship order in `reviewedCaseLinkOrder`; direct and
corroborative arrays must be disjoint and their ordered union must reproduce
that ledger. Removing, duplicating, reclassifying, or reordering a relationship,
or changing a reviewed reason, is contract drift.

These are executable semantic counterfactuals, not production-source mutants.
Evidence reports the two classes separately. Production-source-mutant execution
and kill counts remain zero unless altered production code is actually built
and run; a fixture edit, digest difference, or post-hoc unequal literal cannot
promote a semantic counterfactual into a source-mutant claim.

Each law requires a positive, negative or near-miss, transposition, and reviewed
mutation proof where those categories are meaningful. The mutation harness must
kill independent changes to major/minor thirds, seventh qualities, extension
closure, sixth/6-9 behavior, identity fifths, diminished `bb7`, suspension,
role assignment, structural/color alteration, addition, omission, slash
separation, all four alt variants/order, diatonic letter selection, accidental
calculation/refusal, custom order/duplicates, output limits, and strict family
refusal. Production output cannot sign or regenerate the expected corpus.

## 13. Trace obligations and inherited acceptance laws

The exact trace ledger must cover at least these obligations:

| Trace | Obligation |
|---|---|
| T1-TRACE-FORMULA-MATRIX | every declared formula and the complete 33 by 12 root product |
| T1-TRACE-ROLE-POLICY | required, optional, and guide partitions |
| T1-TRACE-MODIFIER-ORDER | all eight phases, precedence, coexistence, and conflicts |
| T1-TRACE-ALT-VARIANTS | four exact ordered variants and no hidden audition choice |
| T1-TRACE-SPELLING | directed letter spelling, projections, bounds, and refusal |
| T1-TRACE-SLASH-SEPARATION | bass preservation without membership/inversion repair |
| T1-TRACE-CUSTOM | literal order/duplicates, null roles, projections, and limitations |
| T1-TRACE-STRICT-REFUSAL | no fallback, partial output, or silent modifier loss |
| T1-TRACE-LAWS | deterministic replay, ordering, immutability, transposition, and projection laws |
| T1-TRACE-LIMITS | exact input/work/output/memory bounds and first-excess cases |
| T1-TRACE-OPERATION-STATE | synchronous state applicability and all four termination kinds |
| T1-TRACE-LEGACY-L-THEORY-01 | major 7/9/13 and diminished-7 formula regressions |
| T1-TRACE-INDEPENDENCE | reciprocal case/trace/authority links and nonproduction oracle |

Legacy regression `L-THEORY-01` is satisfied only when Cmaj7/Cmaj9/Cmaj13 and
Cdim7 are correct across the root matrix, their roles and spellings are exact,
and mutations of their third, seventh, closure, or diminished-seventh rules are
killed. A single C-root example is insufficient.

The Harmonic Discovery Idea-Wizard shared laws apply to T1 as follows:

- identical typed input and contract/table/policy versions yield byte-identical
  semantic content and ordering;
- hard formula and spelling constraints never relax; refusal names the binding
  fact;
- semantic work and memory have the explicit caps in Section 10; time is not a
  semantic cutoff;
- transposition metamorphic tests cover every supported root while retaining
  degree-correct spelling;
- independent goldens and reviewed mutations, not self-generated fixtures,
  prove each law family;
- altered dominant remains plural and unranked;
- the complete runtime implementation and corpus are offline and make zero
  network requests.

Source revision, stale-before-Apply, seed, search cost, preview/apply, and
undoable-command clauses from the discovery systems are inapplicable because T1
creates no candidate command and reads no document revision. Later consumers
must add those envelopes without changing the literal resolution.

## 14. Forbidden shortcuts and implementation handoff

The build and verify leaves must reject all of these shortcuts:

- copying expected fixture values out of production output;
- importing fixture data into production as the runtime formula algorithm;
- using `sourceText`, substring checks, or canonical formatting to choose a
  formula;
- treating a pitch class as a spelled pitch or collapsing `#9` into `b3`;
- choosing a single `7alt` realization in the literal resolver;
- inventing natural 5/9 for bare `7alt`;
- treating slash bass as a chord degree or sorting pitches into an inversion;
- preserving `CmMaj9`, an unsupported diminished/augmented extension, or any
  other malformed family by fallback;
- silently dropping an invalid or conflicting modifier;
- rejecting, dropping, or enharmonically replacing the declared `b11` or `#13`
  colors;
- normalizing diminished `bb7` to degree 6;
- deduplicating or reordering custom pitch names;
- using wall time, locale, iteration order, object insertion order, or random
  choice as semantic input;
- exposing mutable result arrays or sharing mutable scratch records;
- claiming browser/audio/storage/cancellation proof through mocks when those
  states are explicitly inapplicable here;
- calling a production resolver or speller from an independent expected-value
  generator, fixture validator, or mutation oracle.

The production handoff is complete only when both public operations implement
this contract without widening it. The independent-verification handoff is
complete only when every trace has reciprocal case links, all 396 matrix cells
and focused cases execute, every reviewed semantic counterfactual has a direct
killer, all 124 direct links are executed and killed, all 16 corroborative links
are observed without being reported as kills, exact work and memory counters
stay within bounds, inputs remain unchanged, outputs are recursively immutable,
and no skip, retry, quarantine, or unexplained survivor remains.
