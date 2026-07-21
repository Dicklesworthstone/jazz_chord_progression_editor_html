import type {
  ComponentChildren,
  KeyboardEventHandler,
} from "preact";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import {
  UI_LIMITS,
  type UiAccordionItem,
  type UiAccordionProps,
  type UiBreadcrumbProps,
  type UiCommandItem,
  type UiCommandPaletteProps,
  type UiContextMenuProps,
  type UiInteractionSource,
  type UiMenuItem,
  type UiMenuProps,
  type UiScrollAreaProps,
  type UiTabsProps,
  type UiToolbarProps,
} from "../ui-contract";
import { joinIdReferences } from "./id-references";
import { useInteractionSource } from "./interaction-source";
import {
  acquireOverlaySurface,
  focusCandidatesWithin,
  isFocusableRestoreTarget,
  makeDocumentOutsideSurfaceInert,
  type OverlaySurfaceLease,
} from "../overlays/focus-dismiss";
import {
  findTypeaheadMatch,
  moveRovingFocus,
  preflightRovingFocus,
  type UiRovingKey,
} from "./roving-focus";
import {
  preflightMenuTopology,
  requireUiResult,
  uiDiagnostic,
  validateUiCollectionBound,
  validateUiCommonProps,
  validateUiId,
  validateUiText,
} from "./validation";

export type TabsProps = UiTabsProps;
export type BreadcrumbProps = UiBreadcrumbProps;
export type ToolbarProps = UiToolbarProps<ComponentChildren>;
export type MenuProps = UiMenuProps;
export type ContextMenuProps = UiContextMenuProps;
export type CommandPaletteProps = UiCommandPaletteProps;
export type AccordionProps = UiAccordionProps<ComponentChildren>;
export type ScrollAreaProps = UiScrollAreaProps<ComponentChildren>;

type MenuRecord = Readonly<{
  item: UiMenuItem;
  parentId: string | null;
}>;

const MENU_ITEM_SELECTOR = "[data-ui-menu-item-id]";
const TOOLBAR_TEXT_EDITING_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='slider']",
].join(",");

function refuse(
  code: Parameters<typeof uiDiagnostic>[0],
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
): never {
  const diagnostic = uiDiagnostic(
    code,
    componentId,
    path,
    message,
    recoveryAction,
  );
  return requireUiResult<never>({
    diagnostics: [diagnostic],
    ok: false,
    refusal: diagnostic,
  });
}

function requireId(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  requireUiResult(validateUiId(componentId, path, value));
}

function requireText(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
  maximumCodePoints: number = UI_LIMITS.maxLabelCodePoints,
  allowEmpty = false,
): void {
  requireUiResult(
    validateUiText(componentId, path, value, maximumCodePoints, { allowEmpty }),
  );
}

function requireArray(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): asserts value is readonly unknown[] {
  if (Array.isArray(value)) return;
  refuse(
    "ui.value_malformed",
    componentId,
    path,
    "The UI collection must be an ordered array.",
    "Provide a bounded array of declared records or identities.",
  );
}

function requireRecord(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): asserts value is Readonly<Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return;
  }
  refuse(
    "ui.value_malformed",
    componentId,
    path,
    "The UI collection entry must be one declared record.",
    "Provide a bounded record at every collection position.",
  );
}

function requireBoolean(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  if (typeof value === "boolean") return;
  refuse(
    "ui.value_malformed",
    componentId,
    path,
    "The declared UI state must be boolean.",
    "Provide an explicit boolean state.",
  );
}

function requireCallback(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  if (typeof value === "function") return;
  refuse(
    "ui.value_malformed",
    componentId,
    path,
    "The semantic callback is missing or malformed.",
    "Provide a callable semantic event boundary.",
  );
}

function requireClosedValue(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
  allowed: readonly unknown[],
): void {
  if (allowed.includes(value)) return;
  refuse(
    "ui.value_malformed",
    componentId,
    path,
    "The value is outside the reviewed closed set.",
    "Use one of the declared contract values.",
  );
}

function requireUniqueIds(
  componentId: string,
  path: readonly (string | number)[],
  ids: readonly string[],
): void {
  if (new Set(ids).size !== ids.length) {
    refuse(
      "ui.duplicate_item_id",
      componentId,
      path,
      "The UI collection contains a duplicate stable identity.",
      "Give every item a unique stable identity.",
    );
  }
}

function isRovingKey(value: string): value is UiRovingKey {
  return (
    value === "ArrowDown" ||
    value === "ArrowLeft" ||
    value === "ArrowRight" ||
    value === "ArrowUp" ||
    value === "End" ||
    value === "Home"
  );
}

function isPrintableTypeaheadKey(event: KeyboardEvent): boolean {
  return (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    Array.from(event.key).length === 1
  );
}

function isBoundedCodePointCandidate(
  value: string,
  maximumCodePoints: number,
): boolean {
  let codePoints = 0;
  for (let offset = 0; offset < value.length; offset += 1) {
    const codePoint = value.codePointAt(offset);
    if (codePoint !== undefined && codePoint > 0xffff) offset += 1;
    codePoints += 1;
    if (codePoints > maximumCodePoints) return false;
  }
  return true;
}

function focusElementWithin(
  root: HTMLElement | null,
  id: string | null,
): boolean {
  if (root === null || id === null) return false;
  const candidate = root.ownerDocument.getElementById(id);
  if (!(candidate instanceof HTMLElement) || !root.contains(candidate)) {
    return false;
  }
  candidate.focus();
  return root.ownerDocument.activeElement === candidate;
}

