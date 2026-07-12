import { describe, expect, test } from "bun:test";

import {
  domainOperations,
  type IdFactoryResult,
  type KeyContext,
  type Measure,
  type ProgressionDocumentV2,
  type Section,
  type StableIdFactory,
  type StableIdFor,
  type StableIdKind,
} from "../../src/domain";

function successfulValue<Value>(
  result:
    | Readonly<{ ok: true; value: Value }>
    | Readonly<{ ok: false; refusal: Readonly<{ code: string }> }>,
  label: string,
): Value {
  if (!result.ok) {
    throw new Error(`${label}: unexpected refusal ${result.refusal.code}`);
  }
  return result.value;
}

function stableId<K extends StableIdKind>(
  kind: K,
  wire: string,
): StableIdFor<K> {
  return successfulValue(
    domainOperations.parseStableId(kind, wire),
    `integration ID ${kind}`,
  );
}

function factoryFrom(wires: readonly string[]): Readonly<{
  calls: StableIdKind[];
  factory: StableIdFactory;
}> {
  const calls: StableIdKind[] = [];
  let index = 0;
  return {
    calls,
    factory: {
      next: <K extends StableIdKind>(kind: K): IdFactoryResult<K> => {
        calls.push(kind);
        const wire = wires[index];
        index += 1;
        if (wire === undefined) {
          return {
            ok: false,
            refusal: { code: "id.factory_exhausted", kind, path: ["id"] },
          };
        }
        const parsed = domainOperations.parseStableId(kind, wire);
        if (!parsed.ok) {
          return {
            ok: false,
            refusal: { code: "id.factory_exhausted", kind, path: ["id"] },
          };
        }
        return {
          ok: true,
          value: parsed.value,
          source: "deterministic-test",
        };
      },
    },
  };
}

function recursivelyFrozen(
  value: unknown,
  visited: Set<object> = new Set<object>(),
): boolean {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return true;
  }
  visited.add(value);
  return Object.isFrozen(value) &&
    Object.values(value).every((child) => recursivelyFrozen(child, visited));
}

function noSharedObjects(
  source: unknown,
  copied: unknown,
  visited: Set<object> = new Set<object>(),
): boolean {
  if (typeof source !== "object" || source === null) return true;
  if (typeof copied !== "object" || copied === null || copied === source) {
    return false;
  }
  if (visited.has(source)) return true;
  visited.add(source);
  return Object.keys(source).every((key) =>
    !Object.hasOwn(copied, key) ||
    noSharedObjects(Reflect.get(source, key), Reflect.get(copied, key), visited),
  );
}

