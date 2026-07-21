import {
  makeChordDegree,
  pitchClassOf,
  type AutoVoicing,
  type ChordDegree,
  type MidiPitch,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../domain";
import type {
  SemanticRealization,
} from "./resolution-contract";
import {
  MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS,
  MAX_VOICING_RETAINED_CANDIDATES,
  QUARTAL_CONTEXT_POLICY_ID,
  QUARTAL_CONTEXT_POLICY_VERSION,
  QUARTAL_CONTEXT_SCHEMA,
  VOICING_CANDIDATE_IDS,
  VOICING_CANDIDATE_SCHEMA,
  VOICING_CONSTRAINT_CODES,
  VOICING_ENGINE_ID,
  VOICING_ENGINE_VERSION,
  VOICING_FAMILY_REGISTER_POLICY_VERSION,
  VOICING_LOCAL_SCORE_POLICY_ID,
  VOICING_LOCAL_SCORE_POLICY_VERSION,
  VOICING_LOW_REGISTER_POLICY_ID,
  VOICING_LOW_REGISTER_POLICY_VERSION,
  VOICING_RESULT_SCHEMA,
  VOICING_TEMPLATE_TABLE_ID,
  VOICING_TEMPLATE_TABLE_VERSION,
  type AutoVoicingRequest,
  type Drop2TransformEvidence,
  type GeneratedVoicingCandidates,
  type GeneratedVoicingResult,
  type NonQuartalVoicingCandidateEvidenceRecords,
  type QuartalAdjacencyEvidence,
  type QuartalAutoVoicingRequest,
  type QuartalContext,
  type QuartalContextInvalidReason,
  type QuartalContextInvalidRefusal,
  type QuartalContextRequiredRefusal,
  type QuartalContextUnexpectedRefusal,
  type QuartalVoicingCandidateEvidenceRecords,
  type RealizeVoicing,
  type RealizeVoicingRequest,
  type RealizeVoicingResult,
  type SatisfiedVoicingConstraint,
  type StoredVoicing,
  type StoredVoicingBypassEvidence,
  type StoredVoicingRequest,
  type StoredVoicingResult,
  type UnsatisfiedVoicingConstraint,
  type VoicingCandidate,
  type VoicingCandidateEvidence,
  type VoicingCandidateExplanation,
  type VoicingCandidateHardConstraints,
  type VoicingCandidatePitches,
  type VoicingCandidateVoice,
  type VoicingCandidateVoices,
  type VoicingConstraintCode,
  type VoicingConstraintUnsatisfiedReason,
  type VoicingFamilyRegisterPolicy,
  type VoicingFamilyTemplate,
  type VoicingLocalScore,
  type VoicingQualityClass,
  type VoicingRefusal,
  type VoicingTemplateDegreeSlot,
  type VoicingTermination,
  type VoicingWorkLimitExceededRefusal,
} from "./voicing-candidates-contract";
import {
  VOICING_TEMPLATE_ROWS,
  classifyVoicingQuality,
  findVoicingRegisterPolicy,
  getVoicingIdentityDegrees,
} from "./voicing-family-authority";
import {
  assessBoundVoicingApplicability,
  compareAdaptiveOptionalDegrees,
  isDrop2PitchClassSetStructurallyFeasible,
  type VoicingStaticConstraintsUnsatisfiedRefusal,
} from "./voicing-applicability";
import {
  applyDrop2Transform,
  bindVoicingRealization,
  candidateIdentityKey,
  chordDegreeKey,
  compareChordDegreesByVoicingPriority,
  compareVoicingCandidates,
  createVoicingConstraintObservationCollector,
  createVoicingWorkLedger,
  deepFreezeOwned,
  findVoicingSourceDegree,
  lowRegisterSpacingViolations,
  makeUnsatisfiedVoicingConstraint,
  sameChordDegree,
  validateVoicingEvidenceIdentifier,
  visitSpelledRegisterPlacementValues,
  type SourceDegreeRegisterPlacement,
  type SpelledRegisterPlacement,
  type VoicingSourceDegreeFact,
  type VoicingSourceDegreeFacts,
  type VoicingConstraintObservationCollector,
  type VoicingWorkLedger as PrimitiveVoicingWorkLedger,
} from "./voicing-engine-primitives";

const ROOT_DEGREE = Object.freeze({ number: 1, alter: 0 } as const);
const NATURAL_FIFTH = Object.freeze({ number: 5, alter: 0 } as const);

const QUARTAL_CONTEXT_PATH = Object.freeze(["quartalContext"] as const);

type Ledger = PrimitiveVoicingWorkLedger;

type SelectedDegreeSlot = Readonly<{
  source: VoicingSourceDegreeFact;
  provenance: "realization" | "doubling";
  templateOrdinal: number;
}>;

type RawPlacedVoice = VoicingCandidateVoice &
  Readonly<{
    templateOrdinal: number;
  }>;

type RawCandidateRecord = {
  readonly voices: readonly VoicingCandidateVoice[];
  readonly drop2: Drop2TransformEvidence | null;
  readonly rawGenerationOrdinal: number;
  canonicalIdentityKey: string | null;
  candidate: VoicingCandidate | null;
};

type SelectionSuccess = Readonly<{
  slots: readonly SelectedDegreeSlot[];
  template: Exclude<VoicingFamilyTemplate, { availability: "unavailable" }>;
  registerPolicy: VoicingFamilyRegisterPolicy;
}>;

type SelectionFailure = Readonly<{
  selectionFailed: true;
  limit: VoicingWorkLimitExceededRefusal | null;
}>;

type ConstraintObservationRecorder = (
  constraint: UnsatisfiedVoicingConstraint,
) => VoicingWorkLimitExceededRefusal | null;

type TemplateSlotVisitor = () => VoicingWorkLimitExceededRefusal | null;

type CandidateSearchResult =
  | Readonly<{
      ok: true;
      candidates: RawCandidateRecord[];
    }>
  | Readonly<{
      ok: false;
      refusal: VoicingWorkLimitExceededRefusal;
    }>;

function zeroStoredEvidence(): StoredVoicingBypassEvidence {
  return Object.freeze({
    realizationDegreeRecordsVisited: 0,
    templateRowsVisited: 0,
    templateDegreeSlotsVisited: 0,
    registerPlacementsVisited: 0,
    searchStatesExpanded: 0,
    structuralTransformsAttempted: 0,
    hardConstraintChecks: 0,
    rawCandidatesProduced: 0,
    candidateCanonicalizations: 0,
    duplicateCandidateComparisons: 0,
    localScoresComputed: 0,
    orderingComparisons: 0,
    retainedCandidatesProduced: 0,
    outputVoicesProduced: 0,
    constraintObservationComparisons: 0,
    constraintObservationsProduced: 0,
    peakRegisterPlacementRecords: 0,
    peakSearchStateRecords: 0,
    peakRawCandidateRecords: 0,
    peakRawVoiceRecords: 0,
    peakRetainedCandidateRecords: 0,
    peakOutputVoiceRecords: 0,
    peakTrackedRecords: 0,
    peakConstraintObservationRecords: 0,
    termination: "complete-bypass",
  });
}

function copyDegree(degree: ChordDegree): ChordDegree {
  return Object.freeze({ number: degree.number, alter: degree.alter });
}

function copyPitchClass(pitch: SpelledPitchClass): SpelledPitchClass {
  return Object.freeze({ step: pitch.step, alter: pitch.alter });
}

function copyAutoVoicing(policy: AutoVoicing): AutoVoicing {
  return deepFreezeOwned({
    mode: "auto",
    family: policy.family,
    voiceCount: policy.voiceCount,
    range: {
      lowMidi: policy.range.lowMidi,
      highMidi: policy.range.highMidi,
    },
    bassPolicy: policy.bassPolicy,
  }) as AutoVoicing;
}

function storedResult<Source extends StoredVoicing>(
  request: StoredVoicingRequest<Source>,
): StoredVoicingResult<Source> {
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schema: VOICING_RESULT_SCHEMA,
      kind: "stored-bypass",
      voicing: request.voicing,
      candidateGenerationPerformed: false,
      rawCandidateCount: 0,
      retainedCandidateCount: 0,
    }),
    evidence: zeroStoredEvidence(),
  });
}

function failure(
  ledger: Ledger,
  refusal: VoicingRefusal,
  termination: Exclude<
    VoicingTermination,
    "complete-generated" | "complete-bypass"
  >,
): GeneratedVoicingResult {
  return deepFreezeOwned({
    ok: false,
    refusal,
    evidence: ledger.snapshot(termination),
  }) as GeneratedVoicingResult;
}

function limitFailure(
  ledger: Ledger,
  refusal: VoicingWorkLimitExceededRefusal,
): GeneratedVoicingResult {
  return failure(ledger, refusal, "work-limit-exceeded");
}

function attempt(
  ledger: Ledger,
  counter: Parameters<Ledger["attemptWork"]>[0],
): VoicingWorkLimitExceededRefusal | null {
  const result = ledger.attemptWork(counter);
  return result.ok ? null : result.refusal;
}

function observe(
  ledger: Ledger,
  counter: Parameters<Ledger["observeMemory"]>[0],
  value: number,
): VoicingWorkLimitExceededRefusal | null {
  const result = ledger.observeMemory(counter, value);
  return result.ok ? null : result.refusal;
}

type TrackedRecordPopulations = Readonly<{
  sourceDegrees: number;
  templateRows: number;
  registerPlacements: number;
  searchStates: number;
  rawCandidates: number;
  rawVoices: number;
  retainedCandidates: number;
  outputVoices: number;
  constraintObservations: number;
}>;

function observeTrackedRecords(
  ledger: Ledger,
  populations: TrackedRecordPopulations,
): VoicingWorkLimitExceededRefusal | null {
  return observe(
    ledger,
    "peakTrackedRecords",
    populations.sourceDegrees +
      populations.templateRows +
      populations.registerPlacements +
      populations.searchStates +
      populations.rawCandidates +
      populations.rawVoices +
      populations.retainedCandidates +
      populations.outputVoices +
      populations.constraintObservations,
  );
}

function contextInvalidRefusal(
  reason: QuartalContextInvalidReason,
  index?: number,
): QuartalContextInvalidRefusal {
  return Object.freeze({
    code: "voicing.quartal_context_invalid",
    path:
      index === undefined
        ? QUARTAL_CONTEXT_PATH
        : Object.freeze(["quartalContext", "degreeSequence", index] as const),
    reason,
  });
}

