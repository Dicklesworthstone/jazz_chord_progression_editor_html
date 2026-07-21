import type { ComponentChildren } from "preact";

import type { UiVisuallyHiddenProps } from "../ui-contract";
import { requireUiResult, uiDiagnostic } from "./validation";

const VISUALLY_HIDDEN_COMPONENT_ID = "U0-CMP-009";

export type VisuallyHiddenProps = UiVisuallyHiddenProps<ComponentChildren>;

export function VisuallyHidden(props: VisuallyHiddenProps) {
  if (typeof props.focusableWhenSkippedTo !== "boolean") {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      VISUALLY_HIDDEN_COMPONENT_ID,
      ["focusableWhenSkippedTo"],
      "The visually-hidden focusability state must be boolean.",
      "Provide an explicit boolean focusability state.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  return (
    <span
      class={
        props.focusableWhenSkippedTo
          ? "ui-visually-hidden ui-visually-hidden--focusable"
          : "ui-visually-hidden"
      }
    >
      {props.content}
    </span>
  );
}
