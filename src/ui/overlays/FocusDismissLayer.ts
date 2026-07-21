import {
  UI_LIMITS,
  UI_OVERLAY_KINDS,
  UI_OVERLAY_KIND_MODES,
  type UiFocusDismissLayerProps,
  type UiOverlayKind,
  type UiOverlayLayerState,
  type UiResult,
} from "../ui-contract";
import {
  uiDiagnostic,
  validateUiId,
  validateUiText,
} from "../primitives/validation";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function layerComponentId(props: unknown): string {
  if (!isRecord(props)) return "focus-dismiss-layer";
  const state = props["state"];
  if (!isRecord(state)) return "focus-dismiss-layer";
  const root = state["root"];
  if (!isRecord(root)) return "focus-dismiss-layer";
  const id = root["id"];
  return typeof id === "string" && id.trim().length > 0
    ? id
    : "focus-dismiss-layer";
}

function refuse(
  props: unknown,
  code: Parameters<typeof uiDiagnostic>[0],
  path: readonly (string | number)[],
  message: string,
  recovery: string,
): UiResult<UiOverlayLayerState> {
  const diagnostic = uiDiagnostic(
    code,
    layerComponentId(props),
    path,
    message,
    recovery,
  );
  return { diagnostics: [diagnostic], ok: false, refusal: diagnostic };
}

function isOverlayKind(value: unknown): value is UiOverlayKind {
  return UI_OVERLAY_KINDS.some((kind) => kind === value);
}

function validateDescriptor(
  props: UiFocusDismissLayerProps,
  descriptor: Readonly<Record<string, unknown>>,
): UiResult<UiOverlayLayerState> | null {
  const rawDescriptorId = descriptor["id"];
  const descriptorId =
    typeof rawDescriptorId === "string" && rawDescriptorId.trim().length > 0
      ? rawDescriptorId
      : layerComponentId(props);
  for (const [path, id] of [
    [["state", "root", "id"], descriptor["id"]],
    [["state", "root", "ownerId"], descriptor["ownerId"]],
    [["state", "root", "triggerId"], descriptor["triggerId"]],
    [["state", "root", "restoreFocusId"], descriptor["restoreFocusId"]],
  ] as const) {
    const checked = validateUiId(
      descriptorId,
      path,
      typeof id === "string" ? id : "",
    );
    if (!checked.ok) {
      return { diagnostics: checked.diagnostics, ok: false, refusal: checked.refusal };
    }
  }
  for (const [path, id] of [
    [["state", "root", "titleId"], descriptor["titleId"]],
    [["state", "root", "descriptionId"], descriptor["descriptionId"]],
    [["state", "root", "initialFocusId"], descriptor["initialFocusId"]],
  ] as const) {
    if (id === null) continue;
    const checked = validateUiId(
      descriptorId,
      path,
      typeof id === "string" ? id : "",
    );
    if (!checked.ok) {
      return { diagnostics: checked.diagnostics, ok: false, refusal: checked.refusal };
    }
  }
  const kind = descriptor["kind"];
  if (!isOverlayKind(kind)) {
    return refuse(
      props,
      "ui.value_malformed",
      ["state", "root", "kind"],
      "The overlay kind is outside the reviewed closed vocabulary.",
      "Use a declared overlay kind and mode pairing.",
    );
  }
  const allowedModes: readonly string[] = UI_OVERLAY_KIND_MODES[kind];
  const mode = descriptor["mode"];
  if (!allowedModes.some((allowedMode) => allowedMode === mode)) {
    return refuse(
      props,
      "ui.value_malformed",
      ["state", "root", "mode"],
      "The overlay kind and mode combination is not permitted.",
      "Use the reviewed mode for this overlay kind.",
    );
  }
  const requestRevision = descriptor["requestRevision"];
  if (
    typeof requestRevision !== "number" ||
    !Number.isSafeInteger(requestRevision) ||
    requestRevision < 0
  ) {
    return refuse(
      props,
      "ui.range_invalid",
      ["state", "root", "requestRevision"],
      "The overlay request revision is not a nonnegative safe integer.",
      "Provide a nonnegative revision within the safe-integer range.",
    );
  }
  const dismissibility = descriptor["dismissibility"];
  if (!isRecord(dismissibility)) {
    return refuse(
      props,
      "ui.value_malformed",
      ["state", "root", "dismissibility"],
      "The overlay dismissibility state is malformed.",
      "Use a declared dismissible or blocked state.",
    );
  }
  const dismissibilityKind = dismissibility["kind"];
  if (
    dismissibilityKind !== "dismissible" &&
    dismissibilityKind !== "blocked"
  ) {
    return refuse(
      props,
      "ui.value_malformed",
      ["state", "root", "dismissibility", "kind"],
      "The overlay dismissibility kind is outside the reviewed vocabulary.",
      "Use dismissible or blocked state.",
    );
  }
  if (dismissibilityKind === "blocked") {
    const reason = dismissibility["reason"];
    const checkedReason = validateUiText(
      descriptorId,
      ["state", "root", "dismissibility", "reason"],
      typeof reason === "string" ? reason : "",
      UI_LIMITS.maxDescriptionCodePoints,
    );
    if (!checkedReason.ok) {
      return {
        diagnostics: checkedReason.diagnostics,
        ok: false,
        refusal: checkedReason.refusal,
      };
    }
  }
  return null;
}

/**
 * Pure preflight for the one-root overlay state. Rendering adapters call this
 * before they acquire inertness, listeners, focus, or pointer ownership.
 */
