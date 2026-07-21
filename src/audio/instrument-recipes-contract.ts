import type { InstrumentId } from "../domain";

export const AUDIO_RECIPE_SET_ID = "changes.audio.instrument-recipes";
export const AUDIO_RECIPE_SET_VERSION = 1;
export const AUDIO_IMPULSE_ALGORITHM_ID =
  "changes.audio.impulse.xorshift32-q15.v1";

export const AUDIO_GRAPH_NODE_IDS = Object.freeze([
  "instrument-bus",
  "dc-block",
  "low-shelf",
  "high-shelf",
  "dry-gain",
  "reverb-send",
  "convolver",
  "reverb-return",
  "dynamics",
  "soft-clip",
  "safety-gain",
  "master-gain",
  "destination",
] as const);

export type AudioGraphNodeId = (typeof AUDIO_GRAPH_NODE_IDS)[number];

export const AUDIO_GRAPH_EDGE_ENTRIES = Object.freeze([
  Object.freeze({ from: "instrument-bus", to: "dc-block" }),
  Object.freeze({ from: "dc-block", to: "low-shelf" }),
  Object.freeze({ from: "low-shelf", to: "high-shelf" }),
  Object.freeze({ from: "high-shelf", to: "dry-gain" }),
  Object.freeze({ from: "dry-gain", to: "dynamics" }),
  Object.freeze({ from: "high-shelf", to: "reverb-send" }),
  Object.freeze({ from: "reverb-send", to: "convolver" }),
  Object.freeze({ from: "convolver", to: "reverb-return" }),
  Object.freeze({ from: "reverb-return", to: "dynamics" }),
  Object.freeze({ from: "dynamics", to: "soft-clip" }),
  Object.freeze({ from: "soft-clip", to: "safety-gain" }),
  Object.freeze({ from: "safety-gain", to: "master-gain" }),
  Object.freeze({ from: "master-gain", to: "destination" }),
] as const);

export type AudioGraphEdge = (typeof AUDIO_GRAPH_EDGE_ENTRIES)[number];

export const AUDIO_PERSISTENT_GRAPH_SETTINGS = Object.freeze({
  createdNodeCount: 12,
  persistentEdgeCount: 13,
  dcBlock: Object.freeze({ type: "highpass", frequencyHz: 24, q: 0.707 }),
  lowShelf: Object.freeze({ type: "lowshelf", frequencyHz: 180, gainDb: 1.5 }),
  highShelf: Object.freeze({ type: "highshelf", frequencyHz: 6_000, gainDb: -1 }),
  dryGain: 1,
  maximumReverbSendGain: 0.28,
  reverbReturnGain: 1,
  dynamics: Object.freeze({
    thresholdDb: -18,
    kneeDb: 18,
    ratio: 4,
    attackSeconds: 0.006,
    releaseSeconds: 0.18,
  }),
  softClip: Object.freeze({
    curveLength: 4_097,
    drive: 1.5,
    formula: "tanh(drive*x)/tanh(drive)",
    oversample: "2x",
  }),
  safetyGain: 0.9,
  mixRampSeconds: 0.015,
} as const);

export const AUDIO_IMPULSE_POLICY = Object.freeze({
  algorithmId: AUDIO_IMPULSE_ALGORITHM_ID,
  seedUint32: 0x58403031,
  channels: 2,
  durationSeconds: 2,
  minimumSampleRate: 8_000,
  maximumSampleRate: 192_000,
  referenceSampleRate: 48_000,
  referenceFrames: 96_000,
  q15Divisor: 32_768,
  envelopeQ15Maximum: 32_767,
  convolverNormalize: true,
  referenceInterleavedInt16LeSha256:
    "8329fc9abc8b16eeac673bd4a1e0f1e8c9a4900939e6fc00191b429066867f89",
  referenceChannelInt16LeSha256: Object.freeze([
    "fca2e65890c77fdb0ad08d6cada5b0ed398ce9f97c46e279b306a5c8a870fe53",
    "060054f6c4797b6ba6a11798e261455596a7ab4f17042aa7d2882b7569fd5bec",
  ] as const),
  referencePeakQ15: 32_595,
  referenceFinalStateUint32: 0xa07e6c9f,
} as const);

