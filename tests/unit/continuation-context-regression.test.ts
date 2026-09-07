import { expect, test } from "bun:test";
import { deriveContinuationSuggestions, parseChordSymbol, resolutionOperations } from "../../src/theory";
import { createStudioCompositionOverState, createStudioApplicationDependencies, validateDocumentSemantics } from "../../src/application";
import { decodeDocumentShape, type ChordSpec, type CustomChordSpec } from "../../src/domain";
import { inspectorEvent, inspectorState } from "../support/u2-inspector-fixtures";
import laws from "../fixtures/semantic-surface-conformance/law-cases.json";

function parsed(symbol: string) {
  const result = parseChordSymbol(symbol, "ascii");
  if (!result.ok) throw new Error(`Independent fixture does not parse: ${symbol}`);
  return result.chord;
}

function derive(symbols: readonly string[]) {
  return deriveContinuationSuggestions({ context: symbols.map(parsed) }, resolutionOperations);
}

test("a fully contained ii-V-I context retains useful diatonic options", () => {
  const result = derive(["Cmaj7", "Dm7", "G7"]);
  expect(result.suggestions.some(row => row.explanation.providerId === "diatonic-next" && row.symbolText === "Am7")).toBe(true);
});

test("the real starter context cannot claim all its chords sit inside C major", () => {
  const result = derive(["Cmaj7", "Bm7#5", "Ebmaj7", "E7#9"]);
  const options = result.suggestions.filter(row => row.explanation.providerId === "diatonic-next");
  expect(options.length).toBeGreaterThan(0);
  for (const option of options) expect(option.explanation.sentence).not.toMatch(/sit inside|staying in the key/u);
});

for (const fixture of laws.containmentCases) {
  test(`independent containment evidence ${fixture.id}`, () => {
    const result = derive(fixture.chords), reading = result.contextReading;
    expect(reading).not.toBeNull();
    if (reading === null) throw new Error("Missing context evidence");
    expect(reading.keyName).toBe("C");
    expect(reading.toneOccurrences).toBe(fixture.toneOccurrences);
    expect(reading.pitchClassMatches).toBe(fixture.pitchClassMatches);
    expect(reading.spellingMatches).toBe(fixture.spellingMatches);
    expect(reading.completePitchClassContainment).toBe(fixture.completePitchClassContainment);
    expect(reading.completeSpelledContainment).toBe(fixture.completeSpelledContainment);
    expect(reading.tiedMajorKeys.map<number>(key => key.pitchClass)).toEqual(fixture.bestMajorTonics);
    expect(reading.keyDeclared).toBe(false);
    expect(result.evidence.majorKeyToneComparisons).toBe(12 * fixture.toneOccurrences);
  });
}

test("starter counterevidence and double-sharp distinctions reach the actual explanation", () => {
  const result = derive(["Cmaj7", "Bm7#5", "Ebmaj7", "E7#9"]);
  expect(result.contextReading?.outsideSpellings).toEqual(["Eb", "Bb", "G#"]);
  expect(result.contextReading?.enharmonicSpellings).toEqual(["F##"]);
  for (const option of result.suggestions.filter(row => row.explanation.providerId === "diatonic-next")) {
    expect(option.explanation.sentence).toContain("14 of 17");
    expect(option.explanation.sentence).toContain("12 match the scale's spelling");
    expect(option.explanation.sentence).toContain("Outside it: Eb, Bb, G#.");
    expect(option.explanation.sentence).toContain("Different spellings: F##.");
    expect(option.explanation.sentence).toContain("G major ties");
  }
});

const roots = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
for (let shift = 0; shift < 12; shift += 1) {
  test(`starter overlap and plural ties survive transposition ${String(shift)}`, () => {
    const source = [[0, "maj7"], [11, "m7#5"], [3, "maj7"], [4, "7#9"]] as const;
    const result = derive(source.map(([root, quality]) => `${roots[(root + shift) % 12] ?? ""}${quality}`));
    const reading = result.contextReading;
    if (reading === null) throw new Error("Missing transposed evidence");
    expect(reading.pitchClassMatches).toBe(14);
    expect(reading.toneOccurrences).toBe(17);
    expect(reading.completePitchClassContainment).toBe(false);
    expect(reading.tiedMajorKeys.map<number>(key => key.pitchClass).sort((a, b) => a - b)).toEqual([shift, (7 + shift) % 12].sort((a, b) => a - b));
  });
}

