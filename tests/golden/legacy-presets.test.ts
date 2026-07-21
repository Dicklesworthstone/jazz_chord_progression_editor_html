import { describe, expect, test } from "bun:test";

import {
  migrateLegacyJson,
  type LegacyMigrationCandidate,
  type LegacyReportCode,
} from "../../src/compatibility";
import {
  parseStableId,
  type Alteration,
  type IdFactoryResult,
  type NonEmptySpelledPitches,
  type SpelledPitch,
  type SpelledPitchClass,
  type StableIdFactory,
  type StableIdKind,
  type Step,
} from "../../src/domain";
import {
  resolutionOperations,
  syntaxOperations,
  type ChordSymbolParseResult,
  type SemanticRealizationId,
} from "../../src/theory";
import { c0EvidenceDigest } from "../../scripts/verify-c0-evidence";
import presetExpectationsValue from "../fixtures/legacy-migration/preset-expectations.json";
import legacyPresetsValue from "../fixtures/legacy-migration/legacy-presets-source.json";

type JsonRecord = Record<string, unknown>;

const EXPECTATION_CATEGORIES = [
  "directNameParsedManual",
  "rootTypeFallbackParsedManual",
  "directNameSpellingConflict",
  "directNameSoundingConflict",
  "rootTypeFallbackConflict",
  "noParseableSymbol",
] as const;

type ExpectationCategory = (typeof EXPECTATION_CATEGORIES)[number];

type IndexedExpectation = Readonly<{
  category: ExpectationCategory;
  row: JsonRecord;
}>;

type SourceChord = Readonly<{
  id: string;
  sectionIndex: number;
  chordIndex: number;
  value: JsonRecord;
}>;

type SourceSection = Readonly<{
  value: JsonRecord;
  chords: readonly SourceChord[];
}>;

type SourcePreset = Readonly<{
  legacyPresetId: string;
  value: JsonRecord;
  sections: readonly SourceSection[];
}>;

const SCIENTIFIC_PITCH = /^([A-G])(bb|##|b|#)?(0|-?[1-9][0-9]*)$/;

function fixtureRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`C0_GOLDEN_EXPECTED_RECORD:${label}`);
  }
  return value as JsonRecord;
}

function fixtureArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`C0_GOLDEN_EXPECTED_ARRAY:${label}`);
  }
  return value;
}

function fixtureString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`C0_GOLDEN_EXPECTED_STRING:${label}`);
  }
  return value;
}

function fixtureNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`C0_GOLDEN_EXPECTED_INTEGER:${label}`);
  }
  return value;
}

function fixtureBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`C0_GOLDEN_EXPECTED_BOOLEAN:${label}`);
  }
  return value;
}

function sourcePresets(): readonly SourcePreset[] {
  const fixture = fixtureRecord(legacyPresetsValue, "legacy source");
  return fixtureArray(fixture["presets"], "legacy source.presets").map(
    (presetValue, presetIndex) => {
      const preset = fixtureRecord(presetValue, `preset ${String(presetIndex)}`);
      const legacyPresetId = fixtureString(
        preset["legacyPresetId"],
        `preset ${String(presetIndex)}.legacyPresetId`,
      );
      const sections = fixtureArray(
        preset["sections"],
        `${legacyPresetId}.sections`,
      ).map((sectionValue, sectionIndex): SourceSection => {
        const section = fixtureRecord(
          sectionValue,
          `${legacyPresetId}.sections[${String(sectionIndex)}]`,
        );
        const chords = fixtureArray(
          section["chords"],
          `${legacyPresetId}.sections[${String(sectionIndex)}].chords`,
        ).map((chordValue, chordIndex): SourceChord => ({
          id: `${legacyPresetId}:${String(sectionIndex)}:${String(chordIndex)}`,
          sectionIndex,
          chordIndex,
          value: fixtureRecord(
            chordValue,
            `${legacyPresetId}:${String(sectionIndex)}:${String(chordIndex)}`,
          ),
        }));
        return Object.freeze({ value: section, chords: Object.freeze(chords) });
      });
      return Object.freeze({
        legacyPresetId,
        value: preset,
        sections: Object.freeze(sections),
      });
    },
  );
}

