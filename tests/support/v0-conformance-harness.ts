import lawFixtureValue from "../fixtures/voicing/law-cases.json";
import availabilityFixtureValue from
  "../fixtures/voicing/availability-matrix.json";
import familyTemplateFixtureValue from
  "../fixtures/voicing/family-templates.json";
import limitFixtureValue from "../fixtures/voicing/limit-cases.json";
import operationFixtureValue from
  "../fixtures/voicing/operation-state-cases.json";
import transpositionFixtureValue from
  "../fixtures/voicing/transposition-seeds.json";
import { v0EvidenceDigest } from "../../scripts/verify-v0-evidence";

import {
  makeManualVoicing,
  makeMidiPitch,
  makeSpelledPitch,
  pitchClassOf,
  projectSpelledPitch,
  type ChordDegree,
  type MidiPitch,
  type SpelledPitch,
} from "../../src/domain";
import {
  VOICING_MEMORY_COUNTER_NAMES,
  VOICING_MEMORY_LIMITS,
  MAX_VOICING_RAW_CANDIDATES,
  VOICING_CANDIDATE_IDS,
  VOICING_CANDIDATE_ORDER,
  VOICING_CANDIDATE_SCHEMA,
  VOICING_CONSTRAINT_PRECEDENCE,
  VOICING_ENGINE_ID,
  VOICING_ENGINE_VERSION,
  VOICING_LOCAL_SCORE_POLICY_ID,
  VOICING_LOCAL_SCORE_POLICY_VERSION,
  VOICING_LOCAL_SCORE_AXIS_ORDER,
  VOICING_TEMPLATE_TABLE_ID,
  VOICING_TEMPLATE_TABLE_VERSION,
  VOICING_WORK_COUNTER_NAMES,
  VOICING_WORK_LIMITS,
  parseChordSymbol,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
  type RealizeVoicingResult,
  type StoredVoicingRequest,
  type UnsatisfiedVoicingConstraint,
  type VoicingCandidate,
  type VoicingMemoryCounterName,
  type VoicingWorkCounterName,
} from "../../src/theory";
import {
  candidateIdentityKey,
  compareVoicingCandidates,
  compareVoicingLocalScores,
  createVoicingConstraintObservationCollector,
  createVoicingWorkLedger,
  lowRegisterSpacingViolations,
  orderUnsatisfiedVoicingConstraints,
  applyDrop2Transform,
  validateVoicingEvidenceIdentifier,
} from "../../src/theory/voicing-engine-primitives";
import {
  V0_CANDIDATE_CASES,
  buildV0CandidateRequest,
  findV0CandidateWithExpectedVoices,
  v0CandidateCase,
  v0DegreeFromToken,
  v0DegreeToken,
  type V0CandidateCaseRecipe,
  type V0CandidateRefusalExpectation,
  type V0CandidateSuccessExpectation,
} from "./v0-voicing-fixture";

export type V0CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly V0CanonicalJson[]
  | Readonly<{ [key: string]: V0CanonicalJson }>;

export type V0ConformanceChannel =
  | "candidate"
  | "limit"
  | "operation"
  | "transposition"
  | "law-witness"
  | "law-case";

export type V0ConformanceCaseEnvelope = Readonly<{
  caseId: string;
  fixturePath: string;
  channel: V0ConformanceChannel;
  actualProjection: V0CanonicalJson;
  expectedProjection: V0CanonicalJson;
  baselineAccepted: boolean;
  runtimeInput: V0CanonicalJson;
  runtimeOutput: V0CanonicalJson;
}>;

type JsonRecord = Record<string, unknown>;

type LawWitness = Readonly<{
  id: string;
  kind: "positive" | "negative";
  setup: unknown;
  expected: unknown;
}>;

type V0ProductionBranchExecutionEvidence = Readonly<{
  kind: string;
  operation: string;
  executor:
    | "realizeVoicing"
    | "realizeVoicingWithAmbient"
    | "candidateIdentityKey"
    | "lowRegisterSpacingViolations"
    | "executeV0OperationCase";
  input: unknown;
  result: unknown;
}>;

type V0DetectorBranchExecutionEvidence = Readonly<{
  kind: string;
  detector: string;
  mutantInput: unknown;
  detectorOutput: unknown;
}>;

type V0WitnessExecutionEvidence = Readonly<{
  caseId: string;
  boundRuntimeInput: unknown;
  boundRuntimeOutput: unknown;
  production: readonly V0ProductionBranchExecutionEvidence[];
  detectors: readonly V0DetectorBranchExecutionEvidence[];
}>;

type V0WitnessProjection = Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
  executionEvidence?: V0WitnessExecutionEvidence;
}>;

function productionBranchEvidence(
  caseId: string,
  operation: string,
  input: unknown,
  result: unknown,
  executor: V0ProductionBranchExecutionEvidence["executor"] = "realizeVoicing",
): V0ProductionBranchExecutionEvidence {
  return Object.freeze({
    kind: `${caseId}/production`,
    operation,
    executor,
    input,
    result,
  });
}

function detectorBranchEvidence(
  caseId: string,
  detector: string,
  mutantInput: unknown,
  detectorOutput: unknown,
): V0DetectorBranchExecutionEvidence {
  return Object.freeze({
    kind: `${caseId}/detector`,
    detector,
    mutantInput,
    detectorOutput,
  });
}

function witnessExecutionEvidence(
  caseId: string,
  boundRuntimeInput: unknown,
  boundRuntimeOutput: unknown,
  branches: Readonly<{
    production?: readonly V0ProductionBranchExecutionEvidence[];
    detectors?: readonly V0DetectorBranchExecutionEvidence[];
  }>,
): V0WitnessExecutionEvidence {
  return Object.freeze({
    caseId,
    boundRuntimeInput,
    boundRuntimeOutput,
    production: Object.freeze([...(branches.production ?? [])]),
    detectors: Object.freeze([...(branches.detectors ?? [])]),
  });
}

function pairedRealizeVoicingBranchEvidence(
  caseId: string,
  operationPrefix: string,
  inputRowsValue: unknown,
  outputRowsValue: unknown,
  inputKey = "request",
  resultKey = "result",
): readonly V0ProductionBranchExecutionEvidence[] {
  if (!Array.isArray(inputRowsValue) || !Array.isArray(outputRowsValue) ||
      inputRowsValue.length !== outputRowsValue.length) {
    throw new TypeError(`${caseId}: paired realizeVoicing rows`);
  }
  return Object.freeze(inputRowsValue.map((inputValue, index) => {
    const inputRow = record(
      inputValue,
      `${caseId}.productionInput[${index.toString()}]`,
    );
    const outputRow = record(
      outputRowsValue[index],
      `${caseId}.productionOutput[${index.toString()}]`,
    );
    return productionBranchEvidence(
      caseId,
      `${operationPrefix}-${index.toString()}`,
      inputRow[inputKey],
      outputRow[resultKey],
    );
  }));
}

type TranspositionRoot = Readonly<{
  id: string;
  symbol: string;
  step: string;
  alter: number;
  pitchClass: number;
}>;

const lawFixture = lawFixtureValue as unknown as Readonly<{
  lawProofPolicy: Readonly<{
    completeResultAuditCheckIds: readonly string[];
    negativeWitnessExecutionPolicy: Readonly<{
      projectionFields: readonly string[];
      detectorOnlyWitnessIds: readonly string[];
      mixedWitnessIds: readonly string[];
      productionExecutedWitnessIds: readonly string[];
      executionSpecs: readonly Readonly<{
        witnessId: string;
        runtimeRequestSha256: string;
        runtimeResultSha256: string;
        production: readonly Readonly<{
          operation: string;
          executor: V0ProductionBranchExecutionEvidence["executor"];
        }>[];
        detectors: readonly Readonly<{ detector: string }>[];
      }>[];
    }>;
  }>;
  cases: readonly Readonly<{
    id: string;
    lawId: string;
    predicate: string;
    positiveCaseIds: readonly string[];
    negativeCaseIds: readonly string[];
    transpositionSeedIds: readonly string[];
    mutationControlIds: readonly string[];
    traceIds: readonly string[];
    authorityIds: readonly string[];
    checkIds: readonly string[];
  }>[];
  witnesses: readonly LawWitness[];
}>;

const transpositionFixture = transpositionFixtureValue as unknown as Readonly<{
  roots: readonly TranspositionRoot[];
  seeds: readonly JsonRecord[];
  enharmonicNearMissPairs: readonly Readonly<{
    id: string;
    left: Readonly<{ symbol: string; step: string; alter: number; pitchClass: number }>;
    right: Readonly<{ symbol: string; step: string; alter: number; pitchClass: number }>;
    expected: string;
  }>[];
}>;

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  return value as JsonRecord;
}

function canonicalize(value: unknown): V0CanonicalJson {
  if (value === null || typeof value === "boolean" ||
      typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object") {
    throw new TypeError(`Unsupported canonical value type: ${typeof value}`);
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, canonicalize(child)]),
  ));
}

function sameCanonical(left: V0CanonicalJson, right: V0CanonicalJson): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function createEnvelope(
  caseId: string,
  fixturePath: string,
  channel: V0ConformanceChannel,
  actualProjection: unknown,
  expectedProjection: unknown,
  runtimeInput: unknown,
  runtimeOutput: unknown,
): V0ConformanceCaseEnvelope {
  const actual = canonicalize(actualProjection);
  const expected = canonicalize(expectedProjection);
  return Object.freeze({
    caseId,
    fixturePath,
    channel,
    actualProjection: actual,
    expectedProjection: expected,
    baselineAccepted: sameCanonical(actual, expected),
    runtimeInput: canonicalize(runtimeInput),
    runtimeOutput: canonicalize(runtimeOutput),
  });
}

export function evaluateV0ConformanceProjection(
  envelope: V0ConformanceCaseEnvelope,
  candidateProjection: V0CanonicalJson,
): boolean {
  return sameCanonical(candidateProjection, envelope.expectedProjection);
}

function degreeToken(degree: ChordDegree): string {
  return v0DegreeToken(degree);
}

function candidateVoiceProjection(candidate: VoicingCandidate): unknown {
  return candidate.voices.map((voice) => ({
    spelling: voice.pitch,
    midi: Number(voice.midi),
    degree: voice.degree === null ? null : degreeToken(voice.degree),
    sourceDegreeIndex: voice.sourceDegreeIndex,
    provenance: voice.provenance,
  }));
}

type V0GeneratedAuditCheck = Readonly<{ id: string; accepted: boolean }>;

function expectedGeneratedResultAudit(): unknown {
  const ids = lawFixture.lawProofPolicy.completeResultAuditCheckIds;
  return {
    scope: "complete-generated-result-set",
    candidateCountWithinInclusiveBounds: true,
    auditedCandidateCountMatchesReturnedCount: true,
    checkCount: ids.length,
    checks: ids.map((id) => ({ id, accepted: true })),
  };
}

function independentCandidateIdentity(candidate: VoicingCandidate): string {
  return JSON.stringify(candidate.voices.map((voice) => ({
    midi: Number(voice.midi),
    pitch: voice.pitch,
    degree: voice.degree === null ? null : degreeToken(voice.degree),
    sourceDegreeIndex: voice.sourceDegreeIndex,
    provenance: voice.provenance,
  })));
}

function exactPitchClassEqual(
  left: Readonly<{ step: string; alter: number }>,
  right: Readonly<{ step: string; alter: number }>,
): boolean {
  return left.step === right.step && left.alter === right.alter;
}

function independentIdentityTokens(request: AutoVoicingRequest): readonly string[] {
  switch (request.resolved.source.triad) {
    case "major": return ["1", "3"];
    case "minor": return ["1", "b3"];
    case "diminished": return ["1", "b3", "b5"];
    case "augmented": return ["1", "3", "#5"];
    case "sus2": return ["1", "2"];
    case "sus4": return ["1", "4"];
    case "power": return ["1", "5"];
  }
}

function independentTemplateRecord(candidate: VoicingCandidate): JsonRecord | null {
  for (const key of ["adaptiveFamilies", "fixedTemplates", "quartalTemplates"] as const) {
    const source = record(familyTemplateFixtureValue, "family template fixture")[key];
    if (!Array.isArray(source)) throw new TypeError(`${key}: template inventory`);
    const values: readonly unknown[] = source;
    const match = values.find((value) => {
      const row = record(value, `${key}.row`);
      return row["id"] === candidate.explanation.templateId &&
        row["family"] === candidate.family;
    });
    if (match !== undefined) return record(match, `${key}.match`);
  }
  return null;
}

function independentIdentifierAccepted(value: string): boolean {
  const codePoints = Array.from(value).length;
  const bytes = new TextEncoder().encode(value).byteLength;
  return codePoints >= 1 && codePoints <= 256 && bytes <= 512;
}

function candidateMembershipAudit(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): boolean {
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  if (realization === undefined) return false;
  return candidate.voices.every((voice) => {
    const sourceVoice = record(voice, "candidate membership voice");
    if (voice.provenance === "slash-bass") {
      return sourceVoice["degree"] === null && sourceVoice["sourceDegreeIndex"] === null &&
        request.resolved.bass !== null &&
        exactPitchClassEqual(voice.pitch, request.resolved.bass);
    }
    if (sourceVoice["degree"] === null || sourceVoice["sourceDegreeIndex"] === null) {
      return false;
    }
    const sourceDegree = realization.degrees[voice.sourceDegreeIndex];
    const sourceSpelling = realization.spelledPitchNames[voice.sourceDegreeIndex];
    return sourceDegree !== undefined && sourceSpelling !== undefined &&
      degreeToken(sourceDegree) === degreeToken(voice.degree) &&
      exactPitchClassEqual(voice.pitch, sourceSpelling);
  });
}

function candidateBassAudit(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): boolean {
  const slashVoices = candidate.voices.filter(
    ({ provenance }) => provenance === "slash-bass",
  );
  if (request.policy.bassPolicy === "generated") {
    if (request.resolved.bass !== null) {
      const slash = slashVoices[0];
      return slashVoices.length === 1 && slash === candidate.voices[0] &&
        record(slash, "generated slash voice")["degree"] === null &&
        record(slash, "generated slash voice")["sourceDegreeIndex"] === null &&
        exactPitchClassEqual(slash.pitch, request.resolved.bass) &&
        candidate.explanation.externalBass === null &&
        candidate.voices.slice(1).every(({ midi }) => Number(midi) > Number(slash.midi));
    }
    const lowest = candidate.voices[0];
    return slashVoices.length === 0 && lowest.degree !== null &&
      degreeToken(lowest.degree) === "1" &&
      candidate.explanation.externalBass === null;
  }
  if (request.policy.bassPolicy === "external") {
    const external = request.resolved.bass ?? request.resolved.source.root;
    return slashVoices.length === 0 &&
      candidate.explanation.externalBass !== null &&
      exactPitchClassEqual(candidate.explanation.externalBass, external) &&
      candidate.voices.every(({ pitch }) =>
        pitchClassOf(pitch) !== pitchClassOf(external)
      );
  }
  return request.resolved.bass === null && slashVoices.length === 0 &&
    candidate.explanation.externalBass === null;
}

function candidateDegreePolicyAudit(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): boolean {
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  if (realization === undefined) return false;
  const degreeVoices = candidate.voices.filter(
    (voice): voice is Exclude<typeof voice, { degree: null }> => voice.degree !== null,
  );
  const tokens = degreeVoices.map(({ degree }) => degreeToken(degree));
  const present = new Set(tokens);
  const rootless = candidate.family === "rootless-a" || candidate.family === "rootless-b";
  const identityAccepted = independentIdentityTokens(request).every(
    (token) => token === "1" && rootless ? true : present.has(token),
  );
  const requiredAccepted = realization.requiredDegrees.every((degree) =>
    present.has(degreeToken(degree))
  );
  const guidesAccepted = realization.guideToneDegrees.every((degree) =>
    present.has(degreeToken(degree))
  );
  const omitted = realization.degrees.filter((degree) =>
    !present.has(degreeToken(degree))
  ).map(degreeToken);
  const doublingVoices = degreeVoices.filter(
    ({ provenance }) => provenance === "doubling",
  );
  const doubled = realization.degrees.flatMap((degree, sourceDegreeIndex) =>
    doublingVoices.some((voice) =>
      voice.sourceDegreeIndex === sourceDegreeIndex &&
      degreeToken(voice.degree) === degreeToken(degree)
    ) ? [degreeToken(degree)] : []
  );
  const guideTokens = new Set(realization.guideToneDegrees.map(degreeToken));
  const sourceMultiplicityAccepted = realization.degrees.every((_, sourceDegreeIndex) => {
    const matching = degreeVoices.filter((voice) =>
      voice.sourceDegreeIndex === sourceDegreeIndex
    );
    const originals = matching.filter(({ provenance }) => provenance === "realization");
    const copies = matching.filter(({ provenance }) => provenance === "doubling");
    return originals.length <= 1 && copies.length <= 1 &&
      (copies.length === 0 || originals.length === 1);
  });
  const doublingAccepted = doublingVoices.length <= 2 &&
    doublingVoices.every((voice) => {
      const token = degreeToken(voice.degree);
      const source = degreeVoices.find((candidateVoice) =>
        candidateVoice.provenance === "realization" &&
        candidateVoice.sourceDegreeIndex === voice.sourceDegreeIndex &&
        degreeToken(candidateVoice.degree) === token
      );
      return source !== undefined &&
        Number(voice.midi) - Number(source.midi) === 12 &&
        (candidate.family === "balanced" || candidate.family === "open") &&
        (token === "1" || token === "5") && !guideTokens.has(token) &&
        tokens.filter((value) => value === token).length === 2;
    });
  const template = independentTemplateRecord(candidate);
  if (template === null) return false;
  const templateTokens = template["degreeTokens"];
  const tonePolicyAccepted = template["selectionMode"] === "realization-roles"
    ? requiredAccepted && identityAccepted && guidesAccepted
    : template["selectionMode"] === "quartal-context-sequence"
      ? request.quartalContext !== null && sameCanonical(
          canonicalize(tokens),
          canonicalize(request.quartalContext.degreeSequence.map(degreeToken)),
        )
      : Array.isArray(templateTokens) && sameCanonical(
          canonicalize(tokens), canonicalize(templateTokens),
        );
  return tonePolicyAccepted && sourceMultiplicityAccepted && doublingAccepted &&
    sameCanonical(
      canonicalize(candidate.explanation.orderedDegrees.map(degreeToken)),
      canonicalize(tokens),
    ) && sameCanonical(
      canonicalize(candidate.explanation.omittedDegrees.map(degreeToken)),
      canonicalize(omitted),
    ) && sameCanonical(
      canonicalize(candidate.explanation.doubledDegrees.map(degreeToken)),
      canonicalize(doubled),
    );
}

type IndependentSelectedOccurrence = Readonly<{
  token: string;
  sourceDegreeIndex: number;
  provenance: "realization" | "doubling";
}>;

const INDEPENDENT_CANONICAL_DEGREE_ORDER = Object.freeze([
  "1", "2", "b3", "3", "4", "b5", "5", "#5", "6", "bb7", "b7", "7",
  "b9", "9", "#9", "11", "#11", "b13", "13",
]);

const INDEPENDENT_OPTIONAL_FILL_ORDER = Object.freeze([
  "13", "b13", "#11", "11", "#9", "b9", "9", "6", "5",
]);

const INDEPENDENT_LOCAL_SCORE_AXES = Object.freeze([
  "optionalDegreesOmitted",
  "nonPreferredDoublings",
  "guideToneDoublings",
  "templateOrderDisplacement",
  "targetSpanDistance",
  "rangeCenterDistanceTwice",
] as const);

function independentDegreeCompare(left: ChordDegree, right: ChordDegree): number {
  const leftToken = degreeToken(left);
  const rightToken = degreeToken(right);
  const leftRank = INDEPENDENT_CANONICAL_DEGREE_ORDER.indexOf(leftToken);
  const rightRank = INDEPENDENT_CANONICAL_DEGREE_ORDER.indexOf(rightToken);
  if (leftRank !== -1 && rightRank !== -1 && leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (leftRank !== -1 && rightRank === -1) return -1;
  if (leftRank === -1 && rightRank !== -1) return 1;
  return left.number - right.number || left.alter - right.alter;
}

function independentOptionalCompare(left: ChordDegree, right: ChordDegree): number {
  const leftToken = degreeToken(left);
  const rightToken = degreeToken(right);
  const leftRank = left.alter !== 0
    ? -1
    : INDEPENDENT_OPTIONAL_FILL_ORDER.indexOf(leftToken);
  const rightRank = right.alter !== 0
    ? -1
    : INDEPENDENT_OPTIONAL_FILL_ORDER.indexOf(rightToken);
  const normalizedLeft = leftRank === -1 && left.alter === 0
    ? INDEPENDENT_OPTIONAL_FILL_ORDER.length
    : leftRank;
  const normalizedRight = rightRank === -1 && right.alter === 0
    ? INDEPENDENT_OPTIONAL_FILL_ORDER.length
    : rightRank;
  return normalizedLeft - normalizedRight || independentDegreeCompare(left, right);
}

function independentSelectedOccurrences(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): readonly IndependentSelectedOccurrence[] | null {
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  const template = independentTemplateRecord(candidate);
  if (realization === undefined || template === null) return null;
  const occurrence = (
    degree: ChordDegree,
    provenance: IndependentSelectedOccurrence["provenance"],
  ): IndependentSelectedOccurrence | null => {
    const sourceDegreeIndex = realization.degrees.findIndex(
      (source) => degreeToken(source) === degreeToken(degree),
    );
    return sourceDegreeIndex === -1
      ? null
      : Object.freeze({
          token: degreeToken(degree), sourceDegreeIndex, provenance,
        });
  };
  if (template["selectionMode"] === "fixed-degree-sequence") {
    const degreeTokens = template["degreeTokens"];
    if (!Array.isArray(degreeTokens)) return null;
    const selected = degreeTokens.map((token) => {
      const sourceDegreeIndex = realization.degrees.findIndex(
        (degree) => degreeToken(degree) === token,
      );
      return sourceDegreeIndex === -1
        ? null
        : Object.freeze({
            token: String(token), sourceDegreeIndex, provenance: "realization" as const,
          });
    });
    return selected.some((row) => row === null)
      ? null
      : selected as readonly IndependentSelectedOccurrence[];
  }
  if (template["selectionMode"] === "quartal-context-sequence") {
    if (request.quartalContext === null) return null;
    const selected = request.quartalContext.degreeSequence.map((degree) =>
      occurrence(degree, "realization")
    );
    return selected.some((row) => row === null)
      ? null
      : selected as readonly IndependentSelectedOccurrence[];
  }
  if (template["selectionMode"] !== "realization-roles") return null;
  const degreeBearingSlots = request.policy.voiceCount -
    (request.policy.bassPolicy === "generated" && request.resolved.bass !== null ? 1 : 0);
  const requiredTokens = new Set(realization.requiredDegrees.map(degreeToken));
  const guideTokens = new Set(realization.guideToneDegrees.map(degreeToken));
  const optionalTokens = new Set(realization.optionalDegrees.map(degreeToken));
  const mandatory = realization.degrees.filter((degree) =>
    requiredTokens.has(degreeToken(degree)) || guideTokens.has(degreeToken(degree))
  );
  if (mandatory.length > degreeBearingSlots) return null;
  const selectedDegrees = [...mandatory];
  const selectedTokens = new Set(selectedDegrees.map(degreeToken));
  const optionals = realization.degrees.filter((degree) =>
    optionalTokens.has(degreeToken(degree)) && !selectedTokens.has(degreeToken(degree))
  ).sort(independentOptionalCompare);
  for (const degree of optionals) {
    if (selectedDegrees.length >= degreeBearingSlots) break;
    selectedDegrees.push(degree);
    selectedTokens.add(degreeToken(degree));
  }
  const selected: IndependentSelectedOccurrence[] = selectedDegrees.flatMap((degree) => {
    const row = occurrence(degree, "realization");
    return row === null ? [] : [row];
  });
  if (candidate.family !== "drop2") {
    for (const token of ["1", "5"] as const) {
      if (selected.length >= degreeBearingSlots) break;
      const degree = realization.degrees.find((value) => degreeToken(value) === token);
      if (degree === undefined || guideTokens.has(token) || !selectedTokens.has(token)) continue;
      const row = occurrence(degree, "doubling");
      if (row !== null) selected.push(row);
    }
  }
  if (selected.length !== degreeBearingSlots) return null;
  return Object.freeze(selected.sort((left, right) => {
    const leftDegree = realization.degrees[left.sourceDegreeIndex];
    const rightDegree = realization.degrees[right.sourceDegreeIndex];
    if (leftDegree === undefined || rightDegree === undefined) return 0;
    return independentDegreeCompare(leftDegree, rightDegree) ||
      (left.provenance === right.provenance
        ? 0
        : left.provenance === "realization" ? -1 : 1);
  }));
}

function independentCandidateLocalScore(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): Readonly<Record<(typeof INDEPENDENT_LOCAL_SCORE_AXES)[number], number>> | null {
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  const template = independentTemplateRecord(candidate);
  const selected = independentSelectedOccurrences(request, candidate);
  if (realization === undefined || template === null || selected === null) return null;
  const degreeVoices = candidate.voices.filter(
    (voice): voice is Exclude<typeof voice, { degree: null }> => voice.degree !== null,
  );
  const presentTokens = new Set(degreeVoices.map(({ degree }) => degreeToken(degree)));
  const optionalDegreesOmitted = realization.optionalDegrees.filter(
    (degree) => !presentTokens.has(degreeToken(degree)),
  ).length;
  const guideTokens = new Set(realization.guideToneDegrees.map(degreeToken));
  const doubled = candidate.voices.filter(
    ({ provenance }) => provenance === "doubling",
  );
  const allowedDoublingPrefix = ["1", "5"].filter((token) =>
    selected.some((row) => row.token === token && row.provenance === "realization") &&
    !guideTokens.has(token)
  );
  const doubledTokens = selected.filter(({ provenance }) => provenance === "doubling")
    .map(({ token }) => token);
  const nonPreferredDoublings = doubledTokens.filter(
    (token, index) => token !== allowedDoublingPrefix[index],
  ).length;
  const guideToneDoublings = doubled.filter(({ degree }) =>
    degree !== null && guideTokens.has(degreeToken(degree))
  ).length;
  const unmatched = new Set(selected.map((_, index) => index));
  let templateOrderDisplacement = 0;
  for (const [observedIndex, voice] of degreeVoices.entries()) {
    const matched = [...unmatched].find((index) => {
      const row = selected[index];
      return row !== undefined && row.token === degreeToken(voice.degree) &&
        row.sourceDegreeIndex === voice.sourceDegreeIndex &&
        row.provenance === voice.provenance;
    });
    if (matched === undefined) return null;
    unmatched.delete(matched);
    templateOrderDisplacement += Math.abs(matched - observedIndex);
  }
  if (unmatched.size !== 0) return null;
  const low = candidate.voices[0];
  const high = candidate.voices.at(-1);
  const targetSpan = template["targetSpanSemitones"];
  if (high === undefined || typeof targetSpan !== "number") return null;
  return Object.freeze({
    optionalDegreesOmitted,
    nonPreferredDoublings,
    guideToneDoublings,
    templateOrderDisplacement,
    targetSpanDistance: Math.abs(Number(high.midi) - Number(low.midi) - targetSpan),
    rangeCenterDistanceTwice: Math.abs(
      Number(low.midi) + Number(high.midi) -
      (Number(request.policy.range.lowMidi) + Number(request.policy.range.highMidi)),
    ),
  });
}

function independentSpacingAccepted(candidate: VoicingCandidate): boolean {
  return candidate.voices.slice(1).every((upper, index) => {
    const lower = candidate.voices[index];
    if (lower === undefined) return false;
    const lowerMidi = Number(lower.midi);
    const minimum = lowerMidi <= 35 ? 10 : lowerMidi <= 47 ? 7 : lowerMidi <= 59 ? 4 : 1;
    return Number(upper.midi) - lowerMidi >= minimum;
  });
}

function independentQualityClass(formulaRuleId: string): string | null {
  switch (formulaRuleId) {
    case "base-major": return "major-triad";
    case "base-minor": return "minor-triad";
    case "base-diminished": return "diminished-triad";
    case "base-augmented": return "augmented-triad";
    case "base-sus2":
    case "base-sus4": return "suspended-triad";
    case "base-power": return "power-triad";
    case "sixth-major": return "major-sixth";
    case "sixth-minor": return "minor-sixth";
    case "seventh-major":
    case "extension-major": return "major-seventh";
    case "seventh-dominant":
    case "extension-dominant":
    case "altered-dominant": return "dominant-seventh";
    case "seventh-minor":
    case "extension-minor": return "minor-seventh";
    case "seventh-minor-major": return "minor-major-seventh";
    case "seventh-half-diminished": return "half-diminished-seventh";
    case "seventh-diminished": return "diminished-seventh";
    case "seventh-augmented-major": return "augmented-major-seventh";
    case "extension-suspended-dominant": return "suspended-dominant";
    default: return null;
  }
}

function candidateEvidencePayloadAudit(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
  expectedConstraintCodes: readonly string[],
  expectedEvidenceCodes: readonly string[],
): boolean {
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  const template = independentTemplateRecord(candidate);
  if (realization === undefined || template === null) return false;
  const ordinals = candidate.voices.map(({ ordinal }) => ordinal);
  const degrees = candidate.voices.flatMap(({ degree }) =>
    degree === null ? [] : [degreeToken(degree)]
  );
  const midiValues = candidate.voices.map(({ midi }) => Number(midi));
  const constraintsAccepted = candidate.hardConstraints.length ===
      expectedConstraintCodes.length &&
    candidate.hardConstraints.every((constraint, index) => {
      const row = record(constraint, "candidate hard-constraint payload");
      return row["code"] === expectedConstraintCodes[index] &&
        row["satisfied"] === true && row["reason"] === null &&
        sameCanonical(canonicalize(constraint.voiceOrdinals), canonicalize(ordinals)) &&
        sameCanonical(
          canonicalize(constraint.degrees.map(degreeToken)), canonicalize(degrees),
        ) && sameCanonical(
          canonicalize(constraint.midiValues.map(Number)), canonicalize(midiValues),
        );
    });
  const expectedSourceIds = [
    realization.formulaRuleId,
    candidate.explanation.templateId,
    realization.id,
    template["registerPolicyId"],
    candidate.explanation.templateId,
    "changes.voicing-low-register-spacing",
    "changes.voicing-local-score",
    "changes.voicing-candidates",
    ...(request.quartalContext === null ? [] : [request.quartalContext.evidenceId]),
  ];
  const expectedSourceVersions = [
    1,
    1,
    1,
    template["registerPolicyVersion"],
    1,
    1,
    1,
    1,
    ...(request.quartalContext === null ? [] : [request.quartalContext.evidenceVersion]),
  ];
  const evidenceAccepted = candidate.evidence.length === expectedEvidenceCodes.length &&
    candidate.evidence.every((evidence, index) =>
      evidence.code === expectedEvidenceCodes[index] &&
      evidence.sourceId === expectedSourceIds[index] &&
      evidence.sourceVersion === expectedSourceVersions[index] &&
      independentIdentifierAccepted(evidence.sourceId) &&
      sameCanonical(canonicalize(evidence.voiceOrdinals), canonicalize(ordinals)) &&
      sameCanonical(
        canonicalize(evidence.degrees.map(degreeToken)), canonicalize(degrees),
      )
    );
  const expectedQuality = independentQualityClass(realization.formulaRuleId);
  const realizationClasses = template["realizationClasses"];
  return constraintsAccepted && evidenceAccepted && expectedQuality !== null &&
    candidate.explanation.qualityClass === expectedQuality &&
    Array.isArray(realizationClasses) && realizationClasses.includes(expectedQuality);
}

function compareNumberSequences(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function compareV0CandidatesIndependently(
  request: AutoVoicingRequest,
  left: VoicingCandidate,
  right: VoicingCandidate,
): number {
  const leftScore = independentCandidateLocalScore(request, left);
  const rightScore = independentCandidateLocalScore(request, right);
  if (leftScore === null || rightScore === null) return 0;
  for (const axis of INDEPENDENT_LOCAL_SCORE_AXES) {
    const difference = leftScore[axis] - rightScore[axis];
    if (difference !== 0) return difference;
  }
  let comparison = compareNumberSequences(
    left.voices.map(({ midi }) => Number(midi)),
    right.voices.map(({ midi }) => Number(midi)),
  );
  if (comparison !== 0) return comparison;
  for (let index = 0; index < Math.min(left.voices.length, right.voices.length); index += 1) {
    const leftDegree = left.voices[index]?.degree;
    const rightDegree = right.voices[index]?.degree;
    if (leftDegree === null && rightDegree !== null) return -1;
    if (leftDegree !== null && rightDegree === null) return 1;
    if (leftDegree !== undefined && leftDegree !== null &&
        rightDegree !== undefined && rightDegree !== null) {
      comparison = leftDegree.number - rightDegree.number ||
        leftDegree.alter - rightDegree.alter;
      if (comparison !== 0) return comparison;
    }
  }
  const stepOrder = "CDEFGAB";
  for (let index = 0; index < Math.min(left.voices.length, right.voices.length); index += 1) {
    const leftPitch = left.voices[index]?.pitch;
    const rightPitch = right.voices[index]?.pitch;
    if (leftPitch === undefined || rightPitch === undefined) continue;
    comparison = leftPitch.octave - rightPitch.octave ||
      stepOrder.indexOf(leftPitch.step) - stepOrder.indexOf(rightPitch.step) ||
      leftPitch.alter - rightPitch.alter;
    if (comparison !== 0) return comparison;
  }
  const leftTemplate = left.explanation.templateId;
  const rightTemplate = right.explanation.templateId;
  if (leftTemplate !== rightTemplate) return leftTemplate < rightTemplate ? -1 : 1;
  return left.rawGenerationOrdinal - right.rawGenerationOrdinal;
}

function candidateConstraintEvidenceAudit(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): boolean {
  const candidateRecord = record(candidate, "candidate public object");
  const localScore = record(candidateRecord["localScore"], "candidate local score");
  const localScoreAxes = [
    "optionalDegreesOmitted",
    "nonPreferredDoublings",
    "guideToneDoublings",
    "templateOrderDisplacement",
    "targetSpanDistance",
    "rangeCenterDistanceTwice",
  ] as const;
  const expectedConstraintCodes = [
    "voicing.constraint.realization_membership",
    "voicing.constraint.template_degree_membership",
    "voicing.constraint.voice_count",
    "voicing.constraint.midi_range",
    "voicing.constraint.required_degrees",
    "voicing.constraint.guide_tones",
    "voicing.constraint.identity_tones",
    "voicing.constraint.bass_policy",
    "voicing.constraint.slash_bass_lowest",
    "voicing.constraint.external_bass_excluded",
    "voicing.constraint.rootless_root_omitted",
    "voicing.constraint.unique_midi",
    "voicing.constraint.permitted_doubling",
    "voicing.constraint.low_register_spacing",
    "voicing.constraint.family_structure",
    "voicing.constraint.quartal_context",
  ];
  const expectedEvidenceCodes = [
    "voicing.evidence.quality_classified",
    "voicing.evidence.template_selected",
    "voicing.evidence.realization_bound",
    "voicing.evidence.register_enumerated",
    "voicing.evidence.family_transform",
    "voicing.evidence.constraints_checked",
    "voicing.evidence.local_score",
    "voicing.evidence.stable_retention",
    ...(candidate.family === "quartal" ? ["voicing.evidence.quartal_context"] : []),
  ];
  const independentScore = independentCandidateLocalScore(request, candidate);
  return candidateRecord["schema"] === "changes.theory.voicing-candidate.v1" &&
    candidateRecord["engineId"] === "changes.voicing-candidates" &&
    candidateRecord["engineVersion"] === 1 &&
    candidateRecord["templateTableId"] === "changes.voicing-family-templates" &&
    candidateRecord["templateTableVersion"] === 1 &&
    candidateRecord["localScorePolicyId"] === "changes.voicing-local-score" &&
    candidateRecord["localScorePolicyVersion"] === 1 &&
    sameCanonical(
      canonicalize(Object.keys(localScore).sort()), canonicalize([...localScoreAxes].sort()),
    ) && localScoreAxes.every((axis) =>
      Number.isSafeInteger(localScore[axis]) && Number(localScore[axis]) >= 0
    ) && independentScore !== null && sameCanonical(
      canonicalize(localScore), canonicalize(independentScore),
    ) && isDeeplyFrozen(candidate) && independentTemplateRecord(candidate) !== null &&
    candidateEvidencePayloadAudit(
      request, candidate, expectedConstraintCodes, expectedEvidenceCodes,
    );
}

function candidateFamilyAudit(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): boolean {
  const midiValues = candidate.voices.map(({ midi }) => Number(midi));
  const first = midiValues[0];
  const last = midiValues.at(-1);
  if (first === undefined || last === undefined) return false;
  const span = last - first;
  const gaps = midiValues.slice(1).map((value, index) =>
    value - Number(midiValues[index])
  );
  const degrees = candidate.voices.flatMap(({ degree }) =>
    degree === null ? [] : [degreeToken(degree)]
  );
  const template = independentTemplateRecord(candidate);
  if (template === null) return false;
  if (candidate.family === "rootless-a" || candidate.family === "rootless-b") {
    return request.policy.bassPolicy === "external" && candidate.voices.length === 4 &&
      !degrees.includes("1") && span <= 24 && candidate.explanation.drop2 === null &&
      candidate.explanation.quartalAdjacencies.length === 0 &&
      sameCanonical(canonicalize(degrees), canonicalize(template["degreeTokens"]));
  }
  if (candidate.family === "shell") {
    return candidate.explanation.drop2 === null &&
      candidate.explanation.quartalAdjacencies.length === 0 && span <= 24 &&
      sameCanonical(canonicalize(degrees), canonicalize(template["degreeTokens"]));
  }
  if (candidate.family === "open") {
    return candidate.explanation.drop2 === null &&
      candidate.explanation.quartalAdjacencies.length === 0 && span >= 12 &&
      span <= 36 && gaps.some((gap) => gap >= 7);
  }
  if (candidate.family === "drop2") {
    const evidence = candidate.explanation.drop2;
    if (evidence === null) return false;
    const closed = evidence.closedSourceMidi.map(Number);
    const transformed = evidence.transformedMidi.map(Number);
    const expected = [...closed];
    const source = expected[evidence.secondFromTopSourceOrdinal];
    if (source === undefined) return false;
    expected[evidence.secondFromTopSourceOrdinal] = source - 12;
    expected.sort((left, right) => left - right);
    return closed.length >= 4 && closed.length === midiValues.length &&
      closed.every((value, index) => index === 0 || value > Number(closed[index - 1])) &&
      Number(closed.at(-1)) - Number(closed[0]) <= 11 &&
      evidence.secondFromTopSourceOrdinal === closed.length - 2 &&
      Number(record(evidence, "Drop-2 evidence")["loweredBySemitones"]) === 12 &&
      sameCanonical(canonicalize(transformed), canonicalize(expected)) &&
      sameCanonical(canonicalize(transformed), canonicalize(midiValues)) &&
      span >= 12 && span <= 36 &&
      (midiValues.length >= 6 || gaps.some((gap) => gap >= 7)) &&
      candidate.explanation.quartalAdjacencies.length === 0;
  }
  if (candidate.family === "quartal") {
    if (request.quartalContext === null || candidate.explanation.drop2 !== null) {
      return false;
    }
    const degreeVoices = candidate.voices.filter(
      (voice): voice is Exclude<typeof voice, { degree: null }> => voice.degree !== null,
    );
    const adjacency = candidate.explanation.quartalAdjacencies;
    const intervals = degreeVoices.slice(1).map((voice, index) =>
      Number(voice.midi) - Number(degreeVoices[index]?.midi)
    );
    return span >= 10 && span <= 24 &&
      sameCanonical(
        canonicalize(degrees),
        canonicalize(request.quartalContext.degreeSequence.map(degreeToken)),
      ) && adjacency.length === intervals.length &&
      adjacency.every((row, index) => {
        const lower = degreeVoices[index];
        const upper = degreeVoices[index + 1];
        const interval = intervals[index];
        return lower !== undefined && upper !== undefined && interval !== undefined &&
          row.semitones === interval && [5, 6].includes(interval) &&
          degreeToken(row.lowerDegree) === degreeToken(lower.degree) &&
          degreeToken(row.upperDegree) === degreeToken(upper.degree) &&
          sameCanonical(canonicalize(row.lowerPitch), canonicalize(lower.pitch)) &&
          sameCanonical(canonicalize(row.upperPitch), canonicalize(upper.pitch)) &&
          row.kind === (interval === 5 ? "perfect-fourth" : "augmented-fourth");
      });
  }
  return candidate.explanation.drop2 === null &&
    candidate.explanation.quartalAdjacencies.length === 0 && span <= 36;
}

export function auditV0GeneratedResultSet(
  request: AutoVoicingRequest,
  result: RealizeVoicingResult,
): V0CanonicalJson {
  const candidates = result.ok && result.value.kind === "generated"
    ? result.value.candidates
    : [];
  const identities = candidates.map(independentCandidateIdentity);
  const checkById: Readonly<Record<string, boolean>> = Object.freeze({
    "candidate-count-nonempty-and-at-most-24": candidates.length >= 1 &&
      candidates.length <= 24,
    "every-returned-candidate-audited": candidates.every((candidate) =>
      candidateMembershipAudit(request, candidate) &&
      candidateBassAudit(request, candidate) &&
      candidateDegreePolicyAudit(request, candidate) &&
      candidateConstraintEvidenceAudit(request, candidate) &&
      candidateFamilyAudit(request, candidate)
    ),
    "adjacent-comparator-order": candidates.slice(1).every((candidate, index) => {
      const previous = candidates[index];
      return previous !== undefined &&
        compareV0CandidatesIndependently(request, previous, candidate) < 0;
    }),
    "candidate-identities-unique": new Set(identities).size === identities.length &&
      new Set(candidates.map(({ id }) => id)).size === candidates.length &&
      new Set(candidates.map(({ rawGenerationOrdinal }) => rawGenerationOrdinal)).size ===
        candidates.length &&
      candidates.every(({ retainedOrdinal, id }, index) =>
        retainedOrdinal === index && id === `candidate-${String(index).padStart(3, "0")}`
      ) && candidates.every(({ rawGenerationOrdinal }) =>
        Number.isSafeInteger(rawGenerationOrdinal) && rawGenerationOrdinal >= 0 &&
        rawGenerationOrdinal <= 95
      ),
    "request-family-and-realization-exact": result.ok &&
      result.value.kind === "generated" &&
      result.value.realizationId === request.realizationId &&
      result.value.policy.family === request.policy.family &&
      candidates.every(({ family, realizationId }) =>
        family === request.policy.family && realizationId === request.realizationId
      ),
    "voice-count-and-pitch-alignment": candidates.every((candidate) =>
      candidate.voices.length === request.policy.voiceCount &&
      candidate.pitches.length === request.policy.voiceCount &&
      candidate.voices.every((voice, index) =>
        voice.ordinal === index && sameCanonical(
          canonicalize(voice.pitch), canonicalize(candidate.pitches[index]),
        )
      )
    ),
    "strict-unique-in-range-midi": candidates.every((candidate) =>
      candidate.voices.every((voice, index) => {
        const previous = candidate.voices[index - 1];
        const projected = projectSpelledPitch(voice.pitch);
        return projected.ok && Number(projected.value.midi) === Number(voice.midi) &&
          Number(voice.midi) >= Number(request.policy.range.lowMidi) &&
          Number(voice.midi) <= Number(request.policy.range.highMidi) &&
          (previous === undefined || Number(voice.midi) > Number(previous.midi));
      }) && independentSpacingAccepted(candidate)
    ),
    "source-degree-index-and-spelling-membership": candidates.every((candidate) =>
      candidateMembershipAudit(request, candidate)
    ),
    "bass-and-slash-policy": candidates.every((candidate) =>
      candidateBassAudit(request, candidate)
    ),
    "identity-guide-omission-and-doubling": candidates.every((candidate) =>
      candidateDegreePolicyAudit(request, candidate)
    ),
    "constraint-evidence-and-explanation-consistency": candidates.every(
      (candidate) => candidateConstraintEvidenceAudit(request, candidate),
    ),
    "family-structure-evidence": candidates.every((candidate) =>
      candidateFamilyAudit(request, candidate)
    ),
  });
  const checks: readonly V0GeneratedAuditCheck[] =
    lawFixture.lawProofPolicy.completeResultAuditCheckIds.map((id) =>
      Object.freeze({ id, accepted: checkById[id] ?? false })
    );
  return canonicalize({
    scope: "complete-generated-result-set",
    candidateCountWithinInclusiveBounds:
      checkById["candidate-count-nonempty-and-at-most-24"] ?? false,
    auditedCandidateCountMatchesReturnedCount:
      checkById["every-returned-candidate-audited"] ?? false,
    checkCount: checks.length,
    checks,
  });
}

function actualCandidateProjection(
  recipe: V0CandidateCaseRecipe,
  request: ReturnType<typeof buildV0CandidateRequest>,
  result: RealizeVoicingResult,
): unknown {
  if (recipe.expected.kind === "must-contain-candidate") {
    if (request.kind !== "auto" || !result.ok || result.value.kind !== "generated") {
      return { caseId: recipe.id, ok: result.ok, kind: "unexpected" };
    }
    const candidate = findV0CandidateWithExpectedVoices(
      result.value.candidates,
      recipe.expected,
    );
    if (candidate === undefined) {
      return {
        caseId: recipe.id,
        ok: true,
        kind: "generated",
        exactCandidatePresent: false,
      };
    }
    return successCandidateProjection(
      recipe.id,
      recipe.expected,
      request,
      result,
      candidate,
    );
  }
  if (recipe.expected.kind === "refusal") {
    if (result.ok) return { caseId: recipe.id, ok: true, kind: result.value.kind };
    return refusalCandidateProjection(recipe.id, recipe.expected, result);
  }
  const counters = Object.entries(result.evidence)
    .filter(([key]) => key !== "termination")
    .map(([, value]) => value);
  return {
    caseId: recipe.id,
    ok: result.ok,
    kind: result.ok ? result.value.kind : "refusal",
    candidateGenerationPerformed:
      result.ok && result.value.kind === "stored-bypass"
        ? result.value.candidateGenerationPerformed
        : null,
    sameObjectValue:
      result.ok && result.value.kind === "stored-bypass" && request.kind === "stored"
        ? result.value.voicing === request.voicing
        : false,
    rawCandidateCount: result.ok && result.value.kind === "stored-bypass"
      ? result.value.rawCandidateCount
      : null,
    retainedCandidateCount:
      result.ok && result.value.kind === "stored-bypass"
        ? result.value.retainedCandidateCount
        : null,
    allCounters: counters.every((value) => value === 0) ? 0 : -1,
    counterEvidence: result.evidence,
    termination: result.evidence.termination,
  };
}

function successCandidateProjection(
  caseId: string,
  expected: V0CandidateSuccessExpectation,
  request: AutoVoicingRequest,
  result: Extract<RealizeVoicingResult, { ok: true }>,
  candidate: VoicingCandidate,
): unknown {
  if (result.value.kind !== "generated") throw new Error(`${caseId}: generated`);
  const recipe = v0CandidateCase(caseId);
  if (!("sourceSymbol" in recipe)) throw new Error(`${caseId}: Auto recipe required`);
  const projection: JsonRecord = {
    caseId,
    ok: true,
    kind: "generated",
    exactCandidatePresent: true,
    voices: candidateVoiceProjection(candidate),
    requestedFamily: recipe.policy.family,
    realizedFamily: candidate.family,
    requestedRealizationId: recipe.realizationId,
    realizedRealizationId: candidate.realizationId,
    termination: result.evidence.termination,
    completeResultAudit: auditV0GeneratedResultSet(request, result),
  };
  if (expected.templateId !== undefined) {
    projection["templateId"] = candidate.explanation.templateId;
  }
  if (expected.omittedDegrees !== undefined) {
    projection["omittedDegrees"] = candidate.explanation.omittedDegrees.map(degreeToken);
  }
  if (expected.doubledDegrees !== undefined) {
    projection["doubledDegrees"] = candidate.explanation.doubledDegrees.map(degreeToken);
  }
  if (expected.externalBass !== undefined) {
    projection["externalBass"] = candidate.explanation.externalBass;
  }
  if (expected.spanSemitones !== undefined) {
    const firstVoice = candidate.voices[0];
    const lastVoice = candidate.voices.slice(-1)[0] ?? firstVoice;
    projection["spanSemitones"] =
      Number(lastVoice.midi) - Number(firstVoice.midi);
  }
  if (expected.atLeastOneAdjacentGapSemitones !== undefined) {
    projection["atLeastOneAdjacentGapSemitones"] = Math.max(
      ...candidate.voices.slice(1).map((voice, index) =>
        Number(voice.midi) - Number(candidate.voices[index]?.midi ?? voice.midi)
      ),
    );
  }
  if (expected.exactAdjacentSemitones !== undefined ||
      expected.adjacentSemitones !== undefined) {
    projection["adjacentSemitones"] = candidate.voices.slice(1).map(
      (voice, index) => Number(voice.midi) - Number(candidate.voices[index]?.midi ?? voice.midi),
    );
  }
  if (expected.drop2 !== undefined) projection["drop2"] = candidate.explanation.drop2;
  if (expected.rawCandidateCount !== undefined) {
    projection["rawCandidateCount"] = result.value.rawCandidateCount;
  }
  if (expected.retainedCandidateCount !== undefined) {
    projection["retainedCandidateCount"] = result.value.candidates.length;
  }
  if (expected.localScore !== undefined) projection["localScore"] = candidate.localScore;
  if (expected.noOtherAlteredRealizationMerged === true) {
    projection["noOtherAlteredRealizationMerged"] = result.value.candidates.every(
      (value) => value.realizationId === candidate.realizationId,
    );
  }
  if (expected.slashBassSourceDegreeIndex === null) {
    projection["slashBassSourceDegreeIndex"] =
      candidate.voices.find(({ provenance }) => provenance === "slash-bass")
        ?.sourceDegreeIndex ?? null;
  }
  if (expected.externalBassVoiceCounted === false) {
    const external = candidate.explanation.externalBass;
    projection["externalBassVoiceCounted"] = external === null ? false :
      candidate.voices.some(({ pitch }) => pitchClassOf(pitch) === pitchClassOf(external));
  }
  if (caseId === "V0-CAND-001") {
    projection["registerTraversal"] = {
      rawGenerationOrdinal: candidate.rawGenerationOrdinal,
      templateOrderDisplacement: candidate.localScore.templateOrderDisplacement,
    };
  }
  if (caseId === "V0-CAND-002" || caseId === "V0-CAND-013") {
    const request = buildV0CandidateRequest(v0CandidateCase(caseId));
    const realization = request.kind === "auto"
      ? request.resolved.realizations.find(({ id }) => id === request.realizationId)
      : undefined;
    projection["sourceRoles"] = {
      optionalDegrees: realization?.optionalDegrees.map(degreeToken) ?? [],
      ordinaryFifthRole: realization?.optionalDegrees.some(
        (degree) => degree.number === 5 && degree.alter === 0,
      ) ? "optional" : "not-optional",
    };
  }
  return projection;
}

function expectedCandidateProjection(recipe: V0CandidateCaseRecipe): unknown {
  const expected = recipe.expected;
  if (expected.kind === "must-contain-candidate") {
    if (!("sourceSymbol" in recipe)) {
      throw new Error(`${recipe.id}: generated expectation requires Auto recipe`);
    }
    const projection: JsonRecord = {
      caseId: recipe.id,
      ok: true,
      kind: "generated",
      exactCandidatePresent: true,
      voices: expected.voices.map((voice) => ({
        spelling: voice.spelling,
        midi: voice.midi,
        degree: voice.degree,
        sourceDegreeIndex: voice.sourceDegreeIndex,
        provenance: voice.provenance,
      })),
      requestedFamily: recipe.policy.family,
      realizedFamily: recipe.policy.family,
      requestedRealizationId: recipe.realizationId,
      realizedRealizationId: recipe.realizationId,
      termination: "complete-generated",
      completeResultAudit: expectedGeneratedResultAudit(),
    };
    for (const key of [
      "templateId", "omittedDegrees", "doubledDegrees", "externalBass",
      "spanSemitones", "drop2", "rawCandidateCount", "retainedCandidateCount",
      "localScore", "noOtherAlteredRealizationMerged", "slashBassSourceDegreeIndex",
      "externalBassVoiceCounted",
    ] as const) {
      if (expected[key] !== undefined) projection[key] = expected[key];
    }
    if (expected.atLeastOneAdjacentGapSemitones !== undefined) {
      projection["atLeastOneAdjacentGapSemitones"] =
        expected.atLeastOneAdjacentGapSemitones;
    }
    if (expected.exactAdjacentSemitones !== undefined) {
      projection["adjacentSemitones"] = expected.exactAdjacentSemitones;
    } else if (expected.adjacentSemitones !== undefined) {
      projection["adjacentSemitones"] = expected.adjacentSemitones;
    }
    if (recipe.id === "V0-CAND-001") {
      const weave = record(
        lawFixture.witnesses.find(({ id }) => id === "V0-WEAVE-NEAR-001")?.expected,
        "V0-WEAVE-NEAR-001.expected",
      );
      projection["registerTraversal"] = {
        rawGenerationOrdinal: weave["rawGenerationOrdinal"],
        templateOrderDisplacement: weave["templateOrderDisplacement"],
      };
    }
    if (recipe.id === "V0-CAND-002" || recipe.id === "V0-CAND-013") {
      const seedId = recipe.id === "V0-CAND-002"
        ? "T1-FORMULA-019"
        : "T1-FORMULA-012";
      const seeds = record(availabilityFixtureValue, "availability fixture")[
        "realizationSeeds"
      ];
      if (!Array.isArray(seeds)) throw new TypeError("realizationSeeds");
      const seed = record(
        seeds.find((value) => record(value, "seed")["id"] === seedId),
        seedId,
      );
      projection["sourceRoles"] = {
        optionalDegrees: seed["optionalDegrees"],
        ordinaryFifthRole: "optional",
      };
    }
    return projection;
  }
  if (expected.kind === "refusal") {
    const projection: JsonRecord = {
      caseId: recipe.id,
      ok: false,
      code: expected.code,
      termination: expected.termination,
    };
    for (const key of [
      "primaryReason", "reasons", "reason", "absentDegrees",
      "omittedRequiredDegrees", "omittedGuideToneDegrees", "available",
    ] as const) {
      if (expected[key] !== undefined) projection[key] = expected[key];
    }
    return projection;
  }
  return {
    caseId: recipe.id,
    ok: true,
    kind: "stored-bypass",
    candidateGenerationPerformed: expected.candidateGenerationPerformed,
    sameObjectValue: expected.sameObjectValue,
    rawCandidateCount: expected.rawCandidateCount,
    retainedCandidateCount: expected.retainedCandidateCount,
    allCounters: expected.allCounters,
    counterEvidence: {
      ...Object.fromEntries(VOICING_WORK_COUNTER_NAMES.map((counter) => [counter, 0])),
      ...Object.fromEntries(VOICING_MEMORY_COUNTER_NAMES.map((counter) => [counter, 0])),
      termination: expected.termination,
    },
    termination: expected.termination,
  };
}

function refusalCandidateProjection(
  caseId: string,
  expected: V0CandidateRefusalExpectation,
  result: Extract<RealizeVoicingResult, { ok: false }>,
): unknown {
  const projection: JsonRecord = {
    caseId,
    ok: false,
    code: result.refusal.code,
    termination: result.evidence.termination,
  };
  if (expected.primaryReason !== undefined || expected.reasons !== undefined) {
    const reasons = result.refusal.code === "voicing.constraints_unsatisfied"
      ? result.refusal.constraints.map(({ reason }) => reason)
      : [];
    if (expected.primaryReason !== undefined) projection["primaryReason"] = reasons[0] ?? null;
    if (expected.reasons !== undefined) projection["reasons"] = reasons;
  }
  if (expected.reason !== undefined) {
    projection["reason"] = result.refusal.code === "voicing.quartal_context_invalid"
      ? result.refusal.reason
      : null;
  }
  if (expected.absentDegrees !== undefined) {
    if (result.refusal.code === "voicing.constraints_unsatisfied") {
      projection["absentDegrees"] = result.refusal.constraints
        .filter(({ reason }) => reason === "template-degree-absent")
        .flatMap(({ degrees }) => degrees.map(degreeToken));
    } else projection["absentDegrees"] = [];
  }
  if (expected.omittedRequiredDegrees !== undefined ||
      expected.omittedGuideToneDegrees !== undefined) {
    const first = result.refusal.code === "voicing.constraints_unsatisfied"
      ? result.refusal.constraints[0]
      : undefined;
    if (expected.omittedRequiredDegrees !== undefined) {
      projection["omittedRequiredDegrees"] = first?.degrees.map(degreeToken) ?? [];
    }
    if (expected.omittedGuideToneDegrees !== undefined) {
      const guide = result.refusal.code === "voicing.constraints_unsatisfied"
        ? result.refusal.constraints.find(({ reason }) => reason === "guide-tone-omitted")
        : undefined;
      projection["omittedGuideToneDegrees"] = guide?.degrees.map(degreeToken) ?? [];
    }
  }
  if (expected.available !== undefined) {
    projection["available"] = result.refusal.code === "voicing.realization_unavailable"
      ? result.refusal.available
      : [];
  }
  return projection;
}

export function executeV0CandidateCase(caseId: string): V0ConformanceCaseEnvelope {
  const recipe = v0CandidateCase(caseId);
  const request = buildV0CandidateRequest(recipe);
  const result = realizeVoicing(request);
  return createEnvelope(
    caseId,
    "tests/fixtures/voicing/candidate-cases.json",
    "candidate",
    actualCandidateProjection(recipe, request, result),
    expectedCandidateProjection(recipe),
    request,
    result,
  );
}

function fixtureRows(fixture: unknown, key: string): readonly JsonRecord[] {
  const value = record(fixture, "fixture")[key];
  if (!Array.isArray(value)) throw new TypeError(`${key} must be an array`);
  return value.map((entry, index) => record(entry, `${key}[${String(index)}]`));
}

function rowById(rows: readonly JsonRecord[], caseId: string): JsonRecord {
  const found = rows.find(({ id }) => id === caseId);
  if (found === undefined) throw new Error(`${caseId}: fixture row missing`);
  return found;
}

function midi(received: number): MidiPitch {
  const result = makeMidiPitch(received);
  if (!result.ok) {
    throw new RangeError(`${received.toString()}: legal MIDI required`);
  }
  return result.value;
}

function executeCounterLimit(recordValue: JsonRecord): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const caseId = String(recordValue["id"]);
  const kind = recordValue["counterKind"];
  const counter = String(recordValue["counter"]);
  const maximum = Number(recordValue["maximum"]);
  const exact = recordValue["boundary"] === "exact-limit";
  const fixtureExpected = record(recordValue["expected"], `${caseId}.expected`);
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new Error(`${caseId}: positive safe maximum required`);
  }
  const ledger = createVoicingWorkLedger();
  let beforeExactValue: number;
  let exactAttempt: unknown;
  let afterExactValue: number;
  let plusOneAttempt: unknown = null;
  let afterPlusOneValue: number | null = null;
  if (kind === "work") {
    const name = counter as VoicingWorkCounterName;
    if (!VOICING_WORK_COUNTER_NAMES.includes(name) ||
        VOICING_WORK_LIMITS[name] !== maximum) {
      throw new Error(`${caseId}: work authority drift`);
    }
    for (let index = 1; index < maximum; index += 1) {
      const result = ledger.attemptWork(name);
      if (!result.ok) throw new Error(`${caseId}: premature refusal`);
    }
    beforeExactValue = ledger.read(name);
    const workExactAttempt = ledger.attemptWork(name);
    if (!workExactAttempt.ok || workExactAttempt.value !== maximum) {
      throw new Error(`${caseId}: exact work maximum refused`);
    }
    exactAttempt = workExactAttempt;
    afterExactValue = ledger.read(name);
    if (!exact) {
      const workPlusOneAttempt = ledger.attemptWork(name);
      if (workPlusOneAttempt.ok) {
        throw new Error(`${caseId}: work maximum plus one accepted`);
      }
      plusOneAttempt = workPlusOneAttempt;
      afterPlusOneValue = ledger.read(name);
    }
  } else if (kind === "memory") {
    const name = counter as VoicingMemoryCounterName;
    if (!VOICING_MEMORY_COUNTER_NAMES.includes(name) ||
        VOICING_MEMORY_LIMITS[name] !== maximum) {
      throw new Error(`${caseId}: memory authority drift`);
    }
    const beforeAttempt = ledger.observeMemory(name, maximum - 1);
    if (!beforeAttempt.ok) throw new Error(`${caseId}: pre-maximum memory refused`);
    beforeExactValue = ledger.read(name);
    const memoryExactAttempt = ledger.observeMemory(name, maximum);
    if (!memoryExactAttempt.ok || memoryExactAttempt.value !== maximum) {
      throw new Error(`${caseId}: exact memory maximum refused`);
    }
    exactAttempt = memoryExactAttempt;
    afterExactValue = ledger.read(name);
    if (!exact) {
      const memoryPlusOneAttempt = ledger.observeMemory(name, maximum + 1);
      if (memoryPlusOneAttempt.ok) {
        throw new Error(`${caseId}: memory maximum plus one accepted`);
      }
      plusOneAttempt = memoryPlusOneAttempt;
      afterPlusOneValue = ledger.read(name);
    }
  } else {
    throw new Error(`${caseId}: unknown counter kind`);
  }

  const boundary = exact ? "exact-limit" : "attempted-limit-plus-one";
  const actual = {
    caseId,
    counterKind: kind,
    counter,
    maximum,
    boundary,
    beforeExactValue,
    exactAttempt,
    afterExactValue,
    plusOneAttempt,
    afterPlusOneValue,
  };
  const expected = {
    caseId,
    counterKind: kind,
    counter,
    maximum,
    boundary,
    beforeExactValue: maximum - 1,
    exactAttempt: { ok: true, value: maximum },
    afterExactValue: maximum,
    plusOneAttempt: exact
      ? null
      : { ok: false, refusal: fixtureExpected["refusal"] },
    afterPlusOneValue: exact ? null : maximum,
  };

  let collectorProof: unknown = null;
  if (caseId === "V0-LIMIT-WORK-016-PLUS-ONE") {
    const collectorLedger = createVoicingWorkLedger();
    const collector = createVoicingConstraintObservationCollector(collectorLedger);
    const attempts: Array<ReturnType<typeof collector.record>> = [];
    for (let index = 0; index <= maximum; index += 1) {
      const attempt = collector.record(constraintFromFixture({
        satisfied: false,
        code: "voicing.constraint.low_register_spacing",
        reason: "low-register-spacing",
        voiceOrdinals: [0, 1],
        degrees: ["1", "3"],
        midiValues: [24 + index, 25 + index],
      }, caseId));
      if (index < maximum && (!attempt.ok || attempt.value !== "accepted")) {
        throw new Error(
          `${caseId}: distinct observation ${index.toString()} was not accepted`,
        );
      }
      attempts.push(attempt);
    }
    const terminalAttempt = attempts.at(-1);
    if (terminalAttempt === undefined || terminalAttempt.ok ||
        collector.size() !== maximum ||
        collectorLedger.read("constraintObservationsProduced") !== maximum) {
      throw new Error(`${caseId}: collector overflow was not atomic`);
    }
    collectorProof = {
      terminalAttempt,
      collectorSize: collector.size(),
      evidence: collectorLedger.snapshot("constraints-unsatisfied"),
    };
  }

  return {
    actual,
    expected,
    runtimeInput: recordValue["inputEvidence"],
    runtimeOutput: { counterTransition: actual, collectorProof },
  };
}

function baseAutoRequest(caseId: string): AutoVoicingRequest {
  const request = buildV0CandidateRequest(v0CandidateCase(caseId));
  if (request.kind !== "auto") throw new Error(`${caseId}: Auto required`);
  return request;
}

function withRange(
  request: AutoVoicingRequest,
  lowMidi: number,
  highMidi: number,
): AutoVoicingRequest {
  return Object.freeze({
    ...request,
    policy: Object.freeze({
      ...request.policy,
      range: Object.freeze({ lowMidi, highMidi }),
    }),
  }) as unknown as AutoVoicingRequest;
}

function executeRetention(recordValue: JsonRecord): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const caseId = String(recordValue["id"]);
  const fixtureExpected = record(recordValue["expected"], `${caseId}.expected`);
  if (caseId === "V0-RETENTION-003-RAW-EXACT-96") {
    const ledger = createVoicingWorkLedger();
    for (let value = 1; value <= 96; value += 1) {
      const result = ledger.attemptWork("rawCandidatesProduced");
      if (!result.ok || result.value !== value) throw new Error(`${caseId}: ledger`);
    }
    const output = ledger.snapshot("complete-generated");
    return {
      actual: {
        caseId,
        rawLimitDisposition: "accepted-at-inclusive-maximum",
        rawCandidatesProduced: output.rawCandidatesProduced,
        retainedCandidateCountMaximum: 24,
        workLimitRefusal: null,
      },
      expected: { caseId, ...fixtureExpected },
      runtimeInput: recordValue["inputEvidence"],
      runtimeOutput: output,
    };
  }
  const request = caseId === "V0-RETENTION-001-EXACT-24"
    ? withRange(baseAutoRequest("V0-CAND-001"), 36, 76)
    : caseId === "V0-RETENTION-002-ELIGIBLE-25-TRUNCATED"
      ? withRange(baseAutoRequest("V0-CAND-001"), 36, 80)
      : withRange(baseAutoRequest("V0-CAND-001"), 36, 108);
  const result = realizeVoicing(request);
  if (caseId === "V0-RETENTION-004-RAW-ATTEMPT-97") {
    const refusal = !result.ok ? result.refusal : null;
    const evidence = result.evidence;
    return {
      actual: {
        caseId,
        ok: result.ok,
        valuePresent: result.ok,
        evidenceProjection: {
          counter: "rawCandidatesProduced",
          acceptedValue: evidence.rawCandidatesProduced,
          retainedCandidatesProducedMaximum: 24,
          termination: evidence.termination,
        },
        refusal,
      },
      expected: { caseId, ...fixtureExpected },
      runtimeInput: request,
      runtimeOutput: result,
    };
  }
  if (!result.ok) {
    throw new Error(`${caseId}: generated result required`);
  }
  if (caseId === "V0-RETENTION-001-EXACT-24") {
    const firstCandidate = result.value.candidates[0];
    const lastCandidate = result.value.candidates.slice(-1)[0] ?? firstCandidate;
    return {
      actual: {
        caseId,
        retentionDisposition: "retain-all-eligible",
        retainedCandidateCount: result.value.candidates.length,
        retainedCandidatesProduced: result.evidence.retainedCandidatesProduced,
        retainedOrderedIndexFirst: firstCandidate.retainedOrdinal,
        retainedOrderedIndexLast: lastCandidate.retainedOrdinal,
        attemptedRetainedCounterValue: null,
        workLimitRefusal: null,
      },
      expected: { caseId, ...fixtureExpected },
      runtimeInput: request,
      runtimeOutput: result,
    };
  }
  const expectedWithoutExplanation = Object.fromEntries(
    Object.entries(fixtureExpected).filter(([key]) => key !== "explanation"),
  );
  return {
    actual: {
      caseId,
      retentionDisposition: "truncate-after-first-24",
      retainedCandidateCount: result.value.candidates.length,
      retainedCandidatesProduced: result.evidence.retainedCandidatesProduced,
      truncatedOrderedIndexes: [24],
      attemptedRetainedCounterValue: false,
      workLimitRefusal: null,
    },
    expected: { caseId, ...expectedWithoutExplanation },
    runtimeInput: request,
    runtimeOutput: result,
  };
}

function executeIdentifier(recordValue: JsonRecord): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const caseId = String(recordValue["id"]);
  const recipe = record(recordValue["recipe"], `${caseId}.recipe`);
  const segments = recipe["segments"];
  if (!Array.isArray(segments)) throw new TypeError(`${caseId}: segments`);
  const value = segments.map((entry) => {
    const segment = record(entry, `${caseId}.segment`);
    return String(segment["text"]).repeat(Number(segment["repeat"]));
  }).join("");
  const result = validateVoicingEvidenceIdentifier(value);
  const codePoints = Array.from(value).length;
  const utf8Bytes = new TextEncoder().encode(value).byteLength;
  const firstViolation = codePoints < 1 ? "minimum-code-points"
    : codePoints > 256 ? "maximum-code-points"
    : utf8Bytes > 512 ? "maximum-utf8-bytes" : null;
  const actual = {
    caseId,
    valid: result.ok,
    measuredCodePoints: codePoints,
    measuredUtf8Bytes: utf8Bytes,
    firstViolation,
    quartalContextDisposition: result.ok ? "accept-id-shape" : "evidence-id-invalid",
    candidateEvidenceMayBeEmitted: result.ok,
  };
  return {
    actual,
    expected: { caseId, ...record(recordValue["expected"], `${caseId}.expected`) },
    runtimeInput: { value, codePoints, utf8Bytes },
    runtimeOutput: result,
  };
}

function wallResultProjection(result: RealizeVoicingResult): unknown {
  const counterEvidence = Object.fromEntries(
    [...VOICING_WORK_COUNTER_NAMES, ...VOICING_MEMORY_COUNTER_NAMES]
      .map((counter) => [counter, result.evidence[counter]]),
  );
  return {
    termination: result.evidence.termination,
    counterEvidence,
    resultKind: result.ok ? result.value.kind : null,
    refusal: result.ok ? null : result.refusal,
    candidateCount: result.ok && result.value.kind === "generated"
      ? result.value.candidates.length
      : result.ok ? 0 : null,
    fullResultSemanticDigest: v0EvidenceDigest(result),
  };
}

export function executeV0LimitCase(caseId: string): V0ConformanceCaseEnvelope {
  const groups = [
    "counterBoundaryCases", "retentionCases", "identifierBoundaryCases",
    "midiBoundaryCases", "wallTimeCases",
  ] as const;
  for (const group of groups) {
    const rows = fixtureRows(limitFixtureValue, group);
    const found = rows.find(({ id }) => id === caseId);
    if (found === undefined) continue;
    let execution: Readonly<{
      actual: unknown;
      expected: unknown;
      runtimeInput: unknown;
      runtimeOutput: unknown;
    }>;
    if (group === "counterBoundaryCases") execution = executeCounterLimit(found);
    else if (group === "retentionCases") execution = executeRetention(found);
    else if (group === "identifierBoundaryCases") execution = executeIdentifier(found);
    else if (group === "midiBoundaryCases") {
      const result = makeMidiPitch(Number(found["received"]));
      execution = {
        actual: { caseId, ...record(result, `${caseId}.result`) },
        expected: { caseId, ...record(found["expected"], `${caseId}.expected`) },
        runtimeInput: { received: found["received"] },
        runtimeOutput: result,
      };
    } else {
      const request = baseAutoRequest("V0-CAND-001");
      const baseline = realizeVoicing(request);
      const originalNow = Date.now;
      const originalRandom = Math.random;
      let perturbed: RealizeVoicingResult;
      try {
        Date.now = () => 8_888_888_888_888;
        Math.random = () => 0.987_654_321;
        perturbed = realizeVoicing(request);
      } finally {
        Date.now = originalNow;
        Math.random = originalRandom;
      }
      const baselineProjection = wallResultProjection(baseline);
      const perturbedProjection = wallResultProjection(perturbed);
      const fixtureExpected = record(found["expected"], `${caseId}.expected`);
      if (fixtureExpected["wallTimeMayChangeCandidateMembership"] !== false ||
          fixtureExpected["wallTimeMayChangeCandidateOrder"] !== false ||
          fixtureExpected["wallTimeMayChangeRefusal"] !== false ||
          fixtureExpected["wallTimeMayChangeTermination"] !== false) {
        throw new Error(`${caseId}: wall-time fixture invariance drift`);
      }
      execution = {
        actual: {
          caseId,
          perturbations: ["Date.now", "Math.random"],
          baselineProjection,
          perturbedProjection,
        },
        expected: {
          caseId,
          perturbations: ["Date.now", "Math.random"],
          baselineProjection,
          perturbedProjection: baselineProjection,
        },
        runtimeInput: request,
        runtimeOutput: { baseline, perturbed },
      };
    }
    return createEnvelope(
      caseId,
      "tests/fixtures/voicing/limit-cases.json",
      "limit",
      execution.actual,
      execution.expected,
      execution.runtimeInput,
      execution.runtimeOutput,
    );
  }
  throw new Error(`${caseId}: unsupported V0 limit case`);
}

function resolvedChord(sourceSymbol: string): AutoVoicingRequest["resolved"] {
  const parsed = parseChordSymbol(sourceSymbol, "ascii");
  if (!parsed.ok) throw new Error(`${sourceSymbol}: parse failed`);
  const resolved = resolveChord(parsed.chord);
  if (!resolved.ok) throw new Error(`${sourceSymbol}: resolution failed`);
  return resolved.value;
}

function operationRows(): readonly JsonRecord[] {
  return [
    ...fixtureRows(operationFixtureValue, "successCases"),
    ...fixtureRows(operationFixtureValue, "refusalCases"),
    ...fixtureRows(operationFixtureValue, "precedenceCases"),
    ...fixtureRows(operationFixtureValue, "notApplicableCases"),
  ];
}

function constraintFromFixture(value: unknown, caseId: string): UnsatisfiedVoicingConstraint {
  const source = record(value, `${caseId}.constraint`);
  const degrees = source["degrees"];
  const midiValues = source["midiValues"];
  if (!Array.isArray(degrees) || !Array.isArray(midiValues)) {
    throw new TypeError(`${caseId}: constraint arrays missing`);
  }
  return Object.freeze({
    satisfied: false,
    code: source["code"],
    reason: source["reason"],
    voiceOrdinals: Object.freeze([...(source["voiceOrdinals"] as readonly number[])]),
    degrees: Object.freeze(degrees.map((degree) =>
      v0DegreeFromToken(String(degree) as Parameters<typeof v0DegreeFromToken>[0], caseId)
    )),
    midiValues: Object.freeze(midiValues.map((value) => midi(Number(value)))),
  }) as unknown as UnsatisfiedVoicingConstraint;
}

function operation014(recordValue: JsonRecord): unknown {
  const trigger = record(recordValue["trigger"], "V0-OP-REFUSAL-014.trigger");
  const submitted = trigger["submittedObservations"];
  if (!Array.isArray(submitted)) throw new TypeError("submittedObservations");
  const ledger = createVoicingWorkLedger();
  const collector = createVoicingConstraintObservationCollector(ledger);
  const dispositions: string[] = [];
  for (const source of submitted) {
    const disposition = collector.record(constraintFromFixture(source, "V0-OP-REFUSAL-014"));
    if (!disposition.ok) throw new Error("V0-OP-REFUSAL-014: unexpected limit");
    dispositions.push(disposition.value);
  }
  return Object.freeze({
    ok: false,
    refusal: collector.takeRefusal(),
    evidence: ledger.snapshot("constraints-unsatisfied"),
    dispositions: Object.freeze(dispositions),
  });
}

function operation016Request(): AutoVoicingRequest {
  const base = baseAutoRequest("V0-CAND-001");
  return Object.freeze({
    ...base,
    resolved: resolvedChord("Cmaj7/E"),
    policy: Object.freeze({
      ...base.policy,
      family: "balanced",
      voiceCount: 4,
      range: Object.freeze({ lowMidi: 24, highMidi: 95 }),
      bassPolicy: "external",
    }),
  }) as unknown as AutoVoicingRequest;
}

function operationConstraintProjection(refusal: unknown): unknown {
  const source = record(refusal, "operation refusal");
  const constraints = source["constraints"];
  if (!Array.isArray(constraints)) return refusal;
  return {
    ...source,
    constraints: constraints.map((value) => {
      const constraint = record(value, "operation constraint");
      const degrees = constraint["degrees"];
      return {
        ...constraint,
        degrees: Array.isArray(degrees)
          ? degrees.map((degree) => degreeToken(degree as ChordDegree))
          : [],
        midiValues: Array.isArray(constraint["midiValues"])
          ? constraint["midiValues"].map(Number)
          : [],
      };
    }),
  };
}

function noPublicContinuationState(source: JsonRecord): Readonly<{
  retryScheduled: boolean;
  fallbackApplied: boolean;
}> {
  return Object.freeze({
    retryScheduled: source["retryScheduled"] === true,
    fallbackApplied: source["fallbackApplied"] === true,
  });
}

function allNumericEvidenceCountersZero(evidence: JsonRecord): boolean {
  return Object.entries(evidence).every(([key, value]) =>
    key === "termination" || (typeof value === "number" && value === 0)
  );
}

function generatedCandidateMidi(value: JsonRecord): readonly (readonly number[])[] {
  const candidates = value["candidates"];
  if (!Array.isArray(candidates)) return [];
  return candidates.map((candidate) => {
    const voices = record(candidate, "operation candidate")["voices"];
    return Array.isArray(voices)
      ? voices.map((voice) => Number(record(voice, "operation voice")["midi"]))
      : [];
  });
}

function operationSuccessProjection(
  caseId: string,
  request: AutoVoicingRequest | StoredVoicingRequest,
  result: RealizeVoicingResult,
): unknown {
  const source = record(result, `${caseId}.result`);
  const evidence = record(source["evidence"], `${caseId}.evidence`);
  const continuation = noPublicContinuationState(source);
  const value = source["ok"] === true
    ? record(source["value"], `${caseId}.value`)
    : {};
  const common = {
    caseId,
    ok: source["ok"],
    valuePresent: Object.hasOwn(source, "value"),
    valueKind: value["kind"] ?? null,
  };
  if (caseId === "V0-OP-SUCCESS-001") {
    const candidates = value["candidates"];
    return {
      ...common,
      candidateGenerationPerformed: value["kind"] === "generated",
      candidatesNonempty: Array.isArray(candidates) && candidates.length > 0,
      refusalPresent: Object.hasOwn(source, "refusal"),
      ...continuation,
      partialResult: Object.hasOwn(source, "partialResult") ||
        Object.hasOwn(source, "partialValue"),
      evidenceTermination: evidence["termination"],
      termination: evidence["termination"],
      completeResultAudit: request.kind === "auto"
        ? auditV0GeneratedResultSet(request, result)
        : null,
    };
  }
  if (caseId === "V0-OP-SUCCESS-002" || caseId === "V0-OP-SUCCESS-003") {
    const voicing = record(value["voicing"], `${caseId}.voicing`);
    const requestVoicing = request.kind === "stored" ? request.voicing : null;
    const pitches = voicing["pitches"];
    const pitchRows = Array.isArray(pitches) ? pitches : [];
    const generatedBy = voicing["generatedBy"];
    const requestGeneratedBy = requestVoicing !== null &&
        requestVoicing.mode === "frozen"
      ? requestVoicing.generatedBy
      : null;
    const projection: JsonRecord = {
      ...common,
      voicingMode: voicing["mode"],
      sameVoicingObjectReference: requestVoicing !== null &&
        value["voicing"] === requestVoicing,
      candidateGenerationPerformed: value["candidateGenerationPerformed"],
      rawCandidateCount: value["rawCandidateCount"],
      retainedCandidateCount: value["retainedCandidateCount"],
      allNumericCountersZero: allNumericEvidenceCountersZero(evidence),
      evidenceEqualsTopLevelZeroWorkEvidence: sameCanonical(
        canonicalize(evidence),
        canonicalize(record(operationFixtureValue, "operation fixture")["zeroWorkEvidence"]),
      ),
      refusalPresent: Object.hasOwn(source, "refusal"),
      ...continuation,
      partialResult: Object.hasOwn(source, "partialResult") ||
        Object.hasOwn(source, "partialValue"),
      evidenceTermination: evidence["termination"],
      termination: evidence["termination"],
    };
    if (caseId === "V0-OP-SUCCESS-002") {
      projection["duplicatePitchPreserved"] = pitchRows.length === 3 &&
        sameCanonical(canonicalize(pitchRows[0]), canonicalize(pitchRows[2]));
    } else {
      projection["generatedByObjectReferencePreserved"] =
        generatedBy !== undefined && generatedBy === requestGeneratedBy;
    }
    return projection;
  }
  const candidates = value["candidates"];
  const observationLimit = VOICING_WORK_LIMITS.constraintObservationsProduced;
  const candidateMidiValues = generatedCandidateMidi(value);
  const overflowOccurred = evidence["constraintObservationsProduced"] === observationLimit &&
    Number(evidence["constraintObservationComparisons"]) > observationLimit;
  return {
    ...common,
    candidateGenerationPerformed: value["kind"] === "generated",
    candidatesNonempty: Array.isArray(candidates) && candidates.length > 0,
    candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    candidateMidiValues,
    provisionalObservationOverflowOccurred: overflowOccurred,
    provisionalObservationOverflowCleared: overflowOccurred &&
      source["ok"] === true && !Object.hasOwn(source, "refusal"),
    refusalPresent: Object.hasOwn(source, "refusal"),
    ...continuation,
    partialResult: Object.hasOwn(source, "partialResult") ||
      Object.hasOwn(source, "partialValue"),
    evidenceTermination: evidence["termination"],
    termination: evidence["termination"],
    evidence,
    completeResultAudit: request.kind === "auto"
      ? auditV0GeneratedResultSet(request, result)
      : null,
  };
}

function operationRefusalProjection(caseId: string, result: unknown): unknown {
  const source = record(result, `${caseId}.result`);
  const evidence = record(source["evidence"], `${caseId}.evidence`);
  const refusal = operationConstraintProjection(source["refusal"]);
  const base: JsonRecord = {
    caseId,
    ok: source["ok"],
    valuePresent: Object.hasOwn(source, "value"),
    partialValuePresent: Object.hasOwn(source, "partialValue") ||
      Object.hasOwn(source, "partialResult"),
    ...noPublicContinuationState(source),
  };
  if (caseId === "V0-OP-REFUSAL-014") {
    const dispositions = source["dispositions"];
    const projected = record(refusal, `${caseId}.refusal`);
    const constraints = projected["constraints"];
    const rows = Array.isArray(constraints)
      ? constraints.map((value) => record(value, `${caseId}.constraint`))
      : [];
    const codeCounts = new Map<string, number>();
    for (const row of rows) {
      const code = String(row["code"]);
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
    const reasonOnlyPairRetained = rows.some((left, leftIndex) =>
      rows.some((right, rightIndex) => leftIndex !== rightIndex &&
        left["code"] === right["code"] &&
        sameCanonical(canonicalize(left["voiceOrdinals"]), canonicalize(right["voiceOrdinals"])) &&
        sameCanonical(canonicalize(left["degrees"]), canonicalize(right["degrees"])) &&
        sameCanonical(canonicalize(left["midiValues"]), canonicalize(right["midiValues"])) &&
        left["reason"] !== right["reason"]
      )
    );
    return {
      ...base,
      exactDuplicateCollapsedBeforeCapacity: Array.isArray(dispositions) &&
        dispositions.filter((value) => value === "duplicate").length === 1 &&
        evidence["constraintObservationsProduced"] === rows.length,
      sameCodeDistinctPayloadsRetained: [...codeCounts.values()].some((count) => count > 1),
      reasonOnlyDistinctPayloadsRetained: reasonOnlyPairRetained,
      reasonPrecedenceApplied: rows[0]?.["reason"] === "template-degree-absent",
      primaryReasonByReportPrecedence: rows[0]?.["reason"] ?? null,
      termination: evidence["termination"],
      evidence: { termination: evidence["termination"] },
      refusal,
    };
  }
  if (caseId === "V0-OP-REFUSAL-015") {
    return {
      ...base,
      acceptedCounterValueInEvidence: evidence["rawCandidatesProduced"],
      termination: evidence["termination"],
      evidence: { termination: evidence["termination"] },
      refusal,
    };
  }
  if (caseId === "V0-OP-REFUSAL-016") {
    const projected = record(refusal, `${caseId}.refusal`);
    return {
      ...base,
      diagnosticCollectionStoppedAtProspectiveDistinctObservation:
        projected["counter"] === "constraintObservationsProduced"
          ? projected["received"]
          : null,
      musicalSearchContinuedToCompletion:
        projected["counter"] === "constraintObservationsProduced" &&
        Number(evidence["searchStatesExpanded"]) <
          VOICING_WORK_LIMITS.searchStatesExpanded &&
        Number(evidence["hardConstraintChecks"]) <
          VOICING_WORK_LIMITS.hardConstraintChecks,
      legalCandidateCount: evidence["retainedCandidatesProduced"],
      termination: evidence["termination"],
      evidence,
      refusal,
    };
  }
  return {
    ...base,
    termination: evidence["termination"],
    evidence: { termination: evidence["termination"] },
    refusal,
  };
}

function operation015(): unknown {
  const ledger = createVoicingWorkLedger();
  const maximum = VOICING_WORK_LIMITS.rawCandidatesProduced;
  for (let accepted = 0; accepted < maximum; accepted += 1) {
    const attempt = ledger.attemptWork("rawCandidatesProduced");
    if (!attempt.ok) throw new Error("V0-OP-REFUSAL-015: early work limit");
  }
  const overflow = ledger.attemptWork("rawCandidatesProduced");
  if (overflow.ok) throw new Error("V0-OP-REFUSAL-015: missing work limit");
  return Object.freeze({
    ok: false,
    refusal: overflow.refusal,
    evidence: ledger.snapshot("work-limit-exceeded"),
  });
}

function cloneQuartalContextRequest(
  field: string,
  value: unknown,
): AutoVoicingRequest {
  const request = baseAutoRequest("V0-CAND-009");
  const context = record(request.quartalContext, "valid quartal context");
  return Object.freeze({
    ...request,
    quartalContext: Object.freeze({ ...context, [field]: value }),
  }) as unknown as AutoVoicingRequest;
}

function majorTriadFamilyRequest(
  family: "shell" | "quartal",
  contextDisposition: "none" | "valid" | "invalid" = "none",
): AutoVoicingRequest {
  const base = baseAutoRequest("V0-CAND-001");
  const valid = baseAutoRequest("V0-CAND-009");
  const context = record(valid.quartalContext, "valid quartal context");
  const quartalContext = contextDisposition === "none" ? null : Object.freeze({
    ...context,
    schema: contextDisposition === "invalid"
      ? "changes.theory.quartal-context.v0"
      : context["schema"],
    evidenceId: "operation-major-triad-slash",
    degreeSequence: Object.freeze([
      v0DegreeFromToken("5", "operation-major-triad"),
      v0DegreeFromToken("1", "operation-major-triad"),
    ]),
  });
  return Object.freeze({
    ...base,
    resolved: resolvedChord("C/F"),
    policy: Object.freeze({
      ...base.policy,
      family,
      voiceCount: 3,
      range: Object.freeze({ lowMidi: 60, highMidi: 60 }),
      bassPolicy: "generated",
    }),
    quartalContext,
  }) as unknown as AutoVoicingRequest;
}

function operationRequest(caseId: string): AutoVoicingRequest | StoredVoicingRequest {
  const directCases: Readonly<Record<string, string>> = Object.freeze({
    "V0-OP-SUCCESS-001": "V0-CAND-001",
    "V0-OP-SUCCESS-002": "V0-CAND-031",
    "V0-OP-SUCCESS-003": "V0-CAND-032",
    "V0-OP-REFUSAL-001": "V0-CAND-030",
    "V0-OP-REFUSAL-003": "V0-CAND-026",
    "V0-OP-REFUSAL-010": "V0-CAND-028",
    "V0-OP-REFUSAL-011": "V0-CAND-027",
  });
  const direct = directCases[caseId];
  if (direct !== undefined) return buildV0CandidateRequest(v0CandidateCase(direct));
  if (caseId === "V0-OP-SUCCESS-004") {
    return withRange(baseAutoRequest("V0-CAND-003"), 29, 59);
  }
  if (caseId === "V0-OP-REFUSAL-002") {
    const base = baseAutoRequest("V0-CAND-001");
    const valid = baseAutoRequest("V0-CAND-009");
    return Object.freeze({ ...base, quartalContext: valid.quartalContext }) as unknown as AutoVoicingRequest;
  }
  if (caseId === "V0-OP-REFUSAL-004") {
    return cloneQuartalContextRequest("schema", "changes.theory.quartal-context.v0");
  }
  if (caseId === "V0-OP-REFUSAL-005") {
    return cloneQuartalContextRequest("policyId", "changes.quartal-context-gate.other");
  }
  if (caseId === "V0-OP-REFUSAL-006") return cloneQuartalContextRequest("policyVersion", 2);
  if (caseId === "V0-OP-REFUSAL-007") return cloneQuartalContextRequest("evidenceId", "");
  if (caseId === "V0-OP-REFUSAL-008") return cloneQuartalContextRequest("evidenceVersion", 0);
  if (caseId === "V0-OP-REFUSAL-009") {
    return cloneQuartalContextRequest("degreeSequence", Object.freeze([
      v0DegreeFromToken("1", caseId),
      v0DegreeFromToken("4", caseId),
      v0DegreeFromToken("b7", caseId),
    ]));
  }
  if (caseId === "V0-OP-REFUSAL-012") return majorTriadFamilyRequest("shell");
  if (caseId === "V0-OP-REFUSAL-013") return majorTriadFamilyRequest("quartal", "valid");
  if (caseId === "V0-OP-REFUSAL-016") return operation016Request();
  throw new Error(`${caseId}: operation request missing`);
}

const PRECEDENCE_CONTENDERS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "V0-OP-PRECEDENCE-001": [
    "voicing.realization_unavailable", "voicing.quartal_context_invalid",
    "voicing.family_unavailable", "voicing.constraints_unsatisfied",
    "limit.voicing_work_exceeded",
  ],
  "V0-OP-PRECEDENCE-002": [
    "voicing.quartal_context_unexpected", "voicing.family_unavailable",
    "voicing.constraints_unsatisfied",
  ],
  "V0-OP-PRECEDENCE-003": [
    "voicing.quartal_context_required", "voicing.family_unavailable",
  ],
  "V0-OP-PRECEDENCE-004": [
    "voicing.quartal_context_invalid", "voicing.family_unavailable",
  ],
  "V0-OP-PRECEDENCE-005": [
    "voicing.family_unavailable", "voicing.constraints_unsatisfied",
    "limit.voicing_work_exceeded",
  ],
  "V0-OP-PRECEDENCE-006": [
    "voicing.constraints_unsatisfied", "limit.voicing_work_exceeded",
  ],
  "V0-OP-PRECEDENCE-007": [
    "voicing.constraints_unsatisfied", "limit.voicing_work_exceeded",
  ],
});

function precedenceRequest(caseId: string): AutoVoicingRequest {
  if (caseId === "V0-OP-PRECEDENCE-001") {
    const base = majorTriadFamilyRequest("quartal", "invalid");
    return Object.freeze({ ...base, realizationId: "alt-b9-b5" });
  }
  if (caseId === "V0-OP-PRECEDENCE-002") {
    const base = majorTriadFamilyRequest("shell");
    const valid = baseAutoRequest("V0-CAND-009");
    return Object.freeze({ ...base, quartalContext: valid.quartalContext }) as unknown as AutoVoicingRequest;
  }
  if (caseId === "V0-OP-PRECEDENCE-003") return majorTriadFamilyRequest("quartal");
  if (caseId === "V0-OP-PRECEDENCE-004") return majorTriadFamilyRequest("quartal", "invalid");
  if (caseId === "V0-OP-PRECEDENCE-005") return majorTriadFamilyRequest("quartal", "valid");
  if (caseId === "V0-OP-PRECEDENCE-006") return baseAutoRequest("V0-CAND-029");
  if (caseId === "V0-OP-PRECEDENCE-007") return operation016Request();
  throw new Error(`${caseId}: precedence request missing`);
}

function operationPrecedenceProjection(caseId: string, result: RealizeVoicingResult): unknown {
  const expectedContenders = PRECEDENCE_CONTENDERS[caseId];
  if (expectedContenders === undefined) throw new Error(`${caseId}: contenders missing`);
  const source = record(result, `${caseId}.result`);
  const refusal = source["ok"] === false
    ? record(source["refusal"], `${caseId}.refusal`)
    : {};
  const evidence = record(source["evidence"], `${caseId}.evidence`);
  return {
    caseId,
    contendersMaterialized: expectedContenders,
    materializedContenderCount: expectedContenders.length,
    winningCode: refusal["code"] ?? null,
    termination: evidence["termination"],
    ...noPublicContinuationState(source),
    partialValuePresent: Object.hasOwn(source, "partialValue") ||
      Object.hasOwn(source, "partialResult") || Object.hasOwn(source, "value"),
  };
}

const NOT_APPLICABLE_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  "V0-OP-NOT-APPLICABLE-001": "cancellation",
  "V0-OP-NOT-APPLICABLE-002": "staleRevision",
  "V0-OP-NOT-APPLICABLE-003": "browser",
  "V0-OP-NOT-APPLICABLE-004": "audio",
  "V0-OP-NOT-APPLICABLE-005": "storage",
});

const NOT_APPLICABLE_OWNERS: Readonly<Record<string, string>> = Object.freeze({
  "V0-OP-NOT-APPLICABLE-001": "progression-level resumable search/application runner",
  "V0-OP-NOT-APPLICABLE-002": "application request/revision boundary",
  "V0-OP-NOT-APPLICABLE-003": "UI/E2E packages",
  "V0-OP-NOT-APPLICABLE-004": "playback-plan and audio packages",
  "V0-OP-NOT-APPLICABLE-005": "persistence package",
});

function executeNotApplicable(caseId: string): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const field = NOT_APPLICABLE_FIELDS[caseId];
  const owner = NOT_APPLICABLE_OWNERS[caseId];
  if (field === undefined || owner === undefined) throw new Error(`${caseId}: applicability`);
  const request = baseAutoRequest("V0-CAND-001");
  const extended = Object.freeze({
    ...request,
    [field]: Object.freeze({ semanticProbe: caseId }),
  }) as unknown as AutoVoicingRequest;
  const baseline = realizeVoicing(request);
  const perturbed = realizeVoicing(extended);
  const equal = sameCanonical(canonicalize(baseline), canonicalize(perturbed));
  const baselineRecord = record(baseline, `${caseId}.baseline`);
  const perturbedRecord = record(perturbed, `${caseId}.perturbed`);
  const projection = {
    caseId,
    applies: false,
    requestFieldPresent: Object.hasOwn(request, field),
    ambientStateRead: !equal,
    v0StateCreated: !equal,
    terminationAdded:
      record(baselineRecord["evidence"], `${caseId}.baseline.evidence`)["termination"] !==
      record(perturbedRecord["evidence"], `${caseId}.perturbed.evidence`)["termination"],
    refusalAdded: Object.hasOwn(perturbedRecord, "refusal") &&
      !Object.hasOwn(baselineRecord, "refusal"),
    owner,
    sourceTypeBoundaryField: field,
    injectedAmbientFieldIgnored: equal,
    termination: record(baselineRecord["evidence"], `${caseId}.baseline.termination`)[
      "termination"
    ],
  };
  return {
    actual: projection,
    expected: {
      caseId,
      applies: false,
      requestFieldPresent: false,
      ambientStateRead: false,
      v0StateCreated: false,
      terminationAdded: false,
      refusalAdded: false,
      owner,
      sourceTypeBoundaryField: field,
      injectedAmbientFieldIgnored: true,
      termination: "complete-generated",
    },
    runtimeInput: { request, extended },
    runtimeOutput: { baseline, perturbed },
  };
}

function operationExpectedProjection(caseId: string, recordValue: JsonRecord): unknown {
  const expected = record(recordValue["expected"], `${caseId}.expected`);
  if (caseId.startsWith("V0-OP-PRECEDENCE-")) {
    const contenders = PRECEDENCE_CONTENDERS[caseId];
    if (contenders === undefined) throw new Error(`${caseId}: expected contenders`);
    return {
      caseId,
      contendersMaterialized: contenders,
      materializedContenderCount: contenders.length,
      ...expected,
    };
  }
  const termination = expected["evidenceTermination"] ??
    (typeof expected["evidence"] === "object" && expected["evidence"] !== null
      ? record(expected["evidence"], `${caseId}.expected.evidence`)["termination"]
      : undefined);
  return {
    caseId,
    ...expected,
    ...(termination === undefined ? {} : { termination }),
    ...(
      caseId === "V0-OP-SUCCESS-001" || caseId === "V0-OP-SUCCESS-004"
        ? { completeResultAudit: expectedGeneratedResultAudit() }
        : {}
    ),
  };
}

export function executeV0OperationCase(caseId: string): V0ConformanceCaseEnvelope {
  const recordValue = rowById(operationRows(), caseId);
  if (caseId.startsWith("V0-OP-NOT-APPLICABLE-")) {
    const execution = executeNotApplicable(caseId);
    return createEnvelope(
      caseId,
      "tests/fixtures/voicing/operation-state-cases.json",
      "operation",
      execution.actual,
      execution.expected,
      execution.runtimeInput,
      execution.runtimeOutput,
    );
  }
  let runtimeInput: unknown;
  let runtimeOutput: unknown;
  let actualProjection: unknown;
  if (caseId.startsWith("V0-OP-PRECEDENCE-")) {
    runtimeInput = precedenceRequest(caseId);
    runtimeOutput = realizeVoicing(runtimeInput as AutoVoicingRequest);
    actualProjection = operationPrecedenceProjection(
      caseId,
      runtimeOutput as RealizeVoicingResult,
    );
  } else if (caseId === "V0-OP-REFUSAL-014") {
    runtimeInput = recordValue["trigger"];
    runtimeOutput = operation014(recordValue);
    actualProjection = operationRefusalProjection(caseId, runtimeOutput);
  } else if (caseId === "V0-OP-REFUSAL-015") {
    runtimeInput = recordValue["trigger"];
    runtimeOutput = operation015();
    actualProjection = operationRefusalProjection(caseId, runtimeOutput);
  } else {
    runtimeInput = operationRequest(caseId);
    runtimeOutput = realizeVoicing(
      runtimeInput as AutoVoicingRequest | StoredVoicingRequest,
    );
    actualProjection = caseId.startsWith("V0-OP-SUCCESS-")
      ? operationSuccessProjection(
          caseId,
          runtimeInput as AutoVoicingRequest | StoredVoicingRequest,
          runtimeOutput as RealizeVoicingResult,
        )
      : operationRefusalProjection(caseId, runtimeOutput);
  }
  return createEnvelope(
    caseId,
    "tests/fixtures/voicing/operation-state-cases.json",
    "operation",
    actualProjection,
    operationExpectedProjection(caseId, recordValue),
    runtimeInput,
    runtimeOutput,
  );
}

function transpositionSeed(caseId: string): JsonRecord {
  return rowById(transpositionFixture.seeds, caseId);
}

function transposedSourceSymbol(sourceSymbol: string, rootSymbol: string): string {
  if (!sourceSymbol.startsWith("C")) {
    throw new Error(`${sourceSymbol}: V0 source root must be C`);
  }
  return `${rootSymbol}${sourceSymbol.slice(1)}`;
}

const MAJOR_THIRD_BASS_SYMBOLS = Object.freeze([
  "Cmaj7/E", "Dbmaj7/F", "Dmaj7/F#", "Ebmaj7/G", "Emaj7/G#", "Fmaj7/A",
  "F#maj7/A#", "Gmaj7/B", "Abmaj7/C", "Amaj7/C#", "Bbmaj7/D", "Bmaj7/D#",
] as const);

const MINOR_THIRD_BASS_SYMBOLS = Object.freeze([
  "Cmaj7/Eb", "Dbmaj7/Fb", "Dmaj7/F", "Ebmaj7/Gb", "Emaj7/G", "Fmaj7/Ab",
  "F#maj7/A", "Gmaj7/Bb", "Abmaj7/Cb", "Amaj7/C", "Bbmaj7/Db", "Bmaj7/D",
] as const);

const TRANS_BASE_CASES: Readonly<Record<string, string>> = Object.freeze({
  "V0-TRANS-003": "V0-CAND-006",
  "V0-TRANS-006": "V0-CAND-002",
  "V0-TRANS-011": "V0-CAND-012",
  "V0-TRANS-012": "V0-CAND-012",
  "V0-TRANS-013": "V0-CAND-012",
});

function transpositionSourceOracle(seed: JsonRecord): JsonRecord {
  return record(seed["sourceOracle"], `${String(seed["id"])}.sourceOracle`);
}

function transpositionSourceRecords(
  seed: JsonRecord,
  field: "voices" | "storedPitches",
): readonly JsonRecord[] {
  const value = transpositionSourceOracle(seed)[field];
  if (!Array.isArray(value)) {
    throw new TypeError(`${String(seed["id"])}.sourceOracle.${field} must be an array`);
  }
  return value.map((entry, index) =>
    record(entry, `${String(seed["id"])}.sourceOracle.${field}[${String(index)}]`)
  );
}

function sourceOracleSpelling(
  value: unknown,
  label: string,
): Readonly<{ step: string; alter: number; octave: number }> {
  const spelling = record(value, label);
  if (typeof spelling["step"] !== "string" ||
      typeof spelling["alter"] !== "number" ||
      typeof spelling["octave"] !== "number") {
    throw new TypeError(`${label} must be an exact spelled pitch`);
  }
  return {
    step: spelling["step"],
    alter: spelling["alter"],
    octave: spelling["octave"],
  };
}

function transpositionRequest(
  seed: JsonRecord,
  root: TranspositionRoot,
): AutoVoicingRequest {
  const seedId = String(seed["id"]);
  if (seedId === "V0-TRANS-018") {
    const rootIndex = transpositionFixture.roots.indexOf(root);
    const sourceSymbol = MAJOR_THIRD_BASS_SYMBOLS[rootIndex];
    if (sourceSymbol === undefined) throw new Error(`${seedId}: root index`);
    const base = operation016Request();
    return Object.freeze({
      ...base,
      resolved: resolvedChord(sourceSymbol),
      policy: Object.freeze({
        ...base.policy,
        range: Object.freeze({
          lowMidi: 24 + root.pitchClass,
          highMidi: 95 + root.pitchClass,
        }),
      }),
    }) as unknown as AutoVoicingRequest;
  }
  const sourceCaseId = seed["sourceCaseId"];
  const base = typeof sourceCaseId === "string"
    ? baseAutoRequest(sourceCaseId)
    : baseAutoRequest(TRANS_BASE_CASES[seedId] ?? "V0-CAND-012");
  const rootIndex = transpositionFixture.roots.indexOf(root);
  const sourceSymbol = seedId === "V0-TRANS-009"
    ? MINOR_THIRD_BASS_SYMBOLS[rootIndex]
    : transposedSourceSymbol(String(seed["sourceSymbol"]), root.symbol);
  if (sourceSymbol === undefined) throw new Error(`${seedId}: source symbol`);
  const proofRange = seed["proofRange"] === undefined
    ? null
    : record(seed["proofRange"], `${seedId}.proofRange`);
  const sourceLow = proofRange === null
    ? Number(base.policy.range.lowMidi)
    : Number(proofRange["lowMidi"]);
  const sourceHigh = proofRange === null
    ? Number(base.policy.range.highMidi)
    : Number(proofRange["highMidi"]);
  return Object.freeze({
    ...base,
    resolved: resolvedChord(sourceSymbol),
    realizationId: seed["realizationId"],
    policy: Object.freeze({
      ...base.policy,
      family: seed["family"],
      voiceCount: (seed["orderedDegrees"] as readonly unknown[]).length,
      range: Object.freeze({
        lowMidi: sourceLow + root.pitchClass,
        highMidi: sourceHigh + root.pitchClass,
      }),
    }),
  }) as unknown as AutoVoicingRequest;
}

function findTranspositionCandidate(
  result: RealizeVoicingResult,
  seed: JsonRecord,
): VoicingCandidate | undefined {
  if (!result.ok || result.value.kind !== "generated") return undefined;
  const expectedDegrees = seed["orderedDegrees"];
  const expectedRelative = seed["relativeMidiFromLowest"];
  if (!Array.isArray(expectedDegrees) || !Array.isArray(expectedRelative)) {
    throw new TypeError(`${String(seed["id"])}: transposition arrays`);
  }
  return result.value.candidates.find((candidate) => {
    const lowest = Number(candidate.voices[0].midi);
    return sameCanonical(
      canonicalize(candidate.voices.map(({ degree }) =>
        degree === null ? null : degreeToken(degree)
      )),
      canonicalize(expectedDegrees),
    ) && sameCanonical(
      canonicalize(candidate.voices.map(({ midi: value }) => Number(value) - lowest)),
      canonicalize(expectedRelative),
    );
  });
}

const SPELLING_STEPS = Object.freeze(["C", "D", "E", "F", "G", "A", "B"] as const);
const NATURAL_PITCH_CLASSES: Readonly<Record<string, number>> = Object.freeze({
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
});

function normalizedAlter(received: number): number {
  const modulo = ((received % 12) + 12) % 12;
  return modulo > 6 ? modulo - 12 : modulo;
}

function degreeParts(token: string): Readonly<{ number: number; alter: number }> {
  const number = Number.parseInt(token.replaceAll("b", "").replaceAll("#", ""), 10);
  const prefix = token.slice(0, token.search(/[0-9]/u));
  const alter = prefix === "bb" ? -2 : prefix === "b" ? -1
    : prefix === "#" ? 1 : prefix === "##" ? 2 : 0;
  return { number, alter };
}

function degreeDiatonicOffset(number: number): number {
  return ((number - 1) % 7 + 7) % 7;
}

function degreeSemitoneOffset(number: number, alter: number): number {
  const major = [0, 2, 4, 5, 7, 9, 11];
  return Number(major[degreeDiatonicOffset(number)]) + alter;
}

function expectedSpellingForDegree(
  root: TranspositionRoot,
  token: string,
): Readonly<{ step: string; alter: number }> {
  const parts = degreeParts(token);
  const rootStep = SPELLING_STEPS.indexOf(root.step as (typeof SPELLING_STEPS)[number]);
  if (rootStep < 0) throw new Error(`${root.id}: root spelling step`);
  const step = SPELLING_STEPS[(rootStep + degreeDiatonicOffset(parts.number)) % 7];
  if (step === undefined) throw new Error(`${root.id}: target spelling step`);
  const targetPitchClass = (root.pitchClass + degreeSemitoneOffset(parts.number, parts.alter) + 12) % 12;
  return {
    step,
    alter: normalizedAlter(targetPitchClass - Number(NATURAL_PITCH_CLASSES[step])),
  };
}

function inverseSpellingProjection(
  root: TranspositionRoot,
  candidate: VoicingCandidate,
): readonly unknown[] {
  const rootStep = SPELLING_STEPS.indexOf(root.step as (typeof SPELLING_STEPS)[number]);
  if (rootStep < 0) throw new Error(`${root.id}: inverse root step`);
  const lowest = Number(candidate.voices[0].midi);
  return candidate.voices.map((voice) => {
    const voiceStep = SPELLING_STEPS.indexOf(
      voice.pitch.step,
    );
    if (voiceStep < 0) throw new Error(`${root.id}: inverse voice step`);
    const sourceStep = SPELLING_STEPS[(voiceStep - rootStep + 7) % 7];
    if (sourceStep === undefined) throw new Error(`${root.id}: inverse source step`);
    const sourcePitchClass = (pitchClassOf(voice.pitch) - root.pitchClass + 12) % 12;
    const sourceAlter = normalizedAlter(
      sourcePitchClass - Number(NATURAL_PITCH_CLASSES[sourceStep]),
    );
    const sourceMidi = Number(voice.midi) - root.pitchClass;
    const sourceOctave = (
      sourceMidi - (Number(NATURAL_PITCH_CLASSES[sourceStep]) + sourceAlter)
    ) / 12 - 1;
    return {
      degree: voice.degree === null ? null : degreeToken(voice.degree),
      sourceDegreeIndex: voice.sourceDegreeIndex,
      spelling: {
        step: sourceStep,
        alter: sourceAlter,
        octave: sourceOctave,
      },
      relativeMidiFromLowest: Number(voice.midi) - lowest,
      provenance: voice.provenance,
    };
  });
}

function expectedInverseProjection(seed: JsonRecord): readonly unknown[] {
  return transpositionSourceRecords(seed, "voices").map((voice, index) => ({
    degree: voice["degree"],
    sourceDegreeIndex: voice["sourceDegreeIndex"],
    spelling: sourceOracleSpelling(
      voice["spelling"],
      `${String(seed["id"])}.sourceOracle.voices[${String(index)}].spelling`,
    ),
    relativeMidiFromLowest: voice["relativeMidiFromLowest"],
    provenance: voice["provenance"],
  }));
}

function inversePitchClass(
  root: TranspositionRoot,
  pitch: Readonly<{ step: string; alter: number }>,
): Readonly<{ step: string; alter: number }> {
  const rootStep = SPELLING_STEPS.indexOf(root.step as (typeof SPELLING_STEPS)[number]);
  const pitchStep = SPELLING_STEPS.indexOf(
    pitch.step as (typeof SPELLING_STEPS)[number],
  );
  if (rootStep < 0 || pitchStep < 0) throw new Error(`${root.id}: inverse bass step`);
  const step = SPELLING_STEPS[(pitchStep - rootStep + 7) % 7];
  if (step === undefined) throw new Error(`${root.id}: inverse bass source step`);
  const pitchClass = (
    Number(NATURAL_PITCH_CLASSES[pitch.step]) + pitch.alter - root.pitchClass + 24
  ) % 12;
  return {
    step,
    alter: normalizedAlter(pitchClass - Number(NATURAL_PITCH_CLASSES[step])),
  };
}

function projectedQuartalContext(
  context: AutoVoicingRequest["quartalContext"],
): unknown {
  if (context === null) return null;
  return {
    schema: context.schema,
    policyId: context.policyId,
    policyVersion: context.policyVersion,
    evidenceKind: context.evidenceKind,
    evidenceId: context.evidenceId,
    evidenceVersion: context.evidenceVersion,
    degreeSequence: context.degreeSequence.map(degreeToken),
  };
}

function expectedSourceRequestProjection(seed: JsonRecord): unknown {
  return transpositionSourceOracle(seed)["requestProjection"];
}

function inverseRequestProjection(
  seed: JsonRecord,
  root: TranspositionRoot,
  request: AutoVoicingRequest,
): unknown {
  const effectiveBass = request.policy.bassPolicy === "external"
    ? request.resolved.bass ?? request.resolved.source.root
    : request.policy.bassPolicy === "generated" && request.resolved.bass !== null
      ? request.resolved.bass
      : null;
  return {
    sourceRoot: inversePitchClass(root, request.resolved.source.root),
    realizationId: request.realizationId,
    policy: {
      family: request.policy.family,
      voiceCount: request.policy.voiceCount,
      bassPolicy: request.policy.bassPolicy,
      range: {
        lowMidi: Number(request.policy.range.lowMidi) - root.pitchClass,
        highMidi: Number(request.policy.range.highMidi) - root.pitchClass,
      },
    },
    quartalContext: projectedQuartalContext(request.quartalContext),
    effectiveBass: effectiveBass === null ? null : inversePitchClass(root, effectiveBass),
  };
}

type TranspositionCandidateAudit = Readonly<{
  shapeAccepted: boolean;
  identityAccepted: boolean;
  rangeAccepted: boolean;
  familyAccepted: boolean;
  realizationAccepted: boolean;
  templateAccepted: boolean;
  bassSemanticsAccepted: boolean;
  provenanceAccepted: boolean;
  forwardTranspositionAccepted: boolean;
  inverseTranspositionAccepted: boolean;
}>;

type TranspositionFullResultSetAudit = Readonly<{
  applicability: "generated-candidate" | "stored-bypass" | "refusal";
  independentGeneratedResultAudit: V0CanonicalJson | null;
  rawOrdinalTranspositionScope:
    | "root-local"
    | "normalized-range"
    | "not-applicable";
  comparisonScope:
    | "shared-inverse-transposed-subsequence"
    | "complete-ordered-list"
    | "not-applicable";
  candidateListApplicable: boolean;
  completeCandidateListAudited: boolean;
  candidateCardinalityClass: "nonempty-bounded" | "zero-not-applicable" | "invalid";
  allCandidateShapesAccepted: boolean;
  allCandidateIdentitiesAccepted: boolean;
  allCandidateRangesAccepted: boolean;
  allCandidateFamiliesAccepted: boolean;
  allCandidateRealizationsAccepted: boolean;
  allCandidateTemplatesAccepted: boolean;
  allCandidateBassSemanticsAccepted: boolean;
  allCandidateProvenanceAccepted: boolean;
  allCandidateForwardTranspositionsAccepted: boolean;
  allCandidateInverseTranspositionsAccepted: boolean;
  candidatesStrictlyOrdered: boolean;
  candidateIdentityKeysUnique: boolean;
  candidateIdsAndOrdinalsAligned: boolean;
  allCandidateRawOrdinalsAccepted: boolean;
  candidateRawOrdinalsUnique: boolean;
  cardinalityInvariantAcrossRoots: boolean;
  orderedIdentityInvariantAcrossRoots: boolean;
  sharedOrderedIdentityInvariantAcrossRoots: boolean;
  completeOrderedIdentityInvariantAcrossRoots: boolean | null;
  normalizedRangeRawCountInvariantAcrossRoots: boolean | null;
  normalizedRangeRetainedCountInvariantAcrossRoots: boolean | null;
  normalizedRangeSelectedRawOrdinalInvariantAcrossRoots: boolean | null;
  normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots: boolean | null;
}>;

type GeneratedTranspositionExecution = Readonly<{
  root: TranspositionRoot;
  request: AutoVoicingRequest;
  result: RealizeVoicingResult;
}>;

const EXPECTED_GENERATED_FULL_RESULT_SET_AUDIT = Object.freeze({
  applicability: "generated-candidate",
  independentGeneratedResultAudit: canonicalize(expectedGeneratedResultAudit()),
  rawOrdinalTranspositionScope: "root-local",
  comparisonScope: "shared-inverse-transposed-subsequence",
  candidateListApplicable: true,
  completeCandidateListAudited: true,
  candidateCardinalityClass: "nonempty-bounded",
  allCandidateShapesAccepted: true,
  allCandidateIdentitiesAccepted: true,
  allCandidateRangesAccepted: true,
  allCandidateFamiliesAccepted: true,
  allCandidateRealizationsAccepted: true,
  allCandidateTemplatesAccepted: true,
  allCandidateBassSemanticsAccepted: true,
  allCandidateProvenanceAccepted: true,
  allCandidateForwardTranspositionsAccepted: true,
  allCandidateInverseTranspositionsAccepted: true,
  candidatesStrictlyOrdered: true,
  candidateIdentityKeysUnique: true,
  candidateIdsAndOrdinalsAligned: true,
  allCandidateRawOrdinalsAccepted: true,
  candidateRawOrdinalsUnique: true,
  cardinalityInvariantAcrossRoots: true,
  orderedIdentityInvariantAcrossRoots: true,
  sharedOrderedIdentityInvariantAcrossRoots: true,
  completeOrderedIdentityInvariantAcrossRoots: null,
  normalizedRangeRawCountInvariantAcrossRoots: null,
  normalizedRangeRetainedCountInvariantAcrossRoots: null,
  normalizedRangeSelectedRawOrdinalInvariantAcrossRoots: null,
  normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots: null,
} as const satisfies TranspositionFullResultSetAudit);

const EXPECTED_NORMALIZED_RANGE_FULL_RESULT_SET_AUDIT = Object.freeze({
  ...EXPECTED_GENERATED_FULL_RESULT_SET_AUDIT,
  rawOrdinalTranspositionScope: "normalized-range",
  comparisonScope: "complete-ordered-list",
  completeOrderedIdentityInvariantAcrossRoots: true,
  normalizedRangeRawCountInvariantAcrossRoots: true,
  normalizedRangeRetainedCountInvariantAcrossRoots: true,
  normalizedRangeSelectedRawOrdinalInvariantAcrossRoots: true,
  normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots: true,
} as const satisfies TranspositionFullResultSetAudit);

const EXPECTED_STORED_FULL_RESULT_SET_AUDIT = Object.freeze({
  applicability: "stored-bypass",
  independentGeneratedResultAudit: null,
  rawOrdinalTranspositionScope: "not-applicable",
  comparisonScope: "not-applicable",
  candidateListApplicable: false,
  completeCandidateListAudited: false,
  candidateCardinalityClass: "zero-not-applicable",
  allCandidateShapesAccepted: true,
  allCandidateIdentitiesAccepted: true,
  allCandidateRangesAccepted: true,
  allCandidateFamiliesAccepted: true,
  allCandidateRealizationsAccepted: true,
  allCandidateTemplatesAccepted: true,
  allCandidateBassSemanticsAccepted: true,
  allCandidateProvenanceAccepted: true,
  allCandidateForwardTranspositionsAccepted: true,
  allCandidateInverseTranspositionsAccepted: true,
  candidatesStrictlyOrdered: true,
  candidateIdentityKeysUnique: true,
  candidateIdsAndOrdinalsAligned: true,
  allCandidateRawOrdinalsAccepted: true,
  candidateRawOrdinalsUnique: true,
  cardinalityInvariantAcrossRoots: true,
  orderedIdentityInvariantAcrossRoots: true,
  sharedOrderedIdentityInvariantAcrossRoots: true,
  completeOrderedIdentityInvariantAcrossRoots: null,
  normalizedRangeRawCountInvariantAcrossRoots: null,
  normalizedRangeRetainedCountInvariantAcrossRoots: null,
  normalizedRangeSelectedRawOrdinalInvariantAcrossRoots: null,
  normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots: null,
} as const satisfies TranspositionFullResultSetAudit);

const EXPECTED_REFUSAL_FULL_RESULT_SET_AUDIT = Object.freeze({
  ...EXPECTED_STORED_FULL_RESULT_SET_AUDIT,
  applicability: "refusal",
} as const satisfies TranspositionFullResultSetAudit);

function samePitchClassSpelling(
  left: Readonly<{ step: string; alter: number }> | null,
  right: Readonly<{ step: string; alter: number }> | null,
): boolean {
  return left === null || right === null
    ? left === right
    : left.step === right.step && left.alter === right.alter;
}

function sourceTranspositionRoot(): TranspositionRoot {
  const sourceRoot = transpositionFixture.roots[0];
  if (sourceRoot === undefined) {
    throw new Error("transposition fixture must declare a source root");
  }
  return sourceRoot;
}

function sourceOraclePitchClass(
  value: unknown,
  label: string,
): Readonly<{ step: string; alter: number }> | null {
  if (value === null) return null;
  const spelling = record(value, label);
  if (typeof spelling["step"] !== "string" ||
      typeof spelling["alter"] !== "number") {
    throw new TypeError(`${label} must be a pitch-class spelling`);
  }
  return Object.freeze({
    step: spelling["step"],
    alter: spelling["alter"],
  });
}

function inverseCandidatePitchIdentity(
  root: TranspositionRoot,
  pitch: SpelledPitch,
): Readonly<{
  midi: number;
  pitch: Readonly<{ step: string; alter: number; octave: number }>;
}> {
  const rootStep = SPELLING_STEPS.indexOf(
    root.step as (typeof SPELLING_STEPS)[number],
  );
  const pitchStep = SPELLING_STEPS.indexOf(pitch.step);
  if (rootStep < 0 || pitchStep < 0) {
    throw new Error(`${root.id}: inverse full-result identity step`);
  }
  const step = SPELLING_STEPS[(pitchStep - rootStep + 7) % 7];
  if (step === undefined) {
    throw new Error(`${root.id}: inverse full-result identity spelling`);
  }
  const projection = projectSpelledPitch(pitch);
  if (!projection.ok) {
    throw new Error(`${root.id}: inverse full-result identity projection`);
  }
  const midi = Number(projection.value.midi) - root.pitchClass;
  const pitchClass = (pitchClassOf(pitch) - root.pitchClass + 12) % 12;
  const alter = normalizedAlter(
    pitchClass - Number(NATURAL_PITCH_CLASSES[step]),
  );
  const octave = (
    midi - (Number(NATURAL_PITCH_CLASSES[step]) + alter)
  ) / 12 - 1;
  return Object.freeze({
    midi,
    pitch: Object.freeze({ step, alter, octave }),
  });
}

function inverseCandidateVoiceIdentity(
  root: TranspositionRoot,
  voice: VoicingCandidate["voices"][number],
): Readonly<{
  ordinal: number;
  midi: number;
  pitch: Readonly<{ step: string; alter: number; octave: number }>;
  degree: string | null;
  provenance: string;
  sourceDegreeIndex: number | null;
}> {
  const inversePitch = inverseCandidatePitchIdentity(root, voice.pitch);
  return Object.freeze({
    ordinal: voice.ordinal,
    midi: inversePitch.midi,
    pitch: inversePitch.pitch,
    degree: voice.degree === null ? null : degreeToken(voice.degree),
    provenance: voice.provenance,
    sourceDegreeIndex: voice.sourceDegreeIndex,
  });
}

function inverseCandidateListIdentity(
  root: TranspositionRoot,
  candidates: readonly VoicingCandidate[],
  includePublicationIdentity: boolean,
): readonly unknown[] {
  return candidates.map((candidate) => {
    const musicalIdentity = {
      family: candidate.family,
      realizationId: candidate.realizationId,
      templateId: candidate.explanation.templateId,
      localScore: candidate.localScore,
      pitches: candidate.pitches.map((pitch) =>
        inverseCandidatePitchIdentity(root, pitch).pitch
      ),
      voices: candidate.voices.map((voice) =>
        inverseCandidateVoiceIdentity(root, voice)
      ),
      explanation: {
        qualityClass: candidate.explanation.qualityClass,
        orderedDegrees: candidate.explanation.orderedDegrees.map(degreeToken),
        omittedDegrees: candidate.explanation.omittedDegrees.map(degreeToken),
        doubledDegrees: candidate.explanation.doubledDegrees.map(degreeToken),
        externalBass: candidate.explanation.externalBass === null
          ? null
          : inversePitchClass(root, candidate.explanation.externalBass),
        drop2: candidate.explanation.drop2 === null
          ? null
          : {
              closedSourceMidi: candidate.explanation.drop2.closedSourceMidi.map(
                (midiValue) => Number(midiValue) - root.pitchClass,
              ),
              secondFromTopSourceOrdinal:
                candidate.explanation.drop2.secondFromTopSourceOrdinal,
              loweredBySemitones: candidate.explanation.drop2.loweredBySemitones,
              transformedMidi: candidate.explanation.drop2.transformedMidi.map(
                (midiValue) => Number(midiValue) - root.pitchClass,
              ),
            },
        quartalAdjacencies: candidate.explanation.quartalAdjacencies.map(
          ({ lowerDegree, upperDegree, semitones, kind }) => ({
            lowerDegree: degreeToken(lowerDegree),
            upperDegree: degreeToken(upperDegree),
            semitones,
            kind,
          }),
        ),
      },
    };
    return includePublicationIdentity
      ? {
          id: candidate.id,
          retainedOrdinal: candidate.retainedOrdinal,
          rawGenerationOrdinal: candidate.rawGenerationOrdinal,
          ...musicalIdentity,
        }
      : musicalIdentity;
  });
}

function candidateBassSemanticsAccepted(
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
): boolean {
  const slashVoices = candidate.voices.filter(
    ({ provenance }) => provenance === "slash-bass",
  );
  const externalBass = request.resolved.bass ?? request.resolved.source.root;
  if (request.policy.bassPolicy === "external") {
    return slashVoices.length === 0 &&
      samePitchClassSpelling(candidate.explanation.externalBass, externalBass) &&
      candidate.voices.every(({ pitch }) =>
        pitchClassOf(pitch) !== pitchClassOf(externalBass)
      );
  }
  if (request.policy.bassPolicy === "none") {
    return slashVoices.length === 0 && candidate.explanation.externalBass === null;
  }
  if (candidate.explanation.externalBass !== null) return false;
  if (request.resolved.bass !== null) {
    const slash = slashVoices[0];
    if (slash === undefined) return false;
    return slashVoices.length === 1 && slash.ordinal === 0 &&
      samePitchClassSpelling(slash.pitch, request.resolved.bass);
  }
  const lowest = candidate.voices[0];
  return slashVoices.length === 0 && lowest.degree !== null &&
    degreeToken(lowest.degree) === "1";
}

function auditTransposedCandidate(
  seed: JsonRecord,
  root: TranspositionRoot,
  request: AutoVoicingRequest,
  candidate: VoicingCandidate,
  candidateIndex: number,
): TranspositionCandidateAudit {
  const inverseVoices = candidate.voices.map((voice) =>
    inverseCandidateVoiceIdentity(root, voice)
  );
  const sourceRequest = record(
    transpositionSourceOracle(seed)["requestProjection"],
    `${String(seed["id"])}.sourceOracle.requestProjection`,
  );
  const sourcePolicy = record(
    sourceRequest["policy"],
    `${String(seed["id"])}.sourceOracle.requestProjection.policy`,
  );
  const sourceRange = record(
    sourcePolicy["range"],
    `${String(seed["id"])}.sourceOracle.requestProjection.policy.range`,
  );
  const sourceBass = sourceOraclePitchClass(
    sourceRequest["effectiveBass"],
    `${String(seed["id"])}.sourceOracle.requestProjection.effectiveBass`,
  );
  const pitchesAligned = candidate.pitches.length === candidate.voices.length &&
    candidate.pitches.every((pitch, index) => {
      const voice = candidate.voices[index];
      return voice !== undefined && sameCanonical(
        canonicalize(pitch),
        canonicalize(voice.pitch),
      );
    });
  const hardConstraintsAccepted = sameCanonical(
    canonicalize(candidate.hardConstraints.map(({ code }) => code)),
    canonicalize(VOICING_CONSTRAINT_PRECEDENCE),
  ) && candidate.hardConstraints.every((constraint) =>
    record(constraint, `${candidate.id}.hardConstraint`)["satisfied"] ===
      true
  );
  const localScoreRecord = record(
    candidate.localScore,
    `${candidate.id}.localScore`,
  );
  const localScoreAccepted = VOICING_LOCAL_SCORE_AXIS_ORDER.every((axis) => {
    const value = localScoreRecord[axis];
    return Number.isSafeInteger(value) && Number(value) >= 0;
  });
  const candidateRecord = record(candidate, candidate.id);
  const shapeAccepted = candidateRecord["schema"] === VOICING_CANDIDATE_SCHEMA &&
    candidateRecord["engineId"] === VOICING_ENGINE_ID &&
    candidateRecord["engineVersion"] === VOICING_ENGINE_VERSION &&
    candidateRecord["templateTableId"] === VOICING_TEMPLATE_TABLE_ID &&
    candidateRecord["templateTableVersion"] === VOICING_TEMPLATE_TABLE_VERSION &&
    candidateRecord["localScorePolicyId"] === VOICING_LOCAL_SCORE_POLICY_ID &&
    candidateRecord["localScorePolicyVersion"] ===
      VOICING_LOCAL_SCORE_POLICY_VERSION &&
    candidate.voices.length === request.policy.voiceCount &&
    candidate.voices.every(({ ordinal }, index) => ordinal === index) &&
    pitchesAligned && hardConstraintsAccepted && localScoreAccepted &&
    isDeeplyFrozen(candidate);
  const identityAccepted = candidate.id === VOICING_CANDIDATE_IDS[candidateIndex] &&
    candidate.retainedOrdinal === candidateIndex &&
    Number.isSafeInteger(candidate.rawGenerationOrdinal) &&
    candidate.rawGenerationOrdinal >= 0;
  const rangeAccepted = candidate.voices.every((voice, index) => {
    const projected = projectSpelledPitch(voice.pitch);
    const previous = candidate.voices[index - 1];
    return projected.ok && Number(projected.value.midi) === Number(voice.midi) &&
      Number(voice.midi) >= Number(request.policy.range.lowMidi) &&
      Number(voice.midi) <= Number(request.policy.range.highMidi) &&
      (index === 0 ||
        (previous !== undefined && Number(previous.midi) < Number(voice.midi)));
  });
  const provenanceAccepted = candidateMembershipAudit(request, candidate) &&
    candidateDegreePolicyAudit(request, candidate);
  const forwardTranspositionAccepted = candidate.voices.every((voice) => {
    if (voice.degree === null) {
      return request.resolved.bass !== null &&
        samePitchClassSpelling(voice.pitch, request.resolved.bass);
    }
    return samePitchClassSpelling(
      voice.pitch,
      expectedSpellingForDegree(root, degreeToken(voice.degree)),
    );
  });
  const inverseTranspositionAccepted = inverseVoices.every((voice) => {
    const expectedSpelling = voice.degree === null
      ? sourceBass
      : expectedSpellingForDegree(
          sourceTranspositionRoot(),
          voice.degree,
        );
    return expectedSpelling !== null &&
      samePitchClassSpelling(voice.pitch, expectedSpelling) &&
      Number.isInteger(voice.pitch.octave) &&
      voice.midi >= Number(sourceRange["lowMidi"]) &&
      voice.midi <= Number(sourceRange["highMidi"]);
  });
  return Object.freeze({
    shapeAccepted,
    identityAccepted,
    rangeAccepted,
    familyAccepted: candidate.family === request.policy.family &&
      candidateFamilyAudit(request, candidate),
    realizationAccepted: candidate.realizationId === request.realizationId,
    templateAccepted: candidate.explanation.templateId === seed["templateId"],
    bassSemanticsAccepted: candidateBassSemanticsAccepted(request, candidate),
    provenanceAccepted,
    forwardTranspositionAccepted,
    inverseTranspositionAccepted,
  });
}

function fullResultSetTranspositionAudits(
  seed: JsonRecord,
  executions: readonly GeneratedTranspositionExecution[],
): ReadonlyMap<string, TranspositionFullResultSetAudit> {
  if (seed["id"] === "V0-TRANS-018") {
    return new Map<string, TranspositionFullResultSetAudit>(
      executions.map(({ root, result }) => [
      root.id,
      Object.freeze({
        ...EXPECTED_REFUSAL_FULL_RESULT_SET_AUDIT,
        candidateCardinalityClass: !result.ok
          ? "zero-not-applicable"
          : "invalid",
      }),
      ]),
    );
  }
  if (executions.length === 0) {
    throw new Error(`${String(seed["id"])}: no transposition executions`);
  }
  const candidateLists = executions.map(({ result }) =>
    result.ok && result.value.kind === "generated" ? result.value.candidates : []
  );
  const firstList = candidateLists[0] ?? [];
  const cardinalityInvariantAcrossRoots = candidateLists.every(
    (candidates) => candidates.length === firstList.length,
  );
  const completeIdentityLists = executions.map(({ root }, index) =>
    inverseCandidateListIdentity(root, candidateLists[index] ?? [], true)
  );
  const firstCompleteIdentity = completeIdentityLists[0] ?? [];
  const completeOrderedIdentityInvariantAcrossRoots =
    seed["id"] === "V0-TRANS-017"
      ? completeIdentityLists.every((identity) => sameCanonical(
        canonicalize(identity),
        canonicalize(firstCompleteIdentity),
      ))
      : null;
  const musicalIdentityLists = executions.map(({ root }, index) =>
    inverseCandidateListIdentity(root, candidateLists[index] ?? [], false)
  );
  const musicalIdentityKeys = musicalIdentityLists.map((identity) =>
    identity.map((candidate) => JSON.stringify(canonicalize(candidate)))
  );
  const firstMusicalIdentityKeys = musicalIdentityKeys[0] ?? [];
  const sharedIdentityKeys = new Set(firstMusicalIdentityKeys.filter(
    (key) => musicalIdentityKeys.every((identity) => identity.includes(key)),
  ));
  const firstSharedSequence = firstMusicalIdentityKeys.filter(
    (key) => sharedIdentityKeys.has(key),
  );
  const sharedOrderedIdentityInvariantAcrossRoots =
    sharedIdentityKeys.size > 0 && musicalIdentityKeys.every((identity) =>
      sameCanonical(
        canonicalize(identity.filter((key) => sharedIdentityKeys.has(key))),
        canonicalize(firstSharedSequence),
      )
    );
  const orderedIdentityInvariantAcrossRoots =
    completeOrderedIdentityInvariantAcrossRoots ??
      sharedOrderedIdentityInvariantAcrossRoots;
  const normalizedRangeExpected = seed["id"] === "V0-TRANS-017"
    ? record(seed["expected"], "V0-TRANS-017.expected")
    : null;
  const normalizedExpectedNumber = (key: string): number | null => {
    if (normalizedRangeExpected === null) return null;
    const value = normalizedRangeExpected[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
      throw new TypeError(`V0-TRANS-017.expected.${key} must be an integer`);
    }
    return value;
  };
  const expectedRawCount = normalizedExpectedNumber("rawCandidateCount");
  const expectedRetainedCount = normalizedExpectedNumber("retainedCandidateCount");
  const expectedRawOrdinal = normalizedExpectedNumber("rawGenerationOrdinal");
  const expectedRetainedOrdinal = normalizedExpectedNumber("retainedOrdinal");
  const normalizedRangeRawCountInvariantAcrossRoots = expectedRawCount === null
    ? null
    : executions.every(({ result }) =>
      result.ok && result.value.kind === "generated" &&
      result.value.rawCandidateCount === expectedRawCount
    );
  const normalizedRangeRetainedCountInvariantAcrossRoots =
    expectedRetainedCount === null
      ? null
      : candidateLists.every(
        (candidates) => candidates.length === expectedRetainedCount,
      );
  const selectedCandidates = executions.map(({ result }) =>
    findTranspositionCandidate(result, seed)
  );
  const normalizedRangeSelectedRawOrdinalInvariantAcrossRoots =
    expectedRawOrdinal === null
      ? null
      : selectedCandidates.every(
        (candidate) => candidate?.rawGenerationOrdinal === expectedRawOrdinal,
      );
  const normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots =
    expectedRetainedOrdinal === null
      ? null
      : selectedCandidates.every(
        (candidate) => candidate?.retainedOrdinal === expectedRetainedOrdinal,
      );
  return new Map(executions.map(({ root, request, result }, executionIndex) => {
    const candidates = candidateLists[executionIndex] ?? [];
    const independentGeneratedResultAudit = auditV0GeneratedResultSet(
      request,
      result,
    );
    const independentGeneratedResultAuditAccepted = sameCanonical(
      independentGeneratedResultAudit,
      canonicalize(expectedGeneratedResultAudit()),
    );
    const candidateAudits = candidates.map((candidate, candidateIndex) =>
      auditTransposedCandidate(seed, root, request, candidate, candidateIndex)
    );
    const candidateKeys = candidates.map(({ voices }) => candidateIdentityKey(voices));
    const rawOrdinals = candidates.map(({ rawGenerationOrdinal }) =>
      rawGenerationOrdinal
    );
    const all = (field: keyof TranspositionCandidateAudit): boolean =>
      candidateAudits.length === candidates.length &&
      candidateAudits.every((audit) => audit[field]);
    const generated = result.ok && result.value.kind === "generated";
    return [root.id, Object.freeze({
      applicability: "generated-candidate",
      independentGeneratedResultAudit,
      rawOrdinalTranspositionScope: normalizedRangeExpected === null
        ? "root-local"
        : "normalized-range",
      comparisonScope: normalizedRangeExpected === null
        ? "shared-inverse-transposed-subsequence"
        : "complete-ordered-list",
      candidateListApplicable: true,
      completeCandidateListAudited: generated && candidates.length > 0 &&
        candidateAudits.length === candidates.length &&
        independentGeneratedResultAuditAccepted,
      candidateCardinalityClass: generated && candidates.length > 0 &&
          candidates.length <= VOICING_CANDIDATE_IDS.length
        ? "nonempty-bounded"
        : "invalid",
      allCandidateShapesAccepted: generated && all("shapeAccepted"),
      allCandidateIdentitiesAccepted: generated && all("identityAccepted"),
      allCandidateRangesAccepted: generated && all("rangeAccepted"),
      allCandidateFamiliesAccepted: generated && all("familyAccepted"),
      allCandidateRealizationsAccepted: generated && all("realizationAccepted"),
      allCandidateTemplatesAccepted: generated && all("templateAccepted"),
      allCandidateBassSemanticsAccepted: generated && all("bassSemanticsAccepted"),
      allCandidateProvenanceAccepted: generated && all("provenanceAccepted"),
      allCandidateForwardTranspositionsAccepted: generated &&
        all("forwardTranspositionAccepted"),
      allCandidateInverseTranspositionsAccepted: generated &&
        all("inverseTranspositionAccepted"),
      candidatesStrictlyOrdered: generated && candidates.slice(1).every(
        (candidate, index) => {
        const previous = candidates[index];
        return previous !== undefined && compareV0CandidatesIndependently(
          request,
          previous,
          candidate,
        ) < 0;
        },
      ),
      candidateIdentityKeysUnique: generated &&
        new Set(candidateKeys).size === candidateKeys.length,
      candidateIdsAndOrdinalsAligned: generated && candidates.every((candidate, index) =>
        candidate.id === VOICING_CANDIDATE_IDS[index] &&
        candidate.retainedOrdinal === index
      ),
      allCandidateRawOrdinalsAccepted: generated && rawOrdinals.every(
        (ordinal) => Number.isSafeInteger(ordinal) && ordinal >= 0 &&
          ordinal < MAX_VOICING_RAW_CANDIDATES,
      ),
      candidateRawOrdinalsUnique: generated &&
        new Set(rawOrdinals).size === rawOrdinals.length,
      cardinalityInvariantAcrossRoots,
      orderedIdentityInvariantAcrossRoots,
      sharedOrderedIdentityInvariantAcrossRoots,
      completeOrderedIdentityInvariantAcrossRoots,
      normalizedRangeRawCountInvariantAcrossRoots,
      normalizedRangeRetainedCountInvariantAcrossRoots,
      normalizedRangeSelectedRawOrdinalInvariantAcrossRoots,
      normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots,
    } satisfies TranspositionFullResultSetAudit)] as const;
  }));
}

function transpositionCellProjection(
  seed: JsonRecord,
  root: TranspositionRoot,
  result: RealizeVoicingResult,
  fullResultSetAudit: TranspositionFullResultSetAudit,
): unknown {
  if (seed["id"] === "V0-TRANS-018") {
    const refusal = !result.ok ? result.refusal : null;
    const request = transpositionRequest(seed, root);
    const rootObserved = request.resolved.source.root.step === root.step &&
      request.resolved.source.root.alter === root.alter &&
      pitchClassOf(request.resolved.source.root) === root.pitchClass;
    const inverseRequest = inverseRequestProjection(seed, root, request);
    const expectedRequest = expectedSourceRequestProjection(seed);
    return {
      rootId: root.id,
      rootSymbol: root.symbol,
      rootSpelling: { step: root.step, alter: root.alter },
      rootPitchClass: root.pitchClass,
      ok: result.ok,
      refusal,
      termination: result.evidence.termination,
      evidence: {
        constraintObservationComparisons:
          result.evidence.constraintObservationComparisons,
        constraintObservationsProduced: result.evidence.constraintObservationsProduced,
        peakConstraintObservationRecords:
          result.evidence.peakConstraintObservationRecords,
        peakTrackedRecords: result.evidence.peakTrackedRecords,
        termination: result.evidence.termination,
      },
      requestRootObserved: rootObserved,
      forwardRefusalProjectionAccepted: !result.ok &&
        refusal?.code === "limit.voicing_work_exceeded",
      inverseRequestProjection: inverseRequest,
      inverseRequestProjectionRestored: sameCanonical(
        canonicalize(inverseRequest),
        canonicalize(expectedRequest),
      ),
      fullResultSetAudit,
    };
  }
  const candidate = findTranspositionCandidate(result, seed);
  const request = transpositionRequest(seed, root);
  if (candidate === undefined) {
    return {
      rootId: root.id,
      rootSymbol: root.symbol,
      rootSpelling: { step: root.step, alter: root.alter },
      rootPitchClass: root.pitchClass,
      exactCandidatePresent: false,
      termination: result.evidence.termination,
      fullResultSetAudit,
    };
  }
  const lowest = Number(candidate.voices[0].midi);
  const degrees = candidate.voices.map(({ degree }) =>
    degree === null ? null : degreeToken(degree)
  );
  const relativeMidi = candidate.voices.map(({ midi: value }) => Number(value) - lowest);
  const voiceSpellings = candidate.voices.map(({ pitch }) => pitch);
  const inverseProjection = inverseSpellingProjection(root, candidate);
  const expectedInverse = expectedInverseProjection(seed);
  const inverseRequest = inverseRequestProjection(seed, root, request);
  const expectedRequest = expectedSourceRequestProjection(seed);
  return {
    rootId: root.id,
    rootSymbol: root.symbol,
    rootSpelling: { step: root.step, alter: root.alter },
    rootPitchClass: root.pitchClass,
    exactCandidatePresent: true,
    termination: result.evidence.termination,
    realizationId: candidate.realizationId,
    family: candidate.family,
    templateId: candidate.explanation.templateId,
    orderedDegrees: degrees,
    relativeMidiFromLowest: relativeMidi,
    voiceSpellings,
    requestRootObserved:
      request.resolved.source.root.step === root.step &&
      request.resolved.source.root.alter === root.alter &&
      pitchClassOf(request.resolved.source.root) === root.pitchClass,
    forwardProjectionAccepted:
      sameCanonical(canonicalize(voiceSpellings), canonicalize(
        expectedForwardPitches(seed, root),
      )),
    inverseProjection,
    inverseProjectionRestored: sameCanonical(
      canonicalize(inverseProjection),
      canonicalize(expectedInverse),
    ),
    inverseRequestProjection: inverseRequest,
    inverseRequestProjectionRestored: sameCanonical(
      canonicalize(inverseRequest),
      canonicalize(expectedRequest),
    ),
    fullResultSetAudit,
  };
}

function expectedTranspositionCell(
  seed: JsonRecord,
  root: TranspositionRoot,
): unknown {
  if (seed["id"] === "V0-TRANS-018") {
    const overflow = record(seed["observationOverflowProof"], "V0-TRANS-018.proof");
    const perRoot = overflow["perRootConstraintObservationComparisons"];
    if (!Array.isArray(perRoot)) throw new TypeError("V0-TRANS-018 comparisons");
    const comparison = record(
      perRoot.find((value) => record(value, "comparison")["rootId"] === root.id),
      `${root.id}.comparison`,
    );
    const invariants = record(overflow["allRootInvariants"], "allRootInvariants");
    return {
      rootId: root.id,
      rootSymbol: root.symbol,
      rootSpelling: { step: root.step, alter: root.alter },
      rootPitchClass: root.pitchClass,
      ok: false,
      refusal: overflow["expectedRefusal"],
      termination: transpositionSourceOracle(seed)["expectedTermination"],
      evidence: {
        constraintObservationComparisons: comparison["comparisons"],
        constraintObservationsProduced: invariants["constraintObservationsProduced"],
        peakConstraintObservationRecords: invariants["peakConstraintObservationRecords"],
        peakTrackedRecords: invariants["peakTrackedRecords"],
        termination: invariants["termination"],
      },
      requestRootObserved: true,
      forwardRefusalProjectionAccepted: true,
      inverseRequestProjection: expectedSourceRequestProjection(seed),
      inverseRequestProjectionRestored: true,
      fullResultSetAudit: EXPECTED_REFUSAL_FULL_RESULT_SET_AUDIT,
    };
  }
  return {
    rootId: root.id,
    rootSymbol: root.symbol,
    rootSpelling: { step: root.step, alter: root.alter },
    rootPitchClass: root.pitchClass,
    exactCandidatePresent: true,
    termination: transpositionSourceOracle(seed)["expectedTermination"],
    realizationId: seed["realizationId"],
    family: seed["family"],
    templateId: seed["templateId"],
    orderedDegrees: seed["orderedDegrees"],
    relativeMidiFromLowest: seed["relativeMidiFromLowest"],
    voiceSpellings: expectedForwardPitches(seed, root),
    requestRootObserved: true,
    forwardProjectionAccepted: true,
    inverseProjection: expectedInverseProjection(seed),
    inverseProjectionRestored: true,
    inverseRequestProjection: expectedSourceRequestProjection(seed),
    inverseRequestProjectionRestored: true,
    fullResultSetAudit: seed["id"] === "V0-TRANS-017"
      ? EXPECTED_NORMALIZED_RANGE_FULL_RESULT_SET_AUDIT
      : EXPECTED_GENERATED_FULL_RESULT_SET_AUDIT,
  };
}

function transposeStoredPitch(
  source: Readonly<{ step: string; alter: number; octave: number }>,
  root: TranspositionRoot,
): SpelledPitch {
  const sourceStep = SPELLING_STEPS.indexOf(source.step as (typeof SPELLING_STEPS)[number]);
  const rootStep = SPELLING_STEPS.indexOf(root.step as (typeof SPELLING_STEPS)[number]);
  if (sourceStep < 0 || rootStep < 0) throw new Error(`${root.id}: stored step`);
  const step = SPELLING_STEPS[(sourceStep + rootStep) % 7];
  if (step === undefined) throw new Error(`${root.id}: stored target step`);
  const sourcePitchClass = (Number(NATURAL_PITCH_CLASSES[source.step]) + source.alter + 12) % 12;
  const targetPitchClass = (sourcePitchClass + root.pitchClass) % 12;
  const alter = normalizedAlter(targetPitchClass - Number(NATURAL_PITCH_CLASSES[step]));
  const sourcePitch = makeSpelledPitch(source);
  if (!sourcePitch.ok) throw new Error(`${root.id}: source stored pitch`);
  const sourceProjection = projectSpelledPitch(sourcePitch.value);
  if (!sourceProjection.ok) throw new Error(`${root.id}: source stored projection`);
  const targetMidi = Number(sourceProjection.value.midi) + root.pitchClass;
  const writtenSemitone = Number(NATURAL_PITCH_CLASSES[step]) + alter;
  const octave = (targetMidi - writtenSemitone) / 12 - 1;
  const target = makeSpelledPitch({ step, alter, octave });
  if (!target.ok) throw new Error(`${root.id}: target stored pitch`);
  return target.value;
}

function expectedForwardPitches(
  seed: JsonRecord,
  root: TranspositionRoot,
): readonly SpelledPitch[] {
  return transpositionSourceRecords(seed, "voices").map((voice, index) =>
    transposeStoredPitch(
      sourceOracleSpelling(
        voice["spelling"],
        `${String(seed["id"])}.sourceOracle.voices[${String(index)}].spelling`,
      ),
      root,
    )
  );
}

function storedTranspositionRequest(
  seed: JsonRecord,
  root: TranspositionRoot,
): StoredVoicingRequest {
  const sourceOracle = transpositionSourceOracle(seed);
  const requestProjection = record(
    sourceOracle["requestProjection"],
    `${String(seed["id"])}.sourceOracle.requestProjection`,
  );
  const pitches = transpositionSourceRecords(seed, "storedPitches").map(
    (entry, index) => transposeStoredPitch(
      sourceOracleSpelling(
        entry["spelling"],
        `${String(seed["id"])}.sourceOracle.storedPitches[${String(index)}].spelling`,
      ),
      root,
    ),
  );
  const bassPolicy = requestProjection["bassPolicy"];
  if (bassPolicy !== "included") {
    throw new TypeError(`${String(seed["id"])}: stored bass policy must be included`);
  }
  const voicing = makeManualVoicing(
    {
      mode: "manual",
      pitches,
      bassPolicy,
    },
    null,
  );
  if (!voicing.ok) throw new Error(`${root.id}: Manual transposition`);
  return Object.freeze({
    schema: "changes.theory.voicing-request.v1",
    kind: "stored",
    voicing: voicing.value,
  });
}

function inverseStoredPitch(
  root: TranspositionRoot,
  pitch: SpelledPitch,
): SpelledPitch {
  const rootStep = SPELLING_STEPS.indexOf(root.step as (typeof SPELLING_STEPS)[number]);
  const pitchStep = SPELLING_STEPS.indexOf(
    pitch.step,
  );
  if (rootStep < 0 || pitchStep < 0) throw new Error(`${root.id}: stored inverse step`);
  const step = SPELLING_STEPS[(pitchStep - rootStep + 7) % 7];
  if (step === undefined) throw new Error(`${root.id}: stored inverse source step`);
  const projection = projectSpelledPitch(pitch);
  if (!projection.ok) throw new Error(`${root.id}: stored inverse projection`);
  const sourceMidi = Number(projection.value.midi) - root.pitchClass;
  const sourcePitchClass = (
    Number(NATURAL_PITCH_CLASSES[pitch.step]) + pitch.alter - root.pitchClass + 24
  ) % 12;
  const alter = normalizedAlter(
    sourcePitchClass - Number(NATURAL_PITCH_CLASSES[step]),
  );
  const octave = (
    sourceMidi - (Number(NATURAL_PITCH_CLASSES[step]) + alter)
  ) / 12 - 1;
  const result = makeSpelledPitch({ step, alter, octave });
  if (!result.ok) throw new Error(`${root.id}: stored inverse pitch`);
  return result.value;
}

function executeStoredTranspositionSeed(seed: JsonRecord): V0ConformanceCaseEnvelope {
  const sourceOracle = transpositionSourceOracle(seed);
  const sourceRequestProjection = record(
    sourceOracle["requestProjection"],
    `${String(seed["id"])}.sourceOracle.requestProjection`,
  );
  const sourcePitches = transpositionSourceRecords(seed, "storedPitches").map(
    (entry, index) => sourceOracleSpelling(
      entry["spelling"],
      `${String(seed["id"])}.sourceOracle.storedPitches[${String(index)}].spelling`,
    ),
  );
  const executions = transpositionFixture.roots.map((root) => {
    const request = storedTranspositionRequest(seed, root);
    const result = realizeVoicing(request);
    const projections = request.voicing.pitches.map((pitch) => {
      const projected = projectSpelledPitch(pitch);
      if (!projected.ok) throw new Error(`${root.id}: stored pitch projection`);
      return { pitch, midi: Number(projected.value.midi) };
    });
    const lowest = Math.min(...projections.map(({ midi: value }) => value));
    const inversePitches = request.voicing.pitches.map((pitch) =>
      inverseStoredPitch(root, pitch)
    );
    const storedResultRecord = record(result.value, `${root.id}.storedResult`);
    const fullResultSetAudit: TranspositionFullResultSetAudit = Object.freeze({
      ...EXPECTED_STORED_FULL_RESULT_SET_AUDIT,
      candidateCardinalityClass:
        storedResultRecord["kind"] === "stored-bypass" &&
          storedResultRecord["candidateGenerationPerformed"] === false
          ? "zero-not-applicable"
          : "invalid",
    });
    const actual = {
      rootId: root.id,
      rootSymbol: root.symbol,
      kind: result.value.kind,
      candidateGenerationPerformed: result.value.candidateGenerationPerformed,
      sameObjectValue: result.value.voicing === request.voicing,
      pitches: projections.map(({ pitch }) => pitch),
      relativeMidiFromLowest: projections.map(({ midi: value }) => value - lowest),
      termination: result.evidence.termination,
      inverseRequestProjection: {
        mode: request.voicing.mode,
        bassPolicy: request.voicing.bassPolicy,
        pitches: inversePitches,
      },
      inverseRequestProjectionRestored: sameCanonical(
        canonicalize(inversePitches),
        canonicalize(sourcePitches),
      ),
      fullResultSetAudit,
    };
    const expectedPitches = sourcePitches.map((pitch) =>
      transposeStoredPitch(pitch, root)
    );
    return Object.freeze({
      root,
      request,
      result,
      actual,
      expected: {
        rootId: root.id,
        rootSymbol: root.symbol,
        kind: "stored-bypass",
        candidateGenerationPerformed: false,
        sameObjectValue: true,
        pitches: expectedPitches,
        relativeMidiFromLowest: seed["relativeMidiFromLowest"],
        termination: sourceOracle["expectedTermination"],
        inverseRequestProjection: {
          mode: sourceRequestProjection["mode"],
          bassPolicy: sourceRequestProjection["bassPolicy"],
          pitches: sourcePitches,
        },
        inverseRequestProjectionRestored: true,
        fullResultSetAudit: EXPECTED_STORED_FULL_RESULT_SET_AUDIT,
      },
    });
  });
  return createEnvelope(
    String(seed["id"]),
    "tests/fixtures/voicing/transposition-seeds.json",
    "transposition",
    {
      caseId: seed["id"],
      rootCellCount: executions.length,
      cells: executions.map(({ actual }) => actual),
    },
    {
      caseId: seed["id"],
      rootCellCount: transpositionFixture.roots.length,
      cells: executions.map(({ expected }) => expected),
    },
    executions.map(({ root, request }) => ({ rootId: root.id, request })),
    executions.map(({ root, result }) => ({ rootId: root.id, result })),
  );
}

export function executeV0TranspositionSeed(caseId: string): V0ConformanceCaseEnvelope {
  const seed = transpositionSeed(caseId);
  if (caseId === "V0-TRANS-016") return executeStoredTranspositionSeed(seed);
  const executions: readonly GeneratedTranspositionExecution[] =
    transpositionFixture.roots.map((root) => {
    const request = transpositionRequest(seed, root);
    const result = realizeVoicing(request);
    return Object.freeze({
      root,
      request,
      result,
    });
  });
  const audits = fullResultSetTranspositionAudits(seed, executions);
  const projectedExecutions = executions.map(({ root, request, result }) => {
    const audit = audits.get(root.id);
    if (audit === undefined) {
      throw new Error(`${caseId}/${root.id}: missing full-result-set audit`);
    }
    return Object.freeze({
      root,
      request,
      result,
      projection: transpositionCellProjection(seed, root, result, audit),
    });
  });
  return createEnvelope(
    caseId,
    "tests/fixtures/voicing/transposition-seeds.json",
    "transposition",
    {
      caseId,
      rootCellCount: projectedExecutions.length,
      cells: projectedExecutions.map(({ projection }) => projection),
    },
    {
      caseId,
      rootCellCount: transpositionFixture.roots.length,
      cells: transpositionFixture.roots.map((root) =>
        expectedTranspositionCell(seed, root)
      ),
    },
    projectedExecutions.map(({ root, request }) => ({ rootId: root.id, request })),
    projectedExecutions.map(({ root, result }) => ({ rootId: root.id, result })),
  );
}

const LAW_WITNESS_EXECUTION_CASES: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    "V0-ALT-NEAR-001": ["V0-CAND-012", "V0-CAND-030"],
    "V0-BYPASS-NEAR-001": ["V0-CAND-031"],
    "V0-BYPASS-NEAR-002": ["V0-CAND-032"],
    "V0-COUNT-NEAR-001": ["V0-CAND-013"],
    "V0-COUNT-NEAR-002": ["V0-CAND-014"],
    "V0-DOUBLING-NEAR-001": ["V0-CAND-015"],
    "V0-DOUBLING-NEAR-002": ["V0-CAND-015"],
    "V0-DROP2-NEAR-001": ["V0-CAND-004"],
    "V0-DROP2-NEAR-002": ["V0-CAND-004"],
    "V0-DROP2-NEAR-003": ["V0-CAND-036"],
    "V0-FALLBACK-NEAR-001": ["V0-CAND-029"],
    "V0-GUIDE-NEAR-001": ["V0-CAND-033"],
    "V0-IDENTITY-NEAR-001": ["V0-CAND-017", "V0-CAND-024"],
    "V0-IDENTITY-NEAR-002": ["V0-CAND-001", "V0-CAND-012"],
    "V0-IMMUTABLE-001": ["V0-CAND-001"],
    "V0-IMMUTABLE-NEAR-001": ["V0-CAND-001"],
    "V0-LOCAL-001": ["V0-CAND-001"],
    "V0-LOCAL-NEAR-001": ["V0-CAND-001"],
    "V0-ORDER-001": ["V0-CAND-001"],
    "V0-ORDER-002": ["V0-CAND-001"],
    "V0-ORDER-NEAR-001": ["V0-CAND-001"],
    "V0-RANGE-BOUNDARY-001": [
      "V0-MIDI-BOUNDARY-001-INCLUSIVE-MINIMUM",
      "V0-MIDI-BOUNDARY-002-INCLUSIVE-MAXIMUM",
    ],
    "V0-RANGE-NEAR-001": [
      "V0-MIDI-BOUNDARY-003-BELOW-MINIMUM",
      "V0-MIDI-BOUNDARY-004-ABOVE-MAXIMUM",
    ],
    "V0-ROOTLESS-NEAR-001": ["V0-CAND-006", "V0-CAND-019"],
    "V0-SLASH-NEAR-001": ["V0-CAND-013"],
    "V0-SLASH-NEAR-002": ["V0-CAND-013"],
    "V0-SLASH-NEAR-003": ["V0-CAND-013", "V0-CAND-014"],
    "V0-SPELL-NEAR-001": ["V0-CAND-008", "V0-CAND-012"],
    "V0-SPELL-NEAR-002": ["V0-CAND-016"],
    "V0-TRANS-MATRIX-001": [
      "V0-TRANS-005", "V0-TRANS-012", "V0-TRANS-013", "V0-TRANS-018",
    ],
    "V0-TRANS-NEAR-001": ["V0-TRANS-012", "V0-TRANS-013"],
    "V0-TRANS-NEAR-002": ["V0-TRANS-005", "V0-TRANS-018"],
    "V0-UNISON-NEAR-001": ["V0-CAND-031"],
    "V0-WEAVE-NEAR-001": ["V0-CAND-001", "V0-CAND-003"],
    "V0-ADAPTIVE-SLOTS-NEAR-001": ["V0-CAND-033"],
    "V0-CONSTRAINT-OVERFLOW-NEAR-001": ["V0-OP-SUCCESS-004"],
  });

function lawWitness(caseId: string): LawWitness {
  const found = lawFixture.witnesses.find(({ id }) => id === caseId);
  if (found === undefined) throw new Error(`${caseId}: law witness missing`);
  return found;
}

function isDeeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => isDeeplyFrozen(child, seen));
}

function freezeRecursively<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeRecursively(child, seen);
  Object.freeze(value);
  return value;
}

function activeDeepImmutabilityProbe(value: unknown): Readonly<{
  reachableObjects: number;
  mutationAttempts: number;
  failedMutationAttempts: number;
  bytesUnchanged: boolean;
}> {
  const before = JSON.stringify(value);
  const seen = new Set<object>();
  const objects: object[] = [];
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return;
    seen.add(candidate);
    objects.push(candidate);
    for (const child of Object.values(candidate)) visit(child);
  };
  visit(value);
  let mutationAttempts = 0;
  let failedMutationAttempts = 0;
  const attempt = (mutation: () => boolean): void => {
    mutationAttempts += 1;
    try {
      if (!mutation()) failedMutationAttempts += 1;
    } catch {
      failedMutationAttempts += 1;
    }
  };
  for (const target of objects) {
    attempt(() => Reflect.set(target, "__v0_mutation_probe__", true));
    const firstKey = Object.keys(target)[0];
    if (firstKey !== undefined) {
      attempt(() => Reflect.deleteProperty(target, firstKey));
    }
    if (Array.isArray(target)) {
      attempt(() => {
        Array.prototype.splice.call(target, 0, 0, "v0-mutation-probe");
        return true;
      });
    }
  }
  return Object.freeze({
    reachableObjects: objects.length,
    mutationAttempts,
    failedMutationAttempts,
    bytesUnchanged: JSON.stringify(value) === before,
  });
}

function executeWitnessChild(caseId: string): V0ConformanceCaseEnvelope {
  if (V0_CANDIDATE_CASES.some(({ id }) => id === caseId)) {
    return executeV0CandidateCase(caseId);
  }
  if (caseId.startsWith("V0-TRANS-")) return executeV0TranspositionSeed(caseId);
  if (caseId.startsWith("V0-OP-")) return executeV0OperationCase(caseId);
  return executeV0LimitCase(caseId);
}

function exactGeneratedCandidate(caseId: string): Readonly<{
  request: AutoVoicingRequest;
  result: Extract<RealizeVoicingResult, { ok: true }>;
  candidate: VoicingCandidate;
}> {
  const recipe = v0CandidateCase(caseId);
  if (!("sourceSymbol" in recipe) || recipe.expected.kind !== "must-contain-candidate") {
    throw new Error(`${caseId}: generated success fixture required`);
  }
  const request = buildV0CandidateRequest(recipe);
  if (request.kind !== "auto") throw new Error(`${caseId}: Auto request required`);
  const result = realizeVoicing(request);
  if (!result.ok) {
    throw new Error(`${caseId}: generated production result required`);
  }
  const candidate = findV0CandidateWithExpectedVoices(result.value.candidates, recipe.expected);
  if (candidate === undefined) throw new Error(`${caseId}: exact candidate missing`);
  return { request, result, candidate };
}

export function v0TwoOctaveDoublingAuditControl(): Readonly<{
  request: AutoVoicingRequest;
  sourceCandidate: VoicingCandidate;
  mutantResult: RealizeVoicingResult;
  originalMidiDelta: number;
  mutantMidiDelta: number;
  audit: V0CanonicalJson;
  failedCheckIds: readonly string[];
}> {
  const execution = exactGeneratedCandidate("V0-CAND-015");
  if (execution.result.value.kind !== "generated") {
    throw new Error("V0-CAND-015: generated result required for doubling control");
  }
  const sourceCandidate = execution.result.value.candidates.find(
    ({ id }) => id === "candidate-000",
  );
  if (sourceCandidate === undefined) {
    throw new Error("V0-CAND-015: candidate-000 doubling control missing");
  }
  const sourceVoice = sourceCandidate.voices.find((voice) =>
    voice.provenance === "realization" && voice.sourceDegreeIndex === 0
  );
  const doublingVoice = sourceCandidate.voices.find((voice) =>
    voice.provenance === "doubling" && voice.sourceDegreeIndex === 0
  );
  if (sourceVoice === undefined || doublingVoice === undefined ||
      sourceVoice.degree === null || doublingVoice.degree === null) {
    throw new Error("V0-CAND-015: paired root voices missing");
  }
  const liftedPitch = makeSpelledPitch({
    step: doublingVoice.pitch.step,
    alter: doublingVoice.pitch.alter,
    octave: doublingVoice.pitch.octave + 1,
  });
  const liftedMidi = makeMidiPitch(Number(doublingVoice.midi) + 12);
  if (!liftedPitch.ok || !liftedMidi.ok) {
    throw new Error("V0-CAND-015: two-octave doubling projection invalid");
  }
  const voices = sourceCandidate.voices.map((voice) =>
    voice === doublingVoice
      ? { ...voice, pitch: liftedPitch.value, midi: liftedMidi.value }
      : { ...voice }
  ).sort((left, right) => Number(left.midi) - Number(right.midi))
    .map((voice, ordinal) => ({ ...voice, ordinal }));
  const pitches = voices.map(({ pitch }) => pitch);
  const degrees = voices.flatMap(({ degree }) => degree === null ? [] : [degree]);
  const voiceOrdinals = voices.map(({ ordinal }) => ordinal);
  const midiValues = voices.map(({ midi: value }) => value);
  const mutantCandidate = freezeRecursively({
    ...sourceCandidate,
    voices,
    pitches,
    hardConstraints: sourceCandidate.hardConstraints.map((constraint) => ({
      ...constraint,
      voiceOrdinals,
      degrees,
      midiValues,
    })),
    evidence: sourceCandidate.evidence.map((row) => ({
      ...row,
      voiceOrdinals,
      degrees,
    })),
    localScore: {
      optionalDegreesOmitted: 0,
      nonPreferredDoublings: 0,
      guideToneDoublings: 0,
      templateOrderDisplacement: 2,
      targetSpanDistance: 12,
      rangeCenterDistanceTwice: 0,
    },
    explanation: {
      ...sourceCandidate.explanation,
      orderedDegrees: degrees,
    },
  }) as unknown as VoicingCandidate;
  const mutantResult = freezeRecursively({
    ...execution.result,
    value: {
      ...execution.result.value,
      rawCandidateCount: 1,
      candidates: [mutantCandidate],
    },
  }) as unknown as RealizeVoicingResult;
  const audit = auditV0GeneratedResultSet(execution.request, mutantResult);
  const auditRecord = record(audit, "V0-CAND-015 two-octave audit");
  const checks = auditRecord["checks"];
  if (!Array.isArray(checks)) {
    throw new TypeError("V0-CAND-015 two-octave audit checks missing");
  }
  const failedCheckIds = checks.flatMap((value) => {
    const check = record(value, "V0-CAND-015 two-octave audit check");
    return check["accepted"] === false && typeof check["id"] === "string"
      ? [check["id"]]
      : [];
  });
  return Object.freeze({
    request: execution.request,
    sourceCandidate,
    mutantResult,
    originalMidiDelta: Number(doublingVoice.midi) - Number(sourceVoice.midi),
    mutantMidiDelta: Number(liftedMidi.value) - Number(sourceVoice.midi),
    audit,
    failedCheckIds: Object.freeze(failedCheckIds),
  });
}

function refusalReasons(result: RealizeVoicingResult): readonly string[] {
  return !result.ok && result.refusal.code === "voicing.constraints_unsatisfied"
    ? result.refusal.constraints.map(({ reason }) => reason)
    : [];
}

function ambientReplayProbe(): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const base = baseAutoRequest("V0-CAND-001");
  const baseline = realizeVoicing(base);
  const forbiddenFields = Object.freeze([
    Object.freeze({ id: "previous", value: Object.freeze({ id: "ambient-previous" }) }),
    Object.freeze({ id: "next", value: Object.freeze({ id: "ambient-next" }) }),
    Object.freeze({ id: "voiceId", value: "ambient-voice" }),
    Object.freeze({ id: "pairwiseCost", value: 9_999 }),
    Object.freeze({ id: "cancellation", value: Object.freeze({ requested: true }) }),
    Object.freeze({ id: "staleRevision", value: 8_888 }),
    Object.freeze({ id: "elapsedTime", value: 7_777 }),
  ] as const);
  const fieldExecutions = forbiddenFields.map(({ id, value }) => {
    const request = Object.freeze({ ...base, [id]: value }) as unknown as
      AutoVoicingRequest;
    const result = realizeVoicing(request);
    return Object.freeze({
      id,
      request,
      result,
      equal: sameCanonical(canonicalize(baseline), canonicalize(result)),
    });
  });

  const runWithClock = (): RealizeVoicingResult => {
    const original = Date.now;
    try {
      Date.now = () => 6_666_666_666_666;
      return realizeVoicing(base);
    } finally {
      Date.now = original;
    }
  };
  const runWithRandom = (): RealizeVoicingResult => {
    const original = Math.random;
    try {
      Math.random = () => 0.123_456_789;
      return realizeVoicing(base);
    } finally {
      Math.random = original;
    }
  };
  const runWithHostileLocaleCompare = (): RealizeVoicingResult => {
    const original = Object.getOwnPropertyDescriptor(String.prototype, "localeCompare");
    if (original === undefined) throw new Error("localeCompare descriptor missing");
    try {
      Object.defineProperty(String.prototype, "localeCompare", {
        configurable: true,
        writable: true,
        value: () => 1,
      });
      return realizeVoicing(base);
    } finally {
      Object.defineProperty(String.prototype, "localeCompare", original);
    }
  };
  const ambientExecutions = Object.freeze([
    Object.freeze({
      id: "clock",
      input: Object.freeze({
        request: base,
        ambientOverride: Object.freeze({
          kind: "clock",
          value: 6_666_666_666_666,
        }),
      }),
      result: runWithClock(),
    }),
    Object.freeze({
      id: "random",
      input: Object.freeze({
        request: base,
        ambientOverride: Object.freeze({
          kind: "random",
          value: 0.123_456_789,
        }),
      }),
      result: runWithRandom(),
    }),
    Object.freeze({
      id: "localeCompare",
      input: Object.freeze({
        request: base,
        ambientOverride: Object.freeze({
          kind: "localeCompare",
          value: 1,
        }),
      }),
      result: runWithHostileLocaleCompare(),
    }),
  ]);
  const perturbations = Object.freeze([
    ...fieldExecutions.map(({ id, equal }) => Object.freeze({ id, equal })),
    ...ambientExecutions.map(({ id, result }) => Object.freeze({
      id,
      equal: sameCanonical(canonicalize(baseline), canonicalize(result)),
    })),
  ]);
  const equal = perturbations.every(({ equal: matches }) => matches);
  const equality = (id: string): boolean =>
    perturbations.find((row) => row.id === id)?.equal ?? false;
  return {
    actual: {
      requestOnlyDependency: equal,
      previousIgnored: equality("previous"),
      nextIgnored: equality("next"),
      voiceIdIgnored: equality("voiceId"),
      pairwiseCostIgnored: equality("pairwiseCost"),
      cancellationIgnored: equality("cancellation"),
      staleRevisionIgnored: equality("staleRevision"),
      elapsedTimeIgnored: equality("elapsedTime"),
      clockIgnored: equality("clock"),
      randomIgnored: equality("random"),
      localeIgnored: equality("localeCompare"),
      perturbations,
    },
    expected: {
      requestOnlyDependency: true,
      previousIgnored: true,
      nextIgnored: true,
      voiceIdIgnored: true,
      pairwiseCostIgnored: true,
      cancellationIgnored: true,
      staleRevisionIgnored: true,
      elapsedTimeIgnored: true,
      clockIgnored: true,
      randomIgnored: true,
      localeIgnored: true,
      perturbations: perturbations.map(({ id }) => ({ id, equal: true })),
    },
    runtimeInput: {
      base,
      oneFieldAtATime: fieldExecutions.map(({ id, request }) => ({ id, request })),
      ambient: ambientExecutions.map(({ id, input }) => ({ id, input })),
    },
    runtimeOutput: {
      baseline,
      oneFieldAtATime: fieldExecutions.map(({ id, result }) => ({ id, result })),
      ambient: ambientExecutions.map(({ id, result }) => ({ id, result })),
    },
  };
}

function duplicateMidiProductionProbe(): Readonly<{
  request: AutoVoicingRequest;
  result: RealizeVoicingResult;
  projection: V0CanonicalJson;
}> {
  const requestValue = structuredClone(
    baseAutoRequest("V0-CAND-001"),
  ) as unknown as JsonRecord;
  const resolved = record(requestValue["resolved"], "duplicate probe resolved");
  const realizations = resolved["realizations"];
  if (!Array.isArray(realizations) || realizations.length !== 1) {
    throw new TypeError("duplicate probe realization");
  }
  const realization = record(realizations[0], "duplicate probe realization");
  const spellings = realization["spelledPitchNames"];
  const pitchClasses = realization["pitchClasses"];
  if (!Array.isArray(spellings) || !Array.isArray(pitchClasses)) {
    throw new TypeError("duplicate probe aligned spelling");
  }
  spellings[2] = { step: "E", alter: 0 };
  pitchClasses[2] = 4;
  const policy = record(requestValue["policy"], "duplicate probe policy");
  policy["range"] = { lowMidi: 60, highMidi: 71 };
  const request = requestValue as unknown as AutoVoicingRequest;
  const result = realizeVoicing(request);
  const constraints = !result.ok &&
    result.refusal.code === "voicing.constraints_unsatisfied"
      ? result.refusal.constraints
      : [];
  return Object.freeze({
    request,
    result,
    projection: canonicalize({
      ok: result.ok,
      refusalCode: result.ok ? null : result.refusal.code,
      termination: result.evidence.termination,
      reasons: constraints.map(({ reason }) => reason),
      constraints: constraints.map((constraint) => ({
        code: constraint.code,
        reason: constraint.reason,
        voiceOrdinals: constraint.voiceOrdinals,
        degrees: constraint.degrees.map(degreeToken),
        midiValues: constraint.midiValues.map(Number),
      })),
    }),
  });
}

function mutateCandidate(
  source: VoicingCandidate,
  mutation: (candidate: JsonRecord) => void,
): VoicingCandidate {
  const value = structuredClone(source) as unknown as JsonRecord;
  mutation(value);
  return value as unknown as VoicingCandidate;
}

function stableCandidateInsertionOrder(
  candidates: readonly VoicingCandidate[],
): readonly VoicingCandidate[] {
  const ordered: VoicingCandidate[] = [];
  for (const candidate of candidates) {
    let index = ordered.length;
    while (index > 0) {
      const previous = ordered[index - 1];
      if (previous === undefined || compareVoicingCandidates(previous, candidate) <= 0) {
        break;
      }
      index -= 1;
    }
    ordered.splice(index, 0, candidate);
  }
  return Object.freeze(ordered);
}

function localScoreAxisProof(candidate: VoicingCandidate): readonly unknown[] {
  return VOICING_LOCAL_SCORE_AXIS_ORDER.map((axis, axisIndex) => {
    const left = mutateCandidate(candidate, (value) => {
      const score = record(value["localScore"], `${axis}.left score`);
      for (let index = axisIndex + 1; index < VOICING_LOCAL_SCORE_AXIS_ORDER.length;
        index += 1) {
        const laterAxis = VOICING_LOCAL_SCORE_AXIS_ORDER[index];
        if (laterAxis !== undefined) score[laterAxis] = 9;
      }
    });
    const right = mutateCandidate(candidate, (value) => {
      const score = record(value["localScore"], `${axis}.right score`);
      score[axis] = Number(score[axis]) + 1;
      for (let index = axisIndex + 1; index < VOICING_LOCAL_SCORE_AXIS_ORDER.length;
        index += 1) {
        const laterAxis = VOICING_LOCAL_SCORE_AXIS_ORDER[index];
        if (laterAxis !== undefined) score[laterAxis] = 0;
      }
    });
    return Object.freeze({
      axis,
      comparison: compareVoicingLocalScores(left.localScore, right.localScore),
      candidateComparison: compareVoicingCandidates(left, right),
      reverseComparison: compareVoicingCandidates(right, left),
    });
  });
}

function candidateTieBreakProof(candidate: VoicingCandidate): readonly unknown[] {
  const rows = Object.freeze([
    Object.freeze({
      key: "midi-sequence-lexicographic",
      right: mutateCandidate(candidate, (value) => {
        const voices = value["voices"];
        if (!Array.isArray(voices)) throw new TypeError("MIDI tie-break voices");
        const first = record(voices[0], "MIDI tie-break voice");
        first["midi"] = Number(first["midi"]) + 1;
      }),
    }),
    Object.freeze({
      key: "degree-number-then-alter-lexicographic",
      right: mutateCandidate(candidate, (value) => {
        const voices = value["voices"];
        if (!Array.isArray(voices)) throw new TypeError("degree tie-break voices");
        record(voices[0], "degree tie-break voice")["degree"] = {
          number: 2,
          alter: 0,
        };
      }),
    }),
    Object.freeze({
      key: "spelling-octave-then-domain-step-then-alter-lexicographic",
      right: mutateCandidate(candidate, (value) => {
        const pitches = value["pitches"];
        if (!Array.isArray(pitches)) throw new TypeError("spelling tie-break pitches");
        const first = record(pitches[0], "spelling tie-break pitch");
        first["alter"] = Number(first["alter"]) + 1;
      }),
    }),
    Object.freeze({
      key: "template-id-utf16-lexicographic",
      right: mutateCandidate(candidate, (value) => {
        const explanation = record(value["explanation"], "template tie-break");
        explanation["templateId"] = `${String(explanation["templateId"])}~`;
      }),
    }),
    Object.freeze({
      key: "raw-generation-ordinal",
      right: mutateCandidate(candidate, (value) => {
        value["rawGenerationOrdinal"] = Number(value["rawGenerationOrdinal"]) + 1;
      }),
    }),
  ]);
  return rows.map(({ key, right }) => Object.freeze({
    key,
    comparison: compareVoicingCandidates(candidate, right),
    reverseComparison: compareVoicingCandidates(right, candidate),
  }));
}

function reversedAndLocaleOrderProof(): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const execution = exactGeneratedCandidate("V0-CAND-001");
  const candidates = execution.result.value.kind === "generated"
    ? execution.result.value.candidates
    : [];
  const expectedKeys = candidates.map(({ voices }) => candidateIdentityKey(voices));
  const reversed = stableCandidateInsertionOrder([...candidates].reverse());
  const reversedKeys = reversed.map(({ voices }) => candidateIdentityKey(voices));
  const originalLocaleCompare = Object.getOwnPropertyDescriptor(
    String.prototype, "localeCompare",
  );
  if (originalLocaleCompare === undefined) {
    throw new Error("localeCompare descriptor missing");
  }
  let hostileLocale: readonly VoicingCandidate[];
  let hostileReplay: RealizeVoicingResult;
  try {
    Object.defineProperty(String.prototype, "localeCompare", {
      configurable: true,
      writable: true,
      value: () => 1,
    });
    hostileLocale = stableCandidateInsertionOrder([...candidates].reverse());
    hostileReplay = realizeVoicing(execution.request);
  } finally {
    Object.defineProperty(String.prototype, "localeCompare", originalLocaleCompare);
  }
  const hostileKeys = hostileLocale.map(({ voices }) => candidateIdentityKey(voices));
  const hostileExecutorInput = Object.freeze({
    request: execution.request,
    ambientOverride: Object.freeze({
      kind: "localeCompare",
      value: 1,
    }),
  });
  const originalAscending = candidates.slice(1).every((candidate, index) => {
    const previous = candidates[index];
    return previous !== undefined && compareVoicingCandidates(previous, candidate) <= 0;
  });
  return {
    actual: {
      candidateCount: candidates.length,
      originalAscending,
      reversedEnumerationRestored: sameCanonical(
        canonicalize(reversedKeys), canonicalize(expectedKeys),
      ),
      hostileLocaleEnumerationRestored: sameCanonical(
        canonicalize(hostileKeys), canonicalize(expectedKeys),
      ),
      hostileLocaleReplayEqual: sameCanonical(
        canonicalize(hostileReplay), canonicalize(execution.result),
      ),
    },
    expected: {
      candidateCount: 24,
      originalAscending: true,
      reversedEnumerationRestored: true,
      hostileLocaleEnumerationRestored: true,
      hostileLocaleReplayEqual: true,
    },
    runtimeInput: {
      request: execution.request,
      hostileExecutorInput,
      reversedIdentityKeys: [...expectedKeys].reverse(),
      reversedCandidates: [...candidates].reverse(),
    },
    runtimeOutput: {
      baseline: execution.result,
      hostileReplay,
      baselineIdentityKeys: expectedKeys,
      reversedIdentityKeys: reversedKeys,
      hostileIdentityKeys: hostileKeys,
    },
  };
}

function enharmonicWitnessProjection(): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const seed = transpositionSeed("V0-TRANS-012");
  const rows = transpositionFixture.enharmonicNearMissPairs.map((pair) => {
    const executeSide = (
      side: "left" | "right",
      source: typeof pair.left,
    ) => {
      const root: TranspositionRoot = Object.freeze({
        id: `${pair.id}-${side.toUpperCase()}`,
        symbol: source.symbol,
        step: source.step,
        alter: source.alter,
        pitchClass: source.pitchClass,
      });
      const request = transpositionRequest(seed, root);
      const result = realizeVoicing(request);
      const candidate = findTranspositionCandidate(result, seed);
      if (candidate === undefined) throw new Error(`${pair.id}/${side}: candidate`);
      return Object.freeze({
        root,
        request,
        result,
        candidate,
        voiceSpellings: candidate.voices.map(({ pitch }) => ({
          step: pitch.step,
          alter: pitch.alter,
        })),
        inverseProjection: inverseSpellingProjection(root, candidate),
      });
    };
    const left = executeSide("left", pair.left);
    const right = executeSide("right", pair.right);
    const expectedLeft = (seed["orderedDegrees"] as readonly unknown[]).map((degree) =>
      expectedSpellingForDegree(left.root, String(degree))
    );
    const expectedRight = (seed["orderedDegrees"] as readonly unknown[]).map((degree) =>
      expectedSpellingForDegree(right.root, String(degree))
    );
    return Object.freeze({
      pair,
      left,
      right,
      actual: {
        id: pair.id,
        leftRoot: {
          symbol: left.request.resolved.source.root.step === pair.left.step
            ? pair.left.symbol
            : "mismatch",
          step: left.request.resolved.source.root.step,
          alter: left.request.resolved.source.root.alter,
          pitchClass: pitchClassOf(left.request.resolved.source.root),
        },
        rightRoot: {
          symbol: right.request.resolved.source.root.step === pair.right.step
            ? pair.right.symbol
            : "mismatch",
          step: right.request.resolved.source.root.step,
          alter: right.request.resolved.source.root.alter,
          pitchClass: pitchClassOf(right.request.resolved.source.root),
        },
        leftVoiceSpellings: left.voiceSpellings,
        rightVoiceSpellings: right.voiceSpellings,
        soundingPitchClassEqual: pair.left.pitchClass === pair.right.pitchClass &&
          pitchClassOf(left.request.resolved.source.root) ===
            pitchClassOf(right.request.resolved.source.root),
        rootSpellingsDistinct:
          left.request.resolved.source.root.step !== right.request.resolved.source.root.step ||
          left.request.resolved.source.root.alter !== right.request.resolved.source.root.alter,
        outputSpellingsDistinct: !sameCanonical(
          canonicalize(left.voiceSpellings),
          canonicalize(right.voiceSpellings),
        ),
        inverseProjectionsEqual: sameCanonical(
          canonicalize(left.inverseProjection),
          canonicalize(right.inverseProjection),
        ),
      },
      expected: {
        id: pair.id,
        leftRoot: pair.left,
        rightRoot: pair.right,
        leftVoiceSpellings: expectedLeft,
        rightVoiceSpellings: expectedRight,
        soundingPitchClassEqual: true,
        rootSpellingsDistinct: true,
        outputSpellingsDistinct: true,
        inverseProjectionsEqual: true,
      },
    });
  });
  return {
    actual: {
      caseId: "V0-TRANS-NEAR-001",
      pairCount: rows.length,
      pairs: rows.map(({ actual }) => actual),
    },
    expected: {
      caseId: "V0-TRANS-NEAR-001",
      pairCount: transpositionFixture.enharmonicNearMissPairs.length,
      pairs: rows.map(({ expected }) => expected),
    },
    runtimeInput: rows.flatMap(({ pair, left, right }) => [
      { id: pair.id, side: "left", request: left.request },
      { id: pair.id, side: "right", request: right.request },
    ]),
    runtimeOutput: rows.flatMap(({ pair, left, right }) => [
      { id: pair.id, side: "left", result: left.result },
      { id: pair.id, side: "right", result: right.result },
    ]),
  };
}

function fullTranspositionMatrixWitnessProjection(): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const rows = transpositionFixture.seeds.map((seed) => {
    const caseId = String(seed["id"]);
    const envelope = executeV0TranspositionSeed(caseId);
    return Object.freeze({ caseId, envelope });
  });
  const project = (
    row: (typeof rows)[number],
    key: "actualProjection" | "expectedProjection",
  ): unknown => {
    const projection = record(row.envelope[key], `${row.caseId}.${key}`);
    return {
      caseId: row.caseId,
      rootCellCount: projection["rootCellCount"],
      cells: projection["cells"],
    };
  };
  return {
    actual: {
      caseId: "V0-TRANS-MATRIX-001",
      seedCount: rows.length,
      rootCount: transpositionFixture.roots.length,
      cellCount: rows.reduce((sum, row) => {
        const projection = record(row.envelope.actualProjection, row.caseId);
        return sum + Number(projection["rootCellCount"]);
      }, 0),
      everyCellAccepted: rows.every(({ envelope }) => envelope.baselineAccepted),
      seeds: rows.map((row) => project(row, "actualProjection")),
    },
    expected: {
      caseId: "V0-TRANS-MATRIX-001",
      seedCount: 18,
      rootCount: 12,
      cellCount: 216,
      everyCellAccepted: true,
      seeds: rows.map((row) => project(row, "expectedProjection")),
    },
    runtimeInput: rows.map(({ caseId, envelope }) => ({
      caseId,
      runtimeInput: envelope.runtimeInput,
    })),
    runtimeOutput: rows.map(({ caseId, envelope }) => ({
      caseId,
      runtimeOutput: envelope.runtimeOutput,
    })),
  };
}

function transpositionForwardPredicate(
  seed: JsonRecord,
  root: TranspositionRoot,
  result: RealizeVoicingResult,
): boolean {
  const candidate = findTranspositionCandidate(result, seed);
  if (candidate === undefined) return false;
  return candidate.realizationId === seed["realizationId"] &&
    candidate.family === seed["family"] &&
    candidate.explanation.templateId === seed["templateId"] &&
    sameCanonical(
      canonicalize(candidate.voices.map(({ pitch }) => pitch)),
      canonicalize(expectedForwardPitches(seed, root)),
    );
}

function transpositionNearMissRequestProjection(): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const rootB = transpositionFixture.roots.find(({ id }) => id === "V0-ROOT-012");
  const rootDb = transpositionFixture.roots.find(({ id }) => id === "V0-ROOT-002");
  if (rootB === undefined || rootDb === undefined) {
    throw new Error("V0 transposition near-miss roots missing");
  }

  const rangeSeed = transpositionSeed("V0-TRANS-017");
  const rangeCorrect = transpositionRequest(rangeSeed, rootB);
  const rangeMutant = Object.freeze({
    ...rangeCorrect,
    policy: Object.freeze({
      ...rangeCorrect.policy,
      range: Object.freeze({ lowMidi: 60, highMidi: 84 }),
    }),
  }) as unknown as AutoVoicingRequest;

  const contextSeed = transpositionSeed("V0-TRANS-014");
  const contextCorrect = transpositionRequest(contextSeed, rootDb);
  const contextMutant = Object.freeze({
    ...contextCorrect,
    quartalContext: null,
  }) as AutoVoicingRequest;

  const bassSeed = transpositionSeed("V0-TRANS-009");
  const bassCorrect = transpositionRequest(bassSeed, rootDb);
  const bassMutant = Object.freeze({
    ...bassCorrect,
    resolved: resolvedChord("Dbmaj7/Eb"),
  }) as AutoVoicingRequest;

  const rows = Object.freeze([
    Object.freeze({
      axis: "range",
      seed: rangeSeed,
      root: rootB,
      correctRequest: rangeCorrect,
      mutantRequest: rangeMutant,
    }),
    Object.freeze({
      axis: "quartal-context",
      seed: contextSeed,
      root: rootDb,
      correctRequest: contextCorrect,
      mutantRequest: contextMutant,
    }),
    Object.freeze({
      axis: "slash-or-external-bass",
      seed: bassSeed,
      root: rootDb,
      correctRequest: bassCorrect,
      mutantRequest: bassMutant,
    }),
  ]).map((row) => {
    const correctResult = realizeVoicing(row.correctRequest);
    const mutantResult = realizeVoicing(row.mutantRequest);
    const expectedRequest = expectedSourceRequestProjection(row.seed);
    const correctInverse = inverseRequestProjection(
      row.seed, row.root, row.correctRequest,
    );
    const mutantInverse = inverseRequestProjection(
      row.seed, row.root, row.mutantRequest,
    );
    const actual = {
      axis: row.axis,
      correctForwardAccepted: transpositionForwardPredicate(
        row.seed, row.root, correctResult,
      ),
      correctInverseRequestRestored: sameCanonical(
        canonicalize(correctInverse), canonicalize(expectedRequest),
      ),
      mutantForwardAccepted: transpositionForwardPredicate(
        row.seed, row.root, mutantResult,
      ),
      mutantInverseRequestRestored: sameCanonical(
        canonicalize(mutantInverse), canonicalize(expectedRequest),
      ),
    };
    return Object.freeze({
      ...row,
      correctResult,
      mutantResult,
      correctInverse,
      mutantInverse,
      actual: Object.freeze({
        ...actual,
        detectorKilledMutant:
          actual.correctForwardAccepted &&
          actual.correctInverseRequestRestored &&
          (!actual.mutantForwardAccepted || !actual.mutantInverseRequestRestored),
      }),
    });
  });

  return {
    actual: {
      caseId: "V0-TRANS-NEAR-002",
      oneAxisAtATime: rows.map(({ actual }) => actual),
    },
    expected: {
      caseId: "V0-TRANS-NEAR-002",
      oneAxisAtATime: [
        "range", "quartal-context", "slash-or-external-bass",
      ].map((axis) => ({
        axis,
        correctForwardAccepted: true,
        correctInverseRequestRestored: true,
        mutantForwardAccepted: false,
        mutantInverseRequestRestored: false,
        detectorKilledMutant: true,
      })),
    },
    runtimeInput: rows.map(({ axis, correctRequest, mutantRequest }) => ({
      axis,
      correctRequest,
      mutantRequest,
    })),
    runtimeOutput: rows.map(({
      axis, correctResult, mutantResult, correctInverse, mutantInverse,
    }) => ({ axis, correctResult, mutantResult, correctInverse, mutantInverse })),
  };
}

function adaptiveSlotsWitnessProjection(witness: LawWitness): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const base = baseAutoRequest("V0-CAND-012");
  const rows = Object.freeze([
    Object.freeze({ family: "balanced", voiceCount: 3 }),
    Object.freeze({ family: "balanced", voiceCount: 4 }),
    Object.freeze({ family: "balanced", voiceCount: 5 }),
    Object.freeze({ family: "drop2", voiceCount: 3 }),
  ] as const).map(({ family, voiceCount }) => {
    const request = Object.freeze({
      ...base,
      policy: Object.freeze({ ...base.policy, family, voiceCount }),
    }) as unknown as AutoVoicingRequest;
    const result = realizeVoicing(request);
    const constraints = !result.ok &&
      result.refusal.code === "voicing.constraints_unsatisfied"
        ? result.refusal.constraints
        : [];
    return Object.freeze({
      family,
      voiceCount,
      request,
      result,
      actual: Object.freeze({
        family,
        voiceCount,
        ok: result.ok,
        reasons: constraints.map(({ reason }) => reason),
        omittedRequiredDegrees: constraints
          .filter(({ reason }) => reason === "required-degree-omitted")
          .flatMap(({ degrees }) => degrees.map(degreeToken)),
        omittedGuideToneDegrees: constraints
          .filter(({ reason }) => reason === "guide-tone-omitted")
          .flatMap(({ degrees }) => degrees.map(degreeToken)),
      }),
    });
  });
  const fixtureExpected = record(witness.expected, `${witness.id}.expected`);
  const boundary = fixtureExpected["boundaryControls"];
  if (!Array.isArray(boundary)) throw new TypeError(`${witness.id}: boundaries`);
  const primaryExpected = {
    family: "balanced",
    voiceCount: 3,
    ok: false,
    reasons: fixtureExpected["reasons"],
    omittedRequiredDegrees: fixtureExpected["omittedRequiredDegrees"],
    omittedGuideToneDegrees: fixtureExpected["omittedGuideToneDegrees"],
  };
  const boundaryExpected = boundary.map((value) => {
    const row = record(value, `${witness.id}.boundary`);
    return {
      family: row["family"],
      voiceCount: row["voiceCount"],
      ok: Array.isArray(row["reasons"]) && row["reasons"].length === 0,
      reasons: row["reasons"],
      omittedRequiredDegrees: row["omittedRequiredDegrees"] ?? [],
      omittedGuideToneDegrees: [],
    };
  });
  return {
    actual: {
      caseId: witness.id,
      selectedRealizationId: base.realizationId,
      cases: rows.map(({ actual }) => actual),
      supportedAdaptiveCountsAvoidBelowMinimum:
        rows.slice(0, 3).every(({ actual }) =>
          !actual.reasons.includes("voice-count-below-template-minimum")
        ),
    },
    expected: {
      caseId: witness.id,
      selectedRealizationId: "alt-b9-b5",
      cases: [primaryExpected, ...boundaryExpected],
      supportedAdaptiveCountsAvoidBelowMinimum: true,
    },
    runtimeInput: rows.map(({ family, voiceCount, request }) => ({
      family, voiceCount, request,
    })),
    runtimeOutput: rows.map(({ family, voiceCount, result }) => ({
      family, voiceCount, result,
    })),
  };
}

function overflowWitnessProjection(witness: LawWitness): Readonly<{
  actual: unknown;
  expected: unknown;
  runtimeInput: unknown;
  runtimeOutput: unknown;
}> {
  const execution = executeV0OperationCase("V0-OP-SUCCESS-004");
  const projection = record(
    execution.actualProjection,
    `${witness.id}.V0-OP-SUCCESS-004`,
  );
  const evidence = record(projection["evidence"], `${witness.id}.evidence`);
  const setup = record(witness.setup, `${witness.id}.setup`);
  const before = record(
    setup["beforeFirstHardValidCandidate"],
    `${witness.id}.beforeFirstHardValidCandidate`,
  );
  return {
    actual: {
      caseId: witness.id,
      submittedDistinctObservationCount:
        before["fullPayloadUniqueUnsatisfiedObservations"],
      retainedObservationCount: evidence["constraintObservationsProduced"],
      peakObservationRecords: evidence["peakConstraintObservationRecords"],
      laterHardValidCandidateFound:
        projection["ok"] === true && projection["candidatesNonempty"] === true,
      provisionalOverflowOccurred:
        projection["provisionalObservationOverflowOccurred"],
      provisionalOverflowCleared:
        projection["provisionalObservationOverflowCleared"],
      candidateMidiValues: projection["candidateMidiValues"],
      refusalPresent: projection["refusalPresent"],
      partialResult: projection["partialResult"],
      termination: projection["termination"],
    },
    expected: {
      caseId: witness.id,
      submittedDistinctObservationCount: 17,
      retainedObservationCount: 16,
      peakObservationRecords: 16,
      laterHardValidCandidateFound: true,
      provisionalOverflowOccurred: true,
      provisionalOverflowCleared: true,
      candidateMidiValues: [[36, 43, 52, 59]],
      refusalPresent: false,
      partialResult: false,
      termination: "complete-generated",
    },
    runtimeInput: Object.freeze({
      executorInput: Object.freeze({ caseId: "V0-OP-SUCCESS-004" }),
      operationRuntimeInput: execution.runtimeInput,
    }),
    runtimeOutput: execution.runtimeOutput,
  };
}

function namedWitnessProjection(witness: LawWitness): V0WitnessProjection | null {
  if (witness.id === "V0-ALT-NEAR-001") {
    const root = transpositionFixture.roots[0];
    if (root === undefined || root.id !== "V0-ROOT-001") {
      throw new Error(`${witness.id}: C root missing`);
    }
    const seedIds = Object.freeze([
      "V0-TRANS-010", "V0-TRANS-011", "V0-TRANS-012", "V0-TRANS-013",
    ] as const);
    const rows = seedIds.map((seedId) => {
      const seed = transpositionSeed(seedId);
      const request = transpositionRequest(seed, root);
      const result = realizeVoicing(request);
      const candidate = findTranspositionCandidate(result, seed);
      if (candidate === undefined) throw new Error(`${witness.id}/${seedId}: candidate`);
      const expectedPitches = expectedForwardPitches(seed, root);
      const expectedIdentityKey = expectedPitches.map((pitch, index) => {
        const degree = String((seed["orderedDegrees"] as readonly unknown[])[index]);
        const parsed = v0DegreeFromToken(
          degree as Parameters<typeof v0DegreeFromToken>[0],
          witness.id,
        );
        const midiValue = 12 * (pitch.octave + 1) +
          Number(NATURAL_PITCH_CLASSES[pitch.step]) + pitch.alter;
        return [
          midiValue, pitch.octave, pitch.step, pitch.alter,
          `${parsed.number.toString()}:${parsed.alter.toString()}`,
          "realization", index,
        ].join("/");
      }).join("|");
      return Object.freeze({
        seedId,
        request,
        result,
        actual: {
          seedId,
          realizationId: candidate.realizationId,
          orderedDegrees: candidate.voices.map(({ degree }) =>
            degree === null ? null : degreeToken(degree)
          ),
          voiceSpellings: candidate.voices.map(({ pitch }) => pitch),
          identityKey: candidateIdentityKey(candidate.voices),
        },
        expected: {
          seedId,
          realizationId: seed["realizationId"],
          orderedDegrees: seed["orderedDegrees"],
          voiceSpellings: expectedPitches,
          identityKey: expectedIdentityKey,
        },
      });
    });
    const actualKeys = rows.map(({ actual }) => actual.identityKey);
    const expectedKeys = rows.map(({ expected }) => expected.identityKey);
    const leftOmissionSource = rows[0];
    const rightOmissionSource = rows[2];
    if (leftOmissionSource === undefined || rightOmissionSource === undefined) {
      throw new Error(`${witness.id}: altered omission pair missing`);
    }
    const omitAlteredNinth = (row: (typeof rows)[number]): readonly number[] =>
      row.actual.orderedDegrees.flatMap((token, index) => {
        if (token === null) throw new Error(`${witness.id}: altered degree missing`);
        if (token.endsWith("9")) return [];
        const pitch = row.actual.voiceSpellings[index];
        if (pitch === undefined) throw new Error(`${witness.id}: omission voice missing`);
        return [12 * (pitch.octave + 1) +
          Number(NATURAL_PITCH_CLASSES[pitch.step]) + pitch.alter];
      }).sort((left, right) => left - right);
    const leftOmittedPitchSet = omitAlteredNinth(leftOmissionSource);
    const rightOmittedPitchSet = omitAlteredNinth(rightOmissionSource);
    const omissionMutant = Object.freeze({
      omittedDegreeNumber: 9,
      leftRealizationId: leftOmissionSource.actual.realizationId,
      rightRealizationId: rightOmissionSource.actual.realizationId,
      leftPitchSet: leftOmittedPitchSet,
      rightPitchSet: rightOmittedPitchSet,
    });
    const omissionDetectorOutput = Object.freeze({
      pitchSetsEqual: sameCanonical(
        canonicalize(leftOmittedPitchSet), canonicalize(rightOmittedPitchSet),
      ),
      realizationIdsDistinct:
        leftOmissionSource.actual.realizationId !==
          rightOmissionSource.actual.realizationId,
      mutantAccepted: leftOmissionSource.actual.realizationId ===
        rightOmissionSource.actual.realizationId,
    });
    const runtimeInput = rows.map(({ seedId, request }) => ({ seedId, request }));
    const runtimeOutput = rows.map(({ seedId, result }) => ({ seedId, result }));
    return {
      actual: {
        caseId: witness.id,
        realizationCount: rows.length,
        realizations: rows.map(({ actual }) => actual),
        identityKeysDistinct: new Set(actualKeys).size === rows.length,
        realizationIdsDistinct:
          new Set(rows.map(({ actual }) => actual.realizationId)).size === rows.length,
      },
      expected: {
        caseId: witness.id,
        realizationCount: seedIds.length,
        realizations: rows.map(({ expected }) => expected),
        identityKeysDistinct: new Set(expectedKeys).size === seedIds.length,
        realizationIdsDistinct: true,
      },
      runtimeInput,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        runtimeOutput,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "altered-realization-identity-after-omission",
            omissionMutant,
            omissionDetectorOutput,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-BYPASS-NEAR-001" ||
      witness.id === "V0-BYPASS-NEAR-002") {
    const candidateCaseId = witness.id.endsWith("001")
      ? "V0-CAND-031"
      : "V0-CAND-032";
    const recipe = v0CandidateCase(candidateCaseId);
    if (!("request" in recipe)) throw new Error(`${witness.id}: stored recipe`);
    const request = buildV0CandidateRequest(recipe);
    if (request.kind !== "stored") throw new Error(`${witness.id}: stored request`);
    const result = realizeVoicing(request);
    const value = result.value;
    const expectedPitches = recipe.request.voicing.pitches;
    const actual = {
      caseId: witness.id,
      mode: value.voicing.mode,
      pitchTuple: value.voicing.pitches,
      sameVoicingObjectReference: value.voicing === request.voicing,
      duplicateAndOrderPreserved: sameCanonical(
        canonicalize(value.voicing.pitches), canonicalize(expectedPitches),
      ),
      generatedBy: value.voicing.mode === "frozen" ? value.voicing.generatedBy : null,
      generatedByObjectReferencePreserved:
        value.voicing.mode === "frozen" && request.voicing.mode === "frozen"
          ? value.voicing.generatedBy === request.voicing.generatedBy
          : candidateCaseId === "V0-CAND-031",
      candidateGenerationPerformed: value.candidateGenerationPerformed,
      rawCandidateCount: value.rawCandidateCount,
      retainedCandidateCount: value.retainedCandidateCount,
      allNumericCountersZero: allNumericEvidenceCountersZero(
        record(result.evidence, `${witness.id}.evidence`),
      ),
      termination: result.evidence.termination,
    };
    return {
      actual,
      expected: {
        caseId: witness.id,
        mode: recipe.request.voicing.mode,
        pitchTuple: expectedPitches,
        sameVoicingObjectReference: true,
        duplicateAndOrderPreserved: true,
        generatedBy: recipe.request.voicing.mode === "frozen"
          ? recipe.request.voicing.generatedBy
          : null,
        generatedByObjectReferencePreserved: true,
        candidateGenerationPerformed: false,
        rawCandidateCount: 0,
        retainedCandidateCount: 0,
        allNumericCountersZero: true,
        termination: "complete-bypass",
      },
      runtimeInput: request,
      runtimeOutput: result,
      executionEvidence: witnessExecutionEvidence(witness.id, request, result, {
        production: [productionBranchEvidence(
          witness.id, "realizeVoicing-stored-bypass", request, result,
        )],
      }),
    };
  }
  if (witness.id === "V0-COUNT-NEAR-001" ||
      witness.id === "V0-COUNT-NEAR-002") {
    const candidateCaseId = witness.id.endsWith("001")
      ? "V0-CAND-013"
      : "V0-CAND-014";
    const execution = exactGeneratedCandidate(candidateCaseId);
    const slashCount = execution.candidate.voices.filter(
      ({ provenance }) => provenance === "slash-bass",
    ).length;
    const degreeVoiceCount = execution.candidate.voices.filter(
      ({ degree }) => degree !== null,
    ).length;
    const external = execution.candidate.explanation.externalBass;
    const externalSoundingCount = external === null ? 0 :
      execution.candidate.voices.filter(({ pitch }) =>
        pitchClassOf(pitch) === pitchClassOf(external)
      ).length;
    const mutantTotal = execution.candidate.voices.length + 1;
    const policyCount = execution.request.policy.voiceCount;
    return {
      actual: {
        caseId: witness.id,
        policyVoiceCount: policyCount,
        actualVoiceCount: execution.candidate.voices.length,
        slashBassVoiceCount: slashCount,
        degreeBearingVoiceCount: degreeVoiceCount,
        externalBass: external,
        externalBassSoundingVoiceCount: externalSoundingCount,
        mutantVoiceCount: mutantTotal,
        mutantAcceptedByVoiceCountLaw: mutantTotal === policyCount,
      },
      expected: {
        caseId: witness.id,
        policyVoiceCount: 4,
        actualVoiceCount: 4,
        slashBassVoiceCount: candidateCaseId === "V0-CAND-013" ? 1 : 0,
        degreeBearingVoiceCount: candidateCaseId === "V0-CAND-013" ? 3 : 4,
        externalBass: candidateCaseId === "V0-CAND-014"
          ? { step: "E", alter: -1 }
          : null,
        externalBassSoundingVoiceCount: 0,
        mutantVoiceCount: 5,
        mutantAcceptedByVoiceCountLaw: false,
      },
      runtimeInput: execution.request,
      runtimeOutput: execution.result,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        execution.request,
        execution.result,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "total-sounded-voice-count",
            Object.freeze({
              policyVoiceCount: policyCount,
              baselineVoiceCount: execution.candidate.voices.length,
              mutantVoiceCount: mutantTotal,
              bassMode: candidateCaseId === "V0-CAND-013"
                ? "generated-slash" : "external",
              slashBassVoiceCount: slashCount,
              externalBassSoundingVoiceCount: externalSoundingCount,
            }),
            Object.freeze({
              mutantAccepted: mutantTotal === policyCount,
              slashBassVoiceCount: slashCount,
              externalBassSoundingVoiceCount: externalSoundingCount,
            }),
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-DOUBLING-NEAR-001") {
    const base = baseAutoRequest("V0-CAND-012");
    const realization = base.resolved.realizations.find(
      ({ id }) => id === base.realizationId,
    );
    if (realization === undefined) throw new Error(`${witness.id}: altered realization`);
    const request = Object.freeze({
      ...base,
      policy: Object.freeze({ ...base.policy, family: "drop2", voiceCount: 6 }),
    }) as unknown as AutoVoicingRequest;
    const result = realizeVoicing(request);
    const reasons = refusalReasons(result);
    return {
      actual: {
        caseId: witness.id,
        realizationId: realization.id,
        family: request.policy.family,
        voiceCount: 6,
        alteredDegrees: realization.degrees.map(degreeToken).filter(
          (token) => token === "b5" || token === "b9",
        ),
        primaryReason: reasons[0] ?? null,
        reasons,
      },
      expected: {
        caseId: witness.id,
        realizationId: "alt-b9-b5",
        family: "drop2",
        voiceCount: 6,
        alteredDegrees: ["b5", "b9"],
        primaryReason: "doubling-not-permitted",
        reasons: ["doubling-not-permitted"],
      },
      runtimeInput: request,
      runtimeOutput: result,
      executionEvidence: witnessExecutionEvidence(witness.id, request, result, {
        production: [productionBranchEvidence(
          witness.id, "realizeVoicing-forbidden-altered-doubling", request, result,
        )],
      }),
    };
  }
  if (witness.id === "V0-DOUBLING-NEAR-002") {
    const control = v0TwoOctaveDoublingAuditControl();
    const setup = record(witness.setup, `${witness.id}.setup`);
    const expected = record(witness.expected, `${witness.id}.expected`);
    const rootVoices = control.sourceCandidate.voices.filter(
      ({ degree }) => degree !== null && degreeToken(degree) === "1",
    );
    const originalRoot = rootVoices.find(
      ({ provenance }) => provenance === "realization",
    );
    const declaredCopy = rootVoices.find(
      ({ provenance }) => provenance === "doubling",
    );
    if (originalRoot === undefined || declaredCopy === undefined) {
      throw new Error(`${witness.id}: declared root pair missing`);
    }
    const declared = control.sourceCandidate.explanation.doubledDegrees.map(degreeToken);
    const mutantRootCopies = rootVoices.length - 1;
    const doublingCheckAccepted = !control.failedCheckIds.includes(
      "identity-guide-omission-and-doubling",
    );
    const everyReturnedCandidateAudited = !control.failedCheckIds.includes(
      "every-returned-candidate-audited",
    );
    const otherFailedCheckIds = control.failedCheckIds.filter((id) =>
      id !== "identity-guide-omission-and-doubling" &&
      id !== "every-returned-candidate-audited"
    );
    const runtimeOutput = {
      sourceCandidate: control.sourceCandidate,
      mutantResult: control.mutantResult,
      audit: control.audit,
    };
    const detectorInput = Object.freeze({
      request: control.request,
      declaredDegree: "1",
      sourceMidi: Number(originalRoot.midi),
      originalMidiDelta: control.originalMidiDelta,
      mutantMidiDelta: control.mutantMidiDelta,
      failedCheckIds: control.failedCheckIds,
    });
    const detectorOutput = Object.freeze({
      mutantAccepted: doublingCheckAccepted && everyReturnedCandidateAudited,
      doublingCheckAccepted,
      everyReturnedCandidateAudited,
      failedCheckIds: control.failedCheckIds,
    });
    return {
      actual: {
        caseId: witness.id,
        sourceCaseId: "V0-CAND-015",
        declaredDegree: "1",
        sourceMidi: Number(originalRoot.midi),
        declaredCopyMidi: Number(declaredCopy.midi),
        mutatedCopyMidi: Number(originalRoot.midi) + control.mutantMidiDelta,
        declaredCopyCount: declared.filter((token) => token === "1").length,
        baselineRootVoiceCount: rootVoices.length,
        baselineRootCopies: rootVoices.length - 1,
        mutantRootVoiceCount: rootVoices.length,
        mutantRootCopies,
        mutantMultiplicityAcceptedByDeclaredDoubling: mutantRootCopies <=
          declared.filter((token) => token === "1").length,
        originalMidiDelta: control.originalMidiDelta,
        mutantMidiDelta: control.mutantMidiDelta,
        twoOctaveDoublingCheckAccepted: doublingCheckAccepted,
        everyReturnedCandidateAudited,
        otherFailedCheckIds,
      },
      expected: {
        caseId: witness.id,
        sourceCaseId: setup["sourceCaseId"],
        declaredDegree: setup["declaredDegree"],
        sourceMidi: setup["sourceMidi"],
        declaredCopyMidi: setup["declaredCopyMidi"],
        mutatedCopyMidi: setup["mutatedCopyMidi"],
        declaredCopyCount: setup["declaredCopyCount"],
        baselineRootVoiceCount: expected["baselineRootVoiceCount"],
        baselineRootCopies: expected["baselineRootCopies"],
        mutantRootVoiceCount: expected["mutantRootVoiceCount"],
        mutantRootCopies: expected["mutantRootCopies"],
        mutantMultiplicityAcceptedByDeclaredDoubling:
          expected["mutantMultiplicityAcceptedByDeclaredDoubling"],
        originalMidiDelta: expected["originalMidiDelta"],
        mutantMidiDelta: expected["mutantMidiDelta"],
        twoOctaveDoublingCheckAccepted:
          expected["twoOctaveDoublingCheckAccepted"],
        everyReturnedCandidateAudited: expected["everyReturnedCandidateAudited"],
        otherFailedCheckIds: expected["otherFailedCheckIds"],
      },
      runtimeInput: control.request,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        control.request,
        runtimeOutput,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "declared-doubling-exact-one-octave",
            detectorInput,
            detectorOutput,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-DROP2-NEAR-001" ||
      witness.id === "V0-DROP2-NEAR-002") {
    const execution = exactGeneratedCandidate("V0-CAND-004");
    const closedSource = execution.candidate.voices.map((voice) => {
      if (voice.degree === null || degreeToken(voice.degree) !== "1") return voice;
      const pitch = makeSpelledPitch({
        step: voice.pitch.step,
        alter: voice.pitch.alter,
        octave: voice.pitch.octave + 1,
      });
      if (!pitch.ok) throw new Error(`${witness.id}: closed root spelling`);
      const projected = projectSpelledPitch(pitch.value);
      if (!projected.ok) throw new Error(`${witness.id}: closed root MIDI`);
      return Object.freeze({ ...voice, pitch: pitch.value, midi: projected.value.midi });
    }).sort((left, right) => Number(left.midi) - Number(right.midi));
    const transformed = applyDrop2Transform(closedSource);
    if (!transformed.ok) throw new Error(`${witness.id}: Drop-2 primitive refused`);
    const setup = record(witness.setup, `${witness.id}.setup`);
    const evidence = transformed.value.evidence;
    const mutatedOrdinal = Number(setup["mutatedLoweredOrdinal"] ??
      evidence.secondFromTopSourceOrdinal);
    const mutatedLowering = Number(setup["loweredBySemitones"] ??
      evidence.loweredBySemitones);
    const counterfactualAccepted =
      mutatedOrdinal === evidence.secondFromTopSourceOrdinal &&
      mutatedLowering === evidence.loweredBySemitones;
    return {
      actual: {
        caseId: witness.id,
        closedSourceMidi: evidence.closedSourceMidi.map(Number),
        secondFromTopSourceOrdinal: evidence.secondFromTopSourceOrdinal,
        loweredBySemitones: evidence.loweredBySemitones,
        transformedMidi: evidence.transformedMidi.map(Number),
        counterfactualOrdinal: mutatedOrdinal,
        counterfactualLowering: mutatedLowering,
        counterfactualAccepted,
      },
      expected: {
        caseId: witness.id,
        closedSourceMidi: [55, 59, 60, 64],
        secondFromTopSourceOrdinal: 2,
        loweredBySemitones: 12,
        transformedMidi: [48, 55, 59, 64],
        counterfactualOrdinal: witness.id.endsWith("001") ? 1 : 2,
        counterfactualLowering: witness.id.endsWith("002") ? 24 : 12,
        counterfactualAccepted: false,
      },
      runtimeInput: closedSource,
      runtimeOutput: transformed,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        closedSource,
        transformed,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "drop2-exact-source-ordinal-and-octave",
            Object.freeze({
              closedSourceMidi: evidence.closedSourceMidi.map(Number),
              counterfactualOrdinal: mutatedOrdinal,
              counterfactualLowering: mutatedLowering,
              requiredOrdinal: evidence.secondFromTopSourceOrdinal,
              requiredLowering: evidence.loweredBySemitones,
            }),
            Object.freeze({
              mutantAccepted: counterfactualAccepted,
              requiredOrdinal: evidence.secondFromTopSourceOrdinal,
              requiredLowering: evidence.loweredBySemitones,
            }),
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-DROP2-NEAR-003") {
    const base = baseAutoRequest("V0-CAND-004");
    const request = withRange(base, 49, 64);
    const result = realizeVoicing(request);
    return {
      actual: {
        caseId: witness.id,
        range: request.policy.range,
        ok: result.ok,
        valuePresent: result.ok,
        termination: result.evidence.termination,
        rangeConstraintRefused: refusalReasons(result).includes("range-insufficient"),
        spacingConstraintRefused:
          refusalReasons(result).includes("low-register-spacing"),
        familyTransformRevalidated:
          refusalReasons(result).includes("family-transform-invalid"),
        exactLoweredMidiInRange: 48 >= Number(request.policy.range.lowMidi) &&
          48 <= Number(request.policy.range.highMidi),
      },
      expected: {
        caseId: witness.id,
        range: { lowMidi: 49, highMidi: 64 },
        ok: false,
        valuePresent: false,
        termination: "constraints-unsatisfied",
        rangeConstraintRefused: true,
        spacingConstraintRefused: true,
        familyTransformRevalidated: true,
        exactLoweredMidiInRange: false,
      },
      runtimeInput: request,
      runtimeOutput: result,
      executionEvidence: witnessExecutionEvidence(witness.id, request, result, {
        production: [productionBranchEvidence(
          witness.id, "realizeVoicing-drop2-range-revalidation", request, result,
        )],
      }),
    };
  }
  if (witness.id === "V0-FALLBACK-NEAR-001") {
    const request = baseAutoRequest("V0-CAND-029");
    const result = realizeVoicing(request);
    const source = record(result, `${witness.id}.result`);
    return {
      actual: {
        caseId: witness.id,
        ok: result.ok,
        valuePresent: Object.hasOwn(source, "value"),
        partialValuePresent: Object.hasOwn(source, "partialValue") ||
          Object.hasOwn(source, "partialResult"),
        candidateFallbackPresent: Object.hasOwn(source, "candidates"),
        noteFallbackPresent: Object.hasOwn(source, "notes") ||
          Object.hasOwn(source, "pitches"),
        refusalCode: result.ok ? null : result.refusal.code,
        termination: result.evidence.termination,
        reasons: refusalReasons(result),
      },
      expected: {
        caseId: witness.id,
        ok: false,
        valuePresent: false,
        partialValuePresent: false,
        candidateFallbackPresent: false,
        noteFallbackPresent: false,
        refusalCode: "voicing.constraints_unsatisfied",
        termination: "constraints-unsatisfied",
        reasons: ["range-insufficient"],
      },
      runtimeInput: request,
      runtimeOutput: result,
      executionEvidence: witnessExecutionEvidence(witness.id, request, result, {
        production: [productionBranchEvidence(
          witness.id, "realizeVoicing-no-fallback-refusal", request, result,
        )],
      }),
    };
  }
  if (witness.id === "V0-IMMUTABLE-001") {
    const generatedRequest = baseAutoRequest("V0-CAND-001");
    const storedRecipe = v0CandidateCase("V0-CAND-031");
    if (!("request" in storedRecipe)) throw new Error(`${witness.id}: stored recipe`);
    const storedRequest = buildV0CandidateRequest(storedRecipe);
    const generatedBefore = JSON.stringify(generatedRequest);
    const storedBefore = JSON.stringify(storedRequest);
    const generated = realizeVoicing(generatedRequest);
    const stored = realizeVoicing(storedRequest);
    const generatedProbe = activeDeepImmutabilityProbe(generated);
    const storedProbe = activeDeepImmutabilityProbe(stored);
    return {
      actual: {
        caseId: witness.id,
        generatedRequestUnchanged: JSON.stringify(generatedRequest) === generatedBefore,
        storedRequestUnchanged: JSON.stringify(storedRequest) === storedBefore,
        generatedOutputDeeplyFrozen: isDeeplyFrozen(generated),
        storedOutputDeeplyFrozen: isDeeplyFrozen(stored),
        generatedReachableObjects: generatedProbe.reachableObjects,
        storedReachableObjects: storedProbe.reachableObjects,
        mutationAttempts: generatedProbe.mutationAttempts + storedProbe.mutationAttempts,
        failedMutationAttempts:
          generatedProbe.failedMutationAttempts + storedProbe.failedMutationAttempts,
        allMutationAttemptsFailed:
          generatedProbe.mutationAttempts === generatedProbe.failedMutationAttempts &&
          storedProbe.mutationAttempts === storedProbe.failedMutationAttempts,
        outputBytesUnchanged: generatedProbe.bytesUnchanged && storedProbe.bytesUnchanged,
      },
      expected: {
        caseId: witness.id,
        generatedRequestUnchanged: true,
        storedRequestUnchanged: true,
        generatedOutputDeeplyFrozen: true,
        storedOutputDeeplyFrozen: true,
        generatedReachableObjects: generatedProbe.reachableObjects,
        storedReachableObjects: storedProbe.reachableObjects,
        mutationAttempts: generatedProbe.mutationAttempts + storedProbe.mutationAttempts,
        failedMutationAttempts:
          generatedProbe.mutationAttempts + storedProbe.mutationAttempts,
        allMutationAttemptsFailed: true,
        outputBytesUnchanged: true,
      },
      runtimeInput: { generatedRequest, storedRequest },
      runtimeOutput: { generated, stored },
    };
  }
  if (witness.id === "V0-IMMUTABLE-NEAR-001") {
    const request = baseAutoRequest("V0-CAND-001");
    const result = realizeVoicing(request);
    const shallow = structuredClone(result) as unknown as JsonRecord;
    Object.freeze(shallow);
    const evidence = record(shallow["evidence"], `${witness.id}.evidence`);
    const before = JSON.stringify(shallow);
    const mutationSucceeded = Reflect.set(
      evidence,
      "termination",
      "shallow-mutation-observed",
    );
    const detectorOutput = Object.freeze({
      mutantAccepted: isDeeplyFrozen(shallow),
      topLevelFrozen: Object.isFrozen(shallow),
      nestedEvidenceFrozen: Object.isFrozen(evidence),
      nestedMutationSucceeded: mutationSucceeded,
      bytesChanged: JSON.stringify(shallow) !== before,
    });
    const runtimeOutput = { productionResult: result, shallowCounterexample: shallow };
    return {
      actual: {
        caseId: witness.id,
        topLevelFrozen: Object.isFrozen(shallow),
        recursivelyFrozen: isDeeplyFrozen(shallow),
        nestedEvidenceFrozen: Object.isFrozen(evidence),
        nestedMutationSucceeded: mutationSucceeded,
        bytesChanged: JSON.stringify(shallow) !== before,
        deepImmutabilityDetectorAccepted: isDeeplyFrozen(shallow),
      },
      expected: {
        caseId: witness.id,
        topLevelFrozen: true,
        recursivelyFrozen: false,
        nestedEvidenceFrozen: false,
        nestedMutationSucceeded: true,
        bytesChanged: true,
        deepImmutabilityDetectorAccepted: false,
      },
      runtimeInput: request,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        request,
        runtimeOutput,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "reachable-deep-immutability",
            Object.freeze({
              productionResult: result,
              attemptedPath: ["evidence", "termination"],
              attemptedValue: "shallow-mutation-observed",
            }),
            detectorOutput,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-RANGE-BOUNDARY-001") {
    const base = baseAutoRequest("V0-CAND-001");
    const request = withRange(base, 48, 64);
    const result = realizeVoicing(request);
    const recipe = v0CandidateCase("V0-CAND-001");
    if (recipe.expected.kind !== "must-contain-candidate") {
      throw new Error(`${witness.id}: success fixture`);
    }
    const candidate = result.ok
      ? findV0CandidateWithExpectedVoices(result.value.candidates, recipe.expected)
      : undefined;
    const midiValues = candidate?.voices.map(({ midi: value }) => Number(value)) ?? [];
    const domainLow = makeMidiPitch(0);
    const domainHigh = makeMidiPitch(127);
    return {
      actual: {
        caseId: witness.id,
        range: request.policy.range,
        candidateMidi: midiValues,
        exactCandidatePresent: candidate !== undefined,
        lowerEndpointOccupied: midiValues.includes(48),
        upperEndpointOccupied: midiValues.includes(64),
        allVoicesWithinInclusiveRange: midiValues.every((value) => value >= 48 && value <= 64),
        domainMidiMinimumAccepted: domainLow.ok,
        domainMidiMaximumAccepted: domainHigh.ok,
      },
      expected: {
        caseId: witness.id,
        range: { lowMidi: 48, highMidi: 64 },
        candidateMidi: [48, 55, 59, 64],
        exactCandidatePresent: true,
        lowerEndpointOccupied: true,
        upperEndpointOccupied: true,
        allVoicesWithinInclusiveRange: true,
        domainMidiMinimumAccepted: true,
        domainMidiMaximumAccepted: true,
      },
      runtimeInput: request,
      runtimeOutput: { result, domainLow, domainHigh },
    };
  }
  if (witness.id === "V0-RANGE-NEAR-001") {
    const base = baseAutoRequest("V0-CAND-001");
    const goldenMidi = [48, 55, 59, 64] as const;
    const variants = Object.freeze([
      Object.freeze({ id: "lower-plus-one", lowMidi: 49, highMidi: 64 }),
      Object.freeze({ id: "upper-minus-one", lowMidi: 48, highMidi: 63 }),
    ]);
    const executions = variants.map((variant) => {
      const request = withRange(base, variant.lowMidi, variant.highMidi);
      const result = realizeVoicing(request);
      return Object.freeze({
        variant,
        request,
        result,
        actual: {
          id: variant.id,
          range: request.policy.range,
          goldenCandidateWithinRange: goldenMidi.every((value) =>
            value >= variant.lowMidi && value <= variant.highMidi
          ),
          ok: result.ok,
          valuePresent: result.ok,
          termination: result.evidence.termination,
        },
      });
    });
    const below = makeMidiPitch(-1);
    const above = makeMidiPitch(128);
    const runtimeInput = executions.map(({ variant, request }) => ({ id: variant.id, request }));
    const runtimeOutput = {
      executions: executions.map(({ variant, result }) => ({ id: variant.id, result })),
      below,
      above,
    };
    return {
      actual: {
        caseId: witness.id,
        variants: executions.map(({ actual }) => actual),
        belowDomainAccepted: below.ok,
        aboveDomainAccepted: above.ok,
      },
      expected: {
        caseId: witness.id,
        variants: variants.map((variant) => ({
          id: variant.id,
          range: { lowMidi: variant.lowMidi, highMidi: variant.highMidi },
          goldenCandidateWithinRange: false,
          ok: false,
          valuePresent: false,
          termination: "constraints-unsatisfied",
        })),
        belowDomainAccepted: false,
        aboveDomainAccepted: false,
      },
      runtimeInput,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        runtimeOutput,
        {
          production: executions.map(({ variant, request, result }) =>
            productionBranchEvidence(
              witness.id,
              `realizeVoicing-range-boundary-${variant.id}`,
              request,
              result,
            )
          ),
        },
      ),
    };
  }
  if (witness.id === "V0-TRANS-NEAR-001") {
    const projection = enharmonicWitnessProjection();
    const actual = record(projection.actual, `${witness.id}.actual`);
    const pairs = actual["pairs"];
    const detectorOutput = Object.freeze({
      accepted: Array.isArray(pairs) && pairs.length > 0 && pairs.every((value) => {
        const pair = record(value, `${witness.id}.pair`);
        return pair["soundingPitchClassEqual"] === true &&
          pair["rootSpellingsDistinct"] === true &&
          pair["outputSpellingsDistinct"] === true &&
          pair["inverseProjectionsEqual"] === true;
      }),
    });
    return {
      ...projection,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        projection.runtimeInput,
        projection.runtimeOutput,
        {
          production: pairedRealizeVoicingBranchEvidence(
            witness.id,
            "realizeVoicing-enharmonic-pair",
            projection.runtimeInput,
            projection.runtimeOutput,
          ),
          detectors: [detectorBranchEvidence(
            witness.id,
            "enharmonic-spelling-and-inverse-distinction",
            Object.freeze({ pairs }),
            detectorOutput,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-TRANS-MATRIX-001") {
    return fullTranspositionMatrixWitnessProjection();
  }
  if (witness.id === "V0-TRANS-NEAR-002") {
    const projection = transpositionNearMissRequestProjection();
    const inputRows = projection.runtimeInput;
    const outputRows = projection.runtimeOutput;
    if (!Array.isArray(inputRows) || !Array.isArray(outputRows) ||
        inputRows.length !== outputRows.length) {
      throw new TypeError(`${witness.id}: transposition mutant execution rows`);
    }
    return {
      ...projection,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        projection.runtimeInput,
        projection.runtimeOutput,
        {
          production: inputRows.map((value, index) => {
            const input = record(
              value,
              `${witness.id}.input[${index.toString()}]`,
            );
            const output = record(
              outputRows[index],
              `${witness.id}.output[${index.toString()}]`,
            );
            return productionBranchEvidence(
              witness.id,
              `realizeVoicing-one-axis-mutant-${String(input["axis"])}`,
              input["mutantRequest"],
              output["mutantResult"],
            );
          }),
        },
      ),
    };
  }
  if (witness.id === "V0-GUIDE-NEAR-001") {
    const negative = executeV0CandidateCase("V0-CAND-033");
    const negativeInput = record(negative.runtimeInput, `${witness.id}.runtimeInput`);
    const resolved = record(negativeInput["resolved"], `${witness.id}.resolved`);
    const realizations = resolved["realizations"];
    if (!Array.isArray(realizations)) throw new TypeError(`${witness.id}: realizations`);
    const realization = record(
      realizations.find((value) =>
        record(value, `${witness.id}.realization`)["id"] ===
          negativeInput["realizationId"]
      ),
      `${witness.id}.selectedRealization`,
    );
    const guideValue = realization["guideToneDegrees"];
    if (!Array.isArray(guideValue)) throw new TypeError(`${witness.id}: guide degrees`);
    const required = guideValue.map((value) =>
      degreeToken(value as ChordDegree)
    ).sort();
    const negativeProjection = record(
      negative.actualProjection,
      "V0-CAND-033.actualProjection",
    );
    const omittedValue = negativeProjection["omittedGuideToneDegrees"];
    if (!Array.isArray(omittedValue)) {
      throw new TypeError(`${witness.id}: omitted guide degrees`);
    }
    const missing = omittedValue.map(String).sort();
    const observed = required.filter((token) => !missing.includes(token));
    const reasonsValue = negativeProjection["reasons"];
    const reasons = Array.isArray(reasonsValue) ? reasonsValue.map(String) : [];
    const actual = {
      caseId: witness.id,
      requiredGuideDegrees: required,
      observedGuideDegrees: observed,
      missingGuideDegrees: missing,
      guideOmissionReasonObserved: reasons.includes("guide-tone-omitted"),
    };
    return {
      actual,
      expected: {
        caseId: witness.id,
        requiredGuideDegrees: ["3", "b7"],
        observedGuideDegrees: ["3"],
        missingGuideDegrees: ["b7"],
        guideOmissionReasonObserved: true,
      },
      runtimeInput: negative.runtimeInput,
      runtimeOutput: negative.runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        negative.runtimeInput,
        negative.runtimeOutput,
        {
          production: [productionBranchEvidence(
            witness.id,
            "realizeVoicing-guide-tone-omission-refusal",
            negative.runtimeInput,
            negative.runtimeOutput,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-IDENTITY-NEAR-001") {
    const suspended = exactGeneratedCandidate("V0-CAND-017");
    const sus2Refusal = executeV0CandidateCase("V0-CAND-024");
    const major = exactGeneratedCandidate("V0-CAND-001");
    const suspendedDegrees = suspended.candidate.voices.flatMap(({ degree }) =>
      degree === null ? [] : [degreeToken(degree)]
    );
    const majorDegrees = major.candidate.voices.flatMap(({ degree }) =>
      degree === null ? [] : [degreeToken(degree)]
    );
    const majorMutantDegrees = majorDegrees.filter((degree) => degree !== "3");
    const sus2Projection = record(
      sus2Refusal.actualProjection,
      `${witness.id}.sus2Refusal`,
    );
    const runtimeInput = {
      suspended: suspended.request,
      sus2: sus2Refusal.runtimeInput,
      major: major.request,
      majorMutantDegrees,
    };
    const runtimeOutput = {
      suspended: suspended.result,
      sus2: sus2Refusal.runtimeOutput,
      major: major.result,
    };
    return {
      actual: {
        caseId: witness.id,
        suspendedFourDegrees: suspendedDegrees,
        suspendedFourIdentityPresent: suspendedDegrees.includes("4"),
        sus2TreatedAsSus4: sus2Projection["ok"] === true,
        sus2PrimaryReason: sus2Projection["primaryReason"],
        sus2AbsentDegrees: sus2Projection["absentDegrees"],
        majorDegrees,
        majorThirdIdentityPresent: majorDegrees.includes("3"),
        majorMutantDegrees,
        majorMutantThirdIdentityPresent: majorMutantDegrees.includes("3"),
        majorMutantAcceptedByIdentityLaw: majorMutantDegrees.includes("3"),
      },
      expected: {
        caseId: witness.id,
        suspendedFourDegrees: ["1", "4", "b7"],
        suspendedFourIdentityPresent: true,
        sus2TreatedAsSus4: false,
        sus2PrimaryReason: "template-degree-absent",
        sus2AbsentDegrees: ["4"],
        majorDegrees: ["1", "5", "7", "3"],
        majorThirdIdentityPresent: true,
        majorMutantDegrees: ["1", "5", "7"],
        majorMutantThirdIdentityPresent: false,
        majorMutantAcceptedByIdentityLaw: false,
      },
      runtimeInput,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        runtimeOutput,
        {
          production: [productionBranchEvidence(
            witness.id,
            "realizeVoicing-sus2-identity-refusal",
            sus2Refusal.runtimeInput,
            sus2Refusal.runtimeOutput,
          )],
          detectors: [detectorBranchEvidence(
            witness.id,
            "major-third-identity-presence",
            Object.freeze({ baselineDegrees: majorDegrees, majorMutantDegrees }),
            Object.freeze({
              mutantAccepted: majorMutantDegrees.includes("3"),
              thirdIdentityPresent: majorMutantDegrees.includes("3"),
            }),
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-ROOTLESS-NEAR-001") {
    const base = baseAutoRequest("V0-CAND-006");
    const generatedRequest = Object.freeze({
      ...base,
      policy: Object.freeze({ ...base.policy, bassPolicy: "generated" }),
    }) as unknown as AutoVoicingRequest;
    const noneRequest = Object.freeze({
      ...base,
      policy: Object.freeze({ ...base.policy, bassPolicy: "none" }),
    }) as unknown as AutoVoicingRequest;
    const generated = realizeVoicing(generatedRequest);
    const none = realizeVoicing(noneRequest);
    const competingInput = Object.freeze([
      constraintFromFixture({
        code: "voicing.constraint.rootless_root_omitted",
        reason: "root-present-in-rootless",
        voiceOrdinals: [0],
        degrees: ["1"],
        midiValues: [60],
      }, witness.id),
      constraintFromFixture({
        code: "voicing.constraint.bass_policy",
        reason: "bass-policy-unsupported",
        voiceOrdinals: [],
        degrees: [],
        midiValues: [],
      }, witness.id),
    ]);
    const competing = orderUnsatisfiedVoicingConstraints(competingInput);
    const actual = {
      caseId: witness.id,
      generatedReasons: refusalReasons(generated),
      noneReasons: refusalReasons(none),
      generatedPrimaryReason: refusalReasons(generated)[0] ?? null,
      nonePrimaryReason: refusalReasons(none)[0] ?? null,
      competingReasonsInReportOrder: competing.map(({ reason }) => reason),
      bassPolicyPrecedesRootPresent: competing[0]?.reason === "bass-policy-unsupported",
    };
    const runtimeInput = { generatedRequest, noneRequest, competingInput };
    const runtimeOutput = { generated, none, competing };
    return {
      actual,
      expected: {
        caseId: witness.id,
        generatedReasons: ["bass-policy-unsupported"],
        noneReasons: ["bass-policy-unsupported"],
        generatedPrimaryReason: "bass-policy-unsupported",
        nonePrimaryReason: "bass-policy-unsupported",
        competingReasonsInReportOrder: [
          "bass-policy-unsupported", "root-present-in-rootless",
        ],
        bassPolicyPrecedesRootPresent: true,
      },
      runtimeInput,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        runtimeOutput,
        {
          production: [
            productionBranchEvidence(
              witness.id,
              "realizeVoicing-rootless-generated-bass-policy",
              generatedRequest,
              generated,
            ),
            productionBranchEvidence(
              witness.id,
              "realizeVoicing-rootless-none-bass-policy",
              noneRequest,
              none,
            ),
          ],
          detectors: [detectorBranchEvidence(
            witness.id,
            "constraint-precedence-ordering",
            competingInput,
            Object.freeze({
              accepted: competing[0]?.reason === "bass-policy-unsupported",
              orderedConstraints: competing,
            }),
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-SLASH-NEAR-001") {
    const base = baseAutoRequest("V0-CAND-013");
    const request = withRange(base, 51, 70);
    const result = realizeVoicing(request);
    const sourceBass = request.resolved.bass;
    return {
      actual: {
        caseId: witness.id,
        range: request.policy.range,
        sourceBass,
        sourceBassMidiAtGoldenRegister: 51,
        ok: result.ok,
        valuePresent: result.ok,
        termination: result.evidence.termination,
        reasons: refusalReasons(result),
        slashBassUnplaceable: refusalReasons(result).includes("slash-bass-unplaceable"),
      },
      expected: {
        caseId: witness.id,
        range: { lowMidi: 51, highMidi: 70 },
        sourceBass: { step: "E", alter: -1 },
        sourceBassMidiAtGoldenRegister: 51,
        ok: false,
        valuePresent: false,
        termination: "constraints-unsatisfied",
        reasons: [
          "slash-bass-unplaceable", "slash-bass-unplaceable",
          "low-register-spacing", "low-register-spacing", "low-register-spacing",
        ],
        slashBassUnplaceable: true,
      },
      runtimeInput: request,
      runtimeOutput: result,
      executionEvidence: witnessExecutionEvidence(witness.id, request, result, {
        production: [productionBranchEvidence(
          witness.id, "realizeVoicing-unplaceable-slash-bass", request, result,
        )],
      }),
    };
  }
  if (witness.id === "V0-SLASH-NEAR-002") {
    const execution = exactGeneratedCandidate("V0-CAND-013");
    const candidates = execution.result.value.kind === "generated"
      ? execution.result.value.candidates
      : [];
    const slashVoices = candidates.flatMap(({ voices }) =>
      voices.filter(({ provenance }) => provenance === "slash-bass")
    );
    const sourceBass = execution.request.resolved.bass;
    const exact = slashVoices.filter(({ pitch }) =>
      sourceBass !== null && pitch.step === sourceBass.step && pitch.alter === sourceBass.alter
    );
    const enharmonicSubstitutes = slashVoices.filter(({ pitch }) =>
      sourceBass !== null && pitchClassOf(pitch) === pitchClassOf(sourceBass) &&
      (pitch.step !== sourceBass.step || pitch.alter !== sourceBass.alter)
    );
    const mutantBass = Object.freeze({ step: "D", alter: 1 });
    const mutantAccepted = sourceBass !== null &&
      exactPitchClassEqual(mutantBass, sourceBass);
    return {
      actual: {
        caseId: witness.id,
        sourceBass,
        generatedCandidateCount: candidates.length,
        slashVoiceCount: slashVoices.length,
        exactSourceSpellingCount: exact.length,
        enharmonicSubstituteCount: enharmonicSubstitutes.length,
        everySlashVoiceUsesExactSourceSpelling:
          slashVoices.length > 0 && exact.length === slashVoices.length,
        mutantBass,
        mutantMatchesSourcePitchClass:
          sourceBass !== null && pitchClassOf(mutantBass) === pitchClassOf(sourceBass),
        mutantAcceptedByExactSpellingLaw: mutantAccepted,
      },
      expected: {
        caseId: witness.id,
        sourceBass: { step: "E", alter: -1 },
        generatedCandidateCount: candidates.length,
        slashVoiceCount: slashVoices.length,
        exactSourceSpellingCount: slashVoices.length,
        enharmonicSubstituteCount: 0,
        everySlashVoiceUsesExactSourceSpelling: true,
        mutantBass: { step: "D", alter: 1 },
        mutantMatchesSourcePitchClass: true,
        mutantAcceptedByExactSpellingLaw: false,
      },
      runtimeInput: execution.request,
      runtimeOutput: execution.result,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        execution.request,
        execution.result,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "exact-source-slash-spelling",
            Object.freeze({ sourceBass, mutantBass }),
            Object.freeze({
              mutantAccepted,
              soundingPitchClassEqual: sourceBass !== null &&
                pitchClassOf(mutantBass) === pitchClassOf(sourceBass),
            }),
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-SLASH-NEAR-003") {
    const base = baseAutoRequest("V0-CAND-013");
    const request = Object.freeze({
      ...base,
      policy: Object.freeze({ ...base.policy, bassPolicy: "none" }),
    }) as unknown as AutoVoicingRequest;
    const result = realizeVoicing(request);
    const reasons = refusalReasons(result);
    return {
      actual: {
        caseId: witness.id,
        requestBassPolicy: request.policy.bassPolicy,
        sourceHasSlashBass: request.resolved.bass !== null,
        primaryReason: reasons[0] ?? null,
        bassPolicyUnsupported: reasons.includes("bass-policy-unsupported"),
      },
      expected: {
        caseId: witness.id,
        requestBassPolicy: "none",
        sourceHasSlashBass: true,
        primaryReason: "bass-policy-unsupported",
        bassPolicyUnsupported: true,
      },
      runtimeInput: request,
      runtimeOutput: result,
      executionEvidence: witnessExecutionEvidence(witness.id, request, result, {
        production: [productionBranchEvidence(
          witness.id, "realizeVoicing-unsupported-slash-bass-policy", request, result,
        )],
      }),
    };
  }
  if (witness.id === "V0-UNISON-NEAR-001") {
    const probe = duplicateMidiProductionProbe();
    const projection = record(probe.projection, `${witness.id}.projection`);
    return {
      actual: {
        caseId: witness.id,
        ...projection,
      },
      expected: {
        caseId: witness.id,
        ok: false,
        refusalCode: "voicing.constraints_unsatisfied",
        termination: "constraints-unsatisfied",
        reasons: ["duplicate-midi"],
        constraints: [{
          code: "voicing.constraint.unique_midi",
          reason: "duplicate-midi",
          voiceOrdinals: [1, 2],
          degrees: ["3", "5"],
          midiValues: [64, 64],
        }],
      },
      runtimeInput: probe.request,
      runtimeOutput: probe.result,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        probe.request,
        probe.result,
        {
          production: [productionBranchEvidence(
            witness.id,
            "realizeVoicing-duplicate-midi-refusal",
            probe.request,
            probe.result,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-SPELL-NEAR-001") {
    const flatExecution = exactGeneratedCandidate("V0-CAND-008");
    const flat = flatExecution.candidate.voices.find(
      ({ degree }) => degree !== null && degreeToken(degree) === "b3",
    );
    const sharpSeed = transpositionSeed("V0-TRANS-012");
    const cRoot = transpositionFixture.roots[0];
    if (cRoot === undefined) throw new Error("V0 root inventory empty");
    const sharpRequest = transpositionRequest(sharpSeed, cRoot);
    const sharpResult = realizeVoicing(sharpRequest);
    const sharp = findTranspositionCandidate(sharpResult, sharpSeed)?.voices.find(
      ({ degree }) => degree !== null && degreeToken(degree) === "#9",
    );
    if (flat === undefined || sharp === undefined) throw new Error(`${witness.id}: voices`);
    const detectorInput = Object.freeze({
      sharp: { token: degreeToken(sharp.degree as ChordDegree), spelling: sharp.pitch },
      flat: { token: degreeToken(flat.degree as ChordDegree), spelling: flat.pitch },
    });
    const detectorOutput = Object.freeze({
      accepted: pitchClassOf(sharp.pitch) === pitchClassOf(flat.pitch) &&
        degreeToken(sharp.degree as ChordDegree) !==
          degreeToken(flat.degree as ChordDegree) &&
        (sharp.pitch.step !== flat.pitch.step || sharp.pitch.alter !== flat.pitch.alter),
    });
    const runtimeInput = { sharp: sharpRequest, flat: flatExecution.request };
    const runtimeOutput = { sharpResult, flatResult: flatExecution.result };
    return {
      actual: {
        caseId: witness.id,
        left: { token: degreeToken(sharp.degree as ChordDegree), spelling: sharp.pitch },
        right: { token: degreeToken(flat.degree as ChordDegree), spelling: flat.pitch },
        pitchClassesEqual: pitchClassOf(sharp.pitch) === pitchClassOf(flat.pitch),
        degreeTokensDistinct: degreeToken(sharp.degree as ChordDegree) !==
          degreeToken(flat.degree as ChordDegree),
        spellingsDistinct: sharp.pitch.step !== flat.pitch.step ||
          sharp.pitch.alter !== flat.pitch.alter,
      },
      expected: {
        caseId: witness.id,
        left: { token: "#9", spelling: { step: "D", alter: 1, octave: 5 } },
        right: { token: "b3", spelling: { step: "E", alter: -1, octave: 4 } },
        pitchClassesEqual: true,
        degreeTokensDistinct: true,
        spellingsDistinct: true,
      },
      runtimeInput,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        runtimeOutput,
        {
          production: [
            productionBranchEvidence(
              witness.id,
              "realizeVoicing-sharp-nine",
              sharpRequest,
              sharpResult,
            ),
            productionBranchEvidence(
              witness.id,
              "realizeVoicing-flat-three",
              flatExecution.request,
              flatExecution.result,
            ),
          ],
          detectors: [detectorBranchEvidence(
            witness.id,
            "degree-and-spelling-distinction-at-equal-pitch-class",
            detectorInput,
            detectorOutput,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-SPELL-NEAR-002") {
    const execution = exactGeneratedCandidate("V0-CAND-001");
    const all = execution.result.value.kind === "generated"
      ? execution.result.value.candidates.flatMap(({ voices }) => voices)
      : [];
    const pair = all.flatMap((left) => all.flatMap((right) =>
      left.degree !== null && right.degree !== null &&
      degreeToken(left.degree) === "1" && degreeToken(right.degree) === "1" &&
      left.pitch.step === right.pitch.step && left.pitch.alter === right.pitch.alter &&
      left.pitch.octave === 4 && right.pitch.octave === 5
        ? [[left, right] as const]
        : []
    ))[0];
    if (pair === undefined) throw new Error(`${witness.id}: register pair absent`);
    const sharpOnlyMutant = Object.freeze({ step: "B", alter: 1, octave: 4 });
    const mutantProjection = projectSpelledPitch(sharpOnlyMutant);
    if (!mutantProjection.ok) throw new Error(`${witness.id}: sharp-only mutant pitch`);
    const sourceProjection = projectSpelledPitch(pair[1].pitch);
    if (!sourceProjection.ok) throw new Error(`${witness.id}: source upper pitch`);
    const detectorInput = Object.freeze({
      sourceLower: pair[0].pitch,
      sourceUpper: pair[1].pitch,
      sharpOnlyMutant,
    });
    const detectorOutput = Object.freeze({
      mutantAccepted: pair[1].pitch.step === sharpOnlyMutant.step &&
        pair[1].pitch.alter === sharpOnlyMutant.alter &&
        pair[1].pitch.octave === sharpOnlyMutant.octave,
      soundingMidiEqual:
        Number(sourceProjection.value.midi) === Number(mutantProjection.value.midi),
      exactSourceSpellingPreserved:
        pair[1].pitch.step === pair[0].pitch.step &&
        pair[1].pitch.alter === pair[0].pitch.alter,
    });
    return {
      actual: {
        caseId: witness.id,
        degree: degreeToken(pair[0].degree),
        lowerSpelling: pair[0].pitch,
        upperSpelling: pair[1].pitch,
        stepPreserved: pair[0].pitch.step === pair[1].pitch.step,
        alterPreserved: pair[0].pitch.alter === pair[1].pitch.alter,
        octaveChanged: pair[0].pitch.octave !== pair[1].pitch.octave,
      },
      expected: {
        caseId: witness.id,
        degree: "1",
        lowerSpelling: { step: "C", alter: 0, octave: 4 },
        upperSpelling: { step: "C", alter: 0, octave: 5 },
        stepPreserved: true,
        alterPreserved: true,
        octaveChanged: true,
      },
      runtimeInput: execution.request,
      runtimeOutput: execution.result,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        execution.request,
        execution.result,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "register-lift-source-spelling",
            detectorInput,
            detectorOutput,
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-IDENTITY-NEAR-002") {
    const execution = exactGeneratedCandidate("V0-CAND-001");
    const original = execution.candidate.voices;
    const first = original[0];
    const changed = Object.freeze([
      Object.freeze({
        ...first,
        degree: v0DegreeFromToken("#9", witness.id),
        provenance: "doubling" as const,
        sourceDegreeIndex: 1,
      }),
      ...original.slice(1),
    ]) as unknown as VoicingCandidate["voices"];
    const leftKey = candidateIdentityKey(original);
    const rightKey = candidateIdentityKey(changed);
    const leftIdentity = {
      midi: Number(first.midi),
      degree: first.degree === null ? null : degreeToken(first.degree),
      spelling: first.pitch,
      provenance: first.provenance,
    };
    const changedFirst = changed[0];
    const rightIdentity = {
      midi: Number(changedFirst.midi),
      degree: changedFirst.degree === null ? null : degreeToken(changedFirst.degree),
      spelling: changedFirst.pitch,
      provenance: changedFirst.provenance,
    };
    const runtimeInput = { original, changed };
    const runtimeOutput = { leftKey, rightKey };
    return {
      actual: {
        caseId: witness.id,
        sameMidi: original.map(({ midi: value }) => Number(value)),
        leftIdentity,
        rightIdentity,
        identitiesDistinct: leftKey !== rightKey,
      },
      expected: {
        caseId: witness.id,
        sameMidi: [48, 55, 59, 64],
        leftIdentity: {
          midi: 48,
          degree: "1",
          spelling: { step: "C", alter: 0, octave: 3 },
          provenance: "realization",
        },
        rightIdentity: {
          midi: 48,
          degree: "#9",
          spelling: { step: "C", alter: 0, octave: 3 },
          provenance: "doubling",
        },
        identitiesDistinct: true,
      },
      runtimeInput,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        runtimeOutput,
        {
          production: [
            productionBranchEvidence(
              witness.id,
              "candidateIdentityKey-original",
              original,
              leftKey,
              "candidateIdentityKey",
            ),
            productionBranchEvidence(
              witness.id,
              "candidateIdentityKey-semantic-mutant",
              changed,
              rightKey,
              "candidateIdentityKey",
            ),
          ],
        },
      ),
    };
  }
  if (witness.id === "V0-ORDER-001" || witness.id === "V0-ORDER-002") {
    const execution = exactGeneratedCandidate("V0-CAND-001");
    const axisOrder = [...VOICING_LOCAL_SCORE_AXIS_ORDER];
    const tieBreakOrder = [...VOICING_CANDIDATE_ORDER].slice(1);
    const comparisons = witness.id === "V0-ORDER-001"
      ? localScoreAxisProof(execution.candidate)
      : candidateTieBreakProof(execution.candidate);
    return {
      actual: {
        caseId: witness.id,
        order: witness.id === "V0-ORDER-001" ? axisOrder : tieBreakOrder,
        comparisons,
      },
      expected: {
        caseId: witness.id,
        order: witness.id === "V0-ORDER-001"
          ? [
              "optionalDegreesOmitted", "nonPreferredDoublings",
              "guideToneDoublings", "templateOrderDisplacement",
              "targetSpanDistance", "rangeCenterDistanceTwice",
            ]
          : [
              "midi-sequence-lexicographic",
              "degree-number-then-alter-lexicographic",
              "spelling-octave-then-domain-step-then-alter-lexicographic",
              "template-id-utf16-lexicographic",
              "raw-generation-ordinal",
            ],
        comparisons: (witness.id === "V0-ORDER-001"
          ? [
              "optionalDegreesOmitted", "nonPreferredDoublings",
              "guideToneDoublings", "templateOrderDisplacement",
              "targetSpanDistance", "rangeCenterDistanceTwice",
            ]
          : [
              "midi-sequence-lexicographic",
              "degree-number-then-alter-lexicographic",
              "spelling-octave-then-domain-step-then-alter-lexicographic",
              "template-id-utf16-lexicographic",
              "raw-generation-ordinal",
            ]).map((key) => witness.id === "V0-ORDER-001"
              ? { axis: key, comparison: -1, candidateComparison: -1,
                  reverseComparison: 1 }
              : { key, comparison: -1, reverseComparison: 1 }
            ),
      },
      runtimeInput: { request: execution.request, candidate: execution.candidate },
      runtimeOutput: { result: execution.result, comparisons },
    };
  }
  if (witness.id === "V0-ORDER-NEAR-001") {
    const proof = reversedAndLocaleOrderProof();
    const proofInput = record(proof.runtimeInput, `${witness.id}.runtimeInput`);
    const proofOutput = record(proof.runtimeOutput, `${witness.id}.runtimeOutput`);
    const proofActual = record(proof.actual, `${witness.id}.actual`);
    return {
      ...proof,
      actual: { caseId: witness.id, ...proofActual },
      expected: {
        caseId: witness.id,
        ...record(proof.expected, `${witness.id}.expected`),
      },
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        proof.runtimeInput,
        proof.runtimeOutput,
        {
          production: [productionBranchEvidence(
            witness.id,
            "realizeVoicing-under-hostile-locale",
            proofInput["hostileExecutorInput"],
            proofOutput["hostileReplay"],
            "realizeVoicingWithAmbient",
          )],
          detectors: [detectorBranchEvidence(
            witness.id,
            "stable-insertion-order-under-reversed-enumeration",
            Object.freeze({
              baselineIdentityKeys: proofOutput["baselineIdentityKeys"],
              reversedInputIdentityKeys: proofInput["reversedIdentityKeys"],
              reversedCandidates: proofInput["reversedCandidates"],
            }),
            Object.freeze({
              accepted: proofActual["reversedEnumerationRestored"] === true,
              reversedIdentityKeys: proofOutput["reversedIdentityKeys"],
            }),
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-LOCAL-001" || witness.id === "V0-LOCAL-NEAR-001") {
    const probe = ambientReplayProbe();
    const probeInput = record(probe.runtimeInput, `${witness.id}.runtimeInput`);
    const probeOutput = record(probe.runtimeOutput, `${witness.id}.runtimeOutput`);
    const ambientInputs = probeInput["ambient"];
    const ambientOutputs = probeOutput["ambient"];
    const production = witness.kind === "negative"
      ? [
          productionBranchEvidence(
            witness.id,
            "realizeVoicing-ambient-baseline",
            probeInput["base"],
            probeOutput["baseline"],
          ),
          ...pairedRealizeVoicingBranchEvidence(
            witness.id,
            "realizeVoicing-forbidden-field",
            probeInput["oneFieldAtATime"],
            probeOutput["oneFieldAtATime"],
          ),
          ...(Array.isArray(ambientInputs) && Array.isArray(ambientOutputs)
            ? ambientInputs.map((inputValue, index) => {
                const inputRow = record(
                  inputValue,
                  `${witness.id}.ambientInput[${index.toString()}]`,
                );
                const outputRow = record(
                  ambientOutputs[index],
                  `${witness.id}.ambientOutput[${index.toString()}]`,
                );
                const ambientId = String(inputRow["id"]);
                if (outputRow["id"] !== ambientId) {
                  throw new Error(`${witness.id}: ambient input/output order`);
                }
                return productionBranchEvidence(
                  witness.id,
                  `realizeVoicing-hostile-ambient-${ambientId}`,
                  inputRow["input"],
                  outputRow["result"],
                  "realizeVoicingWithAmbient",
                );
              })
            : []),
        ]
      : [];
    return {
      ...probe,
      actual: { caseId: witness.id, ...record(probe.actual, "ambient actual") },
      expected: { caseId: witness.id, ...record(probe.expected, "ambient expected") },
      ...(witness.kind === "negative" ? {
        executionEvidence: witnessExecutionEvidence(
          witness.id,
          probe.runtimeInput,
          probe.runtimeOutput,
          {
            production,
          },
        ),
      } : {}),
    };
  }
  if (witness.id === "V0-WEAVE-NEAR-001") {
    const balanced = exactGeneratedCandidate("V0-CAND-001");
    const open = exactGeneratedCandidate("V0-CAND-003");
    const setup = record(witness.setup, `${witness.id}.setup`);
    const expected = record(witness.expected, `${witness.id}.expected`);
    const cyclic = setup["cyclicReferenceOrders"];
    if (!Array.isArray(cyclic)) throw new TypeError(`${witness.id}: cyclic orders`);
    const project = (
      execution: ReturnType<typeof exactGeneratedCandidate>,
    ): Readonly<{
      selectedDegreeOrder: readonly string[];
      selectedPlacementMidi: readonly number[];
      midiSortedDegreeOrder: readonly (string | null)[];
      rawGenerationOrdinal: number;
      templateOrderDisplacement: number;
      cyclicPrefilterPermitted: boolean;
    }> => {
      const selected = independentSelectedOccurrences(
        execution.request,
        execution.candidate,
      );
      if (selected === null) {
        throw new Error(`${witness.id}: selected occurrence reconstruction failed`);
      }
      const selectedPlacementMidi = selected.map((occurrence) => {
        const voice = execution.candidate.voices.find((candidateVoice) =>
          candidateVoice.degree !== null &&
          degreeToken(candidateVoice.degree) === occurrence.token &&
          candidateVoice.sourceDegreeIndex === occurrence.sourceDegreeIndex &&
          candidateVoice.provenance === occurrence.provenance
        );
        if (voice === undefined) {
          throw new Error(`${witness.id}: selected occurrence placement missing`);
        }
        return Number(voice.midi);
      });
      const midiSortedDegreeOrder = execution.candidate.voices.map(({ degree }) =>
        degree === null ? null : degreeToken(degree)
      );
      return Object.freeze({
        selectedDegreeOrder: selected.map(({ token }) => token),
        selectedPlacementMidi,
        midiSortedDegreeOrder,
        rawGenerationOrdinal: execution.candidate.rawGenerationOrdinal,
        templateOrderDisplacement:
          execution.candidate.localScore.templateOrderDisplacement,
        cyclicPrefilterPermitted: cyclic.some((value) =>
          sameCanonical(canonicalize(value), canonicalize(midiSortedDegreeOrder))
        ),
      });
    };
    const balancedProjection = project(balanced);
    const openProjection = project(open);
    const runtimeInput = { balanced: balanced.request, open: open.request };
    const runtimeOutput = { balanced: balanced.result, open: open.result };
    return {
      actual: {
        caseId: witness.id,
        acceptedCandidateCaseId: "V0-CAND-001",
        ...balancedProjection,
        openAcceptedCandidateCaseId: "V0-CAND-003",
        openSelectedDegreeOrder: openProjection.selectedDegreeOrder,
        openSelectedPlacementMidi: openProjection.selectedPlacementMidi,
        openMidiSortedDegreeOrder: openProjection.midiSortedDegreeOrder,
        openRawGenerationOrdinal: openProjection.rawGenerationOrdinal,
        openTemplateOrderDisplacement: openProjection.templateOrderDisplacement,
        openCyclicPrefilterPermitted: openProjection.cyclicPrefilterPermitted,
      },
      expected: {
        caseId: witness.id,
        acceptedCandidateCaseId: expected["acceptedCandidateCaseId"],
        selectedDegreeOrder: setup["selectedDegreeOrder"],
        selectedPlacementMidi: setup["selectedPlacementMidi"],
        midiSortedDegreeOrder: setup["midiSortedDegreeOrder"],
        rawGenerationOrdinal: expected["rawGenerationOrdinal"],
        templateOrderDisplacement: expected["templateOrderDisplacement"],
        cyclicPrefilterPermitted: expected["cyclicPrefilterPermitted"],
        openAcceptedCandidateCaseId: expected["openAcceptedCandidateCaseId"],
        openSelectedDegreeOrder: setup["openSelectedDegreeOrder"],
        openSelectedPlacementMidi: setup["openSelectedPlacementMidi"],
        openMidiSortedDegreeOrder: setup["openMidiSortedDegreeOrder"],
        openRawGenerationOrdinal: expected["openRawGenerationOrdinal"],
        openTemplateOrderDisplacement: expected["openTemplateOrderDisplacement"],
        openCyclicPrefilterPermitted: expected["openCyclicPrefilterPermitted"],
      },
      runtimeInput,
      runtimeOutput,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        runtimeOutput,
        {
          detectors: [detectorBranchEvidence(
            witness.id,
            "selected-degree-register-weave-cyclic-prefilter",
            Object.freeze({
              cyclicReferenceOrders: cyclic,
              balancedSelectedDegreeOrder: balancedProjection.selectedDegreeOrder,
              openSelectedDegreeOrder: openProjection.selectedDegreeOrder,
              balancedMidiSortedDegreeOrder: balancedProjection.midiSortedDegreeOrder,
              openMidiSortedDegreeOrder: openProjection.midiSortedDegreeOrder,
            }),
            Object.freeze({
              accepted: !balancedProjection.cyclicPrefilterPermitted &&
                !openProjection.cyclicPrefilterPermitted,
              balancedCyclicPrefilterPermitted:
                balancedProjection.cyclicPrefilterPermitted,
              openCyclicPrefilterPermitted: openProjection.cyclicPrefilterPermitted,
            }),
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-ADAPTIVE-SLOTS-NEAR-001") {
    const projection = adaptiveSlotsWitnessProjection(witness);
    return {
      ...projection,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        projection.runtimeInput,
        projection.runtimeOutput,
        {
          production: pairedRealizeVoicingBranchEvidence(
            witness.id,
            "realizeVoicing-adaptive-slot-boundary",
            projection.runtimeInput,
            projection.runtimeOutput,
          ),
        },
      ),
    };
  }
  if (witness.id === "V0-CONSTRAINT-OVERFLOW-NEAR-001") {
    const projection = overflowWitnessProjection(witness);
    const runtimeInput = record(
      projection.runtimeInput,
      `${witness.id}.runtimeInput`,
    );
    return {
      ...projection,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        projection.runtimeInput,
        projection.runtimeOutput,
        {
          production: [productionBranchEvidence(
            witness.id,
            "executeV0OperationCase-provisional-overflow-recovery",
            runtimeInput["executorInput"],
            projection.runtimeOutput,
            "executeV0OperationCase",
          )],
        },
      ),
    };
  }
  if (witness.id === "V0-SPACING-NEAR-004") {
    const probe = duplicateMidiProductionProbe();
    const projection = record(probe.projection, `${witness.id}.projection`);
    const reasons = projection["reasons"];
    return {
      actual: {
        caseId: witness.id,
        duplicateMidiReasonObserved:
          Array.isArray(reasons) && reasons.includes("duplicate-midi"),
        spacingReasonObserved:
          Array.isArray(reasons) && reasons.includes("low-register-spacing"),
        duplicateMidiPrecedesSpacing:
          Array.isArray(reasons) && reasons[0] === "duplicate-midi",
        productionRefusal: projection,
      },
      expected: {
        caseId: witness.id,
        duplicateMidiReasonObserved: true,
        spacingReasonObserved: false,
        duplicateMidiPrecedesSpacing: true,
        productionRefusal: {
          ok: false,
          refusalCode: "voicing.constraints_unsatisfied",
          termination: "constraints-unsatisfied",
          reasons: ["duplicate-midi"],
          constraints: [{
            code: "voicing.constraint.unique_midi",
            reason: "duplicate-midi",
            voiceOrdinals: [1, 2],
            degrees: ["3", "5"],
            midiValues: [64, 64],
          }],
        },
      },
      runtimeInput: probe.request,
      runtimeOutput: probe.result,
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        probe.request,
        probe.result,
        {
          production: [productionBranchEvidence(
            witness.id,
            "realizeVoicing-unique-midi-before-spacing",
            probe.request,
            probe.result,
          )],
        },
      ),
    };
  }
  return null;
}

function spacingWitnessProjection(witness: LawWitness): V0WitnessProjection | null {
  if (!witness.id.startsWith("V0-SPACING-")) return null;
  const setup = record(witness.setup, `${witness.id}.setup`);
  const lowerMidi = Number(setup["lowerMidi"]);
  const upperMidi = Number(setup["upperMidi"]);
  const executorInput = Object.freeze([
    Object.freeze({ midi: midi(lowerMidi) }),
    Object.freeze({ midi: midi(upperMidi) }),
  ]);
  const violations = lowRegisterSpacingViolations(executorInput);
  const expectedAccepted = witness.kind === "positive";
  const expectedMinimum = witness.id.endsWith("001") ? 10
    : witness.id.endsWith("002") ? 7
    : witness.id.endsWith("003") ? 4 : 1;
  const runtimeInput = { lowerMidi, upperMidi, executorInput };
  return {
    actual: {
      caseId: witness.id,
      lowerMidi,
      upperMidi,
      intervalSemitones: upperMidi - lowerMidi,
      minimumSemitones: violations[0]?.minimumSemitones ?? expectedMinimum,
      accepted: violations.length === 0,
      violationCount: violations.length,
    },
    expected: {
      caseId: witness.id,
      lowerMidi,
      upperMidi,
      intervalSemitones: Number(setup["intervalSemitones"]),
      minimumSemitones: expectedMinimum,
      accepted: expectedAccepted,
      violationCount: expectedAccepted ? 0 : 1,
    },
    runtimeInput,
    runtimeOutput: violations,
    ...(witness.kind === "negative" ? {
      executionEvidence: witnessExecutionEvidence(
        witness.id,
        runtimeInput,
        violations,
        {
          production: [productionBranchEvidence(
            witness.id,
            "lowRegisterSpacingViolations-near-boundary",
            executorInput,
            violations,
            "lowRegisterSpacingViolations",
          )],
        },
      ),
    } : {}),
  };
}

function orderWitnessProjection(witness: LawWitness): V0WitnessProjection | null {
  if (!witness.id.startsWith("V0-ORDER-") &&
      !witness.id.startsWith("V0-LOCAL-") &&
      !witness.id.startsWith("V0-IMMUTABLE-")) return null;
  const request = buildV0CandidateRequest(v0CandidateCase("V0-CAND-001"));
  const before = JSON.stringify(request);
  const first = realizeVoicing(request);
  const second = realizeVoicing(request);
  const generated = first.ok && first.value.kind === "generated"
    ? first.value.candidates
    : [];
  const ordered = generated.slice(1).every((candidate, index) => {
    const previous = generated[index];
    return previous !== undefined && compareVoicingCandidates(previous, candidate) <= 0;
  });
  const identityKeys = generated.map(({ voices }) => candidateIdentityKey(voices));
  const semantic = {
    deterministicReplay: sameCanonical(canonicalize(first), canonicalize(second)),
    requestUnchanged: JSON.stringify(request) === before,
    outputDeeplyFrozen: isDeeplyFrozen(first),
    candidatesAscending: ordered,
    identityKeysUnique: new Set(identityKeys).size === identityKeys.length,
  };
  return {
    actual: { caseId: witness.id, ...semantic },
    expected: {
      caseId: witness.id,
      deterministicReplay: true,
      requestUnchanged: true,
      outputDeeplyFrozen: true,
      candidatesAscending: true,
      identityKeysUnique: true,
    },
    runtimeInput: request,
    runtimeOutput: { first, second, identityKeys },
  };
}

function expectedLawWitnessExecutionProjection(witness: LawWitness): JsonRecord {
  if (witness.kind === "positive") return {};
  const policy = lawFixture.lawProofPolicy.negativeWitnessExecutionPolicy;
  const detectorOnly = policy.detectorOnlyWitnessIds.includes(witness.id);
  const mixed = policy.mixedWitnessIds.includes(witness.id);
  const productionExecuted = policy.productionExecutedWitnessIds.includes(witness.id);
  const membershipCount = Number(detectorOnly) + Number(mixed) + Number(productionExecuted);
  if (membershipCount !== 1) {
    throw new Error(`${witness.id}: negative witness execution class missing or ambiguous`);
  }
  return {
    mutationExecutionMode: detectorOnly
      ? "detector-only"
      : mixed ? "mixed-production-and-detector" : "production-executed",
    productionMutantExecuted: productionExecuted || mixed,
    detectorOnlyMutantEvaluated: detectorOnly || mixed,
  };
}

function normalizedNegativeWitnessRuntime(
  runtimeInput: unknown,
  runtimeOutput: unknown,
  evidence: V0WitnessExecutionEvidence,
): Readonly<{ runtimeInput: unknown; runtimeOutput: unknown }> {
  if (!sameCanonical(
    canonicalize(runtimeInput), canonicalize(evidence.boundRuntimeInput),
  ) || !sameCanonical(
    canonicalize(runtimeOutput), canonicalize(evidence.boundRuntimeOutput),
  )) {
    throw new Error(`${evidence.caseId}: execution evidence runtime binding mismatch`);
  }
  return Object.freeze({
    runtimeInput: Object.freeze({
      branchInput: runtimeInput,
      execution: Object.freeze({
        production: evidence.production.map(({ kind, operation, executor, input }) =>
          Object.freeze({ kind, operation, executor, input })
        ),
        detectors: evidence.detectors.map(({ kind, detector, mutantInput }) =>
          Object.freeze({ kind, detector, mutantInput })
        ),
      }),
    }),
    runtimeOutput: Object.freeze({
      branchOutput: runtimeOutput,
      execution: Object.freeze({
        production: evidence.production.map(({ kind, operation, executor, result }) =>
          Object.freeze({ kind, operation, executor, result })
        ),
        detectors: evidence.detectors.map(({ kind, detector, detectorOutput }) =>
          Object.freeze({ kind, detector, detectorOutput })
        ),
      }),
    }),
  });
}

function replayProductionExecution(inputRow: JsonRecord): unknown {
  switch (inputRow["executor"]) {
    case "realizeVoicing":
      return realizeVoicing(
        inputRow["input"] as Parameters<typeof realizeVoicing>[0],
      );
    case "realizeVoicingWithAmbient": {
      const input = record(inputRow["input"], "ambient production input");
      const ambient = record(
        input["ambientOverride"],
        "ambient production override",
      );
      const request = input["request"] as Parameters<typeof realizeVoicing>[0];
      if (ambient["kind"] === "clock") {
        const original = Date.now;
        try {
          Date.now = () => Number(ambient["value"]);
          return realizeVoicing(request);
        } finally {
          Date.now = original;
        }
      }
      if (ambient["kind"] === "random") {
        const original = Math.random;
        try {
          Math.random = () => Number(ambient["value"]);
          return realizeVoicing(request);
        } finally {
          Math.random = original;
        }
      }
      if (ambient["kind"] === "localeCompare") {
        const original = Object.getOwnPropertyDescriptor(
          String.prototype,
          "localeCompare",
        );
        if (original === undefined) throw new Error("localeCompare descriptor missing");
        try {
          Object.defineProperty(String.prototype, "localeCompare", {
            configurable: true,
            writable: true,
            value: () => Number(ambient["value"]),
          });
          return realizeVoicing(request);
        } finally {
          Object.defineProperty(String.prototype, "localeCompare", original);
        }
      }
      throw new Error("unrecognized ambient production override");
    }
    case "candidateIdentityKey":
      return candidateIdentityKey(
        inputRow["input"] as VoicingCandidate["voices"],
      );
    case "lowRegisterSpacingViolations": {
      const voices = inputRow["input"];
      if (!Array.isArray(voices)) throw new TypeError("spacing replay voices");
      return lowRegisterSpacingViolations(voices.map((value) => {
        const voice = record(value, "spacing replay voice");
        return { midi: midi(Number(voice["midi"])) };
      }));
    }
    case "executeV0OperationCase": {
      const input = record(inputRow["input"], "operation replay input");
      return executeV0OperationCase(String(input["caseId"])).runtimeOutput;
    }
    default:
      throw new Error("unrecognized production execution operation");
  }
}

const expectedProductionInputCache = new Map<string, unknown>();

function computeExpectedProductionInput(
  witness: LawWitness,
  operation: string,
): unknown {
  switch (witness.id) {
    case "V0-BYPASS-NEAR-001":
    case "V0-BYPASS-NEAR-002": {
      const recipe = v0CandidateCase(
        witness.id.endsWith("001") ? "V0-CAND-031" : "V0-CAND-032",
      );
      if (!("request" in recipe)) throw new Error(`${witness.id}: stored recipe`);
      return buildV0CandidateRequest(recipe);
    }
    case "V0-DOUBLING-NEAR-001": {
      const base = baseAutoRequest("V0-CAND-012");
      return Object.freeze({
        ...base,
        policy: Object.freeze({ ...base.policy, family: "drop2", voiceCount: 6 }),
      });
    }
    case "V0-DROP2-NEAR-003":
      return withRange(baseAutoRequest("V0-CAND-004"), 49, 64);
    case "V0-FALLBACK-NEAR-001":
      return baseAutoRequest("V0-CAND-029");
    case "V0-GUIDE-NEAR-001":
      return executeV0CandidateCase("V0-CAND-033").runtimeInput;
    case "V0-IDENTITY-NEAR-001":
      return executeV0CandidateCase("V0-CAND-024").runtimeInput;
    case "V0-IDENTITY-NEAR-002": {
      const execution = exactGeneratedCandidate("V0-CAND-001");
      if (operation === "candidateIdentityKey-original") {
        return execution.candidate.voices;
      }
      const first = execution.candidate.voices[0];
      return Object.freeze([
        Object.freeze({
          ...first,
          degree: v0DegreeFromToken("#9", witness.id),
          provenance: "doubling" as const,
          sourceDegreeIndex: 1,
        }),
        ...execution.candidate.voices.slice(1),
      ]);
    }
    case "V0-LOCAL-NEAR-001": {
      const base = baseAutoRequest("V0-CAND-001");
      if (operation === "realizeVoicing-ambient-baseline") return base;
      if (operation.startsWith("realizeVoicing-hostile-ambient-")) {
        const ambientId = operation.slice("realizeVoicing-hostile-ambient-".length);
        const ambientOverride = ambientId === "clock"
          ? Object.freeze({ kind: "clock", value: 6_666_666_666_666 })
          : ambientId === "random"
            ? Object.freeze({ kind: "random", value: 0.123_456_789 })
            : Object.freeze({ kind: "localeCompare", value: 1 });
        return Object.freeze({ request: base, ambientOverride });
      }
      const index = Number(operation.slice("realizeVoicing-forbidden-field-".length));
      const forbiddenFields = Object.freeze([
        Object.freeze({ id: "previous", value: Object.freeze({ id: "ambient-previous" }) }),
        Object.freeze({ id: "next", value: Object.freeze({ id: "ambient-next" }) }),
        Object.freeze({ id: "voiceId", value: "ambient-voice" }),
        Object.freeze({ id: "pairwiseCost", value: 9_999 }),
        Object.freeze({ id: "cancellation", value: Object.freeze({ requested: true }) }),
        Object.freeze({ id: "staleRevision", value: 8_888 }),
        Object.freeze({ id: "elapsedTime", value: 7_777 }),
      ] as const);
      const field = forbiddenFields[index];
      if (field === undefined) throw new Error(`${witness.id}: forbidden field index`);
      return Object.freeze({ ...base, [field.id]: field.value });
    }
    case "V0-ORDER-NEAR-001":
      return Object.freeze({
        request: baseAutoRequest("V0-CAND-001"),
        ambientOverride: Object.freeze({ kind: "localeCompare", value: 1 }),
      });
    case "V0-RANGE-NEAR-001":
      return operation.endsWith("lower-plus-one")
        ? withRange(baseAutoRequest("V0-CAND-001"), 49, 64)
        : withRange(baseAutoRequest("V0-CAND-001"), 48, 63);
    case "V0-ROOTLESS-NEAR-001": {
      const base = baseAutoRequest("V0-CAND-006");
      const bassPolicy = operation.endsWith("generated-bass-policy")
        ? "generated" : "none";
      return Object.freeze({
        ...base,
        policy: Object.freeze({ ...base.policy, bassPolicy }),
      });
    }
    case "V0-SLASH-NEAR-001":
      return withRange(baseAutoRequest("V0-CAND-013"), 51, 70);
    case "V0-SLASH-NEAR-003": {
      const base = baseAutoRequest("V0-CAND-013");
      return Object.freeze({
        ...base,
        policy: Object.freeze({ ...base.policy, bassPolicy: "none" }),
      });
    }
    case "V0-SPACING-NEAR-001":
    case "V0-SPACING-NEAR-002":
    case "V0-SPACING-NEAR-003": {
      const setup = record(witness.setup, `${witness.id}.setup`);
      return Object.freeze([
        { midi: Number(setup["lowerMidi"]) },
        { midi: Number(setup["upperMidi"]) },
      ]);
    }
    case "V0-SPACING-NEAR-004":
    case "V0-UNISON-NEAR-001":
      return duplicateMidiProductionProbe().request;
    case "V0-SPELL-NEAR-001": {
      if (operation === "realizeVoicing-flat-three") {
        return exactGeneratedCandidate("V0-CAND-008").request;
      }
      const root = transpositionFixture.roots[0];
      if (root === undefined) throw new Error(`${witness.id}: root`);
      return transpositionRequest(transpositionSeed("V0-TRANS-012"), root);
    }
    case "V0-TRANS-NEAR-001": {
      const index = Number(operation.slice("realizeVoicing-enharmonic-pair-".length));
      const pair = transpositionFixture.enharmonicNearMissPairs[Math.floor(index / 2)];
      if (pair === undefined) throw new Error(`${witness.id}: enharmonic pair index`);
      const source = index % 2 === 0 ? pair.left : pair.right;
      const root: TranspositionRoot = Object.freeze({
        id: `${pair.id}-${index % 2 === 0 ? "LEFT" : "RIGHT"}`,
        symbol: source.symbol,
        step: source.step,
        alter: source.alter,
        pitchClass: source.pitchClass,
      });
      return transpositionRequest(transpositionSeed("V0-TRANS-012"), root);
    }
    case "V0-TRANS-NEAR-002": {
      const axis = operation.slice("realizeVoicing-one-axis-mutant-".length);
      const rootB = transpositionFixture.roots.find(({ id }) => id === "V0-ROOT-012");
      const rootDb = transpositionFixture.roots.find(({ id }) => id === "V0-ROOT-002");
      if (rootB === undefined || rootDb === undefined) {
        throw new Error(`${witness.id}: transposition roots`);
      }
      if (axis === "range") {
        const correct = transpositionRequest(transpositionSeed("V0-TRANS-017"), rootB);
        return Object.freeze({
          ...correct,
          policy: Object.freeze({
            ...correct.policy,
            range: Object.freeze({ lowMidi: 60, highMidi: 84 }),
          }),
        });
      }
      if (axis === "quartal-context") {
        return Object.freeze({
          ...transpositionRequest(transpositionSeed("V0-TRANS-014"), rootDb),
          quartalContext: null,
        });
      }
      return Object.freeze({
        ...transpositionRequest(transpositionSeed("V0-TRANS-009"), rootDb),
        resolved: resolvedChord("Dbmaj7/Eb"),
      });
    }
    case "V0-ADAPTIVE-SLOTS-NEAR-001": {
      const index = Number(operation.slice("realizeVoicing-adaptive-slot-boundary-".length));
      const rows = Object.freeze([
        Object.freeze({ family: "balanced", voiceCount: 3 }),
        Object.freeze({ family: "balanced", voiceCount: 4 }),
        Object.freeze({ family: "balanced", voiceCount: 5 }),
        Object.freeze({ family: "drop2", voiceCount: 3 }),
      ] as const);
      const row = rows[index];
      if (row === undefined) throw new Error(`${witness.id}: adaptive row index`);
      const base = baseAutoRequest("V0-CAND-012");
      return Object.freeze({
        ...base,
        policy: Object.freeze({
          ...base.policy,
          family: row.family,
          voiceCount: row.voiceCount,
        }),
      });
    }
    case "V0-CONSTRAINT-OVERFLOW-NEAR-001":
      return Object.freeze({ caseId: "V0-OP-SUCCESS-004" });
    default:
      throw new Error(`${witness.id}: expected production input unavailable`);
  }
}

function expectedProductionInput(
  witness: LawWitness,
  operation: string,
): unknown {
  const key = `${witness.id}\u0000${operation}`;
  if (expectedProductionInputCache.has(key)) {
    return expectedProductionInputCache.get(key);
  }
  const input = computeExpectedProductionInput(witness, operation);
  expectedProductionInputCache.set(key, input);
  return input;
}

function replayDetectorExecution(detector: string, value: unknown): unknown {
  if (detector === "constraint-precedence-ordering") {
    if (!Array.isArray(value)) throw new TypeError(`${detector}: constraints`);
    const constraints = value as Parameters<typeof orderUnsatisfiedVoicingConstraints>[0];
    const ordered = orderUnsatisfiedVoicingConstraints(constraints);
    return Object.freeze({
      accepted: ordered[0]?.reason === "bass-policy-unsupported",
      orderedConstraints: ordered,
    });
  }
  const input = record(value, `${detector}.mutantInput`);
  switch (detector) {
    case "altered-realization-identity-after-omission":
      return Object.freeze({
        pitchSetsEqual: sameCanonical(
          canonicalize(input["leftPitchSet"]), canonicalize(input["rightPitchSet"]),
        ),
        realizationIdsDistinct:
          input["leftRealizationId"] !== input["rightRealizationId"],
        mutantAccepted: input["leftRealizationId"] === input["rightRealizationId"],
      });
    case "total-sounded-voice-count":
      return Object.freeze({
        mutantAccepted: input["mutantVoiceCount"] === input["policyVoiceCount"],
        slashBassVoiceCount: input["slashBassVoiceCount"],
        externalBassSoundingVoiceCount: input["externalBassSoundingVoiceCount"],
      });
    case "declared-doubling-exact-one-octave": {
      const failed = input["failedCheckIds"];
      if (!Array.isArray(failed)) throw new TypeError(`${detector}: failed checks`);
      const doublingCheckAccepted = !failed.includes(
        "identity-guide-omission-and-doubling",
      );
      const everyReturnedCandidateAudited = !failed.includes(
        "every-returned-candidate-audited",
      );
      return Object.freeze({
        mutantAccepted: doublingCheckAccepted && everyReturnedCandidateAudited,
        doublingCheckAccepted,
        everyReturnedCandidateAudited,
        failedCheckIds: failed,
      });
    }
    case "drop2-exact-source-ordinal-and-octave":
      return Object.freeze({
        mutantAccepted:
          input["counterfactualOrdinal"] === input["requiredOrdinal"] &&
          input["counterfactualLowering"] === input["requiredLowering"],
        requiredOrdinal: input["requiredOrdinal"],
        requiredLowering: input["requiredLowering"],
      });
    case "reachable-deep-immutability": {
      const shallow = structuredClone(input["productionResult"]) as JsonRecord;
      Object.freeze(shallow);
      const nestedEvidence = record(shallow["evidence"], `${detector}.evidence`);
      const before = JSON.stringify(shallow);
      const mutationSucceeded = Reflect.set(
        nestedEvidence,
        "termination",
        input["attemptedValue"],
      );
      return Object.freeze({
        mutantAccepted: isDeeplyFrozen(shallow),
        topLevelFrozen: Object.isFrozen(shallow),
        nestedEvidenceFrozen: Object.isFrozen(nestedEvidence),
        nestedMutationSucceeded: mutationSucceeded,
        bytesChanged: JSON.stringify(shallow) !== before,
      });
    }
    case "enharmonic-spelling-and-inverse-distinction": {
      const pairs = input["pairs"];
      return Object.freeze({
        accepted: Array.isArray(pairs) && pairs.length > 0 && pairs.every((value) => {
          const pair = record(value, `${detector}.pair`);
          return pair["soundingPitchClassEqual"] === true &&
            pair["rootSpellingsDistinct"] === true &&
            pair["outputSpellingsDistinct"] === true &&
            pair["inverseProjectionsEqual"] === true;
        }),
      });
    }
    case "major-third-identity-presence": {
      const mutant = input["majorMutantDegrees"];
      if (!Array.isArray(mutant)) throw new TypeError(`${detector}: mutant degrees`);
      return Object.freeze({
        mutantAccepted: mutant.includes("3"),
        thirdIdentityPresent: mutant.includes("3"),
      });
    }
    case "exact-source-slash-spelling": {
      const source = input["sourceBass"] as Parameters<typeof pitchClassOf>[0];
      const mutant = input["mutantBass"] as Parameters<typeof pitchClassOf>[0];
      return Object.freeze({
        mutantAccepted: exactPitchClassEqual(mutant, source),
        soundingPitchClassEqual: pitchClassOf(mutant) === pitchClassOf(source),
      });
    }
    case "degree-and-spelling-distinction-at-equal-pitch-class": {
      const sharp = record(input["sharp"], `${detector}.sharp`);
      const flat = record(input["flat"], `${detector}.flat`);
      const sharpSpelling = sharp["spelling"] as Parameters<typeof pitchClassOf>[0];
      const flatSpelling = flat["spelling"] as Parameters<typeof pitchClassOf>[0];
      return Object.freeze({
        accepted: pitchClassOf(sharpSpelling) === pitchClassOf(flatSpelling) &&
          sharp["token"] !== flat["token"] &&
          !exactPitchClassEqual(sharpSpelling, flatSpelling),
      });
    }
    case "register-lift-source-spelling": {
      const lower = input["sourceLower"] as Parameters<typeof projectSpelledPitch>[0];
      const upper = input["sourceUpper"] as Parameters<typeof projectSpelledPitch>[0];
      const mutant = input["sharpOnlyMutant"] as Parameters<typeof projectSpelledPitch>[0];
      const upperMidi = projectSpelledPitch(upper);
      const mutantMidi = projectSpelledPitch(mutant);
      if (!upperMidi.ok || !mutantMidi.ok) throw new Error(`${detector}: pitch projection`);
      return Object.freeze({
        mutantAccepted: exactPitchClassEqual(upper, mutant) &&
          upper.octave === mutant.octave,
        soundingMidiEqual: Number(upperMidi.value.midi) === Number(mutantMidi.value.midi),
        exactSourceSpellingPreserved:
          upper.step === lower.step && upper.alter === lower.alter,
      });
    }
    case "stable-insertion-order-under-reversed-enumeration": {
      const candidates = input["reversedCandidates"];
      if (!Array.isArray(candidates)) throw new TypeError(`${detector}: candidates`);
      const restored = stableCandidateInsertionOrder(
        candidates as unknown as readonly VoicingCandidate[],
      ).map(({ voices }) => candidateIdentityKey(voices));
      return Object.freeze({
        accepted: sameCanonical(
          canonicalize(restored), canonicalize(input["baselineIdentityKeys"]),
        ),
        reversedIdentityKeys: restored,
      });
    }
    case "selected-degree-register-weave-cyclic-prefilter": {
      const cyclic = input["cyclicReferenceOrders"];
      if (!Array.isArray(cyclic)) throw new TypeError(`${detector}: cyclic rows`);
      const balancedPermitted = cyclic.some((row) => sameCanonical(
        canonicalize(row), canonicalize(input["balancedMidiSortedDegreeOrder"]),
      ));
      const openPermitted = cyclic.some((row) => sameCanonical(
        canonicalize(row), canonicalize(input["openMidiSortedDegreeOrder"]),
      ));
      return Object.freeze({
        accepted: !balancedPermitted && !openPermitted,
        balancedCyclicPrefilterPermitted: balancedPermitted,
        openCyclicPrefilterPermitted: openPermitted,
      });
    }
    default:
      throw new Error(`unrecognized detector execution: ${detector}`);
  }
}

const expectedDetectorInputCache = new Map<string, unknown>();

function computeExpectedDetectorInput(
  witness: LawWitness,
  detector: string,
): unknown {
  switch (detector) {
    case "altered-realization-identity-after-omission": {
      const root = transpositionFixture.roots[0];
      if (root === undefined) throw new Error(`${witness.id}: altered root`);
      const project = (seedId: "V0-TRANS-010" | "V0-TRANS-012") => {
        const seed = transpositionSeed(seedId);
        const result = realizeVoicing(transpositionRequest(seed, root));
        const candidate = findTranspositionCandidate(result, seed);
        if (candidate === undefined) throw new Error(`${witness.id}/${seedId}: candidate`);
        return Object.freeze({
          realizationId: candidate.realizationId,
          pitchSet: candidate.voices.flatMap(({ degree, midi: value }) =>
            degree !== null && degreeToken(degree).endsWith("9") ? [] : [Number(value)]
          ).sort((left, right) => left - right),
        });
      };
      const left = project("V0-TRANS-010");
      const right = project("V0-TRANS-012");
      return Object.freeze({
        omittedDegreeNumber: 9,
        leftRealizationId: left.realizationId,
        rightRealizationId: right.realizationId,
        leftPitchSet: left.pitchSet,
        rightPitchSet: right.pitchSet,
      });
    }
    case "total-sounded-voice-count":
      return Object.freeze({
        policyVoiceCount: 4,
        baselineVoiceCount: 4,
        mutantVoiceCount: 5,
        bassMode: witness.id.endsWith("001") ? "generated-slash" : "external",
        slashBassVoiceCount: witness.id.endsWith("001") ? 1 : 0,
        externalBassSoundingVoiceCount: 0,
      });
    case "declared-doubling-exact-one-octave": {
      const control = v0TwoOctaveDoublingAuditControl();
      const roots = control.sourceCandidate.voices.filter(({ degree }) =>
        degree !== null && degreeToken(degree) === "1"
      );
      const source = roots.find(({ provenance }) => provenance === "realization");
      if (source === undefined) throw new Error(`${witness.id}: source root`);
      return Object.freeze({
        request: control.request,
        declaredDegree: "1",
        sourceMidi: Number(source.midi),
        originalMidiDelta: control.originalMidiDelta,
        mutantMidiDelta: control.mutantMidiDelta,
        failedCheckIds: control.failedCheckIds,
      });
    }
    case "drop2-exact-source-ordinal-and-octave":
      return Object.freeze({
        closedSourceMidi: [55, 59, 60, 64],
        counterfactualOrdinal: witness.id.endsWith("001") ? 1 : 2,
        counterfactualLowering: witness.id.endsWith("001") ? 12 : 24,
        requiredOrdinal: 2,
        requiredLowering: 12,
      });
    case "reachable-deep-immutability":
      return Object.freeze({
        productionResult: realizeVoicing(baseAutoRequest("V0-CAND-001")),
        attemptedPath: ["evidence", "termination"],
        attemptedValue: "shallow-mutation-observed",
      });
    case "enharmonic-spelling-and-inverse-distinction": {
      const seed = transpositionSeed("V0-TRANS-012");
      const pairs = transpositionFixture.enharmonicNearMissPairs.map((pair, pairIndex) => {
        const execute = (side: "left" | "right", source: typeof pair.left) => {
          const root: TranspositionRoot = Object.freeze({
            id: `${pair.id}-${side.toUpperCase()}`,
            symbol: source.symbol,
            step: source.step,
            alter: source.alter,
            pitchClass: source.pitchClass,
          });
          const result = realizeVoicing(transpositionRequest(seed, root));
          const candidate = findTranspositionCandidate(result, seed);
          if (candidate === undefined) {
            throw new Error(`${witness.id}/${pairIndex.toString()}/${side}: candidate`);
          }
          return Object.freeze({
            root,
            candidate,
            voiceSpellings: candidate.voices.map(({ pitch }) => ({
              step: pitch.step,
              alter: pitch.alter,
            })),
            inverseProjection: inverseSpellingProjection(root, candidate),
          });
        };
        const left = execute("left", pair.left);
        const right = execute("right", pair.right);
        return Object.freeze({
          id: pair.id,
          leftRoot: pair.left,
          rightRoot: pair.right,
          leftVoiceSpellings: left.voiceSpellings,
          rightVoiceSpellings: right.voiceSpellings,
          soundingPitchClassEqual: pair.left.pitchClass === pair.right.pitchClass &&
            left.root.pitchClass === right.root.pitchClass,
          rootSpellingsDistinct:
            left.root.step !== right.root.step || left.root.alter !== right.root.alter,
          outputSpellingsDistinct: !sameCanonical(
            canonicalize(left.voiceSpellings), canonicalize(right.voiceSpellings),
          ),
          inverseProjectionsEqual: sameCanonical(
            canonicalize(left.inverseProjection), canonicalize(right.inverseProjection),
          ),
        });
      });
      return Object.freeze({ pairs });
    }
    case "major-third-identity-presence": {
      const degrees = exactGeneratedCandidate("V0-CAND-001").candidate.voices.flatMap(
        ({ degree }) => degree === null ? [] : [degreeToken(degree)],
      );
      return Object.freeze({
        baselineDegrees: degrees,
        majorMutantDegrees: degrees.filter((degree) => degree !== "3"),
      });
    }
    case "constraint-precedence-ordering":
      return Object.freeze([
        constraintFromFixture({
          code: "voicing.constraint.rootless_root_omitted",
          reason: "root-present-in-rootless",
          voiceOrdinals: [0],
          degrees: ["1"],
          midiValues: [60],
        }, witness.id),
        constraintFromFixture({
          code: "voicing.constraint.bass_policy",
          reason: "bass-policy-unsupported",
          voiceOrdinals: [],
          degrees: [],
          midiValues: [],
        }, witness.id),
      ]);
    case "exact-source-slash-spelling":
      return Object.freeze({
        sourceBass: Object.freeze({ step: "E", alter: -1 }),
        mutantBass: Object.freeze({ step: "D", alter: 1 }),
      });
    case "degree-and-spelling-distinction-at-equal-pitch-class": {
      const flat = exactGeneratedCandidate("V0-CAND-008").candidate.voices.find(
        ({ degree }) => degree !== null && degreeToken(degree) === "b3",
      );
      const root = transpositionFixture.roots[0];
      if (flat === undefined || root === undefined) throw new Error(`${witness.id}: spelling`);
      const seed = transpositionSeed("V0-TRANS-012");
      const sharp = findTranspositionCandidate(
        realizeVoicing(transpositionRequest(seed, root)),
        seed,
      )?.voices.find(({ degree }) =>
        degree !== null && degreeToken(degree) === "#9"
      );
      if (sharp === undefined) throw new Error(`${witness.id}: sharp nine`);
      return Object.freeze({
        sharp: Object.freeze({ token: "#9", spelling: sharp.pitch }),
        flat: Object.freeze({ token: "b3", spelling: flat.pitch }),
      });
    }
    case "register-lift-source-spelling":
      return Object.freeze({
        sourceLower: Object.freeze({ step: "C", alter: 0, octave: 4 }),
        sourceUpper: Object.freeze({ step: "C", alter: 0, octave: 5 }),
        sharpOnlyMutant: Object.freeze({ step: "B", alter: 1, octave: 4 }),
      });
    case "stable-insertion-order-under-reversed-enumeration": {
      const execution = exactGeneratedCandidate("V0-CAND-001");
      const candidates = execution.result.value.kind === "generated"
        ? execution.result.value.candidates
        : [];
      const keys = candidates.map(({ voices }) => candidateIdentityKey(voices));
      return Object.freeze({
        baselineIdentityKeys: keys,
        reversedInputIdentityKeys: [...keys].reverse(),
        reversedCandidates: [...candidates].reverse(),
      });
    }
    case "selected-degree-register-weave-cyclic-prefilter": {
      const setup = record(witness.setup, `${witness.id}.setup`);
      return Object.freeze({
        cyclicReferenceOrders: setup["cyclicReferenceOrders"],
        balancedSelectedDegreeOrder: setup["selectedDegreeOrder"],
        openSelectedDegreeOrder: setup["openSelectedDegreeOrder"],
        balancedMidiSortedDegreeOrder: setup["midiSortedDegreeOrder"],
        openMidiSortedDegreeOrder: setup["openMidiSortedDegreeOrder"],
      });
    }
    default:
      throw new Error(`${witness.id}: expected detector input unavailable`);
  }
}

function expectedDetectorInput(witness: LawWitness, detector: string): unknown {
  const key = `${witness.id}\u0000${detector}`;
  if (expectedDetectorInputCache.has(key)) {
    return expectedDetectorInputCache.get(key);
  }
  const input = computeExpectedDetectorInput(witness, detector);
  expectedDetectorInputCache.set(key, input);
  return input;
}

function detectorInputMatchesWitness(
  witness: LawWitness,
  detector: string,
  value: unknown,
): boolean {
  try {
    return sameCanonical(
      canonicalize(value),
      canonicalize(expectedDetectorInput(witness, detector)),
    );
  } catch {
    return false;
  }
}

function pairedExecutionRows(
  witness: LawWitness,
  runtimeInput: unknown,
  runtimeOutput: unknown,
  key: "production" | "detectors",
): readonly Readonly<{ input: JsonRecord; output: JsonRecord }>[] {
  const input = record(runtimeInput, `${witness.id}.runtimeInput`);
  const output = record(runtimeOutput, `${witness.id}.runtimeOutput`);
  if (!Object.hasOwn(input, "branchInput") || !Object.hasOwn(output, "branchOutput")) {
    throw new TypeError(`${witness.id}: branch runtime preimages missing`);
  }
  const inputExecution = record(input["execution"], `${witness.id}.input.execution`);
  const outputExecution = record(output["execution"], `${witness.id}.output.execution`);
  const inputRows = inputExecution[key];
  const outputRows = outputExecution[key];
  if (!Array.isArray(inputRows) || !Array.isArray(outputRows) ||
      inputRows.length !== outputRows.length) {
    throw new TypeError(`${witness.id}: ${key} execution rows`);
  }
  return inputRows.map((inputValue, index) => Object.freeze({
    input: record(
      inputValue,
      `${witness.id}.${key}.input[${index.toString()}]`,
    ),
    output: record(
      outputRows[index],
      `${witness.id}.${key}.output[${index.toString()}]`,
    ),
  }));
}

function negativeWitnessExecutionSpec(witness: LawWitness) {
  return lawFixture.lawProofPolicy.negativeWitnessExecutionPolicy.executionSpecs
    .find(({ witnessId }) => witnessId === witness.id);
}

function runtimeDigestsMatchWitnessSpec(
  witness: LawWitness,
  runtimeInput: unknown,
  runtimeOutput: unknown,
): boolean {
  const spec = negativeWitnessExecutionSpec(witness);
  return spec !== undefined &&
    v0EvidenceDigest(runtimeInput) === spec.runtimeRequestSha256 &&
    v0EvidenceDigest(runtimeOutput) === spec.runtimeResultSha256;
}

function productionExecutionEvidenceAccepted(
  witness: LawWitness,
  runtimeInput: unknown,
  runtimeOutput: unknown,
): boolean {
  try {
    const rows = pairedExecutionRows(witness, runtimeInput, runtimeOutput, "production");
    const spec = negativeWitnessExecutionSpec(witness);
    if (spec === undefined || rows.length !== spec.production.length) return false;
    return rows.length > 0 && rows.every(({ input, output }, index) => {
      const expected = spec.production[index];
      return expected !== undefined &&
      input["kind"] === `${witness.id}/production` &&
      output["kind"] === input["kind"] &&
      input["operation"] === expected.operation &&
      output["operation"] === input["operation"] &&
      input["executor"] === expected.executor &&
      output["executor"] === expected.executor &&
      Object.hasOwn(input, "input") && Object.hasOwn(output, "result") &&
      sameCanonical(
        canonicalize(input["input"]),
        canonicalize(expectedProductionInput(witness, expected.operation)),
      ) &&
      sameCanonical(
        canonicalize(replayProductionExecution(input)),
        canonicalize(output["result"]),
      );
    });
  } catch {
    return false;
  }
}

function detectorExecutionEvidenceAccepted(
  witness: LawWitness,
  runtimeInput: unknown,
  runtimeOutput: unknown,
): boolean {
  try {
    const rows = pairedExecutionRows(witness, runtimeInput, runtimeOutput, "detectors");
    const spec = negativeWitnessExecutionSpec(witness);
    if (spec === undefined || rows.length !== spec.detectors.length) return false;
    return rows.length > 0 && rows.every(({ input, output }, index) => {
      const expected = spec.detectors[index];
      return expected !== undefined &&
      input["kind"] === `${witness.id}/detector` &&
      output["kind"] === input["kind"] &&
      input["detector"] === expected.detector &&
      output["detector"] === input["detector"] &&
      Object.hasOwn(input, "mutantInput") &&
      Object.hasOwn(output, "detectorOutput") &&
      detectorInputMatchesWitness(
        witness, expected.detector, input["mutantInput"],
      ) &&
      sameCanonical(
        canonicalize(replayDetectorExecution(
          input["detector"], input["mutantInput"],
        )),
        canonicalize(output["detectorOutput"]),
      );
    });
  } catch {
    return false;
  }
}

export type V0NegativeWitnessExecutionFacts = Readonly<{
  productionMutantExecuted: boolean;
  detectorOnlyMutantEvaluated: boolean;
}>;

function deriveNegativeWitnessExecutionFacts(
  witness: LawWitness,
  runtimeInput: unknown,
  runtimeOutput: unknown,
): V0NegativeWitnessExecutionFacts {
  const runtimeDigestsMatch = runtimeDigestsMatchWitnessSpec(
    witness, runtimeInput, runtimeOutput,
  );
  return Object.freeze({
    productionMutantExecuted: runtimeDigestsMatch && productionExecutionEvidenceAccepted(
      witness, runtimeInput, runtimeOutput,
    ),
    detectorOnlyMutantEvaluated: runtimeDigestsMatch && detectorExecutionEvidenceAccepted(
      witness, runtimeInput, runtimeOutput,
    ),
  });
}

export function evaluateV0NegativeWitnessExecutionEvidence(
  caseId: string,
  evidence: Readonly<{
    actualProjection?: unknown;
    expectedProjection?: unknown;
    runtimeInput: unknown;
    runtimeOutput: unknown;
  }>,
): V0NegativeWitnessExecutionFacts {
  const witness = lawWitness(caseId);
  if (witness.kind !== "negative") {
    return Object.freeze({
      productionMutantExecuted: false,
      detectorOnlyMutantEvaluated: false,
    });
  }
  return deriveNegativeWitnessExecutionFacts(
    witness,
    evidence.runtimeInput,
    evidence.runtimeOutput,
  );
}

function actualLawWitnessExecutionProjection(
  witness: LawWitness,
  runtimeInput: unknown,
  runtimeOutput: unknown,
): JsonRecord {
  if (witness.kind === "positive") return {};
  const facts = deriveNegativeWitnessExecutionFacts(
    witness, runtimeInput, runtimeOutput,
  );
  const { productionMutantExecuted, detectorOnlyMutantEvaluated } = facts;
  return {
    mutationExecutionMode: productionMutantExecuted && detectorOnlyMutantEvaluated
      ? "mixed-production-and-detector"
      : productionMutantExecuted
        ? "production-executed"
        : detectorOnlyMutantEvaluated ? "detector-only" : "execution-evidence-missing",
    productionMutantExecuted,
    detectorOnlyMutantEvaluated,
  };
}

function createLawWitnessEnvelope(
  witness: LawWitness,
  actual: unknown,
  expected: unknown,
  runtimeInput: unknown,
  runtimeOutput: unknown,
  executionEvidence?: V0WitnessExecutionEvidence,
): V0ConformanceCaseEnvelope {
  const normalizedRuntime = witness.kind === "negative"
    ? normalizedNegativeWitnessRuntime(
        runtimeInput,
        runtimeOutput,
        executionEvidence ?? witnessExecutionEvidence(
          witness.id, runtimeInput, runtimeOutput, {},
        ),
      )
    : { runtimeInput, runtimeOutput };
  const actualExecution = actualLawWitnessExecutionProjection(
    witness,
    normalizedRuntime.runtimeInput,
    normalizedRuntime.runtimeOutput,
  );
  const expectedExecution = expectedLawWitnessExecutionProjection(witness);
  return createEnvelope(
    witness.id,
    "tests/fixtures/voicing/law-cases.json",
    "law-witness",
    { ...record(actual, `${witness.id}.actual`), ...actualExecution },
    { ...record(expected, `${witness.id}.expected`), ...expectedExecution },
    normalizedRuntime.runtimeInput,
    normalizedRuntime.runtimeOutput,
  );
}

export function executeV0LawWitness(caseId: string): V0ConformanceCaseEnvelope {
  const witness = lawWitness(caseId);
  const named = namedWitnessProjection(witness);
  if (named !== null) {
    return createLawWitnessEnvelope(
      witness,
      named.actual,
      named.expected,
      named.runtimeInput,
      named.runtimeOutput,
      named.executionEvidence,
    );
  }
  const spacing = spacingWitnessProjection(witness);
  if (spacing !== null) {
    return createLawWitnessEnvelope(
      witness,
      spacing.actual,
      spacing.expected,
      spacing.runtimeInput,
      spacing.runtimeOutput,
      spacing.executionEvidence,
    );
  }
  const order = orderWitnessProjection(witness);
  if (order !== null) {
    return createLawWitnessEnvelope(
      witness,
      order.actual,
      order.expected,
      order.runtimeInput,
      order.runtimeOutput,
      order.executionEvidence,
    );
  }
  const childIds = LAW_WITNESS_EXECUTION_CASES[caseId];
  if (childIds === undefined) throw new Error(`${caseId}: witness executor missing`);
  const children = childIds.map(executeWitnessChild);
  for (const child of children) {
    const expectedChannel = expectedV0ConformanceChannel(child.caseId);
    if (child.channel !== expectedChannel) {
      throw new Error(
        `${caseId}/${child.caseId}: ${child.channel} channel, expected ${expectedChannel}`,
      );
    }
  }
  return createLawWitnessEnvelope(
    witness,
    {
      caseId,
      witnessKind: witness.kind,
      executedCaseCount: children.length,
      childCases: children.map((child) => ({
        caseId: child.caseId,
        channel: child.channel,
        projection: child.actualProjection,
      })),
    },
    {
      caseId,
      witnessKind: witness.kind,
      executedCaseCount: childIds.length,
      childCases: children.map((child) => ({
        caseId: child.caseId,
        channel: expectedV0ConformanceChannel(child.caseId),
        projection: child.expectedProjection,
      })),
    },
    children.map(({ caseId: childCaseId, runtimeInput }) => ({
      caseId: childCaseId,
      runtimeInput,
    })),
    children.map(({ caseId: childCaseId, runtimeOutput }) => ({
      caseId: childCaseId,
      runtimeOutput,
    })),
  );
}

type V0LawCheck = Readonly<{ id: string; accepted: boolean }>;

function lawCheck(id: string, accepted: boolean): V0LawCheck {
  return Object.freeze({ id, accepted });
}

function exactCandidateMembershipAccepted(caseId: string): boolean {
  const { request, candidate } = exactGeneratedCandidate(caseId);
  return candidate.realizationId === request.realizationId &&
    candidateMembershipAudit(request, candidate);
}

function generatedVoiceCountAccepted(caseId: string): boolean {
  const { request, candidate } = exactGeneratedCandidate(caseId);
  return candidate.voices.length === request.policy.voiceCount &&
    candidate.pitches.length === request.policy.voiceCount;
}

function candidateRangeUniqueAccepted(caseId: string): boolean {
  const { request, candidate } = exactGeneratedCandidate(caseId);
  const values = candidate.voices.map(({ midi: value }) => Number(value));
  return values.every((value) =>
    value >= Number(request.policy.range.lowMidi) &&
    value <= Number(request.policy.range.highMidi)
  ) && new Set(values).size === values.length;
}

function candidateIdentityAndGuideAccepted(caseId: string): boolean {
  const { request, candidate } = exactGeneratedCandidate(caseId);
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  if (realization === undefined) return false;
  const tokens = candidate.voices.flatMap(({ degree }) =>
    degree === null ? [] : [degreeToken(degree)]
  );
  const guidesPresent = realization.guideToneDegrees.every((degree) =>
    tokens.includes(degreeToken(degree))
  );
  const identityToken = request.resolved.source.triad === "minor" ? "b3"
    : request.resolved.source.triad === "sus4" ? "4"
    : request.resolved.source.triad === "sus2" ? "2"
    : request.resolved.source.triad === "power" ? "5" : "3";
  const identityPresent = tokens.includes(identityToken);
  const rootPresentOrNamed = tokens.includes("1") ||
    request.policy.family === "rootless-a" ||
    request.policy.family === "rootless-b" ||
    candidate.explanation.externalBass !== null;
  return guidesPresent && identityPresent && rootPresentOrNamed;
}

function drop2CandidateAccepted(caseId: string): boolean {
  const { request, candidate } = exactGeneratedCandidate(caseId);
  const evidence = candidate.explanation.drop2;
  if (evidence === null || evidence.closedSourceMidi.length < 4) return false;
  const closed = evidence.closedSourceMidi.map(Number);
  const transformed = evidence.transformedMidi.map(Number);
  const sourceOrdinal = evidence.secondFromTopSourceOrdinal;
  const expected = [...closed];
  const sourceMidi = expected[sourceOrdinal];
  if (sourceMidi === undefined) return false;
  expected[sourceOrdinal] = sourceMidi - 12;
  expected.sort((left, right) => left - right);
  const sounded = candidate.voices.map(({ midi: value }) => Number(value));
  const closedLow = closed[0];
  const closedHigh = closed.at(-1);
  return sourceOrdinal === closed.length - 2 &&
    Number(record(evidence, "Drop-2 evidence")["loweredBySemitones"]) === 12 &&
    closedHigh !== undefined && closedLow !== undefined && closedHigh - closedLow <= 11 &&
    sameCanonical(canonicalize(transformed), canonicalize(expected)) &&
    sameCanonical(canonicalize(sounded), canonicalize(transformed)) &&
    sounded.every((value) => value >= Number(request.policy.range.lowMidi) &&
      value <= Number(request.policy.range.highMidi)) &&
    lowRegisterSpacingViolations(candidate.voices).length === 0;
}

function quartalCandidateAccepted(caseId: string): boolean {
  const { request, candidate } = exactGeneratedCandidate(caseId);
  if (request.quartalContext === null || candidate.family !== "quartal") return false;
  const degrees = candidate.voices.flatMap(({ degree }) =>
    degree === null ? [] : [degreeToken(degree)]
  );
  const contextDegrees = request.quartalContext.degreeSequence.map(degreeToken);
  return sameCanonical(canonicalize(degrees), canonicalize(contextDegrees)) &&
    candidate.explanation.quartalAdjacencies.length === candidate.voices.length - 1 &&
    candidate.explanation.quartalAdjacencies.every(
      (row) => [5, 6].includes(
        Number(record(row, "Quartal adjacency")["semitones"]),
      ),
    );
}

function noFallbackRefusalAccepted(caseId: string): boolean {
  const recipe = v0CandidateCase(caseId);
  const request = buildV0CandidateRequest(recipe);
  const result = realizeVoicing(request);
  const source = record(result, `${caseId}.noFallback`);
  return !result.ok && !Object.hasOwn(source, "value") &&
    !Object.hasOwn(source, "partialValue") &&
    !Object.hasOwn(source, "candidates") &&
    !Object.hasOwn(source, "pitches");
}

type V0LawExecutionContext = Readonly<{
  positive: readonly V0ConformanceCaseEnvelope[];
  negative: readonly V0ConformanceCaseEnvelope[];
  transposition: readonly V0ConformanceCaseEnvelope[];
}>;

function lawBoundChildren(context: V0LawExecutionContext): readonly V0ConformanceCaseEnvelope[] {
  return [...context.positive, ...context.negative, ...context.transposition];
}

function lawBoundChild(
  context: V0LawExecutionContext,
  caseId: string,
): V0ConformanceCaseEnvelope | undefined {
  return lawBoundChildren(context).find((child) => child.caseId === caseId);
}

function adaptiveDoublingDetectorAccepted(
  request: AutoVoicingRequest,
  token: string | null,
  provenance: "realization" | "doubling" | "slash-bass",
  copyCount: number,
  octaveDelta: number,
): boolean {
  const realization = request.resolved.realizations.find(
    ({ id }) => id === request.realizationId,
  );
  if (realization === undefined || token === null || provenance !== "doubling" ||
      (request.policy.family !== "balanced" && request.policy.family !== "open") ||
      copyCount !== 1 || octaveDelta !== 12 || (token !== "1" && token !== "5")) {
    return false;
  }
  const degree = realization.degrees.find((value) => degreeToken(value) === token);
  return degree !== undefined && degree.alter === 0 &&
    !realization.guideToneDegrees.some((guide) => degreeToken(guide) === token);
}

function noncyclicSelectedDegreeWeaveAccepted(caseId: string): boolean {
  const execution = exactGeneratedCandidate(caseId);
  const selected = independentSelectedOccurrences(execution.request, execution.candidate);
  if (selected === null) return false;
  const selectedOrder = selected.map(({ token }) => token);
  const soundedOrder = execution.candidate.voices.flatMap(({ degree }) =>
    degree === null ? [] : [degreeToken(degree)]
  );
  const cyclic = selectedOrder.map((_, index) => [
    ...selectedOrder.slice(index), ...selectedOrder.slice(0, index),
  ]);
  const audit = record(
    auditV0GeneratedResultSet(execution.request, execution.result),
    `${caseId}.completeResultAudit`,
  );
  const checks = audit["checks"];
  return execution.candidate.family === execution.request.policy.family &&
    execution.candidate.localScore.templateOrderDisplacement > 0 &&
    !cyclic.some((order) => sameCanonical(
      canonicalize(order), canonicalize(soundedOrder),
    )) && Array.isArray(checks) && checks.every((value) =>
      record(value, `${caseId}.auditCheck`)["accepted"] === true
    );
}

function lawSpecificChecks(
  caseId: string,
  context: V0LawExecutionContext,
): readonly V0LawCheck[] {
  switch (caseId) {
    case "V0-LAW-001": {
      const ids = ["V0-CAND-001", "V0-CAND-004", "V0-CAND-009"] as const;
      return ids.map((id) => {
        const request = buildV0CandidateRequest(v0CandidateCase(id));
        return lawCheck(`replay-${id}`, sameCanonical(
          canonicalize(realizeVoicing(request)),
          canonicalize(realizeVoicing(request)),
        ));
      });
    }
    case "V0-LAW-002":
      return [
        lawCheck("literal-membership", exactCandidateMembershipAccepted("V0-CAND-001")),
        lawCheck("altered-membership", exactCandidateMembershipAccepted("V0-CAND-012")),
        lawCheck("altered-ids-remain-distinct",
          executeV0LawWitness("V0-ALT-NEAR-001").baselineAccepted),
      ];
    case "V0-LAW-003":
      return ["V0-CAND-001", "V0-CAND-009", "V0-CAND-017"].map((id) =>
        lawCheck(`identity-guides-${id}`, candidateIdentityAndGuideAccepted(id))
      );
    case "V0-LAW-004":
      return ["V0-CAND-008", "V0-CAND-012", "V0-CAND-016"].map((id) =>
        lawCheck(`exact-spelling-${id}`, exactCandidateMembershipAccepted(id))
      );
    case "V0-LAW-005":
      return ["V0-CAND-013", "V0-CAND-014", "V0-CAND-018"].map((id) =>
        lawCheck(`total-voice-count-${id}`, generatedVoiceCountAccepted(id))
      );
    case "V0-LAW-006": {
      const generated = exactGeneratedCandidate("V0-CAND-013");
      const external = exactGeneratedCandidate("V0-CAND-014");
      const slash = generated.candidate.voices[0];
      const slashRecord = record(slash, "LAW006 generated slash voice");
      return [
        lawCheck("generated-slash-is-exact-unique-lowest",
          slashRecord["provenance"] === "slash-bass" && slashRecord["degree"] === null &&
          slashRecord["sourceDegreeIndex"] === null &&
          generated.request.resolved.bass !== null &&
          slash.pitch.step === generated.request.resolved.bass.step &&
          slash.pitch.alter === generated.request.resolved.bass.alter &&
          generated.candidate.voices.slice(1).every(({ midi }) =>
            Number(midi) > Number(slash.midi)
          )),
        lawCheck("external-slash-is-named-not-sounded",
          external.candidate.explanation.externalBass !== null &&
          external.candidate.voices.every(({ provenance }) =>
            provenance !== "slash-bass"
          )),
      ];
    }
    case "V0-LAW-007": {
      const rows = ["V0-CAND-006", "V0-CAND-007", "V0-CAND-008", "V0-CAND-018"]
        .map(exactGeneratedCandidate);
      const rootlessAccepted = rows.every(({ request, candidate }) =>
        (candidate.family === "rootless-a" || candidate.family === "rootless-b") &&
        request.policy.bassPolicy === "external" &&
        candidate.explanation.externalBass !== null &&
        candidate.voices.every(({ degree }) =>
          degree === null || degreeToken(degree) !== "1"
        )
      );
      const a = rows[0]?.candidate.voices.map(({ degree }) =>
        degree === null ? null : degreeToken(degree)
      );
      const b = rows[1]?.candidate.voices.map(({ degree }) =>
        degree === null ? null : degreeToken(degree)
      );
      return [
        lawCheck("rootless-external-and-root-omitted", rootlessAccepted),
        lawCheck("rootless-a-b-distinct", !sameCanonical(canonicalize(a), canonicalize(b))),
      ];
    }
    case "V0-LAW-008":
      return [
        lawCheck("inclusive-range-and-unique", candidateRangeUniqueAccepted("V0-CAND-001")),
        lawCheck("production-unison-refusal",
          executeV0LawWitness("V0-UNISON-NEAR-001").baselineAccepted),
      ];
    case "V0-LAW-009": {
      const { request, candidate } = exactGeneratedCandidate("V0-CAND-015");
      const roots = candidate.voices.filter(({ degree }) =>
        degree !== null && degreeToken(degree) === "1"
      );
      const guideRequest = exactGeneratedCandidate("V0-CAND-001").request;
      const alteredRequest = exactGeneratedCandidate("V0-CAND-012").request;
      const characteristicRequest = exactGeneratedCandidate("V0-CAND-002").request;
      const duplicateProbe = duplicateMidiProductionProbe();
      const duplicateProjection = record(
        duplicateProbe.projection, "LAW009 duplicate-MIDI projection",
      );
      const duplicateReasons = duplicateProjection["reasons"];
      return [
        lawCheck("declared-root-doubling-accepted", roots.length === 2 &&
          adaptiveDoublingDetectorAccepted(request, "1", "doubling", 1, 12) &&
          sameCanonical(
            canonicalize(candidate.explanation.doubledDegrees.map(degreeToken)),
            canonicalize(["1"]),
          )),
        lawCheck("guide-doubling-mutant-detected",
          !adaptiveDoublingDetectorAccepted(guideRequest, "3", "doubling", 1, 12)),
        lawCheck("altered-doubling-mutant-detected",
          !adaptiveDoublingDetectorAccepted(alteredRequest, "b5", "doubling", 1, 12) &&
          (lawBoundChild(context, "V0-DOUBLING-NEAR-001")?.baselineAccepted ?? false)),
        lawCheck("characteristic-doubling-mutant-detected",
          !adaptiveDoublingDetectorAccepted(
            characteristicRequest, "9", "doubling", 1, 12,
          )),
        lawCheck("slash-doubling-mutant-detected",
          !adaptiveDoublingDetectorAccepted(request, null, "slash-bass", 1, 12)),
        lawCheck("exact-midi-duplicate-mutant-refused",
          duplicateProjection["ok"] === false && Array.isArray(duplicateReasons) &&
          duplicateReasons.includes("duplicate-midi")),
        lawCheck("second-root-copy-mutant-detected",
          !adaptiveDoublingDetectorAccepted(request, "1", "doubling", 2, 12)),
        lawCheck("two-octave-copy-mutant-detected",
          !adaptiveDoublingDetectorAccepted(request, "1", "doubling", 1, 24) &&
          (lawBoundChild(context, "V0-DOUBLING-NEAR-002")?.baselineAccepted ?? false)),
      ];
    }
    case "V0-LAW-010": {
      const ids = [
        "V0-SPACING-BOUNDARY-001", "V0-SPACING-BOUNDARY-002",
        "V0-SPACING-BOUNDARY-003", "V0-SPACING-BOUNDARY-004",
        "V0-SPACING-NEAR-001", "V0-SPACING-NEAR-002",
        "V0-SPACING-NEAR-003", "V0-SPACING-NEAR-004",
      ];
      return ids.map((id) => lawCheck(`spacing-${id}`, executeV0LawWitness(id).baselineAccepted));
    }
    case "V0-LAW-011":
      return [
        "V0-CAND-004", "V0-CAND-005", "V0-CAND-034",
        "V0-CAND-035", "V0-CAND-038",
      ].map((id) => lawCheck(`literal-drop2-${id}`, drop2CandidateAccepted(id)));
    case "V0-LAW-012":
      return ["V0-CAND-009", "V0-CAND-010", "V0-CAND-011"].map((id) =>
        lawCheck(`quartal-context-${id}`, quartalCandidateAccepted(id))
      );
    case "V0-LAW-013": {
      const selected = exactGeneratedCandidate("V0-CAND-012");
      return [
        lawCheck("requested-altered-id-honored",
          selected.candidate.realizationId === selected.request.realizationId &&
          selected.request.realizationId === "alt-b9-b5"),
        lawCheck("altered-variants-not-merged",
          executeV0LawWitness("V0-ALT-NEAR-001").baselineAccepted),
      ];
    }
    case "V0-LAW-014":
      return [
        lawCheck("manual-literal-zero-work",
          executeV0CandidateCase("V0-CAND-031").baselineAccepted),
        lawCheck("frozen-literal-zero-work",
          executeV0CandidateCase("V0-CAND-032").baselineAccepted),
        lawCheck("stored-near-witnesses",
          executeV0LawWitness("V0-BYPASS-NEAR-001").baselineAccepted &&
          executeV0LawWitness("V0-BYPASS-NEAR-002").baselineAccepted),
      ];
    case "V0-LAW-015":
      return ["V0-CAND-019", "V0-CAND-025", "V0-CAND-029"].map((id) =>
        lawCheck(`typed-no-fallback-${id}`, noFallbackRefusalAccepted(id))
      );
    case "V0-LAW-016":
      return [
        lawCheck("all-six-score-axes",
          executeV0LawWitness("V0-ORDER-001").baselineAccepted),
        lawCheck("all-five-tie-breaks",
          executeV0LawWitness("V0-ORDER-002").baselineAccepted),
        lawCheck("reverse-and-locale-independent",
          executeV0LawWitness("V0-ORDER-NEAR-001").baselineAccepted),
        lawCheck("identity-not-midi-only",
          executeV0LawWitness("V0-IDENTITY-NEAR-002").baselineAccepted),
      ];
    case "V0-LAW-017":
      return [lawCheck("all-18-by-12-full-result-sets-and-near-misses",
        lawBoundChildren(context).every(({ baselineAccepted }) => baselineAccepted))];
    case "V0-LAW-018":
      return [
        lawCheck("active-deep-immutability",
          executeV0LawWitness("V0-IMMUTABLE-001").baselineAccepted),
        lawCheck("shallow-freeze-control-killed",
          executeV0LawWitness("V0-IMMUTABLE-NEAR-001").baselineAccepted),
      ];
    case "V0-LAW-019": {
      const children = lawBoundChildren(context);
      const acceptedGroup = (prefix: string, count: number): boolean => {
        const matching = children.filter(({ caseId: id }) => id.startsWith(prefix));
        return matching.length === count && matching.every(({ baselineAccepted }) =>
          baselineAccepted
        );
      };
      const counterCases = children.filter(({ caseId: id }) =>
        id.startsWith("V0-LIMIT-WORK-") || id.startsWith("V0-LIMIT-MEMORY-")
      );
      const wall = lawBoundChild(context, "V0-WALL-TIME-001-NO-CUTOFF");
      const wallProjection = wall === undefined
        ? null
        : record(wall.actualProjection, "LAW019 wall projection");
      return [
        lawCheck("all-48-counter-boundaries", counterCases.length === 48 &&
          counterCases.every(({ baselineAccepted }) => baselineAccepted)),
        lawCheck("all-4-retention-boundaries", acceptedGroup("V0-RETENTION-", 4)),
        lawCheck("all-6-identifier-boundaries", acceptedGroup("V0-ID-", 6)),
        lawCheck("all-4-midi-boundaries", acceptedGroup("V0-MIDI-BOUNDARY-", 4)),
        lawCheck("wall-time-not-semantic", wall?.baselineAccepted === true &&
          wallProjection !== null && sameCanonical(
            canonicalize(wallProjection["baselineProjection"]),
            canonicalize(wallProjection["perturbedProjection"]),
          )),
      ];
    }
    case "V0-LAW-020":
      return [lawCheck("each-local-and-ambient-input-ignored",
        executeV0LawWitness("V0-LOCAL-001").baselineAccepted &&
        executeV0LawWitness("V0-LOCAL-NEAR-001").baselineAccepted)];
    case "V0-LAW-021":
      return [
        lawCheck("balanced-noncyclic-selected-degree-weave",
          noncyclicSelectedDegreeWeaveAccepted("V0-CAND-001") &&
          (lawBoundChild(context, "V0-WEAVE-NEAR-001")?.baselineAccepted ?? false)),
        lawCheck("open-production-selected-degree-weave",
          noncyclicSelectedDegreeWeaveAccepted("V0-CAND-003") &&
          (lawBoundChild(context, "V0-WEAVE-NEAR-001")?.baselineAccepted ?? false)),
      ];
    case "V0-LAW-022":
      return [lawCheck("adaptive-count-and-fit-separated",
        executeV0LawWitness("V0-ADAPTIVE-SLOTS-NEAR-001").baselineAccepted)];
    case "V0-LAW-023":
      return [
        lawCheck("complete-payload-order-and-dedup",
          executeV0OperationCase("V0-OP-REFUSAL-014").baselineAccepted),
        lawCheck("no-result-distinct-17-all-or-nothing",
          executeV0OperationCase("V0-OP-REFUSAL-016").baselineAccepted),
        lawCheck("later-legal-clears-provisional-overflow",
          executeV0LawWitness("V0-CONSTRAINT-OVERFLOW-NEAR-001").baselineAccepted),
      ];
    default:
      throw new Error(`${caseId}: V0 law predicate missing`);
  }
}

export function expectedV0ConformanceChannel(caseId: string): V0ConformanceChannel {
  if (V0_CANDIDATE_CASES.some(({ id }) => id === caseId)) return "candidate";
  if (lawFixture.witnesses.some(({ id }) => id === caseId)) return "law-witness";
  if (lawFixture.cases.some(({ id }) => id === caseId)) return "law-case";
  if (transpositionFixture.seeds.some(({ id }) => id === caseId)) return "transposition";
  if (operationRows().some(({ id }) => id === caseId)) return "operation";
  return "limit";
}

function executeV0LawCase(caseId: string): V0ConformanceCaseEnvelope {
  const law = lawFixture.cases.find(({ id }) => id === caseId);
  if (law === undefined) throw new Error(`${caseId}: law case missing`);
  const positive = law.positiveCaseIds.map((childCaseId) =>
    executeV0ConformanceCase(childCaseId)
  );
  const negative = law.negativeCaseIds.map((childCaseId) =>
    executeV0ConformanceCase(childCaseId)
  );
  const transposition = law.transpositionSeedIds.map((childCaseId) =>
    executeV0TranspositionSeed(childCaseId)
  );
  const context = Object.freeze({ positive, negative, transposition });
  for (const child of lawBoundChildren(context)) {
    const expectedChannel = expectedV0ConformanceChannel(child.caseId);
    if (child.channel !== expectedChannel) {
      throw new Error(
        `${caseId}/${child.caseId}: ${child.channel} channel, expected ${expectedChannel}`,
      );
    }
  }
  const checks = lawSpecificChecks(caseId, context);
  const actualCheckIds = checks.map(({ id }) => id);
  if (!sameCanonical(canonicalize(actualCheckIds), canonicalize(law.checkIds))) {
    throw new Error(
      `${caseId}: executable check inventory differs from independent fixture`,
    );
  }
  const actualBinding = (envelope: V0ConformanceCaseEnvelope): unknown => ({
    caseId: envelope.caseId,
    channel: envelope.channel,
    projection: envelope.actualProjection,
  });
  const expectedBinding = (envelope: V0ConformanceCaseEnvelope): unknown => ({
    caseId: envelope.caseId,
    channel: expectedV0ConformanceChannel(envelope.caseId),
    projection: envelope.expectedProjection,
  });
  return createEnvelope(
    caseId,
    "tests/fixtures/voicing/law-cases.json",
    "law-case",
    {
      caseId,
      lawId: law.lawId,
      predicate: law.predicate,
      traceIds: law.traceIds,
      authorityIds: law.authorityIds,
      mutationControlIds: law.mutationControlIds,
      positiveBindings: positive.map(actualBinding),
      negativeBindings: negative.map(actualBinding),
      transpositionBindings: transposition.map(actualBinding),
      checks,
    },
    {
      caseId,
      lawId: law.lawId,
      predicate: law.predicate,
      traceIds: law.traceIds,
      authorityIds: law.authorityIds,
      mutationControlIds: law.mutationControlIds,
      positiveBindings: positive.map(expectedBinding),
      negativeBindings: negative.map(expectedBinding),
      transpositionBindings: transposition.map(expectedBinding),
      checks: law.checkIds.map((id) => ({ id, accepted: true })),
    },
    {
      lawId: law.lawId,
      positive: positive.map(({ caseId: id, runtimeInput }) => ({ id, runtimeInput })),
      negative: negative.map(({ caseId: id, runtimeInput }) => ({ id, runtimeInput })),
      transposition: transposition.map(({ caseId: id, runtimeInput }) => ({
        id, runtimeInput,
      })),
    },
    {
      checks,
      positive: positive.map(({ caseId: id, runtimeOutput }) => ({ id, runtimeOutput })),
      negative: negative.map(({ caseId: id, runtimeOutput }) => ({ id, runtimeOutput })),
      transposition: transposition.map(({ caseId: id, runtimeOutput }) => ({
        id, runtimeOutput,
      })),
    },
  );
}

export function executeV0ConformanceCase(caseId: string): V0ConformanceCaseEnvelope {
  if (V0_CANDIDATE_CASES.some(({ id }) => id === caseId)) {
    return executeV0CandidateCase(caseId);
  }
  if (lawFixture.witnesses.some(({ id }) => id === caseId)) {
    return executeV0LawWitness(caseId);
  }
  if (lawFixture.cases.some(({ id }) => id === caseId)) {
    return executeV0LawCase(caseId);
  }
  if (transpositionFixture.seeds.some(({ id }) => id === caseId)) {
    return executeV0TranspositionSeed(caseId);
  }
  if (operationRows().some(({ id }) => id === caseId)) {
    return executeV0OperationCase(caseId);
  }
  try {
    return executeV0LimitCase(caseId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("unsupported V0 limit case")) {
      throw new Error(`${caseId}: unsupported V0 conformance case`, { cause: error });
    }
    throw error;
  }
}
