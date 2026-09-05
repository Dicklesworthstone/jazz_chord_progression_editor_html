import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { decodeDocumentShape, type ChordSpec, type ValidatedDocument } from "../../src/domain";
import { validateDocumentSemantics } from "../../src/application/document-validation";
import { createLeadSheetTextExportCoordinator, sanitizeExportFilename, supportedDocumentProjectionEquals } from "../../src/export";
import { formatChordSymbol, parseChartText, type ChartDraftEvent, type ChartTextDraft } from "../../src/theory";

// Authored from E0 §5 and the literal JSON fixture; no production serializer generates this oracle.
const expectedText = readFileSync(new URL("../fixtures/lifecycle-dialogs/text-export-expected.txt", import.meta.url), "utf8");

function validated(value: unknown): ValidatedDocument {
  const decoded = decodeDocumentShape(value);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded));
  const result = validateDocumentSemantics(decoded.value);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.value;
}

const source: unknown = JSON.parse(readFileSync(new URL("../fixtures/lifecycle-dialogs/text-export-document.json", import.meta.url), "utf8"));
const document = validated(source);
function draft(text: string): ChartTextDraft {
  const parsed = parseChartText(text, { mode: "document" }, "ascii");
  if (!parsed.ok) throw new Error(JSON.stringify(parsed));
  return parsed.draft;
}
const encode = createLeadSheetTextExportCoordinator({ formatChordSymbol, parseChartText,
  supportedDocumentProjectionEquals, sanitizeExportFilename });

