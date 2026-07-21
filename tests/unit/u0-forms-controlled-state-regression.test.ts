import { describe, expect, test } from "bun:test";
import { createElement, options, type VNode } from "preact";

import type {
  UiCheckboxProps,
  UiComboboxProps,
  UiCommonProps,
  UiInputProps,
  UiListboxProps,
  UiNumberFieldProps,
  UiOption,
  UiRadioGroupProps,
  UiSelectProps,
  UiSliderProps,
  UiTextareaProps,
  UiToggleGroupProps,
  UiToggleProps,
} from "../../src/ui/ui-contract";
import {
  advanceListboxTypeahead,
  Checkbox,
  Combobox,
  Label,
  Listbox,
  NumberField,
  RadioGroup,
  resolveToggleGroupRovingState,
  Select,
  Slider,
  Textarea,
  ToggleGroup,
} from "../../src/ui/primitives/Forms";
import { Input } from "../../src/ui/primitives/Input";
import {
  FieldRelationshipContext,
  type FieldRelationship,
} from "../../src/ui/primitives/field-context";
import { UiContractError } from "../../src/ui/primitives/validation";

const ASTRAL_CODE_POINT = "𝄞";
type Choice = "major" | "minor";

const CHOICE_OPTIONS = Object.freeze([
  Object.freeze({
    description: "Bright",
    disabled: false,
    id: "major-option",
    label: "Major",
    value: "major",
  }),
  Object.freeze({
    description: "Dark",
    disabled: false,
    id: "minor-option",
    label: "Minor",
    value: "minor",
  }),
]) satisfies readonly UiOption<Choice>[];

type TestVNode = Readonly<{
  props: Readonly<Record<string, unknown>>;
  type: unknown;
}>;

type HookRuntimeOptions = Readonly<{
  __r?: <Props>(vnode: VNode<Props>) => void;
  diffed?: <Props>(vnode: VNode<Props>) => void;
}>;

type CurrentTargetHandler = (
  event: Readonly<{ currentTarget: object }>,
) => void;

type InternalFieldContext = typeof FieldRelationshipContext &
  Readonly<{ __c: string }>;

const hookRuntimeOptions = options as unknown as HookRuntimeOptions;
const fieldContextId = (FieldRelationshipContext as InternalFieldContext).__c;

function isTestVNode(value: unknown): value is TestVNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "props" in value &&
    typeof value.props === "object" &&
    value.props !== null
  );
}

function requireTestVNode(value: unknown): TestVNode {
  if (isTestVNode(value)) return value;
  throw new Error("Expected a rendered U0 VNode.");
}

function collectTestVNodes(
  value: unknown,
  collected: TestVNode[] = [],
): readonly TestVNode[] {
  if (Array.isArray(value)) {
    for (const item of value) collectTestVNodes(item, collected);
    return collected;
  }
  if (!isTestVNode(value)) return collected;
  collected.push(value);
  collectTestVNodes(value.props["children"], collected);
  return collected;
}

function requireHost(
  root: TestVNode,
  type: string,
  predicate: (props: Readonly<Record<string, unknown>>) => boolean = () => true,
): TestVNode {
  const match = collectTestVNodes(root).find(
    (node) => node.type === type && predicate(node.props),
  );
  if (match !== undefined) return match;
  throw new Error(`Expected a rendered ${type} host node.`);
}

function invokeCurrentTargetHandler(
  node: TestVNode,
  handlerName: "onChange" | "onInput",
  currentTarget: object,
): void {
  const handler = node.props[handlerName];
  if (!isCurrentTargetHandler(handler)) {
    throw new Error(`Expected ${handlerName} to be installed.`);
  }
  handler({ currentTarget });
}

function invokeHostHandler(
  node: TestVNode,
  handlerName: string,
  event: object,
): void {
  const handler = node.props[handlerName];
  if (!isHostHandler(handler)) {
    throw new Error(`Expected ${handlerName} to be installed.`);
  }
  handler(event);
}

