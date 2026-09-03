/**
 * E0 v2 resolution conformance — replays the commit-driver rows of the
 * accepted fixture packet
 * tests/fixtures/interchange-v2/resolution-cases.json against the
 * production transaction driver with scripted ports, materializing the
 * packet's `$literalRef` catalog per its materialization policy. Rows 003
 * and 004 (preview impact projection / owner recomputation authority) are
 * contract laws proven at the owner boundary
 * (studio-interchange-owner tests) and asserted here only at the
 * projection-vocabulary level; rows 014 and 015 target the marker path
 * and land with the v2 marker orchestrator (stages 4-5).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  createE0V2TransactionDriver,
  type CommitImportReplacementRequestV2,
  type RetireImportReplacementRequest,
  type X1ReplacementRetirementAdapter,
} from "../../src/application";
import {
  IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES,
  IMPORT_REPLACEMENT_PUBLICATION_REFUSAL_CODES,
  type A0E0InterchangeOwnerPorts,
} from "../../src/application/application-interchange-owner-contract";

const fixturePath = resolve(
  import.meta.dirname,
  "../fixtures/interchange-v2/resolution-cases.json",
);

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

type CatalogEntry = Readonly<{ kind: string; value: unknown }>;

const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Readonly<{
  literalCatalog: Readonly<Record<string, CatalogEntry>>;
  cases: readonly Readonly<Record<string, unknown>>[];
}>;

/** Recursive materialization per the packet's materializationPolicy:
 * `$literalRef` resolves through the catalog (unresolved is a fixture
 * failure), `$counterObject` materializes the complete ten-key counter
 * object. */
function materialize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(materialize);
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    const ref = record["$literalRef"];
    if (typeof ref === "string") {
      const entry = fixture.literalCatalog[ref];
      if (entry === undefined) throw new Error(`UNRESOLVED_LITERAL_REF:${ref}`);
      return materialize(entry.value);
    }
    if (record["$counterObject"] === "complete-application-work-counter-object") {
      return COUNTERS;
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      out[key] = materialize(entry);
    }
    return out;
  }
  return value;
}

function row(id: string): Readonly<Record<string, unknown>> {
  const found = fixture.cases.find((entry) => entry["id"] === id);
  if (found === undefined) throw new Error(`MISSING_FIXTURE_ROW:${id}`);
  return found;
}

const COMMIT_REQUEST = materialize({
  $literalRef: "commit-request-v2",
}) as CommitImportReplacementRequestV2;
const IDENTITY = materialize({ $literalRef: "identity-v2-import" }) as Readonly<{
  requestId: number;
  documentId: string;
  baseRevision: number;
}>;

type ScriptOverrides = Readonly<{
  prepare?: () => unknown;
  publish?: () => unknown;
  retire?: (sent: unknown) => Promise<unknown>;
  identity?: () => unknown;
}>;

function makeHarness(overrides: ScriptOverrides = {}) {
  const calls: string[] = [];
  const prepareRequests: unknown[] = [];
  const preparedValue = Object.freeze({
    schema: "changes.prepared-import-replacement-publication.v1",
    identity: IDENTITY,
    sourceFormat: "canonical-json-v2",
    candidateDocumentId: "document-e0-minimal",
    expectedTransportGeneration: 3,
    committingTransition: Object.freeze({
      kind: "committing",
      requestId: IDENTITY.requestId,
      origin: "canonical-import",
      baseRevision: IDENTITY.baseRevision,
      candidateDocumentId: "document-e0-minimal",
      undoDisposition: "retained",
    }),
  });
  const ports: A0E0InterchangeOwnerPorts = {
    prepareImportReplacementPublication: (ownerRequest) => {
      calls.push("prepare");
      prepareRequests.push(ownerRequest);
      if (overrides.prepare) return overrides.prepare();
      return Object.freeze({ ok: true, value: preparedValue });
    },
    discardImportReplacementPublication: () => {
      calls.push("discard");
      return Object.freeze({
        outcome: "invalidated-by-request" as const,
        identity: IDENTITY,
        liveForRequest: 0 as const,
      }) as never;
    },
    publishImportReplacement: () => {
      calls.push("publish");
      if (overrides.publish) return overrides.publish();
      return Object.freeze({
        ok: true,
        outcome: "committed",
        identity: IDENTITY,
        documentId: "document-e0-minimal",
        revision: 10,
        effects: Object.freeze([]),
        counters: COUNTERS,
        liveForRequest: 0,
      });
    },
    readCurrentApplicationDocumentIdentity: () => {
      calls.push("identity");
      if (overrides.identity) return overrides.identity();
      return Object.freeze({ documentId: "document-v2-base", revision: 9 });
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
      const echoed = sent as Readonly<{
        identity: Readonly<{ requestId: number }>;
        expectedTransportGeneration: number;
      }>;
      return Promise.resolve(
        Object.freeze({
          ok: true,
          value: Object.freeze({
            schema: "changes.x1-replacement-retirement-evidence.v1",
            authority: "x1-serialized-transport",
            request: sent,
            receipt: Object.freeze({
              requestId: echoed.identity.requestId,
              retiredTransportGeneration: echoed.expectedTransportGeneration,
              progressionRetired: true,
              previewRetired: true,
              noFutureAttack: true,
            }),
          }),
        }),
      ) as never;
    },
  });
  return {
    driver: createE0V2TransactionDriver(ports, x1),
    calls,
    prepareRequests,
  };
}

