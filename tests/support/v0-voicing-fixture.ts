import candidateFixtureValue from "../fixtures/voicing/candidate-cases.json";

import {
  makeAutoVoicing,
  makeChordDegree,
  makeFrozenVoicing,
  makeManualVoicing,
  makeSpelledPitch,
  type AutoBassPolicy,
  type AutoVoiceCount,
  type AutoVoicing,
  type AutoVoicingFamily,
  type ChordDegree,
  type FrozenVoicing,
  type ManualVoicing,
  type SpelledPitch,
  type SpelledPitchClass,
  type StoredBassPolicy,
} from "../../src/domain";
import {
  QUARTAL_CONTEXT_POLICY_ID,
  QUARTAL_CONTEXT_POLICY_VERSION,
  QUARTAL_CONTEXT_SCHEMA,
  VOICING_REQUEST_SCHEMA,
  type AutoVoicingRequest,
  type QuartalContext,
  type QuartalContextInvalidReason,
  type QuartalDegreeSequence,
  type RealizeVoicingRequest,
  type StoredVoicingRequest,
  type VoicingCandidate,
  type VoicingCandidateVoice,
  type VoicingConstraintUnsatisfiedReason,
  type VoicingLocalScore,
  type VoicingRefusalCode,
  type VoicingTermination,
} from "../../src/theory/voicing-candidates-contract";
import { resolveChord } from "../../src/theory/chord-resolution";
import { parseChordSymbol } from "../../src/theory/chord-symbol";
import type {
  ParsedResolvedChord,
  SemanticRealizationId,
} from "../../src/theory/resolution-contract";

type DegreeNumberToken =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "9"
  | "11"
  | "13";
type DegreeAccidentalToken = "" | "bb" | "b" | "#" | "##";

export type V0DegreeToken = `${DegreeAccidentalToken}${DegreeNumberToken}`;

export type V0PitchRecipe = Readonly<{
  step: SpelledPitch["step"];
  alter: SpelledPitch["alter"];
  octave: number;
}>;

export type V0CandidateVoiceRecipe = Readonly<{
  spelling: V0PitchRecipe;
  midi: number;
  degree: V0DegreeToken | null;
  sourceDegreeIndex: number | null;
  provenance: VoicingCandidateVoice["provenance"];
}>;

export type V0CandidateVoiceProjection = Readonly<{
  spelling: SpelledPitch;
  midi: number;
  degree: V0DegreeToken | null;
  sourceDegreeIndex: number | null;
  provenance: VoicingCandidateVoice["provenance"];
}>;

export type V0AutoPolicyRecipe = Readonly<{
  family: AutoVoicingFamily;
  voiceCount: AutoVoiceCount;
  range: Readonly<{
    lowMidi: number;
    highMidi: number;
  }>;
  bassPolicy: AutoBassPolicy;
}>;

export type V0QuartalContextRecipe = Readonly<{
  evidenceKind: QuartalContext["evidenceKind"];
  evidenceId: string;
  evidenceVersion: number;
  degreeSequence: readonly [
    V0DegreeToken,
    V0DegreeToken,
    ...V0DegreeToken[],
  ];
}>;

export type V0Drop2Expectation = Readonly<{
  closedSourceMidi: readonly number[];
  secondFromTopSourceOrdinal: number;
  loweredBySemitones: 12;
  transformedMidi: readonly number[];
}>;

export type V0CandidateSuccessExpectation = Readonly<{
  kind: "must-contain-candidate";
  voices: readonly V0CandidateVoiceRecipe[];
  templateId?: string;
  omittedDegrees?: readonly V0DegreeToken[];
  doubledDegrees?: readonly V0DegreeToken[];
  externalBass?: SpelledPitchClass | null;
  spanSemitones?: number;
  atLeastOneAdjacentGapSemitones?: number;
  exactAdjacentSemitones?: readonly number[];
  adjacentSemitones?: readonly number[];
  drop2?: V0Drop2Expectation;
  rawCandidateCount?: number;
  retainedCandidateCount?: number;
  localScore?: VoicingLocalScore;
  noOtherAlteredRealizationMerged?: true;
  slashBassSourceDegreeIndex?: null;
  externalBassVoiceCounted?: false;
}>;

