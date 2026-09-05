import type {
  ComponentChildren,
  KeyboardEventHandler,
} from "preact";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";

import {
  UI_LIMITS,
  type UiAlertDialogProps,
  type UiDiagnostic,
  type UiDialogProps,
  type UiDismissReason,
  type UiInteractionSource,
} from "../ui-contract";
import { Button } from "../primitives/Button";
import { joinIdReferences } from "../primitives/id-references";
import {
  requireUiResult,
  uiDiagnostic,
  UiContractError,
  validateUiCommonProps,
  validateUiId,
  validateUiText,
} from "../primitives/validation";
import {
  acquireOverlaySurface,
  focusCandidatesWithin,
  isFocusableRestoreTarget,
  makeDocumentOutsideSurfaceInert,
  overlayDiagnostic,
  restoreFocus,
  type OverlaySurfaceLease,
} from "./focus-dismiss";

export type DialogFocusTargets = Readonly<{
  triggerId: string;
  workflowTargetId: string | null;
  workspaceId: string;
}>;

export type DialogProps = UiDialogProps<ComponentChildren> &
  Readonly<{
    backgroundRootId: string;
    focusTargets: DialogFocusTargets;
    onContractRefusal: (diagnostic: UiDiagnostic) => void;
  }>;

export type AlertDialogProps = UiAlertDialogProps<ComponentChildren> &
  Readonly<{
    backgroundRootId: string;
    focusTargets: DialogFocusTargets;
    onContractRefusal: (diagnostic: UiDiagnostic) => void;
  }>;

type ModalDialogProps = DialogProps &
  Readonly<{
    outsideDismisses: boolean;
    role: "alertdialog" | "dialog";
    requiredFocusIds: readonly string[];
  }>;

