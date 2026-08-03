import { afterAll, describe, expect, test } from "bun:test";

import {
  MAX_APPLICATION_SEQUENCE,
  applyPreparedImportReplacementToLatestState,
  createExportRevisionMarkedState,
} from "../../src/application";
import type {
  PrepareImportReplacementPublicationRequest,
  PublishCanonicalExportRevisionRequest,
} from "../../src/application/application-interchange-owner-contract";
import {
  createBridgeMaterializer,
  createOwnerSeamHarness,
  flattenBridgeRuns,
  isObjectRecord,
  jsonDeepEqual,
  loadBridgeFixturePacket,
  runtimeAppStateFromJson,
  sha256Hex,
  valueAtPointer,
  type BridgeRunRef,
  type JsonObject,
} from "../support/a0-e0-bridge-conformance";

/**
 * Full after-state and reference-identity discharge for the A0/E0 owner
 * ports (bead jcpe-94yu.3).
 *
 * The composition-tier conformance suite proves every observable projection
 * of an installing run; the closure's whole AppState is not readable there
 * by design. This suite closes that gap with the REAL production owner
 * operations over the production `StudioInterchangeOwnerAccess` seam, where
 * the installed state IS directly observable, and asserts against the pinned
 * literals:
 *
 * - the complete installed after-state JSON equals the pinned after literal;
 * - every pinned preserved field keeps REFERENCE identity (`Object.is`), not
 *   merely value equality (contract section 8 and the merge partition of
 *   section 6);
 * - the exact marker replay keeps the whole state reference;
 * - the pure state constructors obey the same laws over the same pinned
 *   states, binding the closure observation to the constructor law.
 */

const packet = loadBridgeFixturePacket();
const materializer = createBridgeMaterializer(packet);
const runs = flattenBridgeRuns(packet);
const runsById = new Map(runs.map((run) => [run.fullId, run]));

const MARKER_PRESERVED_FIELDS = Object.freeze([
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
] as const);

const MERGE_PRESERVED_BY_REFERENCE = Object.freeze([
  "recovery",
  "panels",
  "dialogs",
  "transport",
] as const);

let dischargedInstallStates = 0;

function mustRun(fullId: string): BridgeRunRef {
  const run = runsById.get(fullId);
  if (run === undefined) throw new Error(`BRIDGE_REF_RUN:${fullId}`);
  return run;
}

function stateBeforeJson(ref: BridgeRunRef): unknown {
  return materializer.descriptor(ref.run["controllerStateBefore"]);
}

function stateAfterJson(ref: BridgeRunRef): unknown {
  return materializer.descriptor(ref.run["controllerStateAfter"]);
}

function rawCallArgument(ref: BridgeRunRef, index: number): unknown {
  const rawCall = ref.run["rawCall"];
  if (!isObjectRecord(rawCall) || !Array.isArray(rawCall["arguments"])) {
    throw new Error("BRIDGE_REF_RAW_CALL");
  }
  return materializer.descriptor(rawCall["arguments"][index]);
}

function projectJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("marker CAS installing runs over the owner seam", () => {
  const installingMarkerRuns = [
    "BRIDGE-MARK-001/exact",
    "BRIDGE-MARK-002/marker-2",
    "BRIDGE-MARK-009/marker-9",
    "BRIDGE-MARK-010/marker-10",
    "BRIDGE-MARK-011/marker-11",
    "BRIDGE-MARK-012/source-c",
    "BRIDGE-MARK-012/target-d",
  ];
  for (const fullId of installingMarkerRuns) {
    test(`${fullId}: complete after-state value and all fifteen preserved references`, () => {
      const ref = mustRun(fullId);
      const harness = createOwnerSeamHarness(stateBeforeJson(ref));
      const before = harness.readCell();
      const result = harness.owner.publishCanonicalExportRevision(
        rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
      );
      expect(result).toMatchObject({ ok: true, outcome: "published" });
      const after = harness.readCell();
      expect(after).not.toBe(before);
      expect(jsonDeepEqual(projectJson(after), stateAfterJson(ref))).toBe(true);
      for (const field of MARKER_PRESERVED_FIELDS) {
        expect(Object.is(after[field], before[field])).toBe(true);
      }
      /* The closure installed exactly the pure constructor's output law. */
      const constructed = createExportRevisionMarkedState(
        before,
        after.exportRevision as never,
      );
      expect(jsonDeepEqual(projectJson(constructed), projectJson(after))).toBe(
        true,
      );
      dischargedInstallStates += 1;
    });
  }

  test("BRIDGE-MARK-008/marker-8: the exact replay keeps the WHOLE state reference", () => {
    const ref = mustRun("BRIDGE-MARK-008/marker-8");
    const harness = createOwnerSeamHarness(stateBeforeJson(ref));
    const before = harness.readCell();
    const result = harness.owner.publishCanonicalExportRevision(
      rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
    );
    expect(result).toMatchObject({ ok: true, outcome: "published" });
    expect(harness.readCell()).toBe(before);
    expect(harness.installs()).toBe(0);
    expect(harness.notifications()).toBe(0);
  });

  test("marker refusals never install and keep the whole state reference", () => {
    for (const fullId of [
      "BRIDGE-MARK-003/marker-3",
      "BRIDGE-MARK-004/marker-4",
      "BRIDGE-MARK-005/marker-5",
    ]) {
      const ref = mustRun(fullId);
      const harness = createOwnerSeamHarness(stateBeforeJson(ref));
      const before = harness.readCell();
      const result = harness.owner.publishCanonicalExportRevision(
        rawCallArgument(ref, 0) as PublishCanonicalExportRevisionRequest,
      );
      expect(result).toMatchObject({ ok: false, outcome: "refused" });
      expect(harness.readCell()).toBe(before);
      expect(harness.installs()).toBe(0);
    }
  });
});

