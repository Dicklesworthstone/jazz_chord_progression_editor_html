import {
  frequencyForMidi,
  type InstrumentId,
  type MidiPitch,
} from "../domain";
import {
  AUDIO_RETIREMENT_RELEASE_SECONDS,
  AUDIO_SOURCE_STOP_PADDING_SECONDS,
  MAX_AUDIO_SCHEDULED_SOURCES_PER_VOICE,
  type AudioActiveVoiceSnapshot,
  type AudioRetirementReason,
  type AudioVoiceOwner,
  type AudioVoicePhase,
} from "./audio-engine-contract";
import { holdAudioParamAtTime } from "./audio-dsp";
import type {
  AudioBufferPort,
  AudioContextPort,
  AudioNodePort,
  AudioParamPort,
  AudioScheduledSourceNodePort,
  BiquadFilterNodePort,
  GainNodePort,
  OscillatorNodePort,
  PeriodicWavePort,
} from "./audio-platform-contract";
import type {
  AudioInstrumentRecipe,
  AudioOscillatorComponent,
  AudioOscillatorWaveform,
} from "./instrument-recipes-contract";

export type ForcedAudioRetirementReason = Exclude<
  AudioRetirementReason,
  "natural-note-off"
>;

type SourceEntry = Readonly<{
  ordinal: number;
  node: AudioScheduledSourceNodePort;
}>;

export type SynthVoice = {
  readonly graphInstanceId: number;
  readonly instanceToken: number;
  readonly voiceId: string;
  readonly owner: AudioVoiceOwner;
  readonly eventId: string;
  readonly instrumentId: InstrumentId;
  readonly midiPitch: MidiPitch;
  readonly velocity: number;
  readonly originalBatchVoiceCount: number;
  readonly normalizationGain: number;
  readonly velocityGain: number;
  readonly peakGain: number;
  readonly attackTimeSeconds: number;
  readonly naturalReleaseTimeSeconds: number;
  readonly amplitudeAttackSeconds: number;
  readonly amplitudeDecaySeconds: number;
  readonly sustainLevel: number;
  readonly amplitudeGain: GainNodePort;
  readonly sources: readonly SourceEntry[];
  readonly ownedNodes: readonly AudioNodePort[];
  readonly endedSourceOrdinals: Set<number>;
  effectiveReleaseTimeSeconds: number;
  releaseDurationSeconds: number;
  heldGainAtRelease: number;
  sourceStopTimeSeconds: number;
  cleanupDeadlineSeconds: number;
  forcedReason: ForcedAudioRetirementReason | null;
  started: boolean;
  cleaned: boolean;
};

export type PrepareSynthVoiceRequest = Readonly<{
  context: AudioContextPort;
  instrumentBus: AudioNodePort;
  pulseWave: PeriodicWavePort;
  graphInstanceId: number;
  instanceToken: number;
  voiceId: string;
  owner: AudioVoiceOwner;
  eventId: string;
  instrumentId: InstrumentId;
  midiPitch: MidiPitch;
  velocity: number;
  originalBatchVoiceCount: number;
  normalizationGain: number;
  velocityGain: number;
  recipe: AudioInstrumentRecipe;
  /** Deterministic PCM for rendered recipes; null for oscillator recipes. */
  renderedBuffer: AudioBufferPort | null;
  onSourceEnded(
    graphInstanceId: number,
    voiceId: string,
    instanceToken: number,
    sourceOrdinal: number,
  ): void;
  recordParameterEvents(count: number): void;
}>;

export type SourceEndedStatus =
  | "duplicate"
  | "pending"
  | "complete"
  | "stale";

export function copyAudioOwner(owner: AudioVoiceOwner): AudioVoiceOwner {
  if (owner.kind === "progression") {
    return Object.freeze({ kind: "progression", generation: owner.generation });
  }
  return Object.freeze({
    kind: "preview",
    generation: owner.generation,
    previewId: owner.previewId,
  });
}

export function sameAudioOwner(
  left: AudioVoiceOwner,
  right: AudioVoiceOwner,
): boolean {
  if (left.kind !== right.kind || left.generation !== right.generation) {
    return false;
  }
  if (left.kind === "progression" && right.kind === "progression") return true;
  return (
    left.kind === "preview" &&
    right.kind === "preview" &&
    left.previewId === right.previewId
  );
}

