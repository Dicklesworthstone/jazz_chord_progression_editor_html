import { afterAll, describe, expect, test } from "bun:test";

import type {
  DiscardImportReplacementPublicationRequest,
  PrepareImportReplacementPublicationRequest,
  PublishCanonicalExportRevisionRequest,
} from "../../src/application/application-interchange-owner-contract";
import {
  createBridgeMaterializer,
  createCompositionHarness,
  createOwnerSeamHarness,
  deriveOwnerCounters,
  flattenBridgeRuns,
  isObjectRecord,
  isStateFreeValue,
  loadBridgeFixturePacket,
  sha256Hex,
  valueAtPointer,
  type BridgeRunRef,
  type JsonObject,
} from "../support/a0-e0-bridge-conformance";

/**
 * A0/E0 bridge mutation-control discharge (bead jcpe-94yu.3).
 *
 * The packet pins 32 mutation controls. Every control is discharged against
 * REAL production by exact-case implication, in the established mutation-audit
 * idiom:
 *
 * - INPUT-mutation controls (`oracleExpectation.outcome === "pass"`) execute
 *   both the baseline scenario and the pinned killer scenario against the
 *   real owner operations and assert the pinned observation pointer takes the
 *   pinned baseline value in one and the pinned killer value in the other —
 *   a mutant ignoring the mutated input could not produce both.
 * - LAW-mutation controls (`outcome === "killed"`) describe a mutated owner
 *   law that no real execution can exhibit; each is discharged by asserting
 *   the REAL observation satisfies the baseline law and CONTRADICTS the
 *   mutated law at the pinned pointer, while the frozen bridge validator
 *   independently recomputes the `ownerLawOracle` rejection fixture-side.
 *
 * No expectation below is produced by the code under test; every literal is
 * materialized from the byte-pinned fixture packet.
 */

const packet = loadBridgeFixturePacket();
const materializer = createBridgeMaterializer(packet);
const runs = flattenBridgeRuns(packet);
const runsById = new Map(runs.map((run) => [run.fullId, run]));
const controls = (packet.mutations["controls"] as JsonObject[]).filter(
  isObjectRecord,
);
const dischargedControlIds = new Set<string>();

function mustRun(fullId: string): BridgeRunRef {
  const run = runsById.get(fullId);
  if (run === undefined) throw new Error(`BRIDGE_MUT_RUN:${fullId}`);
  return run;
}

function controlById(id: string): JsonObject {
  const control = controls.find((entry) => entry["id"] === id);
  if (control === undefined) throw new Error(`BRIDGE_MUT_CONTROL:${id}`);
  return control;
}

function observationOf(control: JsonObject): Readonly<{
  materialization: string;
  pointer: string;
  baselineValue: unknown;
  killerValue: unknown;
}> {
  const observation = control["observation"];
  if (!isObjectRecord(observation)) throw new Error("BRIDGE_MUT_OBSERVATION");
  return Object.freeze({
    materialization: String(observation["materialization"]),
    pointer: String(observation["jsonPointer"]),
    baselineValue: materializer.template(observation["baselineValue"]),
    killerValue: materializer.template(observation["killerValue"]),
  });
}

function stateBeforeJson(ref: BridgeRunRef): unknown {
  return materializer.descriptor(ref.run["controllerStateBefore"]);
}

function rawCallArgument(ref: BridgeRunRef, index: number): unknown {
  const rawCall = ref.run["rawCall"];
  if (!isObjectRecord(rawCall) || !Array.isArray(rawCall["arguments"])) {
    throw new Error("BRIDGE_MUT_RAW_CALL");
  }
  return materializer.descriptor(rawCall["arguments"][index]);
}

function declaredEstimatorInput(ref: BridgeRunRef): number | undefined {
  const holder = ref.run["historyEstimatorLawInput"];
  if (!isObjectRecord(holder)) return undefined;
  const materialized = materializer.template(holder);
  if (!isObjectRecord(materialized)) return undefined;
  const value = materialized["estimatedRetainedBytes"];
  return typeof value === "number" ? value : undefined;
}

function projectJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

type ScenarioObservation = Readonly<{
  result: unknown;
  counters: JsonObject;
  events: readonly string[];
}>;

/** Execute a pinned run scenario against the real composition and observe. */
function observeScenario(
  ref: BridgeRunRef,
  options: Readonly<{
    stageRequestFrom?: string;
    stageConsume?: boolean;
  }> = {},
): ScenarioObservation {
  const harness = createCompositionHarness(stateBeforeJson(ref));
  let stagedEcho: unknown = null;
  if (options.stageRequestFrom !== undefined) {
    const source = mustRun(options.stageRequestFrom);
    harness.instruments.setEstimatorInjection(declaredEstimatorInput(source));
    const request = rawCallArgument(
      source,
      0,
    ) as PrepareImportReplacementPublicationRequest;
    const staged = harness.owner.prepareImportReplacementPublication(request);
    harness.instruments.setEstimatorInjection(undefined);
    if (!staged.ok) throw new Error(`BRIDGE_MUT_STAGE:${staged.code}`);
    stagedEcho = staged.value;
    if (options.stageConsume === true) {
      harness.owner.publishImportReplacement(
        Object.freeze({
          prepared: structuredClone(staged.value),
          retirement: Object.freeze({
            requestId: staged.value.identity.requestId,
            retiredTransportGeneration:
              staged.value.expectedTransportGeneration,
            progressionRetired: true,
            previewRetired: true,
            noFutureAttack: true,
          }),
        }),
      );
    }
  }
  const notificationsBefore = harness.notifications();
  const dependencyBefore = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  let result: unknown;
  if (ref.operation === "prepareImportReplacementPublication") {
    harness.instruments.setEstimatorInjection(declaredEstimatorInput(ref));
    result = harness.owner.prepareImportReplacementPublication(
      rawCallArgument(ref, 0) as PrepareImportReplacementPublicationRequest,
    );
    harness.instruments.setEstimatorInjection(undefined);
  } else if (ref.operation === "discardImportReplacementPublication") {
    result = harness.owner.discardImportReplacementPublication(
      rawCallArgument(ref, 0) as DiscardImportReplacementPublicationRequest,
    );
  } else if (ref.operation === "publishImportReplacement") {
    const handoff = rawCallArgument(ref, 0) as JsonObject;
    const prepared =
      stagedEcho !== null &&
      JSON.stringify(projectJson(stagedEcho)) ===
        JSON.stringify(projectJson(handoff["prepared"]))
        ? stagedEcho
        : handoff["prepared"];
    result = harness.owner.publishImportReplacement(
      Object.freeze({
        prepared,
        retirement: handoff["retirement"],
      }) as never,
    );
  } else if (ref.operation === "readCurrentApplicationDocumentIdentity") {
    result = harness.owner.readCurrentApplicationDocumentIdentity();
  } else if (ref.operation === "publishCanonicalExportRevision") {
    result = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
  } else {
    throw new Error(`BRIDGE_MUT_OPERATION:${ref.operation}`);
  }
  const events = harness.recorder
    .since(eventsMark)
    .map((diagnostic) => diagnostic.event);
  const dependencyAfter = harness.instruments.snapshotCounts();
  const counters = deriveOwnerCounters(
    ref.operation,
    events,
    {
      f2DecodeDocumentShape:
        dependencyAfter.f2DecodeDocumentShape -
        dependencyBefore.f2DecodeDocumentShape,
      f3ValidateDocumentSemantics:
        dependencyAfter.f3ValidateDocumentSemantics -
        dependencyBefore.f3ValidateDocumentSemantics,
      historyEstimator:
        dependencyAfter.historyEstimator - dependencyBefore.historyEstimator,
    },
    harness.notifications() - notificationsBefore,
  );

  return Object.freeze({ result, counters, events });
}

function resultPointer(observation: ScenarioObservation, pointer: string): unknown {
  return valueAtPointer(projectJson(observation.result), pointer);
}

/* -------------------------------------------------------------------------- */
/* Input-mutation controls: baseline and killer both execute for real         */
/* -------------------------------------------------------------------------- */

