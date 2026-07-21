import type {
  JSX,
  KeyboardEventHandler,
  PointerEventHandler,
} from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";

import {
  UI_LIMITS,
  type UiDataTableProps,
  type UiDataTableSort,
  type UiInteractionSource,
  type UiKeyValueListProps,
  type UiResizablePanelsProps,
  type UiTimelineLaneProps,
  type UiTreeNode,
  type UiTreeProps,
} from "../ui-contract";
import { useInteractionSource } from "./interaction-source";
import {
  findTypeaheadMatch,
  moveRovingFocus,
  type UiRovingKey,
} from "./roving-focus";
import {
  preflightTreeTopology,
  requireUiResult,
  uiDiagnostic,
  validateFiniteRange,
  validateUiCollectionBound,
  validateUiCollectionProductBound,
  validateUiCommonProps,
  validateUiId,
  validateUiText,
  UiContractError,
} from "./validation";

function throwRefusal(
  code: ConstructorParameters<typeof UiContractError>[0]["code"],
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
): never {
  throw new UiContractError(
    uiDiagnostic(code, componentId, path, message, recoveryAction),
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireStructuredPropsRecord(
  value: unknown,
  componentId: string,
): void {
  if (isRecord(value)) return;
  throwRefusal(
    "ui.value_malformed",
    componentId,
    ["props"],
    "Structured-view props must be one declared record.",
    "Provide the declared bounded structured-view props.",
  );
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isRovingKey(key: string): key is UiRovingKey {
  return (
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "End" ||
    key === "Home"
  );
}

type RovingTabStopState = Readonly<{
  currentId: string | null;
  ownerId: string;
  requestedId: string | null;
}>;

/**
 * Keeps keyboard movement local while immediately honoring a changed controlled
 * entry identity. A removed/disabled local target falls back without publishing
 * selection or application state.
 */
function useRovingTabStop(
  ownerId: string,
  requestedId: string | null,
  enabledIds: readonly string[],
  fallbackId: string | null,
): readonly [string | null, (id: string) => void] {
  const [state, setState] = useState<RovingTabStopState>({
    currentId: fallbackId,
    ownerId,
    requestedId,
  });
  const retainedCurrentIsValid =
    state.currentId === null
      ? enabledIds.length === 0
      : enabledIds.includes(state.currentId);
  const currentId =
    state.ownerId === ownerId &&
    state.requestedId === requestedId &&
    retainedCurrentIsValid
      ? state.currentId
      : fallbackId;

  return [
    currentId,
    (id) => {
      setState({ currentId: id, ownerId, requestedId });
    },
  ];
}

export function KeyValueList(props: UiKeyValueListProps) {
  requireStructuredPropsRecord(props, "key-value-list");
  const items: unknown = props.items;
  if (!Array.isArray(items)) {
    throwRefusal(
      "ui.value_malformed",
      "key-value-list",
      ["items"],
      "Key-value items must be an ordered collection.",
      "Provide a bounded array of facts.",
    );
  }
  if (props.accessibleName !== null) {
    requireUiResult(
      validateUiText(
        "key-value-list",
        ["accessibleName"],
        props.accessibleName,
        UI_LIMITS.maxAccessibleNameCodePoints,
      ),
    );
  }
  requireUiResult(
    validateUiCollectionBound(
      "key-value-list",
      ["items"],
      props.items,
      "maxKeyValueItems",
    ),
  );
  const ids = new Set<string>();
  for (const [index, item] of props.items.entries()) {
    const itemValue: unknown = item;
    if (
      typeof itemValue !== "object" ||
      itemValue === null ||
      Array.isArray(itemValue)
    ) {
      throwRefusal(
        "ui.value_malformed",
        "key-value-list",
        ["items", index],
        "Every key-value item must be one declared fact record.",
        "Provide bounded fact records.",
      );
    }
    requireUiResult(validateUiId("key-value-list", ["items", index, "id"], item.id));
    requireUiResult(
      validateUiText(
        "key-value-list",
        ["items", index, "key"],
        item.key,
        UI_LIMITS.maxLabelCodePoints,
      ),
    );
    requireUiResult(
      validateUiText(
        "key-value-list",
        ["items", index, "value"],
        item.value,
        UI_LIMITS.maxDescriptionCodePoints,
        { allowEmpty: true },
      ),
    );
    if (item.description !== null) {
      requireUiResult(
        validateUiText(
          "key-value-list",
          ["items", index, "description"],
          item.description,
          UI_LIMITS.maxDescriptionCodePoints,
        ),
      );
    }
    if (ids.has(item.id)) {
      throwRefusal(
        "ui.duplicate_item_id",
        "key-value-list",
        ["items", index, "id"],
        "Key-value identities must be unique.",
        "Give every fact a unique stable identity.",
      );
    }
    ids.add(item.id);
  }

  return (
    <dl
      aria-label={props.accessibleName ?? undefined}
      class="ui-key-value-list"
    >
      {props.items.map((item) => (
        <div class="ui-key-value-list__item" key={item.id}>
          <dt>{item.key}</dt>
          <dd>
            <span>{item.value}</span>
            {item.description === null ? null : (
              <small>{item.description}</small>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function nextSort(current: UiDataTableSort, columnId: string): UiDataTableSort {
  if (current?.columnId !== columnId) {
    return { columnId, direction: "ascending" };
  }
  return current.direction === "ascending"
    ? { columnId, direction: "descending" }
    : null;
}

export function DataTable<Row>(props: UiDataTableProps<Row>) {
  requireStructuredPropsRecord(props, "data-table");
  requireUiResult(validateUiId("data-table", ["id"], props.id));
  requireUiResult(
    validateUiText(
      props.id,
      ["caption"],
      props.caption,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  requireUiResult(
    validateUiText(
      props.id,
      ["emptyMessage", "description"],
      props.emptyMessage,
      UI_LIMITS.maxDescriptionCodePoints,
    ),
  );
  const columns: unknown = props.columns;
  const rows: unknown = props.rows;
  if (!Array.isArray(columns) || !Array.isArray(rows)) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["columns", "rows"],
      "Data table columns and rows must be ordered collections.",
      "Provide bounded arrays of columns and rows.",
    );
  }
  const rowId: unknown = props.rowId;
  const onSortChange: unknown = props.onSortChange;
  if (typeof rowId !== "function" || typeof onSortChange !== "function") {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["callbacks"],
      "Data table identity, rendering, and sort callbacks must be callable.",
      "Provide the declared data table callbacks.",
    );
  }
  if (props.columns.length === 0) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["columns"],
      "A data table requires at least one declared column.",
      "Provide one or more bounded text columns.",
    );
  }
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["columns"],
      props.columns,
      "maxTableColumns",
    ),
  );
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["rows"],
      props.rows,
      "maxTableRows",
    ),
  );
  requireUiResult(
    validateUiCollectionProductBound(
      props.id,
      ["columns", "rows"],
      props.columns,
      props.rows,
      "maxTableCells",
    ),
  );
  const identities = new Set<string>([props.id]);
  for (const [index, column] of props.columns.entries()) {
    const columnValue: unknown = column;
    if (!isRecord(columnValue)) {
      throwRefusal(
        "ui.value_malformed",
        props.id,
        ["columns", index],
        "Every data table column must be one declared column record.",
        "Provide bounded text-column records.",
      );
    }
    requireUiResult(validateUiId(props.id, ["columns", index, "id"], column.id));
    requireUiResult(
      validateUiText(
        props.id,
        ["columns", index, "label"],
        column.label,
        UI_LIMITS.maxLabelCodePoints,
      ),
    );
    const scope: unknown = column.scope;
    const sortable: unknown = column.sortable;
    const renderText: unknown = column.renderText;
    if (
      scope !== "col" ||
      typeof sortable !== "boolean" ||
      typeof renderText !== "function"
    ) {
      throwRefusal(
        "ui.value_malformed",
        props.id,
        ["columns", index],
        "Data table columns require col scope, boolean sortability, and a text renderer.",
        "Provide the declared closed column fields and callback.",
      );
    }
    if (identities.has(column.id)) {
      throwRefusal(
        "ui.duplicate_item_id",
        props.id,
        ["columns", index, "id"],
        "Table column identities must be unique and distinct from their owner.",
        "Give the table and every column distinct stable identities.",
      );
    }
    identities.add(column.id);
  }
  const sort: unknown = props.sort;
  if (sort !== null && !isRecord(sort)) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["sort"],
      "Data table sort state must be null or one declared sort record.",
      "Provide a current column and ascending or descending direction.",
    );
  }
  if (sort !== null) {
    requireUiResult(
      validateUiId(
        props.id,
        ["sort", "columnId"],
        sort["columnId"],
      ),
    );
    if (
      (sort["direction"] !== "ascending" &&
        sort["direction"] !== "descending")
    ) {
      throwRefusal(
        "ui.value_malformed",
        props.id,
        ["sort"],
        "Data table sort state uses an unknown column identity or direction shape.",
        "Provide a current column and ascending or descending direction.",
      );
    }
  }
  if (
    props.sort !== null &&
    !props.columns.some(
      (column) => column.id === props.sort?.columnId && column.sortable,
    )
  ) {
    throwRefusal(
      "ui.selection_invalid",
      props.id,
      ["sort", "columnId"],
      "The table sort references an absent or unsortable column.",
      "Select a current sortable column or clear the sort.",
    );
  }
  const materializedRows = props.rows.map((row, rowIndex) => {
    const id = props.rowId(row);
    requireUiResult(validateUiId(props.id, ["rows", rowIndex, "id"], id));
    if (identities.has(id)) {
      throwRefusal(
        "ui.duplicate_item_id",
        props.id,
        ["rows", rowIndex, "id"],
        "Table row identities must be unique and distinct from table and column identities.",
        "Give the table, columns, and rows distinct stable identities.",
      );
    }
    identities.add(id);
    const cells = props.columns.map((column, columnIndex) => {
      const text = column.renderText(row);
      requireUiResult(
        validateUiText(
          props.id,
          ["rows", rowIndex, "cells", columnIndex],
          text,
          UI_LIMITS.maxDescriptionCodePoints,
          { allowEmpty: true },
        ),
      );
      return text;
    });
    return { cells, id };
  });
  const interaction = useInteractionSource<HTMLButtonElement>();

  return (
    <div class="ui-data-table-scroll" role="region" aria-label={props.caption}>
      <table class="ui-data-table" id={props.id}>
        <caption>{props.caption}</caption>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th
                aria-sort={
                  props.sort?.columnId === column.id
                    ? props.sort.direction
                    : undefined
                }
                key={column.id}
                scope={column.scope}
              >
                {column.sortable ? (
                  <button
                    class="ui-data-table__sort"
                    onClick={(event) => {
                      props.onSortChange({
                        componentId: props.id,
                        phase: "commit",
                        previousValue: props.sort,
                        source: interaction.take(
                          event.detail === 0
                            ? "assistive-technology"
                            : "pointer",
                        ),
                        value: nextSort(props.sort, column.id),
                      });
                    }}
                    onKeyDown={interaction.onKeyDown}
                    onPointerDown={interaction.onPointerDown}
                    type="button"
                  >
                    {column.label}
                    <span aria-hidden="true">
                      {props.sort?.columnId === column.id
                        ? props.sort.direction === "ascending"
                          ? " ↑"
                          : " ↓"
                        : " ↕"}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {materializedRows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, props.columns.length)}>
                <span class="ui-data-table__empty">{props.emptyMessage}</span>
              </td>
            </tr>
          ) : (
            materializedRows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) => (
                  <td key={props.columns[index]?.id ?? String(index)}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

type VisibleTreeNode = Readonly<{
  node: UiTreeNode;
  level: number;
  position: number;
  setSize: number;
}>;

function visibleTreeNodes(
  nodes: readonly UiTreeNode[],
  rootIds: readonly string[],
): readonly VisibleTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  type Pending = Readonly<{
    id: string;
    level: number;
    position: number;
    setSize: number;
  }>;
  const pending: Pending[] = rootIds
    .map((id, index) => ({
      id,
      level: 1,
      position: index + 1,
      setSize: rootIds.length,
    }))
    .reverse();
  const visible: VisibleTreeNode[] = [];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    const node = byId.get(item.id);
    if (node === undefined) continue;
    visible.push({
      level: item.level,
      node,
      position: item.position,
      setSize: item.setSize,
    });
    if (node.expanded) {
      for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
        const childId = node.childIds[index];
        if (childId !== undefined) {
          pending.push({
            id: childId,
            level: item.level + 1,
            position: index + 1,
            setSize: node.childIds.length,
          });
        }
      }
    }
  }
  return visible;
}

export function Tree(props: UiTreeProps) {
  requireStructuredPropsRecord(props, "tree");
  requireUiResult(validateUiId("tree", ["id"], props.id));
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  const selectionMode: unknown = props.selectionMode;
  if (
    selectionMode !== "single" &&
    selectionMode !== "multiple"
  ) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["selectionMode"],
      "Tree selection mode must use one of the reviewed closed values.",
      "Choose single or multiple tree selection.",
    );
  }
  if (typeof props.onAction !== "function") {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["onAction"],
      "The tree action callback must be callable.",
      "Provide the declared semantic action boundary.",
    );
  }
  requireUiResult(preflightTreeTopology(props.id, props.nodes, props.rootIds));
  const activeId: unknown = props.activeId;
  if (activeId !== null) {
    requireUiResult(validateUiId(props.id, ["activeId"], activeId));
  }
  if (
    props.selectionMode === "single" &&
    props.nodes.filter((node) => node.selected).length > 1
  ) {
    throwRefusal(
      "ui.selection_invalid",
      props.id,
      ["nodes", "selected"],
      "A single-selection tree cannot contain more than one selected node.",
      "Keep at most one tree node selected.",
    );
  }
  const identities = new Set<string>([props.id]);
  for (const [index, node] of props.nodes.entries()) {
    requireUiResult(
      validateUiText(
        props.id,
        ["nodes", index, "label"],
        node.label,
        UI_LIMITS.maxLabelCodePoints,
      ),
    );
    if (identities.has(node.id)) {
      throwRefusal(
        "ui.duplicate_item_id",
        props.id,
        ["nodes", index, "id"],
        "Tree node identities must be unique and distinct from their owner.",
        "Give the tree and every node distinct stable identities.",
      );
    }
    identities.add(node.id);
  }
  const visible = visibleTreeNodes(props.nodes, props.rootIds);
  const activeNode =
    props.activeId === null
      ? null
      : visible.find(({ node }) => node.id === props.activeId)?.node;
  if (
    props.activeId !== null &&
    (activeNode === undefined || activeNode?.disabled === true)
  ) {
    throwRefusal(
      "ui.selection_invalid",
      props.id,
      ["activeId"],
      "The active tree identity is hidden, disabled, or absent.",
      "Choose a current enabled tree node.",
    );
  }
  const byId = new Map(props.nodes.map((node) => [node.id, node]));
  const visibleIds = visible.map(({ node }) => node.id);
  const disabledIds = visible
    .filter(({ node }) => node.disabled)
    .map(({ node }) => node.id);
  const enabledIds = visible
    .filter(({ node }) => !node.disabled)
    .map(({ node }) => node.id);
  const entryActiveId =
    props.activeId ??
    visible.find(({ node }) => node.selected && !node.disabled)?.node.id ??
    enabledIds[0] ??
    null;
  const [rovingActiveId, setRovingActiveId] = useRovingTabStop(
    props.id,
    props.activeId,
    enabledIds,
    entryActiveId,
  );
  const treeDomId = useId();
  const nodeDomIds = new Map(
    visible.map(({ node }, index) => [node.id, `${treeDomId}-node-${String(index)}`]),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const labels = new Map(visible.map(({ node }) => [node.id, node.label]));
  const typeahead = useRef("");
  const typeaheadTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (typeaheadTimer.current !== null) {
        window.clearTimeout(typeaheadTimer.current);
      }
    },
    [],
  );

  const focusById = (id: string | null) => {
    if (id === null) return;
    const root = rootRef.current;
    const targetId = nodeDomIds.get(id);
    const target = targetId === undefined
      ? null
      : root?.ownerDocument.getElementById(targetId);
    if (!(target instanceof HTMLElement) || root === null || !root.contains(target)) {
      return;
    }
    setRovingActiveId(id);
    target.focus();
  };
  const moveByKey = (currentId: string, key: UiRovingKey) => {
    const move = moveRovingFocus(
      {
        currentId,
        disabledIds,
        itemIds: visibleIds,
        orientation: "vertical",
        ownerId: props.id,
        typeahead: false,
        wrap: false,
      },
      key,
    );
    if (move.consumed) focusById(move.currentId);
  };
  const onTreeKeyDown = (
    event: Parameters<KeyboardEventHandler<HTMLDivElement>>[0],
    item: VisibleTreeNode,
  ) => {
    if (props.disabled || props.busy || item.node.disabled) return;
    const currentId = item.node.id;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      moveByKey(currentId, event.key);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (item.node.childIds.length > 0 && !item.node.expanded) {
        props.onAction({
          action: "activate",
          componentId: props.id,
          itemId: currentId,
          source: "keyboard",
          value: "expand",
        });
      } else {
        const firstEnabledChildId = item.node.childIds.find(
          (childId) => byId.get(childId)?.disabled === false,
        );
        focusById(firstEnabledChildId ?? null);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (item.node.expanded) {
        props.onAction({
          action: "activate",
          componentId: props.id,
          itemId: currentId,
          source: "keyboard",
          value: "collapse",
        });
      } else {
        let enabledParentId = item.node.parentId;
        while (
          enabledParentId !== null &&
          byId.get(enabledParentId)?.disabled === true
        ) {
          enabledParentId = byId.get(enabledParentId)?.parentId ?? null;
        }
        focusById(enabledParentId);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onAction({
        action: "activate",
        componentId: props.id,
        itemId: currentId,
        source: "keyboard",
        value: "activate",
      });
      return;
    }
    if (
      codePointLength(event.key) === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const candidate = `${typeahead.current}${event.key}`;
      if (codePointLength(candidate) > UI_LIMITS.maxTypeaheadCodePoints) {
        return;
      }
      typeahead.current = candidate;
      if (typeaheadTimer.current !== null) {
        window.clearTimeout(typeaheadTimer.current);
      }
      typeaheadTimer.current = window.setTimeout(() => {
        typeahead.current = "";
        typeaheadTimer.current = null;
      }, UI_LIMITS.typeaheadResetMs);
      const match = findTypeaheadMatch(
        visibleIds,
        disabledIds,
        currentId,
        labels,
        typeahead.current,
      );
      if (match !== null) {
        event.preventDefault();
        focusById(match);
      }
    }
  };

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      aria-disabled={props.disabled ? "true" : undefined}
      aria-label={props.accessibleName}
      aria-multiselectable={
        props.selectionMode === "multiple" ? "true" : undefined
      }
      class="ui-tree"
      data-density={props.density}
      id={props.id}
      ref={rootRef}
      role="tree"
    >
      {visible.map((item) => (
        <div
          aria-disabled={item.node.disabled ? "true" : undefined}
          aria-expanded={
            item.node.childIds.length === 0 ? undefined : item.node.expanded
          }
          aria-level={item.level}
          aria-posinset={item.position}
          aria-selected={item.node.selected}
          aria-setsize={item.setSize}
          class="ui-tree__item"
          data-selected={item.node.selected ? "true" : undefined}
          id={nodeDomIds.get(item.node.id)}
          key={item.node.id}
          onClick={(event) => {
            if (props.disabled || props.busy || item.node.disabled) return;
            setRovingActiveId(item.node.id);
            props.onAction({
              action: "activate",
              componentId: props.id,
              itemId: item.node.id,
              source: event.detail === 0 ? "assistive-technology" : "pointer",
              value: "activate",
            });
          }}
          onKeyDown={(event) => {
            onTreeKeyDown(event, item);
          }}
          onFocus={() => {
            if (!props.disabled && !props.busy && !item.node.disabled) {
              setRovingActiveId(item.node.id);
            }
          }}
          role="treeitem"
          style={`--ui-tree-level: ${String(item.level)}`}
          tabIndex={
            !props.disabled &&
            !props.busy &&
            !item.node.disabled &&
            item.node.id === rovingActiveId
              ? 0
              : -1
          }
        >
          {item.node.childIds.length === 0 ? (
            <span aria-hidden="true" class="ui-tree__spacer" />
          ) : (
            <span
              aria-hidden="true"
              class="ui-tree__marker"
              data-tree-expansion-control="true"
              onClick={(event) => {
                event.stopPropagation();
                if (props.disabled || props.busy || item.node.disabled) return;
                setRovingActiveId(item.node.id);
                props.onAction({
                  action: "activate",
                  componentId: props.id,
                  itemId: item.node.id,
                  source: "pointer",
                  value: item.node.expanded ? "collapse" : "expand",
                });
              }}
            >
              {item.node.expanded ? "▾" : "▸"}
            </span>
          )}
          <span>{item.node.label}</span>
        </div>
      ))}
    </div>
  );
}

