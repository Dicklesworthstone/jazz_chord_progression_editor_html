import {
  UI_LIMITS,
  type UiDiagnostic,
  type UiDismissReason,
  type UiInteractionSource,
  type UiOverlayDescriptor,
  type UiOverlayLayerState,
} from "../ui-contract";
import { FocusDismissLayer } from "./FocusDismissLayer";

export type FocusCandidateResult =
  | Readonly<{ ok: true; candidates: readonly HTMLElement[] }>
  | Readonly<{ ok: false; diagnostic: UiDiagnostic }>;

export type BackgroundInertLease =
  | Readonly<{ ok: true; release: () => void }>
  | Readonly<{ ok: false; diagnostic: UiDiagnostic }>;

type InertSnapshot = Readonly<{
  element: HTMLElement;
  previousAriaHidden: string | null;
  previousInert: boolean;
  previousOwner: string | null;
}>;

export type RestoreFocusOutcome = Readonly<{
  kind: "exact" | "fallback" | "none";
}>;

export type OverlayTransientKind = "tooltip" | "other" | null;

export type OverlayCoordinatorRegistration = Readonly<{
  backgroundRootId: string;
  descriptor: UiOverlayDescriptor;
  parentId: string | null;
  transient: OverlayTransientKind;
}>;

type OverlayCoordinatorEntry = Readonly<{
  backgroundRootId: string;
  descriptor: UiOverlayDescriptor;
  parentId: string | null;
  token: object;
  transient: OverlayTransientKind;
}>;

export type OverlayCoordinatorAcquireResult =
  | Readonly<{
      ok: true;
      replacedTokens: readonly object[];
      retiredTokens: readonly object[];
      state: UiOverlayLayerState;
      token: object;
    }>
  | Readonly<{ ok: false; kind: "suppressed" }>
  | Readonly<{
      ok: false;
      kind: "refused";
      diagnostic: UiDiagnostic;
    }>;

export type OverlayCoordinatorReleaseResult = Readonly<{
  releasedTokens: readonly object[];
  state: UiOverlayLayerState;
}>;

const EMPTY_OVERLAY_STATE: UiOverlayLayerState = Object.freeze({
  activeTransientId: null,
  descendantNonmodalIds: Object.freeze([]),
  dismissAncestorIds: Object.freeze([]),
  modalScopeDepth: 0,
  root: null,
});

function coordinatorRefusal(
  descriptor: UiOverlayDescriptor,
  code: UiDiagnostic["code"],
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
): OverlayCoordinatorAcquireResult {
  return {
    diagnostic: overlayDiagnostic(
      code,
      descriptor.id,
      path,
      message,
      recoveryAction,
    ),
    kind: "refused",
    ok: false,
  };
}

/**
 * Deterministic state authority for one overlay root. It contains no DOM
 * behavior; the document adapter below supplies explicit ownership and event
 * routing. Every accepted transition passes through the public U0 kernel
 * before this state is published.
 */
export class OverlayCoordinatorKernel {
  readonly #entries: OverlayCoordinatorEntry[] = [];
  #state: UiOverlayLayerState = EMPTY_OVERLAY_STATE;

  snapshot(): UiOverlayLayerState {
    return this.#state;
  }

  topToken(): object | null {
    return this.#entries.at(-1)?.token ?? null;
  }

  acquire(
    registration: OverlayCoordinatorRegistration,
  ): OverlayCoordinatorAcquireResult {
    const candidateState: UiOverlayLayerState = {
      activeTransientId:
        registration.transient === null ? null : "overlay-transient-candidate",
      descendantNonmodalIds: [],
      dismissAncestorIds: [],
      modalScopeDepth: registration.descriptor.mode === "modal" ? 1 : 0,
      root: registration.descriptor,
    };
    const candidate = FocusDismissLayer({
      backgroundRootId: registration.backgroundRootId,
      escapePolicy: "dismiss-when-owner-allows",
      inertWhenModal: true,
      outsidePointerDismissesNonmodal: true,
      state: candidateState,
    });
    if (!candidate.ok) {
      return { diagnostic: candidate.refusal, kind: "refused", ok: false };
    }

    if (
      this.#entries.some(
        (entry) => entry.descriptor.id === registration.descriptor.id,
      )
    ) {
      return coordinatorRefusal(
        registration.descriptor,
        "ui.duplicate_item_id",
        ["overlayCoordinator", "id"],
        "An active overlay surface already owns this identity.",
        "Retire the active surface before reusing its identity.",
      );
    }