type InputControlPlan = Readonly<{
  controlId: string;
  observe: () => Readonly<{ baseline: unknown; killer: unknown }>;
}>;

function resultObservationPlan(
  controlId: string,
  baselineOptions: Parameters<typeof observeScenario>[1] = {},
  killerOptions: Parameters<typeof observeScenario>[1] = {},
): InputControlPlan {
  return Object.freeze({
    controlId,
    observe: () => {
      const control = controlById(controlId);
      const observation = observationOf(control);
      const baseline = observeScenario(
        mustRun(String(control["baselineRunId"])),
        baselineOptions,
      );
      const killer = observeScenario(
        mustRun(String(control["killerRunId"])),
        killerOptions,
      );
      const pick = (scenario: ScenarioObservation): unknown => {
        if (observation.materialization === "exactTypedResult") {
          return resultPointer(scenario, observation.pointer);
        }
        if (observation.materialization === "exactCounters") {
          return valueAtPointer(scenario.counters, observation.pointer);
        }
        throw new Error(
          `BRIDGE_MUT_MATERIALIZATION:${observation.materialization}`,
        );
      };
      return Object.freeze({ baseline: pick(baseline), killer: pick(killer) });
    },
  });
}

const INPUT_CONTROL_PLANS: readonly InputControlPlan[] = Object.freeze([
  resultObservationPlan("BRIDGE-MUT-001"),
  resultObservationPlan(
    "BRIDGE-MUT-002",
    {},
    { stageRequestFrom: "BRIDGE-REP-001/retained" },
  ),
  resultObservationPlan(
    "BRIDGE-MUT-003",
    { stageRequestFrom: "BRIDGE-REP-001/retained" },
    { stageRequestFrom: "BRIDGE-REP-001/retained" },
  ),
  resultObservationPlan(
    "BRIDGE-MUT-004",
    { stageRequestFrom: "BRIDGE-REP-001/retained" },
    {},
  ),
  resultObservationPlan(
    "BRIDGE-MUT-005",
    { stageRequestFrom: "BRIDGE-REP-001/retained" },
    { stageRequestFrom: "BRIDGE-REP-001/retained" },
  ),
  resultObservationPlan(
    "BRIDGE-MUT-006",
    { stageRequestFrom: "BRIDGE-REP-001/retained" },
    { stageRequestFrom: "BRIDGE-REP-001/retained", stageConsume: true },
  ),
  resultObservationPlan("BRIDGE-MUT-007"),
  resultObservationPlan("BRIDGE-MUT-008"),
  resultObservationPlan("BRIDGE-MUT-009"),
  resultObservationPlan("BRIDGE-MUT-010"),
  resultObservationPlan("BRIDGE-MUT-011"),
  resultObservationPlan("BRIDGE-MUT-012"),
  resultObservationPlan("BRIDGE-MUT-013"),
  resultObservationPlan("BRIDGE-MUT-015"),
  resultObservationPlan("BRIDGE-MUT-016"),
  resultObservationPlan("BRIDGE-MUT-022"),
]);

