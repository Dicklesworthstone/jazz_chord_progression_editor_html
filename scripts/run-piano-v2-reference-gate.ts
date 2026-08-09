/**
 * Exact-WASM reference gate for the dark physical piano attack.
 *
 * The checked-in Salamander attack slices are used only as a comparator. The
 * candidate is rendered through the bounded cooperative pno2 chord ABI with a
 * one-key stem, never through the hybrid production renderer. A candidate may
 * be acoustically healthy while still being unshippable: `shippingPayloadMatch`
 * stays false until these exact WASM bytes are the checked-in embedded payload.
 *
 * Run:
 *   bun scripts/run-piano-v2-reference-gate.ts --wasm candidate.wasm --output evidence.json
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CONCERT_GRAND_WASM_BASE64,
  CONCERT_GRAND_WASM_SHA256,
} from "../src/audio/wasm/concert-grand-wasm";
import {
  PIANO_ATTACK_SAMPLES_BASE64,
  PIANO_ATTACK_SAMPLES_SHA256,
  PIANO_ATTACK_SAMPLE_RATE_HZ,
  PIANO_ATTACK_SLICE_INDEX,
  type PianoAttackSlice,
} from "../src/audio/wasm/piano-attack-samples";

export const PIANO_V2_REFERENCE_EVIDENCE_SCHEMA =
  "changes.evidence.piano-v2-reference.v2" as const;

export const PIANO_V2_REFERENCE_POLICY = Object.freeze({
  schema: "changes.policy.piano-v2-reference.v2" as const,
  algorithmId: "changes.dsp.concert-grand@2" as const,
  sampleRateHz: PIANO_ATTACK_SAMPLE_RATE_HZ,
  renderSeconds: 0.32,
  midi: Object.freeze([36, 48, 60, 72, 84, 96]),
  velocities: Object.freeze([40, 72, 110]),
  /*
   * This is the shared pitch shift after the analyzer has already placed each
   * partial at its reviewed stiff-string frequency. It is not a sinusoidal f0
   * estimate (the independent Rust geometry gate pins f1 much tighter); half a
   * semitone still rejects a wrong-key attack without rewarding an integer-
   * harmonic model for ignoring piano-string inharmonicity.
   */
  maximumHarmonicCombOffsetCents: 50,
  harmonicCombSearchCents: 200,
  harmonicCombSearchStepCents: 2,
  minimumEarlyRms: 1.0e-5,
  maximumPeak: 0.98,
  harmonicWindowSeconds: Object.freeze([0.025, 0.18] as const),
  harmonicSearchCents: 60,
  harmonicSearchStepCents: 6,
  maximumHarmonics: 12,
  envelopeWindowsSeconds: Object.freeze([
    /* The embedded corpus generator deliberately applies a 5 ms fade-in.
     * It is not a piano law, so comparator distance starts after that edit. */
    Object.freeze([0.005, 0.02] as const),
    Object.freeze([0.02, 0.06] as const),
    Object.freeze([0.06, 0.15] as const),
    Object.freeze([0.15, 0.3] as const),
  ]),
  /*
   * Same-key Salamander velocity-layer variation is the independent scale.
   * The candidate gets a small absolute floor for unusually similar layers,
   * but may not exceed 1.25x the largest within-corpus distance for that key.
   */
  withinCorpusDistanceMultiplier: 1.25,
  minimumAllowedHarmonicDistanceDb: 6,
  minimumAllowedEnvelopeDistanceDb: 4,
  /*
   * INRIA RT-0425 appendix A, Steinway-D string rows. These six independently
   * reviewed cells cover the release matrix and bind the analyzer to the
   * physical stiffness that moves upper piano partials away from integer n*f1.
   */
  stringAuthority: Object.freeze({
    id: "INRIA-RT-0425-v2" as const,
    pdfSha256: "d7c06e51bebfa46d3f29190dc3c1a6b4c8b3212008778dddfa9bb02271ed66d1" as const,
    youngModulusPa: 2.02e11,
    strings: Object.freeze([
      Object.freeze({ midi: 36, lengthM: 1.602, diameterM: 0.001051, tensionN: 915 }),
      Object.freeze({ midi: 48, lengthM: 1.259, diameterM: 0.001063, tensionN: 759 }),
      Object.freeze({ midi: 60, lengthM: 0.657, diameterM: 0.001006, tensionN: 741 }),
      Object.freeze({ midi: 72, lengthM: 0.344, diameterM: 0.000932, tensionN: 696 }),
      Object.freeze({ midi: 84, lengthM: 0.180, diameterM: 0.000891, tensionN: 697 }),
      Object.freeze({ midi: 96, lengthM: 0.095, diameterM: 0.000831, tensionN: 670 }),
    ]),
  }),
});

type PianoPolicy = typeof PIANO_V2_REFERENCE_POLICY;
type SourceBinding = Readonly<{ path: string; sha256: string }>;
type Finding = Readonly<{ code: string; message: string }>;

export type PianoReferenceFeatures = Readonly<{
  harmonicCombOffsetCents: number;
  earlyRms: number;
  peak: number;
  harmonicProfileDb: readonly number[];
  envelopeProfileDb: readonly number[];
}>;

export type PianoReferenceCell = Readonly<{
  id: string;
  midi: number;
  velocity: number;
  requestSha256: string;
  pcmSha256: string;
  referenceSlice: Readonly<{
    byteOffset: number;
    frameCount: number;
    sourceLayer: number;
    sourceChannel: number;
    tuningCents: number;
  }>;
  referencePcmSha256: string;
  features: PianoReferenceFeatures;
  harmonicDistanceDb: number;
  envelopeDistanceDb: number;
  referenceHarmonicSpreadDb: number;
  referenceEnvelopeSpreadDb: number;
  allowedHarmonicDistanceDb: number;
  allowedEnvelopeDistanceDb: number;
  outcome: "pass" | "fail";
  findings: readonly Finding[];
}>;

export type PianoDynamicsCell = Readonly<{
  id: string;
  midi: number;
  earlyRms: readonly [number, number, number];
  outcome: "pass" | "fail";
}>;

export type PianoV2ReferenceEvidence = Readonly<{
  schema: typeof PIANO_V2_REFERENCE_EVIDENCE_SCHEMA;
  policy: PianoPolicy;
  wasmSha256: string;
  embeddedWasmSha256: string;
  shippingPayloadMatch: boolean;
  corpusSha256: string;
  sourceBindings: readonly SourceBinding[];
  sourceClosureSha256: string;
  cells: readonly PianoReferenceCell[];
  dynamicsCells: readonly PianoDynamicsCell[];
  controls: Readonly<{
    referenceSelfPasses: boolean;
    wrongPitchRejected: boolean;
    silentRejected: boolean;
    clippingRejected: boolean;
    pureSineRejected: boolean;
    integerHarmonicBankRejected: boolean;
    flatEnvelopeRejected: boolean;
    flatDynamicsRejected: boolean;
  }>;
  summary: Readonly<{
    acousticOutcome: "pass" | "fail";
    shippingOutcome: "pass" | "fail";
    passedCellCount: number;
    passedDynamicsCellCount: number;
  }>;
  evidenceSha256: string;
}>;

