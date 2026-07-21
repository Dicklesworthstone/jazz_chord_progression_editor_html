import {
  MAX_DOCUMENT_CHORD_EVENTS,
  MAX_DOCUMENT_SECTIONS,
  MAX_SECTION_MEASURES,
  MAX_TIMELINE_QUARTER_NOTE_BEATS,
  MAX_VOICING_PITCHES,
  MIDI_PPQ,
  type BeatDuration,
  type BeatPosition,
  type BeatRange,
  type ChordEventId,
  type DocumentId,
  type DomainPath,
  type FrozenVoicing,
  type ManualVoicing,
  type MeasureId,
  type Meter,
  type MidiPitch,
  type MidiTick,
  type NonEmptySpelledPitches,
  type SectionId,
  type ValidatedDocument,
} from "../domain";
import type {
  AutoVoicingRequest,
  SemanticRealizationId,
  StoredVoicingBypass,
  VoicingCandidate,
  VoicingFailure,
} from "../theory";

/** Versioned public contract for the P0 exact playback-plan compiler. */
export const PLAYBACK_PLAN_CONTRACT_SCHEMA =
  "changes.playback.plan-contract.v1";
export const PLAYBACK_PLAN_REQUEST_SCHEMA =
  "changes.playback.plan-request.v1";
export const PLAYBACK_PLAN_REALIZATION_SCHEMA =
  "changes.playback.realization-binding.v1";
export const PLAYBACK_PLAN_SCHEMA = "changes.playback.plan.v1";
export const PLAYBACK_EVENT_SCHEMA = "changes.playback.event.v1";
export const PLAYBACK_PLAN_RESULT_SCHEMA =
  "changes.playback.plan-result.v1";

export const PLAYBACK_PLAN_COMPILER_ID = "changes.playback-plan-compiler";
export const PLAYBACK_PLAN_COMPILER_VERSION = 1;
export const PLAYBACK_PLAN_COMPILER_VERSION_TAG =
  "changes.playback-plan-compiler.v1";
export const PLAYBACK_ARTICULATION_POLICY_ID =
  "changes.playback-articulation";
export const PLAYBACK_ARTICULATION_POLICY_VERSION = 1;
export const PLAYBACK_LOOP_POLICY_ID = "changes.playback-loop";
export const PLAYBACK_LOOP_POLICY_VERSION = 1;
export const PLAYBACK_VELOCITY_POLICY_ID = "changes.playback-velocity";
export const PLAYBACK_VELOCITY_POLICY_VERSION = 1;
export const PLAYBACK_REALIZATION_BINDING_POLICY_ID =
  "changes.playback-realization-binding";
export const PLAYBACK_REALIZATION_BINDING_POLICY_VERSION = 1;

export const PLAYBACK_PLAN_OPERATION_NAMES = Object.freeze([
  "compilePlaybackPlan",
] as const);
export type PlaybackPlanOperationName =
  (typeof PLAYBACK_PLAN_OPERATION_NAMES)[number];

export const PLAYBACK_ARTICULATION_KINDS = Object.freeze([
  "ordinary",
  "loop-restart",
  "loop-end-clipped",
  "loop-restart-end-clipped",
] as const);
export type PlaybackArticulationKind =
  (typeof PLAYBACK_ARTICULATION_KINDS)[number];

export const PLAYBACK_PLAN_TERMINATIONS = Object.freeze([
  "complete",
  "request-invalid",
  "timeline-invalid",
  "realization-invalid",
  "loop-invalid",
  "gate-invalid",
  "work-limit-exceeded",
] as const);
export type PlaybackPlanTermination =
  (typeof PLAYBACK_PLAN_TERMINATIONS)[number];

export const PLAYBACK_PLAN_REFUSAL_CODES = Object.freeze([
  "playback.request_schema_invalid",
  "playback.compiler_identity_invalid",
  "playback.policy_identity_invalid",
  "playback.timeline_total_exceeded",
  "playback.realization_binding_limit",
  "playback.realization_binding_missing",
  "playback.realization_binding_extra",
  "playback.realization_binding_identity_mismatch",
  "playback.realization_source_chord_stale",
  "playback.realization_source_voicing_stale",
  "playback.realization_unavailable",
  "playback.generated_candidate_invalid",
  "playback.generated_candidate_realization_mismatch",
  "playback.generated_candidate_policy_mismatch",
  "playback.generated_candidate_voice_count_mismatch",
  "playback.generated_candidate_pitch_mismatch",
  "playback.stored_voicing_binding_mismatch",
  "playback.custom_voicing_missing",
  "playback.loop_invalid",
  "playback.loop_out_of_range",
  "playback.gate_not_midi_integral",
  "limit.playback_plan_work_exceeded",
] as const);
export type PlaybackPlanRefusalCode =
  (typeof PLAYBACK_PLAN_REFUSAL_CODES)[number];