describe("E0 supported text projection independently compares values", () => {
  test("escaped names, annotations and all three voicing losses match literal text", () => {
    const before = JSON.stringify(document);
    const result = encode({ document, accidentalStyle: "ascii", contextualAnalysis: "present" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.value.text).toBe(expectedText);
    expect(result.value.byteLength).toBe(new TextEncoder().encode(expectedText).length);
    expect(supportedDocumentProjectionEquals(document, draft(expectedText))).toBe(true);
    expect(result.value.lossReport.countsByCode).toEqual({
      "text.loss.stable_identities": 1, "text.loss.playback_settings": 1,
      "text.loss.derived_analysis": 1, "text.loss.section_key_override": 1,
      "text.loss.section_voice_leading_boundary": 1, "text.loss.source_symbol_alias": 1,
      "text.loss.auto_voicing_policy": 1, "text.loss.manual_voicing": 1, "text.loss.frozen_voicing": 1,
    });
    expect(result.value.lossReport.items).toEqual([
      { code: "text.loss.stable_identities", path: [] },
      { code: "text.loss.derived_analysis", path: [] },
      { code: "text.loss.playback_settings", path: ["playback"] },
      { code: "text.loss.section_key_override", path: ["sections", 0, "keyOverride"] },
      { code: "text.loss.source_symbol_alias", path: ["sections", 0, "measures", 0, "events", 0, "chord", "sourceText"] },
      { code: "text.loss.auto_voicing_policy", path: ["sections", 0, "measures", 0, "events", 0, "voicing"] },
      { code: "text.loss.manual_voicing", path: ["sections", 0, "measures", 1, "events", 0, "voicing"] },
      { code: "text.loss.frozen_voicing", path: ["sections", 0, "measures", 2, "events", 0, "voicing"] },
      { code: "text.loss.section_voice_leading_boundary", path: ["sections", 0, "voiceLeadingBoundary"] },
    ]);
    expect(JSON.stringify(document)).toBe(before);
  });

  for (const [label, mutate] of Object.entries({
    title: (d: ChartTextDraft) => ({ ...d, headers: { ...d.headers, title: "other" } }),
    description: (d: ChartTextDraft) => ({ ...d, headers: { ...d.headers, description: "other" } }),
    tempo: (d: ChartTextDraft) => ({ ...d, headers: { ...d.headers, tempoBpm: 133 } }),
    meter: (d: ChartTextDraft) => ({ ...d, headers: { ...d.headers, meter: { beatsPerBar: 4 as const, beatUnit: 8 as const } } }),
    key: (d: ChartTextDraft) => ({ ...d, headers: { ...d.headers, key: null } }),
    sections: (d: ChartTextDraft) => ({ ...d, sections: d.sections.slice(1) }),
    sectionName: (d: ChartTextDraft) => ({ ...d, sections: d.sections.map(s => ({ ...s, name: "other" })) }),
    sectionAnnotation: (d: ChartTextDraft) => ({ ...d, sections: d.sections.map(s => ({ ...s, annotation: "other" })) }),
    measures: (d: ChartTextDraft) => ({ ...d, sections: d.sections.map(s => ({ ...s, measures: s.measures.slice(1) })) }),
    events: (d: ChartTextDraft) => mapEvents(d, () => []),
    annotation: (d: ChartTextDraft) => mapEvents(d, e => [{ ...e, annotation: "other" }]),
    duration: (d: ChartTextDraft) => mapEvents(d, e => [{ ...e, duration: { ...e.duration, numerator: 3 } }]),
  })) {
    test(`${label} mutation cannot pass the projection gate`, () => {
      const parsed = draft(expectedText);
      expect(supportedDocumentProjectionEquals(document, parsed)).toBe(true);
      expect(supportedDocumentProjectionEquals(document, mutate(parsed))).toBe(false);
    });
  }

  for (const chord of ["Cmaj7", "D7(#9)", "B#7(#9)", "C7(b9)", "C7(#9)/E", "C7(#9,no5)", "Cm7(#9)", "C7alt"]) {
    test(`changed chord ${chord} refuses, including enharmonic substitution`, () => {
      expect(supportedDocumentProjectionEquals(document, draft(expectedText.replace("C7#9:4", `${chord}:4`)))).toBe(false);
    });
  }

  const chordMutations: Readonly<Record<string, (chord: ChordSpec) => ChordSpec>> = {
    rootStep: c => ({ ...c, root: { ...c.root, step: "D" } }),
    rootAccidental: c => ({ ...c, root: { ...c.root, alter: 1 } }),
    triad: c => ({ ...c, triad: "diminished" }),
    sixth: c => ({ ...c, sixth: { number: 6, alter: 0 } }),
    seventh: c => ({ ...c, seventh: "diminished" }),
    extensions: c => ({ ...c, extensions: [{ number: 9, alter: 0 }] }),
    additions: c => ({ ...c, additions: [{ number: 11, alter: 0 }] }),
    alterations: c => ({ ...c, alterations: [{ number: 9, alter: -1 }] }),
    omissions: c => ({ ...c, omissions: [5] }),
    bass: c => ({ ...c, bass: { step: "G", alter: 0 } }),
    colorPolicy: c => ({ ...c, colorPolicy: "altered-dominant" }),
  };
  for (const [field, mutate] of Object.entries(chordMutations)) {
    test(`independent ${field} AST mutation is detected`, () => {
      const parsed = draft(expectedText);
      const changed = mapEvents(parsed, e => [e.ordinal === 0 ? { ...e, chord: mutate(e.chord) } : e]);
      expect(supportedDocumentProjectionEquals(document, parsed)).toBe(true);
      expect(supportedDocumentProjectionEquals(document, changed)).toBe(false);
    });
  }

  test("exact rational duration components and spelled key components are each checked", () => {
    const parsed = draft(expectedText);
    const changedDuration = mapEvents(parsed, e => [{ ...e, duration: { ...e.duration, denominator: 2 } }]);
    expect(supportedDocumentProjectionEquals(document, changedDuration)).toBe(false);
    for (const key of [
      { tonic: { step: "A", alter: 1 }, mode: "major" },
      { tonic: { step: "B", alter: 0 }, mode: "major" },
      { tonic: { step: "B", alter: -1 }, mode: "natural-minor" },
    ] as const) {
      expect(supportedDocumentProjectionEquals(document, { ...parsed, headers: { ...parsed.headers, key } })).toBe(false);
    }
  });

  for (const root of ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]) {
    test(`${root} transposition preserves written harmony and exact repeated durations`, () => {
      const text = `@title "Transposition"\n@description ""\n@meter 4/4\n@tempo 120\n[A]\n| ${root}7:1 ${root}7:3 "repeat" | |\n[B]\n| ${root}7:4 |\n`;
      const parsed = draft(text);
      // These literal AST values come from separately authored document data,
      // not the parser or the encoder under test.
      const step = root[0];
      const alter = root.endsWith("#") ? 1 : root.endsWith("b") ? -1 : 0;
      const event = { id: "event-t-1", annotation: "", duration: { numerator: 1, denominator: 1 },
        chord: { kind: "parsed", sourceText: `${root}7`, root: { step, alter }, triad: "major", sixth: null,
          seventh: "minor", extensions: [], additions: [], alterations: [], omissions: [], bass: null, colorPolicy: "none" },
        voicing: { mode: "auto", family: "balanced", voiceCount: 4, range: { lowMidi: 48, highMidi: 72 }, bassPolicy: "generated" } };
      const doc = validated({ ...document, title: "Transposition", description: "", tempoBpm: 120, key: null,
        sections: [{ id: "section-t-a", name: "A", annotation: "", keyOverride: null, voiceLeadingBoundary: "reset",
          measures: [{ id: "measure-t-1", completion: { kind: "complete" }, events: [event,
            { ...event, id: "event-t-2", duration: { numerator: 3, denominator: 1 }, annotation: "repeat" }] },
          { id: "measure-t-empty", completion: { kind: "empty" }, events: [] }] },
        { id: "section-t-b", name: "B", annotation: "", keyOverride: null, voiceLeadingBoundary: "reset",
          measures: [{ id: "measure-t-2", completion: { kind: "complete" }, events: [
            { ...event, id: "event-t-3", duration: { numerator: 4, denominator: 1 } }] }] }] });
      expect(supportedDocumentProjectionEquals(doc, parsed)).toBe(true);
      const result = encode({ document: doc, accidentalStyle: "ascii", contextualAnalysis: "none" });
      expect(result.ok && result.value.text).toBe(text);
    });
  }

  test("the real coordinator rejects a parseable but changed emitted structure", () => {
    const badEncoder = createLeadSheetTextExportCoordinator({ formatChordSymbol: () => ({ ok: true, canonicalText: "D7" }),
      parseChartText, supportedDocumentProjectionEquals, sanitizeExportFilename });
    expect(badEncoder({ document, accidentalStyle: "ascii", contextualAnalysis: "none" })).toMatchObject({
      ok: false, refusal: { code: "export.text_round_trip_projection_mismatch" } });
  });

  test("fractional beats survive literally and a repeat never copies the preceding annotation", () => {
    const section = document.sections[0];
    const measure = section?.measures[0];
    const event = measure?.events[0];
    if (section === undefined || measure === undefined || event === undefined) throw new Error("LITERAL_FIXTURE_MISSING");
    const doc = validated({ ...document, sections: [{ ...section, measures: [{ ...measure, events: [
      { ...event, duration: { numerator: 2, denominator: 3 } },
      { ...event, id: "event-u5-fraction-repeat", annotation: "", duration: { numerator: 10, denominator: 3 } },
    ] }] }] });
    const literal = expectedText.slice(0, expectedText.indexOf("| C7#9")) + '| C7#9:2/3 "altered dominant" /:10/3 |\n';
    const result = encode({ document: doc, accidentalStyle: "ascii", contextualAnalysis: "none" });
    expect(result.ok && result.value.text).toBe(literal);
    const parsed = draft(literal);
    expect(supportedDocumentProjectionEquals(doc, parsed)).toBe(true);
    expect(parsed.sections[0]?.measures[0]?.events[1]?.annotation).toBe("");
    const duration: unknown = parsed.sections[0]?.measures[0]?.events[1]?.duration;
    expect(duration).toEqual({ numerator: 10, denominator: 3 });
  });

  test("empty structure, Custom and incomplete measures fail without dropping them", () => {
    const original: unknown = JSON.parse(readFileSync(new URL("../fixtures/interchange/goldens/nested.changes.json", import.meta.url), "utf8"));
    const custom = validated(original);
    for (const [doc, code] of [
      [validated({ ...document, sections: [] }), "export.text.document_empty"],
      [custom, "export.text.custom_chord_unsupported"],
      [validated({ ...custom, sections: custom.sections.map(s => ({ ...s, measures: s.measures.slice(2) })) }), "export.text.measure_completion_unsupported"],
    ] as const) {
      expect(encode({ document: doc, accidentalStyle: "ascii", contextualAnalysis: "none" })).toMatchObject({ ok: false, refusal: { code } });
    }
  });
});

function mapEvents(d: ChartTextDraft, map: (event: ChartDraftEvent) => readonly ChartDraftEvent[]): ChartTextDraft {
  return { ...d, sections: d.sections.map(s => ({ ...s, measures: s.measures.map(m => ({ ...m, events: m.events.flatMap(map) })) })) };
}
