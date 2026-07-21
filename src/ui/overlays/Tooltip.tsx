import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import {
  UI_LIMITS,
  type UiInteractionSource,
  type UiTooltipProps,
} from "../ui-contract";
import { joinIdReferences } from "../primitives/id-references";
import {
  requireUiResult,
  uiDiagnostic,
  UiContractError,
  validateUiId,
  validateUiText,
} from "../primitives/validation";
import {
  acquireOverlaySurface,
  type OverlaySurfaceLease,
} from "./focus-dismiss";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tooltipComponentId(value: unknown): string {
  if (!isRecord(value)) return "tooltip";
  const id = value["id"];
  return typeof id === "string" && id.trim().length > 0 ? id : "tooltip";
}

export function preflightTooltipProps(value: unknown): void {
  const componentId = tooltipComponentId(value);
  if (!isRecord(value)) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.value_malformed",
        componentId,
        ["props"],
        "Tooltip props must use the reviewed controlled record shape.",
        "Provide a bounded tooltip prop record.",
      ),
    );
  }
  const id = value["id"];
  const triggerId = value["triggerId"];
  const text = value["text"];
  requireUiResult(
    validateUiId(
      componentId,
      ["id"],
      typeof id === "string" ? id : "",
    ),
  );
  requireUiResult(
    validateUiId(
      componentId,
      ["triggerId"],
      typeof triggerId === "string" ? triggerId : "",
    ),
  );
  requireUiResult(
    validateUiText(
      componentId,
      ["text"],
      typeof text === "string" ? text : "",
      UI_LIMITS.maxTooltipCodePoints,
    ),
  );
  if (id === triggerId) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.duplicate_item_id",
        componentId,
        ["triggerId"],
        "The tooltip surface and trigger identities must be distinct.",
        "Give the tooltip surface its own stable identity.",
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
        "Tooltip controlled state and callback must use the reviewed shapes.",
        "Provide a boolean open state and callable change boundary.",
      ),
    );
  }
}

function requireTooltipTrigger(props: UiTooltipProps): HTMLElement {
  const trigger =
    typeof document === "undefined"
      ? null
      : document.getElementById(props.triggerId);
  if (!(trigger instanceof HTMLElement)) {
    throw new UiContractError(
      uiDiagnostic(
        "ui.stale_owner",
        props.id,
        ["triggerId"],
        "The declared tooltip trigger is missing.",
        "Render the tooltip with its connected trigger.",
      ),
    );
  }
  return trigger;
}

