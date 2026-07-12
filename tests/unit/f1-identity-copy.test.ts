import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { makeChordEvent, type ChordEvent } from "../../src/domain/chord";
import { copyDomain } from "../../src/domain/copy";
import {
  makePlaybackSettings,
  type Measure,
  type ProgressionDocumentV2,
  type Section,
} from "../../src/domain/document";
import { makeBeatDuration, makeMeter } from "../../src/domain/duration";
import {
  createProductionStableIdFactory,
  parseStableId,
  type IdFactoryResult,
  type StableIdFactory,
  type StableIdKind,
} from "../../src/domain/ids";
import { makeKeyMode } from "../../src/domain/key";
import {
  makeSpelledPitch,
  makeSpelledPitchClass,
  type SpelledPitch,
  type SpelledPitchClass,
  type SpelledPitchClassInput,
  type SpelledPitchInput,
} from "../../src/domain/pitch";
import {
  compareDomainPaths,
  compareValidationIssues,
  type ValidatedDocument,
} from "../../src/domain/validated-document";

type JsonObject = Record<string, unknown>;

function jsonObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function stringField(record: JsonObject, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string") throw new Error(`${label}.${field} must be a string`);
  return value;
}

function numberField(record: JsonObject, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number") throw new Error(`${label}.${field} must be a number`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value.slice() as string[];
}

function numberArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
    throw new Error(`${label} must be a number array`);
  }
  return value.slice() as number[];
}

const identityFixtureValue: unknown = JSON.parse(readFileSync(
  new URL("../fixtures/domain/identity-cases.json", import.meta.url),
  "utf8",
));
const identityFixture = jsonObject(identityFixtureValue, "identity fixture");
const identityCaseValues = identityFixture["cases"];
if (!Array.isArray(identityCaseValues)) throw new Error("identity fixture cases missing");
const identityCases = new Map<string, JsonObject>();
for (const [index, value] of identityCaseValues.entries()) {
  const record = jsonObject(value, `identity fixture case ${String(index)}`);
  identityCases.set(stringField(record, "id", "identity case"), record);
}

function identityCase(id: string): JsonObject {
  const record = identityCases.get(id);
  if (record === undefined) throw new Error(`missing reviewed identity case ${id}`);
  return record;
}

function expectedRecord(id: string): JsonObject {
  return jsonObject(identityCase(id)["expected"], `${id}.expected`);
}

function inputDescriptor(id: string): JsonObject {
  return jsonObject(identityCase(id)["inputDescriptor"], `${id}.inputDescriptor`);
}

function factoryOutputs(id: string): string[] {
  return stringArray(identityCase(id)["factoryOutputs"], `${id}.factoryOutputs`);
}

function stableId<K extends StableIdKind>(kind: K, wire: string) {
  const result = parseStableId(kind, wire);
  if (!result.ok) throw new Error(`invalid test ID: ${wire}`);
  return result.value;
}

function factoryFrom(outputs: readonly string[]): Readonly<{
  factory: StableIdFactory;
  calls: StableIdKind[];
}> {
  const calls: StableIdKind[] = [];
  let index = 0;
  const factory: StableIdFactory = {
    next: <K extends StableIdKind>(kind: K): IdFactoryResult<K> => {
      calls.push(kind);
      const wire = outputs[index];
      index += 1;
      if (wire === undefined) {
        return {
          ok: false,
          refusal: { code: "id.factory_exhausted", kind, path: ["id"] },
        };
      }
      const parsed = parseStableId(kind, wire);
      if (!parsed.ok) {
        return {
          ok: false,
          refusal: { code: "id.factory_exhausted", kind, path: ["id"] },
        };
      }
      return { ok: true, value: parsed.value, source: "deterministic-test" };
    },
  };
  return { factory, calls };
}

function countingFactory(): Readonly<{
  factory: StableIdFactory;
  callCount: () => number;
}> {
  let calls = 0;
  return {
    factory: {
      next: <K extends StableIdKind>(kind: K): IdFactoryResult<K> => {
        const parsed = parseStableId(kind, `copy-${String(calls)}`);
        calls += 1;
        if (!parsed.ok) throw new Error("counting factory produced an invalid ID");
        return { ok: true, value: parsed.value, source: "deterministic-test" };
      },
    },
    callCount: () => calls,
  };
}

function event(id: string): ChordEvent {
  const duration = makeBeatDuration({ numerator: 1, denominator: 1 });
  if (!duration.ok) throw new Error("invalid test duration");
  const result = makeChordEvent({
    id: stableId("event", id),
    chord: {
      kind: "custom",
      sourceText: "C E G",
      label: "C triad",
      pitchNames: [
        { step: "C", alter: 0 },
        { step: "E", alter: 0 },
        { step: "G", alter: 0 },
      ],
      bass: null,
    },
    duration: duration.value,
    annotation: "preserve",
    voicing: {
      mode: "manual",
      pitches: [{ step: "C", alter: 0, octave: 4 }],
      bassPolicy: "included",
    },
  });
  if (!result.ok) throw new Error(`invalid test event: ${result.refusal.code}`);
  return result.value;
}

function parsedEvent(
  id: string,
  voicingMode: "auto" | "frozen",
): ChordEvent {
  const duration = makeBeatDuration({ numerator: 5, denominator: 2 });
  if (!duration.ok) throw new Error("invalid parsed-event duration");
  const voicing = voicingMode === "auto"
    ? {
        mode: "auto" as const,
        family: "balanced" as const,
        voiceCount: 4 as const,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: "generated" as const,
      }
    : {
        mode: "frozen" as const,
        pitches: [
          { step: "C" as const, alter: 0 as const, octave: 3 },
          { step: "G" as const, alter: 0 as const, octave: 3 },
          { step: "B" as const, alter: -1 as const, octave: 3 },
          { step: "D" as const, alter: 0 as const, octave: 4 },
        ],
        bassPolicy: "included" as const,
        generatedBy: { engineVersion: "fixture-1", family: "drop2" as const },
      };
  const result = makeChordEvent({
    id: stableId("event", id),
    chord: {
      kind: "parsed",
      sourceText: "C7(b5 add6 9 omit1)",
      root: { step: "C", alter: 0 },
      triad: "major",
      sixth: null,
      seventh: "minor",
      extensions: [{ number: 9, alter: 0 }],
      additions: [{ number: 2, alter: 0 }, { number: 6, alter: 0 }],
      alterations: [{ number: 5, alter: -1 }],
      omissions: [1],
      bass: null,
      colorPolicy: "none",
    },
    duration: duration.value,
    annotation: `${voicingMode} event`,
    voicing,
  });
  if (!result.ok) {
    throw new Error(`invalid parsed event: ${result.refusal.code}`);
  }
  return result.value;
}