export function normalizationGainForVoiceCount(
  outputLevel: number,
  voiceCount: number,
): number {
  return outputLevel / Math.sqrt(voiceCount);
}

export function velocityGainForVelocity(velocity: number): number {
  return Math.pow(velocity / 127, 1.5);
}

function setValue(
  parameter: AudioParamPort,
  value: number,
  atTimeSeconds: number,
  record: (count: number) => void,
): void {
  parameter.setValueAtTime(value, atTimeSeconds);
  record(1);
}

function linearRamp(
  parameter: AudioParamPort,
  value: number,
  atTimeSeconds: number,
  record: (count: number) => void,
): void {
  parameter.linearRampToValueAtTime(value, atTimeSeconds);
  record(1);
}

function exponentialRamp(
  parameter: AudioParamPort,
  value: number,
  atTimeSeconds: number,
  record: (count: number) => void,
): void {
  parameter.exponentialRampToValueAtTime(value, atTimeSeconds);
  record(1);
}

function disconnectWithoutMaskingFailure(nodes: readonly AudioNodePort[]): void {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node === undefined) continue;
    try {
      node.disconnect();
    } catch {
      // A preparation failure remains the authoritative platform failure.
    }
  }
}

function configureOscillator(
  oscillator: OscillatorNodePort,
  waveform: AudioOscillatorWaveform,
  pulseWave: PeriodicWavePort,
): void {
  if (waveform === "periodic-pulse-25") {
    oscillator.setPeriodicWave(pulseWave);
    return;
  }
  oscillator.type = waveform;
}

function scheduleOscillatorComponent(
  context: AudioContextPort,
  filter: BiquadFilterNodePort,
  pulseWave: PeriodicWavePort,
  baseFrequencyHz: number,
  startTimeSeconds: number,
  component: AudioOscillatorComponent,
  ownedNodes: AudioNodePort[],
  sources: SourceEntry[],
  onEnded: (sourceOrdinal: number) => void,
  record: (count: number) => void,
): void {
  const oscillator = context.createOscillator();
  ownedNodes.push(oscillator);
  const componentGain = context.createGain();
  ownedNodes.push(componentGain);
  configureOscillator(oscillator, component.waveform, pulseWave);
  setValue(
    oscillator.frequency,
    baseFrequencyHz * component.frequencyRatio,
    startTimeSeconds,
    record,
  );
  setValue(
    oscillator.detune,
    component.detuneCents,
    startTimeSeconds,
    record,
  );
  setValue(componentGain.gain, component.level, startTimeSeconds, record);
  oscillator.connect(componentGain);
  componentGain.connect(filter);
  const ordinal = sources.length;
  oscillator.onended = () => { onEnded(ordinal); };
  sources.push({ ordinal, node: oscillator });
}

function scheduleFilter(
  filter: BiquadFilterNodePort,
  recipe: AudioInstrumentRecipe,
  startTimeSeconds: number,
  record: (count: number) => void,
): void {
  filter.type = recipe.filter.type;
  setValue(filter.q, recipe.filter.q, startTimeSeconds, record);
  setValue(
    filter.frequency,
    recipe.filter.attackHz,
    startTimeSeconds,
    record,
  );
  const peakTime = startTimeSeconds + recipe.amplitude.attackSeconds;
  linearRamp(filter.frequency, recipe.filter.peakHz, peakTime, record);
  exponentialRamp(
    filter.frequency,
    recipe.filter.sustainHz,
    peakTime + recipe.filter.decaySeconds,
    record,
  );
}

function baseAmplitudeAt(
  voice: Pick<
    SynthVoice,
    | "attackTimeSeconds"
    | "amplitudeAttackSeconds"
    | "amplitudeDecaySeconds"
    | "peakGain"
    | "sustainLevel"
  >,
  atTimeSeconds: number,
): number {
  if (atTimeSeconds <= voice.attackTimeSeconds) return 0;
  const attackEnd = voice.attackTimeSeconds + voice.amplitudeAttackSeconds;
  if (atTimeSeconds < attackEnd) {
    if (voice.amplitudeAttackSeconds === 0) return voice.peakGain;
    return (
      voice.peakGain *
      ((atTimeSeconds - voice.attackTimeSeconds) /
        voice.amplitudeAttackSeconds)
    );
  }
  const decayEnd = attackEnd + voice.amplitudeDecaySeconds;
  if (atTimeSeconds < decayEnd) {
    if (voice.amplitudeDecaySeconds === 0) {
      return voice.peakGain * voice.sustainLevel;
    }
    const progress =
      (atTimeSeconds - attackEnd) / voice.amplitudeDecaySeconds;
    return (
      voice.peakGain *
      (1 + (voice.sustainLevel - 1) * progress)
    );
  }
  return voice.peakGain * voice.sustainLevel;
}