test("selected altered realization changes actual tones; ambiguity and foreign IDs are explicit", () => {
  const context = [parsed("C7alt")];
  const missing = deriveContinuationSuggestions({ context }, resolutionOperations);
  expect(missing.suggestions).toEqual([]);
  expect(missing.contextBarriers[0]?.reason).toBe("selected-realization-required");
  for (const [id, expected] of [["alt-b9-b5", [0, 4, 6, 10, 1]], ["alt-sharp9-sharp5", [0, 4, 8, 10, 3]]] as const) {
    const result = deriveContinuationSuggestions({ context, selectedRealizationIds: [id] }, resolutionOperations);
    expect(result.contextReading?.tones.map(tone => tone.pitchClass)).toEqual([...expected]);
    expect(result.contextReading?.tones.every(tone => tone.realizationId === id)).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
  }
  for (const selectedRealizationIds of [["foreign"], []]) {
    const result = deriveContinuationSuggestions({ context, selectedRealizationIds }, resolutionOperations);
    expect(result.suggestions).toEqual([]);
    expect(result.contextBarriers[0]?.reason).toBe("invalid-selection");
  }
});

const custom: CustomChordSpec = { kind: "custom", sourceText: "Ccustom", label: "Ccustom", bass: null, pitchNames: [{ step: "C", alter: 0 }] };

test("custom and unsupported chords break context instead of fabricating adjacency or a root", () => {
  for (const barrier of [custom, parsed("C##maj7#5")]) {
    const result = deriveContinuationSuggestions({ context: [parsed("Cmaj7"), barrier, parsed("Am7")] }, resolutionOperations);
    expect(result.contextBarriers).toHaveLength(1);
    expect(result.contextReading?.toneOccurrences).toBe(4);
    expect(result.contextReading?.tones.every(tone => tone.contextIndex === 2)).toBe(true);
    expect(result.suggestions.some(row => row.explanation.providerId === "turnaround")).toBe(false);
    expect(result.evidence.contextEventsExamined).toBe(3);
    const last = deriveContinuationSuggestions({ context: [parsed("Dm7"), parsed("G7"), barrier] }, resolutionOperations);
    expect(last.suggestions).toEqual([]);
    expect(last.contextReading).toBeNull();
  }
});

function compositionFor(chords: readonly (ChordSpec | CustomChordSpec)[]) {
  const events = chords.map((chord, index) => inspectorEvent({ id: `context-event-${String(index)}`, chord, annotation: "Exact source", voicing: {
    mode: "manual", bassPolicy: "included", pitches: [{ step: "C", alter: 0, octave: 4 }, { step: "C", alter: 0, octave: 4 }],
  } }));
  const first = events[0]; if (first === undefined) throw new Error("Empty application fixture");
  const state = inspectorState(first), section = state.document.sections[0], measure = section?.measures[0];
  if (section === undefined || measure === undefined) throw new Error("Missing initial measure");
  const decoded = decodeDocumentShape({ ...state.document, sections: [{ ...section, measures: events.map((event, index) => ({
    ...measure, id: `context-measure-${String(index)}`, events: [event], completion: { kind: "complete" },
  })) }] });
  if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) throw new Error(JSON.stringify(published.errors));
  return createStudioCompositionOverState({ ...state, document: published.value }, createStudioApplicationDependencies());
}

test("actual controller preserves the custom barrier and all source/history/bookmark state", () => {
  const composition = compositionFor([parsed("Cmaj7"), custom, parsed("Am7")]);
  const before = composition.readApplicationState(), controller = composition.controller;
  const result = controller.readContinuationSuggestions();
  expect(result.afterLabel).toBe("Am7");
  expect(result.contextReading?.toneOccurrences).toBe(4);
  expect(result.contextNote).toContain("only the chords after Ccustom");
  expect(result.suggestions.some(row => row.explanation.providerId === "turnaround")).toBe(false);
  expect(controller.readContinuationSuggestions()).toBe(result);
  expect(composition.readApplicationState()).toBe(before);
});

test("actual controller changes selection evidence without a document edit or a stale cache", () => {
  const composition = compositionFor([parsed("C7alt")]), controller = composition.controller;
  const before = composition.readApplicationState(), selected = new Map([["context-event-0", "alt-b9-b5"]]);
  const first = controller.readContinuationSuggestions(selected);
  expect(first.contextReading?.tones.map(tone => tone.pitchClass)).toEqual([0, 4, 6, 10, 1]);
  expect(controller.readContinuationSuggestions(new Map(selected))).toBe(first);
  selected.set("context-event-0", "alt-sharp9-sharp5");
  const second = controller.readContinuationSuggestions(selected);
  expect(second).not.toBe(first);
  expect(second.contextReading?.tones.map(tone => tone.pitchClass)).toEqual([0, 4, 8, 10, 3]);
  expect(controller.readContinuationSuggestions().contextNote).toContain("Write the alterations explicitly");
  expect(composition.readApplicationState()).toBe(before);
});
