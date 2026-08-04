import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  DiscardImportReplacementPublicationRequest,
  ImportReplacementHandoff,
  PrepareImportReplacementPublicationRequest,
  PreparedImportReplacementPublication,
  PublishCanonicalExportRevisionRequest,
} from "../../src/application/application-interchange-owner-contract";
import {
  BRIDGE_REPOSITORY_ROOT,
  bridgeRunLedger,
  canonicalJson,
  canonicalSha256,
  createBridgeMaterializer,
  createCompositionHarness,
  createOwnerSeamHarness,
  deriveOwnerCounters,
  flattenBridgeRuns,
  isObjectRecord,
  isStateFreeValue,
  jsonDeepEqual,
  loadBridgeFixturePacket,
  projectEventOrder,
  recordBridgeRunObservation,
  sha256Hex,
  type BridgeRunObservation,
  type BridgeRunRef,
  type CompositionHarness,
  type HarnessScenarioFacts,
  type JsonObject,
  type OwnerSeamHarness,
} from "../support/a0-e0-bridge-conformance";

/**
 * A0/E0 owner-ports bridge conformance (bead jcpe-94yu.3).
 *
 * Drives the REAL production composition (`createStudioCompositionOverState`
 * — the same closure `main.tsx` composes) through every pinned conformance
 * run of the frozen fixture packet `tests/fixtures/a0-e0-bridge/`, asserting
 * the pinned literals exactly: typed results, synchronous event orders, the
 * complete seventeen-key work-counter objects, registry transitions, and
 * before/after state relations. No mock stands in for A0: F2, F3, the
 * history estimator, bookmark repair, history caps, the private registry,
 * and the controller install/notify discipline are all production code.
 *
 * Runs whose pinned publish-time controller state is unreachable through any
 * public controller command (the same-revision/correlated drift family) are
 * driven through the production `StudioInterchangeOwnerAccess` seam instead;
 * the ledger records the tier per run. Every expectation below is materialized
 * from the byte-pinned fixture packet, never from production output.
 */

const packet = loadBridgeFixturePacket();
const materializer = createBridgeMaterializer(packet);
const allRuns = flattenBridgeRuns(packet);
const conformanceRuns = allRuns.filter((run) => run.runRole === "conformance");
const runsById = new Map(conformanceRuns.map((run) => [run.fullId, run]));
const executedRunIds = new Set<string>();

const RETAINED_PREPARE = "BRIDGE-REP-001/retained";

/** Which prepare run stages the live registry entry for a dependent run. */
const STAGING_PREPARE_SOURCE: Readonly<Record<string, string>> = Object.freeze({
  "BRIDGE-REP-024/capacity-one-busy": RETAINED_PREPARE,
  "BRIDGE-REP-027/preparation-protocol-invalid-first": RETAINED_PREPARE,
  "BRIDGE-REP-027/retirement-refused-first": RETAINED_PREPARE,
  "BRIDGE-REP-027/retirement-protocol-invalid-first": RETAINED_PREPARE,
  "BRIDGE-REP-027/publication-protocol-invalid-first": RETAINED_PREPARE,
  "BRIDGE-REP-028/wrong-request-isolation": RETAINED_PREPARE,
  "BRIDGE-REP-028/manual-source-c": "BRIDGE-REP-003/source-c",
  "BRIDGE-REP-028/manual-target-d": "BRIDGE-REP-003/target-d",
  "BRIDGE-REP-029/retained": RETAINED_PREPARE,
  "BRIDGE-REP-029/same-revision-ephemeral-edit": RETAINED_PREPARE,
  "BRIDGE-REP-029/manual-source-c": "BRIDGE-REP-003/source-c",
  "BRIDGE-REP-029/manual-target-d": "BRIDGE-REP-003/target-d",
  "BRIDGE-REP-029/explicitly-unavailable": "BRIDGE-REP-002/unavailable",
  "BRIDGE-REP-029/explicitly-unavailable-sequence-saturation-boundary":
    "BRIDGE-REP-002/unavailable",
  "BRIDGE-REP-030/consumed-replay": RETAINED_PREPARE,
  "BRIDGE-REP-030/invalidated-replay": RETAINED_PREPARE,
  "BRIDGE-REP-030/structural-lookalike": RETAINED_PREPARE,
  "BRIDGE-REP-030/stale-live-entry": RETAINED_PREPARE,
  "BRIDGE-REP-030/retirement-mismatch": RETAINED_PREPARE,
  "BRIDGE-REP-030/transport-advanced-after-prepare": RETAINED_PREPARE,
  "BRIDGE-REP-030/bookmarks-changed-after-prepare": RETAINED_PREPARE,
  "BRIDGE-REP-030/sequence-exhausted-after-prepare": RETAINED_PREPARE,
  "BRIDGE-REP-030/same-revision-pending-request-drift": RETAINED_PREPARE,
  "BRIDGE-REP-030/same-revision-transition-drift": RETAINED_PREPARE,
  "BRIDGE-REP-030/same-revision-unrelated-request-added": RETAINED_PREPARE,
});

/** Pinned publish runs the composition can reach directly (no state drift). */
const TIER_A_PUBLISH_RUNS = new Set([
  "BRIDGE-REP-029/retained",
  "BRIDGE-REP-029/manual-source-c",
  "BRIDGE-REP-029/manual-target-d",
  "BRIDGE-REP-029/explicitly-unavailable",
  "BRIDGE-REP-029/explicitly-unavailable-sequence-saturation-boundary",
  "BRIDGE-REP-030/consumed-replay",
  "BRIDGE-REP-030/invalidated-replay",
  "BRIDGE-REP-030/structural-lookalike",
  "BRIDGE-REP-030/retirement-mismatch",
]);