function validateQuartalContext(
  request: AutoVoicingRequest,
  sourceDegrees: VoicingSourceDegreeFacts,
):
  | QuartalContextUnexpectedRefusal
  | QuartalContextRequiredRefusal
  | QuartalContextInvalidRefusal
  | null {
  const context = request.quartalContext as QuartalContext | null | undefined;
  if (request.policy.family !== "quartal") {
    if (context !== null && context !== undefined) {
      return Object.freeze({
        code: "voicing.quartal_context_unexpected",
        path: QUARTAL_CONTEXT_PATH,
        family: request.policy.family,
      });
    }
    return null;
  }

  if (context === null || context === undefined) {
    return Object.freeze({
      code: "voicing.quartal_context_required",
      path: QUARTAL_CONTEXT_PATH,
      family: "quartal",
      policyId: QUARTAL_CONTEXT_POLICY_ID,
      policyVersion: QUARTAL_CONTEXT_POLICY_VERSION,
    });
  }
  const runtimeContext = context as Readonly<{
    schema?: unknown;
    policyId?: unknown;
    policyVersion?: unknown;
    evidenceId?: unknown;
    evidenceVersion?: unknown;
    degreeSequence?: unknown;
  }>;
  if (runtimeContext.schema !== QUARTAL_CONTEXT_SCHEMA) {
    return contextInvalidRefusal("schema-mismatch");
  }
  if (runtimeContext.policyId !== QUARTAL_CONTEXT_POLICY_ID) {
    return contextInvalidRefusal("policy-id-mismatch");
  }
  if (runtimeContext.policyVersion !== QUARTAL_CONTEXT_POLICY_VERSION) {
    return contextInvalidRefusal("policy-version-mismatch");
  }
  if (
    typeof runtimeContext.evidenceId !== "string" ||
    !validateVoicingEvidenceIdentifier(runtimeContext.evidenceId).ok
  ) {
    return contextInvalidRefusal("evidence-id-invalid");
  }
  if (
    typeof runtimeContext.evidenceVersion !== "number" ||
    !Number.isSafeInteger(runtimeContext.evidenceVersion) ||
    runtimeContext.evidenceVersion <= 0
  ) {
    return contextInvalidRefusal("evidence-version-invalid");
  }

  const generatedSlash =
    request.policy.bassPolicy === "generated" && request.resolved.bass !== null;
  const expectedDegrees = request.policy.voiceCount - (generatedSlash ? 1 : 0);
  if (
    !Array.isArray(runtimeContext.degreeSequence) ||
    runtimeContext.degreeSequence.length !== expectedDegrees
  ) {
    return contextInvalidRefusal("degree-count-mismatch");
  }

  const bound: VoicingSourceDegreeFact[] = [];
  for (let index = 0; index < runtimeContext.degreeSequence.length; index += 1) {
    const degreeInput: unknown = runtimeContext.degreeSequence[index];
    if (
      degreeInput === undefined ||
      typeof degreeInput !== "object" ||
      degreeInput === null
    ) {
      return contextInvalidRefusal("degree-absent-from-realization", index);
    }
    const number: unknown = Reflect.get(degreeInput, "number");
    const alter: unknown = Reflect.get(degreeInput, "alter");
    if (typeof number !== "number" || typeof alter !== "number") {
      return contextInvalidRefusal("degree-absent-from-realization", index);
    }
    const degree = makeChordDegree({ number, alter });
    if (!degree.ok) {
      return contextInvalidRefusal("degree-absent-from-realization", index);
    }
    const fact = findVoicingSourceDegree(sourceDegrees, degree.value);
    if (fact === null) {
      return contextInvalidRefusal("degree-absent-from-realization", index);
    }
    bound.push(fact);
  }

  for (let index = 1; index < bound.length; index += 1) {
    const lower = bound[index - 1];
    const upper = bound[index];
    if (lower === undefined || upper === undefined) {
      return contextInvalidRefusal("degree-count-mismatch");
    }
    const distance = ((upper.pitchClass - lower.pitchClass) % 12 + 12) % 12;
    if (distance !== 5 && distance !== 6) {
      return contextInvalidRefusal(
        "adjacency-not-perfect-or-augmented-fourth",
        index,
      );
    }
  }
  return null;
}

function constraintObservation(
  code: VoicingConstraintCode,
  reason: VoicingConstraintUnsatisfiedReason,
  degrees: readonly ChordDegree[] = [],
): UnsatisfiedVoicingConstraint {
  return makeUnsatisfiedVoicingConstraint(code, reason, [], degrees, []);
}

function recordConstraintFailure(
  recordConstraint: ConstraintObservationRecorder,
  code: VoicingConstraintCode,
  reason: VoicingConstraintUnsatisfiedReason,
  degrees: readonly ChordDegree[] = [],
): SelectionFailure {
  return Object.freeze({
    selectionFailed: true,
    limit: recordConstraint(constraintObservation(code, reason, degrees)),
  });
}

function recordApplicabilityConstraints(
  refusal: VoicingStaticConstraintsUnsatisfiedRefusal,
  recordConstraint: ConstraintObservationRecorder,
): VoicingWorkLimitExceededRefusal | null {
  for (const reason of refusal.reasons) {
    let constraint: UnsatisfiedVoicingConstraint | null = null;
    switch (reason) {
      case "template-degree-absent":
        constraint = constraintObservation(
          "voicing.constraint.template_degree_membership",
          reason,
          refusal.absentTemplateDegrees ?? [],
        );
        break;
      case "voice-count-below-template-minimum":
      case "voice-count-unsupported":
        constraint = constraintObservation(
          "voicing.constraint.voice_count",
          reason,
        );
        break;
      case "doubling-not-permitted":
        constraint = constraintObservation(
          "voicing.constraint.permitted_doubling",
          reason,
        );
        break;
      case "family-transform-invalid":
        constraint = constraintObservation(
          "voicing.constraint.family_structure",
          reason,
        );
        break;
      case "required-degree-omitted":
      case "guide-tone-omitted":
        // Bass-aware slot selection owns the exact omitted-degree payloads.
        break;
    }
    if (constraint !== null) {
      const limit = recordConstraint(constraint);
      if (limit !== null) return limit;
    }
  }
  return null;
}

function isAdaptiveSlotOmissionRefusal(
  refusal: VoicingStaticConstraintsUnsatisfiedRefusal,
): boolean {
  return refusal.reasons.some(
    (reason) =>
      reason === "required-degree-omitted" ||
      reason === "guide-tone-omitted",
  );
}

function hasVoiceCount(
  template: Exclude<VoicingFamilyTemplate, { availability: "unavailable" }>,
  voiceCount: number,
): boolean {
  return template.permittedVoiceCounts.some((value) => value === voiceCount);
}

function compareOptionalFacts(
  left: VoicingSourceDegreeFact,
  right: VoicingSourceDegreeFact,
): number {
  return compareAdaptiveOptionalDegrees(left.degree, right.degree);
}

function distinctFactsInRealizationOrder(
  sourceDegrees: VoicingSourceDegreeFacts,
  predicate: (fact: VoicingSourceDegreeFact) => boolean,
): readonly VoicingSourceDegreeFact[] {
  const result: VoicingSourceDegreeFact[] = [];
  for (const fact of sourceDegrees) {
    if (!predicate(fact)) continue;
    if (result.some((candidate) => sameChordDegree(candidate.degree, fact.degree))) {
      continue;
    }
    result.push(fact);
  }
  return Object.freeze(result);
}

function countDegreeBearingSlots(request: AutoVoicingRequest): number {
  return (
    request.policy.voiceCount -
    (request.policy.bassPolicy === "generated" && request.resolved.bass !== null
      ? 1
      : 0)
  );
}

function selectAdaptiveSlots(
  request: AutoVoicingRequest,
  sourceDegrees: VoicingSourceDegreeFacts,
  template: Exclude<
    VoicingFamilyTemplate,
    { availability: "unavailable" | "context-gated" }
  >,
  recordConstraint: ConstraintObservationRecorder,
  visitTemplateSlot: TemplateSlotVisitor,
): readonly SelectedDegreeSlot[] | SelectionFailure {
  const slotCount = countDegreeBearingSlots(request);
  const required = distinctFactsInRealizationOrder(
    sourceDegrees,
    (fact) => fact.required || fact.guideTone,
  );

  const selected: SelectedDegreeSlot[] = [];
  const requiredSlotsExposed = Math.min(required.length, slotCount);
  for (let index = 0; index < requiredSlotsExposed; index += 1) {
    const source = required[index];
    if (source === undefined) continue;
    const slotLimit = visitTemplateSlot();
    if (slotLimit !== null) {
      return Object.freeze({ selectionFailed: true, limit: slotLimit });
    }
    selected.push({
      source,
      provenance: "realization",
      templateOrdinal: 0,
    });
  }
  if (required.length > slotCount) {
    const omittedRequired = required
      .slice(slotCount)
      .filter((fact) => fact.required)
      .map((fact) => fact.degree);
    const omittedGuides = required
      .slice(slotCount)
      .filter((fact) => fact.guideTone)
      .map((fact) => fact.degree);
    if (omittedRequired.length > 0) {
      const limit = recordConstraint(
        constraintObservation(
          "voicing.constraint.required_degrees",
          "required-degree-omitted",
          omittedRequired,
        ),
      );
      if (limit !== null) {
        return Object.freeze({ selectionFailed: true, limit });
      }
    }
    if (omittedGuides.length > 0) {
      const limit = recordConstraint(
        constraintObservation(
          "voicing.constraint.guide_tones",
          "guide-tone-omitted",
          omittedGuides,
        ),
      );
      if (limit !== null) {
        return Object.freeze({ selectionFailed: true, limit });
      }
    }
    return Object.freeze({ selectionFailed: true as const, limit: null });
  }

  const selectedKeys = new Set(selected.map(({ source }) => chordDegreeKey(source.degree)));
  const optional = sourceDegrees
    .filter((fact) => fact.optional && !selectedKeys.has(chordDegreeKey(fact.degree)))
    .sort(compareOptionalFacts);
  for (const fact of optional) {
    if (selected.length >= slotCount) break;
    const slotLimit = visitTemplateSlot();
    if (slotLimit !== null) {
      return Object.freeze({ selectionFailed: true, limit: slotLimit });
    }
    selected.push({ source: fact, provenance: "realization", templateOrdinal: 0 });
    selectedKeys.add(chordDegreeKey(fact.degree));
  }

  if (selected.length < slotCount && template.family !== "drop2") {
    for (const degree of [ROOT_DEGREE, NATURAL_FIFTH]) {
      if (selected.length >= slotCount) break;
      const fact = findVoicingSourceDegree(sourceDegrees, degree);
      if (fact === null || fact.guideTone) continue;
      if (!selectedKeys.has(chordDegreeKey(degree))) continue;
      if (selected.some((slot) =>
        slot.provenance === "doubling" && sameChordDegree(slot.source.degree, degree)
      )) {
        continue;
      }
      const slotLimit = visitTemplateSlot();
      if (slotLimit !== null) {
        return Object.freeze({ selectionFailed: true, limit: slotLimit });
      }
      selected.push({
        source: fact,
        provenance: "doubling",
        templateOrdinal: 0,
      });
    }
  }

  if (selected.length < slotCount) {
    return template.family === "drop2"
      ? recordConstraintFailure(
          recordConstraint,
          "voicing.constraint.permitted_doubling",
          "doubling-not-permitted",
        )
      : recordConstraintFailure(
          recordConstraint,
          "voicing.constraint.voice_count",
          "voice-count-unsupported",
        );
  }

  if (template.family === "drop2") {
    const pitchClasses = selected.map(({ source }) => source.pitchClass);
    if (
      request.policy.bassPolicy === "generated" &&
      request.resolved.bass !== null
    ) {
      pitchClasses.push(pitchClassOf(request.resolved.bass));
    }
    if (
      !isDrop2PitchClassSetStructurallyFeasible(
        pitchClasses,
        request.policy.voiceCount,
      )
    ) {
      return recordConstraintFailure(
        recordConstraint,
        "voicing.constraint.family_structure",
        "family-transform-invalid",
      );
    }
  }

  const ordered = [...selected].sort((left, right) => {
    const degreeComparison = compareChordDegreesByVoicingPriority(
      left.source.degree,
      right.source.degree,
    );
    if (degreeComparison !== 0) return degreeComparison;
    if (left.provenance === right.provenance) return 0;
    return left.provenance === "realization" ? -1 : 1;
  });
  return Object.freeze(
    ordered.map((slot, templateOrdinal) =>
      Object.freeze({ ...slot, templateOrdinal }),
    ),
  );
}