function expectationIndex(): ReadonlyMap<string, IndexedExpectation> {
  const fixture = fixtureRecord(presetExpectationsValue, "preset expectations");
  const indexed = new Map<string, IndexedExpectation>();
  for (const category of EXPECTATION_CATEGORIES) {
    const rows = fixtureArray(fixture[category], `expectations.${category}`);
    for (const [rowIndex, rowValue] of rows.entries()) {
      const row = fixtureRecord(
        rowValue,
        `expectations.${category}[${String(rowIndex)}]`,
      );
      const id = fixtureString(row["id"], `${category}.id`);
      if (indexed.has(id)) {
        throw new TypeError(`C0_GOLDEN_DUPLICATE_EXPECTATION:${id}`);
      }
      indexed.set(id, Object.freeze({ category, row }));
    }
  }
  return indexed;
}

function expectedCount(field: string): number {
  const fixture = fixtureRecord(presetExpectationsValue, "preset expectations");
  const counts = fixtureRecord(fixture["expectedCounts"], "expectedCounts");
  return fixtureNumber(counts[field], `expectedCounts.${field}`);
}

function deterministicIdFactory(prefix: string): StableIdFactory {
  let ordinal = 0;
  return {
    next<K extends StableIdKind>(kind: K): IdFactoryResult<K> {
      ordinal += 1;
      const parsed = parseStableId(
        kind,
        `${prefix}-${kind}-${String(ordinal)}`,
      );
      if (!parsed.ok) {
        return {
          ok: false,
          refusal: {
            code: "id.factory_exhausted",
            kind,
            path: ["id"],
          },
        };
      }
      return {
        ok: true,
        value: parsed.value,
        source: "deterministic-test",
      };
    },
  };
}

function migratePreset(
  sourceBytes: Uint8Array,
  idPrefix: string,
): LegacyMigrationCandidate {
  const result = migrateLegacyJson(
    { sourceBytes },
    {
      idFactory: deterministicIdFactory(idPrefix),
      parseChordSymbol: syntaxOperations.parseChordSymbol,
      resolveChord: resolutionOperations.resolveChord,
    },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new TypeError(`C0_GOLDEN_MIGRATION_REFUSED:${result.refusal.code}`);
  }
  return result.value;
}

function onePresetDocument(preset: SourcePreset): JsonRecord {
  return {
    name: preset.value["name"],
    description: preset.value["description"],
    sections: structuredClone(preset.value["sections"]),
  };
}

function resultProjection(
  candidate: LegacyMigrationCandidate,
  source: SourceChord,
): JsonRecord {
  const event = candidate.document.sections[source.sectionIndex]
    ?.measures[source.chordIndex]?.events[0];
  if (event === undefined) {
    throw new TypeError(`C0_GOLDEN_EVENT_MISSING:${source.id}`);
  }
  const sourcePath = [
    "sections",
    source.sectionIndex,
    "chords",
    source.chordIndex,
  ] as const;
  const beginsAtSource = (path: readonly (string | number)[]): boolean =>
    sourcePath.every((segment, index) => path[index] === segment);
  const reportItems = [
    ...candidate.report.groups.preserved,
    ...candidate.report.groups.canonicalized,
    ...candidate.report.groups.custom,
    ...candidate.report.groups.ignored,
    ...candidate.report.groups.rejected,
  ].filter(({ sourcePath: itemPath }) => beginsAtSource(itemPath));
  const identityMappings = candidate.report.identityMappings.filter(
    ({ sourcePath: itemPath }) => beginsAtSource(itemPath),
  );
  return { event, reportItems, identityMappings };
}

function expectedChordIdOrdinals(
  preset: SourcePreset,
  source: SourceChord,
): Readonly<{ measure: number; event: number }> {
  let ordinal = 1; // document
  for (let sectionIndex = 0; sectionIndex <= source.sectionIndex; sectionIndex += 1) {
    const section = preset.sections[sectionIndex];
    if (section === undefined) {
      throw new TypeError(`C0_GOLDEN_EXPECTED_SECTION:${source.id}`);
    }
    ordinal += 1; // section
    if (sectionIndex === source.sectionIndex) {
      const measure = ordinal + source.chordIndex * 2 + 1;
      return Object.freeze({ measure, event: measure + 1 });
    }
    ordinal += section.chords.length * 2;
  }
  throw new TypeError(`C0_GOLDEN_EXPECTED_ORDINAL:${source.id}`);
}

