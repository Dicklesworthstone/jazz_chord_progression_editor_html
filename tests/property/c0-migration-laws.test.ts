import { expect, test } from "bun:test";

import {
  LEGACY_MIGRATION_WORK_COUNTER_NAMES,
  MAX_LEGACY_JSON_DEPTH,
  migrateLegacyJson,
  type LegacyMigrationCandidate,
  type LegacyMigrationDependencies,
  type LegacyMigrationResult,
} from "../../src/compatibility";
import {
  migrateLegacyJsonWithEvidence,
  readLegacyArrayDataElement,
} from "../../src/compatibility/legacy-migration";
import {
  parseStableId,
  type SpelledPitch,
  type StableIdFactory,
  type StableIdKind,
} from "../../src/domain";
import { parseChordSymbol, resolveChord } from "../../src/theory";
import {
  c0EvidenceDigest,
  stableC0EvidenceJson,
} from "../../scripts/verify-c0-evidence";

const encoder = new TextEncoder();

const transposedMajorSevenths = Object.freeze([
  Object.freeze({ root: "C", notes: Object.freeze(["C3", "E3", "G3", "B3"]) }),
  Object.freeze({ root: "Db", notes: Object.freeze(["Db3", "F3", "Ab3", "C4"]) }),
  Object.freeze({ root: "D", notes: Object.freeze(["D3", "F#3", "A3", "C#4"]) }),
  Object.freeze({ root: "Eb", notes: Object.freeze(["Eb3", "G3", "Bb3", "D4"]) }),
  Object.freeze({ root: "E", notes: Object.freeze(["E3", "G#3", "B3", "D#4"]) }),
  Object.freeze({ root: "F", notes: Object.freeze(["F3", "A3", "C4", "E4"]) }),
  Object.freeze({ root: "F#", notes: Object.freeze(["F#3", "A#3", "C#4", "E#4"]) }),
  Object.freeze({ root: "G", notes: Object.freeze(["G3", "B3", "D4", "F#4"]) }),
  Object.freeze({ root: "Ab", notes: Object.freeze(["Ab3", "C4", "Eb4", "G4"]) }),
  Object.freeze({ root: "A", notes: Object.freeze(["A3", "C#4", "E4", "G#4"]) }),
  Object.freeze({ root: "Bb", notes: Object.freeze(["Bb3", "D4", "F4", "A4"]) }),
  Object.freeze({ root: "B", notes: Object.freeze(["B3", "D#4", "F#4", "A#4"]) }),
] as const);

function deterministicIdFactory(prefix: string): StableIdFactory {
  let request = 0;
  return {
    next: <K extends StableIdKind>(kind: K) => {
      request += 1;
      const parsed = parseStableId(kind, `${prefix}-${kind}-${String(request)}`);
      if (!parsed.ok) {
        return Object.freeze({
          ok: false as const,
          refusal: Object.freeze({
            code: "id.factory_exhausted" as const,
            kind,
            path: Object.freeze(["id"] as const),
          }),
        });
      }
      return Object.freeze({
        ok: true as const,
        value: parsed.value,
        source: "deterministic-test" as const,
      });
    },
  };
}

function dependencies(prefix: string): LegacyMigrationDependencies {
  return Object.freeze({
    idFactory: deterministicIdFactory(prefix),
    parseChordSymbol,
    resolveChord,
  });
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

function requireCandidate(result: LegacyMigrationResult): LegacyMigrationCandidate {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`C0_PROPERTY_EXPECTED_CANDIDATE:${result.refusal.code}`);
  }
  return result.value;
}

function pitchText(pitch: SpelledPitch): string {
  const accidental = new Map<number, string>([
    [-2, "bb"],
    [-1, "b"],
    [0, ""],
    [1, "#"],
    [2, "##"],
  ]).get(pitch.alter);
  if (accidental === undefined) {
    throw new Error(`C0_PROPERTY_INVALID_ALTERATION:${String(pitch.alter)}`);
  }
  return `${pitch.step}${accidental}${String(pitch.octave)}`;
}

function isDeeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
      "value" in descriptor &&
      isDeeplyFrozen(descriptor.value, seen);
  });
}

function ownHostileDocument(): Record<string, unknown> {
  const document = Object.create(null) as Record<string, unknown>;
  document["name"] = "<b>Literal chart title</b>";
  document["sections"] = [{ chords: [{ name: "Cmaj7" }] }];
  document["__proto__"] = { polluted: "PRIVATE_PROTO_VALUE" };
  document["constructor"] = "PRIVATE_CONSTRUCTOR_VALUE";
  document["htmlPayload"] = "<img src=x onerror=PRIVATE_HTML_VALUE>";
  document["onclick"] = "PRIVATE_HANDLER_VALUE";
  return document;
}

function lawHash(value: unknown): string {
  return c0EvidenceDigest(value);
}

function singleLineEvidenceJson(value: unknown): string {
  return JSON.stringify(JSON.parse(stableC0EvidenceJson(value)));
}

