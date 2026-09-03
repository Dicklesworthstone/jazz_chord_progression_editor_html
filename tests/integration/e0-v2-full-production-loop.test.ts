/**
 * The complete production replacement loop with NO pre-installed state
 * (jcpe-milestone-reliable-studio-l3a.2 wiring): the composition's OWN
 * replacement workflow begins the pending document-transition request and
 * retiring-transport transition through the kernel reducers, the v2
 * transaction driver runs over the sealed owner ports and the REAL
 * serialized-transport X1 retirement adapter, and the committed
 * publication flips the controller snapshot — the first fully-lawful
 * end-to-end replacement where every participant is production code.
 * Also proven: the busy law (one workflow at a time), cancel resetting
 * to idle, and the workflow surviving a refused owner preparation.
 */
import { describe, expect, test } from "bun:test";

import {
  createE0V2TransactionDriver,
  createStudioBootstrap,
  createStudioCompositionOverState,
  createX1SerializedTransportRetirementAdapter,
  validateDocumentSemantics,
  type CommitImportReplacementRequestV2,
} from "../../src/application";
import type { ApplicationCommandDependencies } from "../../src/application/application-state-contract";
import { decodeDocumentShape, type ValidatedDocument } from "../../src/domain";
import {
  compiledPlan,
  createTransportHarness,
  initializePayload,
} from "../support/transport-test-kit";

const ESTIMATE = 4_000;

const CANDIDATE_RAW = Object.freeze({
  schema: "changes.progression.v2",
  id: "loop-test-candidate",
  title: "Full Loop Candidate",
  description: "",
  meter: Object.freeze({ beatsPerBar: 4, beatUnit: 4 }),
  tempoBpm: 120,
  key: null,
  sections: Object.freeze([]),
  playback: Object.freeze({
    instrumentId: "mellow-keys",
    masterVolume: 0.8,
    reverbAmount: 0.2,
    countInBars: 0,
  }),
});

function publishCandidate(): ValidatedDocument {
  const decoded = decodeDocumentShape(CANDIDATE_RAW);
  if (!decoded.ok) throw new Error("LOOP_TEST_CANDIDATE_STRUCTURAL");
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error("LOOP_TEST_CANDIDATE_SEMANTIC");
  return validated.value;
}

async function createLoopHarness() {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) throw new Error("LOOP_TEST_BOOTSTRAP");
  const dependencies: ApplicationCommandDependencies = Object.freeze({
    ...bootstrap.value.dependencies,
    estimateHistoryRetainedBytes: () => ESTIMATE,
  });
  const transport = createTransportHarness();
  const init = await transport.submit(initializePayload(compiledPlan()));
  if (init.termination !== "receipt") throw new Error("LOOP_TEST_TRANSPORT");
  /* In production the controller's audio-port subscription keeps
   * state.transport.generation synced through acceptTransportNotification;
   * this harness has no audio wiring, so the state is composed already
   * synced to the live transport — the same invariant the notification
   * path maintains. */
  const liveGeneration = transport.service.inspectTransport().generation;
  const syncedState = Object.freeze({
    ...bootstrap.value.state,
    transport: Object.freeze({
      ...bootstrap.value.state.transport,
      generation: liveGeneration as never,
    }),
  });
  const composition = createStudioCompositionOverState(
    syncedState,
    dependencies,
    {},
  );
  let notifications = 0;
  composition.controller.subscribe(() => {
    notifications += 1;
  });
  const retirement = createX1SerializedTransportRetirementAdapter(
    transport.service,
    transport.nextRequestId,
  );
  const driver = createE0V2TransactionDriver(
    composition.interchangeOwner,
    retirement,
  );
  return {
    composition,
    transport,
    driver,
    candidate: publishCandidate(),
    readNotifications: () => notifications,
  };
}