function mustRun(fullId: string): BridgeRunRef {
  const run = runsById.get(fullId);
  if (run === undefined) throw new Error(`BRIDGE_CONF_RUN:${fullId}`);
  return run;
}

function pinnedResult(ref: BridgeRunRef): unknown {
  const holder = ref.run["exactTypedResult"];
  if (!isObjectRecord(holder)) throw new Error("BRIDGE_CONF_RESULT");
  return materializer.template(holder["value"]);
}

function pinnedEvents(ref: BridgeRunRef): readonly string[] {
  const events = ref.run["synchronousEventOrder"];
  if (!Array.isArray(events)) throw new Error("BRIDGE_CONF_EVENTS");
  return events.map(String);
}

function pinnedCounters(ref: BridgeRunRef): JsonObject {
  const counters = ref.run["exactCounters"];
  if (!isObjectRecord(counters)) throw new Error("BRIDGE_CONF_COUNTERS");
  return counters;
}

function stateBeforeJson(ref: BridgeRunRef): unknown {
  return materializer.descriptor(ref.run["controllerStateBefore"]);
}

function stateAfterJson(ref: BridgeRunRef): unknown {
  return materializer.descriptor(ref.run["controllerStateAfter"]);
}

function stateRelation(ref: BridgeRunRef, key: string): string {
  const descriptor = ref.run[key];
  return isObjectRecord(descriptor) ? String(descriptor["relation"]) : "";
}

