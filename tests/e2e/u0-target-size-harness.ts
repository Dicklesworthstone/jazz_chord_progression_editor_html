import { h, render, type ComponentChildren } from "preact";

import { Button } from "../../src/ui/primitives/Button";
import { Disclosure } from "../../src/ui/primitives/Disclosure";
import {
  Checkbox,
  Listbox,
  RadioGroup,
  Slider,
  Switch,
  Textarea,
  Toggle,
} from "../../src/ui/primitives/Forms";
import {
  Badge,
  LinkButton,
} from "../../src/ui/primitives/Foundations";
import { IconButton } from "../../src/ui/primitives/IconButton";
import { Input } from "../../src/ui/primitives/Input";
import {
  DataTable,
  ResizablePanels,
  TimelineLane,
  Tree,
} from "../../src/ui/primitives/StructuredViews";

const noop = (): void => undefined;

function probe(name: string, child: ComponentChildren) {
  return h("div", { "data-target-probe": name }, child);
}

function TargetSizeHarness() {
  const radioOptions = Object.freeze([
    Object.freeze({
      description: null,
      disabled: false,
      id: "target-radio-option",
      label: ".",
      value: "only",
    }),
  ]);
  const treeNodes = Object.freeze([
    Object.freeze({
      childIds: Object.freeze(["target-tree-leaf"]),
      disabled: false,
      expanded: true,
      id: "target-tree-root",
      label: "Root",
      parentId: null,
      selected: false,
    }),
    Object.freeze({
      childIds: Object.freeze([]),
      disabled: false,
      expanded: false,
      id: "target-tree-leaf",
      label: "Leaf",
      parentId: "target-tree-root",
      selected: false,
    }),
  ]);
  const panels = Object.freeze([
    Object.freeze({
      collapsed: false,
      collapsible: true,
      id: "target-panel-a",
      label: "A",
      maxPercent: 90,
      minPercent: 10,
      sizePercent: 50,
    }),
    Object.freeze({
      collapsed: false,
      collapsible: true,
      id: "target-panel-b",
      label: "B",
      maxPercent: 90,
      minPercent: 10,
      sizePercent: 50,
    }),
  ] as const);
  const timelineItems = Object.freeze([
    Object.freeze({
      disabled: false,
      exactDuration: "1",
      exactStart: "0",
      id: "target-timeline-a",
      label: "A",
      selected: true,
    }),
    Object.freeze({
      disabled: false,
      exactDuration: "1",
      exactStart: "1",
      id: "target-timeline-b",
      label: "B",
      selected: false,
    }),
  ]);

  return h(
    "main",
    { "data-target-size-ready": "true" },
    h("span", { id: "target-fragment" }),
    probe(
      "primary-button",
      h(Button, {
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-primary-button",
        invalid: false,
        label: ".",
        onAction: noop,
        type: "button",
        variant: "primary",
      }),
    ),
    probe(
      "default-button",
      h(Button, {
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-default-button",
        invalid: false,
        label: ".",
        onAction: noop,
        type: "button",
        variant: "secondary",
      }),
    ),
    probe(
      "icon-button",
      h(IconButton, {
        accessibleName: "Target icon action",
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        iconId: "status",
        id: "target-icon-button",
        invalid: false,
        onAction: noop,
        type: "button",
        variant: "secondary",
      }),
    ),
    probe(
      "disclosure",
      h(Disclosure, {
        busy: false,
        content: h("span", null, "Panel"),
        density: "comfortable",
        describedBy: [],
        disabled: false,
        expanded: false,
        id: "target-disclosure",
        invalid: false,
        label: ".",
        onExpandedChange: noop,
        panelId: "target-disclosure-panel",
      }),
    ),
    probe(
      "link-button",
      h(LinkButton, {
        busy: false,
        density: "comfortable",
        describedBy: [],
        destination: { href: "#target-fragment", kind: "fragment" },
        disabled: false,
        id: "target-link-button",
        invalid: false,
        label: ".",
      }),
    ),
    probe(
      "input",
      h(
        "div",
        { style: { inlineSize: "1px" } },
        h(Input, {
          accessibleName: "Narrow input",
          busy: false,
          density: "comfortable",
          describedBy: [],
          disabled: false,
          id: "target-input",
          inputType: "text",
          invalid: false,
          onValueChange: noop,
          placeholder: null,
          readOnly: false,
          value: "",
        }),
      ),
    ),
    probe(
      "checkbox",
      h(Checkbox, {
        busy: false,
        checked: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-checkbox",
        invalid: false,
        label: ".",
        onCheckedChange: noop,
      }),
    ),
    probe(
      "textarea",
      h(Textarea, {
        accessibleName: "Narrow textarea",
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-textarea",
        invalid: false,
        maxCodePoints: 32,
        onValueChange: noop,
        placeholder: null,
        readOnly: false,
        rows: 1,
        value: "",
      }),
    ),
    probe(
      "listbox",
      h(Listbox, {
        accessibleName: "Narrow listbox",
        activeId: "target-radio-option",
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-listbox",
        invalid: false,
        onSelectionChange: noop,
        options: radioOptions,
        selectedIds: ["target-radio-option"],
        selectionMode: "single",
      }),
    ),
    probe(
      "radio",
      h(RadioGroup, {
        accessibleName: "Narrow radio group",
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-radio",
        insideToolbar: false,
        invalid: false,
        onValueChange: noop,
        options: radioOptions,
        value: "only",
      }),
    ),
    probe(
      "switch",
      h(Switch, {
        busy: false,
        checked: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-switch",
        invalid: false,
        label: ".",
        onCheckedChange: noop,
      }),
    ),
    probe(
      "slider",
      h(Slider, {
        accessibleName: "Narrow slider",
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-slider",
        invalid: false,
        max: 100,
        min: 0,
        onValueChange: noop,
        orientation: "horizontal",
        pageStep: 10,
        step: 1,
        value: 50,
        valueText: "50 percent",
      }),
    ),
    probe(
      "toggle",
      h(Toggle, {
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-toggle",
        invalid: false,
        label: ".",
        onPressedChange: noop,
        pressed: false,
      }),
    ),
    probe(
      "table",
      h(DataTable<{ readonly id: string; readonly value: string }>, {
        caption: "Narrow table",
        columns: [
          {
            id: "target-column",
            label: ".",
            renderText: (row) => row.value,
            scope: "col",
            sortable: true,
          },
        ],
        emptyMessage: "No rows",
        id: "target-table",
        onSortChange: noop,
        rowId: (row) => row.id,
        rows: [{ id: "target-row", value: "." }],
        sort: null,
      }),
    ),
    probe(
      "tree",
      h(Tree, {
        accessibleName: "Target tree",
        activeId: "target-tree-root",
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-tree",
        invalid: false,
        nodes: treeNodes,
        onAction: noop,
        rootIds: ["target-tree-root"],
        selectionMode: "multiple",
      }),
    ),
    probe(
      "panels",
      h(ResizablePanels, {
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        id: "target-panels",
        invalid: false,
        onCollapsedIdsChange: noop,
        onSizesChange: noop,
        orientation: "horizontal",
        panels,
      }),
    ),
    probe(
      "timeline",
      h(TimelineLane, {
        accessibleName: "Target timeline",
        activeId: "target-timeline-a",
        busy: false,
        density: "comfortable",
        describedBy: [],
        disabled: false,
        horizontalScroll: true,
        id: "target-timeline",
        invalid: false,
        items: timelineItems,
        onAction: noop,
      }),
    ),
    probe("non-target", h(Badge, { label: ".", tone: "neutral" })),
  );
}

const root = document.getElementById("u0-target-size-root");
if (!(root instanceof HTMLElement)) {
  throw new Error("U0_TARGET_SIZE_ROOT_MISSING");
}
render(h(TargetSizeHarness, null), root);
