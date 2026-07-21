import {
  MAX_ALTERATION,
  MAX_VOICING_PITCHES,
  MIN_ALTERATION,
  type ChordColorPolicy,
  type ChordDegree,
  type ChordSpec,
  type CustomChordSpec,
  type DegreeNumber,
  type PathRefusal,
  type PitchClass,
  type SeventhQuality,
  type SpelledPitchClass,
  type TriadQuality,
} from "../domain";

/** Versioned public contract for T1 formula resolution and degree spelling. */
export const RESOLUTION_CONTRACT_SCHEMA =
  "changes.theory.resolution-contract.v1";
export const RESOLVED_CHORD_SCHEMA = "changes.theory.resolved-chord.v1";

export const CHORD_FORMULA_TABLE_ID = "changes.chord-formulas";
export const CHORD_FORMULA_TABLE_VERSION = 1;
export const DEGREE_SPELLING_POLICY_ID = "changes.degree-spelling";
export const DEGREE_SPELLING_POLICY_VERSION = 1;
export const DEGREE_ROLE_POLICY_ID = "changes.balanced-degree-roles";
export const DEGREE_ROLE_POLICY_VERSION = 1;

export const RESOLUTION_OPERATION_NAMES = Object.freeze([
  "spellChordDegree",
  "resolveChord",
] as const);

export type ResolutionOperationName =
  (typeof RESOLUTION_OPERATION_NAMES)[number];

/**
 * Normative construction order. Phases transform candidate membership only as
 * declared and never rewrite the source ChordSpec facts.
 */
export const CHORD_FORMULA_PHASES = Object.freeze([
  "base",
  "suspension",
  "structural-alterations",
  "color-alterations",
  "additions",
  "omissions",
  "canonicalization",
  "spelling",
] as const);

export type ChordFormulaPhase = (typeof CHORD_FORMULA_PHASES)[number];

/** Closed formula-family vocabulary used by results, refusals, and fixtures. */
export const CHORD_FORMULA_RULE_IDS = Object.freeze([
  "base-major",
  "base-minor",
  "base-diminished",
  "base-augmented",
  "base-sus2",
  "base-sus4",
  "base-power",
  "sixth-major",
  "sixth-minor",
  "seventh-major",
  "seventh-dominant",
  "seventh-minor",
  "seventh-minor-major",
  "seventh-half-diminished",
  "seventh-diminished",
  "seventh-augmented-major",
  "extension-major",
  "extension-dominant",
  "extension-minor",
  "extension-suspended-dominant",
  "altered-dominant",
  "custom",
] as const);

export type ChordFormulaRuleId = (typeof CHORD_FORMULA_RULE_IDS)[number];
export type ParsedChordFormulaRuleId = Exclude<ChordFormulaRuleId, "custom">;

export const SEMANTIC_REALIZATION_IDS = Object.freeze([
  "literal",
  "alt-b9-b5",
  "alt-b9-sharp5",
  "alt-sharp9-b5",
  "alt-sharp9-sharp5",
] as const);

export const ALTERED_DOMINANT_REALIZATION_IDS = Object.freeze([
  "alt-b9-b5",
  "alt-b9-sharp5",
  "alt-sharp9-b5",
  "alt-sharp9-sharp5",
] as const);

export const CUSTOM_REALIZATION_ID = "custom";

export type SemanticRealizationId =
  (typeof SEMANTIC_REALIZATION_IDS)[number];
export type AlteredDominantRealizationId =
  (typeof ALTERED_DOMINANT_REALIZATION_IDS)[number];
export type LiteralFormulaRuleId = Exclude<
  ChordFormulaRuleId,
  "altered-dominant" | "custom"
>;

export const CUSTOM_REALIZATION_LIMITATIONS = Object.freeze([
  "custom.no_degree_analysis",
  "custom.no_auto_voicing",
] as const);

export type CustomRealizationLimitation =
  (typeof CUSTOM_REALIZATION_LIMITATIONS)[number];

export const MAX_THEORY_REALIZATIONS = 4;
export const MAX_THEORY_DEGREES_PER_REALIZATION = 16;
export const MAX_THEORY_EXTENSIONS = 1;
export const MAX_THEORY_ADDITIONS = 7;
export const MAX_THEORY_ALTERATIONS = 8;
export const MAX_THEORY_OMISSIONS = 2;
export const MAX_THEORY_SEMANTIC_OUTPUT_RECORDS = 64;
export const MAX_THEORY_SPELLING_ATTEMPTS = 64;
export const MAX_THEORY_WARNINGS = 1;
export const MAX_THEORY_FORMULA_PHASES = 8;
export const MAX_THEORY_FORMULA_PHASE_TRANSITIONS = 32;
export const MAX_THEORY_CANDIDATE_INSERTIONS = 84;
export const MAX_THEORY_PEAK_CANDIDATE_DEGREE_RECORDS = 21;
export const MAX_THEORY_INPUT_DEGREE_RECORDS_VISITED = 23;
export const MAX_THEORY_TRACKED_RECORDS = 149;