type PianoWasm = Readonly<{
  memory: WebAssembly.Memory;
  heapBase: number;
  runtimeInit: (
    midiPointer: number,
    velocityPointer: number,
    noteCount: number,
    sampleRate: number,
    outputCapacity: number,
  ) => number;
  runtimeMaxSteps: (outputCapacity: number) => number;
  runtimeStep: (
    handle: number,
    leftPointer: number,
    rightPointer: number,
    outputCapacity: number,
  ) => number;
  runtimeReset: (handle: number) => number;
}>;

type PianoWasmRawExports = Readonly<Record<string, unknown>>;
type PianoReferenceEntry = Readonly<{
  slice: PianoAttackSlice;
  pcm: Float32Array;
  features: PianoReferenceFeatures;
  pcmSha256: string;
}>;

let pianoReferenceEntriesCache: ReadonlyMap<string, PianoReferenceEntry> | undefined;
let pianoReferenceControlsCache: PianoV2ReferenceEvidence["controls"] | undefined;

export const PIANO_V2_REFERENCE_SOURCE_PATHS = Object.freeze([
  "dsp/concert-grand/Cargo.toml",
  "dsp/concert-grand/Cargo.lock",
  "dsp/concert-grand/src/lib.rs",
  "dsp/concert-grand/src/piano_v2.rs",
  "scripts/build-dsp.ts",
  "scripts/run-piano-v2-reference-gate.ts",
  "src/audio/wasm/concert-grand-wasm.ts",
  "src/audio/wasm/piano-attack-samples.ts",
] as const);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Public only so independent verifier tests can sign hand-authored fixtures. */
export function pianoV2CanonicalSha256(value: unknown): string {
  return sha256(canonicalJson(value));
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function rms(samples: Float32Array, start: number, end: number): number {
  const from = Math.max(0, Math.min(start, samples.length));
  const to = Math.max(from, Math.min(end, samples.length));
  if (to === from) return 0;
  let sum = 0;
  for (let index = from; index < to; index += 1) {
    const value = samples[index] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum / (to - from));
}

function goertzelPower(
  samples: Float32Array,
  sampleRateHz: number,
  start: number,
  end: number,
  frequencyHz: number,
): number {
  const count = Math.max(1, end - start);
  const coefficient = 2 * Math.cos((2 * Math.PI * frequencyHz) / sampleRateHz);
  let previous = 0;
  let beforePrevious = 0;
  for (let index = start; index < end; index += 1) {
    const windowIndex = index - start;
    const taper = count > 1
      ? 0.5 - 0.5 * Math.cos((2 * Math.PI * windowIndex) / (count - 1))
      : 1;
    const current = (samples[index] ?? 0) * taper +
      coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return Math.max(
    previous * previous + beforePrevious * beforePrevious -
      coefficient * previous * beforePrevious,
    1.0e-30,
  );
}

function localPeakPower(
  samples: Float32Array,
  sampleRateHz: number,
  start: number,
  end: number,
  centerHz: number,
): Readonly<{ power: number; frequencyHz: number }> {
  let bestPower = 0;
  let bestFrequency = centerHz;
  for (
    let cents = -PIANO_V2_REFERENCE_POLICY.harmonicSearchCents;
    cents <= PIANO_V2_REFERENCE_POLICY.harmonicSearchCents;
    cents += PIANO_V2_REFERENCE_POLICY.harmonicSearchStepCents
  ) {
    const frequency = centerHz * 2 ** (cents / 1200);
    const power = goertzelPower(samples, sampleRateHz, start, end, frequency);
    if (power > bestPower) {
      bestPower = power;
      bestFrequency = frequency;
    }
  }
  return Object.freeze({ power: bestPower, frequencyHz: bestFrequency });
}

export function reviewedPianoInharmonicityCoefficient(midi: number): number {
  const string = PIANO_V2_REFERENCE_POLICY.stringAuthority.strings.find((entry) =>
    entry.midi === midi);
  if (string === undefined) {
    throw new Error(`PIANO_REFERENCE_STRING_AUTHORITY_MISSING:m${String(midi)}`);
  }
  const areaMomentM4 = Math.PI * string.diameterM ** 4 / 64;
  const coefficient = Math.PI ** 2 *
    PIANO_V2_REFERENCE_POLICY.stringAuthority.youngModulusPa * areaMomentM4 /
    (string.tensionN * string.lengthM ** 2);
  if (!finite(coefficient) || coefficient <= 0) {
    throw new Error(`PIANO_REFERENCE_INHARMONICITY_INVALID:m${String(midi)}`);
  }
  return coefficient;
}

export function stiffPianoPartialHz(
  fundamentalHz: number,
  inharmonicityCoefficient: number,
  partial: number,
): number {
  if (!finite(fundamentalHz) || fundamentalHz <= 0 ||
    !finite(inharmonicityCoefficient) || inharmonicityCoefficient < 0 ||
    !Number.isSafeInteger(partial) || partial < 1) {
    throw new Error("PIANO_REFERENCE_STIFF_PARTIAL_INVALID");
  }
  return partial * fundamentalHz * Math.sqrt(
    (1 + inharmonicityCoefficient * partial * partial) /
      (1 + inharmonicityCoefficient),
  );
}

function harmonicCombPitchCents(
  samples: Float32Array,
  sampleRateHz: number,
  start: number,
  end: number,
  expectedFundamentalHz: number,
  inharmonicityCoefficient: number,
): number {
  let bestCents = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  /* A piano pitch is a harmonic comb, not necessarily its loudest spectral
   * peak. Scoring the first eight partial positions avoids mistaking a
   * soundboard resonance for f0 when the bass fundamental is weak. */
  for (
    let cents = -PIANO_V2_REFERENCE_POLICY.harmonicCombSearchCents;
    cents <= PIANO_V2_REFERENCE_POLICY.harmonicCombSearchCents;
    cents += PIANO_V2_REFERENCE_POLICY.harmonicCombSearchStepCents
  ) {
    const shiftedFundamental = expectedFundamentalHz * 2 ** (cents / 1200);
    let score = 0;
    let weight = 0;
    for (let harmonic = 1; harmonic <= 8; harmonic += 1) {
      const frequencyHz = stiffPianoPartialHz(
        shiftedFundamental,
        inharmonicityCoefficient,
        harmonic,
      );
      if (frequencyHz >= 0.48 * sampleRateHz) break;
      const harmonicWeight = 1 / harmonic;
      score += harmonicWeight * Math.log(
        goertzelPower(samples, sampleRateHz, start, end, frequencyHz),
      );
      weight += harmonicWeight;
    }
    score /= Math.max(weight, 1.0e-30);
    if (score > bestScore) {
      bestScore = score;
      bestCents = cents;
    }
  }
  return bestCents;
}

export function analyzePianoReferenceFeatures(
  samples: Float32Array,
  sampleRateHz: number,
  expectedFundamentalHz: number,
  inharmonicityCoefficient: number,
): PianoReferenceFeatures {
  const windowStart = Math.floor(
    PIANO_V2_REFERENCE_POLICY.harmonicWindowSeconds[0] * sampleRateHz,
  );
  const windowEnd = Math.min(
    samples.length,
    Math.floor(PIANO_V2_REFERENCE_POLICY.harmonicWindowSeconds[1] * sampleRateHz),
  );
  const harmonicCombOffsetCents = harmonicCombPitchCents(
    samples,
    sampleRateHz,
    windowStart,
    windowEnd,
    expectedFundamentalHz,
    inharmonicityCoefficient,
  );
  const harmonicLevels: number[] = [];
  for (
    let harmonic = 1;
    harmonic <= PIANO_V2_REFERENCE_POLICY.maximumHarmonics;
    harmonic += 1
  ) {
    const centerHz = stiffPianoPartialHz(
      expectedFundamentalHz,
      inharmonicityCoefficient,
      harmonic,
    );
    if (centerHz * 2 ** (PIANO_V2_REFERENCE_POLICY.harmonicSearchCents / 1200) >=
      0.48 * sampleRateHz) break;
    harmonicLevels.push(
      10 * Math.log10(
        localPeakPower(samples, sampleRateHz, windowStart, windowEnd, centerHz).power,
      ),
    );
  }
  const maximumHarmonic = Math.max(...harmonicLevels);
  const harmonicProfileDb = harmonicLevels.map((level) => level - maximumHarmonic);
  const envelopeLevels = PIANO_V2_REFERENCE_POLICY.envelopeWindowsSeconds.map(
    ([start, end]) => 20 * Math.log10(Math.max(rms(
      samples,
      Math.floor(start * sampleRateHz),
      Math.floor(end * sampleRateHz),
    ), 1.0e-12)),
  );
  const maximumEnvelope = Math.max(...envelopeLevels);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  return Object.freeze({
    harmonicCombOffsetCents,
    earlyRms: rms(samples, 0, Math.min(samples.length, Math.floor(0.18 * sampleRateHz))),
    peak,
    harmonicProfileDb: Object.freeze(
      harmonicProfileDb.map((value) => Number(value.toFixed(12))),
    ),
    envelopeProfileDb: Object.freeze(
      envelopeLevels.map((value) => Number((value - maximumEnvelope).toFixed(12))),
    ),
  });
}

export function profileDistanceDb(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length === 0 || left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }
  const count = left.length;
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum / count);
}

