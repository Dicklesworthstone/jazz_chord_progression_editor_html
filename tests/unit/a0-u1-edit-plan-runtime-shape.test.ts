import { describe, expect, test } from "bun:test";

import { decodeAtomicEditPlanRuntimeShape } from "../../src/application/application-edit-plan-runtime-shape";

type MutableRecord = Record<string, unknown>;

const EMPTY_SHAPE_WORK = Object.freeze({
  planNodesVisited: 1,
  metadataFieldsCompared: 0,
  metadataCodePointsObserved: 0,
  peakPlanNodeRecords: 1,
});

function duration(numerator: number, denominator: number): MutableRecord {
  return { numerator, denominator };
}

function completeDeclaration(measureId: string): MutableRecord {
  return {
    measureId,
    completion: { kind: "complete" },
  };
}

function partialDeclaration(
  measureId: string,
  kind: "pickup" | "incomplete",
  reason: string,
): MutableRecord {
  return {
    measureId,
    completion: {
      kind,
      expectedDuration: duration(3, 1),
      reason,
    },
  };
}

function metadata(
  name: string,
  annotation: string,
  keyOverride: unknown = null,
  voiceLeadingBoundary: "continue" | "reset" = "continue",
): MutableRecord {
  return {
    name,
    annotation,
    keyOverride,
    voiceLeadingBoundary,
  };
}

function commandFor(plan: MutableRecord): MutableRecord {
  return {
    id: "command-unit-runtime-shape",
    label: "Independent runtime shape witness",
    expectedDocumentId: "document-unit-runtime-shape",
    expectedRevision: 4,
    logicalTimeMs: 12_345,
    coalescing: null,
    kind: "apply-edit-plan",
    plan,
  };
}

type CommandDataProjection = Readonly<{
  id: unknown;
  label: unknown;
  expectedDocumentId: unknown;
  expectedRevision: unknown;
  logicalTimeMs: unknown;
  coalescing: unknown;
  kind: unknown;
  plan: unknown;
}>;

function projectCommandData(command: object): CommandDataProjection {
  return {
    id: Reflect.get(command, "id"),
    label: Reflect.get(command, "label"),
    expectedDocumentId: Reflect.get(command, "expectedDocumentId"),
    expectedRevision: Reflect.get(command, "expectedRevision"),
    logicalTimeMs: Reflect.get(command, "logicalTimeMs"),
    coalescing: Reflect.get(command, "coalescing"),
    kind: Reflect.get(command, "kind"),
    plan: Reflect.get(command, "plan"),
  };
}

function commandLabel(command: object): string {
  const label: unknown = Reflect.get(command, "label");
  if (typeof label !== "string") {
    throw new Error("A0_U1_RUNTIME_SHAPE_TEST_LABEL");
  }
  return label;
}

function completeDraftInsertCommand(): MutableRecord {
  const sourceText = "| Cmaj7:4 |";
  return commandFor({
    kind: "insert-fragment",
    source: {
      kind: "complete-draft",
      quickEntrySnapshot: {
        sourceText,
        baseRevision: 4,
        target: { kind: "document-end" },
        issueCodes: ["chart.warning.unit"],
        expectedStatus: "ready",
        expectedLane: "complete-draft",
      },
      warningAcknowledgements: [
        {
          code: "chart.warning.unit",
          range: { start: 2, end: 7 },
        },
      ],
    },
    placement: {
      kind: "into-document",
      beforeSectionId: null,
      layoutDisposition: "preserve-named-sections",
      sectionDeclarations: [
        {
          sourceSectionOrdinal: 0,
          voiceLeadingBoundary: "reset",
        },
      ],
      completionDeclarations: [],
    },
    voicingPolicy: "a0-u1-balanced-4-48-84-generated@1",
  });
}

function recoveredChordInsertCommand(): MutableRecord {
  return commandFor({
    kind: "insert-fragment",
    source: {
      kind: "recovered-chord",
      quickEntrySnapshot: {
        sourceText: "C7 ???",
        baseRevision: 4,
        target: {
          kind: "before-event",
          eventId: "event-unit-insertion-anchor",
        },
        issueCodes: ["chart.invalid.unit"],
        expectedStatus: "invalid",
        expectedLane: "recovered-chord",
      },
      selectedGlobalOrdinal: 2,
      layoutLossAcknowledgement: "Unit acknowledgement",
      callerDuration: duration(1, 2),
    },
    placement: {
      kind: "into-measure",
      measureId: "measure-unit-recovery",
      beforeEventId: "event-unit-insertion-anchor",
      layoutDisposition: "insert-one-recovered-chord",
      completionDeclarations: [
        partialDeclaration(
          "measure-unit-recovery",
          "incomplete",
          "short",
        ),
      ],
    },
    voicingPolicy: "a0-u1-balanced-4-48-84-generated@1",
  });
}

