/**
 * Studio recovery orchestrator (jcpe-milestone-reliable-studio-l3a.2
 * wiring steps 2-4). Application-layer only: every browser adapter (the
 * IndexedDB/localStorage recovery adapters, the clock, the transport)
 * arrives injected from the composition root, and the UI receives a
 * typed view driven by the frozen RECOVERY_STATUS_VOCABULARY.
 *
 * - The mutation feed subscribes to the controller and notes every
 *   (documentId, revision) advance with the current document as the
 *   plain candidate; the recovery service owns the 400 ms idle /
 *   two-second max write scheduling and every revision-safety law.
 * - Startup renders the workspace first and probes AFTER share-fragment
 *   handling; the service's reviewed startup matrix decides the
 *   disposition (a session already edited — including a share-applied
 *   or seeded one — downgrades auto-open to Keep/Discard).
 * - Keep re-enters the candidate through F2/F3 and rides the ONLY
 *   lawful replacement channel: the composition's replacement workflow
 *   begins the retiring-transport transition, the impact projection is
 *   computed by the owner's own extracted assessor (never duplicated
 *   math), and the v2 transaction driver commits over the sealed owner
 *   ports and the injected X1 retirement adapter. Any refusal cancels
 *   the workflow so the studio returns to idle — a failed Keep changes
 *   nothing.
 * - Discard is the service's own idempotent discard.
 *
 * Browser recovery is never called Save, and no auto-Keep exists here:
 * even the matrix's open-current-automatically row rides the same
 * transactional channel, so a commit that cannot be lawfully proven
 * leaves the current document exactly as it was.
 */
import type {
  RecoveryEnvelope,
  RecoveryService,
  RecoveryStartupReport,
} from "../persistence";
import type {
  DocumentId,
  DocumentShapeDecodeResult,
  ValidatedDocument,
} from "../domain";
import { createE0V2TransactionDriver } from "./e0-transaction-driver";
import type {
  CommitImportReplacementResultV2,
} from "./e0-interchange-v2-contract";
import type { X1ReplacementRetirementAdapter } from "./e0-interchange-contract";
import type { StudioComposition } from "./studio-controller";
import { assessReplacementImpactOverState } from "./studio-interchange-owner";
import type { AppState, ApplicationCommandDependencies } from "./application-state-contract";
import { createWorkCounters } from "./application-state-helpers";
import type { ValidateDocumentSemantics } from "./document-validation-contract";

export type StudioRecoveryKeepResult =
  | Readonly<{ ok: true; outcome: "committed"; documentId: string; revision: number }>
  | Readonly<{
      ok: false;
      outcome: "refused";
      code: string;
    }>;

export type StudioRecoveryStartupView =
  | Readonly<{ kind: "none-available" }>
  | Readonly<{ kind: "report-unrecoverable" }>
  | Readonly<{
      kind: "offer";
      disposition: "open-current-automatically" | "offer-keep-discard" | "offer-previous";
      savedAt: string;
      revision: number;
      envelope: RecoveryEnvelope;
      storageDocumentId: DocumentId;
      report: RecoveryStartupReport;
    }>;

export type StudioRecoveryOrchestrator = Readonly<{
  /** Steps 2: attach the controller mutation feed; returns detach. */
  attachMutationFeed: (options?: Readonly<{ noteInitial?: boolean }>) => () => void;
  /** Best-effort flush for visibilitychange; never throws. */
  flush: () => Promise<void>;
  /** Step 3: probe + candidates after share handling. */
  startup: (
    input: Readonly<{ sessionEdited: boolean }>,
  ) => Promise<StudioRecoveryStartupView>;
  /** Step 4 Keep channel: F2/F3 -> workflow -> driver -> committed. */
  keep: (envelope: RecoveryEnvelope) => Promise<StudioRecoveryKeepResult>;
  /** Step 4 Discard: the service's idempotent discard. */
  discard: (documentId?: DocumentId) => Promise<void>;
}>;

export type StudioRecoveryDependencies = Readonly<{
  composition: StudioComposition;
  recovery: RecoveryService;
  retirement: X1ReplacementRetirementAdapter;
  decodeDocumentShape: (input: unknown) => DocumentShapeDecodeResult;
  validateDocumentSemantics: ValidateDocumentSemantics;
  /** The controller closure's state cell, read-only (composition root
   * receives it beside the composition; never handed to UI). */
  readState: () => AppState;
  estimateHistoryRetainedBytes: ApplicationCommandDependencies["estimateHistoryRetainedBytes"];
  /** Monotonic logical time for the replacement command seed. */
  nowMs: () => number;
  /** Bounded unique seed for command IDs (composition-allocated). */
  allocateCommandSeedId: () => string;
  resolveStartupDocumentId?: (adapter: import("../persistence").RecoveryAdapterKind, fallback: DocumentId) => Promise<DocumentId>;
}>;

