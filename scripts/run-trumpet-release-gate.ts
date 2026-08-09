/**
 * Fail-closed shipping gate for the physical Bb trumpet
 * (changes.dsp.waveguide-trumpet@1), bead jcpe-trumpet-lock-completion-el46.
 *
 * The four round-11 wall-test laws, re-measured through the SHIPPING wasm and
 * host ABI (not the Rust test harness): every cell must lock the right regime
 * (periodicity), land on 12-TET (pitch), brighten with velocity (centroid
 * monotone with floors), and grow with velocity without clipping (level
 * monotone, bounded peak). Following the plucked-v2 release-gate pattern:
 * a frozen policy object, measured feature cells, planted controls earned
 * live, and an evidence JSON hash-bound to the exact wasm payload and Rust
 * source so `bun run predeploy:check` can re-verify every verdict offline
 * from the stored features without re-rendering.
 *
 * Run: bun scripts/run-trumpet-release-gate.ts
 * Writes: release-evidence/audio/listening/trumpet-release-gate-evidence.json
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  loadWaveguideRenderers,
  type RenderedNotePcm,
} from "../src/audio/dsp-renderer";

/*
 * Defined locally: the algorithm id is registered in dsp-renderer only when
 * the trumpet is wired live; this gate script must typecheck while the
 * model is dark so the go-live round can run it unchanged.
 */
const WAVEGUIDE_TRUMPET_ALGORITHM_ID = "changes.dsp.waveguide-trumpet@1";
import { CONCERT_GRAND_WASM_SHA256 } from "../src/audio/wasm/concert-grand-wasm";

export const TRUMPET_RELEASE_POLICY = Object.freeze({
  schema: "changes.policy.phs5-trumpet-shipping-output.v1" as const,
  algorithmId: "changes.dsp.waveguide-trumpet@1" as const,
  sampleRateHz: 48_000,
  renderSeconds: 1.4,
  /* Sustain window: past the 30 ms attack and the seed transient. */
  sustainStartSeconds: 0.5,
  sustainLengthSeconds: 0.6,
  /* Operating-table corners + staff center, both regimes represented. */
  midi: Object.freeze([52, 58, 64, 70] as const),
  /* Piano and forte columns of the velocity->pressure map. */
  velocities: Object.freeze([64, 110] as const),
  /*
   * Cell laws (the wall-test laws transferred to the host ABI):
   *  - right-regime lock: sustained periodicity floor;
   *  - pitch law: absolute 12-TET error bound at every dynamic (the wall
   *    test's <20-cent drift bound applied as an absolute bound);
   *  - brightness law: centroid must RISE from piano to forte per note;
   *  - level law: RMS must RISE from piano to forte per note, stay above
   *    the audibility floor, and never clip.
   */
  minimumPeriodicity: 0.985,
  maximumAbsolutePitchCents: 20,
  minimumCentroidRiseHz: 30,
  minimumSustainRms: 1.0e-3,
  maximumPeak: 0.98,
} as const);

export const TRUMPET_SOURCE_PATHS = Object.freeze([
  "dsp/concert-grand/src/trumpet.rs",
  "src/audio/wasm/concert-grand-wasm.ts",
] as const);

export type TrumpetOutputFeatures = Readonly<{
  pitchCents: number;
  periodicity: number;
  sustainRms: number;
  peak: number;
  centroidHz: number;
}>;

export type TrumpetGateFinding = Readonly<{ code: string; message: string }>;

export type TrumpetOutputCell = Readonly<{
  id: string;
  algorithmId: string;
  midi: number;
  velocity: number;
  sampleRateHz: number;
  pcmSha256: string;
  features: TrumpetOutputFeatures;
  outcome: "pass" | "fail";
  findings: readonly TrumpetGateFinding[];
}>;

export type TrumpetDynamicsCell = Readonly<{
  id: string;
  midi: number;
  centroidRiseHz: number;
  rmsRise: number;
  outcome: "pass" | "fail";
}>;