function selectFixedSlots(
  sourceDegrees: VoicingSourceDegreeFacts,
  degreeSlots: readonly VoicingTemplateDegreeSlot[],
  degreeBearingSlotCount: number,
  recordConstraint: ConstraintObservationRecorder,
): readonly SelectedDegreeSlot[] | SelectionFailure {
  const absent: ChordDegree[] = [];
  const selected: SelectedDegreeSlot[] = [];
  for (let index = 0; index < degreeSlots.length; index += 1) {
    const slot = degreeSlots[index];
    if (slot === undefined) continue;
    const source = findVoicingSourceDegree(sourceDegrees, slot.degree);
    if (source === null) {
      absent.push(slot.degree);
      continue;
    }
    selected.push(
      Object.freeze({
        source,
        provenance: "realization",
        templateOrdinal: index,
      }),
    );
  }
  if (absent.length > 0) {
    return recordConstraintFailure(
      recordConstraint,
      "voicing.constraint.template_degree_membership",
      "template-degree-absent",
      absent,
    );
  }
  if (selected.length > degreeBearingSlotCount) {
    return recordConstraintFailure(
      recordConstraint,
      "voicing.constraint.required_degrees",
      "required-degree-omitted",
      selected.slice(degreeBearingSlotCount).map(({ source }) => source.degree),
    );
  }
  if (selected.length < degreeBearingSlotCount) {
    return recordConstraintFailure(
      recordConstraint,
      "voicing.constraint.voice_count",
      "voice-count-unsupported",
    );
  }
  return Object.freeze(selected);
}

function absentFixedTemplateDegrees(
  sourceDegrees: VoicingSourceDegreeFacts,
  degreeSlots: readonly VoicingTemplateDegreeSlot[],
): readonly ChordDegree[] {
  return Object.freeze(
    degreeSlots
      .filter(
        (slot) => findVoicingSourceDegree(sourceDegrees, slot.degree) === null,
      )
      .map((slot) => copyDegree(slot.degree)),
  );
}

function selectQuartalSlots(
  request: QuartalAutoVoicingRequest,
  sourceDegrees: VoicingSourceDegreeFacts,
  recordConstraint: ConstraintObservationRecorder,
): readonly SelectedDegreeSlot[] | SelectionFailure {
  const seen = new Set<string>();
  const slots: SelectedDegreeSlot[] = [];
  for (let index = 0; index < request.quartalContext.degreeSequence.length; index += 1) {
    const degree = request.quartalContext.degreeSequence[index];
    if (degree === undefined) continue;
    const key = chordDegreeKey(degree);
    if (seen.has(key)) {
      return recordConstraintFailure(
        recordConstraint,
        "voicing.constraint.permitted_doubling",
        "doubling-not-permitted",
        [degree],
      );
    }
    seen.add(key);
    const source = findVoicingSourceDegree(sourceDegrees, degree);
    if (source === null) {
      return recordConstraintFailure(
        recordConstraint,
        "voicing.constraint.quartal_context",
        "quartal-context-invalid",
        [degree],
      );
    }
    slots.push(
      Object.freeze({
        source,
        provenance: "realization",
        templateOrdinal: index,
      }),
    );
  }
  return Object.freeze(slots);
}

function selectDegreeSlots(
  request: AutoVoicingRequest,
  sourceDegrees: VoicingSourceDegreeFacts,
  template: Exclude<VoicingFamilyTemplate, { availability: "unavailable" }>,
  registerPolicy: VoicingFamilyRegisterPolicy,
  recordConstraint: ConstraintObservationRecorder,
  visitTemplateSlot: TemplateSlotVisitor,
): SelectionSuccess | SelectionFailure {
  const degreeBearingSlotCount = countDegreeBearingSlots(request);
  let commonFailure = false;
  const recordCommonConstraint = (
    constraint: UnsatisfiedVoicingConstraint,
  ): SelectionFailure | null => {
    const limit = recordConstraint(constraint);
    return limit === null
      ? null
      : Object.freeze({ selectionFailed: true, limit });
  };
  const belowMinimum = request.policy.voiceCount < template.minimumVoiceCount;
  const supportedCount = hasVoiceCount(template, request.policy.voiceCount);
  if (belowMinimum) {
    commonFailure = true;
    const failure = recordCommonConstraint(
      constraintObservation(
        "voicing.constraint.voice_count",
        "voice-count-below-template-minimum",
      ),
    );
    if (failure !== null) return failure;
  } else if (!supportedCount) {
    commonFailure = true;
    const failure = recordCommonConstraint(
      constraintObservation(
        "voicing.constraint.voice_count",
        "voice-count-unsupported",
      ),
    );
    if (failure !== null) return failure;
  }
  if (
    (request.resolved.bass !== null && request.policy.bassPolicy === "none") ||
    !template.permittedBassPolicies.some(
      (policy) => policy === request.policy.bassPolicy,
    )
  ) {
    commonFailure = true;
    const failure = recordCommonConstraint(
      constraintObservation(
        "voicing.constraint.bass_policy",
        "bass-policy-unsupported",
      ),
    );
    if (failure !== null) return failure;
  }

  if (!supportedCount) {
    if (template.selectionMode === "fixed-degree-sequence") {
      const absent = absentFixedTemplateDegrees(
        sourceDegrees,
        template.degreeSequence,
      );
      if (absent.length > 0) {
        const failure = recordCommonConstraint(
          constraintObservation(
            "voicing.constraint.template_degree_membership",
            "template-degree-absent",
            absent,
          ),
        );
        if (failure !== null) return failure;
      }
    }
    return Object.freeze({ selectionFailed: true as const, limit: null });
  }

  let slots: readonly SelectedDegreeSlot[] | SelectionFailure;
  switch (template.selectionMode) {
    case "realization-roles":
      slots = selectAdaptiveSlots(
        request,
        sourceDegrees,
        template,
        recordConstraint,
        visitTemplateSlot,
      );
      break;
    case "fixed-degree-sequence":
      slots = selectFixedSlots(
        sourceDegrees,
        template.degreeSequence,
        degreeBearingSlotCount,
        recordConstraint,
      );
      break;
    case "quartal-context-sequence":
      slots = selectQuartalSlots(
        request as QuartalAutoVoicingRequest,
        sourceDegrees,
        recordConstraint,
      );
      break;
  }
  if ("selectionFailed" in slots) return slots;
  if (commonFailure) {
    return Object.freeze({ selectionFailed: true as const, limit: null });
  }

  return Object.freeze({ slots, template, registerPolicy });
}

function remakeVoice(
  voice: RawPlacedVoice | VoicingCandidateVoice,
  ordinal: number,
): VoicingCandidateVoice {
  const common = {
    ordinal,
    pitch: voice.pitch,
    midi: voice.midi,
  };
  switch (voice.provenance) {
    case "realization":
      return Object.freeze({
        ...common,
        provenance: "realization",
        degree: voice.degree,
        sourceDegreeIndex: voice.sourceDegreeIndex,
      });
    case "doubling":
      return Object.freeze({
        ...common,
        provenance: "doubling",
        degree: voice.degree,
        sourceDegreeIndex: voice.sourceDegreeIndex,
      });
    case "slash-bass":
      return Object.freeze({
        ...common,
        provenance: "slash-bass",
        degree: null,
        sourceDegreeIndex: null,
      });
  }
}

function placedDegreeVoice(
  slot: SelectedDegreeSlot,
  placement: SourceDegreeRegisterPlacement,
): RawPlacedVoice {
  const common = {
    ordinal: 0,
    pitch: placement.pitch,
    midi: placement.midi,
    degree: copyDegree(slot.source.degree),
    sourceDegreeIndex: slot.source.sourceDegreeIndex,
    templateOrdinal: slot.templateOrdinal,
  };
  return Object.freeze(
    slot.provenance === "realization"
      ? { ...common, provenance: "realization" as const }
      : { ...common, provenance: "doubling" as const },
  );
}

function placedSlashBassVoice(
  placement: SpelledRegisterPlacement,
): RawPlacedVoice {
  return Object.freeze({
    ordinal: 0,
    pitch: placement.pitch,
    midi: placement.midi,
    provenance: "slash-bass",
    degree: null,
    sourceDegreeIndex: null,
    templateOrdinal: -1,
  });
}

function strictlyAscendingMidi(
  voices: readonly Readonly<{ midi: MidiPitch }>[],
): boolean {
  for (let index = 1; index < voices.length; index += 1) {
    const lower = voices[index - 1];
    const upper = voices[index];
    if (lower === undefined || upper === undefined || lower.midi >= upper.midi) {
      return false;
    }
  }
  return true;
}

function completeSpan(voices: readonly Readonly<{ midi: MidiPitch }>[]): number {
  const lowest = voices[0];
  const highest = voices[voices.length - 1];
  if (lowest === undefined || highest === undefined) return 0;
  return highest.midi - lowest.midi;
}

function hasWideGap(
  voices: readonly Readonly<{ midi: MidiPitch }>[],
  minimum: number,
): boolean {
  for (let index = 1; index < voices.length; index += 1) {
    const lower = voices[index - 1];
    const upper = voices[index];
    if (lower !== undefined && upper !== undefined && upper.midi - lower.midi >= minimum) {
      return true;
    }
  }
  return false;
}

function degreeVoiceFacts(
  voices: readonly VoicingCandidateVoice[],
): readonly VoicingCandidateVoice[] {
  return Object.freeze(voices.filter((voice) => voice.degree !== null));
}

function containsDegreeVoice(
  voices: readonly VoicingCandidateVoice[],
  degree: ChordDegree,
): boolean {
  return voices.some(
    (voice) => voice.degree !== null && sameChordDegree(voice.degree, degree),
  );
}

function effectiveExternalBass(request: AutoVoicingRequest): SpelledPitchClass | null {
  if (request.policy.bassPolicy !== "external") return null;
  return copyPitchClass(request.resolved.bass ?? request.resolved.source.root);
}

function selectedRequiredDegrees(
  selection: SelectionSuccess,
  sourceDegrees: VoicingSourceDegreeFacts,
): readonly ChordDegree[] {
  if (selection.template.selectionMode === "realization-roles") {
    return Object.freeze(
      sourceDegrees.filter((fact) => fact.required).map((fact) => fact.degree),
    );
  }
  return Object.freeze(selection.slots.map((slot) => slot.source.degree));
}

function selectedGuideDegrees(
  selection: SelectionSuccess,
  sourceDegrees: VoicingSourceDegreeFacts,
): readonly ChordDegree[] {
  if (selection.template.selectionMode === "realization-roles") {
    return Object.freeze(
      sourceDegrees.filter((fact) => fact.guideTone).map((fact) => fact.degree),
    );
  }
  if (selection.template.selectionMode === "fixed-degree-sequence") {
    return Object.freeze(
      selection.template.degreeSequence
        .filter((slot) => slot.guideTone)
        .map((slot) => slot.degree),
    );
  }
  return Object.freeze([]);
}

function permittedDoublingIsValid(
  voices: readonly VoicingCandidateVoice[],
  selection: SelectionSuccess,
): boolean {
  const doublingVoices = voices.filter((voice) => voice.provenance === "doubling");
  if (selection.template.family === "drop2" || selection.template.family === "quartal") {
    return doublingVoices.length === 0;
  }
  if (selection.template.selectionMode === "fixed-degree-sequence") {
    return doublingVoices.length === 0;
  }
  for (const doubling of doublingVoices) {
    const original = voices.find(
      (voice) =>
        voice.provenance === "realization" &&
        sameChordDegree(voice.degree, doubling.degree),
    );
    if (original === undefined || doubling.midi - original.midi !== 12) {
      return false;
    }
    if (
      !sameChordDegree(doubling.degree, ROOT_DEGREE) &&
      !sameChordDegree(doubling.degree, NATURAL_FIFTH)
    ) {
      return false;
    }
  }
  return true;
}

function quartalRegisterIsValid(
  voices: readonly VoicingCandidateVoice[],
  request: AutoVoicingRequest,
): boolean {
  if (request.policy.family !== "quartal") return true;
  const degreeVoices = voices.filter((voice) => voice.degree !== null);
  for (let index = 1; index < degreeVoices.length; index += 1) {
    const lower = degreeVoices[index - 1];
    const upper = degreeVoices[index];
    if (lower === undefined || upper === undefined) return false;
    const distance = upper.midi - lower.midi;
    if (distance !== 5 && distance !== 6) return false;
  }
  return true;
}