function panelSizes(props: UiResizablePanelsProps): readonly number[] {
  return props.panels.map((panel) => (panel.collapsed ? 0 : panel.sizePercent));
}

type ResizablePanel = UiResizablePanelsProps["panels"][number];

type PairedPanelBounds = Readonly<{
  maximumPrimary: number;
  minimumPrimary: number;
  total: number;
}>;

const PANEL_KEYBOARD_STEP_PERCENT = 1;
const PANEL_LARGE_KEYBOARD_STEP_PERCENT = 10;

function pairedPanelBounds(
  primary: ResizablePanel,
  complement: ResizablePanel,
): PairedPanelBounds {
  const total = primary.sizePercent + complement.sizePercent;
  return {
    maximumPrimary: Math.min(
      primary.maxPercent,
      total - complement.minPercent,
    ),
    minimumPrimary: Math.max(
      primary.minPercent,
      total - complement.maxPercent,
    ),
    total,
  };
}

function constrainPairedPanelSizes(
  primary: ResizablePanel,
  complement: ResizablePanel,
  desiredPrimary: number,
): readonly [number, number] | null {
  if (!Number.isFinite(desiredPrimary)) return null;
  const bounds = pairedPanelBounds(primary, complement);
  const primarySize = Math.max(
    bounds.minimumPrimary,
    Math.min(bounds.maximumPrimary, desiredPrimary),
  );
  return [primarySize, bounds.total - primarySize];
}

