import { describe, expect, test } from "bun:test";

import {
  redoAtomicEditPlanHistory,
  runAtomicEditPlan,
  undoAtomicEditPlanHistory,
  validateDocumentSemantics,
  type AtomicEditPlanDependencies,
} from "../../src/application";
import type {
  AtomicEditPlanTransitionResult,
} from "../../src/application/application-edit-plan-contract";
import type {
  ApplicationEffect,
} from "../../src/application/application-state-contract";
import {
  A0_U1_IDS,
  A0_U1_JOIN_SECTION_METADATA,
  A0_U1_REPLAY_SCENARIO_IDS,
  A0_U1_SCENARIO_IDS,
  A0_U1_SECTION_A_METADATA,
  A0_U1_SPLIT_SECTION_METADATA,
  a0U1CanonicalValue,
  a0U1FlattenedEventDurations,
  a0U1FlattenedEventIds,
  createA0U1Scenario,
  requireA0U1Event,
  requireA0U1Measure,
  requireA0U1Section,
  type A0U1Scenario,
  type A0U1ScenarioId,
} from "../support/a0-u1-edit-plan-fixture";

type AtomicEditPlanSuccess = Extract<
  AtomicEditPlanTransitionResult,
  { ok: true }
>;
type AtomicEditPlanFailure = Extract<
  AtomicEditPlanTransitionResult,
  { ok: false }
>;

const EFFECT_KINDS = Object.freeze([
  "queue-recovery",
  "compile-playback-plan",
  "restore-focus",
  "announce",
] as const);

function expectedEffects(
  revision: number,
  reasonCode: string,
): readonly ApplicationEffect[] {
  return EFFECT_KINDS.map((kind) => ({
    kind,
    revision,
    requestId: null,
    reasonCode,
  }));
}

function durationProjection(
  duration:
    | Readonly<{ numerator: number; denominator: number }>
    | undefined,
): Readonly<{ numerator: number; denominator: number }> | null {
  return duration === undefined
    ? null
    : Object.freeze({
        numerator: duration.numerator,
        denominator: duration.denominator,
      });
}

function requireSuccess(
  result: AtomicEditPlanTransitionResult,
  id: A0U1ScenarioId,
): AtomicEditPlanSuccess {
  if (!result.ok) {
    throw new Error(
      `${id}:${result.refusal.code}:${result.editPlanRefusal?.code ?? "preplan"}`,
    );
  }
  return result;
}

function requireFailure(
  result: AtomicEditPlanTransitionResult,
  nestedCode:
    | "edit-plan.syntax-refused"
    | "edit-plan.id-factory-failed"
    | "edit-plan.structural-publication-refused"
    | "edit-plan.semantic-publication-refused",
): AtomicEditPlanFailure {
  if (result.ok) {
    throw new Error(`A0_U1_TEST_EXPECTED_REFUSAL:${nestedCode}`);
  }
  expect(result.editPlanRefusal?.code).toBe(nestedCode);
  expect(result.effects).toEqual([]);
  return result;
}

type DirectMalformedDependency =
  | "parseChartText"
  | "decodeDocumentShape"
  | "validateDocumentSemantics";

function withMalformedDirectDependency(
  dependencies: AtomicEditPlanDependencies,
  dependency: DirectMalformedDependency,
  returned: unknown,
): AtomicEditPlanDependencies {
  const malformed = { ...dependencies };
  Object.defineProperty(malformed, dependency, {
    configurable: true,
    enumerable: true,
    value: () => returned,
    writable: true,
  });
  return Object.freeze(malformed);
}

function withMalformedStableIdFactory(
  dependencies: AtomicEditPlanDependencies,
  returned: unknown,
): AtomicEditPlanDependencies {
  const stableIdFactory = { ...dependencies.stableIdFactory };
  Object.defineProperty(stableIdFactory, "next", {
    configurable: true,
    enumerable: true,
    value: () => returned,
    writable: true,
  });
  return Object.freeze({
    ...dependencies,
    stableIdFactory: Object.freeze(stableIdFactory),
  });
}

function withMalformedSemanticDependency(
  dependencies: AtomicEditPlanDependencies,
  implementation: (
    candidate: Parameters<
      AtomicEditPlanDependencies["validateDocumentSemantics"]
    >[0],
  ) => unknown,
): AtomicEditPlanDependencies {
  const malformed = { ...dependencies };
  Object.defineProperty(malformed, "validateDocumentSemantics", {
    configurable: true,
    enumerable: true,
    value: implementation,
    writable: true,
  });
  return Object.freeze(malformed);
}

type MalformedDependencyBoundary =
  | "T0"
  | "stable-ID"
  | "F2"
  | "F3";

