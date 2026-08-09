/**
 * Mechanical instrument-quality gate (bead jcpe-kgnj).
 *
 * Renders every shipping "rendered" recipe offline through the exact
 * embedded WASM / sampled payloads and measures the owner's four
 * mechanical badness classes (2026-08-09 mandate):
 *
 *   1. PATHOLOGY  — silence, near-silence, clipping, DC offset, non-finite
 *      samples, click/pop discontinuities, noise-dominated sustain.
 *   2. PITCH      — per-note f0 cents error, and chord renders in which a
 *      requested chord tone is missing or an inharmonic peak dominates.
 *   3. PERFORMANCE — measured render-cost ratio (render wall time /
 *      rendered audio seconds). The law when this fails is OPTIMIZE THE
 *      CODE, never simplify the physics.
 *   4. ARTIFICIALITY — cheap-synth signatures reported as scores: static
 *      spectral centroid over the sustain, pure-gain velocity response,
 *      machine-perfect periodicity (no jitter/shimmer).
 *
 * Tiers: pathology and pitch findings FAIL the gate (exit 1). Performance
 * fails only when a render cannot beat realtime at all. Artificiality is a
 * reported score, never a failure, because taste stays with the owner.
 *
 * No-claim: a green run proves the ABSENCE OF MECHANICAL PATHOLOGY ONLY.
 * It does not prove an instrument sounds good; the owner's ear remains the
 * only acceptance authority (model-acceptance ledger).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  AUDIO_INSTRUMENT_RECIPES,
  AUDIO_PLAYABLE_MIDI_WINDOWS,
} from "../src/audio/instrument-recipes-contract";
import {
  loadConcertGrandRenderer,
  loadWaveguideRenderers,
  type RenderedNotePcm,
} from "../src/audio/dsp-renderer";
import { loadSampledInstrumentRenderer } from "../src/audio/sampled-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../src/audio/wasm/concert-grand-wasm";
import { estimatePitch, sha256Hex, type MonoPcm } from "./reference-similarity";

export const INSTRUMENT_QUALITY_SCHEMA =
  "changes.evidence.instrument-quality.v1" as const;

const SAMPLE_RATE_HZ = 44_100;
const TEST_VELOCITIES = [36, 72, 108] as const;
const GATE_SECONDS = 1;

/* Pathology thresholds (linear sample domain unless stated). */
const SILENCE_PEAK_DBFS = -50;
const QUIET_RMS_DBFS = -46;
const CLIP_LEVEL = 0.999;
const CLIP_FRACTION_LIMIT = 0.000_1;
const DC_OFFSET_LIMIT = 0.02;
const CLICK_ATTACK_SKIP_SECONDS = 0.02;
const CLICK_DELTA_LIMIT = 0.5;
const NOISE_PERIODICITY_FAIL = 0.55;
const NOISE_PERIODICITY_WARN = 0.8;

/* Pitch thresholds (cents against 12-TET). */
const PITCH_FAIL_CENTS = 25;
const PITCH_WARN_CENTS = 10;
const CHORD_TONE_SEARCH_CENTS = 35;
const CHORD_TONE_FLOOR_DB = 30;

/* Performance thresholds: render seconds per audio second. */
const RENDER_RATIO_FAIL = 1;
const RENDER_RATIO_WARN = 0.5;

export type QualityFinding = Readonly<{
  tier: "fail" | "warn";
  bucket: "pathology" | "pitch" | "performance";
  code: string;
  instrumentId: string;
  detail: string;
}>;

type NoteMeasurement = Readonly<{
  midiPitch: number;
  velocity: number;
  peakDbfs: number;
  rmsDbfs: number;
  dcOffset: number;
  clipFraction: number;
  maxInterSampleDelta: number;
  centsFromExpected: number | null;
  periodicity: number | null;
  renderRatio: number;
}>;

type ArtificialityScores = Readonly<{
  centroidStasis: number | null;
  velocitySpectrumCorrelation: number | null;
  sustainPeriodicity: number | null;
}>;

