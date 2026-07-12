import { describe, expect, test } from "bun:test";

import {
  makePlaybackSettings,
  type PlaybackSettingsInput,
} from "../../src/domain/document";
import {
  INSTRUMENT_IDS,
  makeInstrumentId,
} from "../../src/domain/instrument-id";
import { KEY_MODES, makeKeyMode } from "../../src/domain/key";
import {
  compareSpelledPitchClasses,
  compareSpelledPitches,
  frequencyForMidi,
  makeMidiPitch,
  makeSpelledPitch,
  makeSpelledPitchClass,
  pitchClassOf,
  projectSpelledPitch,
  soundingSemitoneOf,
  type MidiPitch,
  type SpelledPitch,
  type SpelledPitchClass,
} from "../../src/domain/pitch";

function requireOk<Value>(
  result:
    | Readonly<{ ok: true; value: Value }>
    | Readonly<{ ok: false; refusal: Readonly<{ code: string }> }>,
): Value {
  if (!result.ok) throw new Error(`unexpected refusal: ${result.refusal.code}`);
  return result.value;
}

function pitchClass(step: string, alter: number): SpelledPitchClass {
  return requireOk(makeSpelledPitchClass({ step, alter }));
}

function pitch(step: string, alter: number, octave: number): SpelledPitch {
  return requireOk(makeSpelledPitch({ step, alter, octave }));
}

function midi(received: number): MidiPitch {
  return requireOk(makeMidiPitch(received));
}

describe("F1 spelling-first pitch runtime", () => {
  test("constructs only the reviewed spelling vocabulary without normalization", () => {
    const written = makeSpelledPitch({ step: "C", alter: -2, octave: -1 });
    expect(written).toEqual({
      ok: true,
      value: { step: "C", alter: -2, octave: -1 },
    });
    if (written.ok) expect(Object.isFrozen(written.value)).toBe(true);

    expect(makeSpelledPitchClass({ step: "H", alter: 0 })).toEqual({
      ok: false,
      refusal: {
        code: "pitch.step_invalid",
        path: ["step"],
        received: "H",
      },
    });
    for (const alter of [-3, 0.5, 3, Number.NaN]) {
      expect(makeSpelledPitchClass({ step: "C", alter })).toMatchObject({
        ok: false,
        refusal: {
          code: "pitch.alter_out_of_range",
          path: ["alter"],
          minimum: -2,
          maximum: 2,
        },
      });
    }
    expect(makeSpelledPitch({ step: "C", alter: 0, octave: 4.5 })).toEqual({
      ok: false,
      refusal: {
        code: "pitch.octave_not_integer",
        path: ["octave"],
        received: 4.5,
      },
    });
    expect(
      makeSpelledPitch({
        step: "C",
        alter: 0,
        octave: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "pitch.octave_not_safe_integer",
        path: ["octave"],
      },
    });
  });

  test("projects independent boundary and enharmonic examples exactly", () => {
    const cases = [
      [pitch("B", 1, 3), 0, 60, 261.6255653005986],
      [pitch("C", 0, 4), 0, 60, 261.6255653005986],
      [pitch("C", -1, 4), 11, 59, 246.94165062806206],
      [pitch("A", 0, 4), 9, 69, 440],
      [pitch("C", 0, -1), 0, 0, 8.175798915643707],
      [pitch("G", 0, 9), 7, 127, 12543.853951415975],
    ] as const;

    for (const [written, expectedPitchClass, expectedMidi, expectedFrequency] of cases) {
      const projected = requireOk(projectSpelledPitch(written));
      expect(projected.spelled).toBe(written);
      expect(projected.pitchClass).toBe(expectedPitchClass);
      expect(Number(projected.midi)).toBe(expectedMidi);
      expect(projected.frequencyHz).toBeCloseTo(expectedFrequency, 9);
      expect(Object.isFrozen(projected)).toBe(true);
    }

    const below = pitch("C", -1, -1);
    expect(projectSpelledPitch(below)).toEqual({
      ok: false,
      refusal: {
        code: "pitch.midi_out_of_range",
        path: ["octave"],
        spelled: below,
        projectedMidi: -1,
        minimum: 0,
        maximum: 127,
      },
    });
    const above = pitch("G", 1, 9);
    expect(projectSpelledPitch(above)).toMatchObject({
      ok: false,
      refusal: {
        code: "pitch.midi_out_of_range",
        path: ["octave"],
        spelled: above,
        projectedMidi: 128,
      },
    });
  });

  test("keeps MIDI construction and equal-temperament frequency boundaries typed", () => {
    expect(makeMidiPitch(0)).toMatchObject({ ok: true, value: 0 });
    expect(makeMidiPitch(127)).toMatchObject({ ok: true, value: 127 });
    expect(makeMidiPitch(69.5)).toEqual({
      ok: false,
      refusal: {
        code: "pitch.midi_not_integer",
        path: ["midi"],
        received: 69.5,
      },
    });
    for (const received of [-1, 128]) {
      expect(makeMidiPitch(received)).toEqual({
        ok: false,
        refusal: {
          code: "pitch.midi_out_of_range",
          path: ["midi"],
          received,
          minimum: 0,
          maximum: 127,
        },
      });
    }
    expect(frequencyForMidi(midi(69))).toBe(440);
    expect(frequencyForMidi(midi(60))).toBeCloseTo(261.6255653005986, 9);
  });

  test("uses Euclidean pitch classes and the declared written comparators", () => {
    expect(pitchClassOf(pitchClass("C", -2))).toBe(10);
    expect(pitchClassOf(pitchClass("B", 2))).toBe(1);

    const writtenClasses = [
      pitchClass("A", 0),
      pitchClass("B", 0),
      pitchClass("C", 1),
      pitchClass("C", -1),
      pitchClass("D", 0),
    ];
    expect([...writtenClasses].sort(compareSpelledPitchClasses)).toEqual([
      pitchClass("C", -1),
      pitchClass("C", 1),
      pitchClass("D", 0),
      pitchClass("A", 0),
      pitchClass("B", 0),
    ]);

    expect(compareSpelledPitches(pitch("B", 2, 3), pitch("C", -2, 4))).toBe(-1);
    expect(compareSpelledPitches(pitch("C", 0, 4), pitch("C", 0, 4))).toBe(0);
    expect(compareSpelledPitches(pitch("D", -1, 4), pitch("C", 2, 4))).toBe(1);
  });

  test("offers an exact non-MIDI coordinate for stored written pitches", () => {
    expect(soundingSemitoneOf(pitch("C", -1, -1))).toBe(-1n);
    expect(soundingSemitoneOf(pitch("B", 1, 3))).toBe(60n);
    expect(soundingSemitoneOf(pitch("C", 0, 4))).toBe(60n);
    expect(
      soundingSemitoneOf(pitch("G", 0, Number.MAX_SAFE_INTEGER)),
    ).toBe(108086391056891911n);
  });
});

