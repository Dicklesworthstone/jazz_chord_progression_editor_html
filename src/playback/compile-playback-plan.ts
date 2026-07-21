import {
  makeBeatDuration,
  makeBeatPosition,
  measureCapacity,
  projectSpelledPitch,
  type BeatDuration,
  type BeatPosition,
  type BeatRange,
  type ChordEvent,
  type ChordEventId,
  type DomainPath,
  type DocumentId,
  type MeasureId,
  type Meter,
  type MidiPitch,
  type MidiTick,
  type NonEmptySpelledPitches,
  type SectionId,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../domain";
import type { VoicingCandidate } from "../theory";
import {
  MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS,
  MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS,
  PLAYBACK_ARTICULATION_POLICY_ID,
  PLAYBACK_ARTICULATION_POLICY_VERSION,
  PLAYBACK_EVENT_SCHEMA,
  PLAYBACK_LOOP_POLICY_ID,
  PLAYBACK_LOOP_POLICY_VERSION,
  PLAYBACK_PLAN_COMPILER_ID,
  PLAYBACK_PLAN_COMPILER_VERSION,
  PLAYBACK_PLAN_FIXED_VELOCITY,
  PLAYBACK_PLAN_MEMORY_LIMITS,
  PLAYBACK_PLAN_MIDI_PPQ,
  PLAYBACK_PLAN_MINIMUM_GATE_TICKS,
  PLAYBACK_PLAN_REALIZATION_SCHEMA,
  PLAYBACK_PLAN_RELEASE_GAP_TICKS,
  PLAYBACK_PLAN_REQUEST_SCHEMA,
  PLAYBACK_PLAN_RESULT_SCHEMA,
  PLAYBACK_PLAN_SCHEMA,
  PLAYBACK_PLAN_WORK_LIMITS,
  PLAYBACK_REALIZATION_BINDING_POLICY_ID,
  PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
  PLAYBACK_VELOCITY_POLICY_ID,
  PLAYBACK_VELOCITY_POLICY_VERSION,
  type CompilePlaybackPlanFailure,
  type CompilePlaybackPlanRequest,
  type CompilePlaybackPlanResult,
  type NonEmptyMidiPitches,
  type PlaybackArticulationKind,
  type PlaybackEvent,
  type PlaybackGeneratedCandidateInvalidReason,
  type PlaybackPlan,
  type PlaybackPlanGateRefusal,
  type PlaybackPlanLoopRefusal,
  type PlaybackPlanOperations,
  type PlaybackPlanRealizationRefusal,
  type PlaybackPlanRequestRefusal,
  type PlaybackPlanTermination,
  type PlaybackPlanTimelineRefusal,
  type PlaybackPlanWorkCounterName,
  type PlaybackPlanWorkEvidence,
  type PlaybackPlanWorkLimitRefusal,
  type PlaybackRealizationBinding,
} from "./playback-plan-contract";

type Fraction = Readonly<{ numerator: bigint; denominator: bigint }>;

type SourceEventRecord = {
  readonly sectionId: SectionId;
  readonly measureId: MeasureId;
  readonly eventId: ChordEventId;
  readonly event: ChordEvent;
  readonly sectionIndex: number;
  readonly measureIndex: number;
  readonly eventIndex: number;
  readonly sourceOrdinal: number;
  readonly sourceStart: Fraction;
  readonly sourceDuration: Fraction;
  readonly sourceStartTick: number | null;
  readonly sourceDurationTicks: number | null;
  readonly sourceDurationInput: BeatDuration;
  voicingFailure: VoicingFailureSnapshot | null;
  binding: PlaybackRealizationBinding | null;
  pitches: NonEmptySpelledPitches | null;
};

type BoundSourceEventRecord = SourceEventRecord & Readonly<{
  binding: PlaybackRealizationBinding;
}>;

type WorkCounterName = keyof typeof PLAYBACK_PLAN_WORK_LIMITS;
type MemoryCounterName = keyof typeof PLAYBACK_PLAN_MEMORY_LIMITS;
type PopulationName =
  | "peakSourceEventIdentityRecords"
  | "peakBindingRecords"
  | "peakOutputEventRecords"
  | "peakOutputPitchRecords";

type MutableWorkEvidence = {
  -readonly [Counter in Exclude<
    keyof PlaybackPlanWorkEvidence,
    "termination"
  >]: number;
};

type JsonRecord = Record<string, unknown>;

type AutoVoicingRequestSnapshot = Readonly<{
  resolved: unknown;
  realizationId: string;
  quartalContext: unknown;
}>;
type AutoSourceVoicing = Extract<ChordEvent["voicing"], { mode: "auto" }>;
type VoicingFailureSnapshot = Readonly<{
  code: keyof typeof VOICING_FAILURE_TERMINATIONS;
  termination: (typeof VOICING_FAILURE_TERMINATIONS)[
    keyof typeof VOICING_FAILURE_TERMINATIONS
  ];
}>;

const THEORY_VOICING_REQUEST_SCHEMA =
  "changes.theory.voicing-request.v1";
const THEORY_VOICING_RESULT_SCHEMA = "changes.theory.voicing-result.v1";
const THEORY_VOICING_CANDIDATE_SCHEMA =
  "changes.theory.voicing-candidate.v1";
const THEORY_VOICING_ENGINE_ID = "changes.voicing-candidates";
const THEORY_VOICING_TEMPLATE_TABLE_ID =
  "changes.voicing-family-templates";
const THEORY_VOICING_LOCAL_SCORE_POLICY_ID =
  "changes.voicing-local-score";
const THEORY_VOICING_LOW_REGISTER_POLICY_ID =
  "changes.voicing-low-register-spacing";
const THEORY_RESOLVED_CHORD_SCHEMA = "changes.theory.resolved-chord.v1";
const THEORY_FORMULA_TABLE_ID = "changes.chord-formulas";
const THEORY_DEGREE_SPELLING_POLICY_ID = "changes.degree-spelling";
const THEORY_DEGREE_ROLE_POLICY_ID = "changes.balanced-degree-roles";
const THEORY_QUARTAL_CONTEXT_SCHEMA = "changes.theory.quartal-context.v1";
const THEORY_QUARTAL_CONTEXT_POLICY_ID = "changes.quartal-context-gate";
const THEORY_VOICING_VERSION = 1;
const MAX_CANDIDATE_RAW_ORDINAL = 95;
const MAX_CANDIDATE_RETAINED_ORDINAL = 23;
const MAX_CANDIDATE_VOICES = 7;
const MAX_REALIZATION_DEGREES = 16;
const MAX_DATA_COMPARISON_RECORDS = 65_536;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

const AUTO_REQUEST_KEYS = Object.freeze([
  "schema",
  "kind",
  "resolved",
  "realizationId",
  "policy",
  "quartalContext",
] as const);
const COMPILE_REQUEST_KEYS = Object.freeze([
  "schema",
  "compilerId",
  "compilerVersion",
  "articulationPolicyId",
  "articulationPolicyVersion",
  "loopPolicyId",
  "loopPolicyVersion",
  "velocityPolicyId",
  "velocityPolicyVersion",
  "realizationBindingPolicyId",
  "realizationBindingPolicyVersion",
  "document",
  "realizedVoicings",
  "loop",
] as const);
const AUTO_POLICY_KEYS = Object.freeze([
  "mode",
  "family",
  "voiceCount",
  "range",
  "bassPolicy",
] as const);
const MIDI_RANGE_KEYS = Object.freeze(["lowMidi", "highMidi"] as const);
const RESOLVED_CHORD_KEYS = Object.freeze([
  "schema",
  "formulaTableId",
  "formulaTableVersion",
  "degreeSpellingPolicyId",
  "degreeSpellingPolicyVersion",
  "degreeRolePolicyId",
  "degreeRolePolicyVersion",
  "source",
  "realizations",
  "bass",
  "warnings",
] as const);
const PARSED_CHORD_KEYS = Object.freeze([
  "kind",
  "sourceText",
  "root",
  "triad",
  "sixth",
  "seventh",
  "extensions",
  "additions",
  "alterations",
  "omissions",
  "bass",
  "colorPolicy",
] as const);
const SEMANTIC_REALIZATION_KEYS = Object.freeze([
  "kind",
  "id",
  "formulaRuleId",
  "degrees",
  "requiredDegrees",
  "optionalDegrees",
  "guideToneDegrees",
  "spelledPitchNames",
  "pitchClasses",
] as const);
const QUARTAL_CONTEXT_KEYS = Object.freeze([
  "schema",
  "policyId",
  "policyVersion",
  "evidenceKind",
  "evidenceId",
  "evidenceVersion",
  "degreeSequence",
] as const);
const VOICING_FAILURE_KEYS = Object.freeze([
  "ok",
  "refusal",
  "evidence",
] as const);
const VOICING_FAILURE_EVIDENCE_LIMITS = Object.freeze({
  realizationDegreeRecordsVisited: 16,
  templateRowsVisited: 112,
  templateDegreeSlotsVisited: 784,
  registerPlacementsVisited: 176,
  searchStatesExpanded: 8_192,
  structuralTransformsAttempted: 8_192,
  hardConstraintChecks: 131_072,
  rawCandidatesProduced: 96,
  candidateCanonicalizations: 96,
  duplicateCandidateComparisons: 4_560,
  localScoresComputed: 96,
  orderingComparisons: 4_560,
  retainedCandidatesProduced: 24,
  outputVoicesProduced: 168,
  constraintObservationComparisons: 2_228_224,
  constraintObservationsProduced: 16,
  peakRegisterPlacementRecords: 176,
  peakSearchStateRecords: 512,
  peakRawCandidateRecords: 96,
  peakRawVoiceRecords: 672,
  peakRetainedCandidateRecords: 24,
  peakOutputVoiceRecords: 168,
  peakTrackedRecords: 1_792,
  peakConstraintObservationRecords: 16,
} as const);
const VOICING_FAILURE_EVIDENCE_KEYS = Object.freeze([
  ...Object.keys(VOICING_FAILURE_EVIDENCE_LIMITS),
  "termination",
]);
const AUTO_VOICING_FAMILY_VALUES = Object.freeze([
  "balanced",
  "shell",
  "rootless-a",
  "rootless-b",
  "open",
  "drop2",
  "quartal",
] as const);
const SEMANTIC_REALIZATION_ID_VALUES = Object.freeze([
  "literal",
  "alt-b9-b5",
  "alt-b9-sharp5",
  "alt-sharp9-b5",
  "alt-sharp9-sharp5",
] as const);
const FORMULA_RULE_ID_VALUES = Object.freeze([
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
] as const);

// Version-1 candidates carry both facts independently. P0 correlates those
// carried literals; it does not classify a chord or select a theory row.
const EVIDENCE_SOURCE_QUALITY_CLASS_V1 = Object.freeze({
  "base-major": "major-triad",
  "base-minor": "minor-triad",
  "base-diminished": "diminished-triad",
  "base-augmented": "augmented-triad",
  "base-sus2": "suspended-triad",
  "base-sus4": "suspended-triad",
  "base-power": "power-triad",
  "sixth-major": "major-sixth",
  "sixth-minor": "minor-sixth",
  "seventh-major": "major-seventh",
  "seventh-dominant": "dominant-seventh",
  "seventh-minor": "minor-seventh",
  "seventh-minor-major": "minor-major-seventh",
  "seventh-half-diminished": "half-diminished-seventh",
  "seventh-diminished": "diminished-seventh",
  "seventh-augmented-major": "augmented-major-seventh",
  "extension-major": "major-seventh",
  "extension-dominant": "dominant-seventh",
  "extension-minor": "minor-seventh",
  "extension-suspended-dominant": "suspended-dominant",
  "altered-dominant": "dominant-seventh",
} as const);

const CANDIDATE_KEYS = Object.freeze([
  "schema",
  "id",
  "engineId",
  "engineVersion",
  "templateTableId",
  "templateTableVersion",
  "realizationId",
  "rawGenerationOrdinal",
  "retainedOrdinal",
  "voices",
  "pitches",
  "hardConstraints",
  "localScorePolicyId",
  "localScorePolicyVersion",
  "localScore",
  "explanation",
  "family",
  "evidence",
] as const);
const CANDIDATE_VOICE_KEYS = Object.freeze([
  "ordinal",
  "pitch",
  "midi",
  "provenance",
  "degree",
  "sourceDegreeIndex",
] as const);
const PITCH_KEYS = Object.freeze(["step", "alter", "octave"] as const);
const PITCH_CLASS_KEYS = Object.freeze(["step", "alter"] as const);
const DEGREE_KEYS = Object.freeze(["number", "alter"] as const);
const CONSTRAINT_KEYS = Object.freeze([
  "code",
  "voiceOrdinals",
  "degrees",
  "midiValues",
  "satisfied",
  "reason",
] as const);
const EVIDENCE_KEYS = Object.freeze([
  "code",
  "sourceId",
  "sourceVersion",
  "voiceOrdinals",
  "degrees",
] as const);
const EXPLANATION_KEYS = Object.freeze([
  "qualityClass",
  "templateId",
  "orderedDegrees",
  "omittedDegrees",
  "doubledDegrees",
  "externalBass",
  "drop2",
  "quartalAdjacencies",
] as const);
const DROP2_EXPLANATION_KEYS = Object.freeze([
  "closedSourceMidi",
  "secondFromTopSourceOrdinal",
  "loweredBySemitones",
  "transformedMidi",
] as const);
const QUARTAL_ADJACENCY_KEYS = Object.freeze([
  "lowerDegree",
  "upperDegree",
  "lowerPitch",
  "upperPitch",
  "semitones",
  "kind",
] as const);
const LOCAL_SCORE_KEYS = Object.freeze([
  "optionalDegreesOmitted",
  "nonPreferredDoublings",
  "guideToneDoublings",
  "templateOrderDisplacement",
  "targetSpanDistance",
  "rangeCenterDistanceTwice",
] as const);
const VOICING_CONSTRAINT_CODES = Object.freeze([
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
] as const);
const VOICING_EVIDENCE_CODES = Object.freeze([
  "voicing.evidence.quality_classified",
  "voicing.evidence.template_selected",
  "voicing.evidence.realization_bound",
  "voicing.evidence.register_enumerated",
  "voicing.evidence.family_transform",
  "voicing.evidence.constraints_checked",
  "voicing.evidence.local_score",
  "voicing.evidence.stable_retention",
] as const);
const VOICING_FAILURE_TERMINATIONS = Object.freeze({
  "voicing.realization_unavailable": "realization-unavailable",
  "voicing.quartal_context_unexpected": "quartal-context-unexpected",
  "voicing.quartal_context_required": "quartal-context-required",
  "voicing.quartal_context_invalid": "quartal-context-invalid",
  "voicing.family_unavailable": "family-unavailable",
  "voicing.constraints_unsatisfied": "constraints-unsatisfied",
  "limit.voicing_work_exceeded": "work-limit-exceeded",
} as const);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownKeysMatch(
  value: JsonRecord,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function hasOnlyOwnDataProperties(
  value: JsonRecord,
  expected: readonly string[],
): boolean {
  if (!ownKeysMatch(value, expected)) return false;
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

function isBoundedText(
  value: unknown,
  minimumCodePoints: number,
  maximumCodePoints: number,
  maximumUtf8Bytes = Number.MAX_SAFE_INTEGER,
): value is string {
  if (typeof value !== "string") return false;
  const codePoints = Array.from(value).length;
  return (
    codePoints >= minimumCodePoints &&
    codePoints <= maximumCodePoints &&
    new TextEncoder().encode(value).byteLength <= maximumUtf8Bytes
  );
}

function isSafeIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function isDegree(value: unknown): value is Readonly<{
  number: number;
  alter: number;
}> {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, DEGREE_KEYS)) {
    return false;
  }
  return (
    [1, 2, 3, 4, 5, 6, 7, 9, 11, 13].includes(
      value["number"] as number,
    ) && isSafeIntegerBetween(value["alter"], -2, 2)
  );
}

function isPitchClass(value: unknown): value is SpelledPitchClass {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, PITCH_CLASS_KEYS)) {
    return false;
  }
  return (
    typeof value["step"] === "string" &&
    ["A", "B", "C", "D", "E", "F", "G"].includes(value["step"]) &&
    isSafeIntegerBetween(value["alter"], -4, 4)
  );
}

function isSpelledPitch(value: unknown): value is SpelledPitch {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, PITCH_KEYS)) {
    return false;
  }
  return (
    typeof value["step"] === "string" &&
    ["A", "B", "C", "D", "E", "F", "G"].includes(value["step"]) &&
    isSafeIntegerBetween(value["alter"], -4, 4) &&
    Number.isSafeInteger(value["octave"])
  );
}

function spelledPitchClassNumber(value: SpelledPitchClass): number {
  const natural = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  }[value.step];
  return ((natural + value.alter) % 12 + 12) % 12;
}

function degreeIsIn(value: unknown, degrees: readonly unknown[]): boolean {
  return degrees.some((degree) => sameDegree(value, degree));
}