function runMalformedDependencyBoundary(
  boundary: MalformedDependencyBoundary,
  returned: unknown,
): Readonly<{
  fixture: A0U1Scenario;
  result: AtomicEditPlanFailure;
}> {
  const fixture = createA0U1Scenario(
    boundary === "T0"
      ? "complete-draft-into-measure"
      : boundary === "stable-ID"
        ? "split-event-duration"
        : "join-event-durations",
  );
  const dependencies =
    boundary === "stable-ID"
      ? withMalformedStableIdFactory(fixture.dependencies, returned)
      : withMalformedDirectDependency(
          fixture.dependencies,
          boundary === "T0"
            ? "parseChartText"
            : boundary === "F2"
              ? "decodeDocumentShape"
              : "validateDocumentSemantics",
          returned,
        );
  const nestedCode =
    boundary === "T0"
      ? "edit-plan.syntax-refused"
      : boundary === "stable-ID"
        ? "edit-plan.id-factory-failed"
        : boundary === "F2"
          ? "edit-plan.structural-publication-refused"
          : "edit-plan.semantic-publication-refused";
  const result = requireFailure(
    runAtomicEditPlan({
      state: fixture.state,
      command: fixture.command,
      dependencies,
    }),
    nestedCode,
  );
  expect(result.state.document).toBe(fixture.state.document);
  return Object.freeze({ fixture, result });
}

function parseFixtureFragment(
  fixture: A0U1Scenario,
): ReturnType<AtomicEditPlanDependencies["parseChartText"]> {
  if (fixture.command.plan.kind !== "insert-fragment") {
    throw new Error("A0_U1_TEST_EXPECTED_INSERT_PLAN");
  }
  return fixture.dependencies.parseChartText(
    fixture.command.plan.source.quickEntrySnapshot.sourceText,
    Object.freeze({
      mode: "fragment",
      meter: fixture.state.document.meter,
    }),
    "ascii",
  );
}

function runScenario(id: A0U1ScenarioId): Readonly<{
  fixture: A0U1Scenario;
  result: AtomicEditPlanSuccess;
}> {
  const fixture = createA0U1Scenario(id);
  const result = requireSuccess(
    runAtomicEditPlan({
      state: fixture.state,
      command: fixture.command,
      dependencies: fixture.dependencies,
    }),
    id,
  );
  return { fixture, result };
}

function assertCommonSuccess(
  fixture: A0U1Scenario,
  result: AtomicEditPlanSuccess,
): void {
  const committedRevision = fixture.state.revision + 1;
  const receipt = result.editPlanReceipt;

  expect(result.outcome).toBe("committed");
  expect(result.state.document.id).toBe(fixture.state.document.id);
  expect(result.state.document).not.toBe(fixture.state.document);
  expect(result.state.revision).toBe(committedRevision);
  expect(result.effects).toEqual(
    expectedEffects(committedRevision, "document-command"),
  );
  expect(result.state.quickEntry).toEqual({
    text: "",
    target: result.state.bookmarks.insertion,
    baseRevision: committedRevision,
    status: "idle",
    issueCodes: [],
  });
  expect(result.state.focusRequest?.reason).toBe("command");

  expect(result.state.history.undo).toHaveLength(1);
  expect(result.state.history.redo).toHaveLength(0);
  expect(result.state.history.retainedBytesEstimate).toBe(4_096);
  const historyEntry = result.state.history.undo[0];
  expect(historyEntry).toBeDefined();
  expect(historyEntry?.commandId).toBe(fixture.command.id);
  expect(historyEntry?.commandKind).toBe("apply-edit-plan");
  expect(historyEntry?.coalescing).toBeNull();
  expect(historyEntry?.before).toBe(fixture.state.document);
  expect(historyEntry?.after).toBe(result.state.document);
  expect(historyEntry?.beforeBookmarks).toBe(fixture.state.bookmarks);
  expect(historyEntry?.afterBookmarks).toBe(result.state.bookmarks);
  expect(historyEntry?.retainedBytesEstimate).toBe(4_096);

  expect(receipt.schema).toBe(
    "changes.application.atomic-edit-plan-receipt.v2",
  );
  expect(receipt.commandKind).toBe("apply-edit-plan");
  expect(receipt.commandId).toBe(fixture.command.id);
  expect(receipt.documentId).toBe(fixture.state.document.id);
  expect(receipt.baseRevision).toBe(fixture.state.revision);
  expect(receipt.committedRevision).toBe(committedRevision);
  expect(receipt.quickEntryDisposition).toBe(
    "clear-to-idle-at-committed-revision",
  );
  expect(receipt.historyEntriesAppended).toBe(1);
  expect(receipt.effects).toEqual(EFFECT_KINDS);
  expect(receipt.allocatedIdentities.map((identity): string => identity.kind)).toEqual(
    [...fixture.expectedAllocationKinds],
  );
  expect(receipt.allocatedIdentities.map((identity): string => identity.id)).toEqual(
    [...fixture.expectedAllocatedWires],
  );
  expect(receipt.work.structuralDecodeCalls).toBe(1);
  expect(receipt.work.semanticValidationCalls).toBe(1);
  expect(receipt.work.termination).toBe("complete");

  const expectedParserCalls =
    fixture.command.plan.kind === "insert-fragment" ? 1 : 0;
  expect(fixture.calls).toEqual({
    parser: expectedParserCalls,
    structuralDecode: 1,
    semanticValidation: 1,
    historyEstimate: 1,
    idKinds: [...fixture.expectedAllocationKinds],
  });

  const independentlyRevalidated = validateDocumentSemantics(
    result.state.document,
  );
  expect(independentlyRevalidated.ok).toBe(true);
}

function requireAllocatedKind<
  Kind extends "section" | "measure" | "event",
>(
  result: AtomicEditPlanSuccess,
  index: number,
  kind: Kind,
): Extract<
  AtomicEditPlanSuccess["editPlanReceipt"]["allocatedIdentities"][number],
  { kind: Kind }
