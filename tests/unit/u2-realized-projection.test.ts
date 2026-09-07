import { describe, expect, test } from "bun:test";
import { decodeDocumentShape, makeBeatDuration, type ChordEvent } from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import { projectChordInspectorViewModel } from "../../src/application/chord-inspector";
import { compileStudioPlaybackPlan } from "../../src/application/studio-playback";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";

function parsed(symbol: string) {
  const result = parseChordSymbol(symbol, "ascii");
  if (!result.ok) throw new Error(`Invalid literal fixture symbol: ${symbol}`);
  return result.chord;
}

const policy = { mode: "auto", family: "balanced", bassPolicy: "generated", voiceCount: 4,
  range: { lowMidi: 48, highMidi: 84 } } as const;

describe("U2 actual pitches and exact time", () => {
  test("Auto projection uses the same registered realization as the immutable playback plan", () => {
    const state = inspectorState(inspectorEvent({ id: "u2-auto-current", annotation: "", chord: parsed("Cmaj7"), voicing: policy }));
    const compiled = compileStudioPlaybackPlan(state.document);
    if (!compiled.ok) throw new Error(compiled.refusal.message);
    const event = compiled.plan.events[0];
    if (!event) throw new Error("Missing audible positive control");
    const view = projectChordInspectorViewModel(state);
    expect(view.voicing.activePitches).toEqual(event.pitches);
    expect(view.voicing.midiNoteNumbers).toEqual(event.midiPitches);
    expect(view.voicing.realizationFailure).toBeNull();
  });

  for (const [symbol, family] of [["Cmaj7", "rootless-a"], ["Dm7", "rootless-b"]] as const) {
    test(`${symbol}/${family}: unavailable template does not invent pitches`, () => {
      const state = inspectorState(inspectorEvent({ id: "u2-rootless-missing-degree", annotation: "", chord: parsed(symbol),
        voicing: { ...policy, family, bassPolicy: "external" } }));
      const view = projectChordInspectorViewModel(state);
      expect(view.voicing.activePitches).toEqual([]);
      expect(view.voicing.realizationFailure?.code).toBe("voicing.constraints_unsatisfied");
      expect(view.voicing.canSwitchToManual).toBe(false);
      expect(view.voicing.canSwitchToFrozen).toBe(false);
      expect(view.preview.kind).toBe("unavailable");
    });
  }

  test("a root draft re-resolves its degrees without relabeling the old Auto pitches", () => {
    const state = inspectorState(inspectorEvent({ id: "u2-root-draft", annotation: "", chord: parsed("Cmaj7"), voicing: policy }));
    const view = projectChordInspectorViewModel(state, { draftSymbolText: "Dbmaj7" });
    expect(view.structure.rootSpelling).toEqual({ step: "D", alter: -1 });
    expect(view.structure.degrees.map(degree => degree.pitchClass)).toEqual([1, 5, 8, 0]);
    expect(view.voicing.activePitches).toEqual([]);
    expect(view.voicing.realizationFailure?.code).toBe("u2.draft_not_realized");
    expect(state.document.sections[0]?.measures[0]?.events[0]?.chord.sourceText).toBe("Cmaj7");
  });

  test("enharmonic octave crossings and duplicate occurrences project exactly", () => {
    const pitches = [
      { step: "B", alter: 1, octave: 3 }, { step: "C", alter: 0, octave: 4 },
      { step: "C", alter: -1, octave: 5 }, { step: "C", alter: 0, octave: 4 },
    ] as const;
    const state = inspectorState(inspectorEvent({ id: "u2-crossing", annotation: "", chord: {
      kind: "custom", sourceText: "Exact crossings", label: "Exact crossings", bass: null,
      pitchNames: [{ step: "B", alter: 1 }, { step: "C", alter: 0 }, { step: "C", alter: -1 }],
    },
      voicing: { mode: "manual", pitches, bassPolicy: "included" } }));
    const view = projectChordInspectorViewModel(state);
    expect(view.voicing.activePitches).toEqual(pitches);
    expect(view.voicing.midiNoteNumbers).toEqual([60, 60, 71, 60]);
  });

  for (const completion of ["empty", "incomplete"] as const) test(`${completion} measure,7/8 meter and section boundary keep exact positions`, () => {
    const base = inspectorState(inspectorEvent({ id: "u2-timing-selected", annotation: "", chord: parsed("Cmaj7"), voicing: policy }));
    const baseEvent = base.document.sections[0]?.measures[0]?.events[0];
    if (!baseEvent) throw new Error("Missing valid timing event");
    const half = makeBeatDuration({ numerator: 1, denominator: 2 });
    const one = makeBeatDuration({ numerator: 1, denominator: 1 });
    if (!half.ok || !one.ok) throw new Error("Invalid independent exact duration");
    const selected: ChordEvent = { ...baseEvent, duration: half.value };
    const decoded = decodeDocumentShape({
      ...base.document, meter: { beatsPerBar: 7, beatUnit: 8 },
      sections: [{ id: "u2-time-a", name: "A", annotation: "", keyOverride: null, voiceLeadingBoundary: "reset",
        measures: [{ id: "u2-before", events: completion === "empty" ? [] : [{ ...baseEvent, id: "u2-before-event", duration: one.value }],
          completion: completion === "empty" ? { kind: "empty" } : { kind: "incomplete", expectedDuration: { numerator: 1, denominator: 1 }, reason: "Deliberately short" } }] },
      { id: "u2-time-b", name: "B", annotation: "", keyOverride: null, voiceLeadingBoundary: "reset",
        measures: [{ id: "u2-selected-measure", events: [{ ...baseEvent, id: "u2-offset-event", duration: one.value }, selected],
          completion: { kind: "incomplete", expectedDuration: { numerator: 3, denominator: 2 }, reason: "Continue later" } }] }],
    });
    if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
    const published = validateDocumentSemantics(decoded.value);
    if (!published.ok) throw new Error(JSON.stringify(published.errors));
    const state = { ...base, document: published.value };
    const view = projectChordInspectorViewModel(state);
    expect(view.timing.measureIndex).toBe(1);
    expect(view.timing.measureOrdinal).toBe(2);
    expect(completion === "empty" ? { numerator: 7, denominator: 2 } : { numerator: 1, denominator: 1 }).toEqual(view.timing.measureStartBeat);
    expect({ numerator: 1, denominator: 1 }).toEqual(view.timing.beatInMeasure);
    expect(view.timing.durationLabel).toBe("1/2 beats");
    expect(view.timing.isMeasureComplete).toBe(false);
  });
});
