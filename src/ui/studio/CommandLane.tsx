import { Button } from "../primitives";
import { diagnosticProse } from "./entry-diagnostics";
import { EntryRepairControls, useEntryRepair } from "./EntryRepair";
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
  const repair = useEntryRepair(quickEntry, onDraftChange);
  const insert = (): void => { repair.finish(); onInsert(); };
  return (
    <div class="studio-command-lane">
      <textarea
        ref={repair.field}
        rows={3}
        data-ui-local-escape={repair.active || repair.composing ? "true" : undefined}
        aria-describedby="studio-command-lane-status"
        aria-label="Chart text"
        class="studio-command-lane__input"
        data-testid="command-lane-input"
        id="studio-command-lane-input"
        placeholder="| Dm7 G7 | Cmaj7 |"
        spellcheck={false}
        value={quickEntry.draftText}
        onInput={(event) => {
          repair.changeDraft(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (repair.guardKey(event)) return;
          if (event.key === "Enter" && !event.shiftKey && quickEntry.canInsert) {
            event.preventDefault();
            insert();
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
      <p class="studio-command-lane__plan">{quickEntry.insertionPlan.label}</p>
      <EntryRepairControls repair={repair} />
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
            {token.diagnosticRange === null ? (
              <span class="studio-command-lane__token-symbol">{token.sourceText}</span>
            ) : (
              <button type="button" class="studio-entry-repair__action" disabled={repair.composing}
                onClick={() => { repair.select(token); }}
                aria-label={`Repair ${token.sourceText || "text at end of draft"}: ${diagnosticProse(token.diagnosticCode ?? "")}`}>
                {token.sourceText || "End of draft"} · Repair
              </button>
            )}
            {token.durationLabel === null ? null : <span>{token.durationLabel} beats</span>}
            {token.diagnosticCode === null ? null : (
              <span><span>{diagnosticProse(token.diagnosticCode)}</span>{" "}
                <code class="studio-command-lane__token-code">{token.diagnosticCode}</code>
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
          disabled={!quickEntry.canInsert || repair.composing}
          id="studio-command-lane-insert"
          invalid={false}
          label={`Insert ${quickEntry.targetLabel}`.trimEnd()}
          onAction={insert}
          type="button"
          variant="primary"
        />
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={!quickEntry.canClear || repair.composing}
          id="studio-command-lane-clear"
          invalid={false}
          label="Clear draft"
          onAction={() => { repair.finish(); onClear(); }}
          type="button"
          variant="ghost"
        />
        <span class="studio-command-lane__hint">↵ inserts · shift+↵ adds a line · esc cancels a repair or closes</span>
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
