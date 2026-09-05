/**
 * Composition-private replacement workflow
 * (jcpe-milestone-reliable-studio-l3a.2 wiring step; the owner-ports
 * contract's "exact retiring-transport transition" producer). The sealed
 * A0/E0 owner prepare port refuses unless the controller state carries a
 * running `document-transition` request AND the matching
 * `retiring-transport` transition; until now only test harnesses could
 * install them. This module closes over the SAME private state cell as
 * the controller and the owner (handed the same access by
 * `makeStudioComposition`), and drives both installations through the
 * kernel's own reducers — `beginApplicationRequest` and the
 * `set-document-transition` ephemeral intent — so every slot, revision,
 * and transition law is enforced by the code that owns it, never
 * restated here.
 *
 * One workflow at a time: a non-idle transition refuses busy. Cancel
 * settles the request with the cancel disposition, which the kernel
 * resets to the idle transition; a committed publication clears both
 * itself (the owner's published state carries no pending requests and
 * the idle transition).
 */
import { parseStableId } from "../domain";
import { createStudioLocalReplacementOwner, type StudioLocalReplacementOwner } from "./studio-local-replacement-owner";
import {
  beginApplicationRequest,
  reduceEphemeralIntent,
  settleApplicationRequest,
} from "./application-state";
import type {
  AppState,
  ApplicationCommandDependencies,
  DocumentTransitionState,
  ApplicationReplacementOrigin,
  EphemeralIntent,
} from "./application-state-contract";
import type {
  ImportRequestIdentity,
} from "./application-interchange-owner-contract";
import type { TransportCommandOutcome } from "../audio";
import { SETTLED_TRANSPORT_STATUS } from "./studio-transport-status";

export type BeginReplacementWorkflowResult<Origin extends ApplicationReplacementOrigin = "canonical-import" | "legacy-import"> =
  | Readonly<{
      ok: true;
      identity: ImportRequestIdentity;
      transition: Omit<Exclude<DocumentTransitionState, { kind: "idle" }>, "kind" | "origin"> & Readonly<{ kind: "retiring-transport"; origin: Origin }>;
    }>
  | Readonly<{
      ok: false;
      code:
        | "import.replacement_workflow_busy"
        | "import.replacement_workflow_begin_failed";
    }>;

export type StudioReplacementWorkflow = Readonly<{
  localPublication: StudioLocalReplacementOwner;
  expectTransportRetirement: (commandRequestId: number) => boolean;
  settleTransportRetirement: (outcome: TransportCommandOutcome) => void;
  /** Reserves identity only: preview never installs a request or retires audio. */
  allocatePreviewIdentity: () => ImportRequestIdentity | null;
  applyLifecycleIntent: (intent: Extract<EphemeralIntent,
    { kind: "push-dialog" | "pop-dialog" | "set-import-draft" | "dismiss-notice" }>) =>
      Readonly<{ ok: true }> | Readonly<{ ok: false; code: string }>;
  updateLifecycleDialogPhase: (dialogId: string, phase: "open" | "committing" | "failed") =>
      Readonly<{ ok: true }> | Readonly<{ ok: false; code: string }>;
  begin: <Origin extends ApplicationReplacementOrigin>(
    input: Readonly<{
      candidateDocumentId: string;
      previewIdentity?: ImportRequestIdentity;
      undoDisposition: "retained" | "explicitly-unavailable";
      origin: Origin;
    }>,
  ) => BeginReplacementWorkflowResult<Origin>;
  cancel: (identity: ImportRequestIdentity) => void;
}>;

export type StudioReplacementWorkflowAccess = Readonly<{
  dependencies: ApplicationCommandDependencies;
  readState: () => AppState;
  installState: (next: AppState) => void;
  notifyListeners: () => void;
}>;

