import { describe, expect, test } from "bun:test";

import {
  FocusDismissLayer,
  RovingFocus,
  UI_LIMITS,
  findTypeaheadMatch,
  moveRovingFocus,
  preflightMenuTopology,
  preflightRovingFocus,
  preflightTreeTopology,
  validateFiniteRange,
  validateUiCommonProps,
  type UiCommonProps,
  type UiFocusDismissLayerProps,
  type UiMenuItem,
  type UiOverlayDescriptor,
  type UiRovingFocusProps,
  type UiTreeNode,
} from "../../src/ui";

function common(overrides: Partial<UiCommonProps> = {}): UiCommonProps {
  return {
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    id: "owner",
    invalid: false,
    ...overrides,
  };
}

function roving(
  overrides: Partial<UiRovingFocusProps> = {},
): UiRovingFocusProps {
  return {
    currentId: "b",
    disabledIds: ["c"],
    itemIds: ["a", "b", "c", "d"],
    orientation: "horizontal",
    ownerId: "roving",
    typeahead: true,
    wrap: true,
    ...overrides,
  };
}

function treeNode(
  id: string,
  parentId: string | null,
  childIds: readonly string[],
): UiTreeNode {
  return {
    childIds,
    disabled: false,
    expanded: true,
    id,
    label: id,
    parentId,
    selected: false,
  };
}

function descriptor(
  overrides: Partial<UiOverlayDescriptor> = {},
): UiOverlayDescriptor {
  return {
    descriptionId: "overlay-description",
    dismissibility: { kind: "dismissible" },
    id: "overlay",
    initialFocusId: null,
    kind: "dialog",
    mode: "modal",
    ownerId: "owner",
    requestRevision: 0,
    restoreFocusId: "open-overlay",
    titleId: "overlay-title",
    triggerId: "open-overlay",
    ...overrides,
  };
}

function layer(
  root: UiOverlayDescriptor | null,
  overrides: Partial<UiFocusDismissLayerProps["state"]> = {},
): UiFocusDismissLayerProps {
  return {
    backgroundRootId: "application-background",
    escapePolicy: "dismiss-when-owner-allows",
    inertWhenModal: true,
    outsidePointerDismissesNonmodal: true,
    state: {
      activeTransientId: null,
      descendantNonmodalIds: [],
      dismissAncestorIds: [],
      modalScopeDepth: root?.mode === "modal" ? 1 : 0,
      root,
      ...overrides,
    },
  };
}

