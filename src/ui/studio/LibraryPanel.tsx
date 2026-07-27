import { Badge, Button, Checkbox, UiIcon } from "../primitives";
import type {
  StudioQuickEntryTokenView,
  StudioQuickEntryView,
} from "./studio-contract";

const stagedLibraryAreas = [
  {
    name: "Chord palette",
    description:
      "Spelling-aware chord choices arrive after real document insertion is wired.",
  },
  {
    name: "Lessons",
    description:
      "Guided progressions remain staged until loading them is an undoable action.",
  },
] as const;

export type LibraryPanelContentProps = Readonly<{
  headingId: string;
  context: "rail" | "sheet";
  quickEntry: StudioQuickEntryView;
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
  onRecoveryAcknowledgeChange: (acknowledged: boolean) => void;
  onRecoveryDurationDraftChange: (value: string) => void;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
}>;

/**
 * Reviewed demo charts. Every entry must parse `ready` under the real T0
 * grammar — a demo that gets refused would teach a first-time user that the
 * app is broken, which is worse than no demo at all.
 */
const DEMO_PROGRESSIONS = [
  {
    id: "two-five-one",
    label: "ii–V–I",
    chartText: "| Dm7 G7 | Cmaj7 |",
  },
  {
    id: "turnaround",
    label: "Turnaround",
    chartText: "| Cmaj7 A7 | Dm7 G7 |",
  },
] as const;

const TOKEN_STATE_LABELS = {
  valid: "Parsed",
  insertable: "Recoverable",
  invalid: "Not parsed",
} as const;

/**
 * One preview row. An `insertable` row carries the only action that can commit
 * it, so the statement and the affordance are never separated: the row states
 * why it cannot be inserted and the same row's control stays disabled.
 */
function QuickEntryToken({
  token,
  acknowledged,
  onInsertRecoveredChord,
}: Readonly<{
  token: StudioQuickEntryTokenView;
  acknowledged: boolean;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
}>) {
  const globalOrdinal = token.globalOrdinal;
  const blockedReason = acknowledged
    ? token.blockedReason
    : (token.blockedReason ??
      "Accept the layout-loss statement before recovering a chord.");
  return (
    <li
      class="studio-quick-entry__token"
      data-testid="quick-entry-token"
      data-state={token.state}
      data-global-ordinal={
        globalOrdinal === null ? undefined : String(globalOrdinal)
      }
    >
      <span class="studio-quick-entry__token-state">
        {TOKEN_STATE_LABELS[token.state]}
      </span>
      <code class="studio-quick-entry__token-text">{token.sourceText}</code>
      {token.durationLabel === null ? null : (
        <span class="studio-quick-entry__token-duration">
          {token.durationLabel} beats
        </span>
      )}
      {token.requiresDuration ? (
        <span class="studio-quick-entry__token-duration">
          Needs an exact duration
        </span>
      ) : null}
      {token.diagnosticCode === null ? null : (
        <Badge label={token.diagnosticCode} tone="error" />
      )}
      {token.diagnosticRange === null ? null : (
        // The T0 range verbatim: a code without the characters it covers makes
        // the reader search a long draft for the offending token.
        <span
          class="studio-quick-entry__token-range"
          data-testid="quick-entry-token-range"
        >
          {`characters ${String(token.diagnosticRange.start)}–${String(token.diagnosticRange.end)}`}
        </span>
      )}
      {token.requiresCompletionReason ? (
        <span class="studio-quick-entry__token-note">
          Leaves the measure short; a reason is required.
        </span>
      ) : null}
      {token.state === "insertable" && globalOrdinal !== null ? (
        <>
          <Button
            busy={false}
            density="dense"
            describedBy={[]}
            disabled={blockedReason !== null}
            id={`studio-recover-chord-${String(globalOrdinal)}`}
            invalid={false}
            label="Insert this chord"
            onAction={() => {
              onInsertRecoveredChord(globalOrdinal);
            }}
            type="button"
            variant="secondary"
          />
          {blockedReason === null ? null : (
            <span class="studio-quick-entry__token-note">{blockedReason}</span>
          )}
        </>
      ) : null}
    </li>
  );
}