function expectedCustomCode(category: ExpectationCategory): LegacyReportCode | null {
  switch (category) {
    case "directNameSpellingConflict":
      return "legacy.custom.name_notes_spelling_conflict";
    case "directNameSoundingConflict":
      return "legacy.custom.name_notes_sounding_conflict";
    case "rootTypeFallbackConflict":
      return "legacy.custom.constructed_notes_conflict";
    case "noParseableSymbol":
      return "legacy.custom.notes_without_symbol";
    case "directNameParsedManual":
    case "rootTypeFallbackParsedManual":
      return null;
  }
}

function expectedPresetResultProjection(
  preset: SourcePreset,
  source: SourceChord,
  expectation: IndexedExpectation,
  idPrefix: string,
): JsonRecord {
  const sourceName = fixtureString(source.value["name"], `${source.id}.name`);
  const annotation = fixtureString(
    source.value["annotation"],
    `${source.id}.annotation`,
  );
  const pitches = sourceNotes(source.value, source.id);
  const sourcePath = [
    "sections",
    source.sectionIndex,
    "chords",
    source.chordIndex,
  ] as const;
  const measurePath = [
    "sections",
    source.sectionIndex,
    "measures",
    source.chordIndex,
  ] as const;
  const eventPath = [...measurePath, "events", 0] as const;
  const ordinals = expectedChordIdOrdinals(preset, source);

  const chord = expectation.category === "directNameParsedManual"
    ? parseSuccess(sourceName, `${source.id}.expected-direct`).chord
    : expectation.category === "rootTypeFallbackParsedManual"
    ? parseSuccess(
      fixtureString(
        expectation.row["constructedText"],
        `${source.id}.constructedText`,
      ),
      `${source.id}.expected-fallback`,
    ).chord
    : {
      kind: "custom" as const,
      sourceText: sourceName,
      label: sourceName,
      pitchNames: stablePitchNames(pitches),
      bass: null,
    };

  const reportItems: JsonRecord[] = [
    {
      group: "preserved",
      code: "legacy.preserved.annotation",
      sourcePath: [...sourcePath, "annotation"],
      targetPath: [...eventPath, "annotation"],
    },
  ];
  if (
    expectation.category === "directNameParsedManual" ||
    expectation.category === "directNameSpellingConflict" ||
    expectation.category === "directNameSoundingConflict"
  ) {
    reportItems.push({
      group: "preserved",
      code: "legacy.preserved.symbol",
      sourcePath: [...sourcePath, "name"],
      targetPath: [...eventPath, "chord"],
    });
  }
  reportItems.push({
    group: "preserved",
    code: "legacy.preserved.manual_notes",
    sourcePath: [...sourcePath, "notes"],
    targetPath: [...eventPath, "voicing", "pitches"],
  });
  if (
    expectation.category === "rootTypeFallbackParsedManual" ||
    expectation.category === "rootTypeFallbackConflict"
  ) {
    reportItems.push({
      group: "canonicalized",
      code: "legacy.canonicalized.symbol_from_root_type",
      sourcePath,
      targetPath: [...eventPath, "chord"],
    });
  }
  reportItems.push({
    group: "canonicalized",
    code: "legacy.canonicalized.meter_duration_default",
    sourcePath,
    targetPath: measurePath,
  });
  const customCode = expectedCustomCode(expectation.category);
  if (customCode !== null) {
    reportItems.push({
      group: "custom",
      code: customCode,
      sourcePath,
      targetPath: [...eventPath, "chord"],
    });
  }
  const ignoredItems: JsonRecord[] = [];
  for (const flag of ["b13", "b5", "b9", "s11", "s5", "s9"] as const) {
    if (Object.hasOwn(source.value, flag)) {
      ignoredItems.push({
        group: "ignored",
        code: "legacy.ignored.alteration_evidence",
        sourcePath: [...sourcePath, flag],
        targetPath: null,
      });
    }
  }
  if (
    expectation.category === "rootTypeFallbackParsedManual" ||
    expectation.category === "rootTypeFallbackConflict" ||
    expectation.category === "noParseableSymbol"
  ) {
    ignoredItems.push({
      group: "ignored",
      code: "legacy.ignored.name_parse_failure",
      sourcePath: [...sourcePath, "name"],
      targetPath: null,
    });
  }
  if (source.value["type"] === "7sus4") {
    ignoredItems.push({
      group: "ignored",
      code: "legacy.ignored.unknown_type",
      sourcePath: [...sourcePath, "type"],
      targetPath: null,
    });
  }
  ignoredItems.sort((left, right) => {
    const leftPath = fixtureArray(left["sourcePath"], "expected ignored path");
    const rightPath = fixtureArray(right["sourcePath"], "expected ignored path");
    const leftField = fixtureString(leftPath.at(-1), "expected ignored field");
    const rightField = fixtureString(rightPath.at(-1), "expected ignored field");
    return leftField < rightField ? -1 : leftField > rightField ? 1 : 0;
  });
  reportItems.push(...ignoredItems);

  return {
    event: {
      id: `${idPrefix}-event-${String(ordinals.event)}`,
      duration: { numerator: 4, denominator: 1 },
      annotation,
      chord,
      voicing: {
        mode: "manual",
        pitches,
        bassPolicy: "included",
      },
    },
    reportItems,
    identityMappings: [
      {
        sourcePath,
        targetPath: [...measurePath, "id"],
        kind: "measure",
        id: `${idPrefix}-measure-${String(ordinals.measure)}`,
      },
      {
        sourcePath,
        targetPath: [...eventPath, "id"],
        kind: "event",
        id: `${idPrefix}-event-${String(ordinals.event)}`,
      },
    ],
  };
}

