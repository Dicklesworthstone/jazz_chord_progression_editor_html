import { describe, expect, test } from "bun:test";

import type {
  UiBreadcrumbProps,
  UiCommandPaletteProps,
  UiContextMenuProps,
  UiMenuItem,
  UiMenuProps,
  UiRefusalCode,
  UiTabsProps,
} from "../../src/ui/ui-contract";
import {
  Accordion,
  type AccordionProps,
  Breadcrumb,
  CommandPalette,
  ContextMenu,
  Menu,
  ScrollArea,
  type ScrollAreaProps,
  Tabs,
  Toolbar,
  type ToolbarProps,
} from "../../src/ui/primitives/Navigation";
import {
  preflightMenuTopology,
  UiContractError,
} from "../../src/ui/primitives/validation";

const ENABLED_TAB = Object.freeze({
  disabled: false,
  id: "harmony-tab",
  label: "Harmony",
  panelId: "harmony-panel",
});

const DISABLED_TAB = Object.freeze({
  disabled: true,
  id: "analysis-tab",
  label: "Analysis",
  panelId: "analysis-panel",
});

const BREADCRUMB_ITEMS = Object.freeze([
  Object.freeze({
    current: true,
    href: null,
    id: "studio-page",
    label: "Studio",
  }),
]) satisfies UiBreadcrumbProps["items"];

const MENU_ITEMS = Object.freeze([
  Object.freeze({
    disabled: false,
    id: "new-progression",
    kind: "action",
    label: "New progression",
  }),
]) satisfies readonly UiMenuItem[];

const COMMAND_ITEMS = Object.freeze([
  Object.freeze({
    description: "Create an empty chart",
    disabled: false,
    id: "new-command",
    keywords: Object.freeze(["new", "chart"]),
    label: "New progression",
  }),
]) satisfies UiCommandPaletteProps["items"];

const ACCORDION_ITEMS = Object.freeze([
  Object.freeze({
    content: null,
    disabled: false,
    expanded: false,
    headingLevel: 2,
    id: "harmony-section",
    label: "Harmony",
    panelId: "harmony-section-panel",
  }),
]) satisfies AccordionProps["items"];

function tabsProps(
  overrides: Partial<UiTabsProps>,
): UiTabsProps {
  return {
    accessibleName: "Studio views",
    activation: "manual",
    activeId: ENABLED_TAB.id,
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    focusedId: ENABLED_TAB.id,
    id: "studio-tabs",
    invalid: false,
    onActiveChange: () => undefined,
    orientation: "horizontal",
    tabs: [ENABLED_TAB, DISABLED_TAB],
    ...overrides,
  };
}

function menuProps(overrides: Partial<UiMenuProps> = {}): UiMenuProps {
  return {
    accessibleName: "Progression commands",
    activeItemId: "new-progression",
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    id: "progression-menu",
    invalid: false,
    items: MENU_ITEMS,
    onAction: () => undefined,
    onOpenChange: () => undefined,
    open: false,
    triggerId: "progression-menu-trigger",
    ...overrides,
  };
}

function commandPaletteProps(
  overrides: Partial<UiCommandPaletteProps> = {},
): UiCommandPaletteProps {
  return {
    accessibleName: "Command palette",
    activeItemId: "new-command",
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    id: "command-palette",
    invalid: false,
    items: COMMAND_ITEMS,
    onAction: () => undefined,
    onOpenChange: () => undefined,
    onQueryChange: () => undefined,
    open: false,
    query: "",
    ...overrides,
  };
}

function contextMenuProps(
  overrides: Partial<UiContextMenuProps> = {},
): UiContextMenuProps {
  return {
    ...menuProps(),
    anchor: null,
    targetId: "progression-surface",
    ...overrides,
  };
}

function accordionProps(
  overrides: Partial<AccordionProps> = {},
): AccordionProps {
  return {
    accessibleName: "Inspector sections",
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    focusedId: "harmony-section",
    id: "inspector-accordion",
    invalid: false,
    items: ACCORDION_ITEMS,
    onExpandedIdsChange: () => undefined,
    selectionMode: "multiple",
    ...overrides,
  };
}

function scrollAreaProps(
  overrides: Partial<ScrollAreaProps> = {},
): ScrollAreaProps {
  return {
    accessibleName: "Progression timeline",
    content: null,
    id: "progression-scroll",
    nativeScrollbar: true,
    orientation: "horizontal",
    ...overrides,
  };
}

function captureContractError(action: () => void): UiContractError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(UiContractError);
    if (error instanceof UiContractError) return error;
    throw error;
  }
  throw new Error("Expected a U0 contract refusal before hooks or DOM work.");
}

function expectMalformed(
  action: () => void,
  path: readonly (string | number)[],
): void {
  expectRefusal(action, path, "ui.value_malformed");
}

function expectRefusal(
  action: () => void,
  path: readonly (string | number)[],
  code: UiRefusalCode,
): void {
  const error = captureContractError(action);
  expect(error.diagnostic.code).toBe(code);
  expect(error.diagnostic.path).toEqual(path);
}