/**
 * A parsed draft lists one row per parsed event; a refused draft lists one row
 * per chord T0 recovered plus one row per diagnostic, and never a parsed row.
 */
function QuickEntryTokenList({
  view,
  onInsertRecoveredChord,
}: Readonly<{
  view: StudioQuickEntryView;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
}>) {
  if (view.tokens.length === 0) return null;
  return (
    <>
      <ol class="studio-quick-entry__tokens" data-testid="quick-entry-tokens">
        {view.tokens.map((token) => (
          <QuickEntryToken
            acknowledged={view.recovery.acknowledged}
            key={`${token.state}-${String(token.ordinal)}`}
            onInsertRecoveredChord={onInsertRecoveredChord}
            token={token}
          />
        ))}
      </ol>
      {view.truncationNotice === null ? null : (
        <p
          class="studio-quick-entry__truncation"
          data-testid="quick-entry-truncation"
        >
          {view.truncationNotice}
        </p>
      )}
    </>
  );
}

/** Raw chart text stays caller-owned: the field never rewrites what was typed. */
function QuickEntryPanel({
  view,
  onDraftChange,
  onInsert,
  onClear,
  onRecoveryAcknowledgeChange,
  onRecoveryDurationDraftChange,
  onInsertRecoveredChord,
}: Readonly<{
  view: StudioQuickEntryView;
  onDraftChange: (value: string) => void;
  onInsert: () => void;
  onClear: () => void;
  onRecoveryAcknowledgeChange: (acknowledged: boolean) => void;
  onRecoveryDurationDraftChange: (value: string) => void;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
}>) {
  /**
   * Alt+Enter (U1-OP-005) acts on the first row that can actually be committed.
   * When none can, it publishes nothing rather than choosing a blocked row.
   */
  const firstRecoverable =
    view.tokens.find(
      (token) =>
        token.state === "insertable" &&
        token.globalOrdinal !== null &&
        token.blockedReason === null,
    )?.globalOrdinal ?? null;
  const showRecovery =
    view.recovery.available ||
    view.tokens.some((token) => token.state === "insertable");
  /** The field appears only where T0 actually left a duration to the caller. */
  const needsCallerDuration = view.tokens.some((token) => token.requiresDuration);
  return (
    <section class="studio-quick-entry" aria-labelledby="studio-quick-entry-heading">
      <h3 id="studio-quick-entry-heading">Quick entry</h3>
      {/*
        One-click demos exist so the first minute can contain sound. Each goes
        through exactly the typed path — draft change, then insert — so a demo
        can never do anything typing the same text could not.
      */}
      <div
        class="studio-quick-entry__demos"
        role="group"
        aria-label="Demo progressions"
      >
        <span class="studio-quick-entry__demos-label">Try one:</span>
        {DEMO_PROGRESSIONS.map((demo) => (
          <Button
            busy={false}
            density="dense"
            describedBy={["studio-quick-entry-status"]}
            disabled={false}
            id={`studio-quick-entry-demo-${demo.id}`}
            invalid={false}
            key={demo.id}
            label={demo.label}
            onAction={() => {
              onDraftChange(demo.chartText);
              onInsert();
            }}
            type="button"
            variant="secondary"
          />
        ))}
      </div>
      <label class="studio-quick-entry__label" for="studio-quick-entry-field">
        Chart text
      </label>
      <p class="studio-quick-entry__hint" id="studio-quick-entry-hint">
        Bars sit between | marks; chords are symbols such as Dm7 or Cmaj7.
        Press Enter to add them to the chart.
      </p>
      <textarea
        id="studio-quick-entry-field"
        class="studio-quick-entry__field"
        data-testid="quick-entry-field"
        rows={3}
        spellcheck={false}
        value={view.draftText}
        placeholder="| Dm7 G7 | Cmaj7 |"
        aria-describedby="studio-quick-entry-status studio-quick-entry-hint"
        onInput={(event) => {
          onDraftChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.altKey) {
            event.preventDefault();
            if (firstRecoverable !== null) {
              onInsertRecoveredChord(firstRecoverable);
            }
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onInsert();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClear();
          }
        }}
      />
      <p
        id="studio-quick-entry-status"
        class="studio-quick-entry__status"
        data-testid="quick-entry-status"
        role="status"
      >
        <span>{view.statusLabel}</span>
        <span class="studio-quick-entry__target">{view.targetLabel}</span>
        <span class="studio-quick-entry__count">
          {String(view.codePointCount)} / {String(view.maxCodePoints)}
        </span>
      </p>
      <p
        class="studio-quick-entry__plan"
        data-testid="insertion-plan"
        data-statement={view.insertionPlan.statement}
        role="status"
      >
        <strong>{view.insertionPlan.label}</strong>
        {view.insertionPlan.resolutions.length === 0 ? null : (
          <span class="studio-quick-entry__plan-resolutions">
            {view.insertionPlan.resolutions.join(" · ")}
          </span>
        )}
      </p>
      {view.issueCodes.length === 0 ? null : (
        <ul class="studio-quick-entry__issues" data-testid="quick-entry-issues">
          {view.issueCodes.map((code) => (
            <li key={code}>
              <Badge label={code} tone="warning" />
            </li>
          ))}
        </ul>
      )}
      <QuickEntryTokenList
        onInsertRecoveredChord={onInsertRecoveredChord}
        view={view}
      />
      {showRecovery ? (
        <section
          class="studio-quick-entry__recovery"
          data-testid="quick-entry-recovery"
          data-available={view.recovery.available ? "true" : "false"}
          aria-labelledby="studio-quick-entry-recovery-heading"
        >
          <h4 id="studio-quick-entry-recovery-heading">Recover one chord</h4>
          <p class="studio-quick-entry__recovery-target">
            {view.recovery.measureLabel === null
              ? "No destination measure"
              : `Into ${view.recovery.measureLabel}`}
            {view.recovery.remainderLabel === null
              ? ""
              : ` · ${view.recovery.remainderLabel} beats free`}
          </p>
          <Checkbox
            busy={false}
            checked={view.recovery.acknowledged}
            density="comfortable"
            describedBy={[]}
            disabled={false}
            id="studio-quick-entry-acknowledge"
            invalid={false}
            label={`I accept that ${view.recovery.acknowledgementLabel}`}
            onCheckedChange={(event) => {
              onRecoveryAcknowledgeChange(event.value);
            }}
          />
          {needsCallerDuration ? (
            <>
              <label
                class="studio-quick-entry__label"
                for="studio-quick-entry-recovery-duration"
              >
                Exact beats for a chord T0 could not measure
              </label>
              <input
                id="studio-quick-entry-recovery-duration"
                class="studio-quick-entry__field"
                data-testid="recovery-duration-field"
                type="text"
                inputMode="text"
                spellcheck={false}
                value={view.recovery.durationDraft}
                onInput={(event) => {
                  onRecoveryDurationDraftChange(event.currentTarget.value);
                }}
              />
            </>
          ) : null}
          {view.recovery.unavailableReason === null ? null : (
            <p
              class="studio-quick-entry__recovery-blocked"
              data-testid="recovery-unavailable"
              role="status"
            >
              {view.recovery.unavailableReason}
            </p>
          )}
        </section>
      ) : null}
      {view.refusalMessage === null ? null : (
        <p class="studio-quick-entry__refusal" data-testid="quick-entry-refusal">
          {view.refusalMessage}
        </p>
      )}
      <div class="studio-quick-entry__actions">
        <Button
          busy={false}
          density="comfortable"
          describedBy={["studio-quick-entry-status"]}
          disabled={!view.canInsert}
          id="studio-quick-entry-insert"
          invalid={false}
          label="Insert chart text"
          onAction={onInsert}
          type="button"
          variant="primary"
        />
        <Button
          busy={false}
          density="comfortable"
          describedBy={[]}
          disabled={!view.canClear}
          id="studio-quick-entry-clear"
          invalid={false}
          label="Clear"
          onAction={onClear}
          type="button"
          variant="secondary"
        />
      </div>
    </section>
  );
}

