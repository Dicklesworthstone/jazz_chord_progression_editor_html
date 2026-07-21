import { describe, expect, test } from "bun:test";

import type {
  ChordDegree,
  SpelledPitchClass,
} from "../../src/domain";
import type {
  AdditionInvalidRefusal,
  AlterationInvalidRefusal,
  ColorPolicyInvalidRefusal,
  CustomRealization,
  CustomResolveChordResult,
  CustomResolvedChord,
  DegreeSpellingResult,
  ExtensionInvalidRefusal,
  FormulaFamilyUnsupportedRefusal,
  LiteralFormulaRuleId,
  ModifierConflictRefusal,
  NonEmptySpelledPitchClassTuple,
  OmissionInvalidRefusal,
  SemanticRealization,
  SixthInvalidRefusal,
  TheoryOutputLimitRefusal,
  TheorySpellingRefusal,
  TheoryWarning,
} from "../../src/theory";
import type {
  ResolutionWorkEvidence,
  ResolveChordWithEvidenceResult,
  SpellChordDegreeWithEvidenceResult,
} from "../../src/theory/resolution-evidence-contract";

type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type MustExtend<Constraint, Value extends Constraint> = Value;

function assertType<Constraint extends true>(proof?: Constraint): Constraint {
  return proof ?? (true as Constraint);
}

type MutablePitchPair = [SpelledPitchClass, SpelledPitchClass];
type ReadonlyPitchPair = readonly [SpelledPitchClass, SpelledPitchClass];
type MutableDegreePair = [ChordDegree, ChordDegree];
type ReadonlyDegreePair = readonly [ChordDegree, ChordDegree];

type PitchTupleOfLength<
  Length extends number,
  Accumulator extends readonly SpelledPitchClass[] = readonly [],
> = Accumulator["length"] extends Length
  ? Accumulator
  : PitchTupleOfLength<
      Length,
      readonly [...Accumulator, SpelledPitchClass]
    >;

type SixteenPitches = PitchTupleOfLength<16>;
type SeventeenPitches = PitchTupleOfLength<17>;
type LiteralBranch = Extract<SemanticRealization, { id: "literal" }>;
type AlteredBranch = Extract<SemanticRealization, { id: "alt-b9-b5" }>;
type StandaloneSpellingPath = Extract<
  DegreeSpellingResult,
  { ok: false }
>["refusal"]["path"];
type ResolverSpellingPath = TheorySpellingRefusal["path"];

type SpellingSuccess = Extract<DegreeSpellingResult, { ok: true }>;
type SpellingFailure = Extract<DegreeSpellingResult, { ok: false }>;
type CustomSuccess = CustomResolveChordResult<MutablePitchPair>;
type FormulaFailure = Readonly<{
  ok: false;
  refusal: SixthInvalidRefusal;
}>;
type SpellingResolutionFailure = Readonly<{
  ok: false;
  refusal: TheorySpellingRefusal;
}>;
type OutputLimitFailure = Readonly<{
  ok: false;
  refusal: TheoryOutputLimitRefusal;
}>;

type CustomEvidence = ResolveChordWithEvidenceResult<CustomSuccess>;
type FormulaFailureEvidence = ResolveChordWithEvidenceResult<FormulaFailure>;
type SpellingFailureEvidence =
  ResolveChordWithEvidenceResult<SpellingResolutionFailure>;
type OutputLimitEvidence = ResolveChordWithEvidenceResult<OutputLimitFailure>;
type DirectSpellingSuccessEvidence =
  SpellChordDegreeWithEvidenceResult<SpellingSuccess>;
type DirectSpellingFailureEvidence =
  SpellChordDegreeWithEvidenceResult<SpellingFailure>;
type CustomPitchOutput =
  CustomRealization<MutablePitchPair>["spelledPitchNames"];
type CustomSourcePitchOutput =
  CustomResolvedChord<MutablePitchPair>["source"]["pitchNames"];
type SemanticDegreeOutput =
  SemanticRealization<"literal", MutableDegreePair>["degrees"];
type DirectSpellingSuccessTermination =
  DirectSpellingSuccessEvidence["evidence"]["termination"];

