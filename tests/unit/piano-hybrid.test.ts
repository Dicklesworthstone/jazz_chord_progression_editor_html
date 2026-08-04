/**
 * jcpe-l751 evidence: the Concert Grand renders a HYBRID — a recorded
 * hammer strike crossfaded into the synthesized sustain — and the seam is
 * inaudible, deterministic, and inside the peak guard.
 *
 * The oracles here are written test-side and share no code with the audio
 * runtime: an independent slice-index walk, a Goertzel filter for pitch, a
 * radix-2 FFT for the spectral centroid, and a first-difference scan for the
 * discontinuity check. Production output cannot certify itself.
 */
import { describe, expect, test } from "bun:test";

import { estimateCents } from "../../scripts/build-piano-samples";
import {
  loadConcertGrandRenderer,
  PIANO_ATTACK_LAYER_POLICY,
  type RenderedNotePcm,
} from "../../src/audio/dsp-renderer";
import {
  PIANO_ATTACK_SAMPLES_ATTRIBUTION,
  PIANO_ATTACK_SAMPLES_BYTE_LENGTH,
  PIANO_ATTACK_SAMPLES_LICENSE,
  PIANO_ATTACK_SAMPLE_RATE_HZ,
  PIANO_ATTACK_SLICE_FRAMES,
  PIANO_ATTACK_SLICE_INDEX,
} from "../../src/audio/wasm/piano-attack-samples";

const SAMPLE_RATE = 48_000;

/** Pitch inside the sampled set; pitch outside it must still render. */
const SAMPLED_PITCHES = [36, 48, 55, 60, 64, 67, 72, 81] as const;

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

async function renderOrThrow(
  midi: number,
  velocity: number,
): Promise<RenderedNotePcm> {
  const renderer = await loadConcertGrandRenderer();
  const pcm = renderer.renderNote(midi, velocity, SAMPLE_RATE);
  if (pcm === null) throw new Error("RENDER_REFUSED");
  return pcm;
}

async function renderSynthOrThrow(
  midi: number,
  velocity: number,
): Promise<RenderedNotePcm> {
  const renderer = await loadConcertGrandRenderer();
  const pcm = renderer.renderSynthesizedNote(midi, velocity, SAMPLE_RATE);
  if (pcm === null) throw new Error("RENDER_REFUSED");
  return pcm;
}

function frameAt(seconds: number): number {
  return Math.round(seconds * SAMPLE_RATE);
}

function peakOf(pcm: RenderedNotePcm): number {
  let peak = 0;
  for (let index = 0; index < pcm.frameCount; index += 1) {
    const left = Math.abs(pcm.left[index] ?? 0);
    const right = Math.abs(pcm.right[index] ?? 0);
    if (left > peak) peak = left;
    if (right > peak) peak = right;
  }
  return peak;
}

/** Largest step between neighbouring samples inside a window. */
function largestStep(
  channel: Float32Array,
  from: number,
  to: number,
): number {
  let largest = 0;
  for (let index = from + 1; index < to; index += 1) {
    const step = Math.abs((channel[index] ?? 0) - (channel[index - 1] ?? 0));
    if (step > largest) largest = step;
  }
  return largest;
}

/** Root-mean-square over a window; the level oracle for the seam check. */
function windowRms(channel: Float32Array, from: number, to: number): number {
  let total = 0;
  for (let index = from; index < to; index += 1) {
    const value = channel[index] ?? 0;
    total += value * value;
  }
  return Math.sqrt(total / Math.max(1, to - from));
}