function parsedChordIsValid(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, PARSED_CHORD_KEYS)) {
    return false;
  }
  if (
    value["kind"] !== "parsed" ||
    !isBoundedText(value["sourceText"], 1, 256) ||
    !isPitchClass(value["root"]) ||
    !["major", "minor", "diminished", "augmented", "sus2", "sus4", "power"].includes(
      String(value["triad"]),
    ) ||
    !(
      value["sixth"] === null ||
      (isDegree(value["sixth"]) && value["sixth"].number === 6)
    ) ||
    !(
      value["seventh"] === null ||
      (typeof value["seventh"] === "string" &&
        ["major", "minor", "diminished"].includes(value["seventh"]))
    ) ||
    !(value["bass"] === null || isPitchClass(value["bass"])) ||
    !["none", "altered-dominant"].includes(String(value["colorPolicy"]))
  ) {
    return false;
  }
  const degreeFields = [
    ["extensions", 1],
    ["additions", 7],
    ["alterations", 8],
  ] as const;
  for (const [field, maximum] of degreeFields) {
    const entries = value[field];
    if (
      !isDataArray(entries, maximum) ||
      !entries.every(isDegree)
    ) {
      return false;
    }
  }
  const omissions = value["omissions"];
  return (
    isDataArray(omissions, 2) &&
    omissions.every((entry) =>
      [1, 2, 3, 4, 5, 6, 7, 9, 11, 13].includes(entry as number)
    )
  );
}

function semanticRealizationIsValid(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, SEMANTIC_REALIZATION_KEYS)
  ) {
    return false;
  }
  const id = value["id"];
  if (
    value["kind"] !== "semantic" ||
    typeof id !== "string" ||
    !SEMANTIC_REALIZATION_ID_VALUES.includes(
      id as (typeof SEMANTIC_REALIZATION_ID_VALUES)[number],
    ) ||
    typeof value["formulaRuleId"] !== "string" ||
    !FORMULA_RULE_ID_VALUES.includes(
      value["formulaRuleId"] as (typeof FORMULA_RULE_ID_VALUES)[number],
    ) ||
    (id === "literal"
      ? value["formulaRuleId"] === "altered-dominant"
      : value["formulaRuleId"] !== "altered-dominant")
  ) {
    return false;
  }
  const degrees = value["degrees"];
  const required = value["requiredDegrees"];
  const optional = value["optionalDegrees"];
  const guides = value["guideToneDegrees"];
  const spellings = value["spelledPitchNames"];
  const pitchClasses = value["pitchClasses"];
  if (
    !isDataArray(degrees, MAX_REALIZATION_DEGREES) ||
    degrees.length === 0 ||
    !degrees.every(isDegree) ||
    !isDataArray(required, MAX_REALIZATION_DEGREES) ||
    !isDataArray(optional, MAX_REALIZATION_DEGREES) ||
    !isDataArray(guides, MAX_REALIZATION_DEGREES) ||
    ![required, optional, guides].every(
      (entries) =>
        entries.length <= degrees.length &&
        entries.every((degree) => isDegree(degree) && degreeIsIn(degree, degrees)),
    ) ||
    !isDataArray(spellings, MAX_REALIZATION_DEGREES) ||
    spellings.length !== degrees.length ||
    !spellings.every(isPitchClass) ||
    !isDataArray(pitchClasses, MAX_REALIZATION_DEGREES) ||
    pitchClasses.length !== degrees.length ||
    !pitchClasses.every(
      (pitchClass, index) =>
        isSafeIntegerBetween(pitchClass, 0, 11) &&
        spelledPitchClassNumber(spellings[index] as SpelledPitchClass) === pitchClass,
    )
  ) {
    return false;
  }
  return true;
}

function theoryWarningIsValid(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, ["code", "path", "degreeNumber", "message"])
  ) {
    return false;
  }
  const path = value["path"];
  return (
    value["code"] === "theory.omission_absent" &&
    isDataArray(path, 2) &&
    path.length === 2 &&
    path[0] === "omissions" &&
    isSafeIntegerBetween(path[1], 0, 1) &&
    value["degreeNumber"] === 3 &&
    typeof value["message"] === "string"
  );
}

function resolvedChordIsValid(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, RESOLVED_CHORD_KEYS)) {
    return false;
  }
  if (
    value["schema"] !== THEORY_RESOLVED_CHORD_SCHEMA ||
    value["formulaTableId"] !== THEORY_FORMULA_TABLE_ID ||
    value["formulaTableVersion"] !== THEORY_VOICING_VERSION ||
    value["degreeSpellingPolicyId"] !== THEORY_DEGREE_SPELLING_POLICY_ID ||
    value["degreeSpellingPolicyVersion"] !== THEORY_VOICING_VERSION ||
    value["degreeRolePolicyId"] !== THEORY_DEGREE_ROLE_POLICY_ID ||
    value["degreeRolePolicyVersion"] !== THEORY_VOICING_VERSION ||
    !parsedChordIsValid(value["source"]) ||
    !(value["bass"] === null || isPitchClass(value["bass"])) ||
    !(
      (value["bass"] === null &&
        (value["source"] as JsonRecord)["bass"] === null) ||
      samePitchClass(
        value["bass"],
        (value["source"] as JsonRecord)["bass"],
      )
    )
  ) {
    return false;
  }
  const realizations = value["realizations"];
  if (
    !isDataArray(realizations, 4) ||
    !realizations.every(semanticRealizationIsValid)
  ) {
    return false;
  }
  const realizationIds = realizations.map((entry) => (entry as JsonRecord)["id"]);
  const literal = realizationIds.length === 1 && realizationIds[0] === "literal";
  const altered =
    realizationIds.length === 4 &&
    sameSequence(
      realizationIds,
      SEMANTIC_REALIZATION_ID_VALUES.slice(1),
      Object.is,
    );
  const warnings = value["warnings"];
  return (
    (literal || altered) &&
    isDataArray(warnings, 1) &&
    warnings.every(theoryWarningIsValid)
  );
}

function autoPolicyIsValid(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, AUTO_POLICY_KEYS)) {
    return false;
  }
  const family = value["family"];
  const range = value["range"];
  if (
    value["mode"] !== "auto" ||
    typeof family !== "string" ||
    !AUTO_VOICING_FAMILY_VALUES.includes(
      family as (typeof AUTO_VOICING_FAMILY_VALUES)[number],
    ) ||
    ![3, 4, 5, 6, 7].includes(value["voiceCount"] as number) ||
    !isRecord(range) ||
    !hasOnlyOwnDataProperties(range, MIDI_RANGE_KEYS) ||
    !isSafeIntegerBetween(range["lowMidi"], 0, 127) ||
    !isSafeIntegerBetween(range["highMidi"], 0, 127) ||
    range["lowMidi"] > range["highMidi"] ||
    !["generated", "external", "none"].includes(String(value["bassPolicy"]))
  ) {
    return false;
  }
  return !["rootless-a", "rootless-b"].includes(family) ||
    value["bassPolicy"] === "external";
}

function quartalContextIsValid(
  value: unknown,
  selected: JsonRecord,
): boolean {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, QUARTAL_CONTEXT_KEYS)) {
    return false;
  }
  const degreeSequence = value["degreeSequence"];
  const selectedDegrees = selected["degrees"];
  return (
    value["schema"] === THEORY_QUARTAL_CONTEXT_SCHEMA &&
    value["policyId"] === THEORY_QUARTAL_CONTEXT_POLICY_ID &&
    value["policyVersion"] === THEORY_VOICING_VERSION &&
    [
      "compatible-chord-scale",
      "declared-modal-template",
      "declared-suspended-template",
    ].includes(String(value["evidenceKind"])) &&
    isBoundedText(value["evidenceId"], 1, 256, 512) &&
    isSafeIntegerBetween(value["evidenceVersion"], 1, Number.MAX_SAFE_INTEGER) &&
    isDataArray(degreeSequence, 7) &&
    degreeSequence.length >= 2 &&
    degreeSequence.length <= 7 &&
    isDataArray(selectedDegrees, MAX_REALIZATION_DEGREES) &&
    degreeSequence.every(
      (degree) => isDegree(degree) && degreeIsIn(degree, selectedDegrees),
    )
  );
}

function isDegreeArray(value: unknown, maximum = MAX_REALIZATION_DEGREES): boolean {
  return (
    isDataArray(value, maximum) &&
    value.every(isDegree)
  );
}

function isBoundedIntegerArray(
  value: unknown,
  minimum: number,
  maximum: number,
): value is readonly number[] {
  return (
    isDataArray(value, MAX_CANDIDATE_VOICES) &&
    value.every((entry) => isSafeIntegerBetween(entry, minimum, maximum))
  );
}

function sameDegree(left: unknown, right: unknown): boolean {
  return (
    isDegree(left) &&
    isDegree(right) &&
    left.number === right.number &&
    left.alter === right.alter
  );
}

function samePitchClass(left: unknown, right: unknown): boolean {
  return (
    isRecord(left) &&
    isRecord(right) &&
    typeof left["step"] === "string" &&
    typeof right["step"] === "string" &&
    left["step"] === right["step"] &&
    left["alter"] === right["alter"]
  );
}

function samePitch(left: unknown, right: unknown): boolean {
  return (
    isSpelledPitch(left) &&
    isSpelledPitch(right) &&
    left.step === right.step &&
    left.alter === right.alter &&
    left.octave === right.octave
  );
}

function sameSequence(
  left: readonly unknown[],
  right: readonly unknown[],
  equal: (leftValue: unknown, rightValue: unknown) => boolean,
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => equal(entry, right[index]))
  );
}

function candidateIdentityIsValid(value: JsonRecord): boolean {
  const retained = value["retainedOrdinal"];
  if (
    typeof value["id"] !== "string" ||
    !/^candidate-(?:00[0-9]|01[0-9]|02[0-3])$/u.test(value["id"]) ||
    !isSafeIntegerBetween(
      value["rawGenerationOrdinal"],
      0,
      MAX_CANDIDATE_RAW_ORDINAL,
    ) ||
    !isSafeIntegerBetween(
      retained,
      0,
      MAX_CANDIDATE_RETAINED_ORDINAL,
    )
  ) {
    return false;
  }
  return value["id"] === `candidate-${retained.toString().padStart(3, "0")}`;
}

function candidateVoiceIsValid(value: unknown, ordinal: number): boolean {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, CANDIDATE_VOICE_KEYS)) {
    return false;
  }
  if (
    value["ordinal"] !== ordinal ||
    !isSpelledPitch(value["pitch"]) ||
    !isSafeIntegerBetween(value["midi"], 0, 127) ||
    !["realization", "doubling", "slash-bass"].includes(
      String(value["provenance"]),
    )
  ) {
    return false;
  }
  const projection = projectSpelledPitch(value["pitch"]);
  if (!projection.ok || projection.value.midi !== value["midi"]) return false;
  if (value["provenance"] === "slash-bass") {
    return value["degree"] === null && value["sourceDegreeIndex"] === null;
  }
  return (
    isDegree(value["degree"]) &&
    isSafeIntegerBetween(
      value["sourceDegreeIndex"],
      0,
      MAX_REALIZATION_DEGREES - 1,
    )
  );
}

function candidateVoicesAreValid(value: JsonRecord): boolean {
  const voices = value["voices"];
  if (
    !isDataArray(voices, MAX_CANDIDATE_VOICES) ||
    voices.length < 3 ||
    voices.length > MAX_CANDIDATE_VOICES
  ) {
    return false;
  }
  let previousMidi = -1;
  for (let index = 0; index < voices.length; index += 1) {
    const voice: unknown = voices[index];
    if (!candidateVoiceIsValid(voice, index) || !isRecord(voice)) return false;
    const midi = voice["midi"];
    if (typeof midi !== "number" || midi <= previousMidi) return false;
    previousMidi = midi;
  }
  return true;
}

function candidatePitchesAreValid(value: JsonRecord): boolean {
  const voices = value["voices"];
  const pitches = value["pitches"];
  return (
    isDataArray(voices, MAX_CANDIDATE_VOICES) &&
    isDataArray(pitches, MAX_CANDIDATE_VOICES) &&
    pitches.length === voices.length &&
    pitches.every((pitch) => {
      if (!isSpelledPitch(pitch)) return false;
      return projectSpelledPitch(pitch).ok;
    })
  );
}

function candidateConstraintsAreValid(value: unknown): boolean {
  if (
    !isDataArray(value, VOICING_CONSTRAINT_CODES.length) ||
    value.length !== VOICING_CONSTRAINT_CODES.length
  ) {
    return false;
  }
  return value.every((entry, index) => {
    if (!isRecord(entry) || !hasOnlyOwnDataProperties(entry, CONSTRAINT_KEYS)) {
      return false;
    }
    return (
      entry["code"] === VOICING_CONSTRAINT_CODES[index] &&
      entry["satisfied"] === true &&
      entry["reason"] === null &&
      isBoundedIntegerArray(entry["voiceOrdinals"], 0, 6) &&
      isDegreeArray(entry["degrees"], MAX_CANDIDATE_VOICES) &&
      isBoundedIntegerArray(entry["midiValues"], 0, 127)
    );
  });
}

function candidateEvidenceIsValid(value: unknown, quartal: boolean): boolean {
  const expectedLength = VOICING_EVIDENCE_CODES.length + (quartal ? 1 : 0);
  if (!isDataArray(value, expectedLength)) return false;
  if (value.length !== expectedLength) return false;
  return value.every((entry, index) => {
    if (!isRecord(entry) || !hasOnlyOwnDataProperties(entry, EVIDENCE_KEYS)) {
      return false;
    }
    const expectedCode =
      index < VOICING_EVIDENCE_CODES.length
        ? VOICING_EVIDENCE_CODES[index]
        : "voicing.evidence.quartal_context";
    return (
      entry["code"] === expectedCode &&
      typeof entry["sourceId"] === "string" &&
      entry["sourceId"].length > 0 &&
      entry["sourceId"].length <= 512 &&
      isSafeIntegerBetween(entry["sourceVersion"], 1, Number.MAX_SAFE_INTEGER) &&
      isBoundedIntegerArray(entry["voiceOrdinals"], 0, 6) &&
      isDegreeArray(entry["degrees"], MAX_CANDIDATE_VOICES)
    );
  });
}

function drop2ExplanationIsValid(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, DROP2_EXPLANATION_KEYS)
  ) {
    return false;
  }
  const closed = value["closedSourceMidi"];
  const transformed = value["transformedMidi"];
  if (
    !isDataArray(closed, MAX_CANDIDATE_VOICES) ||
    closed.length < 4 ||
    !closed.every((midi) => isSafeIntegerBetween(midi, 0, 127)) ||
    !isDataArray(transformed, MAX_CANDIDATE_VOICES) ||
    transformed.length !== closed.length ||
    !transformed.every((midi) => isSafeIntegerBetween(midi, 0, 127))
  ) {
    return false;
  }
  return (
    value["secondFromTopSourceOrdinal"] === closed.length - 2 &&
    value["loweredBySemitones"] === 12
  );
}

function quartalAdjacencyIsValid(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, QUARTAL_ADJACENCY_KEYS) ||
    !isDegree(value["lowerDegree"]) ||
    !isDegree(value["upperDegree"]) ||
    !isSpelledPitch(value["lowerPitch"]) ||
    !isSpelledPitch(value["upperPitch"])
  ) {
    return false;
  }
  return value["semitones"] === 5
    ? value["kind"] === "perfect-fourth"
    : value["semitones"] === 6 && value["kind"] === "augmented-fourth";
}

function candidateExplanationIsValid(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, EXPLANATION_KEYS)) {
    return false;
  }
  return (
    typeof value["qualityClass"] === "string" &&
    VOICING_QUALITY_CLASS_VALUES.includes(
      value["qualityClass"] as (typeof VOICING_QUALITY_CLASS_VALUES)[number],
    ) &&
    typeof value["templateId"] === "string" &&
    value["templateId"].length > 0 &&
    Array.isArray(value["orderedDegrees"]) &&
    value["orderedDegrees"].length >= 2 &&
    isDegreeArray(value["orderedDegrees"], MAX_CANDIDATE_VOICES) &&
    isDegreeArray(value["omittedDegrees"], MAX_REALIZATION_DEGREES) &&
    isDegreeArray(value["doubledDegrees"], 2) &&
    (value["externalBass"] === null || isPitchClass(value["externalBass"])) &&
    (value["drop2"] === null || drop2ExplanationIsValid(value["drop2"])) &&
    isDataArray(value["quartalAdjacencies"], 4) &&
    value["quartalAdjacencies"].every(quartalAdjacencyIsValid)
  );
}

function candidateLocalScoreIsValid(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyOwnDataProperties(value, LOCAL_SCORE_KEYS) &&
    LOCAL_SCORE_KEYS.every((key) =>
      isSafeIntegerBetween(value[key], 0, Number.MAX_SAFE_INTEGER)
    )
  );
}