export const PLAYBACK_GENERATED_CANDIDATE_INVALID_REASONS = Object.freeze([
  "shape",
  "engine-identity",
  "candidate-identity",
  "voice-record",
  "pitch-projection",
  "constraint-evidence",
  "score-or-explanation",
] as const);
export type PlaybackGeneratedCandidateInvalidReason =
  (typeof PLAYBACK_GENERATED_CANDIDATE_INVALID_REASONS)[number];

/** First independently observable refusal wins. */
export const PLAYBACK_PLAN_REFUSAL_PRECEDENCE =
  PLAYBACK_PLAN_REFUSAL_CODES;

export const PLAYBACK_PLAN_MIDI_PPQ = MIDI_PPQ;
export const PLAYBACK_PLAN_FIXED_VELOCITY = 96;
export const PLAYBACK_PLAN_MINIMUM_GATE_TICKS = 1;
export const PLAYBACK_PLAN_RELEASE_GAP_TICKS = 24;
export const MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS =
  MAX_TIMELINE_QUARTER_NOTE_BEATS;
export const MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS =
  MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_PLAYBACK_PLAN_EVENTS = MAX_DOCUMENT_CHORD_EVENTS;
export const MAX_PLAYBACK_PLAN_PITCHES_PER_EVENT = MAX_VOICING_PITCHES;
export const MAX_PLAYBACK_PLAN_OUTPUT_PITCHES =
  MAX_PLAYBACK_PLAN_EVENTS * MAX_PLAYBACK_PLAN_PITCHES_PER_EVENT;
export const MAX_PLAYBACK_PLAN_MEASURES_VISITED =
  MAX_DOCUMENT_SECTIONS * MAX_SECTION_MEASURES;
export const MAX_PLAYBACK_PLAN_BINDING_LOOKUPS =
  MAX_PLAYBACK_PLAN_EVENTS;
export const MAX_PLAYBACK_PLAN_EXACT_BEAT_OPERATIONS =
  MAX_PLAYBACK_PLAN_MEASURES_VISITED + MAX_PLAYBACK_PLAN_EVENTS * 3;
export const MAX_PLAYBACK_PLAN_TICK_PROJECTIONS =
  MAX_PLAYBACK_PLAN_EVENTS + 3;
export const MAX_PLAYBACK_PLAN_LOOP_INTERSECTION_CHECKS =
  MAX_PLAYBACK_PLAN_EVENTS;
export const MAX_PLAYBACK_PLAN_GATE_CALCULATIONS =
  MAX_PLAYBACK_PLAN_EVENTS;
export const MAX_PLAYBACK_PLAN_SOURCE_EVENT_IDENTITY_RECORDS =
  MAX_PLAYBACK_PLAN_EVENTS;
export const MAX_PLAYBACK_PLAN_TRACKED_RECORDS =
  MAX_PLAYBACK_PLAN_SOURCE_EVENT_IDENTITY_RECORDS +
  MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS +
  MAX_PLAYBACK_PLAN_EVENTS +
  MAX_PLAYBACK_PLAN_OUTPUT_PITCHES;

export const PLAYBACK_ARTICULATION_POLICY = Object.freeze({
  midiPpq: PLAYBACK_PLAN_MIDI_PPQ,
  releaseGapTicks: PLAYBACK_PLAN_RELEASE_GAP_TICKS,
  minimumGateTicks: PLAYBACK_PLAN_MINIMUM_GATE_TICKS,
  gateFormula:
    "durationTicks-minus-minimum-of-releaseGapTicks-and-durationTicks-minus-one",
  applicationOrder: "after-loop-clipping",
  oneTickDuration: "full-gate",
  integralityGuard:
    "defensive-refusal-for-malformed-runtime-values-genuine-f1-values-are-integral",
  audioEnvelopeMilliseconds: "excluded-owned-by-instrument-recipe",
} as const);