export function prepareSynthVoice(
  request: PrepareSynthVoiceRequest &
    Readonly<{
      startTimeSeconds: number;
      releaseTimeSeconds: number;
    }>,
): SynthVoice {
  const ownedNodes: AudioNodePort[] = [];
  const sources: SourceEntry[] = [];
  const onEnded = (sourceOrdinal: number): void => {
    request.onSourceEnded(
      request.graphInstanceId,
      request.voiceId,
      request.instanceToken,
      sourceOrdinal,
    );
  };
  const record = request.recordParameterEvents;
  const peakGain = request.normalizationGain * request.velocityGain;
  const baseFrequencyHz = frequencyForMidi(request.midiPitch);

  try {
    const filter = request.context.createBiquadFilter();
    ownedNodes.push(filter);
    const amplitudeGain = request.context.createGain();
    ownedNodes.push(amplitudeGain);
    filter.connect(amplitudeGain);
    scheduleFilter(filter, request.recipe, request.startTimeSeconds, record);

    if (request.recipe.synthesis === "additive") {
      for (const component of request.recipe.oscillators) {
        scheduleOscillatorComponent(
          request.context,
          filter,
          request.pulseWave,
          baseFrequencyHz,
          request.startTimeSeconds,
          component,
          ownedNodes,
          sources,
          onEnded,
          record,
        );
      }

      if (request.recipe.transient !== null) {
        const transientOscillator = request.context.createOscillator();
        ownedNodes.push(transientOscillator);
        const transientGain = request.context.createGain();
        ownedNodes.push(transientGain);
        transientOscillator.type = request.recipe.transient.waveform;
        setValue(
          transientOscillator.frequency,
          baseFrequencyHz * request.recipe.transient.frequencyRatio,
          request.startTimeSeconds,
          record,
        );
        setValue(
          transientGain.gain,
          request.recipe.transient.level,
          request.startTimeSeconds,
          record,
        );
        linearRamp(
          transientGain.gain,
          0,
          request.startTimeSeconds + request.recipe.transient.decaySeconds,
          record,
        );
        transientOscillator.connect(transientGain);
        transientGain.connect(filter);
        const ordinal = sources.length;
        transientOscillator.onended = () => { onEnded(ordinal); };
        sources.push({ ordinal, node: transientOscillator });
      }

      if (request.recipe.tremolo === null) {
        amplitudeGain.connect(request.instrumentBus);
      } else {
        const tremoloGain = request.context.createGain();
        ownedNodes.push(tremoloGain);
        const tremoloDepth = request.context.createGain();
        ownedNodes.push(tremoloDepth);
        const tremoloOscillator = request.context.createOscillator();
        ownedNodes.push(tremoloOscillator);
        tremoloOscillator.type = request.recipe.tremolo.waveform;
        const depthStart =
          request.startTimeSeconds + request.recipe.tremolo.delaySeconds;
        const depthEnd = depthStart + 0.01;
        setValue(
          tremoloOscillator.frequency,
          request.recipe.tremolo.rateHz,
          request.startTimeSeconds,
          record,
        );
        setValue(tremoloGain.gain, 1, request.startTimeSeconds, record);
        setValue(tremoloGain.gain, 1, depthStart, record);
        linearRamp(
          tremoloGain.gain,
          1 - request.recipe.tremolo.depth / 2,
          depthEnd,
          record,
        );
        setValue(tremoloDepth.gain, 0, request.startTimeSeconds, record);
        setValue(tremoloDepth.gain, 0, depthStart, record);
        linearRamp(
          tremoloDepth.gain,
          request.recipe.tremolo.depth / 2,
          depthEnd,
          record,
        );
        tremoloOscillator.connect(tremoloDepth);
        tremoloDepth.connectParam(tremoloGain.gain);
        amplitudeGain.connect(tremoloGain);
        tremoloGain.connect(request.instrumentBus);
        const ordinal = sources.length;
        tremoloOscillator.onended = () => { onEnded(ordinal); };
        sources.push({ ordinal, node: tremoloOscillator });
      }
    } else if (request.recipe.synthesis === "fm-pair") {
      const carrier = request.context.createOscillator();
      ownedNodes.push(carrier);
      const carrierGain = request.context.createGain();
      ownedNodes.push(carrierGain);
      const modulator = request.context.createOscillator();
      ownedNodes.push(modulator);
      const modulationGain = request.context.createGain();
      ownedNodes.push(modulationGain);
      const modulatorLifecycleGain = request.context.createGain();
      ownedNodes.push(modulatorLifecycleGain);
      configureOscillator(
        carrier,
        request.recipe.carrier.waveform,
        request.pulseWave,
      );
      modulator.type = request.recipe.modulator.waveform;
      setValue(
        carrier.frequency,
        baseFrequencyHz * request.recipe.carrier.frequencyRatio,
        request.startTimeSeconds,
        record,
      );
      setValue(
        carrier.detune,
        request.recipe.carrier.detuneCents,
        request.startTimeSeconds,
        record,
      );
      setValue(
        carrierGain.gain,
        request.recipe.carrier.level,
        request.startTimeSeconds,
        record,
      );
      const modulatorFrequency =
        baseFrequencyHz * request.recipe.modulator.frequencyRatio;
      setValue(
        modulator.frequency,
        modulatorFrequency,
        request.startTimeSeconds,
        record,
      );
      setValue(
        modulator.detune,
        request.recipe.modulator.detuneCents,
        request.startTimeSeconds,
        record,
      );
      const velocityProgress = (request.velocity - 1) / 126;
      const indexScale =
        request.recipe.modulator.velocityIndexScaleMinimum +
        (request.recipe.modulator.velocityIndexScaleMaximum -
          request.recipe.modulator.velocityIndexScaleMinimum) *
          velocityProgress;
      setValue(
        modulationGain.gain,
        modulatorFrequency * request.recipe.modulator.peakIndex * indexScale,
        request.startTimeSeconds,
        record,
      );
      exponentialRamp(
        modulationGain.gain,
        modulatorFrequency *
          request.recipe.modulator.sustainIndex *
          indexScale,
        request.startTimeSeconds + request.recipe.modulator.decaySeconds,
        record,
      );
      // Keep the control-rate source on a zero-valued audio path as well as its
      // AudioParam path. WebKit can otherwise omit `ended` for an oscillator
      // connected only to an AudioParam, leaking the exact voice instance even
      // though the source has stopped. The path is source-owned and silent.
      setValue(
        modulatorLifecycleGain.gain,
        0,
        request.startTimeSeconds,
        record,
      );
      carrier.connect(carrierGain);
      carrierGain.connect(filter);
      modulator.connect(modulationGain);
      modulationGain.connectParam(carrier.frequency);
      modulator.connect(modulatorLifecycleGain);
      modulatorLifecycleGain.connect(filter);
      amplitudeGain.connect(request.instrumentBus);
      const carrierOrdinal = sources.length;
      carrier.onended = () => { onEnded(carrierOrdinal); };
      sources.push({ ordinal: carrierOrdinal, node: carrier });
      const modulatorOrdinal = sources.length;
      modulator.onended = () => { onEnded(modulatorOrdinal); };
      sources.push({ ordinal: modulatorOrdinal, node: modulator });
    } else {
      /*
       * Rendered instrument: one buffer source carrying deterministic PCM
       * from the embedded DSP module. The buffer's own decay is the musical
       * envelope; the shared amplitude gain contributes only the click-guard
       * attack and the damper release, and the recipe's flat filter keeps the
       * uniform source → filter → gain → bus voice topology.
       */
      if (request.renderedBuffer === null) {
        throw new Error("AUDIO_RENDERED_BUFFER_MISSING");
      }
      const bufferSource = request.context.createBufferSource();
      ownedNodes.push(bufferSource);
      bufferSource.buffer = request.renderedBuffer;
      bufferSource.connect(filter);
      amplitudeGain.connect(request.instrumentBus);
      const ordinal = sources.length;
      bufferSource.onended = () => { onEnded(ordinal); };
      sources.push({ ordinal, node: bufferSource });
    }

    setValue(amplitudeGain.gain, 0, request.startTimeSeconds, record);
    const attackEnd =
      request.startTimeSeconds + request.recipe.amplitude.attackSeconds;
    linearRamp(amplitudeGain.gain, peakGain, attackEnd, record);
    linearRamp(
      amplitudeGain.gain,
      peakGain * request.recipe.amplitude.sustainLevel,
      attackEnd + request.recipe.amplitude.decaySeconds,
      record,
    );

    const amplitudeShape = {
      attackTimeSeconds: request.startTimeSeconds,
      amplitudeAttackSeconds: request.recipe.amplitude.attackSeconds,
      amplitudeDecaySeconds: request.recipe.amplitude.decaySeconds,
      peakGain,
      sustainLevel: request.recipe.amplitude.sustainLevel,
    };
    const naturalHeldGain = baseAmplitudeAt(
      amplitudeShape,
      request.releaseTimeSeconds,
    );
    holdAudioParamAtTime(
      amplitudeGain.gain,
      request.releaseTimeSeconds,
      naturalHeldGain,
      record,
    );
    const naturalReleaseEnd =
      request.releaseTimeSeconds + request.recipe.amplitude.releaseSeconds;
    linearRamp(amplitudeGain.gain, 0, naturalReleaseEnd, record);
    const sourceStopTime =
      naturalReleaseEnd + AUDIO_SOURCE_STOP_PADDING_SECONDS;

    if (sources.length > MAX_AUDIO_SCHEDULED_SOURCES_PER_VOICE) {
      throw new Error("AUDIO_VOICE_SOURCE_LIMIT_EXCEEDED");
    }

    return {
      graphInstanceId: request.graphInstanceId,
      instanceToken: request.instanceToken,
      voiceId: request.voiceId,
      owner: copyAudioOwner(request.owner),
      eventId: request.eventId,
      instrumentId: request.instrumentId,
      midiPitch: request.midiPitch,
      velocity: request.velocity,
      originalBatchVoiceCount: request.originalBatchVoiceCount,
      normalizationGain: request.normalizationGain,
      velocityGain: request.velocityGain,
      peakGain,
      attackTimeSeconds: request.startTimeSeconds,
      naturalReleaseTimeSeconds: request.releaseTimeSeconds,
      amplitudeAttackSeconds: request.recipe.amplitude.attackSeconds,
      amplitudeDecaySeconds: request.recipe.amplitude.decaySeconds,
      sustainLevel: request.recipe.amplitude.sustainLevel,
      amplitudeGain,
      sources: Object.freeze(sources),
      ownedNodes: Object.freeze(ownedNodes),
      endedSourceOrdinals: new Set<number>(),
      effectiveReleaseTimeSeconds: request.releaseTimeSeconds,
      releaseDurationSeconds: request.recipe.amplitude.releaseSeconds,
      heldGainAtRelease: naturalHeldGain,
      sourceStopTimeSeconds: sourceStopTime,
      cleanupDeadlineSeconds: sourceStopTime,
      forcedReason: null,
      started: false,
      cleaned: false,
    };
  } catch (error) {
    disconnectWithoutMaskingFailure(ownedNodes);
    throw error;
  }
}

