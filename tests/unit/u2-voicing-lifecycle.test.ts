/**
 * Unit tests for U2 Voicing Mode Lifecycle & Manual Note Editing.
 */
import { describe, expect, test } from "bun:test";
import type {
  ChordEvent,
  ChordEventId,
  ChordSpec,
  SpelledPitch,
} from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import { projectChordInspectorViewModel } from "../../src/application";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import type { AppState } from "../../src/application/application-state-contract";

function getBootstrapState(): AppState {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("Failed to bootstrap studio");
  return bootstrap.value.state;
}

const parsedDm7 = parseChordSymbol("Dm7", "ascii");
if (!parsedDm7.ok) throw new Error("Failed to parse Dm7");
const SAMPLE_DM7_SPEC: ChordSpec = parsedDm7.chord;

describe("U2 Voicing Mode Lifecycle & Manual Note Editing", () => {
  test("Auto voicing allows switching to Manual and Frozen modes", () => {
    const baseState = getBootstrapState();
    const eventId = "ev-dm7" as ChordEventId;

    const chordEvent: ChordEvent = {
      id: eventId,
      duration: Object.freeze({ numerator: 4, denominator: 1 }),
      annotation: null,
      chord: SAMPLE_DM7_SPEC,
      voicing: Object.freeze({
        mode: "auto",
        family: "rootless-b",
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
                  mIdx === 0 ? { ...m, events: Object.freeze([chordEvent]) } : m,
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
    expect(view.voicing.mode).toBe("auto");
    expect(view.voicing.canSwitchToManual).toBe(true);
    expect(view.voicing.canSwitchToFrozen).toBe(true);
    expect(view.voicing.canSwitchToAuto).toBe(false);
  });

  test("Manual voicing preserves custom pitches and allows switching to Auto and Frozen", () => {
    const baseState = getBootstrapState();
    const eventId = "ev-dm7-manual" as ChordEventId;

    const manualPitches: readonly SpelledPitch[] = Object.freeze([
      { step: "D", alter: 0, octave: 4 },
      { step: "F", alter: 0, octave: 4 },
      { step: "A", alter: 0, octave: 4 },
      { step: "C", alter: 0, octave: 5 },
    ]);

    const chordEvent: ChordEvent = {
      id: eventId,
      duration: Object.freeze({ numerator: 4, denominator: 1 }),
      annotation: null,
      chord: SAMPLE_DM7_SPEC,
      voicing: Object.freeze({
        mode: "manual",
        pitches: manualPitches,
        bassPolicy: "external",
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
                  mIdx === 0 ? { ...m, events: Object.freeze([chordEvent]) } : m,
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
    expect(view.voicing.mode).toBe("manual");
    expect(view.voicing.manualNoteCount).toBe(4);
    expect(view.voicing.canSwitchToManual).toBe(false);
    expect(view.voicing.canSwitchToAuto).toBe(true);
    expect(view.voicing.canSwitchToFrozen).toBe(true);
  });
});
