import {
  redoDocumentCommand,
  reduceEphemeralIntent,
  runDocumentCommand,
  undoDocumentCommand,
} from "./application-state";
import type {
  AppState,
  ApplicationCommandDependencies,
  ApplicationEffect,
  ApplicationTransitionOutcome,
  ApplicationTransitionResult,
  SetTextCommand,
} from "./application-state-contract";
import {
  createStudioBootstrap,
  type StudioBootstrapRefusal,
} from "./studio-bootstrap";
import {
  selectStudioViewModel,
  type StudioViewModel,
} from "./studio-view-model";

const TITLE_COMMAND_INTERVAL_MS = 1_001;
const MAX_TITLE_COMMAND_ORDINAL = Math.floor(
  Number.MAX_SAFE_INTEGER / TITLE_COMMAND_INTERVAL_MS,
);

export const STUDIO_CONTROLLER_REFUSAL_CODES = Object.freeze([
  "studio.controller.command_sequence_exhausted",
  "studio.controller.unexpected_failure",
] as const);

export type StudioControllerAction =
  | "set-title"
  | "undo"
  | "redo"
  | "set-left-rail"
  | "set-right-rail";

export type StudioControllerRefusal = Readonly<{
  action: StudioControllerAction;
  code: string;
  message: string;
  path: readonly (string | number)[];
  recoveryAction: string;
  issueCodes: readonly string[];
}>;

export type StudioControllerActionResult =
  | Readonly<{
      ok: true;
      outcome: ApplicationTransitionOutcome;
      snapshot: StudioViewModel;
      effects: readonly ApplicationEffect[];
    }>
  | Readonly<{
      ok: false;
      refusal: StudioControllerRefusal;
      snapshot: StudioViewModel;
    }>;

export type StudioRailSide = "left" | "right";
export type StudioControllerListener = () => void;

export interface StudioController {
  readonly getSnapshot: () => StudioViewModel;
  readonly subscribe: (listener: StudioControllerListener) => () => void;
  readonly setTitle: (value: string) => StudioControllerActionResult;
  readonly undo: () => StudioControllerActionResult;
  readonly redo: () => StudioControllerActionResult;
  readonly setRailCollapsed: (
    side: StudioRailSide,
    collapsed: boolean,
  ) => StudioControllerActionResult;
  readonly toggleRail: (side: StudioRailSide) => StudioControllerActionResult;
}

export type StudioControllerConstructionRefusal =
  | StudioBootstrapRefusal
  | Readonly<{
      code: "studio.controller.unexpected_failure";
      message: string;
      recoveryAction: string;
      issues: readonly [];
    }>;

export type StudioControllerCreationResult =
  | Readonly<{ ok: true; controller: StudioController }>
  | Readonly<{ ok: false; refusal: StudioControllerConstructionRefusal }>;

function recoveryAction(action: StudioControllerAction, code: string): string {
  if (code === "history.undo_empty") return "Make a document edit before using Undo.";
  if (code === "history.redo_empty") return "Undo a document edit before using Redo.";
  if (code === "command.structural_validation_failed") {
    return action === "set-title"
      ? "Enter a nonblank title of at most 256 Unicode code points."
      : "Correct the invalid document fields and try again.";
  }
  if (code === "command.semantic_validation_failed") {
    return "Correct the musical validation issues and try again.";
  }
  if (code === "studio.controller.command_sequence_exhausted") {
    return "Reload the local studio before issuing another title command.";
  }
  if (code === "studio.controller.unexpected_failure") {
    return "Keep the current chart open and reload this local build before retrying.";
  }
  if (action === "set-left-rail" || action === "set-right-rail") {
    return "Retry the rail action against the current workspace state.";
  }
  return "Review the current chart state and retry the action.";
}

function controllerRefusal(
  action: StudioControllerAction,
  code: string,
  message: string,
  path: readonly (string | number)[] = [],
  issueCodes: readonly string[] = [],
): StudioControllerRefusal {
  return Object.freeze({
    action,
    code,
    message,
    path: Object.freeze([...path]),
    recoveryAction: recoveryAction(action, code),
    issueCodes: Object.freeze([...issueCodes]),
  });
}

function transitionIssueCodes(
  result: Extract<ApplicationTransitionResult, { ok: false }>,
): readonly string[] {
  const codes = [
    ...(result.refusal.structuralIssues?.map((issue) => issue.code) ?? []),
    ...(result.refusal.semanticIssues?.map((issue) => issue.code) ?? []),
  ];
  return Object.freeze(codes);
}

