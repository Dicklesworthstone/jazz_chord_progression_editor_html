import { describe, expect, test } from "bun:test";

import {
  createInitialAppState,
  runAtomicEditPlan,
  validateDocumentSemantics,
  type ApplyEditPlanCommand,
  type AtomicEditPlan,
  type AtomicEditPlanAppState,
  type AtomicEditPlanDependencies,
  type AtomicEditPlanTransitionResult,
} from "../../src/application";
import {
  MAX_DOCUMENT_SECTIONS,
  PROGRESSION_DOCUMENT_SCHEMA,
  copyDomain,
  decodeDocumentShape,
  makeBeatDuration,
  makeBeatPosition,
  parseStableId,
  type BeatDuration,
  type StableIdFactory,
  type StableIdKind,
  type ValidatedDocument,
} from "../../src/domain";
import { parseChartText, parseChordSymbol } from "../../src/theory";

type DurationSeed = Readonly<{
  numerator: number;
  denominator: number;
}>;

type EventSeed = Readonly<{
  id: string;
  chord: string;
  duration: DurationSeed;
  annotation?: string;
}>;

type MeasureSeed = Readonly<{
  id: string;
  events: readonly EventSeed[];
}>;

type SectionSeed = Readonly<{
  id: string;
  name: string;
  annotation?: string;
  voiceLeadingBoundary?: "continue" | "reset";
  measures: readonly MeasureSeed[];
}>;

type SplitEventPlan = Extract<
  AtomicEditPlan,
  { kind: "split-event-duration" }
>;
type JoinEventPlan = Extract<
  AtomicEditPlan,
  { kind: "join-event-durations" }
>;
type SplitSectionPlan = Extract<AtomicEditPlan, { kind: "split-section" }>;
type JoinSectionsPlan = Extract<AtomicEditPlan, { kind: "join-sections" }>;
type InsertFragmentPlan = Extract<
  AtomicEditPlan,
  { kind: "insert-fragment" }
>;
type CompleteInsertFragmentPlan = Extract<
  InsertFragmentPlan,
  { source: { kind: "complete-draft" } }
>;
type DocumentInsertPlacement = Extract<
  CompleteInsertFragmentPlan["placement"],
  { kind: "into-document" }
>;
type SectionMetadata = SplitSectionPlan["newSectionMetadata"];
type AtomicEditPlanFailure = Extract<
  AtomicEditPlanTransitionResult,
  { ok: false }
>;
type AtomicEditPlanNestedRefusalCode = NonNullable<
  AtomicEditPlanFailure["editPlanRefusal"]
>["code"];
type AtomicEditPlanNestedOuterCode = NonNullable<
  AtomicEditPlanFailure["editPlanRefusal"]
>["outerCode"];

type EventProjection = Readonly<{
  id: string;
  duration: DurationSeed;
  annotation: string;
  chord: string;
  voicing: string;
}>;

type FactoryStep =
  | string
  | Readonly<{ kind: "failure" }>
  | Readonly<{ kind: "throw" }>;

type FactoryHarness = Readonly<{
  factory: StableIdFactory;
  calls: StableIdKind[];
}>;

type DependencyHarness = Readonly<{
  dependencies: AtomicEditPlanDependencies;
  calls: {
    f2: number;
    f3: number;
  };
}>;

const PANELS = Object.freeze({
  open: Object.freeze(["chart", "inspector"] as const),
  active: "chart" as const,
  leftRailCollapsed: false,
  rightRailCollapsed: false,
});

const AUTO_VOICING = Object.freeze({
  mode: "auto",
  family: "balanced",
  voiceCount: 4,
  range: Object.freeze({ lowMidi: 48, highMidi: 84 }),
  bassPolicy: "generated",
});

function duration(numerator: number, denominator: number): BeatDuration {
  const made = makeBeatDuration({ numerator, denominator });
  if (!made.ok) {
    throw new Error(
      `A0_U1_LAW_DURATION:${String(numerator)}/${String(denominator)}`,
    );
  }
  return made.value;
}

function parsedChord(sourceText: string) {
  const parsed = parseChordSymbol(sourceText, "ascii");
  if (!parsed.ok) {
    throw new Error(`A0_U1_LAW_CHORD:${sourceText}`);
  }
  return parsed.chord;
}

function publishDocument(
  sections: readonly SectionSeed[],
  documentId = "document-a0-u1-laws",
): ValidatedDocument {
  const candidate = {
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: documentId,
    title: "A0 U1 law document",
    description: "Independent runner-law fixture",
    meter: { beatsPerBar: 4, beatUnit: 4 },
    tempoBpm: 120,
    key: null,
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      annotation: section.annotation ?? "",
      keyOverride: null,
      voiceLeadingBoundary: section.voiceLeadingBoundary ?? "reset",
      measures: section.measures.map((measure) => ({
        id: measure.id,
        events: measure.events.map((event) => ({
          id: event.id,
          chord: parsedChord(event.chord),
          voicing: AUTO_VOICING,
          duration: event.duration,
          annotation: event.annotation ?? "",
        })),
        completion:
          measure.events.length === 0
            ? { kind: "empty" }
            : { kind: "complete" },
      })),
    })),
    playback: {
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.2,
      countInBars: 0,
    },
  };
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) {
    throw new Error(`A0_U1_LAW_F2:${decoded.errors[0].code}`);
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    throw new Error(`A0_U1_LAW_F3:${published.errors[0].code}`);
  }
  return published.value;
}

function initialState(document: ValidatedDocument): AtomicEditPlanAppState {
  const zero = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zero.ok) throw new Error("A0_U1_LAW_ZERO");
  const initialized = createInitialAppState({
    document,
    zeroBeat: zero.value,
    initialPanels: PANELS,
  });
  if (!initialized.ok) {
    throw new Error(`A0_U1_LAW_STATE:${initialized.refusal.code}`);
  }
  return initialized.state;
}

function eventDocument(
  chord = "C7",
  annotation = "retain me",
  documentId = "document-event-laws",
): ValidatedDocument {
  return publishDocument(
    [
      {
        id: "section-event-laws",
        name: "Events",
        measures: [
          {
            id: "measure-event-laws",
            events: [
              {
                id: "event-event-laws",
                chord,
                duration: duration(4, 1),
                annotation,
              },
            ],
          },
        ],
      },
    ],
    documentId,
  );
}