type SourceBinding = Readonly<{ path: string; sha256: string }>;

export type TrumpetReleaseEvidence = Readonly<{
  schema: "changes.evidence.phs5-trumpet-shipping-output.v1";
  policy: typeof TRUMPET_RELEASE_POLICY;
  algorithmIds: readonly string[];
  wasmSha256: string;
  sourceBindings: readonly SourceBinding[];
  sourceClosureSha256: string;
  cells: readonly TrumpetOutputCell[];
  dynamicsCells: readonly TrumpetDynamicsCell[];
  controls: Readonly<{
    outOfTableRefused: boolean;
    wrongPitchRejected: boolean;
    unperiodicRejected: boolean;
    clippingRejected: boolean;
    flatDynamicsRejected: boolean;
  }>;
  summary: Readonly<{
    outcome: "pass" | "fail";
    passedCellCount: number;
    passedDynamicsCellCount: number;
  }>;
  evidenceSha256: string;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function mono(pcm: RenderedNotePcm): Float32Array {
  const merged = new Float32Array(pcm.frameCount);
  for (let index = 0; index < pcm.frameCount; index += 1) {
    merged[index] = ((pcm.left[index] ?? 0) + (pcm.right[index] ?? 0)) / 2;
  }
  return merged;
}

function floatPcmSha256(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  return sha256Hex(bytes);
}

/** Autocorrelation pitch with the canonical first-peak-over-threshold pick. */
function estimatePitch(
  samples: Float32Array,
  sampleRateHz: number,
  targetHz: number,
): Readonly<{ hz: number; periodicity: number }> {
  let mean = 0;
  for (const value of samples) mean += value;
  mean /= samples.length;
  const lagMin = Math.max(2, Math.floor(sampleRateHz / (targetHz * 1.9)));
  const lagMax = Math.ceil(sampleRateHz / (targetHz * 0.55));
  const scores: number[] = [];
  for (let lag = lagMin; lag <= lagMax; lag += 1) {
    let cross = 0;
    let left = 0;
    let right = 0;
    for (let index = 0; index + lag < samples.length; index += 1) {
      const a = (samples[index] ?? 0) - mean;
      const b = (samples[index + lag] ?? 0) - mean;
      cross += a * b;
      left += a * a;
      right += b * b;
    }
    scores.push(cross / Math.max(Math.sqrt(left * right), 1e-30));
  }
  const global = Math.max(...scores);
  const threshold = Math.max(global * 0.97, 0.5);
  let peak = -1;
  for (let index = 1; index + 1 < scores.length; index += 1) {
    const center = scores[index] ?? 0;
    if (center >= threshold && center > (scores[index - 1] ?? 0) &&
      center >= (scores[index + 1] ?? 0)) {
      peak = index;
      break;
    }
  }
  if (peak < 0) peak = scores.indexOf(global);
  const left = scores[peak - 1] ?? scores[peak] ?? 0;
  const center = scores[peak] ?? 0;
  const right = scores[peak + 1] ?? scores[peak] ?? 0;
  const curvature = left - 2 * center + right;
  const offset = Math.abs(curvature) > 1e-12
    ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / curvature))
    : 0;
  return Object.freeze({
    hz: sampleRateHz / (lagMin + peak + offset),
    periodicity: center,
  });
}

/** Magnitude spectral centroid over a Hann-windowed DFT of the sustain. */
function spectralCentroidHz(samples: Float32Array, sampleRateHz: number): number {
  const size = 4_096;
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  const count = Math.min(size, samples.length);
  const windowed = new Float64Array(size);
  for (let index = 0; index < count; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (count - 1));
    windowed[index] = (samples[index] ?? 0) * hann;
  }
  /* Direct DFT over the first size/2 bins (dev-time script; N log N unneeded). */
  let weighted = 0;
  let total = 0;
  for (let bin = 1; bin < size / 2; bin += 1) {
    let sumReal = 0;
    let sumImag = 0;
    const step = (2 * Math.PI * bin) / size;
    for (let index = 0; index < count; index += 1) {
      const angle = step * index;
      const value = windowed[index] ?? 0;
      sumReal += value * Math.cos(angle);
      sumImag -= value * Math.sin(angle);
    }
    real[bin] = sumReal;
    imag[bin] = sumImag;
    const magnitude = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
    const hz = (bin * sampleRateHz) / size;
    if (hz > 12_000) break;
    weighted += magnitude * hz;
    total += magnitude;
  }
  return total > 0 ? weighted / total : 0;
}