export function FocusDismissLayer(
  props: UiFocusDismissLayerProps,
): UiResult<UiOverlayLayerState> {
  const propsValue: unknown = props;
  if (!isRecord(propsValue)) {
    return refuse(
      propsValue,
      "ui.value_malformed",
      ["props"],
      "The focus-dismiss layer props are malformed.",
      "Provide the reviewed bounded focus-dismiss prop record.",
    );
  }
  const state = propsValue["state"];
  if (!isRecord(state)) {
    return refuse(
      props,
      "ui.value_malformed",
      ["state"],
      "The focus-dismiss layer state is malformed.",
      "Provide the reviewed bounded overlay-layer state record.",
    );
  }
  const root: unknown = state["root"];
  if (root !== null && !isRecord(root)) {
    return refuse(
      props,
      "ui.value_malformed",
      ["state", "root"],
      "The root overlay descriptor is malformed.",
      "Provide one reviewed overlay descriptor or null.",
    );
  }
  const inertWhenModal = propsValue["inertWhenModal"];
  const escapePolicy = propsValue["escapePolicy"];
  const outsidePointerDismissesNonmodal =
    propsValue["outsidePointerDismissesNonmodal"];
  const descendantNonmodalIds = state["descendantNonmodalIds"];
  const dismissAncestorIds = state["dismissAncestorIds"];
  const activeTransientId = state["activeTransientId"];
  const modalScopeDepth = state["modalScopeDepth"];
  if (
    inertWhenModal !== true ||
    escapePolicy !== "dismiss-when-owner-allows" ||
    outsidePointerDismissesNonmodal !== true ||
    !Array.isArray(descendantNonmodalIds) ||
    !descendantNonmodalIds.every((id) => typeof id === "string") ||
    !Array.isArray(dismissAncestorIds) ||
    !dismissAncestorIds.every((id) => typeof id === "string") ||
    (activeTransientId !== null && typeof activeTransientId !== "string")
  ) {
    return refuse(
      props,
      "ui.value_malformed",
      ["policy"],
      "The focus-dismiss layer policy or identity collections are malformed.",
      "Use the fixed reviewed overlay policies and bounded identity arrays.",
    );
  }
  if (modalScopeDepth !== 0 && modalScopeDepth !== 1) {
    return refuse(
      props,
      "ui.modal_scope_limit",
      ["state", "modalScopeDepth"],
      "The modal-scope count exceeds the one-scope policy.",
      "Publish zero or one modal focus scope.",
    );
  }
  const backgroundId = validateUiId(
    layerComponentId(props),
    ["backgroundRootId"],
    typeof propsValue["backgroundRootId"] === "string"
      ? propsValue["backgroundRootId"]
      : "",
  );
  if (!backgroundId.ok) {
    return {
      diagnostics: backgroundId.diagnostics,
      ok: false,
      refusal: backgroundId.refusal,
    };
  }
  if (descendantNonmodalIds.length > UI_LIMITS.maxNonmodalSurfaces) {
    return refuse(
      props,
      "ui.overlay_conflict",
      ["state", "descendantNonmodalIds"],
      "The overlay layer exceeds its nonmodal descendant bound.",
      "Retire a descendant surface before opening another.",
    );
  }
  if (dismissAncestorIds.length > UI_LIMITS.maxDismissAncestors) {
    return refuse(
      props,
      "ui.dismiss_depth_limit",
      ["state", "dismissAncestorIds"],
      "The dismissal-owner ancestry exceeds its reviewed bound.",
      "Flatten the composed dismissal ownership chain.",
    );
  }
  const allIds = [
    ...descendantNonmodalIds,
    ...dismissAncestorIds,
  ];
  if (typeof activeTransientId === "string") allIds.push(activeTransientId);
  const seen = new Set<string>();
  for (const [index, id] of allIds.entries()) {
    const checked = validateUiId(
      layerComponentId(props),
      ["state", "references", index],
      id,
    );
    if (!checked.ok) {
      return { diagnostics: checked.diagnostics, ok: false, refusal: checked.refusal };
    }
    if (seen.has(id)) {
      return refuse(
        props,
        "ui.duplicate_item_id",
        ["state", "references", index],
        "Overlay descendant, transient, and dismissal identities cannot overlap.",
        "Give every active overlay owner a unique identity.",
      );
    }
    seen.add(id);
  }
  if (root === null) {
    if (
      modalScopeDepth !== 0 ||
      descendantNonmodalIds.length !== 0 ||
      activeTransientId !== null ||
      dismissAncestorIds.length !== 0
    ) {
      return refuse(
        props,
        "ui.stale_owner",
        ["state", "root"],
        "Descendant overlay state cannot survive without a root owner.",
        "Retire stale descendants before clearing the root owner.",
      );
    }
    return { diagnostics: [], ok: true, value: props.state };
  }
  const descriptorRefusal = validateDescriptor(props, root);
  if (descriptorRefusal !== null) return descriptorRefusal;
  const expectedDepth = root["mode"] === "modal" ? 1 : 0;
  if (modalScopeDepth !== expectedDepth) {
    return refuse(
      props,
      "ui.modal_scope_limit",
      ["state", "modalScopeDepth"],
      "The modal-scope count does not match the root overlay mode.",
      "Publish one modal scope only for a modal root surface.",
    );
  }
  return { diagnostics: [], ok: true, value: props.state };
}
