/** @jsxImportSource preact */
import { render, type ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

import primitiveMatrixFixture from "../fixtures/ui/primitive-state-matrix.json";
import {
  Accordion,
  AlertDialog,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Combobox,
  CommandPalette,
  ContextMenu,
  DataTable,
  Dialog,
  Disclosure,
  EmptyState,
  Field,
  FocusDismissLayer,
  IconButton,
  Input,
  Kbd,
  KeyValueList,
  Label,
  LinkButton,
  Listbox,
  Menu,
  Meter,
  NumberField,
  Popover,
  Progress,
  RadioGroup,
  ResizablePanels,
  RovingFocus,
  ScrollArea,
  SegmentedControl,
  Select,
  Separator,
  SheetDrawer,
  Skeleton,
  Slider,
  Spinner,
  StatusPill,
  Switch,
  Tabs,
  Textarea,
  TimelineLane,
  ToastNotice,
  Toggle,
  ToggleGroup,
  Toolbar,
  Tooltip,
  Tree,
  VisuallyHidden,
  type UiButtonProps,
  type UiCommonProps,
  type UiOption,
} from "../../src/ui";

const GALLERY_COMPONENT_NAMES = Object.freeze([
  "Button",
  "IconButton",
  "LinkButton",
  "Badge",
  "Kbd",
  "Separator",
  "Skeleton",
  "Spinner",
  "VisuallyHidden",
  "Card",
  "EmptyState",
  "StatusPill",
  "Progress",
  "Meter",
  "Field",
  "Label",
  "Input",
  "Textarea",
  "NumberField",
  "Select",
  "Combobox",
  "Listbox",
  "Checkbox",
  "RadioGroup",
  "Switch",
  "Slider",
  "SegmentedControl",
  "Toggle",
  "ToggleGroup",
  "Tabs",
  "Breadcrumb",
  "Toolbar",
  "Menu",
  "ContextMenu",
  "CommandPalette",
  "Disclosure",
  "Accordion",
  "ScrollArea",
  "RovingFocus",
  "Tooltip",
  "Popover",
  "Dialog",
  "AlertDialog",
  "SheetDrawer",
  "ToastNotice",
  "FocusDismissLayer",
  "KeyValueList",
  "DataTable",
  "Tree",
  "ResizablePanels",
  "TimelineLane",
] as const);

const GALLERY_STATES = Object.freeze([
  "default",
  "hover",
  "active",
  "focus",
  "disabled",
  "loading",
  "error",
  "empty",
  "dense",
  "responsive",
  "forced-colors",
  "reduced-motion",
  "200-percent-zoom",
  "touch",
] as const);

type GalleryComponentName = (typeof GALLERY_COMPONENT_NAMES)[number];
type GalleryState = (typeof GALLERY_STATES)[number];
type JsonRecord = Record<string, unknown>;

export type U0GalleryComponent = Readonly<{
  id: string;
  name: GalleryComponentName;
  group: string;
  kind: "behavior" | "render";
}>;

export type U0GalleryCellProps = Readonly<{
  setId: string;
  variant: GalleryState;
  disabled: boolean;
  busy: boolean;
  invalid: boolean;
  empty: boolean;
  density: "comfortable" | "dense";
  environment: string;
  interaction: string;
}>;

export type U0GalleryCell = Readonly<{
  id: string;
  componentId: string;
  state: GalleryState;
  applicability: "applicable" | "not-applicable";
  props: U0GalleryCellProps | null;
  expected: Readonly<{ role: string; name: string | null }> | null;
  notApplicableReason: string | null;
}>;

export const U0_COMPONENT_GALLERY_ROUTE = Object.freeze({
  id: "u0-component-gallery",
  path: "/__tests__/u0-component-gallery",
} as const);

export const U0_COMPONENT_GALLERY_HEADING = "U0 Component Gallery";
export const U0_COMPONENT_GALLERY_MARKER = "data-u0-component-gallery";
export const U0_COMPONENT_GALLERY_TEST_CONTROL = "data-u0-test-control";
export const U0_COMPONENT_GALLERY_RELEASE_SENTINELS = Object.freeze([
  U0_COMPONENT_GALLERY_ROUTE.id,
  U0_COMPONENT_GALLERY_ROUTE.path,
  U0_COMPONENT_GALLERY_HEADING,
  U0_COMPONENT_GALLERY_MARKER,
  U0_COMPONENT_GALLERY_TEST_CONTROL,
  "data-u0-gallery-cell-id",
  "data-u0-gallery-last-event-value",
  "data-u0-gallery-not-applicable-id",
  "Test-only reviewed fixture composition",
  "Gallery fixture cell",
  "Fixture-owned component and state",
  "Reset gallery specimen",
  "Last event value:",
  "Reviewed not-applicable cells",
  "Fixture ID:",
  "U0-GAL-",
  "U0-PROPS-",
] as const);

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`U0_GALLERY_FIXTURE_OBJECT_REQUIRED: ${path}`);
  }
  return value as JsonRecord;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`U0_GALLERY_FIXTURE_STRING_REQUIRED: ${path}`);
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`U0_GALLERY_FIXTURE_BOOLEAN_REQUIRED: ${path}`);
  }
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringValue(value, path);
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`U0_GALLERY_FIXTURE_ARRAY_REQUIRED: ${path}`);
  }
  return value;
}

