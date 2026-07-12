import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  MAX_DOMAIN_COPY_GRAPH_NODES,
  domainOperations,
  type ChordEvent,
  type DomainCopyResult,
  type DomainCopyRootKind,
  type DomainCopySuccess,
  type DomainPath,
  type IdFactoryResult,
  type Measure,
  type ProgressionDocumentV2,
  type Section,
  type StableIdFactory,
  type StableIdFor,
  type StableIdKind,
  type ValidatedDocument,
} from "../../src/domain";

const REVIEWED_ID_SEED = 1_414_213_562;
const GENERATED_GRAPH_COUNT = 24;
const HEAVY_BOUNDARY_PROOF =
  "tests/unit/f1-identity-copy.test.ts#drives F1-ID-018 exact boundary with one allocation per node";

type XorShift32 = Readonly<{
  next: () => number;
  integer: (exclusiveMaximum: number) => number;
}>;

type RootCase =
  | Readonly<{
      rootKind: "document";
      purpose: "duplicate" | "lesson-instantiation";
      source: ProgressionDocumentV2;
    }>
  | Readonly<{
      rootKind: "section";
      purpose: "duplicate";
      source: Section;
    }>
  | Readonly<{
      rootKind: "measure";
      purpose: "duplicate";
      source: Measure;
    }>
  | Readonly<{
      rootKind: "event";
      purpose: "duplicate";
      source: ChordEvent;
    }>;

type OracleNode = Readonly<{
  kind: DomainCopyRootKind;
  wire: string;
  path: DomainPath;
}>;

type RemapObservation = Readonly<{
  kind: StableIdKind;
  from: string;
  to: string;
  sourcePath: DomainPath;
}>;

type CopyObservation = Readonly<{
  rootKind: DomainCopyRootKind;
  sourcePreorder: readonly OracleNode[];
  outputPreorder: readonly OracleNode[];
  remap: readonly RemapObservation[];
  payloadEqualIgnoringIds: boolean;
  sourceUnchanged: boolean;
  recursivelyFrozen: boolean;
  noSharedObjects: boolean;
}>;

type RunCounters = Readonly<{
  generatedGraphs: number;
  roots: number;
  successfulCopies: number;
  successfulNodes: number;
  sourceCollisionCases: number;
  destinationCollisionCases: number;
  allocatedCollisionCases: number;
}>;

type RunReport = Readonly<{
  id: "f1-copy-laws";
  seed: typeof REVIEWED_ID_SEED;
  counters: RunCounters;
  digest: string;
  mutantsKilled: number;
}>;

function xorshift32(seed: number): XorShift32 {
  let state = seed >>> 0;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  return {
    next,
    integer: (exclusiveMaximum: number): number => {
      if (!Number.isSafeInteger(exclusiveMaximum) || exclusiveMaximum <= 0) {
        throw new Error(
          `F1_COPY_PROPERTY_INVALID_RANDOM_BOUND: ${String(exclusiveMaximum)}`,
        );
      }
      return next() % exclusiveMaximum;
    },
  };
}

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
    `stable ID ${kind}/${wire}`,
  );
}