export type V0CandidateRefusalExpectation = Readonly<{
  kind: "refusal";
  code: VoicingRefusalCode;
  termination: Exclude<
    VoicingTermination,
    "complete-generated" | "complete-bypass"
  >;
  primaryReason?: VoicingConstraintUnsatisfiedReason;
  reasons?: readonly VoicingConstraintUnsatisfiedReason[];
  reason?: QuartalContextInvalidReason;
  absentDegrees?: readonly V0DegreeToken[];
  omittedRequiredDegrees?: readonly V0DegreeToken[];
  omittedGuideToneDegrees?: readonly V0DegreeToken[];
  available?: readonly SemanticRealizationId[];
}>;

export type V0StoredBypassExpectation = Readonly<{
  kind: "stored-bypass";
  candidateGenerationPerformed: false;
  sameObjectValue: true;
  generatedByUnchanged?: true;
  rawCandidateCount: 0;
  retainedCandidateCount: 0;
  allCounters: 0;
  termination: "complete-bypass";
}>;

export type V0StoredVoicingRecipe =
  | Readonly<{
      mode: "manual";
      bassPolicy: StoredBassPolicy;
      pitches: readonly [V0PitchRecipe, ...V0PitchRecipe[]];
    }>
  | Readonly<{
      mode: "frozen";
      bassPolicy: StoredBassPolicy;
      pitches: readonly [V0PitchRecipe, ...V0PitchRecipe[]];
      generatedBy: FrozenVoicing["generatedBy"];
    }>;

type V0CandidateCaseCommon = Readonly<{
  id: string;
  description: string;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

export type V0AutoCandidateCaseRecipe = V0CandidateCaseCommon &
  Readonly<{
    sourceSymbol: string;
    realizationId: SemanticRealizationId;
    policy: V0AutoPolicyRecipe;
    quartalContext?: V0QuartalContextRecipe | null;
    expected:
      | V0CandidateSuccessExpectation
      | V0CandidateRefusalExpectation;
  }>;

export type V0StoredCandidateCaseRecipe = V0CandidateCaseCommon &
  Readonly<{
    request: Readonly<{
      kind: "stored";
      voicing: V0StoredVoicingRecipe;
    }>;
    expected: V0StoredBypassExpectation;
  }>;

export type V0CandidateCaseRecipe =
  | V0AutoCandidateCaseRecipe
  | V0StoredCandidateCaseRecipe;

export type V0CandidateCaseFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  status: string;
  productionOutputUsed: false;
  expectedValuesGenerated: false;
  pitchConvention: string;
  casePolicy: Readonly<Record<string, string>>;
  cases: readonly V0CandidateCaseRecipe[];
}>;

/** Independently authored recipes. Production never imports this document. */
export const V0_CANDIDATE_CASE_FIXTURE =
  candidateFixtureValue as unknown as V0CandidateCaseFixture;

export const V0_CANDIDATE_CASES = V0_CANDIDATE_CASE_FIXTURE.cases;

function fixtureFailure(
  caseId: string,
  phase: string,
  detail: string,
): never {
  throw new Error(`V0_TEST_FIXTURE:${caseId}:${phase}:${detail}`);
}

export function v0CandidateCase(caseId: string): V0CandidateCaseRecipe {
  const recipe = V0_CANDIDATE_CASES.find(({ id }) => id === caseId);
  if (recipe === undefined) fixtureFailure(caseId, "lookup", "missing-case");
  return recipe;
}