describe("E0 v2 resolution fixture conformance (commit driver)", () => {
  test("RESCASE-001: the state-free request literal has the exact key set and drives to committed", async () => {
    const wf = row("E0V2-RESCASE-001");
    const expectedKeys = wf["expectedRequestTopLevelKeys"] as readonly string[];
    expect(Object.keys(COMMIT_REQUEST).sort()).toEqual(
      [...expectedKeys].sort(),
    );
    const h = makeHarness();
    const result = await h.driver(COMMIT_REQUEST);
    expect(result.ok).toBe(true);
  });

  test("RESCASE-002: a smuggled currentState refuses request-invalid with zero owner calls", async () => {
    const wf = row("E0V2-RESCASE-002");
    const smuggled = materialize(wf["request"]) as CommitImportReplacementRequestV2;
    const expected = materialize(wf["expectedResult"]);
    const h = makeHarness();
    const result = await h.driver(smuggled);
    expect(result as unknown).toEqual(expected);
    expect(h.calls).toEqual([]);
  });

  test("RESCASE-005: success is state-free with the exact key set and never a nested publication.state", async () => {
    const wf = row("E0V2-RESCASE-005");
    const expected = materialize(wf["expectedResult"]);
    const h = makeHarness();
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
    expect(Object.keys(result).sort()).toEqual(
      [...(wf["expectedResultTopLevelKeys"] as readonly string[])].sort(),
    );
    expect(JSON.stringify(result)).not.toContain('"state"');
  });

  test("RESCASE-006: one smuggled publication.state key makes the success protocol-invalid, not data", async () => {
    const wf = row("E0V2-RESCASE-006");
    const expected = materialize(wf["expectedResult"]);
    const h = makeHarness({
      publish: () => ({
        ok: true,
        outcome: "committed",
        identity: IDENTITY,
        documentId: "document-e0-minimal",
        revision: 10,
        effects: [],
        counters: COUNTERS,
        liveForRequest: 0,
        publication: { state: { $smuggledAppState: true } },
      }),
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
  });

  test("RESCASE-007: a preparation refusal surfaces the owner code with observedIdentity", async () => {
    const wf = row("E0V2-RESCASE-007");
    const expected = materialize(wf["expectedResult"]);
    const h = makeHarness({
      prepare: () => ({ ok: false, code: "import.replacement_request_stale" }),
      identity: () =>
        Object.freeze({ documentId: "document-v2-base", revision: 11 }),
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
    expect(Object.keys(result).sort()).toEqual(
      [...(wf["expectedResultTopLevelKeys"] as readonly string[])].sort(),
    );
  });

  test("RESCASE-008: the retirement-stage refusal keeps the state-free shape with the transport code", async () => {
    const wf = row("E0V2-RESCASE-008");
    const expected = materialize(wf["expectedResult"]);
    const h = makeHarness({
      retire: () =>
        Promise.resolve({
          ok: false,
          code: "transport.replacement_retirement_stale",
          retirementEffect: "none",
        }),
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
  });

  test("RESCASE-009: the publication protocol failure carries observedIdentity plus the reconciliation obligation", async () => {
    const wf = row("E0V2-RESCASE-009");
    const expected = materialize(wf["expectedResult"]);
    const h = makeHarness({
      publish: () => {
        throw new Error("PUBLISH_THREW");
      },
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
    expect(Object.keys(result).sort()).toEqual(
      [...(wf["expectedResultTopLevelKeys"] as readonly string[])].sort(),
    );
  });

  test("RESCASE-010: an owner-widened code (absent from v1's six) surfaces verbatim", async () => {
    const wf = row("E0V2-RESCASE-010");
    const expected = materialize(wf["expectedResult"]) as Readonly<{
      code: string;
    }>;
    expect(wf["codeIsMemberOfOwnerTwenty"]).toBe(true);
    expect(
      IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES.some(
        (code) => code === expected.code,
      ),
    ).toBe(true);
    const h = makeHarness({
      prepare: () => ({ ok: false, code: expected.code }),
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
  });

  test("RESCASE-011: a v1-era code surfaces with its exact unrenamed name", async () => {
    const wf = row("E0V2-RESCASE-011");
    const expected = materialize(wf["expectedResult"]) as Readonly<{
      code: string;
    }>;
    expect(wf["codeIsMemberOfV1Six"]).toBe(true);
    const h = makeHarness({
      prepare: () => ({ ok: false, code: expected.code }),
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
  });

  test("RESCASE-012: a code outside the owner twenty cannot enter the v2 result", async () => {
    const wf = row("E0V2-RESCASE-012");
    const expected = materialize(wf["expectedResult"]) as Readonly<{
      code: string;
    }>;
    /* The fixture row is itself the negative artifact: its code is not a
     * member of the tuple, so the driver must NEVER emit that result. */
    expect(wf["expectedFixtureFailure"]).toBe("E0V2_RESCASE_CODE_UNKNOWN");
    expect(
      IMPORT_REPLACEMENT_PREPARATION_REFUSAL_CODES.some(
        (code) => code === expected.code,
      ),
    ).toBe(false);
    const h = makeHarness({
      prepare: () => ({ ok: false, code: expected.code }),
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual({
      port: "prepareImportReplacementPublication",
      reason: "invalid-envelope",
      rawResultRetained: false,
    } as never);
  });

  test("RESCASE-013: the owner's publication refusal surfaces at the owner-publication stage", async () => {
    const wf = row("E0V2-RESCASE-013");
    const expected = materialize(wf["expectedResult"]) as Readonly<{
      code: string;
    }>;
    expect(
      IMPORT_REPLACEMENT_PUBLICATION_REFUSAL_CODES.some(
        (code) => code === expected.code,
      ),
    ).toBe(true);
    const h = makeHarness({
      publish: () => ({
        ok: false,
        outcome: "refused",
        code: expected.code,
        identity: IDENTITY,
        observedDocumentId: "document-v2-base",
        observedRevision: 9,
        liveForRequest: 0,
      }),
    });
    const result = await h.driver(COMMIT_REQUEST);
    expect(result as unknown).toEqual(expected);
  });

  test("RESCASE-016: the groove-witness candidate travels by reference, never redecoded", async () => {
    const wf = row("E0V2-RESCASE-016");
    const request = materialize(wf["request"]) as CommitImportReplacementRequestV2;
    const witness = wf["grooveWitness"] as Readonly<{
      storedGrooveStyleId: string;
    }>;
    const candidate = request.ownerRequest.candidate as unknown as Readonly<{
      playback: Readonly<{ grooveStyleId?: string }>;
    }>;
    expect(candidate.playback.grooveStyleId).toBe(witness.storedGrooveStyleId);
    const h = makeHarness();
    const result = await h.driver(request);
    expect(result.ok).toBe(true);
    /* by-reference law: the owner port received the exact candidate object */
    const received = h.prepareRequests[0] as Readonly<{ candidate: unknown }>;
    expect(received.candidate).toBe(candidate);
  });
});
