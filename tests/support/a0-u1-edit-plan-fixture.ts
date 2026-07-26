import {
  reduceEphemeralIntent,
  validateDocumentSemantics,
  type ApplyEditPlanCommand,
  type AtomicEditPlan,
  type AtomicEditPlanAppState,
  type AtomicEditPlanDependencies,
} from "../../src/application";
import {
  A0_U1_NEW_EVENT_POLICY_ID,
  A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
  type AtomicEditPlanBoundary,
  type AtomicEditPlanQuickEntrySnapshot,
  type AtomicEditPlanSectionMetadata,
} from "../../src/application/application-edit-plan-contract";
import {
  copyDomain,
  decodeDocumentShape,
  makeBeatDuration,
  type BeatDuration,
  type ChordEventId,
  type MeasureCompletion,
  type MeasureId,
  type SectionId,
  type StableIdFactory,
  type StableIdKind,
  type ValidatedDocument,
} from "../../src/domain";
import { parseChartText } from "../../src/theory";
import {
  a0Candidate,
  a0InitialState,
  a0StableId,
  a0StableIdFactory,
  publishA0Candidate,
} from "./a0-application-fixture";

export const A0_U1_SCENARIO_IDS = Object.freeze([
  "complete-draft-into-measure",
  "complete-draft-into-section",
  "complete-draft-into-document",
  "recovered-chord-into-measure",
  "split-event-duration",
  "join-event-durations",
  "split-section",
  "join-sections",
  "split-measure",
] as const);

export type A0U1ScenarioId = (typeof A0_U1_SCENARIO_IDS)[number];

export const A0_U1_REPLAY_SCENARIO_IDS = Object.freeze([
  "complete-draft-into-document",
  "split-event-duration",
  "join-event-durations",
  "split-section",
  "join-sections",
  "split-measure",
] as const satisfies readonly A0U1ScenarioId[]);

export const A0_U1_IDS = Object.freeze({
  document: a0StableId("document", "doc-a0-u1-runner"),
  sectionA: a0StableId("section", "section-a0-u1-a"),
  sectionB: a0StableId("section", "section-a0-u1-b"),
  measureEmpty: a0StableId("measure", "measure-a0-u1-empty"),
  measureAuto: a0StableId("measure", "measure-a0-u1-auto"),
  measurePair: a0StableId("measure", "measure-a0-u1-pair"),
  measureManual: a0StableId("measure", "measure-a0-u1-manual"),
  measureFrozen: a0StableId("measure", "measure-a0-u1-frozen"),
  measureB: a0StableId("measure", "measure-a0-u1-b"),
  eventAuto: a0StableId("event", "event-a0-u1-auto"),
  eventPairLeft: a0StableId("event", "event-a0-u1-pair-left"),
  eventPairRight: a0StableId("event", "event-a0-u1-pair-right"),
  eventManual: a0StableId("event", "event-a0-u1-manual"),
  eventFrozen: a0StableId("event", "event-a0-u1-frozen"),
  eventB: a0StableId("event", "event-a0-u1-b"),
});

export const A0_U1_SOURCES = Object.freeze({
  intoMeasure: "| G7b9#5:4 |",
  intoSection: "| Dm7:2 G7:2 |\n| Cmaj7:4 |",
  intoDocument:
    "[Coda]\n| Fmaj7:2 G7:2 |\n[Tag]\n| Cmaj7:4 |",
  recovered: "| ??? C:2 D:1 |",
});

export const A0_U1_SECTION_A_METADATA = Object.freeze({
  name: "Head",
  annotation: "Opening statement",
  keyOverride: null,
  voiceLeadingBoundary: "continue",
}) satisfies AtomicEditPlanSectionMetadata;

export const A0_U1_SECTION_B_METADATA = Object.freeze({
  name: "Bridge",
  annotation: "Contrasting middle",
  keyOverride: Object.freeze({
    tonic: Object.freeze({ step: "D", alter: 0 }),
    mode: "natural-minor",
  }),
  voiceLeadingBoundary: "reset",
}) satisfies AtomicEditPlanSectionMetadata;

export const A0_U1_SPLIT_SECTION_METADATA = Object.freeze({
  name: "Development",
  annotation: "Moved suffix",
  keyOverride: null,
  voiceLeadingBoundary: "reset",
}) satisfies AtomicEditPlanSectionMetadata;