function invalidGeneratedCandidateReasonUnchecked(
  value: unknown,
): PlaybackGeneratedCandidateInvalidReason | null {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, CANDIDATE_KEYS)) {
    return "shape";
  }
  if (
    value["schema"] !== THEORY_VOICING_CANDIDATE_SCHEMA ||
    typeof value["family"] !== "string" ||
    !AUTO_VOICING_FAMILY_VALUES.includes(
      value["family"] as (typeof AUTO_VOICING_FAMILY_VALUES)[number],
    ) ||
    typeof value["realizationId"] !== "string" ||
    !SEMANTIC_REALIZATION_ID_VALUES.includes(
      value["realizationId"] as (typeof SEMANTIC_REALIZATION_ID_VALUES)[number],
    ) ||
    !Array.isArray(value["voices"]) ||
    !Array.isArray(value["pitches"]) ||
    !Array.isArray(value["hardConstraints"]) ||
    !Array.isArray(value["evidence"]) ||
    !isRecord(value["localScore"]) ||
    !isRecord(value["explanation"])
  ) {
    return "shape";
  }
  if (
    value["engineId"] !== THEORY_VOICING_ENGINE_ID ||
    value["engineVersion"] !== THEORY_VOICING_VERSION ||
    value["templateTableId"] !== THEORY_VOICING_TEMPLATE_TABLE_ID ||
    value["templateTableVersion"] !== THEORY_VOICING_VERSION ||
    value["localScorePolicyId"] !== THEORY_VOICING_LOCAL_SCORE_POLICY_ID ||
    value["localScorePolicyVersion"] !== THEORY_VOICING_VERSION
  ) {
    return "engine-identity";
  }
  if (!candidateIdentityIsValid(value)) return "candidate-identity";
  if (!candidateVoicesAreValid(value)) return "voice-record";
  if (!candidatePitchesAreValid(value)) return "pitch-projection";
  if (
    !candidateConstraintsAreValid(value["hardConstraints"]) ||
    !candidateEvidenceIsValid(value["evidence"], value["family"] === "quartal")
  ) {
    return "constraint-evidence";
  }
  if (
    !candidateLocalScoreIsValid(value["localScore"]) ||
    !candidateExplanationIsValid(value["explanation"])
  ) {
    return "score-or-explanation";
  }
  return null;
}

function invalidGeneratedCandidateReason(
  value: unknown,
): PlaybackGeneratedCandidateInvalidReason | null {
  try {
    return invalidGeneratedCandidateReasonUnchecked(value);
  } catch {
    return "shape";
  }
}

function candidatePitchMismatch(candidate: VoicingCandidate): number | null {
  for (let index = 0; index < candidate.pitches.length; index += 1) {
    const pitch = candidate.pitches[index];
    const voice = candidate.voices[index];
    if (pitch === undefined || voice === undefined || !samePitch(pitch, voice.pitch)) {
      return index;
    }
  }
  return null;
}

function selectedRealization(
  request: AutoVoicingRequestSnapshot,
  realizationId: unknown = request.realizationId,
): JsonRecord | null {
  const requestValue: unknown = request;
  if (!isRecord(requestValue)) return null;
  const resolved = requestValue["resolved"];
  if (!isRecord(resolved) || !Array.isArray(resolved["realizations"])) {
    return null;
  }
  const selected: unknown = resolved["realizations"].find(
    (entry) => isRecord(entry) && entry["id"] === realizationId,
  );
  return isRecord(selected) ? selected : null;
}

function candidateProjection(candidate: VoicingCandidate): Readonly<{
  ordinals: readonly number[];
  degrees: readonly unknown[];
  midi: readonly number[];
}> {
  return {
    ordinals: candidate.voices.map((voice) => voice.ordinal),
    degrees: candidate.voices.flatMap((voice) =>
      voice.degree === null ? [] : [voice.degree]
    ),
    midi: candidate.voices.map((voice) => voice.midi),
  };
}

function candidateProjectionsAreValid(candidate: VoicingCandidate): boolean {
  const projection = candidateProjection(candidate);
  const constraintsValid = candidate.hardConstraints.every((constraint) =>
    sameSequence(constraint.voiceOrdinals, projection.ordinals, Object.is) &&
    sameSequence(constraint.degrees, projection.degrees, sameDegree) &&
    sameSequence(constraint.midiValues, projection.midi, Object.is)
  );
  const evidenceValid = candidate.evidence.every((evidence) =>
    sameSequence(evidence.voiceOrdinals, projection.ordinals, Object.is) &&
    sameSequence(evidence.degrees, projection.degrees, sameDegree)
  );
  return constraintsValid && evidenceValid;
}

function candidateEvidenceSourcesAreValid(
  candidate: VoicingCandidate,
  request: AutoVoicingRequestSnapshot,
  selected: JsonRecord,
): boolean {
  const evidence = candidate.evidence;
  const explanation = candidate.explanation;
  const fixedChecks = [
    evidence[0].sourceId === selected["formulaRuleId"],
    evidence[1].sourceId === explanation.templateId,
    evidence[2].sourceId === candidate.realizationId,
    evidence[4].sourceId === explanation.templateId,
    evidence[5].sourceId === THEORY_VOICING_LOW_REGISTER_POLICY_ID,
    evidence[6].sourceId === THEORY_VOICING_LOCAL_SCORE_POLICY_ID,
    evidence[7].sourceId === THEORY_VOICING_ENGINE_ID,
  ];
  if (!fixedChecks.every(Boolean)) return false;
  if (candidate.family !== "quartal") return evidence.length === 8;
  const context: unknown = request.quartalContext;
  const quartalEvidence = evidence[8];
  return (
    isRecord(context) &&
    quartalEvidence !== undefined &&
    quartalEvidence.sourceId === context["evidenceId"] &&
    quartalEvidence.sourceVersion === context["evidenceVersion"]
  );
}

function candidateFamilyAuthorityIsValid(candidate: VoicingCandidate): boolean {
  const templateId = candidate.explanation.templateId;
  const registerSourceId = candidate.evidence[3].sourceId;
  const expectedRegister = {
    balanced: "balanced-register-v1",
    shell: "fixed-template-register-v1",
    "rootless-a": "fixed-template-register-v1",
    "rootless-b": "fixed-template-register-v1",
    open: "open-register-v1",
    drop2: "drop2-register-v1",
    quartal: "quartal-register-v1",
  }[candidate.family];
  if (registerSourceId !== expectedRegister) return false;
  switch (candidate.family) {
    case "balanced":
      return templateId === "balanced-adaptive-v1";
    case "open":
      return templateId === "open-adaptive-v1";
    case "drop2":
      return templateId === "drop2-adaptive-v1";
    case "shell":
      return templateId.startsWith("shell-") && templateId.endsWith("-v1");
    case "rootless-a":
      return templateId.startsWith("rootless-a-") && templateId.endsWith("-v1");
    case "rootless-b":
      return templateId.startsWith("rootless-b-") && templateId.endsWith("-v1");
    case "quartal":
      return templateId.startsWith("quartal-") && templateId.endsWith("-v1");
  }
}

function candidateIntrinsicEvidenceIsValid(candidate: VoicingCandidate): boolean {
  const evidence = candidate.evidence;
  const formulaSource = evidence[0].sourceId;
  const evidenceRealization = evidence[2].sourceId;
  if (
    evidence.some((entry) => entry.sourceVersion !== THEORY_VOICING_VERSION) ||
    !FORMULA_RULE_ID_VALUES.includes(
      formulaSource as (typeof FORMULA_RULE_ID_VALUES)[number],
    ) ||
    (evidenceRealization === "literal"
      ? formulaSource === "altered-dominant"
      : formulaSource !== "altered-dominant") ||
    EVIDENCE_SOURCE_QUALITY_CLASS_V1[
      formulaSource as keyof typeof EVIDENCE_SOURCE_QUALITY_CLASS_V1
    ] !== candidate.explanation.qualityClass ||
    evidence[1].sourceId !== candidate.explanation.templateId ||
    evidenceRealization !== candidate.realizationId ||
    evidence[4].sourceId !== candidate.explanation.templateId ||
    evidence[5].sourceId !== THEORY_VOICING_LOW_REGISTER_POLICY_ID ||
    evidence[6].sourceId !== THEORY_VOICING_LOCAL_SCORE_POLICY_ID ||
    evidence[7].sourceId !== THEORY_VOICING_ENGINE_ID
  ) {
    return false;
  }
  return candidateFamilyAuthorityIsValid(candidate);
}

function candidateVoicesMatchRequest(
  candidate: VoicingCandidate,
  request: AutoVoicingRequestSnapshot,
  sourceVoicing: AutoSourceVoicing,
  selected: JsonRecord,
): boolean {
  const degrees = selected["degrees"];
  const spellings = selected["spelledPitchNames"];
  const resolved: unknown = request.resolved;
  if (
    !Array.isArray(degrees) ||
    !Array.isArray(spellings) ||
    !isRecord(resolved) ||
    !isRecord(resolved["source"])
  ) {
    return false;
  }
  const namedBass = resolved["bass"];
  let slashBassCount = 0;
  for (let index = 0; index < candidate.voices.length; index += 1) {
    const voice = candidate.voices[index];
    if (
      voice === undefined ||
      voice.midi < sourceVoicing.range.lowMidi ||
      voice.midi > sourceVoicing.range.highMidi
    ) {
      return false;
    }
    if (voice.provenance === "slash-bass") {
      slashBassCount += 1;
      if (index !== 0 || !samePitchClass(voice.pitch, namedBass)) return false;
      continue;
    }
    const degree: unknown = degrees[voice.sourceDegreeIndex];
    const spelling: unknown = spellings[voice.sourceDegreeIndex];
    if (
      !sameDegree(voice.degree, degree) ||
      !samePitchClass(voice.pitch, spelling)
    ) {
      return false;
    }
  }
  if (sourceVoicing.bassPolicy === "generated") {
    return namedBass === null ? slashBassCount === 0 : slashBassCount === 1;
  }
  return slashBassCount === 0;
}

function candidateOmissionAndDoublingExplanationMatches(
  candidate: VoicingCandidate,
  selected: JsonRecord,
): boolean {
  const selectedDegrees = selected["degrees"] as unknown[];
  const omitted = candidate.explanation.omittedDegrees;
  let omittedIndex = 0;
  for (const degree of selectedDegrees) {
    const present = candidate.voices.some((voice) =>
      sameDegree(voice.degree, degree)
    );
    if (!present) {
      if (!sameDegree(omitted[omittedIndex], degree)) return false;
      omittedIndex += 1;
    }
  }
  if (omittedIndex !== omitted.length) return false;

  const doubled = candidate.explanation.doubledDegrees;
  let doubledIndex = 0;
  for (const degree of selectedDegrees) {
    for (const voice of candidate.voices) {
      if (voice.provenance !== "doubling" || !sameDegree(voice.degree, degree)) {
        continue;
      }
      if (!sameDegree(doubled[doubledIndex], voice.degree)) return false;
      doubledIndex += 1;
    }
  }
  return doubledIndex === doubled.length;
}

function candidateDrop2ExplanationMatches(candidate: VoicingCandidate): boolean {
  const drop2 = candidate.explanation.drop2;
  if (candidate.family !== "drop2") return drop2 === null;
  if (drop2 === null) return false;

  const closed = drop2.closedSourceMidi;
  const transformed = drop2.transformedMidi;
  if (
    closed.length !== candidate.voices.length ||
    transformed.length !== candidate.voices.length
  ) {
    return false;
  }
  for (let index = 1; index < closed.length; index += 1) {
    const previous = closed[index - 1];
    const current = closed[index];
    if (previous === undefined || current === undefined || previous >= current) {
      return false;
    }
  }
  const highest = closed.at(-1);
  if (highest === undefined || highest - closed[0] > 11) return false;

  const expectedTransformed: number[] = closed.slice();
  const loweredIndex = drop2.secondFromTopSourceOrdinal;
  const lowered = expectedTransformed[loweredIndex];
  if (lowered === undefined || lowered < drop2.loweredBySemitones) return false;
  expectedTransformed[loweredIndex] = lowered - drop2.loweredBySemitones;
  expectedTransformed.sort((left, right) => left - right);
  if (!sameSequence(expectedTransformed, transformed, Object.is)) return false;
  return transformed.every(
    (midi, index) => candidate.voices[index]?.midi === midi,
  );
}

function candidateQuartalExplanationMatches(candidate: VoicingCandidate): boolean {
  const adjacencies = candidate.explanation.quartalAdjacencies;
  if (candidate.family !== "quartal") return adjacencies.length === 0;
  const degreeVoices = candidate.voices.filter(
    (voice) => voice.degree !== null,
  );
  if (adjacencies.length !== Math.max(0, degreeVoices.length - 1)) {
    return false;
  }
  for (let index = 1; index < degreeVoices.length; index += 1) {
    const lower = degreeVoices[index - 1];
    const upper = degreeVoices[index];
    const adjacency = adjacencies[index - 1];
    if (
      lower === undefined ||
      upper === undefined ||
      adjacency === undefined
    ) {
      return false;
    }
    const semitones = upper.midi - lower.midi;
    if (
      (semitones !== 5 && semitones !== 6) ||
      !sameDegree(adjacency.lowerDegree, lower.degree) ||
      !sameDegree(adjacency.upperDegree, upper.degree) ||
      !samePitch(adjacency.lowerPitch, lower.pitch) ||
      !samePitch(adjacency.upperPitch, upper.pitch) ||
      adjacency.semitones !== semitones ||
      adjacency.kind !==
        (semitones === 5 ? "perfect-fourth" : "augmented-fourth")
    ) {
      return false;
    }
  }
  return true;
}

function candidateOrderedDegreeExplanationMatches(
  candidate: VoicingCandidate,
): boolean {
  let explanationIndex = 0;
  for (const voice of candidate.voices) {
    if (voice.degree === null) continue;
    if (
      !sameDegree(
        candidate.explanation.orderedDegrees[explanationIndex],
        voice.degree,
      )
    ) {
      return false;
    }
    explanationIndex += 1;
  }
  return explanationIndex === candidate.explanation.orderedDegrees.length;
}

function candidateIntrinsicExplanationMatches(
  candidate: VoicingCandidate,
): boolean {
  return (
    candidateOrderedDegreeExplanationMatches(candidate) &&
    candidateDrop2ExplanationMatches(candidate) &&
    candidateQuartalExplanationMatches(candidate)
  );
}

function candidateExplanationMatchesRequest(
  candidate: VoicingCandidate,
  request: AutoVoicingRequestSnapshot,
  sourceVoicing: AutoSourceVoicing,
  selected: JsonRecord,
): boolean {
  if (!candidateOrderedDegreeExplanationMatches(candidate)) return false;
  const resolved: unknown = request.resolved;
  if (!isRecord(resolved) || !isRecord(resolved["source"])) return false;
  const expectedExternal =
    sourceVoicing.bassPolicy === "external"
      ? (resolved["bass"] ?? resolved["source"]["root"])
      : null;
  const externalMatches = expectedExternal === null
    ? candidate.explanation.externalBass === null
    : samePitchClass(candidate.explanation.externalBass, expectedExternal);
  return (
    externalMatches &&
    candidateOmissionAndDoublingExplanationMatches(candidate, selected) &&
    candidateIntrinsicExplanationMatches(candidate)
  );
}

/**
 * Validate only the P0-owned projection of an already-produced V0 candidate.
 * Exact V0/T1 generation remains upstream; playback never calls those engines.
 */
function invalidGeneratedCandidateForRequestReason(
  value: unknown,
  request: AutoVoicingRequestSnapshot,
  sourceVoicing: AutoSourceVoicing,
): PlaybackGeneratedCandidateInvalidReason | null {
  const contextFree = invalidGeneratedCandidateReason(value);
  if (contextFree !== null) return contextFree;
  const candidate = value as VoicingCandidate;

  // Intrinsic authority/evidence forgeries outrank the dedicated count and
  // pitch mismatch diagnostics below; those diagnostics defer only stale
  // projection arrays produced by the reviewed count/pitch substitutions.
  try {
    if (!candidateIntrinsicEvidenceIsValid(candidate)) {
      return "constraint-evidence";
    }
  } catch {
    return "constraint-evidence";
  }

  // The reviewed voice-count and pitch-array substitutions intentionally keep
  // their dedicated P0 refusals even though their copied diagnostic arrays no
  // longer project the shortened/replaced voice surface.
  const candidatePolicyIdentityMatches =
    candidate.realizationId === request.realizationId &&
    candidate.family === sourceVoicing.family;
  if (
    candidatePolicyIdentityMatches &&
    (candidate.voices.length !== sourceVoicing.voiceCount ||
      candidatePitchMismatch(candidate) !== null)
  ) {
    return null;
  }

  if (candidatePolicyIdentityMatches) {
    try {
      const selected = selectedRealization(request);
      if (
        selected === null ||
        !candidateVoicesMatchRequest(candidate, request, sourceVoicing, selected)
      ) {
        return "voice-record";
      }
    } catch {
      return "voice-record";
    }
  }

  // Candidate-internal explanation projections outrank realization/family
  // mismatch, but the dedicated count/pitch and request-owned voice-record
  // refusals above retain their reviewed precedence.
  try {
    if (!candidateIntrinsicExplanationMatches(candidate)) {
      return "constraint-evidence";
    }
  } catch {
    return "constraint-evidence";
  }

  try {
    if (!candidateProjectionsAreValid(candidate)) {
      return "constraint-evidence";
    }
  } catch {
    return "constraint-evidence";
  }

  // The four reviewed, otherwise shape-valid substitutions have dedicated P0
  // refusals. Unknown identities were already rejected by the closed literals
  // above; direct evidence mutations without one of these differences continue
  // into the exact evidence checks below.
  if (
    candidate.realizationId !== request.realizationId ||
    candidate.family !== sourceVoicing.family
  ) {
    return null;
  }

  try {
    const selected = selectedRealization(request, candidate.realizationId);
    if (selected === null) return "voice-record";
    if (!candidateVoicesMatchRequest(candidate, request, sourceVoicing, selected)) {
      return "voice-record";
    }
    if (
      !candidateEvidenceSourcesAreValid(candidate, request, selected)
    ) {
      return "constraint-evidence";
    }
    if (
      !candidateExplanationMatchesRequest(
        candidate,
        request,
        sourceVoicing,
        selected,
      )
    ) {
      return "score-or-explanation";
    }
    return null;
  } catch {
    return "voice-record";
  }
}

