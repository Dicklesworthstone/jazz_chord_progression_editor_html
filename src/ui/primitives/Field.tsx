import type { ComponentChildren } from "preact";

import {
  UI_LIMITS,
  type UiFieldProps,
  type UiRefusalCode,
} from "../ui-contract";
import { joinIdReferences } from "./id-references";
import { FieldRelationshipContext } from "./field-context";
import {
  requireUiResult,
  uiDiagnostic,
  UiContractError,
  validateUiId,
} from "./validation";

export type FieldProps = UiFieldProps<ComponentChildren>;

function refuseField(
  props: FieldProps,
  code: UiRefusalCode,
  path: readonly (string | number)[],
  message: string,
  recoveryAction: string,
): never {
  const refusal = uiDiagnostic(code, props.id, path, message, recoveryAction);
  throw new UiContractError(refusal);
}

function requireFieldProps(props: FieldProps): void {
  requireUiResult(validateUiId(props.id, ["id"], props.id));
  requireUiResult(validateUiId(props.id, ["controlId"], props.controlId));
  requireUiResult(validateUiId(props.id, ["labelId"], props.labelId));
  if (!Array.isArray(props.descriptionIds)) {
    refuseField(
      props,
      "ui.value_malformed",
      ["descriptionIds"],
      "Field description references must be an ordered identity collection.",
      "Provide a bounded array of description identities.",
    );
  }
  if (!Array.isArray(props.errorIds)) {
    refuseField(
      props,
      "ui.value_malformed",
      ["errorIds"],
      "Field error references must be an ordered identity collection.",
      "Provide a bounded array of error identities.",
    );
  }
  if (
    props.descriptionIds.length > UI_LIMITS.maxReferenceIds ||
    props.errorIds.length > UI_LIMITS.maxReferenceIds ||
    props.descriptionIds.length + props.errorIds.length >
      UI_LIMITS.maxReferenceIds
  ) {
    refuseField(
      props,
      "ui.collection_limit",
      ["descriptionIds", "errorIds"],
      "The field reference collection exceeds its reviewed bound.",
      "Reduce the combined description and error references.",
    );
  }

  const identities = new Set<string>();
  const relationships: ReadonlyArray<
    readonly [path: readonly (string | number)[], value: string]
  > = [
    [["id"], props.id],
    [["controlId"], props.controlId],
    [["labelId"], props.labelId],
    ...props.descriptionIds.map(
      (value, index) => [["descriptionIds", index], value] as const,
    ),
    ...props.errorIds.map(
      (value, index) => [["errorIds", index], value] as const,
    ),
  ];
  for (const [path, value] of relationships) {
    requireUiResult(validateUiId(props.id, path, value));
    if (identities.has(value)) {
      refuseField(
        props,
        "ui.duplicate_item_id",
        path,
        "Field ownership and relationship identities must be unique.",
        "Give the field, control, label, descriptions, and errors distinct identities.",
      );
    }
    identities.add(value);
  }
  if (typeof props.required !== "boolean" || typeof props.invalid !== "boolean") {
    refuseField(
      props,
      "ui.value_malformed",
      ["required", "invalid"],
      "Field requirement and validation state must be boolean.",
      "Provide explicit boolean required and invalid state.",
    );
  }
}

export function Field(props: FieldProps) {
  requireFieldProps(props);
  const descriptions = [...props.descriptionIds, ...props.errorIds];
  const relationship = Object.freeze({
    controlId: props.controlId,
    descriptionIds: props.descriptionIds,
    errorIds: props.errorIds,
    fieldId: props.id,
    invalid: props.invalid,
    labelId: props.labelId,
    required: props.required,
  });

  return (
    <FieldRelationshipContext.Provider value={relationship}>
      <div
        aria-describedby={joinIdReferences(descriptions)}
        aria-invalid={props.invalid ? "true" : undefined}
        aria-labelledby={props.labelId}
        class="ui-field"
        data-invalid={props.invalid ? "true" : undefined}
        data-required={props.required ? "true" : undefined}
        id={props.id}
        role="group"
      >
        {props.content}
      </div>
    </FieldRelationshipContext.Provider>
  );
}