export const A0_U1_JOIN_SECTION_METADATA = Object.freeze({
  name: "Head and Bridge",
  annotation: "Explicit joined result",
  keyOverride: Object.freeze({
    tonic: Object.freeze({ step: "G", alter: 0 }),
    mode: "major",
  }),
  voiceLeadingBoundary: "continue",
}) satisfies AtomicEditPlanSectionMetadata;

type FixtureRecord = Record<string, unknown>;

function fixtureRecord(value: unknown, label: string): FixtureRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`A0_U1_FIXTURE_RECORD:${label}`);
  }
  return value as FixtureRecord;
}

function fixtureArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`A0_U1_FIXTURE_ARRAY:${label}`);
  return value;
}

function exactDuration(numerator: number, denominator = 1): BeatDuration {
  const made = makeBeatDuration({ numerator, denominator });
  if (!made.ok) throw new Error("A0_U1_FIXTURE_DURATION");
  return made.value;
}

const TWO_BEATS = exactDuration(2);
const FOUR_BEATS = exactDuration(4);

/**
 * Splitting the two-beat pair measure at its second event leaves each side
 * holding two beats of a four-beat bar, so neither side may keep the source
 * measure's `complete` declaration. Both completions are caller-owned and
 * explicit; nothing is inferred and no beat moves.
 *
 * F3 reads `expectedDuration` as the measure's own exact event sum, which must
 * be positive and strictly short of the bar capacity — not as the capacity it
 * falls short of. Each half therefore declares two beats.
 */
export const A0_U1_SPLIT_MEASURE_RETAINED_COMPLETION = Object.freeze({
  kind: "incomplete",
  expectedDuration: TWO_BEATS,
  reason: "Retained half of the split bar",
}) satisfies MeasureCompletion;

export const A0_U1_SPLIT_MEASURE_SUFFIX_COMPLETION = Object.freeze({
  kind: "incomplete",
  expectedDuration: TWO_BEATS,
  reason: "Suffix half of the split bar",
}) satisfies MeasureCompletion;

