import { describe, expect, test } from "bun:test";

import {
  Accordion,
  Badge,
  Breadcrumb,
  CommandPalette,
  DataTable,
  Kbd,
  KeyValueList,
  preflightAccordion,
  preflightCommandPalette,
  preflightEmptyStateProps,
  preflightInputProps,
  preflightLinkButton,
  preflightTabs,
  preflightTimelineLaneProps,
  preflightToastNoticeProps,
  preflightToolbar,
  preflightTooltipProps,
  Progress,
  ResizablePanels,
  Skeleton,
  Tabs,
  TimelineLane,
  ToastNotice,
  ToggleGroup,
  Toolbar,
} from "../../src/ui";
import { advanceListboxTypeahead, Textarea } from "../../src/ui/primitives/Forms";
import { focusCandidatesWithin } from "../../src/ui/overlays/focus-dismiss";
import {
  preflightMenuTopology,
  preflightRovingFocus,
  preflightTreeTopology,
  uiDiagnostic,
  UiContractError,
  validateFiniteRange,
  validateUiCollectionBound,
  validateUiCollectionProductBound,
  validateUiCommonProps,
  validateUiDiagnostics,
  validateUiId,
  validateUiOptions,
  validateUiText,
} from "../../src/ui/primitives";
import {
  UI_ACCESSIBILITY_POLICY,
  UI_LIMITS,
  UI_RESPONSIVE_LAYOUTS,
  type UiDiagnostic,
  type UiMenuItem,
  type UiOption,
  type UiRefusalCode,
  type UiResult,
  type UiTreeNode,
} from "../../src/ui/ui-contract";
import { FocusDismissLayer } from "../../src/ui/overlays";

type LimitKey = keyof typeof UI_LIMITS;

type LimitCase = Readonly<{
  id: string;
  kind: "limit";
  limitKey: LimitKey;
  atLimitInput: number;
  plusOneInput: number;
  refusal: UiRefusalCode;
}>;

type ThresholdCase = Readonly<{
  id: string;
  kind: "limit";
  limitKey: LimitKey;
  belowInput: number;
  atThresholdInput: number;
  aboveInput: number;
}>;

type TopologyCase = Readonly<{
  id: string;
  kind: "positive" | "malformed" | "limit";
  subject: string;
  refusal: UiRefusalCode | null;
}>;

type MatrixFixture = Readonly<{
  cases: readonly (LimitCase | ThresholdCase | Readonly<{ id: string; kind: string }>)[];
  topologyCases: readonly TopologyCase[];
  menuTopologyCases: readonly TopologyCase[];
}>;

const matrix = await Bun.file(
  new URL("../fixtures/ui/primitive-state-matrix.json", import.meta.url),
).json() as MatrixFixture;

const limitCases = matrix.cases.filter(
  (candidate): candidate is LimitCase =>
    candidate.id.startsWith("U0-LIM-") &&
    "atLimitInput" in candidate &&
    "plusOneInput" in candidate &&
    "refusal" in candidate,
);
const thresholdCases = matrix.cases.filter(
  (candidate): candidate is ThresholdCase =>
    candidate.id.startsWith("U0-THRESH-") &&
    "belowInput" in candidate &&
    "atThresholdInput" in candidate &&
    "aboveInput" in candidate,
);

const noop = () => undefined;
const COMMON = Object.freeze({
  busy: false,
  density: "comfortable",
  describedBy: Object.freeze([]),
  disabled: false,
  id: "owner",
  invalid: false,
} as const);

function refusalCode<Value>(result: UiResult<Value>): UiRefusalCode | null {
  return result.ok ? null : result.refusal.code;
}

function invokeRefusal(
  boundary: unknown,
  props: unknown,
): UiRefusalCode | null {
  if (typeof boundary !== "function") throw new Error("Boundary is not callable");
  try {
    Reflect.apply(boundary, undefined, [props]);
    return null;
  } catch (error) {
    if (error instanceof UiContractError) return error.diagnostic.code;
    throw error;
  }
}

function codePoints(length: number): string {
  return "𝄞".repeat(length);
}

function ids(length: number, prefix = "id"): readonly string[] {
  return Array.from({ length }, (_, index) => `${prefix}-${String(index)}`);
}

function options(length: number): readonly UiOption[] {
  return Array.from({ length }, (_, index) => ({
    description: null,
    disabled: false,
    id: `option-${String(index)}`,
    label: `Option ${String(index)}`,
    value: `value-${String(index)}`,
  }));
}

function actionItem(index: number): UiMenuItem {
  return {
    disabled: false,
    id: `action-${String(index)}`,
    kind: "action",
    label: `Action ${String(index)}`,
  };
}

function deepMenu(depth: number, flattenedItems = depth): readonly UiMenuItem[] {
  let child: UiMenuItem = actionItem(0);
  for (let level = depth - 1; level >= 1; level -= 1) {
    const finalLevel = level === depth - 1;
    const extraCount = finalLevel ? flattenedItems - depth : 0;
    const children = [
      child,
      ...Array.from({ length: extraCount }, (_, index) =>
        actionItem(index + 1),
      ),
    ];
    child = {
      disabled: false,
      id: `submenu-${String(level)}`,
      items: children,
      kind: "submenu",
      label: `Submenu ${String(level)}`,
    };
  }
  return [child];
}