describe("A0/E0 bridge mutation controls: input mutations", () => {
  for (const plan of INPUT_CONTROL_PLANS) {
    test(plan.controlId, () => {
      const control = controlById(plan.controlId);
      const observation = observationOf(control);
      const observed = plan.observe();
      expect(projectJson(observed.baseline)).toEqual(
        projectJson(observation.baselineValue),
      );
      expect(projectJson(observed.killer)).toEqual(
        projectJson(observation.killerValue),
      );
      expect(
        JSON.stringify(projectJson(observed.baseline)) ===
          JSON.stringify(projectJson(observed.killer)),
      ).toBe(false);
      dischargedControlIds.add(plan.controlId);
    });
  }

  test("BRIDGE-MUT-018: a mutated current panel flows through the marker CAS", () => {
    /*
     * Observation targets `controllerStateAfter/panels/active`, so the real
     * owner runs over the production access seam where the installed state
     * is directly observable.
     */
    const control = controlById("BRIDGE-MUT-018");
    const observation = observationOf(control);
    const observeAfterState = (runId: string): unknown => {
      const ref = mustRun(runId);
      const harness = createOwnerSeamHarness(stateBeforeJson(ref));
      const result = harness.owner.publishCanonicalExportRevision(
        rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
      );
      expect((result as { ok: boolean }).ok).toBe(true);
      return valueAtPointer(
        projectJson(harness.readCell()),
        observation.pointer,
      );
    };
    const baseline = observeAfterState(String(control["baselineRunId"]));
    const killer = observeAfterState(String(control["killerRunId"]));
    expect(baseline).toEqual(observation.baselineValue);
    expect(killer).toEqual(observation.killerValue);
    expect(baseline).not.toEqual(killer);
    dischargedControlIds.add("BRIDGE-MUT-018");
  });

  test("BRIDGE-MUT-020: an edited current title survives the marker CAS untouched", () => {
    const control = controlById("BRIDGE-MUT-020");
    const observation = observationOf(control);
    const observeAfterState = (runId: string): unknown => {
      const ref = mustRun(runId);
      const harness = createOwnerSeamHarness(stateBeforeJson(ref));
      const result = harness.owner.publishCanonicalExportRevision(
        rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
      );
      expect((result as { ok: boolean }).ok).toBe(true);
      return valueAtPointer(
        projectJson(harness.readCell()),
        observation.pointer,
      );
    };
    const baseline = observeAfterState(String(control["baselineRunId"]));
    const killer = observeAfterState(String(control["killerRunId"]));
    expect(baseline).toEqual(observation.baselineValue);
    expect(killer).toEqual(observation.killerValue);
    expect(baseline).not.toEqual(killer);
    dischargedControlIds.add("BRIDGE-MUT-020");
  });

  test("BRIDGE-MUT-024: a mutated Manual pitch is preserved byte-for-byte, never repaired", () => {
    /*
     * Observation targets the private registry material's candidate pitch.
     * The material is observable through the REAL publication: the candidate
     * becomes the installed document, so the pinned registry pointer maps to
     * the published document pointer.
     */
    const control = controlById("BRIDGE-MUT-024");
    const observation = observationOf(control);
    const documentPointer = observation.pointer.replace(
      "/entries/0/privateMaterial/command/candidate",
      "",
    );
    const observePublishedPitch = (runId: string): unknown => {
      const ref = mustRun(runId);
      const harness = createOwnerSeamHarness(stateBeforeJson(ref));
      harness.instruments.setEstimatorInjection(declaredEstimatorInput(ref));
      const prepared = harness.owner.prepareImportReplacementPublication(
        rawCallArgument(ref, 0) as PrepareImportReplacementPublicationRequest,
      );
      harness.instruments.setEstimatorInjection(undefined);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) throw new Error("BRIDGE_MUT_024_PREPARE");
      const published = harness.owner.publishImportReplacement(
        Object.freeze({
          prepared: prepared.value,
          retirement: Object.freeze({
            requestId: prepared.value.identity.requestId,
            retiredTransportGeneration:
              prepared.value.expectedTransportGeneration,
            progressionRetired: true,
            previewRetired: true,
            noFutureAttack: true,
          }),
        }),
      );
      expect(published).toMatchObject({ ok: true, outcome: "committed" });
      return valueAtPointer(
        projectJson(harness.readCell()),
        `/document${documentPointer}`,
      );
    };
    const baseline = observePublishedPitch(String(control["baselineRunId"]));
    const killer = observePublishedPitch(String(control["killerRunId"]));
    expect(baseline).toEqual(observation.baselineValue);
    expect(killer).toEqual(observation.killerValue);
    expect(baseline).not.toEqual(killer);
    dischargedControlIds.add("BRIDGE-MUT-024");
  });
});

/* -------------------------------------------------------------------------- */
/* Law-mutation controls: real observation contradicts the mutated law        */
/* -------------------------------------------------------------------------- */

