/**
 * Independent proof for the physically modeled waveguide renderers
 * (X0 §5.4). Pitch assertions use a Goertzel comb the renderers do not
 * contain; stability and profile-voicing laws are asserted on measured
 * output, not on internals.
 */
import { describe, expect, test } from "bun:test";

import {
  PLUCKED_UPRIGHT_BASS_ALGORITHM_ID,
  WAVEGUIDE_CLARINET_ALGORITHM_ID,
  WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
  WAVEGUIDE_FLUTE_ALGORITHM_ID,
  WAVEGUIDE_FLUTE_V2_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID,
  WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID,
  loadWaveguideRenderers,
  type WaveguideRenderer,
} from "../../src/audio/dsp-renderer";
import { CONCERT_GRAND_WASM_SHA256 } from "../../src/audio/wasm/concert-grand-wasm";

const OUTPUT_RATE_HZ = 48_000;

function midiFrequencyHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12);
}

function goertzelAmplitude(
  samples: Float32Array,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / OUTPUT_RATE_HZ;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let beforePrevious = 0;
  const end = Math.min(start + length, samples.length);
  const count = end - start;
  for (let index = 0; index < count; index += 1) {
    const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (count - 1));
    const sample = (samples[start + index] ?? 0) * taper;
    const current = sample + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return Math.sqrt(
    Math.max(
      0,
      previous * previous +
        beforePrevious * beforePrevious -
        coefficient * previous * beforePrevious,
    ),
  );
}

/** Best harmonic-comb cents deviation in a +-90 cent scan. */
function measuredCents(
  samples: Float32Array,
  start: number,
  midiPitch: number,
): number {
  const f0 = midiFrequencyHz(midiPitch);
  /* A fixed 16,384-frame window spans only fourteen E1 cycles and can land
   * inside the upright body's slow 38/48 Hz beat, reporting a transient
   * seven-cent offset for an exactly tuned string. Preserve that minimum for
   * the rest of the register, but require 24 fundamental cycles for bass. */
  const analysisLength = Math.max(16_384, Math.ceil((24 * OUTPUT_RATE_HZ) / f0));
  let best = 0;
  let bestCents = 0;
  for (let cents = -90; cents <= 90; cents += 1) {
    const candidate = f0 * 2 ** (cents / 1_200);
    let score = 0;
    for (const partial of [1, 2, 3, 4]) {
      const frequency = candidate * partial;
      if (frequency > OUTPUT_RATE_HZ / 2.5) break;
      score += goertzelAmplitude(samples, start, analysisLength, frequency) / partial;
    }
    if (score > best) {
      best = score;
      bestCents = cents;
    }
  }
  return bestCents;
}

function rms(samples: Float32Array, start: number, length: number): number {
  const end = Math.min(start + length, samples.length);
  let energy = 0;
  for (let index = start; index < end; index += 1) {
    energy += (samples[index] ?? 0) ** 2;
  }
  return Math.sqrt(energy / Math.max(1, end - start));
}

function attackToSustainSeconds(samples: Float32Array, sampleRateHz: number): number | null {
  const hop = Math.max(1, Math.round(sampleRateHz * 0.005));
  const window = Math.max(hop, Math.round(sampleRateHz * 0.010));
  const envelope: number[] = [];
  for (let start = 0; start + window <= samples.length; start += hop) {
    envelope.push(rms(samples, start, window));
  }
  const sustainStart = Math.floor(0.4 / 0.005);
  const sustainEnd = Math.min(envelope.length, Math.ceil(1.0 / 0.005));
  const sustain = envelope
    .slice(sustainStart, sustainEnd)
    .sort((left, right) => left - right);
  if (sustain.length === 0) return null;
  const sustainLevel = sustain[Math.floor(sustain.length / 2)] ?? 0;
  if (!(sustainLevel > 0)) return null;
  const persistentCrossing = (threshold: number, from: number): number | null => {
    for (let index = from; index + 2 < envelope.length; index += 1) {
      if (
        (envelope[index] ?? 0) >= threshold &&
        (envelope[index + 1] ?? 0) >= threshold &&
        (envelope[index + 2] ?? 0) >= threshold
      ) {
        return index;
      }
    }
    return null;
  };
  const onset = persistentCrossing(0.05 * sustainLevel, 0);
  if (onset === null) return null;
  const atNinety = persistentCrossing(0.90 * sustainLevel, onset);
  if (atNinety === null) return null;
  return ((atNinety - onset) * hop) / sampleRateHz;
}