function expectRecursivelyFrozen(
  value: unknown,
  visited: Set<object> = new Set(),
): void {
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectRecursivelyFrozen(child, visited);
  }
}

function expectRecursivelyUnfrozen(
  value: unknown,
  visited: Set<object> = new Set(),
): void {
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);
  expect(Object.isFrozen(value)).toBe(false);
  for (const child of Object.values(value)) {
    expectRecursivelyUnfrozen(child, visited);
  }
}

function expectNoSharedObjects(
  source: unknown,
  copied: unknown,
  visited: Set<object> = new Set(),
): void {
  if (
    typeof source !== "object" || source === null ||
    typeof copied !== "object" || copied === null ||
    visited.has(source)
  ) return;
  visited.add(source);
  expect(copied).not.toBe(source);
  for (const key of Object.keys(source)) {
    if (Object.hasOwn(copied, key)) {
      expectNoSharedObjects(Reflect.get(source, key), Reflect.get(copied, key), visited);
    }
  }
}

function sourceDocument(): ProgressionDocumentV2 {
  const meter = makeMeter({ beatsPerBar: 4, beatUnit: 4 });
  if (!meter.ok) throw new Error("invalid test meter");
  const playback = makePlaybackSettings({
    instrumentId: "mellow-keys",
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 1,
  });
  if (!playback.ok) throw new Error("invalid test playback settings");
  return {
    schema: "changes.progression.v2",
    id: stableId("document", "doc-source"),
    title: "Source",
    description: "unchanged",
    meter: meter.value,
    tempoBpm: 120,
    key: null,
    sections: [{
      id: stableId("section", "section-source"),
      name: "A",
      annotation: "section annotation",
      keyOverride: null,
      voiceLeadingBoundary: "continue",
      measures: [{
        id: stableId("measure", "measure-source"),
        events: [event("event-source-1"), event("event-source-2")],
        completion: { kind: "complete" },
      }],
    }],
    playback: playback.value,
  };
}

function spelledPitchClasses(
  inputs: readonly [SpelledPitchClassInput, ...SpelledPitchClassInput[]],
): readonly [SpelledPitchClass, ...SpelledPitchClass[]] {
  const values = inputs.map((input) => {
    const result = makeSpelledPitchClass(input);
    if (!result.ok) throw new Error(`invalid authority pitch class: ${result.refusal.code}`);
    return result.value;
  });
  const first = values[0];
  if (first === undefined) throw new Error("authority pitch classes must be nonempty");
  return [first, ...values.slice(1)];
}

function spelledPitches(
  inputs: readonly [SpelledPitchInput, ...SpelledPitchInput[]],
): readonly [SpelledPitch, ...SpelledPitch[]] {
  const values = inputs.map((input) => {
    const result = makeSpelledPitch(input);
    if (!result.ok) throw new Error(`invalid authority pitch: ${result.refusal.code}`);
    return result.value;
  });
  const first = values[0];
  if (first === undefined) throw new Error("authority pitches must be nonempty");
  return [first, ...values.slice(1)];
}

function authorityEvent(input: Readonly<{
  id: string;
  duration: readonly [number, number];
  annotation: string;
  sourceText: string;
  label: string;
  pitchNames: readonly [SpelledPitchClassInput, ...SpelledPitchClassInput[]];
  pitches: readonly [SpelledPitchInput, ...SpelledPitchInput[]];
}>): ChordEvent {
  const duration = makeBeatDuration({
    numerator: input.duration[0],
    denominator: input.duration[1],
  });
  if (!duration.ok) throw new Error(`invalid authority duration: ${duration.refusal.code}`);
  const result = makeChordEvent({
    id: stableId("event", input.id),
    chord: {
      kind: "custom",
      sourceText: input.sourceText,
      label: input.label,
      pitchNames: spelledPitchClasses(input.pitchNames),
      bass: null,
    },
    duration: duration.value,
    annotation: input.annotation,
    voicing: {
      mode: "manual",
      pitches: spelledPitches(input.pitches),
      bassPolicy: "included",
    },
  });
  if (!result.ok) throw new Error(`invalid authority event: ${result.refusal.code}`);
  return result.value;
}

function authoritySourceDocument(): ProgressionDocumentV2 {
  const meter = makeMeter({ beatsPerBar: 4, beatUnit: 4 });
  const playback = makePlaybackSettings({
    instrumentId: "mellow-keys",
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 1,
  });
  const tonic = makeSpelledPitchClass({ step: "D", alter: -1 });
  const mode = makeKeyMode("natural-minor");
  const pickupDuration = makeBeatDuration({ numerator: 1, denominator: 1 });
  const finalDuration = makeBeatDuration({ numerator: 3, denominator: 2 });
  if (!meter.ok || !playback.ok || !tonic.ok || !mode.ok ||
    !pickupDuration.ok || !finalDuration.ok) {
    throw new Error("invalid reviewed identity graph setup");
  }
  return {
    schema: "changes.progression.v2",
    id: stableId("document", "doc-A"),
    title: "Source A",
    description: "preserve exactly",
    meter: meter.value,
    tempoBpm: 120,
    key: null,
    sections: [
      {
        id: stableId("section", "section-A1"),
        name: "A1",
        annotation: "first section",
        keyOverride: null,
        voiceLeadingBoundary: "continue",
        measures: [
          {
            id: stableId("measure", "measure-A1-1"),
            events: [
              authorityEvent({
                id: "event-A1-1-1",
                duration: [1, 1],
                annotation: "keep",
                sourceText: "C E G",
                label: "C triad",
                pitchNames: [
                  { step: "C", alter: 0 },
                  { step: "E", alter: 0 },
                  { step: "G", alter: 0 },
                ],
                pitches: [
                  { step: "C", alter: 0, octave: 4 },
                  { step: "E", alter: 0, octave: 4 },
                  { step: "G", alter: 0, octave: 4 },
                  { step: "C", alter: 0, octave: 5 },
                ],
              }),
              authorityEvent({
                id: "event-A1-1-2",
                duration: [3, 1],
                annotation: "second",
                sourceText: "Db F Ab",
                label: "Db triad",
                pitchNames: [
                  { step: "D", alter: -1 },
                  { step: "F", alter: 0 },
                  { step: "A", alter: -1 },
                ],
                pitches: [
                  { step: "D", alter: -1, octave: 4 },
                  { step: "F", alter: 0, octave: 4 },
                  { step: "A", alter: -1, octave: 4 },
                ],
              }),
            ],
            completion: { kind: "complete" },
          },
          {
            id: stableId("measure", "measure-A1-2"),
            events: [authorityEvent({
              id: "event-A1-2-1",
              duration: [1, 1],
              annotation: "pickup",
              sourceText: "G B D",
              label: "G triad",
              pitchNames: [
                { step: "G", alter: 0 },
                { step: "B", alter: 0 },
                { step: "D", alter: 0 },
              ],
              pitches: [
                { step: "G", alter: 0, octave: 3 },
                { step: "B", alter: 0, octave: 3 },
                { step: "D", alter: 0, octave: 4 },
              ],
            })],
            completion: {
              kind: "pickup",
              expectedDuration: pickupDuration.value,
              reason: "anacrusis",
            },
          },
        ],
      },
      {
        id: stableId("section", "section-A2"),
        name: "A2",
        annotation: "second section",
        keyOverride: { tonic: tonic.value, mode: mode.value },
        voiceLeadingBoundary: "reset",
        measures: [{
          id: stableId("measure", "measure-A2-1"),
          events: [authorityEvent({
            id: "event-A2-1-1",
            duration: [3, 2],
            annotation: "last",
            sourceText: "F Ab C",
            label: "F minor",
            pitchNames: [
              { step: "F", alter: 0 },
              { step: "A", alter: -1 },
              { step: "C", alter: 0 },
            ],
            pitches: [
              { step: "F", alter: 0, octave: 3 },
              { step: "A", alter: -1, octave: 3 },
              { step: "C", alter: 0, octave: 4 },
            ],
          })],
          completion: {
            kind: "incomplete",
            expectedDuration: finalDuration.value,
            reason: "open ending",
          },
        }],
      },
    ],
    playback: playback.value,
  };
}