    const activeTransient = this.#entries.find(
      (entry) => entry.transient !== null,
    );
    if (registration.transient === "tooltip" && activeTransient !== undefined) {
      return { kind: "suppressed", ok: false };
    }

    let parentId = registration.parentId;
    let prospective = [...this.#entries];
    const replacedTokens: object[] = [];
    const retiredTokens: object[] = [];
    if (registration.transient === "other" && activeTransient !== undefined) {
      const replacedIds = this.#subtreeIds(activeTransient.descriptor.id);
      for (const entry of prospective) {
        if (replacedIds.has(entry.descriptor.id)) retiredTokens.push(entry.token);
      }
      replacedTokens.push(activeTransient.token);
      prospective = prospective.filter(
        (entry) => !replacedIds.has(entry.descriptor.id),
      );
      if (parentId !== null && replacedIds.has(parentId)) {
        parentId = activeTransient.parentId;
      }
    }

    if (prospective.length === 0) {
      if (parentId !== null) {
        return coordinatorRefusal(
          registration.descriptor,
          "ui.stale_owner",
          ["overlayCoordinator", "parentId"],
          "The declared overlay owner is no longer active.",
          "Open the surface from a currently registered owner.",
        );
      }
    } else {
      if (registration.descriptor.mode === "modal") {
        return coordinatorRefusal(
          registration.descriptor,
          "ui.modal_scope_limit",
          ["overlayCoordinator", "mode"],
          "A modal surface cannot be nested beneath the active overlay root.",
          "Close the active root before opening another modal surface.",
        );
      }
      if (
        parentId === null ||
        !prospective.some((entry) => entry.descriptor.id === parentId)
      ) {
        return coordinatorRefusal(
          registration.descriptor,
          "ui.stale_owner",
          ["overlayCoordinator", "parentId"],
          "A second overlay root cannot be published beside the active root.",
          "Open the surface from a registered owner or retire the active root.",
        );
      }
      if (prospective.length > UI_LIMITS.maxNonmodalSurfaces) {
        return coordinatorRefusal(
          registration.descriptor,
          "ui.collection_limit",
          ["overlayCoordinator", "descendantNonmodalIds"],
          "The overlay root already owns the maximum nonmodal descendants.",
          "Retire a descendant surface before opening another.",
        );
      }
      const ancestorDepth = this.#ancestorDepth(parentId, prospective);
      if (ancestorDepth === null || ancestorDepth > UI_LIMITS.maxDismissAncestors) {
        return coordinatorRefusal(
          registration.descriptor,
          "ui.dismiss_depth_limit",
          ["overlayCoordinator", "parentId"],
          "The overlay dismissal-owner ancestry exceeds its reviewed bound.",
          "Flatten the explicit overlay ownership chain.",
        );
      }
    }

    const entry: OverlayCoordinatorEntry = {
      backgroundRootId: registration.backgroundRootId,
      descriptor: registration.descriptor,
      parentId,
      token: {},
      transient: registration.transient,
    };
    const nextEntries = [...prospective, entry];
    const nextState = this.#stateFor(nextEntries);
    const validated = FocusDismissLayer({
      backgroundRootId:
        nextEntries[0]?.backgroundRootId ?? "ui-overlay-background",
      escapePolicy: "dismiss-when-owner-allows",
      inertWhenModal: true,
      outsidePointerDismissesNonmodal: true,
      state: nextState,
    });
    if (!validated.ok) {
      return { diagnostic: validated.refusal, kind: "refused", ok: false };
    }

    this.#entries.splice(0, this.#entries.length, ...nextEntries);
    this.#state = validated.value;
    return {
      ok: true,
      replacedTokens,
      retiredTokens,
      state: this.#state,
      token: entry.token,
    };
  }

  release(token: object): OverlayCoordinatorReleaseResult {
    const entry = this.#entries.find((candidate) => candidate.token === token);
    if (entry === undefined) {
      return { releasedTokens: [], state: this.#state };
    }
    const releasedIds = this.#subtreeIds(entry.descriptor.id);
    const releasedTokens = this.#entries
      .filter((candidate) => releasedIds.has(candidate.descriptor.id))
      .map((candidate) => candidate.token);
    const nextEntries = this.#entries.filter(
      (candidate) => !releasedIds.has(candidate.descriptor.id),
    );
    const nextState = this.#stateFor(nextEntries);
    const validated = FocusDismissLayer({
      backgroundRootId:
        nextEntries[0]?.backgroundRootId ?? "ui-overlay-background",
      escapePolicy: "dismiss-when-owner-allows",
      inertWhenModal: true,
      outsidePointerDismissesNonmodal: true,
      state: nextState,
    });
    if (!validated.ok) {
      return { releasedTokens: [], state: this.#state };
    }
    this.#entries.splice(0, this.#entries.length, ...nextEntries);
    this.#state = validated.value;
    return { releasedTokens, state: this.#state };
  }

  #ancestorDepth(
    parentId: string,
    entries: readonly OverlayCoordinatorEntry[],
  ): number | null {
    let depth = 0;
    let currentId: string | null = parentId;
    const seen = new Set<string>();
    while (currentId !== null) {
      if (seen.has(currentId)) return null;
      seen.add(currentId);
      const current = entries.find((entry) => entry.descriptor.id === currentId);
      if (current === undefined) return null;
      depth += 1;
      currentId = current.parentId;
    }
    return depth;
  }

  #allocateStateId(prefix: string, occupied: ReadonlySet<string>): string {
    let suffix = 0;
    while (occupied.has(`${prefix}-${String(suffix)}`)) suffix += 1;
    return `${prefix}-${String(suffix)}`;
  }

  #stateFor(entries: readonly OverlayCoordinatorEntry[]): UiOverlayLayerState {
    const root = entries[0];
    if (root === undefined) return EMPTY_OVERLAY_STATE;
    const transient = entries.find((entry) => entry.transient !== null);
    const occupiedStateIds = new Set(entries.map((entry) => entry.descriptor.id));
    const dismissOwnerStateIds = new Map<object, string>();
    for (const entry of entries) {
      const stateId = this.#allocateStateId(
        "overlay-dismiss-owner",
        occupiedStateIds,
      );
      occupiedStateIds.add(stateId);
      dismissOwnerStateIds.set(entry.token, stateId);
    }
    const transientStateId =
      transient === undefined
        ? null
        : this.#allocateStateId("overlay-transient", occupiedStateIds);
    const top = entries.at(-1);
    const ancestors: OverlayCoordinatorEntry[] = [];
    let parentId = top?.parentId ?? null;
    while (parentId !== null) {
      const parent = entries.find((entry) => entry.descriptor.id === parentId);
      if (parent === undefined) break;
      ancestors.unshift(parent);
      parentId = parent.parentId;
    }
    return {
      activeTransientId: transientStateId,
      descendantNonmodalIds: entries.slice(1).map((entry) => entry.descriptor.id),
      dismissAncestorIds: ancestors.map((entry) => {
        const stateId = dismissOwnerStateIds.get(entry.token);
        if (stateId === undefined) {
          throw new Error("Overlay coordinator owner identity is unavailable.");
        }
        return stateId;
      }),
      modalScopeDepth: root.descriptor.mode === "modal" ? 1 : 0,
      root: root.descriptor,
    };
  }

  #subtreeIds(rootId: string): ReadonlySet<string> {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const entry of this.#entries) {
        if (
          entry.parentId !== null &&
          ids.has(entry.parentId) &&
          !ids.has(entry.descriptor.id)
        ) {
          ids.add(entry.descriptor.id);
          changed = true;
        }
      }
    }
    return ids;
  }
}

