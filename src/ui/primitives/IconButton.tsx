import { UI_LIMITS, type UiIconButtonProps } from "../ui-contract";
import { requireOwnedIconId, UiIcon } from "./Icon";
import { useInteractionSource } from "./interaction-source";
import { joinIdReferences } from "./id-references";
import {
  requireUiResult,
  uiDiagnostic,
  validateUiCommonProps,
  validateUiText,
} from "./validation";

function requireIconButtonProps(props: UiIconButtonProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      ["accessibleName"],
      props.accessibleName,
      UI_LIMITS.maxAccessibleNameCodePoints,
    ),
  );
  requireOwnedIconId(props.id, ["iconId"], props.iconId);
  const variant: unknown = props.variant;
  const type: unknown = props.type;
  if (
    variant !== "primary" &&
    variant !== "secondary" &&
    variant !== "outline" &&
    variant !== "ghost" &&
    variant !== "destructive"
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["variant"],
      "The icon-button variant is outside the reviewed closed set.",
      "Use a declared button variant.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  if (
    type !== "button" &&
    type !== "submit" &&
    type !== "reset"
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["type"],
      "The native icon-button type is outside the reviewed closed set.",
      "Use button, submit, or reset.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  if (typeof props.onAction !== "function") {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["onAction"],
      "The icon-button action callback is missing or malformed.",
      "Provide a callable action boundary.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
}

export function IconButton(props: UiIconButtonProps) {
  requireIconButtonProps(props);
  const interaction = useInteractionSource<HTMLButtonElement>();
  const unavailable = props.disabled || props.busy;

  return (
    <button
      aria-busy={props.busy ? "true" : undefined}
      aria-describedby={joinIdReferences(props.describedBy)}
      aria-disabled={props.busy ? "true" : undefined}
      aria-invalid={props.invalid ? "true" : undefined}
      aria-label={props.accessibleName}
      class="ui-icon-button"
      data-busy={props.busy ? "true" : undefined}
      data-density={props.density}
      data-invalid={props.invalid ? "true" : undefined}
      data-variant={props.variant}
      disabled={props.disabled}
      id={props.id}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        props.onAction({
          action: "activate",
          componentId: props.id,
          itemId: null,
          source: interaction.take(
            event.detail === 0 ? "assistive-technology" : "pointer",
          ),
          value: null,
        });
      }}
      onKeyDown={interaction.onKeyDown}
      onPointerDown={interaction.onPointerDown}
      type={props.type}
    >
      {props.busy ? (
        <span aria-hidden="true" class="ui-busy-marker" />
      ) : (
        <UiIcon iconId={props.iconId} />
      )}
    </button>
  );
}