function elementIsUnavailable(element: HTMLElement): boolean {
  return (
    element.matches(":disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.closest("[hidden], [inert], [aria-hidden='true']") !== null
  );
}

function sourceForUntrackedClick(detail: number): UiInteractionSource {
  return detail === 0 ? "assistive-technology" : "pointer";
}

export function preflightTabs(props: TabsProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireText(props.id, ["accessibleName"], props.accessibleName);
  requireClosedValue(
    props.id,
    ["orientation"],
    props.orientation,
    ["horizontal", "vertical"],
  );
  requireClosedValue(props.id, ["activation"], props.activation, ["manual"]);
  requireCallback(props.id, ["onActiveChange"], props.onActiveChange);
  const tabs: unknown = props.tabs;
  requireArray(props.id, ["tabs"], tabs);
  requireUiResult(
    validateUiCollectionBound(props.id, ["tabs"], props.tabs, "maxTabs"),
  );

  const ids: string[] = [];
  const panelIds: string[] = [];
  for (const [index, tab] of props.tabs.entries()) {
    const tabRecord: unknown = tab;
    requireRecord(props.id, ["tabs", index], tabRecord);
    requireId(props.id, ["tabs", index, "id"], tab.id);
    requireId(props.id, ["tabs", index, "panelId"], tab.panelId);
    requireText(props.id, ["tabs", index, "label"], tab.label);
    requireBoolean(props.id, ["tabs", index, "disabled"], tab.disabled);
    ids.push(tab.id);
    panelIds.push(tab.panelId);
  }
  requireUniqueIds(props.id, ["tabs"], [props.id, ...ids, ...panelIds]);

  if (props.activeId !== null) {
    requireId(props.id, ["activeId"], props.activeId);
  }
  if (props.focusedId !== null) {
    requireId(props.id, ["focusedId"], props.focusedId);
  }

  if (props.tabs.length === 0) {
    if (props.activeId === null && props.focusedId === null) return;
    refuse(
      "ui.selection_invalid",
      props.id,
      ["activeId"],
      "An empty Tabs collection cannot retain active or focused identities.",
      "Use null active and focused identities for an empty collection.",
    );
  }

  const activeTab = props.tabs.find((tab) => tab.id === props.activeId);
  if (activeTab === undefined || activeTab.disabled) {
    refuse(
      "ui.selection_invalid",
      props.id,
      ["activeId"],
      "A nonempty Tabs collection requires one current enabled active tab.",
      "Provide the identity of one current enabled tab.",
    );
  }
  if (props.focusedId !== null) {
    const focusedTab = props.tabs.find((tab) => tab.id === props.focusedId);
    if (focusedTab === undefined || focusedTab.disabled) {
      refuse(
        "ui.selection_invalid",
        props.id,
        ["focusedId"],
        "The focused tab identity must name one current enabled tab.",
        "Use a current enabled tab identity or null.",
      );
    }
  }
}

type TabButtonProps = Readonly<{
  active: boolean;
  busy: boolean;
  describedBy: string | undefined;
  disabled: boolean;
  id: string;
  label: string;
  panelId: string;
  tabIndex: number;
  onActivate: (source: UiInteractionSource) => void;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}>;

function TabButton(props: TabButtonProps) {
  const interaction = useInteractionSource<HTMLButtonElement>();

  return (
    <button
      aria-busy={props.busy ? "true" : undefined}
      aria-controls={props.panelId}
      aria-describedby={props.describedBy}
      aria-disabled={props.busy ? "true" : undefined}
      aria-selected={props.active}
      class="ui-tabs__tab"
      data-active={props.active ? "true" : "false"}
      disabled={props.disabled}
      id={props.id}
      onClick={(event) => {
        if (props.disabled || props.busy) {
          event.preventDefault();
          return;
        }
        props.onActivate(
          interaction.take(sourceForUntrackedClick(event.detail)),
        );
      }}
      onKeyDown={(event) => {
        interaction.onKeyDown(event);
        props.onKeyDown(event);
      }}
      onPointerDown={interaction.onPointerDown}
      role="tab"
      tabIndex={props.tabIndex}
      type="button"
    >
      {props.label}
    </button>
  );
}

export function Tabs(props: TabsProps) {
  preflightTabs(props);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemIds = props.tabs.map((tab) => tab.id);
  const disabledIds = props.tabs
    .filter((tab) => tab.disabled || props.disabled || props.busy)
    .map((tab) => tab.id);
  const enabledIds = itemIds.filter((id) => !disabledIds.includes(id));
  const entryId =
    (props.focusedId !== null && enabledIds.includes(props.focusedId)
      ? props.focusedId
      : null) ??
    (props.activeId !== null && enabledIds.includes(props.activeId)
      ? props.activeId
      : null) ??
    enabledIds[0] ??
    null;

  requireUiResult(
    preflightRovingFocus({
      currentId: entryId,
      disabledIds,
      itemIds,
      orientation: props.orientation,
      ownerId: props.id,
      typeahead: false,
      wrap: true,
    }),
  );

  const moveFocus: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (!isRovingKey(event.key)) return;
    const move = moveRovingFocus(
      {
        currentId: event.currentTarget.id,
        disabledIds,
        itemIds,
        orientation: props.orientation,
        ownerId: props.id,
        typeahead: false,
        wrap: true,
      },
      event.key,
    );
    if (!move.consumed) return;
    event.preventDefault();
    const root = rootRef.current;
    if (root !== null) {
      for (const tab of root.querySelectorAll<HTMLElement>("[role='tab']")) {
        tab.tabIndex = tab.id === move.currentId ? 0 : -1;
      }
    }
    focusElementWithin(rootRef.current, move.currentId);
  };

  return (
    <div
      class="ui-tabs"
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      data-orientation={props.orientation}
      ref={rootRef}
    >
      <div
        aria-busy={props.busy ? "true" : undefined}
        aria-label={props.accessibleName}
        aria-orientation={props.orientation}
        class="ui-tabs__list"
        id={props.id}
        role="tablist"
      >
        {props.tabs.map((tab) => (
          <TabButton
            active={tab.id === props.activeId}
            busy={props.busy}
            describedBy={joinIdReferences(props.describedBy)}
            disabled={props.disabled || tab.disabled}
            id={tab.id}
            key={tab.id}
            label={tab.label}
            onActivate={(source) => {
              const root = rootRef.current;
              if (root !== null) {
                for (const candidate of root.querySelectorAll<HTMLElement>(
                  "[role='tab']",
                )) {
                  candidate.tabIndex = candidate.id === tab.id ? 0 : -1;
                }
              }
              if (tab.id === props.activeId) return;
              props.onActiveChange({
                componentId: props.id,
                phase: "commit",
                previousValue: props.activeId,
                source,
                value: tab.id,
              });
            }}
            onKeyDown={moveFocus}
            panelId={tab.panelId}
            tabIndex={tab.id === entryId ? 0 : -1}
          />
        ))}
      </div>
      {props.tabs.length === 0 ? (
        <p class="ui-navigation-empty" role="status">
          No tabs are available.
        </p>
      ) : (
        props.tabs.map((tab) => (
          <div
            aria-labelledby={tab.id}
            class="ui-tabs__panel"
            hidden={tab.id !== props.activeId}
            id={tab.panelId}
            key={tab.panelId}
            role="tabpanel"
            tabIndex={tab.id === props.activeId ? 0 : -1}
          />
        ))
      )}
    </div>
  );
}

function validateBreadcrumb(props: BreadcrumbProps): void {
  requireText("breadcrumb", ["accessibleName"], props.accessibleName);
  const items: unknown = props.items;
  requireArray("breadcrumb", ["items"], items);
  if (props.items.length > UI_LIMITS.maxBreadcrumbItems) {
    refuse(
      "ui.collection_limit",
      "breadcrumb",
      ["items"],
      "The breadcrumb collection exceeds its reviewed bound.",
      "Present at most 64 breadcrumb items.",
    );
  }
  const ids: string[] = [];
  let currentCount = 0;
  for (const [index, item] of props.items.entries()) {
    const itemRecord: unknown = item;
    requireRecord("breadcrumb", ["items", index], itemRecord);
    requireId("breadcrumb", ["items", index, "id"], item.id);
    requireText("breadcrumb", ["items", index, "label"], item.label);
    requireBoolean("breadcrumb", ["items", index, "current"], item.current);
    if (item.href !== null) {
      requireText(
        "breadcrumb",
        ["items", index, "href"],
        item.href,
        UI_LIMITS.maxFragmentHrefCodePoints,
      );
      if (!item.href.startsWith("#") || item.href.length <= 1) {
        refuse(
          "ui.value_malformed",
          "breadcrumb",
          ["items", index, "href"],
          "Breadcrumb destinations must be bounded nonempty local fragments.",
          "Use a local fragment beginning with # and naming one target.",
        );
      }
    }
    ids.push(item.id);
    if (item.current) currentCount += 1;
  }
  requireUniqueIds("breadcrumb", ["items"], ids);
  if (currentCount !== 1) {
    refuse(
      "ui.selection_invalid",
      "breadcrumb",
      ["items", "current"],
      "Exactly one breadcrumb item must identify the current page.",
      "Mark one and only one breadcrumb item as current.",
    );
  }
}

