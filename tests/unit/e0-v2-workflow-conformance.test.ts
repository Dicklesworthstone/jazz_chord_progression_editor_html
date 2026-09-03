/**
 * E0 v2 workflow conformance — replays the commit-path rows of the accepted
 * fixture packet tests/fixtures/interchange-v2/workflow-cases.json
 * (E0V2-WF-001..006) against the production transaction driver with
 * scripted ports, so malformed envelopes and throws can be injected at
 * each boundary. Every case additionally certifies the section-9 ordering
 * and cleanup laws: which ports ran, in what order, and which of the four
 * closed discard reasons fired. WF-007/008 target the marker/delivery
 * path and land with the v2 marker orchestrator (l3a.8.2 stages 4-5);
 * their port-level normalization rows are already certified by
 * e0-v2-normalization-conformance.test.ts.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import type { DocumentId } from "../../src/domain";
import {
  createE0V2TransactionDriver,
  type CommitImportReplacementRequestV2,
  type RetireImportReplacementRequest,
  type X1ReplacementRetirementAdapter,
} from "../../src/application";
import type { A0E0InterchangeOwnerPorts } from "../../src/application/application-interchange-owner-contract";

const fixturePath = resolve(
  import.meta.dirname,
  "../fixtures/interchange-v2/workflow-cases.json",
);

const IDENTITY = Object.freeze({
  requestId: 7,
  documentId: "D1",
  baseRevision: 4,
});

const COUNTERS = Object.freeze({
  sectionsVisited: 3,
  measuresVisited: 12,
  eventsVisited: 40,
  stableIdsIndexed: 55,
  historyEntriesVisited: 2,
  historyBytesEstimated: 4096,
  bookmarksRepaired: 0,
  requestsCompared: 1,
  transportNotificationsCompared: 1,
  validationCalls: 1,
} as const);

const PREPARED_VALUE = Object.freeze({
  schema: "changes.prepared-import-replacement-publication.v1",
  identity: IDENTITY,
  sourceFormat: "canonical-json-v2",
  candidateDocumentId: "D2",
  expectedTransportGeneration: 3,
  committingTransition: Object.freeze({
    kind: "committing",
    requestId: 7,
    origin: "canonical-import",
    baseRevision: 4,
    candidateDocumentId: "D2",
    undoDisposition: "retained",
  }),
});

const COMMITTED_ENVELOPE = Object.freeze({
  ok: true,
  outcome: "committed",
  identity: IDENTITY,
  documentId: "D2",
  revision: 5,
  effects: Object.freeze([]),
  counters: COUNTERS,
  liveForRequest: 0,
});

type ScriptOverrides = Readonly<{
  prepare?: () => unknown;
  publish?: () => unknown;
  retire?: (sent: unknown) => Promise<unknown>;
}>;

type Harness = Readonly<{
  driver: ReturnType<typeof createE0V2TransactionDriver>;
  calls: readonly string[];
  discards: readonly unknown[];
  request: CommitImportReplacementRequestV2;
}>;

function makeHarness(overrides: ScriptOverrides = {}): Harness {
  const calls: string[] = [];
  const discards: unknown[] = [];
  const ports: A0E0InterchangeOwnerPorts = {
    prepareImportReplacementPublication: () => {
      calls.push("prepare");
      if (overrides.prepare) return overrides.prepare();
      return Object.freeze({ ok: true, value: PREPARED_VALUE });
    },
    discardImportReplacementPublication: (cleanup) => {
      calls.push("discard");
      discards.push(cleanup);
      return Object.freeze({
        outcome: "invalidated-by-request" as const,
        identity: IDENTITY,
        liveForRequest: 0 as const,
      }) as never;
    },
    publishImportReplacement: () => {
      calls.push("publish");
      if (overrides.publish) return overrides.publish();
      return COMMITTED_ENVELOPE;
    },
    readCurrentApplicationDocumentIdentity: () => {
      calls.push("identity");
      return Object.freeze({ documentId: "D1", revision: 4 });
    },
    publishCanonicalExportRevision: () => {
      calls.push("marker");
      throw new Error("MARKER_PORT_MUST_NOT_RUN_IN_COMMIT_PATH");
    },
  };
  const x1: X1ReplacementRetirementAdapter = Object.freeze({
    retireImportReplacement: (sent: RetireImportReplacementRequest) => {
      calls.push("x1");
      if (overrides.retire) return overrides.retire(sent) as never;
      return Promise.resolve(
        Object.freeze({
          ok: true,
          value: Object.freeze({
            schema: "changes.x1-replacement-retirement-evidence.v1",
            authority: "x1-serialized-transport",
            request: sent,
            receipt: Object.freeze({
              requestId: 7,
              retiredTransportGeneration: 3,
              progressionRetired: true,
              previewRetired: true,
              noFutureAttack: true,
            }),
          }),
        }),
      ) as never;
    },
  });
  const request = Object.freeze({
    schema: "changes.import-commit-request.v2",
    ownerRequest: Object.freeze({
      identity: IDENTITY,
      sourceFormat: "canonical-json-v2",
      replacementOrigin: "canonical-import",
      candidate: Object.freeze({ id: "D2" }),
      replacementCommandSeed: Object.freeze({
        id: "command-wf-1",
        label: "Import Changes",
        logicalTimeMs: 12000,
      }),
      disclosedImpact: Object.freeze({ undoDisposition: "retained" }),
      currentTransition: Object.freeze({
        kind: "retiring-transport",
        requestId: 7,
        origin: "canonical-import",
        baseRevision: 4,
        candidateDocumentId: "D2",
        undoDisposition: "retained",
      }),
      nonUndoableConfirmation: null,
    }),
    confirmationBinding: Object.freeze({
      displayedRequirement: null,
      acknowledgement: null,
      byteMatchProvedBeforeOwnerCall: true,
    }),
  }) as never as CommitImportReplacementRequestV2;
  return {
    driver: createE0V2TransactionDriver(ports, x1),
    calls,
    discards,
    request,
  };
}

type WorkflowCase = Readonly<{
  id: string;
  variant: string;
  expectedResultTopLevelKeys?: readonly string[];
  expectedDiagnostic?: unknown;
  expectedReconciliation?: string;
  expectedResultFragment?: Readonly<Record<string, unknown>>;
}>;

const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Readonly<{
  cases: readonly WorkflowCase[];
}>;

function row(id: string): WorkflowCase {
  const found = fixture.cases.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`MISSING_FIXTURE_ROW:${id}`);
  return found;
}

describe("E0 v2 workflow conformance (commit path, scripted ports)", () => {
  test("WF-001 positive: retained commit succeeds state-free with the exact key set", async () => {
    const wf = row("E0V2-WF-001");
    const h = makeHarness();
    const result = await h.driver(h.request);
    expect(Object.keys(result).sort()).toEqual(
      [...(wf.expectedResultTopLevelKeys ?? [])].sort(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.documentId).toBe("D2" as DocumentId);
    expect(result.revision).toBe(5);
    expect(result.liveForRequest).toBe(0);
    expect(result.counters).toEqual(COUNTERS as never);
    /* ordering law: prepare, then X1, then publish; no discard, no marker */
    expect(h.calls).toEqual(["prepare", "x1", "publish"]);
    expect(h.discards).toEqual([]);
  });

  test("WF-002 malformed prepare envelope: diagnostic, reconciliation none, X1 never runs", async () => {
    const wf = row("E0V2-WF-002");
    const h = makeHarness({
      prepare: () => ({
        ok: false,
        code: "import.replacement_preparation_busy",
        state: "smuggled",
      }),
    });
    const result = await h.driver(h.request);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual(wf.expectedDiagnostic as never);
    expect(result.reconciliation).toBe(wf.expectedReconciliation as never);
    expect(result.liveForRequest).toBe(0);
    expect(h.calls).not.toContain("x1");
    expect(h.calls).not.toContain("publish");
    expect(h.discards).toEqual([
      { identity: IDENTITY, reason: "preparation-protocol-invalid" },
    ]);
  });

  test("WF-003 malformed publish envelope: diagnostic with the transport reconciliation obligation", async () => {
    const wf = row("E0V2-WF-003");
    const h = makeHarness({
      publish: () => ({ ...COMMITTED_ENVELOPE, lastKnownState: {} }),
    });
    const result = await h.driver(h.request);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual(wf.expectedDiagnostic as never);
    expect(result.reconciliation).toBe(wf.expectedReconciliation as never);
    expect(h.calls).toEqual(["prepare", "x1", "publish", "discard", "identity"]);
    expect(h.discards).toEqual([
      { identity: IDENTITY, reason: "publication-protocol-invalid" },
    ]);
  });

  test("WF-004 stale retirement evidence: evidence-invalid refusal at the transport-retirement stage", async () => {
    const wf = row("E0V2-WF-004");
    const h = makeHarness({
      retire: (sent) =>
        Promise.resolve({
          ok: true,
          value: {
            schema: "changes.x1-replacement-retirement-evidence.v1",
            authority: "x1-serialized-transport",
            request: sent,
            receipt: {
              requestId: 7,
              /* stale: reports a generation other than the prepared echo */
              retiredTransportGeneration: 2,
              progressionRetired: true,
              previewRetired: true,
              noFutureAttack: true,
            },
          },
        }),
    });
    const result = await h.driver(h.request);
    for (const [key, value] of Object.entries(
      wf.expectedResultFragment ?? {},
    )) {
      expect((result as never as Record<string, unknown>)[key]).toEqual(
        value as never,
      );
    }
    expect(h.calls).not.toContain("publish");
    expect(h.discards).toEqual([
      { identity: IDENTITY, reason: "retirement-protocol-invalid" },
    ]);
  });

  test("WF-005 prepare throw: threw-or-rejected diagnostic, nothing changed", async () => {
    const wf = row("E0V2-WF-005");
    const h = makeHarness({
      prepare: () => {
        throw new Error("PREPARE_THREW");
      },
    });
    const result = await h.driver(h.request);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual(wf.expectedDiagnostic as never);
    expect(result.reconciliation).toBe(wf.expectedReconciliation as never);
    expect(h.calls).not.toContain("x1");
    expect(h.discards).toEqual([
      { identity: IDENTITY, reason: "preparation-protocol-invalid" },
    ]);
  });

  test("WF-006 publish throw: threw-or-rejected diagnostic with the transport reconciliation obligation", async () => {
    const wf = row("E0V2-WF-006");
    const h = makeHarness({
      publish: () => {
        throw new Error("PUBLISH_THREW");
      },
    });
    const result = await h.driver(h.request);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual(wf.expectedDiagnostic as never);
    expect(result.reconciliation).toBe(wf.expectedReconciliation as never);
    expect(h.discards).toEqual([
      { identity: IDENTITY, reason: "publication-protocol-invalid" },
    ]);
  });

  test("X1 refusal envelope: retirement-refused discard and the refusal code, publish never runs", async () => {
    const h = makeHarness({
      retire: () =>
        Promise.resolve({
          ok: false,
          code: "transport.replacement_retirement_unavailable",
          retirementEffect: "none",
        }),
    });
    const result = await h.driver(h.request);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "refused") {
      throw new Error("EXPECTED_REFUSED");
    }
    expect(result.stage).toBe("transport-retirement");
    expect(result.code).toBe("transport.replacement_retirement_refused");
    expect(h.calls).not.toContain("publish");
    expect(h.discards).toEqual([
      { identity: IDENTITY, reason: "retirement-refused" },
    ]);
  });

  test("X1 rejection: evidence-invalid refusal with the retirement-protocol-invalid discard", async () => {
    const h = makeHarness({
      retire: () => Promise.reject(new Error("X1_REJECTED")),
    });
    const result = await h.driver(h.request);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "refused") {
      throw new Error("EXPECTED_REFUSED");
    }
    expect(result.stage).toBe("transport-retirement");
    expect(result.code).toBe(
      "transport.replacement_retirement_evidence_invalid",
    );
    expect(h.discards).toEqual([
      { identity: IDENTITY, reason: "retirement-protocol-invalid" },
    ]);
  });
});
