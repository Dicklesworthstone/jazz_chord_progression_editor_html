/**
 * Integration tests for U2 Chord Inspector Full Workflow
 * (bead jcpe-milestone-reliable-studio-l3a.11.2).
 */
import { describe, expect, test } from "bun:test";
import {
  makeSpelledPitch,
  type ChordEvent,
  type ChordEventId,
  type ChordSpec,
} from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import {
  projectChordInspectorViewModel,
  sanitizeAnnotationText,
} from "../../src/application";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import type { AppState } from "../../src/application/application-state-contract";

function getBootstrapState(): AppState {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("Failed to bootstrap studio");
  return bootstrap.value.state;
}

const parsedG7 = parseChordSymbol("G7", "ascii");
if (!parsedG7.ok) throw new Error("Failed to parse G7");
const G7_SPEC: ChordSpec = parsedG7.chord;

describe("U2 Chord Inspector Full Workflow Integration", () => {
  test("complete tab navigation, draft editing, and annotation workflow", () => {
    const baseState = getBootstrapState();
    const eventId = "ev-workflow-1" as ChordEventId;

    const sampleChordEvent: ChordEvent = {
      id: eventId,
      duration: Object.freeze({ numerator: 4, denominator: 1 }),
      annotation: "Original note",
      chord: G7_SPEC,
      voicing: Object.freeze({
        mode: "auto",
        family: "drop2",
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
                  mIdx === 0 ? { ...m, events: Object.freeze([sampleChordEvent]) } : m,
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

    // 1. Initial Projection
    let view = projectChordInspectorViewModel(state);
    expect(view.hasSelectedEvent).toBe(true);
    expect(view.symbol.sourceText).toBe("G7");
    expect(view.symbol.isDirty).toBe(false);

    // 2. Draft Symbol Editing (valid)
    view = projectChordInspectorViewModel(state, {
      draftSymbolText: "G7b9",
    });
    expect(view.symbol.draftText).toBe("G7b9");
    expect(view.symbol.isDirty).toBe(true);
    expect(view.symbol.isValidSyntax).toBe(true);
    expect(view.symbol.canonicalText).toBe("G7b9");

    // 3. Draft Symbol Editing (invalid syntax)
    view = projectChordInspectorViewModel(state, {
      draftSymbolText: "G7???",
    });
    expect(view.symbol.isDirty).toBe(true);
    expect(view.symbol.isValidSyntax).toBe(false);
    expect(view.symbol.canonicalText).toBeNull();
    expect(view.symbol.diagnostics.length).toBeGreaterThan(0);

    // 4. Tab Switching
    for (const tab of [
      "symbol",
      "structure",
      "timing",
      "voicing",
      "harmony",
      "motion",
      "notes",
    ] as const) {
      view = projectChordInspectorViewModel(state, { activeTab: tab });
      expect(view.activeTab).toBe(tab);
    }

    // 5. Piano Keyboard Hover & Focus
    view = projectChordInspectorViewModel(state, {
      hoveredPianoMidi: 67,
      focusedPianoMidi: 60,
    });
    expect(view.piano.hoveredMidi).toBe(67);
    expect(view.piano.focusedMidi).toBe(60);

    // 6. Annotation Sanitization in Workflow
    const unsafeDraft = "<b>Bold remark</b> <script>steal()</script>";
    view = projectChordInspectorViewModel(state, {
      draftAnnotationText: unsafeDraft,
    });
    expect(view.notes.rawAnnotation).toBe(unsafeDraft);
    expect(view.notes.isDirty).toBe(true);
    expect(view.notes.hasUnsafeMarkupStripped).toBe(true);
    expect(view.notes.sanitizedAnnotation).toBe("Bold remark steal()");
  });
});