test("proves deterministic migration laws and bounded termination", () => {
  const lawObservations = new Map<string, unknown>();

  const transpositionSource = Object.freeze({
    sections: Object.freeze([
      Object.freeze({
        chords: Object.freeze(
          transposedMajorSevenths.map(({ root, notes }) =>
            Object.freeze({ name: `${root}maj7`, notes })
          ),
        ),
      }),
    ]),
  });
  const transpositionBytes = jsonBytes(transpositionSource);
  const transpositionSnapshot = Uint8Array.from(transpositionBytes);
  const firstEnvelope = migrateLegacyJsonWithEvidence(
    { sourceBytes: transpositionBytes },
    dependencies("c0-law-transpose"),
  );
  const secondEnvelope = migrateLegacyJsonWithEvidence(
    { sourceBytes: transpositionBytes },
    dependencies("c0-law-transpose"),
  );
  const transposed = requireCandidate(firstEnvelope.result);
  expect(secondEnvelope).toEqual(firstEnvelope);
  expect(transpositionBytes).toEqual(transpositionSnapshot);
  expect(firstEnvelope.evidence.termination).toBe("complete-candidate");
  expect(transposed.report.summary).toMatchObject({
    sourceChordSlots: 12,
    migratedEvents: 12,
    parsedEvents: 12,
    customEvents: 0,
    manualEvents: 12,
    autoEvents: 0,
  });
  const transposedEvents = transposed.document.sections[0]?.measures.map(
    (measure) => measure.events[0],
  );
  expect(transposedEvents).toHaveLength(transposedMajorSevenths.length);
  for (const [index, reviewed] of transposedMajorSevenths.entries()) {
    const event = transposedEvents?.[index];
    if (event === undefined) throw new Error(`C0_PROPERTY_EVENT_MISSING:${String(index)}`);
    expect(event.chord.kind).toBe("parsed");
    if (event.chord.kind !== "parsed") {
      throw new Error(`C0_PROPERTY_EXPECTED_PARSED:${String(index)}`);
    }
    expect(event.chord.sourceText).toBe(`${reviewed.root}maj7`);
    expect(event.voicing.mode).toBe("manual");
    if (event.voicing.mode !== "manual") {
      throw new Error(`C0_PROPERTY_EXPECTED_MANUAL:${String(index)}`);
    }
    expect(event.voicing.pitches.map(pitchText)).toEqual([...reviewed.notes]);
  }
  lawObservations.set("C0-LAW-TRANSPOSE-MAJ7", {
    roots: transposedMajorSevenths.map(({ root }) => root),
    parsedManual: transposed.report.summary.manualEvents,
    custom: transposed.report.summary.customEvents,
  });
  lawObservations.set("C0-LAW-DETERMINISTIC-REPLAY", {
    equal: stableC0EvidenceJson(secondEnvelope) === stableC0EvidenceJson(firstEnvelope),
    replays: 1,
  });

  const hostileBytes = jsonBytes(ownHostileDocument());
  const hostileSnapshot = Uint8Array.from(hostileBytes);
  const hostileFirst = requireCandidate(
    migrateLegacyJson(
      { sourceBytes: hostileBytes },
      dependencies("c0-law-hostile"),
    ),
  );
  const hostileSecond = requireCandidate(
    migrateLegacyJson(
      { sourceBytes: hostileBytes },
      dependencies("c0-law-hostile"),
    ),
  );
  expect(hostileSecond).toEqual(hostileFirst);
  expect(hostileBytes).toEqual(hostileSnapshot);
  expect(hostileFirst.document.title).toBe("<b>Literal chart title</b>");
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  const reportText = JSON.stringify(hostileFirst.report);
  for (const privateValue of [
    "PRIVATE_PROTO_VALUE",
    "PRIVATE_CONSTRUCTOR_VALUE",
    "PRIVATE_HTML_VALUE",
    "PRIVATE_HANDLER_VALUE",
  ]) {
    expect(reportText).not.toContain(privateValue);
  }
  expect(hostileFirst.report.groups.ignored.map(({ sourcePath }) => sourcePath)).toEqual([
    ["__proto__"],
    ["constructor"],
    ["htmlPayload"],
    ["onclick"],
  ]);
  const beforeCallerMutation = stableC0EvidenceJson(hostileFirst);
  hostileBytes.fill(0xff);
  expect(stableC0EvidenceJson(hostileFirst)).toBe(beforeCallerMutation);
  expect(isDeeplyFrozen(hostileFirst)).toBe(true);
  const mutableDocument = hostileFirst.document as { title: string };
  const mutableIgnored = hostileFirst.report.groups.ignored as unknown[];
  expect(Reflect.set(mutableDocument, "title", "mutated")).toBe(false);
  expect(() => mutableIgnored.push({})).toThrow(TypeError);
  expect(hostileFirst.document.title).toBe("<b>Literal chart title</b>");
  lawObservations.set("C0-LAW-HOSTILE-KEY-INERTNESS", {
    ignoredPaths: hostileFirst.report.groups.ignored.map(({ sourcePath }) => sourcePath),
    privateValuesEchoed: 0,
    prototypePolluted: false,
  });
  lawObservations.set("C0-LAW-CALLER-OWNERSHIP", {
    sourceBytesMutatedByOperation: 0,
    resultChangedAfterCallerMutation: false,
  });
  lawObservations.set("C0-LAW-DEEP-IMMUTABILITY", {
    deeplyFrozen: true,
    rejectedMutationAttempts: 2,
  });

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
  const accessorObservation = readLegacyArrayDataElement(accessorBacked, 0);
  const inheritedPrototype = Object.create(Array.prototype) as object;
  Object.defineProperty(inheritedPrototype, "0", {
    configurable: true,
    enumerable: true,
    get: () => {
      getterCalls += 1;
      return { name: "Dm7" };
    },
  });
  const inheritedSlot: unknown[] = [];
  Object.setPrototypeOf(inheritedSlot, inheritedPrototype);
  inheritedSlot.length = 1;
  const inheritedObservation = readLegacyArrayDataElement(inheritedSlot, 0);
  const dataValue = Object.freeze({ name: "G7" });
  expect(typeof accessorObservation).toBe("symbol");
  expect(typeof inheritedObservation).toBe("symbol");
  expect(readLegacyArrayDataElement([dataValue], 0)).toBe(dataValue);
  expect(getterCalls).toBe(0);
  lawObservations.set("C0-LAW-ACCESSOR-DATA-ONLY", {
    accessorGetterCalls: getterCalls,
    inheritedGetterCalls: getterCalls,
    ownDataPreservedByIdentity: true,
  });

  const allowedDepthSource = `{"sections":[],"unknown":${"[".repeat(
    MAX_LEGACY_JSON_DEPTH - 1,
  )}0${"]".repeat(MAX_LEGACY_JSON_DEPTH - 1)}}`;
  const refusedDepthSource = `{"sections":[],"unknown":${"[".repeat(
    MAX_LEGACY_JSON_DEPTH,
  )}0${"]".repeat(MAX_LEGACY_JSON_DEPTH)}}`;
  const allowedDepth = migrateLegacyJsonWithEvidence(
    { sourceBytes: encoder.encode(allowedDepthSource) },
    dependencies("c0-law-depth-allowed"),
  );
  const refusedDepth = migrateLegacyJsonWithEvidence(
    { sourceBytes: encoder.encode(refusedDepthSource) },
    dependencies("c0-law-depth-refused"),
  );
  requireCandidate(allowedDepth.result);
  expect(allowedDepth.evidence.termination).toBe("complete-candidate");
  expect(allowedDepth.evidence.counters.maximumJsonDepth).toBe(MAX_LEGACY_JSON_DEPTH);
  expect(refusedDepth.result).toEqual({
    ok: false,
    refusal: {
      code: "limit.legacy_json_depth_exceeded",
      path: [],
      received: MAX_LEGACY_JSON_DEPTH + 1,
      maximum: MAX_LEGACY_JSON_DEPTH,
    },
  });
  expect(refusedDepth.evidence.termination).toBe("complete-refusal");
  expect(refusedDepth.evidence.counters.maximumJsonDepth).toBe(
    MAX_LEGACY_JSON_DEPTH + 1,
  );
  expect(isDeeplyFrozen(refusedDepth)).toBe(true);
  lawObservations.set("C0-LAW-WORK-TERMINATION", {
    allowedMaximumDepth: allowedDepth.evidence.counters.maximumJsonDepth,
    refusedFirstExcessDepth: refusedDepth.evidence.counters.maximumJsonDepth,
    terminalStates: [
      allowedDepth.evidence.termination,
      refusedDepth.evidence.termination,
    ],
    wallTimeGating: false,
  });

  const lawIds = [...lawObservations.keys()].sort();
  const lawHashes = Object.fromEntries(
    lawIds.map((id) => [id, lawHash({ id, observation: lawObservations.get(id) })]),
  );
  const unsignedObservation = {
    schema: "changes.evidence.c0-migration-law-observation.v1",
    producer: {
      file: "tests/property/c0-migration-laws.test.ts",
      testcase: "proves deterministic migration laws and bounded termination",
    },
    lawIds,
    lawHashes,
    lawsObserved: lawIds.length,
    deterministicReplays: 2,
    terminalStates: ["complete-candidate", "complete-refusal"],
    workCounterNames: LEGACY_MIGRATION_WORK_COUNTER_NAMES,
    boundaryPairs: 1,
    wallTimeGating: false,
    inputMutations: 0,
    status: "pass",
  } as const;
  console.log(`C0_LAW_OBSERVATION ${singleLineEvidenceJson({
    ...unsignedObservation,
    semanticDigest: c0EvidenceDigest(unsignedObservation),
  })}`);
});