function deterministicFactory(wires: readonly string[]): Readonly<{
  factory: StableIdFactory;
  calls: StableIdKind[];
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

function makeEvent(
  caseIndex: number,
  sectionIndex: number,
  measureIndex: number,
  eventIndex: number,
  variant: number,
): ChordEvent {
  const eventId = stableId(
    "event",
    `source-${String(caseIndex)}-s${String(sectionIndex)}-m${String(measureIndex)}-e${String(eventIndex)}`,
  );
  const duration = successfulValue(
    domainOperations.makeBeatDuration({
      numerator: 1 + ((caseIndex + eventIndex) % 3),
      denominator: 2,
    }),
    "property event duration",
  );
  const c = successfulValue(
    domainOperations.makeSpelledPitchClass({ step: "C", alter: 0 }),
    "property C",
  );
  const e = successfulValue(
    domainOperations.makeSpelledPitchClass({ step: "E", alter: 0 }),
    "property E",
  );
  const g = successfulValue(
    domainOperations.makeSpelledPitchClass({ step: "G", alter: 0 }),
    "property G",
  );

  if (variant === 0) {
    const c4 = successfulValue(
      domainOperations.makeSpelledPitch({ step: "C", alter: 0, octave: 4 }),
      "property C4",
    );
    const e4 = successfulValue(
      domainOperations.makeSpelledPitch({ step: "E", alter: 0, octave: 4 }),
      "property E4",
    );
    return successfulValue(
      domainOperations.makeChordEvent({
        id: eventId,
        duration,
        annotation: `custom-${String(caseIndex)}-${String(eventIndex)}`,
        chord: {
          kind: "custom",
          sourceText: "C E G",
          label: "literal C triad",
          pitchNames: [c, e, g],
          bass: null,
        },
        voicing: {
          mode: "manual",
          pitches: [c4, e4, c4],
          bassPolicy: "included",
        },
      }),
      "property custom/manual event",
    );
  }

  const ninth = successfulValue(
    domainOperations.makeChordDegree({ number: 9, alter: 0 }),
    "property ninth",
  );
  const parsedChord = {
    kind: "parsed" as const,
    sourceText: "Cmaj9",
    root: c,
    triad: "major" as const,
    sixth: null,
    seventh: "major" as const,
    extensions: [ninth],
    additions: [],
    alterations: [],
    omissions: [],
    bass: null,
    colorPolicy: "none" as const,
  };
  if (variant === 1) {
    return successfulValue(
      domainOperations.makeChordEvent({
        id: eventId,
        duration,
        annotation: `auto-${String(caseIndex)}-${String(eventIndex)}`,
        chord: parsedChord,
        voicing: {
          mode: "auto",
          family: "balanced",
          voiceCount: 4,
          range: { lowMidi: 45, highMidi: 88 },
          bassPolicy: "generated",
        },
      }),
      "property parsed/auto event",
    );
  }

  const c3 = successfulValue(
    domainOperations.makeSpelledPitch({ step: "C", alter: 0, octave: 3 }),
    "property C3",
  );
  const g3 = successfulValue(
    domainOperations.makeSpelledPitch({ step: "G", alter: 0, octave: 3 }),
    "property G3",
  );
  const b3 = successfulValue(
    domainOperations.makeSpelledPitch({ step: "B", alter: 0, octave: 3 }),
    "property B3",
  );
  return successfulValue(
    domainOperations.makeChordEvent({
      id: eventId,
      duration,
      annotation: `frozen-${String(caseIndex)}-${String(eventIndex)}`,
      chord: parsedChord,
      voicing: {
        mode: "frozen",
        pitches: [c3, g3, b3],
        bassPolicy: "included",
        generatedBy: { engineVersion: "copy-property-v1", family: "drop2" },
      },
    }),
    "property parsed/frozen event",
  );
}

function makeDocument(
  random: XorShift32,
  caseIndex: number,
): ProgressionDocumentV2 {
  const meterChoices = [
    { beatsPerBar: 4, beatUnit: 4 },
    { beatsPerBar: 3, beatUnit: 4 },
    { beatsPerBar: 6, beatUnit: 8 },
  ] as const;
  const meterInput = meterChoices[random.integer(meterChoices.length)];
  if (meterInput === undefined) throw new Error("property meter choice missing");
  const meter = successfulValue(
    domainOperations.makeMeter(meterInput),
    "property meter",
  );
  const mode = successfulValue(
    domainOperations.makeKeyMode(
      caseIndex % 2 === 0 ? "major" : "natural-minor",
    ),
    "property key mode",
  );
  const tonic = successfulValue(
    domainOperations.makeSpelledPitchClass({
      step: caseIndex % 2 === 0 ? "C" : "D",
      alter: caseIndex % 2 === 0 ? 0 : -1,
    }),
    "property key tonic",
  );
  const instrumentId = successfulValue(
    domainOperations.makeInstrumentId("mellow-keys"),
    "property instrument",
  );
  const playback = successfulValue(
    domainOperations.makePlaybackSettings({
      instrumentId,
      masterVolume: 0.75,
      reverbAmount: 0.25,
      countInBars: caseIndex % 3,
    }),
    "property playback",
  );

  const sectionCount = 1 + random.integer(3);
  const sections: Section[] = [];
  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const measureCount = 1 + random.integer(3);
    const measures: Measure[] = [];
    for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
      const eventCount = 1 + random.integer(3);
      const events: [ChordEvent, ...ChordEvent[]] = [
        makeEvent(
          caseIndex,
          sectionIndex,
          measureIndex,
          0,
          random.integer(3),
        ),
      ];
      for (let eventIndex = 1; eventIndex < eventCount; eventIndex += 1) {
        events.push(
          makeEvent(
            caseIndex,
            sectionIndex,
            measureIndex,
            eventIndex,
            random.integer(3),
          ),
        );
      }
      measures.push({
        id: stableId(
          "measure",
          `source-${String(caseIndex)}-s${String(sectionIndex)}-m${String(measureIndex)}`,
        ),
        events,
        completion: { kind: "complete" },
      });
    }
    sections.push({
      id: stableId(
        "section",
        `source-${String(caseIndex)}-s${String(sectionIndex)}`,
      ),
      name: `Section ${String(sectionIndex + 1)}`,
      annotation: `seeded section ${String(caseIndex)}:${String(sectionIndex)}`,
      keyOverride:
        (caseIndex + sectionIndex) % 2 === 0 ? { tonic, mode } : null,
      voiceLeadingBoundary: sectionIndex % 2 === 0 ? "continue" : "reset",
      measures,
    });
  }

  return {
    schema: "changes.progression.v2",
    id: stableId("document", `source-${String(caseIndex)}-document`),
    title: `Seeded document ${String(caseIndex)}`,
    description: `xorshift32 seed ${String(REVIEWED_ID_SEED)}`,
    meter,
    tempoBpm: 90 + (caseIndex % 80),
    key: caseIndex % 3 === 0 ? null : { tonic, mode },
    sections,
    playback,
  };
}

