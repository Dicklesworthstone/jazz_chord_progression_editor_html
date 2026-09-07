import { describe, expect, test } from "bun:test";
import { parseChordSymbol, VOICING_ENGINE_VERSION_TAG } from "../../src/theory";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import {
  inspectorSourceEvent, prepareInspectorAuto, prepareInspectorFrozen,
  prepareInspectorManual, prepareInspectorSymbol, readStudioInspector,
} from "../../src/application/studio-inspector";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";

const policy = { mode: "auto", family: "balanced", voiceCount: 4,
  range: { lowMidi: 48, highMidi: 84 }, bassPolicy: "generated" } as const;
function stateFor(symbol = "Cmaj7") {
  const parsed = parseChordSymbol(symbol, "ascii");
  if (!parsed.ok) throw new Error("Invalid literal symbol");
  return inspectorState(inspectorEvent({ id: "u2-edit-target", annotation: "<keep> 🎹", chord: parsed.chord, voicing: policy }));
}
function viewFor(state = stateFor()) {
  const result = readStudioInspector(state, "u2-edit-target");
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}

describe("U2 application inspector", () => {
  test("read proposals are bounded, immutable, and current notes match real playback", () => {
    const state = stateFor(), before = JSON.stringify(state), view = viewFor(state);
    const plan = compileStudioPlaybackPlan(state.document);
    if (!plan.ok) throw new Error(plan.refusal.message);
    expect(view.choices.length).toBeGreaterThan(0);
    expect(view.choices.length).toBeLessThanOrEqual(3);
    expect(view.choices.find(candidate => candidate.current)?.pitches).toEqual(plan.plan.events[0]?.pitches);
    expect(JSON.stringify(state)).toBe(before);
  });

  test("Freeze rederives notes and provenance instead of trusting forged caller fields", () => {
    const state = stateFor(), view = viewFor(state), selected = view.choices[0];
    if (!selected) throw new Error("No positive choice");
    const actual = prepareInspectorFrozen(state, view.source, selected);
    const forged = prepareInspectorFrozen(state, view.source, { ...selected,
      pitches: [{ step: "C", alter: 0, octave: 1 }],
      generatedBy: { engineVersion: "invented", family: "shell" } });
    expect(forged).toEqual(actual);
    if (!actual.ok || actual.value.mode !== "frozen") throw new Error("Expected Frozen");
    expect(actual.value.pitches).toEqual(selected.pitches);
    expect(actual.value.generatedBy).toEqual({ engineVersion: VOICING_ENGINE_VERSION_TAG, family: selected.generatedBy.family });
  });

  test("stale revisions, replaced documents and missing events refuse without writes", () => {
    const state = stateFor(), source = viewFor(state).source, before = JSON.stringify(state);
    expect(inspectorSourceEvent(state, { ...source, revision: source.revision + 1 })).toMatchObject({ ok: false, code: "u2.stale_source" });
    expect(inspectorSourceEvent(state, { ...source, documentId: "replaced" })).toMatchObject({ ok: false, code: "u2.stale_source" });
    expect(inspectorSourceEvent(state, { ...source, eventId: "missing" })).toMatchObject({ ok: false, code: "u2.no_selected_chord" });
    expect(JSON.stringify(state)).toBe(before);
  });

  test("Manual retains ordered unisons and requires confirmation before Auto", () => {
    const state = stateFor(), view = viewFor(state);
    const notes = [{ step: "G", alter: 0, octave: 4 }, { step: "C", alter: 0, octave: 4 },
      { step: "C", alter: 0, octave: 4 }, { step: "B", alter: 0, octave: 3 }] as const;
    const prepared = prepareInspectorManual(state, view.source, notes, "included");
    if (!prepared.ok) throw new Error(JSON.stringify(prepared));
    expect(prepared.value).toMatchObject({ mode: "manual", pitches: notes });
    const manual = inspectorState(inspectorEvent({ ...view.event, id: view.event.id, voicing: prepared.value }));
    const manualView = viewFor(manual);
    expect(prepareInspectorAuto(manual, manualView.source, policy, false)).toMatchObject({ ok: false, code: "u2.mode_switch_requires_confirmation" });
    expect(prepareInspectorAuto(manual, manualView.source, policy, true).ok).toBe(true);
    expect(prepareInspectorSymbol(manual, manualView.source, "Cmaj7", false).ok).toBe(false);
    expect(prepareInspectorSymbol(manual, manualView.source, "Cmaj7", true).ok).toBe(true);
  });

  test("16 exact occurrences pass; 17, empty, off-formula and off-MIDI refuse", () => {
    const state = stateFor(), source = viewFor(state).source;
    const note = { step: "C", alter: 0, octave: 4 } as const;
    expect(prepareInspectorManual(state, source, Array.from({ length: 16 }, () => note), "included").ok).toBe(true);
    expect(prepareInspectorManual(state, source, Array.from({ length: 17 }, () => note), "included").ok).toBe(false);
    expect(prepareInspectorManual(state, source, [], "included").ok).toBe(false);
    expect(prepareInspectorManual(state, source, [{ step: "F", alter: 1, octave: 4 }], "included").ok).toBe(false);
    expect(prepareInspectorManual(state, source, [{ step: "C", alter: 0, octave: -2 }], "included").ok).toBe(false);
  });

  test("Custom keeps notes at MIDI 0 and 127 and cannot silently become Auto", () => {
    const state = inspectorState(inspectorEvent({ id: "u2-edit-target", annotation: "", chord: {
      kind: "custom", label: "Full register", sourceText: "Full register", bass: null,
      pitchNames: [{ step: "C", alter: 0 }, { step: "G", alter: 0 }],
    }, voicing: { mode: "manual", bassPolicy: "included", pitches: [
      { step: "C", alter: 0, octave: -1 }, { step: "G", alter: 0, octave: 9 },
    ] } }));
    const view = viewFor(state);
    expect(view.detail.voicing.midiNoteNumbers).toEqual([0, 127]);
    expect(view.choices).toEqual([]);
    expect(prepareInspectorAuto(state, view.source, policy, true)).toMatchObject({ ok: false, code: "custom.auto_voicing_forbidden" });
  });
});