> {
  const identity = result.editPlanReceipt.allocatedIdentities[index];
  if (identity?.kind !== kind) {
    throw new Error(`A0_U1_TEST_ALLOCATION:${String(index)}:${kind}`);
  }
  return identity as Extract<typeof identity, { kind: Kind }>;
}

describe("A0/U1 atomic edit-plan runner success branches", () => {
  test("complete draft into an existing empty measure", () => {
    const { fixture, result } = runScenario(
      "complete-draft-into-measure",
    );
    assertCommonSuccess(fixture, result);

    const inserted = requireAllocatedKind(result, 0, "event");
    const measure = requireA0U1Measure(
      result.state.document,
      A0_U1_IDS.measureEmpty,
    );
    expect(measure.events.map((event) => event.id)).toEqual([inserted.id]);
    expect(measure.completion).toEqual({ kind: "complete" });
    expect(measure.events[0]).toMatchObject({
      duration: { numerator: 4, denominator: 1 },
      annotation: "",
      chord: { kind: "parsed", sourceText: "G7b9#5" },
      voicing: {
        mode: "auto",
        family: "balanced",
        voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: "generated",
      },
    });
    expect(inserted.source).toEqual({
      kind: "fragment-event",
      sourceEventOrdinal: 0,
    });
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "insert-fragment",
      insertLane: "complete-draft",
      placementKind: "into-measure",
      removedIdentities: [],
      survivorId: null,
      completionMeasureIds: [A0_U1_IDS.measureEmpty],
      timelineDisposition: "splice-source-order-at-declared-boundary",
      insertSource: {
        kind: "complete-draft",
        parserOutcome: "success",
        quickEntrySnapshotMatched: true,
        canonicalTargetMatched: true,
        acknowledgedWarningCount: 0,
      },
    });
  });

  test("complete draft into a section preserves implicit measure order", () => {
    const { fixture, result } = runScenario(
      "complete-draft-into-section",
    );
    assertCommonSuccess(fixture, result);

    const firstMeasure = requireAllocatedKind(result, 0, "measure");
    const firstEvent = requireAllocatedKind(result, 1, "event");
    const secondEvent = requireAllocatedKind(result, 2, "event");
    const secondMeasure = requireAllocatedKind(result, 3, "measure");
    const thirdEvent = requireAllocatedKind(result, 4, "event");
    const section = requireA0U1Section(
      result.state.document,
      A0_U1_IDS.sectionA,
    );
    expect(section.measures.map((measure) => measure.id)).toEqual([
      A0_U1_IDS.measureEmpty,
      firstMeasure.id,
      secondMeasure.id,
      A0_U1_IDS.measureAuto,
      A0_U1_IDS.measurePair,
      A0_U1_IDS.measureManual,
      A0_U1_IDS.measureFrozen,
    ]);
    expect(
      requireA0U1Measure(result.state.document, firstMeasure.id).events.map(
        (event) => [
          event.id,
          event.chord.sourceText,
          durationProjection(event.duration),
        ],
      ),
    ).toEqual([
      [firstEvent.id, "Dm7", { numerator: 2, denominator: 1 }],
      [secondEvent.id, "G7", { numerator: 2, denominator: 1 }],
    ]);
    expect(
      requireA0U1Measure(result.state.document, secondMeasure.id).events.map(
        (event) => [
          event.id,
          event.chord.sourceText,
          durationProjection(event.duration),
        ],
      ),
    ).toEqual([
      [thirdEvent.id, "Cmaj7", { numerator: 4, denominator: 1 }],
    ]);
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "insert-fragment",
      insertLane: "complete-draft",
      placementKind: "into-section",
      removedIdentities: [],
      survivorId: null,
      completionMeasureIds: [],
      timelineDisposition: "splice-source-order-at-declared-boundary",
    });
  });

  test("complete draft into a document preserves named section structure", () => {
    const { fixture, result } = runScenario(
      "complete-draft-into-document",
    );
    assertCommonSuccess(fixture, result);

    const coda = requireAllocatedKind(result, 0, "section");
    const codaMeasure = requireAllocatedKind(result, 1, "measure");
    const codaFirst = requireAllocatedKind(result, 2, "event");
    const codaSecond = requireAllocatedKind(result, 3, "event");
    const tag = requireAllocatedKind(result, 4, "section");
    const tagMeasure = requireAllocatedKind(result, 5, "measure");
    const tagEvent = requireAllocatedKind(result, 6, "event");

    expect(result.state.document.sections.map((section) => section.id)).toEqual([
      A0_U1_IDS.sectionA,
      coda.id,
      tag.id,
      A0_U1_IDS.sectionB,
    ]);
    expect(requireA0U1Section(result.state.document, coda.id)).toMatchObject({
      name: "Coda",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "continue",
      measures: [{ id: codaMeasure.id }],
    });
    expect(requireA0U1Section(result.state.document, tag.id)).toMatchObject({
      name: "Tag",
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "reset",
      measures: [{ id: tagMeasure.id }],
    });
    expect(
      requireA0U1Measure(result.state.document, codaMeasure.id).events.map(
        (event) => [event.id, event.chord.sourceText],
      ),
    ).toEqual([
      [codaFirst.id, "Fmaj7"],
      [codaSecond.id, "G7"],
    ]);
    expect(
      requireA0U1Measure(result.state.document, tagMeasure.id).events.map(
        (event) => [event.id, event.chord.sourceText],
      ),
    ).toEqual([[tagEvent.id, "Cmaj7"]]);
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "insert-fragment",
      insertLane: "complete-draft",
      placementKind: "into-document",
      removedIdentities: [],
      survivorId: null,
      completionMeasureIds: [],
      timelineDisposition: "splice-source-order-at-declared-boundary",
    });
  });

  test("one recovered chord inserts without altering its Frozen sibling", () => {
    const { fixture, result } = runScenario(
      "recovered-chord-into-measure",
    );
    const frozenBefore = requireA0U1Event(
      fixture.state.document,
      A0_U1_IDS.eventFrozen,
    );
    const frozenBeforeBytes = a0U1CanonicalValue(frozenBefore);
    assertCommonSuccess(fixture, result);

    const inserted = requireAllocatedKind(result, 0, "event");
    const measure = requireA0U1Measure(
      result.state.document,
      A0_U1_IDS.measureFrozen,
    );
    expect(measure.events.map((event) => event.id)).toEqual([
      A0_U1_IDS.eventFrozen,
      inserted.id,
    ]);
    expect(measure.completion).toEqual({ kind: "complete" });
    expect(a0U1CanonicalValue(measure.events[0])).toBe(frozenBeforeBytes);
    expect(measure.events[0]?.voicing.mode).toBe("frozen");
    expect(measure.events[1]).toMatchObject({
      duration: { numerator: 2, denominator: 1 },
      annotation: "",
      chord: { kind: "parsed", sourceText: "C" },
      voicing: {
        mode: "auto",
        family: "balanced",
        voiceCount: 4,
        range: { lowMidi: 48, highMidi: 84 },
        bassPolicy: "generated",
      },
    });
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "insert-fragment",
      insertLane: "recovered-chord",
      placementKind: "into-measure",
      removedIdentities: [],
      survivorId: null,
      completionMeasureIds: [A0_U1_IDS.measureFrozen],
      timelineDisposition:
        "insert-one-recovered-chord-at-declared-boundary",
      insertSource: {
        kind: "recovered-chord",
        parserOutcome: "failure",
        quickEntrySnapshotMatched: true,
        canonicalTargetMatched: true,
        selectedGlobalOrdinal: 1,
        selectedRange: { start: 6, end: 9 },
        durationSource: "t0-resolved",
        siblingsApplied: 0,
        layoutLossAcknowledged: true,
      },
    });
  });

  test("split event retains Manual pitches and allocates only the second ID", () => {
    const { fixture, result } = runScenario("split-event-duration");
    const sourceBefore = requireA0U1Event(
      fixture.state.document,
      A0_U1_IDS.eventManual,
    );
    const frozenBefore = a0U1CanonicalValue(
      requireA0U1Event(
        fixture.state.document,
        A0_U1_IDS.eventFrozen,
      ),
    );
    assertCommonSuccess(fixture, result);

    const secondIdentity = requireAllocatedKind(result, 0, "event");
    const measure = requireA0U1Measure(
      result.state.document,
      A0_U1_IDS.measureManual,
    );
    const first = measure.events[0];
    const second = measure.events[1];
    expect(measure.events.map((event) => event.id)).toEqual([
      A0_U1_IDS.eventManual,
      secondIdentity.id,
    ]);
    expect(durationProjection(first?.duration)).toEqual({
      numerator: 2,
      denominator: 1,
    });
    expect(durationProjection(second?.duration)).toEqual({
      numerator: 2,
      denominator: 1,
    });
    expect(first?.annotation).toBe(sourceBefore.annotation);
    expect(second?.annotation).toBe("");
    expect(first?.chord).toEqual(sourceBefore.chord);
    expect(second?.chord).toEqual(sourceBefore.chord);
    expect(first?.voicing).toEqual(sourceBefore.voicing);
    expect(second?.voicing).toEqual(sourceBefore.voicing);
    expect(first?.voicing.mode).toBe("manual");
    expect(second?.voicing.mode).toBe("manual");
    expect(
      a0U1CanonicalValue(
        requireA0U1Event(
          result.state.document,
          A0_U1_IDS.eventFrozen,
        ),
      ),
    ).toBe(frozenBefore);
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "split-event-duration",
      insertLane: null,
      placementKind: null,
      removedIdentities: [],
      survivorId: A0_U1_IDS.eventManual,
      insertSource: null,
      completionMeasureIds: [A0_U1_IDS.measureManual],
      timelineDisposition: "replace-one-span-with-two-exact-sum-spans",
    });
  });

  test("join event durations retains the left identity and removes the right", () => {
    const { fixture, result } = runScenario("join-event-durations");
    const leftBefore = requireA0U1Event(
      fixture.state.document,
      A0_U1_IDS.eventPairLeft,
    );
    assertCommonSuccess(fixture, result);

    const measure = requireA0U1Measure(
      result.state.document,
      A0_U1_IDS.measurePair,
    );
    expect(measure.events.map((event) => event.id)).toEqual([
      A0_U1_IDS.eventPairLeft,
    ]);
    expect(measure.events[0]).toMatchObject({
      id: A0_U1_IDS.eventPairLeft,
      duration: { numerator: 4, denominator: 1 },
      annotation: "left annotation survives",
    });
    expect(measure.events[0]?.chord).toEqual(leftBefore.chord);
    expect(measure.events[0]?.voicing).toEqual(leftBefore.voicing);
    expect(a0U1FlattenedEventIds(result.state.document)).not.toContain(
      A0_U1_IDS.eventPairRight,
    );
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "join-event-durations",
      insertLane: null,
      placementKind: null,
      allocatedIdentities: [],
      removedIdentities: [
        { kind: "event", id: A0_U1_IDS.eventPairRight },
      ],
      survivorId: A0_U1_IDS.eventPairLeft,
      insertSource: null,
      completionMeasureIds: [A0_U1_IDS.measurePair],
      timelineDisposition:
        "replace-two-equal-content-spans-with-one-exact-sum-span",
    });
  });

  test("split section moves the suffix while preserving measure/event identity", () => {
    const { fixture, result } = runScenario("split-section");
    const eventOrderBefore = a0U1FlattenedEventIds(fixture.state.document);
    const durationsBefore = a0U1FlattenedEventDurations(
      fixture.state.document,
    );
    assertCommonSuccess(fixture, result);

    const suffixIdentity = requireAllocatedKind(result, 0, "section");
    expect(result.state.document.sections.map((section) => section.id)).toEqual([
      A0_U1_IDS.sectionA,
      suffixIdentity.id,
      A0_U1_IDS.sectionB,
    ]);
    expect(
      requireA0U1Section(
        result.state.document,
        A0_U1_IDS.sectionA,
      ).measures.map((measure) => measure.id),
    ).toEqual([
      A0_U1_IDS.measureEmpty,
      A0_U1_IDS.measureAuto,
    ]);
    const suffix = requireA0U1Section(
      result.state.document,
      suffixIdentity.id,
    );
    expect({
      name: suffix.name,
      annotation: suffix.annotation,
      keyOverride: suffix.keyOverride,
      voiceLeadingBoundary: suffix.voiceLeadingBoundary,
    }).toEqual(A0_U1_SPLIT_SECTION_METADATA);
    expect(suffix.measures.map((measure) => measure.id)).toEqual([
      A0_U1_IDS.measurePair,
      A0_U1_IDS.measureManual,
      A0_U1_IDS.measureFrozen,
    ]);
    expect(a0U1FlattenedEventIds(result.state.document)).toEqual(
      eventOrderBefore,
    );
    expect(a0U1FlattenedEventDurations(result.state.document)).toEqual(
      durationsBefore,
    );
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "split-section",
      insertLane: null,
      placementKind: null,
      removedIdentities: [],
      survivorId: A0_U1_IDS.sectionA,
      insertSource: null,
      completionMeasureIds: [],
      timelineDisposition: "preserve-flattened-event-order-and-durations",
    });
  });

  test("join sections applies explicit metadata and preserves flattened content", () => {
    const { fixture, result } = runScenario("join-sections");
    const eventOrderBefore = a0U1FlattenedEventIds(fixture.state.document);
    const durationsBefore = a0U1FlattenedEventDurations(
      fixture.state.document,
    );
    const leftMeasureIds = requireA0U1Section(
      fixture.state.document,
      A0_U1_IDS.sectionA,
    ).measures.map((measure) => measure.id);
    const rightMeasureIds = requireA0U1Section(
      fixture.state.document,
      A0_U1_IDS.sectionB,
    ).measures.map((measure) => measure.id);
    assertCommonSuccess(fixture, result);

    expect(result.state.document.sections.map((section) => section.id)).toEqual([
      A0_U1_IDS.sectionA,
    ]);
    const joined = requireA0U1Section(
      result.state.document,
      A0_U1_IDS.sectionA,
    );
    expect({
      name: joined.name,
      annotation: joined.annotation,
      keyOverride: joined.keyOverride,
      voiceLeadingBoundary: joined.voiceLeadingBoundary,
    }).toEqual(A0_U1_JOIN_SECTION_METADATA);
    expect(joined.measures.map((measure) => measure.id)).toEqual([
      ...leftMeasureIds,
      ...rightMeasureIds,
    ]);
    expect(a0U1FlattenedEventIds(result.state.document)).toEqual(
      eventOrderBefore,
    );
    expect(a0U1FlattenedEventDurations(result.state.document)).toEqual(
      durationsBefore,
    );
    expect(result.editPlanReceipt).toMatchObject({
      planKind: "join-sections",
      insertLane: null,
      placementKind: null,
      allocatedIdentities: [],
      removedIdentities: [
        { kind: "section", id: A0_U1_IDS.sectionB },
      ],
      survivorId: A0_U1_IDS.sectionA,
      insertSource: null,
      completionMeasureIds: [],
      timelineDisposition: "preserve-flattened-event-order-and-durations",
    });
  });
});

