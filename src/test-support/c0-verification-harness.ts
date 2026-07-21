import {
  LEGACY_TYPE_SUFFIX_ENTRIES,
  migrateLegacyJson,
  type LegacyMigrationDependencies,
  type LegacyMigrationResult,
  type LegacyReportItem,
} from "../compatibility";
import { migrateLegacyJsonWithEvidence } from
  "../compatibility/legacy-migration";
import type { LegacyMigrationEvidence } from
  "../compatibility/legacy-migration-contract";
import {
  parseStableId,
  type ChordSpec,
  type CustomChordSpec,
  type IdFactoryResult,
  type StableIdFactory,
  type StableIdKind,
} from "../domain";
import {
  parseChordSymbol,
  resolutionOperations,
  type AccidentalStyle,
} from "../theory";

export const C0_PRODUCTION_CASE_IDS = [
  "C0-PRE-001", "C0-PRE-002", "C0-PRE-003", "C0-PRE-004",
  "C0-PRE-005", "C0-PRE-006", "C0-PRE-007", "C0-PRE-008",
  "C0-PRE-009", "C0-PRE-010", "C0-PRE-011", "C0-PRE-012",
  "C0-PRE-013", "C0-PRE-014", "C0-PRE-015", "C0-PRE-016",
  "C0-NOTE-001", "C0-NOTE-002", "C0-NOTE-003", "C0-NOTE-004",
  "C0-NOTE-005", "C0-NOTE-006", "C0-NOTE-007", "C0-NOTE-008",
  "C0-NOTE-009", "C0-NOTE-010", "C0-NOTE-011", "C0-NOTE-012",
  "C0-LIMIT-001", "C0-LIMIT-002", "C0-LIMIT-003", "C0-LIMIT-004",
  "C0-LIMIT-005", "C0-LIMIT-006", "C0-LIMIT-007", "C0-LIMIT-008",
  "C0-LIMIT-009", "C0-LIMIT-010", "C0-LIMIT-011", "C0-LIMIT-012",
  "C0-LIMIT-013", "C0-LIMIT-014",
  "C0-SHAPE-001", "C0-SHAPE-002", "C0-SHAPE-003", "C0-SHAPE-004",
  "C0-SHAPE-005", "C0-SHAPE-006", "C0-SHAPE-007", "C0-SHAPE-008",
  "C0-SHAPE-009", "C0-SHAPE-010",
  "C0-ID-001", "C0-ID-002", "C0-ID-003", "C0-ID-004",
  "C0-ID-005", "C0-ID-006",
  "C0-REPORT-001", "C0-REPORT-002", "C0-REPORT-003",
  "C0-REPORT-004", "C0-REPORT-005", "C0-REPORT-006",
  "C0-REPORT-007",
  "C0-APPLY-001", "C0-APPLY-002", "C0-APPLY-003", "C0-APPLY-004",
  "C0-APPLY-005",
] as const;

export type C0ProductionCaseId = (typeof C0_PRODUCTION_CASE_IDS)[number];

type FactoryPlan = Readonly<{
  failAtRequest?: number;
  repeatFirstId?: boolean;
}>;

type ApplicabilityObservation = Readonly<{
  status: "applicable" | "not-applicable" | "deferred";
  owner: string;
  reason: string;
}>;

type CaseScenario = Readonly<{
  createSourceBytes: () => Uint8Array;
  factoryPlan?: FactoryPlan;
  privateTextSentinels?: readonly string[];
  mutateCallerBytesAfterReturn?: boolean;
  applicability?: ApplicabilityObservation;
}>;

type DependencyHarness = Readonly<{
  dependencies: LegacyMigrationDependencies;
  parseCalls: Array<Readonly<{
    sourceText: string;
    accidentalStyle: AccidentalStyle;
  }>>;
  resolutionCalls: number[];
  requestedKinds: StableIdKind[];
}>;