function sectionDocument(
  sectionCount: number,
  documentId = `document-section-laws-${String(sectionCount)}`,
): ValidatedDocument {
  if (sectionCount < 1) throw new Error("A0_U1_LAW_SECTION_COUNT");
  return publishDocument(
    Array.from({ length: sectionCount }, (_, sectionIndex) => {
      const ordinal = sectionIndex + 1;
      const measureCount = sectionIndex === 0 ? 2 : 1;
      return {
        id: `section-law-${String(ordinal)}`,
        name: `Section ${String(ordinal)}`,
        annotation: `annotation ${String(ordinal)}`,
        voiceLeadingBoundary: sectionIndex === 0 ? "reset" : "continue",
        measures: Array.from({ length: measureCount }, (_unused, measureIndex) => ({
          id: `measure-law-${String(ordinal)}-${String(measureIndex + 1)}`,
          events: [
            {
              id: `event-law-${String(ordinal)}-${String(measureIndex + 1)}`,
              chord: sectionIndex % 2 === 0 ? "C7" : "D7",
              duration: duration(4, 1),
            },
          ],
        })),
      } satisfies SectionSeed;
    }),
    documentId,
  );
}

function factoryHarness(steps: readonly FactoryStep[]): FactoryHarness {
  const calls: StableIdKind[] = [];
  let cursor = 0;
  const factory: StableIdFactory = {
    next: <Kind extends StableIdKind>(kind: Kind) => {
      calls.push(kind);
      const step =
        steps[cursor] ?? `generated-${kind}-${String(cursor + 1)}`;
      cursor += 1;
      if (typeof step !== "string") {
        if (step.kind === "throw") {
          throw new Error("A0_U1_LAW_FACTORY_THROW");
        }
        return {
          ok: false,
          refusal: {
            code: "id.factory_exhausted",
            kind,
            path: ["id"],
          },
        };
      }
      const parsed = parseStableId(kind, step);
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
  return { factory, calls };
}

function semanticRefusalResult() {
  const valid = eventDocument(
    "C7",
    "",
    "document-semantic-refusal-source",
  );
  const section = valid.sections[0];
  const measure = section?.measures[0];
  if (section === undefined || measure === undefined) {
    throw new Error("A0_U1_LAW_SEMANTIC_SOURCE");
  }
  const decoded = decodeDocumentShape({
    ...valid,
    sections: [
      {
        ...section,
        measures: [
          {
            ...measure,
            completion: { kind: "empty" },
          },
        ],
      },
    ],
  });
  if (!decoded.ok) throw new Error("A0_U1_LAW_SEMANTIC_F2");
  const refused = validateDocumentSemantics(decoded.value);
  if (refused.ok) throw new Error("A0_U1_LAW_SEMANTIC_EXPECTED_REFUSAL");
  return refused;
}

function dependencyHarness(
  factory: StableIdFactory,
  mode: "real" | "f2-refusal" | "f3-refusal" = "real",
): DependencyHarness {
  const calls = { f2: 0, f3: 0 };
  const dependencies: AtomicEditPlanDependencies = Object.freeze({
    decodeDocumentShape: (candidate) => {
      calls.f2 += 1;
      return mode === "f2-refusal"
        ? decodeDocumentShape({})
        : decodeDocumentShape(candidate);
    },
    validateDocumentSemantics: (candidate) => {
      calls.f3 += 1;
      return mode === "f3-refusal"
        ? semanticRefusalResult()
        : validateDocumentSemantics(candidate);
    },
    copyDomain,
    stableIdFactory: factory,
    estimateHistoryRetainedBytes: () => 1_024,
    parseChartText,
  });
  return { dependencies, calls };
}

function command(
  state: AtomicEditPlanAppState,
  plan: AtomicEditPlan,
  ordinal: number,
): ApplyEditPlanCommand {
  return Object.freeze({
    id: `command-a0-u1-law-${String(ordinal)}`,
    label: `A0 U1 law ${String(ordinal)}`,
    expectedDocumentId: state.document.id,
    expectedRevision: state.revision,
    logicalTimeMs: ordinal,
    coalescing: null,
    kind: "apply-edit-plan",
    plan,
  });
}

function locateEvent(
  document: ValidatedDocument,
  eventId: string,
) {
  for (const section of document.sections) {
    for (const measure of section.measures) {
      const event = measure.events.find((candidate) => candidate.id === eventId);
      if (event !== undefined) return { section, measure, event };
    }
  }
  throw new Error(`A0_U1_LAW_EVENT_MISSING:${eventId}`);
}

function splitEventPlan(
  document: ValidatedDocument,
  eventId: string,
  firstDuration: BeatDuration,
  secondDuration: BeatDuration,
): SplitEventPlan {
  const located = locateEvent(document, eventId);
  const completionDeclarations: SplitEventPlan["completionDeclarations"] =
    Object.freeze([
      Object.freeze({
        measureId: located.measure.id,
        completion: located.measure.completion,
      }),
    ]);
  return Object.freeze({
    kind: "split-event-duration",
    eventId: located.event.id,
    firstDuration,
    secondDuration,
    completionDeclarations,
    identityPolicy: "retain-source-first-allocate-second",
    contentPolicy: "copy-exact-chord-and-voicing",
    annotationPolicy: "retain-source-first-clear-second",
  });
}

function joinEventPlan(
  document: ValidatedDocument,
  leftEventId: string,
  rightEventId: string,
  joinedDuration: BeatDuration,
): JoinEventPlan {
  const left = locateEvent(document, leftEventId);
  const completionDeclarations: JoinEventPlan["completionDeclarations"] =
    Object.freeze([
      Object.freeze({
        measureId: left.measure.id,
        completion: left.measure.completion,
      }),
    ]);
  return Object.freeze({
    kind: "join-event-durations",
    leftEventId: left.event.id,
    rightEventId: locateEvent(document, rightEventId).event.id,
    joinedDuration,
    completionDeclarations,
    identityPolicy: "retain-left-remove-right",
    contentPolicy: "require-exact-chord-and-voicing",
    annotationPolicy: "require-right-empty-retain-left",
  });
}

function sectionMetadata(
  section: ValidatedDocument["sections"][number],
): SectionMetadata {
  return Object.freeze({
    name: section.name,
    annotation: section.annotation,
    keyOverride: section.keyOverride,
    voiceLeadingBoundary: section.voiceLeadingBoundary,
  });
}

function splitSectionPlan(
  document: ValidatedDocument,
  sectionIndex: number,
  beforeMeasureIndex: number,
  newSectionMetadata: SectionMetadata,
): SplitSectionPlan {
  const section = document.sections[sectionIndex];
  const measure = section?.measures[beforeMeasureIndex];
  if (section === undefined || measure === undefined) {
    throw new Error("A0_U1_LAW_SPLIT_SECTION_TARGET");
  }
  const completionDeclarations: readonly [] = Object.freeze([]);
  return Object.freeze({
    kind: "split-section",
    sectionId: section.id,
    beforeMeasureId: measure.id,
    newSectionMetadata,
    completionDeclarations,
    identityPolicy: "retain-source-prefix-allocate-suffix",
    measurePolicy: "move-suffix-preserve-identities",
  });
}

type SplitMeasurePlan = Extract<AtomicEditPlan, { kind: "split-measure" }>;

/**
 * A four-beat bar holding two two-beat events. Splitting it at the second event
 * is the only strict-interior boundary it has, so the same document proves both
 * the positive law and every boundary near miss.
 */
function measurePairDocument(
  documentId = "document-split-measure-laws",
): ValidatedDocument {
  return publishDocument(
    [
      {
        id: "section-split-measure",
        name: "Pair",
        measures: [
          {
            id: "measure-split-measure",
            events: [
              {
                id: "event-split-measure-left",
                chord: "Dm7",
                duration: duration(2, 1),
                annotation: "left annotation survives",
              },
              {
                id: "event-split-measure-right",
                chord: "G7",
                duration: duration(2, 1),
              },
            ],
          },
        ],
      },
    ],
    documentId,
  );
}

function shortCompletion(
  reason: string,
): SplitMeasurePlan["newMeasureCompletion"] {
  return Object.freeze({
    kind: "incomplete",
    expectedDuration: duration(2, 1),
    reason,
  });
}

function splitMeasurePlan(
  document: ValidatedDocument,
  overrides: Partial<{
    beforeEventId: SplitMeasurePlan["beforeEventId"];
    firstMeasureTotal: BeatDuration;
    secondMeasureTotal: BeatDuration;
  }> = {},
): SplitMeasurePlan {
  const section = document.sections[0];
  const measure = section?.measures[0];
  const boundary = measure?.events[1];
  if (measure === undefined || boundary === undefined) {
    throw new Error("A0_U1_LAW_SPLIT_MEASURE_TARGET");
  }
  const completionDeclarations: readonly [
    SplitMeasurePlan["completionDeclarations"][0],
  ] = Object.freeze([
    Object.freeze({
      measureId: measure.id,
      completion: shortCompletion("Retained half of the split bar"),
    }),
  ]);
  return Object.freeze({
    kind: "split-measure",
    measureId: measure.id,
    beforeEventId: overrides.beforeEventId ?? boundary.id,
    firstMeasureTotal: overrides.firstMeasureTotal ?? duration(2, 1),
    secondMeasureTotal: overrides.secondMeasureTotal ?? duration(2, 1),
    newMeasureCompletion: shortCompletion("Suffix half of the split bar"),
    completionDeclarations,
    identityPolicy: "retain-source-prefix-allocate-suffix",
    eventPolicy: "move-suffix-preserve-identities",
  });
}

function joinSectionsPlan(
  document: ValidatedDocument,
  leftIndex: number,
  rightIndex: number,
  resultMetadata: SectionMetadata,
): JoinSectionsPlan {
  const left = document.sections[leftIndex];
  const right = document.sections[rightIndex];
  if (left === undefined || right === undefined) {
    throw new Error("A0_U1_LAW_JOIN_SECTION_TARGET");
  }
  const completionDeclarations: readonly [] = Object.freeze([]);
  return Object.freeze({
    kind: "join-sections",
    leftSectionId: left.id,
    rightSectionId: right.id,
    expectedLeftMetadata: sectionMetadata(left),
    expectedRightMetadata: sectionMetadata(right),
    resultMetadata,
    completionDeclarations,
    identityPolicy: "retain-left-remove-right",
    measurePolicy: "left-then-right-preserve-identities",
    metadataPolicy: "compare-both-then-apply-explicit-result",
    internalBoundaryPolicy: "remove-right-entry-boundary-confirmed",
  });
}

function requireSuccess(
  result: AtomicEditPlanTransitionResult,
): Extract<AtomicEditPlanTransitionResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(
      `A0_U1_LAW_EXPECTED_SUCCESS:${result.refusal.code}:${
        result.editPlanRefusal?.code ?? "preplan"
      }`,
    );
  }
  return result;
}

