import { describe, expect, test } from "bun:test";

import { decodeDocumentShape, type ValidatedDocument } from "../../src/domain";
import {
  MAX_HISTORY_RETAINED_BYTES,
  createStudioBootstrap,
  createStudioCompositionOverState,
  createE0V2TransactionDriver,
  validateDocumentSemantics,
  type AppState,
  type ApplicationCommandDependencies,
  type PendingApplicationRequest,
  type StudioComposition,
  type X1ReplacementRetirementAdapter,
} from "../../src/application";
import type {
  ImportNonUndoableConfirmationAcknowledgement,
  ImportNonUndoableConfirmationRequirement,
  PrepareImportReplacementPublicationRequest,
} from "../../src/application/application-interchange-owner-contract";
import type {
  CommitImportReplacementRequestV2,
  E0V2RetainedConfirmationBinding,
} from "../../src/application/e0-interchange-v2-contract";

const REQUEST_ID = 201;
const STUB_ESTIMATE = 4_000;
const OVERSIZED_ESTIMATE = MAX_HISTORY_RETAINED_BYTES + 1;

const CANDIDATE_RAW = Object.freeze({
  schema: "changes.progression.v2",
  id: "driver-test-candidate",
  title: "Driver Test Candidate",
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

function publishCandidate(raw: unknown): ValidatedDocument {
  const decoded = decodeDocumentShape(raw);
  if (!decoded.ok) throw new Error("DRIVER_TEST_CANDIDATE_STRUCTURAL");
  const validated = validateDocumentSemantics(decoded.value);
  if (!validated.ok) throw new Error("DRIVER_TEST_CANDIDATE_SEMANTIC");
  return validated.value;
}

type HarnessOptions = Readonly<{
  disposition?: "retained" | "explicitly-unavailable";
  estimate?: number;
}>;

function createHarness(options: HarnessOptions = {}) {
  const bootstrap = createStudioBootstrap();
  expect(bootstrap.ok).toBe(true);
  if (!bootstrap.ok) throw new Error("DRIVER_TEST_BOOTSTRAP");

  const disposition = options.disposition ?? "retained";
  const estimate =
    options.estimate ??
    (disposition === "retained" ? STUB_ESTIMATE : OVERSIZED_ESTIMATE);

  const dependencies: ApplicationCommandDependencies = Object.freeze({
    ...bootstrap.value.dependencies,
    estimateHistoryRetainedBytes: () => estimate,
  });

  const candidate = publishCandidate(CANDIDATE_RAW);
  const base = bootstrap.value.state;
  const revision = base.revision;

  const pending: PendingApplicationRequest = Object.freeze({
    kind: "document-transition",
    id: REQUEST_ID,
    documentId: base.document.id,
    baseRevision: revision,
    status: "running",
  });

  const transition = Object.freeze({
    kind: "retiring-transport",
    requestId: REQUEST_ID,
    origin: "canonical-import",
    baseRevision: revision,
    candidateDocumentId: candidate.id,
    undoDisposition: disposition,
  } as const);

  const state: AppState = Object.freeze({
    ...base,
    pendingRequests: Object.freeze([pending]),
    documentTransition: transition,
  });

  const diagnostics: any[] = [];
  const composition = createStudioCompositionOverState(state, dependencies, {
    interchangeDiagnostics: (d) => diagnostics.push(d),
  });

  let notifications = 0;
  composition.controller.subscribe(() => {
    notifications++;
  });

  const retainedImpact = Object.freeze({
    historyEntryRetainedBytes: estimate,
    evictedUndoEntries: 0,
    redoEntriesCleared: 0,
    confirmationRequired: true,
    undoDisposition: "retained",
    undoEntriesAfterCommit: 1,
    undoRetainedBytesAfterCommit: estimate,
    exportRecommended: false,
  } as const);

  const unavailableImpact = Object.freeze({
    historyEntryRetainedBytes: estimate,
    evictedUndoEntries: 0,
    redoEntriesCleared: 0,
    confirmationRequired: true,
    undoDisposition: "explicitly-unavailable",
    undoEntriesAfterCommit: 0,
    undoRetainedBytesAfterCommit: 0,
    exportRecommended: true,
  } as const);

  const seed = Object.freeze({
    id: "driver-replace-1",
    label: "Import driver candidate",
    logicalTimeMs: 5_000,
  });

  const identity = Object.freeze({
    requestId: REQUEST_ID,
    documentId: base.document.id,
    baseRevision: revision,
  });

  let requirement: ImportNonUndoableConfirmationRequirement | null = null;
  let acknowledgement: ImportNonUndoableConfirmationAcknowledgement | null =
    null;

  if (disposition === "explicitly-unavailable") {
    requirement = Object.freeze({
      schema: "changes.import-nonundoable-confirmation.v1",
      confirmationId: "driver-confirm-1",
      identity,
      candidateDocumentId: candidate.id,
      commandId: seed.id,
      disclosedImpact: unavailableImpact,
    });
    acknowledgement = Object.freeze({
      kind: "acknowledged",
      requirement,
    });
  }

  const ownerRequest: PrepareImportReplacementPublicationRequest =
    Object.freeze({
      identity,
      sourceFormat: "canonical-json-v2",
      replacementOrigin: "canonical-import",
      candidate,
      replacementCommandSeed: seed,
      disclosedImpact:
        disposition === "retained" ? retainedImpact : unavailableImpact,
      currentTransition: transition,
      nonUndoableConfirmation: acknowledgement,
    });

  return {
    composition,
    state,
    candidate,
    ownerRequest,
    requirement,
    acknowledgement,
    getNotifications: () => notifications,
    diagnostics,
  };
}

describe("E0 v2 Transaction Driver Integration", () => {
  test("successfully drives a retained replacement to committed state", async () => {
    const h = createHarness({ disposition: "retained" });

    const x1Adapter: X1ReplacementRetirementAdapter = {
      retireImportReplacement: async (req) =>
        Object.freeze({
          ok: true,
          value: Object.freeze({
            schema: "changes.x1-replacement-retirement-evidence.v1",
            authority: "x1-serialized-transport",
            request: req,
            receipt: Object.freeze({
              requestId: req.identity.requestId,
              retiredTransportGeneration: 0,
              progressionRetired: true,
              previewRetired: true,
              noFutureAttack: true,
            }),
          }),
        }),
    };

    const driver = createE0V2TransactionDriver(
      h.composition.interchangeOwner,
      x1Adapter,
    );

    const binding: E0V2RetainedConfirmationBinding = Object.freeze({
      displayedRequirement: null,
      acknowledgement: null,
      byteMatchProvedBeforeOwnerCall: true,
    });

    const commitReq: CommitImportReplacementRequestV2 = Object.freeze({
      schema: "changes.import-commit-request.v2",
      ownerRequest: h.ownerRequest,
      confirmationBinding: binding,
    });

    const result = await driver(commitReq);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe("committed");
      expect(result.documentId).toBe(h.candidate.id);
      expect(result.revision).toBe(h.state.revision + 1);
      expect(result.liveForRequest).toBe(0);
    }

    const nextSnapshot = h.composition.controller.getSnapshot();
    expect(nextSnapshot.documentId).toBe(h.candidate.id);
    expect(nextSnapshot.revision).toBe(h.state.revision + 1);
    expect(h.getNotifications()).toBe(1);
  });

  test("successfully drives an explicitly-unavailable non-undoable replacement with consent", async () => {
    const h = createHarness({ disposition: "explicitly-unavailable" });

    const x1Adapter: X1ReplacementRetirementAdapter = {
      retireImportReplacement: async (req) =>
        Object.freeze({
          ok: true,
          value: Object.freeze({
            schema: "changes.x1-replacement-retirement-evidence.v1",
            authority: "x1-serialized-transport",
            request: req,
            receipt: Object.freeze({
              requestId: req.identity.requestId,
              retiredTransportGeneration: 0,
              progressionRetired: true,
              previewRetired: true,
              noFutureAttack: true,
            }),
          }),
        }),
    };

    const driver = createE0V2TransactionDriver(
      h.composition.interchangeOwner,
      x1Adapter,
    );

    const binding: E0V2RetainedConfirmationBinding = Object.freeze({
      displayedRequirement: h.requirement,
      acknowledgement: h.acknowledgement,
      byteMatchProvedBeforeOwnerCall: true,
    });

    const commitReq: CommitImportReplacementRequestV2 = Object.freeze({
      schema: "changes.import-commit-request.v2",
      ownerRequest: h.ownerRequest,
      confirmationBinding: binding,
    });

    const result = await driver(commitReq);
    if (!result.ok) {
      console.log("DRIVER_TEST_2_FAILED:", JSON.stringify(result));
      console.log("DRIVER_TEST_2_DIAGS:", JSON.stringify(h.diagnostics));
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe("committed");
      expect(result.effects.some((e) => e.kind === "recommend-export")).toBe(
        true,
      );
    }
  });

  test("refuses with pre-owner-provenance when non-undoable acknowledgement is missing", async () => {
    const h = createHarness({ disposition: "explicitly-unavailable" });

    const x1Adapter: X1ReplacementRetirementAdapter = {
      retireImportReplacement: async () => {
        throw new Error("X1 should not be called when provenance fails");
      },
    };

    const driver = createE0V2TransactionDriver(
      h.composition.interchangeOwner,
      x1Adapter,
    );

    const binding: E0V2RetainedConfirmationBinding = Object.freeze({
      displayedRequirement: h.requirement,
      acknowledgement: null,
      byteMatchProvedBeforeOwnerCall: true,
    });

    const commitReq: CommitImportReplacementRequestV2 = Object.freeze({
      schema: "changes.import-commit-request.v2",
      ownerRequest: h.ownerRequest,
      confirmationBinding: binding,
    });

    const result = await driver(commitReq);
    expect(result.ok).toBe(false);
    if (!result.ok && result.outcome === "refused") {
      expect(result.stage).toBe("pre-owner-provenance");
      expect(result.code).toBe("history.nonundoable_confirmation_required");
    }
  });

  test("refuses with pre-owner-provenance when acknowledgement does not match displayed requirement", async () => {
    const h = createHarness({ disposition: "explicitly-unavailable" });

    const x1Adapter: X1ReplacementRetirementAdapter = {
      retireImportReplacement: async () => {
        throw new Error("X1 should not be called when provenance fails");
      },
    };

    const driver = createE0V2TransactionDriver(
      h.composition.interchangeOwner,
      x1Adapter,
    );

    const forgedRequirement: ImportNonUndoableConfirmationRequirement =
      Object.freeze({
        ...h.requirement!,
        confirmationId: "different-id",
      });

    const binding: E0V2RetainedConfirmationBinding = Object.freeze({
      displayedRequirement: h.requirement,
      acknowledgement: Object.freeze({
        kind: "acknowledged",
        requirement: forgedRequirement,
      }),
      byteMatchProvedBeforeOwnerCall: true,
    });

    const commitReq: CommitImportReplacementRequestV2 = Object.freeze({
      schema: "changes.import-commit-request.v2",
      ownerRequest: h.ownerRequest,
      confirmationBinding: binding,
    });

    const result = await driver(commitReq);
    expect(result.ok).toBe(false);
    if (!result.ok && result.outcome === "refused") {
      expect(result.stage).toBe("pre-owner-provenance");
      expect(result.code).toBe("import.confirmation_identity_mismatch");
    }
  });

  test("handles X1 transport retirement failure and cleans up private preparation", async () => {
    const h = createHarness({ disposition: "retained" });

    const x1Adapter: X1ReplacementRetirementAdapter = {
      retireImportReplacement: async () =>
        Object.freeze({
          ok: false,
          code: "transport.replacement_retirement_failed",
          retirementEffect: "none",
        }),
    };

    const driver = createE0V2TransactionDriver(
      h.composition.interchangeOwner,
      x1Adapter,
    );

    const binding: E0V2RetainedConfirmationBinding = Object.freeze({
      displayedRequirement: null,
      acknowledgement: null,
      byteMatchProvedBeforeOwnerCall: true,
    });

    const commitReq: CommitImportReplacementRequestV2 = Object.freeze({
      schema: "changes.import-commit-request.v2",
      ownerRequest: h.ownerRequest,
      confirmationBinding: binding,
    });

    const result = await driver(commitReq);
    expect(result.ok).toBe(false);
    if (!result.ok && result.outcome === "refused") {
      expect(result.stage).toBe("transport-retirement");
      expect(result.code).toBe("transport.replacement_retirement_refused");
    }

    // Prove registry is clean (empty): a subsequent prepare succeeds without busy refusal
    const subsequentPrep =
      h.composition.interchangeOwner.prepareImportReplacementPublication(
        h.ownerRequest,
      );
    expect(subsequentPrep.ok).toBe(true);
  });
});