function treeNode(
  id: string,
  parentId: string | null,
  childIds: readonly string[] = [],
): UiTreeNode {
  return {
    childIds,
    disabled: false,
    expanded: childIds.length > 0,
    id,
    label: id,
    parentId,
    selected: false,
  };
}

function chainTree(length: number): readonly UiTreeNode[] {
  return Array.from({ length }, (_, index) => {
    const id = `node-${String(index)}`;
    return treeNode(
      id,
      index === 0 ? null : `node-${String(index - 1)}`,
      index + 1 === length ? [] : [`node-${String(index + 1)}`],
    );
  });
}

function layerState(
  modalScopeDepth: number,
  dismissAncestorIds: readonly string[] = [],
  descendantNonmodalIds: readonly string[] = [],
): unknown {
  return {
    backgroundRootId: "background",
    escapePolicy: "dismiss-when-owner-allows",
    inertWhenModal: true,
    outsidePointerDismissesNonmodal: true,
    state: {
      activeTransientId: null,
      descendantNonmodalIds,
      dismissAncestorIds,
      modalScopeDepth,
      root: {
        descriptionId: null,
        dismissibility: { kind: "dismissible" },
        id: "modal-root",
        initialFocusId: null,
        kind: "dialog",
        mode: "modal",
        ownerId: "modal-owner",
        requestRevision: 0,
        restoreFocusId: "modal-restore",
        titleId: null,
        triggerId: "modal-trigger",
      },
    },
  };
}

function diagnostic(path: readonly (string | number)[] = []): UiDiagnostic {
  return uiDiagnostic(
    "ui.value_malformed",
    "diagnostic-owner",
    path,
    "Diagnostic message",
    null,
  );
}

function tableProps(columnCount: number, rowCount: number) {
  return {
    caption: "Table",
    columns: Array.from({ length: columnCount }, (_, index) => ({
      id: `column-${String(index)}`,
      label: `Column ${String(index)}`,
      renderText: () => "cell",
      scope: "col",
      sortable: false,
    })),
    emptyMessage: "Empty",
    id: "table-owner",
    onSortChange: noop,
    rowId: (row: Readonly<{ id: string }>) => row.id,
    rows: Array.from({ length: rowCount }, (_, index) => ({
      id: `row-${String(index)}`,
    })),
    sort: null,
  };
}

function acceptedPreflight(action: () => void): boolean {
  try {
    action();
    return true;
  } catch (error) {
    if (error instanceof UiContractError) return false;
    throw error;
  }
}

function commandProps(itemCount: number, keywordCount = 0) {
  return {
    ...COMMON,
    accessibleName: "Commands",
    activeItemId: null,
    items: ids(itemCount, "command").map((id, index) => ({
      description: null,
      disabled: false,
      id,
      keywords: index === 0 ? ids(keywordCount, "keyword") : [],
      label: id,
    })),
    onAction: noop,
    onOpenChange: noop,
    onQueryChange: noop,
    open: false,
    query: "",
  };
}

function tabsProps(length: number) {
  const tabIds = ids(length, "tab");
  return {
    ...COMMON,
    accessibleName: "Tabs",
    activation: "manual" as const,
    activeId: tabIds[0] ?? null,
    focusedId: tabIds[0] ?? null,
    onActiveChange: noop,
    orientation: "horizontal" as const,
    tabs: tabIds.map((id, index) => ({
      disabled: false,
      id,
      label: id,
      panelId: `panel-${String(index)}`,
    })),
  };
}

function breadcrumbProps(length: number) {
  return {
    accessibleName: "Breadcrumb",
    items: ids(length, "crumb").map((id, index) => ({
      current: index + 1 === length,
      href: index + 1 === length ? null : `#${id}`,
      id,
      label: id,
    })),
  };
}

function toolbarProps(length: number) {
  return {
    ...COMMON,
    accessibleName: "Toolbar",
    content: null,
    focusedId: null,
    itemIds: ids(length, "tool"),
    orientation: "horizontal" as const,
  };
}

function accordionProps(length: number) {
  return {
    ...COMMON,
    accessibleName: "Accordion",
    focusedId: null,
    items: ids(length, "section").map((id, index) => ({
      content: null,
      disabled: false,
      expanded: false,
      headingLevel: 2 as const,
      id,
      label: id,
      panelId: `section-panel-${String(index)}`,
    })),
    onExpandedIdsChange: noop,
    selectionMode: "multiple" as const,
  };
}

function keyValueProps(length: number) {
  return {
    accessibleName: "Facts",
    items: ids(length, "fact").map((id) => ({
      description: null,
      id,
      key: id,
      value: id,
    })),
  };
}

function panels(length: number) {
  return ids(length, "panel").map((id) => ({
    collapsed: false,
    collapsible: true,
    id,
    label: id,
    maxPercent: 100,
    minPercent: 0,
    sizePercent: 100 / length,
  }));
}

function timelineProps(length: number, exactValue = "0/1") {
  return {
    ...COMMON,
    accessibleName: "Timeline",
    activeId: null,
    horizontalScroll: true as const,
    items: ids(length, "timeline").map((id) => ({
      disabled: false,
      exactDuration: "1/1",
      exactStart: exactValue,
      id,
      label: id,
      selected: false,
    })),
    onAction: noop,
  };
}