function requirePlanRefusal(
  result: AtomicEditPlanTransitionResult,
  outerCode: AtomicEditPlanNestedOuterCode,
  nestedCode: AtomicEditPlanNestedRefusalCode,
) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("A0_U1_LAW_EXPECTED_REFUSAL");
  expect(result.refusal.code).toBe(outerCode);
  expect(result.editPlanRefusal?.code).toBe(nestedCode);
  if (result.editPlanRefusal === null) {
    throw new Error("A0_U1_LAW_EXPECTED_NESTED_REFUSAL");
  }
  expect(result.editPlanRefusal.outerCode).toBe(outerCode);
  expect(result.editPlanRefusal.path).toEqual(result.refusal.path);
  return result;
}

function expectNoPublication(
  before: AtomicEditPlanAppState,
  result: Exclude<AtomicEditPlanTransitionResult, { ok: true }>,
  inputSnapshot: string,
): void {
  expect(JSON.stringify(before)).toBe(inputSnapshot);
  for (const key of [
    "document",
    "revision",
    "exportRevision",
    "recovery",
    "history",
    "bookmarks",
    "panels",
    "dialogs",
    "quickEntry",
    "importDraft",
    "transport",
    "pendingRequests",
    "documentTransition",
    "focusRequest",
  ] as const) {
    expect(result.state[key]).toBe(before[key]);
  }
  expect(result.state.notices).not.toBe(before.notices);
  expect(result.state.notices).toHaveLength(before.notices.length + 1);
  expect(result.state.nextSequence).toBe(before.nextSequence + 1);
  expect(result.effects).toEqual([]);
}

function eventProjection(
  document: ValidatedDocument,
  measureId = "measure-event-laws",
): EventProjection[] {
  const measure = document.sections
    .flatMap((section) => section.measures)
    .find((candidate) => candidate.id === measureId);
  if (measure === undefined) throw new Error("A0_U1_LAW_PROJECTION_MEASURE");
  return measure.events.map((event) => ({
    id: String(event.id),
    duration: {
      numerator: event.duration.numerator,
      denominator: event.duration.denominator,
    },
    annotation: event.annotation,
    chord: JSON.stringify(event.chord),
    voicing: JSON.stringify(event.voicing),
  }));
}

function splitOracleViolations(
  before: EventProjection,
  after: readonly EventProjection[],
  allocatedId: string,
  first: BeatDuration,
  second: BeatDuration,
): string[] {
  const violations: string[] = [];
  if (after.length !== 2) violations.push("cardinality");
  const left = after[0];
  const right = after[1];
  if (left?.id !== before.id) violations.push("left-identity");
  if (right?.id !== allocatedId) violations.push("right-identity");
  if (
    left?.duration.numerator !== first.numerator ||
    left.duration.denominator !== first.denominator
  ) {
    violations.push("left-duration");
  }
  if (
    right?.duration.numerator !== second.numerator ||
    right.duration.denominator !== second.denominator
  ) {
    violations.push("right-duration");
  }
  if (left?.annotation !== before.annotation) {
    violations.push("left-annotation");
  }
  if (right?.annotation !== "") violations.push("right-annotation");
  if (
    left?.chord !== before.chord ||
    right?.chord !== before.chord ||
    left.voicing !== before.voicing ||
    right.voicing !== before.voicing
  ) {
    violations.push("content");
  }
  return violations;
}