export function evaluatePianoReferenceCell(
  features: PianoReferenceFeatures,
  harmonicDistanceDb: number,
  envelopeDistanceDb: number,
  allowedHarmonicDistanceDb: number,
  allowedEnvelopeDistanceDb: number,
): readonly Finding[] {
  const findings: Finding[] = [];
  if (!finite(features.harmonicCombOffsetCents) ||
    Math.abs(features.harmonicCombOffsetCents) >
    PIANO_V2_REFERENCE_POLICY.maximumHarmonicCombOffsetCents) {
    findings.push(Object.freeze({
      code: "PIANO_REFERENCE_HARMONIC_COMB_OFFSET",
      message: "harmonic-comb offset refused",
    }));
  }
  if (!finite(features.earlyRms) ||
    features.earlyRms < PIANO_V2_REFERENCE_POLICY.minimumEarlyRms) {
    findings.push(Object.freeze({ code: "PIANO_REFERENCE_SILENT", message: "early RMS below floor" }));
  }
  if (!finite(features.peak) || features.peak > PIANO_V2_REFERENCE_POLICY.maximumPeak) {
    findings.push(Object.freeze({ code: "PIANO_REFERENCE_CLIPPING", message: "peak above bound" }));
  }
  if (!finite(harmonicDistanceDb) || harmonicDistanceDb > allowedHarmonicDistanceDb) {
    findings.push(Object.freeze({
      code: "PIANO_REFERENCE_HARMONIC_PROFILE",
      message: `harmonic distance ${harmonicDistanceDb.toFixed(3)} exceeds ${allowedHarmonicDistanceDb.toFixed(3)} dB`,
    }));
  }
  if (!finite(envelopeDistanceDb) || envelopeDistanceDb > allowedEnvelopeDistanceDb) {
    findings.push(Object.freeze({
      code: "PIANO_REFERENCE_ATTACK_ENVELOPE",
      message: `envelope distance ${envelopeDistanceDb.toFixed(3)} exceeds ${allowedEnvelopeDistanceDb.toFixed(3)} dB`,
    }));
  }
  return Object.freeze(findings);
}

function decodeReferenceSlice(
  corpus: Uint8Array,
  slice: PianoAttackSlice,
): Float32Array {
  const samples = new Float32Array(slice.frameCount);
  const view = new DataView(corpus.buffer, corpus.byteOffset, corpus.byteLength);
  for (let index = 0; index < slice.frameCount; index += 1) {
    samples[index] = view.getInt16(slice.byteOffset + 2 * index, true) / 32_768;
  }
  return samples;
}

function selectSlice(midi: number, velocity: number): PianoAttackSlice {
  const slice = PIANO_ATTACK_SLICE_INDEX.find((entry) =>
    entry.midiPitch === midi && velocity >= entry.lowVelocity && velocity <= entry.highVelocity
  );
  if (slice === undefined) throw new Error(`PIANO_REFERENCE_SLICE_MISSING:m${String(midi)}v${String(velocity)}`);
  return slice;
}