function oneOf<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  path: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`U0_GALLERY_FIXTURE_VOCABULARY: ${path}`);
  }
  return value;
}

function decodeComponents(root: JsonRecord): readonly U0GalleryComponent[] {
  const names = GALLERY_COMPONENT_NAMES as readonly string[];
  return arrayValue(root["components"], "components").map((value, index) => {
    const component = record(value, `components[${String(index)}]`);
    return Object.freeze({
      id: stringValue(component["id"], `components[${String(index)}].id`),
      name: oneOf(
        component["name"],
        names,
        `components[${String(index)}].name`,
      ) as GalleryComponentName,
      group: stringValue(
        component["group"],
        `components[${String(index)}].group`,
      ),
      kind: oneOf(
        component["kind"],
        ["behavior", "render"] as const,
        `components[${String(index)}].kind`,
      ),
    });
  });
}

function decodeCellProps(value: unknown, path: string): U0GalleryCellProps {
  const props = record(value, path);
  return Object.freeze({
    setId: stringValue(props["setId"], `${path}.setId`),
    variant: oneOf(props["variant"], GALLERY_STATES, `${path}.variant`),
    disabled: booleanValue(props["disabled"], `${path}.disabled`),
    busy: booleanValue(props["busy"], `${path}.busy`),
    invalid: booleanValue(props["invalid"], `${path}.invalid`),
    empty: booleanValue(props["empty"], `${path}.empty`),
    density: oneOf(
      props["density"],
      ["comfortable", "dense"] as const,
      `${path}.density`,
    ),
    environment: stringValue(props["environment"], `${path}.environment`),
    interaction: stringValue(props["interaction"], `${path}.interaction`),
  });
}

function decodeCells(root: JsonRecord): readonly U0GalleryCell[] {
  return arrayValue(root["galleryCells"], "galleryCells").map(
    (value, index) => {
      const path = `galleryCells[${String(index)}]`;
      const cell = record(value, path);
      const applicability = oneOf(
        cell["applicability"],
        ["applicable", "not-applicable"] as const,
        `${path}.applicability`,
      );
      const expected =
        cell["expected"] === null
          ? null
          : record(cell["expected"], `${path}.expected`);
      const decoded: U0GalleryCell = {
        id: stringValue(cell["id"], `${path}.id`),
        componentId: stringValue(cell["componentId"], `${path}.componentId`),
        state: oneOf(cell["state"], GALLERY_STATES, `${path}.state`),
        applicability,
        props:
          cell["props"] === null
            ? null
            : decodeCellProps(cell["props"], `${path}.props`),
        expected:
          expected === null
            ? null
            : Object.freeze({
                role: stringValue(expected["role"], `${path}.expected.role`),
                name: nullableString(
                  expected["name"],
                  `${path}.expected.name`,
                ),
              }),
        notApplicableReason: nullableString(
          cell["notApplicableReason"],
          `${path}.notApplicableReason`,
        ),
      };
      if (
        (applicability === "applicable" &&
          (decoded.props === null || decoded.expected === null)) ||
        (applicability === "not-applicable" &&
          (decoded.props !== null ||
            decoded.expected !== null ||
            decoded.notApplicableReason === null))
      ) {
        throw new Error(`U0_GALLERY_FIXTURE_APPLICABILITY: ${path}`);
      }
      return Object.freeze(decoded);
    },
  );
}

const fixtureRoot = record(
  primitiveMatrixFixture,
  "primitive-state-matrix.json",
);

export const U0_COMPONENT_GALLERY_COMPONENTS = Object.freeze(
  decodeComponents(fixtureRoot),
);
export const U0_COMPONENT_GALLERY_CELLS = Object.freeze(
  decodeCells(fixtureRoot),
);
export const U0_COMPONENT_GALLERY_APPLICABLE_CELLS = Object.freeze(
  U0_COMPONENT_GALLERY_CELLS.filter(
    (cell): cell is U0GalleryCell & {
      applicability: "applicable";
      props: U0GalleryCellProps;
      expected: NonNullable<U0GalleryCell["expected"]>;
    } => cell.applicability === "applicable",
  ),
);
export const U0_COMPONENT_GALLERY_NOT_APPLICABLE_CELLS = Object.freeze(
  U0_COMPONENT_GALLERY_CELLS.filter(
    (cell) => cell.applicability === "not-applicable",
  ),
);