describe("A0/U1 operation-level apply, undo, and redo trios", () => {
  for (const id of A0_U1_REPLAY_SCENARIO_IDS) {
    test(`${id} replays retained documents/bookmarks without rerunning operation dependencies`, () => {
      const { fixture, result: applied } = runScenario(id);
      assertCommonSuccess(fixture, applied);
      const callsAfterApply = {
        parser: fixture.calls.parser,
        structuralDecode: fixture.calls.structuralDecode,
        semanticValidation: fixture.calls.semanticValidation,
        historyEstimate: fixture.calls.historyEstimate,
        idKinds: [...fixture.calls.idKinds],
      };
      const retainedEntry = applied.state.history.undo[0];
      if (retainedEntry === undefined) {
        throw new Error(`${id}:apply:missing-history-entry`);
      }

      const undone = undoAtomicEditPlanHistory({ state: applied.state });
      if (!undone.ok) {
        throw new Error(`${id}:undo:${undone.refusal.code}`);
      }
      expect(undone.outcome).toBe("undone");
      expect(undone.state.revision).toBe(applied.state.revision + 1);
      expect(undone.state.document).toBe(fixture.state.document);
      expect(undone.state.bookmarks).toBe(fixture.state.bookmarks);
      expect(undone.state.history.undo).toHaveLength(0);
      expect(undone.state.history.redo).toEqual([retainedEntry]);
      expect(undone.state.history.retainedBytesEstimate).toBe(4_096);
      expect(undone.state.focusRequest?.reason).toBe("undo");
      expect(undone.effects).toEqual(
        expectedEffects(undone.state.revision, "undo"),
      );
      expect(fixture.calls).toEqual(callsAfterApply);

      const redone = redoAtomicEditPlanHistory({ state: undone.state });
      if (!redone.ok) {
        throw new Error(`${id}:redo:${redone.refusal.code}`);
      }
      expect(redone.outcome).toBe("redone");
      expect(redone.state.revision).toBe(undone.state.revision + 1);
      expect(redone.state.document).toBe(applied.state.document);
      expect(redone.state.bookmarks).toBe(applied.state.bookmarks);
      expect(redone.state.history.undo).toEqual([retainedEntry]);
      expect(redone.state.history.redo).toHaveLength(0);
      expect(redone.state.history.retainedBytesEstimate).toBe(4_096);
      expect(redone.state.focusRequest?.reason).toBe("redo");
      expect(redone.effects).toEqual(
        expectedEffects(redone.state.revision, "redo"),
      );
      expect(a0U1CanonicalValue(redone.state.document)).toBe(
        a0U1CanonicalValue(applied.state.document),
      );
      expect(fixture.calls).toEqual(callsAfterApply);
    });
  }
});