function degreeNumberFromToken(
  token: V0DegreeToken,
  caseId: string,
): ChordDegree["number"] {
  const numeric = Number.parseInt(
    token.replaceAll("b", "").replaceAll("#", ""),
    10,
  );
  switch (numeric) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 9:
    case 11:
    case 13:
      return numeric;
    default:
      return fixtureFailure(caseId, "degree-token", token);
  }
}

function degreeAlterFromToken(
  token: V0DegreeToken,
  caseId: string,
): ChordDegree["alter"] {
  const prefix = token.slice(0, token.search(/[0-9]/u));
  switch (prefix) {
    case "bb":
      return -2;
    case "b":
      return -1;
    case "":
      return 0;
    case "#":
      return 1;
    case "##":
      return 2;
    default:
      return fixtureFailure(caseId, "degree-token", token);
  }
}

export function v0DegreeFromToken(
  token: V0DegreeToken,
  caseId = "degree-helper",
): ChordDegree {
  const result = makeChordDegree({
    number: degreeNumberFromToken(token, caseId),
    alter: degreeAlterFromToken(token, caseId),
  });
  if (!result.ok) {
    return fixtureFailure(caseId, "degree-token", result.refusal.code);
  }
  return result.value;
}

export function v0DegreeToken(degree: ChordDegree): V0DegreeToken {
  const accidental = (() => {
    switch (degree.alter) {
      case -2:
        return "bb";
      case -1:
        return "b";
      case 0:
        return "";
      case 1:
        return "#";
      case 2:
        return "##";
    }
  })();
  return `${accidental}${degree.number.toString()}` as V0DegreeToken;
}

function spelledPitchFromRecipe(
  recipe: V0PitchRecipe,
  caseId: string,
): SpelledPitch {
  const result = makeSpelledPitch(recipe);
  if (!result.ok) {
    return fixtureFailure(caseId, "pitch", result.refusal.code);
  }
  return result.value;
}

function semanticRealizationId(
  value: string,
  caseId: string,
): SemanticRealizationId {
  switch (value) {
    case "literal":
    case "alt-b9-b5":
    case "alt-b9-sharp5":
    case "alt-sharp9-b5":
    case "alt-sharp9-sharp5":
      return value;
    default:
      return fixtureFailure(caseId, "realization-id", value);
  }
}

function degreeAt(
  degrees: readonly ChordDegree[],
  index: number,
  caseId: string,
): ChordDegree {
  const degree = degrees[index];
  if (degree === undefined) {
    return fixtureFailure(caseId, "quartal-context", "degree-count");
  }
  return degree;
}

function quartalDegreeSequence(
  tokens: readonly V0DegreeToken[],
  caseId: string,
): QuartalDegreeSequence {
  const degrees = tokens.map((token) => v0DegreeFromToken(token, caseId));
  switch (degrees.length) {
    case 2:
      return Object.freeze([
        degreeAt(degrees, 0, caseId),
        degreeAt(degrees, 1, caseId),
      ]);
    case 3:
      return Object.freeze([
        degreeAt(degrees, 0, caseId),
        degreeAt(degrees, 1, caseId),
        degreeAt(degrees, 2, caseId),
      ]);
    case 4:
      return Object.freeze([
        degreeAt(degrees, 0, caseId),
        degreeAt(degrees, 1, caseId),
        degreeAt(degrees, 2, caseId),
        degreeAt(degrees, 3, caseId),
      ]);
    case 5:
      return Object.freeze([
        degreeAt(degrees, 0, caseId),
        degreeAt(degrees, 1, caseId),
        degreeAt(degrees, 2, caseId),
        degreeAt(degrees, 3, caseId),
        degreeAt(degrees, 4, caseId),
      ]);
    case 6:
      return Object.freeze([
        degreeAt(degrees, 0, caseId),
        degreeAt(degrees, 1, caseId),
        degreeAt(degrees, 2, caseId),
        degreeAt(degrees, 3, caseId),
        degreeAt(degrees, 4, caseId),
        degreeAt(degrees, 5, caseId),
      ]);
    case 7:
      return Object.freeze([
        degreeAt(degrees, 0, caseId),
        degreeAt(degrees, 1, caseId),
        degreeAt(degrees, 2, caseId),
        degreeAt(degrees, 3, caseId),
        degreeAt(degrees, 4, caseId),
        degreeAt(degrees, 5, caseId),
        degreeAt(degrees, 6, caseId),
      ]);
    default:
      return fixtureFailure(caseId, "quartal-context", "degree-count");
  }
}