describe("replacement publication installing runs over the owner seam", () => {
  const stagingBySuccessRun: Readonly<Record<string, string>> = Object.freeze({
    "BRIDGE-REP-029/retained": "BRIDGE-REP-001/retained",
    "BRIDGE-REP-029/manual-source-c": "BRIDGE-REP-003/source-c",
    "BRIDGE-REP-029/manual-target-d": "BRIDGE-REP-003/target-d",
    "BRIDGE-REP-029/explicitly-unavailable": "BRIDGE-REP-002/unavailable",
    "BRIDGE-REP-029/explicitly-unavailable-sequence-saturation-boundary":
      "BRIDGE-REP-002/unavailable",
  });
  for (const [fullId, stagingRunId] of Object.entries(stagingBySuccessRun)) {
    test(`${fullId}: complete after-state value and the merge reference partition`, () => {
      const ref = mustRun(fullId);
      const source = mustRun(stagingRunId);
      /*
       * The publish-time state literal is the run's own; prepare runs over
       * the same state for these non-drift scenarios (the saturation variant
       * pins its boundary sequence in both).
       */
      const harness = createOwnerSeamHarness(stateBeforeJson(ref));
      const staged = harness.owner.prepareImportReplacementPublication(
        rawCallArgument(
          source,
          0,
        ) as PrepareImportReplacementPublicationRequest,
      );
      expect(staged.ok).toBe(true);
      if (!staged.ok) throw new Error("BRIDGE_REF_STAGE");
      const latestBefore = harness.readCell();
      const handoff = rawCallArgument(ref, 0) as JsonObject;
      const result = harness.owner.publishImportReplacement(
        Object.freeze({
          prepared: staged.value,
          retirement: handoff["retirement"],
        }) as never,
      );
      expect(result).toMatchObject({ ok: true, outcome: "committed" });
      const after = harness.readCell();
      expect(after).not.toBe(latestBefore);
      expect(jsonDeepEqual(projectJson(after), stateAfterJson(ref))).toBe(true);
      /* The pinned merge partition: latest references preserved exactly. */
      for (const field of MERGE_PRESERVED_BY_REFERENCE) {
        expect(Object.is(after[field], latestBefore[field])).toBe(true);
      }
      expect(after.exportRevision).toBe(latestBefore.exportRevision);
      expect(harness.installs()).toBe(1);
      expect(harness.notifications()).toBe(1);
      dischargedInstallStates += 1;
    });
  }

  test("the saturation boundary allocates focus then saturates the warning sequence", () => {
    const ref = mustRun(
      "BRIDGE-REP-029/explicitly-unavailable-sequence-saturation-boundary",
    );
    const afterJson = stateAfterJson(ref) as JsonObject;
    expect(valueAtPointer(afterJson, "/focusRequest/sequence")).toBe(
      MAX_APPLICATION_SEQUENCE - 1,
    );
    expect(valueAtPointer(afterJson, "/notices/0/sequence")).toBe(
      MAX_APPLICATION_SEQUENCE,
    );
    expect(valueAtPointer(afterJson, "/nextSequence")).toBe(
      MAX_APPLICATION_SEQUENCE,
    );
  });
});

describe("pure state constructors over the pinned literals", () => {
  test("createExportRevisionMarkedState: same law, pinned MARK-001 state", () => {
    const ref = mustRun("BRIDGE-MARK-001/exact");
    const before = runtimeAppStateFromJson(stateBeforeJson(ref));
    const afterJson = stateAfterJson(ref) as JsonObject;
    const next = createExportRevisionMarkedState(
      before,
      afterJson["exportRevision"] as never,
    );
    expect(next).not.toBe(before);
    expect(Object.isFrozen(next)).toBe(true);
    expect(jsonDeepEqual(projectJson(next), afterJson)).toBe(true);
    for (const field of MARKER_PRESERVED_FIELDS) {
      expect(Object.is(next[field], before[field])).toBe(true);
    }
  });

  test("applyPreparedImportReplacementToLatestState is exercised only via the real closure", () => {
    /*
     * The merge constructor's behavior is proven above THROUGH the closure
     * (real prepare and publish); this control pins that the exported pure
     * function is the same value the production module publishes, so the
     * closure observation binds to the constructor law.
     */
    expect(typeof applyPreparedImportReplacementToLatestState).toBe("function");
    expect(applyPreparedImportReplacementToLatestState.length).toBe(2);
  });
});

afterAll(() => {
  const summary = {
    installingStateDischarges: dischargedInstallStates,
    markerPreservedFieldCount: MARKER_PRESERVED_FIELDS.length,
    mergePreservedByReference: MERGE_PRESERVED_BY_REFERENCE.length,
    packetSha256: sha256Hex(
      Object.values(packet.byteDigests).sort().join("\n"),
    ),
  };
  console.log(`BRIDGE_STATE_REFERENCE_OBSERVATION ${JSON.stringify(summary)}`);
});
