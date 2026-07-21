import { describe, expect, test } from "bun:test";

import type {
  UiCommonProps,
  UiDataTableProps,
  UiKeyValueListProps,
  UiResizablePanelsProps,
  UiTimelineLaneProps,
  UiTreeProps,
} from "../../src/ui/ui-contract";
import {
  DataTable,
  KeyValueList,
  ResizablePanels,
  TimelineLane,
  Tree,
} from "../../src/ui/primitives/StructuredViews";
import {
  RovingFocus,
  findTypeaheadMatch,
  moveRovingFocus,
  preflightRovingFocus,
} from "../../src/ui/primitives/roving-focus";
import { UiContractError } from "../../src/ui/primitives/validation";

type TableRow = Readonly<{ id: string; value: string }>;

const COMMON = Object.freeze({
  busy: false,
  density: "comfortable",
  describedBy: Object.freeze([]),
  disabled: false,
  id: "structured-owner",
  invalid: false,
}) satisfies UiCommonProps;

const KEY_VALUE_PROPS = Object.freeze({
  accessibleName: "Facts",
  items: Object.freeze([
    Object.freeze({
      description: "Description",
      id: "fact-one",
      key: "Key",
      value: "Value",
    }),
  ]),
}) satisfies UiKeyValueListProps;

const DATA_TABLE_PROPS = Object.freeze({
  caption: "Values",
  columns: Object.freeze([
    Object.freeze({
      id: "value-column",
      label: "Value",
      renderText: (row: TableRow) => row.value,
      scope: "col",
      sortable: true,
    }),
  ]),
  emptyMessage: "No values",
  id: "data-table",
  onSortChange: () => undefined,
  rowId: (row: TableRow) => row.id,
  rows: Object.freeze([Object.freeze({ id: "row-one", value: "One" })]),
  sort: null,
}) satisfies UiDataTableProps<TableRow>;

const TREE_PROPS = Object.freeze({
  ...COMMON,
  accessibleName: "Tree",
  activeId: "root-node",
  id: "tree-owner",
  nodes: Object.freeze([
    Object.freeze({
      childIds: Object.freeze([]),
      disabled: false,
      expanded: false,
      id: "root-node",
      label: "Root",
      parentId: null,
      selected: true,
    }),
  ]),
  onAction: () => undefined,
  rootIds: Object.freeze(["root-node"]),
  selectionMode: "single",
}) satisfies UiTreeProps;

const RESIZABLE_PANELS: UiResizablePanelsProps["panels"] = [
  Object.freeze({
    collapsed: false,
    collapsible: true,
    id: "panel-one",
    label: "One",
    maxPercent: 80,
    minPercent: 20,
    sizePercent: 50,
  }),
  Object.freeze({
    collapsed: false,
    collapsible: true,
    id: "panel-two",
    label: "Two",
    maxPercent: 80,
    minPercent: 20,
    sizePercent: 50,
  }),
];

const RESIZABLE_PROPS = Object.freeze({
  ...COMMON,
  id: "panel-owner",
  onCollapsedIdsChange: () => undefined,
  onSizesChange: () => undefined,
  orientation: "horizontal",
  panels: RESIZABLE_PANELS,
}) satisfies UiResizablePanelsProps;

const TIMELINE_PROPS = Object.freeze({
  ...COMMON,
  accessibleName: "Timeline",
  activeId: "timeline-item",
  horizontalScroll: true,
  id: "timeline-owner",
  items: Object.freeze([
    Object.freeze({
      disabled: false,
      exactDuration: "1/1",
      exactStart: "0/1",
      id: "timeline-item",
      label: "Item",
      selected: true,
    }),
  ]),
  onAction: () => undefined,
}) satisfies UiTimelineLaneProps;

function invokeBoundary(
  boundary: unknown,
  ...argumentsList: readonly unknown[]
): unknown {
  if (typeof boundary !== "function") {
    throw new Error("Expected a callable public boundary.");
  }
  const result: unknown = Reflect.apply(boundary, undefined, argumentsList);
  return result;
}

function captureContractError(action: () => void): UiContractError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(UiContractError);
    if (error instanceof UiContractError) return error;
    throw error;
  }
  throw new Error("Expected a synchronous structured-view refusal.");
}

function refusalCode(result: unknown): unknown {
  if (typeof result !== "object" || result === null || !("refusal" in result)) {
    throw new Error("Expected a refused UiResult.");
  }
  const refusal = result.refusal;
  if (typeof refusal !== "object" || refusal === null || !("code" in refusal)) {
    throw new Error("Expected a structured refusal diagnostic.");
  }
  return refusal.code;
}

