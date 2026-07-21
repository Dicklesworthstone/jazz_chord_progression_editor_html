import {
  UI_LIMITS,
  type UiOwnedIconId,
  type UiStatusPillProps,
  type UiTone,
} from "../ui-contract";
import { requireOwnedIconId, UiIcon } from "./Icon";
import {
  requireUiResult,
  uiDiagnostic,
  validateUiText,
} from "./validation";

const STATUS_PILL_COMPONENT_ID = "U0-CMP-012";

const toneIcons: Readonly<Record<UiTone, UiOwnedIconId>> = {
  error: "error",
  info: "info",
  neutral: "status",
  primary: "status",
  success: "check",
  warning: "warning",
};

function requireStatusPillProps(props: UiStatusPillProps): void {
  requireUiResult(
    validateUiText(
      STATUS_PILL_COMPONENT_ID,
      ["label"],
      props.label,
      UI_LIMITS.maxLabelCodePoints,
    ),
  );
  const tone: unknown = props.tone;
  if (
    tone !== "neutral" &&
    tone !== "primary" &&
    tone !== "info" &&
    tone !== "success" &&
    tone !== "warning" &&
    tone !== "error"
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      STATUS_PILL_COMPONENT_ID,
      ["tone"],
      "The status tone is outside the reviewed closed set.",
      "Use a declared status tone.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
  if (props.iconId !== null) {
    requireOwnedIconId(STATUS_PILL_COMPONENT_ID, ["iconId"], props.iconId);
  }
}

/** Static status text. Announcement ownership deliberately remains upstream. */
export function StatusPill(props: UiStatusPillProps) {
  requireStatusPillProps(props);
  return (
    <span class="ui-status-pill" data-tone={props.tone}>
      <UiIcon iconId={props.iconId ?? toneIcons[props.tone]} />
      <span>{props.label}</span>
    </span>
  );
}