function mixedDocumentCandidate(): FixtureRecord {
  const root = a0Candidate();
  const seedSection = fixtureRecord(
    fixtureArray(root["sections"], "sections")[0],
    "seed-section",
  );
  const seedMeasure = fixtureRecord(
    fixtureArray(seedSection["measures"], "measures")[0],
    "seed-measure",
  );
  const seedEvent = fixtureRecord(
    fixtureArray(seedMeasure["events"], "events")[0],
    "seed-event",
  );
  const autoChord = structuredClone(seedEvent["chord"]);
  const autoVoicing = structuredClone(seedEvent["voicing"]);

  const autoEvent = (
    id: string,
    duration: Readonly<{ numerator: number; denominator: number }>,
    annotation = "",
  ): FixtureRecord => ({
    id,
    duration,
    annotation,
    chord: structuredClone(autoChord),
    voicing: structuredClone(autoVoicing),
  });
  const measure = (
    id: string,
    events: readonly FixtureRecord[],
    completion: FixtureRecord,
  ): FixtureRecord => ({
    id,
    events: [...events],
    completion,
  });

  const manualEvent: FixtureRecord = {
    id: A0_U1_IDS.eventManual,
    duration: { numerator: 4, denominator: 1 },
    annotation: "manual source annotation",
    chord: {
      kind: "custom",
      sourceText: "C-Eb-G cluster",
      label: "Minor triad as custom",
      pitchNames: [
        { step: "C", alter: 0 },
        { step: "E", alter: -1 },
        { step: "G", alter: 0 },
      ],
      bass: null,
    },
    voicing: {
      mode: "manual",
      pitches: [
        { step: "C", alter: 0, octave: 4 },
        { step: "E", alter: -1, octave: 4 },
        { step: "G", alter: 0, octave: 4 },
      ],
      bassPolicy: "included",
    },
  };
  const frozenEvent: FixtureRecord = {
    id: A0_U1_IDS.eventFrozen,
    duration: { numerator: 2, denominator: 1 },
    annotation: "frozen source annotation",
    chord: {
      kind: "parsed",
      sourceText: "Cmaj7",
      root: { step: "C", alter: 0 },
      triad: "major",
      sixth: null,
      seventh: "major",
      extensions: [],
      additions: [],
      alterations: [],
      omissions: [],
      bass: null,
      colorPolicy: "none",
    },
    voicing: {
      mode: "frozen",
      pitches: [
        { step: "C", alter: 0, octave: 4 },
        { step: "E", alter: 0, octave: 4 },
        { step: "G", alter: 0, octave: 4 },
        { step: "B", alter: 0, octave: 4 },
      ],
      bassPolicy: "included",
      generatedBy: {
        engineVersion: "a0-u1-fixture-engine",
        family: "balanced",
      },
    },
  };

  root["id"] = A0_U1_IDS.document;
  root["title"] = "A0 U1 independent runner fixture";
  root["description"] =
    "Mixed Auto, Manual, and Frozen witnesses for atomic edit plans.";
  root["sections"] = [
    {
      id: A0_U1_IDS.sectionA,
      ...A0_U1_SECTION_A_METADATA,
      measures: [
        measure(
          A0_U1_IDS.measureEmpty,
          [],
          { kind: "empty" },
        ),
        measure(
          A0_U1_IDS.measureAuto,
          [
            autoEvent(
              A0_U1_IDS.eventAuto,
              { numerator: 4, denominator: 1 },
              "auto witness",
            ),
          ],
          { kind: "complete" },
        ),
        measure(
          A0_U1_IDS.measurePair,
          [
            autoEvent(
              A0_U1_IDS.eventPairLeft,
              { numerator: 2, denominator: 1 },
              "left annotation survives",
            ),
            autoEvent(
              A0_U1_IDS.eventPairRight,
              { numerator: 2, denominator: 1 },
            ),
          ],
          { kind: "complete" },
        ),
        measure(
          A0_U1_IDS.measureManual,
          [manualEvent],
          { kind: "complete" },
        ),
        measure(
          A0_U1_IDS.measureFrozen,
          [frozenEvent],
          {
            kind: "incomplete",
            expectedDuration: { numerator: 2, denominator: 1 },
            reason: "Two beats remain",
          },
        ),
      ],
    },
    {
      id: A0_U1_IDS.sectionB,
      ...A0_U1_SECTION_B_METADATA,
      measures: [
        measure(
          A0_U1_IDS.measureB,
          [
            autoEvent(
              A0_U1_IDS.eventB,
              { numerator: 4, denominator: 1 },
              "bridge witness",
            ),
          ],
          { kind: "complete" },
        ),
      ],
    },
  ];
  return root;
}

export function a0U1Document(): ValidatedDocument {
  return publishA0Candidate(mixedDocumentCandidate());
}

export type A0U1DependencyCalls = {
  parser: number;
  structuralDecode: number;
  semanticValidation: number;
  historyEstimate: number;
  idKinds: StableIdKind[];
};

export type A0U1Scenario = Readonly<{
  id: A0U1ScenarioId;
  state: AtomicEditPlanAppState;
  command: ApplyEditPlanCommand;
  dependencies: AtomicEditPlanDependencies;
  calls: A0U1DependencyCalls;
  expectedAllocationKinds: readonly StableIdKind[];
  expectedAllocatedWires: readonly string[];
}>;

function withQuickEntry(
  document: ValidatedDocument,
  sourceText: string,
  target: AtomicEditPlanBoundary,
  status: "ready" | "invalid",
  issueCodes: readonly string[],
): AtomicEditPlanAppState {
  const initial = a0InitialState(document);
  const reduced = reduceEphemeralIntent({
    state: initial,
    intent: {
      kind: "set-quick-entry",
      draft: {
        text: sourceText,
        target,
        baseRevision: initial.revision,
        status,
        issueCodes,
      },
    },
  });
  if (!reduced.ok) {
    throw new Error(`A0_U1_QUICK_ENTRY:${reduced.refusal.code}`);
  }
  return reduced.state;
}

function recordedDependencies(
  explicitWires: readonly string[],
): Readonly<{
  calls: A0U1DependencyCalls;
  dependencies: AtomicEditPlanDependencies;
}> {
  const calls: A0U1DependencyCalls = {
    parser: 0,
    structuralDecode: 0,
    semanticValidation: 0,
    historyEstimate: 0,
    idKinds: [],
  };
  const delegate = a0StableIdFactory(explicitWires);
  const stableIdFactory: StableIdFactory = {
    next: <Kind extends StableIdKind>(kind: Kind) => {
      calls.idKinds.push(kind);
      return delegate.next(kind);
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
      return 4_096;
    },
  });
  return { calls, dependencies };
}