const renderers = await loadWaveguideRenderers();

function renderer(algorithmId: string): WaveguideRenderer {
  const found = renderers.get(algorithmId);
  if (found === undefined) throw new Error(`TEST_RENDERER_MISSING: ${algorithmId}`);
  return found;
}

const clean = renderer(WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID);
const drive = renderer(WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID);
const flute = renderer(WAVEGUIDE_FLUTE_ALGORITHM_ID);
const clarinet = renderer(WAVEGUIDE_CLARINET_ALGORITHM_ID);
const clarinetV2 = renderer(WAVEGUIDE_CLARINET_V2_ALGORITHM_ID);
const fluteV2 = renderer(WAVEGUIDE_FLUTE_V2_ALGORITHM_ID);
const uprightBass = renderer(PLUCKED_UPRIGHT_BASS_ALGORITHM_ID);

describe("waveguide renderer laws", () => {
  test("the map carries exactly the reviewed waveguide algorithms, pinned to the wasm payload", () => {
    expect([...renderers.keys()].sort()).toEqual([
      /* PHS4 plucked family (jcpe-mnsc.6.2, reviewed registry amendment). */
      "changes.dsp.plucked-archtop@2",
      "changes.dsp.plucked-dreadnought@1",
      "changes.dsp.plucked-electric@2",
      "changes.dsp.plucked-ukulele@1",
      "changes.dsp.plucked-upright-bass@1",
      /* Physical vibraphone (jcpe-sample-elimination-physical-qzgo). */
      "changes.dsp.vibes@2",
      WAVEGUIDE_CLARINET_ALGORITHM_ID,
      WAVEGUIDE_CLARINET_V2_ALGORITHM_ID,
      WAVEGUIDE_FLUTE_ALGORITHM_ID,
      WAVEGUIDE_FLUTE_V2_ALGORITHM_ID,
      WAVEGUIDE_GUITAR_CLEAN_ALGORITHM_ID,
      WAVEGUIDE_GUITAR_DRIVE_ALGORITHM_ID,
    ]);
    for (const entry of renderers.values()) {
      expect(entry.wasmSha256).toBe(CONCERT_GRAND_WASM_SHA256);
    }
  });

  test("out-of-contract requests return null, in-contract renders sound", () => {
    for (const subject of [clean, drive, flute, clarinet, clarinetV2]) {
      expect(subject.renderNote(20, 64, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(109, 64, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(60, 0, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(60, 128, OUTPUT_RATE_HZ)).toBeNull();
      expect(subject.renderNote(60, 64, 7_999)).toBeNull();
      for (const midiPitch of [21, 40, 64, 88, 108]) {
        const pcm = subject.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 0.5);
        expect(pcm).not.toBeNull();
        if (pcm !== null) {
          expect(rms(pcm.left, 0, pcm.frameCount)).toBeGreaterThan(1e-4);
        }
      }
    }
  });

  test("flute v2 host ABI supplies variation and articulation before output pointers", () => {
    const pcm = fluteV2.renderNote(72, 72, OUTPUT_RATE_HZ, 0.5);
    expect(pcm).not.toBeNull();
    if (pcm === null) return;
    expect(pcm.frameCount).toBe(24_000);
    expect(rms(pcm.left, 0, pcm.frameCount)).toBeGreaterThan(1e-4);
  });

  test("upright-bass host ABI routes the physical pack across its reviewed range", () => {
    expect(uprightBass.renderNote(27, 100, OUTPUT_RATE_HZ, 0.5)).toBeNull();
    expect(uprightBass.renderNote(68, 100, OUTPUT_RATE_HZ, 0.5)).toBeNull();
    for (const midiPitch of [28, 40, 52, 67]) {
      const pcm = uprightBass.renderNote(midiPitch, 100, OUTPUT_RATE_HZ, 0.75);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      expect(pcm.frameCount).toBe(36_000);
      expect(rms(pcm.left, 0, pcm.frameCount)).toBeGreaterThan(1e-3);
      expect(Math.abs(measuredCents(pcm.left, 2_400, midiPitch))).toBeLessThanOrEqual(5);
    }
  });

  test("guitar lands on 12-TET within two cents through both amps", () => {
    for (const subject of [clean, drive]) {
      for (const midiPitch of [40, 52, 64, 76]) {
        const pcm = subject.renderNote(midiPitch, 96, OUTPUT_RATE_HZ);
        expect(pcm).not.toBeNull();
        if (pcm === null) continue;
        expect(
          Math.abs(measuredCents(pcm.left, Math.floor(0.05 * OUTPUT_RATE_HZ), midiPitch)),
        ).toBeLessThanOrEqual(2);
      }
    }
  });

  test("flute lands within twenty cents across its register", () => {
    for (const midiPitch of [55, 60, 65, 72, 79, 84, 91]) {
      const pcm = flute.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 2);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      expect(
        Math.abs(measuredCents(pcm.left, Math.floor(0.8 * OUTPUT_RATE_HZ), midiPitch)),
      ).toBeLessThanOrEqual(20);
    }
  });

  test("a plucked string only ever loses energy", () => {
    for (const subject of [clean, drive]) {
      for (const midiPitch of [45, 64, 83]) {
        const pcm = subject.renderNote(midiPitch, 96, OUTPUT_RATE_HZ);
        expect(pcm).not.toBeNull();
        if (pcm === null) continue;
        const early = rms(pcm.left, 0, Math.floor(0.15 * OUTPUT_RATE_HZ));
        const late = rms(
          pcm.left,
          Math.floor(0.9 * OUTPUT_RATE_HZ),
          Math.floor(0.2 * OUTPUT_RATE_HZ),
        );
        expect(late).toBeLessThan(early);
      }
    }
  });

  test("the twang chain passes measurably more top end than the dark archtop chain", () => {
    /* The two amp voicings differ in their cab rolloffs (6.5 kHz vs
     * 4.2 kHz): on the same pluck, the second profile must transmit more
     * 4-6 kHz relative to its low-mid body than the first. */
    let brighter = 0;
    const probes = [45, 57, 69];
    for (const midiPitch of probes) {
      const cleanPcm = clean.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 1);
      const twangPcm = drive.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 1);
      expect(cleanPcm).not.toBeNull();
      expect(twangPcm).not.toBeNull();
      if (cleanPcm === null || twangPcm === null) continue;
      const start = Math.floor(0.02 * OUTPUT_RATE_HZ);
      const ratio = (pcm: Float32Array): number => {
        let top = 0;
        let body = 0;
        for (let f = 4_000; f < 6_000; f += 400) {
          top += goertzelAmplitude(pcm, start, 8_192, f);
        }
        for (let f = 200; f < 800; f += 120) {
          body += goertzelAmplitude(pcm, start, 8_192, f);
        }
        return top / Math.max(body, 1e-9);
      };
      if (ratio(twangPcm.left) > ratio(cleanPcm.left)) brighter += 1;
    }
    expect(brighter).toBeGreaterThanOrEqual(2);
  });

  test("clarinet lands within fifteen cents in its written register and is odd-harmonic dominant", () => {
    for (const midiPitch of [52, 58, 64, 70, 76, 84]) {
      const pcm = clarinet.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 2);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      const start = Math.floor(0.8 * OUTPUT_RATE_HZ);
      const cents = measuredCents(pcm.left, start, midiPitch);
      expect(Math.abs(cents)).toBeLessThanOrEqual(15);
      const f0 = midiFrequencyHz(midiPitch) * 2 ** (cents / 1_200);
      const h2 = goertzelAmplitude(pcm.left, start, 16_384, f0 * 2);
      const h3 = goertzelAmplitude(pcm.left, start, 16_384, f0 * 3);
      /* The closed-open bore's signature: the third harmonic outweighs
       * the second. */
      expect(h3).toBeGreaterThan(h2);
    }
  });

  test("clarinet v2 dynamic reed remains tuned, finite, odd-dominant, and audibly distinct", () => {
    for (const midiPitch of [52, 64, 76, 84]) {
      const v2 = clarinetV2.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 2, 3, "tongued");
      const legacy = clarinet.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 2, 3, "tongued");
      expect(v2).not.toBeNull();
      expect(legacy).not.toBeNull();
      if (v2 === null || legacy === null) continue;
      expect(v2.left.every(Number.isFinite)).toBe(true);
      expect(v2.left).not.toEqual(legacy.left);
      const start = Math.floor(0.8 * OUTPUT_RATE_HZ);
      const cents = measuredCents(v2.left, start, midiPitch);
      if (Math.abs(cents) > 20) {
        throw new Error(`PHS2_V2_TUNING:${String(midiPitch)}:${String(cents)}`);
      }
      const f0 = midiFrequencyHz(midiPitch) * 2 ** (cents / 1_200);
      expect(goertzelAmplitude(v2.left, start, 16_384, f0 * 3)).toBeGreaterThan(
        goertzelAmplitude(v2.left, start, 16_384, f0 * 2),
      );
      const replay = clarinetV2.renderNote(midiPitch, 96, OUTPUT_RATE_HZ, 2, 3, "tongued");
      expect(replay?.left).toEqual(v2.left);
    }
  });

  test("clarinet v2 launches inside the candidate physical attack interval", () => {
    const failures: string[] = [];
    for (const sampleRateHz of [44_100, 48_000, 96_000]) {
      for (const midiPitch of [50, 62, 66, 72, 74, 76, 79, 82, 84, 89]) {
        for (const velocity of [1, 36, 64, 72, 108, 127]) {
          const pcm = clarinetV2.renderNote(
            midiPitch,
            velocity,
            sampleRateHz,
            2,
            3,
            "tongued",
          );
          expect(pcm).not.toBeNull();
          if (pcm === null) continue;
          const attack = attackToSustainSeconds(pcm.left, sampleRateHz);
          expect(attack).not.toBeNull();
          if (attack === null) continue;
          if (attack < 0.015 || attack > 0.180) {
            failures.push(
              `${String(sampleRateHz)}/${String(midiPitch)}/${String(velocity)}=${attack.toFixed(3)}s`,
            );
          }
        }
      }
    }
    expect(failures).toEqual([]);
    /*
     * 180 renders measure ~13s alone; the sampled-payload modules restored
     * by jcpe-3q4c add module-parse seconds to the import graph, so the
     * wall budget carries headroom. Wall time is never a musical law.
     */
  }, 30_000);

  test("clarinet v2 articulation changes the onset without selecting a different sustain attractor", () => {
    const failures: string[] = [];
    for (const midiPitch of [50, 62, 74]) {
      for (const velocity of [36, 108]) {
        const tongued = clarinetV2.renderNote(
          midiPitch, velocity, OUTPUT_RATE_HZ, 1.75, 0, "tongued",
        );
        const legato = clarinetV2.renderNote(
          midiPitch, velocity, OUTPUT_RATE_HZ, 1.75, 0, "legato",
        );
        expect(tongued).not.toBeNull();
        expect(legato).not.toBeNull();
        if (tongued === null || legato === null) continue;
        const window = Math.round(0.5 * OUTPUT_RATE_HZ);
        const start = Math.round(1.0 * OUTPUT_RATE_HZ);
        const tonguedSustain = rms(tongued.left, start, window);
        const legatoSustain = rms(legato.left, start, window);
        const ratio = tonguedSustain / legatoSustain;
        if (ratio < 0.75 || ratio > 1.333_334) {
          failures.push(
            `${String(midiPitch)}/${String(velocity)} ratio=${ratio.toFixed(3)}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("clarinet v2 hands off complete bounded phrase state and rejects incompatible state", () => {
    const renderPhrase = clarinetV2.renderPhraseSegment;
    expect(renderPhrase).toBeDefined();
    if (renderPhrase === undefined) return;
    const first = renderPhrase(64, 92, OUTPUT_RATE_HZ, 2_400, null, 0, "tongued");
    expect(first).not.toBeNull();
    if (first === null) return;
    expect(first.stateOutput.byteLength).toBeGreaterThan(176);
    expect(first.stateOutput.byteLength).toBeLessThanOrEqual(262_144);

    const continued = renderPhrase(
      67, 92, OUTPUT_RATE_HZ, 2_400, first.stateOutput, 0, "legato",
    );
    const replayed = renderPhrase(
      67, 92, OUTPUT_RATE_HZ, 2_400, first.stateOutput, 0, "legato",
    );
    const reset = renderPhrase(67, 92, OUTPUT_RATE_HZ, 2_400, null, 0, "legato");
    expect(continued).not.toBeNull();
    expect(replayed).not.toBeNull();
    expect(reset).not.toBeNull();
    if (continued === null || replayed === null || reset === null) return;
    expect(continued.left.every(Number.isFinite)).toBe(true);
    expect(continued.left).toEqual(replayed.left);
    expect(continued.stateOutput).toEqual(replayed.stateOutput);
    expect(continued.left).not.toEqual(reset.left);

    /* MIDI 67 leaves hole zero closed and hole one open. Scalar slot eight is
     * that independently retained open-hole radiation filter; a finite state
     * mutation must be consumed rather than ignored. */
    const holeStateMutation = first.stateOutput.slice();
    new DataView(holeStateMutation.buffer).setFloat64(32 + 8 * 8, 0.5, true);
    const changedHoleState = renderPhrase(
      67, 92, OUTPUT_RATE_HZ, 2_400, holeStateMutation, 0, "legato",
    );
    expect(changedHoleState).not.toBeNull();
    expect(changedHoleState?.left).not.toEqual(continued.left);

    expect(
      renderPhrase(67, 92, 44_100, 2_400, first.stateOutput, 0, "legato"),
    ).toBeNull();
    const mutated = first.stateOutput.slice();
    mutated[0] = (mutated[0] ?? 0) ^ 0xff;
    expect(
      renderPhrase(67, 92, OUTPUT_RATE_HZ, 2_400, mutated, 0, "legato"),
    ).toBeNull();
  });

  test("flute brightens as it is blown harder", () => {
    const soft = flute.renderNote(72, 30, OUTPUT_RATE_HZ, 2);
    const hard = flute.renderNote(72, 120, OUTPUT_RATE_HZ, 2);
    expect(soft).not.toBeNull();
    expect(hard).not.toBeNull();
    if (soft === null || hard === null) return;
    const start = Math.floor(0.8 * OUTPUT_RATE_HZ);
    const f0 = midiFrequencyHz(72);
    const softUpper =
      goertzelAmplitude(soft.left, start, 16_384, f0 * 3) /
      Math.max(goertzelAmplitude(soft.left, start, 16_384, f0), 1e-9);
    const hardUpper =
      goertzelAmplitude(hard.left, start, 16_384, f0 * 3) /
      Math.max(goertzelAmplitude(hard.left, start, 16_384, f0), 1e-9);
    expect(hardUpper).toBeGreaterThan(softUpper);
  });

  test("rendering is deterministic and truncation cannot click", () => {
    const first = drive.renderNote(52, 80, OUTPUT_RATE_HZ, 0.5);
    const second = drive.renderNote(52, 80, OUTPUT_RATE_HZ, 0.5);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) return;
    expect(Array.from(first.left)).toEqual(Array.from(second.left));
    expect(first.frameCount).toBe(Math.round(0.5 * OUTPUT_RATE_HZ));
    expect(Math.abs(first.left[first.frameCount - 1] ?? 1)).toBeLessThan(1e-3);
  });
});