export function Tooltip(props: UiTooltipProps) {
  preflightTooltipProps(props);
  const trigger = requireTooltipTrigger(props);
  const surface = useRef<HTMLDivElement | null>(null);
  const callback = useRef(props.onOpenChange);
  const latestOpen = useRef(props.open);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const pointerFocusTimer = useRef<number | null>(null);
  const pointerFocusExpected = useRef(false);
  const pointerOverTrigger = useRef(false);
  const pointerOverTooltip = useRef(false);
  const keyboardFocusOpen = useRef(false);
  const overlayLease = useRef<OverlaySurfaceLease | null>(null);
  const suppressionCloseRequested = useRef(false);
  const [leaseReady, setLeaseReady] = useState(false);
  callback.current = props.onOpenChange;
  latestOpen.current = props.open;

  useLayoutEffect(() => {
    setLeaseReady(false);
    if (!props.open) {
      suppressionCloseRequested.current = false;
      return;
    }
    const acquired = acquireOverlaySurface(trigger.ownerDocument, {
      backgroundRootId: props.triggerId,
      descriptor: {
        descriptionId: null,
        dismissibility: { kind: "dismissible" },
        id: props.id,
        initialFocusId: null,
        kind: "tooltip",
        mode: "nonmodal",
        ownerId: props.triggerId,
        requestRevision: 0,
        restoreFocusId: props.triggerId,
        titleId: null,
        triggerId: props.triggerId,
      },
      getSurface: () => surface.current,
      isDismissible: () => true,
      onDismiss: (_reason, source) => {
        keyboardFocusOpen.current = false;
        callback.current({
          componentId: props.id,
          phase: "cancel",
          previousValue: true,
          source,
          value: false,
        });
      },
      outsidePointerDismisses: false,
      transient: "tooltip",
      trigger,
    });
    if (!acquired.ok) {
      if (!suppressionCloseRequested.current) {
        suppressionCloseRequested.current = true;
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
    suppressionCloseRequested.current = false;
    overlayLease.current = acquired.lease;
    setLeaseReady(true);
    return () => {
      acquired.lease.release();
      if (overlayLease.current === acquired.lease) overlayLease.current = null;
    };
  }, [props.id, props.open, props.triggerId, trigger]);

  useEffect(() => {
    const tooltip = surface.current;
    const previousDescriptions = trigger.getAttribute("aria-describedby");
    const clearTimer = (timer: typeof openTimer) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const clearPresentationTimers = () => {
      clearTimer(openTimer);
      clearTimer(closeTimer);
    };
    const request = (value: boolean, source: UiInteractionSource) => {
      if (value === latestOpen.current) return;
      if (!value && overlayLease.current !== null) {
        overlayLease.current.requestDismiss("focus-left", source);
        return;
      }
      callback.current({
        componentId: props.id,
        phase: "commit",
        previousValue: latestOpen.current,
        source,
        value,
      });
    };
    const scheduleClose = (source: UiInteractionSource) => {
      clearTimer(closeTimer);
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        if (!pointerOverTrigger.current && !pointerOverTooltip.current) {
          request(false, source);
        }
      }, UI_LIMITS.tooltipCloseDelayMs);
    };
    const onTriggerPointerEnter = () => {
      pointerOverTrigger.current = true;
      clearTimer(closeTimer);
      if (latestOpen.current) return;
      clearTimer(openTimer);
      openTimer.current = window.setTimeout(() => {
        openTimer.current = null;
        request(true, "pointer");
      }, UI_LIMITS.tooltipPointerOpenDelayMs);
    };
    const onTriggerPointerLeave = () => {
      pointerOverTrigger.current = false;
      clearTimer(openTimer);
      scheduleClose("pointer");
    };
    const onTooltipPointerEnter = () => {
      pointerOverTooltip.current = true;
      clearTimer(closeTimer);
    };
    const onTooltipPointerLeave = () => {
      pointerOverTooltip.current = false;
      scheduleClose("pointer");
    };
    const onPointerDown = () => {
      pointerFocusExpected.current = true;
      clearTimer(pointerFocusTimer);
      pointerFocusTimer.current = window.setTimeout(() => {
        pointerFocusExpected.current = false;
        pointerFocusTimer.current = null;
      }, 0);
    };
    const onFocus = () => {
      if (pointerFocusExpected.current) {
        pointerFocusExpected.current = false;
        clearTimer(pointerFocusTimer);
        keyboardFocusOpen.current = false;
        return;
      }
      keyboardFocusOpen.current = true;
      clearPresentationTimers();
      request(true, "keyboard");
    };
    const onBlur = () => {
      if (!keyboardFocusOpen.current) return;
      keyboardFocusOpen.current = false;
      clearPresentationTimers();
      if (!pointerOverTrigger.current && !pointerOverTooltip.current) {
        request(false, "keyboard");
      }
    };
    trigger.addEventListener("pointerenter", onTriggerPointerEnter);
    trigger.addEventListener("pointerleave", onTriggerPointerLeave);
    trigger.addEventListener("pointerdown", onPointerDown);
    trigger.addEventListener("focus", onFocus);
    trigger.addEventListener("blur", onBlur);
    tooltip?.addEventListener("pointerenter", onTooltipPointerEnter);
    tooltip?.addEventListener("pointerleave", onTooltipPointerLeave);
    if (props.open && leaseReady) {
      trigger.setAttribute(
        "aria-describedby",
        joinIdReferences(
          [...(previousDescriptions?.split(/\s+/u) ?? []), props.id].filter(
            (id, index, ids) => id.length > 0 && ids.indexOf(id) === index,
          ),
        ) ?? props.id,
      );
    }
    return () => {
      clearPresentationTimers();
      clearTimer(pointerFocusTimer);
      trigger.removeEventListener("pointerenter", onTriggerPointerEnter);
      trigger.removeEventListener("pointerleave", onTriggerPointerLeave);
      trigger.removeEventListener("pointerdown", onPointerDown);
      trigger.removeEventListener("focus", onFocus);
      trigger.removeEventListener("blur", onBlur);
      tooltip?.removeEventListener("pointerenter", onTooltipPointerEnter);
      tooltip?.removeEventListener("pointerleave", onTooltipPointerLeave);
      if (previousDescriptions === null) {
        trigger.removeAttribute("aria-describedby");
      } else {
        trigger.setAttribute("aria-describedby", previousDescriptions);
      }
    };
  }, [leaseReady, props.id, props.open, trigger]);

  return props.open && leaseReady ? (
    <div class="ui-tooltip" id={props.id} ref={surface} role="tooltip">
      {props.text}
    </div>
  ) : null;
}
