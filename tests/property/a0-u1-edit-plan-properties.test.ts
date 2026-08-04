import {
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";

import {
  createInitialAppState,
  redoAtomicEditPlanHistory,
  runAtomicEditPlan,
  undoAtomicEditPlanHistory,
  validateDocumentSemantics,
  type ApplyEditPlanCommand,
  type AtomicEditPlanAppState,
  type AtomicEditPlanDependencies,
  type AtomicEditPlanTransitionResult,
  type PanelState,
} from "../../src/application";
import {
  copyDomain,
  decodeDocumentShape,
  makeBeatDuration,
  makeBeatPosition,
  parseStableId,
  type BeatDuration,
  type ChordEventId,
  type MeasureId,
  type StableIdFactory,
  type StableIdKind,
  type ValidatedDocument,
} from "../../src/domain";
import { parseChartText } from "../../src/theory";

setDefaultTimeout(120_000);

const REVIEWED_SEEDS = Object.freeze([
  0x1357_9bdf,
  0x2468_ace0,
  0x5eed_c0de,
  0xc001_d00d,
]);
const CASES_PER_SEED = 12;
const REVIEWED_DENOMINATORS = Object.freeze([
  2,
  3,
  4,
  5,
  6,
  8,
  10,
  12,
  15,
  16,
  20,
  24,
  30,
  32,
]);
const INITIAL_PANELS = Object.freeze({
  open: Object.freeze(["chart", "inspector"] as const),
  active: "chart",
  leftRailCollapsed: false,
  rightRailCollapsed: false,
}) satisfies PanelState;

type Rational = Readonly<{
  numerator: number;
  denominator: number;
}>;

type SeededCase = Readonly<{
  seed: number;
  seedCase: number;
  ordinal: number;
  first: Rational;
  second: Rational;
  source: Rational;
}>;

type ModelEvent = Readonly<{
  id: string;
  duration: Rational;
  annotation: string;
  content: string;
}>;

type ModelDocument = Readonly<{
  events: readonly ModelEvent[];
  completion: Readonly<{
    kind: "incomplete";
    expectedDuration: Rational;
    reason: string;
  }>;
}>;

type DependencyCalls = {
  parser: number;
  structuralDecode: number;
  semanticValidation: number;
  historyEstimate: number;
  allocationKinds: StableIdKind[];
};

type VariantObservation = Readonly<{
  initial: ModelDocument;
  split: ModelDocument;
  joined: ModelDocument;
  calls: DependencyCalls;
}>;

type CommittedResult = Extract<
  AtomicEditPlanTransitionResult,
  Readonly<{ ok: true }>
>;

type XorShift32 = () => number;

function xorshift32(seed: number): XorShift32 {
  let state = seed >>> 0;
  return (): number => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state;
  };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const held = b;
    b = a % b;
    a = held;
  }
  return a;
}