const componentById = new Map(
  U0_COMPONENT_GALLERY_COMPONENTS.map((component) => [component.id, component]),
);
if (
  componentById.size !== U0_COMPONENT_GALLERY_COMPONENTS.length ||
  U0_COMPONENT_GALLERY_COMPONENTS.length !== GALLERY_COMPONENT_NAMES.length
) {
  throw new Error("U0_GALLERY_COMPONENT_INVENTORY_MISMATCH");
}
for (const cell of U0_COMPONENT_GALLERY_CELLS) {
  if (!componentById.has(cell.componentId)) {
    throw new Error(`U0_GALLERY_UNKNOWN_COMPONENT: ${cell.componentId}`);
  }
}

export const U0_COMPONENT_GALLERY_COUNTS = Object.freeze({
  components: U0_COMPONENT_GALLERY_COMPONENTS.length,
  cells: U0_COMPONENT_GALLERY_CELLS.length,
  applicable: U0_COMPONENT_GALLERY_APPLICABLE_CELLS.length,
  notApplicable: U0_COMPONENT_GALLERY_NOT_APPLICABLE_CELLS.length,
});

type ApplicableCell = (typeof U0_COMPONENT_GALLERY_APPLICABLE_CELLS)[number];

function specimenId(cell: ApplicableCell, suffix = "control"): string {
  const sequence = cell.componentId.slice(-3);
  const state = cell.state.replaceAll("-", "_");
  return `u0g_${sequence}_${state}_${suffix}`;
}

function accessibleName(
  component: U0GalleryComponent,
  cell: ApplicableCell,
): string {
  return cell.expected.name ?? `${component.name} ${cell.state} example`;
}

function commonProps(cell: ApplicableCell): UiCommonProps {
  const errorId = specimenId(cell, "error");
  return {
    id: specimenId(cell),
    density: cell.props.density,
    disabled: cell.props.disabled,
    busy: cell.props.busy,
    invalid: cell.props.invalid,
    describedBy: cell.props.invalid ? [errorId] : [],
  };
}

function optionsFor(cell: ApplicableCell): readonly UiOption[] {
  if (cell.props.empty) return [];
  return [
    {
      id: specimenId(cell, "option_a"),
      value: "alpha",
      label: "Alpha",
      description: "First deterministic option",
      disabled: false,
    },
    {
      id: specimenId(cell, "option_b"),
      value: "beta",
      label: "Beta",
      description: "Disabled near-miss option",
      disabled: true,
    },
  ];
}

type DelayedOverlayIds = Readonly<{
  triggerId: string;
  workspaceId: string;
  backgroundId: string;
}>;

function DelayedOverlayHost(props: Readonly<{
  baseId: string;
  children: (ids: DelayedOverlayIds, ready: boolean) => ComponentChildren;
}>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [ready, setReady] = useState(false);
  const ids = useMemo(
    (): DelayedOverlayIds => ({
      triggerId: `${props.baseId}_trigger`,
      workspaceId: `${props.baseId}_workspace`,
      backgroundId: `${props.baseId}_background`,
    }),
    [props.baseId],
  );

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (trigger === null) return;
    trigger.focus();
    if (trigger.ownerDocument.activeElement === trigger) setReady(true);
  }, [ids.triggerId]);

  return (
    <div class="u0-gallery__overlay-host">
      <div class="u0-gallery__overlay-background" id={ids.backgroundId}>
        <button id={ids.triggerId} ref={triggerRef} type="button">
          Specimen trigger
        </button>
        <button id={ids.workspaceId} type="button">
          Workspace focus fallback
        </button>
      </div>
      {props.children(ids, ready)}
    </div>
  );
}

type GalleryEventRecorder = (event?: unknown) => void;

function emptyAction(
  id: string,
  label: string,
  recordEvent: GalleryEventRecorder,
): UiButtonProps {
  return {
    id,
    density: "comfortable",
    disabled: false,
    busy: false,
    invalid: false,
    describedBy: [],
    label,
    variant: "secondary",
    type: "button",
    onAction: recordEvent,
  };
}

