import type { ChordSpec, CustomChordSpec } from "../domain";
import type {
  CustomChordSpecWithPitches,
  CustomResolveChordResult,
  DegreeSpellingResult,
  NonEmptySpelledPitchClassTuple,
  ParsedResolveChordResult,
  ResolveChordResult,
  SpellChordDegree,
  TheoryFormulaRefusal,
  TheoryOutputLimitRefusal,
  TheoryResolutionRefusal,
  TheorySpellingRefusal,
} from "./resolution-contract";

/** Deterministic T1 work evidence; wall time is never a musical cutoff. */
export type ResolutionWorkEvidence<
  Termination extends ResolutionTermination = ResolutionTermination,
> = Readonly<{
  inputDegreeRecordsVisited: number;
  formulaPhaseTransitions: number;
  candidateDegreesObserved: number;
  duplicateDegreesCanonicalized: number;
  realizationsProduced: number;
  spellingAttempts: number;
  degreesProduced: number;
  warningsProduced: number;
  peakCandidateDegreeRecords: number;
  termination: Termination;
}>;

type ResolutionTermination =
  | "complete"
  | "formula-refusal"
  | "spelling-refusal"
  | "output-limit-refusal";

type EvidenceEnvelope<Result, Termination extends ResolutionTermination> =
  Readonly<{
    result: Result;
    evidence: ResolutionWorkEvidence<Termination>;
  }>;

export type SpellChordDegreeWithEvidenceResult<
  Result extends DegreeSpellingResult = DegreeSpellingResult,
> = Result extends Readonly<{ ok: true }>
  ? EvidenceEnvelope<Result, "complete">
  : Result extends Readonly<{ ok: false }>
    ? EvidenceEnvelope<Result, "spelling-refusal">
    : never;

type ResolutionFailureWithEvidence<
  Refusal extends TheoryResolutionRefusal,
> = Refusal extends TheoryFormulaRefusal
  ? EvidenceEnvelope<Readonly<{ ok: false; refusal: Refusal }>, "formula-refusal">
  : Refusal extends TheorySpellingRefusal
    ? EvidenceEnvelope<
        Readonly<{ ok: false; refusal: Refusal }>,
        "spelling-refusal"
      >
    : Refusal extends TheoryOutputLimitRefusal
      ? EvidenceEnvelope<
          Readonly<{ ok: false; refusal: Refusal }>,
          "output-limit-refusal"
        >
      : never;

export type ResolveChordWithEvidenceResult<
  Result extends ResolveChordResult = ResolveChordResult,
> = Result extends Readonly<{ ok: true }>
  ? EvidenceEnvelope<Result, "complete">
  : Result extends Readonly<{
        ok: false;
        refusal: infer Refusal extends TheoryResolutionRefusal;
      }>
    ? ResolutionFailureWithEvidence<Refusal>
    : never;

export type SpellChordDegreeWithEvidence = (
  ...parameters: Parameters<SpellChordDegree>
) => SpellChordDegreeWithEvidenceResult;

export interface ResolveChordWithEvidence {
  <Pitches extends NonEmptySpelledPitchClassTuple>(
    source: CustomChordSpecWithPitches<Pitches>,
  ): ResolveChordWithEvidenceResult<CustomResolveChordResult<Pitches>>;
  (source: ChordSpec): ResolveChordWithEvidenceResult<ParsedResolveChordResult>;
  (
    source: ChordSpec | CustomChordSpec,
  ): ResolveChordWithEvidenceResult;
}
