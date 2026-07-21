import {
  pitchClassOf,
  type ChordDegree,
  type ChordSpec,
  type CustomChordSpec,
  type DegreeNumber,
  type PitchClass,
  type SpelledPitchClass,
  type TriadQuality,
} from "../domain";
import { spellChordDegree } from "./degree-spelling";
import {
  CHORD_FORMULA_TABLE_ID,
  CHORD_FORMULA_TABLE_VERSION,
  CUSTOM_REALIZATION_LIMITATIONS,
  DEGREE_ROLE_POLICY_ID,
  DEGREE_ROLE_POLICY_VERSION,
  DEGREE_SPELLING_POLICY_ID,
  DEGREE_SPELLING_POLICY_VERSION,
  MAX_THEORY_ADDITIONS,
  MAX_THEORY_ALTERATIONS,
  MAX_THEORY_DEGREES_PER_REALIZATION,
  MAX_THEORY_EXTENSIONS,
  MAX_THEORY_OMISSIONS,
  RESOLVED_CHORD_SCHEMA,
  type AlteredDominantRealizationId,
  type AlteredDominantRealizationTuple,
  type CustomResolveChordResult,
  type LiteralFormulaRuleId,
  type LiteralRealizationTuple,
  type NonEmptyChordDegreeTuple,
  type NonEmptySpelledPitchClassTuple,
  type ParsedChordFormulaRuleId,
  type ParsedResolveChordResult,
  type ResolveChord,
  type ResolveChordResult,
  type SemanticRealization,
  type TheoryFormulaRefusal,
  type TheoryOutputLimitRefusal,
  type TheorySpellingRefusal,
  type TheoryWarning,
  type TheoryWarnings,
} from "./resolution-contract";
import type {
  ResolutionWorkEvidence,
  ResolveChordWithEvidence,
  ResolveChordWithEvidenceResult,
} from "./resolution-evidence-contract";

type ResolverSpellingPath =
  | readonly ["root"]
  | readonly ["additions", number]
  | readonly ["alterations", number];

type CandidateOrigin =
  | Readonly<{ kind: "base" }>
  | Readonly<{ kind: "addition"; index: number }>
  | Readonly<{ kind: "alteration"; index: number }>;

type CandidateDegree = {
  readonly degree: ChordDegree;
  required: boolean;
  guide: boolean;
  readonly origins: CandidateOrigin[];
};

type RealizationScratch =
  | {
      readonly id: "literal";
      readonly formulaRuleId: LiteralFormulaRuleId;
      candidates: CandidateDegree[];
    }
  | {
      readonly id: AlteredDominantRealizationId;
      readonly formulaRuleId: "altered-dominant";
      candidates: CandidateDegree[];
    };

type MutableEvidence = {
  inputDegreeRecordsVisited: number;
  formulaPhaseTransitions: number;
  candidateDegreesObserved: number;
  duplicateDegreesCanonicalized: number;
  realizationsProduced: number;
  spellingAttempts: number;
  degreesProduced: number;
  warningsProduced: number;
  peakCandidateDegreeRecords: number;
};

type MutableParsedModifierSnapshot = {
  sixth: ChordSpec["sixth"];
  extensions: ChordDegree[];
  additions: ChordDegree[];
  alterations: ChordDegree[];
  omissions: DegreeNumber[];
};

type ParsedModifierSnapshot = Readonly<{
  sixth: ChordSpec["sixth"];
  extensions: readonly ChordDegree[];
  additions: readonly ChordDegree[];
  alterations: readonly ChordDegree[];
  omissions: readonly DegreeNumber[];
}>;

type ParsedCoreEnvelope = Readonly<{
  result: ParsedResolveChordResult;
  evidence: ResolutionWorkEvidence;
}>;

const ROOT_DEGREE = Object.freeze({ number: 1, alter: 0 } as const);
const NATURAL_THIRD = Object.freeze({ number: 3, alter: 0 } as const);
const MINOR_THIRD = Object.freeze({ number: 3, alter: -1 } as const);
const PERFECT_FIFTH = Object.freeze({ number: 5, alter: 0 } as const);
const FLAT_FIFTH = Object.freeze({ number: 5, alter: -1 } as const);
const SHARP_FIFTH = Object.freeze({ number: 5, alter: 1 } as const);
const MAJOR_SIXTH = Object.freeze({ number: 6, alter: 0 } as const);
const MAJOR_SEVENTH = Object.freeze({ number: 7, alter: 0 } as const);
const MINOR_SEVENTH = Object.freeze({ number: 7, alter: -1 } as const);
const DIMINISHED_SEVENTH = Object.freeze({ number: 7, alter: -2 } as const);
const NATURAL_NINTH = Object.freeze({ number: 9, alter: 0 } as const);
const NATURAL_ELEVENTH = Object.freeze({ number: 11, alter: 0 } as const);
const NATURAL_THIRTEENTH = Object.freeze({ number: 13, alter: 0 } as const);

