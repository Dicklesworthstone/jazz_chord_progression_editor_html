/**
 * Unit tests for U2 Chord Inspector Projection
 * (bead jcpe-milestone-reliable-studio-l3a.11.2).
 */
import { describe, expect, test } from "bun:test";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";
import { projectChordInspectorViewModel } from "../../src/application";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import type { AppState } from "../../src/application/application-state-contract";
import type {
  ChordSpec,
  CustomChordSpec,
} from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";

function getBootstrapState(): AppState {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("Failed to bootstrap studio");
  return bootstrap.value.state;
}

const parsedCmaj7 = parseChordSymbol("Cmaj7", "ascii");
if (!parsedCmaj7.ok) throw new Error("Failed to parse Cmaj7");
const SAMPLE_CMAJ7_SPEC: ChordSpec = parsedCmaj7.chord;

const SAMPLE_CUSTOM_SPEC: CustomChordSpec = {
  kind: "custom",
  sourceText: "CcustomX",
  label: "CcustomX",
  pitchNames: [{ step: "C", alter: 0 }, { step: "F", alter: 1 }],
  bass: null,
};

describe("U2 Chord Inspector Projection", () => {
  test("fixture publication refuses custom pitches absent from its declared formula", () => {
    const event = inspectorEvent({
      id: "ev-custom-mismatch", annotation: "",
      chord: { ...SAMPLE_CUSTOM_SPEC, pitchNames: [{ step: "C", alter: 0 }] },
      voicing: { mode: "manual", bassPolicy: "included", pitches: [
        { step: "C", alter: 0, octave: 4 }, { step: "F", alter: 1, octave: 4 },
      ] },
    });
    expect(() => inspectorState(event)).toThrow("custom.pitch_voicing_mismatch");
  });
  test("returns clean empty state when no chord event is selected", () => {
    const state = getBootstrapState();
    const emptyState: AppState = {
      ...state,
      bookmarks: {
        ...state.bookmarks,
        selection: { kind: "none" },
      },
    };
    const view = projectChordInspectorViewModel(emptyState);

    expect(view.hasSelectedEvent).toBe(false);
    expect(view.selectedEventId).toBeNull();
    expect(view.activeTab).toBe("symbol");
    expect(view.symbol.sourceText).toBe("");
    expect(view.structure.degrees).toEqual([]);
    expect(view.voicing.activePitches).toEqual([]);
    expect(view.harmony.qualityCategory).toBe("None");
    expect(view.piano.activeMidiNotes).toEqual([]);
  });

  test("projects standard parsed chord (Cmaj7) across all 7 tabs", () => {
    const eventId = "ev-1";

    const sampleChordEvent = inspectorEvent({
      id: eventId,
      annotation: "Opening tonic",
      chord: SAMPLE_CMAJ7_SPEC,
      voicing: Object.freeze({
        mode: "auto",
        family: "balanced",
        bassPolicy: "generated",
        voiceCount: 4,
        range: Object.freeze({ lowMidi: 48, highMidi: 72 }),
      }),
    });

    const state = inspectorState(sampleChordEvent);

    const view = projectChordInspectorViewModel(state);
    expect(view.hasSelectedEvent).toBe(true);
    expect(view.selectedEventId).toBe(sampleChordEvent.id);

    // 1. Symbol
    expect(view.symbol.sourceText).toBe("Cmaj7");
    expect(view.symbol.canonicalText).toBe("Cmaj7");
    expect(view.symbol.isValidSyntax).toBe(true);
    expect(view.symbol.isCustomUnrecognized).toBe(false);

    // 2. Structure
    expect(view.structure.rootSpelling).toEqual({ step: "C", alter: 0 });
    expect(view.structure.qualityName).toBe("Major Seventh");
    expect(view.structure.degrees.length).toBe(4);
    expect(view.structure.degrees[0]?.role).toBe("root");
    expect(view.structure.degrees[1]?.role).toBe("guide-third");
    expect(view.structure.degrees[2]?.role).toBe("color");
    expect(view.structure.degrees[3]?.role).toBe("guide-seventh");

    // 3. Timing
    expect(view.timing.durationLabel).toBe("4 beats");
    expect(view.timing.measureIndex).toBe(0);
    expect(view.timing.measureOrdinal).toBe(1);

    // 4. Voicing
    expect(view.voicing.mode).toBe("auto");
    expect(view.voicing.activePitches.length).toBeGreaterThan(0);
    expect(view.voicing.canSwitchToManual).toBe(true);

    // 5. Harmony
    expect(view.harmony.guideTones.length).toBe(2);

    // 6. Motion
    expect(view.motion.voicePaths).toBeDefined();

    // 7. Notes
    expect(view.notes.maxCodePoints).toBe(2000);
    expect(view.notes.rawAnnotation).toBe("Opening tonic");
  });

  test("custom unrecognized chords preserve source text without guessing canonical", () => {
    const eventId = "ev-custom";

    const customEvent = inspectorEvent({
      id: eventId,
      annotation: "Custom experiment",
      chord: SAMPLE_CUSTOM_SPEC,
      voicing: Object.freeze({
        mode: "manual",
        pitches: Object.freeze([
          { step: "C", alter: 0, octave: 4 },
          { step: "F", alter: 1, octave: 4 },
        ] as const),
        bassPolicy: "included",
      }),
    });

    const customState = inspectorState(customEvent);

    const view = projectChordInspectorViewModel(customState);
    expect(view.symbol.sourceText).toBe("CcustomX");
    expect(view.symbol.canonicalText).toBeNull();
    expect(view.symbol.isCustomUnrecognized).toBe(true);
    expect(view.structure.qualityName).toBe("Custom / Unrecognized");
  });
});