function pitchStep(value: string, label: string): Step {
  if (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "E" ||
    value === "F" ||
    value === "G"
  ) {
    return value;
  }
  throw new TypeError(`C0_GOLDEN_INVALID_STEP:${label}`);
}

function pitchAlteration(value: string | undefined, label: string): Alteration {
  switch (value) {
    case undefined:
      return 0;
    case "bb":
      return -2;
    case "b":
      return -1;
    case "#":
      return 1;
    case "##":
      return 2;
    default:
      throw new TypeError(`C0_GOLDEN_INVALID_ACCIDENTAL:${label}`);
  }
}

function parseFixturePitch(source: string, label: string): SpelledPitch {
  const match = SCIENTIFIC_PITCH.exec(source);
  if (match === null) {
    throw new TypeError(`C0_GOLDEN_INVALID_SCIENTIFIC_PITCH:${label}`);
  }
  const stepText = match[1];
  const octaveText = match[3];
  if (stepText === undefined || octaveText === undefined) {
    throw new TypeError(`C0_GOLDEN_INCOMPLETE_SCIENTIFIC_PITCH:${label}`);
  }
  const octave = Number(octaveText);
  if (!Number.isSafeInteger(octave)) {
    throw new TypeError(`C0_GOLDEN_INVALID_OCTAVE:${label}`);
  }
  return Object.freeze({
    step: pitchStep(stepText, label),
    alter: pitchAlteration(match[2], label),
    octave,
  });
}

function sourceNotes(chord: JsonRecord, id: string): NonEmptySpelledPitches {
  const pitches = fixtureArray(chord["notes"], `${id}.notes`).map((value, index) =>
    parseFixturePitch(
      fixtureString(value, `${id}.notes[${String(index)}]`),
      `${id}.notes[${String(index)}]`,
    ),
  );
  const first = pitches[0];
  if (first === undefined) {
    throw new TypeError(`C0_GOLDEN_EXPECTED_NONEMPTY_NOTES:${id}`);
  }
  return Object.freeze([first, ...pitches.slice(1)]);
}