export type C0CaseExecution = Readonly<{
  caseId: C0ProductionCaseId;
  result: LegacyMigrationResult;
  publicResult: LegacyMigrationResult;
  evidence: LegacyMigrationEvidence;
  parseCalls: readonly Readonly<{
    sourceText: string;
    accidentalStyle: AccidentalStyle;
  }>[];
  resolutionCalls: number;
  requestedKinds: readonly StableIdKind[];
  publicParseCalls: readonly Readonly<{
    sourceText: string;
    accidentalStyle: AccidentalStyle;
  }>[];
  publicResolutionCalls: number;
  publicRequestedKinds: readonly StableIdKind[];
  inputBytes: number;
  inputUnchanged: boolean;
  callerBytesFrozen: boolean;
  publicPrivateEqual: boolean;
  resultStableAfterCallerMutation: boolean;
  retainedCallerContainers: number;
  privateTextLeaks: number;
  prototypePolluted: boolean;
  inertStringExecuted: boolean;
  applicability: ApplicabilityObservation;
}>;

export type C0CaseSemanticProjection = Readonly<{
  caseId: C0ProductionCaseId;
  termination: LegacyMigrationEvidence["termination"];
  counters: LegacyMigrationEvidence["counters"];
  result: Readonly<{
    ok: boolean;
    refusalCode: string | null;
    refusalPath: readonly (string | number)[] | null;
    resultSha256Input: unknown;
    summary: unknown;
    reportItems: readonly Readonly<{
      group: string;
      code: string;
      sourcePath: readonly (string | number)[];
      targetPath: readonly (string | number)[] | null;
    }>[];
  }>;
  parseCalls: readonly string[];
  resolutionCalls: number;
  requestedKinds: readonly StableIdKind[];
  inputBytes: number;
  inputUnchanged: boolean;
  callerBytesFrozen: boolean;
  publicPrivateEqual: boolean;
  resultStableAfterCallerMutation: boolean;
  retainedCallerContainers: number;
  privateTextLeaks: number;
  prototypePolluted: boolean;
  inertStringExecuted: boolean;
  applicability: ApplicabilityObservation;
}>;

const encoder = new TextEncoder();

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function textBytes(value: string): Uint8Array {
  return encoder.encode(value);
}

function byteEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [
      key,
      canonicalValue(Reflect.get(value, key)),
    ]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function deterministicFactory(plan: FactoryPlan = {}): Readonly<{
  factory: StableIdFactory;
  requestedKinds: StableIdKind[];
}> {
  const requestedKinds: StableIdKind[] = [];
  let request = 0;
  const factory: StableIdFactory = {
    next<K extends StableIdKind>(kind: K): IdFactoryResult<K> {
      request += 1;
      requestedKinds.push(kind);
      if (request === plan.failAtRequest) {
        return {
          ok: false,
          refusal: {
            code: "id.factory_exhausted",
            kind,
            path: ["id"],
          },
        };
      }
      const wire = plan.repeatFirstId === true && request <= 2
        ? "c0-conformance-collision"
        : `c0-conformance-${kind}-${String(request)}`;
      const parsed = parseStableId(kind, wire);
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
  return { factory, requestedKinds };
}

function dependencyHarness(plan: FactoryPlan = {}): DependencyHarness {
  const ids = deterministicFactory(plan);
  const parseCalls: DependencyHarness["parseCalls"] = [];
  const resolutionCalls: number[] = [];
  const observedResolveChord = ((chord: ChordSpec | CustomChordSpec) => {
    resolutionCalls.push(1);
    return resolutionOperations.resolveChord(chord);
  }) as LegacyMigrationDependencies["resolveChord"];
  return {
    dependencies: {
      idFactory: ids.factory,
      parseChordSymbol: (sourceText, accidentalStyle) => {
        parseCalls.push({ sourceText, accidentalStyle });
        return parseChordSymbol(sourceText, accidentalStyle);
      },
      resolveChord: observedResolveChord,
    },
    parseCalls,
    resolutionCalls,
    requestedKinds: ids.requestedKinds,
  };
}

function chordDocument(chords: readonly unknown[]): unknown {
  return { sections: [{ chords }] };
}

function chromaticScientificPitches(count: number): string[] {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return Array.from({ length: count }, (_, index) => {
    const name = names[index % names.length];
    if (name === undefined) throw new Error("C0_CHROMATIC_NAME_MISSING");
    return `${name}${String(Math.floor(index / names.length))}`;
  });
}

function paddedValidJson(bytes: number): Uint8Array {
  const minimal = textBytes('{"sections":[]}');
  if (minimal.byteLength > bytes) throw new Error("C0_PADDED_JSON_TOO_SMALL");
  const result = new Uint8Array(bytes);
  result.fill(0x20);
  result.set(minimal);
  return result;
}

function depthJson(depth: number): Uint8Array {
  const nestedArrays = depth - 1;
  return textBytes(`{"sections":[],"unknown":${"[".repeat(nestedArrays)}0${"]".repeat(nestedArrays)}}`);
}

function fullChordSections(total: number, value: unknown): unknown[] {
  const sections: unknown[] = [];
  let remaining = total;
  while (remaining > 0) {
    const count = Math.min(1_024, remaining);
    sections.push({ chords: Array.from({ length: count }, () => value) });
    remaining -= count;
  }
  return sections;
}

const PROPERTY_KEYS = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEF",
);

function unknownFieldRecord(count: number): Record<string, number> {
  return Object.fromEntries(
    PROPERTY_KEYS.slice(0, count).map((key) => [key, 0]),
  );
}

function propertyBoundaryDocument(excess: boolean): unknown {
  // Root `sections` plus eight section `chords` properties consume nine.
  // 8,191 * 32 + 23 = 262,135 chord properties and therefore 262,144 total.
  const chords = [
    ...Array.from({ length: 8_191 }, () => unknownFieldRecord(32)),
    unknownFieldRecord(excess ? 24 : 23),
  ];
  return { sections: fullChordSections(8_192, null).map((_, sectionIndex) => ({
    chords: chords.slice(sectionIndex * 1_024, (sectionIndex + 1) * 1_024),
  })) };
}

function reportBoundaryDocument(excess: boolean): unknown {
  // Three document defaults + 24 section defaults + 8,192 rejected events
  // leave 57,317 unknown-field reports before the exact 65,536 ceiling.
  const chords = [
    ...Array.from({ length: 8_188 }, () => unknownFieldRecord(7)),
    unknownFieldRecord(excess ? 2 : 1),
    {},
    {},
    {},
  ];
  return { sections: Array.from({ length: 8 }, (_, sectionIndex) => ({
    chords: chords.slice(sectionIndex * 1_024, (sectionIndex + 1) * 1_024),
  })) };
}

function defaultApplicability(): ApplicabilityObservation {
  return Object.freeze({
    status: "applicable",
    owner: "C0/verify",
    reason: "The synchronous compatibility value operation is executed directly.",
  });
}

function scenarioFor(caseId: C0ProductionCaseId): CaseScenario {
  switch (caseId) {
    case "C0-PRE-001": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C3", "E3", "G3", "B3"] }])) };
    case "C0-PRE-002": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7" }])) };
    case "C0-PRE-003": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "C#maj7", notes: ["Db3", "F3", "Ab3", "C4"] }])) };
    case "C0-PRE-004": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C3", "F#3"] }])) };
    case "C0-PRE-005": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "NotAChord", root: "D", type: "m7", notes: ["D3", "F3", "A3", "C4"] }])) };
    case "C0-PRE-006": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "NotAChord", root: "D", type: "m7", notes: ["D3", "F#3"] }])) };
    case "C0-PRE-007": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "NotAChord", root: "F", type: "7sus4", notes: ["F3", "A3"] }])) };
    case "C0-PRE-008": return { createSourceBytes: () => jsonBytes(chordDocument([{}])) };
    case "C0-PRE-009": return {
      createSourceBytes: () => jsonBytes(chordDocument([
        ...LEGACY_TYPE_SUFFIX_ENTRIES.map(({ type }) => ({ root: "C", type })),
        { root: "C", type: "7", b5: true, s5: true, b9: true, s9: true, s11: true, b13: true },
      ])),
    };
    case "C0-PRE-010": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", b5: true }])) };
    case "C0-PRE-011": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "NotAChord", root: "D", type: "minor", b5: true }])) };
    case "C0-PRE-012": return { createSourceBytes: () => jsonBytes(chordDocument([{ root: "F", type: "7sus4", notes: ["F3", "A3"] }])) };
    case "C0-PRE-013": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7/E", notes: ["E3", "G3", "B3", "C4"] }])) };
    case "C0-PRE-014": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7/E", notes: ["C3", "E3", "G3", "B3"] }])) };
    case "C0-PRE-015": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "C7alt", notes: ["C3", "E3", "Bb3", "Db4", "D#4"] }])) };
    case "C0-PRE-016": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Private custom label", notes: ["C3", "G3", "C4"] }])) };

    case "C0-NOTE-001": return { createSourceBytes: () => jsonBytes(chordDocument([{ root: "C", type: "major", notes: ["C4"] }])) };
    case "C0-NOTE-002": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["B#3", "C4"] }])) };
    case "C0-NOTE-003": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["Cb4", "B#3"] }])) };
    case "C0-NOTE-004": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C"] }])) };
    case "C0-NOTE-005": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C4tail"] }])) };
    case "C0-NOTE-006": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C4", 60] }])) };
    case "C0-NOTE-007": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: [] }])) };
    case "C0-NOTE-008": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: chromaticScientificPitches(17) }])) };
    case "C0-NOTE-009": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C-2"] }])) };
    case "C0-NOTE-010": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C##4", "D4"] }])) };
    case "C0-NOTE-011": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "C", notes: ["C3", "G3", "C4"] }])) };
    case "C0-NOTE-012": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7", notes: ["C"] }])) };

    case "C0-LIMIT-001": return { createSourceBytes: () => paddedValidJson(2_097_152) };
    case "C0-LIMIT-002": return { createSourceBytes: () => new Uint8Array(2_097_153) };
    case "C0-LIMIT-003": return { createSourceBytes: () => depthJson(32) };
    case "C0-LIMIT-004": return { createSourceBytes: () => depthJson(33) };
    case "C0-LIMIT-005": return { createSourceBytes: () => jsonBytes({ sections: Array.from({ length: 64 }, () => ({ chords: [] })) }) };
    case "C0-LIMIT-006": return { createSourceBytes: () => jsonBytes({ sections: Array.from({ length: 65 }, () => ({ chords: [] })) }) };
    case "C0-LIMIT-007": return { createSourceBytes: () => jsonBytes({ sections: [{ chords: Array.from({ length: 1_024 }, () => null) }] }) };
    case "C0-LIMIT-008": return { createSourceBytes: () => jsonBytes({ sections: [{ chords: Array.from({ length: 1_025 }, () => null) }] }) };
    case "C0-LIMIT-009": return { createSourceBytes: () => jsonBytes({ sections: fullChordSections(8_192, null) }) };
    case "C0-LIMIT-010": return { createSourceBytes: () => jsonBytes({ sections: fullChordSections(8_193, null) }) };
    case "C0-LIMIT-011": return { createSourceBytes: () => jsonBytes(propertyBoundaryDocument(false)) };
    case "C0-LIMIT-012": return { createSourceBytes: () => jsonBytes(propertyBoundaryDocument(true)) };
    case "C0-LIMIT-013": return { createSourceBytes: () => jsonBytes(reportBoundaryDocument(false)) };
    case "C0-LIMIT-014": return { createSourceBytes: () => jsonBytes(reportBoundaryDocument(true)) };

    case "C0-SHAPE-001": return { createSourceBytes: () => new Uint8Array([0xc3, 0x28]) };
    case "C0-SHAPE-002": return { createSourceBytes: () => textBytes('{"sections":') };
    case "C0-SHAPE-003": return { createSourceBytes: () => textBytes("[]") };
    case "C0-SHAPE-004": return { createSourceBytes: () => textBytes("{}") };
    case "C0-SHAPE-005": return { createSourceBytes: () => jsonBytes({ sections: [null] }) };
    case "C0-SHAPE-006": return { createSourceBytes: () => jsonBytes({ sections: [{}, { chords: {} }] }) };
    case "C0-SHAPE-007": return { createSourceBytes: () => jsonBytes(chordDocument([null])) };
    case "C0-SHAPE-008": return {
      createSourceBytes: () => textBytes('{"sections":[{"chords":[{"name":"C","__proto__":{"polluted":true},"constructor":"<img src=x onerror=globalThis.__c0Executed=true>","onclick":"globalThis.__c0Executed=true"}]}]}'),
      privateTextSentinels: ["<img src=x onerror=globalThis.__c0Executed=true>", "globalThis.__c0Executed=true"],
    };
    case "C0-SHAPE-009": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "\ud800" }, { name: "x".repeat(257) }])) };
    case "C0-SHAPE-010": return { createSourceBytes: () => jsonBytes({ sections: [] }), mutateCallerBytesAfterReturn: true };

    case "C0-ID-001": return { createSourceBytes: () => jsonBytes({ sections: [{ chords: [{ name: "C" }, { name: "Dm" }] }, { chords: [{ name: "G7" }, { name: "Cmaj7" }] }] }) };
    case "C0-ID-002": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "C" }])), factoryPlan: { failAtRequest: 3 } };
    case "C0-ID-003": return { createSourceBytes: () => jsonBytes({ sections: [{ chords: [] }] }), factoryPlan: { repeatFirstId: true } };
    case "C0-ID-004": return { createSourceBytes: () => jsonBytes(chordDocument([{}, { name: "C" }])) };
    case "C0-ID-005": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7" }])) };
    case "C0-ID-006": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7" }])) };

    case "C0-REPORT-001": return { createSourceBytes: () => textBytes('{"z":0,"sections":[{"isEditingName":true,"collapsed":true,"chords":[{"zz":0,"name":"Cmaj7","notes":["C3","E3","G3","B3"],"aa":0}]}],"a":0}') };
    case "C0-REPORT-002": return { createSourceBytes: () => jsonBytes({ sections: [{ collapsed: true, isEditingName: false, editNameValue: "draft", chords: [] }] }) };
    case "C0-REPORT-003": return {
      createSourceBytes: () => jsonBytes(chordDocument([
        {
          name: "Cmaj7",
          bass: "H",
          b5: "not-a-boolean",
          tensions: ["b9"],
          voicingStyle: "close",
          baseOctave: 3,
          octaveSpan: 2,
          density: 0.8,
        },
        { root: "H", type: "major", notes: ["C4"] },
      ])),
    };
    case "C0-REPORT-004": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "C" }])) };
    case "C0-REPORT-005": return {
      createSourceBytes: () => jsonBytes({ name: "PRIVATE_TITLE_SENTINEL", description: "PRIVATE_DESCRIPTION_SENTINEL", sections: [{ name: "PRIVATE_SECTION_SENTINEL", chords: [{ name: "C", annotation: "PRIVATE_ANNOTATION_SENTINEL" }] }] }),
      privateTextSentinels: ["PRIVATE_TITLE_SENTINEL", "PRIVATE_DESCRIPTION_SENTINEL", "PRIVATE_SECTION_SENTINEL", "PRIVATE_ANNOTATION_SENTINEL"],
    };
    case "C0-REPORT-006": return { createSourceBytes: () => jsonBytes(chordDocument([{ name: "C" }])) };
    case "C0-REPORT-007": return {
      createSourceBytes: () => jsonBytes(chordDocument([{ name: "C" }])),
      applicability: Object.freeze({ status: "deferred", owner: "F3/A0", reason: "C0 returns only an unbranded candidate; publication is owned by the explicit-confirmation F3 application transaction." }),
    };

    case "C0-APPLY-001": return {
      createSourceBytes: () => jsonBytes({ sections: [] }),
      applicability: Object.freeze({ status: "not-applicable", owner: "C0/verify", reason: "Migration is a synchronous bounded value operation with no cancellation token." }),
    };
    case "C0-APPLY-002": return {
      createSourceBytes: () => jsonBytes({ sections: [] }),
      applicability: Object.freeze({ status: "not-applicable", owner: "A0/E0", reason: "C0 receives no application revision and publishes no state." }),
    };
    case "C0-APPLY-003": return {
      createSourceBytes: () => jsonBytes({ sections: [] }),
      applicability: Object.freeze({ status: "not-applicable", owner: "C0/verify", reason: "Migration is non-resumable and returns one terminal value." }),
    };
    case "C0-APPLY-004": return {
      createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7" }])),
      applicability: Object.freeze({ status: "applicable", owner: "C0/verify", reason: "Termination and work are observed by counters; elapsed time is not an input or cutoff." }),
    };
    case "C0-APPLY-005": return {
      createSourceBytes: () => jsonBytes(chordDocument([{ name: "Cmaj7" }])),
      applicability: Object.freeze({ status: "deferred", owner: "A0/E0/U5", reason: "Preview confirmation, history, audio retirement, and publication are downstream application transaction responsibilities; C0 is proved candidate-only here." }),
    };
  }
}