const NO_REQUIRED_FOCUS_IDS: readonly string[] = Object.freeze([]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dialogComponentId(value: unknown): string {
  if (!isRecord(value)) return "dialog";
  const id = value["id"];
  return typeof id === "string" && id.trim().length > 0 ? id : "dialog";
}

function requireDialogInputRecord(
  value: unknown,
): asserts value is Readonly<Record<string, unknown>> {
  if (isRecord(value)) return;
  throw new UiContractError(
    uiDiagnostic(
      "ui.value_malformed",
      dialogComponentId(value),
      ["props"],
      "Dialog props must use the reviewed controlled record shape.",
      "Provide a bounded dialog prop record.",
    ),
  );
}

function refuseDialogShape(
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
  code:
    | "ui.description_invalid"
    | "ui.duplicate_item_id"
    | "ui.value_malformed" = "ui.value_malformed",
): never {
  throw new UiContractError(
    uiDiagnostic(
      code,
      componentId,
      path,
      message,
      recoveryAction,
    ),
  );
}

function validateDialogProps(props: ModalDialogProps): void {
  const propsValue: unknown = props;
  requireDialogInputRecord(propsValue);
  const componentId = dialogComponentId(propsValue);
  const id = propsValue["id"];
  requireUiResult(
    validateUiId(
      componentId,
      ["id"],
      typeof id === "string" ? id : "",
    ),
  );

  const focusTargets = propsValue["focusTargets"];
  if (!isRecord(focusTargets)) {
    refuseDialogShape(
      componentId,
      ["focusTargets"],
      "Dialog focus targets must use the reviewed record shape.",
      "Provide trigger, optional workflow, and workspace focus identities.",
    );
  }
  const dismissibility = propsValue["dismissibility"];
  if (!isRecord(dismissibility)) {
    refuseDialogShape(
      componentId,
      ["dismissibility"],
      "Dialog dismissibility must use the reviewed controlled record shape.",
      "Provide a dismissible or blocked state record.",
    );
  }
  const requiredFocusIds = propsValue["requiredFocusIds"];
  if (
    !Array.isArray(requiredFocusIds) ||
    !requiredFocusIds.every((value) => typeof value === "string")
  ) {
    refuseDialogShape(
      componentId,
      ["requiredFocusIds"],
      "Required dialog focus identities must be an ordered string collection.",
      "Provide the bounded action identities required by this dialog kind.",
    );
  }
  if (
    typeof propsValue["onDismiss"] !== "function" ||
    typeof propsValue["onContractRefusal"] !== "function"
  ) {
    refuseDialogShape(
      componentId,
      typeof propsValue["onDismiss"] !== "function"
        ? ["onDismiss"]
        : ["onContractRefusal"],
      "Dialog callbacks must be callable semantic boundaries.",
      "Provide dismissal and contract-refusal callbacks.",
    );
  }

  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      ["title"],
      props.title,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  if (
    typeof props.closeLabel !== "string" ||
    props.closeLabel.trim().length === 0
  ) {
    refuseDialogShape(
      props.id,
      ["closeLabel"],
      "A dialog must describe its visible Close affordance.",
      "Provide a visible bounded Close label for every dialog state.",
      "ui.description_invalid",
    );
  }
  requireUiResult(
    validateUiText(
      props.id,
      ["closeLabel"],
      props.closeLabel,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  if (props.description !== null) {
    requireUiResult(
      validateUiText(
        props.id,
        ["description"],
        props.description,
        UI_LIMITS.maxDescriptionCodePoints,
      ),
    );
  }
  requireUiResult(
    validateUiId(props.id, ["backgroundRootId"], props.backgroundRootId),
  );
  const triggerId = focusTargets["triggerId"];
  const workspaceId = focusTargets["workspaceId"];
  const workflowTargetId = focusTargets["workflowTargetId"];
  requireUiResult(
    validateUiId(
      props.id,
      ["focusTargets", "triggerId"],
      typeof triggerId === "string" ? triggerId : "",
    ),
  );
  requireUiResult(
    validateUiId(
      props.id,
      ["focusTargets", "workspaceId"],
      typeof workspaceId === "string" ? workspaceId : "",
    ),
  );
  if (workflowTargetId !== null && typeof workflowTargetId !== "string") {
    refuseDialogShape(
      props.id,
      ["focusTargets", "workflowTargetId"],
      "The workflow focus fallback must be a stable identity or null.",
      "Provide a bounded identity or null.",
    );
  }
  if (typeof workflowTargetId === "string") {
    requireUiResult(
      validateUiId(
        props.id,
        ["focusTargets", "workflowTargetId"],
        workflowTargetId,
      ),
    );
  }
  const exteriorIds = [
    props.id,
    props.backgroundRootId,
    triggerId,
    workspaceId,
    ...(typeof workflowTargetId === "string" ? [workflowTargetId] : []),
  ];
  if (new Set(exteriorIds).size !== exteriorIds.length) {
    refuseDialogShape(
      props.id,
      ["focusTargets"],
      "Dialog surface, background, trigger, and focus-fallback identities must be distinct.",
      "Give every exterior dialog owner and fallback its own stable identity.",
      "ui.duplicate_item_id",
    );
  }
  const initialFocus: unknown = props.initialFocus;
  const initialFocusId: unknown = props.initialFocusId;
  const dismissibilityKind = dismissibility["kind"];
  const role: unknown = props.role;
  if (
    typeof props.open !== "boolean" ||
    (initialFocus !== "first-control" &&
      initialFocus !== "heading" &&
      initialFocus !== "explicit") ||
    (initialFocusId !== null && typeof initialFocusId !== "string") ||
    (initialFocus === "explicit") !== (initialFocusId !== null) ||
    (dismissibilityKind !== "dismissible" &&
      dismissibilityKind !== "blocked") ||
    (role !== "dialog" && role !== "alertdialog") ||
    typeof props.outsideDismisses !== "boolean"
  ) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.value_malformed",
        props.id,
        ["dialogState"],
        "The dialog uses an unknown open, focus, dismissal, or role state.",
        "Use the reviewed dialog state vocabulary and pair explicit focus with one target ID.",
      ),
    );
  }
  if (typeof initialFocusId === "string") {
    requireUiResult(
      validateUiId(props.id, ["initialFocusId"], initialFocusId),
    );
    if (exteriorIds.includes(initialFocusId)) {
      refuseDialogShape(
        props.id,
        ["initialFocusId"],
        "The explicit dialog focus target collides with an exterior identity.",
        "Choose a distinct enabled target rendered inside the dialog surface.",
        "ui.duplicate_item_id",
      );
    }
  }
  if (
    requiredFocusIds.length > UI_LIMITS.maxReferenceIds ||
    (props.role === "dialog" && requiredFocusIds.length !== 0) ||
    (props.role === "alertdialog" && requiredFocusIds.length !== 2) ||
    new Set(requiredFocusIds).size !== requiredFocusIds.length
  ) {
    throw new UiContractError(
      uiDiagnostic(
        requiredFocusIds.length > UI_LIMITS.maxReferenceIds
          ? "ui.collection_limit"
          : new Set(requiredFocusIds).size !== requiredFocusIds.length
            ? "ui.duplicate_item_id"
            : "ui.value_malformed",
        props.id,
        ["requiredFocusIds"],
        "Required dialog action identities must match the dialog kind, remain unique, and stay bounded.",
        "Provide no required action for a dialog or two distinct actions for an alert dialog.",
      ),
    );
  }
  for (const [index, requiredId] of requiredFocusIds.entries()) {
    requireUiResult(
      validateUiId(props.id, ["requiredFocusIds", index], requiredId),
    );
    if (exteriorIds.includes(requiredId)) {
      refuseDialogShape(
        props.id,
        ["requiredFocusIds", index],
        "A required dialog action collides with an exterior identity.",
        "Give every action rendered inside the dialog its own stable identity.",
        "ui.duplicate_item_id",
      );
    }
  }
  if (dismissibilityKind === "blocked") {
    const reason = dismissibility["reason"];
    requireUiResult(
      validateUiText(
        props.id,
        ["dismissibility", "reason"],
        typeof reason === "string" ? reason : "",
        UI_LIMITS.maxDescriptionCodePoints,
      ),
    );
  }
}

