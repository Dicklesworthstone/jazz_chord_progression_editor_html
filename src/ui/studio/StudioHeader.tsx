import { useState } from "preact/hooks";

import { Button, VisuallyHidden } from "../primitives";
import { activeTheme, toggleTheme } from "../theme";
import type {
  StudioDocumentView,
  StudioShellCallbacks,
} from "./studio-contract";

/**
 * The paper/night switch. An explicit choice pins [data-theme] on the root
 * and is remembered; until then the OS preference governs. The drawn glyphs
 * (a moon cut from a disc, a small sun) avoid emoji so forced-colors and
 * both themes render them from currentColor.
 */
function ThemeToggle() {
  const [theme, setThemeState] = useState(activeTheme());
  const label = theme === "dark" ? "Switch to paper" : "Switch to night";
  return (
    <button
      aria-label={label}
      class="studio-theme-toggle"
      id="studio-theme-toggle"
      onClick={() => {
        setThemeState(toggleTheme());
      }}
      title={label}
      type="button"
    >
      {theme === "dark" ? (
        <span aria-hidden="true" class="studio-theme-toggle__sun">
          <span class="studio-theme-toggle__sun-core" />
          <span class="studio-theme-toggle__ray" data-ray="n" />
          <span class="studio-theme-toggle__ray" data-ray="s" />
          <span class="studio-theme-toggle__ray" data-ray="w" />
          <span class="studio-theme-toggle__ray" data-ray="e" />
        </span>
      ) : (
        <span aria-hidden="true" class="studio-theme-toggle__moon">
          <span class="studio-theme-toggle__moon-disc" />
          <span class="studio-theme-toggle__moon-bite" />
        </span>
      )}
    </button>
  );
}

export type StudioHeaderProps = Readonly<{
  view: StudioDocumentView;
  callbacks: Pick<
    StudioShellCallbacks,
    | "onTitleDraftChange"
    | "onCommitTitle"
    | "onResetTitleDraft"
    | "onUndo"
    | "onRedo"
    | "onClearChart"
    | "onCopyShareLink"
  >;
}>;

export function StudioHeader({ view, callbacks }: StudioHeaderProps) {
  return (
    <header class="studio-header" id="app-header">
      <div class="studio-brand">
        <div class="studio-brand__copy">
          <h1 class="studio-brand__wordmark">
            Jazz<span class="studio-brand__wordmark-accent">Chords</span>
            <VisuallyHidden
              content=" — offline jazz studio"
              focusableWhenSkippedTo={false}
            />
          </h1>
        </div>
        <span class="studio-brand__divider" aria-hidden="true" />
        <ThemeToggle />
      </div>

      {/* V2R-2: the title editing surface moved onto the paper itself —
          see ChartWorkspace's engraved head. The chrome bar keeps only the
          document-level commands. */}
      <div class="studio-header__spacer" aria-hidden="true" />

      <div class="studio-document-actions">
        {/*
          The revision counter alone: the retired "Not exported" pill named
          an export feature this build does not have, which read as jargon
          to strangers. The live-region container stays for the contract's
          shell-region inventory and for revision announcements.
        */}
        <div
          class="studio-document-status"
          id="document-status"
          aria-label="Document status"
          aria-live="polite"
          aria-atomic="true"
          role="status"
        >
          <span class="studio-document-status__revision">
            {view.revisionLabel}
          </span>
        </div>
        <div
          class="studio-history-actions"
          id="document-menu"
          role="group"
          aria-label="Document commands"
        >
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canUndo}
            id="studio-undo"
            invalid={false}
            label="Undo"
            onAction={callbacks.onUndo}
            type="button"
            variant="secondary"
          />
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canRedo}
            id="studio-redo"
            invalid={false}
            label="Redo"
            onAction={callbacks.onRedo}
            type="button"
            variant="secondary"
          />
          {/*
            Clearing is destructive but not irreversible: it is one undoable
            command, so the confirmation exists to stop an accidental click,
            not to guard something unrecoverable. It is an owned two-step
            control — never a native confirm dialog: press once to arm, again
            to clear, and the armed state announces itself politely.
          */}
          <Button
            busy={false}
            density="comfortable"
            describedBy={[]}
            disabled={!view.canClearChart}
            id="studio-clear-chart"
            invalid={false}
            label={view.clearLabel}
            onAction={callbacks.onClearChart}
            type="button"
            variant="destructive"
          />
          <span aria-live="polite">
            <VisuallyHidden
              content={
                view.clearArmed
                  ? "Press Clear again to empty the chart. Undo restores it."
                  : ""
              }
              focusableWhenSkippedTo={false}
            />
          </span>
          {/*
            Sharing is an explicit gesture that encodes the current chart
            into a local #zdoc= fragment — no request leaves the page. The
            outcome line states exactly where the link went, and it renders
            VISIBLY beside the button: a status only a screen reader could
            hear was a dead click for everyone else. The span itself stays
            the polite live region, and refusals land in the same spot.
          */}
          <Button
            busy={false}
            density="comfortable"
            describedBy={["studio-share-feedback"]}
            disabled={false}
            id="studio-copy-share-link"
            invalid={false}
            label={view.shareCopied ? "Copied ✓" : "Copy link"}
            onAction={callbacks.onCopyShareLink}
            type="button"
            variant="secondary"
          />
          <span
            aria-live="polite"
            aria-atomic="true"
            class="studio-share-feedback"
            data-feedback-kind={view.shareFeedback?.kind ?? "idle"}
            id="studio-share-feedback"
            role="status"
          >
            {view.shareFeedback?.message ?? ""}
          </span>
        </div>
      </div>
    </header>
  );
}
