/**
 * Unit tests for U2 Chord Inspector Projection
 * (bead jcpe-milestone-reliable-studio-l3a.11.2).
 */
import { describe, expect, test } from "bun:test";
import { projectChordInspectorViewModel } from "../../src/application";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import type { AppState } from "../../src/application/application-state-contract";
import type {
  ChordEvent,
  ChordEventId,
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
  pitchNames: [{ step: "C", alter: 0 }],
  bass: null,
};

describe("U2 Chord Inspector Projection", () => {
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
    const baseState = getBootstrapState();
    const eventId = "ev-1" as ChordEventId;

    const sampleChordEvent: ChordEvent = {
      id: eventId,
      duration: Object.freeze({ numerator: 4, denominator: 1 }),
      annotation: "Opening tonic",
      chord: SAMPLE_CMAJ7_SPEC,
      voicing: Object.freeze({
        mode: "auto",
        family: "rootless-a",
        bassPolicy: "generated",
        voiceCount: 4,
        colorPolicy: "none",
        range: Object.freeze({ lowMidi: 48, highMidi: 72 }),
      }),
    };

    const state: AppState = {
      ...baseState,
      document: {
        ...baseState.document,
        sections: baseState.document.sections.map((sec, sIdx) =>
          sIdx === 0
            ? {
                ...sec,
                measures: sec.measures.map((m, mIdx) =>
                  mIdx === 0
                    ? {
                        ...m,
                        events: Object.freeze([sampleChordEvent]),
                      }
                    : m,
                ),
              }
            : sec,
        ),
      },
      bookmarks: {
        ...baseState.bookmarks,
        selection: {
          kind: "events",
          eventIds: Object.freeze([eventId]),
          anchorEventId: eventId,
          focusEventId: eventId,
        },
      },
    };

    const view = projectChordInspectorViewModel(state);
    expect(view.hasSelectedEvent).toBe(true);
    expect(view.selectedEventId).toBe(eventId);

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
    expect(view.notes.maxCodePoints).toBe(500);
    expect(view.notes.rawAnnotation).toBe("Opening tonic");
  });

  test("custom unrecognized chords preserve source text without guessing canonical", () => {
    const baseState = getBootstrapState();
    const eventId = "ev-custom" as ChordEventId;

    const customEvent: ChordEvent = {
      id: eventId,
      duration: Object.freeze({ numerator: 4, denominator: 1 }),
      annotation: "Custom experiment",
      chord: SAMPLE_CUSTOM_SPEC,
      voicing: Object.freeze({
        mode: "manual",
        pitches: Object.freeze([
          { step: "C", alter: 0, octave: 4 },
          { step: "F", alter: 1, octave: 4 },
        ]),
        bassPolicy: "external",
      }),
    };

    const customState: AppState = {
      ...baseState,
      document: {
        ...baseState.document,
        sections: baseState.document.sections.map((sec, sIdx) =>
          sIdx === 0
            ? {
                ...sec,
                measures: sec.measures.map((m, mIdx) =>
                  mIdx === 0
                    ? {
                        ...m,
                        events: Object.freeze([customEvent]),
                      }
                    : m,
                ),
              }
            : sec,
        ),
      },
      bookmarks: {
        ...baseState.bookmarks,
        selection: {
          kind: "events",
          eventIds: Object.freeze([eventId]),
          anchorEventId: eventId,
          focusEventId: eventId,
        },
      },
    };

    const view = projectChordInspectorViewModel(customState);
    expect(view.symbol.sourceText).toBe("CcustomX");
    expect(view.symbol.canonicalText).toBeNull();
    expect(view.symbol.isCustomUnrecognized).toBe(true);
    expect(view.structure.qualityName).toBe("Custom / Unrecognized");
  });
});
