/**
 * Instrument-range octave-fold policy (jcpe-instrument-range-fold-policy-s1uz).
 *
 * Unit half: the fold function's exact behavior and the window registry's
 * static laws. The integration half (instrument-range-fold.test.ts) proves
 * the engine applies the same authority at attack and prepare intake.
 *
 * No-Claim: green here certifies fold arithmetic and registry completeness,
 * not the sound quality of folded registers.
 */
import { describe, expect, test } from "bun:test";

import {
  AUDIO_INSTRUMENT_RECIPES,
  AUDIO_PLAYABLE_MIDI_WINDOWS,
  MINIMUM_FOLD_WINDOW_SEMITONES,
  foldMidiPitchIntoWindow,
  playableMidiWindowForRecipeId,
} from "../../src/audio/instrument-recipes-contract";

describe("window registry laws", () => {
  test("every recipe has a playable window", () => {
    for (const recipe of AUDIO_INSTRUMENT_RECIPES) {
      expect(playableMidiWindowForRecipeId(recipe.id)).not.toBeNull();
    }
  });

  test("every window spans at least one octave so the fold is total and unique", () => {
    for (const [id, window] of Object.entries(AUDIO_PLAYABLE_MIDI_WINDOWS)) {
      expect(
        window.high - window.low,
        `window ${id} must span >= ${String(MINIMUM_FOLD_WINDOW_SEMITONES)}`,
      ).toBeGreaterThanOrEqual(MINIMUM_FOLD_WINDOW_SEMITONES);
      expect(window.low).toBeGreaterThanOrEqual(0);
      expect(window.high).toBeLessThanOrEqual(127);
    }
  });

  test("unknown recipe id has no window (callers pass through)", () => {
    expect(playableMidiWindowForRecipeId("no-such-recipe")).toBeNull();
  });
});

describe("fold arithmetic", () => {
  const flute = { low: 60, high: 96 } as const;
  const ukulele = { low: 60, high: 93 } as const;
  const bass = { low: 28, high: 67 } as const;

  test("in-window pitches are unchanged", () => {
    for (const pitch of [60, 72, 96]) {
      expect(foldMidiPitchIntoWindow(pitch, flute)).toBe(pitch);
    }
  });

  test("below-window pitches rise by the minimal octave count", () => {
    /* The RC3 register: charts handed the flute MIDI 45-53. */
    expect(foldMidiPitchIntoWindow(45, flute)).toBe(69);
    expect(foldMidiPitchIntoWindow(53, flute)).toBe(65);
    expect(foldMidiPitchIntoWindow(59, flute)).toBe(71);
    expect(foldMidiPitchIntoWindow(48, ukulele)).toBe(60);
    expect(foldMidiPitchIntoWindow(0, bass)).toBe(36);
  });

  test("above-window pitches fall by the minimal octave count", () => {
    expect(foldMidiPitchIntoWindow(97, flute)).toBe(85);
    expect(foldMidiPitchIntoWindow(127, flute)).toBe(91);
    expect(foldMidiPitchIntoWindow(72, bass)).toBe(60);
  });

  test("pitch class is always preserved", () => {
    for (let pitch = 0; pitch <= 127; pitch += 1) {
      const folded = foldMidiPitchIntoWindow(pitch, ukulele);
      expect(((folded - pitch) % 12 + 12) % 12).toBe(0);
      expect(folded).toBeGreaterThanOrEqual(ukulele.low);
      expect(folded).toBeLessThanOrEqual(ukulele.high);
    }
  });

  test("fold is idempotent", () => {
    for (let pitch = 0; pitch <= 127; pitch += 7) {
      const once = foldMidiPitchIntoWindow(pitch, bass);
      expect(foldMidiPitchIntoWindow(once, bass)).toBe(once);
    }
  });

  test("degenerate sub-octave window passes pitches through unchanged", () => {
    expect(foldMidiPitchIntoWindow(10, { low: 60, high: 65 })).toBe(10);
  });
});
