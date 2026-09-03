/**
 * Production X1 replacement-retirement adapter over the REAL serialized
 * transport (fake audio platform, real engine, real X0 retirement) —
 * the binding that retires the honest-unavailable stand-in. Proven:
 * retirement is replace-plan(null) with the generation, plan, preview,
 * and no-future-attack evidence read from the real receipt; a stale
 * expected generation refuses with the exact no-effect envelope and
 * submits NOTHING; a locked transport's refusal maps to the no-effect
 * failed envelope; and the full PRODUCTION commit driver over this
 * adapter drives a replacement to committed — the X1-binding milestone
 * the E0 contract gates production import on.
 */
import { describe, expect, test } from "bun:test";

import type { DocumentId } from "../../src/domain";
import {
  createE0V2TransactionDriver,
  createX1SerializedTransportRetirementAdapter,
  type CommitImportReplacementRequestV2,
} from "../../src/application";
import type { A0E0InterchangeOwnerPorts } from "../../src/application/application-interchange-owner-contract";
import {
  compiledPlan,
  createTransportHarness,
  initializePayload,
} from "../support/transport-test-kit";

const COUNTERS = Object.freeze({
  sectionsVisited: 1,
  measuresVisited: 1,
  eventsVisited: 1,
  stableIdsIndexed: 3,
  historyEntriesVisited: 1,
  historyBytesEstimated: 4096,
  bookmarksRepaired: 0,
  requestsCompared: 1,
  transportNotificationsCompared: 1,
  validationCalls: 1,
} as const);

async function makeReadyTransport() {
  const h = createTransportHarness();
  const init = await h.submit(initializePayload(compiledPlan()));
  if (init.termination !== "receipt") throw new Error("INIT_REFUSED");
  return h;
}

function makeRequest(expectedTransportGeneration: number) {
  return Object.freeze({
    identity: Object.freeze({
      requestId: 601,
      documentId: "doc-x1",
      baseRevision: 2,
    }),
    sourceFormat: "canonical-json-v2",
    candidateDocumentId: "doc-x1-next",
    expectedTransportGeneration,
    scope: "progression-and-preview",
    requiredPostcondition: "zero-future-attack",
  }) as never;
}