function familyStructureIsValid(
  voices: readonly VoicingCandidateVoice[],
  selection: SelectionSuccess,
  drop2Present: boolean,
): boolean {
  const span = completeSpan(voices);
  const policy = selection.registerPolicy;
  if (span < policy.minimumSpanSemitones || span > policy.maximumSpanSemitones) {
    return false;
  }
  if (
    policy.minimumWideGapSemitones !== null &&
    policy.minimumWideGapVoiceCounts.some(
      (voiceCount) => voiceCount === voices.length,
    ) &&
    !hasWideGap(voices, policy.minimumWideGapSemitones)
  ) {
    return false;
  }
  if (selection.template.family === "drop2" && !drop2Present) return false;
  return true;
}

type HardCheckResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      reason: "constraints";
    }>
  | Readonly<{
      ok: false;
      reason: "limit";
      limit: VoicingWorkLimitExceededRefusal;
    }>;

type HardConstraintCheckResult = UnsatisfiedVoicingConstraint | false | null;

function hardConstraintObservation(
  code: VoicingConstraintCode,
  reason: VoicingConstraintUnsatisfiedReason,
  affectedVoices: readonly VoicingCandidateVoice[] = [],
  affectedDegrees: readonly ChordDegree[] = [],
): UnsatisfiedVoicingConstraint {
  const voices = [...affectedVoices].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  return makeUnsatisfiedVoicingConstraint(
    code,
    reason,
    voices.map((voice) => voice.ordinal),
    affectedDegrees.length > 0
      ? affectedDegrees
      : voices.flatMap((voice) =>
          voice.degree === null ? [] : [voice.degree],
        ),
    voices.map((voice) => voice.midi),
  );
}

function voicesAtOrdinals(
  voices: readonly VoicingCandidateVoice[],
  ordinals: ReadonlySet<number>,
): readonly VoicingCandidateVoice[] {
  return Object.freeze(
    voices.filter((voice) => ordinals.has(voice.ordinal)),
  );
}

function duplicateMidiVoices(
  voices: readonly VoicingCandidateVoice[],
): readonly VoicingCandidateVoice[] {
  const midiCounts = new Map<MidiPitch, number>();
  for (const voice of voices) {
    midiCounts.set(voice.midi, (midiCounts.get(voice.midi) ?? 0) + 1);
  }
  return Object.freeze(
    voices.filter((voice) => (midiCounts.get(voice.midi) ?? 0) > 1),
  );
}

function invalidDoublingVoices(
  voices: readonly VoicingCandidateVoice[],
  selection: SelectionSuccess,
): readonly VoicingCandidateVoice[] {
  const affectedOrdinals = new Set<number>();
  for (const doubling of voices.filter(
    (voice) => voice.provenance === "doubling",
  )) {
    const original = voices.find(
      (voice) =>
        voice.provenance === "realization" &&
        sameChordDegree(voice.degree, doubling.degree),
    );
    const familyForbidsDoubling =
      selection.template.family === "drop2" ||
      selection.template.family === "quartal" ||
      selection.template.selectionMode === "fixed-degree-sequence";
    const adaptiveDoublingInvalid =
      original === undefined ||
      doubling.midi - original.midi !== 12 ||
      (!sameChordDegree(doubling.degree, ROOT_DEGREE) &&
        !sameChordDegree(doubling.degree, NATURAL_FIFTH));
    if (familyForbidsDoubling || adaptiveDoublingInvalid) {
      affectedOrdinals.add(doubling.ordinal);
      if (original !== undefined) affectedOrdinals.add(original.ordinal);
    }
  }
  return voicesAtOrdinals(voices, affectedOrdinals);
}

function spacingViolationVoices(
  voices: readonly VoicingCandidateVoice[],
): readonly VoicingCandidateVoice[] {
  const affectedOrdinals = new Set<number>();
  for (const violation of lowRegisterSpacingViolations(voices)) {
    affectedOrdinals.add(violation.lowerOrdinal);
    affectedOrdinals.add(violation.upperOrdinal);
  }
  return voicesAtOrdinals(voices, affectedOrdinals);
}

function quartalViolationVoices(
  voices: readonly VoicingCandidateVoice[],
  request: AutoVoicingRequest,
): readonly VoicingCandidateVoice[] {
  if (request.policy.family !== "quartal") return Object.freeze([]);
  const degreeVoices = voices.filter((voice) => voice.degree !== null);
  const affectedOrdinals = new Set<number>();
  for (let index = 1; index < degreeVoices.length; index += 1) {
    const lower = degreeVoices[index - 1];
    const upper = degreeVoices[index];
    if (lower === undefined || upper === undefined) continue;
    const distance = upper.midi - lower.midi;
    if (distance !== 5 && distance !== 6) {
      affectedOrdinals.add(lower.ordinal);
      affectedOrdinals.add(upper.ordinal);
    }
  }
  return voicesAtOrdinals(voices, affectedOrdinals);
}

function checkHardConstraints(
  request: AutoVoicingRequest,
  sourceDegrees: VoicingSourceDegreeFacts,
  selection: SelectionSuccess,
  voices: readonly VoicingCandidateVoice[],
  qualityClass: VoicingQualityClass,
  drop2Present: boolean,
  ledger: Ledger,
  recordConstraint: ConstraintObservationRecorder,
  shouldMaterializeConstraint: () => boolean,
): HardCheckResult {
  const requiredDegrees = selectedRequiredDegrees(selection, sourceDegrees);
  const guideDegrees = selectedGuideDegrees(selection, sourceDegrees);
  const authorityIdentityDegrees = getVoicingIdentityDegrees(
    qualityClass,
    request.resolved.source.triad,
  );
  const namedExternalBass = effectiveExternalBass(request);
  const externalNamesRoot =
    namedExternalBass !== null &&
    pitchClassOf(namedExternalBass) === pitchClassOf(request.resolved.source.root);
  const identityDegrees = authorityIdentityDegrees.filter(
    (degree) =>
      !(
        sameChordDegree(degree, ROOT_DEGREE) &&
        (selection.template.family === "rootless-a" ||
          selection.template.family === "rootless-b" ||
          externalNamesRoot)
      ),
  );
  const externalBass = namedExternalBass;
  const lowest = voices[0];
  const degreeVoices = degreeVoiceFacts(voices);
  const rootPitchClass = pitchClassOf(request.resolved.source.root);
  const materializeConstraint = (
    code: VoicingConstraintCode,
    reason: VoicingConstraintUnsatisfiedReason,
    affectedVoices: readonly VoicingCandidateVoice[] = [],
    affectedDegrees: readonly ChordDegree[] = [],
  ): Exclude<HardConstraintCheckResult, null> =>
    shouldMaterializeConstraint()
      ? hardConstraintObservation(
          code,
          reason,
          affectedVoices,
          affectedDegrees,
        )
      : false;
  const checks: ReadonlyArray<() => HardConstraintCheckResult> = [
    () => {
      const affected = degreeVoices.filter(
        (voice) =>
          voice.degree !== null &&
          findVoicingSourceDegree(sourceDegrees, voice.degree) === null,
      );
      return affected.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.realization_membership",
            "selected-realization-mismatch",
            affected,
          );
    },
    () => {
      const affected = degreeVoices.filter(
        (voice) =>
          voice.degree !== null &&
          !selection.slots.some((slot) =>
            sameChordDegree(slot.source.degree, voice.degree),
          ),
      );
      return affected.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.template_degree_membership",
            "template-degree-absent",
            affected,
          );
    },
    () =>
      voices.length === request.policy.voiceCount
        ? null
        : materializeConstraint(
            "voicing.constraint.voice_count",
            "voice-count-unsupported",
            voices,
          ),
    () => {
      const affected = voices.filter(
        (voice) =>
          voice.midi < request.policy.range.lowMidi ||
          voice.midi > request.policy.range.highMidi,
      );
      return affected.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.midi_range",
            "range-insufficient",
            affected,
          );
    },
    () => {
      const missing = requiredDegrees.filter(
        (degree) => !containsDegreeVoice(voices, degree),
      );
      return missing.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.required_degrees",
            "required-degree-omitted",
            [],
            missing,
          );
    },
    () => {
      const missing = guideDegrees.filter(
        (degree) => !containsDegreeVoice(voices, degree),
      );
      return missing.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.guide_tones",
            "guide-tone-omitted",
            [],
            missing,
          );
    },
    () => {
      const missing = identityDegrees.filter(
        (degree) => !containsDegreeVoice(voices, degree),
      );
      return missing.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.identity_tones",
            "identity-tone-omitted",
            [],
            missing,
          );
    },
    () =>
      (request.resolved.bass === null || request.policy.bassPolicy !== "none") &&
      selection.template.permittedBassPolicies.some(
        (policy) => policy === request.policy.bassPolicy,
      )
        ? null
        : materializeConstraint(
            "voicing.constraint.bass_policy",
            "bass-policy-unsupported",
          ),
    () => {
      if (
        request.policy.bassPolicy !== "generated" ||
        request.resolved.bass === null ||
        (lowest !== undefined &&
          lowest.provenance === "slash-bass" &&
          lowest.pitch.step === request.resolved.bass.step &&
          lowest.pitch.alter === request.resolved.bass.alter)
      ) {
        return null;
      }
      const affectedOrdinals = new Set<number>();
      if (lowest !== undefined) affectedOrdinals.add(lowest.ordinal);
      for (const voice of voices) {
        if (voice.provenance === "slash-bass") {
          affectedOrdinals.add(voice.ordinal);
        }
      }
      return materializeConstraint(
        "voicing.constraint.slash_bass_lowest",
        "slash-bass-unplaceable",
        voicesAtOrdinals(voices, affectedOrdinals),
      );
    },
    () => {
      const affected =
        externalBass === null
          ? []
          : voices.filter(
              (voice) =>
                pitchClassOf(voice.pitch) === pitchClassOf(externalBass),
            );
      return affected.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.external_bass_excluded",
            "external-bass-present",
            affected,
          );
    },
    () => {
      const affected =
        selection.template.family !== "rootless-a" &&
        selection.template.family !== "rootless-b"
          ? []
          : voices.filter(
              (voice) => pitchClassOf(voice.pitch) === rootPitchClass,
            );
      return affected.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.rootless_root_omitted",
            "root-present-in-rootless",
            affected,
          );
    },
    () => {
      const affected = duplicateMidiVoices(voices);
      return affected.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.unique_midi",
            "duplicate-midi",
            affected,
          );
    },
    () => {
      if (permittedDoublingIsValid(voices, selection)) return null;
      return materializeConstraint(
        "voicing.constraint.permitted_doubling",
        "doubling-not-permitted",
        invalidDoublingVoices(voices, selection),
      );
    },
    () => {
      const affected = spacingViolationVoices(voices);
      return affected.length === 0
        ? null
        : materializeConstraint(
            "voicing.constraint.low_register_spacing",
            "low-register-spacing",
            affected,
          );
    },
    () => {
      const familyValid = familyStructureIsValid(
        voices,
        selection,
        drop2Present,
      );
      const generatedRootLowest =
        request.policy.bassPolicy !== "generated" ||
        request.resolved.bass !== null ||
        (lowest !== undefined &&
          lowest.degree !== null &&
          sameChordDegree(lowest.degree, ROOT_DEGREE) &&
          lowest.provenance === "realization");
      if (familyValid && generatedRootLowest) return null;
      return materializeConstraint(
        "voicing.constraint.family_structure",
        "family-transform-invalid",
        familyValid && lowest !== undefined ? [lowest] : voices,
      );
    },
    () => {
      if (quartalRegisterIsValid(voices, request)) return null;
      return materializeConstraint(
        "voicing.constraint.quartal_context",
        "quartal-context-invalid",
        quartalViolationVoices(voices, request),
      );
    },
  ];

  let constraintsSatisfied = true;
  for (const evaluate of checks) {
    const limit = attempt(ledger, "hardConstraintChecks");
    if (limit !== null) {
      return Object.freeze({ ok: false, reason: "limit", limit });
    }
    const constraint = evaluate();
    if (constraint === null) continue;
    constraintsSatisfied = false;
    if (constraint === false) continue;
    const recordingLimit = recordConstraint(constraint);
    if (recordingLimit !== null) {
      return Object.freeze({
        ok: false,
        reason: "limit",
        limit: recordingLimit,
      });
    }
  }
  return constraintsSatisfied
    ? Object.freeze({ ok: true })
    : Object.freeze({ ok: false, reason: "constraints" });
}