describe("U0 runtime validation kernel", () => {
  test("accepts exact reference bounds and refuses exact plus one", () => {
    const exact = Array.from(
      { length: UI_LIMITS.maxReferenceIds },
      (_, index) => `description-${String(index)}`,
    );
    expect(validateUiCommonProps(common({ describedBy: exact })).ok).toBe(true);
    const excess = validateUiCommonProps(
      common({ describedBy: [...exact, "description-excess"] }),
    );
    expect(excess.ok).toBe(false);
    if (!excess.ok) expect(excess.refusal.code).toBe("ui.collection_limit");
  });

  test("keeps range and step refusals distinct", () => {
    expect(validateFiniteRange("slider", 5, 0, 10, 1).ok).toBe(true);
    const range = validateFiniteRange("slider", 11, 0, 10, 1);
    const step = validateFiniteRange("slider", 5, 0, 10, 0);
    expect(range.ok ? null : range.refusal.code).toBe("ui.range_invalid");
    expect(step.ok ? null : step.refusal.code).toBe("ui.step_invalid");
  });

  test("bounds flattened menus and rejects repeated object identity", () => {
    const exact: UiMenuItem[] = Array.from(
      { length: UI_LIMITS.maxMenuItems },
      (_, index) => ({
        disabled: false,
        id: `action-${String(index)}`,
        kind: "action",
        label: `Action ${String(index)}`,
      }),
    );
    expect(preflightMenuTopology("menu", exact).ok).toBe(true);
    const excess = preflightMenuTopology("menu", [
      ...exact,
      { disabled: false, id: "excess", kind: "action", label: "Excess" },
    ]);
    expect(excess.ok ? null : excess.refusal.code).toBe("ui.collection_limit");

    const shared: UiMenuItem = {
      disabled: false,
      id: "shared",
      kind: "action",
      label: "Shared",
    };
    const repeated = preflightMenuTopology("menu", [
      shared,
      { disabled: false, id: "submenu", items: [shared], kind: "submenu", label: "More" },
    ]);
    expect(repeated.ok ? null : repeated.refusal.code).toBe("ui.value_malformed");
  });

  test("proves rooted-forest reachability and reciprocal references", () => {
    const valid = [
      treeNode("root", null, ["child"]),
      treeNode("child", "root", []),
    ];
    expect(preflightTreeTopology("tree", valid, ["root"]).ok).toBe(true);

    const missing = preflightTreeTopology(
      "tree",
      [treeNode("root", null, ["absent"])],
      ["root"],
    );
    expect(missing.ok ? null : missing.refusal.code).toBe("ui.value_malformed");

    const disconnected = preflightTreeTopology(
      "tree",
      [...valid, treeNode("orphan", null, [])],
      ["root"],
    );
    expect(disconnected.ok ? null : disconnected.refusal.code).toBe(
      "ui.value_malformed",
    );
  });

  test("moves roving focus in caller order while skipping disabled items", () => {
    expect(RovingFocus(roving()).ok).toBe(true);
    expect(preflightRovingFocus(roving({ currentId: "c" })).ok).toBe(false);
    expect(
      preflightRovingFocus(roving({ disabledIds: ["c", "c"] })).ok,
    ).toBe(false);
    expect(
      preflightRovingFocus(
        roving({ orientation: "diagonal" as UiRovingFocusProps["orientation"] }),
      ).ok,
    ).toBe(false);
    expect(moveRovingFocus(roving(), "ArrowRight")).toEqual({
      consumed: true,
      currentId: "d",
    });
    expect(moveRovingFocus(roving({ currentId: "d" }), "ArrowRight")).toEqual({
      consumed: true,
      currentId: "a",
    });
    expect(moveRovingFocus(roving(), "Home").currentId).toBe("a");
    expect(moveRovingFocus(roving(), "End").currentId).toBe("d");
    expect(
      findTypeaheadMatch(
        ["a", "b", "c"],
        ["b"],
        "a",
        new Map([
          ["a", "Alpha"],
          ["b", "Beta"],
          ["c", "Cadence"],
        ]),
        "ca",
      ),
    ).toBe("c");
  });

  test("validates one root overlay and rejects orphaned or conflicting state", () => {
    expect(FocusDismissLayer(layer(null)).ok).toBe(true);
    expect(FocusDismissLayer(layer(descriptor())).ok).toBe(true);

    const orphan = FocusDismissLayer(
      layer(null, { descendantNonmodalIds: ["orphan"] }),
    );
    expect(orphan.ok ? null : orphan.refusal.code).toBe("ui.stale_owner");

    const wrongMode = FocusDismissLayer(
      layer(descriptor({ kind: "tooltip", mode: "modal" })),
    );
    expect(wrongMode.ok ? null : wrongMode.refusal.code).toBe(
      "ui.value_malformed",
    );

    const excess = FocusDismissLayer(
      layer(descriptor(), {
        descendantNonmodalIds: ["one", "two", "three", "four", "five"],
      }),
    );
    expect(excess.ok ? null : excess.refusal.code).toBe("ui.overlay_conflict");

    const exactDismissDepth = FocusDismissLayer(
      layer(descriptor(), {
        dismissAncestorIds: Array.from(
          { length: UI_LIMITS.maxDismissAncestors },
          (_, index) => `ancestor-${String(index)}`,
        ),
      }),
    );
    expect(exactDismissDepth.ok).toBe(true);
    const excessDismissDepth = FocusDismissLayer(
      layer(descriptor(), {
        dismissAncestorIds: Array.from(
          { length: UI_LIMITS.maxDismissAncestors + 1 },
          (_, index) => `ancestor-${String(index)}`,
        ),
      }),
    );
    expect(excessDismissDepth.ok ? null : excessDismissDepth.refusal.code).toBe(
      "ui.dismiss_depth_limit",
    );

    const duplicateOwner = FocusDismissLayer(
      layer(descriptor(), {
        activeTransientId: "shared-owner",
        descendantNonmodalIds: ["shared-owner"],
      }),
    );
    expect(duplicateOwner.ok ? null : duplicateOwner.refusal.code).toBe(
      "ui.duplicate_item_id",
    );

    const excessModalDepth = FocusDismissLayer(
      layer(descriptor(), { modalScopeDepth: 2 as 0 | 1 }),
    );
    expect(excessModalDepth.ok ? null : excessModalDepth.refusal.code).toBe(
      "ui.modal_scope_limit",
    );

    const malformedDismissibility = FocusDismissLayer(
      layer(
        descriptor({
          dismissibility: null as unknown as UiOverlayDescriptor["dismissibility"],
        }),
      ),
    );
    expect(
      malformedDismissibility.ok
        ? null
        : malformedDismissibility.refusal.code,
    ).toBe("ui.value_malformed");

    const malformedRoot = FocusDismissLayer({
      ...layer(null),
      state: {
        ...layer(null).state,
        root: "dialog" as unknown as UiOverlayDescriptor,
      },
    });
    expect(malformedRoot.ok ? null : malformedRoot.refusal.code).toBe(
      "ui.value_malformed",
    );
  });
});