export function Breadcrumb(props: BreadcrumbProps) {
  validateBreadcrumb(props);

  return (
    <nav aria-label={props.accessibleName} class="ui-breadcrumb">
      <ol class="ui-breadcrumb__list">
        {props.items.map((item, index) => (
          <li class="ui-breadcrumb__item" id={item.id} key={item.id}>
            {index > 0 ? (
              <span aria-hidden="true" class="ui-breadcrumb__separator">
                /
              </span>
            ) : null}
            {item.href === null ? (
              <span aria-current={item.current ? "page" : undefined}>
                {item.label}
              </span>
            ) : (
              <a
                aria-current={item.current ? "page" : undefined}
                href={item.href}
              >
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function toolbarItemFromEvent(
  root: HTMLElement,
  target: EventTarget | null,
  itemIds: readonly string[],
): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const identified = target.closest<HTMLElement>("[id]");
  return identified !== null &&
    root.contains(identified) &&
    itemIds.includes(identified.id)
    ? identified
    : null;
}

function toolbarElements(
  root: HTMLElement,
  itemIds: readonly string[],
): readonly HTMLElement[] {
  const elements: HTMLElement[] = [];
  for (const id of itemIds) {
    const element = root.ownerDocument.getElementById(id);
    if (element instanceof HTMLElement && root.contains(element)) {
      elements.push(element);
    }
  }
  return elements;
}

export function preflightToolbar(props: ToolbarProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireText(props.id, ["accessibleName"], props.accessibleName);
  requireClosedValue(
    props.id,
    ["orientation"],
    props.orientation,
    ["horizontal", "vertical"],
  );
  const itemIds: unknown = props.itemIds;
  requireArray(props.id, ["itemIds"], itemIds);
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["itemIds"],
      props.itemIds,
      "maxToolbarItems",
    ),
  );
  for (const [index, id] of props.itemIds.entries()) {
    requireId(props.id, ["itemIds", index], id);
  }
  requireUniqueIds(props.id, ["itemIds"], [props.id, ...props.itemIds]);
  if (props.focusedId !== null) {
    requireId(props.id, ["focusedId"], props.focusedId);
  }
  if (props.focusedId !== null && !props.itemIds.includes(props.focusedId)) {
    refuse(
      "ui.selection_invalid",
      props.id,
      ["focusedId"],
      "The focused toolbar identity is absent from the collection.",
      "Use a current toolbar item identity or null.",
    );
  }
}

export function Toolbar(props: ToolbarProps) {
  preflightToolbar(props);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const elements = toolbarElements(root, props.itemIds);
    const enabled = elements.filter(
      (element) => !props.disabled && !props.busy && !elementIsUnavailable(element),
    );
    const entry =
      enabled.find((element) => element.id === props.focusedId) ??
      enabled[0] ??
      null;
    for (const element of elements) {
      element.tabIndex = element === entry ? 0 : -1;
    }
  }, [
    props.busy,
    props.content,
    props.disabled,
    props.focusedId,
    props.itemIds,
  ]);

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(props.describedBy)}
      aria-label={props.accessibleName}
      aria-orientation={props.itemIds.length >= 3 ? props.orientation : undefined}
      class="ui-toolbar"
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      data-orientation={props.orientation}
      id={props.id}
      onFocus={(event) => {
        const root = rootRef.current;
        if (root === null) return;
        const item = toolbarItemFromEvent(root, event.target, props.itemIds);
        if (item === null || elementIsUnavailable(item)) return;
        for (const element of toolbarElements(root, props.itemIds)) {
          element.tabIndex = element === item ? 0 : -1;
        }
      }}
      onKeyDown={(event) => {
        if (!isRovingKey(event.key) || props.disabled || props.busy) return;
        const root = rootRef.current;
        if (root === null) return;
        const current = toolbarItemFromEvent(root, event.target, props.itemIds);
        if (current === null || current.matches(TOOLBAR_TEXT_EDITING_SELECTOR)) {
          return;
        }
        const elements = toolbarElements(root, props.itemIds);
        const disabledIds = elements
          .filter(elementIsUnavailable)
          .map((element) => element.id);
        const move = moveRovingFocus(
          {
            currentId: current.id,
            disabledIds,
            itemIds: props.itemIds,
            orientation: props.orientation,
            ownerId: props.id,
            typeahead: false,
            wrap: true,
          },
          event.key,
        );
        if (!move.consumed || move.currentId === null) return;
        event.preventDefault();
        for (const element of elements) {
          element.tabIndex = element.id === move.currentId ? 0 : -1;
        }
        focusElementWithin(root, move.currentId);
      }}
      ref={rootRef}
      role={props.itemIds.length >= 3 ? "toolbar" : "group"}
    >
      {props.content}
    </div>
  );
}

function flattenMenu(items: readonly UiMenuItem[]): Readonly<{
  byId: ReadonlyMap<string, MenuRecord>;
  children: ReadonlyMap<string | null, readonly UiMenuItem[]>;
  labels: ReadonlyMap<string, string>;
}> {
  const byId = new Map<string, MenuRecord>();
  const children = new Map<string | null, readonly UiMenuItem[]>();
  const labels = new Map<string, string>();
  const visit = (siblings: readonly UiMenuItem[], parentId: string | null) => {
    children.set(parentId, siblings);
    for (const item of siblings) {
      byId.set(item.id, { item, parentId });
      if (item.kind !== "separator") labels.set(item.id, item.label);
      if (item.kind === "submenu") visit(item.items, item.id);
    }
  };
  visit(items, null);
  return { byId, children, labels };
}

function validateMenu(props: MenuProps | ContextMenuProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireText(props.id, ["accessibleName"], props.accessibleName);
  requireId(props.id, ["triggerId"], props.triggerId);
  requireBoolean(props.id, ["open"], props.open);
  requireCallback(props.id, ["onAction"], props.onAction);
  requireCallback(props.id, ["onOpenChange"], props.onOpenChange);
  requireUiResult(preflightMenuTopology(props.id, props.items));
  const flattened = flattenMenu(props.items);
  requireUniqueIds(
    props.id,
    ["menuIdentityGraph"],
    [props.id, props.triggerId, ...flattened.byId.keys()],
  );
  for (const [id, record] of flattened.byId) {
    if (record.item.kind === "radio") {
      requireId(props.id, ["items", id, "groupId"], record.item.groupId);
    }
  }
  if (props.activeItemId !== null) {
    requireId(props.id, ["activeItemId"], props.activeItemId);
    const active = flattened.byId.get(props.activeItemId)?.item;
    if (active === undefined || active.kind === "separator") {
      refuse(
        "ui.selection_invalid",
        props.id,
        ["activeItemId"],
        "The active menu item is absent or is not focusable.",
        "Use a current actionable menu identity or null.",
      );
    }
  }
}

function validateContextMenu(props: ContextMenuProps): void {
  validateMenu(props);
  requireId(props.id, ["targetId"], props.targetId);
  const topology = flattenMenu(props.items);
  requireUniqueIds(
    props.id,
    ["contextIdentityGraph"],
    [props.id, props.triggerId, props.targetId, ...topology.byId.keys()],
  );
  if (props.anchor === null) return;
  const anchor: unknown = props.anchor;
  requireRecord(props.id, ["anchor"], anchor);
  if (
    !Number.isFinite(props.anchor.clientX) ||
    !Number.isFinite(props.anchor.clientY)
  ) {
    refuse(
      "ui.value_malformed",
      props.id,
      ["anchor"],
      "Context-menu anchor coordinates must be finite numbers.",
      "Provide a finite client-coordinate pair or null.",
    );
  }
}

function actionableMenuItems(items: readonly UiMenuItem[]): readonly UiMenuItem[] {
  return items.filter((item) => item.kind !== "separator");
}

function menuItemDisabled(
  item: UiMenuItem,
  ownerDisabled: boolean,
  ownerBusy: boolean,
): boolean {
  return (
    ownerDisabled ||
    ownerBusy ||
    (item.kind !== "separator" && item.disabled)
  );
}

type MenuImplementationProps = Readonly<{
  context: boolean;
  props: MenuProps | ContextMenuProps;
}>;

