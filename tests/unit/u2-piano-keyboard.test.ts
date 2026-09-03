/**
 * Unit tests for U2 Piano Keyboard Geometry & Interaction (L-PIANO-01).
 */
import { describe, expect, test } from "bun:test";
import {
  buildPianoAccessibleLabel,
  defaultSpellingForMidi,
  derivePianoKeyboardViewModel,
  isBlackKeyMidi,
  midiToOctave,
  midiToPitchClass,
} from "../../src/application/chord-inspector";
import {
  PIANO_DEFAULT_VISIBLE_MAX_MIDI,
  PIANO_DEFAULT_VISIBLE_MIN_MIDI,
  PIANO_MAX_MIDI,
  PIANO_MIN_MIDI,
} from "../../src/application/u2-chord-inspector-contract";

describe("U2 Piano Keyboard Geometry & Accessible Navigation (L-PIANO-01)", () => {
  test("generates all 88 physical keys from A0 (21) to C8 (108)", () => {
    const vm = derivePianoKeyboardViewModel([]);
    expect(vm.keys.length).toBe(88);
    expect(vm.keys[0]?.midi).toBe(PIANO_MIN_MIDI);
    expect(vm.keys[87]?.midi).toBe(PIANO_MAX_MIDI);
    expect(vm.visibleMinMidi).toBe(PIANO_DEFAULT_VISIBLE_MIN_MIDI);
    expect(vm.visibleMaxMidi).toBe(PIANO_DEFAULT_VISIBLE_MAX_MIDI);
  });

  test("correctly identifies black vs white keys and octaves", () => {
    // A0 (MIDI 21): White key, pitch class 9, octave 0
    expect(isBlackKeyMidi(21)).toBe(false);
    expect(midiToPitchClass(21)).toBe(9);
    expect(midiToOctave(21)).toBe(0);

    // Bb0 (MIDI 22): Black key, pitch class 10, octave 0
    expect(isBlackKeyMidi(22)).toBe(true);
    expect(midiToPitchClass(22)).toBe(10);
    expect(midiToOctave(22)).toBe(0);

    // C4 (MIDI 60): Middle C, white key, pitch class 0, octave 4
    expect(isBlackKeyMidi(60)).toBe(false);
    expect(midiToPitchClass(60)).toBe(0);
    expect(midiToOctave(60)).toBe(4);

    // F#4 (MIDI 66): Black key, pitch class 6, octave 4
    expect(isBlackKeyMidi(66)).toBe(true);
    expect(midiToPitchClass(66)).toBe(6);
    expect(midiToOctave(66)).toBe(4);
  });

  test("formats accessible screen-reader labels with pitch and role", () => {
    const rootLabel = buildPianoAccessibleLabel(
      { step: "C", alter: 0 },
      4,
      "root",
    );
    expect(rootLabel).toBe("C4, Root");

    const guideLabel = buildPianoAccessibleLabel(
      { step: "E", alter: 0 },
      4,
      "guide-third",
    );
    expect(guideLabel).toBe("E4, Major Third Guide Tone");

    const tensionLabel = buildPianoAccessibleLabel(
      { step: "A", alter: 1 },
      5,
      "tension",
    );
    expect(tensionLabel).toBe("A#5, Tension");
  });

  test("marks active voiced notes and assigns role badges", () => {
    const roleMap = new Map([
      [0 as const, "root" as const],
      [4 as const, "guide-third" as const],
      [7 as const, "color" as const],
      [11 as const, "guide-seventh" as const],
    ]);
    const vm = derivePianoKeyboardViewModel([60, 64, 67, 71], roleMap);

    const c4 = vm.keys.find((k) => k.midi === 60);
    const e4 = vm.keys.find((k) => k.midi === 64);
    const g4 = vm.keys.find((k) => k.midi === 67);
    const b4 = vm.keys.find((k) => k.midi === 71);
    const d4 = vm.keys.find((k) => k.midi === 62);

    expect(c4?.isActiveVoiced).toBe(true);
    expect(c4?.isRoot).toBe(true);
    expect(c4?.role).toBe("root");

    expect(e4?.isActiveVoiced).toBe(true);
    expect(e4?.isGuideTone).toBe(true);
    expect(e4?.role).toBe("guide-third");

    expect(b4?.isActiveVoiced).toBe(true);
    expect(b4?.isGuideTone).toBe(true);
    expect(b4?.role).toBe("guide-seventh");

    expect(g4?.isActiveVoiced).toBe(true);
    expect(g4?.role).toBe("color");

    expect(d4?.isActiveVoiced).toBe(false);
    expect(d4?.role).toBeNull();
  });
});