function nearestExpandedPanelIndex(
  panels: UiResizablePanelsProps["panels"],
  index: number,
): number | null {
  for (let candidate = index + 1; candidate < panels.length; candidate += 1) {
    if (panels[candidate]?.collapsed === false) return candidate;
  }
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    if (panels[candidate]?.collapsed === false) return candidate;
  }
  return null;
}

type PanelDrag = Readonly<{
  client: number;
  element: HTMLDivElement;
  index: number;
  pointerId: number;
}>;

function releasePanelPointerCapture(drag: PanelDrag): void {
  if (drag.element.hasPointerCapture(drag.pointerId)) {
    drag.element.releasePointerCapture(drag.pointerId);
  }
}

export function ResizablePanels(props: UiResizablePanelsProps) {
  requireStructuredPropsRecord(props, "resizable-panels");
  requireUiResult(validateUiId("resizable-panels", ["id"], props.id));
  requireUiResult(validateUiCommonProps(props));
  const panels: unknown = props.panels;
  const orientation: unknown = props.orientation;
  if (!Array.isArray(panels)) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["panels"],
      "Resizable panels must be an ordered collection.",
      "Provide a bounded panel array.",
    );
  }
  if (orientation !== "horizontal" && orientation !== "vertical") {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["orientation"],
      "Resizable panel orientation must use a reviewed closed value.",
      "Choose horizontal or vertical orientation.",
    );
  }
  if (
    typeof props.onSizesChange !== "function" ||
    typeof props.onCollapsedIdsChange !== "function"
  ) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["callbacks"],
      "Resizable panel callbacks must be callable.",
      "Provide both controlled value-change boundaries.",
    );
  }
  if (props.panels.length < 2) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["panels"],
      "A resizable panel group requires at least two panels.",
      "Provide between two and eight bounded panels.",
    );
  }
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["panels"],
      props.panels,
      "maxResizablePanels",
    ),
  );
  const ids = new Set<string>([props.id]);
  for (const [index, panel] of props.panels.entries()) {
    const panelValue: unknown = panel;
    if (
      typeof panelValue !== "object" ||
      panelValue === null ||
      Array.isArray(panelValue) ||
      typeof panel.collapsible !== "boolean" ||
      typeof panel.collapsed !== "boolean"
    ) {
      throwRefusal(
        "ui.value_malformed",
        props.id,
        ["panels", index],
        "Every panel must be one record with explicit collapse states.",
        "Provide bounded panel records and boolean collapse state.",
      );
    }
    requireUiResult(validateUiId(props.id, ["panels", index, "id"], panel.id));
    requireUiResult(
      validateUiText(
        props.id,
        ["panels", index, "label"],
        panel.label,
        UI_LIMITS.maxLabelCodePoints,
      ),
    );
    requireUiResult(
      validateFiniteRange(
        props.id,
        panel.sizePercent,
        panel.minPercent,
        panel.maxPercent,
        1,
      ),
    );
    if (panel.minPercent < 0 || panel.maxPercent > 100) {
      throwRefusal(
        "ui.range_invalid",
        props.id,
        ["panels", index, "sizePercent"],
        "Panel percentages must remain within zero through one hundred.",
        "Provide ordered minimum, retained size, and maximum percentages.",
      );
    }
    if (ids.has(panel.id)) {
      throwRefusal(
        "ui.duplicate_item_id",
        props.id,
        ["panels", index, "id"],
        "Resizable panel identities must be unique.",
        "Give every panel a unique stable identity.",
      );
    }
    ids.add(panel.id);
  }
  const collapseInteraction = useInteractionSource<HTMLButtonElement>();
  const numericInteraction = useInteractionSource<HTMLInputElement>();
  const dragStart = useRef<PanelDrag | null>(null);
  const panelDomId = useId();
  const panelLabelIds = props.panels.map(
    (_, index) => `${panelDomId}-label-${String(index)}`,
  );
  const sizes = panelSizes(props);
  const axis = props.orientation === "horizontal" ? "clientX" : "clientY";
  const unavailable = props.disabled || props.busy;

  useEffect(
    () => () => {
      const drag = dragStart.current;
      dragStart.current = null;
      if (drag !== null) releasePanelPointerCapture(drag);
    },
    [],
  );

  const commitPairedSizes = (
    primaryIndex: number,
    complementIndex: number,
    desiredPrimary: number,
    source: UiInteractionSource,
  ) => {
    if (unavailable) return;
    const primary = props.panels[primaryIndex];
    const complement = props.panels[complementIndex];
    if (
      primary === undefined ||
      complement === undefined ||
      primary.collapsed ||
      complement.collapsed
    ) {
      return;
    }
    const constrained = constrainPairedPanelSizes(
      primary,
      complement,
      desiredPrimary,
    );
    if (constrained === null) return;
    const [primarySize, complementSize] = constrained;
    const next = props.panels.map((panel, panelIndex) => {
      if (panel.collapsed) return 0;
      if (panelIndex === primaryIndex) return primarySize;
      if (panelIndex === complementIndex) return complementSize;
      return panel.sizePercent;
    });
    if (next.every((value, index) => value === sizes[index])) return;
    props.onSizesChange({
      componentId: props.id,
      phase: "commit",
      previousValue: sizes,
      source,
      value: next,
    });
  };

  const commitNumericSize = (
    index: number,
    desired: number,
    source: UiInteractionSource,
  ) => {
    const complementIndex = nearestExpandedPanelIndex(props.panels, index);
    if (complementIndex === null) return;
    commitPairedSizes(index, complementIndex, desired, source);
  };

  const cancelDrag = (pointerId: number): void => {
    const drag = dragStart.current;
    if (drag === null || drag.pointerId !== pointerId) return;
    dragStart.current = null;
    releasePanelPointerCapture(drag);
  };

  const finishDrag = (
    event: Parameters<PointerEventHandler<HTMLDivElement>>[0],
  ): void => {
    const drag = dragStart.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragStart.current = null;
    releasePanelPointerCapture(drag);
    if (unavailable) return;
    const deltaCssPx = event[axis] - drag.client;
    if (Math.abs(deltaCssPx) < UI_LIMITS.pointerDragThresholdCssPx) return;
    const container = drag.element.parentElement?.getBoundingClientRect();
    const extent =
      props.orientation === "horizontal" ? container?.width : container?.height;
    if (extent === undefined || extent <= 0) return;
    const panel = props.panels[drag.index];
    if (panel === undefined) return;
    commitPairedSizes(
      drag.index,
      drag.index + 1,
      panel.sizePercent + (deltaCssPx / extent) * 100,
      "pointer",
    );
  };

  const children: JSX.Element[] = [];
  props.panels.forEach((panel, index) => {
    const numericComplementIndex = nearestExpandedPanelIndex(
      props.panels,
      index,
    );
    const numericComplement =
      numericComplementIndex === null
        ? undefined
        : props.panels[numericComplementIndex];
    const numericBounds =
      numericComplement === undefined
        ? null
        : pairedPanelBounds(panel, numericComplement);
    children.push(
      <section
        aria-label={panel.label}
        class="ui-resizable-panels__panel"
        data-collapsed={panel.collapsed ? "true" : undefined}
        id={panel.id}
        key={panel.id}
        style={{
          flexBasis: panel.collapsed ? "0%" : `${String(panel.sizePercent)}%`,
        }}
      >
        <header>
          <span id={panelLabelIds[index]}>{panel.label}</span>
          {panel.collapsible ? (
            <button
              aria-describedby={panelLabelIds[index]}
              aria-label={panel.collapsed ? "Restore panel" : "Collapse panel"}
              disabled={unavailable}
              onBlur={collapseInteraction.reset}
              onClick={(event) => {
                if (unavailable) return;
                const collapsedIds = props.panels
                  .filter((candidate) =>
                    candidate.id === panel.id
                      ? !candidate.collapsed
                      : candidate.collapsed,
                  )
                  .map((candidate) => candidate.id);
                props.onCollapsedIdsChange({
                  componentId: props.id,
                  phase: "commit",
                  previousValue: props.panels
                    .filter((candidate) => candidate.collapsed)
                    .map((candidate) => candidate.id),
                  source: collapseInteraction.take(
                    event.detail === 0
                      ? "assistive-technology"
                      : "pointer",
                  ),
                  value: collapsedIds,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  collapseInteraction.onKeyDown(event);
                }
              }}
              onPointerDown={collapseInteraction.onPointerDown}
              type="button"
            >
              {panel.collapsed ? "Restore" : "Collapse"}
            </button>
          ) : null}
        </header>
        <label class="ui-resizable-panels__numeric">
          <span>Size (%)</span>
          <input
            disabled={
              unavailable || panel.collapsed || numericBounds === null
            }
            max={numericBounds?.maximumPrimary ?? panel.maxPercent}
            min={numericBounds?.minimumPrimary ?? panel.minPercent}
            onBlur={numericInteraction.reset}
            onChange={(event) => {
              if (unavailable || panel.collapsed) return;
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value)) {
                commitNumericSize(
                  index,
                  value,
                  numericInteraction.take("assistive-technology"),
                );
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                numericInteraction.onKeyDown(event);
              }
            }}
            onPointerDown={numericInteraction.onPointerDown}
            step="1"
            type="number"
            value={panel.sizePercent}
          />
        </label>
      </section>,
    );
    const nextPanel = props.panels[index + 1];
    if (nextPanel === undefined) return;
    const separatorUnavailable =
      unavailable || panel.collapsed || nextPanel.collapsed;
    const separatorBounds = pairedPanelBounds(panel, nextPanel);
    const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
      if (separatorUnavailable) {
        event.preventDefault();
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStart.current = {
        client: event[axis],
        element: event.currentTarget,
        index,
        pointerId: event.pointerId,
      };
    };
    children.push(
      <div
        aria-controls={`${panel.id} ${nextPanel.id}`}
        aria-disabled={separatorUnavailable ? "true" : undefined}
        aria-label="Resize adjacent panels"
        aria-orientation={props.orientation}
        aria-valuemax={separatorBounds.maximumPrimary}
        aria-valuemin={separatorBounds.minimumPrimary}
        aria-valuenow={panel.collapsed ? 0 : panel.sizePercent}
        class="ui-resizable-panels__separator"
        key={`${panel.id}-separator`}
        onKeyDown={(event) => {
          const decrement =
            props.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
          const increment =
            props.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
          if (separatorUnavailable) {
            if (
              event.key === decrement ||
              event.key === increment ||
              event.key === "Home" ||
              event.key === "End"
            ) {
              event.preventDefault();
            }
            return;
          }
          const step = event.shiftKey
            ? PANEL_LARGE_KEYBOARD_STEP_PERCENT
            : PANEL_KEYBOARD_STEP_PERCENT;
          let nextValue: number | null = null;
          if (event.key === decrement) nextValue = panel.sizePercent - step;
          if (event.key === increment) nextValue = panel.sizePercent + step;
          if (event.key === "Home") {
            nextValue = separatorBounds.minimumPrimary;
          }
          if (event.key === "End") {
            nextValue = separatorBounds.maximumPrimary;
          }
          if (nextValue !== null) {
            event.preventDefault();
            commitPairedSizes(index, index + 1, nextValue, "keyboard");
          }
        }}
        onPointerCancel={(event) => {
          cancelDrag(event.pointerId);
        }}
        onPointerDown={onPointerDown}
        onLostPointerCapture={(event) => {
          if (dragStart.current?.pointerId === event.pointerId) {
            dragStart.current = null;
          }
        }}
        onPointerUp={finishDrag}
        role="separator"
        tabIndex={separatorUnavailable ? -1 : 0}
      />,
    );
  });

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      aria-disabled={props.disabled ? "true" : undefined}
      class="ui-resizable-panels"
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      data-orientation={props.orientation}
      id={props.id}
    >
      {children}
    </div>
  );
}