/** T1 inherits these reviewed domain bounds rather than defining wider ones. */
export const MAX_CUSTOM_CHORD_PITCHES = MAX_VOICING_PITCHES;
export const MIN_DEGREE_SPELLING_ALTERATION = MIN_ALTERATION;
export const MAX_DEGREE_SPELLING_ALTERATION = MAX_ALTERATION;

export const THEORY_EXTENSION_NUMBERS = Object.freeze([
  9,
  11,
  13,
] as const satisfies readonly DegreeNumber[]);
export const THEORY_ADDITION_NUMBERS = Object.freeze([
  2,
  3,
  4,
  6,
  9,
  11,
  13,
] as const satisfies readonly DegreeNumber[]);
export const THEORY_ALTERATION_NUMBERS = Object.freeze([
  5,
  9,
  11,
  13,
] as const satisfies readonly DegreeNumber[]);
export const THEORY_OMISSION_NUMBERS = Object.freeze([
  3,
  5,
] as const satisfies readonly DegreeNumber[]);
export const THEORY_MODIFIER_ALTERATIONS = Object.freeze([-1, 1] as const);

export const THEORY_REFUSAL_CODES = Object.freeze([
  "theory.formula_family_unsupported",
  "theory.sixth_invalid",
  "theory.extension_invalid",
  "theory.addition_invalid",
  "theory.alteration_invalid",
  "theory.omission_invalid",
  "theory.modifier_conflict",
  "theory.color_policy_invalid",
  "theory.spelling_accidental_out_of_range",
  "limit.theory_realization_degrees_exceeded",
] as const);

export type TheoryRefusalCode = (typeof THEORY_REFUSAL_CODES)[number];

type ReadonlyPermutation<
  Universe extends readonly string[],
  Candidate extends readonly Universe[number][],
> = Candidate["length"] extends Universe["length"]
  ? Exclude<Universe[number], Candidate[number]> extends never
    ? Candidate
    : never
  : never;

const THEORY_REFUSAL_PRECEDENCE_VALUES = [
  "theory.sixth_invalid",
  "theory.extension_invalid",
  "theory.addition_invalid",
  "theory.alteration_invalid",
  "theory.omission_invalid",
  "theory.formula_family_unsupported",
  "theory.color_policy_invalid",
  "theory.modifier_conflict",
  "limit.theory_realization_degrees_exceeded",
  "theory.spelling_accidental_out_of_range",
] as const;

/**
 * Stable winner when more than one refusal is independently discoverable.
 * Extension-family compatibility is discoverable only after a supported
 * triad/seventh prefix; an earlier incompatible family field wins by itself.
 */
export const THEORY_REFUSAL_PRECEDENCE: ReadonlyPermutation<
  typeof THEORY_REFUSAL_CODES,
  typeof THEORY_REFUSAL_PRECEDENCE_VALUES
> = Object.freeze(THEORY_REFUSAL_PRECEDENCE_VALUES);

/**
 * Stable winner when one input independently violates multiple reasons for the
 * same refusal code. The first reason in each deeply frozen tuple wins; source
 * order breaks ties only after this table has selected a reason.
 */
export const THEORY_REFUSAL_REASON_PRECEDENCE = Object.freeze({
  "theory.sixth_invalid": Object.freeze([
    "alteration",
    "family",
  ] as const),
  "theory.extension_invalid": Object.freeze([
    "count",
    "number",
    "alteration",
    "family",
  ] as const),
  "theory.addition_invalid": Object.freeze([
    "count",
    "number",
    "alteration",
  ] as const),
  "theory.alteration_invalid": Object.freeze([
    "count",
    "number",
    "alteration",
  ] as const),
  "theory.omission_invalid": Object.freeze([
    "count",
    "number",
  ] as const),
  "theory.color_policy_invalid": Object.freeze([
    "requires-dominant-seventh",
    "explicit-five-or-nine-alteration",
  ] as const),
} as const);

export const THEORY_WARNING_CODES = Object.freeze([
  "theory.omission_absent",
] as const);