function MenuImplementation({ context, props }: MenuImplementationProps) {
  const topology = useMemo(() => flattenMenu(props.items), [props.items]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const interaction = useInteractionSource<HTMLDivElement>();
  const restoreElement = useRef<HTMLElement | null>(null);
  const restoreOnClose = useRef(true);
  const overlayLease = useRef<OverlaySurfaceLease | null>(null);
  const coordinatorCloseRequested = useRef(false);
  const latestMenuState = useRef({
    componentId: props.id,
    onOpenChange: props.onOpenChange,
    open: props.open,
  });
  const wasOpen = useRef(false);
  const typeahead = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(
    props.activeItemId,
  );
  const [openSubmenuIds, setOpenSubmenuIds] = useState<readonly string[]>([]);
  const [contextAnchor, setContextAnchor] = useState<Readonly<{
    clientX: number;
    clientY: number;
  }> | null>(null);
  const [leaseReady, setLeaseReady] = useState(false);
  latestMenuState.current = {
    componentId: props.id,
    onOpenChange: props.onOpenChange,
    open: props.open,
  };

  const contextProps = context ? (props as ContextMenuProps) : null;
  if (contextProps?.anchor !== null && contextProps?.anchor !== undefined) {
    if (
      !Number.isFinite(contextProps.anchor.clientX) ||
      !Number.isFinite(contextProps.anchor.clientY)
    ) {
      refuse(
        "ui.value_malformed",
        props.id,
        ["anchor"],
        "Context-menu coordinates must be finite.",
        "Provide finite viewport coordinates.",
      );
    }
  }
  if (contextProps !== null) {
    requireId(props.id, ["targetId"], contextProps.targetId);
  }

  const effectiveAnchor = contextProps?.anchor ?? contextAnchor;
  const renderOpen = props.open && leaseReady;

  const emitOpenChange = (
    value: boolean,
    source: UiInteractionSource,
    phase: "cancel" | "commit" = "commit",
  ) => {
    if (value === props.open) return;
    props.onOpenChange({
      componentId: props.id,
      phase,
      previousValue: props.open,
      source,
      value,
    });
  };

  const restoreExactFocus = () => {
    const target = restoreElement.current;
    if (target !== null && target.isConnected && !elementIsUnavailable(target)) {
      target.focus();
    }
  };

  const requestClose = (
    source: UiInteractionSource,
    shouldRestore: boolean,
    phase: "cancel" | "commit" = "commit",
  ) => {
    const lease = overlayLease.current;
    let accepted = true;
    if (lease === null) {
      restoreOnClose.current = shouldRestore;
      emitOpenChange(false, source, phase);
    } else {
      accepted = lease.requestDismiss(
        phase === "cancel"
          ? "cancel"
          : shouldRestore
            ? "action-complete"
            : "focus-left",
        source,
      );
      if (accepted) restoreOnClose.current = shouldRestore;
    }
    if (accepted && shouldRestore) restoreExactFocus();
  };

  const firstEnabledChild = (parentId: string | null): string | null => {
    const siblings = actionableMenuItems(topology.children.get(parentId) ?? []);
    return (
      siblings.find(
        (item) => !menuItemDisabled(item, props.disabled, props.busy),
      )?.id ?? null
    );
  };

  const focusMenuItem = (id: string | null) => {
    if (id === null) return;
    setFocusedItemId(id);
    const menu = menuRef.current;
    if (menu !== null) {
      for (const element of menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)) {
        element.tabIndex = element.dataset["uiMenuItemId"] === id ? 0 : -1;
      }
      focusElementWithin(menu, id);
    }
  };

  const openSubmenu = (item: Extract<UiMenuItem, { kind: "submenu" }>) => {
    if (menuItemDisabled(item, props.disabled, props.busy)) return;
    const ancestors: string[] = [];
    let parentId = topology.byId.get(item.id)?.parentId ?? null;
    while (parentId !== null) {
      ancestors.unshift(parentId);
      parentId = topology.byId.get(parentId)?.parentId ?? null;
    }
    setOpenSubmenuIds([...ancestors, item.id]);
    const first = firstEnabledChild(item.id);
    requestAnimationFrame(() => {
      focusMenuItem(first);
    });
  };

  const closeSubmenu = (submenuId: string) => {
    const descendants = new Set<string>();
    const pending = [submenuId];
    while (pending.length > 0) {
      const id = pending.pop();
      if (id === undefined) break;
      descendants.add(id);
      for (const item of topology.children.get(id) ?? []) {
        if (item.kind === "submenu") pending.push(item.id);
      }
    }
    setOpenSubmenuIds((current) =>
      current.filter((id) => !descendants.has(id)),
    );
    requestAnimationFrame(() => {
      focusMenuItem(submenuId);
    });
  };

  const activateItem = (
    item: UiMenuItem,
    source: UiInteractionSource,
  ) => {
    if (item.kind === "separator" || menuItemDisabled(item, props.disabled, props.busy)) {
      return;
    }
    if (item.kind === "submenu") {
      openSubmenu(item);
      return;
    }
    props.onAction({
      action: "activate",
      componentId: props.id,
      itemId: item.id,
      source,
      value: item.id,
    });
    requestClose(source, true);
  };

  const handleTypeahead = (event: KeyboardEvent, currentId: string) => {
    if (!isPrintableTypeaheadKey(event)) return false;
    const next = `${typeahead.current}${event.key}`;
    if (!isBoundedCodePointCandidate(next, UI_LIMITS.maxTypeaheadCodePoints)) {
      event.preventDefault();
      return true;
    }
    typeahead.current = next;
    if (typeaheadTimer.current !== null) clearTimeout(typeaheadTimer.current);
    typeaheadTimer.current = setTimeout(() => {
      typeahead.current = "";
      typeaheadTimer.current = null;
    }, UI_LIMITS.typeaheadResetMs);

    const parentId = topology.byId.get(currentId)?.parentId ?? null;
    const siblings = actionableMenuItems(topology.children.get(parentId) ?? []);
    const itemIds = siblings.map((item) => item.id);
    const disabledIds = siblings
      .filter((item) => menuItemDisabled(item, props.disabled, props.busy))
      .map((item) => item.id);
    const match = findTypeaheadMatch(
      itemIds,
      disabledIds,
      currentId,
      topology.labels,
      typeahead.current,
    );
    if (match !== null) focusMenuItem(match);
    event.preventDefault();
    return true;
  };

  useEffect(() => {
    return () => {
      if (typeaheadTimer.current !== null) clearTimeout(typeaheadTimer.current);
      if (wasOpen.current && restoreOnClose.current) restoreExactFocus();
    };
  }, []);

  useLayoutEffect(() => {
    setLeaseReady(false);
    if (!props.open) {
      coordinatorCloseRequested.current = false;
      return;
    }
    const triggerId = contextProps?.targetId ?? props.triggerId;
    const trigger = document.getElementById(triggerId);
    if (!(trigger instanceof HTMLElement)) {
      if (!coordinatorCloseRequested.current) {
        coordinatorCloseRequested.current = true;
        emitOpenChange(false, "programmatic", "cancel");
      }
      return;
    }
    const acquired = acquireOverlaySurface(trigger.ownerDocument, {
      backgroundRootId: triggerId,
      descriptor: {
        descriptionId: null,
        dismissibility: { kind: "dismissible" },
        id: props.id,
        initialFocusId: props.activeItemId,
        kind: context ? "context-menu" : "menu",
        mode: "nonmodal",
        ownerId: triggerId,
        requestRevision: 0,
        restoreFocusId: props.triggerId,
        titleId: null,
        triggerId,
      },
      getSurface: () => menuRef.current,
      isDismissible: () => true,
      onDismiss: (reason, source) => {
        restoreOnClose.current =
          reason !== "outside-pointer" &&
          reason !== "focus-left" &&
          reason !== "replaced";
        const latest = latestMenuState.current;
        if (!latest.open) return;
        latest.onOpenChange({
          componentId: latest.componentId,
          phase:
            reason === "escape" || reason === "cancel" || reason === "replaced"
              ? "cancel"
              : "commit",
          previousValue: true,
          source,
          value: false,
        });
      },
      outsidePointerDismisses: true,
      transient: "other",
      trigger,
    });
    if (!acquired.ok) {
      if (!coordinatorCloseRequested.current) {
        coordinatorCloseRequested.current = true;
        emitOpenChange(false, "programmatic", "cancel");
      }
      return;
    }
    coordinatorCloseRequested.current = false;
    overlayLease.current = acquired.lease;
    setLeaseReady(true);
    return () => {
      acquired.lease.release();
      if (overlayLease.current === acquired.lease) overlayLease.current = null;
    };
  }, [context, contextProps?.targetId, props.id, props.open, props.triggerId]);

  useEffect(() => {
    if (renderOpen && !wasOpen.current) {
      const trigger = document.getElementById(props.triggerId);
      if (restoreElement.current === null && trigger instanceof HTMLElement) {
        restoreElement.current = trigger;
      }
      const initial =
        props.activeItemId !== null &&
        topology.byId.has(props.activeItemId) &&
        !menuItemDisabled(
          topology.byId.get(props.activeItemId)?.item ?? { id: "", kind: "separator" },
          props.disabled,
          props.busy,
        )
          ? props.activeItemId
          : firstEnabledChild(null);
      const ancestors: string[] = [];
      let parentId = initial === null ? null : topology.byId.get(initial)?.parentId ?? null;
      while (parentId !== null) {
        ancestors.unshift(parentId);
        parentId = topology.byId.get(parentId)?.parentId ?? null;
      }
      setOpenSubmenuIds(ancestors);
      setFocusedItemId(initial);
      requestAnimationFrame(() => {
        focusMenuItem(initial);
      });
    }
    if (!renderOpen && wasOpen.current) {
      setOpenSubmenuIds([]);
      typeahead.current = "";
      if (restoreOnClose.current) restoreExactFocus();
      restoreOnClose.current = true;
    }
    wasOpen.current = renderOpen;
  }, [renderOpen]);

  useEffect(() => {
    if (contextProps === null) return;
    const target = document.getElementById(contextProps.targetId);
    if (!(target instanceof HTMLElement)) return;

    const openAt = (
      clientX: number,
      clientY: number,
      source: UiInteractionSource,
    ) => {
      if (props.disabled || props.busy) return;
      restoreElement.current = target;
      restoreOnClose.current = true;
      setContextAnchor({ clientX, clientY });
      emitOpenChange(true, source);
    };
    const onContextMenu = (event: MouseEvent) => {
      if (props.disabled) return;
      event.preventDefault();
      openAt(event.clientX, event.clientY, "pointer");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
        return;
      }
      if (props.disabled) return;
      event.preventDefault();
      const bounds = target.getBoundingClientRect();
      openAt(bounds.left, bounds.bottom, "keyboard");
    };
    target.addEventListener("contextmenu", onContextMenu);
    target.addEventListener("keydown", onKeyDown);
    return () => {
      target.removeEventListener("contextmenu", onContextMenu);
      target.removeEventListener("keydown", onKeyDown);
    };
  }, [contextProps?.targetId, props.busy, props.disabled, props.open]);

  const renderItems = (items: readonly UiMenuItem[]): ComponentChildren =>
    items.map((item) => {
      if (item.kind === "separator") {
        return <div class="ui-menu__separator" id={item.id} key={item.id} role="separator" />;
      }
      const unavailable = menuItemDisabled(item, props.disabled, props.busy);
      const role =
        item.kind === "checkbox"
          ? "menuitemcheckbox"
          : item.kind === "radio"
            ? "menuitemradio"
            : "menuitem";
      const button = (
        <button
          aria-checked={
            item.kind === "checkbox" || item.kind === "radio"
              ? item.checked
              : undefined
          }
          aria-disabled={unavailable ? "true" : undefined}
          aria-expanded={
            item.kind === "submenu"
              ? openSubmenuIds.includes(item.id)
              : undefined
          }
          aria-haspopup={item.kind === "submenu" ? "menu" : undefined}
          class="ui-menu__item"
          data-active={focusedItemId === item.id ? "true" : undefined}
          data-kind={item.kind}
          data-ui-menu-item-id={item.id}
          id={item.id}
          onClick={(event) => {
            event.stopPropagation();
            activateItem(
              item,
              interaction.take(sourceForUntrackedClick(event.detail)),
            );
          }}
          role={role}
          tabIndex={focusedItemId === item.id && !unavailable ? 0 : -1}
          type="button"
        >
          <span aria-hidden="true" class="ui-menu__mark">
            {(item.kind === "checkbox" || item.kind === "radio") && item.checked
              ? "✓"
              : ""}
          </span>
          <span class="ui-menu__label">{item.label}</span>
          {item.kind === "submenu" ? (
            <span aria-hidden="true" class="ui-menu__submenu-cue">
              ›
            </span>
          ) : null}
        </button>
      );
      if (item.kind !== "submenu") return button;
      const submenuOpen = openSubmenuIds.includes(item.id);
      return (
        <div class="ui-menu__submenu-owner" key={item.id} role="none">
          {button}
          <div
            aria-labelledby={item.id}
            class="ui-menu__surface ui-menu__surface--nested"
            hidden={!submenuOpen}
            role="menu"
          >
            {renderItems(item.items)}
          </div>
        </div>
      );
    });

  return (
    <div
      class="ui-menu"
      data-context={context ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      onKeyDown={(event) => {
        interaction.onKeyDown(event);
        if (event.target instanceof HTMLElement && event.target.id === props.triggerId) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!renderOpen) {
              restoreElement.current = event.target;
              emitOpenChange(true, "keyboard");
            } else {
              focusMenuItem(firstEnabledChild(null));
            }
          }
          return;
        }
        if (!renderOpen) return;
        if (event.key === "Tab") {
          requestClose("keyboard", false);
          return;
        }
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>(MENU_ITEM_SELECTOR)
            : null;
        if (target === null) return;
        const current = topology.byId.get(target.id);
        if (current === undefined || current.item.kind === "separator") return;

        if (event.key === "ArrowRight" && current.item.kind === "submenu") {
          event.preventDefault();
          openSubmenu(current.item);
          return;
        }
        if (event.key === "ArrowLeft" && current.parentId !== null) {
          event.preventDefault();
          closeSubmenu(current.parentId);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateItem(current.item, "keyboard");
          return;
        }
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Home" ||
          event.key === "End"
        ) {
          const siblings = actionableMenuItems(
            topology.children.get(current.parentId) ?? [],
          );
          const itemIds = siblings.map((item) => item.id);
          const disabledIds = siblings
            .filter((item) => menuItemDisabled(item, props.disabled, props.busy))
            .map((item) => item.id);
          const move = moveRovingFocus(
            {
              currentId: current.item.id,
              disabledIds,
              itemIds,
              orientation: "vertical",
              ownerId: props.id,
              typeahead: true,
              wrap: true,
            },
            event.key,
          );
          if (move.consumed) {
            event.preventDefault();
            focusMenuItem(move.currentId);
          }
          return;
        }
        handleTypeahead(event, current.item.id);
      }}
      onPointerDown={interaction.onPointerDown}
      ref={wrapperRef}
    >
      <button
        aria-busy={props.busy ? "true" : undefined}
        aria-controls={props.id}
        aria-describedby={joinIdReferences(props.describedBy)}
        aria-disabled={props.busy ? "true" : undefined}
        aria-expanded={renderOpen}
        aria-haspopup="menu"
        class="ui-menu__trigger"
        disabled={props.disabled}
        id={props.triggerId}
        onClick={(event) => {
          if (props.disabled || props.busy) {
            event.preventDefault();
            return;
          }
          restoreElement.current = event.currentTarget;
          restoreOnClose.current = true;
          if (contextProps !== null && effectiveAnchor === null) {
            const target = document.getElementById(contextProps.targetId);
            const bounds = target?.getBoundingClientRect();
            if (bounds !== undefined) {
              setContextAnchor({ clientX: bounds.left, clientY: bounds.bottom });
            }
          }
          const source = interaction.take(sourceForUntrackedClick(event.detail));
          if (props.open) requestClose(source, true);
          else emitOpenChange(true, source);
        }}
        type="button"
      >
        {props.accessibleName}
        <span aria-hidden="true" class="ui-menu__trigger-cue">
          ▾
        </span>
      </button>
      {renderOpen ? (
        <div
          aria-label={props.accessibleName}
          class={`ui-menu__surface${context ? " ui-menu__surface--context" : ""}`}
          id={props.id}
          ref={menuRef}
          role="menu"
          style={
            context && effectiveAnchor !== null
              ? {
                  insetBlockStart: `${String(effectiveAnchor.clientY)}px`,
                  insetInlineStart: `${String(effectiveAnchor.clientX)}px`,
                }
              : undefined
          }
        >
          {props.items.length === 0 ? (
            <div class="ui-navigation-empty" role="none">
              No commands are available.
            </div>
          ) : (
            renderItems(props.items)
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Menu(props: MenuProps) {
  validateMenu(props);
  return <MenuImplementation context={false} props={props} />;
}

export function ContextMenu(props: ContextMenuProps) {
  validateContextMenu(props);
  return <MenuImplementation context props={props} />;
}

export function preflightCommandPalette(props: CommandPaletteProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireText(props.id, ["accessibleName"], props.accessibleName);
  requireText(
    props.id,
    ["query"],
    props.query,
    UI_LIMITS.maxTextValueCodePoints,
    true,
  );
  requireBoolean(props.id, ["open"], props.open);
  requireCallback(props.id, ["onQueryChange"], props.onQueryChange);
  requireCallback(props.id, ["onAction"], props.onAction);
  requireCallback(props.id, ["onOpenChange"], props.onOpenChange);
  const items: unknown = props.items;
  requireArray(props.id, ["items"], items);
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["items"],
      props.items,
      "maxCommandItems",
    ),
  );
  const ids: string[] = [];
  for (const [index, item] of props.items.entries()) {
    const itemRecord: unknown = item;
    requireRecord(props.id, ["items", index], itemRecord);
    requireId(props.id, ["items", index, "id"], item.id);
    requireText(props.id, ["items", index, "label"], item.label);
    requireBoolean(props.id, ["items", index, "disabled"], item.disabled);
    if (item.description !== null) {
      requireText(
        props.id,
        ["items", index, "description"],
        item.description,
        UI_LIMITS.maxDescriptionCodePoints,
      );
    }
    const keywords: unknown = item.keywords;
    requireArray(props.id, ["items", index, "keywords"], keywords);
    requireUiResult(
      validateUiCollectionBound(
        props.id,
        ["items", index, "keywords"],
        item.keywords,
        "maxCommandKeywords",
      ),
    );
    for (const [keywordIndex, keyword] of item.keywords.entries()) {
      requireText(
        props.id,
        ["items", index, "keywords", keywordIndex],
        keyword,
        UI_LIMITS.maxKeywordCodePoints,
      );
    }
    ids.push(item.id);
  }
  requireUniqueIds(props.id, ["items"], [props.id, ...ids]);
  if (props.activeItemId !== null && !ids.includes(props.activeItemId)) {
    requireId(props.id, ["activeItemId"], props.activeItemId);
    refuse(
      "ui.selection_invalid",
      props.id,
      ["activeItemId"],
      "The active command is absent from the current collection.",
      "Use a current command identity or null.",
    );
  }
}

function commandMatches(item: UiCommandItem, query: string): boolean {
  const folded = query.trim().toLowerCase();
  if (folded.length === 0) return true;
  return [item.label, item.description ?? "", ...item.keywords].some((value) =>
    value.toLowerCase().includes(folded),
  );
}

function isBoundedCommandQuery(value: string): boolean {
  let codePoints = 0;
  for (let offset = 0; offset < value.length; offset += 1) {
    const codePoint = value.codePointAt(offset);
    if (codePoint !== undefined && codePoint > 0xffff) offset += 1;
    codePoints += 1;
    if (codePoints > UI_LIMITS.maxTextValueCodePoints) return false;
  }
  return true;
}

export function CommandPalette(props: CommandPaletteProps) {
  preflightCommandPalette(props);
  const generatedId = useId();
  const resultsId = `${generatedId}-command-results`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreElement = useRef<HTMLElement | null>(null);
  const overlayLease = useRef<OverlaySurfaceLease | null>(null);
  const activeSurfaceCleanup = useRef<(() => void) | null>(null);
  const preflightCloseRequested = useRef(false);
  const closeRequested = useRef(false);
  const latestOpenState = useRef({
    componentId: props.id,
    onOpenChange: props.onOpenChange,
    open: props.open,
  });
  const [modalLeaseReady, setModalLeaseReady] = useState(false);
  const interaction = useInteractionSource<HTMLDivElement>();
  latestOpenState.current = {
    componentId: props.id,
    onOpenChange: props.onOpenChange,
    open: props.open,
  };
  const filteredItems = useMemo(
    () => props.items.filter((item) => commandMatches(item, props.query)),
    [props.items, props.query],
  );
  const enabledIds = filteredItems
    .filter((item) => !item.disabled && !props.disabled && !props.busy)
    .map((item) => item.id);
  const [activeId, setActiveId] = useState<string | null>(
    props.activeItemId !== null && enabledIds.includes(props.activeItemId)
      ? props.activeItemId
      : enabledIds[0] ?? null,
  );

  useEffect(() => {
    const requested =
      props.activeItemId !== null && enabledIds.includes(props.activeItemId)
        ? props.activeItemId
        : null;
    setActiveId((current) =>
      current !== null && enabledIds.includes(current)
        ? current
        : requested ?? enabledIds[0] ?? null,
    );
  }, [props.activeItemId, props.busy, props.disabled, filteredItems]);

  const restoreCapturedTrigger = (): boolean => {
    const target = restoreElement.current;
    restoreElement.current = null;
    if (target === null || !isFocusableRestoreTarget(target)) return false;
    target.focus();
    return target.ownerDocument.activeElement === target;
  };

  const releaseOverlayOwnership = (): void => {
    const lease = overlayLease.current;
    overlayLease.current = null;
    lease?.release();
  };

  const requestPreflightClose = (): void => {
    const latest = latestOpenState.current;
    if (preflightCloseRequested.current || !latest.open) return;
    preflightCloseRequested.current = true;
    latest.onOpenChange({
      componentId: latest.componentId,
      phase: "cancel",
      previousValue: true,
      source: "programmatic",
      value: false,
    });
  };

  const retireRefusedModal = (): void => {
    const cleanup = activeSurfaceCleanup.current;
    activeSurfaceCleanup.current = null;
    if (cleanup === null) restoreCapturedTrigger();
    else cleanup();
    releaseOverlayOwnership();
    setModalLeaseReady(false);
    requestPreflightClose();
  };

  useLayoutEffect(() => {
    if (!props.open) {
      preflightCloseRequested.current = false;
      closeRequested.current = false;
      setModalLeaseReady(false);
      return;
    }

    preflightCloseRequested.current = false;
    const capturedTrigger = document.activeElement;
    if (
      !(capturedTrigger instanceof HTMLElement) ||
      !isFocusableRestoreTarget(capturedTrigger)
    ) {
      retireRefusedModal();
      return;
    }
    restoreElement.current = capturedTrigger;

    closeRequested.current = false;
    const descriptorTriggerId = props.id;
    const lease = acquireOverlaySurface(document, {
      backgroundRootId: descriptorTriggerId,
      descriptor: {
        descriptionId: null,
        dismissibility: { kind: "dismissible" },
        id: props.id,
        initialFocusId: null,
        kind: "command-palette",
        mode: "modal",
        ownerId: descriptorTriggerId,
        requestRevision: 0,
        restoreFocusId: descriptorTriggerId,
        titleId: null,
        triggerId: descriptorTriggerId,
      },
      getSurface: () => rootRef.current,
      isDismissible: () => !closeRequested.current,
      onDismiss: (_reason, source) => {
        const latest = latestOpenState.current;
        if (!latest.open || closeRequested.current) return;
        closeRequested.current = true;
        latest.onOpenChange({
          componentId: latest.componentId,
          phase: "cancel",
          previousValue: true,
          source,
          value: false,
        });
      },
      outsidePointerDismisses: false,
      transient: null,
      trigger: capturedTrigger,
    });
    if (!lease.ok) {
      retireRefusedModal();
      return;
    }
    overlayLease.current = lease.lease;
    setModalLeaseReady(true);
    return () => {
      if (overlayLease.current === lease.lease) overlayLease.current = null;
      lease.lease.release();
    };
  }, [props.id, props.open]);

  const renderModal = props.open && modalLeaseReady;
  useLayoutEffect(() => {
    if (!renderModal) return;
    const surface = rootRef.current;
    const input = inputRef.current;
    if (surface === null || input === null) {
      retireRefusedModal();
      return;
    }

    const inertLease = makeDocumentOutsideSurfaceInert(surface, props.id);
    if (!inertLease.ok) {
      retireRefusedModal();
      return;
    }

    let cleaned = false;
    let containFocus: ((event: FocusEvent) => void) | null = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (containFocus !== null) {
        surface.ownerDocument.removeEventListener("focusin", containFocus);
      }
      inertLease.release();
      restoreCapturedTrigger();
    };
    activeSurfaceCleanup.current = cleanup;

    const candidates = focusCandidatesWithin(surface, props.id);
    if (!candidates.ok || !candidates.candidates.includes(input)) {
      retireRefusedModal();
      return;
    }
    input.focus();
    if (surface.ownerDocument.activeElement !== input) {
      retireRefusedModal();
      return;
    }

    containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && surface.contains(event.target)) return;
      const refreshed = focusCandidatesWithin(surface, props.id);
      if (!refreshed.ok || !refreshed.candidates.includes(input)) {
        retireRefusedModal();
        return;
      }
      input.focus();
      if (surface.ownerDocument.activeElement !== input) retireRefusedModal();
    };
    surface.ownerDocument.addEventListener("focusin", containFocus);

    return () => {
      if (activeSurfaceCleanup.current === cleanup) {
        activeSurfaceCleanup.current = null;
      }
      cleanup();
    };
  }, [props.disabled, props.id, renderModal]);

  if (!renderModal) return null;

  const emitOpenChange = (
    value: boolean,
    source: UiInteractionSource,
    phase: "cancel" | "commit" = "commit",
  ) => {
    if (value === props.open) return;
    props.onOpenChange({
      componentId: props.id,
      phase,
      previousValue: props.open,
      source,
      value,
    });
  };

  const activate = (id: string, source: UiInteractionSource) => {
    const item = filteredItems.find((candidate) => candidate.id === id);
    if (item === undefined || item.disabled || props.disabled || props.busy) return;
    props.onAction({
      action: "activate",
      componentId: props.id,
      itemId: item.id,
      source,
      value: item.id,
    });
    closeRequested.current = true;
    emitOpenChange(false, source);
  };

  return (
    <div class="ui-command-palette__backdrop" data-density={props.density}>
      <div
        aria-busy={props.busy ? "true" : undefined}
        aria-describedby={joinIdReferences(props.describedBy)}
        aria-label={props.accessibleName}
        aria-modal="true"
        class="ui-command-palette"
        data-invalid={props.invalid ? "true" : undefined}
        id={props.id}
        onKeyDown={(event) => {
          interaction.onKeyDown(event);
          if (event.key === "Tab") {
            const root = rootRef.current;
            if (root === null) return;
            const candidates = focusCandidatesWithin(root, props.id);
            if (!candidates.ok || candidates.candidates.length === 0) {
              event.preventDefault();
              retireRefusedModal();
              return;
            }
            const first = candidates.candidates[0];
            const last = candidates.candidates.at(-1);
            if (
              event.shiftKey &&
              (document.activeElement === first || document.activeElement === root)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
        onPointerDown={interaction.onPointerDown}
        ref={rootRef}
        role="dialog"
      >
        <div class="ui-command-palette__header">
          <input
            aria-activedescendant={activeId ?? undefined}
            aria-autocomplete="list"
            aria-controls={resultsId}
            aria-expanded="true"
            aria-label="Search commands"
            class="ui-command-palette__input"
            disabled={props.disabled}
            onInput={(event) => {
              if (props.disabled || props.busy) return;
              if (!isBoundedCommandQuery(event.currentTarget.value)) return;
              props.onQueryChange({
                componentId: props.id,
                phase: "commit",
                previousValue: props.query,
                source: interaction.take("keyboard"),
                value: event.currentTarget.value,
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const move = moveRovingFocus(
                  {
                    currentId: activeId,
                    disabledIds: [],
                    itemIds: enabledIds,
                    orientation: "vertical",
                    ownerId: props.id,
                    typeahead: false,
                    wrap: true,
                  },
                  event.key,
                );
                if (move.consumed) {
                  event.preventDefault();
                  setActiveId(move.currentId);
                }
                return;
              }
              if (event.key === "Enter" && activeId !== null) {
                event.preventDefault();
                activate(activeId, "keyboard");
              }
            }}
            placeholder="Type a command"
            ref={inputRef}
            role="combobox"
            type="search"
            value={props.query}
          />
          <button
            aria-label="Close command palette"
            class="ui-command-palette__close"
            disabled={props.disabled || props.busy}
            onClick={(event) => {
              overlayLease.current?.requestDismiss(
                "cancel",
                interaction.take(sourceForUntrackedClick(event.detail)),
              );
            }}
            type="button"
          >
            Close
          </button>
        </div>
        <div
          aria-label="Command results"
          class="ui-command-palette__results"
          id={resultsId}
          role="listbox"
        >
          {filteredItems.length === 0 ? (
            <p class="ui-navigation-empty" role="status">
              No matching commands.
            </p>
          ) : (
            filteredItems.map((item) => {
              const unavailable = props.disabled || props.busy || item.disabled;
              return (
                <div
                  aria-disabled={unavailable ? "true" : undefined}
                  aria-selected={activeId === item.id}
                  class="ui-command-palette__option"
                  data-active={activeId === item.id ? "true" : undefined}
                  id={item.id}
                  key={item.id}
                  onClick={() => {
                    activate(item.id, interaction.take("pointer"));
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (!unavailable) setActiveId(item.id);
                  }}
                  role="option"
                >
                  <span class="ui-command-palette__option-label">{item.label}</span>
                  {item.description === null ? null : (
                    <span class="ui-command-palette__option-description">
                      {item.description}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function preflightAccordion(props: AccordionProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireText(props.id, ["accessibleName"], props.accessibleName);
  requireClosedValue(
    props.id,
    ["selectionMode"],
    props.selectionMode,
    ["single", "multiple"],
  );
  requireCallback(
    props.id,
    ["onExpandedIdsChange"],
    props.onExpandedIdsChange,
  );
  const items: unknown = props.items;
  requireArray(props.id, ["items"], items);
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["items"],
      props.items,
      "maxAccordionItems",
    ),
  );
  const ids: string[] = [];
  const panelIds: string[] = [];
  let expandedCount = 0;
  for (const [index, item] of props.items.entries()) {
    const itemRecord: unknown = item;
    requireRecord(props.id, ["items", index], itemRecord);
    requireId(props.id, ["items", index, "id"], item.id);
    requireId(props.id, ["items", index, "panelId"], item.panelId);
    requireText(props.id, ["items", index, "label"], item.label);
    requireClosedValue(
      props.id,
      ["items", index, "headingLevel"],
      item.headingLevel,
      [2, 3, 4, 5, 6],
    );
    requireBoolean(props.id, ["items", index, "expanded"], item.expanded);
    requireBoolean(props.id, ["items", index, "disabled"], item.disabled);
    ids.push(item.id);
    panelIds.push(item.panelId);
    if (item.expanded) expandedCount += 1;
  }
  requireUniqueIds(props.id, ["items"], [props.id, ...ids, ...panelIds]);
  if (props.focusedId !== null) {
    requireId(props.id, ["focusedId"], props.focusedId);
  }
  if (props.focusedId !== null && !ids.includes(props.focusedId)) {
    refuse(
      "ui.selection_invalid",
      props.id,
      ["focusedId"],
      "The focused Accordion identity is absent from the collection.",
      "Use a current Accordion item identity or null.",
    );
  }
  if (props.selectionMode === "single" && expandedCount > 1) {
    refuse(
      "ui.selection_invalid",
      props.id,
      ["items", "expanded"],
      "A single-expansion Accordion cannot have multiple expanded items.",
      "Keep at most one item expanded.",
    );
  }
}

type AccordionHeaderProps = Readonly<{
  busy: boolean;
  describedBy: string | undefined;
  disabled: boolean;
  item: UiAccordionItem<ComponentChildren>;
  invalid: boolean;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onToggle: (source: UiInteractionSource) => void;
}>;

function AccordionHeading({
  busy,
  describedBy,
  disabled,
  invalid,
  item,
  onKeyDown,
  onToggle,
}: AccordionHeaderProps) {
  const interaction = useInteractionSource<HTMLButtonElement>();
  const trigger = (
    <button
      aria-busy={busy ? "true" : undefined}
      aria-controls={item.panelId}
      aria-describedby={describedBy}
      aria-disabled={busy ? "true" : undefined}
      aria-expanded={item.expanded}
      class="ui-accordion__trigger"
      data-invalid={invalid ? "true" : undefined}
      disabled={disabled}
      id={item.id}
      onClick={(event) => {
        if (disabled || busy) {
          event.preventDefault();
          return;
        }
        onToggle(interaction.take(sourceForUntrackedClick(event.detail)));
      }}
      onKeyDown={(event) => {
        interaction.onKeyDown(event);
        onKeyDown(event);
      }}
      onPointerDown={interaction.onPointerDown}
      type="button"
    >
      <span aria-hidden="true" class="ui-accordion__cue">
        {item.expanded ? "−" : "+"}
      </span>
      <span>{item.label}</span>
    </button>
  );

  switch (item.headingLevel) {
    case 2:
      return <h2 class="ui-accordion__heading">{trigger}</h2>;
    case 3:
      return <h3 class="ui-accordion__heading">{trigger}</h3>;
    case 4:
      return <h4 class="ui-accordion__heading">{trigger}</h4>;
    case 5:
      return <h5 class="ui-accordion__heading">{trigger}</h5>;
    case 6:
      return <h6 class="ui-accordion__heading">{trigger}</h6>;
  }
}

export function Accordion(props: AccordionProps) {
  preflightAccordion(props);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemIds = props.items.map((item) => item.id);
  const disabledIds = props.items
    .filter((item) => item.disabled || props.disabled || props.busy)
    .map((item) => item.id);
  requireUiResult(
    preflightRovingFocus({
      currentId: props.focusedId,
      disabledIds,
      itemIds,
      orientation: "vertical",
      ownerId: props.id,
      typeahead: false,
      wrap: true,
    }),
  );
  const expandedIds = props.items
    .filter((item) => item.expanded)
    .map((item) => item.id);

  const moveFocus: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const move = moveRovingFocus(
      {
        currentId: event.currentTarget.id,
        disabledIds,
        itemIds,
        orientation: "vertical",
        ownerId: props.id,
        typeahead: false,
        wrap: true,
      },
      event.key,
    );
    if (!move.consumed) return;
    event.preventDefault();
    focusElementWithin(rootRef.current, move.currentId);
  };

  return (
    <div
      aria-label={props.accessibleName}
      class="ui-accordion"
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      id={props.id}
      ref={rootRef}
    >
      {props.items.length === 0 ? (
        <p class="ui-navigation-empty" role="status">
          No sections are available.
        </p>
      ) : (
        props.items.map((item) => (
          <div
            class="ui-accordion__item"
            data-expanded={item.expanded ? "true" : "false"}
            key={item.id}
          >
            <AccordionHeading
              busy={props.busy}
              describedBy={joinIdReferences(props.describedBy)}
              disabled={props.disabled || item.disabled}
              invalid={props.invalid}
              item={item}
              onKeyDown={moveFocus}
              onToggle={(source) => {
                const next = item.expanded
                  ? expandedIds.filter((id) => id !== item.id)
                  : props.selectionMode === "single"
                    ? [item.id]
                    : [...expandedIds, item.id];
                props.onExpandedIdsChange({
                  componentId: props.id,
                  phase: "commit",
                  previousValue: expandedIds,
                  source,
                  value: next,
                });
              }}
            />
            <div
              aria-labelledby={item.id}
              class="ui-accordion__panel"
              hidden={!item.expanded}
              id={item.panelId}
              role="region"
            >
              {item.content}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function validateScrollArea(props: ScrollAreaProps): void {
  requireId(props.id, ["id"], props.id);
  requireClosedValue(
    props.id,
    ["orientation"],
    props.orientation,
    ["horizontal", "vertical", "both"],
  );
  requireClosedValue(
    props.id,
    ["nativeScrollbar"],
    props.nativeScrollbar,
    [true],
  );
  if (props.accessibleName !== null) {
    requireText(props.id, ["accessibleName"], props.accessibleName);
  }
}

export function ScrollArea(props: ScrollAreaProps) {
  validateScrollArea(props);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [needsOwnTabStop, setNeedsOwnTabStop] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const childFocusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, [tabindex]",
      ),
    ).some((element) => element.tabIndex >= 0 && !elementIsUnavailable(element));
    setNeedsOwnTabStop(!childFocusable);
  }, [props.content]);

  return (
    <div
      aria-label={props.accessibleName ?? undefined}
      class="ui-scroll-area"
      data-orientation={props.orientation}
      id={props.id}
      ref={rootRef}
      role={props.accessibleName === null ? undefined : "region"}
      tabIndex={needsOwnTabStop ? 0 : undefined}
    >
      {props.content}
    </div>
  );
}