type HostHandler = (event: object) => void;

function isHostHandler(value: unknown): value is HostHandler {
  return typeof value === "function";
}

function isCurrentTargetHandler(value: unknown): value is CurrentTargetHandler {
  return typeof value === "function";
}

function hookContext(
  relationship: FieldRelationship | null,
): Readonly<Record<string, unknown>> {
  if (relationship === null) return Object.freeze({});
  return Object.freeze({
    [fieldContextId]: Object.freeze({
      props: Object.freeze({ value: relationship }),
      sub: () => undefined,
    }),
  });
}

function renderWithHooks<Props extends object>(
  component: (props: Props) => VNode,
  props: Props,
  relationship: FieldRelationship | null = null,
): TestVNode {
  const context = hookContext(relationship);
  const componentVNode = createElement(component, props);
  const owner = {
    __H: undefined,
    __P: null,
    __h: [],
    __v: componentVNode,
    context,
    forceUpdate: () => undefined,
    props,
    render: () => null,
    setState: () => undefined,
  };
  Object.assign(componentVNode, { __c: owner });
  if (hookRuntimeOptions.__r === undefined) {
    throw new Error("Expected Preact's hook render boundary.");
  }
  hookRuntimeOptions.__r(componentVNode);
  try {
    return requireTestVNode(component(props));
  } finally {
    hookRuntimeOptions.diffed?.(componentVNode);
  }
}

function renderFunctionalChild(root: TestVNode): TestVNode {
  if (typeof root.type !== "function") {
    throw new Error("Expected a functional child component.");
  }
  return renderWithHooks(
    root.type as (props: Readonly<Record<string, unknown>>) => VNode,
    root.props,
  );
}

function commonProps(id: string): UiCommonProps {
  return Object.freeze({
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    id,
    invalid: false,
  });
}

function textareaProps(
  overrides: Partial<UiTextareaProps> = {},
): UiTextareaProps {
  return Object.freeze({
    ...commonProps("notes"),
    accessibleName: "Notes",
    maxCodePoints: 32,
    onValueChange: () => undefined,
    placeholder: null,
    readOnly: false,
    rows: 3,
    value: "original notes",
    ...overrides,
  });
}

function inputProps(overrides: Partial<UiInputProps> = {}): UiInputProps {
  return Object.freeze({
    ...commonProps("title"),
    accessibleName: "Title",
    inputType: "text",
    onValueChange: () => undefined,
    placeholder: null,
    readOnly: false,
    value: "Changes",
    ...overrides,
  });
}

function numberFieldProps(
  overrides: Partial<UiNumberFieldProps> = {},
): UiNumberFieldProps {
  return Object.freeze({
    ...commonProps("tempo"),
    accessibleName: "Tempo",
    max: 300,
    min: 20,
    onValueChange: () => undefined,
    parsedValue: 120,
    placeholder: null,
    readOnly: false,
    step: 1,
    value: "120",
    ...overrides,
  });
}

function selectProps(
  overrides: Partial<UiSelectProps<Choice>> = {},
): UiSelectProps<Choice> {
  return Object.freeze({
    ...commonProps("quality-select"),
    accessibleName: "Chord quality",
    onValueChange: () => undefined,
    options: CHOICE_OPTIONS,
    value: "major",
    ...overrides,
  });
}

function comboboxProps(
  overrides: Partial<UiComboboxProps<Choice>> = {},
): UiComboboxProps<Choice> {
  return Object.freeze({
    ...commonProps("quality-combobox"),
    accessibleName: "Chord quality",
    activeOptionId: "major-option",
    autocomplete: "list-manual",
    inputValue: "Major",
    onInputChange: () => undefined,
    onOpenChange: () => undefined,
    onValueChange: () => undefined,
    open: true,
    options: CHOICE_OPTIONS,
    selectedValue: "major",
    ...overrides,
  });
}