export type TheoryWarningCode = (typeof THEORY_WARNING_CODES)[number];

export type TheoryWarning = Readonly<{
  code: "theory.omission_absent";
  path: readonly ["omissions", number];
  degreeNumber: 3;
  message: string;
}>;

/** Every v1 family contains a fifth, so only an absent-third can warn. */
export type TheoryWarnings = readonly [] | readonly [TheoryWarning];

export type FormulaFamilyUnsupportedRefusal = PathRefusal<{
  code: "theory.formula_family_unsupported";
  path:
    | readonly ["triad"]
    | readonly ["sixth"]
    | readonly ["seventh"]
    | readonly ["extensions", number];
  phase: "base";
  ruleId: ParsedChordFormulaRuleId;
  triad: TriadQuality;
  seventh: SeventhQuality | null;
  colorPolicy: ChordColorPolicy;
}>;

export type SixthInvalidRefusal = PathRefusal<{
  code: "theory.sixth_invalid";
  path: readonly ["sixth"];
  phase: "base";
  ruleId: ParsedChordFormulaRuleId;
  received: ChordDegree<6>;
  reason: "alteration" | "family";
}>;

export type ExtensionInvalidRefusal = PathRefusal<{
  code: "theory.extension_invalid";
  path: readonly ["extensions", number];
  phase: "base";
  ruleId: ParsedChordFormulaRuleId;
  received: ChordDegree;
  reason: "count" | "number" | "alteration" | "family";
}>;

export type AdditionInvalidRefusal = PathRefusal<{
  code: "theory.addition_invalid";
  path: readonly ["additions", number];
  phase: "additions";
  ruleId: ParsedChordFormulaRuleId;
  received: ChordDegree;
  reason: "count" | "number" | "alteration";
}>;

export type AlterationInvalidRefusal = PathRefusal<{
  code: "theory.alteration_invalid";
  path: readonly ["alterations", number];
  phase: "structural-alterations" | "color-alterations";
  ruleId: ParsedChordFormulaRuleId;
  received: ChordDegree;
  reason: "count" | "number" | "alteration";
}>;

export type OmissionInvalidRefusal = PathRefusal<{
  code: "theory.omission_invalid";
  path: readonly ["omissions", number];
  phase: "omissions";
  ruleId: ParsedChordFormulaRuleId;
  received: DegreeNumber;
  reason: "count" | "number";
}>;

/** Stable winner when more than one cross-category conflict is present. */
export const THEORY_MODIFIER_CONFLICT_PRECEDENCE = Object.freeze([
  "sixth-with-seventh",
  "sixth-with-extension",
  "addition-omission",
  "alteration-omission",
  "structural-alteration-pair",
] as const);

export type TheoryModifierConflict =
  (typeof THEORY_MODIFIER_CONFLICT_PRECEDENCE)[number];

type ModifierConflictRefusalBase = Readonly<{
  code: "theory.modifier_conflict";
  ruleId: ParsedChordFormulaRuleId;
}>;

export type ModifierConflictRefusal = PathRefusal<
  ModifierConflictRefusalBase &
    (
      | {
          conflict: "sixth-with-seventh";
          path: readonly ["sixth"];
          leftPath: readonly ["sixth"];
          rightPath: readonly ["seventh"];
          phase: "base";
        }
      | {
          conflict: "sixth-with-extension";
          path: readonly ["sixth"];
          leftPath: readonly ["sixth"];
          rightPath: readonly ["extensions", number];
          phase: "base";
        }
      | {
          conflict: "addition-omission";
          path: readonly ["additions", number];
          leftPath: readonly ["additions", number];
          rightPath: readonly ["omissions", number];
          phase: "additions";
        }
      | {
          conflict: "alteration-omission";
          path: readonly ["alterations", number];
          leftPath: readonly ["alterations", number];
          rightPath: readonly ["omissions", number];
          phase: "structural-alterations";
        }
      | {
          conflict: "structural-alteration-pair";
          path: readonly ["alterations", number];
          leftPath: readonly ["alterations", number];
          rightPath: readonly ["alterations", number];
          phase: "structural-alterations";
        }
    )
>;

export type ColorPolicyInvalidRefusal = PathRefusal<{
  code: "theory.color_policy_invalid";
  path: readonly ["colorPolicy"];
  phase: "color-alterations";
  ruleId: "altered-dominant";
  received: "altered-dominant";
  reason:
    | "requires-dominant-seventh"
    | "explicit-five-or-nine-alteration";
}>;