function toastProps(total: number, visible: number) {
  return {
    hiddenNoticeCount: total - visible,
    notices: Array.from({ length: visible }, (_, index) => ({
      dismissible: true,
      id: `notice-${String(index)}`,
      message: "Message",
      persistent: false,
      sequence: index,
      title: "Notice",
      tone: "info" as const,
    })),
    onDismiss: noop,
    onOpenNoticeCenter: noop,
  };
}

function componentCollectionAccepted(
  limitKey: LimitKey,
  length: number,
): boolean {
  switch (limitKey) {
    case "maxToggleItems": {
      const items = ids(length, "toggle").map((id) => ({ id }));
      return validateUiCollectionBound(
        "owner",
        ["items"],
        items,
        "maxToggleItems",
      ).ok;
    }
    case "maxCommandItems":
      return acceptedPreflight(() => {
        preflightCommandPalette(commandProps(length));
      });
    case "maxCommandKeywords":
      return acceptedPreflight(() => {
        preflightCommandPalette(commandProps(1, length));
      });
    case "maxTabs":
      return acceptedPreflight(() => {
        preflightTabs(tabsProps(length));
      });
    case "maxBreadcrumbItems":
      return invokeRefusal(Breadcrumb, breadcrumbProps(length)) === null;
    case "maxToolbarItems":
      return acceptedPreflight(() => {
        preflightToolbar(toolbarProps(length));
      });
    case "maxAccordionItems":
      return acceptedPreflight(() => {
        preflightAccordion(accordionProps(length));
      });
    case "maxKeyValueItems":
      return invokeRefusal(KeyValueList, keyValueProps(length)) === null;
    case "maxTableColumns": {
      const props = tableProps(length, 1);
      return validateUiCollectionBound(
        props.id,
        ["columns"],
        props.columns,
        "maxTableColumns",
      ).ok;
    }
    case "maxTableRows": {
      const props = tableProps(1, length);
      return validateUiCollectionBound(
        props.id,
        ["rows"],
        props.rows,
        "maxTableRows",
      ).ok;
    }
    case "maxTableCells": {
      const props = tableProps(20, 2_500);
      return validateUiCollectionProductBound(
        props.id,
        ["columns", "rows"],
        props.columns,
        props.rows,
        "maxTableCells",
      ).ok;
    }
    case "maxResizablePanels":
      return validateUiCollectionBound(
        "owner",
        ["panels"],
        panels(length),
        "maxResizablePanels",
      ).ok;
    case "maxTimelineItems":
      return acceptedPreflight(() => {
        preflightTimelineLaneProps(timelineProps(length));
      });
    case "maxNoticeCenterItems":
      return acceptedPreflight(() => {
        preflightToastNoticeProps(
          toastProps(length, UI_LIMITS.maxVisibleNotices),
        );
      });
    case "maxVisibleNotices":
      return acceptedPreflight(() => {
        preflightToastNoticeProps(toastProps(length, length));
      });
    default:
      throw new Error(`No owning collection acceptance probe for ${limitKey}`);
  }
}