export type AudioOscillatorWaveform =
  | "sine"
  | "triangle"
  | "sawtooth"
  | "periodic-pulse-25";

export type AudioOscillatorComponent = Readonly<{
  id: string;
  waveform: AudioOscillatorWaveform;
  frequencyRatio: number;
  detuneCents: number;
  level: number;
}>;

export type AudioAmplitudeEnvelope = Readonly<{
  attackSeconds: number;
  decaySeconds: number;
  sustainLevel: number;
  releaseSeconds: number;
}>;

export type AudioFilterEnvelope = Readonly<{
  type: "lowpass";
  attackHz: number;
  peakHz: number;
  sustainHz: number;
  q: number;
  decaySeconds: number;
}>;

export type AudioTransientRecipe = Readonly<{
  waveform: "sine";
  frequencyRatio: number;
  level: number;
  decaySeconds: number;
}>;

export type AudioTremoloRecipe = Readonly<{
  waveform: "sine";
  rateHz: number;
  depth: number;
  delaySeconds: number;
}>;

type AudioInstrumentRecipeBase = Readonly<{
  id: InstrumentId;
  label: string;
  designClaim: string;
  outputLevel: number;
  polyphonyLimit: number;
  amplitude: AudioAmplitudeEnvelope;
  filter: AudioFilterEnvelope;
}>;

export type AudioAdditiveInstrumentRecipe = AudioInstrumentRecipeBase &
  Readonly<{
    synthesis: "additive";
    oscillators: readonly AudioOscillatorComponent[];
    transient: AudioTransientRecipe | null;
    tremolo: AudioTremoloRecipe | null;
  }>;

export type AudioFmInstrumentRecipe = AudioInstrumentRecipeBase &
  Readonly<{
    synthesis: "fm-pair";
    carrier: AudioOscillatorComponent;
    modulator: Readonly<{
      waveform: "sine";
      frequencyRatio: number;
      detuneCents: number;
      peakIndex: number;
      sustainIndex: number;
      decaySeconds: number;
      velocityIndexScaleMinimum: number;
      velocityIndexScaleMaximum: number;
    }>;
  }>;

export type AudioInstrumentRecipe =
  | AudioAdditiveInstrumentRecipe
  | AudioFmInstrumentRecipe;

