/**
 * Integration tests for U2 Chord Inspector Full Workflow
 * (bead jcpe-milestone-reliable-studio-l3a.11.2).
 */
import { describe, expect, test } from "bun:test";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";
import {
  type ChordSpec,
} from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import {
  projectChordInspectorViewModel,
} from "../../src/application";


const parsedG7 = parseChordSymbol("G7", "ascii");
if (!parsedG7.ok) throw new Error("Failed to parse G7");
const G7_SPEC: ChordSpec = parsedG7.chord;

describe("U2 Chord Inspector Full Workflow Integration", () => {
  test("complete tab navigation, draft editing, and annotation workflow", () => {
    const eventId = "ev-workflow-1";

    const sampleChordEvent = inspectorEvent({
      id: eventId,
      annotation: "Original note",
      chord: G7_SPEC,
      voicing: Object.freeze({
        mode: "auto",
        family: "drop2",
        bassPolicy: "generated",
        voiceCount: 4,
        range: Object.freeze({ lowMidi: 48, highMidi: 72 }),
      }),
    });

    const state = inspectorState(sampleChordEvent);

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

    // 6. Exact inert annotation text; rendering must not interpret markup.
    const unsafeDraft = "<b>Bold remark</b> <script>steal()</script>";
    view = projectChordInspectorViewModel(state, {
      draftAnnotationText: unsafeDraft,
    });
    expect(view.notes.rawAnnotation).toBe(unsafeDraft);
    expect(view.notes.isDirty).toBe(true);
    expect(view.notes.text).toBe(unsafeDraft);
  });
});