function candidateObservationProjection(
  voices: readonly VoicingCandidateVoice[],
): Readonly<{
  ordinals: readonly number[];
  degrees: readonly ChordDegree[];
  midi: readonly MidiPitch[];
}> {
  return Object.freeze({
    ordinals: Object.freeze(voices.map((voice) => voice.ordinal)),
    degrees: Object.freeze(
      voices.flatMap((voice) => (voice.degree === null ? [] : [voice.degree])),
    ),
    midi: Object.freeze(voices.map((voice) => voice.midi)),
  });
}

function makeSatisfiedConstraints(
  voices: readonly VoicingCandidateVoice[],
): VoicingCandidateHardConstraints {
  const projection = candidateObservationProjection(voices);
  const constraints = VOICING_CONSTRAINT_CODES.map((code) =>
    deepFreezeOwned({
      code,
      satisfied: true,
      reason: null,
      voiceOrdinals: projection.ordinals,
      degrees: projection.degrees,
      midiValues: projection.midi,
    }) as SatisfiedVoicingConstraint,
  );
  return Object.freeze(constraints) as VoicingCandidateHardConstraints;
}

function evidenceRecord(
  code: VoicingCandidateEvidence["code"],
  sourceId: string,
  sourceVersion: number,
  voices: readonly VoicingCandidateVoice[],
): VoicingCandidateEvidence {
  if (!validateVoicingEvidenceIdentifier(sourceId).ok) {
    throw new RangeError("V0 attempted to emit an invalid evidence source ID");
  }
  const projection = candidateObservationProjection(voices);
  return deepFreezeOwned({
    code,
    sourceId,
    sourceVersion,
    voiceOrdinals: projection.ordinals,
    degrees: projection.degrees,
  }) as VoicingCandidateEvidence;
}

function makeCandidateEvidence(
  request: AutoVoicingRequest,
  realization: SemanticRealization,
  selection: SelectionSuccess,
  voices: readonly VoicingCandidateVoice[],
): NonQuartalVoicingCandidateEvidenceRecords | QuartalVoicingCandidateEvidenceRecords {
  const base = [
    evidenceRecord(
      "voicing.evidence.quality_classified",
      realization.formulaRuleId,
      1,
      voices,
    ),
    evidenceRecord(
      "voicing.evidence.template_selected",
      selection.template.id,
      VOICING_TEMPLATE_TABLE_VERSION,
      voices,
    ),
    evidenceRecord(
      "voicing.evidence.realization_bound",
      realization.id,
      1,
      voices,
    ),
    evidenceRecord(
      "voicing.evidence.register_enumerated",
      selection.registerPolicy.id,
      VOICING_FAMILY_REGISTER_POLICY_VERSION,
      voices,
    ),
    evidenceRecord(
      "voicing.evidence.family_transform",
      selection.template.id,
      VOICING_TEMPLATE_TABLE_VERSION,
      voices,
    ),
    evidenceRecord(
      "voicing.evidence.constraints_checked",
      VOICING_LOW_REGISTER_POLICY_ID,
      VOICING_LOW_REGISTER_POLICY_VERSION,
      voices,
    ),
    evidenceRecord(
      "voicing.evidence.local_score",
      VOICING_LOCAL_SCORE_POLICY_ID,
      VOICING_LOCAL_SCORE_POLICY_VERSION,
      voices,
    ),
    evidenceRecord(
      "voicing.evidence.stable_retention",
      VOICING_ENGINE_ID,
      VOICING_ENGINE_VERSION,
      voices,
    ),
  ] as const;
  if (request.policy.family !== "quartal") {
    return Object.freeze(base) as NonQuartalVoicingCandidateEvidenceRecords;
  }
  const quartalRequest = request as QuartalAutoVoicingRequest;
  return Object.freeze([
    ...base,
    evidenceRecord(
      "voicing.evidence.quartal_context",
      quartalRequest.quartalContext.evidenceId,
      quartalRequest.quartalContext.evidenceVersion,
      voices,
    ),
  ]) as QuartalVoicingCandidateEvidenceRecords;
}

function makeQuartalAdjacencies(
  request: AutoVoicingRequest,
  voices: readonly VoicingCandidateVoice[],
): readonly QuartalAdjacencyEvidence[] {
  if (request.policy.family !== "quartal") return Object.freeze([]);
  const degreeVoices = voices.filter(
    (voice): voice is Exclude<VoicingCandidateVoice, { degree: null }> =>
      voice.degree !== null,
  );
  const result: QuartalAdjacencyEvidence[] = [];
  for (let index = 1; index < degreeVoices.length; index += 1) {
    const lower = degreeVoices[index - 1];
    const upper = degreeVoices[index];
    if (lower === undefined || upper === undefined) continue;
    const semitones = upper.midi - lower.midi;
    if (semitones !== 5 && semitones !== 6) continue;
    result.push(
      Object.freeze({
        lowerDegree: lower.degree,
        upperDegree: upper.degree,
        lowerPitch: lower.pitch,
        upperPitch: upper.pitch,
        semitones,
        kind: semitones === 5 ? "perfect-fourth" : "augmented-fourth",
      }),
    );
  }
  return Object.freeze(result);
}

function slotOrdinalForVoice(
  selection: SelectionSuccess,
  voice: VoicingCandidateVoice,
): number {
  if (voice.degree === null) return -1;
  const matching = selection.slots.find(
    (slot) =>
      slot.provenance === voice.provenance &&
      slot.source.sourceDegreeIndex === voice.sourceDegreeIndex &&
      sameChordDegree(slot.source.degree, voice.degree),
  );
  if (matching !== undefined) return matching.templateOrdinal;
  const fallback = selection.slots.find(
    (slot) => sameChordDegree(slot.source.degree, voice.degree),
  );
  return fallback?.templateOrdinal ?? 0;
}

function makeLocalScore(
  request: AutoVoicingRequest,
  sourceDegrees: VoicingSourceDegreeFacts,
  selection: SelectionSuccess,
  voices: readonly VoicingCandidateVoice[],
): VoicingLocalScore {
  const degreeVoices = voices.filter((voice) => voice.degree !== null);
  let templateOrderDisplacement = 0;
  for (let observedIndex = 0; observedIndex < degreeVoices.length; observedIndex += 1) {
    const voice = degreeVoices[observedIndex];
    if (voice === undefined) continue;
    templateOrderDisplacement += Math.abs(
      slotOrdinalForVoice(selection, voice) - observedIndex,
    );
  }
  const optionalDegreesOmitted = sourceDegrees.filter(
    (fact) => fact.optional && !containsDegreeVoice(voices, fact.degree),
  ).length;
  const guideToneDoublings = voices.filter(
    (voice) =>
      voice.provenance === "doubling" &&
      sourceDegrees.some(
        (fact) => fact.guideTone && sameChordDegree(fact.degree, voice.degree),
      ),
  ).length;
  const lowest = voices[0];
  const highest = voices[voices.length - 1];
  if (lowest === undefined || highest === undefined) {
    throw new RangeError("V0 candidate score requires nonempty voices");
  }
  return Object.freeze({
    optionalDegreesOmitted,
    nonPreferredDoublings: 0,
    guideToneDoublings,
    templateOrderDisplacement,
    targetSpanDistance: Math.abs(
      completeSpan(voices) - selection.template.targetSpanSemitones,
    ),
    rangeCenterDistanceTwice: Math.abs(
      lowest.midi +
        highest.midi -
        (request.policy.range.lowMidi + request.policy.range.highMidi),
    ),
  });
}

function makeScoredCandidate(
  request: AutoVoicingRequest,
  realization: SemanticRealization,
  sourceDegrees: VoicingSourceDegreeFacts,
  selection: SelectionSuccess,
  qualityClass: VoicingQualityClass,
  voices: readonly VoicingCandidateVoice[],
  drop2: Drop2TransformEvidence | null,
  rawGenerationOrdinal: number,
): VoicingCandidate {
  const degreeVoices = voices.filter(
    (voice): voice is Exclude<VoicingCandidateVoice, { degree: null }> =>
      voice.degree !== null,
  );
  const omittedDegrees = sourceDegrees
    .filter((fact) => !containsDegreeVoice(voices, fact.degree))
    .map((fact) => copyDegree(fact.degree));
  const doubledDegrees = sourceDegrees.flatMap((fact) =>
    voices.flatMap((voice) =>
      voice.provenance === "doubling" &&
      sameChordDegree(voice.degree, fact.degree)
        ? [copyDegree(voice.degree)]
        : [],
    ),
  );
  return deepFreezeOwned({
    schema: VOICING_CANDIDATE_SCHEMA,
    id: VOICING_CANDIDATE_IDS[0],
    engineId: VOICING_ENGINE_ID,
    engineVersion: VOICING_ENGINE_VERSION,
    templateTableId: VOICING_TEMPLATE_TABLE_ID,
    templateTableVersion: VOICING_TEMPLATE_TABLE_VERSION,
    realizationId: realization.id,
    family: request.policy.family,
    rawGenerationOrdinal,
    retainedOrdinal: 0,
    voices,
    pitches: Object.freeze(voices.map((voice) => voice.pitch)),
    hardConstraints: makeSatisfiedConstraints(voices),
    evidence: makeCandidateEvidence(request, realization, selection, voices),
    localScorePolicyId: VOICING_LOCAL_SCORE_POLICY_ID,
    localScorePolicyVersion: VOICING_LOCAL_SCORE_POLICY_VERSION,
    localScore: makeLocalScore(request, sourceDegrees, selection, voices),
    explanation: {
      qualityClass,
      templateId: selection.template.id,
      orderedDegrees: Object.freeze(degreeVoices.map((voice) => voice.degree)),
      omittedDegrees: Object.freeze(omittedDegrees),
      doubledDegrees: Object.freeze(doubledDegrees),
      externalBass: effectiveExternalBass(request),
      drop2,
      quartalAdjacencies: makeQuartalAdjacencies(request, voices),
    },
  }) as VoicingCandidate;
}

function sortAndOrdinalVoices(
  voices: readonly (RawPlacedVoice | VoicingCandidateVoice)[],
): readonly VoicingCandidateVoice[] {
  const sorted = [...voices].sort((left, right) => left.midi - right.midi);
  return Object.freeze(sorted.map((voice, ordinal) => remakeVoice(voice, ordinal)));
}

function cReferenceDegreePitchClass(degree: ChordDegree): number {
  switch (degree.number) {
    case 1:
      return degree.alter;
    case 2:
      return 2 + degree.alter;
    case 3:
      return 4 + degree.alter;
    case 4:
      return 5 + degree.alter;
    case 5:
      return 7 + degree.alter;
    case 6:
      return 9 + degree.alter;
    case 7:
      return 11 + degree.alter;
    case 9:
      return 2 + degree.alter;
    case 11:
      return 5 + degree.alter;
    case 13:
      return 9 + degree.alter;
  }
}