function renderSpecimen(
  component: U0GalleryComponent,
  cell: ApplicableCell,
  recordEvent: GalleryEventRecorder,
): ComponentChildren {
  const common = commonProps(cell);
  const name = accessibleName(component, cell);
  const options = optionsFor(cell);
  const firstOption = options[0] ?? null;
  const content = cell.props.empty ? (
    <p>No specimen content is available.</p>
  ) : (
    <p>Deterministic specimen content.</p>
  );

  switch (component.name) {
    case "Button":
      return (
        <Button
          {...common}
          label={name}
          onAction={recordEvent}
          type="button"
          variant={cell.props.invalid ? "destructive" : "primary"}
        />
      );
    case "IconButton":
      return (
        <IconButton
          {...common}
          accessibleName={name}
          iconId={cell.props.invalid ? "error" : "status"}
          onAction={recordEvent}
          type="button"
          variant="secondary"
        />
      );
    case "LinkButton":
      return (
        <>
          <LinkButton
            {...common}
            destination={{ kind: "fragment", href: `#${specimenId(cell, "target")}` }}
            label={name}
          />
          <span id={specimenId(cell, "target")}>Local gallery target</span>
        </>
      );
    case "Badge":
      return <Badge label={cell.props.empty ? "No badge value" : name} tone={cell.props.invalid ? "error" : "info"} />;
    case "Kbd":
      return <Kbd keys={[cell.props.density === "dense" ? "⌘" : "Control", "K"]} />;
    case "Separator":
      return <Separator accessibleName={null} decorative orientation="horizontal" />;
    case "Skeleton":
      return <Skeleton ariaHidden lines={cell.props.density === "dense" ? 1 : 3} shape="text" />;
    case "Spinner":
      return <Spinner accessibleName={name} ariaHidden={false} mode="status" />;
    case "VisuallyHidden":
      return <VisuallyHidden content={name} focusableWhenSkippedTo={cell.state === "focus"} />;
    case "Card": {
      const headingId = specimenId(cell, "heading");
      return (
        <Card
          content={<><h3 id={headingId}>{name}</h3>{content}</>}
          headingId={headingId}
          id={common.id}
          interactive={false}
          tone={cell.props.invalid ? "error" : "neutral"}
        />
      );
    }
    case "EmptyState":
      return (
        <EmptyState
          description="The selected state intentionally has no records."
          illustration={null}
          primaryAction={cell.props.empty ? null : emptyAction(specimenId(cell, "primary"), "Add record", recordEvent)}
          secondaryAction={null}
          title={name}
        />
      );
    case "StatusPill":
      return <StatusPill iconId={cell.props.invalid ? "error" : "status"} label={cell.props.empty ? "No status" : name} tone={cell.props.invalid ? "error" : "info"} />;
    case "Progress":
      return <Progress accessibleName={name} max={100} min={0} value={cell.props.busy ? null : cell.props.empty ? 0 : 64} valueText={cell.props.busy ? "Loading" : "64 percent"} />;
    case "Meter":
      return <Meter accessibleName={name} high={80} low={30} max={100} min={0} optimum={70} value={cell.props.empty ? 0 : 64} valueText={cell.props.empty ? "No value" : "64 of 100"} />;
    case "Field": {
      const controlId = specimenId(cell, "field_control");
      const labelId = specimenId(cell, "field_label");
      const descriptionId = specimenId(cell, "field_help");
      const errorId = specimenId(cell, "field_error");
      return (
        <Field
          content={
            <>
              <Label controlId={controlId} id={labelId} required text={name} />
              <Input
                {...common}
                accessibleName={name}
                describedBy={cell.props.invalid ? [descriptionId, errorId] : [descriptionId]}
                id={controlId}
                inputType="text"
                onValueChange={recordEvent}
                placeholder="Field value"
                readOnly={false}
                value={cell.props.empty ? "" : "Autumn Leaves"}
              />
              <p id={descriptionId}>A deterministic field description.</p>
              {cell.props.invalid ? <p id={errorId}>Retain the raw value and correct the error.</p> : null}
            </>
          }
          controlId={controlId}
          descriptionIds={[descriptionId]}
          errorIds={cell.props.invalid ? [errorId] : []}
          id={common.id}
          invalid={cell.props.invalid}
          labelId={labelId}
          required
        />
      );
    }
    case "Label": {
      const controlId = specimenId(cell, "label_control");
      return <><Label controlId={controlId} id={common.id} required={false} text={name} /><input disabled={cell.props.disabled} id={controlId} /></>;
    }
    case "Input":
      return <Input {...common} accessibleName={name} inputType="text" onValueChange={recordEvent} placeholder="Type a value" readOnly={false} value={cell.props.empty ? "" : "Dm7 G7 Cmaj7"} />;
    case "Textarea":
      return <Textarea {...common} accessibleName={name} maxCodePoints={4096} onValueChange={recordEvent} placeholder="Add notes" readOnly={false} rows={3} value={cell.props.empty ? "" : "A deterministic annotation."} />;
    case "NumberField":
      return <NumberField {...common} accessibleName={name} max={300} min={30} onValueChange={recordEvent} parsedValue={cell.props.invalid ? null : 120} placeholder="Tempo" readOnly={false} step={1} value={cell.props.invalid ? "12x" : cell.props.empty ? "" : "120"} />;
    case "Select":
      return <Select {...common} accessibleName={name} onValueChange={recordEvent} options={options} value={firstOption?.value ?? null} />;
    case "Combobox":
      return <Combobox {...common} accessibleName={name} activeOptionId={firstOption?.id ?? null} autocomplete="list-manual" inputValue={cell.props.empty ? "" : "Al"} onInputChange={recordEvent} onOpenChange={recordEvent} onValueChange={recordEvent} open={!cell.props.empty} options={options} selectedValue={firstOption?.value ?? null} />;
    case "Listbox":
      return <Listbox {...common} accessibleName={name} activeId={firstOption?.id ?? null} onSelectionChange={recordEvent} options={options} selectedIds={firstOption === null ? [] : [firstOption.id]} selectionMode="single" />;
    case "Checkbox":
      return <Checkbox {...common} checked={cell.state === "active" ? "mixed" : cell.state === "default" ? false : true} label={name} onCheckedChange={recordEvent} />;
    case "RadioGroup":
      return <RadioGroup {...common} accessibleName={name} insideToolbar={false} onValueChange={recordEvent} options={options} value={firstOption?.value ?? null} />;
    case "Switch":
      return <Switch {...common} checked={cell.state === "active"} label={name} onCheckedChange={recordEvent} />;
    case "Slider":
      return <Slider {...common} accessibleName={name} max={100} min={0} onValueChange={recordEvent} orientation="horizontal" pageStep={10} step={1} value={64} valueText="64 percent" />;
    case "SegmentedControl":
      return <SegmentedControl {...common} accessibleName={name} insideToolbar={false} onValueChange={recordEvent} options={options} value={firstOption?.value ?? null} />;
    case "Toggle":
      return <Toggle {...common} label={name} onPressedChange={recordEvent} pressed={cell.state === "active"} />;
    case "ToggleGroup": {
      const itemA = { ...common, id: specimenId(cell, "toggle_a"), label: "Alpha", pressed: !cell.props.empty, onPressedChange: recordEvent };
      const itemB = { ...common, id: specimenId(cell, "toggle_b"), label: "Beta", pressed: false, onPressedChange: recordEvent };
      const items = cell.props.empty ? [] : [itemA, itemB];
      return <ToggleGroup {...common} accessibleName={name} items={items} onPressedIdsChange={recordEvent} pressedIds={cell.props.empty ? [] : [itemA.id]} selectionMode="multiple" />;
    }
    case "Tabs": {
      const tabId = specimenId(cell, "tab");
      const tabs = cell.props.empty ? [] : [{ id: tabId, panelId: specimenId(cell, "panel"), label: "Harmony", disabled: false }];
      return <Tabs {...common} accessibleName={name} activation="manual" activeId={cell.props.empty ? null : tabId} focusedId={cell.props.empty ? null : tabId} onActiveChange={recordEvent} orientation="horizontal" tabs={tabs} />;
    }
    case "Breadcrumb":
      return <Breadcrumb accessibleName={name} items={[{ id: specimenId(cell, "crumb"), label: cell.props.empty ? "No current location" : "Studio", href: null, current: true }]} />;
    case "Toolbar": {
      const itemIds = cell.props.empty ? [] : [specimenId(cell, "tool_a"), specimenId(cell, "tool_b"), specimenId(cell, "tool_c")];
      const toolbarContent = itemIds.map((id, index) => <Button key={id} {...common} id={id} label={`Tool ${String(index + 1)}`} onAction={recordEvent} type="button" variant="ghost" />);
      return <Toolbar {...common} accessibleName={name} content={toolbarContent} focusedId={itemIds[0] ?? null} itemIds={itemIds} orientation="horizontal" />;
    }
    case "Menu": {
      const items = cell.props.empty ? [] : [{ id: specimenId(cell, "menu_action"), kind: "action" as const, label: "Apply voicing", disabled: false }];
      return <Menu {...common} accessibleName={name} activeItemId={items[0]?.id ?? null} items={items} onAction={recordEvent} onOpenChange={recordEvent} open={cell.state === "active" || cell.state === "focus" || cell.props.empty} triggerId={specimenId(cell, "menu_trigger")} />;
    }
    case "ContextMenu": {
      const targetId = specimenId(cell, "context_target");
      const items = cell.props.empty ? [] : [{ id: specimenId(cell, "context_action"), kind: "action" as const, label: "Inspect chord", disabled: false }];
      return <><button id={targetId} type="button">Context target</button><ContextMenu {...common} accessibleName={name} activeItemId={items[0]?.id ?? null} anchor={{ clientX: 24, clientY: 24 }} items={items} onAction={recordEvent} onOpenChange={recordEvent} open targetId={targetId} triggerId={specimenId(cell, "context_trigger")} /></>;
    }
    case "CommandPalette": {
      const commands = cell.props.empty ? [] : [{ id: specimenId(cell, "command"), label: "Add turnaround", description: "Insert a deterministic ii-V", keywords: ["turnaround"], disabled: false }];
      return <DelayedOverlayHost baseId={common.id}>{(_ids, ready) => ready ? <CommandPalette {...common} accessibleName={name} activeItemId={commands[0]?.id ?? null} items={commands} onAction={recordEvent} onOpenChange={recordEvent} onQueryChange={recordEvent} open query={cell.props.empty ? "no match" : ""} /> : null}</DelayedOverlayHost>;
    }
    case "Disclosure":
      return <Disclosure {...common} content={content} expanded={!cell.props.empty && cell.state !== "default"} label={name} onExpandedChange={recordEvent} panelId={specimenId(cell, "disclosure_panel")} />;
    case "Accordion": {
      const itemId = specimenId(cell, "accordion_trigger");
      const items = cell.props.empty ? [] : [{ id: itemId, headingLevel: 3 as const, label: "Voicing details", panelId: specimenId(cell, "accordion_panel"), expanded: cell.state === "active", disabled: false, content }];
      return <Accordion {...common} accessibleName={name} focusedId={cell.props.empty || cell.props.disabled || cell.props.busy ? null : itemId} items={items} onExpandedIdsChange={recordEvent} selectionMode="single" />;
    }
    case "ScrollArea":
      return <ScrollArea accessibleName={name} content={<div>{content}<p>Scrollable continuation.</p></div>} id={common.id} nativeScrollbar orientation="vertical" />;
    case "RovingFocus": {
      const items = cell.props.empty ? [] : [specimenId(cell, "rove_a"), specimenId(cell, "rove_b")];
      const result = RovingFocus({ ownerId: common.id, orientation: "horizontal", wrap: true, itemIds: items, disabledIds: cell.props.disabled && items[1] !== undefined ? [items[1]] : [], currentId: items[0] ?? null, typeahead: false });
      return <div aria-label={name} role="group"><output>{result.ok ? "Roving focus boundary accepted" : result.refusal.code}</output>{items.map((id, index) => <button id={id} key={id} tabIndex={index === 0 ? 0 : -1} type="button">Item {String(index + 1)}</button>)}</div>;
    }
    case "Tooltip":
      return <DelayedOverlayHost baseId={common.id}>{(ids, ready) => ready ? <Tooltip id={common.id} onOpenChange={recordEvent} open text={name} triggerId={ids.triggerId} /> : null}</DelayedOverlayHost>;
    case "Popover":
      return <DelayedOverlayHost baseId={common.id}>{(ids, ready) => ready ? <Popover {...common} accessibleName={name} content={<Button {...common} id={specimenId(cell, "popover_action")} label="Popover action" onAction={recordEvent} type="button" variant="secondary" />} onOpenChange={recordEvent} open triggerId={ids.triggerId} /> : null}</DelayedOverlayHost>;
    case "Dialog":
      return <DelayedOverlayHost baseId={common.id}>{(ids, ready) => ready ? <Dialog {...common} backgroundRootId={ids.backgroundId} closeLabel="Close dialog" content={<Button {...common} id={specimenId(cell, "dialog_action")} label="Apply" onAction={recordEvent} type="button" variant="primary" />} description={cell.props.empty ? "This dialog has no records." : "A deterministic modal specimen."} dismissibility={{ kind: "dismissible" }} focusTargets={{ triggerId: ids.triggerId, workflowTargetId: null, workspaceId: ids.workspaceId }} initialFocus="first-control" initialFocusId={null} onContractRefusal={recordEvent} onDismiss={recordEvent} open title={name} /> : null}</DelayedOverlayHost>;
    case "AlertDialog": {
      const leastId = specimenId(cell, "alert_cancel");
      const confirmId = specimenId(cell, "alert_confirm");
      return <DelayedOverlayHost baseId={common.id}>{(ids, ready) => ready ? <AlertDialog {...common} backgroundRootId={ids.backgroundId} closeLabel="Cancel alert" confirmActionId={confirmId} content={<><Button {...common} id={leastId} label="Keep chart" onAction={recordEvent} type="button" variant="secondary" /><Button {...common} id={confirmId} label="Discard chart" onAction={recordEvent} type="button" variant="destructive" /></>} description="This action cannot be undone." dismissibility={{ kind: "dismissible" }} focusTargets={{ triggerId: ids.triggerId, workflowTargetId: null, workspaceId: ids.workspaceId }} initialFocus="explicit" initialFocusId={leastId} leastDestructiveActionId={leastId} onContractRefusal={recordEvent} onDismiss={recordEvent} open title={name} /> : null}</DelayedOverlayHost>;
    }
    case "SheetDrawer":
      return <DelayedOverlayHost baseId={common.id}>{(ids, ready) => ready ? <SheetDrawer {...common} backgroundRootId={ids.backgroundId} closeLabel="Close sheet" content={content} contextRevealCssPx={48} description="A deterministic drawer specimen." dismissibility={{ kind: "dismissible" }} focusTargets={{ triggerId: ids.triggerId, workflowTargetId: null, workspaceId: ids.workspaceId }} initialFocus="heading" initialFocusId={null} mode="nonmodal" onContractRefusal={recordEvent} onDismiss={recordEvent} open side="inline-end" title={name} /> : null}</DelayedOverlayHost>;
    case "ToastNotice":
      return <ToastNotice hiddenNoticeCount={cell.props.empty ? 0 : 2} notices={cell.props.empty ? [] : [{ id: specimenId(cell, "notice"), sequence: 1, tone: cell.props.invalid ? "error" : "info", title: name, message: "The persistent notice source remains available.", dismissible: true, persistent: true }]} onDismiss={recordEvent} onOpenNoticeCenter={recordEvent} />;
    case "FocusDismissLayer": {
      const root = cell.props.empty ? null : { id: specimenId(cell, "layer_root"), ownerId: common.id, kind: "popover" as const, mode: "nonmodal" as const, triggerId: specimenId(cell, "layer_trigger"), titleId: null, descriptionId: null, initialFocusId: null, restoreFocusId: specimenId(cell, "layer_restore"), requestRevision: 0, dismissibility: { kind: "dismissible" as const } };
      const result = FocusDismissLayer({ state: { root, descendantNonmodalIds: [], activeTransientId: null, modalScopeDepth: 0, dismissAncestorIds: [] }, backgroundRootId: specimenId(cell, "layer_background"), inertWhenModal: true, escapePolicy: "dismiss-when-owner-allows", outsidePointerDismissesNonmodal: true });
      return <output aria-label={name}>{result.ok ? "Focus-dismiss layer preflight accepted" : result.refusal.code}</output>;
    }
    case "KeyValueList":
      return <KeyValueList accessibleName={name} items={cell.props.empty ? [] : [{ id: specimenId(cell, "fact"), key: "Key", value: "C minor", description: "Fixture-owned order" }]} />;
    case "DataTable": {
      const rows = cell.props.empty ? [] : [{ id: specimenId(cell, "row"), chord: "Dm7" }];
      return <DataTable caption={name} columns={[{ id: specimenId(cell, "column"), label: "Chord", scope: "col", renderText: (row: { id: string; chord: string }) => row.chord, sortable: true }]} emptyMessage="No rows are available." id={common.id} onSortChange={recordEvent} rowId={(row) => row.id} rows={rows} sort={null} />;
    }
    case "Tree": {
      const parentId = specimenId(cell, "tree_parent");
      const childId = specimenId(cell, "tree_child");
      const expanded = cell.state === "active";
      const nodes = cell.props.empty ? [] : [
        { id: parentId, parentId: null, label: "Section A", childIds: [childId], expanded, selected: true, disabled: false },
        { id: childId, parentId, label: "Section A.1", childIds: [], expanded: false, selected: true, disabled: false },
      ];
      return <Tree {...common} accessibleName={name} activeId={cell.props.empty ? null : parentId} nodes={nodes} onAction={recordEvent} rootIds={cell.props.empty ? [] : [parentId]} selectionMode="multiple" />;
    }
    case "ResizablePanels":
      return <ResizablePanels {...common} onCollapsedIdsChange={recordEvent} onSizesChange={recordEvent} orientation="horizontal" panels={[{ id: specimenId(cell, "left_panel"), label: "Chart", minPercent: 20, maxPercent: 80, sizePercent: 50, collapsible: true, collapsed: false }, { id: specimenId(cell, "right_panel"), label: "Inspector", minPercent: 20, maxPercent: 80, sizePercent: 50, collapsible: true, collapsed: false }]} />;
    case "TimelineLane": {
      const timelineId = specimenId(cell, "timeline_item");
      return <TimelineLane {...common} accessibleName={name} activeId={cell.props.empty ? null : timelineId} horizontalScroll items={cell.props.empty ? [] : [{ id: timelineId, label: "Dm7", exactStart: "0/1", exactDuration: "1/1", selected: true, disabled: false }]} onAction={recordEvent} />;
    }
  }
}

