import { describe, expect, test } from "bun:test";

import {
  AlertDialog,
  Dialog,
  type AlertDialogProps,
  type DialogProps,
} from "../../src/ui/overlays/Dialog";
import { FocusDismissLayer } from "../../src/ui/overlays/FocusDismissLayer";
import { Popover, type PopoverProps } from "../../src/ui/overlays/Popover";
import {
  SheetDrawer,
  type SheetDrawerProps,
} from "../../src/ui/overlays/SheetDrawer";
import { ToastNotice } from "../../src/ui/overlays/ToastNotice";
import { Tooltip } from "../../src/ui/overlays/Tooltip";
import type {
  UiFocusDismissLayerProps,
  UiToastNoticeProps,
  UiTooltipProps,
} from "../../src/ui/ui-contract";
import { UiContractError } from "../../src/ui/primitives/validation";

function captureContractError(action: () => void): UiContractError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(UiContractError);
    if (error instanceof UiContractError) return error;
    throw error;
  }
  throw new Error("Expected a synchronous U0 overlay refusal.");
}

function tooltipProps(
  overrides: Partial<UiTooltipProps> = {},
): UiTooltipProps {
  return {
    id: "tooltip-surface",
    onOpenChange: () => undefined,
    open: false,
    text: "Tooltip description",
    triggerId: "tooltip-trigger",
    ...overrides,
  };
}

function popoverProps(overrides: Partial<PopoverProps> = {}): PopoverProps {
  return {
    accessibleName: "Popover",
    busy: false,
    content: null,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    id: "popover-surface",
    invalid: false,
    onOpenChange: () => undefined,
    open: false,
    triggerId: "popover-trigger",
    ...overrides,
  };
}

function dialogProps(overrides: Partial<DialogProps> = {}): DialogProps {
  return {
    backgroundRootId: "application-background",
    busy: false,
    closeLabel: "Close dialog",
    content: null,
    density: "comfortable",
    describedBy: [],
    description: "Dialog description",
    disabled: false,
    dismissibility: { kind: "dismissible" },
    focusTargets: {
      triggerId: "dialog-trigger",
      workflowTargetId: null,
      workspaceId: "workspace",
    },
    id: "dialog-surface",
    initialFocus: "heading",
    initialFocusId: null,
    invalid: false,
    onContractRefusal: () => undefined,
    onDismiss: () => undefined,
    open: false,
    title: "Dialog title",
    ...overrides,
  };
}

function alertDialogProps(
  overrides: Partial<AlertDialogProps> = {},
): AlertDialogProps {
  return {
    ...dialogProps(),
    confirmActionId: "confirm-action",
    description: "Alert dialog description",
    leastDestructiveActionId: "cancel-action",
    ...overrides,
  };
}

function sheetDrawerProps(
  overrides: Partial<SheetDrawerProps> = {},
): SheetDrawerProps {
  return {
    backgroundRootId: "application-background",
    busy: false,
    closeLabel: "Close sheet",
    content: null,
    contextRevealCssPx: 48,
    density: "comfortable",
    describedBy: [],
    description: "Sheet description",
    disabled: false,
    dismissibility: { kind: "dismissible" },
    focusTargets: {
      triggerId: "sheet-trigger",
      workflowTargetId: null,
      workspaceId: "workspace",
    },
    id: "sheet-surface",
    initialFocus: "heading",
    initialFocusId: null,
    invalid: false,
    mode: "nonmodal",
    onContractRefusal: () => undefined,
    onDismiss: () => undefined,
    open: false,
    side: "inline-end",
    title: "Sheet title",
    ...overrides,
  };
}

function toastProps(
  overrides: Partial<UiToastNoticeProps> = {},
): UiToastNoticeProps {
  return {
    hiddenNoticeCount: 0,
    notices: [],
    onDismiss: () => undefined,
    onOpenNoticeCenter: () => undefined,
    ...overrides,
  };
}

function layerProps(): UiFocusDismissLayerProps {
  return {
    backgroundRootId: "application-background",
    escapePolicy: "dismiss-when-owner-allows",
    inertWhenModal: true,
    outsidePointerDismissesNonmodal: true,
    state: {
      activeTransientId: null,
      descendantNonmodalIds: [],
      dismissAncestorIds: [],
      modalScopeDepth: 0,
      root: null,
    },
  };
}