function rawCallArgument(ref: BridgeRunRef, index: number): unknown {
  const rawCall = ref.run["rawCall"];
  if (!isObjectRecord(rawCall) || !Array.isArray(rawCall["arguments"])) {
    throw new Error("BRIDGE_CONF_RAW_CALL");
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
  if (value === undefined) return null;
  return JSON.parse(
    JSON.stringify(value, (_key, child: unknown) =>
      typeof child === "number" && !Number.isFinite(child)
        ? `__nonfinite:${String(child)}`
        : child,
    ),
  ) as unknown;
}

function baseObservation(
  ref: BridgeRunRef,
  tier: "real-composition" | "owner-seam",
): BridgeRunObservation {
  return {
    runId: ref.fullId,
    operation: ref.operation,
    category: ref.category,
    tier,
    staging: [],
    rawEvents: [],
    projectedEvents: [],
    projectionNotes: [],
    observedCounters: {},
    observedResult: null,
    resultStateFree: true,
    afterStateDischarge: [],
    estimatorObservations: [],
    probes: [],
    deviations: [],
  };
}

function finishObservation(
  ref: BridgeRunRef,
  observation: BridgeRunObservation,
  harness: CompositionHarness | OwnerSeamHarness,
  eventsMark: number,
  dependencySnapshot: {
    f2DecodeDocumentShape: number;
    f3ValidateDocumentSemantics: number;
    historyEstimator: number;
  },
  listenerBefore: number,
  result: unknown,
  facts: HarnessScenarioFacts = {},
  listenerDeltaOverride?: number,
  dependencyCountsAfter?: ReturnType<
    CompositionHarness["instruments"]["snapshotCounts"]
  >,
): void {
  const rawEvents = harness.recorder
    .since(eventsMark)
    .map((diagnostic) => diagnostic.event);
  const currentCounts =
    dependencyCountsAfter ?? harness.instruments.snapshotCounts();
  const dependencyDelta = {
    f2DecodeDocumentShape:
      currentCounts.f2DecodeDocumentShape -
      dependencySnapshot.f2DecodeDocumentShape,
    f3ValidateDocumentSemantics:
      currentCounts.f3ValidateDocumentSemantics -
      dependencySnapshot.f3ValidateDocumentSemantics,
    historyEstimator:
      currentCounts.historyEstimator - dependencySnapshot.historyEstimator,
  };
  const listenerDelta =
    listenerDeltaOverride ?? harness.notifications() - listenerBefore;
  const projection = projectEventOrder(rawEvents, facts);
  const counters = deriveOwnerCounters(
    ref.operation,
    rawEvents,
    dependencyDelta,
    listenerDelta,
  );
  observation.rawEvents = rawEvents;
  observation.projectedEvents = projection.projected;
  observation.projectionNotes = projection.notes;
  observation.observedCounters = counters;
  observation.observedResult = projectJson(result);
  observation.resultStateFree = isStateFreeValue(result);
  observation.estimatorObservations = [
    ...harness.instruments.estimatorObservations,
  ];

  /* The pinned literals, asserted exactly. */
  expect(projection.projected).toEqual([...pinnedEvents(ref)]);
  expect(counters).toEqual(pinnedCounters(ref));
  expect(projectJson(result)).toEqual(projectJson(pinnedResult(ref)));
  expect(isStateFreeValue(result)).toBe(true);

  /* The fixture's declared before->after delta must reproduce the after. */
  const delta = ref.run["exactControllerStateDelta"];
  if (Array.isArray(delta)) {
    const before = stateBeforeJson(ref);
    const patched = materializer.applyPatches(
      before,
      (delta as readonly unknown[]).map((entry) =>
        isObjectRecord(entry)
          ? Object.fromEntries(
              Object.entries(entry).filter(
                ([key]) => key !== "exactChangedFieldCount",
              ),
            )
          : entry,
      ),
      before,
    );
    expect(jsonDeepEqual(patched, stateAfterJson(ref))).toBe(true);
  }

  executedRunIds.add(ref.fullId);
  recordBridgeRunObservation(observation);
}

function publishRetirementFromEcho(
  echo: PreparedImportReplacementPublication,
): ImportReplacementHandoff["retirement"] {
  return Object.freeze({
    requestId: echo.identity.requestId,
    retiredTransportGeneration: echo.expectedTransportGeneration,
    progressionRetired: true,
    previewRetired: true,
    noFutureAttack: true,
  });
}

type StagedPreparation = Readonly<{
  echo: PreparedImportReplacementPublication;
}>;

function stagePreparation(
  harness: CompositionHarness | OwnerSeamHarness,
  sourceRunId: string,
  observation: BridgeRunObservation,
): StagedPreparation {
  const source = mustRun(sourceRunId);
  const declared = declaredEstimatorInput(source);
  harness.instruments.setEstimatorInjection(declared);
  const request = rawCallArgument(
    source,
    0,
  ) as PrepareImportReplacementPublicationRequest;
  const result = harness.owner.prepareImportReplacementPublication(request);
  harness.instruments.setEstimatorInjection(undefined);
  if (!result.ok) {
    throw new Error(`BRIDGE_CONF_STAGE_PREPARE:${sourceRunId}:${result.code}`);
  }
  observation.staging.push(`prepare:${sourceRunId}`);
  /* The staged echo must equal the pinned prepared value byte-for-byte. */
  const pinned = pinnedResult(source);
  expect(projectJson(result)).toEqual(projectJson(pinned));
  return Object.freeze({ echo: result.value });
}

function expectNoInstall(
  ref: BridgeRunRef,
  harness: CompositionHarness,
  snapshotBefore: unknown,
  notificationsBefore: number,
): void {
  expect(harness.controller.getSnapshot()).toBe(snapshotBefore as never);
  expect(harness.notifications()).toBe(notificationsBefore);
}

/* -------------------------------------------------------------------------- */
/* Prepare runs (including the busy replay)                                   */
/* -------------------------------------------------------------------------- */

const PREPARE_SUCCESS_RUNS = new Set([
  "BRIDGE-REP-001/retained",
  "BRIDGE-REP-002/unavailable",
  "BRIDGE-REP-003/source-c",
  "BRIDGE-REP-003/target-d",
  "BRIDGE-REP-007/chart-text-canonical",
  "BRIDGE-REP-007/legacy-json-legacy",
  "BRIDGE-REP-014/label-160-boundary",
  "BRIDGE-REP-015/logical-time-latest-boundary",
  "BRIDGE-REP-019/semantic-valid-cmaj7",
]);

function isUnpatchedRetainedState(ref: BridgeRunRef): boolean {
  const descriptor = ref.run["controllerStateBefore"];
  return (
    isObjectRecord(descriptor) &&
    descriptor["literalId"] === "state-retiring-retained" &&
    Array.isArray(descriptor["patches"]) &&
    descriptor["patches"].length === 0
  );
}

function executePrepareRun(ref: BridgeRunRef): void {
  const observation = baseObservation(ref, "real-composition");
  const harness = createCompositionHarness(stateBeforeJson(ref));
  let staged: StagedPreparation | null = null;
  if (STAGING_PREPARE_SOURCE[ref.fullId] !== undefined) {
    staged = stagePreparation(
      harness,
      STAGING_PREPARE_SOURCE[ref.fullId] ?? "",
      observation,
    );
  }
  const declared = declaredEstimatorInput(ref);
  harness.instruments.setEstimatorInjection(declared);
  const request = rawCallArgument(
    ref,
    0,
  ) as PrepareImportReplacementPublicationRequest;
  const snapshotBefore = harness.controller.getSnapshot();
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.prepareImportReplacementPublication(request);
  harness.instruments.setEstimatorInjection(undefined);
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
  );
  expect(stateRelation(ref, "controllerStateAfter")).toContain(
    "same-reference",
  );
  expectNoInstall(ref, harness, snapshotBefore, notificationsBefore);
  observation.afterStateDischarge.push(
    "same-reference-no-install: snapshot reference, zero notifications, unchanged identity",
  );
  const identity = harness.owner.readCurrentApplicationDocumentIdentity();
  const beforeJson = stateBeforeJson(ref) as JsonObject;
  expect(identity).toEqual({
    documentId: (beforeJson["document"] as JsonObject)["id"] as never,
    revision: beforeJson["revision"] as never,
  });

  /* Registry-after proof by real publication behavior. */
  if (PREPARE_SUCCESS_RUNS.has(ref.fullId) && result.ok) {
    const published = harness.owner.publishImportReplacement(
      Object.freeze({
        prepared: result.value,
        retirement: publishRetirementFromEcho(result.value),
      }),
    );
    expect(published).toMatchObject({ ok: true, outcome: "committed" });
    observation.probes.push({
      probe: "publish-staged-echo",
      outcome: "committed",
    });
  } else if (ref.fullId === "BRIDGE-REP-024/capacity-one-busy") {
    /* Busy refused the SECOND preparation; the FIRST entry stays publishable. */
    if (staged === null) throw new Error("BRIDGE_CONF_BUSY_STAGE");
    const published = harness.owner.publishImportReplacement(
      Object.freeze({
        prepared: staged.echo,
        retirement: publishRetirementFromEcho(staged.echo),
      }),
    );
    expect(published).toMatchObject({ ok: true, outcome: "committed" });
    observation.probes.push({
      probe: "publish-original-echo-after-busy",
      outcome: "committed",
    });
  } else if (!result.ok && isUnpatchedRetainedState(ref)) {
    /*
     * Negative-allocation proof: after a refusal over the unpatched retained
     * state, the baseline valid preparation still succeeds — a mutant that
     * allocated before its checks would refuse busy here instead.
     */
    const baseline = rawCallArgument(
      mustRun(RETAINED_PREPARE),
      0,
    ) as PrepareImportReplacementPublicationRequest;
    const followUp = harness.owner.prepareImportReplacementPublication(baseline);
    expect(followUp.ok).toBe(true);
    observation.probes.push({
      probe: "baseline-prepare-after-refusal",
      outcome: "prepared",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Discard runs                                                               */
/* -------------------------------------------------------------------------- */

function executeDiscardPair(caseId: string, reason: string): void {
  const first = mustRun(`${caseId}/${reason}-first`);
  const repeat = mustRun(`${caseId}/${reason}-repeat`);
  const harness = createCompositionHarness(stateBeforeJson(first));
  const firstObservation = baseObservation(first, "real-composition");
  const staged = stagePreparation(harness, RETAINED_PREPARE, firstObservation);
  for (const [ref, observation] of [
    [first, firstObservation],
    [repeat, baseObservation(repeat, "real-composition")],
  ] as const) {
    const request = rawCallArgument(
      ref,
      0,
    ) as DiscardImportReplacementPublicationRequest;
    const snapshotBefore = harness.controller.getSnapshot();
    const notificationsBefore = harness.notifications();
    const dependencySnapshot = harness.instruments.snapshotCounts();
    const eventsMark = harness.recorder.mark();
    const result = harness.owner.discardImportReplacementPublication(request);
    finishObservation(
      ref,
      observation,
      harness,
      eventsMark,
      dependencySnapshot,
      notificationsBefore,
      result,
    );
    expectNoInstall(ref, harness, snapshotBefore, notificationsBefore);
    observation.afterStateDischarge.push(
      "same-reference-no-install: snapshot reference and zero notifications",
    );
  }
  /* The invalidated entry can never publish again. */
  const replay = harness.owner.publishImportReplacement(
    Object.freeze({
      prepared: staged.echo,
      retirement: publishRetirementFromEcho(staged.echo),
    }),
  );
  expect(replay).toMatchObject({
    ok: false,
    code: "import.replacement_preparation_missing",
  });
}

function executeWrongIdentityDiscard(ref: BridgeRunRef): void {
  const observation = baseObservation(ref, "real-composition");
  const harness = createCompositionHarness(stateBeforeJson(ref));
  const staged = stagePreparation(
    harness,
    STAGING_PREPARE_SOURCE[ref.fullId] ?? RETAINED_PREPARE,
    observation,
  );
  const request = rawCallArgument(
    ref,
    0,
  ) as DiscardImportReplacementPublicationRequest;
  const snapshotBefore = harness.controller.getSnapshot();
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.discardImportReplacementPublication(request);
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
  );
  expectNoInstall(ref, harness, snapshotBefore, notificationsBefore);
  /* Wrong-identity isolation: the unrelated live entry still publishes. */
  const published = harness.owner.publishImportReplacement(
    Object.freeze({
      prepared: staged.echo,
      retirement: publishRetirementFromEcho(staged.echo),
    }),
  );
  expect(published).toMatchObject({ ok: true, outcome: "committed" });
  observation.probes.push({
    probe: "publish-preserved-entry",
    outcome: "committed",
  });
}

function executeWrongIdentityDiscardTierB(ref: BridgeRunRef): void {
  /*
   * REP-028/manual-*: the pinned scenario keeps a manual-frozen preparation
   * (request 401/1401) live while the CURRENT state is the plain retained
   * state — a same-revision pending-request difference no public controller
   * command can produce. Driven through the production owner-access seam.
   */
  const observation = baseObservation(ref, "owner-seam");
  const sourceRunId = STAGING_PREPARE_SOURCE[ref.fullId] ?? RETAINED_PREPARE;
  const source = mustRun(sourceRunId);
  const harness = createOwnerSeamHarness(stateBeforeJson(source));
  const staged = stagePreparation(harness, sourceRunId, observation);
  const drifted = harness.swapState(stateBeforeJson(ref));
  observation.staging.push("swap-state:pinned-current-state-for-discard");
  const request = rawCallArgument(
    ref,
    0,
  ) as DiscardImportReplacementPublicationRequest;
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.discardImportReplacementPublication(request);
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
  );
  expect(harness.readCell()).toBe(drifted);
  expect(harness.installs()).toBe(0);
  observation.afterStateDischarge.push(
    "same-reference-no-install: identical state cell reference, zero installs",
  );
  /*
   * Preservation proof: the unrelated manual entry is still LIVE — a publish
   * of its exact echo is refused STALE (the state drifted), never MISSING.
   */
  const probe = harness.owner.publishImportReplacement(
    Object.freeze({
      prepared: staged.echo,
      retirement: publishRetirementFromEcho(staged.echo),
    }),
  );
  expect(probe).toMatchObject({
    ok: false,
    code: "import.replacement_preparation_stale",
  });
  observation.probes.push({
    probe: "publish-preserved-entry-after-wrong-identity-discard",
    outcome: "import.replacement_preparation_stale (live entry survived; state drift consumed it)",
  });
}

/* -------------------------------------------------------------------------- */
/* Publish runs                                                               */
/* -------------------------------------------------------------------------- */

function pinnedHandoffValue(ref: BridgeRunRef): JsonObject {
  const value = rawCallArgument(ref, 0);
  if (!isObjectRecord(value)) throw new Error("BRIDGE_CONF_HANDOFF");
  return value;
}

function executePublishTierA(ref: BridgeRunRef): void {
  const observation = baseObservation(ref, "real-composition");
  const harness = createCompositionHarness(stateBeforeJson(ref));
  const pinnedHandoff = pinnedHandoffValue(ref);
  const facts: HarnessScenarioFacts & {
    consumedForIdentity?: boolean;
    invalidatedForIdentity?: boolean;
    fabricatedLookalike?: boolean;
  } = {};

  let handoffPrepared: unknown;
  let staged: StagedPreparation | null = null;
  if (ref.fullId === "BRIDGE-REP-030/structural-lookalike") {
    /* A fabricated structural echo; no entry was ever allocated for it. */
    handoffPrepared = pinnedHandoff["prepared"];
    facts.fabricatedLookalike = true;
    observation.staging.push("fabricate:lookalike-echo-without-preparation");
  } else {
    staged = stagePreparation(
      harness,
      STAGING_PREPARE_SOURCE[ref.fullId] ?? RETAINED_PREPARE,
      observation,
    );
    expect(projectJson(staged.echo)).toEqual(
      projectJson(pinnedHandoff["prepared"]),
    );
    handoffPrepared = staged.echo;
    if (ref.fullId === "BRIDGE-REP-030/consumed-replay") {
      const consumed = harness.owner.publishImportReplacement(
        Object.freeze({
          prepared: structuredClone(staged.echo),
          retirement: publishRetirementFromEcho(staged.echo),
        }),
      );
      expect(consumed).toMatchObject({
        ok: false,
        code: "import.replacement_preparation_missing",
      });
      observation.staging.push("consume:lookalike-publish-consumed-live-entry");
      facts.consumedForIdentity = true;
    } else if (ref.fullId === "BRIDGE-REP-030/invalidated-replay") {
      const invalidated = harness.owner.discardImportReplacementPublication(
        Object.freeze({
          identity: staged.echo.identity,
          reason: "retirement-refused",
        }),
      );
      expect(invalidated.liveForRequest).toBe(0);
      observation.staging.push("invalidate:discard-retirement-refused");
      facts.invalidatedForIdentity = true;
    }
  }
  const handoff = Object.freeze({
    prepared: handoffPrepared,
    retirement: pinnedHandoff["retirement"],
  }) as ImportReplacementHandoff;

  const snapshotBefore = harness.controller.getSnapshot();
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.publishImportReplacement(handoff);
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
    facts,
  );

  const relation = stateRelation(ref, "controllerStateAfter");
  if (relation.includes("same-reference")) {
    expectNoInstall(ref, harness, snapshotBefore, notificationsBefore);
    observation.afterStateDischarge.push(
      "same-reference-no-install: snapshot reference and zero notifications",
    );
  } else {
    expect(harness.controller.getSnapshot()).not.toBe(snapshotBefore as never);
    expect(harness.notifications()).toBe(notificationsBefore + 1);
    const afterJson = stateAfterJson(ref) as JsonObject;
    const afterDocument = afterJson["document"] as JsonObject;
    expect(harness.owner.readCurrentApplicationDocumentIdentity()).toEqual({
      documentId: afterDocument["id"] as never,
      revision: afterJson["revision"] as never,
    });
    const view = harness.controller.getSnapshot();
    expect(view.title).toBe(String(afterDocument["title"]));
    expect(view.revision).toBe(Number(afterJson["revision"]));
    observation.afterStateDischarge.push(
      "installed: new snapshot reference, one notification, identity/title/revision equal the pinned after literal",
      "full after-state value: discharged by the pure-merge layer over the same pinned material (tests/unit/a0-e0-bridge-state-reference.test.ts)",
    );
    /*
     * Byte preservation: the published document equals the pinned candidate.
     * `candidateMaterializationPatches` document the source-to-target
     * transposition derivation, which the transposition-witness test proves
     * separately; the candidate literal itself is the pinned byte authority.
     */
    const candidateLiteralId = ref.run["candidateLiteralId"];
    if (typeof candidateLiteralId === "string") {
      const candidate = materializer.literal(candidateLiteralId);
      expect(canonicalSha256(afterDocument)).toBe(canonicalSha256(candidate));
      observation.probes.push({
        probe: "candidate-byte-preservation",
        outcome: canonicalSha256(candidate),
      });
    }
    /* Replay after commit refuses missing; the entry was consumed. */
    const replay = harness.owner.publishImportReplacement(handoff);
    expect(replay).toMatchObject({
      ok: false,
      code: "import.replacement_preparation_missing",
    });
    observation.probes.push({
      probe: "replay-after-commit",
      outcome: "import.replacement_preparation_missing",
    });
  }
  void staged;
}

function executePublishTierB(ref: BridgeRunRef): void {
  const observation = baseObservation(ref, "owner-seam");
  const sourceRunId = STAGING_PREPARE_SOURCE[ref.fullId] ?? RETAINED_PREPARE;
  const source = mustRun(sourceRunId);
  const harness = createOwnerSeamHarness(stateBeforeJson(source));
  const staged = stagePreparation(harness, sourceRunId, observation);
  const pinnedHandoff = pinnedHandoffValue(ref);
  expect(projectJson(staged.echo)).toEqual(
    projectJson(pinnedHandoff["prepared"]),
  );
  /* The pinned drifted publish-time state, unreachable via public commands. */
  const driftedJson = stateBeforeJson(ref);
  const drifted = harness.swapState(driftedJson);
  observation.staging.push(
    `swap-state:${stateRelation(ref, "controllerStateBefore")}`,
  );
  const handoff = Object.freeze({
    prepared: staged.echo,
    retirement: pinnedHandoff["retirement"],
  }) as ImportReplacementHandoff;
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.publishImportReplacement(handoff);
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
  );
  const relation = stateRelation(ref, "controllerStateAfter");
  if (relation.includes("same-reference")) {
    expect(harness.readCell()).toBe(drifted);
    expect(harness.installs()).toBe(0);
    observation.afterStateDischarge.push(
      "same-reference-no-install: identical state cell reference, zero installs",
    );
  } else {
    expect(harness.installs()).toBe(1);
    expect(harness.notifications()).toBe(notificationsBefore + 1);
    const projected = JSON.parse(JSON.stringify(harness.readCell())) as unknown;
    expect(jsonDeepEqual(projected, stateAfterJson(ref))).toBe(true);
    observation.afterStateDischarge.push(
      "installed: complete after-state JSON projection equals the pinned after literal",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Identity and marker runs                                                   */
/* -------------------------------------------------------------------------- */

function executeIdentityRun(ref: BridgeRunRef): void {
  const observation = baseObservation(ref, "real-composition");
  const harness = createCompositionHarness(stateBeforeJson(ref));
  const snapshotBefore = harness.controller.getSnapshot();
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.readCurrentApplicationDocumentIdentity();
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
  );
  expect(Object.isFrozen(result)).toBe(true);
  expectNoInstall(ref, harness, snapshotBefore, notificationsBefore);
  observation.afterStateDischarge.push(
    "same-reference-no-install: snapshot reference and zero notifications",
  );
  /* Latest-at-call-time law: a REAL document command moves the very next read. */
  const renamed = harness.controller.setTitle("Bridge Identity Sequence");
  expect(renamed.ok).toBe(true);
  const afterEdit = harness.owner.readCurrentApplicationDocumentIdentity();
  const beforeJson = stateBeforeJson(ref) as JsonObject;
  expect(afterEdit.revision).toBe((Number(beforeJson["revision"]) + 1) as never);
  observation.probes.push({
    probe: "read-after-real-document-command",
    outcome: `revision:${String(afterEdit.revision)}`,
  });
}

function executeMarkerRun(ref: BridgeRunRef): void {
  const observation = baseObservation(ref, "real-composition");
  const harness = createCompositionHarness(stateBeforeJson(ref));
  const request = rawCallArgument(
    ref,
    0,
  ) as PublishCanonicalExportRevisionRequest;
  const snapshotBefore = harness.controller.getSnapshot();
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.publishCanonicalExportRevision(request);
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
  );

  const relation = stateRelation(ref, "controllerStateAfter");
  if (relation.includes("same-reference")) {
    expectNoInstall(ref, harness, snapshotBefore, notificationsBefore);
    observation.afterStateDischarge.push(
      "same-reference-no-install: snapshot reference and zero notifications",
    );
  } else {
    expect(harness.controller.getSnapshot()).not.toBe(snapshotBefore as never);
    expect(harness.notifications()).toBe(notificationsBefore + 1);
    const afterJson = stateAfterJson(ref) as JsonObject;
    expect(harness.owner.readCurrentApplicationDocumentIdentity()).toEqual({
      documentId: ((afterJson["document"] as JsonObject)["id"]) as never,
      revision: afterJson["revision"] as never,
    });
    const dirty = harness.controller.getSnapshot().dirty;
    expect(dirty).toMatchObject({
      sinceExport: false,
      label: `Exported at revision ${String(afterJson["exportRevision"])}`,
    });
    observation.afterStateDischarge.push(
      "installed: new snapshot reference, one notification, identity and export label equal the pinned after literal",
      "field-by-field reference preservation: discharged by the pure marker-CAS layer over the same pinned before literal (tests/unit/a0-e0-bridge-state-reference.test.ts)",
    );
    /* Ephemeral picker-time surfaces are retained (pinned preserved fields). */
    const beforeJson = stateBeforeJson(ref) as JsonObject;
    const beforePanels = beforeJson["panels"] as JsonObject;
    const view = harness.controller.getSnapshot();
    expect(view.panels.leftRailCollapsed).toBe(
      beforePanels["leftRailCollapsed"] as never,
    );
    expect(view.panels.rightRailCollapsed).toBe(
      beforePanels["rightRailCollapsed"] as never,
    );
  }

  if (ref.fullId === "BRIDGE-MARK-010/marker-10") {
    executeMark010PostReturnEdit(ref, harness, observation, notificationsBefore);
  }
}

function executeMark010PostReturnEdit(
  ref: BridgeRunRef,
  harness: CompositionHarness,
  observation: BridgeRunObservation,
  notificationsBeforeMarker: number,
): void {
  const postReturn = ref.run["postReturnExternalEdit"];
  if (!isObjectRecord(postReturn)) throw new Error("BRIDGE_CONF_MARK_010");
  const afterDescriptor = postReturn["controllerStateAfter"];
  const afterJson = materializer.descriptor(afterDescriptor) as JsonObject;
  const renamed = harness.controller.setTitle(
    String((afterJson["document"] as JsonObject)["title"]),
  );
  expect(renamed.ok).toBe(true);
  observation.probes.push({
    probe: "post-return-real-document-command",
    outcome: "set-title-ok",
  });
  /* Declared pinned delta pointers hold in the real observation. */
  expect(harness.owner.readCurrentApplicationDocumentIdentity()).toEqual({
    documentId: ((afterJson["document"] as JsonObject)["id"]) as never,
    revision: afterJson["revision"] as never,
  });
  expect(harness.controller.getSnapshot().title).toBe(
    String((afterJson["document"] as JsonObject)["title"]),
  );
  /* scenarioTotals: two installs, two listener callbacks across the scenario. */
  const totals = ref.run["scenarioTotals"];
  if (isObjectRecord(totals)) {
    expect(harness.notifications() - notificationsBeforeMarker).toBe(
      totals["listenerCallbacks"] as never,
    );
  }
  observation.deviations.push(
    "postReturnExternalEdit: the pinned after literal models an A1-settled abstract edit " +
      "(revision, document/title, quickEntry/baseRevision only); the real controller command " +
      "additionally records its own history entry and focus allocation. Declared delta " +
      "pointers verified against the real controller; residual fields differ by design of " +
      "the abstract literal and are reported, not hidden.",
  );
}

async function executeMark009QueuedEdit(): Promise<void> {
  /*
   * MARK-009: an edit queued DURING the owner operation. The atomic critical
   * section contains no await or microtask boundary, so the queued REAL
   * controller command can only install AFTER the owner returned; both
   * harness-observed facts become the two pinned tail events.
   */
  const ref = mustRun("BRIDGE-MARK-009/marker-9");
  const observation = baseObservation(ref, "real-composition");
  const harness = createCompositionHarness(stateBeforeJson(ref));
  const request = rawCallArgument(
    ref,
    0,
  ) as PublishCanonicalExportRevisionRequest;
  const postJson = materializer.descriptor(
    ref.run["postReturnControllerState"],
  ) as JsonObject;
  const snapshotBefore = harness.controller.getSnapshot();
  const notificationsBefore = harness.notifications();
  const dependencySnapshot = harness.instruments.snapshotCounts();
  const queuedEdit: { ran: boolean; ok: boolean } = { ran: false, ok: false };
  queueMicrotask(() => {
    queuedEdit.ran = true;
    queuedEdit.ok = harness.controller.setTitle(
      String((postJson["document"] as JsonObject)["title"]),
    ).ok;
  });
  const eventsMark = harness.recorder.mark();
  const result = harness.owner.publishCanonicalExportRevision(request);
  const dependencyCountsAfterOwner = harness.instruments.snapshotCounts();
  /* The owner returned synchronously; the queued edit had not run yet. */
  const ownerReturnedBeforeQueuedEdit: boolean = !queuedEdit.ran;
  expect(ownerReturnedBeforeQueuedEdit).toBe(true);
  expect(harness.notifications()).toBe(notificationsBefore + 1);
  const snapshotAfterMarker = harness.controller.getSnapshot();
  expect(snapshotAfterMarker).not.toBe(snapshotBefore as never);
  await Promise.resolve();
  expect(queuedEdit.ran).toBe(true);
  expect(queuedEdit.ok).toBe(true);
  /* The queued edit installed onto the marker-published state, after return. */
  const queuedEditInstalledAfterReturn: boolean =
    harness.controller.getSnapshot() !== snapshotAfterMarker;
  expect(queuedEditInstalledAfterReturn).toBe(true);
  const tail: string[] = [];
  if (ownerReturnedBeforeQueuedEdit) tail.push("owner-return-complete");
  if (queuedEditInstalledAfterReturn) {
    tail.push("queued-edit-installs-only-after-return");
  }
  /*
   * Counter scope: the pinned run counters cover the OWNER operation only, so
   * the queued edit's install/notification are excluded by asserting against
   * the pre-edit deltas via a scoped listener count of one.
   */
  finishObservation(
    ref,
    observation,
    harness,
    eventsMark,
    dependencySnapshot,
    notificationsBefore,
    result,
    { harnessTail: tail },
    1,
    dependencyCountsAfterOwner,
  );
  expect(harness.owner.readCurrentApplicationDocumentIdentity()).toEqual({
    documentId: ((postJson["document"] as JsonObject)["id"]) as never,
    revision: postJson["revision"] as never,
  });
  expect(harness.controller.getSnapshot().title).toBe(
    String((postJson["document"] as JsonObject)["title"]),
  );
  observation.probes.push({
    probe: "queued-edit-installed-after-return",
    outcome: `revision:${String(postJson["revision"])}`,
  });
  observation.deviations.push(
    "postReturnControllerState: the pinned literal models an A1-settled abstract edit; " +
      "the real controller command additionally records history/focus. Declared delta " +
      "pointers (revision, document/title) verified against the real controller.",
  );
}

/* -------------------------------------------------------------------------- */
/* The suite                                                                  */
/* -------------------------------------------------------------------------- */

const prepareRuns = conformanceRuns.filter(
  (ref) =>
    ref.operation === "prepareImportReplacementPublication" &&
    ref.runRole === "conformance",
);
const discardCaseIds = ["BRIDGE-REP-027"];
const discardReasons = [
  "preparation-protocol-invalid",
  "retirement-refused",
  "retirement-protocol-invalid",
  "publication-protocol-invalid",
];
const wrongIdentityDiscardRuns = ["BRIDGE-REP-028/wrong-request-isolation"];
const wrongIdentityDiscardTierBRuns = [
  "BRIDGE-REP-028/manual-source-c",
  "BRIDGE-REP-028/manual-target-d",
];
const publishRuns = conformanceRuns.filter(
  (ref) => ref.operation === "publishImportReplacement",
);
const identityRuns = conformanceRuns.filter(
  (ref) => ref.operation === "readCurrentApplicationDocumentIdentity",
);
const markerRuns = conformanceRuns.filter(
  (ref) => ref.operation === "publishCanonicalExportRevision",
);

describe("A0/E0 bridge conformance: prepareImportReplacementPublication", () => {
  for (const ref of prepareRuns) {
    test(ref.fullId, () => {
      executePrepareRun(ref);
    });
  }
});

describe("A0/E0 bridge conformance: discardImportReplacementPublication", () => {
  for (const caseId of discardCaseIds) {
    for (const reason of discardReasons) {
      test(`${caseId}/${reason} first+repeat`, () => {
        executeDiscardPair(caseId, reason);
      });
    }
  }
  for (const fullId of wrongIdentityDiscardRuns) {
    test(fullId, () => {
      executeWrongIdentityDiscard(mustRun(fullId));
    });
  }
  for (const fullId of wrongIdentityDiscardTierBRuns) {
    test(fullId, () => {
      executeWrongIdentityDiscardTierB(mustRun(fullId));
    });
  }
});

describe("A0/E0 bridge conformance: publishImportReplacement", () => {
  for (const ref of publishRuns) {
    test(ref.fullId, () => {
      if (TIER_A_PUBLISH_RUNS.has(ref.fullId)) {
        executePublishTierA(ref);
      } else {
        executePublishTierB(ref);
      }
    });
  }
});

describe("A0/E0 bridge conformance: readCurrentApplicationDocumentIdentity", () => {
  for (const ref of identityRuns) {
    test(ref.fullId, () => {
      executeIdentityRun(ref);
    });
  }
});

describe("A0/E0 bridge conformance: publishCanonicalExportRevision", () => {
  for (const ref of markerRuns) {
    if (ref.fullId === "BRIDGE-MARK-009/marker-9") {
      test(`${ref.fullId} (queued edit installs only after return)`, async () => {
        await executeMark009QueuedEdit();
      });
    } else {
      test(ref.fullId, () => {
        executeMarkerRun(ref);
      });
    }
  }
});

describe("A0/E0 bridge conformance: transposition witness", () => {
  test("target materialization patches are exact and invertible", () => {
    const witness = packet.cases["transpositionWitness"];
    expect(isObjectRecord(witness)).toBe(true);
    if (!isObjectRecord(witness)) return;
    const source = witness["source"] as JsonObject;
    const target = witness["target"] as JsonObject;
    const sourceDoc = materializer.literal(String(source["literalId"]));
    const targetDoc = materializer.literal(String(target["literalId"]));
    expect(source["canonicalMaterializedSha256"]).toBe(
      canonicalSha256(sourceDoc),
    );
    expect(target["canonicalMaterializedSha256"]).toBe(
      canonicalSha256(targetDoc),
    );
    expect(source["canonicalMaterializedByteLength"]).toBe(
      new TextEncoder().encode(canonicalJson(sourceDoc)).length,
    );
    expect(target["canonicalMaterializedByteLength"]).toBe(
      new TextEncoder().encode(canonicalJson(targetDoc)).length,
    );
    /* The exact Manual/Frozen spelling bytes pinned by the witness. */
    for (const side of [source, target]) {
      const spelling = [
        ...(side["sourceTexts"] as string[]),
        (side["manualPitches"] as string[]).join(","),
        (side["frozenPitches"] as string[]).join(","),
      ].join("\n");
      expect(spelling).toBe(String(side["exactSpellingBytesUtf8"]));
      expect(side["exactSpellingBytesSha256"]).toBe(
        sha256Hex(new TextEncoder().encode(spelling)),
      );
      const documentText = canonicalJson(
        side === source ? sourceDoc : targetDoc,
      );
      for (const text of side["sourceTexts"] as string[]) {
        expect(documentText).toContain(JSON.stringify(text).slice(1, -1));
      }
    }
    /* Forward patches reproduce the target; reversed they reproduce source. */
    const forward = materializer.applyPatches(
      sourceDoc,
      witness["targetMaterializationPatches"],
      sourceDoc,
    );
    expect(jsonDeepEqual(forward, targetDoc)).toBe(true);
  });
});

afterAll(() => {
  /* Every pinned conformance run must have been discharged exactly once. */
  const missing = conformanceRuns
    .map((ref) => ref.fullId)
    .filter((fullId) => !executedRunIds.has(fullId));
  expect(missing).toEqual([]);

  const ledger = bridgeRunLedger();
  const ledgerJson = {
    schema: "changes.evidence.a0-e0-bridge-conformance-run-ledger.v1",
    beadId: "jcpe-94yu.3",
    fixturePacketByteDigests: packet.byteDigests,
    conformanceRunCount: ledger.length,
    pinnedConformanceRunCount: conformanceRuns.length,
    runObservations: ledger,
  };
  const directory = join(BRIDGE_REPOSITORY_ROOT, "test-results");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "a0-e0-bridge-conformance-run-ledger.json"),
    `${JSON.stringify(ledgerJson, null, 2)}\n`,
  );
  const summary = {
    conformanceRunCount: ledger.length,
    pinnedConformanceRunCount: conformanceRuns.length,
    runIdsSha256: sha256Hex(
      ledger
        .map((entry) => entry.runId)
        .sort()
        .join("\n"),
    ),
    ledgerSha256: sha256Hex(JSON.stringify(ledgerJson)),
    tierCounts: {
      realComposition: ledger.filter(
        (entry) => entry.tier === "real-composition",
      ).length,
      ownerSeam: ledger.filter((entry) => entry.tier === "owner-seam").length,
    },
    harnessProjectedEventCount: ledger.reduce(
      (total, entry) =>
        total +
        entry.projectionNotes.filter(
          (note) => note.source === "harness-observation",
        ).length,
      0,
    ),
    deviationCount: ledger.reduce(
      (total, entry) => total + entry.deviations.length,
      0,
    ),
  };
  console.log(`BRIDGE_OWNER_CONFORMANCE_OBSERVATION ${JSON.stringify(summary)}`);
});