function mutableAuthorityDocumentWithKey(): ProgressionDocumentV2 {
  const source = structuredClone(authoritySourceDocument());
  const keyOverride = source.sections[1]?.keyOverride;
  if (keyOverride === null || keyOverride === undefined) {
    throw new Error("authority key override missing");
  }
  Reflect.set(source, "key", structuredClone(keyOverride));
  return source;
}

function reviewedSourceGraph(): JsonObject {
  const sharedGraphs = jsonObject(
    identityFixture["sharedGraphs"],
    "identity fixture sharedGraphs",
  );
  return jsonObject(sharedGraphs["source-document-a"], "source-document-a");
}

function remapObject(entries: readonly Readonly<{ from: string; to: string }>[]): JsonObject {
  return Object.fromEntries(entries.map((entry) => [entry.from, entry.to]));
}

function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
    key === "id" ? [] : [[key, withoutIds(child)] as const]
  ));
}

function expectFreshFrozenDomainValue(source: unknown, copied: unknown): void {
  expect(withoutIds(copied)).toEqual(withoutIds(source));
  expectNoSharedObjects(source, copied);
  expectRecursivelyFrozen(copied);
  expectRecursivelyUnfrozen(source);
}

type ChildReadCounts = Readonly<{
  sections: () => number;
  measures: () => number;
  events: () => number;
}>;

function observeChildReads(document: ProgressionDocumentV2): ChildReadCounts {
  const sections = document.sections;
  const section = sections[0];
  const measure = section?.measures[0];
  if (section === undefined || measure === undefined) {
    throw new Error("child-read observation requires one complete path");
  }
  const measures = section.measures;
  const events = measure.events;
  let sectionReads = 0;
  let measureReads = 0;
  let eventReads = 0;
  Object.defineProperty(document, "sections", {
    configurable: true,
    enumerable: true,
    get: () => {
      sectionReads += 1;
      return sections;
    },
  });
  Object.defineProperty(section, "measures", {
    configurable: true,
    enumerable: true,
    get: () => {
      measureReads += 1;
      return measures;
    },
  });
  Object.defineProperty(measure, "events", {
    configurable: true,
    enumerable: true,
    get: () => {
      eventReads += 1;
      return events;
    },
  });
  return {
    sections: () => sectionReads,
    measures: () => measureReads,
    events: () => eventReads,
  };
}

describe("F1 stable identities", () => {
  test("wire parsing preserves exact valid text and refuses length before syntax", () => {
    const boundary = `A${"._:-z9".repeat(21)}B`;
    expect(boundary.length).toBe(128);
    const parsedBoundary = parseStableId("document", boundary);
    expect(parsedBoundary.ok).toBe(true);
    if (parsedBoundary.ok) expect(String(parsedBoundary.value)).toBe(boundary);
    expect(parseStableId("section", `${boundary}C`)).toEqual({
      ok: false,
      refusal: {
        code: "id.length_exceeded",
        path: ["id"],
        receivedLength: 129,
        maximum: 128,
      },
    });
    expect(parseStableId("event", " valid")).toMatchObject({
      ok: false,
      refusal: { code: "id.syntax_invalid", path: ["id"], received: " valid" },
    });
  });

  test("drives F1-ID-013/015/016 production entropy rows without Math.random", () => {
    const uuidCase = identityCase("F1-ID-015");
    const uuidExpected = expectedRecord("F1-ID-015");
    const fallbackCase = identityCase("F1-ID-016");
    const fallbackExpected = expectedRecord("F1-ID-016");
    const original = globalThis.crypto;
    const mathRandom = Math.random;
    let mathCalls = 0;
    try {
      Math.random = () => {
        mathCalls += 1;
        return 0;
      };
      let randomValuesCalls = 0;
      globalThis.crypto = {
        randomUUID: () => stringField(uuidCase, "entropyOutput", "F1-ID-015"),
        getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
          randomValuesCalls += 1;
          return array;
        },
      } as Crypto;
      const preferred = createProductionStableIdFactory().next("document");
      expect(preferred.ok).toBe(true);
      if (preferred.ok) {
        expect(String(preferred.value)).toBe(
          stringField(uuidExpected, "value", "F1-ID-015.expected"),
        );
        expect(preferred.source ===
          stringField(uuidExpected, "source", "F1-ID-015.expected")).toBe(true);
      }
      expect(randomValuesCalls).toBe(0);

      globalThis.crypto = {
        getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
          const bytes = array as Uint8Array;
          numberArray(fallbackCase["entropyBytes"], "F1-ID-016.entropyBytes")
            .forEach((value, index) => {
              bytes[index] = value;
            });
          return array;
        },
      } as Crypto;
      const generated = createProductionStableIdFactory().next("event");
      expect(generated.ok).toBe(true);
      if (generated.ok) {
        expect(String(generated.value)).toBe(
          stringField(fallbackExpected, "value", "F1-ID-016.expected"),
        );
        expect(generated.source ===
          stringField(fallbackExpected, "source", "F1-ID-016.expected")).toBe(true);
      }
      expect(mathCalls).toBe(0);

      globalThis.crypto = {} as Crypto;
      const unavailable = createProductionStableIdFactory().next("document");
      expect(unavailable.ok).toBe(false);
      if (!unavailable.ok) {
        const expectedIssue = jsonObject(
          expectedRecord("F1-ID-013")["issue"],
          "F1-ID-013 issue",
        );
        expect(JSON.stringify(unavailable.refusal)).toBe(
          JSON.stringify(expectedIssue),
        );
      }
      expect(mathCalls).toBe(0);

      globalThis.crypto = {
        randomUUID: (): ReturnType<Crypto["randomUUID"]> => {
          throw new Error("synthetic entropy failure");
        },
        getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
          void array;
          throw new Error("synthetic entropy failure");
        },
      } as Crypto;
      expect(createProductionStableIdFactory().next("measure")).toEqual({
        ok: false,
        refusal: {
          code: "id.factory_exhausted",
          kind: "measure",
          path: ["id"],
        },
      });
      expect(mathCalls).toBe(0);
    } finally {
      globalThis.crypto = original;
      Math.random = mathRandom;
    }
  });
});