function asVoicingCandidate(value: unknown): VoicingCandidate | null {
  return invalidGeneratedCandidateReason(value) === null
    ? (value as VoicingCandidate)
    : null;
}

function sameData(left: unknown, right: unknown): boolean {
  let visited = 0;
  const pairs = new WeakMap<object, WeakSet<object>>();
  function compare(leftValue: unknown, rightValue: unknown): boolean {
    if (Object.is(leftValue, rightValue)) return true;
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      if (!Array.isArray(leftValue) || !Array.isArray(rightValue)) return false;
    } else if (!isRecord(leftValue) || !isRecord(rightValue)) {
      return false;
    }
    const leftObject = leftValue as object;
    const rightObject = rightValue as object;
    const seenRight = pairs.get(leftObject);
    if (seenRight?.has(rightObject) === true) return true;
    if (visited >= MAX_DATA_COMPARISON_RECORDS) return false;
    visited += 1;
    if (seenRight === undefined) {
      pairs.set(leftObject, new WeakSet([rightObject]));
    } else {
      seenRight.add(rightObject);
    }
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      return (
        leftValue.length === rightValue.length &&
        leftValue.every((entry, index) => compare(entry, rightValue[index]))
      );
    }
    const leftRecord = leftValue as JsonRecord;
    const rightRecord = rightValue as JsonRecord;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && compare(leftRecord[key], rightRecord[key]),
      )
    );
  }
  try {
    return compare(left, right);
  } catch {
    return false;
  }
}

function copyPitch(pitch: SpelledPitch): SpelledPitch {
  return Object.freeze({
    step: pitch.step,
    alter: pitch.alter,
    octave: pitch.octave,
  });
}

function deepFreezeOwned<Value>(value: Value): Readonly<Value> {
  const seen = new WeakSet();
  function freeze(current: unknown): void {
    if (typeof current !== "object" || current === null || seen.has(current)) {
      return;
    }
    seen.add(current);
    for (const child of Object.values(current)) freeze(child);
    Object.freeze(current);
  }
  freeze(value);
  return value;
}

const ZERO_FRACTION: Fraction = Object.freeze({
  numerator: 0n,
  denominator: 1n,
});

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let dividend = left < 0n ? -left : left;
  let divisor = right < 0n ? -right : right;
  while (divisor !== 0n) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return dividend;
}

function fraction(numerator: bigint, denominator: bigint): Fraction {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function readBeatFraction(
  value: Readonly<{ numerator: number; denominator: number }>,
  positive: boolean,
): Fraction | null {
  if (
    !Number.isSafeInteger(value.numerator) ||
    !Number.isSafeInteger(value.denominator) ||
    value.denominator <= 0 ||
    value.numerator < (positive ? 1 : 0)
  ) {
    return null;
  }
  return fraction(BigInt(value.numerator), BigInt(value.denominator));
}

function hasExactBeatRecordShape(value: unknown): value is Readonly<{
  numerator: number;
  denominator: number;
}> {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, ["numerator", "denominator"])
  ) {
    return false;
  }
  return (
    typeof value["numerator"] === "number" &&
    typeof value["denominator"] === "number"
  );
}

function addFractions(left: Fraction, right: Fraction): Fraction {
  return fraction(
    left.numerator * right.denominator +
      right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function compareFractions(left: Fraction, right: Fraction): -1 | 0 | 1 {
  const leftProduct = left.numerator * right.denominator;
  const rightProduct = right.numerator * left.denominator;
  if (leftProduct < rightProduct) return -1;
  if (leftProduct > rightProduct) return 1;
  return 0;
}

function midiTicksForFraction(value: Fraction): number | null {
  const scaled = value.numerator * BigInt(PLAYBACK_PLAN_MIDI_PPQ);
  if (scaled % value.denominator !== 0n) return null;
  const ticks = scaled / value.denominator;
  const received = Number(ticks);
  return Number.isSafeInteger(received) && received >= 0 ? received : null;
}

function beatPositionFromFraction(value: Fraction): BeatPosition {
  const result = makeBeatPosition({
    numerator: Number(value.numerator),
    denominator: Number(value.denominator),
  });
  if (!result.ok) {
    throw new Error("P0 internal exact position escaped its validated bounds");
  }
  return result.value;
}

function beatDurationFromFraction(value: Fraction): BeatDuration {
  const result = makeBeatDuration({
    numerator: Number(value.numerator),
    denominator: Number(value.denominator),
  });
  if (!result.ok) {
    throw new Error("P0 internal exact duration escaped its validated bounds");
  }
  return result.value;
}

function beatPositionFromTicks(ticks: number): BeatPosition {
  const result = makeBeatPosition({
    numerator: ticks,
    denominator: PLAYBACK_PLAN_MIDI_PPQ,
  });
  if (!result.ok) {
    throw new Error("P0 internal tick position escaped its validated bounds");
  }
  return result.value;
}

function beatDurationFromTicks(ticks: number): BeatDuration {
  const result = makeBeatDuration({
    numerator: ticks,
    denominator: PLAYBACK_PLAN_MIDI_PPQ,
  });
  if (!result.ok) {
    throw new Error("P0 internal tick duration escaped its validated bounds");
  }
  return result.value;
}

function copyMalformedDuration(value: BeatDuration): BeatDuration {
  const copy = Object.freeze({
    numerator: value.numerator,
    denominator: value.denominator,
  });
  return copy as BeatDuration;
}

function frozenPath(...segments: readonly (string | number)[]): DomainPath {
  return Object.freeze([...segments]);
}

class WorkLedger {
  readonly values: MutableWorkEvidence = {
    sectionsVisited: 0,
    measuresVisited: 0,
    eventsVisited: 0,
    bindingsVisited: 0,
    bindingLookups: 0,
    exactBeatOperations: 0,
    tickProjections: 0,
    loopIntersectionChecks: 0,
    gateCalculations: 0,
    pitchRecordsCopied: 0,
    eventsProduced: 0,
    peakSourceEventIdentityRecords: 0,
    peakBindingRecords: 0,
    peakOutputEventRecords: 0,
    peakOutputPitchRecords: 0,
    peakTrackedRecords: 0,
  };

  private readonly populations: Record<PopulationName, number> = {
    peakSourceEventIdentityRecords: 0,
    peakBindingRecords: 0,
    peakOutputEventRecords: 0,
    peakOutputPitchRecords: 0,
  };

  increment(counter: WorkCounterName): CompilePlaybackPlanFailure | null {
    const received = this.values[counter] + 1;
    const maximum = PLAYBACK_PLAN_WORK_LIMITS[counter];
    if (received > maximum) {
      return workLimitFailure(this, counter, received, maximum);
    }
    this.values[counter] = received;
    return null;
  }

  acceptPopulation(
    counter: PopulationName,
    received: number,
  ): CompilePlaybackPlanFailure | null {
    const maximum = PLAYBACK_PLAN_MEMORY_LIMITS[counter];
    if (received > maximum) {
      return workLimitFailure(this, counter, received, maximum);
    }

    const nextPopulations = { ...this.populations, [counter]: received };
    const tracked =
      nextPopulations.peakSourceEventIdentityRecords +
      nextPopulations.peakBindingRecords +
      nextPopulations.peakOutputEventRecords +
      nextPopulations.peakOutputPitchRecords;
    const trackedMaximum = PLAYBACK_PLAN_MEMORY_LIMITS.peakTrackedRecords;
    if (tracked > trackedMaximum) {
      return workLimitFailure(
        this,
        "peakTrackedRecords",
        tracked,
        trackedMaximum,
      );
    }

    this.populations[counter] = received;
    this.values[counter] = Math.max(this.values[counter], received);
    this.values.peakTrackedRecords = Math.max(
      this.values.peakTrackedRecords,
      tracked,
    );
    return null;
  }

  acceptTrackedRecordsForTest(
    received: number,
  ): CompilePlaybackPlanFailure | null {
    const maximum = PLAYBACK_PLAN_MEMORY_LIMITS.peakTrackedRecords;
    if (received > maximum) {
      return workLimitFailure(
        this,
        "peakTrackedRecords",
        received,
        maximum,
      );
    }
    this.values.peakTrackedRecords = Math.max(
      this.values.peakTrackedRecords,
      received,
    );
    return null;
  }

  evidence<Termination extends PlaybackPlanTermination>(
    termination: Termination,
  ): PlaybackPlanWorkEvidence & Readonly<{ termination: Termination }> {
    return Object.freeze({
      sectionsVisited: this.values.sectionsVisited,
      measuresVisited: this.values.measuresVisited,
      eventsVisited: this.values.eventsVisited,
      bindingsVisited: this.values.bindingsVisited,
      bindingLookups: this.values.bindingLookups,
      exactBeatOperations: this.values.exactBeatOperations,
      tickProjections: this.values.tickProjections,
      loopIntersectionChecks: this.values.loopIntersectionChecks,
      gateCalculations: this.values.gateCalculations,
      pitchRecordsCopied: this.values.pitchRecordsCopied,
      eventsProduced: this.values.eventsProduced,
      peakSourceEventIdentityRecords:
        this.values.peakSourceEventIdentityRecords,
      peakBindingRecords: this.values.peakBindingRecords,
      peakOutputEventRecords: this.values.peakOutputEventRecords,
      peakOutputPitchRecords: this.values.peakOutputPitchRecords,
      peakTrackedRecords: this.values.peakTrackedRecords,
      termination,
    });
  }
}

function requestFailure(
  ledger: WorkLedger,
  refusal: PlaybackPlanRequestRefusal,
): CompilePlaybackPlanFailure {
  return Object.freeze({
    schema: PLAYBACK_PLAN_RESULT_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    ok: false,
    refusal: deepFreezeOwned(refusal),
    evidence: ledger.evidence("request-invalid"),
  });
}

function timelineFailure(
  ledger: WorkLedger,
  refusal: PlaybackPlanTimelineRefusal,
): CompilePlaybackPlanFailure {
  return Object.freeze({
    schema: PLAYBACK_PLAN_RESULT_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    ok: false,
    refusal: deepFreezeOwned(refusal),
    evidence: ledger.evidence("timeline-invalid"),
  });
}

function realizationFailure(
  ledger: WorkLedger,
  refusal: PlaybackPlanRealizationRefusal,
): CompilePlaybackPlanFailure {
  return Object.freeze({
    schema: PLAYBACK_PLAN_RESULT_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    ok: false,
    refusal: deepFreezeOwned(refusal),
    evidence: ledger.evidence("realization-invalid"),
  });
}

function loopFailure(
  ledger: WorkLedger,
  refusal: PlaybackPlanLoopRefusal,
): CompilePlaybackPlanFailure {
  return Object.freeze({
    schema: PLAYBACK_PLAN_RESULT_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    ok: false,
    refusal: deepFreezeOwned(refusal),
    evidence: ledger.evidence("loop-invalid"),
  });
}

function gateFailure(
  ledger: WorkLedger,
  refusal: PlaybackPlanGateRefusal,
): CompilePlaybackPlanFailure {
  return Object.freeze({
    schema: PLAYBACK_PLAN_RESULT_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    ok: false,
    refusal: deepFreezeOwned(refusal),
    evidence: ledger.evidence("gate-invalid"),
  });
}

function workLimitFailure(
  ledger: WorkLedger,
  counter: PlaybackPlanWorkCounterName,
  received: number,
  maximum: number,
): CompilePlaybackPlanFailure {
  const refusal: PlaybackPlanWorkLimitRefusal = Object.freeze({
    code: "limit.playback_plan_work_exceeded",
    path: frozenPath("work", counter),
    counter,
    received,
    maximum,
    partialResult: false,
  });
  return Object.freeze({
    schema: PLAYBACK_PLAN_RESULT_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    ok: false,
    refusal,
    evidence: ledger.evidence("work-limit-exceeded"),
  });
}

function requestSchemaRefusal(
  ledger: WorkLedger,
  path: DomainPath,
  received: unknown,
): CompilePlaybackPlanFailure {
  const ownedReceived = describeReceived(received);
  return requestFailure(ledger, {
    code: "playback.request_schema_invalid",
    path,
    received: ownedReceived,
  });
}

function describeReceived(received: unknown): unknown {
  if (
    received === null ||
    typeof received === "string" ||
    typeof received === "number" ||
    typeof received === "boolean"
  ) {
    return received;
  }
  if (Array.isArray(received)) return "array";
  return typeof received === "object" ? "object" : typeof received;
}

type RequestScalarSnapshot = Readonly<{
  documentId: DocumentId;
  tempoBpm: number;
  meter: Meter;
  sections: CompilePlaybackPlanRequest["document"]["sections"];
  realizedVoicings: JsonRecord;
  loop: BeatRange | null;
}>;

function validateRequestIdentity(
  request: CompilePlaybackPlanRequest,
  ledger: WorkLedger,
): CompilePlaybackPlanFailure | RequestScalarSnapshot {
  const receivedRequest: unknown = request;
  if (!isRecord(receivedRequest)) {
    return requestSchemaRefusal(
      ledger,
      frozenPath(),
      typeof receivedRequest,
    );
  }
  try {
    if (!hasOnlyOwnDataProperties(receivedRequest, COMPILE_REQUEST_KEYS)) {
      return requestSchemaRefusal(ledger, frozenPath(), receivedRequest);
    }
  } catch {
    return requestSchemaRefusal(ledger, frozenPath(), "unreadable-request");
  }
  const receivedSchema = receivedRequest["schema"];
  if (receivedSchema !== PLAYBACK_PLAN_REQUEST_SCHEMA) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("schema"),
      receivedSchema,
    );
  }
  const receivedCompilerId = receivedRequest["compilerId"];
  const receivedCompilerVersion = receivedRequest["compilerVersion"];
  if (
    receivedCompilerId !== PLAYBACK_PLAN_COMPILER_ID ||
    receivedCompilerVersion !== PLAYBACK_PLAN_COMPILER_VERSION
  ) {
    return requestFailure(ledger, {
      code: "playback.compiler_identity_invalid",
      path: frozenPath(
        receivedCompilerId !== PLAYBACK_PLAN_COMPILER_ID
          ? "compilerId"
          : "compilerVersion",
      ),
      receivedId: describeReceived(receivedCompilerId),
      receivedVersion: describeReceived(receivedCompilerVersion),
    });
  }

  const policies = [
    {
      policy: "articulation" as const,
      idKey: "articulationPolicyId" as const,
      versionKey: "articulationPolicyVersion" as const,
      expectedId: PLAYBACK_ARTICULATION_POLICY_ID,
      expectedVersion: PLAYBACK_ARTICULATION_POLICY_VERSION,
    },
    {
      policy: "loop" as const,
      idKey: "loopPolicyId" as const,
      versionKey: "loopPolicyVersion" as const,
      expectedId: PLAYBACK_LOOP_POLICY_ID,
      expectedVersion: PLAYBACK_LOOP_POLICY_VERSION,
    },
    {
      policy: "velocity" as const,
      idKey: "velocityPolicyId" as const,
      versionKey: "velocityPolicyVersion" as const,
      expectedId: PLAYBACK_VELOCITY_POLICY_ID,
      expectedVersion: PLAYBACK_VELOCITY_POLICY_VERSION,
    },
    {
      policy: "realization-binding" as const,
      idKey: "realizationBindingPolicyId" as const,
      versionKey: "realizationBindingPolicyVersion" as const,
      expectedId: PLAYBACK_REALIZATION_BINDING_POLICY_ID,
      expectedVersion: PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
    },
  ];

  for (const policy of policies) {
    const receivedId = receivedRequest[policy.idKey];
    const receivedVersion = receivedRequest[policy.versionKey];
    if (
      receivedId !== policy.expectedId ||
      receivedVersion !== policy.expectedVersion
    ) {
      return requestFailure(ledger, {
        code: "playback.policy_identity_invalid",
        path: frozenPath(
          receivedId !== policy.expectedId
            ? policy.idKey
            : policy.versionKey,
        ),
        policy: policy.policy,
        receivedId: describeReceived(receivedId),
        receivedVersion: describeReceived(receivedVersion),
      });
    }
  }

  const receivedDocument = receivedRequest["document"];
  if (!isRecord(receivedDocument)) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("document"),
      typeof receivedDocument,
    );
  }
  for (const key of ["id", "meter", "tempoBpm", "sections"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(receivedDocument, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("document", key),
        "accessor-or-missing",
      );
    }
  }
  const documentId = receivedDocument["id"];
  if (!isStableId(documentId)) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("document", "id"),
      documentId,
    );
  }
  const tempoBpm = receivedDocument["tempoBpm"];
  if (!isSafeIntegerBetween(tempoBpm, 20, 400)) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("document", "tempoBpm"),
      tempoBpm,
    );
  }
  const receivedMeter = receivedDocument["meter"];
  if (
    !isRecord(receivedMeter) ||
    !hasOnlyOwnDataProperties(receivedMeter, ["beatsPerBar", "beatUnit"]) ||
    !isSafeIntegerBetween(receivedMeter["beatsPerBar"], 1, 32) ||
    ![2, 4, 8].includes(receivedMeter["beatUnit"] as number)
  ) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("document", "meter"),
      receivedMeter,
    );
  }
  const receivedSections = receivedDocument["sections"];
  if (!Array.isArray(receivedSections)) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("document", "sections"),
      receivedSections,
    );
  }
  const receivedVoicings = receivedRequest["realizedVoicings"];
  if (!isRecord(receivedVoicings)) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("realizedVoicings"),
      typeof receivedVoicings,
    );
  }
  const loop = receivedRequest["loop"];
  if (loop !== null && typeof loop !== "object") {
    return requestSchemaRefusal(ledger, frozenPath("loop"), loop);
  }
  return Object.freeze({
    documentId: documentId as DocumentId,
    tempoBpm,
    meter: Object.freeze({
      beatsPerBar: receivedMeter["beatsPerBar"],
      beatUnit: receivedMeter["beatUnit"],
    }) as Meter,
    sections: receivedSections as CompilePlaybackPlanRequest["document"]["sections"],
    realizedVoicings: receivedVoicings,
    loop: loop as BeatRange | null,
  });
}

