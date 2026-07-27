import {
  createAudioEngine,
  type AudioContextPort,
  type AudioEngineResult,
  type AudioEngineSnapshot,
  type AudioEngineState,
  type AudioEngineWorkCounters,
  type AudioPlatform,
} from "../audio";
import { createBrowserAudioPlatform } from "../audio/runtime";
import {
  makeInstrumentId,
  makeMidiPitch,
  type InstrumentId,
  type MidiPitch,
} from "../domain";

import { createOfflineAudioPlatform } from "./offline-audio-platform";

const OFFLINE_RECORD_SCHEMA = "changes.evidence.x0-offline-render.v1";
const REAL_CONTEXT_RECORD_SCHEMA =
  "changes.evidence.x0-real-audio-context.v1";
const DEFAULT_ONSET_THRESHOLD = 0.0000001;
const DEFAULT_MASTER_VOLUME = 0.8;
const DEFAULT_RMS_WINDOW_SECONDS = 0.5;
const DEFAULT_REAL_CONTEXT_CYCLES = 100;
const REAL_CONTEXT_CLEANUP_POLL_LIMIT = 200;
const REAL_CONTEXT_CLEANUP_POLL_MILLISECONDS = 10;

export type X0OfflineRenderCaseInput = Readonly<{
  id: string;
  instrumentId: string;
  scenario?: string;
  sampleRate: number;
  midiPitches: readonly number[];
  velocity: number;
  start: number;
  release: number;
  renderDuration: number;
  reverbAmount: number;
}>;

export type X0OfflineMeasurementOptions = Readonly<{
  masterVolume?: number;
  onsetThreshold?: number;
  rmsWindowSeconds?: number;
}>;

export type X0MeasurementWindow = Readonly<{
  startSeconds: number;
  endSeconds: number;
}>;

export type X0OfflineRenderMetrics = Readonly<{
  absolutePeak: number;
  onsetThreshold: number;
  onsetSeconds: number | null;
  activeRms: number;
  earlyTailRms: number;
  finalTailRms: number;
  activeWindow: X0MeasurementWindow;
  earlyTailWindow: X0MeasurementWindow;
  finalTailWindow: X0MeasurementWindow;
  nanSampleCount: number;
  infiniteSampleCount: number;
  unityClipSampleCount: number;
  nonZeroSampleCount: number;
  scalarSampleCount: number;
}>;

export type X0OfflineRenderRecord = Readonly<{
  schema: typeof OFFLINE_RECORD_SCHEMA;
  caseId: string;
  instrumentId: InstrumentId;
  scenario: string | null;
  sampleRate: number;
  masterVolume: number;
  renderDurationSeconds: number;
  renderFrameCount: number;
  channelCount: number;
  initializationState: "ready" | "suspended";
  graph: Readonly<{
    instanceId: number;
    persistentCreatedNodeCount: number;
    persistentEdgeCount: number;
    contextCreationCount: number;
  }>;
  schedule: Readonly<{
    voiceCount: number;
    scheduledSourceCount: number;
  }>;
  registryAfterRender: Readonly<{
    retainedVoiceCount: number;
    nonreleasingVoiceCount: number;
    releasingVoiceCount: number;
    totalIndexReferences: number;
  }>;
  impulse: Readonly<{
    createdBufferCount: number;
    convolverAssignmentCount: number;
    assignedGeneratedBufferByIdentity: boolean;
    numberOfChannels: number;
    length: number;
    sampleRate: number;
  }>;
  metrics: X0OfflineRenderMetrics;
  hashes: Readonly<{
    algorithm: "SHA-256";
    pcmEncoding: "channel-interleaved-float32-little-endian";
    impulseEncoding: "q15-interleaved-int16-little-endian";
    webCryptoAvailable: boolean;
    pcmSha256: string | null;
    impulseQ15Sha256: string | null;
  }>;
  work: AudioEngineWorkCounters;
  listeningAssessment: "not-performed-by-automation";
}>;

export type X0RealAudioContextProbeOptions = Readonly<{
  cycles?: number;
}>;