function quickEntrySnapshot<
  Status extends "ready" | "invalid",
  Lane extends Status extends "ready"
    ? "complete-draft"
    : "recovered-chord",
>(
  state: AtomicEditPlanAppState,
  expectedStatus: Status,
  expectedLane: Lane,
): AtomicEditPlanQuickEntrySnapshot<Status, Lane> {
  const target = state.quickEntry.target;
  if (target === null) throw new Error("A0_U1_QUICK_ENTRY_TARGET");
  return Object.freeze({
    sourceText: state.quickEntry.text,
    baseRevision: state.quickEntry.baseRevision,
    target,
    issueCodes: Object.freeze([...state.quickEntry.issueCodes]),
    expectedStatus,
    expectedLane,
  });
}

function a0U1Envelope(
  state: AtomicEditPlanAppState,
  id: string,
  logicalTimeMs: number,
): Omit<ApplyEditPlanCommand, "kind" | "plan"> {
  return Object.freeze({
    id,
    label: id,
    expectedDocumentId: state.document.id,
    expectedRevision: state.revision,
    logicalTimeMs,
    coalescing: null,
  });
}

function scenarioPlan(
  id: A0U1ScenarioId,
  document: ValidatedDocument,
): Readonly<{
  state: AtomicEditPlanAppState;
  plan: AtomicEditPlan;
  allocationKinds: readonly StableIdKind[];
  allocatedWires: readonly string[];
}> {
  switch (id) {
    case "complete-draft-into-measure": {
      const state = withQuickEntry(
        document,
        A0_U1_SOURCES.intoMeasure,
        { kind: "measure-start", measureId: A0_U1_IDS.measureEmpty },
        "ready",
        [],
      );
      return {
        state,
        plan: {
          kind: "insert-fragment",
          source: {
            kind: "complete-draft",
            quickEntrySnapshot: quickEntrySnapshot(
              state,
              "ready",
              "complete-draft",
            ),
            warningAcknowledgements: [],
          },
          placement: {
            kind: "into-measure",
            measureId: A0_U1_IDS.measureEmpty,
            beforeEventId: null,
            layoutDisposition: "flatten-one-implicit-measure",
            completionDeclarations: [
              {
                measureId: A0_U1_IDS.measureEmpty,
                completion: { kind: "complete" },
              },
            ],
          },
          voicingPolicy: A0_U1_NEW_EVENT_POLICY_ID,
        },
        allocationKinds: ["event"],
        allocatedWires: ["event-a0-u1-insert-measure"],
      };
    }
    case "complete-draft-into-section": {
      const state = withQuickEntry(
        document,
        A0_U1_SOURCES.intoSection,
        { kind: "before-measure", measureId: A0_U1_IDS.measureAuto },
        "ready",
        [],
      );
      return {
        state,
        plan: {
          kind: "insert-fragment",
          source: {
            kind: "complete-draft",
            quickEntrySnapshot: quickEntrySnapshot(
              state,
              "ready",
              "complete-draft",
            ),
            warningAcknowledgements: [],
          },
          placement: {
            kind: "into-section",
            sectionId: A0_U1_IDS.sectionA,
            beforeMeasureId: A0_U1_IDS.measureAuto,
            layoutDisposition: "preserve-implicit-measures",
            completionDeclarations: [],
          },
          voicingPolicy: A0_U1_NEW_EVENT_POLICY_ID,
        },
        allocationKinds: ["measure", "event", "event", "measure", "event"],
        allocatedWires: [
          "measure-a0-u1-insert-section-1",
          "event-a0-u1-insert-section-1",
          "event-a0-u1-insert-section-2",
          "measure-a0-u1-insert-section-2",
          "event-a0-u1-insert-section-3",
        ],
      };
    }
    case "complete-draft-into-document": {
      const state = withQuickEntry(
        document,
        A0_U1_SOURCES.intoDocument,
        { kind: "before-section", sectionId: A0_U1_IDS.sectionB },
        "ready",
        [],
      );
      return {
        state,
        plan: {
          kind: "insert-fragment",
          source: {
            kind: "complete-draft",
            quickEntrySnapshot: quickEntrySnapshot(
              state,
              "ready",
              "complete-draft",
            ),
            warningAcknowledgements: [],
          },
          placement: {
            kind: "into-document",
            beforeSectionId: A0_U1_IDS.sectionB,
            layoutDisposition: "preserve-named-sections",
            sectionDeclarations: [
              {
                sourceSectionOrdinal: 0,
                voiceLeadingBoundary: "continue",
              },
              {
                sourceSectionOrdinal: 1,
                voiceLeadingBoundary: "reset",
              },
            ],
            completionDeclarations: [],
          },
          voicingPolicy: A0_U1_NEW_EVENT_POLICY_ID,
        },
        allocationKinds: [
          "section",
          "measure",
          "event",
          "event",
          "section",
          "measure",
          "event",
        ],
        allocatedWires: [
          "section-a0-u1-insert-document-coda",
          "measure-a0-u1-insert-document-coda",
          "event-a0-u1-insert-document-1",
          "event-a0-u1-insert-document-2",
          "section-a0-u1-insert-document-tag",
          "measure-a0-u1-insert-document-tag",
          "event-a0-u1-insert-document-3",
        ],
      };
    }
    case "recovered-chord-into-measure": {
      const state = withQuickEntry(
        document,
        A0_U1_SOURCES.recovered,
        { kind: "measure-end", measureId: A0_U1_IDS.measureFrozen },
        "invalid",
        ["symbol.root_invalid"],
      );
      return {
        state,
        plan: {
          kind: "insert-fragment",
          source: {
            kind: "recovered-chord",
            quickEntrySnapshot: quickEntrySnapshot(
              state,
              "invalid",
              "recovered-chord",
            ),
            selectedGlobalOrdinal: 1,
            layoutLossAcknowledgement:
              A0_U1_RECOVERED_CHORD_LAYOUT_LOSS_ACKNOWLEDGEMENT,
            callerDuration: null,
          },
          placement: {
            kind: "into-measure",
            measureId: A0_U1_IDS.measureFrozen,
            beforeEventId: null,
            layoutDisposition: "insert-one-recovered-chord",
            completionDeclarations: [
              {
                measureId: A0_U1_IDS.measureFrozen,
                completion: { kind: "complete" },
              },
            ],
          },
          voicingPolicy: A0_U1_NEW_EVENT_POLICY_ID,
        },
        allocationKinds: ["event"],
        allocatedWires: ["event-a0-u1-recovered"],
      };
    }
    case "split-event-duration": {
      const state = a0InitialState(document);
      return {
        state,
        plan: {
          kind: "split-event-duration",
          eventId: A0_U1_IDS.eventManual,
          firstDuration: TWO_BEATS,
          secondDuration: TWO_BEATS,
          completionDeclarations: [
            {
              measureId: A0_U1_IDS.measureManual,
              completion: { kind: "complete" },
            },
          ],
          identityPolicy: "retain-source-first-allocate-second",
          contentPolicy: "copy-exact-chord-and-voicing",
          annotationPolicy: "retain-source-first-clear-second",
        },
        allocationKinds: ["event"],
        allocatedWires: ["event-a0-u1-split-second"],
      };
    }
    case "join-event-durations": {
      const state = a0InitialState(document);
      return {
        state,
        plan: {
          kind: "join-event-durations",
          leftEventId: A0_U1_IDS.eventPairLeft,
          rightEventId: A0_U1_IDS.eventPairRight,
          joinedDuration: FOUR_BEATS,
          completionDeclarations: [
            {
              measureId: A0_U1_IDS.measurePair,
              completion: { kind: "complete" },
            },
          ],
          identityPolicy: "retain-left-remove-right",
          contentPolicy: "require-exact-chord-and-voicing",
          annotationPolicy: "require-right-empty-retain-left",
        },
        allocationKinds: [],
        allocatedWires: [],
      };
    }
    case "split-section": {
      const state = a0InitialState(document);
      return {
        state,
        plan: {
          kind: "split-section",
          sectionId: A0_U1_IDS.sectionA,
          beforeMeasureId: A0_U1_IDS.measurePair,
          newSectionMetadata: A0_U1_SPLIT_SECTION_METADATA,
          completionDeclarations: [],
          identityPolicy: "retain-source-prefix-allocate-suffix",
          measurePolicy: "move-suffix-preserve-identities",
        },
        allocationKinds: ["section"],
        allocatedWires: ["section-a0-u1-split-suffix"],
      };
    }
    case "split-measure": {
      const state = a0InitialState(document);
      return {
        state,
        plan: {
          kind: "split-measure",
          measureId: A0_U1_IDS.measurePair,
          beforeEventId: A0_U1_IDS.eventPairRight,
          firstMeasureTotal: TWO_BEATS,
          secondMeasureTotal: TWO_BEATS,
          newMeasureCompletion: A0_U1_SPLIT_MEASURE_SUFFIX_COMPLETION,
          completionDeclarations: [
            {
              measureId: A0_U1_IDS.measurePair,
              completion: A0_U1_SPLIT_MEASURE_RETAINED_COMPLETION,
            },
          ],
          identityPolicy: "retain-source-prefix-allocate-suffix",
          eventPolicy: "move-suffix-preserve-identities",
        },
        allocationKinds: ["measure"],
        allocatedWires: ["measure-a0-u1-split-suffix"],
      };
    }
    case "join-sections": {
      const state = a0InitialState(document);
      return {
        state,
        plan: {
          kind: "join-sections",
          leftSectionId: A0_U1_IDS.sectionA,
          rightSectionId: A0_U1_IDS.sectionB,
          expectedLeftMetadata: A0_U1_SECTION_A_METADATA,
          expectedRightMetadata: A0_U1_SECTION_B_METADATA,
          resultMetadata: A0_U1_JOIN_SECTION_METADATA,
          completionDeclarations: [],
          identityPolicy: "retain-left-remove-right",
          measurePolicy: "left-then-right-preserve-identities",
          metadataPolicy: "compare-both-then-apply-explicit-result",
          internalBoundaryPolicy:
            "remove-right-entry-boundary-confirmed",
        },
        allocationKinds: [],
        allocatedWires: [],
      };
    }
  }
}

