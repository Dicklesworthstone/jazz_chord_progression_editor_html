import {
  makeInstrumentId,
  makeMidiPitch,
  type InstrumentId,
  type MidiPitch,
} from "../domain";
import {
  ActiveVoiceRegistry,
  compareSynthVoiceIdentity,
} from "./active-voice-registry";
import {
  createPulsePeriodicWave,
  createSoftClipCurve,
  evaluateLinearAutomation,
  holdAudioParamAtTime,
  writeDeterministicImpulse,
  type LinearAutomation,
} from "./audio-dsp";
import {
  AUDIO_CONTEXT_CREATION_OPTIONS,
  AUDIO_ENGINE_SNAPSHOT_SCHEMA,
  AUDIO_ID_PATTERN_SOURCE,
  AUDIO_MIX_POLICY,
  MAX_AUDIO_DEBUG_EVENTS,
  MAX_AUDIO_GATE_SECONDS,
  MAX_AUDIO_GENERATION,
  MAX_AUDIO_GESTURE_SEQUENCE,
  MAX_AUDIO_ID_ASCII_LENGTH,
  MAX_AUDIO_INTERNAL_SEQUENCE,
  MAX_AUDIO_NONRELEASING_VOICES,
  MAX_AUDIO_PREVIEW_VOICES,
  MAX_AUDIO_PROGRESSION_VOICES,
  MAX_AUDIO_RETAINED_VOICES,
  MAX_AUDIO_SCHEDULE_LOOKAHEAD_SECONDS,
  MAX_AUDIO_VOICES_PER_BATCH,
  MIN_AUDIO_GATE_SECONDS,
  type AudioAttackBatchRequest,
  type AudioAttackReceipt,
  type AudioDebugEvent,
  type AudioDebugEventKind,
  type AudioDisposeReceipt,
  type AudioEngine,
  type AudioEngineRefusalCode,
  type AudioEngineResult,
  type AudioEngineSnapshot,
  type AudioEngineState,
  type AudioEngineWorkCounters,
  type AudioInitializationReceipt,
  type AudioMix,
  type AudioMixReceipt,
  type AudioRetireRequest,
  type AudioRetirementReceipt,
  type AudioRetirementSelector,
  AUDIO_ANALYSIS_FFT_SIZE,
  type AudioAnalysisFrame,
  type AudioUserGestureReceipt,
  type AudioVoiceOwner,
  type PrepareRenderedVoicesReceipt,
  type PrepareRenderedVoicesRequest,
} from "./audio-engine-contract";
import {
  isExpressiveVoiceGesture,
  physicalGestureExcitationVelocity,
  physicalGestureFingerprint,
} from "./physical-realization";
import {
  PHYSICAL_RENDER_LIMITS,
  type ExpressiveVoiceGesture,
} from "./physical-renderer-contract";
import {
  CONCERT_GRAND_RENDERER_ALGORITHM_ID,
  WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
  loadConcertGrandRenderer,
  loadWaveguideRenderers,
  type ConcertGrandRenderer,
  type WaveguideRenderer,
} from "./dsp-renderer";
import {
  loadSampledInstrumentRenderer,
  type SampledInstrumentRenderer,
} from "./sampled-renderer";
import type {
  AnalyserNodePort,
  AudioBufferPort,
  AudioContextPort,
  AudioContextStatePort,
  AudioNodePort,
  AudioPlatform,
  BiquadFilterNodePort,
  ConvolverNodePort,
  DynamicsCompressorNodePort,
  GainNodePort,
  PeriodicWavePort,
  WaveShaperNodePort,
} from "./audio-platform-contract";
import {
  AUDIO_GRAPH_EDGE_ENTRIES,
  AUDIO_IMPULSE_POLICY,
  AUDIO_INSTRUMENT_RECIPES,
  AUDIO_PERSISTENT_GRAPH_SETTINGS,
  type AudioInstrumentRecipe,
  type AudioRenderedInstrumentRecipe,
} from "./instrument-recipes-contract";
import {
  cleanupSynthVoice,
  copyAudioOwner,
  estimateSynthVoiceGain,
  forceReleaseSynthVoice,
  isSynthVoiceRetiringAt,
  markSynthVoiceSourceEnded,
  normalizationGainForVoiceCount,
  prepareSynthVoice,
  sameAudioOwner,
  snapshotSynthVoice,
  startSynthVoice,
  velocityGainForVelocity,
  type ForcedAudioRetirementReason,
  type SynthVoice,
} from "./synth-voice";

type UnknownRecord = Record<string, unknown>;

type MutableWorkCounters = {
  -readonly [Name in keyof AudioEngineWorkCounters]: number;
};

type ValidationFailure = Readonly<{
  code: AudioEngineRefusalCode;
  path: readonly (string | number)[];
}>;

type ValidationResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; failure: ValidationFailure }>;

type ValidatedVoiceSpec = Readonly<{
  voiceId: string;
  midiPitch: MidiPitch;
  velocity: number;
  physicalGesture: ExpressiveVoiceGesture | null;
}>;

type ValidatedAttack = Readonly<{
  owner: AudioVoiceOwner;
  eventId: string;
  instrumentId: InstrumentId;
  startTimeSeconds: number;
  releaseTimeSeconds: number;
  voices: readonly ValidatedVoiceSpec[];
}>;

type PersistentGraph = {
  readonly instanceId: number;
  readonly context: AudioContextPort;
  readonly createdNodes: readonly AudioNodePort[];
  readonly instrumentBus: GainNodePort;
  readonly dcBlock: BiquadFilterNodePort;
  readonly lowShelf: BiquadFilterNodePort;
  readonly highShelf: BiquadFilterNodePort;
  readonly dryGain: GainNodePort;
  readonly reverbSend: GainNodePort;
  readonly convolver: ConvolverNodePort;
  readonly reverbReturn: GainNodePort;
  readonly dynamics: DynamicsCompressorNodePort;
  readonly softClip: WaveShaperNodePort;
  readonly safetyGain: GainNodePort;
  readonly masterGain: GainNodePort;
  readonly pulseWave: PeriodicWavePort;
  masterAutomation: LinearAutomation;
  reverbSendAutomation: LinearAutomation;
  disconnected: boolean;
};

type GraphBuildResult = Readonly<{
  graph: PersistentGraph;
  impulseSamplesWritten: number;
}>;

type SequenceKind = "graph" | "voice" | "debug";

class InternalSequenceExhausted extends Error {}

const AUDIO_ID_PATTERN = new RegExp(AUDIO_ID_PATTERN_SOURCE);

const EMPTY_WORK_COUNTERS: MutableWorkCounters = {
  operationsStarted: 0,
  graphNodesCreated: 0,
  graphEdgesConnected: 0,
  impulseSamplesWritten: 0,
  voiceBatchesValidated: 0,
  voiceSpecsValidated: 0,
  voicesExaminedForRetrigger: 0,
  voicesExaminedForRetirement: 0,
  voicesExaminedForStealing: 0,
  voicesCreated: 0,
  scheduledSourcesCreated: 0,
  registryReads: 0,
  registryWrites: 0,
  parameterEventsScheduled: 0,
  cleanupCallbacksHandled: 0,
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isAudioId(value: unknown): value is string {
  const match = typeof value === "string" ? AUDIO_ID_PATTERN.exec(value) : null;
  return (
    typeof value === "string" &&
    value.length <= MAX_AUDIO_ID_ASCII_LENGTH &&
    match?.[0] === value
  );
}

function isPositiveSafeInteger(value: unknown, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum
  );
}

function valid<Value>(value: Value): ValidationResult<Value> {
  return { ok: true, value };
}

function invalid<Value>(
  code: AudioEngineRefusalCode,
  path: readonly (string | number)[],
): ValidationResult<Value> {
  return { ok: false, failure: { code, path: Object.freeze([...path]) } };
}

function validateMix(value: unknown): ValidationResult<AudioMix> {
  if (!isRecord(value)) return invalid("audio.mix_invalid", ["mix"]);
  const masterVolume = value["masterVolume"];
  const reverbAmount = value["reverbAmount"];
  if (
    typeof masterVolume !== "number" ||
    !Number.isFinite(masterVolume) ||
    masterVolume < AUDIO_MIX_POLICY.minimumMasterVolume ||
    masterVolume > AUDIO_MIX_POLICY.maximumMasterVolume
  ) {
    return invalid("audio.mix_invalid", ["mix", "masterVolume"]);
  }
  if (
    typeof reverbAmount !== "number" ||
    !Number.isFinite(reverbAmount) ||
    reverbAmount < AUDIO_MIX_POLICY.minimumReverbAmount ||
    reverbAmount > AUDIO_MIX_POLICY.maximumReverbAmount
  ) {
    return invalid("audio.mix_invalid", ["mix", "reverbAmount"]);
  }
  return valid(Object.freeze({ masterVolume, reverbAmount }));
}

function validateGesture(
  value: unknown,
  lastAcceptedSequence: number,
): ValidationResult<AudioUserGestureReceipt> {
  if (
    !isRecord(value) ||
    value["trusted"] !== true ||
    (value["kind"] !== "trusted-pointer" &&
      value["kind"] !== "trusted-keyboard")
  ) {
    return invalid("audio.user_gesture_required", ["gesture"]);
  }
  const sequence = value["sequence"];
  if (
    !isPositiveSafeInteger(sequence, MAX_AUDIO_GESTURE_SEQUENCE) ||
    sequence <= lastAcceptedSequence
  ) {
    return invalid("audio.gesture_sequence_invalid", ["gesture", "sequence"]);
  }
  return valid(
    Object.freeze({
      kind: value["kind"],
      trusted: true,
      sequence,
    }),
  );
}

function expectedPhysicalFamily(
  instrumentId: InstrumentId,
): ExpressiveVoiceGesture["instrumentFamily"] | null {
  if (instrumentId === "clarinet") return "clarinet";
  if (instrumentId === "flute") return "flute";
  if (instrumentId === "guitar" || instrumentId === "blues-guitar") {
    return "guitar";
  }
  if (instrumentId === "vibraphone") return "vibraphone";
  return null;
}

/*
 * Compiled gesture voice identities are `physical.<family>.<24-hex>` (the hash
 * binds document identity and pitch ordinal, which this boundary cannot
 * re-derive). The format and family binding are still checkable here, and a
 * duplicate within one attack batch always indicates a mis-attached gesture.
 */
const PHYSICAL_GESTURE_VOICE_ID_HASH = /^[0-9a-f]{24}$/;

function isPhysicalGestureVoiceId(
  voiceId: string,
  family: ExpressiveVoiceGesture["instrumentFamily"],
): boolean {
  const prefix = `physical.${family}.`;
  return (
    voiceId.startsWith(prefix) &&
    PHYSICAL_GESTURE_VOICE_ID_HASH.test(voiceId.slice(prefix.length))
  );
}

function validateOwner(value: unknown): ValidationResult<AudioVoiceOwner> {
  if (!isRecord(value)) return invalid("audio.owner_invalid", ["owner"]);
  const kind = value["kind"];
  const generation = value["generation"];
  if (
    (kind !== "progression" && kind !== "preview") ||
    !isPositiveSafeInteger(generation, MAX_AUDIO_GENERATION)
  ) {
    return invalid("audio.owner_invalid", ["owner"]);
  }
  if (kind === "progression") {
    return valid(Object.freeze({ kind, generation }));
  }
  const previewId = value["previewId"];
  if (!isAudioId(previewId)) {
    return invalid("audio.owner_invalid", ["owner", "previewId"]);
  }
  return valid(Object.freeze({ kind, generation, previewId }));
}