export const PLAYBACK_LOOP_POLICY = Object.freeze({
  range: "half-open-start-inclusive-end-exclusive",
  sourceIntersection: "sourceStart<loopEnd-and-sourceEnd>loopStart",
  eventEndingAtLoopStart: "excluded",
  eventStartingAtLoopEnd: "excluded",
  overlapAtStart: "restart-at-loop-start-with-source-offset",
  overlapAtEnd: "clip-at-loop-end",
  outputOrder: "source-section-measure-event-order",
  emptyOrOutOfRange: "refuse-never-clamp",
  silentRange: "valid and may emit zero events",
} as const);

export const PLAYBACK_TIMELINE_POLICY = Object.freeze({
  timeUnit: "exact-quarter-note-beats",
  sourceOrder: "section-index-then-measure-index-then-event-index",
  completeMeasureDuration: "exact-event-duration-sum-equal-to-meter-capacity",
  pickupMeasureDuration: "exact-event-duration-sum",
  incompleteMeasureDuration: "exact-event-duration-sum",
  emptyMeasureDuration: "one-full-meter-capacity-of-silence",
  emptySectionDuration: "zero",
  emptyDocumentDuration: "zero",
  sectionVoiceLeadingResetAffectsTime: false,
  totalBeatsMeaning: "absolute-source-timeline-end",
  loopCoordinates: "absolute-source-timeline",
  maximumQuarterNoteBeats: MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS,
  timelineOverflow: "refuse-never-clamp-or-truncate",
  timelineOverflowRefusalCode: "playback.timeline_total_exceeded",
} as const);

export const PLAYBACK_VELOCITY_POLICY = Object.freeze({
  kind: "fixed",
  velocity: PLAYBACK_PLAN_FIXED_VELOCITY,
  minimum: 1,
  maximum: 127,
  accents: "not-in-version-1",
} as const);

export const PLAYBACK_REALIZATION_BINDING_POLICY = Object.freeze({
  coverage: "exactly-one-binding-per-source-event",
  mapKey: "exact-source-event-id",
  generated:
    "exact-v0-auto-request-plus-available-candidate-or-typed-v0-failure",
  stored:
    "exact-v0-stored-bypass-with-manual-or-frozen-pitch-order-preserved",
  staleDetection:
    "generated-request-source-chord-and-policy-or-stored-bypass-voicing-structural-equality",
  unrelatedMetadataEditsInvalidate: false,
  aliasOnlyStoredChordEditInvalidates: false,
  extraBindings: "refuse",
  candidateGenerationByP0: false,
  candidateSelectionByP0: false,
  fallbackPitches: false,
} as const);

export const PLAYBACK_PLAN_VALIDATION_PRECEDENCE = Object.freeze({
  refusalCodeOrder: PLAYBACK_PLAN_REFUSAL_CODES,
  sourceEventOrder: "section-index-then-measure-index-then-event-index",
  bindingEnumerationOrder: "event-id-utf16-code-unit",
  candidatePitchOrder: "low-to-high-candidate-array-index",
  storedPitchOrder: "stored-array-index-never-sorted",
  loopValidationOrder: Object.freeze(["shape", "order", "bounds"] as const),
  workLimitCheck: "before-accepting-the-record-that-would-exceed-the-limit",
  resourceExhaustionOverridesUnobservedLaterSemanticRefusals: true,
  partialPlanOnFailure: false,
} as const);

export const PLAYBACK_PLAN_OWN_KEY_ORDER = Object.freeze([
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
  "sourceDocumentId",
  "midiPpq",
  "tempoBpm",
  "meter",
  "events",
  "totalBeats",
  "totalTicks",
  "loop",
  "loopTicks",
] as const);

export const PLAYBACK_EVENT_OWN_KEY_ORDER = Object.freeze([
  "schema",
  "ordinal",
  "sourceOrdinal",
  "eventId",
  "sectionId",
  "measureId",
  "sourceStartBeat",
  "sourceDurationBeats",
  "sourceStartTick",
  "sourceDurationTicks",
  "sourceOffsetBeats",
  "sourceOffsetTicks",
  "startBeat",
  "durationBeats",
  "gateDurationBeats",
  "startTick",
  "durationTicks",
  "gateDurationTicks",
  "pitches",
  "midiPitches",
  "velocity",
  "articulation",
] as const);

