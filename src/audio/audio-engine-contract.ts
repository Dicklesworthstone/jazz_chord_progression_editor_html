import type { InstrumentId, MidiPitch } from "../domain";
import type { AudioPlatform } from "./audio-platform-contract";

/** Versioned public contract for the X0 persistent audio engine. */
export const AUDIO_ENGINE_CONTRACT_SCHEMA =
  "changes.audio.engine-contract.v1";
export const AUDIO_ENGINE_SNAPSHOT_SCHEMA =
  "changes.audio.engine-snapshot.v1";
export const AUDIO_ENGINE_POLICY_ID = "changes.audio-engine";
export const AUDIO_ENGINE_POLICY_VERSION = 1;
export const AUDIO_VOICE_REGISTRY_POLICY_ID =
  "changes.audio-active-voice-registry";
export const AUDIO_VOICE_REGISTRY_POLICY_VERSION = 1;

export const AUDIO_ENGINE_OPERATION_NAMES = Object.freeze([
  "initializeAudioEngine",
  "resumeAudioEngine",
  "setAudioMix",
  "attackAudioVoices",
  "retireAudioVoices",
  "inspectAudioEngine",
  "disposeAudioEngine",
  "prepareRenderedAudioVoices",
  "analyzeAudioOutput",
] as const);

/** One analysis window: 4096 samples balances bass resolution and latency. */
export const AUDIO_ANALYSIS_FFT_SIZE = 4_096;

export type AudioAnalysisDetectedNote = Readonly<{
  midiPitch: number;
  centsDeviation: number;
  strength: number;
}>;

/** Display-only spectral observation of the safety-gain tap. */
export type AudioAnalysisFrame = Readonly<{
  sampleRateHz: number;
  fftSize: number;
  samples: Float32Array;
  magnitudes: Float32Array;
  notes: readonly AudioAnalysisDetectedNote[];
  chroma: Float32Array;
}>;

export type AudioEngineOperationName =
  (typeof AUDIO_ENGINE_OPERATION_NAMES)[number];

export const AUDIO_ENGINE_STATES = Object.freeze([
  "uninitialized",
  "initializing",
  "ready",
  "suspended",
  "resuming",
  "fault",
  "closed",
] as const);

export type AudioEngineState = (typeof AUDIO_ENGINE_STATES)[number];

export const AUDIO_ENGINE_TERMINATIONS = Object.freeze([
  "completed",
  "refused",
  "platform-fault",
] as const);

export type AudioEngineTermination =
  (typeof AUDIO_ENGINE_TERMINATIONS)[number];

export const AUDIO_ENGINE_REFUSAL_CODES = Object.freeze([
  "audio.user_gesture_required",
  "audio.gesture_sequence_invalid",
  "audio.engine_closed",
  "audio.engine_not_ready",
  "audio.context_create_failed",
  "audio.context_resume_failed",
  "audio.context_unusable",
  "audio.context_sample_rate_unsupported",
  "audio.graph_create_failed",
  "audio.internal_sequence_exhausted",
  "audio.mix_invalid",
  "audio.owner_invalid",
  "audio.event_id_invalid",
  "audio.instrument_id_invalid",
  "audio.voice_batch_empty",
  "audio.voice_batch_limit",
  "audio.voice_id_invalid",
  "audio.voice_id_duplicate",
  "audio.midi_pitch_invalid",
  "audio.velocity_invalid",
  "audio.start_time_invalid",
  "audio.release_time_invalid",
  "audio.gate_duration_limit",
  "audio.retiring_voice_capacity",
  "audio.retirement_selector_invalid",
  "audio.retirement_time_invalid",
  "audio.dispose_reason_invalid",
  "audio.renderer_unavailable",
] as const);

export type AudioEngineRefusalCode =
  (typeof AUDIO_ENGINE_REFUSAL_CODES)[number];

export const AUDIO_DEBUG_EVENT_KINDS = Object.freeze([
  "context-create",
  "context-state",
  "graph-create",
  "graph-connect",
  "mix-ramp",
  "voice-attack",
  "voice-retrigger-retire",
  "voice-steal",
  "voice-release",
  "voice-cleanup",
  "voice-cleanup-stale",
  "operation-refused",
  "platform-fault",
  "engine-dispose",
] as const);

export type AudioDebugEventKind = (typeof AUDIO_DEBUG_EVENT_KINDS)[number];