export function analyzeTrumpetOutput(
  samples: Float32Array,
  sampleRateHz: number,
  midi: number,
): TrumpetOutputFeatures {
  const sustainStart = Math.floor(TRUMPET_RELEASE_POLICY.sustainStartSeconds * sampleRateHz);
  const sustainLength = Math.min(
    Math.floor(TRUMPET_RELEASE_POLICY.sustainLengthSeconds * sampleRateHz),
    samples.length - sustainStart,
  );
  const sustain = samples.subarray(sustainStart, sustainStart + sustainLength);
  const target = midiHz(midi);
  const pitch = estimatePitch(sustain, sampleRateHz, target);
  let peak = 0;
  for (const value of samples) {
    peak = Math.max(peak, Math.abs(value));
  }
  let sustainSquares = 0;
  for (const value of sustain) sustainSquares += value * value;
  return Object.freeze({
    pitchCents: 1_200 * Math.log2(pitch.hz / target),
    periodicity: pitch.periodicity,
    sustainRms: Math.sqrt(sustainSquares / Math.max(1, sustain.length)),
    peak,
    centroidHz: spectralCentroidHz(sustain, sampleRateHz),
  });
}

export function evaluateTrumpetOutput(
  features: TrumpetOutputFeatures,
): readonly TrumpetGateFinding[] {
  const findings: TrumpetGateFinding[] = [];
  if (features.periodicity < TRUMPET_RELEASE_POLICY.minimumPeriodicity) {
    findings.push(Object.freeze({
      code: "TRUMPET_REGIME_LOCK",
      message: `periodicity ${features.periodicity.toFixed(4)} below ${String(TRUMPET_RELEASE_POLICY.minimumPeriodicity)}`,
    }));
  }
  if (Math.abs(features.pitchCents) > TRUMPET_RELEASE_POLICY.maximumAbsolutePitchCents) {
    findings.push(Object.freeze({
      code: "TRUMPET_PITCH",
      message: `pitch ${features.pitchCents.toFixed(1)} cents exceeds +-${String(TRUMPET_RELEASE_POLICY.maximumAbsolutePitchCents)}`,
    }));
  }
  if (features.sustainRms < TRUMPET_RELEASE_POLICY.minimumSustainRms) {
    findings.push(Object.freeze({
      code: "TRUMPET_SILENT",
      message: `sustain RMS ${features.sustainRms.toExponential(2)} below floor`,
    }));
  }
  if (features.peak > TRUMPET_RELEASE_POLICY.maximumPeak) {
    findings.push(Object.freeze({
      code: "TRUMPET_CLIPPING",
      message: `peak ${features.peak.toFixed(3)} exceeds ${String(TRUMPET_RELEASE_POLICY.maximumPeak)}`,
    }));
  }
  return Object.freeze(findings);
}

export function evaluateTrumpetDynamics(
  piano: TrumpetOutputFeatures,
  forte: TrumpetOutputFeatures,
): Readonly<{ centroidRiseHz: number; rmsRise: number; outcome: "pass" | "fail" }> {
  const centroidRiseHz = forte.centroidHz - piano.centroidHz;
  const rmsRise = forte.sustainRms - piano.sustainRms;
  const outcome = centroidRiseHz >= TRUMPET_RELEASE_POLICY.minimumCentroidRiseHz &&
    rmsRise > 0
    ? "pass" as const
    : "fail" as const;
  return Object.freeze({ centroidRiseHz, rmsRise, outcome });
}