type InspectedBinding = Readonly<{
  binding: PlaybackRealizationBinding;
  eventId: ChordEventId;
  voicingFailure: VoicingFailureSnapshot | null;
}>;

type GeneratedRequestEnvelope = Readonly<{
  request: AutoVoicingRequestSnapshot;
  resolved: JsonRecord;
  policy: JsonRecord;
  realizationId: string;
  selected: JsonRecord | null;
  availableRealizationIds: readonly string[];
  quartalContext: unknown;
}>;

type EnumeratedBindings = readonly (readonly [
  ChordEventId,
  InspectedBinding,
])[];

function malformedBinding(
  ledger: WorkLedger,
  bindingId: ChordEventId,
  tail: readonly (string | number)[],
  received: unknown,
): CompilePlaybackPlanFailure {
  return requestSchemaRefusal(
    ledger,
    frozenPath("realizedVoicings", bindingId, ...tail),
    received,
  );
}

function inspectGeneratedRequestEnvelope(
  value: unknown,
): GeneratedRequestEnvelope | null {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, AUTO_REQUEST_KEYS)) {
    return null;
  }
  const resolved = value["resolved"];
  const policy = value["policy"];
  const realizationId = value["realizationId"];
  if (
    value["schema"] !== THEORY_VOICING_REQUEST_SCHEMA ||
    value["kind"] !== "auto" ||
    typeof realizationId !== "string" ||
    !SEMANTIC_REALIZATION_ID_VALUES.includes(
      realizationId as (typeof SEMANTIC_REALIZATION_ID_VALUES)[number],
    ) ||
    !resolvedChordIsValid(resolved) ||
    !autoPolicyIsValid(policy)
  ) {
    return null;
  }
  const selected = (resolved["realizations"] as unknown[]).find(
    (entry) => isRecord(entry) && entry["id"] === realizationId,
  );
  return Object.freeze({
    request: Object.freeze({
      resolved,
      realizationId,
      quartalContext: value["quartalContext"],
    }),
    resolved,
    policy,
    realizationId,
    selected: isRecord(selected) ? selected : null,
    availableRealizationIds: Object.freeze(
      (resolved["realizations"] as JsonRecord[]).map(
        (realization) => realization["id"] as string,
      ),
    ),
    quartalContext: value["quartalContext"],
  });
}

function isDataArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length" || key === Symbol.iterator) continue;
    if (
      typeof key !== "string" ||
      !/^(?:0|[1-9][0-9]*)$/u.test(key) ||
      Number(key) >= value.length
    ) {
      return false;
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) return false;
  }
  return true;
}

function exactPath(value: unknown, expected: readonly unknown[]): boolean {
  return (
    isDataArray(value, expected.length) &&
    value.length === expected.length &&
    value.every((entry, index) => Object.is(entry, expected[index]))
  );
}

const UNSATISFIED_REASON_VALUES = Object.freeze([
  "selected-realization-mismatch",
  "template-degree-absent",
  "voice-count-below-template-minimum",
  "voice-count-unsupported",
  "bass-policy-unsupported",
  "required-degree-omitted",
  "guide-tone-omitted",
  "identity-tone-omitted",
  "slash-bass-unplaceable",
  "external-bass-present",
  "root-present-in-rootless",
  "range-insufficient",
  "duplicate-midi",
  "doubling-not-permitted",
  "low-register-spacing",
  "family-transform-invalid",
  "quartal-context-invalid",
  "no-legal-register-placement",
] as const);
const QUARTAL_INVALID_REASON_VALUES = Object.freeze([
  "schema-mismatch",
  "policy-id-mismatch",
  "policy-version-mismatch",
  "evidence-id-invalid",
  "evidence-version-invalid",
  "degree-count-mismatch",
  "degree-absent-from-realization",
  "adjacency-not-perfect-or-augmented-fourth",
] as const);
const VOICING_QUALITY_CLASS_VALUES = Object.freeze([
  "major-triad",
  "minor-triad",
  "diminished-triad",
  "augmented-triad",
  "suspended-triad",
  "power-triad",
  "major-sixth",
  "minor-sixth",
  "major-seventh",
  "dominant-seventh",
  "minor-seventh",
  "minor-major-seventh",
  "half-diminished-seventh",
  "diminished-seventh",
  "augmented-major-seventh",
  "suspended-dominant",
] as const);

function unsatisfiedConstraintIsValid(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, CONSTRAINT_KEYS) ||
    !VOICING_CONSTRAINT_CODES.includes(
      value["code"] as (typeof VOICING_CONSTRAINT_CODES)[number],
    ) ||
    value["satisfied"] !== false ||
    !UNSATISFIED_REASON_VALUES.includes(
      value["reason"] as (typeof UNSATISFIED_REASON_VALUES)[number],
    )
  ) {
    return false;
  }
  return (
    isBoundedIntegerArray(value["voiceOrdinals"], 0, 6) &&
    isDegreeArray(value["degrees"], MAX_CANDIDATE_VOICES) &&
    isBoundedIntegerArray(value["midiValues"], 0, 127)
  );
}

function voicingRefusalIsValid(value: unknown): value is JsonRecord {
  if (!isRecord(value) || typeof value["code"] !== "string") return false;
  const code = value["code"];
  switch (code) {
    case "voicing.realization_unavailable": {
      if (
        !hasOnlyOwnDataProperties(value, ["code", "path", "received", "available"]) ||
        !exactPath(value["path"], ["realizationId"]) ||
        !SEMANTIC_REALIZATION_ID_VALUES.includes(
          value["received"] as (typeof SEMANTIC_REALIZATION_ID_VALUES)[number],
        ) ||
        !isDataArray(value["available"], 4) ||
        value["available"].length === 0
      ) {
        return false;
      }
      return value["available"].every((entry) =>
        SEMANTIC_REALIZATION_ID_VALUES.includes(
          entry as (typeof SEMANTIC_REALIZATION_ID_VALUES)[number],
        )
      );
    }
    case "voicing.quartal_context_unexpected":
      return (
        hasOnlyOwnDataProperties(value, ["code", "path", "family"]) &&
        exactPath(value["path"], ["quartalContext"]) &&
        AUTO_VOICING_FAMILY_VALUES.includes(
          value["family"] as (typeof AUTO_VOICING_FAMILY_VALUES)[number],
        ) &&
        value["family"] !== "quartal"
      );
    case "voicing.quartal_context_required":
      return (
        hasOnlyOwnDataProperties(value, [
          "code",
          "path",
          "family",
          "policyId",
          "policyVersion",
        ]) &&
        exactPath(value["path"], ["quartalContext"]) &&
        value["family"] === "quartal" &&
        value["policyId"] === THEORY_QUARTAL_CONTEXT_POLICY_ID &&
        value["policyVersion"] === THEORY_VOICING_VERSION
      );
    case "voicing.quartal_context_invalid": {
      if (
        !hasOnlyOwnDataProperties(value, ["code", "path", "reason"]) ||
        !QUARTAL_INVALID_REASON_VALUES.includes(
          value["reason"] as (typeof QUARTAL_INVALID_REASON_VALUES)[number],
        ) ||
        !isDataArray(value["path"], 3)
      ) {
        return false;
      }
      const path = value["path"];
      return (
        exactPath(path, ["quartalContext"]) ||
        (path.length === 3 &&
          path[0] === "quartalContext" &&
          path[1] === "degreeSequence" &&
          isSafeIntegerBetween(path[2], 0, 6))
      );
    }
    case "voicing.family_unavailable": {
      if (
        !hasOnlyOwnDataProperties(value, [
          "code",
          "path",
          "qualityClass",
          "formulaRuleId",
          "family",
          "reason",
        ]) ||
        !exactPath(value["path"], ["policy", "family"]) ||
        !VOICING_QUALITY_CLASS_VALUES.includes(
          value["qualityClass"] as (typeof VOICING_QUALITY_CLASS_VALUES)[number],
        ) ||
        !FORMULA_RULE_ID_VALUES.includes(
          value["formulaRuleId"] as (typeof FORMULA_RULE_ID_VALUES)[number],
        )
      ) {
        return false;
      }
      return value["family"] === "quartal"
        ? value["reason"] === "quartal-row-undeclared"
        : ["shell", "rootless-a", "rootless-b"].includes(
              String(value["family"]),
            ) && value["reason"] === "quality-family-unsupported";
    }
    case "voicing.constraints_unsatisfied":
      return (
        hasOnlyOwnDataProperties(value, ["code", "path", "constraints"]) &&
        exactPath(value["path"], ["policy"]) &&
        isDataArray(value["constraints"], VOICING_CONSTRAINT_CODES.length) &&
        value["constraints"].length > 0 &&
        value["constraints"].every(unsatisfiedConstraintIsValid)
      );
    case "limit.voicing_work_exceeded": {
      if (
        !hasOnlyOwnDataProperties(value, [
          "code",
          "path",
          "counter",
          "received",
          "maximum",
          "partialResult",
        ]) ||
        !exactPath(value["path"], []) ||
        typeof value["counter"] !== "string" ||
        !(value["counter"] in VOICING_FAILURE_EVIDENCE_LIMITS)
      ) {
        return false;
      }
      const maximum =
        VOICING_FAILURE_EVIDENCE_LIMITS[
          value["counter"] as keyof typeof VOICING_FAILURE_EVIDENCE_LIMITS
        ];
      return (
        value["maximum"] === maximum &&
        isSafeIntegerBetween(value["received"], maximum + 1, Number.MAX_SAFE_INTEGER) &&
        value["partialResult"] === false
      );
    }
    default:
      return false;
  }
}

function voicingFailureEvidenceIsValid(
  value: unknown,
  termination: string,
): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, VOICING_FAILURE_EVIDENCE_KEYS) ||
    value["termination"] !== termination
  ) {
    return false;
  }
  return Object.entries(VOICING_FAILURE_EVIDENCE_LIMITS).every(
    ([counter, maximum]) => isSafeIntegerBetween(value[counter], 0, maximum),
  );
}

function generatedSuccessRequestCorrelates(
  envelope: GeneratedRequestEnvelope,
): boolean {
  if (envelope.selected === null) return false;
  return envelope.policy["family"] === "quartal"
    ? quartalContextIsValid(envelope.quartalContext, envelope.selected)
    : envelope.quartalContext === null;
}

function failureEvidenceIsZero(evidence: JsonRecord): boolean {
  return Object.keys(VOICING_FAILURE_EVIDENCE_LIMITS).every(
    (counter) => evidence[counter] === 0,
  );
}

function selectedDegreeCount(
  envelope: GeneratedRequestEnvelope,
): number | null {
  const degrees = envelope.selected?.["degrees"];
  return Array.isArray(degrees) ? degrees.length : null;
}

function failureEvidenceHasBoundRealization(
  evidence: JsonRecord,
  envelope: GeneratedRequestEnvelope,
): boolean {
  const degreeCount = selectedDegreeCount(envelope);
  return (
    degreeCount !== null &&
    evidence["realizationDegreeRecordsVisited"] === degreeCount
  );
}

function contextFailureEvidenceCorrelates(
  evidence: JsonRecord,
  envelope: GeneratedRequestEnvelope,
): boolean {
  const degreeCount = selectedDegreeCount(envelope);
  if (
    degreeCount === null ||
    evidence["realizationDegreeRecordsVisited"] !== degreeCount ||
    evidence["peakTrackedRecords"] !== degreeCount
  ) {
    return false;
  }
  return Object.keys(VOICING_FAILURE_EVIDENCE_LIMITS).every(
    (counter) =>
      counter === "realizationDegreeRecordsVisited" ||
      counter === "peakTrackedRecords" ||
      evidence[counter] === 0,
  );
}

function quartalContextEnvelopeHasExactKeys(value: unknown): value is JsonRecord {
  return (
    isRecord(value) &&
    hasOnlyOwnDataProperties(value, QUARTAL_CONTEXT_KEYS) &&
    [
      "compatible-chord-scale",
      "declared-modal-template",
      "declared-suspended-template",
    ].includes(String(value["evidenceKind"]))
  );
}