function rational(numerator: number, denominator: number): Rational {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    throw new Error("A0_U1_PROPERTY_RATIONAL_INPUT");
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

function addRationals(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator +
      right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function asBeatDuration(value: Rational): BeatDuration {
  const made = makeBeatDuration(value);
  if (
    !made.ok ||
    made.value.numerator !== value.numerator ||
    made.value.denominator !== value.denominator
  ) {
    throw new Error(
      `A0_U1_PROPERTY_DURATION:${String(value.numerator)}/${String(value.denominator)}`,
    );
  }
  return made.value;
}

function schedules(): readonly SeededCase[] {
  const rows: SeededCase[] = [];
  for (const seed of REVIEWED_SEEDS) {
    const next = xorshift32(seed);
    for (let seedCase = 0; seedCase < CASES_PER_SEED; seedCase += 1) {
      const denominator =
        REVIEWED_DENOMINATORS[next() % REVIEWED_DENOMINATORS.length];
      if (denominator === undefined) {
        throw new Error("A0_U1_PROPERTY_DENOMINATOR");
      }
      const first = rational(1 + next() % denominator, denominator);
      const second = rational(1 + next() % denominator, denominator);
      rows.push(
        Object.freeze({
          seed,
          seedCase,
          ordinal: rows.length,
          first,
          second,
          source: addRationals(first, second),
        }),
      );
    }
  }
  return Object.freeze(rows);
}

function caseStem(row: SeededCase): string {
  return `${row.seed.toString(16)}-${String(row.seedCase)}`;
}

function idsFor(row: SeededCase): Readonly<{
  documentBase: string;
  documentTransposed: string;
  section: string;
  measure: string;
  sourceEvent: string;
  splitEvent: string;
}> {
  const stem = caseStem(row);
  return Object.freeze({
    documentBase: `document-property-${stem}-base`,
    documentTransposed: `document-property-${stem}-transposed`,
    section: `section-property-${stem}`,
    measure: `measure-property-${stem}`,
    sourceEvent: `event-property-${stem}-source`,
    splitEvent: `event-property-${stem}-split`,
  });
}

function chordFor(tonic: "C" | "D"): Readonly<Record<string, unknown>> {
  return {
    kind: "parsed",
    sourceText: `${tonic}maj7`,
    root: { step: tonic, alter: 0 },
    triad: "major",
    sixth: null,
    seventh: "major",
    extensions: [],
    additions: [],
    alterations: [],
    omissions: [],
    bass: null,
    colorPolicy: "none",
  };
}

function autoVoicing(): Readonly<Record<string, unknown>> {
  return {
    mode: "auto",
    family: "balanced",
    voiceCount: 4,
    range: {
      lowMidi: 48,
      highMidi: 84,
    },
    bassPolicy: "none",
  };
}

function completionFor(source: Rational): Readonly<Record<string, unknown>> {
  return {
    kind: "incomplete",
    expectedDuration: {
      numerator: source.numerator,
      denominator: source.denominator,
    },
    reason: "Seeded exact-rational measure",
  };
}

function documentCandidate(
  row: SeededCase,
  tonic: "C" | "D",
): unknown {
  const ids = idsFor(row);
  return {
    schema: "changes.progression.v2",
    id: tonic === "C" ? ids.documentBase : ids.documentTransposed,
    title: `Seeded property ${caseStem(row)} ${tonic}`,
    description: "Independent split/join reference-model input.",
    meter: {
      beatsPerBar: 4,
      beatUnit: 4,
    },
    tempoBpm: 120,
    key: {
      tonic: { step: tonic, alter: 0 },
      mode: "major",
    },
    sections: [
      {
        id: ids.section,
        name: "Property",
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "continue",
        measures: [
          {
            id: ids.measure,
            events: [
              {
                id: ids.sourceEvent,
                duration: {
                  numerator: row.source.numerator,
                  denominator: row.source.denominator,
                },
                annotation: "source annotation survives",
                chord: chordFor(tonic),
                voicing: autoVoicing(),
              },
            ],
            completion: completionFor(row.source),
          },
        ],
      },
    ],
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
    },
  };
}

function publishDocument(candidate: unknown, label: string): ValidatedDocument {
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) {
    throw new Error(
      `${label}:F2:${decoded.errors.map(({ code }) => code).join(",")}`,
    );
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(
      `${label}:F3:${published.errors.map(({ code }) => code).join(",")}`,
    );
  }
  return published.value;
}

function initialState(document: ValidatedDocument): AtomicEditPlanAppState {
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zero.ok) throw new Error("A0_U1_PROPERTY_ZERO");
  const initialized = createInitialAppState({
    document,
    zeroBeat: zero.value,
    initialPanels: INITIAL_PANELS,
  });
  if (!initialized.ok) {
    throw new Error(`A0_U1_PROPERTY_INITIAL:${initialized.refusal.code}`);
  }
  return initialized.state;
}

function soleMeasure(
  document: ValidatedDocument,
): ValidatedDocument["sections"][number]["measures"][number] {
  const section = document.sections[0];
  const measure = section?.measures[0];
  if (
    section === undefined ||
    document.sections.length !== 1 ||
    measure === undefined ||
    section.measures.length !== 1
  ) {
    throw new Error("A0_U1_PROPERTY_SOLE_MEASURE");
  }
  return measure;
}