function checkboxProps(
  overrides: Partial<UiCheckboxProps> = {},
): UiCheckboxProps {
  return Object.freeze({
    ...commonProps("lock-voicing"),
    checked: false,
    label: "Lock voicing",
    onCheckedChange: () => undefined,
    ...overrides,
  });
}

function sliderProps(overrides: Partial<UiSliderProps> = {}): UiSliderProps {
  return Object.freeze({
    ...commonProps("swing"),
    accessibleName: "Swing",
    max: 10,
    min: 0,
    onValueChange: () => undefined,
    orientation: "horizontal",
    pageStep: 2,
    step: 1,
    value: 5,
    valueText: "Five",
    ...overrides,
  });
}

function fieldRelationship(controlId: string): FieldRelationship {
  return Object.freeze({
    controlId,
    descriptionIds: Object.freeze([`${controlId}-description`]),
    errorIds: Object.freeze([`${controlId}-error`]),
    fieldId: `${controlId}-field`,
    invalid: true,
    labelId: `${controlId}-label`,
    required: true,
  });
}

function fieldBoundCommon(
  relationship: FieldRelationship,
): Pick<UiCommonProps, "describedBy" | "invalid"> {
  return Object.freeze({
    describedBy: Object.freeze([
      ...relationship.descriptionIds,
      ...relationship.errorIds,
    ]),
    invalid: relationship.invalid,
  });
}

function expectFieldBinding(
  control: TestVNode,
  relationship: FieldRelationship,
): void {
  expect(control.props["aria-describedby"]).toBe(
    [...relationship.descriptionIds, ...relationship.errorIds].join(" "),
  );
  expect(control.props["aria-errormessage"]).toBe(
    relationship.errorIds.join(" "),
  );
  expect(control.props["aria-invalid"]).toBe("true");
  expect(control.props["aria-label"]).toBeUndefined();
  expect(control.props["aria-labelledby"]).toBe(relationship.labelId);
  expect(control.props["aria-required"]).toBe("true");
}

function captureContractError(action: () => void): UiContractError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(UiContractError);
    if (error instanceof UiContractError) return error;
    throw error;
  }
  throw new Error("Expected a U0 contract refusal.");
}

function toggle(
  id: string,
  overrides: Partial<Pick<UiToggleProps, "busy" | "disabled" | "pressed">> = {},
): UiToggleProps {
  return Object.freeze({
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    id,
    invalid: false,
    label: id,
    onPressedChange: () => undefined,
    pressed: false,
    ...overrides,
  });
}

function toggleGroupProps(items: readonly UiToggleProps[]): UiToggleGroupProps {
  return Object.freeze({
    accessibleName: "Voicing display",
    busy: false,
    density: "comfortable",
    describedBy: [],
    disabled: false,
    id: "voicing-display",
    invalid: false,
    items,
    onPressedIdsChange: () => undefined,
    pressedIds: [],
    selectionMode: "single",
  });
}