export const AUDIO_VOICE_PHASES = Object.freeze([
  "scheduled",
  "attacking",
  "sustaining",
  "releasing",
] as const);

export type AudioVoicePhase = (typeof AUDIO_VOICE_PHASES)[number];

export const AUDIO_RETIREMENT_REASONS = Object.freeze([
  "natural-note-off",
  "preview-release",
  "voice-steal",
  "generation-retire",
  "all-notes-off",
  "note-retrigger",
  "page-teardown",
] as const);

export type AudioRetirementReason =
  (typeof AUDIO_RETIREMENT_REASONS)[number];

export const AUDIO_RETIREMENT_RELEASE_SECONDS = Object.freeze({
  "preview-release": 0.04,
  "voice-steal": 0.02,
  "generation-retire": 0.012,
  "all-notes-off": 0.012,
  "note-retrigger": 0.012,
  "page-teardown": 0,
} as const);

export const AUDIO_RETIREMENT_SELECTOR_KINDS = Object.freeze([
  "voice-ids",
  "event",
  "pitch",
  "generation",
  "preview",
  "owner",
  "all",
] as const);

export type AudioRetirementSelectorKind =
  (typeof AUDIO_RETIREMENT_SELECTOR_KINDS)[number];

export const AUDIO_ENGINE_WORK_COUNTER_NAMES = Object.freeze([
  "operationsStarted",
  "graphNodesCreated",
  "graphEdgesConnected",
  "impulseSamplesWritten",
  "voiceBatchesValidated",
  "voiceSpecsValidated",
  "voicesExaminedForRetrigger",
  "voicesExaminedForRetirement",
  "voicesExaminedForStealing",
  "voicesCreated",
  "scheduledSourcesCreated",
  "registryReads",
  "registryWrites",
  "parameterEventsScheduled",
  "cleanupCallbacksHandled",
] as const);

export type AudioEngineWorkCounters = Readonly<{
  operationsStarted: number;
  graphNodesCreated: number;
  graphEdgesConnected: number;
  impulseSamplesWritten: number;
  voiceBatchesValidated: number;
  voiceSpecsValidated: number;
  voicesExaminedForRetrigger: number;
  voicesExaminedForRetirement: number;
  voicesExaminedForStealing: number;
  voicesCreated: number;
  scheduledSourcesCreated: number;
  registryReads: number;
  registryWrites: number;
  parameterEventsScheduled: number;
  cleanupCallbacksHandled: number;
}>;

export const AUDIO_ID_PATTERN_SOURCE = "^[A-Za-z0-9][A-Za-z0-9._:-]*$";
export const MAX_AUDIO_ID_ASCII_LENGTH = 128;
export const MAX_AUDIO_GENERATION = Number.MAX_SAFE_INTEGER;
export const MAX_AUDIO_GESTURE_SEQUENCE = Number.MAX_SAFE_INTEGER;
export const MAX_AUDIO_INTERNAL_SEQUENCE = Number.MAX_SAFE_INTEGER;
export const MAX_AUDIO_NONRELEASING_VOICES = 64;
export const MAX_AUDIO_RETAINED_VOICES = 128;
export const MAX_AUDIO_PROGRESSION_VOICES = 48;
export const MAX_AUDIO_PREVIEW_VOICES = 16;
export const MAX_AUDIO_VOICES_PER_BATCH = 16;
export const MAX_AUDIO_SCHEDULE_LOOKAHEAD_SECONDS = 0.25;
export const MIN_AUDIO_GATE_SECONDS = 0.005;
export const MAX_AUDIO_GATE_SECONDS = 600;
export const MAX_AUDIO_RECIPE_RELEASE_SECONDS = 1.8;
export const AUDIO_SOURCE_STOP_PADDING_SECONDS = 0.02;
export const MAX_AUDIO_NATURAL_CLEANUP_SECONDS_AFTER_RELEASE = 8;
export const MAX_AUDIO_SCHEDULED_SOURCES_PER_VOICE = 7;
export const MAX_AUDIO_SCHEDULED_SOURCE_NODES = 896;
export const MAX_AUDIO_REGISTRY_INDEX_REFERENCES = 768;
export const MAX_AUDIO_PERSISTENT_CREATED_NODES = 12;
export const MAX_AUDIO_PERSISTENT_EDGES = 13;
export const MAX_AUDIO_IMPULSE_SCALAR_SAMPLES = 768_000;
export const MAX_AUDIO_IMPULSE_BYTES = 3_072_000;
export const MAX_AUDIO_SOFT_CLIP_CURVE_LENGTH = 4_097;
export const MAX_AUDIO_DEBUG_EVENTS = 4_096;