function ModalDialog(props: ModalDialogProps) {
  validateDialogProps(props);
  const requiredFocusId0 = props.requiredFocusIds[0] ?? null;
  const requiredFocusId1 = props.requiredFocusIds[1] ?? null;
  const privateDomId = useId();
  const titleId = `${privateDomId}-title`;
  const descriptionId =
    props.description === null ? null : `${privateDomId}-description`;
  const blockedId =
    props.dismissibility.kind === "blocked"
      ? `${privateDomId}-dismiss-reason`
      : null;
  const closeButtonId = `${privateDomId}-close`;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const refusalCallback = useRef(props.onContractRefusal);
  const dismissCallback = useRef(props.onDismiss);
  const dismissibility = useRef(props.dismissibility);
  const overlayLease = useRef<OverlaySurfaceLease | null>(null);
  const [preflightReady, setPreflightReady] = useState(false);
  refusalCallback.current = props.onContractRefusal;
  dismissCallback.current = props.onDismiss;
  dismissibility.current = props.dismissibility;

  useEffect(() => {
    setPreflightReady(false);
    if (!props.open) return;
    const trigger = document.getElementById(props.focusTargets.triggerId);
    const workspace = document.getElementById(props.focusTargets.workspaceId);
    const background = document.getElementById(props.backgroundRootId);
    if (!(trigger instanceof HTMLElement) || !isFocusableRestoreTarget(trigger)) {
      refusalCallback.current(
        overlayDiagnostic(
          "ui.stale_owner",
          props.id,
          ["focusTargets", "triggerId"],
          "The declared dialog trigger is unavailable.",
          "Open the dialog from a connected enabled trigger.",
        ),
      );
      return;
    }
    if (!(workspace instanceof HTMLElement) || !isFocusableRestoreTarget(workspace)) {
      refusalCallback.current(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["focusTargets", "workspaceId"],
          "The declared workspace focus fallback is unavailable.",
          "Render a connected workspace focus target.",
        ),
      );
      return;
    }
    if (!(background instanceof HTMLElement)) {
      refusalCallback.current(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["backgroundRootId"],
          "The declared application background root is unavailable.",
          "Render a stable background beside the dialog host.",
        ),
      );
      return;
    }
    const lease = acquireOverlaySurface(document, {
      backgroundRootId: props.backgroundRootId,
      descriptor: {
        descriptionId,
        dismissibility: dismissibility.current,
        id: props.id,
        initialFocusId: props.initialFocusId,
        kind: props.role === "alertdialog" ? "alert-dialog" : "dialog",
        mode: "modal",
        ownerId: props.focusTargets.triggerId,
        requestRevision: 0,
        restoreFocusId: props.focusTargets.triggerId,
        titleId,
        triggerId: props.focusTargets.triggerId,
      },
      getSurface: () => surfaceRef.current,
      isDismissible: () => dismissibility.current.kind === "dismissible",
      onDismiss: (reason, source) => {
        dismissCallback.current({
          action: "dismiss",
          componentId: props.id,
          itemId: null,
          source,
          value: reason,
        });
      },
      outsidePointerDismisses: props.outsideDismisses,
      transient: null,
      trigger,
    });
    if (!lease.ok) {
      refusalCallback.current(
        lease.kind === "refused"
          ? lease.diagnostic
          : overlayDiagnostic(
              "ui.value_malformed",
              props.id,
              ["overlayCoordinator"],
              "The modal overlay coordinator refused an invalid transient state.",
              "Open the dialog through the modal overlay path.",
            ),
      );
      return;
    }
    overlayLease.current = lease.lease;
    setPreflightReady(true);
    return () => {
      lease.lease.release();
      if (overlayLease.current === lease.lease) {
        overlayLease.current = null;
      }
    };
  }, [
    props.backgroundRootId,
    descriptionId,
    // Dismissibility is live through the ref above. Changing it must not
    // reacquire the modal: its own inert background makes the trigger look
    // stale before the separate focus/inert lease can be released.
    props.focusTargets.triggerId,
    props.id,
    props.initialFocusId,
    props.open,
    props.outsideDismisses,
    props.role,
    titleId,
  ]);

  const ready = props.open && preflightReady;
  useLayoutEffect(() => {
    if (!ready) return;
    const layer = layerRef.current;
    const surface = surfaceRef.current;
    const heading = headingRef.current;
    const background = document.getElementById(props.backgroundRootId);
    const refuseRenderedModal = (diagnostic: UiDiagnostic) => {
      overlayLease.current?.release();
      overlayLease.current = null;
      setPreflightReady(false);
      refusalCallback.current(diagnostic);
    };
    if (
      layer === null ||
      surface === null ||
      heading === null ||
      !(background instanceof HTMLElement)
    ) {
      refuseRenderedModal(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["surface"],
          "The dialog layer, surface, or its declared background was unavailable during focus preflight.",
          "Render the complete dialog layer beside its stable background root.",
        ),
      );
      return;
    }
    const inertLease = makeDocumentOutsideSurfaceInert(
      surface,
      props.id,
      layer,
    );
    if (!inertLease.ok) {
      refuseRenderedModal(inertLease.diagnostic);
      return;
    }
    const candidates = focusCandidatesWithin(surface, props.id);
    if (!candidates.ok) {
      inertLease.release();
      refuseRenderedModal(candidates.diagnostic);
      return;
    }
    for (const requiredId of [requiredFocusId0, requiredFocusId1]) {
      if (requiredId === null) continue;
      const target = document.getElementById(requiredId);
      if (
        !(target instanceof HTMLElement) ||
        !surface.contains(target) ||
        !isFocusableRestoreTarget(target)
      ) {
        inertLease.release();
        refuseRenderedModal(
          overlayDiagnostic(
            "ui.focus_target_missing",
            props.id,
            ["requiredFocusIds", requiredId],
            "A required dialog action target is unavailable.",
            "Render the declared enabled action inside the dialog.",
          ),
        );
        return;
      }
    }
    const target =
      props.initialFocus === "heading"
        ? heading
        : props.initialFocus === "explicit"
          ? props.initialFocusId === null
            ? null
            : document.getElementById(props.initialFocusId)
          : (candidates.candidates[0] ?? heading);
    if (
      !(target instanceof HTMLElement) ||
      !surface.contains(target) ||
      !isFocusableRestoreTarget(target)
    ) {
      inertLease.release();
      refuseRenderedModal(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["initialFocusId"],
          "The declared initial dialog focus target is unavailable.",
          "Choose a connected enabled control inside this dialog.",
        ),
      );
      return;
    }
    target.focus();
    if (document.activeElement !== target) {
      inertLease.release();
      refuseRenderedModal(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["initialFocusId"],
          "The declared initial dialog target could not receive focus.",
          "Choose a connected focusable target within this dialog.",
        ),
      );
      return;
    }
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && surface.contains(event.target)) return;
      const refreshed = focusCandidatesWithin(surface, props.id);
      if (!refreshed.ok) {
        refusalCallback.current(refreshed.diagnostic);
        heading.focus();
        return;
      }
      (refreshed.candidates[0] ?? heading).focus();
    };
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      inertLease.release();
      const restored = restoreFocus(document, [
        props.focusTargets.triggerId,
        ...(props.focusTargets.workflowTargetId === null
          ? []
          : [props.focusTargets.workflowTargetId]),
        props.focusTargets.workspaceId,
      ]);
      if (restored.kind !== "exact") {
        refusalCallback.current(
          overlayDiagnostic(
            "ui.stale_owner",
            props.id,
            ["focusTargets", "triggerId"],
            "The exact dialog trigger was unavailable during focus restoration.",
            restored.kind === "fallback"
              ? "Focus moved to the declared stable fallback."
              : "Restore a stable workspace focus target.",
          ),
        );
      }
    };
  }, [
    props.backgroundRootId,
    props.focusTargets.triggerId,
    props.focusTargets.workflowTargetId,
    props.focusTargets.workspaceId,
    props.id,
    props.initialFocus,
    props.initialFocusId,
    requiredFocusId0,
    requiredFocusId1,
    ready,
  ]);

  const requestDismiss = (
    source: UiInteractionSource,
    reason: UiDismissReason,
  ) => {
    overlayLease.current?.requestDismiss(reason, source);
  };
  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key !== "Tab") return;
    const surface = surfaceRef.current;
    const heading = headingRef.current;
    if (surface === null || heading === null) return;
    const candidates = focusCandidatesWithin(surface, props.id);
    if (!candidates.ok) {
      event.preventDefault();
      refusalCallback.current(candidates.diagnostic);
      heading.focus();
      return;
    }
    const first = candidates.candidates[0] ?? heading;
    const last = candidates.candidates.at(-1) ?? heading;
    const active = document.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      !surface.contains(active) ||
      (event.shiftKey && active === first) ||
      (!event.shiftKey && active === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };
  if (!ready) return null;

  return (
    <div class="ui-dialog-layer" ref={layerRef}>
      <div
        aria-hidden="true"
        class="ui-dialog-backdrop"
      />
      <div
        aria-busy={props.busy ? "true" : undefined}
        aria-describedby={joinIdReferences(
          [...props.describedBy, descriptionId, blockedId].filter(
            (id): id is string => id !== null,
          ),
        )}
        aria-invalid={props.invalid ? "true" : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        class="ui-dialog"
        data-density={props.density}
        id={props.id}
        onKeyDown={onKeyDown}
        ref={surfaceRef}
        role={props.role}
      >
        <header class="ui-dialog__header">
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            {props.title}
          </h2>
          <Button
            busy={false}
            density={props.density}
            describedBy={blockedId === null ? [] : [blockedId]}
            disabled={props.disabled || props.dismissibility.kind === "blocked"}
            id={closeButtonId}
            invalid={false}
            label={props.closeLabel}
            onAction={(event) => {
              requestDismiss(event.source, "cancel");
            }}
            type="button"
            variant="ghost"
          />
        </header>
        {props.description === null ? null : (
          <p class="ui-dialog__description" id={descriptionId ?? undefined}>
            {props.description}
          </p>
        )}
        {props.dismissibility.kind === "blocked" ? (
          <p class="ui-dialog__blocked" id={blockedId ?? undefined}>
            {props.dismissibility.reason}
          </p>
        ) : null}
        <div class="ui-dialog__content">{props.content}</div>
      </div>
    </div>
  );
}