/** Hann-windowed single-bin power: the Goertzel recurrence. */
function goertzelPower(
  channel: Float32Array,
  start: number,
  length: number,
  frequencyHz: number,
): number {
  const omega = (2 * Math.PI * frequencyHz) / SAMPLE_RATE;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let beforePrevious = 0;
  for (let index = 0; index < length; index += 1) {
    const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    const sample = (channel[start + index] ?? 0) * taper;
    const current = sample + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return (
    previous * previous +
    beforePrevious * beforePrevious -
    coefficient * previous * beforePrevious
  );
}

/** Iterative radix-2 FFT over a Hann-windowed frame, written test-side. */
function hannSpectrum(
  channel: Float32Array,
  start: number,
  size: number,
): Float64Array {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
    real[index] = (channel[start + index] ?? 0) * taper;
  }
  for (let index = 1, mirror = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; (mirror & bit) !== 0; bit >>= 1) mirror ^= bit;
    mirror ^= bit;
    if (index < mirror) {
      const swapReal = real[index] ?? 0;
      real[index] = real[mirror] ?? 0;
      real[mirror] = swapReal;
      const swapImaginary = imaginary[index] ?? 0;
      imaginary[index] = imaginary[mirror] ?? 0;
      imaginary[mirror] = swapImaginary;
    }
  }
  for (let span = 2; span <= size; span <<= 1) {
    const angle = (-2 * Math.PI) / span;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let base = 0; base < size; base += span) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < span / 2; offset += 1) {
        const low = base + offset;
        const high = low + span / 2;
        const oddReal =
          (real[high] ?? 0) * twiddleReal - (imaginary[high] ?? 0) * twiddleImaginary;
        const oddImaginary =
          (real[high] ?? 0) * twiddleImaginary + (imaginary[high] ?? 0) * twiddleReal;
        const evenReal = real[low] ?? 0;
        const evenImaginary = imaginary[low] ?? 0;
        real[low] = evenReal + oddReal;
        imaginary[low] = evenImaginary + oddImaginary;
        real[high] = evenReal - oddReal;
        imaginary[high] = evenImaginary - oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  const magnitudes = new Float64Array(size / 2);
  for (let bin = 0; bin < size / 2; bin += 1) {
    magnitudes[bin] = Math.hypot(real[bin] ?? 0, imaginary[bin] ?? 0);
  }
  return magnitudes;
}

/** Magnitude-weighted mean frequency of a window. */
function spectralCentroid(
  channel: Float32Array,
  start: number,
  size: number,
): number {
  const magnitudes = hannSpectrum(channel, start, size);
  let weighted = 0;
  let total = 0;
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    const magnitude = magnitudes[bin] ?? 0;
    weighted += ((bin * SAMPLE_RATE) / size) * magnitude;
    total += magnitude;
  }
  return total > 0 ? weighted / total : 0;
}