export type X0RealAudioContextProbeRecord = Readonly<{
  schema: typeof REAL_CONTEXT_RECORD_SCHEMA;
  outcome: "completed" | "unsupported" | "refused" | "failed";
  reasonCode: string | null;
  userAgent: string;
  gestureEventType: string;
  gestureKind: "trusted-pointer" | "trusted-keyboard" | null;
  gestureTrusted: boolean;
  nativeAudioContextAvailable: boolean;
  nativeCancelAndHoldAtTimeAvailable: boolean;
  platformCreateContextCount: number;
  initialGraphInstanceId: number | null;
  reusedGraphInstanceId: number | null;
  reusedExistingGraph: boolean;
  contextStateAfterInitialization: AudioEngineSnapshot["contextState"] | null;
  contextSampleRate: number | null;
  contextTimeBeforeCycles: number | null;
  contextTimeAfterCleanup: number | null;
  persistentCreatedNodeCount: number;
  persistentEdgeCount: number;
  mixAutomationPath: "native-cancel-and-hold" | "analytic-cancel-set" | null;
  mixAutomationEventDelta: number;
  cyclesRequested: number;
  attackSuccessCount: number;
  retirementSuccessCount: number;
  retirementNoFutureAttackPostconditionCount: number;
  cleanupPollCount: number;
  cleanupComplete: boolean;
  retainedVoiceCountAfterCleanup: number;
  registryIndexReferencesAfterCleanup: number;
  scheduledSourceCount: number;
  cleanupCallbackCount: number;
  disposedContextClosed: boolean;
  engineStateAfterDispose: AudioEngineState | null;
  work: AudioEngineWorkCounters | null;
  listeningAssessment: "not-performed-by-automation";
}>;

export type X0AudioBrowserEvidenceHarness = Readonly<{
  runOfflineRenderCase(
    input: X0OfflineRenderCaseInput,
    options?: X0OfflineMeasurementOptions,
  ): Promise<X0OfflineRenderRecord>;
  beginRealAudioContextProbe(
    event: Event,
    options?: X0RealAudioContextProbeOptions,
  ): Promise<X0RealAudioContextProbeRecord>;
}>;

type MutableRealProbeCounts = {
  platformCreateContextCount: number;
};

type RealProbeGesture = Readonly<{
  eventType: string;
  kind: "trusted-pointer" | "trusted-keyboard" | null;
  trusted: boolean;
  refusalCode: string | null;
}>;

function requireEngineSuccess<Value>(
  result: AudioEngineResult<Value>,
  operation: string,
): Value {
  if (!result.ok) {
    throw new Error(`${operation}:${result.refusal.code}`);
  }
  return result.value;
}

function requireInstrumentId(value: string): InstrumentId {
  const result = makeInstrumentId(value);
  if (!result.ok) throw new Error("X0_RENDER_INSTRUMENT_INVALID");
  return result.value;
}

function requireMidiPitch(value: number): MidiPitch {
  const result = makeMidiPitch(value);
  if (!result.ok) throw new Error("X0_RENDER_MIDI_PITCH_INVALID");
  return result.value;
}

function requireFiniteRange(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(code);
  }
  return value;
}

function validateRenderInput(input: X0OfflineRenderCaseInput): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(input.id) ||
    input.id.length > 128
  ) {
    throw new Error("X0_RENDER_CASE_ID_INVALID");
  }
  requireInstrumentId(input.instrumentId);
  if (
    !Number.isInteger(input.sampleRate) ||
    input.sampleRate < 8_000 ||
    input.sampleRate > 192_000
  ) {
    throw new Error("X0_RENDER_SAMPLE_RATE_INVALID");
  }
  if (
    input.midiPitches.length < 1 ||
    input.midiPitches.length > 16
  ) {
    throw new Error("X0_RENDER_VOICE_COUNT_INVALID");
  }
  for (const pitch of input.midiPitches) requireMidiPitch(pitch);
  if (
    !Number.isInteger(input.velocity) ||
    input.velocity < 1 ||
    input.velocity > 127
  ) {
    throw new Error("X0_RENDER_VELOCITY_INVALID");
  }
  requireFiniteRange(input.start, 0, 0.25, "X0_RENDER_START_INVALID");
  requireFiniteRange(
    input.release,
    input.start + 0.005,
    input.start + 600,
    "X0_RENDER_RELEASE_INVALID",
  );
  requireFiniteRange(
    input.renderDuration,
    input.release,
    8,
    "X0_RENDER_DURATION_INVALID",
  );
  requireFiniteRange(
    input.reverbAmount,
    0,
    1,
    "X0_RENDER_REVERB_INVALID",
  );
}