function stateWithDocumentQuickEntry(
  state: AtomicEditPlanAppState,
  sourceText: string,
): AtomicEditPlanAppState {
  const target = Object.freeze({ kind: "document-end" as const });
  return Object.freeze({
    ...state,
    quickEntry: Object.freeze({
      text: sourceText,
      target,
      baseRevision: state.revision,
      status: "ready" as const,
      issueCodes: Object.freeze([]),
    }),
  });
}

function documentInsertPlan(
  state: AtomicEditPlanAppState,
  sourceText: string,
): CompleteInsertFragmentPlan {
  const parsed = parseChartText(
    sourceText,
    { mode: "fragment", meter: state.document.meter },
    "ascii",
  );
  if (!parsed.ok) throw new Error("A0_U1_LAW_INSERT_SOURCE");
  const declarationRows = parsed.draft.sections.map((section, index) =>
    Object.freeze({
      sourceSectionOrdinal: section.ordinal,
      voiceLeadingBoundary: index === 0 ? "reset" : "continue",
    }),
  );
  const firstDeclaration = declarationRows[0];
  if (firstDeclaration === undefined) {
    throw new Error("A0_U1_LAW_INSERT_SECTION_DECLARATIONS");
  }
  const sectionDeclarations: DocumentInsertPlacement["sectionDeclarations"] =
    Object.freeze([firstDeclaration, ...declarationRows.slice(1)]);
  const completionDeclarations: DocumentInsertPlacement["completionDeclarations"] =
    Object.freeze([]);

  return Object.freeze({
    kind: "insert-fragment",
    source: Object.freeze({
      kind: "complete-draft",
      quickEntrySnapshot: Object.freeze({
        sourceText,
        baseRevision: state.revision,
        target: Object.freeze({ kind: "document-end" }),
        issueCodes: Object.freeze([]),
        expectedStatus: "ready",
        expectedLane: "complete-draft",
      }),
      warningAcknowledgements: Object.freeze(
        parsed.warnings.map((warning) =>
          Object.freeze({
            code: warning.code,
            range: Object.freeze({ ...warning.range }),
          }),
        ),
      ),
    }),
    placement: Object.freeze({
      kind: "into-document",
      beforeSectionId: null,
      layoutDisposition: "preserve-named-sections",
      sectionDeclarations,
      completionDeclarations,
    }),
    voicingPolicy: "a0-u1-balanced-4-48-84-generated@1",
  });
}

/**
 * MR selection:
 * - split->join inverse: sensitivity 5, independence 5, cost 2, score 12.5
 * - chord-root/spelling covariance: sensitivity 3, independence 4, cost 2, score 6
 * - at-limit/first-excess boundary: sensitivity 5, independence 5, cost 2, score 12.5
 * Exact local oracles supplement these relations where the expected result is
 * fully computable.
 */