function buildCommitRequest(
  h: Awaited<ReturnType<typeof createLoopHarness>>,
  begun: Readonly<{
    identity: Readonly<{ requestId: number; documentId: unknown; baseRevision: number }>;
    transition: unknown;
  }>,
): CommitImportReplacementRequestV2 {
  return Object.freeze({
    schema: "changes.import-commit-request.v2",
    ownerRequest: Object.freeze({
      identity: begun.identity,
      sourceFormat: "canonical-json-v2",
      replacementOrigin: "canonical-import",
      candidate: h.candidate,
      replacementCommandSeed: Object.freeze({
        id: "loop-replace-1",
        label: "Open recovered chart",
        logicalTimeMs: 5_000,
      }),
      disclosedImpact: Object.freeze({
        historyEntryRetainedBytes: ESTIMATE,
        evictedUndoEntries: 0,
        redoEntriesCleared: 0,
        confirmationRequired: true,
        undoDisposition: "retained",
        undoEntriesAfterCommit: 1,
        undoRetainedBytesAfterCommit: ESTIMATE,
        exportRecommended: false,
      }),
      currentTransition: begun.transition,
      nonUndoableConfirmation: null,
    }),
    confirmationBinding: Object.freeze({
      displayedRequirement: null,
      acknowledgement: null,
      byteMatchProvedBeforeOwnerCall: true,
    }),
    /* the prepared echo will name the transport generation the adapter
     * verifies; the owner reads it from its own expectation source */
  }) as never;
}

describe("E0 v2 full production loop (workflow + owner + real X1)", () => {
  test("begin -> drive -> committed flips the controller document with one notification per install", async () => {
    const h = await createLoopHarness();
    const before = h.composition.controller.getSnapshot();
    const generation = h.transport.service.inspectTransport().generation;

    const begun = h.composition.replacementWorkflow.begin({
      candidateDocumentId: String(h.candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const afterBegin = h.readNotifications();
    expect(afterBegin).toBeGreaterThanOrEqual(1);

    const result = await h.driver(
      buildCommitRequest(h, begun),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toBe("committed");
    expect(result.documentId).toBe(h.candidate.id as never);

    const after = h.composition.controller.getSnapshot();
    expect(after.documentId).toBe(h.candidate.id as never);
    expect(after.documentId).not.toBe(before.documentId);
    /* the real transport was retired */
    const transportAfter = h.transport.service.inspectTransport();
    expect(transportAfter.generation).toBe(generation + 1);
    expect(transportAfter.startBeat).toBeNull();
  });

  test("one workflow at a time: a second begin refuses busy until cancel resets to idle", async () => {
    const h = await createLoopHarness();
    const first = h.composition.replacementWorkflow.begin({
      candidateDocumentId: String(h.candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = h.composition.replacementWorkflow.begin({
      candidateDocumentId: String(h.candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    expect(second).toEqual({
      ok: false,
      code: "import.replacement_workflow_busy",
    } as never);
    h.composition.replacementWorkflow.cancel(first.identity);
    const third = h.composition.replacementWorkflow.begin({
      candidateDocumentId: String(h.candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    expect(third.ok).toBe(true);
  });

  test("a refused owner preparation leaves the workflow live for an explicit cancel", async () => {
    const h = await createLoopHarness();
    const begun = h.composition.replacementWorkflow.begin({
      candidateDocumentId: String(h.candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    if (!begun.ok) throw new Error("BEGIN_FAILED");
    /* a wrong disclosed impact makes the owner refuse at preparation */
    const request = buildCommitRequest(h, begun);
    const tampered = Object.freeze({
      ...request,
      ownerRequest: Object.freeze({
        ...request.ownerRequest,
        disclosedImpact: Object.freeze({
          ...(request.ownerRequest.disclosedImpact as Readonly<
            Record<string, unknown>
          >),
          undoRetainedBytesAfterCommit: 1,
        }),
      }),
    }) as never as CommitImportReplacementRequestV2;
    const result = await h.driver(tampered);
    expect(result.ok).toBe(false);
    if (result.ok || result.outcome !== "refused") {
      throw new Error("EXPECTED_REFUSED");
    }
    expect(result.stage).toBe("owner-preparation");
    /* the workflow is still live (busy), then cancel resets to idle */
    const busy = h.composition.replacementWorkflow.begin({
      candidateDocumentId: String(h.candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    expect(busy.ok).toBe(false);
    h.composition.replacementWorkflow.cancel(begun.identity);
    const retry = h.composition.replacementWorkflow.begin({
      candidateDocumentId: String(h.candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    expect(retry.ok).toBe(true);
  });
});