describe("U0 overlay public-boundary preflight", () => {
  test("rejects Tooltip and Popover callbacks before trigger lookup or hooks", () => {
    const tooltipError = captureContractError(() => {
      Tooltip(tooltipProps({ onOpenChange: null as never }));
    });
    expect(tooltipError.diagnostic.path).toEqual(["onOpenChange"]);

    const popoverError = captureContractError(() => {
      Popover(popoverProps({ onOpenChange: null as never }));
    });
    expect(popoverError.diagnostic.path).toEqual(["onOpenChange"]);
  });

  test("rejects Tooltip and Popover surface-trigger identity collisions", () => {
    const tooltipError = captureContractError(() => {
      Tooltip(tooltipProps({ triggerId: "tooltip-surface" }));
    });
    expect(tooltipError.diagnostic.code).toBe("ui.duplicate_item_id");
    expect(tooltipError.diagnostic.path).toEqual(["triggerId"]);

    const popoverError = captureContractError(() => {
      Popover(popoverProps({ triggerId: "popover-surface" }));
    });
    expect(popoverError.diagnostic.code).toBe("ui.duplicate_item_id");
    expect(popoverError.diagnostic.path).toEqual(["triggerId"]);
  });

  test("rejects malformed Dialog nested records and callbacks at the wrapper", () => {
    const malformedFocus = captureContractError(() => {
      Dialog(dialogProps({ focusTargets: null as never }));
    });
    expect(malformedFocus.diagnostic.path).toEqual(["focusTargets"]);

    const malformedDismissibility = captureContractError(() => {
      Dialog(dialogProps({ dismissibility: null as never }));
    });
    expect(malformedDismissibility.diagnostic.path).toEqual([
      "dismissibility",
    ]);

    const malformedCallback = captureContractError(() => {
      Dialog(dialogProps({ onDismiss: null as never }));
    });
    expect(malformedCallback.diagnostic.path).toEqual(["onDismiss"]);
  });

  test("rejects blank visible Close labels for Dialog and SheetDrawer", () => {
    const dialogError = captureContractError(() => {
      Dialog(dialogProps({ closeLabel: " " }));
    });
    expect(dialogError.diagnostic.code).toBe("ui.description_invalid");
    expect(dialogError.diagnostic.path).toEqual(["closeLabel"]);

    const sheetError = captureContractError(() => {
      SheetDrawer(sheetDrawerProps({ closeLabel: " " }));
    });
    expect(sheetError.diagnostic.code).toBe("ui.description_invalid");
    expect(sheetError.diagnostic.path).toEqual(["closeLabel"]);
  });

  test("preflights AlertDialog action identities before composing the modal", () => {
    const malformedAction = captureContractError(() => {
      AlertDialog(
        alertDialogProps({ leastDestructiveActionId: null as never }),
      );
    });
    expect(malformedAction.diagnostic.path).toEqual([
      "leastDestructiveActionId",
    ]);
  });

  test("rejects Dialog exterior and interior identity collisions", () => {
    const exteriorCollision = captureContractError(() => {
      Dialog(dialogProps({ backgroundRootId: "dialog-surface" }));
    });
    expect(exteriorCollision.diagnostic.code).toBe("ui.duplicate_item_id");
    expect(exteriorCollision.diagnostic.path).toEqual(["focusTargets"]);

    const interiorCollision = captureContractError(() => {
      AlertDialog(
        alertDialogProps({
          confirmActionId: "dialog-trigger",
        }),
      );
    });
    expect(interiorCollision.diagnostic.code).toBe("ui.duplicate_item_id");
    expect(interiorCollision.diagnostic.path).toEqual([
      "requiredFocusIds",
      1,
    ]);
  });

  test("rejects malformed ToastNotice arrays, records, and callbacks before hooks", () => {
    const malformedCollection = captureContractError(() => {
      ToastNotice(toastProps({ notices: null as never }));
    });
    expect(malformedCollection.diagnostic.path).toEqual(["notices"]);

    const malformedRecord = captureContractError(() => {
      ToastNotice(toastProps({ notices: [null] as never }));
    });
    expect(malformedRecord.diagnostic.path).toEqual(["notices", 0]);

    const malformedCallback = captureContractError(() => {
      ToastNotice(toastProps({ onOpenNoticeCenter: null as never }));
    });
    expect(malformedCallback.diagnostic.path).toEqual([
      "onOpenNoticeCenter",
    ]);
  });

  test("returns a typed refusal for a malformed FocusDismissLayer prop record", () => {
    const missingProps = FocusDismissLayer(null as never);
    expect(missingProps.ok).toBe(false);
    expect(missingProps.ok ? null : missingProps.refusal.path).toEqual([
      "props",
    ]);

    const malformedActiveTransient = FocusDismissLayer({
      ...layerProps(),
      state: {
        ...layerProps().state,
        activeTransientId: 7 as never,
      },
    });
    expect(malformedActiveTransient.ok).toBe(false);
    expect(
      malformedActiveTransient.ok
        ? null
        : malformedActiveTransient.refusal.code,
    ).toBe("ui.value_malformed");
  });
});