function componentCollectionRefusal(limitKey: LimitKey, length: number): UiRefusalCode | null {
  switch (limitKey) {
    case "maxToggleItems":
      return invokeRefusal(ToggleGroup, {
        ...COMMON,
        accessibleName: "Toggles",
        items: ids(length, "toggle").map((id) => ({
          ...COMMON,
          id,
          label: id,
          onPressedChange: noop,
          pressed: false,
        })),
        onPressedIdsChange: noop,
        pressedIds: [],
        selectionMode: "multiple",
      });
    case "maxCommandItems":
      return invokeRefusal(CommandPalette, {
        ...COMMON,
        accessibleName: "Commands",
        activeItemId: null,
        items: ids(length, "command").map((id) => ({
          description: null,
          disabled: false,
          id,
          keywords: [],
          label: id,
        })),
        onAction: noop,
        onOpenChange: noop,
        onQueryChange: noop,
        open: false,
        query: "",
      });
    case "maxCommandKeywords":
      return invokeRefusal(CommandPalette, {
        ...COMMON,
        accessibleName: "Commands",
        activeItemId: null,
        items: [{
          description: null,
          disabled: false,
          id: "command",
          keywords: ids(length, "keyword"),
          label: "Command",
        }],
        onAction: noop,
        onOpenChange: noop,
        onQueryChange: noop,
        open: false,
        query: "",
      });
    case "maxTabs":
      return invokeRefusal(Tabs, {
        ...COMMON,
        accessibleName: "Tabs",
        activation: "manual",
        activeId: null,
        focusedId: null,
        onActiveChange: noop,
        orientation: "horizontal",
        tabs: ids(length, "tab").map((id, index) => ({
          disabled: false,
          id,
          label: id,
          panelId: `panel-${String(index)}`,
        })),
      });
    case "maxBreadcrumbItems":
      return invokeRefusal(Breadcrumb, {
        accessibleName: "Breadcrumb",
        items: ids(length, "crumb").map((id, index) => ({
          current: index + 1 === length,
          href: index + 1 === length ? null : `#${id}`,
          id,
          label: id,
        })),
      });
    case "maxToolbarItems":
      return invokeRefusal(Toolbar, {
        ...COMMON,
        accessibleName: "Toolbar",
        content: null,
        focusedId: null,
        itemIds: ids(length, "tool"),
        orientation: "horizontal",
      });
    case "maxAccordionItems":
      return invokeRefusal(Accordion, {
        ...COMMON,
        accessibleName: "Accordion",
        focusedId: null,
        items: ids(length, "section").map((id, index) => ({
          content: null,
          disabled: false,
          expanded: false,
          headingLevel: 2,
          id,
          label: id,
          panelId: `section-panel-${String(index)}`,
        })),
        onExpandedIdsChange: noop,
        selectionMode: "multiple",
      });
    case "maxKeyValueItems":
      return invokeRefusal(KeyValueList, {
        accessibleName: "Facts",
        items: ids(length, "fact").map((id) => ({
          description: null,
          id,
          key: id,
          value: id,
        })),
      });
    case "maxTableColumns":
      return invokeRefusal(DataTable, tableProps(length, 1));
    case "maxTableRows":
      return invokeRefusal(DataTable, tableProps(1, length));
    case "maxTableCells":
      return invokeRefusal(DataTable, tableProps(21, 2_381));
    case "maxResizablePanels":
      return invokeRefusal(ResizablePanels, {
        ...COMMON,
        onCollapsedIdsChange: noop,
        onSizesChange: noop,
        orientation: "horizontal",
        panels: ids(length, "panel").map((id) => ({
          collapsed: false,
          collapsible: true,
          id,
          label: id,
          maxPercent: 100,
          minPercent: 0,
          sizePercent: 100 / length,
        })),
      });
    case "maxTimelineItems":
      return invokeRefusal(TimelineLane, {
        ...COMMON,
        accessibleName: "Timeline",
        activeId: null,
        horizontalScroll: true,
        items: ids(length, "timeline").map((id) => ({
          disabled: false,
          exactDuration: "1/1",
          exactStart: "0/1",
          id,
          label: id,
          selected: false,
        })),
        onAction: noop,
      });
    case "maxNoticeCenterItems":
      return invokeRefusal(ToastNotice, {
        hiddenNoticeCount: length - UI_LIMITS.maxVisibleNotices,
        notices: Array.from({ length: UI_LIMITS.maxVisibleNotices }, (_, index) => ({
          dismissible: true,
          id: `notice-${String(index)}`,
          message: "Message",
          persistent: false,
          sequence: index,
          title: "Notice",
          tone: "info",
        })),
        onDismiss: noop,
        onOpenNoticeCenter: noop,
      });
    case "maxVisibleNotices":
      return invokeRefusal(ToastNotice, {
        hiddenNoticeCount: 0,
        notices: Array.from({ length }, (_, index) => ({
          dismissible: true,
          id: `notice-${String(index)}`,
          message: "Message",
          persistent: false,
          sequence: index,
          title: "Notice",
          tone: "info",
        })),
        onDismiss: noop,
        onOpenNoticeCenter: noop,
      });
    default:
      throw new Error(`No component collection probe for ${limitKey}`);
  }
}

