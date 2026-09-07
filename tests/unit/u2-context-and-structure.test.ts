import { describe, expect, test } from "bun:test";
import { decodeDocumentShape, makeBeatDuration, type SpelledPitch } from "../../src/domain";
import { parseChordSymbol, type VoiceAssignmentWorkEvidence } from "../../src/theory";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { projectInspectorMotion } from "../../src/application/studio-inspector-motion";
import { projectChordInspectorViewModel } from "../../src/application/chord-inspector";
import { readInspectorSymbolDraft } from "../../src/application/studio-inspector";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";

const policy = { mode: "auto", family: "balanced", voiceCount: 4, bassPolicy: "generated", range: { lowMidi: 48, highMidi: 84 } } as const;
function parsed(symbol: string) { const result = parseChordSymbol(symbol, "ascii"); if (!result.ok) throw new Error("Invalid literal symbol"); return result.chord; }
function pair(from: readonly SpelledPitch[], to: readonly SpelledPitch[], customFrom = false) {
  const current = inspectorEvent({ id: "u2-motion-current", chord: customFrom ? {
    kind: "custom", sourceText: "G B# E", label: "G B# E", bass: null,
    pitchNames: [{ step: "G", alter: 0 }, { step: "B", alter: 1 }, { step: "E", alter: 0 }],
  } : parsed("Cmaj7"), annotation: "Keep source order", voicing: { mode: "manual", pitches: from, bassPolicy: "included" } });
  const next = inspectorEvent({ id: "u2-motion-next", chord: parsed("Cmaj7"), annotation: "", voicing: { mode: "manual", pitches: to, bassPolicy: "included" } });
  const state = inspectorState(current), two = makeBeatDuration({ numerator: 2, denominator: 1 });
  if (!two.ok) throw new Error("Invalid duration");
  const decoded = decodeDocumentShape({ ...state.document, sections: state.document.sections.map(section => ({ ...section,
    measures: section.measures.map(measure => ({ ...measure, events: [{ ...current, duration: two.value }, { ...next, duration: two.value }] })),
  })) });
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) throw new Error(JSON.stringify(published.errors));
  return { ...state, document: published.value };
}