export function preflightTimelineLaneProps(props: UiTimelineLaneProps): void {
  requireStructuredPropsRecord(props, "timeline-lane");
  requireUiResult(validateUiId("timeline-lane", ["id"], props.id));
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  const items: unknown = props.items;
  const horizontalScroll: unknown = props.horizontalScroll;
  if (!Array.isArray(items)) {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["items"],
      "Timeline items must be an ordered collection.",
      "Provide a bounded item array.",
    );
  }
  if (horizontalScroll !== true || typeof props.onAction !== "function") {
    throwRefusal(
      "ui.value_malformed",
      props.id,
      ["horizontalScroll", "onAction"],
      "Timeline scroll policy and action callback must use the reviewed shape.",
      "Enable horizontal scrolling and provide a callable action boundary.",
    );
  }
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["items"],
      props.items,
      "maxTimelineItems",
    ),
  );
  const activeId: unknown = props.activeId;
  if (activeId !== null) {
    requireUiResult(validateUiId(props.id, ["activeId"], activeId));
  }
  const ids = new Set<string>([props.id]);
  for (const [index, item] of props.items.entries()) {
    const itemValue: unknown = item;
    if (
      typeof itemValue !== "object" ||
      itemValue === null ||
      Array.isArray(itemValue) ||
      typeof item.selected !== "boolean" ||
      typeof item.disabled !== "boolean"
    ) {
      throwRefusal(
        "ui.value_malformed",
        props.id,
        ["items", index],
        "Every timeline item must be one record with explicit controlled states.",
        "Provide bounded item records and boolean selection/availability state.",
      );
    }
    requireUiResult(validateUiId(props.id, ["items", index, "id"], item.id));
    requireUiResult(
      validateUiText(
        props.id,
        ["items", index, "label"],
        item.label,
        UI_LIMITS.maxLabelCodePoints,
      ),
    );
    requireUiResult(
      validateUiText(
        props.id,
        ["items", index, "exactStart"],
        item.exactStart,
        UI_LIMITS.maxExactValueCodePoints,
      ),
    );
    requireUiResult(
      validateUiText(
        props.id,
        ["items", index, "exactDuration"],
        item.exactDuration,
        UI_LIMITS.maxExactValueCodePoints,
      ),
    );
    if (ids.has(item.id)) {
      throwRefusal(
        "ui.duplicate_item_id",
        props.id,
        ["items", index, "id"],
        "Timeline identities must be unique.",
        "Give every item a unique stable identity.",
      );
    }
    ids.add(item.id);
  }
  const activeItem = props.activeId === null
    ? null
    : props.items.find((item) => item.id === props.activeId);
  if (
    props.activeId !== null &&
    (activeItem === null || activeItem === undefined || activeItem.disabled)
  ) {
    throwRefusal(
      "ui.selection_invalid",
      props.id,
      ["activeId"],
      "The active timeline identity is absent or disabled.",
      "Choose a current enabled timeline item.",
    );
  }
}