function stablePitchNames(
  pitches: readonly SpelledPitch[],
): readonly [SpelledPitchClass, ...SpelledPitchClass[]] {
  const seen = new Set<string>();
  const names: SpelledPitchClass[] = [];
  for (const pitch of pitches) {
    const key = `${pitch.step}:${String(pitch.alter)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(Object.freeze({ step: pitch.step, alter: pitch.alter }));
  }
  const first = names[0];
  if (first === undefined) {
    throw new TypeError("C0_GOLDEN_EXPECTED_NONEMPTY_PITCH_NAMES");
  }
  return Object.freeze([first, ...names.slice(1)]);
}

function parseSuccess(
  sourceText: string,
  label: string,
): Extract<ChordSymbolParseResult, Readonly<{ ok: true }>> {
  const result = syntaxOperations.parseChordSymbol(sourceText, "ascii");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new TypeError(
      `C0_GOLDEN_EXPECTED_PARSE_SUCCESS:${label}:${result.diagnostics
        .map(({ code }) => code)
        .join(",")}`,
    );
  }
  return result;
}

function parseFailure(
  sourceText: string,
  label: string,
): Extract<ChordSymbolParseResult, Readonly<{ ok: false }>> {
  const result = syntaxOperations.parseChordSymbol(sourceText, "ascii");
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new TypeError(`C0_GOLDEN_EXPECTED_PARSE_FAILURE:${label}`);
  }
  return result;
}

function pathStartsWith(
  path: readonly (string | number)[],
  prefix: readonly (string | number)[],
): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

function chordReportCodes(
  candidate: LegacyMigrationCandidate,
  sourcePath: readonly (string | number)[],
): readonly LegacyReportCode[] {
  const groups = candidate.report.groups;
  return [
    ...groups.preserved,
    ...groups.canonicalized,
    ...groups.custom,
    ...groups.ignored,
    ...groups.rejected,
  ]
    .filter((item) => pathStartsWith(item.sourcePath, sourcePath))
    .map(({ code }) => code);
}

function customCodesAt(
  candidate: LegacyMigrationCandidate,
  sourcePath: readonly (string | number)[],
): readonly LegacyReportCode[] {
  return candidate.report.groups.custom
    .filter((item) => pathStartsWith(item.sourcePath, sourcePath))
    .map(({ code }) => code);
}

function expectedDiagnosticCodes(row: JsonRecord, id: string): readonly string[] {
  return fixtureArray(
    row["nameDiagnosticCodes"],
    `${id}.nameDiagnosticCodes`,
  ).map((value, index) =>
    fixtureString(value, `${id}.nameDiagnosticCodes[${String(index)}]`),
  );
}

function semanticRealizationId(value: string, label: string): SemanticRealizationId {
  switch (value) {
    case "literal":
    case "alt-b9-b5":
    case "alt-b9-sharp5":
    case "alt-sharp9-b5":
    case "alt-sharp9-sharp5":
      return value;
    default:
      throw new TypeError(`C0_GOLDEN_INVALID_REALIZATION_ID:${label}`);
  }
}

function assertRealization(
  parsed: Extract<ChordSymbolParseResult, Readonly<{ ok: true }>>,
  realizationId: SemanticRealizationId,
  label: string,
): void {
  const resolved = resolutionOperations.resolveChord(parsed.chord);
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) {
    throw new TypeError(
      `C0_GOLDEN_EXPECTED_RESOLUTION_SUCCESS:${label}:${resolved.refusal.code}`,
    );
  }
  expect(resolved.value.realizations.map(({ id }) => id)).toContain(
    realizationId,
  );
}

function assertClassification(
  expectation: IndexedExpectation,
  source: SourceChord,
  candidate: LegacyMigrationCandidate,
): void {
  const outputSection = candidate.document.sections[source.sectionIndex];
  if (outputSection === undefined) {
    throw new TypeError(`C0_GOLDEN_SECTION_MISSING:${source.id}`);
  }
  const outputMeasure = outputSection.measures[source.chordIndex];
  if (outputMeasure === undefined) {
    throw new TypeError(`C0_GOLDEN_MEASURE_MISSING:${source.id}`);
  }
  expect(outputMeasure.events).toHaveLength(1);
  expect(outputMeasure.completion).toEqual({ kind: "complete" });
  const event = outputMeasure.events[0];
  if (event === undefined) {
    throw new TypeError(`C0_GOLDEN_EVENT_MISSING:${source.id}`);
  }

  const sourceName = fixtureString(source.value["name"], `${source.id}.name`);
  const sourceAnnotation = fixtureString(
    source.value["annotation"],
    `${source.id}.annotation`,
  );
  const pitches = sourceNotes(source.value, source.id);
  const sourcePath = [
    "sections",
    source.sectionIndex,
    "chords",
    source.chordIndex,
  ] as const;
  const reportCodes = chordReportCodes(candidate, sourcePath);

  expect(event.duration.numerator).toBe(4);
  expect(event.duration.denominator).toBe(1);
  expect(event.annotation).toBe(sourceAnnotation);
  expect(event.voicing.mode).toBe("manual");
  if (event.voicing.mode !== "manual") {
    throw new TypeError(`C0_GOLDEN_EXPECTED_MANUAL:${source.id}`);
  }
  expect(event.voicing.pitches).toEqual(pitches);
  expect(event.voicing.bassPolicy).toBe("included");
  expect(reportCodes).toContain("legacy.preserved.manual_notes");

  switch (expectation.category) {
    case "directNameParsedManual": {
      const parsed = parseSuccess(sourceName, source.id);
      expect(parsed.canonicalText).toBe(
        fixtureString(expectation.row["canonicalText"], `${source.id}.canonicalText`),
      );
      assertRealization(
        parsed,
        semanticRealizationId(
          fixtureString(
            expectation.row["realizationId"],
            `${source.id}.realizationId`,
          ),
          source.id,
        ),
        source.id,
      );
      expect(event.chord).toEqual(parsed.chord);
      expect(customCodesAt(candidate, sourcePath)).toEqual([]);
      expect(reportCodes).toContain("legacy.preserved.symbol");
      break;
    }
    case "rootTypeFallbackParsedManual": {
      const failedName = parseFailure(sourceName, source.id);
      expect(failedName.diagnostics.map(({ code }) => code).join("|")).toBe(
        expectedDiagnosticCodes(expectation.row, source.id).join("|"),
      );
      const constructedText = fixtureString(
        expectation.row["constructedText"],
        `${source.id}.constructedText`,
      );
      const parsed = parseSuccess(constructedText, source.id);
      assertRealization(
        parsed,
        semanticRealizationId(
          fixtureString(
            expectation.row["realizationId"],
            `${source.id}.realizationId`,
          ),
          source.id,
        ),
        source.id,
      );
      expect(event.chord).toEqual(parsed.chord);
      expect(customCodesAt(candidate, sourcePath)).toEqual([]);
      expect(reportCodes).toContain("legacy.ignored.name_parse_failure");
      expect(reportCodes).toContain("legacy.canonicalized.symbol_from_root_type");
      break;
    }
    case "directNameSpellingConflict": {
      const parsed = parseSuccess(sourceName, source.id);
      expect(parsed.canonicalText).toBe(
        fixtureString(expectation.row["canonicalText"], `${source.id}.canonicalText`),
      );
      assertRealization(
        parsed,
        semanticRealizationId(
          fixtureString(
            expectation.row["soundingRealizationId"],
            `${source.id}.soundingRealizationId`,
          ),
          source.id,
        ),
        source.id,
      );
      expect(customCodesAt(candidate, sourcePath)).toEqual([
        "legacy.custom.name_notes_spelling_conflict",
      ]);
      break;
    }
    case "directNameSoundingConflict": {
      const parsed = parseSuccess(sourceName, source.id);
      expect(parsed.canonicalText).toBe(
        fixtureString(expectation.row["canonicalText"], `${source.id}.canonicalText`),
      );
      expect(customCodesAt(candidate, sourcePath)).toEqual([
        "legacy.custom.name_notes_sounding_conflict",
      ]);
      break;
    }
    case "rootTypeFallbackConflict": {
      const failedName = parseFailure(sourceName, source.id);
      expect(failedName.diagnostics.map(({ code }) => code).join("|")).toBe(
        expectedDiagnosticCodes(expectation.row, source.id).join("|"),
      );
      parseSuccess(
        fixtureString(
          expectation.row["constructedText"],
          `${source.id}.constructedText`,
        ),
        source.id,
      );
      expect(customCodesAt(candidate, sourcePath)).toEqual([
        "legacy.custom.constructed_notes_conflict",
      ]);
      expect(reportCodes).toContain("legacy.ignored.name_parse_failure");
      expect(reportCodes).toContain("legacy.canonicalized.symbol_from_root_type");
      break;
    }
    case "noParseableSymbol": {
      const failedName = parseFailure(sourceName, source.id);
      expect(failedName.diagnostics.map(({ code }) => code).join("|")).toBe(
        expectedDiagnosticCodes(expectation.row, source.id).join("|"),
      );
      expect(source.value["root"]).toBe(expectation.row["root"]);
      expect(source.value["type"]).toBe(expectation.row["type"]);
      expect(expectation.row["reason"]).toBe("legacy.type_unknown");
      expect(customCodesAt(candidate, sourcePath)).toEqual([
        "legacy.custom.notes_without_symbol",
      ]);
      expect(reportCodes).toContain("legacy.ignored.unknown_type");
      break;
    }
  }

  if (
    expectation.category === "directNameSpellingConflict" ||
    expectation.category === "directNameSoundingConflict" ||
    expectation.category === "rootTypeFallbackConflict" ||
    expectation.category === "noParseableSymbol"
  ) {
    expect(event.chord.kind).toBe("custom");
    if (event.chord.kind !== "custom") {
      throw new TypeError(`C0_GOLDEN_EXPECTED_CUSTOM:${source.id}`);
    }
    expect(event.chord.sourceText).toBe(sourceName);
    expect(event.chord.label).toBe(sourceName);
    expect(event.chord.pitchNames).toEqual(stablePitchNames(pitches));
    expect(event.chord.bass).toBeNull();
  }
}

describe("TR-C0-PRESET-CORPUS independently reviewed legacy preset golden", () => {
  test("the authority partitions all 80 extracted chord locations exactly once", () => {
    const sourceFixture = fixtureRecord(legacyPresetsValue, "legacy source");
    const expectationFixture = fixtureRecord(
      presetExpectationsValue,
      "preset expectations",
    );
    expect(sourceFixture["schema"]).toBe(
      "changes.fixtures.c0-legacy-presets-source.v1",
    );
    expect(expectationFixture["schema"]).toBe(
      "changes.fixtures.c0-preset-expectations.v1",
    );
    const authority = fixtureRecord(
      expectationFixture["authority"],
      "expectations.authority",
    );
    expect(
      fixtureBoolean(
        authority["productionGenerated"],
        "authority.productionGenerated",
      ),
    ).toBe(false);

    const presets = sourcePresets();
    const sourceIds = presets.flatMap(({ sections }) =>
      sections.flatMap(({ chords }) => chords.map(({ id }) => id)),
    );
    const expectations = expectationIndex();
    expect(presets).toHaveLength(3);
    expect(sourceIds).toHaveLength(expectedCount("sourceChords"));
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect([...expectations.keys()].sort()).toEqual([...sourceIds].sort());
    expect(expectations.size).toBe(expectedCount("sourceChords"));

    for (const category of EXPECTATION_CATEGORIES) {
      const observed = [...expectations.values()].filter(
        (expectation) => expectation.category === category,
      ).length;
      expect(observed).toBe(expectedCount(category));
    }
    expect(
      expectedCount("directNameParsedManual") +
        expectedCount("rootTypeFallbackParsedManual"),
    ).toBe(expectedCount("parsedManual"));
    expect(
      expectedCount("directNameSpellingConflict") +
        expectedCount("directNameSoundingConflict") +
        expectedCount("rootTypeFallbackConflict") +
        expectedCount("noParseableSymbol"),
    ).toBe(expectedCount("customManual"));
  });

  test("migrates every preset deterministically and matches all 80 manual classifications", () => {
    const expectations = expectationIndex();
    const observedByCategory = new Map<ExpectationCategory, number>();
    let sourceChords = 0;
    let trustedNoteArrays = 0;
    let parsedManual = 0;
    let customManual = 0;
    let reportedManual = 0;
    const chordIds: string[] = [];
    const sourceRowHashes: Record<string, string> = {};
    const expectationRowHashes: Record<string, string> = {};
    const resultHashes: Record<string, string> = {};
    const replayHashes: Record<string, string> = {};

    for (const preset of sourcePresets()) {
      const legacyDocument = onePresetDocument(preset);
      expect(Object.hasOwn(legacyDocument, "legacyPresetId")).toBe(false);
      const sourceBytes = new TextEncoder().encode(JSON.stringify(legacyDocument));
      const sourceSnapshot = Uint8Array.from(sourceBytes);
      const idPrefix = `c0-golden-${preset.legacyPresetId}`;
      const first = migratePreset(sourceBytes, idPrefix);
      const second = migratePreset(sourceBytes, idPrefix);

      expect(second).toEqual(first);
      expect(sourceBytes).toEqual(sourceSnapshot);
      expect(first.document.sections).toHaveLength(preset.sections.length);
      const presetChordCount = preset.sections.reduce(
        (sum, section) => sum + section.chords.length,
        0,
      );
      expect(first.report.summary).toMatchObject({
        sourceSections: preset.sections.length,
        sourceChordSlots: presetChordCount,
        migratedSections: preset.sections.length,
        migratedEvents: presetChordCount,
        rejectedSections: 0,
        rejectedEvents: 0,
        autoEvents: 0,
        rejectedItems: 0,
      });

      for (const section of preset.sections) {
        for (const source of section.chords) {
          const expectation = expectations.get(source.id);
          if (expectation === undefined) {
            throw new TypeError(`C0_GOLDEN_EXPECTATION_MISSING:${source.id}`);
          }
          assertClassification(expectation, source, first);
          sourceChords += 1;
          trustedNoteArrays += 1;
          const outputSection = first.document.sections[source.sectionIndex];
          const event = outputSection?.measures[source.chordIndex]?.events[0];
          if (event === undefined) {
            throw new TypeError(`C0_GOLDEN_EVENT_MISSING_AFTER_ASSERT:${source.id}`);
          }
          const independentlyExpected = expectedPresetResultProjection(
            preset,
            source,
            expectation,
            idPrefix,
          );
          expect(resultProjection(first, source), `${source.id}: exact projection`).toEqual(
            independentlyExpected,
          );
          expect(resultProjection(second, source), `${source.id}: exact replay`).toEqual(
            independentlyExpected,
          );
          chordIds.push(source.id);
          sourceRowHashes[source.id] = c0EvidenceDigest(source.value);
          expectationRowHashes[source.id] = c0EvidenceDigest(expectation.row);
          resultHashes[source.id] = c0EvidenceDigest(
            resultProjection(first, source),
          );
          replayHashes[source.id] = c0EvidenceDigest(
            resultProjection(second, source),
          );
          if (event.chord.kind === "parsed") parsedManual += 1;
          else customManual += 1;
          observedByCategory.set(
            expectation.category,
            (observedByCategory.get(expectation.category) ?? 0) + 1,
          );
        }
      }
      reportedManual += first.report.groups.preserved.filter(
        ({ code }) => code === "legacy.preserved.manual_notes",
      ).length;
      expect(first.report.summary.manualEvents).toBe(presetChordCount);
      expect(first.report.summary.parsedEvents + first.report.summary.customEvents).toBe(
        presetChordCount,
      );
    }

    expect(sourceChords).toBe(expectedCount("sourceChords"));
    expect(trustedNoteArrays).toBe(expectedCount("trustedNoteArrays"));
    expect(reportedManual).toBe(expectedCount("trustedNoteArrays"));
    expect(parsedManual).toBe(expectedCount("parsedManual"));
    expect(customManual).toBe(expectedCount("customManual"));
    for (const category of EXPECTATION_CATEGORIES) {
      expect(observedByCategory.get(category) ?? 0).toBe(expectedCount(category));
    }
    expect(resultHashes).toEqual(replayHashes);

    const payload = {
      schema: "changes.evidence.c0-preset-conformance-observation.v1",
      producer: {
        file: "tests/golden/legacy-presets.test.ts",
        testcase:
          "migrates every preset deterministically and matches all 80 manual classifications",
      },
      chordIds,
      sourceRowHashes,
      expectationRowHashes,
      resultHashes,
      replayHashes,
      chordsObserved: sourceChords,
      presetsObserved: sourcePresets().length,
      sectionsObserved: sourcePresets().reduce(
        (sum, preset) => sum + preset.sections.length,
        0,
      ),
      parsedManual,
      customManual,
      deterministicReplays: sourcePresets().length,
      sourceMutations: 0,
      status: "pass",
    };
    console.log(`C0_PRESET_OBSERVATION ${JSON.stringify({
      ...payload,
      semanticDigest: c0EvidenceDigest(payload),
    })}`);
  });
});
