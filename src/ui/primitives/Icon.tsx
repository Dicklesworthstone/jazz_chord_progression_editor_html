import type { JSX } from "preact";

import {
  UI_OWNED_ICON_IDS,
  type UiOwnedIconId,
} from "../ui-contract";
import { requireUiResult, uiDiagnostic } from "./validation";

export type { UiOwnedIconId } from "../ui-contract";

export type UiIconProps = Readonly<{
  iconId: UiOwnedIconId;
}>;

export function requireOwnedIconId(
  componentId: string,
  path: readonly (string | number)[],
  value: unknown,
): asserts value is UiOwnedIconId {
  if (
    typeof value !== "string" ||
    !UI_OWNED_ICON_IDS.some((iconId) => iconId === value)
  ) {
    const refusal = uiDiagnostic(
      "ui.value_malformed",
      componentId,
      path,
      "The icon identity is outside the reviewed source-owned set.",
      "Use a declared source-owned icon identity.",
    );
    requireUiResult({ diagnostics: [refusal], ok: false, refusal });
  }
}

function iconPaths(iconId: UiOwnedIconId): JSX.Element {
  switch (iconId) {
    case "audio-off":
      return (
        <>
          <path d="M11 5 6 9H3v6h3l5 4Z" />
          <path d="m16 9 5 5" />
          <path d="m21 9-5 5" />
        </>
      );
    case "check":
      return <path d="m5 12 4 4L19 6" />;
    case "chevron-down":
      return <path d="m6 9 6 6 6-6" />;
    case "chevron-left":
      return <path d="m15 6-6 6 6 6" />;
    case "chevron-right":
      return <path d="m9 6 6 6-6 6" />;
    case "close":
    case "error":
      return (
        <>
          <path d="M6 6 18 18" />
          <path d="M18 6 6 18" />
        </>
      );
    case "harmony":
      return (
        <>
          <path d="M5 6h14" />
          <path d="M7 12h10" />
          <path d="M9 18h6" />
        </>
      );
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" />
          <path d="M12 7h.01" />
        </>
      );
    case "library":
      return (
        <>
          <path d="M5 4v16" />
          <path d="M10 4v16" />
          <path d="m14 5 3-1 3 15-3 1Z" />
        </>
      );
    case "loop":
      return (
        <>
          <path d="M17 2 21 6 17 10" />
          <path d="M3 11V9a3 3 0 0 1 3-3h15" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v2a3 3 0 0 1-3 3H3" />
        </>
      );
    case "menu":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      );
    case "next":
      return (
        <>
          <path d="m7 5 8 7-8 7Z" />
          <path d="M18 5v14" />
        </>
      );
    case "pause":
      return (
        <>
          <path d="M8 5v14" />
          <path d="M16 5v14" />
        </>
      );
    case "play":
      return <path d="m8 5 11 7-11 7Z" />;
    case "previous":
      return (
        <>
          <path d="m17 5-8 7 8 7Z" />
          <path d="M6 5v14" />
        </>
      );
    case "redo":
      return (
        <>
          <path d="m17 4 4 4-4 4" />
          <path d="M3 19v-3a8 8 0 0 1 8-8h10" />
        </>
      );
    case "warning":
      return (
        <>
          <path d="M12 3 2.8 20h18.4Z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </>
      );
    case "stop":
      return <rect x="6" y="6" width="12" height="12" rx="1" />;
    case "undo":
      return (
        <>
          <path d="m7 4-4 4 4 4" />
          <path d="M21 19v-3a8 8 0 0 0-8-8H3" />
        </>
      );
    case "status":
      return <circle cx="12" cy="12" r="7" />;
  }
}

/** Decorative, source-owned SVG. Meaning remains on the owning named control. */
export function UiIcon({ iconId }: UiIconProps) {
  requireOwnedIconId("ui-icon", ["iconId"], iconId);
  return (
    <svg
      aria-hidden="true"
      class="ui-icon"
      data-icon-id={iconId}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {iconPaths(iconId)}
    </svg>
  );
}