describe("F1 reviewed identity authority", () => {
  test("accounts for all 19 reviewed rows at their owning runtime stage", () => {
    const accounting = {
      "F1-ID-001": "F1 copy runtime",
      "F1-ID-002": "F1 copy runtime",
      "F1-ID-003": "F1 copy runtime",
      "F1-ID-004": "F1 copy runtime",
      "F1-ID-005": "A0 reorder command observation",
      "F1-ID-006": "F1 copy runtime",
      "F1-ID-007": "F1 copy runtime",
      "F1-ID-008": "F1 copy runtime",
      "F1-ID-009": "F2 duplicate decoder observation",
      "F1-ID-010": "F2 duplicate decoder observation",
      "F1-ID-011": "F1 copy runtime",
      "F1-ID-012": "F1 copy runtime",
      "F1-ID-013": "F1 production factory runtime",
      "F1-ID-014": "F1 private defensive invariant; candidate remaps are not public input",
      "F1-ID-015": "F1 production factory runtime",
      "F1-ID-016": "F1 production factory runtime",
      "F1-ID-017": "F1 copy runtime",
      "F1-ID-018": "F1 exact copy boundary runtime",
      "F1-ID-019": "F1 copy boundary refusal runtime",
    } as const;
    expect([...identityCases.keys()].sort()).toEqual(Object.keys(accounting).sort());
    expect(Object.values(accounting).every((owner) => owner.length > 0)).toBe(true);
    expect(stringField(identityCase("F1-ID-005"), "kind", "F1-ID-005")).toBe(
      "reorder-preserves-identity",
    );
    expect(stringField(identityCase("F1-ID-009"), "kind", "F1-ID-009")).toBe(
      "decode-duplicate-id-same-measure",
    );
    expect(stringField(identityCase("F1-ID-010"), "kind", "F1-ID-010")).toBe(
      "decode-duplicate-id-cross-kind",
    );
    expect(stringField(identityCase("F1-ID-014"), "kind", "F1-ID-014")).toBe(
      "reject-incomplete-deep-remap",
    );
  });

  test("drives F1-ID-001/002/003/004/017 successful copies from reviewed rows", () => {
    const source = authoritySourceDocument();
    expect(JSON.parse(JSON.stringify(source))).toEqual(reviewedSourceGraph());
    const before = JSON.stringify(source);

    const documentFactory = factoryFrom(factoryOutputs("F1-ID-001"));
    const documentResult = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: documentFactory.factory,
    });
    expect(documentResult.ok).toBe(true);
    if (!documentResult.ok) return;
    expect(remapObject(documentResult.remap.entries)).toEqual(
      jsonObject(expectedRecord("F1-ID-001")["remap"], "F1-ID-001 remap"),
    );
    expect(withoutIds(documentResult.value)).toEqual(withoutIds(source));

    const section = source.sections[0];
    const measure = section?.measures[0];
    const sourceEvent = measure?.events[0];
    if (section === undefined || measure === undefined || sourceEvent === undefined) {
      throw new Error("reviewed identity graph is incomplete");
    }
    const sectionFactory = factoryFrom(factoryOutputs("F1-ID-002"));
    const sectionResult = copyDomain({
      rootKind: "section",
      purpose: "duplicate",
      source: section,
      destination: null,
      idFactory: sectionFactory.factory,
    });
    expect(sectionResult.ok).toBe(true);
    if (!sectionResult.ok) return;
    expect(remapObject(sectionResult.remap.entries)).toEqual(
      jsonObject(expectedRecord("F1-ID-002")["remap"], "F1-ID-002 remap"),
    );
    expect(withoutIds(sectionResult.value)).toEqual(withoutIds(section));

    const measureFactory = factoryFrom(factoryOutputs("F1-ID-003"));
    const measureResult = copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: measure,
      destination: null,
      idFactory: measureFactory.factory,
    });
    expect(measureResult.ok).toBe(true);
    if (!measureResult.ok) return;
    expect(remapObject(measureResult.remap.entries)).toEqual(
      jsonObject(expectedRecord("F1-ID-003")["remap"], "F1-ID-003 remap"),
    );
    expect(withoutIds(measureResult.value)).toEqual(withoutIds(measure));

    const lessonFactory = factoryFrom(factoryOutputs("F1-ID-004"));
    const lessonResult = copyDomain({
      rootKind: "document",
      purpose: "lesson-instantiation",
      source,
      destination: null,
      idFactory: lessonFactory.factory,
    });
    expect(lessonResult.ok).toBe(true);
    if (!lessonResult.ok) return;
    expect(JSON.stringify(lessonResult.remap.entries.map((entry) => ({
      kind: entry.kind,
      from: entry.from,
      to: entry.to,
      sourcePath: entry.sourcePath,
    })))).toBe(JSON.stringify(
      expectedRecord("F1-ID-004")["orderedRemapEntries"],
    ));

    const eventFactory = factoryFrom(factoryOutputs("F1-ID-017"));
    const eventResult = copyDomain({
      rootKind: "event",
      purpose: "duplicate",
      source: sourceEvent,
      destination: null,
      idFactory: eventFactory.factory,
    });
    expect(eventResult.ok).toBe(true);
    if (!eventResult.ok) return;
    expect(remapObject(eventResult.remap.entries)).toEqual(
      jsonObject(expectedRecord("F1-ID-017")["remap"], "F1-ID-017 remap"),
    );
    expect(withoutIds(eventResult.value)).toEqual(withoutIds(sourceEvent));
    expect(JSON.stringify(source)).toBe(before);
  });

  test("drives F1-ID-006/007/008/011/012 refusal schedules from reviewed rows", () => {
    const source = authoritySourceDocument();
    const before = JSON.stringify(source);
    const firstMeasure = source.sections[0]?.measures[0];
    if (firstMeasure === undefined) throw new Error("reviewed measure missing");

    const existingCross = factoryFrom(factoryOutputs("F1-ID-006"));
    const existingCrossResult = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: source as ValidatedDocument,
      idFactory: existingCross.factory,
    });
    expect(existingCrossResult).toMatchObject({
      ok: false,
      refusal: expectedRecord("F1-ID-006")["issue"],
    });
    expect(existingCross.calls).toHaveLength(
      numberField(expectedRecord("F1-ID-006"), "factoryCalls", "F1-ID-006"),
    );

    const allocatedCross = factoryFrom(factoryOutputs("F1-ID-007"));
    const allocatedCrossResult = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: allocatedCross.factory,
    });
    expect(allocatedCrossResult).toMatchObject({
      ok: false,
      refusal: expectedRecord("F1-ID-007")["issue"],
    });
    expect(allocatedCross.calls).toHaveLength(
      numberField(expectedRecord("F1-ID-007"), "factoryCalls", "F1-ID-007"),
    );

    const exhausted = factoryFrom(factoryOutputs("F1-ID-008"));
    const exhaustedResult = copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: firstMeasure,
      destination: null,
      idFactory: exhausted.factory,
    });
    expect(exhaustedResult).toMatchObject({
      ok: false,
      refusal: expectedRecord("F1-ID-008")["issue"],
    });
    expect(exhausted.calls).toHaveLength(
      numberField(expectedRecord("F1-ID-008"), "factoryCalls", "F1-ID-008"),
    );

    const existingSame = factoryFrom(factoryOutputs("F1-ID-011"));
    const existingSameResult = copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: firstMeasure,
      destination: source as ValidatedDocument,
      idFactory: existingSame.factory,
    });
    expect(existingSameResult).toMatchObject({
      ok: false,
      refusal: expectedRecord("F1-ID-011")["issue"],
    });
    expect(existingSame.calls).toHaveLength(
      numberField(expectedRecord("F1-ID-011"), "factoryCalls", "F1-ID-011"),
    );

    const allocatedSame = factoryFrom(factoryOutputs("F1-ID-012"));
    const allocatedSameResult = copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: firstMeasure,
      destination: null,
      idFactory: allocatedSame.factory,
    });
    expect(allocatedSameResult).toMatchObject({
      ok: false,
      refusal: expectedRecord("F1-ID-012")["issue"],
    });
    expect(allocatedSame.calls).toHaveLength(
      numberField(expectedRecord("F1-ID-012"), "factoryCalls", "F1-ID-012"),
    );
    expect(JSON.stringify(source)).toBe(before);
    for (const result of [
      existingCrossResult,
      allocatedCrossResult,
      exhaustedResult,
      existingSameResult,
      allocatedSameResult,
    ]) {
      expect(Object.isFrozen(result)).toBe(true);
      expect("value" in result).toBe(false);
      expect("remap" in result).toBe(false);
    }
  });
});