export const PLAYBACK_PLAN_OUTPUT_POLICY = Object.freeze({
  planOwnKeyOrder: PLAYBACK_PLAN_OWN_KEY_ORDER,
  eventOwnKeyOrder: PLAYBACK_EVENT_OWN_KEY_ORDER,
  outputEventOrdinal: "zero-based-emitted-event-order",
  sourceEventOrdinal: "zero-based-global-source-event-order",
  pitchArray: "copied-recursively-frozen-never-aliased",
  midiPitchArray:
    "index-aligned-exact-projection-generated-from-v0-voices-or-stored-spelled-pitches",
  externalAutoBass: "excluded-exactly-as-declared-by-v0",
  eventArray: "recursively-frozen",
  plan: "recursively-frozen",
  inputMutation: "forbidden",
  ambientInputs: "date-random-locale-timezone-wall-time-forbidden",
} as const);

export const PLAYBACK_PLAN_WORK_COUNTER_NAMES = Object.freeze([
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
  "peakSourceEventIdentityRecords",
  "peakBindingRecords",
  "peakOutputEventRecords",
  "peakOutputPitchRecords",
  "peakTrackedRecords",
] as const);
export type PlaybackPlanWorkCounterName =
  (typeof PLAYBACK_PLAN_WORK_COUNTER_NAMES)[number];

export const PLAYBACK_PLAN_WORK_LIMITS = Object.freeze({
  sectionsVisited: MAX_DOCUMENT_SECTIONS,
  measuresVisited: MAX_PLAYBACK_PLAN_MEASURES_VISITED,
  eventsVisited: MAX_PLAYBACK_PLAN_EVENTS,
  bindingsVisited: MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS,
  bindingLookups: MAX_PLAYBACK_PLAN_BINDING_LOOKUPS,
  exactBeatOperations: MAX_PLAYBACK_PLAN_EXACT_BEAT_OPERATIONS,
  tickProjections: MAX_PLAYBACK_PLAN_TICK_PROJECTIONS,
  loopIntersectionChecks: MAX_PLAYBACK_PLAN_LOOP_INTERSECTION_CHECKS,
  gateCalculations: MAX_PLAYBACK_PLAN_GATE_CALCULATIONS,
  pitchRecordsCopied: MAX_PLAYBACK_PLAN_OUTPUT_PITCHES,
  eventsProduced: MAX_PLAYBACK_PLAN_EVENTS,
} as const);

export const PLAYBACK_PLAN_MEMORY_LIMITS = Object.freeze({
  peakSourceEventIdentityRecords:
    MAX_PLAYBACK_PLAN_SOURCE_EVENT_IDENTITY_RECORDS,
  peakBindingRecords: MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS,
  peakOutputEventRecords: MAX_PLAYBACK_PLAN_EVENTS,
  peakOutputPitchRecords: MAX_PLAYBACK_PLAN_OUTPUT_PITCHES,
  peakTrackedRecords: MAX_PLAYBACK_PLAN_TRACKED_RECORDS,
} as const);

export const PLAYBACK_PLAN_WORK_INCREMENT_POLICY = Object.freeze({
  sectionsVisited: "once-before-reading-each-source-section",
  measuresVisited: "once-before-reading-each-source-measure",
  eventsVisited: "once-before-reading-each-source-event",
  bindingsVisited:
    "once-per-map-entry-in-event-id-code-unit-order-during-preflight",
  bindingLookups: "once-per-source-event-after-map-preflight",
  exactBeatOperations: Object.freeze({
    sourceTimeline:
      "one-addition-per-source-event-plus-one-addition-per-empty-measure",
    loopRestartOffset:
      "one-subtraction-for-each-emitted-event-whose-source-start-precedes-loop-start",
    loopScheduledDuration:
      "one-subtraction-for-each-event-emitted-by-a-non-null-loop",
  }),
  tickProjections: Object.freeze({
    meterCapacity: "one-per-request",
    sourceDuration: "one-per-source-event",
    loopBoundary: "one-per-boundary-for-a-non-null-loop",
    accumulatedPositions:
      "maintained-by-exact-integer-addition-and-not-reprojected",
  }),
  loopIntersectionChecks:
    "zero-for-null-loop-otherwise-once-per-source-event",
  gateCalculations: "once-per-emitted-event-after-loop-clipping",
  pitchRecordsCopied: "once-per-pitch-of-each-emitted-event",
  eventsProduced: "once-after-an-output-event-is-complete",
  peakSourceEventIdentityRecords:
    "maximum-source-event-id-records-retained-during-the-call",
  peakBindingRecords: "realization-map-size-after-preflight",
  peakOutputEventRecords: "maximum-complete-output-events-retained",
  peakOutputPitchRecords: "maximum-output-pitch-records-retained",
  peakTrackedRecords:
    "sum-of-the-four-peak-record-populations-at-the-same-observation-point",
} as const);

