import { UI_LIMITS, type UiInputProps } from "../ui-contract";
import { useInteractionSource } from "./interaction-source";
import { useFieldRelationship } from "./field-context";
import { joinIdReferences } from "./id-references";
import {
  requireUiResult,
  uiDiagnostic,
  validateUiCommonProps,
  validateUiText,
} from "./validation";

function isBoundedInputCandidate(value: string): boolean {
  let codePoints = 0;
  for (let offset = 0; offset < value.length; offset += 1) {
    const codePoint = value.codePointAt(offset);
    if (codePoint !== undefined && codePoint > 0xffff) offset += 1;
    codePoints += 1;
    if (codePoints > UI_LIMITS.maxTextValueCodePoints) return false;
  }
  return true;
}

export function preflightInputProps(props: UiInputProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  requireUiResult(
    validateUiText(
      props.id,
      ["value"],
      props.value,
      UI_LIMITS.maxTextValueCodePoints,
      { allowEmpty: true },
    ),
  );
  if (props.placeholder !== null) {
    requireUiResult(
      validateUiText(
        props.id,
        ["placeholder"],
        props.placeholder,
        UI_LIMITS.maxDescriptionCodePoints,
      ),
    );
  }
  if (typeof props.readOnly !== "boolean") {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["readOnly"],
      "The input read-only state must be boolean.",
      "Provide an explicit boolean read-only state.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  const inputType: unknown = props.inputType;
  if (
    inputType !== "text" &&
    inputType !== "search" &&
    inputType !== "email" &&
    inputType !== "url" &&
    inputType !== "password"
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["inputType"],
      "The input type is outside the reviewed closed set.",
      "Use a declared text input type.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  if (typeof props.onValueChange !== "function") {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["onValueChange"],
      "The input value-change callback is missing or malformed.",
      "Provide a callable value-change boundary.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
}

export function Input(props: UiInputProps) {
  preflightInputProps(props);
  const interaction = useInteractionSource<HTMLInputElement>();
  const field = useFieldRelationship();
  const fieldReferences =
    field === null ? [] : [...field.descriptionIds, ...field.errorIds];
  if (
    field !== null &&
    (field.controlId !== props.id ||
      field.invalid !== props.invalid ||
      fieldReferences.length !== props.describedBy.length ||
      fieldReferences.some((id, index) => props.describedBy[index] !== id))
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["fieldRelationship"],
      "The controlled input disagrees with its owning Field relationship state.",
      "Use the Field validation and description identities on its named control.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }

  return (
    <input
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(props.describedBy)}
      aria-errormessage={
        field?.invalid === true ? joinIdReferences(field.errorIds) : undefined
      }
      aria-invalid={field?.invalid === true || props.invalid ? "true" : undefined}
      aria-label={field === null ? props.accessibleName : undefined}
      aria-labelledby={field?.labelId}
      aria-required={field?.required === true ? "true" : undefined}
      class="ui-input"
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
        if (!isBoundedInputCandidate(candidate)) {
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
      type={props.inputType}
      value={props.value}
    />
  );
}