function rootsFor(
  document: ProgressionDocumentV2,
  random: XorShift32,
  caseIndex: number,
): readonly RootCase[] {
  const section = document.sections[random.integer(document.sections.length)];
  if (section === undefined) throw new Error("property section missing");
  const measure = section.measures[random.integer(section.measures.length)];
  if (measure === undefined) throw new Error("property measure missing");
  const event = measure.events[random.integer(measure.events.length)];
  if (event === undefined) throw new Error("property event missing");
  return [
    {
      rootKind: "document",
      purpose: caseIndex % 2 === 0 ? "duplicate" : "lesson-instantiation",
      source: document,
    },
    { rootKind: "section", purpose: "duplicate", source: section },
    { rootKind: "measure", purpose: "duplicate", source: measure },
    { rootKind: "event", purpose: "duplicate", source: event },
  ];
}

function appendEvent(
  nodes: OracleNode[],
  event: ChordEvent,
  prefix: DomainPath,
): void {
  nodes.push({ kind: "event", wire: String(event.id), path: [...prefix, "id"] });
}

function appendMeasure(
  nodes: OracleNode[],
  measure: Measure,
  prefix: DomainPath,
): void {
  nodes.push({ kind: "measure", wire: String(measure.id), path: [...prefix, "id"] });
  for (const [eventIndex, event] of measure.events.entries()) {
    appendEvent(nodes, event, [...prefix, "events", eventIndex]);
  }
}

function appendSection(
  nodes: OracleNode[],
  section: Section,
  prefix: DomainPath,
): void {
  nodes.push({ kind: "section", wire: String(section.id), path: [...prefix, "id"] });
  for (const [measureIndex, measure] of section.measures.entries()) {
    appendMeasure(nodes, measure, [...prefix, "measures", measureIndex]);
  }
}

