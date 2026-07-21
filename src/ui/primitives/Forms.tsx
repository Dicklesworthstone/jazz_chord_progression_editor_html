import { useEffect, useId, useRef, useState } from "preact/hooks";

import {
  UI_LIMITS,
  type UiCheckboxProps,
  type UiComboboxProps,
  type UiCommonProps,
  type UiInteractionSource,
  type UiLabelProps,
  type UiListboxProps,
  type UiNumberFieldProps,
  type UiOption,
  type UiRadioGroupProps,
  type UiRefusalCode,
  type UiSegmentedControlProps,
  type UiSelectProps,
  type UiSliderProps,
  type UiSwitchProps,
  type UiTextareaProps,
  type UiToggleGroupProps,
  type UiToggleProps,
} from "../ui-contract";
import { joinIdReferences } from "./id-references";
import { useInteractionSource } from "./interaction-source";
import { useFieldRelationship } from "./field-context";
import {
  findTypeaheadMatch,
  moveRovingFocus,
  preflightRovingFocus,
  type UiRovingKey,
} from "./roving-focus";
import {
  requireUiResult,
  uiDiagnostic,
  validateFiniteRange,
  validateSelectedOption,
  validateUiCollectionBound,
  validateUiCommonProps,
  validateUiId,
  validateUiOptions,
  validateUiText,
} from "./validation";

const NO_SELECTION_VALUE = "none";

function requireCondition(
  condition: boolean,
  code: UiRefusalCode,
  componentId: string,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
): void {
  if (condition) return;
  const refusal = uiDiagnostic(
    code,
    componentId,
    path,
    message,
    recoveryAction,
  );
  requireUiResult({ diagnostics: [refusal], ok: false, refusal });
}

function requireCommon(props: UiCommonProps): void {
  requireUiResult(validateUiCommonProps(props));
}

function requireBoolean(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): void {
  requireCondition(
    typeof value === "boolean",
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
  requireCondition(
    typeof value === "function",
    "ui.value_malformed",
    componentId,
    path,
    "The semantic callback is missing or malformed.",
    "Provide a callable semantic event boundary.",
  );
}

function requireSelectionMode(componentId: string, value: unknown): void {
  requireCondition(
    value === "single" || value === "multiple",
    "ui.value_malformed",
    componentId,
    ["selectionMode"],
    "The selection mode is outside the reviewed closed set.",
    "Use single or multiple selection mode.",
  );
}

type FormFieldBinding = Readonly<{
  describedBy: readonly string[];
  errorMessage: string | undefined;
  invalid: boolean;
  labelledBy: string | undefined;
  required: boolean;
  useAccessibleName: boolean;
}>;

function useFormFieldBinding(
  componentId: string,
  invalid: boolean,
  describedBy: readonly string[],
): FormFieldBinding {
  const field = useFieldRelationship();
  const fieldReferences =
    field === null ? [] : [...field.descriptionIds, ...field.errorIds];
  if (
    field !== null &&
    (field.controlId !== componentId ||
      field.invalid !== invalid ||
      fieldReferences.length !== describedBy.length ||
      fieldReferences.some((id, index) => describedBy[index] !== id))
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      componentId,
      ["fieldRelationship"],
      "The controlled form component disagrees with its owning Field relationship state.",
      "Use the Field validation and description identities on its named control.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  return Object.freeze({
    describedBy,
    errorMessage:
      field?.invalid === true ? joinIdReferences(field.errorIds) : undefined,
    invalid: field?.invalid === true || invalid,
    labelledBy: field?.labelId,
    required: field?.required === true,
    useAccessibleName: field === null,
  });
}