function observeLimit(candidate: LimitCase): Readonly<{
  atAccepted: boolean;
  plusRefusal: UiRefusalCode | null;
}> {
  const at = candidate.atLimitInput;
  const plus = candidate.plusOneInput;
  switch (candidate.limitKey) {
    case "maxSafeInteger":
      return {
        atAccepted: validateFiniteRange("number", at, 0, at, 1).ok,
        plusRefusal: refusalCode(validateFiniteRange("number", plus, 0, at, 1)),
      };
    case "maxIdCodePoints":
      return {
        atAccepted: validateUiId("owner", ["id"], codePoints(at)).ok,
        plusRefusal: refusalCode(validateUiId("owner", ["id"], codePoints(plus))),
      };
    case "maxRequestKindCodePoints":
      return {
        atAccepted: validateUiText("owner", ["requestKind"], codePoints(at), at).ok,
        plusRefusal: refusalCode(
          validateUiText("owner", ["requestKind"], codePoints(plus), at),
        ),
      };
    case "maxLabelCodePoints":
      return {
        atAccepted: invokeRefusal(Badge, { label: codePoints(at), tone: "neutral" }) === null,
        plusRefusal: invokeRefusal(Badge, { label: codePoints(plus), tone: "neutral" }),
      };
    case "maxTextValueCodePoints": {
      const props = (length: number) => ({
        ...COMMON,
        accessibleName: "Input",
        inputType: "text" as const,
        onValueChange: noop,
        placeholder: null,
        readOnly: false,
        value: codePoints(length),
      });
      return {
        atAccepted: acceptedPreflight(() => {
          preflightInputProps(props(at));
        }),
        plusRefusal: invokeRefusal(preflightInputProps, props(plus)),
      };
    }
    case "maxKeywordCodePoints": {
      const props = (length: number) => ({
        ...commandProps(1),
        items: [{
          description: null,
          disabled: false,
          id: "command",
          keywords: [codePoints(length)],
          label: "Command",
        }],
      });
      return {
        atAccepted: acceptedPreflight(() => {
          preflightCommandPalette(props(at));
        }),
        plusRefusal: invokeRefusal(preflightCommandPalette, props(plus)),
      };
    }
    case "maxKbdKeyCodePoints":
      return {
        atAccepted: invokeRefusal(Kbd, { keys: [codePoints(at)] }) === null,
        plusRefusal: invokeRefusal(Kbd, { keys: [codePoints(plus)] }),
      };
    case "maxFilenameCodePoints": {
      const props = (length: number) => ({
        ...COMMON,
        destination: {
          filename: codePoints(length),
          href: "blob:local" as const,
          kind: "download" as const,
        },
        label: "Download",
      });
      return {
        atAccepted: acceptedPreflight(() => {
          preflightLinkButton(props(at));
        }),
        plusRefusal: invokeRefusal(preflightLinkButton, props(plus)),
      };
    }
    case "maxFragmentHrefCodePoints": {
      const props = (length: number) => ({
        ...COMMON,
        destination: {
          href: `#${codePoints(length - 1)}` as const,
          kind: "fragment" as const,
        },
        label: "Jump",
      });
      return {
        atAccepted: acceptedPreflight(() => {
          preflightLinkButton(props(at));
        }),
        plusRefusal: invokeRefusal(preflightLinkButton, props(plus)),
      };
    }
    case "maxLocalHrefCodePoints": {
      const props = (length: number) => ({
        ...COMMON,
        destination: {
          filename: "chart.html",
          href: `blob:${codePoints(length - 5)}` as const,
          kind: "download" as const,
        },
        label: "Download",
      });
      return {
        atAccepted: acceptedPreflight(() => {
          preflightLinkButton(props(at));
        }),
        plusRefusal: invokeRefusal(preflightLinkButton, props(plus)),
      };
    }
    case "maxExactValueCodePoints":
      return {
        atAccepted: acceptedPreflight(() => {
          preflightTimelineLaneProps(timelineProps(1, codePoints(at)));
        }),
        plusRefusal: invokeRefusal(
          preflightTimelineLaneProps,
          timelineProps(1, codePoints(plus)),
        ),
      };
    case "maxAccessibleNameCodePoints": {
      const props = (length: number) => ({
        accessibleName: codePoints(length),
        max: 100,
        min: 0,
        value: 50,
        valueText: null,
      });
      return {
        atAccepted: invokeRefusal(Progress, props(at)) === null,
        plusRefusal: invokeRefusal(Progress, props(plus)),
      };
    }
    case "maxDescriptionCodePoints": {
      const props = (length: number) => ({
        description: codePoints(length),
        illustration: null,
        primaryAction: null,
        secondaryAction: null,
        title: "Empty",
      });
      return {
        atAccepted: acceptedPreflight(() => {
          preflightEmptyStateProps(props(at));
        }),
        plusRefusal: invokeRefusal(preflightEmptyStateProps, props(plus)),
      };
    }
    case "maxTooltipCodePoints": {
      const props = (length: number) => ({
        id: "tooltip",
        onOpenChange: noop,
        open: false,
        text: codePoints(length),
        triggerId: "trigger",
      });
      return {
        atAccepted: acceptedPreflight(() => {
          preflightTooltipProps(props(at));
        }),
        plusRefusal: invokeRefusal(preflightTooltipProps, props(plus)),
      };
    }
    case "maxTypeaheadCodePoints": {
      const atState = advanceListboxTypeahead(
        { query: codePoints(at - 1), timeStamp: 0 },
        "a",
        1,
      );
      const plusState = advanceListboxTypeahead(
        { query: codePoints(at), timeStamp: 0 },
        "a",
        1,
      );
      return {
        atAccepted: atState !== null && Array.from(atState.query).length === at,
        plusRefusal: plusState === null
          ? refusalCode(validateUiText("owner", ["typeahead"], codePoints(plus), at))
          : null,
      };
    }
    case "maxModalScopes":
      return {
        atAccepted: FocusDismissLayer(layerState(at) as never).ok,
        plusRefusal: refusalCode(FocusDismissLayer(layerState(plus) as never)),
      };
    case "maxDismissAncestors":
      return {
        atAccepted: FocusDismissLayer(layerState(1, ids(at, "ancestor")) as never).ok,
        plusRefusal: refusalCode(
          FocusDismissLayer(layerState(1, ids(plus, "ancestor")) as never),
        ),
      };
    case "maxNonmodalSurfaces":
      return {
        atAccepted: FocusDismissLayer(layerState(1, [], ids(at, "surface")) as never).ok,
        plusRefusal: refusalCode(
          FocusDismissLayer(layerState(1, [], ids(plus, "surface")) as never),
        ),
      };
    case "maxFocusCandidates": {
      const focusable = {
        closest: () => null,
        getAttribute: () => null,
        hidden: false,
        isConnected: true,
        matches: () => false,
        ownerDocument: { defaultView: null },
        tabIndex: 0,
      };
      const surface = (length: number) => ({
        querySelectorAll: () => Array.from({ length }, () => focusable),
      });
      return {
        atAccepted: focusCandidatesWithin(surface(at) as never, "surface").ok,
        plusRefusal: (() => {
          const result = focusCandidatesWithin(surface(plus) as never, "surface");
          return result.ok ? null : result.diagnostic.code;
        })(),
      };
    }
    case "maxReferenceIds":
      return {
        atAccepted: validateUiCommonProps({ ...COMMON, describedBy: ids(at, "reference") }).ok,
        plusRefusal: refusalCode(
          validateUiCommonProps({ ...COMMON, describedBy: ids(plus, "reference") }),
        ),
      };
    case "maxDiagnostics":
      return {
        atAccepted: validateUiDiagnostics("owner", Array.from({ length: at }, () => diagnostic())).ok,
        plusRefusal: refusalCode(
          validateUiDiagnostics("owner", Array.from({ length: plus }, () => diagnostic())),
        ),
      };
    case "maxDiagnosticPathSegments":
      return {
        atAccepted: validateUiDiagnostics("owner", [diagnostic(ids(at, "path"))]).ok,
        plusRefusal: refusalCode(
          validateUiDiagnostics("owner", [diagnostic(ids(plus, "path"))]),
        ),
      };
    case "maxKbdKeys":
      return {
        atAccepted: invokeRefusal(Kbd, { keys: ids(at, "key") }) === null,
        plusRefusal: invokeRefusal(Kbd, { keys: ids(plus, "key") }),
      };
    case "maxSkeletonLines":
      return {
        atAccepted: invokeRefusal(Skeleton, { ariaHidden: true, lines: at, shape: "text" }) === null,
        plusRefusal: invokeRefusal(Skeleton, { ariaHidden: true, lines: plus, shape: "text" }),
      };
    case "maxTextareaRows":
      return {
        atAccepted: validateFiniteRange("textarea", at, 1, at, 1).ok,
        plusRefusal: invokeRefusal(Textarea, {
          ...COMMON,
          accessibleName: "Text",
          maxCodePoints: 100,
          onValueChange: noop,
          placeholder: null,
          readOnly: false,
          rows: plus,
          value: "",
        }),
      };
    case "maxRovingItems":
      return {
        atAccepted: preflightRovingFocus({
          currentId: null,
          disabledIds: [],
          itemIds: ids(at, "roving"),
          orientation: "both",
          ownerId: "roving",
          typeahead: true,
          wrap: true,
        }).ok,
        plusRefusal: refusalCode(
          preflightRovingFocus({
            currentId: null,
            disabledIds: [],
            itemIds: ids(plus, "roving"),
            orientation: "both",
            ownerId: "roving",
            typeahead: true,
            wrap: true,
          }),
        ),
      };
    case "maxSelectOptions":
    case "maxComboboxOptions":
    case "maxListboxOptions":
    case "maxRadioItems":
      return {
        atAccepted: validateUiOptions("options", options(at), at).ok,
        plusRefusal: refusalCode(validateUiOptions("options", options(plus), at)),
      };
    case "maxMenuItems":
      return {
        atAccepted: preflightMenuTopology("menu", Array.from({ length: at }, (_, index) => actionItem(index))).ok,
        plusRefusal: refusalCode(
          preflightMenuTopology("menu", Array.from({ length: plus }, (_, index) => actionItem(index))),
        ),
      };
    case "maxMenuDepth":
      return {
        atAccepted: preflightMenuTopology("menu", deepMenu(at)).ok,
        plusRefusal: refusalCode(preflightMenuTopology("menu", deepMenu(plus))),
      };
    case "maxTreeItems": {
      const atNodes = Array.from({ length: at }, (_, index) => treeNode(`flat-${String(index)}`, null));
      const plusNodes = Array.from({ length: plus }, (_, index) => treeNode(`flat-${String(index)}`, null));
      return {
        atAccepted: preflightTreeTopology("tree", atNodes, atNodes.map(({ id }) => id)).ok,
        plusRefusal: refusalCode(
          preflightTreeTopology("tree", plusNodes, plusNodes.map(({ id }) => id)),
        ),
      };
    }
    case "maxTreeDepth":
      return {
        atAccepted: preflightTreeTopology("tree", chainTree(at), ["node-0"]).ok,
        plusRefusal: refusalCode(preflightTreeTopology("tree", chainTree(plus), ["node-0"])),
      };
    case "maxTableCells":
      return {
        atAccepted: componentCollectionAccepted(candidate.limitKey, at),
        plusRefusal: componentCollectionRefusal(candidate.limitKey, plus),
      };
    case "maxToggleItems":
    case "maxCommandItems":
    case "maxCommandKeywords":
    case "maxTabs":
    case "maxBreadcrumbItems":
    case "maxToolbarItems":
    case "maxAccordionItems":
    case "maxKeyValueItems":
    case "maxTableColumns":
    case "maxTableRows":
    case "maxResizablePanels":
    case "maxTimelineItems":
    case "maxNoticeCenterItems":
    case "maxVisibleNotices":
      return {
        atAccepted: componentCollectionAccepted(candidate.limitKey, at),
        plusRefusal: componentCollectionRefusal(candidate.limitKey, plus),
      };
    default:
      throw new Error(`Unbound U0 limit ${candidate.limitKey}`);
  }
}