function oraclePreorder(root: RootCase): readonly OracleNode[] {
  const nodes: OracleNode[] = [];
  switch (root.rootKind) {
    case "document":
      nodes.push({ kind: "document", wire: String(root.source.id), path: ["id"] });
      for (const [sectionIndex, section] of root.source.sections.entries()) {
        appendSection(nodes, section, ["sections", sectionIndex]);
      }
      return nodes;
    case "section":
      appendSection(nodes, root.source, []);
      return nodes;
    case "measure":
      appendMeasure(nodes, root.source, []);
      return nodes;
    case "event":
      appendEvent(nodes, root.source, []);
      return nodes;
  }
}

function successPreorder(result: DomainCopySuccess): readonly OracleNode[] {
  switch (result.rootKind) {
    case "document":
      return oraclePreorder({
        rootKind: "document",
        purpose: "duplicate",
        source: result.value,
      });
    case "section":
      return oraclePreorder({
        rootKind: "section",
        purpose: "duplicate",
        source: result.value,
      });
    case "measure":
      return oraclePreorder({
        rootKind: "measure",
        purpose: "duplicate",
        source: result.value,
      });
    case "event":
      return oraclePreorder({
        rootKind: "event",
        purpose: "duplicate",
        source: result.value,
      });
  }
}

function sourceValue(root: RootCase): ProgressionDocumentV2 | Section | Measure | ChordEvent {
  return root.source;
}

function copiedValue(result: DomainCopySuccess): ProgressionDocumentV2 | Section | Measure | ChordEvent {
  return result.value;
}

function executeCopy(
  root: RootCase,
  destination: ValidatedDocument | null,
  idFactory: StableIdFactory,
): DomainCopyResult {
  switch (root.rootKind) {
    case "document":
      return domainOperations.copyDomain({ ...root, destination, idFactory });
    case "section":
      return domainOperations.copyDomain({ ...root, destination, idFactory });
    case "measure":
      return domainOperations.copyDomain({ ...root, destination, idFactory });
    case "event":
      return domainOperations.copyDomain({ ...root, destination, idFactory });
  }
}

function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      key === "id" ? [] : [[key, withoutIds(child)] as const],
    ),
  );
}

function recursivelyFrozen(
  value: unknown,
  visited: Set<object> = new Set<object>(),
): boolean {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return true;
  }
  visited.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => recursivelyFrozen(child, visited));
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
  for (const key of Object.keys(source)) {
    if (
      Object.hasOwn(copied, key) &&
      !noSharedObjects(Reflect.get(source, key), Reflect.get(copied, key), visited)
    ) {
      return false;
    }
  }
  return true;
}

function observeSuccess(
  root: RootCase,
  result: DomainCopySuccess,
  sourceBefore: string,
): CopyObservation {
  const source = sourceValue(root);
  const copied = copiedValue(result);
  return {
    rootKind: root.rootKind,
    sourcePreorder: oraclePreorder(root),
    outputPreorder: successPreorder(result),
    remap: result.remap.entries.map((entry) => ({
      kind: entry.kind,
      from: String(entry.from),
      to: String(entry.to),
      sourcePath: [...entry.sourcePath],
    })),
    payloadEqualIgnoringIds:
      JSON.stringify(withoutIds(copied)) === JSON.stringify(withoutIds(source)),
    sourceUnchanged: JSON.stringify(source) === sourceBefore,
    recursivelyFrozen: recursivelyFrozen(result),
    noSharedObjects: noSharedObjects(source, copied),
  };
}