type PlaybackRealizationIdentity = Readonly<{
  schema: typeof PLAYBACK_PLAN_REALIZATION_SCHEMA;
  eventId: ChordEventId;
}>;

export type AvailableGeneratedPlaybackRealization = Readonly<{
  ok: true;
  candidate: VoicingCandidate;
}>;

export type GeneratedPlaybackRealizationBinding =
  PlaybackRealizationIdentity &
    Readonly<{
      kind: "generated";
      request: AutoVoicingRequest;
      outcome: AvailableGeneratedPlaybackRealization | VoicingFailure;
    }>;

export type StoredPlaybackRealizationBinding =
  PlaybackRealizationIdentity &
    Readonly<{
      kind: "stored";
      result: StoredVoicingBypass<ManualVoicing | FrozenVoicing>;
    }>;

export type PlaybackRealizationBinding =
  | GeneratedPlaybackRealizationBinding
  | StoredPlaybackRealizationBinding;

export type PlaybackRealizationMap = ReadonlyMap<
  ChordEventId,
  PlaybackRealizationBinding
>;

export type NonEmptyMidiPitches = readonly [MidiPitch, ...MidiPitch[]];

export type CompilePlaybackPlanRequest = Readonly<{
  schema: typeof PLAYBACK_PLAN_REQUEST_SCHEMA;
  compilerId: typeof PLAYBACK_PLAN_COMPILER_ID;
  compilerVersion: typeof PLAYBACK_PLAN_COMPILER_VERSION;
  articulationPolicyId: typeof PLAYBACK_ARTICULATION_POLICY_ID;
  articulationPolicyVersion: typeof PLAYBACK_ARTICULATION_POLICY_VERSION;
  loopPolicyId: typeof PLAYBACK_LOOP_POLICY_ID;
  loopPolicyVersion: typeof PLAYBACK_LOOP_POLICY_VERSION;
  velocityPolicyId: typeof PLAYBACK_VELOCITY_POLICY_ID;
  velocityPolicyVersion: typeof PLAYBACK_VELOCITY_POLICY_VERSION;
  realizationBindingPolicyId:
    typeof PLAYBACK_REALIZATION_BINDING_POLICY_ID;
  realizationBindingPolicyVersion:
    typeof PLAYBACK_REALIZATION_BINDING_POLICY_VERSION;
  document: ValidatedDocument;
  realizedVoicings: PlaybackRealizationMap;
  loop: BeatRange | null;
}>;

export type PlaybackEvent = Readonly<{
  schema: typeof PLAYBACK_EVENT_SCHEMA;
  ordinal: number;
  sourceOrdinal: number;
  eventId: ChordEventId;
  sectionId: SectionId;
  measureId: MeasureId;
  sourceStartBeat: BeatPosition;
  sourceDurationBeats: BeatDuration;
  sourceStartTick: MidiTick;
  sourceDurationTicks: MidiTick;
  sourceOffsetBeats: BeatDuration | null;
  sourceOffsetTicks: MidiTick | null;
  startBeat: BeatPosition;
  durationBeats: BeatDuration;
  gateDurationBeats: BeatDuration;
  startTick: MidiTick;
  durationTicks: MidiTick;
  gateDurationTicks: MidiTick;
  pitches: NonEmptySpelledPitches;
  midiPitches: NonEmptyMidiPitches;
  velocity: typeof PLAYBACK_PLAN_FIXED_VELOCITY;
  articulation: PlaybackArticulationKind;
}>;

