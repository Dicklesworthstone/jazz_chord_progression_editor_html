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

  const diagnostics: unknown[] = [];
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
    (disposition === "retained"
      ? Object.freeze({
          identity,
          sourceFormat: "canonical-json-v2" as const,
          replacementOrigin: "canonical-import" as const,
          candidate,
          replacementCommandSeed: seed,
          disclosedImpact: retainedImpact,
          currentTransition: transition as never,
          nonUndoableConfirmation: null,
        })
      : Object.freeze({
          identity,
          sourceFormat: "canonical-json-v2" as const,
          replacementOrigin: "canonical-import" as const,
          candidate,
          replacementCommandSeed: seed,
          disclosedImpact: unavailableImpact,
          currentTransition: transition as never,
          nonUndoableConfirmation: acknowledgement,
        })) as PrepareImportReplacementPublicationRequest;

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

  const consentFields = [
    ["schema", "wrong-schema"],
    ["confirmationId", "other-confirmation"],
    ["candidateDocumentId", "other-document"],
    ["commandId", "other-command"],
    ["identity.requestId", 999],
    ["identity.documentId", "other-source"],
    ["identity.baseRevision", 999],
    ["disclosedImpact.historyEntryRetainedBytes", 1],
    ["disclosedImpact.evictedUndoEntries", 1],
    ["disclosedImpact.redoEntriesCleared", 1],
    ["disclosedImpact.confirmationRequired", false],
    ["disclosedImpact.undoDisposition", "retained"],
    ["disclosedImpact.undoEntriesAfterCommit", 1],
    ["disclosedImpact.undoRetainedBytesAfterCommit", 1],
    ["disclosedImpact.exportRecommended", false],
  ] as const;

  for (const scenario of [
    "reordered requirement", "reordered identity", "reordered impact",
    "reordered everywhere", "owner acknowledgement replaced",
    "serialization spoof", "throwing serialization hook",
    "requirement getter", "throwing reflection", "extra symbol",
    ...consentFields.map(([path]) => `changed ${path}`),
  ]) {
    test(`consent provenance: ${scenario}`, async () => {
      const h = createHarness({ disposition: "explicitly-unavailable" });
      const displayed = h.requirement;
      if (displayed === null || h.ownerRequest.nonUndoableConfirmation === null) {
        throw new Error("NONUNDOABLE_HARNESS_REQUIRED");
      }
      const reverse = (value: object) => Object.freeze(
        Object.fromEntries(Object.entries(value).reverse()),
      );
      let acknowledged: unknown = displayed;
      let ownerAcknowledgement = h.ownerRequest.nonUndoableConfirmation;
      let hookCalls = 0;
      const shouldCommit = scenario.startsWith("reordered");
      if (shouldCommit) {
        const reordered = {
          ...displayed,
          identity: scenario === "reordered identity" || scenario === "reordered everywhere"
            ? reverse(displayed.identity) : displayed.identity,
          disclosedImpact: scenario === "reordered impact" || scenario === "reordered everywhere"
            ? reverse(displayed.disclosedImpact) : displayed.disclosedImpact,
        };
        acknowledged = scenario === "reordered requirement" || scenario === "reordered everywhere"
          ? reverse(reordered) : Object.freeze(reordered);
      } else if (scenario === "owner acknowledgement replaced") {
        ownerAcknowledgement = Object.freeze({
          kind: "acknowledged",
          requirement: Object.freeze({ ...displayed, confirmationId: "other-valid-id" }),
        });
      } else if (scenario.includes("serialization")) {
        acknowledged = Object.freeze({
          ...displayed, confirmationId: "unseen-confirmation",
          toJSON: () => {
            hookCalls++;
            if (scenario === "throwing serialization hook") throw new Error("SERIALIZATION_HOOK");
            return displayed;
          },
        });
      } else if (scenario === "requirement getter") {
        acknowledged = Object.freeze(Object.defineProperty({ ...displayed }, "confirmationId", {
          enumerable: true,
          get: () => { hookCalls++; return displayed.confirmationId; },
        }));
      } else if (scenario === "throwing reflection") {
        acknowledged = new Proxy(displayed, { ownKeys: () => { throw new Error("REFLECTION_TRAP"); } });
      } else if (scenario === "extra symbol") {
        acknowledged = Object.freeze({ ...displayed, [Symbol("extra")]: true });
      } else {
        const mutation = consentFields.find(([path]) => scenario === `changed ${path}`);
        if (mutation === undefined) throw new Error("UNKNOWN_CONSENT_CASE");
        const [path, value] = mutation;
        const [outer, inner] = path.split(".");
        if (outer === undefined) throw new Error("MISSING_CONSENT_FIELD");
        acknowledged = inner === undefined
          ? Object.freeze({ ...displayed, [outer]: value })
          : Object.freeze({
              ...displayed,
              [outer]: Object.freeze({
                ...(outer === "identity" ? displayed.identity : displayed.disclosedImpact),
                [inner]: value,
              }),
            });
      }
      const calls: string[] = [];
      const owner = h.composition.interchangeOwner;
      const driver = createE0V2TransactionDriver({
        ...owner,
        readCurrentApplicationDocumentIdentity: () => { calls.push("identity"); return owner.readCurrentApplicationDocumentIdentity(); },
        prepareImportReplacementPublication: (request) => { calls.push("prepare"); return owner.prepareImportReplacementPublication(request); },
        discardImportReplacementPublication: (request) => { calls.push("discard"); return owner.discardImportReplacementPublication(request); },
        publishImportReplacement: (request) => { calls.push("publish"); return owner.publishImportReplacement(request); },
        publishCanonicalExportRevision: (request) => { calls.push("marker"); return owner.publishCanonicalExportRevision(request); },
      }, {
        retireImportReplacement: (request) => {
          calls.push("retire");
          return Promise.resolve(Object.freeze({
            ok: true,
            value: Object.freeze({
              schema: "changes.x1-replacement-retirement-evidence.v1",
              authority: "x1-serialized-transport",
              request,
              receipt: Object.freeze({
                requestId: request.identity.requestId, retiredTransportGeneration: 0,
                progressionRetired: true, previewRetired: true, noFutureAttack: true,
              }),
            }),
          }));
        },
      });
      const before = h.composition.controller.getSnapshot();
      const result = await driver(Object.freeze({
        schema: "changes.import-commit-request.v2",
        ownerRequest: Object.freeze({ ...h.ownerRequest, nonUndoableConfirmation: ownerAcknowledgement }),
        confirmationBinding: Object.freeze({
          displayedRequirement: displayed,
          acknowledgement: Object.freeze({ kind: "acknowledged", requirement: acknowledged }),
          byteMatchProvedBeforeOwnerCall: true,
        }),
      }) as CommitImportReplacementRequestV2);
      expect(hookCalls).toBe(0);
      expect(result.ok).toBe(shouldCommit);
      expect(result.liveForRequest).toBe(0);
      if (shouldCommit) {
        expect(calls).toEqual(["prepare", "retire", "publish"]);
        expect(h.composition.controller.getSnapshot().documentId).toBe(h.candidate.id);
        expect(h.composition.controller.getSnapshot().revision).toBe(h.state.revision + 1);
        expect(h.getNotifications()).toBe(1);
      } else {
        expect(result).toMatchObject({
          ok: false, outcome: "refused", stage: "pre-owner-provenance",
          code: "import.confirmation_identity_mismatch",
        });
        expect(calls).toEqual([]);
        expect(h.composition.controller.getSnapshot()).toEqual(before);
        expect(h.getNotifications()).toBe(0);
      }
    });
  }

  test("successfully drives a retained replacement to committed state", async () => {
    const h = createHarness({ disposition: "retained" });

    const x1Adapter: X1ReplacementRetirementAdapter = {
      retireImportReplacement: (req) =>
        Promise.resolve(
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
        ),
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
      retireImportReplacement: (req) =>
        Promise.resolve(
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
        ),
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
      retireImportReplacement: () =>
        Promise.reject(new Error("X1 should not be called when provenance fails")),
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
      retireImportReplacement: () =>
        Promise.reject(new Error("X1 should not be called when provenance fails")),
    };

    const driver = createE0V2TransactionDriver(
      h.composition.interchangeOwner,
      x1Adapter,
    );

    const activeRequirement = h.requirement;
    if (!activeRequirement) {
      throw new Error("ACTIVE_REQUIREMENT_MISSING");
    }

    const forgedRequirement: ImportNonUndoableConfirmationRequirement =
      Object.freeze({
        ...activeRequirement,
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
      retireImportReplacement: () =>
        Promise.resolve(
          Object.freeze({
            ok: false,
            code: "transport.replacement_retirement_failed",
            retirementEffect: "none",
          }),
        ),
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