function expectedObservation(
  root: RootCase,
  sourcePlan: readonly OracleNode[],
  candidateWires: readonly string[],
): CopyObservation {
  return {
    rootKind: root.rootKind,
    sourcePreorder: sourcePlan,
    outputPreorder: sourcePlan.map((node, index) => ({
      ...node,
      wire: candidateWires[index] ?? "missing-candidate",
    })),
    remap: sourcePlan.map((node, index) => ({
      kind: node.kind,
      from: node.wire,
      to: candidateWires[index] ?? "missing-candidate",
      sourcePath: node.path,
    })),
    payloadEqualIgnoringIds: true,
    sourceUnchanged: true,
    recursivelyFrozen: true,
    noSharedObjects: true,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireSameJson(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (!sameJson(actual, expected)) {
    throw new Error(
      `${label}\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`,
    );
  }
}

function copyObservationMutants(
  observation: CopyObservation,
): readonly CopyObservation[] {
  const firstOutput = observation.outputPreorder[0];
  const firstRemap = observation.remap[0];
  if (firstOutput === undefined || firstRemap === undefined) {
    throw new Error("F1_COPY_PROPERTY_EMPTY_SUCCESS_OBSERVATION");
  }
  return [
    { ...observation, sourceUnchanged: false },
    { ...observation, recursivelyFrozen: false },
    { ...observation, noSharedObjects: false },
    { ...observation, payloadEqualIgnoringIds: false },
    {
      ...observation,
      outputPreorder: [
        { ...firstOutput, wire: firstRemap.from },
        ...observation.outputPreorder.slice(1),
      ],
    },
    { ...observation, remap: observation.remap.slice(0, -1) },
    {
      ...observation,
      remap: [
        { ...firstRemap, sourcePath: ["mutated-path"] },
        ...observation.remap.slice(1),
      ],
    },
  ];
}

function freshWires(
  caseIndex: number,
  rootKind: DomainCopyRootKind,
  count: number,
  suffix = "success",
): readonly string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      `copy-${suffix}-${String(caseIndex)}-${rootKind}-${String(index)}`,
  );
}

function assertAtomicFailure(
  result: DomainCopyResult,
  source: ProgressionDocumentV2 | Section | Measure | ChordEvent,
  sourceBefore: string,
  label: string,
): void {
  if (result.ok) throw new Error(`${label}: expected refusal`);
  requireSameJson(JSON.stringify(source), sourceBefore, `${label}: source mutation`);
  if ("value" in result || "remap" in result) {
    throw new Error(`${label}: partial value/remap escaped`);
  }
  if (!Object.isFrozen(result)) {
    throw new Error(`${label}: result envelope is not frozen`);
  }
}

function collisionObservation(result: DomainCopyResult): unknown {
  if (result.ok) return { ok: true };
  return { ok: false, refusal: result.refusal };
}