export type PlaybackPlan = Readonly<{
  schema: typeof PLAYBACK_PLAN_SCHEMA;
  compilerId: typeof PLAYBACK_PLAN_COMPILER_ID;
  compilerVersion: typeof PLAYBACK_PLAN_COMPILER_VERSION;
  articulationPolicyId: typeof PLAYBACK_ARTICULATION_POLICY_ID;
  articulationPolicyVersion: typeof PLAYBACK_ARTICULATION_POLICY_VERSION;
  loopPolicyId: typeof PLAYBACK_LOOP_POLICY_ID;
  loopPolicyVersion: typeof PLAYBACK_LOOP_POLICY_VERSION;
  velocityPolicyId: typeof PLAYBACK_VELOCITY_POLICY_ID;
  velocityPolicyVersion: typeof PLAYBACK_VELOCITY_POLICY_VERSION;
  realizationBindingPolicyId:
    typeof PLAYBACK_REALIZATION_BINDING_POLICY_ID;
  realizationBindingPolicyVersion:
    typeof PLAYBACK_REALIZATION_BINDING_POLICY_VERSION;
  sourceDocumentId: DocumentId;
  midiPpq: typeof PLAYBACK_PLAN_MIDI_PPQ;
  tempoBpm: number;
  meter: Meter;
  events: readonly PlaybackEvent[];
  totalBeats: BeatPosition;
  totalTicks: MidiTick;
  loop: BeatRange | null;
  loopTicks: Readonly<{ start: MidiTick; end: MidiTick }> | null;
}>;

export type PlaybackPlanWorkEvidence = Readonly<{
  sectionsVisited: number;
  measuresVisited: number;
  eventsVisited: number;
  bindingsVisited: number;
  bindingLookups: number;
  exactBeatOperations: number;
  tickProjections: number;
  loopIntersectionChecks: number;
  gateCalculations: number;
  pitchRecordsCopied: number;
  eventsProduced: number;
  peakSourceEventIdentityRecords: number;
  peakBindingRecords: number;
  peakOutputEventRecords: number;
  peakOutputPitchRecords: number;
  peakTrackedRecords: number;
  termination: PlaybackPlanTermination;
}>;

type PlaybackPlanPathRefusal<
  Code extends PlaybackPlanRefusalCode,
  Detail extends object = object,
> = Readonly<{ code: Code; path: DomainPath }> & Readonly<Detail>;

export type PlaybackPlanRequestRefusal =
  | PlaybackPlanPathRefusal<
      "playback.request_schema_invalid",
      { received: unknown }
    >
  | PlaybackPlanPathRefusal<
      "playback.compiler_identity_invalid",
      { receivedId: unknown; receivedVersion: unknown }
    >
  | PlaybackPlanPathRefusal<
      "playback.policy_identity_invalid",
      {
        policy:
          | "articulation"
          | "loop"
          | "velocity"
          | "realization-binding";
        receivedId: unknown;
        receivedVersion: unknown;
      }
    >;

export type PlaybackPlanTimelineRefusal = PlaybackPlanPathRefusal<
  "playback.timeline_total_exceeded",
  {
    measureId: MeasureId;
    maximumQuarterNoteBeats:
      typeof MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS;
  }
>;

export type PlaybackPlanRealizationRefusal =
  | PlaybackPlanPathRefusal<
      "playback.realization_binding_limit",
      { received: number; maximum: typeof MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS }
    >
  | PlaybackPlanPathRefusal<
      "playback.realization_binding_missing",
      { eventId: ChordEventId }
    >
  | PlaybackPlanPathRefusal<
      "playback.realization_binding_extra",
      { eventId: ChordEventId }
    >
  | PlaybackPlanPathRefusal<
      "playback.realization_binding_identity_mismatch",
      { mapEventId: ChordEventId; bindingEventId: ChordEventId }
    >
  | PlaybackPlanPathRefusal<
      "playback.realization_source_chord_stale",
      { eventId: ChordEventId }
    >
  | PlaybackPlanPathRefusal<
      "playback.realization_source_voicing_stale",
      { eventId: ChordEventId }
    >
  | PlaybackPlanPathRefusal<
      "playback.realization_unavailable",
      {
        eventId: ChordEventId;
        voicingRefusalCode: VoicingFailure["refusal"]["code"];
        voicingTermination: VoicingFailure["evidence"]["termination"];
      }
    >
  | PlaybackPlanPathRefusal<
      "playback.generated_candidate_invalid",
      { eventId: ChordEventId; reason: PlaybackGeneratedCandidateInvalidReason }
    >
  | PlaybackPlanPathRefusal<
      "playback.generated_candidate_realization_mismatch",
      {
        eventId: ChordEventId;
        expected: SemanticRealizationId;
        received: SemanticRealizationId;
      }
    >
  | PlaybackPlanPathRefusal<
      "playback.generated_candidate_policy_mismatch",
      { eventId: ChordEventId; expectedFamily: string; receivedFamily: string }
    >
  | PlaybackPlanPathRefusal<
      "playback.generated_candidate_voice_count_mismatch",
      { eventId: ChordEventId; expected: number; received: number }
    >
  | PlaybackPlanPathRefusal<
      "playback.generated_candidate_pitch_mismatch",
      { eventId: ChordEventId; pitchOrdinal: number }
    >
  | PlaybackPlanPathRefusal<
      "playback.stored_voicing_binding_mismatch",
      { eventId: ChordEventId; mode: "manual" | "frozen" }
    >
  | PlaybackPlanPathRefusal<
      "playback.custom_voicing_missing",
      { eventId: ChordEventId }
    >;