function validateAttack(
  value: unknown,
  currentTimeSeconds: number,
  recordVoiceValidation: (count: number) => void,
): ValidationResult<ValidatedAttack> {
  if (!isRecord(value)) return invalid("audio.owner_invalid", ["owner"]);

  const owner = validateOwner(value["owner"]);
  if (!owner.ok) return owner;

  const eventId = value["eventId"];
  if (!isAudioId(eventId)) {
    return invalid("audio.event_id_invalid", ["eventId"]);
  }

  const instrumentValue = value["instrumentId"];
  if (typeof instrumentValue !== "string") {
    return invalid("audio.instrument_id_invalid", ["instrumentId"]);
  }
  const instrument = makeInstrumentId(instrumentValue);
  if (!instrument.ok) {
    return invalid("audio.instrument_id_invalid", ["instrumentId"]);
  }

  const startTimeSeconds = value["startTimeSeconds"];
  if (
    typeof startTimeSeconds !== "number" ||
    !Number.isFinite(startTimeSeconds) ||
    startTimeSeconds < currentTimeSeconds ||
    startTimeSeconds >
      currentTimeSeconds + MAX_AUDIO_SCHEDULE_LOOKAHEAD_SECONDS
  ) {
    return invalid("audio.start_time_invalid", ["startTimeSeconds"]);
  }

  const releaseTimeSeconds = value["releaseTimeSeconds"];
  if (
    typeof releaseTimeSeconds !== "number" ||
    !Number.isFinite(releaseTimeSeconds) ||
    releaseTimeSeconds <= startTimeSeconds ||
    releaseTimeSeconds - startTimeSeconds < MIN_AUDIO_GATE_SECONDS
  ) {
    return invalid("audio.release_time_invalid", ["releaseTimeSeconds"]);
  }
  if (releaseTimeSeconds - startTimeSeconds > MAX_AUDIO_GATE_SECONDS) {
    return invalid("audio.gate_duration_limit", ["releaseTimeSeconds"]);
  }

  const voicesValue = value["voices"];
  if (!isUnknownArray(voicesValue) || voicesValue.length === 0) {
    return invalid("audio.voice_batch_empty", ["voices"]);
  }
  if (voicesValue.length > MAX_AUDIO_VOICES_PER_BATCH) {
    return invalid("audio.voice_batch_limit", ["voices"]);
  }

  const records: UnknownRecord[] = [];
  const voiceIds: string[] = [];
  const seenVoiceIds = new Set<string>();
  for (let index = 0; index < voicesValue.length; index += 1) {
    const voiceValue = voicesValue[index];
    recordVoiceValidation(1);
    if (!isRecord(voiceValue)) {
      return invalid("audio.voice_id_invalid", ["voices", index, "voiceId"]);
    }
    const voiceId = voiceValue["voiceId"];
    if (!isAudioId(voiceId)) {
      return invalid("audio.voice_id_invalid", ["voices", index, "voiceId"]);
    }
    if (seenVoiceIds.has(voiceId)) {
      return invalid("audio.voice_id_duplicate", ["voices", index, "voiceId"]);
    }
    seenVoiceIds.add(voiceId);
    voiceIds.push(voiceId);
    records.push(voiceValue);
  }

  const midiPitches: MidiPitch[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const midiValue = records[index]?.["midiPitch"];
    if (typeof midiValue !== "number") {
      return invalid("audio.midi_pitch_invalid", ["voices", index, "midiPitch"]);
    }
    const midiPitch = makeMidiPitch(midiValue);
    if (!midiPitch.ok) {
      return invalid("audio.midi_pitch_invalid", ["voices", index, "midiPitch"]);
    }
    midiPitches.push(midiPitch.value);
  }

  const velocities: number[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const velocity = records[index]?.["velocity"];
    if (
      typeof velocity !== "number" ||
      !Number.isInteger(velocity) ||
      velocity < 1 ||
      velocity > 127
    ) {
      return invalid("audio.velocity_invalid", ["voices", index, "velocity"]);
    }
    velocities.push(velocity);
  }

  const physicalGestures: Array<ExpressiveVoiceGesture | null> = [];
  const expectedFamily = expectedPhysicalFamily(instrument.value);
  const expectedVersionId = `changes.physical.${instrument.value}.v2`;
  const seenGestureVoiceIds = new Set<string>();
  for (let index = 0; index < records.length; index += 1) {
    const gesture = records[index]?.["physicalGesture"];
    if (gesture === undefined) {
      physicalGestures.push(null);
      continue;
    }
    if (
      !isExpressiveVoiceGesture(gesture) ||
      gesture.eventId !== eventId ||
      gesture.instrumentFamily !== expectedFamily ||
      gesture.instrumentVersionId !== expectedVersionId ||
      !isPhysicalGestureVoiceId(gesture.voiceId, gesture.instrumentFamily) ||
      seenGestureVoiceIds.has(gesture.voiceId)
    ) {
      return invalid("audio.voice_id_invalid", [
        "voices",
        index,
        "physicalGesture",
      ]);
    }
    seenGestureVoiceIds.add(gesture.voiceId);
    physicalGestures.push(gesture);
  }

  const voices: ValidatedVoiceSpec[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const voiceId = voiceIds[index];
    const midiPitch = midiPitches[index];
    const velocity = velocities[index];
    const physicalGesture = physicalGestures[index];
    if (
      voiceId === undefined ||
      midiPitch === undefined ||
      velocity === undefined ||
      physicalGesture === undefined
    ) {
      throw new Error("AUDIO_VALIDATION_PARALLEL_ARRAY_MISMATCH");
    }
    voices.push(Object.freeze({
      voiceId,
      midiPitch,
      velocity,
      physicalGesture,
    }));
  }

  return valid(
    Object.freeze({
      owner: owner.value,
      eventId,
      instrumentId: instrument.value,
      startTimeSeconds,
      releaseTimeSeconds,
      voices: Object.freeze(voices),
    }),
  );
}

function validateRetirementSelector(
  value: unknown,
): ValidationResult<AudioRetirementSelector> {
  if (!isRecord(value)) {
    return invalid("audio.retirement_selector_invalid", ["selector"]);
  }
  const kind = value["kind"];
  if (kind === "all") return valid(Object.freeze({ kind }));
  if (kind === "voice-ids") {
    const voiceIdsValue = value["voiceIds"];
    if (!isUnknownArray(voiceIdsValue) || voiceIdsValue.length === 0) {
      return invalid("audio.retirement_selector_invalid", ["selector", "voiceIds"]);
    }
    const voiceIds: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < voiceIdsValue.length; index += 1) {
      const voiceId = voiceIdsValue[index];
      if (!isAudioId(voiceId) || seen.has(voiceId)) {
        return invalid("audio.retirement_selector_invalid", [
          "selector",
          "voiceIds",
          index,
        ]);
      }
      seen.add(voiceId);
      voiceIds.push(voiceId);
    }
    const first = voiceIds[0];
    if (first === undefined) {
      return invalid("audio.retirement_selector_invalid", ["selector", "voiceIds"]);
    }
    const voiceIdTuple: [string, ...string[]] = [first, ...voiceIds.slice(1)];
    return valid(
      Object.freeze({
        kind,
        voiceIds: Object.freeze(voiceIdTuple),
      }),
    );
  }
  if (kind === "event" || kind === "pitch" || kind === "owner") {
    const owner = validateOwner(value["owner"]);
    if (!owner.ok) {
      return invalid("audio.retirement_selector_invalid", ["selector", "owner"]);
    }
    if (kind === "owner") {
      return valid(Object.freeze({ kind, owner: owner.value }));
    }
    if (kind === "event") {
      const eventId = value["eventId"];
      if (!isAudioId(eventId)) {
        return invalid("audio.retirement_selector_invalid", [
          "selector",
          "eventId",
        ]);
      }
      return valid(Object.freeze({ kind, owner: owner.value, eventId }));
    }
    const midiValue = value["midiPitch"];
    if (typeof midiValue !== "number") {
      return invalid("audio.retirement_selector_invalid", [
        "selector",
        "midiPitch",
      ]);
    }
    const midiPitch = makeMidiPitch(midiValue);
    if (!midiPitch.ok) {
      return invalid("audio.retirement_selector_invalid", [
        "selector",
        "midiPitch",
      ]);
    }
    return valid(
      Object.freeze({ kind, owner: owner.value, midiPitch: midiPitch.value }),
    );
  }
  if (kind === "generation") {
    const ownerKind = value["ownerKind"];
    const generation = value["generation"];
    if (
      (ownerKind !== "progression" && ownerKind !== "preview") ||
      !isPositiveSafeInteger(generation, MAX_AUDIO_GENERATION)
    ) {
      return invalid("audio.retirement_selector_invalid", ["selector"]);
    }
    return valid(Object.freeze({ kind, ownerKind, generation }));
  }
  if (kind === "preview") {
    const generation = value["generation"];
    const previewId = value["previewId"];
    if (
      !isPositiveSafeInteger(generation, MAX_AUDIO_GENERATION) ||
      !isAudioId(previewId)
    ) {
      return invalid("audio.retirement_selector_invalid", ["selector"]);
    }
    return valid(Object.freeze({ kind, generation, previewId }));
  }
  return invalid("audio.retirement_selector_invalid", ["selector", "kind"]);
}

function validateRetirement(
  value: unknown,
  currentTimeSeconds: number,
): ValidationResult<{
  selector: AudioRetirementSelector;
  reason: AudioRetireRequest["reason"];
  atTimeSeconds: number;
}> {
  if (!isRecord(value)) {
    return invalid("audio.retirement_selector_invalid", ["selector"]);
  }
  const reason = value["reason"];
  if (
    reason !== "preview-release" &&
    reason !== "generation-retire" &&
    reason !== "all-notes-off" &&
    reason !== "page-teardown"
  ) {
    return invalid("audio.retirement_selector_invalid", ["reason"]);
  }
  const selector = validateRetirementSelector(value["selector"]);
  if (!selector.ok) return selector;
  const atTimeSeconds = value["atTimeSeconds"];
  if (
    typeof atTimeSeconds !== "number" ||
    !Number.isFinite(atTimeSeconds) ||
    atTimeSeconds < currentTimeSeconds ||
    atTimeSeconds >
      currentTimeSeconds + MAX_AUDIO_SCHEDULE_LOOKAHEAD_SECONDS
  ) {
    return invalid("audio.retirement_time_invalid", ["atTimeSeconds"]);
  }
  return valid(
    Object.freeze({ selector: selector.value, reason, atTimeSeconds }),
  );
}

function recipeForInstrument(instrumentId: InstrumentId): AudioInstrumentRecipe {
  switch (instrumentId) {
    case "mellow-keys":
      return AUDIO_INSTRUMENT_RECIPES[0];
    case "fm-electric-piano":
      return AUDIO_INSTRUMENT_RECIPES[1];
    case "vibraphone":
      return AUDIO_INSTRUMENT_RECIPES[2];
    case "warm-pad":
      return AUDIO_INSTRUMENT_RECIPES[3];
    case "analog-poly":
      return AUDIO_INSTRUMENT_RECIPES[4];
    case "concert-grand":
      return AUDIO_INSTRUMENT_RECIPES[5];
    case "flute":
      return AUDIO_INSTRUMENT_RECIPES[6];
    case "organ":
      return AUDIO_INSTRUMENT_RECIPES[7];
    case "guitar":
      return AUDIO_INSTRUMENT_RECIPES[8];
    case "dreadnought-guitar":
      return AUDIO_INSTRUMENT_RECIPES[9];
    case "ukulele":
      return AUDIO_INSTRUMENT_RECIPES[10];
    case "upright-bass":
      return AUDIO_INSTRUMENT_RECIPES[11];
    case "concert-vibes":
      return AUDIO_INSTRUMENT_RECIPES[12];
    case "blues-guitar":
      return AUDIO_INSTRUMENT_RECIPES[13];
    case "clarinet":
      return AUDIO_INSTRUMENT_RECIPES[14];
    case "physical-upright-bass":
      return AUDIO_INSTRUMENT_RECIPES[15];
  }
}

function contextStateForSnapshot(
  state: AudioContextStatePort | "absent",
): AudioEngineSnapshot["contextState"] {
  return state;
}

function retryableForCode(code: AudioEngineRefusalCode): boolean {
  return (
    code !== "audio.engine_closed" &&
    code !== "audio.internal_sequence_exhausted" &&
    code !== "audio.dispose_reason_invalid"
  );
}

function compareStealCandidates(
  left: SynthVoice,
  right: SynthVoice,
  incomingOwner: AudioVoiceOwner,
  atTimeSeconds: number,
): number {
  const leftSameOwner = sameAudioOwner(left.owner, incomingOwner);
  const rightSameOwner = sameAudioOwner(right.owner, incomingOwner);
  if (leftSameOwner !== rightSameOwner) return leftSameOwner ? -1 : 1;
  const leftGain = estimateSynthVoiceGain(left, atTimeSeconds);
  const rightGain = estimateSynthVoiceGain(right, atTimeSeconds);
  if (!Number.isFinite(leftGain) || !Number.isFinite(rightGain)) {
    throw new Error("AUDIO_ESTIMATED_ENVELOPE_NOT_FINITE");
  }
  if (leftGain !== rightGain) return leftGain - rightGain;
  if (left.attackTimeSeconds !== right.attackTimeSeconds) {
    return left.attackTimeSeconds - right.attackTimeSeconds;
  }
  const identity = compareSynthVoiceIdentity(left, right);
  if (identity !== 0) return identity;
  return left.instanceToken - right.instanceToken;
}

export type AudioEngineSequenceSeedForTest = Readonly<{
  lastGraphSequence: number;
  lastVoiceSequence: number;
  lastDebugSequence: number;
}>;

const ZERO_AUDIO_ENGINE_SEQUENCE_SEED = Object.freeze({
  lastGraphSequence: 0,
  lastVoiceSequence: 0,
  lastDebugSequence: 0,
}) satisfies AudioEngineSequenceSeedForTest;

function isValidInternalSequenceSeed(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_AUDIO_INTERNAL_SEQUENCE
  );
}

export type AudioEngineRenderCacheLimitsForTest = Readonly<{
  maximumCacheEntries?: number;
  maximumCachePcmBytes?: number;
}>;