function executePropertyRun(seed: typeof REVIEWED_ID_SEED): RunReport {
  const random = xorshift32(seed);
  const digestRecords: unknown[] = [];
  let roots = 0;
  let successfulCopies = 0;
  let successfulNodes = 0;
  let sourceCollisionCases = 0;
  let destinationCollisionCases = 0;
  let allocatedCollisionCases = 0;
  let mutantsKilled = 0;

  for (let caseIndex = 0; caseIndex < GENERATED_GRAPH_COUNT; caseIndex += 1) {
    const document = makeDocument(random, caseIndex);
    const destinationPlan = oraclePreorder({
      rootKind: "document",
      purpose: "duplicate",
      source: document,
    });
    for (const root of rootsFor(document, random, caseIndex)) {
      roots += 1;
      const label =
        `F1_COPY_PROPERTY seed=${String(seed)} case=${String(caseIndex)} root=${root.rootKind}`;
      const source = sourceValue(root);
      const sourceBefore = JSON.stringify(source);
      const sourcePlan = oraclePreorder(root);
      const successWires = freshWires(caseIndex, root.rootKind, sourcePlan.length);
      const successFactory = deterministicFactory(successWires);
      const result = executeCopy(root, null, successFactory.factory);
      if (!result.ok) {
        throw new Error(`${label}: unexpected ${result.refusal.code}`);
      }
      const observation = observeSuccess(root, result, sourceBefore);
      const expected = expectedObservation(root, sourcePlan, successWires);
      requireSameJson(observation, expected, `${label}: success oracle`);
      requireSameJson(
        successFactory.calls,
        sourcePlan.map(({ kind }) => kind),
        `${label}: factory preorder`,
      );
      for (const mutant of copyObservationMutants(observation)) {
        if (sameJson(mutant, expected)) {
          throw new Error(`${label}: injected observation mutant survived`);
        }
        mutantsKilled += 1;
      }
      successfulCopies += 1;
      successfulNodes += sourcePlan.length;
      digestRecords.push({ caseIndex, rootKind: root.rootKind, observation });

      const requestedIndex = random.integer(sourcePlan.length);
      const occupiedIndex = random.integer(sourcePlan.length);
      const requestedNode = sourcePlan[requestedIndex];
      const occupiedNode = sourcePlan[occupiedIndex];
      if (requestedNode === undefined || occupiedNode === undefined) {
        throw new Error(`${label}: source collision schedule missing`);
      }
      const sourceCollisionWires = [
        ...freshWires(
          caseIndex,
          root.rootKind,
          requestedIndex,
          "source-collision",
        ),
        occupiedNode.wire,
      ];
      const sourceCollisionFactory = deterministicFactory(sourceCollisionWires);
      const sourceCollision = executeCopy(
        root,
        null,
        sourceCollisionFactory.factory,
      );
      assertAtomicFailure(sourceCollision, source, sourceBefore, label);
      const expectedSourceCollision = {
        ok: false,
        refusal: {
          code: "id.collision_existing",
          path: requestedNode.path,
          requested: {
            kind: requestedNode.kind,
            path: requestedNode.path,
            pathRoot: "copy-root",
          },
          occupied: {
            kind: occupiedNode.kind,
            path: occupiedNode.path,
            pathRoot: "copy-root",
          },
          collidingId: occupiedNode.wire,
        },
      };
      requireSameJson(
        collisionObservation(sourceCollision),
        expectedSourceCollision,
        `${label}: source collision oracle`,
      );
      if (sourceCollisionFactory.calls.length !== requestedIndex + 1) {
        throw new Error(`${label}: source collision call count`);
      }
      sourceCollisionCases += 1;
      digestRecords.push({
        caseIndex,
        rootKind: root.rootKind,
        collision: "source",
        observation: collisionObservation(sourceCollision),
      });

      const destinationIndex = random.integer(destinationPlan.length);
      const destinationNode = destinationPlan[destinationIndex];
      const requestedRoot = sourcePlan[0];
      if (destinationNode === undefined || requestedRoot === undefined) {
        throw new Error(`${label}: destination collision schedule missing`);
      }
      const destinationFactory = deterministicFactory([destinationNode.wire]);
      const destinationCollision = executeCopy(
        root,
        document as ValidatedDocument,
        destinationFactory.factory,
      );
      assertAtomicFailure(destinationCollision, source, sourceBefore, label);
      requireSameJson(
        collisionObservation(destinationCollision),
        {
          ok: false,
          refusal: {
            code: "id.collision_existing",
            path: requestedRoot.path,
            requested: {
              kind: requestedRoot.kind,
              path: requestedRoot.path,
              pathRoot: "copy-root",
            },
            occupied: {
              kind: destinationNode.kind,
              path: destinationNode.path,
              pathRoot: "occupied-document",
            },
            collidingId: destinationNode.wire,
          },
        },
        `${label}: destination collision oracle`,
      );
      if (destinationFactory.calls.length !== 1) {
        throw new Error(`${label}: destination collision call count`);
      }
      destinationCollisionCases += 1;
      digestRecords.push({
        caseIndex,
        rootKind: root.rootKind,
        collision: "destination",
        observation: collisionObservation(destinationCollision),
      });

      if (sourcePlan.length >= 2) {
        const allocatedRequestIndex = 1 + random.integer(sourcePlan.length - 1);
        const repeatedIndex = random.integer(allocatedRequestIndex);
        const allocatedWires = freshWires(
          caseIndex,
          root.rootKind,
          allocatedRequestIndex,
          "allocated-collision",
        );
        const repeatedWire = allocatedWires[repeatedIndex];
        const allocatedRequestedNode = sourcePlan[allocatedRequestIndex];
        const firstAllocatedNode = sourcePlan[repeatedIndex];
        if (
          repeatedWire === undefined ||
          allocatedRequestedNode === undefined ||
          firstAllocatedNode === undefined
        ) {
          throw new Error(`${label}: allocated collision schedule missing`);
        }
        const allocatedFactory = deterministicFactory([
          ...allocatedWires,
          repeatedWire,
        ]);
        const allocatedCollision = executeCopy(
          root,
          null,
          allocatedFactory.factory,
        );
        assertAtomicFailure(allocatedCollision, source, sourceBefore, label);
        requireSameJson(
          collisionObservation(allocatedCollision),
          {
            ok: false,
            refusal: {
              code: "id.collision_allocated",
              path: allocatedRequestedNode.path,
              requested: {
                kind: allocatedRequestedNode.kind,
                path: allocatedRequestedNode.path,
                pathRoot: "copy-root",
              },
              firstAllocated: {
                kind: firstAllocatedNode.kind,
                path: firstAllocatedNode.path,
                pathRoot: "copy-root",
              },
              collidingId: repeatedWire,
            },
          },
          `${label}: allocated collision oracle`,
        );
        if (allocatedFactory.calls.length !== allocatedRequestIndex + 1) {
          throw new Error(`${label}: allocated collision call count`);
        }
        allocatedCollisionCases += 1;
        digestRecords.push({
          caseIndex,
          rootKind: root.rootKind,
          collision: "allocated",
          observation: collisionObservation(allocatedCollision),
        });
      }
    }
  }

  const counters: RunCounters = {
    generatedGraphs: GENERATED_GRAPH_COUNT,
    roots,
    successfulCopies,
    successfulNodes,
    sourceCollisionCases,
    destinationCollisionCases,
    allocatedCollisionCases,
  };
  return {
    id: "f1-copy-laws",
    seed,
    counters,
    digest: createHash("sha256")
      .update(JSON.stringify({ seed, counters, digestRecords, mutantsKilled }))
      .digest("hex"),
    mutantsKilled,
  };
}