export type OverlaySurfaceLease = Readonly<{
  release: () => void;
  requestDismiss: (
    reason: UiDismissReason,
    source: UiInteractionSource,
  ) => boolean;
}>;

export type OverlaySurfaceAcquireResult =
  | Readonly<{ ok: true; lease: OverlaySurfaceLease }>
  | Readonly<{ ok: false; kind: "suppressed" }>
  | Readonly<{
      ok: false;
      kind: "refused";
      diagnostic: UiDiagnostic;
    }>;

export type OverlaySurfaceRequest = Readonly<{
  backgroundRootId: string;
  descriptor: UiOverlayDescriptor;
  getSurface: () => HTMLElement | null;
  isDismissible: () => boolean;
  onDismiss: (
    reason: UiDismissReason,
    source: UiInteractionSource,
  ) => void;
  outsidePointerDismisses: boolean;
  transient: OverlayTransientKind;
  trigger: HTMLElement;
}>;

type RuntimeOverlayRecord = Readonly<{
  descriptor: UiOverlayDescriptor;
  getSurface: () => HTMLElement | null;
  isDismissible: () => boolean;
  onDismiss: OverlaySurfaceRequest["onDismiss"];
  outsidePointerDismisses: boolean;
  token: object;
  trigger: HTMLElement;
}> & {
  dismissRequested: boolean;
  stopObserving: () => void;
};