function createAudioEngineInternal(
  platform: AudioPlatform,
  sequenceSeed: AudioEngineSequenceSeedForTest,
  renderCacheLimitsForTest: AudioEngineRenderCacheLimitsForTest = {},
): AudioEngine {
  const maximumGlobalCacheEntries =
    renderCacheLimitsForTest.maximumCacheEntries ??
      PHYSICAL_RENDER_LIMITS.maximumCacheEntries;
  const maximumGlobalCachePcmBytes =
    renderCacheLimitsForTest.maximumCachePcmBytes ??
      PHYSICAL_RENDER_LIMITS.maximumCachePcmBytes;
  let state: AudioEngineState = "uninitialized";
  let currentContext: AudioContextPort | null = null;
  let currentGraph: PersistentGraph | null = null;
  /**
   * Rendered-instrument state. The renderer loads once during the first
   * initialization; a failed load leaves it null and rendered attacks refuse
   * with `audio.renderer_unavailable` while oscillator recipes keep working.
   * The cache holds context-owned buffers keyed by instrument/pitch/velocity
   * with least-recently-used eviction at the recipe's declared limit.
   */
  const RENDER_VELOCITY_BAND = 21;
  /** Prepare warms the short bucket the performance layer actually uses. */
  const PREPARE_RENDER_SECONDS = 2;
  let renderer: ConcertGrandRenderer | null = null;
  /**
   * Sampled renderers (jcpe-1miv) resolve lazily and synchronously by the
   * recipe's algorithm id: their payloads are checked-in TypeScript with no
   * instantiation step, so first use decodes the payload and a corrupt
   * payload registers as permanently unavailable — the same
   * `audio.renderer_unavailable` refusal lane the wasm renderer uses,
   * while every other recipe keeps working. The wasm renderer stays a
   * dedicated field because it additionally owns `analyzeWindow`.
   */
  const sampledRenderers = new Map<string, SampledInstrumentRenderer | null>();
  /**
   * Waveguide renderers (physically modeled guitar/flute) share the wasm
   * instance with the concert grand and load with it; the map stays null
   * until that load succeeds, and rendered attacks for those recipes
   * refuse with `audio.renderer_unavailable` in the meantime.
   */
  let waveguideRenderers: ReadonlyMap<string, WaveguideRenderer> | null = null;
  function rendererForAlgorithm(
    algorithmId: string,
  ): Readonly<{
    algorithmId: string;
    renderNote: (
      midiPitch: number,
      velocity: number,
      sampleRateHz: number,
      maxSeconds?: number,
      variationSlot?: number,
      windArticulation?: "legato" | "tongued",
    ) => ReturnType<ConcertGrandRenderer["renderNote"]>;
  }> | null {
    if (algorithmId === CONCERT_GRAND_RENDERER_ALGORITHM_ID) return renderer;
    const waveguide = waveguideRenderers?.get(algorithmId);
    if (waveguide !== undefined) return waveguide;
    if (sampledRenderers.has(algorithmId)) {
      return sampledRenderers.get(algorithmId) ?? null;
    }
    let loaded: SampledInstrumentRenderer | null;
    try {
      loaded = loadSampledInstrumentRenderer(algorithmId);
    } catch {
      loaded = null;
    }
    sampledRenderers.set(algorithmId, loaded);
    return loaded;
  }
  /*
   * Rendered-PCM caches are held per recipe so one instrument's (smaller)
   * entry limit can never evict another instrument's legitimately cached
   * buffers. Recency lives in two places: Map iteration order inside each
   * recipe cache, and a monotonic stamp for cross-recipe byte-pressure
   * eviction, which removes the globally least-recently-used entry.
   */
  type RenderedBufferEntry = Readonly<{
    buffer: AudioBufferPort;
    byteLength: number;
    stamp: number;
    phraseStateOutput?: Uint8Array;
  }>;
  const renderedBufferCaches = new Map<string, Map<string, RenderedBufferEntry>>();
  const preparedPhysicalKeys = new Map<string, string>();
  let renderedBufferCacheBytes = 0;
  let renderedBufferCacheEntries = 0;
  let renderedBufferCacheStamp = 0;

  function recipeBufferCache(instrumentId: string): Map<string, RenderedBufferEntry> {
    const existing = renderedBufferCaches.get(instrumentId);
    if (existing !== undefined) return existing;
    const created = new Map<string, RenderedBufferEntry>();
    renderedBufferCaches.set(instrumentId, created);
    return created;
  }

  function clearRenderedBufferCaches(): void {
    renderedBufferCaches.clear();
    preparedPhysicalKeys.clear();
    renderedBufferCacheBytes = 0;
    renderedBufferCacheEntries = 0;
  }

  /*
   * Refresh recency on a cache hit: Map iteration order is each recipe's
   * eviction order, and the stamp is the cross-recipe eviction order. Every
   * hit path must touch the entry or later evictions choose a wrong victim.
   */
  function touchRenderedBufferEntry(
    cache: Map<string, RenderedBufferEntry>,
    key: string,
  ): RenderedBufferEntry | undefined {
    const cached = cache.get(key);
    if (cached === undefined) return undefined;
    cache.delete(key);
    renderedBufferCacheStamp += 1;
    const touched = Object.freeze({ ...cached, stamp: renderedBufferCacheStamp });
    cache.set(key, touched);
    return touched;
  }

  /*
   * Evict the globally least-recently-used entry. Stamps are unique
   * monotonic integers, so the minimum is deterministic; each recipe map's
   * first key is its own oldest entry.
   */
  function evictGlobalOldestRenderedBuffer(): boolean {
    let victimCache: Map<string, RenderedBufferEntry> | null = null;
    let victimKey: string | null = null;
    let victimStamp = Number.POSITIVE_INFINITY;
    for (const cache of renderedBufferCaches.values()) {
      const first = cache.entries().next();
      if (first.done === true) continue;
      const [key, entry] = first.value;
      if (entry.stamp < victimStamp) {
        victimStamp = entry.stamp;
        victimCache = cache;
        victimKey = key;
      }
    }
    if (victimCache === null || victimKey === null) return false;
    const evicted = victimCache.get(victimKey);
    victimCache.delete(victimKey);
    renderedBufferCacheBytes -= evicted?.byteLength ?? 0;
    renderedBufferCacheEntries -= 1;
    return true;
  }
  /**
   * Display-only spectral tap (jcpe-7she). Created lazily on the first
   * analysis read as a DYNAMIC node — the persistent graph stays exactly
   * twelve nodes and thirteen edges — and observes the post-processing,
   * pre-volume signal at the safety gain. It has no output connection, so
   * it cannot alter what the listener hears.
   */
  let analysisTap: AnalyserNodePort | null = null;
  let analysisWindow: Float32Array<ArrayBuffer> | null = null;

  /**
   * Rendering a distinct buffer per velocity value is unaffordable: a
   * performance uses many shades, each costing a full note render, and on a
   * slow engine that starves the scheduler until attacks land in the past.
   * Renders are therefore keyed and performed at a quantized velocity — one
   * buffer per band — while the voice's own gain still carries the exact
   * velocity, so dynamics are preserved and only the timbre snaps to the
   * nearest band. The band width matches the recorded layers the renderer
   * already switches between, so nothing audible is lost that the sample
   * layer did not already quantize.
   */
  function quantizeRenderVelocity(velocity: number): number {
    const band = Math.round((velocity - 1) / RENDER_VELOCITY_BAND) *
      RENDER_VELOCITY_BAND + 1;
    return Math.min(127, Math.max(1, band));
  }

  /**
   * Rendered length is bucketed as well as keyed: a performance asks for many
   * slightly different note lengths, and one buffer per length would defeat
   * the cache. Buckets grow geometrically so a short comp chord costs a short
   * render while a held bass note still gets its tail.
   */
  const RENDER_SECONDS_BUCKETS = Object.freeze([1, 2, 4, 8] as const);

  function bucketRenderSeconds(seconds: number): number {
    for (const bucket of RENDER_SECONDS_BUCKETS) {
      if (seconds <= bucket) return bucket;
    }
    return RENDER_SECONDS_BUCKETS[RENDER_SECONDS_BUCKETS.length - 1] ?? 8;
  }

  /*
   * The one authority for how many seconds of audio a gated note renders:
   * the gate plus the recipe release and a short tail. The attack path and
   * gate-aware preparation must compute this identically — any drift between
   * two copies recreates the warmed-wrong-bucket re-render this formula was
   * introduced to fix.
   */
  function gatedRenderWindowSeconds(
    gateSeconds: number,
    recipe: Readonly<{ amplitude: Readonly<{ releaseSeconds: number }> }>,
  ): number {
    return gateSeconds + recipe.amplitude.releaseSeconds + 0.25;
  }

  /*
   * The one authority for which seeded-variation slot a v1 render consumes.
   * The cache key and the render call must always agree on this value: a
   * slot consumed but not keyed (or keyed but not consumed) yields
   * wrong-audio cache hits, so both sites call this helper.
   */
  function windVariationSlot(
    physicalGesture: ExpressiveVoiceGesture | null,
  ): number | null {
    return physicalGesture !== null &&
      (physicalGesture.instrumentFamily === "flute" ||
        physicalGesture.instrumentFamily === "clarinet")
      ? physicalGesture.deterministicSeedUint32 % 8
      : null;
  }

  function renderedBufferKey(
    instrumentId: InstrumentId,
    midiPitch: number,
    velocity: number,
    seconds: number,
    physicalGesture: ExpressiveVoiceGesture | null = null,
  ): string {
    if (physicalGesture !== null) {
      const prepared = preparedPhysicalKeys.get(
        physicalGestureFingerprint(physicalGesture),
      );
      if (prepared !== undefined) return prepared;
    }
    /*
     * ABI-v1 rendered instruments consume pitch, duration bucket, sample
     * rate (one cache per context), and excitation velocity. They do not yet
     * consume full gesture curves or event identity. Winds consume only the
     * bounded variation slot and the two-state attack articulation. Hashing
     * ignored fields made every chart event a cold render and falsely called
     * them PCM-affecting. Keep a family/version discriminator; each PHS native
     * renderer must replace it with its quantized curve identity when it
     * actually begins consuming those curves.
     */
    const variationSlot = windVariationSlot(physicalGesture);
    const windArticulation = variationSlot === null
      ? null
      : physicalGesture?.articulation === "legato"
      ? "legato"
      : "tongued";
    const gestureIdentity = physicalGesture === null
      ? "legacy"
      : `physical-v1:${physicalGesture.instrumentFamily}:${physicalGesture.instrumentVersionId}${variationSlot === null ? "" : `:variation-${String(variationSlot)}:attack-${windArticulation ?? "none"}`}`;
    const renderVelocity = physicalGesture === null
      ? quantizeRenderVelocity(velocity)
      : velocity;
    return `${instrumentId}:${String(midiPitch)}:${String(renderVelocity)}:${String(seconds)}:${gestureIdentity}`;
  }

  function storeRenderedPcm(
    recipe: AudioRenderedInstrumentRecipe,
    context: AudioContextPort,
    key: string,
    pcm: Readonly<{ frameCount: number; left: Float32Array; right: Float32Array }>,
    phraseStateOutput?: Uint8Array,
  ): AudioBufferPort {
    const buffer = context.createBuffer(
      recipe.renderer.channels,
      pcm.frameCount,
      context.sampleRate,
    );
    buffer.getChannelData(0).set(pcm.left);
    buffer.getChannelData(1).set(pcm.right);
    const byteLength = recipe.renderer.channels * pcm.frameCount * 4;
    const cache = recipeBufferCache(recipe.id);
    renderedBufferCacheStamp += 1;
    cache.set(
      key,
      Object.freeze({
        buffer,
        byteLength,
        stamp: renderedBufferCacheStamp,
        ...(phraseStateOutput === undefined ? {} : { phraseStateOutput }),
      }),
    );
    renderedBufferCacheBytes += byteLength;
    renderedBufferCacheEntries += 1;
    const maximumEntries = Math.min(
      recipe.renderer.bufferCacheLimit,
      PHYSICAL_RENDER_LIMITS.maximumCacheEntries,
    );
    while (cache.size > maximumEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      const evicted = cache.get(oldest);
      cache.delete(oldest);
      renderedBufferCacheBytes -= evicted?.byteLength ?? 0;
      renderedBufferCacheEntries -= 1;
    }
    while (
      renderedBufferCacheEntries > maximumGlobalCacheEntries ||
      renderedBufferCacheBytes > maximumGlobalCachePcmBytes
    ) {
      if (!evictGlobalOldestRenderedBuffer()) break;
    }
    return buffer;
  }

  /**
   * Resolve the deterministic PCM buffer for one rendered note, rendering on
   * a cache miss. Null only when the renderer is unavailable or refuses the
   * request; the caller turns that into `audio.renderer_unavailable`.
   */
  function renderedBufferFor(
    recipe: AudioRenderedInstrumentRecipe,
    context: AudioContextPort,
    midiPitch: number,
    velocity: number,
    requestedSeconds = 8,
    physicalGesture: ExpressiveVoiceGesture | null = null,
  ): AudioBufferPort | null {
    const seconds = bucketRenderSeconds(requestedSeconds);
    const key = renderedBufferKey(
      recipe.id,
      midiPitch,
      velocity,
      seconds,
      physicalGesture,
    );
    const cache = recipeBufferCache(recipe.id);
    const cached = touchRenderedBufferEntry(cache, key);
    if (cached !== undefined) return cached.buffer;
    const algorithmId = physicalGesture?.instrumentFamily === "clarinet" &&
        physicalGesture.instrumentVersionId === "changes.physical.clarinet.v2"
      ? WAVEGUIDE_CLARINET_V2_ALGORITHM_ID
      : recipe.renderer.algorithmId;
    const noteRenderer = rendererForAlgorithm(algorithmId);
    if (noteRenderer === null) return null;
    const excitationVelocity = physicalGesture === null
      ? quantizeRenderVelocity(velocity)
      : physicalGestureExcitationVelocity(physicalGesture, velocity);
    const variationSlot = windVariationSlot(physicalGesture);
    const windArticulation = variationSlot === null
      ? undefined
      : physicalGesture?.articulation === "legato"
      ? "legato"
      : "tongued";
    const pcm = noteRenderer.renderNote(
      midiPitch,
      excitationVelocity,
      context.sampleRate,
      seconds,
      variationSlot ?? undefined,
      windArticulation,
    );
    if (pcm === null) return null;
    return storeRenderedPcm(recipe, context, key, pcm);
  }
  let reportedContextState: AudioContextStatePort | "absent" = "absent";
  let mix: AudioMix = Object.freeze({ masterVolume: 1, reverbAmount: 0 });
  let lastAcceptedGestureSequence = 0;
  let { lastGraphSequence, lastVoiceSequence, lastDebugSequence } = sequenceSeed;
  let debugEventsDropped = 0;
  let terminalSequenceExhausted = false;
  const debugEvents: AudioDebugEvent[] = [];
  const work: MutableWorkCounters = { ...EMPTY_WORK_COUNTERS };
  let initializationPromise: Promise<
    AudioEngineResult<AudioInitializationReceipt>
  > | null = null;
  let resumePromise: Promise<AudioEngineResult<AudioInitializationReceipt>> | null =
    null;
  let disposePromise: Promise<AudioEngineResult<AudioDisposeReceipt>> | null = null;

  function incrementWork(
    name: keyof MutableWorkCounters,
    count = 1,
  ): void {
    const next = work[name] + count;
    if (!Number.isSafeInteger(next) || next > MAX_AUDIO_INTERNAL_SEQUENCE) {
      throw new InternalSequenceExhausted("AUDIO_WORK_COUNTER_EXHAUSTED");
    }
    work[name] = next;
  }

  const registry = new ActiveVoiceRegistry(
    (count) => { incrementWork("registryReads", count); },
    (count) => { incrementWork("registryWrites", count); },
  );

  function nextSequence(kind: SequenceKind): number {
    const current =
      kind === "graph"
        ? lastGraphSequence
        : kind === "voice"
          ? lastVoiceSequence
          : lastDebugSequence;
    if (current >= MAX_AUDIO_INTERNAL_SEQUENCE) {
      throw new InternalSequenceExhausted(`AUDIO_${kind.toUpperCase()}_SEQUENCE_EXHAUSTED`);
    }
    const next = current + 1;
    if (kind === "graph") lastGraphSequence = next;
    else if (kind === "voice") lastVoiceSequence = next;
    else lastDebugSequence = next;
    return next;
  }

  function recordDebug(
    kind: AudioDebugEventKind,
    detailCode: string,
    options: Readonly<{
      graphInstanceId?: number | null;
      voice?: SynthVoice | null;
      owner?: AudioVoiceOwner | null;
      eventId?: string | null;
      midiPitch?: MidiPitch | null;
      scheduledTimeSeconds?: number | null;
    }> = {},
  ): void {
    const voice = options.voice ?? null;
    const owner = options.owner ?? voice?.owner ?? null;
    const event: AudioDebugEvent = Object.freeze({
      sequence: nextSequence("debug"),
      kind,
      graphInstanceId:
        options.graphInstanceId ?? voice?.graphInstanceId ?? currentGraph?.instanceId ?? null,
      voiceInstanceToken: voice?.instanceToken ?? null,
      voiceId: voice?.voiceId ?? null,
      owner: owner === null ? null : copyAudioOwner(owner),
      eventId: options.eventId ?? voice?.eventId ?? null,
      midiPitch: options.midiPitch ?? voice?.midiPitch ?? null,
      scheduledTimeSeconds: options.scheduledTimeSeconds ?? null,
      detailCode,
    });
    debugEvents.push(event);
    if (debugEvents.length > MAX_AUDIO_DEBUG_EVENTS) {
      debugEvents.shift();
      debugEventsDropped += 1;
    }
  }

  function failureResult<Value>(
    code: AudioEngineRefusalCode,
    path: readonly (string | number)[],
    termination: "refused" | "platform-fault",
  ): AudioEngineResult<Value> {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code,
        path: Object.freeze([...path]),
        state,
        retryable: state !== "closed" && retryableForCode(code),
      }),
      termination,
    });
  }

  function refuse<Value>(failure: ValidationFailure): AudioEngineResult<Value> {
    if (state === "closed") {
      return failureResult("audio.engine_closed", ["state"], "refused");
    }
    if (failure.code === "audio.internal_sequence_exhausted") {
      terminalSequenceExhausted = true;
      teardownFatalResources();
      return failureResult(failure.code, failure.path, "platform-fault");
    }
    try {
      recordDebug("operation-refused", failure.code);
    } catch (error) {
      if (error instanceof InternalSequenceExhausted) {
        terminalSequenceExhausted = true;
        teardownFatalResources();
        return failureResult(
          "audio.internal_sequence_exhausted",
          ["internalSequence"],
          "platform-fault",
        );
      }
      throw error;
    }
    return failureResult(failure.code, failure.path, "refused");
  }

  function success<Value>(value: Value): AudioEngineResult<Value> {
    return Object.freeze({ ok: true, value, termination: "completed" });
  }

  function beginOperation(): ValidationFailure | null {
    if (state === "closed") return null;
    if (terminalSequenceExhausted) {
      return {
        code: "audio.internal_sequence_exhausted",
        path: ["internalSequence"],
      };
    }
    try {
      incrementWork("operationsStarted", 1);
      return null;
    } catch (error) {
      if (error instanceof InternalSequenceExhausted) {
        return {
          code: "audio.internal_sequence_exhausted",
          path: ["internalSequence"],
        };
      }
      throw error;
    }
  }

  function copyWork(): AudioEngineWorkCounters {
    return Object.freeze({ ...work });
  }

  function currentAudioTime(): number {
    return currentContext?.currentTime ?? 0;
  }

  function snapshot(): AudioEngineSnapshot {
    const atTimeSeconds = currentAudioTime();
    const voices = terminalSequenceExhausted ? [] : registry.allVoices();
    const activeVoices = Object.freeze(
      voices.map((voice) => snapshotSynthVoice(voice, atTimeSeconds)),
    );
    let releasingVoiceCount = 0;
    let progressionNonreleasingVoiceCount = 0;
    let previewNonreleasingVoiceCount = 0;
    for (const voice of voices) {
      if (isSynthVoiceRetiringAt(voice, atTimeSeconds)) {
        releasingVoiceCount += 1;
      } else if (voice.owner.kind === "progression") {
        progressionNonreleasingVoiceCount += 1;
      } else {
        previewNonreleasingVoiceCount += 1;
      }
    }
    const contextState =
      currentContext === null
        ? contextStateForSnapshot(reportedContextState)
        : contextStateForSnapshot(currentContext.state);
    return Object.freeze({
      schema: AUDIO_ENGINE_SNAPSHOT_SCHEMA,
      state,
      graphInstanceId: currentGraph?.instanceId ?? null,
      contextState,
      contextSampleRate: currentContext?.sampleRate ?? null,
      mix: Object.freeze({ ...mix }),
      retainedVoiceCount: voices.length,
      nonreleasingVoiceCount: voices.length - releasingVoiceCount,
      releasingVoiceCount,
      progressionNonreleasingVoiceCount,
      previewNonreleasingVoiceCount,
      activeVoices,
      registryIndexCounts: terminalSequenceExhausted
        ? Object.freeze({
            voice: 0,
            generation: 0,
            event: 0,
            pitch: 0,
            owner: 0,
            instrument: 0,
            totalReferences: 0,
          })
        : registry.indexCounts(),
      persistentCreatedNodeCount:
        currentGraph === null || currentGraph.disconnected
          ? 0
          : currentGraph.createdNodes.length,
      persistentEdgeCount:
        currentGraph === null || currentGraph.disconnected
          ? 0
          : AUDIO_GRAPH_EDGE_ENTRIES.length,
      debugEvents: Object.freeze([...debugEvents]),
      debugEventsDropped,
      work: copyWork(),
    });
  }

  function disconnectNodes(nodes: readonly AudioNodePort[]): boolean {
    let clean = true;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (node === undefined) continue;
      try {
        node.disconnect();
      } catch {
        clean = false;
      }
    }
    return clean;
  }

  function disconnectPersistentGraph(graph: PersistentGraph): boolean {
    if (graph.disconnected) return true;
    graph.disconnected = true;
    return disconnectNodes(graph.createdNodes);
  }

  function buildPersistentGraph(
    context: AudioContextPort,
    graphInstanceId: number,
    initialMix: AudioMix,
  ): GraphBuildResult {
    const createdNodes: AudioNodePort[] = [];
    const track = <Node extends AudioNodePort>(node: Node): Node => {
      createdNodes.push(node);
      incrementWork("graphNodesCreated", 1);
      return node;
    };
    const connect = (
      from: AudioNodePort,
      to: AudioNodePort,
      detailCode: string,
    ): void => {
      from.connect(to);
      incrementWork("graphEdgesConnected", 1);
      recordDebug("graph-connect", detailCode, { graphInstanceId });
    };

    try {
      const instrumentBus = track(context.createGain());
      const dcBlock = track(context.createBiquadFilter());
      const lowShelf = track(context.createBiquadFilter());
      const highShelf = track(context.createBiquadFilter());
      const dryGain = track(context.createGain());
      const reverbSend = track(context.createGain());
      const convolver = track(context.createConvolver());
      const reverbReturn = track(context.createGain());
      const dynamics = track(context.createDynamicsCompressor());
      const softClip = track(context.createWaveShaper());
      const safetyGain = track(context.createGain());
      const masterGain = track(context.createGain());

      instrumentBus.gain.value = 1;
      dcBlock.type = AUDIO_PERSISTENT_GRAPH_SETTINGS.dcBlock.type;
      dcBlock.frequency.value =
        AUDIO_PERSISTENT_GRAPH_SETTINGS.dcBlock.frequencyHz;
      dcBlock.q.value = AUDIO_PERSISTENT_GRAPH_SETTINGS.dcBlock.q;
      lowShelf.type = AUDIO_PERSISTENT_GRAPH_SETTINGS.lowShelf.type;
      lowShelf.frequency.value =
        AUDIO_PERSISTENT_GRAPH_SETTINGS.lowShelf.frequencyHz;
      lowShelf.gain.value = AUDIO_PERSISTENT_GRAPH_SETTINGS.lowShelf.gainDb;
      highShelf.type = AUDIO_PERSISTENT_GRAPH_SETTINGS.highShelf.type;
      highShelf.frequency.value =
        AUDIO_PERSISTENT_GRAPH_SETTINGS.highShelf.frequencyHz;
      highShelf.gain.value = AUDIO_PERSISTENT_GRAPH_SETTINGS.highShelf.gainDb;
      dryGain.gain.value = AUDIO_PERSISTENT_GRAPH_SETTINGS.dryGain;
      reverbSend.gain.value =
        initialMix.reverbAmount *
        AUDIO_PERSISTENT_GRAPH_SETTINGS.maximumReverbSendGain;
      reverbReturn.gain.value =
        AUDIO_PERSISTENT_GRAPH_SETTINGS.reverbReturnGain;
      dynamics.threshold.value =
        AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.thresholdDb;
      dynamics.knee.value = AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.kneeDb;
      dynamics.ratio.value = AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.ratio;
      dynamics.attack.value =
        AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.attackSeconds;
      dynamics.release.value =
        AUDIO_PERSISTENT_GRAPH_SETTINGS.dynamics.releaseSeconds;
      softClip.curve = createSoftClipCurve();
      softClip.oversample = AUDIO_PERSISTENT_GRAPH_SETTINGS.softClip.oversample;
      safetyGain.gain.value = AUDIO_PERSISTENT_GRAPH_SETTINGS.safetyGain;
      masterGain.gain.value = initialMix.masterVolume;

      const impulseLength =
        context.sampleRate * AUDIO_IMPULSE_POLICY.durationSeconds;
      const impulse = context.createBuffer(
        AUDIO_IMPULSE_POLICY.channels,
        impulseLength,
        context.sampleRate,
      );
      const impulseObservation = writeDeterministicImpulse(impulse);
      incrementWork(
        "impulseSamplesWritten",
        impulseObservation.samplesWritten,
      );
      convolver.buffer = impulse;
      convolver.normalize = AUDIO_IMPULSE_POLICY.convolverNormalize;
      const pulseWave = createPulsePeriodicWave(context);

      connect(instrumentBus, dcBlock, "audio.graph.instrument-bus.dc-block");
      connect(dcBlock, lowShelf, "audio.graph.dc-block.low-shelf");
      connect(lowShelf, highShelf, "audio.graph.low-shelf.high-shelf");
      connect(highShelf, dryGain, "audio.graph.high-shelf.dry-gain");
      connect(dryGain, dynamics, "audio.graph.dry-gain.dynamics");
      connect(highShelf, reverbSend, "audio.graph.high-shelf.reverb-send");
      connect(reverbSend, convolver, "audio.graph.reverb-send.convolver");
      connect(convolver, reverbReturn, "audio.graph.convolver.reverb-return");
      connect(reverbReturn, dynamics, "audio.graph.reverb-return.dynamics");
      connect(dynamics, softClip, "audio.graph.dynamics.soft-clip");
      connect(softClip, safetyGain, "audio.graph.soft-clip.safety-gain");
      connect(safetyGain, masterGain, "audio.graph.safety-gain.master-gain");
      connect(masterGain, context.destination, "audio.graph.master-gain.destination");

      const now = context.currentTime;
      const graph: PersistentGraph = {
        instanceId: graphInstanceId,
        context,
        createdNodes: Object.freeze(createdNodes),
        instrumentBus,
        dcBlock,
        lowShelf,
        highShelf,
        dryGain,
        reverbSend,
        convolver,
        reverbReturn,
        dynamics,
        softClip,
        safetyGain,
        masterGain,
        pulseWave,
        masterAutomation: {
          startTimeSeconds: now,
          startValue: initialMix.masterVolume,
          endTimeSeconds: now,
          endValue: initialMix.masterVolume,
        },
        reverbSendAutomation: {
          startTimeSeconds: now,
          startValue: reverbSend.gain.value,
          endTimeSeconds: now,
          endValue: reverbSend.gain.value,
        },
        disconnected: false,
      };
      recordDebug("graph-create", "audio.graph.created", { graphInstanceId });
      return {
        graph,
        impulseSamplesWritten: impulseObservation.samplesWritten,
      };
    } catch (error) {
      disconnectNodes(createdNodes);
      throw error;
    }
  }

  function releaseAndRemoveAllVoices(
    reason: ForcedAudioRetirementReason,
    atTimeSeconds: number,
  ): number {
    const voices = registry.allVoices();
    for (const voice of voices) {
      try {
        forceReleaseSynthVoice(
          voice,
          reason,
          atTimeSeconds,
          (count) => { incrementWork("parameterEventsScheduled", count); },
        );
      } catch (error) {
        if (error instanceof InternalSequenceExhausted) throw error;
        // Cleanup below still removes every owned resource.
      }
    }
    for (const voice of voices) {
      try {
        registry.remove(voice.instanceToken);
      } finally {
        cleanupSynthVoice(voice);
      }
    }
    return voices.length;
  }

  function closeContextWithoutWaiting(context: AudioContextPort): void {
    try {
      void context.close().catch(() => undefined);
    } catch {
      // Fatal cleanup is already in progress and cannot restore this context.
    }
  }

  function detachContextHandlerWithoutThrowing(context: AudioContextPort): void {
    try {
      context.onstatechange = null;
    } catch {
      // A broken platform setter cannot prevent the remaining terminal cleanup.
    }
  }

  function contextStateWithoutThrowing(
    context: AudioContextPort,
  ): AudioContextStatePort | null {
    try {
      return context.state;
    } catch {
      return null;
    }
  }

  function contextTimeWithoutThrowing(context: AudioContextPort | null): number {
    if (context === null) return 0;
    try {
      return context.currentTime;
    } catch {
      return 0;
    }
  }

  function drainVoicesForTerminalCleanup(
    reason: ForcedAudioRetirementReason,
    atTimeSeconds: number,
  ): void {
    const voices = registry.drainForTerminalCleanup();
    for (const voice of voices) {
      try {
        forceReleaseSynthVoice(voice, reason, atTimeSeconds, () => undefined);
      } catch {
        // Disconnect still owns the final cleanup guarantee.
      }
      cleanupSynthVoice(voice);
    }
  }

  function teardownFatalResources(): void {
    const graph = currentGraph;
    const context = currentContext;
    const observedState =
      context === null ? null : contextStateWithoutThrowing(context);
    const atTimeSeconds = contextTimeWithoutThrowing(context);
    if (context !== null) detachContextHandlerWithoutThrowing(context);
    drainVoicesForTerminalCleanup("all-notes-off", atTimeSeconds);
    if (graph !== null) disconnectPersistentGraph(graph);
    if (context !== null && observedState !== "closed") {
      closeContextWithoutWaiting(context);
    }
    currentGraph = null;
    currentContext = null;
    clearRenderedBufferCaches();
    analysisTap = null;
    analysisWindow = null;
    reportedContextState = observedState ?? "absent";
    state = "fault";
  }

  function failInitializationAdoption(
    context: AudioContextPort,
    graph: PersistentGraph | null,
    detailCode: string,
    code: AudioEngineRefusalCode,
    observedState: AudioContextStatePort | null,
  ): AudioEngineResult<never> {
    if (code === "audio.internal_sequence_exhausted") {
      terminalSequenceExhausted = true;
    }
    detachContextHandlerWithoutThrowing(context);
    if (graph !== null) disconnectPersistentGraph(graph);
    closeContextWithoutWaiting(context);
    if (currentContext === context) currentContext = null;
    if (currentGraph === graph) currentGraph = null;
    reportedContextState = observedState ?? "absent";
    state = "fault";
    if (!terminalSequenceExhausted) {
      try {
        recordDebug("platform-fault", detailCode, {
          graphInstanceId: graph?.instanceId ?? null,
        });
      } catch (error) {
        if (error instanceof InternalSequenceExhausted) {
          terminalSequenceExhausted = true;
          code = "audio.internal_sequence_exhausted";
        }
      }
    }
    return failureResult(code, ["platform"], "platform-fault");
  }

  function enterFatalFault(
    detailCode: string,
    code: AudioEngineRefusalCode = "audio.context_unusable",
  ): AudioEngineResult<never> {
    if (code === "audio.internal_sequence_exhausted") {
      terminalSequenceExhausted = true;
    }
    const graphInstanceId = currentGraph?.instanceId ?? null;
    if (!terminalSequenceExhausted) {
      try {
        recordDebug("platform-fault", detailCode, { graphInstanceId });
      } catch {
        // Sequence exhaustion is itself represented by the returned refusal.
        code = "audio.internal_sequence_exhausted";
        terminalSequenceExhausted = true;
      }
    }
    teardownFatalResources();
    return failureResult(code, ["platform"], "platform-fault");
  }

  function enterFaultForError(
    error: unknown,
    detailCode: string,
    code: AudioEngineRefusalCode = "audio.context_unusable",
  ): AudioEngineResult<never> {
    return error instanceof InternalSequenceExhausted
      ? enterFatalFault(
          "audio.internal_sequence_exhausted",
          "audio.internal_sequence_exhausted",
        )
      : enterFatalFault(detailCode, code);
  }

  function handleSourceEnded(
    graphInstanceId: number,
    voiceId: string,
    instanceToken: number,
    sourceOrdinal: number,
  ): void {
    if (state === "closed") return;
    try {
      incrementWork("cleanupCallbacksHandled", 1);
      const voice = registry.get(instanceToken);
      if (
        currentGraph?.instanceId !== graphInstanceId ||
        voice === undefined ||
        voice.voiceId !== voiceId ||
        voice.graphInstanceId !== graphInstanceId
      ) {
        recordDebug("voice-cleanup-stale", "audio.voice.cleanup.stale", {
          graphInstanceId,
        });
        return;
      }
      const status = markSynthVoiceSourceEnded(voice, sourceOrdinal);
      if (status === "pending") return;
      if (status === "duplicate" || status === "stale") {
        recordDebug("voice-cleanup-stale", "audio.voice.cleanup.duplicate", {
          voice,
        });
        return;
      }
      registry.remove(instanceToken);
      const clean = cleanupSynthVoice(voice);
      recordDebug("voice-cleanup", "audio.voice.cleanup.completed", { voice });
      if (!clean) enterFatalFault("audio.voice.cleanup.disconnect_failed");
    } catch (error) {
      if (error instanceof InternalSequenceExhausted) {
        enterFatalFault(
          "audio.internal_sequence_exhausted",
          "audio.internal_sequence_exhausted",
        );
        return;
      }
      enterFatalFault("audio.voice.cleanup.platform_failed");
    }
  }

  function retireAllForInterruption(atTimeSeconds: number): void {
    const voices = registry.allVoices();
    for (const voice of voices) {
      if (
        forceReleaseSynthVoice(
          voice,
          "all-notes-off",
          atTimeSeconds,
          (count) => { incrementWork("parameterEventsScheduled", count); },
        )
      ) {
        recordDebug("voice-release", "audio.voice.release.interruption", {
          voice,
          scheduledTimeSeconds: atTimeSeconds,
        });
      }
    }
  }

  function handleContextState(
    graphInstanceId: number,
    context: AudioContextPort,
  ): void {
    if (state === "closed") return;
    if (
      currentGraph?.instanceId !== graphInstanceId ||
      currentContext !== context
    ) {
      try {
        recordDebug("context-state", "audio.context_state.stale", {
          graphInstanceId,
        });
      } catch (error) {
        enterFaultForError(error, "audio.context_state.stale_callback_failed");
      }
      return;
    }
    try {
      const contextState = context.state;
      reportedContextState = contextState;
      recordDebug("context-state", `audio.context_state.${contextState}`, {
        graphInstanceId,
      });
      if (
        (state === "initializing" || state === "resuming") &&
        contextState !== "closed"
      ) {
        return;
      }
      if (contextState === "running") {
        state = "ready";
        return;
      }
      if (contextState === "suspended" || contextState === "interrupted") {
        retireAllForInterruption(context.currentTime);
        state = "suspended";
        return;
      }
      enterFatalFault("audio.context_state.closed");
    } catch (error) {
      if (error instanceof InternalSequenceExhausted) {
        enterFatalFault(
          "audio.internal_sequence_exhausted",
          "audio.internal_sequence_exhausted",
        );
        return;
      }
      enterFatalFault("audio.context_state.callback_failed");
    }
  }

  function initializationReceipt(
    reusedExistingGraph: boolean,
  ): AudioInitializationReceipt {
    const graph = currentGraph;
    if (graph === null || (state !== "ready" && state !== "suspended")) {
      throw new Error("AUDIO_INITIALIZATION_RECEIPT_STATE_INVALID");
    }
    return Object.freeze({
      graphInstanceId: graph.instanceId,
      reusedExistingGraph,
      state,
      snapshot: snapshot(),
    });
  }

  async function finishInitialization(
    context: AudioContextPort,
    graph: PersistentGraph,
    resumeAttempt: Promise<void>,
  ): Promise<AudioEngineResult<AudioInitializationReceipt>> {
    try {
      await resumeAttempt;
    } catch (error) {
      initializationPromise = null;
      return enterFaultForError(
        error,
        "audio.initialization.resume_failed",
        "audio.context_resume_failed",
      );
    }
    /*
     * Best-effort renderer load: a failed wasm instantiation must not fault
     * the oscillator engine. Rendered attacks refuse with a stable code
     * until a later prepare call succeeds.
     */
    if (renderer === null) {
      try {
        renderer = await loadConcertGrandRenderer();
        waveguideRenderers = await loadWaveguideRenderers();
      } catch {
        renderer = null;
        waveguideRenderers = null;
      }
    }
    try {
      if (currentGraph !== graph || currentContext !== context) {
        return enterFatalFault("audio.initialization.graph_lost");
      }
      const contextState = context.state;
      reportedContextState = contextState;
      if (contextState === "running") state = "ready";
      else if (
        contextState === "suspended" ||
        contextState === "interrupted"
      ) {
        state = "suspended";
      } else {
        return enterFatalFault("audio.initialization.context_unusable");
      }
      return success(initializationReceipt(false));
    } catch (error) {
      return enterFaultForError(
        error,
        "audio.initialization.platform_failed",
      );
    } finally {
      initializationPromise = null;
    }
  }

  function initializeAudioEngine(
    request: Parameters<AudioEngine["initializeAudioEngine"]>[0],
  ): Promise<AudioEngineResult<AudioInitializationReceipt>> {
    const started = beginOperation();
    if (started !== null) return Promise.resolve(refuse(started));
    if (state === "closed") {
      return Promise.resolve(
        refuse({ code: "audio.engine_closed", path: ["state"] }),
      );
    }
    const requestValue: unknown = request;
    if (!isRecord(requestValue)) {
      return Promise.resolve(
        refuse({ code: "audio.user_gesture_required", path: ["gesture"] }),
      );
    }
    const gesture = validateGesture(
      requestValue["gesture"],
      lastAcceptedGestureSequence,
    );
    if (!gesture.ok) return Promise.resolve(refuse(gesture.failure));
    const validatedMix = validateMix(requestValue["initialMix"]);
    if (!validatedMix.ok) return Promise.resolve(refuse(validatedMix.failure));
    lastAcceptedGestureSequence = gesture.value.sequence;

    if (initializationPromise !== null) return initializationPromise;
    if (resumePromise !== null) return resumePromise;
    if (currentGraph !== null && (state === "ready" || state === "suspended")) {
      try {
        return Promise.resolve(success(initializationReceipt(true)));
      } catch (error) {
        return Promise.resolve(
          enterFaultForError(error, "audio.initialization.receipt_failed"),
        );
      }
    }

    let context: AudioContextPort;
    try {
      context = platform.createContext(AUDIO_CONTEXT_CREATION_OPTIONS);
    } catch {
      state = "fault";
      try {
        recordDebug("platform-fault", "audio.context.create_failed");
      } catch (error) {
        if (error instanceof InternalSequenceExhausted) {
          terminalSequenceExhausted = true;
        }
        return Promise.resolve(
          failureResult(
            "audio.internal_sequence_exhausted",
            ["internalSequence"],
            "platform-fault",
          ),
        );
      }
      return Promise.resolve(
        failureResult(
          "audio.context_create_failed",
          ["platform", "createContext"],
          "platform-fault",
        ),
      );
    }

    let observedState: AudioContextStatePort;
    let sampleRate: number;
    try {
      observedState = context.state;
      sampleRate = context.sampleRate;
      reportedContextState = observedState;
      recordDebug("context-create", "audio.context.created", {
        graphInstanceId: null,
      });
    } catch (error) {
      const sequenceFailure = error instanceof InternalSequenceExhausted;
      return Promise.resolve(
        failInitializationAdoption(
          context,
          null,
          sequenceFailure
            ? "audio.internal_sequence_exhausted"
            : "audio.context.inspect_failed",
          sequenceFailure
            ? "audio.internal_sequence_exhausted"
            : "audio.context_unusable",
          null,
        ),
      );
    }

    if (
      !Number.isInteger(sampleRate) ||
      sampleRate < AUDIO_IMPULSE_POLICY.minimumSampleRate ||
      sampleRate > AUDIO_IMPULSE_POLICY.maximumSampleRate
    ) {
      return Promise.resolve(
        failInitializationAdoption(
          context,
          null,
          "audio.context.sample_rate_unsupported",
          "audio.context_sample_rate_unsupported",
          observedState,
        ),
      );
    }

    state = "initializing";
    const graphInstanceId = (() => {
      try {
        return nextSequence("graph");
      } catch {
        return null;
      }
    })();
    if (graphInstanceId === null) {
      return Promise.resolve(
        failInitializationAdoption(
          context,
          null,
          "audio.internal_sequence_exhausted",
          "audio.internal_sequence_exhausted",
          observedState,
        ),
      );
    }

    let graph: PersistentGraph;
    try {
      graph = buildPersistentGraph(
        context,
        graphInstanceId,
        validatedMix.value,
      ).graph;
    } catch (error) {
      const sequenceFailure = error instanceof InternalSequenceExhausted;
      return Promise.resolve(
        failInitializationAdoption(
          context,
          null,
          sequenceFailure
            ? "audio.internal_sequence_exhausted"
            : "audio.graph_create_failed",
          sequenceFailure
            ? "audio.internal_sequence_exhausted"
            : "audio.graph_create_failed",
          observedState,
        ),
      );
    }

    try {
      context.onstatechange = () => {
        handleContextState(graph.instanceId, context);
      };
    } catch {
      return Promise.resolve(
        failInitializationAdoption(
          context,
          graph,
          "audio.context.state_handler_registration_failed",
          "audio.context_unusable",
          observedState,
        ),
      );
    }
    currentContext = context;
    currentGraph = graph;
    mix = validatedMix.value;
    let resumeAttempt: Promise<void>;
    let stateBeforeResume: AudioContextStatePort;
    try {
      stateBeforeResume = context.state;
      reportedContextState = stateBeforeResume;
    } catch {
      return Promise.resolve(
        failInitializationAdoption(
          context,
          graph,
          "audio.context.state_read_failed",
          "audio.context_unusable",
          observedState,
        ),
      );
    }
    try {
      resumeAttempt =
        stateBeforeResume === "running" ? Promise.resolve() : context.resume();
    } catch {
      return Promise.resolve(
        failInitializationAdoption(
          context,
          graph,
          "audio.initialization.resume_failed",
          "audio.context_resume_failed",
          stateBeforeResume,
        ),
      );
    }
    const pending = finishInitialization(context, graph, resumeAttempt);
    initializationPromise = pending;
    return pending;
  }

  async function finishResume(
    context: AudioContextPort,
    graph: PersistentGraph,
  ): Promise<AudioEngineResult<AudioInitializationReceipt>> {
    try {
      await context.resume();
    } catch (error) {
      resumePromise = null;
      return enterFaultForError(
        error,
        "audio.context.resume_failed",
        "audio.context_resume_failed",
      );
    }
    try {
      if (currentContext !== context || currentGraph !== graph) {
        return enterFatalFault("audio.resume.graph_lost");
      }
      const contextState = context.state;
      reportedContextState = contextState;
      if (contextState === "running") state = "ready";
      else if (
        contextState === "suspended" ||
        contextState === "interrupted"
      ) {
        state = "suspended";
      } else {
        return enterFatalFault("audio.resume.context_unusable");
      }
      return success(initializationReceipt(true));
    } catch (error) {
      return enterFaultForError(error, "audio.resume.platform_failed");
    } finally {
      resumePromise = null;
    }
  }

  function resumeAudioEngine(
    request: Parameters<AudioEngine["resumeAudioEngine"]>[0],
  ): Promise<AudioEngineResult<AudioInitializationReceipt>> {
    const started = beginOperation();
    if (started !== null) return Promise.resolve(refuse(started));
    if (state === "closed") {
      return Promise.resolve(
        refuse({ code: "audio.engine_closed", path: ["state"] }),
      );
    }
    const graph = currentGraph;
    const context = currentContext;
    if (
      graph === null ||
      context === null ||
      state === "uninitialized" ||
      state === "initializing" ||
      state === "fault"
    ) {
      return Promise.resolve(
        refuse({ code: "audio.engine_not_ready", path: ["state"] }),
      );
    }
    const requestValue: unknown = request;
    const gestureValue = isRecord(requestValue)
      ? requestValue["gesture"]
      : undefined;
    const gesture = validateGesture(
      gestureValue,
      lastAcceptedGestureSequence,
    );
    if (!gesture.ok) return Promise.resolve(refuse(gesture.failure));
    lastAcceptedGestureSequence = gesture.value.sequence;
    if (resumePromise !== null) return resumePromise;
    if (state === "ready") {
      try {
        return Promise.resolve(success(initializationReceipt(true)));
      } catch (error) {
        return Promise.resolve(
          enterFaultForError(error, "audio.resume.receipt_failed"),
        );
      }
    }
    state = "resuming";
    const pending = finishResume(context, graph);
    resumePromise = pending;
    return pending;
  }

  function setAudioMix(
    requestedMix: AudioMix,
  ): AudioEngineResult<AudioMixReceipt> {
    const started = beginOperation();
    if (started !== null) return refuse(started);
    if (state === "closed") {
      return refuse({ code: "audio.engine_closed", path: ["state"] });
    }
    const graph = currentGraph;
    const context = currentContext;
    if (state !== "ready" || graph === null || context === null) {
      return refuse({ code: "audio.engine_not_ready", path: ["state"] });
    }
    try {
      const atTimeSeconds = context.currentTime;
      const validated = validateMix(requestedMix);
      if (!validated.ok) return refuse(validated.failure);
      const previous = Object.freeze({ ...mix });
      const rampEnd =
        atTimeSeconds + AUDIO_PERSISTENT_GRAPH_SETTINGS.mixRampSeconds;
      const masterHeld = evaluateLinearAutomation(
        graph.masterAutomation,
        atTimeSeconds,
      );
      const reverbHeld = evaluateLinearAutomation(
        graph.reverbSendAutomation,
        atTimeSeconds,
      );
      const reverbTarget =
        validated.value.reverbAmount *
        AUDIO_PERSISTENT_GRAPH_SETTINGS.maximumReverbSendGain;
      holdAudioParamAtTime(
        graph.masterGain.gain,
        atTimeSeconds,
        masterHeld,
        (count) => { incrementWork("parameterEventsScheduled", count); },
      );
      graph.masterGain.gain.linearRampToValueAtTime(
        validated.value.masterVolume,
        rampEnd,
      );
      incrementWork("parameterEventsScheduled", 1);
      holdAudioParamAtTime(
        graph.reverbSend.gain,
        atTimeSeconds,
        reverbHeld,
        (count) => { incrementWork("parameterEventsScheduled", count); },
      );
      graph.reverbSend.gain.linearRampToValueAtTime(reverbTarget, rampEnd);
      incrementWork("parameterEventsScheduled", 1);
      graph.masterAutomation = {
        startTimeSeconds: atTimeSeconds,
        startValue: masterHeld,
        endTimeSeconds: rampEnd,
        endValue: validated.value.masterVolume,
      };
      graph.reverbSendAutomation = {
        startTimeSeconds: atTimeSeconds,
        startValue: reverbHeld,
        endTimeSeconds: rampEnd,
        endValue: reverbTarget,
      };
      mix = validated.value;
      recordDebug("mix-ramp", "audio.mix.ramp", {
        graphInstanceId: graph.instanceId,
        scheduledTimeSeconds: atTimeSeconds,
      });
      return success(
        Object.freeze({
          previous,
          current: Object.freeze({ ...mix }),
          rampStartTimeSeconds: atTimeSeconds,
          rampEndTimeSeconds: rampEnd,
        }),
      );
    } catch (error) {
      return enterFatalFault(
        error instanceof InternalSequenceExhausted
          ? "audio.internal_sequence_exhausted"
          : "audio.mix.platform_failed",
        error instanceof InternalSequenceExhausted
          ? "audio.internal_sequence_exhausted"
          : "audio.context_unusable",
      );
    }
  }

  function selectVictims(
    allVoices: readonly SynthVoice[],
    alreadySelected: Set<number>,
    retriggerTokens: ReadonlySet<number>,
    incomingOwner: AudioVoiceOwner,
    atTimeSeconds: number,
    incomingCount: number,
    limit: number,
    predicate: (voice: SynthVoice) => boolean,
  ): SynthVoice[] {
    let retainedNonreleasing = 0;
    for (const voice of allVoices) {
      if (
        predicate(voice) &&
        !retriggerTokens.has(voice.instanceToken) &&
        !alreadySelected.has(voice.instanceToken) &&
        !isSynthVoiceRetiringAt(voice, atTimeSeconds)
      ) {
        retainedNonreleasing += 1;
      }
    }
    const deficit = retainedNonreleasing + incomingCount - limit;
    if (deficit <= 0) return [];
    const candidates = allVoices.filter(
      (voice) =>
        predicate(voice) &&
        !retriggerTokens.has(voice.instanceToken) &&
        !alreadySelected.has(voice.instanceToken) &&
        !isSynthVoiceRetiringAt(voice, atTimeSeconds),
    );
    incrementWork("voicesExaminedForStealing", candidates.length);
    candidates.sort((left, right) =>
      compareStealCandidates(left, right, incomingOwner, atTimeSeconds),
    );
    if (candidates.length < deficit) {
      throw new Error("AUDIO_POLYPHONY_VICTIM_SET_INSUFFICIENT");
    }
    const selected = candidates.slice(0, deficit);
    for (const voice of selected) alreadySelected.add(voice.instanceToken);
    return selected;
  }

  function planAttack(
    request: ValidatedAttack,
    recipe: AudioInstrumentRecipe,
    atTimeSeconds: number,
  ):
    | Readonly<{
        ok: true;
        retriggers: readonly SynthVoice[];
        steals: readonly SynthVoice[];
      }>
    | Readonly<{ ok: false; failure: ValidationFailure }> {
    const retriggerByToken = new Map<number, SynthVoice>();
    for (let index = 0; index < request.voices.length; index += 1) {
      const incoming = request.voices[index];
      if (incoming === undefined) continue;
      const collisions = registry.voicesForVoiceId(incoming.voiceId);
      incrementWork("voicesExaminedForRetrigger", collisions.length);
      for (const collision of collisions) {
        if (
          !sameAudioOwner(collision.owner, request.owner) ||
          collision.eventId !== request.eventId ||
          collision.midiPitch !== incoming.midiPitch
        ) {
          return {
            ok: false,
            failure: {
              code: "audio.voice_id_duplicate",
              path: ["voices", index, "voiceId"],
            },
          };
        }
      }
      const matches = registry.retriggerMatches(
        request.owner,
        request.eventId,
        incoming.midiPitch,
      );
      incrementWork("voicesExaminedForRetrigger", matches.length);
      for (const match of matches) {
        retriggerByToken.set(match.instanceToken, match);
      }
    }

    const allVoices = registry.allVoices();
    const retriggers = [...retriggerByToken.values()].sort(
      compareSynthVoiceIdentity,
    );
    const retriggerTokens = new Set(retriggerByToken.keys());
    const selectedTokens = new Set<number>();
    const steals: SynthVoice[] = [];
    const addStage = (selected: readonly SynthVoice[]): void => {
      for (const voice of selected) steals.push(voice);
    };

    addStage(
      selectVictims(
        allVoices,
        selectedTokens,
        retriggerTokens,
        request.owner,
        atTimeSeconds,
        request.voices.length,
        request.owner.kind === "progression"
          ? MAX_AUDIO_PROGRESSION_VOICES
          : MAX_AUDIO_PREVIEW_VOICES,
        (voice) => voice.owner.kind === request.owner.kind,
      ),
    );
    addStage(
      selectVictims(
        allVoices,
        selectedTokens,
        retriggerTokens,
        request.owner,
        atTimeSeconds,
        request.voices.length,
        recipe.polyphonyLimit,
        (voice) => voice.instrumentId === request.instrumentId,
      ),
    );
    addStage(
      selectVictims(
        allVoices,
        selectedTokens,
        retriggerTokens,
        request.owner,
        atTimeSeconds,
        request.voices.length,
        MAX_AUDIO_NONRELEASING_VOICES,
        () => true,
      ),
    );

    if (registry.size + request.voices.length > MAX_AUDIO_RETAINED_VOICES) {
      return {
        ok: false,
        failure: {
          code: "audio.retiring_voice_capacity",
          path: ["voices"],
        },
      };
    }
    return {
      ok: true,
      retriggers: Object.freeze(retriggers),
      steals: Object.freeze(steals),
    };
  }

  function releaseVoice(
    voice: SynthVoice,
    reason: ForcedAudioRetirementReason,
    atTimeSeconds: number,
  ): boolean {
    const released = forceReleaseSynthVoice(
      voice,
      reason,
      atTimeSeconds,
      (count) => { incrementWork("parameterEventsScheduled", count); },
    );
    if (!released) return false;
    const kind: AudioDebugEventKind =
      reason === "note-retrigger"
        ? "voice-retrigger-retire"
        : reason === "voice-steal"
          ? "voice-steal"
          : "voice-release";
    recordDebug(kind, `audio.voice.release.${reason}`, {
      voice,
      scheduledTimeSeconds: atTimeSeconds,
    });
    return true;
  }

  function attackAudioVoices(
    request: AudioAttackBatchRequest,
  ): AudioEngineResult<AudioAttackReceipt> {
    const started = beginOperation();
    if (started !== null) return refuse(started);
    if (state === "closed") {
      return refuse({ code: "audio.engine_closed", path: ["state"] });
    }
    const graph = currentGraph;
    const context = currentContext;
    if (state !== "ready" || graph === null || context === null) {
      return refuse({ code: "audio.engine_not_ready", path: ["state"] });
    }
    let preparedForRollback: SynthVoice[] = [];
    try {
      const atTimeSeconds = context.currentTime;
      incrementWork("voiceBatchesValidated", 1);
      const validated = validateAttack(
        request,
        atTimeSeconds,
        (count) => { incrementWork("voiceSpecsValidated", count); },
      );
      if (!validated.ok) return refuse(validated.failure);
      const recipe = recipeForInstrument(validated.value.instrumentId);
      const plan = planAttack(validated.value, recipe, atTimeSeconds);
      if (!plan.ok) return refuse(plan.failure);
      /*
       * Rendered recipes resolve every buffer before any node, registry, or
       * retirement mutation so the batch refusal stays atomic. The prepare
       * operation keeps this a cache hit; a miss renders synchronously.
       */
      let renderedBuffers: readonly AudioBufferPort[] | null = null;
      if (recipe.synthesis === "rendered") {
        const resolved: AudioBufferPort[] = [];
        for (const voiceSpec of validated.value.voices) {
          /*
           * Only as much audio as this voice can sound: the gate plus the
           * recipe release and a short tail. A performance gates most notes
           * far short of their natural decay, and rendering the untouched
           * remainder is the dominant cost on a slow engine.
           */
          const buffer = renderedBufferFor(
            recipe,
            context,
            voiceSpec.midiPitch,
            voiceSpec.velocity,
            gatedRenderWindowSeconds(
              validated.value.releaseTimeSeconds -
                validated.value.startTimeSeconds,
              recipe,
            ),
            voiceSpec.physicalGesture,
          );
          if (buffer === null) {
            return refuse({
              code: "audio.renderer_unavailable",
              path: ["instrumentId"],
            });
          }
          resolved.push(buffer);
        }
        renderedBuffers = resolved;
      }
      const normalizationGain = normalizationGainForVoiceCount(
        recipe.outputLevel,
        validated.value.voices.length,
      );
      const velocityGains = validated.value.voices.map((voiceSpec) =>
        velocityGainForVelocity(voiceSpec.velocity),
      );
      const instanceTokens = validated.value.voices.map(() =>
        nextSequence("voice"),
      );
      const attackedVoiceIds = Object.freeze(
        validated.value.voices.map((voiceSpec) => voiceSpec.voiceId),
      );
      const retriggeredVoiceIds = Object.freeze(
        plan.retriggers.map((voice) => voice.voiceId),
      );
      const stolenVoiceIds = Object.freeze(
        plan.steals.map((voice) => voice.voiceId),
      );
      const prepared: SynthVoice[] = [];
      preparedForRollback = prepared;
      try {
        for (let index = 0; index < validated.value.voices.length; index += 1) {
          const voiceSpec = validated.value.voices[index];
          const velocityGain = velocityGains[index];
          const instanceToken = instanceTokens[index];
          if (
            voiceSpec === undefined ||
            velocityGain === undefined ||
            instanceToken === undefined
          ) {
            throw new Error("AUDIO_PREPARED_VOICE_PLAN_MISMATCH");
          }
          const voice = prepareSynthVoice({
            context,
            instrumentBus: graph.instrumentBus,
            pulseWave: graph.pulseWave,
            graphInstanceId: graph.instanceId,
            instanceToken,
            voiceId: voiceSpec.voiceId,
            owner: validated.value.owner,
            eventId: validated.value.eventId,
            instrumentId: validated.value.instrumentId,
            midiPitch: voiceSpec.midiPitch,
            velocity: voiceSpec.velocity,
            originalBatchVoiceCount: validated.value.voices.length,
            normalizationGain,
            velocityGain,
            recipe,
            renderedBuffer: renderedBuffers?.[index] ?? null,
            startTimeSeconds: validated.value.startTimeSeconds,
            releaseTimeSeconds: validated.value.releaseTimeSeconds,
            onSourceEnded: handleSourceEnded,
            recordParameterEvents: (count) =>
              { incrementWork("parameterEventsScheduled", count); },
          });
          prepared.push(voice);
          incrementWork("voicesCreated", 1);
          incrementWork("scheduledSourcesCreated", voice.sources.length);
        }
      } catch (error) {
        for (const voice of prepared) cleanupSynthVoice(voice);
        throw error;
      }

      for (const voice of plan.retriggers) {
        releaseVoice(
          voice,
          "note-retrigger",
          validated.value.startTimeSeconds,
        );
      }
      for (const voice of plan.steals) {
        releaseVoice(voice, "voice-steal", atTimeSeconds);
      }
      for (const voice of prepared) registry.add(voice);
      for (const voice of prepared) {
        startSynthVoice(voice);
        recordDebug("voice-attack", "audio.voice.attack", {
          voice,
          scheduledTimeSeconds: voice.attackTimeSeconds,
        });
      }

      return success(
        Object.freeze({
          owner: copyAudioOwner(validated.value.owner),
          eventId: validated.value.eventId,
          instrumentId: validated.value.instrumentId,
          attackedVoiceIds,
          retriggeredVoiceIds,
          stolenVoiceIds,
          normalizationGain,
          velocityGains: Object.freeze(velocityGains),
          snapshot: snapshot(),
        }),
      );
    } catch (error) {
      for (const voice of preparedForRollback) cleanupSynthVoice(voice);
      return enterFatalFault(
        error instanceof InternalSequenceExhausted
          ? "audio.internal_sequence_exhausted"
          : "audio.voice.platform_failed",
        error instanceof InternalSequenceExhausted
          ? "audio.internal_sequence_exhausted"
          : "audio.context_unusable",
      );
    }
  }

  function retireAudioVoices(
    request: AudioRetireRequest,
  ): AudioEngineResult<AudioRetirementReceipt> {
    const started = beginOperation();
    if (started !== null) return refuse(started);
    if (state === "closed") {
      return refuse({ code: "audio.engine_closed", path: ["state"] });
    }
    const context = currentContext;
    if (state !== "ready" || currentGraph === null || context === null) {
      return refuse({ code: "audio.engine_not_ready", path: ["state"] });
    }
    try {
      const currentTimeSeconds = context.currentTime;
      const validated = validateRetirement(
        request,
        currentTimeSeconds,
      );
      if (!validated.ok) return refuse(validated.failure);
      const voices = registry.voicesForSelector(validated.value.selector);
      incrementWork("voicesExaminedForRetirement", voices.length);
      const matchedVoiceIds = voices.map((voice) => voice.voiceId);
      const newlyRetiredVoiceIds: string[] = [];
      const alreadyRetiringVoiceIds: string[] = [];
      for (const voice of voices) {
        if (
          releaseVoice(
            voice,
            validated.value.reason,
            validated.value.atTimeSeconds,
          )
        ) {
          newlyRetiredVoiceIds.push(voice.voiceId);
        } else {
          alreadyRetiringVoiceIds.push(voice.voiceId);
        }
      }
      return success(
        Object.freeze({
          reason: validated.value.reason,
          matchedVoiceIds: Object.freeze(matchedVoiceIds),
          newlyRetiredVoiceIds: Object.freeze(newlyRetiredVoiceIds),
          alreadyRetiringVoiceIds: Object.freeze(alreadyRetiringVoiceIds),
          noFutureAttackPostcondition: true,
          snapshot: snapshot(),
        }),
      );
    } catch (error) {
      return enterFatalFault(
        error instanceof InternalSequenceExhausted
          ? "audio.internal_sequence_exhausted"
          : "audio.retirement.platform_failed",
        error instanceof InternalSequenceExhausted
          ? "audio.internal_sequence_exhausted"
          : "audio.context_unusable",
      );
    }
  }

  function inspectAudioEngine(): AudioEngineSnapshot {
    const started = beginOperation();
    if (started !== null) {
      terminalSequenceExhausted = true;
      teardownFatalResources();
    }
    try {
      return snapshot();
    } catch (error) {
      enterFaultForError(error, "audio.inspect.platform_failed");
      return snapshot();
    }
  }

  async function performDispose(): Promise<AudioEngineResult<AudioDisposeReceipt>> {
    let graph: PersistentGraph | null = null;
    let context: AudioContextPort | null = null;
    let graphInstanceId: number | null;
    let retiredVoiceCount: number;
    let closeAttempted = false;
    try {
      if (initializationPromise !== null) await initializationPromise;
      if (resumePromise !== null) await resumePromise;
      graph = currentGraph;
      context = currentContext;
      graphInstanceId = graph?.instanceId ?? null;
      retiredVoiceCount = releaseAndRemoveAllVoices(
        "page-teardown",
        context?.currentTime ?? 0,
      );
      if (context !== null) context.onstatechange = null;
      if (graph !== null) disconnectPersistentGraph(graph);
      currentGraph = null;
      currentContext = null;
      state = "closed";
      reportedContextState = context === null ? "absent" : "closed";
      let contextClosed = context === null;
      if (context !== null) {
        if (context.state !== "closed") {
          closeAttempted = true;
          await context.close();
        }
        contextClosed = true;
      }
      recordDebug("engine-dispose", "audio.engine.page_teardown", {
        graphInstanceId,
      });
      return success(
        Object.freeze({
          graphInstanceId,
          retiredVoiceCount,
          contextClosed,
          snapshot: snapshot(),
        }),
      );
    } catch (error) {
      const sequenceFailure = error instanceof InternalSequenceExhausted;
      if (sequenceFailure) terminalSequenceExhausted = true;
      graph ??= currentGraph;
      context ??= currentContext;
      if (context !== null) detachContextHandlerWithoutThrowing(context);
      drainVoicesForTerminalCleanup(
        "page-teardown",
        contextTimeWithoutThrowing(context),
      );
      if (graph !== null) disconnectPersistentGraph(graph);
      if (currentGraph === graph) currentGraph = null;
      if (currentContext === context) currentContext = null;
      const observedState =
        context === null ? null : contextStateWithoutThrowing(context);
      state = "closed";
      if (
        context !== null &&
        observedState !== "closed" &&
        !closeAttempted
      ) {
        try {
          await context.close();
        } catch {
          // The typed platform fault below remains authoritative.
        }
      }
      reportedContextState =
        context === null
          ? "absent"
          : contextStateWithoutThrowing(context) ?? "absent";
      return failureResult(
        sequenceFailure
          ? "audio.internal_sequence_exhausted"
          : "audio.context_unusable",
        sequenceFailure ? ["internalSequence"] : ["platform", "dispose"],
        "platform-fault",
      );
    } finally {
      disposePromise = null;
    }
  }

  function disposeAudioEngine(
    request: Parameters<AudioEngine["disposeAudioEngine"]>[0],
  ): Promise<AudioEngineResult<AudioDisposeReceipt>> {
    const started = beginOperation();
    if (started !== null) return Promise.resolve(refuse(started));
    const requestValue: unknown = request;
    if (!isRecord(requestValue) || requestValue["reason"] !== "page-teardown") {
      return Promise.resolve(
        refuse({ code: "audio.dispose_reason_invalid", path: ["reason"] }),
      );
    }
    if (state === "closed") {
      return Promise.resolve(
        refuse({ code: "audio.engine_closed", path: ["state"] }),
      );
    }
    if (disposePromise !== null) return disposePromise;
    const pending = performDispose();
    disposePromise = pending;
    return pending;
  }

  /**
   * Display-only analysis read: sample the safety-gain tap and run the
   * embedded DSP analysis over it. A pure observation — no registry, mix,
   * counter, or graph-count change; callable every animation frame.
   */
  function analyzeAudioOutput(): AudioEngineResult<AudioAnalysisFrame> {
    const context = currentContext;
    const graph = currentGraph;
    if (state !== "ready" || context === null || graph === null) {
      return failureResult("audio.engine_not_ready", ["state"], "refused");
    }
    if (renderer === null) {
      return failureResult(
        "audio.renderer_unavailable",
        ["renderer"],
        "refused",
      );
    }
    try {
      if (analysisTap === null) {
        const tap = context.createAnalyser();
        tap.fftSize = AUDIO_ANALYSIS_FFT_SIZE;
        tap.smoothingTimeConstant = 0;
        graph.safetyGain.connect(tap);
        analysisTap = tap;
      }
      analysisWindow ??= new Float32Array(AUDIO_ANALYSIS_FFT_SIZE);
      analysisTap.getFloatTimeDomainData(analysisWindow);
      const analyzed = renderer.analyzeWindow(
        analysisWindow,
        context.sampleRate,
      );
      if (analyzed === null) {
        return failureResult(
          "audio.renderer_unavailable",
          ["analysis"],
          "refused",
        );
      }
      const samples = new Float32Array(analysisWindow.length);
      samples.set(analysisWindow);
      return success(
        Object.freeze({
          sampleRateHz: analyzed.sampleRateHz,
          fftSize: analyzed.fftSize,
          samples,
          magnitudes: analyzed.magnitudes,
          notes: analyzed.notes,
          chroma: analyzed.chroma,
        }),
      );
    } catch {
      return failureResult("audio.context_unusable", ["analysis"], "refused");
    }
  }

  async function prepareRenderedAudioVoices(
    request: PrepareRenderedVoicesRequest,
  ): Promise<AudioEngineResult<PrepareRenderedVoicesReceipt>> {
    const started = beginOperation();
    if (started !== null) return refuse(started);
    if (state === "closed") {
      return refuse({ code: "audio.engine_closed", path: ["state"] });
    }
    const requestValue: unknown = request;
    if (!isRecord(requestValue)) {
      return refuse({ code: "audio.instrument_id_invalid", path: [] });
    }
    const instrumentId = makeInstrumentId(
      typeof requestValue["instrumentId"] === "string"
        ? requestValue["instrumentId"]
        : "",
    );
    if (!instrumentId.ok) {
      return refuse({
        code: "audio.instrument_id_invalid",
        path: ["instrumentId"],
      });
    }
    const context = currentContext;
    if (context === null || (state !== "ready" && state !== "suspended")) {
      return refuse({ code: "audio.engine_not_ready", path: ["state"] });
    }
    const recipe = recipeForInstrument(instrumentId.value);
    if (recipe.synthesis !== "rendered") {
      return success(
        Object.freeze({
          instrumentId: instrumentId.value,
          renderedCount: 0,
          cachedCount: 0,
        }),
      );
    }
    if (
      renderer === null &&
      (recipe.renderer.algorithmId === CONCERT_GRAND_RENDERER_ALGORITHM_ID ||
        recipe.renderer.algorithmId.startsWith("changes.dsp.waveguide-"))
    ) {
      try {
        renderer = await loadConcertGrandRenderer();
        waveguideRenderers = await loadWaveguideRenderers();
      } catch {
        return refuse({
          code: "audio.renderer_unavailable",
          path: ["instrumentId"],
        });
      }
    }
    if (rendererForAlgorithm(recipe.renderer.algorithmId) === null) {
      return refuse({
        code: "audio.renderer_unavailable",
        path: ["instrumentId"],
      });
    }
    const notesValue = requestValue["notes"];
    if (!Array.isArray(notesValue)) {
      return refuse({ code: "audio.midi_pitch_invalid", path: ["notes"] });
    }
    let renderedCount = 0;
    let cachedCount = 0;
    const phraseStateByVoice = new Map<string, Uint8Array>();
    for (let index = 0; index < notesValue.length; index += 1) {
      const noteValue: unknown = notesValue[index];
      if (!isRecord(noteValue)) {
        return refuse({
          code: "audio.midi_pitch_invalid",
          path: ["notes", index],
        });
      }
      const midiPitch = makeMidiPitch(
        typeof noteValue["midiPitch"] === "number"
          ? noteValue["midiPitch"]
          : -1,
      );
      if (!midiPitch.ok) {
        return refuse({
          code: "audio.midi_pitch_invalid",
          path: ["notes", index, "midiPitch"],
        });
      }
      const velocity = noteValue["velocity"];
      if (
        typeof velocity !== "number" ||
        !Number.isInteger(velocity) ||
        velocity < 1 ||
        velocity > 127
      ) {
        return refuse({
          code: "audio.velocity_invalid",
          path: ["notes", index, "velocity"],
        });
      }
      const physicalGestureValue = noteValue["physicalGesture"];
      let physicalGesture: ExpressiveVoiceGesture | null = null;
      if (physicalGestureValue !== undefined) {
        if (
          !isExpressiveVoiceGesture(physicalGestureValue) ||
          physicalGestureValue.instrumentFamily !==
            expectedPhysicalFamily(instrumentId.value)
        ) {
          return refuse({
            code: "audio.voice_id_invalid",
            path: ["notes", index, "physicalGesture"],
          });
        }
        physicalGesture = physicalGestureValue;
      }
      const physicalFrameCount = noteValue["physicalFrameCount"];
      const physicalCacheFingerprint = noteValue["physicalCacheFingerprint"];
      const physicalStateReset = noteValue["physicalStateReset"];
      const hasPhraseMetadata = physicalFrameCount !== undefined ||
        physicalCacheFingerprint !== undefined || physicalStateReset !== undefined;
      if (hasPhraseMetadata) {
        if (
          physicalGesture === null ||
          physicalGesture.instrumentFamily !== "clarinet" ||
          typeof physicalFrameCount !== "number" ||
          !Number.isSafeInteger(physicalFrameCount) ||
          physicalFrameCount <= 0 ||
          physicalFrameCount > PHYSICAL_RENDER_LIMITS.maximumOutputFrames ||
          typeof physicalCacheFingerprint !== "string" ||
          !/^[0-9a-f]{64}$/.test(physicalCacheFingerprint) ||
          typeof physicalStateReset !== "boolean"
        ) {
          return refuse({
            code: "audio.voice_id_invalid",
            path: ["notes", index, "physicalCacheFingerprint"],
          });
        }
        const phraseRenderer = waveguideRenderers?.get(
          WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
        )?.renderPhraseSegment;
        if (phraseRenderer === undefined) {
          return refuse({
            code: "audio.renderer_unavailable",
            path: ["notes", index],
          });
        }
        const key = `${recipe.id}:physical-segment:${physicalCacheFingerprint}`;
        const gestureFingerprint = physicalGestureFingerprint(physicalGesture);
        preparedPhysicalKeys.set(gestureFingerprint, key);
        const cached = touchRenderedBufferEntry(recipeBufferCache(recipe.id), key);
        if (cached !== undefined) {
          if (cached.phraseStateOutput === undefined) {
            return refuse({
              code: "audio.renderer_unavailable",
              path: ["notes", index],
            });
          }
          phraseStateByVoice.set(physicalGesture.voiceId, cached.phraseStateOutput);
          cachedCount += 1;
          continue;
        }
        const stateInput = physicalStateReset
          ? null
          : phraseStateByVoice.get(physicalGesture.voiceId) ?? null;
        const variationSlot = windVariationSlot(physicalGesture) ?? 0;
        const pcm = phraseRenderer(
          midiPitch.value,
          physicalGestureExcitationVelocity(physicalGesture, velocity),
          context.sampleRate,
          physicalFrameCount,
          stateInput,
          variationSlot,
          physicalGesture.articulation === "legato" ? "legato" : "tongued",
        );
        if (pcm === null) {
          return refuse({
            code: "audio.renderer_unavailable",
            path: ["notes", index],
          });
        }
        const stateOutput = pcm.stateOutput.slice();
        phraseStateByVoice.set(physicalGesture.voiceId, stateOutput);
        storeRenderedPcm(recipe, context, key, pcm, stateOutput);
        renderedCount += 1;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        continue;
      }
      const gateSecondsValue = noteValue["gateSeconds"];
      if (
        gateSecondsValue !== undefined &&
        (typeof gateSecondsValue !== "number" ||
          !Number.isFinite(gateSecondsValue) ||
          gateSecondsValue <= 0 ||
          gateSecondsValue > MAX_AUDIO_GATE_SECONDS)
      ) {
        return refuse({
          code: "audio.start_time_invalid",
          path: ["notes", index, "gateSeconds"],
        });
      }
      /*
       * Render the seconds bucket the attack path will request for this
       * gate. Without this a sustained chord warms the historical fixed
       * bucket, then the attack computes a longer window, lands in the next
       * bucket, and re-renders the whole note inside the lookahead deadline
       * (measured: 454 ms of attack-time piano renders after a 324 ms
       * warmup). The gate ceiling mirrors the attack path's
       * MAX_AUDIO_GATE_SECONDS exactly: a stricter preparation ceiling would
       * refuse warmup for charts the attack path is contracted to play.
       */
      const prepareSeconds = gateSecondsValue === undefined
        ? PREPARE_RENDER_SECONDS
        : gatedRenderWindowSeconds(gateSecondsValue, recipe);
      const key = renderedBufferKey(
        recipe.id,
        midiPitch.value,
        velocity,
        bucketRenderSeconds(prepareSeconds),
        physicalGesture,
      );
      if (touchRenderedBufferEntry(recipeBufferCache(recipe.id), key) !== undefined) {
        cachedCount += 1;
        continue;
      }
      const buffer = renderedBufferFor(
        recipe,
        context,
        midiPitch.value,
        velocity,
        prepareSeconds,
        physicalGesture,
      );
      if (buffer === null) {
        return refuse({
          code: "audio.renderer_unavailable",
          path: ["notes", index],
        });
      }
      renderedCount += 1;
      /*
       * Yield one macrotask per rendered note. A long synchronous render run
       * starves the event loop, and Firefox's `AudioContext.currentTime` is
       * refreshed by main-thread runnables — without this yield the transport
       * that runs next can anchor a whole run on a stale clock reading and
       * natural-end it instantly (observed in the 2026-07-28 audible
       * evidence). This timer initiates no attack, release, reconnection, or
       * cleanup; it only paces cache warming, so the X0 no-anonymous-timer
       * law is not implicated.
       */
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    return success(
      Object.freeze({
        instrumentId: instrumentId.value,
        renderedCount,
        cachedCount,
      }),
    );
  }

  return Object.freeze({
    initializeAudioEngine,
    resumeAudioEngine,
    setAudioMix,
    attackAudioVoices,
    retireAudioVoices,
    inspectAudioEngine,
    disposeAudioEngine,
    prepareRenderedAudioVoices,
    analyzeAudioOutput,
  });
}