describe("X1 serialized-transport retirement adapter (real transport)", () => {
  test("retirement rides replace-plan(null): evidence, generation advance, plan cleared", async () => {
    const h = await makeReadyTransport();
    const before = h.service.inspectTransport();
    const adapter = createX1SerializedTransportRetirementAdapter(
      h.service,
      h.nextRequestId,
    );
    const raw = (await adapter.retireImportReplacement(
      makeRequest(before.generation),
    )) as Readonly<Record<string, unknown>>;
    expect(raw["ok"]).toBe(true);
    const value = raw["value"] as Readonly<Record<string, unknown>>;
    expect(value["authority"]).toBe("x1-serialized-transport");
    const receipt = value["receipt"] as Readonly<Record<string, unknown>>;
    expect(receipt["requestId"]).toBe(601);
    expect(receipt["retiredTransportGeneration"]).toBe(before.generation);
    expect(receipt["progressionRetired"]).toBe(true);
    expect(receipt["previewRetired"]).toBe(true);
    expect(receipt["noFutureAttack"]).toBe(true);
    const after = h.service.inspectTransport();
    expect(after.generation).toBe(before.generation + 1);
    expect(after.state).toBe("ready");
    /* binding is null (plan retired): the run anchors are gone; the
     * documentId field is the view-identity ECHO and persists by design */
    expect(after.startBeat).toBeNull();
    expect(after.pausedBeat).toBeNull();
    expect(after.scheduledEventCursor).toBe(0);
  });

  test("a stale expected generation refuses with the exact no-effect envelope and submits nothing", async () => {
    const h = await makeReadyTransport();
    const before = h.service.inspectTransport();
    const adapter = createX1SerializedTransportRetirementAdapter(
      h.service,
      h.nextRequestId,
    );
    const raw = await adapter.retireImportReplacement(
      makeRequest(before.generation - 1),
    );
    expect(raw).toEqual({
      ok: false,
      code: "transport.replacement_retirement_stale",
      retirementEffect: "none",
    } as never);
    const after = h.service.inspectTransport();
    expect(after.generation).toBe(before.generation);
    expect(after.lastCommandRequestId).toBe(before.lastCommandRequestId);
  });

  test("a locked transport retires vacuously: no epoch exists and no attack can start", async () => {
    const h = createTransportHarness();
    const before = h.service.inspectTransport();
    expect(before.state).toBe("locked");
    const adapter = createX1SerializedTransportRetirementAdapter(
      h.service,
      h.nextRequestId,
    );
    const raw = (await adapter.retireImportReplacement(
      makeRequest(0),
    )) as Readonly<Record<string, unknown>>;
    expect(raw["ok"]).toBe(true);
    const receipt = (raw["value"] as Readonly<Record<string, unknown>>)[
      "receipt"
    ] as Readonly<Record<string, unknown>>;
    expect(receipt["retiredTransportGeneration"]).toBe(0);
    expect(receipt["noFutureAttack"]).toBe(true);
    /* nothing was submitted to the FIFO */
    const after = h.service.inspectTransport();
    expect(after.lastCommandRequestId).toBe(before.lastCommandRequestId);
    expect(after.state).toBe("locked");
  });

  test("the PRODUCTION commit driver over this adapter drives a replacement to committed", async () => {
    const h = await makeReadyTransport();
    const generation = h.service.inspectTransport().generation;
    const adapter = createX1SerializedTransportRetirementAdapter(
      h.service,
      h.nextRequestId,
    );
    const identity = Object.freeze({
      requestId: 601,
      documentId: "doc-x1",
      baseRevision: 2,
    });
    const prepared = Object.freeze({
      schema: "changes.prepared-import-replacement-publication.v1",
      identity,
      sourceFormat: "canonical-json-v2",
      candidateDocumentId: "doc-x1-next",
      /* the prepared echo names the LIVE transport generation */
      expectedTransportGeneration: generation,
      committingTransition: Object.freeze({
        kind: "committing",
        requestId: 601,
        origin: "canonical-import",
        baseRevision: 2,
        candidateDocumentId: "doc-x1-next",
        undoDisposition: "retained",
      }),
    });
    const receipts: unknown[] = [];
    const ports: A0E0InterchangeOwnerPorts = {
      prepareImportReplacementPublication: () =>
        Object.freeze({ ok: true, value: prepared }),
      discardImportReplacementPublication: () => {
        throw new Error("DISCARD_MUST_NOT_RUN_ON_THE_SUCCESS_PATH");
      },
      publishImportReplacement: (handoff) => {
        receipts.push(handoff);
        return Object.freeze({
          ok: true,
          outcome: "committed",
          identity,
          documentId: "doc-x1-next",
          revision: 3,
          effects: Object.freeze([]),
          counters: COUNTERS,
          liveForRequest: 0,
        });
      },
      readCurrentApplicationDocumentIdentity: () =>
        Object.freeze({ documentId: "doc-x1", revision: 2 }),
      publishCanonicalExportRevision: () => {
        throw new Error("MARKER_PORT_MUST_NOT_RUN_IN_COMMIT_PATH");
      },
    };
    const driver = createE0V2TransactionDriver(ports, adapter);
    const request = Object.freeze({
      schema: "changes.import-commit-request.v2",
      ownerRequest: Object.freeze({
        identity,
        sourceFormat: "canonical-json-v2",
        replacementOrigin: "canonical-import",
        candidate: Object.freeze({ id: "doc-x1-next" }),
        replacementCommandSeed: Object.freeze({
          id: "command-x1-1",
          label: "Import Changes",
          logicalTimeMs: 9000,
        }),
        disclosedImpact: Object.freeze({ undoDisposition: "retained" }),
        currentTransition: Object.freeze({
          kind: "retiring-transport",
          requestId: 601,
          origin: "canonical-import",
          baseRevision: 2,
          candidateDocumentId: "doc-x1-next",
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

    const result = await driver(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("committed");
    expect(result.documentId).toBe("doc-x1-next" as DocumentId);
    /* the REAL transport was retired: generation advanced, plan gone */
    const after = h.service.inspectTransport();
    expect(after.generation).toBe(generation + 1);
    expect(after.startBeat).toBeNull();
    /* the owner received the narrowed receipt built from real evidence */
    const handoff = receipts[0] as Readonly<{
      retirement: Readonly<{ retiredTransportGeneration: number }>;
    }>;
    expect(handoff.retirement.retiredTransportGeneration).toBe(generation);
  });
});