function reportItems(result: LegacyMigrationResult): readonly LegacyReportItem[] {
  if (!result.ok) return [];
  return [
    ...result.value.report.groups.preserved,
    ...result.value.report.groups.canonicalized,
    ...result.value.report.groups.custom,
    ...result.value.report.groups.ignored,
    ...result.value.report.groups.rejected,
  ];
}

function resultContainsContainer(
  value: unknown,
  target: Uint8Array,
  seen = new Set<object>(),
): boolean {
  if (value === target) return true;
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((entry) => resultContainsContainer(entry, target, seen));
  }
  return Object.values(value).some((entry) =>
    resultContainsContainer(entry, target, seen)
  );
}

function countPrivateLeaks(
  result: LegacyMigrationResult,
  sentinels: readonly string[],
): number {
  const diagnostic = result.ok
    ? stableJson(result.value.report)
    : stableJson(result.refusal);
  return sentinels.filter((sentinel) => diagnostic.includes(sentinel)).length;
}

export function executeC0ProductionCase(
  caseId: C0ProductionCaseId,
): C0CaseExecution {
  const scenario = scenarioFor(caseId);
  const sourceBytes = scenario.createSourceBytes();
  const inputSnapshot = Uint8Array.from(sourceBytes);
  const callerBytesFrozen = Object.isFrozen(sourceBytes);
  const privateHarness = dependencyHarness(scenario.factoryPlan);
  const prototypeBefore = Object.getOwnPropertyDescriptor(
    Object.prototype,
    "polluted",
  );
  Reflect.set(globalThis, "__c0Executed", false);
  const privateEnvelope = migrateLegacyJsonWithEvidence(
    { sourceBytes },
    privateHarness.dependencies,
  );
  const resultBeforeCallerMutation = stableJson(privateEnvelope.result);
  const inputUnchanged = byteEqual(sourceBytes, inputSnapshot);
  if (scenario.mutateCallerBytesAfterReturn === true) sourceBytes.fill(0xff);
  const resultStableAfterCallerMutation =
    stableJson(privateEnvelope.result) === resultBeforeCallerMutation;
  const prototypePolluted = stableJson(
    Object.getOwnPropertyDescriptor(Object.prototype, "polluted"),
  ) !== stableJson(prototypeBefore);
  const executionSentinel: unknown = Reflect.get(globalThis, "__c0Executed");
  const inertStringExecuted = executionSentinel === true;
  Reflect.deleteProperty(globalThis, "__c0Executed");

  const publicBytes = scenario.createSourceBytes();
  const publicHarness = dependencyHarness(scenario.factoryPlan);
  const publicResult = migrateLegacyJson(
    { sourceBytes: publicBytes },
    publicHarness.dependencies,
  );
  const publicPrivateEqual =
    stableJson(publicResult) === stableJson(privateEnvelope.result);
  const retainedCallerContainers =
    resultContainsContainer(privateEnvelope.result, sourceBytes) ? 1 : 0;
  const privateTextLeaks = countPrivateLeaks(
    privateEnvelope.result,
    scenario.privateTextSentinels ?? [],
  );

  return Object.freeze({
    caseId,
    result: privateEnvelope.result,
    publicResult,
    evidence: privateEnvelope.evidence,
    parseCalls: Object.freeze([...privateHarness.parseCalls]),
    resolutionCalls: privateHarness.resolutionCalls.length,
    requestedKinds: Object.freeze([...privateHarness.requestedKinds]),
    publicParseCalls: Object.freeze([...publicHarness.parseCalls]),
    publicResolutionCalls: publicHarness.resolutionCalls.length,
    publicRequestedKinds: Object.freeze([...publicHarness.requestedKinds]),
    inputBytes: inputSnapshot.byteLength,
    inputUnchanged,
    callerBytesFrozen,
    publicPrivateEqual,
    resultStableAfterCallerMutation,
    retainedCallerContainers,
    privateTextLeaks,
    prototypePolluted,
    inertStringExecuted,
    applicability: scenario.applicability ?? defaultApplicability(),
  });
}

