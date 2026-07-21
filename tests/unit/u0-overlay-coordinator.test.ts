import { describe, expect, test } from "bun:test";

import {
  DocumentOverlayCoordinator,
  OverlayCoordinatorKernel,
  type OverlayCoordinatorRegistration,
  type OverlaySurfaceRequest,
} from "../../src/ui/overlays/focus-dismiss";
import type {
  UiOverlayDescriptor,
  UiOverlayMode,
} from "../../src/ui/ui-contract";

function descriptor(
  id: string,
  mode: UiOverlayMode,
  kind: UiOverlayDescriptor["kind"] = mode === "modal" ? "dialog" : "sheet",
): UiOverlayDescriptor {
  return {
    descriptionId: null,
    dismissibility: { kind: "dismissible" },
    id,
    initialFocusId: null,
    kind,
    mode,
    ownerId: `${id}-owner`,
    requestRevision: 0,
    restoreFocusId: `${id}-trigger`,
    titleId: null,
    triggerId: `${id}-trigger`,
  };
}

function registration(
  id: string,
  mode: UiOverlayMode,
  parentId: string | null,
  transient: OverlayCoordinatorRegistration["transient"] = null,
  kind?: UiOverlayDescriptor["kind"],
): OverlayCoordinatorRegistration {
  return {
    backgroundRootId: "application-background",
    descriptor: descriptor(id, mode, kind),
    parentId,
    transient,
  };
}

function requireAcquired(
  result: ReturnType<OverlayCoordinatorKernel["acquire"]>,
) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected coordinator acquisition");
  return result;
}

class ListenerDocument {
  readonly defaultView: (Window & typeof globalThis) | null;
  readonly documentElement = {} as HTMLElement;
  readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(defaultView: (Window & typeof globalThis) | null = null) {
    this.defaultView = defaultView;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener !== "function") return;
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): void {
    if (typeof listener === "function") this.listeners.get(type)?.delete(listener);
  }
}

function surfaceRequest(
  id: string,
  mode: UiOverlayMode,
  trigger: HTMLElement,
  getSurface: () => HTMLElement | null,
  onDismiss: OverlaySurfaceRequest["onDismiss"],
  overrides: Partial<OverlaySurfaceRequest> = {},
): OverlaySurfaceRequest {
  return {
    backgroundRootId: "application-background",
    descriptor: descriptor(
      id,
      mode,
      mode === "modal" ? "dialog" : "popover",
    ),
    getSurface,
    isDismissible: () => true,
    onDismiss,
    outsidePointerDismisses: true,
    transient: mode === "modal" ? null : "other",
    trigger,
    ...overrides,
  };
}

