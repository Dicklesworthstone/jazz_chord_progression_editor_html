import type { ComponentChildren, KeyboardEventHandler } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import {
  UI_LIMITS,
  UI_OVERLAY_KIND_MODES,
  type UiDiagnostic,
  type UiDismissReason,
  type UiInteractionSource,
  type UiRefusalCode,
  type UiSheetDrawerProps,
} from "../ui-contract";
import { Button } from "../primitives/Button";
import { joinIdReferences } from "../primitives/id-references";
import {
  requireUiResult,
  uiDiagnostic,
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

export type SheetDrawerFocusTargets = Readonly<{
  triggerId: string;
  workflowTargetId: string | null;
  workspaceId: string;
}>;

export type SheetDrawerProps = UiSheetDrawerProps<ComponentChildren> &
  Readonly<{
    backgroundRootId: string;
    focusTargets: SheetDrawerFocusTargets;
    onContractRefusal: (diagnostic: UiDiagnostic) => void;
  }>;

function requireCondition(
  condition: boolean,
  code: UiRefusalCode,
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
): asserts condition {
  if (condition) return;
  const refusal = uiDiagnostic(
    code,
    componentId,
    path,
    message,
    recoveryAction,
  );
  requireUiResult<true>({ diagnostics: [refusal], ok: false, refusal });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/**
 * Pure render-boundary validation. It deliberately runs before the first hook,
 * effect, document lookup, listener, modal lease, focus change, or inertness
 * mutation in SheetDrawer.
 */
function preflightSheetDrawer(props: SheetDrawerProps): void {
  const componentId =
    typeof props.id === "string" && props.id.trim().length > 0
      ? props.id
      : "sheet-drawer";
  const describedBy: unknown = props.describedBy;
  requireCondition(
    Array.isArray(describedBy),
    "ui.value_malformed",
    componentId,
    ["describedBy"],
    "Sheet described-by references must be a bounded identity collection.",
    "Provide an array of stable description identities.",
  );
  requireUiResult(validateUiCommonProps(props));

  const density: unknown = props.density;
  const disabled: unknown = props.disabled;
  const busy: unknown = props.busy;
  const invalid: unknown = props.invalid;
  requireCondition(
    density === "comfortable" || density === "dense",
    "ui.value_malformed",
    props.id,
    ["density"],
    "Sheet density is outside the reviewed vocabulary.",
    "Use comfortable or dense presentation density.",
  );
  requireCondition(
    typeof disabled === "boolean" &&
      typeof busy === "boolean" &&
      typeof invalid === "boolean",
    "ui.value_malformed",
    props.id,
    ["state"],
    "Sheet disabled, busy, and invalid states must be explicit booleans.",
    "Provide boolean common-state values.",
  );

  requireUiResult(
    validateUiText(
      props.id,
      ["accessibleName", "title"],
      props.title,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  requireCondition(
    typeof props.closeLabel === "string" && props.closeLabel.trim().length > 0,
    "ui.description_invalid",
    props.id,
    ["closeLabel"],
    "A sheet must describe its visible Close affordance.",
    "Provide a visible bounded Close label for every sheet state.",
  );
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

  const open: unknown = props.open;
  const mode: unknown = props.mode;
  const side: unknown = props.side;
  const contextRevealCssPx: unknown = props.contextRevealCssPx;
  requireCondition(
    typeof open === "boolean",
    "ui.value_malformed",
    props.id,
    ["open"],
    "Sheet open state must be an explicit boolean.",
    "Provide a controlled boolean open state.",
  );
  requireCondition(
    mode === "modal" || mode === "nonmodal",
    "ui.value_malformed",
    props.id,
    ["mode"],
    "Sheet mode is outside the reviewed overlay vocabulary.",
    "Use modal or nonmodal sheet mode.",
  );
  requireCondition(
    UI_OVERLAY_KIND_MODES.sheet.includes(mode),
    "ui.value_malformed",
    props.id,
    ["mode"],
    "The fixed sheet overlay kind does not permit the declared mode.",
    "Use a mode declared for the sheet overlay kind.",
  );
  requireCondition(
    side === "inline-start" ||
      side === "inline-end" ||
      side === "block-end",
    "ui.value_malformed",
    props.id,
    ["side"],
    "Sheet side is outside the reviewed logical-side vocabulary.",
    "Use inline-start, inline-end, or block-end.",
  );
  requireCondition(
    contextRevealCssPx === 48,
    "ui.value_malformed",
    props.id,
    ["contextRevealCssPx"],
    "Sheet context reveal must remain exactly 48 CSS pixels.",
    "Use the reviewed 48 CSS pixel context reveal.",
  );

  const dismissibility: unknown = props.dismissibility;
  requireCondition(
    isRecord(dismissibility),
    "ui.value_malformed",
    props.id,
    ["dismissibility"],
    "Sheet dismissibility must be an explicit reviewed record.",
    "Provide dismissible or blocked dismissibility state.",
  );
  const dismissibilityKind = dismissibility["kind"];
  requireCondition(
    dismissibilityKind === "dismissible" || dismissibilityKind === "blocked",
    "ui.value_malformed",
    props.id,
    ["dismissibility", "kind"],
    "Sheet dismissibility kind is outside the reviewed vocabulary.",
    "Use dismissible or blocked dismissibility state.",
  );
  if (dismissibilityKind === "blocked") {
    const reason = dismissibility["reason"];
    requireCondition(
      typeof reason === "string",
      "ui.description_invalid",
      props.id,
      ["dismissibility", "reason"],
      "A blocked sheet requires a bounded visible dismissal reason.",
      "Provide a nonblank reason for the blocked Close control.",
    );
    requireUiResult(
      validateUiText(
        props.id,
        ["dismissibility", "description", "reason"],
        reason,
        UI_LIMITS.maxDescriptionCodePoints,
      ),
    );
  }

  const backgroundRootId: unknown = props.backgroundRootId;
  requireCondition(
    typeof backgroundRootId === "string",
    "ui.id_invalid",
    props.id,
    ["backgroundRootId"],
    "The sheet background root requires a stable identity.",
    "Provide a bounded background root identity.",
  );
  requireUiResult(
    validateUiId(props.id, ["backgroundRootId"], backgroundRootId),
  );

  const focusTargets: unknown = props.focusTargets;
  requireCondition(
    isRecord(focusTargets),
    "ui.value_malformed",
    props.id,
    ["focusTargets"],
    "Sheet focus restoration targets must be an explicit record.",
    "Provide trigger, workflow, and workspace focus target identities.",
  );
  const triggerId = focusTargets["triggerId"];
  const workflowTargetId = focusTargets["workflowTargetId"];
  const workspaceId = focusTargets["workspaceId"];
  requireCondition(
    typeof triggerId === "string",
    "ui.id_invalid",
    props.id,
    ["focusTargets", "triggerId"],
    "The sheet trigger requires a stable identity.",
    "Provide a bounded trigger identity.",
  );
  requireUiResult(
    validateUiId(props.id, ["focusTargets", "triggerId"], triggerId),
  );
  requireCondition(
    workflowTargetId === null || typeof workflowTargetId === "string",
    "ui.id_invalid",
    props.id,
    ["focusTargets", "workflowTargetId"],
    "The workflow focus fallback must be null or a stable identity.",
    "Provide null or a bounded workflow target identity.",
  );
  if (typeof workflowTargetId === "string") {
    requireUiResult(
      validateUiId(
        props.id,
        ["focusTargets", "workflowTargetId"],
        workflowTargetId,
      ),
    );
  }
  requireCondition(
    typeof workspaceId === "string",
    "ui.id_invalid",
    props.id,
    ["focusTargets", "workspaceId"],
    "The workspace focus fallback requires a stable identity.",
    "Provide a bounded workspace identity.",
  );
  requireUiResult(
    validateUiId(props.id, ["focusTargets", "workspaceId"], workspaceId),
  );

  const initialFocus: unknown = props.initialFocus;
  const initialFocusId: unknown = props.initialFocusId;
  requireCondition(
    initialFocus === "first-control" ||
      initialFocus === "heading" ||
      initialFocus === "explicit",
    "ui.value_malformed",
    props.id,
    ["initialFocus"],
    "Sheet initial-focus policy is outside the reviewed vocabulary.",
    "Use first-control, heading, or explicit focus.",
  );
  if (initialFocus === "explicit") {
    requireCondition(
      typeof initialFocusId === "string",
      "ui.focus_target_missing",
      props.id,
      ["initialFocusId"],
      "Explicit sheet focus requires a stable target identity.",
      "Provide the identity of an enabled control inside the sheet.",
    );
    requireUiResult(
      validateUiId(props.id, ["initialFocusId"], initialFocusId),
    );
  } else {
    requireCondition(
      initialFocusId === null,
      "ui.value_malformed",
      props.id,
      ["initialFocusId"],
      "A non-explicit initial-focus policy cannot carry a target identity.",
      "Set initialFocusId to null or choose explicit focus.",
    );
  }

  const onDismiss: unknown = props.onDismiss;
  const onContractRefusal: unknown = props.onContractRefusal;
  requireCondition(
    typeof onDismiss === "function" && typeof onContractRefusal === "function",
    "ui.value_malformed",
    props.id,
    ["callbacks"],
    "Sheet callbacks must be callable semantic boundaries.",
    "Provide onDismiss and onContractRefusal callbacks.",
  );
}

function initialTarget(
  props: SheetDrawerProps,
  surface: HTMLElement,
  heading: HTMLElement,
):
  | Readonly<{ ok: true; target: HTMLElement }>
  | Readonly<{ ok: false; diagnostic: UiDiagnostic }> {
  if (props.initialFocus === "heading") {
    return { ok: true, target: heading };
  }

  if (props.initialFocus === "explicit") {
    const target =
      props.initialFocusId === null
        ? null
        : surface.ownerDocument.getElementById(props.initialFocusId);
    if (
      !(target instanceof HTMLElement) ||
      !surface.contains(target) ||
      !isFocusableRestoreTarget(target)
    ) {
      return {
        diagnostic: overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["initialFocusId"],
          "The declared initial focus target is unavailable inside the sheet.",
          "Choose a connected enabled control within this sheet.",
        ),
        ok: false,
      };
    }
    return { ok: true, target };
  }

  const candidates = focusCandidatesWithin(surface, props.id);
  if (!candidates.ok) {
    return candidates;
  }
  return { ok: true, target: candidates.candidates[0] ?? heading };
}

export function SheetDrawer(props: SheetDrawerProps) {
  preflightSheetDrawer(props);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const refusalCallback = useRef(props.onContractRefusal);
  const dismissCallback = useRef(props.onDismiss);
  const dismissibility = useRef(props.dismissibility);
  const overlayLease = useRef<OverlaySurfaceLease | null>(null);
  const restoreAfterClose = useRef(true);
  const [preflightReady, setPreflightReady] = useState(false);
  refusalCallback.current = props.onContractRefusal;
  dismissCallback.current = props.onDismiss;
  dismissibility.current = props.dismissibility;

  const titleId = `${props.id}-title`;
  const descriptionId =
    props.description === null ? null : `${props.id}-description`;

  useEffect(() => {
    setPreflightReady(false);
    if (!props.open) {
      return;
    }
    restoreAfterClose.current = true;

    const trigger = document.getElementById(props.focusTargets.triggerId);
    if (!(trigger instanceof HTMLElement) || !isFocusableRestoreTarget(trigger)) {
      refusalCallback.current(
        overlayDiagnostic(
          "ui.stale_owner",
          props.id,
          ["focusTargets", "triggerId"],
          "The declared sheet trigger is unavailable.",
          "Open the sheet from a connected enabled trigger.",
        ),
      );
      return;
    }

    const workspace = document.getElementById(props.focusTargets.workspaceId);
    if (
      !(workspace instanceof HTMLElement) ||
      !isFocusableRestoreTarget(workspace)
    ) {
      refusalCallback.current(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["focusTargets", "workspaceId"],
          "The declared workspace focus fallback is unavailable.",
          "Render a connected programmatic workspace focus target.",
        ),
      );
      return;
    }

    const background = document.getElementById(props.backgroundRootId);
    if (props.mode === "modal" && !(background instanceof HTMLElement)) {
      refusalCallback.current(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["backgroundRootId"],
          "The declared application background root is unavailable.",
          "Render a stable background root beside the dialog host.",
        ),
      );
      return;
    }

    const lease = acquireOverlaySurface(document, {
      backgroundRootId: props.backgroundRootId,
      descriptor: {
        descriptionId,
        dismissibility: props.dismissibility,
        id: props.id,
        initialFocusId: props.initialFocusId,
        kind: "sheet",
        mode: props.mode,
        ownerId: props.focusTargets.triggerId,
        requestRevision: 0,
        restoreFocusId: props.focusTargets.triggerId,
        titleId,
        triggerId: props.focusTargets.triggerId,
      },
      getSurface: () => surfaceRef.current,
      isDismissible: () => dismissibility.current.kind === "dismissible",
      onDismiss: (reason, source) => {
        restoreAfterClose.current =
          props.mode === "modal" || reason !== "outside-pointer";
        dismissCallback.current({
          action: "dismiss",
          componentId: props.id,
          itemId: null,
          source,
          value: reason,
        });
      },
      outsidePointerDismisses: true,
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
              "The sheet overlay coordinator refused an invalid transient state.",
              "Open the sheet through its declared modal or nonmodal path.",
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
    props.focusTargets.triggerId,
    props.id,
    props.mode,
    props.open,
  ]);

  const ready = props.open && preflightReady;

  useLayoutEffect(() => {
    if (!ready) {
      return;
    }
    const layer = layerRef.current;
    const surface = surfaceRef.current;
    const heading = headingRef.current;
    const refuseRenderedSheet = (diagnostic: UiDiagnostic) => {
      overlayLease.current?.release();
      overlayLease.current = null;
      setPreflightReady(false);
      refusalCallback.current(diagnostic);
    };
    if (layer === null || surface === null || heading === null) {
      refuseRenderedSheet(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["surface"],
          "The sheet layer, surface, or heading was unavailable during focus preflight.",
          "Render a complete sheet layer and surface before opening it.",
        ),
      );
      return;
    }

    const ownerDocument = surface.ownerDocument;
    let releaseBackground: () => void = () => undefined;
    if (props.mode === "modal") {
      const background = ownerDocument.getElementById(props.backgroundRootId);
      if (!(background instanceof HTMLElement)) {
        refuseRenderedSheet(
          overlayDiagnostic(
            "ui.focus_target_missing",
            props.id,
            ["backgroundRootId"],
            "The declared application background root is unavailable.",
            "Render a stable background root beside the dialog host.",
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
        refuseRenderedSheet(inertLease.diagnostic);
        return;
      }
      releaseBackground = inertLease.release;
    }

    const target = initialTarget(props, surface, heading);
    if (!target.ok) {
      releaseBackground();
      refuseRenderedSheet(target.diagnostic);
      return;
    }
    target.target.focus();
    if (ownerDocument.activeElement !== target.target) {
      releaseBackground();
      refuseRenderedSheet(
        overlayDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["initialFocusId"],
          "The declared initial focus target could not receive focus.",
          "Choose a connected focusable target within this sheet.",
        ),
      );
      return;
    }

    const containProgrammaticFocus = (event: FocusEvent) => {
      if (
        props.mode !== "modal" ||
        (event.target instanceof Node && surface.contains(event.target))
      ) {
        return;
      }
      const candidates = focusCandidatesWithin(surface, props.id);
      if (!candidates.ok) {
        refusalCallback.current(candidates.diagnostic);
        heading.focus();
        return;
      }
      (candidates.candidates[0] ?? heading).focus();
    };

    if (props.mode === "modal") {
      ownerDocument.addEventListener("focusin", containProgrammaticFocus);
    }

    return () => {
      ownerDocument.removeEventListener("focusin", containProgrammaticFocus);
      releaseBackground();
      if (!restoreAfterClose.current) {
        restoreAfterClose.current = true;
        return;
      }
      const restoreOutcome = restoreFocus(
        ownerDocument,
        [
          props.focusTargets.triggerId,
          ...(props.focusTargets.workflowTargetId === null
            ? []
            : [props.focusTargets.workflowTargetId]),
          props.focusTargets.workspaceId,
        ],
      );
      if (restoreOutcome.kind !== "exact") {
        refusalCallback.current(
          overlayDiagnostic(
            "ui.stale_owner",
            props.id,
            ["focusTargets", "triggerId"],
            "The exact trigger was unavailable during focus restoration.",
            restoreOutcome.kind === "fallback"
              ? "Focus moved to the declared stable fallback."
              : "Restore a stable workflow or workspace focus target.",
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
    props.mode,
    ready,
  ]);

  const requestDismiss = (
    source: UiInteractionSource,
    reason: UiDismissReason,
  ) => {
    overlayLease.current?.requestDismiss(reason, source);
  };

  const onSurfaceKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key !== "Tab" || props.mode !== "modal") {
      return;
    }

    const surface = surfaceRef.current;
    const heading = headingRef.current;
    if (surface === null || heading === null) {
      return;
    }
    const candidates = focusCandidatesWithin(surface, props.id);
    if (!candidates.ok) {
      event.preventDefault();
      refusalCallback.current(candidates.diagnostic);
      heading.focus();
      return;
    }
    if (candidates.candidates.length === 0) {
      event.preventDefault();
      heading.focus();
      return;
    }

    const first = candidates.candidates[0];
    const last = candidates.candidates[candidates.candidates.length - 1];
    const active = surface.ownerDocument.activeElement;
    const activeIndex =
      active instanceof HTMLElement ? candidates.candidates.indexOf(active) : -1;
    if (
      activeIndex === -1 ||
      (event.shiftKey && active === first) ||
      (!event.shiftKey && active === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };

  if (!ready) {
    return null;
  }

  const blockedReasonId =
    props.dismissibility.kind === "blocked" ? `${props.id}-dismiss-reason` : null;
  const describedBy = [
    ...props.describedBy,
    descriptionId,
    blockedReasonId,
  ].filter(
    (id): id is string => id !== null,
  );

  return (
    <div class="ui-sheet-layer" data-mode={props.mode} ref={layerRef}>
      {props.mode === "modal" ? (
        <div
          aria-hidden="true"
          class="ui-sheet-backdrop"
        />
      ) : null}
      <div
        aria-busy={props.busy ? "true" : undefined}
        aria-describedby={joinIdReferences(describedBy)}
        aria-invalid={props.invalid ? "true" : undefined}
        aria-labelledby={titleId}
        aria-modal={props.mode === "modal" ? "true" : undefined}
        class="ui-sheet"
        data-context-reveal-css-px={String(props.contextRevealCssPx)}
        data-density={props.density}
        data-mode={props.mode}
        data-side={props.side}
        id={props.id}
        onKeyDown={onSurfaceKeyDown}
        ref={surfaceRef}
        role={props.mode === "modal" ? "dialog" : "complementary"}
      >
        <header class="ui-sheet__header">
          <h2 class="ui-sheet__title" id={titleId} ref={headingRef} tabIndex={-1}>
            {props.title}
          </h2>
          <Button
            busy={false}
            density={props.density}
            describedBy={blockedReasonId === null ? [] : [blockedReasonId]}
            disabled={props.disabled || props.dismissibility.kind === "blocked"}
            id={`${props.id}-close`}
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
          <p class="ui-sheet__description" id={descriptionId ?? undefined}>
            {props.description}
          </p>
        )}
        {props.dismissibility.kind === "blocked" ? (
          <p class="ui-sheet__blocked-reason" id={blockedReasonId ?? undefined}>
            {props.dismissibility.reason}
          </p>
        ) : null}
        <div class="ui-sheet__content">{props.content}</div>
      </div>
    </div>
  );
}