describe("U0 Forms controlled-state regressions", () => {
  test("Listbox typeahead counts Unicode code points and refuses code point 65 without changing state", () => {
    const sixtyThree = Object.freeze({
      query: ASTRAL_CODE_POINT.repeat(63),
      timeStamp: 100,
    });
    const sixtyFour = advanceListboxTypeahead(
      sixtyThree,
      ASTRAL_CODE_POINT,
      101,
    );

    expect(sixtyFour).not.toBeNull();
    expect(Array.from(sixtyFour?.query ?? "")).toHaveLength(64);
    expect(sixtyFour?.timeStamp).toBe(101);

    if (sixtyFour === null) return;
    expect(
      advanceListboxTypeahead(sixtyFour, ASTRAL_CODE_POINT, 102),
    ).toBeNull();
    expect(Array.from(sixtyFour.query)).toHaveLength(64);
    expect(sixtyFour.timeStamp).toBe(101);
  });

  test("ToggleGroup roving state skips a busy pressed item for an enabled peer", () => {
    const busyPressed = toggle("drop-two", { busy: true, pressed: true });
    const enabled = toggle("close-position");

    const state = resolveToggleGroupRovingState(
      [busyPressed, enabled],
      [busyPressed.id],
    );

    expect(state.unavailableIds).toEqual([busyPressed.id]);
    expect(state.preferredId).toBe(enabled.id);
  });

  test("ToggleGroup refuses an item identity that duplicates its owner", () => {
    const props = toggleGroupProps([toggle("voicing-display")]);

    try {
      ToggleGroup(props);
      throw new Error("Expected ToggleGroup to refuse before installing hooks.");
    } catch (error) {
      expect(error).toBeInstanceOf(UiContractError);
      if (!(error instanceof UiContractError)) return;
      expect(error.diagnostic.code).toBe("ui.duplicate_item_id");
      expect(error.diagnostic.path).toEqual(["items"]);
    }
  });

  test("preflights malformed collections, closed enums, booleans, and callbacks before hooks or DOM effects", () => {
    let callbackCount = 0;
    const recordCallback = (): void => {
      callbackCount += 1;
    };

    // Each component is deliberately invoked outside a Preact render. Reaching
    // a hook would fail, so the sanitized UiContractError proves preflight won.
    const malformedCollection = captureContractError(() => {
      Select<Choice>({
        ...selectProps({ onValueChange: recordCallback }),
        options: null,
      } as unknown as UiSelectProps<Choice>);
    });
    expect(malformedCollection.diagnostic.code).toBe("ui.value_malformed");
    expect(malformedCollection.diagnostic.path).toEqual(["options"]);

    const malformedEnum = captureContractError(() => {
      Combobox<Choice>({
        ...comboboxProps({
          onInputChange: recordCallback,
          onOpenChange: recordCallback,
          onValueChange: recordCallback,
        }),
        autocomplete: "inline",
      } as unknown as UiComboboxProps<Choice>);
    });
    expect(malformedEnum.diagnostic.code).toBe("ui.value_malformed");
    expect(malformedEnum.diagnostic.path).toEqual(["autocomplete"]);

    const malformedBoolean = captureContractError(() => {
      Textarea({
        ...textareaProps({ onValueChange: recordCallback }),
        readOnly: "false",
      } as unknown as UiTextareaProps);
    });
    expect(malformedBoolean.diagnostic.code).toBe("ui.value_malformed");
    expect(malformedBoolean.diagnostic.path).toEqual(["readOnly"]);

    const malformedCallback = captureContractError(() => {
      Slider({
        ...sliderProps(),
        onValueChange: null,
      } as unknown as UiSliderProps);
    });
    expect(malformedCallback.diagnostic.code).toBe("ui.value_malformed");
    expect(malformedCallback.diagnostic.path).toEqual(["onValueChange"]);
    expect(callbackCount).toBe(0);
  });

  test("refuses mismatched Field ownership and any reordered controlled relationship", () => {
    const relationship = fieldRelationship("title");
    const fieldProps = fieldBoundCommon(relationship);

    const wrongControl = captureContractError(() => {
      renderWithHooks(
        Input,
        inputProps({ ...fieldProps, id: "other-title" }),
        relationship,
      );
    });
    expect(wrongControl.diagnostic.code).toBe("ui.value_malformed");
    expect(wrongControl.diagnostic.path).toEqual(["fieldRelationship"]);

    const reordered = captureContractError(() => {
      renderWithHooks(
        Input,
        inputProps({
          describedBy: Object.freeze([
            ...relationship.errorIds,
            ...relationship.descriptionIds,
          ]),
          invalid: relationship.invalid,
        }),
        relationship,
      );
    });
    expect(reordered.diagnostic.code).toBe("ui.value_malformed");
    expect(reordered.diagnostic.path).toEqual(["fieldRelationship"]);

    const wrongLabel = captureContractError(() => {
      renderWithHooks(
        Label,
        {
          controlId: relationship.controlId,
          id: relationship.labelId,
          required: false,
          text: "Title",
        },
        relationship,
      );
    });
    expect(wrongLabel.diagnostic.code).toBe("ui.value_malformed");
    expect(wrongLabel.diagnostic.path).toEqual(["fieldRelationship"]);
  });

  test("bounds ToggleGroup pressed identities before traversal and validates item IDs before deduplication", () => {
    const overbound = captureContractError(() => {
      ToggleGroup({
        ...toggleGroupProps([]),
        pressedIds: Object.freeze(
          Array.from({ length: 65 }, (_, index) => `missing-${String(index)}`),
        ),
      });
    });
    expect(overbound.diagnostic.code).toBe("ui.collection_limit");
    expect(overbound.diagnostic.path).toEqual(["pressedIds"]);

    const malformedItems = Object.freeze([
      { ...toggle("first"), id: undefined },
      { ...toggle("second"), id: undefined },
    ]) as unknown as readonly UiToggleProps[];
    const malformedId = captureContractError(() => {
      ToggleGroup(toggleGroupProps(malformedItems));
    });
    expect(malformedId.diagnostic.code).toBe("ui.id_invalid");
    expect(malformedId.diagnostic.path).toEqual(["id"]);
  });

  test("binds Field descriptions, errors, label, invalidity, and requirement to representative non-Input controls", () => {
    const textareaField = fieldRelationship("notes");
    const textarea = requireHost(
      renderWithHooks(
        Textarea,
        textareaProps(fieldBoundCommon(textareaField)),
        textareaField,
      ),
      "textarea",
    );
    expectFieldBinding(textarea, textareaField);

    const selectField = fieldRelationship("quality-select");
    const select = requireHost(
      renderWithHooks(
        (props: UiSelectProps<Choice>) => Select(props),
        selectProps(fieldBoundCommon(selectField)),
        selectField,
      ),
      "select",
    );
    expectFieldBinding(select, selectField);

    const checkboxField = fieldRelationship("lock-voicing");
    const checkbox = requireHost(
      renderWithHooks(
        Checkbox,
        checkboxProps(fieldBoundCommon(checkboxField)),
        checkboxField,
      ),
      "input",
      (props) => props["type"] === "checkbox",
    );
    expectFieldBinding(checkbox, checkboxField);

    const sliderField = fieldRelationship("swing");
    const slider = requireHost(
      renderWithHooks(
        Slider,
        sliderProps(fieldBoundCommon(sliderField)),
        sliderField,
      ),
      "input",
      (props) => props["type"] === "range",
    );
    expectFieldBinding(slider, sliderField);
  });

  test("keeps generated combobox popup and option DOM IDs disjoint from caller option IDs", () => {
    const ownerId = "collision-combobox";
    const collisionOptions = Object.freeze([
      Object.freeze({
        description: null,
        disabled: false,
        id: `${ownerId}-listbox`,
        label: "Major",
        value: "major",
      }),
      Object.freeze({
        description: null,
        disabled: false,
        id: `${ownerId}-option-0`,
        label: "Minor",
        value: "minor",
      }),
    ]) satisfies readonly UiOption<Choice>[];
    const activeCollisionOption = collisionOptions[0];
    if (activeCollisionOption === undefined) {
      throw new Error("Expected the collision fixture's active option.");
    }
    const props = comboboxProps({
      activeOptionId: activeCollisionOption.id,
      id: ownerId,
      options: collisionOptions,
    });
    const root = renderWithHooks(
      (current: UiComboboxProps<Choice>) => Combobox(current),
      props,
    );
    const input = requireHost(
      root,
      "input",
      (hostProps) => hostProps["role"] === "combobox",
    );
    const popup = requireHost(
      root,
      "div",
      (hostProps) => hostProps["role"] === "listbox",
    );
    const optionNodes = collectTestVNodes(root).filter(
      (node) => node.type === "div" && node.props["role"] === "option",
    );
    const callerIds = collisionOptions.map((option) => option.id);
    const popupId = popup.props["id"];
    const optionDomIds = optionNodes.map((option) => option.props["id"]);

    expect(typeof popupId).toBe("string");
    expect(optionNodes).toHaveLength(collisionOptions.length);
    expect(new Set(optionDomIds).size).toBe(collisionOptions.length);
    expect(callerIds).not.toContain(popupId);
    for (const optionDomId of optionDomIds) {
      expect(typeof optionDomId).toBe("string");
      expect(callerIds).not.toContain(optionDomId);
    }
    expect(optionNodes.map((option) => option.props["data-ui-item-id"])).toEqual(
      callerIds,
    );
    expect(input.props["aria-controls"]).toBe(popupId);
    expect(input.props["aria-activedescendant"]).toBe(optionDomIds[0]);
  });

  test("atomically restores every refused controlled Form DOM edit without publishing a callback", () => {
    let callbackCount = 0;
    const recordCallback = (): void => {
      callbackCount += 1;
    };

    const textarea = requireHost(
      renderWithHooks(
        Textarea,
        textareaProps({ maxCodePoints: 4, onValueChange: recordCallback, value: "kept" }),
      ),
      "textarea",
    );
    const textareaControl = { value: "excess" };
    invokeCurrentTargetHandler(textarea, "onInput", textareaControl);
    expect(textareaControl.value).toBe("kept");

    const numberField = requireHost(
      renderWithHooks(
        NumberField,
        numberFieldProps({ onValueChange: recordCallback, readOnly: true }),
      ),
      "input",
      (props) => props["role"] === "spinbutton",
    );
    const numberControl = { value: "999" };
    invokeCurrentTargetHandler(numberField, "onInput", numberControl);
    expect(numberControl.value).toBe("120");

    const select = requireHost(
      renderWithHooks(
        (props: UiSelectProps<Choice>) => Select(props),
        selectProps({ onValueChange: recordCallback }),
      ),
      "select",
    );
    const selectControl = { value: "forged-option-token" };
    invokeCurrentTargetHandler(select, "onChange", selectControl);
    expect(selectControl.value).toBe("option-0");

    const combobox = requireHost(
      renderWithHooks(
        (props: UiComboboxProps<Choice>) => Combobox(props),
        comboboxProps({
          onInputChange: recordCallback,
          onOpenChange: recordCallback,
          onValueChange: recordCallback,
        }),
      ),
      "input",
      (props) => props["role"] === "combobox",
    );
    const comboboxControl = { value: "x".repeat(4_097) };
    invokeCurrentTargetHandler(combobox, "onInput", comboboxControl);
    expect(comboboxControl.value).toBe("Major");

    const checkbox = requireHost(
      renderWithHooks(
        Checkbox,
        checkboxProps({
          busy: true,
          checked: "mixed",
          onCheckedChange: recordCallback,
        }),
      ),
      "input",
      (props) => props["type"] === "checkbox",
    );
    const checkboxControl = { checked: true, indeterminate: false };
    invokeCurrentTargetHandler(checkbox, "onChange", checkboxControl);
    expect(checkboxControl).toEqual({ checked: false, indeterminate: true });

    const slider = requireHost(
      renderWithHooks(
        Slider,
        sliderProps({ onValueChange: recordCallback }),
      ),
      "input",
      (props) => props["type"] === "range",
    );
    const sliderControl = { valueAsNumber: Number.NaN };
    invokeCurrentTargetHandler(slider, "onInput", sliderControl);
    expect(sliderControl.valueAsNumber).toBe(5);

    expect(callbackCount).toBe(0);
  });

  test("restores Slider preview DOM state and releases pointer capture on cancellation", () => {
    const rangeEvents: Array<Readonly<Record<string, unknown>>> = [];
    const range = requireHost(
      renderWithHooks(
        Slider,
        sliderProps({
          onValueChange: (event) => {
            rangeEvents.push(event);
          },
        }),
      ),
      "input",
      (props) => props["type"] === "range",
    );
    const captures = new Set<number>();
    const released: number[] = [];
    const rangeControl = {
      hasPointerCapture: (pointerId: number) => captures.has(pointerId),
      releasePointerCapture: (pointerId: number) => {
        released.push(pointerId);
        captures.delete(pointerId);
      },
      setPointerCapture: (pointerId: number) => {
        captures.add(pointerId);
      },
      valueAsNumber: 5,
    };
    invokeHostHandler(range, "onPointerDown", {
      currentTarget: rangeControl,
      pointerId: 17,
      preventDefault: () => undefined,
    });
    rangeControl.valueAsNumber = 8;
    invokeHostHandler(range, "onInput", { currentTarget: rangeControl });
    let prevented = 0;
    invokeHostHandler(range, "onKeyDown", {
      currentTarget: rangeControl,
      key: "Escape",
      preventDefault: () => {
        prevented += 1;
      },
    });

    expect(prevented).toBe(1);
    expect(rangeControl.valueAsNumber).toBe(5);
    expect(released).toEqual([17]);
    expect(captures.size).toBe(0);
    expect(rangeEvents.map((event) => event["phase"])).toEqual([
      "preview",
      "cancel",
    ]);
    expect(rangeEvents.at(-1)).toMatchObject({
      previousValue: 8,
      value: 5,
    });

    const numericEvents: Array<Readonly<Record<string, unknown>>> = [];
    const numeric = requireHost(
      renderWithHooks(
        Slider,
        sliderProps({
          onValueChange: (event) => {
            numericEvents.push(event);
          },
        }),
      ),
      "input",
      (props) => props["type"] === "number",
    );
    const numericControl = {
      validity: { valid: true },
      valueAsNumber: 8,
    };
    invokeHostHandler(numeric, "onInput", { currentTarget: numericControl });
    invokeHostHandler(numeric, "onKeyDown", {
      currentTarget: numericControl,
      key: "Escape",
      preventDefault: () => undefined,
    });
    expect(numericControl.valueAsNumber).toBe(5);
    expect(numericEvents.map((event) => event["phase"])).toEqual([
      "preview",
      "cancel",
    ]);
  });

  test("unavailable composite Forms suppress owned keys without trapping Tab", () => {
    const listboxProps: UiListboxProps<Choice> = Object.freeze({
      ...commonProps("busy-listbox"),
      accessibleName: "Busy choices",
      activeId: null,
      busy: true,
      onSelectionChange: () => undefined,
      options: Object.freeze([]),
      selectedIds: Object.freeze([]),
      selectionMode: "single",
    });
    const listbox = requireHost(
      renderWithHooks(
        (props: UiListboxProps<Choice>) => Listbox(props),
        listboxProps,
      ),
      "div",
      (props) => props["role"] === "listbox",
    );

    const radioProps: UiRadioGroupProps<Choice> = Object.freeze({
      ...commonProps("busy-radio"),
      accessibleName: "Busy radio choices",
      busy: true,
      insideToolbar: false,
      onValueChange: () => undefined,
      options: CHOICE_OPTIONS,
      value: "major",
    });
    const radio = requireHost(
      renderFunctionalChild(
        renderWithHooks(
          (props: UiRadioGroupProps<Choice>) => RadioGroup(props),
          radioProps,
        ),
      ),
      "div",
      (props) => props["role"] === "radiogroup",
    );

    const toggleGroup = requireHost(
      renderWithHooks(
        ToggleGroup,
        Object.freeze({ ...toggleGroupProps([toggle("toggle")]), busy: true }),
      ),
      "div",
      (props) => props["role"] === "group",
    );

    for (const control of [listbox, radio, toggleGroup]) {
      let prevented = 0;
      invokeHostHandler(control, "onKeyDown", {
        key: "Tab",
        preventDefault: () => {
          prevented += 1;
        },
      });
      expect(prevented).toBe(0);

      invokeHostHandler(control, "onKeyDown", {
        key: "ArrowRight",
        preventDefault: () => {
          prevented += 1;
        },
      });
      expect(prevented).toBe(1);
    }
  });
});