describe("U0 document overlay coordinator kernel", () => {
  test("publishes one validated modal root and refuses a second root", () => {
    const coordinator = new OverlayCoordinatorKernel();
    const root = requireAcquired(
      coordinator.acquire(registration("dialog", "modal", null)),
    );
    expect(root.state.root?.id).toBe("dialog");
    expect(root.state.modalScopeDepth).toBe(1);

    const second = coordinator.acquire(
      registration("second-dialog", "modal", null),
    );
    expect(second.ok).toBe(false);
    if (!second.ok && second.kind === "refused") {
      expect(second.diagnostic.code).toBe("ui.modal_scope_limit");
    }
    expect(coordinator.snapshot()).toEqual(root.state);
  });

  test("accepts four nonmodal descendants and atomically refuses the fifth", () => {
    const coordinator = new OverlayCoordinatorKernel();
    requireAcquired(coordinator.acquire(registration("root", "modal", null)));
    for (let index = 1; index <= 4; index += 1) {
      requireAcquired(
        coordinator.acquire(
          registration(`sheet-${String(index)}`, "nonmodal", "root"),
        ),
      );
    }
    const before = coordinator.snapshot();
    expect(before.descendantNonmodalIds).toHaveLength(4);

    const excess = coordinator.acquire(
      registration("sheet-5", "nonmodal", "root"),
    );
    expect(excess.ok).toBe(false);
    if (!excess.ok && excess.kind === "refused") {
      expect(excess.diagnostic.code).toBe("ui.collection_limit");
    }
    expect(coordinator.snapshot()).toEqual(before);
  });

  test("keeps private state identities disjoint from valid caller identities", () => {
    const coordinator = new OverlayCoordinatorKernel();
    requireAcquired(coordinator.acquire(registration("dialog", "modal", null)));
    const child = requireAcquired(
      coordinator.acquire(
        registration(
          "overlay-dismiss-owner-0",
          "nonmodal",
          "dialog",
          "other",
          "popover",
        ),
      ),
    );
    expect(child.state.descendantNonmodalIds).toEqual([
      "overlay-dismiss-owner-0",
    ]);
    expect(child.state.dismissAncestorIds).not.toContain(
      "overlay-dismiss-owner-0",
    );
  });

  test("suppresses tooltips and token-safely replaces one transient", () => {
    const coordinator = new OverlayCoordinatorKernel();
    requireAcquired(coordinator.acquire(registration("dialog", "modal", null)));
    const menu = requireAcquired(
      coordinator.acquire(
        registration("menu", "nonmodal", "dialog", "other", "menu"),
      ),
    );

    const tooltip = coordinator.acquire(
      registration("tooltip", "nonmodal", "dialog", "tooltip", "tooltip"),
    );
    expect(tooltip).toEqual({ kind: "suppressed", ok: false });

    const popover = requireAcquired(
      coordinator.acquire(
        registration("popover", "nonmodal", "dialog", "other", "popover"),
      ),
    );
    expect(popover.replacedTokens).toEqual([menu.token]);
    expect(popover.state.descendantNonmodalIds).toEqual(["popover"]);
    expect(popover.state.activeTransientId).not.toBeNull();

    const staleRelease = coordinator.release(menu.token);
    expect(staleRelease.releasedTokens).toEqual([]);
    expect(staleRelease.state).toEqual(popover.state);
  });

  test("tracks the topmost descendant and retires an owned subtree once", () => {
    const coordinator = new OverlayCoordinatorKernel();
    const root = requireAcquired(
      coordinator.acquire(registration("root-sheet", "nonmodal", null)),
    );
    const child = requireAcquired(
      coordinator.acquire(
        registration("child-sheet", "nonmodal", "root-sheet"),
      ),
    );
    const popover = requireAcquired(
      coordinator.acquire(
        registration(
          "nested-popover",
          "nonmodal",
          "child-sheet",
          "other",
          "popover",
        ),
      ),
    );
    expect(coordinator.topToken()).toBe(popover.token);
    expect(popover.state.dismissAncestorIds).toHaveLength(2);

    const released = coordinator.release(child.token);
    expect(new Set(released.releasedTokens)).toEqual(
      new Set([child.token, popover.token]),
    );
    expect(released.state.descendantNonmodalIds).toEqual([]);
    expect(coordinator.topToken()).toBe(root.token);

    coordinator.release(root.token);
    expect(coordinator.snapshot().root).toBeNull();
    expect(coordinator.topToken()).toBeNull();
  });

  test("routes Escape only to the topmost explicit owner and removes listeners", () => {
    const documentDouble = new ListenerDocument();
    const ownerDocument = documentDouble as unknown as Document;
    const childTrigger = {} as HTMLElement;
    const rootTrigger = {} as HTMLElement;
    const rootSurface = {
      contains: (candidate: Node) => candidate === (childTrigger as unknown as Node),
    } as unknown as HTMLElement;
    const childSurface = { contains: () => false } as unknown as HTMLElement;
    const dismissals: string[] = [];
    let childDismissible = false;
    const coordinator = new DocumentOverlayCoordinator(ownerDocument);
    const root = coordinator.acquire(
      surfaceRequest("dialog", "modal", rootTrigger, () => rootSurface, (reason) => {
        dismissals.push(`dialog:${reason}`);
      }),
    );
    expect(root.ok).toBe(true);
    const child = coordinator.acquire(
      surfaceRequest(
        "popover",
        "nonmodal",
        childTrigger,
        () => childSurface,
        (reason) => {
          dismissals.push(`popover:${reason}`);
        },
        { isDismissible: () => childDismissible },
      ),
    );
    expect(child.ok).toBe(true);
    expect(documentDouble.listenerCount("keydown")).toBe(1);
    expect(documentDouble.listenerCount("pointerdown")).toBe(1);

    let prevented = 0;
    let stopped = 0;
    const escape = {
      key: "Escape",
      preventDefault: () => {
        prevented += 1;
      },
      stopImmediatePropagation: () => {
        stopped += 1;
      },
    } as unknown as KeyboardEvent;
    documentDouble.dispatch("keydown", escape);
    expect(dismissals).toEqual([]);
    childDismissible = true;
    documentDouble.dispatch("keydown", escape);
    documentDouble.dispatch("keydown", escape);
    expect(dismissals).toEqual(["popover:escape"]);
    expect(prevented).toBe(3);
    expect(stopped).toBe(3);

    if (!child.ok || !root.ok) throw new Error("expected runtime leases");
    child.lease.release();
    documentDouble.dispatch("keydown", escape);
    expect(dismissals).toEqual(["popover:escape", "dialog:escape"]);
    root.lease.release();
    expect(documentDouble.listenerCount("keydown")).toBe(0);
    expect(documentDouble.listenerCount("pointerdown")).toBe(0);
  });

  test("replaces one transient callback once and ignores its stale lease", () => {
    const documentDouble = new ListenerDocument();
    const ownerDocument = documentDouble as unknown as Document;
    const dismissals: string[] = [];
    const coordinator = new DocumentOverlayCoordinator(ownerDocument);
    const first = coordinator.acquire(
      surfaceRequest(
        "first-popover",
        "nonmodal",
        {} as HTMLElement,
        () => null,
        (reason) => {
          dismissals.push(`first:${reason}`);
        },
      ),
    );
    const second = coordinator.acquire(
      surfaceRequest(
        "second-popover",
        "nonmodal",
        {} as HTMLElement,
        () => null,
        (reason) => {
          dismissals.push(`second:${reason}`);
        },
      ),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(dismissals).toEqual(["first:replaced"]);
    if (!first.ok || !second.ok) throw new Error("expected runtime leases");
    expect(first.lease.requestDismiss("cancel", "keyboard")).toBe(false);
    first.lease.release();

    let pointerPrevented = 0;
    let pointerStopped = 0;
    const pointer = {
      composedPath: () => [],
      preventDefault: () => {
        pointerPrevented += 1;
      },
      stopImmediatePropagation: () => {
        pointerStopped += 1;
      },
      target: null,
    } as unknown as PointerEvent;
    documentDouble.dispatch("pointerdown", pointer);
    expect(dismissals).toEqual([
      "first:replaced",
      "second:outside-pointer",
    ]);
    expect(pointerPrevented).toBe(1);
    expect(pointerStopped).toBe(1);
    second.lease.release();
    expect(documentDouble.listenerCount("keydown")).toBe(0);
  });

  test("retires a trigger that becomes actually unrendered exactly once", () => {
    let runResizeCheck = () => undefined;
    let disconnectedObservers = 0;
    let mutationObserverConstructed = 0;
    const resizeListeners = new Set<() => void>();
    class ResizeObserverDouble {
      constructor(callback: ResizeObserverCallback) {
        runResizeCheck = () => {
          callback([], this as unknown as ResizeObserver);
        };
      }
      disconnect(): void {
        disconnectedObservers += 1;
      }
      observe(): void {}
    }
    class MutationObserverDouble {
      constructor(callback: MutationCallback) {
        mutationObserverConstructed += 1;
        void callback;
      }
      disconnect(): void {
        disconnectedObservers += 1;
      }
      observe(): void {}
    }
    const view = {
      MutationObserver: MutationObserverDouble,
      ResizeObserver: ResizeObserverDouble,
      addEventListener: (type: string, listener: () => void) => {
        if (type === "resize") resizeListeners.add(listener);
      },
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      removeEventListener: (type: string, listener: () => void) => {
        if (type === "resize") resizeListeners.delete(listener);
      },
    } as unknown as Window & typeof globalThis;
    const documentDouble = new ListenerDocument(view);
    const ownerDocument = documentDouble as unknown as Document;
    let renderedRectCount = 1;
    const trigger = {
      closest: () => null,
      getClientRects: () => ({ length: renderedRectCount }),
      hidden: false,
      isConnected: true,
      ownerDocument,
    } as unknown as HTMLElement;
    const dismissals: string[] = [];
    const coordinator = new DocumentOverlayCoordinator(ownerDocument);
    const acquired = coordinator.acquire(
      surfaceRequest("responsive-sheet", "modal", trigger, () => null, (reason) => {
        dismissals.push(reason);
      }),
    );
    expect(acquired.ok).toBe(true);
    expect(resizeListeners.size).toBe(1);
    expect(mutationObserverConstructed).toBe(1);

    renderedRectCount = 0;
    runResizeCheck();
    runResizeCheck();
    expect(dismissals).toEqual(["stale-owner"]);

    if (!acquired.ok) throw new Error("expected runtime lease");
    acquired.lease.release();
    expect(disconnectedObservers).toBe(2);
    expect(resizeListeners.size).toBe(0);
    expect(documentDouble.listenerCount("keydown")).toBe(0);
  });
});