function splitEventCommand(): MutableRecord {
  return commandFor({
    kind: "split-event-duration",
    eventId: "event-unit-split",
    firstDuration: duration(1, 2),
    secondDuration: duration(1, 2),
    completionDeclarations: [
      partialDeclaration("measure-unit-split", "pickup", "pickup"),
    ],
    identityPolicy: "retain-source-first-allocate-second",
    contentPolicy: "copy-exact-chord-and-voicing",
    annotationPolicy: "retain-source-first-clear-second",
  });
}

function joinEventsCommand(): MutableRecord {
  return commandFor({
    kind: "join-event-durations",
    leftEventId: "event-unit-join-left",
    rightEventId: "event-unit-join-right",
    joinedDuration: duration(1, 1),
    completionDeclarations: [
      completeDeclaration("measure-unit-join-events"),
    ],
    identityPolicy: "retain-left-remove-right",
    contentPolicy: "require-exact-chord-and-voicing",
    annotationPolicy: "require-right-empty-retain-left",
  });
}

function splitSectionCommand(): MutableRecord {
  return commandFor({
    kind: "split-section",
    sectionId: "section-unit-split",
    beforeMeasureId: "measure-unit-split-boundary",
    newSectionMetadata: metadata(
      "Bridge",
      "lift 🎷",
      {
        tonic: { step: "E", alter: -1 },
        mode: "natural-minor",
      },
      "reset",
    ),
    completionDeclarations: [],
    identityPolicy: "retain-source-prefix-allocate-suffix",
    measurePolicy: "move-suffix-preserve-identities",
  });
}

function joinSectionsCommand(): MutableRecord {
  return commandFor({
    kind: "join-sections",
    leftSectionId: "section-unit-join-left",
    rightSectionId: "section-unit-join-right",
    expectedLeftMetadata: metadata("Left", "α"),
    expectedRightMetadata: metadata("Right", "", null, "reset"),
    resultMetadata: metadata("Joined", "γδ"),
    completionDeclarations: [],
    identityPolicy: "retain-left-remove-right",
    measurePolicy: "left-then-right-preserve-identities",
    metadataPolicy: "compare-both-then-apply-explicit-result",
    internalBoundaryPolicy: "remove-right-entry-boundary-confirmed",
  });
}

function joinSectionsAtMetadataLimit(): MutableRecord {
  const command = joinSectionsCommand();
  const plan = recordProperty(command, "plan");
  for (const field of [
    "expectedLeftMetadata",
    "expectedRightMetadata",
    "resultMetadata",
  ]) {
    const sectionMetadata = recordProperty(plan, field);
    sectionMetadata["name"] = "N".repeat(256);
    sectionMetadata["annotation"] = "A".repeat(2_000);
  }
  return command;
}

function isMutableRecord(value: unknown): value is MutableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordProperty(
  owner: MutableRecord,
  key: string,
): MutableRecord {
  const value = owner[key];
  if (!isMutableRecord(value)) {
    throw new Error(`Expected ${key} to be a mutable record.`);
  }
  return value;
}

function expectRecursivelyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

function expectShapeRefusal(
  value: unknown,
  code:
    | "edit-plan.command-shape-invalid"
    | "edit-plan.plan-shape-invalid",
  path: readonly (string | number)[],
  metadataFieldsCompared = 0,
  metadataCodePointsObserved = 0,
): void {
  const result = decodeAtomicEditPlanRuntimeShape(value);
  expect(result).toEqual({
    ok: false,
    code,
    path,
    shapeWork: {
      planNodesVisited: 1,
      metadataFieldsCompared,
      metadataCodePointsObserved,
      peakPlanNodeRecords: 1,
    },
  });
  expectRecursivelyFrozen(result);
}