export function c0CaseSemanticProjection(
  execution: C0CaseExecution,
): C0CaseSemanticProjection {
  const items = reportItems(execution.result).map((item) => Object.freeze({
    group: item.group,
    code: item.code,
    sourcePath: Object.freeze([...item.sourcePath]),
    targetPath: item.targetPath === null
      ? null
      : Object.freeze([...item.targetPath]),
  }));
  const resultProjection = execution.result.ok
    ? {
        ok: true,
        refusalCode: null,
        refusalPath: null,
        resultSha256Input: execution.result,
        summary: execution.result.value.report.summary,
        reportItems: Object.freeze(items),
      }
    : {
        ok: false,
        refusalCode: execution.result.refusal.code,
        refusalPath: Object.freeze([...execution.result.refusal.path]),
        resultSha256Input: execution.result,
        summary: null,
        reportItems: Object.freeze(items),
      };
  return Object.freeze({
    caseId: execution.caseId,
    termination: execution.evidence.termination,
    counters: execution.evidence.counters,
    result: Object.freeze(resultProjection),
    parseCalls: Object.freeze(execution.parseCalls.map(({ sourceText }) => sourceText)),
    resolutionCalls: execution.resolutionCalls,
    requestedKinds: execution.requestedKinds,
    inputBytes: execution.inputBytes,
    inputUnchanged: execution.inputUnchanged,
    callerBytesFrozen: execution.callerBytesFrozen,
    publicPrivateEqual: execution.publicPrivateEqual,
    resultStableAfterCallerMutation: execution.resultStableAfterCallerMutation,
    retainedCallerContainers: execution.retainedCallerContainers,
    privateTextLeaks: execution.privateTextLeaks,
    prototypePolluted: execution.prototypePolluted,
    inertStringExecuted: execution.inertStringExecuted,
    applicability: execution.applicability,
  });
}