describe("F1 seeded copy laws", () => {
  test("replays seed 1414213562 across every copy root with identical observations", () => {
    const first = executePropertyRun(REVIEWED_ID_SEED);
    const replay = executePropertyRun(REVIEWED_ID_SEED);
    expect(replay).toEqual(first);
    expect(first.counters).toMatchObject({
      generatedGraphs: GENERATED_GRAPH_COUNT,
      roots: GENERATED_GRAPH_COUNT * 4,
      successfulCopies: GENERATED_GRAPH_COUNT * 4,
      sourceCollisionCases: GENERATED_GRAPH_COUNT * 4,
      destinationCollisionCases: GENERATED_GRAPH_COUNT * 4,
      allocatedCollisionCases: GENERATED_GRAPH_COUNT * 3,
    });
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    console.log(`F1_EVIDENCE_OBSERVATION ${JSON.stringify(first)}`);
  });

  test("kills injected copy-observation mutants with the independent oracle", () => {
    const report = executePropertyRun(REVIEWED_ID_SEED);
    expect(report.mutantsKilled).toBe(
      report.counters.successfulCopies * 7,
    );
    expect(report.mutantsKilled).toBeGreaterThan(0);
  });

  test("keeps the reviewed 73,793-node boundary in its dedicated heavy proof", async () => {
    expect(MAX_DOMAIN_COPY_GRAPH_NODES).toBe(73_793);
    expect(HEAVY_BOUNDARY_PROOF).toBe(
      "tests/unit/f1-identity-copy.test.ts#drives F1-ID-018 exact boundary with one allocation per node",
    );
    const source = await Bun.file(
      new URL("../unit/f1-identity-copy.test.ts", import.meta.url),
    ).text();
    expect(source).toContain(
      'test("drives F1-ID-018 exact boundary with one allocation per node"',
    );
    expect(source).toContain(
      'test("drives F1-ID-019 count refusal before the first allocation"',
    );
  });
});