function quartalContextInvalidCorrelates(
  envelope: GeneratedRequestEnvelope,
  refusal: JsonRecord,
): boolean {
  const context = envelope.quartalContext;
  const selected = envelope.selected;
  if (
    envelope.policy["family"] !== "quartal" ||
    selected === null ||
    !quartalContextEnvelopeHasExactKeys(context)
  ) {
    return false;
  }

  const rootPath = exactPath(refusal["path"], ["quartalContext"]);
  const indexedPath = refusal["path"];
  const schemaMatches = context["schema"] === THEORY_QUARTAL_CONTEXT_SCHEMA;
  const policyIdMatches =
    context["policyId"] === THEORY_QUARTAL_CONTEXT_POLICY_ID;
  const policyVersionMatches =
    context["policyVersion"] === THEORY_VOICING_VERSION;
  const evidenceIdMatches = isBoundedText(context["evidenceId"], 1, 256, 512);
  const evidenceVersionMatches = isSafeIntegerBetween(
    context["evidenceVersion"],
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const degrees = context["degreeSequence"];
  const generatedSlash =
    envelope.policy["bassPolicy"] === "generated" &&
    envelope.resolved["bass"] !== null;
  const expectedDegreeCount =
    (envelope.policy["voiceCount"] as number) - (generatedSlash ? 1 : 0);

  switch (refusal["reason"]) {
    case "schema-mismatch":
      return rootPath && !schemaMatches;
    case "policy-id-mismatch":
      return rootPath && schemaMatches && !policyIdMatches;
    case "policy-version-mismatch":
      return (
        rootPath && schemaMatches && policyIdMatches && !policyVersionMatches
      );
    case "evidence-id-invalid":
      return (
        rootPath &&
        schemaMatches &&
        policyIdMatches &&
        policyVersionMatches &&
        !evidenceIdMatches
      );
    case "evidence-version-invalid":
      return (
        rootPath &&
        schemaMatches &&
        policyIdMatches &&
        policyVersionMatches &&
        evidenceIdMatches &&
        !evidenceVersionMatches
      );
    case "degree-count-mismatch":
      return (
        rootPath &&
        schemaMatches &&
        policyIdMatches &&
        policyVersionMatches &&
        evidenceIdMatches &&
        evidenceVersionMatches &&
        (!isDataArray(degrees, MAX_CANDIDATE_VOICES) ||
          degrees.length !== expectedDegreeCount)
      );
    case "degree-absent-from-realization": {
      if (
        !schemaMatches ||
        !policyIdMatches ||
        !policyVersionMatches ||
        !evidenceIdMatches ||
        !evidenceVersionMatches ||
        !isDataArray(degrees, MAX_CANDIDATE_VOICES) ||
        degrees.length !== expectedDegreeCount ||
        !isDataArray(indexedPath, 3) ||
        indexedPath.length !== 3 ||
        indexedPath[0] !== "quartalContext" ||
        indexedPath[1] !== "degreeSequence" ||
        !isSafeIntegerBetween(indexedPath[2], 0, degrees.length - 1)
      ) {
        return false;
      }
      const degree = degrees[indexedPath[2]];
      const selectedDegrees = selected["degrees"] as unknown[];
      return !isDegree(degree) || !degreeIsIn(degree, selectedDegrees);
    }
    case "adjacency-not-perfect-or-augmented-fourth":
      // V0 owns interval judgment. P0 checks only the exact carried identity,
      // membership, count, and indexed refusal path around that judgment.
      return (
        schemaMatches &&
        policyIdMatches &&
        policyVersionMatches &&
        evidenceIdMatches &&
        evidenceVersionMatches &&
        isDataArray(degrees, MAX_CANDIDATE_VOICES) &&
        degrees.length === expectedDegreeCount &&
        degrees.every(
          (degree) =>
            isDegree(degree) &&
            degreeIsIn(degree, selected["degrees"] as unknown[]),
        ) &&
        isDataArray(indexedPath, 3) &&
        indexedPath.length === 3 &&
        indexedPath[0] === "quartalContext" &&
        indexedPath[1] === "degreeSequence" &&
        isSafeIntegerBetween(indexedPath[2], 1, degrees.length - 1)
      );
    default:
      return false;
  }
}

function workFailureCorrelates(
  refusal: JsonRecord,
  evidence: JsonRecord,
): boolean {
  const counter = refusal["counter"] as string;
  const maximum = refusal["maximum"] as number;
  const received = refusal["received"] as number;
  if (counter.startsWith("peak")) {
    return (
      typeof evidence[counter] === "number" &&
      evidence[counter] <= maximum &&
      evidence[counter] < received
    );
  }
  return evidence[counter] === maximum && received === maximum + 1;
}

function voicingFailureCorrelates(
  refusal: JsonRecord,
  evidence: JsonRecord,
  envelope: GeneratedRequestEnvelope,
): boolean {
  switch (refusal["code"]) {
    case "voicing.realization_unavailable":
      return (
        envelope.selected === null &&
        refusal["received"] === envelope.realizationId &&
        sameSequence(
          refusal["available"] as unknown[],
          envelope.availableRealizationIds,
          Object.is,
        ) &&
        failureEvidenceIsZero(evidence)
      );
    case "voicing.quartal_context_unexpected":
      return (
        envelope.selected !== null &&
        envelope.policy["family"] !== "quartal" &&
        envelope.quartalContext !== null &&
        envelope.quartalContext !== undefined &&
        refusal["family"] === envelope.policy["family"] &&
        contextFailureEvidenceCorrelates(evidence, envelope)
      );
    case "voicing.quartal_context_required":
      return (
        envelope.selected !== null &&
        envelope.policy["family"] === "quartal" &&
        (envelope.quartalContext === null ||
          envelope.quartalContext === undefined) &&
        contextFailureEvidenceCorrelates(evidence, envelope)
      );
    case "voicing.quartal_context_invalid":
      return (
        quartalContextInvalidCorrelates(envelope, refusal) &&
        contextFailureEvidenceCorrelates(evidence, envelope)
      );
    case "voicing.family_unavailable":
      return (
        envelope.selected !== null &&
        generatedSuccessRequestCorrelates(envelope) &&
        refusal["family"] === envelope.policy["family"] &&
        refusal["formulaRuleId"] === envelope.selected["formulaRuleId"] &&
        failureEvidenceHasBoundRealization(evidence, envelope)
      );
    case "voicing.constraints_unsatisfied": {
      const constraints = refusal["constraints"] as unknown[];
      return (
        envelope.selected !== null &&
        generatedSuccessRequestCorrelates(envelope) &&
        failureEvidenceHasBoundRealization(evidence, envelope) &&
        evidence["constraintObservationsProduced"] === constraints.length &&
        evidence["peakConstraintObservationRecords"] === constraints.length
      );
    }
    case "limit.voicing_work_exceeded":
      return (
        envelope.selected !== null &&
        generatedSuccessRequestCorrelates(envelope) &&
        failureEvidenceHasBoundRealization(evidence, envelope) &&
        workFailureCorrelates(refusal, evidence)
      );
    default:
      return false;
  }
}

function voicingFailureSnapshot(
  value: unknown,
  envelope: GeneratedRequestEnvelope,
): VoicingFailureSnapshot | null {
  if (
    !isRecord(value) ||
    !hasOnlyOwnDataProperties(value, VOICING_FAILURE_KEYS) ||
    value["ok"] !== false ||
    !voicingRefusalIsValid(value["refusal"])
  ) {
    return null;
  }
  const code = value["refusal"]["code"] as keyof typeof VOICING_FAILURE_TERMINATIONS;
  const termination = VOICING_FAILURE_TERMINATIONS[code];
  if (!voicingFailureEvidenceIsValid(value["evidence"], termination)) {
    return null;
  }
  if (
    !voicingFailureCorrelates(
      value["refusal"],
      value["evidence"] as JsonRecord,
      envelope,
    )
  ) {
    return null;
  }
  return Object.freeze({ code, termination });
}

function validateBindingEnvelope(
  bindingId: ChordEventId,
  value: unknown,
  ledger: WorkLedger,
): InspectedBinding | CompilePlaybackPlanFailure {
  try {
    if (!isRecord(value)) {
      return malformedBinding(ledger, bindingId, [], value);
    }
    for (const key of ["schema", "eventId", "kind"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return malformedBinding(ledger, bindingId, [key], "accessor-or-missing");
      }
    }
    if (value["schema"] !== PLAYBACK_PLAN_REALIZATION_SCHEMA) {
      return malformedBinding(ledger, bindingId, ["schema"], value["schema"]);
    }
    if (!isStableId(value["eventId"])) {
      return malformedBinding(ledger, bindingId, ["eventId"], value["eventId"]);
    }
    if (typeof value["kind"] !== "string") {
      return malformedBinding(ledger, bindingId, ["kind"], value["kind"]);
    }
    if (value["kind"] === "stored") {
      if (!storedBindingIsExact(value)) {
        return malformedBinding(ledger, bindingId, [], value);
      }
      return Object.freeze({
        binding: value as PlaybackRealizationBinding,
        eventId: value["eventId"] as ChordEventId,
        voicingFailure: null,
      });
    }
    // Unknown non-generated kinds remain semantic stored/custom mismatches.
    if (value["kind"] !== "generated") {
      return Object.freeze({
        binding: value as PlaybackRealizationBinding,
        eventId: value["eventId"] as ChordEventId,
        voicingFailure: null,
      });
    }
    if (
      !hasOnlyOwnDataProperties(value, [
        "schema",
        "eventId",
        "kind",
        "request",
        "outcome",
      ])
    ) {
      return malformedBinding(ledger, bindingId, [], value);
    }
    const requestEnvelope = inspectGeneratedRequestEnvelope(value["request"]);
    if (requestEnvelope === null) {
      return malformedBinding(ledger, bindingId, ["request"], value["request"]);
    }
    const outcome = value["outcome"];
    if (!isRecord(outcome)) {
      return malformedBinding(ledger, bindingId, ["outcome"], outcome);
    }
    if (outcome["ok"] === true) {
      if (
        !hasOnlyOwnDataProperties(outcome, ["ok", "candidate"]) ||
        !generatedSuccessRequestCorrelates(requestEnvelope)
      ) {
        return malformedBinding(
          ledger,
          bindingId,
          ["outcome", "candidate"],
          undefined,
        );
      }
      return Object.freeze({
        binding: value as PlaybackRealizationBinding,
        eventId: value["eventId"] as ChordEventId,
        voicingFailure: null,
      });
    }
    const snapshot = voicingFailureSnapshot(outcome, requestEnvelope);
    if (snapshot === null) {
      const refusal = outcome["refusal"];
      const evidence = outcome["evidence"];
      if (!isRecord(refusal) || typeof refusal["code"] !== "string") {
        return malformedBinding(
          ledger,
          bindingId,
          ["outcome", "refusal", "code"],
          isRecord(refusal) ? refusal["code"] : refusal,
        );
      }
      return malformedBinding(
        ledger,
        bindingId,
        ["outcome", "evidence", "termination"],
        isRecord(evidence) ? evidence["termination"] : evidence,
      );
    }
    return Object.freeze({
      binding: value as PlaybackRealizationBinding,
      eventId: value["eventId"] as ChordEventId,
      voicingFailure: snapshot,
    });
  } catch {
    return malformedBinding(ledger, bindingId, [], "unreadable-object");
  }
}

function exactMapEntrySnapshot(
  value: unknown,
): Readonly<{ key: unknown; binding: unknown }> | null {
  if (!Array.isArray(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 3 ||
    !keys.includes("0") ||
    !keys.includes("1") ||
    !keys.includes("length")
  ) {
    return null;
  }
  const zero = descriptorDataValue(
    Object.getOwnPropertyDescriptor(value, "0"),
  );
  const one = descriptorDataValue(
    Object.getOwnPropertyDescriptor(value, "1"),
  );
  const length = descriptorDataValue(
    Object.getOwnPropertyDescriptor(value, "length"),
  );
  if (
    !zero.ok ||
    !one.ok ||
    !length.ok ||
    length.value !== 2
  ) {
    return null;
  }
  return Object.freeze({ key: zero.value, binding: one.value });
}

type DataValueSnapshot =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false }>;

function descriptorDataValue(
  descriptor: PropertyDescriptor | undefined,
): DataValueSnapshot {
  if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
    return Object.freeze({ ok: false });
  }
  const value: unknown = Reflect.get(descriptor, "value");
  return Object.freeze({ ok: true, value });
}

function dataValueSnapshot(
  value: object,
  key: PropertyKey,
): DataValueSnapshot {
  let owner: object | null = value;
  for (let depth = 0; owner !== null && depth < 32; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor !== undefined) {
      return descriptorDataValue(descriptor);
    }
    owner = Reflect.getPrototypeOf(owner);
  }
  return Object.freeze({ ok: false });
}

type MapSizeSnapshot =
  | Readonly<{ kind: "reported"; value: unknown }>
  | Readonly<{ kind: "derive-from-entries" }>
  | Readonly<{ kind: "invalid" }>;

function mapSizeSnapshot(value: JsonRecord): MapSizeSnapshot {
  const own = Object.getOwnPropertyDescriptor(value, "size");
  if (own !== undefined) {
    const data = descriptorDataValue(own);
    return data.ok
      ? Object.freeze({ kind: "reported", value: data.value })
      : Object.freeze({ kind: "invalid" });
  }

  // Native Map exposes size as a branded prototype accessor. Invoke that
  // intrinsic once only when no hostile own property shadows it.
  const nativeSizeDescriptor = Object.getOwnPropertyDescriptor(
    Map.prototype,
    "size",
  );
  const nativeSize: unknown = nativeSizeDescriptor === undefined
    ? undefined
    : Reflect.get(nativeSizeDescriptor, "get");
  if (typeof nativeSize === "function") {
    try {
      const received: unknown = Reflect.apply(nativeSize, value, []);
      return Object.freeze({
        kind: "reported",
        value: received,
      });
    } catch {
      // A deterministic structural ReadonlyMap may not carry native Map slots.
    }
  }
  let owner = Reflect.getPrototypeOf(value);
  for (let depth = 0; owner !== null && depth < 32; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, "size");
    if (descriptor !== undefined) {
      const data = descriptorDataValue(descriptor);
      if (data.ok) {
        return Object.freeze({ kind: "reported", value: data.value });
      }
      // ReadonlyMap is structural and idiomatic implementations expose an
      // inherited size getter. Never invoke an untrusted getter: the bounded
      // entries snapshot below is the authoritative count for this case.
      return Object.freeze({ kind: "derive-from-entries" });
    }
    owner = Reflect.getPrototypeOf(owner);
  }
  return Object.freeze({ kind: "invalid" });
}

function iteratorResultSnapshot(
  value: unknown,
): Readonly<{ done: boolean; value: unknown }> | null {
  if (!isRecord(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 2 ||
    !keys.includes("done") ||
    !keys.includes("value")
  ) {
    return null;
  }
  const done = descriptorDataValue(
    Object.getOwnPropertyDescriptor(value, "done"),
  );
  const yielded = descriptorDataValue(
    Object.getOwnPropertyDescriptor(value, "value"),
  );
  if (
    !done.ok ||
    typeof done.value !== "boolean" ||
    !yielded.ok
  ) {
    return null;
  }
  return Object.freeze({ done: done.value, value: yielded.value });
}

function enumerateBindings(
  realizedVoicings: JsonRecord,
  ledger: WorkLedger,
): EnumeratedBindings | CompilePlaybackPlanFailure {
  const collected: Array<[ChordEventId, unknown]> = [];
  let reportedSize: number | null = null;
  let iterator: unknown;
  try {
    const mapValue: unknown = realizedVoicings;
    if (!isRecord(mapValue)) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("realizedVoicings"),
        mapValue,
      );
    }
    const size = mapSizeSnapshot(mapValue);
    if (size.kind === "invalid") {
      return requestSchemaRefusal(
        ledger,
        frozenPath("realizedVoicings", "size"),
        "accessor-or-missing",
      );
    }
    if (size.kind === "reported") {
      if (typeof size.value !== "number" || !Number.isSafeInteger(size.value)) {
        return requestSchemaRefusal(
          ledger,
          frozenPath("realizedVoicings", "size"),
          size.value,
        );
      }
      reportedSize = size.value;
      if (reportedSize < 0) {
        return requestSchemaRefusal(
          ledger,
          frozenPath("realizedVoicings", "size"),
          reportedSize,
        );
      }
      if (reportedSize > MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS) {
        return realizationFailure(ledger, {
          code: "playback.realization_binding_limit",
          path: frozenPath("realizedVoicings"),
          received: reportedSize,
          maximum: MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS,
        });
      }
    }
    const entries = dataValueSnapshot(mapValue, "entries");
    if (!entries.ok || typeof entries.value !== "function") {
      return requestSchemaRefusal(
        ledger,
        frozenPath("realizedVoicings", "entries"),
        entries.ok ? entries.value : "accessor-or-missing",
      );
    }
    iterator = Reflect.apply(entries.value, mapValue, []);
  } catch {
    return requestSchemaRefusal(
      ledger,
      frozenPath("realizedVoicings"),
      "unreadable-map",
    );
  }

  try {
    if (!isRecord(iterator)) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("realizedVoicings", "entries"),
        iterator,
      );
    }
    const nextMethod = dataValueSnapshot(iterator, "next");
    if (!nextMethod.ok || typeof nextMethod.value !== "function") {
      return requestSchemaRefusal(
        ledger,
        frozenPath("realizedVoicings", "entries", "next"),
        nextMethod.ok ? nextMethod.value : "accessor-or-missing",
      );
    }
    for (;;) {
      const next = iteratorResultSnapshot(
        Reflect.apply(nextMethod.value, iterator, []),
      );
      if (next === null) {
        return requestSchemaRefusal(
          ledger,
          frozenPath("realizedVoicings", "entries"),
          next,
        );
      }
      if (next.done) break;
      if (collected.length === MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS) {
        return realizationFailure(ledger, {
          code: "playback.realization_binding_limit",
          path: frozenPath("realizedVoicings"),
          received: MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS + 1,
          maximum: MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS,
        });
      }
      const pair = exactMapEntrySnapshot(next.value);
      if (pair === null || !isStableId(pair.key)) {
        return requestSchemaRefusal(
          ledger,
          frozenPath("realizedVoicings", "entries", collected.length),
          next.value,
        );
      }
      collected.push([
        pair.key as ChordEventId,
        pair.binding,
      ]);
      const memoryLimit = ledger.acceptPopulation(
        "peakBindingRecords",
        collected.length,
      );
      if (memoryLimit !== null) return memoryLimit;
    }
  } catch {
    return requestSchemaRefusal(
      ledger,
      frozenPath("realizedVoicings", "entries"),
      "unreadable-iterator",
    );
  }

  if (reportedSize !== null && collected.length !== reportedSize) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("realizedVoicings", "size"),
      reportedSize,
    );
  }
  collected.sort(([left], [right]) => compareUtf16(left, right));
  for (let index = 1; index < collected.length; index += 1) {
    const previous = collected[index - 1];
    const current = collected[index];
    if (previous !== undefined && current !== undefined && previous[0] === current[0]) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("realizedVoicings", current[0]),
        "duplicate-map-key",
      );
    }
  }
  for (let index = 0; index < collected.length; index += 1) {
    const entry = collected[index];
    if (entry === undefined) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("realizedVoicings", index),
        "sparse-binding-inventory",
      );
    }
    const bindingId = entry[0];
    const limit = ledger.increment("bindingsVisited");
    if (limit !== null) return limit;
    const envelope = validateBindingEnvelope(bindingId, entry[1], ledger);
    if ("ok" in envelope) return envelope;
    entry[1] = envelope;
    Object.freeze(entry);
  }
  return Object.freeze(collected) as EnumeratedBindings;
}

function compareUtf16(left: ChordEventId, right: ChordEventId): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function findInspectedBinding(
  sorted: EnumeratedBindings,
  eventId: ChordEventId,
): InspectedBinding | undefined {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const entry = sorted[middle];
    if (entry === undefined) return undefined;
    const comparison = compareUtf16(entry[0], eventId);
    if (comparison < 0) {
      low = middle + 1;
    } else if (comparison > 0) {
      high = middle - 1;
    } else {
      return entry[1];
    }
  }
  return undefined;
}

function bindingEnumerationIsFailure(
  value: EnumeratedBindings | CompilePlaybackPlanFailure,
): value is CompilePlaybackPlanFailure {
  return !Array.isArray(value);
}

function generatedCandidateFor(
  record: BoundSourceEventRecord,
): VoicingCandidate | null {
  const binding = record.binding;
  if (record.event.voicing.mode !== "auto" || binding.kind !== "generated") {
    return null;
  }
  if (!binding.outcome.ok) return null;
  return asVoicingCandidate(binding.outcome.candidate);
}

function storedPitchIsValid(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyOwnDataProperties(value, PITCH_KEYS)) {
    return false;
  }
  return (
    typeof value["step"] === "string" &&
    ["A", "B", "C", "D", "E", "F", "G"].includes(value["step"]) &&
    isSafeIntegerBetween(value["alter"], -2, 2) &&
    Number.isSafeInteger(value["octave"])
  );
}

function storedVoicingIsValid(value: unknown): boolean {
  if (!isRecord(value) || typeof value["mode"] !== "string") return false;
  const expectedKeys = value["mode"] === "manual"
    ? ["mode", "pitches", "bassPolicy"]
    : value["mode"] === "frozen"
      ? ["mode", "pitches", "bassPolicy", "generatedBy"]
      : null;
  if (
    expectedKeys === null ||
    !hasOnlyOwnDataProperties(value, expectedKeys) ||
    !["included", "external"].includes(String(value["bassPolicy"])) ||
    !isDataArray(value["pitches"], 16) ||
    value["pitches"].length === 0 ||
    !value["pitches"].every(storedPitchIsValid)
  ) {
    return false;
  }
  if (value["mode"] === "manual") return true;
  const generatedBy = value["generatedBy"];
  return (
    isRecord(generatedBy) &&
    hasOnlyOwnDataProperties(generatedBy, ["engineVersion", "family"]) &&
    isBoundedText(generatedBy["engineVersion"], 1, 64) &&
    generatedBy["engineVersion"].trim().length > 0 &&
    AUTO_VOICING_FAMILY_VALUES.includes(
      generatedBy["family"] as (typeof AUTO_VOICING_FAMILY_VALUES)[number],
    )
  );
}

