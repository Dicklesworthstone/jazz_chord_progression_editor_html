/**
 * Unit tests for U2 Voicing Mode Lifecycle & Manual Note Editing.
 */
import { describe, expect, test } from "bun:test";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";
import type {
  ChordSpec,
  SpelledPitch,
} from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import { projectChordInspectorViewModel } from "../../src/application";


const parsedDm7 = parseChordSymbol("Dm7", "ascii");
if (!parsedDm7.ok) throw new Error("Failed to parse Dm7");
const SAMPLE_DM7_SPEC: ChordSpec = parsedDm7.chord;

describe("U2 Voicing Mode Lifecycle & Manual Note Editing", () => {
  test("Auto voicing allows switching to Manual and Frozen modes", () => {
    const eventId = "ev-dm7";

    const chordEvent = inspectorEvent({
      id: eventId,
      annotation: "",
      chord: SAMPLE_DM7_SPEC,
      voicing: Object.freeze({
        mode: "auto",
        family: "balanced",
        bassPolicy: "generated",
        voiceCount: 4,
        range: Object.freeze({ lowMidi: 48, highMidi: 72 }),
      }),
    });

    const state = inspectorState(chordEvent);

    const view = projectChordInspectorViewModel(state);
    expect(view.voicing.mode).toBe("auto");
    expect(view.voicing.canSwitchToManual).toBe(true);
    expect(view.voicing.canSwitchToFrozen).toBe(true);
    expect(view.voicing.canSwitchToAuto).toBe(false);
  });

  test("Manual notes stay exact without fabricated Frozen provenance", () => {
    const eventId = "ev-dm7-manual";

    const manualPitches: readonly SpelledPitch[] = Object.freeze([
      { step: "D", alter: 0, octave: 4 },
      { step: "F", alter: 0, octave: 4 },
      { step: "A", alter: 0, octave: 4 },
      { step: "C", alter: 0, octave: 5 },
    ]);

    const chordEvent = inspectorEvent({
      id: eventId,
      annotation: "",
      chord: SAMPLE_DM7_SPEC,
      voicing: Object.freeze({
        mode: "manual",
        pitches: manualPitches,
        bassPolicy: "included",
      }),
    });

    const state = inspectorState(chordEvent);

    const view = projectChordInspectorViewModel(state);
    expect(view.voicing.mode).toBe("manual");
    expect(view.voicing.manualNoteCount).toBe(4);
    expect(view.voicing.canSwitchToManual).toBe(false);
    expect(view.voicing.canSwitchToAuto).toBe(true);
    expect(view.voicing.canSwitchToFrozen).toBe(false);
  });
});