function overlayOwnerIsRendered(owner: HTMLElement): boolean {
  if (!owner.isConnected || owner.hidden || owner.closest("[hidden]") !== null) {
    return false;
  }
  const view = owner.ownerDocument.defaultView;
  if (view !== null) {
    const style = view.getComputedStyle(owner);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return false;
    }
    if (owner.getClientRects().length === 0) return false;
  }
  return true;
}

export class DocumentOverlayCoordinator {
  readonly #document: Document;
  readonly #kernel = new OverlayCoordinatorKernel();
  readonly #records = new Map<object, RuntimeOverlayRecord>();
  #listening = false;

  constructor(ownerDocument: Document) {
    this.#document = ownerDocument;
  }

  acquire(request: OverlaySurfaceRequest): OverlaySurfaceAcquireResult {
    const parent = this.#findExplicitOwner(request.trigger);
    const acquired = this.#kernel.acquire({
      backgroundRootId: request.backgroundRootId,
      descriptor: request.descriptor,
      parentId: parent?.descriptor.id ?? null,
      transient: request.transient,
    });
    if (!acquired.ok) return acquired;

    const replaced: RuntimeOverlayRecord[] = [];
    const replacedTokenSet = new Set(acquired.replacedTokens);
    for (const token of acquired.retiredTokens) {
      const record = this.#records.get(token);
      if (record === undefined) continue;
      this.#records.delete(token);
      record.stopObserving();
      if (replacedTokenSet.has(token)) replaced.push(record);
    }
    const record: RuntimeOverlayRecord = {
      descriptor: request.descriptor,
      dismissRequested: false,
      getSurface: request.getSurface,
      isDismissible: request.isDismissible,
      onDismiss: request.onDismiss,
      outsidePointerDismisses: request.outsidePointerDismisses,
      stopObserving: () => undefined,
      token: acquired.token,
      trigger: request.trigger,
    };
    this.#records.set(acquired.token, record);
    record.stopObserving = this.#observeOwner(record);
    this.#startListening();

    for (const replacedRecord of replaced) {
      this.#requestDismiss(replacedRecord, "replaced", "programmatic", true);
    }

    let released = false;
    return {
      lease: {
        release: () => {
          if (released) return;
          released = true;
          const outcome = this.#kernel.release(acquired.token);
          for (const token of outcome.releasedTokens) {
            const releasedRecord = this.#records.get(token);
            this.#records.delete(token);
            releasedRecord?.stopObserving();
          }
          this.#stopListeningWhenIdle();
        },
        requestDismiss: (reason, source) =>
          this.#requestDismiss(record, reason, source, false),
      },
      ok: true,
    };
  }

  #eventIsWithin(record: RuntimeOverlayRecord, event: Event): boolean {
    const surface = record.getSurface();
    const boundaries = [surface, record.trigger].filter(
      (element): element is HTMLElement => element !== null,
    );
    const path = event.composedPath();
    if (path.length > UI_LIMITS.maxFocusCandidates) return true;
    for (const target of path) {
      if (!this.#isDocumentNode(target)) continue;
      if (
        boundaries.some(
          (boundary) => boundary === target || boundary.contains(target),
        )
      ) {
        return true;
      }
    }
    const target = event.target;
    return (
      this.#isDocumentNode(target) &&
      boundaries.some(
        (boundary) => boundary === target || boundary.contains(target),
      )
    );
  }

  #isDocumentNode(value: EventTarget | null | undefined): value is Node {
    const NodeConstructor = this.#document.defaultView?.Node;
    return NodeConstructor !== undefined && value instanceof NodeConstructor;
  }

  #findExplicitOwner(trigger: HTMLElement): RuntimeOverlayRecord | null {
    const records = [...this.#records.values()];
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (record === undefined) continue;
      const surface = record.getSurface();
      if (surface !== null && surface.contains(trigger)) {
        return record;
      }
    }
    return null;
  }

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    const record = this.#topRecord();
    if (record === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#requestDismiss(record, "escape", "keyboard", false);
  };

  #onPointerDown = (event: PointerEvent): void => {
    const record = this.#topRecord();
    if (
      record === null ||
      this.#eventIsWithin(record, event) ||
      !record.outsidePointerDismisses
    ) {
      return;
    }
    if (!record.isDismissible()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // Consume the initiating gesture before controlled unmount restores focus.
    // Otherwise the browser's pointer default can run against the disappearing
    // backdrop and overwrite the exact trigger restoration.
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#requestDismiss(record, "outside-pointer", "pointer", false);
  };

  #observeOwner(record: RuntimeOverlayRecord): () => void {
    const view = this.#document.defaultView;
    if (view === null) return () => undefined;
    const verify = () => {
      if (this.#records.get(record.token) !== record) return;
      if (!overlayOwnerIsRendered(record.trigger)) {
        this.#requestDismiss(record, "stale-owner", "programmatic", true);
      }
    };
    const resizeObserver = new view.ResizeObserver(verify);
    resizeObserver.observe(record.trigger);
    const mutationObserver = new view.MutationObserver(verify);
    mutationObserver.observe(this.#document.documentElement, {
      attributeFilter: ["class", "hidden", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    view.addEventListener("resize", verify, { passive: true });
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      view.removeEventListener("resize", verify);
    };
  }

  #requestDismiss(
    record: RuntimeOverlayRecord,
    reason: UiDismissReason,
    source: UiInteractionSource,
    force: boolean,
  ): boolean {
    if (
      record.dismissRequested ||
      (!force && this.#records.get(record.token) !== record) ||
      (!force && !record.isDismissible())
    ) {
      return false;
    }
    record.dismissRequested = true;
    record.onDismiss(reason, source);
    return true;
  }

  #startListening(): void {
    if (this.#listening) return;
    this.#listening = true;
    this.#document.addEventListener("keydown", this.#onKeyDown, true);
    this.#document.addEventListener("pointerdown", this.#onPointerDown, true);
  }

  #stopListeningWhenIdle(): void {
    if (!this.#listening || this.#records.size !== 0) return;
    this.#listening = false;
    this.#document.removeEventListener("keydown", this.#onKeyDown, true);
    this.#document.removeEventListener("pointerdown", this.#onPointerDown, true);
  }

  #topRecord(): RuntimeOverlayRecord | null {
    const token = this.#kernel.topToken();
    return token === null ? null : (this.#records.get(token) ?? null);
  }
}