function decodeWithCharCodeAtBudget(
  value: unknown,
  budget: number,
): Readonly<{
  result: ReturnType<typeof decodeAtomicEditPlanRuntimeShape>;
  calls: number;
}> {
  const descriptor = Reflect.getOwnPropertyDescriptor(
    String.prototype,
    "charCodeAt",
  );
  if (descriptor === undefined) {
    throw new Error("A0_U1_RUNTIME_SHAPE_CHAR_CODE_DESCRIPTOR");
  }
  let calls = 0;
  Object.defineProperty(String.prototype, "charCodeAt", {
    ...descriptor,
    value(this: string, index: number): number {
      calls += 1;
      if (calls > budget) {
        throw new Error("A0_U1_RUNTIME_SHAPE_SCAN_BUDGET_EXCEEDED");
      }
      const codePoint = this.codePointAt(index);
      if (codePoint === undefined) return Number.NaN;
      return codePoint > 0xffff
        ? 0xd800 + ((codePoint - 0x10000) >> 10)
        : codePoint;
    },
  });
  try {
    return Object.freeze({
      result: decodeAtomicEditPlanRuntimeShape(value),
      calls,
    });
  } finally {
    Object.defineProperty(String.prototype, "charCodeAt", descriptor);
  }
}

describe("A0-U1 descriptor-safe runtime-shape decoding", () => {
  test("refuses revoked proxies at their exact frozen paths with zero downstream work", () => {
    const revokedRoot = Proxy.revocable(completeDraftInsertCommand(), {});
    revokedRoot.revoke();
    expectShapeRefusal(
      revokedRoot.proxy,
      "edit-plan.command-shape-invalid",
      [],
    );

    const revokedPlanCommand = completeDraftInsertCommand();
    const revokedPlan = Proxy.revocable(
      recordProperty(revokedPlanCommand, "plan"),
      {},
    );
    revokedPlan.revoke();
    revokedPlanCommand["plan"] = revokedPlan.proxy;
    expectShapeRefusal(
      revokedPlanCommand,
      "edit-plan.plan-shape-invalid",
      ["plan"],
    );

    const revokedCompletionCommand = splitEventCommand();
    const revokedCompletionPlan = recordProperty(
      revokedCompletionCommand,
      "plan",
    );
    const revokedCompletion = Proxy.revocable(
      revokedCompletionPlan["completionDeclarations"] as object,
      {},
    );
    revokedCompletion.revoke();
    revokedCompletionPlan["completionDeclarations"] = revokedCompletion.proxy;
    expectShapeRefusal(
      revokedCompletionCommand,
      "edit-plan.plan-shape-invalid",
      ["plan", "completionDeclarations"],
    );
  });

  test("accepts independently authored exact values for every plan lane", () => {
    const cases = [
      {
        name: "complete-draft insertion",
        command: completeDraftInsertCommand(),
        fields: 0,
        codePoints: 0,
      },
      {
        name: "recovered-chord insertion",
        command: recoveredChordInsertCommand(),
        fields: 0,
        codePoints: 5,
      },
      {
        name: "split event duration",
        command: splitEventCommand(),
        fields: 0,
        codePoints: 6,
      },
      {
        name: "join event durations",
        command: joinEventsCommand(),
        fields: 0,
        codePoints: 0,
      },
      {
        name: "split section",
        command: splitSectionCommand(),
        fields: 4,
        codePoints: 12,
      },
      {
        name: "join sections",
        command: joinSectionsCommand(),
        fields: 12,
        codePoints: 18,
      },
    ];

    for (const row of cases) {
      const inputPlan = row.command["plan"];
      const inputLabel = commandLabel(row.command);
      const inputProjection = projectCommandData(row.command);
      const result = decodeAtomicEditPlanRuntimeShape(row.command);

      expect(result.ok, row.name).toBe(true);
      if (!result.ok) throw new Error(`${row.name}: ${result.code}`);
      expect(projectCommandData(result.value), row.name).toEqual(
        inputProjection,
      );
      expect(result.value, row.name).not.toBe(row.command);
      expect(result.value.plan, row.name).not.toBe(inputPlan);
      expect(result.shapeWork, row.name).toEqual({
        planNodesVisited: 1,
        metadataFieldsCompared: row.fields,
        metadataCodePointsObserved: row.codePoints,
        peakPlanNodeRecords: 1,
      });
      expectRecursivelyFrozen(result);

      expect(Reflect.set(row.command, "label", "caller mutation")).toBe(true);
      expect(result.value.label).toBe(inputLabel);
    }
  });

  test("accepts null-prototype exact records but materializes plain frozen records", () => {
    const command = splitEventCommand();
    const plan = recordProperty(command, "plan");
    expect(Reflect.setPrototypeOf(plan, null)).toBe(true);

    const result = decodeAtomicEditPlanRuntimeShape(command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(Reflect.getPrototypeOf(result.value.plan)).toBe(Object.prototype);
    expect(result.shapeWork).toEqual({
      ...EMPTY_SHAPE_WORK,
      metadataCodePointsObserved: 6,
    });
    expectRecursivelyFrozen(result);
  });

  test("never invokes envelope or plan accessors", () => {
    const envelopeAccessor = splitEventCommand();
    let envelopeReads = 0;
    expect(Reflect.deleteProperty(envelopeAccessor, "id")).toBe(true);
    Object.defineProperty(envelopeAccessor, "id", {
      configurable: true,
      enumerable: true,
      get(): never {
        envelopeReads += 1;
        throw new Error("Envelope accessor must remain passive.");
      },
    });
    expectShapeRefusal(
      envelopeAccessor,
      "edit-plan.command-shape-invalid",
      ["id"],
    );
    expect(envelopeReads).toBe(0);

    const planAccessor = splitEventCommand();
    const plan = recordProperty(planAccessor, "plan");
    let planReads = 0;
    expect(Reflect.deleteProperty(plan, "kind")).toBe(true);
    Object.defineProperty(plan, "kind", {
      configurable: true,
      enumerable: true,
      get(): never {
        planReads += 1;
        throw new Error("Plan accessor must remain passive.");
      },
    });
    expectShapeRefusal(
      planAccessor,
      "edit-plan.plan-shape-invalid",
      ["plan", "kind"],
    );
    expect(planReads).toBe(0);
  });

  test("rejects inherited keys and custom prototypes", () => {
    const inheritedCommand = splitEventCommand();
    const inheritedPlan = recordProperty(inheritedCommand, "plan");
    expect(Reflect.deleteProperty(inheritedPlan, "annotationPolicy")).toBe(
      true,
    );
    expect(
      Reflect.setPrototypeOf(inheritedPlan, {
        annotationPolicy: "retain-source-first-clear-second",
      }),
    ).toBe(true);
    expectShapeRefusal(
      inheritedCommand,
      "edit-plan.plan-shape-invalid",
      ["plan"],
    );

    const customPrototypeCommand = splitEventCommand();
    const customPrototypePlan = recordProperty(
      customPrototypeCommand,
      "plan",
    );
    expect(
      Reflect.setPrototypeOf(customPrototypePlan, {
        unrelatedInheritedValue: true,
      }),
    ).toBe(true);
    expect(Object.hasOwn(customPrototypePlan, "annotationPolicy")).toBe(true);
    expectShapeRefusal(
      customPrototypeCommand,
      "edit-plan.plan-shape-invalid",
      ["plan"],
    );
  });

  test("enforces exact own enumerable string keys", () => {
    const symbolCommand = splitEventCommand();
    const symbolPlan = recordProperty(symbolCommand, "plan");
    expect(Reflect.set(symbolPlan, Symbol("unexpected"), true)).toBe(true);
    expectShapeRefusal(
      symbolCommand,
      "edit-plan.plan-shape-invalid",
      ["plan"],
    );

    const extraCommand = splitEventCommand();
    expect(
      Reflect.set(recordProperty(extraCommand, "plan"), "extra", true),
    ).toBe(true);
    expectShapeRefusal(
      extraCommand,
      "edit-plan.plan-shape-invalid",
      ["plan"],
    );

    const missingCommand = splitEventCommand();
    expect(
      Reflect.deleteProperty(
        recordProperty(missingCommand, "plan"),
        "annotationPolicy",
      ),
    ).toBe(true);
    expectShapeRefusal(
      missingCommand,
      "edit-plan.plan-shape-invalid",
      ["plan", "annotationPolicy"],
    );

    const nonEnumerableCommand = splitEventCommand();
    const nonEnumerablePlan = recordProperty(
      nonEnumerableCommand,
      "plan",
    );
    Object.defineProperty(nonEnumerablePlan, "eventId", {
      configurable: true,
      enumerable: false,
      value: "event-unit-split",
      writable: true,
    });
    expectShapeRefusal(
      nonEnumerableCommand,
      "edit-plan.plan-shape-invalid",
      ["plan", "eventId"],
    );
  });

  test("rejects sparse arrays and cycles at their first owned plan path", () => {
    const sparseCommand = splitEventCommand();
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(
      Reflect.set(
        recordProperty(sparseCommand, "plan"),
        "completionDeclarations",
        sparse,
      ),
    ).toBe(true);
    expectShapeRefusal(
      sparseCommand,
      "edit-plan.plan-shape-invalid",
      ["plan", "completionDeclarations", 0],
    );

    const cyclicCommand = splitEventCommand();
    const cyclicPlan = recordProperty(cyclicCommand, "plan");
    expect(Reflect.set(cyclicPlan, "firstDuration", cyclicPlan)).toBe(true);
    expectShapeRefusal(
      cyclicCommand,
      "edit-plan.plan-shape-invalid",
      ["plan", "firstDuration"],
    );
  });

  test("command shape wins before malformed plan values are examined", () => {
    const missingEnvelopeKey = splitEventCommand();
    expect(Reflect.deleteProperty(missingEnvelopeKey, "id")).toBe(true);
    expect(
      Reflect.set(
        recordProperty(missingEnvelopeKey, "plan"),
        "kind",
        "unknown-plan",
      ),
    ).toBe(true);
    expectShapeRefusal(
      missingEnvelopeKey,
      "edit-plan.command-shape-invalid",
      ["id"],
    );

    const extraEnvelopeKey = splitEventCommand();
    expect(Reflect.set(extraEnvelopeKey, "unexpected", true)).toBe(true);
    expect(
      Reflect.set(
        recordProperty(extraEnvelopeKey, "plan"),
        "eventId",
        42,
      ),
    ).toBe(true);
    expectShapeRefusal(
      extraEnvelopeKey,
      "edit-plan.command-shape-invalid",
      [],
    );

    const extraPlanKey = splitEventCommand();
    const plan = recordProperty(extraPlanKey, "plan");
    expect(Reflect.set(plan, "eventId", 42)).toBe(true);
    expect(Reflect.set(plan, "unexpected", true)).toBe(true);
    expectShapeRefusal(
      extraPlanKey,
      "edit-plan.plan-shape-invalid",
      ["plan"],
    );
  });

  test("accounts metadata and completion text only through the first refusal", () => {
    const invalidJoinMetadata = joinSectionsCommand();
    const joinPlan = recordProperty(invalidJoinMetadata, "plan");
    const rightMetadata = recordProperty(
      joinPlan,
      "expectedRightMetadata",
    );
    expect(Reflect.set(rightMetadata, "annotation", "\ud800")).toBe(true);
    expectShapeRefusal(
      invalidJoinMetadata,
      "edit-plan.plan-shape-invalid",
      ["plan", "expectedRightMetadata", "annotation"],
      6,
      11,
    );

    const invalidCompletionReason = splitSectionCommand();
    const splitPlan = recordProperty(invalidCompletionReason, "plan");
    expect(
      Reflect.set(splitPlan, "completionDeclarations", [
        partialDeclaration(
          "measure-unit-split-boundary",
          "incomplete",
          " ",
        ),
      ]),
    ).toBe(true);
    expectShapeRefusal(
      invalidCompletionReason,
      "edit-plan.plan-shape-invalid",
      [
        "plan",
        "completionDeclarations",
        0,
        "completion",
        "reason",
      ],
      4,
      13,
    );
  });

  test("stops hostile token and metadata strings at the first excess witness", () => {
    const tokenCommand = completeDraftInsertCommand();
    const tokenPlan = recordProperty(tokenCommand, "plan");
    const tokenSource = recordProperty(tokenPlan, "source");
    const tokenSnapshot = recordProperty(
      tokenSource,
      "quickEntrySnapshot",
    );
    tokenSnapshot["issueCodes"] = [
      "x".repeat(129) + "\ud800" + "tail".repeat(100_000),
    ];

    const tokenProbe = decodeWithCharCodeAtBudget(tokenCommand, 129);
    expect(tokenProbe.calls).toBe(129);
    expect(tokenProbe.result).toEqual({
      ok: false,
      code: "edit-plan.plan-shape-invalid",
      path: [
        "plan",
        "source",
        "quickEntrySnapshot",
        "issueCodes",
      ],
      shapeWork: EMPTY_SHAPE_WORK,
    });

    const metadataCommand = splitSectionCommand();
    const metadataPlan = recordProperty(metadataCommand, "plan");
    const sectionMetadata = recordProperty(
      metadataPlan,
      "newSectionMetadata",
    );
    sectionMetadata["name"] =
      "N".repeat(257) + "\ud800" + "tail".repeat(100_000);

    const metadataProbe = decodeWithCharCodeAtBudget(
      metadataCommand,
      257,
    );
    expect(metadataProbe.calls).toBe(257);
    expect(metadataProbe.result).toEqual({
      ok: false,
      code: "edit-plan.plan-shape-invalid",
      path: ["plan", "newSectionMetadata", "name"],
      shapeWork: {
        planNodesVisited: 1,
        metadataFieldsCompared: 1,
        metadataCodePointsObserved: 257,
        peakPlanNodeRecords: 1,
      },
      observed: 257,
      maximum: 256,
    });
    expectRecursivelyFrozen(tokenProbe.result);
    expectRecursivelyFrozen(metadataProbe.result);
  });

  test("fully validates the horizon tuple at 8,768 and refuses the 8,769 first excess", () => {
    const accepted = joinSectionsAtMetadataLimit();
    const acceptedProbe = decodeWithCharCodeAtBudget(accepted, 6_768);
    expect(acceptedProbe.calls).toBe(6_768);
    expect(acceptedProbe.result.ok).toBe(true);
    if (!acceptedProbe.result.ok) {
      throw new Error(acceptedProbe.result.code);
    }
    expect(acceptedProbe.result.shapeWork).toEqual({
      planNodesVisited: 1,
      metadataFieldsCompared: 12,
      metadataCodePointsObserved: 6_768,
      peakPlanNodeRecords: 1,
    });

    const horizonTuple = joinSectionsAtMetadataLimit();
    const horizonPlan = recordProperty(horizonTuple, "plan");
    horizonPlan["completionDeclarations"] = [
      partialDeclaration(
        "measure-unit-horizon-tuple",
        "incomplete",
        "R".repeat(2_000),
      ),
    ];
    const horizonProbe = decodeWithCharCodeAtBudget(horizonTuple, 8_768);
    expect(horizonProbe.calls).toBe(8_768);
    expect(horizonProbe.result.ok).toBe(true);
    if (!horizonProbe.result.ok) {
      throw new Error(horizonProbe.result.code);
    }
    expect(horizonProbe.result.shapeWork).toEqual({
      planNodesVisited: 1,
      metadataFieldsCompared: 12,
      metadataCodePointsObserved: 8_768,
      peakPlanNodeRecords: 1,
    });

    const firstExcess = joinSectionsAtMetadataLimit();
    const firstExcessPlan = recordProperty(firstExcess, "plan");
    firstExcessPlan["completionDeclarations"] = [
      partialDeclaration(
        "measure-unit-first-excess",
        "incomplete",
        "R".repeat(2_001),
      ),
    ];
    const firstExcessProbe = decodeWithCharCodeAtBudget(firstExcess, 8_769);
    expect(firstExcessProbe.calls).toBe(8_769);
    expect(firstExcessProbe.result).toEqual({
      ok: false,
      code: "edit-plan.plan-shape-invalid",
      path: [
        "plan",
        "completionDeclarations",
        0,
        "completion",
        "reason",
      ],
      shapeWork: {
        planNodesVisited: 1,
        metadataFieldsCompared: 12,
        metadataCodePointsObserved: 8_769,
        peakPlanNodeRecords: 1,
      },
      observed: 2_001,
      maximum: 2_000,
    });

    const grossCardinality = joinSectionsAtMetadataLimit();
    const grossPlan = recordProperty(grossCardinality, "plan");
    grossPlan["completionDeclarations"] = [
      partialDeclaration(
        "measure-unit-gross-a",
        "incomplete",
        "R".repeat(2_000),
      ),
      partialDeclaration(
        "measure-unit-gross-b",
        "incomplete",
        "R".repeat(2_000),
      ),
    ];
    const grossProbe = decodeWithCharCodeAtBudget(grossCardinality, 6_768);
    expect(grossProbe.calls).toBe(6_768);
    expect(grossProbe.result).toEqual({
      ok: false,
      code: "edit-plan.plan-shape-invalid",
      path: ["plan", "completionDeclarations"],
      shapeWork: {
        planNodesVisited: 1,
        metadataFieldsCompared: 12,
        metadataCodePointsObserved: 6_768,
        peakPlanNodeRecords: 1,
      },
    });

    expectRecursivelyFrozen(acceptedProbe.result);
    expectRecursivelyFrozen(horizonProbe.result);
    expectRecursivelyFrozen(firstExcessProbe.result);
    expectRecursivelyFrozen(grossProbe.result);
  });
});
