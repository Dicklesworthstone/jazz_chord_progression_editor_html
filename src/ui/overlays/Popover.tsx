import type { ComponentChildren } from "preact";
import { useId, useLayoutEffect, useRef, useState } from "preact/hooks";

import { UI_LIMITS, type UiPopoverProps } from "../ui-contract";
import { Button } from "../primitives/Button";
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
  type OverlaySurfaceLease,
} from "./focus-dismiss";

export type PopoverProps = UiPopoverProps<ComponentChildren>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function popoverComponentId(value: unknown): string {
  if (!isRecord(value)) return "popover";
  const id = value["id"];
  return typeof id === "string" && id.trim().length > 0 ? id : "popover";
}

function requirePopoverRecord(value: unknown): void {
  const componentId = popoverComponentId(value);
  if (!isRecord(value)) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        ["props"],
        "Popover props must use the reviewed controlled record shape.",
        "Provide a bounded popover prop record.",
      ),
    );
  }
  const id = value["id"];
  requireUiResult(
    validateUiId(
      componentId,
      ["id"],
      typeof id === "string" ? id : "",
    ),
  );
  if (id === value["triggerId"]) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.duplicate_item_id",
        componentId,
        ["triggerId"],
        "The popover surface and trigger identities must be distinct.",
        "Give the popover surface its own stable identity.",
      ),
    );
  }
  if (
    typeof value["open"] !== "boolean" ||
    typeof value["onOpenChange"] !== "function"
  ) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        typeof value["open"] !== "boolean" ? ["open"] : ["onOpenChange"],
        "Popover controlled state and callback must use the reviewed shapes.",
        "Provide a boolean open state and callable change boundary.",
      ),
    );
  }
}

function requireOpenTrigger(props: PopoverProps): HTMLElement | null {
  if (!props.open) return null;
  const trigger =
    typeof document === "undefined"
      ? null
      : document.getElementById(props.triggerId);
  if (!(trigger instanceof HTMLElement) || !isFocusableRestoreTarget(trigger)) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.stale_owner",
        props.id,
        ["triggerId"],
        "The declared popover trigger is missing or unavailable.",
        "Open the popover from a connected enabled trigger.",
      ),
    );
  }
  return trigger;
}

export function Popover(props: PopoverProps) {
  requirePopoverRecord(props);
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(validateUiId(props.id, ["triggerId"], props.triggerId));
  requireUiResult(
    validateUiText(
      props.id,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  const openTrigger = requireOpenTrigger(props);
  const privateDomId = useId();
  const closeButtonId = `${privateDomId}-close`;
  const surface = useRef<HTMLDivElement | null>(null);
  const callback = useRef(props.onOpenChange);
  const unavailable = useRef(props.disabled || props.busy);
  const overlayLease = useRef<OverlaySurfaceLease | null>(null);
  const restoreOnClose = useRef(true);
  const refusalCloseRequested = useRef(false);
  const [leaseReady, setLeaseReady] = useState(false);
  callback.current = props.onOpenChange;
  unavailable.current = props.disabled || props.busy;

  useLayoutEffect(() => {
    setLeaseReady(false);
    if (!props.open || openTrigger === null) {
      refusalCloseRequested.current = false;
      return;
    }
    restoreOnClose.current = true;
    const acquired = acquireOverlaySurface(openTrigger.ownerDocument, {
      backgroundRootId: props.triggerId,
      descriptor: {
        descriptionId: null,
        dismissibility:
          unavailable.current
            ? { kind: "blocked", reason: "Popover controls are unavailable." }
            : { kind: "dismissible" },
        id: props.id,
        initialFocusId: null,
        kind: "popover",
        mode: "nonmodal",
        ownerId: props.triggerId,
        requestRevision: 0,
        restoreFocusId: props.triggerId,
        titleId: null,
        triggerId: props.triggerId,
      },
      getSurface: () => surface.current,
      isDismissible: () => !unavailable.current,
      onDismiss: (reason, source) => {
        restoreOnClose.current =
          reason !== "outside-pointer" && reason !== "replaced";
        callback.current({
          componentId: props.id,
          phase: "cancel",
          previousValue: true,
          source,
          value: false,
        });
      },
      outsidePointerDismisses: true,
      transient: "other",
      trigger: openTrigger,
    });
    if (!acquired.ok) {
      if (!refusalCloseRequested.current) {
        refusalCloseRequested.current = true;
        callback.current({
          componentId: props.id,
          phase: "cancel",
          previousValue: true,
          source: "programmatic",
          value: false,
        });
      }
      return;
    }
    refusalCloseRequested.current = false;
    overlayLease.current = acquired.lease;
    setLeaseReady(true);
    return () => {
      acquired.lease.release();
      if (overlayLease.current === acquired.lease) overlayLease.current = null;
    };
  }, [openTrigger, props.id, props.open, props.triggerId]);

  useLayoutEffect(() => {
    if (!props.open || !leaseReady || openTrigger === null) return;
    const popover = surface.current;
    if (popover === null) return;
    const ownerDocument = popover.ownerDocument;

    const candidates = focusCandidatesWithin(popover, props.id);
    if (!candidates.ok) throw new UiContractError(candidates.diagnostic);
    const initialTarget = candidates.candidates[0] ?? popover;
    initialTarget.focus();
    if (ownerDocument.activeElement !== initialTarget) {
      throw new UiContractError(
        uiDiagnostic(
          "ui.focus_target_missing",
          props.id,
          ["content", "initialFocus"],
          "The popover could not establish its initial focus target.",
          "Provide an enabled control or a focusable named popover surface.",
        ),
      );
    }

    return () => {
      if (restoreOnClose.current && isFocusableRestoreTarget(openTrigger)) {
        openTrigger.focus();
      }
    };
  }, [leaseReady, openTrigger, props.id, props.open]);

  if (!props.open || !leaseReady) return null;
  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={
        props.describedBy.length === 0 ? undefined : props.describedBy.join(" ")
      }
      aria-disabled={props.disabled ? "true" : undefined}
      aria-label={props.accessibleName}
      class="ui-popover"
      data-density={props.density}
      id={props.id}
      ref={surface}
      role="dialog"
      tabIndex={-1}
    >
      <div class="ui-popover__content">{props.content}</div>
      <Button
        busy={props.busy}
        density={props.density}
        describedBy={[]}
        disabled={props.disabled}
        id={closeButtonId}
        invalid={false}
        label="Close"
        onAction={(event) => {
          overlayLease.current?.requestDismiss("cancel", event.source);
        }}
        type="button"
        variant="ghost"
      />
    </div>
  );
}