function summarize(
  cells: readonly TrumpetOutputCell[],
  dynamicsCells: readonly TrumpetDynamicsCell[],
  controls: TrumpetReleaseEvidence["controls"],
): TrumpetReleaseEvidence["summary"] {
  const passedCellCount = cells.filter((cell) => cell.outcome === "pass").length;
  const passedDynamicsCellCount =
    dynamicsCells.filter((cell) => cell.outcome === "pass").length;
  const expectedCells =
    TRUMPET_RELEASE_POLICY.midi.length * TRUMPET_RELEASE_POLICY.velocities.length;
  const failed = passedCellCount !== expectedCells ||
    passedDynamicsCellCount !== TRUMPET_RELEASE_POLICY.midi.length ||
    !Object.values(controls).every(Boolean);
  return Object.freeze({
    outcome: failed ? "fail" as const : "pass" as const,
    passedCellCount,
    passedDynamicsCellCount,
  });
}

function evidenceDigest(value: Omit<TrumpetReleaseEvidence, "evidenceSha256">): string {
  return sha256Hex(canonicalJson(value));
}

async function sourceBindings(root: string): Promise<readonly SourceBinding[]> {
  return Object.freeze(await Promise.all(TRUMPET_SOURCE_PATHS.map(async (path) =>
    Object.freeze({
      path,
      sha256: sha256Hex(new Uint8Array(await readFile(resolve(root, path)))),
    }))));
}

function healthyFeatures(): TrumpetOutputFeatures {
  return Object.freeze({
    pitchCents: 2,
    periodicity: 0.998,
    sustainRms: 0.05,
    peak: 0.4,
    centroidHz: 1_800,
  });
}