const documentOverlayCoordinators = new WeakMap<
  Document,
  DocumentOverlayCoordinator
>();

export function acquireOverlaySurface(
  ownerDocument: Document,
  request: OverlaySurfaceRequest,
): OverlaySurfaceAcquireResult {
  let coordinator = documentOverlayCoordinators.get(ownerDocument);
  if (coordinator === undefined) {
    coordinator = new DocumentOverlayCoordinator(ownerDocument);
    documentOverlayCoordinators.set(ownerDocument, coordinator);
  }
  return coordinator.acquire(request);
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(",");

export function overlayDiagnostic(
  code: UiDiagnostic["code"],
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string | null,
): UiDiagnostic {
  return {
    code,
    componentId,
    message,
    path,
    recoveryAction,
    severity: "error",
  };
}

function isUnavailable(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden) {
    return true;
  }
  if (element.closest("[hidden], [inert], [aria-hidden='true']") !== null) {
    return true;
  }
  if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") {
    return true;
  }

  const view = element.ownerDocument.defaultView;
  if (view !== null) {
    const style = view.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }
  }
  return false;
}

export function isFocusableRestoreTarget(element: HTMLElement): boolean {
  return element.matches(FOCUSABLE_SELECTOR) && !isUnavailable(element);
}

export function focusCandidatesWithin(
  surface: HTMLElement,
  componentId: string,
): FocusCandidateResult {
  const matches = Array.from(
    surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  if (matches.length > UI_LIMITS.maxFocusCandidates) {
    return {
      diagnostic: overlayDiagnostic(
        "ui.focus_candidate_limit",
        componentId,
        ["content", "focusCandidates"],
        "The surface exceeds the reviewed focus-candidate bound.",
        "Reduce the number of controls presented in one sheet.",
      ),
      ok: false,
    };
  }

  const candidates: HTMLElement[] = [];
  for (const element of matches) {
    if (element.tabIndex > 0) {
      return {
        diagnostic: overlayDiagnostic(
          "ui.value_malformed",
          componentId,
          ["content", "tabIndex"],
          "Positive tabindex is not permitted in a sheet.",
          "Use source order and tabindex zero or minus one.",
        ),
        ok: false,
      };
    }
    if (element.tabIndex >= 0 && !isUnavailable(element)) {
      candidates.push(element);
    }
  }
  return { candidates, ok: true };
}

export function makeBackgroundInert(
  background: HTMLElement,
  surface: HTMLElement,
  ownerId: string,
): BackgroundInertLease {
  if (background.contains(surface)) {
    return {
      diagnostic: overlayDiagnostic(
        "ui.value_malformed",
        ownerId,
        ["backgroundRootId"],
        "The modal surface cannot be a descendant of its inert background root.",
        "Render the dialog host beside the application background root.",
      ),
      ok: false,
    };
  }

  return makeElementsInert([background], ownerId);
}

function makeElementsInert(
  elements: readonly HTMLElement[],
  ownerId: string,
): BackgroundInertLease {
  const snapshots: InertSnapshot[] = elements.map((element) => ({
    element,
    previousAriaHidden: element.getAttribute("aria-hidden"),
    previousInert: element.inert,
    previousOwner: element.getAttribute("data-ui-inert-owner"),
  }));

  for (const snapshot of snapshots) {
    snapshot.element.inert = true;
    snapshot.element.setAttribute("aria-hidden", "true");
    snapshot.element.setAttribute("data-ui-inert-owner", ownerId);
  }

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      for (let index = snapshots.length - 1; index >= 0; index -= 1) {
        const snapshot = snapshots[index];
        if (
          snapshot === undefined ||
          snapshot.element.getAttribute("data-ui-inert-owner") !== ownerId
        ) {
          continue;
        }
        snapshot.element.inert = snapshot.previousInert;
        if (snapshot.previousAriaHidden === null) {
          snapshot.element.removeAttribute("aria-hidden");
        } else {
          snapshot.element.setAttribute(
            "aria-hidden",
            snapshot.previousAriaHidden,
          );
        }
        if (snapshot.previousOwner === null) {
          snapshot.element.removeAttribute("data-ui-inert-owner");
        } else {
          snapshot.element.setAttribute(
            "data-ui-inert-owner",
            snapshot.previousOwner,
          );
        }
      }
    },
  };
}