type NegativeCompileProofs = readonly [
  // @ts-expect-error: a returned custom pitch tuple cannot remain mutable
  MustExtend<MutablePitchPair, CustomPitchOutput>,
  // @ts-expect-error: the returned custom source cannot expose a mutable tuple
  MustExtend<MutablePitchPair, CustomSourcePitchOutput>,
  // @ts-expect-error: semantic output degrees are readonly for mutable inputs
  MustExtend<MutableDegreePair, SemanticDegreeOutput>,
  // @ts-expect-error: a literal realization cannot claim the altered rule
  MustExtend<LiteralBranch["formulaRuleId"], "altered-dominant">,
  // @ts-expect-error: standalone spelling can only blame the degree argument
  MustExtend<StandaloneSpellingPath, readonly ["root"]>,
  // @ts-expect-error: resolver spelling never uses the standalone degree path
  MustExtend<ResolverSpellingPath, readonly ["degree"]>,
  // @ts-expect-error: a custom success cannot report formula refusal termination
  MustExtend<CustomEvidence["evidence"]["termination"], "formula-refusal">,
  // @ts-expect-error: direct spelling success cannot report spelling refusal
  MustExtend<DirectSpellingSuccessTermination, "spelling-refusal">,
  // @ts-expect-error: a 17-pitch tuple exceeds the success-only custom contract
  CustomResolveChordResult<SeventeenPitches>,
];

const positiveTypeProofs = [
  assertType<
    Equal<
      CustomRealization<MutablePitchPair>["spelledPitchNames"],
      ReadonlyPitchPair
    >
  >(),
  assertType<
    Equal<
      CustomResolvedChord<MutablePitchPair>["source"]["pitchNames"],
      ReadonlyPitchPair
    >
  >(),
  assertType<
    Equal<
      SemanticRealization<"literal", MutableDegreePair>["degrees"],
      ReadonlyDegreePair
    >
  >(),
  assertType<Equal<LiteralBranch["formulaRuleId"], LiteralFormulaRuleId>>(),
  assertType<Equal<AlteredBranch["formulaRuleId"], "altered-dominant">>(),
  assertType<
    Equal<
      NonEmptySpelledPitchClassTuple["length"],
      1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
    >
  >(),
  assertType<SixteenPitches extends NonEmptySpelledPitchClassTuple ? true : false>(),
  assertType<
    Not<SeventeenPitches extends NonEmptySpelledPitchClassTuple ? true : false>
  >(),
  assertType<Equal<TheoryWarning["path"], readonly ["omissions", number]>>(),
  assertType<Equal<SixthInvalidRefusal["path"], readonly ["sixth"]>>(),
  assertType<
    Equal<ExtensionInvalidRefusal["path"], readonly ["extensions", number]>
  >(),
  assertType<
    Equal<AdditionInvalidRefusal["path"], readonly ["additions", number]>
  >(),
  assertType<
    Equal<AlterationInvalidRefusal["path"], readonly ["alterations", number]>
  >(),
  assertType<
    Equal<OmissionInvalidRefusal["path"], readonly ["omissions", number]>
  >(),
  assertType<
    Equal<ColorPolicyInvalidRefusal["path"], readonly ["colorPolicy"]>
  >(),
  assertType<
    Equal<
      FormulaFamilyUnsupportedRefusal["path"],
      | readonly ["triad"]
      | readonly ["sixth"]
      | readonly ["seventh"]
      | readonly ["extensions", number]
    >
  >(),
  assertType<Equal<StandaloneSpellingPath, readonly ["degree"]>>(),
  assertType<
    Equal<
      ResolverSpellingPath,
      | readonly ["root"]
      | readonly ["additions", number]
      | readonly ["alterations", number]
    >
  >(),
  assertType<
    Equal<
      Extract<
        ModifierConflictRefusal,
        { conflict: "sixth-with-extension" }
      >["rightPath"],
      readonly ["extensions", number]
    >
  >(),
  assertType<Equal<CustomEvidence["evidence"]["termination"], "complete">>(),
  assertType<
    Equal<FormulaFailureEvidence["evidence"]["termination"], "formula-refusal">
  >(),
  assertType<
    Equal<
      SpellingFailureEvidence["evidence"]["termination"],
      "spelling-refusal"
    >
  >(),
  assertType<
    Equal<
      OutputLimitEvidence["evidence"]["termination"],
      "output-limit-refusal"
    >
  >(),
  assertType<
    Equal<DirectSpellingSuccessEvidence["evidence"]["termination"], "complete">
  >(),
  assertType<
    Equal<
      DirectSpellingFailureEvidence["evidence"]["termination"],
      "spelling-refusal"
    >
  >(),
  assertType<
    Equal<
      ResolutionWorkEvidence["termination"],
      | "complete"
      | "formula-refusal"
      | "spelling-refusal"
      | "output-limit-refusal"
    >
  >(),
  assertType<Equal<NegativeCompileProofs["length"], 9>>(),
] as const;

describe("T1 hardened type contract", () => {
  test("rejects impossible mutable, correlated, path, evidence, and bound states", () => {
    expect(positiveTypeProofs.every(Boolean)).toBe(true);
  });
});