export const AUDIO_INSTRUMENT_RECIPES = Object.freeze([
  Object.freeze({
    id: "mellow-keys",
    label: "Mellow Keys",
    designClaim: "triangle and sine partials with a short filtered body",
    synthesis: "additive",
    outputLevel: 0.62,
    polyphonyLimit: 64,
    oscillators: Object.freeze([
      Object.freeze({ id: "fundamental", waveform: "triangle", frequencyRatio: 1, detuneCents: 0, level: 0.78 }),
      Object.freeze({ id: "second", waveform: "sine", frequencyRatio: 2, detuneCents: 0, level: 0.16 }),
      Object.freeze({ id: "third", waveform: "sine", frequencyRatio: 3, detuneCents: 0, level: 0.06 }),
    ]),
    transient: null,
    tremolo: null,
    amplitude: Object.freeze({ attackSeconds: 0.008, decaySeconds: 0.42, sustainLevel: 0.22, releaseSeconds: 0.55 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 2_100, peakHz: 5_200, sustainHz: 2_100, q: 0.7, decaySeconds: 0.45 }),
  }),
  Object.freeze({
    id: "fm-electric-piano",
    label: "FM Electric Piano",
    designClaim: "one sine carrier with a decaying two-to-one sine modulator",
    synthesis: "fm-pair",
    outputLevel: 0.48,
    polyphonyLimit: 48,
    carrier: Object.freeze({ id: "carrier", waveform: "sine", frequencyRatio: 1, detuneCents: 0, level: 1 }),
    modulator: Object.freeze({
      waveform: "sine",
      frequencyRatio: 2,
      detuneCents: 3,
      peakIndex: 3.2,
      sustainIndex: 0.55,
      decaySeconds: 0.65,
      velocityIndexScaleMinimum: 0.55,
      velocityIndexScaleMaximum: 1,
    }),
    amplitude: Object.freeze({ attackSeconds: 0.003, decaySeconds: 0.85, sustainLevel: 0.14, releaseSeconds: 0.9 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 4_200, peakHz: 9_000, sustainHz: 4_200, q: 0.5, decaySeconds: 0.6 }),
  }),
  Object.freeze({
    id: "vibraphone",
    label: "Vibraphone",
    designClaim: "sine partials, a short mallet partial, and slow amplitude tremolo",
    synthesis: "additive",
    outputLevel: 0.5,
    polyphonyLimit: 48,
    oscillators: Object.freeze([
      Object.freeze({ id: "fundamental", waveform: "sine", frequencyRatio: 1, detuneCents: 0, level: 0.88 }),
      Object.freeze({ id: "fourth-partial", waveform: "sine", frequencyRatio: 4, detuneCents: 0, level: 0.12 }),
    ]),
    transient: Object.freeze({ waveform: "sine", frequencyRatio: 7, level: 0.1, decaySeconds: 0.018 }),
    tremolo: Object.freeze({ waveform: "sine", rateHz: 5.8, depth: 0.16, delaySeconds: 0.12 }),
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 1.4, sustainLevel: 0.45, releaseSeconds: 1.1 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 7_000, peakHz: 12_000, sustainHz: 7_000, q: 0.3, decaySeconds: 0.25 }),
  }),
  Object.freeze({
    id: "warm-pad",
    label: "Warm Pad",
    designClaim: "two gently detuned saws blended with a centered triangle",
    synthesis: "additive",
    outputLevel: 0.3,
    polyphonyLimit: 32,
    oscillators: Object.freeze([
      Object.freeze({ id: "saw-left", waveform: "sawtooth", frequencyRatio: 1, detuneCents: -7, level: 0.34 }),
      Object.freeze({ id: "saw-right", waveform: "sawtooth", frequencyRatio: 1, detuneCents: 7, level: 0.34 }),
      Object.freeze({ id: "triangle-center", waveform: "triangle", frequencyRatio: 1, detuneCents: 0, level: 0.32 }),
    ]),
    transient: null,
    tremolo: null,
    amplitude: Object.freeze({ attackSeconds: 0.32, decaySeconds: 1.2, sustainLevel: 0.72, releaseSeconds: 1.8 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 900, peakHz: 2_800, sustainHz: 1_600, q: 0.8, decaySeconds: 1.4 }),
  }),
  Object.freeze({
    id: "analog-poly",
    label: "Analog Poly",
    designClaim: "detuned saw and 25-percent pulse with a quiet sine sub-oscillator",
    synthesis: "additive",
    outputLevel: 0.34,
    polyphonyLimit: 48,
    oscillators: Object.freeze([
      Object.freeze({ id: "saw", waveform: "sawtooth", frequencyRatio: 1, detuneCents: -4, level: 0.48 }),
      Object.freeze({ id: "pulse", waveform: "periodic-pulse-25", frequencyRatio: 1, detuneCents: 4, level: 0.36 }),
      Object.freeze({ id: "sub", waveform: "sine", frequencyRatio: 0.5, detuneCents: 0, level: 0.16 }),
    ]),
    transient: null,
    tremolo: null,
    amplitude: Object.freeze({ attackSeconds: 0.012, decaySeconds: 0.3, sustainLevel: 0.52, releaseSeconds: 0.65 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 700, peakHz: 4_800, sustainHz: 1_300, q: 4.2, decaySeconds: 0.32 }),
  }),
] as const satisfies readonly AudioInstrumentRecipe[]);

export const AUDIO_PULSE_WAVE_POLICY = Object.freeze({
  id: "periodic-pulse-25",
  dutyCycle: 0.25,
  harmonicCount: 32,
  disableNormalization: false,
  dcCoefficient: 0,
  cosineCoefficient: "sin(2*pi*n*dutyCycle)/(pi*n)",
  sineCoefficient: "(1-cos(2*pi*n*dutyCycle))/(pi*n)",
} as const);

export const AUDIO_NORMALIZATION_POLICY = Object.freeze({
  id: "changes.audio.voice-normalization.v1",
  formula: "recipe.outputLevel/sqrt(totalGeneratedVoiceCount)",
  velocityFormula: "pow(velocity/127,1.5)",
  minimumVoiceCount: 1,
  maximumVoiceCount: 16,
  minimumVelocity: 1,
  maximumVelocity: 127,
} as const);