type ResolverSpellingRefusalPath =
  | readonly ["root"]
  | readonly ["additions", number]
  | readonly ["alterations", number];
type StandaloneSpellingRefusalPath = readonly ["degree"];
type SpellingRefusalPath =
  | ResolverSpellingRefusalPath
  | StandaloneSpellingRefusalPath;

export type SpellingAccidentalOutOfRangeRefusal<
  Path extends SpellingRefusalPath = ResolverSpellingRefusalPath,
> = PathRefusal<{
  code: "theory.spelling_accidental_out_of_range";
  path: Path;
  phase: "spelling";
  degreeSpellingPolicyId: typeof DEGREE_SPELLING_POLICY_ID;
  degreeSpellingPolicyVersion: typeof DEGREE_SPELLING_POLICY_VERSION;
  root: SpelledPitchClass;
  degree: ChordDegree;
  requiredAlteration: number;
  minimum: typeof MIN_DEGREE_SPELLING_ALTERATION;
  maximum: typeof MAX_DEGREE_SPELLING_ALTERATION;
}>;

/** A whole-realization limit has no narrower source field to blame. */
export type TheoryRealizationDegreesExceededRefusal = PathRefusal<{
  code: "limit.theory_realization_degrees_exceeded";
  path: readonly [];
  phase: "canonicalization";
  ruleId: ParsedChordFormulaRuleId;
  received: number;
  maximum: typeof MAX_THEORY_DEGREES_PER_REALIZATION;
}>;

export type TheoryFormulaRefusal =
  | FormulaFamilyUnsupportedRefusal
  | SixthInvalidRefusal
  | ExtensionInvalidRefusal
  | AdditionInvalidRefusal
  | AlterationInvalidRefusal
  | OmissionInvalidRefusal
  | ModifierConflictRefusal
  | ColorPolicyInvalidRefusal;

export type TheorySpellingRefusal = SpellingAccidentalOutOfRangeRefusal;
export type TheoryOutputLimitRefusal =
  TheoryRealizationDegreesExceededRefusal;

export type TheoryResolutionRefusal =
  | TheoryFormulaRefusal
  | TheorySpellingRefusal
  | TheoryOutputLimitRefusal;

export type DegreeSpelling = Readonly<{
  policyId: typeof DEGREE_SPELLING_POLICY_ID;
  policyVersion: typeof DEGREE_SPELLING_POLICY_VERSION;
  root: SpelledPitchClass;
  degree: ChordDegree;
  spelled: SpelledPitchClass;
  pitchClass: PitchClass;
}>;

export type DegreeSpellingResult =
  | Readonly<{ ok: true; value: DegreeSpelling }>
  | Readonly<{
      ok: false;
      refusal: SpellingAccidentalOutOfRangeRefusal<StandaloneSpellingRefusalPath>;
    }>;

export type NonEmptyChordDegreeTuple = readonly [
  ChordDegree,
  ...ChordDegree[],
];
type BoundedNonEmptyTuple<
  Value,
  Accumulator extends readonly Value[] = readonly [Value],
> = Accumulator["length"] extends typeof MAX_CUSTOM_CHORD_PITCHES
  ? Accumulator
  : Accumulator | BoundedNonEmptyTuple<Value, readonly [...Accumulator, Value]>;

/** A custom pitch tuple is statically nonempty and cannot exceed the F1 cap. */
export type NonEmptySpelledPitchClassTuple =
  BoundedNonEmptyTuple<SpelledPitchClass>;

type ImmutableTuple<Source extends readonly unknown[]> = {
  readonly [Index in keyof Source]: Source[Index];
};

/** Maps one output record to every source-tuple index without losing length. */
export type IndexAlignedTuple<
  Source extends readonly unknown[],
  Value,
> = {
  readonly [Index in keyof Source]: Value;
};

export type FormulaRuleForSemanticRealization<
  Id extends SemanticRealizationId,
> = Id extends "literal" ? LiteralFormulaRuleId : "altered-dominant";

export type SemanticRealization<
  Id extends SemanticRealizationId = SemanticRealizationId,
  Degrees extends NonEmptyChordDegreeTuple = NonEmptyChordDegreeTuple,
> = Id extends SemanticRealizationId
  ? Readonly<{
      kind: "semantic";
      id: Id;
      formulaRuleId: FormulaRuleForSemanticRealization<Id>;
      degrees: ImmutableTuple<Degrees>;
      requiredDegrees: readonly Degrees[number][];
      optionalDegrees: readonly Degrees[number][];
      guideToneDegrees: readonly Degrees[number][];
      spelledPitchNames: IndexAlignedTuple<Degrees, SpelledPitchClass>;
      pitchClasses: IndexAlignedTuple<Degrees, PitchClass>;
    }>
  : never;