export function createStudioReplacementWorkflow(
  access: StudioReplacementWorkflowAccess,
): StudioReplacementWorkflow {
  /* Session-scoped monotonic request IDs; the kernel's slot law makes a
   * second live document-transition request impossible regardless. */
  let nextRequestId = 1;
  let reservedIdentity: ImportRequestIdentity | null = null;
  let retirementExpectation: Readonly<{ commandRequestId: number; documentId: AppState["document"]["id"]; planRevision: number }> | null = null;

  function allocateIdentity(): ImportRequestIdentity | null {
    if (nextRequestId >= Number.MAX_SAFE_INTEGER) return null;
    const state = access.readState();
    const identity = Object.freeze({ requestId: nextRequestId++, documentId: state.document.id, baseRevision: state.revision });
    return identity;
  }

  const localPublication = createStudioLocalReplacementOwner(access);
  return Object.freeze({
    localPublication,
    expectTransportRetirement: (commandRequestId) => {
      const state = access.readState();
      if (state.documentTransition.kind !== "retiring-transport") return false;
      const identity = { commandRequestId, documentId: state.document.id, planRevision: state.revision };
      const result = reduceEphemeralIntent({ state, intent: { kind: "expect-transport", ...identity,
        status: "stopping", startBeat: state.transport.startBeat, playhead: state.transport.playhead,
      } });
      if (!result.ok) return false;
      retirementExpectation = identity;
      access.installState(result.state); access.notifyListeners();
      return true;
    },
    settleTransportRetirement: (outcome) => {
      const identity = retirementExpectation;
      if (identity?.commandRequestId !== outcome.commandRequestId) return;
      retirementExpectation = null;
      const result = reduceEphemeralIntent({ state: access.readState(), intent: {
        kind: "settle-transport-expectation", ...identity,
        status: SETTLED_TRANSPORT_STATUS[outcome.termination === "receipt" ? outcome.stateAfter : outcome.state],
        failureCode: outcome.termination === "receipt" ? "transport.plan_superseded" : outcome.engineRefusalCode ?? outcome.code,
      } });
      if (result.ok) { access.installState(result.state); access.notifyListeners(); }
    },
    allocatePreviewIdentity: () => {
      if (access.readState().documentTransition.kind !== "idle") return null;
      reservedIdentity = allocateIdentity();
      return reservedIdentity;
    },
    applyLifecycleIntent: (intent) => {
      const result = reduceEphemeralIntent({ state: access.readState(), intent });
      if (!result.ok) return Object.freeze({ ok: false as const, code: result.refusal.code });
      access.installState(result.state);
      access.notifyListeners();
      return Object.freeze({ ok: true as const });
    },
    updateLifecycleDialogPhase: (dialogId, phase) => {
      const state = access.readState();
      const dialog = state.dialogs[state.dialogs.length - 1];
      if (dialog?.id !== dialogId) return Object.freeze({ ok: false as const, code: "ephemeral.intent_invalid" });
      const popped = reduceEphemeralIntent({ state, intent: { kind: "pop-dialog", dialogId } });
      if (!popped.ok) return Object.freeze({ ok: false as const, code: popped.refusal.code });
      const pushed = reduceEphemeralIntent({ state: popped.state, intent: { kind: "push-dialog",
        dialog: { ...dialog, phase, blocksHistory: phase === "committing" },
      } });
      if (!pushed.ok) return Object.freeze({ ok: false as const, code: pushed.refusal.code });
      // Publish once: observers never see history unlocked between reducers.
      access.installState(pushed.state);
      access.notifyListeners();
      return Object.freeze({ ok: true as const });
    },
    begin: (input) => {
      const state = access.readState();
      if (state.documentTransition.kind !== "idle") {
        return Object.freeze({
          ok: false as const,
          code: "import.replacement_workflow_busy" as const,
        });
      }
      const candidateId = parseStableId("document", input.candidateDocumentId);
      if (!candidateId.ok) return Object.freeze({ ok: false as const, code: "import.replacement_workflow_begin_failed" as const });
      const identity = input.previewIdentity ?? allocateIdentity();
      if (identity === null ||
          (input.previewIdentity !== undefined && identity !== reservedIdentity) ||
          identity.documentId !== state.document.id || identity.baseRevision !== state.revision) {
        return Object.freeze({ ok: false as const, code: "import.replacement_workflow_begin_failed" as const });
      }
      reservedIdentity = null;
      const requestId = identity.requestId;
      const begun = beginApplicationRequest({
        state,
        request: Object.freeze({
          kind: "document-transition" as const,
          id: requestId,
          documentId: state.document.id,
          baseRevision: state.revision,
          status: "running" as const,
        }),
      });
      if (!begun.ok) {
        return Object.freeze({
          ok: false as const,
          code: "import.replacement_workflow_begin_failed" as const,
        });
      }
      const transition = Object.freeze({
        kind: "retiring-transport" as const,
        requestId: requestId,
        origin: input.origin,
        baseRevision: state.revision,
        candidateDocumentId: candidateId.value,
        undoDisposition: input.undoDisposition,
      });
      const transitioned = reduceEphemeralIntent({
        state: begun.state,
        intent: Object.freeze({
          kind: "set-document-transition" as const,
          transition,
        }),
      });
      if (!transitioned.ok) {
        return Object.freeze({
          ok: false as const,
          code: "import.replacement_workflow_begin_failed" as const,
        });
      }
      access.installState(transitioned.state);
      access.notifyListeners();
      return Object.freeze({
        ok: true as const,
        identity,
        transition,
      });
    },

    cancel: (identity) => {
      localPublication.discard(identity);
      const state = access.readState();
      const settled = settleApplicationRequest({
        state,
        kind: "document-transition",
        id: identity.requestId,
        documentId: identity.documentId,
        baseRevision: identity.baseRevision,
        disposition: "cancel",
      });
      /* `ignored-stale` still returns ok with the same state; installing
       * it is a no-op by reference equality in the install path. */
      if (settled.ok) {
        access.installState(settled.state);
        access.notifyListeners();
      }
    },
  });
}