function storedBindingIsExact(
  binding: unknown,
): boolean {
  if (
    !isRecord(binding) ||
    binding["kind"] !== "stored" ||
    !hasOnlyOwnDataProperties(binding, [
      "schema",
      "eventId",
      "kind",
      "result",
    ])
  ) {
    return false;
  }
  const result = binding["result"];
  if (
    !isRecord(result) ||
    !hasOnlyOwnDataProperties(result, [
      "schema",
      "kind",
      "voicing",
      "candidateGenerationPerformed",
      "rawCandidateCount",
      "retainedCandidateCount",
    ])
  ) {
    return false;
  }
  return (
    binding["schema"] === PLAYBACK_PLAN_REALIZATION_SCHEMA &&
    isStableId(binding["eventId"]) &&
    result["schema"] === THEORY_VOICING_RESULT_SCHEMA &&
    result["kind"] === "stored-bypass" &&
    storedVoicingIsValid(result["voicing"]) &&
    result["candidateGenerationPerformed"] === false &&
    result["rawCandidateCount"] === 0 &&
    result["retainedCandidateCount"] === 0
  );
}

function validateRealizations(
  records: readonly BoundSourceEventRecord[],
  ledger: WorkLedger,
): CompilePlaybackPlanFailure | null {
  for (const record of records) {
    if (
      record.event.voicing.mode !== "auto" &&
      !storedVoicingIsValid(record.event.voicing)
    ) {
      return requestSchemaRefusal(
        ledger,
        frozenPath(
          "document",
          "sections",
          record.sectionIndex,
          "measures",
          record.measureIndex,
          "events",
          record.eventIndex,
          "voicing",
        ),
        record.event.voicing,
      );
    }
  }

  for (const record of records) {
    const binding = record.binding;
    if (
      record.event.voicing.mode === "auto" &&
      binding.kind === "generated" &&
      !sameData(binding.request.resolved.source, record.event.chord)
    ) {
      return realizationFailure(ledger, {
        code: "playback.realization_source_chord_stale",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "request",
          "resolved",
          "source",
        ),
        eventId: record.eventId,
      });
    }
  }

  for (const record of records) {
    const binding = record.binding;
    if (
      record.event.voicing.mode === "auto" &&
      binding.kind === "generated" &&
      !sameData(binding.request.policy, record.event.voicing)
    ) {
      return realizationFailure(ledger, {
        code: "playback.realization_source_voicing_stale",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "request",
          "policy",
        ),
        eventId: record.eventId,
      });
    }
    if (
      record.event.voicing.mode !== "auto" &&
      binding.kind === "stored" &&
      storedBindingIsExact(binding) &&
      !sameData(binding.result.voicing, record.event.voicing)
    ) {
      return realizationFailure(ledger, {
        code: "playback.realization_source_voicing_stale",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "result",
          "voicing",
        ),
        eventId: record.eventId,
      });
    }
  }

  for (const record of records) {
    const binding = record.binding;
    if (
      record.event.voicing.mode === "auto" &&
      binding.kind === "generated" &&
      record.voicingFailure !== null
    ) {
      return realizationFailure(ledger, {
        code: "playback.realization_unavailable",
        path: frozenPath("realizedVoicings", record.eventId),
        eventId: record.eventId,
        voicingRefusalCode: record.voicingFailure.code,
        voicingTermination: record.voicingFailure.termination,
      });
    }
  }

  for (const record of records) {
    if (record.event.voicing.mode !== "auto") continue;
    const binding = record.binding;
    const candidateValue: unknown =
      binding.kind === "generated" && binding.outcome.ok
        ? binding.outcome.candidate
        : null;
    const reason =
      binding.kind === "generated" && binding.outcome.ok
        ? invalidGeneratedCandidateForRequestReason(
            candidateValue,
            binding.request,
            record.event.voicing,
          )
        : invalidGeneratedCandidateReason(candidateValue);
    if (reason !== null) {
      return realizationFailure(ledger, {
        code: "playback.generated_candidate_invalid",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "outcome",
          "candidate",
        ),
        eventId: record.eventId,
        reason,
      });
    }
  }

  for (const record of records) {
    const candidate = generatedCandidateFor(record);
    if (candidate === null) continue;
    const binding = record.binding;
    if (binding.kind !== "generated") continue;
    if (candidate.realizationId !== binding.request.realizationId) {
      return realizationFailure(ledger, {
        code: "playback.generated_candidate_realization_mismatch",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "outcome",
          "candidate",
          "realizationId",
        ),
        eventId: record.eventId,
        expected: binding.request.realizationId,
        received: candidate.realizationId,
      });
    }
  }

  for (const record of records) {
    const candidate = generatedCandidateFor(record);
    if (candidate === null || record.event.voicing.mode !== "auto") continue;
    if (candidate.family !== record.event.voicing.family) {
      return realizationFailure(ledger, {
        code: "playback.generated_candidate_policy_mismatch",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "outcome",
          "candidate",
          "family",
        ),
        eventId: record.eventId,
        expectedFamily: record.event.voicing.family,
        receivedFamily: candidate.family,
      });
    }
  }

  for (const record of records) {
    const candidate = generatedCandidateFor(record);
    if (candidate === null || record.event.voicing.mode !== "auto") continue;
    if (candidate.voices.length !== record.event.voicing.voiceCount) {
      return realizationFailure(ledger, {
        code: "playback.generated_candidate_voice_count_mismatch",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "outcome",
          "candidate",
          "voices",
        ),
        eventId: record.eventId,
        expected: record.event.voicing.voiceCount,
        received: candidate.voices.length,
      });
    }
  }

  for (const record of records) {
    const candidate = generatedCandidateFor(record);
    if (candidate === null) continue;
    const pitchOrdinal = candidatePitchMismatch(candidate);
    if (pitchOrdinal !== null) {
      return realizationFailure(ledger, {
        code: "playback.generated_candidate_pitch_mismatch",
        path: frozenPath(
          "realizedVoicings",
          record.eventId,
          "outcome",
          "candidate",
          "pitches",
          pitchOrdinal,
        ),
        eventId: record.eventId,
        pitchOrdinal,
      });
    }
  }

  for (const record of records) {
    if (
      record.event.chord.kind === "parsed" &&
      record.event.voicing.mode !== "auto"
    ) {
      const binding = record.binding;
      if (!storedBindingIsExact(binding)) {
        return realizationFailure(ledger, {
          code: "playback.stored_voicing_binding_mismatch",
          path: frozenPath(
            "realizedVoicings",
            record.eventId,
            "kind",
          ),
          eventId: record.eventId,
          mode: record.event.voicing.mode,
        });
      }
    }
  }

  for (const record of records) {
    if (record.event.chord.kind !== "custom") continue;
    const binding = record.binding;
    if (!storedBindingIsExact(binding)) {
      return realizationFailure(ledger, {
        code: "playback.custom_voicing_missing",
        path: frozenPath("realizedVoicings", record.eventId),
        eventId: record.eventId,
      });
    }
  }

  for (const record of records) {
    if (record.event.voicing.mode === "auto") {
      const candidate = generatedCandidateFor(record);
      if (candidate !== null) record.pitches = candidate.pitches;
    } else {
      record.pitches = record.event.voicing.pitches;
    }
  }

  return null;
}

type ValidLoop = Readonly<{
  range: BeatRange | null;
  startTick: number | null;
  endTick: number | null;
}>;

function validateLoop(
  requestedLoop: BeatRange | null,
  total: Fraction,
  ledger: WorkLedger,
): ValidLoop | CompilePlaybackPlanFailure {
  if (requestedLoop === null) {
    return { range: null, startTick: null, endTick: null };
  }

  const receivedLoop: unknown = requestedLoop;
  if (
    !isRecord(receivedLoop) ||
    !hasOnlyOwnDataProperties(receivedLoop, ["start", "end"]) ||
    !hasExactBeatRecordShape(receivedLoop["start"]) ||
    !hasExactBeatRecordShape(receivedLoop["end"])
  ) {
    return loopFailure(ledger, {
      code: "playback.loop_invalid",
      path: frozenPath("loop"),
      reason: "not-normalized",
    });
  }

  const receivedStart = receivedLoop["start"];
  const receivedEnd = receivedLoop["end"];
  const startNumerator = receivedStart["numerator"];
  const startDenominator = receivedStart["denominator"];
  const endNumerator = receivedEnd["numerator"];
  const endDenominator = receivedEnd["denominator"];
  if (
    typeof startNumerator !== "number" ||
    typeof startDenominator !== "number" ||
    typeof endNumerator !== "number" ||
    typeof endDenominator !== "number"
  ) {
    return loopFailure(ledger, {
      code: "playback.loop_invalid",
      path: frozenPath("loop"),
      reason: "not-normalized",
    });
  }

  let limit = ledger.increment("tickProjections");
  if (limit !== null) return limit;
  limit = ledger.increment("tickProjections");
  if (limit !== null) return limit;

  const start = readBeatFraction(
    { numerator: startNumerator, denominator: startDenominator },
    false,
  );
  const end = readBeatFraction(
    { numerator: endNumerator, denominator: endDenominator },
    false,
  );
  if (start === null || end === null) {
    return loopFailure(ledger, {
      code: "playback.loop_invalid",
      path: frozenPath("loop"),
      reason: "not-normalized",
    });
  }
  const startTick = midiTicksForFraction(start);
  const endTick = midiTicksForFraction(end);
  const startPosition = makeBeatPosition({
    numerator: startNumerator,
    denominator: startDenominator,
  });
  const endPosition = makeBeatPosition({
    numerator: endNumerator,
    denominator: endDenominator,
  });
  if (
    start.numerator !== BigInt(startNumerator) ||
    start.denominator !== BigInt(startDenominator) ||
    end.numerator !== BigInt(endNumerator) ||
    end.denominator !== BigInt(endDenominator) ||
    startTick === null ||
    endTick === null ||
    !startPosition.ok ||
    !endPosition.ok
  ) {
    return loopFailure(ledger, {
      code: "playback.loop_invalid",
      path: frozenPath("loop"),
      reason: "not-normalized",
    });
  }

  const ordering = compareFractions(start, end);
  if (ordering === 0) {
    return loopFailure(ledger, {
      code: "playback.loop_invalid",
      path: frozenPath("loop"),
      reason: "empty",
    });
  }
  if (ordering > 0) {
    return loopFailure(ledger, {
      code: "playback.loop_invalid",
      path: frozenPath("loop"),
      reason: "reversed",
    });
  }

  if (
    compareFractions(start, total) >= 0 ||
    compareFractions(end, total) > 0
  ) {
    return loopFailure(ledger, {
      code: "playback.loop_out_of_range",
      path: frozenPath("loop"),
      totalBeats: beatPositionFromFraction(total),
      loop: Object.freeze({
        start: startPosition.value,
        end: endPosition.value,
      }),
    });
  }

  return {
    range: Object.freeze({
      start: startPosition.value,
      end: endPosition.value,
    }),
    startTick,
    endTick,
  };
}

function copyPitches(
  source: NonEmptySpelledPitches,
  ledger: WorkLedger,
):
  | Readonly<{
      pitches: NonEmptySpelledPitches;
      midiPitches: NonEmptyMidiPitches;
    }>
  | CompilePlaybackPlanFailure {
  const pitches: SpelledPitch[] = [];
  const midiPitches: MidiPitch[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const sourcePitch = source[index];
    if (sourcePitch === undefined) {
      throw new Error("P0 received a sparse F3/V0 pitch array");
    }
    let limit = ledger.increment("pitchRecordsCopied");
    if (limit !== null) return limit;
    limit = ledger.acceptPopulation(
      "peakOutputPitchRecords",
      ledger.values.pitchRecordsCopied,
    );
    if (limit !== null) return limit;

    const copied = copyPitch(sourcePitch);
    const projection = projectSpelledPitch(copied);
    if (!projection.ok) {
      throw new Error("P0 received a non-projectable F3/V0 spelled pitch");
    }
    pitches.push(copied);
    midiPitches.push(projection.value.midi);
  }

  const frozenPitches = Object.freeze(pitches);
  const frozenMidiPitches = Object.freeze(midiPitches);
  return Object.freeze({
    pitches: frozenPitches as NonEmptySpelledPitches,
    midiPitches: frozenMidiPitches as NonEmptyMidiPitches,
  });
}

function pitchCopyIsFailure(
  value:
    | Readonly<{
        pitches: NonEmptySpelledPitches;
        midiPitches: NonEmptyMidiPitches;
      }>
    | CompilePlaybackPlanFailure,
): value is CompilePlaybackPlanFailure {
  return "ok" in value;
}

function compileEvents(
  records: readonly SourceEventRecord[],
  loop: ValidLoop,
  ledger: WorkLedger,
): readonly PlaybackEvent[] | CompilePlaybackPlanFailure {
  const output: PlaybackEvent[] = [];

  for (const record of records) {
    const sourceStartTick = record.sourceStartTick;
    const sourceDurationTicks = record.sourceDurationTicks;
    if (sourceStartTick === null || sourceDurationTicks === null) {
      throw new Error("P0 gate preflight did not reject nonintegral source time");
    }
    const sourceEndTick = sourceStartTick + sourceDurationTicks;

    let scheduledStartTick = sourceStartTick;
    let scheduledEndTick = sourceEndTick;
    let restarted = false;
    let endClipped = false;

    if (loop.range !== null) {
      const loopStartTick = loop.startTick;
      const loopEndTick = loop.endTick;
      if (loopStartTick === null || loopEndTick === null) {
        throw new Error("P0 validated loop lacks tick boundaries");
      }
      const limit = ledger.increment("loopIntersectionChecks");
      if (limit !== null) return limit;
      if (sourceStartTick >= loopEndTick || sourceEndTick <= loopStartTick) {
        continue;
      }

      restarted = sourceStartTick < loopStartTick;
      endClipped = sourceEndTick > loopEndTick;
      scheduledStartTick = Math.max(sourceStartTick, loopStartTick);
      scheduledEndTick = Math.min(sourceEndTick, loopEndTick);

      if (restarted) {
        const restartLimit = ledger.increment("exactBeatOperations");
        if (restartLimit !== null) return restartLimit;
      }
      const durationLimit = ledger.increment("exactBeatOperations");
      if (durationLimit !== null) return durationLimit;
    }

    const durationTicks = scheduledEndTick - scheduledStartTick;
    const gateLimit = ledger.increment("gateCalculations");
    if (gateLimit !== null) return gateLimit;
    const gateDurationTicks = Math.max(
      PLAYBACK_PLAN_MINIMUM_GATE_TICKS,
      durationTicks - PLAYBACK_PLAN_RELEASE_GAP_TICKS,
    );

    if (record.pitches === null) {
      throw new Error("P0 validated source record lacks realized pitches");
    }
    const pitchCopy = copyPitches(record.pitches, ledger);
    if (pitchCopyIsFailure(pitchCopy)) return pitchCopy;

    const sourceOffsetTicks = restarted
      ? scheduledStartTick - sourceStartTick
      : null;
    let articulation: PlaybackArticulationKind = "ordinary";
    if (restarted && endClipped) {
      articulation = "loop-restart-end-clipped";
    } else if (restarted) {
      articulation = "loop-restart";
    } else if (endClipped) {
      articulation = "loop-end-clipped";
    }

    const event = deepFreezeOwned({
      schema: PLAYBACK_EVENT_SCHEMA,
      ordinal: output.length,
      sourceOrdinal: record.sourceOrdinal,
      eventId: record.eventId,
      sectionId: record.sectionId,
      measureId: record.measureId,
      sourceStartBeat: beatPositionFromFraction(record.sourceStart),
      sourceDurationBeats: beatDurationFromFraction(record.sourceDuration),
      sourceStartTick: sourceStartTick as MidiTick,
      sourceDurationTicks: sourceDurationTicks as MidiTick,
      sourceOffsetBeats:
        sourceOffsetTicks === null
          ? null
          : beatDurationFromTicks(sourceOffsetTicks),
      sourceOffsetTicks:
        sourceOffsetTicks === null ? null : (sourceOffsetTicks as MidiTick),
      startBeat: beatPositionFromTicks(scheduledStartTick),
      durationBeats: beatDurationFromTicks(durationTicks),
      gateDurationBeats: beatDurationFromTicks(gateDurationTicks),
      startTick: scheduledStartTick as MidiTick,
      durationTicks: durationTicks as MidiTick,
      gateDurationTicks: gateDurationTicks as MidiTick,
      pitches: pitchCopy.pitches,
      midiPitches: pitchCopy.midiPitches,
      velocity: PLAYBACK_PLAN_FIXED_VELOCITY,
      articulation,
    } satisfies PlaybackEvent);

    const producedLimit = ledger.increment("eventsProduced");
    if (producedLimit !== null) return producedLimit;
    const memoryLimit = ledger.acceptPopulation(
      "peakOutputEventRecords",
      output.length + 1,
    );
    if (memoryLimit !== null) return memoryLimit;
    output.push(event);
  }

  return Object.freeze(output);
}

function isFailure(
  value: ValidLoop | CompilePlaybackPlanFailure,
): value is CompilePlaybackPlanFailure {
  return "ok" in value;
}