export const AUDIO_CONTEXT_CREATION_OPTIONS = Object.freeze({
  latencyHint: "interactive",
} as const);

export const AUDIO_MIX_POLICY = Object.freeze({
  minimumMasterVolume: 0,
  maximumMasterVolume: 1,
  minimumReverbAmount: 0,
  maximumReverbAmount: 1,
  reverbSendFormula: "reverbAmount*maximumReverbSendGain",
  automation: "cancel-and-hold-then-linear-ramp",
} as const);

export const AUDIO_RETRIGGER_POLICY = Object.freeze({
  match: "exact-owner-event-midi-pitch",
  ordering: "retire-old-before-create-or-start-new",
  releaseReason: "note-retrigger",
  voiceIdReuse: "allowed-after-instance-token-replacement",
} as const);

export const AUDIO_PARAMETER_SCHEDULING_POLICY = Object.freeze({
  amplitude:
    "set-zero-at-start; linear-to-normalized-velocity-peak-over-attack; linear-to-sustain-times-peak-over-decay; hold-until-release; linear-to-zero-over-selected-release",
  filter:
    "set-attack-hz-at-start; linear-to-peak-hz-over-amplitude-attack; exponential-to-sustain-hz-over-filter-decay",
  fmIndex:
    "set-velocity-scaled-peak-index-at-start; exponential-to-velocity-scaled-sustain-index-over-modulator-decay",
  transient:
    "set-normalized-velocity-component-level-at-start; linear-to-zero-over-transient-decay",
  tremolo:
    "unity-until-delay; then nonboosting-sine-multiplier-range-one-minus-depth-through-one-with-10ms-depth-ramp",
  naturalRelease: "recipe-amplitude-release-seconds",
  forcedRelease: "fixed-reason-release-seconds",
  cancellation:
    "cancel-and-hold-when-supported-otherwise-analytic-hold-then-cancel-and-set",
  sourceStop: "effective-release-end-plus-source-stop-padding",
} as const);

export const AUDIO_ESTIMATED_ENVELOPE_POLICY = Object.freeze({
  id: "changes.audio.estimated-envelope.v1",
  sampleTime: "voice-steal-selection-current-time",
  peakGain:
    "recipe.outputLevel/sqrt(originalBatchVoiceCount)*pow(velocity/127,1.5)",
  beforeStart: 0,
  attack:
    "peakGain*clamp((sampleTime-startTime)/attackSeconds,0,1)",
  decay:
    "peakGain*linearInterpolate(1,sustainLevel,decayProgress)",
  sustain: "peakGain*sustainLevel",
  release:
    "heldGainAtEffectiveRelease*max(0,1-releaseProgress)",
  afterRelease: 0,
  comparison: "finite-numeric-ascending",
} as const);

export const AUDIO_INITIALIZATION_VALIDATION_ORDER = Object.freeze([
  "closed-state",
  "trusted-gesture",
  "gesture-sequence",
  "initial-mix",
  "existing-or-pending-context-reuse",
  "context-create",
  "sample-rate",
  "persistent-graph-create",
  "context-resume",
] as const);

export const AUDIO_ATTACK_VALIDATION_ORDER = Object.freeze([
  "engine-state",
  "owner",
  "event-id",
  "instrument-id",
  "start-time",
  "release-time-and-gate",
  "batch-count",
  "voice-ids-and-duplicates",
  "midi-pitches",
  "velocities",
  "polyphony-feasibility",
] as const);

export const AUDIO_RETIREMENT_VALIDATION_ORDER = Object.freeze([
  "engine-state",
  "reason",
  "selector-shape-and-identities",
  "retirement-time",
] as const);

export const AUDIO_STEAL_ORDER = Object.freeze([
  "same-incoming-owner-before-other-owner",
  "lower-estimated-envelope-before-higher",
  "earlier-attack-before-later-attack",
  "voice-id-ascending-utf16",
] as const);

export const AUDIO_STEAL_ELIGIBILITY_POLICY =
  "nonreleasing-only-because-victim-must-reduce-admission-deficit" as const;