describe("F1 public domain package integration", () => {
  test("composes identity, spelling, exact time, harmony values, document data, and immutable copy", () => {
    expect(Object.isFrozen(domainOperations)).toBe(true);

    const documentId = stableId("document", "integration-document");
    const sectionId = stableId("section", "integration-section");
    const measureId = stableId("measure", "integration-measure");
    const eventId = stableId("event", "integration-event");

    const invalidInstrument = domainOperations.makeInstrumentId("grand-piano");
    expect(invalidInstrument).toMatchObject({
      ok: false,
      refusal: {
        code: "document.instrument_id_invalid",
        path: ["instrumentId"],
      },
    });

    const bSharp = successfulValue(
      domainOperations.makeSpelledPitch({ step: "B", alter: 1, octave: 3 }),
      "integration B-sharp 3",
    );
    const middleC = successfulValue(
      domainOperations.makeSpelledPitch({ step: "C", alter: 0, octave: 4 }),
      "integration C4",
    );
    const bSharpProjection = successfulValue(
      domainOperations.projectSpelledPitch(bSharp),
      "integration B-sharp projection",
    );
    const middleCProjection = successfulValue(
      domainOperations.projectSpelledPitch(middleC),
      "integration C4 projection",
    );
    expect(Number(bSharpProjection.midi)).toBe(60);
    expect(Number(middleCProjection.midi)).toBe(60);
    expect(domainOperations.compareSpelledPitches(bSharp, middleC)).not.toBe(0);

    const tonic = successfulValue(
      domainOperations.makeSpelledPitchClass({ step: "C", alter: 0 }),
      "integration tonic",
    );
    const mode = successfulValue(
      domainOperations.makeKeyMode("major"),
      "integration mode",
    );
    const key: KeyContext = { tonic, mode };
    const meter = successfulValue(
      domainOperations.makeMeter({ beatsPerBar: 4, beatUnit: 4 }),
      "integration meter",
    );
    const capacity = domainOperations.measureCapacity(meter);
    expect(capacity.numerator).toBe(4);
    expect(capacity.denominator).toBe(1);
    expect(Number(domainOperations.beatValueToMidiTicks(capacity))).toBe(3_840);
    const start = successfulValue(
      domainOperations.makeBeatPosition({ numerator: 0, denominator: 1 }),
      "integration range start",
    );
    const end = successfulValue(
      domainOperations.makeBeatPosition(capacity),
      "integration range end",
    );
    expect(domainOperations.makeBeatRange(start, end)).toMatchObject({
      ok: true,
      value: { start, end },
    });
    expect(domainOperations.makeTempoBpm(120)).toEqual({ ok: true, value: 120 });

    const ninth = successfulValue(
      domainOperations.makeChordDegree({ number: 9, alter: 0 }),
      "integration ninth",
    );
    const chord = successfulValue(
      domainOperations.makeChordSpec({
        kind: "parsed",
        sourceText: "Cmaj9",
        root: tonic,
        triad: "major",
        sixth: null,
        seventh: "major",
        extensions: [ninth],
        additions: [],
        alterations: [],
        omissions: [],
        bass: null,
        colorPolicy: "none",
      }),
      "integration chord",
    );

    const invalidAuto = domainOperations.makeAutoVoicing(
      {
        mode: "auto",
        family: "balanced",
        voiceCount: 4,
        range: { lowMidi: 84, highMidi: 48 },
        bassPolicy: "generated",
      },
      null,
    );
    expect(invalidAuto).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.range_reversed",
        path: ["range", "highMidi"],
      },
    });
    const voicing = successfulValue(
      domainOperations.makeAutoVoicing(
        {
          mode: "auto",
          family: "balanced",
          voiceCount: 4,
          range: { lowMidi: 48, highMidi: 84 },
          bassPolicy: "generated",
        },
        null,
      ),
      "integration voicing",
    );
    const nestedInvalidEvent = domainOperations.makeChordEvent({
      id: eventId,
      duration: capacity,
      annotation: "nested refusal",
      chord,
      voicing: {
        mode: "auto",
        family: "balanced",
        voiceCount: 4,
        range: { lowMidi: 84, highMidi: 48 },
        bassPolicy: "generated",
      },
    });
    expect(nestedInvalidEvent).toMatchObject({
      ok: false,
      refusal: {
        code: "voicing.range_reversed",
        path: ["voicing", "range", "highMidi"],
      },
    });
    const event = successfulValue(
      domainOperations.makeChordEvent({
        id: eventId,
        duration: capacity,
        annotation: "one exact bar",
        chord,
        voicing,
      }),
      "integration event",
    );

    const measure: Measure = {
      id: measureId,
      events: [event],
      completion: { kind: "complete" },
    };
    const section: Section = {
      id: sectionId,
      name: "A",
      annotation: "integration section",
      keyOverride: key,
      voiceLeadingBoundary: "continue",
      measures: [measure],
    };
    const instrumentId = successfulValue(
      domainOperations.makeInstrumentId("mellow-keys"),
      "integration instrument",
    );
    expect(
      domainOperations.makePlaybackSettings({
        instrumentId,
        masterVolume: 1.01,
        reverbAmount: 0.2,
        countInBars: 1,
      }),
    ).toMatchObject({
      ok: false,
      refusal: {
        code: "playback.level_out_of_range",
        path: ["masterVolume"],
      },
    });
    const playback = successfulValue(
      domainOperations.makePlaybackSettings({
        instrumentId,
        masterVolume: 0.8,
        reverbAmount: 0.2,
        countInBars: 1,
      }),
      "integration playback",
    );
    const document: ProgressionDocumentV2 = {
      schema: "changes.progression.v2",
      id: documentId,
      title: "Integration chart",
      description: "One public F1 story",
      meter,
      tempoBpm: 120,
      key,
      sections: [section],
      playback,
    };

    const sourceBefore = JSON.stringify(document);
    const deterministic = factoryFrom([
      "integration-copy-document",
      "integration-copy-section",
      "integration-copy-measure",
      "integration-copy-event",
    ]);
    const request = {
      rootKind: "document" as const,
      purpose: "duplicate" as const,
      source: document,
      destination: null,
      idFactory: deterministic.factory,
    };
    expect(Object.keys(request).sort()).toEqual([
      "destination",
      "idFactory",
      "purpose",
      "rootKind",
      "source",
    ]);
    expect("revision" in request).toBe(false);
    expect("signal" in request).toBe(false);
    expect("cancel" in request).toBe(false);

    const copied = domainOperations.copyDomain(request);
    expect(copied).not.toBeInstanceOf(Promise);
    expect(copied.ok).toBe(true);
    if (!copied.ok) throw new Error(copied.refusal.code);
    expect(deterministic.calls).toEqual([
      "document",
      "section",
      "measure",
      "event",
    ]);
    expect(copied.remap.entries.map(({ kind, from, to, sourcePath }) => ({
      kind,
      from: String(from),
      to: String(to),
      sourcePath,
    }))).toEqual([
      {
        kind: "document",
        from: "integration-document",
        to: "integration-copy-document",
        sourcePath: ["id"],
      },
      {
        kind: "section",
        from: "integration-section",
        to: "integration-copy-section",
        sourcePath: ["sections", 0, "id"],
      },
      {
        kind: "measure",
        from: "integration-measure",
        to: "integration-copy-measure",
        sourcePath: ["sections", 0, "measures", 0, "id"],
      },
      {
        kind: "event",
        from: "integration-event",
        to: "integration-copy-event",
        sourcePath: ["sections", 0, "measures", 0, "events", 0, "id"],
      },
    ]);
    expect(JSON.stringify(document)).toBe(sourceBefore);
    expect(copied.value).toEqual({
      ...document,
      id: stableId("document", "integration-copy-document"),
      sections: [{
        ...section,
        id: stableId("section", "integration-copy-section"),
        measures: [{
          ...measure,
          id: stableId("measure", "integration-copy-measure"),
          events: [{
            ...event,
            id: stableId("event", "integration-copy-event"),
          }],
        }],
      }],
    });
    expect(noSharedObjects(document, copied.value)).toBe(true);
    expect(recursivelyFrozen(copied)).toBe(true);
  });
});