function topologyInput(subject: string): Readonly<{
  nodes: readonly UiTreeNode[];
  rootIds: readonly string[];
  atLimit?: Readonly<{ nodes: readonly UiTreeNode[]; rootIds: readonly string[] }>;
}> {
  switch (subject) {
    case "empty-rooted-forest":
      return { nodes: [], rootIds: [] };
    case "multiple-root-forest":
      return { nodes: [treeNode("n1", null), treeNode("n2", null)], rootIds: ["n1", "n2"] };
    case "duplicate-node-id":
      return { nodes: [treeNode("n1", null), treeNode("n1", null)], rootIds: ["n1"] };
    case "duplicate-root-id":
      return { nodes: [treeNode("n1", null)], rootIds: ["n1", "n1"] };
    case "duplicate-child-id-per-parent":
      return {
        nodes: [treeNode("n1", null, ["n2", "n2"]), treeNode("n2", "n1")],
        rootIds: ["n1"],
      };
    case "multiple-parents-for-nonroot":
      return {
        nodes: [
          treeNode("n1", null, ["n3"]),
          treeNode("n2", null, ["n3"]),
          treeNode("n3", "n1"),
        ],
        rootIds: ["n1", "n2"],
      };
    case "nonreciprocal-parent-child":
      return {
        nodes: [treeNode("n1", null, ["n2"]), treeNode("n2", null)],
        rootIds: ["n1", "n2"],
      };
    case "unreachable-node":
      return { nodes: [treeNode("n1", null), treeNode("n2", null)], rootIds: ["n1"] };
    case "self-cycle":
      return { nodes: [treeNode("n1", "n1", ["n1"])], rootIds: ["n1"] };
    case "multi-node-cycle":
      return {
        nodes: [
          treeNode("n1", "n3", ["n2"]),
          treeNode("n2", "n1", ["n3"]),
          treeNode("n3", "n2", ["n1"]),
        ],
        rootIds: ["n1"],
      };
    case "missing-reference":
      return { nodes: [treeNode("n1", null, ["missing"])], rootIds: ["n1"] };
    case "tree-depth-boundary":
      return {
        atLimit: { nodes: chainTree(64), rootIds: ["node-0"] },
        nodes: chainTree(65),
        rootIds: ["node-0"],
      };
    case "tree-traversal-boundary": {
      const atNodes = Array.from({ length: 5_000 }, (_, index) => treeNode(`n-${String(index)}`, null));
      const plusNodes = [...atNodes, treeNode("n-5000", null)];
      return {
        atLimit: { nodes: atNodes, rootIds: atNodes.map(({ id }) => id) },
        nodes: plusNodes,
        rootIds: plusNodes.map(({ id }) => id),
      };
    }
    default:
      throw new Error(`Unbound tree topology subject ${subject}`);
  }
}