export type PlaybackPlanLoopRefusal =
  | PlaybackPlanPathRefusal<
      "playback.loop_invalid",
      { reason: "empty" | "reversed" | "not-normalized" }
    >
  | PlaybackPlanPathRefusal<
      "playback.loop_out_of_range",
      { totalBeats: BeatPosition; loop: BeatRange }
    >;

export type PlaybackPlanGateRefusal = PlaybackPlanPathRefusal<
  "playback.gate_not_midi_integral",
  {
    eventId: ChordEventId;
    durationBeats: BeatDuration;
    ppq: typeof PLAYBACK_PLAN_MIDI_PPQ;
  }
>;

export type PlaybackPlanWorkLimitRefusal = PlaybackPlanPathRefusal<
  "limit.playback_plan_work_exceeded",
  {
    counter: PlaybackPlanWorkCounterName;
    received: number;
    maximum: number;
    partialResult: false;
  }
>;

export type PlaybackPlanRefusal =
  | PlaybackPlanRequestRefusal
  | PlaybackPlanTimelineRefusal
  | PlaybackPlanRealizationRefusal
  | PlaybackPlanLoopRefusal
  | PlaybackPlanGateRefusal
  | PlaybackPlanWorkLimitRefusal;

type PlaybackPlanResultIdentity = Readonly<{
  schema: typeof PLAYBACK_PLAN_RESULT_SCHEMA;
  compilerId: typeof PLAYBACK_PLAN_COMPILER_ID;
  compilerVersion: typeof PLAYBACK_PLAN_COMPILER_VERSION;
}>;

export type CompilePlaybackPlanSuccess = PlaybackPlanResultIdentity &
  Readonly<{
    ok: true;
    plan: PlaybackPlan;
    evidence: PlaybackPlanWorkEvidence & Readonly<{ termination: "complete" }>;
  }>;

type CompilePlaybackPlanFailureCase<
  Refusal extends PlaybackPlanRefusal,
  Termination extends Exclude<PlaybackPlanTermination, "complete">,
> = PlaybackPlanResultIdentity &
  Readonly<{
    ok: false;
    refusal: Refusal;
    evidence: PlaybackPlanWorkEvidence & Readonly<{
      termination: Termination;
    }>;
  }>;

export type CompilePlaybackPlanFailure =
  | CompilePlaybackPlanFailureCase<
      PlaybackPlanRequestRefusal,
      "request-invalid"
    >
  | CompilePlaybackPlanFailureCase<
      PlaybackPlanTimelineRefusal,
      "timeline-invalid"
    >
  | CompilePlaybackPlanFailureCase<
      PlaybackPlanRealizationRefusal,
      "realization-invalid"
    >
  | CompilePlaybackPlanFailureCase<
      PlaybackPlanLoopRefusal,
      "loop-invalid"
    >
  | CompilePlaybackPlanFailureCase<
      PlaybackPlanGateRefusal,
      "gate-invalid"
    >
  | CompilePlaybackPlanFailureCase<
      PlaybackPlanWorkLimitRefusal,
      "work-limit-exceeded"
    >;

export type CompilePlaybackPlanResult =
  | CompilePlaybackPlanSuccess
  | CompilePlaybackPlanFailure;

export type CompilePlaybackPlan = (
  request: CompilePlaybackPlanRequest,
) => CompilePlaybackPlanResult;

export interface PlaybackPlanOperations {
  readonly compilePlaybackPlan: CompilePlaybackPlan;
}