export type LiteralSemanticRealization = SemanticRealization<"literal">;

export type AlteredDominantSemanticRealization<
  Id extends AlteredDominantRealizationId = AlteredDominantRealizationId,
> = SemanticRealization<Id>;

export type LiteralRealizationTuple = readonly [LiteralSemanticRealization];

/** Fixed order is part of the public 7alt ambiguity contract. */
export type AlteredDominantRealizationTuple = readonly [
  AlteredDominantSemanticRealization<"alt-b9-b5">,
  AlteredDominantSemanticRealization<"alt-b9-sharp5">,
  AlteredDominantSemanticRealization<"alt-sharp9-b5">,
  AlteredDominantSemanticRealization<"alt-sharp9-sharp5">,
];

export type CustomRealization<
  Pitches extends
    NonEmptySpelledPitchClassTuple = NonEmptySpelledPitchClassTuple,
> = Readonly<{
  kind: "custom";
  id: typeof CUSTOM_REALIZATION_ID;
  formulaRuleId: "custom";
  degrees: null;
  requiredDegrees: null;
  optionalDegrees: null;
  guideToneDegrees: null;
  spelledPitchNames: ImmutableTuple<Pitches>;
  pitchClasses: IndexAlignedTuple<Pitches, PitchClass>;
  limitations: typeof CUSTOM_REALIZATION_LIMITATIONS;
}>;

export type ResolvedChordMetadata = Readonly<{
  schema: typeof RESOLVED_CHORD_SCHEMA;
  formulaTableId: typeof CHORD_FORMULA_TABLE_ID;
  formulaTableVersion: typeof CHORD_FORMULA_TABLE_VERSION;
  degreeSpellingPolicyId: typeof DEGREE_SPELLING_POLICY_ID;
  degreeSpellingPolicyVersion: typeof DEGREE_SPELLING_POLICY_VERSION;
  degreeRolePolicyId: typeof DEGREE_ROLE_POLICY_ID;
  degreeRolePolicyVersion: typeof DEGREE_ROLE_POLICY_VERSION;
}>;

export type ParsedResolvedChord = ResolvedChordMetadata &
  Readonly<{
    source: ChordSpec;
    realizations: LiteralRealizationTuple | AlteredDominantRealizationTuple;
    bass: SpelledPitchClass | null;
    warnings: TheoryWarnings;
  }>;

export type CustomChordSpecWithPitches<
  Pitches extends NonEmptySpelledPitchClassTuple,
> = Omit<CustomChordSpec, "pitchNames"> &
  Readonly<{ pitchNames: ImmutableTuple<Pitches> }>;

export type CustomResolvedChord<
  Pitches extends
    NonEmptySpelledPitchClassTuple = NonEmptySpelledPitchClassTuple,
> = ResolvedChordMetadata &
  Readonly<{
    source: CustomChordSpecWithPitches<Pitches>;
    realizations: readonly [CustomRealization<Pitches>];
    bass: SpelledPitchClass | null;
    warnings: readonly [];
  }>;

export type ResolvedChord = ParsedResolvedChord | CustomResolvedChord;

export type ParsedResolveChordResult =
  | Readonly<{ ok: true; value: ParsedResolvedChord }>
  | Readonly<{ ok: false; refusal: TheoryResolutionRefusal }>;

export type CustomResolveChordResult<
  Pitches extends
    NonEmptySpelledPitchClassTuple = NonEmptySpelledPitchClassTuple,
> = Readonly<{ ok: true; value: CustomResolvedChord<Pitches> }>;

export type ResolveChordResult =
  | ParsedResolveChordResult
  | CustomResolveChordResult;

export type SpellChordDegree = (
  root: SpelledPitchClass,
  degree: ChordDegree,
) => DegreeSpellingResult;

export interface ResolveChord {
  <Pitches extends NonEmptySpelledPitchClassTuple>(
    source: CustomChordSpecWithPitches<Pitches>,
  ): CustomResolveChordResult<Pitches>;
  (source: ChordSpec): ParsedResolveChordResult;
  (source: ChordSpec | CustomChordSpec): ResolveChordResult;
}

/** T1's callable surface; production wiring is owned by the build phase. */
export interface ResolutionOperations {
  readonly spellChordDegree: SpellChordDegree;
  readonly resolveChord: ResolveChord;
}