function measurementOptions(
  options: X0OfflineMeasurementOptions,
): Readonly<{
  masterVolume: number;
  onsetThreshold: number;
  rmsWindowSeconds: number;
}> {
  const masterVolume = requireFiniteRange(
    options.masterVolume ?? DEFAULT_MASTER_VOLUME,
    0,
    1,
    "X0_RENDER_MASTER_VOLUME_INVALID",
  );
  const onsetThreshold = requireFiniteRange(
    options.onsetThreshold ?? DEFAULT_ONSET_THRESHOLD,
    Number.MIN_VALUE,
    1,
    "X0_RENDER_ONSET_THRESHOLD_INVALID",
  );
  const rmsWindowSeconds = requireFiniteRange(
    options.rmsWindowSeconds ?? DEFAULT_RMS_WINDOW_SECONDS,
    0.01,
    2,
    "X0_RENDER_RMS_WINDOW_INVALID",
  );
  return Object.freeze({ masterVolume, onsetThreshold, rmsWindowSeconds });
}

export function x0FirstFrameAtOrAfter(
  timeSeconds: number,
  sampleRate: number,
  frameCount: number,
): number {
  const boundedTime = Math.max(0, timeSeconds);
  let candidate = Math.max(
    0,
    Math.min(frameCount, Math.floor(boundedTime * sampleRate)),
  );
  while (
    candidate < frameCount &&
    candidate / sampleRate < boundedTime
  ) {
    candidate += 1;
  }
  while (
    candidate > 0 &&
    (candidate - 1) / sampleRate >= boundedTime
  ) {
    candidate -= 1;
  }
  return candidate;
}

function frameRange(
  buffer: AudioBuffer,
  window: X0MeasurementWindow,
): Readonly<{ first: number; end: number }> {
  const first = x0FirstFrameAtOrAfter(
    window.startSeconds,
    buffer.sampleRate,
    buffer.length,
  );
  const end = Math.max(
    first,
    x0FirstFrameAtOrAfter(
      window.endSeconds,
      buffer.sampleRate,
      buffer.length,
    ),
  );
  return { first, end };
}

function rootMeanSquare(
  buffer: AudioBuffer,
  window: X0MeasurementWindow,
): number {
  const range = frameRange(buffer, window);
  let sumSquares = 0;
  let scalarSamples = 0;
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  for (let frame = range.first; frame < range.end; frame += 1) {
    for (const samples of channels) {
      const sample = samples[frame];
      if (sample === undefined) continue;
      if (Number.isFinite(sample)) sumSquares += sample * sample;
      scalarSamples += 1;
    }
  }
  return scalarSamples === 0 ? 0 : Math.sqrt(sumSquares / scalarSamples);
}

function measureOfflineRender(
  buffer: AudioBuffer,
  input: X0OfflineRenderCaseInput,
  options: Readonly<{ onsetThreshold: number; rmsWindowSeconds: number }>,
): X0OfflineRenderMetrics {
  let absolutePeak = 0;
  let onsetFrame: number | null = null;
  let nanSampleCount = 0;
  let infiniteSampleCount = 0;
  let unityClipSampleCount = 0;
  let nonZeroSampleCount = 0;

  for (let frame = 0; frame < buffer.length; frame += 1) {
    let frameAboveOnset = false;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const sample = buffer.getChannelData(channel)[frame];
      if (sample === undefined) continue;
      if (Number.isNaN(sample)) {
        nanSampleCount += 1;
        continue;
      }
      if (!Number.isFinite(sample)) {
        infiniteSampleCount += 1;
        continue;
      }
      const magnitude = Math.abs(sample);
      absolutePeak = Math.max(absolutePeak, magnitude);
      if (magnitude >= 1) unityClipSampleCount += 1;
      if (sample !== 0) nonZeroSampleCount += 1;
      if (magnitude > options.onsetThreshold) frameAboveOnset = true;
    }
    if (onsetFrame === null && frameAboveOnset) onsetFrame = frame;
  }

  const renderEnd = buffer.duration;
  const activeWindow: X0MeasurementWindow = Object.freeze({
    startSeconds: input.start,
    endSeconds: Math.min(input.release, renderEnd),
  });
  const earlyTailWindow: X0MeasurementWindow = Object.freeze({
    startSeconds: Math.min(input.release, renderEnd),
    endSeconds: Math.min(input.release + options.rmsWindowSeconds, renderEnd),
  });
  const finalTailWindow: X0MeasurementWindow = Object.freeze({
    startSeconds: Math.max(
      Math.min(input.release, renderEnd),
      renderEnd - options.rmsWindowSeconds,
    ),
    endSeconds: renderEnd,
  });

  return Object.freeze({
    absolutePeak,
    onsetThreshold: options.onsetThreshold,
    onsetSeconds:
      onsetFrame === null ? null : onsetFrame / buffer.sampleRate,
    activeRms: rootMeanSquare(buffer, activeWindow),
    earlyTailRms: rootMeanSquare(buffer, earlyTailWindow),
    finalTailRms: rootMeanSquare(buffer, finalTailWindow),
    activeWindow,
    earlyTailWindow,
    finalTailWindow,
    nanSampleCount,
    infiniteSampleCount,
    unityClipSampleCount,
    nonZeroSampleCount,
    scalarSampleCount: buffer.length * buffer.numberOfChannels,
  });
}