const ALT_VARIANT_SEEDS = Object.freeze([
  Object.freeze({
    id: "alt-b9-b5" as const,
    degrees: Object.freeze([
      ROOT_DEGREE,
      NATURAL_THIRD,
      FLAT_FIFTH,
      MINOR_SEVENTH,
      Object.freeze({ number: 9, alter: -1 } as const),
    ]),
  }),
  Object.freeze({
    id: "alt-b9-sharp5" as const,
    degrees: Object.freeze([
      ROOT_DEGREE,
      NATURAL_THIRD,
      SHARP_FIFTH,
      MINOR_SEVENTH,
      Object.freeze({ number: 9, alter: -1 } as const),
    ]),
  }),
  Object.freeze({
    id: "alt-sharp9-b5" as const,
    degrees: Object.freeze([
      ROOT_DEGREE,
      NATURAL_THIRD,
      FLAT_FIFTH,
      MINOR_SEVENTH,
      Object.freeze({ number: 9, alter: 1 } as const),
    ]),
  }),
  Object.freeze({
    id: "alt-sharp9-sharp5" as const,
    degrees: Object.freeze([
      ROOT_DEGREE,
      NATURAL_THIRD,
      SHARP_FIFTH,
      MINOR_SEVENTH,
      Object.freeze({ number: 9, alter: 1 } as const),
    ]),
  }),
]);

function emptyEvidence(): MutableEvidence {
  return {
    inputDegreeRecordsVisited: 0,
    formulaPhaseTransitions: 0,
    candidateDegreesObserved: 0,
    duplicateDegreesCanonicalized: 0,
    realizationsProduced: 0,
    spellingAttempts: 0,
    degreesProduced: 0,
    warningsProduced: 0,
    peakCandidateDegreeRecords: 0,
  };
}

function freezeEvidence(
  evidence: MutableEvidence,
  termination: ResolutionWorkEvidence["termination"],
): ResolutionWorkEvidence {
  return Object.freeze({ ...evidence, termination });
}

function copyPitchClass(pitch: SpelledPitchClass): SpelledPitchClass {
  return Object.freeze({ step: pitch.step, alter: pitch.alter });
}

function copyDegree<N extends DegreeNumber>(degree: ChordDegree<N>): ChordDegree<N> {
  return Object.freeze({ number: degree.number, alter: degree.alter });
}

function frozenArray<Value>(values: Iterable<Value>): readonly Value[] {
  return Object.freeze(Array.from(values));
}

function emptyParsedModifierSnapshot(): MutableParsedModifierSnapshot {
  return {
    sixth: null,
    extensions: [],
    additions: [],
    alterations: [],
    omissions: [],
  };
}

function freezeParsedModifierSnapshot(
  snapshot: MutableParsedModifierSnapshot,
): ParsedModifierSnapshot {
  return Object.freeze({
    sixth: snapshot.sixth,
    extensions: frozenArray(snapshot.extensions),
    additions: frozenArray(snapshot.additions),
    alterations: frozenArray(snapshot.alterations),
    omissions: frozenArray(snapshot.omissions),
  });
}

function path<Segments extends readonly (string | number)[]>(
  ...segments: Segments
): Readonly<Segments> {
  return Object.freeze(segments);
}

function sameDegree(left: ChordDegree, right: ChordDegree): boolean {
  return left.number === right.number && left.alter === right.alter;
}

function compareDegrees(left: ChordDegree, right: ChordDegree): number {
  if (left.number !== right.number) return left.number - right.number;
  return left.alter - right.alter;
}

function baseRuleForTriad(triad: TriadQuality): LiteralFormulaRuleId {
  switch (triad) {
    case "major":
      return "base-major";
    case "minor":
      return "base-minor";
    case "diminished":
      return "base-diminished";
    case "augmented":
      return "base-augmented";
    case "sus2":
      return "base-sus2";
    case "sus4":
      return "base-sus4";
    case "power":
      return "base-power";
  }
}

function seventhRule(source: ChordSpec): LiteralFormulaRuleId | null {
  if (source.seventh === null) return null;
  switch (source.triad) {
    case "major":
      if (source.seventh === "major") return "seventh-major";
      if (source.seventh === "minor") return "seventh-dominant";
      return null;
    case "minor":
      if (source.seventh === "major") return "seventh-minor-major";
      if (source.seventh === "minor") return "seventh-minor";
      return null;
    case "diminished":
      if (source.seventh === "minor") return "seventh-half-diminished";
      if (source.seventh === "diminished") return "seventh-diminished";
      return null;
    case "augmented":
      return source.seventh === "major" ? "seventh-augmented-major" : null;
    case "sus2":
    case "sus4":
      return source.seventh === "minor"
        ? "extension-suspended-dominant"
        : null;
    case "power":
      return null;
  }
}

function attemptedExtensionRule(
  source: ChordSpec,
): LiteralFormulaRuleId | null {
  if (source.seventh === null) return null;
  if (source.triad === "major" && source.seventh === "major") {
    return "extension-major";
  }
  if (source.triad === "major" && source.seventh === "minor") {
    return "extension-dominant";
  }
  if (source.triad === "minor" && source.seventh === "minor") {
    return "extension-minor";
  }
  if (
    (source.triad === "sus2" || source.triad === "sus4") &&
    source.seventh === "minor"
  ) {
    return "extension-suspended-dominant";
  }
  return null;
}

function extensionFamilyAccepts(
  ruleId: LiteralFormulaRuleId,
  number: DegreeNumber,
): boolean {
  if (ruleId === "extension-suspended-dominant") {
    return number === 9 || number === 13;
  }
  return (
    ruleId === "extension-major" ||
    ruleId === "extension-dominant" ||
    ruleId === "extension-minor"
  );
}

function isNaturalSixth(degree: ChordDegree<6>): boolean {
  return degree.alter === 0;
}

function isExtensionNumber(number: DegreeNumber): boolean {
  return number === 9 || number === 11 || number === 13;
}