function minimumFixedSlotIntervalSemitones(
  lower: VoicingTemplateDegreeSlot,
  upper: VoicingTemplateDegreeSlot,
): number {
  // Slot lifts are authored against C-reference degree pitch classes. Compare
  // their invariant directed interval, not raw SPN octave numbers: a chromatic
  // transposition moves the written C boundary without changing the recipe.
  return (
    cReferenceDegreePitchClass(upper.degree) +
    12 * upper.minimumOctaveLiftFromPrevious -
    cReferenceDegreePitchClass(lower.degree)
  );
}

function staticPlacementOrderIsValid(
  selection: SelectionSuccess,
  voices: readonly RawPlacedVoice[],
): boolean {
  if (selection.template.selectionMode === "realization-roles") return true;
  if (!strictlyAscendingMidi(voices)) return false;
  if (selection.template.selectionMode !== "fixed-degree-sequence") return true;
  for (let index = 1; index < voices.length; index += 1) {
    const lower = voices[index - 1];
    const upper = voices[index];
    const lowerSlot = selection.template.degreeSequence[index - 1];
    const slot = selection.template.degreeSequence[index];
    if (
      lower === undefined ||
      upper === undefined ||
      lowerSlot === undefined ||
      slot === undefined
    ) {
      return false;
    }
    if (
      upper.midi - lower.midi <
      minimumFixedSlotIntervalSemitones(lowerSlot, slot)
    ) {
      return false;
    }
  }
  return true;
}

function enumerateSelectionPlacements(
  request: AutoVoicingRequest,
  selection: SelectionSuccess,
  sourceDegreeCount: number,
  ledger: Ledger,
  recordConstraint: ConstraintObservationRecorder,
  constraintObservationCount: () => number,
):
  | Readonly<{
      matrix: readonly (readonly SourceDegreeRegisterPlacement[])[];
      slashBassPlacements: readonly SpelledRegisterPlacement[];
      registerPlacementCount: number;
    }>
  | Readonly<{ refusal: VoicingWorkLimitExceededRefusal }>
  | Readonly<{
      placementFailed: true;
      limit: VoicingWorkLimitExceededRefusal | null;
      registerPlacementCount: number;
    }> {
  const cache = new Map<number, readonly SourceDegreeRegisterPlacement[]>();
  let registerPlacementCount = 0;
  const matrix: Array<readonly SourceDegreeRegisterPlacement[]> = [];

  const sampleRegisterPlacementMemory = (
    received: number,
  ): VoicingWorkLimitExceededRefusal | null =>
    observe(ledger, "peakRegisterPlacementRecords", received) ??
    observeTrackedRecords(ledger, {
      sourceDegrees: sourceDegreeCount,
      templateRows: VOICING_TEMPLATE_ROWS.length,
      registerPlacements: received,
      searchStates: 0,
      rawCandidates: 0,
      rawVoices: 0,
      retainedCandidates: 0,
      outputVoices: 0,
      constraintObservations: constraintObservationCount(),
    });

  const acceptRegisterPlacement = (
    allocate: () => void,
  ): VoicingWorkLimitExceededRefusal | null => {
    const workLimit = attempt(ledger, "registerPlacementsVisited");
    if (workLimit !== null) return workLimit;
    const received = registerPlacementCount + 1;
    const prospectiveMemoryLimit = sampleRegisterPlacementMemory(received);
    if (prospectiveMemoryLimit !== null) return prospectiveMemoryLimit;
    allocate();
    registerPlacementCount = received;
    return sampleRegisterPlacementMemory(registerPlacementCount);
  };

  for (const slot of selection.slots) {
    let placements = cache.get(slot.source.sourceDegreeIndex);
    if (placements === undefined) {
      const collected: SourceDegreeRegisterPlacement[] = [];
      const placementLimit = visitSpelledRegisterPlacementValues(
        slot.source.spelledPitchClass,
        request.policy.range,
        (pitch, midi) =>
          acceptRegisterPlacement(() => {
            collected.push(
              Object.freeze({
                pitch,
                midi,
                sourceDegree: slot.source,
              }),
            );
          }),
      );
      if (placementLimit !== null) {
        return Object.freeze({ refusal: placementLimit });
      }
      placements = Object.freeze(collected);
      cache.set(slot.source.sourceDegreeIndex, placements);
    }
    if (placements.length === 0) {
      return Object.freeze({
        placementFailed: true,
        limit: recordConstraint(
          constraintObservation(
            "voicing.constraint.midi_range",
            "range-insufficient",
            [slot.source.degree],
          ),
        ),
        registerPlacementCount,
      });
    }
    matrix.push(placements);
  }
  let slashBassPlacements: readonly SpelledRegisterPlacement[] = Object.freeze([]);
  if (request.policy.bassPolicy === "generated" && request.resolved.bass !== null) {
    const collected: SpelledRegisterPlacement[] = [];
    const placementLimit = visitSpelledRegisterPlacementValues(
      request.resolved.bass,
      request.policy.range,
      (pitch, midi) =>
        acceptRegisterPlacement(() => {
          collected.push(Object.freeze({ pitch, midi }));
        }),
    );
    if (placementLimit !== null) {
      return Object.freeze({ refusal: placementLimit });
    }
    slashBassPlacements = Object.freeze(collected);
    if (slashBassPlacements.length === 0) {
      return Object.freeze({
        placementFailed: true,
        limit: recordConstraint(
          constraintObservation(
            "voicing.constraint.slash_bass_lowest",
            "slash-bass-unplaceable",
          ),
        ),
        registerPlacementCount,
      });
    }
  }

  return Object.freeze({
    matrix: Object.freeze(matrix),
    slashBassPlacements,
    registerPlacementCount,
  });
}

function searchHasStopped(state: Readonly<{
  limitRefusal: VoicingWorkLimitExceededRefusal | null;
}>): boolean {
  return state.limitRefusal !== null;
}

function isProvisionalConstraintObservationOverflow(
  refusal: VoicingWorkLimitExceededRefusal,
): boolean {
  return (
    refusal.counter === "constraintObservationsProduced" &&
    refusal.maximum === MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS &&
    refusal.received === MAX_VOICING_REFUSAL_CONSTRAINT_OBSERVATIONS + 1
  );
}

function searchCandidates(
  request: AutoVoicingRequest,
  realization: SemanticRealization,
  sourceDegrees: VoicingSourceDegreeFacts,
  selection: SelectionSuccess,
  qualityClass: VoicingQualityClass,
  ledger: Ledger,
  constraintCollector: VoicingConstraintObservationCollector,
): CandidateSearchResult {
  const recordPlacementConstraint: ConstraintObservationRecorder = (
    constraint,
  ) => {
    const recorded = constraintCollector.record(constraint);
    return recorded.ok ? null : recorded.refusal;
  };
  const enumerated = enumerateSelectionPlacements(
    request,
    selection,
    sourceDegrees.length,
    ledger,
    recordPlacementConstraint,
    constraintCollector.size,
  );
  if ("refusal" in enumerated) {
    return Object.freeze({ ok: false, refusal: enumerated.refusal });
  }
  if ("placementFailed" in enumerated) {
    if (enumerated.limit !== null) {
      constraintCollector.clear();
      return Object.freeze({ ok: false, refusal: enumerated.limit });
    }
    const placementPeak =
      observe(
        ledger,
        "peakRegisterPlacementRecords",
        enumerated.registerPlacementCount,
      ) ??
      observeTrackedRecords(ledger, {
        sourceDegrees: sourceDegrees.length,
        templateRows: VOICING_TEMPLATE_ROWS.length,
        registerPlacements: enumerated.registerPlacementCount,
        searchStates: 0,
        rawCandidates: 0,
        rawVoices: 0,
        retainedCandidates: 0,
        outputVoices: 0,
        constraintObservations: constraintCollector.size(),
      });
    if (placementPeak !== null) {
      constraintCollector.clear();
      return Object.freeze({ ok: false, refusal: placementPeak });
    }
    const candidates: RawCandidateRecord[] = [];
    return Object.freeze({
      ok: true,
      candidates,
    });
  }

  const rawCandidates: RawCandidateRecord[] = [];
  const chosen: RawPlacedVoice[] = [];
  const searchState: {
    limitRefusal: VoicingWorkLimitExceededRefusal | null;
    constraintOverflow: VoicingWorkLimitExceededRefusal | null;
  } = { limitRefusal: null, constraintOverflow: null };
  let activeSearchStates = 0;
  let rawVoiceCount = 0;

  const sampleSearchMemory = (): VoicingWorkLimitExceededRefusal | null =>
    observeTrackedRecords(ledger, {
      sourceDegrees: sourceDegrees.length,
      templateRows: VOICING_TEMPLATE_ROWS.length,
      registerPlacements: enumerated.registerPlacementCount,
      searchStates: activeSearchStates,
      rawCandidates: rawCandidates.length,
      rawVoices: rawVoiceCount,
      retainedCandidates: 0,
      outputVoices: 0,
      constraintObservations: constraintCollector.size(),
    });

  const recordSearchConstraint = (
    constraint: UnsatisfiedVoicingConstraint,
  ): VoicingWorkLimitExceededRefusal | null => {
    if (
      rawCandidates.length > 0 ||
      searchState.constraintOverflow !== null ||
      searchState.limitRefusal !== null
    ) {
      return null;
    }
    const recorded = constraintCollector.record(constraint);
    if (!recorded.ok) {
      if (isProvisionalConstraintObservationOverflow(recorded.refusal)) {
        searchState.constraintOverflow = recorded.refusal;
        return null;
      }
      searchState.limitRefusal = recorded.refusal;
      return recorded.refusal;
    }
    if (recorded.value === "accepted") {
      searchState.limitRefusal = sampleSearchMemory();
    }
    return searchState.limitRefusal;
  };

  const releaseSearchState = (): void => {
    if (searchState.limitRefusal === null) {
      searchState.limitRefusal = sampleSearchMemory();
    }
    activeSearchStates -= 1;
  };

  const evaluateComplete = (degreeVoices: readonly RawPlacedVoice[]): void => {
    if (searchState.limitRefusal !== null) return;
    if (!staticPlacementOrderIsValid(selection, degreeVoices)) return;

    const slashChoices: readonly (SpelledRegisterPlacement | null)[] =
      enumerated.slashBassPlacements.length === 0
        ? Object.freeze([null])
        : enumerated.slashBassPlacements;
    for (const slashPlacement of slashChoices) {
      if (searchHasStopped(searchState)) return;
      let sourceVoices: readonly VoicingCandidateVoice[] = sortAndOrdinalVoices(
        slashPlacement === null
          ? degreeVoices
          : [...degreeVoices, placedSlashBassVoice(slashPlacement)],
      );
      let drop2: Drop2TransformEvidence | null = null;
      const transformAttempt = attempt(ledger, "structuralTransformsAttempted");
      if (transformAttempt !== null) {
        searchState.limitRefusal = transformAttempt;
        return;
      }
      if (selection.template.family === "drop2") {
        const transformed = applyDrop2Transform(sourceVoices);
        if (!transformed.ok) {
          recordSearchConstraint(
            constraintObservation(
              "voicing.constraint.family_structure",
              "family-transform-invalid",
            ),
          );
          continue;
        }
        sourceVoices = sortAndOrdinalVoices(transformed.value.voices);
        drop2 = transformed.value.evidence;
      }
      if (!strictlyAscendingMidi(sourceVoices)) {
        const affected = duplicateMidiVoices(sourceVoices);
        recordSearchConstraint(
          hardConstraintObservation(
            "voicing.constraint.unique_midi",
            "duplicate-midi",
            affected,
          ),
        );
        continue;
      }

      const hard = checkHardConstraints(
        request,
        sourceDegrees,
        selection,
        sourceVoices,
        qualityClass,
        drop2 !== null,
        ledger,
        recordSearchConstraint,
        () =>
          rawCandidates.length === 0 &&
          searchState.constraintOverflow === null &&
          searchState.limitRefusal === null,
      );
      if (!hard.ok) {
        if (hard.reason === "limit") {
          searchState.limitRefusal = hard.limit;
          return;
        }
        continue;
      }

      const rawLimit = attempt(ledger, "rawCandidatesProduced");
      if (rawLimit !== null) {
        searchState.limitRefusal = rawLimit;
        return;
      }
      if (rawCandidates.length === 0) {
        constraintCollector.clear();
        searchState.constraintOverflow = null;
      }
      const rawOrdinal = ledger.read("rawCandidatesProduced") - 1;
      rawCandidates.push({
        voices: sourceVoices,
        drop2,
        rawGenerationOrdinal: rawOrdinal,
        canonicalIdentityKey: null,
        candidate: null,
      });
      rawVoiceCount += sourceVoices.length;
      searchState.limitRefusal =
        observe(ledger, "peakRawCandidateRecords", rawCandidates.length) ??
        observe(ledger, "peakRawVoiceRecords", rawVoiceCount) ??
        sampleSearchMemory();
      if (searchState.limitRefusal !== null) return;
    }
  };

  const visit = (slotIndex: number): void => {
    if (searchState.limitRefusal !== null) return;
    const stateLimit = attempt(ledger, "searchStatesExpanded");
    if (stateLimit !== null) {
      searchState.limitRefusal = stateLimit;
      return;
    }
    activeSearchStates += 1;
    searchState.limitRefusal =
      observe(ledger, "peakSearchStateRecords", activeSearchStates) ??
      sampleSearchMemory();
    if (searchState.limitRefusal !== null) {
      activeSearchStates -= 1;
      return;
    }

    if (slotIndex === enumerated.matrix.length) {
      evaluateComplete(Object.freeze([...chosen]));
      releaseSearchState();
      return;
    }
    const slot = selection.slots[slotIndex];
    const placements = enumerated.matrix[slotIndex];
    if (slot !== undefined && placements !== undefined) {
      for (const placement of placements) {
        chosen.push(placedDegreeVoice(slot, placement));
        visit(slotIndex + 1);
        chosen.pop();
        if (searchHasStopped(searchState)) break;
      }
    }
    releaseSearchState();
  };

  visit(0);
  if (searchState.limitRefusal !== null) {
    constraintCollector.clear();
    return Object.freeze({ ok: false, refusal: searchState.limitRefusal });
  }
  const placementReleaseSample = sampleSearchMemory();
  if (placementReleaseSample !== null) {
    constraintCollector.clear();
    return Object.freeze({ ok: false, refusal: placementReleaseSample });
  }
  if (rawCandidates.length > 0) {
    constraintCollector.clear();
    return Object.freeze({
      ok: true,
      candidates: rawCandidates,
    });
  }
  if (searchState.constraintOverflow !== null) {
    const refusal = searchState.constraintOverflow;
    constraintCollector.clear();
    return Object.freeze({ ok: false, refusal });
  }
  return Object.freeze({
    ok: true,
    candidates: rawCandidates,
  });
}