export function Dialog(props: DialogProps) {
  const modalProps: ModalDialogProps = {
    ...props,
    outsideDismisses: true,
    requiredFocusIds: NO_REQUIRED_FOCUS_IDS,
    role: "dialog",
  };
  validateDialogProps(modalProps);
  return (
    <ModalDialog {...modalProps} />
  );
}

export function AlertDialog(props: AlertDialogProps) {
  const propsValue: unknown = props;
  requireDialogInputRecord(propsValue);
  const componentId = dialogComponentId(propsValue);
  const leastDestructiveActionId = propsValue["leastDestructiveActionId"];
  const confirmActionId = propsValue["confirmActionId"];
  requireUiResult(
    validateUiId(
      componentId,
      ["leastDestructiveActionId"],
      typeof leastDestructiveActionId === "string"
        ? leastDestructiveActionId
        : "",
    ),
  );
  requireUiResult(
    validateUiId(
      componentId,
      ["confirmActionId"],
      typeof confirmActionId === "string" ? confirmActionId : "",
    ),
  );
  if (props.leastDestructiveActionId === props.confirmActionId) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.value_malformed",
        props.id,
        ["confirmActionId"],
        "Alert dialog confirm and least-destructive actions must be distinct.",
        "Provide separate stable action identities.",
      ),
    );
  }
  const modalProps: ModalDialogProps = {
    ...props,
    initialFocus: "explicit",
    initialFocusId: props.leastDestructiveActionId,
    outsideDismisses: false,
    requiredFocusIds: [
      props.leastDestructiveActionId,
      props.confirmActionId,
    ],
    role: "alertdialog",
  };
  validateDialogProps(modalProps);
  return (
    <ModalDialog {...modalProps} />
  );
}