export function createAudioEngine(platform: AudioPlatform): AudioEngine {
  return createAudioEngineInternal(platform, ZERO_AUDIO_ENGINE_SEQUENCE_SEED);
}

/**
 * Deep-module-only cache-pressure seam. It is intentionally absent from the
 * audio barrel so production composition cannot shrink the reviewed cache
 * ceilings; tests use it to prove global eviction without rendering ~100 MiB
 * of real PCM, whose per-note trailing trim makes byte totals nondeterministic.
 */
export function createAudioEngineWithRenderCacheLimitsForTest(
  platform: AudioPlatform,
  limits: AudioEngineRenderCacheLimitsForTest,
): AudioEngine {
  const entries = limits.maximumCacheEntries;
  const bytes = limits.maximumCachePcmBytes;
  if (
    (entries !== undefined &&
      (!Number.isSafeInteger(entries) || entries < 1)) ||
    (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 1))
  ) {
    throw new Error("AUDIO_TEST_RENDER_CACHE_LIMITS_INVALID");
  }
  return createAudioEngineInternal(
    platform,
    ZERO_AUDIO_ENGINE_SEQUENCE_SEED,
    limits,
  );
}

/**
 * Deep-module-only exhaustion seam. It is intentionally absent from the audio
 * barrel so production composition cannot seed internal identities.
 */
export function createAudioEngineWithSequenceSeedForTest(
  platform: AudioPlatform,
  sequenceSeed: AudioEngineSequenceSeedForTest,
): AudioEngine {
  const candidate: unknown = sequenceSeed;
  if (!isRecord(candidate)) {
    throw new Error("AUDIO_TEST_SEQUENCE_SEED_INVALID");
  }
  const lastGraphSequence = candidate["lastGraphSequence"];
  const lastVoiceSequence = candidate["lastVoiceSequence"];
  const lastDebugSequence = candidate["lastDebugSequence"];
  if (
    !isValidInternalSequenceSeed(lastGraphSequence) ||
    !isValidInternalSequenceSeed(lastVoiceSequence) ||
    !isValidInternalSequenceSeed(lastDebugSequence)
  ) {
    throw new Error("AUDIO_TEST_SEQUENCE_SEED_INVALID");
  }
  return createAudioEngineInternal(
    platform,
    Object.freeze({
      lastGraphSequence,
      lastVoiceSequence,
      lastDebugSequence,
    }),
  );
}