function requireScoredCandidate(raw: RawCandidateRecord): VoicingCandidate {
  if (raw.candidate === null) {
    throw new RangeError("V0 candidate reached ordering before local scoring");
  }
  return raw.candidate;
}

function currentRawVoiceCount(candidates: readonly RawCandidateRecord[]): number {
  return candidates.reduce((count, candidate) => count + candidate.voices.length, 0);
}

function samplePublicationMemory(
  ledger: Ledger,
  sourceDegreeCount: number,
  rawCandidates: readonly RawCandidateRecord[],
  retainedCandidateCount: number,
  outputVoiceCount: number,
): VoicingWorkLimitExceededRefusal | null {
  return observeTrackedRecords(ledger, {
    sourceDegrees: sourceDegreeCount,
    templateRows: VOICING_TEMPLATE_ROWS.length,
    registerPlacements: 0,
    searchStates: 0,
    rawCandidates: rawCandidates.length,
    rawVoices: currentRawVoiceCount(rawCandidates),
    retainedCandidates: retainedCandidateCount,
    outputVoices: outputVoiceCount,
    constraintObservations: 0,
  });
}

function canonicalizeDeduplicateAndScore(
  request: AutoVoicingRequest,
  realization: SemanticRealization,
  sourceDegrees: VoicingSourceDegreeFacts,
  selection: SelectionSuccess,
  qualityClass: VoicingQualityClass,
  candidates: RawCandidateRecord[],
  ledger: Ledger,
): VoicingWorkLimitExceededRefusal | null {
  for (const raw of candidates) {
    const limit = attempt(ledger, "candidateCanonicalizations");
    if (limit !== null) return limit;
    raw.canonicalIdentityKey = candidateIdentityKey(raw.voices);
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined || candidate.canonicalIdentityKey === null) {
      throw new RangeError("V0 raw candidate was not canonicalized");
    }
    for (let earlierIndex = 0; earlierIndex < index; earlierIndex += 1) {
      const earlier = candidates[earlierIndex];
      if (earlier === undefined || earlier.canonicalIdentityKey === null) {
        throw new RangeError("V0 earlier raw candidate was not canonicalized");
      }
      const limit = attempt(ledger, "duplicateCandidateComparisons");
      if (limit !== null) return limit;
      if (earlier.canonicalIdentityKey !== candidate.canonicalIdentityKey) {
        continue;
      }
      const releaseSample = samplePublicationMemory(
        ledger,
        sourceDegrees.length,
        candidates,
        0,
        0,
      );
      if (releaseSample !== null) return releaseSample;
      candidates.splice(index, 1);
      index -= 1;
      break;
    }
  }

  for (const raw of candidates) {
    const limit = attempt(ledger, "localScoresComputed");
    if (limit !== null) return limit;
    raw.candidate = makeScoredCandidate(
      request,
      realization,
      sourceDegrees,
      selection,
      qualityClass,
      raw.voices,
      raw.drop2,
      raw.rawGenerationOrdinal,
    );
  }
  return null;
}

function stableInsertionSort(
  candidates: RawCandidateRecord[],
  ledger: Ledger,
):
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; refusal: VoicingWorkLimitExceededRefusal }> {
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) continue;
    let insertionIndex = index;
    while (insertionIndex > 0) {
      const previous = candidates[insertionIndex - 1];
      if (previous === undefined) break;
      const limit = attempt(ledger, "orderingComparisons");
      if (limit !== null) return Object.freeze({ ok: false, refusal: limit });
      if (
        compareVoicingCandidates(
          requireScoredCandidate(previous),
          requireScoredCandidate(candidate),
        ) <= 0
      ) {
        break;
      }
      candidates[insertionIndex] = previous;
      insertionIndex -= 1;
    }
    candidates[insertionIndex] = candidate;
  }
  return Object.freeze({ ok: true });
}

type CandidatePublicationCloneRoot =
  | VoicingCandidateHardConstraints
  | NonQuartalVoicingCandidateEvidenceRecords
  | QuartalVoicingCandidateEvidenceRecords
  | VoicingLocalScore
  | VoicingCandidateExplanation;

function cloneOwnedChild(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => cloneOwnedChild(child));
  }
  if (value === null || typeof value !== "object") return value;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    clone[key] = cloneOwnedChild(child);
  }
  return clone;
}

function cloneOwnedValue<Value extends CandidatePublicationCloneRoot>(
  value: Value,
): Value {
  return cloneOwnedChild(value) as Value;
}

function cloneOutputVoice(voice: VoicingCandidateVoice): VoicingCandidateVoice {
  const common = {
    ordinal: voice.ordinal,
    pitch: Object.freeze({
      step: voice.pitch.step,
      alter: voice.pitch.alter,
      octave: voice.pitch.octave,
    }),
    midi: voice.midi,
  };
  if (voice.provenance === "slash-bass") {
    return Object.freeze({
      ...common,
      provenance: "slash-bass",
      degree: null,
      sourceDegreeIndex: null,
    });
  }
  return Object.freeze({
    ...common,
    provenance: voice.provenance,
    degree: copyDegree(voice.degree),
    sourceDegreeIndex: voice.sourceDegreeIndex,
  });
}

function candidateVoicesAreBounded(
  voices: readonly VoicingCandidateVoice[],
): voices is VoicingCandidateVoices {
  return voices.length >= 3 && voices.length <= 7;
}

function candidatePitchesAreBounded(
  pitches: readonly SpelledPitch[],
): pitches is VoicingCandidatePitches {
  return pitches.length >= 3 && pitches.length <= 7;
}

function generatedCandidateTupleIsBoundedAndNonEmpty(
  candidates: readonly VoicingCandidate[],
): candidates is GeneratedVoicingCandidates["candidates"] {
  return (
    candidates.length > 0 &&
    candidates.length <= MAX_VOICING_RETAINED_CANDIDATES
  );
}

function publishCandidate(
  raw: RawCandidateRecord,
  retainedOrdinal: number,
  voices: readonly VoicingCandidateVoice[],
): VoicingCandidate {
  const id = VOICING_CANDIDATE_IDS[retainedOrdinal];
  if (id === undefined) {
    throw new RangeError("V0 retained candidate ID exceeded its closed range");
  }
  const candidate = requireScoredCandidate(raw);
  if (
    voices.length !== candidate.voices.length ||
    voices.length < 3 ||
    voices.length > 7
  ) {
    throw new RangeError("V0 publication lost its exact candidate voice count");
  }
  const pitches = Object.freeze(voices.map((voice) => voice.pitch));
  if (!candidateVoicesAreBounded(voices) || !candidatePitchesAreBounded(pitches)) {
    throw new RangeError("V0 publication lost its bounded candidate payload");
  }
  const common = {
    schema: candidate.schema,
    id,
    engineId: candidate.engineId,
    engineVersion: candidate.engineVersion,
    templateTableId: candidate.templateTableId,
    templateTableVersion: candidate.templateTableVersion,
    realizationId: candidate.realizationId,
    rawGenerationOrdinal: candidate.rawGenerationOrdinal,
    retainedOrdinal,
    voices,
    pitches,
    hardConstraints: cloneOwnedValue(candidate.hardConstraints),
    localScorePolicyId: candidate.localScorePolicyId,
    localScorePolicyVersion: candidate.localScorePolicyVersion,
    localScore: cloneOwnedValue(candidate.localScore),
    explanation: cloneOwnedValue(candidate.explanation),
  };
  if (candidate.family === "quartal") {
    return deepFreezeOwned({
      ...common,
      family: "quartal",
      evidence: cloneOwnedValue(candidate.evidence),
    } satisfies Extract<VoicingCandidate, { family: "quartal" }>);
  }
  return deepFreezeOwned({
    ...common,
    family: candidate.family,
    evidence: cloneOwnedValue(candidate.evidence),
  } satisfies Exclude<VoicingCandidate, { family: "quartal" }>);
}