function makeStudioController(
  initialState: AppState,
  dependencies: ApplicationCommandDependencies,
): StudioController {
  let state = initialState;
  let snapshot = selectStudioViewModel(state);
  let nextTitleCommandOrdinal = 1;
  const listeners = new Set<StudioControllerListener>();

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A subscriber cannot make an already-published application action throw.
      }
    }
  };

  const apply = (
    action: StudioControllerAction,
    operation: (current: AppState) => ApplicationTransitionResult,
  ): StudioControllerActionResult => {
    let result: ApplicationTransitionResult;
    let nextSnapshot = snapshot;
    try {
      result = operation(state);
      if (result.state !== state) {
        nextSnapshot = selectStudioViewModel(result.state);
      }
    } catch {
      return Object.freeze({
        ok: false,
        refusal: controllerRefusal(
          action,
          "studio.controller.unexpected_failure",
          "The action stopped before application state could be published.",
        ),
        snapshot,
      });
    }

    const previousState = state;
    state = result.state;
    if (state !== previousState) {
      snapshot = nextSnapshot;
      notify();
    }
    if (!result.ok) {
      return Object.freeze({
        ok: false,
        refusal: controllerRefusal(
          action,
          result.refusal.code,
          result.refusal.message,
          result.refusal.path,
          transitionIssueCodes(result),
        ),
        snapshot,
      });
    }
    return Object.freeze({
      ok: true,
      outcome: result.outcome,
      snapshot,
      effects: result.effects,
    });
  };

  const setTitle = (value: string): StudioControllerActionResult => {
    if (nextTitleCommandOrdinal > MAX_TITLE_COMMAND_ORDINAL) {
      return Object.freeze({
        ok: false,
        refusal: controllerRefusal(
          "set-title",
          "studio.controller.command_sequence_exhausted",
          "The deterministic title-command sequence is exhausted.",
        ),
        snapshot,
      });
    }
    const ordinal = nextTitleCommandOrdinal;
    nextTitleCommandOrdinal += 1;
    const command: SetTextCommand = Object.freeze({
      kind: "set-text",
      id: `studio-title-${String(ordinal)}`,
      label: "Rename document",
      expectedDocumentId: state.document.id,
      expectedRevision: state.revision,
      logicalTimeMs: (ordinal - 1) * TITLE_COMMAND_INTERVAL_MS,
      coalescing: Object.freeze({
        kind: "text-field",
        key: "title",
        focusSessionId: "studio-document-title",
      }),
      target: Object.freeze({ kind: "document-title" }),
      value,
    });
    return apply("set-title", (current) =>
      runDocumentCommand({ state: current, command, dependencies }),
    );
  };

  const setRailCollapsed = (
    side: StudioRailSide,
    collapsed: boolean,
  ): StudioControllerActionResult => {
    const action = side === "left" ? "set-left-rail" : "set-right-rail";
    return apply(action, (current) =>
      reduceEphemeralIntent({
        state: current,
        intent: {
          kind: "set-panels",
          panels: {
            ...current.panels,
            open: current.panels.open,
            leftRailCollapsed:
              side === "left" ? collapsed : current.panels.leftRailCollapsed,
            rightRailCollapsed:
              side === "right" ? collapsed : current.panels.rightRailCollapsed,
          },
        },
      }),
    );
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: StudioControllerListener) => {
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    setTitle,
    undo: () => apply("undo", (current) => undoDocumentCommand({ state: current })),
    redo: () => apply("redo", (current) => redoDocumentCommand({ state: current })),
    setRailCollapsed,
    toggleRail: (side: StudioRailSide) =>
      setRailCollapsed(
        side,
        side === "left"
          ? !state.panels.leftRailCollapsed
          : !state.panels.rightRailCollapsed,
      ),
  });
}

export function createStudioController(): StudioControllerCreationResult {
  const bootstrap = createStudioBootstrap();
  if (!bootstrap.ok) return bootstrap;
  try {
    return Object.freeze({
      ok: true,
      controller: makeStudioController(
        bootstrap.value.state,
        bootstrap.value.dependencies,
      ),
    });
  } catch {
    return Object.freeze({
      ok: false,
      refusal: Object.freeze({
        code: "studio.controller.unexpected_failure",
        message: "The application controller could not derive its initial view.",
        recoveryAction:
          "Run the A0 and studio-controller gates before publishing this build.",
        issues: Object.freeze([] as const),
      }),
    });
  }
}
