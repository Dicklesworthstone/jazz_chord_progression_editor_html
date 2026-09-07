import { describe, expect, test } from "bun:test";
import { parseChordSymbol } from "../../src/theory";
import { projectSpelledPitch } from "../../src/domain";
import { prepareInspectorSymbol, readInspectorSymbolDraft, readInspectorManualDraft, readStudioInspector } from "../../src/application/studio-inspector";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";

function setup(symbol = "Cmaj7") {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error("Invalid literal fixture");
  const state = inspectorState(inspectorEvent({ id: "u2-draft-realization", chord: parsed.chord, annotation: "Exact draft",
    voicing: { mode: "auto", family: "balanced", voiceCount: 4, bassPolicy: "generated", range: { lowMidi: 48, highMidi: 84 } } }));
  const source = { documentId: state.document.id, revision: state.revision, eventId: "u2-draft-realization" };
  return { state, source };
}

describe("U2 provisional symbol realization", () => {
  for (const [symbol, pitchClasses] of [["Dmaj7", [2, 6, 9, 1]], ["Ebmaj7", [3, 7, 10, 2]], ["Fmaj7", [5, 9, 0, 4]]] as const)
    test(`${symbol} resolves draft notes without changing the chart or keeping the previous root`, () => {
      const { state, source } = setup(), before = JSON.stringify(state);
      const draft = readInspectorSymbolDraft(state, source, symbol);
      if (!draft.ok) throw new Error(JSON.stringify(draft));
      const notes = draft.value.detail.voicing.activePitches;
      expect(notes).toHaveLength(4);
      const midis = notes.map(note => { const value = projectSpelledPitch(note); if (!value.ok) throw new Error("Invalid note"); return value.value.midi; });
      expect([...new Set(midis.map(midi => midi % 12))].sort((a, b) => a - b)).toEqual([...pitchClasses].sort((a, b) => a - b));
      expect(draft.value.detail.symbol).toMatchObject({ sourceText: "Cmaj7", draftText: symbol, isDirty: true });
      expect(draft.value.detail.preview.kind).toBe("idle");
      expect(JSON.stringify(state)).toBe(before);
      expect(readStudioInspector(state, source.eventId).ok).toBe(true);
    });

  test("a syntax-invalid draft keeps exact text and offers no stale audition", () => {
    const { state, source } = setup(), text = "Cmaj7(!?)";
    const draft = readInspectorSymbolDraft(state, source, text);
    if (!draft.ok) throw new Error(JSON.stringify(draft));
    expect(draft.value.text).toBe(text);
    expect(draft.value.detail.symbol.isValidSyntax).toBe(false);
    expect(draft.value.detail.voicing.activePitches).toEqual([]);
    expect(draft.value.detail.preview.kind).toBe("unavailable");
  });

  test("altered tension labels retain their explicit semitone alterations", () => {
    const { state, source } = setup();
    const draft = readInspectorSymbolDraft(state, source, "G7(b9,#11)", undefined, false);
    if (!draft.ok) throw new Error(JSON.stringify(draft));
    expect(draft.value.detail.harmony.tensions).toEqual(["b9", "#11"]);
    expect(draft.value.detail.harmony.characteristicTones).toEqual(["Ab", "C#"]);
    expect(draft.value.detail.voicing.activePitches).toEqual([]);
    expect(draft.value.detail.preview.kind).toBe("unavailable");
  });

  test("repeated draft reads cannot bypass source ownership, confirmation, or exact draft text", () => {
    const { state, source } = setup();
    expect(readInspectorSymbolDraft(state, source, "Dmaj7").ok).toBe(true);
    expect(prepareInspectorSymbol(state, { ...source, revision: source.revision + 1 }, "Dmaj7", true))
      .toMatchObject({ ok: false, code: "u2.stale_source" });
    expect(prepareInspectorSymbol(state, source, "!?", true)).toMatchObject({ ok: false, code: "u2.invalid_symbol_syntax" });
    const replacement = readInspectorSymbolDraft(state, source, "Ebmaj7");
    if (!replacement.ok) throw new Error(JSON.stringify(replacement));
    expect(replacement.value.detail.voicing.activePitches.map(pitch => pitch.step).sort()).toEqual(["B", "D", "E", "G"]);

    const first = state.document.sections[0]?.measures[0]?.events[0];
    if (first === undefined) throw new Error("Missing independently constructed chord");
    expect(readInspectorSymbolDraft(state, source, "C7").ok).toBe(true);
    const manual = inspectorState(inspectorEvent({ ...first,
      id: source.eventId, voicing: { mode: "manual", bassPolicy: "included", pitches: [{ step: "C", alter: 0, octave: 3 }] } }));
    const manualSource = { ...source, documentId: manual.document.id, revision: manual.revision };
    expect(manualSource).toEqual(source);
    const warm = readInspectorSymbolDraft(manual, manualSource, "C7");
    if (!warm.ok) throw new Error(JSON.stringify(warm));
    expect(warm.value.detail.voicing.activePitches).toEqual([{ step: "C", alter: 0, octave: 3 }]);
    expect(prepareInspectorSymbol(manual, manualSource, "C7", false))
      .toMatchObject({ ok: false, code: "u2.mode_switch_requires_confirmation" });
    const confirmed = prepareInspectorSymbol(manual, manualSource, "C7", true);
    if (!confirmed.ok) throw new Error(JSON.stringify(confirmed));
    expect(confirmed.value.voicing).toMatchObject({ mode: "manual", pitches: [{ step: "C", alter: 0, octave: 3 }] });
  });
});

describe("U2 exact Manual draft piano", () => {
  test("draft order and duplicates light the actual MIDI coordinates without changing the saved notes", () => {
    const { state, source } = setup(), before = JSON.stringify(state);
    const pitches = [{ step: "G", alter: 0, octave: 5 }, { step: "C", alter: 0, octave: 3 }, { step: "C", alter: 0, octave: 3 }] as const;
    const draft = readInspectorManualDraft(state, source, pitches, "included");
    if (!draft.ok) throw new Error(JSON.stringify(draft));
    expect(draft.value.voicing.activePitches).toEqual(pitches);
    expect(draft.value.piano.activeMidiNotes).toEqual([79, 48, 48]);
    expect(draft.value.piano.keys.filter(key => key.isActiveVoiced).map(key => key.midi)).toEqual([48, 79]);
    expect(draft.value.piano.keys[48]?.accessibleLabel).toBe("C3, Root; C3, Root");
    expect(draft.value.piano).toMatchObject({ visibleMinMidi: 36, visibleMaxMidi: 84 });
    expect(JSON.stringify(state)).toBe(before);
    expect(readInspectorManualDraft(state, source, [{ step: "C", alter: 1, octave: 4 }], "included").ok).toBe(false);
    expect(readInspectorManualDraft(state, source, [...pitches, { step: "C", alter: 0, octave: 10 }], "included").ok).toBe(false);
  });
});