function requireAccessibleName(componentId: string, value: string): void {
  requireUiResult(
    validateUiText(
      componentId,
      ["accessibleName"],
      value,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
}

function requireTextValue(
  componentId: string,
  path: readonly (string | number)[],
  value: string,
  maximum: number = UI_LIMITS.maxTextValueCodePoints,
): void {
  requireUiResult(
    validateUiText(componentId, path, value, maximum, { allowEmpty: true }),
  );
}

function requireOptionalText(
  componentId: string,
  path: readonly (string | number)[],
  value: string | null,
  maximum: number,
): void {
  if (value === null) return;
  requireUiResult(validateUiText(componentId, path, value, maximum));
}

function requireOptions<Value extends string>(
  componentId: string,
  options: readonly UiOption<Value>[],
  maximum: number,
): void {
  requireUiResult(validateUiOptions(componentId, options, maximum));
  requireCondition(
    options.every((option) => option.id !== componentId),
    "ui.duplicate_item_id",
    componentId,
    ["options"],
    "An option identity duplicates its owning component identity.",
    "Give the component and every option distinct stable identities.",
  );
  for (const [index, option] of options.entries()) {
    requireOptionalText(
      componentId,
      ["options", index, "description"],
      option.description,
      UI_LIMITS.maxDescriptionCodePoints,
    );
  }
}

function requireSelectedIds<Value extends string>(
  componentId: string,
  options: readonly UiOption<Value>[],
  selectedIds: readonly string[],
  maximum: number,
): void {
  requireCondition(
    Array.isArray(selectedIds),
    "ui.value_malformed",
    componentId,
    ["selectedIds"],
    "Selected identities must be an ordered array.",
    "Provide a bounded array of current option identities.",
  );
  requireCondition(
    selectedIds.length <= maximum,
    "ui.collection_limit",
    componentId,
    ["selectedIds"],
    "The selected identity collection exceeds its reviewed bound.",
    "Present a bounded selected identity collection.",
  );
  for (const [index, selectedId] of selectedIds.entries()) {
    requireUiResult(
      validateUiId(componentId, ["selectedIds", index], selectedId),
    );
  }
  const optionIds = new Set(options.map((option) => option.id));
  requireCondition(
    new Set(selectedIds).size === selectedIds.length &&
      selectedIds.every((id) => optionIds.has(id)),
    "ui.selection_invalid",
    componentId,
    ["selectedIds"],
    "Every selected identity must name one current option exactly once.",
    "Use unique identities from the current option collection.",
  );
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

function clickSource(detail: number): UiInteractionSource {
  return detail === 0 ? "assistive-technology" : "pointer";
}

function isBoundedTextCandidate(value: string, maximumCodePoints: number): boolean {
  let codePoints = 0;
  for (let offset = 0; offset < value.length; offset += 1) {
    const codePoint = value.codePointAt(offset);
    if (codePoint !== undefined && codePoint > 0xffff) offset += 1;
    codePoints += 1;
    if (codePoints > maximumCodePoints) return false;
  }
  return true;
}

export type ListboxTypeaheadState = Readonly<{
  query: string;
  timeStamp: number;
}>;

export function advanceListboxTypeahead(
  current: ListboxTypeaheadState,
  key: string,
  timeStamp: number,
): ListboxTypeaheadState | null {
  if (key.length === 0 || !isBoundedTextCandidate(key, 1)) return null;
  const elapsed = timeStamp - current.timeStamp;
  const query =
    elapsed >= UI_LIMITS.typeaheadResetMs ? key : `${current.query}${key}`;
  if (!isBoundedTextCandidate(query, UI_LIMITS.maxTypeaheadCodePoints)) {
    return null;
  }
  return Object.freeze({ query, timeStamp });
}

export type ToggleGroupRovingState = Readonly<{
  preferredId: string | null;
  unavailableIds: readonly string[];
}>;

export function resolveToggleGroupRovingState(
  items: readonly UiToggleProps[],
  pressedIds: readonly string[],
): ToggleGroupRovingState {
  const unavailableIds = Object.freeze(
    items
      .filter((item) => item.disabled || item.busy)
      .map((item) => item.id),
  );
  const preferredId =
    pressedIds.find((id) => !unavailableIds.includes(id)) ??
    items.find((item) => !unavailableIds.includes(item.id))?.id ??
    null;
  return Object.freeze({ preferredId, unavailableIds });
}

function itemIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  return (
    target.closest<HTMLElement>("[data-ui-item-id]")?.dataset["uiItemId"] ??
    null
  );
}

function focusItem(root: HTMLElement | null, id: string | null): void {
  if (root === null || id === null) return;
  const candidates = root.querySelectorAll<HTMLElement>("[data-ui-item-id]");
  for (const candidate of candidates) {
    if (candidate.dataset["uiItemId"] === id) {
      candidate.focus();
      return;
    }
  }
}

function firstEnabledId<Value extends string>(
  options: readonly UiOption<Value>[],
): string | null {
  return options.find((option) => !option.disabled)?.id ?? null;
}

function useRovingId(
  preferredId: string | null,
  itemIds: readonly string[],
  disabledIds: readonly string[],
): readonly [string | null, (id: string | null) => void] {
  const enabledIds = itemIds.filter((id) => !disabledIds.includes(id));
  const preferred =
    preferredId !== null && enabledIds.includes(preferredId)
      ? preferredId
      : (enabledIds[0] ?? null);
  const [localId, setLocalId] = useState<string | null>(preferred);

  useEffect(() => {
    setLocalId((current) => {
      if (preferredId !== null && enabledIds.includes(preferredId)) {
        return preferredId;
      }
      return current !== null && enabledIds.includes(current)
        ? current
        : (enabledIds[0] ?? null);
    });
  }, [preferredId, itemIds, disabledIds]);

  const currentId =
    localId !== null && enabledIds.includes(localId) ? localId : preferred;
  return [currentId, setLocalId] as const;
}

export function Label(props: UiLabelProps) {
  requireUiResult(validateUiId(props.id, ["id"], props.id));
  requireUiResult(
    validateUiId(props.id, ["controlId"], props.controlId),
  );
  requireBoolean(props.id, ["required"], props.required);
  requireCondition(
    props.id !== props.controlId,
    "ui.duplicate_item_id",
    props.id,
    ["controlId"],
    "The label and its controlled element cannot share one DOM identity.",
    "Give the label and control distinct stable identities.",
  );
  requireUiResult(
    validateUiText(
      props.id,
      ["text"],
      props.text,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  const field = useFieldRelationship();
  requireCondition(
    field === null ||
      (field.controlId === props.controlId &&
        field.labelId === props.id &&
        field.required === props.required),
    "ui.value_malformed",
    props.id,
    ["fieldRelationship"],
    "The label disagrees with its owning Field relationship state.",
    "Use the Field label, control, and required state on its visible label.",
  );

  return (
    <label
      class="ui-label"
      data-required={props.required ? "true" : undefined}
      htmlFor={props.controlId}
      id={props.id}
    >
      <span>{props.text}</span>
      {props.required ? (
        <span aria-hidden="true" class="ui-label__required">
          *
        </span>
      ) : null}
    </label>
  );
}

export function Textarea(props: UiTextareaProps) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  requireBoolean(props.id, ["readOnly"], props.readOnly);
  requireCallback(props.id, ["onValueChange"], props.onValueChange);
  requireCondition(
    Number.isSafeInteger(props.rows) &&
      props.rows >= 1 &&
      props.rows <= UI_LIMITS.maxTextareaRows,
    "ui.range_invalid",
    props.id,
    ["rows"],
    "Textarea rows must be within the reviewed integer range.",
    "Use from 1 through 40 rows.",
  );
  requireCondition(
    Number.isSafeInteger(props.maxCodePoints) &&
      props.maxCodePoints >= 1 &&
      props.maxCodePoints <= UI_LIMITS.maxTextValueCodePoints,
    "ui.range_invalid",
    props.id,
    ["maxCodePoints"],
    "Textarea maximum length must be within the reviewed integer range.",
    "Use a maximum from 1 through 4,096 code points.",
  );
  requireTextValue(props.id, ["value"], props.value, props.maxCodePoints);
  requireOptionalText(
    props.id,
    ["placeholder"],
    props.placeholder,
    UI_LIMITS.maxDescriptionCodePoints,
  );
  const interaction = useInteractionSource<HTMLTextAreaElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );

  return (
    <textarea
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-label={field.useAccessibleName ? props.accessibleName : undefined}
      aria-labelledby={field.labelledBy}
      aria-required={field.required ? "true" : undefined}
      class="ui-form-control ui-textarea"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      disabled={props.disabled}
      id={props.id}
      onBlur={interaction.reset}
      onInput={(event) => {
        if (props.disabled || props.busy || props.readOnly) {
          event.currentTarget.value = props.value;
          return;
        }
        const candidate = event.currentTarget.value;
        if (!isBoundedTextCandidate(candidate, props.maxCodePoints)) {
          event.currentTarget.value = props.value;
          return;
        }
        props.onValueChange({
          componentId: props.id,
          phase: "preview",
          previousValue: props.value,
          source: interaction.take("assistive-technology"),
          value: candidate,
        });
      }}
      onKeyDown={interaction.onKeyDown}
      onKeyUp={interaction.reset}
      onPointerDown={interaction.onPointerDown}
      placeholder={props.placeholder ?? undefined}
      readOnly={props.readOnly || props.busy}
      rows={props.rows}
      value={props.value}
    />
  );
}

export function NumberField(props: UiNumberFieldProps) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  requireBoolean(props.id, ["readOnly"], props.readOnly);
  requireCallback(props.id, ["onValueChange"], props.onValueChange);
  requireTextValue(props.id, ["value"], props.value);
  requireOptionalText(
    props.id,
    ["placeholder"],
    props.placeholder,
    UI_LIMITS.maxDescriptionCodePoints,
  );
  requireCondition(
    Number.isFinite(props.step) && props.step > 0,
    "ui.step_invalid",
    props.id,
    ["step"],
    "The number-field step must be finite and greater than zero.",
    "Provide a positive finite step.",
  );
  requireCondition(
    (props.min === null || Number.isFinite(props.min)) &&
      (props.max === null || Number.isFinite(props.max)) &&
      (props.min === null || props.max === null || props.min <= props.max),
    "ui.range_invalid",
    props.id,
    ["min"],
    "Number-field bounds must be finite and ordered.",
    "Provide finite bounds with minimum no greater than maximum.",
  );
  if (props.parsedValue !== null) {
    requireCondition(
      Number.isFinite(props.parsedValue) &&
        (props.min === null || props.parsedValue >= props.min) &&
        (props.max === null || props.parsedValue <= props.max),
      "ui.range_invalid",
      props.id,
      ["parsedValue"],
      "The parsed number is outside its declared finite bounds.",
      "Provide a parsed value inside the declared range.",
    );
  }

  const interaction = useInteractionSource<HTMLInputElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const focusValue = useRef(props.value);
  const hasPreview = useRef(false);
  const latestPreviewValue = useRef(props.value);
  const unavailable = props.disabled || props.busy || props.readOnly;

  const emit = (
    phase: "cancel" | "commit" | "preview",
    value: string,
    source: UiInteractionSource,
  ): boolean => {
    if (!isBoundedTextCandidate(value, UI_LIMITS.maxTextValueCodePoints)) {
      return false;
    }
    props.onValueChange({
      componentId: props.id,
      phase,
      previousValue: props.value,
      source,
      value,
    });
    return true;
  };

  return (
    <input
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-label={field.useAccessibleName ? props.accessibleName : undefined}
      aria-labelledby={field.labelledBy}
      aria-readonly={props.readOnly || props.busy ? "true" : undefined}
      aria-required={field.required ? "true" : undefined}
      aria-valuemax={props.max ?? undefined}
      aria-valuemin={props.min ?? undefined}
      aria-valuenow={props.parsedValue ?? undefined}
      aria-valuetext={props.value}
      class="ui-form-control ui-number-field"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      disabled={props.disabled}
      id={props.id}
      inputMode="decimal"
      onBlur={() => {
        if (!unavailable && hasPreview.current) {
          emit(
            "commit",
            latestPreviewValue.current,
            interaction.take("programmatic"),
          );
        }
        hasPreview.current = false;
        interaction.reset();
      }}
      onFocus={() => {
        focusValue.current = props.value;
        latestPreviewValue.current = props.value;
        hasPreview.current = false;
      }}
      onInput={(event) => {
        if (unavailable) {
          event.currentTarget.value = props.value;
          return;
        }
        const candidate = event.currentTarget.value;
        if (
          !isBoundedTextCandidate(
            candidate,
            UI_LIMITS.maxTextValueCodePoints,
          )
        ) {
          event.currentTarget.value = props.value;
          return;
        }
        if (!emit(
          "preview",
          candidate,
          interaction.take("assistive-technology"),
        )) {
          return;
        }
        latestPreviewValue.current = candidate;
        hasPreview.current = true;
      }}
      onKeyDown={(event) => {
        interaction.onKeyDown(event);
        if (unavailable) {
          if (
            event.key === "ArrowDown" ||
            event.key === "ArrowUp" ||
            event.key === "Enter" ||
            event.key === "Escape"
          ) {
            event.preventDefault();
          }
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          emit("cancel", focusValue.current, interaction.take("keyboard"));
          event.currentTarget.value = focusValue.current;
          hasPreview.current = false;
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const candidate = event.currentTarget.value;
          if (
            !isBoundedTextCandidate(
              candidate,
              UI_LIMITS.maxTextValueCodePoints,
            )
          ) {
            event.currentTarget.value = props.value;
            return;
          }
          if (emit("commit", candidate, interaction.take("keyboard"))) {
            focusValue.current = candidate;
            latestPreviewValue.current = candidate;
            hasPreview.current = false;
          }
          return;
        }
        if (
          (event.key === "ArrowDown" || event.key === "ArrowUp") &&
          props.parsedValue !== null
        ) {
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? 1 : -1;
          const candidate = props.parsedValue + direction * props.step;
          if (
            (props.min !== null && candidate < props.min) ||
            (props.max !== null && candidate > props.max)
          ) {
            return;
          }
          const candidateText = String(candidate);
          if (emit("commit", candidateText, interaction.take("keyboard"))) {
            focusValue.current = candidateText;
            latestPreviewValue.current = candidateText;
            hasPreview.current = false;
          }
        }
      }}
      onPointerDown={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        interaction.onPointerDown(event);
      }}
      placeholder={props.placeholder ?? undefined}
      readOnly={props.readOnly || props.busy}
      role="spinbutton"
      type="text"
      value={props.value}
    />
  );
}