export function LibraryPanelContent({
  headingId,
  context,
  quickEntry,
  onQuickEntryDraftChange,
  onQuickEntryInsert,
  onQuickEntryClear,
  onRecoveryAcknowledgeChange,
  onRecoveryDurationDraftChange,
  onInsertRecoveredChord,
}: LibraryPanelContentProps) {
  return (
    <section
      class="studio-panel-content studio-library-content"
      data-panel-context={context}
      aria-labelledby={headingId}
    >
      {context === "rail" ? (
        <header class="studio-panel-heading">
          <div>
            <p class="studio-kicker">Write and discover</p>
            <h2 id={headingId}>Library</h2>
          </div>
        </header>
      ) : (
        <p class="studio-kicker">Write and discover</p>
      )}

      <QuickEntryPanel
        onClear={onQuickEntryClear}
        onDraftChange={onQuickEntryDraftChange}
        onInsert={onQuickEntryInsert}
        onInsertRecoveredChord={onInsertRecoveredChord}
        onRecoveryAcknowledgeChange={onRecoveryAcknowledgeChange}
        onRecoveryDurationDraftChange={onRecoveryDurationDraftChange}
        view={quickEntry}
      />

      <p class="studio-panel-intro">
        The remaining entry tools appear here only when they can create real,
        validated chart changes.
      </p>

      <ul class="studio-staged-list" aria-label="Library roadmap">
        {stagedLibraryAreas.map((area) => (
          <li key={area.name}>
            <div class="studio-staged-list__heading">
              <h3>{area.name}</h3>
              <Badge label="Staged" tone="neutral" />
            </div>
            <p>{area.description}</p>
          </li>
        ))}
      </ul>

      <p class="studio-truth-note">
        No example chords are inserted into this new document.
      </p>
    </section>
  );
}

