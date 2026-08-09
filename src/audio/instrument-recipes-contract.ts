import type { InstrumentId } from "../domain";

export const AUDIO_RECIPE_SET_ID = "changes.audio.instrument-recipes";
export const AUDIO_RECIPE_SET_VERSION = 1;
export const AUDIO_IMPULSE_ALGORITHM_ID =
  "changes.audio.impulse.hall-quartic-q15.v2";

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
  durationSeconds: 4,
  /* predelayFrames = floor(sampleRate / predelayDivisor): 20 ms of silence. */
  predelayDivisor: 50,
  /* Two cascaded integer one-pole lowpasses with alpha 6000/32768. */
  lowpassAlphaQ15: 6_000,
  lowpassStages: 2,
  minimumSampleRate: 8_000,
  maximumSampleRate: 192_000,
  referenceSampleRate: 48_000,
  referenceFrames: 192_000,
  q15Divisor: 32_768,
  envelopeQ15Maximum: 32_767,
  convolverNormalize: true,
  referenceInterleavedInt16LeSha256:
    "ee0449f080bc31f1a9710ec7a316e8e34fb7979421f1a56c6ffd55b667df2017",
  referenceChannelInt16LeSha256: Object.freeze([
    "f97dee335bf4a7308a2dff2c6b9a609cac4f345edc90aa3b1058f45c1d415394",
    "7ff4c5a34a8848bc08148c821aac3d23940a3a94bba9c041615ce6e093795416",
  ] as const),
  referencePeakQ15: 13_352,
  referenceFinalStateUint32: 0xd2e26364,
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

/**
 * A rendered recipe plays deterministic PCM produced by the embedded DSP
 * module instead of scheduling oscillators. The buffer's own decay is the
 * musical envelope; the recipe amplitude keeps only a click-guard attack and
 * the damper release, and the flat filter preserves the uniform per-voice
 * topology (source → filter → gain → bus).
 */
export type AudioRenderedInstrumentRecipe = AudioInstrumentRecipeBase &
  Readonly<{
    synthesis: "rendered";
    renderer: Readonly<{
      algorithmId: string;
      channels: 2;
      maximumRenderSeconds: number;
      bufferCacheLimit: number;
    }>;
  }>;