export function createA0U1Scenario(id: A0U1ScenarioId): A0U1Scenario {
  const document = a0U1Document();
  const built = scenarioPlan(id, document);
  const recorded = recordedDependencies(built.allocatedWires);
  const command: ApplyEditPlanCommand = Object.freeze({
    ...a0U1Envelope(built.state, `a0-u1-${id}`, 1_000),
    kind: "apply-edit-plan",
    plan: built.plan,
  });
  return Object.freeze({
    id,
    state: built.state,
    command,
    dependencies: recorded.dependencies,
    calls: recorded.calls,
    expectedAllocationKinds: built.allocationKinds,
    expectedAllocatedWires: built.allocatedWires,
  });
}

export function requireA0U1Section(
  document: ValidatedDocument,
  id: SectionId,
): ValidatedDocument["sections"][number] {
  const section = document.sections.find((candidate) => candidate.id === id);
  if (section === undefined) throw new Error(`A0_U1_SECTION_MISSING:${id}`);
  return section;
}

export function requireA0U1Measure(
  document: ValidatedDocument,
  id: MeasureId,
): ValidatedDocument["sections"][number]["measures"][number] {
  for (const section of document.sections) {
    const measure = section.measures.find((candidate) => candidate.id === id);
    if (measure !== undefined) return measure;
  }
  throw new Error(`A0_U1_MEASURE_MISSING:${id}`);
}

export function requireA0U1Event(
  document: ValidatedDocument,
  id: ChordEventId,
): ValidatedDocument["sections"][number]["measures"][number]["events"][number] {
  for (const section of document.sections) {
    for (const measure of section.measures) {
      const event = measure.events.find((candidate) => candidate.id === id);
      if (event !== undefined) return event;
    }
  }
  throw new Error(`A0_U1_EVENT_MISSING:${id}`);
}

export function a0U1FlattenedEventIds(
  document: ValidatedDocument,
): readonly ChordEventId[] {
  return document.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => event.id),
    ),
  );
}

export function a0U1FlattenedEventDurations(
  document: ValidatedDocument,
): readonly Readonly<{ numerator: number; denominator: number }>[] {
  return document.sections.flatMap((section) =>
    section.measures.flatMap((measure) =>
      measure.events.map((event) => ({
        numerator: event.duration.numerator,
        denominator: event.duration.denominator,
      })),
    ),
  );
}

export function a0U1CanonicalValue(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (
      typeof candidate !== "object" ||
      candidate === null
    ) {
      return candidate;
    }
    return Object.fromEntries(
      Object.entries(candidate)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  };
  return JSON.stringify(normalize(value));
}