function isAdditionNumber(number: DegreeNumber): boolean {
  return (
    number === 2 ||
    number === 3 ||
    number === 4 ||
    number === 6 ||
    number === 9 ||
    number === 11 ||
    number === 13
  );
}

function isAlterationNumber(number: DegreeNumber): boolean {
  return number === 5 || number === 9 || number === 11 || number === 13;
}

function isOmissionNumber(number: DegreeNumber): boolean {
  return number === 3 || number === 5;
}

function alterationPhase(number: DegreeNumber):
  | "structural-alterations"
  | "color-alterations" {
  return number === 9 || number === 11 || number === 13
    ? "color-alterations"
    : "structural-alterations";
}

function isExactAlteredDominantPrerequisite(
  source: ChordSpec,
  modifiers: Pick<ParsedModifierSnapshot, "sixth" | "extensions">,
): boolean {
  return (
    source.triad === "major" &&
    modifiers.sixth === null &&
    source.seventh === "minor" &&
    modifiers.extensions.length === 0
  );
}

function preflight(
  source: ChordSpec,
  evidence: MutableEvidence,
  modifiers: MutableParsedModifierSnapshot,
): Readonly<{
  refusal: TheoryFormulaRefusal | null;
  ruleId: ParsedChordFormulaRuleId;
  sixNineMarkerIndex: number | null;
}> {
  let ruleId: ParsedChordFormulaRuleId = baseRuleForTriad(source.triad);
  const sixth = source.sixth;
  const sourceExtensions = source.extensions;
  const sourceAdditions = source.additions;
  const sourceAlterations = source.alterations;
  const sourceOmissions = source.omissions;

  if (sixth !== null) {
    evidence.inputDegreeRecordsVisited += 1;
    const received = copyDegree(sixth);
    if (!isNaturalSixth(received)) {
      return {
        refusal: Object.freeze({
          code: "theory.sixth_invalid",
          path: path("sixth"),
          phase: "base",
          ruleId,
          received,
          reason: "alteration",
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    if (source.triad !== "major" && source.triad !== "minor") {
      return {
        refusal: Object.freeze({
          code: "theory.sixth_invalid",
          path: path("sixth"),
          phase: "base",
          ruleId,
          received,
          reason: "family",
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    modifiers.sixth = received;
    ruleId = source.triad === "major" ? "sixth-major" : "sixth-minor";
  } else {
    ruleId = seventhRule(source) ?? ruleId;
  }

  const unsupportedSeventh =
    sixth === null &&
    source.seventh !== null &&
    seventhRule(source) === null;
  for (let index = 0; index < sourceExtensions.length; index += 1) {
    const inputDegree = sourceExtensions[index];
    if (inputDegree === undefined) break;
    evidence.inputDegreeRecordsVisited += 1;
    const received = copyDegree(inputDegree);
    if (index >= MAX_THEORY_EXTENSIONS) {
      return {
        refusal: Object.freeze({
          code: "theory.extension_invalid",
          path: path("extensions", index),
          phase: "base",
          ruleId,
          received,
          reason: "count",
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    if (!isExtensionNumber(received.number)) {
      return {
        refusal: Object.freeze({
          code: "theory.extension_invalid",
          path: path("extensions", index),
          phase: "base",
          ruleId,
          received,
          reason: "number",
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    if (received.alter !== 0) {
      return {
        refusal: Object.freeze({
          code: "theory.extension_invalid",
          path: path("extensions", index),
          phase: "base",
          ruleId,
          received,
          reason: "alteration",
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    if (sixth === null && !unsupportedSeventh) {
      const extensionRule = attemptedExtensionRule(source);
      if (extensionRule !== null) ruleId = extensionRule;
      if (
        extensionRule === null ||
        !extensionFamilyAccepts(extensionRule, received.number)
      ) {
        return {
          refusal: Object.freeze({
            code: "theory.extension_invalid",
            path: path("extensions", index),
            phase: "base",
            ruleId,
            received,
            reason: "family",
          }),
          ruleId,
          sixNineMarkerIndex: null,
        };
      }
    }
    modifiers.extensions.push(received);
  }

  if (
    source.colorPolicy === "altered-dominant" &&
    isExactAlteredDominantPrerequisite(source, modifiers)
  ) {
    ruleId = "altered-dominant";
  }

  for (let index = 0; index < sourceAdditions.length; index += 1) {
    const inputDegree = sourceAdditions[index];
    if (inputDegree === undefined) break;
    evidence.inputDegreeRecordsVisited += 1;
    const received = copyDegree(inputDegree);
    const reason =
      index >= MAX_THEORY_ADDITIONS
        ? "count"
        : !isAdditionNumber(received.number)
          ? "number"
          : received.alter !== 0
            ? "alteration"
            : null;
    if (reason !== null) {
      return {
        refusal: Object.freeze({
          code: "theory.addition_invalid",
          path: path("additions", index),
          phase: "additions",
          ruleId,
          received,
          reason,
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    modifiers.additions.push(received);
  }

  for (let index = 0; index < sourceAlterations.length; index += 1) {
    const inputDegree = sourceAlterations[index];
    if (inputDegree === undefined) break;
    evidence.inputDegreeRecordsVisited += 1;
    const received = copyDegree(inputDegree);
    const reason =
      index >= MAX_THEORY_ALTERATIONS
        ? "count"
        : !isAlterationNumber(received.number)
          ? "number"
          : received.alter !== -1 && received.alter !== 1
            ? "alteration"
            : null;
    if (reason !== null) {
      return {
        refusal: Object.freeze({
          code: "theory.alteration_invalid",
          path: path("alterations", index),
          phase: alterationPhase(received.number),
          ruleId,
          received,
          reason,
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    modifiers.alterations.push(received);
  }

  for (let index = 0; index < sourceOmissions.length; index += 1) {
    const received = sourceOmissions[index];
    if (received === undefined) break;
    evidence.inputDegreeRecordsVisited += 1;
    const reason =
      index >= MAX_THEORY_OMISSIONS
        ? "count"
        : !isOmissionNumber(received)
          ? "number"
          : null;
    if (reason !== null) {
      return {
        refusal: Object.freeze({
          code: "theory.omission_invalid",
          path: path("omissions", index),
          phase: "omissions",
          ruleId,
          received,
          reason,
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    modifiers.omissions.push(received);
  }

  if (unsupportedSeventh) {
    const refusal = Object.freeze({
      code: "theory.formula_family_unsupported" as const,
      path: path("seventh"),
      phase: "base" as const,
      ruleId: baseRuleForTriad(source.triad),
      triad: source.triad,
      seventh: source.seventh,
      colorPolicy: source.colorPolicy,
    });
    return { refusal, ruleId: refusal.ruleId, sixNineMarkerIndex: null };
  }

  if (source.colorPolicy === "altered-dominant") {
    if (!isExactAlteredDominantPrerequisite(source, modifiers)) {
      return {
        refusal: Object.freeze({
          code: "theory.color_policy_invalid",
          path: path("colorPolicy"),
          phase: "color-alterations",
          ruleId: "altered-dominant",
          received: "altered-dominant",
          reason: "requires-dominant-seventh",
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
    if (
      modifiers.alterations.some(
        (degree) => degree.number === 5 || degree.number === 9,
      )
    ) {
      return {
        refusal: Object.freeze({
          code: "theory.color_policy_invalid",
          path: path("colorPolicy"),
          phase: "color-alterations",
          ruleId: "altered-dominant",
          received: "altered-dominant",
          reason: "explicit-five-or-nine-alteration",
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
  }

  if (modifiers.sixth !== null && source.seventh !== null) {
    return {
      refusal: Object.freeze({
        code: "theory.modifier_conflict",
        path: path("sixth"),
        phase: "base",
        ruleId,
        conflict: "sixth-with-seventh",
        leftPath: path("sixth"),
        rightPath: path("seventh"),
      }),
      ruleId,
      sixNineMarkerIndex: null,
    };
  }
  if (modifiers.sixth !== null && modifiers.extensions.length > 0) {
    return {
      refusal: Object.freeze({
        code: "theory.modifier_conflict",
        path: path("sixth"),
        phase: "base",
        ruleId,
        conflict: "sixth-with-extension",
        leftPath: path("sixth"),
        rightPath: path("extensions", 0),
      }),
      ruleId,
      sixNineMarkerIndex: null,
    };
  }

  for (let additionIndex = 0; additionIndex < modifiers.additions.length; additionIndex += 1) {
    const addition = modifiers.additions[additionIndex];
    if (addition === undefined) continue;
    const omissionIndex = modifiers.omissions.indexOf(addition.number);
    if (omissionIndex >= 0) {
      return {
        refusal: Object.freeze({
          code: "theory.modifier_conflict",
          path: path("additions", additionIndex),
          phase: "additions",
          ruleId,
          conflict: "addition-omission",
          leftPath: path("additions", additionIndex),
          rightPath: path("omissions", omissionIndex),
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
  }

  for (let alterationIndex = 0; alterationIndex < modifiers.alterations.length; alterationIndex += 1) {
    const alteration = modifiers.alterations[alterationIndex];
    if (alteration === undefined) continue;
    const omissionIndex = modifiers.omissions.indexOf(alteration.number);
    if (omissionIndex >= 0) {
      return {
        refusal: Object.freeze({
          code: "theory.modifier_conflict",
          path: path("alterations", alterationIndex),
          phase: "structural-alterations",
          ruleId,
          conflict: "alteration-omission",
          leftPath: path("alterations", alterationIndex),
          rightPath: path("omissions", omissionIndex),
        }),
        ruleId,
        sixNineMarkerIndex: null,
      };
    }
  }

  const flatFiveIndex = modifiers.alterations.findIndex(
    (degree) => degree.number === 5 && degree.alter === -1,
  );
  const sharpFiveIndex = modifiers.alterations.findIndex(
    (degree) => degree.number === 5 && degree.alter === 1,
  );
  if (flatFiveIndex >= 0 && sharpFiveIndex >= 0) {
    const leftIndex = Math.min(flatFiveIndex, sharpFiveIndex);
    const rightIndex = Math.max(flatFiveIndex, sharpFiveIndex);
    return {
      refusal: Object.freeze({
        code: "theory.modifier_conflict",
        path: path("alterations", leftIndex),
        phase: "structural-alterations",
        ruleId,
        conflict: "structural-alteration-pair",
        leftPath: path("alterations", leftIndex),
        rightPath: path("alterations", rightIndex),
      }),
      ruleId,
      sixNineMarkerIndex: null,
    };
  }

  const sixNineMarkerIndex =
    modifiers.sixth === null
      ? null
      : modifiers.additions.findIndex(
          (degree) => degree.number === 9 && degree.alter === 0,
        );
  return {
    refusal: null,
    ruleId,
    sixNineMarkerIndex:
      sixNineMarkerIndex !== null && sixNineMarkerIndex >= 0
        ? sixNineMarkerIndex
        : null,
  };
}

function baseCandidate(
  degree: ChordDegree,
  required: boolean,
  guide: boolean,
): CandidateDegree {
  return {
    degree: copyDegree(degree),
    required,
    guide,
    origins: [{ kind: "base" }],
  };
}

function modifierCandidate(
  degree: ChordDegree,
  kind: "addition" | "alteration",
  index: number,
): CandidateDegree {
  return {
    degree: copyDegree(degree),
    required: true,
    guide: false,
    origins: [{ kind, index }],
  };
}

function triadBaseCandidates(triad: TriadQuality): CandidateDegree[] {
  switch (triad) {
    case "major":
    case "sus2":
    case "sus4":
      return [
        baseCandidate(ROOT_DEGREE, true, false),
        baseCandidate(NATURAL_THIRD, true, true),
        baseCandidate(PERFECT_FIFTH, false, false),
      ];
    case "minor":
      return [
        baseCandidate(ROOT_DEGREE, true, false),
        baseCandidate(MINOR_THIRD, true, true),
        baseCandidate(PERFECT_FIFTH, false, false),
      ];
    case "diminished":
      return [
        baseCandidate(ROOT_DEGREE, true, false),
        baseCandidate(MINOR_THIRD, true, true),
        baseCandidate(FLAT_FIFTH, true, false),
      ];
    case "augmented":
      return [
        baseCandidate(ROOT_DEGREE, true, false),
        baseCandidate(NATURAL_THIRD, true, true),
        baseCandidate(SHARP_FIFTH, true, false),
      ];
    case "power":
      return [
        baseCandidate(ROOT_DEGREE, true, false),
        baseCandidate(PERFECT_FIFTH, true, false),
      ];
  }
}

function appendSeventh(candidates: CandidateDegree[], source: ChordSpec): void {
  if (source.seventh === null) return;
  const degree =
    source.seventh === "major"
      ? MAJOR_SEVENTH
      : source.seventh === "minor"
        ? MINOR_SEVENTH
        : DIMINISHED_SEVENTH;
  candidates.push(baseCandidate(degree, true, true));
}

function appendExtensionClosure(
  candidates: CandidateDegree[],
  extension: ChordDegree | undefined,
): void {
  if (extension === undefined) return;
  const closure =
    extension.number === 9
      ? [NATURAL_NINTH]
      : extension.number === 11
        ? [NATURAL_NINTH, NATURAL_ELEVENTH]
        : [NATURAL_NINTH, NATURAL_ELEVENTH, NATURAL_THIRTEENTH];
  for (const degree of closure) {
    candidates.push(
      baseCandidate(degree, degree.number === extension.number, false),
    );
  }
}

function literalBaseCandidates(
  source: ChordSpec,
  sixNineMarkerIndex: number | null,
): CandidateDegree[] {
  const candidates = triadBaseCandidates(source.triad);
  if (source.sixth !== null) {
    candidates.push(baseCandidate(MAJOR_SIXTH, true, false));
    if (sixNineMarkerIndex !== null) {
      candidates.push(baseCandidate(NATURAL_NINTH, false, false));
    }
    return candidates;
  }
  appendSeventh(candidates, source);
  appendExtensionClosure(candidates, source.extensions[0]);
  return candidates;
}

function noteInsertion(
  scratch: RealizationScratch,
  candidate: CandidateDegree,
  evidence: MutableEvidence,
): void {
  scratch.candidates.push(candidate);
  evidence.candidateDegreesObserved += 1;
  evidence.peakCandidateDegreeRecords = Math.max(
    evidence.peakCandidateDegreeRecords,
    scratch.candidates.length,
  );
}

function removeNumber(scratch: RealizationScratch, number: DegreeNumber): void {
  scratch.candidates = scratch.candidates.filter(
    (candidate) => candidate.degree.number !== number,
  );
}

function removeNaturalDegree(
  scratch: RealizationScratch,
  number: DegreeNumber,
): void {
  scratch.candidates = scratch.candidates.filter(
    (candidate) =>
      candidate.degree.number !== number || candidate.degree.alter !== 0,
  );
}

function canonicalize(
  scratch: RealizationScratch,
  evidence: MutableEvidence,
): void {
  const ordered = [...scratch.candidates].sort((left, right) =>
    compareDegrees(left.degree, right.degree),
  );
  const merged: CandidateDegree[] = [];
  for (const candidate of ordered) {
    const previous = merged.at(-1);
    if (previous !== undefined && sameDegree(previous.degree, candidate.degree)) {
      previous.required ||= candidate.required;
      previous.guide ||= candidate.guide;
      previous.origins.push(...candidate.origins);
      evidence.duplicateDegreesCanonicalized += 1;
    } else {
      merged.push(candidate);
    }
  }
  scratch.candidates = merged;
}

function spellingPath(candidate: CandidateDegree): ResolverSpellingPath {
  if (candidate.origins.some((origin) => origin.kind === "base")) {
    return path("root");
  }
  const addition = candidate.origins.find(
    (origin): origin is Readonly<{ kind: "addition"; index: number }> =>
      origin.kind === "addition",
  );
  if (addition !== undefined) return path("additions", addition.index);
  const alteration = candidate.origins.find(
    (origin): origin is Readonly<{ kind: "alteration"; index: number }> =>
      origin.kind === "alteration",
  );
  return path("alterations", alteration?.index ?? 0);
}

function captureParsedInput(source: ChordSpec): ChordSpec {
  const sourceText = source.sourceText;
  const root = source.root;
  const triad = source.triad;
  const sixth = source.sixth;
  const seventh = source.seventh;
  const extensions = source.extensions;
  const additions = source.additions;
  const alterations = source.alterations;
  const omissions = source.omissions;
  const bass = source.bass;
  const colorPolicy = source.colorPolicy;
  return Object.freeze({
    kind: "parsed",
    sourceText,
    root: copyPitchClass(root),
    triad,
    sixth,
    seventh,
    extensions,
    additions,
    alterations,
    omissions,
    bass: bass === null ? null : copyPitchClass(bass),
    colorPolicy,
  });
}

function copyParsedSource(
  source: ChordSpec,
  modifiers: ParsedModifierSnapshot,
): ChordSpec {
  return Object.freeze({
    kind: "parsed",
    sourceText: source.sourceText,
    root: copyPitchClass(source.root),
    triad: source.triad,
    sixth: modifiers.sixth,
    seventh: source.seventh,
    extensions: modifiers.extensions,
    additions: modifiers.additions,
    alterations: modifiers.alterations,
    omissions: modifiers.omissions,
    bass: source.bass === null ? null : copyPitchClass(source.bass),
    colorPolicy: source.colorPolicy,
  });
}

function nonemptyDegreeTuple(
  candidates: readonly CandidateDegree[],
): NonEmptyChordDegreeTuple {
  const root = candidates.find(
    (candidate) =>
      candidate.degree.number === ROOT_DEGREE.number &&
      candidate.degree.alter === ROOT_DEGREE.alter,
  );
  if (root === undefined) {
    throw new RangeError("T1 canonicalization lost the mandatory root degree");
  }
  const rest = candidates
    .filter((candidate) => candidate !== root)
    .map((candidate) => candidate.degree);
  return Object.freeze([root.degree, ...rest]);
}

function nonemptyFrozenTuple<Value>(
  values: readonly Value[],
): readonly [Value, ...Value[]] {
  const [first, ...rest] = values;
  if (first === undefined) {
    throw new RangeError("T1 realization projection unexpectedly became empty");
  }
  const tuple: [Value, ...Value[]] = [first, ...rest];
  return Object.freeze(tuple);
}

function makeSemanticRealization(
  scratch: RealizationScratch,
  spelledPitchNames: readonly SpelledPitchClass[],
  pitchClasses: readonly PitchClass[],
): SemanticRealization {
  const degrees = nonemptyDegreeTuple(scratch.candidates);
  const requiredDegrees = frozenArray(
    scratch.candidates
      .filter((candidate) => candidate.required)
      .map((candidate) => candidate.degree),
  );
  const optionalDegrees = frozenArray(
    scratch.candidates
      .filter((candidate) => !candidate.required)
      .map((candidate) => candidate.degree),
  );
  const guideToneDegrees = frozenArray(
    scratch.candidates
      .filter((candidate) => candidate.guide && candidate.required)
      .map((candidate) => candidate.degree),
  );
  const spelledPitchTuple = nonemptyFrozenTuple(spelledPitchNames);
  const pitchClassTuple = nonemptyFrozenTuple(pitchClasses);
  if (scratch.id === "literal") {
    return Object.freeze({
      kind: "semantic",
      id: scratch.id,
      formulaRuleId: scratch.formulaRuleId,
      degrees,
      requiredDegrees,
      optionalDegrees,
      guideToneDegrees,
      spelledPitchNames: spelledPitchTuple,
      pitchClasses: pitchClassTuple,
    });
  }
  return Object.freeze({
    kind: "semantic",
    id: scratch.id,
    formulaRuleId: scratch.formulaRuleId,
    degrees,
    requiredDegrees,
    optionalDegrees,
    guideToneDegrees,
    spelledPitchNames: spelledPitchTuple,
    pitchClasses: pitchClassTuple,
  });
}

function warningForAbsentThird(index: number): TheoryWarning {
  return Object.freeze({
    code: "theory.omission_absent",
    path: path("omissions", index),
    degreeNumber: 3,
    message: "The requested third omission had no matching degree to remove.",
  });
}

function formulaFailure(
  refusal: TheoryFormulaRefusal,
  evidence: MutableEvidence,
): ParsedCoreEnvelope {
  return Object.freeze({
    result: Object.freeze({ ok: false, refusal }),
    evidence: freezeEvidence(evidence, "formula-refusal"),
  });
}

function outputLimitFailure(
  refusal: TheoryOutputLimitRefusal,
  evidence: MutableEvidence,
): ParsedCoreEnvelope {
  return Object.freeze({
    result: Object.freeze({ ok: false, refusal }),
    evidence: freezeEvidence(evidence, "output-limit-refusal"),
  });
}

function spellingFailure(
  refusal: TheorySpellingRefusal,
  evidence: MutableEvidence,
): ParsedCoreEnvelope {
  return Object.freeze({
    result: Object.freeze({ ok: false, refusal }),
    evidence: freezeEvidence(evidence, "spelling-refusal"),
  });
}

function resolveParsedCore(source: ChordSpec): ParsedCoreEnvelope {
  const evidence = emptyEvidence();
  const capturedSource = captureParsedInput(source);
  const mutableModifiers = emptyParsedModifierSnapshot();
  const checked = preflight(capturedSource, evidence, mutableModifiers);
  if (checked.refusal !== null) {
    return formulaFailure(checked.refusal, evidence);
  }
  const sourceSnapshot = copyParsedSource(
    capturedSource,
    freezeParsedModifierSnapshot(mutableModifiers),
  );

  const scratches: RealizationScratch[] =
    checked.ruleId === "altered-dominant"
      ? ALT_VARIANT_SEEDS.map((variant) => ({
          id: variant.id,
          formulaRuleId: "altered-dominant",
          candidates: [],
        }))
      : [
          {
            id: "literal",
            formulaRuleId: checked.ruleId,
            candidates: [],
          },
        ];

  // Phase 1: base.
  for (const scratch of scratches) {
    evidence.formulaPhaseTransitions += 1;
    const baseDegrees =
      scratch.id === "literal"
        ? literalBaseCandidates(sourceSnapshot, checked.sixNineMarkerIndex)
        : ALT_VARIANT_SEEDS.find((variant) => variant.id === scratch.id)?.degrees;
    if (baseDegrees === undefined) {
      throw new RangeError(`missing altered-dominant seed: ${scratch.id}`);
    }
    for (const degreeOrCandidate of baseDegrees) {
      const candidate =
        "degree" in degreeOrCandidate
          ? degreeOrCandidate
          : baseCandidate(
              degreeOrCandidate,
              true,
              degreeOrCandidate.number === 3 || degreeOrCandidate.number === 7,
            );
      noteInsertion(scratch, candidate, evidence);
    }
  }

  // Phase 2: suspension.
  for (const scratch of scratches) {
    evidence.formulaPhaseTransitions += 1;
    if (sourceSnapshot.triad === "sus2" || sourceSnapshot.triad === "sus4") {
      removeNumber(scratch, 3);
      noteInsertion(
        scratch,
        baseCandidate(
          sourceSnapshot.triad === "sus2"
            ? Object.freeze({ number: 2, alter: 0 })
            : Object.freeze({ number: 4, alter: 0 }),
          true,
          true,
        ),
        evidence,
      );
    }
  }

  // Phase 3: structural fifth alterations.
  for (const scratch of scratches) {
    evidence.formulaPhaseTransitions += 1;
    for (let index = 0; index < sourceSnapshot.alterations.length; index += 1) {
      const degree = sourceSnapshot.alterations[index];
      if (degree === undefined || degree.number !== 5) continue;
      removeNaturalDegree(scratch, 5);
      noteInsertion(scratch, modifierCandidate(degree, "alteration", index), evidence);
    }
  }

  // Phase 4: color alterations.
  for (const scratch of scratches) {
    evidence.formulaPhaseTransitions += 1;
    for (let index = 0; index < sourceSnapshot.alterations.length; index += 1) {
      const degree = sourceSnapshot.alterations[index];
      if (degree === undefined || degree.number === 5) continue;
      removeNaturalDegree(scratch, degree.number);
      noteInsertion(scratch, modifierCandidate(degree, "alteration", index), evidence);
    }
  }

  // Phase 5: additions.
  for (const scratch of scratches) {
    evidence.formulaPhaseTransitions += 1;
    for (let index = 0; index < sourceSnapshot.additions.length; index += 1) {
      const degree = sourceSnapshot.additions[index];
      if (degree === undefined || index === checked.sixNineMarkerIndex) continue;
      noteInsertion(scratch, modifierCandidate(degree, "addition", index), evidence);
    }
  }

  // Phase 6: omissions. A family-wide absence creates one warning, not one per
  // altered realization.
  const warnings: TheoryWarning[] = [];
  evidence.formulaPhaseTransitions += scratches.length;
  for (let index = 0; index < sourceSnapshot.omissions.length; index += 1) {
    const number = sourceSnapshot.omissions[index];
    if (number === undefined) continue;
    const wasPresent = scratches.some((scratch) =>
      scratch.candidates.some((candidate) => candidate.degree.number === number),
    );
    for (const scratch of scratches) removeNumber(scratch, number);
    if (!wasPresent && number === 3) warnings.push(warningForAbsentThird(index));
  }

  // Phase 7: canonicalization and the whole-realization output bound.
  for (const scratch of scratches) {
    evidence.formulaPhaseTransitions += 1;
    canonicalize(scratch, evidence);
    if (scratch.candidates.length > MAX_THEORY_DEGREES_PER_REALIZATION) {
      const refusal = Object.freeze({
        code: "limit.theory_realization_degrees_exceeded" as const,
        path: path(),
        phase: "canonicalization" as const,
        ruleId: scratch.formulaRuleId,
        received: scratch.candidates.length,
        maximum: MAX_THEORY_DEGREES_PER_REALIZATION,
      });
      return outputLimitFailure(refusal, evidence);
    }
  }

  // Phase 8: spelling in stable realization and canonical degree order.
  const realized: SemanticRealization[] = [];
  for (const scratch of scratches) {
    evidence.formulaPhaseTransitions += 1;
    const spelled: SpelledPitchClass[] = [];
    const pitchClasses: PitchClass[] = [];
    for (const candidate of scratch.candidates) {
      evidence.spellingAttempts += 1;
      const result = spellChordDegree(sourceSnapshot.root, candidate.degree);
      if (!result.ok) {
        const refusal = Object.freeze({
          ...result.refusal,
          path: spellingPath(candidate),
        });
        return spellingFailure(refusal, evidence);
      }
      spelled.push(result.value.spelled);
      pitchClasses.push(result.value.pitchClass);
    }
    realized.push(makeSemanticRealization(scratch, spelled, pitchClasses));
  }

  const warningsTuple: TheoryWarnings =
    warnings.length === 0
      ? Object.freeze([])
      : Object.freeze([warnings[0] ?? warningForAbsentThird(0)]);
  const realizations = Object.freeze([...realized]) as
    | LiteralRealizationTuple
    | AlteredDominantRealizationTuple;
  const value = Object.freeze({
    schema: RESOLVED_CHORD_SCHEMA,
    formulaTableId: CHORD_FORMULA_TABLE_ID,
    formulaTableVersion: CHORD_FORMULA_TABLE_VERSION,
    degreeSpellingPolicyId: DEGREE_SPELLING_POLICY_ID,
    degreeSpellingPolicyVersion: DEGREE_SPELLING_POLICY_VERSION,
    degreeRolePolicyId: DEGREE_ROLE_POLICY_ID,
    degreeRolePolicyVersion: DEGREE_ROLE_POLICY_VERSION,
    source: sourceSnapshot,
    realizations,
    bass: sourceSnapshot.bass,
    warnings: warningsTuple,
  });
  const result = Object.freeze({ ok: true as const, value });
  evidence.realizationsProduced = realized.length;
  evidence.degreesProduced = realized.reduce(
    (total, realization) => total + realization.degrees.length,
    0,
  );
  evidence.warningsProduced = warningsTuple.length;
  return Object.freeze({
    result,
    evidence: freezeEvidence(evidence, "complete"),
  });
}

function copyCustomPitchTuple(
  pitches: CustomChordSpec["pitchNames"],
): NonEmptySpelledPitchClassTuple {
  const [first, ...rest] = pitches;
  return Object.freeze([copyPitchClass(first), ...rest.map(copyPitchClass)]) as
    NonEmptySpelledPitchClassTuple;
}

function copyCustomLimitations(): typeof CUSTOM_REALIZATION_LIMITATIONS {
  const [noDegreeAnalysis, noAutoVoicing] = CUSTOM_REALIZATION_LIMITATIONS;
  return Object.freeze([noDegreeAnalysis, noAutoVoicing]);
}

function resolveCustomCore(source: CustomChordSpec): Readonly<{
  result: CustomResolveChordResult;
  evidence: ResolutionWorkEvidence<"complete">;
}> {
  const pitchNames = copyCustomPitchTuple(source.pitchNames);
  const sourceBass = source.bass;
  const bass = sourceBass === null ? null : copyPitchClass(sourceBass);
  const sourceCopy = Object.freeze({
    kind: "custom" as const,
    sourceText: source.sourceText,
    label: source.label,
    pitchNames,
    bass,
  });
  const pitchClasses = Object.freeze(
    pitchNames.map((pitch) => pitchClassOf(pitch)),
  ) as CustomResolveChordResult["value"]["realizations"][0]["pitchClasses"];
  const realization = Object.freeze({
    kind: "custom" as const,
    id: "custom" as const,
    formulaRuleId: "custom" as const,
    degrees: null,
    requiredDegrees: null,
    optionalDegrees: null,
    guideToneDegrees: null,
    spelledPitchNames: pitchNames,
    pitchClasses,
    limitations: copyCustomLimitations(),
  });
  const value = Object.freeze({
    schema: RESOLVED_CHORD_SCHEMA,
    formulaTableId: CHORD_FORMULA_TABLE_ID,
    formulaTableVersion: CHORD_FORMULA_TABLE_VERSION,
    degreeSpellingPolicyId: DEGREE_SPELLING_POLICY_ID,
    degreeSpellingPolicyVersion: DEGREE_SPELLING_POLICY_VERSION,
    degreeRolePolicyId: DEGREE_ROLE_POLICY_ID,
    degreeRolePolicyVersion: DEGREE_ROLE_POLICY_VERSION,
    source: sourceCopy,
    realizations: Object.freeze([realization] as const),
    bass,
    warnings: Object.freeze([] as const),
  });
  return Object.freeze({
    result: Object.freeze({ ok: true, value }),
    evidence: Object.freeze({
      inputDegreeRecordsVisited: 0,
      formulaPhaseTransitions: 0,
      candidateDegreesObserved: 0,
      duplicateDegreesCanonicalized: 0,
      realizationsProduced: 1,
      spellingAttempts: 0,
      degreesProduced: 0,
      warningsProduced: 0,
      peakCandidateDegreeRecords: 0,
      termination: "complete",
    }),
  });
}

function resolveCore(source: ChordSpec | CustomChordSpec): Readonly<{
  result: ResolveChordResult;
  evidence: ResolutionWorkEvidence;
}> {
  return source.kind === "custom"
    ? resolveCustomCore(source)
    : resolveParsedCore(source);
}

function resolveChordImplementation(
  source: ChordSpec | CustomChordSpec,
): ResolveChordResult {
  return resolveCore(source).result;
}

/** Resolve a typed chord through the fixed T1 formula and modifier pipeline. */
export const resolveChord = resolveChordImplementation as ResolveChord;

function resolveChordWithEvidenceImplementation(
  source: ChordSpec | CustomChordSpec,
): ResolveChordWithEvidenceResult {
  return resolveCore(source) as ResolveChordWithEvidenceResult;
}

/** Package-private deterministic work evidence over the identical core. */
export const resolveChordWithEvidence =
  resolveChordWithEvidenceImplementation as ResolveChordWithEvidence;