export type AudioInstrumentRecipe =
  | AudioAdditiveInstrumentRecipe
  | AudioFmInstrumentRecipe
  | AudioRenderedInstrumentRecipe;

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
  Object.freeze({
    id: "concert-grand",
    label: "Concert Grand",
    designClaim:
      "deterministic rendered piano: inharmonic partials, unison detuning, dual-rate decay, hammer noise",
    synthesis: "rendered",
    /*
     * jcpe-6veb: at 0.85 a four-voice chord hit the soft clipper at ~5% THD.
     * 0.40 keeps chord peaks below 0.3 into the curve (~0.5% THD); loudness
     * lives after the clipper in the master stage and the listener's volume.
     */
    outputLevel: 0.3,
    polyphonyLimit: 64,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.concert-grand@1",
      channels: 2,
      maximumRenderSeconds: 8,
      bufferCacheLimit: 96,
    }),
    /* Click guard and damper only: the rendered PCM carries the real envelope. */
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.2 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "flute",
    label: "Flute",
    designClaim:
      "physically modeled flute: jet-drive waveguide with breath turbulence and delayed vibrato",
    synthesis: "rendered",
    outputLevel: 2.8,
    polyphonyLimit: 32,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.waveguide-flute@2",
      channels: 2,
      maximumRenderSeconds: 5,
      bufferCacheLimit: 64,
    }),
    /* Click guard and breath release: the model breathes its own envelope. */
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.3 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "organ",
    label: "Organ",
    designClaim: "additive drawbar sine partials with a shallow sustained vibrato",
    synthesis: "additive",
    outputLevel: 0.44,
    polyphonyLimit: 48,
    oscillators: Object.freeze([
      Object.freeze({ id: "fundamental", waveform: "sine", frequencyRatio: 1, detuneCents: 0, level: 0.36 }),
      Object.freeze({ id: "second", waveform: "sine", frequencyRatio: 2, detuneCents: 0, level: 0.24 }),
      Object.freeze({ id: "third", waveform: "sine", frequencyRatio: 3, detuneCents: 0, level: 0.18 }),
      Object.freeze({ id: "fourth", waveform: "sine", frequencyRatio: 4, detuneCents: 0, level: 0.13 }),
      Object.freeze({ id: "sixth", waveform: "sine", frequencyRatio: 6, detuneCents: 0, level: 0.09 }),
    ]),
    transient: null,
    tremolo: Object.freeze({ waveform: "sine", rateHz: 6, depth: 0.07, delaySeconds: 0.08 }),
    amplitude: Object.freeze({ attackSeconds: 0.012, decaySeconds: 0.08, sustainLevel: 0.92, releaseSeconds: 0.14 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 7_500, peakHz: 9_500, sustainHz: 7_500, q: 0.4, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "guitar",
    label: "Guitar",
    designClaim:
      "physically modeled archtop: dual-polarization plucked waveguide, body modes, clean amp",
    synthesis: "rendered",
    outputLevel: 0.5,
    polyphonyLimit: 48,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.plucked-archtop@2",
      channels: 2,
      maximumRenderSeconds: 6,
      bufferCacheLimit: 64,
    }),
    /* Click guard and string damp: the waveguide's decay is the envelope. */
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.35 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "upright-bass",
    label: "Upright Bass",
    designClaim:
      "recorded solo contrabass pizzicato, nearest recorded key transposed onto pitch",
    synthesis: "rendered",
    /*
     * Owner mandate 2026-08-09 (bead jcpe-3q4c): the sampled recipe returns
     * until changes.dsp.plucked-upright-bass@1 closes the heard quality gap
     * (thump-then-bloom temporal character). The physical model stays dark.
     */
    outputLevel: 0.17,
    polyphonyLimit: 32,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.sampled-upright-bass@1",
      channels: 2,
      maximumRenderSeconds: 4,
      bufferCacheLimit: 64,
    }),
    /* Click guard and pizzicato damp: the recorded PCM is the envelope. */
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.25 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "concert-vibes",
    label: "Concert Vibes",
    designClaim:
      "recorded vibraphone, soft mallets, nearest recorded key transposed onto pitch",
    synthesis: "rendered",
    /*
     * Owner mandate 2026-08-09 (bead jcpe-3q4c): the sampled recipe returns
     * until changes.dsp.vibes@2 closes the heard quality gap (multi-second
     * shimmer, bar-resonator beating). The physical model stays dark.
     */
    outputLevel: 0.1,
    polyphonyLimit: 48,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.sampled-vibraphone@1",
      channels: 2,
      maximumRenderSeconds: 4,
      bufferCacheLimit: 64,
    }),
    /* Click guard and a ringing damp: the recorded PCM is the envelope. */
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 1.1 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "blues-guitar",
    label: "Blues Guitar",
    designClaim:
      "physically modeled electric: the same plucked waveguide through a driven amp with cab voicing",
    synthesis: "rendered",
    outputLevel: 0.46,
    polyphonyLimit: 48,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.plucked-electric@2",
      channels: 2,
      maximumRenderSeconds: 6,
      bufferCacheLimit: 64,
    }),
    /* Click guard and string damp: the waveguide's decay is the envelope. */
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.35 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "clarinet",
    label: "Clarinet",
    designClaim:
      "physically modeled clarinet: reed-driven closed-open waveguide with breath dynamics",
    synthesis: "rendered",
    outputLevel: 1.1,
    polyphonyLimit: 32,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.waveguide-clarinet@1",
      channels: 2,
      maximumRenderSeconds: 5,
      /* One retained entry per event in the reviewed 128-event phrase bound. */
      bufferCacheLimit: 128,
    }),
    /* Click guard and breath release: the model breathes its own envelope. */
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.3 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "dreadnought-guitar",
    label: "Steel Dreadnought",
    designClaim:
      "physically modeled Martin-style steel-string dreadnought: stiff strings, finite pick contact, braced spruce plate, and Helmholtz body radiation",
    synthesis: "rendered",
    outputLevel: 0.5,
    polyphonyLimit: 48,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.plucked-dreadnought@1",
      channels: 2,
      maximumRenderSeconds: 5,
      bufferCacheLimit: 64,
    }),
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.35 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
  }),
  Object.freeze({
    id: "ukulele",
    label: "Re-entrant Ukulele",
    designClaim:
      "physically modeled re-entrant nylon ukulele: g4-c4-e4-a4 courses, finite finger contact, compact braced plate, and geometry-derived air resonance",
    synthesis: "rendered",
    outputLevel: 0.65,
    polyphonyLimit: 32,
    renderer: Object.freeze({
      algorithmId: "changes.dsp.plucked-ukulele@1",
      channels: 2,
      maximumRenderSeconds: 3,
      bufferCacheLimit: 64,
    }),
    amplitude: Object.freeze({ attackSeconds: 0.002, decaySeconds: 0, sustainLevel: 1, releaseSeconds: 0.24 }),
    filter: Object.freeze({ type: "lowpass", attackHz: 16_000, peakHz: 16_000, sustainHz: 16_000, q: 0.5, decaySeconds: 0.1 }),
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

/**
 * Playable MIDI window per recipe id and the octave-fold realization policy
 * (bead jcpe-instrument-range-fold-policy-s1uz, RC1+RC3 remediation).
 *
 * Charts are instrument-agnostic: the shared immutable playback plan may hand
 * any instrument any pitch. Each instrument declares the window it can render
 * faithfully — real-instrument range intersected with the model's measured
 * domain — and the engine folds out-of-window pitches by the MINIMAL number
 * of whole octaves into the window at voice intake (attack and prepare), so
 * cache keys, renders, gestures, and collision checks all see one pitch.
 *
 * This is a documented realization policy, not a document repair: stored
 * document pitches and MIDI export never consume it. Every window spans at
 * least MINIMUM_FOLD_WINDOW_SEMITONES so the minimal-octave fold target is
 * unique and total (statically tested).
 *
 * Window rationale: acoustic models use the measured/real ranges named in
 * their design claims (flute C4-C7 covers RC3 — charts reaching MIDI 45-53
 * fold up to the register the reference gate actually measured; clarinet is
 * its measured fit domain; guitars E2-E6; physical bass E1-G4; physical vibes
 * F3-F6).
 * Synth recipes accept the full keyboard: their oscillators are range-safe.
 * When physical plucked models re-land with Rust-side windows, those windows
 * must assert-equal these rows (one source of truth; see the re-land bead).
 */
export const MINIMUM_FOLD_WINDOW_SEMITONES = 12;

export const AUDIO_PLAYABLE_MIDI_WINDOWS = Object.freeze({
  "mellow-keys": Object.freeze({ low: 21, high: 108 }),
  "fm-electric-piano": Object.freeze({ low: 21, high: 108 }),
  vibraphone: Object.freeze({ low: 53, high: 89 }),
  "warm-pad": Object.freeze({ low: 21, high: 108 }),
  "analog-poly": Object.freeze({ low: 21, high: 108 }),
  "concert-grand": Object.freeze({ low: 21, high: 108 }),
  /*
   * Narrowed 2026-08-08 to the measured all-dynamics-clean register of the
   * shipping flute@2 phrase renderer. The second register is octave-unstable
   * outside the UIowa-certified pp/mf islands (m73/74@40, m77-79,
   * m83 -1902c, m84, m86-88 -- full sweep on the fix bead); folding charts
   * into the working octave beats folding them onto broken cells. Widen only
   * when the register-2 work certifies the full window at all dynamics.
   */
  flute: Object.freeze({ low: 60, high: 72 }),
  organ: Object.freeze({ low: 21, high: 108 }),
  guitar: Object.freeze({ low: 40, high: 88 }),
  "upright-bass": Object.freeze({ low: 28, high: 67 }),
  "concert-vibes": Object.freeze({ low: 53, high: 89 }),
  "blues-guitar": Object.freeze({ low: 40, high: 88 }),
  /*
   * Top narrowed 2026-08-08: the altissimo cells octave-drop through the
   * shipping clarinet@2 path (m83@120, m86-89 broadly, measured sweep on
   * the fix bead). 50-82 is clean at all dynamics; charts fold onto it.
   */
  clarinet: Object.freeze({ low: 50, high: 82 }),
  "dreadnought-guitar": Object.freeze({ low: 40, high: 88 }),
  ukulele: Object.freeze({ low: 60, high: 93 }),
} as const satisfies Readonly<Record<string, Readonly<{ low: number; high: number }>>>);

export type PlayableMidiWindow = Readonly<{ low: number; high: number }>;

export function playableMidiWindowForRecipeId(
  recipeId: string,
): PlayableMidiWindow | null {
  const window = (AUDIO_PLAYABLE_MIDI_WINDOWS as Readonly<Record<string, PlayableMidiWindow>>)[recipeId];
  return window ?? null;
}

/**
 * Minimal whole-octave transposition of `midiPitch` into `window`.
 *
 * In-window pitches return unchanged. A pitch below the window rises, and a
 * pitch above falls, by the fewest octaves that land inside; the result is
 * unique because every registered window spans >= 12 semitones. Returns the
 * input unchanged (never throws) for degenerate windows narrower than an
 * octave — the static registry test forbids registering one.
 */
export function foldMidiPitchIntoWindow(
  midiPitch: number,
  window: PlayableMidiWindow,
): number {
  if (window.high - window.low < MINIMUM_FOLD_WINDOW_SEMITONES) return midiPitch;
  if (midiPitch >= window.low && midiPitch <= window.high) return midiPitch;
  if (midiPitch < window.low) {
    const octaves = Math.ceil((window.low - midiPitch) / 12);
    return midiPitch + 12 * octaves;
  }
  const octaves = Math.ceil((midiPitch - window.high) / 12);
  return midiPitch - 12 * octaves;
}