export async function runTrumpetReleaseGate(
  root = process.cwd(),
): Promise<TrumpetReleaseEvidence> {
  const bindingsBefore = await sourceBindings(root);
  const renderers = await loadWaveguideRenderers();
  const renderer = renderers.get(WAVEGUIDE_TRUMPET_ALGORITHM_ID);
  if (renderer === undefined) throw new Error("TRUMPET_RENDERER_MISSING");
  const cells: TrumpetOutputCell[] = [];
  const byId = new Map<string, TrumpetOutputFeatures>();
  for (const midi of TRUMPET_RELEASE_POLICY.midi) {
    for (const velocity of TRUMPET_RELEASE_POLICY.velocities) {
      const pcm = renderer.renderNote(
        midi,
        velocity,
        TRUMPET_RELEASE_POLICY.sampleRateHz,
        TRUMPET_RELEASE_POLICY.renderSeconds,
      );
      if (pcm === null) throw new Error(`TRUMPET_RENDER_REFUSED:m${String(midi)}v${String(velocity)}`);
      const samples = mono(pcm);
      const features = analyzeTrumpetOutput(samples, pcm.sampleRateHz, midi);
      const findings = evaluateTrumpetOutput(features);
      byId.set(`m${String(midi)}v${String(velocity)}`, features);
      cells.push(Object.freeze({
        id: `m${String(midi)}v${String(velocity)}`,
        algorithmId: TRUMPET_RELEASE_POLICY.algorithmId,
        midi,
        velocity,
        sampleRateHz: pcm.sampleRateHz,
        pcmSha256: floatPcmSha256(samples),
        features,
        outcome: findings.length === 0 ? "pass" as const : "fail" as const,
        findings,
      }));
    }
  }
  const dynamicsCells: TrumpetDynamicsCell[] = [];
  for (const midi of TRUMPET_RELEASE_POLICY.midi) {
    const piano = byId.get(`m${String(midi)}v${String(TRUMPET_RELEASE_POLICY.velocities[0])}`);
    const forte = byId.get(`m${String(midi)}v${String(TRUMPET_RELEASE_POLICY.velocities[1])}`);
    if (piano === undefined || forte === undefined) throw new Error("TRUMPET_DYNAMICS_CELL_MISSING");
    const verdict = evaluateTrumpetDynamics(piano, forte);
    dynamicsCells.push(Object.freeze({
      id: `m${String(midi)}-dynamics`,
      midi,
      centroidRiseHz: verdict.centroidRiseHz,
      rmsRise: verdict.rmsRise,
      outcome: verdict.outcome,
    }));
  }
  /* Planted controls: each must be EARNED live on every run. */
  const healthy = healthyFeatures();
  const controls = Object.freeze({
    outOfTableRefused:
      renderer.renderNote(51, 100, TRUMPET_RELEASE_POLICY.sampleRateHz, 0.5) === null &&
      renderer.renderNote(71, 100, TRUMPET_RELEASE_POLICY.sampleRateHz, 0.5) === null,
    wrongPitchRejected: evaluateTrumpetOutput(
      Object.freeze({ ...healthy, pitchCents: 80 }),
    ).some((item) => item.code === "TRUMPET_PITCH"),
    unperiodicRejected: evaluateTrumpetOutput(
      Object.freeze({ ...healthy, periodicity: 0.4 }),
    ).some((item) => item.code === "TRUMPET_REGIME_LOCK"),
    clippingRejected: evaluateTrumpetOutput(
      Object.freeze({ ...healthy, peak: 1.2 }),
    ).some((item) => item.code === "TRUMPET_CLIPPING"),
    flatDynamicsRejected:
      evaluateTrumpetDynamics(healthy, healthy).outcome === "fail",
  });
  const bindingsAfter = await sourceBindings(root);
  if (canonicalJson(bindingsBefore) !== canonicalJson(bindingsAfter)) {
    throw new Error("TRUMPET_INPUT_CLOSURE_DRIFT");
  }
  const summary = summarize(cells, dynamicsCells, controls);
  const unsigned = Object.freeze({
    schema: "changes.evidence.phs5-trumpet-shipping-output.v1" as const,
    policy: TRUMPET_RELEASE_POLICY,
    algorithmIds: Object.freeze([TRUMPET_RELEASE_POLICY.algorithmId]),
    wasmSha256: CONCERT_GRAND_WASM_SHA256,
    sourceBindings: bindingsBefore,
    sourceClosureSha256: sha256Hex(canonicalJson(bindingsBefore)),
    cells: Object.freeze(cells),
    dynamicsCells: Object.freeze(dynamicsCells),
    controls,
    summary,
  });
  return Object.freeze({ ...unsigned, evidenceSha256: evidenceDigest(unsigned) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Offline re-verification for the predeploy gate: byte-frozen policy, the
 * full policy grid present, every verdict RE-DERIVED from the stored
 * features (a doctored outcome cannot pass), controls earned, source
 * closure re-hashed, and the whole body bound by evidenceSha256.
 */
export function verifyTrumpetReleaseEvidence(
  value: unknown,
): value is TrumpetReleaseEvidence {
  if (!isRecord(value) ||
    value["schema"] !== "changes.evidence.phs5-trumpet-shipping-output.v1" ||
    canonicalJson(value["policy"]) !== canonicalJson(TRUMPET_RELEASE_POLICY) ||
    !Array.isArray(value["algorithmIds"]) || !Array.isArray(value["sourceBindings"]) ||
    !Array.isArray(value["cells"]) || !Array.isArray(value["dynamicsCells"]) ||
    !isRecord(value["controls"]) || !isRecord(value["summary"]) ||
    typeof value["wasmSha256"] !== "string" ||
    typeof value["sourceClosureSha256"] !== "string" ||
    typeof value["evidenceSha256"] !== "string") return false;
  const evidence = value as unknown as TrumpetReleaseEvidence;
  if (canonicalJson(evidence.algorithmIds) !==
    canonicalJson([TRUMPET_RELEASE_POLICY.algorithmId]) ||
    !/^[0-9a-f]{64}$/u.test(evidence.wasmSha256) ||
    canonicalJson(evidence.sourceBindings.map((item) => item.path)) !==
      canonicalJson(TRUMPET_SOURCE_PATHS) ||
    evidence.sourceBindings.some((item) => !/^[0-9a-f]{64}$/u.test(item.sha256)) ||
    sha256Hex(canonicalJson(evidence.sourceBindings)) !== evidence.sourceClosureSha256) {
    return false;
  }
  const expectedCellIds = TRUMPET_RELEASE_POLICY.midi.flatMap((midi) =>
    TRUMPET_RELEASE_POLICY.velocities.map((velocity) => `m${String(midi)}v${String(velocity)}`));
  if (evidence.cells.length !== expectedCellIds.length ||
    canonicalJson(evidence.cells.map((cell) => cell.id)) !== canonicalJson(expectedCellIds)) {
    return false;
  }
  const byId = new Map<string, TrumpetOutputFeatures>();
  for (const cell of evidence.cells) {
    if (cell.algorithmId !== TRUMPET_RELEASE_POLICY.algorithmId ||
      cell.sampleRateHz !== TRUMPET_RELEASE_POLICY.sampleRateHz ||
      !/^[0-9a-f]{64}$/u.test(cell.pcmSha256) ||
      cell.outcome !== "pass" || cell.findings.length !== 0 ||
      evaluateTrumpetOutput(cell.features).length !== 0) return false;
    byId.set(cell.id, cell.features);
  }
  const expectedDynamicsIds = TRUMPET_RELEASE_POLICY.midi.map((midi) => `m${String(midi)}-dynamics`);
  if (evidence.dynamicsCells.length !== expectedDynamicsIds.length ||
    canonicalJson(evidence.dynamicsCells.map((cell) => cell.id)) !==
      canonicalJson(expectedDynamicsIds)) return false;
  for (const cell of evidence.dynamicsCells) {
    const piano = byId.get(`m${String(cell.midi)}v${String(TRUMPET_RELEASE_POLICY.velocities[0])}`);
    const forte = byId.get(`m${String(cell.midi)}v${String(TRUMPET_RELEASE_POLICY.velocities[1])}`);
    if (piano === undefined || forte === undefined) return false;
    const verdict = evaluateTrumpetDynamics(piano, forte);
    if (cell.outcome !== "pass" || verdict.outcome !== "pass" ||
      Math.abs(verdict.centroidRiseHz - cell.centroidRiseHz) > 1e-9 ||
      Math.abs(verdict.rmsRise - cell.rmsRise) > 1e-12) return false;
  }
  if (!evidence.controls.outOfTableRefused || !evidence.controls.wrongPitchRejected ||
    !evidence.controls.unperiodicRejected || !evidence.controls.clippingRejected ||
    !evidence.controls.flatDynamicsRejected) return false;
  if (canonicalJson(summarize(evidence.cells, evidence.dynamicsCells, evidence.controls)) !==
    canonicalJson(evidence.summary) || evidence.summary.outcome !== "pass") return false;
  const { evidenceSha256: claimed, ...body } = evidence;
  return claimed === evidenceDigest(body);
}

async function main(): Promise<number> {
  const root = resolve(import.meta.dir, "..");
  const evidence = await runTrumpetReleaseGate(root);
  const path = resolve(
    root,
    "release-evidence/audio/listening/trumpet-release-gate-evidence.json",
  );
  await writeFile(path, `${JSON.stringify(evidence, null, 1)}\n`);
  console.log(`${evidence.summary.outcome.toUpperCase()} cells=${String(evidence.summary.passedCellCount)} dynamics=${String(evidence.summary.passedDynamicsCellCount)} wasm=${evidence.wasmSha256}`);
  console.log(`wrote ${path}`);
  return evidence.summary.outcome === "pass" &&
    verifyTrumpetReleaseEvidence(JSON.parse(JSON.stringify(evidence))) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