export function buildV0QuartalContext(
  recipe: V0QuartalContextRecipe,
  caseId = "quartal-context-helper",
): QuartalContext {
  return Object.freeze({
    schema: QUARTAL_CONTEXT_SCHEMA,
    policyId: QUARTAL_CONTEXT_POLICY_ID,
    policyVersion: QUARTAL_CONTEXT_POLICY_VERSION,
    evidenceKind: recipe.evidenceKind,
    evidenceId: recipe.evidenceId,
    evidenceVersion: recipe.evidenceVersion,
    degreeSequence: quartalDegreeSequence(recipe.degreeSequence, caseId),
  });
}

function resolveCandidateSource(
  recipe: V0AutoCandidateCaseRecipe,
): ParsedResolvedChord {
  const parsed = parseChordSymbol(recipe.sourceSymbol, "ascii");
  if (!parsed.ok) {
    const code = parsed.diagnostics[0].code;
    return fixtureFailure(recipe.id, "parse", code);
  }
  const resolved = resolveChord(parsed.chord);
  if (!resolved.ok) {
    return fixtureFailure(recipe.id, "resolve", resolved.refusal.code);
  }
  return resolved.value;
}

function buildAutoPolicy(
  recipe: V0AutoCandidateCaseRecipe,
  resolved: ParsedResolvedChord,
): AutoVoicing {
  const result = makeAutoVoicing(
    {
      mode: "auto",
      family: recipe.policy.family,
      voiceCount: recipe.policy.voiceCount,
      range: recipe.policy.range,
      bassPolicy: recipe.policy.bassPolicy,
    },
    resolved.bass,
  );
  if (!result.ok) {
    return fixtureFailure(recipe.id, "auto-policy", result.refusal.code);
  }
  return result.value;
}

/**
 * Materializes the recipe through the real T0, T1, and F1 constructors. The
 * final cast admits the one deliberate defensive-runtime case (Quartal with a
 * null context), which the public correlated TypeScript union rightly rejects.
 */
export function buildV0AutoCandidateRequest(
  recipe: V0AutoCandidateCaseRecipe,
): RealizeVoicingRequest {
  const resolved = resolveCandidateSource(recipe);
  const policy = buildAutoPolicy(recipe, resolved);
  const quartalContext =
    recipe.quartalContext === undefined || recipe.quartalContext === null
      ? null
      : buildV0QuartalContext(recipe.quartalContext, recipe.id);
  const materialized = Object.freeze({
    schema: VOICING_REQUEST_SCHEMA,
    kind: "auto" as const,
    resolved,
    realizationId: semanticRealizationId(recipe.realizationId, recipe.id),
    policy,
    quartalContext,
  });
  return materialized as unknown as AutoVoicingRequest;
}

function buildStoredVoicing(
  recipe: V0StoredCandidateCaseRecipe,
): ManualVoicing | FrozenVoicing {
  const source = recipe.request.voicing;
  const pitches = source.pitches.map((pitch) =>
    spelledPitchFromRecipe(pitch, recipe.id),
  );
  if (source.mode === "manual") {
    const result = makeManualVoicing(
      { mode: "manual", pitches, bassPolicy: source.bassPolicy },
      null,
    );
    if (!result.ok) {
      return fixtureFailure(recipe.id, "manual-voicing", result.refusal.code);
    }
    return result.value;
  }

  const result = makeFrozenVoicing(
    {
      mode: "frozen",
      pitches,
      bassPolicy: source.bassPolicy,
      generatedBy: source.generatedBy,
    },
    null,
  );
  if (!result.ok) {
    return fixtureFailure(recipe.id, "frozen-voicing", result.refusal.code);
  }
  return result.value;
}