export type LibraryPanelProps = Readonly<{
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  quickEntry: StudioQuickEntryView;
  onQuickEntryDraftChange: (value: string) => void;
  onQuickEntryInsert: () => void;
  onQuickEntryClear: () => void;
  onRecoveryAcknowledgeChange: (acknowledged: boolean) => void;
  onRecoveryDurationDraftChange: (value: string) => void;
  onInsertRecoveredChord: (globalOrdinal: number) => void;
}>;

export function LibraryPanel({
  collapsed,
  onCollapsedChange,
  quickEntry,
  onQuickEntryDraftChange,
  onQuickEntryInsert,
  onQuickEntryClear,
  onRecoveryAcknowledgeChange,
  onRecoveryDurationDraftChange,
  onInsertRecoveredChord,
}: LibraryPanelProps) {
  const headingId = "studio-library-heading";

  return (
    <aside
      class="studio-rail studio-rail--library"
      id="library-rail"
      data-collapsed={collapsed ? "true" : "false"}
      aria-labelledby={headingId}
    >
      <div
        class="studio-rail__contents"
        data-collapsed={collapsed ? "true" : "false"}
      >
        {collapsed ? (
          <h2 id={headingId} class="studio-visually-hidden">
            Library
          </h2>
        ) : (
          <LibraryPanelContent
            context="rail"
            headingId={headingId}
            onInsertRecoveredChord={onInsertRecoveredChord}
            onQuickEntryClear={onQuickEntryClear}
            onQuickEntryDraftChange={onQuickEntryDraftChange}
            onQuickEntryInsert={onQuickEntryInsert}
            onRecoveryAcknowledgeChange={onRecoveryAcknowledgeChange}
            onRecoveryDurationDraftChange={onRecoveryDurationDraftChange}
            quickEntry={quickEntry}
          />
        )}
        <button
          aria-expanded={collapsed ? "false" : "true"}
          aria-label={collapsed ? "Expand Library" : "Collapse Library"}
          class="studio-icon-button studio-rail__collapse-button"
          id="studio-library-rail-toggle"
          key="studio-library-rail-toggle"
          onClick={() => {
            onCollapsedChange(!collapsed);
          }}
          type="button"
        >
          <UiIcon iconId={collapsed ? "chevron-right" : "chevron-left"} />
        </button>
        {collapsed ? (
          <span class="studio-rail__vertical-label" aria-hidden="true">
            Library
          </span>
        ) : null}
      </div>
    </aside>
  );
}
