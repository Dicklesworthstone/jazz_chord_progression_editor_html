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
import {
  beginApplicationRequest,
  reduceEphemeralIntent,
  settleApplicationRequest,
} from "./application-state";
import type {
  AppState,
  ApplicationReplacementOrigin,
} from "./application-state-contract";
import type {
  ImportRequestIdentity,
  RetiringTransportDocumentTransition,
} from "./application-interchange-owner-contract";

export type BeginReplacementWorkflowResult =
  | Readonly<{
      ok: true;
      identity: ImportRequestIdentity;
      transition: RetiringTransportDocumentTransition;
    }>
  | Readonly<{
      ok: false;
      code:
        | "import.replacement_workflow_busy"
        | "import.replacement_workflow_begin_failed";
    }>;

export type StudioReplacementWorkflow = Readonly<{
  begin: (
    input: Readonly<{
      candidateDocumentId: string;
      undoDisposition: "retained" | "explicitly-unavailable";
      origin: Extract<
        ApplicationReplacementOrigin,
        "canonical-import" | "legacy-import"
      >;
    }>,
  ) => BeginReplacementWorkflowResult;
  cancel: (identity: ImportRequestIdentity) => void;
}>;

export type StudioReplacementWorkflowAccess = Readonly<{
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

  return Object.freeze({
    begin: (input) => {
      const state = access.readState();
      if (state.documentTransition.kind !== "idle") {
        return Object.freeze({
          ok: false as const,
          code: "import.replacement_workflow_busy" as const,
        });
      }
      const requestId = nextRequestId;
      nextRequestId += 1;
      const identity: ImportRequestIdentity = Object.freeze({
        requestId,
        documentId: state.document.id,
        baseRevision: state.revision,
      });
      const begun = beginApplicationRequest({
        state,
        request: Object.freeze({
          kind: "document-transition" as const,
          id: requestId as never,
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
        requestId: requestId as never,
        origin: input.origin,
        baseRevision: state.revision,
        candidateDocumentId: input.candidateDocumentId as never,
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
        transition: transition as never,
      });
    },

    cancel: (identity) => {
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