describe("A0/U1 atomic edit-plan runner laws", () => {
  test("exact rational event split/join is invertive and chord-spelling invariant", () => {
    const chordSymbols = ["C7", "D7", "Eb7"] as const;
    const rationalSplits = [
      [duration(1, 3), duration(11, 3)],
      [duration(1, 2), duration(7, 2)],
      [duration(3, 2), duration(5, 2)],
    ] as const;
    let invariantProjection: Readonly<{
      ids: readonly string[];
      durations: readonly DurationSeed[];
      annotations: readonly string[];
    }>[] | null = null;
    const observedProjections: {
      before: ReturnType<typeof eventProjection>[number];
      after: ReturnType<typeof eventProjection>;
      allocatedId: string;
      first: BeatDuration;
      second: BeatDuration;
    }[] = [];

    for (const [chordIndex, chordSymbol] of chordSymbols.entries()) {
      const perChord: Readonly<{
        ids: readonly string[];
        durations: readonly DurationSeed[];
        annotations: readonly string[];
      }>[] = [];
      for (const [splitIndex, [first, second]] of rationalSplits.entries()) {
        const document = eventDocument(
          chordSymbol,
          "retain me",
          `document-event-law-${String(chordIndex)}-${String(splitIndex)}`,
        );
        const state = initialState(document);
        const allocatedId =
          `event-split-${String(chordIndex)}-${String(splitIndex)}`;
        const splitFactory = factoryHarness([allocatedId]);
        const splitDependencies = dependencyHarness(splitFactory.factory);
        const split = requireSuccess(
          runAtomicEditPlan({
            state,
            command: command(
              state,
              splitEventPlan(
                state.document,
                "event-event-laws",
                first,
                second,
              ),
              10 + chordIndex * 10 + splitIndex,
            ),
            dependencies: splitDependencies.dependencies,
          }),
        );
        const beforeProjection = eventProjection(document)[0];
        if (beforeProjection === undefined) {
          throw new Error("A0_U1_LAW_BEFORE_PROJECTION");
        }
        const afterProjection = eventProjection(split.state.document);
        expect(
          splitOracleViolations(
            beforeProjection,
            afterProjection,
            allocatedId,
            first,
            second,
          ),
        ).toEqual([]);
        expect(splitFactory.calls).toEqual(["event"]);
        expect(splitDependencies.calls).toEqual({ f2: 1, f3: 1 });
        expect(split.editPlanReceipt.work).toMatchObject({
          structuralDecodeCalls: 1,
          semanticValidationCalls: 1,
          idAllocationAttempts: 1,
          idCollisionChecks: 1,
          termination: "complete",
        });

        const joinedDependencies = dependencyHarness(
          factoryHarness([]).factory,
        );
        const joined = requireSuccess(
          runAtomicEditPlan({
            state: split.state,
            command: command(
              split.state,
              joinEventPlan(
                split.state.document,
                "event-event-laws",
                allocatedId,
                duration(4, 1),
              ),
              100 + chordIndex * 10 + splitIndex,
            ),
            dependencies: joinedDependencies.dependencies,
          }),
        );
        expect(joined.state.document).toEqual(document);
        expect(joined.editPlanReceipt).toMatchObject({
          planKind: "join-event-durations",
          survivorId: "event-event-laws",
          removedIdentities: [
            { kind: "event", id: allocatedId },
          ],
        });
        expect(joinedDependencies.calls).toEqual({ f2: 1, f3: 1 });

        observedProjections.push({
          before: beforeProjection,
          after: afterProjection,
          allocatedId,
          first,
          second,
        });
        perChord.push({
          ids: afterProjection.map((event) =>
            event.id === allocatedId ? "<allocated>" : "<source>",
          ),
          durations: afterProjection.map((event) => event.duration),
          annotations: afterProjection.map((event) => event.annotation),
        });
      }
      if (invariantProjection === null) {
        invariantProjection = [...perChord];
      } else {
        expect(perChord).toEqual(invariantProjection);
      }
    }

    const witness = observedProjections[0];
    if (witness === undefined) throw new Error("A0_U1_LAW_MUTATION_WITNESS");
    const mutants = [
      witness.after.map((event, index) =>
        index === 0
          ? { ...event, id: witness.allocatedId }
          : event,
      ),
      witness.after.map((event, index) =>
        index === 1
          ? { ...event, duration: { numerator: 1, denominator: 1 } }
          : event,
      ),
      witness.after.map((event, index) =>
        index === 1 ? { ...event, annotation: "leaked" } : event,
      ),
      [...witness.after].reverse(),
    ];
    for (const mutant of mutants) {
      expect(
        splitOracleViolations(
          witness.before,
          mutant,
          witness.allocatedId,
          witness.first,
          witness.second,
        ).length,
      ).toBeGreaterThan(0);
    }
  });

  test("rational split/join near misses refuse before allocation or publication", () => {
    const state = initialState(eventDocument());
    const mismatchFactory = factoryHarness(["event-mismatch-unobserved"]);
    const mismatchDependencies = dependencyHarness(mismatchFactory.factory);
    const snapshot = JSON.stringify(state);
    const mismatchedSplit = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(
          state,
          splitEventPlan(
            state.document,
            "event-event-laws",
            duration(1, 3),
            duration(10, 3),
          ),
          200,
        ),
        dependencies: mismatchDependencies.dependencies,
      }),
      "command.payload_invalid",
      "edit-plan.duration-sum-mismatch",
    );
    expectNoPublication(state, mismatchedSplit, snapshot);
    expect(mismatchFactory.calls).toEqual([]);
    expect(mismatchDependencies.calls).toEqual({ f2: 0, f3: 0 });
    expect(mismatchedSplit.editPlanRefusal.work).toMatchObject({
      exactBeatAdditions: 1,
      exactBeatComparisons: 1,
      idAllocationAttempts: 0,
      structuralDecodeCalls: 0,
      semanticValidationCalls: 0,
      termination: "input-refusal",
    });

    const splitFactory = factoryHarness(["event-join-near-miss"]);
    const splitDependencies = dependencyHarness(splitFactory.factory);
    const split = requireSuccess(
      runAtomicEditPlan({
        state,
        command: command(
          state,
          splitEventPlan(
            state.document,
            "event-event-laws",
            duration(1, 1),
            duration(3, 1),
          ),
          201,
        ),
        dependencies: splitDependencies.dependencies,
      }),
    );
    const joinDependencies = dependencyHarness(factoryHarness([]).factory);
    const joinSnapshot = JSON.stringify(split.state);
    const mismatchedJoin = requirePlanRefusal(
      runAtomicEditPlan({
        state: split.state,
        command: command(
          split.state,
          joinEventPlan(
            split.state.document,
            "event-event-laws",
            "event-join-near-miss",
            duration(3, 1),
          ),
          202,
        ),
        dependencies: joinDependencies.dependencies,
      }),
      "command.payload_invalid",
      "edit-plan.duration-sum-mismatch",
    );
    expectNoPublication(split.state, mismatchedJoin, joinSnapshot);
    expect(joinDependencies.calls).toEqual({ f2: 0, f3: 0 });
  });

  test("section split/join preserves measure order and uses the left identity", () => {
    const document = sectionDocument(1, "document-section-roundtrip");
    const state = initialState(document);
    const source = document.sections[0];
    if (source === undefined) throw new Error("A0_U1_LAW_SECTION_SOURCE");
    const originalMetadata = sectionMetadata(source);
    const suffixMetadata: SectionMetadata = Object.freeze({
      name: "Suffix",
      annotation: "new suffix",
      keyOverride: null,
      voiceLeadingBoundary: "continue",
    });
    const splitFactory = factoryHarness(["section-split-suffix"]);
    const splitDependencies = dependencyHarness(splitFactory.factory);
    const split = requireSuccess(
      runAtomicEditPlan({
        state,
        command: command(
          state,
          splitSectionPlan(state.document, 0, 1, suffixMetadata),
          300,
        ),
        dependencies: splitDependencies.dependencies,
      }),
    );
    expect(splitFactory.calls).toEqual(["section"]);
    expect(
      split.state.document.sections.map((section) => ({
        id: String(section.id),
        measures: section.measures.map((measure) => String(measure.id)),
      })),
    ).toEqual([
      {
        id: "section-law-1",
        measures: ["measure-law-1-1"],
      },
      {
        id: "section-split-suffix",
        measures: ["measure-law-1-2"],
      },
    ]);
    expect(split.state.document.sections[1]).toMatchObject(suffixMetadata);
    expect(split.editPlanReceipt).toMatchObject({
      planKind: "split-section",
      survivorId: "section-law-1",
      allocatedIdentities: [
        {
          kind: "section",
          id: "section-split-suffix",
          source: {
            kind: "split-section-suffix",
            sourceSectionId: "section-law-1",
          },
        },
      ],
    });

    const joinDependencies = dependencyHarness(factoryHarness([]).factory);
    const joined = requireSuccess(
      runAtomicEditPlan({
        state: split.state,
        command: command(
          split.state,
          joinSectionsPlan(split.state.document, 0, 1, originalMetadata),
          301,
        ),
        dependencies: joinDependencies.dependencies,
      }),
    );
    expect(joined.state.document).toEqual(document);
    expect(joined.editPlanReceipt).toMatchObject({
      planKind: "join-sections",
      survivorId: "section-law-1",
      removedIdentities: [
        { kind: "section", id: "section-split-suffix" },
      ],
    });
    expect(
      joined.state.document.sections[0]?.measures.map((measure) =>
        String(measure.id),
      ),
    ).toEqual(["measure-law-1-1", "measure-law-1-2"]);

    const firstBoundaryFactory = factoryHarness(["unobserved-section"]);
    const firstBoundaryDependencies = dependencyHarness(
      firstBoundaryFactory.factory,
    );
    const boundarySnapshot = JSON.stringify(state);
    const invalidBoundary = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(
          state,
          splitSectionPlan(state.document, 0, 0, suffixMetadata),
          302,
        ),
        dependencies: firstBoundaryDependencies.dependencies,
      }),
      "command.destination_invalid",
      "edit-plan.section-split-boundary-invalid",
    );
    expectNoPublication(state, invalidBoundary, boundarySnapshot);
    expect(firstBoundaryFactory.calls).toEqual([]);
    expect(firstBoundaryDependencies.calls).toEqual({ f2: 0, f3: 0 });

    const nonAdjacentState = initialState(
      sectionDocument(3, "document-section-order-near-miss"),
    );
    const nonAdjacentDependencies = dependencyHarness(
      factoryHarness([]).factory,
    );
    const nonAdjacentLeft = nonAdjacentState.document.sections[0];
    if (nonAdjacentLeft === undefined) {
      throw new Error("A0_U1_LAW_NONADJACENT_LEFT");
    }
    const orderSnapshot = JSON.stringify(nonAdjacentState);
    const nonAdjacent = requirePlanRefusal(
      runAtomicEditPlan({
        state: nonAdjacentState,
        command: command(
          nonAdjacentState,
          joinSectionsPlan(
            nonAdjacentState.document,
            0,
            2,
            sectionMetadata(nonAdjacentLeft),
          ),
          303,
        ),
        dependencies: nonAdjacentDependencies.dependencies,
      }),
      "command.destination_invalid",
      "edit-plan.section-order-invalid",
    );
    expectNoPublication(nonAdjacentState, nonAdjacent, orderSnapshot);
    expect(nonAdjacentDependencies.calls).toEqual({ f2: 0, f3: 0 });
  });

  test("ID allocation is structural preorder and collision/factory failure stop once", () => {
    const sourceText = "[Alpha]\n| C:4 |\n[Beta]\n| Dm:2 G7:2 |";
    const base = initialState(
      sectionDocument(1, "document-allocation-order"),
    );
    const state = stateWithDocumentQuickEntry(base, sourceText);
    const plan = documentInsertPlan(state, sourceText);
    const outputs = [
      "allocated-section-alpha",
      "allocated-measure-alpha",
      "allocated-event-alpha",
      "allocated-section-beta",
      "allocated-measure-beta",
      "allocated-event-beta-1",
      "allocated-event-beta-2",
    ] as const;
    const successFactory = factoryHarness(outputs);
    const successDependencies = dependencyHarness(successFactory.factory);
    const inserted = requireSuccess(
      runAtomicEditPlan({
        state,
        command: command(state, plan, 400),
        dependencies: successDependencies.dependencies,
      }),
    );
    expect(successFactory.calls).toEqual([
      "section",
      "measure",
      "event",
      "section",
      "measure",
      "event",
      "event",
    ]);
    expect(
      inserted.editPlanReceipt.allocatedIdentities.map(({ kind, id }) => ({
        kind,
        id: String(id),
      })),
    ).toEqual([
      { kind: "section", id: outputs[0] },
      { kind: "measure", id: outputs[1] },
      { kind: "event", id: outputs[2] },
      { kind: "section", id: outputs[3] },
      { kind: "measure", id: outputs[4] },
      { kind: "event", id: outputs[5] },
      { kind: "event", id: outputs[6] },
    ]);
    expect(successDependencies.calls).toEqual({ f2: 1, f3: 1 });

    const collisionFactory = factoryHarness([
      "allocated-shared-collision",
      "allocated-shared-collision",
      "must-not-be-observed",
    ]);
    const collisionDependencies = dependencyHarness(collisionFactory.factory);
    const collisionSnapshot = JSON.stringify(state);
    const collision = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(state, plan, 401),
        dependencies: collisionDependencies.dependencies,
      }),
      "command.id_allocation_failed",
      "edit-plan.id-collision",
    );
    expectNoPublication(state, collision, collisionSnapshot);
    expect(collisionFactory.calls).toEqual(["section", "measure"]);
    expect(collisionDependencies.calls).toEqual({ f2: 0, f3: 0 });
    expect(collision.editPlanRefusal.work).toMatchObject({
      idAllocationAttempts: 2,
      idCollisionChecks: 2,
      peakAllocatedIdRecords: 1,
      termination: "allocation-refusal",
    });

    const failedFactory = factoryHarness([
      Object.freeze({ kind: "failure" }),
      "must-not-be-observed",
    ]);
    const failedDependencies = dependencyHarness(failedFactory.factory);
    const failureSnapshot = JSON.stringify(state);
    const failed = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(state, plan, 402),
        dependencies: failedDependencies.dependencies,
      }),
      "command.id_allocation_failed",
      "edit-plan.id-factory-failed",
    );
    expectNoPublication(state, failed, failureSnapshot);
    expect(failedFactory.calls).toEqual(["section"]);
    expect(failedDependencies.calls).toEqual({ f2: 0, f3: 0 });
    expect(failed.editPlanRefusal.work).toMatchObject({
      idAllocationAttempts: 1,
      idCollisionChecks: 0,
      peakAllocatedIdRecords: 0,
      termination: "allocation-refusal",
    });
  });

  test("section collection bound accepts the limit and refuses exactly limit plus one", () => {
    const atMostState = initialState(
      sectionDocument(
        MAX_DOCUMENT_SECTIONS - 1,
        "document-section-at-most-limit",
      ),
    );
    const metadata: SectionMetadata = Object.freeze({
      name: "Bounded suffix",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "continue",
    });
    const atMostFactory = factoryHarness(["section-at-exact-limit"]);
    const atMostDependencies = dependencyHarness(atMostFactory.factory);
    const atMost = requireSuccess(
      runAtomicEditPlan({
        state: atMostState,
        command: command(
          atMostState,
          splitSectionPlan(atMostState.document, 0, 1, metadata),
          500,
        ),
        dependencies: atMostDependencies.dependencies,
      }),
    );
    expect(atMost.state.document.sections).toHaveLength(
      MAX_DOCUMENT_SECTIONS,
    );
    expect(atMostFactory.calls).toEqual(["section"]);
    expect(atMostDependencies.calls).toEqual({ f2: 1, f3: 1 });

    const atLimitState = initialState(
      sectionDocument(
        MAX_DOCUMENT_SECTIONS,
        "document-section-first-excess",
      ),
    );
    const firstExcessFactory = factoryHarness([
      "section-first-excess-must-not-allocate",
    ]);
    const firstExcessDependencies = dependencyHarness(
      firstExcessFactory.factory,
    );
    const snapshot = JSON.stringify(atLimitState);
    const firstExcess = requirePlanRefusal(
      runAtomicEditPlan({
        state: atLimitState,
        command: command(
          atLimitState,
          splitSectionPlan(atLimitState.document, 0, 1, metadata),
          501,
        ),
        dependencies: firstExcessDependencies.dependencies,
      }),
      "command.payload_invalid",
      "edit-plan.collection-limit-exceeded",
    );
    expectNoPublication(atLimitState, firstExcess, snapshot);
    expect(firstExcessFactory.calls).toEqual([]);
    expect(firstExcessDependencies.calls).toEqual({ f2: 0, f3: 0 });
    expect(firstExcess.editPlanRefusal.work).toMatchObject({
      idAllocationAttempts: 0,
      structuralDecodeCalls: 0,
      semanticValidationCalls: 0,
      termination: "input-refusal",
    });
    const limitDiagnostic = firstExcess.editPlanRefusal.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "edit-plan.collection-limit-exceeded",
    );
    if (limitDiagnostic === undefined) {
      throw new Error("A0_U1_LAW_LIMIT_DIAGNOSTIC");
    }
    expect(limitDiagnostic.observed).toBe(MAX_DOCUMENT_SECTIONS + 1);
    expect(limitDiagnostic.maximum).toBe(MAX_DOCUMENT_SECTIONS);
  });

  test("F2 and F3 are called exactly once and later stages never run after refusal", () => {
    const state = initialState(
      eventDocument("F7", "publication", "document-publication-counts"),
    );
    const plan = splitEventPlan(
      state.document,
      "event-event-laws",
      duration(2, 1),
      duration(2, 1),
    );

    const successFactory = factoryHarness(["event-publication-success"]);
    const successDependencies = dependencyHarness(successFactory.factory);
    const success = requireSuccess(
      runAtomicEditPlan({
        state,
        command: command(state, plan, 600),
        dependencies: successDependencies.dependencies,
      }),
    );
    expect(successDependencies.calls).toEqual({ f2: 1, f3: 1 });
    expect(success.counters.validationCalls).toBe(1);
    expect(success.editPlanReceipt.work).toMatchObject({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 1,
      termination: "complete",
    });

    const f2Factory = factoryHarness(["event-publication-f2-refusal"]);
    const f2Dependencies = dependencyHarness(
      f2Factory.factory,
      "f2-refusal",
    );
    const f2Snapshot = JSON.stringify(state);
    const f2Refusal = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(state, plan, 601),
        dependencies: f2Dependencies.dependencies,
      }),
      "command.structural_validation_failed",
      "edit-plan.structural-publication-refused",
    );
    expectNoPublication(state, f2Refusal, f2Snapshot);
    expect(f2Factory.calls).toEqual(["event"]);
    expect(f2Dependencies.calls).toEqual({ f2: 1, f3: 0 });
    expect(f2Refusal.counters.validationCalls).toBe(0);
    expect(f2Refusal.editPlanRefusal.work).toMatchObject({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 0,
      termination: "publication-refusal",
    });

    const f3Factory = factoryHarness(["event-publication-f3-refusal"]);
    const f3Dependencies = dependencyHarness(
      f3Factory.factory,
      "f3-refusal",
    );
    const f3Snapshot = JSON.stringify(state);
    const f3Refusal = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(state, plan, 602),
        dependencies: f3Dependencies.dependencies,
      }),
      "command.semantic_validation_failed",
      "edit-plan.semantic-publication-refused",
    );
    expectNoPublication(state, f3Refusal, f3Snapshot);
    expect(f3Factory.calls).toEqual(["event"]);
    expect(f3Dependencies.calls).toEqual({ f2: 1, f3: 1 });
    expect(f3Refusal.counters.validationCalls).toBe(1);
    expect(f3Refusal.editPlanRefusal.work).toMatchObject({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 1,
      termination: "publication-refusal",
    });
  });

  test("stale revision and cancelled QuickEntry refuse before parser, allocation, F2, or F3", () => {
    const sourceText = "[Captured]\n| Cmaj7:2 Dm7:2 |";
    const base = initialState(
      sectionDocument(1, "document-stale-cancellation-laws"),
    );
    const readyState = stateWithDocumentQuickEntry(base, sourceText);
    const capturedPlan = documentInsertPlan(readyState, sourceText);

    const staleFactory = factoryHarness([
      "stale-must-not-allocate-section",
    ]);
    const staleHarness = dependencyHarness(staleFactory.factory);
    let staleParserCalls = 0;
    const staleDependencies: AtomicEditPlanDependencies = Object.freeze({
      ...staleHarness.dependencies,
      parseChartText: (text, request, accidentalStyle) => {
        staleParserCalls += 1;
        return parseChartText(text, request, accidentalStyle);
      },
    });
    const matchingCommand = command(readyState, capturedPlan, 700);
    const staleCommand: ApplyEditPlanCommand = Object.freeze({
      ...matchingCommand,
      expectedRevision: readyState.revision + 1,
    });
    const staleSnapshot = JSON.stringify(readyState);
    const stale = runAtomicEditPlan({
      state: readyState,
      command: staleCommand,
      dependencies: staleDependencies,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("A0_U1_LAW_EXPECTED_STALE_REFUSAL");
    expect(stale.refusal).toMatchObject({
      code: "command.stale_revision",
      path: ["expectedRevision"],
    });
    expect(stale.editPlanRefusal).toBeNull();
    expectNoPublication(readyState, stale, staleSnapshot);
    expect(staleParserCalls).toBe(0);
    expect(staleFactory.calls).toEqual([]);
    expect(staleHarness.calls).toEqual({ f2: 0, f3: 0 });
    expect(stale.counters.validationCalls).toBe(0);

    const cancelledState: AtomicEditPlanAppState = Object.freeze({
      ...readyState,
      quickEntry: Object.freeze({
        text: "",
        target: readyState.quickEntry.target,
        baseRevision: readyState.revision,
        status: "idle",
        issueCodes: Object.freeze([]),
      }),
    });
    const cancelledFactory = factoryHarness([
      "cancelled-must-not-allocate-section",
    ]);
    const cancelledHarness = dependencyHarness(cancelledFactory.factory);
    let cancelledParserCalls = 0;
    const cancelledDependencies: AtomicEditPlanDependencies = Object.freeze({
      ...cancelledHarness.dependencies,
      parseChartText: (text, request, accidentalStyle) => {
        cancelledParserCalls += 1;
        return parseChartText(text, request, accidentalStyle);
      },
    });
    const cancelledSnapshot = JSON.stringify(cancelledState);
    const cancelled = requirePlanRefusal(
      runAtomicEditPlan({
        state: cancelledState,
        command: command(cancelledState, capturedPlan, 701),
        dependencies: cancelledDependencies,
      }),
      "command.payload_invalid",
      "edit-plan.quick-entry-snapshot-mismatch",
    );
    expectNoPublication(cancelledState, cancelled, cancelledSnapshot);
    expect(cancelledParserCalls).toBe(0);
    expect(cancelledFactory.calls).toEqual([]);
    expect(cancelledHarness.calls).toEqual({ f2: 0, f3: 0 });
    expect(cancelled.counters.validationCalls).toBe(0);
    expect(cancelled.editPlanRefusal.work).toMatchObject({
      syntaxParseCalls: 0,
      idAllocationAttempts: 0,
      structuralDecodeCalls: 0,
      semanticValidationCalls: 0,
      termination: "input-refusal",
    });
  });
  test("split-measure moves a bar line and never a beat", () => {
    const document = measurePairDocument();
    const state = initialState(document);
    const factory = factoryHarness(["measure-split-measure-suffix"]);
    const harness = dependencyHarness(factory.factory);
    // Document-wide, because the point of the law is that events keep their
    // identity, value, and order while crossing a moved bar line.
    const flattened = (candidate: ValidatedDocument) =>
      candidate.sections
        .flatMap((section) => section.measures)
        .flatMap((measure) => measure.events)
        .map((event) => ({
          id: String(event.id),
          annotation: event.annotation,
          duration: {
            numerator: event.duration.numerator,
            denominator: event.duration.denominator,
          },
          chord: JSON.stringify(event.chord),
          voicing: JSON.stringify(event.voicing),
        }));
    const before = flattened(document);
    const result = requireSuccess(
      runAtomicEditPlan({
        state,
        command: command(state, splitMeasurePlan(document), 801),
        dependencies: harness.dependencies,
      }),
    );

    // One section, two measures, and the flattened event stream is untouched:
    // same identities, same order, same exact durations, same annotations.
    const after = result.state.document;
    expect(after.sections).toHaveLength(1);
    const measures = after.sections[0]?.measures ?? [];
    expect(measures).toHaveLength(2);
    expect(flattened(after)).toEqual(before);

    const [retained, suffix] = measures;
    expect(String(retained?.id)).toBe("measure-split-measure");
    expect(retained?.events.map((event) => String(event.id))).toEqual([
      "event-split-measure-left",
    ]);
    expect(suffix?.events.map((event) => String(event.id))).toEqual([
      "event-split-measure-right",
    ]);
    // The suffix is the only allocated identity; nothing is removed.
    expect(String(suffix?.id)).not.toBe(String(retained?.id));
    expect(factory.calls).toEqual(["measure"]);
    // Each side carries its own declared completion; neither inherits the
    // source bar's `complete`, which is exactly the value a split invalidates.
    expect(retained?.completion).toEqual(
      shortCompletion("Retained half of the split bar"),
    );
    expect(suffix?.completion).toEqual(
      shortCompletion("Suffix half of the split bar"),
    );
    expect(harness.calls).toEqual({ f2: 1, f3: 1 });
  });

  test("split-measure boundary must be strict interior", () => {
    const document = measurePairDocument("document-split-measure-boundary");
    const state = initialState(document);
    const snapshot = JSON.stringify(state);

    // The measure's first event would leave an empty retained half, so the
    // split would be a no-op dressed as a split.
    const factory = factoryHarness(["boundary-must-not-allocate"]);
    const harness = dependencyHarness(factory.factory);
    const firstEvent = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(
          state,
          splitMeasurePlan(document, {
            beforeEventId: locateEvent(document, "event-split-measure-left")
              .event.id,
          }),
          802,
        ),
        dependencies: harness.dependencies,
      }),
      "command.destination_invalid",
      "edit-plan.measure-split-boundary-invalid",
    );
    expect(firstEvent.editPlanRefusal.path).toEqual(["plan", "beforeEventId"]);
    // The boundary check precedes every identity and publication stage.
    expect(factory.calls).toEqual([]);
    expect(harness.calls).toEqual({ f2: 0, f3: 0 });
    expectNoPublication(state, firstEvent, snapshot);

    // An event that belongs to a different measure is a destination failure,
    // not a missing target: the event exists, it just is not interior here.
    const twoBars = publishDocument(
      [
        {
          id: "section-split-measure",
          name: "Pair",
          measures: [
            {
              id: "measure-split-measure",
              events: [
                {
                  id: "event-split-measure-left",
                  chord: "Dm7",
                  duration: duration(2, 1),
                },
                {
                  id: "event-split-measure-right",
                  chord: "G7",
                  duration: duration(2, 1),
                },
              ],
            },
            {
              id: "measure-split-measure-other",
              events: [
                {
                  id: "event-split-measure-other",
                  chord: "C7",
                  duration: duration(4, 1),
                },
              ],
            },
          ],
        },
      ],
      "document-split-measure-two-bars",
    );
    const twoBarState = initialState(twoBars);
    const twoBarSnapshot = JSON.stringify(twoBarState);
    const otherMeasure = requirePlanRefusal(
      runAtomicEditPlan({
        state: twoBarState,
        command: command(
          twoBarState,
          splitMeasurePlan(twoBars, {
            beforeEventId: locateEvent(twoBars, "event-split-measure-other")
              .event.id,
          }),
          803,
        ),
        dependencies: dependencyHarness(
          factoryHarness(["foreign-must-not-allocate"]).factory,
        ).dependencies,
      }),
      "command.destination_invalid",
      "edit-plan.measure-split-boundary-invalid",
    );
    expectNoPublication(twoBarState, otherMeasure, twoBarSnapshot);

    // A boundary naming no event at all is a missing target instead.
    const absent = parseStableId("event", "event-split-measure-absent");
    if (!absent.ok) throw new Error("A0_U1_LAW_ABSENT_EVENT_ID");
    const missing = requirePlanRefusal(
      runAtomicEditPlan({
        state,
        command: command(
          state,
          splitMeasurePlan(document, { beforeEventId: absent.value }),
          804,
        ),
        dependencies: dependencyHarness(
          factoryHarness(["missing-must-not-allocate"]).factory,
        ).dependencies,
      }),
      "command.target_missing",
      "edit-plan.target-missing",
    );
    expect(missing.editPlanRefusal.path).toEqual(["plan", "beforeEventId"]);
    expectNoPublication(state, missing, snapshot);
  });

  test("split-measure refuses a partition that is not the exact sum", () => {
    const document = measurePairDocument("document-split-measure-partition");
    const state = initialState(document);
    const snapshot = JSON.stringify(state);
    const cases: readonly Readonly<{
      label: string;
      overrides: Parameters<typeof splitMeasurePlan>[1];
      path: readonly string[];
    }>[] = [
      {
        label: "retained side understated",
        overrides: { firstMeasureTotal: duration(1, 1) },
        path: ["plan", "firstMeasureTotal"],
      },
      {
        label: "moved side overstated",
        overrides: { secondMeasureTotal: duration(3, 1) },
        path: ["plan", "secondMeasureTotal"],
      },
      {
        label: "non-canonical retained total",
        overrides: {
          firstMeasureTotal: Object.freeze({
            numerator: 4,
            denominator: 2,
          }) as unknown as BeatDuration,
        },
        path: ["plan", "firstMeasureTotal"],
      },
    ];
    for (const [index, entry] of cases.entries()) {
      const factory = factoryHarness(["partition-must-not-allocate"]);
      const harness = dependencyHarness(factory.factory);
      const refusal = requirePlanRefusal(
        runAtomicEditPlan({
          state,
          command: command(
            state,
            splitMeasurePlan(document, entry.overrides),
            810 + index,
          ),
          dependencies: harness.dependencies,
        }),
        "command.payload_invalid",
        "edit-plan.measure-partition-mismatch",
      );
      expect(refusal.editPlanRefusal.path, entry.label).toEqual(entry.path);
      // The law runs before any identity work, so no ID is consumed and
      // neither publication stage is reached.
      expect(factory.calls, entry.label).toEqual([]);
      expect(harness.calls, entry.label).toEqual({ f2: 0, f3: 0 });
      expectNoPublication(state, refusal, snapshot);
    }
  });
});