describe("jcpe-l751 hybrid piano attack layer", () => {
  test("the embedded slice index is a well-formed, non-overlapping layout", () => {
    expect(PIANO_ATTACK_SLICE_INDEX.length).toBeGreaterThan(0);
    const stride = PIANO_ATTACK_SLICE_FRAMES * 2;
    let expectedOffset = 0;
    const seen = new Set<string>();
    for (const slice of PIANO_ATTACK_SLICE_INDEX) {
      expect(slice.frameCount).toBe(PIANO_ATTACK_SLICE_FRAMES);
      expect(slice.byteOffset).toBe(expectedOffset);
      expect(slice.midiPitch).toBeGreaterThanOrEqual(21);
      expect(slice.midiPitch).toBeLessThanOrEqual(108);
      expect(slice.lowVelocity).toBeLessThanOrEqual(slice.highVelocity);
      expect(slice.sourceChannel === 0 || slice.sourceChannel === 1).toBe(true);
      expect(Math.abs(slice.tuningCents)).toBeLessThanOrEqual(100);
      const key = `${String(slice.midiPitch)}:${String(slice.velocityBucket)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expectedOffset += stride;
    }
    expect(expectedOffset).toBe(PIANO_ATTACK_SAMPLES_BYTE_LENGTH);
    /* Every MIDI velocity is served by exactly one bucket. */
    for (let velocity = 1; velocity <= 127; velocity += 1) {
      const buckets = new Set(
        PIANO_ATTACK_SLICE_INDEX.filter(
          (slice) =>
            velocity >= slice.lowVelocity && velocity <= slice.highVelocity,
        ).map((slice) => slice.velocityBucket),
      );
      expect(buckets.size).toBe(1);
    }
  });

  test("the payload carries its CC-BY credit", () => {
    expect(PIANO_ATTACK_SAMPLES_LICENSE).toBe("CC-BY-3.0");
    expect(PIANO_ATTACK_SAMPLES_ATTRIBUTION).toBe(
      "Salamander Grand Piano V3 by Alexander Holm, CC-BY-3.0",
    );
    expect(PIANO_ATTACK_SAMPLE_RATE_HZ).toBe(44_100);
  });

  test("hybrid renders are bit-deterministic across calls", async () => {
    for (const midi of [36, 60, 87] as const) {
      const first = await renderOrThrow(midi, 96);
      const second = await renderOrThrow(midi, 96);
      expect(second.frameCount).toBe(first.frameCount);
      expect(
        Buffer.from(second.left.buffer).equals(Buffer.from(first.left.buffer)),
      ).toBe(true);
      expect(
        Buffer.from(second.right.buffer).equals(
          Buffer.from(first.right.buffer),
        ),
      ).toBe(true);
    }
  });

  test("the sampled layer is really used: hybrid differs from pure synthesis", async () => {
    for (const midi of SAMPLED_PITCHES) {
      const renderer = await loadConcertGrandRenderer();
      expect(renderer.attackSliceFor(midi, 96)).not.toBeNull();
      const hybrid = await renderOrThrow(midi, 96);
      const synth = await renderSynthOrThrow(midi, 96);
      expect(hybrid.frameCount).toBe(synth.frameCount);

      /* The attack window is a different signal, by a wide margin. */
      const from = frameAt(0.005);
      const to = frameAt(0.15);
      let difference = 0;
      let reference = 0;
      for (let index = from; index < to; index += 1) {
        const delta = (hybrid.left[index] ?? 0) - (synth.left[index] ?? 0);
        difference += delta * delta;
        reference += (synth.left[index] ?? 0) ** 2;
      }
      expect(Math.sqrt(difference / reference)).toBeGreaterThan(0.5);

      /* And the sustain past the crossfade is untouched. */
      const sustainFrom = frameAt(
        PIANO_ATTACK_LAYER_POLICY.crossfadeEndSeconds + 0.01,
      );
      for (let index = sustainFrom; index < sustainFrom + 4_096; index += 1) {
        expect(hybrid.left[index]).toBe(synth.left[index]);
        expect(hybrid.right[index]).toBe(synth.right[index]);
      }
    }
  });

  test("the recorded attack raises the early spectral centroid", async () => {
    /* The complaint this layer answers: synthesis alone had no hammer. */
    for (const midi of [48, 55, 60, 64, 67] as const) {
      const hybrid = await renderOrThrow(midi, 96);
      const synth = await renderSynthOrThrow(midi, 96);
      const start = frameAt(0.004);
      const length = 4_096;
      const hybridCentroid = spectralCentroid(hybrid.left, start, length);
      const synthCentroid = spectralCentroid(synth.left, start, length);
      expect(hybridCentroid).toBeGreaterThan(synthCentroid * 1.2);
    }
  });

  test("the crossfade has no level discontinuity", async () => {
    for (const midi of [36, 48, 60, 72, 84] as const) {
      const hybrid = await renderOrThrow(midi, 96);
      const from = frameAt(0.15);
      const to = frameAt(0.35);
      expect(largestStep(hybrid.left, from, to)).toBeLessThanOrEqual(0.15);
      expect(largestStep(hybrid.right, from, to)).toBeLessThanOrEqual(0.15);

      /*
       * And no level step either: the 20 ms windows straddling the end of
       * the crossfade must stay within 3 dB of each other.
       */
      const seam = frameAt(PIANO_ATTACK_LAYER_POLICY.crossfadeEndSeconds);
      const span = frameAt(0.02);
      const before = windowRms(hybrid.left, seam - span, seam);
      const after = windowRms(hybrid.left, seam, seam + span);
      expect(before).toBeGreaterThan(0);
      expect(after).toBeGreaterThan(0);
      const decibels = Math.abs(20 * Math.log10(after / before));
      expect(decibels).toBeLessThan(3);
    }
  });

  test("the crossfade midpoint holds its level: the layers do not cancel", async () => {
    /*
     * Model-free oracle for the handover.
     *
     * The decay correction unwinds to unity by the centre of the seam
     * window, which is exactly the crossfade midpoint, so at that instant
     * the two layers are matched in level by construction and a correct
     * fade reproduces that level: the hybrid must measure what the pure
     * synthesis measures. It does not follow automatically. The layers are
     * the same note, both start at the onset, and the build-time stretch
     * correction puts their fundamentals on one frequency, so their
     * relative phase is fixed for the whole handover and a naive
     * cosine/sine pair lets them cancel — a hole, not a fade.
     *
     * Swept over the keyboard because the cancellation is per-note: the
     * relative phase is whatever the recording and the model happen to
     * start with. Measured over all 88 keys at five velocities, a plain
     * equal-power fade leaves 109 of 440 pairs more than 3 dB out, worst
     * -14.4 dB, mean 2.4 dB.
     */
    const centre = frameAt(
      (PIANO_ATTACK_LAYER_POLICY.matchWindowStartSeconds +
        PIANO_ATTACK_LAYER_POLICY.matchWindowEndSeconds) /
        2,
    );
    const half = frameAt(0.006);
    const level = (pcm: RenderedNotePcm): number =>
      Math.hypot(
        windowRms(pcm.left, centre - half, centre + half),
        windowRms(pcm.right, centre - half, centre + half),
      );
    let total = 0;
    let count = 0;
    let worst = 0;
    let worstAt = "";
    for (let midi = 21; midi <= 108; midi += 3) {
      for (const velocity of [1, 64, 127] as const) {
        const hybrid = await renderOrThrow(midi, velocity);
        const synth = await renderSynthOrThrow(midi, velocity);
        const synthLevel = level(synth);
        expect(synthLevel).toBeGreaterThan(0);
        const decibels = Math.abs(20 * Math.log10(level(hybrid) / synthLevel));
        total += decibels;
        count += 1;
        if (decibels > worst) {
          worst = decibels;
          worstAt = `midi ${String(midi)} velocity ${String(velocity)}`;
        }
      }
    }
    /* The label rides along so a failure names the note it failed on. */
    expect([worstAt, worst < 4.5]).toEqual([worstAt, true]);
    expect(total / count).toBeLessThan(1.5);
  }, 60_000);

  test("a malformed slice entry falls back to synthesis, never to garbage", async () => {
    /*
     * The index is generated and the payload is pinned by hash, but the
     * runtime must not depend on that: an entry whose PCM range runs off
     * either end of the payload would truncate the layer to silence
     * mid-crossfade or replay a neighbouring recording, both audible. The
     * contract is that such a request renders as pure synthesis.
     */
    const renderer = await loadConcertGrandRenderer();
    const entry = PIANO_ATTACK_SLICE_INDEX.find(
      (slice) => slice.midiPitch === 60 && slice.velocityBucket === 2,
    );
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const mutable = entry as { byteOffset: number; frameCount: number };
    const savedOffset = mutable.byteOffset;
    const savedFrames = mutable.frameCount;
    const synth = await renderSynthOrThrow(60, 96);
    const corruptions: readonly (readonly [string, number, number])[] = [
      ["past the payload", PIANO_ATTACK_SAMPLES_BYTE_LENGTH, savedFrames],
      [
        "overrunning the tail",
        PIANO_ATTACK_SAMPLES_BYTE_LENGTH - 9_000 * 2,
        savedFrames,
      ],
      ["negative", -4_000, savedFrames],
      ["odd", savedOffset + 1, savedFrames],
      ["non-integer frame count", savedOffset, Number.NaN],
    ];
    try {
      /* The clean entry really does engage the layer. */
      const clean = renderer.renderNote(60, 96, SAMPLE_RATE);
      expect(clean).not.toBeNull();
      expect(
        Buffer.from(clean?.left.buffer ?? new ArrayBuffer(0)).equals(
          Buffer.from(synth.left.buffer),
        ),
      ).toBe(false);

      for (const [label, byteOffset, frameCount] of corruptions) {
        mutable.byteOffset = byteOffset;
        mutable.frameCount = frameCount;
        const pcm = renderer.renderNote(60, 96, SAMPLE_RATE);
        expect(pcm).not.toBeNull();
        if (pcm === null) continue;
        expect(`${label}:${String(pcm.frameCount)}`).toBe(
          `${label}:${String(synth.frameCount)}`,
        );
        expect(
          `${label}:${String(
            Buffer.from(pcm.left.buffer).equals(Buffer.from(synth.left.buffer)),
          )}`,
        ).toBe(`${label}:true`);
        expect(
          Buffer.from(pcm.right.buffer).equals(Buffer.from(synth.right.buffer)),
        ).toBe(true);
      }
    } finally {
      mutable.byteOffset = savedOffset;
      mutable.frameCount = savedFrames;
    }
  });

  test("the sampled attack agrees with the sustain on pitch", async () => {
    /*
     * The recordings are stretch-tuned; if the build-time correction were
     * dropped the attack would sit tens of cents away from the sustain. Both
     * layers are pitched by the same estimator, so its bias cancels.
     */
    for (const midi of [48, 55, 60, 64, 67, 72, 79] as const) {
      const hybrid = await renderOrThrow(midi, 96);
      const synth = await renderSynthOrThrow(midi, 96);
      const f0 = midiFrequency(midi);
      const start = frameAt(0.02);
      const length = Math.min(
        frameAt(0.15),
        Math.max(8_192, Math.round((SAMPLE_RATE * 60) / f0)),
      );
      const estimate = (channel: Float32Array): number => {
        let bestCents = 0;
        let bestScore = -1;
        for (let cents = -60; cents <= 60; cents += 1) {
          let score = 0;
          for (const partial of [1, 2, 3] as const) {
            score +=
              Math.sqrt(
                goertzelPower(
                  channel,
                  start,
                  length,
                  f0 * 2 ** (cents / 1_200) * partial,
                ),
              ) / partial;
          }
          if (score > bestScore) {
            bestScore = score;
            bestCents = cents;
          }
        }
        return bestCents;
      };
      expect(
        Math.abs(estimate(hybrid.left) - estimate(synth.left)),
      ).toBeLessThanOrEqual(8);
    }
  });

  test("hybrid output respects the peak guard", async () => {
    for (const midi of [21, 24, 36, 48, 60, 72, 84, 96, 108] as const) {
      for (const velocity of [40, 96, 127] as const) {
        const hybrid = await renderOrThrow(midi, velocity);
        const peak = peakOf(hybrid);
        expect(peak).toBeLessThanOrEqual(0.95);
        expect(peak).toBeGreaterThan(0.05);
      }
    }
  });

  test("notes outside the sampled velocity or pitch set still render", async () => {
    const renderer = await loadConcertGrandRenderer();
    /* Velocity 0 and 128 are out of contract; the layer must not mask that. */
    expect(renderer.renderNote(60, 0, SAMPLE_RATE)).toBeNull();
    expect(renderer.renderNote(60, 128, SAMPLE_RATE)).toBeNull();
    expect(renderer.renderNote(20, 96, SAMPLE_RATE)).toBeNull();
    expect(renderer.renderNote(109, 96, SAMPLE_RATE)).toBeNull();

    /* An unsampled sample rate still renders through pure synthesis. */
    for (const rate of [22_050, 32_000, 44_100, 96_000] as const) {
      const pcm = renderer.renderNote(60, 96, rate);
      expect(pcm).not.toBeNull();
      if (pcm === null) continue;
      expect(pcm.sampleRateHz).toBe(rate);
      expect(pcm.frameCount).toBeGreaterThan(0);
    }
  });

  test("every in-contract pitch and velocity renders, sampled or not", async () => {
    const renderer = await loadConcertGrandRenderer();
    /* Slice selection is cheap and covers all 88 keys x every bucket edge. */
    let unsampled = 0;
    for (let midi = 21; midi <= 108; midi += 1) {
      for (const velocity of [1, 53, 54, 88, 89, 127] as const) {
        if (renderer.attackSliceFor(midi, velocity) === null) unsampled += 1;
      }
    }
    /* The corpus spans the whole keyboard: nothing falls back to synthesis. */
    expect(unsampled).toBe(0);

    /* Rendering is the expensive half, so it walks the keyboard in thirds. */
    for (let midi = 21; midi <= 108; midi += 4) {
      for (const velocity of [1, 64, 127] as const) {
        const pcm = renderer.renderNote(midi, velocity, SAMPLE_RATE);
        expect(pcm).not.toBeNull();
        if (pcm === null) continue;
        expect(pcm.frameCount).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  test("the layer degrades to pure synthesis outside the sampled set", async () => {
    /*
     * `attackSliceFor` is the guard the renderer itself consults, so a
     * request it refuses must come back byte-identical to pure synthesis.
     */
    const renderer = await loadConcertGrandRenderer();
    const missing = PIANO_ATTACK_SLICE_INDEX.every(
      (slice) => Math.abs(slice.midiPitch - 60) > 3,
    );
    expect(missing).toBe(false);
    expect(renderer.attackSliceFor(200, 96)).toBeNull();
    expect(renderer.attackSliceFor(60, 200)).toBeNull();
  });

  test("the build-time tuning estimator refuses what it cannot measure", () => {
    /*
     * The payload's cents corrections are measurements, and a measurement
     * that fails must fail the build. A scan whose maximum is an artifact —
     * a silent window, or one pegged at an endpoint of the scan range —
     * would otherwise write a fabricated correction that `--check` then
     * reproduces exactly and blesses, detuning the sampled layer against
     * the sustain it is crossfaded into with no gate able to see it.
     */
    expect(() => estimateCents(new Float64Array(17_640), 60)).toThrow(
      /PIANO_SAMPLES_TUNING_SILENT/u,
    );
    expect(() => estimateCents(new Float64Array(300), 60)).toThrow(
      /PIANO_SAMPLES_TUNING_WINDOW/u,
    );

    /* A clean 12-TET tone still measures as exactly on pitch. */
    const rate = PIANO_ATTACK_SAMPLE_RATE_HZ;
    const tone = new Float64Array(PIANO_ATTACK_SLICE_FRAMES);
    for (let index = 0; index < tone.length; index += 1) {
      tone[index] = Math.sin(
        (2 * Math.PI * midiFrequency(60) * index) / rate,
      );
    }
    expect(estimateCents(tone, 60)).toBe(0);

    /* And a tone further out than the scan can resolve is refused. */
    const far = new Float64Array(PIANO_ATTACK_SLICE_FRAMES);
    const detuned = midiFrequency(60) * 2 ** (90 / 1_200);
    for (let index = 0; index < far.length; index += 1) {
      far[index] = Math.sin((2 * Math.PI * detuned * index) / rate);
    }
    expect(() => estimateCents(far, 60)).toThrow(
      /PIANO_SAMPLES_TUNING_UNRESOLVED/u,
    );
  });
});