describe("F1 transactional copy", () => {
  test("allocates in structural preorder and remaps every descendant once", () => {
    const source = sourceDocument();
    const before = JSON.stringify(source);
    const deterministic = factoryFrom([
      "doc-copy",
      "section-copy",
      "measure-copy",
      "event-copy-1",
      "event-copy-2",
    ]);
    const result = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: deterministic.factory,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deterministic.calls).toEqual([
      "document",
      "section",
      "measure",
      "event",
      "event",
    ]);
    expect(result.remap.entries.map(({ kind, from, to, sourcePath }) => ({
      kind,
      from: String(from),
      to: String(to),
      sourcePath,
    }))).toEqual([
      { kind: "document", from: "doc-source", to: "doc-copy", sourcePath: ["id"] },
      { kind: "section", from: "section-source", to: "section-copy", sourcePath: ["sections", 0, "id"] },
      { kind: "measure", from: "measure-source", to: "measure-copy", sourcePath: ["sections", 0, "measures", 0, "id"] },
      { kind: "event", from: "event-source-1", to: "event-copy-1", sourcePath: ["sections", 0, "measures", 0, "events", 0, "id"] },
      { kind: "event", from: "event-source-2", to: "event-copy-2", sourcePath: ["sections", 0, "measures", 0, "events", 1, "id"] },
    ]);
    expect(result.value.sections[0]?.measures[0]?.events.map(({ id }) => String(id))).toEqual([
      "event-copy-1",
      "event-copy-2",
    ]);
    expect(JSON.stringify(source)).toBe(before);
    expect(result.value).not.toBe(source);
    expect(result.value.sections[0]).not.toBe(source.sections[0]);
    const copiedSection = result.value.sections[0];
    const copiedMeasure = copiedSection?.measures[0];
    const sourceCompletion = source.sections[0]?.measures[0]?.completion;
    expect(copiedMeasure?.completion).not.toBe(sourceCompletion);
    expect(copiedMeasure?.completion).toEqual(sourceCompletion);
    expect(Object.isFrozen(sourceCompletion)).toBe(false);
    expect(Object.isFrozen(copiedMeasure?.completion)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.sections)).toBe(true);
    expect(Object.isFrozen(copiedSection)).toBe(true);
    expect(Object.isFrozen(copiedSection?.measures)).toBe(true);
    expect(Object.isFrozen(copiedMeasure)).toBe(true);
    expect(Object.isFrozen(copiedMeasure?.events)).toBe(true);
    expect(copiedMeasure?.events.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(result.remap)).toBe(true);
    expect(Object.isFrozen(result.remap.entries)).toBe(true);
    expect(result.remap.entries.every(Object.isFrozen)).toBe(true);
    expect(result.remap.entries.every((entry) =>
      Object.isFrozen(entry.sourcePath)
    )).toBe(true);
    expect(Object.keys(result.remap.entries[0] ?? {}).sort()).toEqual([
      "from",
      "kind",
      "sourcePath",
      "to",
    ]);
  });

  test("uses exactly two source child traversals and one destination traversal", () => {
    const source = sourceDocument();
    const destination = sourceDocument() as ValidatedDocument;
    const sourceReads = observeChildReads(source);
    const destinationReads = observeChildReads(destination);
    const deterministic = factoryFrom([
      "observed-document",
      "observed-section",
      "observed-measure",
      "observed-event-1",
      "observed-event-2",
    ]);
    let firstFactorySnapshot: readonly number[] | undefined;
    const observingFactory: StableIdFactory = {
      next: <K extends StableIdKind>(kind: K): IdFactoryResult<K> => {
        firstFactorySnapshot ??= [
          sourceReads.sections(),
          sourceReads.measures(),
          sourceReads.events(),
          destinationReads.sections(),
          destinationReads.measures(),
          destinationReads.events(),
        ];
        return deterministic.factory.next(kind);
      },
    };

    const result = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination,
      idFactory: observingFactory,
    });
    expect(result.ok).toBe(true);
    expect(firstFactorySnapshot).toEqual([2, 2, 2, 1, 1, 1]);
    expect([
      sourceReads.sections(),
      sourceReads.measures(),
      sourceReads.events(),
      destinationReads.sections(),
      destinationReads.measures(),
      destinationReads.events(),
    ]).toEqual([2, 2, 2, 1, 1, 1]);
  });

  test("copies section, measure, and event roots with root-relative paths", () => {
    const document = sourceDocument();
    const section = document.sections[0];
    const measure = section?.measures[0];
    const sourceEvent = measure?.events[0];
    if (section === undefined || measure === undefined || sourceEvent === undefined) {
      throw new Error("missing subtree fixture");
    }

    const sectionFactory = factoryFrom([
      "section-subtree-copy",
      "measure-subtree-copy",
      "event-subtree-copy-1",
      "event-subtree-copy-2",
    ]);
    const sectionResult = copyDomain({
      rootKind: "section",
      purpose: "duplicate",
      source: section,
      destination: null,
      idFactory: sectionFactory.factory,
    });
    expect(sectionResult.ok).toBe(true);
    if (!sectionResult.ok) return;
    expect(sectionFactory.calls).toEqual(["section", "measure", "event", "event"]);
    expect(sectionResult.remap.entries.map((entry) => entry.sourcePath)).toEqual([
      ["id"],
      ["measures", 0, "id"],
      ["measures", 0, "events", 0, "id"],
      ["measures", 0, "events", 1, "id"],
    ]);

    const measureFactory = factoryFrom([
      "measure-root-copy",
      "event-root-copy-1",
      "event-root-copy-2",
    ]);
    const measureResult = copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: measure,
      destination: null,
      idFactory: measureFactory.factory,
    });
    expect(measureResult.ok).toBe(true);
    if (!measureResult.ok) return;
    expect(measureResult.remap.entries.map((entry) => entry.sourcePath)).toEqual([
      ["id"],
      ["events", 0, "id"],
      ["events", 1, "id"],
    ]);

    const eventFactory = factoryFrom(["single-event-copy"]);
    const eventResult = copyDomain({
      rootKind: "event",
      purpose: "duplicate",
      source: sourceEvent,
      destination: null,
      idFactory: eventFactory.factory,
    });
    expect(eventResult.ok).toBe(true);
    if (!eventResult.ok) return;
    expect(String(eventResult.value.id)).toBe("single-event-copy");
    expect(eventResult.remap.entries[0]?.sourcePath).toEqual(["id"]);
  });

  test("returns fresh recursively frozen domain values for every copy root", () => {
    const document = mutableAuthorityDocumentWithKey();
    const section = document.sections[1];
    const measure = section?.measures[0];
    const sourceEvent = measure?.events[0];
    if (section === undefined || measure === undefined || sourceEvent === undefined) {
      throw new Error("deep-copy authority graph is incomplete");
    }

    const documentFactory = countingFactory();
    const documentResult = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source: document,
      destination: null,
      idFactory: documentFactory.factory,
    });
    expect(documentResult.ok).toBe(true);
    if (!documentResult.ok) return;
    expectFreshFrozenDomainValue(document, documentResult.value);

    const sectionFactory = countingFactory();
    const sectionResult = copyDomain({
      rootKind: "section",
      purpose: "duplicate",
      source: section,
      destination: null,
      idFactory: sectionFactory.factory,
    });
    expect(sectionResult.ok).toBe(true);
    if (!sectionResult.ok) return;
    expectFreshFrozenDomainValue(section, sectionResult.value);

    const measureFactory = countingFactory();
    const measureResult = copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: measure,
      destination: null,
      idFactory: measureFactory.factory,
    });
    expect(measureResult.ok).toBe(true);
    if (!measureResult.ok) return;
    expectFreshFrozenDomainValue(measure, measureResult.value);

    const eventFactory = countingFactory();
    const eventResult = copyDomain({
      rootKind: "event",
      purpose: "duplicate",
      source: sourceEvent,
      destination: null,
      idFactory: eventFactory.factory,
    });
    expect(eventResult.ok).toBe(true);
    if (!eventResult.ok) return;
    expectFreshFrozenDomainValue(sourceEvent, eventResult.value);
  });

  test("isolates every document payload family from later source mutation", () => {
    const source = mutableAuthorityDocumentWithKey();
    const deterministic = countingFactory();
    const result = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: deterministic.factory,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copiedBeforeMutation = JSON.stringify(result.value);
    const sourceBeforeMutation = JSON.stringify(source);

    const keyedSection = source.sections[1];
    const partialMeasure = keyedSection?.measures[0];
    const customEvent = source.sections[0]?.measures[0]?.events[0];
    if (
      source.key === null || keyedSection?.keyOverride === null ||
      keyedSection?.keyOverride === undefined || partialMeasure === undefined ||
      partialMeasure.completion.kind === "empty" ||
      partialMeasure.completion.kind === "complete" || customEvent === undefined ||
      customEvent.chord.kind !== "custom" || customEvent.voicing.mode !== "manual"
    ) {
      throw new Error("source-mutation authority graph is incomplete");
    }

    Reflect.set(source.meter, "beatsPerBar", 3);
    Reflect.set(source.key.tonic, "step", "F");
    Reflect.set(source.playback, "masterVolume", 0.1);
    Reflect.set(keyedSection.keyOverride.tonic, "alter", 2);
    Reflect.set(partialMeasure.completion.expectedDuration, "numerator", 99);
    Reflect.set(customEvent.duration, "denominator", 8);
    Reflect.set(customEvent.chord, "sourceText", "mutated chord");
    Reflect.set(customEvent.chord.pitchNames[0], "step", "B");
    Array.prototype.reverse.call(customEvent.chord.pitchNames);
    Reflect.set(customEvent.voicing.pitches[0], "octave", 9);
    Array.prototype.reverse.call(customEvent.voicing.pitches);
    Array.prototype.reverse.call(source.sections);

    expect(JSON.stringify(source)).not.toBe(sourceBeforeMutation);
    expect(JSON.stringify(result.value)).toBe(copiedBeforeMutation);
    expectRecursivelyFrozen(result.value);
  });

  test("isolates parsed/custom chord and auto/manual/frozen voicing branches", () => {
    const customManual = structuredClone(event("mutable-custom-manual"));
    if (
      customManual.chord.kind !== "custom" ||
      customManual.voicing.mode !== "manual"
    ) throw new Error("custom/manual source missing");
    Array.prototype.push.call(
      customManual.chord.pitchNames,
      structuredClone(customManual.chord.pitchNames[0]),
    );
    Array.prototype.push.call(
      customManual.voicing.pitches,
      structuredClone(customManual.voicing.pitches[0]),
    );
    const sources = [
      customManual,
      structuredClone(parsedEvent("mutable-parsed-auto", "auto")),
      structuredClone(parsedEvent("mutable-parsed-frozen", "frozen")),
    ];

    for (const [index, source] of sources.entries()) {
      const deterministic = factoryFrom([`isolated-event-${String(index)}`]);
      const result = copyDomain({
        rootKind: "event",
        purpose: "duplicate",
        source,
        destination: null,
        idFactory: deterministic.factory,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expectFreshFrozenDomainValue(source, result.value);
      const copiedBeforeMutation = JSON.stringify(result.value);
      const sourceBeforeMutation = JSON.stringify(source);

      Reflect.set(source.duration, "numerator", 77);
      if (source.chord.kind === "custom") {
        Reflect.set(source.chord.pitchNames[0], "alter", 2);
        Array.prototype.reverse.call(source.chord.pitchNames);
      } else {
        Reflect.set(source.chord.root, "step", "F");
        const extension = source.chord.extensions[0];
        if (extension === undefined) throw new Error("parsed extension missing");
        Reflect.set(extension, "alter", -2);
        Array.prototype.reverse.call(source.chord.additions);
      }
      switch (source.voicing.mode) {
        case "auto":
          Reflect.set(source.voicing.range, "highMidi", 127);
          break;
        case "manual":
          Reflect.set(source.voicing.pitches[0], "octave", -1);
          Array.prototype.reverse.call(source.voicing.pitches);
          break;
        case "frozen":
          Reflect.set(source.voicing.pitches[0], "step", "D");
          Reflect.set(source.voicing.generatedBy, "engineVersion", "mutated");
          Array.prototype.reverse.call(source.voicing.pitches);
          break;
      }

      expect(JSON.stringify(source)).not.toBe(sourceBeforeMutation);
      expect(JSON.stringify(result.value)).toBe(copiedBeforeMutation);
      expectRecursivelyFrozen(result.value);
    }
  });

  test("reports source-original collisions relative to every copied root", () => {
    const document = sourceDocument();
    const section = document.sections[0];
    const measure = section?.measures[0];
    const sourceEvent = measure?.events[0];
    if (section === undefined || measure === undefined || sourceEvent === undefined) {
      throw new Error("source-collision graph is incomplete");
    }

    const documentFactory = factoryFrom(["event-source-2"]);
    expect(copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source: document,
      destination: null,
      idFactory: documentFactory.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "id.collision_existing",
        path: ["id"],
        requested: { kind: "document", path: ["id"], pathRoot: "copy-root" },
        occupied: {
          kind: "event",
          path: ["sections", 0, "measures", 0, "events", 1, "id"],
          pathRoot: "copy-root",
        },
        collidingId: "event-source-2",
      },
    });

    const sectionFactory = factoryFrom(["measure-source"]);
    expect(copyDomain({
      rootKind: "section",
      purpose: "duplicate",
      source: section,
      destination: null,
      idFactory: sectionFactory.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "id.collision_existing",
        path: ["id"],
        requested: { kind: "section", path: ["id"], pathRoot: "copy-root" },
        occupied: {
          kind: "measure",
          path: ["measures", 0, "id"],
          pathRoot: "copy-root",
        },
        collidingId: "measure-source",
      },
    });

    const measureFactory = factoryFrom(["event-source-2"]);
    expect(copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: measure,
      destination: null,
      idFactory: measureFactory.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "id.collision_existing",
        path: ["id"],
        requested: { kind: "measure", path: ["id"], pathRoot: "copy-root" },
        occupied: {
          kind: "event",
          path: ["events", 1, "id"],
          pathRoot: "copy-root",
        },
        collidingId: "event-source-2",
      },
    });

    const eventFactory = factoryFrom(["event-source-1"]);
    expect(copyDomain({
      rootKind: "event",
      purpose: "duplicate",
      source: sourceEvent,
      destination: null,
      idFactory: eventFactory.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "id.collision_existing",
        path: ["id"],
        requested: { kind: "event", path: ["id"], pathRoot: "copy-root" },
        occupied: { kind: "event", path: ["id"], pathRoot: "copy-root" },
        collidingId: "event-source-1",
      },
    });

    expect(documentFactory.calls).toEqual(["document"]);
    expect(sectionFactory.calls).toEqual(["section"]);
    expect(measureFactory.calls).toEqual(["measure"]);
    expect(eventFactory.calls).toEqual(["event"]);
  });

  test("fails atomically on existing and newly allocated cross-kind collisions", () => {
    const source = sourceDocument();
    const existing = factoryFrom(["event-source-2", "unused"]);
    const existingResult = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: existing.factory,
    });
    expect(existingResult).toEqual({
      ok: false,
      refusal: {
        code: "id.collision_existing",
        path: ["id"],
        requested: { kind: "document", path: ["id"], pathRoot: "copy-root" },
        occupied: {
          kind: "event",
          path: ["sections", 0, "measures", 0, "events", 1, "id"],
          pathRoot: "copy-root",
        },
        collidingId: "event-source-2",
      },
    });
    expect(existing.calls).toEqual(["document"]);
    expect(Object.isFrozen(existingResult)).toBe(true);

    const allocated = factoryFrom(["new-root", "shared-new", "shared-new"]);
    const allocatedResult = copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: allocated.factory,
    });
    expect(allocatedResult).toMatchObject({
      ok: false,
      refusal: {
        code: "id.collision_allocated",
        path: ["sections", 0, "measures", 0, "id"],
        requested: { kind: "measure", pathRoot: "copy-root" },
        firstAllocated: { kind: "section", pathRoot: "copy-root" },
        collidingId: "shared-new",
      },
    });
    expect(allocated.calls).toEqual(["document", "section", "measure"]);
  });

  test("rebases an exhausted injected factory to the requested descendant", () => {
    const source = sourceDocument().sections[0]?.measures[0];
    if (source === undefined) throw new Error("missing measure fixture");
    const exhausted = factoryFrom(["new-measure", "new-event-only"]);
    expect(copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: exhausted.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "id.factory_exhausted",
        kind: "event",
        path: ["events", 1, "id"],
      },
    });
    expect(exhausted.calls).toEqual(["measure", "event", "event"]);
  });

  test("reports subtree collisions at their containing destination path", () => {
    const destination = sourceDocument() as ValidatedDocument;
    const measure = destination.sections[0]?.measures[0];
    if (measure === undefined) throw new Error("missing measure fixture");
    const deterministic = factoryFrom(["measure-source"]);

    expect(copyDomain({
      rootKind: "measure",
      purpose: "duplicate",
      source: measure,
      destination,
      idFactory: deterministic.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "id.collision_existing",
        path: ["id"],
        requested: { kind: "measure", path: ["id"], pathRoot: "copy-root" },
        occupied: {
          kind: "measure",
          path: ["sections", 0, "measures", 0, "id"],
          pathRoot: "occupied-document",
        },
        collidingId: "measure-source",
      },
    });
    expect(deterministic.calls).toEqual(["measure"]);
  });

  test("drives F1-ID-019 count refusal before the first allocation", () => {
    const descriptor = inputDescriptor("F1-ID-019");
    const sectionCount = numberField(descriptor, "sections", "F1-ID-019");
    const measureCount = numberField(descriptor, "measures", "F1-ID-019");
    const eventCount = numberField(descriptor, "events", "F1-ID-019");
    const measuresPerSection = measureCount / sectionCount;
    const repeatedEvent = event("event-repeated-for-limit-proof");
    const overfullEvents: [ChordEvent, ...ChordEvent[]] = [
      repeatedEvent,
      ...Array.from({ length: eventCount - 1 }, () => repeatedEvent),
    ];
    const overfullMeasure: Measure = {
      id: stableId("measure", "measure-overfull"),
      events: overfullEvents,
      completion: { kind: "complete" },
    };
    const emptyMeasure: Measure = {
      id: stableId("measure", "measure-empty-repeated"),
      events: [],
      completion: { kind: "empty" },
    };
    const sections: Section[] = Array.from({ length: sectionCount }, (_, sectionIndex) => ({
      id: stableId("section", `section-limit-${String(sectionIndex)}`),
      name: "limit",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "continue" as const,
      measures: Array.from(
        { length: measuresPerSection },
        (_, measureIndex) => sectionIndex === 0 && measureIndex === 0
          ? overfullMeasure
          : emptyMeasure,
      ),
    }));
    const source: ProgressionDocumentV2 = {
      ...sourceDocument(),
      sections,
    };
    const deterministic = factoryFrom(["must-not-be-observed"]);

    expect(copyDomain({
      rootKind: "document",
      purpose: "duplicate",
      source,
      destination: null,
      idFactory: deterministic.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "limit.copy_nodes_exceeded",
        path: ["source"],
        received: 73_794,
        maximum: 73_793,
      },
    });
    expect(deterministic.calls).toEqual([]);
    expect(numberField(descriptor, "derivedNodeCount", "F1-ID-019")).toBe(
      73_794,
    );

    const destinationFactory = factoryFrom(["must-not-be-observed-either"]);
    expect(copyDomain({
      rootKind: "event",
      purpose: "duplicate",
      source: repeatedEvent,
      destination: source as ValidatedDocument,
      idFactory: destinationFactory.factory,
    })).toEqual({
      ok: false,
      refusal: {
        code: "limit.copy_nodes_exceeded",
        path: ["destination"],
        received: 73_794,
        maximum: 73_793,
      },
    });
    expect(destinationFactory.calls).toEqual([]);
  });

  test("drives F1-ID-018 exact boundary with one allocation per node", () => {
    const descriptor = inputDescriptor("F1-ID-018");
    const sectionCount = numberField(descriptor, "sections", "F1-ID-018");
    const measureCount = numberField(descriptor, "measures", "F1-ID-018");
    const eventCount = numberField(descriptor, "events", "F1-ID-018");
    const measuresPerSection = measureCount / sectionCount;
    const eventMeasuresPerSection = eventCount / sectionCount;
    const sections: Section[] = Array.from({ length: sectionCount }, (_, sectionIndex) => {
      const measures: Measure[] = Array.from(
        { length: measuresPerSection },
        (_, measureIndex): Measure => {
          const suffix = `${String(sectionIndex)}-${String(measureIndex)}`;
          const hasEvent = measureIndex < eventMeasuresPerSection;
          if (hasEvent) {
            return {
              id: stableId("measure", `measure-boundary-${suffix}`),
              events: [event(`event-boundary-${suffix}`)],
              completion: { kind: "complete" },
            };
          }
          return {
            id: stableId("measure", `measure-boundary-${suffix}`),
            events: [],
            completion: { kind: "empty" },
          };
        },
      );
      return {
        id: stableId("section", `section-boundary-${String(sectionIndex)}`),
        name: "boundary",
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "continue",
        measures,
      };
    });
    const source: ProgressionDocumentV2 = { ...sourceDocument(), sections };
    const deterministic = countingFactory();
    const result = copyDomain({
      rootKind: "document",
      purpose: "lesson-instantiation",
      source,
      destination: null,
      idFactory: deterministic.factory,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const derivedNodeCount = numberField(
      descriptor,
      "derivedNodeCount",
      "F1-ID-018",
    );
    expect(deterministic.callCount()).toBe(derivedNodeCount);
    expect(result.remap.entries).toHaveLength(derivedNodeCount);
    expect(result.value.sections).toHaveLength(sectionCount);
    expect(result.value.sections[sectionCount - 1]?.measures).toHaveLength(
      measuresPerSection,
    );
  }, 60_000);
});

test("F1 diagnostic ordering compares numeric path segments numerically", () => {
  expect(compareDomainPaths(["events", 2], ["events", 10])).toBe(-1);
  expect(compareDomainPaths(["events", 2], ["events", 2, "duration"])).toBe(-1);
  expect(compareValidationIssues(
    { code: "tempo.out_of_range", path: ["events", 2], message: "later code" },
    { code: "tempo.not_integer", path: ["events", 2], message: "earlier code" },
  )).toBe(1);
});