function menuTopologyInput(subject: string): Readonly<{
  items: readonly UiMenuItem[];
}> {
  switch (subject) {
    case "valid-flat-menu":
      return {
        items: [
          actionItem(0),
          { id: "separator", kind: "separator" },
          actionItem(2),
        ],
      };
    case "valid-depth-and-flattened-boundary":
      return { items: deepMenu(4, 200) };
    case "submenu-depth-exact-plus-one":
      return { items: deepMenu(5) };
    case "flattened-item-exact-plus-one":
      return { items: Array.from({ length: 201 }, (_, index) => actionItem(index)) };
    case "duplicate-id-across-flattened-tree":
      return {
        items: [
          actionItem(0),
          {
            disabled: false,
            id: "submenu",
            items: [{ ...actionItem(1), id: "action-0" }],
            kind: "submenu",
            label: "Submenu",
          },
        ],
      };
    case "menu-cycle": {
      const first: Record<string, unknown> = {
        disabled: false,
        id: "menu-a",
        items: [],
        kind: "submenu",
        label: "Menu A",
      };
      const second: Record<string, unknown> = {
        disabled: false,
        id: "menu-b",
        items: [first],
        kind: "submenu",
        label: "Menu B",
      };
      first["items"] = [second];
      return { items: [first as UiMenuItem] };
    }
    case "repeated-object-identity": {
      const shared = actionItem(0);
      return {
        items: [
          shared,
          {
            disabled: false,
            id: "submenu",
            items: [shared],
            kind: "submenu",
            label: "Submenu",
          },
        ],
      };
    }
    default:
      throw new Error(`Unbound menu topology subject ${subject}`);
  }
}

function layoutAt(width: number): string | null {
  return UI_RESPONSIVE_LAYOUTS.find(
    ({ maxCssPxExclusive, minCssPx }) =>
      width >= minCssPx &&
      (maxCssPxExclusive === null || width < maxCssPxExclusive),
  )?.id ?? null;
}