function pianoReferenceEntries(): ReadonlyMap<string, PianoReferenceEntry> {
  if (pianoReferenceEntriesCache !== undefined) return pianoReferenceEntriesCache;
  const corpus = Uint8Array.from(Buffer.from(PIANO_ATTACK_SAMPLES_BASE64, "base64"));
  if (sha256(corpus) !== PIANO_ATTACK_SAMPLES_SHA256) {
    throw new Error("PIANO_REFERENCE_CORPUS_DIGEST_MISMATCH");
  }
  const entries = new Map<string, PianoReferenceEntry>();
  for (const midi of PIANO_V2_REFERENCE_POLICY.midi) {
    for (const velocity of PIANO_V2_REFERENCE_POLICY.velocities) {
      const slice = selectSlice(midi, velocity);
      const pcm = decodeReferenceSlice(corpus, slice);
      // Compare both candidate and reference on the same notated-pitch grid.
      // The local partial search already follows the recorded slice within
      // +/- harmonicSearchCents, so shifting the reference grid by its raw
      // tuning offset would only change the number of analysable upper
      // partials at Nyquist. That produced unequal profile cardinalities and
      // a non-finite distance which JSON silently encoded as null.
      const expected = midiHz(midi);
      const inharmonicity = reviewedPianoInharmonicityCoefficient(midi);
      entries.set(`m${String(midi)}v${String(velocity)}`, Object.freeze({
        slice,
        pcm,
        features: analyzePianoReferenceFeatures(
          pcm,
          PIANO_V2_REFERENCE_POLICY.sampleRateHz,
          expected,
          inharmonicity,
        ),
        pcmSha256: sha256(new Uint8Array(pcm.buffer)),
      }));
    }
  }
  pianoReferenceEntriesCache = entries;
  return entries;
}

function requireWasmFunction(
  exports: PianoWasmRawExports,
  name: string,
): (...arguments_: number[]) => number {
  const value = exports[name];
  if (typeof value !== "function") throw new Error(`PIANO_REFERENCE_WASM_ABI_MISSING:${name}`);
  return value as (...arguments_: number[]) => number;
}

function requirePianoWasm(exports: PianoWasmRawExports): PianoWasm {
  const memory = exports["memory"];
  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("PIANO_REFERENCE_WASM_ABI_MISSING:memory");
  }
  const rawHeapBase = exports["__heap_base"];
  const heapBase = rawHeapBase instanceof WebAssembly.Global
    ? Number(rawHeapBase.value)
    : typeof rawHeapBase === "number" ? rawHeapBase : Number.NaN;
  if (!Number.isSafeInteger(heapBase) || heapBase < 0) {
    throw new Error("PIANO_REFERENCE_WASM_ABI_MISSING:__heap_base");
  }
  return Object.freeze({
    memory,
    heapBase,
    runtimeInit: requireWasmFunction(exports, "pno2_chord_runtime_init"),
    runtimeMaxSteps: requireWasmFunction(exports, "pno2_chord_runtime_max_steps"),
    runtimeStep: requireWasmFunction(exports, "pno2_chord_runtime_step"),
    runtimeReset: requireWasmFunction(exports, "pno2_chord_runtime_reset"),
  });
}

class PianoCandidateRenderer {
  readonly #wasm: PianoWasm;
  readonly #frames: number;
  readonly #midiPointer: number;
  readonly #velocityPointer: number;
  readonly #leftPointer: number;
  readonly #rightPointer: number;

  static async create(wasmBytes: Uint8Array): Promise<PianoCandidateRenderer> {
    const result = await WebAssembly.instantiate(wasmBytes, {});
    const exports = result.instance.exports as unknown as PianoWasmRawExports;
    return new PianoCandidateRenderer(requirePianoWasm(exports));
  }