export function createStudioRecoveryOrchestrator(
  dependencies: StudioRecoveryDependencies,
): StudioRecoveryOrchestrator {
  const {
    composition,
    recovery,
    retirement,
    decodeDocumentShape,
    validateDocumentSemantics,
    readState,
    estimateHistoryRetainedBytes,
    nowMs,
    allocateCommandSeedId,
  } = dependencies;
  const driver = createE0V2TransactionDriver(
    composition.interchangeOwner,
    retirement,
  );

  let lastNotedRevision: number | null = null;
  let lastNotedDocumentId: string | null = null;

  const noteCurrent = (): void => {
    const state = readState();
    const documentId = String(state.document.id);
    if (
      lastNotedRevision === state.revision &&
      lastNotedDocumentId === documentId
    ) {
      return;
    }
    lastNotedRevision = state.revision;
    lastNotedDocumentId = documentId;
    recovery.noteMutation({
      documentId: state.document.id,
      revision: state.revision,
      /* the plain candidate: the validated document IS plain frozen data
       * and re-enters through F2/F3 on Keep, per the A1 contract */
      document: state.document,
    });
  };

  const keep = async (
    envelope: RecoveryEnvelope,
  ): Promise<StudioRecoveryKeepResult> => {
    const decoded = decodeDocumentShape(envelope.document);
    if (!decoded.ok) {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code: "import.candidate_structural_invalid",
      });
    }
    const validated = validateDocumentSemantics(decoded.value);
    if (!validated.ok) {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code: "import.candidate_semantic_invalid",
      });
    }
    const candidate: ValidatedDocument = validated.value;

    const state = readState();
    const seed = Object.freeze({
      id: allocateCommandSeedId(),
      label: "Open recovered chart",
      logicalTimeMs: Math.max(0, Math.round(nowMs())),
    });
    /* The SAME math the owner recomputes at preparation — the extracted
     * assessor, never a duplicate. */
    const assessed = assessReplacementImpactOverState(
      state,
      candidate,
      seed,
      estimateHistoryRetainedBytes,
      createWorkCounters(),
    );
    if (!assessed.ok) {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code: assessed.code,
      });
    }
    /* Recovery Keep offers no non-undoable consent dialog in v1: an
     * oversized candidate (explicitly-unavailable disposition) refuses
     * honestly rather than fabricating an acknowledgement. */
    if (assessed.impact.undoDisposition !== "retained") {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code: "history.nonundoable_confirmation_required",
      });
    }

    const begun = composition.replacementWorkflow.begin({
      candidateDocumentId: String(candidate.id),
      undoDisposition: "retained",
      origin: "canonical-import",
    });
    if (!begun.ok) {
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code: begun.code,
      });
    }

    let result: CommitImportReplacementResultV2;
    try {
      result = await driver({
        schema: "changes.import-commit-request.v2",
        ownerRequest: Object.freeze({
          identity: begun.identity,
          sourceFormat: "canonical-json-v2" as const,
          replacementOrigin: "canonical-import" as const,
          candidate,
          replacementCommandSeed: seed,
          disclosedImpact: assessed.impact,
          currentTransition: begun.transition,
          nonUndoableConfirmation: null,
        }) as never,
        confirmationBinding: Object.freeze({
          displayedRequirement: null,
          acknowledgement: null,
          byteMatchProvedBeforeOwnerCall: true as const,
        }),
      });
    } catch {
      composition.replacementWorkflow.cancel(begun.identity);
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code: "import.replacement_request_invalid",
      });
    }

    if (!result.ok) {
      /* a failed Keep changes nothing: return the studio to idle */
      composition.replacementWorkflow.cancel(begun.identity);
      return Object.freeze({
        ok: false as const,
        outcome: "refused" as const,
        code:
          result.outcome === "refused"
            ? result.code
            : result.diagnostic.reason === "threw-or-rejected"
              ? "import.replacement_preparation_result_invalid"
              : "import.replacement_preparation_result_invalid",
      });
    }
    return Object.freeze({
      ok: true as const,
      outcome: "committed" as const,
      documentId: String(result.documentId),
      revision: result.revision,
    });
  };

  return Object.freeze({
    attachMutationFeed: (options) => {
      /* Note the current state once so a restore/seed that predates the
       * subscription is not lost, then follow the controller. */
      if (options?.noteInitial !== false) {
        noteCurrent();
      } else {
        /* Controller notifications also include focus/dialog changes. Seed
         * the dedupe identity without scheduling an unedited startup save. */
        const state = readState();
        lastNotedRevision = state.revision;
        lastNotedDocumentId = String(state.document.id);
      }
      return composition.controller.subscribe(noteCurrent);
    },

    flush: async () => {
      try {
        await recovery.flushRecoveryWrites("visibility-change");
      } catch {
        /* best-effort only, by contract */
      }
    },

    startup: async ({ sessionEdited }) => {
      const state = readState();
      const probe = await recovery.probeRecoveryCapability();
      const storageDocumentId = await dependencies.resolveStartupDocumentId?.(probe.adapter, state.document.id) ?? state.document.id;
      const report = await recovery.readRecoveryCandidates({
        documentId: storageDocumentId,
        sessionEdited,
      });
      if (report.disposition === "none-available") {
        return Object.freeze({ kind: "none-available" as const });
      }
      if (report.disposition === "report-unrecoverable") {
        return Object.freeze({ kind: "report-unrecoverable" as const });
      }
      const candidate =
        report.disposition === "offer-previous"
          ? report.previous
          : report.current;
      if (candidate.outcome !== "valid" || candidate.envelope === null) {
        return Object.freeze({ kind: "report-unrecoverable" as const });
      }
      return Object.freeze({
        kind: "offer" as const,
        disposition: report.disposition,
        savedAt: candidate.envelope.savedAt,
        revision: candidate.envelope.revision,
        envelope: candidate.envelope,
        storageDocumentId,
        report,
      });
    },

    keep,

    discard: async (documentId) => {
      await recovery.discardRecovery(documentId ?? readState().document.id);
    },
  });
}