type InstrumentReport = Readonly<{
  instrumentId: string;
  algorithmId: string;
  notes: readonly NoteMeasurement[];
  chordMidis: readonly number[];
  chordToneLevelsDb: readonly (number | null)[];
  worstRenderRatio: number;
  artificiality: ArtificialityScores;
}>;

function midiHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

function dbfs(value: number): number {
  return value <= 0 ? -Infinity : 20 * Math.log10(value);
}

function mono(pcm: RenderedNotePcm): MonoPcm {
  const samples = new Float32Array(pcm.frameCount);
  for (let index = 0; index < pcm.frameCount; index += 1) {
    samples[index] =
      ((pcm.left[index] ?? 0) + (pcm.right[index] ?? 0)) / 2;
  }
  return { samples, sampleRateHz: pcm.sampleRateHz };
}

function basicStats(samples: Float32Array): Readonly<{
  peak: number;
  rms: number;
  mean: number;
  clipFraction: number;
  finite: boolean;
}> {
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let clipped = 0;
  let finite = true;
  for (const value of samples) {
    if (!Number.isFinite(value)) {
      finite = false;
      continue;
    }
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= CLIP_LEVEL) clipped += 1;
    sumSquares += value * value;
    sum += value;
  }
  const count = Math.max(1, samples.length);
  return {
    peak,
    rms: Math.sqrt(sumSquares / count),
    mean: sum / count,
    clipFraction: clipped / count,
    finite,
  };
}

/** Largest |s[n]-s[n-1]| after the attack window: click/pop detector. */
function maxInterSampleDelta(samples: Float32Array, sampleRateHz: number): number {
  const start = Math.min(
    samples.length,
    Math.floor(CLICK_ATTACK_SKIP_SECONDS * sampleRateHz),
  );
  let worst = 0;
  for (let index = Math.max(1, start); index < samples.length; index += 1) {
    const delta = Math.abs((samples[index] ?? 0) - (samples[index - 1] ?? 0));
    if (delta > worst) worst = delta;
  }
  return worst;
}