function GallerySpecimen(props: Readonly<{
  cell: ApplicableCell;
  component: U0GalleryComponent;
}>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [lastEventValue, setLastEventValue] = useState("none");
  const recordEvent: GalleryEventRecorder = (event) => {
    setEventCount((count) => count + 1);
    if (typeof event === "object" && event !== null && "value" in event) {
      const value = event.value;
      setLastEventValue(typeof value === "string" ? value : "non-string");
    } else {
      setLastEventValue("none");
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        "button, a[href], input, select, textarea, [tabindex]",
      ),
    );
    const candidate =
      candidates.find(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          element.closest("[inert], [aria-hidden='true']") === null,
      ) ?? root;
    candidate.setAttribute("data-u0-gallery-control", "true");
    if (props.cell.props.interaction === "focus") candidate.focus();
  }, [props.cell.id, props.cell.props.interaction]);

  return (
    <div
      class="u0-gallery__specimen"
      data-density={props.cell.props.density}
      data-environment={props.cell.props.environment}
      data-interaction={props.cell.props.interaction}
      data-u0-gallery-active-cell={props.cell.id}
      ref={rootRef}
      tabIndex={-1}
    >
      <div class="u0-gallery__specimen-stage">
        {renderSpecimen(props.component, props.cell, recordEvent)}
      </div>
      {props.cell.props.invalid ? (
        <p id={specimenId(props.cell, "error")} role="alert">
          The raw value is preserved. Correct the highlighted field and retry.
        </p>
      ) : null}
      <output
        aria-live="polite"
        class="u0-gallery__event-count"
        data-u0-gallery-last-event-value={lastEventValue}
      >
        Recorded events: {eventCount}. Last event value: {lastEventValue}
      </output>
    </div>
  );
}