  private constructor(wasm: PianoWasm) {
    this.#wasm = wasm;
    this.#frames = Math.floor(
      PIANO_V2_REFERENCE_POLICY.renderSeconds * PIANO_V2_REFERENCE_POLICY.sampleRateHz,
    );
    this.#midiPointer = Math.ceil((wasm.heapBase + 1024) / 16) * 16;
    this.#velocityPointer = this.#midiPointer + 16;
    this.#leftPointer = this.#velocityPointer + 16;
    this.#rightPointer = this.#leftPointer + 4 * this.#frames;
    const end = this.#rightPointer + 4 * this.#frames;
    if (end > wasm.memory.buffer.byteLength) {
      wasm.memory.grow(Math.ceil((end - wasm.memory.buffer.byteLength) / 65_536));
    }
  }

  render(midi: number, velocity: number): Readonly<{
    left: Float32Array;
    right: Float32Array;
    mono: Float32Array;
    pcmSha256: string;
  }> {
    new Int32Array(this.#wasm.memory.buffer, this.#midiPointer, 1)[0] = midi;
    new Int32Array(this.#wasm.memory.buffer, this.#velocityPointer, 1)[0] = velocity;
    const handle = this.#wasm.runtimeInit(
      this.#midiPointer,
      this.#velocityPointer,
      1,
      PIANO_V2_REFERENCE_POLICY.sampleRateHz,
      this.#frames,
    );
    if (handle <= 0) throw new Error(`PIANO_REFERENCE_RENDER_INIT_REFUSED:m${String(midi)}v${String(velocity)}`);
    const maximumSteps = this.#wasm.runtimeMaxSteps(this.#frames);
    let calls = 0;
    for (;;) {
      calls += 1;
      const status = this.#wasm.runtimeStep(
        handle,
        this.#leftPointer,
        this.#rightPointer,
        this.#frames,
      );
      if (status === 2) break;
      if (status !== 1 || calls > maximumSteps) {
        this.#wasm.runtimeReset(handle);
        throw new Error(`PIANO_REFERENCE_RENDER_STEP_REFUSED:${String(status)}`);
      }
    }
    const left = new Float32Array(this.#frames);
    const right = new Float32Array(this.#frames);
    left.set(new Float32Array(this.#wasm.memory.buffer, this.#leftPointer, this.#frames));
    right.set(new Float32Array(this.#wasm.memory.buffer, this.#rightPointer, this.#frames));
    if (this.#wasm.runtimeReset(handle) !== 1) {
      throw new Error("PIANO_REFERENCE_RENDER_RESET_REFUSED");
    }
    const mono = new Float32Array(this.#frames);
    for (let index = 0; index < this.#frames; index += 1) {
      mono[index] = ((left[index] ?? 0) + (right[index] ?? 0)) / 2;
    }
    const hash = createHash("sha256");
    hash.update(new Uint8Array(left.buffer));
    hash.update(new Uint8Array(right.buffer));
    return Object.freeze({ left, right, mono, pcmSha256: hash.digest("hex") });
  }
}

async function sourceBindings(root: string): Promise<readonly SourceBinding[]> {
  return Object.freeze(await Promise.all(PIANO_V2_REFERENCE_SOURCE_PATHS.map(async (path) =>
    Object.freeze({
      path,
      sha256: sha256(new Uint8Array(await readFile(resolve(root, path)))),
    }))));
}

function maximumPairwiseDistance(profiles: readonly (readonly number[])[]): number {
  let maximum = 0;
  for (let left = 0; left < profiles.length; left += 1) {
    for (let right = left + 1; right < profiles.length; right += 1) {
      maximum = Math.max(
        maximum,
        profileDistanceDb(profiles[left] ?? [], profiles[right] ?? []),
      );
    }
  }
  return maximum;
}

function levelsStrictlyIncrease(levels: readonly number[]): boolean {
  return levels.length >= 2 && levels.every((level, index) =>
    index === 0 || (levels[index - 1] ?? Number.POSITIVE_INFINITY) < level);
}

function summarize(
  cells: readonly PianoReferenceCell[],
  dynamicsCells: readonly PianoDynamicsCell[],
  controls: PianoV2ReferenceEvidence["controls"],
  shippingPayloadMatch: boolean,
): PianoV2ReferenceEvidence["summary"] {
  const passedCellCount = cells.filter((cell) => cell.outcome === "pass").length;
  const passedDynamicsCellCount = dynamicsCells.filter((cell) => cell.outcome === "pass").length;
  const acousticPass =
    passedCellCount === PIANO_V2_REFERENCE_POLICY.midi.length *
      PIANO_V2_REFERENCE_POLICY.velocities.length &&
    passedDynamicsCellCount === PIANO_V2_REFERENCE_POLICY.midi.length &&
    Object.values(controls).every(Boolean);
  return Object.freeze({
    acousticOutcome: acousticPass ? "pass" : "fail",
    shippingOutcome: acousticPass && shippingPayloadMatch ? "pass" : "fail",
    passedCellCount,
    passedDynamicsCellCount,
  });
}

function healthyFeatures(reference: PianoReferenceFeatures): PianoReferenceFeatures {
  return Object.freeze({
    ...reference,
    harmonicCombOffsetCents: 0,
    earlyRms: 0.05,
    peak: 0.4,
  });
}

function pianoReferenceControls(
  referenceById: ReadonlyMap<string, PianoReferenceEntry>,
): PianoV2ReferenceEvidence["controls"] {
  if (pianoReferenceControlsCache !== undefined) return pianoReferenceControlsCache;
  const controlReference = referenceById.get("m60v72");
  if (controlReference === undefined) {
    throw new Error("PIANO_REFERENCE_CONTROL_REFERENCE_MISSING");
  }
  const allowedHarmonic = PIANO_V2_REFERENCE_POLICY.minimumAllowedHarmonicDistanceDb;
  const allowedEnvelope = PIANO_V2_REFERENCE_POLICY.minimumAllowedEnvelopeDistanceDb;
  const healthy = healthyFeatures(controlReference.features);
  const sine = new Float32Array(Math.floor(
    PIANO_V2_REFERENCE_POLICY.renderSeconds * PIANO_V2_REFERENCE_POLICY.sampleRateHz,
  ));
  for (let index = 0; index < sine.length; index += 1) {
    const seconds = index / PIANO_V2_REFERENCE_POLICY.sampleRateHz;
    const attack = Math.min(1, seconds / 0.02);
    sine[index] = 0.2 * attack * Math.exp(-2 * seconds) *
      Math.sin(2 * Math.PI * midiHz(60) * seconds);
  }
  const sineFeatures = analyzePianoReferenceFeatures(
    sine,
    PIANO_V2_REFERENCE_POLICY.sampleRateHz,
    midiHz(60),
    reviewedPianoInharmonicityCoefficient(60),
  );
  const synthesizePartialBank = (
    fundamentalHz: number,
    inharmonicityCoefficient: number,
  ): Float32Array => {
    const samples = new Float32Array(Math.floor(
      PIANO_V2_REFERENCE_POLICY.renderSeconds * PIANO_V2_REFERENCE_POLICY.sampleRateHz,
    ));
    for (let index = 0; index < samples.length; index += 1) {
      const seconds = index / PIANO_V2_REFERENCE_POLICY.sampleRateHz;
      const attack = Math.min(1, seconds / 0.015);
      const envelope = attack * Math.exp(-2.5 * seconds);
      let value = 0;
      for (let partial = 1; partial <= 8; partial += 1) {
        value += 0.12 / partial * Math.sin(
          2 * Math.PI * stiffPianoPartialHz(
            fundamentalHz,
            inharmonicityCoefficient,
            partial,
          ) * seconds,
        );
      }
      samples[index] = envelope * value;
    }
    return samples;
  };
  const wrongPitchInharmonicity = reviewedPianoInharmonicityCoefficient(60);
  const wrongPitchFeatures = analyzePianoReferenceFeatures(
    synthesizePartialBank(midiHz(60) * 2 ** (100 / 1200), wrongPitchInharmonicity),
    PIANO_V2_REFERENCE_POLICY.sampleRateHz,
    midiHz(60),
    wrongPitchInharmonicity,
  );
  const bankFundamentalHz = midiHz(84);
  const bankInharmonicity = reviewedPianoInharmonicityCoefficient(84);
  const integerBank = synthesizePartialBank(bankFundamentalHz, 0);
  const stiffBank = synthesizePartialBank(bankFundamentalHz, bankInharmonicity);
  const integerBankFeatures = analyzePianoReferenceFeatures(
    integerBank,
    PIANO_V2_REFERENCE_POLICY.sampleRateHz,
    bankFundamentalHz,
    bankInharmonicity,
  );
  const stiffBankFeatures = analyzePianoReferenceFeatures(
    stiffBank,
    PIANO_V2_REFERENCE_POLICY.sampleRateHz,
    bankFundamentalHz,
    bankInharmonicity,
  );
  const controls = Object.freeze({
    referenceSelfPasses: evaluatePianoReferenceCell(
      healthy,
      0,
      0,
      allowedHarmonic,
      allowedEnvelope,
    ).length === 0,
    wrongPitchRejected: evaluatePianoReferenceCell(
      wrongPitchFeatures,
      0,
      0,
      allowedHarmonic,
      allowedEnvelope,
    ).some((finding) => finding.code === "PIANO_REFERENCE_HARMONIC_COMB_OFFSET"),
    silentRejected: evaluatePianoReferenceCell(
      Object.freeze({ ...healthy, earlyRms: 0 }),
      0,
      0,
      allowedHarmonic,
      allowedEnvelope,
    ).some((finding) => finding.code === "PIANO_REFERENCE_SILENT"),
    clippingRejected: evaluatePianoReferenceCell(
      Object.freeze({ ...healthy, peak: 1.1 }),
      0,
      0,
      allowedHarmonic,
      allowedEnvelope,
    ).some((finding) => finding.code === "PIANO_REFERENCE_CLIPPING"),
    pureSineRejected: evaluatePianoReferenceCell(
      sineFeatures,
      profileDistanceDb(
        sineFeatures.harmonicProfileDb,
        controlReference.features.harmonicProfileDb,
      ),
      0,
      allowedHarmonic,
      allowedEnvelope,
    ).some((finding) => finding.code === "PIANO_REFERENCE_HARMONIC_PROFILE"),
    integerHarmonicBankRejected: evaluatePianoReferenceCell(
      integerBankFeatures,
      profileDistanceDb(
        integerBankFeatures.harmonicProfileDb,
        stiffBankFeatures.harmonicProfileDb,
      ),
      0,
      allowedHarmonic,
      allowedEnvelope,
    ).some((finding) => finding.code === "PIANO_REFERENCE_HARMONIC_PROFILE"),
    flatEnvelopeRejected: evaluatePianoReferenceCell(
      healthy,
      0,
      allowedEnvelope + 1,
      allowedHarmonic,
      allowedEnvelope,
    ).some((finding) => finding.code === "PIANO_REFERENCE_ATTACK_ENVELOPE"),
    flatDynamicsRejected: !levelsStrictlyIncrease([0.05, 0.05, 0.05]),
  });
  pianoReferenceControlsCache = controls;
  return controls;
}

export async function runPianoV2ReferenceGate(
  wasmBytes: Uint8Array,
  root = process.cwd(),
): Promise<PianoV2ReferenceEvidence> {
  const bindingsBefore = await sourceBindings(root);
  const renderer = await PianoCandidateRenderer.create(wasmBytes);
  const referenceById = pianoReferenceEntries();

  const cells: PianoReferenceCell[] = [];
  const byId = new Map<string, PianoReferenceFeatures>();
  for (const midi of PIANO_V2_REFERENCE_POLICY.midi) {
    const sameKeyReferences = PIANO_V2_REFERENCE_POLICY.velocities.map((velocity) => {
      const entry = referenceById.get(`m${String(midi)}v${String(velocity)}`);
      if (entry === undefined) throw new Error("PIANO_REFERENCE_INTERNAL_REFERENCE_MISSING");
      return entry.features;
    });
    const referenceHarmonicSpreadDb = maximumPairwiseDistance(
      sameKeyReferences.map((features) => features.harmonicProfileDb),
    );
    const referenceEnvelopeSpreadDb = maximumPairwiseDistance(
      sameKeyReferences.map((features) => features.envelopeProfileDb),
    );
    const allowedHarmonicDistanceDb = Math.max(
      PIANO_V2_REFERENCE_POLICY.minimumAllowedHarmonicDistanceDb,
      PIANO_V2_REFERENCE_POLICY.withinCorpusDistanceMultiplier * referenceHarmonicSpreadDb,
    );
    const allowedEnvelopeDistanceDb = Math.max(
      PIANO_V2_REFERENCE_POLICY.minimumAllowedEnvelopeDistanceDb,
      PIANO_V2_REFERENCE_POLICY.withinCorpusDistanceMultiplier * referenceEnvelopeSpreadDb,
    );
    for (const velocity of PIANO_V2_REFERENCE_POLICY.velocities) {
      const id = `m${String(midi)}v${String(velocity)}`;
      const reference = referenceById.get(id);
      if (reference === undefined) throw new Error("PIANO_REFERENCE_INTERNAL_REFERENCE_MISSING");
      const rendered = renderer.render(midi, velocity);
      const inharmonicity = reviewedPianoInharmonicityCoefficient(midi);
      const features = analyzePianoReferenceFeatures(
        rendered.mono,
        PIANO_V2_REFERENCE_POLICY.sampleRateHz,
        midiHz(midi),
        inharmonicity,
      );
      const harmonicDistanceDb = profileDistanceDb(
        features.harmonicProfileDb,
        reference.features.harmonicProfileDb,
      );
      const envelopeDistanceDb = profileDistanceDb(
        features.envelopeProfileDb,
        reference.features.envelopeProfileDb,
      );
      const findings = evaluatePianoReferenceCell(
        features,
        harmonicDistanceDb,
        envelopeDistanceDb,
        allowedHarmonicDistanceDb,
        allowedEnvelopeDistanceDb,
      );
      byId.set(id, features);
      cells.push(Object.freeze({
        id,
        midi,
        velocity,
        requestSha256: sha256(canonicalJson({
          midi,
          velocity,
          sampleRateHz: PIANO_V2_REFERENCE_POLICY.sampleRateHz,
          frames: rendered.mono.length,
        })),
        pcmSha256: rendered.pcmSha256,
        referenceSlice: Object.freeze({
          byteOffset: reference.slice.byteOffset,
          frameCount: reference.slice.frameCount,
          sourceLayer: reference.slice.sourceLayer,
          sourceChannel: reference.slice.sourceChannel,
          tuningCents: reference.slice.tuningCents,
        }),
        referencePcmSha256: reference.pcmSha256,
        features,
        harmonicDistanceDb,
        envelopeDistanceDb,
        referenceHarmonicSpreadDb,
        referenceEnvelopeSpreadDb,
        allowedHarmonicDistanceDb,
        allowedEnvelopeDistanceDb,
        outcome: findings.length === 0 ? "pass" : "fail",
        findings,
      }));
    }
  }

  const dynamicsCells: PianoDynamicsCell[] = PIANO_V2_REFERENCE_POLICY.midi.map((midi) => {
    const levels = PIANO_V2_REFERENCE_POLICY.velocities.map((velocity) =>
      byId.get(`m${String(midi)}v${String(velocity)}`)?.earlyRms ?? Number.NaN,
    ) as [number, number, number];
    const outcome = levels.every(finite) && levelsStrictlyIncrease(levels)
      ? "pass" as const
      : "fail" as const;
    return Object.freeze({ id: `m${String(midi)}-dynamics`, midi, earlyRms: Object.freeze(levels), outcome });
  });

  const controls = pianoReferenceControls(referenceById);
  const embeddedBytes = Uint8Array.from(Buffer.from(CONCERT_GRAND_WASM_BASE64, "base64"));
  const wasmSha256 = sha256(wasmBytes);
  const shippingPayloadMatch = wasmSha256 === CONCERT_GRAND_WASM_SHA256 &&
    wasmSha256 === sha256(embeddedBytes) &&
    Buffer.from(wasmBytes).equals(Buffer.from(embeddedBytes));
  const bindingsAfter = await sourceBindings(root);
  if (canonicalJson(bindingsBefore) !== canonicalJson(bindingsAfter)) {
    throw new Error("PIANO_REFERENCE_INPUT_DRIFT");
  }
  const summary = summarize(cells, dynamicsCells, controls, shippingPayloadMatch);
  const unsigned = {
    schema: PIANO_V2_REFERENCE_EVIDENCE_SCHEMA,
    policy: PIANO_V2_REFERENCE_POLICY,
    wasmSha256,
    embeddedWasmSha256: CONCERT_GRAND_WASM_SHA256,
    shippingPayloadMatch,
    corpusSha256: PIANO_ATTACK_SAMPLES_SHA256,
    sourceBindings: bindingsBefore,
    sourceClosureSha256: sha256(canonicalJson(bindingsBefore)),
    cells: Object.freeze(cells),
    dynamicsCells: Object.freeze(dynamicsCells),
    controls,
    summary,
  };
  return Object.freeze({
    ...unsigned,
    evidenceSha256: sha256(canonicalJson(unsigned)),
  });
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isFiniteNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((entry: unknown) =>
    typeof entry === "number" && finite(entry));
}

function isPianoReferenceFeatures(value: unknown): value is PianoReferenceFeatures {
  if (value === null || typeof value !== "object") return false;
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record["harmonicCombOffsetCents"] === "number" &&
    finite(record["harmonicCombOffsetCents"]) &&
    typeof record["earlyRms"] === "number" && finite(record["earlyRms"]) &&
    typeof record["peak"] === "number" && finite(record["peak"]) &&
    isFiniteNumberArray(record["harmonicProfileDb"]) &&
    record["harmonicProfileDb"].length > 0 &&
    record["harmonicProfileDb"].length <= PIANO_V2_REFERENCE_POLICY.maximumHarmonics &&
    isFiniteNumberArray(record["envelopeProfileDb"]) &&
    record["envelopeProfileDb"].length ===
      PIANO_V2_REFERENCE_POLICY.envelopeWindowsSeconds.length;
}

function isFinding(value: unknown): value is Finding {
  if (value === null || typeof value !== "object") return false;
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record["code"] === "string" && typeof record["message"] === "string";
}

function isPianoReferenceCell(value: unknown): value is PianoReferenceCell {
  if (value === null || typeof value !== "object") return false;
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record["id"] === "string" &&
    typeof record["midi"] === "number" && Number.isSafeInteger(record["midi"]) &&
    typeof record["velocity"] === "number" && Number.isSafeInteger(record["velocity"]) &&
    isDigest(record["requestSha256"]) && isDigest(record["pcmSha256"]) &&
    isPianoReferenceSlice(record["referenceSlice"]) &&
    isDigest(record["referencePcmSha256"]) &&
    isPianoReferenceFeatures(record["features"]) &&
    ["harmonicDistanceDb", "envelopeDistanceDb", "referenceHarmonicSpreadDb",
      "referenceEnvelopeSpreadDb", "allowedHarmonicDistanceDb",
      "allowedEnvelopeDistanceDb"].every((key) =>
      typeof record[key] === "number" && finite(record[key])) &&
    (record["outcome"] === "pass" || record["outcome"] === "fail") &&
    Array.isArray(record["findings"]) &&
    record["findings"].every((entry: unknown) => isFinding(entry));
}

function isPianoReferenceSlice(value: unknown): value is PianoReferenceCell["referenceSlice"] {
  if (value === null || typeof value !== "object") return false;
  const record = value as Readonly<Record<string, unknown>>;
  return ["byteOffset", "frameCount", "sourceLayer", "sourceChannel"].every((key) =>
    typeof record[key] === "number" && Number.isSafeInteger(record[key]) && record[key] >= 0) &&
    typeof record["tuningCents"] === "number" && finite(record["tuningCents"]);
}

function isPianoDynamicsCell(value: unknown): value is PianoDynamicsCell {
  if (value === null || typeof value !== "object") return false;
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record["id"] === "string" &&
    typeof record["midi"] === "number" && Number.isSafeInteger(record["midi"]) &&
    isFiniteNumberArray(record["earlyRms"]) && record["earlyRms"].length === 3 &&
    (record["outcome"] === "pass" || record["outcome"] === "fail");
}

function isSourceBinding(value: unknown): value is SourceBinding {
  if (value === null || typeof value !== "object") return false;
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record["path"] === "string" && isDigest(record["sha256"]);
}

export function verifyPianoV2ReferenceEvidence(
  value: unknown,
): value is PianoV2ReferenceEvidence {
  if (value === null || typeof value !== "object") return false;
  const unknownRecord = value as Readonly<Record<string, unknown>>;
  const rawCells = unknownRecord["cells"];
  const rawDynamics = unknownRecord["dynamicsCells"];
  const rawBindings = unknownRecord["sourceBindings"];
  if (!Array.isArray(rawCells) || !rawCells.every((entry: unknown) =>
    isPianoReferenceCell(entry)) ||
    !Array.isArray(rawDynamics) || !rawDynamics.every((entry: unknown) =>
      isPianoDynamicsCell(entry)) ||
    !Array.isArray(rawBindings) || !rawBindings.every((entry: unknown) =>
      isSourceBinding(entry))) return false;
  const evidence = value as PianoV2ReferenceEvidence;
  const cells: readonly PianoReferenceCell[] = rawCells;
  const dynamicsCells: readonly PianoDynamicsCell[] = rawDynamics;
  const sourceBindingsValue: readonly SourceBinding[] = rawBindings;
  if (unknownRecord["schema"] !== PIANO_V2_REFERENCE_EVIDENCE_SCHEMA ||
    canonicalJson(evidence.policy) !== canonicalJson(PIANO_V2_REFERENCE_POLICY) ||
    !isDigest(evidence.wasmSha256) ||
    evidence.embeddedWasmSha256 !== CONCERT_GRAND_WASM_SHA256 ||
    evidence.corpusSha256 !== PIANO_ATTACK_SAMPLES_SHA256 ||
    typeof evidence.shippingPayloadMatch !== "boolean" ||
    evidence.shippingPayloadMatch !== (evidence.wasmSha256 === evidence.embeddedWasmSha256) ||
    !isDigest(evidence.sourceClosureSha256) || !isDigest(evidence.evidenceSha256)) return false;
  if (sourceBindingsValue.length !== PIANO_V2_REFERENCE_SOURCE_PATHS.length ||
    sourceBindingsValue.some((binding, index) =>
      binding.path !== PIANO_V2_REFERENCE_SOURCE_PATHS[index])) return false;
  const expectedCellCount = PIANO_V2_REFERENCE_POLICY.midi.length *
    PIANO_V2_REFERENCE_POLICY.velocities.length;
  if (cells.length !== expectedCellCount ||
    dynamicsCells.length !== PIANO_V2_REFERENCE_POLICY.midi.length) return false;
  let references: ReadonlyMap<string, PianoReferenceEntry>;
  try {
    references = pianoReferenceEntries();
  } catch {
    return false;
  }
  let cellIndex = 0;
  for (const midi of PIANO_V2_REFERENCE_POLICY.midi) {
    const sameKeyReferences = PIANO_V2_REFERENCE_POLICY.velocities.map((velocity) =>
      references.get(`m${String(midi)}v${String(velocity)}`)?.features);
    if (sameKeyReferences.some((entry) => entry === undefined)) return false;
    const typedReferences = sameKeyReferences as readonly PianoReferenceFeatures[];
    const expectedHarmonicSpread = maximumPairwiseDistance(
      typedReferences.map((features) => features.harmonicProfileDb),
    );
    const expectedEnvelopeSpread = maximumPairwiseDistance(
      typedReferences.map((features) => features.envelopeProfileDb),
    );
    for (const velocity of PIANO_V2_REFERENCE_POLICY.velocities) {
      const cell = cells[cellIndex];
      cellIndex += 1;
      if (cell === undefined || cell.midi !== midi || cell.velocity !== velocity ||
        cell.id !== `m${String(midi)}v${String(velocity)}`) return false;
      const reference = references.get(cell.id);
      if (reference === undefined) return false;
      if (cell.features.harmonicProfileDb.length !==
        reference.features.harmonicProfileDb.length) return false;
      const expectedSlice = {
        byteOffset: reference.slice.byteOffset,
        frameCount: reference.slice.frameCount,
        sourceLayer: reference.slice.sourceLayer,
        sourceChannel: reference.slice.sourceChannel,
        tuningCents: reference.slice.tuningCents,
      };
      const expectedRequestSha256 = sha256(canonicalJson({
        midi,
        velocity,
        sampleRateHz: PIANO_V2_REFERENCE_POLICY.sampleRateHz,
        frames: Math.floor(
          PIANO_V2_REFERENCE_POLICY.renderSeconds * PIANO_V2_REFERENCE_POLICY.sampleRateHz,
        ),
      }));
      const expectedHarmonicDistance = profileDistanceDb(
        cell.features.harmonicProfileDb,
        reference.features.harmonicProfileDb,
      );
      const expectedEnvelopeDistance = profileDistanceDb(
        cell.features.envelopeProfileDb,
        reference.features.envelopeProfileDb,
      );
      if (cell.requestSha256 !== expectedRequestSha256 ||
        canonicalJson(cell.referenceSlice) !== canonicalJson(expectedSlice) ||
        cell.referencePcmSha256 !== reference.pcmSha256 ||
        Math.abs(cell.harmonicDistanceDb - expectedHarmonicDistance) > 1.0e-12 ||
        Math.abs(cell.envelopeDistanceDb - expectedEnvelopeDistance) > 1.0e-12 ||
        Math.abs(cell.referenceHarmonicSpreadDb - expectedHarmonicSpread) > 1.0e-12 ||
        Math.abs(cell.referenceEnvelopeSpreadDb - expectedEnvelopeSpread) > 1.0e-12) return false;
    const expectedAllowedHarmonic = Math.max(
      PIANO_V2_REFERENCE_POLICY.minimumAllowedHarmonicDistanceDb,
      PIANO_V2_REFERENCE_POLICY.withinCorpusDistanceMultiplier *
        cell.referenceHarmonicSpreadDb,
    );
    const expectedAllowedEnvelope = Math.max(
      PIANO_V2_REFERENCE_POLICY.minimumAllowedEnvelopeDistanceDb,
      PIANO_V2_REFERENCE_POLICY.withinCorpusDistanceMultiplier *
        cell.referenceEnvelopeSpreadDb,
    );
    if (Math.abs(cell.allowedHarmonicDistanceDb - expectedAllowedHarmonic) > 1.0e-12 ||
      Math.abs(cell.allowedEnvelopeDistanceDb - expectedAllowedEnvelope) > 1.0e-12) return false;
    const findings = evaluatePianoReferenceCell(
      cell.features,
      cell.harmonicDistanceDb,
      cell.envelopeDistanceDb,
      cell.allowedHarmonicDistanceDb,
      cell.allowedEnvelopeDistanceDb,
    );
    if (cell.outcome !== (findings.length === 0 ? "pass" : "fail") ||
      canonicalJson(cell.findings) !== canonicalJson(findings)) return false;
    }
  }
  for (let index = 0; index < PIANO_V2_REFERENCE_POLICY.midi.length; index += 1) {
    const midi = PIANO_V2_REFERENCE_POLICY.midi[index];
    const cell = dynamicsCells[index];
    if (midi === undefined || cell === undefined || cell.midi !== midi ||
      cell.id !== `m${String(midi)}-dynamics`) return false;
    const expectedLevels = PIANO_V2_REFERENCE_POLICY.velocities.map((velocity) =>
      cells.find((candidate) => candidate.midi === midi && candidate.velocity === velocity)
        ?.features.earlyRms ?? Number.NaN,
    );
    const pass = expectedLevels.every(finite) && levelsStrictlyIncrease(expectedLevels);
    if (canonicalJson(cell.earlyRms) !== canonicalJson(expectedLevels) ||
      cell.outcome !== (pass ? "pass" : "fail")) return false;
  }
  let expectedControls: PianoV2ReferenceEvidence["controls"];
  try {
    expectedControls = pianoReferenceControls(references);
  } catch {
    return false;
  }
  if (canonicalJson(evidence.controls) !== canonicalJson(expectedControls)) return false;
  const summary = summarize(
    cells,
    dynamicsCells,
    evidence.controls,
    evidence.shippingPayloadMatch,
  );
  if (canonicalJson(evidence.summary) !== canonicalJson(summary)) return false;
  const { evidenceSha256, ...unsigned } = evidence;
  return evidence.sourceClosureSha256 === sha256(canonicalJson(sourceBindingsValue)) &&
    evidenceSha256 === sha256(canonicalJson(unsigned));
}

export async function verifyPianoV2ReferenceEvidenceAgainstReplay(
  evidence: PianoV2ReferenceEvidence,
  wasmBytes: Uint8Array,
  root = process.cwd(),
): Promise<boolean> {
  if (!verifyPianoV2ReferenceEvidence(evidence) ||
    evidence.wasmSha256 !== sha256(wasmBytes)) return false;
  try {
    const replay = await runPianoV2ReferenceGate(wasmBytes, root);
    return canonicalJson(replay) === canonicalJson(evidence);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wasmIndex = args.indexOf("--wasm");
  const outputIndex = args.indexOf("--output");
  if (wasmIndex < 0 || outputIndex < 0 ||
    args[wasmIndex + 1] === undefined || args[outputIndex + 1] === undefined) {
    throw new Error("usage: bun scripts/run-piano-v2-reference-gate.ts --wasm FILE --output FILE");
  }
  const wasmBytes = new Uint8Array(await readFile(resolve(args[wasmIndex + 1] ?? "")));
  const evidence = await runPianoV2ReferenceGate(wasmBytes);
  await writeFile(resolve(args[outputIndex + 1] ?? ""), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence.summary)}\n`);
  if (evidence.summary.shippingOutcome !== "pass") process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}