describe("A0/U1 dependency return boundaries are total", () => {
  for (const returned of [null, undefined] as const) {
    const label = returned === null ? "null" : "undefined";

    test(`refuses a ${label} T0 result without throwing`, () => {
      const fixture = createA0U1Scenario("complete-draft-into-measure");
      const result = requireFailure(
        runAtomicEditPlan({
          state: fixture.state,
          command: fixture.command,
          dependencies: withMalformedDirectDependency(
            fixture.dependencies,
            "parseChartText",
            returned,
          ),
        }),
        "edit-plan.syntax-refused",
      );
      expect(result.state.document).toBe(fixture.state.document);
      expect(result.editPlanRefusal?.work).toMatchObject({
        syntaxParseCalls: 1,
        idAllocationAttempts: 0,
        structuralDecodeCalls: 0,
        semanticValidationCalls: 0,
        termination: "input-refusal",
      });
    });

    test(`refuses a ${label} stable-ID result without throwing`, () => {
      const fixture = createA0U1Scenario("split-event-duration");
      const result = requireFailure(
        runAtomicEditPlan({
          state: fixture.state,
          command: fixture.command,
          dependencies: withMalformedStableIdFactory(
            fixture.dependencies,
            returned,
          ),
        }),
        "edit-plan.id-factory-failed",
      );
      expect(result.state.document).toBe(fixture.state.document);
      expect(result.editPlanRefusal?.work).toMatchObject({
        idAllocationAttempts: 1,
        idCollisionChecks: 0,
        structuralDecodeCalls: 0,
        semanticValidationCalls: 0,
        termination: "allocation-refusal",
      });
    });

    test(`refuses a ${label} F2 result without throwing`, () => {
      const fixture = createA0U1Scenario("join-event-durations");
      const result = requireFailure(
        runAtomicEditPlan({
          state: fixture.state,
          command: fixture.command,
          dependencies: withMalformedDirectDependency(
            fixture.dependencies,
            "decodeDocumentShape",
            returned,
          ),
        }),
        "edit-plan.structural-publication-refused",
      );
      expect(result.state.document).toBe(fixture.state.document);
      expect(result.editPlanRefusal?.work).toMatchObject({
        structuralDecodeCalls: 1,
        semanticValidationCalls: 0,
        termination: "publication-refusal",
      });
    });

    test(`refuses a ${label} F3 result without throwing`, () => {
      const fixture = createA0U1Scenario("join-event-durations");
      const result = requireFailure(
        runAtomicEditPlan({
          state: fixture.state,
          command: fixture.command,
          dependencies: withMalformedDirectDependency(
            fixture.dependencies,
            "validateDocumentSemantics",
            returned,
          ),
        }),
        "edit-plan.semantic-publication-refused",
      );
      expect(result.state.document).toBe(fixture.state.document);
      expect(result.editPlanRefusal?.work).toMatchObject({
        structuralDecodeCalls: 1,
        semanticValidationCalls: 1,
        termination: "publication-refusal",
      });
    });
  }

  for (const returned of [
    Object.freeze({ ok: true }),
    Object.freeze({ ok: false }),
  ] as const) {
    const branch = returned.ok ? "success" : "failure";
    for (const boundary of [
      "T0",
      "stable-ID",
      "F2",
      "F3",
    ] as const) {
      test(`refuses a ${boundary} ${branch} result missing its branch payload`, () => {
        runMalformedDependencyBoundary(boundary, returned);
      });
    }
  }

  test("refuses a stable-ID success with an undefined value", () => {
    const { result } = runMalformedDependencyBoundary(
      "stable-ID",
      Object.freeze({
        ok: true,
        value: undefined,
        source: "deterministic-test",
      }),
    );
    expect(result.editPlanRefusal?.work).toMatchObject({
      idAllocationAttempts: 1,
      idCollisionChecks: 0,
      structuralDecodeCalls: 0,
      semanticValidationCalls: 0,
      termination: "allocation-refusal",
    });
  });

  test("requires the T0 success canonical-text payload", () => {
    const fixture = createA0U1Scenario("complete-draft-into-measure");
    const parsed = parseFixtureFragment(fixture);
    if (!parsed.ok) {
      throw new Error("A0_U1_TEST_EXPECTED_PARSE_SUCCESS");
    }
    runMalformedDependencyBoundary(
      "T0",
      Object.freeze({
        ok: true,
        draft: parsed.draft,
        warnings: parsed.warnings,
      }),
    );
  });

  test("requires a T0 success draft to echo the requested source text", () => {
    const fixture = createA0U1Scenario("complete-draft-into-measure");
    const parsed = parseFixtureFragment(fixture);
    if (!parsed.ok) {
      throw new Error("A0_U1_TEST_EXPECTED_PARSE_SUCCESS");
    }
    runMalformedDependencyBoundary(
      "T0",
      Object.freeze({
        ok: true,
        draft: Object.freeze({
          ...parsed.draft,
          sourceText: "not-the-requested-source",
        }),
        canonicalText: parsed.canonicalText,
        warnings: parsed.warnings,
      }),
    );
  });

  test("requires a T0 failure to echo the requested source text", () => {
    runMalformedDependencyBoundary(
      "T0",
      Object.freeze({
        ok: false,
        sourceText: "not-the-requested-source",
        diagnostics: Object.freeze([
          Object.freeze({
            code: "chart.unexpected_token",
            range: Object.freeze({ start: 0, end: 1 }),
            message: "Malformed dependency result.",
          }),
        ]),
        insertableChords: Object.freeze([]),
      }),
    );
  });

  test("requires exact empty warnings on F2 and F3 success", () => {
    const fixture = createA0U1Scenario("join-event-durations");
    const withoutWarnings = Object.freeze({
      ok: true,
      value: fixture.state.document,
    });
    const structural = runMalformedDependencyBoundary(
      "F2",
      withoutWarnings,
    );
    expect(structural.result.editPlanRefusal?.work).toMatchObject({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 0,
      termination: "publication-refusal",
    });
    const semantic = runMalformedDependencyBoundary(
      "F3",
      withoutWarnings,
    );
    expect(semantic.result.editPlanRefusal?.work).toMatchObject({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 1,
      termination: "publication-refusal",
    });
  });

  test("does not invoke a nested T0 draft accessor", () => {
    const fixture = createA0U1Scenario("complete-draft-into-measure");
    const parsed = parseFixtureFragment(fixture);
    if (!parsed.ok) {
      throw new Error("A0_U1_TEST_EXPECTED_PARSE_SUCCESS");
    }
    let accessorReads = 0;
    const draft = Object.defineProperty(
      {},
      "sections",
      {
        enumerable: true,
        get: () => {
          accessorReads += 1;
          throw new Error("A0_U1_TEST_ACCESSOR_INVOKED");
        },
      },
    );
    const returned = Object.freeze({
      ok: true,
      draft,
      canonicalText: parsed.canonicalText,
      warnings: parsed.warnings,
    });
    runMalformedDependencyBoundary("T0", returned);
    expect(accessorReads).toBe(0);
  });

  test("does not invoke a nested T0 warning accessor", () => {
    const fixture = createA0U1Scenario("complete-draft-into-measure");
    const parsed = parseFixtureFragment(fixture);
    if (!parsed.ok) {
      throw new Error("A0_U1_TEST_EXPECTED_PARSE_SUCCESS");
    }
    let accessorReads = 0;
    const warning = Object.defineProperty(
      {
        range: Object.freeze({ start: 0, end: 1 }),
        message: "Malformed dependency result.",
      },
      "code",
      {
        enumerable: true,
        get: () => {
          accessorReads += 1;
          throw new Error("A0_U1_TEST_ACCESSOR_INVOKED");
        },
      },
    );
    const returned = Object.freeze({
      ok: true,
      draft: parsed.draft,
      canonicalText: parsed.canonicalText,
      warnings: Object.freeze([warning]),
    });
    runMalformedDependencyBoundary("T0", returned);
    expect(accessorReads).toBe(0);
  });

  test("does not descend into insertable rows for a complete-lane T0 failure", () => {
    const fixture = createA0U1Scenario("complete-draft-into-measure");
    if (fixture.command.plan.kind !== "insert-fragment") {
      throw new Error("A0_U1_TEST_EXPECTED_INSERT_PLAN");
    }
    let rowDescriptorReads = 0;
    const unreachableRow = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          rowDescriptorReads += 1;
          throw new Error("A0_U1_TEST_UNREACHED_COMPLETE_ROW");
        },
      },
    );
    const dependencies = withMalformedDirectDependency(
      fixture.dependencies,
      "parseChartText",
      Object.freeze({
        ok: false,
        sourceText:
          fixture.command.plan.source.quickEntrySnapshot.sourceText,
        diagnostics: Object.freeze([
          Object.freeze({
            code: "chart.unexpected_token",
            range: Object.freeze({ start: 0, end: 1 }),
            message: "Synthetic complete-lane refusal.",
          }),
        ]),
        insertableChords: Object.freeze([unreachableRow]),
      }),
    );
    const result = requireFailure(
      runAtomicEditPlan({
        state: fixture.state,
        command: fixture.command,
        dependencies,
      }),
      "edit-plan.syntax-refused",
    );
    expect(rowDescriptorReads).toBe(0);
    expect(result.editPlanRefusal?.work).toMatchObject({
      planNodesVisited: 1,
      insertableChordsExamined: 0,
      peakPlanNodeRecords: 1,
      termination: "input-refusal",
    });
  });

  test("stops T0 recovery capture at the selected ordinal and ignores a malformed suffix", () => {
    const fixture = createA0U1Scenario(
      "recovered-chord-into-measure",
    );
    const parsed = parseFixtureFragment(fixture);
    if (parsed.ok) {
      throw new Error("A0_U1_TEST_EXPECTED_PARSE_FAILURE");
    }
    const selected = parsed.insertableChords[0];
    if (selected?.ordinal !== 1) {
      throw new Error("A0_U1_TEST_EXPECTED_SELECTED_RECOVERY");
    }
    let suffixDescriptorReads = 0;
    const malformedSuffix = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          suffixDescriptorReads += 1;
          throw new Error("A0_U1_TEST_UNREACHED_SUFFIX");
        },
      },
    );
    const dependencies = withMalformedDirectDependency(
      fixture.dependencies,
      "parseChartText",
      Object.freeze({
        ok: false,
        sourceText: parsed.sourceText,
        diagnostics: parsed.diagnostics,
        insertableChords: Object.freeze([
          selected,
          malformedSuffix,
        ]),
      }),
    );
    const result = requireSuccess(
      runAtomicEditPlan({
        state: fixture.state,
        command: fixture.command,
        dependencies,
      }),
      "recovered-chord-into-measure",
    );
    expect(suffixDescriptorReads).toBe(0);
    expect(result.editPlanReceipt.work).toMatchObject({
      planNodesVisited: 2,
      insertableChordsExamined: 1,
      peakPlanNodeRecords: 3,
      termination: "complete",
    });
  });

  test("refuses an F3 success carrying a malformed document without throwing", () => {
    const { result } = runMalformedDependencyBoundary(
      "F3",
      Object.freeze({
        ok: true,
        value: Object.freeze({}),
        warnings: Object.freeze([]),
      }),
    );
    expect(result.editPlanRefusal?.work).toMatchObject({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 1,
      termination: "publication-refusal",
    });
  });

  test("refuses a structurally equal but mutable F3 publication", () => {
    const fixture = createA0U1Scenario("join-event-durations");
    const observed: { mutableClone: object | null } = {
      mutableClone: null,
    };
    const dependencies = withMalformedSemanticDependency(
      fixture.dependencies,
      (candidate) => {
        const legitimate =
          fixture.dependencies.validateDocumentSemantics(candidate);
        if (!legitimate.ok) return legitimate;
        observed.mutableClone = { ...legitimate.value };
        return Object.freeze({
          ok: true,
          value: observed.mutableClone,
          warnings: Object.freeze([]),
        });
      },
    );
    const result = requireFailure(
      runAtomicEditPlan({
        state: fixture.state,
        command: fixture.command,
        dependencies,
      }),
      "edit-plan.semantic-publication-refused",
    );
    const mutableClone = observed.mutableClone;
    if (mutableClone === null) {
      throw new Error("A0_U1_TEST_EXPECTED_MUTABLE_CLONE");
    }
    expect(Object.isFrozen(mutableClone)).toBe(false);
    expect(result.state.document).toBe(fixture.state.document);
    expect(result.editPlanRefusal?.work).toMatchObject({
      structuralDecodeCalls: 1,
      semanticValidationCalls: 1,
      termination: "publication-refusal",
    });
  });

  test("refuses a proxy result whose descriptors cannot be captured", () => {
    let ordinaryReads = 0;
    const returned = new Proxy(
      Object.freeze({ ok: true }),
      {
        get: () => {
          ordinaryReads += 1;
          throw new Error("A0_U1_TEST_PROXY_GET_INVOKED");
        },
        getOwnPropertyDescriptor: () => {
          throw new Error("A0_U1_TEST_PROXY_DESCRIPTOR_REFUSAL");
        },
      },
    );
    runMalformedDependencyBoundary("F3", returned);
    expect(ordinaryReads).toBe(0);
  });
});

test("the success matrix remains exactly the eight contract branches", () => {
  expect(A0_U1_SCENARIO_IDS).toEqual([
    "complete-draft-into-measure",
    "complete-draft-into-section",
    "complete-draft-into-document",
    "recovered-chord-into-measure",
    "split-event-duration",
    "join-event-durations",
    "split-section",
    "join-sections",
  ]);
  expect(A0_U1_SECTION_A_METADATA).toEqual({
    name: "Head",
    annotation: "Opening statement",
    keyOverride: null,
    voiceLeadingBoundary: "continue",
  });
});