describe("F1 finite persisted vocabularies and playback settings", () => {
  test("accepts exactly the declared key modes and instrument IDs", () => {
    for (const mode of KEY_MODES) expect(makeKeyMode(mode)).toEqual({ ok: true, value: mode });
    expect(makeKeyMode("dorian")).toEqual({
      ok: false,
      refusal: { code: "key.mode_invalid", path: ["mode"], received: "dorian" },
    });
    expect(makeKeyMode(" major")).toMatchObject({ ok: false });

    for (const instrumentId of INSTRUMENT_IDS) {
      expect(makeInstrumentId(instrumentId)).toEqual({ ok: true, value: instrumentId });
    }
    expect(makeInstrumentId("grand-piano")).toEqual({
      ok: false,
      refusal: {
        code: "document.instrument_id_invalid",
        path: ["instrumentId"],
        received: "grand-piano",
      },
    });
    expect(makeInstrumentId("mellow-keys ")).toMatchObject({ ok: false });
  });

  test("constructs playback settings at inclusive boundaries without repair", () => {
    const instrumentId = requireOk(makeInstrumentId("mellow-keys"));
    const input = {
      instrumentId,
      masterVolume: 0,
      reverbAmount: 1,
      countInBars: 2,
    } as const satisfies PlaybackSettingsInput;
    const result = makePlaybackSettings(input);
    expect(result).toEqual({ ok: true, value: input });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
  });

  test("refuses non-finite/out-of-range levels and invalid count-in values", () => {
    const instrumentId = requireOk(makeInstrumentId("vibraphone"));
    const base = {
      instrumentId,
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 1,
    } as const;

    expect(makePlaybackSettings({ ...base, masterVolume: Number.NaN })).toMatchObject({
      ok: false,
      refusal: {
        code: "playback.level_not_finite",
        path: ["masterVolume"],
        field: "masterVolume",
      },
    });
    expect(makePlaybackSettings({ ...base, reverbAmount: Number.POSITIVE_INFINITY })).toMatchObject({
      ok: false,
      refusal: {
        code: "playback.level_not_finite",
        path: ["reverbAmount"],
        field: "reverbAmount",
      },
    });
    expect(makePlaybackSettings({ ...base, masterVolume: -0.001 })).toMatchObject({
      ok: false,
      refusal: {
        code: "playback.level_out_of_range",
        path: ["masterVolume"],
        minimum: 0,
        maximum: 1,
      },
    });
    expect(makePlaybackSettings({ ...base, reverbAmount: 1.001 })).toMatchObject({
      ok: false,
      refusal: {
        code: "playback.level_out_of_range",
        path: ["reverbAmount"],
      },
    });
    for (const countInBars of [-1, 1.5, 3]) {
      expect(makePlaybackSettings({ ...base, countInBars })).toEqual({
        ok: false,
        refusal: {
          code: "playback.count_in_bars_invalid",
          path: ["countInBars"],
          received: countInBars,
        },
      });
    }
  });
});