function resultIsFailure(
  value: readonly PlaybackEvent[] | CompilePlaybackPlanFailure,
): value is CompilePlaybackPlanFailure {
  return !Array.isArray(value);
}

const WORK_COUNTER_NAMES = Object.freeze([
  "sectionsVisited",
  "measuresVisited",
  "eventsVisited",
  "bindingsVisited",
  "bindingLookups",
  "exactBeatOperations",
  "tickProjections",
  "loopIntersectionChecks",
  "gateCalculations",
  "pitchRecordsCopied",
  "eventsProduced",
] as const satisfies readonly WorkCounterName[]);

function isWorkCounterName(
  counter: PlaybackPlanWorkCounterName,
): counter is WorkCounterName {
  return (WORK_COUNTER_NAMES as readonly PlaybackPlanWorkCounterName[]).includes(
    counter,
  );
}

export type PlaybackPlanCounterProbeSuccess = Readonly<{
  ok: true;
  counter: PlaybackPlanWorkCounterName;
  received: number;
  maximum: number;
  evidence: PlaybackPlanWorkEvidence & Readonly<{ termination: "complete" }>;
}>;

/**
 * Direct-file-only P0/verify seam for inclusive counter-boundary proofs. The
 * playback barrel intentionally does not re-export this helper.
 */
export function probePlaybackPlanCounterForTest(
  counter: PlaybackPlanWorkCounterName,
  received: number,
): PlaybackPlanCounterProbeSuccess | CompilePlaybackPlanFailure {
  const ledger = new WorkLedger();
  let refusal: CompilePlaybackPlanFailure | null;
  let maximum: number;

  if (isWorkCounterName(counter)) {
    maximum = PLAYBACK_PLAN_WORK_LIMITS[counter];
    ledger.values[counter] = Math.max(0, received - 1);
    refusal = ledger.increment(counter);
  } else if (counter === "peakTrackedRecords") {
    maximum = PLAYBACK_PLAN_MEMORY_LIMITS.peakTrackedRecords;
    const baseline = Math.max(0, received - 1);
    refusal = ledger.acceptTrackedRecordsForTest(baseline);
    if (refusal === null) {
      refusal = ledger.acceptTrackedRecordsForTest(received);
    }
  } else {
    const populationCounter: Exclude<
      MemoryCounterName,
      "peakTrackedRecords"
    > = counter;
    maximum = PLAYBACK_PLAN_MEMORY_LIMITS[populationCounter];
    const baseline = Math.max(0, received - 1);
    refusal = ledger.acceptPopulation(populationCounter, baseline);
    if (refusal === null) {
      refusal = ledger.acceptPopulation(populationCounter, received);
    }
  }

  if (refusal !== null) return refusal;
  return Object.freeze({
    ok: true,
    counter,
    received,
    maximum,
    evidence: ledger.evidence("complete"),
  });
}

function compilePlaybackPlanOwned(
  request: CompilePlaybackPlanRequest,
  ledger: WorkLedger,
): CompilePlaybackPlanResult {
  const requestValidation = validateRequestIdentity(request, ledger);
  if ("ok" in requestValidation) return requestValidation;
  const requestScalars = requestValidation;

  let limit = ledger.increment("tickProjections");
  if (limit !== null) return limit;
  const meterDuration = measureCapacity(requestScalars.meter);
  const meterFraction = readBeatFraction(meterDuration, true);
  if (meterFraction === null) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("document", "meter"),
      "invalid-meter-capacity",
    );
  }
  const meterTicks = midiTicksForFraction(meterFraction);
  if (meterTicks === null) {
    return requestSchemaRefusal(
      ledger,
      frozenPath("document", "meter"),
      "nonintegral-meter-capacity",
    );
  }

  const records: SourceEventRecord[] = [];
  const maximumTimeline: Fraction = {
    numerator: BigInt(MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS),
    denominator: 1n,
  };
  let timeline = ZERO_FRACTION;
  let timelineTicks: number | null = 0;

  for (
    let sectionIndex = 0;
    sectionIndex < requestScalars.sections.length;
    sectionIndex += 1
  ) {
    limit = ledger.increment("sectionsVisited");
    if (limit !== null) return limit;
    const sectionDescriptor = Object.getOwnPropertyDescriptor(
      requestScalars.sections,
      String(sectionIndex),
    );
    if (sectionDescriptor === undefined || !("value" in sectionDescriptor)) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("document", "sections", sectionIndex),
        "accessor-or-missing",
      );
    }
    const sectionValue: unknown = sectionDescriptor.value;
    if (!isRecord(sectionValue)) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("document", "sections", sectionIndex),
        sectionValue,
      );
    }
    const sectionIdDescriptor = Object.getOwnPropertyDescriptor(sectionValue, "id");
    const measuresDescriptor = Object.getOwnPropertyDescriptor(sectionValue, "measures");
    if (
      sectionIdDescriptor === undefined ||
      !("value" in sectionIdDescriptor) ||
      !isStableId(sectionIdDescriptor.value) ||
      measuresDescriptor === undefined ||
      !("value" in measuresDescriptor) ||
      !Array.isArray(measuresDescriptor.value)
    ) {
      return requestSchemaRefusal(
        ledger,
        frozenPath("document", "sections", sectionIndex),
        "invalid-section-scalars",
      );
    }
    const sectionId = sectionIdDescriptor.value as SectionId;
    const measures = measuresDescriptor.value as CompilePlaybackPlanRequest["document"]["sections"][number]["measures"];

    for (
      let measureIndex = 0;
      measureIndex < measures.length;
      measureIndex += 1
    ) {
      limit = ledger.increment("measuresVisited");
      if (limit !== null) return limit;
      const measureDescriptor = Object.getOwnPropertyDescriptor(
        measures,
        String(measureIndex),
      );
      if (measureDescriptor === undefined || !("value" in measureDescriptor)) {
        return requestSchemaRefusal(
          ledger,
          frozenPath("document", "sections", sectionIndex, "measures", measureIndex),
          "accessor-or-missing",
        );
      }
      const measureValue: unknown = measureDescriptor.value;
      if (!isRecord(measureValue)) {
        return requestSchemaRefusal(
          ledger,
          frozenPath("document", "sections", sectionIndex, "measures", measureIndex),
          measureValue,
        );
      }
      const measureIdDescriptor = Object.getOwnPropertyDescriptor(measureValue, "id");
      const eventsDescriptor = Object.getOwnPropertyDescriptor(measureValue, "events");
      const completionDescriptor = Object.getOwnPropertyDescriptor(
        measureValue,
        "completion",
      );
      if (
        measureIdDescriptor === undefined ||
        !("value" in measureIdDescriptor) ||
        !isStableId(measureIdDescriptor.value) ||
        eventsDescriptor === undefined ||
        !("value" in eventsDescriptor) ||
        !Array.isArray(eventsDescriptor.value) ||
        completionDescriptor === undefined ||
        !("value" in completionDescriptor) ||
        !isRecord(completionDescriptor.value)
      ) {
        return requestSchemaRefusal(
          ledger,
          frozenPath("document", "sections", sectionIndex, "measures", measureIndex),
          "invalid-measure-scalars",
        );
      }
      const measureId = measureIdDescriptor.value as MeasureId;
      const events = eventsDescriptor.value as readonly ChordEvent[];
      const completion = completionDescriptor.value;
      const completionKindDescriptor = Object.getOwnPropertyDescriptor(
        completion,
        "kind",
      );
      if (
        completionKindDescriptor === undefined ||
        !("value" in completionKindDescriptor) ||
        typeof completionKindDescriptor.value !== "string"
      ) {
        return requestSchemaRefusal(
          ledger,
          frozenPath(
            "document",
            "sections",
            sectionIndex,
            "measures",
            measureIndex,
            "completion",
          ),
          "invalid-completion-kind",
        );
      }

      if (completionKindDescriptor.value === "empty") {
        limit = ledger.increment("exactBeatOperations");
        if (limit !== null) return limit;
        timeline = addFractions(timeline, meterFraction);
        if (timelineTicks !== null) timelineTicks += meterTicks;
        if (compareFractions(timeline, maximumTimeline) > 0) {
          return timelineFailure(ledger, {
            code: "playback.timeline_total_exceeded",
            path: frozenPath(
              "document",
              "sections",
              sectionIndex,
              "measures",
              measureIndex,
            ),
            measureId,
            maximumQuarterNoteBeats:
              MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS,
          });
        }
        continue;
      }

      for (
        let eventIndex = 0;
        eventIndex < events.length;
        eventIndex += 1
      ) {
        limit = ledger.increment("eventsVisited");
        if (limit !== null) return limit;
        const eventDescriptor = Object.getOwnPropertyDescriptor(
          events,
          String(eventIndex),
        );
        if (eventDescriptor === undefined || !("value" in eventDescriptor)) {
          return requestSchemaRefusal(
            ledger,
            frozenPath(
              "document",
              "sections",
              sectionIndex,
              "measures",
              measureIndex,
              "events",
              eventIndex,
            ),
            "accessor-or-missing",
          );
        }
        const eventValue: unknown = eventDescriptor.value;
        if (!isRecord(eventValue)) {
          return requestSchemaRefusal(
            ledger,
            frozenPath(
              "document",
              "sections",
              sectionIndex,
              "measures",
              measureIndex,
              "events",
              eventIndex,
            ),
            eventValue,
          );
        }
        const eventIdDescriptor = Object.getOwnPropertyDescriptor(eventValue, "id");
        const durationDescriptor = Object.getOwnPropertyDescriptor(
          eventValue,
          "duration",
        );
        const chordDescriptor = Object.getOwnPropertyDescriptor(eventValue, "chord");
        const voicingDescriptor = Object.getOwnPropertyDescriptor(
          eventValue,
          "voicing",
        );
        if (
          eventIdDescriptor === undefined ||
          !("value" in eventIdDescriptor) ||
          !isStableId(eventIdDescriptor.value) ||
          durationDescriptor === undefined ||
          !("value" in durationDescriptor) ||
          !hasExactBeatRecordShape(durationDescriptor.value) ||
          chordDescriptor === undefined ||
          !("value" in chordDescriptor) ||
          voicingDescriptor === undefined ||
          !("value" in voicingDescriptor)
        ) {
          return requestSchemaRefusal(
            ledger,
            frozenPath(
              "document",
              "sections",
              sectionIndex,
              "measures",
              measureIndex,
              "events",
              eventIndex,
            ),
            "invalid-event-scalars",
          );
        }
        const eventId = eventIdDescriptor.value as ChordEventId;
        const durationValue = durationDescriptor.value;
        const durationSnapshot = Object.freeze({
          numerator: durationValue.numerator,
          denominator: durationValue.denominator,
        }) as BeatDuration;
        const event = eventValue as ChordEvent;

        limit = ledger.increment("tickProjections");
        if (limit !== null) return limit;
        const receivedDuration = readBeatFraction(durationSnapshot, true);
        const durationFraction = receivedDuration ?? ZERO_FRACTION;
        const durationTicks =
          receivedDuration === null
            ? null
            : midiTicksForFraction(receivedDuration);
        const sourceStartTick = timelineTicks;

        limit = ledger.acceptPopulation(
          "peakSourceEventIdentityRecords",
          records.length + 1,
        );
        if (limit !== null) return limit;
        records.push({
          sectionId,
          measureId,
          eventId,
          event,
          sectionIndex,
          measureIndex,
          eventIndex,
          sourceOrdinal: records.length,
          sourceStart: timeline,
          sourceDuration: durationFraction,
          sourceStartTick,
          sourceDurationTicks: durationTicks,
          sourceDurationInput: durationSnapshot,
          voicingFailure: null,
          binding: null,
          pitches: null,
        });

        limit = ledger.increment("exactBeatOperations");
        if (limit !== null) return limit;
        timeline = addFractions(timeline, durationFraction);
        timelineTicks =
          timelineTicks === null || durationTicks === null
            ? null
            : timelineTicks + durationTicks;
        if (compareFractions(timeline, maximumTimeline) > 0) {
          return timelineFailure(ledger, {
            code: "playback.timeline_total_exceeded",
            path: frozenPath(
              "document",
              "sections",
              sectionIndex,
              "measures",
              measureIndex,
            ),
            measureId,
            maximumQuarterNoteBeats:
              MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS,
          });
        }
      }
    }
  }

  const enumeratedBindings = enumerateBindings(requestScalars.realizedVoicings, ledger);
  if (bindingEnumerationIsFailure(enumeratedBindings)) return enumeratedBindings;
  const sortedBindings = enumeratedBindings;
  for (const record of records) {
    limit = ledger.increment("bindingLookups");
    if (limit !== null) return limit;
    const inspected = findInspectedBinding(sortedBindings, record.eventId);
    if (inspected === undefined) {
      return realizationFailure(ledger, {
        code: "playback.realization_binding_missing",
        path: frozenPath("realizedVoicings", record.eventId),
        eventId: record.eventId,
      });
    }
    record.binding = inspected.binding;
    record.voicingFailure = inspected.voicingFailure;
  }

  records.sort((left, right) => {
    const byId = compareUtf16(left.eventId, right.eventId);
    return byId === 0 ? left.sourceOrdinal - right.sourceOrdinal : byId;
  });
  let sourceIndex = 0;
  for (const [bindingId] of sortedBindings) {
    while (sourceIndex < records.length) {
      const sourceRecord = records[sourceIndex];
      if (
        sourceRecord === undefined ||
        compareUtf16(sourceRecord.eventId, bindingId) >= 0
      ) {
        break;
      }
      sourceIndex += 1;
    }
    if (
      sourceIndex >= records.length ||
      records[sourceIndex]?.eventId !== bindingId
    ) {
      return realizationFailure(ledger, {
        code: "playback.realization_binding_extra",
        path: frozenPath("realizedVoicings", bindingId),
        eventId: bindingId,
      });
    }
  }
  for (const [bindingId, inspected] of sortedBindings) {
    if (inspected.eventId !== bindingId) {
      return realizationFailure(ledger, {
        code: "playback.realization_binding_identity_mismatch",
        path: frozenPath("realizedVoicings", bindingId, "eventId"),
        mapEventId: bindingId,
        bindingEventId: inspected.eventId,
      });
    }
  }
  records.sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);

  const realizationRefusal = validateRealizations(
    records as readonly BoundSourceEventRecord[],
    ledger,
  );
  if (realizationRefusal !== null) return realizationRefusal;

  const loop = validateLoop(requestScalars.loop, timeline, ledger);
  if (isFailure(loop)) return loop;

  for (const record of records) {
    if (record.sourceDurationTicks === null) {
      return gateFailure(ledger, {
        code: "playback.gate_not_midi_integral",
        path: frozenPath(
          "document",
          "sections",
          record.sectionIndex,
          "measures",
          record.measureIndex,
          "events",
          record.eventIndex,
          "duration",
        ),
        eventId: record.eventId,
        durationBeats: copyMalformedDuration(record.sourceDurationInput),
        ppq: PLAYBACK_PLAN_MIDI_PPQ,
      });
    }
  }
  if (timelineTicks === null) {
    throw new Error("P0 nonintegral timeline escaped event gate preflight");
  }

  const events = compileEvents(records, loop, ledger);
  if (resultIsFailure(events)) return events;

  const plan = deepFreezeOwned({
    schema: PLAYBACK_PLAN_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    articulationPolicyId: PLAYBACK_ARTICULATION_POLICY_ID,
    articulationPolicyVersion: PLAYBACK_ARTICULATION_POLICY_VERSION,
    loopPolicyId: PLAYBACK_LOOP_POLICY_ID,
    loopPolicyVersion: PLAYBACK_LOOP_POLICY_VERSION,
    velocityPolicyId: PLAYBACK_VELOCITY_POLICY_ID,
    velocityPolicyVersion: PLAYBACK_VELOCITY_POLICY_VERSION,
    realizationBindingPolicyId: PLAYBACK_REALIZATION_BINDING_POLICY_ID,
    realizationBindingPolicyVersion:
      PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
    sourceDocumentId: requestScalars.documentId,
    midiPpq: PLAYBACK_PLAN_MIDI_PPQ,
    tempoBpm: requestScalars.tempoBpm,
    meter: Object.freeze({
      beatsPerBar: requestScalars.meter.beatsPerBar,
      beatUnit: requestScalars.meter.beatUnit,
    }),
    events,
    totalBeats: beatPositionFromFraction(timeline),
    totalTicks: timelineTicks as MidiTick,
    loop: loop.range,
    loopTicks:
      loop.range === null || loop.startTick === null || loop.endTick === null
        ? null
        : Object.freeze({
            start: loop.startTick as MidiTick,
            end: loop.endTick as MidiTick,
          }),
  } satisfies PlaybackPlan);

  return Object.freeze({
    schema: PLAYBACK_PLAN_RESULT_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    ok: true,
    plan,
    evidence: ledger.evidence("complete"),
  });
}

/** Compile one validated chart and its exact V0 bindings into immutable beats. */
export function compilePlaybackPlan(
  request: CompilePlaybackPlanRequest,
): CompilePlaybackPlanResult {
  const ledger = new WorkLedger();
  try {
    return compilePlaybackPlanOwned(request, ledger);
  } catch {
    return requestSchemaRefusal(
      ledger,
      frozenPath(),
      "unreadable-request",
    );
  }
}

export const playbackPlanOperations = Object.freeze({
  compilePlaybackPlan,
} satisfies PlaybackPlanOperations);