function expectMenuTopologyMalformed(
  items: unknown,
  path: readonly (string | number)[],
): void {
  const result = preflightMenuTopology(
    "progression-menu",
    items as readonly UiMenuItem[],
  );
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.refusal.code).toBe("ui.value_malformed");
  expect(result.refusal.path).toEqual(path);
}

function expectSelectionRefusal(
  props: UiTabsProps,
  expectedPath: "activeId" | "focusedId",
): void {
  try {
    Tabs(props);
    throw new Error("Expected Tabs to refuse before installing hooks.");
  } catch (error) {
    expect(error).toBeInstanceOf(UiContractError);
    if (!(error instanceof UiContractError)) return;
    expect(error.diagnostic.code).toBe("ui.selection_invalid");
    expect(error.diagnostic.path).toEqual([expectedPath]);
  }
}

describe("U0 Navigation runtime preflight regressions", () => {
  test("requires an enabled active tab for every nonempty collection", () => {
    expectSelectionRefusal(tabsProps({ activeId: null }), "activeId");
  });

  test("refuses unknown or disabled focused identities without fallback", () => {
    expectSelectionRefusal(
      tabsProps({ focusedId: "missing-tab" }),
      "focusedId",
    );
    expectSelectionRefusal(
      tabsProps({ focusedId: DISABLED_TAB.id }),
      "focusedId",
    );
  });

  test("refuses every named malformed collection before native collection access", () => {
    expectMalformed(
      () => {
        Breadcrumb({
          accessibleName: "Studio location",
          items: null,
        } as unknown as UiBreadcrumbProps);
      },
      ["items"],
    );
    expectMalformed(
      () => {
        Tabs({ ...tabsProps({}), tabs: null } as unknown as UiTabsProps);
      },
      ["tabs"],
    );
    expectMalformed(
      () => {
        Menu({ ...menuProps(), items: null } as unknown as UiMenuProps);
      },
      ["items"],
    );
    expectMenuTopologyMalformed(null, ["items"]);
    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          items: null,
        } as unknown as UiCommandPaletteProps);
      },
      ["items"],
    );
    expectMalformed(
      () => {
        Accordion({
          ...accordionProps(),
          items: null,
        } as unknown as AccordionProps);
      },
      ["items"],
    );
    expectMalformed(
      () => {
        Toolbar({
          accessibleName: "Transport",
          busy: false,
          content: null,
          density: "comfortable",
          describedBy: [],
          disabled: false,
          focusedId: null,
          id: "transport-toolbar",
          invalid: false,
          itemIds: null,
          orientation: "horizontal",
        } as unknown as ToolbarProps);
      },
      ["itemIds"],
    );
  });

  test("preflights malformed item records and boolean fields at their owning paths", () => {
    expectMalformed(
      () => {
        Tabs({
          ...tabsProps({}),
          tabs: [null],
        } as unknown as UiTabsProps);
      },
      ["tabs", 0],
    );
    expectMalformed(
      () => {
        Tabs({
          ...tabsProps({}),
          tabs: [{ ...ENABLED_TAB, disabled: "false" }],
        } as unknown as UiTabsProps);
      },
      ["tabs", 0, "disabled"],
    );
    expectMalformed(
      () => {
        Breadcrumb({
          accessibleName: "Studio location",
          items: [{ ...BREADCRUMB_ITEMS[0], current: "true" }],
        } as unknown as UiBreadcrumbProps);
      },
      ["items", 0, "current"],
    );

    expectMenuTopologyMalformed([null], ["items", 0]);
    expectMenuTopologyMalformed(
      [{ disabled: false, id: "unknown", kind: "unknown", label: "Unknown" }],
      ["items", 0, "kind"],
    );
    expectMenuTopologyMalformed(
      [{ disabled: "false", id: "action", kind: "action", label: "Action" }],
      ["items", 0, "disabled"],
    );
    expectMenuTopologyMalformed(
      [{
        checked: "false",
        disabled: false,
        id: "check",
        kind: "checkbox",
        label: "Checked choice",
      }],
      ["items", 0, "checked"],
    );
    expectMenuTopologyMalformed(
      [{
        disabled: false,
        id: "submenu",
        items: null,
        kind: "submenu",
        label: "Submenu",
      }],
      ["items", 0, "items"],
    );

    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          items: [null],
        } as unknown as UiCommandPaletteProps);
      },
      ["items", 0],
    );
    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          items: [{ ...COMMAND_ITEMS[0], keywords: null }],
        } as unknown as UiCommandPaletteProps);
      },
      ["items", 0, "keywords"],
    );
    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          items: [{ ...COMMAND_ITEMS[0], disabled: "false" }],
        } as unknown as UiCommandPaletteProps);
      },
      ["items", 0, "disabled"],
    );

    expectMalformed(
      () => {
        Accordion({
          ...accordionProps(),
          items: [null],
        } as unknown as AccordionProps);
      },
      ["items", 0],
    );
    expectMalformed(
      () => {
        Accordion({
          ...accordionProps(),
          items: [{ ...ACCORDION_ITEMS[0], headingLevel: 1 }],
        } as unknown as AccordionProps);
      },
      ["items", 0, "headingLevel"],
    );
    expectMalformed(
      () => {
        Accordion({
          ...accordionProps(),
          items: [{ ...ACCORDION_ITEMS[0], expanded: "false" }],
        } as unknown as AccordionProps);
      },
      ["items", 0, "expanded"],
    );
    expectMalformed(
      () => {
        Accordion({
          ...accordionProps(),
          items: [{ ...ACCORDION_ITEMS[0], disabled: "false" }],
        } as unknown as AccordionProps);
      },
      ["items", 0, "disabled"],
    );
  });

  test("preflights closed enums and booleans before hooks or listeners", () => {
    expectMalformed(
      () => {
        Tabs({ ...tabsProps({}), orientation: "both" } as unknown as UiTabsProps);
      },
      ["orientation"],
    );
    expectMalformed(
      () => {
        Tabs({ ...tabsProps({}), activation: "automatic" } as unknown as UiTabsProps);
      },
      ["activation"],
    );
    expectMalformed(
      () => {
        Menu({ ...menuProps(), open: "false" } as unknown as UiMenuProps);
      },
      ["open"],
    );
    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          open: "false",
        } as unknown as UiCommandPaletteProps);
      },
      ["open"],
    );
    expectMalformed(
      () => {
        Accordion({
          ...accordionProps(),
          selectionMode: "none",
        } as unknown as AccordionProps);
      },
      ["selectionMode"],
    );
    expectMalformed(
      () => {
        ScrollArea({
          ...scrollAreaProps(),
          orientation: "diagonal",
        } as unknown as ScrollAreaProps);
      },
      ["orientation"],
    );
    expectMalformed(
      () => {
        ScrollArea({
          ...scrollAreaProps(),
          nativeScrollbar: false,
        } as unknown as ScrollAreaProps);
      },
      ["nativeScrollbar"],
    );
    expectMalformed(
      () => {
        ContextMenu({
          ...contextMenuProps(),
          anchor: "10,20",
        } as unknown as UiContextMenuProps);
      },
      ["anchor"],
    );
    expectMalformed(
      () => {
        Toolbar({
          accessibleName: "Transport",
          busy: false,
          content: null,
          density: "comfortable",
          describedBy: [],
          disabled: false,
          focusedId: null,
          id: "transport-toolbar",
          invalid: false,
          itemIds: [],
          orientation: "both",
        } as unknown as ToolbarProps);
      },
      ["orientation"],
    );
  });

  test("keeps rendered Navigation owner, target, and child identities disjoint", () => {
    const commandItem = COMMAND_ITEMS[0];
    if (commandItem === undefined) {
      throw new Error("Expected the command identity fixture.");
    }
    expectRefusal(
      () => {
        Toolbar({
          accessibleName: "Transport",
          busy: false,
          content: null,
          density: "comfortable",
          describedBy: [],
          disabled: false,
          focusedId: null,
          id: "transport-toolbar",
          invalid: false,
          itemIds: ["transport-toolbar"],
          orientation: "horizontal",
        });
      },
      ["itemIds"],
      "ui.duplicate_item_id",
    );

    expectRefusal(
      () => {
        CommandPalette(commandPaletteProps({
          activeItemId: "command-palette",
          items: [{ ...commandItem, id: "command-palette" }],
        }));
      },
      ["items"],
      "ui.duplicate_item_id",
    );

    for (const targetId of [
      "progression-menu",
      "progression-menu-trigger",
      "new-progression",
    ]) {
      expectRefusal(
        () => {
          ContextMenu(contextMenuProps({ targetId }));
        },
        ["contextIdentityGraph"],
        "ui.duplicate_item_id",
      );
    }
  });

  test("preflights every Navigation semantic callback before hooks or DOM", () => {
    expectMalformed(
      () => {
        Tabs({ ...tabsProps({}), onActiveChange: null } as unknown as UiTabsProps);
      },
      ["onActiveChange"],
    );
    expectMalformed(
      () => {
        Menu({ ...menuProps(), onAction: null } as unknown as UiMenuProps);
      },
      ["onAction"],
    );
    expectMalformed(
      () => {
        Menu({ ...menuProps(), onOpenChange: null } as unknown as UiMenuProps);
      },
      ["onOpenChange"],
    );
    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          onQueryChange: null,
        } as unknown as UiCommandPaletteProps);
      },
      ["onQueryChange"],
    );
    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          onAction: null,
        } as unknown as UiCommandPaletteProps);
      },
      ["onAction"],
    );
    expectMalformed(
      () => {
        CommandPalette({
          ...commandPaletteProps(),
          onOpenChange: null,
        } as unknown as UiCommandPaletteProps);
      },
      ["onOpenChange"],
    );
    expectMalformed(
      () => {
        Accordion({
          ...accordionProps(),
          onExpandedIdsChange: null,
        } as unknown as AccordionProps);
      },
      ["onExpandedIdsChange"],
    );
  });
});
