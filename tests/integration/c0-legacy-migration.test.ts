import { describe, expect, setDefaultTimeout, test } from "bun:test";

import {
  LEGACY_MIGRATION_CANDIDATE_SCHEMA,
  LEGACY_MIGRATION_CONTRACT_SCHEMA,
  LEGACY_MIGRATION_POLICY_ID,
  LEGACY_MIGRATION_REPORT_SCHEMA,
  MAX_LEGACY_CHORDS,
  MAX_LEGACY_CHORDS_PER_SECTION,
  MAX_LEGACY_JSON_DEPTH,
  MAX_LEGACY_REPORT_ITEMS,
  MAX_LEGACY_SECTIONS,
  MAX_LEGACY_SOURCE_PROPERTIES,
  MAX_LEGACY_UTF8_BYTES,
  migrateLegacyJson,
  type LegacyMigrationCandidate,
  type LegacyMigrationDependencies,
  type LegacyMigrationResult,
  type LegacyReportGroup,
} from "../../src/compatibility";
import {
  migrateLegacyJsonWithEvidence,
  readLegacyArrayDataElement,
} from "../../src/compatibility/legacy-migration";
import {
  parseStableId,
  type ChordEvent,
  type StableIdFactory,
  type StableIdFor,
  type StableIdKind,
} from "../../src/domain";
import {
  parseChordSymbol,
  resolveChord,
  type AccidentalStyle,
} from "../../src/theory";

setDefaultTimeout(60_000);

const encoder = new TextEncoder();

const reviewedLegacyTypeSuffixEntries = [
  ["major", ""],
  ["minor", "m"],
  ["dim", "dim"],
  ["aug", "aug"],
  ["sus2", "sus2"],
  ["sus4", "sus4"],
  ["6", "6"],
  ["m6", "m6"],
  ["maj7", "maj7"],
  ["7", "7"],
  ["m7", "m7"],
  ["mMaj7", "mMaj7"],
  ["m7b5", "m7b5"],
  ["dim7", "dim7"],
  ["aug7", "7#5"],
  ["augMaj7", "aug(maj7)"],
  ["maj9", "maj9"],
  ["9", "9"],
  ["m9", "m9"],
  ["11", "11"],
  ["m11", "m11"],
  ["13", "13"],
  ["maj13", "maj13"],
  ["m13", "m13"],
  ["7b9", "7b9"],
  ["7#9", "7#9"],
  ["7#11", "7#11"],
  ["7b13", "7b13"],
  ["7b5", "7b5"],
  ["7#5", "7#5"],
  ["alt", "7alt"],
  ["maj7#11", "maj7#11"],
  ["m9b5", "m9b5"],
  ["9sus4", "9sus4"],
  ["13sus4", "13sus4"],
  ["7b9sus4", "7b9sus4"],
  ["m6/9", "m6/9"],
  ["6/9", "6/9"],
  ["9b5", "9b5"],
] as const;

type FactoryHarness = Readonly<{
  factory: StableIdFactory;
  requestedKinds: StableIdKind[];
}>;

type DependencyHarness = Readonly<{
  dependencies: LegacyMigrationDependencies;
  parseCalls: Array<
    Readonly<{ sourceText: string; accidentalStyle: AccidentalStyle }>
  >;
  requestedKinds: StableIdKind[];
}>;

function deterministicFactory(
  explicitWires: readonly string[] = [],
  failAtRequest: number | null = null,
): FactoryHarness {
  const requestedKinds: StableIdKind[] = [];
  let requestIndex = 0;
  const factory: StableIdFactory = {
    next: <K extends StableIdKind>(kind: K) => {
      requestedKinds.push(kind);
      requestIndex += 1;
      if (requestIndex === failAtRequest) {
        return {
          ok: false as const,
          refusal: {
            code: "id.factory_exhausted" as const,
            kind,
            path: ["id"] as const,
          },
        };
      }

      const wire =
        explicitWires[requestIndex - 1] ??
        `c0-${kind}-${requestIndex.toString()}`;
      const parsed = parseStableId(kind, wire);
      if (!parsed.ok) {
        return {
          ok: false as const,
          refusal: {
            code: "id.factory_exhausted" as const,
            kind,
            path: ["id"] as const,
          },
        };
      }
      return {
        ok: true as const,
        value: parsed.value,
        source: "deterministic-test" as const,
      };
    },
  };
  return { factory, requestedKinds };
}