function publishGeneratedResult(
  request: AutoVoicingRequest,
  realization: SemanticRealization,
  sourceDegrees: VoicingSourceDegreeFacts,
  selection: SelectionSuccess,
  qualityClass: VoicingQualityClass,
  candidates: RawCandidateRecord[],
  ledger: Ledger,
): GeneratedVoicingResult {
  const preparationLimit = canonicalizeDeduplicateAndScore(
    request,
    realization,
    sourceDegrees,
    selection,
    qualityClass,
    candidates,
    ledger,
  );
  if (preparationLimit !== null) return limitFailure(ledger, preparationLimit);

  const sorted = stableInsertionSort(candidates, ledger);
  if (!sorted.ok) return limitFailure(ledger, sorted.refusal);

  const retained: VoicingCandidate[] = [];
  let outputVoiceCount = 0;
  const retainedCount = Math.min(
    candidates.length,
    MAX_VOICING_RETAINED_CANDIDATES,
  );
  for (let index = 0; index < retainedCount; index += 1) {
    const raw = candidates[index];
    if (raw === undefined) continue;
    const retainedLimit = attempt(ledger, "retainedCandidatesProduced");
    if (retainedLimit !== null) return limitFailure(ledger, retainedLimit);
    const outputVoices: VoicingCandidateVoice[] = [];
    for (const rawVoice of raw.voices) {
      const voiceLimit = attempt(ledger, "outputVoicesProduced");
      if (voiceLimit !== null) return limitFailure(ledger, voiceLimit);
      outputVoices.push(cloneOutputVoice(rawVoice));
      outputVoiceCount += 1;
      const voiceMemoryLimit =
        observe(ledger, "peakOutputVoiceRecords", outputVoiceCount) ??
        samplePublicationMemory(
          ledger,
          sourceDegrees.length,
          candidates,
          retained.length,
          outputVoiceCount,
        );
      if (voiceMemoryLimit !== null) return limitFailure(ledger, voiceMemoryLimit);
    }
    const candidate = publishCandidate(raw, index, Object.freeze(outputVoices));
    retained.push(candidate);
    const candidateMemoryLimit =
      observe(ledger, "peakRetainedCandidateRecords", retained.length) ??
      samplePublicationMemory(
        ledger,
        sourceDegrees.length,
        candidates,
        retained.length,
        outputVoiceCount,
      );
    if (candidateMemoryLimit !== null) {
      return limitFailure(ledger, candidateMemoryLimit);
    }
  }

  const first = retained[0];
  if (first === undefined) {
    throw new RangeError("V0 generated result requires a retained candidate");
  }
  const candidateTuple = Object.freeze(retained);
  if (!generatedCandidateTupleIsBoundedAndNonEmpty(candidateTuple)) {
    throw new RangeError("V0 generated result exceeded its candidate tuple bound");
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schema: VOICING_RESULT_SCHEMA,
      kind: "generated",
      engineId: VOICING_ENGINE_ID,
      engineVersion: VOICING_ENGINE_VERSION,
      realizationId: realization.id,
      policy: copyAutoVoicing(request.policy),
      rawCandidateCount: ledger.read("rawCandidatesProduced"),
      candidates: candidateTuple,
    }),
    evidence: ledger.snapshot("complete-generated"),
  });
}

function bindMeteredTemplateRow(
  qualityClass: VoicingQualityClass,
  family: AutoVoicing["family"],
  ledger: Ledger,
):
  | Readonly<{ ok: true; template: VoicingFamilyTemplate }>
  | Readonly<{ ok: false; refusal: VoicingWorkLimitExceededRefusal }> {
  for (const row of VOICING_TEMPLATE_ROWS) {
    const limit = attempt(ledger, "templateRowsVisited");
    if (limit !== null) return Object.freeze({ ok: false, refusal: limit });
    if (row.qualityClass === qualityClass && row.family === family) {
      return Object.freeze({ ok: true, template: row });
    }
  }
  throw new RangeError("V0 source authority lost a template-table position");
}

function meterBoundPositionalTemplateSlots(
  request: AutoVoicingRequest,
  template: Exclude<VoicingFamilyTemplate, { availability: "unavailable" }>,
  ledger: Ledger,
): VoicingWorkLimitExceededRefusal | null {
  const slotCount =
    template.selectionMode === "fixed-degree-sequence"
      ? template.degreeSequence.length
      : template.selectionMode === "quartal-context-sequence"
        ? (request as QuartalAutoVoicingRequest).quartalContext.degreeSequence
            .length
        : 0;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const slotLimit = attempt(ledger, "templateDegreeSlotsVisited");
    if (slotLimit !== null) return slotLimit;
  }
  return null;
}

function autoResult(request: AutoVoicingRequest): GeneratedVoicingResult {
  const ledger = createVoicingWorkLedger();
  const constraintCollector = createVoicingConstraintObservationCollector(ledger);
  const recordStaticConstraint: ConstraintObservationRecorder = (constraint) => {
    const recorded = constraintCollector.record(constraint);
    return recorded.ok ? null : recorded.refusal;
  };
  const bound = bindVoicingRealization(request.resolved, request.realizationId);
  if (!bound.ok) {
    return failure(ledger, bound.refusal, "realization-unavailable");
  }
  for (
    let degreeIndex = 0;
    degreeIndex < bound.value.sourceDegrees.length;
    degreeIndex += 1
  ) {
    const degreeLimit = attempt(ledger, "realizationDegreeRecordsVisited");
    if (degreeLimit !== null) return limitFailure(ledger, degreeLimit);
  }
  const sourceMemoryLimit = observe(
    ledger,
    "peakTrackedRecords",
    bound.value.sourceDegrees.length,
  );
  if (sourceMemoryLimit !== null) return limitFailure(ledger, sourceMemoryLimit);

  const contextRefusal = validateQuartalContext(
    request,
    bound.value.sourceDegrees,
  );
  if (contextRefusal !== null) {
    switch (contextRefusal.code) {
      case "voicing.quartal_context_unexpected":
        return failure(ledger, contextRefusal, "quartal-context-unexpected");
      case "voicing.quartal_context_required":
        return failure(ledger, contextRefusal, "quartal-context-required");
      case "voicing.quartal_context_invalid":
        return failure(ledger, contextRefusal, "quartal-context-invalid");
      default:
        throw new RangeError("Unexpected V0 context refusal code");
    }
  }

  const qualityClass = classifyVoicingQuality(
    bound.value.realization.formulaRuleId,
  );
  const boundTemplate = bindMeteredTemplateRow(
    qualityClass,
    request.policy.family,
    ledger,
  );
  if (!boundTemplate.ok) return limitFailure(ledger, boundTemplate.refusal);
  const template = boundTemplate.template;
  const templateMemoryLimit = observeTrackedRecords(ledger, {
    sourceDegrees: bound.value.sourceDegrees.length,
    templateRows: VOICING_TEMPLATE_ROWS.length,
    registerPlacements: 0,
    searchStates: 0,
    rawCandidates: 0,
    rawVoices: 0,
    retainedCandidates: 0,
    outputVoices: 0,
    constraintObservations: constraintCollector.size(),
  });
  if (templateMemoryLimit !== null) {
    return limitFailure(ledger, templateMemoryLimit);
  }
  if (template.availability === "unavailable") {
    const refusal = deepFreezeOwned({
      code: "voicing.family_unavailable",
      path: ["policy", "family"],
      qualityClass,
      formulaRuleId: bound.value.realization.formulaRuleId,
      family: template.family,
      reason: template.reason,
    }) as VoicingRefusal;
    return failure(ledger, refusal, "family-unavailable");
  }

  const registerPolicy = findVoicingRegisterPolicy(template.registerPolicyId);
  const positionalSlotLimit = meterBoundPositionalTemplateSlots(
    request,
    template,
    ledger,
  );
  if (positionalSlotLimit !== null) {
    return limitFailure(ledger, positionalSlotLimit);
  }
  const applicability = assessBoundVoicingApplicability(
    bound.value.realization,
    request.resolved.source.triad,
    request.policy.voiceCount,
    qualityClass,
    Object.freeze({ template, registerPolicy }),
  );
  if (
    applicability.refusal !== null &&
    applicability.refusal.code === "voicing.constraints_unsatisfied" &&
    !isAdaptiveSlotOmissionRefusal(applicability.refusal) &&
    (template.selectionMode !== "realization-roles" ||
      request.policy.voiceCount < template.minimumVoiceCount ||
      !hasVoiceCount(template, request.policy.voiceCount))
  ) {
    let constraintLimit = recordApplicabilityConstraints(
      applicability.refusal,
      recordStaticConstraint,
    );
    if (
      constraintLimit === null &&
      !template.permittedBassPolicies.some(
        (policy) => policy === request.policy.bassPolicy,
      )
    ) {
      constraintLimit = recordStaticConstraint(
        constraintObservation(
          "voicing.constraint.bass_policy",
          "bass-policy-unsupported",
        ),
      );
    }
    if (constraintLimit !== null) {
      constraintCollector.clear();
      return limitFailure(ledger, constraintLimit);
    }
    const constraintMemoryLimit = observeTrackedRecords(ledger, {
      sourceDegrees: bound.value.sourceDegrees.length,
      templateRows: VOICING_TEMPLATE_ROWS.length,
      registerPlacements: 0,
      searchStates: 0,
      rawCandidates: 0,
      rawVoices: 0,
      retainedCandidates: 0,
      outputVoices: 0,
      constraintObservations: constraintCollector.size(),
    });
    if (constraintMemoryLimit !== null) {
      constraintCollector.clear();
      return limitFailure(ledger, constraintMemoryLimit);
    }
    return failure(
      ledger,
      constraintCollector.takeRefusal(),
      "constraints-unsatisfied",
    );
  }
  const selection = selectDegreeSlots(
    request,
    bound.value.sourceDegrees,
    template,
    registerPolicy,
    recordStaticConstraint,
    () => attempt(ledger, "templateDegreeSlotsVisited"),
  );
  if ("selectionFailed" in selection) {
    if (selection.limit !== null) {
      constraintCollector.clear();
      return limitFailure(ledger, selection.limit);
    }
    const constraintMemoryLimit = observeTrackedRecords(ledger, {
      sourceDegrees: bound.value.sourceDegrees.length,
      templateRows: VOICING_TEMPLATE_ROWS.length,
      registerPlacements: 0,
      searchStates: 0,
      rawCandidates: 0,
      rawVoices: 0,
      retainedCandidates: 0,
      outputVoices: 0,
      constraintObservations: constraintCollector.size(),
    });
    if (constraintMemoryLimit !== null) {
      constraintCollector.clear();
      return limitFailure(ledger, constraintMemoryLimit);
    }
    return failure(
      ledger,
      constraintCollector.takeRefusal(),
      "constraints-unsatisfied",
    );
  }
  const searched = searchCandidates(
    request,
    bound.value.realization,
    bound.value.sourceDegrees,
    selection,
    qualityClass,
    ledger,
    constraintCollector,
  );
  if (!searched.ok) return limitFailure(ledger, searched.refusal);
  if (searched.candidates.length === 0) {
    if (constraintCollector.size() === 0) {
      const fallback = constraintObservation(
        "voicing.constraint.family_structure",
        "no-legal-register-placement",
      );
      const overflow = constraintCollector.record(fallback);
      if (!overflow.ok) {
        constraintCollector.clear();
        return limitFailure(ledger, overflow.refusal);
      }
      const fallbackMemoryLimit = observeTrackedRecords(ledger, {
        sourceDegrees: bound.value.sourceDegrees.length,
        templateRows: VOICING_TEMPLATE_ROWS.length,
        registerPlacements: 0,
        searchStates: 0,
        rawCandidates: 0,
        rawVoices: 0,
        retainedCandidates: 0,
        outputVoices: 0,
        constraintObservations: constraintCollector.size(),
      });
      if (fallbackMemoryLimit !== null) {
        constraintCollector.clear();
        return limitFailure(ledger, fallbackMemoryLimit);
      }
    }
    return failure(
      ledger,
      constraintCollector.takeRefusal(),
      "constraints-unsatisfied",
    );
  }
  return publishGeneratedResult(
    request,
    bound.value.realization,
    bound.value.sourceDegrees,
    selection,
    qualityClass,
    searched.candidates,
    ledger,
  );
}

const realizeVoicingImplementation = (
  request: RealizeVoicingRequest,
): RealizeVoicingResult => {
  if (request.kind === "stored") return storedResult(request);
  return autoResult(request);
};

/** Pure synchronous V0 entry point; no clock, randomness, or ambient context. */
export const realizeVoicing = realizeVoicingImplementation as RealizeVoicing;