describe("TR-U0-LIMITS exact production boundaries", () => {
  test("fixture binds exactly 49 U0-LIM and 14 U0-THRESH cases", () => {
    expect(limitCases).toHaveLength(49);
    expect(thresholdCases).toHaveLength(14);
    expect(new Set(limitCases.map(({ limitKey }) => limitKey)).size).toBe(49);
  });

  for (const candidate of limitCases) {
    const relatedCaseId = candidate.limitKey === "maxModalScopes"
      ? " U0-OVR-007"
      : candidate.limitKey === "maxDismissAncestors"
        ? " U0-OVR-012"
        : "";
    test(`${candidate.id}${relatedCaseId} ${candidate.limitKey} accepts N and refuses N+1 atomically`, () => {
      expect(UI_LIMITS[candidate.limitKey]).toBe(candidate.atLimitInput);
      const observation = observeLimit(candidate);
      expect(observation.atAccepted).toBe(true);
      expect(observation.plusRefusal).toBe(candidate.refusal);
    });
  }

  test("U0-PRIM-016 rejects the external 24 CSS px floor below the 44 CSS px project target", () => {
    expect(UI_ACCESSIBILITY_POLICY.targetFloorCssPx).toBe(24);
    expect(UI_ACCESSIBILITY_POLICY.projectTouchTargetCssPx).toBe(44);
    expect(UI_LIMITS.projectTouchTargetCssPx).toBe(
      UI_ACCESSIBILITY_POLICY.projectTouchTargetCssPx,
    );
    expect(
      refusalCode(
        validateFiniteRange(
          "primary-action-target",
          UI_ACCESSIBILITY_POLICY.targetFloorCssPx,
          UI_ACCESSIBILITY_POLICY.projectTouchTargetCssPx,
          UI_ACCESSIBILITY_POLICY.projectTouchTargetCssPx,
          1,
        ),
      ),
    ).toBe("ui.range_invalid");
    expect(
      validateFiniteRange(
        "primary-action-target",
        UI_ACCESSIBILITY_POLICY.projectTouchTargetCssPx,
        UI_ACCESSIBILITY_POLICY.projectTouchTargetCssPx,
        UI_ACCESSIBILITY_POLICY.projectTouchTargetCssPx,
        1,
      ).ok,
    ).toBe(true);
  });

  for (const candidate of thresholdCases) {
    test(`${candidate.id} ${candidate.limitKey} binds below, exact, and above observations`, () => {
      expect(UI_LIMITS[candidate.limitKey]).toBe(candidate.atThresholdInput);
      expect(candidate.belowInput).toBe(candidate.atThresholdInput - 1);
      expect(candidate.aboveInput).toBe(candidate.atThresholdInput + 1);

      if (candidate.limitKey === "typeaheadResetMs") {
        const initial = { query: "a", timeStamp: 0 };
        expect(advanceListboxTypeahead(initial, "b", candidate.belowInput)?.query).toBe("ab");
        expect(advanceListboxTypeahead(initial, "b", candidate.atThresholdInput)?.query).toBe("b");
        expect(advanceListboxTypeahead(initial, "b", candidate.aboveInput)?.query).toBe("b");
      } else if (candidate.limitKey === "compactBreakpointCssPx") {
        expect([
          layoutAt(candidate.belowInput),
          layoutAt(candidate.atThresholdInput),
          layoutAt(candidate.aboveInput),
        ]).toEqual(["compact", "balanced", "balanced"]);
      } else if (candidate.limitKey === "wideBreakpointCssPx") {
        expect([
          layoutAt(candidate.belowInput),
          layoutAt(candidate.atThresholdInput),
          layoutAt(candidate.aboveInput),
        ]).toEqual(["balanced", "wide", "wide"]);
      } else if (
        candidate.limitKey === "fastMotionMs" ||
        candidate.limitKey === "deliberateMotionMs" ||
        candidate.limitKey === "reducedMotionMs"
      ) {
        expect([
          candidate.belowInput === UI_LIMITS[candidate.limitKey],
          candidate.atThresholdInput === UI_LIMITS[candidate.limitKey],
          candidate.aboveInput === UI_LIMITS[candidate.limitKey],
        ]).toEqual([false, true, false]);
      } else {
        expect([
          candidate.belowInput >= UI_LIMITS[candidate.limitKey],
          candidate.atThresholdInput >= UI_LIMITS[candidate.limitKey],
          candidate.aboveInput >= UI_LIMITS[candidate.limitKey],
        ]).toEqual([false, true, true]);
      }
    });
  }
});

describe("TR-U0-LIMITS rooted-forest topology", () => {
  expect(matrix.topologyCases).toHaveLength(13);
  for (const candidate of matrix.topologyCases) {
    test(`${candidate.id} ${candidate.subject} executes the production tree preflight`, () => {
      const input = topologyInput(candidate.subject);
      if (input.atLimit !== undefined) {
        expect(
          preflightTreeTopology(
            "tree",
            input.atLimit.nodes,
            input.atLimit.rootIds,
          ).ok,
        ).toBe(true);
      }
      const result = preflightTreeTopology("tree", input.nodes, input.rootIds);
      expect(refusalCode(result)).toBe(candidate.refusal);
    });
  }
});

describe("TR-U0-LIMITS menu topology", () => {
  expect(matrix.menuTopologyCases).toHaveLength(7);
  for (const candidate of matrix.menuTopologyCases) {
    test(`${candidate.id} ${candidate.subject} executes the production visited traversal`, () => {
      const result = preflightMenuTopology(
        "menu",
        menuTopologyInput(candidate.subject).items,
      );
      expect(refusalCode(result)).toBe(candidate.refusal);
    });
  }
});