/**
 * Makes every HTMLElement outside a modal interaction root inert. The focus
 * surface remains the semantic and focus-containment boundary, while a
 * generated interaction root may also contain a non-focusable backdrop. The
 * target walk is completed and bounded before the first DOM mutation, so a
 * malformed or unexpectedly broad host refuses atomically.
 */
export function makeDocumentOutsideSurfaceInert(
  surface: HTMLElement,
  ownerId: string,
  interactionRoot: HTMLElement = surface,
): BackgroundInertLease {
  const ownerDocument = surface.ownerDocument;
  const body = ownerDocument.body;
  if (!surface.isConnected || !body.contains(surface)) {
    return {
      diagnostic: overlayDiagnostic(
        "ui.focus_target_missing",
        ownerId,
        ["content", "surface"],
        "The modal surface is not connected beneath the document body.",
        "Render the modal surface in the document-owned overlay host.",
      ),
      ok: false,
    };
  }
  if (
    interactionRoot.ownerDocument !== ownerDocument ||
    !interactionRoot.isConnected ||
    !body.contains(interactionRoot) ||
    !interactionRoot.contains(surface)
  ) {
    return {
      diagnostic: overlayDiagnostic(
        "ui.focus_target_missing",
        ownerId,
        ["content", "interactionRoot"],
        "The modal interaction root does not contain the connected focus surface.",
        "Render the focus surface and its backdrop inside one document-owned modal layer.",
      ),
      ok: false,
    };
  }

  const targets: HTMLElement[] = [];
  let inspectedNodes = 0;
  let current: HTMLElement = interactionRoot;
  while (current !== body) {
    inspectedNodes += 1;
    if (inspectedNodes > UI_LIMITS.maxFocusCandidates) {
      return {
        diagnostic: overlayDiagnostic(
          "ui.collection_limit",
          ownerId,
          ["content", "outsideSurfaceNodes"],
          "The modal host exceeds the reviewed outside-surface traversal bound.",
          "Reduce the overlay host to at most 4,096 bounded DOM steps.",
        ),
        ok: false,
      };
    }
    const parent = current.parentElement;
    if (parent === null) {
      return {
        diagnostic: overlayDiagnostic(
          "ui.focus_target_missing",
          ownerId,
          ["content", "surface"],
          "The modal surface has no complete ancestor path to the document body.",
          "Render the modal surface in the document-owned overlay host.",
        ),
        ok: false,
      };
    }
    for (const sibling of parent.children) {
      if (sibling === current) continue;
      inspectedNodes += 1;
      if (inspectedNodes > UI_LIMITS.maxFocusCandidates) {
        return {
          diagnostic: overlayDiagnostic(
            "ui.collection_limit",
            ownerId,
            ["content", "outsideSurfaceNodes"],
            "The modal host exceeds the reviewed outside-surface traversal bound.",
            "Reduce the overlay host to at most 4,096 bounded DOM steps.",
          ),
          ok: false,
        };
      }
      if (sibling instanceof HTMLElement) targets.push(sibling);
    }
    current = parent;
  }

  return makeElementsInert(targets, ownerId);
}

export function restoreFocus(
  ownerDocument: Document,
  targetIds: readonly string[],
): RestoreFocusOutcome {
  for (const [index, id] of targetIds.entries()) {
    const target = ownerDocument.getElementById(id);
    if (target instanceof HTMLElement && isFocusableRestoreTarget(target)) {
      target.focus();
      if (ownerDocument.activeElement === target) {
        return { kind: index === 0 ? "exact" : "fallback" };
      }
    }
  }
  return { kind: "none" };
}