export const AUDIO_POLYPHONY_ENFORCEMENT_ORDER = Object.freeze([
  "retrigger-retirement",
  "owner-kind-limit",
  "instrument-recipe-limit",
  "global-limit",
  "retained-tail-capacity",
  "new-voice-creation",
] as const);

export type AudioUserGestureReceipt = Readonly<{
  kind: "trusted-pointer" | "trusted-keyboard";
  trusted: true;
  sequence: number;
}>;

export type AudioVoiceOwner =
  | Readonly<{
      kind: "progression";
      generation: number;
    }>
  | Readonly<{
      kind: "preview";
      generation: number;
      previewId: string;
    }>;

export type AudioVoiceSpec = Readonly<{
  voiceId: string;
  midiPitch: MidiPitch;
  velocity: number;
}>;

export type AudioAttackBatchRequest = Readonly<{
  owner: AudioVoiceOwner;
  eventId: string;
  instrumentId: InstrumentId;
  startTimeSeconds: number;
  releaseTimeSeconds: number;
  voices: readonly [AudioVoiceSpec, ...AudioVoiceSpec[]];
}>;

export type AudioRetirementSelector =
  | Readonly<{ kind: "voice-ids"; voiceIds: readonly [string, ...string[]] }>
  | Readonly<{ kind: "event"; owner: AudioVoiceOwner; eventId: string }>
  | Readonly<{ kind: "pitch"; owner: AudioVoiceOwner; midiPitch: MidiPitch }>
  | Readonly<{
      kind: "generation";
      ownerKind: AudioVoiceOwner["kind"];
      generation: number;
    }>
  | Readonly<{ kind: "preview"; generation: number; previewId: string }>
  | Readonly<{ kind: "owner"; owner: AudioVoiceOwner }>
  | Readonly<{ kind: "all" }>;

export type AudioRetireRequest = Readonly<{
  selector: AudioRetirementSelector;
  reason:
    | "preview-release"
    | "generation-retire"
    | "all-notes-off"
    | "page-teardown";
  atTimeSeconds: number;
}>;

export type AudioMix = Readonly<{
  masterVolume: number;
  reverbAmount: number;
}>;

export type InitializeAudioEngineRequest = Readonly<{
  gesture: AudioUserGestureReceipt;
  initialMix: AudioMix;
}>;

export type ResumeAudioEngineRequest = Readonly<{
  gesture: AudioUserGestureReceipt;
}>;

export type DisposeAudioEngineRequest = Readonly<{
  reason: "page-teardown";
}>;

export type AudioRegistryIndexCounts = Readonly<{
  voice: number;
  generation: number;
  event: number;
  pitch: number;
  owner: number;
  instrument: number;
  totalReferences: number;
}>;

export type AudioActiveVoiceSnapshot = Readonly<{
  voiceId: string;
  instanceToken: number;
  owner: AudioVoiceOwner;
  eventId: string;
  instrumentId: InstrumentId;
  midiPitch: MidiPitch;
  velocity: number;
  originalBatchVoiceCount: number;
  normalizationGain: number;
  velocityGain: number;
  phase: AudioVoicePhase;
  attackTimeSeconds: number;
  naturalReleaseTimeSeconds: number;
  effectiveReleaseTimeSeconds: number;
  releaseDurationSeconds: number;
  cleanupDeadlineSeconds: number;
  scheduledSourceCount: number;
}>;

export type AudioDebugEvent = Readonly<{
  sequence: number;
  kind: AudioDebugEventKind;
  graphInstanceId: number | null;
  voiceInstanceToken: number | null;
  voiceId: string | null;
  owner: AudioVoiceOwner | null;
  eventId: string | null;
  midiPitch: MidiPitch | null;
  scheduledTimeSeconds: number | null;
  detailCode: string;
}>;

export type AudioEngineSnapshot = Readonly<{
  schema: typeof AUDIO_ENGINE_SNAPSHOT_SCHEMA;
  state: AudioEngineState;
  graphInstanceId: number | null;
  contextState: "absent" | "suspended" | "running" | "closed" | "interrupted";
  contextSampleRate: number | null;
  mix: AudioMix;
  retainedVoiceCount: number;
  nonreleasingVoiceCount: number;
  releasingVoiceCount: number;
  progressionNonreleasingVoiceCount: number;
  previewNonreleasingVoiceCount: number;
  activeVoices: readonly AudioActiveVoiceSnapshot[];
  registryIndexCounts: AudioRegistryIndexCounts;
  persistentCreatedNodeCount: number;
  persistentEdgeCount: number;
  debugEvents: readonly AudioDebugEvent[];
  debugEventsDropped: number;
  work: AudioEngineWorkCounters;
}>;

