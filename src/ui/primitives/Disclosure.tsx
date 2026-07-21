import type { ComponentChildren } from "preact";

import { UI_LIMITS, type UiDisclosureProps } from "../ui-contract";
import { UiIcon } from "./Icon";
import { useInteractionSource } from "./interaction-source";
import { joinIdReferences } from "./id-references";
import {
  requireUiResult,
  uiDiagnostic,
  validateUiCommonProps,
  validateUiId,
  validateUiText,
} from "./validation";

export type DisclosureProps = UiDisclosureProps<ComponentChildren>;

function requireDisclosureProps(props: DisclosureProps): void {
  requireUiResult(validateUiCommonProps(props));
  requireUiResult(
    validateUiText(
      props.id,
      ["label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  requireUiResult(validateUiId(props.id, ["panelId"], props.panelId));
  if (props.panelId === props.id) {
    const refusal = uiDiagnostic(
      "ui.duplicate_item_id",
      props.id,
      ["panelId"],
      "The disclosure trigger and panel identities must be distinct.",
      "Give the disclosure panel its own stable identity.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  if (typeof props.expanded !== "boolean") {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["expanded"],
      "The disclosure expanded state must be boolean.",
      "Provide an explicit boolean expanded state.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  if (typeof props.onExpandedChange !== "function") {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      props.id,
      ["onExpandedChange"],
      "The disclosure change callback is missing or malformed.",
      "Provide a callable expanded-state boundary.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
}

export function Disclosure(props: DisclosureProps) {
  requireDisclosureProps(props);
  const interaction = useInteractionSource<HTMLButtonElement>();

  return (
    <div
      class="ui-disclosure"
      data-density={props.density}
      data-expanded={props.expanded ? "true" : "false"}
      data-invalid={props.invalid ? "true" : undefined}
    >
      <button
        aria-busy={props.busy ? "true" : undefined}
        aria-controls={props.panelId}
        aria-describedby={joinIdReferences(props.describedBy)}
        aria-disabled={props.busy ? "true" : undefined}
        aria-expanded={props.expanded}
        class="ui-disclosure__trigger"
        disabled={props.disabled}
        id={props.id}
        onClick={(event) => {
          if (props.disabled || props.busy) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          props.onExpandedChange({
            componentId: props.id,
            phase: "commit",
            previousValue: props.expanded,
            source: interaction.take(
              event.detail === 0 ? "assistive-technology" : "pointer",
            ),
            value: !props.expanded,
          });
        }}
        onKeyDown={interaction.onKeyDown}
        onPointerDown={interaction.onPointerDown}
        type="button"
      >
        <UiIcon iconId={props.expanded ? "chevron-down" : "chevron-right"} />
        <span>{props.label}</span>
        {props.busy ? <span aria-hidden="true" class="ui-busy-marker" /> : null}
      </button>
      <div
        aria-labelledby={props.id}
        class="ui-disclosure__panel"
        hidden={!props.expanded}
        id={props.panelId}
        role="region"
      >
        {props.content}
      </div>
    </div>
  );
}
