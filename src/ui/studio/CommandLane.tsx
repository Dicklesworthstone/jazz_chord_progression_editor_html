import { Button } from "../primitives";
import type { StudioQuickEntryView } from "./studio-contract";

/**
 * The ⌘K command lane (jcpe-v2r-entry-5zz7): the prototype's "type the
 * changes" dialog on the real quick-entry surface. The input drives the A0
 * draft; every row below it is the bounded T0 parse verbatim — token chips
 * with their diagnostic codes, the insertion-plan status sentence, and the
 * truncation notice when the render bound drops rows. Nothing here parses
 * text itself and nothing invents a preview the engine did not produce.
 *
 * Dispatch honesty: Insert is the one commit path — the same
 * `applyQuickEntryPreview` step the Library rail's quick entry performs,
 * landing at the insertion point as one undoable step (or staging the
 * completion-reason dialog exactly like any other edit). The prototype's
 * "Replace chart" button is deliberately absent: no single replace command
 * exists, and composing Clear+Insert here would either bypass the armed
 * two-press Clear or dispatch two undoable steps behind one button. The
 * armed Clear in the chrome bar remains the destructive route.
 */
export type CommandLaneContentProps = Readonly<{
  quickEntry: StudioQuickEntryView;
  onDraftChange: (value: string) => void;
  onInsert: () => void;
  onClear: () => void;
}>;

/** Keys that genuinely work in this build; never list a dead shortcut. */
const LANE_SHORTCUTS: readonly (readonly [keys: string, does: string])[] =
  Object.freeze([
    ["space", "Play or pause"],
    ["← →", "Previous / next chord, inside the chart"],
    ["enter · F2", "Edit the focused chord"],
    ["tab", "Commit the symbol and edit the next chord"],
    ["esc", "Close an editor without committing"],
    ["⌘K", "Open or close this lane"],
    ["⌘Z · ⇧⌘Z", "Undo / redo"],
  ] as const);

export function CommandLaneContent({
  quickEntry,
  onDraftChange,
  onInsert,
  onClear,
}: CommandLaneContentProps) {
  return (
    <div class="studio-command-lane">
      <input
        aria-describedby="studio-command-lane-status"
        aria-label="Chart text"
        class="studio-command-lane__input"
        data-testid="command-lane-input"
        id="studio-command-lane-input"
        placeholder="| Dm7 G7 | Cmaj7 |"
        spellcheck={false}
        type="text"
        value={quickEntry.draftText}
        onInput={(event) => {
          onDraftChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && quickEntry.canInsert) {
            event.preventDefault();
            onInsert();
          }
        }}
      />
      <p
        aria-live="polite"
        class="studio-command-lane__status"
        id="studio-command-lane-status"
      >
        {quickEntry.statusLabel}
      </p>
      {quickEntry.refusalMessage === null ? null : (
        <p class="studio-command-lane__refusal" role="alert">
          {quickEntry.refusalMessage}
        </p>
      )}
      <div class="studio-command-lane__tokens" data-testid="command-lane-tokens">
        {quickEntry.tokens.map((token) => (
          <span
            key={token.ordinal}
            class="studio-command-lane__token"
            data-state={token.state}
          >
            <span class="studio-command-lane__token-symbol">
              {token.sourceText}
            </span>
            {token.diagnosticCode === null ? null : (
              <span class="studio-command-lane__token-code">
                {token.diagnosticCode}
              </span>
            )}
          </span>
        ))}
      </div>
      {quickEntry.truncationNotice === null ? null : (
        <p class="studio-command-lane__truncation">
          {quickEntry.truncationNotice}
        </p>
      )}
      <div class="studio-command-lane__actions">
        <Button
          busy={false}
          density="comfortable"
          describedBy={["studio-command-lane-status"]}
          disabled={!quickEntry.canInsert}
          id="studio-command-lane-insert"
          invalid={false}
          label={`Insert ${quickEntry.targetLabel}`.trimEnd()}
          onAction={onInsert}
          type="button"
          variant="primary"
        />
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={!quickEntry.canClear}
          id="studio-command-lane-clear"
          invalid={false}
          label="Clear draft"
          onAction={onClear}
          type="button"
          variant="ghost"
        />
        <span class="studio-command-lane__hint">↵ inserts · esc closes</span>
      </div>
      <dl class="studio-command-lane__shortcuts">
        {LANE_SHORTCUTS.map(([keys, does]) => (
          <div key={keys} class="studio-command-lane__shortcut">
            <dt>{keys}</dt>
            <dd>{does}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