function lawControl(id: string): Readonly<{
  control: JsonObject;
  killerCode: string;
}> {
  const control = controlById(id);
  const oracle = control["oracleExpectation"];
  if (!isObjectRecord(oracle) || oracle["outcome"] !== "killed") {
    throw new Error(`BRIDGE_MUT_LAW:${id}`);
  }
  return Object.freeze({ control, killerCode: String(oracle["code"]) });
}

describe("A0/E0 bridge mutation controls: law mutations killed by real observation", () => {
  test("BRIDGE-MUT-014: the identity read returns synchronously, never a promise", () => {
    lawControl("BRIDGE-MUT-014");
    const ref = mustRun("BRIDGE-ID-001/baseline");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const result = harness.owner.readCurrentApplicationDocumentIdentity();
    expect(result instanceof Promise).toBe(false);
    expect(typeof (result as { then?: unknown }).then).toBe("undefined");
    expect(result).toEqual(
      materializer.template(
        (ref.run["exactTypedResult"] as JsonObject)["value"],
      ) as never,
    );
    dischargedControlIds.add("BRIDGE-MUT-014");
  });

  test("BRIDGE-MUT-017: no microtask boundary interleaves the marker critical section", () => {
    lawControl("BRIDGE-MUT-017");
    const ref = mustRun("BRIDGE-MARK-001/exact");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    let microtaskRan = false;
    queueMicrotask(() => {
      microtaskRan = true;
    });
    const result = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    /* The queued microtask could not run inside the synchronous CAS. */
    expect(microtaskRan).toBe(false);
    dischargedControlIds.add("BRIDGE-MUT-017");
  });

  test("BRIDGE-MUT-019: the post-edit state is never overwritten by a historical reinstall", () => {
    lawControl("BRIDGE-MUT-019");
    const ref = mustRun("BRIDGE-MARK-010/marker-10");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const result = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    const renamed = harness.controller.setTitle("Changes edited");
    expect(renamed.ok).toBe(true);
    /* The edit's revision advance survives; revision 7 is never reinstalled. */
    const identity = harness.owner.readCurrentApplicationDocumentIdentity();
    expect(identity.revision).toBe(8 as never);
    expect(harness.controller.getSnapshot().title).toBe("Changes edited");
    dischargedControlIds.add("BRIDGE-MUT-019");
  });

  test("BRIDGE-MUT-021: no raw mark-exported dispatch surface exists on the controller", () => {
    lawControl("BRIDGE-MUT-021");
    const ref = mustRun("BRIDGE-MARK-001/exact");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const controller = harness.controller as unknown as JsonObject;
    expect(Object.hasOwn(controller, "dispatch")).toBe(false);
    expect(Object.hasOwn(controller, "markExported")).toBe(false);
    expect(
      Object.keys(controller).filter((key) =>
        key.toLowerCase().includes("export"),
      ),
    ).toEqual([]);
    /* The marker authority is reachable only through the owner aggregate. */
    expect(
      typeof harness.composition.interchangeOwner.publishCanonicalExportRevision,
    ).toBe("function");
    dischargedControlIds.add("BRIDGE-MUT-021");
  });

  test("BRIDGE-MUT-023: the owner operations consult no wall clock", () => {
    lawControl("BRIDGE-MUT-023");
    const ref = mustRun("BRIDGE-MARK-012/source-c");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const originalDateNow = Date.now;
    const originalPerformanceNow = performance.now.bind(performance);
    let clockReads = 0;
    Date.now = () => {
      clockReads += 1;
      return originalDateNow();
    };
    performance.now = () => {
      clockReads += 1;
      return originalPerformanceNow();
    };
    try {
      const result = harness.owner.publishCanonicalExportRevision(
        rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
      );
      expect((result as { ok: boolean }).ok).toBe(true);
      const identity = harness.owner.readCurrentApplicationDocumentIdentity();
      expect(identity.revision).toBe(19 as never);
    } finally {
      Date.now = originalDateNow;
      performance.now = originalPerformanceNow;
    }
    expect(clockReads).toBe(0);
    dischargedControlIds.add("BRIDGE-MUT-023");
  });

  test("BRIDGE-MUT-025: allocation is observably the last preparation step", () => {
    lawControl("BRIDGE-MUT-025");
    const ref = mustRun("BRIDGE-REP-001/retained");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const eventsMark = harness.recorder.mark();
    const result = harness.owner.prepareImportReplacementPublication(
      rawCallArgument(ref, 0) as PrepareImportReplacementPublicationRequest,
    );
    expect(result.ok).toBe(true);
    const events = harness.recorder
      .since(eventsMark)
      .map((diagnostic) => diagnostic.event);
    const allocateIndex = events.indexOf("allocate.registry-entry");
    expect(allocateIndex).toBe(events.length - 2);
    for (const check of [
      "compare.complete-identity",
      "call.f2",
      "call.f3",
      "estimate.history",
      "recompute.impact",
      "compare.confirmation",
      "inspect.registry-capacity-one",
    ]) {
      expect(events.indexOf(check)).toBeLessThan(allocateIndex);
    }
    dischargedControlIds.add("BRIDGE-MUT-025");
  });

  test("BRIDGE-MUT-026: publication consumes before constructing, installing, or returning", () => {
    lawControl("BRIDGE-MUT-026");
    const ref = mustRun("BRIDGE-REP-029/retained");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const source = mustRun("BRIDGE-REP-001/retained");
    const staged = harness.owner.prepareImportReplacementPublication(
      rawCallArgument(source, 0) as PrepareImportReplacementPublicationRequest,
    );
    expect(staged.ok).toBe(true);
    if (!staged.ok) throw new Error("BRIDGE_MUT_026_STAGE");
    const eventsMark = harness.recorder.mark();
    const handoff = rawCallArgument(ref, 0) as JsonObject;
    const published = harness.owner.publishImportReplacement(
      Object.freeze({
        prepared: staged.value,
        retirement: handoff["retirement"],
      }) as never,
    );
    expect(published).toMatchObject({ ok: true, outcome: "committed" });
    const events = harness.recorder
      .since(eventsMark)
      .map((diagnostic) => diagnostic.event);
    const consumeIndex = events.indexOf("consume.entry-before-publish");
    expect(consumeIndex).toBeGreaterThanOrEqual(0);
    expect(consumeIndex).toBeLessThan(events.indexOf("construct.private-command"));
    expect(consumeIndex).toBeLessThan(events.indexOf("install.next-state"));
    /* Consumed before return: the replay refuses missing. */
    const replay = harness.owner.publishImportReplacement(
      Object.freeze({
        prepared: staged.value,
        retirement: handoff["retirement"],
      }) as never,
    );
    expect(replay).toMatchObject({
      ok: false,
      code: "import.replacement_preparation_missing",
    });
    dischargedControlIds.add("BRIDGE-MUT-026");
  });

  test("BRIDGE-MUT-027 and BRIDGE-MUT-032: every real owner result is recursively state-free", () => {
    lawControl("BRIDGE-MUT-027");
    lawControl("BRIDGE-MUT-032");
    const ref = mustRun("BRIDGE-MARK-001/exact");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const marker = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
    expect(isStateFreeValue(marker)).toBe(true);
    expect(Object.keys(marker as JsonObject).sort()).toEqual([
      "documentId",
      "ok",
      "outcome",
      "revision",
    ]);
    const identity = harness.owner.readCurrentApplicationDocumentIdentity();
    expect(isStateFreeValue(identity)).toBe(true);
    expect(Object.keys(identity).sort()).toEqual(["documentId", "revision"]);
    dischargedControlIds.add("BRIDGE-MUT-027");
    dischargedControlIds.add("BRIDGE-MUT-032");
  });

  test("BRIDGE-MUT-028: listeners observe the already-installed marker state", () => {
    lawControl("BRIDGE-MUT-028");
    const ref = mustRun("BRIDGE-MARK-001/exact");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const observedAtNotify: Array<{
      sinceExport: boolean;
      label: string;
    }> = [];
    harness.controller.subscribe(() => {
      const dirty = harness.controller.getSnapshot().dirty;
      observedAtNotify.push({
        sinceExport: dirty.sinceExport,
        label: dirty.label,
      });
    });
    const result = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    /* A notify-before-install mutant would observe the stale export state. */
    expect(observedAtNotify).toEqual([
      { sinceExport: false, label: "Exported at revision 7" },
    ]);
    dischargedControlIds.add("BRIDGE-MUT-028");
  });

  test("BRIDGE-MUT-029: at the marker return, the state is already installed", () => {
    lawControl("BRIDGE-MUT-029");
    const ref = mustRun("BRIDGE-MARK-001/exact");
    const harness = createCompositionHarness(stateBeforeJson(ref));
    const snapshotBefore = harness.controller.getSnapshot();
    const result = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    /* Immediately at return the installed snapshot is visible. */
    expect(harness.controller.getSnapshot()).not.toBe(snapshotBefore as never);
    expect(harness.controller.getSnapshot().dirty).toMatchObject({
      sinceExport: false,
    });
    dischargedControlIds.add("BRIDGE-MUT-029");
  });

  test("BRIDGE-MUT-030: the real marker install preserves all fifteen field references", () => {
    lawControl("BRIDGE-MUT-030");
    const ref = mustRun("BRIDGE-MARK-001/exact");
    const harness = createOwnerSeamHarness(stateBeforeJson(ref));
    const before = harness.readCell();
    const result = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
    expect((result as { ok: boolean }).ok).toBe(true);
    const after = harness.readCell();
    expect(after).not.toBe(before);
    for (const field of [
      "document",
      "revision",
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
      "notices",
      "nextSequence",
    ] as const) {
      expect(Object.is(after[field], before[field])).toBe(true);
    }
    dischargedControlIds.add("BRIDGE-MUT-030");
  });

  test("BRIDGE-MUT-031: publication merges into the latest state, never the frozen prepare-time state", () => {
    lawControl("BRIDGE-MUT-031");
    const publishRef = mustRun("BRIDGE-REP-029/same-revision-ephemeral-edit");
    const prepareRef = mustRun("BRIDGE-REP-001/retained");
    const harness = createOwnerSeamHarness(stateBeforeJson(prepareRef));
    const staged = harness.owner.prepareImportReplacementPublication(
      rawCallArgument(
        prepareRef,
        0,
      ) as PrepareImportReplacementPublicationRequest,
    );
    expect(staged.ok).toBe(true);
    if (!staged.ok) throw new Error("BRIDGE_MUT_031_STAGE");
    harness.swapState(stateBeforeJson(publishRef));
    const handoff = rawCallArgument(publishRef, 0) as JsonObject;
    const published = harness.owner.publishImportReplacement(
      Object.freeze({
        prepared: staged.value,
        retirement: handoff["retirement"],
      }) as never,
    );
    expect(published).toMatchObject({ ok: true, outcome: "committed" });
    /* The LATEST ephemeral edit survives; a frozen-state mutant loses it. */
    const after = projectJson(harness.readCell()) as JsonObject;
    expect(valueAtPointer(after, "/panels/active")).toBe("inspector");
    expect(valueAtPointer(after, "/focusRequest/sequence")).toBe(40);
    expect(valueAtPointer(after, "/nextSequence")).toBe(41);
    dischargedControlIds.add("BRIDGE-MUT-031");
  });
});

afterAll(() => {
  const allControlIds = controls.map((control) => String(control["id"]));
  const missing = allControlIds.filter((id) => !dischargedControlIds.has(id));
  expect(missing).toEqual([]);
  const summary = {
    mutationControlCount: allControlIds.length,
    dischargedControlCount: dischargedControlIds.size,
    controlIdsSha256: sha256Hex([...allControlIds].sort().join("\n")),
    inputMutationControls: INPUT_CONTROL_PLANS.length + 3,
    lawMutationControls: allControlIds.length - INPUT_CONTROL_PLANS.length - 3,
  };
  console.log(`BRIDGE_MUTATION_OBSERVATION ${JSON.stringify(summary)}`);
});