export function startSynthVoice(voice: SynthVoice): void {
  for (const source of voice.sources) {
    source.node.start(voice.attackTimeSeconds);
    source.node.stop(voice.sourceStopTimeSeconds);
  }
  voice.started = true;
}

export function estimateSynthVoiceGain(
  voice: SynthVoice,
  atTimeSeconds: number,
): number {
  if (atTimeSeconds >= voice.effectiveReleaseTimeSeconds) {
    if (voice.releaseDurationSeconds === 0) return 0;
    const progress =
      (atTimeSeconds - voice.effectiveReleaseTimeSeconds) /
      voice.releaseDurationSeconds;
    return voice.heldGainAtRelease * Math.max(0, 1 - progress);
  }
  return baseAmplitudeAt(voice, atTimeSeconds);
}

export function isSynthVoiceRetiringAt(
  voice: SynthVoice,
  atTimeSeconds: number,
): boolean {
  return atTimeSeconds >= voice.effectiveReleaseTimeSeconds;
}

export function forceReleaseSynthVoice(
  voice: SynthVoice,
  reason: ForcedAudioRetirementReason,
  atTimeSeconds: number,
  recordParameterEvents: (count: number) => void,
): boolean {
  if (
    (voice.forcedReason !== null &&
      atTimeSeconds >= voice.effectiveReleaseTimeSeconds) ||
    (voice.forcedReason === null &&
      atTimeSeconds >= voice.naturalReleaseTimeSeconds)
  ) {
    return false;
  }
  const heldGain = estimateSynthVoiceGain(voice, atTimeSeconds);
  const releaseDuration = AUDIO_RETIREMENT_RELEASE_SECONDS[reason];
  const releaseEnd = atTimeSeconds + releaseDuration;
  holdAudioParamAtTime(
    voice.amplitudeGain.gain,
    atTimeSeconds,
    heldGain,
    recordParameterEvents,
  );
  linearRamp(
    voice.amplitudeGain.gain,
    0,
    releaseEnd,
    recordParameterEvents,
  );
  const paddedStop = releaseEnd + AUDIO_SOURCE_STOP_PADDING_SECONDS;
  const stopTime =
    atTimeSeconds < voice.attackTimeSeconds
      ? Math.min(voice.attackTimeSeconds, paddedStop)
      : paddedStop;
  for (const source of voice.sources) source.node.stop(stopTime);
  voice.effectiveReleaseTimeSeconds = atTimeSeconds;
  voice.releaseDurationSeconds = releaseDuration;
  voice.heldGainAtRelease = heldGain;
  voice.sourceStopTimeSeconds = stopTime;
  voice.cleanupDeadlineSeconds = stopTime;
  voice.forcedReason = reason;
  return true;
}