export function TimelineLane(props: UiTimelineLaneProps) {
  preflightTimelineLaneProps(props);
  const itemIds = props.items.map((item) => item.id);
  const disabledIds = props.items
    .filter((item) => item.disabled)
    .map((item) => item.id);
  const enabledIds = itemIds.filter((id) => !disabledIds.includes(id));
  const entryActiveId =
    (props.activeId !== null && enabledIds.includes(props.activeId)
      ? props.activeId
      : props.items.find((item) => item.selected && !item.disabled)?.id) ??
    enabledIds[0] ??
    null;
  const [rovingActiveId, setRovingActiveId] = useRovingTabStop(
    props.id,
    props.activeId,
    enabledIds,
    entryActiveId,
  );
  const timelineDomId = useId();
  const timelineItemIds = new Map(
    props.items.map((item, index) => [
      item.id,
      `${timelineDomId}-item-${String(index)}`,
    ]),
  );
  const rootRef = useRef<HTMLElement | null>(null);
  const interaction = useInteractionSource<HTMLButtonElement>();
  const unavailable = props.disabled || props.busy;

  const focusById = (id: string | null): void => {
    if (id === null) return;
    const root = rootRef.current;
    const targetId = timelineItemIds.get(id);
    const target = targetId === undefined
      ? null
      : root?.ownerDocument.getElementById(targetId);
    if (!(target instanceof HTMLElement) || root === null || !root.contains(target)) {
      return;
    }
    setRovingActiveId(id);
    target.focus();
  };

  const recordActivationKey: KeyboardEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      interaction.onKeyDown(event);
    }
  };

  const onItemKeyDown = (
    event: Parameters<KeyboardEventHandler<HTMLButtonElement>>[0],
    itemId: string,
  ): void => {
    recordActivationKey(event);
    if (unavailable || !isRovingKey(event.key)) return;
    const move = moveRovingFocus(
      {
        currentId: itemId,
        disabledIds,
        itemIds,
        orientation: "both",
        ownerId: props.id,
        typeahead: false,
        wrap: false,
      },
      event.key,
    );
    if (!move.consumed) return;
    event.preventDefault();
    interaction.reset();
    focusById(move.currentId);
  };

  const actionSource = (detail: number): UiInteractionSource =>
    interaction.take(detail === 0 ? "assistive-technology" : "pointer");

  return (
    <section
      aria-busy={props.busy ? "true" : undefined}
      aria-disabled={props.disabled ? "true" : undefined}
      aria-label={props.accessibleName}
      class="ui-timeline-lane"
      id={props.id}
      ref={rootRef}
    >
      {props.items.length === 0 ? (
        <p class="ui-timeline-lane__empty">No timeline events</p>
      ) : (
        <ol class="ui-timeline-lane__list">
          {props.items.map((item, index) => (
            <li
              class="ui-timeline-lane__item"
              data-selected={item.selected ? "true" : undefined}
              key={item.id}
            >
              <button
                aria-pressed={item.selected}
                disabled={unavailable || item.disabled}
                id={timelineItemIds.get(item.id)}
                onClick={(event) => {
                  if (unavailable || item.disabled) return;
                  setRovingActiveId(item.id);
                  props.onAction({
                    action: "activate",
                    componentId: props.id,
                    itemId: item.id,
                    source: actionSource(event.detail),
                    value: "activate",
                  });
                }}
                onFocus={() => {
                  if (!unavailable && !item.disabled) {
                    setRovingActiveId(item.id);
                  }
                }}
                onKeyDown={(event) => {
                  onItemKeyDown(event, item.id);
                }}
                onPointerDown={interaction.onPointerDown}
                tabIndex={
                  !unavailable &&
                  !item.disabled &&
                  item.id === rovingActiveId
                    ? 0
                    : -1
                }
                type="button"
              >
                <strong>{item.label}</strong>
                <span>{item.exactStart}</span>
                <span>for {item.exactDuration}</span>
              </button>
              <div class="ui-timeline-lane__actions">
                <button
                  aria-describedby={timelineItemIds.get(item.id)}
                  aria-label="Move earlier"
                  disabled={unavailable || item.disabled || index === 0}
                  onClick={(event) => {
                    if (unavailable || item.disabled || index === 0) return;
                    props.onAction({
                      action: "activate",
                      componentId: props.id,
                      itemId: item.id,
                      source: actionSource(event.detail),
                      value: "move-previous",
                    });
                  }}
                  onKeyDown={recordActivationKey}
                  onPointerDown={interaction.onPointerDown}
                  type="button"
                >
                  ←
                </button>
                <button
                  aria-describedby={timelineItemIds.get(item.id)}
                  aria-label="Move later"
                  disabled={
                    unavailable ||
                    item.disabled ||
                    index === props.items.length - 1
                  }
                  onClick={(event) => {
                    if (
                      unavailable ||
                      item.disabled ||
                      index === props.items.length - 1
                    ) {
                      return;
                    }
                    props.onAction({
                      action: "activate",
                      componentId: props.id,
                      itemId: item.id,
                      source: actionSource(event.detail),
                      value: "move-next",
                    });
                  }}
                  onKeyDown={recordActivationKey}
                  onPointerDown={interaction.onPointerDown}
                  type="button"
                >
                  →
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