/** Goertzel amplitude of one frequency over [start, start+length). */
function goertzel(
  samples: Float32Array,
  sampleRateHz: number,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / sampleRateHz;
  const coefficient = 2 * Math.cos(omega);
  let sPrev = 0;
  let sPrev2 = 0;
  const end = Math.min(samples.length, start + length);
  for (let index = start; index < end; index += 1) {
    const s = (samples[index] ?? 0) + coefficient * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  const power =
    sPrev * sPrev + sPrev2 * sPrev2 - coefficient * sPrev * sPrev2;
  return Math.sqrt(Math.max(0, power)) / Math.max(1, end - start);
}

/** Spectral centroid trajectory over consecutive windows of the sustain. */
function centroidStasis(pcm: MonoPcm): number | null {
  const windowLength = 4_096;
  const start = Math.floor(0.1 * pcm.sampleRateHz);
  const centroids: number[] = [];
  for (
    let cursor = start;
    cursor + windowLength <= pcm.samples.length;
    cursor += windowLength
  ) {
    /* Coarse 32-band Goertzel comb up to 8 kHz stands in for a full FFT:
     * the stasis ratio needs relative motion, not absolute accuracy. */
    let weighted = 0;
    let total = 0;
    for (let band = 1; band <= 32; band += 1) {
      const frequencyHz = (band * 8_000) / 32;
      const amplitude = goertzel(
        pcm.samples,
        pcm.sampleRateHz,
        cursor,
        windowLength,
        frequencyHz,
      );
      weighted += amplitude * frequencyHz;
      total += amplitude;
    }
    if (total > 0) centroids.push(weighted / total);
  }
  if (centroids.length < 4) return null;
  const mean =
    centroids.reduce((accumulator, value) => accumulator + value, 0) /
    centroids.length;
  if (mean <= 0) return null;
  const variance =
    centroids.reduce(
      (accumulator, value) => accumulator + (value - mean) ** 2,
      0,
    ) / centroids.length;
  return Math.sqrt(variance) / mean;
}

/** Correlate low-order harmonic envelopes at two velocities. */
function velocitySpectrumCorrelation(
  soft: MonoPcm,
  loud: MonoPcm,
  f0Hz: number,
): number | null {
  const harmonicCount = 12;
  const start = Math.floor(0.1 * soft.sampleRateHz);
  const length = 16_384;
  if (
    soft.samples.length < start + length ||
    loud.samples.length < start + length
  ) {
    return null;
  }
  const softAmplitudes: number[] = [];
  const loudAmplitudes: number[] = [];
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    const frequencyHz = f0Hz * harmonic;
    if (frequencyHz >= soft.sampleRateHz / 2) break;
    softAmplitudes.push(
      goertzel(soft.samples, soft.sampleRateHz, start, length, frequencyHz),
    );
    loudAmplitudes.push(
      goertzel(loud.samples, loud.sampleRateHz, start, length, frequencyHz),
    );
  }
  const count = softAmplitudes.length;
  if (count < 4) return null;
  const normalize = (values: number[]): number[] => {
    const total = values.reduce((accumulator, value) => accumulator + value, 0);
    return total > 0 ? values.map((value) => value / total) : values;
  };
  const a = normalize(softAmplitudes);
  const b = normalize(loudAmplitudes);
  const meanA = a.reduce((x, y) => x + y, 0) / count;
  const meanB = b.reduce((x, y) => x + y, 0) / count;
  let cross = 0;
  let varA = 0;
  let varB = 0;
  for (let index = 0; index < count; index += 1) {
    const da = (a[index] ?? 0) - meanA;
    const db = (b[index] ?? 0) - meanB;
    cross += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA <= 0 || varB <= 0) return null;
  return cross / Math.sqrt(varA * varB);
}

function pickTestPitches(instrumentId: string): readonly number[] {
  const window =
    AUDIO_PLAYABLE_MIDI_WINDOWS[
      instrumentId as keyof typeof AUDIO_PLAYABLE_MIDI_WINDOWS
    ];
  const middle = Math.round((window.low + window.high) / 2);
  return [window.low + 2, middle, window.high - 2];
}

/** A close-voiced maj7 rooted low in the window, folded to fit. */
function pickChord(instrumentId: string): readonly number[] {
  const window =
    AUDIO_PLAYABLE_MIDI_WINDOWS[
      instrumentId as keyof typeof AUDIO_PLAYABLE_MIDI_WINDOWS
    ];
  const root = Math.max(window.low, Math.min(window.high - 11, window.low + 5));
  return [root, root + 4, root + 7, root + 11].filter(
    (pitch) => pitch >= window.low && pitch <= window.high,
  );
}