function webCryptoSha256Available(): boolean {
  return (
    typeof globalThis.crypto === "object" &&
    typeof globalThis.crypto.subtle === "object" &&
    typeof globalThis.crypto.subtle.digest === "function"
  );
}

function canonicalFloat32Bytes(buffer: AudioBuffer): Uint8Array<ArrayBuffer> {
  const scalarSampleCount = buffer.length * buffer.numberOfChannels;
  const bytes = new Uint8Array(scalarSampleCount * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  let byteOffset = 0;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const sample = buffer.getChannelData(channel)[frame] ?? 0;
      view.setFloat32(byteOffset, sample, true);
      byteOffset += Float32Array.BYTES_PER_ELEMENT;
    }
  }
  return bytes;
}

async function audioBufferSha256(buffer: AudioBuffer): Promise<string | null> {
  if (!webCryptoSha256Available()) return null;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    canonicalFloat32Bytes(buffer),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function canonicalImpulseQ15Bytes(
  buffer: AudioBuffer,
): Uint8Array<ArrayBuffer> {
  const scalarSampleCount = buffer.length * buffer.numberOfChannels;
  const bytes = new Uint8Array(scalarSampleCount * Int16Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  let byteOffset = 0;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const sample = buffer.getChannelData(channel)[frame] ?? 0;
      const q15 = Math.max(-32_768, Math.min(32_767, Math.round(sample * 32_768)));
      view.setInt16(byteOffset, q15, true);
      byteOffset += Int16Array.BYTES_PER_ELEMENT;
    }
  }
  return bytes;
}

