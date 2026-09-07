import { expect, test } from "bun:test";
import { decodeDocumentShape } from "../../src/domain";
import { parseChordSymbol } from "../../src/theory";
import { projectChordInspectorViewModel } from "../../src/application/chord-inspector";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createStudioBootstrap } from "../../src/application/studio-bootstrap";
import packet from "../fixtures/chord-inspector/inspector-cases.json";

for (const scenario of packet.cases) test(`${scenario.id}: complete real inspector projection`, () => {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("Missing real document bootstrap");
  const base = bootstrap.value.state, selected = scenario.selectedChord;
  const state = { ...base, bookmarks: { ...base.bookmarks, selection: { kind: "none" } as const } };
  if (selected !== null) {
    const parsed = parseChordSymbol(selected.symbolText, "ascii");
    const chord = parsed.ok ? parsed.chord : { kind: "custom", sourceText: selected.symbolText,
      label: selected.symbolText, bass: null,
      pitchNames: selected.pitches.map(({ step, alter }) => ({ step, alter })) };
    const event = { id: selected.id, duration: selected.duration, annotation: selected.annotation, chord,
      voicing: selected.voicingMode === "auto" && "autoPolicy" in selected ? selected.autoPolicy : {
        mode: selected.voicingMode, pitches: selected.pitches, bassPolicy: "included",
      } };
    const nextPitches = "nextVoicingPitches" in scenario ? scenario.nextVoicingPitches : undefined;
    const next = parseChordSymbol("nextChordSymbol" in scenario ? scenario.nextChordSymbol ?? "" : "Dm7", "ascii");
    if (!next.ok) throw new Error("Invalid independent next-chord fixture");
    const decoded = decodeDocumentShape({ ...base.document,
      key: "analysisContext" in scenario ? scenario.analysisContext.key : null,
      sections: [{ id: "u2-packet-section", name: "Packet", annotation: "", keyOverride: null, voiceLeadingBoundary: "reset",
        measures: [
          ...Array.from({ length: selected.measureIndex }, (_, index) => ({ id: `u2-before-${String(index)}`,
            events: [], completion: { kind: "empty" } })),
          { id: "u2-packet-measure", events: [event], completion: { kind: "complete" } },
          ...(nextPitches === undefined ? [] : [{ id: "u2-next-measure", completion: { kind: "complete" }, events: [{
            id: "u2-packet-next", chord: next.chord, duration: { numerator: 4, denominator: 1 }, annotation: "",
            voicing: { mode: "manual", bassPolicy: "included", pitches: nextPitches },
          }] }]),
        ] }],
    });
    if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
    const validated = validateDocumentSemantics(decoded.value);
    if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
    // Selection uses an actual published ID, never a forged validated brand.
    const id = validated.value.sections[0]?.measures[selected.measureIndex]?.events[0]?.id;
    if (id === undefined) throw new Error("Missing selected fixture event");
    const selectedState = { ...base, document: validated.value, bookmarks: { ...base.bookmarks,
      selection: { kind: "events", eventIds: [id], anchorEventId: id, focusEventId: id } as const } };
    const before = JSON.stringify(selectedState);
    const view = projectChordInspectorViewModel(selectedState);
    expect(view.hasSelectedEvent).toBe(scenario.expected.hasSelectedEvent);
    if (view.selectedEventId === null) throw new Error("Inspector lost the published selection");
    expect(scenario.expected.selectedEventId).toBe(view.selectedEventId);
    expect(scenario.expected.activeTab).toBe(view.activeTab);
    for (const section of ["symbol", "structure", "timing", "voicing", "harmony", "motion", "notes"] as const)
      expect(view[section]).toMatchObject(scenario.expected[section]);
    expect(JSON.stringify(selectedState)).toBe(before);
    return;
  }
  const before = JSON.stringify(state);
  expect(projectChordInspectorViewModel(state)).toMatchObject(scenario.expected);
  expect(JSON.stringify(state)).toBe(before);
});