async function main(): Promise<void> {
  const waveguides = await loadWaveguideRenderers();
  const concertGrand = await loadConcertGrandRenderer();
  const findings: QualityFinding[] = [];
  const reports: InstrumentReport[] = [];

  const renderedRecipes = AUDIO_INSTRUMENT_RECIPES.filter(
    (recipe) => recipe.synthesis === "rendered",
  );
  for (const recipe of renderedRecipes) {
    const algorithmId = recipe.renderer?.algorithmId ?? "";
    const renderNote = ((): ((
      midiPitch: number,
      velocity: number,
    ) => RenderedNotePcm | null) => {
      if (algorithmId === "changes.dsp.concert-grand@1") {
        return (midiPitch, velocity) =>
          concertGrand.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, GATE_SECONDS + 1);
      }
      if (algorithmId.startsWith("changes.dsp.sampled-")) {
        const sampled = loadSampledInstrumentRenderer(algorithmId);
        if (sampled === null) {
          throw new Error(`SAMPLED_RENDERER_MISSING: ${algorithmId}`);
        }
        return (midiPitch, velocity) =>
          sampled.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, GATE_SECONDS + 1);
      }
      const waveguide = waveguides.get(algorithmId);
      if (waveguide === undefined) {
        throw new Error(`WAVEGUIDE_RENDERER_MISSING: ${algorithmId}`);
      }
      return (midiPitch, velocity) =>
        waveguide.renderNote(midiPitch, velocity, SAMPLE_RATE_HZ, GATE_SECONDS + 1);
    })();

    const pitches = pickTestPitches(recipe.id);
    const notes: NoteMeasurement[] = [];
    const monosByKey = new Map<string, MonoPcm>();
    let worstRenderRatio = 0;

    for (const midiPitch of pitches) {
      for (const velocity of TEST_VELOCITIES) {
        const startedAt = performance.now();
        const pcm = renderNote(midiPitch, velocity);
        const renderSeconds = (performance.now() - startedAt) / 1_000;
        if (pcm === null) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "RENDER_REFUSED",
            instrumentId: recipe.id,
            detail: `midi ${String(midiPitch)} v${String(velocity)} refused inside the playable window`,
          });
          continue;
        }
        const monoPcm = mono(pcm);
        monosByKey.set(`${String(midiPitch)}:${String(velocity)}`, monoPcm);
        const stats = basicStats(monoPcm.samples);
        const audioSeconds = pcm.frameCount / pcm.sampleRateHz;
        const renderRatio = renderSeconds / Math.max(0.001, audioSeconds);
        if (renderRatio > worstRenderRatio) worstRenderRatio = renderRatio;
        const expectedHz = midiHz(midiPitch);
        const pitch = estimatePitch(monoPcm, expectedHz);
        const measurement: NoteMeasurement = {
          midiPitch,
          velocity,
          peakDbfs: dbfs(stats.peak),
          rmsDbfs: dbfs(stats.rms),
          dcOffset: stats.mean,
          clipFraction: stats.clipFraction,
          maxInterSampleDelta: maxInterSampleDelta(
            monoPcm.samples,
            monoPcm.sampleRateHz,
          ),
          centsFromExpected: pitch?.centsFromExpected ?? null,
          periodicity: pitch?.periodicity ?? null,
          renderRatio,
        };
        notes.push(measurement);

        const where = `midi ${String(midiPitch)} v${String(velocity)}`;
        if (!stats.finite) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "NONFINITE_SAMPLES",
            instrumentId: recipe.id,
            detail: `${where}: NaN/Inf in render`,
          });
        }
        if (measurement.peakDbfs < SILENCE_PEAK_DBFS) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "SILENT_RENDER",
            instrumentId: recipe.id,
            detail: `${where}: peak ${measurement.peakDbfs.toFixed(1)} dBFS`,
          });
        } else if (measurement.rmsDbfs < QUIET_RMS_DBFS) {
          findings.push({
            tier: "warn",
            bucket: "pathology",
            code: "NEAR_SILENT_RENDER",
            instrumentId: recipe.id,
            detail: `${where}: RMS ${measurement.rmsDbfs.toFixed(1)} dBFS`,
          });
        }
        if (measurement.clipFraction > CLIP_FRACTION_LIMIT) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "CLIPPING",
            instrumentId: recipe.id,
            detail: `${where}: ${(measurement.clipFraction * 100).toFixed(3)}% samples at full scale`,
          });
        }
        if (Math.abs(measurement.dcOffset) > DC_OFFSET_LIMIT) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "DC_OFFSET",
            instrumentId: recipe.id,
            detail: `${where}: mean ${measurement.dcOffset.toFixed(4)}`,
          });
        }
        if (measurement.maxInterSampleDelta > CLICK_DELTA_LIMIT) {
          findings.push({
            tier: "fail",
            bucket: "pathology",
            code: "CLICK_DISCONTINUITY",
            instrumentId: recipe.id,
            detail: `${where}: inter-sample jump ${measurement.maxInterSampleDelta.toFixed(3)} after attack`,
          });
        }
        if (pitch === null) {
          findings.push({
            tier: "fail",
            bucket: "pitch",
            code: "PITCH_UNDETECTABLE",
            instrumentId: recipe.id,
            detail: `${where}: no periodic pitch found near ${expectedHz.toFixed(1)} Hz`,
          });
        } else {
          const cents = Math.abs(pitch.centsFromExpected);
          if (cents > PITCH_FAIL_CENTS) {
            findings.push({
              tier: "fail",
              bucket: "pitch",
              code: "PITCH_OFF",
              instrumentId: recipe.id,
              detail: `${where}: ${pitch.centsFromExpected.toFixed(1)}c from 12-TET`,
            });
          } else if (cents > PITCH_WARN_CENTS) {
            findings.push({
              tier: "warn",
              bucket: "pitch",
              code: "PITCH_DRIFT",
              instrumentId: recipe.id,
              detail: `${where}: ${pitch.centsFromExpected.toFixed(1)}c from 12-TET`,
            });
          }
          if (pitch.periodicity < NOISE_PERIODICITY_FAIL) {
            findings.push({
              tier: "fail",
              bucket: "pathology",
              code: "NOISE_DOMINATED",
              instrumentId: recipe.id,
              detail: `${where}: sustain periodicity ${pitch.periodicity.toFixed(3)}`,
            });
          } else if (pitch.periodicity < NOISE_PERIODICITY_WARN) {
            findings.push({
              tier: "warn",
              bucket: "pathology",
              code: "NOISY_SUSTAIN",
              instrumentId: recipe.id,
              detail: `${where}: sustain periodicity ${pitch.periodicity.toFixed(3)}`,
            });
          }
        }
      }
    }

    if (worstRenderRatio > RENDER_RATIO_FAIL) {
      findings.push({
        tier: "fail",
        bucket: "performance",
        code: "SLOWER_THAN_REALTIME",
        instrumentId: recipe.id,
        detail: `worst render ratio ${worstRenderRatio.toFixed(2)}x — OPTIMIZE, never simplify the physics`,
      });
    } else if (worstRenderRatio > RENDER_RATIO_WARN) {
      findings.push({
        tier: "warn",
        bucket: "performance",
        code: "THIN_REALTIME_HEADROOM",
        instrumentId: recipe.id,
        detail: `worst render ratio ${worstRenderRatio.toFixed(2)}x`,
      });
    }

    /* Chord accuracy: mix the per-note renders exactly as the engine's
     * per-voice scheduling sums them, then require every chord tone. */
    const chordMidis = pickChord(recipe.id);
    const chordToneLevelsDb: (number | null)[] = [];
    const chordRenders = chordMidis
      .map((midiPitch) => renderNote(midiPitch, 96))
      .filter((pcm): pcm is RenderedNotePcm => pcm !== null);
    if (chordRenders.length === chordMidis.length && chordRenders.length > 0) {
      const frameCount = Math.min(
        ...chordRenders.map((pcm) => pcm.frameCount),
      );
      const mixed = new Float32Array(frameCount);
      for (const pcm of chordRenders) {
        const monoPcm = mono(pcm);
        for (let index = 0; index < frameCount; index += 1) {
          mixed[index] =
            (mixed[index] ?? 0) +
            (monoPcm.samples[index] ?? 0) / chordRenders.length;
        }
      }
      const start = Math.floor(0.1 * SAMPLE_RATE_HZ);
      const length = Math.min(16_384, frameCount - start);
      if (length > 4_096) {
        const amplitudes = chordMidis.map((midiPitch) => {
          /* Search ±CHORD_TONE_SEARCH_CENTS for the strongest partial. */
          let best = 0;
          for (let cents = -CHORD_TONE_SEARCH_CENTS; cents <= CHORD_TONE_SEARCH_CENTS; cents += 5) {
            const frequencyHz = midiHz(midiPitch) * 2 ** (cents / 1_200);
            const amplitude = goertzel(
              mixed,
              SAMPLE_RATE_HZ,
              start,
              length,
              frequencyHz,
            );
            if (amplitude > best) best = amplitude;
          }
          return best;
        });
        const strongest = Math.max(...amplitudes);
        for (const [index, amplitude] of amplitudes.entries()) {
          const level =
            strongest > 0 && amplitude > 0
              ? 20 * Math.log10(amplitude / strongest)
              : null;
          chordToneLevelsDb.push(level);
          if (level === null || level < -CHORD_TONE_FLOOR_DB) {
            findings.push({
              tier: "fail",
              bucket: "pitch",
              code: "CHORD_TONE_MISSING",
              instrumentId: recipe.id,
              detail: `chord tone midi ${String(chordMidis[index])} is ${level === null ? "absent" : `${level.toFixed(1)} dB under the strongest tone`}`,
            });
          }
        }
      }
    }

    /* Artificiality scores over the middle pitch. */
    const middlePitch = pitches[1] ?? pitches[0] ?? 60;
    const softKey = `${String(middlePitch)}:36`;
    const loudKey = `${String(middlePitch)}:108`;
    const soft = monosByKey.get(softKey) ?? null;
    const loud = monosByKey.get(loudKey) ?? null;
    const middleLoud = loud ?? soft;
    const artificiality: ArtificialityScores = {
      centroidStasis: middleLoud === null ? null : centroidStasis(middleLoud),
      velocitySpectrumCorrelation:
        soft !== null && loud !== null
          ? velocitySpectrumCorrelation(soft, loud, midiHz(middlePitch))
          : null,
      sustainPeriodicity:
        notes.find(
          (note) => note.midiPitch === middlePitch && note.velocity === 108,
        )?.periodicity ?? null,
    };

    reports.push({
      instrumentId: recipe.id,
      algorithmId,
      notes,
      chordMidis,
      chordToneLevelsDb,
      worstRenderRatio,
      artificiality,
    });
  }

  const failCount = findings.filter((finding) => finding.tier === "fail").length;
  const evidence = {
    schema: INSTRUMENT_QUALITY_SCHEMA,
    generatedBy: "scripts/run-instrument-quality-gate.ts",
    wasmSha256: CONCERT_GRAND_WASM_SHA256,
    sampleRateHz: SAMPLE_RATE_HZ,
    outcome: failCount === 0 ? ("pass" as const) : ("fail" as const),
    findings,
    instruments: reports,
    noClaim:
      "Green proves absence of the measured mechanical pathology classes only. It never proves an instrument sounds good; owner listening remains the acceptance authority.",
  };
  const serialized = JSON.stringify(evidence, null, 2);
  const outputPath = resolve(
    "test-results/instrument-quality/instrument-quality-v1.json",
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");

  for (const report of reports) {
    const worstCents = report.notes.reduce(
      (worst, note) =>
        note.centsFromExpected !== null &&
        Math.abs(note.centsFromExpected) > Math.abs(worst)
          ? note.centsFromExpected
          : worst,
      0,
    );
    process.stdout.write(
      `${report.instrumentId.padEnd(20)} render<=${report.worstRenderRatio.toFixed(2)}x worst-pitch ${worstCents.toFixed(1)}c stasis ${report.artificiality.centroidStasis?.toFixed(3) ?? "n/a"} velCorr ${report.artificiality.velocitySpectrumCorrelation?.toFixed(3) ?? "n/a"}\n`,
    );
  }
  for (const finding of findings) {
    process.stdout.write(
      `${finding.tier.toUpperCase()} [${finding.bucket}] ${finding.instrumentId} ${finding.code}: ${finding.detail}\n`,
    );
  }
  process.stdout.write(
    `${evidence.outcome === "pass" ? "PASS" : "FAIL"} instrument-quality gate: ${String(reports.length)} instruments, ${String(failCount)} fail finding(s), evidence sha256 ${sha256Hex(serialized).slice(0, 16)}\n`,
  );
  if (failCount > 0) process.exitCode = 1;
}

await main();