describe("U0 structured public-boundary preflight", () => {
  test("refuses non-record component props without leaking native TypeErrors", () => {
    for (const boundary of [
      KeyValueList,
      DataTable,
      Tree,
      ResizablePanels,
      TimelineLane,
    ]) {
      const error = captureContractError(() => {
        invokeBoundary(boundary, null);
      });
      expect(error.diagnostic.code).toBe("ui.value_malformed");
      expect(error.diagnostic.path).toEqual(["props"]);
    }
  });

  test("preflights nested records, arrays, closed values, and callbacks before hooks", () => {
    const malformedCases: readonly (readonly [unknown, unknown])[] = [
      [KeyValueList, { ...KEY_VALUE_PROPS, items: [null] }],
      [DataTable, { ...DATA_TABLE_PROPS, columns: [null] }],
      [DataTable, { ...DATA_TABLE_PROPS, onSortChange: null }],
      [DataTable, { ...DATA_TABLE_PROPS, sort: [] }],
      [Tree, { ...TREE_PROPS, nodes: [null] }],
      [Tree, { ...TREE_PROPS, onAction: null }],
      [Tree, { ...TREE_PROPS, selectionMode: "range" }],
      [ResizablePanels, { ...RESIZABLE_PROPS, orientation: "diagonal" }],
      [ResizablePanels, { ...RESIZABLE_PROPS, onSizesChange: null }],
      [ResizablePanels, { ...RESIZABLE_PROPS, panels: [null, null] }],
      [TimelineLane, { ...TIMELINE_PROPS, horizontalScroll: false }],
      [TimelineLane, { ...TIMELINE_PROPS, items: [null] }],
      [TimelineLane, { ...TIMELINE_PROPS, onAction: null }],
    ];

    for (const [boundary, props] of malformedCases) {
      const error = captureContractError(() => {
        invokeBoundary(boundary, props);
      });
      expect(error.diagnostic.code).toBe("ui.value_malformed");
    }
  });

  test("validates nullable identities and refuses owner or cross-kind collisions", () => {
    const malformedActiveIds: readonly (readonly [unknown, unknown])[] = [
      [Tree, { ...TREE_PROPS, activeId: { id: "root-node" } }],
      [TimelineLane, { ...TIMELINE_PROPS, activeId: 1 }],
    ];
    for (const [boundary, props] of malformedActiveIds) {
      const error = captureContractError(() => {
        invokeBoundary(boundary, props);
      });
      expect(error.diagnostic.code).toBe("ui.id_invalid");
    }

    const tableOwnerCollision = captureContractError(() => {
      invokeBoundary(DataTable, {
        ...DATA_TABLE_PROPS,
        columns: [{ ...DATA_TABLE_PROPS.columns[0], id: DATA_TABLE_PROPS.id }],
      });
    });
    expect(tableOwnerCollision.diagnostic.code).toBe("ui.duplicate_item_id");

    const tableCrossKindCollision = captureContractError(() => {
      invokeBoundary(DataTable, {
        ...DATA_TABLE_PROPS,
        rows: [{ id: DATA_TABLE_PROPS.columns[0]?.id, value: "One" }],
      });
    });
    expect(tableCrossKindCollision.diagnostic.code).toBe(
      "ui.duplicate_item_id",
    );

    const treeOwnerCollision = captureContractError(() => {
      invokeBoundary(Tree, {
        ...TREE_PROPS,
        activeId: TREE_PROPS.id,
        nodes: [{ ...TREE_PROPS.nodes[0], id: TREE_PROPS.id }],
        rootIds: [TREE_PROPS.id],
      });
    });
    expect(treeOwnerCollision.diagnostic.code).toBe("ui.duplicate_item_id");

    const panelOwnerCollision = captureContractError(() => {
      invokeBoundary(ResizablePanels, {
        ...RESIZABLE_PROPS,
        panels: [
          { ...RESIZABLE_PROPS.panels[0], id: RESIZABLE_PROPS.id },
          RESIZABLE_PROPS.panels[1],
        ],
      });
    });
    expect(panelOwnerCollision.diagnostic.code).toBe("ui.duplicate_item_id");

    const timelineOwnerCollision = captureContractError(() => {
      invokeBoundary(TimelineLane, {
        ...TIMELINE_PROPS,
        activeId: TIMELINE_PROPS.id,
        items: [{ ...TIMELINE_PROPS.items[0], id: TIMELINE_PROPS.id }],
      });
    });
    expect(timelineOwnerCollision.diagnostic.code).toBe(
      "ui.duplicate_item_id",
    );
  });

  test("keeps every roving helper total under malformed JavaScript input", () => {
    expect(refusalCode(invokeBoundary(preflightRovingFocus, null))).toBe(
      "ui.value_malformed",
    );
    expect(
      refusalCode(
        invokeBoundary(preflightRovingFocus, {
          currentId: null,
          disabledIds: [],
          itemIds: null,
          orientation: "horizontal",
          ownerId: "roving-owner",
          typeahead: false,
          wrap: false,
        }),
      ),
    ).toBe("ui.value_malformed");
    expect(
      refusalCode(
        invokeBoundary(preflightRovingFocus, {
          currentId: 4,
          disabledIds: [],
          itemIds: ["item"],
          orientation: "horizontal",
          ownerId: "roving-owner",
          typeahead: false,
          wrap: false,
        }),
      ),
    ).toBe("ui.id_invalid");
    expect(
      refusalCode(
        invokeBoundary(RovingFocus, {
          currentId: "roving-owner",
          disabledIds: [],
          itemIds: ["roving-owner"],
          orientation: "horizontal",
          ownerId: "roving-owner",
          typeahead: false,
          wrap: false,
        }),
      ),
    ).toBe("ui.duplicate_item_id");

    expect(invokeBoundary(moveRovingFocus, null, "ArrowRight")).toEqual({
      consumed: false,
      currentId: null,
    });
    expect(
      invokeBoundary(
        moveRovingFocus,
        {
          currentId: "item",
          disabledIds: [],
          itemIds: ["item"],
          orientation: "horizontal",
          ownerId: "roving-owner",
          typeahead: false,
          wrap: false,
        },
        "PageDown",
      ),
    ).toEqual({ consumed: false, currentId: "item" });

    const malformedTypeaheadArguments: readonly (readonly unknown[])[] = [
      [null, [], null, new Map(), "a"],
      [[], null, null, new Map(), "a"],
      [[], [], null, null, "a"],
      [[], [], null, new Map(), null],
      [["item"], [], null, new Map([["item", null]]), "i"],
      [[{ id: "item" }], [], null, new Map(), "i"],
    ];
    for (const argumentsList of malformedTypeaheadArguments) {
      expect(invokeBoundary(findTypeaheadMatch, ...argumentsList)).toBeNull();
    }
  });
});