describe("U2 registered motion and semantic drafts", () => {
  for (const octave of [3, 4, 5]) test(`V1 keeps three actual common tones across spelling/order changes, octave ${String(octave)}`, () => {
    const state = pair([{ step: "G", alter: 0, octave: octave + 1 }, { step: "B", alter: 1, octave }, { step: "E", alter: 0, octave: octave + 1 }],
      [{ step: "C", alter: 0, octave: octave + 1 }, { step: "E", alter: 0, octave: octave + 1 }, { step: "G", alter: 0, octave: octave + 1 }], true);
    const before = JSON.stringify(state.document), view = projectChordInspectorViewModel(state);
    expect(view.motion.commonToneCount).toBe(3);
    expect(view.motion.voicePaths.map(path => path.intervalSemis)).toEqual([0, 0, 0]);
    expect(view.motion.unavailableReason).toBeNull();
    // The projector already proves V1 -> UI assignability. This opposite
    // direction also checks that the UI record loses no typed evidence field.
    const evidence: VoiceAssignmentWorkEvidence | null = view.motion.assignmentEvidence;
    expect(evidence?.termination).toBe("complete-assigned");
    expect(JSON.stringify(state.document)).toBe(before);
    const key = view.piano.keys.find(key => key.midi === (octave + 2) * 12);
    expect(key?.accessibleLabel).toContain(`B#${String(octave)}`);
  });

  test("the final chord still shows its incoming transition with independent work evidence", () => {
    const from = [{ step: "C", alter: 0, octave: 4 }, { step: "E", alter: 0, octave: 4 }, { step: "G", alter: 0, octave: 4 }] as const;
    const state = pair(from, [...from, { step: "B", alter: 0, octave: 4 }]);
    const view = projectInspectorMotion(state.document, "u2-motion-next", false);
    expect(view.incoming.commonToneCount).toBe(3);
    expect(view.incoming.voicePaths.at(-1)).toEqual({ fromPitch: null, toPitch: { step: "B", alter: 0, octave: 4 }, intervalSemis: null, motionType: "enter" });
    expect(view.incoming.assignmentEvidence?.termination).toBe("complete-assigned");
    expect(view.nextChordSymbol).toBeNull();
    expect(view.unavailableReason).toContain("no following chord");
    expect(projectInspectorMotion(state.document, "u2-motion-current", false).incoming.unavailableReason).toContain("no previous chord");
  });

  test("entering notes are explicit and never described as zero-distance matches", () => {
    const notes = [{ step: "C", alter: 0, octave: 4 }, { step: "E", alter: 0, octave: 4 }, { step: "G", alter: 0, octave: 4 }] as const;
    const view = projectChordInspectorViewModel(pair(notes, [...notes, { step: "B", alter: 0, octave: 4 }]));
    expect(view.motion.commonToneCount).toBe(3);
    expect(view.motion.voicePaths.filter(path => path.motionType === "enter")).toEqual([
      { fromPitch: null, toPitch: { step: "B", alter: 0, octave: 4 }, intervalSemis: null, motionType: "enter" },
    ]);
  });

  test("a differently spelled Custom note cannot be silently relabeled as parsed Cmaj7", () => {
    expect(() => pair([{ step: "G", alter: 0, octave: 4 }, { step: "B", alter: 1, octave: 3 }, { step: "E", alter: 0, octave: 4 }],
      [{ step: "C", alter: 0, octave: 4 }, { step: "E", alter: 0, octave: 4 }, { step: "G", alter: 0, octave: 4 }])).toThrow("chord.source_semantic_mismatch");
  });

  test("duplicate occurrences stay valid stored data and expose V1's unsupported comparison", () => {
    const notes = [{ step: "C", alter: 0, octave: 4 }, { step: "C", alter: 0, octave: 4 }, { step: "G", alter: 0, octave: 4 }] as const;
    const state = pair(notes, [{ step: "C", alter: 0, octave: 4 }, { step: "E", alter: 0, octave: 4 }, { step: "G", alter: 0, octave: 4 }]);
    const view = projectChordInspectorViewModel(state);
    expect(view.voicing.activePitches).toEqual(notes);
    expect(view.motion.unavailableReason).toContain("distinct pitches");
    expect(view.motion.assignmentEvidence).toBeNull();
  });

  test("root controls preserve explicit alterations and re-resolve actual pitch classes", () => {
    const state = inspectorState(inspectorEvent({ id: "u2-structure", chord: parsed("G7b9#11"), voicing: policy, annotation: "" }));
    const source = { documentId: state.document.id, revision: state.revision, eventId: "u2-structure" };
    const result = readInspectorSymbolDraft(state, source, "G7b9#11", { root: { step: "A", alter: -1 } });
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.value.chord?.root).toEqual({ step: "A", alter: -1 });
    expect(result.value.chord?.alterations).toEqual([{ number: 9, alter: -1 }, { number: 11, alter: 1 }]);
    expect(result.value.detail.structure.degrees.map(degree => degree.pitchClass)).toEqual([8, 0, 3, 6, 9, 2]);
    expect(result.value.detail.structure.alterations).toEqual(["b9", "#11"]);
    expect(result.value.detail.voicing.activePitches).toEqual([]);
    expect(state.document.sections[0]?.measures[0]?.events[0]?.chord.sourceText).toBe("G7b9#11");
    expect(readInspectorSymbolDraft(state, source, "?", { root: { step: "A", alter: -1 } }).ok).toBe(false);
  });

  test("minor and dominant sevenths receive different accurate labels", () => {
    const minor = projectChordInspectorViewModel(inspectorState(inspectorEvent({ id: "u2-minor", chord: parsed("Dm7"), voicing: policy, annotation: "" })));
    const dominant = projectChordInspectorViewModel(inspectorState(inspectorEvent({ id: "u2-dominant", chord: parsed("D7"), voicing: policy, annotation: "" })));
    expect(minor.structure.qualityName).toBe("Minor Seventh");
    expect(dominant.structure.qualityName).toBe("Dominant Seventh");
    expect(minor.piano.keys.find(key => key.midi === 65)?.accessibleLabel).toContain("Minor Third");
    expect(dominant.piano.keys.find(key => key.midi === 66)?.accessibleLabel).toContain("Major Third");
  });
});