function testId<K extends StableIdKind>(
  kind: K,
  wire: string,
): StableIdFor<K> {
  const parsed = parseStableId(kind, wire);
  if (!parsed.ok) throw new Error(`C0_TEST_ID:${kind}:${wire}`);
  return parsed.value;
}

function dependencyHarness(
  factoryHarness: FactoryHarness = deterministicFactory(),
): DependencyHarness {
  const parseCalls: Array<
    Readonly<{ sourceText: string; accidentalStyle: AccidentalStyle }>
  > = [];
  return {
    dependencies: {
      idFactory: factoryHarness.factory,
      parseChordSymbol: (sourceText, accidentalStyle) => {
        parseCalls.push({ sourceText, accidentalStyle });
        return parseChordSymbol(sourceText, accidentalStyle);
      },
      resolveChord,
    },
    parseCalls,
    requestedKinds: factoryHarness.requestedKinds,
  };
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function requireCandidate(
  result: LegacyMigrationResult,
): LegacyMigrationCandidate {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`C0_TEST_EXPECTED_CANDIDATE:${result.refusal.code}`);
  }
  return result.value;
}

function requireRefusal(
  result: LegacyMigrationResult,
): Extract<LegacyMigrationResult, { ok: false }>["refusal"] {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("C0_TEST_EXPECTED_REFUSAL");
  return result.refusal;
}

function migrateValue(
  value: unknown,
  harness: DependencyHarness = dependencyHarness(),
): LegacyMigrationResult {
  return migrateLegacyJson({ sourceBytes: jsonBytes(value) }, harness.dependencies);
}

function firstEvent(candidate: LegacyMigrationCandidate): ChordEvent {
  const event = candidate.document.sections[0]?.measures[0]?.events[0];
  if (event === undefined) throw new Error("C0_TEST_EVENT_MISSING");
  return event;
}

function reportCodes(
  candidate: LegacyMigrationCandidate,
  group: LegacyReportGroup,
): readonly string[] {
  return candidate.report.groups[group].map((item) => item.code);
}