function contentSignature(
  chord: unknown,
  voicing: unknown,
): string {
  return JSON.stringify({ chord, voicing });
}

function expectedInitialModel(
  row: SeededCase,
  tonic: "C" | "D",
): ModelDocument {
  const ids = idsFor(row);
  return Object.freeze({
    events: Object.freeze([
      Object.freeze({
        id: ids.sourceEvent,
        duration: row.source,
        annotation: "source annotation survives",
        content: contentSignature(chordFor(tonic), autoVoicing()),
      }),
    ]),
    completion: Object.freeze({
      kind: "incomplete",
      expectedDuration: row.source,
      reason: "Seeded exact-rational measure",
    }),
  });
}

function projectDocument(document: ValidatedDocument): ModelDocument {
  const measure = soleMeasure(document);
  if (measure.completion.kind !== "incomplete") {
    throw new Error("A0_U1_PROPERTY_COMPLETION_KIND");
  }
  return Object.freeze({
    events: Object.freeze(
      measure.events.map((event) =>
        Object.freeze({
          id: event.id,
          duration: Object.freeze({
            numerator: event.duration.numerator,
            denominator: event.duration.denominator,
          }),
          annotation: event.annotation,
          content: contentSignature(event.chord, event.voicing),
        }),
      ),
    ),
    completion: Object.freeze({
      kind: "incomplete",
      expectedDuration: Object.freeze({
        numerator: measure.completion.expectedDuration.numerator,
        denominator: measure.completion.expectedDuration.denominator,
      }),
      reason: measure.completion.reason,
    }),
  });
}

function referenceSplit(
  before: ModelDocument,
  sourceEventId: string,
  splitEventId: string,
  first: Rational,
  second: Rational,
): ModelDocument {
  const sourceIndex = before.events.findIndex(
    ({ id }) => id === sourceEventId,
  );
  const source = before.events[sourceIndex];
  if (
    source === undefined ||
    addRationals(first, second).numerator !== source.duration.numerator ||
    addRationals(first, second).denominator !== source.duration.denominator
  ) {
    throw new Error("A0_U1_PROPERTY_REFERENCE_SPLIT");
  }
  const events = [...before.events];
  events.splice(
    sourceIndex,
    1,
    Object.freeze({
      ...source,
      duration: first,
    }),
    Object.freeze({
      ...source,
      id: splitEventId,
      duration: second,
      annotation: "",
    }),
  );
  return Object.freeze({
    events: Object.freeze(events),
    completion: before.completion,
  });
}

function referenceJoin(
  before: ModelDocument,
  leftEventId: string,
  rightEventId: string,
): ModelDocument {
  const leftIndex = before.events.findIndex(({ id }) => id === leftEventId);
  const left = before.events[leftIndex];
  const right = before.events[leftIndex + 1];
  if (
    left === undefined ||
    right === undefined ||
    right.id !== rightEventId ||
    right.annotation !== "" ||
    left.content !== right.content
  ) {
    throw new Error("A0_U1_PROPERTY_REFERENCE_JOIN");
  }
  const events = [...before.events];
  events.splice(
    leftIndex,
    2,
    Object.freeze({
      ...left,
      duration: addRationals(left.duration, right.duration),
    }),
  );
  return Object.freeze({
    events: Object.freeze(events),
    completion: before.completion,
  });
}

function structuralProjection(model: ModelDocument): unknown {
  return {
    events: model.events.map(({ id, duration, annotation }) => ({
      id,
      duration,
      annotation,
    })),
    completion: model.completion,
  };
}

function stableEventId(wire: string): ChordEventId {
  const parsed = parseStableId("event", wire);
  if (!parsed.ok) throw new Error(`A0_U1_PROPERTY_EVENT_ID:${wire}`);
  return parsed.value;
}