export type AudioEngineRefusal = Readonly<{
  code: AudioEngineRefusalCode;
  path: readonly (string | number)[];
  state: AudioEngineState;
  retryable: boolean;
}>;

export type AudioEngineResult<Value> =
  | Readonly<{
      ok: true;
      value: Value;
      termination: "completed";
    }>
  | Readonly<{
      ok: false;
      refusal: AudioEngineRefusal;
      termination: "refused" | "platform-fault";
    }>;

export type AudioInitializationReceipt = Readonly<{
  graphInstanceId: number;
  reusedExistingGraph: boolean;
  state: "ready" | "suspended";
  snapshot: AudioEngineSnapshot;
}>;

export type AudioMixReceipt = Readonly<{
  previous: AudioMix;
  current: AudioMix;
  rampStartTimeSeconds: number;
  rampEndTimeSeconds: number;
}>;

export type AudioAttackReceipt = Readonly<{
  owner: AudioVoiceOwner;
  eventId: string;
  instrumentId: InstrumentId;
  attackedVoiceIds: readonly string[];
  retriggeredVoiceIds: readonly string[];
  stolenVoiceIds: readonly string[];
  normalizationGain: number;
  velocityGains: readonly number[];
  snapshot: AudioEngineSnapshot;
}>;

export type AudioRetirementReceipt = Readonly<{
  reason: AudioRetireRequest["reason"];
  matchedVoiceIds: readonly string[];
  newlyRetiredVoiceIds: readonly string[];
  alreadyRetiringVoiceIds: readonly string[];
  noFutureAttackPostcondition: boolean;
  snapshot: AudioEngineSnapshot;
}>;

export type AudioDisposeReceipt = Readonly<{
  graphInstanceId: number | null;
  retiredVoiceCount: number;
  contextClosed: boolean;
  snapshot: AudioEngineSnapshot;
}>;

export type AudioEngine = Readonly<{
  initializeAudioEngine(
    request: InitializeAudioEngineRequest,
  ): Promise<AudioEngineResult<AudioInitializationReceipt>>;
  resumeAudioEngine(
    request: ResumeAudioEngineRequest,
  ): Promise<AudioEngineResult<AudioInitializationReceipt>>;
  setAudioMix(mix: AudioMix): AudioEngineResult<AudioMixReceipt>;
  attackAudioVoices(
    request: AudioAttackBatchRequest,
  ): AudioEngineResult<AudioAttackReceipt>;
  retireAudioVoices(
    request: AudioRetireRequest,
  ): AudioEngineResult<AudioRetirementReceipt>;
  inspectAudioEngine(): AudioEngineSnapshot;
  disposeAudioEngine(
    request: DisposeAudioEngineRequest,
  ): Promise<AudioEngineResult<AudioDisposeReceipt>>;
  /**
   * Warm the rendered-instrument buffer cache for the given notes so the
   * synchronous attack path finds every buffer ready. Idempotent per note;
   * a non-rendered instrument resolves as an empty receipt. An attack that
   * misses the cache still succeeds by rendering synchronously — this
   * operation exists to keep that slow path off the scheduling deadline.
   */
  prepareRenderedAudioVoices(
    request: PrepareRenderedVoicesRequest,
  ): Promise<AudioEngineResult<PrepareRenderedVoicesReceipt>>;
  /**
   * Display-only spectral read of the master path via a dynamic analyser
   * tap. Pure observation for the analyzer panel: no state, registry, or
   * graph-count change; callable every animation frame.
   */
  analyzeAudioOutput(): AudioEngineResult<AudioAnalysisFrame>;
}>;

export type PrepareRenderedVoicesRequest = Readonly<{
  instrumentId: InstrumentId;
  notes: readonly Readonly<{ midiPitch: MidiPitch; velocity: number }>[];
}>;

export type PrepareRenderedVoicesReceipt = Readonly<{
  instrumentId: InstrumentId;
  renderedCount: number;
  cachedCount: number;
}>;

export type CreateAudioEngine = (platform: AudioPlatform) => AudioEngine;

export type AudioEngineOperations = Readonly<{
  createAudioEngine: CreateAudioEngine;
}>;