function initialCellId(): string {
  const fallback = U0_COMPONENT_GALLERY_APPLICABLE_CELLS[0]?.id;
  if (fallback === undefined) throw new Error("U0_GALLERY_NO_APPLICABLE_CELLS");
  if (typeof window === "undefined") return fallback;
  const requested = new URL(window.location.href).searchParams.get("cell");
  return U0_COMPONENT_GALLERY_APPLICABLE_CELLS.some(
    (cell) => cell.id === requested,
  )
    ? requested ?? fallback
    : fallback;
}

export function U0ComponentGallery() {
  const [selectedId, setSelectedId] = useState(initialCellId);
  const selected =
    U0_COMPONENT_GALLERY_APPLICABLE_CELLS.find(
      (cell) => cell.id === selectedId,
    ) ?? U0_COMPONENT_GALLERY_APPLICABLE_CELLS[0];
  if (selected === undefined) throw new Error("U0_GALLERY_SELECTION_MISSING");
  const component = componentById.get(selected.componentId);
  if (component === undefined) throw new Error("U0_GALLERY_COMPONENT_MISSING");

  const selectCell = (id: string) => {
    if (!U0_COMPONENT_GALLERY_APPLICABLE_CELLS.some((cell) => cell.id === id)) {
      return;
    }
    setSelectedId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("route", U0_COMPONENT_GALLERY_ROUTE.id);
      url.searchParams.set("cell", id);
      window.history.replaceState(null, "", url);
    }
  };

  return (
    <main
      class="u0-gallery"
      data-route-id={U0_COMPONENT_GALLERY_ROUTE.id}
      data-u0-component-gallery={U0_COMPONENT_GALLERY_ROUTE.id}
    >
      <header class="u0-gallery__header">
        <p class="u0-gallery__eyebrow">Test-only reviewed fixture composition</p>
        <h1>{U0_COMPONENT_GALLERY_HEADING}</h1>
        <p>
          {U0_COMPONENT_GALLERY_COUNTS.applicable} applicable cells are live and
          isolated; {U0_COMPONENT_GALLERY_COUNTS.notApplicable} cells retain an
          explicit reviewed rationale.
        </p>
      </header>

      <section aria-labelledby="u0-gallery-controls-heading" class="u0-gallery__controls">
        <h2 id="u0-gallery-controls-heading">Gallery fixture cell</h2>
        <label>
          <span>Fixture-owned component and state</span>
          <select
            data-u0-test-control="cell-selector"
            onChange={(event) => {
              selectCell(event.currentTarget.value);
            }}
            value={selected.id}
          >
            {U0_COMPONENT_GALLERY_COMPONENTS.map((candidate) => (
              <optgroup key={candidate.id} label={`${candidate.id} ${candidate.name}`}>
                {U0_COMPONENT_GALLERY_APPLICABLE_CELLS.filter(
                  (cell) => cell.componentId === candidate.id,
                ).map((cell) => (
                  <option
                    data-u0-gallery-cell-id={cell.id}
                    key={cell.id}
                    value={cell.id}
                  >
                    {cell.state}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          data-u0-test-control="reset"
          onClick={() => {
            const first = U0_COMPONENT_GALLERY_APPLICABLE_CELLS[0];
            if (first !== undefined) selectCell(first.id);
          }}
          type="button"
        >
          Reset gallery specimen
        </button>
      </section>

      <article
        aria-labelledby="u0-gallery-specimen-heading"
        class="u0-gallery__active"
        data-component-id={component.id}
        data-fixture-id={selected.id}
        data-state={selected.state}
      >
        <header>
          <p>{component.id} · {component.group} · {component.kind}</p>
          <h2 id="u0-gallery-specimen-heading">
            {component.name}: {selected.state}
          </h2>
          <p>Fixture ID: <code>{selected.id}</code></p>
        </header>
        <GallerySpecimen cell={selected} component={component} key={selected.id} />
      </article>

      <details class="u0-gallery__not-applicable">
        <summary>
          Reviewed not-applicable cells ({U0_COMPONENT_GALLERY_COUNTS.notApplicable})
        </summary>
        <ul>
          {U0_COMPONENT_GALLERY_NOT_APPLICABLE_CELLS.map((cell) => (
            <li data-u0-gallery-not-applicable-id={cell.id} key={cell.id}>
              <code>{cell.id}</code>: {cell.notApplicableReason}
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}

export function mountU0ComponentGallery(root: HTMLElement): void {
  root.dataset["u0GalleryRoute"] = U0_COMPONENT_GALLERY_ROUTE.id;
  render(<U0ComponentGallery />, root);
}

if (typeof document !== "undefined") {
  const root = document.getElementById("u0-component-gallery-root");
  if (root instanceof HTMLElement) mountU0ComponentGallery(root);
}