async function impulseQ15Sha256(buffer: AudioBuffer): Promise<string | null> {
  if (!webCryptoSha256Available()) return null;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    canonicalImpulseQ15Bytes(buffer),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function runOfflineRenderCase(
  input: X0OfflineRenderCaseInput,
  rawOptions: X0OfflineMeasurementOptions = {},
): Promise<X0OfflineRenderRecord> {
  validateRenderInput(input);
  const options = measurementOptions(rawOptions);
  const instrumentId = requireInstrumentId(input.instrumentId);
  const offline = createOfflineAudioPlatform({
    sampleRate: input.sampleRate,
    renderDurationSeconds: input.renderDuration,
  });
  const engine = createAudioEngine(offline.platform);
  const initialization = requireEngineSuccess(
    await engine.initializeAudioEngine({
      gesture: Object.freeze({
        kind: "trusted-pointer",
        trusted: true,
        sequence: 1,
      }),
      initialMix: Object.freeze({
        masterVolume: options.masterVolume,
        reverbAmount: input.reverbAmount,
      }),
    }),
    "X0_RENDER_INITIALIZE",
  );

  const voiceSpecs = input.midiPitches.map((pitch, index) =>
    Object.freeze({
      voiceId: `render-voice-${String(index + 1)}`,
      midiPitch: requireMidiPitch(pitch),
      velocity: input.velocity,
    })
  );
  const firstVoice = voiceSpecs[0];
  if (firstVoice === undefined) throw new Error("X0_RENDER_VOICE_MISSING");
  const voices: [typeof firstVoice, ...typeof voiceSpecs] = [
    firstVoice,
    ...voiceSpecs.slice(1),
  ];
  Object.freeze(voices);
  const attack = requireEngineSuccess(
    engine.attackAudioVoices({
      owner: Object.freeze({ kind: "progression", generation: 1 }),
      eventId: "render-event",
      instrumentId,
      startTimeSeconds: input.start,
      releaseTimeSeconds: input.release,
      voices,
    }),
    "X0_RENDER_ATTACK",
  );
  const graphSnapshot = attack.snapshot;
  const rendered = await offline.startRendering();
  const registrySnapshot = engine.inspectAudioEngine();
  const createdBuffers = offline.createdBuffers();
  const assignedBuffers = offline.convolverAssignedBuffers();
  const impulseBuffer = assignedBuffers[0];
  if (impulseBuffer === undefined) {
    throw new Error("X0_RENDER_IMPULSE_NOT_ASSIGNED");
  }
  const assignedGeneratedBufferByIdentity =
    assignedBuffers.length === 1 &&
    createdBuffers.length === 1 &&
    createdBuffers[0] === impulseBuffer;
  const webCryptoAvailable = webCryptoSha256Available();
  const [pcmSha256, impulseQ15Hash] = await Promise.all([
    audioBufferSha256(rendered),
    impulseQ15Sha256(impulseBuffer),
  ]);
  const metrics = measureOfflineRender(rendered, input, options);
  const work = registrySnapshot.work;

  await engine.disposeAudioEngine({ reason: "page-teardown" });

  return Object.freeze({
    schema: OFFLINE_RECORD_SCHEMA,
    caseId: input.id,
    instrumentId,
    scenario: input.scenario ?? null,
    sampleRate: rendered.sampleRate,
    masterVolume: options.masterVolume,
    renderDurationSeconds: rendered.duration,
    renderFrameCount: rendered.length,
    channelCount: rendered.numberOfChannels,
    initializationState: initialization.state,
    graph: Object.freeze({
      instanceId: graphSnapshot.graphInstanceId ?? initialization.graphInstanceId,
      persistentCreatedNodeCount: graphSnapshot.persistentCreatedNodeCount,
      persistentEdgeCount: graphSnapshot.persistentEdgeCount,
      contextCreationCount: offline.contextCreationCount(),
    }),
    schedule: Object.freeze({
      voiceCount: input.midiPitches.length,
      scheduledSourceCount: work.scheduledSourcesCreated,
    }),
    registryAfterRender: Object.freeze({
      retainedVoiceCount: registrySnapshot.retainedVoiceCount,
      nonreleasingVoiceCount: registrySnapshot.nonreleasingVoiceCount,
      releasingVoiceCount: registrySnapshot.releasingVoiceCount,
      totalIndexReferences:
        registrySnapshot.registryIndexCounts.totalReferences,
    }),
    impulse: Object.freeze({
      createdBufferCount: createdBuffers.length,
      convolverAssignmentCount: assignedBuffers.length,
      assignedGeneratedBufferByIdentity,
      numberOfChannels: impulseBuffer.numberOfChannels,
      length: impulseBuffer.length,
      sampleRate: impulseBuffer.sampleRate,
    }),
    metrics,
    hashes: Object.freeze({
      algorithm: "SHA-256",
      pcmEncoding: "channel-interleaved-float32-little-endian",
      impulseEncoding: "q15-interleaved-int16-little-endian",
      webCryptoAvailable,
      pcmSha256,
      impulseQ15Sha256: impulseQ15Hash,
    }),
    work,
    listeningAssessment: "not-performed-by-automation",
  });
}

function countedProductionPlatform(
  counts: MutableRealProbeCounts,
  captureContext: (context: AudioContextPort) => void,
): AudioPlatform {
  const production = createBrowserAudioPlatform();
  return Object.freeze({
    createContext(options) {
      counts.platformCreateContextCount += 1;
      const productionContext = production.createContext(options);
      captureContext(productionContext);
      return productionContext;
    },
  });
}

function gestureObservation(event: Event): RealProbeGesture {
  const keyboard = event.type === "keydown" || event.type === "keyup";
  const pointer =
    event.type === "pointerdown" ||
    event.type === "pointerup" ||
    event.type === "click" ||
    event.type === "mousedown" ||
    event.type === "mouseup" ||
    event.type === "touchstart";
  if (!event.isTrusted) {
    return Object.freeze({
      eventType: event.type,
      kind: null,
      trusted: false,
      refusalCode: "X0_REAL_GESTURE_UNTRUSTED",
    });
  }
  if (!keyboard && !pointer) {
    return Object.freeze({
      eventType: event.type,
      kind: null,
      trusted: true,
      refusalCode: "X0_REAL_GESTURE_KIND_UNSUPPORTED",
    });
  }
  return Object.freeze({
    eventType: event.type,
    kind: keyboard ? "trusted-keyboard" : "trusted-pointer",
    trusted: true,
    refusalCode: null,
  });
}

function nativeCancelAndHoldAvailable(): boolean {
  return (
    typeof globalThis.AudioParam === "function" &&
    typeof globalThis.AudioParam.prototype.cancelAndHoldAtTime === "function"
  );
}

function userAgent(): string {
  return typeof globalThis.navigator === "object"
    ? globalThis.navigator.userAgent
    : "unknown";
}

function emptyRealProbeRecord(
  gesture: RealProbeGesture,
  outcome: X0RealAudioContextProbeRecord["outcome"],
  reasonCode: string,
  cyclesRequested: number,
  nativeAudioContextAvailable: boolean,
): X0RealAudioContextProbeRecord {
  return Object.freeze({
    schema: REAL_CONTEXT_RECORD_SCHEMA,
    outcome,
    reasonCode,
    userAgent: userAgent(),
    gestureEventType: gesture.eventType,
    gestureKind: gesture.kind,
    gestureTrusted: gesture.trusted,
    nativeAudioContextAvailable,
    nativeCancelAndHoldAtTimeAvailable: nativeCancelAndHoldAvailable(),
    platformCreateContextCount: 0,
    initialGraphInstanceId: null,
    reusedGraphInstanceId: null,
    reusedExistingGraph: false,
    contextStateAfterInitialization: null,
    contextSampleRate: null,
    contextTimeBeforeCycles: null,
    contextTimeAfterCleanup: null,
    persistentCreatedNodeCount: 0,
    persistentEdgeCount: 0,
    mixAutomationPath: null,
    mixAutomationEventDelta: 0,
    cyclesRequested,
    attackSuccessCount: 0,
    retirementSuccessCount: 0,
    retirementNoFutureAttackPostconditionCount: 0,
    cleanupPollCount: 0,
    cleanupComplete: false,
    retainedVoiceCountAfterCleanup: 0,
    registryIndexReferencesAfterCleanup: 0,
    scheduledSourceCount: 0,
    cleanupCallbackCount: 0,
    disposedContextClosed: false,
    engineStateAfterDispose: null,
    work: null,
    listeningAssessment: "not-performed-by-automation",
  });
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "X0_REAL_AUDIO_CONTEXT_UNKNOWN_FAILURE";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

async function finishRealAudioContextProbe(
  gesture: RealProbeGesture & Readonly<{
    kind: "trusted-pointer" | "trusted-keyboard";
  }>,
  cyclesRequested: number,
  counts: MutableRealProbeCounts,
  context: () => AudioContextPort | null,
  initializationPromise: ReturnType<
    ReturnType<typeof createAudioEngine>["initializeAudioEngine"]
  >,
  engine: ReturnType<typeof createAudioEngine>,
): Promise<X0RealAudioContextProbeRecord> {
  let attackSuccessCount = 0;
  let retirementSuccessCount = 0;
  let retirementNoFutureAttackPostconditionCount = 0;
  try {
    const initialization = requireEngineSuccess(
      await initializationPromise,
      "X0_REAL_INITIALIZE",
    );
    const initialSnapshot = initialization.snapshot;
    const audioContext = context();
    if (audioContext === null) {
      throw new Error("X0_REAL_CONTEXT_CAPTURE_MISSING");
    }
    const contextSampleRate = audioContext.sampleRate;
    const reuse = requireEngineSuccess(
      await engine.initializeAudioEngine({
        gesture: Object.freeze({
          kind: gesture.kind,
          trusted: true,
          sequence: 2,
        }),
        initialMix: Object.freeze({ masterVolume: 0, reverbAmount: 0 }),
      }),
      "X0_REAL_REUSE",
    );
    const beforeMixWork = reuse.snapshot.work.parameterEventsScheduled;
    requireEngineSuccess(
      engine.setAudioMix({ masterVolume: 0, reverbAmount: 0.25 }),
      "X0_REAL_MIX",
    );
    const afterMixWork = engine.inspectAudioEngine().work
      .parameterEventsScheduled;
    const mixAutomationEventDelta = afterMixWork - beforeMixWork;
    const mixAutomationPath =
      mixAutomationEventDelta === 4
        ? "native-cancel-and-hold"
        : mixAutomationEventDelta === 6
          ? "analytic-cancel-set"
          : null;
    if (mixAutomationPath === null) {
      throw new Error("X0_REAL_MIX_AUTOMATION_PATH_UNKNOWN");
    }
    const contextTimeBeforeCycles = audioContext.currentTime;

    const midiPitch = requireMidiPitch(69);
    for (let index = 0; index < cyclesRequested; index += 1) {
      const now = audioContext.currentTime;
      const voiceId = `probe-voice-${String(index + 1)}`;
      requireEngineSuccess(
        engine.attackAudioVoices({
          owner: Object.freeze({ kind: "progression", generation: 1 }),
          eventId: `probe-event-${String(index + 1)}`,
          instrumentId: "fm-electric-piano",
          startTimeSeconds: now + 0.04,
          releaseTimeSeconds: now + 0.12,
          voices: Object.freeze([
            Object.freeze({ voiceId, midiPitch, velocity: 64 }),
          ]),
        }),
        "X0_REAL_ATTACK",
      );
      attackSuccessCount += 1;
      const retirementTime = audioContext.currentTime + 0.01;
      const retirement = requireEngineSuccess(
        engine.retireAudioVoices({
          selector: Object.freeze({
            kind: "voice-ids",
            voiceIds: Object.freeze([voiceId] as [string]),
          }),
          reason: "all-notes-off",
          atTimeSeconds: retirementTime,
        }),
        "X0_REAL_RETIRE",
      );
      retirementSuccessCount += 1;
      if (retirement.noFutureAttackPostcondition) {
        retirementNoFutureAttackPostconditionCount += 1;
      }
    }

    let cleanupPollCount = 0;
    let cleanupSnapshot = engine.inspectAudioEngine();
    while (
      cleanupSnapshot.retainedVoiceCount !== 0 &&
      cleanupPollCount < REAL_CONTEXT_CLEANUP_POLL_LIMIT
    ) {
      await delay(REAL_CONTEXT_CLEANUP_POLL_MILLISECONDS);
      cleanupPollCount += 1;
      cleanupSnapshot = engine.inspectAudioEngine();
    }
    const work = cleanupSnapshot.work;
    const contextTimeAfterCleanup = audioContext.currentTime;
    const disposal = requireEngineSuccess(
      await engine.disposeAudioEngine({ reason: "page-teardown" }),
      "X0_REAL_DISPOSE",
    );

    return Object.freeze({
      schema: REAL_CONTEXT_RECORD_SCHEMA,
      outcome: "completed",
      reasonCode: null,
      userAgent: userAgent(),
      gestureEventType: gesture.eventType,
      gestureKind: gesture.kind,
      gestureTrusted: gesture.trusted,
      nativeAudioContextAvailable: true,
      nativeCancelAndHoldAtTimeAvailable: nativeCancelAndHoldAvailable(),
      platformCreateContextCount: counts.platformCreateContextCount,
      initialGraphInstanceId: initialization.graphInstanceId,
      reusedGraphInstanceId: reuse.graphInstanceId,
      reusedExistingGraph: reuse.reusedExistingGraph,
      contextStateAfterInitialization: initialSnapshot.contextState,
      contextSampleRate,
      contextTimeBeforeCycles,
      contextTimeAfterCleanup,
      persistentCreatedNodeCount:
        initialSnapshot.persistentCreatedNodeCount,
      persistentEdgeCount: initialSnapshot.persistentEdgeCount,
      mixAutomationPath,
      mixAutomationEventDelta,
      cyclesRequested,
      attackSuccessCount,
      retirementSuccessCount,
      retirementNoFutureAttackPostconditionCount,
      cleanupPollCount,
      cleanupComplete: cleanupSnapshot.retainedVoiceCount === 0,
      retainedVoiceCountAfterCleanup: cleanupSnapshot.retainedVoiceCount,
      registryIndexReferencesAfterCleanup:
        cleanupSnapshot.registryIndexCounts.totalReferences,
      scheduledSourceCount: work.scheduledSourcesCreated,
      cleanupCallbackCount: work.cleanupCallbacksHandled,
      disposedContextClosed: disposal.contextClosed,
      engineStateAfterDispose: disposal.snapshot.state,
      work,
      listeningAssessment: "not-performed-by-automation",
    });
  } catch (error) {
    const snapshot = engine.inspectAudioEngine();
    return Object.freeze({
      ...emptyRealProbeRecord(
        gesture,
        "failed",
        errorCode(error),
        cyclesRequested,
        true,
      ),
      platformCreateContextCount: counts.platformCreateContextCount,
      contextStateAfterInitialization: snapshot.contextState,
      persistentCreatedNodeCount: snapshot.persistentCreatedNodeCount,
      persistentEdgeCount: snapshot.persistentEdgeCount,
      retainedVoiceCountAfterCleanup: snapshot.retainedVoiceCount,
      registryIndexReferencesAfterCleanup:
        snapshot.registryIndexCounts.totalReferences,
      scheduledSourceCount: snapshot.work.scheduledSourcesCreated,
      cleanupCallbackCount: snapshot.work.cleanupCallbacksHandled,
      attackSuccessCount,
      retirementSuccessCount,
      retirementNoFutureAttackPostconditionCount,
      engineStateAfterDispose: snapshot.state,
      work: snapshot.work,
    });
  }
}

/**
 * This function intentionally is not async: native AudioContext construction
 * and resume begin before it returns, while the trusted DOM event is still on
 * the caller's stack.
 */
export function beginRealAudioContextProbe(
  event: Event,
  options: X0RealAudioContextProbeOptions = {},
): Promise<X0RealAudioContextProbeRecord> {
  const cyclesRequested = options.cycles ?? DEFAULT_REAL_CONTEXT_CYCLES;
  if (
    !Number.isInteger(cyclesRequested) ||
    cyclesRequested < 1 ||
    cyclesRequested > DEFAULT_REAL_CONTEXT_CYCLES
  ) {
    return Promise.resolve(
      emptyRealProbeRecord(
        gestureObservation(event),
        "refused",
        "X0_REAL_CYCLE_COUNT_INVALID",
        cyclesRequested,
        typeof globalThis.AudioContext === "function",
      ),
    );
  }
  const gesture = gestureObservation(event);
  if (gesture.refusalCode !== null || gesture.kind === null) {
    return Promise.resolve(
      emptyRealProbeRecord(
        gesture,
        "refused",
        gesture.refusalCode ?? "X0_REAL_GESTURE_INVALID",
        cyclesRequested,
        typeof globalThis.AudioContext === "function",
      ),
    );
  }
  if (typeof globalThis.AudioContext !== "function") {
    return Promise.resolve(
      emptyRealProbeRecord(
        gesture,
        "unsupported",
        "X0_REAL_AUDIO_CONTEXT_UNAVAILABLE",
        cyclesRequested,
        false,
      ),
    );
  }

  const counts: MutableRealProbeCounts = {
    platformCreateContextCount: 0,
  };
  let capturedContext: AudioContextPort | null = null;
  const platform = countedProductionPlatform(counts, (context) => {
    capturedContext = context;
  });
  const engine = createAudioEngine(platform);
  const initializationPromise = engine.initializeAudioEngine({
    gesture: Object.freeze({
      kind: gesture.kind,
      trusted: true,
      sequence: 1,
    }),
    initialMix: Object.freeze({ masterVolume: 0, reverbAmount: 0 }),
  });

  return finishRealAudioContextProbe(
    gesture as RealProbeGesture & Readonly<{
      kind: "trusted-pointer" | "trusted-keyboard";
    }>,
    cyclesRequested,
    counts,
    () => capturedContext,
    initializationPromise,
    engine,
  );
}

const x0AudioBrowserEvidenceHarness: X0AudioBrowserEvidenceHarness =
  Object.freeze({
    runOfflineRenderCase,
    beginRealAudioContextProbe,
  });

const evidenceGlobal = globalThis as typeof globalThis & {
  __JCPE_X0_AUDIO_EVIDENCE__?: X0AudioBrowserEvidenceHarness;
};

if (evidenceGlobal.__JCPE_X0_AUDIO_EVIDENCE__ === undefined) {
  Object.defineProperty(evidenceGlobal, "__JCPE_X0_AUDIO_EVIDENCE__", {
    configurable: false,
    enumerable: false,
    value: x0AudioBrowserEvidenceHarness,
    writable: false,
  });
}

export const X0_AUDIO_BROWSER_EVIDENCE = x0AudioBrowserEvidenceHarness;
