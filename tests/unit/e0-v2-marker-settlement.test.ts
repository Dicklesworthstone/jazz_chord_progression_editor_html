/**
 * E0 v2 marker settlement conformance
 * (jcpe-milestone-reliable-studio-l3a.8.2 stage 4): the state-free
 * RES-08/RES-11 settlement driver over scripted owner ports, replaying
 * the marker-path fixture rows — RESCASE-014 (exact v2 request key sets),
 * RESCASE-015 (a smuggled v1 `state` refuses before the CAS port, zero
 * owner calls), and WF-007 (a malformed CAS return is the
 * invalid-envelope diagnostic with application reconciliation and no A1
 * call) — plus the section-11 clock law, the A0-refusal projection, and
 * the A1 pending-failed/recovery-persisted split.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  createE0V2MarkerSettlementDriver,
  type CompleteCanonicalExportMarkerSettlementRequestV2,
  type MarkerEligibleCanonicalExportDelivery,
} from "../../src/application";
import type { A0E0InterchangeOwnerPorts } from "../../src/application/application-interchange-owner-contract";

const workflowFixturePath = resolve(
  import.meta.dirname,
  "../fixtures/interchange-v2/workflow-cases.json",
);
const resolutionFixturePath = resolve(
  import.meta.dirname,
  "../fixtures/interchange-v2/resolution-cases.json",
);

const workflowFixture = JSON.parse(
  await readFile(workflowFixturePath, "utf8"),
) as Readonly<{ cases: readonly Readonly<Record<string, unknown>>[] }>;
const resolutionFixture = JSON.parse(
  await readFile(resolutionFixturePath, "utf8"),
) as Readonly<{ cases: readonly Readonly<Record<string, unknown>>[] }>;

function row(
  fixture: Readonly<{ cases: readonly Readonly<Record<string, unknown>>[] }>,
  id: string,
): Readonly<Record<string, unknown>> {
  const found = fixture.cases.find((entry) => entry["id"] === id);
  if (found === undefined) throw new Error(`MISSING_FIXTURE_ROW:${id}`);
  return found;
}

const VALID_INSTANT = "2026-09-03T05:00:00.000Z";

const DELIVERY = Object.freeze({
  ok: true,
  outcome: "handed-off",
  artifact: Object.freeze({
    kind: "canonical-json",
    sourceDocumentId: "document-v2-base",
    filename: "document-v2-base.changes.json",
    byteLength: 512,
    semanticDocumentHash: "a".repeat(64),
  }),
  cleanup: "complete",
  outstandingOwnedResources: 0,
}) as never as MarkerEligibleCanonicalExportDelivery;

const REQUEST = Object.freeze({
  schema: "changes.canonical-export-marker-settlement-request.v2",
  ownerRequest: Object.freeze({
    publication: Object.freeze({
      schema: "changes.canonical-export-revision-publication.v1",
      documentId: "document-v2-base",
      revision: 9,
    }),
  }),
}) as never as CompleteCanonicalExportMarkerSettlementRequestV2;

type Overrides = Readonly<{
  marker?: () => unknown;
  a1?: (handoff: unknown) => Promise<unknown>;
  clock?: () => unknown;
}>;

function makeHarness(overrides: Overrides = {}) {
  const calls: string[] = [];
  const a1Handoffs: unknown[] = [];
  const ports: A0E0InterchangeOwnerPorts = {
    prepareImportReplacementPublication: () => {
      calls.push("prepare");
      throw new Error("IMPORT_PORTS_MUST_NOT_RUN_IN_MARKER_PATH");
    },
    discardImportReplacementPublication: () => {
      calls.push("discard");
      throw new Error("IMPORT_PORTS_MUST_NOT_RUN_IN_MARKER_PATH");
    },
    publishImportReplacement: () => {
      calls.push("publish");
      throw new Error("IMPORT_PORTS_MUST_NOT_RUN_IN_MARKER_PATH");
    },
    readCurrentApplicationDocumentIdentity: () => {
      calls.push("identity");
      return Object.freeze({ documentId: "document-v2-base", revision: 9 });
    },
    publishCanonicalExportRevision: () => {
      calls.push("marker");
      if (overrides.marker) return overrides.marker();
      return Object.freeze({
        ok: true,
        outcome: "published",
        documentId: "document-v2-base",
        revision: 9,
      });
    },
  };
  const driver = createE0V2MarkerSettlementDriver(
    ports,
    (handoff) => {
      calls.push("a1");
      a1Handoffs.push(handoff);
      if (overrides.a1) return overrides.a1(handoff);
      return Promise.resolve(
        Object.freeze({
          ok: true,
          outcome: "persisted",
          durability: "recovery-persisted",
        }),
      );
    },
    overrides.clock ?? (() => VALID_INSTANT),
  );
  return { driver, calls, a1Handoffs };
}

describe("E0 v2 marker settlement (state-free, scripted ports)", () => {
  test("RESCASE-014: the v2 request literals carry exactly the pinned key sets", () => {
    const wf = row(resolutionFixture, "E0V2-RESCASE-014");
    const markerRequest = wf["markerRequest"] as Readonly<Record<string, unknown>>;
    const deliveryRequest = wf["deliveryRequest"] as Readonly<Record<string, unknown>>;
    expect(Object.keys(markerRequest).sort()).toEqual(
      [...(wf["expectedMarkerRequestTopLevelKeys"] as readonly string[])].sort(),
    );
    expect(Object.keys(deliveryRequest).sort()).toEqual(
      [...(wf["expectedDeliveryRequestTopLevelKeys"] as readonly string[])].sort(),
    );
    /* and the settlement driver ACCEPTS the pinned marker-request literal */
    expect(Object.keys(REQUEST).sort()).toEqual(
      [...(wf["expectedMarkerRequestTopLevelKeys"] as readonly string[])].sort(),
    );
  });

  test("RESCASE-015: a smuggled v1 state refuses request-invalid before the CAS port", async () => {
    const wf = row(resolutionFixture, "E0V2-RESCASE-015");
    expect(wf["expectedFixtureFailure"]).toBe("E0V2_STATE_KEY_FORBIDDEN");
    const smuggled = wf["markerRequest"] as CompleteCanonicalExportMarkerSettlementRequestV2;
    const h = makeHarness();
    const result = await h.driver(smuggled, DELIVERY);
    expect(result).toEqual({
      ok: false,
      outcome: "refused",
      code: "export.marker_request_invalid",
    } as never);
    expect(h.calls).toEqual([]);
  });

  test("WF-007: a malformed CAS return is the invalid-envelope diagnostic with no A1 call", async () => {
    const wf = row(workflowFixture, "E0V2-WF-007");
    const h = makeHarness({
      marker: () => ({
        ok: true,
        outcome: "published",
        documentId: "document-v2-base",
        revision: 9,
        observedBefore: { $v1AdapterState: true },
      }),
    });
    const result = await h.driver(REQUEST, DELIVERY);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual(wf["expectedDiagnostic"] as never);
    expect(result.applicationReconciliation).toBe("required");
    expect(h.calls.filter((c) => c === "a1").length).toBe(
      wf["a1Calls"] as number,
    );
  });

  test("a CAS throw maps to threw-or-rejected with application reconciliation and no A1", async () => {
    const h = makeHarness({
      marker: () => {
        throw new Error("CAS_THREW");
      },
    });
    const result = await h.driver(REQUEST, DELIVERY);
    if (result.ok || result.outcome !== "protocol-invalid") {
      throw new Error("EXPECTED_PROTOCOL_INVALID");
    }
    expect(result.diagnostic).toEqual({
      port: "publishCanonicalExportRevision",
      reason: "threw-or-rejected",
      rawResultRetained: false,
    } as never);
    expect(h.calls).not.toContain("a1");
  });

  test("an artifact/document mismatch refuses before any port call", async () => {
    const h = makeHarness();
    const mismatched = Object.freeze({
      schema: "changes.canonical-export-marker-settlement-request.v2",
      ownerRequest: Object.freeze({
        publication: Object.freeze({
          schema: "changes.canonical-export-revision-publication.v1",
          documentId: "some-other-document",
          revision: 9,
        }),
      }),
    }) as never as CompleteCanonicalExportMarkerSettlementRequestV2;
    const result = await h.driver(mismatched, DELIVERY);
    expect(result).toEqual({
      ok: false,
      outcome: "refused",
      code: "export.marker_artifact_mismatch",
    } as never);
    expect(h.calls).toEqual([]);
  });

  test("section-11 clock law: a noncanonical instant refuses with no A0/A1 call", async () => {
    for (const bad of [
      "2026-09-03T05:00:00Z" /* no milliseconds */,
      "2026-09-03T05:00:00.000+00:00" /* offset form */,
      "not-a-date-24-chars-xxxx" /* right length, invalid */,
      1725000000000 /* wrong type */,
      null,
    ]) {
      const h = makeHarness({ clock: () => bad });
      const result = await h.driver(REQUEST, DELIVERY);
      expect(result).toEqual({
        ok: false,
        outcome: "refused",
        code: "export.marker_timestamp_invalid",
      } as never);
      expect(h.calls).toEqual([]);
    }
    /* a throwing clock is the same refusal */
    const h = makeHarness({
      clock: () => {
        throw new Error("CLOCK_THREW");
      },
    });
    const result = await h.driver(REQUEST, DELIVERY);
    expect(result).toEqual({
      ok: false,
      outcome: "refused",
      code: "export.marker_timestamp_invalid",
    } as never);
  });

  test("an A0 stale refusal projects only the observed identity and makes no A1 call", async () => {
    const h = makeHarness({
      marker: () => ({
        ok: false,
        outcome: "refused",
        code: "export.marker_publication_stale",
        observedDocumentId: "document-v2-base",
        observedRevision: 12,
      }),
    });
    const result = await h.driver(REQUEST, DELIVERY);
    expect(result).toEqual({
      ok: false,
      outcome: "publication-refused",
      code: "export.marker_publication_stale",
      observedDocumentId: "document-v2-base",
      observedRevision: 12,
    } as never);
    expect(h.calls).not.toContain("a1");
  });

  test("checked A0 success derives the handoff from the consumed artifact and persists via A1", async () => {
    const h = makeHarness();
    const result = await h.driver(REQUEST, DELIVERY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("advanced");
    expect(result.receipt).toEqual({
      documentId: "document-v2-base",
      revision: 9,
    } as never);
    expect(result.durability).toBe("recovery-persisted");
    expect(result.handoff.marker).toEqual({
      documentId: "document-v2-base",
      revision: 9,
      exportedAt: VALID_INSTANT,
      semanticDocumentHash: "a".repeat(64),
      canonicalPolicyVersion: 1,
      semanticHashPolicyVersion: 1,
    } as never);
    expect(result.handoff.artifact.filename).toBe(
      "document-v2-base.changes.json",
    );
    expect(h.calls).toEqual(["marker", "a1"]);
  });

  test("an A1 refusal is pending-failed, never a durability claim", async () => {
    const h = makeHarness({
      a1: () =>
        Promise.resolve({
          ok: false,
          outcome: "unavailable",
          code: "recovery.marker_persistence_unavailable",
          durability: "pending-failed",
        }),
    });
    const result = await h.driver(REQUEST, DELIVERY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.durability).toBe("pending-failed");
  });

  test("a malformed or rejecting A1 return is persistence-protocol-invalid with reconciliation", async () => {
    for (const overrides of [
      { a1: () => Promise.resolve({ ok: true, outcome: "persisted", durability: "recovery-persisted", state: "smuggled" }) },
      { a1: () => Promise.reject(new Error("A1_REJECTED")) },
    ] as const) {
      const h = makeHarness(overrides);
      const result = await h.driver(REQUEST, DELIVERY);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.outcome).toBe("persistence-protocol-invalid");
      if (result.outcome !== "persistence-protocol-invalid") continue;
      expect(result.durability).toBe("reconciliation-required");
      /* the A0 receipt survives: the marker WAS published */
      expect(result.receipt.revision).toBe(9);
    }
  });
});