function recordedDependencies(
  allocatedWire: string,
): Readonly<{
  dependencies: AtomicEditPlanDependencies;
  calls: DependencyCalls;
}> {
  const calls: DependencyCalls = {
    parser: 0,
    structuralDecode: 0,
    semanticValidation: 0,
    historyEstimate: 0,
    allocationKinds: [],
  };
  let allocationIndex = 0;
  const stableIdFactory: StableIdFactory = {
    next: <Kind extends StableIdKind>(kind: Kind) => {
      calls.allocationKinds.push(kind);
      const wire = allocationIndex === 0 ? allocatedWire : "";
      allocationIndex += 1;
      const parsed = parseStableId(kind, wire);
      if (kind !== "event" || !parsed.ok) {
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
  const dependencies: AtomicEditPlanDependencies = Object.freeze({
    copyDomain,
    stableIdFactory,
    parseChartText: (sourceText, request, accidentalStyle) => {
      calls.parser += 1;
      return parseChartText(sourceText, request, accidentalStyle);
    },
    decodeDocumentShape: (candidate) => {
      calls.structuralDecode += 1;
      return decodeDocumentShape(candidate);
    },
    validateDocumentSemantics: (candidate) => {
      calls.semanticValidation += 1;
      return validateDocumentSemantics(candidate);
    },
    estimateHistoryRetainedBytes: () => {
      calls.historyEstimate += 1;
      return 2_048;
    },
  });
  return Object.freeze({ dependencies, calls });
}

function splitCommand(
  state: AtomicEditPlanAppState,
  row: SeededCase,
  eventId: ChordEventId,
  measureId: MeasureId,
): ApplyEditPlanCommand {
  const completion = soleMeasure(state.document).completion;
  return {
    id: `command-property-${caseStem(row)}-split`,
    label: "Seeded exact-rational split",
    expectedDocumentId: state.document.id,
    expectedRevision: state.revision,
    logicalTimeMs: row.ordinal * 10 + 1,
    coalescing: null,
    kind: "apply-edit-plan",
    plan: {
      kind: "split-event-duration",
      eventId,
      firstDuration: asBeatDuration(row.first),
      secondDuration: asBeatDuration(row.second),
      completionDeclarations: [
        {
          measureId,
          completion,
        },
      ],
      identityPolicy: "retain-source-first-allocate-second",
      contentPolicy: "copy-exact-chord-and-voicing",
      annotationPolicy: "retain-source-first-clear-second",
    },
  };
}

function joinCommand(
  state: AtomicEditPlanAppState,
  row: SeededCase,
  leftEventId: ChordEventId,
  rightEventId: ChordEventId,
  measureId: MeasureId,
): ApplyEditPlanCommand {
  const completion = soleMeasure(state.document).completion;
  return {
    id: `command-property-${caseStem(row)}-join`,
    label: "Seeded exact-rational join",
    expectedDocumentId: state.document.id,
    expectedRevision: state.revision,
    logicalTimeMs: row.ordinal * 10 + 2,
    coalescing: null,
    kind: "apply-edit-plan",
    plan: {
      kind: "join-event-durations",
      leftEventId,
      rightEventId,
      joinedDuration: asBeatDuration(row.source),
      completionDeclarations: [
        {
          measureId,
          completion,
        },
      ],
      identityPolicy: "retain-left-remove-right",
      contentPolicy: "require-exact-chord-and-voicing",
      annotationPolicy: "require-right-empty-retain-left",
    },
  };
}

function requireCommitted(
  result: AtomicEditPlanTransitionResult,
  label: string,
): CommittedResult {
  if (!result.ok) {
    throw new Error(
      `${label}:${result.refusal.code}:${
        result.editPlanRefusal?.code ?? "preplan"
      }`,
    );
  }
  return result;
}

function snapshotCalls(calls: DependencyCalls): DependencyCalls {
  return {
    parser: calls.parser,
    structuralDecode: calls.structuralDecode,
    semanticValidation: calls.semanticValidation,
    historyEstimate: calls.historyEstimate,
    allocationKinds: [...calls.allocationKinds],
  };
}

function exerciseVariant(
  row: SeededCase,
  tonic: "C" | "D",
): VariantObservation {
  const label = `${caseStem(row)}:${tonic}`;
  const ids = idsFor(row);
  const splitEventId = stableEventId(ids.splitEvent);
  const document = publishDocument(
    documentCandidate(row, tonic),
    label,
  );
  const initial = initialState(document);
  const measure = soleMeasure(document);
  const sourceEvent = measure.events[0];
  if (sourceEvent === undefined || measure.events.length !== 1) {
    throw new Error(`${label}:SOURCE_EVENT`);
  }
  const expectedInitial = expectedInitialModel(row, tonic);
  expect(projectDocument(document), `${label}:initial-model`).toEqual(
    expectedInitial,
  );

  const recorded = recordedDependencies(ids.splitEvent);
  const split = requireCommitted(
    runAtomicEditPlan({
      state: initial,
      command: splitCommand(
        initial,
        row,
        sourceEvent.id,
        measure.id,
      ),
      dependencies: recorded.dependencies,
    }),
    `${label}:split`,
  );
  const expectedSplit = referenceSplit(
    expectedInitial,
    ids.sourceEvent,
    ids.splitEvent,
    row.first,
    row.second,
  );
  const actualSplit = projectDocument(split.state.document);
  expect(actualSplit, `${label}:split-model`).toEqual(expectedSplit);
  expect(split.state.revision, `${label}:split-revision`).toBe(1);
  expect(split.editPlanReceipt.planKind).toBe("split-event-duration");
  expect(split.editPlanReceipt.allocatedIdentities).toHaveLength(1);
  expect(split.editPlanReceipt.allocatedIdentities[0]?.id).toBe(
    splitEventId,
  );
  expect(split.editPlanReceipt.work).toMatchObject({
    syntaxParseCalls: 0,
    structuralDecodeCalls: 1,
    semanticValidationCalls: 1,
    idAllocationAttempts: 1,
  });
  expect(split.state.history.undo[0]?.before).toBe(initial.document);
  expect(split.state.history.undo[0]?.after).toBe(split.state.document);

  const joined = requireCommitted(
    runAtomicEditPlan({
      state: split.state,
      command: joinCommand(
        split.state,
        row,
        sourceEvent.id,
        splitEventId,
        measure.id,
      ),
      dependencies: recorded.dependencies,
    }),
    `${label}:join`,
  );
  const expectedJoined = referenceJoin(
    expectedSplit,
    ids.sourceEvent,
    ids.splitEvent,
  );
  const actualJoined = projectDocument(joined.state.document);
  expect(actualJoined, `${label}:join-model`).toEqual(expectedJoined);
  expect(actualJoined, `${label}:left-inverse-model`).toEqual(
    expectedInitial,
  );
  expect(joined.state.document, `${label}:left-inverse-document`).toEqual(
    initial.document,
  );
  expect(joined.state.revision, `${label}:join-revision`).toBe(2);
  expect(joined.editPlanReceipt.planKind).toBe("join-event-durations");
  expect(joined.editPlanReceipt.allocatedIdentities).toEqual([]);
  expect(joined.editPlanReceipt.removedIdentities).toEqual([
    { kind: "event", id: splitEventId },
  ]);
  expect(joined.editPlanReceipt.work).toMatchObject({
    syntaxParseCalls: 0,
    structuralDecodeCalls: 1,
    semanticValidationCalls: 1,
    idAllocationAttempts: 0,
  });
  expect(joined.state.history.undo).toHaveLength(2);
  expect(joined.state.history.undo[1]?.before).toBe(split.state.document);
  expect(joined.state.history.undo[1]?.after).toBe(joined.state.document);

  expect(recorded.calls).toEqual({
    parser: 0,
    structuralDecode: 2,
    semanticValidation: 2,
    historyEstimate: 2,
    allocationKinds: ["event"],
  });
  const callsBeforeReplay = snapshotCalls(recorded.calls);

  const undoJoin = undoAtomicEditPlanHistory({ state: joined.state });
  if (!undoJoin.ok) throw new Error(`${label}:UNDO_JOIN`);
  expect(undoJoin.state.document).toBe(split.state.document);
  expect(undoJoin.state.bookmarks).toBe(split.state.bookmarks);
  expect(undoJoin.state.revision).toBe(3);
  expect(undoJoin.state.history.undo).toHaveLength(1);
  expect(undoJoin.state.history.redo).toHaveLength(1);

  const undoSplit = undoAtomicEditPlanHistory({ state: undoJoin.state });
  if (!undoSplit.ok) throw new Error(`${label}:UNDO_SPLIT`);
  expect(undoSplit.state.document).toBe(initial.document);
  expect(undoSplit.state.bookmarks).toBe(initial.bookmarks);
  expect(undoSplit.state.revision).toBe(4);
  expect(undoSplit.state.history.undo).toHaveLength(0);
  expect(undoSplit.state.history.redo).toHaveLength(2);

  const redoSplit = redoAtomicEditPlanHistory({ state: undoSplit.state });
  if (!redoSplit.ok) throw new Error(`${label}:REDO_SPLIT`);
  expect(redoSplit.state.document).toBe(split.state.document);
  expect(redoSplit.state.bookmarks).toBe(split.state.bookmarks);
  expect(redoSplit.state.revision).toBe(5);
  expect(redoSplit.state.history.undo).toHaveLength(1);
  expect(redoSplit.state.history.redo).toHaveLength(1);

  const redoJoin = redoAtomicEditPlanHistory({ state: redoSplit.state });
  if (!redoJoin.ok) throw new Error(`${label}:REDO_JOIN`);
  expect(redoJoin.state.document).toBe(joined.state.document);
  expect(redoJoin.state.bookmarks).toBe(joined.state.bookmarks);
  expect(redoJoin.state.revision).toBe(6);
  expect(redoJoin.state.history.undo).toHaveLength(2);
  expect(redoJoin.state.history.redo).toHaveLength(0);
  expect(recorded.calls).toEqual(callsBeforeReplay);

  return Object.freeze({
    initial: expectedInitial,
    split: actualSplit,
    joined: actualJoined,
    calls: snapshotCalls(recorded.calls),
  });
}

describe("A0-U1 fixed-seed split/join properties", () => {
  test("matches an independent rational model, commutes with transposition, and replays exactly", () => {
    const rows = schedules();
    expect(rows).toHaveLength(REVIEWED_SEEDS.length * CASES_PER_SEED);
    expect(rows).toEqual(schedules());

    let variants = 0;
    let applyTransitions = 0;
    let replayTransitions = 0;
    let structuralDecodeCalls = 0;
    let semanticValidationCalls = 0;
    let parserCalls = 0;
    let allocations = 0;

    for (const row of rows) {
      const base = exerciseVariant(row, "C");
      const transposed = exerciseVariant(row, "D");
      expect(
        structuralProjection(base.initial),
        `${caseStem(row)}:initial-transposition`,
      ).toEqual(structuralProjection(transposed.initial));
      expect(
        structuralProjection(base.split),
        `${caseStem(row)}:split-transposition`,
      ).toEqual(structuralProjection(transposed.split));
      expect(
        structuralProjection(base.joined),
        `${caseStem(row)}:join-transposition`,
      ).toEqual(structuralProjection(transposed.joined));
      expect(base.split.events[0]?.content).not.toBe(
        transposed.split.events[0]?.content,
      );

      for (const observation of [base, transposed]) {
        variants += 1;
        applyTransitions += 2;
        replayTransitions += 4;
        structuralDecodeCalls += observation.calls.structuralDecode;
        semanticValidationCalls += observation.calls.semanticValidation;
        parserCalls += observation.calls.parser;
        allocations += observation.calls.allocationKinds.length;
      }
    }

    expect({
      seeds: REVIEWED_SEEDS.length,
      cases: rows.length,
      variants,
      applyTransitions,
      replayTransitions,
      structuralDecodeCalls,
      semanticValidationCalls,
      parserCalls,
      allocations,
    }).toEqual({
      seeds: 4,
      cases: 48,
      variants: 96,
      applyTransitions: 192,
      replayTransitions: 384,
      structuralDecodeCalls: 192,
      semanticValidationCalls: 192,
      parserCalls: 0,
      allocations: 96,
    });

    console.log(
      `A0_U1_PROPERTY_OBSERVATION ${JSON.stringify({
        seeds: REVIEWED_SEEDS,
        cases: rows.length,
        variants,
        applyTransitions,
        replayTransitions,
        parserCalls,
        allocations,
      })}`,
    );
  });
});