export function markSynthVoiceSourceEnded(
  voice: SynthVoice,
  sourceOrdinal: number,
): SourceEndedStatus {
  if (
    voice.cleaned ||
    !Number.isInteger(sourceOrdinal) ||
    sourceOrdinal < 0 ||
    sourceOrdinal >= voice.sources.length
  ) {
    return "stale";
  }
  if (voice.endedSourceOrdinals.has(sourceOrdinal)) return "duplicate";
  voice.endedSourceOrdinals.add(sourceOrdinal);
  return voice.endedSourceOrdinals.size === voice.sources.length
    ? "complete"
    : "pending";
}

export function cleanupSynthVoice(voice: SynthVoice): boolean {
  if (voice.cleaned) return false;
  voice.cleaned = true;
  let disconnectedCleanly = true;
  for (let index = voice.ownedNodes.length - 1; index >= 0; index -= 1) {
    const node = voice.ownedNodes[index];
    if (node === undefined) continue;
    try {
      node.disconnect();
    } catch {
      disconnectedCleanly = false;
    }
  }
  return disconnectedCleanly;
}

export function phaseForSynthVoice(
  voice: SynthVoice,
  atTimeSeconds: number,
): AudioVoicePhase {
  if (atTimeSeconds >= voice.effectiveReleaseTimeSeconds) return "releasing";
  if (atTimeSeconds < voice.attackTimeSeconds) return "scheduled";
  const attackAndDecayEnd =
    voice.attackTimeSeconds +
    voice.amplitudeAttackSeconds +
    voice.amplitudeDecaySeconds;
  return atTimeSeconds < attackAndDecayEnd ? "attacking" : "sustaining";
}

export function snapshotSynthVoice(
  voice: SynthVoice,
  atTimeSeconds: number,
): AudioActiveVoiceSnapshot {
  return Object.freeze({
    voiceId: voice.voiceId,
    instanceToken: voice.instanceToken,
    owner: copyAudioOwner(voice.owner),
    eventId: voice.eventId,
    instrumentId: voice.instrumentId,
    midiPitch: voice.midiPitch,
    velocity: voice.velocity,
    originalBatchVoiceCount: voice.originalBatchVoiceCount,
    normalizationGain: voice.normalizationGain,
    velocityGain: voice.velocityGain,
    phase: phaseForSynthVoice(voice, atTimeSeconds),
    attackTimeSeconds: voice.attackTimeSeconds,
    naturalReleaseTimeSeconds: voice.naturalReleaseTimeSeconds,
    effectiveReleaseTimeSeconds: voice.effectiveReleaseTimeSeconds,
    releaseDurationSeconds: voice.releaseDurationSeconds,
    cleanupDeadlineSeconds: voice.cleanupDeadlineSeconds,
    scheduledSourceCount: voice.sources.length,
  });
}