export function Select<Value extends string = string>(
  props: UiSelectProps<Value>,
) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  requireCallback(props.id, ["onValueChange"], props.onValueChange);
  requireOptions(props.id, props.options, UI_LIMITS.maxSelectOptions);
  requireUiResult(validateSelectedOption(props.id, props.options, props.value));
  const interaction = useInteractionSource<HTMLSelectElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const selectedIndex = props.options.findIndex(
    (option) => option.value === props.value,
  );
  const domValue =
    selectedIndex < 0 ? NO_SELECTION_VALUE : `option-${String(selectedIndex)}`;
  const unavailable = props.disabled || props.busy;

  return (
    <select
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-disabled={props.busy ? "true" : undefined}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-label={field.useAccessibleName ? props.accessibleName : undefined}
      aria-labelledby={field.labelledBy}
      aria-required={field.required ? "true" : undefined}
      class="ui-form-control ui-select"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      disabled={unavailable}
      id={props.id}
      onChange={(event) => {
        if (unavailable) {
          event.currentTarget.value = domValue;
          return;
        }
        const match = /^option-(\d+)$/u.exec(event.currentTarget.value);
        if (match === null) {
          event.currentTarget.value = domValue;
          return;
        }
        const index = Number(match[1]);
        const option = props.options[index];
        if (option === undefined || option.disabled) {
          event.currentTarget.value = domValue;
          return;
        }
        props.onValueChange({
          componentId: props.id,
          phase: "commit",
          previousValue: props.value,
          source: interaction.take("assistive-technology"),
          value: option.value,
        });
      }}
      onKeyDown={(event) => {
        if (props.busy) {
          event.preventDefault();
          return;
        }
        interaction.onKeyDown(event);
      }}
      onPointerDown={(event) => {
        if (props.busy) {
          event.preventDefault();
          return;
        }
        interaction.onPointerDown(event);
      }}
      value={domValue}
    >
      <option disabled value={NO_SELECTION_VALUE}>
        No selection
      </option>
      {props.options.map((option, index) => (
        <option
          disabled={option.disabled}
          key={option.id}
          value={`option-${String(index)}`}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Combobox<Value extends string = string>(
  props: UiComboboxProps<Value>,
) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  requireBoolean(props.id, ["open"], props.open);
  const autocomplete: unknown = props.autocomplete;
  requireCondition(
    autocomplete === "none" || autocomplete === "list-manual",
    "ui.value_malformed",
    props.id,
    ["autocomplete"],
    "The combobox autocomplete mode is outside the reviewed closed set.",
    "Use none or list-manual autocomplete.",
  );
  requireCallback(props.id, ["onInputChange"], props.onInputChange);
  requireCallback(props.id, ["onValueChange"], props.onValueChange);
  requireCallback(props.id, ["onOpenChange"], props.onOpenChange);
  requireTextValue(props.id, ["inputValue"], props.inputValue);
  requireOptions(props.id, props.options, UI_LIMITS.maxComboboxOptions);
  requireUiResult(
    validateSelectedOption(props.id, props.options, props.selectedValue),
  );
  if (props.activeOptionId !== null) {
    requireUiResult(
      validateUiId(props.id, ["activeOptionId"], props.activeOptionId),
    );
  }
  const activeOption =
    props.activeOptionId === null
      ? null
      : props.options.find((option) => option.id === props.activeOptionId) ?? null;
  requireCondition(
    props.activeOptionId === null ||
      (activeOption !== null && !activeOption.disabled),
    "ui.selection_invalid",
    props.id,
    ["activeOptionId"],
    "The active combobox option must name one enabled current option.",
    "Use an enabled identity from the current option collection.",
  );
  const itemIds = props.options.map((option) => option.id);
  const disabledIds = props.options
    .filter((option) => option.disabled)
    .map((option) => option.id);
  requireUiResult(
    preflightRovingFocus({
      currentId: props.activeOptionId,
      disabledIds,
      itemIds,
      orientation: "vertical",
      ownerId: props.id,
      typeahead: false,
      wrap: true,
    }),
  );

  const selectedId =
    props.options.find((option) => option.value === props.selectedValue)?.id ??
    null;
  const [activeId, setActiveId] = useRovingId(
    props.activeOptionId ?? selectedId,
    itemIds,
    disabledIds,
  );
  const generatedId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const interaction = useInteractionSource<HTMLInputElement>();
  const clearInteraction = useInteractionSource<HTMLButtonElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const popupId = `${generatedId}-combobox-listbox`;
  const optionDomIds = new Map(
    props.options.map((option, index) => [
      option.id,
      `${generatedId}-combobox-option-${String(index)}`,
    ]),
  );
  const unavailable = props.disabled || props.busy;

  const setOpen = (
    open: boolean,
    phase: "cancel" | "commit" | "preview",
    source: UiInteractionSource,
  ): void => {
    if (open === props.open && phase !== "cancel") return;
    props.onOpenChange({
      componentId: props.id,
      phase,
      previousValue: props.open,
      source,
      value: open,
    });
  };

  const commitOption = (
    option: UiOption<Value>,
    source: UiInteractionSource,
  ): void => {
    if (unavailable || option.disabled) return;
    props.onValueChange({
      componentId: props.id,
      phase: "commit",
      previousValue: props.selectedValue,
      source,
      value: option.value,
    });
    setOpen(false, "commit", source);
    inputRef.current?.focus();
  };

  const clearSelection = (source: UiInteractionSource): void => {
    if (unavailable || props.selectedValue === null) return;
    props.onValueChange({
      componentId: props.id,
      phase: "commit",
      previousValue: props.selectedValue,
      source,
      value: null,
    });
    inputRef.current?.focus();
  };

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      class="ui-combobox"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
    >
      <div class="ui-combobox__control">
        <input
          aria-activedescendant={
            props.open && activeId !== null
              ? optionDomIds.get(activeId)
              : undefined
          }
          aria-autocomplete={
            props.autocomplete === "list-manual" ? "list" : "none"
          }
          aria-busy={props.busy ? "true" : undefined}
          aria-controls={popupId}
          aria-describedby={joinIdReferences(field.describedBy)}
          aria-errormessage={field.errorMessage}
          aria-expanded={props.open ? "true" : "false"}
          aria-haspopup="listbox"
          aria-invalid={field.invalid ? "true" : undefined}
          aria-label={field.useAccessibleName ? props.accessibleName : undefined}
          aria-labelledby={field.labelledBy}
          aria-required={field.required ? "true" : undefined}
          autoComplete="off"
          class="ui-form-control ui-combobox__input"
          disabled={props.disabled}
          id={props.id}
          onBlur={interaction.reset}
          onInput={(event) => {
            if (unavailable) {
              event.currentTarget.value = props.inputValue;
              return;
            }
            const candidate = event.currentTarget.value;
            if (
              !isBoundedTextCandidate(
                candidate,
                UI_LIMITS.maxTextValueCodePoints,
              )
            ) {
              event.currentTarget.value = props.inputValue;
              return;
            }
            const source = interaction.take("assistive-technology");
            props.onInputChange({
              componentId: props.id,
              phase: "preview",
              previousValue: props.inputValue,
              source,
              value: candidate,
            });
            if (!props.open) setOpen(true, "preview", source);
          }}
          onKeyDown={(event) => {
            interaction.onKeyDown(event);
            if (unavailable) {
              if (
                isRovingKey(event.key) ||
                event.key === "Enter" ||
                event.key === "Escape"
              ) {
                event.preventDefault();
              }
              return;
            }
            if (event.key === "Escape" && props.open) {
              event.preventDefault();
              setOpen(false, "cancel", interaction.take("keyboard"));
              return;
            }
            if (event.key === "Enter" && props.open && activeId !== null) {
              const option = props.options.find((item) => item.id === activeId);
              if (option !== undefined) {
                event.preventDefault();
                commitOption(option, interaction.take("keyboard"));
              }
              return;
            }
            if (!isRovingKey(event.key)) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              return;
            }
            event.preventDefault();
            if (!props.open) {
              setOpen(true, "commit", interaction.take("keyboard"));
            }
            const move = moveRovingFocus(
              {
                currentId: activeId,
                disabledIds,
                itemIds,
                orientation: "vertical",
                ownerId: props.id,
                typeahead: false,
                wrap: true,
              },
              event.key,
            );
            if (move.consumed) setActiveId(move.currentId);
          }}
          onPointerDown={(event) => {
            if (unavailable) {
              event.preventDefault();
              return;
            }
            interaction.onPointerDown(event);
          }}
          readOnly={props.busy}
          ref={inputRef}
          role="combobox"
          type="text"
          value={props.inputValue}
        />
        <button
          aria-disabled={props.busy ? "true" : undefined}
          aria-label="Clear selected option"
          class="ui-button ui-combobox__clear"
          data-busy={props.busy ? "true" : undefined}
          data-density={props.density}
          data-variant="outline"
          disabled={unavailable || props.selectedValue === null}
          onClick={(event) => {
            if (unavailable || props.selectedValue === null) {
              event.preventDefault();
              return;
            }
            clearSelection(
              clearInteraction.take(
                event.detail === 0 ? "assistive-technology" : "pointer",
              ),
            );
          }}
          onKeyDown={(event) => {
            if (
              props.busy &&
              (event.key === " " || event.key === "Enter")
            ) {
              event.preventDefault();
              return;
            }
            clearInteraction.onKeyDown(event);
          }}
          onPointerDown={(event) => {
            if (unavailable || props.selectedValue === null) {
              event.preventDefault();
              return;
            }
            clearInteraction.onPointerDown(event);
          }}
          type="button"
        >
          Clear
        </button>
      </div>
      <div
        aria-label="Available options"
        class="ui-options ui-combobox__listbox"
        hidden={!props.open}
        id={popupId}
        role="listbox"
      >
        {props.options.length === 0 ? (
          <span class="ui-options__empty">No options</span>
        ) : null}
        {props.options.map((option) => (
          <div
            aria-disabled={option.disabled ? "true" : undefined}
            aria-selected={
              option.value === props.selectedValue ? "true" : "false"
            }
            class="ui-option"
            data-active={activeId === option.id ? "true" : undefined}
            data-ui-item-id={option.id}
            id={optionDomIds.get(option.id)}
            key={option.id}
            onClick={(event) => {
              commitOption(option, clickSource(event.detail));
            }}
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onPointerMove={() => {
              if (!option.disabled) setActiveId(option.id);
            }}
            role="option"
          >
            <span class="ui-option__label">{option.label}</span>
            {option.description === null ? null : (
              <span class="ui-option__description">{option.description}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Listbox<Value extends string = string>(
  props: UiListboxProps<Value>,
) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  requireSelectionMode(props.id, props.selectionMode);
  requireCallback(props.id, ["onSelectionChange"], props.onSelectionChange);
  requireOptions(props.id, props.options, UI_LIMITS.maxListboxOptions);
  requireSelectedIds(
    props.id,
    props.options,
    props.selectedIds,
    UI_LIMITS.maxListboxOptions,
  );
  if (props.activeId !== null) {
    requireUiResult(validateUiId(props.id, ["activeId"], props.activeId));
  }
  requireCondition(
    props.selectionMode === "multiple" || props.selectedIds.length <= 1,
    "ui.selection_invalid",
    props.id,
    ["selectedIds"],
    "A single-select listbox cannot contain multiple selected identities.",
    "Select at most one option in single-selection mode.",
  );
  const activeOption =
    props.activeId === null
      ? null
      : props.options.find((option) => option.id === props.activeId) ?? null;
  requireCondition(
    props.activeId === null || (activeOption !== null && !activeOption.disabled),
    "ui.selection_invalid",
    props.id,
    ["activeId"],
    "The active listbox identity must name one enabled current option.",
    "Use an enabled identity from the current option collection.",
  );
  const itemIds = props.options.map((option) => option.id);
  const disabledIds = props.options
    .filter((option) => option.disabled)
    .map((option) => option.id);
  requireUiResult(
    preflightRovingFocus({
      currentId: props.activeId,
      disabledIds,
      itemIds,
      orientation: "vertical",
      ownerId: props.id,
      typeahead: true,
      wrap: true,
    }),
  );
  const selectedFocus = props.selectedIds.find(
    (id) => !disabledIds.includes(id),
  );
  const [focusedId, setFocusedId] = useRovingId(
    props.activeId ?? selectedFocus ?? null,
    itemIds,
    disabledIds,
  );
  const generatedId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const interaction = useInteractionSource<HTMLDivElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const typeahead = useRef<ListboxTypeaheadState>({ query: "", timeStamp: 0 });
  const optionDomIds = new Map(
    props.options.map((option, index) => [
      option.id,
      `${generatedId}-listbox-option-${String(index)}`,
    ]),
  );
  const unavailable = props.disabled || props.busy;

  const commitId = (id: string, source: UiInteractionSource): void => {
    if (unavailable || disabledIds.includes(id)) return;
    const selected = props.selectedIds.includes(id);
    const value =
      props.selectionMode === "single"
        ? [id]
        : selected
          ? props.selectedIds.filter((selectedId) => selectedId !== id)
          : [...props.selectedIds, id];
    props.onSelectionChange({
      componentId: props.id,
      phase: "commit",
      previousValue: props.selectedIds,
      source,
      value: Object.freeze(value),
    });
  };

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-disabled={unavailable ? "true" : undefined}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-label={field.useAccessibleName ? props.accessibleName : undefined}
      aria-labelledby={field.labelledBy}
      aria-multiselectable={
        props.selectionMode === "multiple" ? "true" : undefined
      }
      aria-required={field.required ? "true" : undefined}
      class="ui-options ui-listbox"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      id={props.id}
      onKeyDown={(event) => {
        if (unavailable) {
          if (
            event.key === " " ||
            event.key === "Enter" ||
            isRovingKey(event.key)
          ) {
            event.preventDefault();
          }
          interaction.reset();
          return;
        }
        interaction.onKeyDown(event);
        const targetId = itemIdFromTarget(event.target) ?? focusedId;
        if (event.key === " " || event.key === "Enter") {
          if (targetId !== null) {
            event.preventDefault();
            commitId(targetId, interaction.take("keyboard"));
          }
          return;
        }
        if (isRovingKey(event.key)) {
          const move = moveRovingFocus(
            {
              currentId: targetId,
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
            setFocusedId(move.currentId);
            focusItem(rootRef.current, move.currentId);
          }
          return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }
        const nextTypeahead = advanceListboxTypeahead(
          typeahead.current,
          event.key,
          event.timeStamp,
        );
        if (nextTypeahead === null) return;
        typeahead.current = nextTypeahead;
        const labels = new Map(
          props.options.map((option) => [option.id, option.label] as const),
        );
        const match = findTypeaheadMatch(
          itemIds,
          disabledIds,
          targetId,
          labels,
          nextTypeahead.query,
        );
        if (match !== null) {
          event.preventDefault();
          setFocusedId(match);
          focusItem(rootRef.current, match);
        }
      }}
      onPointerDown={(event) => {
        if (unavailable) {
          event.preventDefault();
          interaction.reset();
          return;
        }
        interaction.onPointerDown(event);
      }}
      ref={rootRef}
      role="listbox"
      tabIndex={props.options.length === 0 && !props.disabled ? 0 : -1}
    >
      {props.options.length === 0 ? (
        <span class="ui-options__empty">No options</span>
      ) : null}
      {props.options.map((option) => (
        <div
          aria-disabled={option.disabled ? "true" : undefined}
          aria-selected={
            props.selectedIds.includes(option.id) ? "true" : "false"
          }
          class="ui-option"
          data-active={focusedId === option.id ? "true" : undefined}
          data-ui-item-id={option.id}
          id={optionDomIds.get(option.id)}
          key={option.id}
          onClick={(event) => {
            commitId(option.id, clickSource(event.detail));
          }}
          onFocus={() => {
            if (!option.disabled) setFocusedId(option.id);
          }}
          role="option"
          tabIndex={
            !unavailable && !option.disabled && focusedId === option.id ? 0 : -1
          }
        >
          <span class="ui-option__label">{option.label}</span>
          {option.description === null ? null : (
            <span class="ui-option__description">{option.description}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Checkbox(props: UiCheckboxProps) {
  requireCommon(props);
  requireUiResult(
    validateUiText(
      props.id,
      ["label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  const checked: unknown = props.checked;
  requireCondition(
    checked === true || checked === false || checked === "mixed",
    "ui.value_malformed",
    props.id,
    ["checked"],
    "Checkbox state is outside the reviewed checked, unchecked, and mixed set.",
    "Use true, false, or mixed checkbox state.",
  );
  requireCallback(props.id, ["onCheckedChange"], props.onCheckedChange);
  const inputRef = useRef<HTMLInputElement>(null);
  const interaction = useInteractionSource<HTMLInputElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const unavailable = props.disabled || props.busy;

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.indeterminate = props.checked === "mixed";
    }
  }, [props.checked]);

  return (
    <label
      class="ui-check-control"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
    >
      <input
        aria-busy={props.busy ? "true" : undefined}
        aria-checked={props.checked}
        aria-describedby={joinIdReferences(field.describedBy)}
        aria-disabled={props.busy ? "true" : undefined}
        aria-errormessage={field.errorMessage}
        aria-invalid={field.invalid ? "true" : undefined}
        aria-labelledby={field.labelledBy}
        aria-required={field.required ? "true" : undefined}
        checked={props.checked === true}
        class="ui-checkbox"
        disabled={unavailable}
        id={props.id}
        onChange={(event) => {
          if (unavailable) {
            event.currentTarget.checked = props.checked === true;
            event.currentTarget.indeterminate = props.checked === "mixed";
            return;
          }
          props.onCheckedChange({
            componentId: props.id,
            phase: "commit",
            previousValue: props.checked,
            source: interaction.take("assistive-technology"),
            value: event.currentTarget.checked,
          });
        }}
        onClick={(event) => {
          if (unavailable) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (props.busy) {
            if (event.key === " ") event.preventDefault();
            return;
          }
          interaction.onKeyDown(event);
        }}
        onPointerDown={(event) => {
          if (props.busy) {
            event.preventDefault();
            return;
          }
          interaction.onPointerDown(event);
        }}
        ref={inputRef}
        type="checkbox"
      />
      <span class="ui-check-control__label">{props.label}</span>
    </label>
  );
}

type RadioChoiceGroupProps<Value extends string> = Readonly<{
  orientation: "both" | "horizontal";
  props: UiRadioGroupProps<Value>;
  selectOnMove: boolean;
  variant: "radio" | "segmented";
}>;

function RadioChoiceGroup<Value extends string>({
  orientation,
  props,
  selectOnMove,
  variant,
}: RadioChoiceGroupProps<Value>) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  requireBoolean(props.id, ["insideToolbar"], props.insideToolbar);
  requireCallback(props.id, ["onValueChange"], props.onValueChange);
  requireOptions(props.id, props.options, UI_LIMITS.maxRadioItems);
  requireUiResult(validateSelectedOption(props.id, props.options, props.value));
  const itemIds = props.options.map((option) => option.id);
  const disabledIds = props.options
    .filter((option) => option.disabled)
    .map((option) => option.id);
  const selectedId =
    props.options.find((option) => option.value === props.value)?.id ?? null;
  requireUiResult(
    preflightRovingFocus({
      currentId: selectedId,
      disabledIds,
      itemIds,
      orientation,
      ownerId: props.id,
      typeahead: false,
      wrap: true,
    }),
  );
  const [focusedId, setFocusedId] = useRovingId(
    selectedId ?? firstEnabledId(props.options),
    itemIds,
    disabledIds,
  );
  const generatedId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const interaction = useInteractionSource<HTMLDivElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const optionDomIds = new Map(
    props.options.map((option, index) => [
      option.id,
      `${generatedId}-radio-option-${String(index)}`,
    ]),
  );
  const unavailable = props.disabled || props.busy;

  const commitOption = (
    option: UiOption<Value>,
    source: UiInteractionSource,
  ): void => {
    if (unavailable || option.disabled || option.value === props.value) return;
    props.onValueChange({
      componentId: props.id,
      phase: "commit",
      previousValue: props.value,
      source,
      value: option.value,
    });
  };

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-disabled={unavailable ? "true" : undefined}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-label={field.useAccessibleName ? props.accessibleName : undefined}
      aria-labelledby={field.labelledBy}
      aria-orientation={orientation === "horizontal" ? "horizontal" : undefined}
      aria-required={field.required ? "true" : undefined}
      class={`ui-radio-group ui-radio-group--${variant}`}
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      id={props.id}
      onKeyDown={(event) => {
        if (unavailable) {
          if (
            event.key === " " ||
            event.key === "Enter" ||
            isRovingKey(event.key)
          ) {
            event.preventDefault();
          }
          interaction.reset();
          return;
        }
        interaction.onKeyDown(event);
        const targetId = itemIdFromTarget(event.target) ?? focusedId;
        if (event.key === " " || event.key === "Enter") {
          const option = props.options.find((item) => item.id === targetId);
          if (option !== undefined) {
            event.preventDefault();
            commitOption(option, interaction.take("keyboard"));
          }
          return;
        }
        if (!isRovingKey(event.key)) return;
        const move = moveRovingFocus(
          {
            currentId: targetId,
            disabledIds,
            itemIds,
            orientation,
            ownerId: props.id,
            typeahead: false,
            wrap: true,
          },
          event.key,
        );
        if (!move.consumed) return;
        event.preventDefault();
        setFocusedId(move.currentId);
        focusItem(rootRef.current, move.currentId);
        if (selectOnMove && move.currentId !== null) {
          const option = props.options.find((item) => item.id === move.currentId);
          if (option !== undefined) commitOption(option, interaction.take("keyboard"));
        }
      }}
      onPointerDown={(event) => {
        if (unavailable) {
          event.preventDefault();
          interaction.reset();
          return;
        }
        interaction.onPointerDown(event);
      }}
      ref={rootRef}
      role="radiogroup"
    >
      {props.options.map((option) => (
        <button
          aria-checked={option.value === props.value ? "true" : "false"}
          aria-disabled={props.busy ? "true" : undefined}
          class="ui-radio-option"
          data-ui-item-id={option.id}
          disabled={props.disabled || option.disabled}
          id={optionDomIds.get(option.id)}
          key={option.id}
          onClick={(event) => {
            commitOption(option, interaction.take(clickSource(event.detail)));
          }}
          onFocus={() => {
            if (!option.disabled) setFocusedId(option.id);
          }}
          role="radio"
          tabIndex={
            !unavailable && !option.disabled && focusedId === option.id ? 0 : -1
          }
          type="button"
        >
          <span class="ui-radio-option__indicator" aria-hidden="true" />
          <span class="ui-radio-option__copy">
            <span class="ui-radio-option__label">{option.label}</span>
            {option.description === null ? null : (
              <span class="ui-option__description">{option.description}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function RadioGroup<Value extends string = string>(
  props: UiRadioGroupProps<Value>,
) {
  return (
    <RadioChoiceGroup
      orientation="both"
      props={props}
      selectOnMove={!props.insideToolbar}
      variant="radio"
    />
  );
}

export function Switch(props: UiSwitchProps) {
  requireCommon(props);
  requireUiResult(
    validateUiText(
      props.id,
      ["label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  requireBoolean(props.id, ["checked"], props.checked);
  requireCallback(props.id, ["onCheckedChange"], props.onCheckedChange);
  const interaction = useInteractionSource<HTMLButtonElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const unavailable = props.disabled || props.busy;

  return (
    <button
      aria-busy={props.busy ? "true" : undefined}
      aria-checked={props.checked ? "true" : "false"}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-disabled={props.busy ? "true" : undefined}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-label={field.useAccessibleName ? props.label : undefined}
      aria-labelledby={field.labelledBy}
      aria-required={field.required ? "true" : undefined}
      class="ui-switch"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      data-state={props.checked ? "on" : "off"}
      disabled={unavailable}
      id={props.id}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        props.onCheckedChange({
          componentId: props.id,
          phase: "commit",
          previousValue: props.checked,
          source: interaction.take(clickSource(event.detail)),
          value: !props.checked,
        });
      }}
      onKeyDown={(event) => {
        if (props.busy && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          return;
        }
        interaction.onKeyDown(event);
      }}
      onPointerDown={(event) => {
        if (props.busy) {
          event.preventDefault();
          return;
        }
        interaction.onPointerDown(event);
      }}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" class="ui-switch__track">
        <span class="ui-switch__thumb" />
      </span>
      <span class="ui-switch__label">{props.label}</span>
      <span aria-hidden="true" class="ui-switch__state">
        {props.checked ? "On" : "Off"}
      </span>
    </button>
  );
}

type SliderGestureSnapshot = Readonly<{
  initialValue: number;
  latestValue: number;
  pointerId: number | null;
}>;

type SliderGestureState = {
  active: boolean;
  initialValue: number;
  latestValue: number;
  pointerId: number | null;
};

function releaseSliderPointerCapture(
  control: HTMLInputElement | null,
  pointerId: number | null,
): void {
  if (
    control !== null &&
    pointerId !== null &&
    control.hasPointerCapture(pointerId)
  ) {
    control.releasePointerCapture(pointerId);
  }
}

export function Slider(props: UiSliderProps) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  const orientation: unknown = props.orientation;
  requireCondition(
    orientation === "horizontal" || orientation === "vertical",
    "ui.value_malformed",
    props.id,
    ["orientation"],
    "The slider orientation is outside the reviewed closed set.",
    "Use horizontal or vertical orientation.",
  );
  requireCallback(props.id, ["onValueChange"], props.onValueChange);
  requireUiResult(
    validateFiniteRange(props.id, props.value, props.min, props.max, props.step),
  );
  requireUiResult(
    validateUiText(
      props.id,
      ["valueText"],
      props.valueText,
      UI_LIMITS.maxDescriptionCodePoints,
    ),
  );
  requireCondition(
    props.pageStep === null ||
      (Number.isFinite(props.pageStep) && props.pageStep > 0),
    "ui.step_invalid",
    props.id,
    ["pageStep"],
    "The optional slider page step must be finite and greater than zero.",
    "Provide a positive finite page step or null.",
  );

  const interaction = useInteractionSource<HTMLInputElement>();
  const numericInteraction = useInteractionSource<HTMLInputElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const rangeRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<SliderGestureState>({
    active: false,
    initialValue: props.value,
    latestValue: props.value,
    pointerId: null,
  });
  const latest = useRef({
    componentId: props.id,
    onValueChange: props.onValueChange,
  });
  latest.current = {
    componentId: props.id,
    onValueChange: props.onValueChange,
  };
  const unavailable = props.disabled || props.busy;

  useEffect(
    () => () => {
      if (!gesture.current.active) return;
      releaseSliderPointerCapture(
        rangeRef.current,
        gesture.current.pointerId,
      );
      latest.current.onValueChange({
        componentId: latest.current.componentId,
        phase: "cancel",
        previousValue: gesture.current.latestValue,
        source: "programmatic",
        value: gesture.current.initialValue,
      });
      gesture.current = {
        ...gesture.current,
        active: false,
        pointerId: null,
      };
    },
    [],
  );

  const begin = (pointerId: number | null = null): void => {
    if (gesture.current.active) {
      if (pointerId !== null) {
        gesture.current = { ...gesture.current, pointerId };
      }
      return;
    }
    gesture.current = {
      active: true,
      initialValue: props.value,
      latestValue: props.value,
      pointerId,
    };
  };

  const preview = (value: number, source: UiInteractionSource): boolean => {
    if (!validateFiniteRange(props.id, value, props.min, props.max, props.step).ok) {
      return false;
    }
    begin();
    gesture.current.latestValue = value;
    props.onValueChange({
      componentId: props.id,
      phase: "preview",
      previousValue: gesture.current.initialValue,
      source,
      value,
    });
    return true;
  };

  const finish = (
    phase: "cancel" | "commit",
    source: UiInteractionSource,
  ): SliderGestureSnapshot | null => {
    if (!gesture.current.active) return null;
    const completed = Object.freeze({
      initialValue: gesture.current.initialValue,
      latestValue: gesture.current.latestValue,
      pointerId: gesture.current.pointerId,
    });
    props.onValueChange({
      componentId: props.id,
      phase,
      previousValue:
        phase === "cancel"
          ? completed.latestValue
          : completed.initialValue,
      source,
      value:
        phase === "cancel"
          ? completed.initialValue
          : completed.latestValue,
    });
    gesture.current = {
      active: false,
      initialValue: completed.initialValue,
      latestValue: completed.latestValue,
      pointerId: null,
    };
    return completed;
  };

  const isSliderKey = (key: string): boolean =>
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "End" ||
    key === "Home" ||
    key === "PageDown" ||
    key === "PageUp";

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      class="ui-slider"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      data-orientation={props.orientation}
    >
      <input
        aria-describedby={joinIdReferences(field.describedBy)}
        aria-disabled={props.busy ? "true" : undefined}
        aria-errormessage={field.errorMessage}
        aria-invalid={field.invalid ? "true" : undefined}
        aria-label={field.useAccessibleName ? props.accessibleName : undefined}
        aria-labelledby={field.labelledBy}
        aria-orientation={props.orientation}
        aria-required={field.required ? "true" : undefined}
        aria-valuetext={props.valueText}
        class="ui-slider__input"
        disabled={unavailable}
        id={props.id}
        max={props.max}
        min={props.min}
        onBlur={(event) => {
          const completed = finish(
            unavailable ? "cancel" : "commit",
            interaction.take("programmatic"),
          );
          if (unavailable && completed !== null) {
            event.currentTarget.valueAsNumber = completed.initialValue;
            releaseSliderPointerCapture(
              event.currentTarget,
              completed.pointerId,
            );
          }
          interaction.reset();
        }}
        onInput={(event) => {
          if (unavailable) {
            event.currentTarget.valueAsNumber = props.value;
            return;
          }
          const accepted = preview(
            event.currentTarget.valueAsNumber,
            interaction.take("assistive-technology"),
          );
          if (!accepted) event.currentTarget.valueAsNumber = props.value;
        }}
        onKeyDown={(event) => {
          interaction.onKeyDown(event);
          if (unavailable) {
            if (isSliderKey(event.key) || event.key === "Escape") {
              event.preventDefault();
            }
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            const completed = finish("cancel", interaction.take("keyboard"));
            if (completed !== null) {
              event.currentTarget.valueAsNumber = completed.initialValue;
              releaseSliderPointerCapture(
                event.currentTarget,
                completed.pointerId,
              );
            }
            return;
          }
          if (
            (event.key === "PageDown" || event.key === "PageUp") &&
            props.pageStep !== null
          ) {
            event.preventDefault();
            begin();
            const direction = event.key === "PageUp" ? 1 : -1;
            const candidate = Math.max(
              props.min,
              Math.min(
                props.max,
                gesture.current.latestValue + direction * props.pageStep,
              ),
            );
            if (candidate !== gesture.current.latestValue) {
              preview(candidate, interaction.take("keyboard"));
            }
            return;
          }
          if (isSliderKey(event.key)) begin();
        }}
        onKeyUp={(event) => {
          if (!unavailable && isSliderKey(event.key)) {
            finish("commit", interaction.take("keyboard"));
          }
        }}
        onPointerCancel={(event) => {
          const completed = finish("cancel", interaction.take("pointer"));
          if (completed !== null) {
            event.currentTarget.valueAsNumber = completed.initialValue;
            releaseSliderPointerCapture(
              event.currentTarget,
              completed.pointerId,
            );
          }
          releaseSliderPointerCapture(event.currentTarget, event.pointerId);
        }}
        onPointerDown={(event) => {
          if (unavailable) {
            event.preventDefault();
            return;
          }
          interaction.onPointerDown(event);
          begin(event.pointerId);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const completed = finish(
            unavailable ? "cancel" : "commit",
            interaction.take("pointer"),
          );
          if (unavailable && completed !== null) {
            event.currentTarget.valueAsNumber = completed.initialValue;
            releaseSliderPointerCapture(
              event.currentTarget,
              completed.pointerId,
            );
          }
          releaseSliderPointerCapture(event.currentTarget, event.pointerId);
        }}
        ref={rangeRef}
        step={props.step}
        type="range"
        value={props.value}
      />
      <label class="ui-slider__numeric">
        <span class="ui-slider__numeric-label">{props.accessibleName}</span>
        <input
          aria-busy={props.busy ? "true" : undefined}
          aria-describedby={joinIdReferences(props.describedBy)}
          aria-disabled={props.busy ? "true" : undefined}
          aria-invalid={props.invalid ? "true" : undefined}
          class="ui-form-control ui-slider__numeric-input"
          data-density={props.density}
          data-invalid={props.invalid ? "true" : undefined}
          disabled={unavailable}
          inputMode="decimal"
          max={props.max}
          min={props.min}
          onBlur={(event) => {
            const completed = finish(
              unavailable ? "cancel" : "commit",
              numericInteraction.take("programmatic"),
            );
            if (unavailable && completed !== null) {
              event.currentTarget.valueAsNumber = completed.initialValue;
            }
            numericInteraction.reset();
          }}
          onInput={(event) => {
            if (unavailable) {
              event.currentTarget.valueAsNumber = props.value;
              return;
            }
            const control = event.currentTarget;
            if (!control.validity.valid || !Number.isFinite(control.valueAsNumber)) {
              control.valueAsNumber = props.value;
              return;
            }
            const accepted = preview(
              control.valueAsNumber,
              numericInteraction.take("assistive-technology"),
            );
            if (!accepted) control.valueAsNumber = props.value;
          }}
          onKeyDown={(event) => {
            numericInteraction.onKeyDown(event);
            if (unavailable) {
              if (
                event.key === "ArrowDown" ||
                event.key === "ArrowUp" ||
                event.key === "Enter" ||
                event.key === "Escape"
              ) {
                event.preventDefault();
              }
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              const completed = finish(
                "cancel",
                numericInteraction.take("keyboard"),
              );
              if (completed !== null) {
                event.currentTarget.valueAsNumber = completed.initialValue;
              }
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              finish("commit", numericInteraction.take("keyboard"));
            }
          }}
          onKeyUp={(event) => {
            if (
              !unavailable &&
              (event.key === "ArrowDown" || event.key === "ArrowUp")
            ) {
              finish("commit", numericInteraction.take("keyboard"));
            }
          }}
          onPointerCancel={(event) => {
            const completed = finish(
              "cancel",
              numericInteraction.take("pointer"),
            );
            if (completed !== null) {
              event.currentTarget.valueAsNumber = completed.initialValue;
            }
          }}
          onPointerDown={(event) => {
            if (unavailable) {
              event.preventDefault();
              return;
            }
            numericInteraction.onPointerDown(event);
          }}
          onPointerUp={() => {
            if (!unavailable) {
              finish("commit", numericInteraction.take("pointer"));
            }
          }}
          readOnly={props.busy}
          step={props.step}
          type="number"
          value={props.value}
        />
      </label>
      <output class="ui-slider__value" htmlFor={props.id}>
        {props.valueText}
      </output>
    </div>
  );
}

export function SegmentedControl<Value extends string = string>(
  props: UiSegmentedControlProps<Value>,
) {
  return (
    <RadioChoiceGroup
      orientation="horizontal"
      props={props}
      selectOnMove
      variant="segmented"
    />
  );
}

export function Toggle(props: UiToggleProps) {
  requireCommon(props);
  requireUiResult(
    validateUiText(
      props.id,
      ["label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  requireBoolean(props.id, ["pressed"], props.pressed);
  requireCallback(props.id, ["onPressedChange"], props.onPressedChange);
  const interaction = useInteractionSource<HTMLButtonElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const unavailable = props.disabled || props.busy;

  return (
    <button
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-disabled={props.busy ? "true" : undefined}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-labelledby={field.labelledBy}
      aria-pressed={props.pressed ? "true" : "false"}
      aria-required={field.required ? "true" : undefined}
      class="ui-toggle"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      disabled={unavailable}
      id={props.id}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        props.onPressedChange({
          componentId: props.id,
          phase: "commit",
          previousValue: props.pressed,
          source: interaction.take(clickSource(event.detail)),
          value: !props.pressed,
        });
      }}
      onKeyDown={(event) => {
        if (props.busy && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          return;
        }
        interaction.onKeyDown(event);
      }}
      onPointerDown={(event) => {
        if (props.busy) {
          event.preventDefault();
          return;
        }
        interaction.onPointerDown(event);
      }}
      type="button"
    >
      {props.label}
    </button>
  );
}

export function ToggleGroup(props: UiToggleGroupProps) {
  requireCommon(props);
  requireAccessibleName(props.id, props.accessibleName);
  requireSelectionMode(props.id, props.selectionMode);
  requireCallback(props.id, ["onPressedIdsChange"], props.onPressedIdsChange);
  requireCondition(
    Array.isArray(props.items),
    "ui.value_malformed",
    props.id,
    ["items"],
    "Toggle items must be an ordered array.",
    "Provide a bounded array of declared toggle records.",
  );
  requireCondition(
    Array.isArray(props.pressedIds),
    "ui.value_malformed",
    props.id,
    ["pressedIds"],
    "Pressed identities must be an ordered array.",
    "Provide a bounded array of current toggle identities.",
  );
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["items"],
      props.items,
      "maxToggleItems",
    ),
  );
  requireUiResult(
    validateUiCollectionBound(
      props.id,
      ["pressedIds"],
      props.pressedIds,
      "maxToggleItems",
    ),
  );
  for (const [index, item] of props.items.entries()) {
    const itemValue: unknown = item;
    requireCondition(
      typeof itemValue === "object" &&
        itemValue !== null &&
        !Array.isArray(itemValue),
      "ui.value_malformed",
      props.id,
      ["items", index],
      "Every toggle item must be one declared toggle record.",
      "Provide bounded toggle records with stable identities.",
    );
    requireCommon(item);
    requireBoolean(props.id, ["items", index, "pressed"], item.pressed);
    requireCallback(
      props.id,
      ["items", index, "onPressedChange"],
      item.onPressedChange,
    );
    requireUiResult(
      validateUiText(
        props.id,
        ["items", item.id, "label"],
        item.label,
        UI_LIMITS.maxLabelCodePoints,
      ),
    );
  }
  const itemIds = props.items.map((item) => item.id);
  requireCondition(
    new Set(itemIds).size === itemIds.length,
    "ui.duplicate_item_id",
    props.id,
    ["items"],
    "Toggle identities must be unique within the group.",
    "Give every toggle a unique stable identity.",
  );
  requireCondition(
    !itemIds.includes(props.id),
    "ui.duplicate_item_id",
    props.id,
    ["items"],
    "A toggle identity duplicates its owning group identity.",
    "Give the group and every toggle distinct stable identities.",
  );
  for (const [index, pressedId] of props.pressedIds.entries()) {
    requireUiResult(
      validateUiId(props.id, ["pressedIds", index], pressedId),
    );
  }
  requireCondition(
    new Set(props.pressedIds).size === props.pressedIds.length &&
      props.pressedIds.every((id) => itemIds.includes(id)),
    "ui.selection_invalid",
    props.id,
    ["pressedIds"],
    "Pressed identities must be unique current toggle identities.",
    "Use a bounded unique subset of the current toggle identities.",
  );
  requireCondition(
    props.selectionMode === "multiple" || props.pressedIds.length <= 1,
    "ui.selection_invalid",
    props.id,
    ["pressedIds"],
    "A single-selection toggle group cannot have multiple pressed items.",
    "Keep at most one item pressed in single-selection mode.",
  );
  requireCondition(
    props.items.every(
      (item) => item.pressed === props.pressedIds.includes(item.id),
    ),
    "ui.selection_invalid",
    props.id,
    ["items"],
    "Each toggle pressed state must agree with the group's pressed identities.",
    "Publish one consistent controlled pressed state.",
  );
  const { preferredId, unavailableIds: rovingUnavailableIds } =
    resolveToggleGroupRovingState(props.items, props.pressedIds);
  requireUiResult(
    preflightRovingFocus({
      currentId: preferredId,
      disabledIds: rovingUnavailableIds,
      itemIds,
      orientation: "horizontal",
      ownerId: props.id,
      typeahead: false,
      wrap: true,
    }),
  );
  const [focusedId, setFocusedId] = useRovingId(
    preferredId,
    itemIds,
    rovingUnavailableIds,
  );
  const generatedId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const interaction = useInteractionSource<HTMLDivElement>();
  const field = useFormFieldBinding(
    props.id,
    props.invalid,
    props.describedBy,
  );
  const itemDomIds = new Map(
    props.items.map((item, index) => [
      item.id,
      `${generatedId}-toggle-item-${String(index)}`,
    ]),
  );
  const unavailable = props.disabled || props.busy;

  const commitItem = (
    item: UiToggleProps,
    source: UiInteractionSource,
  ): void => {
    if (unavailable || item.disabled || item.busy) return;
    const pressed = props.pressedIds.includes(item.id);
    const value =
      props.selectionMode === "single"
        ? pressed
          ? []
          : [item.id]
        : pressed
          ? props.pressedIds.filter((id) => id !== item.id)
          : [...props.pressedIds, item.id];
    props.onPressedIdsChange({
      componentId: props.id,
      phase: "commit",
      previousValue: props.pressedIds,
      source,
      value: Object.freeze(value),
    });
  };

  return (
    <div
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(field.describedBy)}
      aria-disabled={unavailable ? "true" : undefined}
      aria-errormessage={field.errorMessage}
      aria-invalid={field.invalid ? "true" : undefined}
      aria-label={field.useAccessibleName ? props.accessibleName : undefined}
      aria-labelledby={field.labelledBy}
      aria-required={field.required ? "true" : undefined}
      class="ui-toggle-group"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      data-selection-mode={props.selectionMode}
      id={props.id}
      onKeyDown={(event) => {
        if (unavailable) {
          if (isRovingKey(event.key)) event.preventDefault();
          interaction.reset();
          return;
        }
        interaction.onKeyDown(event);
        const targetId = itemIdFromTarget(event.target) ?? focusedId;
        if (!isRovingKey(event.key)) return;
        const move = moveRovingFocus(
          {
            currentId: targetId,
            disabledIds: rovingUnavailableIds,
            itemIds,
            orientation: "horizontal",
            ownerId: props.id,
            typeahead: false,
            wrap: true,
          },
          event.key,
        );
        if (!move.consumed) return;
        event.preventDefault();
        setFocusedId(move.currentId);
        focusItem(rootRef.current, move.currentId);
      }}
      onPointerDown={(event) => {
        if (unavailable) {
          event.preventDefault();
          interaction.reset();
          return;
        }
        interaction.onPointerDown(event);
      }}
      ref={rootRef}
      role="group"
    >
      {props.items.map((item) => {
        const itemUnavailable =
          unavailable || item.disabled || item.busy;
        return (
          <button
            aria-busy={item.busy ? "true" : undefined}
            aria-describedby={joinIdReferences(item.describedBy)}
            aria-disabled={props.busy || item.busy ? "true" : undefined}
            aria-invalid={item.invalid ? "true" : undefined}
            aria-pressed={
              props.pressedIds.includes(item.id) ? "true" : "false"
            }
            class="ui-toggle"
            data-busy={item.busy ? "true" : undefined}
            data-density={item.density}
            data-invalid={item.invalid ? "true" : undefined}
            data-ui-item-id={item.id}
            disabled={itemUnavailable}
            id={itemDomIds.get(item.id)}
            key={item.id}
            onClick={(event) => {
              if (itemUnavailable) {
                event.preventDefault();
                return;
              }
              commitItem(item, interaction.take(clickSource(event.detail)));
            }}
            onFocus={() => {
              if (!itemUnavailable) setFocusedId(item.id);
            }}
            tabIndex={!itemUnavailable && focusedId === item.id ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