describe("C0 deterministic legacy migration", () => {
  test("C0-BUILD-001 returns a complete unbranded default candidate and a path-only sorted report", () => {
    const harness = dependencyHarness();
    const candidate = requireCandidate(migrateValue({ sections: [] }, harness));

    expect(candidate).toEqual({
      schema: LEGACY_MIGRATION_CANDIDATE_SCHEMA,
      document: {
        schema: "changes.progression.v2",
        id: testId("document", "c0-document-1"),
        title: "Imported legacy progression",
        description: "",
        meter: { beatsPerBar: 4, beatUnit: 4 },
        tempoBpm: 120,
        key: null,
        sections: [],
        playback: {
          instrumentId: "mellow-keys",
          masterVolume: 0.8,
          reverbAmount: 0.2,
          countInBars: 0,
        },
      },
      report: {
        schema: LEGACY_MIGRATION_REPORT_SCHEMA,
        policyId: LEGACY_MIGRATION_POLICY_ID,
        policyVersion: 1,
        sourceKind: "unversioned-legacy-json",
        sourceBytes: 15,
        summary: {
          sourceSections: 0,
          sourceChordSlots: 0,
          migratedSections: 0,
          migratedEvents: 0,
          rejectedSections: 0,
          rejectedEvents: 0,
          parsedEvents: 0,
          customEvents: 0,
          manualEvents: 0,
          autoEvents: 0,
          preservedItems: 0,
          canonicalizedItems: 3,
          customItems: 0,
          ignoredItems: 0,
          rejectedItems: 0,
        },
        groups: {
          preserved: [],
          canonicalized: [
            {
              group: "canonicalized",
              code: "legacy.canonicalized.playback_default",
              sourcePath: [],
              targetPath: ["playback"],
            },
            {
              group: "canonicalized",
              code: "legacy.canonicalized.document_description_default",
              sourcePath: ["description"],
              targetPath: ["description"],
            },
            {
              group: "canonicalized",
              code: "legacy.canonicalized.document_title_default",
              sourcePath: ["name"],
              targetPath: ["title"],
            },
          ],
          custom: [],
          ignored: [],
          rejected: [],
        },
        identityMappings: [
          {
            sourcePath: [],
            targetPath: ["id"],
            kind: "document",
            id: testId("document", "c0-document-1"),
          },
        ],
      },
    });
    expect(harness.requestedKinds).toEqual(["document"]);
    expect(harness.parseCalls).toEqual([]);
  });

  test("C0-BUILD-002 uses real T0 ASCII parsing and T1 resolution for an exact parsed Manual event", () => {
    const harness = dependencyHarness();
    const candidate = requireCandidate(
      migrateValue(
        {
          name: "Blue Machine",
          description: "Exact source text",
          sections: [
            {
              name: "A",
              annotation: "section note",
              chords: [
                {
                  name: "Cmaj7",
                  notes: ["C3", "E3", "G3", "B3"],
                  annotation: "event note",
                },
              ],
            },
          ],
        },
        harness,
      ),
    );
    const event = firstEvent(candidate);

    expect(harness.parseCalls).toEqual([
      { sourceText: "Cmaj7", accidentalStyle: "ascii" },
    ]);
    expect(event).toMatchObject({
      id: "c0-event-4",
      duration: { numerator: 4, denominator: 1 },
      annotation: "event note",
      chord: {
        kind: "parsed",
        sourceText: "Cmaj7",
        root: { step: "C", alter: 0 },
        seventh: "major",
        bass: null,
      },
      voicing: {
        mode: "manual",
        pitches: [
          { step: "C", alter: 0, octave: 3 },
          { step: "E", alter: 0, octave: 3 },
          { step: "G", alter: 0, octave: 3 },
          { step: "B", alter: 0, octave: 3 },
        ],
        bassPolicy: "included",
      },
    });
    expect(candidate.document.sections[0]).toMatchObject({
      id: "c0-section-2",
      name: "A",
      annotation: "section note",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: [
        {
          id: "c0-measure-3",
          completion: { kind: "complete" },
        },
      ],
    });
    expect(reportCodes(candidate, "preserved")).toEqual([
      "legacy.preserved.document_description",
      "legacy.preserved.document_name",
      "legacy.preserved.annotation",
      "legacy.preserved.annotation",
      "legacy.preserved.symbol",
      "legacy.preserved.manual_notes",
      "legacy.preserved.section_name",
    ]);
    expect(reportCodes(candidate, "canonicalized")).not.toContain(
      "legacy.canonicalized.auto_voicing_default",
    );
    expect(candidate.report.summary).toMatchObject({
      parsedEvents: 1,
      customEvents: 0,
      manualEvents: 1,
      autoEvents: 0,
    });
  });

  test("C0-BUILD-003 distinguishes written-spelling conflict from sounding conflict without changing Manual pitches", () => {
    const candidate = requireCandidate(
      migrateValue({
        sections: [
          {
            chords: [
              {
                name: "C#maj7",
                notes: ["Db3", "F3", "Ab3", "C4"],
              },
              { name: "Cmaj7", notes: ["C3", "F#3"] },
            ],
          },
        ],
      }),
    );
    const first = candidate.document.sections[0]?.measures[0]?.events[0];
    const second = candidate.document.sections[0]?.measures[1]?.events[0];
    if (first === undefined || second === undefined) {
      throw new Error("C0_TEST_CONFLICT_EVENTS_MISSING");
    }

    expect(first).toMatchObject({
      chord: {
        kind: "custom",
        sourceText: "C#maj7",
        label: "C#maj7",
        pitchNames: [
          { step: "D", alter: -1 },
          { step: "F", alter: 0 },
          { step: "A", alter: -1 },
          { step: "C", alter: 0 },
        ],
        bass: null,
      },
      voicing: {
        mode: "manual",
        pitches: [
          { step: "D", alter: -1, octave: 3 },
          { step: "F", alter: 0, octave: 3 },
          { step: "A", alter: -1, octave: 3 },
          { step: "C", alter: 0, octave: 4 },
        ],
        bassPolicy: "included",
      },
    });
    expect(second).toMatchObject({
      chord: {
        kind: "custom",
        sourceText: "Cmaj7",
        label: "Cmaj7",
        pitchNames: [
          { step: "C", alter: 0 },
          { step: "F", alter: 1 },
        ],
        bass: null,
      },
    });
    expect(reportCodes(candidate, "custom")).toEqual([
      "legacy.custom.name_notes_spelling_conflict",
      "legacy.custom.name_notes_sounding_conflict",
    ]);
    expect(candidate.report.summary).toMatchObject({
      parsedEvents: 0,
      customEvents: 2,
      manualEvents: 2,
      autoEvents: 0,
    });
  });

  test("C0-BUILD-004 applies exact root/type/flag fallback while a present name disables flag construction", () => {
    const harness = dependencyHarness();
    const candidate = requireCandidate(
      migrateValue(
        {
          sections: [
            {
              chords: [
                { root: "C", type: "7", b9: true, s11: true },
                {
                  name: "Nope",
                  root: "D",
                  type: "minor",
                  b5: true,
                },
                { root: "F", type: "7sus4", notes: ["F3", "A3"] },
              ],
            },
          ],
        },
        harness,
      ),
    );
    const events = candidate.document.sections[0]?.measures.map(
      (measure) => measure.events[0],
    );

    expect(harness.parseCalls).toEqual([
      { sourceText: "C7(b9,#11)", accidentalStyle: "ascii" },
      { sourceText: "Nope", accidentalStyle: "ascii" },
      { sourceText: "Dm", accidentalStyle: "ascii" },
    ]);
    expect(events?.[0]).toMatchObject({
      chord: { kind: "parsed", sourceText: "C7(b9,#11)" },
      voicing: {
        mode: "auto",
        family: "balanced",
        voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: "generated",
      },
    });
    expect(events?.[1]).toMatchObject({
      chord: { kind: "parsed", sourceText: "Dm" },
      voicing: { mode: "auto" },
    });
    expect(events?.[2]).toMatchObject({
      chord: {
        kind: "custom",
        sourceText: "F7sus4",
        label: "F7sus4",
        bass: null,
      },
      voicing: { mode: "manual", bassPolicy: "included" },
    });
    const canonicalizedCodes = reportCodes(candidate, "canonicalized");
    expect(canonicalizedCodes).toContain(
      "legacy.canonicalized.symbol_from_root_type",
    );
    expect(canonicalizedCodes).toContain(
      "legacy.canonicalized.auto_voicing_default",
    );
    const ignoredCodes = reportCodes(candidate, "ignored");
    expect(ignoredCodes).toContain("legacy.ignored.alteration_evidence");
    expect(ignoredCodes).toContain("legacy.ignored.name_parse_failure");
    expect(ignoredCodes).toContain("legacy.ignored.unknown_type");
    expect(reportCodes(candidate, "custom")).toContain(
      "legacy.custom.notes_without_symbol",
    );
  });

  test("C0-BUILD-005 treats an invalid note array atomically as absent and installs exact Balanced Auto", () => {
    const candidate = requireCandidate(
      migrateValue({
        sections: [
          {
            chords: [{ name: "Cmaj7", notes: ["B#3", "C4"] }],
          },
        ],
      }),
    );

    expect(firstEvent(candidate)).toMatchObject({
      chord: { kind: "parsed", sourceText: "Cmaj7" },
      voicing: {
        mode: "auto",
        family: "balanced",
        voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: "generated",
      },
    });
    expect(reportCodes(candidate, "ignored")).toContain(
      "legacy.ignored.invalid_notes",
    );
    expect(reportCodes(candidate, "canonicalized")).toContain(
      "legacy.canonicalized.auto_voicing_default",
    );
    expect(candidate.report.summary).toMatchObject({
      parsedEvents: 1,
      manualEvents: 0,
      autoEvents: 1,
    });
  });

  test("C0-BUILD-006 rejects malformed nodes locally, requests no IDs for them, and compacts every target path", () => {
    const harness = dependencyHarness();
    const candidate = requireCandidate(
      migrateValue(
        {
          sections: [
            null,
            {},
            { chords: "not-an-array" },
            { chords: [null, {}, { name: "Dm7" }] },
            { chords: [] },
          ],
        },
        harness,
      ),
    );

    expect(harness.requestedKinds).toEqual([
      "document",
      "section",
      "measure",
      "event",
      "section",
    ]);
    expect(candidate.report.identityMappings).toEqual([
      {
        sourcePath: [],
        targetPath: ["id"],
        kind: "document",
        id: testId("document", "c0-document-1"),
      },
      {
        sourcePath: ["sections", 3],
        targetPath: ["sections", 0, "id"],
        kind: "section",
        id: testId("section", "c0-section-2"),
      },
      {
        sourcePath: ["sections", 3, "chords", 2],
        targetPath: ["sections", 0, "measures", 0, "id"],
        kind: "measure",
        id: testId("measure", "c0-measure-3"),
      },
      {
        sourcePath: ["sections", 3, "chords", 2],
        targetPath: [
          "sections",
          0,
          "measures",
          0,
          "events",
          0,
          "id",
        ],
        kind: "event",
        id: testId("event", "c0-event-4"),
      },
      {
        sourcePath: ["sections", 4],
        targetPath: ["sections", 1, "id"],
        kind: "section",
        id: testId("section", "c0-section-5"),
      },
    ]);
    expect(candidate.document.sections).toHaveLength(2);
    expect(candidate.document.sections[0]?.measures).toHaveLength(1);
    expect(candidate.document.sections[1]?.measures).toEqual([]);
    expect(candidate.report.groups.rejected).toEqual([
      {
        group: "rejected",
        code: "legacy.rejected.section_not_object",
        sourcePath: ["sections", 0],
        targetPath: null,
      },
      {
        group: "rejected",
        code: "legacy.rejected.section_chords_missing",
        sourcePath: ["sections", 1, "chords"],
        targetPath: null,
      },
      {
        group: "rejected",
        code: "legacy.rejected.section_chords_not_array",
        sourcePath: ["sections", 2, "chords"],
        targetPath: null,
      },
      {
        group: "rejected",
        code: "legacy.rejected.event_not_object",
        sourcePath: ["sections", 3, "chords", 0],
        targetPath: null,
      },
      {
        group: "rejected",
        code: "legacy.rejected.no_usable_symbol_or_notes",
        sourcePath: ["sections", 3, "chords", 1],
        targetPath: null,
      },
    ]);
    expect(candidate.report.summary).toMatchObject({
      sourceSections: 5,
      sourceChordSlots: 3,
      migratedSections: 2,
      migratedEvents: 1,
      rejectedSections: 3,
      rejectedEvents: 2,
    });
  });

  test("C0-BUILD-007 allocates exact structural preorder and refuses collisions or factory failure without retry", () => {
    const preorderHarness = dependencyHarness();
    requireCandidate(
      migrateValue(
        {
          sections: [
            { chords: [{ name: "C" }, { name: "Dm" }] },
            { chords: [{ name: "G7" }, { name: "Cmaj7" }] },
          ],
        },
        preorderHarness,
      ),
    );
    expect(preorderHarness.requestedKinds).toEqual([
      "document",
      "section",
      "measure",
      "event",
      "measure",
      "event",
      "section",
      "measure",
      "event",
      "measure",
      "event",
    ]);

    const collisionHarness = dependencyHarness(
      deterministicFactory(["c0-shared", "c0-shared"]),
    );
    expect(
      requireRefusal(
        migrateValue({ sections: [{ chords: [] }] }, collisionHarness),
      ),
    ).toEqual({
      code: "legacy.id_collision",
      path: ["sections", 0],
      kind: "section",
      collidingId: "c0-shared",
      firstSourcePath: [],
    });
    expect(collisionHarness.requestedKinds).toEqual(["document", "section"]);

    const failureHarness = dependencyHarness(deterministicFactory([], 3));
    expect(
      requireRefusal(
        migrateValue(
          { sections: [{ chords: [{ name: "C" }] }] },
          failureHarness,
        ),
      ),
    ).toEqual({
      code: "legacy.id_factory_failed",
      path: ["sections", 0, "chords", 0],
      kind: "measure",
      factoryCode: "id.factory_exhausted",
    });
    expect(failureHarness.requestedKinds).toEqual([
      "document",
      "section",
      "measure",
    ]);
  });

  test("C0-BUILD-008 uses fatal UTF-8 and a string/escape-aware lexical depth preflight", () => {
    const invalidUtf8 = requireRefusal(
      migrateLegacyJson(
        { sourceBytes: new Uint8Array([0xc3, 0x28]) },
        dependencyHarness().dependencies,
      ),
    );
    expect(invalidUtf8).toEqual({ code: "legacy.utf8_invalid", path: [] });

    const stringAwareSource = JSON.stringify({
      noise: '\\"[[[[{{{{]]]]}}}}',
      sections: [],
    });
    const stringAware = migrateLegacyJsonWithEvidence(
      { sourceBytes: encoder.encode(stringAwareSource) },
      dependencyHarness().dependencies,
    );
    requireCandidate(stringAware.result);
    expect(stringAware.evidence.counters.maximumJsonDepth).toBe(2);

    const allowedSource = `{"sections":[],"unknown":${"[".repeat(
      MAX_LEGACY_JSON_DEPTH - 1,
    )}0${"]".repeat(MAX_LEGACY_JSON_DEPTH - 1)}}`;
    const allowed = migrateLegacyJsonWithEvidence(
      { sourceBytes: encoder.encode(allowedSource) },
      dependencyHarness().dependencies,
    );
    requireCandidate(allowed.result);
    expect(allowed.evidence.counters.maximumJsonDepth).toBe(
      MAX_LEGACY_JSON_DEPTH,
    );

    const refusedSource = `{"sections":[],"unknown":${"[".repeat(
      MAX_LEGACY_JSON_DEPTH,
    )}0${"]".repeat(MAX_LEGACY_JSON_DEPTH)}}`;
    expect(
      requireRefusal(
        migrateLegacyJson(
          { sourceBytes: encoder.encode(refusedSource) },
          dependencyHarness().dependencies,
        ),
      ),
    ).toEqual({
      code: "limit.legacy_json_depth_exceeded",
      path: [],
      received: MAX_LEGACY_JSON_DEPTH + 1,
      maximum: MAX_LEGACY_JSON_DEPTH,
    });
  });

  test("C0-BUILD-009 enforces byte, root, section, and per-section collection boundaries", () => {
    const minimal = encoder.encode('{"sections":[]}');
    const maximumBytes = new Uint8Array(MAX_LEGACY_UTF8_BYTES);
    maximumBytes.fill(0x20);
    maximumBytes.set(minimal);
    const maximum = migrateLegacyJsonWithEvidence(
      { sourceBytes: maximumBytes },
      dependencyHarness().dependencies,
    );
    requireCandidate(maximum.result);
    expect(maximum.evidence.counters.bytesVisited).toBe(MAX_LEGACY_UTF8_BYTES);

    expect(
      requireRefusal(
        migrateLegacyJson(
          { sourceBytes: new Uint8Array(MAX_LEGACY_UTF8_BYTES + 1) },
          dependencyHarness().dependencies,
        ),
      ),
    ).toEqual({
      code: "limit.legacy_utf8_bytes_exceeded",
      path: [],
      received: MAX_LEGACY_UTF8_BYTES + 1,
      maximum: MAX_LEGACY_UTF8_BYTES,
    });
    expect(requireRefusal(migrateValue([]))).toEqual({
      code: "legacy.root_invalid",
      path: [],
    });
    expect(requireRefusal(migrateValue({}))).toEqual({
      code: "legacy.sections_invalid",
      path: ["sections"],
    });

    expect(
      requireRefusal(
        migrateValue({
          sections: Array.from(
            { length: MAX_LEGACY_SECTIONS + 1 },
            () => ({ chords: [] }),
          ),
        }),
      ),
    ).toEqual({
      code: "limit.legacy_sections_exceeded",
      path: ["sections", MAX_LEGACY_SECTIONS],
      received: MAX_LEGACY_SECTIONS + 1,
      maximum: MAX_LEGACY_SECTIONS,
    });
    expect(
      requireRefusal(
        migrateValue({
          sections: [
            {
              chords: Array.from(
                { length: MAX_LEGACY_CHORDS_PER_SECTION + 1 },
                () => null,
              ),
            },
          ],
        }),
      ),
    ).toEqual({
      code: "limit.legacy_chords_per_section_exceeded",
      path: ["sections", 0, "chords", MAX_LEGACY_CHORDS_PER_SECTION],
      received: MAX_LEGACY_CHORDS_PER_SECTION + 1,
      maximum: MAX_LEGACY_CHORDS_PER_SECTION,
    });
  });

  test("C0-BUILD-010 copies caller bytes before return and sorts Unicode string paths by scalar value", () => {
    const privateUse = "\uE000";
    const astral = "\u{10000}";
    const sourceBytes = encoder.encode(
      JSON.stringify({ [astral]: "last", [privateUse]: "first", sections: [] }),
    );
    const candidate = requireCandidate(
      migrateLegacyJson(
        { sourceBytes },
        dependencyHarness().dependencies,
      ),
    );
    const snapshot = JSON.stringify(candidate);

    sourceBytes.fill(0xff);
    expect(JSON.stringify(candidate)).toBe(snapshot);
    expect(candidate.report.groups.ignored).toEqual([
      {
        group: "ignored",
        code: "legacy.ignored.unknown_field",
        sourcePath: [privateUse],
        targetPath: null,
      },
      {
        group: "ignored",
        code: "legacy.ignored.unknown_field",
        sourcePath: [astral],
        targetPath: null,
      },
    ]);
  });

  test("C0-BUILD-011 exposes exact bounded work evidence for a complete candidate", () => {
    const sourceText = '{"sections":[]}';
    const envelope = migrateLegacyJsonWithEvidence(
      { sourceBytes: encoder.encode(sourceText) },
      dependencyHarness().dependencies,
    );

    requireCandidate(envelope.result);
    expect(envelope.evidence).toEqual({
      contractSchema: LEGACY_MIGRATION_CONTRACT_SCHEMA,
      policyId: LEGACY_MIGRATION_POLICY_ID,
      policyVersion: 1,
      termination: "complete-candidate",
      counters: {
        bytesVisited: sourceText.length,
        jsonCodeUnitsVisited: sourceText.length,
        maximumJsonDepth: 2,
        sourcePropertiesVisited: 1,
        sectionsVisited: 0,
        chordSlotsVisited: 0,
        notesVisited: 0,
        symbolParseCalls: 0,
        resolutionCalls: 0,
        idRequests: 1,
        reportItemsEmitted: 3,
      },
    });
  });

  test("C0-BUILD-012 refuses the first excess global slot, source property, and report item before allocating IDs", () => {
    const fullChordSectionCount =
      MAX_LEGACY_CHORDS / MAX_LEGACY_CHORDS_PER_SECTION;
    const maximumChordSlots = Array.from(
      { length: fullChordSectionCount },
      () => ({
        chords: Array.from(
          { length: MAX_LEGACY_CHORDS_PER_SECTION },
          () => null,
        ),
      }),
    );
    expect(
      requireCandidate(migrateValue({ sections: maximumChordSlots })).report
        .summary.sourceChordSlots,
    ).toBe(MAX_LEGACY_CHORDS);

    const excessHarness = dependencyHarness();
    expect(
      requireRefusal(
        migrateValue(
          {
            sections: [
              ...maximumChordSlots,
              { chords: [null] },
            ],
          },
          excessHarness,
        ),
      ),
    ).toEqual({
      code: "limit.legacy_events_exceeded",
      path: ["sections", fullChordSectionCount, "chords", 0],
      received: MAX_LEGACY_CHORDS + 1,
      maximum: MAX_LEGACY_CHORDS,
    });
    expect(excessHarness.requestedKinds).toEqual([]);

    const propertyKeys = Array.from(
      "abcdefghijklmnopqrstuvwxyzABCDEF",
    );
    const propertyHeavyChord = Object.fromEntries(
      propertyKeys.map((key) => [key, 0]),
    );
    const propertyHarness = dependencyHarness();
    expect(
      requireRefusal(
        migrateValue(
          {
            sections: Array.from(
              { length: fullChordSectionCount },
              () => ({
                chords: Array.from(
                  { length: MAX_LEGACY_CHORDS_PER_SECTION },
                  () => propertyHeavyChord,
                ),
              }),
            ),
          },
          propertyHarness,
        ),
      ),
    ).toMatchObject({
      code: "limit.legacy_source_properties_exceeded",
      received: MAX_LEGACY_SOURCE_PROPERTIES + 1,
      maximum: MAX_LEGACY_SOURCE_PROPERTIES,
    });
    expect(propertyHarness.requestedKinds).toEqual([]);

    const reportHeavyChord = Object.fromEntries(
      Array.from("abcdefgh", (key) => [key, 0]),
    );
    const reportHarness = dependencyHarness();
    expect(
      requireRefusal(
        migrateValue(
          {
            sections: Array.from(
              { length: fullChordSectionCount },
              () => ({
                chords: Array.from(
                  { length: MAX_LEGACY_CHORDS_PER_SECTION },
                  () => reportHeavyChord,
                ),
              }),
            ),
          },
          reportHarness,
        ),
      ),
    ).toMatchObject({
      code: "limit.legacy_report_items_exceeded",
      received: MAX_LEGACY_REPORT_ITEMS + 1,
      maximum: MAX_LEGACY_REPORT_ITEMS,
    });
    expect(reportHarness.requestedKinds).toEqual([]);
  });

  test("C0-BUILD-013 rejects an unbounded grammar-shaped octave without unbounded numeric allocation", () => {
    const envelope = migrateLegacyJsonWithEvidence(
      {
        sourceBytes: jsonBytes({
          sections: [
            {
              chords: [
                {
                  name: "Cmaj7",
                  notes: [`C${"9".repeat(500_000)}`],
                },
              ],
            },
          ],
        }),
      },
      dependencyHarness().dependencies,
    );
    const candidate = requireCandidate(envelope.result);

    expect(firstEvent(candidate)).toMatchObject({
      chord: { kind: "parsed", sourceText: "Cmaj7" },
      voicing: { mode: "auto", family: "balanced" },
    });
    expect(reportCodes(candidate, "ignored")).toContain(
      "legacy.ignored.invalid_notes",
    );
    expect(envelope.evidence.counters.notesVisited).toBe(1);
  });

  test("C0-BUILD-014 sends every reviewed legacy type through a T0-recognized exact wire spelling", () => {
    const harness = dependencyHarness();
    const candidate = requireCandidate(
      migrateValue(
        {
          sections: [
            {
              chords: reviewedLegacyTypeSuffixEntries.map(([type]) => ({
                root: "C",
                type,
                ...(type === "aug7"
                  ? { notes: ["C4", "E4", "G#4", "Bb4"] }
                  : type === "augMaj7"
                    ? { notes: ["C4", "E4", "G#4", "B4"] }
                    : {}),
              })),
            },
          ],
        },
        harness,
      ),
    );

    const expectedSourceTexts = reviewedLegacyTypeSuffixEntries.map(
      ([, suffix]) => `C${suffix}`,
    );
    const events = candidate.document.sections[0]?.measures.map(
      (measure) => measure.events[0],
    );

    expect(harness.parseCalls).toEqual(
      expectedSourceTexts.map((sourceText) => ({
        sourceText,
        accidentalStyle: "ascii",
      })),
    );
    expect(
      events?.map((event) => {
        if (event === undefined) throw new Error("C0_TEST_EVENT_MISSING");
        if (event.chord.kind !== "parsed") {
          throw new Error(`C0_TEST_EXPECTED_PARSED:${event.chord.label}`);
        }
        return event.chord.sourceText;
      }),
    ).toEqual(expectedSourceTexts);
    expect(events?.map((event) => event?.voicing.mode)).toEqual(
      reviewedLegacyTypeSuffixEntries.map(([type]) =>
        type === "aug7" || type === "augMaj7" ? "manual" : "auto",
      ),
    );
    expect(events?.[14]?.voicing).toMatchObject({
      mode: "manual",
      pitches: [
        { step: "C", alter: 0, octave: 4 },
        { step: "E", alter: 0, octave: 4 },
        { step: "G", alter: 1, octave: 4 },
        { step: "B", alter: -1, octave: 4 },
      ],
    });
    expect(events?.[15]?.voicing).toMatchObject({
      mode: "manual",
      pitches: [
        { step: "C", alter: 0, octave: 4 },
        { step: "E", alter: 0, octave: 4 },
        { step: "G", alter: 1, octave: 4 },
        { step: "B", alter: 0, octave: 4 },
      ],
    });
    expect(candidate.report.summary).toMatchObject({
      sourceChordSlots: reviewedLegacyTypeSuffixEntries.length,
      migratedEvents: reviewedLegacyTypeSuffixEntries.length,
      rejectedEvents: 0,
      parsedEvents: reviewedLegacyTypeSuffixEntries.length,
      customEvents: 0,
      manualEvents: 2,
      autoEvents: reviewedLegacyTypeSuffixEntries.length - 2,
    });
  });

  test("C0-BUILD-015 snapshots array slots without invoking accessors", () => {
    let getterCalls = 0;
    const accessorBacked: unknown[] = [];
    Object.defineProperty(accessorBacked, "0", {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return { name: "Cmaj7" };
      },
    });
    accessorBacked.length = 1;

    const observed = readLegacyArrayDataElement(accessorBacked, 0);

    expect(getterCalls).toBe(0);
    expect(observed).not.toEqual({ name: "Cmaj7" });
    expect(readLegacyArrayDataElement([{ name: "Cmaj7" }], 0)).toEqual({
      name: "Cmaj7",
    });
  });
});
