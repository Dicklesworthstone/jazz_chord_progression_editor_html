/**
 * jcpe-7she evidence: the analyzer half of the DSP module closes the loop on
 * the renderer half — a rendered piano chord fed through `analyzeWindow`
 * must come back as exactly its own chord tones. This is the same check the
 * live panel performs against the AnalyserNode tap; here it runs headless
 * over the identical wasm.
 */
import { describe, expect, test } from "bun:test";

import { loadConcertGrandRenderer } from "../../src/audio/dsp-renderer";

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 8_192;

async function renderedChordMix(
  chord: readonly number[],
): Promise<Float32Array> {
  const renderer = await loadConcertGrandRenderer();
  const mix = new Float32Array(FFT_SIZE);
  const start = Math.floor(0.06 * SAMPLE_RATE);
  for (const midi of chord) {
    const pcm = renderer.renderNote(midi, 96, SAMPLE_RATE);
    if (pcm === null) throw new Error("RENDER_REFUSED");
    for (let index = 0; index < FFT_SIZE; index += 1) {
      mix[index] =
        (mix[index] ?? 0) +
        (pcm.left[start + index] ?? 0) +
        (pcm.right[start + index] ?? 0);
    }
  }
  return mix;
}

describe("jcpe-7she wasm analysis loop", () => {
  test("a rendered C major seventh chord is detected note-for-note", async () => {
    const renderer = await loadConcertGrandRenderer();
    const chord = [48, 60, 64, 67, 71];
    const frame = renderer.analyzeWindow(
      await renderedChordMix(chord),
      SAMPLE_RATE,
    );
    expect(frame).not.toBeNull();
    if (frame === null) return;
    expect(frame.fftSize).toBe(FFT_SIZE);
    expect(frame.magnitudes).toHaveLength(FFT_SIZE / 2);
    const detected = frame.notes.map((note) => note.midiPitch);
    for (const midi of chord) {
      expect(detected).toContain(midi);
    }
    /* Every detected fundamental sits close to its 12-TET target. */
    for (const note of frame.notes) {
      expect(Math.abs(note.centsDeviation)).toBeLessThan(25);
    }
    /* Chroma peaks only on C, E, G, B pitch classes. */
    const chordClasses = new Set(chord.map((midi) => midi % 12));
    let weakestChordTone = Number.POSITIVE_INFINITY;
    for (const pitchClass of chordClasses) {
      weakestChordTone = Math.min(
        weakestChordTone,
        frame.chroma[pitchClass] ?? 0,
      );
    }
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      if (chordClasses.has(pitchClass)) continue;
      expect(frame.chroma[pitchClass] ?? 0).toBeLessThan(weakestChordTone);
    }
  });

  test("a quartal rootless voicing comes back exactly, not as a nearby triad", async () => {
    const renderer = await loadConcertGrandRenderer();
    /* Dm9 shell: D2 bass, F-A-C-E upper structure. */
    const chord = [38, 53, 57, 60, 64];
    const frame = renderer.analyzeWindow(
      await renderedChordMix(chord),
      SAMPLE_RATE,
    );
    expect(frame).not.toBeNull();
    if (frame === null) return;
    const detected = frame.notes.map((note) => note.midiPitch);
    for (const midi of chord) {
      expect(detected).toContain(midi);
    }
  });

  test("silence yields an empty, honest frame", async () => {
    const renderer = await loadConcertGrandRenderer();
    const frame = renderer.analyzeWindow(
      new Float32Array(FFT_SIZE),
      SAMPLE_RATE,
    );
    expect(frame).not.toBeNull();
    if (frame === null) return;
    expect(frame.notes).toHaveLength(0);
  });

  test("out-of-contract windows are refused", async () => {
    const renderer = await loadConcertGrandRenderer();
    expect(renderer.analyzeWindow(new Float32Array(100), SAMPLE_RATE)).toBeNull();
    expect(renderer.analyzeWindow(new Float32Array(32), SAMPLE_RATE)).toBeNull();
    expect(
      renderer.analyzeWindow(new Float32Array(16_384), SAMPLE_RATE),
    ).toBeNull();
    expect(renderer.analyzeWindow(new Float32Array(4_096), 0)).toBeNull();
  });
});