export function buildV0StoredCandidateRequest(
  recipe: V0StoredCandidateCaseRecipe,
): StoredVoicingRequest {
  return Object.freeze({
    schema: VOICING_REQUEST_SCHEMA,
    kind: "stored",
    voicing: buildStoredVoicing(recipe),
  });
}

export function buildV0CandidateRequest(
  recipe: V0CandidateCaseRecipe,
): RealizeVoicingRequest {
  return "sourceSymbol" in recipe
    ? buildV0AutoCandidateRequest(recipe)
    : buildV0StoredCandidateRequest(recipe);
}

export function projectV0CandidateVoice(
  voice: VoicingCandidateVoice,
): V0CandidateVoiceProjection {
  return Object.freeze({
    spelling: Object.freeze({ ...voice.pitch }),
    midi: voice.midi,
    degree: voice.degree === null ? null : v0DegreeToken(voice.degree),
    sourceDegreeIndex: voice.sourceDegreeIndex,
    provenance: voice.provenance,
  });
}

export function projectV0CandidateVoices(
  candidate: Pick<VoicingCandidate, "voices">,
): readonly V0CandidateVoiceProjection[] {
  return Object.freeze(candidate.voices.map(projectV0CandidateVoice));
}

export function projectV0ExpectedVoices(
  expected: Pick<V0CandidateSuccessExpectation, "voices">,
): readonly V0CandidateVoiceProjection[] {
  return Object.freeze(
    expected.voices.map((voice) =>
      Object.freeze({
        spelling: spelledPitchFromRecipe(voice.spelling, "expected-voice"),
        midi: voice.midi,
        degree: voice.degree,
        sourceDegreeIndex: voice.sourceDegreeIndex,
        provenance: voice.provenance,
      }),
    ),
  );
}

function projectionsEqual(
  left: readonly V0CandidateVoiceProjection[],
  right: readonly V0CandidateVoiceProjection[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((voice, index) => {
    const expected = right[index];
    return (
      expected !== undefined &&
      voice.spelling.step === expected.spelling.step &&
      voice.spelling.alter === expected.spelling.alter &&
      voice.spelling.octave === expected.spelling.octave &&
      voice.midi === expected.midi &&
      voice.degree === expected.degree &&
      voice.sourceDegreeIndex === expected.sourceDegreeIndex &&
      voice.provenance === expected.provenance
    );
  });
}

export function v0CandidateHasExpectedVoices(
  candidate: VoicingCandidate,
  expected: Pick<V0CandidateSuccessExpectation, "voices">,
): boolean {
  if (!candidate.voices.every((voice, index) => voice.ordinal === index)) {
    return false;
  }
  if (
    candidate.pitches.length !== candidate.voices.length ||
    !candidate.pitches.every((pitch, index) => {
      const voice = candidate.voices[index];
      return (
        voice !== undefined &&
        pitch.step === voice.pitch.step &&
        pitch.alter === voice.pitch.alter &&
        pitch.octave === voice.pitch.octave
      );
    })
  ) {
    return false;
  }
  return projectionsEqual(
    projectV0CandidateVoices(candidate),
    projectV0ExpectedVoices(expected),
  );
}

export function findV0CandidateWithExpectedVoices(
  candidates: readonly VoicingCandidate[],
  expected: Pick<V0CandidateSuccessExpectation, "voices">,
): VoicingCandidate | undefined {
  return candidates.find((candidate) =>
    v0CandidateHasExpectedVoices(candidate, expected),
  );
}
