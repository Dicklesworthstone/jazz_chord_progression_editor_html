import type { ValidatedDocument, DocumentId } from "../domain";
import { runDocumentCommand, reduceEphemeralIntent } from "./application-state";
import { MAX_APPLICATION_SEQUENCE, type AppState, type ApplicationCommandDependencies,
  type ReplaceDocumentCommand, type ReplacementRetirementReceipt } from "./application-state-contract";
import type { ImportReplacementImpact, ImportRequestIdentity } from "./application-interchange-owner-contract";
import { createWorkCounters, deepStructuralEqual, runtimeField } from "./application-state-helpers";
import { assessReplacementImpactOverState, applyPreparedImportReplacementToLatestState } from "./studio-interchange-owner";

export type LocalReplacementOrigin = "new" | "lesson";
export type LocalReplacementPreparation = Readonly<{
  identity: ImportRequestIdentity;
  origin: LocalReplacementOrigin;
  candidateDocumentId: DocumentId;
  expectedTransportGeneration: number;
}>;
type Refusal = Readonly<{ ok: false; code: string }>;
export type LocalReplacementRequest = Readonly<{
  identity: ImportRequestIdentity;
  origin: LocalReplacementOrigin;
  candidate: ValidatedDocument;
  command: Readonly<{ id: string; label: string; logicalTimeMs: number }>;
  disclosedImpact: ImportReplacementImpact;
  acknowledgedNonUndoable: boolean;
}>;
export type StudioLocalReplacementOwner = Readonly<{
  prepare: (request: LocalReplacementRequest) => Readonly<{ ok: true; preparation: LocalReplacementPreparation }> | Refusal;
  publish: (preparation: LocalReplacementPreparation, receipt: ReplacementRetirementReceipt) => Readonly<{ ok: true }> | Refusal;
  discard: (identity: ImportRequestIdentity) => void;
}>;

/** Controller-private, capacity-one publication. No state or install capability leaves this closure. */
export function createStudioLocalReplacementOwner(access: Readonly<{
  dependencies: ApplicationCommandDependencies;
  readState: () => AppState;
  installState: (next: AppState) => void;
  notifyListeners: () => void;
}>): StudioLocalReplacementOwner {
  type Material = Parameters<typeof applyPreparedImportReplacementToLatestState>[1];
  let live: Readonly<{ preparation: LocalReplacementPreparation; before: AppState; material: Material }> | null = null;
  const refuse = (code: string): Refusal => Object.freeze({ ok: false, code });
  return Object.freeze({
    prepare: (request) => {
      if (live !== null) return refuse("import.replacement_preparation_busy");
      const before = access.readState();
      const transition = before.documentTransition;
      if ((runtimeField(request, "origin") !== "new" && runtimeField(request, "origin") !== "lesson") ||
          before.document.id !== request.identity.documentId || before.revision !== request.identity.baseRevision ||
          transition.kind !== "retiring-transport" || transition.requestId !== request.identity.requestId ||
          transition.origin !== request.origin || transition.candidateDocumentId !== request.candidate.id) {
        return refuse("import.replacement_transition_mismatch");
      }
      const decoded = access.dependencies.decodeDocumentShape(request.candidate);
      if (!decoded.ok) return refuse("import.candidate_structural_invalid");
      const validated = access.dependencies.validateDocumentSemantics(decoded.value);
      if (!validated.ok) return refuse("import.candidate_semantic_invalid");
      const assessment = assessReplacementImpactOverState(before, validated.value, request.command,
        access.dependencies.estimateHistoryRetainedBytes, createWorkCounters());
      if (!assessment.ok) return refuse(assessment.code);
      if (!deepStructuralEqual(request.disclosedImpact, assessment.impact) ||
          transition.undoDisposition !== assessment.impact.undoDisposition) return refuse("import.replacement_impact_mismatch");
      if (assessment.oversized && runtimeField(request, "acknowledgedNonUndoable") !== true) return refuse("history.nonundoable_confirmation_required");
      const committing = reduceEphemeralIntent({ state: before, intent: { kind: "set-document-transition",
        transition: { ...transition, kind: "committing" } } });
      if (!committing.ok) return refuse(committing.refusal.code);
      // Precompute the pure command's material under the REQUIRED retirement
      // postcondition. This local simulation is never installed or returned as
      // evidence. Only publish below accepts an actual bound X1 receipt.
      const command: ReplaceDocumentCommand = Object.freeze({ ...request.command,
        kind: "replace-document", origin: request.origin, candidate: validated.value, coalescing: null,
        expectedDocumentId: before.document.id, expectedRevision: before.revision, requestId: request.identity.requestId,
        retirement: Object.freeze({ requestId: request.identity.requestId, retiredTransportGeneration: before.transport.generation,
          progressionRetired: true, previewRetired: true, noFutureAttack: true }),
        undoDisposition: assessment.oversized
          ? Object.freeze({ kind: "explicitly-unavailable", confirmationId: request.command.id, exportRecommended: true })
          : Object.freeze({ kind: "retain" }),
      });
      const result = runDocumentCommand({ state: committing.state, command, dependencies: access.dependencies });
      if (!result.ok) return refuse(result.refusal.code);
      const preparation = Object.freeze({ identity: request.identity, origin: request.origin,
        candidateDocumentId: validated.value.id, expectedTransportGeneration: before.transport.generation });
      const next = result.state;
      const notice = next.notices.find(n => n.code === "history.replacement_not_undoable");
      live = Object.freeze({ preparation, before, material: Object.freeze({ document: next.document,
        newRevision: next.revision, history: next.history, bookmarks: next.bookmarks, quickEntry: next.quickEntry,
        warningNotice: notice ?? null }) });
      return Object.freeze({ ok: true, preparation });
    },
    publish: (preparation, receipt) => {
      const entry = live;
      if (entry === null || entry.preparation !== preparation) return refuse("import.replacement_preparation_stale");
      live = null; // Single-use on every terminal path, including a stale receipt.
      const latest = access.readState();
      if (latest.document.id !== preparation.identity.documentId || latest.revision !== preparation.identity.baseRevision ||
          latest.history !== entry.before.history || !deepStructuralEqual(latest.bookmarks, entry.before.bookmarks) ||
          !deepStructuralEqual(latest.documentTransition, entry.before.documentTransition) ||
          !deepStructuralEqual(latest.pendingRequests, entry.before.pendingRequests) || latest.nextSequence >= MAX_APPLICATION_SEQUENCE) {
        return refuse("import.replacement_preparation_stale");
      }
      if (receipt.requestId !== preparation.identity.requestId || receipt.retiredTransportGeneration !== preparation.expectedTransportGeneration ||
          receipt.retiredTransportGeneration !== latest.transport.generation || runtimeField(receipt, "progressionRetired") !== true ||
          runtimeField(receipt, "previewRetired") !== true || runtimeField(receipt, "noFutureAttack") !== true) return refuse("import.replacement_retirement_mismatch");
      const next = applyPreparedImportReplacementToLatestState(latest, entry.material);
      access.installState(next);
      access.notifyListeners();
      return Object.freeze({ ok: true });
    },
    discard: (identity) => {
      if (live !== null && deepStructuralEqual(live.preparation.identity, identity)) live = null;
    },
  });
}
